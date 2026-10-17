/**
 * IA FASE 2 — AISLAMIENTO DE CRÉDITOS POR USUARIO
 * =========================================================================
 * HTTP real contra Express con gobierno y registro en memoria, proveedor
 * FALSO y dos usuarios A (uid-ana) y B (uid-luis) con saldos distintos.
 * Sin red, sin Firebase real, sin Gemini real.
 *
 * Demuestra que cada crédito pertenece a la identidad del token verificado:
 * las operaciones de A sólo tocan el saldo de A, las de B sólo el de B, la
 * suplantación de identificadores no mueve saldo ajeno, los reembolsos
 * vuelven a la cuenta original, las cuotas son por usuario y la concurrencia
 * no permite gastar más de lo disponible.
 */
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { crearNucleoIA, clienteIA, type ClienteProveedorIA, type ResultadoResolverTitularNucleoIA } from '../server/ia/nucleoIA';
import type { ServicioLlavesIA } from '../server/ia/llavesUsuarioIA';
import { crearGobiernoMemoria, type GobiernoMemoriaIA } from '../server/ia/gobiernoIA';
import { crearRegistroMemoria } from '../server/ia/registroOperacionesIA';
import { montarRutasAdminIA } from '../server/ia/adminIA';
import {
  construirPoliticaIACompleta,
  OPERACIONES_IA_IDS,
  validarPoliticaGobiernoIA,
  type PoliticaGobiernoIA,
  type SobrescriturasPoliticaIA,
} from '../src/ia/gobiernoIAContrato';
import { CABECERA_IDEMPOTENCIA_IA } from '../src/ia/catalogoOperacionesIA';
import type { IdentidadVerificada } from '../server/titularidades/googleBackend';

const TOKENS: Record<string, IdentidadVerificada> = {
  'token-a': { uid: 'uid-ana' },
  'token-b': { uid: 'uid-luis' },
  'token-admin': { uid: 'uid-admin' },
};

const AHORA = () => new Date('2026-10-15T12:00:00.000Z');

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
  saldoA?: number;
  saldoB?: number;
  fallosProveedor?: number;
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

/** Política declarada COMPLETA (Fase 7: sin comodines) con tarifa 2 en REDACTAR_CLAUSULA; saldos A y B independientes. */
async function montar(opciones: OpcionesMontaje = {}) {
  const resultado = validarPoliticaGobiernoIA(
    politicaPermisiva((opciones.politica ?? { costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } }) as SobrescriturasPoliticaIA),
  );
  if (resultado.estado !== 'VALIDA') throw new Error('política de prueba inválida');
  const registro = crearRegistroMemoria();
  const gobierno: GobiernoMemoriaIA = crearGobiernoMemoria(resultado.politica, { listarOperaciones: () => registro.listar() });
  gobierno.fijarPerfil('uid-ana', { usuarioId: 'usr-ana', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' }, { authUid: 'uid-ana', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' });
  gobierno.fijarPerfil('uid-luis', { usuarioId: 'usr-luis', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' }, { authUid: 'uid-luis', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' });
  gobierno.fijarPerfil('uid-admin', { usuarioId: 'usr-admin', tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO' }, { authUid: 'uid-admin', tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO' });
  for (const uid of ['uid-ana', 'uid-luis', 'uid-admin']) {
    gobierno.fijarPerfil(`owner-${uid}`, { usuarioId: `owner-${uid}`, tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' }, { authUid: `owner-${uid}`, tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' });
  }
  const llaves = {
    resolverParaOperacion: async (uid: string) => ({ estado: 'DISPONIBLE' as const, valor: `mock-key-${uid}`, sufijo: 'MOCK' }),
  } as unknown as ServicioLlavesIA;
  const resolverTitularIA = async ({ uidActor }: { uidActor: string }): Promise<ResultadoResolverTitularNucleoIA> => ({
    estado: 'RESUELTO',
    contexto: {
      propietarioUid: `owner-${uidActor}`, propietarioId: `prop-${uidActor}`,
      contratoId: `contract-${uidActor}`, inmuebleId: `asset-${uidActor}`,
    },
  });
  const { cliente, llamadas } = proveedorFalso({ fallos: opciones.fallosProveedor });
  const nucleo = crearNucleoIA({
    verificarToken: async (token) => TOKENS[token] ?? null,
    registro,
    gobierno,
    llaves,
    resolverTitularIA,
    crearClienteProveedor: () => cliente,
    ahora: AHORA,
    log: () => undefined,
  });
  const app = express();
  app.use(express.json());
  app.post('/api/redactar-clausula', nucleo.operacion('REDACTAR_CLAUSULA'), async (_req, res) => {
    const ai = clienteIA(res);
    if (!ai) return res.json({ motor: 'respaldo' });
    try {
      const r = await ai.models.generateContent({ model: 'm', contents: { parts: [{ text: 'x' }] } });
      return res.json({ motor: 'gemini', texto: r?.text });
    } catch {
      return res.json({ motor: 'respaldo' }); // como los endpoints reales ante fallo del proveedor
    }
  });
  montarRutasAdminIA(app, {
    verificarToken: async (token) => TOKENS[token] ?? null,
    gobierno,
    politica: resultado.politica,
    ahora: AHORA,
    log: () => undefined,
  });
  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  servidores.push(servidor);
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const operar = (token: string, clave: string, cuerpo: Record<string, unknown> = {}) =>
    fetch(`${base}/api/redactar-clausula`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, [CABECERA_IDEMPOTENCIA_IA]: clave },
      body: JSON.stringify({ prompt: 'x', ...cuerpo }),
    });
  const admin = (ruta: string, token: string, cuerpo?: unknown, clave = 'clave-admin-isla') =>
    fetch(`${base}${ruta}`, {
      method: cuerpo === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(cuerpo === undefined ? {} : { [CABECERA_IDEMPOTENCIA_IA]: clave }),
      },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
  // Saldos iniciales mediante ajustes administrativos (idempotentes): A y B
  const saldoA = opciones.saldoA ?? 10;
  const saldoB = opciones.saldoB ?? 3;
  if (saldoA > 0) {
    await gobierno.ajustarCredito({ uid: 'owner-uid-ana', adminUid: 'uid-admin', claveIdempotencia: 'is-carga-a', creditos: saldoA, motivo: 'prueba', ahora: AHORA() });
  }
  if (saldoB > 0) {
    await gobierno.ajustarCredito({ uid: 'owner-uid-luis', adminUid: 'uid-admin', claveIdempotencia: 'is-carga-b', creditos: saldoB, motivo: 'prueba', ahora: AHORA() });
  }
  return { gobierno, registro, llamadas, operar, admin };
}

describe('IA Fase 2 · aislamiento de créditos entre usuarios', () => {
  it('una operación de A descuenta SOLO de A: el saldo de B queda intacto', async () => {
    const m = await montar(); // A=10, B=3, coste 2
    const r = await m.operar('token-a', 'clave-iso-a1');
    expect(r.status).toBe(200);
    expect(await (await m.gobierno.cuenta('owner-uid-ana'))?.saldoCreditos).toBe(8);
    expect(await (await m.gobierno.cuenta('owner-uid-luis'))?.saldoCreditos).toBe(3);
    expect(m.registro.listar()[0].uid).toBe('uid-ana');
  });

  it('una operación de B descuenta SOLO de B', async () => {
    const m = await montar();
    const r = await m.operar('token-b', 'clave-iso-b1');
    expect(r.status).toBe(200);
    expect(await (await m.gobierno.cuenta('owner-uid-luis'))?.saldoCreditos).toBe(1);
    expect(await (await m.gobierno.cuenta('owner-uid-ana'))?.saldoCreditos).toBe(10);
  });

  it('un usuario ordinario no puede consultar ni modificar el saldo de otro: las rutas de administración exigen ADMINISTRADOR', async () => {
    const m = await montar();
    const consulta = await m.admin('/api/ia/admin/cuenta/owner-uid-luis', 'token-a');
    expect(consulta.status).toBe(403);
    expect(await consulta.json()).toMatchObject({ codigo: 'NO_ADMINISTRADOR' });
    const credito = await m.admin('/api/ia/admin/cuenta/owner-uid-luis/credito', 'token-a', { creditos: 100, motivo: 'suplantación' }, 'clave-iso-mal-1');
    expect(credito.status).toBe(403);
    const bloqueo = await m.admin('/api/ia/admin/cuenta/owner-uid-luis/bloqueo', 'token-b', { bloqueado: true, motivo: 'suplantación' }, 'clave-iso-mal-2');
    expect(bloqueo.status).toBe(403);
    // y no existe ninguna ruta de usuario para saldos: el saldo ajeno es inaccesible
    expect(await (await m.gobierno.cuenta('owner-uid-luis'))?.saldoCreditos).toBe(3);
  });

  it('suplantar el uid en el cuerpo no mueve saldo ajeno: el cargo va al uid del TOKEN', async () => {
    const m = await montar();
    const r = await m.operar('token-a', 'clave-iso-spoof1', { uid: 'uid-luis', usuarioId: 'uid-luis', propietarioId: 'uid-luis' });
    expect(r.status).toBe(200);
    expect(await (await m.gobierno.cuenta('owner-uid-ana'))?.saldoCreditos).toBe(8); // paga A
    expect(await (await m.gobierno.cuenta('owner-uid-luis'))?.saldoCreditos).toBe(3); // B intacto
    expect(m.registro.listar()[0].uid).toBe('uid-ana');
  });

  it('la misma clave de idempotencia usada por A y B son DOS operaciones distintas: cada cuenta paga lo suyo', async () => {
    const m = await montar();
    const ra = await m.operar('token-a', 'clave-compartida-1');
    const rb = await m.operar('token-b', 'clave-compartida-1');
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200); // no es duplicado: el id incluye el uid del token
    expect(await (await m.gobierno.cuenta('owner-uid-ana'))?.saldoCreditos).toBe(8);
    expect(await (await m.gobierno.cuenta('owner-uid-luis'))?.saldoCreditos).toBe(1);
  });

  it('el reembolso vuelve a la cuenta ORIGINAL de la operación, nunca a otra', async () => {
    const m = await montar({ fallosProveedor: 5 }); // proveedor siempre falla ⇒ exitosas 0 ⇒ reembolso
    const r = await m.operar('token-a', 'clave-iso-reemb-1');
    expect(r.status).toBe(200); // respaldo heurístico
    expect(await (await m.gobierno.cuenta('owner-uid-ana'))?.saldoCreditos).toBe(10); // reembolso íntegro a A
    expect(await (await m.gobierno.cuenta('owner-uid-luis'))?.saldoCreditos).toBe(3); // B sin cambios
    const [registro] = m.registro.listar();
    expect(registro.creditosReembolsados).toBe(2);
    expect(registro.uid).toBe('uid-ana');
  });

  it('concurrencia sobre la cuenta de A no permite gastar más de lo disponible y no toca la de B', async () => {
    const m = await montar({ saldoA: 4 }); // A=4: caben 2 operaciones de coste 2
    const respuestas = await Promise.all([
      m.operar('token-a', 'clave-conc-a1'),
      m.operar('token-a', 'clave-conc-a2'),
      m.operar('token-a', 'clave-conc-a3'),
    ]);
    const codigos = respuestas.map((r) => r.status).sort();
    expect(codigos).toEqual([200, 200, 402]); // exactamente dos consumen; la tercera, SALDO_INSUFICIENTE
    expect(await (await m.gobierno.cuenta('owner-uid-ana'))?.saldoCreditos).toBe(0); // nunca negativo
    expect(await (await m.gobierno.cuenta('owner-uid-luis'))?.saldoCreditos).toBe(3);
  });

  it('las cuotas son por usuario: A agota su cuota diaria y B sigue operando', async () => {
    const m = await montar({ politica: { costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 }, cuotas: { operacionesPorDia: 1 } } });
    const a1 = await m.operar('token-a', 'clave-cuota-a1');
    const a2 = await m.operar('token-a', 'clave-cuota-a2');
    const b1 = await m.operar('token-b', 'clave-cuota-b1');
    expect(a1.status).toBe(200);
    expect(a2.status).toBe(429); // CUOTA_DIA_EXCEDIDA de A
    expect(await a2.json()).toMatchObject({ codigo: 'CUOTA_DIA_EXCEDIDA' });
    expect(b1.status).toBe(200); // B tiene su propia ventana
    expect(await (await m.gobierno.cuenta('owner-uid-luis'))?.ventanaDiaUsos).toBe(1);
    expect(await (await m.gobierno.cuenta('owner-uid-ana'))?.ventanaDiaUsos).toBe(1);
  });

  it('el ajuste administrativo de crédito sólo afecta al destinatario y queda auditado', async () => {
    const m = await montar();
    const r = await m.admin('/api/ia/admin/cuenta/owner-uid-luis/credito', 'token-admin', { creditos: 5, motivo: 'recarga B' }, 'clave-iso-ajuste');
    expect(r.status).toBe(200);
    expect(await (await m.gobierno.cuenta('owner-uid-luis'))?.saldoCreditos).toBe(8); // 3 + 5
    expect(await (await m.gobierno.cuenta('owner-uid-ana'))?.saldoCreditos).toBe(10); // A intacto
    const duplicado = await m.admin('/api/ia/admin/cuenta/owner-uid-luis/credito', 'token-admin', { creditos: 5, motivo: 'recarga B' }, 'clave-iso-ajuste');
    expect(duplicado.status).toBe(409); // reintento idempotente: sin doble efecto
    expect(await (await m.gobierno.cuenta('owner-uid-luis'))?.saldoCreditos).toBe(8);
  });

  it('tras múltiples operaciones mezcladas, cada cuenta conserva saldos y contadores independientes', async () => {
    const m = await montar(); // A=10, B=3, coste 2
    await m.operar('token-a', 'clave-mix-1');
    await m.operar('token-b', 'clave-mix-2');
    await m.operar('token-a', 'clave-mix-3');
    const rb4 = await m.operar('token-b', 'clave-mix-4'); // B tiene 1 crédito: ya no le alcanza
    const rb5 = await m.operar('token-b', 'clave-mix-5');
    expect(rb4.status).toBe(402);
    expect(rb5.status).toBe(402);
    const a = await m.gobierno.cuenta('owner-uid-ana');
    const b = await m.gobierno.cuenta('owner-uid-luis');
    expect(a?.saldoCreditos).toBe(6);
    expect(a?.totalOperaciones).toBe(2);
    expect(a?.totalCreditosConsumidos).toBe(4);
    expect(b?.saldoCreditos).toBe(1); // 3 - 2 de su única operación con saldo
    expect(b?.totalOperaciones).toBe(1); // las otras dos de B fueron 402: no consumen ni cuentan
    expect(b?.totalCreditosConsumidos).toBe(2);
    // y el registro separa por uid
    const uids = new Set(m.registro.listar().map((x) => x.uid));
    expect(uids).toEqual(new Set(['uid-ana', 'uid-luis']));
  });
});
