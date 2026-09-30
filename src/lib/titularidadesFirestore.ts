/**
 * ACCESO A TITULARIDADES (F2)
 * ===========================
 * Cómo se consulta la titularidad de un inmueble sin romper el aislamiento:
 *
 *  1. `inmuebles.titularesIds[]` es el ÍNDICE de propietarioIds con titularidad
 *     sobre ese inmueble (vigente o histórica).
 *  2. Cada titularidad vive en la clave DETERMINISTA
 *     `titularidades/{inmuebleId}__{propietarioId}`, así que se lee con un
 *     `get` individual (demostrable para las reglas de Firestore).
 *
 * Consecuencias buscadas:
 *  · NO se usa `or()` (no hace falta: el índice da los ids concretos).
 *  · NO se hace un `list` global de `titularidades`.
 *  · Si un TERCERO crea una titularidad sobre un inmueble del propietario, el
 *    propietario la ve igual: lee SU inmueble, lee el índice y hace los `get`
 *    deterministas. No necesita conocer de antemano el id del tercero.
 *
 * Escritura: ATÓMICA. La titularidad y el índice del inmueble se escriben en el
 * mismo `writeBatch` (o se queda todo como estaba).
 */
import { doc, getDoc, onSnapshot, setDoc, writeBatch, arrayUnion, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import { reportarErrorGuardado, reportarErrorLectura } from '../estadoDatos/canalIncidencias';
import type { Inmueble, Titularidad } from '../types';
import { cerrarTitularidadEnMemoria, construirTitularidad, idTitularidad } from '../utils/titularidadesEngine';
import type { AltaTitularidad, CierreTitularidad } from '../utils/titularidadesEngine';

export const COLECCION_TITULARIDADES = 'titularidades';

/** Claves deterministas de titularidad para estos inmuebles y propietarios. */
export function clavesDeInmuebles(
  inmuebles: readonly Inmueble[],
  propietarioIdsAdicionales: readonly string[] = [],
): Array<{ inmuebleId: string; propietarioId: string; clave: string }> {
  const salida = new Map<string, { inmuebleId: string; propietarioId: string; clave: string }>();
  for (const inm of inmuebles || []) {
    if (!inm?.id) continue;
    const ids = new Set<string>([
      ...(inm.titularesIds || []),
      ...(inm.propietarioId ? [inm.propietarioId] : []),
      ...(inm.propietarioPrincipalId ? [inm.propietarioPrincipalId] : []),
      ...propietarioIdsAdicionales,
    ]);
    for (const propietarioId of ids) {
      if (!propietarioId) continue;
      const clave = idTitularidad(inm.id, propietarioId);
      if (!salida.has(clave)) salida.set(clave, { inmuebleId: inm.id, propietarioId, clave });
    }
  }
  // Orden estable por clave: el mismo ámbito produce siempre la misma lista.
  return Array.from(salida.values()).sort((a, b) => a.clave.localeCompare(b.clave));
}

export interface AlcanceTitularidades {
  /** Inmuebles cuyo índice `titularidadesIds` se va a resolver. */
  inmuebles: readonly Inmueble[];
  /** Propietario actual (su propia titularidad aunque el índice esté vacío). */
  propietarioId?: string;
  /** Otros propietarioIds a resolver (p. ej. cotitulares conocidos). */
  propietarioIds?: readonly string[];
}

/**
 * Suscripción en tiempo real a las titularidades del ámbito.
 * Un listener por CLAVE DETERMINISTA (`get` individual): ni `list` ni `or()`.
 */
export function subscribeTitularidadesEscopo(
  alcance: AlcanceTitularidades,
  callback: (titularidades: Titularidad[]) => void,
): Unsubscribe {
  const claves = clavesDeInmuebles(alcance.inmuebles || [], [
    ...(alcance.propietarioId ? [alcance.propietarioId] : []),
    ...(alcance.propietarioIds || []),
  ]);
  if (claves.length === 0) {
    callback([]);
    return () => {};
  }

  const porClave = new Map<string, Titularidad>();
  let vivo = true;
  const notificar = () => {
    if (!vivo) return;
    callback(Array.from(porClave.values()).sort((a, b) => a.id.localeCompare(b.id)));
  };

  const canceladores: Unsubscribe[] = claves.map(({ clave }) =>
    onSnapshot(
      doc(db, COLECCION_TITULARIDADES, clave),
      (snap) => {
        if (snap.exists()) {
          // El id del documento SIEMPRE manda: es la clave determinista.
          porClave.set(clave, { ...(snap.data() as Omit<Titularidad, 'id'>), id: snap.id || clave } as Titularidad);
        } else {
          porClave.delete(clave);
        }
        notificar();
      },
      (err) => {
        // Un `permission-denied` sobre una clave ajena no contamina el resto:
        // se informa por el canal de incidencias y se retira esa clave.
        reportarErrorLectura('titularidades', err, `Firestore titularidad (${clave}) snapshot error:`);
        porClave.delete(clave);
        notificar();
      },
    ),
  );

  return () => {
    vivo = false;
    canceladores.forEach((c) => c());
  };
}

function limpiarParaFirestore(t: Titularidad): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(t)) {
    if (v === undefined) continue;
    salida[k] = v;
  }
  return salida;
}

/**
 * Alta de titularidad: escribe la titularidad Y el índice `titularesIds` del
 * inmueble en el MISMO lote atómico. Crear una titularidad NO crea ninguna
 * cuenta de acceso (son conceptos distintos y se mantienen separados).
 */
export async function guardarTitularidad(alta: AltaTitularidad): Promise<boolean> {
  try {
    const titularidad = construirTitularidad(alta);
    const lote = writeBatch(db);
    lote.set(doc(db, COLECCION_TITULARIDADES, titularidad.id), limpiarParaFirestore(titularidad), { merge: true });
    lote.set(
      doc(db, 'inmuebles', alta.inmuebleId),
      { titularesIds: arrayUnion(alta.propietarioId) },
      { merge: true },
    );
    await lote.commit();
    return true;
  } catch (err) {
    reportarErrorGuardado('titularidades', err, 'Error guardando titularidad:');
    return false;
  }
}

/**
 * Cierre de titularidad: NUNCA borra. Pasa a `CERRADA` con fecha, motivo y
 * quién lo registró; el documento sigue existiendo como histórico consultable.
 * `retirarDelIndice` (por defecto `false`) mantiene el id en `titularesIds`
 * para que el histórico siga siendo localizable por el índice del inmueble.
 */
export async function cerrarTitularidad(
  cierre: CierreTitularidad,
  opciones: { retirarDelIndice?: boolean } = {},
): Promise<boolean> {
  try {
    const cerrada = cerrarTitularidadEnMemoria(cierre);
    await setDoc(doc(db, COLECCION_TITULARIDADES, cerrada.id), limpiarParaFirestore(cerrada), { merge: true });
    if (opciones.retirarDelIndice) {
      const refInmueble = doc(db, 'inmuebles', cerrada.inmuebleId);
      const snap = await getDoc(refInmueble);
      const actuales: string[] = (snap.exists() && (snap.data() as Inmueble).titularesIds) || [];
      await setDoc(
        refInmueble,
        { titularesIds: actuales.filter((id) => id !== cerrada.propietarioId) },
        { merge: true },
      );
    }
    return true;
  } catch (err) {
    reportarErrorGuardado('titularidades', err, 'Error cerrando titularidad:');
    return false;
  }
}
