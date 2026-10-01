/**
 * «Lectura · Carteras: No tienes permisos…» — consulta REAL → usuario → regla → resultado.
 * ---------------------------------------------------------------------------
 * Qué demuestra este test (y qué NO):
 *
 *  · Usa la función REAL del cliente (`subscribeGestionesCarteraGestor`), así que la
 *    consulta que se somete a las reglas es exactamente la que ejecuta `App`:
 *    `gestiones_cartera where gestorUsuarioId == <id de perfil>`.
 *  · La somete al TEXTO REAL de `firestore.rules` mediante el evaluador del repo
 *    (`tests/harness/firestoreRulesEval.ts`). Para decidir si una CONSULTA es
 *    autorizable evalúa la regla sobre un documento REPRESENTANTE que solo conoce
 *    los campos que la propia consulta fija (igualdad): lo que no fija la consulta
 *    no existe para la regla. Así un titular SIN ninguna cartera (resultado vacío)
 *    se juzga igual que uno con cien: Firestore no usa las reglas como filtro.
 *  · NO sustituye al motor de Google: no hay emulador en este entorno (sin Java y
 *    sin salida de red a storage.googleapis.com). El planificador real de consultas
 *    y las reglas PUBLICADAS en Firebase quedan sin verificar aquí; la
 *    instrumentación `[diag:carteras]` existe precisamente para cerrar ese hueco.
 *
 * Cada denegación se acompaña del veredicto del diagnóstico, para fijar que cada
 * causa posible queda DISTINGUIDA de las demás (y de «reglas publicadas distintas»).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';

const RAIZ = resolve(__dirname, '..');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const CONFIG = JSON.parse(readFileSync(resolve(RAIZ, 'firebase-applet-config.json'), 'utf8'));

/** Reglas «publicadas» que aplica el doble: por defecto, las del repositorio. */
let permite = crearEvaluadorReglas(RULES).permite;

type Doc = Record<string, unknown>;
const mundo = vi.hoisted(() => ({
  authUid: null as string | null,
  db: {} as Record<string, Record<string, unknown>>,
  /** Gancho para simular que el estado cambia entre la denegación y el reintento. */
  antesDeGetDocs: null as null | (() => void),
}));

vi.mock('firebase/app', () => ({ initializeApp: () => ({}), getApps: () => [] }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({
    get currentUser() {
      return mundo.authUid ? { uid: mundo.authUid } : null;
    },
  }),
}));
vi.mock('firebase/storage', () => ({
  getStorage: () => ({}), ref: () => ({}), uploadBytes: async () => ({}),
  uploadString: async () => ({}), getDownloadURL: async () => '', deleteObject: async () => {},
}));

vi.mock('firebase/firestore', () => {
  const errorPermisos = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  const peticion = (resource: Doc | null, docId: string): Peticion => ({
    auth: mundo.authUid ? { uid: mundo.authUid, token: { email: 'prop@test.local', email_verified: true } } : null,
    db: mundo.db,
    resource,
    requestResource: null,
    docId,
  });
  const consultaAutorizada = (col: string, filtros: Array<{ campo: string; valor: unknown }>): boolean => {
    // Documento representante: SOLO los campos que fija la consulta (igualdad).
    const representante = Object.fromEntries(filtros.map((f) => [f.campo, f.valor]));
    try { return permite(col, 'list', peticion(representante, 'x')); } catch { return false; }
  };
  const docsDe = (col: string, filtros: Array<{ campo: string; valor: unknown }>) =>
    Object.entries(mundo.db)
      .filter(([ruta]) => ruta.startsWith(`${col}/`))
      .map(([ruta, d]) => ({ id: ruta.slice(col.length + 1), d }))
      .filter(({ d }) => filtros.every((f) => d[f.campo] === f.valor))
      .map(({ id, d }) => ({ id, data: () => d, exists: () => true }));
  return {
    getFirestore: () => ({}),
    collection: (_db: unknown, nombre: string) => ({ __col: nombre }),
    doc: (...args: any[]) => {
      const col = args.length === 2 ? args[0].__col : args[1];
      const id = args.length === 2 ? args[1] : args[2];
      return { __col: col, id, path: `${col}/${id}` };
    },
    where: (campo: string, _op: string, valor: unknown) => ({ campo, valor }),
    query: (col: any, ...filtros: any[]) => ({ __col: col.__col, filtros: filtros.filter((f) => f && f.campo) }),
    onSnapshot: (ref: any, onNext: (s: any) => void, onError?: (e: unknown) => void) => {
      let vivo = true;
      void Promise.resolve().then(() => {
        if (!vivo) return;
        if (!consultaAutorizada(ref.__col, ref.filtros)) { onError?.(errorPermisos()); return; }
        const docs = docsDe(ref.__col, ref.filtros);
        onNext({ docs, metadata: { fromCache: false } });
      });
      return () => { vivo = false; };
    },
    getDocs: async (ref: any) => {
      mundo.antesDeGetDocs?.();
      if (!consultaAutorizada(ref.__col, ref.filtros)) throw errorPermisos();
      return { docs: docsDe(ref.__col, ref.filtros) };
    },
    getDoc: async (ref: any) => {
      const d = mundo.db[ref.path] ?? null;
      let permitido = false;
      try { permitido = permite(ref.__col, 'get', peticion(d, ref.id)); } catch { permitido = false; }
      if (!permitido) throw errorPermisos();
      return { exists: () => d !== null, data: () => d };
    },
    setDoc: async () => {}, deleteDoc: async () => {}, updateDoc: async () => {},
    deleteField: () => ({}), writeBatch: () => ({ set() {}, update() {}, commit: async () => {} }),
    runTransaction: async () => ({}), serverTimestamp: () => ({}), arrayUnion: () => ({}), arrayRemove: () => ({}),
  };
});

// ---------------------------------------------------------------------------
// Estados sintéticos
// ---------------------------------------------------------------------------
const UID = 'uid_prop';
const PERFIL = 'usr_prop';
const UID_G = 'uid_gestor';
const PERFIL_G = 'usr_gestor';

const GESTION_AJENA: Doc = {
  id: 'prop_X~usr_otro', propietarioId: 'prop_X', gestorUsuarioId: 'usr_otro', estado: 'ACTIVA',
  inmuebleIds: [], permiso: 'LECTURA', resolucionInvitacion: 'ACEPTADA',
};
const GESTION_DEL_GESTOR: Doc = {
  id: 'prop_X~usr_gestor', propietarioId: 'prop_X', gestorUsuarioId: PERFIL_G, estado: 'ACTIVA',
  inmuebleIds: ['inm_1'], permiso: 'LECTURA', resolucionInvitacion: 'ACEPTADA',
};

/** PROPIETARIO puro, perfil veraz, SIN ninguna gestión propia; existe una gestión ajena. */
function mundoPropietario(): Record<string, Doc> {
  return {
    [`usuarios_auth/${UID}`]: {
      uid: UID, usuarioId: PERFIL, email: 'prop@test.local', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO',
      roles: [], propietarioId: 'prop_1', profesionalId: '', inmuebleIds: [],
    },
    [`usuarios/${PERFIL}`]: {
      id: PERFIL, authUid: UID, email: 'prop@test.local', nombre: 'Persona de Prueba', tipoPerfil: 'PROPIETARIO',
      estado: 'ACTIVO', roles: [], propietarioId: 'prop_1',
    },
    'gestiones_cartera/prop_X~usr_otro': GESTION_AJENA,
  };
}

/** PROFESIONAL gestor con una delegación parcial propia y una gestión de OTRO gestor. */
function mundoGestor(): Record<string, Doc> {
  return {
    [`usuarios_auth/${UID_G}`]: {
      uid: UID_G, usuarioId: PERFIL_G, email: 'gestor@test.local', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO',
      roles: ['GESTOR_PATRIMONIAL'], propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [],
      gestionesPorPropietario: { prop_X: 'prop_X~usr_gestor' }, carterasL: [], carterasE: [],
    },
    [`usuarios/${PERFIL_G}`]: {
      id: PERFIL_G, authUid: UID_G, email: 'gestor@test.local', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO',
      roles: ['GESTOR_PATRIMONIAL'], profesionalId: 'prof_1',
    },
    'gestiones_cartera/prop_X~usr_gestor': GESTION_DEL_GESTOR,
    'gestiones_cartera/prop_X~usr_otro': GESTION_AJENA,
  };
}

const consolas = {
  info: vi.spyOn(console, 'info'), warn: vi.spyOn(console, 'warn'), error: vi.spyOn(console, 'error'),
};

beforeEach(() => {
  permite = crearEvaluadorReglas(RULES).permite;
  mundo.authUid = null;
  mundo.db = {};
  mundo.antesDeGetDocs = null;
  consolas.info.mockImplementation(() => {});
  consolas.warn.mockImplementation(() => {});
  consolas.error.mockImplementation(() => {});
  vi.resetModules();
});
afterEach(() => {
  consolas.info.mockClear(); consolas.warn.mockClear(); consolas.error.mockClear();
});

async function cargar() {
  const fb = await import('../src/lib/firebase');
  const canal = await import('../src/estadoDatos/canalIncidencias');
  canal.reiniciarCanalIncidencias();
  return { fb, canal };
}

/** Abre la escucha real y espera a que responda (datos o error). */
async function abrirEscucha(
  fb: typeof import('../src/lib/firebase'),
  gestorUsuarioId: string,
  contexto = { tipoPerfil: 'PROPIETARIO', roles: [] as string[], intento: 0 }
) {
  const recibidas: any[][] = [];
  const baja = fb.subscribeGestionesCarteraGestor((g) => recibidas.push(g), gestorUsuarioId, contexto);
  await vi.waitFor(() => {
    const huboResultado = recibidas.length > 0;
    const huboError = consolas.error.mock.calls.some((c) => String(c[0]).includes('gestiones_cartera'));
    expect(huboResultado || huboError).toBe(true);
  });
  return { recibidas, baja };
}

const trazas = (fase: string) =>
  [...consolas.info.mock.calls, ...consolas.warn.mock.calls].filter((c) => c[0] === '[diag:carteras]' && c[1] === fase);

async function informeDeDenegacion(): Promise<any> {
  await vi.waitFor(() => expect(trazas('denegada')).toHaveLength(1));
  return trazas('denegada')[0][2];
}

const incidenciasCarteras = (canal: typeof import('../src/estadoDatos/canalIncidencias')) =>
  canal.incidenciasDatos().filter((i) => i.origen === 'gestiones_cartera');

// ===========================================================================
// A · CONSULTAS AUTORIZADAS: consulta → usuario → condición → resultado
// ===========================================================================
describe('Carteras · A — la consulta del gestor se autoriza sea cual sea el perfil, y se limita a SU id', () => {
  it('A1 · PROPIETARIO que no es gestor y NO tiene ninguna cartera: consulta autorizada → lista vacía, sin aviso', async () => {
    mundo.authUid = UID; mundo.db = mundoPropietario();
    const { fb, canal } = await cargar();
    const { recibidas } = await abrirEscucha(fb, PERFIL);

    // Condición: activeUser() (perfilActualVeraz) && 'gestorUsuarioId' in d && d.gestorUsuarioId == me().usuarioId
    expect(recibidas).toEqual([[]]);
    expect(incidenciasCarteras(canal)).toEqual([]);
    expect(trazas('denegada')).toHaveLength(0);
    // La gestión AJENA existe en la colección y NO se le entrega (aislamiento por gestor).
    expect(JSON.stringify(recibidas)).not.toContain('usr_otro');
  });

  it('A2 · colección SIN ninguna gestión (no existe ninguna cartera): el resultado es vacío, no un error', async () => {
    mundo.authUid = UID;
    mundo.db = mundoPropietario();
    delete mundo.db['gestiones_cartera/prop_X~usr_otro'];
    const { fb, canal } = await cargar();
    const { recibidas } = await abrirEscucha(fb, PERFIL);
    expect(recibidas).toEqual([[]]);
    expect(incidenciasCarteras(canal)).toEqual([]);
  });

  it('A3 · PROFESIONAL gestor: recibe SOLO sus gestiones (no las de otro gestor)', async () => {
    mundo.authUid = UID_G; mundo.db = mundoGestor();
    const { fb, canal } = await cargar();
    const { recibidas } = await abrirEscucha(fb, PERFIL_G, { tipoPerfil: 'PROFESIONAL', roles: ['GESTOR_PATRIMONIAL'], intento: 0 });
    expect(recibidas).toHaveLength(1);
    expect(recibidas[0].map((g) => g.id)).toEqual(['prop_X~usr_gestor']);
    expect(incidenciasCarteras(canal)).toEqual([]);
  });

  it('A4 · PROPIETARIO que ADEMÁS es gestor (caso E del modelo D1R): misma consulta, misma regla, sin ampliar su ámbito de titular', async () => {
    mundo.authUid = UID;
    mundo.db = {
      ...mundoPropietario(),
      [`usuarios_auth/${UID}`]: {
        ...mundoPropietario()[`usuarios_auth/${UID}`], roles: ['GESTOR_PATRIMONIAL'],
        gestionesPorPropietario: { prop_X: `prop_X~${PERFIL}` },
      },
      [`gestiones_cartera/prop_X~${PERFIL}`]: { ...GESTION_DEL_GESTOR, id: `prop_X~${PERFIL}`, gestorUsuarioId: PERFIL },
    };
    const { fb } = await cargar();
    const { recibidas } = await abrirEscucha(fb, PERFIL, { tipoPerfil: 'PROPIETARIO', roles: ['GESTOR_PATRIMONIAL'], intento: 0 });
    expect(recibidas[0].map((g) => g.id)).toEqual([`prop_X~${PERFIL}`]);
  });
});

// ===========================================================================
// B · AISLAMIENTO: la consulta ajena se deniega (nunca se abre la colección)
// ===========================================================================
describe('Carteras · B — aislamiento por gestor', () => {
  it('B1 · pedir el gestorUsuarioId de OTRA persona se deniega y no entrega datos', async () => {
    mundo.authUid = UID; mundo.db = mundoPropietario();
    const { fb, canal } = await cargar();
    const { recibidas } = await abrirEscucha(fb, 'usr_otro');

    expect(recibidas).toEqual([]);
    const incidencias = incidenciasCarteras(canal);
    expect(incidencias).toHaveLength(1);
    expect(incidencias[0]).toMatchObject({ tipo: 'LECTURA', codigo: 'permission-denied', etiqueta: 'Carteras' });
    expect(incidencias[0].mensaje).toBe('No tienes permisos para consultar estos datos. Si crees que es un error, avisa a un administrador.');
    expect((await informeDeDenegacion()).causa).toBe('CONSULTA_DISTINTA_DEL_ESPEJO');
  });

  it('B2 · la regla del repositorio no abre la colección: `allow list` exige admin o la rama «involucra a mi»', () => {
    const bloque = RULES.match(/match \/gestiones_cartera\/\{gestionId\} \{[\s\S]*?\n    \}/)?.[0] ?? '';
    expect(bloque).toContain('allow list: if esAdminInmuebles() || gestionInvolucraAMi(resource.data);');
    expect(bloque).not.toMatch(/allow (read|list|get)[^;]*:\s*if\s+true/);
    // Consulta sin `where` (colección completa): el representante no fija nada ⇒ denegada.
    mundo.authUid = UID; mundo.db = mundoPropietario();
    const sinFiltro = permite('gestiones_cartera', 'list', {
      auth: { uid: UID, token: { email: 'prop@test.local', email_verified: true } },
      db: mundo.db, resource: {}, requestResource: null, docId: 'x',
    });
    expect(sinFiltro).toBe(false);
  });
});

// ===========================================================================
// C · DENEGACIONES: cada causa posible queda DISTINGUIDA por el diagnóstico
// ===========================================================================
describe('Carteras · C — qué diría el diagnóstico en cada estado que provoca «No tienes permisos»', () => {
  const casos: Array<{ nombre: string; causa: string; preparar: (db: Record<string, Doc>) => void; authUid?: string | null }> = [
    {
      nombre: 'C1 · sin espejo usuarios_auth/{uid}',
      causa: 'ESPEJO_AUSENTE',
      preparar: (db) => { delete db[`usuarios_auth/${UID}`]; },
    },
    {
      nombre: 'C2 · el espejo enlaza a OTRO usuarioId (p. ej. dos fichas para el mismo UID): la consulta usa el id de la ficha actual',
      causa: 'CONSULTA_DISTINTA_DEL_ESPEJO',
      preparar: (db) => {
        db[`usuarios_auth/${UID}`] = { ...db[`usuarios_auth/${UID}`], usuarioId: 'usr_ficha_antigua' };
        db['usuarios/usr_ficha_antigua'] = { id: 'usr_ficha_antigua', authUid: UID, tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' };
      },
    },
    {
      nombre: 'C3 · la ficha usuarios/{id} no está enlazada a este UID (authUid de otra persona)',
      causa: 'PERFIL_AUSENTE_O_NO_VINCULADO',
      preparar: (db) => { db[`usuarios/${PERFIL}`] = { ...db[`usuarios/${PERFIL}`], authUid: 'uid_de_otra_persona' }; },
    },
    {
      nombre: 'C4 · la ficha no existe',
      causa: 'PERFIL_AUSENTE_O_NO_VINCULADO',
      preparar: (db) => { delete db[`usuarios/${PERFIL}`]; },
    },
    {
      nombre: "C5 · la ficha no está 'ACTIVO'",
      causa: 'PERFIL_NO_ACTIVO',
      preparar: (db) => { db[`usuarios/${PERFIL}`] = { ...db[`usuarios/${PERFIL}`], estado: 'PENDIENTE' }; },
    },
    {
      nombre: "C6 · el espejo no está 'ACTIVO'",
      causa: 'ESPEJO_NO_ACTIVO',
      preparar: (db) => { db[`usuarios_auth/${UID}`] = { ...db[`usuarios_auth/${UID}`], estado: 'INACTIVO' }; },
    },
    {
      nombre: 'C7 · tipoPerfil de la ficha distinto del espejo',
      causa: 'PERFIL_TIPO_DISTINTO_DEL_ESPEJO',
      preparar: (db) => { db[`usuarios/${PERFIL}`] = { ...db[`usuarios/${PERFIL}`], tipoPerfil: 'PROFESIONAL' }; },
    },
    {
      nombre: 'C8 · el espejo no trae usuarioId',
      causa: 'ESPEJO_SIN_USUARIOID_VALIDO',
      preparar: (db) => { const { usuarioId: _omitido, ...resto } = db[`usuarios_auth/${UID}`] as Doc; db[`usuarios_auth/${UID}`] = resto; },
    },
  ];

  it.each(casos)('$nombre ⇒ denegada y veredicto $causa', async ({ preparar, causa }) => {
    mundo.authUid = UID; mundo.db = mundoPropietario();
    preparar(mundo.db);
    const { fb, canal } = await cargar();
    const { recibidas } = await abrirEscucha(fb, PERFIL);

    expect(recibidas).toEqual([]);
    expect(incidenciasCarteras(canal)).toHaveLength(1);
    const informe = await informeDeDenegacion();
    expect(informe.causa).toBe(causa);
    expect(informe.reintento).toBe('DENEGADO');
    expect(informe.errorFirebase).toEqual({ codigo: 'permission-denied' });
  });

  it('C9 · TODO el estado observable cumple la regla del repo y aun así se deniega (reglas publicadas distintas) ⇒ el cliente NO afirma causa', async () => {
    // «Reglas publicadas» más antiguas: `list` solo para el ámbito administrativo.
    const antiguas = RULES.replace(
      'allow list: if esAdminInmuebles() || gestionInvolucraAMi(resource.data);',
      'allow list: if esAdminInmuebles();'
    );
    expect(antiguas).not.toBe(RULES);
    permite = crearEvaluadorReglas(antiguas).permite;

    mundo.authUid = UID; mundo.db = mundoPropietario();
    const { fb, canal } = await cargar();
    await abrirEscucha(fb, PERFIL);

    const informe = await informeDeDenegacion();
    expect(informe.comprobaciones.every((c: any) => c.ok === true)).toBe(true);
    expect(informe.reintento).toBe('DENEGADO');
    expect(informe.causa).toBe('REGLAS_PUBLICADAS_O_PLANIFICADOR');
    expect(informe.lectura).toMatch(/reglas PUBLICADAS/);
    // …y le dice a quien lo lee DÓNDE comparar: proyecto y base reales de esta compilación.
    expect(informe.dondeComprobarReglas).toContain(`proyecto «${CONFIG.projectId}»`);
    expect(informe.dondeComprobarReglas).toContain(`base de datos «${CONFIG.firestoreDatabaseId}»`);
    expect(incidenciasCarteras(canal)).toHaveLength(1);
  });

  it('C10 · el UID no puede leer SU PROPIO espejo (imposible con las reglas del repo ⇒ reglas publicadas distintas) ⇒ ESPEJO_ILEGIBLE_POR_SU_TITULAR', async () => {
    // Reglas publicadas muy antiguas: ni `list` de gestiones para el gestor ni lectura del espejo por su titular.
    // (Las reglas leen el espejo con `get()` interno, que no pasa por su propio `allow read`: por eso la consulta
    // solo se deniega aquí porque TAMBIÉN se retira la rama del gestor.)
    const antiguas = RULES
      .replace('allow read: if isMasterAdmin() || (isSignedIn() && request.auth.uid == uid);', 'allow read: if isMasterAdmin();')
      .replace('allow list: if esAdminInmuebles() || gestionInvolucraAMi(resource.data);', 'allow list: if esAdminInmuebles();');
    expect(antiguas).not.toBe(RULES);
    expect(antiguas.match(/allow read: if isMasterAdmin\(\);/g)?.length ?? 0).toBeGreaterThan(0);
    permite = crearEvaluadorReglas(antiguas).permite;

    mundo.authUid = UID; mundo.db = mundoPropietario();
    const { fb } = await cargar();
    await abrirEscucha(fb, PERFIL);
    expect((await informeDeDenegacion()).causa).toBe('ESPEJO_ILEGIBLE_POR_SU_TITULAR');
  });

  it('C11 · denegación TRANSITORIA: el reintento inmediato sí se autoriza ⇒ TRANSITORIA (no es un problema de reglas)', async () => {
    mundo.authUid = UID; mundo.db = mundoPropietario();
    const espejo = mundo.db[`usuarios_auth/${UID}`];
    delete mundo.db[`usuarios_auth/${UID}`]; // al abrir la escucha el espejo aún no existe…
    mundo.antesDeGetDocs = () => { mundo.db[`usuarios_auth/${UID}`] = espejo; }; // …y existe cuando se reintenta
    const { fb } = await cargar();
    await abrirEscucha(fb, PERFIL);
    const informe = await informeDeDenegacion();
    expect(informe.reintento).toBe('OK');
    expect(informe.causa).toBe('TRANSITORIA');
  });

  it('C12 · sin sesión de Firebase Auth ⇒ SIN_SESION_FIREBASE', async () => {
    mundo.authUid = null; mundo.db = mundoPropietario();
    const { fb } = await cargar();
    await abrirEscucha(fb, PERFIL);
    expect((await informeDeDenegacion()).causa).toBe('SIN_SESION_FIREBASE');
  });
});

// ===========================================================================
// D · INSTRUMENTACIÓN: qué se registra, cuándo, y qué NUNCA se muestra
// ===========================================================================
describe('Carteras · D — trazas técnicas', () => {
  it('D1 · al abrir la escucha registra uid, perfil, rol, gestorUsuarioId, momento y la consulta exacta; y su primer resultado', async () => {
    mundo.authUid = UID_G; mundo.db = mundoGestor();
    const { fb } = await cargar();
    await abrirEscucha(fb, PERFIL_G, { tipoPerfil: 'PROFESIONAL', roles: ['GESTOR_PATRIMONIAL'], intento: 0 });

    const consulta = trazas('consulta');
    expect(consulta).toHaveLength(1);
    expect(consulta[0][2]).toMatchObject({
      authUid: UID_G, gestorUsuarioId: PERFIL_G, tipoPerfil: 'PROFESIONAL', roles: ['GESTOR_PATRIMONIAL'], motivo: 'inicio',
      // A QUÉ proyecto y base habla esta compilación: ahí deben estar publicadas las reglas.
      proyecto: CONFIG.projectId, baseDeDatos: CONFIG.firestoreDatabaseId,
      consulta: `gestiones_cartera where gestorUsuarioId == '${PERFIL_G}'`,
    });
    expect(new Date(consulta[0][2].momento).toISOString()).toBe(consulta[0][2].momento);

    const resultado = trazas('resultado');
    expect(resultado).toHaveLength(1);
    expect(resultado[0][2]).toMatchObject({ gestorUsuarioId: PERFIL_G, documentos: 1, desdeCache: false });
  });

  it('D2 · «Reintentar lectura» (intento > 0) se identifica como reintento', async () => {
    mundo.authUid = UID; mundo.db = mundoPropietario();
    const { fb } = await cargar();
    await abrirEscucha(fb, PERFIL, { tipoPerfil: 'PROPIETARIO', roles: [], intento: 1 });
    expect(trazas('consulta')[0][2].motivo).toBe('reintento');
  });

  it('D3 · el informe de denegación NO contiene correo, nombre ni datos de la ficha (solo ids, estados y contadores)', async () => {
    mundo.authUid = UID; mundo.db = mundoPropietario();
    delete mundo.db[`usuarios_auth/${UID}`];
    mundo.db[`usuarios_auth/${UID}`] = { ...mundoPropietario()[`usuarios_auth/${UID}`], estado: 'INACTIVO' };
    const { fb } = await cargar();
    await abrirEscucha(fb, PERFIL);
    const crudo = JSON.stringify(await informeDeDenegacion());
    expect(crudo).not.toContain('prop@test.local');
    expect(crudo).not.toContain('Persona de Prueba');
    expect(crudo).not.toContain('prop_1'); // ni siquiera el propietarioId
  });

  it('D4 · el diagnóstico NO crea avisos en la interfaz: queda UNA sola incidencia (la de la propia lectura), aunque sus lecturas se denieguen', async () => {
    mundo.authUid = UID; mundo.db = mundoPropietario();
    delete mundo.db[`usuarios/${PERFIL}`]; // la lectura de la ficha también se denegará
    const { fb, canal } = await cargar();
    await abrirEscucha(fb, PERFIL);
    await informeDeDenegacion();
    expect(canal.incidenciasDatos().map((i) => `${i.origen}/${i.tipo}`)).toEqual(['gestiones_cartera/LECTURA']);
  });

  it('D5 · un fallo que NO es de permisos no se diagnostica como problema de reglas', async () => {
    mundo.authUid = UID; mundo.db = mundoPropietario();
    const { fb } = await cargar();
    // Sustituye el doble de la consulta por un error de red para esta apertura.
    const fs = await import('firebase/firestore');
    const original = fs.onSnapshot;
    (fs as any).onSnapshot = (_r: unknown, _n: unknown, onError: (e: unknown) => void) => {
      void Promise.resolve().then(() => onError(Object.assign(new Error('offline'), { code: 'unavailable' })));
      return () => {};
    };
    try {
      fb.subscribeGestionesCarteraGestor(() => {}, PERFIL, { tipoPerfil: 'PROPIETARIO', roles: [], intento: 0 });
      await vi.waitFor(() =>
        expect(consolas.warn.mock.calls.some((c) => String(c[1]).includes('distinto de permission-denied'))).toBe(true));
      expect(trazas('denegada')).toHaveLength(0);
    } finally {
      (fs as any).onSnapshot = original;
    }
  });
});

// ===========================================================================
// E · CICLO DEL AVISO: reintentar rehace la lectura y limpia el aviso obsoleto
// ===========================================================================
describe('Carteras · E — el aviso «Lectura · Carteras» refleja el ÚLTIMO intento', () => {
  it('E1 · tras una denegación, un reintento autorizado deja el aviso limpio y entrega los datos', async () => {
    mundo.authUid = UID; mundo.db = mundoPropietario();
    delete mundo.db[`usuarios_auth/${UID}`];
    const { fb, canal } = await cargar();
    const primera = await abrirEscucha(fb, PERFIL);
    expect(primera.recibidas).toEqual([]);
    expect(incidenciasCarteras(canal)).toHaveLength(1);

    // El estado se corrige y la persona pulsa «Reintentar lectura».
    mundo.db[`usuarios_auth/${UID}`] = mundoPropietario()[`usuarios_auth/${UID}`];
    primera.baja();
    const segunda = await abrirEscucha(fb, PERFIL, { tipoPerfil: 'PROPIETARIO', roles: [], intento: 1 });
    expect(segunda.recibidas).toEqual([[]]);
    expect(incidenciasCarteras(canal)).toEqual([]);
  });

  it('E2 · si el reintento sigue denegado, el aviso se mantiene UNA sola vez (sin duplicar)', async () => {
    mundo.authUid = UID; mundo.db = mundoPropietario();
    delete mundo.db[`usuarios_auth/${UID}`];
    const { fb, canal } = await cargar();
    const primera = await abrirEscucha(fb, PERFIL);
    primera.baja();
    consolas.error.mockClear();
    await abrirEscucha(fb, PERFIL, { tipoPerfil: 'PROPIETARIO', roles: [], intento: 1 });
    expect(incidenciasCarteras(canal)).toHaveLength(1);
  });

  it('E3 · sin gestorUsuarioId no se abre ninguna consulta y se entrega vacío (fallo en cerrado)', async () => {
    const { fb, canal } = await cargar();
    const recibidas: any[][] = [];
    const baja = fb.subscribeGestionesCarteraGestor((g) => recibidas.push(g), undefined);
    expect(recibidas).toEqual([[]]);
    expect(trazas('consulta')).toHaveLength(0);
    expect(incidenciasCarteras(canal)).toEqual([]);
    baja();
  });
});
