/**
 * GAP-R4 — Suite propia de `fiscalEngine` (motor fiscal anual).
 *
 * Cobertura directa a nivel de unidad, función por función, sobre el circuito:
 * INMUEBLE → EJERCICIO → CONTRATOS → INGRESOS (derivado de cobros) →
 * GASTOS (derivado de la colección de gastos) → DEDUCIBLES → DOCUMENTACIÓN →
 * RESULTADO → HISTÓRICO → AISLAMIENTO PROPIETARIO → CONSISTENCIA.
 *
 * Relación con lo existente (no se duplica):
 *  - `tests_fiscal_anual.ts` es un runner manual de escenarios (node:assert,
 *    fuera del pipeline `npx vitest run`): se conserva como smoke de escenarios;
 *    esta suite aporta la cobertura fina y trazable en la regresión oficial.
 *  - `incidenciaCircuitoOperativoEconomico.test.ts` solo toca el motor de
 *    paso (totalDeducible de un gasto OT dentro de un resumen).
 *
 * Observación normativa documentada (NO resuelta en esta orden, ver §12.1-C
 * del MAPA): la inferencia conservadora `esGastoDeducible` NO incluye IBI,
 * ADMINISTRACION ni MANTENIMIENTO_REPARACION, aunque `CATEGORIAS_GASTO`
 * (gastosEngine) marca `deduciblePorDefecto: true` para IBI. Se prueba el
 * comportamiento REAL y se deja como pendiente externa de verificación.
 */
import { describe, expect, it } from 'vitest';
import type {
  CobroPeriodo,
  ContratoFormalizacion,
  Gasto,
  Inmueble,
  UsuarioApp,
} from '../types';
import {
  canAccessResumenFiscal,
  calcularDiasOcupacionEjercicio,
  calcularGastosEjercicio,
  calcularIngresosEjercicio,
  calcularPeriodosSinAlquiler,
  clasificarGastosDeducibilidad,
  esGastoDeducible,
  filtrarResumenesFiscalesPorUsuario,
  generarHistoricoFiscalInmueble,
  generarResumenFiscalAnual,
  integrarFiscalConRentabilidad,
  recopilarDocumentacionFiscal,
  validarConsistenciaFiscal,
} from './fiscalEngine';

// ---------- Fixtures ----------

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
    rentaMensual: 1000,
    fianzaLegalMeses: 1,
    fianzaLegalImporte: 1000,
    garantiaAdicionalMeses: 0,
    garantiaAdicionalImporte: 0,
    fechaInicioContrato: '2026-01-01',
    fechaFinContrato: '2026-12-31',
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

function cobro(p: Partial<CobroPeriodo> = {}): CobroPeriodo {
  return {
    id: 'cobro_c1_2026_01',
    inmuebleId: 'inm-1',
    contratoId: 'c1',
    inquilinoId: 'cand-1',
    propietarioId: 'prop-1',
    inquilinoNombre: 'Inquilino Uno',
    mes: 1,
    anio: 2026,
    periodoMesAnio: '2026-01',
    nombreMes: 'Enero 2026',
    importePrevisto: 1000,
    importeRecibido: 0,
    fechaVencimiento: '2026-01-05',
    estado: 'PENDIENTE',
    historialCambios: [],
    ...p,
  } as CobroPeriodo;
}

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
    fecha: '2026-01-10',
    aCargoDe: 'arrendador',
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-01-10T10:00:00.000Z',
    ...p,
  } as Gasto;
}

function usuario(p: Partial<UsuarioApp> = {}): UsuarioApp {
  return {
    id: 'u1',
    nombre: 'Ana García',
    email: 'ana@ejemplo.com',
    tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    propietarioId: 'prop-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...p,
  } as UsuarioApp;
}

// ---------- Deducibilidad ----------

describe('fiscalEngine · esGastoDeducible / clasificarGastosDeducibilidad', () => {
  it('el campo explícito esDeducible manda sobre el resto de señales', () => {
    expect(esGastoDeducible(gasto({ esDeducible: true, categoria: 'OTRO' }))).toBe(true);
    expect(esGastoDeducible(gasto({ esDeducible: false, categoria: 'COMUNIDAD' }))).toBe(false);
  });

  it('tipoDeducible se respeta si no hay esDeducible explícito', () => {
    expect(esGastoDeducible(gasto({ tipoDeducible: 'DEDUCIBLE', categoria: 'OTRO' }))).toBe(true);
    expect(esGastoDeducible(gasto({ tipoDeducible: 'NO_DEDUCIBLE', categoria: 'COMUNIDAD' }))).toBe(false);
  });

  it('inferencia conservadora por categoría (solo categorías existentes y soportadas)', () => {
    const deducibles: Gasto['categoria'][] = [
      'MANTENIMIENTO',
      'REPARACION',
      'SUMINISTROS',
      'SEGUROS',
      'IMPUESTOS_TASAS',
      'COMUNIDAD',
      'ELECTRODOMESTICOS',
      'MOBILIARIO',
      'REFORMAS',
      'LIMPIEZA',
      'GESTION',
    ];
    const noDeducibles: Gasto['categoria'][] = [
      'OTRO',
      'OTRO_EXPLOTACION',
      'OTRO_FINANCIACION',
      'CUOTA_HIPOTECARIA',
      'INTERESES_PRESTAMO',
      'SEGURO_HOGAR',
    ];
    // IBI / ADMINISTRACION / MANTENIMIENTO_REPARACION NO están en la lista de
    // inferencia: comportamiento real documentado (ver cabecera — pendiente
    // externa de verificación normativa; se prueba tal cual, no se inventa regla).
    ['IBI', 'ADMINISTRACION', 'MANTENIMIENTO_REPARACION'].forEach((cat) => {
      expect(esGastoDeducible(gasto({ categoria: cat as Gasto['categoria'] }))).toBe(false);
    });
    deducibles.forEach((cat) => expect(esGastoDeducible(gasto({ categoria: cat }))).toBe(true));
    noDeducibles.forEach((cat) => expect(esGastoDeducible(gasto({ categoria: cat }))).toBe(false));
  });

  it('clasificarGastosDeducibilidad: ANULADO queda fuera de ambos grupos y de los totales', () => {
    const r = clasificarGastosDeducibilidad([
      gasto({ id: 'a', categoria: 'COMUNIDAD', importe: 100 }),
      gasto({ id: 'b', categoria: 'OTRO', importe: 50 }),
      gasto({ id: 'c', categoria: 'REPARACION', importe: 200, estado: 'ANULADO' }),
      gasto({ id: 'd', esDeducible: false, categoria: 'COMUNIDAD', importe: 30 }),
    ]);
    expect(r.deducibles.map((g) => g.id)).toEqual(['a']);
    expect(r.noDeducibles.map((g) => g.id)).toEqual(['b', 'd']);
    expect(r.totalDeducible).toBe(100);
    expect(r.totalNoDeducible).toBe(80);
    const vacio = clasificarGastosDeducibilidad([]);
    expect(vacio.totalDeducible).toBe(0);
    expect(vacio.totalNoDeducible).toBe(0);
  });
});

// ---------- Ocupación y periodos sin alquiler ----------

describe('fiscalEngine · calcularDiasOcupacionEjercicio / calcularPeriodosSinAlquiler', () => {
  it('contrato completo del ejercicio → 365 días (y 366 en bisiesto)', () => {
    expect(calcularDiasOcupacionEjercicio(contrato(), 2026)).toBe(365);
    expect(
      calcularDiasOcupacionEjercicio(
        contrato({ fechaInicioContrato: '2028-01-01', fechaFinContrato: '2028-12-31' }),
        2028
      )
    ).toBe(366);
  });

  it('contrato parcial: solo cuenta la intersección con el ejercicio', () => {
    // 2026-06-01 → 2026-12-31: 214 días (incluidos ambos extremos).
    expect(
      calcularDiasOcupacionEjercicio(
        contrato({ fechaInicioContrato: '2026-06-01', fechaFinContrato: '2026-12-31' }),
        2026
      )
    ).toBe(214);
    // 2026-01-01 → 2026-03-31: 90 días.
    expect(
      calcularDiasOcupacionEjercicio(
        contrato({ fechaInicioContrato: '2026-01-01', fechaFinContrato: '2026-03-31' }),
        2026
      )
    ).toBe(90);
    // Contrato que empieza antes y termina en mitad: intersección 2026-01-01→2026-04-30.
    expect(
      calcularDiasOcupacionEjercicio(
        contrato({ fechaInicioContrato: '2025-01-01', fechaFinContrato: '2026-04-30' }),
        2026
      )
    ).toBe(120);
  });

  it('contrato ajeno al ejercicio → 0; sin fechaFin y en curso → el ejercicio completo', () => {
    expect(
      calcularDiasOcupacionEjercicio(
        contrato({ fechaInicioContrato: '2025-01-01', fechaFinContrato: '2025-06-30' }),
        2026
      )
    ).toBe(0);
    expect(
      calcularDiasOcupacionEjercicio(
        contrato({ fechaInicioContrato: '2027-01-01', fechaFinContrato: '2027-12-31' }),
        2026
      )
    ).toBe(0);
    expect(
      calcularDiasOcupacionEjercicio(
        contrato({ fechaInicioContrato: '2025-06-01', fechaFinContrato: undefined as unknown as string, esVigente: true }),
        2026
      )
    ).toBe(365);
    // Fecha de inicio inválida → 0.
    expect(
      calcularDiasOcupacionEjercicio(
        contrato({ fechaInicioContrato: 'no-fecha' as unknown as string }),
        2026
      )
    ).toBe(0);
  });

  it('sin contratos → el ejercicio entero sin alquiler (365 días)', () => {
    expect(calcularPeriodosSinAlquiler([], 2026)).toEqual([
      { inicio: '2026-01-01', fin: '2026-12-31', dias: 365 },
    ]);
  });

  it('contrato que cubre todo el año → sin periodos sin alquiler', () => {
    expect(calcularPeriodosSinAlquiler([contrato()], 2026)).toEqual([]);
  });

  it('contrato desde junio → gap enero–mayo (151 días)', () => {
    const gaps = calcularPeriodosSinAlquiler(
      [contrato({ fechaInicioContrato: '2026-06-01', fechaFinContrato: '2026-12-31' })],
      2026
    );
    expect(gaps).toEqual([{ inicio: '2026-01-01', fin: '2026-05-31', dias: 151 }]);
  });

  it('sucesión de contratos: el hueco entre ambos se identifica', () => {
    const gaps = calcularPeriodosSinAlquiler(
      [
        contrato({ id: 'c1', fechaInicioContrato: '2026-01-01', fechaFinContrato: '2026-03-31' }),
        contrato({ id: 'c2', candidatoId: 'cand-2', fechaInicioContrato: '2026-06-01', fechaFinContrato: '2026-12-31' }),
      ],
      2026
    );
    expect(gaps).toEqual([{ inicio: '2026-04-01', fin: '2026-05-31', dias: 61 }]);
  });

  it('contrato que termina antes de fin de año → gap final; contrato sin fin → sin gap final', () => {
    const conGap = calcularPeriodosSinAlquiler(
      [contrato({ fechaInicioContrato: '2026-01-01', fechaFinContrato: '2026-11-30' })],
      2026
    );
    expect(conGap).toEqual([{ inicio: '2026-12-01', fin: '2026-12-31', dias: 31 }]);
    const sinFin = calcularPeriodosSinAlquiler(
      [contrato({ fechaInicioContrato: '2026-01-01', fechaFinContrato: undefined as unknown as string, esVigente: true })],
      2026
    );
    expect(sinFin).toEqual([]);
  });
});

// ---------- Ingresos por ejercicio ----------

describe('fiscalEngine · calcularIngresosEjercicio', () => {
  it('filtra estrictamente por año (countTotal solo del ejercicio)', () => {
    const r = calcularIngresosEjercicio(
      [
        cobro({ anio: 2025, mes: 12, periodoMesAnio: '2025-12', estado: 'RECIBIDO', importeRecibido: 1000 }),
        cobro({ anio: 2026, mes: 1, estado: 'RECIBIDO', importeRecibido: 1000 }),
        cobro({ anio: 2027, mes: 1, estado: 'PENDIENTE' }),
      ],
      2026
    );
    expect(r.countTotal).toBe(1);
    expect(r.totalCobrado).toBe(1000);
    expect(r.cobros).toHaveLength(1);
  });

  it('estado completo/pagado (RECIBIDO/VERIFICADO/PAGADO) → cobrado + mes con ingreso', () => {
    const r = calcularIngresosEjercicio(
      [
        cobro({ id: 'a', mes: 1, estado: 'RECIBIDO', importeRecibido: 1000 }),
        cobro({ id: 'b', mes: 2, periodoMesAnio: '2026-02', nombreMes: 'Febrero 2026', estado: 'VERIFICADO', importeRecibido: 1000 }),
        cobro({ id: 'c', mes: 3, periodoMesAnio: '2026-03', nombreMes: 'Marzo 2026', estado: 'PAGADO', importeRecibido: 1000 }),
      ],
      2026
    );
    expect(r.totalCobrado).toBe(3000);
    expect(r.countCobrados).toBe(3);
    expect(r.mesesConIngreso).toEqual([1, 2, 3]);
    expect(r.mesesImpagados).toEqual([]);
  });

  it('PAGADO_PARCIAL → cobrado lo recibido + parcial el pendiente, mes parcial Y con ingreso', () => {
    const r = calcularIngresosEjercicio(
      [cobro({ id: 'p', mes: 4, periodoMesAnio: '2026-04', nombreMes: 'Abril 2026', estado: 'PAGADO_PARCIAL', importeRecibido: 400 })],
      2026
    );
    expect(r.totalCobrado).toBe(400);
    expect(r.totalParcial).toBe(600);
    expect(r.countParcial).toBe(1);
    expect(r.mesesParciales).toEqual([4]);
    expect(r.mesesConIngreso).toEqual([4]);
  });

  it('IMPAGADO/RETRASADO → impagado por el pendiente; si no hay nada cobrado, el previsto entero', () => {
    const r = calcularIngresosEjercicio(
      [
        cobro({ id: 'i', mes: 5, periodoMesAnio: '2026-05', nombreMes: 'Mayo 2026', estado: 'IMPAGADO' }),
        cobro({ id: 'r', mes: 6, periodoMesAnio: '2026-06', nombreMes: 'Junio 2026', estado: 'RETRASADO' }),
      ],
      2026
    );
    expect(r.totalImpagado).toBe(2000);
    expect(r.countImpagados).toBe(2);
    expect(r.mesesImpagados).toEqual([5, 6]);
    expect(r.totalCobrado).toBe(0);
  });

  it('ANULADO → totalAnulado por el previsto, sin entrar en cobrado ni pendiente', () => {
    const r = calcularIngresosEjercicio(
      [cobro({ id: 'an', mes: 7, periodoMesAnio: '2026-07', nombreMes: 'Julio 2026', estado: 'ANULADO' })],
      2026
    );
    expect(r.totalAnulado).toBe(1000);
    expect(r.countAnulados).toBe(1);
    expect(r.totalCobrado).toBe(0);
    expect(r.totalPendiente).toBe(0);
  });

  it('INCIDENCIA con algo cobrado → tratada como parcial; sin cobros → impagada', () => {
    const conCobro = calcularIngresosEjercicio(
      [cobro({ id: 'i1', mes: 8, periodoMesAnio: '2026-08', nombreMes: 'Agosto 2026', estado: 'INCIDENCIA', importeRecibido: 250 })],
      2026
    );
    expect(conCobro.totalCobrado).toBe(250);
    expect(conCobro.totalParcial).toBe(750);
    expect(conCobro.countParcial).toBe(1);
    expect(conCobro.mesesParciales).toEqual([8]);
    expect(conCobro.mesesImpagados).toEqual([]);

    const sinCobro = calcularIngresosEjercicio(
      [cobro({ id: 'i2', mes: 9, periodoMesAnio: '2026-09', nombreMes: 'Septiembre 2026', estado: 'INCIDENCIA' })],
      2026
    );
    expect(sinCobro.totalImpagado).toBe(1000);
    expect(sinCobro.countImpagados).toBe(1);
    expect(sinCobro.mesesImpagados).toEqual([9]);
  });

  it('PENDIENTE → pendiente; meses desduplicados y ordenados', () => {
    const r = calcularIngresosEjercicio(
      [
        cobro({ id: 'a', mes: 1, estado: 'PENDIENTE' }),
        cobro({ id: 'b', mes: 1, periodoMesAnio: '2026-01', estado: 'RETRASADO' }),
        cobro({ id: 'c', mes: 3, periodoMesAnio: '2026-03', nombreMes: 'Marzo 2026', estado: 'PAGADO_PARCIAL', importeRecibido: 500 }),
      ],
      2026
    );
    expect(r.totalPendiente).toBe(1000);
    expect(r.countPendientes).toBe(1);
    expect(r.mesesImpagados).toEqual([1]); // dedup mes 1 (PENDIENTE no entra, RETRASADO sí)
    expect(r.mesesParciales).toEqual([3]);
  });

  it('invariante de cuadre con datos bien formados: previsto = cobrado + pendiente + impagado + parcial + anulado', () => {
    // «Bien formados»: los pagos parciales están en estados parciales
    // (PAGADO_PARCIAL / INCIDENCIA). La vía canónica de escritura lo garantiza
    // (registrarPagoPeriodo: parcial → INCIDENCIA).
    const r = calcularIngresosEjercicio(
      [
        cobro({ id: 'a', mes: 1, estado: 'RECIBIDO', importeRecibido: 1000 }),
        cobro({ id: 'b', mes: 2, periodoMesAnio: '2026-02', nombreMes: 'Febrero 2026', estado: 'PAGADO_PARCIAL', importeRecibido: 200 }),
        cobro({ id: 'c', mes: 3, periodoMesAnio: '2026-03', nombreMes: 'Marzo 2026', estado: 'RETRASADO' }),
        cobro({ id: 'd', mes: 4, periodoMesAnio: '2026-04', nombreMes: 'Abril 2026', estado: 'PAGADO_PARCIAL', importeRecibido: 300 }),
        cobro({ id: 'e', mes: 5, periodoMesAnio: '2026-05', nombreMes: 'Mayo 2026', estado: 'ANULADO' }),
        cobro({ id: 'f', mes: 6, periodoMesAnio: '2026-06', nombreMes: 'Junio 2026', estado: 'INCIDENCIA', importeRecibido: 100 }),
      ],
      2026
    );
    const suma =
      r.totalCobrado + r.totalPendiente + r.totalImpagado + r.totalParcial + r.totalAnulado;
    expect(r.totalPrevisto).toBe(6000);
    expect(suma).toBe(r.totalPrevisto);
  });

  it('comportamiento real documentado: RETRASADO/PENDIENTE con pago parcial solo cuentan el pendiente (la vía canónica lo evita: parcial → INCIDENCIA)', () => {
    const r = calcularIngresosEjercicio(
      [
        cobro({ id: 'r', mes: 1, estado: 'RETRASADO', importeRecibido: 300 }),
        cobro({ id: 'p', mes: 2, periodoMesAnio: '2026-02', nombreMes: 'Febrero 2026', estado: 'PENDIENTE', importeRecibido: 200 }),
      ],
      2026
    );
    expect(r.totalImpagado).toBe(700);
    expect(r.totalPendiente).toBe(800);
    expect(r.totalCobrado).toBe(0); // los parciales no suman a cobrado: se documenta tal cual
  });

  it('lista vacía → todos los totales y meses en cero/vacío', () => {
    const r = calcularIngresosEjercicio([], 2026);
    expect(r.countTotal).toBe(0);
    expect(r.totalPrevisto).toBe(0);
    expect(r.mesesConIngreso).toEqual([]);
    expect(r.mesesImpagados).toEqual([]);
    expect(r.mesesParciales).toEqual([]);
  });
});

// ---------- Gastos por ejercicio ----------

describe('fiscalEngine · calcularGastosEjercicio', () => {
  it('filtra por año usando fechaDevengo > fechaPago > fecha > createdAt; ejercicioFiscal manda', () => {
    const r = calcularGastosEjercicio(
      [
        gasto({ id: 'a', fechaDevengo: '2026-02-11', importe: 100 }),
        gasto({ id: 'b', fechaDevengo: undefined as unknown as string, fechaPago: '2026-03-11', importe: 50 }),
        gasto({ id: 'c', fecha: '2026-04-11', importe: 25 }),
        gasto({ id: 'd', createdAt: '2026-05-11T00:00:00.000Z', importe: 10 }),
        gasto({ id: 'e', fecha: '2025-06-11', importe: 999 }),
        gasto({ id: 'f', fecha: '2025-01-11', ejercicioFiscal: 2026, importe: 60 }),
      ],
      2026
    );
    expect(r.gastos.map((g) => g.id)).toEqual(['a', 'b', 'c', 'd', 'f']);
    expect(r.total).toBe(245);
  });

  it('sin ninguna fecha parseable el gasto queda fuera (aunque declare ejercicioFiscal)', () => {
    const r = calcularGastosEjercicio(
      [gasto({ id: 'x', fecha: undefined as unknown as string, fechaDevengo: undefined as unknown as string, fechaPago: undefined as unknown as string, createdAt: 'no-fecha' as unknown as string, ejercicioFiscal: 2026, importe: 100 })],
      2026
    );
    expect(r.gastos).toHaveLength(0);
    expect(r.total).toBe(0);
  });

  it('ANULADO: fuera de totales y conteos, pero conservado en la referencia gastos', () => {
    const r = calcularGastosEjercicio(
      [
        gasto({ id: 'a', importe: 100 }),
        gasto({ id: 'b', importe: 50, estado: 'ANULADO' }),
      ],
      2026
    );
    expect(r.total).toBe(100);
    expect(r.countTotal).toBe(1);
    expect(r.gastos).toHaveLength(2); // referencia del ejercicio, sin copia física
    expect(r.porCategoria.COMUNIDAD).toBe(100);
  });

  it('desglose deducible/no deducible y por categoría', () => {
    const r = calcularGastosEjercicio(
      [
        gasto({ id: 'a', categoria: 'COMUNIDAD', importe: 100 }),
        gasto({ id: 'b', categoria: 'REPARACION', importe: 200, trabajoId: 'ot-1' }),
        gasto({ id: 'c', categoria: 'OTRO', importe: 80 }),
        gasto({ id: 'd', categoria: 'SEGUROS', importe: 120 }),
      ],
      2026
    );
    expect(r.total).toBe(500);
    expect(r.totalDeducible).toBe(420); // COMUNIDAD + REPARACION + SEGUROS
    expect(r.totalNoDeducible).toBe(80); // OTRO
    expect(r.countDeducible).toBe(3);
    expect(r.countNoDeducible).toBe(1);
    expect(r.porCategoria.COMUNIDAD).toBe(100);
    expect(r.porCategoriaDeducible.REPARACION).toBe(200);
    expect(r.porCategoriaNoDeducible.OTRO).toBe(80);
  });

  it('justificantes y vinculaciones (OT e hipoteca/seguro) se contabilizan (sin ANULADO)', () => {
    const r = calcularGastosEjercicio(
      [
        gasto({
          id: 'a',
          importe: 100,
          documento: { id: 'doc1', nombre: 'f.pdf', url: 'u', storagePath: 's' },
          trabajoId: 'ot-1',
        }),
        gasto({ id: 'b', importe: 50, categoria: 'SEGUROS' }),
        gasto({ id: 'c', importe: 30, incidenciaId: 'inc-1' }),
        gasto({ id: 'd', importe: 20, estado: 'ANULADO' }),
      ],
      2026
    );
    expect(r.gastosConJustificante).toBe(1);
    expect(r.gastosSinJustificante).toBe(2); // b y c (d ANULADO no cuenta)
    expect(r.gastosVinculadosOT).toBe(2); // a (trabajoId) + c (incidenciaId)
    expect(r.gastosVinculadosSeguro).toBe(1); // solo b (categoría SEGUROS)
  });

  it('lista vacía → totales cero y porCategoría vacío', () => {
    const r = calcularGastosEjercicio([], 2026);
    expect(r.total).toBe(0);
    expect(r.countTotal).toBe(0);
    expect(r.porCategoria).toEqual({});
  });
});

// ---------- Documentación fiscal ----------

describe('fiscalEngine · recopilarDocumentacionFiscal', () => {
  it('recoge justificantes de cobros y de gastos (ANULADO fuera), ordenados por fecha descendente', () => {
    const ingresos = calcularIngresosEjercicio(
      [
        cobro({
          id: 'cob1',
          mes: 1,
          estado: 'RECIBIDO',
          importeRecibido: 1000,
          fechaPago: '2026-01-04',
          justificante: { id: 'j1', nombreArchivo: 'recibo.pdf', storagePath: 'p/1.pdf', url: 'http://u/1', fechaSubida: '2026-01-04' },
        }),
        cobro({ id: 'cob2', mes: 2, periodoMesAnio: '2026-02', nombreMes: 'Febrero 2026', estado: 'RECIBIDO', importeRecibido: 1000 }),
      ],
      2026
    );
    const gastos = calcularGastosEjercicio(
      [
        gasto({
          id: 'g1',
          importe: 120,
          fecha: '2026-02-11',
          documento: { id: 'd1', nombre: 'factura.pdf', url: 'http://u/2', storagePath: 'p/2.pdf' },
        }),
        gasto({ id: 'g2', importe: 50, fecha: '2026-03-11', estado: 'ANULADO', documento: { id: 'd2', nombre: 'x.pdf', url: 'http://u/3' } }),
      ],
      2026
    );
    const docs = recopilarDocumentacionFiscal(ingresos, gastos);
    expect(docs).toHaveLength(2); // cob2 sin justificante y g2 ANULADO quedan fuera
    expect(docs[0]).toMatchObject({
      tipo: 'GASTO',
      referenciaId: 'g1',
      id: 'd1',
      nombreArchivo: 'factura.pdf',
      storagePath: 'p/2.pdf',
      importe: 120,
      ejercicio: 2026,
    });
    expect(docs[0].concepto).toBe('COMUNIDAD - Cuota comunidad');
    expect(docs[1]).toMatchObject({
      tipo: 'INGRESO',
      referenciaId: 'cob1',
      id: 'j1',
      importe: 1000,
      ejercicio: 2026,
    });
    expect(docs[1].concepto).toBe('Alquiler Enero 2026 - Inquilino Uno');
    expect(new Date(docs[0].fecha) > new Date(docs[1].fecha)).toBe(true); // descendente
  });

  it('cobro con justificante pero sin fechaPago usa la fecha de vencimiento', () => {
    const ingresos = calcularIngresosEjercicio(
      [
        cobro({
          id: 'cob1',
          mes: 1,
          estado: 'RECIBIDO',
          importeRecibido: 500,
          fechaVencimiento: '2026-01-05',
          justificante: { id: 'j1', nombreArchivo: 'r.pdf', fechaSubida: '2026-01-06' },
        }),
      ],
      2026
    );
    const docs = recopilarDocumentacionFiscal(ingresos, calcularGastosEjercicio([], 2026));
    expect(docs).toHaveLength(1);
    expect(docs[0].fecha).toBe('2026-01-05');
    // Sin fechaPago, el importe mostrado es el recibido.
    expect(docs[0].importe).toBe(500);
  });
});

// ---------- Resumen fiscal anual ----------

describe('fiscalEngine · generarResumenFiscalAnual', () => {
  const INM = inmueble();

  it('inmueble desconocido → null', () => {
    expect(generarResumenFiscalAnual('inm-X', 2026, [INM], [contrato()], [])).toBeNull();
  });

  it('resultado neto operativo = cobrado − deducibles; bruto = cobrado − totales; margen redondeado', () => {
    const c = contrato({
      registroCobros: [
        cobro({ id: 'cob1', mes: 1, estado: 'RECIBIDO', importeRecibido: 1000 }),
        cobro({ id: 'cob2', mes: 2, periodoMesAnio: '2026-02', nombreMes: 'Febrero 2026', estado: 'RECIBIDO', importeRecibido: 1000 }),
        cobro({ id: 'cob3', mes: 3, periodoMesAnio: '2026-03', nombreMes: 'Marzo 2026', estado: 'PENDIENTE' }),
      ],
    });
    const r = generarResumenFiscalAnual('inm-1', 2026, [INM], [c], [
      gasto({ id: 'g1', categoria: 'COMUNIDAD', importe: 120, fecha: '2026-01-10' }),
      gasto({ id: 'g2', categoria: 'OTRO', importe: 80, fecha: '2026-01-12' }),
    ]);
    expect(r).not.toBeNull();
    expect(r!.ingresos.totalCobrado).toBe(2000);
    expect(r!.gastos.total).toBe(200);
    expect(r!.gastos.totalDeducible).toBe(120);
    expect(r!.gastos.totalNoDeducible).toBe(80);
    expect(r!.resultadoNetoOperativo).toBe(1880); // 2000 − 120
    expect(r!.resultadoBruto).toBe(1800); // 2000 − 200
    expect(r!.margenOperativo).toBe(94); // round(1880/2000*100)
    expect(r!.fuente).toBe('DERIVADO_COBROS_GASTOS_CONTRATOS');
  });

  it('sin ingresos → margen 0 (no divide por cero)', () => {
    const r = generarResumenFiscalAnual('inm-1', 2026, [INM], [], [
      gasto({ id: 'g1', importe: 100 }),
    ]);
    expect(r!.ingresos.totalCobrado).toBe(0);
    expect(r!.margenOperativo).toBe(0);
    expect(r!.resultadoNetoOperativo).toBe(-100);
    expect(r!.diasAlquilados).toBe(0);
    expect(r!.diasSinAlquilar).toBe(365);
    expect(r!.periodosSinAlquiler).toEqual([{ inicio: '2026-01-01', fin: '2026-12-31', dias: 365 }]);
  });

  it('contratos: solo los que tocan el ejercicio; inquilinos únicos; sucesión sin sobrescribir', () => {
    const c2025 = contrato({ id: 'c2025', fechaInicioContrato: '2025-01-01', fechaFinContrato: '2025-12-31' });
    const c2027 = contrato({ id: 'c2027', fechaInicioContrato: '2027-01-01', fechaFinContrato: '2027-12-31' });
    const cA = contrato({ id: 'cA', candidatoId: 'cand-A', fechaInicioContrato: '2026-01-01', fechaFinContrato: '2026-05-31' });
    const cB = contrato({ id: 'cB', candidatoId: 'cand-B', fechaInicioContrato: '2026-06-01', fechaFinContrato: '2026-12-31' });
    const cMismoInq = contrato({ id: 'cC', candidatoId: 'cand-B', fechaInicioContrato: '2026-01-01', fechaFinContrato: '2025-12-31' as unknown as string });
    // cMismoInq termina antes del ejercicio → fuera.
    const r = generarResumenFiscalAnual('inm-1', 2026, [INM], [c2025, c2027, cA, cB, cMismoInq], []);
    expect(r!.numContratos).toBe(2); // solo cA y cB
    expect(r!.contratos.map((c) => c.id).sort()).toEqual(['cA', 'cB']);
    expect(r!.numInquilinos).toBe(2); // cand-A y cand-B únicos
    expect(r!.periodosOcupacion.map((p) => p.contratoId).sort()).toEqual(['cA', 'cB']);
    expect(r!.periodosAlquilados[0].fin).toBeDefined();
    // Gaps entre cA y cB: ninguno contiguo (cA fin 31-may, cB inicio 1-jun).
    expect(r!.periodosSinAlquiler).toEqual([]);
  });

  it('diasAlquilados suma la intersección por contrato; bisiesto usa 366; no negativo', () => {
    const parcial = contrato({ fechaInicioContrato: '2026-06-01', fechaFinContrato: '2026-12-31' });
    const r = generarResumenFiscalAnual('inm-1', 2026, [INM], [parcial], []);
    expect(r!.diasAlquilados).toBe(214);
    expect(r!.diasSinAlquilar).toBe(365 - 214);
    const r28 = generarResumenFiscalAnual('inm-1', 2028, [INM], [contrato({ fechaInicioContrato: '2028-01-01', fechaFinContrato: '2028-12-31' })], []);
    expect(r28!.diasSinAlquilar).toBe(0);
    expect(r28!.diasAlquilados).toBe(366);
  });

  it('ingresos derivados de TODOS los cobros del inmueble (año filtrado después): sin contaminación entre ejercicios', () => {
    const cViejo = contrato({
      id: 'cv',
      fechaInicioContrato: '2025-01-01',
      fechaFinContrato: '2025-12-31',
      registroCobros: [
        cobro({ id: 'cob25', contratoId: 'cv', anio: 2025, mes: 12, periodoMesAnio: '2025-12', nombreMes: 'Diciembre 2025', estado: 'RECIBIDO', importeRecibido: 1000 }),
      ],
    });
    const cNueva = contrato({
      id: 'cn',
      fechaInicioContrato: '2026-01-01',
      fechaFinContrato: '2026-12-31',
      registroCobros: [
        cobro({ id: 'cob26', contratoId: 'cn', mes: 1, estado: 'RECIBIDO', importePrevisto: 1200, importeRecibido: 1200 }),
      ],
    });
    const r2025 = generarResumenFiscalAnual('inm-1', 2025, [INM], [cViejo, cNueva], []);
    const r2026 = generarResumenFiscalAnual('inm-1', 2026, [INM], [cViejo, cNueva], []);
    expect(r2025!.ingresos.totalCobrado).toBe(1000);
    expect(r2025!.numContratos).toBe(1); // 2025 solo toca el contrato viejo
    expect(r2026!.ingresos.totalCobrado).toBe(1200);
    expect(r2026!.numContratos).toBe(1);
    expect(r2026!.periodosOcupacion[0].ingresosCobradosEjercicio).toBe(1200);
    expect(r2026!.periodosOcupacion[0].ingresosPrevistosEjercicio).toBe(1200);
  });

  it('gastos de otros inmuebles quedan fuera del resumen', () => {
    const r = generarResumenFiscalAnual('inm-1', 2026, [INM], [], [
      gasto({ id: 'g1', importe: 100 }),
      gasto({ id: 'g2', inmuebleId: 'inm-X', importe: 500 }),
    ]);
    expect(r!.gastos.total).toBe(100);
    expect(r!.gastos.gastos).toHaveLength(1);
  });

  it('atribución y metadatos: propietario (con fallback), generadoPor, claves del ejercicio', () => {
    const conFiscales = inmueble({
      datosFiscales: {
        referenciaCatastral: 'R1',
        propietarioPrincipal: { nombre: 'PF Uno', nifDni: '11111111A', direccion: 'D' },
      },
    });
    const r = generarResumenFiscalAnual('inm-1', 2026, [conFiscales], [], [], usuario({ nombre: 'Ana García' }), 'Auditoría');
    expect(r!.propietarioId).toBe('prop-1');
    expect(r!.propietarioNombre).toBe('PF Uno');
    expect(r!.generadoPor).toBe('Auditoría'); // el parámetro explícito manda
    expect(r!.ejercicio).toBe(2026);
    expect(r!.fechaInicioEjercicio).toBe('2026-01-01');
    expect(r!.fechaFinEjercicio).toBe('2026-12-31');
    expect(r!.numDocumentos).toBe(0);

    const r2 = generarResumenFiscalAnual('inm-1', 2026, [INM], [], []); // sin usuario ni parámetro
    expect(r2!.propietarioNombre).toBeUndefined(); // sin datosFiscales: sin nombre (comportamiento real)
    expect(r2!.generadoPor).toBe('Sistema');
    const r3 = generarResumenFiscalAnual('inm-1', 2026, [INM], [], [], usuario({ nombre: 'Ana García' }));
    expect(r3!.generadoPor).toBe('Ana García');
  });

  it('documentación agregada: numDocumentos coherente con la lista', () => {
    const c = contrato({
      registroCobros: [
        cobro({
          id: 'cob1',
          mes: 1,
          estado: 'RECIBIDO',
          importeRecibido: 1000,
          fechaPago: '2026-01-04',
          justificante: { id: 'j1', nombreArchivo: 'r.pdf', storagePath: 'p/1.pdf', url: 'http://u/1', fechaSubida: '2026-01-04' },
        }),
      ],
    });
    const r = generarResumenFiscalAnual('inm-1', 2026, [INM], [c], [
      gasto({ id: 'g1', importe: 100, fecha: '2026-01-10', documento: { id: 'd1', nombre: 'f.pdf', url: 'http://u/2', storagePath: 'p/2.pdf' } }),
    ]);
    expect(r!.numDocumentos).toBe(2);
    expect(r!.documentacion.map((d) => d.tipo).sort()).toEqual(['GASTO', 'INGRESO']);
  });

  it('determinismo económico: dos ejecuciones → mismos valores económicos (solo cambia generadoEn)', () => {
    const c = contrato({
      registroCobros: [cobro({ id: 'cob1', mes: 1, estado: 'RECIBIDO', importeRecibido: 1000 })],
    });
    const g = [gasto({ id: 'g1', importe: 100 })];
    const a = generarResumenFiscalAnual('inm-1', 2026, [INM], [c], g)!;
    const b = generarResumenFiscalAnual('inm-1', 2026, [INM], [c], g)!;
    const eco = (x: typeof a) => ({
      totalCobrado: x.ingresos.totalCobrado,
      totalPrevisto: x.ingresos.totalPrevisto,
      gastosTotal: x.gastos.total,
      gastosDeducible: x.gastos.totalDeducible,
      neto: x.resultadoNetoOperativo,
      bruto: x.resultadoBruto,
      margen: x.margenOperativo,
      dias: x.diasAlquilados,
      contratos: x.numContratos,
    });
    expect(eco(b)).toEqual(eco(a));
  });
});

// ---------- Histórico anual ----------

describe('fiscalEngine · generarHistoricoFiscalInmueble', () => {
  it('un resumen por ejercicio, orden descendente, sin ejercicios inviables', () => {
    const c = contrato({
      registroCobros: [
        cobro({ id: 'cob25', anio: 2025, mes: 12, periodoMesAnio: '2025-12', nombreMes: 'Diciembre 2025', estado: 'RECIBIDO', importeRecibido: 900 }),
        cobro({ id: 'cob26', mes: 1, estado: 'RECIBIDO', importeRecibido: 1100 }),
      ],
    });
    const h = generarHistoricoFiscalInmueble('inm-1', [2024, 2026, 2025], [inmueble()], [c], []);
    expect(h.map((r) => r.ejercicio)).toEqual([2026, 2025, 2024]);
    expect(h.find((r) => r.ejercicio === 2026)!.ingresos.totalCobrado).toBe(1100);
    expect(h.find((r) => r.ejercicio === 2025)!.ingresos.totalCobrado).toBe(900);
    expect(h.find((r) => r.ejercicio === 2024)!.ingresos.totalCobrado).toBe(0);
  });

  it('inmueble desconocido → histórico vacío (los nulos se descartan)', () => {
    expect(generarHistoricoFiscalInmueble('inm-X', [2026], [inmueble()], [], [])).toEqual([]);
  });
});

// ---------- Aislamiento por propietario ----------

describe('fiscalEngine · canAccessResumenFiscal / filtrarResumenesFiscalesPorUsuario', () => {
  const resumen = (p: { inmuebleId?: string; propietarioId?: string } = {}) =>
    generarResumenFiscalAnual(
      p.inmuebleId || 'inm-1',
      2026,
      [inmueble({ id: p.inmuebleId || 'inm-1', propietarioId: p.propietarioId || 'prop-1' })],
      [],
      []
    )!;

  it('sin usuario (legacy) y ADMINISTRADOR → acceso total', () => {
    expect(canAccessResumenFiscal(resumen())).toBe(true);
    expect(
      canAccessResumenFiscal(resumen(), usuario({ tipoPerfil: 'ADMINISTRADOR', propietarioId: 'prop-OTRA' }))
    ).toBe(true);
    expect(
      canAccessResumenFiscal(resumen(), usuario({ tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-1' }))
    ).toBe(true);
  });

  it('PROPIETARIO: por propietarioId propio o por inmuebleIds; si no, denegado', () => {
    const r = resumen();
    expect(
      canAccessResumenFiscal(r, usuario({ tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-1', inmuebleIds: [] }))
    ).toBe(true);
    expect(
      canAccessResumenFiscal(r, usuario({ tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-OTRA', inmuebleIds: ['inm-1'] }))
    ).toBe(true);
    expect(
      canAccessResumenFiscal(r, usuario({ tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-OTRA', inmuebleIds: ['inm-X'] }))
    ).toBe(false);
  });

  it('PROFESIONAL e INQUILINO → denegado', () => {
    expect(canAccessResumenFiscal(resumen(), usuario({ tipoPerfil: 'PROFESIONAL', propietarioId: 'prop-1' }))).toBe(false);
    expect(canAccessResumenFiscal(resumen(), usuario({ tipoPerfil: 'INQUILINO', propietarioId: 'prop-1' }))).toBe(false);
  });

  it('filtrarResumenesFiscalesPorUsuario: admin ve todo; propietario solo los suyos', () => {
    const deA = resumen({ inmuebleId: 'inm-1', propietarioId: 'prop-A' });
    const deB = resumen({ inmuebleId: 'inm-2', propietarioId: 'prop-B' });
    expect(filtrarResumenesFiscalesPorUsuario([deA, deB], usuario({ tipoPerfil: 'ADMINISTRADOR' }))).toHaveLength(2);
    const mio = filtrarResumenesFiscalesPorUsuario([deA, deB], usuario({ tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-A' }));
    expect(mio).toHaveLength(1);
    expect(mio[0].inmuebleId).toBe('inm-1');
    // Sin usuario → sin filtrar.
    expect(filtrarResumenesFiscalesPorUsuario([deA, deB])).toHaveLength(2);
  });
});

// ---------- Integración rentabilidad y consistencia ----------

describe('fiscalEngine · integrarFiscalConRentabilidad / validarConsistenciaFiscal', () => {
  it('integra los valores fiscales sin recalcular nada', () => {
    const r = generarResumenFiscalAnual(
      'inm-1',
      2026,
      [inmueble()],
      [
        contrato({
          registroCobros: [cobro({ id: 'cob1', mes: 1, estado: 'RECIBIDO', importeRecibido: 2000 })],
        }),
      ],
      [
        gasto({ id: 'g1', categoria: 'COMUNIDAD', importe: 120 }),
        gasto({ id: 'g2', categoria: 'OTRO', importe: 80 }),
      ]
    )!;
    const i = integrarFiscalConRentabilidad(r);
    expect(i.ingresos).toBe(2000);
    expect(i.gastos).toBe(200);
    expect(i.gastosDeducibles).toBe(120);
    expect(i.resultadoNeto).toBe(1880);
    expect(i.rentabilidadEstimada).toBe(r.margenOperativo); // no inventa otro ratio
  });

  it('consistencia: resumen limpio → válido', () => {
    const r = generarResumenFiscalAnual('inm-1', 2026, [inmueble()], [
      contrato({
        registroCobros: [
          cobro({ id: 'cob1', mes: 1, estado: 'RECIBIDO', importeRecibido: 1000 }),
          cobro({ id: 'cob2', mes: 2, periodoMesAnio: '2026-02', nombreMes: 'Febrero 2026', estado: 'PENDIENTE' }),
        ],
      }),
    ], [gasto({ id: 'g1', importe: 100 })]);
    const v = validarConsistenciaFiscal(r!);
    expect(v.valido).toBe(true);
    expect(v.errores).toEqual([]);
  });

  it('consistencia: cobros o gastos duplicados → error (no válido)', () => {
    const r = generarResumenFiscalAnual('inm-1', 2026, [inmueble()], [], [
      gasto({ id: 'g1', importe: 100 }),
    ]);
    const base = r!;
    // Duplicamos añadiendo dos refs al mismo id de cobro.
    const conCobros = {
      ...base,
      ingresos: {
        ...base.ingresos,
        cobros: [cobro({ id: 'cob1' }), cobro({ id: 'cob1', mes: 2, periodoMesAnio: '2026-02' })],
      },
    };
    expect(validarConsistenciaFiscal(conCobros as typeof base)).toMatchObject({ valido: false });
    expect(validarConsistenciaFiscal(conCobros as typeof base).errores[0]).toContain('Cobros duplicados');

    const dupGasto = {
      ...base,
      gastos: { ...base.gastos, gastos: [base.gastos.gastos[0] as Gasto, base.gastos.gastos[0] as Gasto] },
    };
    expect(validarConsistenciaFiscal(dupGasto as typeof base)).toMatchObject({ valido: false });
    expect(validarConsistenciaFiscal(dupGasto as typeof base).errores[0]).toContain('Gastos duplicados');
  });

  it('consistencia: storagePath repetido en documentación → advertencia (sigue siendo válido)', () => {
    const r = generarResumenFiscalAnual('inm-1', 2026, [inmueble()], [], []);
    const conDocs = {
      ...r!,
      documentacion: [
        { id: 'd1', tipo: 'GASTO' as const, referenciaId: 'g1', nombreArchivo: 'a.pdf', storagePath: 'p/same.pdf', fecha: '2026-01-01', ejercicio: 2026, importe: 1, concepto: 'x' },
        { id: 'd2', tipo: 'GASTO' as const, referenciaId: 'g2', nombreArchivo: 'b.pdf', storagePath: 'p/same.pdf', fecha: '2026-01-02', ejercicio: 2026, importe: 2, concepto: 'y' },
      ],
    };
    const v = validarConsistenciaFiscal(conDocs as typeof r);
    expect(v.valido).toBe(true);
    expect(v.advertencias.some((a) => a.includes('storagePath'))).toBe(true);
  });
});
