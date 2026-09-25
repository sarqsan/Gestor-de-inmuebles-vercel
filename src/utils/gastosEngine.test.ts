/**
 * GAP-R4 — Suite propia del motor de gastos (`gastosEngine.ts`).
 *
 * Cubre: catálogo de categorías (explotación/financiación), creación y normalización de
 * gastos, agregados (resumen explotación/financiación/caja), plantillas recurrentes
 * (periodos debidos, backfill de 12 meses, idempotencia de ids) y el puente Orden de
 * Trabajo → gasto (elegibilidad, idempotencia, sincronización).
 *
 * El flujo completo Incidencia → OT → Gasto → Fiscal ya está cubierto en
 * `incidenciaCircuitoOperativoEconomico.test.ts`; aquí solo se prueban los límites y
 * errores del motor que allí no se tocan. Sin UI, sin Firebase, sin red.
 *
 * Reloj congelado en 2026-09-21 12:00 local para `periodoActual()`, `crearGasto` y los ids.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Gasto, GastoRecurrente, Inmueble, TrabajoProfesional } from '../types';
import {
  CATEGORIAS_GASTO,
  ESTADO_GASTO_LABEL,
  FRECUENCIA_LABEL,
  FRECUENCIA_PASO_MESES,
  MAX_MESES_BACKFILL,
  TIPO_GASTO_LABEL,
  buscarGastoDeTrabajo,
  calcularTotalGastos,
  calcularTotalesGastos,
  calcularTotalesPorCategoria,
  categoriaDef,
  crearGasto,
  crearGastoRecurrente,
  etiquetaMesAnio,
  filtrarGastosPorInmueble,
  generarGastoDesdeTrabajo,
  generarGastosRecurrentes,
  materializarGastoRecurrente,
  normalizarGasto,
  normalizarRecurrente,
  nuevoGastoId,
  nuevoRecurrenteId,
  periodoActual,
  periodoDesdeFecha,
  periodosDebidos,
  proximoPeriodoRecurrente,
  puedeGenerarGastoDesdeTrabajo,
  recurrenteGastoId,
  resumenGastos,
  resumenPorInmueble,
  sincronizarGastoDesdeTrabajo,
  sumarMeses,
  tipoDeCategoria,
} from './gastosEngine';

// ---------------------------------------------------------------------------
// Fixtures mínimos
// ---------------------------------------------------------------------------

const HOY = new Date(2026, 8, 21, 12, 0, 0);
const HOY_ISO = () => HOY.toISOString();

const gasto = (p: Partial<Gasto> = {}): Gasto =>
  ({
    id: 'g1',
    inmuebleId: 'inm1',
    propietarioId: 'prop1',
    tipo: 'EXPLOTACION',
    categoria: 'COMUNIDAD',
    concepto: 'Comunidad',
    importe: 100,
    estado: 'PAGADO',
    fechaDevengo: '2026-03-10',
    fechaPago: '2026-03-10',
    periodoMesAnio: '2026-03',
    aCargoDe: 'arrendador',
    deducible: true,
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
    ...p,
  }) as Gasto;

const recurrente = (p: Partial<GastoRecurrente> = {}): GastoRecurrente =>
  ({
    id: 'rec1',
    inmuebleId: 'inm1',
    propietarioId: 'prop1',
    tipo: 'EXPLOTACION',
    categoria: 'COMUNIDAD',
    concepto: 'Comunidad',
    importe: 60,
    frecuencia: 'MENSUAL',
    diaVencimiento: 5,
    fechaInicio: '2026-06',
    aCargoDe: 'arrendador',
    deducible: true,
    metodoPago: 'domiciliacion',
    activo: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...p,
  }) as GastoRecurrente;

const inmueble = (p: Partial<Inmueble> = {}): Inmueble =>
  ({ id: 'inm1', direccion: 'Calle Mayor 1', ciudad: 'Madrid', propietarioId: 'prop1', ...p }) as Inmueble;

const trabajo = (p: Partial<TrabajoProfesional> = {}): TrabajoProfesional =>
  ({
    id: 'ot1',
    propietarioId: 'prop1',
    inmuebleId: 'inm1',
    incidenciaId: 'inc1',
    profesionalId: 'prof1',
    profesionalNombre: 'Fontanería Pérez',
    titulo: 'Fuga en cocina',
    descripcion: 'Reparar fuga',
    categoria: 'FONTANERIA',
    tipoTrabajo: 'REPARACION_INCIDENCIA',
    estado: 'FINALIZADO',
    fechaFinalizacion: '2026-08-20T10:00:00.000Z',
    importeFinal: 195.5,
    creadoPor: 'Admin',
    actualizadoPor: 'Prof',
    ...p,
  }) as TrabajoProfesional;

const snapshot = (v: unknown) => JSON.stringify(v);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HOY);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Catálogo y helpers
// ---------------------------------------------------------------------------

describe('gastosEngine · catálogo de categorías', () => {
  it('12 categorías sin duplicados: 9 de explotación y 3 de financiación', () => {
    expect(CATEGORIAS_GASTO).toHaveLength(12);
    expect(new Set(CATEGORIAS_GASTO.map((c) => c.value)).size).toBe(12);
    expect(CATEGORIAS_GASTO.filter((c) => c.tipo === 'EXPLOTACION')).toHaveLength(9);
    expect(CATEGORIAS_GASTO.filter((c) => c.tipo === 'FINANCIACION').map((c) => c.value)).toEqual([
      'CUOTA_HIPOTECARIA',
      'INTERESES_PRESTAMO',
      'OTRO_FINANCIACION',
    ]);
  });

  it('invariante: toda categoría de financiación es NO deducible por defecto; las de explotación sí', () => {
    for (const c of CATEGORIAS_GASTO) {
      expect(c.deduciblePorDefecto, c.value).toBe(c.tipo === 'EXPLOTACION');
    }
  });

  it('SUMINISTROS es la única categoría a cargo del arrendatario por defecto', () => {
    expect(CATEGORIAS_GASTO.filter((c) => c.aCargoDePorDefecto === 'arrendatario').map((c) => c.value)).toEqual(['SUMINISTROS']);
  });

  it('categoriaDef devuelve la definición del catálogo y un fallback seguro para categorías fuera de él', () => {
    expect(categoriaDef('IBI')).toMatchObject({ value: 'IBI', tipo: 'EXPLOTACION', deduciblePorDefecto: true });
    expect(categoriaDef('SEGUROS')).toEqual({
      value: 'SEGUROS',
      label: 'SEGUROS',
      tipo: 'EXPLOTACION',
      descripcion: '',
      deduciblePorDefecto: true,
      aCargoDePorDefecto: 'arrendador',
    });
    expect(tipoDeCategoria('CUOTA_HIPOTECARIA')).toBe('FINANCIACION');
    expect(tipoDeCategoria('LIMPIEZA')).toBe('EXPLOTACION');
    expect(tipoDeCategoria('OTRO')).toBe('EXPLOTACION'); // fallback
  });

  it('etiquetas: tipos, estados y frecuencias completas', () => {
    expect(Object.keys(TIPO_GASTO_LABEL)).toEqual(['EXPLOTACION', 'FINANCIACION']);
    expect(Object.keys(ESTADO_GASTO_LABEL).sort()).toEqual(['ANULADO', 'EN_REVISION', 'PAGADO', 'PENDIENTE']);
    expect(FRECUENCIA_LABEL).toEqual({ MENSUAL: 'Mensual', TRIMESTRAL: 'Trimestral', ANUAL: 'Anual' });
    expect(FRECUENCIA_PASO_MESES).toEqual({ MENSUAL: 1, TRIMESTRAL: 3, ANUAL: 12 });
    expect(MAX_MESES_BACKFILL).toBe(12);
  });

  it('etiquetaMesAnio: "marzo de 2026"; vacío → "Sin período"; malformado → se devuelve tal cual', () => {
    expect(etiquetaMesAnio('2026-03')).toBe('marzo de 2026');
    expect(etiquetaMesAnio(undefined)).toBe('Sin período');
    expect(etiquetaMesAnio('')).toBe('Sin período');
    expect(etiquetaMesAnio('abc')).toBe('abc');
    expect(etiquetaMesAnio('2026-00')).toBe('2026-00');
  });

  it('periodoDesdeFecha: YYYY-MM-DD y ISO completo → YYYY-MM; inválida/vacía → undefined', () => {
    expect(periodoDesdeFecha('2026-03-10')).toBe('2026-03');
    expect(periodoDesdeFecha('2026-12-31')).toBe('2026-12');
    expect(periodoDesdeFecha('2026-03-10T23:30:00')).toBe('2026-03');
    expect(periodoDesdeFecha('')).toBeUndefined();
    expect(periodoDesdeFecha(undefined)).toBeUndefined();
    expect(periodoDesdeFecha('no-fecha')).toBeUndefined();
  });

  it('periodoActual y sumarMeses: cruce de año hacia delante y hacia atrás', () => {
    expect(periodoActual()).toBe('2026-09');
    expect(periodoActual(new Date(2024, 0, 15))).toBe('2024-01');
    expect(sumarMeses('2026-11', 3)).toBe('2027-02');
    expect(sumarMeses('2026-01', -1)).toBe('2025-12');
    expect(sumarMeses('2026-09', -11)).toBe('2025-10');
    expect(sumarMeses('2026-09', 0)).toBe('2026-09');
  });

  it('ids: prefijos y saneado del inmuebleId; recurrenteGastoId es determinista', () => {
    expect(nuevoGastoId('inm/1 x')).toMatch(/^gas_inm_1_x_\d+_[a-z0-9]{1,4}$/);
    expect(nuevoGastoId('')).toMatch(/^gas_inm_/);
    expect(nuevoRecurrenteId('r-1')).toMatch(/^rec_r-1_\d+_/);
    expect(recurrenteGastoId('rec-1', 2026, 3)).toBe('grec_rec_1_2026_03');
    expect(recurrenteGastoId('rec-1', 2026, 3)).toBe(recurrenteGastoId('rec-1', 2026, 3));
    expect(recurrenteGastoId('rec-1', 2026, 12)).toBe('grec_rec_1_2026_12');
  });
});

// ---------------------------------------------------------------------------
// Creación y normalización
// ---------------------------------------------------------------------------

describe('gastosEngine · crearGasto / normalizarGasto', () => {
  it('crearGasto aplica los valores por defecto de la categoría y deja el gasto PENDIENTE', () => {
    const g = crearGasto({ inmuebleId: 'inm1', propietarioId: 'prop1', categoria: 'SUMINISTROS', importe: 45.9, fechaDevengo: '2026-03-10' });
    expect(g).toMatchObject({
      inmuebleId: 'inm1',
      propietarioId: 'prop1',
      tipo: 'EXPLOTACION',
      categoria: 'SUMINISTROS',
      concepto: 'Suministros',
      importe: 45.9,
      estado: 'PENDIENTE',
      fechaDevengo: '2026-03-10',
      periodoMesAnio: '2026-03',
      aCargoDe: 'arrendatario',
      deducible: true,
      metodoPago: 'transferencia',
      notas: '',
      createdAt: HOY_ISO(),
      updatedAt: HOY_ISO(),
    });
    expect(g.fechaPago).toBeUndefined();
    expect(g.id).toMatch(/^gas_inm1_/);
  });

  it('crearGasto: sin fecha usa hoy; concepto en blanco cae al label; importe ausente/no numérico → 0', () => {
    const g = crearGasto({ inmuebleId: 'inm1', propietarioId: 'prop1', categoria: 'IBI', concepto: '   ' });
    expect(g.fechaDevengo).toBe(HOY_ISO().split('T')[0]);
    expect(g.periodoMesAnio).toBe(HOY_ISO().slice(0, 7));
    expect(g.concepto).toBe('IBI');
    expect(g.importe).toBe(0);
    expect(crearGasto({ inmuebleId: 'inm1', propietarioId: 'prop1', categoria: 'IBI', importe: '12' as unknown as number }).importe).toBe(0);
  });

  it('crearGasto de financiación: tipo FINANCIACION, no deducible, desglose vacío', () => {
    const g = crearGasto({ inmuebleId: 'inm1', propietarioId: 'prop1', categoria: 'CUOTA_HIPOTECARIA', importe: 650 });
    expect(g.tipo).toBe('FINANCIACION');
    expect(g.deducible).toBe(false);
    expect(g.capitalAmortizado).toBeUndefined();
    expect(g.intereses).toBeUndefined();
  });

  it('normalizarGasto corrige el tipo según la categoría y completa el periodo desde fechaDevengo', () => {
    const n = normalizarGasto(gasto({ categoria: 'INTERESES_PRESTAMO', tipo: 'EXPLOTACION', periodoMesAnio: undefined, fechaDevengo: '2026-04-02' }));
    expect(n.tipo).toBe('FINANCIACION');
    expect(n.periodoMesAnio).toBe('2026-04');
    expect(n.updatedAt).toBe(HOY_ISO());
    const explot = normalizarGasto(gasto({ categoria: 'LIMPIEZA', tipo: 'FINANCIACION', concepto: '  ' }));
    expect(explot.tipo).toBe('EXPLOTACION');
    expect(explot.concepto).toBe('Limpieza');
  });

  it('coherencia estado ↔ fechaPago: PAGADO sin fecha → devengo (o hoy); PENDIENTE/ANULADO limpian la fecha', () => {
    expect(normalizarGasto(gasto({ estado: 'PAGADO', fechaPago: undefined, fechaDevengo: '2026-03-10' })).fechaPago).toBe('2026-03-10');
    expect(normalizarGasto(gasto({ estado: 'PAGADO', fechaPago: undefined, fechaDevengo: undefined, periodoMesAnio: '2026-03' })).fechaPago).toBe(HOY_ISO().split('T')[0]);
    expect(normalizarGasto(gasto({ estado: 'PAGADO', fechaPago: '2026-03-12' })).fechaPago).toBe('2026-03-12');
    expect(normalizarGasto(gasto({ estado: 'PENDIENTE', fechaPago: '2026-03-12' })).fechaPago).toBeUndefined();
    expect(normalizarGasto(gasto({ estado: 'ANULADO', fechaPago: '2026-03-12' })).fechaPago).toBeUndefined();
    expect(normalizarGasto(gasto({ estado: 'EN_REVISION', fechaPago: '2026-03-12' })).fechaPago).toBe('2026-03-12');
  });

  it('el desglose capital/intereses solo sobrevive en FINANCIACION', () => {
    const fin = normalizarGasto(gasto({ categoria: 'CUOTA_HIPOTECARIA', capitalAmortizado: 400, intereses: 250, importe: 650 }));
    expect(fin.capitalAmortizado).toBe(400);
    expect(fin.intereses).toBe(250);
    const exp = normalizarGasto(gasto({ categoria: 'COMUNIDAD', capitalAmortizado: 400, intereses: 250 }));
    expect(exp.capitalAmortizado).toBeUndefined();
    expect(exp.intereses).toBeUndefined();
  });

  it('normalizarGasto no altera el flag `deducible` elegido por el usuario ni el importe', () => {
    const n = normalizarGasto(gasto({ categoria: 'COMUNIDAD', deducible: false, importe: 99.99 }));
    expect(n.deducible).toBe(false);
    expect(n.importe).toBe(99.99);
  });

  it('sin efectos laterales: normalizarGasto devuelve un objeto nuevo y no muta la entrada', () => {
    const g = gasto({ categoria: 'CUOTA_HIPOTECARIA', tipo: 'EXPLOTACION' });
    const antes = snapshot(g);
    const n = normalizarGasto(g);
    expect(n).not.toBe(g);
    expect(snapshot(g)).toBe(antes);
  });
});

// ---------------------------------------------------------------------------
// Agregados
// ---------------------------------------------------------------------------

describe('gastosEngine · agregados', () => {
  const muestra = () => [
    gasto({ id: 'a', categoria: 'COMUNIDAD', importe: 100, estado: 'PAGADO' }),
    gasto({ id: 'b', categoria: 'COMUNIDAD', importe: 50, estado: 'PENDIENTE', fechaPago: undefined }),
    gasto({ id: 'c', categoria: 'IBI', importe: 300, estado: 'PAGADO' }),
    gasto({ id: 'd', categoria: 'CUOTA_HIPOTECARIA', tipo: 'FINANCIACION', importe: 650, estado: 'PAGADO', capitalAmortizado: 400, intereses: 250, deducible: false }),
    gasto({ id: 'e', categoria: 'CUOTA_HIPOTECARIA', tipo: 'FINANCIACION', importe: 650, estado: 'PAGADO', intereses: 200, deducible: false }), // sin capital informado
    gasto({ id: 'f', categoria: 'INTERESES_PRESTAMO', tipo: 'FINANCIACION', importe: 80, estado: 'PENDIENTE', fechaPago: undefined, deducible: false }),
    gasto({ id: 'z', categoria: 'COMUNIDAD', importe: 9999, estado: 'ANULADO' }),
  ];

  it('calcularTotalGastos y calcularTotalesPorCategoria excluyen ANULADOS e incluyen pendientes', () => {
    expect(calcularTotalGastos(muestra())).toBe(1830);
    expect(calcularTotalesPorCategoria(muestra())).toEqual({ COMUNIDAD: 150, IBI: 300, CUOTA_HIPOTECARIA: 1300, INTERESES_PRESTAMO: 80 });
    expect(calcularTotalGastos([])).toBe(0);
    expect(calcularTotalesPorCategoria([])).toEqual({});
  });

  it('resumenGastos separa explotación, financiación (con capital/intereses), pendiente y caja', () => {
    const r = resumenGastos(muestra());
    expect(r).toEqual({
      numero: 6,
      explotacionPagado: 400,
      financiacionPagado: 1300,
      interesesPagado: 450,
      capitalAmortizado: 400 + 450, // 400 informado + (650 − 200) inferido
      pendiente: 130,
      salidaCajaPagada: 1700,
    });
  });

  it('invariantes del resumen: caja = explotación + financiación; capital+intereses = financiación cuando el desglose es coherente', () => {
    const r = resumenGastos(muestra().filter((g) => g.id !== 'd'));
    expect(r.salidaCajaPagada).toBe(r.explotacionPagado + r.financiacionPagado);
    expect(r.capitalAmortizado + r.interesesPagado).toBe(r.financiacionPagado);
  });

  it('resumenGastos: cuota con intereses mayores que la cuota no produce capital negativo; importes no numéricos → 0', () => {
    const r = resumenGastos([gasto({ categoria: 'CUOTA_HIPOTECARIA', tipo: 'FINANCIACION', importe: 100, intereses: 150 })]);
    expect(r.capitalAmortizado).toBe(0);
    expect(r.interesesPagado).toBe(150);
    const s = resumenGastos([gasto({ importe: 'abc' as unknown as number })]);
    expect(s.explotacionPagado).toBe(0);
    expect(s.numero).toBe(1);
  });

  it('resumenGastos de lista vacía → todo a cero', () => {
    expect(resumenGastos([])).toEqual({ numero: 0, explotacionPagado: 0, financiacionPagado: 0, interesesPagado: 0, capitalAmortizado: 0, pendiente: 0, salidaCajaPagada: 0 });
  });

  it('resumenPorInmueble agrupa y ordena por salida de caja descendente', () => {
    const r = resumenPorInmueble([
      gasto({ id: 'a', inmuebleId: 'A', importe: 10 }),
      gasto({ id: 'b', inmuebleId: 'B', importe: 500 }),
      gasto({ id: 'c', inmuebleId: 'A', importe: 20 }),
    ]);
    expect(r.map((x) => x.inmuebleId)).toEqual(['B', 'A']);
    expect(r[1].resumen.salidaCajaPagada).toBe(30);
    expect(r[1].resumen.numero).toBe(2);
    expect(resumenPorInmueble([])).toEqual([]);
  });

  it('filtrarGastosPorInmueble y calcularTotalesGastos (deducible por flag, pagado por estado, por categoría; no excluye anulados)', () => {
    const lista = [...muestra(), gasto({ id: 'x', inmuebleId: 'otro', importe: 1 })];
    expect(filtrarGastosPorInmueble(lista, 'otro').map((g) => g.id)).toEqual(['x']);
    expect(filtrarGastosPorInmueble(lista, 'nadie')).toEqual([]);
    const t = calcularTotalesGastos(muestra());
    expect(t.totalDeducible).toBe(100 + 50 + 300 + 9999);
    expect(t.totalPagado).toBe(1700);
    expect(t.porCategoria.COMUNIDAD).toBe(10149);
  });

  it('determinismo y ausencia de mutación en los agregados', () => {
    const lista = muestra();
    const antes = snapshot(lista);
    expect(resumenGastos(lista)).toEqual(resumenGastos(lista));
    expect(calcularTotalesPorCategoria(lista)).toEqual(calcularTotalesPorCategoria(lista));
    expect(snapshot(lista)).toBe(antes);
  });
});

// ---------------------------------------------------------------------------
// Recurrentes
// ---------------------------------------------------------------------------

describe('gastosEngine · gastos recurrentes', () => {
  it('crearGastoRecurrente: defaults (mensual, día 1, inicio = periodo actual, domiciliación, activo, deducible por categoría)', () => {
    const r = crearGastoRecurrente({ inmuebleId: 'inm1', propietarioId: 'prop1', categoria: 'COMUNIDAD', importe: 60 });
    expect(r).toMatchObject({
      tipo: 'EXPLOTACION',
      concepto: 'Comunidad de propietarios',
      importe: 60,
      frecuencia: 'MENSUAL',
      diaVencimiento: 1,
      fechaInicio: '2026-09',
      fechaFin: undefined,
      aCargoDe: 'arrendador',
      deducible: true,
      metodoPago: 'domiciliacion',
      notas: undefined,
      activo: true,
      ultimoPeriodoGenerado: undefined,
    });
    expect(r.id).toMatch(/^rec_inm1_/);
    const fin = crearGastoRecurrente({ inmuebleId: 'inm1', propietarioId: 'prop1', categoria: 'CUOTA_HIPOTECARIA', deducible: true, frecuencia: 'ANUAL', diaVencimiento: 15, notas: '  nota  ' });
    expect(fin.tipo).toBe('FINANCIACION');
    expect(fin.deducible).toBe(true); // crear respeta el valor explícito; normalizar lo corrige
    expect(fin.frecuencia).toBe('ANUAL');
    expect(fin.diaVencimiento).toBe(15);
    expect(fin.notas).toBe('nota');
    expect(fin.importe).toBe(0);
  });

  it('normalizarRecurrente: acota diaVencimiento a [1,28], fuerza deducible=false en financiación e importe numérico', () => {
    expect(normalizarRecurrente(recurrente({ diaVencimiento: 31 })).diaVencimiento).toBe(28);
    expect(normalizarRecurrente(recurrente({ diaVencimiento: 0 })).diaVencimiento).toBe(1);
    expect(normalizarRecurrente(recurrente({ diaVencimiento: -4 })).diaVencimiento).toBe(1);
    expect(normalizarRecurrente(recurrente({ diaVencimiento: 'x' as unknown as number })).diaVencimiento).toBe(1);
    const fin = normalizarRecurrente(recurrente({ categoria: 'CUOTA_HIPOTECARIA', tipo: 'EXPLOTACION', deducible: true, importe: '650' as unknown as number }));
    expect(fin.tipo).toBe('FINANCIACION');
    expect(fin.deducible).toBe(false);
    expect(fin.importe).toBe(650);
    expect(normalizarRecurrente(recurrente({ importe: NaN })).importe).toBe(0);
    expect(normalizarRecurrente(recurrente({ concepto: '' })).concepto).toBe('Comunidad de propietarios');
  });

  it('periodosDebidos mensual: desde fechaInicio hasta el mes en curso inclusive', () => {
    expect(periodosDebidos(recurrente({ fechaInicio: '2026-06' }))).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
  });

  it('periodosDebidos: backfill limitado a 12 meses (ventana inclusiva del mes en curso)', () => {
    const r = periodosDebidos(recurrente({ fechaInicio: '2020-01' }));
    expect(r).toHaveLength(12);
    expect(r[0]).toBe('2025-10');
    expect(r[11]).toBe('2026-09');
  });

  it('periodosDebidos respeta frecuencia (trimestral/anual), fechaFin y el cursor ultimoPeriodoGenerado', () => {
    expect(periodosDebidos(recurrente({ fechaInicio: '2026-01', frecuencia: 'TRIMESTRAL' }))).toEqual(['2026-01', '2026-04', '2026-07']);
    expect(periodosDebidos(recurrente({ fechaInicio: '2025-09', frecuencia: 'ANUAL' }))).toEqual(['2025-10', '2026-09'].slice(1)); // 2025-09 cae fuera de la ventana de 12 meses
    expect(periodosDebidos(recurrente({ fechaInicio: '2026-06', fechaFin: '2026-07' }))).toEqual(['2026-06', '2026-07']);
    expect(periodosDebidos(recurrente({ fechaInicio: '2026-06', ultimoPeriodoGenerado: '2026-08' }))).toEqual(['2026-09']);
    expect(periodosDebidos(recurrente({ fechaInicio: '2026-06', ultimoPeriodoGenerado: '2026-09' }))).toEqual([]);
  });

  it('periodosDebidos: inicio futuro → nada; `hasta` explícito controla el corte', () => {
    expect(periodosDebidos(recurrente({ fechaInicio: '2026-10' }))).toEqual([]);
    expect(periodosDebidos(recurrente({ fechaInicio: '2026-06' }), '2026-07')).toEqual(['2026-06', '2026-07']);
  });

  it('materializarGastoRecurrente: id determinista, PENDIENTE, devengo en el día de vencimiento (máx. 28), concepto con etiqueta', () => {
    const g = materializarGastoRecurrente(recurrente({ diaVencimiento: 31 }), '2026-02');
    expect(g).toMatchObject({
      id: 'grec_rec1_2026_02',
      inmuebleId: 'inm1',
      propietarioId: 'prop1',
      tipo: 'EXPLOTACION',
      categoria: 'COMUNIDAD',
      concepto: 'Comunidad · febrero de 2026',
      importe: 60,
      estado: 'PENDIENTE',
      fechaDevengo: '2026-02-28',
      periodoMesAnio: '2026-02',
      aCargoDe: 'arrendador',
      deducible: true,
      metodoPago: 'domiciliacion',
      creadoPor: 'Sistema',
      creadoPorId: 'rec1',
      createdAt: HOY_ISO(),
    });
    expect(g.fechaPago).toBeUndefined();
    const fin = materializarGastoRecurrente(recurrente({ categoria: 'CUOTA_HIPOTECARIA', deducible: true, importe: 650 }), '2026-09');
    expect(fin.tipo).toBe('FINANCIACION');
    expect(fin.deducible).toBe(false);
  });

  it('generarGastosRecurrentes: genera los pendientes de las plantillas activas y avanza el cursor', () => {
    const r = generarGastosRecurrentes([recurrente()], [], HOY);
    expect(r.gastos.map((g) => g.id)).toEqual(['grec_rec1_2026_06', 'grec_rec1_2026_07', 'grec_rec1_2026_08', 'grec_rec1_2026_09']);
    expect(r.plantillasActualizadas).toHaveLength(1);
    expect(r.plantillasActualizadas[0].ultimoPeriodoGenerado).toBe('2026-09');
    expect(r.plantillasActualizadas[0].updatedAt).toBe(HOY_ISO());
  });

  it('generarGastosRecurrentes es idempotente: los ya existentes no se regeneran y no se toca la plantilla si no hay nada nuevo', () => {
    const primera = generarGastosRecurrentes([recurrente()], [], HOY);
    const segunda = generarGastosRecurrentes(primera.plantillasActualizadas, primera.gastos, HOY);
    expect(segunda.gastos).toEqual([]);
    expect(segunda.plantillasActualizadas).toEqual([]);
    // Sin cursor pero con gastos ya existentes: se detecta por id determinista
    const tercera = generarGastosRecurrentes([recurrente()], primera.gastos.slice(0, 3), HOY);
    expect(tercera.gastos.map((g) => g.id)).toEqual(['grec_rec1_2026_09']);
  });

  it('generarGastosRecurrentes ignora plantillas inactivas y no muta entradas', () => {
    const plantillas = [recurrente({ activo: false }), recurrente({ id: 'rec2', fechaInicio: '2026-09' })];
    const antes = snapshot(plantillas);
    const r = generarGastosRecurrentes(plantillas, [], HOY);
    expect(r.gastos.map((g) => g.id)).toEqual(['grec_rec2_2026_09']);
    expect(snapshot(plantillas)).toBe(antes);
  });

  it('generarGastosRecurrentes: dos plantillas distintas nunca colisionan en id y el mes se controla con `ref`', () => {
    const r = generarGastosRecurrentes([recurrente({ id: 'a', fechaInicio: '2026-08' }), recurrente({ id: 'b', fechaInicio: '2026-08' })], [], new Date(2026, 7, 10));
    expect(r.gastos.map((g) => g.id).sort()).toEqual(['grec_a_2026_08', 'grec_b_2026_08']);
  });

  it('proximoPeriodoRecurrente: si debe algo devuelve el primer debido; si no, la siguiente ocurrencia futura', () => {
    expect(proximoPeriodoRecurrente(recurrente({ fechaInicio: '2026-06' }))).toBe('2026-06');
    expect(proximoPeriodoRecurrente(recurrente({ fechaInicio: '2026-06', ultimoPeriodoGenerado: '2026-09' }))).toBe('2026-10');
    expect(proximoPeriodoRecurrente(recurrente({ fechaInicio: '2026-01', frecuencia: 'TRIMESTRAL', ultimoPeriodoGenerado: '2026-07' }))).toBe('2026-10');
    expect(proximoPeriodoRecurrente(recurrente({ fechaInicio: '2026-12' }))).toBe('2026-12');
    expect(proximoPeriodoRecurrente(recurrente({ fechaInicio: '2025-09', frecuencia: 'ANUAL', ultimoPeriodoGenerado: '2026-09' }))).toBe('2027-09');
  });
});

// ---------------------------------------------------------------------------
// Puente Orden de Trabajo → gasto
// ---------------------------------------------------------------------------

describe('gastosEngine · puente OT → gasto', () => {
  it('puedeGenerarGastoDesdeTrabajo: OT nula, no finalizada, sin coste, coste 0/negativo/NaN, sin inmueble, sin propietario → motivo explícito', () => {
    expect(puedeGenerarGastoDesdeTrabajo(null)).toEqual({ valido: false, motivo: 'No se ha proporcionado la orden de trabajo' });
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ estado: 'ASIGNADO' })).motivo).toContain('no está finalizada (estado actual: ASIGNADO)');
    expect(puedeGenerarGastoDesdeTrabajo({ estado: undefined }).motivo).toContain('SIN_ESTADO');
    for (const importeFinal of [undefined, 0, -5, NaN]) {
      expect(puedeGenerarGastoDesdeTrabajo(trabajo({ importeFinal })).motivo, String(importeFinal)).toContain('mayor que cero');
    }
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ inmuebleId: '' })).motivo).toContain('no tiene un inmueble');
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ propietarioId: '' })).motivo).toContain('no tiene un propietario');
  });

  it('puedeGenerarGastoDesdeTrabajo: FINALIZADO/FINALIZADA/COMPLETADO válidos; propietario resoluble desde el inmueble', () => {
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ estado: 'FINALIZADA' }))).toEqual({ valido: true });
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ estado: 'COMPLETADO' as TrabajoProfesional['estado'] }))).toEqual({ valido: true });
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ propietarioId: '' }), [inmueble()])).toEqual({ valido: true });
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ propietarioId: '' }), [inmueble({ propietarioId: undefined, propietarioPrincipalId: 'pp' } as Partial<Inmueble>)])).toEqual({ valido: true });
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ importeFinal: 0.01 })).valido).toBe(true);
  });

  it('buscarGastoDeTrabajo: localiza por trabajoId, ordenTrabajoId, origenId o id que contiene el trabajoId con origen ORDEN_TRABAJO', () => {
    const lista = [
      gasto({ id: 'a', trabajoId: 'ot1' }),
      gasto({ id: 'b', ordenTrabajoId: 'ot2' }),
      gasto({ id: 'c', origenId: 'ot3' }),
      gasto({ id: 'gas_ot4_x', origen: 'ORDEN_TRABAJO' }),
      gasto({ id: 'gas_ot5_x' }), // sin origen → no cuenta
    ];
    expect(buscarGastoDeTrabajo('ot1', lista)?.id).toBe('a');
    expect(buscarGastoDeTrabajo('ot2', lista)?.id).toBe('b');
    expect(buscarGastoDeTrabajo('ot3', lista)?.id).toBe('c');
    expect(buscarGastoDeTrabajo('ot4', lista)?.id).toBe('gas_ot4_x');
    expect(buscarGastoDeTrabajo('ot5', lista)).toBeUndefined();
    expect(buscarGastoDeTrabajo(undefined, lista)).toBeUndefined();
    expect(buscarGastoDeTrabajo('ot1', undefined as unknown as Gasto[])).toBeUndefined();
    expect(buscarGastoDeTrabajo('ot1')).toBeUndefined();
  });

  it('generarGastoDesdeTrabajo: gasto de REPARACION pagado, trazado a OT/incidencia/profesional, con fecha de finalización', () => {
    const r = generarGastoDesdeTrabajo({ trabajo: trabajo(), inmuebles: [inmueble()], usuarioNombre: 'Gestora', usuarioId: 'u1' });
    expect(r.yaExiste).toBe(false);
    expect(r.error).toBeUndefined();
    expect(r.gasto).toMatchObject({
      inmuebleId: 'inm1',
      propietarioId: 'prop1',
      tipo: 'EXPLOTACION',
      categoria: 'REPARACION',
      concepto: 'Reparación: Fuga en cocina - Fontanería Pérez',
      proveedor: 'Fontanería Pérez',
      importe: 195.5,
      estado: 'PAGADO',
      fechaDevengo: '2026-08-20',
      fechaPago: '2026-08-20',
      periodoMesAnio: '2026-08',
      aCargoDe: 'arrendador',
      deducible: true,
      origen: 'ORDEN_TRABAJO',
      origenId: 'ot1',
      trabajoId: 'ot1',
      ordenTrabajoId: 'ot1',
      incidenciaId: 'inc1',
      profesionalId: 'prof1',
      metodoPago: 'transferencia',
      creadoPor: 'Gestora',
      creadoPorId: 'u1',
      createdAt: HOY_ISO(),
    });
    expect(r.gasto!.notas).toContain('ID: ot1');
  });

  it('generarGastoDesdeTrabajo: categoría MANTENIMIENTO por tipoTrabajo o categoría; estado PENDIENTE sin fechaPago; sin fechaFinalizacion usa hoy', () => {
    const prev = generarGastoDesdeTrabajo({ trabajo: trabajo({ tipoTrabajo: 'MANTENIMIENTO_PREVENTIVO' }) }).gasto!;
    expect(prev.categoria).toBe('MANTENIMIENTO');
    expect(generarGastoDesdeTrabajo({ trabajo: trabajo({ categoria: 'MANTENIMIENTO', tipoTrabajo: undefined }) }).gasto!.categoria).toBe('MANTENIMIENTO');
    const pend = generarGastoDesdeTrabajo({ trabajo: trabajo({ fechaFinalizacion: undefined, profesionalNombre: undefined }), estadoGasto: 'PENDIENTE' }).gasto!;
    expect(pend.estado).toBe('PENDIENTE');
    expect(pend.fechaPago).toBeUndefined();
    expect(pend.fechaDevengo).toBe(HOY_ISO().split('T')[0]);
    expect(pend.concepto).toBe('Reparación: Fuga en cocina');
    expect(pend.proveedor).toBeUndefined();
    expect(pend.creadoPor).toBe('Prof'); // actualizadoPor como fallback
  });

  it('generarGastoDesdeTrabajo: OT no elegible → error sin gasto; ya existente → devuelve el existente con yaExiste', () => {
    const noElegible = generarGastoDesdeTrabajo({ trabajo: trabajo({ estado: 'PENDIENTE' }) });
    expect(noElegible.gasto).toBeUndefined();
    expect(noElegible.yaExiste).toBe(false);
    expect(noElegible.error).toContain('no está finalizada');
    const existente = gasto({ id: 'ya', trabajoId: 'ot1' });
    const r = generarGastoDesdeTrabajo({ trabajo: trabajo(), gastosExistentes: [existente] });
    expect(r).toEqual({ gasto: existente, yaExiste: true });
  });

  it('generarGastoDesdeTrabajo resuelve propietario desde el inmueble y deja cadena vacía si no hay forma de resolverlo', () => {
    expect(generarGastoDesdeTrabajo({ trabajo: trabajo({ propietarioId: '' }), inmuebles: [inmueble({ propietarioId: 'pX' })] }).gasto!.propietarioId).toBe('pX');
    // Sin inmueble localizable la elegibilidad falla antes de crear el gasto
    expect(generarGastoDesdeTrabajo({ trabajo: trabajo({ propietarioId: '' }), inmuebles: [] }).error).toContain('propietario');
  });

  it('sincronizarGastoDesdeTrabajo: actualiza importe/fechas/vinculaciones y conserva el resto; coste inválido mantiene el importe previo', () => {
    const existente = gasto({ id: 'gOT', trabajoId: 'ot1', importe: 195.5, fechaDevengo: '2026-08-20', periodoMesAnio: '2026-08', proveedor: 'Viejo', presupuestoId: 'pr0' });
    const s = sincronizarGastoDesdeTrabajo({ trabajo: trabajo({ importeFinal: 210, fechaFinalizacion: '2026-09-02T09:00:00.000Z', presupuestoId: undefined }), gastoExistente: existente });
    expect(s).toMatchObject({ id: 'gOT', importe: 210, fechaDevengo: '2026-09-02', periodoMesAnio: '2026-09', proveedor: 'Fontanería Pérez', presupuestoId: 'pr0', incidenciaId: 'inc1', updatedAt: HOY_ISO() });
    expect(s.estado).toBe('PAGADO');
    const sinCoste = sincronizarGastoDesdeTrabajo({ trabajo: trabajo({ importeFinal: 0, fechaFinalizacion: undefined }), gastoExistente: existente });
    expect(sinCoste.importe).toBe(195.5);
    expect(sinCoste.fechaDevengo).toBe('2026-08-20');
    expect(snapshot(existente)).toBe(snapshot(gasto({ id: 'gOT', trabajoId: 'ot1', importe: 195.5, fechaDevengo: '2026-08-20', periodoMesAnio: '2026-08', proveedor: 'Viejo', presupuestoId: 'pr0' })));
  });
});
