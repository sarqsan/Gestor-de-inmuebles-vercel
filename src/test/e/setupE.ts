/**
 * BLOQUE E — Setup de la batería automatizada (ORDEN 8).
 *
 * Sustituye ÚNICAMENTE la frontera con Firebase por dobles en memoria:
 *   - `firebase/firestore`  → FirestoreMemoria (persistencia real en memoria + traza de accesos)
 *   - `firebase/auth`       → Auth sintético (crea UIDs de test; sin red)
 *   - `firebase/storage`    → Storage sintético (registra rutas; sin red)
 *   - `src/lib/firebase`    → `db`/`storage`/`auth` simulados + las funciones de
 *                             persistencia canónicas que E consume, reimplementadas
 *                             con la MISMA semántica sobre la memoria (setDoc/merge).
 *
 * El código de E (motores, servicios, hook, componentes) se ejecuta SIN modificar.
 */
import { vi } from 'vitest';
import { memoria, crearModuloFirestore } from './firestoreMemoria';

// ---------------------------------------------------------------- firestore
vi.mock('firebase/firestore', () => crearModuloFirestore());

// --------------------------------------------------------------------- auth
export const authSintetico = {
  usuarioActual: null as null | { uid: string; email: string; displayName?: string },
  creados: [] as { uid: string; email: string }[],
  /** Si se define, createUserWithEmailAndPassword lanza este error. */
  errorCreacion: null as null | { code: string; message: string },
  reset() {
    this.usuarioActual = null;
    this.creados = [];
    this.errorCreacion = null;
  },
};

vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: authSintetico.usuarioActual }),
  onAuthStateChanged: () => () => undefined,
  signOut: async () => {
    authSintetico.usuarioActual = null;
  },
  signInWithEmailAndPassword: async () => {
    throw Object.assign(new Error('auth/no-disponible-en-tests'), { code: 'auth/no-disponible-en-tests' });
  },
  createUserWithEmailAndPassword: async (_auth: unknown, email: string) => {
    if (authSintetico.errorCreacion) throw Object.assign(new Error(authSintetico.errorCreacion.message), authSintetico.errorCreacion);
    const uid = `uid_test_${authSintetico.creados.length + 1}_${email.split('@')[0]}`;
    const user = { uid, email, displayName: undefined as string | undefined };
    authSintetico.creados.push({ uid, email });
    authSintetico.usuarioActual = user;
    return { user };
  },
  updateProfile: async (user: { displayName?: string }, p: { displayName?: string }) => {
    user.displayName = p.displayName;
  },
}));

// ------------------------------------------------------------------ storage
export const storageSintetico = {
  subidas: [] as { ruta: string; tipo: string; bytes: number }[],
  /** Rutas a las que `getDownloadURL` debe responder con error (p. ej. sin permiso). */
  denegadas: new Set<string>(),
  reset() {
    this.subidas = [];
    this.denegadas.clear();
  },
};

vi.mock('firebase/storage', () => ({
  getStorage: () => ({ __storage: 'memoria' }),
  ref: (_s: unknown, ruta: string) => ({ __ruta: ruta }),
  uploadBytes: async (r: { __ruta: string }, blob: Blob) => {
    if (storageSintetico.denegadas.has(r.__ruta)) throw new Error('storage/unauthorized (simulado)');
    storageSintetico.subidas.push({ ruta: r.__ruta, tipo: blob.type, bytes: blob.size });
    return { ref: r };
  },
  getDownloadURL: async (r: { __ruta: string }) => {
    if (storageSintetico.denegadas.has(r.__ruta)) throw new Error('storage/unauthorized (simulado)');
    const existe = storageSintetico.subidas.some((s) => s.ruta === r.__ruta);
    if (!existe) throw new Error('storage/object-not-found (simulado)');
    return `https://storage.test/${encodeURIComponent(r.__ruta)}`;
  },
  deleteObject: async (r: { __ruta: string }) => {
    storageSintetico.subidas = storageSintetico.subidas.filter((s) => s.ruta !== r.__ruta);
  },
}));

// -------------------------------------------------------------- lib/firebase
// Solo los símbolos que consume el BLOQUE E. Misma semántica que la canónica
// (setDoc con merge, sanitize de undefined), ejecutada sobre la memoria.
vi.mock('../../lib/firebase', async () => {
  const fs = crearModuloFirestore();
  const db = { __db: 'memoria' };
  const quitarUndefined = (o: Record<string, unknown>) => {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = v;
    return r;
  };
  const registrarAuditoriaFirestore = async (log: Record<string, unknown>) => {
    try {
      const id = (log.id as string) || `audit_test_${Math.random().toString(36).slice(2, 8)}`;
      await fs.setDoc(fs.doc(db, 'audit_logs', id), quitarUndefined({ id, fechaHora: new Date().toISOString(), ...log }));
    } catch {
      /* la canónica también traga el error */
    }
  };
  return {
    db,
    storage: { __storage: 'memoria' },
    // El `auth` canónico refleja el usuario sintético actual (§6 F3 lo usa para el UID del progreso).
    auth: {
      get currentUser() {
        return authSintetico.usuarioActual;
      },
    },
    USUARIOS_COL: fs.collection(db, 'usuarios'),
    ENLACES_REGISTRO_COL: fs.collection(db, 'enlaces_registro'),
    registrarAuditoriaFirestore,
    saveAuditLogFirestore: registrarAuditoriaFirestore,
    saveIncidenciaFirestore: async (item: Record<string, unknown>) => {
      try {
        await fs.setDoc(fs.doc(db, 'incidencias', String(item.id)), quitarUndefined(item), { merge: true });
      } catch (err) {
        console.error('Error saving incidencia:', err);
      }
    },
    saveUsuarioFirestore: async (u: Record<string, unknown>) => {
      await fs.setDoc(fs.doc(db, 'usuarios', String(u.id)), quitarUndefined(u), { merge: true });
    },
    subscribeIncidencias: (cb: (items: unknown[]) => void) => {
      cb(memoria.idsDe('incidencias').map((id) => ({ id, ...(memoria.leer('incidencias', id) as Record<string, unknown>) })));
      return () => undefined;
    },
    subscribeEnlacesRegistro: (cb: (items: unknown[]) => void) => {
      cb(memoria.idsDe('enlaces_registro').map((id) => ({ id, ...(memoria.leer('enlaces_registro', id) as Record<string, unknown>) })));
      return () => undefined;
    },
    sanitizeObjectForFirestore: quitarUndefined,
  };
});

// --------------------------------------------------------------------- reset
export function resetEntornoE(): void {
  memoria.reset();
  authSintetico.reset();
  storageSintetico.reset();
}

