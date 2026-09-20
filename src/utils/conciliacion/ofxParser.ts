/**
 * OFX Parser — extrae fecha, importe, FITID, nombre, memo, referencia, saldo
 * Tolerante a variantes OFX 1.0.2 / 2.x
 */

export interface MovimientoOfxRaw {
  fecha: string; // YYYY-MM-DD
  importe: number;
  fitid: string;
  nombre?: string;
  memo?: string;
  referencia?: string;
  saldo?: number;
  tipo?: string;
  raw: Record<string, string>;
}

export function parseOFX(contenido: string): { movimientos: MovimientoOfxRaw[]; errores: string[]; saldoFinal?: number } {
  const errores: string[] = [];
  const movimientos: MovimientoOfxRaw[] = [];
  let saldoFinal: number | undefined;

  // Buscar bloques <STMTTRN>
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;

  while ((match = trnRegex.exec(contenido)) !== null) {
    const bloque = match[1];
    const getTag = (tag: string): string | undefined => {
      const re = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
      const m = bloque.match(re);
      return m ? m[1].trim() : undefined;
    };

    const dtPosted = getTag('DTPOSTED'); // YYYYMMDDHHMMSS
    const trnAmt = getTag('TRNAMT');
    const fitId = getTag('FITID');
    const name = getTag('NAME');
    const memo = getTag('MEMO');
    const trnType = getTag('TRNTYPE');
    const refNum = getTag('REFNUM') || getTag('CHECKNUM');

    if (!dtPosted || !trnAmt || !fitId) {
      errores.push(`Transacción OFX incompleta: falta DTPOSTED/TRNAMT/FITID en bloque ${bloque.slice(0,100)}`);
      continue;
    }

    // Parse fecha: YYYYMMDD o YYYYMMDDHHMMSS
    const fechaMatch = dtPosted.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!fechaMatch) {
      errores.push(`Fecha OFX inválida: ${dtPosted}`);
      continue;
    }
    const fecha = `${fechaMatch[1]}-${fechaMatch[2]}-${fechaMatch[3]}`;
    const importe = Number(trnAmt);
    if (isNaN(importe)) {
      errores.push(`Importe OFX inválido: ${trnAmt}`);
      continue;
    }

    movimientos.push({
      fecha,
      importe,
      fitid: fitId,
      nombre: name,
      memo: memo,
      referencia: refNum,
      tipo: trnType,
      raw: {
        DTPOSTED: dtPosted,
        TRNAMT: trnAmt,
        FITID: fitId,
        NAME: name || '',
        MEMO: memo || '',
        TRNTYPE: trnType || '',
        REFNUM: refNum || '',
      },
    });
  }

  // Intentar extraer saldo final <LEDGERBAL><BALAMT>
  const balRegex = /<LEDGERBAL>[\s\S]*?<BALAMT>([^<]+)/i;
  const balMatch = contenido.match(balRegex);
  if (balMatch) {
    const bal = Number(balMatch[1].trim());
    if (!isNaN(bal)) saldoFinal = bal;
  }

  if (movimientos.length === 0 && errores.length === 0) {
    errores.push('No se encontraron transacciones OFX <STMTTRN>');
  }

  return { movimientos, errores, saldoFinal };
}
