/**
 * H11 — CONTRATO DE PRESENTACIÓN DE LA TITULARIDAD
 * =================================================
 * Regla protegida:
 *
 *   «La interfaz debe mostrar exactamente lo que el modelo acredita: quién es
 *    titular, quién es principal fiscal, qué porcentaje está acreditado y qué
 *    relación es histórica. Nunca debe rellenar una ausencia de información
 *    con una conclusión patrimonial.»
 *
 * Varias pantallas vinculaban una persona con un inmueble mezclando en un solo
 * cubo indistinguible seis relaciones de naturaleza muy distinta: el titular
 * canónico, el índice moderno de cotitulares, el principal fiscal, el campo
 * LEGADO `propietarioSecundarioId` y hasta coincidencias de NIF dentro de la
 * instantánea fiscal. Esta función pura clasifica el vínculo y declara, para
 * cada caso, si el modelo acredita o no una TITULARIDAD PATRIMONIAL ACTUAL.
 *
 * Qué NO hace este módulo (deliberadamente):
 *  · no calcula porcentajes — la única fuente es `etiquetaPorcentaje()` del
 *    motor (`utils/titularidadesEngine`), que muestra «Pendiente» cuando el
 *    dato es `null`. Aquí no se duplica esa lógica: H11 no crea una segunda
 *    fuente de verdad;
 *  · no decide permisos — tener acceso a un inmueble (H8) no convierte a nadie
 *    en propietario, y esa distinción es precisamente lo que se preserva;
 *  · no lee Firestore, no hace red y no escribe nada.
 */
import type { Inmueble } from '../types';

export type CodigoVinculo =
  | 'TITULAR_CANONICO'
  | 'TITULAR_VIGENTE'
  | 'PRINCIPAL_FISCAL'
  | 'LEGADO_SECUNDARIO'
  | 'FICHA_FISCAL';

export interface DescriptorVinculo {
  codigo: CodigoVinculo;
  /** Etiqueta breve y literal: nombra la FUENTE, no una conclusión. */
  etiqueta: string;
  /** Explicación para `title`/tooltip. */
  descripcion: string;
  /**
   * ¿El modelo acredita con este vínculo una titularidad patrimonial ACTUAL?
   * Sólo el titular canónico y el índice moderno de titularidades vigentes.
   */
  acreditaTitularidadActual: boolean;
}

export const VINCULOS: Record<CodigoVinculo, DescriptorVinculo> = {
  TITULAR_CANONICO: {
    codigo: 'TITULAR_CANONICO',
    etiqueta: 'Titular',
    descripcion: 'Titular económico canónico del inmueble (propietarioId).',
    acreditaTitularidadActual: true,
  },
  TITULAR_VIGENTE: {
    codigo: 'TITULAR_VIGENTE',
    etiqueta: 'Titular',
    descripcion: 'Figura en el índice de titularidades vigentes del inmueble.',
    acreditaTitularidadActual: true,
  },
  PRINCIPAL_FISCAL: {
    codigo: 'PRINCIPAL_FISCAL',
    etiqueta: 'Principal fiscal',
    descripcion:
      'Designado principal a efectos fiscales. Puede diferir legítimamente del titular canónico y no acredita por sí solo una cuota patrimonial.',
    acreditaTitularidadActual: false,
  },
  LEGADO_SECUNDARIO: {
    codigo: 'LEGADO_SECUNDARIO',
    etiqueta: 'Dato heredado',
    descripcion:
      'Procede del campo heredado propietarioSecundarioId. Es informativo: no acredita una titularidad moderna mientras no exista una titularidad registrada.',
    acreditaTitularidadActual: false,
  },
  FICHA_FISCAL: {
    codigo: 'FICHA_FISCAL',
    etiqueta: 'Ficha fiscal',
    descripcion:
      'Coincidencia con la instantánea de datos fiscales del inmueble. Es un dato declarativo, no una titularidad registrada.',
    acreditaTitularidadActual: false,
  },
};

const mismoNif = (a?: string, b?: string) =>
  !!a && !!b && a.trim().toUpperCase() === b.trim().toUpperCase();

/**
 * Clasifica por qué una persona aparece vinculada a un inmueble.
 * Devuelve `null` si no hay ningún vínculo. El orden es de mayor a menor
 * fuerza probatoria: lo que el modelo acredita manda sobre lo declarativo.
 */
export function clasificarVinculoInmueble(
  inmueble: Inmueble,
  persona: { id?: string; nif?: string },
): DescriptorVinculo | null {
  const id = persona.id?.trim();
  const nif = persona.nif?.trim();

  if (id && inmueble.propietarioId === id) return VINCULOS.TITULAR_CANONICO;
  if (id && Array.isArray(inmueble.titularesIds) && inmueble.titularesIds.includes(id)) {
    return VINCULOS.TITULAR_VIGENTE;
  }
  if (id && inmueble.propietarioPrincipalId === id) return VINCULOS.PRINCIPAL_FISCAL;
  if (id && inmueble.propietarioSecundarioId === id) return VINCULOS.LEGADO_SECUNDARIO;
  if (
    mismoNif(nif, inmueble.datosFiscales?.propietarioPrincipal?.nifDni) ||
    mismoNif(nif, inmueble.datosFiscales?.segundoPropietario?.nifDni)
  ) {
    return VINCULOS.FICHA_FISCAL;
  }
  return null;
}

/** ¿Este vínculo permite afirmar que la persona es titular HOY? */
export function acreditaTitularidadActual(inmueble: Inmueble, persona: { id?: string; nif?: string }): boolean {
  return clasificarVinculoInmueble(inmueble, persona)?.acreditaTitularidadActual === true;
}
