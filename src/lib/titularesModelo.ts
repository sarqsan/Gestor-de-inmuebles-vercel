/**
 * MODELO DEL TITULAR (Persona / Propietario) — REGLAS PURAS
 * ==========================================================
 * CUENTA DE ACCESO ≠ PROPIETARIO/TITULAR ≠ GESTOR.
 *
 * La entidad Titular es **una sola** y completa: `propietarios/{id}` (interfaz
 * `Propietario`). No existe «titular básico» ni «segundo propietario» como
 * entidad aparte: la relación con un inmueble vive en la titularidad
 * (`titularidades/{inmuebleId}__{propietarioId}` + índice `titularesIds`).
 *
 * Este módulo es PURO (sin Firebase ni React) y contiene lo que necesitan la
 * sección «Propietarios / Titulares» y el alta/edición de inmuebles:
 *
 *  · `normalizarNif` + `titularDuplicado`: una persona no se duplica por
 *    NIF/CIF/NIE (la ficha existente se abre en vez de crear otra);
 *  · `esFichaCompleta`: la ficha nace lista para asignarse a un inmueble;
 *  · `resumenTitular`: lo que se muestra en las listas y en el alta;
 *  · `porcentajeDesdeTexto`: NUNCA inventa (vacío = PENDIENTE = `null`).
 *
 * Los datos fiscales son del TITULAR y no se copian de unos titulares a otros:
 * este módulo sólo los LEE para presentación.
 */
import type { Propietario, TipoPropietario } from '../types';

/** Etiqueta legible del régimen del titular (misma nomenclatura en toda la app). */
export const ETIQUETA_TIPO_PROPIETARIO: Record<TipoPropietario, string> = {
  persona_fisica: 'Persona física',
  persona_juridica: 'Sociedad / Persona jurídica',
  comunidad_bienes: 'Comunidad de bienes',
};

/** NIF/CIF/NIE normalizado para comparar (mayúsculas, sin espacios ni separadores). */
export function normalizarNif(valor: string | null | undefined): string {
  return (valor || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/**
 * ¿Existe ya una ficha con este NIF/CIF/NIE? Devuelve la ficha existente para
 * poder ABRIRLA en vez de crear una persona duplicada.
 *
 *  · sin NIF no se puede deduplicar (devuelve `undefined`: no se bloquea);
 *  · `idExcluido` permite editar una ficha sin que se detecte a sí misma.
 */
export function titularDuplicado(
  titulares: readonly Propietario[],
  entrada: { nifCif: string; idExcluido?: string },
): Propietario | undefined {
  const nif = normalizarNif(entrada.nifCif);
  if (!nif) return undefined;
  return (titulares || []).find(
    (t) => t.id !== entrada.idExcluido && normalizarNif(t.nifCif) === nif,
  );
}

/**
 * ¿La ficha tiene los datos mínimos para poder asignarse a un inmueble?
 * (No es un «titular básico»: es la comprobación de que la ficha completa ya
 * se ha guardado con identificación; el resto de bloques son opcionales pero
 * están en el mismo formulario.)
 */
export function esFichaCompleta(titular: Pick<Propietario, 'id' | 'nombre' | 'nifCif'> | null | undefined): boolean {
  return !!titular && !!titular.id.trim() && !!titular.nombre.trim() && !!normalizarNif(titular.nifCif);
}

export interface ResumenTitular {
  id: string;
  nombre: string;
  nifCif: string;
  tipo: TipoPropietario;
  etiquetaTipo: string;
  /** Domicilio fiscal del titular (nunca el del inmueble). */
  domicilioFiscal: string;
  telefono: string;
  email: string;
  completa: boolean;
}

/** Resumen de presentación de un titular (listas, alta de inmueble, fichas). */
export function resumenTitular(titular: Propietario): ResumenTitular {
  const domicilio = [titular.direccion, titular.ciudad, titular.codigoPostal]
    .map((v) => (v || '').trim())
    .filter(Boolean)
    .join(', ');
  return {
    id: titular.id,
    nombre: (titular.nombre || '').trim(),
    nifCif: (titular.nifCif || '').trim(),
    tipo: titular.tipoPropietario,
    etiquetaTipo: ETIQUETA_TIPO_PROPIETARIO[titular.tipoPropietario] || ETIQUETA_TIPO_PROPIETARIO.persona_fisica,
    domicilioFiscal: domicilio,
    telefono: (titular.telefono || '').trim(),
    email: (titular.email || '').trim(),
    completa: esFichaCompleta(titular),
  };
}

/**
 * Porcentaje declarado a partir de un texto de formulario.
 *  · vacío o `null` → `null` = **PENDIENTE** (nunca 50/50, nunca 100);
 *  · número válido entre 0 y 100 → se conserva;
 *  · cualquier otra cosa (texto, negativo, >100) → `undefined` = el llamador
 *    debe rechazarlo y explicarlo (no se corrige ni se redondea a ciegas).
 */
export function porcentajeDesdeTexto(valor: string | number | null | undefined): number | null | undefined {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) return undefined;
    return valor;
  }
  const bruto = valor.trim().replace(',', '.');
  if (bruto === '') return null;
  if (!/^\d+(\.\d+)?$/.test(bruto)) return undefined;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return n;
}

/**
 * Búsqueda LOCAL de titulares por nombre, NIF/CIF o contacto. Es la búsqueda de
 * los desplegables (el ámbito ya viene acotado por el host); la búsqueda de
 * SERVIDOR (F3) vive en `src/titularidades/busquedaTitulares.ts` y devuelve
 * sólo `{ id, nombre }` para quien no puede ver la ficha completa.
 */
export function filtrarTitularesLocales(
  titulares: readonly Propietario[],
  termino: string,
): Propietario[] {
  const q = (termino || '').trim().toLowerCase();
  if (!q) return [...titulares];
  const qNif = normalizarNif(q);
  return titulares.filter((t) => {
    const nombre = (t.nombre || '').toLowerCase();
    const ciudad = (t.ciudad || '').toLowerCase();
    const email = (t.email || '').toLowerCase();
    return (
      nombre.includes(q) ||
      ciudad.includes(q) ||
      email.includes(q) ||
      (!!qNif && normalizarNif(t.nifCif).includes(qNif))
    );
  });
}

/** Aviso exacto del alta cuando el titular buscado todavía no existe. */
export const MENSAJE_TITULAR_NO_EXISTE_SECCION =
  'Este titular todavía no existe. Créalo desde Propietarios/Titulares y después asígnalo a este inmueble.';

/** Aviso de duplicado: se ofrece abrir la ficha existente, nunca crear otra. */
export function mensajeTitularDuplicado(nombre: string): string {
  return `Ya existe un titular con este NIF/CIF: ${nombre}. Abre su ficha para editarla; no se crea una ficha duplicada.`;
}
