/**
 * BLOQUE 7 — Adaptador XLSX real del importador/exportador canónicos.
 *
 * Implementa el puerto `AdaptadorXlsx` que `xlsxStub.ts` dejó preparado, SIN
 * dependencias externas: `zip.ts` (contenedor OPC) + `inflate.ts` (DEFLATE) +
 * `fechasExcel.ts` (seriales de fecha). El stub pasa a ser un alias compatible
 * de este módulo, de modo que todo el código existente sigue funcionando.
 *
 * LECTURA (importación) — un `.xlsx` es un ZIP con XML:
 *  · hojas múltiples: se listan TODAS y se informa cuál se usa (`hoja` opcional
 *    por nombre o índice); pedir una hoja inexistente es error, no silencio;
 *  · `sharedStrings.xml` (con runs `<r><t>`), `inlineStr`, `str`, números,
 *    booleanos, errores (`#N/A` → vacío + aviso) y fechas por serial;
 *  · `date1904` se respeta (ignorarlo desplazaría 1462 días todas las fechas);
 *  · fórmulas: se toma el valor calculado `<v>`; NUNCA se evalúan fórmulas, y
 *    un valor de usuario que empiece por `=`, `+`, `-` o `@` se lee como TEXTO
 *    (no hay evaluación ⇒ no hay inyección de fórmulas posible);
 *  · cabecera obligatoria: primera fila con contenido (o `filaCabecera`), con
 *    las mismas convenciones que el parser CSV (trim, duplicadas `__2`,
 *    vacías `__sin_nombre__`, sobrantes `__extra_N`) para que el contrato sea
 *    uno solo;
 *  · errores aislados por fila: un fallo no descarta el archivo;
 *  · cotas explícitas (bytes/registros) con lo omitido contado, nunca truncado
 *    en silencio; ZIP64/cifrado → error honesto.
 *
 * ESCRITURA (exportación): genera un libro válido (OPC/SpreadsheetML) con los
 * mismos valores canónicos, determinista byte a byte (mismo contenido ⇒ mismo
 * sha256). Los valores textuales se escriben siempre como `inlineStr`: un texto
 * que empiece por `=` queda como TEXTO, jamás como fórmula (defensa en el
 * fichero generado, además de la sanitización del exportador).
 *
 * Puro: sin I/O, sin reloj, sin azar, sin APIs de plataforma.
 */
import { ErrorZip, escribirZip, leerZip, textoDeParte, type ParteZip } from './zip';
import type { FormatoEntrada } from './contrato';
import type { ResultadoParseo } from './jsonParser';
import {
  clasificarFormatoExcel,
  esFormatoDeFecha,
  fechaIsoDesdeSerialExcel,
  FMT_FECHA_EXCEL,
  FMT_FECHAHORA_EXCEL,
  serialDesdeFechaIso,
  type ClaseFormatoExcel,
  type SistemaFechaExcel,
} from './fechasExcel';

export const XLSX_MAX_BYTES_DEFECTO = 25 * 1024 * 1024;
export const XLSX_MAX_REGISTROS_DEFECTO = 50_000;
/** Límite duro del formato para el texto de una celda. */
export const XLSX_MAX_CARACTERES_CELDA = 32_767;
/** Límite del formato para el nombre de una hoja. */
export const XLSX_MAX_CARACTERES_HOJA = 31;

export interface OpcionesXlsx {
  /** Hoja por nombre o índice 0-based. Sin valor: primera hoja del libro. */
  hoja?: string | number;
  /** Fila de cabecera (1-based). Sin valor: primera fila con contenido. */
  filaCabecera?: number;
  maxBytes?: number;
  maxRegistros?: number;
  /** Forzar sistema de fechas; por defecto se respeta `date1904` del libro. */
  sistemaFecha?: SistemaFechaExcel;
}

export interface ResultadoXlsx extends ResultadoParseo<Record<string, unknown>> {
  /** Nombres de TODAS las hojas del libro, en orden. */
  hojas: string[];
  /** Hoja realmente leída (null si no se pudo leer ninguna). */
  hojaUsada: string | null;
  /** Fila de cabecera usada (1-based; 0 si no se detectó). */
  filaCabeceraUsada: number;
  /** Sistema de fechas del libro ('1900' | '1904'). */
  sistemaFecha: SistemaFechaExcel;
}

// ---------------------------------------------------------------------------
// XML mínimo (suficiente para SpreadsheetML, sin dependencias)
// ---------------------------------------------------------------------------

const ENTIDADES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

export function desescaparXml(texto: string): string {
  return texto.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (todo, cuerpo: string) => {
    if (cuerpo.startsWith('#x') || cuerpo.startsWith('#X')) {
      const codigo = Number.parseInt(cuerpo.slice(2), 16);
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : todo;
    }
    if (cuerpo.startsWith('#')) {
      const codigo = Number.parseInt(cuerpo.slice(1), 10);
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : todo;
    }
    return ENTIDADES[cuerpo] ?? todo;
  });
}

function atributos(tag: string): Record<string, string> {
  const salida: Record<string, string> = {};
  const re = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) salida[m[1]] = desescaparXml(m[2]);
  return salida;
}

function textosDe(inner: string, etiqueta: string): string[] {
  const salida: string[] = [];
  const re = new RegExp(`<${etiqueta}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${etiqueta}>)`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) salida.push(desescaparXml(m[1] ?? ''));
  return salida;
}

/** Índice de columna desde la referencia de celda ('A1' → 0, 'AB7' → 27). */
export function indiceColumnaDesdeRef(ref: string): number | null {
  const m = /^([A-Za-z]{1,3})\d*$/.exec(ref.trim());
  if (!m) return null;
  let n = 0;
  const letras = m[1].toUpperCase();
  for (let i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
  return n - 1;
}

/** Letras de columna desde el índice 0-based (0 → 'A', 27 → 'AB'). */
export function refColumna(indice: number): string {
  let n = indice + 1;
  let salida = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    salida = String.fromCharCode(65 + resto) + salida;
    n = Math.floor((n - 1) / 26);
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Lectura de partes del libro
// ---------------------------------------------------------------------------

interface Estilos {
  /** clase de formato por índice de cellXfs. */
  readonly clases: ClaseFormatoExcel[];
}

function parsearEstilos(xml: string | null): Estilos {
  if (!xml) return { clases: ['numero'] };
  const personalizados = new Map<number, string>();
  const bloqueNumFmts = /<numFmts[\s\S]*?<\/numFmts>/.exec(xml)?.[0] ?? '';
  const reNumFmt = /<numFmt([^>]*)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = reNumFmt.exec(bloqueNumFmts)) !== null) {
    const a = atributos(m[1]);
    const id = Number(a['numFmtId']);
    if (Number.isFinite(id) && a['formatCode'] !== undefined) personalizados.set(id, a['formatCode']);
  }
  const bloqueXfs = /<cellXfs[\s\S]*?<\/cellXfs>/.exec(xml)?.[0] ?? '';
  const clases: ClaseFormatoExcel[] = [];
  const reXf = /<xf([^>]*?)\/?>/g;
  while ((m = reXf.exec(bloqueXfs)) !== null) {
    const a = atributos(m[1]);
    const numFmtId = Number(a['numFmtId'] ?? '0');
    clases.push(esFormatoDeFecha(Number.isFinite(numFmtId) ? numFmtId : 0, personalizados.get(numFmtId)));
  }
  return { clases: clases.length > 0 ? clases : ['numero'] };
}

interface HojaLibro {
  readonly nombre: string;
  readonly rId: string;
}

function parsearWorkbook(xml: string): { hojas: HojaLibro[]; sistemaFecha: SistemaFechaExcel } {
  const hojas: HojaLibro[] = [];
  const reHoja = /<sheet([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = reHoja.exec(xml)) !== null) {
    const a = atributos(m[1]);
    if (a['name'] === undefined) continue;
    hojas.push({ nombre: a['name'], rId: a['r:id'] ?? a['id'] ?? '' });
  }
  const date1904 = /<workbookPr([^>]*)\/?>/.exec(xml)?.[1] ?? '';
  const sistema: SistemaFechaExcel = /date1904\s*=\s*"(1|true)"/i.test(date1904) ? '1904' : '1900';
  return { hojas, sistemaFecha: sistema };
}

function parsearRelaciones(xml: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const re = /<Relationship([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const a = atributos(m[1]);
    if (a['Id'] && a['Target']) mapa.set(a['Id'], a['Target']);
  }
  return mapa;
}

/** Normaliza el destino de una relación a la ruta interna del ZIP. */
export function normalizarRutaParte(target: string, base = 'xl'): string {
  const t = target.replace(/^\.\//, '');
  if (t.startsWith('/')) return t.slice(1);
  return `${base}/${t}`;
}

function parsearSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const salida: string[] = [];
  const re = /<si(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/si>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const inner = m[1] ?? '';
    salida.push(textosDe(inner, 't').join(''));
  }
  return salida;
}

interface CeldaCruda {
  readonly columna: number;
  readonly valor: unknown;
  readonly aviso?: string;
}

function valorDeCelda(
  attrsTexto: string,
  inner: string,
  sharedStrings: readonly string[],
  estilos: Estilos,
  sistema: SistemaFechaExcel,
): CeldaCruda & { columna: number } {
  const a = atributos(attrsTexto);
  const columna = indiceColumnaDesdeRef(a['r'] ?? '') ?? -1;
  const tipo = a['t'] ?? 'n';
  const calcularAviso = (texto: string): string | undefined => (texto ? texto : undefined);
  if (tipo === 's') {
    const idx = Number((/<v[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '').trim());
    if (!Number.isInteger(idx) || idx < 0 || idx >= sharedStrings.length) {
      return { columna, valor: null, aviso: `índice de cadena compartida fuera de rango (${a['r'] ?? '?'})` };
    }
    return { columna, valor: sharedStrings[idx] };
  }
  if (tipo === 'inlineStr') {
    const is = /<is(?:\s[^>]*)?>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? inner;
    return { columna, valor: textosDe(is, 't').join('') };
  }
  if (tipo === 'str') {
    return { columna, valor: textosDe(inner, 'v').join('') };
  }
  if (tipo === 'b') {
    const v = (textosDe(inner, 'v')[0] ?? '').trim();
    if (v === '1' || v.toLowerCase() === 'true') return { columna, valor: true };
    if (v === '0' || v.toLowerCase() === 'false') return { columna, valor: false };
    return { columna, valor: null, aviso: `booleano no reconocido ('${v}')` };
  }
  if (tipo === 'e') {
    return { columna, valor: null, aviso: `celda con error de Excel '${(textosDe(inner, 'v')[0] ?? '').trim() || '?'}' → vacía` };
  }
  if (tipo === 'd') {
    const v = (textosDe(inner, 'v')[0] ?? '').trim();
    return { columna, valor: v === '' ? null : v };
  }
  // Número (o fecha por serial, según el formato de la celda).
  const crudo = textosDe(inner, 'v')[0];
  if (crudo === undefined || crudo.trim() === '') {
    const tieneFormula = /<f[\s>]/.test(inner);
    return {
      columna,
      valor: null,
      aviso: calcularAviso(tieneFormula ? 'fórmula sin valor calculado: no se evalúa (celda vacía)' : ''),
    };
  }
  const numero = Number(crudo.trim().replace(',', '.'));
  if (!Number.isFinite(numero)) return { columna, valor: null, aviso: `valor numérico ilegible ('${crudo}')` };
  const indiceXf = Number(a['s'] ?? '0');
  const clase = estilos.clases[Number.isInteger(indiceXf) && indiceXf >= 0 ? indiceXf : 0] ?? 'numero';
  if (clase === 'numero') return { columna, valor: numero };
  const r = fechaIsoDesdeSerialExcel(numero, { sistema });
  if ('error' in r) return { columna, valor: null, aviso: `celda con formato de fecha pero ${r.error}` };
  if (r.fecha === '') {
    return { columna, valor: null, aviso: `${r.aviso ?? 'serial sin fecha'} (se descarta la hora sin día: no hay campo de hora en el ERP)` };
  }
  const conHora = r.hora !== undefined;
  return {
    columna,
    valor: conHora ? `${r.fecha}T${r.hora}` : r.fecha,
    ...(r.aviso !== undefined ? { aviso: r.aviso } : {}),
  };
}

interface FilaCruda {
  readonly numeroFila: number;
  readonly celdas: Map<number, unknown>;
  readonly avisos: string[];
}

function parsearHoja(xml: string, sharedStrings: readonly string[], estilos: Estilos, sistema: SistemaFechaExcel): FilaCruda[] {
  const filas: FilaCruda[] = [];
  const reFila = /<row([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let m: RegExpExecArray | null;
  let indice = 0;
  while ((m = reFila.exec(xml)) !== null) {
    indice++;
    const attrs = atributos(m[1]);
    const declarada = Number(attrs['r']);
    const numeroFila = Number.isInteger(declarada) && declarada > 0 ? declarada : indice;
    const inner = m[2] ?? '';
    const celdas = new Map<number, unknown>();
    const avisos: string[] = [];
    const reCelda = /<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let mc: RegExpExecArray | null;
    let posicion = 0;
    while ((mc = reCelda.exec(inner)) !== null) {
      const leida = valorDeCelda(mc[1], mc[2] ?? '', sharedStrings, estilos, sistema);
      const columna = leida.columna >= 0 ? leida.columna : posicion;
      posicion = columna + 1;
      if (leida.aviso) avisos.push(`celda ${refColumna(columna)}${numeroFila}: ${leida.aviso}`);
      if (leida.valor !== null && leida.valor !== undefined && leida.valor !== '') celdas.set(columna, leida.valor);
    }
    filas.push({ numeroFila, celdas, avisos });
  }
  return filas;
}

function esFilaVacia(f: FilaCruda): boolean {
  return f.celdas.size === 0;
}

function nombreCabecera(crudo: string, ocurrencias: Map<string, number>): string {
  const base = crudo.trim() === '' ? '__sin_nombre__' : crudo.trim();
  const n = (ocurrencias.get(base) ?? 0) + 1;
  ocurrencias.set(base, n);
  return n === 1 ? base : `${base}__${n}`;
}

/**
 * Lee un `.xlsx` real. Nunca lanza por contenido: devuelve errores/avisos.
 * (Los fallos de programación —opciones incoherentes— también se informan.)
 */
/** Firma del contenedor OLE2 (Excel 97-2003, .xls binario). */
function esOle2(bytes: Uint8Array): boolean {
  const firma = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return bytes.length >= firma.length && firma.every((b, i) => bytes[i] === b);
}

export function parseXlsx(entrada: Uint8Array | ArrayBuffer, opciones: OpcionesXlsx = {}): ResultadoXlsx {
  const maxBytes = opciones.maxBytes ?? XLSX_MAX_BYTES_DEFECTO;
  const maxRegistros = opciones.maxRegistros ?? XLSX_MAX_REGISTROS_DEFECTO;
  const bytes = entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada);
  const base: ResultadoXlsx = {
    formato: 'XLSX' as FormatoEntrada,
    registros: [], avisos: [], errores: [], registrosOmitidos: 0, localizaciones: [],
    hojas: [], hojaUsada: null, filaCabeceraUsada: 0, sistemaFecha: opciones.sistemaFecha ?? '1900',
  };
  if (bytes.length === 0) {
    base.errores.push('archivo vacío (0 bytes)');
    return base;
  }
  if (bytes.length > maxBytes) {
    base.errores.push(`archivo de ${bytes.length} bytes supera la cota de ${maxBytes} (integridad estructural: dividir el libro)`);
    return base;
  }
  // Formato heredado .xls (BIFF dentro de un contenedor OLE2): NO se soporta y
  // se dice por qué. Fingir que se lee (o devolver «archivo corrupto») haría
  // que el operador reenviara el mismo archivo creyendo que el fallo es suyo.
  if (esOle2(bytes)) {
    base.errores.push('libro .xls antiguo (BIFF/OLE2) no soportado: ábrelo en Excel y guárdalo como .xlsx (o expórtalo a CSV)');
    return base;
  }
  let partes;
  try {
    partes = leerZip(bytes);
  } catch (e) {
    base.errores.push(e instanceof ErrorZip || e instanceof Error ? e.message : String(e));
    return base;
  }
  const porNombre = new Map<string, Uint8Array>(partes.map((p) => [p.nombre, p.datos] as const));
  const workbookXml = porNombre.has('xl/workbook.xml') ? textoDeParte(porNombre.get('xl/workbook.xml')!) : null;
  if (!workbookXml) {
    base.errores.push(
      "no es un libro .xlsx válido: falta 'xl/workbook.xml' (¿es un .xls antiguo, un CSV renombrado o un ZIP ajeno?)",
    );
    return base;
  }
  const { hojas, sistemaFecha: sistemaLibro } = parsearWorkbook(workbookXml);
  base.hojas = hojas.map((h) => h.nombre);
  base.sistemaFecha = opciones.sistemaFecha ?? sistemaLibro;
  if (hojas.length === 0) {
    base.errores.push('el libro no declara ninguna hoja');
    return base;
  }
  const relsXml = porNombre.has('xl/_rels/workbook.xml.rels') ? textoDeParte(porNombre.get('xl/_rels/workbook.xml.rels')!) : '';
  const rels = parsearRelaciones(relsXml);
  const shared = parsearSharedStrings(porNombre.has('xl/sharedStrings.xml') ? textoDeParte(porNombre.get('xl/sharedStrings.xml')!) : null);
  const estilos = parsearEstilos(porNombre.has('xl/styles.xml') ? textoDeParte(porNombre.get('xl/styles.xml')!) : null);

  let indiceHoja: number;
  if (opciones.hoja === undefined) {
    indiceHoja = 0;
    if (hojas.length > 1) {
      base.avisos.push(`libro con ${hojas.length} hojas (${hojas.map((h) => `'${h.nombre}'`).join(', ')}): se lee '${hojas[0].nombre}' (indicar 'hoja' para elegir otra)`);
    }
  } else if (typeof opciones.hoja === 'number') {
    indiceHoja = opciones.hoja;
    if (!Number.isInteger(indiceHoja) || indiceHoja < 0 || indiceHoja >= hojas.length) {
      base.errores.push(`hoja índice ${opciones.hoja} fuera de rango (el libro tiene ${hojas.length}: ${hojas.map((h) => `'${h.nombre}'`).join(', ')})`);
      return base;
    }
  } else {
    indiceHoja = hojas.findIndex((h) => h.nombre === opciones.hoja);
    if (indiceHoja < 0) {
      base.errores.push(`hoja '${opciones.hoja}' no existe en el libro (hojas: ${hojas.map((h) => `'${h.nombre}'`).join(', ')})`);
      return base;
    }
    // INFO: se deja constancia de la hoja elegida y de cuántas había (el
    // operador debe saber qué parte del libro se leyó, aunque la pidiera él).
    if (hojas.length > 1) {
      base.avisos.push(`hoja '${hojas[indiceHoja].nombre}' seleccionada entre ${hojas.length} del libro (${hojas.map((h) => `'${h.nombre}'`).join(', ')})`);
    }
  }
  const hoja = hojas[indiceHoja];
  base.hojaUsada = hoja.nombre;
  const destino = rels.get(hoja.rId) ?? `worksheets/sheet${indiceHoja + 1}.xml`;
  const rutaHoja = normalizarRutaParte(destino);
  const hojaXml = porNombre.has(rutaHoja) ? textoDeParte(porNombre.get(rutaHoja)!) : null;
  if (!hojaXml) {
    base.errores.push(`no se encuentra la parte '${rutaHoja}' de la hoja '${hoja.nombre}' (libro incompleto)`);
    return base;
  }
  const filas = parsearHoja(hojaXml, shared, estilos, base.sistemaFecha);
  if (filas.length === 0) {
    base.errores.push(`la hoja '${hoja.nombre}' no tiene filas`);
    return base;
  }
  for (const f of filas) {
    for (const a of f.avisos) base.avisos.push(`hoja '${hoja.nombre}' ${a}`);
  }
  const conContenido = filas.filter((f) => !esFilaVacia(f));
  if (conContenido.length === 0) {
    base.errores.push(`la hoja '${hoja.nombre}' solo tiene filas vacías`);
    return base;
  }
  const filaCabecera = opciones.filaCabecera ?? conContenido[0].numeroFila;
  const filaCabeceraReal = filas.find((f) => f.numeroFila === filaCabecera && !esFilaVacia(f));
  if (!filaCabeceraReal) {
    base.errores.push(`fila de cabecera ${filaCabecera} vacía o inexistente en la hoja '${hoja.nombre}'`);
    return base;
  }
  base.filaCabeceraUsada = filaCabecera;
  const columnas: string[] = [];
  const maxColumna = Math.max(...[...filaCabeceraReal.celdas.keys()]);
  const ocurrencias = new Map<string, number>();
  for (let c = 0; c <= maxColumna; c++) {
    const valor = filaCabeceraReal.celdas.get(c);
    columnas.push(nombreCabecera(valor === undefined || valor === null ? '' : String(valor), ocurrencias));
  }
  if ([...ocurrencias.values()].some((n) => n > 1)) {
    base.avisos.push('columnas duplicadas en la cabecera: se sufijan (__2, __3…) para no mezclar valores');
  }
  const cuerpo = conContenido.filter((f) => f.numeroFila > filaCabecera);
  const vacias = filas.filter((f) => esFilaVacia(f) && f.numeroFila > filaCabecera).length;
  if (vacias > 0) base.avisos.push(`${vacias} fila(s) vacía(s) ignorada(s) (no se inventan registros)`);
  const efectivas = cuerpo.slice(0, maxRegistros);
  if (cuerpo.length > maxRegistros) {
    base.registrosOmitidos = cuerpo.length - maxRegistros;
    base.avisos.push(`${base.registrosOmitidos} fila(s) omitidas por cota (${maxRegistros}): dividir el libro para el resto`);
  }
  for (const fila of efectivas) {
    const registro: Record<string, unknown> = {};
    for (let c = 0; c < columnas.length; c++) {
      registro[columnas[c]] = fila.celdas.has(c) ? fila.celdas.get(c) : '';
    }
    const sobrantes: number[] = [];
    for (const c of fila.celdas.keys()) if (c >= columnas.length) sobrantes.push(c);
    for (const c of sobrantes.sort((x, y) => x - y)) {
      registro[`__extra_${c - columnas.length + 1}`] = fila.celdas.get(c);
    }
    if (sobrantes.length > 0) {
      base.avisos.push(`hoja '${hoja.nombre}' fila ${fila.numeroFila}: ${sobrantes.length} valor(es) extra conservados como __extra_N`);
    }
    base.registros.push(registro);
    base.localizaciones.push(`hoja '${hoja.nombre}' fila ${fila.numeroFila}`);
  }
  return base;
}

/** Compatibilidad con el puerto preparado en `xlsxStub.ts` (contrato idéntico). */
export interface AdaptadorXlsx {
  readonly nombre: string;
  parse(
    bytes: Uint8Array,
    opciones?: { hoja?: string | number; maxRegistros?: number },
  ): ResultadoParseo<Record<string, unknown>> & { hojas: string[] };
}

export const ADAPTADOR_XLSX_REAL: AdaptadorXlsx = {
  nombre: 'xlsx-interno-bloque-7 (ZIP+DEFLATE propios, sin dependencias)',
  parse: (bytes, opciones) => parseXlsx(bytes, opciones ?? {}),
};

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export type TipoColumnaXlsx = 'texto' | 'numero' | 'fecha';

export interface ColumnaXlsx {
  readonly nombre: string;
  readonly tipo: TipoColumnaXlsx;
}

export interface HojaXlsxDatos {
  readonly nombre: string;
  readonly columnas: readonly ColumnaXlsx[];
  readonly filas: ReadonlyArray<Record<string, unknown>>;
}

export class ErrorXlsxGeneracion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorXlsxGeneracion';
  }
}

/** Sanea el nombre de hoja (límites del formato) sin inventar contenido. */
export function sanearNombreHoja(nombre: string, indice: number): string {
  const limpio = nombre.replace(/[[\]:*?/\\]/g, '_').trim();
  const base = limpio === '' ? `Hoja${indice + 1}` : limpio;
  return base.length > XLSX_MAX_CARACTERES_HOJA ? base.slice(0, XLSX_MAX_CARACTERES_HOJA) : base;
}

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); // caracteres no válidos en XML 1.0
}

function numeroExcel(valor: number): string {
  if (!Number.isFinite(valor)) throw new ErrorXlsxGeneracion(`valor numérico no finito (${valor})`);
  return String(valor);
}

function celdaXml(ref: string, tipo: TipoColumnaXlsx, valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (tipo === 'numero') {
    if (typeof valor === 'number') {
      return `<c r="${ref}"><v>${numeroExcel(valor)}</v></c>`;
    }
    if (typeof valor === 'boolean') return `<c r="${ref}" t="b"><v>${valor ? 1 : 0}</v></c>`;
    const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor.replace(',', '.')) : NaN;
    if (Number.isFinite(n)) return `<c r="${ref}"><v>${numeroExcel(n)}</v></c>`;
    // No numérico en columna numérica: se escribe como TEXTO (nunca como
    // fórmula y nunca como número inventado).
    return celdaTextoXml(ref, String(valor));
  }
  if (tipo === 'fecha') {
    const texto = String(valor);
    const serial = serialDesdeFechaIso(texto);
    if (serial === null) return celdaTextoXml(ref, texto);
    const conHora = /[T ]\d{2}:\d{2}/.test(texto.trim());
    const estilo = conHora ? 2 : 1;
    return `<c r="${ref}" s="${estilo}"><v>${numeroExcel(serial)}</v></c>`;
  }
  return celdaTextoXml(ref, String(valor));
}

/**
 * Texto en celda. Se usa `inlineStr`, que NO puede contener fórmulas: un valor
 * de usuario `=1+1`, `+1`, `-1` o `@x` se escribe literalmente como texto.
 */
function celdaTextoXml(ref: string, texto: string): string {
  if (texto.length > XLSX_MAX_CARACTERES_CELDA) {
    throw new ErrorXlsxGeneracion(`texto de celda de ${texto.length} caracteres supera el límite de ${XLSX_MAX_CARACTERES_CELDA} de Excel`);
  }
  if (texto === '') return '';
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escaparXml(texto)}</t></is></c>`;
}

function hojaXml(hoja: HojaXlsxDatos): string {
  const columnas = hoja.columnas;
  if (columnas.length === 0) throw new ErrorXlsxGeneracion(`la hoja '${hoja.nombre}' no declara columnas`);
  const filas: string[] = [];
  const cabecera = columnas
    .map((c, i) => celdaTextoXml(`${refColumna(i)}1`, c.nombre))
    .filter((x) => x !== '')
    .join('');
  filas.push(`<row r="1">${cabecera}</row>`);
  hoja.filas.forEach((fila, indiceFila) => {
    const numeroFila = indiceFila + 2;
    const celdas = columnas
      .map((col, indiceCol) => celdaXml(`${refColumna(indiceCol)}${numeroFila}`, col.tipo, fila[col.nombre]))
      .filter((x) => x !== '')
      .join('');
    filas.push(`<row r="${numeroFila}">${celdas}</row>`);
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filas.join('')}</sheetData></worksheet>`;
}

const ESTILOS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="${FMT_FECHAHORA_EXCEL}" formatCode="yyyy-mm-dd\\ hh:mm:ss"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="${FMT_FECHA_EXCEL}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="${FMT_FECHAHORA_EXCEL}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/**
 * Genera un `.xlsx` válido y determinista (mismo contenido ⇒ mismos bytes).
 * Los nombres de hoja se sanean; los nombres duplicados son error explícito.
 */
export function generarXlsx(hojas: readonly HojaXlsxDatos[]): Uint8Array {
  if (hojas.length === 0) throw new ErrorXlsxGeneracion('un libro necesita al menos una hoja');
  const nombres = hojas.map((h, i) => sanearNombreHoja(h.nombre, i));
  const vistos = new Set<string>();
  for (const n of nombres) {
    if (vistos.has(n)) throw new ErrorXlsxGeneracion(`nombre de hoja duplicado tras sanear: '${n}'`);
    vistos.add(n);
  }
  const partes: ParteZip[] = [];
  const overrides = nombres
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join('');
  partes.push({
    nombre: '[Content_Types].xml',
    contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
  });
  partes.push({
    nombre: '_rels/.rels',
    contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  });
  const sheetsXml = nombres
    .map((nombre, i) => `<sheet name="${escaparXml(nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  partes.push({
    nombre: 'xl/workbook.xml',
    contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetsXml}</sheets></workbook>`,
  });
  const relsSheets = hojas
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join('');
  partes.push({
    nombre: 'xl/_rels/workbook.xml.rels',
    contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsSheets}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  });
  partes.push({ nombre: 'xl/styles.xml', contenido: ESTILOS_XML });
  hojas.forEach((hoja, i) => {
    partes.push({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: hojaXml(hoja) });
  });
  return escribirZip(partes);
}

/** Texto plano de una hoja (para previsualización y diagnóstico; no es el archivo). */
export function previsualizarXlsx(hojas: readonly HojaXlsxDatos[], maxFilas = 20): string {
  const lineas: string[] = [];
  for (const hoja of hojas) {
    lineas.push(`— hoja '${hoja.nombre}' (${hoja.filas.length} fila(s))`);
    lineas.push(hoja.columnas.map((c) => c.nombre).join(' | '));
    for (const fila of hoja.filas.slice(0, maxFilas)) {
      lineas.push(hoja.columnas.map((c) => String(fila[c.nombre] ?? '')).join(' | '));
    }
    if (hoja.filas.length > maxFilas) lineas.push(`…y ${hoja.filas.length - maxFilas} fila(s) más`);
  }
  return lineas.join('\n');
}
