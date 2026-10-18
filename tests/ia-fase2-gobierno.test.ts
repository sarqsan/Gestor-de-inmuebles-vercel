/**
 * IA · FASE 2 — GOBIERNO DE USO EN EL NÚCLEO (permisos, cuotas, saldo, reembolso)
 * =================================================================================
 * Peticiones HTTP REALES contra una app Express en un puerto efímero, con
 * dependencias inyectadas (verificador de token, registro en memoria, gobierno
 * en memoria y proveedor falso): sin red externa, sin Firebase y SIN consumo
 * real del proveedor (el cliente del proveedor es un doble de prueba).
 *
 * Cubre:
 *  · perfil veraz: espejo ausente, inactivo, incoherente con la ficha;
 *  · permisos por rol y operación (política restrictiva);
 *  · saldo y costes: consumo, saldo insuficiente y saldo inicial 0;
 *  · cuotas diarias y mensuales por ventanas UTC;
 *  · bloqueo de cuenta por administrador;
 *  · TODOS los rechazos ocurren ANTES de llamar al proveedor;
 *  · idempotencia: la misma clave no descuenta dos veces;
 *  · concurrencia: saldo para 3 de 5 peticiones simultáneas ⇒ 3 y sólo 3;
 *  · reembolso cuando el proveedor no responde con éxito;
 *  · el registro cierra con costeCreditos/creditosReembolsados y sin datos
 *    personales (lista blanca);
 *  · sin gobierno, el comportamiento de Fase 1 queda intacto.
 */
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type Request, type Response } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { clienteIA, crearNucleoIA, generateGeminiWithRetry, type ClienteProveedorIA, type EventoNucleoIA } from '../server/ia/nucleoIA';
import { CAMPOS_REGISTRO_IA, crearRegistroMemoria, type RegistroOperacionesIAMemoria } from '../server/ia/registroOperacionesIA';
import { crearGobiernoMemoria, type GobiernoMemoriaIA } from '../server/ia/gobiernoIA';
import type { ResultadoResolverTitularNucleoIA } from '../server/ia/nucleoIA';
import type { ServicioLlavesIA } from '../server/ia/llavesUsuarioIA';
import { OPERACIONES_IA, type IdOperacionIA } from '../src/ia/catalogoOperacionesIA';
import {
  construirPoliticaIACompleta,
  OPERACIONES_IA_IDS,
  validarPoliticaGobiernoIA,
  type PoliticaGobiernoIA,
  type SobrescriturasPoliticaIA,
} from '../src/ia/gobiernoIAContrato';
import type { IdentidadVerificada } from '../server/titularidades/googleBackend';

const TOKENS: Record<string, IdentidadVerificada> = {
  'token-ana': { uid: 'uid-ana' },
  'token-luis': { uid: 'uid-luis' },
  'token-admin': { uid: 'uid-admin' },
};

const CLAVE = 'clave-0001-aaaa';

function proveedorFalso(opciones: { fallos?: number } = {}) {
  const llamadas: unknown[] = [];
  let fallosPendientes = opciones.fallos ?? 0;
  const cliente: ClienteProveedorIA = {
    models: {
      async generateContent(params: unknown) {
        llamadas.push(params);
        if (fallosPendientes > 0) {
          fallosPendientes -= 1;
          throw Object.assign(new Error('503 UNAVAILABLE: high demand'), { status: 503 });
        }
        return { text: '{"ok":true}', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 } };
      },
    },
  };
  return { cliente, llamadas };
}

interface OpcionesMontaje {
  politica?: unknown;
  gobierno?: GobiernoMemoriaIA | null;
  registro?: RegistroOperacionesIAMemoria;
  proveedor?: ClienteProveedorIA | null;
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

function politica(opciones: unknown): ReturnType<typeof validarPoliticaGobiernoIA> {
  return validarPoliticaGobiernoIA(politicaPermisiva((opciones ?? {}) as SobrescriturasPoliticaIA));
}

const servidores: Server[] = [];
afterEach(async () => {
  await Promise.all(servidores.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
});

function perfilFijo(gobierno: GobiernoMemoriaIA, uid: string, tipoPerfil: string, estado = 'ACTIVO', fichaExtra: Record<string, unknown> = {}) {
  gobierno.fijarPerfil(uid, { usuarioId: `usr-${uid}`, tipoPerfil, estado }, { authUid: uid, tipoPerfil, estado, ...fichaExtra });
}

async function montar(opciones: OpcionesMontaje = {}) {
  // FASE 7 · operar exige política DECLARADA (ENTORNO) y COMPLETA. El fixture por
  // defecto declara las 12 tarifas con la tabla de referencia y fija
  // REDACTAR_CLAUSULA —la operación que estos tests ejercen— en 0 créditos para
  // que los saldos de prueba no cambien. Los escenarios con aprobación PENDIENTE
  // (bloqueo 503) se cubren en ia-fase2-bloqueo-consumo.test.ts.
  const resultadoPolitica = politica(opciones.politica ?? { costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 0, ESTIMAR_PRICING: 1 } });
  if (resultadoPolitica.estado !== 'VALIDA') throw new Error('política de prueba inválida');
  const registro = opciones.registro ?? crearRegistroMemoria();
  const gobierno = opciones.gobierno === undefined
    ? crearGobiernoMemoria(resultadoPolitica.politica, { listarOperaciones: () => registro.listar() })
    : opciones.gobierno;
  const { cliente, llamadas } = opciones.proveedor === undefined ? proveedorFalso() : { cliente: opciones.proveedor, llamadas: [] as unknown[] };
  if (gobierno) {
    for (const uid of ['uid-ana', 'uid-luis', 'uid-admin']) perfilFijo(gobierno, `owner-${uid}`, 'PROPIETARIO');
  }
  const llaves = {
    resolverParaOperacion: async (uid: string) => ({ estado: 'DISPONIBLE' as const, valor: `mock-key-${uid}`, sufijo: 'MOCK' }),
  } as unknown as ServicioLlavesIA;
  const resolverTitularIA = async ({ uidActor }: { uidActor: string }): Promise<ResultadoResolverTitularNucleoIA> => ({
    estado: 'RESUELTO',
    contexto: {
      propietarioUid: `owner-${uidActor}`,
      propietarioId: `prop-${uidActor}`,
      contratoId: `contract-${uidActor}`,
      inmuebleId: `asset-${uidActor}`,
    },
  });
  const eventos: EventoNucleoIA[] = [];
  const nucleo = crearNucleoIA({
    verificarToken: async (token) => TOKENS[token] ?? null,
    registro,
    gobierno,
    llaves,
    resolverTitularIA,
    crearClienteProveedor: () => cliente,
    log: (evento) => eventos.push(evento),
  });
  const ejecuciones: unknown[] = [];
  const app = express();
  app.use(express.json());
  app.post('/api/redactar-clausula', nucleo.operacion('REDACTAR_CLAUSULA'), async (req, res) => {
    ejecuciones.push(req.body);
    try {
      const ai = clienteIA(res);
      if (!ai) return res.json({ motor: 'respaldo' });
      try {
        const r = await generateGeminiWithRetry(ai, { model: 'gemini-3.7-flash', contents: { parts: [{ text: 'x' }] } });
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
  const llamar = (cabeceras: Record<string, string> = {}, cuerpo: unknown = { prompt: 'x' }) =>
    fetch(`${base}/api/redactar-clausula`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cabeceras },
      body: JSON.stringify(cuerpo),
    });
  const autenticado = (token = 'token-ana', clave = CLAVE) => ({ Authorization: `Bearer ${token}`, 'Idempotency-Key': clave });
  return { registro, gobierno, eventos, ejecuciones, llamadas, llamar, autenticado, nucleo };
}

describe('IA Fase 2 · perfil veraz (fuente de identidad autorizada)', () => {
  it('uid sin espejo → 403 PERFIL_NO_ENCONTRADO, sin ejecutar ni llamar al proveedor', async () => {
    const m = await montar();
    const r = await m.llamar(m.autenticado('token-luis'));
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'PERFIL_NO_ENCONTRADO' });
    expect(m.llamadas).toHaveLength(0);
    expect(m.ejecuciones).toHaveLength(0);
    expect(m.registro.listar()).toHaveLength(0);
    expect(m.eventos[0]).toMatchObject({ evento: 'RECHAZADA', codigo: 'PERFIL_NO_ENCONTRADO', codigoHttp: 403 });
  });

  it('espejo BLOQUEADO → 403 USUARIO_NO_ACTIVO', async () => {
    const m = await montar();
    perfilFijo(m.gobierno, 'uid-luis', 'PROPIETARIO', 'BLOQUEADO');
    const r = await m.llamar(m.autenticado('token-luis'));
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'USUARIO_NO_ACTIVO' });
    expect(m.llamadas).toHaveLength(0);
  });

  it('espejo incoherente con la ficha (authUid distinto) → 403 PERFIL_INCOHERENTE', async () => {
    const m = await montar();
    m.gobierno.fijarPerfil('uid-luis', { usuarioId: 'usr-luis', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' }, { authUid: 'OTRO', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' });
    const r = await m.llamar(m.autenticado('token-luis'));
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'PERFIL_INCOHERENTE' });
    expect(m.llamadas).toHaveLength(0);
  });

  it('espejo sin ficha → 403 PERFIL_INCOHERENTE', async () => {
    const m = await montar();
    m.gobierno.fijarPerfil('uid-luis', { usuarioId: 'usr-luis', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' }, null);
    const r = await m.llamar(m.autenticado('token-luis'));
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'PERFIL_INCOHERENTE' });
  });

  it('perfil veraz activo → 200 y el uid del registro es el del token', async () => {
    const m = await montar();
    perfilFijo(m.gobierno, 'uid-ana', 'PROPIETARIO');
    const r = await m.llamar(m.autenticado());
    expect(r.status).toBe(200);
    expect(m.registro.listar()[0].uid).toBe('uid-ana');
  });
});

describe('IA Fase 2 · permisos por rol y operación', () => {
  it('perfil sin permiso para la operación → 403 OPERACION_NO_PERMITIDA antes del proveedor', async () => {
    const m = await montar({ politica: { permisos: { INQUILINO: ['ANALIZAR_INCIDENCIA'] }, costeCreditosPorOperacion: { ESTIMAR_PRICING: 1 } } });
    perfilFijo(m.gobierno, 'uid-ana', 'INQUILINO');
    const r = await m.llamar(m.autenticado());
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'OPERACION_NO_PERMITIDA' });
    expect(m.llamadas).toHaveLength(0);
    expect(m.ejecuciones).toHaveLength(0);
    expect(m.registro.listar()).toHaveLength(0);
  });

  it('perfil con permiso explícito → 200; el ámbito vacío del perfil → 403 (Fase 7: deny-by-default)', async () => {
    const m = await montar({ politica: { permisos: { PROPIETARIO: ['REDACTAR_CLAUSULA'] }, costeCreditosPorOperacion: { ESTIMAR_PRICING: 1 } } });
    perfilFijo(m.gobierno, 'uid-ana', 'PROPIETARIO');
    expect((await m.llamar(m.autenticado())).status).toBe(200);
    const m2 = await montar();
    perfilFijo(m2.gobierno, 'uid-ana', 'PROPIETARIO');
    expect((await m2.llamar(m2.autenticado())).status).toBe(200);
    // Sin la operación en el ámbito del perfil (ámbito vacío), el núcleo corta en 403.
    const m3 = await montar({ politica: { permisos: { PROPIETARIO: [] } } });
    perfilFijo(m3.gobierno, 'uid-ana', 'PROPIETARIO');
    const r = await m3.llamar(m3.autenticado());
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'OPERACION_NO_PERMITIDA' });
    expect(m3.llamadas).toHaveLength(0);
  });

  it('el catálogo completo sigue montado y el estado del núcleo informa del gobierno', async () => {
    const m = await montar();
    expect(OPERACIONES_IA.length).toBe(12);
    expect(m.nucleo.estado()).toMatchObject({ registro: 'MEMORIA', gobierno: 'MEMORIA', operaciones: 12 });
  });
});

describe('IA Fase 2 · saldo, costes y consumo coherente', () => {
  it('coste > saldo → 402 SALDO_INSUFICIENTE antes del proveedor; el registro queda cerrado como FALLIDA', async () => {
    const m = await montar({ politica: { costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } } });
    perfilFijo(m.gobierno, 'uid-ana', 'PROPIETARIO');
    const r = await m.llamar(m.autenticado());
    expect(r.status).toBe(402);
    expect(await r.json()).toMatchObject({ codigo: 'SALDO_INSUFICIENTE' });
    expect(m.llamadas).toHaveLength(0);
    expect(m.ejecuciones).toHaveLength(0);
    const [registro] = m.registro.listar();
    expect(registro.estado).toBe('FALLIDA');
    expect(registro.codigoHttp).toBe(402);
    expect(registro.costeCreditos).toBe(0);
  });

  it('con saldo suficiente se descuenta el coste y el cierre lo registra', async () => {
    const m = await montar({ politica: { costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } } });
    perfilFijo(m.gobierno, 'uid-ana', 'PROPIETARIO');
    await m.gobierno.ajustarCredito({ uid: 'owner-uid-ana', adminUid: 'uid-admin', claveIdempotencia: 'clave-admin-1', creditos: 5, motivo: 'prueba', ahora: new Date() });
    const r = await m.llamar(m.autenticado());
    expect(r.status).toBe(200);
    const cuenta = await m.gobierno.cuenta('owner-uid-ana');
    expect(cuenta?.saldoCreditos).toBe(3);
    expect(cuenta?.totalOperaciones).toBe(1);
    expect(cuenta?.totalCreditosConsumidos).toBe(2);
    const [registro] = m.registro.listar();
    expect(registro.estado).toBe('COMPLETADA');
    expect(registro.costeCreditos).toBe(2);
    expect(registro.creditosReembolsados).toBeUndefined();
  });

  it('operación con coste 0 bajo política aprobada NO exige saldo', async () => {
    const m = await montar();
    perfilFijo(m.gobierno, 'uid-ana', 'PROPIETARIO');
    const r = await m.llamar(m.autenticado());
    expect(r.status).toBe(200);
    const cuenta = await m.gobierno.cuenta('owner-uid-ana');
    expect(cuenta?.saldoCreditos).toBe(0);
    expect(cuenta?.totalOperaciones).toBe(1);
    const [registro] = m.registro.listar();
    expect(registro.costeCreditos).toBe(0);
  });

  it('proveedor sin éxito (fallo transitorio) → reembolso íntegro y cierre con creditosReembolsados', async () => {
    const { cliente } = proveedorFalso({ fallos: 5 });
    const m = await montar({ politica: { costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 3 } }, proveedor: cliente });
    perfilFijo(m.gobierno, 'uid-ana', 'PROPIETARIO');
    await m.gobierno.ajustarCredito({ uid: 'owner-uid-ana', adminUid: 'uid-admin', claveIdempotencia: 'clave-admin-1', creditos: 3, motivo: 'prueba', ahora: new Date() });
    const r = await m.llamar(m.autenticado());
    expect(r.status).toBe(200); // respaldo heurístico
    const cuenta = await m.gobierno.cuenta('owner-uid-ana');
    expect(cuenta?.saldoCreditos).toBe(3);
    expect(cuenta?.totalCreditosConsumidos).toBe(0);
    const [registro] = m.registro.listar();
    expect(registro.origenRespuesta).toBe('RESPALDO');
    expect(registro.costeCreditos).toBe(3);
    expect(registro.creditosReembolsados).toBe(3);
  });
});

describe('IA Fase 2 · cuotas por usuario (ventanas UTC)', () => {
  it('cuota diaria: la tercera operación del día se rechaza con 429 CUOTA_DIA_EXCEDIDA', async () => {
    const m = await montar({ politica: { cuotas: { operacionesPorDia: 2 }, costeCreditosPorOperacion: { ESTIMAR_PRICING: 1 } } });
    perfilFijo(m.gobierno, 'uid-ana', 'PROPIETARIO');
    expect((await m.llamar(m.autenticado('token-ana', 'clave-dia-1'))).status).toBe(200);
    expect((await m.llamar(m.autenticado('token-ana', 'clave-dia-2'))).status).toBe(200);
    const r = await m.llamar(m.autenticado('token-ana', 'clave-dia-3'));
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ codigo: 'CUOTA_DIA_EXCEDIDA' });
    expect(m.llamadas).toHaveLength(2); // el rechazo NO llegó al proveedor
    const fallidas = m.registro.listar().filter((x) => x.estado === 'FALLIDA');
    expect(fallidas).toHaveLength(1);
    expect(fallidas[0].codigoHttp).toBe(429);
  });

  it('cuota mensual: límite 1 ⇒ la segunda del mes se rechaza con 429 CUOTA_MES_EXCEDIDA', async () => {
    const m = await montar({ politica: { cuotas: { operacionesPorMes: 1 }, costeCreditosPorOperacion: { ESTIMAR_PRICING: 1 } } });
    perfilFijo(m.gobierno, 'uid-ana', 'PROPIETARIO');
    expect((await m.llamar(m.autenticado('token-ana', 'clave-mes-1'))).status).toBe(200);
    const r = await m.llamar(m.autenticado('token-ana', 'clave-mes-2'));
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ codigo: 'CUOTA_MES_EXCEDIDA' });
    expect(m.llamadas).toHaveLength(1);
  });

  it('cuenta bloqueada por administración → 403 CUENTA_BLOQUEADA sin tocar al proveedor', async () => {
    const m = await montar();
    perfilFijo(m.gobierno, 'uid-ana', 'PROPIETARIO');
    await m.gobierno.bloquear({ uid: 'owner-uid-ana', adminUid: 'uid-admin', claveIdempotencia: 'clave-blq-1', bloqueado: true, motivo: 'abuso', ahora: new Date() });
    const r = await m.llamar(m.autenticado());
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'CUENTA_BLOQUEADA' });
    expect(m.llamadas).toHaveLength(0);
  });
});

describe('IA Fase 2 · idempotencia y concurrencia', () => {
  it('la misma clave de idempotencia no descuenta dos veces (409 la segunda)', async () => {
    const m = await montar({ politica: { costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } } });
    perfilFijo(m.gobierno, 'uid-ana', 'PROPIETARIO');
    await m.gobierno.ajustarCredito({ uid: 'owner-uid-ana', adminUid: 'uid-admin', claveIdempotencia: 'c-admin', creditos: 10, motivo: 'prueba', ahora: new Date() });
    const primera = await m.llamar(m.autenticado('token-ana', 'clave-repetida'));
    const segunda = await m.llamar(m.autenticado('token-ana', 'clave-repetida'));
    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(409);
    const cuenta = await m.gobierno.cuenta('owner-uid-ana');
    expect(cuenta?.saldoCreditos).toBe(8);
    expect(cuenta?.totalOperaciones).toBe(1);
    expect(m.registro.listar()).toHaveLength(1);
  });

  it('5 peticiones simultáneas con saldo para 3 ⇒ exactamente 3 consumen y 2 reciben 402', async () => {
    const m = await montar({ politica: { costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } } });
    perfilFijo(m.gobierno, 'uid-ana', 'PROPIETARIO');
    await m.gobierno.ajustarCredito({ uid: 'owner-uid-ana', adminUid: 'uid-admin', claveIdempotencia: 'c-admin', creditos: 6, motivo: 'prueba', ahora: new Date() });
    const respuestas = await Promise.all([
      m.llamar(m.autenticado('token-ana', 'clave-c-1')),
      m.llamar(m.autenticado('token-ana', 'clave-c-2')),
      m.llamar(m.autenticado('token-ana', 'clave-c-3')),
      m.llamar(m.autenticado('token-ana', 'clave-c-4')),
      m.llamar(m.autenticado('token-ana', 'clave-c-5')),
    ]);
    const estados = respuestas.map((r) => r.status).sort();
    expect(estados).toEqual([200, 200, 200, 402, 402]);
    const cuenta = await m.gobierno.cuenta('owner-uid-ana');
    expect(cuenta?.saldoCreditos).toBe(0);
    expect(cuenta?.totalOperaciones).toBe(3);
    expect(cuenta?.totalCreditosConsumidos).toBe(6);
    expect(m.registro.listar()).toHaveLength(5);
  });

  it('idempotencia bajo concurrencia: 5 veces la MISMA clave ⇒ una ejecución y un único descuento', async () => {
    const m = await montar({ politica: { costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } } });
    perfilFijo(m.gobierno, 'uid-ana', 'PROPIETARIO');
    await m.gobierno.ajustarCredito({ uid: 'owner-uid-ana', adminUid: 'uid-admin', claveIdempotencia: 'c-admin', creditos: 10, motivo: 'prueba', ahora: new Date() });
    const respuestas = await Promise.all([
      m.llamar(m.autenticado('token-ana', 'clave-unica')),
      m.llamar(m.autenticado('token-ana', 'clave-unica')),
      m.llamar(m.autenticado('token-ana', 'clave-unica')),
      m.llamar(m.autenticado('token-ana', 'clave-unica')),
      m.llamar(m.autenticado('token-ana', 'clave-unica')),
    ]);
    expect(respuestas.filter((r) => r.status === 200)).toHaveLength(1);
    expect(respuestas.filter((r) => r.status === 409)).toHaveLength(4);
    const cuenta = await m.gobierno.cuenta('owner-uid-ana');
    expect(cuenta?.saldoCreditos).toBe(8);
    expect(cuenta?.totalOperaciones).toBe(1);
  });

  it('aislamiento entre titulares: el saldo de Ana no afecta a Luis', async () => {
    const m = await montar({ politica: { costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } } });
    perfilFijo(m.gobierno, 'uid-ana', 'PROPIETARIO');
    perfilFijo(m.gobierno, 'uid-luis', 'PROPIETARIO');
    await m.gobierno.ajustarCredito({ uid: 'owner-uid-ana', adminUid: 'uid-admin', claveIdempotencia: 'c-ana', creditos: 2, motivo: 'prueba', ahora: new Date() });
    expect((await m.llamar(m.autenticado('token-ana', 'clave-aisl-1'))).status).toBe(200);
    expect((await m.llamar(m.autenticado('token-ana', 'clave-aisl-2'))).status).toBe(402);
    expect((await m.llamar(m.autenticado('token-luis', 'clave-aisl-3'))).status).toBe(402);
  });
});

describe('IA Fase 2 · registro sin datos personales y Fase 1 intacta', () => {
  it('los campos del cierre de Fase 2 están en la lista blanca y no aparece ningún dato personal', async () => {
    const m = await montar({ politica: { costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } } });
    perfilFijo(m.gobierno, 'uid-ana', 'PROPIETARIO');
    await m.gobierno.ajustarCredito({ uid: 'owner-uid-ana', adminUid: 'uid-admin', claveIdempotencia: 'c-admin', creditos: 2, motivo: 'prueba', ahora: new Date() });
    await m.llamar(m.autenticado());
    const [registro] = m.registro.listar();
    for (const campo of Object.keys(registro)) expect(CAMPOS_REGISTRO_IA).toContain(campo);
    expect(JSON.stringify(registro)).not.toMatch(/prompt|Bearer|eyJ|@correo|token-/i);
    const cuenta = await m.gobierno.cuenta('owner-uid-ana');
    expect(JSON.stringify(cuenta)).not.toMatch(/prompt|Bearer|eyJ|@correo|token-/i);
  });

  it('sin gobierno, aunque haya llave del titular, falla cerrado antes de reservar o llamar al proveedor', async () => {
    const m = await montar({ gobierno: null });
    const r = await m.llamar(m.autenticado('token-luis'));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ codigo: 'GOBIERNO_NO_DISPONIBLE' });
    expect(m.nucleo.estado()).toMatchObject({ gobierno: 'NO_CONFIGURADO' });
    expect(m.registro.listar()).toHaveLength(0);
    expect(m.llamadas).toHaveLength(0);
    expect(m.ejecuciones).toHaveLength(0);
  });
});
