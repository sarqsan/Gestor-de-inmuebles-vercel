/**
 * GAP 1 — Sistema Transaccional de Notificaciones y Automatizaciones.
 * ------------------------------------------------------------------
 * Modelo tipado del bloque de notificaciones (autónomo, sin imports runtime).
 * Diseñado para que Arena A lo integre selectivamente sin rehacer la arquitectura.
 *
 * IMPORTANTE:
 * - NUNCA se almacenan credenciales ni secretos en Firestore. Los secretos de
 *   proveedores (SMTP/Resend/SendGrid/…) viven SOLO en variables de entorno del
 *   backend (server.ts) o en un secret manager.
 * - Estados canónicos: PENDIENTE | PROGRAMADA | ENVIANDO | ENVIADA | FALLIDA |
 *   CANCELADA.
 * - La idempotencia se garantiza con `idempotencyKey` (hash determinista del
 *   evento) y un ID de notificación determinista derivado del evento.
 */

// ---------------------------------------------------------------------------
// Estados y canales
// ---------------------------------------------------------------------------

export type EstadoNotificacion =
  | 'PENDIENTE'
  | 'PROGRAMADA'
  | 'ENVIANDO'
  | 'ENVIADA'
  | 'FALLIDA'
  | 'CANCELADA';

export type CanalNotificacion = 'EMAIL' | 'INAPP' | 'WEBHOOK' | 'WHATSAPP';

/** Resultado de un intento de entrega por un proveedor. */
export interface ResultadoEntrega {
  ok: boolean;
  provider: string;
  externalId?: string;
  error?: string;
  enviadoEn?: string;
}

// ---------------------------------------------------------------------------
// Contexto de permisos / RBAC (resuelto por el backend, nunca desde el cliente)
// ---------------------------------------------------------------------------

export interface ContextoAutorizacion {
  /** Perfil autorizado del que dispara el envío. null ⇒ anónimo/denegado. */
  perfil: 'ADMINISTRADOR' | 'PROPIETARIO' | 'PROFESIONAL' | null;
  /** UID de Firebase Auth cuando aplica. */
  uid?: string;
  /** Vinculaciones del usuario autorizado (aislamiento). */
  propietarioId?: string;
  profesionalId?: string;
  inmuebleIds?: string[];
}

// ---------------------------------------------------------------------------
// Evento de negocio (fuente de la notificación)
// ---------------------------------------------------------------------------

export type OrigenNotificacion =
  | 'COBRO'
  | 'AGENDA'
  | 'CONTRATO'
  | 'INCIDENCIA'
  | 'SEGURO'
  | 'FINANCIACION'
  | 'CONCILIACION_BANCARIA'
  | 'FACTURACION'
  | 'SISTEMA'
  | 'PRUEBA'
  // BLOQUE B (integración canónica 2026-09-20): liquidaciones, pagos, SEPA, incidencias de pago
  | 'TESORERIA'
  // BLOQUE C (2026-09-20): morosidad, recobro y expediente de recuperación.
  // ADITIVO: reutiliza el dispatcher GAP1; no se crea un segundo sistema de
  // notificaciones (plantillas y canales canónicos, id idempotencia canónica).
  | 'MOROSIDAD';

export interface EventoNotificacion {
  origen: OrigenNotificacion;
  /** Clave de plantilla, p. ej. 'cobro.proximo_vencimiento'. */
  tipoEvento: string;
  entidadId: string;
  /** Clave que toma la decisión de envío: disparar el mismo suceso 2 veces no duplica. */
  idempotencyKey: string;
  inmuebleId?: string;
  propietarioId?: string;
  /** Canal preferente (respetado si el proveedor está disponible). */
  canal?: CanalNotificacion;
  /** Datos de plantilla (props dinámicos). */
  datos?: Record<string, string | number | boolean | null>;
  /** Destinatario explícito. */
  destinatario?: DestinatarioNotificacion;
  programarPara?: string; // ISO datetime (programada) o ausente (inmediata)
}

export interface DestinatarioNotificacion {
  email?: string;
  /** ID de usuario de plataforma para la bandeja interna (INAPP). */
  usuarioId?: string;
  /** Nombre legible para personalizar la plantilla. */
  nombre?: string;
  telefono?: string; // canal futuro WhatsApp
  webhookUrl?: string;
}

// ---------------------------------------------------------------------------
// Notificación (documento persistible)
// ---------------------------------------------------------------------------

export interface Notificacion {
  id: string; // determinista: ver idDeNotificacion()
  idempotencyKey: string; // único por evento → anti-duplicados
  tipo: string; // clave de plantilla, p. ej. 'cobro.proximo_vencimiento'
  origen: OrigenNotificacion;
  canal: CanalNotificacion;
  destinatario: DestinatarioNotificacion;
  asunto: string; // asunto resuelto (email)
  plantilla: string; // nombre de plantilla registrada
  datos: Record<string, string | number | boolean | null>; // props resueltas
  entidadId: string;
  inmuebleId?: string;
  propietarioId?: string;
  fechaCreacion: string;
  programarPara?: string;
  enviadoEn?: string;
  estado: EstadoNotificacion;
  intentos: number;
  error?: string;
  provider?: string; // proveedor que intentó la entrega
  externalId?: string; // id externo del proveedor (p. ej. messageId)
  audit: {
    creadoPor?: string;
    creadoPorPerfil?: string;
    eventos: NotificacionAuditEvento[];
  };
}

export interface NotificacionAuditEvento {
  fecha: string;
  accion: string;
  detalle?: string;
  actor?: string;
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

export type InicioProgramador =
  | 'IMMEDIATE'
  | 'SCHEDULED'
  | 'RECURRING';

export interface PlantillaNotificacion {
  id: string; // p. ej. 'cobro.proximo_vencimiento'
  asunto: string; // permite props {propiedad}
  cuerpo: string;
  canalesPermitidos: CanalNotificacion[];
  inicio?: InicioProgramador;
  /** Horas de antelación por defecto para programar (0 = inmediata). */
  antelacionHoras?: number;
}

// ---------------------------------------------------------------------------
// Datos de entrada del endpoint
// ---------------------------------------------------------------------------

export interface EnviarNotificacionPayload {
  origen: OrigenNotificacion;
  tipoEvento: string;
  entidadId: string;
  idempotencyKey?: string; // si falta se deriva del evento (ver idDeNotificacion)
  inmuebleId?: string;
  propietarioId?: string; // NO vinculante por solo (el backend valida contra contexto)
  canal?: CanalNotificacion;
  datos?: Record<string, string | number | boolean | null>;
  destinatario?: DestinatarioNotificacion;
  programarPara?: string;
}

export type ResultadoDispatch = EnviarNotificacionResponse;

export interface EnviarNotificacionResponse {
  ok: boolean;
  notificacion?: Notificacion;
  entregada?: boolean;
  estado?: EstadoNotificacion;
  canal?: CanalNotificacion;
  provider?: string;
  externalId?: string;
  duplicada?: boolean;
  error?: string;
  motivoDenegacion?: string;
}

// ---------------------------------------------------------------------------
// Helpers de identidad determinista (anti-duplicados)
// ---------------------------------------------------------------------------

/** Normaliza un string para construir claves estables (sin el timestamp del evento). */
export function normalizarClave(parte: string): string {
  return (parte || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Clave de idempotencia determinista del evento. El mismo (origen, tipo,
 * entidad, punto de disparo) produce SIEMPRE la misma clave aunque el payload
 * incluyera datos diferentes (p. ej. reintento con fecha distinta).
 */
export function idempotenciaDeEvento(
  origen: OrigenNotificacion,
  tipoEvento: string,
  entidadId: string
): string {
  return `ev:${normalizarClave(origen)}:${normalizarClave(tipoEvento)}:${normalizarClave(entidadId)}`;
}

/** ID determinista de notificación derivado del evento. */
export function idDeNotificacion(idempotencyKey: string): string {
  return `not_${normalizarClave(idempotencyKey)}`;
}

/** Hash corto (FNV-1a) para separar por propietario en colecciones shardeadas si hiciera falta. */
export function hashCorto(texto: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
