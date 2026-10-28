/** P0.4.2 — El catálogo de permisos se etiqueta como INFORMATIVO. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const leer = (r: string) => readFileSync(resolve(__dirname, '../' + r), 'utf8');
const MODAL = leer('src/components/modals/CrearUsuarioModal.tsx');
const ADMIN = leer('src/components/sections/AdministracionSection.tsx');
const REGLAS = leer('firestore.rules');

describe('permisos granulares · honestidad', () => {
  it('el alta de usuario ya NO habla de «Permisos Granulares Activos»', () => {
    expect(MODAL).not.toContain('Permisos Granulares Activos (');
    expect(MODAL).toContain('data-testid="aviso-permisos-declarativos"');
    expect(MODAL).toContain('informativo');
    expect(MODAL).toContain('la autorización real la define el perfil');
  });

  it('el catálogo de administración se declara INFORMATIVO y sin efecto', () => {
    expect(ADMIN).toContain('Catálogo INFORMATIVO de permisos');
    expect(ADMIN).toContain('data-testid="aviso-permisos-informativos"');
    expect(ADMIN).toContain('no se aplica hoy en las reglas de acceso');
  });

  it('las reglas NO consultan la lista de permisos (confirma que el aviso es cierto)', () => {
    expect(REGLAS).not.toContain('permisos hasAny');
    expect(REGLAS).not.toContain('selectedPermisos');
    expect(REGLAS).toContain('function isStaff()');
  });
});
