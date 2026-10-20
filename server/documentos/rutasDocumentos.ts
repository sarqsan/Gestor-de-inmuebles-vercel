/**
 * AG-03.2 · Rutas HTTP de custodia documental (`/api/documentos/*`).
 *
 * El navegador nunca habla con Firebase Storage por el SDK: pide aquí una
 * sesión de subida (autorizada contra la base Firestore con nombre), envía los
 * bytes DIRECTAMENTE a Cloud Storage (sin pasar por Vercel) y confirma; las
 * lecturas y borrados también se autorizan aquí. Los cuerpos de estas rutas son
 * JSON pequeños: el límite de 4,5 MB de cuerpo de las funciones de Vercel no
 * afecta a los documentos.
 *
 * Sin Firestore/Storage reales (`servicio === null`) las rutas contestan 503 y
 * no degradan a memoria (AG-04: fallo cerrado).
 */
import type { Express, Request, Response, RequestHandler } from 'express';
import { tokenDe } from '../titularidades/manejadorBuscarTitulares.js';
import type { IdentidadVerificada } from '../titularidades/googleBackend.js';
import { ErrorDocumental, type ServicioDocumentos, type AccesoPublicoSolicitud } from './servicioDocumentos.js';

export interface DependenciasRutasDocumentos {
  verificarToken: (token: string) => Promise<IdentidadVerificada | null>;
  servicio: ServicioDocumentos | null;
}

const MENSAJES: Record<string, string> = {
  PETICION_INVALIDA: 'La solicitud no es válida.',
  NO_AUTENTICADO: 'Inicia sesión para continuar.',
  SIN_PERMISO: 'No tienes autorización sobre este documento.',
  RUTA_NO_ADMITIDA: 'La ubicación del documento no está admitida.',
  ARCHIVO_INVALIDO: 'El archivo no es de un tipo admitido para este destino.',
  ARCHIVO_DEMASIADO_GRANDE: 'El archivo supera el tamaño máximo admitido para este destino.',
  OBJETO_NO_ENCONTRADO: 'El documento no existe en el almacén.',
  OBJETO_EXISTENTE: 'Ya existe un documento distinto con ese nombre.',
  OBJETO_INCOMPLETO: 'La subida no se completó o el archivo no coincide con lo declarado. Vuelve a intentarlo.',
  SOLICITUD_NO_VALIDA: 'El enlace de la solicitud no es válido o ha caducado.',
  ALMACEN_NO_DISPONIBLE: 'El almacenamiento durable no está disponible. No se confirmó la operación.',
  FUENTE_NO_DISPONIBLE: 'La fuente durable no está disponible. No se confirmó la operación.',
};

function errorHTTP(res: Response, error: unknown): void {
  if (error instanceof ErrorDocumental) {
    res.status(error.status).json({
      ok: false,
      codigo: error.codigo,
      ...(error.motivo ? { motivo: error.motivo } : {}),
      error: MENSAJES[error.codigo] || 'Operación no disponible.',
    });
    return;
  }
  res.status(503).json({ ok: false, codigo: 'FUENTE_NO_DISPONIBLE', error: MENSAJES.FUENTE_NO_DISPONIBLE });
}

function cuerpo(req: Request, permitidas: readonly string[]): Record<string, unknown> {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ErrorDocumental('PETICION_INVALIDA', 400, 'CUERPO_INVALIDO');
  for (const clave of Object.keys(body)) {
    if (!permitidas.includes(clave)) throw new ErrorDocumental('PETICION_INVALIDA', 400, `CAMPO_${clave.slice(0, 32)}`);
  }
  return body as Record<string, unknown>;
}

function textoRequerido(valor: unknown, campo: string, max = 1200): string {
  if (typeof valor !== 'string' || !valor.trim() || valor.length > max) {
    throw new ErrorDocumental('PETICION_INVALIDA', 400, `CAMPO_${campo}`);
  }
  return valor;
}

function metadatosOpcionales(valor: unknown): Record<string, string> | undefined {
  if (valor === undefined) return undefined;
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new ErrorDocumental('PETICION_INVALIDA', 400, 'CAMPO_customMetadata');
  return valor as Record<string, string>;
}

function origenDe(req: Request): string | undefined {
  const origen = String(req.headers.origin || '').trim();
  return /^https?:\/\/[A-Za-z0-9.:\-[\]]+$/.test(origen) && origen.length < 300 ? origen : undefined;
}

function publicoDe(body: Record<string, unknown>): AccesoPublicoSolicitud {
  return {
    solicitudDocId: textoRequerido(body.solicitudDocId, 'solicitudDocId', 200),
    token: textoRequerido(body.token, 'token', 200),
  };
}

function crearGuardia(deps: DependenciasRutasDocumentos, exigirSesion: boolean): RequestHandler {
  return async (req, res, next): Promise<void> => {
    if (!deps.servicio) {
      res.status(503).json({ ok: false, codigo: 'CUSTODIA_NO_DISPONIBLE', error: 'La custodia documental no está configurada en este despliegue.' });
      return;
    }
    const token = tokenDe(req);
    if (!token) {
      if (exigirSesion) {
        res.status(401).json({ ok: false, codigo: 'NO_AUTENTICADO', error: MENSAJES.NO_AUTENTICADO });
        return;
      }
      res.locals.identidadDocumentos = null;
      next();
      return;
    }
    let identidad: IdentidadVerificada | null = null;
    try { identidad = await deps.verificarToken(token); }
    catch { identidad = null; }
    if (!identidad?.uid) {
      res.status(401).json({ ok: false, codigo: 'NO_AUTENTICADO', error: 'La sesión no es válida o ha caducado.' });
      return;
    }
    res.locals.identidadDocumentos = identidad;
    next();
  };
}

function identidadDe(res: Response): IdentidadVerificada {
  return res.locals.identidadDocumentos as IdentidadVerificada;
}

export function montarRutasDocumentos(app: Express, deps: DependenciasRutasDocumentos): void {
  const conSesion = crearGuardia(deps, true);
  const portal = crearGuardia(deps, false);

  const servicio = (): ServicioDocumentos => {
    if (!deps.servicio) throw new ErrorDocumental('FUENTE_NO_DISPONIBLE', 503);
    return deps.servicio;
  };

  // 1) Inicio de subida (sesión reanudable firmada por el servidor).
  app.post('/api/documentos/subidas', conSesion, async (req, res) => {
    try {
      const body = cuerpo(req, ['storagePath', 'contentType', 'tamanoBytes', 'customMetadata']);
      const resultado = await servicio().iniciarSubida({
        identidad: identidadDe(res),
        storagePath: textoRequerido(body.storagePath, 'storagePath'),
        contentType: textoRequerido(body.contentType, 'contentType', 160),
        tamanoBytes: body.tamanoBytes as number,
        customMetadata: metadatosOpcionales(body.customMetadata),
        origen: origenDe(req),
      });
      res.status(200).json({ ok: true, ...resultado });
    } catch (error) {
      errorHTTP(res, error);
    }
  });

  // 2) Confirmación (sin estado: el objeto real es la única fuente).
  app.post('/api/documentos/subidas/confirmar', conSesion, async (req, res) => {
    try {
      const body = cuerpo(req, ['storagePath']);
      const resultado = await servicio().confirmarSubida({
        identidad: identidadDe(res),
        storagePath: textoRequerido(body.storagePath, 'storagePath'),
      });
      res.status(200).json({ ok: true, ...resultado });
    } catch (error) {
      errorHTTP(res, error);
    }
  });

  // 3) Acceso de lectura (URL con token, rotada en los destinos que lo exigen).
  app.post('/api/documentos/acceso', conSesion, async (req, res) => {
    try {
      const body = cuerpo(req, ['storagePath']);
      const resultado = await servicio().acceso({
        identidad: identidadDe(res),
        storagePath: textoRequerido(body.storagePath, 'storagePath'),
      });
      res.status(200).json({ ok: true, ...resultado });
    } catch (error) {
      errorHTTP(res, error);
    }
  });

  // 4) Borrado.
  app.post('/api/documentos/borrar', conSesion, async (req, res) => {
    try {
      const body = cuerpo(req, ['storagePath']);
      const resultado = await servicio().borrar({
        identidad: identidadDe(res),
        storagePath: textoRequerido(body.storagePath, 'storagePath'),
      });
      res.status(200).json({ ok: true, ...resultado });
    } catch (error) {
      errorHTTP(res, error);
    }
  });

  // 5) Portal público de candidatos: sólo CREAR en documentos_solicitados/{sol}/{fichero}
  //    con el token de la solicitud verificado en la base con nombre. Si llega
  //    una sesión válida se usa su identidad (ámbito normal) en lugar del token.
  app.post('/api/documentos/publico/subidas', portal, async (req, res) => {
    try {
      const body = cuerpo(req, ['storagePath', 'contentType', 'tamanoBytes', 'customMetadata', 'solicitudDocId', 'token']);
      const identidad = res.locals.identidadDocumentos as IdentidadVerificada | null;
      const resultado = await servicio().iniciarSubida({
        identidad,
        publico: publicoDe(body),
        storagePath: textoRequerido(body.storagePath, 'storagePath'),
        contentType: textoRequerido(body.contentType, 'contentType', 160),
        tamanoBytes: body.tamanoBytes as number,
        customMetadata: metadatosOpcionales(body.customMetadata),
        origen: origenDe(req),
      });
      res.status(200).json({ ok: true, ...resultado });
    } catch (error) {
      errorHTTP(res, error);
    }
  });

  app.post('/api/documentos/publico/subidas/confirmar', portal, async (req, res) => {
    try {
      const body = cuerpo(req, ['storagePath', 'solicitudDocId', 'token']);
      const identidad = res.locals.identidadDocumentos as IdentidadVerificada | null;
      const resultado = await servicio().confirmarSubida({
        identidad,
        publico: publicoDe(body),
        storagePath: textoRequerido(body.storagePath, 'storagePath'),
      });
      res.status(200).json({ ok: true, ...resultado });
    } catch (error) {
      errorHTTP(res, error);
    }
  });
}
