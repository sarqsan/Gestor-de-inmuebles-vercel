import { deleteField, doc, updateDoc, type Firestore } from 'firebase/firestore';
import type { Inmueble } from '../types';

/**
 * Borrado físico del segundo titular. Solo lo pide el guardado de edición
 * cuando la casilla se desmarca y el documento ya tenía ese titular.
 * No pasa por sanitizeInmuebleForFirestore ni por el setDoc con merge:
 * esas vías omiten `undefined` y Firestore conservaría el valor antiguo.
 *
 * La ruta con punto borra el campo anidado. No sustituye el mapa
 * `datosFiscales`.
 */
export interface PayloadEliminacionTitularSecundario {
  propietarioSecundarioId: ReturnType<typeof deleteField>;
  'datosFiscales.segundoPropietario': ReturnType<typeof deleteField>;
  'datosFiscales.tieneSegundoPropietario': false;
}

export function teniaTitularSecundario(inmueble: Pick<Inmueble, 'propietarioSecundarioId' | 'datosFiscales'>): boolean {
  return Boolean(inmueble.propietarioSecundarioId || inmueble.datosFiscales?.segundoPropietario);
}

/** Edición existente + segundo titular previo + casilla ahora desactivada. */
export function debeEliminarTitularSecundario(
  inmueblePrevio: Pick<Inmueble, 'propietarioSecundarioId' | 'datosFiscales'>,
  casillaSegundoActiva: boolean,
): boolean {
  return !casillaSegundoActiva && teniaTitularSecundario(inmueblePrevio);
}

export function payloadEliminacionTitularSecundario(): PayloadEliminacionTitularSecundario {
  return {
    propietarioSecundarioId: deleteField(),
    'datosFiscales.segundoPropietario': deleteField(),
    'datosFiscales.tieneSegundoPropietario': false,
  };
}

/** Solo las dos eliminaciones y la bandera en false. Ignora cualquier otra clave. */
export function camposEliminacionTitularSecundario(
  campos: PayloadEliminacionTitularSecundario = payloadEliminacionTitularSecundario(),
): PayloadEliminacionTitularSecundario {
  return {
    propietarioSecundarioId: campos.propietarioSecundarioId,
    'datosFiscales.segundoPropietario': campos['datosFiscales.segundoPropietario'],
    'datosFiscales.tieneSegundoPropietario': false,
  };
}

export async function escribirEliminacionTitularSecundario(
  database: Firestore,
  inmuebleId: string,
  campos: PayloadEliminacionTitularSecundario = payloadEliminacionTitularSecundario(),
): Promise<void> {
  const seguro = camposEliminacionTitularSecundario(campos);
  // Objeto literal: el SDK borra por ruta de campo y no sustituye datosFiscales.
  await updateDoc(doc(database, 'inmuebles', inmuebleId), {
    propietarioSecundarioId: seguro.propietarioSecundarioId,
    'datosFiscales.segundoPropietario': seguro['datosFiscales.segundoPropietario'],
    'datosFiscales.tieneSegundoPropietario': seguro['datosFiscales.tieneSegundoPropietario'],
  });
}
