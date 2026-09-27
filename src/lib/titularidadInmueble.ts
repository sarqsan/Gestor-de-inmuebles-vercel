/**
 * D2 (ORDEN 3 §2/§6) — Titularidad jurídica del inmueble.
 *
 * El inmueble porta tres identificadores de titularidad con semántica
 * distinta, y SOLO el primero autoriza económicamente:
 * - `propietarioId`: identificador CANÓNICO del ámbito (el que comparan las
 *   Rules con `myPropId()`). Inmutable salvo master (firestore.rules E1).
 * - `propietarioPrincipalId`: titular fiscal principal. El titular puede
 *   editarlo mientras siga siendo titular; NUNCA autoriza por sí solo.
 * - `propietarioSecundarioId`: cotitular fiscal/conviviente. Informativo y
 *   fiscal: NUNCA autoriza acceso (ni lectura ni escritura).
 *
 * Este módulo es puro (sin Firebase) para que la semántica sea unit-testeable:
 * - `detectarCambioTitularidad`: diff de titularidad para la auditoría de
 *   cambios sensibles (App la registra SOLO si la escritura tuvo éxito).
 * - `validarCoherenciaTitularidad`: coherencia estructural del secundario
 *   (el editor la exige antes de guardar; NO vive en Rules porque, sin una
 *   auditoría histórica de datos reales, una prohibición en Rules bloquearía
 *   cualquier edición de fichas legacy incoherentes).
 * - `esTitularDelInmueble` / `esSecundarioDelInmueble`: predicados de lectura
 *   para la UI (la autorización real la imponen las Rules).
 */
import type { Inmueble } from '../types';

export type CampoTitularidad = 'propietarioId' | 'propietarioPrincipalId' | 'propietarioSecundarioId';

export interface CambioTitularidad {
  /** true si cambió al menos uno de los tres identificadores. */
  cambio: boolean;
  campos: CampoTitularidad[];
  antes: Record<CampoTitularidad, string>;
  despues: Record<CampoTitularidad, string>;
}

const CAMPOS: CampoTitularidad[] = ['propietarioId', 'propietarioPrincipalId', 'propietarioSecundarioId'];

function norm(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Compara la titularidad (3 campos) entre la ficha previa y la nueva.
 * Comillas/undefined/'' se normalizan a '' para no auditar ruido.
 */
export function detectarCambioTitularidad(prev: Inmueble, next: Inmueble): CambioTitularidad {
  const antes = {} as Record<CampoTitularidad, string>;
  const despues = {} as Record<CampoTitularidad, string>;
  const campos: CampoTitularidad[] = [];
  for (const c of CAMPOS) {
    antes[c] = norm(prev[c]);
    despues[c] = norm(next[c]);
    if (antes[c] !== despues[c]) campos.push(c);
  }
  return { cambio: campos.length > 0, campos, antes, despues };
}

/**
 * Coherencia estructural del propietario secundario (§6):
 * - El secundario, si se informa, debe ser distinto del principal y del
 *   económico canónico (un duplicado es incoherente: la misma persona no
 *   puede ser a la vez principal y secundaria de la misma ficha).
 * Devuelve la lista de errores (vacía = válido). Puro y testeable; el editor
 * de inmuebles la aplica al crear/editar.
 */
export function validarCoherenciaTitularidad(args: {
  propietarioId?: string;
  propietarioPrincipalId?: string;
  propietarioSecundarioId?: string;
}): string[] {
  const errores: string[] = [];
  const economico = norm(args.propietarioId);
  const principal = norm(args.propietarioPrincipalId);
  const secundario = norm(args.propietarioSecundarioId);
  if (!secundario) return errores;
  if (principal && secundario === principal) {
    errores.push('El propietario secundario debe ser distinto del propietario principal.');
  }
  if (economico && secundario === economico) {
    errores.push('El propietario secundario debe ser distinto del titular económico del inmueble.');
  }
  return errores;
}

/**
 * Predicado de LECTURA para la UI: ¿es `propietarioId` titular (económico o
 * principal) de la ficha? El secundario NO es titular.
 */
export function esTitularDelInmueble(inmueble: Inmueble, propietarioId: string | undefined): boolean {
  const pid = norm(propietarioId);
  if (!pid) return false;
  return norm(inmueble.propietarioId) === pid || norm(inmueble.propietarioPrincipalId) === pid;
}

/**
 * Predicado de LECTURA para la UI: ¿es `propietarioId` el secundario de la
 * ficha? (Informativo: el secundario no autoriza nada.)
 */
export function esSecundarioDelInmueble(inmueble: Inmueble, propietarioId: string | undefined): boolean {
  const pid = norm(propietarioId);
  if (!pid) return false;
  return norm(inmueble.propietarioSecundarioId) === pid;
}
