/**
 * P0.4.3 — Todo destino del MENÚ está dentro de la GUARDA de la App.
 * Además se documenta (y se fija) la única asimetría deliberada: `inversion`
 * es una capacidad permitida al PROFESIONAL que el menú decide no ofrecer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { seccionesDePerfil } from '../src/navegacion/navegacion';

const APP = readFileSync(resolve(__dirname, '../src/App.tsx'), 'utf8');

function guarda(nombre: string): string[] {
  const inicio = APP.indexOf(`const ${nombre}: SectionType[] = [`);
  expect(inicio, `falta ${nombre}`).toBeGreaterThan(-1);
  const fin = APP.indexOf('];', inicio);
  return [...APP.slice(inicio, fin).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe('paridad menú ⊆ guarda', () => {
  const propietario = guarda('SECCIONES_PROPIETARIO');
  const profesional = guarda('SECCIONES_PROFESIONAL');

  it('los recuentos del catálogo son 30 / 24 / 5 (7 con gestor)', () => {
    expect(seccionesDePerfil('ADMINISTRADOR')).toHaveLength(30);
    expect(seccionesDePerfil('PROPIETARIO')).toHaveLength(24);
    expect(seccionesDePerfil('PROFESIONAL')).toHaveLength(5);
    expect(seccionesDePerfil('PROFESIONAL', { gestorPatrimonial: true })).toHaveLength(7);
  });

  it('PROPIETARIO: ningún destino del menú queda fuera de la guarda', () => {
    const menu = seccionesDePerfil('PROPIETARIO');
    expect(menu.filter((s) => !propietario.includes(s))).toEqual([]);
  });

  it('PROFESIONAL: ningún destino del menú queda fuera de la guarda (ambos modos)', () => {
    const base = seccionesDePerfil('PROFESIONAL');
    const gestor = seccionesDePerfil('PROFESIONAL', { gestorPatrimonial: true });
    expect(base.filter((s) => !profesional.includes(s))).toEqual([]);
    const guardaGestor = [...profesional, 'formalizacion', 'cobros'];
    expect(gestor.filter((s) => !guardaGestor.includes(s))).toEqual([]);
  });

  it('la única capacidad extra del PROFESIONAL es `inversion` (fail-closed documentado)', () => {
    const delMenu: readonly string[] = seccionesDePerfil('PROFESIONAL');
    const extras = profesional.filter((s: string) => !delMenu.includes(s));
    expect(extras).toEqual(['inversion']);
    expect(APP).toContain("[...SECCIONES_PROFESIONAL, 'formalizacion', 'cobros']");
  });
});
