/**
 * BLOQUE B — Eventos de notificación de tesorería.
 *
 * Este módulo NO crea otro sistema de envío: genera eventos tipados (título/mensaje)
 * y ofrece `publicarEventoTesoreria()` que registra en `audit_logs` mediante el
 * callback inyectado (en la app canónica: `registrarAuditoriaFirestore`).
 *
 * INTEGRACIÓN A (2026-09-20): el envío de notificaciones usa el GAP 1 canónico
 * (`src/notificaciones/*`): el adaptador `eventoTesoreriaAEventoNotificacion`
 * (en `src/notificaciones/adaptadores.ts`) convierte estos eventos a
 * `EventoNotificacion` {origen:'TESORERIA', idempotencia, destinatario por
 * propietario} y las plantillas `tesoreria.*` viven en el registro canónico
 * (`src/notificaciones/plantillas.ts`). `audit_logs` se conserva como auditoría,
 * no como sustituto del dispatcher.
 * Comportamiento seguro: sin envío real de emails/SMS, sin secretos.
 */
import type { EventoTesoreria, NotificacionTesoreria } from './tipos';
import { formatoImporteSepa } from './sepaUtils';

export type AuditWriter = (accion: string, descripcion: string, detalles: Record<string, unknown>) => void | Promise<void>;

let auditWriter: AuditWriter | null = null;

/** Inyecta el escritor de auditoría (p.ej. registrarAuditoriaFirestore). */
export function configurarAuditWriter(writer: AuditWriter | null): void {
  auditWriter = writer;
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface DatosEventoLiquidacion {
  liquidacionId: string;
  periodo: string;
  propietarioId: string;
  propietarioNombre: string;
  neto: number;
  actorNombre?: string;
  motivo?: string;
}

export interface DatosEventoSepa {
  ficheroId: string;
  tipo: string;
  msgId: string;
  numOperaciones: number;
  importeTotal: number;
  actorNombre?: string;
  errores?: string[];
}

function base(
  evento: EventoTesoreria,
  entidadTipo: NotificacionTesoreria['entidadTipo'],
  entidadId: string,
  titulo: string,
  mensaje: string,
  propietarioId?: string,
  actorNombre?: string,
): NotificacionTesoreria {
  return {
    id: uid('evt'),
    evento,
    fecha: new Date().toISOString(),
    entidadTipo,
    entidadId,
    propietarioId,
    titulo,
    mensaje,
    actorNombre,
  };
}

export function eventoLiquidacionGenerada(d: DatosEventoLiquidacion): NotificacionTesoreria {
  return base(
    'liquidacion.generada', 'liquidacion', d.liquidacionId,
    `Liquidación ${d.periodo} generada (borrador)`,
    `Borrador de liquidación de ${d.propietarioNombre} (${d.periodo}): neto ${formatoImporteSepa(d.neto)} €. Pendiente de revisión y aprobación.`,
    d.propietarioId, d.actorNombre,
  );
}

export function eventoLiquidacionAprobada(d: DatosEventoLiquidacion): NotificacionTesoreria {
  return base(
    'liquidacion.aprobada', 'liquidacion', d.liquidacionId,
    `Liquidación ${d.periodo} aprobada`,
    `Liquidación de ${d.propietarioNombre} (${d.periodo}) aprobada: neto ${formatoImporteSepa(d.neto)} € listo para pago.`,
    d.propietarioId, d.actorNombre,
  );
}

export function eventoLiquidacionPagada(d: DatosEventoLiquidacion & { referenciaBancaria: string }): NotificacionTesoreria {
  return base(
    'liquidacion.pagada', 'liquidacion', d.liquidacionId,
    `Liquidación ${d.periodo} pagada`,
    `Pagados ${formatoImporteSepa(d.neto)} € a ${d.propietarioNombre} (ref. ${d.referenciaBancaria}).`,
    d.propietarioId, d.actorNombre,
  );
}

export function eventoLiquidacionAnulada(d: DatosEventoLiquidacion): NotificacionTesoreria {
  return base(
    'liquidacion.anulada', 'liquidacion', d.liquidacionId,
    `Liquidación ${d.periodo} anulada/reversada`,
    `La liquidación de ${d.propietarioNombre} (${d.periodo}) ha sido anulada. Motivo: ${d.motivo || '—'}. Se conserva trazabilidad.`,
    d.propietarioId, d.actorNombre,
  );
}

export function eventoPagoIncidencia(d: DatosEventoLiquidacion & { detalle: string }): NotificacionTesoreria {
  return base(
    'pago.incidencia', 'orden_pago', d.liquidacionId,
    `Incidencia en pago de liquidación ${d.periodo}`,
    `Incidencia en el pago a ${d.propietarioNombre} (${d.periodo}): ${d.detalle}`,
    d.propietarioId, d.actorNombre,
  );
}

export function eventoSepaPreparado(d: DatosEventoSepa): NotificacionTesoreria {
  return base(
    'sepa.preparado', 'fichero_sepa', d.ficheroId,
    `Fichero SEPA ${d.tipo} preparado (${d.msgId})`,
    `Fichero ${d.tipo} con ${d.numOperaciones} operaciones por ${formatoImporteSepa(d.importeTotal)} € validado y preparado para banca electrónica. Sin envío automático.`,
    undefined, d.actorNombre,
  );
}

export function eventoSepaError(d: DatosEventoSepa): NotificacionTesoreria {
  return base(
    'sepa.error_validacion', 'fichero_sepa', d.ficheroId,
    `Error de validación SEPA ${d.tipo} (${d.msgId})`,
    `El fichero no supera la validación: ${(d.errores || []).slice(0, 3).join(' · ')}${(d.errores || []).length > 3 ? '…' : ''}`,
    undefined, d.actorNombre,
  );
}

/**
 * Publica el evento: auditoría (audit_logs) + retorno. Nunca lanza.
 * `eventoGap1` es el evento canónico equivalente (GAP 1) construido por
 * `eventoTesoreriaAEventoNotificacion`: se registra en la auditoría para
 * trazabilidad completa (tipo + clave de idempotencia del dispatcher).
 */
export function publicarEventoTesoreria(
  evento: NotificacionTesoreria,
  eventoGap1?: { tipoEvento: string; idempotencyKey: string } | null,
): NotificacionTesoreria {
  try {
    const descripcion = `[${evento.evento}] ${evento.titulo} — ${evento.mensaje}`;
    if (auditWriter) {
      void auditWriter(`TESORERIA_${evento.evento.toUpperCase().replace(/\./g, '_')}`, descripcion, {
        evento: evento.evento,
        entidadTipo: evento.entidadTipo,
        entidadId: evento.entidadId,
        propietarioId: evento.propietarioId,
        gap1: eventoGap1
          ? { tipoEvento: eventoGap1.tipoEvento, idempotencyKey: eventoGap1.idempotencyKey }
          : null,
      });
    } else {
      // eslint-disable-next-line no-console
      console.info('[Tesorería]', descripcion);
    }
  } catch {
    // comportamiento seguro: la notificación nunca rompe el flujo contable
  }
  return evento;
}
