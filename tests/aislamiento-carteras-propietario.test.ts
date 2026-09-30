/**
 * BLOQUE 1 · AISLAMIENTO REAL DE CARTERAS — `match /inmuebles/{inmuebleId}`
 * ---------------------------------------------------------------------------
 * METODOLOGÍA: en este entorno NO hay emulador de Firebase (sin `firebase-tools`
 * ni JRE), así que las reglas se evalúan con el intérprete del subconjunto del
 * lenguaje de reglas que usa `firestore.rules`
 * (tests/helpers/evaluadorReglasFirestore.ts): parsea el TEXTO REAL del fichero
 * y decide cada operación con un contexto sintético (auth, documentos,
 * existente/entrante), reproduciendo la semántica documentada (v2, OR de
 * bloques, ERROR como tercer valor booleano). NO es el motor de Google: la
 * validación en emulador/proyecto queda PENDIENTE y se declara.
 *
 * ESCENARIO E2E de la orden (versión aplicable a reglas):
 *   · A crea INMUEBLE 1 (A50/B30/C20) e INMUEBLE 2 (A100).
 *   · B entra y ve SÓLO lo autorizado: INMUEBLE 1, nunca INMUEBLE 2.
 *   · C (titular sin relación) no lee nada de A ni de B.
 *   · El borrado físico NO está al alcance del propietario (BLOQUE 2 lo
 *     sustituirá por baja patrimonial).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decidir, parsearReglas, type ContextoPeticion } from './helpers/evaluadorReglasFirestore';

const REGLAS = parsearReglas(readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'));

/* ------------------------------------------------------------------ */
/* Estado sintético de Firestore                                        */
/* ------------------------------------------------------------------ */

const INM_1 = {
  id: 'inm-1',
  direccion: 'Calle Uno 1',
  propietarioId: 'prop-A',
  propietarioPrincipalId: 'prop-A',
  propietarioSecundarioId: 'prop-B',
  titularesIds: ['prop-A', 'prop-B', 'prop-C'],
};
const INM_2 = {
  id: 'inm-2',
  direccion: 'Calle Dos 2',
  propietarioId: 'prop-A',
  propietarioPrincipalId: 'prop-A',
  titularesIds: ['prop-A'],
};
const INM_B = {
  id: 'inm-B',
  direccion: 'Calle B 3',
  propietarioId: 'prop-B',
  propietarioPrincipalId: 'prop-B',
  titularesIds: ['prop-B'],
};

const FIRESTORE: ContextoPeticion['firestore'] = {
  'usuarios/uid_prop_A': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop-A', authUid: 'uid_prop_A' },
  'usuarios/uid_prop_B': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop-B', authUid: 'uid_prop_B' },
  'usuarios/uid_prop_C': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop-C', authUid: 'uid_prop_C' },
  'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', propietarioId: '', authUid: 'uid_admin' },
  'usuarios/uid_inq': { tipoPerfil: 'INQUILINO', estado: 'ACTIVO', contratoIds: ['ct-1'], authUid: 'uid_inq' },

  'usuarios_auth/uid_prop_A': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop-A', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_prop_B': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop-B', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_prop_C': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop-C', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', propietarioId: '', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_inq': { tipoPerfil: 'INQUILINO', estado: 'ACTIVO', propietarioId: '', profesionalId: '', inmuebleIds: [] },

  'inmuebles/inm-1': INM_1,
  'inmuebles/inm-2': INM_2,
  'inmuebles/inm-B': INM_B,
};

const AUTH = {
  propA: { uid: 'uid_prop_A', token: { email: 'prop-a@test.local' } },
  propB: { uid: 'uid_prop_B', token: { email: 'prop-b@test.local' } },
  propC: { uid: 'uid_prop_C', token: { email: 'prop-c@test.local' } },
  admin: { uid: 'uid_admin', token: { email: 'admin@test.local' } },
  inq: { uid: 'uid_inq', token: { email: 'inq@test.local' } },
  master: { uid: 'uid_master', token: { email: 'sarqsan2@gmail.com' } },
  anonimo: null,
};

type IdInm = 'inm-1' | 'inm-2' | 'inm-B';

const doc = (id: IdInm) => FIRESTORE[`inmuebles/${id}`];

function get(id: IdInm, auth: ContextoPeticion['auth']) {
  return decidir(REGLAS, `inmuebles/${id}`, 'get', { auth, firestore: FIRESTORE, existente: doc(id) });
}
function list(id: IdInm, auth: ContextoPeticion['auth']) {
  return decidir(REGLAS, `inmuebles/${id}`, 'list', { auth, firestore: FIRESTORE, existente: doc(id) });
}
function crear(entrante: Record<string, unknown>, auth: ContextoPeticion['auth']) {
  return decidir(REGLAS, 'inmuebles/inm-nuevo', 'create', {
    auth,
    firestore: FIRESTORE,
    existente: null,
    entrante,
  });
}
function actualizar(id: IdInm, entrante: Record<string, unknown>, auth: ContextoPeticion['auth']) {
  return decidir(REGLAS, `inmuebles/${id}`, 'update', {
    auth,
    firestore: FIRESTORE,
    existente: doc(id),
    entrante,
  });
}
function borrar(id: IdInm, auth: ContextoPeticion['auth']) {
  return decidir(REGLAS, `inmuebles/${id}`, 'delete', { auth, firestore: FIRESTORE, existente: doc(id) });
}

const permitido = (d: ReturnType<typeof decidir>) => d.permitido === true;
const denegado = (d: ReturnType<typeof decidir>) => d.permitido !== true;

/* ------------------------------------------------------------------ */

describe('BLOQUE 1 · Reglas: A sólo ve A, B sólo ve B, cotitular ve lo suyo', () => {
  it('A lee SU inmueble (titular principal)', () => {
    expect(permitido(get('inm-2', AUTH.propA))).toBe(true);
  });

  it('A NO lee el inmueble exclusivo de B', () => {
    expect(denegado(get('inm-B', AUTH.propA))).toBe(true);
  });

  it('B NO lee el inmueble exclusivo de A', () => {
    expect(denegado(get('inm-2', AUTH.propB))).toBe(true);
  });

  it('B (cotitular) SÍ lee el inmueble compartido con A', () => {
    expect(permitido(get('inm-1', AUTH.propB))).toBe(true);
  });

  it('A (titular principal) SÍ lee el inmueble compartido', () => {
    expect(permitido(get('inm-1', AUTH.propA))).toBe(true);
  });

  it('C (3er cotitular de inm-1) SÍ lee inm-1: es exactamente lo exigido', () => {
    // inm-1 = A 50 % / B 30 % / C 20 % (escenario E2E de la orden).
    expect(permitido(get('inm-1', AUTH.propC))).toBe(true);
  });

  it('C NO lee los inmuebles en los que no participa', () => {
    expect(denegado(get('inm-2', AUTH.propC))).toBe(true); // exclusivo de A
    expect(denegado(get('inm-B', AUTH.propC))).toBe(true); // exclusivo de B
  });

  it('un titular con inmuebles no lee la cartera ajena ni por delegación vacía', () => {
    expect(denegado(list('inm-2', AUTH.propC))).toBe(true);
    expect(denegado(list('inm-B', AUTH.propC))).toBe(true);
  });

  it('list: la regla depende del documento → una consulta sin filtro NO la satisface', () => {
    // Con el documento de A la regla se cumple (la consulta iría filtrada por A).
    expect(permitido(list('inm-2', AUTH.propA))).toBe(true);
    // Con el documento de B, A no cumple la condición: el resultado de la
    // consulta filtrada por A nunca podría contener este documento.
    expect(denegado(list('inm-B', AUTH.propA))).toBe(true);
    expect(denegado(list('inm-2', AUTH.propB))).toBe(true);
    expect(permitido(list('inm-1', AUTH.propB))).toBe(true);
  });

  it('administración (perfil ADMINISTRADOR) conserva el acceso completo', () => {
    expect(permitido(list('inm-B', AUTH.admin))).toBe(true);
    expect(permitido(get('inm-B', AUTH.admin))).toBe(true);
  });

  it('sin sesión, denegado', () => {
    expect(denegado(get('inm-1', AUTH.anonimo))).toBe(true);
    expect(denegado(list('inm-1', AUTH.anonimo))).toBe(true);
  });
});

describe('BLOQUE 1 · Reglas: escrituras sin escalada de titularidad', () => {
  it('A crea un inmueble a su nombre: permitido', () => {
    expect(permitido(crear({ id: 'inm-nuevo', propietarioId: 'prop-A', propietarioPrincipalId: 'prop-A', titularesIds: ['prop-A'] }, AUTH.propA))).toBe(true);
  });

  it('A NO crea un inmueble a nombre de B', () => {
    expect(denegado(crear({ id: 'inm-nuevo', propietarioId: 'prop-B', propietarioPrincipalId: 'prop-B' }, AUTH.propA))).toBe(true);
  });

  it('A NO cuela el inmueble en otra cartera mezclando campos', () => {
    // Antipatrón anterior: bastaba con que UNO de los dos campos coincidiera.
    expect(denegado(crear({ id: 'inm-nuevo', propietarioId: 'prop-B', propietarioPrincipalId: 'prop-A' }, AUTH.propA))).toBe(true);
    expect(denegado(crear({ id: 'inm-nuevo', propietarioId: 'prop-A', propietarioPrincipalId: 'prop-B' }, AUTH.propA))).toBe(true);
  });

  it('A edita SU inmueble sin cambiar de titular: permitido', () => {
    expect(permitido(actualizar('inm-2', { ...INM_2, direccion: 'Calle Dos 2 bis' }, AUTH.propA))).toBe(true);
  });

  it('A NO transfiere SU inmueble a otro titular', () => {
    expect(denegado(actualizar('inm-2', { ...INM_2, propietarioId: 'prop-B' }, AUTH.propA))).toBe(true);
  });

  it('B (cotitular) no reescribe el inmueble compartido de A', () => {
    expect(denegado(actualizar('inm-1', { ...INM_1, direccion: 'Manipulada' }, AUTH.propB))).toBe(true);
  });

  it('el borrado físico NO está al alcance del propietario', () => {
    expect(denegado(borrar('inm-2', AUTH.propA))).toBe(true);
    expect(denegado(borrar('inm-B', AUTH.propB))).toBe(true);
    // Administrador principal: se mantiene (BLOQUE 2 lo sustituirá por la baja
    // patrimonial como mecanismo normal, sin borrado).
    expect(permitido(borrar('inm-1', AUTH.master))).toBe(true);
  });

  it('el inquilino no accede a la ficha de un inmueble que no es el suyo', () => {
    expect(denegado(get('inm-2', AUTH.inq))).toBe(true);
  });
});
