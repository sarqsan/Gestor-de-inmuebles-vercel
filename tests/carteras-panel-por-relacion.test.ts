/**
 * «Mis carteras delegadas» (panel del gestor) — misma lectura por relación (2026-10-01).
 * ---------------------------------------------------------------------------
 * `cargarCarterasOnboarding` es la SEGUNDA lectura de «las gestiones donde soy gestor» (la primera es
 * la escucha del Portal, ver `carteras-lectura-por-relacion.test.ts`) y tenía la misma dependencia:
 * la consulta de colección. Si Firestore la deniega aunque la identidad del espejo es la del gestor,
 * se leen las gestiones POR RELACIÓN (un `get` por cada id del índice del espejo propio). Aquí, con el
 * TEXTO REAL de `firestore.rules` decidiendo cada `get`:
 *
 *  · consulta denegada + estado cumplido ⇒ el panel recibe sus delegaciones (sin falso error);
 *  · si algún `get` se deniega ⇒ se relanza la denegación ORIGINAL (nada se disfraza);
 *  · una gestión ajena colada en el índice jamás se entrega;
 *  · si la consulta se autoriza, no se hace ninguna lectura por relación;
 *  · un error que no es de permisos no se trata como denegación;
 *  · la identidad del espejo sigue siendo obligatoria (`Identidad de cartera no sincronizada`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';

const RULES = readFileSync(resolve(__dirname, '..', 'firestore.rules'), 'utf8');
let permite = crearEvaluadorReglas(RULES).permite;

type Doc = Record<string, unknown>;
const m = vi.hoisted(() => ({
  db: {} as Record<string, Record<string, unknown>>,
  uid: 'uid_g' as string,
  /** Qué hace `getDocs` (la consulta de colección) en esta prueba. */
  lista: 'rules' as 'rules' | 'denegada' | 'red',
  lecturasGestion: [] as string[],
  consultasGestion: 0,
}));

vi.mock('../src/lib/firebase', () => ({
  auth: { get currentUser() { return { uid: m.uid, email: 'gestor@test.local', emailVerified: true }; } },
  db: {},
  sanitizeObjectForFirestore: (v: unknown) => JSON.parse(JSON.stringify(v)),
}));
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn(), createUserWithEmailAndPassword: vi.fn(), sendEmailVerification: vi.fn(),
}));
vi.mock('firebase/firestore', () => {
  const denegada = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  const peticion = (resource: Doc | null, docId: string): Peticion => ({
    auth: { uid: m.uid, token: { email: 'gestor@test.local', email_verified: true } },
    db: m.db, resource, requestResource: null, docId,
  });
  return {
    collection: (_db: unknown, path: string) => ({ path }),
    doc: (...args: any[]) => ({ path: `${args[1]}/${args[2]}`, id: args[2], __col: args[1] }),
    where: (field: string, op: string, val: unknown) => ({ field, op, val }),
    query: (col: any, ...filters: any[]) => ({ ...col, filters }),
    getDoc: async (ref: any) => {
      if (ref.__col === 'gestiones_cartera') m.lecturasGestion.push(ref.id);
      const d = m.db[ref.path] ?? null;
      let ok = false;
      try { ok = permite(ref.__col, 'get', peticion(d, ref.id)); } catch { ok = false; }
      if (!ok) throw denegada();
      return { id: ref.id, exists: () => d !== null, data: () => d };
    },
    getDocs: async (ref: any) => {
      const enGestiones = ref.path === 'gestiones_cartera';
      if (enGestiones) m.consultasGestion += 1;
      if (enGestiones && m.lista === 'denegada') throw denegada();
      if (enGestiones && m.lista === 'red') throw Object.assign(new Error('offline'), { code: 'unavailable' });
      const docs = Object.keys(m.db)
        .filter((p) => p.startsWith(`${ref.path}/`))
        .filter((p) => (ref.filters || []).every((f: any) => m.db[p][f.field] === f.val))
        .map((p) => ({ id: p.split('/').at(-1)!, exists: () => true, data: () => m.db[p] }));
      return { docs, empty: docs.length === 0 };
    },
    runTransaction: async () => ({}),
  };
});

const PARCIAL: Doc = {
  id: 'o~g', propietarioId: 'o', gestorUsuarioId: 'g', estado: 'ACTIVA', inmuebleIds: ['i'],
  permiso: 'LECTURA', resolucionInvitacion: 'ACEPTADA', tipoGestor: 'GESTOR_PROFESIONAL',
};
const AJENA: Doc = {
  id: 'o~otro', propietarioId: 'o', gestorUsuarioId: 'otro', estado: 'ACTIVA', inmuebleIds: ['i'],
  permiso: 'LECTURA', resolucionInvitacion: 'ACEPTADA',
};

function mundo(): Record<string, Doc> {
  return {
    'usuarios_auth/uid_g': {
      uid: 'uid_g', usuarioId: 'g', email: 'gestor@test.local', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO',
      roles: ['GESTOR_PATRIMONIAL'], propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [],
      gestionesPorPropietario: { o: 'o~g' }, carterasL: [], carterasE: [],
    },
    'usuarios/g': {
      id: 'g', authUid: 'uid_g', email: 'gestor@test.local', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO',
      roles: ['GESTOR_PATRIMONIAL'], profesionalId: 'prof_1',
    },
    'gestiones_cartera/o~g': PARCIAL,
    'gestiones_cartera/o~otro': AJENA,
    'inmuebles/i': { id: 'i', propietarioId: 'o', descripcion: 'Piso 1' },
    'inmuebles/j': { id: 'j', propietarioId: 'o', descripcion: 'Piso no delegado' },
  };
}

const usuario = { id: 'g' } as any;
async function cargar() {
  vi.resetModules();
  return (await import('../src/lib/onboardingCarterasFirebase')).cargarCarterasOnboarding;
}

beforeEach(() => {
  permite = crearEvaluadorReglas(RULES).permite;
  m.db = mundo();
  m.uid = 'uid_g';
  m.lista = 'rules';
  m.lecturasGestion = [];
  m.consultasGestion = 0;
});

describe('Panel «Mis carteras delegadas» — lectura por relación cuando la consulta se deniega', () => {
  it('P1 · consulta denegada + estado cumplido ⇒ recibe SU delegación y los inmuebles delegados, sin error', async () => {
    m.lista = 'denegada';
    const cargarCarteras = await cargar();
    const r = await cargarCarteras(usuario);

    expect(r).toHaveLength(1);
    expect(r[0].gestion).toMatchObject({ id: 'o~g', gestorUsuarioId: 'g', estado: 'ACTIVA' });
    // El inmueble delegado se lee por id (la regla lo autoriza); el no delegado jamás se solicita.
    expect(r[0].inmuebles.map((i) => i.id)).toEqual(['i']);
    expect(m.lecturasGestion).toEqual(['o~g']);
  });

  it('P2 · la gestión de OTRO gestor colada en el índice se deniega por documento ⇒ se relanza la denegación original', async () => {
    m.lista = 'denegada';
    (m.db['usuarios_auth/uid_g'] as Doc).gestionesPorPropietario = { o: 'o~g', p: 'o~otro' };
    const cargarCarteras = await cargar();
    await expect(cargarCarteras(usuario)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('P3 · con el estado roto (ficha no enlazada) el `get` también se deniega ⇒ error real, sin datos', async () => {
    m.lista = 'denegada';
    m.db['usuarios/g'] = { ...(m.db['usuarios/g'] as Doc), authUid: 'uid_de_otra_persona' };
    const cargarCarteras = await cargar();
    await expect(cargarCarteras(usuario)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('P4 · sin relaciones indexadas ⇒ lista vacía (no hay delegaciones), no un error', async () => {
    m.lista = 'denegada';
    delete (m.db['usuarios_auth/uid_g'] as Doc).gestionesPorPropietario;
    const cargarCarteras = await cargar();
    expect(await cargarCarteras(usuario)).toEqual([]);
    expect(m.lecturasGestion).toEqual([]);
  });

  it('P5 · si la consulta se autoriza NO se hace ninguna lectura por relación', async () => {
    const cargarCarteras = await cargar();
    const r = await cargarCarteras(usuario);
    expect(r.map((x) => x.gestion.id)).toEqual(['o~g']);
    expect(m.consultasGestion).toBe(1);
    expect(m.lecturasGestion).toEqual([]);
  });

  it('P6 · un error que NO es de permisos (red) se relanza tal cual: no se confunde con una denegación', async () => {
    m.lista = 'red';
    const cargarCarteras = await cargar();
    await expect(cargarCarteras(usuario)).rejects.toMatchObject({ code: 'unavailable' });
    expect(m.lecturasGestion).toEqual([]);
  });

  it('P7 · la identidad del espejo sigue siendo obligatoria: otro usuario no lee las carteras del gestor', async () => {
    m.lista = 'denegada';
    const cargarCarteras = await cargar();
    await expect(cargarCarteras({ id: 'otro' } as any)).rejects.toThrow(/Identidad de cartera no sincronizada/);
    expect(m.lecturasGestion).toEqual([]);
  });
});
