/**
 * GAP 1 — Plantillas del sistema de notificaciones.
 * ------------------------------------------------
 * Registro central de plantillas por familia de negocio. Los textos son
 * neutros y operativos (no introducen cláusulas jurídicas). Aceptan props
 * dinámicas con la sintaxis {prop} resuelta por resolucionDePlantillas().
 * Cada plantilla declara los canales permitidos.
 */

import type { PlantillaNotificacion } from '../types/notificaciones';

export const PLANTILLAS: Record<string, PlantillaNotificacion> = {
  // =======================================================================
  // COBROS
  // =======================================================================
  'cobro.proximo_vencimiento': {
    id: 'cobro.proximo_vencimiento',
    asunto: 'Próximo recibo de alquiler — {inmuebleDireccion}',
    cuerpo:
      'Le recordamos que el próximo {diaVencimiento} vence el recibo de alquiler correspondiente a {periodoMesAnio} por importe de {importePrevisto}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'SCHEDULED',
    antelacionHoras: 72,
  },
  'cobro.vencimiento_hoy': {
    id: 'cobro.vencimiento_hoy',
    asunto: 'Recibo de alquiler vence hoy — {inmuebleDireccion}',
    cuerpo:
      'Hoy vence el recibo de alquiler correspondiente a {periodoMesAnio} por importe de {importePrevisto}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },
  'cobro.retraso_pago': {
    id: 'cobro.retraso_pago',
    asunto: 'Aviso de retraso en el pago — {inmuebleDireccion}',
    cuerpo:
      'El recibo de alquiler de {periodoMesAnio} no consta como pagado a fecha de {fechaHoy}. Importe pendiente: {importePrevisto}.',
    canalesPermitidos: ['EMAIL', 'INAPP', 'WEBHOOK'],
    inicio: 'IMMEDIATE',
  },

  // =======================================================================
  // AGENDA / VISITAS
  // =======================================================================
  'agenda.visita_confirmada': {
    id: 'agenda.visita_confirmada',
    asunto: 'Visita confirmada — {inmuebleDireccion}',
    cuerpo:
      'Su visita para {inmuebleDireccion} queda confirmada el {fecha} a las {hora}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },
  'agenda.recordatorio_visita': {
    id: 'agenda.recordatorio_visita',
    asunto: 'Recordatorio de visita — {inmuebleDireccion}',
    cuerpo:
      'Le recordamos su visita de {fecha} a las {hora} en {inmuebleDireccion}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'SCHEDULED',
    antelacionHoras: 24,
  },
  'agenda.visita_cancelada': {
    id: 'agenda.visita_cancelada',
    asunto: 'Visita cancelada — {inmuebleDireccion}',
    cuerpo:
      'La visita prevista para el {fecha} en {inmuebleDireccion} ha quedado cancelada o modificada.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },

  // =======================================================================
  // CONTRATOS
  // =======================================================================
  'contrato.proxima_finalizacion': {
    id: 'contrato.proxima_finalizacion',
    asunto: 'Próxima finalización de contrato — {inmuebleDireccion}',
    cuerpo:
      'El contrato vigente de {inmuebleDireccion} tiene prevista su finalización el {fechaFinContrato}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'SCHEDULED',
    antelacionHoras: 720, // 30 días
  },
  'contrato.finalizacion': {
    id: 'contrato.finalizacion',
    asunto: 'Finalización de contrato — {inmuebleDireccion}',
    cuerpo:
      'El contrato de {inmuebleDireccion} finaliza el {fechaFinContrato}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },

  // =======================================================================
  // INCIDENCIAS
  // =======================================================================
  'incidencia.nueva': {
    id: 'incidencia.nueva',
    asunto: 'Nueva incidencia registrada — {inmuebleDireccion}',
    cuerpo:
      'Se ha registrado la incidencia «{titulo}» ({categoria}) con prioridad {prioridad}.',
    canalesPermitidos: ['EMAIL', 'INAPP', 'WEBHOOK'],
    inicio: 'IMMEDIATE',
  },
  'incidencia.cambio_estado': {
    id: 'incidencia.cambio_estado',
    asunto: 'Incidencia actualizada — {inmuebleDireccion}',
    cuerpo:
      'La incidencia «{titulo}» ha cambiado de estado: {estadoAnterior} → {estado}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },
  'incidencia.resuelta': {
    id: 'incidencia.resuelta',
    asunto: 'Incidencia resuelta — {inmuebleDireccion}',
    cuerpo:
      'La incidencia «{titulo}» en {inmuebleDireccion} se ha resuelto.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },

  // =======================================================================
  // SEGUROS
  // =======================================================================
  'seguro.renovacion_poliza': {
    id: 'seguro.renovacion_poliza',
    asunto: 'Renovación de póliza — {aseguradora}',
    cuerpo:
      'La póliza {numeroPoliza} de {aseguradora} está próxima a su renovación el {fechaVencimiento}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'SCHEDULED',
    antelacionHoras: 720, // 30 días
  },
  'seguro.siniestro_pendiente': {
    id: 'seguro.siniestro_pendiente',
    asunto: 'Siniestro pendiente — expediente {numeroSiniestro}',
    cuerpo:
      'El siniestro con expediente {numeroSiniestro} permanece pendiente (estado {estado}).',
    canalesPermitidos: ['EMAIL', 'WEBHOOK'],
    inicio: 'IMMEDIATE',
  },

  // =======================================================================
  // FINANCIACIÓN (GAP 4) — reutiliza el dispatcher de GAP 1
  // =======================================================================
  'financiacion.creada': {
    id: 'financiacion.creada',
    asunto: 'Financiación registrada — {entidadNombre}',
    cuerpo:
      'Se ha registrado la financiación de {entidadNombre} por {importeFinanciado} (LTV {ltv}%).', 
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },
  'financiacion.modificada': {
    id: 'financiacion.modificada',
    asunto: 'Financiación actualizada — {entidadNombre}',
    cuerpo:
      'La financiación de {entidadNombre} ha sido modificada. Saldo pendiente: {saldoPendiente}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },
  'financiacion.amortizacion_anticipada': {
    id: 'financiacion.amortizacion_anticipada',
    asunto: 'Amortización anticipada registrada — {entidadNombre}',
    cuerpo:
      'Se ha registrado una amortización anticipada de {importeAmortizado} en la financiación de {entidadNombre}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },
  'financiacion.cancelada': {
    id: 'financiacion.cancelada',
    asunto: 'Financiación cancelada — {entidadNombre}',
    cuerpo:
      'La financiación de {entidadNombre} ha quedado cancelada.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },

  // =======================================================================
  // CONCILIACIÓN BANCARIA (GAP 6) — reutiliza dispatcher GAP 1
  // =======================================================================
  'conciliacion.importacion_nueva': {
    id: 'conciliacion.importacion_nueva',
    asunto: 'Nueva importación bancaria — {origen} {totalMovimientos} movimientos',
    cuerpo:
      'Se ha importado un extracto {origen} con {totalMovimientos} movimientos ({nuevos} nuevos, {duplicados} duplicados) para la cuenta {cuentaIban}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },
  'conciliacion.pendientes': {
    id: 'conciliacion.pendientes',
    asunto: 'Conciliaciones pendientes — {pendientes} movimientos por revisar',
    cuerpo:
      'Quedan {pendientes} movimientos bancarios pendientes de conciliación ({altaConfianza} alta confianza, {mediaConfianza} media, {bajaConfianza} baja, {sinMatch} sin match).',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },
  'conciliacion.discrepancia': {
    id: 'conciliacion.discrepancia',
    asunto: 'Discrepancia en conciliación — movimiento {movimientoId}',
    cuerpo:
      'El movimiento {movimientoId} ({importeMovimiento}€) presenta discrepancia con {tipoCandidato} {candidatoId} ({importeCandidato}€) diff {diferencia}€.',
    canalesPermitidos: ['EMAIL', 'INAPP', 'WEBHOOK'],
    inicio: 'IMMEDIATE',
  },
  'conciliacion.error_importacion': {
    id: 'conciliacion.error_importacion',
    asunto: 'Error en importación bancaria — {origen}',
    cuerpo:
      'La importación {origen} ha generado errores: {errores}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },
  'conciliacion.realizada': {
    id: 'conciliacion.realizada',
    asunto: 'Conciliación realizada — {movimientoId} → {candidatoId}',
    cuerpo:
      'El movimiento {movimientoId} se ha conciliado con {tipoCandidato} {candidatoId} con confianza {confianza} ({puntuacion}pts).',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },

  // =======================================================================
  // FACTURACIÓN (GAP 7) — reutiliza dispatcher GAP 1; NO crea otro dispatcher
  // =======================================================================
  'facturacion.emitida': {
    id: 'facturacion.emitida',
    asunto: 'Factura emitida — {numeroFactura}',
    cuerpo:
      'Se ha emitido la factura {numeroFactura} por importe de {importeTotal}. Estado: {estadoFactura}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },
  'facturacion.error_remision': {
    id: 'facturacion.error_remision',
    asunto: 'Error en la remisión VERI*FACTU — {numeroFactura}',
    cuerpo:
      'La remisión VERI*FACTU de la factura {numeroFactura} ha fallado con código {codigoError}: {descripcionError}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },
  'facturacion.aceptada': {
    id: 'facturacion.aceptada',
    asunto: 'Factura aceptada por la AEAT — {numeroFactura}',
    cuerpo:
      'La factura {numeroFactura} consta como aceptada. Código seguro de verificación: {csv}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },
  'facturacion.rechazada': {
    id: 'facturacion.rechazada',
    asunto: 'Factura rechazada por la AEAT — {numeroFactura}',
    cuerpo:
      'La factura {numeroFactura} ha sido rechazada con código {codigoError}: {descripcionError}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },
  'facturacion.rectificada': {
    id: 'facturacion.rectificada',
    asunto: 'Factura rectificativa emitida — {numeroFactura}',
    cuerpo:
      'Se ha emitido una factura rectificativa {numeroFactura} que corrige la factura {facturaOriginal}. Motivo: {motivo}.',
    canalesPermitidos: ['EMAIL', 'INAPP'],
    inicio: 'IMMEDIATE',
  },
};

/** Lista plana de claves de plantilla registradas. */
export const CLAVES_PLANTILLAS = Object.keys(PLANTILLAS);
