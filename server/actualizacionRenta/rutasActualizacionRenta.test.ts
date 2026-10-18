import express from 'express';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { montarRutasActualizacionRenta } from './rutasActualizacionRenta';
import type { ServicioActualizacionRenta } from './servicioActualizacionRenta';

const servidores: Server[] = [];

afterEach(async () => {
  await Promise.all(servidores.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function baseLocal(app: express.Express): Promise<string> {
  const server = createServer(app);
  servidores.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se inició el servidor sintético');
  return `http://127.0.0.1:${address.port}`;
}

const preview = {
  estado: 'REQUIERE_REVISION' as const,
  contratoId: 'contrato-a',
  propietarioId: 'prop-a',
  fechaEfectividad: null,
  comunicado: 'NO_COMUNICADO' as const,
  estadoAviso: 'NO_PROGRAMADO' as const,
  codigo: 'COHORTE_PRE_RDL29_REQUIERE_REVISION' as const,
  motivo: 'Requiere revisión.',
};

const resultadoPreview = { preview, huellaPreview: 'a'.repeat(64) };
const resultadoConfirmacion = {
  estado: 'CREADA' as const,
  contratoId: 'contrato-a',
  anexoId: 'anexo-a-v1',
  avisoId: 'aviso-a',
  version: 1 as const,
  fechaAniversario: '2026-10-17',
  fechaProgramadaAviso: '2026-10-20',
  estadoAviso: 'PENDIENTE_ENVIO' as const,
  comunicado: 'NO_COMUNICADO' as const,
  fechaEfectividad: null,
};

describe('P4 · rutas HTTP con token, verificación y payload mínimo', () => {
  it('previsualiza con token verificado y no toma titular, índice ni límites del cliente', async () => {
    const previsualizar = vi.fn(async () => resultadoPreview);
    const confirmar = vi.fn(async () => resultadoConfirmacion);
    const servicio: ServicioActualizacionRenta = { previsualizar, confirmar };
    const app = express();
    app.use(express.json());
    montarRutasActualizacionRenta(app, {
      servicio,
      verificarToken: async (token) => token === 'token-owner' ? { uid: 'uid-owner-a' } : null,
    });
    const base = await baseLocal(app);

    const sinToken = await fetch(`${base}/api/contratos/actualizacion-renta/previsualizar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contratoId: 'contrato-a' }),
    });
    expect(sinToken.status).toBe(401);

    const datosConfiados = await fetch(`${base}/api/contratos/actualizacion-renta/previsualizar`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ contratoId: 'contrato-a', propietarioId: 'prop-victima', limitePrecioReferencia: { importeMensual: 1, verificadoServidor: true } }),
    });
    expect(datosConfiados.status).toBe(400);
    expect(previsualizar).not.toHaveBeenCalled();

    const ok = await fetch(`${base}/api/contratos/actualizacion-renta/previsualizar`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ contratoId: 'contrato-a' }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      ok: true,
      preview: { estado: 'REQUIERE_REVISION', comunicado: 'NO_COMUNICADO' },
      huellaPreview: 'a'.repeat(64),
    });
    expect(previsualizar).toHaveBeenCalledWith({ uid: 'uid-owner-a', contratoId: 'contrato-a' });
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('exige una confirmación expresa, clave de idempotencia y fecha elegida; no expone owner ni canales', async () => {
    const previsualizar = vi.fn(async () => resultadoPreview);
    const confirmar = vi.fn(async () => resultadoConfirmacion);
    const servicio: ServicioActualizacionRenta = { previsualizar, confirmar };
    const app = express();
    app.use(express.json());
    montarRutasActualizacionRenta(app, {
      servicio,
      verificarToken: async (token) => token === 'token-owner' ? { uid: 'uid-owner-a' } : null,
    });
    const base = await baseLocal(app);
    const url = `${base}/api/contratos/actualizacion-renta/confirmar`;
    const body = {
      contratoId: 'contrato-a', huellaPreview: 'a'.repeat(64),
      fechaProgramadaAviso: '2026-10-20', confirmacionExplicita: true,
    };
    const headers = {
      Authorization: 'Bearer token-owner', 'Content-Type': 'application/json', 'Idempotency-Key': 'idempotency-key-route-01',
    };
    const extra = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...body, propietarioId: 'prop-victima' }) });
    expect(extra.status).toBe(400);
    expect(confirmar).not.toHaveBeenCalled();

    const sinClave = await fetch(url, {
      method: 'POST', headers: { Authorization: headers.Authorization, 'Content-Type': headers['Content-Type'] }, body: JSON.stringify(body),
    });
    expect(sinClave.status).toBe(400);
    expect(confirmar).not.toHaveBeenCalled();

    const ok = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({
      ok: true, estado: 'CREADA', estadoAviso: 'PENDIENTE_ENVIO',
      comunicado: 'NO_COMUNICADO', fechaEfectividad: null,
    });
    expect(confirmar).toHaveBeenCalledWith({
      uid: 'uid-owner-a', ...body, idempotencyKey: 'idempotency-key-route-01',
    });
  });

  it('no degrada a memoria y responde 503 cuando falta Firestore durable', async () => {
    const app = express();
    app.use(express.json());
    montarRutasActualizacionRenta(app, { servicio: null, verificarToken: async () => null });
    const base = await baseLocal(app);
    for (const ruta of ['previsualizar', 'confirmar']) {
      const response = await fetch(`${base}/api/contratos/actualizacion-renta/${ruta}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contratoId: 'contrato-a' }),
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ ok: false, codigo: 'P4_NO_DISPONIBLE' });
    }
  });
});
