/**
 * INC-06 — Adaptador Firestore de los puertos de `patrimonialPersistencia`.
 * ---------------------------------------------------------------------------
 * ÚNICO fichero del bloque que importa Firebase. El núcleo
 * (`patrimonialPersistencia.ts`) permanece puro y testeable con dobles
 * locales; este adaptador es la capa delgada donde:
 *  · los timestamps reales se introducen en el borde (el núcleo los recibe);
 *  · la creación estricta usa transacción (get → set) para que "escribir"
 *    falle de verdad si el documento ya existe: nunca sobrescritura silenciosa;
 *  · la auditoría se integra con el mecanismo EXISTENTE `audit_logs`
 *    (registrarAuditoriaFirestore; append-only por reglas: update/delete = false).
 *
 * No hay aquí lógica de negocio: solo traducción de puertos.
 */
import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { db, registrarAuditoriaFirestore } from './firebase';
import type {
  DependenciasPatrimoniales,
  EntradaAuditoriaPatrimonial,
  PuertoAuditoria,
  PuertoDocumentos,
} from './patrimonialPersistencia';

export const puertosDocumentosFirestore: PuertoDocumentos = {
  async obtenerDocumento(coleccion, id) {
    const snap = await getDoc(doc(db, coleccion, id));
    return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
  },
  async escribirDocumento(coleccion, id, datos) {
    // Creación estricta: transacción get→set; si el documento ya existe,
    // LANZA (el núcleo lo registra como incidencia/colisión, nunca sobrescribe).
    await runTransaction(db, async (tx) => {
      const ref = doc(db, coleccion, id);
      const snap = await tx.get(ref);
      if (snap.exists()) {
        throw new Error(`El documento ${coleccion}/${id} ya existe; no se sobrescribe en silencio.`);
      }
      tx.set(ref, datos);
    });
  },
  async fusionarDocumento(coleccion, id, datos) {
    await setDoc(doc(db, coleccion, id), datos, { merge: true });
  },
};

export const puertoAuditoriaFirestore: PuertoAuditoria = {
  async registrar(entrada: EntradaAuditoriaPatrimonial) {
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

export const dependenciasPatrimonialesFirestore: DependenciasPatrimoniales = {
  documentos: puertosDocumentosFirestore,
  auditoria: puertoAuditoriaFirestore,
};
