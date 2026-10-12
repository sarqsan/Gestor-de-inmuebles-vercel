/**
 * SIMULADOR DE FIRESTORE GOBERNADO POR LAS REGLAS REALES (solo pruebas).
 * ---------------------------------------------------------------------------
 * Sustituye a `getDoc` / `setDoc` / `writeBatch` del SDK en las pruebas del
 * adaptador de importación: cada operación se autoriza con
 * `tests/harness/firestoreRulesEval.ts` sobre el TEXTO REAL de `firestore.rules`
 * y, si se deniega, lanza el mismo error que el SDK
 * (`permission-denied` / «Missing or insufficient permissions.»).
 *
 * Semántica modelada (la que importa para la promoción):
 *  · `getDoc` → autorización `get` con `resource` = documento existente o `null`.
 *  · `setDoc` sobre documento INEXISTENTE → `create`; sobre EXISTENTE → `update`
 *    (Firestore evalúa `update` al sobrescribir un documento existente).
 *  · `writeBatch` → atómico: todas las operaciones se autorizan contra el estado
 *    previo; si una se deniega, ninguna se aplica.
 *  · `arrayUnion` → fusiona el array al aplicar la escritura.
 *  · `update` sobre documento inexistente → error NOT_FOUND (no es denegación).
 *
 * Limitación declarada: no es el motor de Google. Lo que no modela (índices,
 * cuotas, `getAfter`) no se usa en estas pruebas.
 */
import { crearEvaluadorReglas, type Peticion } from './firestoreRulesEval';

export interface AuthSimulada { uid: string; token?: { email?: string; email_verified?: boolean } }

export interface ReferenciaSimulada { __col: string; __id: string; __key: string }

export interface SimuladorFirestore {
  readonly db: Record<string, Record<string, unknown>>;
  readonly escrituras: string[];
  readonly denegaciones: string[];
  setActor(a: AuthSimulada | null): void;
  doc(_db: unknown, col: string, id: string): ReferenciaSimulada;
  getDoc(r: ReferenciaSimulada): Promise<{ exists(): boolean; data(): unknown; id: string }>;
  setDoc(r: ReferenciaSimulada, data: Record<string, unknown>): Promise<void>;
  writeBatch(): {
    set(r: ReferenciaSimulada, data: Record<string, unknown>): void;
    update(r: ReferenciaSimulada, cambios: Record<string, unknown>): void;
    commit(): Promise<void>;
  };
  arrayUnion(...valores: unknown[]): { __arrayUnion: unknown[] };
  deepClean(v: unknown): unknown;
}

const clonar = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)) as T);

export function errorPermisos(): Error {
  return Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied', name: 'FirebaseError' });
}

export function crearSimuladorFirestore(RULES: string, db: Record<string, Record<string, unknown>>): SimuladorFirestore {
  const { permite } = crearEvaluadorReglas(RULES);
  let actor: AuthSimulada | null = null;
  const escrituras: string[] = [];
  const denegaciones: string[] = [];

  const peticion = (col: string, id: string, verbo: 'get' | 'create' | 'update', resource: Record<string, unknown> | null, requestResource: Record<string, unknown> | null): boolean => {
    const req: Peticion = { auth: actor, db, resource: resource ? clonar(resource) : null, requestResource: requestResource ? clonar(requestResource) : null, docId: id };
    return permite(col, verbo, req);
  };

  const resolverCambios = (existente: Record<string, unknown>, cambios: Record<string, unknown>): Record<string, unknown> => {
    const salida: Record<string, unknown> = { ...existente };
    for (const [k, v] of Object.entries(cambios)) {
      if (v !== null && typeof v === 'object' && '__arrayUnion' in (v as object)) {
        const previo = Array.isArray(existente[k]) ? (existente[k] as unknown[]) : [];
        const nuevos = (v as { __arrayUnion: unknown[] }).__arrayUnion.filter((x) => !previo.includes(x));
        salida[k] = [...previo, ...nuevos];
      } else {
        salida[k] = v;
      }
    }
    return salida;
  };

  const sim: SimuladorFirestore = {
    db,
    escrituras,
    denegaciones,
    setActor(a) { actor = a; },
    doc(_db, col, id) { return { __col: col, __id: id, __key: `${col}/${id}` }; },

    async getDoc(r) {
      const existente = db[r.__key];
      if (!peticion(r.__col, r.__id, 'get', existente ?? null, null)) {
        denegaciones.push(`get ${r.__key}`);
        throw errorPermisos();
      }
      const existe = existente !== undefined;
      return { exists: () => existe, data: () => clonar(existente), id: r.__id };
    },

    async setDoc(r, data) {
      const existente = db[r.__key];
      const esUpdate = existente !== undefined;
      const ok = esUpdate
        ? peticion(r.__col, r.__id, 'update', existente, data)
        : peticion(r.__col, r.__id, 'create', null, data);
      if (!ok) {
        denegaciones.push(`${esUpdate ? 'update' : 'create'} ${r.__key}`);
        throw errorPermisos();
      }
      db[r.__key] = clonar(data);
      escrituras.push(`set ${r.__key}`);
    },

    writeBatch() {
      const ops: Array<{ tipo: 'set' | 'update'; r: ReferenciaSimulada; datos: Record<string, unknown> }> = [];
      return {
        set(r, data) { ops.push({ tipo: 'set', r, datos: data }); },
        update(r, cambios) { ops.push({ tipo: 'update', r, datos: cambios }); },
        async commit() {
          // Autorización contra el estado previo (atómico: o todo o nada).
          const planes = ops.map((op) => {
            const existente = db[op.r.__key];
            if (op.tipo === 'update') {
              if (existente === undefined) {
                const e = Object.assign(new Error(`No document to update: ${op.r.__key}`), { code: 'not-found' });
                throw e;
              }
              const final = resolverCambios(existente, op.datos);
              const ok = peticion(op.r.__col, op.r.__id, 'update', existente, final);
              return { op, ok, final, esUpdate: true };
            }
            const esUpdate = existente !== undefined;
            const ok = esUpdate
              ? peticion(op.r.__col, op.r.__id, 'update', existente, op.datos)
              : peticion(op.r.__col, op.r.__id, 'create', null, op.datos);
            return { op, ok, final: op.datos, esUpdate };
          });
          const denegado = planes.find((p) => !p.ok);
          if (denegado) {
            denegaciones.push(`batch ${denegado.op.tipo} ${denegado.op.r.__key}`);
            throw errorPermisos();
          }
          for (const p of planes) {
            db[p.op.r.__key] = clonar(p.final);
            escrituras.push(`batch ${p.op.tipo} ${p.op.r.__key}`);
          }
        },
      };
    },

    arrayUnion(...valores) { return { __arrayUnion: valores }; },
    deepClean(v) { return clonar(v); },
  };
  return sim;
}
