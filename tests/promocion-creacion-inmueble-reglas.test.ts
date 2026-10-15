/**
 * PROMOCIÓN DE INMUEBLES — autorización de CREACIÓN en `firestore.rules`.
 * ---------------------------------------------------------------------------
 * Contexto (incidente «Missing or insufficient permissions.» al promocionar):
 *  · La UI ofrece como titular destino cualquier cartera con permiso de
 *    escritura (`carterasE` del espejo o gestión indexada ACTIVA +
 *    LECTURA_ESCRITURA + responsable GESTOR). La regla de `create` de
 *    `inmuebles` sólo admitía `propietarioId == myPropId()`, así que una
 *    cartera delegada era elegible en la pantalla y rechazada por las Rules.
 *  · `gastos` ya admite la creación por `carterasEscritura()`; `inmuebles`
 *    debía ofrecer la misma vía legítima, con el MISMO predicado que su
 *    `update` (`inmuebleEnCarteraEscritura`): lo que el gestor puede escribir
 *    después, puede crearlo. Sin ampliar identidad ni ámbito.
 *
 * Método: mismo harness que el resto de pruebas de reglas
 * (`tests/harness/firestoreRulesEval.ts`, que evalúa el TEXTO REAL de
 * `firestore.rules`). No sustituye al emulador oficial (no disponible en Arena).
 *
 * Contrato probado:
 *  POSITIVO  · titular propio (PROPIETARIO) crea para su propio propietarioId.
 *  POSITIVO  · gestor con gestión ACTIVA + LECTURA_ESCRITURA + GESTOR (índice
 *              `gestionesPorPropietario`) crea en la cartera gestionada.
 *  POSITIVO  · gestor con `carterasE` del espejo (vía plana) crea en esa cartera.
 *  NEGATIVO  · cartera sólo de LECTURA (carterasL / permiso LECTURA) no crea.
 *  NEGATIVO  · delegación PARCIAL (inmuebleIds no vacío) no crea.
 *  NEGATIVO  · gestión no ACEPTADA / no ACTIVA / responsable no GESTOR no crea.
 *  NEGATIVO  · cartera delegada con propietarioPrincipalId distinto no crea.
 *  NEGATIVO  · cartera delegada que declara titularesIds no crea (sin escalada
 *              a cotitular).
 *  NEGATIVO  · titular que crea para OTRO propietarioId no crea.
 *  NEGATIVO  · ADMINISTRADOR no master, PROFESIONAL sin cartera, anónimo: no crean.
 *  POSITIVO  · master crea (sin cambios).
 *  INVARIANTE· si `update` autoriza un documento, `get` también lo autoriza
 *              (base de la comprobación de existencia del adaptador: una lectura
 *              denegada implica que tampoco puede sobrescribirse el documento).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
import { completarPerfilesSinteticos } from './harness/perfilesSinteticos';

const RAIZ = resolve(__dirname, '..');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const { permite, SIN_COMENTARIOS } = crearEvaluadorReglas(RULES);

const EMAIL_ADMIN = (
  SIN_COMENTARIOS(RULES).match(/function\s+isMasterAdmin\(\)\s*\{[\s\S]*?'([^'@\s]+@[^'\s]+)'/) || []
)[1];
if (!EMAIL_ADMIN) throw new Error('isMasterAdmin() no contiene un email literal: fichero equivocado');

const ACTIVA_ESCRITURA = {
  estado: 'ACTIVA', permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR',
  resolucionInvitacion: 'ACEPTADA', inmuebleIds: [],
};

const FIRESTORE: Peticion['db'] = {
  // Titular propio
  'usuarios_auth/uid_titular': { usuarioId: 'usuario_titular', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_T', profesionalId: '', inmuebleIds: [] },
  // Gestor con gestión completa de escritura sobre prop_X (índice D1R)
  'usuarios_auth/uid_gestorE': {
    usuarioId: 'usuario_gestorE', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_GE', profesionalId: '', inmuebleIds: [],
    gestionesPorPropietario: { prop_X: 'ges_X_E' },
  },
  'gestiones_cartera/ges_X_E': { id: 'ges_X_E', propietarioId: 'prop_X', gestorUsuarioId: 'usuario_gestorE', ...ACTIVA_ESCRITURA },
  // Gestor sólo de LECTURA sobre prop_Y
  'usuarios_auth/uid_gestorL': {
    usuarioId: 'usuario_gestorL', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_GL', profesionalId: '', inmuebleIds: [],
    gestionesPorPropietario: { prop_Y: 'ges_Y_L' },
  },
  'gestiones_cartera/ges_Y_L': { id: 'ges_Y_L', propietarioId: 'prop_Y', gestorUsuarioId: 'usuario_gestorL', ...ACTIVA_ESCRITURA, permiso: 'LECTURA' },
  // Gestor con delegación PARCIAL de escritura sobre prop_P
  'usuarios_auth/uid_gestorP': {
    usuarioId: 'usuario_gestorP', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_GP', profesionalId: '', inmuebleIds: [],
    gestionesPorPropietario: { prop_P: 'ges_P_parcial' },
  },
  'gestiones_cartera/ges_P_parcial': { id: 'ges_P_parcial', propietarioId: 'prop_P', gestorUsuarioId: 'usuario_gestorP', ...ACTIVA_ESCRITURA, inmuebleIds: ['inm_1'] },
  // Gestión de escritura PENDIENTE de aceptación sobre prop_N
  'usuarios_auth/uid_gestorN': {
    usuarioId: 'usuario_gestorN', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_GN', profesionalId: '', inmuebleIds: [],
    gestionesPorPropietario: { prop_N: 'ges_N_pend' },
  },
  'gestiones_cartera/ges_N_pend': { id: 'ges_N_pend', propietarioId: 'prop_N', gestorUsuarioId: 'usuario_gestorN', ...ACTIVA_ESCRITURA, resolucionInvitacion: 'PENDIENTE' },
  // Gestor con `carterasE` en el espejo (vía plana, proyección del master)
  'usuarios_auth/uid_carteraPlana': {
    tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_CP', profesionalId: '', inmuebleIds: [],
    carterasL: ['prop_Z'], carterasE: ['prop_Z'],
  },
  // PROFESIONAL gestor de escritura sobre prop_X (sólo puede entrar por la vía nueva)
  'usuarios_auth/uid_profGestor': {
    usuarioId: 'usuario_profGestor', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'prof_G', inmuebleIds: [],
    gestionesPorPropietario: { prop_X: 'ges_X_prof' },
  },
  'gestiones_cartera/ges_X_prof': { id: 'ges_X_prof', propietarioId: 'prop_X', gestorUsuarioId: 'usuario_profGestor', ...ACTIVA_ESCRITURA },
  // Gestor de sólo lectura en plano
  'usuarios_auth/uid_carteraSoloL': {
    tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_CL', profesionalId: '', inmuebleIds: [],
    carterasL: ['prop_W'],
  },
  // Profesional sin cartera
  'usuarios_auth/uid_prof': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [] },
  // Administrador NO master (ficha ADMINISTRADOR; sin espejo de titular)
  'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_admin' },
  // Inmuebles existentes para la comprobación de invariante
  'inmuebles/inm_T': { id: 'inm_T', propietarioId: 'prop_T', direccion: 'T 1' },
  'inmuebles/inm_X': { id: 'inm_X', propietarioId: 'prop_X', direccion: 'X 1', titularesIds: ['prop_X'] },
  'inmuebles/inm_1': { id: 'inm_1', propietarioId: 'prop_P', direccion: 'P 1' },
};
completarPerfilesSinteticos(FIRESTORE);

const AUTH = {
  titular: { uid: 'uid_titular', token: { email: 't@test.local' } },
  gestorE: { uid: 'uid_gestorE', token: { email: 'ge@test.local' } },
  gestorL: { uid: 'uid_gestorL', token: { email: 'gl@test.local' } },
  gestorP: { uid: 'uid_gestorP', token: { email: 'gp@test.local' } },
  gestorN: { uid: 'uid_gestorN', token: { email: 'gn@test.local' } },
  carteraPlana: { uid: 'uid_carteraPlana', token: { email: 'cp@test.local' } },
  carteraSoloL: { uid: 'uid_carteraSoloL', token: { email: 'cl@test.local' } },
  profGestor: { uid: 'uid_profGestor', token: { email: 'pg@test.local' } },
  prof: { uid: 'uid_prof', token: { email: 'p@test.local' } },
  admin: { uid: 'uid_admin', token: { email: 'admin@test.local' } },
  master: { uid: 'uid_master', token: { email: EMAIL_ADMIN } },
  anon: null,
} as const;

/** Alta de inmueble tal como la escribe el importador (sólo campos declarados). */
function altaCon(over: Record<string, unknown>): Record<string, unknown> {
  return { id: 'inm_nuevo', direccion: 'Calle Nueva 1', propietarioId: 'prop_T', propietarioPrincipalId: 'prop_T', ...over };
}

const crear = (auth: Peticion['auth'], datos: Record<string, unknown>): boolean =>
  permite('inmuebles', 'create', {
    auth, db: FIRESTORE, resource: null, requestResource: datos,
    docId: String(datos.id ?? 'inm_nuevo'),
  });

describe('create de inmuebles · vía del titular propio (sin cambios)', () => {
  it('POSITIVO · titular crea para su propio propietarioId', () => {
    expect(crear(AUTH.titular, altaCon({}))).toBe(true);
  });
  it('NEGATIVO · titular crea para OTRO propietarioId (sin cartera)', () => {
    expect(crear(AUTH.titular, altaCon({ propietarioId: 'prop_X', propietarioPrincipalId: 'prop_X' }))).toBe(false);
  });
  it('POSITIVO · master crea para cualquier propietarioId', () => {
    expect(crear(AUTH.master, altaCon({ propietarioId: 'prop_X', propietarioPrincipalId: 'prop_X' }))).toBe(true);
  });
});

describe('create de inmuebles · cartera delegada con permiso de ESCRITURA (vía nueva)', () => {
  const EN_CARTERA = { propietarioId: 'prop_X', propietarioPrincipalId: 'prop_X' };

  it('POSITIVO · gestor con gestión ACTIVA + LECTURA_ESCRITURA + GESTOR crea en su cartera', () => {
    expect(crear(AUTH.gestorE, altaCon(EN_CARTERA))).toBe(true);
  });
  it('POSITIVO · la misma vía sin propietarioPrincipalId también es válida', () => {
    const { propietarioPrincipalId: _omitido, ...sinPrincipal } = altaCon({ propietarioId: 'prop_X' });
    void _omitido;
    expect(crear(AUTH.gestorE, { ...sinPrincipal, propietarioId: 'prop_X' })).toBe(true);
  });
  it('POSITIVO · PROFESIONAL gestor de escritura crea en su cartera (vía nueva; activeUser)', () => {
    expect(crear(AUTH.profGestor, altaCon(EN_CARTERA))).toBe(true);
  });
  it('POSITIVO · cartera delegada por la vía plana del espejo (carterasE)', () => {
    expect(crear(AUTH.carteraPlana, altaCon({ propietarioId: 'prop_Z', propietarioPrincipalId: 'prop_Z' }))).toBe(true);
  });
  it('NEGATIVO · la cartera de escritura NO autoriza a crear en otra cartera', () => {
    expect(crear(AUTH.gestorE, altaCon({ propietarioId: 'prop_Y', propietarioPrincipalId: 'prop_Y' }))).toBe(false);
  });
  it('NEGATIVO · gestión de sólo LECTURA no crea (carterasL / permiso LECTURA)', () => {
    expect(crear(AUTH.gestorL, altaCon({ propietarioId: 'prop_Y', propietarioPrincipalId: 'prop_Y' }))).toBe(false);
    expect(crear(AUTH.carteraSoloL, altaCon({ propietarioId: 'prop_W', propietarioPrincipalId: 'prop_W' }))).toBe(false);
  });
  it('NEGATIVO · delegación PARCIAL (inmuebleIds no vacío) no crea', () => {
    expect(crear(AUTH.gestorP, altaCon({ propietarioId: 'prop_P', propietarioPrincipalId: 'prop_P' }))).toBe(false);
  });
  it('NEGATIVO · gestión aún no ACEPTADA no crea', () => {
    expect(crear(AUTH.gestorN, altaCon({ propietarioId: 'prop_N', propietarioPrincipalId: 'prop_N' }))).toBe(false);
  });
  it('NEGATIVO · cartera delegada con propietarioPrincipalId distinto no crea (sin segundo titular)', () => {
    // Se prueba con un PROFESIONAL gestor: sólo entra por la vía nueva. (Un PROPIETARIO
    // puede crear como propietarioPrincipalId propio por la rama de copropiedad
    // preexistente; ver nota de hallazgos en el informe.)
    expect(crear(AUTH.profGestor, altaCon({ propietarioId: 'prop_X', propietarioPrincipalId: 'prop_GE' }))).toBe(false);
    expect(crear(AUTH.profGestor, altaCon({ propietarioId: 'prop_X', propietarioPrincipalId: 'prop_X' }))).toBe(true);
  });
  it('NEGATIVO · cartera delegada que declara titularesIds no crea (sin escalada a cotitular)', () => {
    expect(crear(AUTH.gestorE, altaCon({ ...EN_CARTERA, titularesIds: ['prop_GE'] }))).toBe(false);
    expect(crear(AUTH.gestorE, altaCon({ ...EN_CARTERA, titularesIds: ['prop_X'] }))).toBe(false);
  });
  it('NEGATIVO · el gestor no se autoasigna como titular un pid ajeno a su sesión ni a su cartera', () => {
    expect(crear(AUTH.gestorE, altaCon({ propietarioId: 'prop_T', propietarioPrincipalId: 'prop_T' }))).toBe(false);
  });
});

describe('create de inmuebles · roles y sesiones que NO deben crear', () => {
  it('NEGATIVO · ADMINISTRADOR no master (perfil) no crea', () => {
    expect(crear(AUTH.admin, altaCon({ propietarioId: 'prop_X', propietarioPrincipalId: 'prop_X' }))).toBe(false);
  });
  it('NEGATIVO · PROFESIONAL sin cartera de escritura no crea', () => {
    expect(crear(AUTH.prof, altaCon({ propietarioId: 'prop_X', propietarioPrincipalId: 'prop_X' }))).toBe(false);
  });
  it('NEGATIVO · anónimo no crea', () => {
    expect(crear(AUTH.anon, altaCon({}))).toBe(false);
  });
});

describe('INVARIANTE · update ⇒ get (la comprobación de existencia no puede ocultar una sobrescritura)', () => {
  const ACTORES = Object.entries(AUTH).filter(([, a]) => a !== null) as Array<[string, NonNullable<(typeof AUTH)[keyof typeof AUTH]>]>;
  const DOCS = ['inm_T', 'inm_X', 'inm_1'];
  it('ningún actor puede actualizar un inmueble que no puede leer', () => {
    const incumplidos: string[] = [];
    for (const [nombre, auth] of ACTORES) {
      for (const id of DOCS) {
        const resource = FIRESTORE[`inmuebles/${id}`] as Record<string, unknown>;
        const puedeUpdate = permite('inmuebles', 'update', {
          auth, db: FIRESTORE, docId: id, resource, requestResource: { ...resource },
        });
        const puedeGet = permite('inmuebles', 'get', { auth, db: FIRESTORE, docId: id, resource, requestResource: null });
        if (puedeUpdate && !puedeGet) incumplidos.push(`${nombre}→${id}`);
      }
    }
    expect(incumplidos).toEqual([]);
  });
});
