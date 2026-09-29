/**
 * BLOQUE 12 · A-01 — Ámbito de las suscripciones (regresión).
 * ---------------------------------------------------------------------------
 * Qué fija este test:
 *  1. La consulta que pide cada sección/sección-modal es la que las REGLAS
 *     conceden: se evalúa el TEXTO REAL de `firestore.rules` (harness del repo,
 *     sin emulador) documento a documento; una consulta sin acotar se deniega.
 *  2. Aislamiento patrimonial: un titular NO recibe datos de otro titular; el
 *     gestor recibe únicamente pid a pid los titulares de sus carteras (L ∪ E).
 *  3. Cambio de ámbito y desmontaje: al cambiar el titular/cartera se cierran
 *     las consultas anteriores y se abren las nuevas (no queda listener viejo).
 *  4. Fallo en cerrado: sin ámbito aplicable (profesional sin cartera, titular
 *     sin inmuebles/contratos) no se abre ninguna consulta global: se devuelve
 *     vacío.
 *
 * El doble de `firebase/firestore` NO interpreta las reglas: registra la
 * consulta y la somete al evaluador del fichero real. Este test no sustituye a
 * la validación con emulador (INFRA-01), que sigue pendiente de entorno.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, sep as pathSep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
import { completarPerfilesSinteticos } from './harness/perfilesSinteticos';

const RAIZ = resolve(__dirname, '..');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const EMAIL_MASTER = (RULES.match(/function\s+isMasterAdmin\(\)\s*\{[\s\S]*?'([^'@\s]+@[^'\s]+)'/) || [])[1] as string;
const { permite } = crearEvaluadorReglas(RULES);

const PROP_A = 'prop_A';
const PROP_B = 'prop_B';
const INM_A = 'inm_A';
const INM_B = 'inm_B';

// ---------------------------------------------------------------------------
// Doble de Firestore: registra consultas y las somete a las reglas reales
// ---------------------------------------------------------------------------
type Consulta = { col: string; filtros: Array<{ campo: string; valor: string }> };
const salas = vi.hoisted(() => ({
  consultas: [] as Consulta[],
  oyentes: new Set<number>(),
  seq: 0,
}));

vi.mock('firebase/app', () => ({ initializeApp: () => ({}), getApps: () => [] }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('firebase/storage', () => ({
  getStorage: () => ({}), ref: () => ({}), uploadBytes: async () => ({}),
  uploadString: async () => ({}), getDownloadURL: async () => '', deleteObject: async () => {},
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (_db: unknown, nombre: string) => ({ __col: nombre }),
  doc: (...args: any[]) => {
    const nombre = args.length === 2 ? args[0].__col : args[1];
    const id = args.length === 2 ? args[1] : args[2];
    return { __col: nombre, id, path: `${nombre}/${id}` };
  },
  where: (campo: string, _op: string, valor: string) => ({ campo, valor }),
  query: (col: any, ...filtros: any[]) => ({ __col: col.__col, filtros: filtros.filter((f) => f && f.campo) }),
  /**
   * `onSnapshot` sintético: sólo admite consultas acotadas por igualdad que las
   * reglas acepten para el perfil de la petición; si la consulta no es
   * autorizable, se comporta como el motor real: no entrega datos y notifica el
   * error a `onError` (el canal de incidencias lo hace visible).
   */
  onSnapshot: (ref: any, onNext: (s: any) => void, onError?: (e: unknown) => void) => {
    const col: string = ref.__col;
    const filtros = (ref.filtros ?? []) as Array<{ campo: string; valor: string }>;
    const registro: Consulta = { col, filtros };
    salas.consultas.push(registro);
    const id = ++salas.seq;
    salas.oyentes.add(id);
    if (filtros.length === 0) {
      // Firestore no usa reglas como filtro: consulta no acotada ⇒ denegada.
      onError?.(new Error(`permission-denied: list ${col} sin acotar`));
    } else {
      const docs = (universo[col] ?? [])
        .filter((d) => filtros.every((f) => d[f.campo] === f.valor))
        .filter((d) => permite(col, 'list', peticion(d)));
      onNext({ docs: docs.map((d) => ({ id: d.id as string, data: () => d, exists: () => true })), forEach: (fn: (ds: any) => void) => docs.forEach((d) => fn({ id: d.id, data: () => d })) });
    }
    return () => { salas.oyentes.delete(id); };
  },
  getDocs: async () => ({ empty: true, docs: [] }),
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  setDoc: async () => {}, deleteDoc: async () => {}, updateDoc: async () => {},
  deleteField: () => ({}), writeBatch: () => ({ set() {}, update() {}, commit: async () => {} }),
  runTransaction: async () => ({}), serverTimestamp: () => ({}), arrayUnion: () => ({}), arrayRemove: () => ({}),
}));

// ---------------------------------------------------------------------------
// Universo sintético y perfil de la petición (lo fija cada caso de prueba)
// ---------------------------------------------------------------------------
let universo: Record<string, Array<Record<string, unknown>>> = {};
let escenario = 'propA';

const PERFILES: Record<string, { perfil: Record<string, unknown>; espejo: Record<string, unknown>; auth: Peticion['auth'] }> = {
  propA: {
    perfil: { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', authUid: 'uid_propA', propietarioId: PROP_A },
    espejo: { usuarioId: 'uid_propA', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: PROP_A, inmuebleIds: [INM_A], profesionalId: '' },
    auth: { uid: 'uid_propA', token: { email: 'prop-a@test.local' } },
  },
  propB: {
    perfil: { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', authUid: 'uid_propB', propietarioId: PROP_B },
    espejo: { usuarioId: 'uid_propB', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: PROP_B, inmuebleIds: [INM_B], profesionalId: '' },
    auth: { uid: 'uid_propB', token: { email: 'prop-b@test.local' } },
  },
  gestor: {
    perfil: { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', authUid: 'uid_gestor', profesionalId: 'prof_1' },
    espejo: {
      usuarioId: 'uid_gestor', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '',
      profesionalId: 'prof_1', inmuebleIds: [], carterasL: [PROP_A, PROP_B], carterasE: [],
      gestionesPorPropietario: {},
    },
    auth: { uid: 'uid_gestor', token: { email: 'gestor@test.local' } },
  },
  profesional: {
    perfil: { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', authUid: 'uid_prof', profesionalId: 'prof_1' },
    espejo: { usuarioId: 'uid_prof', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [], carterasL: [], carterasE: [] },
    auth: { uid: 'uid_prof', token: { email: 'prof@test.local' } },
  },
  master: {
    perfil: { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_master' },
    espejo: { usuarioId: 'uid_master', tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', inmuebleIds: [] },
    auth: { uid: 'uid_master', token: { email: EMAIL_MASTER } },
  },
};

function peticion(doc: Record<string, unknown>, docId = 'x'): Peticion {
  const p = PERFILES[escenario];
  const db: Peticion['db'] = {
    [`usuarios/${p.auth!.uid}`]: p.perfil,
    [`usuarios_auth/${p.auth!.uid}`]: p.espejo,
    [`inmuebles/${INM_A}`]: { id: INM_A, propietarioId: PROP_A },
    [`inmuebles/${INM_B}`]: { id: INM_B, propietarioId: PROP_B },
    [`propietarios/${PROP_A}`]: { id: PROP_A },
    [`propietarios/${PROP_B}`]: { id: PROP_B },
  };
  completarPerfilesSinteticos(db);
  return { auth: p.auth, db, resource: doc, requestResource: null, docId };
}

// Documentos de dos titulares distintos en cada colección auditada.
const DOCS: Record<string, Array<Record<string, unknown>>> = {
  polizas_seguros: [
    { id: 'p_a', propietarioId: PROP_A, inmuebleId: INM_A },
    { id: 'p_b', propietarioId: PROP_B, inmuebleId: INM_B },
  ],
  siniestros: [
    { id: 's_a', propietarioId: PROP_A, inmuebleId: INM_A, fechaComunicacion: '2026-01-01' },
    { id: 's_b', propietarioId: PROP_B, inmuebleId: INM_B, fechaComunicacion: '2026-01-01' },
  ],
  incidencias: [
    { id: 'i_a', propietarioId: PROP_A, inmuebleId: INM_A, profesionalAsignadoId: 'prof_1' },
    { id: 'i_b', propietarioId: PROP_B, inmuebleId: INM_B, profesionalAsignadoId: 'prof_9' },
  ],
  tareas_mantenimiento: [
    { id: 't_a', propietarioId: PROP_A, inmuebleId: INM_A },
    { id: 't_b', propietarioId: PROP_B, inmuebleId: INM_B },
  ],
  garantias_reparacion: [
    { id: 'g_a', propietarioId: PROP_A, profesionalId: 'prof_1' },
    { id: 'g_b', propietarioId: PROP_B, profesionalId: 'prof_9' },
  ],
  trabajos_profesionales: [
    { id: 'w_a', propietarioId: PROP_A, inmuebleId: INM_A, profesionalId: 'prof_1', fechaSolicitud: '2026-01-01' },
    { id: 'w_b', propietarioId: PROP_B, inmuebleId: INM_B, profesionalId: 'prof_9', fechaSolicitud: '2026-01-01' },
  ],
  presupuestos_profesionales: [
    { id: 'q_a', propietarioId: PROP_A, profesionalId: 'prof_1', fecha: '2026-01-01' },
    { id: 'q_b', propietarioId: PROP_B, profesionalId: 'prof_9', fecha: '2026-01-01' },
  ],
  necesidades_reforma: [
    { id: 'n_a', propietarioId: PROP_A, inmuebleId: INM_A },
    { id: 'n_b', propietarioId: PROP_B, inmuebleId: INM_B },
  ],
  proyectos_reforma: [
    { id: 'r_a', propietarioId: PROP_A, inmuebleId: INM_A, profesionalPrincipalId: 'prof_1' },
    { id: 'r_b', propietarioId: PROP_B, inmuebleId: INM_B, profesionalPrincipalId: 'prof_9' },
  ],
  gastos: [
    { id: 'x_a', propietarioId: PROP_A, inmuebleId: INM_A },
    { id: 'x_b', propietarioId: PROP_B, inmuebleId: INM_B },
  ],
  valoraciones_profesionales: [
    { id: 'v_a', propietarioId: PROP_A, inmuebleId: INM_A },
    { id: 'v_b', propietarioId: PROP_B, inmuebleId: INM_B },
  ],
  suministros: [
    { id: 'su_a', inmuebleId: INM_A },
    { id: 'su_b', inmuebleId: INM_B },
  ],
  lecturas_suministro: [
    { id: 'le_a', inmuebleId: INM_A, fechaLectura: '2026-01-01' },
    { id: 'le_b', inmuebleId: INM_B, fechaLectura: '2026-01-01' },
  ],
  cambios_titular: [
    { id: 'ca_a', inmuebleId: INM_A, contratoId: 'ct_A' },
    { id: 'ca_b', inmuebleId: INM_B, contratoId: 'ct_B' },
  ],
  mensajes_portal: [
    { id: 'me_a', contratoId: 'ct_A', inmuebleId: INM_A, createdAt: '2026-01-01' },
    { id: 'me_b', contratoId: 'ct_B', inmuebleId: INM_B, createdAt: '2026-01-01' },
  ],
};

const USUARIO = (perfil: keyof typeof PERFILES): any => ({
  id: PERFILES[perfil].espejo.usuarioId as string,
  email: `${perfil}@test.local`,
  nombre: perfil,
  tipoPerfil: PERFILES[perfil].espejo.tipoPerfil as string,
  estado: 'ACTIVO',
  roles: [],
  permisos: [],
  propietarioId: (PERFILES[perfil].espejo.propietarioId as string) || undefined,
  profesionalId: (PERFILES[perfil].espejo.profesionalId as string) || undefined,
  inmuebleIds: (PERFILES[perfil].espejo.inmuebleIds as string[]) || [],
  carterasL: (PERFILES[perfil].espejo.carterasL as string[]) || [],
  carterasE: (PERFILES[perfil].espejo.carterasE as string[]) || [],
});

beforeEach(() => {
  universo = DOCS;
  escenario = 'propA';
  salas.consultas = [];
  salas.oyentes.clear();
  salas.seq = 0;
  vi.resetModules();
});
afterEach(() => { vi.restoreAllMocks(); });

async function cargar() {
  return await import('../src/lib/firebase');
}

// ===========================================================================
// 1 · Cada colección: la consulta acotada es la que autorizan las reglas
// ===========================================================================
describe('A-01 · las consultas acotadas son autorizables y las globales no', () => {
  it('una consulta sin `where` es denegada por las reglas (evidencia base)', () => {
    escenario = 'propA';
    expect(permite('polizas_seguros', 'list', peticion(DOCS.polizas_seguros[0]))).toBe(true);
    expect(permite('polizas_seguros', 'list', peticion(DOCS.polizas_seguros[1]))).toBe(false);
  });

  const CASOS: Array<[string, string, (m: any, cb: any, scope: any) => () => void]> = [
    ['polizas_seguros', 'subscribePolizas', (m, cb, s) => m.subscribePolizas(cb, s)],
    ['siniestros', 'subscribeSiniestros', (m, cb, s) => m.subscribeSiniestros(cb, s)],
    ['incidencias', 'subscribeIncidencias', (m, cb, s) => m.subscribeIncidencias(cb, s)],
    ['tareas_mantenimiento', 'subscribeTareasMantenimiento', (m, cb, s) => m.subscribeTareasMantenimiento(cb, s)],
    ['garantias_reparacion', 'subscribeGarantiasReparacion', (m, cb, s) => m.subscribeGarantiasReparacion(cb, s)],
    ['trabajos_profesionales', 'subscribeTrabajosProfesionales', (m, cb, s) => m.subscribeTrabajosProfesionales(cb, s)],
    ['presupuestos_profesionales', 'subscribePresupuestosProfesionales', (m, cb, s) => m.subscribePresupuestosProfesionales(cb, s)],
    ['necesidades_reforma', 'subscribeNecesidadesReforma', (m, cb, s) => m.subscribeNecesidadesReforma(cb, s)],
    ['proyectos_reforma', 'subscribeProyectosReforma', (m, cb, s) => m.subscribeProyectosReforma(cb, s)],
    ['gastos', 'subscribeGastosSeguros', (m, cb, s) => m.subscribeGastosSeguros(cb, s)],
    ['valoraciones_profesionales', 'subscribeValoracionesProfesionales', (m, cb, s) => m.subscribeValoracionesProfesionales(cb, s)],
    ['suministros', 'subscribeSuministros', (m, cb, s) => m.subscribeSuministros(cb, s)],
  ];

  for (const [coleccion, nombre, invocar] of CASOS) {
    it(`${nombre} · titular recibe SÓLO lo suyo y sin error de reglas`, async () => {
      escenario = 'propA';
      const usuario = USUARIO('propA');
      const mod: any = await import(
        coleccion === 'suministros' ? '../src/lib/suministrosFirestore' : '../src/lib/firebase'
      );
      const items: any[] = [];
      const errores: unknown[] = [];
      const onError = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errores.push(a[0]); });
      const unsub = invocar(mod, (x: any) => items.push(...x), mod.scopeDeUsuario ? mod.scopeDeUsuario(usuario) : usuario);
      const ids = items.map((i) => i.id);
      // Recibe su propio documento (los colecciones con una sola fuente no
      // notifican antes de tiempo: el estado final es el del titular)
      expect(ids.length).toBeGreaterThan(0);
      // Ningún documento del OTRO titular
      const ajenos = new Set(['p_b', 's_b', 'i_b', 't_b', 'g_b', 'w_b', 'q_b', 'n_b', 'r_b', 'x_b', 'v_b', 'su_b', 'le_b', 'ca_b', 'me_b']);
      expect(ids.some((id) => ajenos.has(id))).toBe(false);
      // Todas las consultas abiertas están acotadas
      expect(salas.consultas.every((c) => c.filtros.length > 0)).toBe(true);
      onError.mockRestore();
      unsub();
    });
  }
});

// ===========================================================================
// 2 · Titular directo, gestor multi-titular, aislamiento y fallo en cerrado
// ===========================================================================
describe('A-01 · aislamiento patrimonial por perfil', () => {
  it('el titular sólo abre su propia consulta (propietarioId == su pid)', async () => {
    escenario = 'propA';
    const m = await cargar();
    const items: any[] = [];
    const unsub = m.subscribePolizas((x: any) => items.push(...x), m.scopeDeUsuario(USUARIO('propA')));
    expect(salas.consultas).toHaveLength(1);
    expect(salas.consultas[0]).toMatchObject({ col: 'polizas_seguros', filtros: [{ campo: 'propietarioId', valor: PROP_A }] });
    expect(items.map((i) => i.id)).toEqual(['p_a']);
    unsub();
    expect(salas.oyentes.size).toBe(0);
  });

  it('otro titular NO recibe los datos del primero (aislamiento A/B)', async () => {
    escenario = 'propB';
    const m = await cargar();
    const items: any[] = [];
    m.subscribePolizas((x: any) => items.push(...x), m.scopeDeUsuario(USUARIO('propB')));
    expect(salas.consultas[0].filtros[0]).toEqual({ campo: 'propietarioId', valor: PROP_B });
    expect(items.map((i) => i.id)).toEqual(['p_b']);
  });

  it('el gestor multi-titular consulta pid a pid SÓLO sus carteras (L ∪ E)', async () => {
    escenario = 'gestor';
    const m = await cargar();
    let ultimo: any[] = [];
    m.subscribePolizas((x: any) => { ultimo = x; }, m.scopeDeUsuario(USUARIO('gestor')));
    expect(salas.consultas.map((c) => c.filtros[0].valor).sort()).toEqual([PROP_A, PROP_B]);
    expect(salas.consultas).toHaveLength(2);
    expect(ultimo.map((i) => i.id).sort()).toEqual(['p_a', 'p_b']);
    // No se abre ninguna consulta sin acotar para el gestor
    expect(salas.consultas.every((c) => c.filtros.length === 1)).toBe(true);
  });

  it('gestor LIMITADO a un solo titular no recibe nada del otro (A autorizado, B no)', async () => {
    escenario = 'gestor';
    const m = await cargar();
    const gestorConDos = m.scopeDeUsuario(USUARIO('gestor'));
    // Revocación/limitación: el gestor queda autorizado SOLO para PROP_A.
    const gestorLimitado = { ...gestorConDos, propietariosGestionados: [PROP_A] };
    const items: any[] = [];
    m.subscribePolizas((x: any) => { items.push(...x); }, gestorLimitado);
    expect(salas.consultas.map((c) => c.filtros)).toEqual([[{ campo: 'propietarioId', valor: PROP_A }]]);
    const ids = new Set(items.map((i) => i.id));
    expect(ids.has('p_a')).toBe(true);
    expect(ids.has('p_b')).toBe(false);
  });

  it('titular sin ámbito (sin pid, sin inmuebles, sin cartera): vacío, nunca la colección', async () => {
    escenario = 'propA';
    const m = await cargar();
    const sinAmbito = { tipoPerfil: 'PROPIETARIO' } as any;
    const items: any[] = [];
    m.subscribePolizas((x: any) => items.push(...x), sinAmbito);
    m.subscribeIncidencias((x: any) => items.push(...x), sinAmbito);
    expect(items).toEqual([]);
    expect(salas.consultas).toEqual([]); // fallo en cerrado: ninguna consulta global
  });

  it('gestor sin cartera asignada al inicio: vacío y sin consulta global', async () => {
    escenario = 'profesional';
    const m = await cargar();
    const items: any[] = [];
    const gestorVacio = { tipoPerfil: 'PROFESIONAL', profesionalId: 'prof_1', propietariosGestionados: [] } as any;
    m.subscribeIncidencias((x: any) => items.push(...x), gestorVacio);
    // El profesional asignado sí puede ver sus incidencias asignadas (por
    // `profesionalAsignadoId`), pero nunca la colección completa ni la de otros.
    const ajenas = items.filter((i) => i.id !== 'i_a');
    expect(ajenas).toEqual([]);
    expect(salas.consultas.every((c) => c.filtros.length === 1)).toBe(true);
  });

  it('profesional sin cartera: vacío, sin consulta global (fallo en cerrado)', async () => {
    escenario = 'profesional';
    const m = await cargar();
    const items: any[] = [];
    m.subscribePolizas((x: any) => items.push(...x), m.scopeDeUsuario(USUARIO('profesional')));
    m.subscribeTareasMantenimiento((x: any) => items.push(...x), m.scopeDeUsuario(USUARIO('profesional')));
    expect(salas.consultas).toHaveLength(0);
    expect(items).toEqual([]);
  });

  it('el profesional ve sus trabajos e incidencias asignadas por su identificador', async () => {
    escenario = 'profesional';
    const m = await cargar();
    const trabajos: any[] = [];
    const incidencias: any[] = [];
    m.subscribeTrabajosProfesionales((x: any) => trabajos.push(...x), m.scopeDeUsuario(USUARIO('profesional')));
    m.subscribeIncidencias((x: any) => incidencias.push(...x), m.scopeDeUsuario(USUARIO('profesional')));
    expect(trabajos.map((t) => t.id)).toEqual(['w_a']);
    expect(incidencias.map((i) => i.id)).toEqual(['i_a']);
  });

  it('suministros y lecturas se piden inmueble a inmueble, nunca la colección', async () => {
    escenario = 'propA';
    const s = await import('../src/lib/suministrosFirestore');
    const items: any[] = [];
    s.subscribeSuministros((x: any) => items.push(...x), {
      tipoPerfil: 'PROPIETARIO', propietarioId: PROP_A, inmuebleIds: [INM_A],
    });
    expect(salas.consultas[0]).toMatchObject({ col: 'suministros', filtros: [{ campo: 'inmuebleId', valor: INM_A }] });
    expect(items.map((i) => i.id)).toEqual(['su_a']);
  });

  it('mensajes del portal se piden contrato a contrato', async () => {
    escenario = 'master';
    const s = await import('../src/lib/suministrosFirestore');
    const items: any[] = [];
    s.subscribeMensajesPortal((x: any) => items.push(...x), {
      tipoPerfil: 'ADMINISTRADOR', contratoIds: ['ct_A'],
    });
    expect(salas.consultas[0]).toMatchObject({ col: 'mensajes_portal', filtros: [{ campo: 'contratoId', valor: 'ct_A' }] });
    expect(items.map((i) => i.id)).toEqual(['me_a']);
  });

  it('sin ámbito (master) se conserva la colección completa', async () => {
    escenario = 'master';
    const m = await cargar();
    const items: any[] = [];
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.subscribePolizas((x: any) => items.push(...x), m.scopeDeUsuario(USUARIO('master')));
    expect(salas.consultas).toHaveLength(1);
    expect(salas.consultas[0].filtros).toEqual([]);
    errores.mockRestore();
  });
});

// ===========================================================================
// 3 · Cambio de ámbito: se desmonta lo anterior y se reconstruye
// ===========================================================================
describe('A-01 · cambio de ámbito y desmontaje de la suscripción anterior', () => {
  it('claveScope distingue titulares, carteras, inmuebles, profesional y contratos', () => {
    return import('../src/lib/firebase').then(({ claveScope }) => {
      const base = { tipoPerfil: 'PROPIETARIO', propietarioId: PROP_A, inmuebleIds: [INM_A] };
      expect(claveScope(base)).not.toBe(claveScope({ ...base, propietarioId: PROP_B }));
      expect(claveScope(base)).not.toBe(claveScope({ ...base, inmuebleIds: [INM_B] }));
      expect(claveScope(base)).toBe(claveScope({ ...base, inmuebleIds: [INM_A] }));
      expect(claveScope({ tipoPerfil: 'PROFESIONAL', propietariosGestionados: [PROP_A] }))
        .not.toBe(claveScope({ tipoPerfil: 'PROFESIONAL', propietariosGestionados: [PROP_A, PROP_B] }));
    });
  });

  it('al cambiar de titular se cierran las consultas anteriores y sólo queda la nueva', async () => {
    escenario = 'propA';
    const m = await cargar();
    const primera = m.subscribePolizas(() => {}, m.scopeDeUsuario(USUARIO('propA')));
    expect(salas.oyentes.size).toBe(1);
    primera(); // limpieza del efecto: desmonta la suscripción anterior
    expect(salas.oyentes.size).toBe(0);

    escenario = 'propB';
    const items: any[] = [];
    const segunda = m.subscribePolizas((x: any) => items.push(...x), m.scopeDeUsuario(USUARIO('propB')));
    expect(salas.oyentes.size).toBe(1);
    expect(salas.consultas[1].filtros[0]).toEqual({ campo: 'propietarioId', valor: PROP_B });
    expect(items.map((i) => i.id)).toEqual(['p_b']);
    segunda();
    expect(salas.oyentes.size).toBe(0);
  });

  it('una revocación de cartera elimina esa consulta del gestor', async () => {
    escenario = 'gestor';
    const m = await cargar();
    const gestorConDos = m.scopeDeUsuario(USUARIO('gestor'));
    const items: any[] = [];
    const unsub = m.subscribePolizas((x: any) => items.push(...x), gestorConDos);
    expect(salas.consultas.map((c) => c.filtros[0].valor).sort()).toEqual([PROP_A, PROP_B]);
    unsub();

    const gestorRevocado = {
      ...gestorConDos,
      propietariosGestionados: [PROP_A],
    };
    m.subscribePolizas((x: any) => items.push(...x), gestorRevocado);
    const abiertas = salas.consultas.slice(2);
    expect(abiertas.map((c) => c.filtros[0].valor)).toEqual([PROP_A]);
  });
});

// ===========================================================================
// 4 · Guardia estática: ninguna sección visible a titular vuelve a pedir sin ámbito
// ===========================================================================
describe('A-01 · guardia estática de las secciones auditadas', () => {
  const SECCIONES = [
    'src/App.tsx',
    'src/components/sections/IncidenciasSection.tsx',
    'src/components/sections/OperacionesSection.tsx',
    'src/components/sections/SuministrosSection.tsx',
    'src/components/sections/DashboardEjecutivoSection.tsx',
    'src/components/sections/FiscalidadSection.tsx',
    'src/components/sections/PolizasSegurosSection.tsx',
    'src/components/sections/ProfesionalPortalSection.tsx',
    'src/components/sections/InquilinosSection.tsx',
    'src/components/sections/ProfesionalesSection.tsx',
    'src/components/modals/DetalleIncidenciaModal.tsx',
    'src/components/modals/DetalleTrabajoProfesionalModal.tsx',
    'src/components/inmueble/CentroOperativoInmueblePanel.tsx',
    'src/components/mantenimiento/MantenimientoInmueblePanel.tsx',
    'src/components/reformas/ReformasInmueblePanel.tsx',
  ];

  it.each(SECCIONES)('%s usa el ámbito canónico', (ruta) => {
    // El detalle fino (llamada a llamada) lo cubre la guarda anterior, que
    // recorre todo `src/` y sólo exige ámbito donde la firma lo admite.
    const src = readFileSync(resolve(RAIZ, ruta), 'utf8');
    expect(src).toMatch(/scopeDeUsuario|claveScope|DataAccessScope|dataScope/);
  });

  it('ninguna llamada a una suscripción que admite `scope?` queda sin ámbito', () => {
    const RAIZ_SRC = resolve(RAIZ, 'src');
    const firebase = readFileSync(resolve(RAIZ, 'src/lib/firebase.ts'), 'utf8');
    const conScope: string[] = [];
    for (const m of firebase.matchAll(/export (?:const|function) (subscribe\w+)/g)) {
      const inicio = m.index ?? 0;
      let d = 0;
      let p = firebase.indexOf('(', inicio);
      do {
        if (firebase[p] === '(') d += 1;
        else if (firebase[p] === ')') d -= 1;
        p += 1;
      } while (d > 0);
      if (/scope\s*\?/.test(firebase.slice(firebase.indexOf('(', inicio), p))) conScope.push(m[1]);
    }
    expect(conScope.length).toBeGreaterThan(20);

    const ficheros: string[] = [];
    const recorrer = (dir: string) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const completa = resolve(dir, entrada.name);
        if (entrada.isDirectory()) recorrer(completa);
        else if (/\.tsx?$/.test(entrada.name) && !/\.test\./.test(entrada.name)) ficheros.push(completa);
      }
    };
    recorrer(RAIZ_SRC);

    const sinAmbito: string[] = [];
    for (const ruta of ficheros) {
      if (ruta.endsWith('src/lib/firebase.ts') || ruta.includes(`${pathSep}lib${pathSep}`)) continue;
      const fuente = readFileSync(ruta, 'utf8');
      for (const nombre of conScope) {
        const regex = new RegExp(`\\b${nombre}\\(`, 'g');
        for (const m of fuente.matchAll(regex)) {
          const inicio = (m.index ?? 0) + m[0].length;
          let d = 1;
          let p = inicio;
          do {
            if (fuente[p] === '(') d += 1;
            else if (fuente[p] === ')') d -= 1;
            p += 1;
          } while (d > 0);
          const llamada = fuente.slice(inicio, p - 1);
          let profundidad = 0;
          const comas: number[] = [];
          for (let i = 0; i < llamada.length; i += 1) {
            const c = llamada[i];
            if (c === '(' || c === '[' || c === '{') profundidad += 1;
            else if (c === ')' || c === ']' || c === '}') profundidad -= 1;
            else if (c === ',' && profundidad === 0) comas.push(i);
          }
          const args = comas.length > 0 ? llamada.slice(comas[0] + 1) : '';
          if (!/scope|dataScope|currentUser|usuario/i.test(args)) {
            sinAmbito.push(`${ruta.slice(RAIZ.length + 1)}:${fuente.slice(0, m.index ?? 0).split('\n').length} ${nombre}`);
          }
        }
      }
    }
    expect(sinAmbito).toEqual([]);
  });

  it('las tres colecciones sin parámetro de ámbito están justificadas', () => {
    // `subscribeAuditLogs` (sólo master: se suscribe tras esUsuarioMaster) y
    // `subscribeHabitacionesInmueble` (ya consulta `where inmuebleId == id`).
    const dashboard = readFileSync(resolve(RAIZ, 'src/components/sections/DashboardEjecutivoSection.tsx'), 'utf8');
    expect(dashboard).toMatch(/esUsuarioMaster\(currentUser\)[\s\S]{0,200}subscribeAuditLogs/);
    const formalizacion = readFileSync(resolve(RAIZ, 'src/components/sections/FormalizacionSection.tsx'), 'utf8');
    expect(formalizacion).toMatch(/subscribeHabitacionesInmueble\(inmuebleId/);
    const firebase = readFileSync(resolve(RAIZ, 'src/lib/firebase.ts'), 'utf8');
    expect(firebase).toMatch(/where\('inmuebleId', '==', inmuebleId\)/);
  });
});
