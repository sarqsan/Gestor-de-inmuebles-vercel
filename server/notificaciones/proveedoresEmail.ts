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
  type EmailProvider,
  type ProveedorEmailHttp,
} from '../../src/notificaciones/canales.js';

export type ModoEmail = 'REAL' | 'MODO_SEGURO';

export interface TransporteEmail {
  modo: ModoEmail;
  /** Proveedor HTTP activo, o `null` en modo seguro. */
  proveedor: ProveedorEmailHttp | null;
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
  desde: 'EMAIL_FROM',
} as const;

/** Resuelve el transporte EMAIL desde el entorno. Función pura salvo `fetch`. */
export function crearTransporteEmailDesdeEntorno(
  entorno: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): TransporteEmail {
  const crudo = (entorno.EMAIL_PROVEEDOR || '').trim().toUpperCase();
  const proveedor: ProveedorEmailHttp | null =
    crudo === 'RESEND' ? 'RESEND' : crudo === 'SENDGRID' ? 'SENDGRID' : null;
  const apiKey = proveedor === 'RESEND'
    ? (entorno.RESEND_API_KEY || '').trim()
    : proveedor === 'SENDGRID'
      ? (entorno.SENDGRID_API_KEY || '').trim()
      : '';
  const desde = (entorno.EMAIL_FROM || '').trim();
  const activoLegacy = entorno.ENABLE_EMAIL === 'true';

  if (proveedor && apiKey && desde) {
    return {
      modo: 'REAL',
      proveedor,
      desde,
      provider: new EmailProviderHTTP({
        proveedor,
        apiKey,
        from: desde,
        ...(fetchImpl ? { fetchImpl } : {}),
      }),
      detalle: `${proveedor} configurado: los envíos se aceptan o se rechazan de forma explícita (sin simulación).`,
    };
  }

  const motivos = [
    !proveedor ? `${VARIABLES_ENTORNO_EMAIL.proveedor} ausente o no soportado` : null,
    !apiKey ? 'clave del proveedor ausente' : null,
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
