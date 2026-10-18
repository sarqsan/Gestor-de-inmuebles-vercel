/** Parser CSV bancario RFC4180 acotado: rechaza filas mal formadas y no expone valores en errores. */
import { normalizarFechaBancaria, parseImporteBancario } from './validacionExtracto';

export interface CsvMapping {
  fecha?: string;
  fechaValor?: string;
  concepto?: string;
  descripcion?: string;
  importe?: string;
  saldo?: string;
  referencia?: string;
  identificador?: string;
  divisa?: string;
  cuenta?: string;
}

export interface CsvFilaCruda extends Record<string, string> {
  /** Línea lógica del archivo, solo en memoria. No se persiste el registro bruto. */
  __filaOrigen?: string;
}

export interface CsvParseResult {
  movimientosRaw: CsvFilaCruda[];
  errores: string[];
  delimitador?: string;
}

export interface MovimientoCsvNormalizado {
  fecha: string;
  fechaValor?: string;
  concepto: string;
  importe: number;
  saldo?: number;
  referencia?: string;
  identificador?: string;
  divisa?: string;
  cuenta?: string;
  fila: number;
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
  divisa: ['divisa', 'moneda', 'currency', 'currency_code', 'cod_moneda'],
  cuenta: ['cuenta', 'account', 'cuenta_bancaria', 'account_id'],
};

function normalizarHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_áéíóúñü]/g, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function encontrarColumna(headers: string[], candidatos: string[], mapping?: string): string | undefined {
  if (mapping) {
    const mapped = headers.find((h) => normalizarHeader(h) === normalizarHeader(mapping));
    if (mapped) return mapped;
  }
  for (const cand of candidatos) {
    const target = normalizarHeader(cand);
    const found = headers.find((h) => normalizarHeader(h) === target);
    if (found) return found;
  }
  return undefined;
}

/** Alias mantenido porque también lo consume el importador general CSV del ERP. */
export function parseImporteCSV(valor: string): number | null {
  return parseImporteBancario(valor);
}

function parseFechaCSV(valor: string): string | null {
  return normalizarFechaBancaria(valor);
}

interface RegistroCSV {
  campos: string[];
  fila: number;
}
interface ParseoCSV {
  registros: RegistroCSV[];
  errores: string[];
}

function parsearRegistros(contenido: string, delimitador: string): ParseoCSV {
  const registros: RegistroCSV[] = [];
  const errores: string[] = [];
  let campos: string[] = [];
  let campo = '';
  let entreComillas = false;
  let despuesDeComillas = false;
  let numeroFila = 1;
  let filaRegistro = 1;
  let hayContenido = false;

  const cerrarCampo = () => { campos.push(campo); campo = ''; despuesDeComillas = false; };
  const cerrarRegistro = () => {
    cerrarCampo();
    if (campos.some((v) => v.trim() !== '')) registros.push({ campos, fila: filaRegistro });
    campos = [];
    hayContenido = false;
    filaRegistro = numeroFila + 1;
  };

  for (let i = 0; i < contenido.length; i += 1) {
    const caracter = contenido[i];
    if (caracter === '"') {
      if (entreComillas && contenido[i + 1] === '"') {
        campo += '"'; i += 1; hayContenido = true;
      } else if (entreComillas) {
        entreComillas = false; despuesDeComillas = true;
      } else if (!despuesDeComillas && campo.trim() === '') {
        entreComillas = true; campo = ''; hayContenido = true;
      } else {
        errores.push(`Fila ${filaRegistro}: CSV_COMILLA_INVALIDA`);
      }
      continue;
    }
    if (!entreComillas && caracter === delimitador) {
      cerrarCampo(); hayContenido = true; continue;
    }
    if (caracter === '\r' || caracter === '\n') {
      if (caracter === '\r' && contenido[i + 1] === '\n') i += 1;
      if (entreComillas) {
        campo += '\n'; numeroFila += 1; hayContenido = true; continue;
      }
      cerrarRegistro(); numeroFila += 1; filaRegistro = numeroFila; continue;
    }
    if (despuesDeComillas && !/\s/.test(caracter)) {
      errores.push(`Fila ${filaRegistro}: CSV_TEXTO_TRAS_COMILLA`);
      despuesDeComillas = false;
    }
    campo += caracter; hayContenido ||= caracter.trim() !== '';
  }
  if (entreComillas) errores.push(`Fila ${filaRegistro}: CSV_COMILLAS_SIN_CERRAR`);
  else if (hayContenido || campos.length > 0 || campo.length > 0) cerrarRegistro();
  return { registros, errores };
}

function detectarDelimitador(contenido: string): { delimitador: string; parseo: ParseoCSV } | null {
  const candidatos = [',', ';', '\t', '|'];
  const intentos = candidatos.map((delimitador) => ({ delimitador, parseo: parsearRegistros(contenido, delimitador) }))
    .filter((x) => x.parseo.registros.length > 0)
    .sort((a, b) => {
      const aAncho = a.parseo.registros[0]?.campos.length || 0;
      const bAncho = b.parseo.registros[0]?.campos.length || 0;
      const aConsistente = a.parseo.registros.filter((r) => r.campos.length === aAncho).length;
      const bConsistente = b.parseo.registros.filter((r) => r.campos.length === bAncho).length;
      return bAncho - aAncho || bConsistente - aConsistente;
    });
  const mejor = intentos[0];
  if (!mejor || mejor.parseo.registros[0].campos.length < 2) return null;
  return mejor;
}

export function parseCSV(contenido: string): CsvParseResult {
  const limpio = String(contenido ?? '').replace(/^\uFEFF/, '');
  if (!limpio.trim()) return { movimientosRaw: [], errores: ['CSV_VACIO'] };
  const detectado = detectarDelimitador(limpio);
  if (!detectado) return { movimientosRaw: [], errores: ['CSV_CABECERA_INVALIDA'] };
  const { registros, errores: erroresParseo } = detectado.parseo;
  if (registros.length < 2) return { movimientosRaw: [], errores: [...erroresParseo, 'CSV_SIN_MOVIMIENTOS'], delimitador: detectado.delimitador };

  const headers = registros[0].campos.map((h) => h.trim());
  const normalizados = headers.map(normalizarHeader);
  const errores = [...erroresParseo];
  if (headers.some((h) => !h) || new Set(normalizados).size !== normalizados.length) {
    errores.push('CSV_CABECERA_DUPLICADA_O_VACIA');
  }
  const movimientosRaw: CsvFilaCruda[] = [];
  for (const registro of registros.slice(1)) {
    if (registro.campos.length !== headers.length) {
      errores.push(`Fila ${registro.fila}: CSV_NUMERO_COLUMNAS_INVALIDO`);
      continue;
    }
    const obj: CsvFilaCruda = {};
    headers.forEach((h, idx) => { obj[h] = registro.campos[idx].trim(); });
    Object.defineProperty(obj, '__filaOrigen', { value: String(registro.fila), enumerable: false });
    movimientosRaw.push(obj);
  }
  return { movimientosRaw, errores, delimitador: detectado.delimitador };
}

export function normalizarMovimientosCSV(
  raw: CsvFilaCruda[],
  mapping?: CsvMapping,
): { movimientos: MovimientoCsvNormalizado[]; errores: string[] } {
  if (raw.length === 0) return { movimientos: [], errores: ['CSV_SIN_MOVIMIENTOS'] };
  const headers = Object.keys(raw[0]);
  const colFecha = encontrarColumna(headers, DEFAULT_CSV_HEADERS.fecha, mapping?.fecha);
  const colFechaValor = encontrarColumna(headers, DEFAULT_CSV_HEADERS.fechaValor, mapping?.fechaValor);
  const colConcepto = encontrarColumna(headers, DEFAULT_CSV_HEADERS.concepto, mapping?.concepto || mapping?.descripcion);
  const colImporte = encontrarColumna(headers, DEFAULT_CSV_HEADERS.importe, mapping?.importe);
  const colSaldo = encontrarColumna(headers, DEFAULT_CSV_HEADERS.saldo, mapping?.saldo);
  const colRef = encontrarColumna(headers, DEFAULT_CSV_HEADERS.referencia, mapping?.referencia);
  const colId = encontrarColumna(headers, DEFAULT_CSV_HEADERS.identificador, mapping?.identificador);
  const colDivisa = encontrarColumna(headers, DEFAULT_CSV_HEADERS.divisa, mapping?.divisa);
  const colCuenta = encontrarColumna(headers, DEFAULT_CSV_HEADERS.cuenta, mapping?.cuenta);
  const errores: string[] = [];
  const movimientos: MovimientoCsvNormalizado[] = [];
  if (!colFecha) errores.push('CSV_FALTA_COLUMNA_FECHA');
  if (!colImporte) errores.push('CSV_FALTA_COLUMNA_IMPORTE');

  for (let i = 0; i < raw.length; i += 1) {
    const fila = Number(raw[i].__filaOrigen) || i + 2;
    const fechaRaw = colFecha ? raw[i][colFecha] : '';
    const importeRaw = colImporte ? raw[i][colImporte] : '';
    const fecha = parseFechaCSV(fechaRaw);
    const importe = parseImporteCSV(importeRaw);
    let invalida = false;
    if (!fecha) { errores.push(`Fila ${fila}: FECHA_INVALIDA`); invalida = true; }
    if (importe === null || importe === 0) { errores.push(`Fila ${fila}: IMPORTE_INVALIDO`); invalida = true; }
    const fechaValorRaw = colFechaValor ? raw[i][colFechaValor] : '';
    const fechaValor = fechaValorRaw ? parseFechaCSV(fechaValorRaw) : undefined;
    if (fechaValorRaw && !fechaValor) { errores.push(`Fila ${fila}: FECHA_VALOR_INVALIDA`); invalida = true; }
    const saldoRaw = colSaldo ? raw[i][colSaldo] : '';
    const saldo = saldoRaw ? parseImporteCSV(saldoRaw) : undefined;
    if (saldoRaw && saldo === null) { errores.push(`Fila ${fila}: SALDO_INVALIDO`); invalida = true; }
    if (invalida || !fecha || importe === null) continue;
    movimientos.push({
      fecha,
      ...(fechaValor ? { fechaValor } : {}),
      concepto: colConcepto ? raw[i][colConcepto].trim() : '',
      importe,
      ...(saldo !== undefined && saldo !== null ? { saldo } : {}),
      ...(colRef && raw[i][colRef] ? { referencia: raw[i][colRef].trim() } : {}),
      ...(colId && raw[i][colId] ? { identificador: raw[i][colId].trim() } : {}),
      ...(colDivisa && raw[i][colDivisa] ? { divisa: raw[i][colDivisa].trim() } : {}),
      ...(colCuenta && raw[i][colCuenta] ? { cuenta: raw[i][colCuenta].trim() } : {}),
      fila,
      raw: Object.fromEntries(Object.entries(raw[i]).filter(([key]) => key !== '__filaOrigen')),
    });
  }
  return { movimientos, errores };
}
