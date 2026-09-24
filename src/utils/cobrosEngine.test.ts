/**
 * GAP-R4 — Suite propia del motor de cobros (`cobrosEngine.ts`).
 *
 * Objetivo: red de seguridad determinista sobre la interfaz económica central
 * (consumida por Tesorería B, Morosidad C, Conciliación GAP6, Portal E, Reporting GAP3
 * y `registrarPagoPeriodo`). Solo prueba el motor: sin UI, sin Firebase, sin red.
 *
 * Reloj: las funciones que dependen de `new Date()` (generación de periodos, registro
 * de pagos) se ejecutan con reloj congelado en 2026-09-21 12:00 (hora local) mediante
 * `vi.setSystemTime`, construido con el constructor local para no depender de la TZ.
 * Las fechas de contrato de los fixtures se sitúan a mitad de mes: el motor parsea el ISO
 * como UTC y lee el mes local, por lo que fechas a día 1 cambiarían de mes en TZ negativas.
 *
 * No se duplican los tests de integración de habitaciones (`habitacionesEconomia.test.ts`)
 * ni del ciclo de contrato (`contratoCicloGAP2.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CobroPeriodo,
  ContratoFormalizacion,
  EstadoCobroAlquiler,
  Inmueble,
  UsuarioApp,
} from '../types';
import {
  DIAS_AVISO_VENCIMIENTO,
  DIAS_GRACIA_RETRASO,
  MESES_NOMBRES,
  actualizarEstadosVencimiento,
  calcularAvisosCobros,
  calcularDiasRetraso,
  calcularResumenCobros,
  claveIdempotenteCobro,
  cobrosPorHabitacion,
  contratosIngresosSegunModalidad,
  diasHastaFecha,
  estaVencido,
  generarPeriodosIdempotente,
  generarPeriodosParaContrato,
  generarResumenFiscalInmueble,
  historialEconomicoHabitacion,
  impagoAisladoEntreHabitaciones,
  ingresosInmuebleDesdeCircuito,
  obtenerCobrosInmueble,
  obtenerTodosCobros,
  payloadEconomicoIdsCruzadosDenegado,
  registrarIncidenciaPeriodo,
  registrarPagoPeriodo,
  rentabilidadInmuebleDesdeCircuito,
} from './cobrosEngine';

// ---------------------------------------------------------------------------
// Fixtures mínimos
// ---------------------------------------------------------------------------

/** Reloj de referencia de toda la suite: 21/09/2026 12:00 hora local. */
const HOY = new Date(2026, 8, 21, 12, 0, 0);

const contrato = (p: Partial<ContratoFormalizacion> = {}): ContratoFormalizacion =>
  ({
    id: 'c1',
    candidatoId: 'inq1',
    candidatoNombre: 'Ana',
    candidatoDni: '00000000T',
    inmuebleId: 'inm1',
    inmuebleDireccion: 'Calle Mayor 1',
    inmuebleCiudad: 'Madrid',
    propietarioId: 'prop1',
    propietarioNombre: 'Pedro',
    rentaMensual: 800,
    fechaInicioContrato: '2026-06-15',
    esVigente: true,
    diaLimitePagoMes: 5,
    modalidadAlquiler: 'completo',
    estado: 'FORMALIZADO_ACTIVO',
    fechaCreacion: '2026-06-15T00:00:00.000Z',
    fechaActualizacion: '2026-06-15T00:00:00.000Z',
    historial: [],
    ...p,
  }) as ContratoFormalizacion;

const cobro = (p: Partial<CobroPeriodo> = {}): CobroPeriodo =>
  ({
    id: `cobro_c1_2026_${String(p.mes ?? 6).padStart(2, '0')}`,
    inmuebleId: 'inm1',
    contratoId: 'c1',
    inquilinoId: 'inq1',
    propietarioId: 'prop1',
    inmuebleDireccion: 'Calle Mayor 1',
    inquilinoNombre: 'Ana',
    mes: 6,
    anio: 2026,
    periodoMesAnio: '2026-06',
    nombreMes: 'Junio 2026',
    importePrevisto: 800,
    importeRecibido: 0,
    fechaVencimiento: '2026-06-05',
    estado: 'PENDIENTE',
    historialCambios: [],
    ...p,
  }) as CobroPeriodo;

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
    modalidadAlquiler: 'completo',
    valorAdquisicion: 120000,
    ...p,
  }) as Inmueble;

const usuario = (p: Partial<UsuarioApp> = {}): UsuarioApp =>
  ({
    id: 'u1',
    nombre: 'Gestora',
    email: 'g@erp.test',
    tipoPerfil: 'ADMINISTRADOR',
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    createdAt: '',
    updatedAt: '',
    ...p,
  }) as UsuarioApp;

/** Elimina los campos no deterministas (ids/fechas de historial) para comparar periodos. */
const sinRuido = (periodos: CobroPeriodo[]) =>
  periodos.map(({ historialCambios, ...resto }) => ({
    ...resto,
    nHistorial: historialCambios?.length ?? 0,
  }));

const snapshot = (v: unknown) => JSON.stringify(v);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HOY);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Constantes y helpers de calendario
// ---------------------------------------------------------------------------

describe('cobrosEngine · constantes y calendario', () => {
  it('constantes de negocio: 12 meses, aviso 5 días, gracia 2 días', () => {
    expect(MESES_NOMBRES).toHaveLength(12);
    expect(MESES_NOMBRES[0]).toBe('Enero');
    expect(MESES_NOMBRES[11]).toBe('Diciembre');
    expect(DIAS_AVISO_VENCIMIENTO).toBe(5);
    expect(DIAS_GRACIA_RETRASO).toBe(2);
  });

  it('diasHastaFecha: hoy = 0, futuro positivo, pasado negativo', () => {
    expect(diasHastaFecha('2026-09-21', HOY)).toBe(0);
    expect(diasHastaFecha('2026-09-26', HOY)).toBe(5);
    expect(diasHastaFecha('2026-09-18', HOY)).toBe(-3);
  });

  it('diasHastaFecha: compara días de calendario, la hora de la referencia no altera el resultado', () => {
    const madrugada = new Date(2026, 8, 21, 0, 0, 1);
    const noche = new Date(2026, 8, 21, 23, 59, 59);
    expect(diasHastaFecha('2026-09-22', madrugada)).toBe(1);
    expect(diasHastaFecha('2026-09-22', noche)).toBe(1);
  });

  it('diasHastaFecha: entradas vacías o inválidas devuelven null (no NaN ni excepción)', () => {
    expect(diasHastaFecha('', HOY)).toBeNull();
    expect(diasHastaFecha('no-es-fecha', HOY)).toBeNull();
  });

  it('calcularDiasRetraso: 0 si no ha vencido, días completos si ha vencido, 0 si la fecha es inválida', () => {
    expect(calcularDiasRetraso('2026-09-25', '2026-09-21')).toBe(0);
    expect(calcularDiasRetraso('2026-09-21', '2026-09-21')).toBe(0);
    expect(calcularDiasRetraso('2026-09-10', '2026-09-21')).toBe(11);
    expect(calcularDiasRetraso('basura', '2026-09-21')).toBe(0);
  });

  it('estaVencido: estrictamente posterior; mismo instante no vence; inválida → false', () => {
    expect(estaVencido('2026-09-05', '2026-09-21')).toBe(true);
    expect(estaVencido('2026-09-21', '2026-09-21')).toBe(false);
    expect(estaVencido('2026-10-05', '2026-09-21')).toBe(false);
    expect(estaVencido('', '2026-09-21')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Generación de periodos
// ---------------------------------------------------------------------------

describe('cobrosEngine · generarPeriodosParaContrato', () => {
  it('genera desde el mes de inicio hasta hoy + 2 meses, en orden ascendente', () => {
    const ps = generarPeriodosParaContrato(contrato());
    expect(ps.map((p) => p.periodoMesAnio)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
  });

  it('cada periodo hereda las claves del contrato y usa el id canónico cobro_{contrato}_{aaaa}_{mm}', () => {
    const [p] = generarPeriodosParaContrato(contrato());
    expect(p.id).toBe('cobro_c1_2026_06');
    expect(p.id).toBe(claveIdempotenteCobro('c1', '2026-06'));
    expect(p).toMatchObject({
      inmuebleId: 'inm1',
      contratoId: 'c1',
      inquilinoId: 'inq1',
      propietarioId: 'prop1',
      mes: 6,
      anio: 2026,
      nombreMes: 'Junio 2026',
      importePrevisto: 800,
      importeRecibido: 0,
      fechaVencimiento: '2026-06-05',
    });
    expect(p.historialCambios).toHaveLength(1);
    expect(p.historialCambios[0].usuarioNombre).toBe('Sistema');
  });

  it('estado inicial: RETRASADO si el vencimiento ya pasó, PENDIENTE si no', () => {
    const ps = generarPeriodosParaContrato(contrato());
    const porPeriodo = Object.fromEntries(ps.map((p) => [p.periodoMesAnio, p.estado]));
    expect(porPeriodo['2026-09']).toBe('RETRASADO'); // venció el 05/09
    expect(porPeriodo['2026-10']).toBe('PENDIENTE');
    expect(porPeriodo['2026-11']).toBe('PENDIENTE');
  });

  it('el vencimiento del día en curso todavía no está vencido (se compara con las 23:59:59)', () => {
    const ps = generarPeriodosParaContrato(contrato({ diaLimitePagoMes: 21 }));
    expect(ps.find((p) => p.periodoMesAnio === '2026-09')?.estado).toBe('PENDIENTE');
  });

  it('límite del día de pago: se acota a [1, 28] y 0/undefined usa el día 5 por defecto', () => {
    expect(generarPeriodosParaContrato(contrato({ diaLimitePagoMes: 31 }))[0].fechaVencimiento).toBe('2026-06-28');
    expect(generarPeriodosParaContrato(contrato({ diaLimitePagoMes: 1 }))[0].fechaVencimiento).toBe('2026-06-01');
    expect(generarPeriodosParaContrato(contrato({ diaLimitePagoMes: 0 }))[0].fechaVencimiento).toBe('2026-06-05');
    expect(generarPeriodosParaContrato(contrato({ diaLimitePagoMes: undefined }))[0].fechaVencimiento).toBe(
      '2026-06-05'
    );
  });

  it('importe previsto: numérico tal cual, cadena numérica convertida, no numérico → 0 (no NaN)', () => {
    expect(generarPeriodosParaContrato(contrato({ rentaMensual: 650.5 }))[0].importePrevisto).toBe(650.5);
    expect(
      generarPeriodosParaContrato(contrato({ rentaMensual: '650' as unknown as number }))[0].importePrevisto
    ).toBe(650);
    expect(
      generarPeriodosParaContrato(contrato({ rentaMensual: 'abc' as unknown as number }))[0].importePrevisto
    ).toBe(0);
    expect(generarPeriodosParaContrato(contrato({ rentaMensual: 0 }))[0].importePrevisto).toBe(0);
  });

  it('fecha de inicio inválida → arranca en enero del año en curso', () => {
    const ps = generarPeriodosParaContrato(contrato({ fechaInicioContrato: 'sin-fecha' }));
    expect(ps[0].periodoMesAnio).toBe('2026-01');
    expect(ps[ps.length - 1].periodoMesAnio).toBe('2026-11');
  });

  it('contrato NO vigente con fecha de fin: no genera más allá del mes de fin', () => {
    const ps = generarPeriodosParaContrato(
      contrato({ esVigente: false, fechaFinContrato: '2026-07-15', estado: 'FINALIZADO' })
    );
    expect(ps.map((p) => p.periodoMesAnio)).toEqual(['2026-06', '2026-07']);
  });

  it('contrato vigente con fecha de fin pasada: la fecha de fin NO recorta (gobierna esVigente)', () => {
    const ps = generarPeriodosParaContrato(contrato({ esVigente: true, fechaFinContrato: '2026-07-15' }));
    expect(ps).toHaveLength(6);
  });

  it('limiteMesesFuturos parametrizable: 0 → hasta el mes actual; cruce de año correcto', () => {
    expect(generarPeriodosParaContrato(contrato(), 0).map((p) => p.periodoMesAnio)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    const cruce = generarPeriodosParaContrato(contrato(), 5);
    expect(cruce[cruce.length - 1].periodoMesAnio).toBe('2027-02');
    expect(cruce[cruce.length - 1].id).toBe('cobro_c1_2027_02');
  });

  it('los periodos existentes se conservan intactos (importe, estado, fechaPago) y solo se completan los que faltan', () => {
    const pagado = cobro({ mes: 6, estado: 'RECIBIDO', importeRecibido: 800, fechaPago: '2026-06-03' });
    const ps = generarPeriodosParaContrato(contrato({ registroCobros: [pagado] }));
    expect(ps).toHaveLength(6);
    const junio = ps.find((p) => p.periodoMesAnio === '2026-06')!;
    expect(junio.estado).toBe('RECIBIDO');
    expect(junio.importeRecibido).toBe(800);
    expect(junio.fechaPago).toBe('2026-06-03');
    expect(junio.historialCambios).toBe(pagado.historialCambios); // misma referencia, no regenerado
  });

  it('un periodo existente sin habitacionId la hereda del contrato; si ya la tenía, se respeta', () => {
    const sinHab = cobro({ mes: 6 });
    const conHab = cobro({ mes: 7, periodoMesAnio: '2026-07', habitacionId: 'habX' });
    const ps = generarPeriodosParaContrato(contrato({ habitacionId: 'hab1', registroCobros: [sinHab, conHab] }));
    expect(ps.find((p) => p.periodoMesAnio === '2026-06')?.habitacionId).toBe('hab1');
    expect(ps.find((p) => p.periodoMesAnio === '2026-07')?.habitacionId).toBe('habX');
    expect(ps.find((p) => p.periodoMesAnio === '2026-08')?.habitacionId).toBe('hab1');
  });

  it('determinismo: dos generaciones sobre la misma entrada producen periodos idénticos salvo ids de historial', () => {
    const a = generarPeriodosParaContrato(contrato());
    const b = generarPeriodosParaContrato(contrato());
    expect(sinRuido(a)).toEqual(sinRuido(b));
  });

  it('idempotencia: regenerar sobre el resultado previo no duplica ni altera periodos', () => {
    const c = contrato();
    const primera = generarPeriodosParaContrato(c);
    const segunda = generarPeriodosIdempotente(c);
    expect(segunda).toHaveLength(primera.length);
    expect(new Set(segunda.map((p) => p.id)).size).toBe(primera.length);
    expect(sinRuido(segunda)).toEqual(sinRuido(primera));
  });

  it('sin efectos laterales: no muta el contrato de entrada ni su registroCobros', () => {
    const existente = cobro({ mes: 6 });
    const c = contrato({ registroCobros: [existente] });
    const antes = snapshot(c);
    generarPeriodosParaContrato(c);
    expect(snapshot(c)).toBe(antes);
    expect(c.registroCobros).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Transición automática de estados
// ---------------------------------------------------------------------------

describe('cobrosEngine · actualizarEstadosVencimiento', () => {
  const base = () =>
    contrato({
      registroCobros: [
        cobro({ mes: 6, estado: 'PENDIENTE' }), // venció 05/06 → muy fuera de gracia
        cobro({ mes: 7, periodoMesAnio: '2026-07', fechaVencimiento: '2026-07-05', estado: 'RECIBIDO', importeRecibido: 800 }),
        cobro({ mes: 8, periodoMesAnio: '2026-08', fechaVencimiento: '2026-08-05', estado: 'INCIDENCIA', importeRecibido: 100 }),
        cobro({ mes: 9, periodoMesAnio: '2026-09', fechaVencimiento: '2026-09-20', estado: 'PENDIENTE' }), // 1 día → en gracia
        cobro({ mes: 10, periodoMesAnio: '2026-10', fechaVencimiento: '2026-10-05', estado: 'PENDIENTE' }),
        cobro({ mes: 11, periodoMesAnio: '2026-11', fechaVencimiento: '2026-11-05', estado: 'PENDIENTE' }),
      ],
    });

  it('única transición automática: PENDIENTE impagado con más de N días de gracia → RETRASADO', () => {
    const r = actualizarEstadosVencimiento(base(), HOY);
    const estados = Object.fromEntries(r.periodos.map((p) => [p.periodoMesAnio, p.estado]));
    expect(estados['2026-06']).toBe('RETRASADO');
    expect(estados['2026-09']).toBe('PENDIENTE'); // dentro de la gracia (2 días)
    expect(estados['2026-10']).toBe('PENDIENTE');
    expect(r.cambiosEstado).toBe(1);
    expect(r.periodosNuevos).toBe(0);
    expect(r.necesitaGuardado).toBe(true);
  });

  it('nunca toca RECIBIDO ni INCIDENCIA aunque estén vencidos', () => {
    const r = actualizarEstadosVencimiento(base(), HOY);
    expect(r.periodos.find((p) => p.periodoMesAnio === '2026-07')?.estado).toBe('RECIBIDO');
    expect(r.periodos.find((p) => p.periodoMesAnio === '2026-08')?.estado).toBe('INCIDENCIA');
  });

  it('la frontera de la gracia es estricta: exactamente N días de retraso no cambia, N+1 sí', () => {
    const enFrontera = contrato({
      fechaInicioContrato: '2026-09-15',
      registroCobros: [
        cobro({ mes: 9, periodoMesAnio: '2026-09', fechaVencimiento: '2026-09-19', estado: 'PENDIENTE' }), // -2
        cobro({ mes: 10, periodoMesAnio: '2026-10', fechaVencimiento: '2026-10-05', estado: 'PENDIENTE' }),
        cobro({ mes: 11, periodoMesAnio: '2026-11', fechaVencimiento: '2026-11-05', estado: 'PENDIENTE' }),
      ],
    });
    expect(actualizarEstadosVencimiento(enFrontera, HOY).cambiosEstado).toBe(0);
    const unDiaMas = new Date(2026, 8, 22, 12);
    expect(actualizarEstadosVencimiento(enFrontera, unDiaMas).cambiosEstado).toBe(1);
  });

  it('un PENDIENTE ya cobrado íntegramente (importeRecibido ≥ previsto) no pasa a RETRASADO', () => {
    const c = contrato({
      fechaInicioContrato: '2026-09-15',
      registroCobros: [
        cobro({ mes: 9, periodoMesAnio: '2026-09', fechaVencimiento: '2026-09-01', estado: 'PENDIENTE', importeRecibido: 800 }),
        cobro({ mes: 10, periodoMesAnio: '2026-10', fechaVencimiento: '2026-10-05' }),
        cobro({ mes: 11, periodoMesAnio: '2026-11', fechaVencimiento: '2026-11-05' }),
      ],
    });
    expect(actualizarEstadosVencimiento(c, HOY).cambiosEstado).toBe(0);
  });

  it('el cambio queda trazado una sola vez en el historial del periodo y en fechaActualizacion del contrato', () => {
    const r = actualizarEstadosVencimiento(base(), HOY);
    const junio = r.periodos.find((p) => p.periodoMesAnio === '2026-06')!;
    expect(junio.historialCambios[0]).toMatchObject({
      usuarioNombre: 'Sistema',
      estadoAnterior: 'PENDIENTE',
      estadoNuevo: 'RETRASADO',
      fecha: HOY.toISOString(),
    });
    expect(junio.historialCambios).toHaveLength(1);
    expect(r.contratoActualizado.fechaActualizacion).toBe(HOY.toISOString());
    // Segunda pasada: ya es RETRASADO → sin cambios ni nuevas entradas de historial.
    const r2 = actualizarEstadosVencimiento(r.contratoActualizado, HOY);
    expect(r2.cambiosEstado).toBe(0);
    expect(r2.necesitaGuardado).toBe(false);
    expect(r2.periodos.find((p) => p.periodoMesAnio === '2026-06')?.historialCambios).toHaveLength(1);
  });

  it('sin cambios de estado no se toca fechaActualizacion; con periodos que faltan sí necesita guardado', () => {
    const soloFuturo = contrato({
      fechaInicioContrato: '2026-10-15',
      registroCobros: [cobro({ mes: 10, periodoMesAnio: '2026-10', fechaVencimiento: '2026-10-05' })],
    });
    const r = actualizarEstadosVencimiento(soloFuturo, HOY);
    expect(r.cambiosEstado).toBe(0);
    expect(r.periodosNuevos).toBe(1); // se añade 2026-11
    expect(r.necesitaGuardado).toBe(true);
    expect(r.contratoActualizado.fechaActualizacion).toBe(soloFuturo.fechaActualizacion);
  });

  it('el parámetro diasGracia se respeta (gracia 0 → el retraso de 1 día ya es RETRASADO)', () => {
    const r = actualizarEstadosVencimiento(base(), HOY, 0);
    expect(r.periodos.find((p) => p.periodoMesAnio === '2026-09')?.estado).toBe('RETRASADO');
    expect(r.cambiosEstado).toBe(2);
  });

  it('inmutabilidad: el contrato de entrada no se modifica', () => {
    const c = base();
    const antes = snapshot(c);
    actualizarEstadosVencimiento(c, HOY);
    expect(snapshot(c)).toBe(antes);
  });
});

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

describe('cobrosEngine · calcularAvisosCobros', () => {
  it('INCIDENCIA impagada → aviso crítico tipo incidencia con el motivo', () => {
    const [a] = calcularAvisosCobros([cobro({ estado: 'INCIDENCIA', motivoIncidencia: 'Transferencia devuelta' })], HOY);
    expect(a).toMatchObject({ id: 'aviso_inc_cobro_c1_2026_06', tipo: 'incidencia', nivel: 'critico' });
    expect(a.detalle).toContain('800.00 €');
    expect(a.detalle).toContain('Transferencia devuelta');
  });

  it('RETRASADO impagado → aviso crítico "vencida" (aviso_retr_)', () => {
    const [a] = calcularAvisosCobros([cobro({ estado: 'RETRASADO' })], HOY);
    expect(a.id).toBe('aviso_retr_cobro_c1_2026_06');
    expect(a.tipo).toBe('vencida');
    expect(a.nivel).toBe('critico');
  });

  it('PENDIENTE fuera de gracia → crítico (aviso_pendretr_); dentro de gracia → advertencia', () => {
    const fuera = cobro({ fechaVencimiento: '2026-09-18' }); // -3 días
    const dentro = cobro({ id: 'x2', fechaVencimiento: '2026-09-20' }); // -1 día
    const avisos = calcularAvisosCobros([fuera, dentro], HOY);
    expect(avisos.map((a) => a.id)).toEqual(['aviso_pendretr_cobro_c1_2026_06', 'aviso_gracia_x2']);
    expect(avisos[0].nivel).toBe('critico');
    expect(avisos[1]).toMatchObject({ tipo: 'en_plazo_gracia', nivel: 'advertencia' });
  });

  it('PENDIENTE que vence hoy o dentro del plazo de aviso → info; más allá del plazo no genera aviso', () => {
    const hoy = cobro({ id: 'h', fechaVencimiento: '2026-09-21' });
    const manana = cobro({ id: 'm', fechaVencimiento: '2026-09-22' });
    const limite = cobro({ id: 'l', fechaVencimiento: '2026-09-26' }); // +5 incluido
    const lejos = cobro({ id: 'z', fechaVencimiento: '2026-09-27' }); // +6 excluido
    const avisos = calcularAvisosCobros([lejos, limite, manana, hoy], HOY);
    expect(avisos.map((a) => a.id)).toEqual(['aviso_pronto_h', 'aviso_pronto_m', 'aviso_pronto_l']);
    expect(avisos[0].titulo).toBe('La renta vence hoy');
    expect(avisos[1].titulo).toBe('La renta vence en 1 día');
    expect(avisos[2].titulo).toBe('La renta vence en 5 días');
    expect(avisos.every((a) => a.nivel === 'info' && a.tipo === 'vence_pronto')).toBe(true);
  });

  it('los periodos ya cobrados no generan aviso aunque su estado sea RETRASADO/INCIDENCIA/PENDIENTE', () => {
    const cobros = [
      cobro({ id: 'a', estado: 'RETRASADO', importeRecibido: 800 }),
      cobro({ id: 'b', estado: 'INCIDENCIA', importeRecibido: 800 }),
      cobro({ id: 'c', estado: 'PENDIENTE', importeRecibido: 800, fechaVencimiento: '2026-09-21' }),
      cobro({ id: 'd', estado: 'RECIBIDO', importeRecibido: 800 }),
      cobro({ id: 'e', estado: 'VERIFICADO', importeRecibido: 800 }),
    ];
    expect(calcularAvisosCobros(cobros, HOY)).toEqual([]);
  });

  it('un PENDIENTE con fecha de vencimiento inválida no genera aviso (no se puede evaluar)', () => {
    expect(calcularAvisosCobros([cobro({ fechaVencimiento: '' })], HOY)).toEqual([]);
  });

  it('orden: crítico → advertencia → info y, dentro del nivel, por días ascendente', () => {
    const cobros = [
      cobro({ id: 'info5', fechaVencimiento: '2026-09-26' }),
      cobro({ id: 'grac', fechaVencimiento: '2026-09-20' }),
      cobro({ id: 'info0', fechaVencimiento: '2026-09-21' }),
      cobro({ id: 'retr', estado: 'RETRASADO', fechaVencimiento: '2026-08-05' }),
      cobro({ id: 'inc', estado: 'INCIDENCIA', fechaVencimiento: '2026-09-05' }),
    ];
    const ids = calcularAvisosCobros(cobros, HOY).map((a) => a.id);
    expect(ids).toEqual(['aviso_retr_retr', 'aviso_inc_inc', 'aviso_gracia_grac', 'aviso_pronto_info0', 'aviso_pronto_info5']);
  });

  it('diasAviso y diasGracia son parametrizables', () => {
    const c = cobro({ fechaVencimiento: '2026-09-18' }); // -3
    expect(calcularAvisosCobros([c], HOY, 5, 5)[0].tipo).toBe('en_plazo_gracia');
    const futuro = cobro({ id: 'f', fechaVencimiento: '2026-09-30' }); // +9
    expect(calcularAvisosCobros([futuro], HOY, 10)[0].tipo).toBe('vence_pronto');
    expect(calcularAvisosCobros([futuro], HOY, 5)).toEqual([]);
  });

  it('sin efectos laterales: los cobros de entrada no se mutan y el aviso referencia el mismo objeto', () => {
    const c = cobro({ estado: 'RETRASADO' });
    const antes = snapshot(c);
    const [a] = calcularAvisosCobros([c], HOY);
    expect(a.cobro).toBe(c);
    expect(snapshot(c)).toBe(antes);
  });
});

// ---------------------------------------------------------------------------
// Registro de pagos e incidencias
// ---------------------------------------------------------------------------

describe('cobrosEngine · registrarPagoPeriodo', () => {
  const ID_JUN = 'cobro_c1_2026_06';

  it('pago íntegro → RECIBIDO con importe, fecha, método y trazabilidad', () => {
    const r = registrarPagoPeriodo(contrato(), ID_JUN, { importeRecibido: 800, fechaPago: '2026-06-03', metodoPago: 'bizum' });
    const p = r.registroCobros!.find((x) => x.id === ID_JUN)!;
    expect(p).toMatchObject({
      estado: 'RECIBIDO',
      importeRecibido: 800,
      fechaPago: '2026-06-03',
      metodoPago: 'bizum',
      registradoPor: 'Administrador',
      fechaRegistro: HOY.toISOString(),
      ultimaModificacion: HOY.toISOString(),
    });
    expect(p.historialCambios[0]).toMatchObject({
      accion: 'Registro de pago recibido',
      estadoAnterior: 'RETRASADO',
      estadoNuevo: 'RECIBIDO',
      importeAnterior: 0,
      importeNuevo: 800,
      usuarioNombre: 'Administrador',
    });
    expect(r.fechaActualizacion).toBe(HOY.toISOString());
  });

  it('pago parcial → INCIDENCIA (no RECIBIDO); pago por exceso → RECIBIDO', () => {
    expect(
      registrarPagoPeriodo(contrato(), ID_JUN, { importeRecibido: 799.99, fechaPago: '2026-06-03' }).registroCobros![0].estado
    ).toBe('INCIDENCIA');
    expect(
      registrarPagoPeriodo(contrato(), ID_JUN, { importeRecibido: 1000, fechaPago: '2026-06-03' }).registroCobros![0].estado
    ).toBe('RECIBIDO');
  });

  it('importe 0 sobre una renta > 0 → INCIDENCIA; renta 0 con pago 0 → RECIBIDO (cero legal)', () => {
    expect(
      registrarPagoPeriodo(contrato(), ID_JUN, { importeRecibido: 0, fechaPago: '2026-06-03' }).registroCobros![0].estado
    ).toBe('INCIDENCIA');
    expect(
      registrarPagoPeriodo(contrato({ rentaMensual: 0 }), ID_JUN, { importeRecibido: 0, fechaPago: '2026-06-03' })
        .registroCobros![0].estado
    ).toBe('RECIBIDO');
  });

  it('un estado explícito prevalece sobre el cálculo automático (p. ej. VERIFICADO)', () => {
    const r = registrarPagoPeriodo(contrato(), ID_JUN, { importeRecibido: 100, fechaPago: '2026-06-03', estado: 'VERIFICADO' });
    expect(r.registroCobros![0].estado).toBe('VERIFICADO');
  });

  it('el usuario que registra queda trazado (nombre o email) y su id', () => {
    const r = registrarPagoPeriodo(contrato(), ID_JUN, { importeRecibido: 800, fechaPago: '2026-06-03' }, usuario());
    expect(r.registroCobros![0].registradoPor).toBe('Gestora');
    expect(r.registroCobros![0].registradoPorId).toBe('u1');
    const soloEmail = registrarPagoPeriodo(
      contrato(),
      ID_JUN,
      { importeRecibido: 800, fechaPago: '2026-06-03' },
      usuario({ nombre: '' as string })
    );
    expect(soloEmail.registroCobros![0].registradoPor).toBe('g@erp.test');
  });

  it('modificar un pago existente: el historial crece en orden inverso y conserva fechaRegistro original', () => {
    const c1 = registrarPagoPeriodo(contrato(), ID_JUN, { importeRecibido: 500, fechaPago: '2026-06-03' });
    vi.setSystemTime(new Date(2026, 8, 22, 9));
    const c2 = registrarPagoPeriodo(c1, ID_JUN, { importeRecibido: 800, fechaPago: '2026-06-10' });
    const p = c2.registroCobros!.find((x) => x.id === ID_JUN)!;
    expect(p.estado).toBe('RECIBIDO');
    expect(p.historialCambios).toHaveLength(3); // generado + registro + modificación
    expect(p.historialCambios[0]).toMatchObject({ accion: 'Modificación de pago', importeAnterior: 500, importeNuevo: 800 });
    expect(p.historialCambios[1].accion).toBe('Registro de pago recibido');
    expect(p.fechaRegistro).toBe(HOY.toISOString());
    expect(p.ultimaModificacion).toBe(new Date(2026, 8, 22, 9).toISOString());
  });

  it('campos opcionales: se conservan los previos si no se envían (observaciones, referencia, justificante, método)', () => {
    const justificante = { id: 'j1', nombreArchivo: 'recibo.pdf', fechaSubida: '2026-06-03' };
    const c1 = registrarPagoPeriodo(contrato(), ID_JUN, {
      importeRecibido: 500,
      fechaPago: '2026-06-03',
      observaciones: 'Primer pago',
      referenciaBancaria: 'REF-1',
      justificante,
      metodoPago: 'efectivo',
    });
    const c2 = registrarPagoPeriodo(c1, ID_JUN, { importeRecibido: 800, fechaPago: '2026-06-10' });
    const p = c2.registroCobros![0];
    expect(p.observaciones).toBe('Primer pago');
    expect(p.referenciaBancaria).toBe('REF-1');
    expect(p.justificante).toEqual(justificante);
    expect(p.metodoPago).toBe('efectivo');
  });

  it('periodo inexistente → devuelve el mismo contrato (misma referencia) sin cambios', () => {
    const c = contrato();
    expect(registrarPagoPeriodo(c, 'cobro_c1_2031_01', { importeRecibido: 800, fechaPago: '2026-06-03' })).toBe(c);
  });

  it('inmutabilidad: el contrato de entrada no se modifica y los demás periodos permanecen', () => {
    const c = contrato();
    const antes = snapshot(c);
    const r = registrarPagoPeriodo(c, ID_JUN, { importeRecibido: 800, fechaPago: '2026-06-03' });
    expect(snapshot(c)).toBe(antes);
    expect(r).not.toBe(c);
    expect(r.registroCobros).toHaveLength(6);
    expect(r.registroCobros!.filter((p) => p.estado === 'RECIBIDO')).toHaveLength(1);
  });

  it('registrarIncidenciaPeriodo: marca INCIDENCIA con motivo y traza; inexistente → mismo contrato', () => {
    const r = registrarIncidenciaPeriodo(contrato(), ID_JUN, 'Recibo devuelto', usuario());
    const p = r.registroCobros![0];
    expect(p.estado).toBe('INCIDENCIA');
    expect(p.motivoIncidencia).toBe('Recibo devuelto');
    expect(p.historialCambios[0]).toMatchObject({
      accion: 'Incidencia de cobro reportada',
      estadoNuevo: 'INCIDENCIA',
      detalles: 'Recibo devuelto',
      usuarioNombre: 'Gestora',
    });
    const c = contrato();
    expect(registrarIncidenciaPeriodo(c, 'nope', 'x')).toBe(c);
  });
});

// ---------------------------------------------------------------------------
// Agregados
// ---------------------------------------------------------------------------

describe('cobrosEngine · calcularResumenCobros', () => {
  it('lista vacía → todos los totales 0 y porcentaje 0 (sin división por cero)', () => {
    expect(calcularResumenCobros([])).toEqual({
      totalPrevisto: 0,
      totalRecibido: 0,
      totalPendiente: 0,
      totalRetrasado: 0,
      totalIncidencias: 0,
      countCobrados: 0,
      countPendientes: 0,
      countRetrasados: 0,
      countIncidencias: 0,
      countConJustificante: 0,
      porcentajeCobrado: 0,
      totalPeriodos: 0,
    });
  });

  it('clasifica por estado y reparte el impagado entre pendiente/retrasado/incidencias', () => {
    const r = calcularResumenCobros([
      cobro({ id: '1', estado: 'RECIBIDO', importeRecibido: 800, justificante: { id: 'j', nombreArchivo: 'a.pdf', fechaSubida: '' } }),
      cobro({ id: '2', estado: 'VERIFICADO', importeRecibido: 800 }),
      cobro({ id: '3', estado: 'PAGADO' as EstadoCobroAlquiler, importeRecibido: 800 }),
      cobro({ id: '4', estado: 'RETRASADO' }),
      cobro({ id: '5', estado: 'INCIDENCIA', importeRecibido: 300 }),
      cobro({ id: '6', estado: 'PENDIENTE' }),
    ]);
    expect(r).toMatchObject({
      totalPrevisto: 4800,
      totalRecibido: 2700,
      totalPendiente: 800,
      totalRetrasado: 800,
      totalIncidencias: 500,
      countCobrados: 3,
      countRetrasados: 1,
      countIncidencias: 1,
      countPendientes: 1,
      countConJustificante: 1,
      totalPeriodos: 6,
    });
    expect(r.porcentajeCobrado).toBe(56); // 2700/4800 = 56.25 → 56
  });

  it('invariante: previsto − recibido = pendiente + retrasado + incidencias cuando los cobrados están íntegros', () => {
    const cobros = [
      cobro({ id: '1', estado: 'RECIBIDO', importeRecibido: 800 }),
      cobro({ id: '2', estado: 'RETRASADO', importeRecibido: 200 }),
      cobro({ id: '3', estado: 'INCIDENCIA', importeRecibido: 50 }),
      cobro({ id: '4', estado: 'PENDIENTE' }),
    ];
    const r = calcularResumenCobros(cobros);
    expect(r.totalPrevisto - r.totalRecibido).toBe(r.totalPendiente + r.totalRetrasado + r.totalIncidencias);
    expect(r.countCobrados + r.countPendientes + r.countRetrasados + r.countIncidencias).toBe(r.totalPeriodos);
  });

  it('porcentaje: redondeo al entero (33.3 → 33, 66.6 → 67) y puede superar 100 si hay sobrepago', () => {
    const tercio = (rec: number) => calcularResumenCobros([cobro({ importePrevisto: 300, importeRecibido: rec, estado: 'RECIBIDO' })]);
    expect(tercio(100).porcentajeCobrado).toBe(33);
    expect(tercio(200).porcentajeCobrado).toBe(67);
    expect(tercio(450).porcentajeCobrado).toBe(150);
  });

  it('importes con decimales: el motor suma sin redondear (precisión de coma flotante)', () => {
    const r = calcularResumenCobros([
      cobro({ id: '1', importePrevisto: 333.33, importeRecibido: 333.33, estado: 'RECIBIDO' }),
      cobro({ id: '2', importePrevisto: 333.33, importeRecibido: 333.33, estado: 'RECIBIDO' }),
      cobro({ id: '3', importePrevisto: 333.33, importeRecibido: 0 }),
    ]);
    expect(r.totalPrevisto).toBeCloseTo(999.99, 2);
    expect(r.totalRecibido).toBeCloseTo(666.66, 2);
    expect(r.totalPendiente).toBeCloseTo(333.33, 2);
  });

  it('importes ausentes/undefined se tratan como 0 sin producir NaN', () => {
    const r = calcularResumenCobros([cobro({ importePrevisto: undefined as unknown as number, importeRecibido: undefined as unknown as number })]);
    expect(r.totalPrevisto).toBe(0);
    expect(r.totalRecibido).toBe(0);
    expect(r.totalPendiente).toBe(0);
    expect(Number.isNaN(r.porcentajeCobrado)).toBe(false);
  });

  it('determinismo y ausencia de efectos laterales', () => {
    const cobros = [cobro({ id: '1', estado: 'RETRASADO' }), cobro({ id: '2', estado: 'RECIBIDO', importeRecibido: 800 })];
    const antes = snapshot(cobros);
    expect(calcularResumenCobros(cobros)).toEqual(calcularResumenCobros(cobros));
    expect(snapshot(cobros)).toBe(antes);
  });
});

describe('cobrosEngine · consultas de cobros por inmueble/contratos', () => {
  it('obtenerTodosCobros: usa registroCobros si existe, genera si está vacío, y ordena descendente', () => {
    const conRegistro = contrato({ id: 'cA', registroCobros: [cobro({ mes: 6 }), cobro({ mes: 7, periodoMesAnio: '2026-07', id: 'cobro_c1_2026_07' })] });
    const sinRegistro = contrato({ id: 'cB', inmuebleId: 'inm2', fechaInicioContrato: '2026-08-15' });
    const todos = obtenerTodosCobros([conRegistro, sinRegistro]);
    expect(todos).toHaveLength(2 + 4);
    const claves = todos.map((c) => `${c.anio}-${String(c.mes).padStart(2, '0')}`);
    expect([...claves].sort().reverse()).toEqual(claves);
  });

  it('obtenerCobrosInmueble: solo contratos del inmueble (incluye históricos), descendente', () => {
    const actual = contrato({ id: 'cA' });
    const historico = contrato({ id: 'cH', esVigente: false, fechaInicioContrato: '2025-11-15', fechaFinContrato: '2026-01-15' });
    const otro = contrato({ id: 'cX', inmuebleId: 'inm9' });
    const cobros = obtenerCobrosInmueble('inm1', [actual, historico, otro]);
    expect(cobros.every((c) => c.inmuebleId === 'inm1')).toBe(true);
    expect(cobros.some((c) => c.contratoId === 'cH')).toBe(true);
    expect(cobros.some((c) => c.contratoId === 'cX')).toBe(false);
    expect(cobros[0].periodoMesAnio).toBe('2026-11');
    expect(cobros[cobros.length - 1].periodoMesAnio).toBe('2025-11');
  });

  it('obtenerCobrosInmueble sin contratos → lista vacía', () => {
    expect(obtenerCobrosInmueble('inm1', [])).toEqual([]);
  });
});

describe('cobrosEngine · generarResumenFiscalInmueble', () => {
  it('inmueble inexistente → null', () => {
    expect(generarResumenFiscalInmueble('nope', 2026, [inmueble()], [contrato()])).toBeNull();
  });

  it('agrega por año los periodos de todos los contratos del inmueble, omitiendo contratos sin periodos ese año', () => {
    const c2026 = contrato({
      id: 'c1',
      registroCobros: [
        cobro({ mes: 6, estado: 'RECIBIDO', importeRecibido: 800, justificante: { id: 'j', nombreArchivo: 'r.pdf', fechaSubida: '' } }),
        cobro({ id: 'cobro_c1_2026_07', mes: 7, periodoMesAnio: '2026-07', estado: 'RETRASADO' }),
        cobro({ id: 'cobro_c1_2026_08', mes: 8, periodoMesAnio: '2026-08', estado: 'INCIDENCIA', importeRecibido: 300 }),
        cobro({ id: 'cobro_c1_2026_09', mes: 9, periodoMesAnio: '2026-09', estado: 'PENDIENTE' }),
      ],
    });
    const c2025 = contrato({
      id: 'c0',
      candidatoId: 'inq0',
      esVigente: false,
      fechaInicioContrato: '2025-01-15',
      fechaFinContrato: '2025-12-15',
      registroCobros: [cobro({ id: 'cobro_c0_2025_12', contratoId: 'c0', mes: 12, anio: 2025, periodoMesAnio: '2025-12', estado: 'RECIBIDO', importeRecibido: 700, importePrevisto: 700 })],
    });
    const r = generarResumenFiscalInmueble('inm1', 2026, [inmueble()], [c2026, c2025])!;
    expect(r.contratosPeriodos).toHaveLength(1);
    expect(r.contratosPeriodos[0].contratoId).toBe('c1');
    expect(r.contratosPeriodos[0].meses).toHaveLength(4);
    expect(r).toMatchObject({
      anio: 2026,
      totalAnualPrevisto: 3200,
      totalAnualCobrado: 1100,
      totalAnualPendiente: 1600, // retrasado 800 + pendiente 800
      totalAnualIncidencias: 500,
      mesesCobradosCount: 1,
      justificantesCount: 1,
      propietarioId: 'prop1',
      propietarioNombre: 'Propietario',
    });
    expect(r.contratosPeriodos[0].subtotalCobrado).toBe(1100);
  });

  it('el año 2025 del mismo circuito se resume de forma independiente', () => {
    const c2025 = contrato({
      id: 'c0',
      esVigente: false,
      fechaInicioContrato: '2025-01-15',
      fechaFinContrato: '2025-12-15',
      registroCobros: [cobro({ id: 'cobro_c0_2025_12', contratoId: 'c0', mes: 12, anio: 2025, periodoMesAnio: '2025-12', estado: 'RECIBIDO', importeRecibido: 700, importePrevisto: 700 })],
    });
    const r = generarResumenFiscalInmueble('inm1', 2025, [inmueble()], [c2025, contrato()])!;
    expect(r.totalAnualPrevisto).toBe(700);
    expect(r.totalAnualCobrado).toBe(700);
    expect(r.contratosPeriodos.map((c) => c.contratoId)).toEqual(['c0']);
  });

  it('usa el nombre del propietario principal de datosFiscales si existe', () => {
    const inm = inmueble({ datosFiscales: { propietarioPrincipal: { nombre: 'María' } } } as unknown as Partial<Inmueble>);
    expect(generarResumenFiscalInmueble('inm1', 2026, [inm], [contrato()])!.propietarioNombre).toBe('María');
  });
});

describe('cobrosEngine · circuito económico del inmueble', () => {
  it('contratosIngresosSegunModalidad: habitaciones → solo contratos con habitacionId; completo → solo sin', () => {
    const completo = contrato({ id: 'cc' });
    const hab = contrato({ id: 'ch', habitacionId: 'h1' });
    const ajeno = contrato({ id: 'cx', inmuebleId: 'otro' });
    expect(contratosIngresosSegunModalidad(inmueble(), [completo, hab, ajeno]).map((c) => c.id)).toEqual(['cc']);
    expect(contratosIngresosSegunModalidad(inmueble({ modalidadAlquiler: 'habitaciones' }), [completo, hab, ajeno]).map((c) => c.id)).toEqual(['ch']);
  });

  it('cobrosPorHabitacion filtra por habitacionId', () => {
    const cobros = [cobro({ id: 'a', habitacionId: 'h1' }), cobro({ id: 'b', habitacionId: 'h2' }), cobro({ id: 'c' })];
    expect(cobrosPorHabitacion(cobros, 'h1').map((c) => c.id)).toEqual(['a']);
    expect(cobrosPorHabitacion(cobros, 'h9')).toEqual([]);
  });

  it('ingresosInmuebleDesdeCircuito: ingresoVencido = retrasado + incidencias', () => {
    const c = contrato({
      registroCobros: [
        cobro({ id: '1', estado: 'RECIBIDO', importeRecibido: 800 }),
        cobro({ id: '2', mes: 7, periodoMesAnio: '2026-07', estado: 'RETRASADO' }),
        cobro({ id: '3', mes: 8, periodoMesAnio: '2026-08', estado: 'INCIDENCIA', importeRecibido: 100 }),
        cobro({ id: '4', mes: 9, periodoMesAnio: '2026-09', estado: 'PENDIENTE' }),
        cobro({ id: '5', mes: 10, periodoMesAnio: '2026-10', estado: 'PENDIENTE' }),
        cobro({ id: '6', mes: 11, periodoMesAnio: '2026-11', estado: 'PENDIENTE' }),
      ],
    });
    const r = ingresosInmuebleDesdeCircuito(inmueble(), [c]);
    expect(r.ingresoPrevisto).toBe(4800);
    expect(r.ingresoCobrado).toBe(900);
    expect(r.ingresoPendiente).toBe(2400);
    expect(r.ingresoVencido).toBe(800 + 700);
    expect(r.cobros).toHaveLength(6);
  });

  it('rentabilidadInmuebleDesdeCircuito: base = valorAdquisicion, 2 decimales; base 0 → pct null', () => {
    const c = contrato({ registroCobros: [cobro({ estado: 'RECIBIDO', importeRecibido: 1234.5 }), cobro({ id: 'b', mes: 11, periodoMesAnio: '2026-11' })] });
    const r = rentabilidadInmuebleDesdeCircuito(inmueble({ valorAdquisicion: 100000 }), [c]);
    expect(r).toEqual({ base: 100000, ingresosCobrados: 1234.5, rentabilidadPct: 1.23 });
    expect(rentabilidadInmuebleDesdeCircuito(inmueble({ valorAdquisicion: 0 }), [c])).toEqual({ base: 0, ingresosCobrados: 1234.5, rentabilidadPct: null });
    expect(rentabilidadInmuebleDesdeCircuito(inmueble({ valorAdquisicion: undefined }), [c]).rentabilidadPct).toBeNull();
  });

  it('historialEconomicoHabitacion agrupa contratos y cobros de la habitación con su resumen', () => {
    const h1 = contrato({ id: 'h1c', habitacionId: 'h1', registroCobros: [cobro({ habitacionId: 'h1', estado: 'RECIBIDO', importeRecibido: 800 })] });
    const h2 = contrato({ id: 'h2c', habitacionId: 'h2' });
    const r = historialEconomicoHabitacion('h1', [h1, h2]);
    expect(r.contratos.map((c) => c.id)).toEqual(['h1c']);
    expect(r.cobros.every((c) => c.habitacionId === 'h1')).toBe(true);
    expect(r.resumen.totalRecibido).toBe(800);
  });

  it('impagoAisladoEntreHabitaciones: A impagada y B sana → true; ambas sanas o B con impago → false', () => {
    const impago = [cobro({ estado: 'RETRASADO' })];
    const sano = [cobro({ estado: 'RECIBIDO', importeRecibido: 800 })];
    expect(impagoAisladoEntreHabitaciones(impago, sano)).toBe(true);
    expect(impagoAisladoEntreHabitaciones(sano, sano)).toBe(false);
    expect(impagoAisladoEntreHabitaciones(impago, [cobro({ estado: 'INCIDENCIA' })])).toBe(false);
  });

  it('payloadEconomicoIdsCruzadosDenegado: cada id cruzado deniega; ids coherentes o ausentes no', () => {
    const c = contrato({ habitacionId: 'h1' });
    expect(payloadEconomicoIdsCruzadosDenegado({ inmuebleId: 'otro' }, c)).toBe(true);
    expect(payloadEconomicoIdsCruzadosDenegado({ inmuebleId: 'inm1', contratoId: 'c9' }, c)).toBe(true);
    expect(payloadEconomicoIdsCruzadosDenegado({ inmuebleId: 'inm1', habitacionId: 'h9' }, c)).toBe(true);
    expect(payloadEconomicoIdsCruzadosDenegado({ inmuebleId: 'inm1', propietarioId: 'prop9' }, c)).toBe(true);
    expect(payloadEconomicoIdsCruzadosDenegado({ inmuebleId: 'inm1' }, c)).toBe(false);
    expect(payloadEconomicoIdsCruzadosDenegado({ inmuebleId: 'inm1', contratoId: 'c1', habitacionId: 'h1', propietarioId: 'prop1' }, c)).toBe(false);
  });
});
