/**
 * H-04 — TOPE DE CUERPO POR BYTES REALES, NO POR CABECERA
 * =======================================================
 * El límite anterior de las rutas públicas leía `Content-Length`. Un cliente
 * puede omitirlo (`Transfer-Encoding: chunked`) y colar un cuerpo de cualquier
 * tamaño: la auditoría de cierre lo reprodujo (413 con cabecera, 503/200 con
 * chunked). Aquí el tope lo aplica `raw-body` dentro de `express.json`, que
 * CUENTA los bytes que llegan del stream: si se supera, corta con 413 sin
 * importar cómo se haya troceado la petición.
 *
 * `type: () => true` es deliberado: en estas rutas públicas sólo se acepta JSON
 * y así ningún otro parser (urlencoded / multipart) puede consumir el cuerpo
 * después con un límite mayor.
 */
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';

export interface OpcionesLimiteCuerpo {
  /** Tope en bytes. */
  maxBytes: number;
}

/** Parser JSON con tope por bytes contados (funciona con `chunked`). */
export function parserJsonAcotado(maxBytes: number): RequestHandler {
  return express.json({ limit: Math.max(1, Math.floor(maxBytes)), type: () => true });
}

/** Rechazo temprano por cabecera: ahorra leer el stream; NO es la garantía. */
export function rechazarPorCabecera(maxBytes: number): RequestHandler {
  return (req, res, next) => {
    const declarado = Number(req.headers?.['content-length'] || 0);
    if (Number.isFinite(declarado) && declarado > maxBytes) {
      res.status(413).json({ ok: false, codigo: 'PETICION_INVALIDA', error: 'La solicitud es demasiado grande.' });
      return;
    }
    next();
  };
}

/** Traduce el 413 del parser a un JSON estable (por defecto Express devuelve HTML). */
export function manejadorCuerpoDemasiadoGrande(): ErrorRequestHandler {
  return (error, _req, res, next) => {
    const err = error as { type?: string; status?: number; statusCode?: number };
    if (err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413) {
      res.status(413).json({ ok: false, codigo: 'PETICION_INVALIDA', error: 'La solicitud es demasiado grande.' });
      return;
    }
    next(error);
  };
}

/** Composición para las rutas públicas: cabecera + bytes + error JSON. */
export function limitarCuerpoPublico(maxBytes: number): RequestHandler[] {
  return [rechazarPorCabecera(maxBytes), parserJsonAcotado(maxBytes)];
}
