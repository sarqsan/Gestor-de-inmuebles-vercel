/**
 * BLOQUE C — Eventos de recobro hacia GAP 1 (notificaciones transaccionales).
 *
 * Este módulo NO crea otro sistema de envío: fabrica eventos tipados y ofrece
 * `publicarEventoMorosidad()`, que registra en `audit_logs` (canal canónico de
 * auditoría) y, si hay contexto de dispatcher, delega el envío en GAP 1.
 *
 * Principio duro (contrato de Arenas §5.6): mientras el dispatcher GAP 1 no tenga
 * un transporte real configurado, NINGUNA comunicación se marca como «enviada».
 * El resultado efectivo es `PREPARADA` / `PENDIENTE_ENVIO` / `DEPENDENCIA_EXTERNA`
 * según devuelva el dispatcher. El registro de la comunicación es real (documento
 * en la colección `notificaciones` con la id idempotencia canónica), pero la
 * entrega NO se afirma sin confirmación del canal.
 */

import type {
  ComunicacionExpediente,
  ExpedienteMorosidad,
  PiezaDeuda,
} from '../../types/morosidad';

/** Escritor de auditoría inyectable (en la app canónica: `registrarAuditoriaFirestore`). */
export type AuditWriter = (
  accion: string,
  descripcion: string,
  detalles: Record<string, unknown>,
) => void | Promise<void>;

export type EventoMorosidad =
  | 'recordatorio.inicial'
  | 'requerimiento.pago'
  | 'requerimiento.fehaciente'
  | 'pago.parcial'
  | 'compromiso.alcanzado'
  | 'compromiso.incumplido'
  | 'escalado.aseguradora'
  | 'escalado.juridico'
  | 'expediente.cerrado_pago'
  | 'expediente.registro_pagos';

/** Clave de plantilla GAP 1 por evento de recobro. */
export const TIPO_EVENTO_MOROSIDAD: Record<EventoMorosidad, string> = {
  'recordatorio.inicial': 'morosidad.primer_recordatorio',
  'requerimiento.pago': 'morosidad.requerimiento_pago',
  'requerimiento.fehaciente': 'morosidad.requerimiento_fehaciente',
  'pago.parcial': 'morosidad.aviso_pago_parcial',
  'compromiso.alcanzado': 'morosidad.compromiso_alcanzado',
  'compromiso.incumplido': 'morosidad.compromiso_incumplido',
  'escalado.aseguradora': 'morosidad.escalado_aseguradora',
  'escalado.juridico': 'morosidad.escalado_juridico',
  'expediente.cerrado_pago': 'morosidad.cierre_por_pago',
  'expediente.registro_pagos': 'morosidad.registro_pagos',
};

/** Paso de política → evento de recobro (el pre-recobro reutiliza la familia `cobro.*`). */
export const EVENTO_POR_PASO: Record<string, EventoMorosidad> = {
  'D+3': 'recordatorio.inicial',
  'D+10': 'requerimiento.pago',
  'D+20': 'requerimiento.fehaciente',
  'D+30': 'escalado.aseguradora',
};

export interface EventoNotificacionMorosidad {
  id: string;
  evento: EventoMorosidad;
  fecha: string; // ISO
  expedienteId: string;
  propietarioId: string;
  inmuebleId: string;
  contratoId: string;
  /** Cobro canónico asociado (tramo). Opcional en escalados de expediente. */
  cobroId?: string;
  piezaDeudaId?: string;
  /** Destino preferente del mensaje. */
  destinatarioTipo: 'INQUILINO' | 'PROPIETARIO' | 'ADMINISTRACION' | 'AVALISTA' | 'CODEUDOR';
  titulo: string;
  mensaje: string;
  importePendiente: number;
  diasRetraso: number;
  periodoMesAnio?: string;
  fechaVencimiento?: string;
  nombreDestinatario?: string;
  aseguradoraNombre?: string;
  actorNombre?: string;
  /** true si NO existe contacto del destinatario: no se puede afirmar envío. */
  sinContacto: boolean;
}

function redondear2(n: number): number {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function importeTexto(n: number): string {
  return `${redondear2(n).toFixed(2).replace('.', ',')} €`;
}

export interface FabricaEventoParams {
  expediente: Pick<
    ExpedienteMorosidad,
    'id' | 'propietarioId' | 'inmuebleId' | 'inmuebleDireccion' | 'contratoId' | 'saldoPendiente' | 'diasRetrasoActual' | 'aseguradora'
  >;
  pieza?: Pick<PiezaDeuda, 'id' | 'cobroId' | 'periodoMesAnio' | 'nombreMes' | 'fechaVencimiento' | 'importeReclamado' | 'diasRetraso'>;
  evento: EventoMorosidad;
  destinatarioTipo: EventoNotificacionMorosidad['destinatarioTipo'];
  nombreDestinatario?: string;
  contactoDestinatario?: string | null;
  actorNombre?: string;
  observaciones?: string;
}

/**
 * Fabrica el evento. Determinista: los mismos insumos producen el mismo `id`,
 * de modo que repetir la operación no genera una comunicación nueva (FASE 17).
 */
export function construirEventoMorosidad(params: FabricaEventoParams): EventoNotificacionMorosidad {
  const { expediente, pieza, evento } = params;
  const importe = redondear2(pieza ? Number(pieza.importeReclamado) : Number(expediente.saldoPendiente || 0));
  const id = `evt_${evento.replace(/\./g, '_')}_${pieza ? pieza.cobroId : expediente.id}`;
  const direccion = expediente.inmuebleDireccion || 'el inmueble';
  const periodo = pieza?.nombreMes || pieza?.periodoMesAnio || 'el periodo reclamado';
  const dias = pieza ? Number(pieza.diasRetraso || 0) : Number(expediente.diasRetrasoActual || 0);

  const titulos: Record<EventoMorosidad, string> = {
    'recordatorio.inicial': `Recordatorio de pago — ${direccion}`,
    'requerimiento.pago': `Requerimiento de pago — ${direccion}`,
    'requerimiento.fehaciente': `Reclamación formal — ${direccion}`,
    'pago.parcial': `Pago parcial registrado — ${direccion}`,
    'compromiso.alcanzado': `Calendario de pagos acordado — ${direccion}`,
    'compromiso.incumplido': `Calendario de pagos incumplido — ${direccion}`,
    'escalado.aseguradora': `Expediente preparado para aseguradora — ${direccion}`,
    'escalado.juridico': `Expediente preparado para vía jurídica — ${direccion}`,
    'expediente.cerrado_pago': `Deuda saldada — ${direccion}`,
    'expediente.registro_pagos': `Pagos registrados en el expediente — ${direccion}`,
  };
  const cuerpos: Record<EventoMorosidad, string> = {
    'recordatorio.inicial': `Pendiente ${importeTexto(importe)} de ${periodo} (vencido el ${pieza?.fechaVencimiento || '—'}).`,
    'requerimiento.pago': `Se requiere el abono de ${importeTexto(importe)} de ${periodo}; ${dias} días de retraso.`,
    'requerimiento.fehaciente': `Reclamación formal de ${importeTexto(importe)} de ${periodo}. El ERP prepara el medio con constancia; el envío lo realiza la administración.`,
    'pago.parcial': `Pago parcial aplicado a ${periodo}. Saldo pendiente: ${importeTexto(importe)}.`,
    'compromiso.alcanzado': `Acordado calendario de pagos sobre ${importeTexto(importe)}. No sustituye a los recibos de cada mensualidad.`,
    'compromiso.incumplido': `Cuota vencida sin cobertura en la fuente de cobros. Saldo: ${importeTexto(importe)}.`,
    'escalado.aseguradora': `Expediente preparado para ${expediente.aseguradora?.aseguradoraNombre || 'la aseguradora'} (importe ${importeTexto(importe)}). Sin envío automático a terceros.`,
    'escalado.juridico': `Expediente preparado para derivación al letrado (importe ${importeTexto(importe)}). El ERP no presenta escritos ni se comunica con órganos judiciales.`,
    'expediente.cerrado_pago': `La deuda de ${periodo !== 'el periodo reclamado' ? periodo : 'los periodos reclamados'} figura íntegramente cobrada en la contabilidad. Expediente cerrado.`,
    'expediente.registro_pagos': params.observaciones || `Pagos registrados desde la fuente canónica de cobros.`,
  };

  return {
    id,
    evento,
    fecha: new Date().toISOString(),
    expedienteId: expediente.id,
    propietarioId: expediente.propietarioId,
    inmuebleId: expediente.inmuebleId,
    contratoId: expediente.contratoId,
    cobroId: pieza?.cobroId,
    piezaDeudaId: pieza?.id,
    destinatarioTipo: params.destinatarioTipo,
    titulo: titulos[evento],
    mensaje: cuerpos[evento],
    importePendiente: importe,
    diasRetraso: dias,
    periodoMesAnio: pieza?.periodoMesAnio,
    fechaVencimiento: pieza?.fechaVencimiento,
    nombreDestinatario: params.nombreDestinatario,
    aseguradoraNombre: expediente.aseguradora?.aseguradoraNombre,
    actorNombre: params.actorNombre,
    sinContacto: !params.contactoDestinatario,
  };
}

/** Datos de plantilla para el dispatcher GAP 1 (props de la plantilla registrada). */
export function datosPlantillaGAP1(
  e: EventoNotificacionMorosidad,
  opts: { destinatarioRegistro?: Record<string, string> } = {},
): Record<string, string | number | boolean | null> {
  return {
    destinatario: e.nombreDestinatario || '',
    inmuebleDireccion: e.titulo.replace(/^[^—]*—\s*/, ''),
    periodoMesAnio: e.periodoMesAnio || '',
    importePendiente: e.importePendiente,
    fechaHoy: e.fecha.slice(0, 10),
    fechaVencimiento: e.fechaVencimiento || '',
    diasRetraso: e.diasRetraso,
    aseguradoraNombre: e.aseguradoraNombre || '',
    titulo: e.titulo,
    mensaje: e.mensaje,
    expedienteId: e.expedienteId,
    destinatarioTipo: e.destinatarioTipo,
    ...(opts.destinatarioRegistro || {}),
  };
}

/**
 * Estado de la comunicación según el resultado real de GAP 1.
 * NUNCA 'ENVIADA' sin confirmación del canal (ver `mapearEstadoComunicacion`).
 */
export function estadoComunicacionDesdeDispatch(dispatch: {
  ok?: boolean;
  estado?: string;
  entregada?: boolean;
  duplicada?: boolean;
  error?: string;
}): ComunicacionExpediente['estado'] {
  if (dispatch.entregada === true && dispatch.estado === 'ENVIADA') return 'ENVIADA';
  if (dispatch.estado === 'PROGRAMADA') return 'PROGRAMADA';
  if (dispatch.duplicada) return 'ENVIADA';
  if (dispatch.ok === false && dispatch.error === 'canal_no_disponible') return 'DEPENDENCIA_EXTERNA';
  if (dispatch.ok === false) return 'PENDIENTE_ENVIO';
  return 'PREPARADA';
}
