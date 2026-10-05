/**
 * D2 (ORDEN 3 §2/§6) — Titularidad jurídica del inmueble.
 *
 * El inmueble porta tres identificadores de titularidad con semántica distinta
 * y SIN equivalencia entre sí (`firestore.rules`: «conviven TRES campos sin
 * equivalencia entre sí»). Ninguno es intercambiable con otro:
 * - `propietarioId`: identificador CANÓNICO del ámbito (el que comparan las
 *   Rules con `myPropId()`) y frontera de cartera. Inmutable salvo master
 *   (firestore.rules E1). Cambiarlo ES UNA TRANSMISIÓN PATRIMONIAL.
 * - `propietarioPrincipalId`: titular FISCAL principal declarado. Puede divergir
 *   legítimamente del canónico (`marcarTitularPrincipal` existe para declararlo)
 *   y el titular puede editarlo mientras siga siendo titular. Cambiarlo NO
 *   transmite el inmueble. ATENCIÓN: sí es una de las vías que las Rules
 *   consideran para autorizar sobre `/inmuebles` —`inmuebleEsMio()`,
 *   `soyTitularActual()`, `sigoSiendoTitular()` y la rama `create`—, de modo que
 *   no es un campo meramente informativo. Lo que NO concede es acceso a
 *   `/titularidades`, que sólo atiende al canónico y al índice `titularesIds`
 *   (ver `puedeLeerTitularidadesDe`, cuyo contrato es exacto).
 * - `propietarioSecundarioId`: cotitular fiscal/conviviente. Informativo y
 *   fiscal: NUNCA autoriza acceso (ni lectura ni escritura).
 * - `titularesIds[]` + `titularidades/{inmuebleId}__{propietarioId}` (fuera de
 *   este módulo): modelo MODERNO de la relación patrimonial N-TITULARES y su
 *   porcentaje. El índice `titularesIds` SÍ autoriza sobre ambas colecciones.
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
 * - `puedeLeerTitularidadesDe`: ¿sirven las Rules las titularidades (N-TITULARES)
 *   de un inmueble a este propietario? Acota qué consulta la UI (nunca autoriza).
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

/**
 * ¿Sirven las Rules las TITULARIDADES de este inmueble a este propietario?
 *
 * Espejo (sólo para decidir qué consultar; la autorización real la imponen las
 * Rules) de `puedoLeerTitularidadDe` en `firestore.rules` para un PROPIETARIO sin
 * cartera gestionada:
 *  · titular canónico (`propietarioId`): lee las titularidades de su inmueble;
 *  · cotitular indexado (`titularesIds`): también las lee.
 *
 * NO las concede (y por tanto NO deben consultarse): la autorización explícita
 * por `inmuebleIds` (sólo permite ver la vivienda), ni `propietarioPrincipalId`
 * sin figurar en el canónico ni en el índice. Consultarlas sólo produciría
 * denegaciones evitables («Lectura · titularidades»).
 */
export function puedeLeerTitularidadesDe(inmueble: Inmueble, propietarioId: string | undefined): boolean {
  const pid = norm(propietarioId);
  if (!pid) return false;
  if (norm(inmueble.propietarioId) === pid) return true;
  return Array.isArray(inmueble.titularesIds) && inmueble.titularesIds.some((id) => norm(id) === pid);
}
