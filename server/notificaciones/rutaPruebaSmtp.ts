/**
 * FASE A — PRUEBA TÉCNICA AISLADA DE SMTP (`POST /api/notificaciones/probar-smtp`)
 * ================================================================================
 * Mecanismo administrativo para verificar el transporte SMTP real con un único
 * correo de prueba, completamente aislado del circuito operativo:
 *
 *   · Autenticación y autorización en servidor: exige ID token de Firebase
 *     válido (`verificarToken`) y perfil veraz `ADMINISTRADOR` en estado
 *     `ACTIVO` (`FuentePerfilUsuario`). Deny-by-default.
 *   · Destinatario único y acotado: sólo admite el correo verificado del
 *     administrador autenticado (`identidad.email`) o el buzón propio del
 *     despacho (`EMAIL_FROM` / `EMAIL_REPLY_TO`). Rechaza destinatarios ajenos.
 *   · Sin contenido libre ni adjuntos: sólo acepta el campo opcional
 *     `destinatario`; asunto y cuerpo son fijos de verificación técnica.
 *   · Sin efectos secundarios: invoca directamente `transporte.provider.enviar`
 *     cuando `modo === 'REAL'` y `proveedor === 'SMTP'`. NO pasa por el
 *     dispatcher de notificaciones, NO escribe en las colecciones de avisos ni
 *     entregas en Firestore, y NO invoca el reloj/cron.
 *   · Diagnóstico seguro: distingue `configuracion`, `conexion`,
 *     `autenticacion`, `rechazo_smtp` y `aceptado_smtp` sin filtrar secretos,
 *     y deja constancia explícita de que la aceptación SMTP (`accepted`) no
 *     equivale a la llegada confirmada al buzón final.
 */
import type { Express, Request, Response } from 'express';
import { crearLimitadorVentana } from '../../src/experiencia/limites.js';
import type { FuentePerfilUsuario } from '../../src/notificaciones/autorizacion.js';
import { emailValido } from '../../src/notificaciones/canales.js';
import type { IdentidadVerificada } from '../titularidades/googleBackend.js';
import { tokenDe } from '../titularidades/manejadorBuscarTitulares.js';
import { enmascararCredenciales } from './proveedorSmtp.js';
import type { IdentidadDespacho, TransporteEmail } from './proveedoresEmail.js';

export const RUTA_PROBAR_SMTP = '/api/notificaciones/probar-smtp' as const;
export const ASUNTO_PRUEBA_SMTP = '[PRUEBA SMTP] Verificación técnica — Gestor de Inmuebles' as const;
export const MAX_BYTES_CUERPO_PRUEBA_SMTP = 512;
export const MAX_LONGITUD_EMAIL_PRUEBA_SMTP = 254;
export const MAX_INTENTOS_VENTANA_PRUEBA_SMTP = 3;
export const VENTANA_MS_PRUEBA_SMTP = 60_000;

export const AVISO_ENTREGA_BUZON_SMTP =
  'El servidor SMTP aceptó el mensaje para su envío (accepted). Esto NO confirma la llegada al buzón final; compruebe la recepción en la bandeja de entrada (o carpeta de Spam) del destinatario y la ausencia de rebotes en la cuenta remitente.' as const;

export type EtapaDiagnosticoSmtp =
  | 'solicitud'
  | 'configuracion'
  | 'conexion'
  | 'autenticacion'
  | 'rechazo_smtp'
  | 'aceptado_smtp';

export interface DependenciasPruebaSmtp {
  /** Verifica el ID token de Firebase en servidor y devuelve `uid` (y `email` si consta en el token). */
  verificarToken: (token: string) => Promise<IdentidadVerificada | null>;
  /** Fuente de perfil veraz en Firestore (`usuarios.authUid` + `estado == 'ACTIVO'`), o función que la devuelve. */
  fuentePerfil?: FuentePerfilUsuario | null | (() => FuentePerfilUsuario | undefined | null);
  /** Transporte de correo resuelto desde el entorno del servidor. */
  transporte: TransporteEmail;
  /** Identidad pública del despacho (sin credenciales). */
  identidadDespacho?: IdentidadDespacho;
  /** Reloj inyectable para pruebas deterministas. */
  ahora?: () => Date;
  /** Máximo de pruebas SMTP por ventana móvil y administrador (por defecto 3). */
  maxIntentosVentana?: number;
  /** Ventana móvil en milisegundos (por defecto 60_000 ms). */
  ventanaMs?: number;
}

/**
 * Extrae una única dirección de correo válida a partir de un buzón simple
 * (`cuenta@dominio.es`) o con nombre visible (`Nombre <cuenta@dominio.es>`).
 */
export function extraerBuzonAutorizado(valor: string | null | undefined): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  if (!limpio || limpio.length > MAX_LONGITUD_EMAIL_PRUEBA_SMTP) return null;
  const conAngulos = /^[^<>\r\n]*<([^<>\r\n]+)>$/.exec(limpio);
  const candidato = (conAngulos ? conAngulos[1] : limpio).trim();
  if (!candidato || candidato.length > MAX_LONGITUD_EMAIL_PRUEBA_SMTP) return null;
  if (/[\s,;<>]/.test(candidato)) return null;
  return emailValido(candidato) ? candidato.toLowerCase() : null;
}

/**
 * Calcula el conjunto cerrado de destinatarios autorizados para la prueba:
 * el correo verificado del administrador autenticado y el buzón propio del despacho.
 */
export function resolverDestinatariosAutorizados(opciones: {
  emailAdministrador?: string | null;
  desdeTransporte?: string | null;
  contactoDespacho?: string | null;
}): {
  porDefecto: string | null;
  autorizados: Set<string>;
} {
  const admin = extraerBuzonAutorizado(opciones.emailAdministrador);
  const desde = extraerBuzonAutorizado(opciones.desdeTransporte);
  const contacto = extraerBuzonAutorizado(opciones.contactoDespacho);
  const lista = [admin, desde, contacto].filter((v): v is string => Boolean(v));
  return {
    porDefecto: lista[0] ?? null,
    autorizados: new Set(lista),
  };
}

/**
 * Clasifica el error devuelto por `EmailProviderSMTP.enviar` en una etapa
 * técnica acotada y sin datos sensibles (lista blanca de códigos).
 */
export function clasificarErrorSmtp(error: string | undefined): {
  etapa: 'configuracion' | 'conexion' | 'autenticacion' | 'rechazo_smtp';
  codigo: string;
} {
  const texto = enmascararCredenciales(String(error || '').trim());
  if (
    texto === 'smtp_sin_credenciales' ||
    texto === 'smtp_configuracion_invalida' ||
    texto === 'destinatario_sin_email' ||
    texto.startsWith('email_no_configurado') ||
    texto.startsWith('modo_seguro_activo')
  ) {
    return { etapa: 'configuracion', codigo: texto || 'smtp_no_configurado' };
  }
  if (/^smtp_error: [^:\s]+: EAUTH(?:\s+\(\d{3}\))?$/.test(texto)) {
    return { etapa: 'autenticacion', codigo: texto };
  }
  if (/^smtp_error: [^:\s]+: (EDNS|ECONNECTION|ETIMEDOUT|ESOCKET|ETLS|EPROTOCOL)(?:\s+\(\d{3}\))?$/.test(texto)) {
    return { etapa: 'conexion', codigo: texto };
  }
  if (
    texto === 'smtp_destinatario_no_aceptado' ||
    /^smtp_error: [^:\s]+: (EENVELOPE|EMESSAGE|ENVIO_FALLIDO)(?:\s+\(\d{3}\))?$/.test(texto)
  ) {
    return { etapa: 'rechazo_smtp', codigo: texto };
  }
  return { etapa: 'rechazo_smtp', codigo: 'smtp_error_inesperado' };
}

interface ResultadoValidacionCuerpo {
  ok: boolean;
  destinatarioSolicitado?: string | null;
  status?: 400 | 413;
  error?: string;
  motivoDenegacion?: string;
}

function validarCuerpoSolicitud(req: Request): ResultadoValidacionCuerpo {
  const contentLength = Number(req.headers?.['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_BYTES_CUERPO_PRUEBA_SMTP) {
    return {
      ok: false,
      status: 413,
      error: 'payload_demasiado_grande',
      motivoDenegacion: `El cuerpo supera el límite permitido (${MAX_BYTES_CUERPO_PRUEBA_SMTP} bytes).`,
    };
  }

  const body = req.body;
  if (body === undefined || body === null) {
    return { ok: true, destinatarioSolicitado: null };
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      error: 'payload_invalido',
      motivoDenegacion: 'El cuerpo de la solicitud debe ser un objeto JSON.',
    };
  }

  let serializado = '';
  try {
    serializado = JSON.stringify(body);
  } catch {
    return {
      ok: false,
      status: 400,
      error: 'payload_invalido',
      motivoDenegacion: 'Cuerpo JSON no válido.',
    };
  }
  if (serializado.length > MAX_BYTES_CUERPO_PRUEBA_SMTP) {
    return {
      ok: false,
      status: 413,
      error: 'payload_demasiado_grande',
      motivoDenegacion: `El cuerpo supera el límite permitido (${MAX_BYTES_CUERPO_PRUEBA_SMTP} bytes).`,
    };
  }

  const claves = Object.keys(body as Record<string, unknown>);
  const noPermitidas = claves.filter((k) => k !== 'destinatario');
  if (noPermitidas.length > 0) {
    return {
      ok: false,
      status: 400,
      error: 'payload_invalido',
      motivoDenegacion:
        'Solo se admite el parámetro opcional "destinatario"; no se permiten asunto, contenido libre, adjuntos ni múltiples destinatarios.',
    };
  }

  const bruto = (body as { destinatario?: unknown }).destinatario;
  if (bruto === undefined || bruto === null) {
    return { ok: true, destinatarioSolicitado: null };
  }
  if (typeof bruto !== 'string') {
    return {
      ok: false,
      status: 400,
      error: 'destinatario_invalido',
      motivoDenegacion: 'El campo "destinatario" debe ser una única dirección de correo en texto.',
    };
  }
  const limpio = bruto.trim();
  if (!limpio || limpio.length > MAX_LONGITUD_EMAIL_PRUEBA_SMTP || /[\s,;<>]/.test(limpio) || !emailValido(limpio)) {
    return {
      ok: false,
      status: 400,
      error: 'destinatario_invalido',
      motivoDenegacion: 'El campo "destinatario" debe contener una única dirección de correo válida.',
    };
  }

  return { ok: true, destinatarioSolicitado: limpio.toLowerCase() };
}

function construirCuerpoPruebaSmtp(opciones: {
  fechaIso: string;
  nombreDespacho: string;
  desde: string;
  destinatario: string;
}): string {
  return [
    `Prueba técnica controlada del transporte SMTP (${opciones.nombreDespacho}).`,
    '',
    `Fecha (UTC): ${opciones.fechaIso}`,
    `Remitente configurado: ${opciones.desde}`,
    `Destinatario autorizado: ${opciones.destinatario}`,
    '',
    'Este correo se ha emitido desde POST /api/notificaciones/probar-smtp directamente contra el proveedor SMTP, sin crear documentos en notificaciones ni activar el reloj de avisos.',
  ].join('\n');
}

function resolverFuentePerfil(
  fuente: DependenciasPruebaSmtp['fuentePerfil'],
): FuentePerfilUsuario | null {
  if (!fuente) return null;
  if (typeof fuente === 'function') return fuente() ?? null;
  return fuente;
}

export function montarRutaPruebaSmtp(app: Express, deps: DependenciasPruebaSmtp): void {
  const ahora = deps.ahora ?? (() => new Date());
  const limitador = crearLimitadorVentana(
    deps.maxIntentosVentana ?? MAX_INTENTOS_VENTANA_PRUEBA_SMTP,
    deps.ventanaMs ?? VENTANA_MS_PRUEBA_SMTP,
    () => ahora().getTime(),
  );

  app.post(RUTA_PROBAR_SMTP, async (req: Request, res: Response) => {
    try {
      // 1. Autenticación: exigir Bearer token de Firebase verificado en servidor.
      const token = tokenDe(req);
      if (!token) {
        res.status(401).json({
          ok: false,
          etapa: 'solicitud' satisfies EtapaDiagnosticoSmtp,
          error: 'no_autenticado',
          motivoDenegacion: 'Se requiere cabecera Authorization: Bearer <ID_TOKEN>.',
        });
        return;
      }

      let identidad: IdentidadVerificada | null = null;
      try {
        identidad = await deps.verificarToken(token);
      } catch {
        identidad = null;
      }
      if (!identidad?.uid) {
        res.status(401).json({
          ok: false,
          etapa: 'solicitud' satisfies EtapaDiagnosticoSmtp,
          error: 'no_autenticado',
          motivoDenegacion: 'El token de sesión no es válido o ha caducado.',
        });
        return;
      }

      // 2. Autorización administrativa veraz en servidor (Firestore `usuarios`).
      const fuentePerfil = resolverFuentePerfil(deps.fuentePerfil);
      if (!fuentePerfil) {
        res.status(503).json({
          ok: false,
          etapa: 'configuracion' satisfies EtapaDiagnosticoSmtp,
          error: 'autorizacion_no_disponible',
          motivoDenegacion: 'El servidor no dispone de fuente de perfiles en Firestore para verificar permisos de administrador.',
        });
        return;
      }

      let infoPerfil = null;
      try {
        infoPerfil = await fuentePerfil.resolver(identidad.uid);
      } catch {
        res.status(503).json({
          ok: false,
          etapa: 'configuracion' satisfies EtapaDiagnosticoSmtp,
          error: 'autorizacion_no_disponible',
          motivoDenegacion: 'No se pudo consultar el perfil del usuario en Firestore.',
        });
        return;
      }
      if (!infoPerfil || infoPerfil.perfil !== 'ADMINISTRADOR') {
        res.status(403).json({
          ok: false,
          etapa: 'solicitud' satisfies EtapaDiagnosticoSmtp,
          error: 'no_autorizado',
          motivoDenegacion: 'Esta operación requiere un usuario activo con perfil ADMINISTRADOR.',
        });
        return;
      }

      // 3. Validación estricta del cuerpo (tamaño, estructura y lista blanca de parámetros).
      const validacionCuerpo = validarCuerpoSolicitud(req);
      if (!validacionCuerpo.ok) {
        res.status(validacionCuerpo.status ?? 400).json({
          ok: false,
          etapa: 'solicitud' satisfies EtapaDiagnosticoSmtp,
          error: validacionCuerpo.error ?? 'payload_invalido',
          motivoDenegacion: validacionCuerpo.motivoDenegacion ?? 'Solicitud inválida.',
        });
        return;
      }

      // 4. Restricción de destinatario único (correo del administrador o buzón propio del despacho).
      const { porDefecto, autorizados } = resolverDestinatariosAutorizados({
        emailAdministrador: identidad.email,
        desdeTransporte: deps.transporte.desde,
        contactoDespacho: deps.identidadDespacho?.contacto,
      });

      const destinatarioElegido = validacionCuerpo.destinatarioSolicitado ?? porDefecto;
      if (!destinatarioElegido) {
        res.status(400).json({
          ok: false,
          etapa: 'solicitud' satisfies EtapaDiagnosticoSmtp,
          error: 'destinatario_no_disponible',
          motivoDenegacion: 'No hay un buzón autorizado disponible (ni en el token del administrador ni en EMAIL_FROM).',
        });
        return;
      }
      if (!autorizados.has(destinatarioElegido)) {
        res.status(403).json({
          ok: false,
          etapa: 'solicitud' satisfies EtapaDiagnosticoSmtp,
          error: 'destinatario_no_autorizado',
          motivoDenegacion:
            'El destinatario debe coincidir con el correo verificado del administrador autenticado o con el buzón propio del despacho.',
        });
        return;
      }

      // 5. Verificación del modo SMTP real (nunca intenta enviar en MODO_SEGURO ni con otro proveedor).
      if (deps.transporte.modo !== 'REAL' || deps.transporte.proveedor !== 'SMTP') {
        res.status(503).json({
          ok: false,
          etapa: 'configuracion' satisfies EtapaDiagnosticoSmtp,
          error: 'smtp_no_configurado',
          modo: deps.transporte.modo,
          proveedor: deps.transporte.proveedor,
          detalle: enmascararCredenciales(deps.transporte.detalle),
          aceptadoPorServidorSmtp: false,
          entregaBuzonConfirmada: false,
          motivoDenegacion: 'El transporte de correo no está en modo SMTP real.',
        });
        return;
      }

      // 6. Protección contra solicitudes repetidas (ventana móvil por administrador).
      const limite = limitador.consumir(identidad.uid);
      if (!limite.permitido) {
        const segundos = Math.max(1, Math.ceil(limite.reintentarEnMs / 1000));
        res.setHeader('Retry-After', String(segundos));
        res.status(429).json({
          ok: false,
          etapa: 'solicitud' satisfies EtapaDiagnosticoSmtp,
          error: 'limite_frecuencia',
          reintentarEnSegundos: segundos,
          motivoDenegacion: 'Se ha alcanzado el límite temporal de pruebas SMTP. Espere antes de reintentar.',
        });
        return;
      }

      // 7. Invocación directa al proveedor SMTP, sin pasar por el dispatcher ni escribir en Firestore.
      const fechaIso = ahora().toISOString();
      const remitenteBuzon = extraerBuzonAutorizado(deps.transporte.desde) ?? deps.transporte.desde ?? '';
      const responderA = extraerBuzonAutorizado(deps.identidadDespacho?.contacto);
      const nombreDespacho = deps.identidadDespacho?.nombre?.trim() || 'Gestión de alquileres';

      let resultadoEnvio: { ok: boolean; externalId?: string; error?: string };
      try {
        resultadoEnvio = await deps.transporte.provider.enviar({
          to: destinatarioElegido,
          subject: ASUNTO_PRUEBA_SMTP,
          body: construirCuerpoPruebaSmtp({
            fechaIso,
            nombreDespacho,
            desde: remitenteBuzon,
            destinatario: destinatarioElegido,
          }),
          ...(responderA ? { replyTo: responderA } : {}),
        });
      } catch {
        resultadoEnvio = { ok: false, error: 'smtp_error_inesperado' };
      }

      if (resultadoEnvio.ok) {
        res.status(200).json({
          ok: true,
          etapa: 'aceptado_smtp' satisfies EtapaDiagnosticoSmtp,
          proveedor: 'SMTP',
          desde: remitenteBuzon,
          destinatario: destinatarioElegido,
          externalId: resultadoEnvio.externalId ?? null,
          aceptadoPorServidorSmtp: true,
          entregaBuzonConfirmada: false,
          avisoEntrega: AVISO_ENTREGA_BUZON_SMTP,
          enviadoEn: fechaIso,
        });
        return;
      }

      const diagnostico = clasificarErrorSmtp(resultadoEnvio.error);
      const statusFallo = diagnostico.etapa === 'configuracion' ? 503 : 502;
      res.status(statusFallo).json({
        ok: false,
        etapa: diagnostico.etapa satisfies EtapaDiagnosticoSmtp,
        proveedor: 'SMTP',
        desde: remitenteBuzon,
        destinatario: destinatarioElegido,
        error: diagnostico.codigo,
        aceptadoPorServidorSmtp: false,
        entregaBuzonConfirmada: false,
        enviadoEn: fechaIso,
      });
    } catch {
      res.status(500).json({
        ok: false,
        etapa: 'solicitud' satisfies EtapaDiagnosticoSmtp,
        error: 'error_interno',
        motivoDenegacion: 'Error interno al procesar la prueba SMTP.',
      });
    }
  });
}
