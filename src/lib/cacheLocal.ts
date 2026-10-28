/**
 * H-11 — CACHÉ LOCAL DE LA CARTERA: OPT-IN, NUNCA IMPLÍCITA
 * =========================================================
 * `App.tsx` hidrataba propietarios, inmuebles, candidatos, contratos,
 * solicitudes, invitaciones… desde `localStorage` sin ninguna bandera. Si el
 * navegador conservaba claves de una sesión anterior (o de una cuenta distinta
 * que no llegó a cerrar sesión), la interfaz mostraba esa cartera como si fuera
 * la del usuario actual ANTES de que llegara el primer snapshot de Firestore; y
 * si la lectura era denegada, la caché se quedaba como «verdad».
 *
 * Ahora:
 *  · la hidratación exige `VITE_CACHE_LOCAL_ENABLED` (apagada por defecto);
 *  · las claves llevan un prefijo propio y sólo se leen las de la aplicación;
 *  · el cierre de sesión las borra todas (ver `authService.logoutUser`).
 *
 * No es un mecanismo de persistencia de negocio: Firestore sigue siendo la
 * fuente de verdad. Es sólo una caché de arranque, y por eso es opcional.
 */
import { banderaActivada } from './flags';

export const PREFIJO_CACHE_APP = 'rentselect_';

/** Claves de datos de cartera que `App.tsx` puede cachear. */
export const CLAVES_CACHE_APP = [
  'propietarios',
  'candidatos',
  'inmuebles',
  'solicitudes',
  'invitaciones',
  'slots',
  'solicitudes_doc',
  'contratos',
  'solicitudes_seguro',
] as const;

export type ClaveCacheApp = (typeof CLAVES_CACHE_APP)[number];

/** ¿Se permite leer/escribir la caché de cartera? Solo con la bandera explícita. */
export function cacheLocalHabilitada(): boolean {
  return banderaActivada('VITE_CACHE_LOCAL_ENABLED');
}

function claveCompleta(clave: ClaveCacheApp): string {
  return `${PREFIJO_CACHE_APP}${clave}`;
}

/**
 * Lee la caché de una colección. Devuelve `null` si la bandera está apagada, si
 * no hay `localStorage` (SSR/pruebas) o si el contenido no es un array.
 */
export function leerCacheLocal<T>(clave: ClaveCacheApp): T[] | null {
  if (!cacheLocalHabilitada()) return null;
  try {
    const crudo = globalThis.localStorage?.getItem(claveCompleta(clave));
    if (!crudo) return null;
    const valor: unknown = JSON.parse(crudo);
    return Array.isArray(valor) ? (valor as T[]) : null;
  } catch {
    return null;
  }
}

/** Guarda la caché solo si la bandera está activa; nunca lanza. */
export function guardarCacheLocal(clave: ClaveCacheApp, valor: unknown): void {
  if (!cacheLocalHabilitada()) return;
  try {
    globalThis.localStorage?.setItem(claveCompleta(clave), JSON.stringify(valor));
  } catch {
    // Cuota llena o almacenamiento deshabilitado: la app funciona sin caché.
  }
}

/** Borra TODAS las claves de datos de la aplicación (cierre de sesión). */
export function limpiarCacheLocal(): void {
  try {
    for (const clave of CLAVES_CACHE_APP) {
      globalThis.localStorage?.removeItem(claveCompleta(clave));
    }
  } catch {
    // Sin almacenamiento no hay nada que limpiar.
  }
}
