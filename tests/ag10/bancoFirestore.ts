/**
 * AG-10 · Banco de pruebas con SEMÁNTICA DE FIRESTORE sobre el código real.
 *
 * No imita a mano lo que hace `firebase.ts`: lo EJECUTA. Mockea
 * `firebase/firestore` con un almacén en memoria que reproduce las propiedades
 * que importan para la concurrencia:
 *
 *   · `runTransaction` con control de versión optimista: si un documento leído
 *     en la transacción cambia antes del commit, la transacción se ABORTA con
 *     `aborted` y se reejecuta el callback (como el SDK real). Nunca se aplica
 *     una escritura construida sobre una lectura vieja.
 *   · `set(..., { merge: true })` a nivel de campo: `registroCobros` es una LISTA
 *     y se sustituye ENTERA, que es justo el defecto que AG-10 corrige.
 *   · `setDoc` fuera de transacción se registra aparte, para exigir que el
 *     guardado del contrato ya no lo use.
 */
import { vi } from 'vitest';

export type Ref = { col: string; id: string; path: string };
export type Dato = Record<string, unknown>;

export interface Almacen {
  docs: Map<string, Dato>;
  /** Commits efectivos por ruta (para contar escrituras duplicadas). */
  commits: Map<string, number>;
  /** Escrituras hechas FUERA de transacción (deben ser cero en los flujos AG-10). */
  escriturasFueraDeTransaccion: string[];
  /** Callbacks de transacción ejecutados (incluye reejecuciones por conflicto). */
  intentosTransaccion: number;
  /** Se ejecuta justo DESPUÉS de leer y antes de commitear: simula a otro cliente. */
  interceptor?: (docId: string) => void | Promise<void>;
  /** Fallo inyectado en el commit (red / permiso). */
  fallarCommit?: (docId: string) => Error | undefined;
}

export const almacen: Almacen = {
  docs: new Map(),
  commits: new Map(),
  escriturasFueraDeTransaccion: [],
  intentosTransaccion: 0,
};

function fusionar(previo: Dato | undefined, datos: Dato): Dato {
  const salida: Dato = { ...(previo ?? {}) };
  for (const [clave, valor] of Object.entries(datos)) {
    if (valor && typeof valor === 'object' && '__deleteField' in (valor as object)) delete salida[clave];
    else salida[clave] = structuredClone(valor);
  }
  return salida;
}

const huella = (doc: Dato | undefined) => JSON.stringify(doc ?? null);

/** El SDK real se sustituye ANTES de importar `src/lib/firebase.ts`. */
vi.mock('firebase/app', () => {
  const app = {};
  return { initializeApp: () => app, getApps: () => [app] };
});

vi.mock('firebase/auth', () => ({
  getAuth: () => ({
    currentUser: { uid: 'uid-ag10', email: 'ag10@example.invalid', displayName: 'Titular AG-10' },
  }),
  onAuthStateChanged: () => () => {},
}));

vi.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  ref: () => ({}),
  uploadBytes: async () => ({}),
  getDownloadURL: async () => '',
  deleteObject: async () => {},
  uploadBytesResumable: () => ({}),
  listAll: async () => ({ items: [], prefixes: [] }),
}));

vi.mock('firebase/firestore', () => {
  const ref = (col: string, id: string): Ref => ({ col, id, path: `${col}/${id}` });
  const snapshot = (r: Ref) => {
    const datos = almacen.docs.get(r.path);
    return {
      id: r.id,
      exists: () => datos !== undefined,
      data: () => (datos === undefined ? undefined : structuredClone(datos)),
    };
  };
  const escribir = (r: Ref, datos: Dato, merge: boolean) => {
    almacen.docs.set(r.path, merge ? fusionar(almacen.docs.get(r.path), datos) : structuredClone(datos));
    almacen.commits.set(r.path, (almacen.commits.get(r.path) ?? 0) + 1);
  };

  return {
    getFirestore: () => ({ __db: true }),
    collection: (_db: unknown, col: string) => ({ col }),
    doc: (...args: unknown[]) => {
      if (args.length === 2) {
        const [padre, id] = args as [{ col: string }, string];
        return ref(padre.col, id);
      }
      const [, col, id] = args as [unknown, string, string];
      return ref(col, id ?? `auto-${almacen.docs.size}`);
    },
    getDoc: async (r: Ref) => {
      almacen.escriturasFueraDeTransaccion.push(`getDoc:${r.path}`);
      return snapshot(r);
    },
    setDoc: async (r: Ref, datos: Dato, opciones?: { merge?: boolean }) => {
      almacen.escriturasFueraDeTransaccion.push(`setDoc:${r.path}`);
      escribir(r, datos, !!opciones?.merge);
    },
    updateDoc: async (r: Ref, datos: Dato) => {
      almacen.escriturasFueraDeTransaccion.push(`updateDoc:${r.path}`);
      escribir(r, datos, true);
    },
    deleteDoc: async (r: Ref) => { almacen.docs.delete(r.path); },
    deleteField: () => ({ __deleteField: true }),
    arrayUnion: (...valores: unknown[]) => ({ __arrayUnion: valores }),
    arrayRemove: (...valores: unknown[]) => ({ __arrayRemove: valores }),
    onSnapshot: () => () => {},
    getDocs: async () => ({ docs: [], empty: true, forEach: () => {} }),
    query: (...args: unknown[]) => args[0],
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    writeBatch: () => {
      const pendientes: Array<{ ref: Ref; datos: Dato; merge: boolean }> = [];
      return {
        set: (r: Ref, datos: Dato, opciones?: { merge?: boolean }) =>
          pendientes.push({ ref: r, datos, merge: !!opciones?.merge }),
        update: (r: Ref, datos: Dato) => pendientes.push({ ref: r, datos, merge: true }),
        delete: () => {},
        commit: async () => {
          for (const p of pendientes) escribir(p.ref, p.datos, p.merge);
        },
      };
    },
    /**
     * Transacción con CONTROL DE VERSIÓN OPTIMISTA: si un documento leído cambia
     * antes del commit, se aborta y se reejecuta el callback (SDK real).
     */
    runTransaction: async (_db: unknown, callback: (tx: unknown) => Promise<unknown>) => {
      const MAX = 10;
      for (let intento = 0; intento < MAX; intento += 1) {
        almacen.intentosTransaccion += 1;
        const versiones = new Map<string, string>();
        const pendientes: Array<{ ref: Ref; datos: Dato; merge: boolean }> = [];
        const leidos: string[] = [];
        const tx = {
          get: async (r: Ref) => {
            leidos.push(r.path);
            versiones.set(r.path, huella(almacen.docs.get(r.path)));
            return snapshot(r);
          },
          set: (r: Ref, datos: Dato, opciones?: { merge?: boolean }) => {
            pendientes.push({ ref: r, datos, merge: !!opciones?.merge });
          },
        };
        const resultado = await callback(tx);
        if (almacen.interceptor && intento === 0) {
          for (const ruta of leidos) {
            await almacen.interceptor(ruta.split('/').pop() as string);
          }
        }
        const perdido = [...versiones.entries()].some(([ruta, v]) => huella(almacen.docs.get(ruta)) !== v);
        if (perdido) {
          const err = new Error('Transaction aborted: document changed');
          (err as { code?: string }).code = 'aborted';
          throw err;
        }
        const fallo = pendientes.map((p) => almacen.fallarCommit?.(p.ref.id)).find(Boolean);
        if (fallo) throw fallo;
        for (const p of pendientes) escribir(p.ref, p.datos, p.merge);
        return resultado;
      }
      throw new Error('transacción no convergió (demasiados conflictos)');
    },
  };
});

export function reiniciarAlmacen(seed: Array<[string, Dato]> = []): void {
  almacen.docs.clear();
  almacen.commits.clear();
  almacen.escriturasFueraDeTransaccion.length = 0;
  almacen.intentosTransaccion = 0;
  almacen.interceptor = undefined;
  almacen.fallarCommit = undefined;
  for (const [ruta, datos] of seed) almacen.docs.set(ruta, structuredClone(datos));
}

export const leer = (ruta: string): Dato | undefined => almacen.docs.get(ruta);
export const commitsDe = (ruta: string): number => almacen.commits.get(ruta) ?? 0;
