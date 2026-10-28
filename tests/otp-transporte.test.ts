/**
 * H-08 — Las rutas HTTP del OTP de actas ya NO son un relé de correo abierto.
 * ---------------------------------------------------------------------------
 * Pruebas HTTP reales (Express + `node:http`, sin red externa) sobre las rutas
 * que se montan en producción. Se demuestra, con peticiones reales:
 *  · la ruta antigua `/api/actas/otp/entregar` responde 410 (retirada);
 *  · un `destino` inyectado en el cuerpo se IGNORA: el correo va al firmante
 *    que consta en el acta (el fallo medido en la auditoría era 200 `enviado:true`
 *    a `cualquier-persona@externo.example`);
 *  · sin transporte REAL no hay código: 503 y ningún mensaje;
 *  · un rechazo del proveedor es 502, nunca un `enviado:true` mentiroso;
 *  · el código nunca aparece en la respuesta;
 *  · los límites de peticiones devuelven 429.
 */
import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { montarRutasOtpActas } from '../server/actas/rutasOtpActas';
import { crearLimitadorVentana } from '../server/shared/rateLimit';
import type { IdentidadVerificada } from '../server/titularidades/googleBackend';
import {
  PuertoOtpFalso,
  ProveedorCorreoFalso,
  actaDePrueba,
  sembrarPropietario,
  IDENTIDAD_PROPIETARIO,
  IDENTIDAD_INQUILINO,
} from './harness/puertoOtpFalso';

let servidor: Server | null = null;

afterEach(async () => {
  if (servidor) await new Promise<void>((resolver) => servidor!.close(() => resolver()));
  servidor = null;
});

interface Escenario {
  puerto: PuertoOtpFalso | null;
  proveedor: ProveedorCorreoFalso;
  modo?: 'REAL' | 'MODO_SEGURO';
  limiteIp?: number;
}

async function montar(escenario: Escenario): Promise<string> {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  const identidades: Record<string, IdentidadVerificada> = {
    propietario: IDENTIDAD_PROPIETARIO,
    inquilino: IDENTIDAD_INQUILINO,
  };
  montarRutasOtpActas(app, {
    verificarToken: async (token) => identidades[token] || null,
    puerto: escenario.puerto,
    transporte: {
      modo: escenario.modo ?? 'REAL',
      proveedor: 'SMTP_PRUEBA',
      provider: escenario.proveedor,
    },
    ...(escenario.limiteIp ? { limitadorIp: crearLimitadorVentana({ limite: escenario.limiteIp, ventanaMs: 60_000 }) } : {}),
  });
  const http = createServer(app);
  servidor = http;
  await new Promise<void>((resolver) => http.listen(0, '127.0.0.1', () => resolver()));
  const { port } = http.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function prepararEscenario(sobrescribir: Partial<Escenario> = {}) {
  const puerto = sobrescribir.puerto === undefined ? new PuertoOtpFalso() : sobrescribir.puerto;
  if (puerto) {
    sembrarPropietario(puerto);
    puerto.sembrar('actas', 'acta-1', actaDePrueba());
  }
  const proveedor = new ProveedorCorreoFalso();
  return { puerto, proveedor, modo: sobrescribir.modo, limiteIp: sobrescribir.limiteIp } as Escenario;
}

async function post(base: string, ruta: string, cuerpo: unknown, token = 'propietario') {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown>, cabeceras: respuesta.headers };
}

describe('rutas de OTP · relé cerrado', () => {
  it('la ruta antigua de entrega con destino libre está RETIRADA (410)', async () => {
    const base = await montar(prepararEscenario());
    const { status, cuerpo } = await post(base, '/api/actas/otp/entregar', {
      destino: 'cualquier-persona@externo.example',
      codigo: '123456',
      actaId: 'acta-1',
      firmaId: 'firma-1',
    });
    expect(status).toBe(410);
    expect(cuerpo.codigo).toBe('RUTA_RETIRADA');
  });

  it('un `destino` inyectado en el cuerpo se IGNORA: el correo va al firmante del acta', async () => {
    const escenario = prepararEscenario();
    const base = await montar(escenario);
    const { status, cuerpo } = await post(base, '/api/actas/otp/solicitar', {
      actaId: 'acta-1',
      participanteId: 'part-inquilino',
      destino: 'cualquier-persona@externo.example',
    });
    expect(status).toBe(200);
    expect(cuerpo.enviado).toBe(true);
    expect(escenario.proveedor.enviados).toHaveLength(1);
    expect(escenario.proveedor.enviados[0].to).toBe('inquilino@example.test');
    expect(escenario.proveedor.enviados.map((m) => m.to)).not.toContain('cualquier-persona@externo.example');
    expect(JSON.stringify(cuerpo)).not.toContain(escenario.proveedor.codigos[0]);
  });

  it('sin token verificado responde 401 y no envía nada', async () => {
    const escenario = prepararEscenario();
    const base = await montar(escenario);
    const { status } = await post(base, '/api/actas/otp/solicitar', { actaId: 'acta-1', participanteId: 'part-inquilino' }, '');
    expect(status).toBe(401);
    expect(escenario.proveedor.enviados).toHaveLength(0);
  });

  it('sin credencial de servicio de Firestore responde 503 (el OTP no vive en el cliente)', async () => {
    const escenario = prepararEscenario({ puerto: null });
    const base = await montar(escenario);
    const { status, cuerpo } = await post(base, '/api/actas/otp/solicitar', { actaId: 'acta-1', participanteId: 'part-inquilino' });
    expect(status).toBe(503);
    expect(cuerpo.codigo).toBe('SERVIDOR_SIN_CONFIGURAR');
    expect(escenario.proveedor.enviados).toHaveLength(0);
  });

  it('con transporte en MODO_SEGURO responde 503 y NO envía correo', async () => {
    const escenario = prepararEscenario({ modo: 'MODO_SEGURO' });
    const base = await montar(escenario);
    const { status, cuerpo } = await post(base, '/api/actas/otp/solicitar', { actaId: 'acta-1', participanteId: 'part-inquilino' });
    expect(status).toBe(503);
    expect(cuerpo.codigo).toBe('OTP_ENTREGA_NO_DISPONIBLE');
    expect(escenario.proveedor.enviados).toHaveLength(0);
  });

  it('un rechazo del proveedor es 502, no un `enviado:true` mentiroso', async () => {
    const escenario = prepararEscenario();
    escenario.proveedor.ok = false;
    const base = await montar(escenario);
    const { status, cuerpo } = await post(base, '/api/actas/otp/solicitar', { actaId: 'acta-1', participanteId: 'part-inquilino' });
    expect(status).toBe(502);
    expect(cuerpo.ok).toBe(false);
    expect(cuerpo.codigo).toBe('OTP_ENTREGA_RECHAZADA');
  });

  it('el límite por IP devuelve 429 al superar la cuota', async () => {
    const escenario = prepararEscenario({ limiteIp: 1 });
    const base = await montar(escenario);
    const primera = await post(base, '/api/actas/otp/solicitar', { actaId: 'acta-1', participanteId: 'part-inquilino' });
    expect(primera.status).toBe(200);
    const segunda = await post(base, '/api/actas/otp/solicitar', { actaId: 'acta-1', participanteId: 'part-propietario' });
    expect(segunda.status).toBe(429);
    expect(segunda.cabeceras.get('retry-after')).toBeTruthy();
    expect(escenario.proveedor.enviados).toHaveLength(1);
  });

  it('validar exige código de 6 dígitos, ronda abierta y OTP real', async () => {
    const escenario = prepararEscenario();
    const base = await montar(escenario);
    const invalido = await post(base, '/api/actas/otp/validar', { actaId: 'acta-1', participanteId: 'part-inquilino', codigo: 'abc' });
    expect(invalido.status).toBe(400);
    expect(invalido.cuerpo.codigo).toBe('PETICION_INVALIDA');

    // Acta en BORRADOR: no hay firmas, el servidor no inventa una.
    const sinRonda = await post(base, '/api/actas/otp/validar', { actaId: 'acta-1', participanteId: 'part-inquilino', codigo: '123456' });
    expect(sinRonda.status).toBe(409);
    expect(sinRonda.cuerpo.codigo).toBe('FIRMA_NO_ENCONTRADA');

    // Ronda abierta pero sin código pedido para ESE firmante.
    const apertura = await post(base, '/api/actas/otp/solicitar', { actaId: 'acta-1', participanteId: 'part-propietario' });
    expect(apertura.status).toBe(200);
    const sinOtp = await post(base, '/api/actas/otp/validar', { actaId: 'acta-1', participanteId: 'part-inquilino', codigo: '123456' });
    expect(sinOtp.status).toBe(404);
    expect(sinOtp.cuerpo.codigo).toBe('OTP_NO_DISPONIBLE');
  });

  it('flujo HTTP completo: solicitar → validar en servidor con el código recibido', async () => {
    const escenario = prepararEscenario();
    const base = await montar(escenario);
    const solicitud = await post(base, '/api/actas/otp/solicitar', { actaId: 'acta-1', participanteId: 'part-inquilino' });
    expect(solicitud.status).toBe(200);
    const codigo = escenario.proveedor.codigos[0];
    expect(codigo).toMatch(/^\d{6}$/);

    const validacion = await post(base, '/api/actas/otp/validar', { actaId: 'acta-1', participanteId: 'part-inquilino', codigo });
    expect(validacion.status).toBe(200);
    expect(validacion.cuerpo.valido).toBe(true);
    expect(validacion.cuerpo.estadoFirma).toBe('EN_PROCESO');

    const acta = escenario.puerto!.datosDe('actas', 'acta-1')!;
    const firmas = acta.firmas as Array<Record<string, unknown>>;
    expect(firmas.find((f) => f.firmanteId === 'part-inquilino')?.estado).toBe('FIRMADA');
  });
});
