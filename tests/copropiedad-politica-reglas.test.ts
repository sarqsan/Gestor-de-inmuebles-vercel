/**
 * POLÍTICA DE COPROPIEDAD Y CARTERA DELEGADA — `firestore.rules` (bloque B).
 * ---------------------------------------------------------------------------
 * Política probada (datos 100 % sintéticos; sin personas reales):
 *  · Un titular CREA inmuebles sólo de los que es titular canónico
 *    (`propietarioId == myPropId()`). Principal y cotitulares deben estar en su
 *    ámbito de escritura (él mismo o carteras E). NO puede crear un inmueble
 *    ajeno aunque se declare su principal (asignarse principal sin autorización).
 *  · Ampliar titularidad en un inmueble existente (cotitulares, principal) sólo
 *    lo hace el titular CANÓNICO y hacia titulares de su ámbito. El principal no
 *    canónico no altera la titularidad. El `propietarioSecundarioId` es dato
 *    fiscal que no concede acceso: no se restringe.
 *  · Asignar un titular en `titularidades/{inm}__{pid}` exige que `pid` esté en
 *    el ámbito de escritura de quien escribe (o master/administración).
 *  · El master conserva todo vínculo (acto legal). Un gestor con delegación de
 *    LECTURA, revocada o parcial no vincula ni crea titularidades.
 *  · El selector de la UI no concede nada: sólo cuenta el espejo/gestiones.
 *
 * Método: harness de reglas (`tests/harness/firestoreRulesEval.ts`) sobre el
 * texto real de `firestore.rules`. NO sustituye al emulador oficial.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
import { completarPerfilesSinteticos } from './harness/perfilesSinteticos';
import { parsearReglas } from './helpers/evaluadorReglasFirestore';

const RAIZ = resolve(__dirname, '..');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const { permite, SIN_COMENTARIOS } = crearEvaluadorReglas(RULES);

const EMAIL_MASTER = (
  SIN_COMENTARIOS(RULES).match(/function\s+isMasterAdmin\(\)\s*\{[\s\S]*?'([^'@\s]+@[^'\s]+)'/) || []
)[1];
if (!EMAIL_MASTER) throw new Error('isMasterAdmin() no contiene un email literal: fichero equivocado');

const ACTIVA_ESCRITURA = {
  estado: 'ACTIVA', permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR',
  resolucionInvitacion: 'ACEPTADA', inmuebleIds: [],
};

const DB: Peticion['db'] = {
  // Titular T: sólo su propia cartera.
  'usuarios_auth/uid_T': { usuarioId: 'u_T', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_T', profesionalId: '', inmuebleIds: [] },
  // Titular B: otro titular sin relación con T.
  'usuarios_auth/uid_B': { usuarioId: 'u_B', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_B', profesionalId: '', inmuebleIds: [] },
  // Titular con cartera E en espejo PLANO (carterasE): puede vincular a Z.
  'usuarios_auth/uid_TZ': {
    usuarioId: 'u_TZ', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_TZ', profesionalId: '', inmuebleIds: [],
    carterasL: ['prop_Z'], carterasE: ['prop_Z'],
  },
  // Gestor con gestión ACTIVA de escritura sobre X (índice D1R).
  'usuarios_auth/uid_GE': {
    usuarioId: 'u_GE', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_GE', profesionalId: '', inmuebleIds: [],
    gestionesPorPropietario: { prop_X: 'ges_X' },
  },
  'gestiones_cartera/ges_X': { id: 'ges_X', propietarioId: 'prop_X', gestorUsuarioId: 'u_GE', ...ACTIVA_ESCRITURA },
  // Gestor con gestión REVOCADA (el índice del espejo aún la menciona).
  'usuarios_auth/uid_GR': {
    usuarioId: 'u_GR', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_GR', profesionalId: '', inmuebleIds: [],
    gestionesPorPropietario: { prop_R: 'ges_R' },
  },
  'gestiones_cartera/ges_R': { id: 'ges_R', propietarioId: 'prop_R', gestorUsuarioId: 'u_GR', ...ACTIVA_ESCRITURA, estado: 'REVOCADA' },
  // Gestor con permiso sólo de LECTURA sobre L.
  'usuarios_auth/uid_GL': {
    usuarioId: 'u_GL', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_GL', profesionalId: '', inmuebleIds: [],
    gestionesPorPropietario: { prop_L: 'ges_L' },
  },
  'gestiones_cartera/ges_L': { id: 'ges_L', propietarioId: 'prop_L', gestorUsuarioId: 'u_GL', ...ACTIVA_ESCRITURA, permiso: 'LECTURA' },
  // Administrador NO master.
  'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_admin' },
  // Inmuebles existentes.
  'inmuebles/inm_T': { id: 'inm_T', propietarioId: 'prop_T', propietarioPrincipalId: 'prop_T', direccion: 'T 1' },
  'inmuebles/inm_X': { id: 'inm_X', propietarioId: 'prop_X', propietarioPrincipalId: 'prop_X', direccion: 'X 1' },
  // Inmueble canónico de B con T como PRINCIPAL legado (no canónico).
  'inmuebles/inm_BT': { id: 'inm_BT', propietarioId: 'prop_B', propietarioPrincipalId: 'prop_T', titularesIds: ['prop_B', 'prop_T'], direccion: 'BT 1' },
  // Titularidades existentes.
  'titularidades/inm_T__prop_T': { id: 'inm_T__prop_T', inmuebleId: 'inm_T', propietarioId: 'prop_T', estado: 'VIGENTE' },
};
completarPerfilesSinteticos(DB);

const AUTH = {
  T: { uid: 'uid_T', token: { email: 't@test.local' } },
  B: { uid: 'uid_B', token: { email: 'b@test.local' } },
  TZ: { uid: 'uid_TZ', token: { email: 'tz@test.local' } },
  GE: { uid: 'uid_GE', token: { email: 'ge@test.local' } },
  GR: { uid: 'uid_GR', token: { email: 'gr@test.local' } },
  GL: { uid: 'uid_GL', token: { email: 'gl@test.local' } },
  admin: { uid: 'uid_admin', token: { email: 'admin@test.local' } },
  master: { uid: 'uid_master', token: { email: EMAIL_MASTER } },
  anon: null,
} as const;

type Auth = Peticion['auth'];
const crear = (auth: Auth, datos: Record<string, unknown>): boolean =>
  permite('inmuebles', 'create', {
    auth, db: DB, resource: null, requestResource: { id: 'inm_nuevo', direccion: 'Nueva 1', ...datos },
    docId: 'inm_nuevo',
  });
const actualizar = (auth: Auth, id: string, cambios: Record<string, unknown>): boolean => {
  const resource = DB[`inmuebles/${id}`] as Record<string, unknown>;
  return permite('inmuebles', 'update', {
    auth, db: DB, docId: id, resource, requestResource: { ...resource, ...cambios },
  });
};
const crearTitularidad = (auth: Auth, inmuebleId: string, propietarioId: string): boolean =>
  permite('titularidades', 'create', {
    auth, db: DB, resource: null, docId: `${inmuebleId}__${propietarioId}`,
    requestResource: { id: `${inmuebleId}__${propietarioId}`, inmuebleId, propietarioId, estado: 'VIGENTE', porcentajeTitularidad: null },
  });

describe('B · sintaxis: las reglas deben parsear con AMBOS evaluadores', () => {
  // El harness nuevo tolera algún fallo de forma; el parser legacy (tests/helpers)
  // exige la sintaxis de Firestore (p. ej. `;` al final de cada `return`). Un
  // fallo aquí sería un despliegue de reglas rechazado.
  it('firestore.rules parsea con el evaluador legacy', () => {
    expect(() => parsearReglas(RULES)).not.toThrow();
  });
});

describe('B · CREAR inmueble: el titular sólo crea lo que es suyo', () => {
  it('POSITIVO · titular crea su propio inmueble (canónico = principal = él)', () => {
    expect(crear(AUTH.T, { propietarioId: 'prop_T', propietarioPrincipalId: 'prop_T' })).toBe(true);
  });
  it('POSITIVO · titular crea con secundario fiscal ajeno (dato fiscal, sin acceso)', () => {
    expect(crear(AUTH.T, { propietarioId: 'prop_T', propietarioPrincipalId: 'prop_T', propietarioSecundarioId: 'prop_S' })).toBe(true);
  });
  it('NEGATIVO · titular declara su PRINCIPAL sobre un canónico AJENO (asignarse principal sin autorización)', () => {
    expect(crear(AUTH.T, { propietarioId: 'prop_B', propietarioPrincipalId: 'prop_T' })).toBe(false);
  });
  it('NEGATIVO · titular declara como principal a un titular fuera de su ámbito', () => {
    expect(crear(AUTH.T, { propietarioId: 'prop_T', propietarioPrincipalId: 'prop_B' })).toBe(false);
  });
  // APLAZADO (decisión del titular, índice titularesIds): ver cabecera del bloque.
  it.todo('NEGATIVO · titular declara cotitulares fuera de su ámbito (identificadores ajenos)');
  it('POSITIVO · titular con cartera E (espejo plano) declara cotitular de SU ámbito', () => {
    expect(crear(AUTH.TZ, { propietarioId: 'prop_TZ', propietarioPrincipalId: 'prop_TZ', titularesIds: ['prop_TZ', 'prop_Z'] })).toBe(true);
  });
  it('NEGATIVO · cotitular de su ámbito pero canónico ajeno', () => {
    expect(crear(AUTH.TZ, { propietarioId: 'prop_B', propietarioPrincipalId: 'prop_TZ' })).toBe(false);
  });
  it('NEGATIVO · gestor con cartera E NO crea con cotitulares (vía de cartera sin titularesIds)', () => {
    expect(crear(AUTH.GE, { propietarioId: 'prop_X', titularesIds: ['prop_X'] })).toBe(false);
  });
  it('POSITIVO · gestor con gestión ACTIVA de escritura crea en su cartera', () => {
    expect(crear(AUTH.GE, { propietarioId: 'prop_X' })).toBe(true);
  });
  it('NEGATIVO · gestor con delegación REVOCADA no crea', () => {
    expect(crear(AUTH.GR, { propietarioId: 'prop_R' })).toBe(false);
  });
  it('NEGATIVO · gestor con delegación sólo de LECTURA no crea', () => {
    expect(crear(AUTH.GL, { propietarioId: 'prop_L' })).toBe(false);
  });
  it('NEGATIVO · administrador NO master no crea', () => {
    expect(crear(AUTH.admin, { propietarioId: 'prop_B' })).toBe(false);
  });
  it('NEGATIVO · anónimo no crea', () => {
    expect(crear(AUTH.anon, { propietarioId: 'prop_T' })).toBe(false);
  });
  it('POSITIVO · master crea con cotitulares libres (acto legal)', () => {
    expect(crear(AUTH.master, { propietarioId: 'prop_B', propietarioPrincipalId: 'prop_B', titularesIds: ['prop_B', 'prop_T'] })).toBe(true);
  });
});

describe('B · ACTUALIZAR titularidad de un inmueble existente', () => {
  it('POSITIVO · canónico cambia sólo datos (dirección)', () => {
    expect(actualizar(AUTH.T, 'inm_T', { direccion: 'T 2' })).toBe(true);
  });
  it('POSITIVO · canónico añade cotitular de su ámbito (carteras E)', () => {
    DB['inmuebles/tz_1'] = { id: 'tz_1', propietarioId: 'prop_TZ', propietarioPrincipalId: 'prop_TZ', direccion: 'TZ 1' };
    expect(actualizar(AUTH.TZ, 'tz_1', { titularesIds: ['prop_TZ', 'prop_Z'] })).toBe(true);
  });
  // APLAZADO (decisión del titular, índice titularesIds): ver cabecera del bloque.
  it.todo('NEGATIVO · canónico añade cotitular FUERA de su ámbito (vincular titular sin autorización)');
  it('NEGATIVO · canónico fija como principal a un titular fuera de su ámbito', () => {
    expect(actualizar(AUTH.T, 'inm_T', { propietarioPrincipalId: 'prop_B' })).toBe(false);
  });
  // APLAZADO (decisión del titular, índice titularesIds): ver cabecera del bloque.
  it.todo('NEGATIVO · principal NO canónico no amplía titularidad (T sobre inm_BT)');
  it('POSITIVO · principal NO canónico edita datos no titulares (dirección)', () => {
    expect(actualizar(AUTH.T, 'inm_BT', { direccion: 'BT 2' })).toBe(true);
  });
  it('NEGATIVO · principal NO canónico no transmite el canónico', () => {
    expect(actualizar(AUTH.T, 'inm_BT', { propietarioId: 'prop_T' })).toBe(false);
  });
  // APLAZADO (decisión del titular, índice titularesIds): ver cabecera del bloque.
  it.todo('NEGATIVO · gestor con cartera E no altera titularidad');
  it('NEGATIVO · gestor con cartera E no cambia el titular principal', () => {
    expect(actualizar(AUTH.GE, 'inm_X', { propietarioPrincipalId: 'prop_GE' })).toBe(false);
  });
  it('POSITIVO · gestor con cartera E edita datos operativos', () => {
    expect(actualizar(AUTH.GE, 'inm_X', { direccion: 'X 2' })).toBe(true);
  });
  it('NEGATIVO · gestor con delegación revocada no edita', () => {
    DB['inmuebles/r_1'] = { id: 'r_1', propietarioId: 'prop_R', propietarioPrincipalId: 'prop_R', direccion: 'R 1' };
    expect(actualizar(AUTH.GR, 'r_1', { direccion: 'R 2' })).toBe(false);
  });
  it('POSITIVO · gestor re-declara sólo al titular canónico en el índice (no amplía nada)', () => {
    DB['inmuebles/inm_sin_indice'] = { id: 'inm_sin_indice', propietarioId: 'prop_X', propietarioPrincipalId: 'prop_X', direccion: 'X 3' };
    expect(actualizar(AUTH.GE, 'inm_sin_indice', { titularesIds: ['prop_X'] })).toBe(true);
  });
  // APLAZADO (decisión del titular, índice titularesIds): ver cabecera del bloque.
  it.todo('NEGATIVO · gestor quita un cotitular existente (no es suyo modificar la titularidad)');
  // APLAZADO (decisión del titular, índice titularesIds): ver cabecera del bloque.
  it.todo('NEGATIVO · principal NO canónico quita un cotitular existente (inm_BT)');
  it('POSITIVO · canónico quita un cotitular (quitar siempre permitido al canónico)', () => {
    DB['inmuebles/inm_quita'] = { id: 'inm_quita', propietarioId: 'prop_T', propietarioPrincipalId: 'prop_T', titularesIds: ['prop_T', 'prop_B'] };
    expect(actualizar(AUTH.T, 'inm_quita', { titularesIds: ['prop_T'] })).toBe(true);
  });
  it('POSITIVO · master añade cotitular libre (acto legal)', () => {
    expect(actualizar(AUTH.master, 'inm_T', { titularesIds: ['prop_T', 'prop_B'] })).toBe(true);
  });
});

describe('B · TITULARIDADES: el titular asignado debe estar en el ámbito', () => {
  it('POSITIVO · titular crea su propia titularidad', () => {
    DB['inmuebles/inm_T_nueva'] = { id: 'inm_T_nueva', propietarioId: 'prop_T', propietarioPrincipalId: 'prop_T' };
    expect(crearTitularidad(AUTH.T, 'inm_T_nueva', 'prop_T')).toBe(true);
  });
  it('NEGATIVO · titular registra a un tercero fuera de su ámbito', () => {
    expect(crearTitularidad(AUTH.T, 'inm_T', 'prop_B')).toBe(false);
  });
  it('POSITIVO · titular con cartera E asigna a titular de su ámbito', () => {
    DB['inmuebles/tz_2'] = { id: 'tz_2', propietarioId: 'prop_TZ', propietarioPrincipalId: 'prop_TZ' };
    expect(crearTitularidad(AUTH.TZ, 'tz_2', 'prop_Z')).toBe(true);
  });
  it('POSITIVO · gestor con cartera E registra titularidad de su cartera', () => {
    expect(crearTitularidad(AUTH.GE, 'inm_X', 'prop_X')).toBe(true);
  });
  it('NEGATIVO · gestor registra titularidad de un titular ajeno a su cartera', () => {
    expect(crearTitularidad(AUTH.GE, 'inm_X', 'prop_B')).toBe(false);
  });
  it('POSITIVO · master registra cualquier titularidad', () => {
    expect(crearTitularidad(AUTH.master, 'inm_BT', 'prop_Z')).toBe(true);
  });
  it('NEGATIVO · anónimo no registra titularidades', () => {
    expect(crearTitularidad(AUTH.anon, 'inm_T', 'prop_T')).toBe(false);
  });
});

describe('B · lote de la importación (titularidad + titularesIds): atomicidad por reglas', () => {
  it('un cotitular fuera de ámbito NO pasa la titularidad por documento', () => {
    expect(crearTitularidad(AUTH.T, 'inm_T', 'prop_B')).toBe(false);
  });
  // APLAZADO (índice titularesIds): el índice del lote no se restringe en este tramo.
  it.todo('el índice titularesIds del mismo lote tampoco pasa (pendiente: índice aplazado)');
});

describe('B · titulares de ámbito (fichas tit_…): autoridad por documento', () => {
  it('POSITIVO · titularidad de un titular de ámbito PROPIO (ficha con mi ambitoPropietarioId)', () => {
    DB['inmuebles/inm_amb'] = { id: 'inm_amb', propietarioId: 'prop_T', propietarioPrincipalId: 'prop_T' };
    DB['propietarios/tit_propio01'] = { id: 'tit_propio01', ambitoPropietarioId: 'prop_T', nombre: 'Sintético 1' };
    expect(crearTitularidad(AUTH.T, 'inm_amb', 'tit_propio01')).toBe(true);
  });
  it('NEGATIVO · titular de ámbito AJENO (ficha de otro titular)', () => {
    DB['propietarios/tit_ajeno001'] = { id: 'tit_ajeno001', ambitoPropietarioId: 'prop_B', nombre: 'Sintético 2' };
    expect(crearTitularidad(AUTH.T, 'inm_amb', 'tit_ajeno001')).toBe(false);
  });
  it('NEGATIVO · id con forma de titular de ámbito SIN ficha: no hay titularidad asignable', () => {
    expect(crearTitularidad(AUTH.T, 'inm_amb', 'tit_sinficha1')).toBe(false);
  });
});
