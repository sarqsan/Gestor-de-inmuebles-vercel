import type { Express, RequestHandler, Response } from 'express';
import { tokenDe } from '../titularidades/manejadorBuscarTitulares.js';
import type { IdentidadVerificada } from '../titularidades/googleBackend.js';
import { ErrorActualizacionRenta, type ServicioActualizacionRenta, type EvidenciaComunicacionP4 } from './servicioActualizacionRenta.js';

export interface DependenciasRutasActualizacionRenta {
  verificarToken: (token: string) => Promise<IdentidadVerificada | null>;
  /** Sin servicio Firestore real, las rutas deniegan con 503; no usan memoria. */
  servicio: ServicioActualizacionRenta | null;
}

function evidenciaValida(valor: unknown): valor is EvidenciaComunicacionP4 {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return false;
  const e = valor as Record<string, unknown>;
  return Object.keys(e).sort().join(',') === 'declaradaPorActor,fecha,referenciaDocumental'
    && e.declaradaPorActor === true && typeof e.fecha === 'string' && typeof e.referenciaDocumental === 'string';
}

function bodyEsValido(body: unknown): body is { contratoId: string; evidenciaComunicacion?: EvidenciaComunicacionP4 } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const datos = body as Record<string, unknown>;
  return typeof datos.contratoId === 'string'
    && (Object.keys(datos).sort().join(',') === 'contratoId'
      || (Object.keys(datos).sort().join(',') === 'contratoId,evidenciaComunicacion' && evidenciaValida(datos.evidenciaComunicacion)));
}

function bodyConfirmacionEsValido(body: unknown): body is {
  contratoId: string;
  huellaPreview: string;
  fechaProgramadaAviso: string;
  confirmacionExplicita: boolean;
  evidenciaComunicacion: EvidenciaComunicacionP4;
} {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const datos = body as Record<string, unknown>;
  const claves = Object.keys(datos).sort();
  return claves.length === 5
    && claves.join(',') === 'confirmacionExplicita,contratoId,evidenciaComunicacion,fechaProgramadaAviso,huellaPreview'
    && typeof datos.contratoId === 'string'
    && typeof datos.huellaPreview === 'string'
    && typeof datos.fechaProgramadaAviso === 'string'
    && typeof datos.confirmacionExplicita === 'boolean' && evidenciaValida(datos.evidenciaComunicacion);
}

function errorHTTP(res: Response, error: unknown): void {
  if (error instanceof ErrorActualizacionRenta) {
    const mensajes: Record<string, string> = {
      EVIDENCIA_COMUNICACION_REQUERIDA: 'Indica fecha y referencia de comunicación ya realizada y declara expresamente su evidencia.',
      FECHA_EFECTIVIDAD_NO_APLICABLE: 'La efectividad debe haber llegado y no puede preceder a la anualidad. No se ha aplicado la renta.',
      PETICION_INVALIDA: 'La solicitud de P4 no es válida.',
      PERFIL_NO_VALIDO: 'La cuenta no está activa o no tiene un perfil verificable.',
      CONTRATO_NO_AUTORIZADO: 'No hay autorización para este contrato.',
      FUENTE_NO_DISPONIBLE: 'No se pudo verificar el resultado de la operación. Reintenta con la misma clave para recuperar una posible confirmación sin duplicarla.',
      CONFIRMACION_EXPLICITA_REQUERIDA: 'La confirmación expresa del actor es obligatoria.',
      FECHA_PROGRAMADA_INVALIDA: 'Indica una fecha de comunicación programada válida, hoy o futura.',
      IDEMPOTENCY_KEY_INVALIDA: 'Falta una clave de idempotencia válida.',
      IDEMPOTENCY_KEY_REUTILIZADA: 'La clave de idempotencia ya se usó con otros datos.',
      PREVIEW_REQUIERE_REVISION: 'La normativa o la evidencia exige revisión; no se creó ningún anexo ni aviso.',
      PREVIEW_DESACTUALIZADO: 'El contrato, la evidencia o las fuentes cambiaron; solicita un preview nuevo.',
      ACTUALIZACION_YA_CONFIRMADA: 'Ya existe una confirmación para esta anualidad; no se duplicó.',
    };
    res.status(error.status).json({ ok: false, codigo: error.codigo, error: mensajes[error.codigo] || 'La operación P4 no se completó.' });
    return;
  }
  res.status(503).json({ ok: false, codigo: 'FUENTE_NO_DISPONIBLE', error: 'La operación P4 no se completó.' });
}

function crearGuardia(deps: DependenciasRutasActualizacionRenta): RequestHandler {
  return async (req, res, next): Promise<void> => {
    if (!deps.servicio) {
      res.status(503).json({ ok: false, codigo: 'P4_NO_DISPONIBLE', error: 'P4 requiere Firestore de servidor.' });
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
    res.locals.uidActualizacionRenta = identidad.uid;
    next();
  };
}

export function montarRutasActualizacionRenta(app: Express, deps: DependenciasRutasActualizacionRenta): void {
  const guardia = crearGuardia(deps);
  app.post('/api/contratos/actualizacion-renta/previsualizar', guardia, async (req, res) => {
    try {
      if (!bodyEsValido(req.body)) throw new ErrorActualizacionRenta('PETICION_INVALIDA', 400);
      const resultado = await deps.servicio!.previsualizar({
        uid: String(res.locals.uidActualizacionRenta || ''),
        contratoId: req.body.contratoId,
        ...(req.body.evidenciaComunicacion ? { evidenciaComunicacion: req.body.evidenciaComunicacion } : {}),
      });
      res.status(200).json({ ok: true, ...resultado });
    } catch (error) {
      errorHTTP(res, error);
    }
  });

  app.post('/api/contratos/actualizacion-renta/confirmar', guardia, async (req, res) => {
    try {
      if (!bodyConfirmacionEsValido(req.body)) throw new ErrorActualizacionRenta('PETICION_INVALIDA', 400);
      const cabecera = req.get('Idempotency-Key');
      if (!cabecera) throw new ErrorActualizacionRenta('IDEMPOTENCY_KEY_INVALIDA', 400);
      const resultado = await deps.servicio!.confirmar({
        uid: String(res.locals.uidActualizacionRenta || ''),
        contratoId: req.body.contratoId,
        ...(req.body.evidenciaComunicacion ? { evidenciaComunicacion: req.body.evidenciaComunicacion } : {}),
        huellaPreview: req.body.huellaPreview,
        fechaProgramadaAviso: req.body.fechaProgramadaAviso,
        confirmacionExplicita: req.body.confirmacionExplicita,
        idempotencyKey: cabecera || '',
      });
      res.status(resultado.estado === 'CREADA' ? 201 : 200).json({
        ok: true,
        ...resultado,
        nota: 'Consulta estadoActualizacion y fechaEfectividad del registro; PENDIENTE_ENVIO no acredita envío ni recepción.',
      });
    } catch (error) {
      errorHTTP(res, error);
    }
  });
}
