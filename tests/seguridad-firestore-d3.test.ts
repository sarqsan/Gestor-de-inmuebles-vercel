/**
 * D3 (ORDEN 4 §9) — Firestore: fin del `isStaff()` transversal en el BLOQUE E.
 * ---------------------------------------------------------------------------
 * METODOLOGÍA: se evalúa el TEXTO REAL de `firestore.rules` con el harness
 * `tests/harness/firestoreRulesEval.ts` (fail-loud). La validación contra el
 * motor de Google sigue PENDIENTE (NV) en un entorno con red.
 *
 * Regla probada: en `suministros`, `lecturas_suministro`, `cambios_titular`,
 * `mensajes_portal` y `solicitudes_seguro_impago`, el acceso ya no depende de
 * ser "personal" sin más: deriva inmueble/contrato → `propietarioId` y se
 * valida contra el espejo (`propietarioId` propio, carteras L/E, admin).
 * Ramas tenant intactas; `update` exige ámbito en existing E incoming.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';

const RULES = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');
const EVAL = crearEvaluadorReglas(RULES);
const { permite, SIN_COMENTARIOS } = EVAL;

const EMAIL_ADMIN = (
  SIN_COMENTARIOS(RULES).match(/function\s+isMasterAdmin\(\)\s*\{[\s\S]*?'([^'@\s]+@[^'\s]+)'/) || []
)[1];
if (!EMAIL_ADMIN) throw new Error('isMasterAdmin() sin email literal: fichero equivocado');

const espejo = (tipoPerfil: string, propietarioId: string, extra: Record<string, unknown> = {}) => ({
  tipoPerfil, estado: 'ACTIVO', propietarioId, profesionalId: '', inmuebleIds: [], ...extra,
});

const DB: Peticion['db'] = {
  // La ficha vive en `usuarios/{authUid}` (canon `getUsuarioActual()`).
  'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_admin' },
  'usuarios/uid_inq': { tipoPerfil: 'INQUILINO', estado: 'ACTIVO', contratoIds: ['ct_A'], authUid: 'uid_inq' },
  'usuarios_auth/uid_propA': espejo('PROPIETARIO', 'prop_A'),
  'usuarios_auth/uid_propB': espejo('PROPIETARIO', 'prop_B'),
  'usuarios_auth/uid_gestorE': espejo('PROPIETARIO', '', { carterasL: ['prop_A'], carterasE: ['prop_A'] }),
  'usuarios_auth/uid_gestorL': espejo('PROPIETARIO', '', { carterasL: ['prop_A'] }),
  'usuarios_auth/uid_gestorRev': espejo('PROPIETARIO', ''),
  'inmuebles/inm_A': { propietarioId: 'prop_A' },
  'inmuebles/inm_B': { propietarioId: 'prop_B' },
  'contratos_formalizacion/ct_A': { propietarioId: 'prop_A', inmuebleId: 'inm_A' },
  'contratos_formalizacion/ct_B': { propietarioId: 'prop_B', inmuebleId: 'inm_B' },
  'suministros/sum_A': { inmuebleId: 'inm_A', contratoIdsAutorizados: ['ct_A'], titular: 'T' },
  'suministros/sum_B': { inmuebleId: 'inm_B', contratoIdsAutorizados: ['ct_B'], titular: 'T' },
  'lecturas_suministro/lec_A': { inmuebleId: 'inm_A', contratoId: 'ct_A', suministroId: 'sum_A', valor: 10 },
  'lecturas_suministro/lec_B': { inmuebleId: 'inm_B', contratoId: 'ct_B', suministroId: 'sum_B', valor: 10 },
  'cambios_titular/cam_A': { inmuebleId: 'inm_A', contratoId: 'ct_A', suministroId: 'sum_A', estado: 'SOLICITADO' },
  'mensajes_portal/msg_A': { contratoId: 'ct_A', inmuebleId: 'inm_A', texto: 'hola', leidoPorInquilino: false },
  'mensajes_portal/msg_B': { contratoId: 'ct_B', inmuebleId: 'inm_B', texto: 'hola', leidoPorInquilino: false },
  'solicitudes_seguro_impago/seg_A': { inmuebleId: 'inm_A' },
  'solicitudes_seguro_impago/seg_B': { inmuebleId: 'inm_B' },
};

const AUTH = {
  propA: { uid: 'uid_propA', token: { email: 'prop-a@test.local' } },
  propB: { uid: 'uid_propB', token: { email: 'prop-b@test.local' } },
  gestorE: { uid: 'uid_gestorE', token: { email: 'gestor-e@test.local' } },
  gestorL: { uid: 'uid_gestorL', token: { email: 'gestor-l@test.local' } },
  gestorRev: { uid: 'uid_gestorRev', token: { email: 'gestor-rev@test.local' } },
  admin: { uid: 'uid_admin', token: { email: 'admin@test.local' } },
  inq: { uid: 'uid_inq', token: { email: 'inq@test.local' } },
  desconocido: { uid: 'uid_sin_ficha', token: { email: 'nadie@test.local' } },
  master: { uid: 'uid_master', token: { email: EMAIL_ADMIN } },
  anon: null,
};
type AuthKey = keyof typeof AUTH;
type Verbo = 'get' | 'list' | 'create' | 'update' | 'delete';

function op(
  coleccion: string, docId: string, verbo: Verbo, quien: AuthKey,
  existing?: Record<string, unknown> | null,
  incoming?: Record<string, unknown> | null,
): boolean {
  return permite(coleccion, verbo, {
    auth: AUTH[quien],
    db: DB,
    docId,
    resource: (existing ?? DB[`${coleccion}/${docId}`] ?? null) as Peticion['resource'],
    requestResource: (incoming ?? null) as Peticion['requestResource'],
  });
}
const get = (c: string, d: string, q: AuthKey) => op(c, d, 'get', q);
const list = (c: string, d: string, q: AuthKey) => op(c, d, 'list', q);

// ---------------------------------------------------------------------------
// A — SUMINISTROS
// ---------------------------------------------------------------------------
describe('D3 Firestore · A — Suministros', () => {
  const C = 'suministros';
  it('A1 · ámbito derivado inmueble→propietario (+carteras, +admin)', () => {
    expect(get(C, 'sum_A', 'propA')).toBe(true);
    expect(list(C, 'sum_A', 'propA')).toBe(true);
    expect(get(C, 'sum_A', 'gestorL')).toBe(true);
    expect(get(C, 'sum_A', 'gestorE')).toBe(true);
    expect(get(C, 'sum_A', 'admin')).toBe(true);
    expect(get(C, 'sum_A', 'master')).toBe(true);
  });
  it('A2 · transversal denegado (otra cartera, revocado, desconocido, anónimo)', () => {
    for (const q of ['propB', 'gestorRev', 'desconocido', 'anon'] as AuthKey[]) {
      expect(get(C, 'sum_A', q)).toBe(false);
      expect(list(C, 'sum_A', q)).toBe(false);
    }
    expect(get(C, 'sum_B', 'propA')).toBe(false);
  });
  it('A3 · create/update exigen ámbito de escritura (E sí, L no)', () => {
    const inc = { inmuebleId: 'inm_A' };
    expect(op(C, 'sum_N', 'create', 'propA', null, inc)).toBe(true);
    expect(op(C, 'sum_N', 'create', 'gestorE', null, inc)).toBe(true);
    expect(op(C, 'sum_N', 'create', 'gestorL', null, inc)).toBe(false);
    expect(op(C, 'sum_N', 'create', 'propB', null, inc)).toBe(false);
    expect(op(C, 'sum_N', 'create', 'admin', null, inc)).toBe(true);
    const upd = { inmuebleId: 'inm_A', titular: 'T2' };
    expect(op(C, 'sum_A', 'update', 'propA', undefined, upd)).toBe(true);
    expect(op(C, 'sum_A', 'update', 'gestorE', undefined, upd)).toBe(true);
    expect(op(C, 'sum_A', 'update', 'gestorL', undefined, upd)).toBe(false);
    expect(op(C, 'sum_A', 'update', 'propB', undefined, upd)).toBe(false);
  });
  it('A4 · update con cambio de inmueble: ambos en ámbito o deny', () => {
    // mover sum_A (inm_A, prop_A) a inm_B (prop_B): ni propA ni propB pueden.
    const aB = { inmuebleId: 'inm_B', titular: 'T' };
    expect(op(C, 'sum_A', 'update', 'propA', undefined, aB)).toBe(false);
    expect(op(C, 'sum_A', 'update', 'propB', undefined, aB)).toBe(false);
    expect(op(C, 'sum_A', 'update', 'admin', undefined, aB)).toBe(true);
  });
  it('A5 · rama tenant intacta (lee su contrato; actualiza solo índices)', () => {
    expect(get(C, 'sum_A', 'inq')).toBe(true); // ct_A ∈ contratoIdsAutorizados
    expect(get(C, 'sum_B', 'inq')).toBe(false);
    const idx = { ...DB['suministros/sum_A'], lecturaIds: ['lec_1'] };
    expect(op(C, 'sum_A', 'update', 'inq', undefined, idx as Record<string, unknown>)).toBe(true);
    const robo = { inmuebleId: 'inm_A', titular: 'hack' };
    expect(op(C, 'sum_A', 'update', 'inq', undefined, robo)).toBe(false);
  });
  it('A6 · delete sigue master-only', () => {
    expect(op(C, 'sum_A', 'delete', 'master')).toBe(true);
    expect(op(C, 'sum_A', 'delete', 'propA')).toBe(false);
    expect(op(C, 'sum_A', 'delete', 'admin')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B — LECTURAS_Suministro
// ---------------------------------------------------------------------------
describe('D3 Firestore · B — Lecturas', () => {
  const C = 'lecturas_suministro';
  it('B1 · ámbito lectura; transversal denegado', () => {
    expect(get(C, 'lec_A', 'propA')).toBe(true);
    expect(get(C, 'lec_A', 'gestorL')).toBe(true);
    expect(get(C, 'lec_A', 'gestorE')).toBe(true);
    expect(get(C, 'lec_A', 'admin')).toBe(true);
    for (const q of ['propB', 'gestorRev', 'desconocido', 'anon'] as AuthKey[]) {
      expect(get(C, 'lec_A', q)).toBe(false);
    }
    expect(get(C, 'lec_B', 'propA')).toBe(false);
  });
  it('B2 · create staff acotado; inmutabilidad intacta', () => {
    const inc = { inmuebleId: 'inm_A' };
    expect(op(C, 'lec_N', 'create', 'propA', null, inc)).toBe(true);
    expect(op(C, 'lec_N', 'create', 'gestorE', null, inc)).toBe(true);
    expect(op(C, 'lec_N', 'create', 'gestorL', null, inc)).toBe(false);
    expect(op(C, 'lec_N', 'create', 'propB', null, inc)).toBe(false);
    expect(op(C, 'lec_A', 'update', 'propA', undefined, { inmuebleId: 'inm_A', valor: 11 })).toBe(false);
    expect(op(C, 'lec_A', 'delete', 'master')).toBe(false);
  });
  it('B3 · rama tenant intacta (lee y registra sus lecturas)', () => {
    expect(get(C, 'lec_A', 'inq')).toBe(true);
    expect(get(C, 'lec_B', 'inq')).toBe(false);
    const inc = {
      contratoId: 'ct_A', suministroId: 'sum_A', inmuebleId: 'inm_A',
      valor: 123, unidad: 'kWh', fechaLectura: '2026-09-27', origen: 'INQUILINO',
    };
    expect(op(C, 'lec_N', 'create', 'inq', null, inc)).toBe(true);
    expect(op(C, 'lec_N', 'create', 'inq', null, { ...inc, origen: 'GESTOR' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C — CAMBIOS_TITULAR
// ---------------------------------------------------------------------------
describe('D3 Firestore · C — Cambios de titular', () => {
  const C = 'cambios_titular';
  it('C1 · ámbito lectura; transversal denegado', () => {
    expect(get(C, 'cam_A', 'propA')).toBe(true);
    expect(get(C, 'cam_A', 'gestorL')).toBe(true);
    expect(get(C, 'cam_A', 'admin')).toBe(true);
    for (const q of ['propB', 'gestorRev', 'desconocido', 'anon'] as AuthKey[]) {
      expect(get(C, 'cam_A', q)).toBe(false);
    }
  });
  it('C2 · create/update acotados; delete master-only', () => {
    const inc = { inmuebleId: 'inm_A' };
    expect(op(C, 'cam_N', 'create', 'propA', null, inc)).toBe(true);
    expect(op(C, 'cam_N', 'create', 'gestorE', null, inc)).toBe(true);
    expect(op(C, 'cam_N', 'create', 'gestorL', null, inc)).toBe(false);
    expect(op(C, 'cam_N', 'create', 'propB', null, inc)).toBe(false);
    const upd = { inmuebleId: 'inm_A', contratoId: 'ct_A', suministroId: 'sum_A', estado: 'ACEPTADO' };
    expect(op(C, 'cam_A', 'update', 'propA', undefined, upd)).toBe(true);
    expect(op(C, 'cam_A', 'update', 'propB', undefined, upd)).toBe(false);
    expect(op(C, 'cam_A', 'delete', 'master')).toBe(true);
    expect(op(C, 'cam_A', 'delete', 'propA')).toBe(false);
  });
  it('C3 · rama tenant intacta (solicita; lee la suya)', () => {
    expect(get(C, 'cam_A', 'inq')).toBe(true);
    const inc = {
      contratoId: 'ct_A', suministroId: 'sum_A', inmuebleId: 'inm_A',
      titularNuevoNombre: 'Nuevo Titular', fechaEfecto: '2026-10-01', estado: 'SOLICITADO',
    };
    expect(op(C, 'cam_N', 'create', 'inq', null, inc)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D — MENSAJES_PORTAL (derivación por contrato)
// ---------------------------------------------------------------------------
describe('D3 Firestore · D — Mensajes del portal', () => {
  const C = 'mensajes_portal';
  it('D1 · ámbito contrato→propietario; transversal denegado', () => {
    expect(get(C, 'msg_A', 'propA')).toBe(true);
    expect(get(C, 'msg_A', 'gestorL')).toBe(true);
    expect(get(C, 'msg_A', 'gestorE')).toBe(true);
    expect(get(C, 'msg_A', 'admin')).toBe(true);
    for (const q of ['propB', 'gestorRev', 'desconocido', 'anon'] as AuthKey[]) {
      expect(get(C, 'msg_A', q)).toBe(false);
    }
    expect(get(C, 'msg_B', 'propA')).toBe(false);
  });
  it('D2 · create/update staff acotados; delete imposible', () => {
    const inc = { contratoId: 'ct_A' };
    expect(op(C, 'msg_N', 'create', 'propA', null, inc)).toBe(true);
    expect(op(C, 'msg_N', 'create', 'gestorE', null, inc)).toBe(true);
    expect(op(C, 'msg_N', 'create', 'gestorL', null, inc)).toBe(false);
    expect(op(C, 'msg_N', 'create', 'propB', null, inc)).toBe(false);
    const upd = { contratoId: 'ct_A', inmuebleId: 'inm_A', texto: 'hola', leidoPorInquilino: false, acuse: true };
    expect(op(C, 'msg_A', 'update', 'propA', undefined, upd)).toBe(true);
    expect(op(C, 'msg_A', 'update', 'propB', undefined, upd)).toBe(false);
    expect(op(C, 'msg_A', 'delete', 'master')).toBe(false);
  });
  it('D3 · rama tenant intacta (escribe y marca su acuse)', () => {
    expect(get(C, 'msg_A', 'inq')).toBe(true);
    expect(get(C, 'msg_B', 'inq')).toBe(false);
    const inc = {
      contratoId: 'ct_A', inmuebleId: 'inm_A', remitenteUid: 'uid_inq',
      remitenteRol: 'INQUILINO', texto: 'Aviso de lectura',
    };
    expect(op(C, 'msg_N', 'create', 'inq', null, inc)).toBe(true);
    const acuse = { ...DB['mensajes_portal/msg_A'], leidoPorInquilino: true };
    expect(op(C, 'msg_A', 'update', 'inq', undefined, acuse as Record<string, unknown>)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E — SOLICITUDES_SEGURO_IMPAGO (sin rama tenant: intacta su ausencia)
// ---------------------------------------------------------------------------
describe('D3 Firestore · E — Solicitudes de seguro de impago', () => {
  const C = 'solicitudes_seguro_impago';
  it('E1 · ámbito completo incl. borrado; transversal denegado', () => {
    expect(get(C, 'seg_A', 'propA')).toBe(true);
    expect(list(C, 'seg_A', 'gestorL')).toBe(true);
    expect(op(C, 'seg_N', 'create', 'gestorE', null, { inmuebleId: 'inm_A' })).toBe(true);
    expect(op(C, 'seg_N', 'create', 'gestorL', null, { inmuebleId: 'inm_A' })).toBe(false);
    expect(op(C, 'seg_A', 'update', 'propA', undefined, { inmuebleId: 'inm_A', estado: 'X' })).toBe(true);
    expect(op(C, 'seg_A', 'delete', 'propA')).toBe(true);
    expect(op(C, 'seg_A', 'delete', 'gestorE')).toBe(true);
    expect(op(C, 'seg_A', 'delete', 'gestorL')).toBe(false);
    expect(op(C, 'seg_A', 'delete', 'admin')).toBe(true);
    for (const q of ['propB', 'gestorRev', 'desconocido', 'anon'] as AuthKey[]) {
      expect(get(C, 'seg_A', q)).toBe(false);
      expect(op(C, 'seg_A', 'delete', q)).toBe(false);
    }
    expect(get(C, 'seg_B', 'propA')).toBe(false);
  });
  it('E2 · sin rama tenant: el inquilino no accede (intacto)', () => {
    expect(get(C, 'seg_A', 'inq')).toBe(false);
    expect(list(C, 'seg_A', 'inq')).toBe(false);
    expect(op(C, 'seg_N', 'create', 'inq', null, { inmuebleId: 'inm_A' })).toBe(false);
  });
});
