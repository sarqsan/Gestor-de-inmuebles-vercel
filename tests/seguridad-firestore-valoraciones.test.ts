/**
 * §10.9 — Reglas de `valoraciones_profesionales` (restauradas y endurecidas).
 *
 * Evalúa el TEXTO REAL de `firestore.rules` con el intérprete semántico
 * `tests/helpers/evaluadorReglasFirestore.ts` (mismo helper que D-1), sin
 * emulador ni red.
 *
 * Modelo probado:
 *  · master → todo.
 *  · PROPIETARIO → get/list solo con propietarioId == myPropId(); create solo si
 *    el trabajo valorado existe, es suyo y el inmuebleId coincide con el del
 *    trabajo; update/delete denegados.
 *  · PROFESIONAL, INQUILINO, anónimo y autenticado sin ficha → denegado en todo.
 *  · `usuarioId` nunca interviene en la autorización.
 *
 * Además comprueba la DISCRIMINACIÓN frente a la regla anterior (33fcf38: sin
 * bloque → deny-by-default) y la compatibilidad estructural de la consulta del
 * cliente (`subscribeValoracionesProfesionales` → `subscribeColeccionPropietario`).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decidir, parsearReglas, type ContextoPeticion } from './helpers/evaluadorReglasFirestore';

const RAIZ = resolve(__dirname, '..');
const FS_SRC = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const REGLAS = parsearReglas(FS_SRC);

// ---------------------------------------------------------------------------
// Estado sintético de Firestore
// ---------------------------------------------------------------------------
const TRAB_A = { id: 'trab_A', propietarioId: 'prop_A', inmuebleId: 'inm_A', profesionalId: 'prof_1', estado: 'FINALIZADO' };
const TRAB_B = { id: 'trab_B', propietarioId: 'prop_B', inmuebleId: 'inm_B', profesionalId: 'prof_2', estado: 'FINALIZADO' };

const VAL_A = { id: 'val_A', trabajoId: 'trab_A', profesionalId: 'prof_1', inmuebleId: 'inm_A', propietarioId: 'prop_A', puntuacion: 5, calidad: 5, puntualidad: 5, precio: 4, comunicacion: 5, resultado: 'SATISFACTORIO', fecha: '2026-09-01T00:00:00.000Z' };
const VAL_B = { id: 'val_B', trabajoId: 'trab_B', profesionalId: 'prof_2', inmuebleId: 'inm_B', propietarioId: 'prop_B', puntuacion: 3, calidad: 3, puntualidad: 3, precio: 3, comunicacion: 3, resultado: 'ACEPTABLE', fecha: '2026-09-02T00:00:00.000Z' };
/** Documento histórico (anterior a §10.9): sin `propietarioId`. */
const VAL_HIST = { id: 'val_hist', trabajoId: 'trab_A', profesionalId: 'prof_1', inmuebleId: 'inm_A', puntuacion: 4, calidad: 4, puntualidad: 4, precio: 4, comunicacion: 4, resultado: 'SATISFACTORIO', fecha: '2026-08-01T00:00:00.000Z' };

const FIRESTORE: ContextoPeticion['firestore'] = {
  'usuarios/uid_prop_A': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_A', authUid: 'uid_prop_A' },
  'usuarios/uid_prop_B': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_B', authUid: 'uid_prop_B' },
  'usuarios/uid_prof': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', profesionalId: 'prof_1', authUid: 'uid_prof' },
  'usuarios/uid_inq': { tipoPerfil: 'INQUILINO', estado: 'ACTIVO', contratoIds: ['ct_A'], authUid: 'uid_inq' },
  'usuarios_auth/uid_prop_A': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_A', profesionalId: '', inmuebleIds: ['inm_A'] },
  'usuarios_auth/uid_prop_B': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_B', profesionalId: '', inmuebleIds: ['inm_B'] },
  'usuarios_auth/uid_prof': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [] },
  'trabajos_profesionales/trab_A': TRAB_A,
  'trabajos_profesionales/trab_B': TRAB_B,
  'valoraciones_profesionales/val_A': VAL_A,
  'valoraciones_profesionales/val_B': VAL_B,
  'valoraciones_profesionales/val_hist': VAL_HIST,
};

const AUTH = {
  master: { uid: 'uid_master', token: { email: 'sarqsan2@gmail.com' } },
  propA: { uid: 'uid_prop_A', token: { email: 'prop-a@test.local' } },
  propB: { uid: 'uid_prop_B', token: { email: 'prop-b@test.local' } },
  prof: { uid: 'uid_prof', token: { email: 'prof@test.local' } },
  /** INQUILINO: ficha en `usuarios/`, sin espejo `usuarios_auth/` (modelo E.0). */
  inq: { uid: 'uid_inq', token: { email: 'inq@test.local' } },
  /** Autenticado en Firebase pero sin ficha ni espejo. */
  desconocido: { uid: 'uid_sin_ficha', token: { email: 'nadie@test.local' } },
  anon: null,
};
type Auth = ContextoPeticion['auth'];

/** Payload que genera `ValoracionProfesionalModal` para el trabajo A (propietario A). */
const NUEVA_OK = { id: 'val_nueva', trabajoId: 'trab_A', profesionalId: 'prof_1', inmuebleId: 'inm_A', propietarioId: 'prop_A', usuarioId: 'user_prop_A', evaluador: 'Prop A', puntuacion: 5, calidad: 5, puntualidad: 5, precio: 5, comunicacion: 5, resultado: 'SATISFACTORIO', fecha: '2026-09-22T00:00:00.000Z', createdAt: '2026-09-22T00:00:00.000Z' };

function leer(reglas = REGLAS, metodo: 'get' | 'list', valId: string, auth: Auth) {
  return decidir(reglas, `valoraciones_profesionales/${valId}`, metodo, { auth, firestore: FIRESTORE, existente: FIRESTORE[`valoraciones_profesionales/${valId}`] }).permitido;
}
function crear(reglas = REGLAS, payload: Record<string, unknown>, auth: Auth) {
  return decidir(reglas, `valoraciones_profesionales/${String(payload.id ?? 'val_nueva')}`, 'create', { auth, firestore: FIRESTORE, existente: null, entrante: payload }).permitido;
}
function actualizar(reglas = REGLAS, valId: string, auth: Auth) {
  const existente = FIRESTORE[`valoraciones_profesionales/${valId}`];
  return decidir(reglas, `valoraciones_profesionales/${valId}`, 'update', { auth, firestore: FIRESTORE, existente, entrante: { ...existente, puntuacion: 1, comentario: 'editado' } }).permitido;
}
function borrar(reglas = REGLAS, valId: string, auth: Auth) {
  return decidir(reglas, `valoraciones_profesionales/${valId}`, 'delete', { auth, firestore: FIRESTORE, existente: FIRESTORE[`valoraciones_profesionales/${valId}`] }).permitido;
}
const get = (v: string, a: Auth, r = REGLAS) => leer(r, 'get', v, a);
const list = (v: string, a: Auth, r = REGLAS) => leer(r, 'list', v, a);

// ---------------------------------------------------------------------------
describe('§10.9 valoraciones_profesionales — MASTER', () => {
  it('get / list / create / update / delete: PERMITIDO', () => {
    expect(get('val_A', AUTH.master)).toBe(true);
    expect(get('val_hist', AUTH.master)).toBe(true);
    expect(list('val_B', AUTH.master)).toBe(true);
    expect(list('val_hist', AUTH.master)).toBe(true);
    expect(crear(REGLAS, NUEVA_OK, AUTH.master)).toBe(true);
    expect(actualizar(REGLAS, 'val_A', AUTH.master)).toBe(true);
    expect(borrar(REGLAS, 'val_A', AUTH.master)).toBe(true);
  });
});

describe('§10.9 valoraciones_profesionales — PROPIETARIO A', () => {
  it('get de valoración propia (propietarioId == prop_A): PERMITIDO', () => {
    expect(get('val_A', AUTH.propA)).toBe(true);
  });
  it('get de valoración del propietario B: DENEGADO', () => {
    expect(get('val_B', AUTH.propA)).toBe(false);
  });
  it('list de documento propio (modelo de la consulta where propietarioId == prop_A): PERMITIDO', () => {
    expect(list('val_A', AUTH.propA)).toBe(true);
  });
  it('list de documento de B (modelo de consulta global): DENEGADO', () => {
    expect(list('val_B', AUTH.propA)).toBe(false);
  });
  it('valoración histórica sin propietarioId (aunque el trabajo sea suyo): get y list DENEGADOS', () => {
    expect(get('val_hist', AUTH.propA)).toBe(false);
    expect(list('val_hist', AUTH.propA)).toBe(false);
  });
  it('create: trabajo propio + propietarioId propio + inmueble del trabajo: PERMITIDO', () => {
    expect(crear(REGLAS, NUEVA_OK, AUTH.propA)).toBe(true);
  });
  it('create: el payload sin usuarioId también es válido (usuarioId es trazabilidad, no autorización)', () => {
    const { usuarioId: _omitido, ...sinUsuario } = NUEVA_OK;
    expect(crear(REGLAS, sinUsuario, AUTH.propA)).toBe(true);
  });
  it('create: un usuarioId arbitrario no concede nada por sí mismo (sigue exigiendo pertenencia)', () => {
    expect(crear(REGLAS, { ...NUEVA_OK, usuarioId: 'uid_prop_A', trabajoId: 'trab_B' }, AUTH.propA)).toBe(false);
  });
  it('create: trabajo del propietario B (aunque declare propietarioId propio): DENEGADO', () => {
    expect(crear(REGLAS, { ...NUEVA_OK, trabajoId: 'trab_B' }, AUTH.propA)).toBe(false);
  });
  it('create: declarar propietarioId de B: DENEGADO', () => {
    expect(crear(REGLAS, { ...NUEVA_OK, propietarioId: 'prop_B' }, AUTH.propA)).toBe(false);
    expect(crear(REGLAS, { ...NUEVA_OK, propietarioId: 'prop_B', trabajoId: 'trab_B' }, AUTH.propA)).toBe(false);
  });
  it('create: trabajo inexistente: DENEGADO', () => {
    expect(crear(REGLAS, { ...NUEVA_OK, trabajoId: 'trab_inexistente' }, AUTH.propA)).toBe(false);
  });
  it('create: sin trabajoId o con trabajoId no string: DENEGADO', () => {
    const { trabajoId: _t, ...sinTrabajo } = NUEVA_OK;
    expect(crear(REGLAS, sinTrabajo, AUTH.propA)).toBe(false);
    expect(crear(REGLAS, { ...NUEVA_OK, trabajoId: 42 }, AUTH.propA)).toBe(false);
  });
  it('create: inmuebleId falseado (distinto al del trabajo): DENEGADO', () => {
    expect(crear(REGLAS, { ...NUEVA_OK, inmuebleId: 'inm_B' }, AUTH.propA)).toBe(false);
    expect(crear(REGLAS, { ...NUEVA_OK, inmuebleId: 'inm_otro' }, AUTH.propA)).toBe(false);
  });
  it('create: sin propietarioId (payload anterior a §10.9): DENEGADO', () => {
    const { propietarioId: _p, ...sinProp } = NUEVA_OK;
    expect(crear(REGLAS, sinProp, AUTH.propA)).toBe(false);
  });
  it('create: sin profesionalId o sin inmuebleId: DENEGADO', () => {
    const { profesionalId: _pf, ...sinProf } = NUEVA_OK;
    const { inmuebleId: _in, ...sinInm } = NUEVA_OK;
    expect(crear(REGLAS, sinProf, AUTH.propA)).toBe(false);
    expect(crear(REGLAS, sinInm, AUTH.propA)).toBe(false);
  });
  it('update de valoración propia: DENEGADO (inmutable salvo master)', () => {
    expect(actualizar(REGLAS, 'val_A', AUTH.propA)).toBe(false);
  });
  it('delete de valoración propia: DENEGADO', () => {
    expect(borrar(REGLAS, 'val_A', AUTH.propA)).toBe(false);
  });
});

describe('§10.9 valoraciones_profesionales — aislamiento PROPIETARIO B (simetría)', () => {
  it('B accede a lo suyo y no a lo de A', () => {
    expect(get('val_B', AUTH.propB)).toBe(true);
    expect(list('val_B', AUTH.propB)).toBe(true);
    expect(get('val_A', AUTH.propB)).toBe(false);
    expect(list('val_A', AUTH.propB)).toBe(false);
    expect(crear(REGLAS, NUEVA_OK, AUTH.propB)).toBe(false);
    expect(crear(REGLAS, { ...NUEVA_OK, propietarioId: 'prop_B' }, AUTH.propB)).toBe(false);
    expect(crear(REGLAS, { ...NUEVA_OK, propietarioId: 'prop_B', trabajoId: 'trab_B', inmuebleId: 'inm_B', profesionalId: 'prof_2' }, AUTH.propB)).toBe(true);
  });
});

describe('§10.9 valoraciones_profesionales — PROFESIONAL (sin consumidor montado → DENEGADO)', () => {
  it('get / list / create / update / delete, incluso sobre valoraciones de sus trabajos: DENEGADO', () => {
    expect(get('val_A', AUTH.prof)).toBe(false);
    expect(list('val_A', AUTH.prof)).toBe(false);
    expect(crear(REGLAS, NUEVA_OK, AUTH.prof)).toBe(false);
    expect(crear(REGLAS, { ...NUEVA_OK, profesionalId: 'prof_1' }, AUTH.prof)).toBe(false);
    expect(actualizar(REGLAS, 'val_A', AUTH.prof)).toBe(false);
    expect(borrar(REGLAS, 'val_A', AUTH.prof)).toBe(false);
  });
});

describe('§10.9 valoraciones_profesionales — INQUILINO', () => {
  it('get / list / create / update / delete: DENEGADO', () => {
    expect(get('val_A', AUTH.inq)).toBe(false);
    expect(list('val_A', AUTH.inq)).toBe(false);
    expect(crear(REGLAS, NUEVA_OK, AUTH.inq)).toBe(false);
    expect(actualizar(REGLAS, 'val_A', AUTH.inq)).toBe(false);
    expect(borrar(REGLAS, 'val_A', AUTH.inq)).toBe(false);
  });
});

describe('§10.9 valoraciones_profesionales — ANÓNIMO', () => {
  it('get / list / create: DENEGADO', () => {
    expect(get('val_A', AUTH.anon)).toBe(false);
    expect(list('val_A', AUTH.anon)).toBe(false);
    expect(crear(REGLAS, NUEVA_OK, AUTH.anon)).toBe(false);
    expect(actualizar(REGLAS, 'val_A', AUTH.anon)).toBe(false);
    expect(borrar(REGLAS, 'val_A', AUTH.anon)).toBe(false);
  });
});

describe('§10.9 valoraciones_profesionales — autenticado sin ficha/rol válido', () => {
  it('get / list / create: DENEGADO', () => {
    expect(get('val_A', AUTH.desconocido)).toBe(false);
    expect(list('val_A', AUTH.desconocido)).toBe(false);
    expect(crear(REGLAS, NUEVA_OK, AUTH.desconocido)).toBe(false);
  });
  it('PROPIETARIO con espejo pero estado no ACTIVO: DENEGADO', () => {
    const fs2 = { ...FIRESTORE, 'usuarios_auth/uid_prop_A': { ...FIRESTORE['usuarios_auth/uid_prop_A'], estado: 'INACTIVO' } };
    const ok = decidir(REGLAS, 'valoraciones_profesionales/val_A', 'get', { auth: AUTH.propA, firestore: fs2, existente: VAL_A }).permitido;
    expect(ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('§10.9 — la concesión procede del bloque nuevo y el catch-all sigue último', () => {
  it('la decisión positiva del propietario la concede el match de valoraciones_profesionales', () => {
    const d = decidir(REGLAS, 'valoraciones_profesionales/val_A', 'get', { auth: AUTH.propA, firestore: FIRESTORE, existente: VAL_A });
    expect(d.permitido).toBe(true);
    expect(d.concedidoPor.every((p) => p.includes('valoraciones_profesionales'))).toBe(true);
  });
  it('estructura: bloque presente, `allow list` sin get()/exists(), catch-all deny al final', () => {
    const ini = FS_SRC.indexOf('match /valoraciones_profesionales/{valoracionId}');
    expect(ini).toBeGreaterThan(0);
    const bloque = FS_SRC.slice(ini, FS_SRC.indexOf('\n    }\n', ini));
    const lineaList = bloque.split('\n').find((l) => l.includes('allow list'));
    expect(lineaList).toBeDefined();
    expect(lineaList).not.toMatch(/get\(|exists\(/);
    expect(lineaList).toContain('aisladoEsMio(resource.data)');
    expect(bloque).not.toMatch(/allow[^\n]*if isSignedIn\(\);/);
    expect(bloque).not.toMatch(/usuarioId/);
    const catchAll = FS_SRC.indexOf('match /{document=**}');
    expect(ini).toBeLessThan(catchAll);
    expect(FS_SRC.indexOf('match /', catchAll + 10)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
describe('§10.9 — DISCRIMINACIÓN frente a la regla anterior (33fcf38: colección sin match → deny)', () => {
  let ANTERIOR: ReturnType<typeof parsearReglas> | null = null;
  try {
    ANTERIOR = parsearReglas(execFileSync('git', ['show', '33fcf38:firestore.rules'], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    ANTERIOR = null; // sin historial git disponible (p. ej. tarball): se omite
  }
  const itGit = ANTERIOR ? it : it.skip;

  itGit('antes: ningún rol, ni el master, podía leer/crear/actualizar/borrar', () => {
    const r = ANTERIOR!;
    expect(FS_SRC).toContain('match /valoraciones_profesionales/');
    for (const a of [AUTH.master, AUTH.propA, AUTH.propB, AUTH.prof, AUTH.inq, AUTH.anon, AUTH.desconocido]) {
      expect(get('val_A', a, r)).toBe(false);
      expect(list('val_A', a, r)).toBe(false);
      expect(crear(r, NUEVA_OK, a)).toBe(false);
      expect(actualizar(r, 'val_A', a)).toBe(false);
      expect(borrar(r, 'val_A', a)).toBe(false);
    }
  });
  itGit('después: los positivos previstos pasan y los negativos siguen denegados', () => {
    const positivos: Array<[string, boolean]> = [
      ['master get', get('val_A', AUTH.master)],
      ['master list', list('val_A', AUTH.master)],
      ['master create', crear(REGLAS, NUEVA_OK, AUTH.master)],
      ['master update', actualizar(REGLAS, 'val_A', AUTH.master)],
      ['master delete', borrar(REGLAS, 'val_A', AUTH.master)],
      ['propA get propia', get('val_A', AUTH.propA)],
      ['propA list propia', list('val_A', AUTH.propA)],
      ['propA create propia', crear(REGLAS, NUEVA_OK, AUTH.propA)],
    ];
    expect(positivos.filter(([, ok]) => !ok)).toEqual([]);
    const negativos: Array<[string, boolean]> = [
      ['propA get B', get('val_B', AUTH.propA)],
      ['propA list B', list('val_B', AUTH.propA)],
      ['propA create trabajo B', crear(REGLAS, { ...NUEVA_OK, trabajoId: 'trab_B' }, AUTH.propA)],
      ['propA update', actualizar(REGLAS, 'val_A', AUTH.propA)],
      ['propA delete', borrar(REGLAS, 'val_A', AUTH.propA)],
      ['prof get', get('val_A', AUTH.prof)],
      ['inq get', get('val_A', AUTH.inq)],
      ['anon get', get('val_A', AUTH.anon)],
      ['desconocido get', get('val_A', AUTH.desconocido)],
    ];
    expect(negativos.filter(([, ok]) => ok)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('§10.9 — consulta del cliente compatible con `allow list`', () => {
  const FB_SRC = readFileSync(resolve(RAIZ, 'src/lib/firebase.ts'), 'utf8');
  const ini = FB_SRC.indexOf('export function subscribeValoracionesProfesionales(');
  const fin = FB_SRC.indexOf('\nexport ', ini + 10);
  const fn = FB_SRC.slice(ini, fin);

  it('subscribeValoracionesProfesionales delega en subscribeColeccionPropietario y acepta scope', () => {
    expect(ini).toBeGreaterThan(0);
    expect(fn).toContain('scope?: DataAccessScope');
    expect(fn).toContain('subscribeColeccionPropietario<');
    expect(fn).not.toMatch(/onSnapshot\(\s*VALORACIONES_PROFESIONALES_COL/);
    expect(fn).not.toContain('orderBy(');
  });
  it('subscribeColeccionPropietario aplica where(propietarioId == pid) al PROPIETARIO y vacía al PROFESIONAL', () => {
    const i2 = FB_SRC.indexOf('function subscribeColeccionPropietario<');
    const cuerpo = FB_SRC.slice(i2, FB_SRC.indexOf('\n}\n', i2));
    expect(cuerpo).toContain("scope?.tipoPerfil === 'PROFESIONAL'");
    expect(cuerpo).toContain("where('propietarioId', '==', pid)");
  });
  it('OperacionesSection pasa tipoPerfil y propietarioId del usuario actual', () => {
    const OP = readFileSync(resolve(RAIZ, 'src/components/sections/OperacionesSection.tsx'), 'utf8');
    const i3 = OP.indexOf('subscribeValoracionesProfesionales(setValoraciones, {');
    expect(i3).toBeGreaterThan(0);
    const llamada = OP.slice(i3, OP.indexOf('});', i3));
    expect(llamada).toContain('tipoPerfil: currentUser?.tipoPerfil');
    expect(llamada).toContain('propietarioId: currentUser?.propietarioId');
  });
  it('el modal escribe propietarioId desde el trabajo (nunca del usuario) y usuarioId solo como trazabilidad', () => {
    const MODAL = readFileSync(resolve(RAIZ, 'src/components/modals/ValoracionProfesionalModal.tsx'), 'utf8');
    expect(MODAL).toContain('propietarioId: trabajo.propietarioId,');
    expect(MODAL).toContain('usuarioId: currentUser?.id,');
    expect(MODAL).not.toMatch(/propietarioId:\s*currentUser/);
  });
});
