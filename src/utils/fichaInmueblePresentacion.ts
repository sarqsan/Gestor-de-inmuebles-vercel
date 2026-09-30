/**
 * PRESENTACIÓN DE LA FICHA DEL INMUEBLE (N titulares + ciclo patrimonial)
 * =======================================================================
 * Sólo formato: no decide permisos ni porcentajes.
 */
import type { Inmueble, Titularidad } from '../types';
import { estadoPatrimonialDe, inmuebleDadoDeBaja } from './cicloPatrimonialEngine';
import { etiquetaPorcentaje, numeroTitulares } from './titularidadesEngine';

/** «1 titular», «3 titulares», «Sin titulares declarados». */
export function etiquetaNumeroTitulares(titularidades: readonly Titularidad[], inmuebleId?: string): string {
  const n = numeroTitulares(titularidades, inmuebleId);
  if (n === 0) return 'Sin titulares declarados';
  return n === 1 ? '1 titular' : `${n} titulares`;
}

/** Línea de reparto: «Ana 50 % · Luis 30 % · Marta 20 %» (o «Pendiente»). */
export function lineaReparto(titularidades: readonly Titularidad[], inmuebleId?: string): string {
  const vigentes = (titularidades || []).filter((t) => t.estado !== 'CERRADA' && (!inmuebleId || t.inmuebleId === inmuebleId));
  if (vigentes.length === 0) return 'Sin titularidades declaradas';
  return vigentes.map((t) => `${t.propietarioNombre || t.propietarioId} ${etiquetaPorcentaje(t)}`).join(' · ');
}

/** Aviso de cabecera cuando el inmueble no está operable. */
export function avisoCicloPatrimonial(inmueble: Inmueble | null | undefined): string | null {
  if (!inmueble || !inmuebleDadoDeBaja(inmueble)) return null;
  const estado = estadoPatrimonialDe(inmueble);
  const fecha = inmueble.bajaPatrimonial?.fecha || inmueble.fechaVenta;
  const cuando = fecha ? ` el ${fecha.slice(0, 10)}` : '';
  return estado === 'VENDIDO'
    ? `Inmueble vendido${cuando}. Se conserva en el histórico: no se borra ni el inmueble ni sus titularidades.`
    : `Inmueble dado de baja${cuando}. Se conserva en el histórico: no se borra ni el inmueble ni sus titularidades.`;
}

/** Clase de color (Tailwind) según el ciclo patrimonial. */
export function claseCicloPatrimonial(inmueble: Inmueble | null | undefined): string {
  const estado = estadoPatrimonialDe(inmueble);
  if (estado === 'VENDIDO') return 'bg-amber-100 text-amber-800';
  if (estado === 'BAJA') return 'bg-slate-200 text-slate-700';
  return 'bg-emerald-100 text-emerald-800';
}
