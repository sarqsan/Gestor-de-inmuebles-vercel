/**
 * GAP7 — Capa de transporte/remisión VERI*FACTU (DESACOPLADA).
 * ---------------------------------------------------------------------------
 * SEPARA la GENERACIÓN del registro de facturación (motor puro) del TRANSPORTE
 * (remisión a la AEAT). Esta capa NO implementa comunicación real con la AEAT:
 *
 *   - NO hay endpoints inventados;
 *   - NO hay certificados/secretos en código ni en el modelo;
 *   - la conexión real queda EXPLÍCITAMENTE PENDIENTE (requiere certificado de
 *     representante TLS + URL/WSDL oficiales y credenciales de Sede fuera del
 *     cliente).
 *
 * Lo que SÍ se implementa (idempotencia y estados exigidos por el alcance):
 *   - identidad determinista del envío (idEnvioVerifactu);
 *   - cola de estados PENDIENTE → PREPARADO → ENVIANDO → (ACEPTADO |
 *     ACEPTADO_CON_ERRORES | RECHAZADO | ERROR) con REINTENTO;
 *   - máquina de reintentos que reutiliza la identidad del registro (nunca
 *     duplica por reintento);
 *   - tratamiento de errores: formato, validación, rechazo, indisponibilidad,
 *     timeout, respuesta duplicada.
 */

import type {
  EnvioVerifactu,
  EstadoEnvioVerifactu,
  RegistroFacturacion,
  ResultadoTransporteVerifactu,
  VerifactuTransport,
} from '../types/facturacion';
import { idEnvioVerifactu } from '../types/facturacion';

// ---------------------------------------------------------------------------
// Transporte NO OPERATIVO (sin conexión real) — nivel de abstracción previsto
// ---------------------------------------------------------------------------
//
// En producción, un transportador real (p. ej. `VerifactuTransportAeat`) se
// inyecta aquí con la URL/WSDL oficial y el certificado TLS de representante.
// El transporte real NO se implementa para no inventar integraciones con AEAT.
//

export class VerifactuTransportPendiente implements VerifactuTransport {
  readonly entorn0: 'sandbox' | 'produccion';
  readonly preparado = false;

  constructor(entorn0: 'sandbox' | 'produccion' = 'sandbox') {
    this.entorn0 = entorn0;
  }

  async enviar(_registro: RegistroFacturacion): Promise<ResultadoTransporteVerifactu> {
    return {
      ok: false,
      estado: 'ERROR',
      codigoError: 'INDISPONIBLE',
      descripcionError:
        'Conexión real con la AEAT no implementada (pendiente de certificado/URL oficiales). No se inventa endpoint.',
      respondidoEn: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Preparación y máquina de envío idempotente (válida para cualquier transport)
// ---------------------------------------------------------------------------

export function crearEnvioPendiente(
  registro: RegistroFacturacion,
  propietarioId: string
): EnvioVerifactu {
  const now = new Date().toISOString();
  const id = idEnvioVerifactu(registro.id);
  return {
    id,
    idempotencyKey: id, // identidad determinista: un mismo registro ⇒ un único envío
    propietarioId,
    registroFacturacionId: registro.id,
    modalidad: registro.modalidad,
    estado: 'PENDIENTE',
    intentos: 0,
    fechaCreacion: now,
    historial: [{ fecha: now, estado: 'PENDIENTE', detalle: 'Envío creado' }],
  };
}

/**
 * Transición de estados permitida para el envío. Devuelve el estado resultante
 * de aplicar `resultado` desde `estadoActual`, aplicando idempotencia:
 *  - una respuesta duplicada NO cambia el estado terminal;
 *  - un REINTENTO reutiliza la identidad del envío (no se crea otro).
 */
export function transicionEnvio(
  envio: EnvioVerifactu,
  resultado: ResultadoTransporteVerifactu
): EnvioVerifactu {
  const now = new Date().toISOString();
  const historial = [...envio.historial];

  // Idempotencia: si ya está en estado terminal aceptado/no cambia por duplicado.
  if (resultado.duplicada && (envio.estado === 'ACEPTADO' || envio.estado === 'ACEPTADO_CON_ERRORES')) {
    return { ...envio };
  }

  historial.push({
    fecha: now,
    estado: resultado.estado,
    detalle: resultado.descripcionError,
    codigoError: resultado.codigoError,
  });

  return {
    ...envio,
    estado: resultado.estado,
    intentos: resultado.estado === 'REINTENTO' ? envio.intentos + 1 : envio.intentos,
    codigoSeguroVerificacion: resultado.codigoSeguroVerificacion || envio.codigoSeguroVerificacion,
    codigoError: resultado.codigoError,
    descripcionError: resultado.descripcionError,
    acuseRecibo: resultado.acuse || envio.acuseRecibo,
    fechaRespuesta: resultado.respondidoEn || now,
    ultimoIntento: now,
    historial,
  };
}

/** Clasifica excepciones de transporte en el estado/código del alcance. */
export function clasificarErrorTransporte(err: unknown): ResultadoTransporteVerifactu {
  const mensaje = err instanceof Error ? err.message : String(err);
  const now = new Date().toISOString();
  const baja = mensaje.toLowerCase();

  if (baja.includes('timeout') || baja.includes('etimedout')) {
    return { ok: false, estado: 'ERROR', codigoError: 'TIMEOUT', descripcionError: mensaje, respondidoEn: now };
  }
  if (baja.includes('duplicad') || baja.includes('already')) {
    return { ok: false, estado: 'ERROR', codigoError: 'RESPUESTA_DUPLICADA', descripcionError: mensaje, duplicada: true, respondidoEn: now };
  }
  return { ok: false, estado: 'ERROR', codigoError: 'ERROR_INTERNO', descripcionError: mensaje, respondidoEn: now };
}

/**
 * Orquesta un intento de remisión con un transport inyectado, garantizando
 * idempotencia: un mismo registro produce siempre el mismo `envio.id` y, por
 * tanto, los reintentos reutilizan la identidad (no se duplica).
 */
export async function remitirRegistroConTransport(
  envio: EnvioVerifactu,
  registro: RegistroFacturacion,
  transport: VerifactuTransport
): Promise<EnvioVerifactu> {
  if (!transport.preparado) {
    return transicionEnvio(envio, {
      ok: false,
      estado: 'ERROR',
      codigoError: 'INDISPONIBLE',
      descripcionError: 'Transporte no preparado (conexión real pendiente).',
      respondidoEn: new Date().toISOString(),
    });
  }

  const enEnviando = transicionEnvio(envio, {
    ok: false,
    estado: 'PREPARADO',
    respondidoEn: new Date().toISOString(),
  });

  let resultado: ResultadoTransporteVerifactu;
  try {
    resultado = await transport.enviar(registro);
  } catch (err) {
    resultado = clasificarErrorTransporte(err);
  }

  return transicionEnvio(enEnviando, resultado);
}

export const ESTADO_ENVIO_TERMINAL: ReadonlySet<EstadoEnvioVerifactu> = new Set([
  'ACEPTADO',
  'ACEPTADO_CON_ERRORES',
  'RECHAZADO',
]);

export const ESTADO_ENVIO_ERROR: ReadonlySet<EstadoEnvioVerifactu> = new Set(['ERROR']);
