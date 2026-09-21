/**
 * GAP 8 — Fábrica pura de eventos de notificación de factura electrónica B2B.
 * Reutiliza el dispatcher de GAP 1 (origen FACTURACION ya registrado).
 * NO crea un segundo sistema de notificaciones: solo produce EventoNotificacion.
 */

import type { EventoNotificacion } from '../types/notificaciones';
import { idempotenciaDeEvento } from '../types/notificaciones';
import type { FacturaElectronicaB2B } from '../types/facturaElectronicaB2B';

export type TipoEventoB2B =
  | 'facturacion.b2b_preparada'
  | 'facturacion.b2b_enviada'
  | 'facturacion.b2b_recibida'
  | 'facturacion.b2b_aceptada'
  | 'facturacion.b2b_rechazada'
  | 'facturacion.b2b_error'
  | 'facturacion.b2b_pago'
  | 'facturacion.b2b_incidencia';

export const TIPOS_EVENTO_B2B: TipoEventoB2B[] = [
  'facturacion.b2b_preparada',
  'facturacion.b2b_enviada',
  'facturacion.b2b_recibida',
  'facturacion.b2b_aceptada',
  'facturacion.b2b_rechazada',
  'facturacion.b2b_error',
  'facturacion.b2b_pago',
  'facturacion.b2b_incidencia',
];

/**
 * Evento determinista: misma (factura electrónica, tipo) → misma idempotencyKey,
 * de modo que el mismo suceso repetido no duplica notificaciones (GAP 1).
 */
export function crearEventoNotificacionB2B(
  feb: FacturaElectronicaB2B,
  tipo: TipoEventoB2B,
  extras?: Record<string, string | number | boolean | null>
): EventoNotificacion {
  const datos: Record<string, string | number | boolean | null> = {
    numeroFactura: feb.numeroCompleto,
    formato: feb.formato,
    plataforma: feb.plataforma || '',
    externalId: feb.externalId || '',
    estadoFactura: feb.estado,
    estadoPago: feb.informacionPago.estadoPago || 'NO_PAGADA',
    importePagado: feb.informacionPago.importePagado ?? 0,
    ...extras,
  };
  return {
    origen: 'FACTURACION',
    tipoEvento: tipo,
    entidadId: feb.id,
    idempotencyKey: idempotenciaDeEvento('FACTURACION', tipo, feb.id),
    inmuebleId: feb.inmuebleId,
    propietarioId: feb.propietarioId,
    datos,
  };
}
