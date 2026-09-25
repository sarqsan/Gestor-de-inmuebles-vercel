/**
 * LOGIN DEL ADMINISTRADOR PRINCIPAL · diagnóstico y reparación mínima.
 * ---------------------------------------------------------------------------------
 * Diagnóstico (sobre 28e40db):
 *  1. `Missing or insufficient permissions` en el login lo produce Firestore cuando:
 *     a) Firebase Auth tiene el proveedor Email/Contraseña deshabilitado
 *        (`auth/operation-not-allowed`) y el «acceso directo» lee
 *        `usuarios/user_admin_principal` SIN `request.auth` → las reglas deniegan
 *        (`allow get: if isSignedIn() && …`). El error salía sin traducir.
 *     b) la escritura informativa de `lastLoginAt` (`setDoc(usuarios/{id})`) no estaba
 *        protegida: un rechazo ahí tumbaba un login YA autenticado por Firebase Auth
 *        y, además, se saltaba la auditoría y el espejo `usuarios_auth`.
 *  2. `saveAuditLogFirestore` (= `registrarAuditoriaFirestore`) y `syncAuthIndex` ya
 *     absorbían sus errores; `lastLoginAt` era la única escritura post-auth que no.
 *
 * Reparación (sin tocar `firestore.rules` ni datos):
 *  · `lastLoginAt` es best-effort (no bloquea).
 *  · el rechazo de permisos se traduce a un mensaje accionable; NO se rodea: el modo
 *    directo sigue sin acceso a `usuarios/*` y las credenciales incorrectas siguen fallando.
 *
 * GRUPO A: reglas REALES (`firestore.rules`) con el evaluador compartido del arnés.
 * GRUPO B: código REAL de `loginWithEmail` contra Firebase simulado (sin red).
 * GRUPO C: invariantes de fuente (auditoría absorbe errores, sin bypass, reglas intactas).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';

const RAIZ = path.resolve(__dirname, '..');
const RULES = readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');
const { permite } = crearEvaluadorReglas(RULES);

const ADMIN_EMAIL = 'sarqsan2@gmail.com';
const ADMIN_ID = 'user_admin_principal';
const ADMIN_UID = 'uid-admin';

const perfilAdmin = (over: Record<string, unknown> = {}) => ({
  id: ADMIN_ID,
  authUid: ADMIN_UID,
  nombre: 'Administrador Principal',
  email: ADMIN_EMAIL,
  tipoPerfil: 'ADMINISTRADOR',
  estado: 'ACTIVO',
  roles: ['SUPERADMIN'],
  permisos: ['todo'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

function pet(o: {
  auth: Peticion['auth'];
  docId: string;
  resource?: Record<string, unknown> | null;
  requestResource?: Record<string, unknown> | null;
  db?: Record<string, Record<string, unknown>>;
}): Peticion {
  return {
    auth: o.auth,
    db: o.db || {},
    resource: o.resource ?? null,
    requestResource: o.requestResource ?? null,
    docId: o.docId,
  } as Peticion;
}

// ===========================================================================
// GRUPO A · qué permiten las reglas desplegadas (no se modifican)
// ===========================================================================
describe('Login admin · A. Security Rules reales', () => {
  it('A.1 sin sesión Firebase Auth NO se puede leer `usuarios/user_admin_principal` (origen del error)', () => {
    expect(permite('usuarios', 'get', pet({ auth: null, docId: ADMIN_ID, resource: perfilAdmin() }))).toBe(false);
  });

  it('A.2 sin sesión tampoco se puede escribir `lastLoginAt` ni auditar', () => {
    const r = perfilAdmin();
    expect(permite('usuarios', 'update', pet({
      auth: null, docId: ADMIN_ID, resource: r, requestResource: { ...r, lastLoginAt: '2026-09-24T10:00:00.000Z' },
    }))).toBe(false);
    expect(permite('audit_logs', 'create', pet({ auth: null, docId: 'audit_1', requestResource: { id: 'audit_1' } }))).toBe(false);
  });

  it('A.3 con sesión Firebase Auth del administrador principal, lectura y `lastLoginAt` están permitidos', () => {
    const auth = { uid: ADMIN_UID, token: { email: ADMIN_EMAIL } };
    const r = perfilAdmin();
    expect(permite('usuarios', 'get', pet({ auth, docId: ADMIN_ID, resource: r }))).toBe(true);
    expect(permite('usuarios', 'update', pet({
      auth, docId: ADMIN_ID, resource: r, requestResource: { ...r, lastLoginAt: '2026-09-24T10:00:00.000Z' },
    }))).toBe(true);
  });

  it('A.4 un usuario autenticado ajeno no puede escribir `lastLoginAt` en la ficha del administrador', () => {
    const r = perfilAdmin();
    const otro = { uid: 'uid-otro', token: { email: 'otro@erp.test' } };
    expect(permite('usuarios', 'update', pet({
      auth: otro, docId: ADMIN_ID, resource: r, requestResource: { ...r, lastLoginAt: '2026-09-24T10:00:00.000Z' },
      db: { 'usuarios/uid-otro': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' } },
    }))).toBe(false);
  });
});

// ===========================================================================
// GRUPO B · el código real de `loginWithEmail`
// ===========================================================================
const st = vi.hoisted(() => ({
  authModo: 'ok' as 'ok' | 'disabled' | 'invalid',
  denegarLecturaUsuarios: false,
  denegarLastLogin: false,
  docs: {} as Record<string, Record<string, unknown>>,
  escrituras: [] as { ruta: string; datos: Record<string, unknown> }[],
  auditorias: [] as Record<string, unknown>[],
  signOuts: 0,
}));

const errPermisos = () =>
  Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied', name: 'FirebaseError' });

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, nombre: string) => ({ __col: nombre }),
  doc: (_db: unknown, nombre: string, id?: string) => ({ __ruta: id ? `${nombre}/${id}` : nombre }),
  getDoc: async (ref: { __ruta: string }) => {
    if (st.denegarLecturaUsuarios && ref.__ruta.startsWith('usuarios/')) throw errPermisos();
    const d = st.docs[ref.__ruta];
    return { exists: () => !!d, id: ref.__ruta.split('/')[1], data: () => d };
  },
  getDocs: async () => {
    if (st.denegarLecturaUsuarios) throw errPermisos();
    return { empty: true, size: 0, docs: [], forEach: () => undefined };
  },
  query: (c: unknown) => ({ __q: c }),
  where: (campo: string, op: string, valor: unknown) => ({ campo, op, valor }),
  setDoc: async (ref: { __ruta: string }, datos: Record<string, unknown>) => {
    const soloLastLogin = Object.keys(datos).length === 1 && 'lastLoginAt' in datos;
    if (st.denegarLastLogin && soloLastLogin) throw errPermisos();
    st.escrituras.push({ ruta: ref.__ruta, datos });
  },
}));

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: async (_a: unknown, email: string) => {
    if (st.authModo === 'disabled') throw Object.assign(new Error('auth/operation-not-allowed'), { code: 'auth/operation-not-allowed' });
    if (st.authModo === 'invalid') throw Object.assign(new Error('auth/invalid-credential'), { code: 'auth/invalid-credential' });
    return { user: { uid: ADMIN_UID, email } };
  },
  createUserWithEmailAndPassword: async () => ({}),
  signOut: async () => { st.signOuts++; },
  onAuthStateChanged: () => () => undefined,
  updateProfile: async () => undefined,
}));

vi.mock('../src/lib/firebase', () => ({
  auth: { currentUser: null },
  db: { __db: true },
  USUARIOS_COL: 'usuarios',
  ENLACES_REGISTRO_COL: 'enlaces_registro',
  // réplica del contrato real: absorbe cualquier error (ver C.1)
  saveAuditLogFirestore: async (log: Record<string, unknown>) => { st.auditorias.push(log); },
}));

const cargar = async () => (await import('../src/lib/authService')) as typeof import('../src/lib/authService');

describe('Login admin · B. `loginWithEmail`', () => {
  const ls = new Map<string, string>();
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (ls.has(k) ? ls.get(k)! : null),
      setItem: (k: string, v: string) => void ls.set(k, String(v)),
      removeItem: (k: string) => void ls.delete(k),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    st.docs = { [`usuarios/${ADMIN_ID}`]: perfilAdmin() };
  });
  afterEach(() => {
    Object.assign(st, { authModo: 'ok', denegarLecturaUsuarios: false, denegarLastLogin: false, signOuts: 0 });
    st.escrituras.length = 0;
    st.auditorias.length = 0;
    ls.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('B.1 camino feliz: Firebase Auth + perfil → acceso, lastLoginAt, auditoría y espejo', async () => {
    const { loginWithEmail } = await cargar();
    const r = await loginWithEmail(ADMIN_EMAIL, 'secreto');
    expect(r.usuarioApp.id).toBe(ADMIN_ID);
    expect(st.escrituras.some((e) => e.ruta === `usuarios/${ADMIN_ID}` && 'lastLoginAt' in e.datos)).toBe(true);
    expect(st.escrituras.some((e) => e.ruta === `usuarios_auth/${ADMIN_UID}`)).toBe(true);
    expect(st.auditorias.map((a) => a.accion)).toContain('LOGIN_EXITOSO');
  });

  it('B.2 REPARACIÓN: si `lastLoginAt` es denegado, el login autenticado NO se bloquea', async () => {
    st.denegarLastLogin = true;
    const { loginWithEmail } = await cargar();
    const r = await loginWithEmail(ADMIN_EMAIL, 'secreto');
    expect(r.usuarioApp.id).toBe(ADMIN_ID);
    expect(r.firebaseUser?.uid).toBe(ADMIN_UID);
    // lastLoginAt no llegó a escribirse…
    expect(st.escrituras.some((e) => 'lastLoginAt' in e.datos && Object.keys(e.datos).length === 1)).toBe(false);
    // …pero la auditoría y el espejo de identidad siguen produciéndose
    expect(st.auditorias.map((a) => a.accion)).toContain('LOGIN_EXITOSO');
    expect(st.escrituras.some((e) => e.ruta === `usuarios_auth/${ADMIN_UID}`)).toBe(true);
    expect(st.signOuts).toBe(0);
  });

  it('B.3 REPARACIÓN: Auth deshabilitado + lectura denegada → mensaje accionable, sin sesión ni escrituras', async () => {
    st.authModo = 'disabled';
    st.denegarLecturaUsuarios = true;
    const { loginWithEmail, MENSAJE_LOGIN_SIN_PERMISOS } = await cargar();
    await expect(loginWithEmail(ADMIN_EMAIL, 'secreto')).rejects.toThrow(MENSAJE_LOGIN_SIN_PERMISOS);
    expect(MENSAJE_LOGIN_SIN_PERMISOS).toMatch(/Firebase Authentication/);
    expect(MENSAJE_LOGIN_SIN_PERMISOS).toMatch(/Sign-in method/);
    // seguridad intacta: ni perfil creado, ni sesión local, ni auditoría de éxito
    expect(st.escrituras).toHaveLength(0);
    expect(ls.get('rentselect_active_session')).toBeUndefined();
    expect(st.auditorias).toHaveLength(0);
  });

  it('B.4 el mismo tratamiento para un usuario no administrador en modo directo', async () => {
    st.authModo = 'disabled';
    st.denegarLecturaUsuarios = true;
    const { loginWithEmail, MENSAJE_LOGIN_SIN_PERMISOS } = await cargar();
    await expect(loginWithEmail('ana@erp.test', 'x')).rejects.toThrow(MENSAJE_LOGIN_SIN_PERMISOS);
    expect(st.escrituras).toHaveLength(0);
  });

  it('B.5 sin bypass: credenciales incorrectas siguen propagando el error de Firebase Auth', async () => {
    st.authModo = 'invalid';
    const { loginWithEmail } = await cargar();
    await expect(loginWithEmail(ADMIN_EMAIL, 'mala')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    expect(st.escrituras).toHaveLength(0);
    expect(ls.size).toBe(0);
  });

  it('B.6 sin bypass: una cuenta BLOQUEADA sigue rechazada aunque lastLoginAt falle', async () => {
    st.docs[`usuarios/${ADMIN_ID}`] = perfilAdmin({ estado: 'BLOQUEADO' });
    st.denegarLastLogin = true;
    const { loginWithEmail } = await cargar();
    await expect(loginWithEmail(ADMIN_EMAIL, 'secreto')).rejects.toThrow(/bloqueada/);
    expect(st.signOuts).toBe(1);
  });

  it('B.7 errores ajenos a permisos NO se enmascaran como problema de permisos', async () => {
    const { mensajeErrorLogin, esErrorPermisosFirestore } = await cargar();
    expect(esErrorPermisosFirestore(errPermisos())).toBe(true);
    expect(esErrorPermisosFirestore({ code: 'firestore/permission-denied' })).toBe(true);
    expect(esErrorPermisosFirestore(new Error('FirebaseError: Missing or insufficient permissions.'))).toBe(true);
    expect(esErrorPermisosFirestore(new Error('Contraseña incorrecta.'))).toBe(false);
    expect(esErrorPermisosFirestore({ code: 'unavailable' })).toBe(false);
    expect(esErrorPermisosFirestore(null)).toBe(false);
    expect(mensajeErrorLogin({ code: 'auth/invalid-credential' })).toBeNull();
    expect(mensajeErrorLogin(errPermisos())).toMatch(/Firebase Authentication/);
  });
});

// ===========================================================================
// GRUPO C · invariantes de fuente
// ===========================================================================
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
const cuerpoDe = (src: string, re: RegExp) => {
  const i = src.search(re);
  expect(i).toBeGreaterThan(-1);
  const fin = src.slice(i + 10).search(/\nexport\s/);
  return src.slice(i, fin > 0 ? i + 10 + fin : undefined);
};

describe('Login admin · C. invariantes', () => {
  const firebaseSrc = sinComentarios(readFileSync(path.join(RAIZ, 'src/lib/firebase.ts'), 'utf8'));
  const authSrc = sinComentarios(readFileSync(path.join(RAIZ, 'src/lib/authService.ts'), 'utf8'));

  it('C.1 `registrarAuditoriaFirestore` absorbe sus errores y `saveAuditLogFirestore` es el mismo', () => {
    const cuerpo = cuerpoDe(firebaseSrc, /export\s+async\s+function\s+registrarAuditoriaFirestore\b/);
    expect(cuerpo).toMatch(/try\s*\{[\s\S]*setDoc\([\s\S]*\}\s*catch\s*\(/);
    expect(firebaseSrc).toMatch(/export\s+const\s+saveAuditLogFirestore\s*=\s*registrarAuditoriaFirestore\s*;/);
  });

  it('C.2 `syncAuthIndex` absorbe sus errores', () => {
    const cuerpo = cuerpoDe(authSrc, /export\s+async\s+function\s+syncAuthIndex\b/);
    expect(cuerpo).toMatch(/try\s*\{[\s\S]*setDoc\([\s\S]*\}\s*catch\s*\(/);
  });

  it('C.3 en `loginWithEmail` la escritura de `lastLoginAt` está dentro de try/catch', () => {
    const cuerpo = cuerpoDe(authSrc, /export\s+async\s+function\s+loginWithEmail\b/);
    const i = cuerpo.search(/\{\s*lastLoginAt:\s*new Date\(\)\.toISOString\(\)\s*\}/);
    expect(i).toBeGreaterThan(-1);
    const antes = cuerpo.slice(0, i);
    expect(antes.lastIndexOf('try {')).toBeGreaterThan(antes.lastIndexOf('localStorage.setItem'));
    expect(cuerpo.slice(i)).toMatch(/^[\s\S]*?\}\s*catch\s*\(/);
  });

  it('C.4 sin bypass: el cliente no concede acceso ante un rechazo de permisos', () => {
    const cuerpo = cuerpoDe(authSrc, /export\s+async\s+function\s+loginWithEmail\b/);
    // cada uso de la detección de permisos termina en `throw`
    const usos = cuerpo.match(/esErrorPermisosFirestore\([^)]*\)[^\n;]*/g) || [];
    expect(usos.length).toBeGreaterThan(0);
    for (const u of usos) expect(u).toMatch(/throw/);
  });

  it('C.5 `firestore.rules` mantiene la exigencia de sesión en `usuarios` y `audit_logs`', () => {
    const r = sinComentarios(RULES);
    expect(r).toMatch(/match \/usuarios\/\{usuarioId\}\s*\{[\s\S]*?allow get: if isSignedIn\(\) &&/);
    expect(r).toMatch(/match \/audit_logs\/\{auditId\}\s*\{[\s\S]*?allow create: if isSignedIn\(\);/);
  });
});
