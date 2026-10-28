/** P0.4.2 — Los toggles de módulos no prometen un enforcement inexistente. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const leer = (r: string) => readFileSync(resolve(__dirname, '../' + r), 'utf8');
const PANEL = leer('src/components/admin/AdminControlCenter.tsx');
const REGLAS = leer('firestore.rules');

describe('toggles de módulos · sin falsa sensación de control', () => {
  it('el panel explica que el catálogo es informativo', () => {
    expect(PANEL).toContain('data-testid="aviso-modulos-informativos"');
    expect(PANEL).toContain('Catálogo INFORMATIVO');
    expect(PANEL).not.toContain('Habilita o deshabilita funciones operativas a nivel de sistema.');
  });

  it('el botón de toggle está DESACTIVADO y explica por qué', () => {
    expect(PANEL).toContain('disabled');
    expect(PANEL).toContain('Sin efecto: catálogo informativo sin enforcement (P-03)');
    expect(PANEL).toContain('data-testid={`modulo-informativo-${key}`}');
  });

  it('las reglas no usan los flags de módulos para autorizar ninguna colección', () => {
    // `system/modulos_config` es legible antes del login, pero NINGÚN `allow`
    // consulta su contenido: solo aparece como id de documento en `system`.
    const permits = [...REGLAS.matchAll(/allow [^;]+;/g)].map((m) => m[0]);
    expect(permits.some((r) => r.includes('modulos_config') && r.includes('get('))).toBe(false);
    expect(REGLAS).not.toContain('get(/databases/$(database)/documents/system/modulos_config)');
  });
});
