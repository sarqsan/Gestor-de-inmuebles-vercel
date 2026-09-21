/**
 * BLOQUE C — Puente con GAP 1 (dispatcher canónico de notificaciones).
 * -------------------------------------------------------------------------
 * Este fichero es la ÚNICA vía de salida comunicativa del bloque de morosidad:
 *  - NO crea un segundo sistema de notificaciones;
 *  - construye `EventoNotificacion` con la id idempotencia canónica
 *    (`idempotenciaDeEvento`), de modo que repetir la operación es inocuo;
 *  - resuelve el destinatario (email del arrendatario desde el contrato canónico,
 *    del propietario desde `propietarios`), sin copiar datos en el expediente;
 *  - si no hay contacto o no hay transporte real, el resultado es `PREPARADA` /
 *    `PENDIENTE_ENVIO` / `DEPENDENCIA_EXTERNA`: nunca se afirma un envío.
 *
 * Patrón calcado del puente GAP 1 del BLOQUE B (`eventoTesoreriaAEventoNotificacion`).
 */

import type { ContratoFormalizacion, Propietario, UsuarioApp } from '../../types';
import type { ContextoAutorizacion, EventoNotificacion, Notificacion } from '../../types/notificaciones';
import { idDeNotificacion, idempotenciaDeEvento, normalizarClave } from '../../types/notificaciones';
import { DispatcherNotificaciones, type EnviadorCanal, type RepositorioNotificaciones } from '../../notificaciones/dispatcher';
import { CanalEmail, CanalInApp, EmailProviderSafeMode, type EmailProvider } from '../../notificaciones/canales';
import type { EventoMorosidad, EventoNotificacionMorosidad } from './eventos';
import { TIPO_EVENTO_MOROSIDAD, datosPlantillaGAP1, estadoComunicacionDesdeDispatch } from './eventos';
import type { ComunicacionExpediente } from '../../types/morosidad';

export const ORIGEN_MOROSIDAD = 'MOROSIDAD' as const;

// ==========================================================================
// 1) Evento de recobro → EventoNotificacion (GAP 1)
// ==========================================================================

/** Plantillas de la familia `cobro.*` reutilizadas por los pasos de pre-recobro. */
export const PLANTILLAS_CANONICAS_REUTILIZADAS = ['cobro.proximo_vencimiento', 'cobro.vencimiento_hoy', 'cobro.retraso_pago'] as const;

export interface ContextoDestinatarios {
  contrato?: Pick<
    ContratoFormalizacion,
    'candidatoNombre' | 'candidatoEmail' | 'candidatoTelefono' | 'avalistaNombre' | 'avalistaTelefono' | 'cotitularNombre' | 'cotitularEmail'
  > | null;
  propietario?: Pick<Propietario, 'nombre' | 'email' | 'telefono'> | null;
  /** Usuario de plataforma para la bandeja interna (INAPP). */
  usuarioIdPropietario?: string;
  /** Usuario de plataforma de administración (bandeja INAPP de los avisos internos). */
  usuarioIdAdministracion?: string;
}

/**
 * Identidad de la entidad sobre la que se dispara el evento. Incluye el cobro
 * (tramo) para que dos mensualidades distintas del mismo expediente no colisionen
 * en la clave de idempotencia, y para que el REINTENTO del mismo tramo sí sea inocuo.
 */
export function entidadEventoMorosidad(e: EventoNotificacionMorosidad): string {
  return e.cobroId ? `${e.expedienteId}#${e.cobroId}` : e.expedienteId;
}

/** Clave de idempotencia GAP 1 de un evento de recobro (determinista). */
export function claveIdempotenciaMorosidad(e: EventoNotificacionMorosidad): string {
  const sufijo = TIPO_EVENTO_MOROSIDAD[e.evento].split('.')[1] || e.evento;
  return idempotenciaDeEvento(ORIGEN_MOROSIDAD, sufijo, entidadEventoMorosidad(e));
}

export function eventoMorosidadAEventoNotificacion(
  e: EventoNotificacionMorosidad,
  ctx: ContextoDestinatarios = {},
): EventoNotificacion {
  const tipoEvento = TIPO_EVENTO_MOROSIDAD[e.evento];
  const idempotencyKey = claveIdempotenciaMorosidad(e);

  let email: string | undefined;
  let nombre: string | undefined;
  let telefono: string | undefined;
  let usuarioId: string | undefined;
  switch (e.destinatarioTipo) {
    case 'INQUILINO':
      email = ctx.contrato?.candidatoEmail || undefined;
      nombre = e.nombreDestinatario || ctx.contrato?.candidatoNombre;
      telefono = ctx.contrato?.candidatoTelefono;
      break;
    case 'AVALISTA':
      // El modelo canónico del contrato no almacena email del avalista: solo
      // consta nombre/teléfono/dirección. Sin contacto verificable ⇒ no se afirma
      // envío; la administración lo documenta como evidencia.
      email = undefined;
      nombre = ctx.contrato?.avalistaNombre;
      telefono = ctx.contrato?.avalistaTelefono;
      break;
    case 'CODEUDOR':
      email = ctx.contrato?.cotitularEmail || undefined;
      nombre = ctx.contrato?.cotitularNombre;
      break;
    case 'PROPIETARIO':
      email = ctx.propietario?.email || undefined;
      nombre = ctx.propietario?.nombre;
      telefono = ctx.propietario?.telefono;
      usuarioId = ctx.usuarioIdPropietario;
      break;
    case 'ADMINISTRACION':
    default:
      nombre = 'Administración';
      // La bandeja interna exige destinatario identificable; sin usuario de
      // administración no hay canal ⇒ el puente prepara pero no afirma envío.
      usuarioId = ctx.usuarioIdAdministracion;
      break;
  }

  return {
    origen: ORIGEN_MOROSIDAD,
    tipoEvento,
    entidadId: entidadEventoMorosidad(e),
    idempotencyKey,
    inmuebleId: e.inmuebleId,
    propietarioId: e.propietarioId,
    // WHATSAPP no está implementado en GAP 1 (canal preparado): nunca se solicita.
    canal: e.destinatarioTipo === 'ADMINISTRACION' ? 'INAPP' : email ? 'EMAIL' : 'INAPP',
    datos: datosPlantillaGAP1(e),
    destinatario: {
      email: email || undefined,
      nombre: nombre || undefined,
      telefono: telefono || undefined,
      usuarioId,
    },
  };
}

// ==========================================================================
// 2) Repositorio Firestore del dispatcher GAP 1 (pendiente desde GAP 1)
// ==========================================================================

/**
 * Implementación Firestore de `RepositorioNotificaciones` (la interfaz que GAP 1
 * dejó sin implementación persistente). Escrita REAL del documento de notificación;
 * la ENTREGA depende del canal configurado (safe-mode por defecto ⇒ no se afirma).
 */
export interface EscritorNotificacion {
  guardar: (n: Notificacion) => Promise<void>;
  buscarPorId: (id: string) => Promise<Notificacion | null>;
  buscarPorIdempotencia: (key: string) => Promise<Notificacion | null>;
}

export function repositorioNotificacionesFirestore(escritor: EscritorNotificacion): RepositorioNotificaciones {
  return {
    guardar: escritor.guardar,
    buscarPorId: escritor.buscarPorId,
    buscarPorIdempotencia: escritor.buscarPorIdempotencia,
  };
}

/** Repositorio en memoria (tests y modo local sin Firestore). */
export function repositorioNotificacionesMemoria(): RepositorioNotificaciones & {
  todos: () => Notificacion[];
} {
  const mapa = new Map<string, Notificacion>();
  return {
    async guardar(n: Notificacion) {
      mapa.set(n.id, { ...n });
    },
    async buscarPorId(id: string) {
      return mapa.get(id) || null;
    },
    async buscarPorIdempotencia(idempotencyKey: string) {
      for (const n of mapa.values()) if (n.idempotencyKey === idempotencyKey) return n;
      return null;
    },
    todos: () => Array.from(mapa.values()),
  };
}

// ==========================================================================
// 3) Autorización (deny-by-default, igual que el endpoint de GAP 1)
// ==========================================================================

export function contextoAutorizacionDesdeUsuario(
  usuario?: Pick<UsuarioApp, 'id' | 'email' | 'tipoPerfil' | 'propietarioId' | 'profesionalId' | 'inmuebleIds'> | null,
): ContextoAutorizacion {
  if (!usuario) return { perfil: null };
  const perfil =
    usuario.tipoPerfil === 'ADMINISTRADOR'
      ? 'ADMINISTRADOR'
      : usuario.tipoPerfil === 'PROPIETARIO'
        ? 'PROPIETARIO'
        : usuario.tipoPerfil === 'PROFESIONAL'
          ? 'PROFESIONAL'
          : null;
  return {
    perfil,
    uid: usuario.id,
    propietarioId: usuario.propietarioId,
    profesionalId: usuario.profesionalId,
    inmuebleIds: usuario.inmuebleIds,
  };
}

// ==========================================================================
// 4) Dispatch de un evento de recobro por GAP 1
// ==========================================================================

export interface DispatcherContexto {
  autorizacion: ContextoAutorizacion;
  repositorio: RepositorioNotificaciones;
  /** Proveedor de email. `null` ⇒ sin transporte ⇒ el dispatcher marca el fallo. */
  emailProvider?: EmailProvider | null;
  canales?: Partial<Record<'EMAIL' | 'INAPP' | 'WEBHOOK' | 'WHATSAPP', EnviadorCanal | null>>;
}

export interface ResultadoPuenteGAP1 {
  ok: boolean;
  idempotencyKey: string;
  notificacionId?: string;
  tipoEvento: string;
  estadoComunicacion: ComunicacionExpediente['estado'];
  entregada: boolean;
  duplicada: boolean;
  canal?: string;
  provider?: string;
  externalId?: string;
  error?: string;
  motivoDenegacion?: string;
}

/**
 * Envía (o prepara) el evento a través del dispatcher GAP 1 y traduce el
 * resultado al estado del espejo local. Sin transporte real ⇒ `PENDIENTE_ENVIO`.
 */
export async function despacharEventoMorosidadPorGAP1(
  e: EventoNotificacionMorosidad,
  ctx: DispatcherContexto,
  destinatarios: ContextoDestinatarios = {},
): Promise<ResultadoPuenteGAP1> {
  const evento = eventoMorosidadAEventoNotificacion(e, destinatarios);
  // Ningún destino resoluble (ni email ni usuario de bandeja) ⇒ no se invoca el
  // transporte y no se afirma nada: la comunicación queda PREPARADA.
  const sinContacto = !evento.destinatario?.email && !evento.destinatario?.usuarioId;

  const canales: DispatcherContexto['canales'] = {
    INAPP: new CanalInApp(),
    EMAIL: new CanalEmail(ctx.emailProvider || new EmailProviderSafeMode({ activo: false })),
    ...(ctx.canales || {}),
  };
  // Sin proveedor de email real declarado ⇒ EMAIL se deshabilita (canal no disponible).
  if (!ctx.emailProvider && !(ctx.canales && 'EMAIL' in ctx.canales && ctx.canales.EMAIL)) {
    canales.EMAIL = new CanalEmail(new EmailProviderSafeMode({ activo: false }));
  }

  const dispatcher = new DispatcherNotificaciones({
    autorizacion: ctx.autorizacion,
    repositorio: ctx.repositorio,
    canales: canales as Record<'EMAIL' | 'INAPP' | 'WEBHOOK' | 'WHATSAPP', EnviadorCanal | null>,
  });

  if (sinContacto) {
    return {
      ok: false,
      idempotencyKey: evento.idempotencyKey,
      tipoEvento: evento.tipoEvento,
      estadoComunicacion: 'PREPARADA',
      entregada: false,
      duplicada: false,
      canal: evento.canal,
      error: 'destinatario_sin_contacto',
      motivoDenegacion:
        'No existe dirección de contacto (email) ni usuario de bandeja en la fuente canónica: no se solicita ningún envío al GAP 1.',
    };
  }

  let respuesta;
  try {
    respuesta = await dispatcher.dispatch({
      origen: evento.origen,
      tipoEvento: evento.tipoEvento,
      entidadId: evento.entidadId,
      idempotencyKey: evento.idempotencyKey,
      inmuebleId: evento.inmuebleId,
      propietarioId: evento.propietarioId,
      canal: evento.canal,
      datos: evento.datos,
      destinatario: evento.destinatario,
    });
  } catch (err) {
    return {
      ok: false,
      idempotencyKey: evento.idempotencyKey,
      tipoEvento: evento.tipoEvento,
      estadoComunicacion: 'PENDIENTE_ENVIO',
      entregada: false,
      duplicada: false,
      error: err instanceof Error ? err.message : 'error_dispatcher',
      notificacionId: idDeNotificacion(evento.idempotencyKey),
    };
  }

  const estado = estadoComunicacionDesdeDispatch({
    ok: respuesta.ok,
    estado: respuesta.estado,
    entregada: respuesta.entregada,
    duplicada: respuesta.duplicada,
    error: respuesta.error,
  });

  return {
    ok: !!respuesta.ok,
    idempotencyKey: evento.idempotencyKey,
    notificacionId: respuesta.notificacion?.id || idDeNotificacion(evento.idempotencyKey),
    tipoEvento: evento.tipoEvento,
    estadoComunicacion: estado,
    entregada: respuesta.entregada === true && respuesta.estado === 'ENVIADA',
    duplicada: !!respuesta.duplicada,
    canal: respuesta.canal,
    provider: respuesta.provider,
    externalId: respuesta.externalId,
    error: respuesta.error,
    motivoDenegacion: respuesta.motivoDenegacion,
  };
}

/** Id de notificación GAP 1 esperado (helper expuesto para tests/UI). */
export function idNotificacionEsperada(idempotencyKey: string): string {
  return idDeNotificacion(idempotencyKey);
}

/** Clave normalizada auxiliar (misma función que usa GAP 1 internamente). */
export function normalizarParaClave(texto: string): string {
  return normalizarClave(texto);
}

export type { EventoMorosidad };
