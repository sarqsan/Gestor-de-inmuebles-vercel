import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// P0.2.8 — `audit_logs` solo admite un autor que coincida con el correo
// autenticado (`authEmail()`), o vacío/ausente para los registros automáticos.
// Por eso un escritor NO puede rellenar el hueco con un literal
// (`'sistema'`, `'admin@rentselect.es'`, `'sindicacion@erp'`…): la escritura se
// denegaría y la traza de auditoría se perdería en silencio, porque casi todos
// estos envíos son best-effort (`void …`). Este test fija la regla en el código.
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PATRON = /usuarioEmail:\s*[^,\n]*\|\|\s*'([^']*)'/g;

function fuentes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    if (entrada.isDirectory()) return fuentes(join(dir, entrada.name));
    const ruta = join(dir, entrada.name);
    return ['.ts', '.tsx'].includes(extname(ruta)) && !ruta.endsWith('.test.ts') ? [ruta] : [];
  });
}

describe('auditoría · autor verificable en el código', () => {
  it('ningún escritor inventa un autor cuando falta el correo', () => {
    const infractores: string[] = [];
    for (const ruta of fuentes(resolve(RAIZ, 'src'))) {
      const texto = readFileSync(ruta, 'utf8');
      for (const coincidencia of texto.matchAll(PATRON)) {
        if (coincidencia[1] !== '') infractores.push(`${ruta.replace(RAIZ + '/', '')}: '${coincidencia[1]}'`);
      }
    }
    expect(infractores).toEqual([]);
  });

  it('las reglas solo admiten el correo autenticado o un autor vacío', () => {
    const reglas = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
    const bloque = reglas.slice(reglas.indexOf('match /audit_logs/'));
    const inicio = bloque.indexOf('allow create:');
    const sentencia = bloque.slice(inicio, bloque.indexOf(';', inicio) + 1);
    expect(sentencia).toContain('incoming().usuarioEmail == authEmail()');
    expect(sentencia).toContain("incoming().usuarioEmail == ''");
    expect(sentencia).toContain("!('usuarioEmail' in incoming())");
  });
});
