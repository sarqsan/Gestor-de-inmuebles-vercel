/**
 * BLOQUE 1 — Seguridad de `polizas_seguros` y `siniestros`.
 * ---------------------------------------------------------------------------
 * METODOLOGÍA: igual que `seguridad-firestore-carteras.test.ts`: se evalúa el
 * TEXTO REAL de `firestore.rules` con el harness compartido
 * `tests/harness/firestoreRulesEval.ts` (fail-loud; sin emulador de Google en
 * este entorno — validación en emulador PENDIENTE, NV → BLOQUE 4).
 *
 * Contrato probado:
 *  · El titular (propietario) conserva su ámbito intacto sobre sus pólizas.
 *  · El gestor accede con el mismo alcance que sobre los inmuebles de la
 *    cartera (D2a/D2b/D3): lectura carterasL∪carterasE; escritura SOLO
 *    carterasE y sin cambiar la titularidad (propietarioId inmutable).
 *  · carterasL NO concede escritura (S7).
 *  · Un gestor sin carteras y un autenticado sin ficha no ven nada.
 *  · El borrado sigue reservado a master/titular (no se amplía).
 *  · Sin bypass global: el bloque de pólizas no usa `isStaff()`.
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
  SIN_COMENTARIOS(RULES).match(/function\s+isMasterAdmin\(\)\s*\{[\s\S]*?'([^'@\s]+@[^'@\s]+)'/) ||
  []
)[1];
if (!EMAIL_ADMIN) throw new Error('isMasterAdmin() no contiene un email literal: fichero equivocado');

// ---------------------------------------------------------------------------
// Estado sintético de Firestore
// ---------------------------------------------------------------------------
const POL_X = { id: 'pol_X', propietarioId: 'prop_X', inmuebleId: 'inm_X', aseguradora: 'Mapfre', numeroPoliza: 'POL-X-1', tipo: 'HOGAR', estado: 'VIGENTE', fechaInicio: '2026-01-01', fechaVencimiento: '2026-12-31', coberturas: [] };
const POL_Y = { id: 'pol_Y', propietarioId: 'prop_Y', inmuebleId: 'inm_Y', aseguradora: 'Caser', numeroPoliza: 'POL-Y-1', tipo: 'HOGAR', estado: 'VIGENTE', fechaInicio: '2026-01-01', fechaVencimiento: '2026-12-31', coberturas: [] };
const SIN_X = { id: 'sin_X', propietarioId: 'prop_X', inmuebleId: 'inm_X', incidenciaId: 'inc_1', polizaId: 'pol_X', aseguradora: 'Mapfre', estado: 'COMUNICADO', fechaComunicacion: '2026-09-01' };

const FIRESTORE: Peticion['db'] = {
  'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_admin' },
  'usuarios/usr_gestorA': {
    id: 'usr_gestorA', authUid: 'uid_gestorL', email: 'gestor-a@test.local', tipoPerfil: 'PROFESIONAL',
    estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [],
  },
  'usuarios_auth/uid_gestorL': {
    uid: 'uid_gestorL', usuarioId: 'usr_gestorA', email: 'gestor-a@test.local', tipoPerfil: 'PROFESIONAL',
    estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [],
    carterasL: ['prop_X'], carterasE: [],
  },
  'usuarios_auth/uid_gestorE': {
    uid: 'uid_gestorE', usuarioId: 'usr_gestorB', email: 'gestor-b@test.local', tipoPerfil: 'PROFESIONAL',
    estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof_2', inmuebleIds: [],
    carterasL: ['prop_Y'], carterasE: ['prop_Y'],
  },
  'usuarios_auth/uid_gestorSin': {
    uid: 'uid_gestorSin', usuarioId: 'usr_gestorC', email: 'gestor-c@test.local', tipoPerfil: 'PROFESIONAL',
    estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof_3', inmuebleIds: [],
    carterasL: [], carterasE: [],
  },
  'usuarios_auth/uid_propX': {
    uid: 'uid_propX', usuarioId: 'usr_propX', email: 'prop-x@test.local', tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO', roles: [], propietarioId: 'prop_X', profesionalId: '', inmuebleIds: ['inm_X'],
  },
  'usuarios_auth/uid_propY': {
    uid: 'uid_propY', usuarioId: 'usr_propY', email: 'prop-y@test.local', tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO', roles: [], propietarioId: 'prop_Y', profesionalId: '', inmuebleIds: ['inm_Y'],
  },
  'polizas_seguros/pol_X': POL_X,
  'polizas_seguros/pol_Y': POL_Y,
  'siniestros/sin_X': SIN_X,
};

const AUTH = {
  gestorL: { uid: 'uid_gestorL', token: { email: 'gestor-a@test.local' } },
  gestorE: { uid: 'uid_gestorE', token: { email: 'gestor-b@test.local' } },
  gestorSin: { uid: 'uid_gestorSin', token: { email: 'gestor-c@test.local' } },
  propX: { uid: 'uid_propX', token: { email: 'prop-x@test.local' } },
  propY: { uid: 'uid_propY', token: { email: 'prop-y@test.local' } },
  master: { uid: 'uid_master', token: { email: EMAIL_ADMIN } },
  anon: null,
};

const POLIZAS: Record<string, Record<string, unknown>> = { pol_X: POL_X, pol_Y: POL_Y };

function peticion(over: Partial<Peticion>): Peticion {
  return { auth: null, db: FIRESTORE, resource: null, requestResource: null, docId: 'pol_X', ...over };
}
function getPol(id: keyof typeof POLIZAS, auth: Peticion['auth']) {
  return permite('polizas_seguros', 'get', peticion({ auth, docId: id, resource: POLIZAS[id] }));
}
function listPol(id: keyof typeof POLIZAS, auth: Peticion['auth']) {
  return permite('polizas_seguros', 'list', peticion({ auth, docId: id, resource: POLIZAS[id] }));
}
function updatePol(id: keyof typeof POLIZAS, auth: Peticion['auth'], over: Record<string, unknown> = {}) {
  return permite('polizas_seguros', 'update', peticion({
    auth, docId: id, resource: POLIZAS[id], requestResource: { ...POLIZAS[id], ...over },
  }));
}
function createPol(auth: Peticion['auth'], data: Record<string, unknown>) {
  return permite('polizas_seguros', 'create', peticion({ auth, docId: 'pol_new', resource: null, requestResource: data }));
}
function deletePol(id: keyof typeof POLIZAS, auth: Peticion['auth']) {
  return permite('polizas_seguros', 'delete', peticion({ auth, docId: id, resource: POLIZAS[id] }));
}
function getSiniestro(auth: Peticion['auth']) {
  return permite('siniestros', 'get', peticion({ auth, docId: 'sin_X', resource: SIN_X }));
}
function updateSiniestro(auth: Peticion['auth'], over: Record<string, unknown> = {}) {
  return permite('siniestros', 'update', peticion({
    auth, docId: 'sin_X', resource: SIN_X, requestResource: { ...SIN_X, ...over },
  }));
}

// ---------------------------------------------------------------------------
describe('BLOQUE 1 · pólizas — titular (propietario)', () => {
  it('P1 · el titular lee y escribe sus pólizas', () => {
    expect(getPol('pol_X', AUTH.propX)).toBe(true);
    expect(listPol('pol_X', AUTH.propX)).toBe(true);
    expect(updatePol('pol_X', AUTH.propX, { primaAnual: 320 })).toBe(true);
  });
  it('P2 · el titular NO ve ni escribe pólizas ajenas (aislamiento entre propietarios)', () => {
    expect(getPol('pol_Y', AUTH.propX)).toBe(false);
    expect(listPol('pol_Y', AUTH.propX)).toBe(false);
    expect(updatePol('pol_Y', AUTH.propX)).toBe(false);
    expect(deletePol('pol_Y', AUTH.propX)).toBe(false);
  });
  it('P3 · el titular puede borrar su póliza (borrado NO ampliado)', () => {
    expect(deletePol('pol_X', AUTH.propX)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('BLOQUE 1 · pólizas — gestor por cartera (D2a/D2b/D3)', () => {
  it('G1 · gestor L lee las pólizas de su cartera (get y list acotada)', () => {
    expect(getPol('pol_X', AUTH.gestorL)).toBe(true);
    expect(listPol('pol_X', AUTH.gestorL)).toBe(true);
  });
  it('G2 · S7: carterasL NO concede escritura', () => {
    expect(updatePol('pol_X', AUTH.gestorL, { primaAnual: 1 })).toBe(false);
    expect(createPol(AUTH.gestorL, { ...POL_X, id: 'pol_new' })).toBe(false);
  });
  it('G3 · gestor E escribe en su cartera pero NO puede cambiar la titularidad', () => {
    expect(updatePol('pol_Y', AUTH.gestorE, { primaAnual: 400 })).toBe(true);
    expect(updatePol('pol_Y', AUTH.gestorE, { propietarioId: 'prop_OTRO' })).toBe(false);
  });
  it('G4 · gestor E no toca otras carteras', () => {
    expect(getPol('pol_X', AUTH.gestorE)).toBe(false);
    expect(updatePol('pol_X', AUTH.gestorE)).toBe(false);
    expect(createPol(AUTH.gestorE, { ...POL_X, id: 'pol_new2' })).toBe(false);
  });
  it('G5 · gestor E crea pólizas para los titulares de su cartera (propietarioId explícito)', () => {
    expect(createPol(AUTH.gestorE, { ...POL_Y, id: 'pol_newY' })).toBe(true);
  });
  it('G6 · el borrado NO se amplía al gestor (sigue master/titular)', () => {
    expect(deletePol('pol_Y', AUTH.gestorE)).toBe(false);
    expect(deletePol('pol_X', AUTH.gestorL)).toBe(false);
  });
  it('G7 · gestor sin carteras no ve ni escribe nada', () => {
    expect(getPol('pol_X', AUTH.gestorSin)).toBe(false);
    expect(listPol('pol_X', AUTH.gestorSin)).toBe(false);
    expect(updatePol('pol_X', AUTH.gestorSin)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('BLOQUE 1 · pólizas — admin, anónimo y bypass', () => {
  it('A1 · el master admin conserva acceso completo', () => {
    expect(getPol('pol_X', AUTH.master)).toBe(true);
    expect(updatePol('pol_Y', AUTH.master)).toBe(true);
    expect(deletePol('pol_X', AUTH.master)).toBe(true);
  });
  it('A2 · anónimo: denegado en todo', () => {
    expect(getPol('pol_X', AUTH.anon)).toBe(false);
    expect(listPol('pol_X', AUTH.anon)).toBe(false);
    expect(createPol(AUTH.anon, POL_X)).toBe(false);
  });
  it('A3 · sin bypass global: el bloque de pólizas/siniestros no usa isStaff()', () => {
    const reglasSinComentarios = SIN_COMENTARIOS(RULES);
    const inicio = reglasSinComentarios.indexOf('match /polizas_seguros/');
    const finSiniestros = reglasSinComentarios.indexOf('match /siniestros/');
    const bloquePolizas = reglasSinComentarios.slice(inicio, finSiniestros);
    const bloqueSiniestros = reglasSinComentarios.slice(
      finSiniestros,
      reglasSinComentarios.indexOf('match /candidatos/') > finSiniestros
        ? reglasSinComentarios.indexOf('match /candidatos/')
        : finSiniestros + 2000
    );
    expect(bloquePolizas).not.toContain('isStaff()');
    expect(bloqueSiniestros).not.toContain('isStaff()');
  });
});

// ---------------------------------------------------------------------------
describe('BLOQUE 1 · siniestros — mismo alcance que pólizas', () => {
  it('S1 · titular lee y escribe su siniestro; ajeno denegado', () => {
    expect(getSiniestro(AUTH.propX)).toBe(true);
    expect(updateSiniestro(AUTH.propX, { estado: 'EN_ESTUDIO' })).toBe(true);
    expect(getSiniestro(AUTH.propY)).toBe(false);
  });
  it('S2 · gestor L lee; gestor E escribe sin cambiar titularidad; sin carteras nada', () => {
    expect(getSiniestro(AUTH.gestorL)).toBe(true);
    expect(updateSiniestro(AUTH.gestorL)).toBe(false);
    expect(getSiniestro(AUTH.gestorE)).toBe(false); // siniestro de prop_X, fuera de su cartera
    expect(getSiniestro(AUTH.gestorSin)).toBe(false);
  });
});
