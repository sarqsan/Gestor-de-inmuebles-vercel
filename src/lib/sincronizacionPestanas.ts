/**
 * B — Sincronización local entre pestañas (delta selectivo de Arena C).
 * ---------------------------------------------------------------------------
 * Fuente C: `App.tsx / handleStorageChange` (commit a6ac280). Se recupera la
 * coherencia local entre pestañas para candidatos, invitaciones y slots,
 * mediante merge por id sobre los eventos `storage`.
 *
 * Lo que NO se porta de C (deliberado):
 *  · La arquitectura antigua de caché de C. En particular, la clave
 *    `rentselect_inmuebles` se IGNORA siempre: este módulo no restaura
 *    inmuebles, no escribe en Firestore (no importa el SDK) y no toca
 *    `src/lib/snapshotInmueblesCache.ts`, que sigue siendo la única vía
 *    Firestore → estado/caché de lectura para inmuebles.
 *  · Semántica de borrado destructivo: los elementos locales ausentes en el
 *    payload NO se eliminan. Con suscripciones acotadas por ámbito (FASE 1.4),
 *    ausente ≠ eliminado: la autoridad de borrado es la suscripción Firestore
 *    de cada pestaña, no el `localStorage` de otra. Un array vacío o una
 *    clave eliminada (`newValue: null`) son no-op conservadores.
 *  · Payloads inválidos (JSON roto, no-array) o elementos sin id válido se
 *    ignoran sin lanzar.
 */
export const CLAVE_STORAGE_CANDIDATOS = 'rentselect_candidatos';
export const CLAVE_STORAGE_INVITACIONES = 'rentselect_invitaciones';
export const CLAVE_STORAGE_SLOTS = 'rentselect_slots';

export type ColeccionSincronizada = 'candidatos' | 'invitaciones' | 'slots';

/** Traduce la clave del evento a colección sincronizada, o `null` si es ajena. */
export function coleccionDeClaveStorage(key: string | null): ColeccionSincronizada | null {
  if (key === CLAVE_STORAGE_CANDIDATOS) return 'candidatos';
  if (key === CLAVE_STORAGE_INVITACIONES) return 'invitaciones';
  if (key === CLAVE_STORAGE_SLOTS) return 'slots';
  return null;
}

export interface EntidadConId {
  readonly id: string;
}

function idValido(id: unknown): id is string {
  return typeof id === 'string' && id !== '';
}

/**
 * Merge por id (puro): actualiza in situ conservando el orden actual y añade
 * al final los elementos nuevos. Los campos se fusionan (`{...prev, ...nuevo}`).
 * Sin cambios devuelve la MISMA referencia (permite a React omitir el render).
 * Nunca elimina elementos ausentes en `entrantes` (ver cabecera).
 */
export function fusionarPorId<T extends EntidadConId>(
  actuales: readonly T[],
  entrantes: readonly T[]
): T[] {
  const porId = new Map<string, T>();
  for (const item of actuales) {
    if (idValido(item.id)) porId.set(item.id, item);
  }
  let cambio = false;
  for (const entrante of entrantes) {
    if (!entrante || !idValido(entrante.id)) continue;
    const previo = porId.get(entrante.id);
    if (!previo) {
      porId.set(entrante.id, entrante);
      cambio = true;
      continue;
    }
    const fusionado = { ...previo, ...entrante };
    const difiere =
      Object.keys(fusionado).length !== Object.keys(previo).length ||
      (Object.keys(fusionado) as Array<keyof T>).some((k) => fusionado[k] !== previo[k]);
    if (difiere) {
      porId.set(entrante.id, fusionado);
      cambio = true;
    }
  }
  if (!cambio) return actuales as T[];
  // Orden: el actual primero (actualizados in situ), los nuevos al final.
  // Los elementos locales sin id válido se conservan tal cual (nunca se
  // pierden por un merge).
  const resultado: T[] = [];
  const vistos = new Set<string>();
  for (const item of actuales) {
    if (!idValido(item.id)) {
      resultado.push(item);
      continue;
    }
    if (!vistos.has(item.id)) {
      vistos.add(item.id);
      resultado.push(porId.get(item.id) as T);
    }
  }
  for (const [id, item] of porId) {
    if (!vistos.has(id)) resultado.push(item);
  }
  return resultado;
}

/**
 * Reconcilia el estado local con un evento `storage`. Devuelve la lista
 * resultante o `null` cuando el evento debe ignorarse (clave ajena —incluidos
 * inmuebles—, valor ausente, JSON inválido, no-array o array vacío).
 */
export function reconciliarDesdeStorage<T extends EntidadConId>(
  key: string | null,
  newValue: string | null,
  actuales: readonly T[]
): T[] | null {
  if (coleccionDeClaveStorage(key) === null) return null;
  if (newValue === null || newValue === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(newValue);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  return fusionarPorId(actuales, parsed as T[]);
}
