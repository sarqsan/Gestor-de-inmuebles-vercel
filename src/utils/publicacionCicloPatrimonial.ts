/**
 * PUBLICACIÓN Y CICLO PATRIMONIAL
 * ===============================
 * Un inmueble VENDIDO o de BAJA no puede seguir publicado ni admitir altas:
 * se retira de explotación, pero NO se borra (ni el inmueble ni su histórico).
 */
import type { Inmueble } from '../types';
import { estadoExplotacionDe, estadoPatrimonialDe, inmuebleDadoDeBaja } from './cicloPatrimonialEngine';

/** ¿Puede publicarse / mantenerse publicado el inmueble? */
export function puedePublicarse(inmueble: Inmueble | null | undefined): boolean {
  return !inmuebleDadoDeBaja(inmueble) && estadoExplotacionDe(inmueble) === 'EN_EXPLOTACION';
}

/** Motivo por el que no puede publicarse (o `null` si sí puede). */
export function motivoNoPublicable(inmueble: Inmueble | null | undefined): string | null {
  if (!inmueble) return 'El inmueble no existe.';
  const patrimonial = estadoPatrimonialDe(inmueble);
  if (patrimonial === 'VENDIDO') return 'Vendido: no puede publicarse (queda en el histórico).';
  if (patrimonial === 'BAJA') return 'Dado de baja: no puede publicarse (queda en el histórico).';
  if (estadoExplotacionDe(inmueble) === 'SIN_EXPLOTACION') return 'Fuera de explotación por decisión del titular.';
  return null;
}

/** Etiqueta corta de ciclo para fichas y listados. */
export function etiquetaCicloPatrimonial(inmueble: Inmueble | null | undefined): string {
  const patrimonial = estadoPatrimonialDe(inmueble);
  if (patrimonial !== 'ACTIVO') return patrimonial === 'VENDIDO' ? 'Vendido' : 'Baja';
  return estadoExplotacionDe(inmueble) === 'SIN_EXPLOTACION' ? 'Sin explotación' : 'Activo';
}
