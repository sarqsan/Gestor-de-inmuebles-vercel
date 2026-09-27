/**
 * GESTIONES-CARTERA — Adaptador Firestore de los puertos del servicio.
 * ---------------------------------------------------------------------------
 * ÚNICO fichero del bloque que importa Firebase. El núcleo
 * (`gestionesCarteraServicio.ts`) permanece sin Firebase y testeable con dobles
 * locales; este adaptador es la capa delgada donde:
 *  · la creación estricta usa transacción (get → set) para que "crear" falle
 *    de verdad si el documento ya existe: nunca sobrescritura silenciosa;
 *  · las transiciones usan transacción (get → aplicar → set) para que el
 *    histórico `eventos[]` append-only jamás pierda eventos por concurrencia;
 *  · la auditoría se integra con el mecanismo EXISTENTE `audit_logs`
 *    (`registrarAuditoriaFirestore`; append-only por reglas);
 *  · el espejo `usuarios_auth/{uid}` se escribe con merge de SOLO
 *    `carterasL/carterasE` (único escritor legítimo: sesión master, reglas D3).
 *
 * No hay aquí lógica de negocio: solo traducción de puertos. `firebase.ts` NO
 * se modifica: se reutilizan sus exports (`db`, `registrarAuditoriaFirestore`,
 * `sanitizeObjectForFirestore`).
 *
 * CONTEXTO: todas las escrituras exigen sesión master (reglas). Las lecturas
 * siguen las reglas vigentes (titular/gestor/admin según colección).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, registrarAuditoriaFirestore, sanitizeObjectForFirestore } from './firebase';
import {
  COLECCION_ESPEJOS_AUTH,
  COLECCION_GESTIONES_CARTERA,
  COLECCION_PROPIETARIOS,
  COLECCION_USUARIOS,
  type DependenciasGestionesCartera,
  type EntradaAuditoriaGestiones,
  type ProyeccionEspejo,
  type PuertoAuditoriaGestiones,
  type PuertoEspejoCarteras,
  type PuertoGestionesCartera,
  type PuertoPropietariosGestiones,
  type PuertoUsuariosGestiones,
  type UsuarioGestionable,
} from './gestionesCarteraServicio';
import type { GestionCartera } from './gestionesCartera';

function gestionDesdeSnap(id: string, data: Record<string, unknown>): GestionCartera {
  return { ...(data as unknown as GestionCartera), id };
}

export const puertoGestionesCarteraFirestore: PuertoGestionesCartera = {
  async obtenerGestion(id) {
    const snap = await getDoc(doc(db, COLECCION_GESTIONES_CARTERA, id));
    return snap.exists() ? gestionDesdeSnap(snap.id, snap.data()) : null;
  },
  async crearGestion(gestion) {
    const datos = sanitizeObjectForFirestore({ ...gestion, id: gestion.id });
    await runTransaction(db, async (tx) => {
      const ref = doc(db, COLECCION_GESTIONES_CARTERA, gestion.id);
      const snap = await tx.get(ref);
      if (snap.exists()) {
        throw new Error(
          `El documento ${COLECCION_GESTIONES_CARTERA}/${gestion.id} ya existe; no se sobrescribe en silencio.`
        );
      }
      tx.set(ref, datos);
    });
  },
  async aplicarTransicion(id, aplicar) {
    return runTransaction(db, async (tx) => {
      const ref = doc(db, COLECCION_GESTIONES_CARTERA, id);
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new Error(`La gestión ${id} no existe.`);
      }
      // La transición pura se re-ejecuta sobre el documento FRESCO dentro de
      // la transacción: si otro escritor la cambió bajo nuestros pies y el
      // evento ya no aplica, `aplicar` lanza y NO se escribe nada.
      const confirmada = aplicar(gestionDesdeSnap(snap.id, snap.data()));
      tx.set(ref, sanitizeObjectForFirestore({ ...confirmada, id }));
      return confirmada;
    });
  },
  async listarPorPropietario(propietarioId, estado) {
    const filtros = [where('propietarioId', '==', propietarioId)];
    if (estado !== undefined) filtros.push(where('estado', '==', estado));
    const snap = await getDocs(
      query(collection(db, COLECCION_GESTIONES_CARTERA), ...filtros)
    );
    return snap.docs.map((d) => gestionDesdeSnap(d.id, d.data()));
  },
  async listarPorGestor(gestorUsuarioId, estado) {
    const filtros = [where('gestorUsuarioId', '==', gestorUsuarioId)];
    if (estado !== undefined) filtros.push(where('estado', '==', estado));
    const snap = await getDocs(
      query(collection(db, COLECCION_GESTIONES_CARTERA), ...filtros)
    );
    return snap.docs.map((d) => gestionDesdeSnap(d.id, d.data()));
  },
};

export const puertoPropietariosGestionesFirestore: PuertoPropietariosGestiones = {
  async existePropietario(id) {
    if (!id) return false;
    return (await getDoc(doc(db, COLECCION_PROPIETARIOS, id))).exists();
  },
};

function usuarioGestionableDesdeSnap(
  id: string,
  data: Record<string, unknown>
): UsuarioGestionable {
  return {
    id,
    estado: data['estado'] as UsuarioGestionable['estado'],
    propietarioId: data['propietarioId'] as string | undefined,
    authUid: data['authUid'] as string | undefined,
  };
}

export const puertoUsuariosGestionesFirestore: PuertoUsuariosGestiones = {
  async obtenerUsuario(id) {
    if (!id) return null;
    const snap = await getDoc(doc(db, COLECCION_USUARIOS, id));
    return snap.exists() ? usuarioGestionableDesdeSnap(snap.id, snap.data()) : null;
  },
  async buscarUsuarioPorPropietario(propietarioId) {
    if (!propietarioId) return null;
    // Sesión master (único contexto de escritura del servicio): `list` de
    // `usuarios` permitido solo al master por reglas.
    const snap = await getDocs(
      query(
        collection(db, COLECCION_USUARIOS),
        where('propietarioId', '==', propietarioId),
        limit(1)
      )
    );
    const primero = snap.docs[0];
    return primero ? usuarioGestionableDesdeSnap(primero.id, primero.data()) : null;
  },
};

export const puertoEspejoCarterasFirestore: PuertoEspejoCarteras = {
  async leerProyeccion(uid) {
    const snap = await getDoc(doc(db, COLECCION_ESPEJOS_AUTH, uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      carterasL: Array.isArray(data['carterasL']) ? (data['carterasL'] as string[]) : [],
      carterasE: Array.isArray(data['carterasE']) ? (data['carterasE'] as string[]) : [],
    };
  },
  async escribirProyeccion(uid, proyeccion: ProyeccionEspejo) {
    // Merge de SOLO la proyección: jamás se tocan otros campos del espejo.
    await setDoc(
      doc(db, COLECCION_ESPEJOS_AUTH, uid),
      { carterasL: [...proyeccion.carterasL], carterasE: [...proyeccion.carterasE] },
      { merge: true }
    );
  },
};

export const puertoAuditoriaGestionesFirestore: PuertoAuditoriaGestiones = {
  async registrar(entrada: EntradaAuditoriaGestiones) {
    await registrarAuditoriaFirestore({
      usuarioId: entrada.usuarioId,
      usuarioEmail: entrada.usuarioEmail,
      usuarioNombre: entrada.usuarioNombre,
      accion: entrada.accion,
      descripcion: entrada.descripcion,
      fechaHora: entrada.fechaHora,
      entidadAfectada: entrada.entidadAfectada,
      idAfectado: entrada.idAfectado,
      resultado: entrada.resultado,
      detalles: entrada.detalles,
    });
  },
};

export const dependenciasGestionesCarteraFirestore: DependenciasGestionesCartera = {
  gestiones: puertoGestionesCarteraFirestore,
  propietarios: puertoPropietariosGestionesFirestore,
  usuarios: puertoUsuariosGestionesFirestore,
  espejo: puertoEspejoCarterasFirestore,
  auditoria: puertoAuditoriaGestionesFirestore,
};
