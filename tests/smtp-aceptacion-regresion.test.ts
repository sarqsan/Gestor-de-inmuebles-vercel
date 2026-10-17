import { describe, expect, it, vi } from 'vitest';
import { EmailProviderSMTP, crearFabricaTransporteSmtpPorDefecto, type FabricaTransporteSmtp } from '../server/notificaciones/proveedorSmtp';
import { crearTransporteEmailDesdeEntorno } from '../server/notificaciones/proveedoresEmail';
import { CanalEmail } from '../src/notificaciones/canales';
import { DispatcherNotificaciones, MAX_REINTENTOS, type RepositorioNotificaciones } from '../src/notificaciones/dispatcher';
import type { Notificacion } from '../src/types/notificaciones';

// Todos los datos son sintéticos. Los transportes de envío siempre se inyectan.
const URL_SMTP = 'smtps://usuario%40example.test:secreto-sintetico@smtp.example.test:465';
const TO = 'destino@example.test';
const MENSAJE = { to: TO, subject: 'Prueba', body: 'Mensaje sintético' };
const config = { url: URL_SMTP, from: 'avisos@example.test' };

function proveedorCon(info: Record<string, unknown>) {
  const sendMail = vi.fn(async () => info);
  const fabrica = (() => ({ sendMail })) as FabricaTransporteSmtp;
  return { proveedor: new EmailProviderSMTP(config, fabrica), sendMail };
}

describe('SMTP: aceptación explícita, fallo cerrado y sin secretos', () => {
  it.each([
    {}, { messageId: 'id-local' }, { accepted: [], rejected: [TO] },
    { accepted: ['otro@example.test'] }, { accepted: [TO], rejected: [TO] },
    { accepted: [TO], pending: [TO] },
  ])('no confunde promesa resuelta o Message-ID local con aceptación del destinatario (%#)', async (info) => {
    const { proveedor } = proveedorCon(info);
    const resultado = await proveedor.enviar(MENSAJE);
    expect(resultado.ok).toBe(false);
    expect(resultado.externalId).toBeUndefined();
    expect(resultado.error).toBeTruthy();
  });

  it.each([{ accepted: [TO] }, { accepted: [{ address: TO }] }])('sólo acepta al destinatario confirmado (%#)', async ({ accepted }) => {
    const { proveedor, sendMail } = proveedorCon({ accepted, rejected: [], messageId: 'id-confirmado' });
    expect(await proveedor.enviar(MENSAJE)).toEqual({ ok: true, externalId: 'id-confirmado' });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it.each(['EAUTH', 'ECONNECTION', 'ETIMEDOUT'])('devuelve código %s sin texto arbitrario ni credenciales', async (code) => {
    const fabrica: FabricaTransporteSmtp = () => ({
      async sendMail() { throw Object.assign(new Error(`fallo usuario@example.test secreto-sintetico ${URL_SMTP}`), { code, responseCode: 535 }); },
    });
    const resultado = await new EmailProviderSMTP(config, fabrica).enviar(MENSAJE);
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toContain(code);
    expect(resultado.externalId).toBeUndefined();
    expect(JSON.stringify(resultado)).not.toContain('secreto-sintetico');
    expect(JSON.stringify(resultado)).not.toContain('usuario@example.test');
  });

  it('aplica los timeouts al transporte, no a los defaults del mensaje; no abre conexión', () => {
    const transporte = crearFabricaTransporteSmtpPorDefecto()(URL_SMTP) as unknown as { transporter: { options: Record<string, unknown> }; close(): void };
    try {
      expect(transporte.transporter.options).toMatchObject({ connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000, logger: false, debug: false });
    } finally { transporte.close(); }
  });

  it.each([
    { ENABLE_EMAIL: 'true' },
    { ENABLE_EMAIL: 'true', EMAIL_PROVEEDOR: 'SMTP', EMAIL_FROM: config.from },
    { ENABLE_EMAIL: 'true', EMAIL_PROVEEDOR: 'SMTP', SMTP_URL: URL_SMTP },
    { ENABLE_EMAIL: 'true', EMAIL_PROVEEDOR: 'SMTP', SMTP_URL: 'https://example.test', EMAIL_FROM: config.from },
  ])('configuración incompleta o no SMTP permanece segura sin invocar transporte (%#)', async (env) => {
    const fabrica = vi.fn(() => ({ sendMail: vi.fn() }));
    const transporte = crearTransporteEmailDesdeEntorno(env, undefined, fabrica);
    expect(transporte.modo).toBe('MODO_SEGURO');
    expect((await transporte.provider.enviar(MENSAJE)).ok).toBe(false);
    expect(fabrica).not.toHaveBeenCalled();
  });
});

function notificacion(): Notificacion {
  return {
    id: 'not-smtp', idempotencyKey: 'smtp-reintento', tipo: 'cobro.proximo_vencimiento', origen: 'COBRO', canal: 'EMAIL',
    destinatario: { email: TO }, asunto: 'Prueba', cuerpo: 'Mensaje sintético', plantilla: 'cobro.proximo_vencimiento', datos: {},
    entidadId: 'entidad', fechaCreacion: '2026-10-16T12:00:00.000Z', estado: 'FALLIDA', intentos: 0, audit: { eventos: [] },
  };
}

describe('SMTP con dispatcher: persistencia y reintentos sin falso ENVIADA', () => {
  it('fallo de conexión → FALLIDA; reintento aceptado → ENVIADA; repetir no reenvía', async () => {
    const store = new Map<string, Notificacion>();
    const repo: RepositorioNotificaciones = {
      buscarPorId: async (id) => store.get(id) ?? null,
      buscarPorIdempotencia: async (key) => [...store.values()].find((n) => n.idempotencyKey === key) ?? null,
      guardar: async (n) => { store.set(n.id, n); },
    };
    const sendMail = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('conexión simulada'), { code: 'ECONNECTION' }))
      .mockResolvedValue({ messageId: 'smtp-confirmado', accepted: [TO], rejected: [] });
    const canal = new CanalEmail(new EmailProviderSMTP(config, () => ({ sendMail })));
    const dispatcher = new DispatcherNotificaciones({ autorizacion: { perfil: 'SISTEMA' }, repositorio: repo, canales: { EMAIL: canal, INAPP: null, WEBHOOK: null, WHATSAPP: null } });
    const primera = await dispatcher.reintentar(notificacion());
    expect(primera).toMatchObject({ ok: false, estado: 'FALLIDA' });
    expect(store.get('not-smtp')).toMatchObject({ estado: 'FALLIDA', intentos: 1 });
    expect(store.get('not-smtp')?.error).toContain('ECONNECTION');
    const segunda = await dispatcher.reintentar(store.get('not-smtp')!);
    expect(segunda).toMatchObject({ ok: true, estado: 'ENVIADA', externalId: 'smtp-confirmado' });
    expect(store.get('not-smtp')).toMatchObject({ estado: 'ENVIADA', intentos: 2 });
    expect(await dispatcher.reintentar(store.get('not-smtp')!)).toMatchObject({ duplicada: true, entregada: true });
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(JSON.stringify([...store.values()])).not.toContain('secreto-sintetico');
  });

  it('rechazo reiterado agota el límite sin declarar enviado ni volver a conectar', async () => {
    let guardada = notificacion();
    const repo: RepositorioNotificaciones = {
      buscarPorId: async () => guardada, buscarPorIdempotencia: async () => guardada,
      guardar: async (n) => { guardada = n; },
    };
    const { proveedor, sendMail } = proveedorCon({ messageId: 'id-local', accepted: [], rejected: [TO] });
    const dispatcher = new DispatcherNotificaciones({ autorizacion: { perfil: 'SISTEMA' }, repositorio: repo, canales: { EMAIL: new CanalEmail(proveedor), INAPP: null, WEBHOOK: null, WHATSAPP: null } });
    for (let i = 0; i < MAX_REINTENTOS; i++) expect(await dispatcher.reintentar(guardada)).toMatchObject({ ok: false, estado: 'FALLIDA' });
    expect(await dispatcher.reintentar(guardada)).toMatchObject({ ok: false, error: 'max_reintentos' });
    expect(guardada.intentos).toBe(MAX_REINTENTOS);
    expect(sendMail).toHaveBeenCalledTimes(MAX_REINTENTOS);
  });
});
