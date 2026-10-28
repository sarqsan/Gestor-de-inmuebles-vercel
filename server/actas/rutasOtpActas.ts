/**
 * H-07/H-08 — RUTAS DEL OTP DE ACTAS CON AUTORIDAD EN SERVIDOR
 * ==============================================================
 * `POST /api/actas/otp/solicitar`  · crea el código y lo entrega al firmante
 * `POST /api/actas/otp/validar`    · comprueba el código y acredita la firma
 *
 * La ruta antigua `POST /api/actas/otp/entregar` (relé de correo con destino
 * libre, H-08) queda RETIRADA de forma explícita con 410: no se puede usar para
 * enviar correo a una dirección arbitraria ni aunque un cliente antiguo siga
 * llamándola.
 */
import type { Express, Request } from 'express';
import { crearLimitadorVentana, claveClientePeticion, type LimitadorVentana } from '../shared/rateLimit.js';
import type { IdentidadVerificada } from '../titularidades/googleBackend.js';
import {
  solicitarOtpFirma,
  validarOtpYFirmar,
  type PuertoOtpActas,
  type ResultadoSolicitudOtp,
  type ResultadoValidacionOtp,
  type TransporteCorreoOtp,
} from './servicioOtpActas.js';

export interface DependenciasRutasOtpActas {
  verificarToken: (token: string) => Promise<IdentidadVerificada | null>;
  /** `null` ⇒ servidor sin credencial de servicio: 503, nunca memoria. */
  puerto: PuertoOtpActas | null;
  transporte: TransporteCorreoOtp;
  limitadorSolicitud?: LimitadorVentana;
  limitadorValidacion?: LimitadorVentana;
  limitadorIp?: LimitadorVentana;
}

function tokenDe(req: Request): string {
  const cabecera = req.headers?.authorization;
  return typeof cabecera === 'string' ? cabecera.replace(/^Bearer\s+/i, '').trim().slice(0, 4096) : '';
}

function cuerpo(req: Request): Record<string, unknown> {
  return (req.body ?? {}) as Record<string, unknown>;
}

function ipDe(req: Request): string {
  return String(req.ip || '').slice(0, 64);
}

const SIN_SERVIDOR = {
  ok: false,
  codigo: 'SERVIDOR_SIN_CONFIGURAR',
  error: 'El servidor no tiene credencial de servicio de Firestore: el OTP no se genera ni se valida en el cliente.',
} as const;

export function montarRutasOtpActas(app: Express, deps: DependenciasRutasOtpActas): void {
  const limitadorSolicitud = deps.limitadorSolicitud
    ?? crearLimitadorVentana({ limite: 4, ventanaMs: 10 * 60_000 });
  const limitadorValidacion = deps.limitadorValidacion
    ?? crearLimitadorVentana({ limite: 10, ventanaMs: 5 * 60_000 });
  const limitadorIp = deps.limitadorIp
    ?? crearLimitadorVentana({ limite: 40, ventanaMs: 5 * 60_000 });

  async function identidadDe(req: Request): Promise<IdentidadVerificada | null> {
    try {
      const identidad = await deps.verificarToken(tokenDe(req));
      return identidad && typeof identidad.uid === 'string' && identidad.uid ? identidad : null;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Solicitud: el SERVIDOR genera el código y lo envía al correo del firmante
  // -------------------------------------------------------------------------
  app.post('/api/actas/otp/solicitar', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const identidad = await identidadDe(req);
    if (!identidad) {
      return res.status(401).json({ ok: false, codigo: 'NO_AUTENTICADO', error: 'Se requiere una sesión verificada.' });
    }
    if (!deps.puerto) return res.status(503).json(SIN_SERVIDOR);

    const datos = cuerpo(req);
    const actaId = typeof datos.actaId === 'string' ? datos.actaId : '';
    const participanteId = typeof datos.participanteId === 'string' ? datos.participanteId : '';

    const cuotaIp = limitadorIp.permitir(claveClientePeticion(req.headers as Record<string, unknown>, 'otp-solicitar', ipDe(req)));
    if (!cuotaIp.permitido) {
      res.setHeader('Retry-After', String(cuotaIp.reintentarEnSegundos));
      return res.status(429).json({ ok: false, codigo: 'DEMASIADAS_PETICIONES', error: 'Demasiadas solicitudes de código.' });
    }
    const cuota = limitadorSolicitud.permitir(claveClientePeticion(
      req.headers as Record<string, unknown>,
      `${identidad.uid}|${actaId}|${participanteId}`,
      ipDe(req),
    ));
    if (!cuota.permitido) {
      res.setHeader('Retry-After', String(cuota.reintentarEnSegundos));
      return res.status(429).json({ ok: false, codigo: 'DEMASIADAS_PETICIONES', error: 'Demasiadas solicitudes de código para esta firma.' });
    }

    const resultado: ResultadoSolicitudOtp = await solicitarOtpFirma({
      puerto: deps.puerto,
      transporte: deps.transporte,
      entrada: { identidad, actaId, participanteId },
    }).catch((): ResultadoSolicitudOtp => ({
      ok: false,
      http: 500,
      codigo: 'ERROR_INTERNO',
      mensaje: 'Error interno al preparar el código.',
    }));

    if (resultado.reintentarEnSegundos) res.setHeader('Retry-After', String(resultado.reintentarEnSegundos));
    if (!resultado.ok) {
      return res.status(resultado.http).json({
        ok: false,
        codigo: resultado.codigo,
        error: resultado.mensaje,
        ...(resultado.firmante ? { firmante: resultado.firmante } : {}),
        ...(resultado.actaEstado ? { actaEstado: resultado.actaEstado } : {}),
      });
    }
    // La respuesta NO contiene el código: sólo el buzón enmascarado y la caducidad.
    return res.status(200).json({
      ok: true,
      enviado: true,
      firmante: resultado.firmante,
      firmaId: resultado.firmaId,
      otpId: resultado.otpId,
      destinoEnmascarado: resultado.destinoEnmascarado,
      expiraEn: resultado.expiraEn,
      actaEstado: resultado.actaEstado,
    });
  });

  // -------------------------------------------------------------------------
  // Validación: el código se comprueba en servidor y la firma se acredita allí
  // -------------------------------------------------------------------------
  app.post('/api/actas/otp/validar', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const identidad = await identidadDe(req);
    if (!identidad) {
      return res.status(401).json({ ok: false, codigo: 'NO_AUTENTICADO', error: 'Se requiere una sesión verificada.' });
    }
    if (!deps.puerto) return res.status(503).json(SIN_SERVIDOR);

    const datos = cuerpo(req);
    const actaId = typeof datos.actaId === 'string' ? datos.actaId : '';
    const participanteId = typeof datos.participanteId === 'string' ? datos.participanteId : '';
    const codigo = typeof datos.codigo === 'string' ? datos.codigo : '';

    const cuotaIp = limitadorIp.permitir(claveClientePeticion(req.headers as Record<string, unknown>, 'otp-validar', ipDe(req)));
    if (!cuotaIp.permitido) {
      res.setHeader('Retry-After', String(cuotaIp.reintentarEnSegundos));
      return res.status(429).json({ ok: false, codigo: 'DEMASIADAS_PETICIONES', error: 'Demasiados intentos de validación.' });
    }
    const cuota = limitadorValidacion.permitir(claveClientePeticion(
      req.headers as Record<string, unknown>,
      `${identidad.uid}|${actaId}|${participanteId}`,
      ipDe(req),
    ));
    if (!cuota.permitido) {
      res.setHeader('Retry-After', String(cuota.reintentarEnSegundos));
      return res.status(429).json({ ok: false, codigo: 'DEMASIADAS_PETICIONES', error: 'Demasiados intentos de validación para esta firma.' });
    }

    const resultado: ResultadoValidacionOtp = await validarOtpYFirmar({
      puerto: deps.puerto,
      entrada: {
        identidad,
        actaId,
        participanteId,
        codigo,
        ip: ipDe(req),
        userAgent: String(req.headers?.['user-agent'] || ''),
      },
    }).catch((): ResultadoValidacionOtp => ({
      ok: false,
      http: 500,
      codigo: 'ERROR_INTERNO',
      mensaje: 'Error interno al validar el código.',
    }));

    if (!resultado.ok) {
      return res.status(resultado.http).json({
        ok: false,
        codigo: resultado.codigo,
        error: resultado.mensaje,
        ...(typeof resultado.intentosRestantes === 'number' ? { intentosRestantes: resultado.intentosRestantes } : {}),
        ...(resultado.firmante ? { firmante: resultado.firmante } : {}),
        ...(resultado.firmaId ? { firmaId: resultado.firmaId } : {}),
      });
    }
    return res.status(200).json({
      ok: true,
      valido: true,
      firmante: resultado.firmante,
      firmaId: resultado.firmaId,
      estadoFirma: resultado.estadoFirma,
      actaCerrada: resultado.actaCerrada === true,
    });
  });

  // -------------------------------------------------------------------------
  // Ruta RETIRADA (H-08): relé de correo con destino libre. 410 explícito para
  // que ningún cliente antiguo (ni un atacante) la confunda con un 200.
  // -------------------------------------------------------------------------
  app.post('/api/actas/otp/entregar', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(410).json({
      ok: false,
      codigo: 'RUTA_RETIRADA',
      error: 'Esta ruta aceptaba un destino libre para enviar códigos por correo. Usa /api/actas/otp/solicitar: el servidor deriva el destino del acta.',
    });
  });
}
