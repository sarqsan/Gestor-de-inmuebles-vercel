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
 * REGLA DE LECTURA (diagnóstico «Lectura · titularidades: No tienes permisos»):
 *  · SÓLO se leen claves que el ÍNDICE declara. NUNCA se sondean claves
 *    hipotéticas (`propietarioId`, `propietarioPrincipalId`, usuario actual…):
 *    si el inmueble no tiene titularidades (anterior a N-TITULARES, o recién
 *    creado) ese documento NO EXISTE y las reglas evalúan `resource.data` sobre
 *    un `null`, es decir, DENIEGAN el `get` ⇒ aviso visible sin que haya ningún
 *    dato prohibido. Se elimina la lectura innecesaria; no se amplía ningún
 *    permiso ni se silencia el error.
 *
 * Escritura: ATÓMICA. La titularidad y el índice del inmueble se escriben en el
 * mismo `writeBatch` (o se queda todo como estaba).
 */
import { doc, getDoc, onSnapshot, setDoc, writeBatch, arrayUnion, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import { reportarErrorGuardado, reportarErrorLectura } from '../estadoDatos/canalIncidencias';
import type { Inmueble, Titularidad } from '../types';
import {
  cerrarTitularidadEnMemoria,
  clavesTitularidadesIndexadas,
  construirTitularidad,
  redondear2,
} from '../utils/titularidadesEngine';
import type { AltaTitularidad, CierreTitularidad, ClaveTitularidad } from '../utils/titularidadesEngine';

export const COLECCION_TITULARIDADES = 'titularidades';

/**
 * Claves deterministas de las titularidades INDEXADAS (`titularesIds`) de estos
 * inmuebles. No genera claves hipotéticas: ver la cabecera del módulo.
 */
export function clavesDeInmuebles(
  inmuebles: readonly Pick<Inmueble, 'id' | 'titularesIds'>[],
): ClaveTitularidad[] {
  return clavesTitularidadesIndexadas(inmuebles);
}

export interface AlcanceTitularidades {
  /**
   * Inmuebles cuyo índice `titularesIds` se va a resolver. El llamador debe
   * pasar sólo aquellos cuyas titularidades sirven las Rules al usuario
   * (`puedeLeerTitularidadesDe`): titular canónico o cotitular indexado.
   *
   * Sólo se necesita la identidad y el índice (no la ficha completa), así que
   * vale cualquier proyección del inmueble.
   */
  inmuebles: readonly Pick<Inmueble, 'id' | 'titularesIds'>[];
}

/**
 * Suscripción en tiempo real a las titularidades del ámbito.
 * Un listener por CLAVE DETERMINISTA (`get` individual): ni `list` ni `or()`.
 */
export function subscribeTitularidadesEscopo(
  alcance: AlcanceTitularidades,
  callback: (titularidades: Titularidad[]) => void,
): Unsubscribe {
  const claves = clavesDeInmuebles(alcance.inmuebles || []);
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
        // Una clave INDEXADA que falla es un fallo real (índice sin documento o
        // documento ilegible): se informa por el canal de incidencias —no se
        // silencia— y se retira esa clave sin contaminar el resto.
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
 * Actualiza el PORCENTAJE declarado de una titularidad (o lo deja PENDIENTE con
 * `null`). NUNCA inventa un reparto: `null` significa «no consta».
 *
 * Sólo se escriben `porcentajeTitularidad` y `updatedAt`: los campos que las
 * Rules declaran INMUTABLES (`inmuebleId`, `propietarioId`, `id`, `fechaInicio`)
 * se conservan tal cual, y el estado/cierre no se tocan desde aquí.
 */
export async function actualizarPorcentajeTitularidad(
  titularidad: Titularidad,
  porcentaje: number | null,
): Promise<boolean> {
  try {
    const limpio = porcentaje === null ? null : redondear2(porcentaje);
    await setDoc(
      doc(db, COLECCION_TITULARIDADES, titularidad.id),
      { porcentajeTitularidad: limpio, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return true;
  } catch (err) {
    reportarErrorGuardado('titularidades', err, 'Error actualizando el porcentaje de titularidad:');
    return false;
  }
}

/**
 * Marca el TITULAR FISCAL PRINCIPAL del inmueble (`propietarioPrincipalId`).
 *
 * NO toca `propietarioId`: ese es el identificador CANÓNICO del ámbito y su
 * cambio es una transmisión (flujo del master). Las Rules revalidan el update
 * del inmueble; aquí no se amplía ningún permiso.
 */
export async function marcarTitularPrincipal(
  inmuebleId: string,
  propietarioId: string,
): Promise<boolean> {
  try {
    await setDoc(
      doc(db, 'inmuebles', inmuebleId),
      { propietarioPrincipalId: propietarioId },
      { merge: true },
    );
    return true;
  } catch (err) {
    reportarErrorGuardado('titularidades', err, 'Error marcando el titular principal del inmueble:');
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
