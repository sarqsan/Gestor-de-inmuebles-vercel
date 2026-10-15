/**
 * IA · FASE 1 — NÚCLEO DE IA CENTRALIZADO (server/ia/nucleoIA.ts)
 * ================================================================
 * Peticiones HTTP REALES contra una app Express en un puerto efímero, con
 * dependencias inyectadas (verificador de token, registro y proveedor falsos):
 * sin red externa y sin datos reales.
 *
 * Cubre: autenticación obligatoria (uid sólo del token), idempotencia y
 * duplicados (incluida la concurrencia), registro por usuario antes de la
 * respuesta, lista blanca de campos, origen PROVEEDOR/RESPALDO/ERROR, errores
 * del proveedor y del registro, y el modo NO_CONFIGURADO de producción.
 */
import { createSign, generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type Request, type Response } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CABECERA_ID_OPERACION_IA,
  CABECERA_REGISTRO_IA,
  clienteIA,
  codigoErrorProveedor,
  crearNucleoIA,
  generateGeminiWithRetry,
  idOperacionIA,
  type ClienteProveedorIA,
  type EventoNucleoIA,
} from '../server/ia/nucleoIA';
import {
  CAMPOS_REGISTRO_IA,
  crearRegistroMemoria,
  type RegistroOperacionesIA,
} from '../server/ia/registroOperacionesIA';
import { OPERACIONES_IA, PATRON_CLAVE_IDEMPOTENCIA_IA } from '../src/ia/catalogoOperacionesIA';
import { reiniciarCacheCertificados, verificarIdToken, type IdentidadVerificada } from '../server/titularidades/googleBackend';
import { solicitarIA } from '../src/lib/clienteIA';

const TOKENS: Record<string, IdentidadVerificada> = {
  'token-ana': { uid: 'uid-ana', email: 'ana@correo.com' },
  'token-luis': { uid: 'uid-luis', email: 'luis@correo.com' },
};

const CLAVE = 'clave-0001-aaaa';
const SECRETO_CUERPO = 'cláusula de mascotas para Ana';

function proveedorFalso(opciones: { fallos?: number; error?: unknown; uso?: Record<string, unknown> } = {}) {
  const llamadas: unknown[] = [];
  let fallosPendientes = opciones.fallos ?? 0;
  const cliente: ClienteProveedorIA = {
    models: {
      async generateContent(params: unknown) {
        llamadas.push(params);
        if (fallosPendientes > 0) {
          fallosPendientes -= 1;
          throw opciones.error ?? Object.assign(new Error('503 UNAVAILABLE: high demand'), { status: 503 });
        }
        return {
          text: '{"clausula":"texto"}',
          usageMetadata: opciones.uso ?? { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 5, totalTokenCount: 155 },
        };
      },
    },
  };
  return { cliente, llamadas };
}

const servidores: Server[] = [];
afterEach(async () => {
  await Promise.all(servidores.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
});

interface OpcionesMontaje {
  registro?: RegistroOperacionesIA | null;
  proveedor?: ClienteProveedorIA | null;
  manejador?: (req: Request, res: Response) => unknown;
  verificarToken?: (token: string) => Promise<IdentidadVerificada | null>;
}

async function montar(opciones: OpcionesMontaje = {}) {
  const memoria = crearRegistroMemoria();
  const registro = opciones.registro === undefined ? memoria : opciones.registro;
  const eventos: EventoNucleoIA[] = [];
  const nucleo = crearNucleoIA({
    verificarToken: opciones.verificarToken ?? (async (token) => TOKENS[token] ?? null),
    registro,
    crearClienteProveedor: () => opciones.proveedor ?? null,
    log: (evento) => eventos.push(evento),
  });
  const ejecuciones: unknown[] = [];
  const app = express();
  app.use(express.json());
  // Manejador con la MISMA forma que los endpoints reales de server.ts.
  app.post('/api/redactar-clausula', nucleo.operacion('REDACTAR_CLAUSULA'), async (req, res) => {
    ejecuciones.push(req.body);
    if (opciones.manejador) return opciones.manejador(req, res);
    try {
      const ai = clienteIA(res);
      if (!ai) return res.json({ motor: 'respaldo' });
      try {
        const r = await generateGeminiWithRetry(ai, { model: 'gemini-3.7-flash', contents: { parts: [{ text: req.body?.prompt }] } });
        return res.json({ motor: 'gemini', texto: r?.text });
      } catch {
        return res.json({ motor: 'respaldo' });
      }
    } catch {
      return res.status(500).json({ error: 'Error interno' });
    }
  });
  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  servidores.push(servidor);
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const llamar = (cabeceras: Record<string, string> = {}, cuerpo: unknown = { prompt: SECRETO_CUERPO }) =>
    fetch(`${base}/api/redactar-clausula`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cabeceras },
      body: JSON.stringify(cuerpo),
    });
  const autenticado = (token = 'token-ana', clave = CLAVE) => ({ Authorization: `Bearer ${token}`, 'Idempotency-Key': clave });
  return { memoria, registro, eventos, ejecuciones, llamar, autenticado, nucleo, base };
}

describe('IA Fase 1 · autenticación obligatoria (token verificado en servidor)', () => {
  it('sin token → 401 NO_AUTENTICADO: no se ejecuta el manejador, no se llama al proveedor y no se registra nada', async () => {
    const { cliente, llamadas } = proveedorFalso();
    const m = await montar({ proveedor: cliente });
    const r = await m.llamar({ 'Idempotency-Key': CLAVE });
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ codigo: 'NO_AUTENTICADO' });
    expect(m.ejecuciones).toHaveLength(0);
    expect(llamadas).toHaveLength(0);
    expect(m.memoria.listar()).toHaveLength(0);
    expect(m.eventos[0]).toMatchObject({ evento: 'RECHAZADA', codigo: 'NO_AUTENTICADO', codigoHttp: 401, operacion: 'REDACTAR_CLAUSULA' });
  });

  it('token inválido o verificador que falla → 401 (nunca se falla abierto)', async () => {
    const { cliente, llamadas } = proveedorFalso();
    const m = await montar({ proveedor: cliente });
    const invalido = await m.llamar(m.autenticado('token-falso'));
    expect(invalido.status).toBe(401);
    const m2 = await montar({ proveedor: cliente, verificarToken: async () => { throw new Error('certificados caídos'); } });
    const caido = await m2.llamar(m2.autenticado());
    expect(caido.status).toBe(401);
    expect(await caido.json()).toMatchObject({ codigo: 'NO_AUTENTICADO' });
    expect(m.ejecuciones.length + m2.ejecuciones.length).toBe(0);
    expect(llamadas).toHaveLength(0);
  });

  it('el usuario sale SIEMPRE del token: un uid en el cuerpo no suplanta a nadie', async () => {
    const { cliente } = proveedorFalso();
    const m = await montar({ proveedor: cliente });
    const r = await m.llamar(m.autenticado('token-ana'), { prompt: 'x', uid: 'uid-luis', userId: 'uid-luis', usuarioId: 'uid-luis' });
    expect(r.status).toBe(200);
    const [registro] = m.memoria.listar();
    expect(registro.uid).toBe('uid-ana');
    expect(registro.id).toBe(idOperacionIA('uid-ana', CLAVE));
  });
});

describe('IA Fase 1 · verificación REAL del ID token (RS256) dentro del núcleo', () => {
  const par = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const ajena = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publica = par.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const b64url = (x: string | Buffer) => Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const firmar = (claims: Record<string, unknown>, clave = par.privateKey) => {
    const ahora = Math.floor(Date.now() / 1000);
    const cabecera = b64url(JSON.stringify({ alg: 'RS256', kid: 'kid-ia', typ: 'JWT' }));
    const cuerpo = b64url(JSON.stringify({ aud: 'proyecto-ia', iss: 'https://securetoken.google.com/proyecto-ia', iat: ahora, exp: ahora + 3600, sub: 'uid-real', ...claims }));
    return `${cabecera}.${cuerpo}.${b64url(createSign('RSA-SHA256').update(`${cabecera}.${cuerpo}`).sign(clave))}`;
  };
  // Doble del endpoint público de certificados de Google (sin red).
  const certificados = (async () => ({ ok: true, status: 200, json: async () => ({ 'kid-ia': publica }), text: async () => '', headers: { get: () => 'max-age=3600' } })) as never;

  it('firma válida → 200 con el uid del token; firma ajena, otro proyecto, caducado o alg distinto → 401', async () => {
    reiniciarCacheCertificados();
    const m = await montar({ verificarToken: (token) => verificarIdToken(token, 'proyecto-ia', { fetchImpl: certificados }) });
    const valido = await m.llamar({ Authorization: `Bearer ${firmar({})}`, 'Idempotency-Key': 'clave-real-0001' });
    expect(valido.status).toBe(200);
    expect(m.memoria.listar()[0].uid).toBe('uid-real');
    const falsos: Array<[string, string]> = [
      ['firma de otra clave', firmar({}, ajena.privateKey)],
      ['otro proyecto', firmar({ aud: 'otro', iss: 'https://securetoken.google.com/otro' })],
      ['caducado', firmar({ exp: Math.floor(Date.now() / 1000) - 10 })],
      ['alg none', `${b64url('{"alg":"none","kid":"kid-ia"}')}.${b64url('{"sub":"uid-real","aud":"proyecto-ia"}')}.`],
    ];
    for (const [nombre, token] of falsos) {
      const r = await m.llamar({ Authorization: `Bearer ${token}`, 'Idempotency-Key': 'clave-real-0002' });
      expect(r.status, nombre).toBe(401);
    }
    expect(m.memoria.listar()).toHaveLength(1);
  });
});

describe('IA Fase 1 · idempotencia y duplicados', () => {
  it('sin Idempotency-Key o con formato inválido → 400 sin ejecutar', async () => {
    const { cliente, llamadas } = proveedorFalso();
    const m = await montar({ proveedor: cliente });
    for (const clave of [undefined, 'corta', 'con espacios no', 'x'.repeat(129), 'clave/con/barras']) {
      const cabeceras: Record<string, string> = { Authorization: 'Bearer token-ana' };
      if (clave !== undefined) cabeceras['Idempotency-Key'] = clave;
      const r = await m.llamar(cabeceras);
      expect(r.status, String(clave)).toBe(400);
      expect(await r.json()).toMatchObject({ codigo: 'IDEMPOTENCIA_REQUERIDA' });
    }
    expect(m.ejecuciones).toHaveLength(0);
    expect(llamadas).toHaveLength(0);
    expect(m.memoria.listar()).toHaveLength(0);
  });

  it('misma clave del mismo usuario → 409 OPERACION_DUPLICADA: el proveedor se llama UNA sola vez', async () => {
    const { cliente, llamadas } = proveedorFalso();
    const m = await montar({ proveedor: cliente });
    const primera = await m.llamar(m.autenticado());
    expect(primera.status).toBe(200);
    const segunda = await m.llamar(m.autenticado());
    expect(segunda.status).toBe(409);
    const cuerpo = await segunda.json();
    expect(cuerpo).toMatchObject({ codigo: 'OPERACION_DUPLICADA', operacionId: idOperacionIA('uid-ana', CLAVE), estadoPrevio: 'COMPLETADA' });
    expect(llamadas).toHaveLength(1);
    expect(m.ejecuciones).toHaveLength(1);
    expect(m.memoria.listar()).toHaveLength(1);
  });

  it('la misma clave de dos usuarios son dos operaciones independientes (aislamiento por usuario)', async () => {
    const { cliente, llamadas } = proveedorFalso();
    const m = await montar({ proveedor: cliente });
    expect((await m.llamar(m.autenticado('token-ana'))).status).toBe(200);
    expect((await m.llamar(m.autenticado('token-luis'))).status).toBe(200);
    const registros = m.memoria.listar();
    expect(registros.map((r) => r.uid).sort()).toEqual(['uid-ana', 'uid-luis']);
    expect(new Set(registros.map((r) => r.id)).size).toBe(2);
    expect(llamadas).toHaveLength(2);
  });

  it('peticiones SIMULTÁNEAS con la misma clave → exactamente una se ejecuta', async () => {
    const { cliente, llamadas } = proveedorFalso();
    const m = await montar({ proveedor: cliente });
    const respuestas = await Promise.all(Array.from({ length: 5 }, () => m.llamar(m.autenticado())));
    const estados = respuestas.map((r) => r.status).sort();
    expect(estados).toEqual([200, 409, 409, 409, 409]);
    expect(llamadas).toHaveLength(1);
    expect(m.ejecuciones).toHaveLength(1);
  });
});

describe('IA Fase 1 · registro trazable por usuario', () => {
  it('registra la operación (uid, operación, resultado, proveedor, tokens) ANTES de entregar la respuesta', async () => {
    const { cliente } = proveedorFalso();
    const m = await montar({ proveedor: cliente });
    const r = await m.llamar(m.autenticado());
    // En cuanto el cliente tiene la respuesta, el registro YA está cerrado.
    const [registro] = m.memoria.listar();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ motor: 'gemini', texto: '{"clausula":"texto"}' });
    expect(r.headers.get(CABECERA_ID_OPERACION_IA)).toBe(idOperacionIA('uid-ana', CLAVE));
    expect(registro).toMatchObject({
      version: 1,
      uid: 'uid-ana',
      operacion: 'REDACTAR_CLAUSULA',
      ruta: '/api/redactar-clausula',
      estado: 'COMPLETADA',
      codigoHttp: 200,
      origenRespuesta: 'PROVEEDOR',
      llamadasProveedor: 1,
      llamadasProveedorFallidas: 0,
      modelos: ['gemini-3.7-flash'],
      tokensEntrada: 120,
      tokensSalida: 30,
      tokensRazonamiento: 5,
      tokensTotales: 155,
    });
    expect(registro.iniciadaEn).toBeInstanceOf(Date);
    expect(registro.finalizadaEn).toBeInstanceOf(Date);
    expect(registro.duracionMs).toBeGreaterThanOrEqual(0);
    expect(registro.errorProveedor).toBeUndefined();
  });

  it('la respuesta ESPERA al cierre del registro aunque el registro sea lento', async () => {
    const memoria = crearRegistroMemoria();
    let cierreTerminado = false;
    const registroLento: RegistroOperacionesIA = {
      tipo: 'FIRESTORE',
      reservar: (apertura) => memoria.reservar(apertura),
      completar: async (id, cierre) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        await memoria.completar(id, cierre);
        cierreTerminado = true;
      },
    };
    const { cliente } = proveedorFalso();
    const m = await montar({ registro: registroLento, proveedor: cliente });
    const r = await m.llamar(m.autenticado());
    expect(cierreTerminado).toBe(true);
    expect(memoria.listar()[0].estado).toBe('COMPLETADA');
    expect(await r.json()).toMatchObject({ motor: 'gemini' });
  });

  it('el registro sólo guarda metadatos de la lista blanca: ni prompt, ni cuerpo, ni email, ni token', async () => {
    const { cliente } = proveedorFalso();
    const m = await montar({ proveedor: cliente });
    await m.llamar(m.autenticado());
    const [registro] = m.memoria.listar();
    for (const campo of Object.keys(registro)) expect(CAMPOS_REGISTRO_IA).toContain(campo);
    const serializado = JSON.stringify(registro);
    for (const prohibido of [SECRETO_CUERPO, 'mascotas', 'ana@correo.com', 'token-ana', CLAVE]) {
      expect(serializado).not.toContain(prohibido);
    }
  });

  it('sin clave del proveedor → respuesta de respaldo registrada como RESPALDO sin llamadas', async () => {
    const m = await montar({ proveedor: null });
    const r = await m.llamar(m.autenticado());
    expect(await r.json()).toEqual({ motor: 'respaldo' });
    expect(m.memoria.listar()[0]).toMatchObject({ estado: 'COMPLETADA', origenRespuesta: 'RESPALDO', llamadasProveedor: 0, tokensTotales: 0 });
  });

  it('error del proveedor con respaldo → COMPLETADA/RESPALDO con la llamada fallida y un código normalizado', async () => {
    const { cliente, llamadas } = proveedorFalso({ fallos: 5, error: Object.assign(new Error('Prompt con datos privados: Ana'), { status: 500 }) });
    const m = await montar({ proveedor: cliente });
    const r = await m.llamar(m.autenticado());
    expect(await r.json()).toEqual({ motor: 'respaldo' });
    expect(llamadas).toHaveLength(1); // 500 no es transitorio: sin reintento
    const [registro] = m.memoria.listar();
    expect(registro).toMatchObject({ estado: 'COMPLETADA', origenRespuesta: 'RESPALDO', llamadasProveedor: 1, llamadasProveedorFallidas: 1, errorProveedor: 'HTTP_500' });
    expect(JSON.stringify(registro)).not.toContain('datos privados');
  });

  it('reintento ante error transitorio: cada intento cuenta como llamada al proveedor', async () => {
    const { cliente, llamadas } = proveedorFalso({ fallos: 1 });
    const m = await montar({ proveedor: cliente });
    const r = await m.llamar(m.autenticado());
    expect(await r.json()).toMatchObject({ motor: 'gemini' });
    expect(llamadas).toHaveLength(2);
    expect(m.memoria.listar()[0]).toMatchObject({ origenRespuesta: 'PROVEEDOR', llamadasProveedor: 2, llamadasProveedorFallidas: 1, errorProveedor: 'HTTP_503', tokensTotales: 155 });
  });

  it('respuesta de error del manejador → FALLIDA con su código HTTP', async () => {
    const m = await montar({ manejador: (_req, res) => res.status(500).json({ error: 'Error interno' }) });
    const r = await m.llamar(m.autenticado());
    expect(r.status).toBe(500);
    expect(m.memoria.listar()[0]).toMatchObject({ estado: 'FALLIDA', codigoHttp: 500, origenRespuesta: 'ERROR' });
    const m2 = await montar({ manejador: (_req, res) => res.status(400).json({ error: 'Petición inválida' }) });
    await m2.llamar(m2.autenticado());
    expect(m2.memoria.listar()[0]).toMatchObject({ estado: 'FALLIDA', codigoHttp: 400 });
  });

  it('si la RESERVA en el registro falla → 503 REGISTRO_NO_DISPONIBLE y no se ejecuta ni se llama al proveedor', async () => {
    const { cliente, llamadas } = proveedorFalso();
    const registroCaido: RegistroOperacionesIA = {
      tipo: 'FIRESTORE',
      reservar: async () => { throw new Error('Firestore no disponible'); },
      completar: async () => undefined,
    };
    const m = await montar({ registro: registroCaido, proveedor: cliente });
    const r = await m.llamar(m.autenticado());
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ codigo: 'REGISTRO_NO_DISPONIBLE' });
    expect(m.ejecuciones).toHaveLength(0);
    expect(llamadas).toHaveLength(0);
  });

  it('si el CIERRE falla, la respuesta se entrega igualmente y el fallo queda en el log', async () => {
    const memoria = crearRegistroMemoria();
    const registroCierreCaido: RegistroOperacionesIA = {
      tipo: 'FIRESTORE',
      reservar: (apertura) => memoria.reservar(apertura),
      completar: async () => { throw new Error('timeout'); },
    };
    const { cliente } = proveedorFalso();
    const m = await montar({ registro: registroCierreCaido, proveedor: cliente });
    const r = await m.llamar(m.autenticado());
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ motor: 'gemini' });
    expect(memoria.listar()[0].estado).toBe('EN_CURSO');
    expect(m.eventos).toContainEqual(expect.objectContaining({ evento: 'CIERRE_NO_REGISTRADO', uid: 'uid-ana', codigoHttp: 200 }));
  });
});

describe('IA Fase 1 · dependencias inyectadas sin registro (no configuración real de producción)', () => {
  it('exige sesión igualmente, pero NUNCA llama al proveedor: responde el respaldo y lo indica en cabecera', async () => {
    const { cliente, llamadas } = proveedorFalso();
    const m = await montar({ registro: null, proveedor: cliente });
    expect((await m.llamar({ 'Idempotency-Key': CLAVE })).status).toBe(401);
    const r = await m.llamar(m.autenticado());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ motor: 'respaldo' });
    expect(r.headers.get(CABECERA_REGISTRO_IA)).toBe('no-configurado');
    expect(llamadas).toHaveLength(0);
    expect(m.eventos).toContainEqual(expect.objectContaining({ evento: 'SIN_REGISTRO', uid: 'uid-ana' }));
    expect(m.nucleo.estado()).toEqual({ registro: 'NO_CONFIGURADO', gobierno: 'NO_CONFIGURADO', autenticacion: 'TOKEN_FIREBASE', operaciones: OPERACIONES_IA.length });
  });
});

describe('IA Fase 1 · contrato cliente ↔ servidor', () => {
  it('una petición construida por solicitarIA (src/lib/clienteIA.ts) es aceptada y registrada por el núcleo', async () => {
    const { cliente, llamadas } = proveedorFalso();
    const m = await montar({ proveedor: cliente });
    const fetchServidor = ((url: RequestInfo | URL, init?: RequestInit) => fetch(`${m.base}${String(url)}`, init)) as typeof fetch;
    const r1 = await solicitarIA('/api/redactar-clausula', { prompt: 'x' }, { fetchImpl: fetchServidor, obtenerToken: async () => 'token-ana' });
    const r2 = await solicitarIA('/api/redactar-clausula', { prompt: 'x' }, { fetchImpl: fetchServidor, obtenerToken: async () => 'token-ana' });
    expect([r1.status, r2.status]).toEqual([200, 200]); // claves distintas → dos operaciones legítimas
    expect(llamadas).toHaveLength(2);
    expect(m.memoria.listar().map((r) => r.uid)).toEqual(['uid-ana', 'uid-ana']);
    const sinSesion = await solicitarIA('/api/redactar-clausula', { prompt: 'x' }, { fetchImpl: fetchServidor, obtenerToken: async () => null });
    expect(sinSesion.status).toBe(401);
  });
});

describe('IA Fase 1 · contratos del núcleo', () => {
  it('clienteIA fuera del núcleo lanza (fallo cerrado: no hay IA sin autenticación ni registro)', () => {
    expect(() => clienteIA({ locals: {} } as unknown as Response)).toThrow(/fuera del núcleo/);
  });

  it('operacion() con un id fuera del catálogo lanza al montar', () => {
    const nucleo = crearNucleoIA({ verificarToken: async () => null, registro: null, crearClienteProveedor: () => null });
    expect(() => nucleo.operacion('NO_EXISTE' as never)).toThrow(/desconocida/);
    expect(nucleo.estado().operaciones).toBe(11);
  });

  it('id de operación: determinista, aislado por usuario y no enumerable', () => {
    const a = idOperacionIA('uid-ana', CLAVE);
    expect(a).toBe(idOperacionIA('uid-ana', CLAVE));
    expect(a).not.toBe(idOperacionIA('uid-luis', CLAVE));
    expect(a).not.toBe(idOperacionIA('uid-ana', `${CLAVE}x`));
    expect(a).toMatch(/^iaop_[0-9a-f]{40}$/);
    expect(a).not.toContain('uid-ana');
  });

  it('código de error del proveedor normalizado (nunca el mensaje crudo)', () => {
    expect(codigoErrorProveedor({ status: 429 })).toBe('HTTP_429');
    expect(codigoErrorProveedor(new Error('got status: RESOURCE_EXHAUSTED quota'))).toBe('RESOURCE_EXHAUSTED');
    expect(codigoErrorProveedor(new Error('[GoogleGenerativeAI Error]: 400 Bad Request'))).toBe('HTTP_400');
    expect(codigoErrorProveedor(new Error('texto libre con datos de Ana'))).toBe('ERROR_PROVEEDOR');
    expect(codigoErrorProveedor(undefined)).toBe('ERROR_PROVEEDOR');
  });

  it('el patrón de clave admite UUID v4 y rechaza formas peligrosas', () => {
    expect(PATRON_CLAVE_IDEMPOTENCIA_IA.test('3f0b6b8e-9d8c-4f7e-a0a1-2b3c4d5e6f70')).toBe(true);
    expect(PATRON_CLAVE_IDEMPOTENCIA_IA.test('a'.repeat(32))).toBe(true);
    for (const mala of ['', 'corta', 'a b c d e f g h', '../../etc/passwd', 'x'.repeat(129), 'ñññññññññ']) {
      expect(PATRON_CLAVE_IDEMPOTENCIA_IA.test(mala), mala).toBe(false);
    }
  });
});
