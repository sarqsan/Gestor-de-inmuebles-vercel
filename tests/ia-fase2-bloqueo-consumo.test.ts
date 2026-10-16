/**
 * IA FASE 2 — BLOQUEO PREVENTIVO DE CONSUMO (aprobación comercial)
 * =========================================================================
 * HTTP real contra Express con dependencias inyectadas (gobierno en memoria,
 * registro en memoria y proveedor FALSO que cuenta sus llamadas): sin red,
 * sin Firebase real y sin Gemini real.
 *
 * Invariante central: mientras la política esté PENDIENTE de aprobación
 * comercial (origen POR_DEFECTO —sin IA_POLITICA_JSON— o sin ninguna tarifa
 * definida), TODA operación de IA se rechaza con 503 APROBACION_COMERCIAL_
 * PENDIENTE antes de autenticar, reservar o crear el cliente del proveedor.
 * Ni coste 0, ni saldo, ni cuotas indefinidas, ni la propia clave de Gemini
 * activan el consumo. Las rutas de administración siguen operativas sin
 * provocar llamadas al proveedor.
 */
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { crearNucleoIA, clienteIA, type ClienteProveedorIA, type EventoNucleoIA } from '../server/ia/nucleoIA';
import { crearGobiernoMemoria, type GobiernoMemoriaIA } from '../server/ia/gobiernoIA';
import { crearRegistroMemoria } from '../server/ia/registroOperacionesIA';
import { montarRutasAdminIA, type EventoAdminIA } from '../server/ia/adminIA';
import {
  construirPoliticaIACompleta,
  OPERACIONES_IA_IDS,
  politicaGobiernoIADesdeEntorno,
  validarPoliticaGobiernoIA,
  type PoliticaGobiernoIA,
  type SobrescriturasPoliticaIA,
} from '../src/ia/gobiernoIAContrato';
import { CABECERA_IDEMPOTENCIA_IA } from '../src/ia/catalogoOperacionesIA';
import type { IdentidadVerificada } from '../server/titularidades/googleBackend';

const TOKENS: Record<string, IdentidadVerificada> = {
  'token-ana': { uid: 'uid-ana' },
  'token-admin': { uid: 'uid-admin' },
};

function proveedorFalso(opciones: { fallos?: number } = {}) {
  const llamadas: unknown[] = [];
  let fallosPendientes = opciones.fallos ?? 0;
  const cliente: ClienteProveedorIA = {
    models: {
      async generateContent(params: unknown) {
        llamadas.push(params);
        if (fallosPendientes > 0) {
          fallosPendientes -= 1;
          throw Object.assign(new Error('503 UNAVAILABLE'), { status: 503 });
        }
        return { text: '{"ok":true}', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 } };
      },
    },
  };
  return { cliente, llamadas };
}

const servidores: Server[] = [];
afterEach(async () => {
  await Promise.all(servidores.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

interface OpcionesMontaje {
  politica?: unknown;
  conCliente?: boolean;
  errorGobierno?: 'POLITICA_IA_INVALIDA';
}

/** FASE 7 · política COMPLETA y explícita para las pruebas del mecanismo: los CUATRO
 * perfiles declarados (sin comodines) y la tarifa de las 12 operaciones. Las
 * sobrescrituras de un perfil sustituyen su ámbito; las de coste/cuota se fusionan. */
function politicaPermisiva(parcial: SobrescriturasPoliticaIA = {}): PoliticaGobiernoIA {
  return construirPoliticaIACompleta({
    ...parcial,
    // La operación que ejercen estas suites se declara a 0 créditos salvo que la
    // prueba fije otra tarifa: siguen probando permisos, cuotas y saldo, no precios.
    costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 0, ...(parcial.costeCreditosPorOperacion ?? {}) },
    permisos: {
      PROPIETARIO: OPERACIONES_IA_IDS,
      PROFESIONAL: OPERACIONES_IA_IDS,
      INQUILINO: OPERACIONES_IA_IDS,
      ADMINISTRADOR: OPERACIONES_IA_IDS,
      ...(parcial.permisos ?? {}),
    },
  });
}

/** Monta núcleo + rutas admin sobre el mismo gobierno. `conCliente` simula GEMINI_API_KEY presente. */
async function montar(opciones: OpcionesMontaje = {}) {
  const resultado = opciones.politica === undefined
    ? politicaGobiernoIADesdeEntorno({}) // POR_DEFECTO: exactamente lo que tendrá producción sin IA_POLITICA_JSON
    : validarPoliticaGobiernoIA(politicaPermisiva(opciones.politica as SobrescriturasPoliticaIA));
  if (resultado.estado !== 'VALIDA') throw new Error('política de prueba inválida');
  const registro = crearRegistroMemoria();
  const gobierno: GobiernoMemoriaIA = crearGobiernoMemoria(resultado.politica, { listarOperaciones: () => registro.listar() });
  gobierno.fijarPerfil('uid-ana', { usuarioId: 'usr-ana', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' }, { authUid: 'uid-ana', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' });
  gobierno.fijarPerfil('uid-admin', { usuarioId: 'usr-admin', tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO' }, { authUid: 'uid-admin', tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO' });
  const { cliente, llamadas } = proveedorFalso();
  const eventos: EventoNucleoIA[] = [];
  const eventosAdmin: EventoAdminIA[] = [];
  const nucleo = crearNucleoIA({
    verificarToken: async (token) => TOKENS[token] ?? null,
    registro,
    gobierno,
    ...(opciones.errorGobierno ? { errorGobierno: opciones.errorGobierno } : {}),
    crearClienteProveedor: () => (opciones.conCliente === false ? null : cliente),
    log: (evento) => eventos.push(evento),
  });
  const ejecuciones: unknown[] = [];
  const app = express();
  app.use(express.json());
  app.post('/api/redactar-clausula', nucleo.operacion('REDACTAR_CLAUSULA'), async (req, res) => {
    ejecuciones.push(req.body);
    const ai = clienteIA(res);
    if (!ai) return res.json({ motor: 'respaldo' });
    const r = await ai.models.generateContent({ model: 'm', contents: { parts: [{ text: 'x' }] } });
    return res.json({ motor: 'gemini', texto: r?.text });
  });
  montarRutasAdminIA(app, {
    verificarToken: async (token) => TOKENS[token] ?? null,
    gobierno,
    politica: resultado.politica,
    ahora: () => new Date('2026-10-15T12:00:00.000Z'),
    log: (evento) => eventosAdmin.push(evento),
  });
  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  servidores.push(servidor);
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const pedir = (ruta: string, cabeceras: Record<string, string> = {}, cuerpo?: unknown, metodo?: string) =>
    fetch(`${base}${ruta}`, {
      method: metodo ?? (cuerpo === undefined ? 'GET' : 'POST'),
      headers: { 'Content-Type': 'application/json', ...cabeceras },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
  const autenticado = (token = 'token-ana', clave = 'clave-bloq-0001') => ({
    Authorization: `Bearer ${token}`,
    [CABECERA_IDEMPOTENCIA_IA]: clave,
  });
  return { nucleo, gobierno, registro, llamadas, eventos, eventosAdmin, ejecuciones, pedir, autenticado, politica: resultado.politica };
}

describe('IA Fase 2 · bloqueo preventivo con aprobación comercial pendiente', () => {
  it('sin IA_POLITICA_JSON: 503 APROBACION_COMERCIAL_PENDIENTE, cero llamadas al proveedor y nada registrado', async () => {
    const m = await montar(); // política POR_DEFECTO, como producción sin la variable
    const r = await m.pedir('/api/redactar-clausula', m.autenticado(), { prompt: 'x' });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ codigo: 'APROBACION_COMERCIAL_PENDIENTE' });
    expect(m.llamadas).toHaveLength(0); // el proveedor JAMÁS se invoca
    expect(m.ejecuciones).toHaveLength(0); // el manejador no se ejecuta
    expect(m.registro.listar()).toHaveLength(0); // ni se abre operación
  });

  it('el bloqueo precede a todo: sin token y sin Idempotency-Key también es 503 (no 401 ni 400)', async () => {
    const m = await montar();
    const sinToken = await m.pedir('/api/redactar-clausula', {}, { prompt: 'x' });
    expect(sinToken.status).toBe(503);
    expect(await sinToken.json()).toMatchObject({ codigo: 'APROBACION_COMERCIAL_PENDIENTE' });
    const sinClave = await m.pedir('/api/redactar-clausula', { Authorization: 'Bearer token-ana' }, { prompt: 'x' });
    expect(sinClave.status).toBe(503);
    expect(m.llamadas).toHaveLength(0);
    expect(m.eventos[0]).toMatchObject({ evento: 'RECHAZADA', codigo: 'APROBACION_COMERCIAL_PENDIENTE', codigoHttp: 503 });
  });

  it('FASE 7 · tarifas vacías o cuotas ilimitadas ⇒ política INVÁLIDA: 503 POLITICA_IA_INVALIDA', async () => {
    // Ya no existe el «coste 0 implícito» ni la cuota «sin límite»: una política
    // que no declara las 12 tarifas y las dos cuotas finitas es una configuración
    // incompleta, y el servidor la trata como fallo cerrado.
    expect(validarPoliticaGobiernoIA({ costeCreditosPorOperacion: {}, cuotas: { operacionesPorDia: null, operacionesPorMes: null } }).estado).toBe('INVALIDA');
    expect(validarPoliticaGobiernoIA({ cuotas: { operacionesPorDia: null } }).estado).toBe('INVALIDA');
    expect(validarPoliticaGobiernoIA({ costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 1 } }).estado).toBe('INVALIDA');
    const m = await montar({ errorGobierno: 'POLITICA_IA_INVALIDA', politica: { costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 1 } } });
    const r = await m.pedir('/api/redactar-clausula', m.autenticado(), { prompt: 'x' });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ codigo: 'POLITICA_IA_INVALIDA' });
    expect(m.llamadas).toHaveLength(0);
    expect(m.registro.listar()).toHaveLength(0);
  });

  it('peticiones manipuladas no desactivan el bloqueo: uid ajeno en el body, rol ADMINISTRADOR o cabeceras extra siguen en 503', async () => {
    const m = await montar();
    const intentos = [
      { ...m.autenticado('token-admin', 'clave-bloq-adm1') }, // token de administrador
      m.autenticado('token-ana', 'clave-bloq-0002'), // normal
    ];
    for (const cabeceras of intentos) {
      const r = await m.pedir('/api/redactar-clausula', cabeceras, {
        prompt: 'x',
        uid: 'uid-otro', // identificador suplantado en el cuerpo
        usuarioId: 'uid-otro',
        pendienteAprobacionComercial: false, // intento de "desactivar" por parámetro
      });
      expect(r.status).toBe(503);
      expect(await r.json()).toMatchObject({ codigo: 'APROBACION_COMERCIAL_PENDIENTE' });
    }
    expect(m.llamadas).toHaveLength(0);
    expect(m.ejecuciones).toHaveLength(0);
  });

  it('la clave de Gemini presente NO activa el consumo: con cliente disponible, el bloqueo sigue y no hay llamadas', async () => {
    const m = await montar({ conCliente: true }); // como si GEMINI_API_KEY estuviera configurada
    const r = await m.pedir('/api/redactar-clausula', m.autenticado(), { prompt: 'x' });
    expect(r.status).toBe(503);
    expect(m.llamadas).toHaveLength(0);
  });

  it('política inválida: cierre seguro con 503 POLITICA_IA_INVALIDA (nunca un respaldo permisivo)', async () => {
    const m = await montar({ errorGobierno: 'POLITICA_IA_INVALIDA', politica: {} });
    const r = await m.pedir('/api/redactar-clausula', m.autenticado(), { prompt: 'x' });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ codigo: 'POLITICA_IA_INVALIDA' });
    expect(m.llamadas).toHaveLength(0);
  });

  it('el ÚNICO camino de activación es la política aprobada: con tarifa definida la operación ejecuta y llama al proveedor', async () => {
    const m = await montar({ politica: { costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 1 } } });
    await m.gobierno.ajustarCredito({ uid: 'uid-ana', adminUid: 'uid-admin', claveIdempotencia: 'carga-inicial', creditos: 5, motivo: 'prueba', ahora: new Date() });
    const r = await m.pedir('/api/redactar-clausula', m.autenticado(), { prompt: 'x' });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ motor: 'gemini' });
    expect(m.llamadas).toHaveLength(1);
    const cuenta = await m.gobierno.cuenta('uid-ana');
    expect(cuenta?.saldoCreditos).toBe(4); // consume exactamente el coste definido
  });

  it('durante el bloqueo la administración consulta y gestiona SIN provocar llamadas al proveedor', async () => {
    const m = await montar(); // bloqueada, política POR_DEFECTO
    const admin = { Authorization: 'Bearer token-admin', [CABECERA_IDEMPOTENCIA_IA]: 'clave-admin-bq-1' };
    const resumen = await m.pedir('/api/ia/admin/resumen', { Authorization: 'Bearer token-admin' });
    expect(resumen.status).toBe(200);
    const cuerpo = await resumen.json();
    expect(cuerpo.politica.pendienteAprobacionComercial).toBe(true); // el panel ve el estado real
    const cuenta = await m.pedir('/api/ia/admin/cuenta/uid-ana', { Authorization: 'Bearer token-admin' });
    expect(cuenta.status).toBe(200);
    const bloqueo = await m.pedir('/api/ia/admin/cuenta/uid-ana/bloqueo', admin, { bloqueado: true, motivo: 'auditoría' });
    expect(bloqueo.status).toBe(200);
    const credito = await m.pedir('/api/ia/admin/cuenta/uid-ana/credito', { ...admin, [CABECERA_IDEMPOTENCIA_IA]: 'clave-admin-cr-1' }, { creditos: 5, motivo: 'prueba' });
    expect(credito.status).toBe(200);
    expect(m.llamadas).toHaveLength(0); // ninguna acción administrativa consume proveedor
    expect(m.eventosAdmin.some((e) => e.evento === 'ADMIN_ACCION')).toBe(true);
  });

  it('estado() refleja el control efectivo: bloqueoComercial con aprobación pendiente; sin el campo con política aprobada', async () => {
    const bloqueada = await montar();
    expect(bloqueada.nucleo.estado()).toMatchObject({ gobierno: 'MEMORIA', bloqueoComercial: 'APROBACION_PENDIENTE' });
    const aprobada = await montar({ politica: { costeCreditosPorOperacion: { ESTIMAR_PRICING: 1 } } });
    expect(aprobada.nucleo.estado().bloqueoComercial).toBeUndefined();
    expect(aprobada.nucleo.estado()).toMatchObject({ gobierno: 'MEMORIA' });
  });
});
