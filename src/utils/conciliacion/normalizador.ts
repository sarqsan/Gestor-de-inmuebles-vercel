/**
 * Normalizador — todos los formatos → MovimientoBancario
 * Conserva información suficiente para auditar origen
 */

import { MovimientoBancario, OrigenFormatoBancario } from '../../types/conciliacion';
import { MovimientoCsvNormalizado } from './csvParser';
import { MovimientoOfxRaw } from './ofxParser';
import { MovimientoMt940Raw } from './mt940Parser';
import { MovimientoNorma43Raw } from './norma43Parser';

function hashString(str: string): string {
  // FNV-1a simple
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function generarHashIdempotencia(
  fecha: string,
  importe: number,
  concepto: string,
  referencia?: string,
  identificador?: string
): string {
  const base = `${fecha}|${importe.toFixed(2)}|${concepto.trim().toLowerCase()}|${(referencia||'').trim().toLowerCase()}|${(identificador||'').trim().toLowerCase()}`;
  return hashString(base);
}

export function normalizarDesdeCSV(
  movimientos: MovimientoCsvNormalizado[],
  idImportacion: string,
  propietarioId: string,
  fechaImportacion: string,
  cuentaIban?: string,
  importadoPor?: string
): MovimientoBancario[] {
  return movimientos.map((m, idx) => {
    const tipo = m.importe >=0 ? 'INGRESO' : 'GASTO';
    const importeAbs = Math.abs(m.importe);
    const concepto = m.concepto.trim();
    const hash = generarHashIdempotencia(m.fecha, m.importe, concepto, m.referencia, m.identificador);
    const idMov = m.identificador ? `csv_${hashString(m.identificador)}` : `csv_${hash}_${idx}`;

    return {
      idImportacion,
      idMovimiento: idMov,
      fechaOperacion: m.fecha,
      fechaValor: m.fechaValor,
      importe: m.importe, // conservar signo
      tipo,
      concepto,
      conceptoOriginal: (m.raw ? JSON.stringify(m.raw) : concepto).slice(0,500),
      referencia: m.referencia,
      identificadorBanco: m.identificador,
      saldo: m.saldo,
      origen: 'CSV' as OrigenFormatoBancario,
      propietarioId,
      cuentaIban,
      metadatosOriginales: {
        fecha: m.fecha,
        importe: m.importe,
        concepto,
        referencia: m.referencia || null,
        identificador: m.identificador || null,
      },
      hashIdempotencia: hash,
      fechaImportacion,
      importadoPor,
    };
  });
}

export function normalizarDesdeOFX(
  movimientos: MovimientoOfxRaw[],
  idImportacion: string,
  propietarioId: string,
  fechaImportacion: string,
  cuentaIban?: string,
  importadoPor?: string
): MovimientoBancario[] {
  return movimientos.map(m => {
    const tipo = m.importe >=0 ? 'INGRESO' : 'GASTO';
    const concepto = `${m.nombre || ''} ${m.memo || ''}`.trim() || 'Movimiento OFX';
    const hash = generarHashIdempotencia(m.fecha, m.importe, concepto, m.referencia, m.fitid);
    // FITID es id estable para idempotencia
    const idMov = `ofx_${hashString(m.fitid)}`;

    return {
      idImportacion,
      idMovimiento: idMov,
      fechaOperacion: m.fecha,
      importe: m.importe,
      tipo,
      concepto: concepto.slice(0,500),
      conceptoOriginal: `${m.nombre || ''} | ${m.memo || ''}`.slice(0,500),
      referencia: m.referencia,
      identificadorBanco: m.fitid,
      saldo: m.saldo,
      origen: 'OFX' as OrigenFormatoBancario,
      propietarioId,
      cuentaIban,
      metadatosOriginales: {
        FITID: m.fitid,
        NAME: m.nombre || null,
        MEMO: m.memo || null,
        TRNTYPE: m.tipo || null,
      },
      hashIdempotencia: hash,
      fechaImportacion,
      importadoPor,
    };
  });
}

export function normalizarDesdeMT940(
  movimientos: MovimientoMt940Raw[],
  idImportacion: string,
  propietarioId: string,
  fechaImportacion: string,
  cuentaIban?: string,
  importadoPor?: string
): MovimientoBancario[] {
  return movimientos.map((m, idx) => {
    const tipo = m.importe >=0 ? 'INGRESO' : 'GASTO';
    const hash = generarHashIdempotencia(m.fecha, m.importe, m.concepto, m.referencia, m.identificador);
    const idMov = m.identificador ? `mt940_${hashString(m.identificador)}_${m.fecha}` : `mt940_${hash}_${idx}`;

    return {
      idImportacion,
      idMovimiento: idMov,
      fechaOperacion: m.fecha,
      fechaValor: m.fechaValor,
      importe: m.importe,
      tipo,
      concepto: m.concepto.slice(0,500),
      conceptoOriginal: (m.raw86 || m.raw61).slice(0,500),
      referencia: m.referencia,
      identificadorBanco: m.identificador,
      saldo: m.saldo,
      origen: 'MT940' as OrigenFormatoBancario,
      propietarioId,
      cuentaIban,
      metadatosOriginales: {
        raw61: m.raw61.slice(0,200),
        raw86: (m.raw86 || '').slice(0,200),
        tipo: m.tipo,
      },
      hashIdempotencia: hash,
      fechaImportacion,
      importadoPor,
    };
  });
}

export function normalizarDesdeNorma43(
  movimientos: MovimientoNorma43Raw[],
  idImportacion: string,
  propietarioId: string,
  fechaImportacion: string,
  cuentaIban?: string,
  importadoPor?: string
): MovimientoBancario[] {
  return movimientos.map((m, idx) => {
    const tipo = m.importe >=0 ? 'INGRESO' : 'GASTO';
    const conceptoAdicional = m.conceptoAdicional.join(' ').trim();
    const concepto = conceptoAdicional || `Concepto ${m.conceptoComun || ''} ${m.conceptoPropio || ''}`.trim() || 'Movimiento Norma43';
    const referencia = `${m.referencia1 || ''} ${m.referencia2 || ''}`.trim() || m.documento;
    const identificador = `${m.referencia1 || ''}${m.referencia2 || ''}`.trim() || undefined;
    const hash = generarHashIdempotencia(m.fechaOperacion, m.importe, concepto, referencia, identificador);
    const idMov = identificador ? `n43_${hashString(identificador)}_${m.fechaOperacion}` : `n43_${hash}_${idx}`;

    return {
      idImportacion,
      idMovimiento: idMov,
      fechaOperacion: m.fechaOperacion,
      fechaValor: m.fechaValor,
      importe: m.importe,
      tipo,
      concepto: concepto.slice(0,500),
      conceptoOriginal: `${m.raw22} | ${m.conceptoAdicional.join(' | ')}`.slice(0,500),
      referencia: referencia || undefined,
      identificadorBanco: identificador,
      origen: 'NORMA43' as OrigenFormatoBancario,
      propietarioId,
      cuentaIban,
      metadatosOriginales: {
        conceptoComun: m.conceptoComun || null,
        conceptoPropio: m.conceptoPropio || null,
        documento: m.documento || null,
        referencia1: m.referencia1 || null,
        referencia2: m.referencia2 || null,
      },
      hashIdempotencia: hash,
      fechaImportacion,
      importadoPor,
    };
  });
}
