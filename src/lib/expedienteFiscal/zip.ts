/**
 * B6.11 — Escritor ZIP mínimo y DETERMINISTA (sin dependencias nuevas).
 * Método STORE (sin compresión): suficiente para un ZIP interno de
 * revisión, y garantiza reproducibilidad byte a byte. Marcas de tiempo
 * fijadas a 1980-01-01 00:00:00 (época DOS) para que dos generaciones
 * con el mismo contenido produzcan el mismo binario.
 */

export interface EntradaZip {
  ruta: string;          // p.ej. 'manifest.json' — solo ASCII, sin '..'
  contenido: Uint8Array;
}

const TABLA_CRC32 = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC32[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Convierte texto UTF-8 a bytes (sin dependencias). */
export function utf8Bytes(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

/**
 * Construye el ZIP. Entradas ordenadas por ruta → binario determinista.
 * Estructura: [local headers + datos]* [central directory] [EOCD].
 */
export function crearZip(entradas: EntradaZip[]): Uint8Array {
  const ordenadas = [...entradas].sort((a, b) => a.ruta.localeCompare(b.ruta));
  for (const e of ordenadas) {
    if (!/^[\x20-\x7e]+$/.test(e.ruta) || e.ruta.includes('..')) {
      throw new Error(`Ruta ZIP no segura: ${e.ruta}`);
    }
  }

  const DOS_FECHA = 0x21; // 1980-01-01
  const DOS_HORA = 0x00;  // 00:00:00
  const trozos: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of ordenadas) {
    const nombre = utf8Bytes(e.ruta);
    const crc = crc32(e.contenido);
    const tam = e.contenido.length;

    // Local file header (30 bytes + nombre)
    const local = new Uint8Array(30 + nombre.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);       // version needed
    lv.setUint16(6, 0, true);        // flags
    lv.setUint16(8, 0, true);        // method: STORE
    lv.setUint16(10, DOS_HORA, true);
    lv.setUint16(12, DOS_FECHA, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, tam, true);     // tamaño comprimido = sin comprimir
    lv.setUint32(22, tam, true);
    lv.setUint16(26, nombre.length, true);
    lv.setUint16(28, 0, true);       // extra length
    local.set(nombre, 30);
    trozos.push(local, e.contenido);

    // Central directory header (46 bytes + nombre)
    const cen = new Uint8Array(46 + nombre.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, DOS_HORA, true);
    cv.setUint16(14, DOS_FECHA, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, tam, true);
    cv.setUint32(24, tam, true);
    cv.setUint16(28, nombre.length, true);
    // 30: extra, 32: comentario, 34: disco, 36: attrs int, 38: attrs ext = 0
    cv.setUint32(42, offset, true);  // offset relativo del local header
    cen.set(nombre, 46);
    central.push(cen);

    offset += local.length + tam;
  }

  const tamCentral = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, ordenadas.length, true);
  ev.setUint16(10, ordenadas.length, true);
  ev.setUint32(12, tamCentral, true);
  ev.setUint32(16, offset, true);

  const total = offset + tamCentral + eocd.length;
  const zip = new Uint8Array(total);
  let pos = 0;
  for (const t of [...trozos, ...central, eocd]) {
    zip.set(t, pos);
    pos += t.length;
  }
  return zip;
}
