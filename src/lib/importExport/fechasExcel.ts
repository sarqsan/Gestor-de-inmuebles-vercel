/**
 * BLOQUE 7 — Serial de fecha Excel ⇄ fecha civil ISO (Europe/Madrid), puro.
 *
 * Reglas del formato real (documentadas y verificadas en tests):
 *  · Sistema 1900 (por defecto): día 1 = 1900-01-01; Excel cree erróneamente
 *    que 1900 fue bisiesto, así que el "29/02/1900" (serial 60) NO existe.
 *    Para seriales ≥ 61 la correspondencia es 1899-12-30 + serial días; para
 *    1..59 es 1899-12-31 + serial días (equivalente: 1900-01-01 + serial - 1).
 *    El serial 60 se normaliza a 1900-02-28 con aviso explícito (nunca una
 *    fecha inventada).
 *  · Sistema 1904 (mac): día 0 = 1904-01-01. Se soporta porque `workbook.xml`
 *    lo declara con `date1904`; ignorarlo desplazaría 1462 días TODAS las
 *    fechas del libro.
 *  · El cálculo se hace en UTC sobre el calendario civil: nunca se aplica la
 *    zona horaria del navegador ni `toISOString()` sobre una fecha local, así
 *    que el día civil importado es exactamente el del libro (sin cambios de día).
 *
 * Es puro: sin I/O, sin reloj, sin azar, sin `new Date()` con valor implícito.
 */

export type SistemaFechaExcel = '1900' | '1904';

export interface OpcionesFechaExcel {
  readonly sistema?: SistemaFechaExcel;
}

export interface ResultadoFechaExcel {
  /** Día civil ISO 'YYYY-MM-DD'. */
  readonly fecha: string;
  /** Hora 'HH:MM:SS' cuando el serial tiene fracción distinta de cero. */
  readonly hora?: string;
  /** Aviso honesto (p. ej. serial 60 inexistente en el calendario). */
  readonly aviso?: string;
}

export interface ResultadoErrorFechaExcel {
  readonly error: string;
}

const MS_DIA = 86_400_000;
const MS_SEGUNDO = 1000;
/** 1899-12-30T00:00:00Z — origen de los seriales ≥ 61 en el sistema 1900. */
const EPOCH_1900 = Date.UTC(1899, 11, 30);
/** 1904-01-01T00:00:00Z — origen del sistema 1904 (serial 0 = ese día). */
const EPOCH_1904 = Date.UTC(1904, 0, 1);
/** 1900-02-29 ficticio: máximo serial del "hueco" del calendario 1900. */
const SERIAL_1900_FICTICIO = 60;

function dosDigitos(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Fecha civil ISO construida desde partes UTC (sin desfases de zona). */
function fechaIsoDesdeMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${dosDigitos(d.getUTCMonth() + 1)}-${dosDigitos(d.getUTCDate())}`;
}

function horaDesdeFraccion(serial: number): string {
  let segundos = Math.round((serial - Math.floor(serial)) * 24 * 60 * 60);
  if (segundos >= 24 * 60 * 60) segundos = 24 * 60 * 60 - 1; // 23:59:59 por redondeo
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  return `${dosDigitos(h)}:${dosDigitos(m)}:${dosDigitos(s)}`;
}

/** ¿La fecha ISO tiene un día civil válido? (rechaza 2024-02-30, 2023-02-29…) */
export function esFechaCivilIso(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [, a, mes, d] = m;
  const anio = Number(a);
  const mesNum = Number(mes);
  const dia = Number(d);
  if (mesNum < 1 || mesNum > 12 || dia < 1 || dia > 31) return false;
  return fechaIsoDesdeMs(Date.UTC(anio, mesNum - 1, dia)) === iso;
}

/** Serial Excel → día civil ISO (+ hora si procede). Nunca lanza: devuelve motivo. */
export function fechaIsoDesdeSerialExcel(
  serial: number,
  opciones: OpcionesFechaExcel = {},
): ResultadoFechaExcel | ResultadoErrorFechaExcel {
  if (!Number.isFinite(serial)) return { error: `serial de fecha no finito (${serial})` };
  if (serial < 0) return { error: `serial de fecha negativo (${serial}): anterior al origen del sistema, fuera del formato Excel` };
  const sistema = opciones.sistema ?? '1900';
  const entero = Math.floor(serial);
  const hora = serial - entero > 0 ? horaDesdeFraccion(serial) : undefined;
  if (sistema === '1904') {
    // En 1904 el serial 0 ES un día válido (1904-01-01).
    const fecha = fechaIsoDesdeMs(EPOCH_1904 + entero * MS_DIA);
    return hora ? { fecha, hora } : { fecha };
  }
  if (serial < 1) {
    // Solo hora (o cero): no hay día civil que inventar.
    return { fecha: '', hora: horaDesdeFraccion(serial), aviso: 'serial sin parte de fecha (solo hora)' };
  }
  if (entero === SERIAL_1900_FICTICIO) {
    return {
      fecha: '1900-02-28',
      ...(hora ? { hora } : {}),
      aviso: 'serial 60: 29/02/1900 no existe en el calendario real (error histórico de Excel 1900); se usa 1900-02-28',
    };
  }
  const ajustado = entero < SERIAL_1900_FICTICIO ? entero + 1 : entero;
  const fecha = fechaIsoDesdeMs(EPOCH_1900 + ajustado * MS_DIA);
  return hora ? { fecha, hora } : { fecha };
}

function leerPartesIso(iso: string): { anio: number; mes: number; dia: number; h: number; m: number; s: number } | null {
  const conHora = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(iso.trim());
  if (!conHora) return null;
  const [, a, mes, d, h = '0', mi = '0', s = '0'] = conHora;
  const partes = {
    anio: Number(a), mes: Number(mes), dia: Number(d),
    h: Number(h), m: Number(mi), s: Number(s),
  };
  if (!esFechaCivilIso(`${a}-${mes}-${d}`)) return null;
  if (partes.h > 23 || partes.m > 59 || partes.s > 59) return null;
  return partes;
}

/** Fecha civil ISO ('YYYY-MM-DD' o 'YYYY-MM-DDTHH:MM[:SS]') → serial Excel.
 *  Devuelve null cuando el día es anterior al origen del sistema (Excel no
 *  puede representarlo: 1900-01-01 en el sistema 1900, 1904-01-01 en el 1904).
 */
export function serialDesdeFechaIso(
  iso: string,
  opciones: OpcionesFechaExcel = {},
): number | null {
  const p = leerPartesIso(iso);
  if (!p) return null;
  const sistema = opciones.sistema ?? '1900';
  const ms = Date.UTC(p.anio, p.mes - 1, p.dia);
  const base = sistema === '1904' ? EPOCH_1904 : EPOCH_1900;
  let dias = Math.round((ms - base) / MS_DIA);
  // Sistema 1900: el hueco ficticio del 29/02/1900 desplaza -1 los días
  // anteriores al 01/03/1900 (serial 61). Para 1900-03-01 y posteriores el
  // serial coincide exactamente con la diferencia de días respecto a
  // 1899-12-30, que es la base usada también al leer.
  if (sistema === '1900' && dias < SERIAL_1900_FICTICIO + 1) dias -= 1;
  // Sistema 1900: el serial 0 es el día ficticio 1900-01-00 → no representable.
  // Sistema 1904: el serial 0 ES 1904-01-01.
  if (sistema === '1900' ? dias < 1 : dias < 0) return null;
  const fraccion = (p.h * 3600 + p.m * 60 + p.s) / 86_400;
  return dias + fraccion;
}

// ---------------------------------------------------------------------------
// Clasificación de formatos numéricos de Excel
// ---------------------------------------------------------------------------

export type ClaseFormatoExcel = 'numero' | 'fecha' | 'hora' | 'fechaHora';

/** Formatos numéricos incorporados con semántica de fecha/hora (ECMA-376 §18.8.30). */
export const FORMATOS_FECHA_INCORPORADOS: readonly number[] = [
  14, 15, 16, 17, 18, 19, 20, 21, 22,
  27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47,
  50, 51, 52, 53, 54, 55, 56, 57, 58,
];

/** Códigos de formato personalizado de fecha/hora usados al generar (estables). */
export const FMT_FECHA_EXCEL = 14; // yyyy-mm-dd (incorporado)
export const FMT_FECHAHORA_EXCEL = 164; // yyyy-mm-dd hh:mm:ss (personalizado, el primero libre)

const FORMATO_FECHAHORA_NUEVO = 'yyyy-mm-dd\\ hh:mm:ss';

export interface DefinicionFormatoNumerico {
  readonly id: number;
  readonly codigo: string;
}

/** Tabla `numFmts` personalizada del libro (incluye la generada por nosotros). */
export function formatosNumericosDelLibro(codigosPersonalizados: readonly { id: number; codigo: string }[]): DefinicionFormatoNumerico[] {
  return [{ id: FMT_FECHAHORA_EXCEL, codigo: FORMATO_FECHAHORA_NUEVO }, ...codigosPersonalizados];
}

function limpiarCodigoFormato(codigo: string): string {
  return codigo
    .replace(/"[^"]*"/g, '') // texto literal
    .replace(/\[(?!h+\]|m+\]|s+\])[^\]]*\]/g, '') // [rojo], [$-409], [$€-2]…
    .replace(/\\./g, '') // escapes de un carácter
    .replace(/_.|\*./g, '') // relleno de ancho
    .replace(/@/g, '');
}

/**
 * Clasifica un código de formato. `m` es ambiguo (mes/minuto): si el formato
 * trae tokens de fecha (y/d) se interpreta como mes; sin ellos, como minuto.
 */
export function clasificarFormatoExcel(codigo: string): ClaseFormatoExcel {
  const limpio = limpiarCodigoFormato(codigo).toLowerCase();
  const tieneFecha = /y|d/.test(limpio);
  const tieneHora = /h|s/.test(limpio) || /am\/pm|a\/p/.test(limpio) || /\[[hms]+\]/.test(limpio);
  if (tieneFecha) return tieneHora ? 'fechaHora' : 'fecha';
  if (tieneHora) return 'hora';
  return 'numero';
}

export function esFormatoDeFecha(numFmtId: number, codigoPersonalizado?: string): ClaseFormatoExcel {
  if (codigoPersonalizado !== undefined) return clasificarFormatoExcel(codigoPersonalizado);
  return FORMATOS_FECHA_INCORPORADOS.includes(numFmtId) ? 'fecha' : 'numero';
}

/** Serial → texto legible para diagnósticos (nunca se usa como dato). */
export function describirSerialExcel(serial: number, opciones: OpcionesFechaExcel = {}): string {
  const r = fechaIsoDesdeSerialExcel(serial, opciones);
  if ('error' in r) return `serial inválido: ${r.error}`;
  return `${r.fecha}${r.hora ? ` ${r.hora}` : ''}`;
}

export const MS_POR_DIA_EXCEL = MS_DIA;
export const MS_POR_SEGUNDO_EXCEL = MS_SEGUNDO;
