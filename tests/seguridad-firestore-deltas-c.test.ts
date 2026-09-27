/**
 * FASE 8 — Defensas de Rules adaptadas de Arena C (titularidad y escrituras públicas).
 * ---------------------------------------------------------------------------
 * METODOLOGÍA: igual que las suites `seguridad-firestore-*`: se evalúa el
 * TEXTO REAL de `firestore.rules` con el harness compartido
 * `tests/harness/firestoreRulesEval.ts` (fail-loud; validación contra el motor
 * de Google —emulador/proyecto— PENDIENTE, NV).
 *
 * Fuente C: `firestore.rules` del head 1686b8e (congelación de
 * propietarioPrincipalId/SecundarioId + validación de formas en invitaciones,
 * slots_visita y solicitudes_documentacion).
 *
 * Contrato probado aquí:
 *  A — INMUEBLES: el titular edita y puede añadir/retocar la titularidad
 *      mientras SIGA siendo titular; la transmisión total, el vaciado y los
 *      cambios de titularidad por no-titulares (autorizado explícito, gestor
 *      carterasE) se deniegan. Sin equivalencia entre propietarioId,
 *      propietarioPrincipalId y propietarioSecundarioId (el segundo NO
 *      autoriza). Master intacto.
 *  B/C/D — INVITACIONES / SLOTS / SOLICITUDES_DOC: el autenticado conserva el
 *      acceso; el anónimo queda acotado a las formas del flujo público
 *      (campos permitidos + tipos mínimos). Lecturas y borrados sin cambios.
 *
 * LÍMITE HONESTO: la validación de campos NO es aislamiento completo — un
 * anónimo puede seguir tocando los campos permitidos de CUALQUIER documento
 * de estas colecciones (se fija con tests para no afirmarlo jamás).
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
const INM_A = { id: 'inm_A', propietarioId: 'prop_A', address: 'Calle A 1' };
const INM_B = { id: 'inm_B', propietarioId: 'prop_B', address: 'Calle B 2' };
/** Copropiedad: titular prop_B, principal prop_A, segunda prop_S. */
const INM_C = {
  id: 'inm_C',
  propietarioId: 'prop_B',
  propietarioPrincipalId: 'prop_A',
  propietarioSecundarioId: 'prop_S',
  address: 'Calle C 3',
};
/** Cartera del gestor (carterasE). */
const INM_X = { id: 'inm_X', propietarioId: 'prop_X', address: 'Cartera X 1' };

const INV = {
  id: 'inv-1',
  token: 'vst-1',
  candidateId: 'cand-1',
  inmuebleId: 'inm_A',
  status: 'ENVIADO',
  inmueblePrecio: 900,
};
const SLOT = {
  id: 'slot-1',
  inmuebleId: 'inm_A',
  fecha: '2026-09-30',
  horaInicio: '10:00',
  horaFin: '10:30',
  disponible: true,
};
const DOC = {
  id: 'doc-1',
  candidatoId: 'cand-1',
  inmuebleId: 'inm_A',
  token: 'doc-1',
  documentos: [],
  estado: 'SOLICITADA',
  historial: [],
};

const FIRESTORE: Peticion['db'] = {
  'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_admin' },
  'usuarios_auth/uid_propA': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_A', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_propB': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_B', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_propS': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_S', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_propAsig': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_D', profesionalId: '', inmuebleIds: ['inm_B'] },
  'usuarios_auth/uid_gestorE': {
    uid: 'uid_gestorE', usuarioId: 'usr_gestor', email: 'gestor@test.local', tipoPerfil: 'PROFESIONAL',
    estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [],
    carterasL: ['prop_X'], carterasE: ['prop_X'],
  },
  'inmuebles/inm_A': INM_A,
  'inmuebles/inm_B': INM_B,
  'inmuebles/inm_C': INM_C,
  'inmuebles/inm_X': INM_X,
};

const AUTH = {
  propA: { uid: 'uid_propA', token: { email: 'prop-a@test.local' } },
  propB: { uid: 'uid_propB', token: { email: 'prop-b@test.local' } },
  propS: { uid: 'uid_propS', token: { email: 'prop-s@test.local' } },
  propAsig: { uid: 'uid_propAsig', token: { email: 'prop-asig@test.local' } },
  gestorE: { uid: 'uid_gestorE', token: { email: 'gestor@test.local' } },
  firmado: { uid: 'uid_sin_ficha', token: { email: 'nadie@test.local' } },
  master: { uid: 'uid_master', token: { email: EMAIL_ADMIN } },
  anon: null,
};

function peticion(over: Partial<Peticion>): Peticion {
  return { auth: null, db: FIRESTORE, resource: null, requestResource: null, docId: 'x', ...over };
}
const update = (coleccion: string, auth: Peticion['auth'], docId: string, resource: Record<string, unknown>, requestResource: Record<string, unknown>) =>
  permite(coleccion, 'update', peticion({ auth, docId, resource, requestResource }));
const create = (coleccion: string, auth: Peticion['auth'], docId: string, requestResource: Record<string, unknown>) =>
  permite(coleccion, 'create', peticion({ auth, docId, resource: null, requestResource }));

// ---------------------------------------------------------------------------
// A — INMUEBLES: titularidad (delta C adaptado a los 3 campos de main)
// ---------------------------------------------------------------------------
describe('deltas-C · A — inmuebles: titularidad', () => {
  it('A1 · titular edita campos no-titulares (sin regresión)', () => {
    expect(update('inmuebles', AUTH.propA, 'inm_A', INM_A, { ...INM_A, monthlyRent: 800 })).toBe(true);
  });

  it('A2 · titular añade segundo propietario manteniéndose titular → permitido', () => {
    expect(
      update('inmuebles', AUTH.propA, 'inm_A', INM_A, {
        ...INM_A,
        propietarioPrincipalId: 'prop_A',
        propietarioSecundarioId: 'prop_S',
      })
    ).toBe(true);
  });

  it('A3 · titular NO puede transmitirlo todo a otro (requiere flujo master)', () => {
    expect(
      update('inmuebles', AUTH.propA, 'inm_A', INM_A, { ...INM_A, propietarioId: 'prop_B' })
    ).toBe(false);
  });

  it('A4 · titular NO puede vaciar la titularidad (sin huérfanos silenciosos)', () => {
    expect(update('inmuebles', AUTH.propA, 'inm_A', INM_A, { id: 'inm_A', address: 'Calle A 1' })).toBe(
      false
    );
  });

  it('A5 · copropiedad: el principal edita, pero NO se desvincula solo', () => {
    expect(update('inmuebles', AUTH.propA, 'inm_C', INM_C, { ...INM_C, monthlyRent: 1 })).toBe(true);
    expect(
      update('inmuebles', AUTH.propA, 'inm_C', INM_C, {
        ...INM_C,
        propietarioId: 'prop_B',
        propietarioPrincipalId: 'prop_B',
      })
    ).toBe(false);
  });

  it('A6 · el segundo propietario NO autoriza (sin equivalencia entre campos)', () => {
    expect(update('inmuebles', AUTH.propS, 'inm_C', INM_C, { ...INM_C, monthlyRent: 1 })).toBe(false);
  });

  it('A7 · autorizado explícito no titular edita otros campos (sin regresión)', () => {
    expect(update('inmuebles', AUTH.propAsig, 'inm_B', INM_B, { ...INM_B, monthlyRent: 1 })).toBe(true);
  });

  it('A8 · autorizado explícito NO altera la titularidad (nuevo)', () => {
    expect(
      update('inmuebles', AUTH.propAsig, 'inm_B', INM_B, { ...INM_B, propietarioId: 'prop_D' })
    ).toBe(false);
  });

  it('A9 · gestor carterasE edita otros campos (sin regresión)', () => {
    expect(update('inmuebles', AUTH.gestorE, 'inm_X', INM_X, { ...INM_X, monthlyRent: 1 })).toBe(true);
  });

  it('A10 · gestor carterasE NO altera la titularidad (nuevo)', () => {
    expect(
      update('inmuebles', AUTH.gestorE, 'inm_X', INM_X, {
        ...INM_X,
        propietarioSecundarioId: 'prop_Z',
      })
    ).toBe(false);
  });

  it('A11 · master conserva control total + anónimo denegado', () => {
    expect(
      update('inmuebles', AUTH.master, 'inm_A', INM_A, { ...INM_A, propietarioId: 'prop_Z' })
    ).toBe(true);
    expect(update('inmuebles', AUTH.anon, 'inm_A', INM_A, { ...INM_A, monthlyRent: 1 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B — INVITACIONES: formas del flujo público
// ---------------------------------------------------------------------------
describe('deltas-C · B — invitaciones', () => {
  it('B1 · lectura pública y borrado intactos', () => {
    expect(permite('invitaciones', 'get', peticion({ auth: AUTH.anon, docId: 'inv-1', resource: INV }))).toBe(true);
    expect(permite('invitaciones', 'delete', peticion({ auth: AUTH.anon, docId: 'inv-1', resource: INV }))).toBe(false);
    expect(permite('invitaciones', 'delete', peticion({ auth: AUTH.firmado, docId: 'inv-1', resource: INV }))).toBe(true);
  });

  it('B2 · autenticado conserva create/update libres', () => {
    expect(create('invitaciones', AUTH.firmado, 'inv-x', { cualquier: 'cosa' })).toBe(true);
    expect(update('invitaciones', AUTH.firmado, 'inv-1', INV, { ...INV, inmueblePrecio: 1 })).toBe(true);
  });

  it('B3 · anónimo crea la forma válida (reserva/captación mínima)', () => {
    expect(
      create('invitaciones', AUTH.anon, 'inv-x', { inmuebleId: 'inm_A', status: 'ENVIADO', candidateId: 'c-1' })
    ).toBe(true);
    expect(
      create('invitaciones', AUTH.anon, 'inv-x', { inmuebleId: 'inm_A', status: 'ENVIADO', candidatoId: 'c-1' })
    ).toBe(true);
  });

  it('B4 · anónimo NO crea formas inválidas', () => {
    expect(create('invitaciones', AUTH.anon, 'inv-x', { inmuebleId: 'inm_A', candidateId: 'c-1' })).toBe(false);
    expect(create('invitaciones', AUTH.anon, 'inv-x', { inmuebleId: 'inm_A', status: 'ENVIADO' })).toBe(false);
    expect(
      create('invitaciones', AUTH.anon, 'inv-x', { inmuebleId: 'inm_A', status: 7, candidateId: 'c-1' })
    ).toBe(false);
  });

  it('B5 · anónimo reserva (status/bookedAt/reserva) y apertura (status/openedAt)', () => {
    expect(
      update('invitaciones', AUTH.anon, 'inv-1', INV, {
        ...INV,
        status: 'HORARIO RESERVADO',
        bookedAt: '2026-09-27T12:00:00.000Z',
        reserva: { slotId: 'slot-1' },
      })
    ).toBe(true);
    expect(update('invitaciones', AUTH.anon, 'inv-1', INV, { ...INV, status: 'ABIERTO', openedAt: '2026-09-27' })).toBe(true);
  });

  it('B6 · anónimo NO toca campos ajenos ni rompe tipos', () => {
    expect(update('invitaciones', AUTH.anon, 'inv-1', INV, { ...INV, inmueblePrecio: 1 })).toBe(false);
    expect(update('invitaciones', AUTH.anon, 'inv-1', INV, { ...INV, status: 7 })).toBe(false);
    expect(update('invitaciones', AUTH.anon, 'inv-1', INV, { ...INV, status: 'X', reserva: 'no-map' })).toBe(false);
  });

  it('B7 · LÍMITE: la forma válida anónima vale para CUALQUIER documento (no es aislamiento)', () => {
    expect(update('invitaciones', AUTH.anon, 'inv-1', INV, { ...INV, status: 'ABIERTO' })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C — SLOTS_VISITA: formas de la reserva atómica
// ---------------------------------------------------------------------------
describe('deltas-C · C — slots_visita', () => {
  it('C1 · lectura pública y borrado intactos', () => {
    expect(permite('slots_visita', 'get', peticion({ auth: AUTH.anon, docId: 'slot-1', resource: SLOT }))).toBe(true);
    expect(permite('slots_visita', 'delete', peticion({ auth: AUTH.anon, docId: 'slot-1', resource: SLOT }))).toBe(false);
    expect(permite('slots_visita', 'delete', peticion({ auth: AUTH.firmado, docId: 'slot-1', resource: SLOT }))).toBe(true);
  });

  it('C2 · autenticado conserva create/update libres', () => {
    expect(create('slots_visita', AUTH.firmado, 'slot-x', { cualquier: 'cosa' })).toBe(true);
    expect(update('slots_visita', AUTH.firmado, 'slot-1', SLOT, { ...SLOT, fecha: '2026-10-01' })).toBe(true);
  });

  it('C3 · anónimo crea la agenda mínima y NO formas inválidas', () => {
    expect(
      create('slots_visita', AUTH.anon, 'slot-x', { inmuebleId: 'inm_A', fecha: '2026-10-01', horaInicio: '10:00', horaFin: '10:30' })
    ).toBe(true);
    expect(create('slots_visita', AUTH.anon, 'slot-x', { inmuebleId: 'inm_A', fecha: '2026-10-01' })).toBe(false);
    expect(
      create('slots_visita', AUTH.anon, 'slot-x', { inmuebleId: 'inm_A', fecha: 20261001, horaInicio: '10:00', horaFin: '10:30' })
    ).toBe(false);
  });

  it('C4 · anónimo reserva (disponible + vínculo) y cancela (disponible)', () => {
    expect(
      update('slots_visita', AUTH.anon, 'slot-1', SLOT, {
        ...SLOT,
        disponible: false,
        reservaCandidateId: 'cand-1',
        reservaCandidateNombre: 'N',
        reservaInvitationId: 'inv-1',
      })
    ).toBe(true);
    expect(update('slots_visita', AUTH.anon, 'slot-1', { ...SLOT, disponible: false }, { ...SLOT, disponible: true })).toBe(true);
  });

  it('C5 · anónimo NO toca campos ajenos ni rompe tipos', () => {
    expect(update('slots_visita', AUTH.anon, 'slot-1', SLOT, { ...SLOT, fecha: '2026-10-02' })).toBe(false);
    expect(update('slots_visita', AUTH.anon, 'slot-1', SLOT, { ...SLOT, disponible: 'si' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D — SOLICITUDES_DOCUMENTACION: formas de la aportación
// ---------------------------------------------------------------------------
describe('deltas-C · D — solicitudes_documentacion', () => {
  it('D1 · lectura pública y borrado intactos', () => {
    expect(permite('solicitudes_documentacion', 'get', peticion({ auth: AUTH.anon, docId: 'doc-1', resource: DOC }))).toBe(true);
    expect(permite('solicitudes_documentacion', 'delete', peticion({ auth: AUTH.anon, docId: 'doc-1', resource: DOC }))).toBe(false);
    expect(permite('solicitudes_documentacion', 'delete', peticion({ auth: AUTH.firmado, docId: 'doc-1', resource: DOC }))).toBe(true);
  });

  it('D2 · autenticado conserva create/update libres', () => {
    expect(create('solicitudes_documentacion', AUTH.firmado, 'doc-x', { cualquier: 'cosa' })).toBe(true);
    expect(update('solicitudes_documentacion', AUTH.firmado, 'doc-1', DOC, { ...DOC, estado: 'X', extra: 1 })).toBe(true);
  });

  it('D3 · anónimo crea con token (main) o tokenDoc (C), NO sin token', () => {
    expect(create('solicitudes_documentacion', AUTH.anon, 'doc-x', { candidatoId: 'c-1', inmuebleId: 'inm_A', token: 't' })).toBe(true);
    expect(create('solicitudes_documentacion', AUTH.anon, 'doc-x', { candidatoId: 'c-1', inmuebleId: 'inm_A', tokenDoc: 't' })).toBe(true);
    expect(create('solicitudes_documentacion', AUTH.anon, 'doc-x', { candidatoId: 'c-1', inmuebleId: 'inm_A' })).toBe(false);
  });

  it('D4 · anónimo aporta como el portal de main (documentos/estado/actividad/historial)', () => {
    expect(
      update('solicitudes_documentacion', AUTH.anon, 'doc-1', DOC, {
        ...DOC,
        documentos: [{ id: 'd1' }],
        estado: 'PARCIALMENTE_APORTADA',
        fechaUltimaActividad: '2026-09-27T12:00:00.000Z',
        historial: [{ id: 'h1' }],
      })
    ).toBe(true);
    expect(update('solicitudes_documentacion', AUTH.anon, 'doc-1', DOC, { ...DOC, estado: 'COMPLETADA' })).toBe(true);
  });

  it('D5 · anónimo NO toca campos ajenos ni rompe tipos', () => {
    expect(update('solicitudes_documentacion', AUTH.anon, 'doc-1', DOC, { ...DOC, inmueblePrecio: 1 })).toBe(false);
    expect(update('solicitudes_documentacion', AUTH.anon, 'doc-1', DOC, { ...DOC, estado: 7 })).toBe(false);
  });
});
