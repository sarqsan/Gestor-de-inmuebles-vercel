/**
 * COMPLETITUD DEL INMUEBLE (altas incompletas por importación)
 * ============================================================
 * Un inmueble importado puede nacer sólo con lo que el archivo declara (dirección
 * y, si consta, titular). Todo lo demás queda PENDIENTE. Este módulo es la única
 * fuente de verdad de qué falta y de cómo se muestra, para que la ficha, el
 * listado, el inicio y la edición no inventen valores:
 *
 *  · Un dato ausente NUNCA se muestra como 0, «NaN €», «Alquilado» ni «Disponible».
 *  · Un campo vacío del formulario se convierte en «no indicado» (`undefined`),
 *    no en 0: al guardar, la escritura con `merge` conserva lo que ya existe.
 *  · La renta DECLARADA por la importación (`rentaMensualDeclarada`) se muestra
 *    como dato declarado, distinto del precio de publicación (`precio`).
 */
import type { Inmueble } from '../types';

/** Campos que la importación puede dejar pendientes, con su etiqueta visible. */
export const CAMPOS_PENDIENTES_INMUEBLE = [
  { campo: 'ciudad', etiqueta: 'Ciudad' },
  { campo: 'precio', etiqueta: 'Precio mensual' },
  { campo: 'estado', etiqueta: 'Estado (disponible / alquilado)' },
  { campo: 'superficie', etiqueta: 'Superficie' },
  { campo: 'habitaciones', etiqueta: 'Habitaciones' },
  { campo: 'banos', etiqueta: 'Baños' },
  { campo: 'fianzaMeses', etiqueta: 'Fianza (meses)' },
  { campo: 'referenciaCatastral', etiqueta: 'Referencia catastral' },
  { campo: 'codigoPostal', etiqueta: 'Código postal' },
  { campo: 'tipoInmueble', etiqueta: 'Tipo de inmueble' },
] as const;

type CampoPendiente = (typeof CAMPOS_PENDIENTES_INMUEBLE)[number]['campo'];

/** ¿El valor consta? Ausente, nulo, vacío o no numérico-válido ⇒ no consta. */
export function valorConsta(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'number') return Number.isFinite(v);
  return true;
}

/** Etiquetas de los campos que no constan en el inmueble. */
export function camposPendientesInmueble(inm: Partial<Inmueble>): string[] {
  return CAMPOS_PENDIENTES_INMUEBLE
    .filter(({ campo }) => !valorConsta((inm as Record<string, unknown>)[campo as CampoPendiente]))
    .map(({ etiqueta }) => etiqueta);
}

/** Precio mensual para mostrar; si no consta, un texto explícito (nunca «NaN €»). */
export function precioMensualTexto(inm: Partial<Inmueble>, formatear: (n: number) => string): string {
  return valorConsta(inm.precio) ? `${formatear(inm.precio as number)}/mes` : 'Precio pendiente';
}

/** Etiqueta de disponibilidad: sin estado declarado no se afirma ni «alquilado» ni «disponible». */
export function estadoInmuebleEtiqueta(inm: Partial<Inmueble>): 'Disponible' | 'Alquilado' | 'Estado pendiente' {
  if (inm.estado === 'disponible') return 'Disponible';
  if (inm.estado === 'alquilado') return 'Alquilado';
  return 'Estado pendiente';
}

/** Valor de un campo numérico del formulario: vacío o no numérico ⇒ no indicado. */
export function valorNumericoEditable(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Renta mensual DECLARADA por la importación, si consta (no es el precio de publicación). */
export function rentaDeclaradaInmueble(inm: Partial<Inmueble>): number | undefined {
  return valorConsta(inm.rentaMensualDeclarada) ? inm.rentaMensualDeclarada : undefined;
}
