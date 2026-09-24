/**
 * BLOQUE B — Generador/validador SEPA Credit Transfer pain.001.001.03 (SCT).
 * Flujo: OBLIGACIÓN REAL (orden de pago con origen trazable) → GENERAR → VALIDAR → PREPARAR.
 * Nunca permite un importe libre sin entidad origen. Nunca envía al banco.
 */
import {
  esFechaValida,
  escapeXml,
  formatoImporteSepa,
  generarMsgId,
  hashContenido,
  redondear2,
  sanitizarTextoSepa,
  SEPA_VERSION_PAIN001,
  validarIban,
} from './sepaUtils';
import type { FicheroSEPA, ItemFicheroSEPA, OrdenPago } from './tipos';

export interface DatosOrdenante001 {
  nombre: string;
  iban: string;
  bic?: string;
}

export interface EntradaPain001 {
  ordenante: DatosOrdenante001;
  ordenes: OrdenPago[];
  fechaEjecucion: string; // ReqdExctnDt YYYY-MM-DD
  actor?: { id?: string; nombre?: string };
  ficherosExistentes?: FicheroSEPA[];
}

export interface ResultadoPain001 {
  ok: boolean;
  errores: string[];
  fichero?: FicheroSEPA;
  duplicadoDe?: string;
}

export function validarEntradaPain001(entrada: EntradaPain001): string[] {
  const errores: string[] = [];
  if (!entrada.ordenante?.nombre?.trim()) errores.push('Falta nombre del ordenante');
  const ib = validarIban(entrada.ordenante?.iban || '');
  if (!ib.valido) errores.push(`IBAN ordenante inválido: ${ib.error}`);
  if (!esFechaValida(entrada.fechaEjecucion)) errores.push(`Fecha de ejecución inválida: ${entrada.fechaEjecucion}`);
  if (!entrada.ordenes || entrada.ordenes.length === 0) {
    errores.push('Sin órdenes: el fichero requiere al menos una orden de pago con origen trazable');
  }
  const e2e = new Set<string>();
  (entrada.ordenes || []).forEach((o, i) => {
    const tag = `Orden ${i + 1} (${o.id || 'sin id'})`;
    if (!o.origenTipo || !o.origenId) {
      errores.push(`${tag}: falta entidad origen trazable (se rechaza importe libre sin origen)`);
    }
    if (!(redondear2(o.importe) > 0)) errores.push(`${tag}: importe debe ser > 0`);
    if (!o.beneficiarioNombre?.trim()) errores.push(`${tag}: falta beneficiario`);
    const bib = validarIban(o.beneficiarioIban || '');
    if (!bib.valido) errores.push(`${tag}: IBAN beneficiario inválido (${bib.error})`);
    if (o.estado !== 'APROBADA' && o.estado !== 'EN_FICHERO') {
      errores.push(`${tag}: estado ${o.estado} no apto (debe estar APROBADA)`);
    }
    if (!o.referenciaEndToEnd?.trim()) errores.push(`${tag}: falta EndToEndId`);
    else if (e2e.has(o.referenciaEndToEnd)) errores.push(`${tag}: EndToEndId duplicado (${o.referenciaEndToEnd})`);
    else e2e.add(o.referenciaEndToEnd);
  });
  return errores;
}

/** Construye una orden de pago desde una liquidación aprobada (idempotente por id). */
export function crearOrdenPagoLiquidacion(
  liquidacion: { id: string; periodo: string; propietarioNombre: string; netoPropietario: number; cuentaAbonoIban?: string; estado: string },
  beneficiarioBic: string | undefined,
  actor?: { id?: string; nombre?: string },
): { ok: boolean; errores: string[]; orden?: OrdenPago } {
  const errores: string[] = [];
  if (liquidacion.estado !== 'APROBADA') {
    return { ok: false, errores: [`La liquidación debe estar APROBADA (estado: ${liquidacion.estado})`] };
  }
  if (!(liquidacion.netoPropietario > 0)) {
    return { ok: false, errores: ['Neto no positivo: no procede orden de pago (revise deducciones)'] };
  }
  const ib = validarIban(liquidacion.cuentaAbonoIban || '');
  if (!ib.valido) {
    return { ok: false, errores: [`IBAN de abono inválido: ${ib.error}`] };
  }
  const id = `op_liq_${liquidacion.id}`;
  const orden: OrdenPago = {
    id,
    tipo: 'liquidacion_propietario',
    origenTipo: 'liquidacion',
    origenId: liquidacion.id,
    origenReferencia: `Liquidación ${liquidacion.periodo}`,
    beneficiarioNombre: liquidacion.propietarioNombre,
    beneficiarioIban: ib.iban!,
    beneficiarioBic,
    importe: redondear2(liquidacion.netoPropietario),
    concepto: `Liquidación alquileres ${liquidacion.periodo} — ${liquidacion.propietarioNombre}`,
    referenciaEndToEnd: `E2ELIQ${liquidacion.periodo.replace('-', '')}${hashContenido(liquidacion.id).toUpperCase()}`.slice(0, 35),
    estado: 'BORRADOR',
    fechaCreacion: new Date().toISOString(),
    creadoPor: actor?.nombre,
    creadoPorId: actor?.id,
    historial: [
      { id: `h_${id}`, fecha: new Date().toISOString(), accion: 'Orden creada desde liquidación aprobada', detalle: `${formatoImporteSepa(liquidacion.netoPropietario)} € → ${ib.iban}`, actorNombre: actor?.nombre },
    ],
  };
  return { ok: true, errores, orden };
}

export function aprobarOrdenPago(o: OrdenPago, actor?: { id?: string; nombre?: string }): OrdenPago {
  if (o.estado !== 'BORRADOR') return o;
  return {
    ...o,
    estado: 'APROBADA',
    fechaAprobacion: new Date().toISOString(),
    historial: [...o.historial, { id: `h_ap_${Date.now().toString(36)}`, fecha: new Date().toISOString(), accion: 'Orden aprobada', actorNombre: actor?.nombre }],
  };
}

export function generarPain001(entrada: EntradaPain001): ResultadoPain001 {
  const errores = validarEntradaPain001(entrada);
  if (errores.length > 0) return { ok: false, errores };

  const ordenadas = [...entrada.ordenes].sort((a, b) => a.referenciaEndToEnd.localeCompare(b.referenciaEndToEnd));
  const items: ItemFicheroSEPA[] = ordenadas.map((o) => ({
    id: `tx_${o.id}`,
    origenTipo: 'orden_pago',
    origenId: o.id,
    referencia: o.referenciaEndToEnd,
    deudorOacreedor: o.beneficiarioNombre,
    iban: o.beneficiarioIban,
    importe: redondear2(o.importe),
  }));
  const importeTotal = redondear2(items.reduce((s, it) => s + it.importe, 0));
  const semilla = JSON.stringify({
    t: '001', ord: entrada.ordenante.iban, f: entrada.fechaEjecucion,
    ops: items.map((i) => [i.origenId, i.referencia, i.importe, i.iban]),
  });
  const msgId = generarMsgId('SCT', semilla, entrada.fechaEjecucion);
  const id = `sepa_pain001_${msgId}`;
  const hashCorto = hashContenido(semilla);
  const duplicado = (entrada.ficherosExistentes || []).find(
    (f) => f.tipo === 'pain.001' && f.estado !== 'ANULADO' && f.hashContenido === hashCorto,
  );
  if (duplicado) {
    return { ok: false, errores: [`Fichero duplicado de ${duplicado.id} (mismo contenido, hash ${hashCorto})`], duplicadoDe: duplicado.id };
  }

  const ord = entrada.ordenante;
  const nombreOrd = sanitizarTextoSepa(ord.nombre, 70);
  const ibanOrd = (validarIban(ord.iban).iban || ord.iban).toUpperCase();
  const fechaCreacion = new Date().toISOString();

  const cdtTrfTxInf = ordenadas.map((o) => {
    const ben = sanitizarTextoSepa(o.beneficiarioNombre, 70);
    const ibanBen = (validarIban(o.beneficiarioIban).iban || '').toUpperCase();
    const concepto = sanitizarTextoSepa(o.concepto, 140);
    return `        <CdtTrfTxInf>
          <PmtId><EndToEndId>${escapeXml(o.referenciaEndToEnd)}</EndToEndId></PmtId>
          <Amt><InstdAmt Ccy="EUR">${formatoImporteSepa(redondear2(o.importe))}</InstdAmt></Amt>
          <CdtrAgt><FinInstnId><BICFI>${o.beneficiarioBic ? escapeXml(o.beneficiarioBic.toUpperCase()) : 'NOTPROVIDED'}</BICFI></FinInstnId></CdtrAgt>
          <Cdtr><Nm>${escapeXml(ben)}</Nm></Cdtr>
          <CdtrAcct><Id><IBAN>${ibanBen}</IBAN></Id></CdtrAcct>
          <RmtInf><Ustrd>${escapeXml(concepto)}</Ustrd></RmtInf>
        </CdtTrfTxInf>`;
  }).join('\n');

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:${SEPA_VERSION_PAIN001}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n` +
    `  <CstmrCdtTrfInitn>\n` +
    `    <GrpHdr>\n` +
    `      <MsgId>${escapeXml(msgId)}</MsgId>\n` +
    `      <CreDtTm>${fechaCreacion}</CreDtTm>\n` +
    `      <NbOfTxs>${items.length}</NbOfTxs>\n` +
    `      <CtrlSum>${formatoImporteSepa(importeTotal)}</CtrlSum>\n` +
    `      <InitgPty><Nm>${escapeXml(nombreOrd)}</Nm></InitgPty>\n` +
    `    </GrpHdr>\n` +
    `    <PmtInf>\n` +
    `      <PmtInfId>${escapeXml(msgId)}-01</PmtInfId>\n` +
    `      <PmtMtd>TRF</PmtMtd>\n` +
    `      <NbOfTxs>${items.length}</NbOfTxs>\n` +
    `      <CtrlSum>${formatoImporteSepa(importeTotal)}</CtrlSum>\n` +
    `      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>\n` +
    `      <ReqdExctnDt>${entrada.fechaEjecucion}</ReqdExctnDt>\n` +
    `      <Dbtr><Nm>${escapeXml(nombreOrd)}</Nm></Dbtr>\n` +
    `      <DbtrAcct><Id><IBAN>${ibanOrd}</IBAN></Id></DbtrAcct>\n` +
    `      <DbtrAgt><FinInstnId><BICFI>${ord.bic ? escapeXml(ord.bic.toUpperCase()) : 'NOTPROVIDED'}</BICFI></FinInstnId></DbtrAgt>\n` +
    `${cdtTrfTxInf}\n` +
    `    </PmtInf>\n` +
    `  </CstmrCdtTrfInitn>\n` +
    `</Document>`;

  const fichero: FicheroSEPA = {
    id,
    tipo: 'pain.001',
    esquema: 'SCT',
    versionXml: SEPA_VERSION_PAIN001,
    msgId,
    fechaCreacion,
    fechaEjecucion: entrada.fechaEjecucion,
    acreedorNombre: ord.nombre,
    acreedorIban: ibanOrd,
    acreedorBic: ord.bic,
    numOperaciones: items.length,
    importeTotal,
    moneda: 'EUR',
    items,
    xml,
    hashContenido: hashCorto,
    estado: 'VALIDADO',
    erroresValidacion: [],
    creadoPor: entrada.actor?.nombre,
    creadoPorId: entrada.actor?.id,
    historial: [
      { id: `h_${msgId}`, fecha: fechaCreacion, accion: 'Fichero pain.001 generado y validado', detalle: `${items.length} transferencias · ${formatoImporteSepa(importeTotal)} € · hash ${hashCorto}`, actorNombre: entrada.actor?.nombre },
    ],
  };

  const erroresXml = validarXmlPain001(fichero);
  if (erroresXml.length > 0) return { ok: false, errores: erroresXml };
  return { ok: true, errores: [], fichero };
}

export function validarXmlPain001(f: FicheroSEPA): string[] {
  const e: string[] = [];
  const xml = f.xml || '';
  const debeContener: Array<[string, string]> = [
    [SEPA_VERSION_PAIN001, 'namespace de versión pain.001.001.03'],
    ['<CstmrCdtTrfInitn>', 'raíz CstmrCdtTrfInitn'],
    [`<MsgId>${f.msgId}</MsgId>`, 'MsgId de cabecera'],
    [`<NbOfTxs>${f.numOperaciones}</NbOfTxs>`, 'NbOfTxs consistente'],
    [`<CtrlSum>${formatoImporteSepa(f.importeTotal)}</CtrlSum>`, 'CtrlSum consistente'],
    ['<CdtTrfTxInf>', 'transacciones de transferencia'],
    ['<IBAN>', 'IBANs'],
  ];
  for (const [frag, desc] of debeContener) {
    if (!xml.includes(frag)) e.push(`XML inválido: falta ${desc}`);
  }
  const numTx = (xml.match(/<CdtTrfTxInf>/g) || []).length;
  if (numTx !== f.numOperaciones) e.push(`XML inválido: ${numTx} transacciones frente a ${f.numOperaciones} declaradas`);
  for (const it of f.items) {
    if (!xml.includes(it.referencia)) e.push(`XML inválido: falta EndToEndId ${it.referencia}`);
  }
  return e;
}
