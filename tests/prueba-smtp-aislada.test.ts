/**
 * FASE A — PRUEBAS DE LA RUTA AISLADA `POST /api/notificaciones/probar-smtp`
 * ==========================================================================
 * Verifica todos los requisitos de aislamiento, seguridad y diagnóstico:
 *   1. Acceso sin token → rechazado (401).
 *   2. Token inválido o perfil no autorizado (PROPIETARIO, PROFESIONAL, inactivo) → rechazado (401/403).
 *   3. Destinatario ajeno al administrador y al buzón del despacho → rechazado (403).
 *   4. Solicitudes con contenido libre, adjuntos, múltiples destinatarios o exceso de tamaño → rechazadas (400/413).
 *   5. Configuración en modo seguro → 503 y NO intenta enviar.
 *   6. SMTP correcto → envía exactamente 1 mensaje al destinatario autorizado y advierte que `entregaBuzonConfirmada` es `false`.
 *   7. Fallo SMTP (conexión, autenticación, rechazo de sobre/destinatario) → respuesta segura clasificada por etapa y sin filtrar credenciales.
 *   8. Protección contra solicitudes repetidas → 429 con `Retry-After` sin invocar al proveedor.
 *   9. Ausencia total de escrituras en Firestore y de invocaciones a `DispatcherNotificaciones` o al cron.
 *
 * Todas las pruebas usan dobles en memoria; jamás abren conexión SMTP real.
 */
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { crearFuentePerfilFirestore } from '../server/notificaciones/perfilUsuarioFirestore';
import { type FabricaTransporteSmtp } from '../server/notificaciones/proveedorSmtp';
import {
  crearTransporteEmailDesdeEntorno,
  identidadDespachoDesdeEntorno,
  type TransporteEmail,
} from '../server/notificaciones/proveedoresEmail';
import {
  ASUNTO_PRUEBA_SMTP,
  AVISO_ENTREGA_BUZON_SMTP,
  MAX_BYTES_CUERPO_PRUEBA_SMTP,
  montarRutaPruebaSmtp,
  RUTA_PROBAR_SMTP,
  type DependenciasPruebaSmtp,
} from '../server/notificaciones/rutaPruebaSmtp';
import { DispatcherNotificaciones } from '../src/notificaciones/dispatcher';

const RAIZ = resolve(__dirname, '..');
const RUTA_SRC = readFileSync(join(RAIZ, 'server/notificaciones/rutaPruebaSmtp.ts'), 'utf8');
const SERVER_SRC = readFileSync(join(RAIZ, 'server.ts'), 'utf8');

const SECRETO_SMTP_SINTETICO = 'clave_app_super_secreta_16';
const USUARIO_SMTP_SINTETICO = 'despacho.privado@gmail.com';
const URL_SMTP_SINTETICA = `smtps://despacho.privado%40gmail.com:${SECRETO_SMTP_SINTETICO}@smtp.gmail.com:465`;
const DESDE_DESPACHO = 'Gestor de Inmuebles <despacho.privado@gmail.com>';
const EMAIL_ADMIN = 'admin.verificado@gestor.test';
const EMAIL_BUZON_DESPACHO = 'despacho.privado@gmail.com';
const EMAIL_REPLY_TO = 'respuestas.despacho@gestor.test';
const AHORA_FIJO = new Date('2026-10-17T11:00:00.000Z');

interface ServidorPrueba {
  baseUrl: string;
  cerrar: () => Promise<void>;
  espiaFirestore: {
    consultarIgualdadesOrden: ReturnType<typeof vi.fn>;
    leerDocumento: ReturnType<typeof vi.fn>;
    crearDocumento: ReturnType<typeof vi.fn>;
    actualizarCampos: ReturnType<typeof vi.fn>;
  };
}

function crearEntornoSmtpReal(sendMailImpl: ReturnType<typeof vi.fn>): {
  transporte: TransporteEmail;
  sendMail: ReturnType<typeof vi.fn>;
} {
  const fabrica: FabricaTransporteSmtp = () => ({
    sendMail: sendMailImpl as unknown as ReturnType<FabricaTransporteSmtp>['sendMail'],
  });
  const entorno = {
    EMAIL_PROVEEDOR: 'SMTP',
    SMTP_URL: URL_SMTP_SINTETICA,
    EMAIL_FROM: DESDE_DESPACHO,
    EMAIL_REPLY_TO,
    EMAIL_DESPACHO_NOMBRE: 'Despacho Prueba',
  };
  return {
    transporte: crearTransporteEmailDesdeEntorno(entorno, undefined, fabrica),
    sendMail: sendMailImpl,
  };
}

let servidorActivo: Server | null = null;

afterEach(async () => {
  vi.restoreAllMocks();
  if (servidorActivo) {
    const srv = servidorActivo;
    servidorActivo = null;
    await new Promise<void>((r) => srv.close(() => r()));
  }
});

async function levantarServidor(opciones: Partial<DependenciasPruebaSmtp> & {
  filasUsuarios?: Array<{ id: string; datos: Record<string, unknown> }>;
  transporte: TransporteEmail;
}): Promise<ServidorPrueba> {
  const filasUsuarios = opciones.filasUsuarios ?? [
    { id: 'u-admin', datos: { authUid: 'uid-admin', estado: 'ACTIVO', tipoPerfil: 'ADMINISTRADOR' } },
    { id: 'u-prop', datos: { authUid: 'uid-prop', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-1' } },
    { id: 'u-prof', datos: { authUid: 'uid-prof', estado: 'ACTIVO', tipoPerfil: 'PROFESIONAL', profesionalId: 'prof-1' } },
    { id: 'u-inactivo', datos: { authUid: 'uid-inactivo', estado: 'INACTIVO', tipoPerfil: 'ADMINISTRADOR' } },
  ];

  const espiaFirestore = {
    consultarIgualdadesOrden: vi.fn(async (coleccion: string, consulta: { igualdades?: Array<[string, string]> }) => {
      if (coleccion !== 'usuarios') throw new Error(`Lectura inesperada de colección: ${coleccion}`);
      const uidBuscado = consulta.igualdades?.find(([c]) => c === 'authUid')?.[1];
      return filasUsuarios.filter((f) => f.datos.authUid === uidBuscado);
    }),
    leerDocumento: vi.fn(async () => {
      throw new Error('No debe invocarse leerDocumento en probar-smtp');
    }),
    crearDocumento: vi.fn(async () => {
      throw new Error('PROHIBIDO escribir documentos en Firestore durante probar-smtp');
    }),
    actualizarCampos: vi.fn(async () => {
      throw new Error('PROHIBIDO actualizar documentos en Firestore durante probar-smtp');
    }),
  };

  const verificarTokenPorDefecto = vi.fn(async (token: string) => {
    if (token === 'token-admin') return { uid: 'uid-admin', email: EMAIL_ADMIN };
    if (token === 'token-admin-sin-email') return { uid: 'uid-admin' };
    if (token === 'token-prop') return { uid: 'uid-prop', email: 'propietario@gestor.test' };
    if (token === 'token-prof') return { uid: 'uid-prof', email: 'profesional@gestor.test' };
    if (token === 'token-inactivo') return { uid: 'uid-inactivo', email: EMAIL_ADMIN };
    return null;
  });

  const app = express();
  app.use(express.json({ limit: '50mb' }));
  montarRutaPruebaSmtp(app, {
    verificarToken: opciones.verificarToken ?? verificarTokenPorDefecto,
    fuentePerfil:
      'fuentePerfil' in opciones
        ? opciones.fuentePerfil
        : crearFuentePerfilFirestore(espiaFirestore),
    transporte: opciones.transporte,
    identidadDespacho: opciones.identidadDespacho ?? identidadDespachoDesdeEntorno({
      EMAIL_FROM: DESDE_DESPACHO,
      EMAIL_REPLY_TO,
      EMAIL_DESPACHO_NOMBRE: 'Despacho Prueba',
    }),
    ahora: opciones.ahora ?? (() => AHORA_FIJO),
    ...(opciones.maxIntentosVentana ? { maxIntentosVentana: opciones.maxIntentosVentana } : {}),
    ...(opciones.ventanaMs ? { ventanaMs: opciones.ventanaMs } : {}),
  });

  const srv = app.listen(0, '127.0.0.1');
  servidorActivo = srv;
  await once(srv, 'listening');
  const port = (srv.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    cerrar: () => new Promise<void>((r) => srv.close(() => r())),
    espiaFirestore,
  };
}

describe('POST /api/notificaciones/probar-smtp · aislamiento, autorización y diagnóstico SMTP', () => {
  it('1. rechaza el acceso sin token (401) sin tocar Firestore ni el proveedor SMTP', async () => {
    const sendMail = vi.fn();
    const { transporte } = crearEntornoSmtpReal(sendMail);
    const { baseUrl, espiaFirestore } = await levantarServidor({ transporte });

    const res = await fetch(`${baseUrl}${RUTA_PROBAR_SMTP}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, etapa: 'solicitud', error: 'no_autenticado' });
    expect(sendMail).not.toHaveBeenCalled();
    expect(espiaFirestore.consultarIgualdadesOrden).not.toHaveBeenCalled();
    expect(espiaFirestore.crearDocumento).not.toHaveBeenCalled();
    expect(espiaFirestore.actualizarCampos).not.toHaveBeenCalled();
  });

  it('2. rechaza tokens inválidos (401) y perfiles no autorizados o inactivos (403) sin enviar correo', async () => {
    const sendMail = vi.fn();
    const { transporte } = crearEntornoSmtpReal(sendMail);
    const { baseUrl, espiaFirestore } = await levantarServidor({ transporte });

    const rInvalido = await fetch(`${baseUrl}${RUTA_PROBAR_SMTP}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-falso', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(rInvalido.status).toBe(401);
    expect(await rInvalido.json()).toMatchObject({ ok: false, error: 'no_autenticado' });

    for (const tokenNoAdmin of ['token-prop', 'token-prof', 'token-inactivo']) {
      const r = await fetch(`${baseUrl}${RUTA_PROBAR_SMTP}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenNoAdmin}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(r.status).toBe(403);
      expect(await r.json()).toMatchObject({ ok: false, etapa: 'solicitud', error: 'no_autorizado' });
    }

    expect(sendMail).not.toHaveBeenCalled();
    expect(espiaFirestore.crearDocumento).not.toHaveBeenCalled();
    expect(espiaFirestore.actualizarCampos).not.toHaveBeenCalled();
  });

  it('3. rechaza destinatarios ajenos al administrador y al buzón del despacho (403), así como contenido libre o adjuntos (400/413)', async () => {
    const sendMail = vi.fn();
    const { transporte } = crearEntornoSmtpReal(sendMail);
    const { baseUrl, espiaFirestore } = await levantarServidor({ transporte });

    // Destinatario externo/arbitrario
    const rAjeno = await fetch(`${baseUrl}${RUTA_PROBAR_SMTP}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-admin', 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinatario: 'tercero.ajeno@dominio-externo.org' }),
    });
    expect(rAjeno.status).toBe(403);
    expect(await rAjeno.json()).toMatchObject({ ok: false, etapa: 'solicitud', error: 'destinatario_no_autorizado' });

    // Intento de múltiples destinatarios en el mismo campo
    const rMultiple = await fetch(`${baseUrl}${RUTA_PROBAR_SMTP}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-admin', 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinatario: `${EMAIL_ADMIN}, otro@externo.org` }),
    });
    expect(rMultiple.status).toBe(400);
    expect(await rMultiple.json()).toMatchObject({ ok: false, error: 'destinatario_invalido' });

    // Intento de inyectar contenido libre o adjuntos
    for (const payloadProhibido of [
      { destinatario: EMAIL_ADMIN, asunto: 'Asunto libre' },
      { destinatario: EMAIL_ADMIN, cuerpo: 'Texto libre' },
      { destinatario: EMAIL_ADMIN, adjuntos: ['fichero.pdf'] },
      { subject: 'x', body: 'y' },
    ]) {
      const rProhibido = await fetch(`${baseUrl}${RUTA_PROBAR_SMTP}`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-admin', 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadProhibido),
      });
      expect(rProhibido.status).toBe(400);
      expect(await rProhibido.json()).toMatchObject({ ok: false, error: 'payload_invalido' });
    }

    // Cuerpo excesivamente grande (> MAX_BYTES_CUERPO_PRUEBA_SMTP)
    const rGrande = await fetch(`${baseUrl}${RUTA_PROBAR_SMTP}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-admin', 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinatario: 'a'.repeat(MAX_BYTES_CUERPO_PRUEBA_SMTP + 50) + '@test.es' }),
    });
    expect(rGrande.status).toBe(413);
    expect(await rGrande.json()).toMatchObject({ ok: false, error: 'payload_demasiado_grande' });

    expect(sendMail).not.toHaveBeenCalled();
    expect(espiaFirestore.crearDocumento).not.toHaveBeenCalled();
  });

  it('4. configuración en MODO_SEGURO (o no SMTP): devuelve 503 en etapa "configuracion" y NO intenta enviar', async () => {
    const fabricaNoInvocada = vi.fn(() => ({ sendMail: vi.fn() }));
    const transporteSeguro = crearTransporteEmailDesdeEntorno(
      { EMAIL_PROVEEDOR: 'SMTP', EMAIL_FROM: DESDE_DESPACHO }, // falta SMTP_URL
      undefined,
      fabricaNoInvocada,
    );
    expect(transporteSeguro.modo).toBe('MODO_SEGURO');

    const { baseUrl, espiaFirestore } = await levantarServidor({ transporte: transporteSeguro });
    const res = await fetch(`${baseUrl}${RUTA_PROBAR_SMTP}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-admin', 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinatario: EMAIL_ADMIN }),
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: false,
      etapa: 'configuracion',
      error: 'smtp_no_configurado',
      modo: 'MODO_SEGURO',
      proveedor: null,
      aceptadoPorServidorSmtp: false,
      entregaBuzonConfirmada: false,
    });
    expect(fabricaNoInvocada).not.toHaveBeenCalled();
    expect(espiaFirestore.crearDocumento).not.toHaveBeenCalled();
  });

  it('5. SMTP correcto: envía exactamente 1 correo al destinatario autorizado (admin o buzón del despacho) sin afirmar entrega en buzón', async () => {
    const sendMail = vi.fn(async (opciones: { to: string }) => ({
      messageId: '<prueba-123@smtp.gmail.com>',
      accepted: [opciones.to],
      rejected: [],
    }));
    const { transporte } = crearEntornoSmtpReal(sendMail);
    const espiaDispatch = vi.spyOn(DispatcherNotificaciones.prototype, 'dispatch');
    const espiaReintentar = vi.spyOn(DispatcherNotificaciones.prototype, 'reintentar');

    const { baseUrl, espiaFirestore } = await levantarServidor({ transporte });

    // Caso A: envío al correo verificado del administrador (por defecto al omitir `destinatario`)
    const resAdmin = await fetch(`${baseUrl}${RUTA_PROBAR_SMTP}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-admin', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(resAdmin.status).toBe(200);
    const bodyAdmin = await resAdmin.json();
    expect(bodyAdmin).toEqual({
      ok: true,
      etapa: 'aceptado_smtp',
      proveedor: 'SMTP',
      desde: EMAIL_BUZON_DESPACHO,
      destinatario: EMAIL_ADMIN,
      externalId: '<prueba-123@smtp.gmail.com>',
      aceptadoPorServidorSmtp: true,
      entregaBuzonConfirmada: false,
      avisoEntrega: AVISO_ENTREGA_BUZON_SMTP,
      enviadoEn: AHORA_FIJO.toISOString(),
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: DESDE_DESPACHO,
        to: EMAIL_ADMIN,
        subject: ASUNTO_PRUEBA_SMTP,
        replyTo: EMAIL_REPLY_TO,
      }),
    );

    // Caso B: envío explícito al buzón propio del despacho
    const resDespacho = await fetch(`${baseUrl}${RUTA_PROBAR_SMTP}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-admin', 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinatario: EMAIL_BUZON_DESPACHO }),
    });
    expect(resDespacho.status).toBe(200);
    const bodyDespacho = await resDespacho.json();
    expect(bodyDespacho).toMatchObject({
      ok: true,
      etapa: 'aceptado_smtp',
      destinatario: EMAIL_BUZON_DESPACHO,
      aceptadoPorServidorSmtp: true,
      entregaBuzonConfirmada: false,
    });
    expect(sendMail).toHaveBeenCalledTimes(2);

    // Garantía de cero escrituras en Firestore y cero llamadas al DispatcherNotificaciones
    expect(espiaDispatch).not.toHaveBeenCalled();
    expect(espiaReintentar).not.toHaveBeenCalled();
    expect(espiaFirestore.crearDocumento).not.toHaveBeenCalled();
    expect(espiaFirestore.actualizarCampos).not.toHaveBeenCalled();
    expect(espiaFirestore.leerDocumento).not.toHaveBeenCalled();
    expect(JSON.stringify(bodyAdmin)).not.toContain(SECRETO_SMTP_SINTETICO);
  });

  it('6. fallos de SMTP (conexión, autenticación y rechazo de destinatario): distingue etapas y jamás filtra credenciales', async () => {
    // 6a. Fallo de conexión (ECONNECTION)
    const sendMailConexion = vi.fn(async () => {
      throw Object.assign(new Error(`connect ECONNREFUSED ${URL_SMTP_SINTETICA}`), { code: 'ECONNECTION' });
    });
    const srvConexion = await levantarServidor({
      transporte: crearEntornoSmtpReal(sendMailConexion).transporte,
    });
    const rConexion = await fetch(`${srvConexion.baseUrl}${RUTA_PROBAR_SMTP}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-admin', 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinatario: EMAIL_ADMIN }),
    });
    expect(rConexion.status).toBe(502);
    const bConexion = await rConexion.json();
    expect(bConexion).toMatchObject({
      ok: false,
      etapa: 'conexion',
      error: 'smtp_error: smtp.gmail.com: ECONNECTION',
      aceptadoPorServidorSmtp: false,
      entregaBuzonConfirmada: false,
    });
    expect(JSON.stringify(bConexion)).not.toContain(SECRETO_SMTP_SINTETICO);
    await srvConexion.cerrar();
    servidorActivo = null;

    // 6b. Fallo de autenticación (EAUTH 535)
    const sendMailAuth = vi.fn(async () => {
      throw Object.assign(
        new Error(`Invalid login: 535-5.7.8 Username ${USUARIO_SMTP_SINTETICO} and Password ${SECRETO_SMTP_SINTETICO} not accepted`),
        { code: 'EAUTH', responseCode: 535 },
      );
    });
    const srvAuth = await levantarServidor({
      transporte: crearEntornoSmtpReal(sendMailAuth).transporte,
    });
    const rAuth = await fetch(`${srvAuth.baseUrl}${RUTA_PROBAR_SMTP}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-admin', 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinatario: EMAIL_ADMIN }),
    });
    expect(rAuth.status).toBe(502);
    const bAuth = await rAuth.json();
    expect(bAuth).toMatchObject({
      ok: false,
      etapa: 'autenticacion',
      error: 'smtp_error: smtp.gmail.com: EAUTH (535)',
      aceptadoPorServidorSmtp: false,
      entregaBuzonConfirmada: false,
    });
    expect(JSON.stringify(bAuth)).not.toContain(SECRETO_SMTP_SINTETICO);
    await srvAuth.cerrar();
    servidorActivo = null;

    // 6c. Rechazo del destinatario por el servidor SMTP (accepted vacío / rejected)
    const sendMailRechazo = vi.fn(async () => ({
      messageId: '<id-local>',
      accepted: [],
      rejected: [EMAIL_ADMIN],
    }));
    const srvRechazo = await levantarServidor({
      transporte: crearEntornoSmtpReal(sendMailRechazo).transporte,
    });
    const rRechazo = await fetch(`${srvRechazo.baseUrl}${RUTA_PROBAR_SMTP}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-admin', 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinatario: EMAIL_ADMIN }),
    });
    expect(rRechazo.status).toBe(502);
    const bRechazo = await rRechazo.json();
    expect(bRechazo).toMatchObject({
      ok: false,
      etapa: 'rechazo_smtp',
      error: 'smtp_destinatario_no_aceptado',
      aceptadoPorServidorSmtp: false,
      entregaBuzonConfirmada: false,
    });
    expect(srvRechazo.espiaFirestore.crearDocumento).not.toHaveBeenCalled();
  });

  it('7. protege contra solicitudes repetidas con ventana móvil (429 + Retry-After) sin volver a invocar SMTP', async () => {
    const sendMail = vi.fn(async (opciones: { to: string }) => ({
      messageId: '<ok-1>',
      accepted: [opciones.to],
      rejected: [],
    }));
    const { transporte } = crearEntornoSmtpReal(sendMail);
    const { baseUrl } = await levantarServidor({
      transporte,
      maxIntentosVentana: 1,
      ventanaMs: 60_000,
    });

    const primera = await fetch(`${baseUrl}${RUTA_PROBAR_SMTP}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-admin', 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinatario: EMAIL_ADMIN }),
    });
    expect(primera.status).toBe(200);

    const repetida = await fetch(`${baseUrl}${RUTA_PROBAR_SMTP}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-admin', 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinatario: EMAIL_ADMIN }),
    });
    expect(repetida.status).toBe(429);
    expect(repetida.headers.get('retry-after')).toBe('60');
    expect(await repetida.json()).toMatchObject({
      ok: false,
      etapa: 'solicitud',
      error: 'limite_frecuencia',
      reintentarEnSegundos: 60,
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('8. guardia estática: rutaPruebaSmtp.ts no importa ni invoca DispatcherNotificaciones, repositorio de notificaciones ni relojAvisos, y está montada en server.ts', () => {
    expect(RUTA_SRC).not.toContain('DispatcherNotificaciones');
    expect(RUTA_SRC).not.toContain('repositorioNotificacionesFirestore');
    expect(RUTA_SRC).not.toContain('notificaciones_entregas');
    expect(RUTA_SRC).not.toContain('ejecutarRelojAvisos');
    expect(RUTA_SRC).not.toContain('crearDocumento');
    expect(RUTA_SRC).not.toContain('actualizarCampos');
    expect(SERVER_SRC).toContain('montarRutaPruebaSmtp(app,');
  });
});
