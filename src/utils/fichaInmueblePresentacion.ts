/**
 * PRESENTACIÓN DE LA FICHA DEL INMUEBLE (BLOQUE 3 · 3.2)
 * ======================================================
 *
 * Bug corregido: el portal del propietario mostraba
 *
 *   {inm.precioRentaMensual} €/mes        → " €/mes"   (el campo NO existe)
 *   {inm.superficieConstruida || 0} m²    → "0 m²"     (el campo NO existe)
 *
 * Los campos reales son `precio` (o `rentaMensual`) y `superficie` (o el dato
 * catastral). Como la prop `inmuebles` llegaba sin tipar (`any`), TypeScript no
 * detectaba el error: el fallo era invisible en `tsc`.
 *
 * Este módulo centraliza la lectura con una jerarquía explícita y DEVUELVE NULO
 * cuando el dato no existe, para que la UI muestre "—" en lugar de un 0 que
 * parece real. Nunca se inventa un valor.
 *
 * Puro y sin dependencias ⇒ testeable.
 */

import type { Inmueble } from '../types';

type Entrada = Partial<Inmueble> | null | undefined;

function numeroValido(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v.replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Renta mensual efectiva del inmueble.
 * Jerarquía: `precio` → `rentaMensual`.
 * `null` cuando no hay dato: la UI debe mostrar "—", nunca "0".
 */
export function rentaMensualDe(inmueble: Entrada): number | null {
  if (!inmueble) return null;
  return numeroValido(inmueble.precio) ?? numeroValido(inmueble.rentaMensual);
}

/**
 * Superficie en m².
 * Jerarquía: `superficie` → `datosCatastrales.superficieCatastralConstruida`.
 * `null` cuando no hay dato.
 */
export function superficieDe(inmueble: Entrada): number | null {
  if (!inmueble) return null;
  const directa = numeroValido(inmueble.superficie);
  if (directa !== null) return directa;

  const catastral = inmueble.datosCatastrales as
    | { superficieCatastralConstruida?: unknown }
    | undefined;
  return numeroValido(catastral?.superficieCatastralConstruida);
}

/** Formatea la renta: "850 €/mes" o "—" si no hay dato. */
export function formatearRentaMensual(inmueble: Entrada): string {
  const v = rentaMensualDe(inmueble);
  if (v === null) return '—';
  return `${new Intl.NumberFormat('es-ES').format(v)} €/mes`;
}

/** Formatea la superficie: "85 m²" o "—" si no hay dato. */
export function formatearSuperficie(inmueble: Entrada): string {
  const v = superficieDe(inmueble);
  if (v === null) return '—';
  return `${new Intl.NumberFormat('es-ES').format(v)} m²`;
}

/** ¿El inmueble tiene datos suficientes para mostrar la ficha económica? */
export function tieneDatosEconomicos(inmueble: Entrada): boolean {
  return rentaMensualDe(inmueble) !== null || superficieDe(inmueble) !== null;
}
