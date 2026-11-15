/**
 * P1 · Canal de comunicación propietario ↔ profesional, POR ORDEN DE TRABAJO.
 *
 * POR QUÉ ESTE MÓDULO ES NUEVO Y NO SE REUTILIZA `suministrosFirestore`:
 *   `mensajes_portal` exige `contratoId` y su ámbito se deriva del contrato
 *   (propietario ↔ inquilino). Una orden de trabajo no tiene contrato y el
 *   profesional no es parte de ninguno. Meter el hilo del profesional en esa
 *   colección habría obligado a relajar su ámbito y habría puesto en riesgo el
 *   aislamiento del hilo del inquilino. Ver bloque 2H-bis de `firestore.rules`.
 *
 * AISLAMIENTO:
 *   - La consulta se acota SIEMPRE por un único `trabajoId` que el llamante ya
 *     tiene en su ámbito, igual que `subscribeMensajesByContrato` hace con el
 *     contrato. Firestore no usa las reglas como filtro: sin la igualdad
 *     demostrable la consulta se deniega.
 *   - Quién puede leer NO lo decide este módulo: lo deciden las reglas, que
 *     derivan los participantes del TRABAJO (no del mensaje).
 */
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from './firebase';
import type {
  MensajeTrabajo,
  RolRemitenteMensajeTrabajo,
} from '../features/profesional/tiposMensajeTrabajo';

export const MENSAJES_TRABAJO_COL = collection(db, 'mensajes_trabajo');

/** Error de lectura reportado, no silenciado (UX-2 C2: un fallo no es un vacío). */
function reportarErrorMensajesTrabajo(contexto: string, err: unknown): void {
  console.error(`[P1][mensajes_trabajo] ${contexto}`, err);
}

/**
 * Suscribe el hilo de UNA orden de trabajo.
 *
 * `trabajoId` es obligatorio y no vacío: no existe un "todos los mensajes".
 * Un profesional no puede pedir el hilo de un trabajo que no es suyo; si lo
 * intenta, las reglas deniegan y se propaga el error en vez de devolver `[]`
 * (un vacío falso ocultaría un problema de permisos).
 */
export function subscribeMensajesTrabajo(
  trabajoId: string,
  cb: (items: MensajeTrabajo[]) => void,
): Unsubscribe {
  if (!trabajoId) {
    throw new Error('subscribeMensajesTrabajo requiere un trabajoId: no hay hilo global.');
  }
  const q = query(MENSAJES_TRABAJO_COL, where('trabajoId', '==', trabajoId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MensajeTrabajo);
      items.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      cb(items);
    },
    (err) => reportarErrorMensajesTrabajo('snapshot', err),
  );
}

export interface DatosNuevoMensajeTrabajo {
  trabajoId: string;
  propietarioId: string;
  profesionalId: string;
  remitenteUid: string;
  remitenteNombre: string;
  remitenteRol: RolRemitenteMensajeTrabajo;
  texto: string;
}

/**
 * Publica un mensaje en el hilo de un trabajo.
 *
 * `propietarioId` y `profesionalId` NO los elige quien llama a ciegas: se
 * copian del trabajo, que es la fuente de verdad que las reglas vuelven a
 * comprobar. Si no coinciden con el trabajo, la escritura se deniega.
 *
 * El texto se recorta y se exige no vacío: un mensaje en blanco no es un
 * mensaje. El límite duro de 4000 caracteres lo impone también la regla.
 */
export async function enviarMensajeTrabajo(datos: DatosNuevoMensajeTrabajo): Promise<string> {
  const texto = (datos.texto || '').trim();
  if (!texto) throw new Error('El mensaje no puede estar vacío.');
  if (texto.length > 4000) throw new Error('El mensaje supera los 4000 caracteres.');
  if (!datos.trabajoId) throw new Error('El mensaje debe pertenecer a una orden de trabajo.');

  const id = doc(MENSAJES_TRABAJO_COL).id;
  const mensaje: Omit<MensajeTrabajo, 'id'> = {
    trabajoId: datos.trabajoId,
    propietarioId: datos.propietarioId,
    profesionalId: datos.profesionalId,
    remitenteUid: datos.remitenteUid,
    remitenteNombre: datos.remitenteNombre,
    remitenteRol: datos.remitenteRol,
    texto,
    leidoPorPropietario: datos.remitenteRol === 'PROPIETARIO',
    leidoPorProfesional: datos.remitenteRol === 'PROFESIONAL',
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'mensajes_trabajo', id), mensaje);
  return id;
}

/**
 * Marca como leído el mensaje para el rol indicado.
 *
 * Solo se toca el campo de acuse del destinatario: el texto de un mensaje
 * enviado no se reescribe (la regla lo impide con `affectedKeys().hasOnly`).
 */
export async function marcarMensajeTrabajoLeido(
  mensajeId: string,
  rol: RolRemitenteMensajeTrabajo,
): Promise<void> {
  if (!mensajeId) return;
  const campo = rol === 'PROPIETARIO' ? 'leidoPorPropietario' : 'leidoPorProfesional';
  try {
    await updateDoc(doc(db, 'mensajes_trabajo', mensajeId), { [campo]: true });
  } catch (err) {
    reportarErrorMensajesTrabajo('acuse de lectura', err);
  }
}
