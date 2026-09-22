/**
 * GAP 1 — Canales de entrega.
 * --------------------------
 * Cada canal implementa EnviadorCanal (ver dispatcher). Los secretos de
 * proveedores (SMTP/Resend/SendGrid/WhatsApp Business) se leen SOLO desde el
 * backend/config de entorno; aquí no hay credenciales ni se exponen.
 *
 * - EMAIL: EmailProvider con modo seguro de desarrollo ("safe-mode"). Si no
 *   hay proveedor real configurado, NO se lanza la entrega; el resultado queda
 *   marcado como fallo controlado (causa explícita). En tests se usa un mock.
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

/** Proveedor de email real posterior (Resend/SendGrid/SMTP) debe implementar esta interfaz. */
export interface EmailProvider {
  enviar(message: { to: string; subject: string; body: string }): Promise<{ ok: boolean; externalId?: string; error?: string }>;
}

/** Implementación segura por defecto: sin configuración externa NO envía. */
export class EmailProviderSafeMode implements EmailProvider {
  constructor(private readonly config: ConfigEmail) {}

  async enviar(message: { to: string; subject: string; body: string }): Promise<{ ok: boolean; externalId?: string; error?: string }> {
    if (!this.config.activo) {
      return { ok: false, error: 'email_no_configurado (safe-mode: sin proveedor SMTP/Resend)' };
    }
    if (!message.to) {
      return { ok: false, error: 'destinatario_sin_email' };
    }
    // En safe-mode activo (desarrollo): se registra sin contacto real con proveedor.
    // Para producción sustituir por un EmailProvider real (Resend/SendGrid/SMTP).
    return { ok: true, externalId: `safe-${Date.now().toString(36)}` };
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
