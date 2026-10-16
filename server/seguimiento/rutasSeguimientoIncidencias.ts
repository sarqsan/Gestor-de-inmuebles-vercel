/**
 * FASE 6 — RUTAS DEL SEGUIMIENTO DE INCIDENCIAS
 * ============================================
 *   GET  /api/incidencias/seguimiento?incidenciaId=…  — evolución del hilo
 *   POST /api/incidencias/seguimiento/sincronizar     — observa la incidencia
 *        en Firestore y registra/avisa SÓLO si algo ha cambiado de verdad.
 *
 * Autorización SIEMPRE en servidor (token verificado → `usuarios_auth` veraz →
 * autorización por incidencia). El cuerpo del cliente no puede ampliar el
 * alcance: `incidenciaId` es lo único que se acepta, y el servidor decide qué
 * se puede leer y qué se avisa. Sin fuente autorizada o sin token ⇒ se deniega.
 */
import type { Express, RequestHandler } from 'express';
import { tokenDe } from '../titularidades/manejadorBuscarTitulares.js';
import type { IdentidadVerificada } from '../titularidades/googleBackend.js';
import { pasosEvolucionIncidencia } from '../../src/seguimiento/incidencias.js';
import type {
  EventoLogSeguimiento,
  ServicioSeguimientoIncidencias,
} from './seguimientoIncidencias.js';

export const PATRON_ID_INCIDENCIA = /^[A-Za-z0-9_-]{1,200}$/;

export interface DependenciasRutasSeguimientoIncidencias {
  verificarToken: (token: string) => Promise<IdentidadVerificada | null>;
  /** `null` sin credencial de servicio: las rutas responden 503 y no inventan datos. */
  servicio: ServicioSeguimientoIncidencias | null;
  ahora?: () => Date;
  log?: (evento: EventoLogSeguimiento & { evento: 'SEGUIMIENTO_RECHAZADO'; codigo?: string }) => void;
}

function idIncidenciaDe(req: { query: unknown; body: unknown }): string | null {
  const query = (req.query ?? {}) as Record<string, unknown>;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const bruto = query.incidenciaId ?? body.incidenciaId;
  if (typeof bruto !== 'string' || !PATRON_ID_INCIDENCIA.test(bruto.trim())) return null;
  return bruto.trim();
}

export function crearGuardiaSeguimientoIncidencias(
  deps: DependenciasRutasSeguimientoIncidencias,
): RequestHandler {
  return async function guardiaSeguimientoIncidencias(req, res, next): Promise<void> {
    const responder = (codigoHttp: number, codigo: string, mensaje: string): void => {
      res.status(codigoHttp).json({ error: mensaje, codigo });
    };
    if (!deps.servicio) {
      return void responder(503, 'SEGUIMIENTO_NO_DISPONIBLE', 'El seguimiento no está configurado (sin credencial de servicio).');
    }
    const token = tokenDe(req);
    if (!token) return void responder(401, 'NO_AUTENTICADO', 'Inicia sesión para consultar el seguimiento.');
    let identidad: IdentidadVerificada | null = null;
    try {
      identidad = await deps.verificarToken(token);
    } catch {
      identidad = null;
    }
    if (!identidad?.uid) return void responder(401, 'NO_AUTENTICADO', 'La sesión no es válida o ha caducado.');
    res.locals.uidSeguimientoIncidencias = identidad.uid;
    next();
  };
}

export function montarRutasSeguimientoIncidencias(
  app: Express,
  deps: DependenciasRutasSeguimientoIncidencias,
): void {
  const guardia = crearGuardiaSeguimientoIncidencias(deps);

  app.get('/api/incidencias/seguimiento', guardia, async (req, res) => {
    const servicio = deps.servicio;
    if (!servicio) return res.status(503).json({ error: 'Seguimiento no configurado.', codigo: 'SEGUIMIENTO_NO_DISPONIBLE' });
    const incidenciaId = idIncidenciaDe(req);
    if (!incidenciaId) return res.status(400).json({ error: 'Falta el identificador de la incidencia.', codigo: 'PETICION_INVALIDA' });
    const uid = String(res.locals.uidSeguimientoIncidencias ?? '');
    const resultado = await servicio.leer({ uid, incidenciaId });
    if (resultado.estado === 'RECHAZADO') {
      return res.status(resultado.codigoHttp).json({ error: 'No autorizado o no disponible.', codigo: resultado.codigo });
    }
    return res.json({
      ok: true,
      incidenciaId,
      autorizadoComo: resultado.autorizadoComo,
      // La evolución se sirve ya como pasos legibles (mismos datos del hilo).
      pasos: pasosEvolucionIncidencia(resultado.hilo),
      hilo: resultado.hilo
        ? { version: resultado.hilo.version, actualizadoEn: resultado.hilo.actualizadoEn, eventos: resultado.hilo.eventos.length }
        : null,
    });
  });

  app.post('/api/incidencias/seguimiento/sincronizar', guardia, async (req, res) => {
    const servicio = deps.servicio;
    if (!servicio) return res.status(503).json({ error: 'Seguimiento no configurado.', codigo: 'SEGUIMIENTO_NO_DISPONIBLE' });
    const incidenciaId = idIncidenciaDe(req);
    if (!incidenciaId) return res.status(400).json({ error: 'Falta el identificador de la incidencia.', codigo: 'PETICION_INVALIDA' });
    const cuerpo = (req.body ?? {}) as Record<string, unknown>;
    const uid = String(res.locals.uidSeguimientoIncidencias ?? '');
    const resultado = await servicio.sincronizar({
      uid,
      incidenciaId,
      // Sólo un booleano explícito del inquilino (Fase 5); el resto no se acepta.
      ...(cuerpo.derivacionSolicitada === true ? { derivacionSolicitada: true } : {}),
    });
    if (resultado.estado === 'RECHAZADO') {
      return res.status(resultado.codigoHttp).json({ error: 'No autorizado o no disponible.', codigo: resultado.codigo });
    }
    return res.json({
      ok: true,
      estado: resultado.estado,
      eventos: (resultado.estado === 'OK' ? resultado.eventos : []).map((evento) => ({
        id: evento.id,
        tipo: evento.tipo,
        creadoEn: evento.creadoEn,
        requiereAtencion: evento.requiereAtencion,
        entrega: evento.entrega ? { estado: evento.entrega.estado, canal: evento.entrega.canal } : null,
      })),
      reintentos: resultado.reintentos,
    });
  });
}
