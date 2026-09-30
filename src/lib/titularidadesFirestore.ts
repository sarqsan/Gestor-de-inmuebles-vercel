/**
 * SERVICIOS FIRESTORE — TITULARIDADES (BLOQUE 2)
 * ==============================================
 *
 * Reglas duras que aquí se respetan:
 *
 *   · Las consultas van SIEMPRE acotadas: el aislamiento no depende de filtrar
 *     en cliente. Un propietario sólo pide SUS titularidades.
 *   · Las escrituras usan `OpcionesEscritura.propagError` para poder propagar el
 *     error al llamador y no confirmar una operación que Firestore rechazó
 *     (BLOQUE 1).
 *   · NO existe `borrarTitularidad`: el modelo prohíbe el borrado físico. Para
 *     revertir una migración se CIERRAN las relaciones (`planReversion`).
 */

import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  or,
  query,
  setDoc,
  where,
  type DocumentData,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import type { DataAccessScope } from './firebase';
import type { Titularidad } from '../types';

const db = getFirestore();
const TITULARIDADES_COL = collection(db, 'titularidades');

export type TitularidadesListener = (titularidades: Titularidad[]) => void;

function mapear(snapshot: { forEach: (cb: (d: { id: string; data: () => DocumentData }) => void) => void }) {
  const items: Titularidad[] = [];
  snapshot.forEach((docSnap) => {
    items.push({ id: docSnap.id, ...docSnap.data() } as Titularidad);
  });
  return items;
}

/**
 * Consulta acotada de titularidades para un ámbito.
 *
 * · PROPIETARIO: `or(where('propietarioId','==', pid), where('inmuebleId','in', ...))`
 *   no es demostrable con `in`, así que se usa la ÚNICA cláusula demostrable
 *   (`propietarioId`) y las titularidades de los inmuebles compartidos se
 *   resuelven con `subscribeTitularidadesDeInmueble`.
 * · Resto: colección completa (mismo criterio que en `inmuebles`).
 */
export function construirConsultaTitularidades(
  scope?: DataAccessScope
): Query<DocumentData, DocumentData> | null {
  if (!scope || scope.tipoPerfil !== 'PROPIETARIO' || !scope.propietarioId) {
    return null;
  }
  return query(
    TITULARIDADES_COL,
    or(
      where('propietarioId', '==', scope.propietarioId),
      where('titularesIds', 'array-contains', scope.propietarioId)
    )
  ) as Query<DocumentData, DocumentData>;
}

/**
 * Todas las titularidades del ámbito indicado.
 * ADMINISTRADOR → colección completa. PROPIETARIO → sólo las suyas.
 */
export function subscribeTitularidades(
  callback: TitularidadesListener,
  scope?: DataAccessScope
): Unsubscribe {
  const onError = (err: unknown) => {
    console.error('Firestore titularidades snapshot error:', err);
  };

  if (!scope || scope.tipoPerfil !== 'PROPIETARIO') {
    return onSnapshot(TITULARIDADES_COL, (snap) => callback(mapear(snap)), onError);
  }

  const q = construirConsultaTitularidades(scope);
  if (!q) {
    callback([]);
    return () => {};
  }
  return onSnapshot(q, (snap) => callback(mapear(snap)), onError);
}

/**
 * Titularidades de UN inmueble (consulta acotada y demostrable).
 * Es la que usa la ficha del inmueble para mostrar los N titulares y su
 * histórico patrimonial completo.
 */
export function subscribeTitularidadesDeInmueble(
  inmuebleId: string,
  callback: TitularidadesListener
): Unsubscribe {
  if (typeof inmuebleId !== 'string' || inmuebleId.length === 0) {
    callback([]);
    return () => {};
  }
  const q = query(TITULARIDADES_COL, where('inmuebleId', '==', inmuebleId));
  return onSnapshot(
    q,
    (snap) => callback(mapear(snap)),
    (err) => console.error('Firestore titularidades (inmueble) snapshot error:', err)
  );
}

/**
 * Guarda (crea o actualiza) una titularidad.
 *
 * El ID del documento es la clave determinista `inmuebleId__propietarioId`,
 * lo que hace la operación IDEMPOTENTE y evita duplicados.
 */
export async function saveTitularidadFirestore(
  titularidad: Titularidad,
  opciones?: { propagarError?: boolean }
): Promise<void> {
  const propagar = opciones?.propagarError === true;
  try {
    if (!titularidad.id || titularidad.id.indexOf('__') < 0) {
      throw new Error(
        `Clave de titularidad inválida: "${titularidad.id}". Debe ser inmuebleId__propietarioId.`
      );
    }
    await setDoc(doc(db, 'titularidades', titularidad.id), titularidad, { merge: false });
  } catch (err) {
    console.error('Error al guardar la titularidad en Firestore:', err);
    if (propagar) throw err;
  }
}

/** Guarda varias titularidades en orden secuencial (trazabilidad del historial). */
export async function saveTitularidadesFirestore(
  titularidades: Titularidad[],
  opciones?: { propagarError?: boolean }
): Promise<void> {
  for (const t of titularidades) {
    await saveTitularidadFirestore(t, opciones);
  }
}

/**
 * NO HAY FUNCIÓN DE BORRADO, de forma deliberada.
 *
 * El modelo prohíbe el borrado físico de titularidades (BLOQUE 2 · 2.2) y las
 * reglas de Firestore lo refuerzan con `allow delete: if false`. Para retirar a
 * un titular se CIERRA la relación con `cerrarTitularidad()` y se guarda.
 */
export const BORRADO_TITULARIDAD_NO_DISPONIBLE = true;
