/**
 * FASE 6 — SEGUIMIENTO DE INCIDENCIAS DE PUNTA A PUNTA (app REAL, sin red)
 * =======================================================================
 * Se levanta la aplicación real (`server.ts` como en Vercel) con una credencial
 * de servicio sintética y un Firestore REST simulado en memoria: la prueba
 * recorre el ciclo completo con HTTP real y tokens firmados RS256.
 *
 *   · el inquilino sincroniza su incidencia → hilo + aviso a la propiedad con
 *     estado REAL de entrega (safe-mode de email ⇒ NO_ENVIADA, nunca «enviado»);
 *   · repetir la sincronización no escribe ni avisa (idempotente);
 *   · otro inquilino NO puede tocar ni leer la incidencia ajena (403);
 *   · la gestión cambia el estado → evento nuevo + aviso al inquilino entregado
 *     por bandeja interna (INAPP) y visible en `GET /api/incidencias/seguimiento`;
 *   · el escalado urgente avisa a propiedad/administración una sola vez;
 *   · nada de esto es una operación de IA: no hay documentos en `ia_operaciones`
 *     ni consumo de cuotas/créditos.
 */
import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { codificarValor } from '../server/titularidades/googleBackend';

const RAIZ = resolve(__dirname, '..');
const aplicacion = JSON.parse(readFileSync(join(RAIZ, 'firebase-applet-config.json'), 'utf8')) as {
  projectId: string;
  firestoreDatabaseId: string;
};

const parUsuario = generateKeyPairSync('rsa', { modulusLength: 2048 });
const parCuenta = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'kid-fase6-seguimiento';
const publicPemUsuario = parUsuario.publicKey.export({ type: 'spki', format: 'pem' }).toString();

function b64url(entrada: Buffer | string): string {
  const buf = typeof entrada === 'string' ? Buffer.from(entrada, 'utf8') : entrada;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function firmarToken(sub: string, email: string): string {
  const { createSign } = require('node:crypto') as typeof import('node:crypto');
  const ahora = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: KID };
  const payload = {
    iss: `https://securetoken.google.com/${aplicacion.projectId}`,
    aud: aplicacion.projectId,
    sub,
    email,
    iat: ahora - 30,
    exp: ahora + 3600,
  };
  const firmable = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const firma = createSign('RSA-SHA256').update(firmable).sign(parUsuario.privateKey);
  return `${firmable}.${b64url(firma)}`;
}

describe('Fase 6 · seguimiento de incidencias de punta a punta', () => {
  const documentosFirestore = new Map<string, { fields: Record<string, unknown>; updateTime?: string }>();
  let relojDocumentos = 0;
  const updateTimeNuevo = () => `2026-10-16T12:00:${String(++relojDocumentos).padStart(2, '0')}.000000Z`;
  let servidor: Server;
  let base = '';
  const fetchReal = globalThis.fetch;
  const VARIABLES = [
    'VERCEL',
    'FIREBASE_SERVICE_ACCOUNT',
    'FIREBASE_SERVICE_ACCOUNT_B64',
    'FIREBASE_SERVICE_ACCOUNT_PATH',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GEMINI_API_KEY',
    'IA_POLITICA_JSON',
    'ENABLE_EMAIL',
  ] as const;
  const previas: Record<string, string | undefined> = {};

  const tokenInquilina = firmarToken('uid-ines', 'ines.privada@example.com');
  const tokenPropietario = firmarToken('uid-pedro', 'pedro.privado@example.com');
  const tokenAjena = firmarToken('uid-marta', 'marta.privada@example.com');

  const clavesDocumentos = () => [...documentosFirestore.keys()].sort();

  async function llamar(ruta: string, opciones: { metodo?: string; token?: string; cuerpo?: unknown } = {}) {
    return fetchReal(`${base}${ruta}`, {
      method: opciones.metodo ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(opciones.token ? { Authorization: `Bearer ${opciones.token}` } : {}),
      },
      ...(opciones.cuerpo ? { body: JSON.stringify(opciones.cuerpo) } : {}),
    });
  }

  async function sincronizar(token: string, cuerpo: Record<string, unknown> = { incidenciaId: 'inc-1' }) {
    return llamar('/api/incidencias/seguimiento/sincronizar', { metodo: 'POST', token, cuerpo });
  }

  /** Simula la escritura de la gestión directamente en la fuente autorizada. */
  function cambiarIncidencia(cambios: Record<string, unknown>): void {
    const doc = documentosFirestore.get('incidencias/inc-1');
    if (!doc) throw new Error('sin incidencia sembrada');
    doc.updateTime = updateTimeNuevo();
    const codificados = (codificarValor(cambios) as { mapValue: { fields: Record<string, unknown> } }).mapValue.fields;
    doc.fields = { ...doc.fields, ...codificados };
  }

  /** Documentos de un prefijo (para comparar sin depender del orden). */
  const clavesDe = (prefijo: string) => clavesDocumentos().filter((k) => k.startsWith(prefijo));

  /** Eventos registrados en el hilo de la incidencia (leído de la fuente). */
  function eventosDelHilo(): Array<{ tipo: string; entrega?: { estado: string; notificacionId?: string } }> {
    const doc = documentosFirestore.get('incidencias_seguimiento/inc-1');
    const eventos = doc?.fields.eventos as { arrayValue?: { values?: Array<{ mapValue?: { fields?: Record<string, unknown> } }> } } | undefined;
    return (eventos?.arrayValue?.values ?? []).map((v) => {
      const campos = v.mapValue?.fields ?? {};
      const tipo = (campos.tipo as { stringValue?: string } | undefined)?.stringValue ?? '';
      const entregaCruda = campos.entrega as { mapValue?: { fields?: Record<string, unknown> } } | undefined;
      const camposEntrega = entregaCruda?.mapValue?.fields;
      return {
        tipo,
        ...(camposEntrega
          ? {
              entrega: {
                estado: (camposEntrega.estado as { stringValue?: string } | undefined)?.stringValue ?? '',
                ...((camposEntrega.notificacionId as { stringValue?: string } | undefined)?.stringValue
                  ? { notificacionId: (camposEntrega.notificacionId as { stringValue?: string }).stringValue }
                  : {}),
              },
            }
          : {}),
      };
    });
  }

  beforeAll(async () => {
    const { reiniciarCacheCertificados, reiniciarCacheTokens } = await import('../server/titularidades/googleBackend');
    for (const v of VARIABLES) previas[v] = process.env[v];
    process.env.VERCEL = '1';
    delete process.env.GEMINI_API_KEY;
    delete process.env.IA_POLITICA_JSON;
    delete process.env.ENABLE_EMAIL; // el email sigue en safe-mode: nunca finge entrega
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
      project_id: aplicacion.projectId,
      client_email: `sa@${aplicacion.projectId}.iam.gserviceaccount.com`,
      private_key: parCuenta.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    });
    reiniciarCacheCertificados();
    reiniciarCacheTokens();

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('securetoken@system.gserviceaccount.com')) {
        return new Response(JSON.stringify({ [KID]: publicPemUsuario }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
        });
      }
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'oauth2-fase6', expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('firestore.googleapis.com/v1/')) {
        const u = new URL(url);
        const metodo = (init?.method || 'GET').toUpperCase();
        const mDocumento = /\/documents\/([^/?]+)\/([^/?]+)$/.exec(u.pathname);
        const mColeccion = /\/documents\/([^/?]+)$/.exec(u.pathname);
        if (metodo === 'POST' && mColeccion && u.searchParams.has('documentId')) {
          const clave = `${mColeccion[1]}/${decodeURIComponent(u.searchParams.get('documentId') || '')}`;
          if (documentosFirestore.has(clave)) {
            return new Response(JSON.stringify({ error: { status: 'ALREADY_EXISTS' } }), { status: 409 });
          }
          const body = JSON.parse(String(init?.body || '{}')) as { fields?: Record<string, unknown> };
          const updateTime = updateTimeNuevo();
          documentosFirestore.set(clave, { fields: { ...(body.fields || {}) }, updateTime });
          return new Response(JSON.stringify({ name: clave, fields: body.fields || {}, updateTime }), { status: 200 });
        }
        if (metodo === 'PATCH' && mDocumento) {
          const clave = decodeURIComponent(mDocumento[0].split('/documents/')[1]);
          const actual = documentosFirestore.get(clave);
          if (!actual) return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
          const casEsperado = u.searchParams.get('currentDocument.updateTime');
          if (casEsperado && casEsperado !== actual.updateTime) {
            return new Response(JSON.stringify({ error: { code: 409, status: 'ABORTED' } }), { status: 409 });
          }
          const body = JSON.parse(String(init?.body || '{}')) as { fields?: Record<string, unknown> };
          const mascaras = u.searchParams.getAll('updateMask.fieldPaths');
          const nuevos = body.fields || {};
          for (const campo of mascaras) {
            if (campo in nuevos) actual.fields[campo] = nuevos[campo];
          }
          actual.updateTime = updateTimeNuevo();
          return new Response(JSON.stringify({ name: clave, fields: actual.fields, updateTime: actual.updateTime }), { status: 200 });
        }
        if (metodo === 'GET' && mDocumento) {
          const clave = decodeURIComponent(mDocumento[0].split('/documents/')[1]);
          const actual = documentosFirestore.get(clave);
          if (!actual) return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
          return new Response(JSON.stringify({ name: clave, fields: actual.fields, updateTime: actual.updateTime }), { status: 200 });
        }
      }
      return fetchReal(input, init);
    }) as typeof fetch;

    // Semilla: inquilina con contrato, propiedad y la incidencia creada por ella.
    const campos = (datos: Record<string, unknown>) =>
      (codificarValor(datos) as { mapValue: { fields: Record<string, unknown> } }).mapValue.fields;
    documentosFirestore.set('usuarios_auth/uid-ines', { fields: campos({ usuarioId: 'usuario-ines', estado: 'ACTIVO', tipoPerfil: 'INQUILINO' }) });
    documentosFirestore.set('usuarios/usuario-ines', { fields: campos({ authUid: 'uid-ines', estado: 'ACTIVO', tipoPerfil: 'INQUILINO', contratoIds: ['contrato-ines'] }) });
    documentosFirestore.set('usuarios_auth/uid-pedro', { fields: campos({ usuarioId: 'usuario-pedro', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO' }) });
    documentosFirestore.set('usuarios/usuario-pedro', { fields: campos({ authUid: 'uid-pedro', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-1' }) });
    documentosFirestore.set('usuarios_auth/uid-marta', { fields: campos({ usuarioId: 'usuario-marta', estado: 'ACTIVO', tipoPerfil: 'INQUILINO' }) });
    documentosFirestore.set('usuarios/usuario-marta', { fields: campos({ authUid: 'uid-marta', estado: 'ACTIVO', tipoPerfil: 'INQUILINO', contratoIds: ['contrato-marta'] }) });
    documentosFirestore.set('contratos_formalizacion/contrato-ines', {
      fields: campos({ id: 'contrato-ines', inmuebleId: 'inm-1', propietarioId: 'prop-1', inquilinoId: 'usuario-ines', candidatoNombre: 'Inés Privada', candidatoEmail: 'ines.privada@example.com', estado: 'ACTIVO' }),
    });
    documentosFirestore.set('propietarios/prop-1', { fields: campos({ id: 'prop-1', nombre: 'Propietaria Uno', email: 'propietaria@example.com' }) });
    documentosFirestore.set('incidencias/inc-1', {
      fields: campos({
        id: 'inc-1',
        titulo: 'Fuga bajo el lavabo',
        descripcion: 'Gotea la tubería desde ayer',
        categoria: 'FONTANERIA',
        prioridad: 'ALTA',
        estado: 'ABIERTA',
        contratoId: 'contrato-ines',
        contratoIdsVisibles: ['contrato-ines'],
        inmuebleId: 'inm-1',
        inmuebleDireccion: 'Calle Mayor 1',
        propietarioId: 'prop-1',
        notasInternas: 'NOTA INTERNA CONFIDENCIAL',
        fechaCreacion: '2026-10-16T07:00:00.000Z',
        fechaActualizacion: '2026-10-16T07:00:00.000Z',
        fotografias: [],
      }),
    });

    const { default: app } = await import('../server');
    servidor = app.listen(0, '127.0.0.1');
    await once(servidor, 'listening');
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    globalThis.fetch = fetchReal;
    await new Promise<void>((r) => (servidor ? servidor.close(() => r()) : r()));
    for (const v of VARIABLES) {
      if (previas[v] === undefined) delete process.env[v];
      else process.env[v] = previas[v];
    }
  });

  it('exige sesión: sin token no se lee ni se sincroniza (401)', async () => {
    const lectura = await llamar('/api/incidencias/seguimiento?incidenciaId=inc-1');
    expect(lectura.status).toBe(401);
    const sincro = await sincronizar('');
    expect(sincro.status).toBe(401);
    expect(clavesDocumentos().some((k) => k.startsWith('incidencias_seguimiento/'))).toBe(false);
  });

  it('el inquilino sincroniza su incidencia: hilo creado y aviso a la propiedad con entrega real', async () => {
    const respuesta = await sincronizar(tokenInquilina);
    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as { estado: string; eventos: Array<{ tipo: string; entrega: { estado: string; canal: string } | null }> };
    expect(cuerpo.estado).toBe('OK');
    expect(cuerpo.eventos.map((e) => e.tipo)).toEqual(['INCIDENCIA_CREADA']);
    expect(cuerpo.eventos[0].entrega).toEqual({ estado: 'NO_ENVIADA', canal: 'EMAIL' });

    // El hilo es un único documento con el estado real de la entrega.
    const hilo = [...documentosFirestore.keys()].filter((k) => k.startsWith('incidencias_seguimiento/'));
    expect(hilo).toEqual(['incidencias_seguimiento/inc-1']);
    const serializado = JSON.stringify(documentosFirestore.get('incidencias_seguimiento/inc-1'));
    expect(serializado).not.toContain('CONFIDENCIAL');
    expect(serializado).not.toContain('example.com');
    expect(serializado).not.toContain('Gotea');

    // La notificación queda persistida con su estado real (safe-mode ⇒ FALLIDA).
    const notificaciones = [...documentosFirestore.keys()].filter((k) => k.startsWith('notificaciones/'));
    expect(notificaciones).toEqual(['notificaciones/not_ev_incidencia_nueva_inc-1']);
    const doc = documentosFirestore.get('notificaciones/not_ev_incidencia_nueva_inc-1');
    const estado = (doc?.fields.estado as { stringValue?: string } | undefined)?.stringValue;
    expect(estado).toBe('FALLIDA');
  });

  it('repetir la sincronización no añade eventos ni notificaciones; sólo reintenta el aviso pendiente sin duplicarlo', async () => {
    const notificacionesAntes = clavesDe('notificaciones/');
    const idNotificacionAntes = eventosDelHilo()[0]?.entrega?.notificacionId;
    const respuesta = await sincronizar(tokenInquilina);
    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as { estado: string; eventos: unknown[]; reintentos: number };
    expect(cuerpo.estado).toBe('SIN_CAMBIOS');
    expect(cuerpo.eventos).toEqual([]);
    // El hilo sigue con un único evento y la MISMA notificación (nada duplicado).
    const eventos = eventosDelHilo();
    expect(eventos.map((e) => e.tipo)).toEqual(['INCIDENCIA_CREADA']);
    expect(eventos[0].entrega?.notificacionId).toBe(idNotificacionAntes);
    expect(clavesDe('notificaciones/')).toEqual(notificacionesAntes);
    // El reintento seguro del aviso pendiente sí deja traza de su intento.
    expect(cuerpo.reintentos).toBe(1);
    expect(clavesDe('notificaciones_entregas/')).toContain(
      'notificaciones_entregas/not_ev_incidencia_nueva_inc-1__2__enviando',
    );
  });

  it('otro inquilino no puede sincronizar ni leer la incidencia ajena (403) y no hay escrituras', async () => {
    const antes = clavesDocumentos();
    const sincro = await sincronizar(tokenAjena);
    expect(sincro.status).toBe(403);
    expect(await sincro.json()).toMatchObject({ codigo: 'INCIDENCIA_NO_AUTORIZADA' });
    const lectura = await llamar('/api/incidencias/seguimiento?incidenciaId=inc-1', { token: tokenAjena });
    expect(lectura.status).toBe(403);
    // Ninguna escritura, ni siquiera un reintento de avisos.
    expect(clavesDocumentos()).toEqual(antes);
  });

  it('la gestión cambia el estado: evento nuevo, aviso al inquilino por bandeja interna y evolución legible', async () => {
    cambiarIncidencia({ estado: 'EN_REPARACION', fechaActualizacion: '2026-10-16T12:30:00.000Z' });
    const respuesta = await sincronizar(tokenPropietario);
    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as { estado: string; eventos: Array<{ tipo: string; entrega: { estado: string; canal: string } | null }> };
    expect(cuerpo.estado).toBe('OK');
    expect(cuerpo.eventos.map((e) => e.tipo)).toEqual(['INCIDENCIA_ESTADO_CAMBIADO']);
    expect(cuerpo.eventos[0].entrega).toEqual({ estado: 'ENVIADA', canal: 'INAPP' });

    // El inquilino ve la evolución por HTTP, sin datos internos ni de terceros.
    const lectura = await llamar('/api/incidencias/seguimiento?incidenciaId=inc-1', { token: tokenInquilina });
    expect(lectura.status).toBe(200);
    const visto = (await lectura.json()) as { pasos: Array<{ etiqueta: string; detalle?: string; notificacion?: string }> };
    expect(visto.pasos.map((p) => p.etiqueta)).toEqual(['Cambio de estado', 'Incidencia registrada']);
    expect(visto.pasos[0].detalle).toBe('ABIERTA → EN_REPARACION');
    expect(visto.pasos[0].notificacion).toBe('Aviso entregado');
    const serializado = JSON.stringify(visto);
    expect(serializado).not.toContain('CONFIDENCIAL');
    expect(serializado).not.toContain('example.com');
  });

  it('una prioridad urgente sin asignar escala la incidencia y avisa a propiedad/administración (una sola vez)', async () => {
    cambiarIncidencia({ prioridad: 'URGENTE', fechaActualizacion: '2026-10-16T13:00:00.000Z' });
    const primera = await sincronizar(tokenPropietario);
    const cuerpo = (await primera.json()) as { eventos: Array<{ tipo: string; requiereAtencion: boolean }> };
    expect(cuerpo.eventos.map((e) => e.tipo)).toEqual(['INCIDENCIA_PRIORIDAD_CAMBIADA', 'INCIDENCIA_ESCALADA']);
    expect(cuerpo.eventos[1].requiereAtencion).toBe(true);
    const notificaciones = [...documentosFirestore.keys()].filter((k) => k.startsWith('notificaciones/')).sort();
    expect(notificaciones).toContain('notificaciones/not_ev_incidencia_escalada_urgente_sin_asignar_inc-1');

    // Segunda pasada: ni evento nuevo ni escalado repetido.
    const notificacionesAntes = clavesDe('notificaciones/');
    const segunda = await sincronizar(tokenPropietario);
    const cuerpo2 = (await segunda.json()) as { estado: string };
    expect(cuerpo2.estado).toBe('SIN_CAMBIOS');
    expect(clavesDe('notificaciones/')).toEqual(notificacionesAntes);
    expect(eventosDelHilo().map((e) => e.tipo)).toEqual([
      'INCIDENCIA_CREADA',
      'INCIDENCIA_ESTADO_CAMBIADO',
      'INCIDENCIA_PRIORIDAD_CAMBIADA',
      'INCIDENCIA_ESCALADA',
    ]);
  });

  it('el seguimiento no es una operación de IA: no hay registro de operaciones ni consumo de créditos', () => {
    expect(clavesDocumentos().some((k) => k.startsWith('ia_operaciones/'))).toBe(false);
    expect(clavesDocumentos().some((k) => k.startsWith('ia_cuentas/'))).toBe(false);
    expect(clavesDocumentos().some((k) => k.startsWith('ia_incidencias_trazas/'))).toBe(false);
  });

  it('un identificador de incidencia ausente o inválido se rechaza antes de tocar datos', async () => {
    const sinId = await llamar('/api/incidencias/seguimiento/sincronizar', { metodo: 'POST', token: tokenInquilina, cuerpo: {} });
    expect(sinId.status).toBe(400);
    expect(await sinId.json()).toMatchObject({ codigo: 'PETICION_INVALIDA' });
    const raro = await llamar('/api/incidencias/seguimiento/sincronizar', {
      metodo: 'POST',
      token: tokenInquilina,
      cuerpo: { incidenciaId: '../../secretos/otro' },
    });
    expect(raro.status).toBe(400);
  });
});
