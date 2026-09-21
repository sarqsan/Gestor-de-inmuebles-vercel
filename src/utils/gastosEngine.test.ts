/**
 * GAP-R4 — Suite propia de `gastosEngine` (motor de gastos base, FASE 2.0).
 *
 * El modelo oficial de contabilidad de gastos del ERP (`Gasto`, colección
 * `gastos`) vive aquí. `src/tesoreria/gastosEngine.ts` es la PROYECCIÓN de
 * liquidación del BLOQUE B (`GastoInmueble`/`gastos_inmuebles`, «no es un
 * segundo motor de gastos») y está cubierta por la batería B (92 tests) —
 * fuera del alcance de esta suite (§12.5 protege `src/tesoreria/*`).
 *
 * No se duplica: `incidenciaCircuitoOperativoEconomico.test.ts` ya cubre el
 * puente OT→GASTO a nivel de circuito (idempotencia y totales). Esta suite
 * aporta la cobertura fina función por función: clasificación de categorías,
 * normalización, resumen económico (explotación/financiación), recurrentes
 * (plantillas, backfill limitado, generación idempotente) y el puente OT a
 * nivel de unidad.
 *
 * Observaciones documentadas (comportamiento real, no se corrige en esta orden):
 *  - `resumenGastos` cuenta `EN_REVISION` como PAGADO (solo distingue
 *    PENDIENTE). Hoy ningún flujo de producción pone gastos en EN_REVISION
 *    (el estado se usa en actas/presupuestos), impacto residual.
 *  - `calcularTotalesGastos.totalDeducible` usa el campo `deducible` (sin
 *    filtro de estado), mientras que `fiscalEngine.esGastoDeducible` lee
 *    `esDeducible` o infiere por categoría: dos conceptos de deducibilidad
 *    distintos por diseño (ver cabecera de `fiscalEngine.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import type {
  CategoriaGasto,
  Gasto,
  GastoRecurrente,
  Inmueble,
  TrabajoProfesional,
} from '../types';
import {
  CATEGORIAS_GASTO,
  ESTADO_GASTO_LABEL,
  FRECUENCIA_LABEL,
  TIPO_GASTO_LABEL,
  buscarGastoDeTrabajo,
  calcularTotalesGastos,
  calcularTotalesPorCategoria,
  calcularTotalGastos,
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
  periodoActual,
  periodoDesdeFecha,
  periodosDebidos,
  puedeGenerarGastoDesdeTrabajo,
  proximoPeriodoRecurrente,
  recurrenteGastoId,
  resumenGastos,
  resumenPorInmueble,
  sincronizarGastoDesdeTrabajo,
  sumarMeses,
  tipoDeCategoria,
} from './gastosEngine';

// ---------- Fixtures ----------

function gasto(p: Partial<Gasto> = {}): Gasto {
  return {
    id: 'gas_1',
    inmuebleId: 'inm-1',
    propietarioId: 'prop-1',
    tipo: 'EXPLOTACION',
    categoria: 'COMUNIDAD',
    concepto: 'Cuota comunidad',
    importe: 100,
    estado: 'PAGADO',
    fechaDevengo: '2026-01-10',
    periodoMesAnio: '2026-01',
    aCargoDe: 'arrendador',
    deducible: true,
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-01-10T10:00:00.000Z',
    ...p,
  } as Gasto;
}

function inmueble(p: Partial<Inmueble> = {}): Inmueble {
  return {
    id: 'inm-1',
    direccion: 'Calle Mayor 1',
    ciudad: 'Alicante',
    precio: 1000,
    estado: 'alquilado',
    habitaciones: 3,
    banos: 1,
    superficie: 90,
    candidatosCount: 0,
    fianzaMeses: 1,
    propietarioId: 'prop-1',
    ...p,
  } as Inmueble;
}

function trabajo(p: Partial<TrabajoProfesional> = {}): TrabajoProfesional {
  return {
    id: 'tr-1',
    propietarioId: 'prop-1',
    inmuebleId: 'inm-1',
    titulo: 'Fuga en baño',
    descripcion: 'Reparación de grifo',
    categoria: 'FONTANERIA',
    prioridad: 'MEDIA',
    estado: 'FINALIZADO',
    fechaSolicitud: '2026-02-01T09:00:00.000Z',
    fechaFinalizacion: '2026-02-11T16:00:00.000Z',
    importeFinal: 220,
    profesionalNombre: 'Fontanero S.L.',
    creadoPor: 'Sistema',
    actualizadoPor: 'Sistema',
    historial: [],
    createdAt: '2026-02-01T09:00:00.000Z',
    updatedAt: '2026-02-11T16:00:00.000Z',
    ...p,
  } as unknown as TrabajoProfesional;
}

function recurrente(p: Partial<GastoRecurrente> = {}): GastoRecurrente {
  return {
    id: 'rec_1',
    inmuebleId: 'inm-1',
    propietarioId: 'prop-1',
    tipo: 'EXPLOTACION',
    categoria: 'COMUNIDAD',
    concepto: 'Cuota comunidad',
    importe: 80,
    frecuencia: 'MENSUAL',
    diaVencimiento: 5,
    fechaInicio: '2026-01',
    aCargoDe: 'arrendador',
    deducible: true,
    metodoPago: 'domiciliacion',
    activo: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...p,
  } as unknown as GastoRecurrente;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    for (const k of Object.getOwnPropertyNames(o)) deepFreeze((o as Record<string, unknown>)[k]);
    Object.freeze(o);
  }
  return o;
}

// ---------- Clasificación de categorías ----------

describe('gastosEngine · clasificación de categorías', () => {
  it('CATEGORIAS_GASTO: 12 definiciones coherentes (9 explotación + 3 financiación)', () => {
    expect(CATEGORIAS_GASTO).toHaveLength(12);
    const tipos = CATEGORIAS_GASTO.map((c) => c.tipo);
    expect(tipos.filter((t) => t === 'EXPLOTACION')).toHaveLength(9);
    expect(tipos.filter((t) => t === 'FINANCIACION')).toHaveLength(3);
    // IDs únicos.
    expect(new Set(CATEGORIAS_GASTO.map((c) => c.value)).size).toBe(12);
  });

  it('tipoDeCategoria: explotación vs financiación según definición', () => {
    expect(tipoDeCategoria('COMUNIDAD')).toBe('EXPLOTACION');
    expect(tipoDeCategoria('IBI')).toBe('EXPLOTACION');
    expect(tipoDeCategoria('REFORMAS' as CategoriaGasto)).toBe('EXPLOTACION');
    expect(tipoDeCategoria('CUOTA_HIPOTECARIA')).toBe('FINANCIACION');
    expect(tipoDeCategoria('INTERESES_PRESTAMO')).toBe('FINANCIACION');
    expect(tipoDeCategoria('OTRO_FINANCIACION')).toBe('FINANCIACION');
  });

  it('categoriaDef: fallback para categorías históricas sin definición (conservador)', () => {
    const def = categoriaDef('OTRO' as CategoriaGasto);
    expect(def.value).toBe('OTRO');
    expect(def.tipo).toBe('EXPLOTACION');
    expect(def.deduciblePorDefecto).toBe(true);
    expect(def.aCargoDePorDefecto).toBe('arrendador');
    expect(categoriaDef('MANTENIMIENTO_REPARACION' as CategoriaGasto).tipo).toBe('EXPLOTACION');
    // La categoría definida sí devuelve su definición real.
    expect(categoriaDef('CUOTA_HIPOTECARIA')).toMatchObject({
      deduciblePorDefecto: false,
      tipo: 'FINANCIACION',
    });
    expect(categoriaDef('SUMINISTROS').aCargoDePorDefecto).toBe('arrendatario');
  });

  it('etiquetas: tipo/estado/frecuencia y mes/año en es-ES', () => {
    expect(TIPO_GASTO_LABEL.EXPLOTACION).toBe('Explotación');
    expect(TIPO_GASTO_LABEL.FINANCIACION).toContain('Financiación');
    expect(ESTADO_GASTO_LABEL.PAGADO).toBe('Pagado');
    expect(FRECUENCIA_LABEL.TRIMESTRAL).toBe('Trimestral');
    expect(etiquetaMesAnio('2026-03')).toBe('marzo de 2026');
    expect(etiquetaMesAnio('2026-01')).toBe('enero de 2026');
    expect(etiquetaMesAnio(undefined)).toBe('Sin período');
    expect(etiquetaMesAnio('no-fecha')).toBe('no-fecha');
  });
});

// ---------- Totales básicos ----------

describe('gastosEngine · calcularTotalGastos / calcularTotalesPorCategoria', () => {
  it('total excluye ANULADO y trata importes nulos como 0', () => {
    expect(
      calcularTotalGastos([
        gasto({ id: 'a', importe: 100 }),
        gasto({ id: 'b', importe: 50, estado: 'ANULADO' }),
        gasto({ id: 'c', importe: 0 }),
        gasto({ id: 'd' }),
      ])
    ).toBe(200);
    expect(calcularTotalGastos([])).toBe(0);
  });

  it('totales por categoría excluyen ANULADO y agrupan', () => {
    const r = calcularTotalesPorCategoria([
      gasto({ id: 'a', categoria: 'COMUNIDAD', importe: 100 }),
      gasto({ id: 'b', categoria: 'COMUNIDAD', importe: 50 }),
      gasto({ id: 'c', categoria: 'REPARACION', importe: 200 }),
      gasto({ id: 'd', categoria: 'COMUNIDAD', importe: 999, estado: 'ANULADO' }),
    ]);
    expect(r.COMUNIDAD).toBe(150);
    expect(r.REPARACION).toBe(200);
    expect(r.IBI).toBeUndefined();
    expect(calcularTotalesPorCategoria([])).toEqual({});
  });
});

// ---------- Construcción y normalización ----------

describe('gastosEngine · crearGasto / normalizarGasto', () => {
  it('crearGasto aplica los valores por defecto de la categoría', () => {
    const g = crearGasto({
      inmuebleId: 'inm-1',
      propietarioId: 'prop-1',
      categoria: 'CUOTA_HIPOTECARIA',
      importe: 900,
      fechaDevengo: '2026-03-15',
    });
    expect(g.id).toMatch(/^gas_inm-1_/);
    expect(g.tipo).toBe('FINANCIACION');
    expect(g.estado).toBe('PENDIENTE');
    expect(g.aCargoDe).toBe('arrendador');
    expect(g.deducible).toBe(false); // financiación nunca deducible por defecto
    expect(g.metodoPago).toBe('transferencia');
    expect(g.periodoMesAnio).toBe('2026-03');
    expect(g.concepto).toBe('Cuota hipotecaria'); // label de la categoría
    expect(g.fechaPago).toBeUndefined();
  });

  it('crearGasto: suma cuenta con arrendatario; importe no numérico → 0; concepto se recorta', () => {
    const s = crearGasto({
      inmuebleId: 'inm-1',
      propietarioId: 'prop-1',
      categoria: 'SUMINISTROS',
      concepto: '   Luz febrero   ',
      importe: undefined as unknown as number,
    });
    expect(s.aCargoDe).toBe('arrendatario');
    expect(s.importe).toBe(0);
    expect(s.concepto).toBe('Luz febrero');
    // Sin fechaDevengo → hoy → período actual.
    expect(s.periodoMesAnio).toBe(periodoActual());
  });

  it('normalizarGasto: coherencia tipo↔categoría, período y estado↔fechaPago', () => {
    const r = normalizarGasto(
      gasto({
        tipo: 'FINANCIACION', // incoherente con COMUNIDAD
        periodoMesAnio: undefined as unknown as string,
        estado: 'PAGADO',
        capitalAmortizado: 500, // no aplica a explotación
        intereses: 100,
        concepto: '  ',
      })
    );
    expect(r.tipo).toBe('EXPLOTACION');
    expect(r.periodoMesAnio).toBe('2026-01'); // desde fechaDevengo
    expect(r.fechaPago).toBe('2026-01-10'); // PAGADO sin fechaPago → fechaDevengo
    expect(r.concepto).toBe('Comunidad de propietarios'); // concepto vacío tras trim → label de la categoría
    expect(r.capitalAmortizado).toBeUndefined(); // se purga fuera de FINANCIACION
    expect(r.intereses).toBeUndefined();
  });

  it('normalizarGasto: PENDIENTE/ANULADO pierden fechaPago; FINANCIACION conserva el desglose', () => {
    const pend = normalizarGasto(gasto({ estado: 'PENDIENTE', fechaPago: '2026-01-20' }));
    expect(pend.fechaPago).toBeUndefined();
    const anul = normalizarGasto(gasto({ estado: 'ANULADO', fechaPago: '2026-01-20' }));
    expect(anul.fechaPago).toBeUndefined();
    const fin = normalizarGasto(
      gasto({
        categoria: 'CUOTA_HIPOTECARIA',
        tipo: 'FINANCIACION',
        capitalAmortizado: 500,
        intereses: 100,
        importe: 600,
      })
    );
    expect(fin.capitalAmortizado).toBe(500);
    expect(fin.intereses).toBe(100);
  });

  it('normalizarGasto no muta la entrada (ausencia de efectos laterales)', () => {
    const g = deepFreeze(gasto({ estado: 'PAGADO' }));
    const antes = JSON.stringify(g);
    normalizarGasto(g);
    expect(JSON.stringify(g)).toBe(antes);
  });
});

// ---------- Resumen económico (explotación vs financiación) ----------

describe('gastosEngine · resumenGastos / resumenPorInmueble', () => {
  it('lista vacía → resumen en cero', () => {
    expect(resumenGastos([])).toEqual({
      numero: 0,
      explotacionPagado: 0,
      financiacionPagado: 0,
      interesesPagado: 0,
      capitalAmortizado: 0,
      pendiente: 0,
      salidaCajaPagada: 0,
    });
  });

  it('ANULADO queda fuera de todo (incluso del número de gastos)', () => {
    const r = resumenGastos([
      gasto({ id: 'a', importe: 100 }),
      gasto({ id: 'b', importe: 500, estado: 'ANULADO' }),
    ]);
    expect(r.numero).toBe(1);
    expect(r.explotacionPagado).toBe(100);
  });

  it('PENDIENTE suma a pendiente y no a salida de caja', () => {
    const r = resumenGastos([
      gasto({ id: 'a', importe: 100 }),
      gasto({ id: 'b', importe: 300, estado: 'PENDIENTE' }),
    ]);
    expect(r.pendiente).toBe(300);
    expect(r.explotacionPagado).toBe(100);
    expect(r.salidaCajaPagada).toBe(100);
  });

  it('FINANCIACIÓN pagada con desglose: capital e intereses se separan (el capital NO es gasto)', () => {
    const r = resumenGastos([
      gasto({
        id: 'h',
        categoria: 'CUOTA_HIPOTECARIA',
        tipo: 'FINANCIACION',
        deducible: false,
        importe: 600,
        capitalAmortizado: 500,
        intereses: 100,
      }),
    ]);
    expect(r.financiacionPagado).toBe(600);
    expect(r.interesesPagado).toBe(100);
    expect(r.capitalAmortizado).toBe(500);
    expect(r.explotacionPagado).toBe(0);
    expect(r.salidaCajaPagada).toBe(600);
  });

  it('FINANCIACIÓN sin desglose: todo se imputa a capital (intereses 0)', () => {
    const r = resumenGastos([
      gasto({ id: 'h', categoria: 'CUOTA_HIPOTECARIA', tipo: 'FINANCIACION', importe: 600 }),
    ]);
    expect(r.financiacionPagado).toBe(600);
    expect(r.interesesPagado).toBe(0);
    expect(r.capitalAmortizado).toBe(600);
  });

  it('invariantes: salidaCajaPagada = explotación + financiación; intereses + capital = cuota (con desglose)', () => {
    const r = resumenGastos([
      gasto({ id: 'a', categoria: 'COMUNIDAD', importe: 100 }),
      gasto({ id: 'b', categoria: 'REPARACION', importe: 250 }),
      gasto({
        id: 'h',
        categoria: 'CUOTA_HIPOTECARIA',
        tipo: 'FINANCIACION',
        importe: 600,
        capitalAmortizado: 520,
        intereses: 80,
      }),
      gasto({ id: 'p', importe: 400, estado: 'PENDIENTE' }),
    ]);
    expect(r.salidaCajaPagada).toBe(r.explotacionPagado + r.financiacionPagado);
    expect(r.interesesPagado + r.capitalAmortizado).toBe(r.financiacionPagado);
    expect(r.pendiente).toBe(400);
  });

  it('comportamiento real documentado: EN_REVISION se contabiliza como PAGADO (solo se distingue PENDIENTE)', () => {
    const r = resumenGastos([gasto({ id: 'x', importe: 150, estado: 'EN_REVISION' })]);
    expect(r.explotacionPagado).toBe(150);
    expect(r.salidaCajaPagada).toBe(150);
    expect(r.pendiente).toBe(0);
  });

  it('resumenPorInmueble agrupa y ordena por salida de caja descendente', () => {
    const r = resumenPorInmueble([
      gasto({ id: 'a', inmuebleId: 'inm-2', importe: 100 }),
      gasto({ id: 'b', inmuebleId: 'inm-1', importe: 500 }),
      gasto({ id: 'c', inmuebleId: 'inm-2', importe: 200, estado: 'PENDIENTE' }),
    ]);
    expect(r.map((x) => x.inmuebleId)).toEqual(['inm-1', 'inm-2']);
    expect(r.find((x) => x.inmuebleId === 'inm-2')!.resumen.explotacionPagado).toBe(100);
    expect(r.find((x) => x.inmuebleId === 'inm-2')!.resumen.pendiente).toBe(200);
    expect(resumenPorInmueble([])).toEqual([]);
  });
});

// ---------- Helpers de fechas/periodos e IDs ----------

describe('gastosEngine · período, meses e IDs', () => {
  it('periodoActual: formato YYYY-MM del mes en curso', () => {
    const ahora = new Date();
    expect(periodoActual(ahora)).toBe(
      `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
    );
  });

  it('sumarMeses cruza años y admite pasos negativos', () => {
    expect(sumarMeses('2026-11', 3)).toBe('2027-02');
    expect(sumarMeses('2026-01', -1)).toBe('2025-12');
    expect(sumarMeses('2026-03', 12)).toBe('2027-03');
    expect(sumarMeses('2026-03', 0)).toBe('2026-03');
  });

  it('periodoDesdeFecha: YYYY-MM; con hora; inválida → undefined', () => {
    expect(periodoDesdeFecha('2026-03-15')).toBe('2026-03');
    expect(periodoDesdeFecha('2026-03-15T10:30:00Z')).toBe('2026-03');
    expect(periodoDesdeFecha(undefined)).toBeUndefined();
    expect(periodoDesdeFecha('no-fecha')).toBeUndefined();
  });

  it('nuevoGastoId: prefijo gas_, segmento saneado, único por llamada', () => {
    expect(nuevoGastoId('inm-1')).toMatch(/^gas_inm-1_\d+_[a-z0-9]{4}$/);
    expect(nuevoGastoId('inm/1!')).toMatch(/^gas_inm_1__\d+_[a-z0-9]{4}$/);
    expect(nuevoGastoId('a')).not.toBe(nuevoGastoId('a'));
  });

  it('recurrenteGastoId: ID determinista del apunte por plantilla y período', () => {
    expect(recurrenteGastoId('rec_1', 2026, 3)).toBe('grec_rec_1_2026_03');
    expect(recurrenteGastoId('rec/1!', 2026, 12)).toBe('grec_rec_1__2026_12');
    // Determinismo: misma entrada, mismo ID (base de la idempotencia).
    expect(recurrenteGastoId('rec_1', 2026, 3)).toBe(recurrenteGastoId('rec_1', 2026, 3));
  });
});

// ---------- Gastos recurrentes (plantillas) ----------

describe('gastosEngine · plantillas recurrentes', () => {
  it('crearGastoRecurrente: valores por defecto (mensual, día 1, período actual, domiciliación)', () => {
    const r = crearGastoRecurrente({
      inmuebleId: 'inm-1',
      propietarioId: 'prop-1',
      categoria: 'CUOTA_HIPOTECARIA',
      importe: 900,
    });
    expect(r.id).toMatch(/^rec_inm-1_/);
    expect(r.frecuencia).toBe('MENSUAL');
    expect(r.diaVencimiento).toBe(1);
    expect(r.fechaInicio).toBe(periodoActual());
    expect(r.metodoPago).toBe('domiciliacion');
    expect(r.activo).toBe(true);
    expect(r.deducible).toBe(false); // financiación
    expect(r.tipo).toBe('FINANCIACION');
  });

  it('normalizarRecurrente: día limitado a [1,28], tipo coherente, deducible forzado a false en financiación', () => {
    expect(normalizarRecurrente(recurrente({ diaVencimiento: 0 })).diaVencimiento).toBe(1);
    expect(normalizarRecurrente(recurrente({ diaVencimiento: 99 })).diaVencimiento).toBe(28);
    expect(normalizarRecurrente(recurrente({ diaVencimiento: undefined as unknown as number })).diaVencimiento).toBe(1);
    const hip = normalizarRecurrente(
      recurrente({ categoria: 'CUOTA_HIPOTECARIA', tipo: 'EXPLOTACION', deducible: true })
    );
    expect(hip.tipo).toBe('FINANCIACION');
    expect(hip.deducible).toBe(false); // fuerza false aunque declare true
    expect(normalizarRecurrente(recurrente({ importe: undefined as unknown as number })).importe).toBe(0);
  });

  it('periodosDebidos: mensual desde el inicio hasta el mes dado (incluido)', () => {
    expect(periodosDebidos(recurrente({ fechaInicio: '2026-03' }), '2026-06')).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
    // Inicio posterior a `hasta` → nada debido.
    expect(periodosDebidos(recurrente({ fechaInicio: '2026-07' }), '2026-06')).toEqual([]);
  });

  it('periodosDebidos: paso trimestral y límite de fechaFin', () => {
    expect(periodosDebidos(recurrente({ frecuencia: 'TRIMESTRAL', fechaInicio: '2026-01' }), '2026-12')).toEqual([
      '2026-01',
      '2026-04',
      '2026-07',
      '2026-10',
    ]);
    expect(
      periodosDebidos(recurrente({ fechaInicio: '2026-01', fechaFin: '2026-03' }), '2026-12')
    ).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('periodosDebidos: backfill limitado a 12 meses y cursor ultimoPeriodoGenerado respeta lo ya materializado', () => {
    const viejo = recurrente({ fechaInicio: '2025-01' });
    const debidos = periodosDebidos(viejo, '2026-09');
    expect(debidos[debidos.length - 1]).toBe('2026-09');
    expect(debidos).toHaveLength(12); // ventana MAX_MESES_BACKFILL (hasta + 11 meses previos)
    expect(debidos[0]).toBe('2025-10');

    const conCursor = recurrente({ fechaInicio: '2026-01', ultimoPeriodoGenerado: '2026-04' });
    expect(periodosDebidos(conCursor, '2026-06')).toEqual(['2026-05', '2026-06']);
  });

  it('materializarGastoRecurrente: apunte PENDIENTE con ID determinista y vencimiento del día de la plantilla', () => {
    const a = materializarGastoRecurrente(recurrente({ importe: 80 }), '2026-03');
    const b = materializarGastoRecurrente(recurrente({ importe: 80 }), '2026-03');
    expect(a.id).toBe('grec_rec_1_2026_03');
    expect(a.estado).toBe('PENDIENTE');
    expect(a.importe).toBe(80);
    expect(a.fechaDevengo).toBe('2026-03-05');
    expect(a.periodoMesAnio).toBe('2026-03');
    expect(a.creadoPor).toBe('Sistema');
    expect(a.creadoPorId).toBe('rec_1');
    expect(a.concepto).toContain('marzo de 2026');
    // Determinismo económico (solo cambian createdAt/updatedAt).
    const eco = (g: Gasto) => ({ id: g.id, importe: g.importe, estado: g.estado, fechaDevengo: g.fechaDevengo });
    expect(eco(b)).toEqual(eco(a));
    // Día fuera de rango → limitado a 28.
    expect(materializarGastoRecurrente(recurrente({ diaVencimiento: 40 }), '2026-03').fechaDevengo).toBe('2026-03-28');
  });

  it('generarGastosRecurrentes: idempotente (los apuntes ya existentes no se regeneran)', () => {
    const plantilla = recurrente({ fechaInicio: '2026-07' });
    const ref = new Date(2026, 8, 15); // septiembre de 2026
    const r1 = generarGastosRecurrentes([plantilla], [], ref);
    expect(r1.gastos.map((g) => g.id)).toEqual(['grec_rec_1_2026_07', 'grec_rec_1_2026_08', 'grec_rec_1_2026_09']);
    expect(r1.plantillasActualizadas[0].ultimoPeriodoGenerado).toBe('2026-09');

    // Segunda ejecución con los gastos generados → nada nuevo.
    const r2 = generarGastosRecurrentes(r1.plantillasActualizadas, r1.gastos, ref);
    expect(r2.gastos).toEqual([]);
    expect(r2.plantillasActualizadas).toEqual([]);
  });

  it('generarGastosRecurrentes: plantilla inactiva se ignora y la mezcla de frecuencias funciona', () => {
    const ref = new Date(2026, 8, 15); // 2026-09
    const mensual = recurrente({ id: 'rec_m', fechaInicio: '2026-09' });
    const trimestral = recurrente({ id: 'rec_t', frecuencia: 'TRIMESTRAL', fechaInicio: '2026-07' });
    const inactiva = recurrente({ id: 'rec_x', activo: false, fechaInicio: '2026-09' });
    const r = generarGastosRecurrentes([mensual, trimestral, inactiva], [], ref);
    expect(r.gastos.map((g) => g.id)).toEqual(['grec_rec_m_2026_09', 'grec_rec_t_2026_07']);
    expect(r.gastos.every((g) => g.estado === 'PENDIENTE')).toBe(true);
  });

  it('proximoPeriodoRecurrente: primero el pendiente actual; sin deudas, la siguiente ocurrencia futura', () => {
    const conPendiente = recurrente({ fechaInicio: '2026-08' });
    expect(proximoPeriodoRecurrente(conPendiente, new Date(2026, 8, 15))).toBe('2026-08');

    const alDia = recurrente({
      frecuencia: 'TRIMESTRAL',
      fechaInicio: '2026-01',
      ultimoPeriodoGenerado: '2026-07',
    });
    expect(proximoPeriodoRecurrente(alDia, new Date(2026, 8, 15))).toBe('2026-10');
  });
});

// ---------- Puente OT → GASTO (unidad) ----------

describe('gastosEngine · puente Orden de Trabajo → Gasto', () => {
  it('puedeGenerarGastoDesdeTrabajo: todas las condiciones de elegibilidad', () => {
    expect(puedeGenerarGastoDesdeTrabajo(null)).toMatchObject({ valido: false });
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ estado: 'EN_CURSO' as unknown as never }))).toMatchObject({
      valido: false,
      motivo: expect.stringContaining('no está finalizada'),
    });
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ estado: 'FINALIZADA' as unknown as never }))).toMatchObject({ valido: true });
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ estado: 'COMPLETADO' as unknown as never }))).toMatchObject({ valido: true });
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ importeFinal: 0 }))).toMatchObject({
      valido: false,
      motivo: expect.stringContaining('mayor que cero'),
    });
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ importeFinal: NaN }))).toMatchObject({ valido: false });
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ inmuebleId: '' }))).toMatchObject({
      valido: false,
      motivo: expect.stringContaining('inmueble'),
    });
    // Propietario rescatado del inmueble (propietarioId o propietarioPrincipalId).
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ propietarioId: '' }), [inmueble()])).toMatchObject({ valido: true });
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ propietarioId: '' }), [
      inmueble({ propietarioId: undefined as unknown as string, propietarioPrincipalId: 'pp-9' }),
    ])).toMatchObject({ valido: true });
    expect(puedeGenerarGastoDesdeTrabajo(trabajo({ propietarioId: '' }), [
      inmueble({ propietarioId: undefined as unknown as string }),
    ])).toMatchObject({ valido: false, motivo: expect.stringContaining('propietario') });
  });

  it('buscarGastoDeTrabajo: encuentra por trabajoId, ordenTrabajoId, origenId o id embebido', () => {
    expect(buscarGastoDeTrabajo('tr-1', [gasto({ id: 'g1', trabajoId: 'tr-1' })])).toBeDefined();
    expect(buscarGastoDeTrabajo('tr-1', [gasto({ id: 'g1', ordenTrabajoId: 'tr-1' })])).toBeDefined();
    expect(buscarGastoDeTrabajo('tr-1', [gasto({ id: 'g1', origenId: 'tr-1' })])).toBeDefined();
    expect(
      buscarGastoDeTrabajo('tr-1', [gasto({ id: 'g_ot_tr-1_final', origen: 'ORDEN_TRABAJO' })])
    ).toBeDefined();
    expect(buscarGastoDeTrabajo('tr-1', [gasto({ id: 'g1', trabajoId: 'tr-2' })])).toBeUndefined();
    expect(buscarGastoDeTrabajo(undefined, [gasto({ id: 'g1', trabajoId: 'tr-1' })])).toBeUndefined();
  });

  it('generarGastoDesdeTrabajo: crea el gasto contable con trazabilidad completa', () => {
    const r = generarGastoDesdeTrabajo({
      trabajo: trabajo({ profesionalId: 'prof-1' }),
      inmuebles: [inmueble()],
      usuarioNombre: 'Ana García',
    });
    expect(r.yaExiste).toBe(false);
    expect(r.error).toBeUndefined();
    const g = r.gasto!;
    expect(g.categoria).toBe('REPARACION');
    expect(g.tipo).toBe('EXPLOTACION');
    expect(g.importe).toBe(220);
    expect(g.estado).toBe('PAGADO');
    expect(g.fechaDevengo).toBe('2026-02-11'); // de fechaFinalizacion
    expect(g.fechaPago).toBe('2026-02-11');
    expect(g.periodoMesAnio).toBe('2026-02');
    expect(g.proveedor).toBe('Fontanero S.L.');
    expect(g.deducible).toBe(true);
    expect(g.aCargoDe).toBe('arrendador');
    expect(g.origen).toBe('ORDEN_TRABAJO');
    expect(g.origenId).toBe('tr-1');
    expect(g.trabajoId).toBe('tr-1');
    expect(g.ordenTrabajoId).toBe('tr-1');
    expect(g.creadoPor).toBe('Ana García');
    expect(g.concepto).toContain('Fuga en baño');
  });

  it('generarGastoDesdeTrabajo: MANTENIMIENTO_PREVENTIVO → categoría MANTENIMIENTO; estado a elegir', () => {
    const r = generarGastoDesdeTrabajo({
      trabajo: trabajo({ tipoTrabajo: 'MANTENIMIENTO_PREVENTIVO' as never }),
      inmuebles: [inmueble()],
      estadoGasto: 'PENDIENTE',
    });
    expect(r.gasto!.categoria).toBe('MANTENIMIENTO');
    expect(r.gasto!.estado).toBe('PENDIENTE');
    expect(r.gasto!.fechaPago).toBeUndefined();
  });

  it('generarGastoDesdeTrabajo: idempotencia — si ya existe el gasto del OT, se devuelve el existente', () => {
    const existente = gasto({ id: 'g_ot_tr-1', trabajoId: 'tr-1', origen: 'ORDEN_TRABAJO', importe: 220 });
    const r = generarGastoDesdeTrabajo({
      trabajo: trabajo(),
      inmuebles: [inmueble()],
      gastosExistentes: [existente],
    });
    expect(r.yaExiste).toBe(true);
    expect(r.gasto).toBe(existente);
  });

  it('generarGastoDesdeTrabajo: OT inelegible → error con motivo, sin gasto', () => {
    const r = generarGastoDesdeTrabajo({
      trabajo: trabajo({ estado: 'EN_CURSO' as unknown as never }),
      inmuebles: [inmueble()],
    });
    expect(r.yaExiste).toBe(false);
    expect(r.gasto).toBeUndefined();
    expect(r.error).toContain('no está finalizada');
  });

  it('sincronizarGastoDesdeTrabajo: actualiza importe y trazabilidad sin cambiar el ID', () => {
    const g = gasto({ id: 'g_ot_tr-1', trabajoId: 'tr-1', importe: 220 });
    const sync = sincronizarGastoDesdeTrabajo({
      trabajo: trabajo({ importeFinal: 260 }),
      gastoExistente: g,
    });
    expect(sync.id).toBe('g_ot_tr-1');
    expect(sync.importe).toBe(260);
    expect(sync.fechaDevengo).toBe('2026-02-11');
    expect(sync.periodoMesAnio).toBe('2026-02');
    expect(sync.proveedor).toBe('Fontanero S.L.');
    // Sin importeFinal válido → conserva el importe; la fecha sigue la de la OT.
    const sinImporte = sincronizarGastoDesdeTrabajo({
      trabajo: trabajo({ importeFinal: 0 }),
      gastoExistente: g,
    });
    expect(sinImporte.importe).toBe(220);
    expect(sinImporte.fechaDevengo).toBe('2026-02-11'); // de fechaFinalizacion de la OT
    // Si la OT no tiene fechaFinalizacion → conserva la fecha del gasto existente.
    const sinFechaOT = sincronizarGastoDesdeTrabajo({
      trabajo: trabajo({ importeFinal: 0, fechaFinalizacion: undefined as unknown as string }),
      gastoExistente: g,
    });
    expect(sinFechaOT.fechaDevengo).toBe('2026-01-10');
    // No muta la entrada.
    expect(g.importe).toBe(220);
  });
});

// ---------- Totales de reporting y filtros ----------

describe('gastosEngine · filtrarGastosPorInmueble / calcularTotalesGastos', () => {
  it('filtrarGastosPorInmueble: solo el inmueble indicado', () => {
    expect(filtrarGastosPorInmueble([gasto({ inmuebleId: 'inm-1' }), gasto({ id: 'b', inmuebleId: 'inm-X' })], 'inm-1')).toHaveLength(1);
    expect(filtrarGastosPorInmueble([], 'inm-1')).toEqual([]);
  });

  it('calcularTotalesGastos: deducible sin filtro de estado; pagado solo con estado PAGADO', () => {
    const r = calcularTotalesGastos([
      gasto({ id: 'a', deducible: true, importe: 100 }), // PAGADO deducible
      gasto({ id: 'b', deducible: false, importe: 50, estado: 'PAGADO' }), // PAGADO no deducible
      gasto({ id: 'c', deducible: true, importe: 30, estado: 'PENDIENTE' }), // pendiente deducible: cuenta en deducible
      gasto({ id: 'd', deducible: true, importe: 20, estado: 'ANULADO' }), // anulado deducible: cuenta en deducible (comportamiento real)
    ]);
    expect(r.totalDeducible).toBe(150); // a + c + d
    expect(r.totalPagado).toBe(150); // a + b
    expect(r.porCategoria.COMUNIDAD).toBe(200); // suma todo, incluido el ANULADO
  });
});
