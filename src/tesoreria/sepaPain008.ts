/**
 * BLOQUE B — Generador/validador SEPA Direct Debit pain.008.001.02 (esquema CORE/B2B).
 * Flujo: GENERAR → VALIDAR → PREPARAR. Nunca ejecuta cargos reales.
 *
 * Cada adeudo exige: mandato (MndtId + fecha firma), deudor (nombre+IBAN), importe,
 * secuencia (FRST/RCUR/FNAL/OOFF), Creditor ID válido y cuenta acreedora válida.
 * Trazabilidad: cada Tx lleva EndToEndId determinista desde el cobro origen.
 */
import type { CobroPeriodo } from '../types';
import {
  esFechaValida,
  escapeXml,
  formatoImporteSepa,
  generarEndToEndId,
  generarMsgId,
  hashContenido,
  redondear2,
  sanitizarTextoSepa,
  SEPA_VERSION_PAIN008,
  validarCreditorId,
  validarIban,
} from './sepaUtils';
import type { FicheroSEPA, ItemFicheroSEPA, MandatoSEPA } from './tipos';

export interface AdeudoDirecto {
  cobro: CobroPeriodo;
  mandato: MandatoSEPA;
  /** Importe a domiciliar (por defecto importePrevisto pendiente del cobro). */
  importe?: number;
  concepto?: string;
}

export interface DatosAcreedor008 {
  nombre: string;
  creditorId: string;
  iban: string;
  bic?: string;
}

export interface EntradaPain008 {
  acreedor: DatosAcreedor008;
  adeudos: AdeudoDirecto[];
  fechaCobro: string; // ReqClctnDt YYYY-MM-DD
  esquema?: 'CORE' | 'B2B';
  actor?: { id?: string; nombre?: string };
  /** Ficheros ya existentes (detección de duplicados por hash). */
  ficherosExistentes?: FicheroSEPA[];
}

export interface ResultadoPain008 {
  ok: boolean;
  errores: string[];
  fichero?: FicheroSEPA;
  duplicadoDe?: string;
}

function secuenciaValida(s?: string): s is 'FRST' | 'RCUR' | 'FNAL' | 'OOFF' {
  return s === 'FRST' || s === 'RCUR' || s === 'FNAL' || s === 'OOFF';
}

export function validarEntradaPain008(entrada: EntradaPain008): string[] {
  const errores: string[] = [];
  const { acreedor, adeudos } = entrada;

  if (!acreedor?.nombre?.trim()) errores.push('Falta nombre del acreedor');
  const ci = validarCreditorId(acreedor?.creditorId || '');
  if (!ci.valido) errores.push(`Creditor ID inválido: ${ci.error}`);
  const ib = validarIban(acreedor?.iban || '');
  if (!ib.valido) errores.push(`IBAN acreedor inválido: ${ib.error}`);
  if (!esFechaValida(entrada.fechaCobro)) errores.push(`Fecha de cobro inválida: ${entrada.fechaCobro}`);

  if (!adeudos || adeudos.length === 0) errores.push('Sin adeudos: el fichero requiere al menos una operación');

  const e2e = new Set<string>();
  (adeudos || []).forEach((a, i) => {
    const tag = `Adeudo ${i + 1}`;
    const importe = redondear2(a.importe ?? a.cobro.importePrevisto ?? 0);
    if (!(importe > 0)) errores.push(`${tag}: importe debe ser > 0`);
    if (importe >= 100000000) errores.push(`${tag}: importe excede el límite razonable`);
    const dib = validarIban(a.mandato?.deudorIban || '');
    if (!dib.valido) errores.push(`${tag}: IBAN deudor inválido (${dib.error})`);
    if (!a.mandato?.deudorNombre?.trim()) errores.push(`${tag}: falta nombre del deudor`);
    if (!a.mandato?.id?.trim()) errores.push(`${tag}: falta MndtId del mandato`);
    if (!esFechaValida(a.mandato?.fechaFirma || '')) errores.push(`${tag}: fecha de firma del mandato inválida`);
    if (!secuenciaValida(a.mandato?.secuencia)) errores.push(`${tag}: secuencia inválida (FRST/RCUR/FNAL/OOFF)`);
    if (!a.cobro?.id) errores.push(`${tag}: falta cobro origen trazable`);
    else {
      const ref = generarEndToEndId('cobro', a.cobro.id, a.cobro.periodoMesAnio);
      if (e2e.has(ref)) errores.push(`${tag}: EndToEndId duplicado (${ref}): posible duplicado de cobro`);
      e2e.add(ref);
    }
  });
  return errores;
}

export function generarPain008(entrada: EntradaPain008): ResultadoPain008 {
  const errores = validarEntradaPain008(entrada);
  if (errores.length > 0) return { ok: false, errores };

  const esquema = entrada.esquema || entrada.adeudos[0]?.mandato?.esquema || 'CORE';
  const items: ItemFicheroSEPA[] = entrada.adeudos.map((a) => {
    const importe = redondear2(a.importe ?? a.cobro.importePrevisto ?? 0);
    return {
      id: `tx_${a.cobro.id}`,
      origenTipo: 'cobro',
      origenId: a.cobro.id,
      referencia: generarEndToEndId('cobro', a.cobro.id, a.cobro.periodoMesAnio),
      deudorOacreedor: a.mandato.deudorNombre,
      iban: a.mandato.deudorIban,
      importe,
    };
  });
  const importeTotal = redondear2(items.reduce((s, it) => s + it.importe, 0));
  const semilla = JSON.stringify({
    t: '008', e: esquema,
    acreedor: entrada.acreedor.creditorId, iban: entrada.acreedor.iban,
    f: entrada.fechaCobro,
    ops: items.map((i) => [i.origenId, i.referencia, i.importe, i.iban]),
  });
  const msgId = generarMsgId('SDD', semilla, entrada.fechaCobro);
  const id = `sepa_pain008_${msgId}`;

  // Detección de duplicados por hash de contenido canónico
  const hashCorto = hashContenido(semilla);
  const duplicado = (entrada.ficherosExistentes || []).find(
    (f) => f.tipo === 'pain.008' && f.estado !== 'ANULADO' && f.hashContenido === hashCorto,
  );
  if (duplicado) {
    return { ok: false, errores: [`Fichero duplicado de ${duplicado.id} (mismo contenido, hash ${hashCorto})`], duplicadoDe: duplicado.id };
  }

  const ac = entrada.acreedor;
  const nombreAcreedor = sanitizarTextoSepa(ac.nombre, 70);
  const ci = (validarCreditorId(ac.creditorId).ci || ac.creditorId).toUpperCase();
  const ibanAcreedor = (validarIban(ac.iban).iban || ac.iban).toUpperCase();
  const fechaCreacion = new Date().toISOString();

  const txs = entrada.adeudos.map((a) => {
    const importe = redondear2(a.importe ?? a.cobro.importePrevisto ?? 0);
    const item = items.find((i) => i.origenId === a.cobro.id)!;
    const deudor = sanitizarTextoSepa(a.mandato.deudorNombre, 70);
    const ibanDeudor = (validarIban(a.mandato.deudorIban).iban || '').toUpperCase();
    const concepto = sanitizarTextoSepa(
      a.concepto || `Alquiler ${a.cobro.nombreMes || a.cobro.periodoMesAnio} ${a.cobro.inmuebleDireccion || ''}`,
      140,
    );
    return { a, importe, item, deudor, ibanDeudor, concepto };
  });

  const drctDbtTxInf = txs.map(({ a, importe, item, deudor, ibanDeudor, concepto }) => `        <DrctDbtTxInf>
          <PmtId><EndToEndId>${escapeXml(item.referencia)}</EndToEndId></PmtId>
          <InstdAmt Ccy="EUR">${formatoImporteSepa(importe)}</InstdAmt>
          <DrctDbtTx><MndtRltdInf><MndtId>${escapeXml(sanitizarTextoSepa(a.mandato.id, 35))}</MndtId><DtOfSgntr>${a.mandato.fechaFirma}</DtOfSgntr></MndtRltdInf></DrctDbtTx>
          <DbtrAgt><FinInstnId><BICFI>${a.mandato.deudorBic ? escapeXml(a.mandato.deudorBic.toUpperCase()) : 'NOTPROVIDED'}</BICFI></FinInstnId></DbtrAgt>
          <Dbtr><Nm>${escapeXml(deudor)}</Nm></Dbtr>
          <DbtrAcct><Id><IBAN>${ibanDeudor}</IBAN></Id></DbtrAcct>
          <RmtInf><Ustrd>${escapeXml(concepto)}</Ustrd></RmtInf>
        </DrctDbtTxInf>`).join('\n');

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:${SEPA_VERSION_PAIN008}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n` +
    `  <CstmrDrctDbtInitn>\n` +
    `    <GrpHdr>\n` +
    `      <MsgId>${escapeXml(msgId)}</MsgId>\n` +
    `      <CreDtTm>${fechaCreacion}</CreDtTm>\n` +
    `      <NbOfTxs>${items.length}</NbOfTxs>\n` +
    `      <CtrlSum>${formatoImporteSepa(importeTotal)}</CtrlSum>\n` +
    `      <InitgPty><Nm>${escapeXml(nombreAcreedor)}</Nm><Id><OrgId><Othr><Id>${escapeXml(ci)}</Id></Othr></OrgId></Id></InitgPty>\n` +
    `    </GrpHdr>\n` +
    `    <PmtInf>\n` +
    `      <PmtInfId>${escapeXml(msgId)}-01</PmtInfId>\n` +
    `      <PmtMtd>DD</PmtMtd>\n` +
    `      <NbOfTxs>${items.length}</NbOfTxs>\n` +
    `      <CtrlSum>${formatoImporteSepa(importeTotal)}</CtrlSum>\n` +
    `      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>${esquema}</Cd></LclInstrm><SeqTp>${entrada.adeudos[0].mandato.secuencia}</SeqTp></PmtTpInf>\n` +
    `      <ReqdColltnDt>${entrada.fechaCobro}</ReqdColltnDt>\n` +
    `      <Cdtr><Nm>${escapeXml(nombreAcreedor)}</Nm></Cdtr>\n` +
    `      <CdtrAcct><Id><IBAN>${ibanAcreedor}</IBAN></Id></CdtrAcct>\n` +
    `      <CdtrAgt><FinInstnId><BICFI>${ac.bic ? escapeXml(ac.bic.toUpperCase()) : 'NOTPROVIDED'}</BICFI></FinInstnId></CdtrAgt>\n` +
    `      <CdtrSchmeId><Id><PrvtId><Othr><Id>${escapeXml(ci)}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>\n` +
    `${drctDbtTxInf}\n` +
    `    </PmtInf>\n` +
    `  </CstmrDrctDbtInitn>\n` +
    `</Document>`;

  const fichero: FicheroSEPA = {
    id,
    tipo: 'pain.008',
    esquema,
    versionXml: SEPA_VERSION_PAIN008,
    msgId,
    fechaCreacion,
    fechaEjecucion: entrada.fechaCobro,
    acreedorNombre: ac.nombre,
    acreedorId: ci,
    acreedorIban: ibanAcreedor,
    acreedorBic: ac.bic,
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
      { id: `h_${msgId}`, fecha: fechaCreacion, accion: 'Fichero pain.008 generado y validado', detalle: `${items.length} adeudos · ${formatoImporteSepa(importeTotal)} € · hash ${hashCorto}`, actorNombre: entrada.actor?.nombre },
    ],
  };

  // Revalidación estructural del XML generado
  const erroresXml = validarXmlPain008(fichero);
  if (erroresXml.length > 0) {
    return { ok: false, errores: erroresXml };
  }
  return { ok: true, errores: [], fichero };
}

/** Validación estructural del XML generado (controles de consistencia). */
export function validarXmlPain008(f: FicheroSEPA): string[] {
  const e: string[] = [];
  const xml = f.xml || '';
  const debeContener: Array<[string, string]> = [
    [SEPA_VERSION_PAIN008, 'namespace de versión pain.008.001.02'],
    ['<CstmrDrctDbtInitn>', 'raíz CstmrDrctDbtInitn'],
    [`<MsgId>${f.msgId}</MsgId>`, 'MsgId de cabecera'],
    [`<NbOfTxs>${f.numOperaciones}</NbOfTxs>`, 'NbOfTxs consistente'],
    [`<CtrlSum>${formatoImporteSepa(f.importeTotal)}</CtrlSum>`, 'CtrlSum consistente'],
    ['<MndtId>', 'mandatos (MndtId)'],
    ['<DtOfSgntr>', 'fechas de firma de mandato'],
    ['<IBAN>', 'IBANs'],
  ];
  for (const [frag, desc] of debeContener) {
    if (!xml.includes(frag)) e.push(`XML inválido: falta ${desc}`);
  }
  const numTx = (xml.match(/<DrctDbtTxInf>/g) || []).length;
  if (numTx !== f.numOperaciones) e.push(`XML inválido: ${numTx} transacciones frente a ${f.numOperaciones} declaradas`);
  for (const it of f.items) {
    if (!xml.includes(it.referencia)) e.push(`XML inválido: falta EndToEndId ${it.referencia}`);
  }
  return e;
}
