/**
 * GAP 8 — SERVICIO ORQUESTADOR DE FACTURA ELECTRÓNICA B2B.
 * Flujo: Factura (GAP 7) → FacturaElectronicaB2B → AdaptadorIntercambio → Plataforma.
 *
 * Funciones PURAS sobre arrays en memoria (la persistencia la aporta la capa
 * Firestore de src/lib/firebase.ts). Cada operación devuelve el documento
 * actualizado y, cuando procede, el evento de notificación GAP 1 asociado.
 *
 * SEGURIDAD:
 * - Una factura con errores bloqueantes NO puede pasar a intercambio.
 * - Una factura ya enviada NO puede modificarse silenciosamente.
 * - Los reintentos usan la misma idempotencyKey: nunca duplican envíos.
 */

import { Factura } from '../types/facturacion';
import type { EventoNotificacion } from '../types/notificaciones';
import {
  AdaptadorIntercambioB2B,
  EstadoFacturaB2B,
  FacturaElectronicaB2B,
  ValidacionFacturaB2B,
} from '../types/facturaElectronicaB2B';
import {
  aplicarTransicionB2B,
  generarFacturaElectronicaB2B,
  idEventoB2B,
  modificacionSilenciosaProhibida,
  OpcionesGeneracionB2B,
  OpcionesTransicionB2B,
  ResultadoB2B,
  validarFacturaParaB2B,
} from './facturaElectronicaB2BEngine';
import { generarDocumentoB2B } from './generadores/indexB2B';
import { crearEventoNotificacionB2B, TipoEventoB2B } from './notificacionesB2B';

export interface ResultadoOperacionB2B {
  ok: boolean;
  feb?: FacturaElectronicaB2B;
  error?: string;
  eventoNotificacion?: EventoNotificacion;
  simulado?: boolean;
  advertencias?: string[];
}

// ---------------------------------------------------------------------------
// Validación previa (FASE 5): bloqueante vs advertencia; duplicidad
// ---------------------------------------------------------------------------

export interface ResultadoValidacionB2B extends ValidacionFacturaB2B {
  duplicidadDetectada: boolean;
}

/**
 * Valida la factura para intercambio B2B incluyendo la comprobación de
 * duplicidad contra representaciones ya existentes (misma factura+formato).
 */
export function validarParaIntercambioB2B(
  factura: Factura,
  previas: FacturaElectronicaB2B[],
  formato: FacturaElectronicaB2B['formato']
): ResultadoValidacionB2B {
  const base = validarFacturaParaB2B(factura);
  const duplicidadDetectada = previas.some(
    (p) => p.facturaId === factura.id && p.formato === formato && !['ANULADA', 'RECTIFICADA'].includes(p.estado)
  );
  const erroresBloqueantes = [...base.erroresBloqueantes];
  if (duplicidadDetectada) {
    erroresBloqueantes.push('Duplicidad: ya existe una representación electrónica activa para esta factura y formato.');
  }
  return {
    valido: erroresBloqueantes.length === 0,
    erroresBloqueantes,
    advertencias: base.advertencias,
    duplicidadDetectada,
  };
}

// ---------------------------------------------------------------------------
// Generación (FASE 4) con evento de notificación asociado
// ---------------------------------------------------------------------------

export function generarConEvento(
  factura: Factura,
  previas: FacturaElectronicaB2B[],
  opts: OpcionesGeneracionB2B
): ResultadoOperacionB2B {
  const validacion = validarParaIntercambioB2B(factura, previas, opts.formato);
  const res: ResultadoB2B<FacturaElectronicaB2B> = generarFacturaElectronicaB2B(factura, previas, opts);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, feb: res.valor, advertencias: validacion.advertencias };
}

// ---------------------------------------------------------------------------
// Preparación de envío (FASE 7): adaptador etiquetado; nunca se finge envío real
// ---------------------------------------------------------------------------

export function prepararEnvioB2B(
  feb: FacturaElectronicaB2B,
  adaptador: AdaptadorIntercambioB2B,
  usuario: string,
  fecha?: string
): ResultadoOperacionB2B {
  if (feb.estado !== 'GENERADA' && feb.estado !== 'VALIDADA' && feb.estado !== 'RECHAZADA') {
    return { ok: false, error: `No procede preparar el envío desde el estado ${feb.estado}.` };
  }
  const doc = generarDocumentoB2B(feb);
  const transporte = adaptador.enviar(feb, doc.contenido);
  const fechaOp = fecha || new Date().toISOString();

  if (!transporte.ok) {
    const febError: FacturaElectronicaB2B = {
      ...feb,
      updatedAt: fechaOp,
      historial: [
        ...feb.historial,
        {
          id: idEventoB2B(feb.id, 'ERROR', feb.estado, fechaOp),
          fecha: fechaOp,
          usuario,
          operacion: 'ERROR',
          estadoAnterior: feb.estado,
          estadoNuevo: feb.estado,
          resultado: 'ERROR',
          error: transporte.error,
        },
      ],
    };
    return {
      ok: false,
      feb: febError,
      error: transporte.error,
      simulado: transporte.simulado,
      eventoNotificacion: crearEventoNotificacionB2B(febError, 'facturacion.b2b_error', {
        descripcionError: transporte.error || 'Error de transporte',
      }),
    };
  }

  // La máquina exige GENERADA → VALIDADA → DISPUESTA_PARA_ENVIO: la preparación
  // incluye la validación implícita (queda trazada) antes de disponer el envío.
  let base: FacturaElectronicaB2B = feb;
  if (feb.estado === 'GENERADA') {
    const validacion = aplicarTransicionB2B(feb, 'VALIDADA', {
      usuario,
      operacion: 'VALIDACION',
      fecha: fechaOp,
    });
    if (!validacion.ok) return { ok: false, error: validacion.error };
    base = validacion.valor;
  }

  const transicion = aplicarTransicionB2B(base, 'DISPUESTA_PARA_ENVIO', {
    usuario,
    operacion: 'PREPARACION_ENVIO',
    fecha: fechaOp,
  });
  if (!transicion.ok) return { ok: false, error: transicion.error };

  return {
    ok: true,
    feb: transicion.valor,
    simulado: transporte.simulado,
    eventoNotificacion: crearEventoNotificacionB2B(transicion.valor, 'facturacion.b2b_preparada'),
  };
}

// ---------------------------------------------------------------------------
// Registro de estados de intercambio (recepción/aceptación/rechazo/pago)
// ---------------------------------------------------------------------------

const EVENTO_POR_ESTADO: Partial<Record<EstadoFacturaB2B, TipoEventoB2B>> = {
  ENVIADA: 'facturacion.b2b_enviada',
  RECIBIDA: 'facturacion.b2b_recibida',
  ACEPTADA: 'facturacion.b2b_aceptada',
  RECHAZADA: 'facturacion.b2b_rechazada',
  PAGADA: 'facturacion.b2b_pago',
  PARCIALMENTE_PAGADA: 'facturacion.b2b_pago',
  ANULADA: 'facturacion.b2b_incidencia',
  RECTIFICADA: 'facturacion.b2b_incidencia',
};

const OPERACION_POR_ESTADO: Record<string, OpcionesTransicionB2B['operacion']> = {
  GENERADA: 'GENERACION',
  VALIDADA: 'VALIDACION',
  DISPUESTA_PARA_ENVIO: 'PREPARACION_ENVIO',
  ENVIADA: 'ENVIO',
  RECIBIDA: 'RECEPCION',
  ACEPTADA: 'ACEPTACION',
  RECHAZADA: 'RECHAZO',
  PAGADA: 'PAGO',
  PARCIALMENTE_PAGADA: 'PAGO_PARCIAL',
  ANULADA: 'ANULACION',
  RECTIFICADA: 'RECTIFICACION',
};

/**
 * Registra un estado del intercambio B2B. Rechaza modificaciones silenciosas
 * de facturas ya enviadas y transiciones ilegales; emite notificación GAP 1.
 */
export function registrarEstadoIntercambioB2B(
  feb: FacturaElectronicaB2B,
  estadoNuevo: EstadoFacturaB2B,
  usuario: string,
  opts?: { fecha?: string; externalId?: string; motivo?: string; importePagado?: number }
): ResultadoOperacionB2B {
  if (modificacionSilenciosaProhibida(feb, estadoNuevo)) {
    return {
      ok: false,
      error: 'Modificación silenciosa prohibida: una factura ya enviada solo puede avanzar a recepción, pago, anulación o rectificación.',
    };
  }

  const transicion = aplicarTransicionB2B(feb, estadoNuevo, {
    usuario,
    operacion: OPERACION_POR_ESTADO[estadoNuevo] || 'ERROR',
    fecha: opts?.fecha,
    externalId: opts?.externalId,
  });
  if (!transicion.ok) return { ok: false, error: transicion.error };

  let febFinal = transicion.valor;
  if ((estadoNuevo === 'PAGADA' || estadoNuevo === 'PARCIALMENTE_PAGADA') && typeof opts?.importePagado === 'number') {
    febFinal = {
      ...febFinal,
      informacionPago: {
        ...febFinal.informacionPago,
        estadoPago: estadoNuevo === 'PAGADA' ? 'PAGADA' : 'PARCIALMENTE_PAGADA',
        importePagado: opts.importePagado,
        fechaUltimoPago: (opts.fecha || new Date().toISOString()).slice(0, 10),
      },
    };
  }

  const tipoEvento = EVENTO_POR_ESTADO[estadoNuevo];
  const evento = tipoEvento
    ? crearEventoNotificacionB2B(febFinal, tipoEvento, opts?.motivo ? { motivo: opts.motivo } : undefined)
    : undefined;

  return { ok: true, feb: febFinal, eventoNotificacion: evento };
}

// ---------------------------------------------------------------------------
// Reintento idempotente (FASE 10)
// ---------------------------------------------------------------------------

export function reintentarEnvioB2B(
  feb: FacturaElectronicaB2B,
  adaptador: AdaptadorIntercambioB2B,
  usuario: string,
  fecha?: string
): ResultadoOperacionB2B {
  if (!['DISPUESTA_PARA_ENVIO', 'RECHAZADA', 'VALIDADA', 'GENERADA'].includes(feb.estado)) {
    return { ok: false, error: `Reintento no procedente desde el estado ${feb.estado}.` };
  }
  const doc = generarDocumentoB2B(feb);
  // Idempotencia: mismo idempotencyKey; el adaptador decide si retransmite o no.
  const transporte = adaptador.reintentar(feb, doc.contenido);
  const fechaOp = fecha || new Date().toISOString();

  if (!transporte.ok) {
    return {
      ok: false,
      feb,
      error: transporte.error,
      simulado: transporte.simulado,
      eventoNotificacion: crearEventoNotificacionB2B(feb, 'facturacion.b2b_error', {
        descripcionError: transporte.error || 'Error en reintento',
      }),
    };
  }

  // Ya dispuesta: el reintento solo traza la operación (mismo estado, misma clave).
  if (feb.estado === 'DISPUESTA_PARA_ENVIO') {
    const eventoId = idEventoB2B(feb.id, 'REINTENTO', feb.estado, fechaOp);
    const yaTrazado = feb.historial.some((e) => e.id === eventoId);
    const febTrazada: FacturaElectronicaB2B = yaTrazado
      ? feb
      : {
          ...feb,
          updatedAt: fechaOp,
          historial: [
            ...feb.historial,
            {
              id: eventoId,
              fecha: fechaOp,
              usuario,
              operacion: 'REINTENTO',
              estadoAnterior: feb.estado,
              estadoNuevo: feb.estado,
              resultado: 'OK',
            },
          ],
        };
    return {
      ok: true,
      feb: febTrazada,
      simulado: transporte.simulado,
      eventoNotificacion: crearEventoNotificacionB2B(febTrazada, 'facturacion.b2b_preparada'),
    };
  }

  // Desde GENERADA/VALIDADA/RECHAZADA: vuelve a DISPUESTA_PARA_ENVIO (con validación implícita).
  let base: FacturaElectronicaB2B = feb;
  if (feb.estado === 'GENERADA') {
    const validacion = aplicarTransicionB2B(feb, 'VALIDADA', { usuario, operacion: 'VALIDACION', fecha: fechaOp });
    if (!validacion.ok) return { ok: false, error: validacion.error };
    base = validacion.valor;
  }
  const transicion = aplicarTransicionB2B(base, 'DISPUESTA_PARA_ENVIO', {
    usuario,
    operacion: 'REINTENTO',
    fecha: fechaOp,
  });
  if (!transicion.ok) return { ok: false, error: transicion.error };
  return {
    ok: true,
    feb: transicion.valor,
    simulado: transporte.simulado,
    eventoNotificacion: crearEventoNotificacionB2B(transicion.valor, 'facturacion.b2b_preparada'),
  };
}

/** Descarga determinista del documento en el formato de la representación. */
export function obtenerDocumentoB2B(feb: FacturaElectronicaB2B) {
  return generarDocumentoB2B(feb);
}
