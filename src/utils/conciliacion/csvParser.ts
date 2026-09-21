/**
 * CSV Parser — desacoplado, tolerante a variantes bancarias
 * Debe permitir mapear columnas cuando el banco utilice estructuras diferentes
 */

export interface CsvMapping {
  fecha?: string; // nombre columna
  fechaValor?: string;
  concepto?: string;
  descripcion?: string;
  importe?: string;
  saldo?: string;
  referencia?: string;
  identificador?: string;
}

export interface CsvParseResult {
  movimientosRaw: Record<string, string>[];
  errores: string[];
}

export interface MovimientoCsvNormalizado {
  fecha: string;
  fechaValor?: string;
  concepto: string;
  importe: number;
  saldo?: number;
  referencia?: string;
  identificador?: string;
  raw: Record<string, string>;
}

const DEFAULT_CSV_HEADERS = {
  fecha: ['fecha', 'fecha_operacion', 'f.operacion', 'date', 'booking date', 'operation date'],
  fechaValor: ['fecha_valor', 'f.valor', 'value date', 'fecha valor'],
  concepto: ['concepto', 'descripcion', 'description', 'concept', 'concepto/descripcion', 'memo', 'concepto original'],
  importe: ['importe', 'amount', 'import', 'cantidad', 'importe_eur', 'euros'],
  saldo: ['saldo', 'balance', 'saldo_actual'],
  referencia: ['referencia', 'reference', 'ref', 'num_ref', 'referencia_bancaria'],
  identificador: ['id', 'identificador', 'fitid', 'identificador_banco', 'id_bancario'],
};

function normalizarHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_áéíóúñü]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function encontrarColumna(headers: string[], candidatos: string[], mapping?: string): string | undefined {
  if (mapping) {
    const mapped = headers.find(h => normalizarHeader(h) === normalizarHeader(mapping));
    if (mapped) return mapped;
  }
  for (const cand of candidatos) {
    const found = headers.find(h => normalizarHeader(h).includes(normalizarHeader(cand)) || normalizarHeader(cand).includes(normalizarHeader(h)));
    if (found) return found;
  }
  return undefined;
}

function parseImporteCSV(valor: string): number | null {
  if (!valor) return null;
  let v = valor.trim();
  // Limpiar símbolos €, espacios, etc.
  v = v.replace(/€/g, '').replace(/\s/g, '');
  // Detectar formato español: 1.234,56 vs inglés 1,234.56
  // Si contiene coma y punto, el último separador es decimal
  const lastComma = v.lastIndexOf(',');
  const lastDot = v.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      // Español: punto miles, coma decimal
      v = v.replace(/\./g, '').replace(',', '.');
    } else {
      // Inglés: coma miles, punto decimal
      v = v.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    // Solo coma: podría ser decimal español o miles inglés
    // Si después de coma hay 2 dígitos, asumimos decimal
    const afterComma = v.length - lastComma - 1;
    if (afterComma === 2 || afterComma === 3) {
      v = v.replace(',', '.');
    } else {
      v = v.replace(/,/g, '');
    }
  }
  // Ahora solo puntos decimales
  const num = Number(v);
  return isNaN(num) ? null : num;
}

function parseFechaCSV(valor: string): string | null {
  if (!valor) return null;
  const v = valor.trim();
  // Intentar formatos comunes: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, MM/DD/YYYY
  // Normalizar separadores
  // Primero intentar Date directo
  const dDirect = new Date(v);
  if (!isNaN(dDirect.getTime()) && v.includes('-') && v.length >= 8) {
    // Si es YYYY-MM-DD, usar tal cual
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
      return v.split('T')[0];
    }
  }
  // DD/MM/YYYY
  const m1 = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m1) {
    let dia = parseInt(m1[1], 10);
    let mes = parseInt(m1[2], 10);
    let anio = parseInt(m1[3], 10);
    if (anio < 100) anio += 2000;
    // Validar mes/dia: si dia >12 y mes <=12, swap? Asumimos DD/MM
    if (dia > 31 || mes > 12) {
      // Intentar MM/DD
      const tmp = dia;
      dia = mes;
      mes = tmp;
    }
    if (mes >=1 && mes <=12 && dia >=1 && dia <=31) {
      return `${anio.toString().padStart(4,'0')}-${mes.toString().padStart(2,'0')}-${dia.toString().padStart(2,'0')}`;
    }
  }
  // YYYYMMDD
  const m2 = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) {
    return `${m2[1]}-${m2[2]}-${m2[3]}`;
  }
  const d = new Date(v);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return null;
}

export function parseCSV(contenido: string, mapping?: CsvMapping): CsvParseResult {
  const lineas = contenido.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lineas.length === 0) return { movimientosRaw: [], errores: ['CSV vacío'] };

  // Detectar delimitador: , ; \t |
  const primera = lineas[0];
  let delimitador = ',';
  const candidatosDelim = [';', ',', '\t', '|'];
  let maxCount = 0;
  for (const d of candidatosDelim) {
    const count = primera.split(d).length;
    if (count > maxCount) {
      maxCount = count;
      delimitador = d;
    }
  }

  const headers = primera.split(delimitador).map(h => h.trim().replace(/^"|"$/g, ''));
  const errores: string[] = [];
  const movimientosRaw: Record<string, string>[] = [];

  for (let i = 1; i < lineas.length; i++) {
    const linea = lineas[i];
    // Manejo simple de comillas
    const valores: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < linea.length; j++) {
      const char = linea[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimitador && !inQuotes) {
        valores.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    valores.push(current.trim().replace(/^"|"$/g, ''));

    if (valores.length !== headers.length) {
      // Tolerante: si hay más/menos, intentar ajustar
      if (valores.length < headers.length) {
        // Rellenar vacíos
        while (valores.length < headers.length) valores.push('');
      } else {
        // Truncar
        valores.length = headers.length;
      }
    }

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = valores[idx] || '';
    });
    movimientosRaw.push(obj);
  }

  return { movimientosRaw, errores };
}

export function normalizarMovimientosCSV(
  raw: Record<string, string>[],
  mapping?: CsvMapping
): { movimientos: MovimientoCsvNormalizado[]; errores: string[] } {
  if (raw.length === 0) return { movimientos: [], errores: [] };
  const headers = Object.keys(raw[0]);
  const colFecha = encontrarColumna(headers, DEFAULT_CSV_HEADERS.fecha, mapping?.fecha);
  const colFechaValor = encontrarColumna(headers, DEFAULT_CSV_HEADERS.fechaValor, mapping?.fechaValor);
  const colConcepto = encontrarColumna(headers, DEFAULT_CSV_HEADERS.concepto, mapping?.concepto || mapping?.descripcion);
  const colImporte = encontrarColumna(headers, DEFAULT_CSV_HEADERS.importe, mapping?.importe);
  const colSaldo = encontrarColumna(headers, DEFAULT_CSV_HEADERS.saldo, mapping?.saldo);
  const colRef = encontrarColumna(headers, DEFAULT_CSV_HEADERS.referencia, mapping?.referencia);
  const colId = encontrarColumna(headers, DEFAULT_CSV_HEADERS.identificador, mapping?.identificador);

  const errores: string[] = [];
  const movimientos: MovimientoCsvNormalizado[] = [];

  if (!colFecha) errores.push('No se encontró columna de fecha');
  if (!colImporte) errores.push('No se encontró columna de importe');

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const fechaRaw = colFecha ? r[colFecha] : '';
    const importeRaw = colImporte ? r[colImporte] : '';
    const fecha = parseFechaCSV(fechaRaw);
    const importe = parseImporteCSV(importeRaw);

    if (!fecha) {
      errores.push(`Fila ${i+2}: fecha inválida "${fechaRaw}"`);
      continue;
    }
    if (importe === null) {
      errores.push(`Fila ${i+2}: importe inválido "${importeRaw}"`);
      continue;
    }

    const concepto = colConcepto ? r[colConcepto] : (Object.values(r).join(' ').slice(0,200));
    movimientos.push({
      fecha,
      fechaValor: colFechaValor ? parseFechaCSV(r[colFechaValor]) || undefined : undefined,
      concepto: concepto || 'Sin concepto',
      importe,
      saldo: colSaldo ? parseImporteCSV(r[colSaldo]) || undefined : undefined,
      referencia: colRef ? r[colRef] || undefined : undefined,
      identificador: colId ? r[colId] || undefined : undefined,
      raw: r,
    });
  }

  return { movimientos, errores };
}
