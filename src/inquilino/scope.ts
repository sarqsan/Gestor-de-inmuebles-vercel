/**
 * BLOQUE E — Alcance del Portal del Inquilino (motor puro, sin Firebase).
 *
 * Modelo de aislamiento: inquilino → contrato(s) vinculado(s) → inmueble(s).
 * Estas funciones alimentan la UI y los tests; la aplicación real es
 * deny-by-default en las reglas de Firestore/Storage (sección E).
 */

/** Perfil mínimo necesario para resolver el alcance. */
export interface PerfilConAlcance {
  tipoPerfil: string;
  contratoIds?: string[];
}

/** Contrato mínimo necesario para resolver el alcance. */
export interface ContratoConInmueble {
  id: string;
  inmuebleId: string;
}

export function esPerfilInquilino(perfil: PerfilConAlcance | null | undefined): boolean {
  return !!perfil && perfil.tipoPerfil === 'INQUILINO';
}

function idsContratoDelPerfil(perfil: PerfilConAlcance | null | undefined): string[] {
  if (!esPerfilInquilino(perfil) || !perfil || !Array.isArray(perfil.contratoIds)) return [];
  return perfil.contratoIds.filter((id) => typeof id === 'string' && id.length > 0);
}

/**
 * Contratos del inquilino: intersección de sus contratoIds con los cargados.
 * Cualquier otro perfil (o sin vínculos) obtiene una lista vacía.
 */
export function contratosDelInquilino<T extends ContratoConInmueble>(
  perfil: PerfilConAlcance | null | undefined,
  todos: T[]
): T[] {
  const ids = new Set(idsContratoDelPerfil(perfil));
  if (ids.size === 0) return [];
  return todos.filter((c) => ids.has(c.id));
}

/** ¿Puede el inquilino acceder a este contrato? (pertenencia estricta). */
export function puedeAccederContrato(
  perfil: PerfilConAlcance | null | undefined,
  contratoId: string
): boolean {
  if (!esPerfilInquilino(perfil)) return false;
  return idsContratoDelPerfil(perfil).includes(contratoId);
}

/**
 * ¿Puede el inquilino acceder a este inmueble?
 * Solo a través de un contrato vinculado que apunte al inmueble.
 */
export function puedeAccederInmueble<T extends ContratoConInmueble>(
  perfil: PerfilConAlcance | null | undefined,
  inmuebleId: string,
  todosLosContratos: T[]
): boolean {
  if (!esPerfilInquilino(perfil) || !inmuebleId) return false;
  const ids = new Set(idsContratoDelPerfil(perfil));
  if (ids.size === 0) return false;
  return todosLosContratos.some((c) => ids.has(c.id) && c.inmuebleId === inmuebleId);
}

export interface AlcanceInquilino<T extends ContratoConInmueble> {
  contratos: T[];
  inmuebleIds: string[];
}

/** Resuelve el alcance visible del inquilino (contratos + inmuebles derivados). */
export function resolverAlcance<T extends ContratoConInmueble>(
  perfil: PerfilConAlcance | null | undefined,
  todosLosContratos: T[]
): AlcanceInquilino<T> {
  const contratos = contratosDelInquilino(perfil, todosLosContratos);
  const inmuebleIds = Array.from(
    new Set(contratos.map((c) => c.inmuebleId).filter((id) => typeof id === 'string' && id.length > 0))
  );
  return { contratos, inmuebleIds };
}
