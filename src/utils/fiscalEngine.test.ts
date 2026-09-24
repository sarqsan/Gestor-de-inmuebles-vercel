/**
 * GAP-R4 — Suite propia del motor fiscal (`fiscalEngine.ts`).
 *
 * El motor es una capa DERIVADA (fuente: `DERIVADO_COBROS_GASTOS_CONTRATOS`) sobre
 * `cobrosEngine` y `gastosEngine`: no persiste ni duplica datos. Aquí se prueban las reglas
 * de cálculo tal como están implementadas hoy (deducibilidad, ingresos/gastos por ejercicio,
 * ocupación, documentación, resumen anual, aislamiento por propietario y consistencia).
 *
 * NO se introducen reglas fiscales nuevas ni se afirma conformidad normativa: los tests fijan
 * el comportamiento actual del motor para detectar regresiones. Las dudas normativas
 * (p. ej. qué categorías son deducibles) quedan fuera del alcance (cuestión externa).
 *
 * Reloj congelado (2026-09-21 12:00 local) porque `obtenerTodosCobros` genera periodos
 * cuando un contrato no los trae, y `generadoEn` usa `new Date()`.
 * Zona horaria: la suite es estable en UTC y en Europe/Madrid (entorno operativo del ERP).
 * El motor mezcla fechas parseadas como UTC (`YYYY-MM-DD`) con fechas construidas en local,
 * por lo que en zonas con desfase negativo (p. ej. America/*) los cómputos de ocupación se
 * desplazan un día; se documenta en el informe de la orden, no se enmascara aquí.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CategoriaGasto, CobroPeriodo, ContratoFormalizacion, Gasto, Inmueble, UsuarioApp } from '../types';
import {
  calcularDiasOcupacionEjercicio,
  calcularGastosEjercicio,
  calcularIngresosEjercicio,
  calcularPeriodosSinAlquiler,
  canAccessResumenFiscal,
  clasificarGastosDeducibilidad,
  esGastoDeducible,
  filtrarResumenesFiscalesPorUsuario,
  generarHistoricoFiscalInmueble,
  generarResumenFiscalAnual,
  integrarFiscalConRentabilidad,
  recopilarDocumentacionFiscal,
  validarConsistenciaFiscal,
} from './fiscalEngine';

// ---------------------------------------------------------------------------
// Fixtures mínimos
// ---------------------------------------------------------------------------

const HOY = new Date(2026, 8, 21, 12, 0, 0);

const gasto = (p: Partial<Gasto> = {}): Gasto =>
  ({
    id: 'g1',
    inmuebleId: 'inm1',
    propietarioId: 'prop1',
    tipo: 'EXPLOTACION',
    categoria: 'COMUNIDAD',
    concepto: 'Cuota comunidad',
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

const cobro = (p: Partial<CobroPeriodo> = {}): CobroPeriodo =>
  ({
    id: `cobro_c1_${p.anio ?? 2026}_${String(p.mes ?? 1).padStart(2, '0')}`,
    inmuebleId: 'inm1',
    contratoId: 'c1',
    inquilinoId: 'inq1',
    inquilinoNombre: 'Ana',
    propietarioId: 'prop1',
    mes: 1,
    anio: 2026,
    periodoMesAnio: `${p.anio ?? 2026}-${String(p.mes ?? 1).padStart(2, '0')}`,
    nombreMes: `Mes ${p.mes ?? 1} ${p.anio ?? 2026}`,
    importePrevisto: 800,
    importeRecibido: 0,
    fechaVencimiento: `${p.anio ?? 2026}-${String(p.mes ?? 1).padStart(2, '0')}-05`,
    estado: 'PENDIENTE',
    historialCambios: [],
    ...p,
  }) as CobroPeriodo;

const contrato = (p: Partial<ContratoFormalizacion> = {}): ContratoFormalizacion =>
  ({
    id: 'c1',
    candidatoId: 'inq1',
    candidatoNombre: 'Ana',
    candidatoDni: '1T',
    inmuebleId: 'inm1',
    propietarioId: 'prop1',
    rentaMensual: 800,
    fechaInicioContrato: '2026-01-15',
    esVigente: true,
    diaLimitePagoMes: 5,
    modalidadAlquiler: 'completo',
    estado: 'FORMALIZADO_ACTIVO',
    historial: [],
    ...p,
  }) as ContratoFormalizacion;

const inmueble = (p: Partial<Inmueble> = {}): Inmueble =>
  ({
    id: 'inm1',
    direccion: 'Calle Mayor 1',
    ciudad: 'Madrid',
    precio: 800,
    estado: 'alquilado',
    habitaciones: 2,
    banos: 1,
    superficie: 70,
    candidatosCount: 0,
    fianzaMeses: 1,
    propietarioId: 'prop1',
    ...p,
  }) as Inmueble;

const usuario = (tipoPerfil: UsuarioApp['tipoPerfil'], extra: Partial<UsuarioApp> = {}): UsuarioApp =>
  ({
    id: `u-${tipoPerfil}`,
    nombre: tipoPerfil,
    email: `${tipoPerfil.toLowerCase()}@erp.test`,
    tipoPerfil,
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    createdAt: '',
    updatedAt: '',
    ...extra,
  }) as UsuarioApp;

/** Contrato 2026 con 9 periodos ya cerrados (ene–sep) para no depender de la generación. */
const contratoConCobros2026 = () =>
  contrato({
    registroCobros: [
      cobro({ mes: 1, estado: 'RECIBIDO', importeRecibido: 800, justificante: { id: 'j1', nombreArchivo: 'ene.pdf', fechaSubida: '', storagePath: 'p/ene.pdf' }, fechaPago: '2026-01-03' }),
      cobro({ mes: 2, estado: 'VERIFICADO', importeRecibido: 800 }),
      cobro({ mes: 3, estado: 'RETRASADO' }),
      cobro({ mes: 4, estado: 'INCIDENCIA', importeRecibido: 300 }),
      cobro({ mes: 5, estado: 'INCIDENCIA', importeRecibido: 0 }),
      cobro({ mes: 6, estado: 'PENDIENTE' }),
      cobro({ mes: 7, estado: 'PENDIENTE' }),
      cobro({ mes: 8, estado: 'PENDIENTE' }),
      cobro({ mes: 9, estado: 'PENDIENTE' }),
      cobro({ mes: 10, estado: 'PENDIENTE' }),
      cobro({ mes: 11, estado: 'PENDIENTE' }),
    ],
  });

const snapshot = (v: unknown) => JSON.stringify(v);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HOY);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Deducibilidad
// ---------------------------------------------------------------------------

describe('fiscalEngine · esGastoDeducible / clasificarGastosDeducibilidad', () => {
  it('prioridad 1: el flag booleano `esDeducible` manda sobre cualquier otra señal', () => {
    expect(esGastoDeducible(gasto({ esDeducible: false, tipoDeducible: 'DEDUCIBLE', categoria: 'COMUNIDAD' }))).toBe(false);
    expect(esGastoDeducible(gasto({ esDeducible: true, tipoDeducible: 'NO_DEDUCIBLE', categoria: 'OTRO' }))).toBe(true);
  });

  it('prioridad 2: `tipoDeducible` decide cuando no hay flag booleano', () => {
    expect(esGastoDeducible(gasto({ tipoDeducible: 'DEDUCIBLE', categoria: 'OTRO' }))).toBe(true);
    expect(esGastoDeducible(gasto({ tipoDeducible: 'NO_DEDUCIBLE', categoria: 'COMUNIDAD' }))).toBe(false);
  });

  it('prioridad 3: inferencia por la lista cerrada de categorías del motor; OTRO y financiación no deducibles', () => {
    const deducibles: CategoriaGasto[] = [
      'MANTENIMIENTO', 'REPARACION', 'SUMINISTROS', 'SEGUROS', 'IMPUESTOS_TASAS', 'COMUNIDAD',
      'ELECTRODOMESTICOS', 'MOBILIARIO', 'REFORMAS', 'LIMPIEZA', 'GESTION',
    ];
    for (const categoria of deducibles) {
      expect(esGastoDeducible(gasto({ categoria })), categoria).toBe(true);
    }
    const noDeducibles: CategoriaGasto[] = ['OTRO', 'CUOTA_HIPOTECARIA', 'INTERESES_PRESTAMO', 'OTRO_FINANCIACION'];
    for (const categoria of noDeducibles) {
      expect(esGastoDeducible(gasto({ categoria })), categoria).toBe(false);
    }
    // NOTA R4: las categorías del catálogo de gastosEngine IBI, SEGURO_HOGAR, ADMINISTRACION y
    // OTRO_EXPLOTACION, y el flag operativo `deducible`, no se prueban aquí: su tratamiento actual
    // se documenta como defecto D en el informe de la orden (no se fija con tests).
  });

  it('clasificar: separa listas, suma totales y excluye ANULADOS', () => {
    const r = clasificarGastosDeducibilidad([
      gasto({ id: 'a', categoria: 'COMUNIDAD', importe: 100 }),
      gasto({ id: 'b', categoria: 'OTRO', importe: 40 }),
      gasto({ id: 'c', categoria: 'COMUNIDAD', importe: 999, estado: 'ANULADO' }),
      gasto({ id: 'd', categoria: 'SEGUROS', importe: 60.5 }),
    ]);
    expect(r.deducibles.map((g) => g.id)).toEqual(['a', 'd']);
    expect(r.noDeducibles.map((g) => g.id)).toEqual(['b']);
    expect(r.totalDeducible).toBe(160.5);
    expect(r.totalNoDeducible).toBe(40);
  });

  it('clasificar: lista vacía → ceros; importe ausente cuenta como 0', () => {
    expect(clasificarGastosDeducibilidad([])).toEqual({ deducibles: [], noDeducibles: [], totalDeducible: 0, totalNoDeducible: 0 });
    const r = clasificarGastosDeducibilidad([gasto({ importe: undefined as unknown as number })]);
    expect(r.totalDeducible).toBe(0);
    expect(r.deducibles).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Ocupación
// ---------------------------------------------------------------------------

describe('fiscalEngine · ocupación por ejercicio', () => {
  it('calcularDiasOcupacionEjercicio: año completo 365 (366 en bisiesto), inclusivo en ambos extremos', () => {
    expect(calcularDiasOcupacionEjercicio(contrato({ fechaInicioContrato: '2026-01-01', fechaFinContrato: '2026-12-31' }), 2026)).toBe(365);
    expect(calcularDiasOcupacionEjercicio(contrato({ fechaInicioContrato: '2020-01-01' }), 2024)).toBe(366);
  });

  it('recorta al ejercicio: contrato que empieza antes y termina a mitad de año', () => {
    expect(calcularDiasOcupacionEjercicio(contrato({ fechaInicioContrato: '2025-03-01', fechaFinContrato: '2026-06-30' }), 2026)).toBe(181);
  });

  it('un día de contrato dentro del ejercicio cuenta 1; fuera del ejercicio o inválido → 0', () => {
    expect(calcularDiasOcupacionEjercicio(contrato({ fechaInicioContrato: '2026-12-31', fechaFinContrato: '2026-12-31' }), 2026)).toBe(1);
    expect(calcularDiasOcupacionEjercicio(contrato({ fechaInicioContrato: '2027-01-01' }), 2026)).toBe(0);
    expect(calcularDiasOcupacionEjercicio(contrato({ fechaInicioContrato: '2020-01-01', fechaFinContrato: '2025-12-31' }), 2026)).toBe(0);
    expect(calcularDiasOcupacionEjercicio(contrato({ fechaInicioContrato: 'no-fecha' }), 2026)).toBe(0);
  });

  it('calcularPeriodosSinAlquiler: sin contratos → todo el ejercicio (365 fijo)', () => {
    expect(calcularPeriodosSinAlquiler([], 2026)).toEqual([{ inicio: '2026-01-01', fin: '2026-12-31', dias: 365 }]);
  });

  it('calcularPeriodosSinAlquiler: hueco entre dos contratos consecutivos (días contados de forma inclusiva)', () => {
    const r = calcularPeriodosSinAlquiler(
      [contrato({ id: 'b', fechaInicioContrato: '2026-05-01', fechaFinContrato: '2026-12-31' }), contrato({ id: 'a', fechaInicioContrato: '2026-01-01', fechaFinContrato: '2026-03-31' })],
      2026
    );
    expect(r).toHaveLength(1);
    expect(r[0].fin).toBe('2026-04-30');
    expect(r[0].dias).toBe(30);
  });

  it('calcularPeriodosSinAlquiler: contrato abierto (sin fin) que cubre hasta final de año → sin hueco final', () => {
    const r = calcularPeriodosSinAlquiler([contrato({ fechaInicioContrato: '2026-04-01' })], 2026);
    expect(r).toHaveLength(1);
    expect(r[0].fin).toBe('2026-03-31');
    expect(r[0].dias).toBe(90);
  });

  it('calcularPeriodosSinAlquiler: contrato que cubre todo el ejercicio → sin periodos vacíos', () => {
    expect(calcularPeriodosSinAlquiler([contrato({ fechaInicioContrato: '2025-06-01' })], 2026)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Ingresos del ejercicio
// ---------------------------------------------------------------------------

describe('fiscalEngine · calcularIngresosEjercicio', () => {
  it('filtra por ejercicio y devuelve referencias (no copias) a los cobros', () => {
    const c2026 = cobro({ mes: 1, estado: 'RECIBIDO', importeRecibido: 800 });
    const c2025 = cobro({ mes: 12, anio: 2025, estado: 'RECIBIDO', importeRecibido: 700, importePrevisto: 700 });
    const r = calcularIngresosEjercicio([c2026, c2025], 2026);
    expect(r.countTotal).toBe(1);
    expect(r.cobros[0]).toBe(c2026);
    expect(r.totalPrevisto).toBe(800);
  });

  it('clasificación por estado: RECIBIDO/VERIFICADO/PAGADO cobrados; RETRASADO/IMPAGADO impagados; PARCIAL parcial; ANULADO aparte', () => {
    const r = calcularIngresosEjercicio(
      [
        cobro({ mes: 1, estado: 'RECIBIDO', importeRecibido: 800 }),
        cobro({ mes: 2, estado: 'VERIFICADO', importeRecibido: 800 }),
        cobro({ mes: 3, estado: 'PAGADO', importeRecibido: 800 }),
        cobro({ mes: 4, estado: 'RETRASADO' }),
        cobro({ mes: 5, estado: 'IMPAGADO', importeRecibido: 200 }),
        cobro({ mes: 6, estado: 'PAGADO_PARCIAL', importeRecibido: 500 }),
        cobro({ mes: 7, estado: 'ANULADO' }),
        cobro({ mes: 8, estado: 'PENDIENTE' }),
      ],
      2026
    );
    expect(r).toMatchObject({
      totalPrevisto: 6400,
      totalCobrado: 2900, // 800*3 + 500 (parcial). Los 200 del IMPAGADO no cuentan como cobrados
      totalImpagado: 800 + 600,
      totalParcial: 300,
      totalAnulado: 800,
      totalPendiente: 800,
      countCobrados: 3,
      countImpagados: 2,
      countParcial: 1,
      countAnulados: 1,
      countPendientes: 1,
      countTotal: 8,
    });
    expect(r.mesesConIngreso).toEqual([1, 2, 3, 6]);
    expect(r.mesesImpagados).toEqual([4, 5]);
    expect(r.mesesParciales).toEqual([6]);
  });

  it('INCIDENCIA: con algo cobrado se trata como parcial; sin nada cobrado como impagado', () => {
    const r = calcularIngresosEjercicio(
      [cobro({ mes: 4, estado: 'INCIDENCIA', importeRecibido: 300 }), cobro({ mes: 5, estado: 'INCIDENCIA', importeRecibido: 0 })],
      2026
    );
    expect(r.totalCobrado).toBe(300);
    expect(r.totalParcial).toBe(500);
    expect(r.totalImpagado).toBe(800);
    expect(r.countParcial).toBe(1);
    expect(r.countImpagados).toBe(1);
    expect(r.mesesParciales).toEqual([4]);
    expect(r.mesesImpagados).toEqual([5]);
  });

  it('RETRASADO con importe recibido parcial: el impagado es la diferencia (no el previsto íntegro)', () => {
    const r = calcularIngresosEjercicio([cobro({ mes: 3, estado: 'RETRASADO', importeRecibido: 350 })], 2026);
    expect(r.totalImpagado).toBe(450);
  });

  it('meses únicos y ordenados aunque haya varios cobros del mismo mes (p. ej. habitaciones)', () => {
    const r = calcularIngresosEjercicio(
      [
        cobro({ id: 'h1', mes: 3, estado: 'RECIBIDO', importeRecibido: 400, importePrevisto: 400 }),
        cobro({ id: 'h2', mes: 3, estado: 'RECIBIDO', importeRecibido: 400, importePrevisto: 400 }),
        cobro({ id: 'h3', mes: 1, estado: 'RECIBIDO', importeRecibido: 400, importePrevisto: 400 }),
      ],
      2026
    );
    expect(r.mesesConIngreso).toEqual([1, 3]);
    expect(r.totalCobrado).toBe(1200);
  });

  it('sin cobros del ejercicio → todo a cero y listas vacías; importes ausentes no producen NaN', () => {
    const vacio = calcularIngresosEjercicio([cobro({ anio: 2025 })], 2026);
    expect(vacio.totalPrevisto).toBe(0);
    expect(vacio.countTotal).toBe(0);
    expect(vacio.mesesConIngreso).toEqual([]);
    const sinImportes = calcularIngresosEjercicio([cobro({ importePrevisto: undefined as unknown as number, importeRecibido: undefined as unknown as number, estado: 'RECIBIDO' })], 2026);
    expect(sinImportes.totalCobrado).toBe(0);
    expect(Number.isNaN(sinImportes.totalPendiente)).toBe(false);
  });

  it('invariante: previsto = cobrado + pendiente + impagado + parcial + anulado (cuando cobrados están íntegros)', () => {
    const r = calcularIngresosEjercicio(contratoConCobros2026().registroCobros!, 2026);
    expect(r.totalCobrado + r.totalPendiente + r.totalImpagado + r.totalParcial + r.totalAnulado).toBe(r.totalPrevisto);
  });
});

// ---------------------------------------------------------------------------
// Gastos del ejercicio
// ---------------------------------------------------------------------------

describe('fiscalEngine · calcularGastosEjercicio', () => {
  it('asigna ejercicio por `ejercicioFiscal` si existe; si no, por año de fechaDevengo → fechaPago → fecha → createdAt', () => {
    const r = calcularGastosEjercicio(
      [
        gasto({ id: 'a', fechaDevengo: '2025-12-30', ejercicioFiscal: 2026 }), // forzado a 2026
        gasto({ id: 'b', fechaDevengo: '2026-02-01' }),
        gasto({ id: 'c', fechaDevengo: undefined, fechaPago: '2026-05-05' }),
        gasto({ id: 'd', fechaDevengo: undefined, fechaPago: undefined, fecha: '2026-06-06' }),
        gasto({ id: 'e', fechaDevengo: undefined, fechaPago: undefined, createdAt: '2026-07-07T00:00:00.000Z' }),
        gasto({ id: 'f', fechaDevengo: '2025-11-11' }), // fuera
        gasto({ id: 'g', fechaDevengo: '2026-01-01', ejercicioFiscal: 2025 }), // forzado fuera
      ],
      2026
    );
    expect(r.gastos.map((g) => g.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('gasto sin ninguna fecha válida queda fuera del ejercicio (no rompe)', () => {
    const r = calcularGastosEjercicio([gasto({ fechaDevengo: 'x', fechaPago: undefined, fecha: undefined, createdAt: 'y' })], 2026);
    expect(r.countTotal).toBe(0);
    expect(r.total).toBe(0);
  });

  it('totales: total, deducible/no deducible, por categoría; ANULADO excluido de todos los conteos', () => {
    const r = calcularGastosEjercicio(
      [
        gasto({ id: 'a', categoria: 'COMUNIDAD', importe: 100 }),
        gasto({ id: 'b', categoria: 'COMUNIDAD', importe: 50 }),
        gasto({ id: 'c', categoria: 'OTRO', importe: 30 }),
        gasto({ id: 'd', categoria: 'SEGUROS', importe: 20, estado: 'ANULADO', documento: { id: 'x', nombre: 'x', url: 'x' } }),
      ],
      2026
    );
    expect(r.total).toBe(180);
    expect(r.totalDeducible).toBe(150);
    expect(r.totalNoDeducible).toBe(30);
    expect(r.countTotal).toBe(3);
    expect(r.countDeducible).toBe(2);
    expect(r.countNoDeducible).toBe(1);
    expect(r.porCategoria).toEqual({ COMUNIDAD: 150, OTRO: 30 });
    expect(r.porCategoriaDeducible).toEqual({ COMUNIDAD: 150 });
    expect(r.porCategoriaNoDeducible).toEqual({ OTRO: 30 });
    expect(r.gastosConJustificante).toBe(0);
    expect(r.gastosSinJustificante).toBe(3);
  });

  it('justificantes (documento o documentos[]), vinculación a OT (trabajoId/incidenciaId) y a seguro (categoría SEGUROS)', () => {
    const r = calcularGastosEjercicio(
      [
        gasto({ id: 'a', documento: { id: 'd1', nombre: 'f.pdf', url: 'u' } }),
        gasto({ id: 'b', documentos: [{ id: 'd2', nombre: 'g.pdf', url: 'u' }] }),
        gasto({ id: 'c', documentos: [] }),
        gasto({ id: 'd', trabajoId: 'ot1' }),
        gasto({ id: 'e', incidenciaId: 'inc1' }),
        gasto({ id: 'f', categoria: 'SEGUROS' }),
      ],
      2026
    );
    expect(r.gastosConJustificante).toBe(2);
    expect(r.gastosSinJustificante).toBe(4);
    expect(r.gastosVinculadosOT).toBe(2);
    expect(r.gastosVinculadosSeguro).toBe(1);
  });

  it('invariante: total = deducible + no deducible; countTotal = countDeducible + countNoDeducible', () => {
    const r = calcularGastosEjercicio(
      [gasto({ id: 'a', importe: 33.33 }), gasto({ id: 'b', importe: 66.67, categoria: 'OTRO' }), gasto({ id: 'c', importe: 0.01, categoria: 'GESTION' })],
      2026
    );
    expect(r.totalDeducible + r.totalNoDeducible).toBeCloseTo(r.total, 10);
    expect(r.countDeducible + r.countNoDeducible).toBe(r.countTotal);
  });

  it('importe 0 es un gasto válido que cuenta pero no suma', () => {
    const r = calcularGastosEjercicio([gasto({ importe: 0 })], 2026);
    expect(r.countTotal).toBe(1);
    expect(r.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Documentación
// ---------------------------------------------------------------------------

describe('fiscalEngine · recopilarDocumentacionFiscal', () => {
  it('recoge justificantes de cobros y de gastos (documento o primer documentos[]), ordenados por fecha descendente', () => {
    const ingresos = calcularIngresosEjercicio(
      [
        cobro({ mes: 1, estado: 'RECIBIDO', importeRecibido: 800, fechaPago: '2026-01-03', justificante: { id: 'j1', nombreArchivo: 'ene.pdf', fechaSubida: '', storagePath: 's/ene', downloadURL: 'dl' } }),
        cobro({ mes: 2, estado: 'RECIBIDO', importeRecibido: 800 }), // sin justificante
      ],
      2026
    );
    const gastos = calcularGastosEjercicio(
      [
        gasto({ id: 'ga', fecha: '2026-03-10', importe: 120, documento: { id: 'dg1', nombre: 'com.pdf', url: 'u1', storagePath: 's/com' } }),
        gasto({ id: 'gb', fecha: '2026-05-01', documentos: [{ id: 'dg2', nombre: 'a.pdf', url: 'u2' }, { id: 'dg3', nombre: 'b.pdf', url: 'u3' }] }),
        gasto({ id: 'gc', fecha: '2026-06-01', estado: 'ANULADO', documento: { id: 'dgx', nombre: 'x', url: 'x' } }),
      ],
      2026
    );
    const docs = recopilarDocumentacionFiscal(ingresos, gastos);
    expect(docs.map((d) => d.id)).toEqual(['dg2', 'dg1', 'j1']);
    expect(docs[2]).toMatchObject({ tipo: 'INGRESO', referenciaId: 'cobro_c1_2026_01', importe: 800, fecha: '2026-01-03', ejercicio: 2026, downloadURL: 'dl', concepto: 'Alquiler Mes 1 2026 - Ana' });
    expect(docs[1]).toMatchObject({ tipo: 'GASTO', referenciaId: 'ga', importe: 120, concepto: 'COMUNIDAD - Cuota comunidad', storagePath: 's/com' });
  });

  it('cobro con justificante sin fechaPago usa la fecha de vencimiento; importe recibido 0 cae al previsto', () => {
    const ingresos = calcularIngresosEjercicio([cobro({ mes: 3, justificante: { id: 'j', nombreArchivo: 'x', fechaSubida: '' } })], 2026);
    const [doc] = recopilarDocumentacionFiscal(ingresos, calcularGastosEjercicio([], 2026));
    expect(doc.fecha).toBe('2026-03-05');
    expect(doc.importe).toBe(800);
  });

  it('sin justificantes → lista vacía', () => {
    expect(recopilarDocumentacionFiscal(calcularIngresosEjercicio([cobro()], 2026), calcularGastosEjercicio([gasto()], 2026))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Resumen anual completo
// ---------------------------------------------------------------------------

describe('fiscalEngine · generarResumenFiscalAnual', () => {
  const gastos2026 = () => [
    gasto({ id: 'g1', categoria: 'COMUNIDAD', importe: 100 }),
    gasto({ id: 'g2', categoria: 'OTRO', importe: 50 }),
    gasto({ id: 'g3', categoria: 'COMUNIDAD', importe: 999, inmuebleId: 'inm9' }), // otro inmueble
    gasto({ id: 'g4', categoria: 'COMUNIDAD', importe: 70, fechaDevengo: '2025-05-05' }), // otro ejercicio
  ];

  it('inmueble inexistente → null', () => {
    expect(generarResumenFiscalAnual('nope', 2026, [inmueble()], [], [])).toBeNull();
  });

  it('deriva ingresos/gastos del inmueble y ejercicio, y calcula resultados y margen', () => {
    const r = generarResumenFiscalAnual('inm1', 2026, [inmueble()], [contratoConCobros2026()], gastos2026(), usuario('ADMINISTRADOR'))!;
    expect(r.fuente).toBe('DERIVADO_COBROS_GASTOS_CONTRATOS');
    expect(r.ingresos.totalCobrado).toBe(1900); // 800 + 800 + 300 (incidencia parcial)
    expect(r.gastos.total).toBe(150);
    expect(r.gastos.totalDeducible).toBe(100);
    expect(r.resultadoNetoOperativo).toBe(1800);
    expect(r.resultadoBruto).toBe(1750);
    expect(r.margenOperativo).toBe(95); // 1800/1900 = 94.7 → 95
    expect(r.propietarioId).toBe('prop1');
    expect(r.inmuebleDireccion).toBe('Calle Mayor 1');
    expect(r.fechaInicioEjercicio).toBe('2026-01-01');
    expect(r.fechaFinEjercicio).toBe('2026-12-31');
    expect(r.generadoEn).toBe(HOY.toISOString());
    expect(r.generadoPor).toBe('ADMINISTRADOR');
  });

  it('sin ingresos: margen 0 (sin división por cero) y resultado negativo igual a −gastos', () => {
    const r = generarResumenFiscalAnual('inm1', 2026, [inmueble()], [], [gasto({ importe: 80 })])!;
    expect(r.ingresos.totalCobrado).toBe(0);
    expect(r.margenOperativo).toBe(0);
    expect(r.resultadoNetoOperativo).toBe(-80);
    expect(r.numContratos).toBe(0);
    expect(r.diasAlquilados).toBe(0);
    expect(r.diasSinAlquilar).toBe(365);
    expect(r.periodosSinAlquiler).toEqual([{ inicio: '2026-01-01', fin: '2026-12-31', dias: 365 }]);
  });

  it('selección de contratos del ejercicio por año: excluye los que empiezan después o terminan antes', () => {
    const contratos = [
      contrato({ id: 'actual' }),
      contrato({ id: 'futuro', fechaInicioContrato: '2027-02-15' }),
      contrato({ id: 'pasado', candidatoId: 'inq0', fechaInicioContrato: '2024-01-15', fechaFinContrato: '2025-06-15', esVigente: false }),
      contrato({ id: 'sinFecha', fechaInicioContrato: '' }),
      contrato({ id: 'otroInm', inmuebleId: 'inm9' }),
    ];
    const r = generarResumenFiscalAnual('inm1', 2026, [inmueble()], contratos, [])!;
    expect(r.contratos.map((c) => c.id)).toEqual(['actual']);
    expect(r.numContratos).toBe(1);
    expect(r.numInquilinos).toBe(1);
  });

  it('sucesión de inquilinos: periodos de ocupación por contrato, inquilinos únicos y días agregados', () => {
    const c1 = contrato({
      id: 'c1', candidatoId: 'inq1', candidatoNombre: 'Ana', fechaInicioContrato: '2026-01-01', fechaFinContrato: '2026-03-31', esVigente: false,
      registroCobros: [cobro({ mes: 1, estado: 'RECIBIDO', importeRecibido: 800 }), cobro({ mes: 2, estado: 'RECIBIDO', importeRecibido: 800 }), cobro({ mes: 3, estado: 'RECIBIDO', importeRecibido: 800 })],
    });
    const c2 = contrato({
      id: 'c2', candidatoId: 'inq2', candidatoNombre: 'Luis', fechaInicioContrato: '2026-05-01', rentaMensual: 900,
      registroCobros: [5, 6, 7, 8, 9, 10, 11].map((mes) => cobro({ id: `cobro_c2_2026_${String(mes).padStart(2, '0')}`, contratoId: 'c2', inquilinoId: 'inq2', inquilinoNombre: 'Luis', mes, importePrevisto: 900, importeRecibido: mes <= 9 ? 900 : 0, estado: mes <= 9 ? 'RECIBIDO' : 'PENDIENTE' })),
    });
    // Mismo inquilino con dos contratos (renovación) → cuenta 1 inquilino
    const c3 = contrato({ id: 'c3', candidatoId: 'inq2', candidatoNombre: 'Luis', fechaInicioContrato: '2026-12-01', registroCobros: [cobro({ id: 'cobro_c3_2026_12', contratoId: 'c3', mes: 12, importePrevisto: 900 })] });
    const r = generarResumenFiscalAnual('inm1', 2026, [inmueble()], [c1, c2, c3], [])!;
    expect(r.numContratos).toBe(3);
    expect(r.numInquilinos).toBe(2);
    const p1 = r.periodosOcupacion.find((p) => p.contratoId === 'c1')!;
    const p2 = r.periodosOcupacion.find((p) => p.contratoId === 'c2')!;
    expect(p1).toMatchObject({ inquilinoNombre: 'Ana', diasAlquiladosEjercicio: 90, ingresosPrevistosEjercicio: 2400, ingresosCobradosEjercicio: 2400 });
    expect(p2).toMatchObject({ inquilinoNombre: 'Luis', diasAlquiladosEjercicio: 245, ingresosPrevistosEjercicio: 6300, ingresosCobradosEjercicio: 4500 });
    expect(r.diasAlquilados).toBe(90 + 245 + 31);
    expect(r.diasSinAlquilar).toBe(0); // 366 días ocupados (solape c2/c3 en diciembre) → max(0, 365 − 366) = 0
    expect(r.periodosSinAlquiler).toEqual([{ inicio: '2026-04-01', fin: '2026-04-30', dias: 30 }]);
    expect(r.ingresos.totalCobrado).toBe(2400 + 4500);
    expect(r.periodosAlquilados.find((p) => p.inquilino === 'Ana')?.fin).toBe('2026-03-31');
    expect(r.periodosAlquilados.find((p) => p.inquilino === 'Luis')?.fin).toBe('2026-12-31'); // sin fin → cierre del ejercicio
  });

  it('cada cobro y gasto aparece una sola vez (consistencia) y la documentación se agrega', () => {
    const c = contratoConCobros2026();
    const r = generarResumenFiscalAnual('inm1', 2026, [inmueble()], [c], [gasto({ id: 'g1', documento: { id: 'd1', nombre: 'f', url: 'u' } })])!;
    expect(validarConsistenciaFiscal(r)).toEqual({ valido: true, errores: [], advertencias: [] });
    expect(r.numDocumentos).toBe(2);
    expect(r.documentacion.map((d) => d.tipo).sort()).toEqual(['GASTO', 'INGRESO']);
  });

  it('propietario: usa propietarioPrincipalId si no hay propietarioId; nombre desde datosFiscales; generadoPor explícito', () => {
    const inm = inmueble({ propietarioId: undefined, propietarioPrincipalId: 'pp9', datosFiscales: { propietarioPrincipal: { nombre: 'María' } } } as unknown as Partial<Inmueble>);
    const r = generarResumenFiscalAnual('inm1', 2026, [inm], [], [], usuario('ADMINISTRADOR'), 'Asesoría')!;
    expect(r.propietarioId).toBe('pp9');
    expect(r.propietarioNombre).toBe('María');
    expect(r.generadoPor).toBe('Asesoría');
    expect(generarResumenFiscalAnual('inm1', 2026, [inm], [], [])!.generadoPor).toBe('Sistema');
  });

  it('determinismo (mismo reloj → mismo resumen) y sin efectos laterales sobre las entradas', () => {
    const contratos = [contratoConCobros2026()];
    const gastos = gastos2026();
    const inms = [inmueble()];
    const antes = snapshot({ contratos, gastos, inms });
    const a = generarResumenFiscalAnual('inm1', 2026, inms, contratos, gastos);
    const b = generarResumenFiscalAnual('inm1', 2026, inms, contratos, gastos);
    expect(a).toEqual(b);
    expect(snapshot({ contratos, gastos, inms })).toBe(antes);
  });

  it('generarHistoricoFiscalInmueble: un resumen por ejercicio, ordenado descendente, independientes entre sí', () => {
    const c2025 = contrato({
      id: 'c0', candidatoId: 'inq0', esVigente: false, fechaInicioContrato: '2025-01-15', fechaFinContrato: '2025-12-15',
      registroCobros: [cobro({ id: 'cobro_c0_2025_06', contratoId: 'c0', mes: 6, anio: 2025, estado: 'RECIBIDO', importeRecibido: 700, importePrevisto: 700 })],
    });
    const h = generarHistoricoFiscalInmueble('inm1', [2024, 2025, 2026], [inmueble()], [c2025, contratoConCobros2026()], [gasto({ fechaDevengo: '2025-03-03', importe: 10 })]);
    expect(h.map((r) => r.ejercicio)).toEqual([2026, 2025, 2024]);
    expect(h[0].ingresos.totalCobrado).toBe(1900);
    expect(h[0].gastos.total).toBe(0);
    expect(h[1].ingresos.totalCobrado).toBe(700);
    expect(h[1].gastos.total).toBe(10);
    expect(h[2].ingresos.countTotal).toBe(0);
    expect(generarHistoricoFiscalInmueble('nope', [2026], [inmueble()], [], [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Aislamiento por propietario e integración
// ---------------------------------------------------------------------------

describe('fiscalEngine · acceso y filtrado por usuario', () => {
  const resumen = () => generarResumenFiscalAnual('inm1', 2026, [inmueble()], [], [])!;

  it('sin usuario (legacy) y ADMINISTRADOR acceden', () => {
    expect(canAccessResumenFiscal(resumen(), null)).toBe(true);
    expect(canAccessResumenFiscal(resumen(), undefined)).toBe(true);
    expect(canAccessResumenFiscal(resumen(), usuario('ADMINISTRADOR'))).toBe(true);
  });

  it('PROPIETARIO: accede por propietarioId coincidente o por inmuebleIds; nunca a otro propietario', () => {
    expect(canAccessResumenFiscal(resumen(), usuario('PROPIETARIO', { propietarioId: 'prop1' }))).toBe(true);
    expect(canAccessResumenFiscal(resumen(), usuario('PROPIETARIO', { propietarioId: 'prop2', inmuebleIds: ['inm1'] }))).toBe(true);
    expect(canAccessResumenFiscal(resumen(), usuario('PROPIETARIO', { propietarioId: 'prop2' }))).toBe(false);
    expect(canAccessResumenFiscal(resumen(), usuario('PROPIETARIO', { propietarioId: 'prop2', inmuebleIds: ['inm9'] }))).toBe(false);
    expect(canAccessResumenFiscal(resumen(), usuario('PROPIETARIO'))).toBe(false);
  });

  it('PROFESIONAL e INQUILINO nunca acceden al resumen fiscal', () => {
    expect(canAccessResumenFiscal(resumen(), usuario('PROFESIONAL'))).toBe(false);
    expect(canAccessResumenFiscal(resumen(), usuario('INQUILINO', { propietarioId: 'prop1' }))).toBe(false);
  });

  it('filtrarResumenesFiscalesPorUsuario: sin usuario/admin todo; propietario solo lo suyo; profesional nada', () => {
    const mio = resumen();
    const ajeno = generarResumenFiscalAnual('inm9', 2026, [inmueble({ id: 'inm9', propietarioId: 'prop2' })], [], [])!;
    const lista = [mio, ajeno];
    expect(filtrarResumenesFiscalesPorUsuario(lista, null)).toHaveLength(2);
    expect(filtrarResumenesFiscalesPorUsuario(lista, usuario('ADMINISTRADOR'))).toHaveLength(2);
    expect(filtrarResumenesFiscalesPorUsuario(lista, usuario('PROPIETARIO', { propietarioId: 'prop1' }))).toEqual([mio]);
    expect(filtrarResumenesFiscalesPorUsuario(lista, usuario('PROFESIONAL'))).toEqual([]);
  });
});

describe('fiscalEngine · integración y consistencia', () => {
  it('integrarFiscalConRentabilidad reexpone los agregados sin recalcular (rentabilidad = margen operativo)', () => {
    const r = generarResumenFiscalAnual('inm1', 2026, [inmueble()], [contratoConCobros2026()], [gasto({ importe: 100 }), gasto({ id: 'g2', importe: 50, categoria: 'OTRO' })])!;
    expect(integrarFiscalConRentabilidad(r)).toEqual({
      ingresos: 1900,
      gastos: 150,
      gastosDeducibles: 100,
      resultadoNeto: 1800,
      rentabilidadEstimada: 95,
    });
  });

  it('validarConsistenciaFiscal: detecta cobros duplicados, gastos duplicados y storagePath repetido (advertencia)', () => {
    const base = generarResumenFiscalAnual('inm1', 2026, [inmueble()], [], [])!;
    const dupCobros = { ...base, ingresos: { ...base.ingresos, cobros: [cobro({ id: 'x' }), cobro({ id: 'x' })] } };
    expect(validarConsistenciaFiscal(dupCobros).valido).toBe(false);
    expect(validarConsistenciaFiscal(dupCobros).errores[0]).toMatch(/Cobros duplicados/);

    const dupGastos = { ...base, gastos: { ...base.gastos, gastos: [gasto({ id: 'g' }), gasto({ id: 'g' })] } };
    expect(validarConsistenciaFiscal(dupGastos).errores[0]).toMatch(/Gastos duplicados/);

    const doc = { id: 'd', tipo: 'GASTO' as const, referenciaId: 'g', nombreArchivo: 'f', fecha: '2026-01-01', ejercicio: 2026, importe: 1, concepto: 'c', storagePath: 'mismo' };
    const dupDocs = { ...base, documentacion: [doc, { ...doc, id: 'd2' }] };
    const v = validarConsistenciaFiscal(dupDocs);
    expect(v.valido).toBe(true); // solo advertencia
    expect(v.advertencias).toHaveLength(1);
  });
});
