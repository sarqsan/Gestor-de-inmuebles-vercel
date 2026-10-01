/**
 * BÚSQUEDA DE TITULARES (F3) — LÓGICA PURA
 * =========================================
 * Reglas de la funcionalidad (las mismas en cliente, servidor y tests):
 *
 *  · mínimo 3 caracteres (evita barridos de una sola letra);
 *  · máximo 10 resultados (acotado en servidor, no "mejor esfuerzo");
 *  · la respuesta es EXCLUSIVAMENTE `{ id, nombre }`: sin NIF, sin email, sin
 *    IBAN, sin datos fiscales. La proyección es una LISTA BLANCA, así que un
 *    campo nuevo y sensible en `propietarios` NO puede filtrarse por accidente;
 *  · sin enumeración global: la consulta es por PREFIJO y limitada;
 *  · sin segundo sistema de identidad: se buscan fichas de `propietarios` ya
 *    existentes. Crear una titularidad NO crea ninguna cuenta de acceso;
 *  · AISLAMIENTO POR ÁMBITO (PR #19): una ficha de titular creada por un
 *    PROPIETARIO en su ámbito (`ambitoPropietarioId`) solo se ofrece a ese
 *    propietario y a la administración. Ilimitado no es global: el nombre de un
 *    titular de otro ámbito no se revela. Ver `fichaDeAmbitoAjeno`.
 */

/** Mínimo de caracteres para buscar. */
export const MINIMO_CARACTERES = 3;
/** Tope duro de resultados devueltos al cliente. */
export const MAXIMO_RESULTADOS = 10;
/** Tope de lectura en la consulta al datastore (se filtra después). */
export const LIMITE_LECTURA = 25;
/** Sufijo de cotejo para las consultas por prefijo en Firestore. */
export const SUFIJO_PREFIJO = '￿';

/** Minúsculas, sin acentos, sin espacios sobrantes. */
export function normalizarTexto(valor: string): string {
  return (valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Termino ya normalizado y listo para comparar. */
export function normalizarTermino(termino: string): string {
  return normalizarTexto(termino);
}

/** ¿El término alcanza el mínimo para poder buscar? */
export function terminoValido(termino: string): boolean {
  return normalizarTermino(termino).length >= MINIMO_CARACTERES;
}

/** Coincidencia por prefijo de palabra, insensible a acentos y mayúsculas. */
export function coincide(nombre: string, termino: string): boolean {
  const n = normalizarTexto(nombre);
  const t = normalizarTermino(termino);
  if (!t) return false;
  return n.split(' ').some((palabra) => palabra.startsWith(t)) || n.startsWith(t);
}

export interface FichaBuscable {
  id: string;
  nombre: string;
}

/**
 * ¿La ficha pertenece al ámbito de OTRO propietario? (`ambitoPropietarioId` informado y distinto del
 * del llamador). Las fichas sin ámbito (cuenta propia, heredadas, del master) no están afectadas.
 * El servidor excluye estas fichas para todo perfil que no sea master/ADMINISTRADOR.
 */
export function fichaDeAmbitoAjeno(
  datos: Record<string, unknown> | null | undefined,
  propietarioIdLlamador: string | null | undefined,
): boolean {
  const ambito = typeof datos?.ambitoPropietarioId === 'string' ? datos.ambitoPropietarioId.trim() : '';
  if (!ambito) return false;
  return ambito !== (propietarioIdLlamador || '').trim();
}

/**
 * Selecciona y ordena coincidencias, aplicando el tope duro.
 * Devuelve COPIAS nuevas (no comparte referencias del documento origen).
 */
export function seleccionarCoincidencias<T extends FichaBuscable>(candidatos: readonly T[], termino: string): T[] {
  if (!terminoValido(termino)) return [];
  const vistos = new Set<string>();
  const salida: T[] = [];
  for (const c of candidatos || []) {
    if (!c?.id || vistos.has(c.id)) continue;
    if (!coincide(c.nombre || '', termino)) continue;
    vistos.add(c.id);
    salida.push(c);
    if (salida.length >= MAXIMO_RESULTADOS) break;
  }
  return salida.sort((a, b) => normalizarTexto(a.nombre).localeCompare(normalizarTexto(b.nombre)));
}

/**
 * LISTA BLANCA de proyección: sólo `id` y `nombre`.
 * Cualquier otro campo del documento queda fuera por construcción.
 */
export function proyectarCandidato<T extends FichaBuscable>(ficha: T): { id: string; nombre: string } {
  return { id: String(ficha.id), nombre: String(ficha.nombre ?? '') };
}

/** Proyección de una lista completa. */
export function proyectarResultados<T extends FichaBuscable>(fichas: readonly T[]): Array<{ id: string; nombre: string }> {
  return (fichas || []).map(proyectarCandidato);
}
