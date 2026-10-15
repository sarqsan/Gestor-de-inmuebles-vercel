/**
 * IA · FASE 2 — RUTAS DE ADMINISTRACIÓN DEL GOBIERNO (server/ia/adminIA.ts)
 * =========================================================================
 * HTTP real contra Express en puerto efímero con dependencias inyectadas
 * (gobierno en memoria, verificador de tokens falso): sin red, sin Firebase.
 *
 * Cubre: la guardía ADMINISTRADOR (401/403/503), el resumen con la política y
 * su estado de aprobación, la consulta de cuenta por uid, el bloqueo y el
 * crédito con `Idempotency-Key` obligatoria (reintento ⇒ 409 sin doble
 * aplicación), la validación de cuerpos y el cableado estático en server.ts.
 */
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { montarRutasAdminIA, type EventoAdminIA } from '../server/ia/adminIA';
import { ConflictoConcurrenciaIA, crearGobiernoMemoria, type GobiernoIA } from '../server/ia/gobiernoIA';
import { validarPoliticaGobiernoIA } from '../src/ia/gobiernoIAContrato';
import { CABECERA_IDEMPOTENCIA_IA } from '../src/ia/catalogoOperacionesIA';
import type { IdentidadVerificada } from '../server/titularidades/googleBackend';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TOKENS: Record<string, IdentidadVerificada> = {
  'token-admin': { uid: 'uid-admin' },
  'token-propietario': { uid: 'uid-prop' },
  'token-roto': { uid: 'uid-roto' },
};

const AHORA = new Date('2026-10-15T12:00:00.000Z');
const RAIZ = resolve(__dirname, '..');

const servidores: Server[] = [];
afterEach(async () => {
  await Promise.all(servidores.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
});

function politicaValida(crudo: unknown) {
  const r = validarPoliticaGobiernoIA(crudo);
  if (r.estado !== 'VALIDA') throw new Error('política de prueba inválida');
  return r.politica;
}

async function montar(opciones: { politica?: unknown; conGobierno?: boolean; adminVeraz?: boolean } = {}) {
  const politica = politicaValida(opciones.politica ?? undefined);
  const gobierno = crearGobiernoMemoria(politica);
  gobierno.fijarPerfil('uid-admin', { usuarioId: 'usr-admin', tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO' }, { authUid: 'uid-admin', tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO' });
  gobierno.fijarPerfil('uid-prop', { usuarioId: 'usr-prop', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' }, { authUid: 'uid-prop', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' });
  if (opciones.adminVeraz === false) {
    gobierno.fijarPerfil('uid-admin', null, null);
  }
  const eventos: EventoAdminIA[] = [];
  const app = express();
  app.use(express.json());
  montarRutasAdminIA(app, {
    verificarToken: async (token) => TOKENS[token] ?? null,
    gobierno: opciones.conGobierno === false ? null : gobierno,
    politica,
    ahora: () => AHORA,
    log: (evento) => eventos.push(evento),
  });
  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  servidores.push(servidor);
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const pedir = (ruta: string, token = 'token-admin', cuerpo?: unknown, clave = 'clave-admin-0001') =>
    fetch(`${base}${ruta}`, {
      method: cuerpo === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cuerpo === undefined ? {} : { [CABECERA_IDEMPOTENCIA_IA]: clave }),
      },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
  return { gobierno, eventos, pedir };
}

describe('IA Fase 2 · guardía de administración', () => {
  it('sin token → 401; token inválido → 401; PROPIETARIO → 403 NO_ADMINISTRADOR', async () => {
    const m = await montar();
    expect((await m.pedir('/api/ia/admin/resumen', '')).status).toBe(401);
    expect((await m.pedir('/api/ia/admin/resumen', 'token-desconocido')).status).toBe(401);
    const r = await m.pedir('/api/ia/admin/resumen', 'token-propietario');
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'NO_ADMINISTRADOR' });
  });

  it('perfil admin no veraz → 403 PERFIL_NO_VALIDO', async () => {
    const m = await montar({ adminVeraz: false });
    const r = await m.pedir('/api/ia/admin/resumen');
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'PERFIL_NO_VALIDO' });
  });

  it('sin gobierno configurado → 503 GOBIERNO_NO_DISPONIBLE en todas las rutas', async () => {
    const m = await montar({ conGobierno: false });
    expect((await m.pedir('/api/ia/admin/resumen')).status).toBe(503);
    expect((await m.pedir('/api/ia/admin/cuenta/uid-prop')).status).toBe(503);
  });

  it('ADMINISTRADOR veraz → 200 con resumen, política y estado pendiente de aprobación', async () => {
    const m = await montar();
    const r = await m.pedir('/api/ia/admin/resumen');
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.gobierno.modo).toBe('MEMORIA');
    expect(cuerpo.politica.origen).toBe('POR_DEFECTO');
    expect(cuerpo.politica.pendienteAprobacionComercial).toBe(true);
    expect(cuerpo.politica.cuotas).toEqual({ operacionesPorDia: null, operacionesPorMes: null });
    expect(Array.isArray(cuerpo.operacionesRecientes)).toBe(true);
    expect(JSON.stringify(cuerpo)).not.toMatch(/private_key|Bearer|apiKey/i);
  });
});

describe('IA Fase 2 · consulta de cuenta', () => {
  it('devuelve cuenta, operaciones y ajustes del uid; uid inválido → 400', async () => {
    const m = await montar();
    await m.gobierno.ajustarCredito({ uid: 'uid-prop', adminUid: 'uid-admin', claveIdempotencia: 'c1', creditos: 25, motivo: 'pack inicial', ahora: AHORA });
    const r = await m.pedir('/api/ia/admin/cuenta/uid-prop');
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.cuenta.saldoCreditos).toBe(25);
    expect(cuerpo.ajustes).toHaveLength(1);
    expect(cuerpo.ajustes[0]).toMatchObject({ tipo: 'CREDITO', creditos: 25, estado: 'APLICADO' });
    expect((await m.pedir('/api/ia/admin/cuenta/uid%20mal')).status).toBe(400);
    expect((await m.pedir('/api/ia/admin/cuenta/')).status).toBe(404); // sin :uid no existe la ruta
  });
});

describe('IA Fase 2 · bloqueo y crédito (acciones idempotentes)', () => {
  it('bloqueo aplica y queda auditado; el reintento con la misma clave es 409 sin doble efecto', async () => {
    const m = await montar();
    const primero = await m.pedir('/api/ia/admin/cuenta/uid-prop/bloqueo', 'token-admin', { bloqueado: true, motivo: 'prueba' }, 'clave-bloq-1');
    expect(primero.status).toBe(200);
    expect((await m.gobierno.cuenta('uid-prop'))?.bloqueada).toBe(true);
    const segundo = await m.pedir('/api/ia/admin/cuenta/uid-prop/bloqueo', 'token-admin', { bloqueado: true, motivo: 'prueba' }, 'clave-bloq-1');
    expect(segundo.status).toBe(409);
    expect((await m.gobierno.ajustesDeUsuario('uid-prop'))).toHaveLength(1);
    expect(m.eventos.some((e) => e.evento === 'ADMIN_ACCION' && e.uid === 'uid-admin' && e.uidDestino === 'uid-prop')).toBe(true);
  });

  it('bloqueo sin Idempotency-Key → 400; cuerpo inválido → 422; autobloqueo → 422', async () => {
    const m = await montar();
    const sinClave = await fetch(`http://127.0.0.1:${(servidores[0].address() as AddressInfo).port}/api/ia/admin/cuenta/uid-prop/bloqueo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-admin' },
      body: JSON.stringify({ bloqueado: true }),
    });
    expect(sinClave.status).toBe(400);
    expect((await m.pedir('/api/ia/admin/cuenta/uid-prop/bloqueo', 'token-admin', { bloqueado: 'si' }, 'clave-c2-aaaa')).status).toBe(422);
    expect((await m.pedir('/api/ia/admin/cuenta/uid-prop/bloqueo', 'token-admin', { bloqueado: true, motivo: 'x'.repeat(121) }, 'clave-c3-aaaa')).status).toBe(422);
    expect((await m.pedir('/api/ia/admin/cuenta/uid-admin/bloqueo', 'token-admin', { bloqueado: true }, 'clave-c4-aaaa')).status).toBe(422);
  });

  it('crédito aplica con importe explícito y motivo; duplicado → 409; fuera de límites → 422', async () => {
    const m = await montar();
    const ok = await m.pedir('/api/ia/admin/cuenta/uid-prop/credito', 'token-admin', { creditos: 30, motivo: 'concesión aprobada' }, 'clave-cred-1');
    expect(ok.status).toBe(200);
    expect((await m.gobierno.cuenta('uid-prop'))?.saldoCreditos).toBe(30);
    const duplicado = await m.pedir('/api/ia/admin/cuenta/uid-prop/credito', 'token-admin', { creditos: 30, motivo: 'concesión aprobada' }, 'clave-cred-1');
    expect(duplicado.status).toBe(409);
    expect((await m.gobierno.cuenta('uid-prop'))?.saldoCreditos).toBe(30);
    const fuera = await m.pedir('/api/ia/admin/cuenta/uid-prop/credito', 'token-admin', { creditos: -99, motivo: 'corrección' }, 'clave-cred-2');
    expect(fuera.status).toBe(422);
    expect((await m.gobierno.cuenta('uid-prop'))?.saldoCreditos).toBe(30);
  });

  it('crédito con importe inválido o sin motivo → 422', async () => {
    const m = await montar();
    expect((await m.pedir('/api/ia/admin/cuenta/uid-prop/credito', 'token-admin', { creditos: 0, motivo: 'x' }, 'clave-c5-aaaa')).status).toBe(422);
    expect((await m.pedir('/api/ia/admin/cuenta/uid-prop/credito', 'token-admin', { creditos: 1.5, motivo: 'x' }, 'clave-c6-aaaa')).status).toBe(422);
    expect((await m.pedir('/api/ia/admin/cuenta/uid-prop/credito', 'token-admin', { creditos: 5 }, 'clave-c7-aaaa')).status).toBe(422);
  });
});

describe('IA Fase 2 · cableado en server.ts', () => {
  it('conflicto de concurrencia persistente al aplicar bloqueo o crédito → 503 sin colgar la petición', async () => {
    // Gobierno que agota los reintentos CAS: bloquear/ajustarCredito lanzan
    // ConflictoConcurrenciaIA — la ruta debe responder 503 CONFLICTO_CONCURRENCIA
    // (Express 4 no captura rechazos async: sin este manejo la petición colgaría).
    const politica = politicaValida(undefined);
    const base = crearGobiernoMemoria(politica);
    base.fijarPerfil('uid-admin', { usuarioId: 'usr-admin', tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO' }, { authUid: 'uid-admin', tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO' });
    const gobiernoConflicto: GobiernoIA = {
      ...base,
      bloquear: () => {
        throw new ConflictoConcurrenciaIA('bloquear');
      },
      ajustarCredito: () => {
        throw new ConflictoConcurrenciaIA('ajustarCredito');
      },
    };
    const eventos: EventoAdminIA[] = [];
    const app = express();
    app.use(express.json());
    montarRutasAdminIA(app, {
      verificarToken: async (token) => TOKENS[token] ?? null,
      gobierno: gobiernoConflicto,
      politica,
      ahora: () => AHORA,
      log: (evento) => eventos.push(evento),
    });
    const servidor = app.listen(0, '127.0.0.1');
    await once(servidor, 'listening');
    servidores.push(servidor);
    const baseHttp = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    const pedir = (ruta: string, cuerpo: unknown, clave: string) =>
      fetch(`${baseHttp}${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-admin', [CABECERA_IDEMPOTENCIA_IA]: clave },
        body: JSON.stringify(cuerpo),
      });
    const rBloqueo = await pedir('/api/ia/admin/cuenta/uid-ana/bloqueo', { bloqueado: true, motivo: 'conflicto' }, 'clave-conflicto-1');
    expect(rBloqueo.status).toBe(503);
    expect(await rBloqueo.json()).toMatchObject({ codigo: 'CONFLICTO_CONCURRENCIA' });
    const rCredito = await pedir('/api/ia/admin/cuenta/uid-ana/credito', { creditos: 5, motivo: 'conflicto' }, 'clave-conflicto-2');
    expect(rCredito.status).toBe(503);
    expect(await rCredito.json()).toMatchObject({ codigo: 'CONFLICTO_CONCURRENCIA' });
    expect(eventos.filter((e) => e.estado === 'ERROR_CONCURRENCIA')).toHaveLength(2);
  });

  it('las rutas de administración están montadas con montarRutasAdminIA y no usan el cliente del proveedor', () => {
    const servidor = readFileSync(resolve(RAIZ, 'server.ts'), 'utf8');
    expect(servidor.match(/montarRutasAdminIA\(/g)).toHaveLength(1);
    expect(servidor).toContain("app.get('/api/health'");
    expect(servidor.match(/app\.post\('[^']+', nucleoIA\.operacion\('/g)).toHaveLength(11); // Fase 1 intacta
    // El panel no consume IA: no aparece clienteIA en el bloque de adminIA.
    const bloqueAdmin = servidor.slice(servidor.indexOf('montarRutasAdminIA(app'));
    expect(bloqueAdmin.slice(0, bloqueAdmin.indexOf('});'))).not.toMatch(/clienteIA|generateGeminiWithRetry/);
  });
});
