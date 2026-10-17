/**
 * GAP 1 / FASE A — TRANSPORTE DE CORREO: REAL frente a MODO SEGURO
 * ===============================================================
 * Regla de la Fase A: **está prohibido devolver `ok` sin envío real**. Este
 * módulo resuelve, SOLO desde el entorno del servidor, qué transporte usa el
 * canal EMAIL y deja constancia explícita del modo:
 *
 *   · REAL        → proveedor HTTP con credenciales presentes (`EMAIL_PROVEEDOR`
 *                   = RESEND | SENDGRID + clave + `EMAIL_FROM`). Cada envío se
 *                   acepta (2xx con id externo) o se rechaza con causa.
 *   · MODO_SEGURO → sin proveedor real: NO se contacta con nadie y el envío
 *                   queda como fallo controlado. `ENABLE_EMAIL=true` NO basta
 *                   para enviar: con la Fase A esa combinación ya no puede
 *                   producir un falso «enviado».
 *
 * Sin secretos en Firestore ni en el cliente: las credenciales se leen aquí y
 * nunca se devuelven en `detalle` (que solo describe el modo).
 */
import {
  EmailProviderHTTP,
  EmailProviderSafeMode,
  emailValido,
  type EmailProvider,
  type ProveedorEmailHttp,
} from '../../src/notificaciones/canales.js';
import { EmailProviderSMTP, configuracionSmtpValida, type FabricaTransporteSmtp } from './proveedorSmtp.js';

export type ModoEmail = 'REAL' | 'MODO_SEGURO';

/** Proveedor real elegido para el canal EMAIL. */
export type ProveedorEmailReal = ProveedorEmailHttp | 'SMTP';

export interface TransporteEmail {
  modo: ModoEmail;
  /** Proveedor real activo (HTTP o SMTP), o `null` en modo seguro. */
  proveedor: ProveedorEmailReal | null;
  /** Remitente configurado (`EMAIL_FROM`), o `null`. */
  desde: string | null;
  /** Implementación que recibe el canal EMAIL. */
  provider: EmailProvider;
  /** Motivo legible del modo elegido (sin credenciales). */
  detalle: string;
}

export const VARIABLES_ENTORNO_EMAIL = {
  proveedor: 'EMAIL_PROVEEDOR',
  claveResend: 'RESEND_API_KEY',
  claveSendgrid: 'SENDGRID_API_KEY',
  smtp: 'SMTP_URL',
  desde: 'EMAIL_FROM',
  responderA: 'EMAIL_REPLY_TO',
  nombreDespacho: 'EMAIL_DESPACHO_NOMBRE',
} as const;

/**
 * Receta Gmail documentada (no se inventa nada: son requisitos de Google):
 * verificación en dos pasos activa + contraseña de aplicación de 16 caracteres,
 * y `SMTP_URL` con `smtps://cuenta@gmail.com:CONTRASENA@smtp.gmail.com:465`.
 */
export const RECETA_GMAIL_SMTP = 'smtps://cuenta@gmail.com:CONTRASENA_DE_APLICACION@smtp.gmail.com:465';

/**
 * Resuelve el transporte EMAIL desde el entorno. Función pura salvo `fetch`/SMTP.
 * Orden de decisión:
 *   1. `EMAIL_PROVEEDOR=RESEND|SENDGRID` con su clave → proveedor HTTP.
 *   2. `EMAIL_PROVEEDOR=SMTP` (o `SMTP_URL` presente sin proveedor declarado)
 *      → SMTP; con Gmail es la vía de la contraseña de aplicación.
 *   3. Cualquier otra combinación → MODO_SEGURO (nunca simula el envío).
 */
export function crearTransporteEmailDesdeEntorno(
  entorno: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
  fabricaSmtp?: FabricaTransporteSmtp,
): TransporteEmail {
  const crudo = (entorno.EMAIL_PROVEEDOR || '').trim().toUpperCase();
  const smtpUrl = (entorno.SMTP_URL || '').trim();
  const usaSmtp = crudo === 'SMTP' || (!crudo && Boolean(smtpUrl));
  const proveedor: ProveedorEmailHttp | null =
    crudo === 'RESEND' ? 'RESEND' : crudo === 'SENDGRID' ? 'SENDGRID' : null;
  const apiKey = proveedor === 'RESEND'
    ? (entorno.RESEND_API_KEY || '').trim()
    : proveedor === 'SENDGRID'
      ? (entorno.SENDGRID_API_KEY || '').trim()
      : '';
  const desde = (entorno.EMAIL_FROM || '').trim();
  const responderA = (entorno.EMAIL_REPLY_TO || '').trim();
  const activoLegacy = entorno.ENABLE_EMAIL === 'true';

  if (usaSmtp && configuracionSmtpValida(smtpUrl, desde)) {
    return {
      modo: 'REAL',
      proveedor: 'SMTP',
      desde,
      provider: new EmailProviderSMTP(
        { url: smtpUrl, from: desde, ...(responderA ? { responderA } : {}) },
        fabricaSmtp,
      ),
      detalle: 'SMTP configurado (Gmail u otro servidor): los envíos se aceptan o se rechazan de forma explícita.',
    };
  }

  if (proveedor && apiKey && desde) {
    return {
      modo: 'REAL',
      proveedor,
      desde,
      provider: new EmailProviderHTTP({
        proveedor,
        apiKey,
        from: desde,
        ...(responderA ? { replyTo: responderA } : {}),
        ...(fetchImpl ? { fetchImpl } : {}),
      }),
      detalle: `${proveedor} configurado: los envíos se aceptan o se rechazan de forma explícita (sin simulación).`,
    };
  }

  const motivos = [
    usaSmtp && smtpUrl && desde && !configuracionSmtpValida(smtpUrl, desde) ? 'configuración SMTP inválida' : null,
    crudo === 'SMTP' && !smtpUrl ? `${VARIABLES_ENTORNO_EMAIL.smtp} ausente` : null,
    !proveedor && !usaSmtp ? `${VARIABLES_ENTORNO_EMAIL.proveedor} ausente o no soportado` : null,
    proveedor && !apiKey ? 'clave del proveedor ausente' : null,
    !desde ? `${VARIABLES_ENTORNO_EMAIL.desde} ausente` : null,
  ].filter((m): m is string => Boolean(m));

  return {
    modo: 'MODO_SEGURO',
    proveedor: null,
    desde: desde || null,
    provider: new EmailProviderSafeMode({ activo: activoLegacy, ...(desde ? { from: desde } : {}) }),
    detalle: `modo seguro (${motivos.join('; ')})${activoLegacy ? ': ENABLE_EMAIL=true no basta para enviar' : ''}`,
  };
}

/**
 * Identidad del despacho que firma los avisos (nombre y buzón de respuesta), sin
 * credenciales. Se usa en los textos para que el destinatario identifique quién
 * escribe: el nombre se toma de `EMAIL_DESPACHO_NOMBRE` o del nombre visible de
 * `EMAIL_FROM` (`Nombre <cuenta@dominio>`), y el contacto de `EMAIL_REPLY_TO` o
 * del propio buzón remitente. Nunca devuelve claves.
 */
export interface IdentidadDespacho {
  nombre: string;
  contacto: string | null;
}

export function identidadDespachoDesdeEntorno(entorno: NodeJS.ProcessEnv = process.env): IdentidadDespacho {
  const from = (entorno.EMAIL_FROM || '').trim();
  const conNombre = /^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/.exec(from);
  const nombre =
    (entorno[VARIABLES_ENTORNO_EMAIL.nombreDespacho] || '').trim() ||
    (conNombre ? conNombre[1].trim() : '') ||
    'Gestión de alquileres';
  const contacto =
    (entorno[VARIABLES_ENTORNO_EMAIL.responderA] || '').trim() ||
    (conNombre ? conNombre[2].trim() : '') ||
    (emailValido(from) ? from : '') ||
    null;
  return { nombre, contacto };
}
