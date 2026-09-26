/**
 * B6.3 — Resolución determinista del ámbito de exportación.
 * NUNCA usa la fecha del navegador: los "últimos 5 años" se calculan a
 * partir del año de referencia aportado por el llamante, de modo que una
 * exportación histórica es byte a byte reproducible.
 */
import type { Inmueble } from '../../types';
import type { AmbitoExportacion } from './tipos';

export interface AmbitoResuelto {
  inmuebles: Inmueble[];
  ejercicios: number[];
}

export function resolverAmbito(
  ambito: AmbitoExportacion,
  inmuebles: Inmueble[]
): AmbitoResuelto {
  const sel =
    ambito.seleccion === 'UN_INMUEBLE'
      ? inmuebles.filter((i) => i.id === ambito.inmuebleId)
      : [...inmuebles];

  // Orden determinista por id (no por orden de llegada).
  sel.sort((a, b) => a.id.localeCompare(b.id));

  return { inmuebles: sel, ejercicios: resolverEjercicios(ambito) };
}

export function resolverEjercicios(ambito: AmbitoExportacion): number[] {
  const p = ambito.periodo;
  if (p.tipo === 'ANIO') return [p.anio];
  if (p.tipo === 'RANGO') {
    if (p.hasta < p.desde) {
      throw new Error(`Rango inválido: desde=${p.desde} hasta=${p.hasta}`);
    }
    const años: number[] = [];
    for (let a = p.desde; a <= p.hasta; a++) años.push(a);
    return años;
  }
  // ULTIMOS_5 — determinista desde el año de referencia explícito.
  return [p.anioReferencia - 4, p.anioReferencia - 3, p.anioReferencia - 2, p.anioReferencia - 1, p.anioReferencia];
}
