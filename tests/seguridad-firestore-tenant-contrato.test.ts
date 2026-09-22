/**
 * PORTAL DEL INQUILINO · D-1 — lectura del contrato propio (`contratos_formalizacion`)
 * ---------------------------------------------------------------------------
 * METODOLOGÍA: no hay emulador de Firebase en este entorno. Las reglas se
 * evalúan con un intérprete propio del subconjunto del lenguaje que usa
 * `firestore.rules` (tests/helpers/evaluadorReglasFirestore.ts): parsea el
 * TEXTO REAL del fichero y decide cada operación con un contexto sintético
 * (auth, documentos Firestore, documento existente/entrante), reproduciendo la
 * semántica documentada (v2, OR de bloques, `read`/`write` expandidos, ERROR
 * como tercer valor booleano). No es el motor de Google: la validación en
 * emulador/proyecto queda PENDIENTE (NV).
 *
 * Casos exigidos por la orden D-1:
 *  1. INQUILINO A → contrato A: get permitido.
 *  2. INQUILINO A → contrato B: get denegado.
 *  3. INQUILINO A → list de contratos: denegado.
 *  4. Propietario autorizado → contrato propio: get sigue permitido.
 *  5. Usuario no autorizado → contrato: denegado.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decidir, parsearReglas, type ContextoPeticion } from './helpers/evaluadorReglasFirestore';

const REGLAS = parsearReglas(readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'));

const CT_A = { id: 'ct_A', propietarioId: 'prop_A', inmuebleId: 'inm_A', rentaMensual: 700, incidenciaIds: [], mensajeIds: [] };
const CT_B = { id: 'ct_B', propietarioId: 'prop_B', inmuebleId: 'inm_B', rentaMensual: 900, incidenciaIds: [], mensajeIds: [] };

/** Estado sintético de Firestore: dos inquilinos, dos propietarios, un profesional. */
const FIRESTORE: ContextoPeticion['firestore'] = {
  'usuarios/uid_inq_A': { tipoPerfil: 'INQUILINO', estado: 'ACTIVO', contratoIds: ['ct_A'], authUid: 'uid_inq_A' },
  'usuarios/uid_inq_B': { tipoPerfil: 'INQUILINO', estado: 'ACTIVO', contratoIds: ['ct_B'], authUid: 'uid_inq_B' },
  'usuarios/uid_prop_A': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_A', authUid: 'uid_prop_A' },
  'usuarios/uid_prop_B': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_B', authUid: 'uid_prop_B' },
  'usuarios/uid_prof': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', profesionalId: 'prof_1', authUid: 'uid_prof' },
  'usuarios_auth/uid_prop_A': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_A', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_prop_B': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_B', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_prof': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [] },
  'contratos_formalizacion/ct_A': CT_A,
  'contratos_formalizacion/ct_B': CT_B,
};

const AUTH = {
  inqA: { uid: 'uid_inq_A', token: { email: 'inq-a@test.local' } },
  inqB: { uid: 'uid_inq_B', token: { email: 'inq-b@test.local' } },
  propA: { uid: 'uid_prop_A', token: { email: 'prop-a@test.local' } },
  propB: { uid: 'uid_prop_B', token: { email: 'prop-b@test.local' } },
  prof: { uid: 'uid_prof', token: { email: 'prof@test.local' } },
  /** Autenticado en Firebase pero sin ficha `usuarios/` ni espejo `usuarios_auth/`. */
  desconocido: { uid: 'uid_sin_ficha', token: { email: 'nadie@test.local' } },
  master: { uid: 'uid_master', token: { email: 'sarqsan2@gmail.com' } },
};

function get(ruta: 'ct_A' | 'ct_B', auth: ContextoPeticion['auth']) {
  return decidir(REGLAS, `contratos_formalizacion/${ruta}`, 'get', { auth, firestore: FIRESTORE, existente: FIRESTORE[`contratos_formalizacion/${ruta}`] });
}
function list(ruta: 'ct_A' | 'ct_B', auth: ContextoPeticion['auth']) {
  return decidir(REGLAS, `contratos_formalizacion/${ruta}`, 'list', { auth, firestore: FIRESTORE, existente: FIRESTORE[`contratos_formalizacion/${ruta}`] });
}

describe('D-1 · contratos_formalizacion · lectura del contrato propio por el inquilino', () => {
  it('Caso 1 — INQUILINO A → contrato A: get PERMITIDO', () => {
    const d = get('ct_A', AUTH.inqA);
    expect(d.permitido).toBe(true);
    expect(d.concedidoPor).toEqual(['/databases/{database}/documents/contratos_formalizacion/{contratoId}']);
  });

  it('Caso 2 — INQUILINO A → contrato B (de otro inquilino/propietario): get DENEGADO', () => {
    expect(get('ct_B', AUTH.inqA).permitido).toBe(false);
    // simetría: el inquilino B tampoco lee el contrato A
    expect(get('ct_A', AUTH.inqB).permitido).toBe(false);
  });

  it('Caso 3 — INQUILINO A → list de contratos: DENEGADO (incluso sobre su propio contrato)', () => {
    expect(list('ct_A', AUTH.inqA).permitido).toBe(false);
    expect(list('ct_B', AUTH.inqA).permitido).toBe(false);
  });

  it('Caso 4 — propietario autorizado → contrato propio: get y list SIGUEN PERMITIDOS; contrato ajeno DENEGADO', () => {
    expect(get('ct_A', AUTH.propA).permitido).toBe(true);
    expect(list('ct_A', AUTH.propA).permitido).toBe(true);
    expect(get('ct_B', AUTH.propA).permitido).toBe(false);
    expect(list('ct_B', AUTH.propA).permitido).toBe(false);
    // el master conserva su acceso
    expect(get('ct_B', AUTH.master).permitido).toBe(true);
  });

  it('Caso 5 — usuario no autorizado → contrato: DENEGADO (anónimo, profesional, autenticado sin ficha)', () => {
    expect(get('ct_A', null).permitido).toBe(false);
    expect(list('ct_A', null).permitido).toBe(false);
    expect(get('ct_A', AUTH.prof).permitido).toBe(false);
    expect(get('ct_A', AUTH.desconocido).permitido).toBe(false);
  });

  it('Sin elevación: un inquilino cuyo `contratoIds` no incluye el contrato no puede leerlo aunque el contrato apunte a su UID', () => {
    const fs = {
      ...FIRESTORE,
      'usuarios/uid_inq_A': { tipoPerfil: 'INQUILINO', estado: 'ACTIVO', contratoIds: [], authUid: 'uid_inq_A' },
      'contratos_formalizacion/ct_A': { ...CT_A, inquilinoUid: 'uid_inq_A' },
    };
    const d = decidir(REGLAS, 'contratos_formalizacion/ct_A', 'get', { auth: AUTH.inqA, firestore: fs, existente: fs['contratos_formalizacion/ct_A'] });
    expect(d.permitido).toBe(false);
  });

  it('Sin ampliación de escritura: el inquilino sigue sin poder modificar campos del contrato distintos de los índices', () => {
    const base = { auth: AUTH.inqA, firestore: FIRESTORE, existente: CT_A };
    // renta → denegado
    expect(decidir(REGLAS, 'contratos_formalizacion/ct_A', 'update', { ...base, entrante: { ...CT_A, rentaMensual: 1 } }).permitido).toBe(false);
    // propietarioId → denegado
    expect(decidir(REGLAS, 'contratos_formalizacion/ct_A', 'update', { ...base, entrante: { ...CT_A, propietarioId: 'prop_B' } }).permitido).toBe(false);
    // delete → denegado
    expect(decidir(REGLAS, 'contratos_formalizacion/ct_A', 'delete', base).permitido).toBe(false);
    // create → denegado
    expect(decidir(REGLAS, 'contratos_formalizacion/ct_NUEVO', 'create', { auth: AUTH.inqA, firestore: FIRESTORE, existente: null, entrante: { ...CT_A, id: 'ct_NUEVO' } }).permitido).toBe(false);
  });
});
