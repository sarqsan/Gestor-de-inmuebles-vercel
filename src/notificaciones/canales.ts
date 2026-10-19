/**
 * GAP 1 — Canales de entrega.
 * --------------------------
 * Cada canal implementa EnviadorCanal (ver dispatcher). Los secretos de
 * proveedores (SMTP/Resend/SendGrid/WhatsApp Business) se leen SOLO desde el
 * backend/config de entorno; aquí no hay credenciales ni se exponen.
 *
 * - EMAIL: EmailProvider real (Resend/SendGrid por API HTTP) o modo seguro de
 *   desarrollo ("safe-mode"). El modo seguro NO lanza la entrega y NUNCA puede
 *   devolver `ok`: el resultado es siempre un fallo controlado con causa
 *   explícita (regla FASE A: prohibido afirmar «enviado» sin envío real).
 * - INAPP: bandeja interna de plataforma (persistida por el repositorio).
 * - WEBHOOK: entrega a URL externa con validación de protocolo.
 * - WHATSAPP: descartado como canal operativo; cualquier tipado residual solo
 *   permite interpretar registros históricos y no dispone de proveedor.
 */

import type { CanalNotificacion, Notificacion, ResultadoEntrega } from '../types/notificaciones';
import type { EnviadorCanal, ResultadoCanal } from './dispatcher';

// ---------------------------------------------------------------------------
// EMAIL
// ---------------------------------------------------------------------------

export interface ConfigEmail {
  activo: boolean;
  smtpUrl?: string; // smtp://user:pass@host:puerto  (formato estándar; NUNCA en Firestore)
  from?: string;
}

/**
 * Mensaje que recibe un proveedor de correo. `replyTo` es la cabecera Reply-To:
 * NO cambia el remitente (el correo sale siempre del buzón autenticado de la
 * plataforma), solo la dirección a la que van las respuestas del destinatario.
 */
export interface MensajeEmail {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}

/** Proveedor de email real (Resend/SendGrid/SMTP) debe implementar esta interfaz. */
export interface EmailProvider {
  enviar(message: MensajeEmail): Promise<{ ok: boolean; externalId?: string; error?: string }>;
}

/** Correo con forma válida (evita enviar una cabecera Reply-To basura). */
export function emailValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim());
}

/**
 * Modo seguro (desarrollo/tests): NO contacta con ningún proveedor y por tanto
 * NUNCA devuelve `ok: true`. Antes de la FASE A este proveedor podía simular un
 * envío correcto (`safe-*`), lo que permitía afirmar «enviado» sin haber
 * enviado nada. Regla vigente: un resultado `ok` exige aceptación REAL del
 * proveedor; aquí siempre es un fallo controlado con causa explícita.
 */
export class EmailProviderSafeMode implements EmailProvider {
  constructor(private readonly config: ConfigEmail = { activo: false }) {}

  async enviar(message: MensajeEmail): Promise<{ ok: boolean; externalId?: string; error?: string }> {
    if (!message.to) {
      return { ok: false, error: 'destinatario_sin_email' };
    }
    if (!this.config.activo) {
      return { ok: false, error: 'email_no_configurado (safe-mode: sin proveedor SMTP/Resend/SendGrid)' };
    }
    // ENABLE_EMAIL activo pero sin credenciales reales ⇒ sigue siendo safe-mode.
    // Prohibido devolver ok: la entrega no ha ocurrido.
    return {
      ok: false,
      error: 'modo_seguro_activo (safe-mode: sin proveedor REAL configurado; no se ha enviado nada)',
    };
  }
}

// ---------------------------------------------------------------------------
// EMAIL · proveedor HTTP real (Resend / SendGrid)
// ---------------------------------------------------------------------------

export type ProveedorEmailHttp = 'RESEND' | 'SENDGRID';

export interface ConfigEmailHttp {
  proveedor: ProveedorEmailHttp;
  apiKey: string;
  from: string;
  /** Reply-To por defecto del despliegue (`EMAIL_REPLY_TO`), sin credenciales. */
  replyTo?: string;
  /** Inyectable en pruebas; por defecto `fetch` global (solo servidor). */
  fetchImpl?: typeof fetch;
}

/**
 * Proveedor de correo REAL por API HTTP. Solo se construye en el servidor con
 * credenciales de entorno; nunca desde el cliente ni con secretos de Firestore.
 * `ok: true` únicamente si el proveedor ACEPTA el mensaje (HTTP 2xx); cualquier
 * otra cosa es un fallo explícito.
 */
export class EmailProviderHTTP implements EmailProvider {
  constructor(private readonly config: ConfigEmailHttp) {}

  async enviar(message: MensajeEmail): Promise<{ ok: boolean; externalId?: string; error?: string }> {
    if (!message.to) return { ok: false, error: 'destinatario_sin_email' };
    if (!this.config.apiKey || !this.config.from) {
      return { ok: false, error: 'proveedor_email_sin_credenciales' };
    }
    const ejecutar = this.config.fetchImpl || fetch;
    const responderA = emailValido(message.replyTo) ? message.replyTo.trim() : emailValido(this.config.replyTo) ? this.config.replyTo.trim() : undefined;
    try {
      if (this.config.proveedor === 'RESEND') {
        const respuesta = await ejecutar('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: this.config.from,
            to: [message.to],
            subject: message.subject,
            text: message.body,
            ...(responderA ? { reply_to: responderA } : {}),
          }),
        });
        if (!respuesta.ok) {
          return { ok: false, error: `resend_http_${respuesta.status}` };
        }
        const cuerpo = (await respuesta.json().catch(() => null)) as { id?: string } | null;
        // Un 2xx SIN identificador de mensaje no demuestra que
        // ÉSTE mensaje fuese aceptado (puede ser una respuesta
        // vacía de proxy o reintento): se trata como entrega
        // INCIERTA, nunca como confirmada.
        if (!cuerpo?.id) {
          return { ok: false, error: 'entrega_incierta:resend_respuesta_sin_id' };
        }
        return { ok: true, externalId: String(cuerpo.id) };
      }

      const respuesta = await ejecutar('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: message.to }] }],
          from: { email: this.config.from },
          subject: message.subject,
          content: [{ type: 'text/plain', value: message.body }],
          ...(responderA ? { reply_to: { email: responderA } } : {}),
        }),
      });
      if (!respuesta.ok) {
          return { ok: false, error: `sendgrid_http_${respuesta.status}` };
        }
        const idMensaje = respuesta.headers?.get?.('x-message-id') || undefined;
        // Igual que con Resend: un 2xx sin id de mensaje es
        // una respuesta ambigua, no una entrega confirmada.
        if (!idMensaje) {
          return { ok: false, error: 'entrega_incierta:sendgrid_respuesta_sin_id' };
        }
        return { ok: true, externalId: idMensaje };
    } catch (err) {
      return { ok: false, error: `proveedor_email_error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

export class CanalEmail implements EnviadorCanal {
  readonly canal: CanalNotificacion = 'EMAIL';
  constructor(private readonly provider: EmailProvider) {}

  async enviar(notificacion: Notificacion): Promise<ResultadoCanal> {
    const to = notificacion.destinatario?.email;
    if (!to) {
      return { ok: false, provider: 'email', error: 'destinatario_sin_email', enviadoEn: new Date().toISOString() };
    }
    // El cuerpo se envía YA RENDERIZADO. Si falta, es un fallo explícito: nunca
    // se manda la clave de la plantilla (`cobro.retraso_pago`) como si fuese el
    // mensaje, ni se da por enviado un aviso sin texto.
    const cuerpo = typeof notificacion.cuerpo === 'string' ? notificacion.cuerpo.trim() : '';
    if (!cuerpo) {
      return {
        ok: false,
        provider: 'email',
        error: 'cuerpo_no_renderizado (la notificación no lleva texto: no se envía la clave de la plantilla)',
        enviadoEn: new Date().toISOString(),
      };
    }
    const res = await this.provider.enviar({
      to,
      subject: notificacion.asunto,
      body: cuerpo,
      ...(emailValido(notificacion.responderA) ? { replyTo: notificacion.responderA.trim() } : {}),
    });
    return res.ok
      ? { ok: true, provider: 'email', externalId: res.externalId, enviadoEn: new Date().toISOString() }
      : { ok: false, provider: 'email', error: res.error || 'error_email', enviadoEn: new Date().toISOString() };
  }
}

// ---------------------------------------------------------------------------
// INAPP (bandeja interna)
// ---------------------------------------------------------------------------

export class CanalInApp implements EnviadorCanal {
  readonly canal: CanalNotificacion = 'INAPP';
  async enviar(notificacion: Notificacion): Promise<ResultadoCanal> {
    if (!notificacion.destinatario?.usuarioId) {
      return { ok: false, provider: 'inapp', error: 'destinatario_sin_usuario', enviadoEn: new Date().toISOString() };
    }
    // La persistencia de la bandeja interna la garantiza el repositorio (guardar()).
    return { ok: true, provider: 'inapp', externalId: notificacion.id, enviadoEn: new Date().toISOString() };
  }
}

// ---------------------------------------------------------------------------
// WEBHOOK
// ---------------------------------------------------------------------------

export interface TransporteWebhook {
  post(url: string, body: unknown): Promise<{ ok: boolean; externalId?: string; error?: string }>;
}

export class CanalWebhook implements EnviadorCanal {
  readonly canal: CanalNotificacion = 'WEBHOOK';
  constructor(private readonly transporte: TransporteWebhook) {}

  async enviar(notificacion: Notificacion): Promise<ResultadoCanal> {
    const url = notificacion.destinatario?.webhookUrl;
    if (!url) {
      return { ok: false, provider: 'webhook', error: 'webhook_sin_url', enviadoEn: new Date().toISOString() };
    }
    if (!url.startsWith('https://')) {
      return { ok: false, provider: 'webhook', error: 'webhook_solo_https', enviadoEn: new Date().toISOString() };
    }
    const res = await this.transporte.post(url, notificacion);
    return {
      ok: res.ok,
      provider: 'webhook',
      externalId: res.externalId,
      error: res.error,
      enviadoEn: new Date().toISOString(),
    };
  }
}
