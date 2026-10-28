/**
 * P0.2.3 — Rate limit + honeypot + longitud máxima en el alta pública.
 * Se monta la ruta REAL (`montarRutasPortalPublico`) sobre un servidor HTTP
 * efímero con un servicio doble: se cuentan las escrituras REALMENTE
 * admitidas, no una simulación del limitador.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { crearLimitadorVentana, claveClientePeticion } from '../server/shared/rateLimit';
import { montarRutasPortalPublico } from '../server/portalPublico/rutasPortalPublico';

let servidor: Server | null = null;
afterEach(async () => {
  if (servidor) await new Promise<void>((r) => servidor!.close(() => r()));
  servidor = null;
});

const SOLICITUD = {
  candidatoNombre: 'Persona Sintética',
  candidatoEmail: 'sintetica@example.test',
  candidatoTelefono: '600111222',
  consentimientoAceptado: true,
};

async function montar(limite = 8, ahora?: () => number) {
  const crearSolicitud = vi.fn(async () => ({
    solicitud: { id: 'sol-srv-1', estado: 'NUEVA' },
    candidatoId: 'cand-srv-1',
  }));
  const servicio = { crearSolicitud } as unknown as Parameters<typeof montarRutasPortalPublico>[1]['servicio'];
  const app = express();
  app.use(express.json({ limit: '300kb' }));
  montarRutasPortalPublico(app, {
    servicio,
    limitador: crearLimitadorVentana({ limite, ventanaMs: 60_000, ...(ahora ? { ahora } : {}) }),
  });
  servidor = createServer(app);
  await new Promise<void>((r) => servidor!.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  return { base, crearSolicitud };
}

function post(base: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/solicitud/sol-inm-1-abc123`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('crearLimitadorVentana · unidad', () => {
  it('admite N peticiones por ventana y bloquea la N+1 con reintento', () => {
    let reloj = 0;
    const lim = crearLimitadorVentana({ limite: 3, ventanaMs: 1000, ahora: () => reloj });
    expect(lim.permitir('k').permitido).toBe(true);
    expect(lim.permitir('k').permitido).toBe(true);
    expect(lim.permitir('k').permitido).toBe(true);
    const bloqueo = lim.permitir('k');
    expect(bloqueo.permitido).toBe(false);
    expect(bloqueo.reintentarEnSegundos).toBeGreaterThanOrEqual(1);
    reloj = 1001;
    expect(lim.permitir('k').permitido).toBe(true);
  });

  it('aisla claves y respeta el tope de claves vivas', () => {
    const lim = crearLimitadorVentana({ limite: 5, ventanaMs: 1000, maxClaves: 3, ahora: () => 10 });
    for (const k of ['a', 'b', 'c', 'd', 'e']) lim.permitir(k);
    expect(lim.clavesVivas()).toBeLessThanOrEqual(3);
  });

  it('la clave combina IP y token y no acepta cabeceras arbitrarias', () => {
    const a = claveClientePeticion({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }, 'tok-1', '', true);
    const b = claveClientePeticion({ 'x-forwarded-for': '203.0.113.7' }, 'tok-2', '', true);
    expect(a).toBe('203.0.113.7|tok-1');
    expect(a).not.toBe(b);
    expect(claveClientePeticion({ 'x-forwarded-for': 'javascript:alert(1)' }, 'tok-1', '')).toBe('ip-desconocida|tok-1');
  });

  it('H-05 · sin proxy de confianza, una x-forwarded-for falsificada NO cambia la clave', () => {
    const forjada = claveClientePeticion({ 'x-forwarded-for': '198.51.100.1' }, 'tok-1', '203.0.113.9', false);
    const otraForjada = claveClientePeticion({ 'x-forwarded-for': '198.51.100.2' }, 'tok-1', '203.0.113.9', false);
    expect(forjada).toBe('203.0.113.9|tok-1');
    expect(otraForjada).toBe(forjada);
  });
});

describe('POST /api/solicitud/:token · antispam HTTP real', () => {
  it('100 peticiones/min desde la misma IP solo producen 8 escrituras', async () => {
    const { base, crearSolicitud } = await montar(8);
    const respuestas = await Promise.all(
      Array.from({ length: 100 }, () => post(base, { solicitud: SOLICITUD })),
    );
    // La IP es la misma (loopback) y el token también: una sola clave.
    expect(crearSolicitud).toHaveBeenCalledTimes(8);
    const limitadas = respuestas.filter((r) => r.status === 429);
    expect(limitadas.length).toBe(92);
  }, 30000);

  it('el honeypot relleno se rechaza ANTES de escribir (400)', async () => {
    const { base, crearSolicitud } = await montar();
    const r = await post(base, { solicitud: SOLICITUD, _hp: 'soy-un-bot' });
    expect(r.status).toBe(400);
    expect(crearSolicitud).not.toHaveBeenCalled();
  });

  it('el honeypot vacío es legítimo y permite el alta', async () => {
    const { base, crearSolicitud } = await montar();
    const r = await post(base, { solicitud: SOLICITUD, _hp: '' });
    expect(r.status).toBe(200);
    expect(crearSolicitud).toHaveBeenCalledTimes(1);
  });

  it('un cuerpo demasiado grande se corta en 413 y no llega al servicio', async () => {
    const { base, crearSolicitud } = await montar();
    const r = await post(base, { solicitud: { ...SOLICITUD, relleno: 'x'.repeat(300_000) } });
    expect([413, 400]).toContain(r.status);
    expect(crearSolicitud).not.toHaveBeenCalled();
  });

  it('campos fuera de la lista blanca se rechazan (400)', async () => {
    const { base, crearSolicitud } = await montar();
    const r = await post(base, { solicitud: SOLICITUD, propietarioId: 'prop-ajeno' });
    expect(r.status).toBe(400);
    expect(crearSolicitud).not.toHaveBeenCalled();
  });

  it('sin servicio (falta Firestore) la ruta responde 503, no finge el alta', async () => {
    const app = express();
    app.use(express.json());
    montarRutasPortalPublico(app, { servicio: null });
    servidor = createServer(app);
    await new Promise<void>((r) => servidor!.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    const r = await post(base, { solicitud: SOLICITUD });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ ok: false, codigo: 'PORTAL_NO_DISPONIBLE' });
  });
});
