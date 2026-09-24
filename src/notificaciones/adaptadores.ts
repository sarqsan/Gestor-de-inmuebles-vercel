/**
 * GAP 1 — Adaptadores de negocio → eventos de notificación.
 * --------------------------------------------------------
 * Pasan de entidades de dominio (cobros, agendas, incidencias...) a
 * EventoNotificacion { origen, tipoEvento, entidadId, idempotencyKey, datos }.
 * Se mantienen como funciones PURAS. NO modifican cobros/agendas/incidencias.
 * Los módulos afectados se mantienen intactos: la integración real la hará
 * Arena A en su orden.
 */

import type {
  CobroPeriodo,
  Incidencia,
  ContratoFormalizacion,
  InvitacionVisita,
  PolizaSeguro,
  Siniestro,
  Propietario,
  Inmueble,
} from '../types';

import type { EventoNotificacion } from '../types/notificaciones';
import { idempotenciaDeEvento } from '../types/notificaciones';

type Datos = Record<string, string | number | boolean | null>;

const fechaHoy = () => new Date().toISOString().split('T')[0];

// ---------------------------------------------------------------------------
// COBROS
// ---------------------------------------------------------------------------

export function eventoReciboProximo(cobro: CobroPeriodo): EventoNotificacion {
  return {
    origen: 'COBRO',
    tipoEvento: 'cobro.proximo_vencimiento',
    entidadId: cobro.id,
    idempotencyKey: idempotenciaDeEvento('COBRO', 'proximo_vencimiento', cobro.id),
    inmuebleId: cobro.inmuebleId,
    propietarioId: cobro.propietarioId,
    canal: 'EMAIL',
    datos: {
      periodoMesAnio: cobro.periodoMesAnio,
      importePrevisto: cobro.importePrevisto,
      fechaVencimiento: cobro.fechaVencimiento,
    },
  };
}

export function eventoReciboVenceHoy(cobro: CobroPeriodo): EventoNotificacion {
  return {
    origen: 'COBRO',
    tipoEvento: 'cobro.vencimiento_hoy',
    entidadId: cobro.id,
    idempotencyKey: idempotenciaDeEvento('COBRO', 'vencimiento_hoy', cobro.id),
    inmuebleId: cobro.inmuebleId,
    propietarioId: cobro.propietarioId,
    canal: 'EMAIL',
    datos: {
      periodoMesAnio: cobro.periodoMesAnio,
      importePrevisto: cobro.importePrevisto,
      fechaVencimiento: cobro.fechaVencimiento,
    },
  };
}

export function eventoRetrasoPago(cobro: CobroPeriodo): EventoNotificacion | null {
  if (cobro.estado !== 'RETRASADO') return null;
  return {
    origen: 'COBRO',
    tipoEvento: 'cobro.retraso_pago',
    entidadId: cobro.id,
    idempotencyKey: idempotenciaDeEvento('COBRO', 'retraso_pago', cobro.id),
    inmuebleId: cobro.inmuebleId,
    propietarioId: cobro.propietarioId,
    canal: 'EMAIL',
    datos: {
      periodoMesAnio: cobro.periodoMesAnio,
      importePrevisto: cobro.importePrevisto,
      fechaVencimiento: cobro.fechaVencimiento,
      fechaHoy: fechaHoy(),
    },
  };
}

// ---------------------------------------------------------------------------
// AGENDA / VISITAS
// ---------------------------------------------------------------------------

export function eventoVisitaCreada(invitacion: InvitacionVisita): EventoNotificacion {
  return {
    origen: 'AGENDA',
    tipoEvento: 'agenda.visita_confirmada',
    entidadId: invitacion.id,
    idempotencyKey: idempotenciaDeEvento('AGENDA', 'visita_confirmada', invitacion.id),
    inmuebleId: invitacion.inmuebleId,
    canal: 'EMAIL',
    datos: {
      inmuebleNombre: invitacion.inmuebleNombre,
      fecha: invitacion.reserva?.fecha || '',
      hora: invitacion.reserva?.horaInicio || '',
    },
  };
}

export function eventoRecordatorioVisita(invitacion: InvitacionVisita): EventoNotificacion {
  return {
    origen: 'AGENDA',
    tipoEvento: 'agenda.recordatorio_visita',
    entidadId: invitacion.id,
    idempotencyKey: idempotenciaDeEvento('AGENDA', 'recordatorio_visita', invitacion.id),
    inmuebleId: invitacion.inmuebleId,
    canal: 'EMAIL',
    datos: {
      inmuebleNombre: invitacion.inmuebleNombre,
      fecha: invitacion.reserva?.fecha || '',
      hora: invitacion.reserva?.horaInicio || '',
    },
  };
}

export function eventoVisitaCancelada(invitacion: InvitacionVisita): EventoNotificacion | null {
  if (invitacion.status !== 'CANCELADO') return null;
  return {
    origen: 'AGENDA',
    tipoEvento: 'agenda.visita_cancelada',
    entidadId: invitacion.id,
    idempotencyKey: idempotenciaDeEvento('AGENDA', 'visita_cancelada', invitacion.id),
    inmuebleId: invitacion.inmuebleId,
    canal: 'EMAIL',
    datos: {
      inmuebleNombre: invitacion.inmuebleNombre,
      fecha: invitacion.reserva?.fecha || '',
    },
  };
}

// ---------------------------------------------------------------------------
// CONTRATOS
// ---------------------------------------------------------------------------

export function eventoProximaFinalizacionContrato(contrato: ContratoFormalizacion): EventoNotificacion | null {
  if (!contrato.fechaFinContrato) return null;
  return {
    origen: 'CONTRATO',
    tipoEvento: 'contrato.proxima_finalizacion',
    entidadId: contrato.id,
    idempotencyKey: idempotenciaDeEvento('CONTRATO', 'proxima_finalizacion', contrato.id),
    inmuebleId: contrato.inmuebleId,
    propietarioId: contrato.propietarioId,
    canal: 'EMAIL',
    datos: { fechaFinContrato: contrato.fechaFinContrato },
  };
}

export function eventoFinalizacionContrato(contrato: ContratoFormalizacion): EventoNotificacion | null {
  if (!contrato.fechaFinContrato) return null;
  return {
    origen: 'CONTRATO',
    tipoEvento: 'contrato.finalizacion',
    entidadId: contrato.id,
    idempotencyKey: idempotenciaDeEvento('CONTRATO', 'finalizacion', contrato.id),
    inmuebleId: contrato.inmuebleId,
    propietarioId: contrato.propietarioId,
    canal: 'EMAIL',
    datos: { fechaFinContrato: contrato.fechaFinContrato },
  };
}

// ---------------------------------------------------------------------------
// INCIDENCIAS
// ---------------------------------------------------------------------------

export function eventoNuevaIncidencia(incidencia: Incidencia): EventoNotificacion {
  return {
    origen: 'INCIDENCIA',
    tipoEvento: 'incidencia.nueva',
    entidadId: incidencia.id,
    idempotencyKey: idempotenciaDeEvento('INCIDENCIA', 'nueva', incidencia.id),
    inmuebleId: incidencia.inmuebleId,
    propietarioId: incidencia.propietarioId,
    canal: 'INAPP',
    datos: {
      titulo: incidencia.titulo,
      categoria: incidencia.categoria,
      prioridad: incidencia.prioridad,
    },
  };
}

export function eventoCambioEstadoIncidencia(incidencia: Incidencia, estadoAnterior: string): EventoNotificacion {
  return {
    origen: 'INCIDENCIA',
    tipoEvento: 'incidencia.cambio_estado',
    entidadId: incidencia.id,
    idempotencyKey: idempotenciaDeEvento('INCIDENCIA', `cambio_estado:${estadoAnterior}:${incidencia.estado}`, incidencia.id),
    inmuebleId: incidencia.inmuebleId,
    propietarioId: incidencia.propietarioId,
    canal: 'INAPP',
    datos: {
      titulo: incidencia.titulo,
      estadoAnterior,
      estado: incidencia.estado,
    },
  };
}

export function eventoIncidenciaResuelta(incidencia: Incidencia): EventoNotificacion | null {
  if (incidencia.estado !== 'RESUELTA') return null;
  return {
    origen: 'INCIDENCIA',
    tipoEvento: 'incidencia.resuelta',
    entidadId: incidencia.id,
    idempotencyKey: idempotenciaDeEvento('INCIDENCIA', 'resuelta', incidencia.id),
    inmuebleId: incidencia.inmuebleId,
    propietarioId: incidencia.propietarioId,
    canal: 'INAPP',
    datos: { titulo: incidencia.titulo },
  };
}

// ---------------------------------------------------------------------------
// SEGUROS
// ---------------------------------------------------------------------------

export function eventoRenovacionPoliza(poliza: PolizaSeguro): EventoNotificacion {
  return {
    origen: 'SEGURO',
    tipoEvento: 'seguro.renovacion_poliza',
    entidadId: poliza.id,
    idempotencyKey: idempotenciaDeEvento('SEGURO', 'renovacion_poliza', poliza.id),
    inmuebleId: poliza.inmuebleId,
    propietarioId: poliza.propietarioId,
    canal: 'EMAIL',
    datos: {
      aseguradora: poliza.aseguradora,
      numeroPoliza: poliza.numeroPoliza,
      fechaVencimiento: poliza.fechaVencimiento,
    },
  };
}

export function eventoSiniestroPendiente(siniestro: Siniestro): EventoNotificacion | null {
  if (siniestro.estado === 'CERRADO' || siniestro.estado === 'INDEMNIZADO') return null;
  return {
    origen: 'SEGURO',
    tipoEvento: 'seguro.siniestro_pendiente',
    entidadId: siniestro.id,
    idempotencyKey: idempotenciaDeEvento('SEGURO', 'siniestro_pendiente', siniestro.id),
    inmuebleId: siniestro.polizaId ? undefined : undefined, // El inmueble llega vía poliza; se propaga en la integración A.
    propietarioId: undefined, // se resuelve desde la poliza asociada en la integración A.
    canal: 'EMAIL',
    datos: {
      numeroSiniestro: siniestro.numeroSiniestro || siniestro.id,
      estado: siniestro.estado,
    },
  };
}

// ---------------------------------------------------------------------------
// FINANCIACIÓN (GAP 4) — adaptadores puros → EventoNotificacion.
// Reutilizan el dispatcher de GAP 1; NO crean otro dispatcher ni tocan cobros.
// ---------------------------------------------------------------------------

export function eventoFinanciacionCreada(fin: {
  id: string;
  inmuebleId: string;
  propietarioId: string;
  entidadNombre: string;
  importeFinanciado: number;
  ltv: number;
}): EventoNotificacion {
  return {
    origen: 'FINANCIACION',
    tipoEvento: 'financiacion.creada',
    entidadId: fin.id,
    idempotencyKey: idempotenciaDeEvento('FINANCIACION', 'creada', fin.id),
    inmuebleId: fin.inmuebleId,
    propietarioId: fin.propietarioId,
    canal: 'INAPP',
    datos: {
      entidadNombre: fin.entidadNombre,
      importeFinanciado: fin.importeFinanciado,
      ltv: fin.ltv,
    },
  };
}

export function eventoFinanciacionModificada(fin: {
  id: string;
  inmuebleId: string;
  propietarioId: string;
  entidadNombre: string;
  saldoPendiente: number;
}): EventoNotificacion {
  return {
    origen: 'FINANCIACION',
    tipoEvento: 'financiacion.modificada',
    entidadId: fin.id,
    idempotencyKey: idempotenciaDeEvento('FINANCIACION', 'modificada', fin.id),
    inmuebleId: fin.inmuebleId,
    propietarioId: fin.propietarioId,
    canal: 'INAPP',
    datos: {
      entidadNombre: fin.entidadNombre,
      saldoPendiente: fin.saldoPendiente,
    },
  };
}

export function eventoAmortizacionAnticipada(fin: {
  id: string;
  inmuebleId: string;
  propietarioId: string;
  entidadNombre: string;
  importeAmortizado: number;
}): EventoNotificacion {
  return {
    origen: 'FINANCIACION',
    tipoEvento: 'financiacion.amortizacion_anticipada',
    entidadId: fin.id,
    idempotencyKey: idempotenciaDeEvento('FINANCIACION', 'amortizacion_anticipada', fin.id),
    inmuebleId: fin.inmuebleId,
    propietarioId: fin.propietarioId,
    canal: 'INAPP',
    datos: {
      entidadNombre: fin.entidadNombre,
      importeAmortizado: fin.importeAmortizado,
    },
  };
}

export function eventoFinanciacionCancelada(fin: {
  id: string;
  inmuebleId: string;
  propietarioId: string;
  entidadNombre: string;
}): EventoNotificacion {
  return {
    origen: 'FINANCIACION',
    tipoEvento: 'financiacion.cancelada',
    entidadId: fin.id,
    idempotencyKey: idempotenciaDeEvento('FINANCIACION', 'cancelada', fin.id),
    inmuebleId: fin.inmuebleId,
    propietarioId: fin.propietarioId,
    canal: 'INAPP',
    datos: { entidadNombre: fin.entidadNombre },
  };
}

// ---------------------------------------------------------------------------
// FACTURACIÓN (GAP 7) — adaptadores puros → EventoNotificacion.
// Reutilizan el dispatcher de GAP 1; NO crean otro dispatcher ni tocan cobros.
// ---------------------------------------------------------------------------

export function eventoFacturaEmitida(factura: {
  id: string;
  propietarioId: string;
  inmuebleId?: string;
  numeroFactura: string;
  importeTotal: number;
  estado?: string;
}): EventoNotificacion {
  return {
    origen: 'FACTURACION',
    tipoEvento: 'facturacion.emitida',
    entidadId: factura.id,
    idempotencyKey: idempotenciaDeEvento('FACTURACION', 'emitida', factura.id),
    inmuebleId: factura.inmuebleId,
    propietarioId: factura.propietarioId,
    canal: 'INAPP',
    datos: {
      numeroFactura: factura.numeroFactura,
      importeTotal: factura.importeTotal,
      estadoFactura: factura.estado || 'EMITIDA',
    },
  };
}

export function eventoFacturaErrorRemision(factura: {
  id: string;
  propietarioId: string;
  numeroFactura: string;
  codigoError: string;
  descripcionError?: string;
}): EventoNotificacion {
  return {
    origen: 'FACTURACION',
    tipoEvento: 'facturacion.error_remision',
    entidadId: factura.id,
    idempotencyKey: idempotenciaDeEvento('FACTURACION', `error_remision:${factura.codigoError}`, factura.id),
    propietarioId: factura.propietarioId,
    canal: 'INAPP',
    datos: {
      numeroFactura: factura.numeroFactura,
      codigoError: factura.codigoError,
      descripcionError: factura.descripcionError || '',
    },
  };
}

export function eventoFacturaAceptada(factura: {
  id: string;
  propietarioId: string;
  numeroFactura: string;
  csv?: string;
}): EventoNotificacion {
  return {
    origen: 'FACTURACION',
    tipoEvento: 'facturacion.aceptada',
    entidadId: factura.id,
    idempotencyKey: idempotenciaDeEvento('FACTURACION', 'aceptada', factura.id),
    propietarioId: factura.propietarioId,
    canal: 'INAPP',
    datos: {
      numeroFactura: factura.numeroFactura,
      csv: factura.csv || '—',
    },
  };
}

export function eventoFacturaRechazada(factura: {
  id: string;
  propietarioId: string;
  numeroFactura: string;
  codigoError: string;
  descripcionError?: string;
}): EventoNotificacion {
  return {
    origen: 'FACTURACION',
    tipoEvento: 'facturacion.rechazada',
    entidadId: factura.id,
    idempotencyKey: idempotenciaDeEvento('FACTURACION', `rechazada:${factura.codigoError}`, factura.id),
    propietarioId: factura.propietarioId,
    canal: 'INAPP',
    datos: {
      numeroFactura: factura.numeroFactura,
      codigoError: factura.codigoError,
      descripcionError: factura.descripcionError || '',
    },
  };
}

export function eventoFacturaRectificada(factura: {
  id: string;
  propietarioId: string;
  numeroFactura: string;
  facturaOriginal?: string;
  motivo?: string;
}): EventoNotificacion {
  return {
    origen: 'FACTURACION',
    tipoEvento: 'facturacion.rectificada',
    entidadId: factura.id,
    idempotencyKey: idempotenciaDeEvento('FACTURACION', 'rectificada', factura.id),
    propietarioId: factura.propietarioId,
    canal: 'INAPP',
    datos: {
      numeroFactura: factura.numeroFactura,
      facturaOriginal: factura.facturaOriginal || '—',
      motivo: factura.motivo || '—',
    },
  };
}

// ---------------------------------------------------------------------------
// Helper de datos comunes (para inyección por la integración A)
// ---------------------------------------------------------------------------

export function enriquecerEventoConPropietario(
  evento: EventoNotificacion,
  propietario: Propietario | null | undefined
): EventoNotificacion {
  if (!propietario) return evento;
  return {
    ...evento,
    propietarioId: evento.propietarioId || propietario.id,
    destinatario: {
      ...(evento.destinatario || {}),
      email: evento.destinatario?.email || propietario.email,
      nombre: evento.destinatario?.nombre || propietario.nombre,
    },
  };
}

export function enriquecerEventoConInmueble(
  evento: EventoNotificacion,
  inmueble: Inmueble | null | undefined
): EventoNotificacion {
  if (!inmueble) return evento;
  const datos: Datos = { ...(evento.datos || {}) };
  if (inmueble.direccion) datos.inmuebleDireccion = inmueble.direccion;
  if (inmueble.ciudad) datos.inmuebleCiudad = inmueble.ciudad;
  return {
    ...evento,
    propietarioId: evento.propietarioId || inmueble.propietarioId,
    datos,
  };
}

// ---------------------------------------------------------------------------
// TESORERIA (BLOQUE B — integración canónica 2026-09-20)
// ---------------------------------------------------------------------------
// Pasa los eventos de tesorería (BLOQUE B, `src/tesoreria/notificaciones.ts`)
// al modelo canónico de notificación GAP 1. Función PURA: no envía nada y no
// modifica liquidaciones/órdenes. El envío efectivo lo hará el dispatcher GAP 1
// cuando exista repositorio/proveedor (misma dependencia externa que el resto de
// orígenes). `audit_logs` se conserva como auditoría, no como sustituto.

import type { NotificacionTesoreria } from '../tesoreria/tipos';

const TIPO_EVENTO_TESORERIA: Record<NotificacionTesoreria['evento'], string> = {
  'liquidacion.generada': 'tesoreria.liquidacion_generada',
  'liquidacion.aprobada': 'tesoreria.liquidacion_aprobada',
  'liquidacion.pagada': 'tesoreria.liquidacion_pagada',
  'liquidacion.anulada': 'tesoreria.liquidacion_anulada',
  'pago.incidencia': 'tesoreria.pago_incidencia',
  'sepa.preparado': 'tesoreria.sepa_preparado',
  'sepa.error_validacion': 'tesoreria.sepa_error',
};

export function eventoTesoreriaAEventoNotificacion(
  n: NotificacionTesoreria,
  propietario?: { email?: string; nombre?: string } | null,
): EventoNotificacion {
  const tipo = TIPO_EVENTO_TESORERIA[n.evento];
  const sufijo = tipo.split('.')[1] || tipo;
  return {
    origen: 'TESORERIA',
    tipoEvento: tipo,
    entidadId: n.entidadId,
    idempotencyKey: idempotenciaDeEvento('TESORERIA', sufijo, n.entidadId),
    propietarioId: n.propietarioId,
    datos: {
      id: n.id,
      evento: n.evento,
      entidadTipo: n.entidadTipo,
      titulo: n.titulo,
      mensaje: n.mensaje,
      propietarioId: n.propietarioId ?? null,
      actorNombre: n.actorNombre ?? null,
      fecha: n.fecha,
    },
    destinatario:
      n.propietarioId && propietario
        ? { email: propietario.email, nombre: propietario.nombre }
        : undefined,
  };
}
