/**
 * D2a — Seguridad de `inmuebles`: lectura acotada por titularidad y
 * autorización explícita (cierre de F5-1).
 * ---------------------------------------------------------------------------
 * METODOLOGÍA: sin emulador de Firebase en este entorno. Se evalúa el TEXTO
 * REAL de `firestore.rules` con el harness compartido
 * `tests/harness/firestoreRulesEval.ts` (mismo criterio que
 * fase14-espejo-identidad y login-admin-principal): parsea las funciones y los
 * `allow` del fichero desplegable y decide cada operación con un contexto
 * sintético (auth, mini-base, recurso existente/entrante). Es EXPRESIVO: si no
 * cubre una construcción, LANZA (nunca devuelve "permitido" por omisión). La
 * validación contra el motor de Google (emulador/proyecto) sigue PENDIENTE
 * (NV) en un entorno con red y Java.
 *
 * Contrato D2a probado aquí:
 *  A — PROPIETARIO: lee los suyos (titular o principal); NO lee ni lista los
 *      de otros; sin inmuebles recibe colección vacía; conserva el acceso a
 *      los autorizados explícitamente.
 *  B — Usuario sin propietario/sin ficha: SIN acceso global (antes: isStaff()
 *      ⇒ cualquier inmueble).
 *  C — `inmuebleIds`: autorización documento a documento; autorizar uno NO
 *      autoriza la colección (list denegado).
 *  D — Administrativo: exactamente el ámbito ya existente (master por email y
 *      perfil ADMINISTRADOR), sin ampliación.
 *  E — No regresión: create/update/delete, tenant con contrato, master.
 *  F — Caché: snapshot vacío/acotado NUNCA restaura caché -> Firestore.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
import { procesarSnapshotInmuebles } from '../src/lib/snapshotInmueblesCache';

const RAIZ = resolve(__dirname, '..');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const EVAL = crearEvaluadorReglas(RULES);
const { permite, SIN_COMENTARIOS } = EVAL;

// El email del master se extrae del fichero real (nunca hardcodeado: si el
// fichero cambia, el test debe notarlo).
const EMAIL_ADMIN = (
  SIN_COMENTARIOS(RULES).match(/function\s+isMasterAdmin\(\)\s*\{[\s\S]*?'([^'@\s]+@[^'\s]+)'/) ||
  []
)[1];
if (!EMAIL_ADMIN) throw new Error('isMasterAdmin() no contiene un email literal: fichero equivocado');

// ---------------------------------------------------------------------------
// Estado sintético de Firestore
// ---------------------------------------------------------------------------
const INM_A = { id: 'inm_A', propietarioId: 'prop_A', address: 'Calle A 1' };
const INM_B = { id: 'inm_B', propietarioId: 'prop_B', address: 'Calle B 2' };
/** Copropiedad: titular prop_B, propietario principal prop_A. */
const INM_C = { id: 'inm_C', propietarioId: 'prop_B', propietarioPrincipalId: 'prop_A', address: 'Calle C 3' };
/** Inmueble del propietario sin inmuebles (prop_C). */
const INM_D = { id: 'inm_D', propietarioId: 'prop_C', address: 'Calle D 4' };
/** Documento histórico sin propietarioId (propietario sin cuenta). */
const INM_SIN_PROP = { id: 'inm_sin_prop', address: 'Legado 5' };
/** Inmueble con contrato activo (rama tenant). */
const INM_CT = { id: 'inm_ct', propietarioId: 'prop_A', contratoActivoId: 'ct_A', address: 'Calle CT 6' };

const FIRESTORE: Peticion['db'] = {
  // Fichas autoritativas `usuarios/{uid}` (las usan isTenant/esAdminInmuebles).
  'usuarios/uid_inq': { tipoPerfil: 'INQUILINO', estado: 'ACTIVO', contratoIds: ['ct_A'], authUid: 'uid_inq' },
  'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_admin' },
  // Espejos de identidad `usuarios_auth/{uid}` (los usan activeUser/me()).
  'usuarios_auth/uid_propA': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_A', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_propB': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_B', profesionalId: '', inmuebleIds: [] },
  // Propietario SIN inmuebles propios ni autorizaciones.
  'usuarios_auth/uid_propSin': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_C', profesionalId: '', inmuebleIds: [] },
  // Propietario con un inmueble ajeno autorizado explícitamente (inm_B).
  'usuarios_auth/uid_propAsig': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_D', profesionalId: '', inmuebleIds: ['inm_B'] },
  // Profesional sin propietario propio ni asignaciones.
  'usuarios_auth/uid_prof': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [] },
  'inmuebles/inm_A': INM_A,
  'inmuebles/inm_B': INM_B,
  'inmuebles/inm_C': INM_C,
  'inmuebles/inm_D': INM_D,
  'inmuebles/inm_sin_prop': INM_SIN_PROP,
  'inmuebles/inm_ct': INM_CT,
};

const AUTH = {
  propA: { uid: 'uid_propA', token: { email: 'prop-a@test.local' } },
  propB: { uid: 'uid_propB', token: { email: 'prop-b@test.local' } },
  propSin: { uid: 'uid_propSin', token: { email: 'prop-sin@test.local' } },
  propAsig: { uid: 'uid_propAsig', token: { email: 'prop-asig@test.local' } },
  prof: { uid: 'uid_prof', token: { email: 'prof@test.local' } },
  /** Perfil ADMINISTRADOR (escrito por el master; no es el email master). */
  admin: { uid: 'uid_admin', token: { email: 'admin@test.local' } },
  /** INQUILINO: ficha en `usuarios/`, sin espejo (modelo E.0). */
  inq: { uid: 'uid_inq', token: { email: 'inq@test.local' } },
  /** Autenticado en Firebase pero SIN ficha ni espejo. */
  desconocido: { uid: 'uid_sin_ficha', token: { email: 'nadie@test.local' } },
  master: { uid: 'uid_master', token: { email: EMAIL_ADMIN } },
  anon: null,
};

const INMUEBLES: Record<string, Record<string, unknown>> = {
  inm_A: INM_A,
  inm_B: INM_B,
  inm_C: INM_C,
  inm_D: INM_D,
  inm_sin_prop: INM_SIN_PROP,
  inm_ct: INM_CT,
};

function peticion(over: Partial<Peticion>): Peticion {
  return { auth: null, db: FIRESTORE, resource: null, requestResource: null, docId: 'inm_A', ...over };
}
function get(id: keyof typeof INMUEBLES, auth: Peticion['auth']) {
  return permite('inmuebles', 'get', peticion({ auth, docId: id, resource: INMUEBLES[id] }));
}
function list(id: keyof typeof INMUEBLES, auth: Peticion['auth']) {
  return permite('inmuebles', 'list', peticion({ auth, docId: id, resource: INMUEBLES[id] }));
}

// ---------------------------------------------------------------------------
// A — PROPIETARIO
// ---------------------------------------------------------------------------
describe('D2a · A — Propietario', () => {
  it('A1 · lee su propio inmueble (get)', () => {
    expect(get('inm_A', AUTH.propA)).toBe(true);
  });
  it('A2 · NO lee el inmueble de otro propietario (get)', () => {
    expect(get('inm_B', AUTH.propA)).toBe(false);
  });
  it('A3 · puede listar SUS inmuebles (consulta where propietarioId == myPropId)', () => {
    // La regla de list sólo se satisface con la igualdad demostrable: el
    // cliente propietario consulta where('propietarioId','==',pid) y el motor
    // la acepta documento a documento.
    expect(list('inm_A', AUTH.propA)).toBe(true);
  });
  it('A4 · NO puede listar inmuebles de otro propietario (consulta no acotada denegada)', () => {
    expect(list('inm_B', AUTH.propA)).toBe(false);
  });
  it('A5 · copropiedad: el propietario principal sigue leyendo (get)', () => {
    expect(get('inm_C', AUTH.propA)).toBe(true);
  });
  it('A6 · propietario sin inmuebles: sin acceso a ajenos y su consulta acotada es legítima', () => {
    expect(get('inm_A', AUTH.propSin)).toBe(false);
    expect(list('inm_A', AUTH.propSin)).toBe(false);
    // Su propia consulta (where propietarioId == 'prop_C') es válida; si no
    // tuviera documentos, el resultado vacío es legítimo (cliente: callback([])).
    expect(list('inm_D', AUTH.propSin)).toBe(true);
  });
  it('A7 · conserva el acceso a su inmueble autorizado explícitamente', () => {
    expect(get('inm_B', AUTH.propAsig)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B — USUARIO SIN PROPIETARIO (antes: isStaff() ⇒ acceso global)
// ---------------------------------------------------------------------------
describe('D2a · B — Usuario sin propietario', () => {
  it('B1 · autenticado sin ficha NO obtiene acceso global (get)', () => {
    expect(get('inm_A', AUTH.desconocido)).toBe(false);
    expect(get('inm_B', AUTH.desconocido)).toBe(false);
  });
  it('B2 · autenticado sin ficha NO puede listar la colección', () => {
    expect(list('inm_A', AUTH.desconocido)).toBe(false);
    expect(list('inm_B', AUTH.desconocido)).toBe(false);
  });
  it('B3 · tampoco lee un inmueble sin propietarioId (ni residual ni global)', () => {
    expect(get('inm_sin_prop', AUTH.desconocido)).toBe(false);
  });
  it('B4 · profesional sin asignaciones: sin acceso a inmuebles ajenos', () => {
    expect(get('inm_A', AUTH.prof)).toBe(false);
    expect(list('inm_A', AUTH.prof)).toBe(false);
  });
  it('B5 · anónimo: denegado', () => {
    expect(get('inm_A', AUTH.anon)).toBe(false);
    expect(list('inm_A', AUTH.anon)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C — AUTORIZACIÓN EXPLÍCITA (inmuebleIds)
// ---------------------------------------------------------------------------
describe('D2a · C — inmuebleIds (autorización explícita)', () => {
  it('C1 · el usuario autorizado accede al inmueble permitido (get)', () => {
    expect(get('inm_B', AUTH.propAsig)).toBe(true);
  });
  it('C2 · NO accede a otro inmueble no incluido', () => {
    expect(get('inm_A', AUTH.propAsig)).toBe(false);
    expect(get('inm_sin_prop', AUTH.propAsig)).toBe(false);
  });
  it('C3 · autorizar UN inmueble NO autoriza la colección (list denegado)', () => {
    // La autorización explícita se sirve por get documento a documento
    // (listeners de doc en el cliente); nunca habilita listar.
    expect(list('inm_B', AUTH.propAsig)).toBe(false);
    expect(list('inm_A', AUTH.propAsig)).toBe(false);
  });
  it('C4 · la autorización no concede escritura más allá de lo existente', () => {
    // update sigue gobernado por canReachInmuebleId (sin cambios D2a):
    expect(permite('inmuebles', 'update', peticion({
      auth: AUTH.propAsig, docId: 'inm_B', resource: INM_B, requestResource: { ...INM_B },
    }))).toBe(true);
    // pero un inmueble NO autorizado sigue denegado:
    expect(permite('inmuebles', 'update', peticion({
      auth: AUTH.propAsig, docId: 'inm_A', resource: INM_A, requestResource: { ...INM_A },
    }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D — ÁMBITO ADMINISTRATIVO (conservado, no ampliado)
// ---------------------------------------------------------------------------
describe('D2a · D — Administrativo', () => {
  it('D1 · master: get/list completos (como antes)', () => {
    expect(get('inm_A', AUTH.master)).toBe(true);
    expect(get('inm_sin_prop', AUTH.master)).toBe(true);
    expect(list('inm_A', AUTH.master)).toBe(true);
    expect(list('inm_B', AUTH.master)).toBe(true);
  });
  it('D2 · perfil ADMINISTRADOR: lectura completa (ámbito reconocido por el modelo)', () => {
    expect(get('inm_B', AUTH.admin)).toBe(true);
    expect(list('inm_B', AUTH.admin)).toBe(true);
  });
  it('D3 · el ámbito administrativo NO se amplía a escritura: create/update/delete siguen reservados', () => {
    // create exige master o propietario con propietarioId propio:
    expect(permite('inmuebles', 'create', peticion({
      auth: AUTH.admin, docId: 'inm_nuevo', resource: null,
      requestResource: { id: 'inm_nuevo', propietarioId: 'prop_A', address: 'X' },
    }))).toBe(false);
    // delete sigue siendo sólo master:
    expect(permite('inmuebles', 'delete', peticion({
      auth: AUTH.admin, docId: 'inm_A', resource: INM_A, requestResource: null,
    }))).toBe(false);
    expect(permite('inmuebles', 'delete', peticion({
      auth: AUTH.master, docId: 'inm_A', resource: INM_A, requestResource: null,
    }))).toBe(true);
  });
  it('D4 · un propietario ordinario NO puede listar lo no asignado a nadie', () => {
    expect(list('inm_sin_prop', AUTH.propA)).toBe(false);
    expect(get('inm_sin_prop', AUTH.propA)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// E — NO REGRESIÓN (create/update/delete/tenant/master intactos)
// ---------------------------------------------------------------------------
describe('D2a · E — No regresión de escritura y tenants', () => {
  it('E1 · create: propietario sólo con propietarioId propio; master siempre', () => {
    expect(permite('inmuebles', 'create', peticion({
      auth: AUTH.propA, docId: 'inm_nuevo', resource: null,
      requestResource: { id: 'inm_nuevo', propietarioId: 'prop_A', address: 'X' },
    }))).toBe(true);
    expect(permite('inmuebles', 'create', peticion({
      auth: AUTH.propA, docId: 'inm_nuevo', resource: null,
      requestResource: { id: 'inm_nuevo', propietarioId: 'prop_B', address: 'X' },
    }))).toBe(false);
    expect(permite('inmuebles', 'create', peticion({
      auth: AUTH.master, docId: 'inm_nuevo', resource: null,
      requestResource: { id: 'inm_nuevo', propietarioId: 'prop_Z', address: 'X' },
    }))).toBe(true);
  });
  it('E2 · update: titular sí, ajeno no, master sí', () => {
    expect(permite('inmuebles', 'update', peticion({
      auth: AUTH.propA, docId: 'inm_A', resource: INM_A, requestResource: { ...INM_A, monthlyRent: 800 },
    }))).toBe(true);
    expect(permite('inmuebles', 'update', peticion({
      auth: AUTH.propA, docId: 'inm_B', resource: INM_B, requestResource: { ...INM_B, monthlyRent: 800 },
    }))).toBe(false);
    expect(permite('inmuebles', 'update', peticion({
      auth: AUTH.master, docId: 'inm_B', resource: INM_B, requestResource: { ...INM_B, monthlyRent: 800 },
    }))).toBe(true);
  });
  it('E3 · tenant con contrato activo: get permitido, list denegado (rama intacta)', () => {
    expect(get('inm_ct', AUTH.inq)).toBe(true);
    expect(list('inm_ct', AUTH.inq)).toBe(false);
    expect(get('inm_A', AUTH.inq)).toBe(false);
  });
  it('E4 · las reglas de contratos/gastos/propietarios NO cambian en D2a', () => {
    // Las condiciones de escritura/lectura de las otras colecciones siguen
    // siendo las custodiadas (se prueban a fondo en sus propias suites:
    // seguridad-firestore-tenant-contrato, fase14, login-admin-principal).
    const reglasContratos = EVAL.bloqueDe('contratos_formalizacion');
    expect(reglasContratos).toContain('allow list: if isMasterAdmin() || (isPropietarioRole() && contratoEsMio(resource.data))');
    const reglasGastos = EVAL.bloqueDe('gastos');
    expect(reglasGastos).toContain('allow list: if isMasterAdmin() || (isPropietarioRole() && gastoEsMio(resource.data))');
    const reglasPropietarios = EVAL.bloqueDe('propietarios');
    expect(reglasPropietarios.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// F — CACHÉ (FASE 4): snapshot vacío/acotado ≠ restauración hacia Firestore
// ---------------------------------------------------------------------------
describe('D2a · F — Caché: sin restauración automática cache -> Firestore', () => {
  it('F1 · snapshot vacío: sólo sincroniza estado; NO escribe caché ni Firestore', () => {
    const setInmuebles = vi.fn();
    const escribirCacheLectura = vi.fn();
    procesarSnapshotInmuebles([], { setInmuebles, escribirCacheLectura });
    expect(setInmuebles).toHaveBeenCalledTimes(1);
    expect(setInmuebles).toHaveBeenCalledWith([]);
    expect(escribirCacheLectura).not.toHaveBeenCalled();
  });
  it('F2 · snapshot nulo/undefined: mismo comportamiento seguro', () => {
    for (const data of [null, undefined]) {
      const setInmuebles = vi.fn();
      const escribirCacheLectura = vi.fn();
      procesarSnapshotInmuebles(data, { setInmuebles, escribirCacheLectura });
      expect(setInmuebles).toHaveBeenCalledWith([]);
      expect(escribirCacheLectura).not.toHaveBeenCalled();
    }
  });
  it('F3 · snapshot con datos: estado y caché de lectura (dirección Firestore -> caché)', () => {
    const setInmuebles = vi.fn();
    const escribirCacheLectura = vi.fn();
    const items = [{ id: 'inm_A' }, { id: 'inm_B' }];
    procesarSnapshotInmuebles(items, { setInmuebles, escribirCacheLectura });
    expect(setInmuebles).toHaveBeenCalledWith(items);
    expect(escribirCacheLectura).toHaveBeenCalledWith(items);
  });
  it('F4 · el helper es estructuralmente incapaz de escribir en Firestore', () => {
    const fuente = readFileSync(resolve(RAIZ, 'src/lib/snapshotInmueblesCache.ts'), 'utf8');
    // Sin import del SDK ni de módulos con acceso a Firestore:
    expect(fuente).not.toMatch(/from\s+'firebase/);
    expect(fuente).not.toMatch(/saveInmuebleFirestore|setDoc|updateDoc|deleteDoc/);
  });
  it('F5 · App.tsx ya no contiene la restauración automática cache -> Firestore', () => {
    const app = readFileSync(resolve(RAIZ, 'src/App.tsx'), 'utf8');
    // El patrón eliminado por D2a (reescritura masiva desde el callback):
    expect(app).not.toContain('current.forEach((inm) => saveInmuebleFirestore(inm))');
    // Y el callback de inmuebles pasa por el helper auditado:
    expect(app).toContain('procesarSnapshotInmuebles(data');
  });
});
