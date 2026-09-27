/**
 * BLOQUE 3 — Seguridad del expediente documental/fiscal.
 * ---------------------------------------------------------------------------
 * El expediente NO crea colecciones nuevas ni amplía reglas: es una proyección
 * cliente de colecciones ya aisladas. Este test verifica con el harness
 * fail-loud (tests/harness/firestoreRulesEval.ts) sobre el TEXTO REAL de
 * firestore.rules:
 *  · titular: acceso completo a sus gastos;
 *  · otro propietario: denegado (aislamiento);
 *  · gestor cartera L/E: los gastos siguen fuera de su ámbito (el índice no
 *    concede nada nuevo; sólo las pólizas del Bloque 1 tienen alcance gestor);
 *  · administrador y anónimo: ámbito ya existente;
 *  · sin colecciones paralelas del expediente en las reglas;
 *  · sin isStaff() como bypass en los bloques afectados;
 *  · storage.rules mantiene el deny-all final (sin lectura global por ruta).
 * Validación sobre emulador Firebase real: PENDIENTE — BLOQUE 4.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';

const RAIZ = resolve(__dirname, '..');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const STORAGE_RULES = readFileSync(resolve(RAIZ, 'storage.rules'), 'utf8');
const EVAL = crearEvaluadorReglas(RULES);
const { permite, SIN_COMENTARIOS } = EVAL;

const EMAIL_ADMIN = (
  SIN_COMENTARIOS(RULES).match(/function\s+isMasterAdmin\(\)\s*\{[\s\S]*?'([^'@\s]+@[^'@\s]+)'/) ||
  []
)[1];
if (!EMAIL_ADMIN) throw new Error('isMasterAdmin() no contiene un email literal: fichero equivocado');

const GASTO_X = { id: 'gas_X', propietarioId: 'prop_X', inmuebleId: 'inm_X', tipo: 'EXPLOTACION', categoria: 'IBI', concepto: 'IBI', importe: 100, estado: 'PAGADO', aCargoDe: 'arrendador' };

const FIRESTORE: Peticion['db'] = {
  'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_admin' },
  'usuarios_auth/uid_propX': {
    uid: 'uid_propX', usuarioId: 'usr_propX', email: 'prop-x@test.local', tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO', roles: [], propietarioId: 'prop_X', profesionalId: '', inmuebleIds: ['inm_X'],
  },
  'usuarios_auth/uid_propY': {
    uid: 'uid_propY', usuarioId: 'usr_propY', email: 'prop-y@test.local', tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO', roles: [], propietarioId: 'prop_Y', profesionalId: '', inmuebleIds: [],
  },
  'usuarios_auth/uid_gestorL': {
    uid: 'uid_gestorL', usuarioId: 'usr_gestorA', email: 'gestor-a@test.local', tipoPerfil: 'PROFESIONAL',
    estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [],
    carterasL: ['prop_X'], carterasE: [],
  },
  'usuarios_auth/uid_gestorE': {
    uid: 'uid_gestorE', usuarioId: 'usr_gestorB', email: 'gestor-b@test.local', tipoPerfil: 'PROFESIONAL',
    estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof_2', inmuebleIds: [],
    carterasL: ['prop_X'], carterasE: ['prop_X'],
  },
  'gastos/gas_X': GASTO_X,
};

const AUTH = {
  propX: { uid: 'uid_propX', token: { email: 'prop-x@test.local' } },
  propY: { uid: 'uid_propY', token: { email: 'prop-y@test.local' } },
  gestorL: { uid: 'uid_gestorL', token: { email: 'gestor-a@test.local' } },
  gestorE: { uid: 'uid_gestorE', token: { email: 'gestor-b@test.local' } },
  master: { uid: 'uid_master', token: { email: EMAIL_ADMIN } },
  anon: null,
};

function peticion(over: Partial<Peticion>): Peticion {
  return { auth: null, db: FIRESTORE, resource: null, requestResource: null, docId: 'gas_X', ...over };
}
function getGasto(auth: Peticion['auth']) {
  return permite('gastos', 'get', peticion({ auth, resource: GASTO_X }));
}
function listGasto(auth: Peticion['auth']) {
  return permite('gastos', 'list', peticion({ auth, resource: GASTO_X }));
}
function updateGasto(auth: Peticion['auth']) {
  return permite('gastos', 'update', peticion({ auth, resource: GASTO_X, requestResource: { ...GASTO_X, importe: 1 } }));
}

describe('BLOQUE 3 · gastos (fuente del expediente): aislamiento intacto', () => {
  it('E1 · titular: get/list/update permitidos', () => {
    expect(getGasto(AUTH.propX)).toBe(true);
    expect(listGasto(AUTH.propX)).toBe(true);
    expect(updateGasto(AUTH.propX)).toBe(true);
  });
  it('E2 · otro propietario: denegado (aislamiento entre propietarios)', () => {
    expect(getGasto(AUTH.propY)).toBe(false);
    expect(listGasto(AUTH.propY)).toBe(false);
    expect(updateGasto(AUTH.propY)).toBe(false);
  });
  it('E3 · REVISIÓN EXPLÍCITA D2 (ORDEN 3 §2): el gestor SÍ opera los gastos de su cartera', () => {
    // Pre-D2 este test pineaba "gastos fuera del ámbito del gestor". D2
    // (dependientes dentro del mismo ámbito) concede lectura (L/E) y
    // escritura (E) sobre los gastos de la cartera gestionada con el patrón
    // auditado de pólizas/contratos; el gestor no borra y la revocación
    // deniega (cobertura completa en seguridad-firestore-d2.test.ts C).
    // El aislamiento entre carteras (E2) y el resto del bloque siguen intactos.
    expect(getGasto(AUTH.gestorL)).toBe(true);
    expect(listGasto(AUTH.gestorL)).toBe(true);
    expect(getGasto(AUTH.gestorE)).toBe(true);
    expect(updateGasto(AUTH.gestorE)).toBe(true);
  });
  it('E4 · admin permitido; anónimo denegado', () => {
    expect(getGasto(AUTH.master)).toBe(true);
    expect(updateGasto(AUTH.master)).toBe(true);
    expect(getGasto(AUTH.anon)).toBe(false);
    expect(listGasto(AUTH.anon)).toBe(false);
  });
});

describe('BLOQUE 3 · invariantes de reglas y Storage', () => {
  it('I1 · sin colecciones paralelas del expediente documental/fiscal en firestore.rules', () => {
    const reglas = SIN_COMENTARIOS(RULES);
    // (expedientes_recomercializacion y expedientes_morosidad son preexistentes
    // de FASE 5 / Bloque C y no forman parte del expediente documental.)
    expect(reglas).not.toContain('match /expedientes_documentales');
    expect(reglas).not.toContain('match /expediente_documental');
    expect(reglas).not.toContain('match /expediente_fiscal');
    expect(reglas).not.toContain('match /indice_documental');
    expect(reglas).not.toContain('match /documentos_expediente');
    expect(reglas).not.toContain('audit_logs_fiscal');
    expect(reglas).not.toContain('historico_documentos');
  });
  it('I2 · sin isStaff() como bypass en gastos y pólizas', () => {
    const reglas = SIN_COMENTARIOS(RULES);
    const gastos = reglas.slice(reglas.indexOf('match /gastos/{gastoId}'), reglas.indexOf('match /gastos_recurrentes/'));
    const polizas = reglas.slice(reglas.indexOf('match /polizas_seguros/'), reglas.indexOf('match /siniestros/'));
    expect(gastos).not.toContain('isStaff()');
    expect(polizas).not.toContain('isStaff()');
  });
  it('I3 · storage.rules conserva el deny-all final (sin lectura global por conocer la ruta)', () => {
    const idx = STORAGE_RULES.lastIndexOf('match /{allPaths=**}');
    expect(idx).toBeGreaterThan(0);
    const cola = STORAGE_RULES.slice(idx);
    expect(cola).toContain('allow read, write: if false;');
  });
});
