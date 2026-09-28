/**
 * BLOQUE 7 — Lector/escritor ZIP mínimo y PURO (sin dependencias).
 *
 * Por qué existe: un `.xlsx` es un contenedor ZIP (OPC). El proyecto no tiene
 * librería de ZIP (`xlsxStub.ts` documentó la carencia). Aquí se implementa lo
 * estrictamente necesario y verificable:
 *  · LECTURA: directorio central + cabeceras locales; métodos 0 (almacenado) y
 *    8 (deflate) vía `infilarRaw`; verificación de CRC32 y de tamaños; nombres
 *    UTF-8; ZIP64 y cifrado → error explícito (nunca datos corruptos).
 *  · ESCRITURA: método 0 (almacenado) con CRC32, fechas DOS fijas y orden
 *    determinista de entradas ⇒ el mismo contenido produce EXACTAMENTE los
 *    mismos bytes (sha256 reproducible, requisito del contrato de exportación).
 *    No se comprime a propósito: comprimir introduciría variabilidad entre
 *    entornos y el contrato exige reproducibilidad del archivo generado.
 *
 * Puro: sin I/O, sin reloj, sin azar, sin APIs de plataforma.
 */
import { ErrorDeflate, inflarRaw } from './inflate';

export type MetodoZip = 0 | 8;

export interface EntradaZip {
  readonly nombre: string;
  readonly metodo: MetodoZip;
  readonly datos: Uint8Array;
  readonly crc32: number;
}

export class ErrorZip extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorZip';
  }
}

// ---------------------------------------------------------------------------
// CRC32 (ISO 3309 / ITU-T V.42, polinomio 0xEDB88320 invertido)
// ---------------------------------------------------------------------------

let tablaCrc: Int32Array | null = null;

function tablaCrc32(): Int32Array {
  if (tablaCrc) return tablaCrc;
  const tabla = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c;
  }
  tablaCrc = tabla;
  return tabla;
}

export function crc32(datos: Uint8Array): number {
  const tabla = tablaCrc32();
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = tabla[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

const FIRMA_EOCD = 0x06054b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_LOCAL = 0x04034b50;
const MAX_COMENTARIO_ZIP = 0xffff;

function u16(d: Uint8Array, p: number): number {
  return d[p] | (d[p + 1] << 8);
}
function u32(d: Uint8Array, p: number): number {
  return (d[p] | (d[p + 1] << 8) | (d[p + 2] << 16) | (d[p + 3] << 24)) >>> 0;
}

function buscarEOCD(datos: Uint8Array): number {
  const minimo = Math.max(0, datos.length - MAX_COMENTARIO_ZIP - 22);
  for (let p = datos.length - 22; p >= minimo; p--) {
    if (u32(datos, p) === FIRMA_EOCD) return p;
  }
  throw new ErrorZip('no es un ZIP válido (sin fin de directorio central: archivo truncado o formato distinto de .xlsx)');
}

const decodificadorUtf8 = new TextDecoder('utf-8');

function nombreDe(datos: Uint8Array, p: number, longitud: number): string {
  // Los nombres de parte OPC son ASCII; se decodifica tolerante (nunca lanza).
  return decodificadorUtf8.decode(datos.subarray(p, p + longitud));
}

/** Lista las entradas del ZIP (nombre + bytes descomprimidos), sin I/O. */
export function leerZip(datos: Uint8Array): EntradaZip[] {
  if (datos.length < 22) throw new ErrorZip('archivo demasiado pequeño para ser un ZIP');
  const eocd = buscarEOCD(datos);
  const totalEntradas = u16(datos, eocd + 10);
  const tamanoCentral = u32(datos, eocd + 12);
  const offsetCentral = u32(datos, eocd + 16);
  if (totalEntradas === 0xffff || tamanoCentral === 0xffffffff || offsetCentral === 0xffffffff) {
    throw new ErrorZip('ZIP64 no soportado (libro Excel de más de 4 GB o >65535 partes): dividir el archivo');
  }
  if (offsetCentral + tamanoCentral > datos.length) throw new ErrorZip('directorio central fuera del archivo (ZIP corrupto)');
  const entradas: EntradaZip[] = [];
  let p = offsetCentral;
  for (let i = 0; i < totalEntradas; i++) {
    if (p + 46 > datos.length || u32(datos, p) !== FIRMA_CENTRAL) throw new ErrorZip(`entrada central ${i} inválida (ZIP corrupto)`);
    const flags = u16(datos, p + 8);
    const metodo = u16(datos, p + 10);
    const crcLeido = u32(datos, p + 16);
    const tamComprimido = u32(datos, p + 20);
    const tamSinComprimir = u32(datos, p + 24);
    const nombreLong = u16(datos, p + 28);
    const extraLong = u16(datos, p + 30);
    const comentarioLong = u16(datos, p + 32);
    const offsetLocal = u32(datos, p + 42);
    const nombre = nombreDe(datos, p + 46, nombreLong);
    p += 46 + nombreLong + extraLong + comentarioLong;
    if (flags & 0x1) throw new ErrorZip(`entrada '${nombre}' cifrada: no soportado`);
    if (metodo !== 0 && metodo !== 8) throw new ErrorZip(`entrada '${nombre}' con método ZIP ${metodo}: solo 0 (almacenado) y 8 (deflate)`);
    if (offsetLocal + 30 > datos.length || u32(datos, offsetLocal) !== FIRMA_LOCAL) {
      throw new ErrorZip(`cabecera local de '${nombre}' inválida (ZIP corrupto)`);
    }
    const nombreLocalLong = u16(datos, offsetLocal + 26);
    const extraLocalLong = u16(datos, offsetLocal + 28);
    const inicioDatos = offsetLocal + 30 + nombreLocalLong + extraLocalLong;
    if (inicioDatos + tamComprimido > datos.length) throw new ErrorZip(`datos de '${nombre}' fuera del archivo (ZIP corrupto)`);
    const comprimido = datos.subarray(inicioDatos, inicioDatos + tamComprimido);
    let contenido: Uint8Array;
    if (metodo === 0) {
      contenido = comprimido.slice();
    } else {
      try {
        contenido = inflarRaw(comprimido);
      } catch (e) {
        throw new ErrorZip(`no se pudo descomprimir '${nombre}': ${e instanceof ErrorDeflate ? e.message : String(e)}`);
      }
    }
    if (tamSinComprimir !== 0 && contenido.length !== tamSinComprimir) {
      throw new ErrorZip(`tamaño incoherente en '${nombre}' (${contenido.length} ≠ ${tamSinComprimir}): ZIP corrupto`);
    }
    if (crc32(contenido) !== crcLeido) throw new ErrorZip(`CRC32 inválido en '${nombre}': archivo dañado`);
    entradas.push({ nombre, metodo: metodo as MetodoZip, datos: contenido, crc32: crcLeido });
  }
  return entradas;
}

/** Texto UTF-8 de una parte (BOM tolerado). */
export function textoDeParte(datos: Uint8Array): string {
  return decodificadorUtf8.decode(datos).replace(/^\uFEFF/, '');
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export interface ParteZip {
  readonly nombre: string;
  readonly contenido: string | Uint8Array;
}

const codificadorUtf8 = new TextEncoder();

function aBytes(contenido: string | Uint8Array): Uint8Array {
  return typeof contenido === 'string' ? codificadorUtf8.encode(contenido) : contenido;
}

/** Fecha DOS fija (1980-01-01 00:00) para que la salida sea determinista. */
const FECHA_DOS = 0x0021;
const HORA_DOS = 0x0000;

/**
 * Construye un ZIP (método almacenado, sin compresión) con orden determinista.
 * El resultado es byte a byte reproducible para el mismo contenido.
 */
export function escribirZip(partes: readonly ParteZip[]): Uint8Array {
  const locales: Uint8Array[] = [];
  const centrales: Uint8Array[] = [];
  let offset = 0;
  for (const parte of partes) {
    if (!parte.nombre || parte.nombre.length > 0xffff) throw new ErrorZip(`nombre de parte inválido: '${parte.nombre}'`);
    const datos = aBytes(parte.contenido);
    const nombre = codificadorUtf8.encode(parte.nombre);
    const crc = crc32(datos);
    const local = new Uint8Array(30 + nombre.length + datos.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, FIRMA_LOCAL, true);
    lv.setUint16(4, 20, true); // versión necesaria
    lv.setUint16(6, 0x0800, true); // nombres UTF-8
    lv.setUint16(8, 0, true); // método almacenado
    lv.setUint16(10, HORA_DOS, true);
    lv.setUint16(12, FECHA_DOS, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, datos.length, true);
    lv.setUint32(22, datos.length, true);
    lv.setUint16(26, nombre.length, true);
    lv.setUint16(28, 0, true);
    local.set(nombre, 30);
    local.set(datos, 30 + nombre.length);
    locales.push(local);

    const central = new Uint8Array(46 + nombre.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, FIRMA_CENTRAL, true);
    cv.setUint16(4, 20, true); // versión que lo creó
    cv.setUint16(6, 20, true); // versión necesaria
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, HORA_DOS, true);
    cv.setUint16(14, FECHA_DOS, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, datos.length, true);
    cv.setUint32(24, datos.length, true);
    cv.setUint16(28, nombre.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comentario
    cv.setUint16(34, 0, true); // disco
    cv.setUint16(36, 0, true); // atributos internos
    cv.setUint32(38, 0, true); // atributos externos
    cv.setUint32(42, offset, true);
    central.set(nombre, 46);
    centrales.push(central);
    offset += local.length;
  }
  const tamanoCentral = centrales.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, FIRMA_EOCD, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, partes.length, true);
  ev.setUint16(10, partes.length, true);
  ev.setUint32(12, tamanoCentral, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);
  const total = offset + tamanoCentral + eocd.length;
  const salida = new Uint8Array(total);
  let p = 0;
  for (const l of locales) { salida.set(l, p); p += l.length; }
  for (const c of centrales) { salida.set(c, p); p += c.length; }
  salida.set(eocd, p);
  return salida;
}
