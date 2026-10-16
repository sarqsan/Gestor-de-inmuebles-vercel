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
 * - WHATSAPP: preparado como canal futuro (sin implementar — requiere API
 *   externa y credenciales no disponibles).
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

/** Proveedor de email real (Resend/SendGrid/SMTP) debe implementar esta interfaz. */
export interface EmailProvider {
  enviar(message: { to: string; subject: string; body: string }): Promise<{ ok: boolean; externalId?: string; error?: string }>;
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

  async enviar(message: { to: string; subject: string; body: string }): Promise<{ ok: boolean; externalId?: string; error?: string }> {
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

  async enviar(message: { to: string; subject: string; body: string }): Promise<{ ok: boolean; externalId?: string; error?: string }> {
    if (!message.to) return { ok: false, error: 'destinatario_sin_email' };
    if (!this.config.apiKey || !this.config.from) {
      return { ok: false, error: 'proveedor_email_sin_credenciales' };
    }
    const ejecutar = this.config.fetchImpl || fetch;
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
          }),
        });
        if (!respuesta.ok) {
          return { ok: false, error: `resend_http_${respuesta.status}` };
        }
        const cuerpo = (await respuesta.json().catch(() => null)) as { id?: string } | null;
        return { ok: true, ...(cuerpo?.id ? { externalId: String(cuerpo.id) } : {}) };
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
        }),
      });
      if (!respuesta.ok) {
        return { ok: false, error: `sendgrid_http_${respuesta.status}` };
      }
      const idMensaje = respuesta.headers?.get?.('x-message-id') || undefined;
      return { ok: true, ...(idMensaje ? { externalId: idMensaje } : {}) };
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
    const res = await this.provider.enviar({
      to,
      subject: notificacion.asunto,
      body: notificacion.plantilla,
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
