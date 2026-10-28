/**
 * P0.1.4 — El correo del administrador principal tiene UNA sola fuente y no
 * diverge de `isMasterAdmin()` en `firestore.rules` (la autoridad real).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ADMIN_MASTER_EMAIL,
  MASTER_ADMIN_EMAIL_POR_DEFECTO,
  esEmailMaster,
  normalizarEmail,
  resolverEmailMaster,
} from '../src/lib/masterAdmin';

const RAIZ = resolve(__dirname, '..');
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');

function fuentesDeProducto(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(join(RAIZ, dir))) {
    const ruta = join(dir, nombre);
    if (statSync(join(RAIZ, ruta)).isDirectory()) fuentesDeProducto(ruta, acumulado);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(nombre) && !/\.(test|spec)\./.test(nombre)) acumulado.push(ruta);
  }
  return acumulado;
}

afterEach(() => vi.unstubAllEnvs());

describe('masterAdmin · comportamiento', () => {
  it('normaliza correos y compara sin distinguir mayúsculas ni espacios', () => {
    expect(normalizarEmail('  A@B.COM ')).toBe('a@b.com');
    expect(normalizarEmail(undefined)).toBe('');
    expect(normalizarEmail(42)).toBe('');
    expect(esEmailMaster(`  ${MASTER_ADMIN_EMAIL_POR_DEFECTO.toUpperCase()}  `)).toBe(true);
    expect(esEmailMaster('otro@correo.com')).toBe(false);
    expect(esEmailMaster('')).toBe(false);
    expect(esEmailMaster(undefined)).toBe(false);
  });

  it('el servidor puede sobrescribir el maestro; el cliente mantiene el valor por defecto', () => {
    expect(resolverEmailMaster({})).toBe(MASTER_ADMIN_EMAIL_POR_DEFECTO);
    expect(resolverEmailMaster({ MASTER_ADMIN_EMAIL: '  Otro@Correo.COM ' })).toBe('otro@correo.com');
    expect(resolverEmailMaster({ MASTER_ADMIN_EMAIL: '   ' })).toBe(MASTER_ADMIN_EMAIL_POR_DEFECTO);
    expect(ADMIN_MASTER_EMAIL).toBe(MASTER_ADMIN_EMAIL_POR_DEFECTO);
  });

  it('authService reexporta la misma constante (compatibilidad de importadores)', async () => {
    const auth = await import('../src/lib/authService');
    expect(auth.ADMIN_MASTER_EMAIL).toBe(MASTER_ADMIN_EMAIL_POR_DEFECTO);
  });

  it('el backend resuelve el maestro desde la fuente única y respeta el override', async () => {
    vi.stubEnv('MASTER_ADMIN_EMAIL', 'maestro@staging.invalid');
    vi.resetModules();
    const backend = await import('../server/titularidades/backendTitulares');
    expect(backend.EMAIL_MASTER).toBe('maestro@staging.invalid');
    vi.resetModules();
  });
});

describe('masterAdmin · paridad con las reglas y cero literales dispersos', () => {
  it('isMasterAdmin() de firestore.rules usa exactamente el valor por defecto', () => {
    const reglas = leer('firestore.rules');
    const bloque = /function\s+isMasterAdmin\s*\(\s*\)\s*\{([\s\S]*?)\}/.exec(reglas);
    expect(bloque, 'isMasterAdmin() no encontrado').not.toBeNull();
    const literal = /authEmail\(\)\s*==\s*'([^']+)'/.exec(bloque![1]);
    expect(literal, 'literal del maestro no encontrado').not.toBeNull();
    expect(literal![1].toLowerCase()).toBe(MASTER_ADMIN_EMAIL_POR_DEFECTO.toLowerCase());
  });

  it('solo masterAdmin.ts contiene el literal en código de producto (reglas intactas)', () => {
    const maestro = MASTER_ADMIN_EMAIL_POR_DEFECTO.toLowerCase();
    const conLiteral = [...fuentesDeProducto('src'), ...fuentesDeProducto('server')]
      .filter((ruta) => leer(ruta).toLowerCase().includes(maestro));
    expect(conLiteral).toEqual([join('src', 'lib', 'masterAdmin.ts')]);
  });

  it('los módulos que antes tenían el literal importan ahora la fuente única', () => {
    const esperados: Array<[string, string]> = [
      ['src/App.tsx', "from './lib/masterAdmin'"],
      ['src/lib/authService.ts', "from './masterAdmin'"],
      ['src/lib/firebase.ts', "from './masterAdmin'"],
      ['src/lib/personasServicioFirebase.ts', "from './masterAdmin'"],
      ['src/lib/accesoPropietariosFirebase.ts', "from './masterAdmin'"],
      ['src/lib/onboardingCarterasFirebase.ts', "from './masterAdmin'"],
      ['src/lib/gestionesCarteraServicioFirebase.ts', "from './masterAdmin'"],
      ['src/features/operaciones/persistence/authorization.ts', "from '../../../lib/masterAdmin.ts'"],
      ['server/titularidades/backendTitulares.ts', "from '../../src/lib/masterAdmin.js'"],
    ];
    for (const [ruta, fragmento] of esperados) {
      expect(leer(ruta), ruta).toContain(fragmento);
    }
  });
});
