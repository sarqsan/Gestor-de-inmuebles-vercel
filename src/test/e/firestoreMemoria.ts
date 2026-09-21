/**
 * BLOQUE E — Doble de prueba de `firebase/firestore` en MEMORIA.
 *
 * Infraestructura de testing AISLADA (ORDEN 8): no toca producción, no abre
 * red, no requiere emulador. Implementa el subconjunto real de la API que usa
 * el BLOQUE E (doc/collection/getDoc/getDocs/setDoc/updateDoc/deleteDoc/
 * arrayUnion/arrayRemove/query/where/onSnapshot) sobre un Map en memoria.
 *
 * Además REGISTRA cada acceso (lecturas/escrituras por ruta) para que los
 * tests de aislamiento comprueben la capa de consulta y no solo la UI.
 *
 * Los fallos se inyectan con `fallar(...)` para probar errores de lectura y
 * escritura sin ocultar el comportamiento real de la aplicación.
 */

type Datos = Record<string, unknown>;

export interface Acceso {
  op: 'get' | 'set' | 'update' | 'delete' | 'query' | 'snapshot';
  ruta: string;
}

interface Sentinela {
  __sentinela: 'arrayUnion' | 'arrayRemove';
  valores: unknown[];
}

const esSentinela = (v: unknown): v is Sentinela =>
  !!v && typeof v === 'object' && '__sentinela' in (v as object);

export class FirestoreMemoria {
  private docs = new Map<string, Datos>();
  accesos: Acceso[] = [];
  private fallos = new Map<string, Error>();
  private oyentes = new Map<string, Set<(d: Datos | null) => void>>();

  // ----------------------------------------------------------------- fixtures
  reset(): void {
    this.docs.clear();
    this.accesos = [];
    this.fallos.clear();
    this.oyentes.clear();
  }

  sembrar(coleccion: string, id: string, datos: Datos): void {
    this.docs.set(`${coleccion}/${id}`, structuredClone({ ...datos }));
  }

  leer<T = Datos>(coleccion: string, id: string): T | null {
    const d = this.docs.get(`${coleccion}/${id}`);
    return d ? (structuredClone(d) as T) : null;
  }

  existe(coleccion: string, id: string): boolean {
    return this.docs.has(`${coleccion}/${id}`);
  }

  idsDe(coleccion: string): string[] {
    const pref = `${coleccion}/`;
    return Array.from(this.docs.keys())
      .filter((k) => k.startsWith(pref))
      .map((k) => k.slice(pref.length));
  }

  /** Inyecta un fallo para una operación sobre una ruta (`col/id`) o colección (`col`). */
  fallar(op: Acceso['op'] | '*', ruta: string, mensaje = 'permission-denied (simulado)'): void {
    this.fallos.set(`${op}:${ruta}`, new Error(mensaje));
  }

  private comprobarFallo(op: Acceso['op'], ruta: string): void {
    const col = ruta.split('/')[0];
    for (const clave of [`${op}:${ruta}`, `*:${ruta}`, `${op}:${col}`, `*:${col}`]) {
      const err = this.fallos.get(clave);
      if (err) throw err;
    }
  }

  rutasLeidas(): string[] {
    return this.accesos.filter((a) => a.op === 'get' || a.op === 'snapshot').map((a) => a.ruta);
  }

  rutasEscritas(): string[] {
    return this.accesos
      .filter((a) => a.op === 'set' || a.op === 'update' || a.op === 'delete')
      .map((a) => a.ruta);
  }

  // --------------------------------------------------------------- operaciones
  get(ruta: string): Datos | null {
    this.accesos.push({ op: 'get', ruta });
    this.comprobarFallo('get', ruta);
    const d = this.docs.get(ruta);
    return d ? structuredClone(d) : null;
  }

  set(ruta: string, datos: Datos, merge: boolean): void {
    this.accesos.push({ op: 'set', ruta });
    this.comprobarFallo('set', ruta);
    const limpio = quitarUndefined(datos);
    const previo = this.docs.get(ruta);
    this.docs.set(ruta, merge && previo ? { ...previo, ...limpio } : limpio);
    this.notificar(ruta);
  }

  update(ruta: string, cambios: Datos): void {
    this.accesos.push({ op: 'update', ruta });
    this.comprobarFallo('update', ruta);
    const previo = this.docs.get(ruta);
    if (!previo) throw new Error(`not-found: ${ruta}`);
    const nuevo: Datos = { ...previo };
    for (const [k, v] of Object.entries(cambios)) {
      if (esSentinela(v)) {
        const actual = Array.isArray(nuevo[k]) ? [...(nuevo[k] as unknown[])] : [];
        if (v.__sentinela === 'arrayUnion') {
          for (const x of v.valores) if (!actual.includes(x)) actual.push(x);
        } else {
          for (const x of v.valores) {
            const i = actual.indexOf(x);
            if (i >= 0) actual.splice(i, 1);
          }
        }
        nuevo[k] = actual;
      } else if (v !== undefined) {
        nuevo[k] = v;
      }
    }
    this.docs.set(ruta, nuevo);
    this.notificar(ruta);
  }

  delete(ruta: string): void {
    this.accesos.push({ op: 'delete', ruta });
    this.comprobarFallo('delete', ruta);
    this.docs.delete(ruta);
    this.notificar(ruta);
  }

  query(coleccion: string, filtros: { campo: string; op: string; valor: unknown }[]): { id: string; datos: Datos }[] {
    this.accesos.push({ op: 'query', ruta: coleccion });
    this.comprobarFallo('query', coleccion);
    const pref = `${coleccion}/`;
    const res: { id: string; datos: Datos }[] = [];
    for (const [k, d] of this.docs) {
      if (!k.startsWith(pref)) continue;
      const ok = filtros.every((f) => {
        const v = d[f.campo];
        if (f.op === '==') return v === f.valor;
        if (f.op === 'in') return Array.isArray(f.valor) && f.valor.includes(v);
        if (f.op === 'array-contains') return Array.isArray(v) && v.includes(f.valor);
        return false;
      });
      if (ok) res.push({ id: k.slice(pref.length), datos: structuredClone(d) });
    }
    return res;
  }

  suscribirDoc(ruta: string, cb: (d: Datos | null) => void): () => void {
    this.accesos.push({ op: 'snapshot', ruta });
    if (!this.oyentes.has(ruta)) this.oyentes.set(ruta, new Set());
    this.oyentes.get(ruta)!.add(cb);
    return () => this.oyentes.get(ruta)?.delete(cb);
  }

  private notificar(ruta: string): void {
    const d = this.docs.get(ruta) || null;
    this.oyentes.get(ruta)?.forEach((cb) => cb(d ? structuredClone(d) : null));
  }
}

function quitarUndefined(o: Datos): Datos {
  const r: Datos = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = v;
  return r;
}

/** Instancia única compartida por el módulo mock y los tests. */
export const memoria = new FirestoreMemoria();

// ---------------------------------------------------------------------------
// Fábrica del módulo `firebase/firestore` simulado (se pasa a vi.mock)
// ---------------------------------------------------------------------------

interface RefDoc { __tipo: 'doc'; ruta: string; id: string; coleccion: string }
interface RefCol { __tipo: 'col'; coleccion: string }
interface Consulta { __tipo: 'query'; coleccion: string; filtros: { campo: string; op: string; valor: unknown }[] }

function snapshotDoc(ref: RefDoc, datos: Datos | null) {
  return {
    id: ref.id,
    ref,
    exists: () => datos !== null,
    data: () => (datos === null ? undefined : datos),
  };
}

export function crearModuloFirestore() {
  const doc = (...args: unknown[]): RefDoc => {
    // doc(db, col, id) | doc(colRef, id) | doc(db, 'a/b')
    let coleccion: string;
    let id: string;
    if (args.length >= 3) {
      coleccion = String(args[1]);
      id = String(args[2]);
    } else if (args.length === 2 && args[0] && typeof args[0] === 'object' && (args[0] as RefCol).__tipo === 'col') {
      coleccion = (args[0] as RefCol).coleccion;
      id = String(args[1]);
    } else {
      const partes = String(args[1]).split('/');
      coleccion = partes[0];
      id = partes[1];
    }
    return { __tipo: 'doc', ruta: `${coleccion}/${id}`, id, coleccion };
  };
  const collection = (_db: unknown, nombre: string): RefCol => ({ __tipo: 'col', coleccion: nombre });
  const where = (campo: string, op: string, valor: unknown) => ({ __tipo: 'where', campo, op, valor });
  const query = (base: RefCol | Consulta, ...clausulas: unknown[]): Consulta => {
    const filtros = 'filtros' in base ? [...base.filtros] : [];
    for (const c of clausulas) {
      const w = c as { __tipo?: string; campo: string; op: string; valor: unknown };
      if (w && w.__tipo === 'where') filtros.push({ campo: w.campo, op: w.op, valor: w.valor });
    }
    return { __tipo: 'query', coleccion: base.coleccion, filtros };
  };

  return {
    doc,
    collection,
    where,
    query,
    orderBy: () => ({ __tipo: 'orderBy' }),
    limit: () => ({ __tipo: 'limit' }),
    arrayUnion: (...valores: unknown[]): Sentinela => ({ __sentinela: 'arrayUnion', valores }),
    arrayRemove: (...valores: unknown[]): Sentinela => ({ __sentinela: 'arrayRemove', valores }),
    serverTimestamp: () => new Date().toISOString(),
    Timestamp: { now: () => ({ toDate: () => new Date() }) },
    getFirestore: () => ({ __db: 'memoria' }),
    async getDoc(ref: RefDoc) {
      return snapshotDoc(ref, memoria.get(ref.ruta));
    },
    async getDocs(q: Consulta | RefCol) {
      const filtros = 'filtros' in q ? q.filtros : [];
      const filas = memoria.query(q.coleccion, filtros);
      const docs = filas.map((f) => snapshotDoc(doc({}, q.coleccion, f.id), f.datos));
      return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn: (d: unknown) => void) => docs.forEach(fn) };
    },
    async setDoc(ref: RefDoc, datos: Datos, opts?: { merge?: boolean }) {
      memoria.set(ref.ruta, datos, !!opts?.merge);
    },
    async updateDoc(ref: RefDoc, cambios: Datos) {
      memoria.update(ref.ruta, cambios);
    },
    async deleteDoc(ref: RefDoc) {
      memoria.delete(ref.ruta);
    },
    async addDoc(col: RefCol, datos: Datos) {
      const id = `auto_${Math.random().toString(36).slice(2, 10)}`;
      memoria.set(`${col.coleccion}/${id}`, datos, false);
      return doc({}, col.coleccion, id);
    },
    onSnapshot(refOrQuery: RefDoc | Consulta | RefCol, onNext: (s: unknown) => void, onError?: (e: Error) => void) {
      if ((refOrQuery as RefDoc).__tipo === 'doc') {
        const ref = refOrQuery as RefDoc;
        // Emite el estado actual de forma asíncrona y luego los cambios.
        Promise.resolve().then(() => {
          try {
            onNext(snapshotDoc(ref, memoria.get(ref.ruta)));
          } catch (e) {
            onError?.(e as Error);
          }
        });
        return memoria.suscribirDoc(ref.ruta, (d) => onNext(snapshotDoc(ref, d)));
      }
      const q = refOrQuery as Consulta | RefCol;
      const filtros = 'filtros' in q ? q.filtros : [];
      Promise.resolve().then(() => {
        try {
          const filas = memoria.query(q.coleccion, filtros);
          const docs = filas.map((f) => snapshotDoc(doc({}, q.coleccion, f.id), f.datos));
          onNext({ docs, empty: docs.length === 0, size: docs.length, forEach: (fn: (d: unknown) => void) => docs.forEach(fn) });
        } catch (e) {
          onError?.(e as Error);
        }
      });
      return () => undefined;
    },
    writeBatch() {
      const ops: (() => void)[] = [];
      return {
        set: (ref: RefDoc, datos: Datos, opts?: { merge?: boolean }) => ops.push(() => memoria.set(ref.ruta, datos, !!opts?.merge)),
        update: (ref: RefDoc, cambios: Datos) => ops.push(() => memoria.update(ref.ruta, cambios)),
        delete: (ref: RefDoc) => ops.push(() => memoria.delete(ref.ruta)),
        commit: async () => ops.forEach((f) => f()),
      };
    },
    async runTransaction(_db: unknown, fn: (tx: unknown) => Promise<unknown>) {
      return fn({
        get: async (ref: RefDoc) => snapshotDoc(ref, memoria.get(ref.ruta)),
        set: (ref: RefDoc, datos: Datos, opts?: { merge?: boolean }) => memoria.set(ref.ruta, datos, !!opts?.merge),
        update: (ref: RefDoc, cambios: Datos) => memoria.update(ref.ruta, cambios),
      });
    },
  };
}
