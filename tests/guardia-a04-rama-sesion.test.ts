/**
 * A-04 · la guardia de repositorio (solo lectura) NO fija una rama de otra sesión.
 * La rama esperada sale de ARENA_SESSION_BRANCH o de la rama actual; con `--rama`
 * explícita y ajena, la guardia debe fallar (nunca pasar en silencio).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(__dirname, '..');
const SCRIPT = resolve(RAIZ, 'scripts/guardia-a04-repositorio.mts');

function ejecutarGuardia(args: string[], env: NodeJS.ProcessEnv = {}): { code: number; out: string } {
  const entorno = { ...process.env, ...env };
  if (!env.ARENA_SESSION_BRANCH) delete entorno.ARENA_SESSION_BRANCH;
  try {
    const out = execFileSync('npx', ['tsx', SCRIPT, ...args], { cwd: RAIZ, encoding: 'utf8', env: entorno, stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? -1, out: err.stdout ?? '' };
  }
}

describe('A-04 · rama esperada sin valores codificados de otra sesión', () => {
  it('el script no contiene la rama de la sesión anterior como valor fijo', () => {
    expect(readFileSync(SCRIPT, 'utf8')).not.toContain("'arena/01a0e939-gestor-de-inmuebles-vercel'");
  });

  it('sin --rama y sin ARENA_SESSION_BRANCH, la rama esperada es la actual (y la guardia pasa)', () => {
    const actual = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: RAIZ, encoding: 'utf8' }).trim();
    const r = ejecutarGuardia([]);
    expect(r.out).toContain(`rama esperada : ${actual}`);
    expect(r.out).toContain('A-04: OK');
    expect(r.code).toBe(0);
  });

  it('ARENA_SESSION_BRANCH define la rama esperada', () => {
    const actual = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: RAIZ, encoding: 'utf8' }).trim();
    const r = ejecutarGuardia([], { ARENA_SESSION_BRANCH: actual });
    expect(r.out).toContain(`rama esperada : ${actual}`);
    expect(r.code).toBe(0);
  });

  it('una rama explícita AJENA no pasa en silencio (BLOCKED/WARNING, código ≠ 0)', () => {
    const r = ejecutarGuardia(['--rama', 'arena/rama-de-otra-sesion-inexistente']);
    expect(r.out).toMatch(/A-04: (WARNING|BLOCKED)/);
    expect(r.code).not.toBe(0);
  });
});
