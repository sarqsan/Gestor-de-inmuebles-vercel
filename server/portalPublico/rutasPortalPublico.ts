/**
 * AG-02 — RUTAS HTTP PÚBLICAS DE LOS PORTAALES DE CANDIDATOS
 * =========================================================
 * Sustituyen a las lecturas/escrituras anónimas que `firestore.rules` deniega
 * desde 2026-10-14. La autorización es el token del enlace (capacidad), que el
 * servicio resuelve contra la base Firestore con nombre; no hay sesión.
 *
 * Superficies (las mismas que anuncian los comentarios de las reglas):
 *   GET  /api/visita/:token              → invitación + slots del inmueble
 *   POST /api/visita/:token/reservar     → reserva atómica
 *   POST /api/visita/:token/cancelar     → libera el horario
 *   GET  /api/cuestionario/:token        → candidato (lista blanca)
 *   POST /api/cuestionario/:token        → respuestas + datos del formulario
 *   GET  /api/documentacion/:token       → solicitud post-visita (lista blanca)
 *   POST /api/documentacion/:token       → aportación documental
 *
 * Sin servicio (falta Firestore de servicio) todas responden 503: no se
 * degrada a memoria. Ninguna respuesta se cachea.
 */
import type { Express, Request, Response } from 'express';
import { ErrorPortalPublico, type ServicioPortalPublico } from './servicioPortalPublico.js';
import { crearLimitadorVentana, claveClientePeticion, type LimitadorVentana } from '../shared/rateLimit.js';

export const RUTAS_PORTAL_PUBLICO = {
  visita: '/api/visita/:token',
  reservarVisita: '/api/visita/:token/reservar',
  cancelarVisita: '/api/visita/:token/cancelar',
  cuestionario: '/api/cuestionario/:token',
  documentacion: '/api/documentacion/:token',
  solicitud: '/api/solicitud/:token',
} as const;

/** Cuerpo máximo de estas rutas (JSON pequeño; los binarios van a Storage). */
export const MAX_CUERPO_PORTAL_PUBLICO = 256 * 1024;

const MENSAJES: Record<string, string> = {
  ENLACE_NO_VALIDO: 'El enlace no es válido o ha caducado.',
  HORARIO_NO_DISPONIBLE: 'Ese horario ya no está disponible. Elige otro, por favor.',
  YA_RESERVADO: 'Este enlace ya tiene una visita reservada.',
  CANDIDATO_NO_ENCONTRADO: 'No se ha podido localizar la candidatura de este enlace.',
  PETICION_INVALIDA: 'La solicitud no es válida.',
  FUENTE_NO_DISPONIBLE: 'El servicio no está disponible en este momento. Inténtalo de nuevo.',
  CONFLICTO: 'La información ha cambiado mientras la enviabas. Recarga el enlace e inténtalo de nuevo.',
};

export interface DependenciasRutasPortalPublico {
  /** `null` ⇒ 503 en todas las rutas (sin credencial de servicio). */
  servicio: ServicioPortalPublico | null;
  /** Inyectable para pruebas deterministas; por defecto 8 altas/minuto por IP+token. */
  limitador?: LimitadorVentana;
  /**
   * H-05 — Cuotas POR RUTA. Antes sólo el alta de solicitud tenía cuota; las
   * demás superficies públicas (reserva/cancelación de visita, cuestionario y
   * documentación) se podían martillear sin límite. Cada una tiene ahora su
   * propia ventana y todas comparten honeypot.
   */
  limitadores?: {
    visita?: LimitadorVentana;
    cuestionario?: LimitadorVentana;
    documentacion?: LimitadorVentana;
    lectura?: LimitadorVentana;
  };
}

function sinCache(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}

function responderError(res: Response, error: unknown): void {
  sinCache(res);
  if (error instanceof ErrorPortalPublico) {
    res.status(error.status).json({
      ok: false,
      codigo: error.codigo,
      ...(error.motivo ? { motivo: error.motivo } : {}),
      error: MENSAJES[error.codigo] || MENSAJES.PETICION_INVALIDA,
    });
    return;
  }
  res.status(503).json({ ok: false, codigo: 'FUENTE_NO_DISPONIBLE', error: MENSAJES.FUENTE_NO_DISPONIBLE });
}

function exigirServicio(servicio: ServicioPortalPublico | null, res: Response): servicio is ServicioPortalPublico {
  if (servicio) return true;
  sinCache(res);
  res.status(503).json({
    ok: false,
    codigo: 'PORTAL_NO_DISPONIBLE',
    error: 'Los portales públicos no están configurados en este despliegue.',
  });
  return false;
}

function cuerpoPequeno(req: Request, res: Response): boolean {
  const declarado = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(declarado) && declarado > MAX_CUERPO_PORTAL_PUBLICO) {
    sinCache(res);
    res.status(413).json({ ok: false, codigo: 'PETICION_INVALIDA', error: 'La solicitud es demasiado grande.' });
    return false;
  }
  return true;
}

function cuerpo(req: Request, res: Response, permitidas: readonly string[]): Record<string, unknown> | null {
  if (!cuerpoPequeno(req, res)) return null;
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    sinCache(res);
    res.status(400).json({ ok: false, codigo: 'PETICION_INVALIDA', error: MENSAJES.PETICION_INVALIDA });
    return null;
  }
  for (const clave of Object.keys(body as Record<string, unknown>)) {
    if (!permitidas.includes(clave)) {
      sinCache(res);
      res.status(400).json({
        ok: false,
        codigo: 'PETICION_INVALIDA',
        motivo: `CAMPO_${clave.slice(0, 32)}`,
        error: MENSAJES.PETICION_INVALIDA,
      });
      return null;
    }
  }
  return body as Record<string, unknown>;
}

async function ejecutar(res: Response, tarea: () => Promise<unknown>): Promise<void> {
  try {
    const datos = await tarea();
    sinCache(res);
    res.status(200).json({ ok: true, ...(datos as Record<string, unknown>) });
  } catch (error) {
    responderError(res, error);
  }
}

export function montarRutasPortalPublico(app: Express, deps: DependenciasRutasPortalPublico): void {
  const { servicio } = deps;
  const limitador = deps.limitador ?? crearLimitadorVentana({ limite: 8, ventanaMs: 60_000 });
  const limiteVisitas = deps.limitadores?.visita ?? crearLimitadorVentana({ limite: 12, ventanaMs: 60_000 });
  const limiteCuestionario = deps.limitadores?.cuestionario ?? crearLimitadorVentana({ limite: 8, ventanaMs: 60_000 });
  const limiteDocumentacion = deps.limitadores?.documentacion ?? crearLimitadorVentana({ limite: 8, ventanaMs: 60_000 });
  const limiteLectura = deps.limitadores?.lectura ?? crearLimitadorVentana({ limite: 40, ventanaMs: 60_000 });

  /** H-05 — cuota por IP + token de capacidad + ruta. 429 explícito con Retry-After. */
  function aplicarCuota(req: Request, res: Response, limitadorRuta: LimitadorVentana, etiqueta: string): boolean {
    const cuota = limitadorRuta.permitir(claveClientePeticion(
      req.headers as Record<string, unknown>,
      `${etiqueta}|${String(req.params.token || '')}`,
      req.ip || (req.socket?.remoteAddress ?? ''),
    ));
    if (cuota.permitido) return true;
    sinCache(res);
    res.setHeader('Retry-After', String(cuota.reintentarEnSegundos));
    res.status(429).json({
      ok: false,
      codigo: 'DEMASIADAS_PETICIONES',
      error: 'Demasiadas solicitudes desde esta conexión. Inténtalo de nuevo en unos minutos.',
      reintentarEnSegundos: cuota.reintentarEnSegundos,
    });
    return false;
  }

  // P0.2.3 — Honeypot: un campo que ningún formulario legítimo rellena. Si
  // viene con contenido se rechaza ANTES de tocar el servicio (ni se escribe).
  function honeypot(body: Record<string, unknown>, res: Response): boolean {
    const senuelo = body._hp;
    if (senuelo !== undefined && senuelo !== null && String(senuelo).trim() !== '') {
      sinCache(res);
      res.status(400).json({ ok: false, codigo: 'PETICION_INVALIDA', error: MENSAJES.PETICION_INVALIDA });
      return false;
    }
    return true;
  }

  // P0.2.1/P0.2.3 — alta pública de solicitud: token + honeypot + rate limit.
  // El cliente anónimo NO escribe en Firestore: lo hace el servidor con la
  // credencial de servicio y con precondición de «documento no existente».
  app.post(RUTAS_PORTAL_PUBLICO.solicitud, async (req, res) => {
    if (!exigirServicio(servicio, res)) return;
    const body = cuerpo(req, res, ['solicitud', 'candidato', '_hp']);
    if (!body || !honeypot(body, res)) return;
    if (!body.solicitud || typeof body.solicitud !== 'object' || Array.isArray(body.solicitud)) {
      sinCache(res);
      res.status(400).json({ ok: false, codigo: 'PETICION_INVALIDA', error: MENSAJES.PETICION_INVALIDA });
      return;
    }
    if (!aplicarCuota(req, res, limitador, 'solicitud')) return;
    await ejecutar(res, () =>
      servicio.crearSolicitud(req.params.token, {
        solicitud: body.solicitud as Record<string, unknown>,
        candidato: body.candidato as Record<string, unknown> | undefined,
      })
    );
  });

  app.get(RUTAS_PORTAL_PUBLICO.visita, async (req, res) => {
    if (!exigirServicio(servicio, res)) return;
    if (!aplicarCuota(req, res, limiteLectura, 'visita-get')) return;
    await ejecutar(res, () => servicio.obtenerVisita(req.params.token));
  });

  app.post(RUTAS_PORTAL_PUBLICO.reservarVisita, async (req, res) => {
    if (!exigirServicio(servicio, res)) return;
    if (!aplicarCuota(req, res, limiteVisitas, 'visita-reservar')) return;
    const body = cuerpo(req, res, ['slotId', 'notas', '_hp']);
    if (!body || !honeypot(body, res)) return;
    await ejecutar(res, () =>
      servicio.reservarVisita(req.params.token, {
        slotId: body.slotId as string,
        notas: body.notas as string | undefined,
      })
    );
  });

  app.post(RUTAS_PORTAL_PUBLICO.cancelarVisita, async (req, res) => {
    if (!exigirServicio(servicio, res)) return;
    if (!aplicarCuota(req, res, limiteVisitas, 'visita-cancelar')) return;
    const body = cuerpo(req, res, ['_hp']);
    if (!body || !honeypot(body, res)) return;
    await ejecutar(res, () => servicio.cancelarVisita(req.params.token));
  });

  app.get(RUTAS_PORTAL_PUBLICO.cuestionario, async (req, res) => {
    if (!exigirServicio(servicio, res)) return;
    if (!aplicarCuota(req, res, limiteLectura, 'cuestionario-get')) return;
    await ejecutar(res, () => servicio.obtenerCuestionario(req.params.token));
  });

  app.post(RUTAS_PORTAL_PUBLICO.cuestionario, async (req, res) => {
    if (!exigirServicio(servicio, res)) return;
    if (!aplicarCuota(req, res, limiteCuestionario, 'cuestionario-post')) return;
    const body = cuerpo(req, res, ['datos', 'respuestas', 'informacionAdicional', '_hp']);
    if (!body || !honeypot(body, res)) return;
    await ejecutar(res, () =>
      servicio.guardarCuestionario(req.params.token, {
        datos: body.datos as Record<string, unknown>,
        respuestas: body.respuestas,
        informacionAdicional: body.informacionAdicional as string | undefined,
      })
    );
  });

  app.get(RUTAS_PORTAL_PUBLICO.documentacion, async (req, res) => {
    if (!exigirServicio(servicio, res)) return;
    if (!aplicarCuota(req, res, limiteLectura, 'documentacion-get')) return;
    await ejecutar(res, () => servicio.obtenerDocumentacion(req.params.token));
  });

  app.post(RUTAS_PORTAL_PUBLICO.documentacion, async (req, res) => {
    if (!exigirServicio(servicio, res)) return;
    if (!aplicarCuota(req, res, limiteDocumentacion, 'documentacion-post')) return;
    const body = cuerpo(req, res, ['documentos', 'final', '_hp']);
    if (!body || !honeypot(body, res)) return;
    await ejecutar(res, () =>
      servicio.actualizarDocumentacion(req.params.token, {
        documentos: body.documentos,
        final: body.final as boolean,
      })
    );
  });
}
