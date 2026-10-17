/** Rutas HTTP P2 para presentar, consultar y revisar justificantes de cobro. */
import express, { type Express, type Request, type Response, type RequestHandler } from 'express';
import { tokenDe } from '../titularidades/manejadorBuscarTitulares.js';
import type { IdentidadVerificada } from '../titularidades/googleBackend.js';
import {
  ErrorJustificanteCobro,
  MAX_BYTES_JUSTIFICANTE_COBRO,
  type ServicioJustificantesCobro,
} from './justificantesCobro.js';

export interface DependenciasRutasJustificantesCobro {
  verificarToken: (token: string) => Promise<IdentidadVerificada | null>;
  /** Sin Firestore o Storage real, las rutas contestan 503 y no degradan a memoria. */
  servicio: ServicioJustificantesCobro | null;
}

function errorHTTP(res: Response, error: unknown): void {
  if (error instanceof ErrorJustificanteCobro) {
    const mensajes: Record<string, string> = {
      PETICION_INVALIDA: 'La solicitud no es válida.',
      ARCHIVO_INVALIDO: 'El archivo no es PDF o imagen válida, o su tipo no coincide.',
      ARCHIVO_DEMASIADO_GRANDE: 'El archivo supera el límite de 4 MiB.',
      IMPORTE_INVALIDO: 'Indica el importe que figura en el justificante.',
      FECHA_INVALIDA: 'Indica una fecha de pago válida.',
      PERFIL_NO_VALIDO: 'La cuenta no está activa o no tiene un perfil verificable.',
      CONTRATO_NO_AUTORIZADO: 'No hay autorización para este contrato.',
      COBRO_NO_VALIDO: 'El recibo no corresponde a ese contrato o no admite esta acción.',
      JUSTIFICANTE_NO_ENCONTRADO: 'Justificante no encontrado o no autorizado.',
      JUSTIFICANTE_EN_CURSO: 'Ya hay un justificante pendiente para este recibo.',
      TRANSICION_INVALIDA: 'El estado cambió o la acción no está permitida.',
      CLAVE_IDEMPOTENCIA_REUTILIZADA: 'La clave de reintento ya se usó con otros datos.',
      CONFLICTO_CONCURRENCIA: 'El registro cambió durante la operación; actualiza e inténtalo de nuevo.',
      AUDITORIA_NO_DISPONIBLE: 'No se pudo completar la auditoría durable. Reintenta la misma acción.',
      ALMACEN_NO_DISPONIBLE: 'El almacenamiento durable no está disponible. No se confirmó la subida.',
      FUENTE_NO_DISPONIBLE: 'La fuente durable no está disponible. No se confirmó la operación.',
    };
    res.status(error.status).json({ ok: false, codigo: error.codigo, error: mensajes[error.codigo] || 'Operación no disponible.' });
    return;
  }
  res.status(503).json({ ok: false, codigo: 'FUENTE_NO_DISPONIBLE', error: 'No se pudo completar la operación durable.' });
}

function crearGuardia(deps: DependenciasRutasJustificantesCobro): RequestHandler {
  return async (req, res, next): Promise<void> => {
    if (!deps.servicio) {
      res.status(503).json({ ok: false, codigo: 'P2_NO_DISPONIBLE', error: 'El flujo de justificantes durables no está configurado.' });
      return;
    }
    const token = tokenDe(req);
    if (!token) {
      res.status(401).json({ ok: false, codigo: 'NO_AUTENTICADO', error: 'Inicia sesión para continuar.' });
      return;
    }
    let identidad: IdentidadVerificada | null = null;
    try { identidad = await deps.verificarToken(token); }
    catch { identidad = null; }
    if (!identidad?.uid) {
      res.status(401).json({ ok: false, codigo: 'NO_AUTENTICADO', error: 'La sesión no es válida o ha caducado.' });
      return;
    }
    res.locals.uidJustificantesCobro = identidad.uid;
    next();
  };
}

function idDeRequest(res: Response): string {
  return String(res.locals.uidJustificantesCobro || '');
}

function parserArchivo(): RequestHandler {
  const raw = express.raw({ type: '*/*', limit: MAX_BYTES_JUSTIFICANTE_COBRO });
  return (req, res, next) => raw(req, res, (error?: unknown) => {
    if (!error) return next();
    const codigo = (error as { type?: string })?.type;
    if (codigo === 'entity.too.large') {
      res.status(413).json({ ok: false, codigo: 'ARCHIVO_DEMASIADO_GRANDE', error: 'El archivo supera el límite de 4 MiB.' });
      return;
    }
    if (codigo === 'entity.parse.failed' || codigo === 'request.size.invalid') {
      res.status(400).json({ ok: false, codigo: 'ARCHIVO_INVALIDO', error: 'El contenido del archivo no es válido.' });
      return;
    }
    next(error);
  });
}

function decodificarNombreArchivo(valor: string | undefined): string {
  if (!valor || valor.length > 720) return '';
  try { return decodeURIComponent(valor); }
  catch { return ''; }
}

function encabezado(req: Request, nombre: string): string {
  return String(req.headers[nombre.toLowerCase()] || '').trim();
}

export function montarRutasJustificantesCobro(app: Express, deps: DependenciasRutasJustificantesCobro): void {
  const guardia = crearGuardia(deps);

  app.post('/api/cobros/justificantes/subir', guardia, parserArchivo(), async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body)) throw new ErrorJustificanteCobro('ARCHIVO_INVALIDO', 400);
      const metodo = encabezado(req, 'x-metodo-pago-declarado');
      const importe = encabezado(req, 'x-importe-declarado');
      const contentType = encabezado(req, 'content-type').split(';')[0].toLowerCase();
      const servicio = deps.servicio;
      if (!servicio) throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
      const resultado = await servicio.presentar({
        uid: idDeRequest(res),
        contratoId: encabezado(req, 'x-contrato-id'),
        cobroPeriodoId: encabezado(req, 'x-cobro-periodo-id'),
        claveIdempotencia: encabezado(req, 'idempotency-key'),
        nombreArchivo: decodificarNombreArchivo(encabezado(req, 'x-nombre-archivo')),
        tipoMime: contentType,
        importeDeclarado: importe ? Number(importe) : Number.NaN,
        fechaPagoDeclarada: encabezado(req, 'x-fecha-pago-declarada'),
        metodoPagoDeclarado: metodo as 'transferencia' | 'domiciliacion' | 'bizum' | 'efectivo' | 'otro',
        bytes: req.body,
      });
      res.status(200).json({ ok: true, ...resultado });
    } catch (error) {
      errorHTTP(res, error);
    }
  });

  app.post('/api/cobros/justificantes/consultar', guardia, async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      if (!body || Object.keys(body).some((key) => !['contratoIds', 'offset'].includes(key))
        || !Array.isArray(body.contratoIds)
        || body.contratoIds.some((id) => typeof id !== 'string')
        || (body.offset !== undefined && !Number.isInteger(body.offset))) {
        throw new ErrorJustificanteCobro('PETICION_INVALIDA', 400);
      }
      const servicio = deps.servicio;
      if (!servicio) throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
      const resultado = await servicio.listar({
        uid: idDeRequest(res),
        contratoIds: body.contratoIds as string[],
        ...(typeof body.offset === 'number' ? { offset: body.offset } : {}),
      });
      res.json({ ok: true, ...resultado });
    } catch (error) {
      errorHTTP(res, error);
    }
  });

  app.post('/api/cobros/justificantes/:id/decision', guardia, async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      if (!body || Object.keys(body).some((key) => !['accion', 'estadoCorregido', 'motivo', 'claveIdempotencia'].includes(key))) {
        throw new ErrorJustificanteCobro('PETICION_INVALIDA', 400);
      }
      const servicio = deps.servicio;
      if (!servicio) throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
      const resultado = await servicio.decidir({
        uid: idDeRequest(res),
        justificanteId: req.params.id,
        accion: body.accion as 'ACEPTAR' | 'RECHAZAR' | 'RECTIFICAR',
        ...(typeof body.estadoCorregido === 'string' ? { estadoCorregido: body.estadoCorregido as 'ACEPTADO' | 'RECHAZADO' } : {}),
        ...(typeof body.motivo === 'string' ? { motivo: body.motivo } : {}),
        claveIdempotencia: typeof body.claveIdempotencia === 'string' ? body.claveIdempotencia : '',
      });
      res.json({ ok: true, ...resultado });
    } catch (error) {
      errorHTTP(res, error);
    }
  });

  app.get('/api/cobros/justificantes/:id/auditoria', guardia, async (req, res) => {
    try {
      const servicio = deps.servicio;
      if (!servicio) throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
      const offset = typeof req.query.offset === 'string' ? Number(req.query.offset) : 0;
      if (!Number.isInteger(offset)) throw new ErrorJustificanteCobro('PETICION_INVALIDA', 400);
      const resultado = await servicio.auditoria({ uid: idDeRequest(res), justificanteId: req.params.id, offset });
      res.json({ ok: true, ...resultado });
    } catch (error) {
      errorHTTP(res, error);
    }
  });

  app.get('/api/cobros/justificantes/:id/archivo', guardia, async (req, res) => {
    try {
      const servicio = deps.servicio;
      if (!servicio) throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
      const eventoId = typeof req.query.eventoId === 'string' ? req.query.eventoId : undefined;
      const archivo = await servicio.descargar({
        uid: idDeRequest(res),
        justificanteId: req.params.id,
        ...(eventoId ? { eventoId } : {}),
      });
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', 'sandbox');
      res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombreArchivo}"`);
      res.setHeader('Content-Length', String(archivo.bytes.byteLength));
      res.status(200).type(archivo.tipoMime).send(Buffer.from(archivo.bytes));
    } catch (error) {
      errorHTTP(res, error);
    }
  });
}
