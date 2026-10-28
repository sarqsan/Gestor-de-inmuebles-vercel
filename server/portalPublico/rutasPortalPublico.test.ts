/**
 * AG-02 — Rutas HTTP de los portales públicos (sin Firebase real).
 *
 * Se comprueba el contrato de la frontera: token en la ruta, cuerpo con lista
 * blanca cerrada, errores en lenguaje de la persona usuaria, `no-store` y
 * fallo cerrado (503) cuando no hay credencial de servicio.
 */
import express from 'express';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ErrorPortalPublico,
  type ServicioPortalPublico,
} from './servicioPortalPublico.js';
import {
  MAX_CUERPO_PORTAL_PUBLICO,
  montarRutasPortalPublico,
} from './rutasPortalPublico.js';
import { limitarCuerpoPublico, manejadorCuerpoDemasiadoGrande } from '../shared/limiteCuerpo.js';
import { crearLimitadorVentana } from '../shared/rateLimit.js';

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

function servicioFalso(over: Partial<ServicioPortalPublico> = {}) {
  return {
    obtenerVisita: vi.fn(async () => ({
      invitacion: { id: 'inv-1', status: 'ABIERTO' },
      slots: [{ id: 'slot-1', disponible: true }],
      inmuebleId: 'inm-1',
    })),
    reservarVisita: vi.fn(async () => ({
      invitacion: { id: 'inv-1', status: 'HORARIO RESERVADO' },
      slot: { id: 'slot-1', disponible: false },
      candidatoEstado: 'visita_reservada',
    })),
    cancelarVisita: vi.fn(async () => ({
      invitacion: { id: 'inv-1', status: 'ABIERTO' },
      slot: { id: 'slot-1', disponible: true },
      candidatoEstado: 'preseleccionado',
    })),
    obtenerCuestionario: vi.fn(async () => ({ candidato: { id: 'cand-1', nombre: 'Ana' } })),
    guardarCuestionario: vi.fn(async () => ({ candidato: { id: 'cand-1', nombre: 'Ana' } })),
    obtenerDocumentacion: vi.fn(async () => ({ solicitud: { id: 'sdoc-1', estado: 'SOLICITADA' } })),
    actualizarDocumentacion: vi.fn(async () => ({ solicitud: { id: 'sdoc-1', estado: 'COMPLETADA' } })),
    ...over,
  } as unknown as ServicioPortalPublico;
}

/** Misma composición que `server.ts`: parser acotado por bytes + rutas. */
async function montar(servicio: ServicioPortalPublico | null, deps: Partial<Parameters<typeof montarRutasPortalPublico>[1]> = {}) {
  const app = express();
  app.use(...limitarCuerpoPublico(MAX_CUERPO_PORTAL_PUBLICO));
  app.use(manejadorCuerpoDemasiadoGrande());
  montarRutasPortalPublico(app, { servicio, ...deps });
  return baseLocal(app);
}

describe('AG-02 · rutas de visita', () => {
  it('GET devuelve la invitación y los slots con no-store', async () => {
    const servicio = servicioFalso();
    const base = await montar(servicio);
    const respuesta = await fetch(`${base}/api/visita/vst-token-123456`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
    expect(await respuesta.json()).toMatchObject({
      ok: true,
      inmuebleId: 'inm-1',
      invitacion: { id: 'inv-1' },
      slots: [{ id: 'slot-1' }],
    });
    expect(servicio.obtenerVisita).toHaveBeenCalledWith('vst-token-123456');
  });

  it('POST reservar solo acepta slotId y notas; un campo extra no llega al servicio', async () => {
    const servicio = servicioFalso();
    const base = await montar(servicio);
    const url = `${base}/api/visita/vst-token-123456/reservar`;

    const extra = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId: 'slot-1', notas: 'ok', candidatoId: 'otro' }),
    });
    expect(extra.status).toBe(400);
    expect(servicio.reservarVisita).not.toHaveBeenCalled();

    const valida = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId: 'slot-1', notas: 'Voy acompañada' }),
    });
    expect(valida.status).toBe(200);
    expect(servicio.reservarVisita).toHaveBeenCalledWith('vst-token-123456', {
      slotId: 'slot-1',
      notas: 'Voy acompañada',
    });
  });

  it('POST cancelar exige cuerpo vacío', async () => {
    const servicio = servicioFalso();
    const base = await montar(servicio);
    const url = `${base}/api/visita/vst-token-123456/cancelar`;

    const conCampo = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId: 'slot-1' }),
    });
    expect(conCampo.status).toBe(400);
    expect(servicio.cancelarVisita).not.toHaveBeenCalled();

    const vacio = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(vacio.status).toBe(200);
    expect(servicio.cancelarVisita).toHaveBeenCalledWith('vst-token-123456');
  });

  it('mapea los errores de negocio sin exponer detalles internos', async () => {
    const base = await montar(servicioFalso({
      reservarVisita: vi.fn(async () => {
        throw new ErrorPortalPublico('HORARIO_NO_DISPONIBLE', 409, 'CARRERA_PERDIDA');
      }) as unknown as ServicioPortalPublico['reservarVisita'],
    }));
    const respuesta = await fetch(`${base}/api/visita/vst-token-123456/reservar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId: 'slot-1' }),
    });
    expect(respuesta.status).toBe(409);
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
    expect(await respuesta.json()).toMatchObject({
      ok: false,
      codigo: 'HORARIO_NO_DISPONIBLE',
      error: 'Ese horario ya no está disponible. Elige otro, por favor.',
    });
  });
});

describe('AG-02 · rutas de cuestionario y documentación', () => {
  it('GET cuestionario y GET documentación resuelven el token', async () => {
    const servicio = servicioFalso();
    const base = await montar(servicio);

    const cuestionario = await fetch(`${base}/api/cuestionario/q-token-123456`);
    expect(cuestionario.status).toBe(200);
    expect(servicio.obtenerCuestionario).toHaveBeenCalledWith('q-token-123456');

    const documentacion = await fetch(`${base}/api/documentacion/doc-token-123456`);
    expect(documentacion.status).toBe(200);
    expect(servicio.obtenerDocumentacion).toHaveBeenCalledWith('doc-token-123456');
  });

  it('POST cuestionario acepta datos, respuestas e información adicional; rechaza el resto', async () => {
    const servicio = servicioFalso();
    const base = await montar(servicio);
    const url = `${base}/api/cuestionario/q-token-123456`;

    const extra = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datos: { nombre: 'Ana' }, respuestas: [], informacionAdicional: '', candidatoId: 'x' }),
    });
    expect(extra.status).toBe(400);
    expect(servicio.guardarCuestionario).not.toHaveBeenCalled();

    const valido = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        datos: { nombre: 'Ana' },
        respuestas: [{ preguntaId: 'sit_1' }],
        informacionAdicional: 'Nada',
      }),
    });
    expect(valido.status).toBe(200);
    expect(servicio.guardarCuestionario).toHaveBeenCalledWith('q-token-123456', {
      datos: { nombre: 'Ana' },
      respuestas: [{ preguntaId: 'sit_1' }],
      informacionAdicional: 'Nada',
    });
  });

  it('POST documentación solo acepta documentos y final', async () => {
    const servicio = servicioFalso();
    const base = await montar(servicio);
    const url = `${base}/api/documentacion/doc-token-123456`;

    const extra = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentos: [], final: true, estado: 'COMPLETADA' }),
    });
    expect(extra.status).toBe(400);
    expect(servicio.actualizarDocumentacion).not.toHaveBeenCalled();

    const valido = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentos: [{ id: 'dni', archivos: [] }], final: true }),
    });
    expect(valido.status).toBe(200);
    expect(servicio.actualizarDocumentacion).toHaveBeenCalledWith('doc-token-123456', {
      documentos: [{ id: 'dni', archivos: [] }],
      final: true,
    });
  });

  it('rechaza cuerpos por encima del límite antes de llamar al servicio', async () => {
    const servicio = servicioFalso();
    const base = await montar(servicio);
    const relleno = 'x'.repeat(MAX_CUERPO_PORTAL_PUBLICO + 1024);
    const respuesta = await fetch(`${base}/api/cuestionario/q-token-123456`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datos: { nombre: relleno }, respuestas: [], informacionAdicional: '' }),
    });
    expect(respuesta.status).toBe(413);
    expect(servicio.guardarCuestionario).not.toHaveBeenCalled();
  });
});

describe('H-05 · cuota y honeypot en TODAS las superficies públicas', () => {
  it('el honeypot bloquea la reserva de visita sin llamar al servicio', async () => {
    const servicio = servicioFalso();
    const base = await montar(servicio);
    const respuesta = await fetch(`${base}/api/visita/vst-token-123456/reservar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId: 'slot-1', _hp: 'relleno-de-bot' }),
    });
    expect(respuesta.status).toBe(400);
    expect(servicio.reservarVisita).not.toHaveBeenCalled();
  });

  it('el honeypot bloquea el cuestionario y la documentación', async () => {
    const servicio = servicioFalso();
    const base = await montar(servicio);
    const cuestionario = await fetch(`${base}/api/cuestionario/q-token-123456`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datos: {}, respuestas: [], _hp: 'bot' }),
    });
    expect(cuestionario.status).toBe(400);
    expect(servicio.guardarCuestionario).not.toHaveBeenCalled();

    const documentacion = await fetch(`${base}/api/documentacion/doc-token-123456`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentos: [], final: false, _hp: 'bot' }),
    });
    expect(documentacion.status).toBe(400);
    expect(servicio.actualizarDocumentacion).not.toHaveBeenCalled();
  });

  it('la cuota de reservas devuelve 429 al superar la ventana', async () => {
    const servicio = servicioFalso();
    const base = await montar(servicio, {
      limitadores: { visita: crearLimitadorVentana({ limite: 2, ventanaMs: 60_000 }) },
    });
    const enviar = () => fetch(`${base}/api/visita/vst-token-123456/reservar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId: 'slot-1' }),
    });
    expect((await enviar()).status).toBe(200);
    expect((await enviar()).status).toBe(200);
    const tercera = await enviar();
    expect(tercera.status).toBe(429);
    expect(tercera.headers.get('retry-after')).toBeTruthy();
    expect(servicio.reservarVisita).toHaveBeenCalledTimes(2);
  });

  it('la cuota de cuestionario y de lectura también responde 429', async () => {
    const servicio = servicioFalso();
    const base = await montar(servicio, {
      limitadores: {
        cuestionario: crearLimitadorVentana({ limite: 1, ventanaMs: 60_000 }),
        lectura: crearLimitadorVentana({ limite: 1, ventanaMs: 60_000 }),
      },
    });
    const post = () => fetch(`${base}/api/cuestionario/q-token-123456`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datos: {}, respuestas: [] }),
    });
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(429);

    const lectura = await fetch(`${base}/api/documentacion/doc-token-123456`);
    expect(lectura.status).toBe(200);
    const segunda = await fetch(`${base}/api/documentacion/doc-token-123456`);
    expect(segunda.status).toBe(429);
  });
});

describe('AG-02 · fallo cerrado sin credencial de servicio', () => {
  it('todas las rutas responden 503 si el servicio no está construido', async () => {
    const base = await montar(null);
    const peticiones = [
      fetch(`${base}/api/visita/vst-token-123456`),
      fetch(`${base}/api/visita/vst-token-123456/reservar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      }),
      fetch(`${base}/api/visita/vst-token-123456/cancelar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      }),
      fetch(`${base}/api/cuestionario/q-token-123456`),
      fetch(`${base}/api/documentacion/doc-token-123456`),
    ];
    for (const respuesta of await Promise.all(peticiones)) {
      expect(respuesta.status).toBe(503);
      expect(await respuesta.json()).toMatchObject({ ok: false, codigo: 'PORTAL_NO_DISPONIBLE' });
    }
  });
});
