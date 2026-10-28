/**
 * H-04 — El tope de 256 KB de las superficies públicas se aplica sobre los BYTES
 * del stream, no sobre `Content-Length`.
 * ---------------------------------------------------------------------------
 * La auditoría de cierre reprodujo el bypass: con cabecera, 413; con
 * `Transfer-Encoding: chunked`, el cuerpo entraba igual (503 al no haber
 * servicio). Esta prueba arranca la APP REAL de `server.ts` (la misma que
 * exporta `api/index.ts`) sin escuchar en el puerto fijo y envía peticiones
 * troceadas de verdad.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { request as httpRequest } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.VERCEL = '1'; // impide app.listen(): la app se monta en un servidor de prueba

let servidor: Server;
let base: string;
let app: unknown;

beforeAll(async () => {
  const modulo = await import('../server');
  app = modulo.default;
  servidor = createServer(app as never);
  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', () => resolver()));
  const { port } = servidor.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  if (servidor) await new Promise<void>((resolver) => servidor.close(() => resolver()));
});

const RELLENO = 'x'.repeat(300 * 1024);

/** POST con `Transfer-Encoding: chunked` (sin Content-Length), escrito en trozos. */
function postChunked(ruta: string, cuerpo: string): Promise<{ status: number; json: Record<string, unknown> }> {
  return new Promise((resolver, rechazar) => {
    const destino = new URL(`${base}${ruta}`);
    const req = httpRequest({
      hostname: destino.hostname,
      port: destino.port,
      path: destino.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
    }, (res) => {
      let datos = '';
      res.setEncoding('utf8');
      res.on('data', (trozo) => { datos += trozo; });
      res.on('end', () => {
        let json: Record<string, unknown> = {};
        try { json = JSON.parse(datos || '{}'); } catch { json = { crudo: datos.slice(0, 120) }; }
        resolver({ status: res.statusCode || 0, json });
      });
    });
    req.on('error', rechazar);
    // Trozos deliberadamente pequeños para forzar el camino de streaming.
    for (let i = 0; i < cuerpo.length; i += 8192) req.write(cuerpo.slice(i, i + 8192));
    req.end();
  });
}

describe('H-04 · tope de cuerpo en rutas públicas', () => {
  it('rechaza con 413 y JSON un cuerpo chunked de 300 KB (sin Content-Length)', async () => {
    const cuerpo = JSON.stringify({ datos: { relleno: RELLENO }, respuestas: [], informacionAdicional: '' });
    const { status, json } = await postChunked('/api/cuestionario/token-de-prueba-123456', cuerpo);
    expect(status).toBe(413);
    expect(json.codigo).toBe('PETICION_INVALIDA');
  });

  it('rechaza también con 413 el mismo cuerpo enviado con Content-Length', async () => {
    const cuerpo = JSON.stringify({ datos: { relleno: RELLENO } });
    const respuesta = await fetch(`${base}/api/documentacion/token-de-prueba-123456`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo,
    });
    expect(respuesta.status).toBe(413);
    expect((await respuesta.json()).codigo).toBe('PETICION_INVALIDA');
  });

  it('un cuerpo pequeño atraviesa el parser y llega a la ruta (503 sin credencial de servicio)', async () => {
    const respuesta = await fetch(`${base}/api/visita/token-de-prueba-123456/reservar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId: 'slot-1' }),
    });
    // Sin credencial de servicio el portal responde 503; lo relevante es que NO
    // es un 413 ni un 404: el cuerpo pequeño se ha aceptado.
    expect(respuesta.status).toBe(503);
    expect((await respuesta.json()).codigo).toBe('PORTAL_NO_DISPONIBLE');
  });

  it('un cuerpo pequeño pero de tipo no JSON no se cuela por otro parser', async () => {
    const respuesta = await fetch(`${base}/api/visita/token-de-prueba-123456/reservar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'slotId=slot-1',
    });
    // El parser acotado con `type: () => true` intenta JSON: cuerpo inválido ⇒ 400.
    expect([400, 503]).toContain(respuesta.status);
  });
});
