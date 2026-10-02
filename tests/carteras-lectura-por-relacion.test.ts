/**
 * «Lectura · Carteras: No tienes permisos…» — LECTURA POR RELACIÓN (2026-10-01).
 * ---------------------------------------------------------------------------
 * Qué fija este test:
 *
 *  · La CONSULTA de colección (`where gestorUsuarioId ==`) sigue siendo la lectura
 *    documentada. Pero su autorización depende de que el motor de Google DEMUESTRE la
 *    consulta (planificador) y de las reglas PUBLICADAS; ninguna de las dos cosas se
 *    puede comprobar fuera de Firebase (no hay emulador en este entorno).
 *  · Si la consulta se deniega y TODOS los términos observables de la regla del gestor
 *    se cumplen, la denegación no la explica el estado de la persona: la explica la
 *    consulta. Entonces la capa de datos lee cada relación con un `get` (evaluado sobre
 *    el documento REAL) a partir del índice del espejo propio, que es el mismo que usan
 *    las Rules. Una persona autorizada deja de ver un falso «No tienes permisos».
 *  · Aislamiento: nada de esto abre una regla ni permite leer lo ajeno. Cada `get` lo
 *    decide el TEXTO REAL de `firestore.rules` (evaluador del repo) y toda causa
 *    observable (espejo ausente, ficha no enlazada, id de consulta ajeno, sin sesión…)
 *    sigue avisando y NO abre la lectura por relación.
 *
 * Limitación declarada: el evaluador del repo trabaja documento a documento; no es el
 * motor de Google. Por eso la parte `get` (que no usa planificador) es lo que se prueba
 * aquí a fondo, y la consulta (`list`) queda registrada como «no verificable offline».
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
import {
  causaDeDenegacion,
  decidirTrasDenegacion,
  evaluarComprobacionesCarteras,
  type Comprobacion,
} from '../src/lib/diagnosticoCarteras';
import { idsGestionesIndexadas } from '../src/lib/carterasGestion';

const RAIZ = resolve(__dirname, '..');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');

/** Reglas «publicadas» que aplica el doble: por defecto, las del repositorio. */
let permite = crearEvaluadorReglas(RULES).permite;

type Doc = Record<string, unknown>;
interface OyenteDoc {
  path: string;
  onNext: (s: any) => void;
  onError?: (e: unknown) => void;
  activo: boolean;
}
const mundo = vi.hoisted(() => ({
  authUid: null as string | null,
  db: {} as Record<string, Record<string, unknown>>,
  /** Escuchas de documento abiertas (para empujar cambios en vivo y contar bajas). */
  oyentes: [] as Array<{ path: string; onNext: (s: any) => void; onError?: (e: unknown) => void; activo: boolean }>,
  /** `get` de documentos de gestiones realmente solicitados. */
  lecturasGestion: [] as string[],
  /** Fuerza que la CONSULTA en vivo (onSnapshot de colección) se deniegue aunque `getDocs` no. */
  forzarDenegacionConsultaViva: false,
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
    auth: mundo.authUid ? { uid: mundo.authUid, token: { email: 'u@test.local', email_verified: true } } : null,
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
  const instantaneaDoc = (ref: any) => {
    const d = mundo.db[ref.path] ?? null;
    return { id: ref.id, exists: () => d !== null, data: () => d, metadata: { fromCache: false } };
  };
  const decideGet = (ref: any): boolean => {
    const d = mundo.db[ref.path] ?? null;
    try { return permite(ref.__col, 'get', peticion(d, ref.id)); } catch { return false; }
  };
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
      if (ref.path && !ref.filtros) {
        // Escucha de DOCUMENTO: `allow get` sobre el documento real.
        const oyente: OyenteDoc = { path: ref.path, onNext, onError, activo: true };
        mundo.oyentes.push(oyente);
        if (ref.__col === 'gestiones_cartera') mundo.lecturasGestion.push(ref.id);
        void Promise.resolve().then(() => {
          if (!oyente.activo) return;
          if (!decideGet(ref)) { oyente.activo = false; onError?.(errorPermisos()); return; }
          onNext(instantaneaDoc(ref));
        });
        return () => { oyente.activo = false; };
      }
      // Escucha de CONSULTA.
      let vivo = true;
      void Promise.resolve().then(() => {
        if (!vivo) return;
        if (mundo.forzarDenegacionConsultaViva || !consultaAutorizada(ref.__col, ref.filtros)) { onError?.(errorPermisos()); return; }
        onNext({ docs: docsDe(ref.__col, ref.filtros), metadata: { fromCache: false } });
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
      if (!decideGet(ref)) throw errorPermisos();
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
const UID_G = 'uid_gestor';
const PERFIL_G = 'usr_gestor';
const UID_P = 'uid_prop';
const PERFIL_P = 'usr_prop';

const GESTION_DEL_GESTOR: Doc = {
  id: 'prop_X~usr_gestor', propietarioId: 'prop_X', gestorUsuarioId: PERFIL_G, estado: 'ACTIVA',
  inmuebleIds: ['inm_1'], permiso: 'LECTURA', resolucionInvitacion: 'ACEPTADA',
};
const SEGUNDA_GESTION_DEL_GESTOR: Doc = {
  id: 'prop_Y~usr_gestor', propietarioId: 'prop_Y', gestorUsuarioId: PERFIL_G, estado: 'ACTIVA',
  inmuebleIds: ['inm_7', 'inm_8'], permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR', resolucionInvitacion: 'ACEPTADA',
};
const GESTION_AJENA: Doc = {
  id: 'prop_X~usr_otro', propietarioId: 'prop_X', gestorUsuarioId: 'usr_otro', estado: 'ACTIVA',
  inmuebleIds: [], permiso: 'LECTURA', resolucionInvitacion: 'ACEPTADA',
};

/** PROFESIONAL gestor patrimonial con una delegación parcial indexada y una gestión de OTRO gestor en la colección. */
function mundoGestor(extra: Record<string, Doc> = {}): Record<string, Doc> {
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
    ...extra,
  };
}

/** PROPIETARIO puro (titular) sin ninguna relación como gestor. */
function mundoPropietario(): Record<string, Doc> {
  return {
    [`usuarios_auth/${UID_P}`]: {
      uid: UID_P, usuarioId: PERFIL_P, email: 'prop@test.local', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO',
      roles: [], propietarioId: 'prop_1', profesionalId: '', inmuebleIds: [],
    },
    [`usuarios/${PERFIL_P}`]: {
      id: PERFIL_P, authUid: UID_P, email: 'prop@test.local', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO',
      roles: [], propietarioId: 'prop_1',
    },
    'gestiones_cartera/prop_X~usr_otro': GESTION_AJENA,
  };
}

/** Reglas publicadas en las que SOLO la consulta (`list`) no autoriza al gestor; `get` es el del repositorio. */
const REGLAS_LIST_SOLO_ADMIN = RULES.replace(
  'allow list: if esAdminInmuebles() || gestionInvolucraAMi(resource.data);',
  'allow list: if esAdminInmuebles();'
);

const consolas = {
  info: vi.spyOn(console, 'info'), warn: vi.spyOn(console, 'warn'), error: vi.spyOn(console, 'error'),
};

beforeEach(() => {
  permite = crearEvaluadorReglas(RULES).permite;
  mundo.authUid = null;
  mundo.db = {};
  mundo.oyentes = [];
  mundo.lecturasGestion = [];
  mundo.forzarDenegacionConsultaViva = false;
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

const CONTEXTO_GESTOR = { tipoPerfil: 'PROFESIONAL', roles: ['GESTOR_PATRIMONIAL'] as string[], intento: 0 };

/** Abre la escucha real; espera a la primera entrega de datos o al primer error. */
async function abrirEscucha(
  fb: typeof import('../src/lib/firebase'),
  gestorUsuarioId: string,
  contexto: { tipoPerfil: string; roles: string[]; intento: number } = CONTEXTO_GESTOR
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

/** Empuja a los oyentes de un documento el estado actual de `mundo.db` (cambio en vivo). */
function emitirDocumento(path: string) {
  const d = mundo.db[path] ?? null;
  for (const o of mundo.oyentes.filter((x) => x.path === path && x.activo)) {
    o.onNext({ id: path.split('/').slice(1).join('/'), exists: () => d !== null, data: () => d, metadata: { fromCache: false } });
  }
}

// ===========================================================================
// A · LA LECTURA POR RELACIÓN DEVUELVE LA DELEGACIÓN SIN FALSO AVISO
// ===========================================================================
describe('Carteras · lectura por relación — A · persona autorizada cuando SOLO se deniega la consulta', () => {
  it('A1 · gestor con una delegación indexada: la recibe (y solo la suya), sin aviso, y el diagnóstico dice qué se deniega', async () => {
    permite = crearEvaluadorReglas(REGLAS_LIST_SOLO_ADMIN).permite;
    mundo.authUid = UID_G; mundo.db = mundoGestor();
    const { fb, canal } = await cargar();
    const { recibidas } = await abrirEscucha(fb, PERFIL_G);

    expect(recibidas).toHaveLength(1);
    expect(recibidas[0].map((g) => g.id)).toEqual(['prop_X~usr_gestor']);
    expect(recibidas[0][0]).toMatchObject({ gestorUsuarioId: PERFIL_G, estado: 'ACTIVA', inmuebleIds: ['inm_1'] });
    // La gestión AJENA existe en la colección y jamás se solicita ni se entrega.
    expect(JSON.stringify(recibidas)).not.toContain('usr_otro');
    expect(mundo.lecturasGestion).toEqual(['prop_X~usr_gestor']);
    // NO hay falso «No tienes permisos»: ni incidencia ni error en consola.
    expect(incidenciasCarteras(canal)).toEqual([]);
    expect(consolas.error.mock.calls.filter((c) => String(c[0]).includes('gestiones_cartera'))).toEqual([]);

    const informe = await informeDeDenegacion();
    expect(informe.comprobaciones.every((c: Comprobacion) => c.ok === true)).toBe(true);
    expect(informe.reintento).toBe('DENEGADO');
    expect(informe.lecturaPorRelacion).toBe('OK');
    expect(informe.causa).toBe('SOLO_LA_CONSULTA_DE_COLECCION_DENEGADA');
    expect(trazas('resultado-por-relacion')[0][2]).toMatchObject({ relacionesIndexadas: 1, documentos: 1 });
  });

  it('A2 · varias delegaciones (parciales y de varios titulares): las recibe todas, una sola entrega cuando están todas', async () => {
    permite = crearEvaluadorReglas(REGLAS_LIST_SOLO_ADMIN).permite;
    mundo.authUid = UID_G;
    const db = mundoGestor({ 'gestiones_cartera/prop_Y~usr_gestor': SEGUNDA_GESTION_DEL_GESTOR });
    (db[`usuarios_auth/${UID_G}`] as Doc).gestionesPorPropietario = {
      prop_X: 'prop_X~usr_gestor', prop_Y: 'prop_Y~usr_gestor',
    };
    mundo.db = db;
    const { fb, canal } = await cargar();
    const { recibidas } = await abrirEscucha(fb, PERFIL_G);

    expect(recibidas).toHaveLength(1); // no se entrega a medias
    expect(recibidas[0].map((g) => g.id).sort()).toEqual(['prop_X~usr_gestor', 'prop_Y~usr_gestor']);
    expect(incidenciasCarteras(canal)).toEqual([]);
  });

  it('A3 · PROPIETARIO titular que no es gestor y sin relaciones: lista vacía y SIN aviso aunque la consulta se deniegue', async () => {
    permite = crearEvaluadorReglas(REGLAS_LIST_SOLO_ADMIN).permite;
    mundo.authUid = UID_P; mundo.db = mundoPropietario();
    const { fb, canal } = await cargar();
    const { recibidas } = await abrirEscucha(fb, PERFIL_P, { tipoPerfil: 'PROPIETARIO', roles: [], intento: 0 });

    expect(recibidas).toEqual([[]]);
    expect(incidenciasCarteras(canal)).toEqual([]);
    expect(mundo.lecturasGestion).toEqual([]); // nada que leer: ninguna gestión se solicita
    expect((await informeDeDenegacion()).lecturaPorRelacion).toBe('SIN_RELACIONES');
  });

  it('A4 · «Reintentar lectura» (intento > 0) sigue el mismo camino y se identifica como reintento', async () => {
    permite = crearEvaluadorReglas(REGLAS_LIST_SOLO_ADMIN).permite;
    mundo.authUid = UID_G; mundo.db = mundoGestor();
    const { fb, canal } = await cargar();
    const primera = await abrirEscucha(fb, PERFIL_G);
    primera.baja();
    const segunda = await abrirEscucha(fb, PERFIL_G, { ...CONTEXTO_GESTOR, intento: 1 });

    expect(segunda.recibidas[0].map((g) => g.id)).toEqual(['prop_X~usr_gestor']);
    expect(incidenciasCarteras(canal)).toEqual([]);
    expect(trazas('consulta').map((t) => t[2].motivo)).toEqual(['inicio', 'reintento']);
  });

  it('A5 · si la consulta SÍ se autoriza no se hace ninguna lectura por relación (la consulta sigue siendo la vía documentada)', async () => {
    mundo.authUid = UID_G; mundo.db = mundoGestor();
    const { fb, canal } = await cargar();
    const { recibidas } = await abrirEscucha(fb, PERFIL_G);

    expect(recibidas[0].map((g) => g.id)).toEqual(['prop_X~usr_gestor']);
    expect(mundo.lecturasGestion).toEqual([]);
    expect(mundo.oyentes).toEqual([]);
    expect(trazas('denegada')).toEqual([]);
    expect(incidenciasCarteras(canal)).toEqual([]);
  });
});

// ===========================================================================
// B · AISLAMIENTO Y DENEGACIONES REALES: la lectura por relación NO esquiva nada
// ===========================================================================
describe('Carteras · lectura por relación — B · aislamiento: toda causa observable sigue avisando', () => {
  it('B1 · pedir el gestorUsuarioId de OTRA persona: se avisa y NO se abre ninguna lectura por relación', async () => {
    permite = crearEvaluadorReglas(REGLAS_LIST_SOLO_ADMIN).permite;
    mundo.authUid = UID_G; mundo.db = mundoGestor();
    const { fb, canal } = await cargar();
    const { recibidas } = await abrirEscucha(fb, 'usr_otro');

    expect(recibidas).toEqual([]);
    expect(incidenciasCarteras(canal)).toHaveLength(1);
    expect(mundo.lecturasGestion).toEqual([]);
    expect(mundo.oyentes).toEqual([]);
    const informe = await informeDeDenegacion();
    expect(informe.causa).toBe('CONSULTA_DISTINTA_DEL_ESPEJO');
    expect(informe.lecturaPorRelacion).toBeUndefined();
  });

  const estadosRotos: Array<{ nombre: string; causa: string; preparar: (db: Record<string, Doc>) => void }> = [
    { nombre: 'sin espejo usuarios_auth/{uid}', causa: 'ESPEJO_AUSENTE', preparar: (db) => { delete db[`usuarios_auth/${UID_G}`]; } },
    {
      nombre: 'la ficha usuarios/{id} no está enlazada a este UID',
      causa: 'PERFIL_AUSENTE_O_NO_VINCULADO',
      preparar: (db) => { db[`usuarios/${PERFIL_G}`] = { ...db[`usuarios/${PERFIL_G}`], authUid: 'uid_de_otra_persona' }; },
    },
    {
      nombre: "la ficha no está 'ACTIVO'",
      causa: 'PERFIL_NO_ACTIVO',
      preparar: (db) => { db[`usuarios/${PERFIL_G}`] = { ...db[`usuarios/${PERFIL_G}`], estado: 'PENDIENTE' }; },
    },
    {
      nombre: "el espejo no está 'ACTIVO'",
      causa: 'ESPEJO_NO_ACTIVO',
      preparar: (db) => { db[`usuarios_auth/${UID_G}`] = { ...db[`usuarios_auth/${UID_G}`], estado: 'INACTIVO' }; },
    },
    {
      nombre: 'el espejo enlaza a OTRO usuarioId',
      causa: 'CONSULTA_DISTINTA_DEL_ESPEJO',
      preparar: (db) => {
        db[`usuarios_auth/${UID_G}`] = { ...db[`usuarios_auth/${UID_G}`], usuarioId: 'usr_ficha_antigua' };
        db['usuarios/usr_ficha_antigua'] = {
          id: 'usr_ficha_antigua', authUid: UID_G, tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', roles: ['GESTOR_PATRIMONIAL'],
        };
      },
    },
  ];
  it.each(estadosRotos)('B2 · $nombre ⇒ se avisa ($causa), sin lectura por relación y sin datos', async ({ preparar, causa }) => {
    permite = crearEvaluadorReglas(REGLAS_LIST_SOLO_ADMIN).permite;
    mundo.authUid = UID_G; mundo.db = mundoGestor();
    preparar(mundo.db);
    const { fb, canal } = await cargar();
    const { recibidas } = await abrirEscucha(fb, PERFIL_G);

    expect(recibidas).toEqual([]);
    expect(incidenciasCarteras(canal)).toHaveLength(1);
    expect(mundo.lecturasGestion).toEqual([]);
    expect((await informeDeDenegacion()).causa).toBe(causa);
  });

  it('B3 · sin sesión de Firebase Auth: se avisa y no se lee nada', async () => {
    permite = crearEvaluadorReglas(REGLAS_LIST_SOLO_ADMIN).permite;
    mundo.authUid = null; mundo.db = mundoGestor();
    const { fb, canal } = await cargar();
    await abrirEscucha(fb, PERFIL_G);

    expect(incidenciasCarteras(canal)).toHaveLength(1);
    expect(mundo.lecturasGestion).toEqual([]);
    expect((await informeDeDenegacion()).causa).toBe('SIN_SESION_FIREBASE');
  });

  it('B4 · un índice corrupto que apunta a la gestión de OTRO gestor: esa relación se deniega (aviso real) y la ajena JAMÁS se entrega', async () => {
    permite = crearEvaluadorReglas(REGLAS_LIST_SOLO_ADMIN).permite;
    mundo.authUid = UID_G;
    const db = mundoGestor();
    (db[`usuarios_auth/${UID_G}`] as Doc).gestionesPorPropietario = {
      prop_X: 'prop_X~usr_gestor', prop_Z: 'prop_X~usr_otro', // ← gestión de otro gestor colada en mi índice
    };
    mundo.db = db;
    const { fb, canal } = await cargar();
    const { recibidas } = await abrirEscucha(fb, PERFIL_G);

    await vi.waitFor(() => expect(recibidas.length).toBeGreaterThan(0));
    // La propia sí; la ajena, nunca (la regla la deniega por documento).
    expect(recibidas[0].map((g) => g.id)).toEqual(['prop_X~usr_gestor']);
    expect(JSON.stringify(recibidas)).not.toContain('usr_otro');
    expect(incidenciasCarteras(canal)).toHaveLength(1);
    expect(incidenciasCarteras(canal)[0]).toMatchObject({ alcance: 'CAPACIDAD', codigo: 'permission-denied' });
    expect((await informeDeDenegacion()).lecturaPorRelacion).toBe('DENEGADA');
  });

  it('B5 · el espejo no es legible por su titular (reglas muy antiguas): se avisa, no se esquiva con lecturas por relación', async () => {
    const antiguas = REGLAS_LIST_SOLO_ADMIN.replace(
      'allow read: if isMasterAdmin() || (isSignedIn() && request.auth.uid == uid);',
      'allow read: if isMasterAdmin();'
    );
    expect(antiguas).not.toBe(REGLAS_LIST_SOLO_ADMIN);
    permite = crearEvaluadorReglas(antiguas).permite;
    mundo.authUid = UID_G; mundo.db = mundoGestor();
    const { fb, canal } = await cargar();
    await abrirEscucha(fb, PERFIL_G);

    expect(incidenciasCarteras(canal)).toHaveLength(1);
    expect(mundo.lecturasGestion).toEqual([]);
    expect((await informeDeDenegacion()).causa).toBe('ESPEJO_ILEGIBLE_POR_SU_TITULAR');
  });

  it('B6 · el diagnóstico sigue sin crear avisos propios ni exponer correo/nombre en el informe', async () => {
    permite = crearEvaluadorReglas(REGLAS_LIST_SOLO_ADMIN).permite;
    mundo.authUid = UID_G; mundo.db = mundoGestor();
    const { fb, canal } = await cargar();
    await abrirEscucha(fb, PERFIL_G);
    const crudo = JSON.stringify(await informeDeDenegacion());
    expect(crudo).not.toContain('gestor@test.local');
    expect(canal.incidenciasDatos()).toEqual([]);
  });
});

// ===========================================================================
// C · DENEGACIÓN TRANSITORIA: se reabre la consulta UNA vez, nunca en bucle
// ===========================================================================
describe('Carteras · lectura por relación — C · denegación transitoria', () => {
  it('C1 · el reintento inmediato se autoriza ⇒ se reabre la consulta, llegan los datos y NO queda aviso', async () => {
    mundo.authUid = UID_G;
    const db = mundoGestor();
    const espejo = db[`usuarios_auth/${UID_G}`];
    delete db[`usuarios_auth/${UID_G}`]; // al abrir la escucha el espejo aún no existe…
    mundo.db = db;
    mundo.antesDeGetDocs = () => { mundo.db[`usuarios_auth/${UID_G}`] = espejo; }; // …y existe cuando se reintenta
    const { fb, canal } = await cargar();
    const { recibidas } = await abrirEscucha(fb, PERFIL_G);

    expect(recibidas[0].map((g) => g.id)).toEqual(['prop_X~usr_gestor']);
    expect(incidenciasCarteras(canal)).toEqual([]);
    const informe = await informeDeDenegacion();
    expect(informe.causa).toBe('TRANSITORIA');
    expect(informe.reintento).toBe('OK');
  });

  it('C2 · si la consulta reabierta vuelve a denegarse no hay bucle: una sola reapertura y después se avisa', async () => {
    mundo.authUid = UID_G;
    const db = mundoGestor();
    const espejo = db[`usuarios_auth/${UID_G}`];
    delete db[`usuarios_auth/${UID_G}`];
    mundo.db = db;
    mundo.antesDeGetDocs = () => { mundo.db[`usuarios_auth/${UID_G}`] = espejo; };
    mundo.forzarDenegacionConsultaViva = true; // la escucha viva se deniega siempre; `getDocs` (reintento) no
    const { fb, canal } = await cargar();
    await abrirEscucha(fb, PERFIL_G);

    await vi.waitFor(() => expect(incidenciasCarteras(canal)).toHaveLength(1));
    expect(trazas('consulta')).toHaveLength(1); // se abrió UNA vez por el cliente (la reapertura es interna)
    expect(trazas('denegada').length).toBeLessThanOrEqual(2); // transitoria + veredicto final; sin bucle
  });
});

// ===========================================================================
// D · VIDA DE LA ESCUCHA POR RELACIÓN: cambios en vivo y baja
// ===========================================================================
describe('Carteras · lectura por relación — D · cambios en vivo y baja', () => {
  it('D1 · un cambio de estado de la gestión (p. ej. la revoca la administración) llega sin recargar', async () => {
    permite = crearEvaluadorReglas(REGLAS_LIST_SOLO_ADMIN).permite;
    mundo.authUid = UID_G; mundo.db = mundoGestor();
    const { fb } = await cargar();
    const { recibidas } = await abrirEscucha(fb, PERFIL_G);
    expect(recibidas[0][0]).toMatchObject({ estado: 'ACTIVA' });

    mundo.db['gestiones_cartera/prop_X~usr_gestor'] = { ...GESTION_DEL_GESTOR, estado: 'REVOCADA' };
    emitirDocumento('gestiones_cartera/prop_X~usr_gestor');
    expect(recibidas.at(-1)![0]).toMatchObject({ id: 'prop_X~usr_gestor', estado: 'REVOCADA' });
  });

  it('D2 · si el índice del espejo cambia (nueva delegación), se abre su escucha; si solo cambia `updatedAt`, no se reabre nada', async () => {
    permite = crearEvaluadorReglas(REGLAS_LIST_SOLO_ADMIN).permite;
    mundo.authUid = UID_G; mundo.db = mundoGestor();
    const { fb } = await cargar();
    const { recibidas } = await abrirEscucha(fb, PERFIL_G);
    const abiertasAntes = mundo.lecturasGestion.length;

    // Cada login reescribe `updatedAt` del espejo: no debe reabrir las escuchas de gestión.
    mundo.db[`usuarios_auth/${UID_G}`] = { ...mundo.db[`usuarios_auth/${UID_G}`], updatedAt: new Date().toISOString() };
    emitirDocumento(`usuarios_auth/${UID_G}`);
    expect(mundo.lecturasGestion.length).toBe(abiertasAntes);

    // La administración proyecta una nueva delegación en el índice.
    mundo.db['gestiones_cartera/prop_Y~usr_gestor'] = SEGUNDA_GESTION_DEL_GESTOR;
    mundo.db[`usuarios_auth/${UID_G}`] = {
      ...mundo.db[`usuarios_auth/${UID_G}`],
      gestionesPorPropietario: { prop_X: 'prop_X~usr_gestor', prop_Y: 'prop_Y~usr_gestor' },
    };
    emitirDocumento(`usuarios_auth/${UID_G}`);
    await vi.waitFor(() => expect(recibidas.at(-1)!.map((g) => g.id).sort()).toEqual(['prop_X~usr_gestor', 'prop_Y~usr_gestor']));
  });

  it('D3 · la baja cierra TODAS las escuchas: tras darse de baja no llega ningún dato más', async () => {
    permite = crearEvaluadorReglas(REGLAS_LIST_SOLO_ADMIN).permite;
    mundo.authUid = UID_G; mundo.db = mundoGestor();
    const { fb } = await cargar();
    const { recibidas, baja } = await abrirEscucha(fb, PERFIL_G);
    expect(mundo.oyentes.filter((o) => o.activo).length).toBeGreaterThan(0);

    baja();
    expect(mundo.oyentes.filter((o) => o.activo)).toEqual([]);
    const antes = recibidas.length;
    mundo.db['gestiones_cartera/prop_X~usr_gestor'] = { ...GESTION_DEL_GESTOR, estado: 'SUSPENDIDA' };
    emitirDocumento('gestiones_cartera/prop_X~usr_gestor');
    expect(recibidas.length).toBe(antes);
  });

  it('D4 · darse de baja mientras el diagnóstico aún investiga no abre ninguna escucha ni crea avisos', async () => {
    permite = crearEvaluadorReglas(REGLAS_LIST_SOLO_ADMIN).permite;
    mundo.authUid = UID_G; mundo.db = mundoGestor();
    const { fb, canal } = await cargar();
    const baja = fb.subscribeGestionesCarteraGestor(() => {}, PERFIL_G, CONTEXTO_GESTOR);
    baja(); // antes de que la consulta responda
    await new Promise((r) => setTimeout(r, 50));
    expect(mundo.oyentes).toEqual([]);
    expect(incidenciasCarteras(canal)).toEqual([]);
  });
});

// ===========================================================================
// E · LO QUE AUTORIZA EL `get` DE UNA RELACIÓN (texto REAL de firestore.rules)
// ===========================================================================
describe('Carteras · lectura por relación — E · qué decide la regla `get` de gestiones_cartera', () => {
  const peticionGet = (uid: string | null, db: Record<string, Doc>, ruta: string): Peticion => ({
    auth: uid ? { uid, token: { email: 'u@test.local', email_verified: true } } : null,
    db,
    resource: db[ruta] ?? null,
    requestResource: null,
    docId: ruta.split('/').slice(1).join('/'),
  });
  const get = (uid: string | null, db: Record<string, Doc>, ruta: string) => {
    try { return permite('gestiones_cartera', 'get', peticionGet(uid, db, ruta)); } catch { return false; }
  };

  it('E1 · el gestor lee SU relación; no la de otro gestor ni la de una colección sin autorizar', () => {
    const db = mundoGestor();
    expect(get(UID_G, db, 'gestiones_cartera/prop_X~usr_gestor')).toBe(true);
    expect(get(UID_G, db, 'gestiones_cartera/prop_X~usr_otro')).toBe(false);
    expect(get(null, db, 'gestiones_cartera/prop_X~usr_gestor')).toBe(false);
  });

  it('E2 · con el estado roto (ficha no enlazada, espejo inactivo, sin espejo) el `get` también se deniega: no hay atajo', () => {
    const roto1 = mundoGestor();
    roto1[`usuarios/${PERFIL_G}`] = { ...roto1[`usuarios/${PERFIL_G}`], authUid: 'otro' };
    expect(get(UID_G, roto1, 'gestiones_cartera/prop_X~usr_gestor')).toBe(false);
    const roto2 = mundoGestor();
    roto2[`usuarios_auth/${UID_G}`] = { ...roto2[`usuarios_auth/${UID_G}`], estado: 'INACTIVO' };
    expect(get(UID_G, roto2, 'gestiones_cartera/prop_X~usr_gestor')).toBe(false);
    const roto3 = mundoGestor();
    delete roto3[`usuarios_auth/${UID_G}`];
    expect(get(UID_G, roto3, 'gestiones_cartera/prop_X~usr_gestor')).toBe(false);
  });

  it('E3 · `get` y `list` comparten predicado: la regla `list` no se ha ampliado (y el `get` no abre nada que el `list` no abra)', () => {
    const bloque = RULES.match(/match \/gestiones_cartera\/\{gestionId\} \{[\s\S]*?\n    \}/)?.[0] ?? '';
    expect(bloque).toContain('allow list: if esAdminInmuebles() || gestionInvolucraAMi(resource.data);');
    expect(bloque).toContain(
      'allow get: if esAdminInmuebles() || gestionInvolucraAMi(resource.data) || leerGestionInvitada(resource.data);'
    );
    expect(bloque).not.toMatch(/allow (read|list|get)[^;]*:\s*if\s+true/);
  });

  it('E4 · el titular (PROPIETARIO) lee las relaciones de SU cartera; un tercero, no', () => {
    const db: Record<string, Doc> = {
      ...mundoPropietario(),
      'gestiones_cartera/prop_1~usr_gestor': {
        id: 'prop_1~usr_gestor', propietarioId: 'prop_1', gestorUsuarioId: PERFIL_G, estado: 'ACTIVA',
        inmuebleIds: [], permiso: 'LECTURA', resolucionInvitacion: 'ACEPTADA',
      },
    };
    expect(get(UID_P, db, 'gestiones_cartera/prop_1~usr_gestor')).toBe(true);
    expect(get(UID_P, db, 'gestiones_cartera/prop_X~usr_otro')).toBe(false);
  });
});

// ===========================================================================
// F · FUNCIONES PURAS DE LA DECISIÓN
// ===========================================================================
describe('Carteras · lectura por relación — F · decisión pura', () => {
  const comprobaciones = (ok: boolean | null): Comprobacion[] => [
    { id: 'SESION', regla: 'x', ok, observado: '' },
    { id: 'ESPEJO_ACTIVO', regla: 'x', ok: true, observado: '' },
  ];

  it('F1 · solo «todo cumplido + consulta denegada» habilita la lectura por relación', () => {
    expect(decidirTrasDenegacion(comprobaciones(true), 'DENEGADO')).toBe('LEER_POR_RELACION');
    expect(decidirTrasDenegacion(comprobaciones(true), 'OK')).toBe('REABRIR_CONSULTA');
    expect(decidirTrasDenegacion(comprobaciones(false), 'DENEGADO')).toBe('AVISAR');
    expect(decidirTrasDenegacion(comprobaciones(null), 'DENEGADO')).toBe('AVISAR');
    expect(decidirTrasDenegacion(comprobaciones(true), 'ERROR:unavailable')).toBe('AVISAR');
  });

  it('F2 · con la consulta de otro id (aislamiento) NUNCA se abre la lectura por relación', () => {
    const obs = {
      espejo: { estado: 'EXISTE' as const, datos: { usuarioId: 'usr_a', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO' } },
      perfil: { estado: 'EXISTE' as const, datos: { authUid: 'uid_a', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO' } },
    };
    const propia = evaluarComprobacionesCarteras({ authUid: 'uid_a', gestorUsuarioId: 'usr_a' }, obs);
    const ajena = evaluarComprobacionesCarteras({ authUid: 'uid_a', gestorUsuarioId: 'usr_b' }, obs);
    expect(decidirTrasDenegacion(propia, 'DENEGADO')).toBe('LEER_POR_RELACION');
    expect(decidirTrasDenegacion(ajena, 'DENEGADO')).toBe('AVISAR');
  });

  it('F3 · el veredicto distingue «solo la consulta» de «ni siquiera el get»', () => {
    const todas = comprobaciones(true);
    expect(causaDeDenegacion(todas, 'DENEGADO', 'OK')).toBe('SOLO_LA_CONSULTA_DE_COLECCION_DENEGADA');
    expect(causaDeDenegacion(todas, 'DENEGADO', 'SIN_RELACIONES')).toBe('SOLO_LA_CONSULTA_DE_COLECCION_DENEGADA');
    expect(causaDeDenegacion(todas, 'DENEGADO', 'DENEGADA')).toBe('REGLAS_PUBLICADAS_O_PLANIFICADOR');
    expect(causaDeDenegacion(todas, 'DENEGADO', 'ERROR:unavailable')).toBe('REGLAS_PUBLICADAS_O_PLANIFICADOR');
    expect(causaDeDenegacion(todas, 'DENEGADO')).toBe('REGLAS_PUBLICADAS_O_PLANIFICADOR');
    // Una causa observable (aquí: sin sesión) manda siempre sobre la lectura por relación.
    expect(causaDeDenegacion(comprobaciones(false), 'DENEGADO', 'OK')).toBe('SIN_SESION_FIREBASE');
  });

  it('F4 · `idsGestionesIndexadas` solo devuelve ids de documento válidos y sin duplicados', () => {
    expect(idsGestionesIndexadas({ a: 'g1', b: 'g2', c: 'g1' })).toEqual(['g1', 'g2']);
    expect(idsGestionesIndexadas(undefined)).toEqual([]);
    expect(idsGestionesIndexadas(null)).toEqual([]);
    expect(idsGestionesIndexadas(['g1'])).toEqual([]);
    expect(idsGestionesIndexadas('g1')).toEqual([]);
    expect(idsGestionesIndexadas({ a: '', b: 5, c: { x: 1 }, d: 'a/b', e: 'x'.repeat(129), f: 'ok~1' })).toEqual(['ok~1']);
  });
});
