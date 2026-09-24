/**
 * MT940 Parser — soporta :20: :25: :28C: :60F:/:60M: :61: :86: :62F:/:62M:
 * Tolerante a variaciones razonables de :86:
 */

export interface MovimientoMt940Raw {
  fecha: string; // YYYY-MM-DD
  fechaValor?: string;
  importe: number; // positivo ingreso, negativo gasto según D/C
  tipo: 'C' | 'D' | 'RC' | 'RD';
  concepto: string; // :86:
  referencia?: string; // ref de :61: o :86:
  identificador?: string; // id estable si existe
  saldo?: number;
  raw61: string;
  raw86?: string;
}

export interface Mt940ParseResult {
  movimientos: MovimientoMt940Raw[];
  errores: string[];
  iban?: string;
  numeroExtracto?: string;
  saldoInicial?: number;
  saldoFinal?: number;
  referenciaExtracto?: string;
}

function parseFechaMt940(fechaStr: string): string | null {
  // YYMMDD
  const m = fechaStr.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  let anio = parseInt(m[1], 10);
  anio = anio < 50 ? 2000 + anio : 1900 + anio;
  const mes = m[2];
  const dia = m[3];
  return `${anio}-${mes}-${dia}`;
}

function parseImporteMt940(importeStr: string): number | null {
  // Formato MT940: coma decimal, ej 123,45
  const v = importeStr.replace(',', '.');
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export function parseMT940(contenido: string): Mt940ParseResult {
  const errores: string[] = [];
  const movimientos: MovimientoMt940Raw[] = [];
  let iban: string | undefined;
  let numeroExtracto: string | undefined;
  let saldoInicial: number | undefined;
  let saldoFinal: number | undefined;
  let referenciaExtracto: string | undefined;

  const lineas = contenido.split(/\r?\n/).map(l => l.trim()).filter(l => l.length >0);

  let current61: string | null = null;
  let current86: string | null = null;

  const flush = () => {
    if (!current61) return;
    // Parse :61:
    // Formato :61: YYMMDD[MMDD]D/C/RD/RC importe N referencia // referencia
    // Ejemplo: :61:2001050105D123,45NTRFNONREF//123
    const re61 = /^(\d{6})(\d{0,4})([C|D|RC|RD])([\d,]+)([A-Z]{1,4})([^\/]*)\/\/(.*)$/;
    // Versión simplificada tolerante
    const re61Simple = /^(\d{6})([C|D])([\d,]+)/;
    const m = current61.match(/^(\d{6})(\d{4})?([C|D]|RC|RD)([\d,]+)(.*)$/);
    if (!m) {
      errores.push(`Línea :61: inválida: ${current61}`);
      current61 = null;
      current86 = null;
      return;
    }
    const fechaValorStr = m[1];
    const tipo = m[3] as 'C' | 'D' | 'RC' | 'RD';
    const importeStr = m[4];
    const resto = m[5] || '';

    const fecha = parseFechaMt940(fechaValorStr);
    const importeRaw = parseImporteMt940(importeStr);
    if (!fecha || importeRaw === null) {
      errores.push(`Fecha o importe inválido en :61: ${current61}`);
      current61 = null;
      current86 = null;
      return;
    }

    let importe = importeRaw;
    if (tipo === 'D' || tipo === 'RD') importe = -Math.abs(importe);
    else importe = Math.abs(importe);

    // Referencia: buscar en resto
    let referencia: string | undefined;
    const refMatch = resto.match(/\/\/([^\/\n\r]+)/);
    if (refMatch) referencia = refMatch[1].trim();
    else {
      const refMatch2 = resto.match(/([A-Z0-9]{6,})/);
      if (refMatch2) referencia = refMatch2[1];
    }

    // Concepto desde :86: si existe
    let concepto = current86 || resto || 'Movimiento MT940';
    // Limpiar concepto: quitar códigos propietarios si existen, pero conservar texto
    concepto = concepto.replace(/^\d{3}/, '').trim(); // a veces :86: empieza con código

    movimientos.push({
      fecha,
      fechaValor: fecha,
      importe,
      tipo,
      concepto: concepto.slice(0,500),
      referencia,
      identificador: referencia, // usar referencia como id estable si existe
      raw61: current61,
      raw86: current86 || undefined,
    });

    current61 = null;
    current86 = null;
  };

  for (const linea of lineas) {
    if (linea.startsWith(':20:')) {
      referenciaExtracto = linea.substring(4).trim();
    } else if (linea.startsWith(':25:')) {
      iban = linea.substring(4).trim();
    } else if (linea.startsWith(':28C:') || linea.startsWith(':28:')) {
      const parts = linea.split(':');
      numeroExtracto = parts[2] || parts[1];
    } else if (linea.startsWith(':60F:') || linea.startsWith(':60M:')) {
      // Saldo inicial: :60F:C200101EUR1234,56
      const m = linea.match(/:60[FM]:[CD](\d{6})[A-Z]{3}([\d,]+)/);
      if (m) {
        const imp = parseImporteMt940(m[2]);
        if (imp !== null) saldoInicial = imp;
      }
    } else if (linea.startsWith(':62F:') || linea.startsWith(':62M:')) {
      const m = linea.match(/:62[FM]:[CD](\d{6})[A-Z]{3}([\d,]+)/);
      if (m) {
        const imp = parseImporteMt940(m[2]);
        if (imp !== null) saldoFinal = imp;
      }
    } else if (linea.startsWith(':61:')) {
      // Si había uno previo sin :86:, flush
      if (current61) flush();
      current61 = linea.substring(4).trim();
    } else if (linea.startsWith(':86:')) {
      current86 = linea.substring(4).trim();
      // :86: cierra el movimiento
      flush();
    } else {
      // Continuación de :86: multilínea
      if (current61 && !linea.startsWith(':')) {
        if (current86) current86 += ' ' + linea;
        else current86 = linea;
      }
    }
  }
  // Flush final si quedó
  if (current61) flush();

  return { movimientos, errores, iban, numeroExtracto, saldoInicial, saldoFinal, referenciaExtracto };
}
