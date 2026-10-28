import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as google from '../server/titularidades/googleBackend';
import { OPERACIONES_IA } from '../src/ia/catalogoOperacionesIA';
import { crearDependenciasNucleoIA } from '../server/ia/configuracionIA';
import { crearNucleoIA } from '../server/ia/nucleoIA';
import express from 'express';

const config = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const fetchHttp = globalThis.fetch;

describe('app real: un proyecto incompatible no derriba HTTP ni permite operaciones', () => {
  let servidor: Server;
  let base: string;
  let llamadasGoogle: ReturnType<typeof vi.fn>;
  const acceso = vi.fn(() => { throw new Error('Acceso Firebase inesperado'); });
  const secretos = ['proyecto-ajeno-prueba', 'correo-solo-prueba', 'material-privado-solo-prueba'];
  const logs: unknown[][] = [];

  beforeAll(async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('FIREBASE_PROJECT_ID', undefined);
    vi.stubEnv('FIRESTORE_DATABASE_ID', undefined);
    vi.spyOn(google, 'leerCuentaServicio').mockReturnValue({
      project_id: secretos[0], client_email: secretos[1], private_key: secretos[2],
    });
    vi.spyOn(google, 'verificarIdToken').mockImplementation(acceso);
    for (const metodo of ['leerDocumento', 'leer', 'consultarPrefijo', 'crearDocumento', 'actualizarCampos'] as const) {
      vi.spyOn(google.ClienteFirestoreRest.prototype, metodo).mockImplementation(acceso);
    }
    llamadasGoogle = vi.fn(async () => { throw new Error('Red externa prohibida en esta prueba'); });
    vi.stubGlobal('fetch', llamadasGoogle);
    vi.spyOn(console, 'warn').mockImplementation((...args) => { logs.push(args); });
    vi.spyOn(console, 'info').mockImplementation((...args) => { logs.push(args); });
    vi.spyOn(console, 'error').mockImplementation((...args) => { logs.push(args); });
    // La importación ejecuta la inicialización real del núcleo y todas las rutas.
    const { default: app } = await import('../server');
    servidor = app.listen(0, '127.0.0.1');
    await once(servidor, 'listening');
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    if (servidor) await new Promise<void>((resolve) => servidor.close(() => resolve()));
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('arranca y health responde 200 con un código de bloqueo, sin secretos', async () => {
    const respuesta = await fetchHttp(`${base}/api/health`);
    expect(respuesta.status).toBe(200);
    const json = await respuesta.json();
    // P0.1: health añade `capacidades` y `configuracion`; se comprueba el
    // contrato histórico con toMatchObject y que los campos nuevos no filtran.
    expect(json).toMatchObject({
      status: 'ok', geminiKeyConfigured: false,
      ia: { registro: 'NO_CONFIGURADO', gobierno: 'NO_CONFIGURADO', llaves: 'NO_CONFIGURADO', titularidad: 'BLOQUEADA', autenticacion: 'TOKEN_FIREBASE', operaciones: 12, errorConfiguracion: 'FIREBASE_PROYECTO_INCOMPATIBLE' },
      // FASE A · estado del transporte de avisos y del reloj, sin secretos.
      notificaciones: { email: { modo: 'MODO_SEGURO', proveedor: null }, cron: { configurado: false } },
      esquemaDiagnostico: 1,
    });
    expect(json.capacidades).toBeTypeOf('object');
    expect(json.configuracion.master.overrideConfigurado).toBe(false);
    for (const secreto of secretos) expect(JSON.stringify(json)).not.toContain(secreto);
  });

  it('AG-04: el almacén temporal de documentos está retirado — ninguna ruta acepta ni sirve binarios (410 explícito)', async () => {
    const descarga = await fetchHttp(`${base}/api/documents/no-existe-prueba`);
    expect(descarga.status).toBe(410);
    expect(await descarga.json()).toMatchObject({ ok: false, codigo: 'ALMACEN_TEMPORAL_RETIRADO' });

    const texto = 'Documento sintetico de prueba local';
    const carga = await fetchHttp(`${base}/api/upload-document`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: Buffer.from(texto).toString('base64'), filename: 'prueba.txt', mimeType: 'text/plain' }),
    });
    expect(carga.status).toBe(410);
    const json = await carga.json();
    expect(json).toMatchObject({ ok: false, codigo: 'ALMACEN_TEMPORAL_RETIRADO' });
    // Nunca vuelve a fabricarse una referencia `server_*` ni una URL de capacidad.
    expect(json.url).toBeUndefined();
    expect(json.storagePath).toBeUndefined();
    expect(json.success).toBeUndefined();
    expect(acceso).not.toHaveBeenCalled();
    expect(llamadasGoogle).not.toHaveBeenCalled();
  });

  it('AG-04: el análisis IA sólo descarga documentos desde el host oficial de Storage (nunca es un proxy genérico)', async () => {
    const { esUrlDescargaStorageFirebase } = await import('../server');
    expect(esUrlDescargaStorageFirebase('https://firebasestorage.googleapis.com/v0/b/bucket/o/x.pdf?alt=media&token=t')).toBe(true);
    expect(esUrlDescargaStorageFirebase('https://storage.googleapis.com/bucket/x.pdf')).toBe(true);
    expect(esUrlDescargaStorageFirebase('http://firebasestorage.googleapis.com/v0/b/bucket/o/x.pdf')).toBe(false);
    expect(esUrlDescargaStorageFirebase('https://evil.example/firebasestorage.googleapis.com/x.pdf')).toBe(false);
    expect(esUrlDescargaStorageFirebase('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(esUrlDescargaStorageFirebase('/api/documents/doc_0000')).toBe(false);
    expect(esUrlDescargaStorageFirebase(undefined)).toBe(false);
  });

  it.each(OPERACIONES_IA)('$ruta rechaza antes del manejador, incluso con token e idempotencia', async ({ ruta }) => {
    const respuesta = await fetchHttp(`${base}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-no-usado', 'Idempotency-Key': 'prueba-bloqueo-0001' },
      body: '{}',
    });
    expect(respuesta.status).toBe(503);
    expect(await respuesta.json()).toEqual({ codigo: 'FIREBASE_PROYECTO_INCOMPATIBLE', error: 'Configuración Firebase no disponible o inválida. Operación no ejecutada.' });
    expect(acceso).not.toHaveBeenCalled();
    expect(llamadasGoogle).not.toHaveBeenCalled();
  });

  it('titulares devuelve un error 503 identificable y no consulta Firebase', async () => {
    const respuesta = await fetchHttp(`${base}/api/titulares/buscar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-no-usado' },
      body: JSON.stringify({ inmuebleId: 'inmueble-prueba', termino: 'prueba' }),
    });
    expect(respuesta.status).toBe(503);
    expect(await respuesta.json()).toEqual({ ok: false, error: 'configuracion_proyecto_incompatible', codigoConfiguracion: 'FIREBASE_PROYECTO_INCOMPATIBLE', detalle: 'Configuración Firebase incompatible. Operación no ejecutada.' });
    expect(acceso).not.toHaveBeenCalled();
    expect(llamadasGoogle).not.toHaveBeenCalled();
    for (const secreto of secretos) expect(JSON.stringify(logs)).not.toContain(secreto);
  });
});

describe('defensa del middleware y configuración válida', () => {
  it('un bloqueo explícito impide ejecutar el manejador y todos los puertos', async () => {
    const noEjecutar = vi.fn(async () => { throw new Error('No debe ejecutarse'); });
    const manejador = vi.fn((_req, res) => { res.json({ indebido: true }); });
    const nucleo = crearNucleoIA({
      errorConfiguracion: 'FIREBASE_PROYECTO_INCOMPATIBLE',
      verificarToken: noEjecutar,
      registro: { tipo: 'FIRESTORE', reservar: noEjecutar, completar: noEjecutar },
      crearClienteProveedor: noEjecutar as any, log: () => {},
    });
    const app = express();
    app.post('/prueba', nucleo.operacion('REDACTAR_CLAUSULA'), manejador);
    const servidor = app.listen(0, '127.0.0.1');
    try {
      await once(servidor, 'listening');
      const respuesta = await fetchHttp(`http://127.0.0.1:${(servidor.address() as AddressInfo).port}/prueba`, { method: 'POST' });
      expect(respuesta.status).toBe(503);
      expect(noEjecutar).not.toHaveBeenCalled();
      expect(manejador).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => servidor.close(() => resolve()));
    }
  });

  it('la cuenta del proyecto esperado conserva el registro Firestore sin error', () => {
    const spy = vi.spyOn(google, 'leerCuentaServicio').mockReturnValue({ project_id: config.projectId, client_email: '', private_key: '' });
    try {
      const deps = crearDependenciasNucleoIA({ VERCEL: '1' });
      expect(deps.errorConfiguracion).toBeUndefined();
      expect(deps.configuracion).toMatchObject({ proyectoId: config.projectId, baseDatosId: config.firestoreDatabaseId, modoRegistro: 'FIRESTORE' });
      // Sin IA_POLITICA_JSON la política es POR_DEFECTO ⇒ aprobación comercial
      // pendiente ⇒ el estado expone el bloqueo preventivo (503 en operaciones).
      expect(crearNucleoIA(deps).estado()).toEqual({ registro: 'FIRESTORE', gobierno: 'FIRESTORE', llaves: 'NO_CONFIGURADO', titularidad: 'POR_OPERACION', bloqueoComercial: 'APROBACION_PENDIENTE', autenticacion: 'TOKEN_FIREBASE', operaciones: 12 });
    } finally {
      spy.mockRestore();
    }
  });
});
