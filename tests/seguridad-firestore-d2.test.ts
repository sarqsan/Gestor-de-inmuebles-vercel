/**
 * D2 (ORDEN 3) — Seguridad de acceso a inmuebles y su ámbito.
 * ---------------------------------------------------------------------------
 * METODOLOGÍA: sin emulador de Firebase en este entorno. Se evalúa el TEXTO
 * REAL de `firestore.rules` con el harness compartido
 * `tests/harness/firestoreRulesEval.ts` (mismo criterio que las suites D2a y
 * de carteras): si el harness no cubre una construcción, LANZA (nunca
 * devuelve "permitido" por omisión). La validación contra el motor de Google
 * (emulador/proyecto) sigue PENDIENTE (NV) en un entorno con red y Java.
 *
 * Regla D2 probada aquí: tener cuenta, ser gestor, ser propietario de otra
 * cartera o conocer un ID NO concede acceso; el acceso deriva del ámbito
 * legítimo (titularidad, cartera L/E del espejo, autorización explícita).
 *
 *  A — Titularidad (E1): `propietarioId` canónico inmutable salvo master.
 *  B — Secundario (§6): el propietario secundario NO autoriza nada.
 *  C — Carteras en dependientes (E2): contratos, gastos, recurrentes,
 *      incidencias — L lee, E escribe, nadie borra, revocación deniega.
 *  D — Financiaciones (E4): cierre del list global y del uid-vs-pid.
 *  E — Inventario/habitaciones/historial (E5): list acotado al ámbito.
 *  F — Funnel (E3): tenants fuera del update/delete global; ramas
 *      anónimas intactas; decisiones documentadas (get/list residuales).
 *  G — No regresión: master, tenant-contrato, operativo sin carteras,
 *      aislamiento cross-cartera e IDs conocidos.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';

const RAIZ = resolve(__dirname, '..');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const EVAL = crearEvaluadorReglas(RULES);
const { permite } = EVAL;

const EMAIL_ADMIN = (
  RULES.match(/function\s+isMasterAdmin\(\)\s*\{[\s\S]*?'([^'@\s]+@[^'\s]+)'/) || []
)[1];
if (!EMAIL_ADMIN) throw new Error('isMasterAdmin() no contiene un email literal: fichero equivocado');

// ---------------------------------------------------------------------------
// Estado sintético de Firestore
// ---------------------------------------------------------------------------
const INM_A = { id: 'inm_A', propietarioId: 'prop_A', propietarioPrincipalId: 'prop_A', direccion: 'Calle A 1' };
const INM_B = { id: 'inm_B', propietarioId: 'prop_B', propietarioPrincipalId: 'prop_B', direccion: 'Calle B 2' };
/** Ficha con cotitular: prop_S es SOLO secundario. */
const INM_SEC = {
  id: 'inm_sec', propietarioId: 'prop_A', propietarioPrincipalId: 'prop_A',
  propietarioSecundarioId: 'prop_S', direccion: 'Calle S 3',
};
/** Documento legacy: solo principal, sin canónico. */
const INM_LEGACY = { id: 'inm_legacy', propietarioPrincipalId: 'prop_B', direccion: 'Legado 4' };
/** Inmueble con contrato activo (rama tenant). */
const INM_CT = { id: 'inm_ct', propietarioId: 'prop_A', contratoActivoId: 'ct_A', direccion: 'Calle CT 5' };

const CT_A = { id: 'ct_A', propietarioId: 'prop_A', inmuebleId: 'inm_A', estado: 'ACTIVO' };
const GASTO_A = { id: 'gasto_A', propietarioId: 'prop_A', inmuebleId: 'inm_A', importe: 100 };
const REC_A = { id: 'rec_A', propietarioId: 'prop_A', inmuebleId: 'inm_A', concepto: 'Comunidad' };
const INC_A = { id: 'inc_A', propietarioId: 'prop_A', inmuebleId: 'inm_A', titulo: 'Fuga', estado: 'ABIERTA' };
const FIN_A = { id: 'fin_A', propietarioId: 'prop_A', inmuebleId: 'inm_A', entidad: 'Banco' };
/** Inventario real de la UI: solo inmuebleId, sin propietarioId. */
const INV_SIN_PID = { id: 'inv_1', inmuebleId: 'inm_A', nombre: 'Sofá', categoria: 'Mueble', estado: 'OK' };
const INV_PID = { id: 'inv_2', propietarioId: 'prop_A', inmuebleId: 'inm_A', nombre: 'TV', categoria: 'Electro', estado: 'OK' };
const INV_B = { id: 'inv_3', propietarioId: 'prop_B', inmuebleId: 'inm_B', nombre: 'Ajeno', categoria: 'Mueble', estado: 'OK' };

const CAND_X = { id: 'cand_X', nombre: 'X', email: 'x@t.local', telefono: '600', estado: 'nuevo' };
const INVIT_X = { id: 'inv_X', inmuebleId: 'inm_A', status: 'pendiente', candidatoId: 'cand_X' };
const SLOT_X = { id: 'slot_X', inmuebleId: 'inm_A', fecha: '2026-10-01', horaInicio: '10:00', horaFin: '10:30', disponible: true };
const SOLDOC_X = { id: 'soldoc_X', candidatoId: 'cand_X', inmuebleId: 'inm_A', token: 'tok-doc' };
const SOL_X = { id: 'sol_X', nombre: 'Y', email: 'y@t.local', telefono: '601', inmuebleId: 'inm_A', estado: 'nueva' };

const espejo = (tipoPerfil: string, propietarioId: string, extra: Record<string, unknown> = {}) => ({
  tipoPerfil, estado: 'ACTIVO', propietarioId, profesionalId: '', inmuebleIds: [], ...extra,
});

const FIRESTORE: Peticion['db'] = {
  // Fichas autoritativas `usuarios/{uid}` (isTenant / admin-perfil).
  'usuarios/uid_inq': { tipoPerfil: 'INQUILINO', estado: 'ACTIVO', contratoIds: ['ct_A'], authUid: 'uid_inq' },
  'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_admin' },
  // Espejos `usuarios_auth/{uid}` (activeUser / me / carteras).
  'usuarios_auth/uid_propA': espejo('PROPIETARIO', 'prop_A'),
  'usuarios_auth/uid_propB': espejo('PROPIETARIO', 'prop_B'),
  'usuarios_auth/uid_sec': espejo('PROPIETARIO', 'prop_S'),
  'usuarios_auth/uid_gestorE': espejo('PROPIETARIO', '', { carterasL: ['prop_A'], carterasE: ['prop_A'] }),
  'usuarios_auth/uid_gestorL': espejo('PROPIETARIO', '', { carterasL: ['prop_A'] }),
  'usuarios_auth/uid_gestorRev': espejo('PROPIETARIO', ''),
  'usuarios_auth/uid_gestorProf': espejo('PROFESIONAL', '', {
    profesionalId: 'prof_g', carterasL: ['prop_A'], carterasE: ['prop_A'],
  }),
  'usuarios_auth/uid_prof': espejo('PROFESIONAL', '', { profesionalId: 'prof_1' }),
  'inmuebles/inm_A': INM_A,
  'inmuebles/inm_B': INM_B,
  'inmuebles/inm_sec': INM_SEC,
  'inmuebles/inm_legacy': INM_LEGACY,
  'inmuebles/inm_ct': INM_CT,
  'contratos_formalizacion/ct_A': CT_A,
};

// Perfil canónico para cada espejo: ser un Auth sin ficha NO concede isStaff.
for (const [ruta, espejoDoc] of Object.entries(FIRESTORE)) {
  if (!ruta.startsWith('usuarios_auth/')) continue;
  const uid = ruta.split('/')[1];
  espejoDoc.usuarioId = uid;
  FIRESTORE[`usuarios/${uid}`] = { authUid: uid, estado: 'ACTIVO', tipoPerfil: espejoDoc.tipoPerfil };
}

const AUTH = {
  propA: { uid: 'uid_propA', token: { email: 'prop-a@test.local' } },
  propB: { uid: 'uid_propB', token: { email: 'prop-b@test.local' } },
  sec: { uid: 'uid_sec', token: { email: 'sec@test.local' } },
  gestorE: { uid: 'uid_gestorE', token: { email: 'gestor-e@test.local' } },
  gestorL: { uid: 'uid_gestorL', token: { email: 'gestor-l@test.local' } },
  gestorRev: { uid: 'uid_gestorRev', token: { email: 'gestor-rev@test.local' } },
  gestorProf: { uid: 'uid_gestorProf', token: { email: 'gestor-prof@test.local' } },
  prof: { uid: 'uid_prof', token: { email: 'prof@test.local' } },
  admin: { uid: 'uid_admin', token: { email: 'admin@test.local' } },
  inq: { uid: 'uid_inq', token: { email: 'inq@test.local' } },
  desconocido: { uid: 'uid_sin_ficha', token: { email: 'nadie@test.local' } },
  master: { uid: 'uid_master', token: { email: EMAIL_ADMIN } },
  anon: null,
};

type AuthKey = keyof typeof AUTH;

function peticion(over: Partial<Peticion>): Peticion {
  return { auth: null, db: FIRESTORE, resource: null, requestResource: null, docId: 'x', ...over };
}
function op(
  coleccion: string,
  verbo: 'get' | 'list' | 'create' | 'update' | 'delete',
  quien: AuthKey,
  existente: Record<string, unknown> | null,
  entrante?: Record<string, unknown> | null,
  docId = 'x'
): boolean {
  return permite(
    coleccion, verbo,
    peticion({ auth: AUTH[quien], docId, resource: existente, requestResource: entrante ?? null })
  );
}

// ---------------------------------------------------------------------------
// A — TITULARIDAD: propietarioId canónico inmutable salvo master (E1)
// ---------------------------------------------------------------------------
describe('D2 · A — Titularidad del inmueble', () => {
  it('A1 · el titular edita su ficha fiscal (principal/secundario) mientras conserva el canónico', () => {
    expect(op('inmuebles', 'update', 'propA', INM_A, {
      ...INM_A, propietarioPrincipalId: 'prop_A', propietarioSecundarioId: 'prop_S', direccion: 'Calle A 1-bis',
    }, 'inm_A')).toBe(true);
  });
  it('A2 · el titular NO puede cambiar el propietarioId canónico (transmisión exige master)', () => {
    expect(op('inmuebles', 'update', 'propA', INM_A, {
      ...INM_A, propietarioId: 'prop_B', propietarioPrincipalId: 'prop_B',
    }, 'inm_A')).toBe(false);
  });
  it('A3 · el titular NO puede vaciar el canónico para desvincularse', () => {
    const { propietarioId: _drop, ...sinCanonico } = INM_A;
    expect(op('inmuebles', 'update', 'propA', INM_A, sinCanonico, 'inm_A')).toBe(false);
  });
  it('A4 · el gestor E edita datos operativos pero NO la titularidad', () => {
    expect(op('inmuebles', 'update', 'gestorE', INM_A, { ...INM_A, direccion: 'Nueva dir' }, 'inm_A')).toBe(true);
    expect(op('inmuebles', 'update', 'gestorE', INM_A, { ...INM_A, propietarioSecundarioId: 'prop_X' }, 'inm_A')).toBe(false);
    expect(op('inmuebles', 'update', 'gestorE', INM_A, { ...INM_A, propietarioId: 'prop_X' }, 'inm_A')).toBe(false);
  });
  it('A5 · el master conserva el flujo canónico de transmisión/corrección', () => {
    expect(op('inmuebles', 'update', 'master', INM_A, {
      ...INM_A, propietarioId: 'prop_B', propietarioPrincipalId: 'prop_B',
    }, 'inm_A')).toBe(true);
  });
  it('A6 · legacy sin canónico: el principal edita el resto; fijar el canónico exige master', () => {
    expect(op('inmuebles', 'update', 'propB', INM_LEGACY, {
      ...INM_LEGACY, direccion: 'Legado 4-bis',
    }, 'inm_legacy')).toBe(true);
    expect(op('inmuebles', 'update', 'propB', INM_LEGACY, {
      ...INM_LEGACY, propietarioId: 'prop_B',
    }, 'inm_legacy')).toBe(false);
    expect(op('inmuebles', 'update', 'master', INM_LEGACY, {
      ...INM_LEGACY, propietarioId: 'prop_B',
    }, 'inm_legacy')).toBe(true);
  });
  it('A7 · create/delete de inmuebles intactos (titular crea lo propio; solo master borra)', () => {
    expect(op('inmuebles', 'create', 'propA', null, { id: 'n', propietarioId: 'prop_A' }, 'n')).toBe(true);
    expect(op('inmuebles', 'create', 'gestorE', null, { id: 'n', propietarioId: 'prop_A' }, 'n')).toBe(false);
    expect(op('inmuebles', 'delete', 'propA', INM_A, null, 'inm_A')).toBe(false);
    expect(op('inmuebles', 'delete', 'gestorE', INM_A, null, 'inm_A')).toBe(false);
    expect(op('inmuebles', 'delete', 'master', INM_A, null, 'inm_A')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B — SECUNDARIO: no autoriza (§6)
// ---------------------------------------------------------------------------
describe('D2 · B — Propietario secundario', () => {
  it('B1 · ser solo secundario NO concede lectura (get/list)', () => {
    expect(op('inmuebles', 'get', 'sec', INM_SEC, null, 'inm_sec')).toBe(false);
    expect(op('inmuebles', 'list', 'sec', INM_SEC, null, 'inm_sec')).toBe(false);
  });
  it('B2 · ser solo secundario NO concede escritura', () => {
    expect(op('inmuebles', 'update', 'sec', INM_SEC, { ...INM_SEC, direccion: 'X' }, 'inm_sec')).toBe(false);
  });
  it('B3 · el titular de la ficha con secundario conserva su acceso completo', () => {
    expect(op('inmuebles', 'get', 'propA', INM_SEC, null, 'inm_sec')).toBe(true);
    expect(op('inmuebles', 'update', 'propA', INM_SEC, { ...INM_SEC, direccion: 'Y' }, 'inm_sec')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C — CARTERAS EN DEPENDIENTES (E2)
// ---------------------------------------------------------------------------
describe('D2 · C — Carteras en contratos/gastos/recurrentes/incidencias', () => {
  const DEPS = [
    ['contratos_formalizacion', CT_A],
    ['gastos', GASTO_A],
    ['gastos_recurrentes', REC_A],
    ['incidencias', INC_A],
  ] as const;

  it('C1 · cartera L: lee (get+list pid-a-pid) pero NO escribe ni borra', () => {
    for (const [col, doc] of DEPS) {
      expect(op(col, 'get', 'gestorL', doc as unknown as Record<string, unknown>)).toBe(true);
      expect(op(col, 'list', 'gestorL', doc as unknown as Record<string, unknown>)).toBe(true);
      expect(op(col, 'create', 'gestorL', null, { ...doc, id: 'nuevo' } as unknown as Record<string, unknown>, 'nuevo')).toBe(false);
      expect(op(col, 'update', 'gestorL', doc as unknown as Record<string, unknown>, { ...doc } as unknown as Record<string, unknown>)).toBe(false);
      expect(op(col, 'delete', 'gestorL', doc as unknown as Record<string, unknown>)).toBe(false);
    }
  });
  it('C2 · cartera E: lee, crea y actualiza; NO borra ni mueve de cartera', () => {
    for (const [col, doc] of DEPS) {
      const d = doc as unknown as Record<string, unknown>;
      expect(op(col, 'get', 'gestorE', d)).toBe(true);
      expect(op(col, 'list', 'gestorE', d)).toBe(true);
      expect(op(col, 'create', 'gestorE', null, { ...d, id: 'nuevo' }, 'nuevo')).toBe(true);
      expect(op(col, 'update', 'gestorE', d, { ...d })).toBe(true);
      expect(op(col, 'update', 'gestorE', d, { ...d, propietarioId: 'prop_B' })).toBe(false);
      expect(op(col, 'delete', 'gestorE', d)).toBe(false);
    }
  });
  it('C3 · cartera E exige inmuebleId al crear (invariante de la colección)', () => {
    for (const [col, doc] of DEPS) {
      const d = doc as unknown as Record<string, unknown>;
      const { inmuebleId: _drop, ...sinInmueble } = d;
      expect(op(col, 'create', 'gestorE', null, { ...sinInmueble, id: 'nuevo' }, 'nuevo')).toBe(false);
    }
  });
  it('C4 · gestor de otra cartera / revocado: sin acceso transversal', () => {
    for (const [col, doc] of DEPS) {
      const d = doc as unknown as Record<string, unknown>;
      // propB no gestiona prop_A: denegado aunque conozca el ID.
      expect(op(col, 'get', 'propB', d)).toBe(false);
      expect(op(col, 'list', 'propB', d)).toBe(false);
      // Espejo sin carteras (revocación): denegado.
      expect(op(col, 'get', 'gestorRev', d)).toBe(false);
      expect(op(col, 'list', 'gestorRev', d)).toBe(false);
      expect(op(col, 'create', 'gestorRev', null, { ...d, id: 'nuevo' }, 'nuevo')).toBe(false);
    }
  });
  it('C5 · gestor con perfil profesional opera su cartera; el operativo no', () => {
    for (const [col, doc] of DEPS) {
      const d = doc as unknown as Record<string, unknown>;
      expect(op(col, 'get', 'gestorProf', d)).toBe(true);
      expect(op(col, 'list', 'gestorProf', d)).toBe(true);
      expect(op(col, 'create', 'gestorProf', null, { ...d, id: 'nuevo' }, 'nuevo')).toBe(true);
      expect(op(col, 'update', 'gestorProf', d, { ...d })).toBe(true);
      expect(op(col, 'delete', 'gestorProf', d)).toBe(false);
      expect(op(col, 'get', 'prof', d)).toBe(false);
      expect(op(col, 'list', 'prof', d)).toBe(false);
    }
  });
  it('C6 · el titular conserva su operativa intacta (CRUD propio)', () => {
    for (const [col, doc] of DEPS) {
      const d = doc as unknown as Record<string, unknown>;
      expect(op(col, 'get', 'propA', d)).toBe(true);
      expect(op(col, 'list', 'propA', d)).toBe(true);
      expect(op(col, 'create', 'propA', null, { ...d, id: 'nuevo' }, 'nuevo')).toBe(true);
      expect(op(col, 'update', 'propA', d, { ...d })).toBe(true);
      expect(op(col, 'delete', 'propA', d)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// D — FINANCIACIONES (E4)
// ---------------------------------------------------------------------------
describe('D2 · D — Financiaciones', () => {
  it('D1 · el titular opera las suyas (get/list/create/update)', () => {
    expect(op('financiaciones', 'get', 'propA', FIN_A)).toBe(true);
    expect(op('financiaciones', 'list', 'propA', FIN_A)).toBe(true);
    expect(op('financiaciones', 'create', 'propA', null, { ...FIN_A, id: 'fin_n' }, 'fin_n')).toBe(true);
    expect(op('financiaciones', 'update', 'propA', FIN_A, { ...FIN_A })).toBe(true);
  });
  it('D2 · propietario de otra cartera NO lista ni lee (cierre del list global)', () => {
    expect(op('financiaciones', 'get', 'propB', FIN_A)).toBe(false);
    expect(op('financiaciones', 'list', 'propB', FIN_A)).toBe(false);
  });
  it('D3 · uid de Auth ≠ propietarioId: sin acceso por UID', () => {
    // `desconocido` está autenticado (uid_sin_ficha): con la comparación
    // rota `propietarioId == request.auth.uid` + list global, veía todo.
    expect(op('financiaciones', 'list', 'desconocido', FIN_A)).toBe(false);
    expect(op('financiaciones', 'get', 'desconocido', FIN_A)).toBe(false);
    expect(op('financiaciones', 'create', 'desconocido', null, {
      ...FIN_A, id: 'fin_n', propietarioId: 'uid_sin_ficha',
    }, 'fin_n')).toBe(false);
  });
  it('D4 · inquilino, profesional y anónimo: denegados', () => {
    for (const quien of ['inq', 'prof', 'anon'] as AuthKey[]) {
      expect(op('financiaciones', 'get', quien, FIN_A)).toBe(false);
      expect(op('financiaciones', 'list', quien, FIN_A)).toBe(false);
    }
  });
  it('D5 · sin carteras (hipoteca personal del titular) + master intacto', () => {
    expect(op('financiaciones', 'get', 'gestorE', FIN_A)).toBe(false);
    expect(op('financiaciones', 'list', 'gestorE', FIN_A)).toBe(false);
    expect(op('financiaciones', 'get', 'master', FIN_A)).toBe(true);
    expect(op('financiaciones', 'list', 'master', FIN_A)).toBe(true);
    expect(op('financiaciones', 'delete', 'master', FIN_A)).toBe(true);
    expect(op('financiaciones', 'delete', 'propA', FIN_A)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// E — INVENTARIO / HABITACIONES / HISTORIAL (E5)
// ---------------------------------------------------------------------------
describe('D2 · E — Inventario, habitaciones e historial', () => {
  const COLS = ['inventario_inmuebles', 'inventario_historial', 'habitaciones_inmueble'] as const;
  it('E1 · el titular lista lo suyo (con pid o por inmuebleId); lo ajeno no', () => {
    for (const col of COLS) {
      expect(op(col, 'list', 'propA', INV_SIN_PID)).toBe(false); // sin pid ni membresía explícita
      expect(op(col, 'list', 'propA', INV_PID)).toBe(true);
      expect(op(col, 'list', 'propA', INV_B)).toBe(false);
      expect(op(col, 'get', 'propA', INV_PID)).toBe(true);
      expect(op(col, 'get', 'propA', INV_B)).toBe(false);
    }
  });
  it('E2 · cross-cartera por ID conocido: denegado (cierre del list global)', () => {
    for (const col of COLS) {
      expect(op(col, 'list', 'propB', INV_PID)).toBe(false);
      expect(op(col, 'get', 'propB', INV_PID)).toBe(false);
    }
  });
  it('E3 · escritura intacta: titular e inmuebleIds; ajenos fuera', () => {
    expect(op('inventario_inmuebles', 'create', 'propA', null, { ...INV_PID, id: 'n' }, 'n')).toBe(true);
    expect(op('inventario_inmuebles', 'create', 'propB', null, { ...INV_PID, id: 'n' }, 'n')).toBe(false);
    expect(op('inventario_historial', 'update', 'propA', INV_PID, { ...INV_PID })).toBe(false); // append-only
    expect(op('habitaciones_inmueble', 'delete', 'propA', INV_PID)).toBe(true);
    expect(op('habitaciones_inmueble', 'delete', 'propB', INV_PID)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F — FUNNEL (E3)
// ---------------------------------------------------------------------------
describe('D2 · F — Funnel: tenants fuera del write global', () => {
  const FUNNEL = [
    ['candidatos', CAND_X],
    ['invitaciones', INVIT_X],
    ['slots_visita', SLOT_X],
    ['solicitudes_documentacion', SOLDOC_X],
    ['solicitudes', SOL_X],
  ] as const;

  it('F1 · el inquilino autenticado YA NO puede update/delete global del funnel', () => {
    // `nombre` está fuera de las listas de forma anónima de TODOS los
    // bloques (un inquilino que además sea candidato sigue pudiendo usar
    // la rama anónima —reserva/cuestionario/aporte— como cualquier anónimo).
    for (const [col, doc] of FUNNEL) {
      const d = doc as unknown as Record<string, unknown>;
      expect(op(col, 'update', 'inq', d, { ...d, nombre: 'manipulado' })).toBe(false);
      expect(op(col, 'delete', 'inq', d)).toBe(false);
    }
  });
  it('F2 · el staff conserva la operativa (update/delete)', () => {
    for (const [col, doc] of FUNNEL) {
      const d = doc as unknown as Record<string, unknown>;
      expect(op(col, 'update', 'propA', d, { ...d, estado: 'gestionado' })).toBe(true);
      expect(op(col, 'delete', 'propA', d)).toBe(true);
      expect(op(col, 'update', 'master', d, { ...d, estado: 'gestionado' })).toBe(true);
    }
  });
  it('F3 · ramas anónimas del flujo público intactas (reserva/cuestionario/aporte)', () => {
    expect(op('candidatos', 'update', 'anon', CAND_X, {
      ...CAND_X, cuestionarioToken: 'tok', estado: 'cuestionario',
    })).toBe(true);
    expect(op('invitaciones', 'update', 'anon', INVIT_X, { ...INVIT_X, status: 'confirmada' })).toBe(true);
    expect(op('slots_visita', 'update', 'anon', SLOT_X, {
      ...SLOT_X, disponible: false, reservaCandidateId: 'cand_X',
    })).toBe(true);
    expect(op('solicitudes_documentacion', 'update', 'anon', SOLDOC_X, {
      ...SOLDOC_X, estado: 'aportada', documentos: [],
    })).toBe(true);
    expect(op('candidatos', 'create', 'anon', null, {
      nombre: 'N', email: 'n@t.local', telefono: '600', estado: 'nuevo',
    }, 'nuevo')).toBe(true);
    expect(op('solicitudes', 'create', 'anon', null, {
      nombre: 'N', email: 'n@t.local', telefono: '600', inmuebleId: 'inm_A', estado: 'nueva',
    }, 'nuevo')).toBe(true);
  });
  it('F4 · el anónimo NO borra ni toca fuera de forma', () => {
    for (const [col, doc] of FUNNEL) {
      const d = doc as unknown as Record<string, unknown>;
      expect(op(col, 'delete', 'anon', d)).toBe(false);
    }
    expect(op('candidatos', 'update', 'anon', CAND_X, { ...CAND_X, propietarioId: 'prop_X' })).toBe(false);
  });
  it('F5 · DECISIÓN DOCUMENTADA: lecturas públicas estructurales pendientes de D3', () => {
    // `candidatos.get == true` e `invitaciones/slots/solicitudes_doc.read ==
    // true` sostienen el flujo público sin backend (capability por oscuridad
    // del ID/token). Endurecerlos exige token-capability real (backend) y
    // queda pendiente (D3). Se pinea el estado para que ningún cambio futuro
    // los amplíe o reduzca sin revisión explícita.
    expect(op('candidatos', 'get', 'anon', CAND_X)).toBe(true);
    expect(op('invitaciones', 'get', 'anon', INVIT_X)).toBe(true);
    expect(op('slots_visita', 'get', 'anon', SLOT_X)).toBe(true);
    expect(op('solicitudes_documentacion', 'get', 'anon', SOLDOC_X)).toBe(true);
    // …pero el list de candidatos sigue exigiendo cuenta (no es público).
    expect(op('candidatos', 'list', 'anon', CAND_X)).toBe(false);
    expect(op('candidatos', 'list', 'propA', CAND_X)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// G — NO REGRESIÓN
// ---------------------------------------------------------------------------
describe('D2 · G — No regresión', () => {
  it('G1 · tenant con contrato: get de su contrato e inmueble; list denegado', () => {
    expect(op('contratos_formalizacion', 'get', 'inq', CT_A, null, 'ct_A')).toBe(true);
    expect(op('contratos_formalizacion', 'list', 'inq', CT_A)).toBe(false);
    expect(op('inmuebles', 'get', 'inq', INM_CT, null, 'inm_ct')).toBe(true);
    expect(op('inmuebles', 'list', 'inq', INM_CT)).toBe(false);
  });
  it('G2 · el tenant NO escribe economía de cartera aunque conozca IDs', () => {
    for (const [col, doc] of [
      ['contratos_formalizacion', CT_A], ['gastos', GASTO_A],
      ['gastos_recurrentes', REC_A], ['financiaciones', FIN_A],
    ] as const) {
      const d = doc as unknown as Record<string, unknown>;
      expect(op(col, 'create', 'inq', null, { ...d, id: 'n' }, 'n')).toBe(false);
      expect(op(col, 'delete', 'inq', d)).toBe(false);
    }
    // …salvo sus índices de capacidad en SU contrato (rama BLOQUE E intacta).
    expect(op('contratos_formalizacion', 'update', 'inq', CT_A, {
      ...CT_A, incidenciaIds: ['inc_1'],
    }, 'ct_A')).toBe(true);
  });
  it('G3 · profesional operativo: cero economía; incidencias solo asignadas', () => {
    for (const [col, doc] of [
      ['contratos_formalizacion', CT_A], ['gastos', GASTO_A],
      ['gastos_recurrentes', REC_A], ['financiaciones', FIN_A],
    ] as const) {
      const d = doc as unknown as Record<string, unknown>;
      expect(op(col, 'get', 'prof', d)).toBe(false);
      expect(op(col, 'list', 'prof', d)).toBe(false);
    }
    expect(op('incidencias', 'get', 'prof', INC_A)).toBe(false);
    expect(op('incidencias', 'get', 'prof', { ...INC_A, profesionalAsignadoId: 'prof_1' })).toBe(true);
  });
  it('G4 · master intacto en las colecciones D2', () => {
    const DOCS: Array<[string, Record<string, unknown>]> = [
      ['contratos_formalizacion', CT_A], ['gastos', GASTO_A],
      ['gastos_recurrentes', REC_A], ['incidencias', INC_A],
      ['financiaciones', FIN_A], ['inventario_inmuebles', INV_PID],
      ['habitaciones_inmueble', INV_PID], ['candidatos', CAND_X],
    ];
    for (const [col, d] of DOCS) {
      expect(op(col, 'get', 'master', d)).toBe(true);
      expect(op(col, 'list', 'master', d)).toBe(true);
    }
  });
  it('G5 · anónimo: denegado en economía e inventario', () => {
    const DOCS: Array<[string, Record<string, unknown>]> = [
      ['contratos_formalizacion', CT_A], ['gastos', GASTO_A],
      ['gastos_recurrentes', REC_A], ['incidencias', INC_A],
      ['financiaciones', FIN_A], ['inventario_inmuebles', INV_PID],
      ['inventario_historial', INV_PID], ['habitaciones_inmueble', INV_PID],
    ];
    for (const [col, d] of DOCS) {
      expect(op(col, 'get', 'anon', d)).toBe(false);
      expect(op(col, 'list', 'anon', d)).toBe(false);
    }
  });
});
