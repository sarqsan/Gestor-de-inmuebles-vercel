/**
 * P0.1.5 — La siembra de datos de demostración está DESACTIVADA por defecto
 * y ninguna LECTURA escribe datos demo como efecto colateral.
 *
 * Además de la comprobación de comportamiento de la bandera, se verifica
 * sobre el código real que la guardia de `semillasHabilitadas()` aparece
 * ANTES de cualquier escritura en las dos rutinas de siembra. Es una
 * regresión real: si alguien mueve la guardia o la elimina, el test falla.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAIZ = resolve(__dirname, '..');
const firebase = readFileSync(join(RAIZ, 'src/lib/firebase.ts'), 'utf8');
const app = readFileSync(join(RAIZ, 'src/App.tsx'), 'utf8');

function cuerpoDe(nombre: string): string {
  const inicio = firebase.indexOf(`export async function ${nombre}(`);
  expect(inicio, `no se encuentra ${nombre}`).toBeGreaterThan(-1);
  const fin = firebase.indexOf('\n}\n', inicio);
  expect(fin, `no se encuentra el cierre de ${nombre}`).toBeGreaterThan(inicio);
  return firebase.slice(inicio, fin + 3);
}

afterEach(() => vi.unstubAllEnvs());

describe('bandera de semillas', () => {
  it('por defecto está desactivada; solo un valor explícito la activa', async () => {
    vi.stubEnv('VITE_SEEDS_ENABLED', '');
    const { semillasHabilitadas } = await import('../src/lib/flags');
    expect(semillasHabilitadas()).toBe(false);
    vi.stubEnv('VITE_SEEDS_ENABLED', '1');
    expect(semillasHabilitadas()).toBe(true);
  });
});

describe('guardias reales de escritura', () => {
  it('seedInitialDataIfEmpty(): la guardia precede a TODA escritura', () => {
    const cuerpo = cuerpoDe('seedInitialDataIfEmpty');
    const guardia = cuerpo.indexOf('if (!semillasHabilitadas())');
    expect(guardia).toBeGreaterThan(-1);
    for (const escritura of ['setDoc(', 'writeBatch(', 'seedAuthAndRolesIfEmpty(', 'aBatch.commit(']) {
      const pos = cuerpo.indexOf(escritura);
      if (pos !== -1) expect(pos, `${escritura} ejecuta antes de la guardia`).toBeGreaterThan(guardia);
    }
    expect(cuerpo).toContain('VITE_SEEDS_ENABLED');
  });

  it('seedAuthAndRolesIfEmpty(): defensa en profundidad con la misma guardia', () => {
    const cuerpo = cuerpoDe('seedAuthAndRolesIfEmpty');
    const guardia = cuerpo.indexOf('if (!semillasHabilitadas())');
    expect(guardia).toBeGreaterThan(-1);
    expect(guardia).toBeLessThan(cuerpo.indexOf('saveUsuarioFirestore('));
    expect(guardia).toBeLessThan(cuerpo.indexOf('writeBatch('));
  });

  it('el login de administrador sigue llamando a la rutina protegida (no se elimina el control)', () => {
    expect(app).toContain('seedInitialDataIfEmpty()');
    expect(app).toContain("currentUser.tipoPerfil === 'ADMINISTRADOR'");
  });

  it('subscribeAseguradoras NO mezcla ni escribe SEAG sin semillas explícitas', () => {
    expect(firebase).toContain('if (!hasSeag && semillasHabilitadas())');
    const inicio = firebase.indexOf('export function subscribeAseguradoras');
    const fin = firebase.indexOf('\n}\n', inicio);
    const cuerpo = firebase.slice(inicio, fin + 3);
    const guardia = cuerpo.indexOf('semillasHabilitadas()');
    const escritura = cuerpo.indexOf('saveAseguradoraFirestore(seagDefault)');
    expect(guardia).toBeGreaterThan(-1);
    expect(escritura).toBeGreaterThan(guardia);
    expect(cuerpo).toContain('callback(inicialAseguradoras())');
  });

  it('los fallback de demostración de firebase.ts pasan por estadoInicial', () => {
    expect(firebase).toContain("from '../data/estadoInicial'");
    expect(firebase).toContain('callback(inicialGmailConfig())');
    expect(firebase).toContain('inicialCandidatos().find(');
    expect(firebase).not.toContain('callback(INITIAL_GMAIL_CONFIG)');
  });
});
