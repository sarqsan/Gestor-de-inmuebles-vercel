/** Parser OFX 1.x/2.x: campos bancarios se mantienen solo en memoria y errores sin valores originales. */
import { normalizarFechaBancaria, parseImporteBancario } from './validacionExtracto';

export interface MovimientoOfxRaw {
  fecha: string;
  importe: number;
  fitid: string;
  nombre?: string;
  memo?: string;
  referencia?: string;
  saldo?: number;
  tipo?: string;
  divisa?: string;
  fila: number;
  raw: Record<string, string>;
}

export function parseOFX(contenido: string): {
  movimientos: MovimientoOfxRaw[];
  errores: string[];
  saldoFinal?: number;
  divisa?: string;
  cuenta?: string;
} {
  const errores: string[] = [];
  const movimientos: MovimientoOfxRaw[] = [];
  const divisaMatch = contenido.match(/<CURDEF>\s*([A-Z]{3})/i);
  const cuentaMatch = contenido.match(/<ACCTID>\s*([^<\r\n]+)/i);
  const divisa = divisaMatch?.[1]?.toUpperCase();
  const cuenta = cuentaMatch?.[1]?.trim();
  let saldoFinal: number | undefined;
  const seccion = contenido.match(/<BANKTRANLIST>([\s\S]*?)(?:<\/BANKTRANLIST>|<\/OFX>|$)/i)?.[1] || contenido;
  const bloques = Array.from(seccion.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|$))/gi));

  bloques.forEach((match, indice) => {
    const bloque = match[1];
    const getTag = (tag: string): string | undefined => {
      const valor = bloque.match(new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, 'i'))?.[1]?.trim();
      return valor || undefined;
    };
    const fechaRaw = getTag('DTPOSTED');
    const importeRaw = getTag('TRNAMT');
    const fitid = getTag('FITID');
    const nombre = getTag('NAME');
    const memo = getTag('MEMO');
    const tipo = getTag('TRNTYPE');
    const referencia = getTag('REFNUM') || getTag('CHECKNUM');
    const fecha = fechaRaw ? normalizarFechaBancaria(fechaRaw.slice(0, 8)) : null;
    const importe = importeRaw ? parseImporteBancario(importeRaw) : null;
    if (!fechaRaw || !fecha || !importeRaw || importe === null || importe === 0 || !fitid) {
      errores.push(`Fila ${indice + 1}: OFX_TRANSACCION_INVALIDA`);
      return;
    }
    movimientos.push({
      fecha,
      importe,
      fitid,
      ...(nombre ? { nombre } : {}),
      ...(memo ? { memo } : {}),
      ...(referencia ? { referencia } : {}),
      ...(tipo ? { tipo } : {}),
      ...(divisa ? { divisa } : {}),
      fila: indice + 1,
      raw: { DTPOSTED: fechaRaw, TRNAMT: importeRaw, FITID: fitid, NAME: nombre || '', MEMO: memo || '', TRNTYPE: tipo || '', REFNUM: referencia || '' },
    });
  });

  const balRaw = contenido.match(/<LEDGERBAL>[\s\S]*?<BALAMT>\s*([^<\r\n]+)/i)?.[1]?.trim();
  if (balRaw) {
    saldoFinal = parseImporteBancario(balRaw) ?? undefined;
    if (saldoFinal === undefined) errores.push('OFX_SALDO_FINAL_INVALIDO');
  }
  if (bloques.length === 0) errores.push('OFX_SIN_TRANSACCIONES');
  return { movimientos, errores, ...(saldoFinal !== undefined ? { saldoFinal } : {}), ...(divisa ? { divisa } : {}), ...(cuenta ? { cuenta } : {}) };
}
