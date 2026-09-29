/**
 * FASE 11 — TEST 1–4: suscripciones Firestore con ámbito autorizado.
 * ---------------------------------------------------------------------------
 * Fija exactamente el comportamiento exigido por la orden de corrección:
 *
 *  · TEST 1 (SEPA): `ficheros_sepa`, `ordenes_pago` y `mandatos_sepa` tienen
 *    `list` SOLO master (`isMasterAdmin()` en firestore.rules §28–§30). Para
 *    cualquier contexto no master (incluido `null`/`undefined` y ADMINISTRADOR
 *    no master) NO se ejecuta `onSnapshot`: ni query, ni permission-denied.
 *    Para el master la suscripción sigue funcionando.
 *
 *  · TEST 2 (liquidaciones) y TEST 3 (gastos de tesorería): la consulta del
 *    PROPIETARIO lleva OBLIGATORIAMENTE `where('propietarioId', '==', pid)`
 *    con el `propietarioId` del contexto de sesión (no se usa la colección
 *    global ni un filtro posterior en memoria). SOLO master conserva el
 *    comportamiento actual (colección completa, §26/§27 de las reglas); un
 *    ADMINISTRADOR no master NO abre consulta porque las reglas no autorizan
 *    su `list`. Perfiles sin rama de lectura: NO QUERY.
 *
 *  · TEST 4 (enlaces_registro): con `currentUser === null` (primer render de
 *    App) NO se ejecuta `onSnapshot`. Un usuario ADMINISTRADOR/SUPERADMIN
 *    autenticado conserva su suscripción; no se introduce ningún doble
 *    `onSnapshot`.
 *
 * El doble de `firebase/firestore` registra las llamadas: la ausencia de
 * `onSnapshot` es la garantía de que no se intenta ninguna lectura.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsuarioApp } from '../src/types';

// ---------------------------------------------------------------------------
// Dobles del SDK Firebase (registran llamadas; no hay red ni emulador)
// ---------------------------------------------------------------------------
const sdk = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  where: vi.fn((campo: string, op: string, valor: unknown) => ({ __where: { campo, op, valor } })),
  query: vi.fn((col: { __col?: string }, ...filtros: unknown[]) => ({ __col: col?.__col, __filtros: filtros })),
}));

vi.mock('firebase/app', () => ({
  initializeApp: () => ({}),
  getApps: () => [],
  getApp: () => ({}),
}));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  onAuthStateChanged: () => () => {},
}));
vi.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  ref: () => ({}),
  uploadBytes: async () => ({}),
  uploadString: async () => ({}),
  getDownloadURL: async () => '',
  deleteObject: async () => {},
}));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (_db: unknown, nombre: string) => ({ __col: nombre }),
  doc: (...args: unknown[]) => {
    const nombre = args.length === 2 ? (args[0] as { __col?: string }).__col : args[1];
    const id = args.length === 2 ? args[1] : args[2];
    return { __col: nombre, id, path: `${nombre}/${String(id)}` };
  },
  onSnapshot: sdk.onSnapshot,
  where: sdk.where,
  query: sdk.query,
  getDocs: async () => ({ empty: true, docs: [] }),
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  setDoc: async () => {},
  deleteDoc: async () => {},
  updateDoc: async () => {},
  deleteField: () => ({}),
  writeBatch: () => ({ set() {}, update() {}, commit: async () => {} }),
  runTransaction: async () => ({}),
  serverTimestamp: () => ({}),
  arrayUnion: () => ({}),
  arrayRemove: () => ({}),
}));

// adminUsuarios sólo necesita esta constante de authService (misma convención
// que tests/admin-usuarios.test.ts); el resto del grafo se mantiene real.
vi.mock('../src/lib/authService', () => ({
  ADMIN_MASTER_EMAIL: 'sarqsan2@gmail.com',
}));

import {
  subscribeFicherosSepa,
  subscribeGastos,
  subscribeLiquidaciones,
  subscribeMandatosSepa,
  subscribeOrdenesPago,
} from '../src/lib/tesoreriaFirestore';
import { subscribeEnlacesRegistro } from '../src/lib/firebase';
import { esUsuarioMaster, MASTER_USER_ID } from '../src/lib/adminUsuarios';

// ---------------------------------------------------------------------------
// Fixtures de contexto de sesión (modelo UsuarioApp real)
// ---------------------------------------------------------------------------
const base = {
  nombre: 'Test',
  estado: 'ACTIVO' as const,
  roles: [] as string[],
  permisos: [] as string[],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Cuenta maestra canónica (id reservado + email master: pasa `esUsuarioMaster`). */
const MASTER: UsuarioApp = {
  ...base,
  id: MASTER_USER_ID,
  email: 'sarqsan2@gmail.com',
  tipoPerfil: 'ADMINISTRADOR',
};

/** ADMINISTRADOR NO master (sin id reservado ni email master). */
const ADMIN_NO_MASTER: UsuarioApp = {
  ...base,
  id: 'user_admin_secundario',
  email: 'admin2@test.local',
  tipoPerfil: 'ADMINISTRADOR',
};

const PROPIETARIO: UsuarioApp = {
  ...base,
  id: 'user_prop',
  email: 'prop@test.local',
  tipoPerfil: 'PROPIETARIO',
  propietarioId: 'prop_X',
};

const PROPIETARIO_SIN_ID: UsuarioApp = {
  ...base,
  id: 'user_prop_sin_id',
  email: 'prop2@test.local',
  tipoPerfil: 'PROPIETARIO',
};

const PROFESIONAL: UsuarioApp = {
  ...base,
  id: 'user_prof',
  email: 'prof@test.local',
  tipoPerfil: 'PROFESIONAL',
  profesionalId: 'prof_1',
};

const SUPERADMIN_LEGADO = {
  ...base,
  id: 'user_super',
  email: 'super@test.local',
  tipoPerfil: 'SUPERADMIN',
} as unknown as UsuarioApp;

beforeEach(() => {
  sdk.onSnapshot.mockReset();
  sdk.where.mockClear();
  sdk.query.mockClear();
  sdk.onSnapshot.mockImplementation(() => () => {});
});

/** Ref de colección "cruda" (sin query): es la lectura de colección completa. */
function esColeccionCompleta(ref: unknown): boolean {
  const r = ref as { __col?: string; __filtros?: unknown[] };
  return typeof r?.__col === 'string' && r.__filtros === undefined;
}

function filtrosDe(ref: unknown): Array<{ campo: string; op: string; valor: unknown }> {
  const r = ref as { __filtros?: Array<{ __where?: { campo: string; op: string; valor: unknown } }> };
  return (r.__filtros ?? []).map((f) => f.__where!).filter(Boolean);
}

// ===========================================================================
// TEST 1 — SEPA: solo master ejecuta la suscripción
// ===========================================================================
describe('TEST 1 — SEPA: ficheros_sepa / ordenes_pago / mandatos_sepa', () => {
  const coleccionSoloMaster: Array<[string, (cb: (items: unknown[]) => void, scope?: UsuarioApp | null) => () => void, string]> = [
    ['subscribeFicherosSepa', subscribeFicherosSepa as never, 'ficheros_sepa'],
    ['subscribeOrdenesPago', subscribeOrdenesPago as never, 'ordenes_pago'],
    ['subscribeMandatosSepa', subscribeMandatosSepa as never, 'mandatos_sepa'],
  ];

  for (const [nombre, suscribir, col] of coleccionSoloMaster) {
    it(`${nombre}: NO ejecuta onSnapshot para contexto nulo, no autenticado ni perfiles no master`, () => {
      const cb = vi.fn();
      for (const scope of [null, undefined, PROPIETARIO, PROFESIONAL, PROPIETARIO_SIN_ID, ADMIN_NO_MASTER]) {
        const cerrar = suscribir(cb, scope);
        expect(typeof cerrar).toBe('function');
      }
      expect(sdk.onSnapshot).not.toHaveBeenCalled();
      // El guard no deja datos heredados: entrega vacío explícito.
      expect(cb).toHaveBeenCalledWith([]);
    });

    it(`${nombre}: el master conserva la suscripción (una sola por llamada, sobre ${col})`, () => {
      const cb = vi.fn();
      const cerrar = suscribir(cb, MASTER);
      expect(sdk.onSnapshot).toHaveBeenCalledTimes(1);
      const [ref] = sdk.onSnapshot.mock.calls[0];
      expect((ref as { __col?: string }).__col).toBe(col);
      expect(esColeccionCompleta(ref)).toBe(true);
      // No hay doble onSnapshot: un único listener por invocación.
      cerrar();
      expect(sdk.onSnapshot).toHaveBeenCalledTimes(1);
    });
  }
});

// ===========================================================================
// TEST 2 — Liquidaciones: PROPIETARIO con ámbito propietarioId en origen
// ===========================================================================
describe('TEST 2 — liquidaciones_propietarios', () => {
  it('PROPIETARIO: la query lleva where("propietarioId","==", propietarioId actual) y NO es la colección global', () => {
    const cb = vi.fn();
    subscribeLiquidaciones(cb, PROPIETARIO);
    expect(sdk.onSnapshot).toHaveBeenCalledTimes(1);
    const [ref] = sdk.onSnapshot.mock.calls[0];
    expect((ref as { __col?: string }).__col).toBe('liquidaciones_propietarios');
    expect(esColeccionCompleta(ref)).toBe(false);
    expect(filtrosDe(ref)).toEqual([{ campo: 'propietarioId', op: '==', valor: 'prop_X' }]);
    expect(sdk.where).toHaveBeenCalledWith('propietarioId', '==', 'prop_X');
  });

  it('MASTER: conserva la lectura de colección completa (comportamiento actual)', () => {
    subscribeLiquidaciones(vi.fn(), MASTER);
    expect(sdk.onSnapshot).toHaveBeenCalledTimes(1);
    const [ref] = sdk.onSnapshot.mock.calls[0];
    expect((ref as { __col?: string }).__col).toBe('liquidaciones_propietarios');
    expect(esColeccionCompleta(ref)).toBe(true);
  });

  it('ADMINISTRADOR no master: NO QUERY (las reglas §26 solo autorizan master o propietario acotado)', () => {
    const cb = vi.fn();
    subscribeLiquidaciones(cb, ADMIN_NO_MASTER);
    expect(sdk.onSnapshot).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith([]);
  });

  it('sin contexto, PROPIETARIO sin propietarioId o perfil sin rama de lectura: NO QUERY', () => {
    const cb = vi.fn();
    for (const scope of [null, undefined, PROPIETARIO_SIN_ID, PROFESIONAL]) {
      subscribeLiquidaciones(cb, scope);
    }
    expect(sdk.onSnapshot).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith([]);
  });
});

// ===========================================================================
// TEST 3 — Gastos de tesorería: PROPIETARIO con ámbito propietarioId en origen
// ===========================================================================
describe('TEST 3 — gastos_inmuebles', () => {
  it('PROPIETARIO: la query lleva where("propietarioId","==", propietarioId actual) y NO es la colección global', () => {
    const cb = vi.fn();
    subscribeGastos(cb, PROPIETARIO);
    expect(sdk.onSnapshot).toHaveBeenCalledTimes(1);
    const [ref] = sdk.onSnapshot.mock.calls[0];
    expect((ref as { __col?: string }).__col).toBe('gastos_inmuebles');
    expect(esColeccionCompleta(ref)).toBe(false);
    expect(filtrosDe(ref)).toEqual([{ campo: 'propietarioId', op: '==', valor: 'prop_X' }]);
    expect(sdk.where).toHaveBeenCalledWith('propietarioId', '==', 'prop_X');
  });

  it('MASTER: conserva la lectura de colección completa (comportamiento actual)', () => {
    subscribeGastos(vi.fn(), MASTER);
    expect(sdk.onSnapshot).toHaveBeenCalledTimes(1);
    const [ref] = sdk.onSnapshot.mock.calls[0];
    expect((ref as { __col?: string }).__col).toBe('gastos_inmuebles');
    expect(esColeccionCompleta(ref)).toBe(true);
  });

  it('ADMINISTRADOR no master: NO QUERY (las reglas §27 solo autorizan master o propietario acotado)', () => {
    const cb = vi.fn();
    subscribeGastos(cb, ADMIN_NO_MASTER);
    expect(sdk.onSnapshot).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith([]);
  });

  it('sin contexto, PROPIETARIO sin propietarioId o perfil sin rama de lectura: NO QUERY', () => {
    const cb = vi.fn();
    for (const scope of [null, undefined, PROPIETARIO_SIN_ID, PROFESIONAL]) {
      subscribeGastos(cb, scope);
    }
    expect(sdk.onSnapshot).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith([]);
  });
});

// ===========================================================================
// TEST 4 — Enlaces de registro: sin sesión no hay lectura
// ===========================================================================
describe('TEST 4 — enlaces_registro', () => {
  it('currentUser === null / undefined (primer render): onSnapshot NO se ejecuta', () => {
    const cb = vi.fn();
    subscribeEnlacesRegistro(cb, null);
    subscribeEnlacesRegistro(cb, undefined);
    expect(sdk.onSnapshot).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith([]);
  });

  it('perfiles no administrativos: sin suscripción (comportamiento conservado)', () => {
    const cb = vi.fn();
    subscribeEnlacesRegistro(cb, PROPIETARIO);
    subscribeEnlacesRegistro(cb, PROFESIONAL);
    expect(sdk.onSnapshot).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith([]);
  });

  it('ADMINISTRADOR y SUPERADMIN autenticados: la suscripción SÍ se ejecuta (una sola por llamada)', () => {
    for (const scope of [ADMIN_NO_MASTER, MASTER, SUPERADMIN_LEGADO]) {
      sdk.onSnapshot.mockClear();
      const cb = vi.fn();
      const cerrar = subscribeEnlacesRegistro(cb, scope);
      expect(sdk.onSnapshot).toHaveBeenCalledTimes(1);
      const [ref] = sdk.onSnapshot.mock.calls[0];
      expect((ref as { __col?: string }).__col).toBe('enlaces_registro');
      cerrar();
      expect(sdk.onSnapshot).toHaveBeenCalledTimes(1);
    }
  });
});

// ===========================================================================
// Tripwire del helper reutilizado (sin jerarquía de roles paralela)
// ===========================================================================
describe('esUsuarioMaster reutilizado como guard', () => {
  it('reconoce la cuenta maestra por id reservado o email canónico y rechaza al resto', () => {
    expect(esUsuarioMaster(MASTER)).toBe(true);
    expect(esUsuarioMaster({ id: MASTER_USER_ID, email: 'otro@test.local' })).toBe(true);
    expect(esUsuarioMaster(ADMIN_NO_MASTER)).toBe(false);
    expect(esUsuarioMaster(PROPIETARIO)).toBe(false);
    expect(esUsuarioMaster(null)).toBe(false);
    expect(esUsuarioMaster(undefined)).toBe(false);
  });

  it('los guards no dejan snapshots colgando: el unsubscribe devuelto siempre es callable', () => {
    for (const cerrar of [
      subscribeFicherosSepa(vi.fn(), null),
      subscribeOrdenesPago(vi.fn(), undefined),
      subscribeMandatosSepa(vi.fn(), PROFESIONAL),
      subscribeLiquidaciones(vi.fn(), null),
      subscribeGastos(vi.fn(), PROPIETARIO_SIN_ID),
      subscribeEnlacesRegistro(vi.fn(), null),
    ]) {
      expect(typeof cerrar).toBe('function');
      expect(() => cerrar()).not.toThrow();
    }
  });

  it('el callback del guard recibe vacío y nunca datos inventados', () => {
    const cb = vi.fn();
    subscribeLiquidaciones(cb, PROFESIONAL);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith([]);
    expect(sdk.onSnapshot).not.toHaveBeenCalled();
  });
});
