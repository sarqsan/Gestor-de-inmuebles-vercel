/**
 * BLOQUE 3 — sha256Hex isomórfico (lib/importacion/hash.ts).
 * El hash dejó de usar node:crypto para poder ejecutarse en el bundle de
 * navegador (exportación de expediente desde el Centro Operativo). Este test
 * garantiza que la salida es SHA-256 real e idéntica a la de Node:
 *  · vectores oficiales FIPS 180-4;
 *  · verificación cruzada contra node:crypto con entradas aleatorias
 *    (strings ASCII, UTF-8 multibyte y binarios), incluidas longitudes
 *    alrededor de los bordes de bloque (55/56/63/64/65/119/120 bytes).
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/lib/importacion/hash';

function nodeSha256(input: string | Uint8Array): string {
  const h = createHash('sha256');
  if (typeof input === 'string') h.update(input, 'utf8');
  else h.update(input);
  return h.digest('hex');
}

describe('sha256Hex isomórfico · vectores FIPS 180-4', () => {
  it('cadena vacía', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('"abc"', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('448 bits ("abcdbcde...nopq")', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
  it('byte único 0xbd (vector NIST)', () => {
    expect(sha256Hex(new Uint8Array([0xbd])))
      .toBe('68325720aabd7c82f30f554b313d0570c95accbb7dc4b5aae11204c08ffe732b');
  });
  it('1.000.000 × "a"', () => {
    expect(sha256Hex('a'.repeat(1_000_000)))
      .toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });
});

describe('sha256Hex isomórfico · verificación cruzada contra node:crypto', () => {
  it('strings ASCII y UTF-8 multibyte aleatorios (200 casos)', () => {
    for (let i = 0; i < 200; i++) {
      const len = Math.floor(Math.random() * 200);
      let s = '';
      for (let j = 0; j < len; j++) s += String.fromCharCode(Math.floor(Math.random() * 0x20ac));
      expect(sha256Hex(s)).toBe(nodeSha256(s));
    }
  });
  it('binarios aleatorios en bordes de bloque (55/56/63/64/65/119/120 y largos)', () => {
    const longitudes = [0, 1, 55, 56, 63, 64, 65, 119, 120, 121, 127, 128, 255, 1024, 65536];
    for (const len of longitudes) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
      expect(sha256Hex(bytes)).toBe(nodeSha256(bytes));
    }
  });
  it('contenido típico del expediente (JSON determinista)', () => {
    const contenido = JSON.stringify({ esquema: 'rentasync-fiscal-export-v1', importe: 412.5, concepto: 'IBI 2026' });
    expect(sha256Hex(contenido)).toBe(nodeSha256(contenido));
  });
});
