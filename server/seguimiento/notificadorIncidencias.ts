/**
 * FASE 6 — AVISOS DE SEGUIMIENTO DE INCIDENCIAS POR EL DISPATCHER CANÓNICO
 * =======================================================================
 * Puente entre los eventos de seguimiento (`src/seguimiento/incidencias.ts`) y
 * el sistema transaccional de notificaciones (GAP 1). NO crea un segundo
 * sistema de notificaciones: reutiliza plantillas, canales, idempotencia y
 * auditoría del dispatcher.
 *
 * Decisiones explícitas:
 *   · el destinatario lo elige el SERVIDOR entre los destinos autorizados del
 *     evento (nunca el actor, nunca el cliente);
 *   · sin destinatario resoluble NO se llama al dispatcher: el aviso queda
 *     `SIN_DESTINATARIO` (no se afirma ninguna entrega);
 *   · canal preferente: bandeja interna (INAPP) si hay usuario de plataforma,
 *     si no EMAIL; el dispatcher valida que la plantilla lo permita;
 *   · la clave de idempotencia es la del evento de seguimiento (la canónica de
 *     GAP 1), así que un reintento NUNCA duplica el aviso;
 *   · la titularidad del aviso sale de la incidencia autorizada: el contexto del
 *     dispatcher representa a la plataforma (ADMINISTRADOR) porque el actor no
 *     elige ni destinatario ni propietario.
 */
import type { ContextoAutorizacion, DestinatarioNotificacion, EnviarNotificacionPayload } from '../../src/types/notificaciones.js';
import { idNotificacionDeEvento, type DestinoAvisoIncidencia, type EntregaEventoSeguimiento } from '../../src/seguimiento/incidencias.js';
import type { DispatcherNotificaciones } from '../../src/notificaciones/dispatcher.js';
import type { AvisoSeguimientoIncidencia, NotificadorSeguimientoIncidencia } from './seguimientoIncidencias.js';

/** Plantilla GAP 1 de cada tipo de evento de seguimiento. */
export const PLANTILLA_POR_EVENTO_SEGUIMIENTO: Readonly<Record<string, string>> = {
  INCIDENCIA_CREADA: 'incidencia.nueva',
  INCIDENCIA_ESTADO_CAMBIADO: 'incidencia.cambio_estado',
  INCIDENCIA_RESUELTA: 'incidencia.resuelta',
  INCIDENCIA_PRIORIDAD_CAMBIADA: 'incidencia.prioridad_cambiada',
  INCIDENCIA_ACTUALIZADA: 'incidencia.actualizada',
  INCIDENCIA_ESCALADA: 'incidencia.escalada',
  INCIDENCIA_DERIVACION_SOLICITADA: 'incidencia.derivacion_solicitada',
};

const ETIQUETA_CAMPO: Readonly<Record<string, string>> = {
  fotografias: 'fotografías',
  documentos: 'documentos',
  trabajoProfesional: 'profesional asignado',
  estado: 'estado',
  prioridad: 'prioridad',
  escalada: 'escalado',
  derivacion: 'derivación',
};

const MOTIVO_ESCALADO: Readonly<Record<string, string>> = {
  URGENTE_SIN_ASIGNAR: 'prioridad urgente sin profesional asignado',
  PLAZO_SIN_ASIGNAR: 'plazo de atención superado sin profesional asignado',
};

export interface DependenciasNotificadorIncidencias {
  /** Fábrica del dispatcher del servidor (reutiliza repositorio y canales). */
  crearDispatcher: (autorizacion: ContextoAutorizacion) => DispatcherNotificaciones;
  /** Bandeja de administración (resuelta en servidor; nunca viene del cliente). */
  usuarioIdAdministracion?: string;
  ahora?: () => Date;
}

function destinatarioDe(
  destino: DestinoAvisoIncidencia,
  aviso: AvisoSeguimientoIncidencia,
  deps: DependenciasNotificadorIncidencias,
): DestinatarioNotificacion | null {
  const { contactos } = aviso;
  if (destino === 'INQUILINO') {
    const d: DestinatarioNotificacion = {
      ...(contactos.inquilino.email ? { email: contactos.inquilino.email } : {}),
      ...(contactos.inquilino.nombre ? { nombre: contactos.inquilino.nombre } : {}),
      ...(contactos.inquilino.usuarioId ? { usuarioId: contactos.inquilino.usuarioId } : {}),
    };
    return d.email || d.usuarioId ? d : null;
  }
  if (destino === 'PROPIETARIO') {
    const d: DestinatarioNotificacion = {
      ...(contactos.propietario.email ? { email: contactos.propietario.email } : {}),
      ...(contactos.propietario.nombre ? { nombre: contactos.propietario.nombre } : {}),
      ...(contactos.propietario.usuarioId ? { usuarioId: contactos.propietario.usuarioId } : {}),
    };
    return d.email || d.usuarioId ? d : null;
  }
  if (destino === 'PROFESIONAL') {
    const d: DestinatarioNotificacion = {
      ...(contactos.profesional.email ? { email: contactos.profesional.email } : {}),
      ...(contactos.profesional.nombre ? { nombre: contactos.profesional.nombre } : {}),
      ...(contactos.profesional.usuarioId ? { usuarioId: contactos.profesional.usuarioId } : {}),
    };
    return d.email || d.usuarioId ? d : null;
  }
  // ADMINISTRACION: bandeja interna de gestión (sin email corporativo visible).
  return deps.usuarioIdAdministracion ? { usuarioId: deps.usuarioIdAdministracion, nombre: 'Administración' } : null;
}

function datosDePlantilla(aviso: AvisoSeguimientoIncidencia): Record<string, string | number | boolean | null> {
  const { evento, datos } = aviso;
  const salida: Record<string, string | number | boolean | null> = { ...datos };
  if (evento.tipo === 'INCIDENCIA_ACTUALIZADA') {
    salida.campos = evento.campos.map((c) => ETIQUETA_CAMPO[c] ?? c).join(', ');
  }
  if (evento.tipo === 'INCIDENCIA_ESCALADA') {
    salida.motivo = MOTIVO_ESCALADO[evento.detalleCodigo ?? ''] ?? 'requiere atención';
  }
  return salida;
}

/** Notificador listo para inyectar en el servicio de seguimiento. */
export function crearNotificadorIncidencias(
  deps: DependenciasNotificadorIncidencias,
): NotificadorSeguimientoIncidencia {
  const ahora = deps.ahora ?? (() => new Date());

  return async function notificarAviso(aviso): Promise<EntregaEventoSeguimiento> {
    const tipoEvento = PLANTILLA_POR_EVENTO_SEGUIMIENTO[aviso.evento.tipo];
    const base: EntregaEventoSeguimiento = {
      canal: null,
      estado: 'NO_ENVIADA',
      notificacionId: idNotificacionDeEvento(aviso.evento),
      intentos: 0,
      actualizadoEn: ahora().toISOString(),
    };
    if (!tipoEvento) {
      return { ...base, motivo: 'evento_sin_plantilla' };
    }

    // 1 · Destinatario autorizado (primero resoluble de la lista blanca del evento)
    let destinoElegido: DestinoAvisoIncidencia | null = null;
    let destinatario: DestinatarioNotificacion | null = null;
    for (const destino of aviso.destinos) {
      const candidato = destinatarioDe(destino, aviso, deps);
      if (candidato) {
        destinoElegido = destino;
        destinatario = candidato;
        break;
      }
    }
    if (!destinatario || !destinoElegido) {
      return { ...base, estado: 'SIN_DESTINATARIO', motivo: 'sin_destinatario_autorizado' };
    }

    const canal = destinatario.usuarioId ? 'INAPP' : 'EMAIL';
    const payload: EnviarNotificacionPayload = {
      origen: 'INCIDENCIA',
      tipoEvento,
      entidadId: aviso.evento.incidenciaId,
      idempotencyKey: aviso.evento.claveIdempotencia,
      inmuebleId: aviso.evento.inmuebleId,
      propietarioId: aviso.evento.propietarioId,
      canal,
      datos: datosDePlantilla(aviso),
      destinatario,
    };

    try {
      // 2 · La plataforma es quien avisa: la titularidad viene de la incidencia
      // autorizada (el actor nunca elige propietario ni destinatario).
      const dispatcher = deps.crearDispatcher({ perfil: 'ADMINISTRADOR' });
      const respuesta = await dispatcher.dispatch(payload);
      const notificacion = respuesta.notificacion;
      const motivo = respuesta.error ?? respuesta.motivoDenegacion;
      // Orden deliberado: si el evento ya tenía notificación (misma clave
      // canónica) NO se ha reenviado nada ⇒ DUPLICADA, aunque estuviera entregada.
      const estado: EntregaEventoSeguimiento['estado'] = respuesta.duplicada
        ? 'DUPLICADA'
        : respuesta.entregada
          ? 'ENVIADA'
          : respuesta.estado === 'PROGRAMADA'
            ? 'PENDIENTE'
            : 'NO_ENVIADA';
      return {
        canal: (respuesta.canal ?? notificacion?.canal ?? canal) as EntregaEventoSeguimiento['canal'],
        estado,
        notificacionId: notificacion?.id ?? idNotificacionDeEvento(aviso.evento),
        ...(notificacion?.provider ? { provider: notificacion.provider } : {}),
        ...(notificacion?.externalId ? { externalId: notificacion.externalId } : {}),
        intentos: notificacion?.intentos ?? 0,
        ...(motivo && estado !== 'ENVIADA' ? { motivo } : {}),
        actualizadoEn: ahora().toISOString(),
      };
    } catch (err) {
      return {
        ...base,
        canal,
        estado: 'PENDIENTE',
        motivo: err instanceof Error ? err.message : 'error_dispatcher',
        intentos: 1,
      };
    }
  };
}
