/**
 * BLOQUE B — Batería de pruebas: Tesorería, Liquidaciones de Propietarios y SEPA.
 * Ejecutar con: npx tsx scripts/test-bloque-b.ts
 * Cubre: motor de liquidación, gastos, SEPA utils, pain.008/001, conciliación,
 * notificaciones, seguridad/aislamiento e integración extremo a extremo.
 */
import type { CobroPeriodo, ContratoFormalizacion, Propietario, TrabajoProfesional } from '../src/types';
import {
  aprobarLiquidacion,
  anularLiquidacion,
  construirBorradorLiquidacion,
  existeLiquidacionPeriodo,
  marcarLiquidacionPagada,
  recalcularBorrador,
  reversarLiquidacionPagada,
  validarConfigFiscal,
} from '../src/tesoreria/liquidacionEngine';
import {
  clasificarCobrosPeriodo,
  evidenciaPagoDesdeMovimientoBancario,
  marcarCobrosLiquidados,
  movimientosBancariosParaLiquidacion,
  proyectarMovimientos,
  resumenCobrosLiquidados,
  resumenGastosLiquidados,
  sugerirConciliacion,
} from '../src/tesoreria/conciliacionAdapter';
import { crearGastoManual, gastoDesdeGastoCanonico, gastoDesdeTrabajo } from '../src/tesoreria/gastosEngine';
// INTEGRACIÓN A (2026-09-20): puentes GAP 1 / GAP 6 / gastos canónicos
import { eventoTesoreriaAEventoNotificacion } from '../src/notificaciones/adaptadores';
import { idempotenciaDeEvento } from '../src/types/notificaciones';
import { PLANTILLAS } from '../src/notificaciones/plantillas';
import type { Gasto } from '../src/types';
import type { MovimientoBancario, PropuestaConciliacion } from '../src/types/conciliacion';
import { generarPain008, validarXmlPain008 } from '../src/tesoreria/sepaPain008';
import { aprobarOrdenPago, crearOrdenPagoLiquidacion, generarPain001, validarXmlPain001 } from '../src/tesoreria/sepaPain001';
import {
  calcularCreditorIdES,
  escapeXml,
  generarEndToEndId,
  generarMsgId,
  hashContenido,
  normalizarIban,
  redondear2,
  sanitizarTextoSepa,
  validarBic,
  validarCreditorId,
  validarIban,
} from '../src/tesoreria/sepaUtils';
import {
  configurarAuditWriter,
  eventoLiquidacionAprobada,
  eventoLiquidacionGenerada,
  eventoSepaPreparado,
  publicarEventoTesoreria,
} from '../src/tesoreria/notificaciones';
import type { FicheroSEPA, GastoInmueble, LiquidacionPropietario, MandatoSEPA, OrdenPago } from '../src/tesoreria/tipos';

let passed = 0;
let failed = 0;

function assert(cond: boolean, id: number, name: string, detail?: string) {
  if (cond) {
    passed++;
    console.log(`✅ [B-${String(id).padStart(2, '0')}] PASS: ${name}`);
  } else {
    failed++;
    console.error(`❌ [B-${String(id).padStart(2, '0')}] FAIL: ${name} — ${detail || 'assertion failed'}`);
  }
}

const IBAN_OK = 'ES9121000418450200051332';
const IBAN_OK2 = 'ES7921000813610123456789'; // válido mod-97 (dígitos calculados abajo en test)
const IBAN_MAL = 'ES0012345678901234567890';

function esIbanValido(iban: string): boolean {
  return validarIban(iban).valido;
}

// Si el segundo IBAN de ejemplo no pasara mod-97, generamos uno válido por construcción.
function ibanValidoDesde(base20: string): string {
  // base20: 20 dígitos BBAN español
  const reordenado = `${base20}ES00`;
  let resto = 0;
  for (const ch of reordenado) {
    const code = ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of code) resto = (resto * 10 + Number(d)) % 97;
  }
  const dc = String(98 - resto).padStart(2, '0');
  return `ES${dc}${base20}`;
}
const IBAN_DEUDOR = esIbanValido(IBAN_OK2) ? normalizarIban(IBAN_OK2) : ibanValidoDesde('21000813610123456789');

function mkPropietario(id = 'prop_1'): Propietario {
  return {
    id,
    nombre: 'Propietario Uno',
    nifCif: '12345678Z',
    tipoPropietario: 'persona_fisica',
    telefono: '600111222',
    email: 'prop1@test.es',
    direccion: 'Calle Test 1',
    ciudad: 'Madrid',
    codigoPostal: '28001',
    cuentasBancarias: [{ id: 'cta1', alias: 'Principal', iban: IBAN_OK, titular: 'Propietario Uno', esPrincipal: true }],
    fechaCreacion: '2026-01-01',
    fechaActualizacion: '2026-01-01',
  };
}

function mkCobro(partial: Partial<CobroPeriodo> & { id: string }): CobroPeriodo {
  return {
    inmuebleId: 'inm_A',
    contratoId: 'cont_1',
    inquilinoId: 'cand_1',
    propietarioId: 'prop_1',
    inmuebleDireccion: 'Calle A 1',
    inquilinoNombre: 'Inquilino A',
    mes: 9,
    anio: 2026,
    periodoMesAnio: '2026-09',
    nombreMes: 'Septiembre 2026',
    importePrevisto: 900,
    importeRecibido: 900,
    fechaVencimiento: '2026-09-05',
    estado: 'RECIBIDO',
    historialCambios: [],
    ...partial,
  };
}

function mkContrato(id: string, cobros: CobroPeriodo[], propietarioId = 'prop_1'): ContratoFormalizacion {
  return {
    id,
    inmuebleId: 'inm_A',
    propietarioId,
    registroCobros: cobros,
  } as unknown as ContratoFormalizacion;
}

function mkGasto(partial: Partial<GastoInmueble> & { id: string }): GastoInmueble {
  return {
    inmuebleId: 'inm_A',
    propietarioId: 'prop_1',
    categoria: 'reparacion',
    concepto: 'Reparación test',
    base: 100,
    ivaPct: 21,
    ivaImporte: 21,
    total: 121,
    fechaGasto: '2026-09-10',
    pagadoPor: 'administracion',
    imputableA: 'propietario',
    estado: 'pendiente',
    fechaCreacion: '2026-09-10T00:00:00.000Z',
    fechaActualizacion: '2026-09-10T00:00:00.000Z',
    ...partial,
  };
}

function mkMandato(id: string, deudorIban = IBAN_DEUDOR): MandatoSEPA {
  return {
    id,
    deudorNombre: 'Inquilino Deudor',
    deudorIban,
    acreedorNombre: 'Administración Test',
    acreedorId: calcularCreditorIdES('000', 'B12345678'),
    fechaFirma: '2026-01-15',
    secuencia: 'RCUR',
    esquema: 'CORE',
    contratoId: 'cont_1',
    activo: true,
    fechaCreacion: '2026-01-15T00:00:00.000Z',
  };
}

async function run() {
  console.log('================================================================');
  console.log(' BLOQUE B — TESORERÍA, LIQUIDACIONES Y SEPA (batería de pruebas)');
  console.log('================================================================\n');

  // ---------- SEPA utils ----------
  assert(validarIban(IBAN_OK).valido, 1, 'IBAN español válido aceptado');
  assert(!validarIban(IBAN_MAL).valido, 2, 'IBAN con dígitos erróneos rechazado', validarIban(IBAN_MAL).error);
  assert(!validarIban('').valido, 3, 'IBAN vacío rechazado');
  assert(validarIban('es91 2100 0418 4502 0005 1332').iban === IBAN_OK, 4, 'IBAN se normaliza (espacios/minúsculas)');
  assert(validarBic('BBVAESMMXXX').valido && !validarBic('XX').valido, 5, 'BIC ISO 9362 validado');
  const ci = calcularCreditorIdES('000', 'B12345678');
  assert(validarCreditorId(ci).valido, 6, `Creditor ID ES generado y válido (${ci})`);
  assert(!validarCreditorId('ES00XXX').valido, 7, 'Creditor ID malformado rechazado');
  assert(sanitizarTextoSepa('José Ñoño — 5ª planta €100 & co.', 70) === 'Jose Nono 5a planta EUR100 + co.', 8, 'Charset SEPA sanea acentos/símbolos', sanitizarTextoSepa('José Ñoño — 5ª planta €100 & co.', 70));
  assert(hashContenido('abc') === hashContenido('abc') && hashContenido('abc') !== hashContenido('abd'), 9, 'hashContenido determinista y sensible');
  assert(generarMsgId('SDD', 'semilla', '2026-09-20').length <= 35 && generarMsgId('SDD', 'semilla', '2026-09-20') === generarMsgId('SDD', 'semilla', '2026-09-20'), 10, 'MsgId determinista ≤35');
  assert(generarEndToEndId('cobro', 'cobro_1', '2026-09').length <= 35, 11, 'EndToEndId ≤35 caracteres');
  assert(redondear2(10.005) === 10.01 && redondear2(2.675) === 2.68, 12, 'Redondeo contable a céntimos');
  assert(escapeXml('<a>&"\'') === '&lt;a&gt;&amp;&quot;&apos;', 13, 'Escape XML correcto');

  // ---------- Config fiscal ----------
  assert(validarConfigFiscal({ honorariosPct: 8, ivaHonorariosPct: 21, aplicaIvaHonorarios: true, aplicaRetencion: false, retencionPct: 19 }).valida, 14, 'Config por defecto válida');
  const cfgRetSinMotivo = validarConfigFiscal({ honorariosPct: 8, ivaHonorariosPct: 21, aplicaIvaHonorarios: true, aplicaRetencion: true, retencionPct: 19 });
  assert(!cfgRetSinMotivo.valida, 15, 'Retención sin motivo/fuente rechazada', cfgRetSinMotivo.errores.join(';'));
  assert(!validarConfigFiscal({ honorariosPct: 150, ivaHonorariosPct: 21, aplicaIvaHonorarios: true, aplicaRetencion: false, retencionPct: 0 }).valida, 16, 'Honorarios >100 rechazados');

  // ---------- Motor de liquidación ----------
  const prop = mkPropietario();
  const cobroA = mkCobro({ id: 'cobro_A_2026-09', inmuebleId: 'inm_A', inmuebleDireccion: 'Inmueble A', importePrevisto: 900, importeRecibido: 900, estado: 'RECIBIDO', fechaPago: '2026-09-03' });
  const cobroB = mkCobro({ id: 'cobro_B_2026-09', inmuebleId: 'inm_B', contratoId: 'cont_2', inmuebleDireccion: 'Inmueble B', importePrevisto: 750, importeRecibido: 750, estado: 'VERIFICADO', fechaPago: '2026-09-04' });
  const cobroPend = mkCobro({ id: 'cobro_C_2026-09', inmuebleId: 'inm_C', contratoId: 'cont_3', inmuebleDireccion: 'Inmueble C', importePrevisto: 1000, importeRecibido: 0, estado: 'PENDIENTE' });
  const cont1 = mkContrato('cont_1', [cobroA]);
  const cont2 = mkContrato('cont_2', [cobroB]);
  const cont3 = mkContrato('cont_3', [cobroPend]);
  const gasto1 = mkGasto({ id: 'gas_1', concepto: 'Reparación caldera', base: 200, ivaPct: 21, ivaImporte: 42, total: 242 });

  const r1 = construirBorradorLiquidacion({ propietario: prop, periodo: '2026-09', contratos: [cont1, cont2, cont3], gastos: [gasto1], config: { honorariosPct: 10, ivaHonorariosPct: 21, aplicaIvaHonorarios: true } });
  assert(r1.ok && !!r1.liquidacion, 17, 'Borrador multi-inmueble construido', r1.errores.join(';'));
  const liq = r1.liquidacion!;
  // Bruto 1650; honorarios 165; IVA 34.65; gastos 242; neto 1208.35
  assert(liq.totalBrutoCobrado === 1650, 18, 'Bruto = solo cobrado (1650)', String(liq.totalBrutoCobrado));
  assert(liq.totalDevengadoPendiente === 1000, 19, 'Pendiente informado aparte (1000)', String(liq.totalDevengadoPendiente));
  assert(liq.totalHonorarios === 165 && liq.totalIvaHonorarios === 34.65, 20, 'Honorarios 10% + IVA 21%', `${liq.totalHonorarios}/${liq.totalIvaHonorarios}`);
  assert(liq.totalGastos === 242, 21, 'Gastos imputables descontados', String(liq.totalGastos));
  assert(liq.netoPropietario === 1208.35, 22, 'Neto 1208.35 €', String(liq.netoPropietario));
  assert(liq.cobroIds.length === 2 && !liq.cobroIds.includes('cobro_C_2026-09'), 23, 'Cobro pendiente NO incluido en cobroIds');
  assert(liq.lineas.some((l) => l.naturaleza === 'devengado_pendiente' && l.importe === 0), 24, 'Línea informativa pendiente con importe 0');
  const suma = Math.round(liq.lineas.reduce((s, l) => s + l.importe, 0) * 100) / 100;
  assert(Math.abs(suma - liq.netoPropietario) < 0.011, 25, 'Cuadre líneas = neto', `${suma} vs ${liq.netoPropietario}`);
  assert(liq.id === 'liq_prop_1_2026-09', 26, 'Id idempotente por clave natural');

  // Determinismo
  const r1b = construirBorradorLiquidacion({ propietario: prop, periodo: '2026-09', contratos: [cont1, cont2, cont3], gastos: [gasto1], config: { honorariosPct: 10, ivaHonorariosPct: 21, aplicaIvaHonorarios: true } });
  assert(r1b.ok && r1b.liquidacion!.hashCalculo === liq.hashCalculo, 27, 'Mismos inputs ⇒ mismo hash (determinista)');
  assert(existeLiquidacionPeriodo([liq], 'prop_1', '2026-09')?.id === liq.id, 28, 'Detección de duplicado por periodo');
  assert(!existeLiquidacionPeriodo([{ ...liq, estado: 'ANULADA' }], 'prop_1', '2026-09'), 29, 'ANULADA no bloquea (permite regenerar)');

  // Periodo inválido
  const rMal = construirBorradorLiquidacion({ propietario: prop, periodo: '09-2026', contratos: [], gastos: [] });
  assert(!rMal.ok, 30, 'Periodo malformado rechazado');

  // Cobro parcial: solo lo recibido liquida
  const cobroParcial = mkCobro({ id: 'cobro_P_2026-09', importePrevisto: 900, importeRecibido: 400, estado: 'INCIDENCIA' });
  const rParc = construirBorradorLiquidacion({ propietario: prop, periodo: '2026-09', contratos: [mkContrato('cont_1', [cobroParcial])], gastos: [] });
  assert(rParc.ok && rParc.liquidacion!.totalBrutoCobrado === 0 && rParc.liquidacion!.totalDevengadoPendiente === 500, 31, 'INCIDENCIA no liquida aunque haya parcial (criterio estricto)', JSON.stringify({ b: rParc.liquidacion?.totalBrutoCobrado, p: rParc.liquidacion?.totalDevengadoPendiente }));

  // Retención parametrizada
  const rRet = construirBorradorLiquidacion({
    propietario: prop, periodo: '2026-09', contratos: [cont1], gastos: [],
    config: { honorariosPct: 0, aplicaIvaHonorarios: false, aplicaRetencion: true, retencionPct: 19, motivoRetencion: 'Arrendatario empresa, local urbano', fuenteRegla: 'Art. 75.3.g RIRPF' },
  });
  assert(rRet.ok && rRet.liquidacion!.totalRetenciones === 171 && rRet.liquidacion!.netoPropietario === 729, 32, 'Retención 19% sobre 900 = 171, neto 729', String(rRet.liquidacion?.netoPropietario));

  // Gasto pagado por propietario: informativo, no descuenta
  const gProp = mkGasto({ id: 'gas_prop', pagadoPor: 'propietario', total: 500, base: 413.22, ivaImporte: 86.78 });
  const rGProp = construirBorradorLiquidacion({ propietario: prop, periodo: '2026-09', contratos: [cont1], gastos: [gProp], config: { honorariosPct: 0, aplicaIvaHonorarios: false } });
  assert(rGProp.ok && rGProp.liquidacion!.totalGastos === 0 && rGProp.liquidacion!.netoPropietario === 900, 33, 'Gasto pagado por propietario no se descuenta');

  // Gasto de otro periodo: excluido
  const gOtro = mkGasto({ id: 'gas_otro', fechaGasto: '2026-08-01', total: 242 });
  const rGOtro = construirBorradorLiquidacion({ propietario: prop, periodo: '2026-09', contratos: [cont1], gastos: [gOtro], config: { honorariosPct: 0, aplicaIvaHonorarios: false } });
  assert(rGOtro.ok && rGOtro.liquidacion!.totalGastos === 0, 34, 'Gasto de otro periodo excluido');

  // Aislamiento: cobros de otro propietario no entran
  const cobroOtroProp = mkCobro({ id: 'cobro_otro', propietarioId: 'prop_2', importeRecibido: 5000, estado: 'RECIBIDO' });
  const rAisl = construirBorradorLiquidacion({ propietario: prop, periodo: '2026-09', contratos: [mkContrato('cont_1', [cobroA, cobroOtroProp])], gastos: [], config: { honorariosPct: 0, aplicaIvaHonorarios: false } });
  assert(rAisl.ok && rAisl.liquidacion!.totalBrutoCobrado === 900, 35, 'Cobros de prop_2 excluidos (aislamiento)', String(rAisl.liquidacion?.totalBrutoCobrado));

  // Copropiedad explícita
  const rCop = construirBorradorLiquidacion({
    propietario: prop, periodo: '2026-09', contratos: [cont1], gastos: [],
    config: { honorariosPct: 0, aplicaIvaHonorarios: false, repartoCopropiedad: { segundoPropietarioId: 'prop_2', segundoPropietarioNombre: 'Segundo', porcentajeSegundo: 50 } },
  });
  assert(rCop.ok && rCop.liquidacion!.netoPropietario === 450, 36, 'Reparto explícito 50% → neto titular 450', String(rCop.liquidacion?.netoPropietario));

  // Ciclo de estados
  const ap = aprobarLiquidacion(liq, { nombre: 'Admin' });
  assert(ap.ok && ap.liquidacion!.estado === 'APROBADA', 37, 'BORRADOR → APROBADA', ap.errores.join(';'));
  const sinIban = aprobarLiquidacion({ ...liq, cuentaAbonoIban: undefined });
  assert(!sinIban.ok, 38, 'Aprobar sin IBAN bloqueado', sinIban.errores.join(';'));
  const ap2 = aprobarLiquidacion(ap.liquidacion!);
  assert(!ap2.ok, 39, 'Doble aprobación bloqueada');
  const pg = marcarLiquidacionPagada(ap.liquidacion!, { referenciaBancaria: 'TRF-001', fechaPago: '2026-09-21' });
  assert(pg.ok && pg.liquidacion!.estado === 'PAGADA', 40, 'APROBADA → PAGADA con evidencia');
  const pgSinRef = marcarLiquidacionPagada(ap.liquidacion!, { referenciaBancaria: '' });
  assert(!pgSinRef.ok, 41, 'Pago sin referencia bloqueado');
  const anBorr = anularLiquidacion(liq, 'Error de periodo');
  assert(anBorr.ok && anBorr.liquidacion!.estado === 'ANULADA', 42, 'BORRADOR anulable con motivo');
  const anPag = anularLiquidacion(pg.liquidacion!, 'x');
  assert(!anPag.ok, 43, 'PAGADA no anulable directamente', anPag.errores.join(';'));
  const rev = reversarLiquidacionPagada(pg.liquidacion!, 'Devolución bancaria');
  assert(rev.ok && rev.liquidacion!.estado === 'REVERSADA' && rev.liquidacion!.netoPropietario === -1208.35, 44, 'Reverso de PAGADA con signos invertidos', String(rev.liquidacion?.netoPropietario));
  const rec = recalcularBorrador(liq, { propietario: prop, periodo: '2026-09', contratos: [cont1, cont2, cont3], gastos: [gasto1], config: liq.configFiscal });
  assert(rec.ok && rec.liquidacion!.historial.length === liq.historial.length + 1, 45, 'Recalcular BORRADOR conserva historial +1');
  const recMal = recalcularBorrador(ap.liquidacion!, { propietario: prop, periodo: '2026-09', contratos: [], gastos: [] });
  assert(!recMal.ok, 46, 'Recalcular APROBADA bloqueado');

  // ---------- Gastos ----------
  const gm = crearGastoManual({ inmuebleId: 'inm_A', propietarioId: 'prop_1', categoria: 'comunidad', concepto: 'Cuota comunidad', baseOtotal: 121, esBaseSinIva: false, ivaPct: 21, fechaGasto: '2026-09-01', pagadoPor: 'administracion', imputableA: 'propietario' });
  assert(gm.ok && gm.gasto!.base === 100 && gm.gasto!.ivaImporte === 21 && gm.gasto!.total === 121, 47, 'Gasto manual desde total con IVA 21%', JSON.stringify(gm.gasto && { b: gm.gasto.base, i: gm.gasto.ivaImporte }));
  const gm2 = crearGastoManual({ inmuebleId: 'inm_A', propietarioId: 'prop_1', categoria: 'ibi', concepto: 'IBI', baseOtotal: 300, esBaseSinIva: true, ivaPct: 0, fechaGasto: '2026-09-01', pagadoPor: 'administracion', imputableA: 'propietario' });
  assert(gm2.ok && gm2.gasto!.total === 300, 48, 'Gasto exento IVA 0%');
  assert(!crearGastoManual({ inmuebleId: '', propietarioId: 'p', categoria: 'x', concepto: '', baseOtotal: -5, esBaseSinIva: true, ivaPct: 21, fechaGasto: 'mal', pagadoPor: 'administracion', imputableA: 'propietario' }).ok, 49, 'Gasto manual inválido rechazado');
  const trabajoOk = { id: 'trab_1', propietarioId: 'prop_1', inmuebleId: 'inm_A', estado: 'FINALIZADO', titulo: 'Fontanería', importeFinal: 242, facturaNumero: 'F-1', profesionalNombre: 'Fontanero SL' } as unknown as TrabajoProfesional;
  const gt = gastoDesdeTrabajo(trabajoOk);
  assert(gt.ok && gt.gasto!.id === 'gas_trab_1' && gt.gasto!.trabajoId === 'trab_1' && gt.gasto!.total === 242, 50, 'Gasto importado de trabajo finalizado (id idempotente)');
  const trabajoNoFin = { ...trabajoOk, estado: 'EN_CURSO' } as unknown as TrabajoProfesional;
  assert(!gastoDesdeTrabajo(trabajoNoFin).ok, 51, 'Trabajo no finalizado no genera gasto');

  // ---------- pain.008 ----------
  const mandato = mkMandato('MND-test-1');
  const cobroDom = mkCobro({ id: 'cobro_dom_2026-10', periodoMesAnio: '2026-10', nombreMes: 'Octubre 2026', mes: 10, estado: 'PENDIENTE', importePrevisto: 900, importeRecibido: 0 });
  const p8 = generarPain008({
    acreedor: { nombre: 'Adm Test', creditorId: mandato.acreedorId, iban: IBAN_OK },
    adeudos: [{ cobro: cobroDom, mandato }],
    fechaCobro: '2026-10-05',
  });
  assert(p8.ok && !!p8.fichero, 52, 'pain.008 generado y validado', p8.errores.join(';'));
  const f8 = p8.fichero!;
  assert(f8.xml.includes('pain.008.001.02') && f8.xml.includes('<NbOfTxs>1</NbOfTxs>') && f8.xml.includes('<CtrlSum>900.00</CtrlSum>') && f8.xml.includes(mandato.id), 53, 'XML 008 contiene versión/nº/suma/mandato');
  assert(f8.xml.includes('<EndToEndId>') && f8.items[0].referencia.length <= 35, 54, 'EndToEndId trazable presente');
  assert(validarXmlPain008(f8).length === 0, 55, 'Revalidación estructural 008 sin errores');
  const p8dup = generarPain008({
    acreedor: { nombre: 'Adm Test', creditorId: mandato.acreedorId, iban: IBAN_OK },
    adeudos: [{ cobro: cobroDom, mandato }], fechaCobro: '2026-10-05', ficherosExistentes: [f8],
  });
  assert(!p8dup.ok && !!p8dup.duplicadoDe, 56, 'Duplicado 008 detectado por hash', p8dup.errores.join(';'));
  const p8mal = generarPain008({
    acreedor: { nombre: '', creditorId: 'MAL', iban: 'MAL' },
    adeudos: [{ cobro: cobroDom, mandato: { ...mandato, deudorIban: 'MAL', fechaFirma: 'x' } }],
    fechaCobro: '2026-13-99',
  });
  assert(!p8mal.ok && p8mal.errores.length >= 4, 57, '008 inválido rechazado con múltiples errores', p8mal.errores.join(' | '));
  const f8t = { ...f8, xml: f8.xml.replaceAll('<CtrlSum>900.00</CtrlSum>', '<CtrlSum>1.00</CtrlSum>') };
  assert(validarXmlPain008(f8t).length > 0, 58, 'Manipulación de CtrlSum detectada');

  // ---------- pain.001 ----------
  const ordRes = crearOrdenPagoLiquidacion({ id: liq.id, periodo: '2026-09', propietarioNombre: prop.nombre, netoPropietario: liq.netoPropietario, cuentaAbonoIban: IBAN_OK, estado: 'APROBADA' }, undefined, { nombre: 'Admin' });
  assert(ordRes.ok && ordRes.orden!.origenTipo === 'liquidacion' && ordRes.orden!.id === `op_liq_${liq.id}`, 59, 'Orden creada desde APROBADA (id idempotente)');
  assert(!crearOrdenPagoLiquidacion({ id: 'x', periodo: '2026-09', propietarioNombre: 'p', netoPropietario: 100, cuentaAbonoIban: IBAN_OK, estado: 'BORRADOR' }, undefined).ok, 60, 'Orden desde BORRADOR rechazada');
  assert(!crearOrdenPagoLiquidacion({ id: 'x', periodo: '2026-09', propietarioNombre: 'p', netoPropietario: -5, cuentaAbonoIban: IBAN_OK, estado: 'APROBADA' }, undefined).ok, 61, 'Orden con neto negativo rechazada');
  const orden = aprobarOrdenPago(ordRes.orden!, { nombre: 'Admin' });
  assert(orden.estado === 'APROBADA', 62, 'Orden BORRADOR → APROBADA');
  const p1 = generarPain001({ ordenante: { nombre: 'Adm Test', iban: IBAN_OK }, ordenes: [orden], fechaEjecucion: '2026-09-25' });
  assert(p1.ok && !!p1.fichero, 63, 'pain.001 generado y validado', p1.errores.join(';'));
  const f1 = p1.fichero!;
  assert(f1.xml.includes('pain.001.001.03') && f1.xml.includes(orden.referenciaEndToEnd) && f1.xml.includes('<CtrlSum>1208.35</CtrlSum>'), 64, 'XML 001 contiene versión/E2E/suma');
  assert(validarXmlPain001(f1).length === 0, 65, 'Revalidación estructural 001 sin errores');
  const ordenSinOrigen = { ...orden, origenId: '', origenTipo: '' } as unknown as OrdenPago;
  assert(!generarPain001({ ordenante: { nombre: 'A', iban: IBAN_OK }, ordenes: [ordenSinOrigen], fechaEjecucion: '2026-09-25' }).ok, 66, '001 rechaza orden sin origen (anti importe-libre)');
  assert(!generarPain001({ ordenante: { nombre: 'A', iban: IBAN_OK }, ordenes: [{ ...orden, estado: 'BORRADOR' }], fechaEjecucion: '2026-09-25' }).ok, 67, '001 rechaza orden en BORRADOR');
  const p1dup = generarPain001({ ordenante: { nombre: 'Adm Test', iban: IBAN_OK }, ordenes: [orden], fechaEjecucion: '2026-09-25', ficherosExistentes: [f1] });
  assert(!p1dup.ok && !!p1dup.duplicadoDe, 68, 'Duplicado 001 detectado por hash');

  // ---------- Conciliación (adaptador) ----------
  const clas = clasificarCobrosPeriodo([cont1, cont2, cont3], 'prop_1', '2026-09');
  assert(clas.liquidables.length === 2 && clas.pendientes.length === 1, 69, 'Clasificación liquidables/pendientes');
  assert(resumenCobrosLiquidados([liq]).has('cobro_A_2026-09') && !resumenCobrosLiquidados([{ ...liq, estado: 'ANULADA' }]).has('cobro_A_2026-09'), 70, 'Cobros liquidados excluyen ANULADA');
  assert(resumenGastosLiquidados([liq]).has('gas_1'), 71, 'Gastos liquidados referenciados');
  const marcados = marcarCobrosLiquidados([cont1], ['cobro_A_2026-09'], liq.id, 'Tesorería');
  const hist1 = marcados[0].registroCobros![0].historialCambios.length;
  const marcados2 = marcarCobrosLiquidados(marcados, ['cobro_A_2026-09'], liq.id, 'Tesorería');
  assert(hist1 === 1 && marcados2[0].registroCobros![0].historialCambios.length === 1, 72, 'Marca cobro→liquidación idempotente');
  const movs = proyectarMovimientos([cont1, cont2], [pg.liquidacion!], [], [gasto1]);
  const cobroMov = movs.find((m) => m.cobroId === 'cobro_A_2026-09');
  const pagoMov = movs.find((m) => m.liquidacionId === liq.id);
  assert(!!cobroMov && cobroMov.importe === 900 && !!pagoMov && pagoMov.importe === -1208.35, 73, 'Movimientos con signos +/− y referencias');
  const coinc = sugerirConciliacion(
    [{ id: 'ap_1', fecha: '2026-09-04', importe: 900, concepto: 'Transferencia alquiler', referencia: cobroA.referenciaBancaria }],
    movs,
  );
  assert(coinc.length > 0 && coinc[0].score >= 70, 74, 'Sugerencia de conciliación por importe+fecha', JSON.stringify(coinc[0]));
  assert(sugerirConciliacion([{ id: 'ap_x', fecha: '2026-09-04', importe: 1, concepto: 'otro' }], movs).length === 0, 75, 'Sin coincidencia si el importe difiere');

  // ---------- Notificaciones ----------
  let auditadas = 0;
  configurarAuditWriter(() => { auditadas++; });
  const ev1 = publicarEventoTesoreria(eventoLiquidacionGenerada({ liquidacionId: liq.id, periodo: '2026-09', propietarioId: 'prop_1', propietarioNombre: 'P', neto: 100 }));
  const ev2 = publicarEventoTesoreria(eventoLiquidacionAprobada({ liquidacionId: liq.id, periodo: '2026-09', propietarioId: 'prop_1', propietarioNombre: 'P', neto: 100 }));
  const ev3 = publicarEventoTesoreria(eventoSepaPreparado({ ficheroId: f1.id, tipo: 'pain.001', msgId: f1.msgId, numOperaciones: 1, importeTotal: 100 }));
  assert(ev1.evento === 'liquidacion.generada' && ev2.evento === 'liquidacion.aprobada' && ev3.evento === 'sepa.preparado' && auditadas === 3, 76, 'Eventos tipados publicados en auditoría');
  configurarAuditWriter(() => { throw new Error('fallo audit'); });
  const evSafe = publicarEventoTesoreria(eventoLiquidacionGenerada({ liquidacionId: 'x', periodo: '2026-09', propietarioId: 'p', propietarioNombre: 'P', neto: 1 }));
  assert(!!evSafe.id, 77, 'Fallo de auditoría no rompe el flujo (seguro)');
  configurarAuditWriter(null);

  // ---------- Integración extremo a extremo ----------
  const liqInt = construirBorradorLiquidacion({ propietario: prop, periodo: '2026-09', contratos: [cont1], gastos: [], config: { honorariosPct: 8, ivaHonorariosPct: 21, aplicaIvaHonorarios: true } }).liquidacion!;
  const apInt = aprobarLiquidacion(liqInt)!.liquidacion!;
  const ordInt = aprobarOrdenPago(crearOrdenPagoLiquidacion({ id: apInt.id, periodo: apInt.periodo, propietarioNombre: apInt.propietarioNombre, netoPropietario: apInt.netoPropietario, cuentaAbonoIban: IBAN_OK, estado: 'APROBADA' }, undefined)!.orden!);
  const fInt = generarPain001({ ordenante: { nombre: 'Adm', iban: IBAN_OK }, ordenes: [ordInt], fechaEjecucion: '2026-09-25' }).fichero!;
  const pgInt = marcarLiquidacionPagada({ ...apInt, ordenPagoId: ordInt.id }, { referenciaBancaria: fInt.msgId })!.liquidacion!;
  assert(pgInt.estado === 'PAGADA' && pgInt.ordenPagoId === ordInt.id && fInt.items[0].origenId === ordInt.id && ordInt.origenId === apInt.id, 78, 'Circuito cobro→liquidación→orden→pain.001→pago trazable');
  // Neto esperado: 900 − 72 − 15.12 = 812.88
  assert(pgInt.netoPropietario === 812.88, 79, 'Neto integración 812.88 €', String(pgInt.netoPropietario));

  // ---------- INTEGRACIÓN A: gasto canónico → proyección de liquidación ----------
  const gastoCanonico: Gasto = {
    id: 'gas_inm_A_1', inmuebleId: 'inm_A', propietarioId: 'prop_1',
    tipo: 'EXPLOTACION', categoria: 'REPARACION', concepto: 'Caldera',
    proveedor: 'Fontanera SL', importe: 242, estado: 'PAGADO',
    fechaDevengo: '2026-09-02', fechaPago: '2026-09-03',
    aCargoDe: 'arrendador', deducible: true,
    origen: 'ORDEN_TRABAJO', origenId: 'trab_1', trabajoId: 'trab_1',
  } as unknown as Gasto;
  const gc = gastoDesdeGastoCanonico(gastoCanonico);
  assert(gc.ok && gc.gasto!.id === 'gas_gasto_gas_inm_A_1' && gc.gasto!.total === 242, 80, 'Importa gasto canónico a proyección (id idempotente, total trazable)', JSON.stringify(gc.gasto && { id: gc.gasto.id, total: gc.gasto.total }));
  assert(gc.gasto!.imputableA === 'propietario' && gc.gasto!.trabajoId === 'trab_1' && gc.gasto!.propietarioId === 'prop_1', 81, 'Mapeo aCargoDe arrendador→imputableA propietario + origen trabajo');
  const gc2 = gastoDesdeGastoCanonico(gastoCanonico, gc.gasto!, { pagadoPor: 'administracion' });
  assert(gc2.ok && gc2.gasto!.id === 'gas_gasto_gas_inm_A_1' && gc2.gasto!.total === 242, 82, 'Reimportación idempotente (no duplica, conserva id/estado)');
  const gcMal = gastoDesdeGastoCanonico({ ...gastoCanonico, importe: 0 } as unknown as Gasto);
  assert(!gcMal.ok, 83, 'Gasto canónico sin importe positivo rechazado');

  // Guard: un trabajo con gastoId (puente canónico) NO se duplica vía gastoDesdeTrabajo
  const trabajoConGasto = { id: 'trab_2', propietarioId: 'prop_1', inmuebleId: 'inm_A', estado: 'FINALIZADO', titulo: 'Electricidad', importeFinal: 150, gastoId: 'gas_trab_2' } as unknown as TrabajoProfesional;
  const gtGuard = gastoDesdeTrabajo(trabajoConGasto);
  assert(!gtGuard.ok && gtGuard.errores.some((e) => e.includes('gastoDesdeGastoCanonico')), 84, 'Trabajo con gastoId se remite al importador canónico (anti doble registro)');

  // ---------- INTEGRACIÓN A: evidencia de pago desde GAP 6 ----------
  const mkMov = (partial: Partial<MovimientoBancario> & { idMovimiento: string }): MovimientoBancario =>
    ({
      idImportacion: 'imp_1',
      fechaOperacion: '2026-09-20',
      importe: -812.88,
      tipo: 'GASTO',
      concepto: 'Liquidación',
      conceptoOriginal: 'ABONO LIQ SEP',
      referencia: 'TRF-2026-09-001',
      identificadorBanco: 'FITID-1',
      origen: 'CSV',
      propietarioId: 'prop_1',
      metadatosOriginales: {},
      hashIdempotencia: `hash_${partial.idMovimiento}`,
      fechaImportacion: '2026-09-20T10:00:00Z',
      ...partial,
    }) as unknown as MovimientoBancario;
  const movA = mkMov({ idMovimiento: 'MOV_A' });
  const evA = evidenciaPagoDesdeMovimientoBancario(movA);
  assert(evA.referenciaBancaria === 'TRF-2026-09-001' && evA.fechaPago === '2026-09-20' && evA.importe === -812.88, 85, 'Evidencia de pago extraída de movimiento (referencia/fecha/importe)');

  const mkProp = (partial: Partial<PropuestaConciliacion> & { id: string; movimientoId: string }): PropuestaConciliacion =>
    ({
      idImportacion: 'imp_1',
      propietarioId: 'prop_1',
      puntuacion: 95,
      confianza: 'ALTA',
      factores: [],
      estado: 'PENDIENTE',
      esDiscrepancia: false,
      fechaPropuesta: '2026-09-20T10:00:00Z',
      propuestaPor: 'USUARIO',
      historial: [],
      ...partial,
    }) as unknown as PropuestaConciliacion;
  const propConfirmada = mkProp({ id: 'conc_1', movimientoId: 'MOV_A', estado: 'CONFIRMADO', importeMovimiento: -812.88 });
  const propPendiente = mkProp({ id: 'conc_2', movimientoId: 'MOV_B', estado: 'PENDIENTE', importeMovimiento: -100 });
  const movB = mkMov({ idMovimiento: 'MOV_B', importe: -100, referencia: 'TRF-B' });
  const movIngreso = mkMov({ idMovimiento: 'MOV_C', importe: 500, referencia: 'ING' });
  const movOtroProp = mkMov({ idMovimiento: 'MOV_D', importe: -50, referencia: 'OTRO', propietarioId: 'prop_2' });
  const evidencias = movimientosBancariosParaLiquidacion([movA, movB, movIngreso, movOtroProp], [propConfirmada, propPendiente], { id: 'liq_x', propietarioId: 'prop_1' });
  assert(evidencias.length === 1 && evidencias[0].idMovimiento === 'MOV_A', 86, 'Solo movimientos CONFIRMADOS + negativos + del propietario sirven de evidencia', JSON.stringify(evidencias.map((e) => e.idMovimiento)));

  // ---------- INTEGRACIÓN A: puente GAP 1 (eventos canónicos) ----------
  const evtGen = eventoLiquidacionGenerada({ liquidacionId: 'liq_1', periodo: '2026-09', propietarioId: 'prop_1', propietarioNombre: 'Ana', neto: 812.88 });
  const gap1 = eventoTesoreriaAEventoNotificacion(evtGen, { email: 'ana@x.com', nombre: 'Ana' });
  assert(gap1.origen === 'TESORERIA' && gap1.tipoEvento === 'tesoreria.liquidacion_generada' && gap1.entidadId === 'liq_1', 87, 'Puente GAP1: origen TESORERIA + tipoEvento tesoreria.* + entidadId');
  assert(gap1.idempotencyKey === idempotenciaDeEvento('TESORERIA', 'liquidacion_generada', 'liq_1'), 88, 'Puente GAP1: idempotencyKey canónica (idempotenciaDeEvento)');
  assert(gap1.destinatario?.email === 'ana@x.com' && gap1.propietarioId === 'prop_1', 89, 'Puente GAP1: destinatario por propietario (ownership)');
  const gap1b = eventoTesoreriaAEventoNotificacion({ ...evtGen, id: 'otro' });
  assert(gap1.idempotencyKey === gap1b.idempotencyKey, 90, 'Puente GAP1: misma entidad → misma clave (repetir suceso no duplica)');
  const todasTesoreria = Object.keys(PLANTILLAS).filter((k) => k.startsWith('tesoreria.'));
  assert(todasTesoreria.length === 7, 91, 'Registro GAP1: 7 plantillas tesoreria.* presentes', String(todasTesoreria.length));
  assert(todasTesoreria.every((k) => PLANTILLAS[k].id === k && PLANTILLAS[k].canalesPermitidos.includes('INAPP')), 92, 'Plantillas tesoreria.* coherentes (id + canal INAPP)');

  console.log('\n================================================================');
  console.log(` RESULTADO BLOQUE B: ${passed} PASS · ${failed} FAIL (${passed + failed} pruebas)`);
  console.log('================================================================');
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error('ERROR fatal en batería BLOQUE B:', e);
  process.exit(1);
});
