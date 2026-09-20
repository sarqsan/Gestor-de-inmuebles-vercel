/**
 * GAP 1 — Resolución de plantillas, canales y programación.
 * --------------------------------------------------------
 * Lógica PURA (sin I/O). Encapsula:
 *   - validación de payload;
 *   - selección de plantilla;
 *   - selección de canal (según disponibilidad/config de entorno);
 *   - resolución de {props} en asunto/cuerpo;
 *   - política de programación (inmediata / programada);
 *   - RBAC e información de contexto derivadas.
 *
 * Opcionalmente NO debe filtrar en el frontend: las comprobaciones de RBAC se
 * ejecutan SIEMPRE en el backend (ver dispatcher y endpoint).
 */

import type {
  CanalNotificacion,
  DestinatarioNotificacion,
  EnviarNotificacionPayload,
  EventoNotificacion,
  PlantillaNotificacion,
  ResultadoEntrega,
} from '../types/notificaciones';

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

export interface ResultadoValidacion {
  valido: boolean;
  errores: string[];
}

export interface CapacidadesCanales {
  email: boolean;
  inapp: boolean;
  webhook: boolean;
  whatsapp: boolean;
}

/** Valida un payload de envío contra el contrato del modelo. */
export function validarPayload(payload: EnviarNotificacionPayload): ResultadoValidacion {
  const errores: string[] = [];

  if (!payload || typeof payload !== 'object') {
    return { valido: false, errores: ['payloadAusente'] };
  }
  if (!payload.origen || typeof payload.origen !== 'string') errores.push('origenRequerido');
  if (!payload.tipoEvento || typeof payload.tipoEvento !== 'string') errores.push('tipoEventoRequerido');
  if (!payload.entidadId || typeof payload.entidadId !== 'string') errores.push('entidadIdRequerido');

  if ('propietarioId' in payload && payload.propietarioId != null) {
    // El backend (no el cliente) decidirá si el actor puede escribir a ese propietario.
    if (typeof payload.propietarioId !== 'string' || payload.propietarioId.length > 128) {
      errores.push('propietarioIdInvalido');
    }
  }
  if ('inmuebleId' in payload && payload.inmuebleId != null) {
    if (typeof payload.inmuebleId !== 'string' || payload.inmuebleId.length > 128) {
      errores.push('inmuebleIdInvalido');
    }
  }

  const dest = payload.destinatario;
  if (dest != null && typeof dest === 'object') {
    if (dest.email != null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(dest.email))) {
      errores.push('emailInvalido');
    }
    if (dest.usuarioId == null && dest.email == null) {
      errores.push('destinatarioSinCanalDeContacto');
    }
  } else if (dest != null) {
    errores.push('destinatarioInvalido');
  }

  return { valido: errores.length === 0, errores };
}

// ---------------------------------------------------------------------------
// Selección de plantilla
// ---------------------------------------------------------------------------

export function seleccionarPlantilla(
  tipoEvento: string,
  registro: Record<string, PlantillaNotificacion>
): PlantillaNotificacion | null {
  if (!registro) return null;
  const plantilla = registro[tipoEvento];
  return plantilla ? plantilla : null;
}

// ---------------------------------------------------------------------------
// Selección de canal
// ---------------------------------------------------------------------------

/**
 * Orden de preferencia: EMAIL → INAPP → WEBHOOK → WHATSAPP(futuro).
 * Devuelve el primer canal permitido por la plantilla y disponible en el
 * entorno (los canales no disponibles se saltan sin fallar el dispatch).
 */
export function seleccionarCanal(
  plantilla: PlantillaNotificacion,
  preferido: CanalNotificacion | undefined,
  capacidades: CapacidadesCanales
): CanalNotificacion | null {
  const ranking: CanalNotificacion[] = ['EMAIL', 'INAPP', 'WEBHOOK', 'WHATSAPP'];
  const opciones: CanalNotificacion[] = [];

  if (preferido) opciones.push(preferido);
  for (const canal of ranking) {
    if (!opciones.includes(canal)) opciones.push(canal);
  }

  for (const canal of opciones) {
    if (!plantilla.canalesPermitidos.includes(canal)) continue;
    const disponible =
      (canal === 'EMAIL' && capacidades.email) ||
      (canal === 'INAPP' && capacidades.inapp) ||
      (canal === 'WEBHOOK' && capacidades.webhook) ||
      (canal === 'WHATSAPP' && capacidades.whatsapp);
    if (disponible) return canal;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Resolución de plantillas (props dinámicas)
// ---------------------------------------------------------------------------

/** Reemplaza {prop} en un texto usando los datos; si falta una prop se deja vacía. */
export function resolverTexto(texto: string, datos: Record<string, string | number | boolean | null>): string {
  return String(texto).replace(/\{(\w+)\}/g, (_match, clave: string) => {
    const valor = datos?.[clave];
    if (valor === undefined || valor === null) return '';
    return String(valor);
  });
}

export function resolverPlantilla(
  plantilla: PlantillaNotificacion,
  datos: Record<string, string | number | boolean | null> = {}
): { asunto: string; cuerpo: string } {
  return {
    asunto: resolverTexto(plantilla.asunto, datos),
    cuerpo: resolverTexto(plantilla.cuerpo, datos),
  };
}

// ---------------------------------------------------------------------------
// Política de programación
// ---------------------------------------------------------------------------

export function politicaProgramacion(plantilla: PlantillaNotificacion): 'SCHEDULED' | 'IMMEDIATE' {
  return plantilla.inicio === 'SCHEDULED' && plantilla.antelacionHoras != null
    ? 'SCHEDULED'
    : 'IMMEDIATE';
}

export function calcularProgramacion(plantilla: PlantillaNotificacion, fechaRef: string): { programarPara?: string } {
  if (politicaProgramacion(plantilla) !== 'SCHEDULED' || !plantilla.antelacionHoras) return {};
  const base = new Date(fechaRef);
  if (Number.isNaN(base.getTime())) return {};
  base.setHours(base.getHours() - plantilla.antelacionHoras);
  return { programarPara: base.toISOString() };
}

// ---------------------------------------------------------------------------
// Resultado de entrega
// ---------------------------------------------------------------------------

export function resultadoEntregaExito(provider: string, externalId?: string): ResultadoEntrega {
  return { ok: true, provider, externalId, enviadoEn: new Date().toISOString() };
}

export function resultadoEntregaError(provider: string, error: string): ResultadoEntrega {
  return { ok: false, provider, error, enviadoEn: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Validación del evento (RBAC de datos)
// ---------------------------------------------------------------------------

/**
 * Un actor NO administrador solo puede disparar eventos de su propia cartera.
 * El contexto (perfil/propietarioId/inmuebleIds) lo resuelve el backend; aquí
 * solo se aplica la regla pura. False ⇒ denegado (deny by default).
 */
export function puedeDispararEvento(
  contexto: { perfil: 'ADMINISTRADOR' | 'PROPIETARIO' | 'PROFESIONAL' | null },
  evento: EventoNotificacion
): boolean {
  if (!contexto.perfil) return false; // anónimo ⇒ denegado
  if (contexto.perfil === 'ADMINISTRADOR') return true;
  if (!evento.propietarioId) return false; // sin titularidad ⇒ el no-admin no puede
  return true; // el backend igualará evento.propietarioId con el propietarioId del actor
}

export function destinatarioSaneado(dest: DestinatarioNotificacion): DestinatarioNotificacion {
  return {
    email: dest.email || undefined,
    usuarioId: dest.usuarioId || undefined,
    nombre: dest.nombre || undefined,
    telefono: dest.telefono || undefined,
    webhookUrl: dest.webhookUrl || undefined,
  };
}

// ---------------------------------------------------------------------------
// Saneado de secretos (requisito: no guardar credenciales en Firestore)
// ---------------------------------------------------------------------------

const CLAVES_SENSIBLES = /password|secret|api_?key|credential|access_?token|refresh_?token|smtp|private_?key|cloudinary|firebase.*key/i;

/**
 * Elimina de los datos de plantilla cualquier clave con aspecto de secreto o
 * credencial. Las propiedades dinámicas legítimas (importes, fechas, nombres)
 * se conservan; lo sensible se descarta antes de persistir o enviar.
 */
export function saneadoDatos(
  datos: Record<string, string | number | boolean | null> | undefined
): Record<string, string | number | boolean | null> {
  const limpio: Record<string, string | number | boolean | null> = {};
  if (!datos) return limpio;
  for (const [clave, valor] of Object.entries(datos)) {
    if (CLAVES_SENSIBLES.test(clave)) continue;
    limpio[clave] = valor;
  }
  return limpio;
}
