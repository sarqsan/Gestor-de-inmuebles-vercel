/**
 * GAP-R4 — Suite propia de `cobrosEngine` (motor de cobros base).
 *
 * Cobertura directa a nivel de unidad de la interfaz económica central que
 * consumen BLOQUE B, C, GAP6 y E (`registrarPagoPeriodo` es la única vía de
 * escritura sobre los periodos, §12.5 del MAPA).
 *
 * NO duplica:
 *  - `habitacionesEconomia.test.ts` / `habitacionesCircuitoComercial.test.ts`
 *    (economía por habitación, payload cruzado, idempotencia de generación);
 *  - `contratoCicloGAP2.test.ts` (ciclo contractual y corte por fecha de fin);
 *  - `morosidadStore.test.ts` (vía canónica PAGADA a través del store de C).
 *
 * Determinismo: toda la lógica de fechas usa `fechaRef` inyectable; cuando el
 * motor usa `new Date()` internamente (rango de generación), los fixtures
 * fijan un contrato FINALIZADO con rango 2026-01..2026-03 para que el conjunto
 * de periodos sea estable independientemente de la fecha de ejecución.
 */
import { describe, expect, it } from 'vitest';
import type {
  CobroPeriodo,
  ContratoFormalizacion,
  EstadoCobroAlquiler,
  Inmueble,
  JustificanteCobro,
  UsuarioApp,
} from '../types';
import {
  MESES_NOMBRES,
  actualizarEstadosVencimiento,
  asegurarContratoCobros,
  calcularAvisosCobros,
  calcularDiasRetraso,
  calcularResumenCobros,
  claveIdempotenteCobro,
  cobrosPorHabitacion,
  contratosIngresosSegunModalidad,
  diasHastaFecha,
  estaVencido,
  generarPeriodosParaContrato,
  generarResumenFiscalInmueble,
  obtenerCobrosInmueble,
  obtenerTodosCobros,
  registrarIncidenciaPeriodo,
  registrarPagoPeriodo,
} from './cobrosEngine';

// ---------- Fixtures ----------

const pad = (n: number) => String(n).padStart(2, '0');

function contrato(p: Partial<ContratoFormalizacion> = {}): ContratoFormalizacion {
  return {
    id: 'c1',
    candidatoId: 'cand-1',
    inmuebleId: 'inm-1',
    propietarioId: 'prop-1',
    inmuebleNombre: 'Piso Centro',
    inmuebleDireccion: 'Calle Mayor 1',
    inmuebleCiudad: 'Alicante',
    propietarioNombre: 'Propietario Uno',
    propietarioDni: '11111111A',
    propietarioDireccion: 'Calle Prop 2',
    propietarioTelefono: '600000001',
    propietarioEmail: 'prop@ejemplo.com',
    propietarioIban: 'ES91 2100 0457 4001 0200 0572',
    candidatoNombre: 'Inquilino Uno',
    candidatoDni: '22222222B',
    candidatoTelefono: '600000002',
    candidatoEmail: 'cand@ejemplo.com',
    rentaMensual: 800,
    fianzaLegalMeses: 1,
    fianzaLegalImporte: 800,
    garantiaAdicionalMeses: 0,
    garantiaAdicionalImporte: 0,
    // Rango estable y terminado: enero–marzo 2026 (todo en el pasado desde la
    // fecha canónica), de forma que la generación no dependa de `new Date()`.
    fechaInicioContrato: '2026-01-01',
    fechaFinContrato: '2026-03-31',
    esVigente: false,
    duracionAnios: 1,
    diaLimitePagoMes: 5,
    permitirMascotas: false,
    permitirSubarriendo: false,
    incluyeMueblesInventario: false,
    gastosComunidadCargo: 'arrendatario',
    ibiCargo: 'arrendador',
    suministrosCargo: 'arrendatario',
    clausulaDesistimientoAnticipado: true,
    clausulasPersonalizadas: [],
    estado: 'FIRMADO' as ContratoFormalizacion['estado'],
    evaluacionAsegurabilidad: {
      puntuacion: 0,
      nivelRiesgo: 'BAJO',
      detalles: [],
    } as unknown as ContratoFormalizacion['evaluacionAsegurabilidad'],
    actaEntregaLlaves: {
      entregado: false,
      fecha: '',
      notas: '',
    } as unknown as ContratoFormalizacion['actaEntregaLlaves'],
    firmaArrendador: { firmado: true },
    firmaArrendatario: { firmado: true },
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    fechaActualizacion: '2026-01-01T00:00:00.000Z',
    historial: [],
    ...p,
  } as unknown as ContratoFormalizacion;
}

function periodo(p: Partial<CobroPeriodo> = {}): CobroPeriodo {
  return {
    id: 'cobro_c1_2026_02',
    inmuebleId: 'inm-1',
    contratoId: 'c1',
    inquilinoId: 'cand-1',
    propietarioId: 'prop-1',
    mes: 2,
    anio: 2026,
    periodoMesAnio: '2026-02',
    nombreMes: 'Febrero 2026',
    importePrevisto: 800,
    importeRecibido: 0,
    fechaVencimiento: '2026-02-05',
    estado: 'PENDIENTE',
    historialCambios: [],
    ...p,
  } as CobroPeriodo;
}

const USUARIO: UsuarioApp = {
  id: 'u1',
  nombre: 'Ana García',
  email: 'ana@ejemplo.com',
  tipoPerfil: 'ADMINISTRADOR',
  estado: 'ACTIVO',
  roles: ['admin'],
  permisos: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as UsuarioApp;

function inmueble(p: Partial<Inmueble> = {}): Inmueble {
  return {
    id: 'inm-1',
    direccion: 'Calle Mayor 1',
    ciudad: 'Alicante',
    precio: 800,
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

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    for (const k of Object.getOwnPropertyNames(o)) deepFreeze((o as Record<string, unknown>)[k]);
    Object.freeze(o);
  }
  return o;
}

/** Estructura económica de un periodo (sin IDs de historial aleatorios ni marcas de tiempo). */
function firmaEconomica(cobs: CobroPeriodo[]) {
  return cobs.map((c) => ({
    id: c.id,
    periodoMesAnio: c.periodoMesAnio,
    mes: c.mes,
    anio: c.anio,
    nombreMes: c.nombreMes,
    importePrevisto: c.importePrevisto,
    importeRecibido: c.importeRecibido,
    fechaVencimiento: c.fechaVencimiento,
    estado: c.estado,
  }));
}

// ---------- Fechas y vencimientos ----------

describe('cobrosEngine · fechas y vencimientos', () => {
  const ref = new Date(2026, 8, 15); // 2026-09-15 (local)

  it('diasHastaFecha: negativo = ya pasó, 0 = hoy, positivo = faltan; fechas inválidas → null', () => {
    expect(diasHastaFecha('2026-09-10', ref)).toBe(-5);
    expect(diasHastaFecha('2026-09-15', ref)).toBe(0);
    expect(diasHastaFecha('2026-09-20', ref)).toBe(5);
    // Comportamiento real del motor: solo acepta cadenas a fecha (YYYY-MM-DD);
    // un sufijo de hora produce una fecha inválida → null.
    expect(diasHastaFecha('2026-09-15T23:59:59', ref)).toBeNull();
    expect(diasHastaFecha('no-es-fecha', ref)).toBeNull();
    expect(diasHastaFecha('', ref)).toBeNull();
  });

  it('calcularDiasRetraso: días completos tras el vencimiento; 0 en vencimiento/antes; 0 si fecha inválida', () => {
    expect(calcularDiasRetraso('2026-01-01', '2026-01-11')).toBe(10);
    expect(calcularDiasRetraso('2026-01-11', '2026-01-11')).toBe(0);
    expect(calcularDiasRetraso('2026-01-11', '2026-01-01')).toBe(0);
    expect(calcularDiasRetraso('mala-fecha', '2026-01-11')).toBe(0);
  });

  it('estaVencido: solo si la referencia es estrictamente posterior; inválida → false', () => {
    expect(estaVencido('2026-01-01', '2026-01-02')).toBe(true);
    expect(estaVencido('2026-01-01', '2026-01-01')).toBe(false);
    expect(estaVencido('2026-01-01', '2025-12-31')).toBe(false);
    expect(estaVencido('mala-fecha', '2026-01-01')).toBe(false);
  });
});

// ---------- Generación de periodos ----------

describe('cobrosEngine · generarPeriodosParaContrato (motor)', () => {
  it('genera el rango estable enero–marzo 2026 con claves, importes y vencimiento correctos', () => {
    const periodos = generarPeriodosParaContrato(contrato());
    expect(periodos).toHaveLength(3);
    expect(periodos.map((p) => p.id)).toEqual([
      'cobro_c1_2026_01',
      'cobro_c1_2026_02',
      'cobro_c1_2026_03',
    ]);
    expect(periodos.map((p) => p.periodoMesAnio)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(periodos.map((p) => p.nombreMes)).toEqual([
      `${MESES_NOMBRES[0]} 2026`,
      `${MESES_NOMBRES[1]} 2026`,
      `${MESES_NOMBRES[2]} 2026`,
    ]);
    // Vencimiento según diaLimitePagoMes (5) y mes/año de cada periodo.
    expect(periodos.map((p) => p.fechaVencimiento)).toEqual([
      '2026-01-05',
      '2026-02-05',
      '2026-03-05',
    ]);
    // Importe previsto = renta contratada; meses pasados nacen RETRASADO.
    expect(periodos.every((p) => p.importePrevisto === 800 && p.importeRecibido === 0)).toBe(true);
    expect(periodos.every((p) => p.estado === 'RETRASADO')).toBe(true);
    // Orden cronológico ascendente y claves únicas.
    expect(periodos.map((p) => p.periodoMesAnio)).toEqual(
      [...periodos].map((p) => p.periodoMesAnio).sort()
    );
    expect(new Set(periodos.map((p) => p.periodoMesAnio)).size).toBe(3);
    // Desnormalización informativa heredada del contrato.
    expect(periodos[0].inmuebleId).toBe('inm-1');
    expect(periodos[0].contratoId).toBe('c1');
    expect(periodos[0].inquilinoId).toBe('cand-1');
    expect(periodos[0].inquilinoNombre).toBe('Inquilino Uno');
    expect(periodos[0].historialCambios).toHaveLength(1); // creación por sistema
  });

  it('diaLimitePagoMes: valores falsy (0/undefined) → 5; el rango efectivo queda limitado a [1, 28]', () => {
    const dia = (c: ContratoFormalizacion) => generarPeriodosParaContrato(c)[0].fechaVencimiento;
    expect(dia(contrato({ diaLimitePagoMes: 0 }))).toBe('2026-01-05'); // 0 || 5
    expect(dia(contrato({ diaLimitePagoMes: 1 }))).toBe('2026-01-01');
    expect(dia(contrato({ diaLimitePagoMes: -5 }))).toBe('2026-01-01'); // limitado abajo
    expect(dia(contrato({ diaLimitePagoMes: 28 }))).toBe('2026-01-28');
    expect(dia(contrato({ diaLimitePagoMes: 99 }))).toBe('2026-01-28'); // limitado arriba
    expect(dia(contrato({ diaLimitePagoMes: undefined as unknown as number }))).toBe('2026-01-05');
  });

  it('REGLA ESTRICTA: los periodos existentes NO se recalculan aunque cambie la renta', () => {
    const existente = periodo({
      id: 'cobro_c1_2026_01',
      periodoMesAnio: '2026-01',
      nombreMes: 'Enero 2026',
      mes: 1,
      fechaVencimiento: '2026-01-05',
      importePrevisto: 700, // renta original, antes de una modificación a 800
      importeRecibido: 700,
      estado: 'RECIBIDO',
      fechaPago: '2026-01-04',
      historialCambios: [
        {
          id: 'hist_fijo',
          fecha: '2026-01-04T10:00:00.000Z',
          accion: 'Registro de pago recibido',
          estadoAnterior: 'RETRASADO',
          estadoNuevo: 'RECIBIDO',
        },
      ],
    });
    const trasCambio = generarPeriodosParaContrato(
      contrato({ registroCobros: [existente] }) // rentaMensual sigue siendo 800
    );
    const enero = trasCambio.find((p) => p.periodoMesAnio === '2026-01');
    expect(enero?.importePrevisto).toBe(700); // no se recalcula
    expect(enero?.importeRecibido).toBe(700);
    expect(enero?.estado).toBe('RECIBIDO');
    expect(enero?.historialCambios).toHaveLength(1);
    expect(enero?.historialCambios[0].id).toBe('hist_fijo');
    // El resto se genera con la renta vigente.
    expect(trasCambio.find((p) => p.periodoMesAnio === '2026-02')?.importePrevisto).toBe(800);
    expect(trasCambio).toHaveLength(3);
  });

  it('un periodo existente sin habitacionId hereda la habitacionId del contrato', () => {
    const existente = periodo({
      id: 'cobro_c1_2026_01',
      periodoMesAnio: '2026-01',
      mes: 1,
      nombreMes: 'Enero 2026',
      fechaVencimiento: '2026-01-05',
      estado: 'RETRASADO',
    });
    const tras = generarPeriodosParaContrato(
      contrato({ habitacionId: 'h-7', registroCobros: [existente] })
    );
    expect(tras.find((p) => p.periodoMesAnio === '2026-01')?.habitacionId).toBe('h-7');
    expect(tras.find((p) => p.periodoMesAnio === '2026-02')?.habitacionId).toBe('h-7');
  });

  it('sin fechaInicioContrato el rango empieza en enero del año actual', () => {
    const hoy = new Date();
    const periodos = generarPeriodosParaContrato(
      contrato({ fechaInicioContrato: undefined as unknown as string })
    );
    expect(periodos.length).toBeGreaterThan(0);
    expect(periodos[0].anio).toBe(hoy.getFullYear());
    expect(periodos[0].mes).toBe(1);
  });

  it('el rango futuro se limita a hoy + limiteMesesFuturos (por defecto 2)', () => {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = hoy.getMonth() + 1; // 1-12
    const clave = (yy: number, mm: number) => `${yy}-${pad(mm)}`;
    const add = (delta: number) => {
      const mm = m + delta;
      return clave(y + Math.floor((mm - 1) / 12), ((mm - 1) % 12) + 1);
    };
    const base = {
      fechaInicioContrato: `${y}-${pad(m)}-01`,
      fechaFinContrato: undefined as unknown as string,
      esVigente: true as const,
    };
    const defecto = generarPeriodosParaContrato(contrato(base));
    expect(defecto[0].periodoMesAnio).toBe(clave(y, m));
    expect(defecto[defecto.length - 1].periodoMesAnio).toBe(add(2));
    expect(defecto).toHaveLength(3);
    const cero = generarPeriodosParaContrato(contrato(base), 0);
    expect(cero).toHaveLength(1);
    expect(cero[0].periodoMesAnio).toBe(clave(y, m));
  });

  it('es determinista: dos ejecuciones sobre el mismo contrato producen la misma estructura económica', () => {
    const a = generarPeriodosParaContrato(contrato());
    const b = generarPeriodosParaContrato(contrato());
    expect(firmaEconomica(b)).toEqual(firmaEconomica(a));
  });

  it('no muta el contrato de entrada (ausencia de efectos laterales)', () => {
    const c = deepFreeze(contrato({ registroCobros: [periodo({ estado: 'RECIBIDO', importeRecibido: 800 })] }));
    const antes = JSON.stringify(c);
    const periodos = generarPeriodosParaContrato(c);
    expect(JSON.stringify(c)).toBe(antes);
    expect(periodos).toHaveLength(3);
  });
});

// ---------- Sincronización de estados por vencimiento ----------

describe('cobrosEngine · actualizarEstadosVencimiento', () => {
  it('PENDIENTE vencido más allá de la gracia → RETRASADO con trazabilidad (única transición automática)', () => {
    const c = contrato({
      registroCobros: [periodo({ fechaVencimiento: '2026-02-05' })], // PENDIENTE
    });
    const r = actualizarEstadosVencimiento(c, new Date(2026, 1, 10)); // 2026-02-10 → -5 días
    const feb = r.periodos.find((p) => p.periodoMesAnio === '2026-02');
    expect(r.cambiosEstado).toBe(1);
    expect(feb?.estado).toBe('RETRASADO');
    expect(feb?.historialCambios[0]).toMatchObject({
      accion: 'Vencimiento superado sin pago registrado',
      usuarioNombre: 'Sistema',
      estadoAnterior: 'PENDIENTE',
      estadoNuevo: 'RETRASADO',
    });
    expect(feb?.historialCambios[0].detalles).toContain('Febrero 2026');
    expect(feb?.ultimaModificacion).toBeDefined();
    // Los meses que faltan se completan (generación).
    expect(r.periodosNuevos).toBe(2);
    expect(r.periodos).toHaveLength(3);
    expect(r.necesitaGuardado).toBe(true);
    expect(r.contratoActualizado.fechaActualizacion).toBeDefined();
  });

  it('PENDIENTE dentro del margen de cortesía → NO cambia de estado', () => {
    const c = contrato({
      registroCobros: [periodo({ fechaVencimiento: '2026-02-09' })],
    });
    const r = actualizarEstadosVencimiento(c, new Date(2026, 1, 10)); // -1 día, gracia 2
    expect(r.cambiosEstado).toBe(0);
    expect(r.periodos.find((p) => p.periodoMesAnio === '2026-02')?.estado).toBe('PENDIENTE');
  });

  it('un periodo total o parcialmente pagado nunca se marca RETRASADO', () => {
    const completo = contrato({
      registroCobros: [periodo({ fechaVencimiento: '2026-02-05', importeRecibido: 800 })],
    });
    expect(actualizarEstadosVencimiento(completo, new Date(2026, 1, 15)).cambiosEstado).toBe(0);
    const parcial = contrato({
      registroCobros: [periodo({ fechaVencimiento: '2026-02-05', importeRecibido: 300 })],
    });
    // Parcial < previsto → sigue siendo impago: SÍ transiciona.
    expect(actualizarEstadosVencimiento(parcial, new Date(2026, 1, 15)).cambiosEstado).toBe(1);
  });

  it('RECIBIDO / VERIFICADO / INCIDENCIA nunca se modifican (aunque estén vencidos)', () => {
    const estados: EstadoCobroAlquiler[] = ['RECIBIDO', 'VERIFICADO', 'INCIDENCIA'];
    const c = contrato({
      registroCobros: [
        periodo({ id: 'cobro_c1_2026_01', periodoMesAnio: '2026-01', mes: 1, nombreMes: 'Enero 2026', estado: 'RECIBIDO' }),
        periodo({ id: 'cobro_c1_2026_02', periodoMesAnio: '2026-02', mes: 2, estado: 'VERIFICADO' }),
        periodo({ id: 'cobro_c1_2026_03', periodoMesAnio: '2026-03', mes: 3, nombreMes: 'Marzo 2026', estado: 'INCIDENCIA' }),
      ],
    });
    const r = actualizarEstadosVencimiento(c, new Date(2026, 4, 1));
    expect(r.cambiosEstado).toBe(0);
    r.periodos.forEach((p, i) => {
      expect(p.estado).toBe(estados[i]);
      expect(p.historialCambios).toHaveLength(0);
    });
  });

  it('el margen de cortesía es parametrizable (diasGracia=0 transiciona al día siguiente)', () => {
    const c = contrato({ registroCobros: [periodo({ fechaVencimiento: '2026-02-09' })] });
    const cero = actualizarEstadosVencimiento(c, new Date(2026, 1, 10), 0);
    expect(cero.cambiosEstado).toBe(1);
    const gracia2 = actualizarEstadosVencimiento(c, new Date(2026, 1, 10), 2);
    expect(gracia2.cambiosEstado).toBe(0);
  });

  it('re-ejecutar sobre un periodo ya RETRASADO no duplica la trazabilidad', () => {
    const c = contrato({ registroCobros: [periodo({ fechaVencimiento: '2026-02-05' })] });
    const r1 = actualizarEstadosVencimiento(c, new Date(2026, 1, 10));
    const feb1 = r1.periodos.find((p) => p.periodoMesAnio === '2026-02')!;
    const r2 = actualizarEstadosVencimiento(
      { ...c, registroCobros: r1.periodos },
      new Date(2026, 1, 10)
    );
    const feb2 = r2.periodos.find((p) => p.periodoMesAnio === '2026-02')!;
    expect(feb2.historialCambios).toHaveLength(feb1.historialCambios.length);
    expect(r2.cambiosEstado).toBe(0);
    expect(r2.necesitaGuardado).toBe(false);
  });

  it('complementa los periodos faltantes del rango (periodosNuevos)', () => {
    const r = actualizarEstadosVencimiento(contrato(), new Date(2026, 0, 15));
    expect(r.periodosNuevos).toBe(3);
    expect(r.periodos).toHaveLength(3);
    expect(r.necesitaGuardado).toBe(true);
  });

  it('si nada cambia → necesitaGuardado=false y se conserva fechaActualizacion', () => {
    const base = contrato({ fechaActualizacion: '2020-05-05T00:00:00.000Z' });
    const completos = generarPeriodosParaContrato(base); // todos RETRASADO (pasado)
    const c = { ...base, registroCobros: completos };
    const r = actualizarEstadosVencimiento(c, new Date(2026, 4, 1));
    expect(r.cambiosEstado).toBe(0);
    expect(r.periodosNuevos).toBe(0);
    expect(r.necesitaGuardado).toBe(false);
    expect(r.contratoActualizado.fechaActualizacion).toBe('2020-05-05T00:00:00.000Z');
  });
});

// ---------- Avisos de seguimiento ----------

describe('cobrosEngine · calcularAvisosCobros', () => {
  const REF = new Date(2026, 8, 15); // 2026-09-15
  const base = {
    inmuebleId: 'inm-1',
    contratoId: 'c1',
    inquilinoId: 'cand-1',
    propietarioId: 'prop-1',
    inmuebleDireccion: 'Calle Mayor 1',
    inquilinoNombre: 'Inquilino Uno',
  };
  const cobro = (p: Partial<CobroPeriodo>): CobroPeriodo =>
    periodo({ ...base, ...p });

  it('INCIDENCIA con importe pendiente → aviso crítico con motivo y pendiente en €', () => {
    const avisos = calcularAvisosCobros(
      [cobro({ id: 'i1', estado: 'INCIDENCIA', motivoIncidencia: 'Disputa de daños', importeRecibido: 300, fechaVencimiento: '2026-09-12' })],
      REF
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ tipo: 'incidencia', nivel: 'critico' });
    expect(avisos[0].detalle).toContain('Pendiente 500.00 €');
    expect(avisos[0].detalle).toContain('Disputa de daños');
    expect(avisos[0].cobro.id).toBe('i1');
  });

  it('RETRASADO o PENDIENTE fuera de gracia, impagados → «vencida» crítica', () => {
    const avisos = calcularAvisosCobros(
      [
        cobro({ id: 'r1', estado: 'RETRASADO', fechaVencimiento: '2026-08-20' }),
        cobro({ id: 'p1', estado: 'PENDIENTE', fechaVencimiento: '2026-09-10' }), // -5
      ],
      REF
    );
    expect(avisos.map((a) => a.tipo)).toEqual(['vencida', 'vencida']);
    expect(avisos.every((a) => a.nivel === 'critico')).toBe(true);
    expect(avisos[1].detalle).toContain('Venció el 2026-09-10');
  });

  it('PENDIENTE dentro de la gracia → «en_plazo_gracia» de advertencia', () => {
    const avisos = calcularAvisosCobros(
      [cobro({ id: 'g1', estado: 'PENDIENTE', fechaVencimiento: '2026-09-14' })], // -1
      REF
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ tipo: 'en_plazo_gracia', nivel: 'advertencia' });
    expect(avisos[0].detalle).toContain('margen de 2 días');
  });

  it('PENDIENTE a punto de vencer (≤ diasAviso) → «vence_pronto» informativo; hoy dice «vence hoy»', () => {
    const avisos = calcularAvisosCobros(
      [
        cobro({ id: 'h1', estado: 'PENDIENTE', fechaVencimiento: '2026-09-15' }), // hoy
        cobro({ id: 'p5', estado: 'PENDIENTE', fechaVencimiento: '2026-09-20' }), // +5
      ],
      REF
    );
    expect(avisos.map((a) => a.titulo)).toEqual(['La renta vence hoy', 'La renta vence en 5 días']);
    expect(avisos.every((a) => a.tipo === 'vence_pronto' && a.nivel === 'info')).toBe(true);
  });

  it('pagados (recibido ≥ previsto) y fechas lejanas no generan aviso; fecha inválida → sin aviso', () => {
    const avisos = calcularAvisosCobros(
      [
        cobro({ id: 'ok', estado: 'RETRASADO', importeRecibido: 800, fechaVencimiento: '2026-08-01' }),
        cobro({ id: 'lejos', estado: 'PENDIENTE', fechaVencimiento: '2026-09-25' }), // +10 > 5
        cobro({ id: 'inv', estado: 'PENDIENTE', fechaVencimiento: 'no-fecha' }),
      ],
      REF
    );
    expect(avisos).toHaveLength(0);
  });

  it('ordenación: crítico → advertencia → info; dentro del nivel, por días; días nulos al final', () => {
    const avisos = calcularAvisosCobros(
      [
        cobro({ id: 'p5', estado: 'PENDIENTE', fechaVencimiento: '2026-09-20' }),
        cobro({ id: 'hoy', estado: 'PENDIENTE', fechaVencimiento: '2026-09-15' }),
        cobro({ id: 'gracia', estado: 'PENDIENTE', fechaVencimiento: '2026-09-14' }),
        cobro({ id: 'retr-nulo', estado: 'RETRASADO', fechaVencimiento: 'no-fecha' }),
        cobro({ id: 'inc', estado: 'INCIDENCIA', motivoIncidencia: 'x', importeRecibido: 300, fechaVencimiento: '2026-09-12' }),
        cobro({ id: 'pend-retr', estado: 'PENDIENTE', fechaVencimiento: '2026-09-10' }),
        cobro({ id: 'retr', estado: 'RETRASADO', fechaVencimiento: '2026-08-20' }),
      ],
      REF
    );
    expect(avisos.map((a) => a.cobro.id)).toEqual([
      'retr', // -26
      'pend-retr', // -5
      'inc', // -3
      'retr-nulo', // null → 9999 (fin del bloque crítico)
      'gracia', // advertencia
      'hoy', // info 0
      'p5', // info +5
    ]);
  });
});

// ---------- Resumen agregado ----------

describe('cobrosEngine · calcularResumenCobros', () => {
  const cobro = (p: Partial<CobroPeriodo>): CobroPeriodo => periodo(p);

  it('lista vacía → todos los totales en cero y porcentaje 0', () => {
    const r = calcularResumenCobros([]);
    expect(r.totalPrevisto).toBe(0);
    expect(r.totalRecibido).toBe(0);
    expect(r.porcentajeCobrado).toBe(0);
    expect(r.totalPeriodos).toBe(0);
  });

  it('totales, conteos por estado (incluye alias PAGADO/VERIFICADO) y porcentaje redondeado', () => {
    const just: JustificanteCobro = { id: 'j1', nombreArchivo: 'f.pdf', fechaSubida: '2026-01-06' };
    const r = calcularResumenCobros([
      cobro({ id: 'a', estado: 'PENDIENTE', importePrevisto: 800, importeRecibido: 0 }),
      cobro({ id: 'b', estado: 'RECIBIDO', importePrevisto: 800, importeRecibido: 800, justificante: just }),
      cobro({ id: 'c', estado: 'RETRASADO', importePrevisto: 800, importeRecibido: 300 }),
      cobro({ id: 'd', estado: 'INCIDENCIA', importePrevisto: 800, importeRecibido: 200 }),
      cobro({ id: 'e', estado: 'VERIFICADO', importePrevisto: 800, importeRecibido: 800 }),
      cobro({ id: 'f', estado: 'PAGADO', importePrevisto: 800, importeRecibido: 800 }),
    ]);
    expect(r.totalPrevisto).toBe(4800);
    expect(r.totalRecibido).toBe(2900);
    expect(r.totalPendiente).toBe(800);
    expect(r.totalRetrasado).toBe(500);
    expect(r.totalIncidencias).toBe(600);
    expect(r.countCobrados).toBe(3); // RECIBIDO + VERIFICADO + PAGADO
    expect(r.countPendientes).toBe(1);
    expect(r.countRetrasados).toBe(1);
    expect(r.countIncidencias).toBe(1);
    expect(r.countConJustificante).toBe(1);
    expect(r.totalPeriodos).toBe(6);
    expect(r.porcentajeCobrado).toBe(60); // 2900/4800 = 60.42 → 60
    // Redondeo en casos fraccionados.
    expect(calcularResumenCobros([cobro({ id: 'x', estado: 'PENDIENTE', importePrevisto: 100, importeRecibido: 33 })]).porcentajeCobrado).toBe(33);
  });

  it('invariante económica: previsto − recibido = pendiente + retrasado + incidencias (datos bien formados)', () => {
    const cobs = [
      cobro({ id: 'a', estado: 'PENDIENTE', importePrevisto: 800, importeRecibido: 0 }),
      cobro({ id: 'b', estado: 'RECIBIDO', importePrevisto: 800, importeRecibido: 800 }),
      cobro({ id: 'c', estado: 'RETRASADO', importePrevisto: 550.5, importeRecibido: 100.25 }),
      cobro({ id: 'd', estado: 'INCIDENCIA', importePrevisto: 120, importeRecibido: 120 }),
      cobro({ id: 'e', estado: 'PENDIENTE', importePrevisto: 999.99, importeRecibido: 0.01 }),
    ];
    const r = calcularResumenCobros(cobs);
    expect(r.totalPendiente + r.totalRetrasado + r.totalIncidencias).toBeCloseTo(
      r.totalPrevisto - r.totalRecibido,
      6
    );
  });
});

// ---------- registrarPagoPeriodo (única vía de escritura) ----------

describe('cobrosEngine · registrarPagoPeriodo', () => {
  const ID_FEB = 'cobro_c1_2026_02'; // periodo base: RETRASADO 800/0 (generado)

  it('pago completo → RECIBIDO con trazabilidad completa', () => {
    const c = contrato();
    const r = registrarPagoPeriodo(
      c,
      ID_FEB,
      { importeRecibido: 800, fechaPago: '2026-02-10' },
      USUARIO
    );
    const feb = r.registroCobros!.find((p) => p.id === ID_FEB)!;
    expect(feb.estado).toBe('RECIBIDO');
    expect(feb.importeRecibido).toBe(800);
    expect(feb.fechaPago).toBe('2026-02-10');
    expect(feb.metodoPago).toBe('transferencia'); // valor por defecto
    expect(feb.registradoPor).toBe('Ana García');
    expect(feb.registradoPorId).toBe('u1');
    expect(feb.fechaRegistro).toBeDefined();
    expect(feb.ultimaModificacion).toBeDefined();
    expect(feb.historialCambios[0]).toMatchObject({
      accion: 'Registro de pago recibido',
      estadoAnterior: 'RETRASADO',
      estadoNuevo: 'RECIBIDO',
      importeAnterior: 0,
      importeNuevo: 800,
      usuarioId: 'u1',
      usuarioNombre: 'Ana García',
    });
    expect(feb.historialCambios[0].detalles).toBe('Cobro de 800 € registrado el 2026-02-10');
    expect(r.fechaActualizacion).toBeDefined();
    // Los demás periodos quedan intactos.
    const enero = r.registroCobros!.find((p) => p.periodoMesAnio === '2026-01')!;
    expect(enero.estado).toBe('RETRASADO');
    expect(enero.historialCambios).toHaveLength(1); // solo la creación
  });

  it('pago parcial → INCIDENCIA por defecto; el estado explícito se respeta', () => {
    const parcial = registrarPagoPeriodo(contrato(), ID_FEB, {
      importeRecibido: 300,
      fechaPago: '2026-02-10',
    });
    expect(parcial.registroCobros!.find((p) => p.id === ID_FEB)!.estado).toBe('INCIDENCIA');
    const explicito = registrarPagoPeriodo(contrato(), ID_FEB, {
      importeRecibido: 800,
      fechaPago: '2026-02-10',
      estado: 'VERIFICADO',
    });
    expect(explicito.registroCobros!.find((p) => p.id === ID_FEB)!.estado).toBe('VERIFICADO');
  });

  it('pago superior al previsto → RECIBIDO (comparación >=, no estricta)', () => {
    const r = registrarPagoPeriodo(contrato(), ID_FEB, {
      importeRecibido: 900,
      fechaPago: '2026-02-10',
    });
    expect(r.registroCobros!.find((p) => p.id === ID_FEB)!.estado).toBe('RECIBIDO');
    expect(r.registroCobros!.find((p) => p.id === ID_FEB)!.importeRecibido).toBe(900);
  });

  it('caso cero válido: renta 0 → periodo 0 € y pago de 0 € → RECIBIDO', () => {
    const r = registrarPagoPeriodo(
      contrato({ rentaMensual: 0 }),
      ID_FEB,
      { importeRecibido: 0, fechaPago: '2026-02-10' }
    );
    const feb = r.registroCobros!.find((p) => p.id === ID_FEB)!;
    expect(feb.importePrevisto).toBe(0);
    expect(feb.importeRecibido).toBe(0);
    expect(feb.estado).toBe('RECIBIDO'); // 0 >= 0
  });

  it('periodoId desconocido → devuelve el contrato sin modificar (misma referencia)', () => {
    const c = contrato();
    const r = registrarPagoPeriodo(c, 'cobro_c1_1999_01', {
      importeRecibido: 100,
      fechaPago: '2026-02-10',
    });
    expect(r).toBe(c);
  });

  it('modificación de pago: trazabilidad append (la más reciente primero) y conserva fechaRegistro', () => {
    const r1 = registrarPagoPeriodo(contrato(), ID_FEB, {
      importeRecibido: 800,
      fechaPago: '2026-02-10',
      metodoPago: 'bizum',
      referenciaBancaria: 'REF-123',
      justificante: { id: 'j1', nombreArchivo: 'f.pdf', fechaSubida: '2026-02-10' },
      observaciones: 'Pago inicial',
    });
    const p1 = r1.registroCobros!.find((p) => p.id === ID_FEB)!;
    const r2 = registrarPagoPeriodo(r1, ID_FEB, {
      importeRecibido: 500,
      fechaPago: '2026-02-12',
    });
    const p2 = r2.registroCobros!.find((p) => p.id === ID_FEB)!;
    // 3 entradas: creación del periodo + registro de pago + modificación.
    expect(p2.historialCambios).toHaveLength(3);
    expect(p2.historialCambios[0]).toMatchObject({
      accion: 'Modificación de pago',
      importeAnterior: 800,
      importeNuevo: 500,
      estadoAnterior: 'RECIBIDO',
      estadoNuevo: 'INCIDENCIA', // 500 < 800
    });
    expect(p2.historialCambios[1].accion).toBe('Registro de pago recibido');
    expect(p2.historialCambios[2].accion).toBe('Periodo generado según contrato vigente');
    // Persistencia de campos entre modificaciones.
    expect(p2.fechaRegistro).toBe(p1.fechaRegistro);
    expect(p2.metodoPago).toBe('bizum');
    expect(p2.referenciaBancaria).toBe('REF-123');
    expect(p2.justificante?.id).toBe('j1');
    expect(p2.observaciones).toBe('Pago inicial');
    expect(p2.ultimaModificacion).toBeDefined();
  });

  it('sin usuario → atribución «Administrador»', () => {
    const r = registrarPagoPeriodo(contrato(), ID_FEB, {
      importeRecibido: 800,
      fechaPago: '2026-02-10',
    });
    const feb = r.registroCobros!.find((p) => p.id === ID_FEB)!;
    expect(feb.registradoPor).toBe('Administrador');
    expect(feb.historialCambios[0].usuarioNombre).toBe('Administrador');
  });

  it('determinismo económico: misma entrada → mismo resultado económico (solo cambian marcas de tiempo)', () => {
    const a = registrarPagoPeriodo(contrato(), ID_FEB, { importeRecibido: 800, fechaPago: '2026-02-10' });
    const b = registrarPagoPeriodo(contrato(), ID_FEB, { importeRecibido: 800, fechaPago: '2026-02-10' });
    const fe = (x: ContratoFormalizacion) =>
      x.registroCobros!.map((p) => ({
        id: p.id,
        estado: p.estado,
        importeRecibido: p.importeRecibido,
        fechaPago: p.fechaPago,
        metodoPago: p.metodoPago,
      }));
    expect(fe(b)).toEqual(fe(a));
  });

  it('no muta el contrato de entrada (ausencia de efectos laterales)', () => {
    const c = deepFreeze(contrato());
    const antes = JSON.stringify(c);
    const r = registrarPagoPeriodo(c, ID_FEB, { importeRecibido: 800, fechaPago: '2026-02-10' }, USUARIO);
    expect(JSON.stringify(c)).toBe(antes);
    expect(r).not.toBe(c);
  });
});

// ---------- Incidencias de cobro ----------

describe('cobrosEngine · registrarIncidenciaPeriodo', () => {
  it('marca INCIDENCIA con motivo y trazabilidad inmutable', () => {
    const c = contrato();
    const r = registrarIncidenciaPeriodo(
      c,
      'cobro_c1_2026_02',
      'Fuga de agua no resuelta',
      USUARIO
    );
    const feb = r.registroCobros!.find((p) => p.id === 'cobro_c1_2026_02')!;
    expect(feb.estado).toBe('INCIDENCIA');
    expect(feb.motivoIncidencia).toBe('Fuga de agua no resuelta');
    expect(feb.historialCambios[0]).toMatchObject({
      accion: 'Incidencia de cobro reportada',
      estadoAnterior: 'RETRASADO',
      estadoNuevo: 'INCIDENCIA',
      detalles: 'Fuga de agua no resuelta',
      usuarioNombre: 'Ana García',
    });
    // El importe no se toca al declarar una incidencia.
    expect(feb.importeRecibido).toBe(0);
  });

  it('periodoId desconocido → contrato sin modificar; no muta la entrada', () => {
    const c = deepFreeze(contrato());
    const antes = JSON.stringify(c);
    const r = registrarIncidenciaPeriodo(c, 'cobro_c1_1999_01', 'motivo');
    expect(r).toBe(c);
    expect(JSON.stringify(c)).toBe(antes);
  });
});

// ---------- Asegurado y acceso a periodos ----------

describe('cobrosEngine · asegurarContratoCobros / obtenerCobrosInmueble / obtenerTodosCobros', () => {
  it('asegurarContratoCobros completa el registro vacío y es idempotente', () => {
    const r1 = asegurarContratoCobros(contrato());
    expect(r1.registroCobros).toHaveLength(3);
    const r2 = asegurarContratoCobros(r1);
    expect(r2.registroCobros!.map((p) => p.id)).toEqual(r1.registroCobros!.map((p) => p.id));
    expect(r2.registroCobros![0].historialCambios).toHaveLength(1); // no se duplica la creación
  });

  it('obtenerCobrosInmueble: solo el inmueble indicado, orden descendente, genera si falta', () => {
    const otro = contrato({ id: 'cX', inmuebleId: 'inm-X' });
    const todos = obtenerCobrosInmueble('inm-1', [contrato(), otro]);
    expect(todos).toHaveLength(3);
    expect(todos.every((p) => p.inmuebleId === 'inm-1')).toBe(true);
    expect(todos.map((p) => p.periodoMesAnio)).toEqual(['2026-03', '2026-02', '2026-01']);
  });

  it('obtenerTodosCobros: fusión descendente sin deduplicar (histórico completo)', () => {
    const c1 = contrato();
    const c2 = contrato({
      id: 'c2',
      candidatoId: 'cand-2',
      candidatoNombre: 'Inquilino Dos',
      fechaInicioContrato: '2026-01-01',
      fechaFinContrato: '2026-02-28',
      rentaMensual: 500,
    });
    const todos = obtenerTodosCobros([c1, c2]);
    expect(todos).toHaveLength(5); // 3 (c1) + 2 (c2)
    expect(todos[0].periodoMesAnio).toBe('2026-03');
    const enero = todos.filter((p) => p.periodoMesAnio === '2026-01');
    expect(enero).toHaveLength(2); // ambos contratos conservan su tramo
    expect(new Set(enero.map((p) => p.contratoId)).size).toBe(2);
  });
});

// ---------- Resumen fiscal anual por inmueble ----------

describe('cobrosEngine · generarResumenFiscalInmueble', () => {
  const INM = inmueble({
    referenciaCatastral: 'REF-TOP',
    datosFiscales: {
      referenciaCatastral: 'REF-DF',
      propietarioPrincipal: { nombre: 'PF Uno', nifDni: '11111111A', direccion: 'Calle X' },
    },
  });

  const c1 = () =>
    contrato({
      registroCobros: [
        periodo({
          id: 'cobro_c1_2026_01', periodoMesAnio: '2026-01', mes: 1, nombreMes: 'Enero 2026',
          fechaVencimiento: '2026-01-05', estado: 'RECIBIDO', importeRecibido: 800,
          fechaPago: '2026-01-04',
          justificante: { id: 'jA', nombreArchivo: 'a.pdf', fechaSubida: '2026-01-06' },
        }),
        periodo({
          id: 'cobro_c1_2026_02', periodoMesAnio: '2026-02', mes: 2,
          fechaVencimiento: '2026-02-05', estado: 'RETRASADO', importeRecibido: 300,
        }),
        periodo({
          id: 'cobro_c1_2026_03', periodoMesAnio: '2026-03', mes: 3, nombreMes: 'Marzo 2026',
          fechaVencimiento: '2026-03-05', estado: 'PENDIENTE',
        }),
      ],
    });

  const c2 = () =>
    contrato({
      id: 'c2',
      candidatoId: 'cand-2',
      candidatoNombre: 'Inquilino Dos',
      rentaMensual: 500,
      fechaInicioContrato: '2026-04-01',
      fechaFinContrato: '2026-06-30',
      // importePrevisto congelado en 500 (renta de c2) — REGLA ESTRICTA.
      registroCobros: [
        periodo({
          id: 'cobro_c2_2026_04', periodoMesAnio: '2026-04', mes: 4, nombreMes: 'Abril 2026',
          fechaVencimiento: '2026-04-05', estado: 'RECIBIDO', importePrevisto: 500, importeRecibido: 500,
        }),
        periodo({
          id: 'cobro_c2_2026_05', periodoMesAnio: '2026-05', mes: 5, nombreMes: 'Mayo 2026',
          fechaVencimiento: '2026-05-05', estado: 'INCIDENCIA', importePrevisto: 500, importeRecibido: 100,
        }),
        periodo({
          id: 'cobro_c2_2026_06', periodoMesAnio: '2026-06', mes: 6, nombreMes: 'Junio 2026',
          fechaVencimiento: '2026-06-05', estado: 'PENDIENTE', importePrevisto: 500,
        }),
      ],
    });

  const c2025 = () =>
    contrato({
      id: 'c3',
      candidatoId: 'cand-3',
      rentaMensual: 600,
      fechaInicioContrato: '2025-11-01',
      fechaFinContrato: '2025-12-31',
    });

  it('inmueble desconocido → null', () => {
    expect(generarResumenFiscalInmueble('inm-desconocido', 2026, [INM], [c1()])).toBeNull();
  });

  it('agrega el año por tramos de contrato (cambios de inquilino/renta se conservan)', () => {
    const r = generarResumenFiscalInmueble('inm-1', 2026, [INM], [
      c1(),
      c2(),
      c2025(), // 2025 → no entra en el año 2026
      contrato({ id: 'cX', inmuebleId: 'inm-X', fechaInicioContrato: '2026-01-01' }),
    ]);
    expect(r).not.toBeNull();
    expect(r!.anio).toBe(2026);
    expect(r!.totalAnualPrevisto).toBe(3 * 800 + 3 * 500); // 3900
    expect(r!.totalAnualCobrado).toBe(800 + 300 + 500 + 100); // 1700
    expect(r!.totalAnualPendiente).toBe(500 + 800 + 500); // Feb + Mar + Jun
    expect(r!.totalAnualIncidencias).toBe(400); // May
    expect(r!.mesesCobradosCount).toBe(2); // enero (c1) + abril (c2)
    expect(r!.justificantesCount).toBe(1);
    expect(r!.contratosPeriodos).toHaveLength(2);
    const [t1, t2] = r!.contratosPeriodos;
    expect(t1.contratoId).toBe('c1');
    expect(t1.subtotalCobrado).toBe(1100);
    expect(t1.meses).toHaveLength(3);
    expect(t2.contratoId).toBe('c2');
    expect(t2.subtotalCobrado).toBe(600);
    expect(t2.meses).toHaveLength(3);
    expect(t2.inquilinoNombre).toBe('Inquilino Dos');
    // Cabecera del inmueble.
    expect(r!.referenciaCatastral).toBe('REF-TOP'); // top-level tiene prioridad
    expect(r!.propietarioNombre).toBe('PF Uno');
    expect(r!.propietarioId).toBe('prop-1');
  });

  it('el filtro es estrictamente anual: 2025 no entra en 2026 y un año vacío da totales en cero', () => {
    const r2025 = generarResumenFiscalInmueble('inm-1', 2025, [INM], [c1(), c2(), c2025()]);
    expect(r2025!.contratosPeriodos.map((t) => t.contratoId)).toEqual(['c3']);
    expect(r2025!.totalAnualPrevisto).toBe(2 * 600);
    const rVacio = generarResumenFiscalInmueble('inm-1', 2030, [INM], [c1()]);
    expect(rVacio!.totalAnualPrevisto).toBe(0);
    expect(rVacio!.totalAnualCobrado).toBe(0);
    expect(rVacio!.contratosPeriodos).toHaveLength(0);
  });

  it('fallbacks: propietario «Propietario» y referencia desde datosFiscales si no hay top-level', () => {
    const sinDatos = inmueble({
      id: 'inm-2',
      datosFiscales: {
        referenciaCatastral: 'REF-DF-2',
        propietarioPrincipal: { nombre: 'PF Dos', nifDni: '33333333C', direccion: 'Calle Y' },
      },
      propietarioId: undefined as unknown as string,
      propietarioPrincipalId: 'pp-9',
    });
    const r = generarResumenFiscalInmueble('inm-2', 2026, [sinDatos], []);
    expect(r!.propietarioNombre).toBe('PF Dos');
    expect(r!.propietarioId).toBe('pp-9'); // propietarioPrincipalId como respaldo
    expect(r!.referenciaCatastral).toBe('REF-DF-2');
    const sinNada = inmueble({ id: 'inm-3', propietarioId: undefined as unknown as string });
    const r2 = generarResumenFiscalInmueble('inm-3', 2026, [sinNada], []);
    expect(r2!.propietarioNombre).toBe('Propietario');
    expect(r2!.propietarioId).toBe('');
    expect(r2!.referenciaCatastral).toBeUndefined();
  });
});

// ---------- Modalidad, habitaciones e idempotencia de claves ----------

describe('cobrosEngine · modalidad / habitaciones / claves idempotentes', () => {
  it('contratosIngresosSegunModalidad no mezcla modelos (habitaciones vs completo)', () => {
    const sinHab = contrato({ id: 'c1' });
    const conHab = contrato({ id: 'c2', habitacionId: 'h1' });
    expect(
      contratosIngresosSegunModalidad(inmueble({ modalidadAlquiler: 'habitaciones' }), [sinHab, conHab])
        .map((c) => c.id)
    ).toEqual(['c2']);
    expect(
      contratosIngresosSegunModalidad(inmueble({ modalidadAlquiler: 'completo' }), [sinHab, conHab])
        .map((c) => c.id)
    ).toEqual(['c1']);
    // Modalidad sin declarar → se tratan como alquiler completo.
    expect(
      contratosIngresosSegunModalidad(inmueble({ modalidadAlquiler: undefined }), [sinHab, conHab])
        .map((c) => c.id)
    ).toEqual(['c1']);
    // Inmueble sin contratos → vacío.
    expect(contratosIngresosSegunModalidad(inmueble({ id: 'inm-X' }), [sinHab])).toHaveLength(0);
  });

  it('cobrosPorHabitacion filtra únicamente los periodos de la habitación', () => {
    const a = periodo({ id: 'pa', habitacionId: 'h1' });
    const b = periodo({ id: 'pb', habitacionId: 'h2' });
    const c = periodo({ id: 'pc' });
    expect(cobrosPorHabitacion([a, b, c], 'h1').map((p) => p.id)).toEqual(['pa']);
    expect(cobrosPorHabitacion([a, b, c], 'hX')).toHaveLength(0);
  });

  it('claveIdempotenteCobro coincide con el id que genera el motor', () => {
    expect(claveIdempotenteCobro('c1', '2026-02')).toBe('cobro_c1_2026_02');
    const generados = generarPeriodosParaContrato(contrato());
    for (const p of generados) {
      expect(claveIdempotenteCobro(p.contratoId, p.periodoMesAnio)).toBe(p.id);
    }
  });
});
