/**
 * FASE A — TRANSPORTE SMTP (GMAIL) PARA EL CANAL EMAIL
 * ===================================================
 * Alternativa real al proveedor HTTP cuando se quiere empezar con la cuenta de
 * Gmail del despacho: **SMTP de Gmail con contraseña de aplicación**.
 *
 *   · `SMTP_URL`  → `smtps://cuenta@gmail.com:CONTRASENA_DE_APLICACION@smtp.gmail.com:465`
 *   · `EMAIL_FROM`→ remitente visible (debe ser la misma cuenta o un alias
 *                   autorizado en ella; Gmail rechaza remitentes ajenos).
 *
 * Requisitos de Gmail (no los inventa este módulo): la cuenta necesita
 * **verificación en dos pasos** activada y una **contraseña de aplicación**
 * (16 caracteres, sin espacios al pegarla en la URL). El envío a través de
 * Gmail está sujeto a los límites de la cuenta (≈500 destinatarios/día en
 * cuentas personales), suficiente para avisos de alquiler.
 *
 * Sólo se construye en el servidor: `nodemailer` nunca entra en el bundle del
 * cliente. Las credenciales se leen del entorno y **jamás** se devuelven en
 * errores (se enmascaran) ni se guardan en Firestore.
 */
import nodemailer from 'nodemailer';
import { parseConnectionUrl } from 'nodemailer/lib/shared/index.js';
import { emailValido, type EmailProvider, type MensajeEmail } from '../../src/notificaciones/canales.js';

export interface ConfigSmtp {
  /** URL SMTP completa (incluye usuario y contraseña de aplicación). */
  url: string;
  /** Remitente (`Nombre <cuenta@gmail.com>` o solo la dirección). */
  from: string;
  /**
   * Reply-To por defecto (`EMAIL_REPLY_TO`): la dirección a la que van las
   * respuestas. El remitente NO cambia: Gmail exige que el `From` sea la cuenta
   * autenticada (o un alias suyo), así que no se puede enviar «desde» el buzón
   * de un tercero sin sus credenciales.
   */
  responderA?: string;
}

/** Opciones mínimas que usamos de nodemailer (facilita inyectar un doble en pruebas). */
export interface TransporteSmtp {
  sendMail(opciones: { from: string; to: string; subject: string; text: string; replyTo?: string }): Promise<{ messageId?: string; accepted?: Array<string | { address: string }>; rejected?: Array<string | { address: string }>; pending?: Array<string | { address: string }> }>;
}

export type FabricaTransporteSmtp = (url: string) => TransporteSmtp;

/** Fábrica real: nodemailer con tiempos de espera acotados (serverless). */
export function crearFabricaTransporteSmtpPorDefecto(): FabricaTransporteSmtp {
  return (url: string) =>
    nodemailer.createTransport({
      ...parseConnectionUrl(url),
      logger: false,
      debug: false,
      // Tiempos acotados para un runtime serverless (sin `pool`: es de SMTPPool,
      // y aquí queremos una conexión por envío y cerrarla).
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    }) as unknown as TransporteSmtp;
}

/**
 * Enmascara cualquier credencial embebida en una URL dentro de un mensaje.
 * Cubre la forma percent-encoded (`usuario%40gmail.com:clave@host`) y la forma
 * con `@` literal (se toma el ÚLTIMO `@` antes del host), para que un error de
 * autenticación nunca acabe con la contraseña de aplicación en un log.
 */
export function enmascararCredenciales(texto: string): string {
  return texto.replace(/:\/\/[^\s/]*@/g, '://***@');
}

/** Configuración mínima válida; la disponibilidad/autenticación sólo la confirma SMTP. */
export function configuracionSmtpValida(url: string, from: string): boolean {
  try {
    const u = new URL(url);
    const buzon = /^([^<>\r\n]+)\s*<([^<>]+)>$/.exec(from)?.[2] ?? from;
    return ['smtp:', 'smtps:'].includes(u.protocol) && Boolean(u.hostname && u.username && u.password) && emailValido(buzon);
  } catch { return false; }
}

/** Sólo códigos acotados: un error del proveedor puede contener secretos sin URL. */
function errorSmtpSeguro(err: unknown, url: string): string {
  const dato = err as { code?: unknown; responseCode?: unknown } | null;
  const permitidos = ['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'EENVELOPE', 'EMESSAGE', 'EPROTOCOL', 'ETLS'];
  const codigo = typeof dato?.code === 'string' && permitidos.includes(dato.code) ? dato.code : 'ENVIO_FALLIDO';
  const respuesta = typeof dato?.responseCode === 'number' && Number.isInteger(dato.responseCode) && dato.responseCode >= 400 && dato.responseCode <= 599 ? ` (${dato.responseCode})` : '';
  return `smtp_error: ${new URL(url).hostname}: ${codigo}${respuesta}`;
}

export class EmailProviderSMTP implements EmailProvider {
  constructor(
    private readonly config: ConfigSmtp,
    private readonly crearTransporte: FabricaTransporteSmtp = crearFabricaTransporteSmtpPorDefecto(),
  ) {}

  async enviar(message: MensajeEmail): Promise<{ ok: boolean; externalId?: string; error?: string }> {
    if (!emailValido(message.to)) return { ok: false, error: 'destinatario_sin_email' };
    if (!this.config.url || !this.config.from) return { ok: false, error: 'smtp_sin_credenciales' };
    if (!configuracionSmtpValida(this.config.url, this.config.from)) return { ok: false, error: 'smtp_configuracion_invalida' };
    const responderA = emailValido(message.replyTo) ? message.replyTo.trim() : emailValido(this.config.responderA) ? this.config.responderA.trim() : undefined;
    try {
      const info = await this.crearTransporte(this.config.url).sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.body,
        ...(responderA ? { replyTo: responderA } : {}),
      });
      // Message-ID se puede generar localmente: sólo accepted confirma al
      // destinatario. Esto no garantiza llegada al buzón final (puede rebotar).
      const direccion = (v: string | { address: string }) => (typeof v === 'string' ? v : v.address).trim().toLowerCase();
      const destino = message.to.trim().toLowerCase();
      const aceptada = info?.accepted?.some((v) => direccion(v) === destino);
      const rechazada = [...(info?.rejected ?? []), ...(info?.pending ?? [])].some((v) => direccion(v) === destino);
      if (!aceptada || rechazada) return { ok: false, error: 'smtp_destinatario_no_aceptado' };
      return { ok: true, ...(info?.messageId ? { externalId: String(info.messageId) } : {}) };
    } catch (err) {
      return { ok: false, error: errorSmtpSeguro(err, this.config.url) };
    }
  }
}
