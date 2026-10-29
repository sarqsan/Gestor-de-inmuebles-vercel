/**
 * Verificación por identidad de las reglas publicadas.
 *
 * Cadena de razonamiento que sostiene este atajo:
 *   1. CI ejecuta los casos de reglas del emulador **contra `firestore.rules`**;
 *   2. el usuario demuestra que el texto **publicado en la consola** es byte a
 *      byte ese fichero;
 *   3. luego lo publicado se comporta como lo probado.
 *
 * El eslabón 2 es el que se rompe en silencio: si alguien publicó una versión
 * anterior, el texto difiere y todo lo demás es una suposición. Estas pruebas
 * fijan que la comparación detecta esa diferencia, que **no** da falsos negativos
 * por formato (saltos de línea de Windows, espacios al final, línea final) y que
 * cuando difiere dice **dónde**.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  compararConRepo,
  contarLineas,
  huellaReglas,
  normalizarReglas,
  primeraDiferencia,
} from '../scripts/verificar-reglas-publicadas.mjs';

const REGLAS = readFileSync('firestore.rules', 'utf8');

describe('reglas publicadas · la comparación no miente en ninguna dirección', () => {
  it('un texto idéntico da igual', () => {
    expect(compararConRepo(REGLAS, REGLAS).igual).toBe(true);
  });

  it('no da falso negativo por formato: CRLF, espacios al final y línea final', () => {
    const reformateado = REGLAS.replace(/\n/g, '\r\n')
      .split('\r\n')
      .map((l) => `${l}   `)
      .join('\r\n') + '\r\n\r\n';
    expect(compararConRepo(reformateado, REGLAS).igual).toBe(true);
  });

  it('detecta un cambio de una sola palabra (el caso real: endurecer o relajar una regla)', () => {
    const relajada = REGLAS.replace('allow create, update, delete: if false;', 'allow create: if true;');
    expect(relajada).not.toBe(REGLAS);
    const r = compararConRepo(relajada, REGLAS);
    expect(r.igual).toBe(false);
    expect(r.linea).toBeGreaterThan(0);
    expect(r.motivo).toMatch(/primera diferencia está en la línea/);
  });

  it('detecta una versión anterior: menos líneas, mismo prefijo', () => {
    const anterior = REGLAS.split('\n').slice(0, 4000).join('\n');
    const r = compararConRepo(anterior, REGLAS);
    expect(r.igual).toBe(false);
    expect(r.lineasConsola).toBe(4000);
    expect(r.lineasRepo).toBe(contarLineas(REGLAS));
    expect(r.motivo).toContain(`4000 líneas y el del repositorio ${contarLineas(REGLAS)}`);
  });

  it('detecta un texto vacío o basura (pegado fallido)', () => {
    expect(compararConRepo('', REGLAS).igual).toBe(false);
    expect(compararConRepo('hola', REGLAS).igual).toBe(false);
  });

  it('dice la línea exacta de la primera diferencia', () => {
    const lineas = REGLAS.split('\n');
    const lineaObjetivo = lineas.findIndex((l) => l.includes('allow create, update, delete: if false;'));
    lineas[lineaObjetivo] = 'allow create, update, delete: if true;';
    expect(primeraDiferencia(lineas.join('\n'), REGLAS)).toBe(lineaObjetivo + 1);
  });

  it('la huella del fichero del repositorio es la que se cita en la documentación', () => {
    const doc = readFileSync('docs/PUBLICACION-REGLAS-INDICES-PRODUCCION.md', 'utf8');
    expect(doc).toContain(huellaReglas(REGLAS).slice(0, 8));
    expect(doc.replace(/\s/g, '')).toContain(String(contarLineas(REGLAS)));
  });

  it('normalizar es idempotente (no altera el texto dos veces)', () => {
    const una = normalizarReglas(REGLAS);
    expect(normalizarReglas(una)).toBe(una);
  });
});
