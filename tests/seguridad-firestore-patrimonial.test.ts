/**
 * INC-06 — Seguridad Firestore de la persistencia patrimonial.
 * ---------------------------------------------------------------------------
 * METODOLOGÍA: igual que `seguridad-firestore-carteras.test.ts` — se evalúa el
 * TEXTO REAL de `firestore.rules` con el harness compartido (fail-loud; sin
 * emulador de Google en este entorno: validación contra emulador PENDIENTE).
 *
 * Contrato probado:
 *  · `registros_patrimoniales`: lectura para ámbito administrativo, titular y
 *    gestor con cartera gestionada (L ∪ E); creación solo para master, titular
 *    o gestor con carterasE y con la forma EXACTA del contrato persistido;
 *    update/delete SOLO master (historial sin edición retrospectiva).
 *  · `propietarios`: el gestor con carterasE puede actualizar ÚNICAMENTE el
 *    subobjeto `fichaPatrimonial`; carterasL (lectura histórica, S7) NO
 *    escribe; el gestor no crea propietarios (S3); el ámbito previo del
 *    titular y del master queda intacto.
 *  · `audit_logs` (integración, no reinvención): append-only para siempre.
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
// Estado sintético
// ---------------------------------------------------------------------------
const REGISTRO_VALIDO = {
  id: 'rp_1', propietarioId: 'prop_X', loteId: 'lote_pat_1', indiceOrigen: 0,
  datosOrigen: { nombre: 'Piso' }, estadoDatos: 'COMPLETO', camposFaltantes: [],
  politicaId: 'ficha-patrimonial-base-v1', decision: 'CREARIA', incidencias: [],
  procedencia: { sistema: 'TEST', origenId: null, fuente: null, loteId: 'lote_pat_1' },
  creadaEn: '2026-09-26T00:00:00.000Z', creadaPor: 'usr_master',
};

const FIRESTORE: Peticion['db'] = {
  'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_admin' },
  'usuarios/uid_titularX': {
    id: 'usr_titularX', authUid: 'uid_titularX', email: 'x@test.local', tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO', roles: [], propietarioId: 'prop_X', inmuebleIds: [],
  },
  'usuarios/uid_gestorE': {
    id: 'usr_gestorE', authUid: 'uid_gestorE', email: 'ge@test.local', tipoPerfil: 'PROFESIONAL',
    estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [],
  },
  'usuarios/uid_gestorL': {
    id: 'usr_gestorL', authUid: 'uid_gestorL', email: 'gl@test.local', tipoPerfil: 'PROFESIONAL',
    estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof_2', inmuebleIds: [],
  },
  'usuarios/uid_ajeno': {
    id: 'usr_ajeno', authUid: 'uid_ajeno', email: 'aj@test.local', tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO', roles: [], propietarioId: 'prop_Y', inmuebleIds: [],
  },
  'usuarios_auth/uid_admin': {
    uid: 'uid_admin', usuarioId: 'uid_admin', email: EMAIL_ADMIN, tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: '', inmuebleIds: [],
  },
  'usuarios_auth/uid_titularX': {
    uid: 'uid_titularX', usuarioId: 'usr_titularX', email: 'x@test.local', tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO', roles: [], propietarioId: 'prop_X', profesionalId: '', inmuebleIds: [],
  },
  // Gestor con cartera de ESCRITURA sobre prop_X.
  'usuarios_auth/uid_gestorE': {
    uid: 'uid_gestorE', usuarioId: 'usr_gestorE', email: 'ge@test.local', tipoPerfil: 'PROFESIONAL',
    estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [],
    carterasL: ['prop_X'], carterasE: ['prop_X'],
  },
  // Gestor con cartera de SOLO LECTURA (histórica) sobre prop_X.
  'usuarios_auth/uid_gestorL': {
    uid: 'uid_gestorL', usuarioId: 'usr_gestorL', email: 'gl@test.local', tipoPerfil: 'PROFESIONAL',
    estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof_2', inmuebleIds: [],
    carterasL: ['prop_X'], carterasE: [],
  },
  'usuarios_auth/uid_ajeno': {
    uid: 'uid_ajeno', usuarioId: 'usr_ajeno', email: 'aj@test.local', tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO', roles: [], propietarioId: 'prop_Y', profesionalId: '', inmuebleIds: [],
  },
};

function peticion(p: {
  uid: string | null;
  email?: string;
  resource?: Record<string, unknown> | null;
  requestResource?: Record<string, unknown> | null;
  docId: string;
}): Peticion {
  return {
    auth: p.uid === null ? null : { uid: p.uid, token: { email: p.email ?? 'u@test.local' } },
    db: FIRESTORE,
    resource: p.resource ?? null,
    requestResource: p.requestResource ?? null,
    docId: p.docId,
  };
}

const authMaster = { uid: 'uid_admin', email: EMAIL_ADMIN };

// ---------------------------------------------------------------------------
// registros_patrimoniales
// ---------------------------------------------------------------------------

describe('INC-06 · reglas de registros_patrimoniales', () => {
  const recurso = { ...REGISTRO_VALIDO };

  it('master: lectura, creación válida, update y delete', () => {
    expect(permite('registros_patrimoniales', 'get', peticion({ ...authMaster, resource: recurso, docId: 'rp_1' }))).toBe(true);
    expect(permite('registros_patrimoniales', 'create', peticion({ ...authMaster, requestResource: REGISTRO_VALIDO, docId: 'rp_1' }))).toBe(true);
    expect(permite('registros_patrimoniales', 'update', peticion({ ...authMaster, resource: recurso, requestResource: recurso, docId: 'rp_1' }))).toBe(true);
    expect(permite('registros_patrimoniales', 'delete', peticion({ ...authMaster, resource: recurso, docId: 'rp_1' }))).toBe(true);
  });

  it('titular del destino: lee y crea lo suyo; no toca lo ajeno', () => {
    const t = { uid: 'uid_titularX', email: 'x@test.local' };
    expect(permite('registros_patrimoniales', 'get', peticion({ ...t, resource: recurso, docId: 'rp_1' }))).toBe(true);
    expect(permite('registros_patrimoniales', 'create', peticion({ ...t, requestResource: REGISTRO_VALIDO, docId: 'rp_1' }))).toBe(true);
    const ajeno = { ...REGISTRO_VALIDO, id: 'rp_2', propietarioId: 'prop_Y' };
    expect(permite('registros_patrimoniales', 'get', peticion({ ...t, resource: ajeno, docId: 'rp_2' }))).toBe(false);
    expect(permite('registros_patrimoniales', 'create', peticion({ ...t, requestResource: ajeno, docId: 'rp_2' }))).toBe(false);
  });

  it('gestor con carterasE: lee y crea; NO edita ni borra el historial', () => {
    const g = { uid: 'uid_gestorE', email: 'ge@test.local' };
    expect(permite('registros_patrimoniales', 'get', peticion({ ...g, resource: recurso, docId: 'rp_1' }))).toBe(true);
    expect(permite('registros_patrimoniales', 'create', peticion({ ...g, requestResource: REGISTRO_VALIDO, docId: 'rp_1' }))).toBe(true);
    expect(permite('registros_patrimoniales', 'update', peticion({ ...g, resource: recurso, requestResource: recurso, docId: 'rp_1' }))).toBe(false);
    expect(permite('registros_patrimoniales', 'delete', peticion({ ...g, resource: recurso, docId: 'rp_1' }))).toBe(false);
  });

  it('gestor con carterasL (lectura histórica, S7): lee pero NO crea', () => {
    const g = { uid: 'uid_gestorL', email: 'gl@test.local' };
    expect(permite('registros_patrimoniales', 'get', peticion({ ...g, resource: recurso, docId: 'rp_1' }))).toBe(true);
    expect(permite('registros_patrimoniales', 'create', peticion({ ...g, requestResource: REGISTRO_VALIDO, docId: 'rp_1' }))).toBe(false);
  });

  it('usuario sin relación y sin autenticar: denegado', () => {
    const ajeno = { uid: 'uid_ajeno', email: 'aj@test.local' };
    expect(permite('registros_patrimoniales', 'get', peticion({ ...ajeno, resource: recurso, docId: 'rp_1' }))).toBe(false);
    expect(permite('registros_patrimoniales', 'create', peticion({ ...ajeno, requestResource: REGISTRO_VALIDO, docId: 'rp_1' }))).toBe(false);
    expect(permite('registros_patrimoniales', 'get', peticion({ uid: null, resource: recurso, docId: 'rp_1' }))).toBe(false);
    expect(permite('registros_patrimoniales', 'create', peticion({ uid: null, requestResource: REGISTRO_VALIDO, docId: 'rp_1' }))).toBe(false);
  });

  it('forma del contrato obligatoria: claves exactas, id == docId, vocabulario cerrado', () => {
    const t = { uid: 'uid_titularX', email: 'x@test.local' };
    const sinProcedencia = (({ procedencia, ...resto }) => resto)(REGISTRO_VALIDO);
    expect(permite('registros_patrimoniales', 'create', peticion({ ...t, requestResource: sinProcedencia, docId: 'rp_1' }))).toBe(false);
    expect(permite('registros_patrimoniales', 'create', peticion({ ...t, requestResource: { ...REGISTRO_VALIDO, estadoDatos: 'MAGICO' }, docId: 'rp_1' }))).toBe(false);
    expect(permite('registros_patrimoniales', 'create', peticion({ ...t, requestResource: { ...REGISTRO_VALIDO, decision: 'BLOQUEADO' }, docId: 'rp_1' }))).toBe(false);
    expect(permite('registros_patrimoniales', 'create', peticion({ ...t, requestResource: REGISTRO_VALIDO, docId: 'rp_otro' }))).toBe(false);
    expect(permite('registros_patrimoniales', 'create', peticion({ ...t, requestResource: { ...REGISTRO_VALIDO, secreto: 'x' }, docId: 'rp_1' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// propietarios (extensión INC-06 sin debilitar lo existente)
// ---------------------------------------------------------------------------

describe('INC-06 · reglas de propietarios con ficha patrimonial', () => {
  const fichaPatrimonial = {
    version: 1, modalidad: 'PROPIETARIO', estadoAcceso: 'SIN_CUENTA', estadoDatos: 'INCOMPLETO',
    camposFaltantes: ['nifCif'], politicaId: 'test', procedencia: { sistema: 'ERP' },
    creadaEn: '2026-09-26T00:00:00.000Z', actualizadaEn: '2026-09-26T00:00:00.000Z', actualizadaPor: 'u',
  };
  const docX = { id: 'prop_X', nombre: 'Titular X', nifCif: '12345678A', email: '', telefono: '', fichaPatrimonial };

  it('gestor con carterasE: lee la ficha gestionada', () => {
    const g = { uid: 'uid_gestorE', email: 'ge@test.local' };
    expect(permite('propietarios', 'get', peticion({ ...g, resource: docX, docId: 'prop_X' }))).toBe(true);
  });

  it('gestor con carterasE: SOLO puede actualizar `fichaPatrimonial`', () => {
    const g = { uid: 'uid_gestorE', email: 'ge@test.local' };
    const soloFicha = { ...docX, fichaPatrimonial: { ...fichaPatrimonial, estadoDatos: 'COMPLETO' } };
    expect(permite('propietarios', 'update', peticion({ ...g, resource: docX, requestResource: soloFicha, docId: 'prop_X' }))).toBe(true);
    // Intento de tocar datos del propietario (IBAN, notas, email…): denegado.
    const tocaNombre = { ...soloFicha, nombre: 'Manipulado' };
    expect(permite('propietarios', 'update', peticion({ ...g, resource: docX, requestResource: tocaNombre, docId: 'prop_X' }))).toBe(false);
  });

  it('gestor con carterasL (histórica): lee, NO escribe (S7)', () => {
    const g = { uid: 'uid_gestorL', email: 'gl@test.local' };
    expect(permite('propietarios', 'get', peticion({ ...g, resource: docX, docId: 'prop_X' }))).toBe(true);
    const soloFicha = { ...docX, fichaPatrimonial: { ...fichaPatrimonial, estadoDatos: 'COMPLETO' } };
    expect(permite('propietarios', 'update', peticion({ ...g, resource: docX, requestResource: soloFicha, docId: 'prop_X' }))).toBe(false);
  });

  it('gestor: no crea propietarios (S3) ni toca carteras ajenas', () => {
    const g = { uid: 'uid_gestorE', email: 'ge@test.local' };
    expect(permite('propietarios', 'create', peticion({ ...g, requestResource: { ...docX, id: 'prop_Z' }, docId: 'prop_Z' }))).toBe(false);
    const docY = { ...docX, id: 'prop_Y' };
    expect(permite('propietarios', 'get', peticion({ ...g, resource: docY, docId: 'prop_Y' }))).toBe(false);
  });

  it('titular: ámbito previo intacto (lee y edita su ficha)', () => {
    const t = { uid: 'uid_titularX', email: 'x@test.local' };
    expect(permite('propietarios', 'get', peticion({ ...t, resource: docX, docId: 'prop_X' }))).toBe(true);
    const editado = { ...docX, telefono: '600000000' };
    expect(permite('propietarios', 'update', peticion({ ...t, resource: docX, requestResource: editado, docId: 'prop_X' }))).toBe(true);
    const docY = { ...docX, id: 'prop_Y' };
    expect(permite('propietarios', 'get', peticion({ ...t, resource: docY, docId: 'prop_Y' }))).toBe(false);
  });

  it('master: acceso completo (sin cambios)', () => {
    expect(permite('propietarios', 'get', peticion({ ...authMaster, resource: docX, docId: 'prop_X' }))).toBe(true);
    expect(permite('propietarios', 'update', peticion({ ...authMaster, resource: docX, requestResource: docX, docId: 'prop_X' }))).toBe(true);
    expect(permite('propietarios', 'delete', peticion({ ...authMaster, resource: docX, docId: 'prop_X' }))).toBe(true);
  });

  it('sin autenticar: nada', () => {
    expect(permite('propietarios', 'get', peticion({ uid: null, resource: docX, docId: 'prop_X' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// audit_logs: integración con el mecanismo existente (append-only)
// ---------------------------------------------------------------------------

describe('INC-06 · audit_logs sigue siendo append-only', () => {
  const log = {
    id: 'a1', usuarioId: 'u', usuarioEmail: 'e', usuarioNombre: 'n',
    accion: 'IMPORTACION_PATRIMONIAL_EJECUTADA', descripcion: 'd',
    fechaHora: '2026-09-26T00:00:00.000Z', entidadAfectada: 'importacion_patrimonial',
    idAfectado: 'lote_pat_1', resultado: 'EXITO',
  };
  const t = { uid: 'uid_titularX', email: 'x@test.local' };

  it('cualquier sesión puede crear; nadie edita ni borra; solo master lee', () => {
    expect(permite('audit_logs', 'create', peticion({ ...t, requestResource: log, docId: 'a1' }))).toBe(true);
    expect(permite('audit_logs', 'update', peticion({ ...t, resource: log, requestResource: log, docId: 'a1' }))).toBe(false);
    expect(permite('audit_logs', 'update', peticion({ ...authMaster, resource: log, requestResource: log, docId: 'a1' }))).toBe(false);
    expect(permite('audit_logs', 'delete', peticion({ ...authMaster, resource: log, docId: 'a1' }))).toBe(false);
    expect(permite('audit_logs', 'get', peticion({ ...t, resource: log, docId: 'a1' }))).toBe(false);
    expect(permite('audit_logs', 'get', peticion({ ...authMaster, resource: log, docId: 'a1' }))).toBe(true);
  });
});
