/**
 * GAP 1 — Dispatcher: corazón del sistema transaccional.
 * ------------------------------------------------------
 * Orquesta: Creación de evento → programación → dispatch → resultado → auditoría.
 *
 * - Decide destinatario, canal, plantilla, momento y estado.
 * - Anti-duplicados por `idempotencyKey` e id determinista.
 * - Reintentos acotados (fallida → vuelve a PENDIENTE hasta MAX_REINTENTOS).
 * - NUNCA gestiona secretos: los obtiene del backend vía canales configurados.
 */

import type {
  CanalNotificacion,
  ContextoAutorizacion,
  DestinatarioNotificacion,
  EnviarNotificacionPayload,
  EnviarNotificacionResponse,
  EventoNotificacion,
  Notificacion,
  ResultadoEntrega,
} from '../types/notificaciones';
import {
  destinatarioSaneado,
  resolverPlantilla,
  saneadoDatos,
  seleccionarCanal,
  seleccionarPlantilla,
  validarPayload,
} from './resolucion';
import { PLANTILLAS } from './plantillas';
import { idDeNotificacion, idempotenciaDeEvento } from '../types/notificaciones';

export const MAX_REINTENTOS = 3;
// ---------------------------------------------------------------------------
// Interfaces de canales
// ---------------------------------------------------------------------------

export type ResultadoCanal = ResultadoEntrega;

export interface EnviadorCanal {
  readonly canal: CanalNotificacion;
  enviar(notificacion: Notificacion): Promise<ResultadoCanal>;
}

/** Almacén de notificaciones (Firestore en producción; Map en tests). */
export interface RepositorioNotificaciones {
  buscarPorId(id: string): Promise<Notificacion | null>;
  buscarPorIdempotencia(idempotencyKey: string): Promise<Notificacion | null>;
  guardar(notificacion: Notificacion): Promise<void>;
}

/** Origen de sesión/autorización resuelto por el backend. */
export interface ContextoDispatcher {
  autorizacion: ContextoAutorizacion;
  repositorio: RepositorioNotificaciones;
  canales: Record<CanalNotificacion, EnviadorCanal | null | undefined>;
}

// ---------------------------------------------------------------------------
// Helper de auditoría
// ---------------------------------------------------------------------------

function conAudit(n: Notificacion, accion: string, detalle?: string, actor?: string): Notificacion {
  return {
    ...n,
    audit: {
      ...n.audit,
      eventos: [
        ...(n.audit?.eventos || []),
        { fecha: new Date().toISOString(), accion, detalle, actor },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export class DispatcherNotificaciones {
  constructor(private readonly ctx: ContextoDispatcher) {}

  /** Convierte un evento/payload en una Notificación sin persistirla. */
  crearNotificacionDeEvento(evento: EventoNotificacion, programarPara?: string): Notificacion {
    const idempotencyKey = evento.idempotencyKey;
    const plantilla = seleccionarPlantilla(evento.tipoEvento, PLANTILLAS);
    const canal = seleccionarCanal(
      plantilla || { id: evento.tipoEvento, asunto: '', cuerpo: '', canalesPermitidos: ['INAPP', 'EMAIL', 'WEBHOOK', 'WHATSAPP'] },
      evento.canal,
      {
        email: !!this.ctx.canales.EMAIL,
        inapp: !!this.ctx.canales.INAPP,
        webhook: !!this.ctx.canales.WEBHOOK,
        whatsapp: !!this.ctx.canales.WHATSAPP,
      }
    );
    const { asunto, cuerpo } = plantilla
      ? resolverPlantilla(plantilla, evento.datos || {})
      : { asunto: evento.tipoEvento, cuerpo: '' };

    const destinatario: DestinatarioNotificacion = destinatarioSaneado(evento.destinatario || {});

    const notificacion: Notificacion = {
      id: idDeNotificacion(idempotencyKey),
      idempotencyKey,
      tipo: evento.tipoEvento,
      origen: evento.origen,
      canal: canal || 'INAPP',
      destinatario,
      asunto,
      plantilla: plantilla ? plantilla.id : evento.tipoEvento,
      datos: saneadoDatos(evento.datos),
      entidadId: evento.entidadId,
      inmuebleId: evento.inmuebleId,
      propietarioId: evento.propietarioId,
      fechaCreacion: new Date().toISOString(),
      programarPara,
      estado: programarPara && new Date(programarPara).getTime() > Date.now() ? 'PROGRAMADA' : 'PENDIENTE',
      intentos: 0,
      audit: {
        creadoPorPerfil: this.ctx.autorizacion.perfil || undefined,
        eventos: [
          {
            fecha: new Date().toISOString(),
            accion: 'creada',
            detalle: `Evento ${evento.origen}/${evento.tipoEvento} → carpeta ${idDeNotificacion(idempotencyKey)}`,
          },
        ],
      },
    };

    return notificacion;
  }

  /** Punto de entrada principal (equivale al flujo del endpoint backend). */
  async dispatch(payload: EnviarNotificacionPayload): Promise<EnviarNotificacionResponse> {
    // 1. Validar payload
    const validacion = validarPayload(payload);
    if (!validacion.valido) {
      return { ok: false, error: 'payload_invalido', motivoDenegacion: validacion.errores.join(', ') };
    }

    // 2. Autorización (deny-by-default, resuelto por backend).
    const perfil = this.ctx.autorizacion?.perfil;
    if (!perfil) {
      return { ok: false, error: 'no_autorizado', motivoDenegacion: 'Se requiere un usuario autenticado con perfil válido.' };
    }
    if (perfil !== 'ADMINISTRADOR') {
      // Un no-admin solo puede notificar su propia cartera y sus inmuebles.
      if (payload.propietarioId && payload.propietarioId !== this.ctx.autorizacion?.propietarioId) {
        return {
          ok: false,
          error: 'propietario_no_autorizado',
          motivoDenegacion: 'El actor no puede enviar notificaciones de la cartera de otro propietario.',
        };
      }
      if (
        payload.inmuebleId &&
        this.ctx.autorizacion?.inmuebleIds &&
        this.ctx.autorizacion.inmuebleIds.length > 0 &&
        !this.ctx.autorizacion.inmuebleIds.includes(payload.inmuebleId)
      ) {
        return {
          ok: false,
          error: 'inmueble_no_autorizado',
          motivoDenegacion: 'El actor no puede notificar sobre un inmueble fuera de su alcance.',
        };
      }
    }
    // Titularidad efectiva: los no-admins quedan SIEMPRE anclados a su cartera.
    const propietarioIdEfectivo =
      perfil === 'ADMINISTRADOR' ? payload.propietarioId : this.ctx.autorizacion?.propietarioId;

    // 3. Idempotencia (duplicado rechazado sin nuevos envíos)
    //    La clave se deriva del evento si el cliente no la aporta.
    const clave = payload.idempotencyKey || idempotenciaDeEvento(payload.origen, payload.tipoEvento, payload.entidadId);
    const existente = await this.buscarPorId(clave);

    // 4. Plantilla y canal
    const plantilla = seleccionarPlantilla(payload.tipoEvento, PLANTILLAS);
    if (!plantilla) {
      return { ok: false, error: 'plantilla_desconocida', motivoDenegacion: payload.tipoEvento };
    }
    const canal = seleccionarCanal(
      plantilla,
      payload.canal,
      {
        email: !!this.ctx.canales.EMAIL,
        inapp: !!this.ctx.canales.INAPP,
        webhook: !!this.ctx.canales.WEBHOOK,
        whatsapp: !!this.ctx.canales.WHATSAPP,
      }
    );
    if (!canal) {
      return { ok: false, error: 'canal_no_disponible', motivoDenegacion: plantilla.canalesPermitidos.join(', ') };
    }

    // 5. Reintento si ya estaba FALLIDA o PENDIENTE pendiente de entrega
    if (existente && existente.estado !== 'ENVIADA' && existente.estado !== 'CANCELADA') {
      return await this.intentarEntrega(existente);
    }
    if (existente) {
      // ENVIADA o CANCELADA ⇒ idempotente
      return {
        ok: existente.estado === 'ENVIADA',
        notificacion: existente,
        entregada: existente.estado === 'ENVIADA',
        estado: existente.estado,
        canal: existente.canal,
        provider: existente.provider,
        externalId: existente.externalId,
        duplicada: true,
      };
    }

    // 6. Crear la notificación (PENDIENTE / PROGRAMADA)
    const evento: EventoNotificacion = {
      origen: payload.origen,
      tipoEvento: payload.tipoEvento,
      entidadId: payload.entidadId,
      idempotencyKey: clave,
      inmuebleId: payload.inmuebleId,
      propietarioId: propietarioIdEfectivo,
      canal,
      datos: saneadoDatos(payload.datos),
      destinatario: payload.destinatario,
    };
    let notificacion = this.crearNotificacionDeEvento(evento, payload.programarPara);

    // 7. Si hay que programarla (futuro), persistir PROGRAMADA y retornar
    if (notificacion.estado === 'PROGRAMADA') {
      await this.ctx.repositorio.guardar(notificacion);
      return {
        ok: true,
        notificacion,
        entregada: false,
        estado: 'PROGRAMADA',
        canal: notificacion.canal,
      };
    }

    // 8. Entrega inmediata
    return await this.intentarEntrega(notificacion);
  }

  private async buscarPorId(idempotencyKey: string): Promise<Notificacion | null> {
    const porClave = await this.ctx.repositorio.buscarPorIdempotencia(idempotencyKey);
    if (porClave) return porClave;
    return this.ctx.repositorio.buscarPorId(idDeNotificacion(idempotencyKey));
  }

  private async intentarEntrega(notificacion: Notificacion): Promise<EnviarNotificacionResponse> {
    if (notificacion.intentos >= MAX_REINTENTOS) {
      const finalizada = conAudit(notificacion, 'sin_reintentos', 'Máximo de intentos alcanzado');
      await this.ctx.repositorio.guardar(finalizada);
      return { ok: false, notificacion: finalizada, estado: 'FALLIDA', error: 'max_reintentos' };
    }

    const canalSelector = notificacion.canal;
    const proveedor: EnviadorCanal | null | undefined = this.ctx.canales[canalSelector];

    if (!proveedor) {
      const fallida = conAudit(notificacion, 'canal_no_configurado', `No existe proveedor para ${canalSelector}`);
      await this.ctx.repositorio.guardar(fallida);
      return { ok: false, notificacion: fallida, estado: 'FALLIDA', error: 'canal_no_configurado' };
    }

    const enEnvio = conAudit({ ...notificacion, estado: 'ENVIANDO', intentos: notificacion.intentos + 1 }, 'intento_envio');
    await this.ctx.repositorio.guardar(enEnvio);

    let resultado: ResultadoCanal;
    try {
      resultado = await proveedor.enviar(enEnvio);
    } catch (err) {
      resultado = { ok: false, provider: 'unknown', error: err instanceof Error ? err.message : String(err), enviadoEn: new Date().toISOString() };
    }

    if (resultado.ok) {
      const enviada: Notificacion = conAudit(
        {
          ...enEnvio,
          estado: 'ENVIADA',
          enviadoEn: resultado.enviadoEn || new Date().toISOString(),
          provider: resultado.provider,
          externalId: resultado.externalId,
          error: undefined,
        },
        'enviada',
        `Entregada por ${resultado.provider}`
      );
      await this.ctx.repositorio.guardar(enviada);
      return {
        ok: true,
        notificacion: enviada,
        entregada: true,
        estado: 'ENVIADA',
        canal: canalSelector,
        provider: resultado.provider,
        externalId: resultado.externalId,
      };
    }

    const fallida: Notificacion = conAudit(
      {
        ...enEnvio,
        estado: 'FALLIDA',
        error: resultado.error || 'error_desconocido',
        provider: resultado.provider,
        enviadoEn: resultado.enviadoEn,
      },
      'envio_fallido',
      resultado.error || 'error_desconocido'
    );
    await this.ctx.repositorio.guardar(fallida);
    return {
      ok: false,
      notificacion: fallida,
      estado: 'FALLIDA',
      canal: canalSelector,
      provider: resultado.provider,
      error: fallida.error,
    };
  }

  async reintentar(notificacion: Notificacion): Promise<EnviarNotificacionResponse> {
    if (notificacion.estado === 'ENVIADA') {
      return { ok: true, notificacion, entregada: true, estado: 'ENVIADA', duplicada: true };
    }
    if (notificacion.estado === 'CANCELADA') {
      return { ok: false, notificacion, estado: 'CANCELADA', error: 'cancelada' };
    }
    const reseteada: Notificacion = conAudit(
      { ...notificacion, estado: 'PENDIENTE', error: undefined },
      'reintento'
    );
    return this.intentarEntrega(reseteada);
  }

  async cancelar(notificacion: Notificacion): Promise<EnviarNotificacionResponse> {
    if (notificacion.estado === 'ENVIADA') {
      return { ok: false, notificacion, estado: 'ENVIADA', error: 'ya_enviada' };
    }
    const cancelada: Notificacion = conAudit({ ...notificacion, estado: 'CANCELADA' }, 'cancelada');
    await this.ctx.repositorio.guardar(cancelada);
    return { ok: true, notificacion: cancelada, estado: 'CANCELADA' };
  }
}
