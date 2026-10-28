/**
 * P0.1 — `/api/health` ampliado: estado REAL de las capacidades, sin secretos.
 *
 * Dos niveles de prueba real:
 *  · Unidad del constructor puro `construirCapacidades` (todas las ramas).
 *  · HTTP real contra la app Express montada en un puerto efímero: se importa
 *    `server.ts` con `VERCEL=1` para que NO llame a `app.listen()` ni monte
 *    Vite, y se sirve con `node:http`. No se contacta con ningún servicio
 *    externo; las dependencias reales quedan sin credenciales.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  construirCapacidades,
  ESTADOS_NO_REALES,
  type EntradasCapacidades,
} from '../server/diagnostico/capacidades';

const TODO_OK: EntradasCapacidades = {
  autenticacion: true,
  firestore: true,
  storage: true,
  registroIA: 'FIRESTORE',
  llavesIA: 'CONFIGURADO',
  bloqueoComercialIA: false,
  claveModeloServidor: true,
  modoEmail: 'REAL',
  cron: true,
  notificacionesDuraderas: true,
  portalesPublicos: true,
  justificantesCobro: true,
  actualizacionRenta: true,
  seguimientoIncidencias: true,
  documentos: true,
};

const NUCLEO = [
  'autenticacion', 'firestore', 'portalesPublicos', 'custodia',
  'actualizacionRenta', 'seguimiento', 'modoEmail', 'cron',
];

describe('construirCapacidades · contrato puro', () => {
  it('H-13 · sin proyecto Firebase la autenticación NO es OK (ya no es una constante)', () => {
    const mapa = construirCapacidades({ ...TODO_OK, autenticacion: false });
    expect(mapa.autenticacion.estado).toBe('NO_CONFIGURADO');
    expect(mapa.autenticacion.detalle).toMatch(/proyecto Firebase/i);
    expect(ESTADOS_NO_REALES).toContain(mapa.autenticacion.estado);
  });

  it('con todo configurado, las 8 capacidades núcleo son OK', () => {
    const mapa = construirCapacidades(TODO_OK);
    for (const nombre of NUCLEO) {
      expect(mapa[nombre].estado, nombre).toBe('OK');
      expect(mapa[nombre].detalle.length).toBeGreaterThan(5);
    }
    expect(Object.keys(mapa)).toHaveLength(14);
  });

  it('sin credenciales, las dependencias son NO_CONFIGURADO y NUNCA OK', () => {
    const mapa = construirCapacidades({ ...TODO_OK, firestore: false, storage: false,
      portalesPublicos: false, documentos: false, justificantesCobro: false,
      actualizacionRenta: false, seguimientoIncidencias: false, cron: false });
    for (const nombre of ['firestore', 'almacenDocumental', 'portalesPublicos', 'custodia',
      'justificantesCobro', 'actualizacionRenta', 'seguimiento', 'cron']) {
      expect(mapa[nombre].estado, nombre).toBe('NO_CONFIGURADO');
    }
  });

  it('memoria y MODO_SEGURO se etiquetan SIMULACION, no OK', () => {
    const mapa = construirCapacidades({ ...TODO_OK, registroIA: 'MEMORIA',
      notificacionesDuraderas: false, modoEmail: 'MODO_SEGURO' });
    expect(mapa.registroIA.estado).toBe('SIMULACION');
    expect(mapa.notificaciones.estado).toBe('SIMULACION');
    expect(mapa.modoEmail.estado).toBe('SIMULACION');
    expect(mapa.modoEmail.detalle).toContain('no se envía');
  });

  it('la IA desactivada por defecto se etiqueta BLOQUEADO, no fallo técnico', () => {
    const mapa = construirCapacidades({ ...TODO_OK, bloqueoComercialIA: true });
    expect(mapa.analisisIA.estado).toBe('BLOQUEADO');
    expect(mapa.analisisIA.detalle).toContain('aprobación');
  });

  it('todos los estados pertenecen al vocabulario cerrado', () => {
    const permitidos = new Set(['OK', ...ESTADOS_NO_REALES]);
    for (const mapa of [construirCapacidades(TODO_OK), construirCapacidades({ ...TODO_OK, firestore: false })]) {
      for (const [nombre, c] of Object.entries(mapa)) {
        expect(permitidos.has(c.estado), `${nombre}=${c.estado}`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// HTTP real contra la app Express (sin Vite, sin listen propio, sin red externa)
// ---------------------------------------------------------------------------
vi.stubEnv('VERCEL', '1');
vi.stubEnv('NODE_ENV', 'test');
// Secretos FALSOS inyectados solo para comprobar que NUNCA viajan en la respuesta.
const SECRETOS = {
  CRON_SECRET: 'DOCTOR_CRON_SECRETO_FALSO_987',
  GEMINI_API_KEY: 'DOCTOR_GEMINI_FALSO_123',
  RESEND_API_KEY: 'DOCTOR_RESEND_FALSO_456',
  SENDGRID_API_KEY: 'DOCTOR_SENDGRID_FALSO_789',
  SMTP_URL: 'smtps://usuario:DOCTOR_SMTP_FALSO_321@smtp.example.test:465',
  IA_LLAVES_CLAVE_MAESTRA: 'DOCTOR_CLAVE_MAESTRA_FALSA_654',
};
for (const [clave, valor] of Object.entries(SECRETOS)) vi.stubEnv(clave, valor);

describe('GET /api/health · respuesta HTTP real', () => {
  let servidor: Server;
  let base = '';

  beforeAll(async () => {
    const { default: app } = await import('../server');
    servidor = createServer(app as unknown as (req: unknown, res: unknown) => void);
    await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  }, 60000);

  afterAll(async () => {
    await new Promise<void>((resolver) => servidor.close(() => resolver()));
    vi.unstubAllEnvs();
  });

  it('devuelve 200, esquema P0.1 y el mapa completo de capacidades', async () => {
    const respuesta = await fetch(`${base}/api/health`);
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo.status).toBe('ok');
    expect(cuerpo.esquemaDiagnostico).toBe(1);
    expect(cuerpo.capacidades).toBeTypeOf('object');
    for (const nombre of NUCLEO) {
      expect(cuerpo.capacidades[nombre], nombre).toBeDefined();
      expect(cuerpo.capacidades[nombre].estado, nombre).toBeTypeOf('string');
      expect(cuerpo.capacidades[nombre].detalle, nombre).toBeTypeOf('string');
    }
    expect(Object.keys(cuerpo.capacidades).length).toBeGreaterThanOrEqual(8);
  });

  it('NUNCA publica valores de secretos (solo su presencia)', async () => {
    const texto = await (await fetch(`${base}/api/health`)).text();
    for (const valor of Object.values(SECRETOS)) {
      expect(texto).not.toContain(valor);
    }
    expect(texto).not.toContain('private_key');
    const cuerpo = JSON.parse(texto);
    // La presencia sí se informa, de forma booleana.
    expect(cuerpo.geminiKeyConfigured).toBe(true);
    expect(cuerpo.notificaciones.cron.configurado).toBe(true);
  });

  it('sin credenciales de servicio NO finge capacidades reales', async () => {
    const cuerpo = await (await fetch(`${base}/api/health`)).json();
    expect(cuerpo.capacidades.firestore.estado).toBe('NO_CONFIGURADO');
    expect(cuerpo.capacidades.portalesPublicos.estado).toBe('NO_CONFIGURADO');
    expect(cuerpo.capacidades.custodia.estado).toBe('NO_CONFIGURADO');
    // El correo con secretos falsos sigue sin ser una entrega real verificada:
    expect(['REAL', 'MODO_SEGURO']).toContain(cuerpo.notificaciones.email.modo);
  });
});
