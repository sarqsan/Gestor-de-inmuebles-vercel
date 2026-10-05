/**
 * J.3 — Traducción del estado interno del contrato a lenguaje de inquilino.
 *
 * El Portal del Inquilino NO debe mostrar estados internos del ERP
 * (`FORMALIZADO_ACTIVO`, `ENVIADO_FIRMA`…). Este módulo es presentación pura:
 * no toca el modelo, no cambia ninguna regla de negocio y no altera el valor
 * almacenado. Sólo decide cómo se nombra cada estado de cara al residente.
 *
 * No se inventa información: todo estado desconocido cae en un texto neutro
 * («Contrato registrado») en lugar de exponer la constante interna.
 */
import type { EstadoFormalizacion } from '../../types';

/** Tono visual asociado al estado (para colorear la etiqueta sin inventar semántica). */
export type TonoEstadoContrato = 'activo' | 'tramite' | 'cerrado' | 'neutro';

interface DescripcionEstado {
  etiqueta: string;
  tono: TonoEstadoContrato;
}

const MAPA: Record<EstadoFormalizacion, DescripcionEstado> = {
  EN_ESTUDIO: { etiqueta: 'En estudio', tono: 'tramite' },
  ADJUDICADO: { etiqueta: 'Adjudicado', tono: 'tramite' },
  BORRADOR_CONTRATO: { etiqueta: 'Contrato en preparación', tono: 'tramite' },
  ENVIADO_FIRMA: { etiqueta: 'Pendiente de firma', tono: 'tramite' },
  FIRMADO: { etiqueta: 'Firmado', tono: 'activo' },
  FIANZA_DEPOSITADA: { etiqueta: 'Fianza depositada', tono: 'activo' },
  FORMALIZADO_ACTIVO: { etiqueta: 'En vigor', tono: 'activo' },
  FINALIZADO: { etiqueta: 'Finalizado', tono: 'cerrado' },
  RESCINDIDO: { etiqueta: 'Rescindido', tono: 'cerrado' },
  CANCELADO: { etiqueta: 'Cancelado', tono: 'cerrado' },
};

const NEUTRO: DescripcionEstado = { etiqueta: 'Contrato registrado', tono: 'neutro' };

/** Texto legible del estado del contrato para el inquilino. Nunca devuelve la constante interna. */
export function etiquetaEstadoContrato(estado?: string): string {
  if (!estado) return NEUTRO.etiqueta;
  return (MAPA as Record<string, DescripcionEstado>)[estado]?.etiqueta ?? NEUTRO.etiqueta;
}

/** Tono visual del estado, para aplicar color sin codificar reglas de negocio. */
export function tonoEstadoContrato(estado?: string): TonoEstadoContrato {
  if (!estado) return NEUTRO.tono;
  return (MAPA as Record<string, DescripcionEstado>)[estado]?.tono ?? NEUTRO.tono;
}
