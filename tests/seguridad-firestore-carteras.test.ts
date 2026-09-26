/**
 * D2b + D3 (parcial) — Seguridad de carteras gestionadas.
 * ---------------------------------------------------------------------------
 * METODOLOGÍA: igual que `seguridad-firestore-inmuebles.test.ts`: se evalúa
 * el TEXTO REAL de `firestore.rules` con el harness compartido
 * `tests/harness/firestoreRulesEval.ts` (fail-loud; sin emulador de Google en
 * este entorno — validación en emulador PENDIENTE, NV).
 *
 * Contrato probado:
 *  · El gestor sólo accede a los inmuebles de las carteras que gestiona
 *    (carterasL ∪ carterasE del espejo, proyección D1R que SOLO el master
 *    escribe); un gestor sin carteras no ve inmuebles.
 *  · carterasL (lectura / lectura histórica, S7) NO concede escritura;
 *    carterasE sí.
 *  · La gestión NO altera la titularidad: el propietario conserva su ámbito
 *    D2a intacto y sigue sin ver lo ajeno.
 *  · Anti-autoasignación (D3): un usuario NO puede crear ni modificar
 *    `carterasL`/`carterasE` en su propio espejo; sólo el master.
 *  · `gestiones_cartera`: lectura para el ámbito admin, el titular y el
 *    gestor designado; escritura SOLO master (trazabilidad sin
 *    autoasignación).
 *  · Admin/tenant/autenticado-sin-ficha: exactamente el ámbito ya existente.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';

const RAIZ = resolve(__dirname, '..');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const EVAL = crearEvaluadorReglas(RULES);
const { permite, SIN_COMENTARIOS } = EVAL;

const EMAIL_ADMIN = (
  SIN_COMENTARIOS(RULES).match(/function\s+isMasterAdmin\(\)\s*\{[\s\S]*?'([^'@\s]+@[^'\s]+)'/) ||
  []
)[1];
if (!EMAIL_ADMIN) throw new Error('isMasterAdmin() no contiene un email literal: fichero equivocado');

// ---------------------------------------------------------------------------
// Estado sintético de Firestore
// ---------------------------------------------------------------------------
const INM_X = { id: 'inm_X', propietarioId: 'prop_X', address: 'Cartera X 1' };
const INM_X2 = { id: 'inm_X2', propietarioId: 'prop_X', address: 'Cartera X 2' };
const INM_Y = { id: 'inm_Y', propietarioId: 'prop_Y', address: 'Cartera Y 1' };
const INM_A = { id: 'inm_A', propietarioId: 'prop_A', address: 'Del propietario A' };
const INM_CT = { id: 'inm_ct', propietarioId: 'prop_A', contratoActivoId: 'ct_A', address: 'Con contrato' };

/** Gestión trazable: titular prop_X, gestor usr_gestorA (espejo uid_gestorL). */
const G_1 = {
  id: 'g_1', propietarioId: 'prop_X', gestorUsuarioId: 'usr_gestorA', tipoGestor: 'GESTOR_PROFESIONAL',
  inmuebleIds: [], permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR', estado: 'ACTIVA',
  requiereAceptacion: false, eventos: [], creadoPor: 'uid_master',
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
};
const G_2 = { ...G_1, id: 'g_2', propietarioId: 'prop_Y', gestorUsuarioId: 'usr_gestorB' };

const FIRESTORE: Peticion['db'] = {
  // Fichas autoritativas (isTenant / esAdminInmuebles / indexIsTruthful).
  'usuarios/uid_inq': { tipoPerfil: 'INQUILINO', estado: 'ACTIVO', contratoIds: ['ct_A'], authUid: 'uid_inq' },
  'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_admin' },
  'usuarios/usr_gestorA': {
    id: 'usr_gestorA', authUid: 'uid_gestorL', email: 'gestor-a@test.local', tipoPerfil: 'PROFESIONAL',
    estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [],
  },
  // Espejos de identidad.
  // Gestor con LECTURA sobre prop_X (carterasE vacía: no escribe).
  'usuarios_auth/uid_gestorL': {
    uid: 'uid_gestorL', usuarioId: 'usr_gestorA', email: 'gestor-a@test.local', tipoPerfil: 'PROFESIONAL',
    estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [],
    carterasL: ['prop_X'], carterasE: [],
  },
  // Gestor con LECTURA+ESCRITURA sobre prop_Y.
  'usuarios_auth/uid_gestorE': {
    uid: 'uid_gestorE', usuarioId: 'usr_gestorB', email: 'gestor-b@test.local', tipoPerfil: 'PROFESIONAL',
    estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof_2', inmuebleIds: [],
    carterasL: ['prop_Y'], carterasE: ['prop_Y'],
  },
  // Gestor SIN carteras (p. ej. tras revocación sin lectura histórica).
  'usuarios_auth/uid_gestorSin': {
    uid: 'uid_gestorSin', usuarioId: 'usr_gestorC', email: 'gestor-c@test.local', tipoPerfil: 'PROFESIONAL',
    estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof_3', inmuebleIds: [],
    carterasL: [], carterasE: [],
  },
  // Propietarios sin carteras.
  'usuarios_auth/uid_propA': {
    uid: 'uid_propA', usuarioId: 'usr_propA', email: 'prop-a@test.local', tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO', roles: [], propietarioId: 'prop_A', profesionalId: '', inmuebleIds: [],
  },
  'usuarios_auth/uid_propX': {
    uid: 'uid_propX', usuarioId: 'usr_propX', email: 'prop-x@test.local', tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO', roles: [], propietarioId: 'prop_X', profesionalId: '', inmuebleIds: [],
  },
  'inmuebles/inm_X': INM_X,
  'inmuebles/inm_X2': INM_X2,
  'inmuebles/inm_Y': INM_Y,
  'inmuebles/inm_A': INM_A,
  'inmuebles/inm_ct': INM_CT,
  'gestiones_cartera/g_1': G_1,
  'gestiones_cartera/g_2': G_2,
};

const AUTH = {
  gestorL: { uid: 'uid_gestorL', token: { email: 'gestor-a@test.local' } },
  gestorE: { uid: 'uid_gestorE', token: { email: 'gestor-b@test.local' } },
  gestorSin: { uid: 'uid_gestorSin', token: { email: 'gestor-c@test.local' } },
  propA: { uid: 'uid_propA', token: { email: 'prop-a@test.local' } },
  propX: { uid: 'uid_propX', token: { email: 'prop-x@test.local' } },
  admin: { uid: 'uid_admin', token: { email: 'admin@test.local' } },
  inq: { uid: 'uid_inq', token: { email: 'inq@test.local' } },
  desconocido: { uid: 'uid_sin_ficha', token: { email: 'nadie@test.local' } },
  master: { uid: 'uid_master', token: { email: EMAIL_ADMIN } },
  anon: null,
};

const INMUEBLES: Record<string, Record<string, unknown>> = {
  inm_X: INM_X, inm_X2: INM_X2, inm_Y: INM_Y, inm_A: INM_A, inm_ct: INM_CT,
};
const GESTIONES: Record<string, Record<string, unknown>> = { g_1: G_1, g_2: G_2 };

function peticion(over: Partial<Peticion>): Peticion {
  return { auth: null, db: FIRESTORE, resource: null, requestResource: null, docId: 'inm_X', ...over };
}
function getInm(id: keyof typeof INMUEBLES, auth: Peticion['auth']) {
  return permite('inmuebles', 'get', peticion({ auth, docId: id, resource: INMUEBLES[id] }));
}
function listInm(id: keyof typeof INMUEBLES, auth: Peticion['auth']) {
  return permite('inmuebles', 'list', peticion({ auth, docId: id, resource: INMUEBLES[id] }));
}
function updateInm(id: keyof typeof INMUEBLES, auth: Peticion['auth']) {
  return permite('inmuebles', 'update', peticion({
    auth, docId: id, resource: INMUEBLES[id], requestResource: { ...INMUEBLES[id], monthlyRent: 1 },
  }));
}
function getGestion(id: keyof typeof GESTIONES, auth: Peticion['auth']) {
  return permite('gestiones_cartera', 'get', peticion({ auth, docId: id, resource: GESTIONES[id] }));
}
function listGestion(id: keyof typeof GESTIONES, auth: Peticion['auth']) {
  return permite('gestiones_cartera', 'list', peticion({ auth, docId: id, resource: GESTIONES[id] }));
}

// ---------------------------------------------------------------------------
// A — ÁMBITO DEL GESTOR
// ---------------------------------------------------------------------------
describe('D2b · A — Gestor: sólo sus carteras', () => {
  it('A1 · gestor L lee los inmuebles de su cartera (get y list acotada)', () => {
    expect(getInm('inm_X', AUTH.gestorL)).toBe(true);
    expect(getInm('inm_X2', AUTH.gestorL)).toBe(true);
    expect(listInm('inm_X', AUTH.gestorL)).toBe(true);
  });
  it('A2 · gestor L NO ve carteras ajenas', () => {
    expect(getInm('inm_Y', AUTH.gestorL)).toBe(false);
    expect(listInm('inm_Y', AUTH.gestorL)).toBe(false);
    expect(getInm('inm_A', AUTH.gestorL)).toBe(false);
  });
  it('A3 · gestor sin carteras NO ve inmuebles (revocación/suspensión proyectadas = vacío)', () => {
    expect(getInm('inm_X', AUTH.gestorSin)).toBe(false);
    expect(getInm('inm_Y', AUTH.gestorSin)).toBe(false);
    expect(listInm('inm_X', AUTH.gestorSin)).toBe(false);
  });
  it('A4 · S7: carterasL NO concede escritura; carterasE sí', () => {
    expect(updateInm('inm_X', AUTH.gestorL)).toBe(false); // L: lectura (histórica o permiso LECTURA)
    expect(updateInm('inm_Y', AUTH.gestorE)).toBe(true);  // E: ACTIVA + L/E + responsable GESTOR
    expect(updateInm('inm_X', AUTH.gestorE)).toBe(false); // E sobre otra cartera: no
    expect(updateInm('inm_A', AUTH.gestorE)).toBe(false); // fuera de carteras: no
  });
  it('A5 · la gestión NO altera la titularidad: el titular conserva su ámbito intacto', () => {
    expect(getInm('inm_X', AUTH.propX)).toBe(true);
    expect(listInm('inm_X', AUTH.propX)).toBe(true);
    expect(updateInm('inm_X', AUTH.propX)).toBe(true);
    // Y sigue sin ver lo ajeno (no regresión D2a):
    expect(getInm('inm_Y', AUTH.propX)).toBe(false);
    expect(getInm('inm_A', AUTH.propX)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B — NO REGRESIÓN D2a EN CONTEXTO DE CARTERAS
// ---------------------------------------------------------------------------
describe('D2b · B — Propietarios, explícitos, admin, tenant', () => {
  it('B1 · propietario A no ve a propietario B (D2a intacto)', () => {
    expect(getInm('inm_A', AUTH.propA)).toBe(true);
    expect(getInm('inm_X', AUTH.propA)).toBe(false);
    expect(listInm('inm_X', AUTH.propA)).toBe(false);
  });
  it('B2 · admin y master conservan su ámbito legítimo (sin ampliación a create/delete)', () => {
    expect(getInm('inm_X', AUTH.admin)).toBe(true);
    expect(listInm('inm_Y', AUTH.admin)).toBe(true);
    expect(getInm('inm_X', AUTH.master)).toBe(true);
    expect(permite('inmuebles', 'delete', peticion({ auth: AUTH.admin, docId: 'inm_X', resource: INM_X }))).toBe(false);
    expect(permite('inmuebles', 'delete', peticion({ auth: AUTH.master, docId: 'inm_X', resource: INM_X }))).toBe(true);
  });
  it('B3 · tenant no amplía su ámbito: sólo su contrato, nunca carteras', () => {
    expect(getInm('inm_ct', AUTH.inq)).toBe(true);
    expect(getInm('inm_X', AUTH.inq)).toBe(false);
    expect(listInm('inm_X', AUTH.inq)).toBe(false);
  });
  it('B4 · ningún acceso global por estar autenticado', () => {
    expect(getInm('inm_X', AUTH.desconocido)).toBe(false);
    expect(listInm('inm_X', AUTH.desconocido)).toBe(false);
    expect(getInm('inm_X', AUTH.anon)).toBe(false);
    expect(listInm('inm_X', AUTH.anon)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C — D3: ANTI-AUTOASIGNACIÓN EN EL ESPEJO (`usuarios_auth`)
// ---------------------------------------------------------------------------
const ESPEJO_GESTOR = FIRESTORE['usuarios_auth/uid_gestorL'];
function espejoReq(incoming: Record<string, unknown>, auth: Peticion['auth'], uid = 'uid_gestorL') {
  return peticion({ auth, docId: uid, resource: ESPEJO_GESTOR, requestResource: incoming });
}

describe('D3 · C — carterasL/carterasE son sólo del master', () => {
  it('C1 · el propio usuario NO puede AÑADIR carteras a su espejo (autoasignación)', () => {
    const incoming = { ...ESPEJO_GESTOR, carterasL: ['prop_X', 'prop_Y'], carterasE: ['prop_Y'] };
    expect(permite('usuarios_auth', 'update', espejoReq(incoming, AUTH.gestorL))).toBe(false);
  });
  it('C2 · el propio usuario NO puede MODIFICAR sus carteras', () => {
    const incoming = { ...ESPEJO_GESTOR, carterasE: ['prop_X'] };
    expect(permite('usuarios_auth', 'update', espejoReq(incoming, AUTH.gestorL))).toBe(false);
  });
  it('C3 · el propio usuario SÍ puede actualizar el resto de su espejo (carteras intactas)', () => {
    const incoming = { ...ESPEJO_GESTOR, updatedAt: '2026-09-27T00:00:00.000Z' };
    expect(permite('usuarios_auth', 'update', espejoReq(incoming, AUTH.gestorL))).toBe(true);
  });
  it('C4 · el master SÍ puede proyectar carteras (es el único escritor legítimo)', () => {
    const incoming = { ...ESPEJO_GESTOR, carterasL: ['prop_X'], carterasE: ['prop_X'] };
    expect(permite('usuarios_auth', 'update', espejoReq(incoming, AUTH.master))).toBe(true);
  });
  it('C5 · create propio con carteras: denegado; sin carteras: permitido', () => {
    const base = { ...ESPEJO_GESTOR };
    delete (base as Record<string, unknown>).carterasL;
    delete (base as Record<string, unknown>).carterasE;
    expect(permite('usuarios_auth', 'create', espejoReq(base, AUTH.gestorL))).toBe(true);
    expect(permite('usuarios_auth', 'create', espejoReq({ ...base, carterasL: ['prop_Z'] }, AUTH.gestorL))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D — `gestiones_cartera`: trazabilidad con escritura sólo master
// ---------------------------------------------------------------------------
describe('D2b · D — gestiones_cartera', () => {
  it('D1 · el gestor designado lee su gestión (get y consulta por gestorUsuarioId)', () => {
    expect(getGestion('g_1', AUTH.gestorL)).toBe(true);
    expect(listGestion('g_1', AUTH.gestorL)).toBe(true);
    expect(getGestion('g_2', AUTH.gestorL)).toBe(false);
    expect(listGestion('g_2', AUTH.gestorL)).toBe(false);
  });
  it('D2 · el titular lee la gestión de su cartera; otros propietarios no', () => {
    expect(getGestion('g_1', AUTH.propX)).toBe(true);
    expect(listGestion('g_1', AUTH.propX)).toBe(true);
    expect(getGestion('g_1', AUTH.propA)).toBe(false);
    expect(listGestion('g_1', AUTH.propA)).toBe(false);
  });
  it('D3 · escritura SOLO master (ni gestor ni titular ni admin de perfil)', () => {
    for (const auth of [AUTH.gestorL, AUTH.propX, AUTH.admin, AUTH.desconocido, AUTH.anon]) {
      expect(permite('gestiones_cartera', 'create', peticion({
        auth, docId: 'g_3', resource: null, requestResource: { ...G_1, id: 'g_3' },
      }))).toBe(false);
      expect(permite('gestiones_cartera', 'update', peticion({
        auth, docId: 'g_1', resource: G_1, requestResource: { ...G_1, estado: 'REVOCADA' },
      }))).toBe(false);
      expect(permite('gestiones_cartera', 'delete', peticion({
        auth, docId: 'g_1', resource: G_1,
      }))).toBe(false);
    }
    expect(permite('gestiones_cartera', 'create', peticion({
      auth: AUTH.master, docId: 'g_3', resource: null, requestResource: { ...G_1, id: 'g_3' },
    }))).toBe(true);
    expect(permite('gestiones_cartera', 'update', peticion({
      auth: AUTH.master, docId: 'g_1', resource: G_1, requestResource: { ...G_1, estado: 'SUSPENDIDA' },
    }))).toBe(true);
  });
  it('D4 · admin de perfil y master leen todo; anónimo nada', () => {
    expect(getGestion('g_1', AUTH.admin)).toBe(true);
    expect(listGestion('g_2', AUTH.master)).toBe(true);
    expect(getGestion('g_1', AUTH.anon)).toBe(false);
    expect(listGestion('g_1', AUTH.anon)).toBe(false);
  });
});
