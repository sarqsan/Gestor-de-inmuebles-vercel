/**
 * H7 — FRONTERA DE LA EDICIÓN ORDINARIA DEL INMUEBLE
 * ===================================================
 * La pantalla de edición carga una INSTANTÁNEA del inmueble (`inmuebleToEdit`)
 * y puede permanecer abierta minutos. Mientras tanto, el estado patrimonial
 * puede cambiar desde otros flujos (alta de cotitular, cierre H9, transmisión
 * K.2) o desde otra sesión. Si al guardar se persistiera el objeto completo,
 * esa fotografía antigua reescribiría `titularesIds[]` y podría:
 *   · reintroducir a un titular cuya titularidad ya fue CERRADA (deshaciendo H9);
 *   · eliminar a un cotitular añadido después de abrir el formulario;
 *   · revertir una transmisión K.2 recién registrada.
 *
 * CONTRATO: `titularesIds[]` es el índice de titularidad y NO pertenece a la
 * edición ordinaria. Sus dueños son, y siguen siendo, los flujos patrimoniales
 * específicos, cada uno con su propia atomicidad:
 *   · alta de titularidad  → `guardarTitularidad()`      (writeBatch + arrayUnion)
 *   · cierre de titularidad→ `cerrarTitularidad()`       (runTransaction, H9)
 *   · transmisión A→B      → `transmitirInmuebleFirestore()` (runTransaction, K.2)
 *   · alta de inmueble     → `asignarTitularesAlta()`    (tras persistir la ficha)
 *
 * La exclusión es ESTRUCTURAL: el campo se retira del objeto por
 * desestructuración, de modo que no puede llegar al `setDoc`. Como la escritura
 * ordinaria usa `merge: true`, omitirlo deja intacto el valor almacenado: el
 * guardado ordinario no «conserva su copia», simplemente no opina sobre él.
 */
import type { Inmueble } from '../types';

/**
 * Campos patrimoniales cuyo propietario NO es la edición ordinaria. Se declara
 * como lista para que el contrato sea legible y verificable desde los tests.
 */
export const CAMPOS_FUERA_DE_EDICION_ORDINARIA = ['titularesIds'] as const;

/** Un inmueble sin los campos que la edición ordinaria no puede escribir. */
export type InmuebleOrdinario = Omit<Inmueble, (typeof CAMPOS_FUERA_DE_EDICION_ORDINARIA)[number]>;

/**
 * Proyecta el payload que SÍ puede persistir una edición ordinaria.
 * Todo lo demás se conserva tal cual: esto no es una reducción de campos, es
 * la retirada del índice patrimonial.
 */
export function payloadOrdinarioInmueble(inmueble: Inmueble): InmuebleOrdinario {
  const { titularesIds: _indicePatrimonial, ...ordinario } = inmueble;
  return ordinario;
}

/**
 * Proyección para el ESTADO LOCAL tras una edición ordinaria: toma los datos
 * editados pero conserva el índice de titularidad VIGENTE que ya conocía la
 * aplicación (el que mantienen al día las escuchas de Firestore). Evita que la
 * interfaz muestre momentáneamente un titular resucitado por la instantánea.
 */
export function fusionarEdicionOrdinaria(vigente: Inmueble, editado: Inmueble): Inmueble {
  const ordinario = payloadOrdinarioInmueble(editado) as Inmueble;
  return vigente.titularesIds === undefined
    ? ordinario
    : { ...ordinario, titularesIds: vigente.titularesIds };
}
