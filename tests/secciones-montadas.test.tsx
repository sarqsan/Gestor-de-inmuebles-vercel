/** P0.4.1 — Cero imports muertos de secciones huérfanas; la bandeja sí se monta. */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '..');
const APP = readFileSync(resolve(RAIZ, 'src/App.tsx'), 'utf8');

describe('secciones huérfanas · decisión aplicada', () => {
  it('App.tsx ya NO importa las dos secciones duplicadas sin render', () => {
    expect(APP).not.toContain("import { AdministracionSection }");
    expect(APP).not.toContain("import { CuestionarioSection }");
  });

  it('SolicitudesSection SÍ está montada y conectada al modal', () => {
    expect(APP).toContain('<SolicitudesSection');
    expect(APP).toContain('onSelectSolicitud={(sol) => setSelectedSolicitudForModal(sol)}');
  });

  it('la decisión de cada superficie está documentada', () => {
    expect(existsSync(resolve(RAIZ, 'docs/SECCIONES-HUERFANAS-P0.4.md'))).toBe(true);
    const doc = readFileSync(resolve(RAIZ, 'docs/SECCIONES-HUERFANAS-P0.4.md'), 'utf8');
    for (const nombre of ['SolicitudesSection', 'AdministracionSection', 'CuestionarioSection', 'ProfesionalesSection']) {
      expect(doc, nombre).toContain(nombre);
    }
  });

  it('toda sección importada en App.tsx se usa también en el JSX', () => {
    const nombres = [...APP.matchAll(/import \{ ([A-Za-z]+Section) \} from '\.\/components\/sections\/[A-Za-z]+Section';/g)]
      .map((m) => m[1]);
    expect(nombres.length).toBeGreaterThan(10);
    for (const nombre of nombres) {
      const usos = APP.split('<' + nombre).length - 1;
      expect(usos, `${nombre} importada pero nunca renderizada`).toBeGreaterThan(0);
    }
  });
});
