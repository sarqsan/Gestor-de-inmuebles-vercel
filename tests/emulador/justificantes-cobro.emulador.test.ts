import express from 'express';
import { createServer, type Server } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ImplementacionFetch } from '../../server/titularidades/googleBackend';
import { crearServicioJustificantesCobro } from '../../server/cobros/justificantesCobro';
import { montarRutasJustificantesCobro } from '../../server/cobros/rutasJustificantesCobro';
import {
  BASE_DATOS_P2,
  BUCKET_P2,
  crearCuentaAuthEmulador,
  crearFirestoreP2,
  crearStorageP2,
  borrarCuentaAuthEmulador,
  fetchSoloEmuladores,
  validarEntornoP2,
  verificarTokenAuthEmulador,
  type CuentaAuthEmulador,
} from './justificantes-cobro.emulador-util';

const COLECCION_P2 = 'justificantes_cobro';
const COLECCION_AUDITORIA = 'justificantes_cobro_auditoria';
const PDF = Buffer.from('%PDF-1.4\nRecibo sintetico P2\n%%EOF\n', 'ascii');
const runId = randomUUID().replace(/-/g, '');
const usuarioInquilinoId = `p2-tenant-${runId}`;
const usuarioPropietarioId = `p2-owner-${runId}`;
const usuarioAjenoId = `p2-outsider-${runId}`;
const propietarioId = `p2-owner-property-${runId}`;
const contratoId = `p2-contract-${runId}`;
const cobroPeriodoId = `p2-period-${runId}`;
const contratoAjenoId = `p2-other-contract-${runId}`;
const cobroAjenoId = `p2-other-period-${runId}`;
const contratoErrorStorageId = `p2-storage-error-${runId}`;
const cobroErrorStorageId = `p2-storage-period-${runId}`;
const candidatoAjenoId = `p2-nonlinked-tenant-${runId}`;

let inquilino: CuentaAuthEmulador;
let propietario: CuentaAuthEmulador;
let actorAjeno: CuentaAuthEmulador;
const servidores: Server[] = [];
let puertoHttp = 0;
let justificanteId = '';
let rutaObjeto: string | undefined;
let rutaErrorStorage: string | undefined;
const firestore = crearFirestoreP2();
const storage = crearStorageP2();
const documentosSembrados: Array<[string, string]> = [];

function idJustificante(contrato: string, cobro: string): string {
  return `jc_${createHash('sha256').update(`${contrato}\n${cobro}`).digest('hex').slice(0, 48)}`;
}

async function crearDocumento(coleccion: string, id: string, datos: Record<string, unknown>): Promise<void> {
  const resultado = await firestore.crearDocumento(coleccion, id, datos);
  if (resultado !== 'CREADO') throw new Error(`P2_FIXTURE_EXISTENTE:${coleccion}/${id}`);
  documentosSembrados.push([coleccion, id]);
}

async function escuchar(app: express.Express): Promise<Server> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('P2_HTTP_SIN_PUERTO');
  puertoHttp = address.port;
  servidores.push(server);
  return server;
}

function crearApp(almacen = storage): express.Express {
  const app = express();
  app.use(express.json());
  const servicio = crearServicioJustificantesCobro({ puerto: firestore, almacen });
  montarRutasJustificantesCobro(app, { verificarToken: verificarTokenAuthEmulador, servicio });
  return app;
}

async function request(
  ruta: string,
  token?: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`http://127.0.0.1:${puertoHttp}${ruta}`, { ...init, headers });
}

async function sembrarIdentidad(
  cuenta: CuentaAuthEmulador,
  usuarioId: string,
  tipoPerfil: string,
  extrasFicha: Record<string, unknown>,
  extrasEspejo: Record<string, unknown>,
): Promise<void> {
  await crearDocumento('usuarios_auth', cuenta.uid, {
    usuarioId,
    tipoPerfil,
    estado: 'ACTIVO',
    authUid: cuenta.uid,
    ...extrasEspejo,
  });
  await crearDocumento('usuarios', usuarioId, {
    id: usuarioId,
    authUid: cuenta.uid,
    tipoPerfil,
    estado: 'ACTIVO',
    ...extrasFicha,
  });
}

async function eliminarDocumentoEmulador(coleccion: string, id: string): Promise<void> {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${process.env.GCLOUD_PROJECT}/databases/${encodeURIComponent(BASE_DATOS_P2)}/documents/${coleccion}/${encodeURIComponent(id)}`;
  const response = await fetchSoloEmuladores(url, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  if (!response.ok && response.status !== 404) throw new Error(`P2_CLEANUP_FIRESTORE_HTTP_${response.status}`);
}

async function eliminarObjetoEmulador(path: string): Promise<void> {
  const url = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/storage/v1/b/${encodeURIComponent(BUCKET_P2)}/o/${encodeURIComponent(path)}`;
  const response = await fetchSoloEmuladores(url, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  if (!response.ok && response.status !== 404) throw new Error(`P2_CLEANUP_STORAGE_HTTP_${response.status}`);
}

beforeAll(async () => {
  validarEntornoP2();
  inquilino = await crearCuentaAuthEmulador(`inquilino-${runId}@sintetico.invalid`);
  propietario = await crearCuentaAuthEmulador(`propietario-${runId}@sintetico.invalid`);
  actorAjeno = await crearCuentaAuthEmulador(`ajeno-${runId}@sintetico.invalid`);

  await sembrarIdentidad(inquilino, usuarioInquilinoId, 'INQUILINO', { contratoIds: [contratoId, contratoErrorStorageId] }, {
    contratoIds: [contratoId, contratoErrorStorageId],
  });
  await sembrarIdentidad(propietario, usuarioPropietarioId, 'PROPIETARIO', { propietarioId }, { propietarioId });
  await sembrarIdentidad(actorAjeno, usuarioAjenoId, 'PROPIETARIO', { propietarioId: `p2-other-owner-${runId}` }, {
    propietarioId: `p2-other-owner-${runId}`,
  });

  const cobro = (id: string, contract: string, tenant: string) => ({
    id,
    contratoId: contract,
    propietarioId,
    inmuebleId: `p2-home-${runId}`,
    inquilinoId: tenant,
    estado: 'PENDIENTE',
    importePendiente: 975.5,
  });
  await crearDocumento('contratos_formalizacion', contratoId, {
    id: contratoId,
    propietarioId,
    inmuebleId: `p2-home-${runId}`,
    candidatoId: usuarioInquilinoId,
    registroCobros: [cobro(cobroPeriodoId, contratoId, usuarioInquilinoId)],
  });
  await crearDocumento('contratos_formalizacion', contratoAjenoId, {
    id: contratoAjenoId,
    propietarioId,
    inmuebleId: `p2-home-${runId}`,
    candidatoId: candidatoAjenoId,
    registroCobros: [cobro(cobroAjenoId, contratoAjenoId, candidatoAjenoId)],
  });
  await crearDocumento('contratos_formalizacion', contratoErrorStorageId, {
    id: contratoErrorStorageId,
    propietarioId,
    inmuebleId: `p2-home-${runId}`,
    candidatoId: usuarioInquilinoId,
    registroCobros: [cobro(cobroErrorStorageId, contratoErrorStorageId, usuarioInquilinoId)],
  });

  await escuchar(crearApp());
}, 120_000);

afterAll(async () => {
  for (const server of servidores) {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  const idsP2 = [
    idJustificante(contratoId, cobroPeriodoId),
    idJustificante(contratoAjenoId, cobroAjenoId),
    idJustificante(contratoErrorStorageId, cobroErrorStorageId),
  ];
  const rutasObjetos = new Set([rutaObjeto, rutaErrorStorage].filter((value): value is string => Boolean(value)));
  for (const id of idsP2) {
    const registro = await firestore.leer(COLECCION_P2, id);
    if (typeof registro?.datos.storagePath === 'string') rutasObjetos.add(registro.datos.storagePath);
    const eventos = await firestore.consultarIgualdadesOrden(COLECCION_AUDITORIA, {
      igualdades: [['justificanteId', id]], limite: 100,
    });
    for (const evento of eventos) await eliminarDocumentoEmulador(COLECCION_AUDITORIA, evento.id);
    await eliminarDocumentoEmulador(COLECCION_P2, id);
  }
  for (const path of rutasObjetos) await eliminarObjetoEmulador(path);
  for (const [coleccion, id] of documentosSembrados.reverse()) await eliminarDocumentoEmulador(coleccion, id);
  for (const cuenta of [inquilino, propietario, actorAjeno].filter((value): value is CuentaAuthEmulador => Boolean(value))) {
    await borrarCuentaAuthEmulador(cuenta.idToken);
  }
}, 120_000);

describe('P2 · justificantes contra Firestore, Storage y Auth Emulator oficiales', () => {
  it('acepta, deniega, persiste, audita, recupera entre procesos y mantiene el cobro intacto', async () => {
    expect(inquilino.uid).toBeTruthy();

    // La guardia de ruta autentica mediante Auth Emulator, no con un stub de token.
    const noAutenticado = await request('/api/cobros/justificantes/subir', undefined, {
      method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: PDF,
    });
    expect(noAutenticado.status).toBe(401);

    const headers = {
      'Content-Type': 'application/pdf',
      'X-Contrato-Id': contratoId,
      'X-Cobro-Periodo-Id': cobroPeriodoId,
      'X-Nombre-Archivo': 'recibo sintetico.pdf',
      'X-Importe-Declarado': '975.50',
      'X-Fecha-Pago-Declarada': '2026-10-01',
      'X-Metodo-Pago-Declarado': 'transferencia',
      'Idempotency-Key': `p2-upload-${runId}`,
    };
    const invalido = await request('/api/cobros/justificantes/subir', inquilino.idToken, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/pdf' }, body: Buffer.from('no es PDF'),
    });
    expect(invalido.status).toBe(400);
    expect(await firestore.leer(COLECCION_P2, idJustificante(contratoId, cobroPeriodoId))).toBeNull();

    const tamanoExcesivo = Buffer.concat([PDF, Buffer.alloc(4 * 1024 * 1024 + 1)]);
    const demasiadoGrande = await request('/api/cobros/justificantes/subir', inquilino.idToken, {
      method: 'POST', headers, body: tamanoExcesivo,
    });
    expect(demasiadoGrande.status).toBe(413);
    expect(await firestore.leer(COLECCION_P2, idJustificante(contratoId, cobroPeriodoId))).toBeNull();

    const contratoAjeno = await request('/api/cobros/justificantes/subir', inquilino.idToken, {
      method: 'POST',
      headers: { ...headers, 'X-Contrato-Id': contratoAjenoId, 'X-Cobro-Periodo-Id': cobroAjenoId,
        'Idempotency-Key': `p2-denied-${runId}` },
      body: PDF,
    });
    expect(contratoAjeno.status).toBe(404);
    expect(await firestore.leer(COLECCION_P2, idJustificante(contratoAjenoId, cobroAjenoId))).toBeNull();

    // Fuentes canónicas de cobro capturadas antes de P2: ningún importe/estado de pago debe mutar.
    const contratoAntes = await firestore.leer('contratos_formalizacion', contratoId);
    const contratoAjenoAntes = await firestore.leer('contratos_formalizacion', contratoAjenoId);
    expect(contratoAntes?.datos.registroCobros).toEqual([
      expect.objectContaining({ id: cobroPeriodoId, estado: 'PENDIENTE', importePendiente: 975.5 }),
    ]);

    const subida = await request('/api/cobros/justificantes/subir', inquilino.idToken, {
      method: 'POST', headers, body: PDF,
    });
    expect(subida.status).toBe(200);
    const subidaJson = await subida.json() as { justificante: { id: string; estado: string }; duplicada: boolean };
    justificanteId = subidaJson.justificante.id;
    expect(justificanteId).toBe(idJustificante(contratoId, cobroPeriodoId));
    expect(subidaJson.justificante.estado).toBe('PENDIENTE_REVISION');
    expect(subidaJson.duplicada).toBe(false);

    const almacenado = await firestore.leer(COLECCION_P2, justificanteId);
    expect(almacenado?.datos).toMatchObject({
      estado: 'PENDIENTE_REVISION',
      sha256: createHash('sha256').update(PDF).digest('hex'),
      tamanoBytes: PDF.byteLength,
      tipoMime: 'application/pdf',
      importeDeclarado: 975.5,
      propietarioId,
      inmuebleId: `p2-home-${runId}`,
    });
    rutaObjeto = String(almacenado?.datos.storagePath);
    expect(rutaObjeto).toContain(`cobros_justificantes/${propietarioId}/${contratoId}/${cobroPeriodoId}/`);
    const bytesEmuladas = await storage.leer(rutaObjeto);
    expect(bytesEmuladas).not.toBeNull();
    expect(Buffer.from(bytesEmuladas!)).toEqual(PDF);

    const reintento = await request('/api/cobros/justificantes/subir', inquilino.idToken, {
      method: 'POST', headers, body: PDF,
    });
    expect(reintento.status).toBe(200);
    expect((await reintento.json() as { duplicada: boolean }).duplicada).toBe(true);

    const listaPropietario = await request('/api/cobros/justificantes/consultar', propietario.idToken, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contratoIds: [contratoId] }),
    });
    expect(listaPropietario.status).toBe(200);
    expect((await listaPropietario.json() as { items: Array<{ id: string }> }).items.map((item) => item.id)).toContain(justificanteId);
    const listaAjena = await request('/api/cobros/justificantes/consultar', actorAjeno.idToken, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contratoIds: [contratoId] }),
    });
    expect(listaAjena.status).toBe(404);

    const decisionAjena = await request(`/api/cobros/justificantes/${justificanteId}/decision`, actorAjeno.idToken, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'ACEPTAR', claveIdempotencia: `p2-no-owner-${runId}` }),
    });
    expect(decisionAjena.status).toBe(404);

    const decision = await request(`/api/cobros/justificantes/${justificanteId}/decision`, propietario.idToken, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'ACEPTAR', claveIdempotencia: `p2-owner-accept-${runId}` }),
    });
    expect(decision.status).toBe(200);
    expect((await decision.json() as { justificante: { estado: string } }).justificante.estado).toBe('ACEPTADO');

    const auditoria = await request(`/api/cobros/justificantes/${justificanteId}/auditoria`, propietario.idToken);
    expect(auditoria.status).toBe(200);
    const eventos = (await auditoria.json() as { eventos: Array<{ accion: string; actor: string; archivoDisponible: boolean }> }).eventos;
    expect(eventos.map((evento) => evento.accion)).toEqual(expect.arrayContaining(['SUBIDA_INICIADA', 'PRESENTADO', 'ACEPTADO']));
    expect(eventos.every((evento) => evento.actor === 'INQUILINO' || evento.actor === 'PROPIETARIO')).toBe(true);

    const descarga = await request(`/api/cobros/justificantes/${justificanteId}/archivo`, inquilino.idToken);
    expect(descarga.status).toBe(200);
    expect(Buffer.from(await descarga.arrayBuffer())).toEqual(PDF);
    expect(descarga.headers.get('cache-control')).toContain('no-store');
    expect(descarga.headers.get('x-content-type-options')).toBe('nosniff');

    // Nuevo proceso Node, clientes y servicio nuevos. Firestore/Storage emulator siguen vivos;
    // esto no pretende demostrar que los objetos del Storage Emulator sobrevivan a su reinicio.
    const separado = spawnSync(process.execPath, [
      '--import', 'tsx', 'tests/emulador/justificantes-cobro-recuperacion.proceso.ts',
      inquilino.idToken, justificanteId,
    ], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 60_000 });
    expect(separado.error).toBeUndefined();
    expect(separado.status, separado.stderr).toBe(0);
    expect(JSON.parse(separado.stdout)).toEqual({
      status: 200,
      sha256: createHash('sha256').update(PDF).digest('hex'),
      size: PDF.byteLength,
      contentType: expect.stringContaining('application/pdf'),
    });

    // Inyección de un HTTP 503 únicamente en el transporte de upload, no en servicio/puerto:
    // lo demás sigue atravesando los emuladores y el fallo debe quedar auditable.
    const transporteConFallo: ImplementacionFetch = async (url, init) => {
      const destino = new URL(url);
      const nombre = destino.searchParams.get('name') || '';
      if (init?.method === 'POST' && destino.pathname.includes('/upload/storage/v1/')
        && nombre.includes(`/${contratoErrorStorageId}/`)) {
        return {
          ok: false, status: 503, json: async () => ({}), text: async () => 'fallo sintético local',
          arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null },
        };
      }
      return fetchSoloEmuladores(url, init);
    };
    const appFallo = crearApp(crearStorageP2(transporteConFallo));
    const servidorFallo = await escuchar(appFallo);
    try {
      const fallo = await request('/api/cobros/justificantes/subir', inquilino.idToken, {
        method: 'POST',
        headers: { ...headers, 'X-Contrato-Id': contratoErrorStorageId,
          'X-Cobro-Periodo-Id': cobroErrorStorageId, 'Idempotency-Key': `p2-storage-retry-${runId}` },
        body: PDF,
      });
      expect(fallo.status).toBe(503);
      expect((await fallo.json() as { codigo: string }).codigo).toBe('ALMACEN_NO_DISPONIBLE');
    } finally {
      await new Promise<void>((resolve, reject) => servidorFallo.close((error) => error ? reject(error) : resolve()));
      // Se conservan referencias a todos los servidores para cerrarlos en afterAll.
    }

    const idError = idJustificante(contratoErrorStorageId, cobroErrorStorageId);
    const errorPersistido = await firestore.leer(COLECCION_P2, idError);
    expect(errorPersistido?.datos.estado).toBe('ERROR_SUBIDA');
    expect(errorPersistido?.datos.errorSubida).toBe('STORAGE_NO_DISPONIBLE');
    rutaErrorStorage = String(errorPersistido?.datos.storagePath);

    // Una instancia nueva y el transporte GCS emulado sin fallo recuperan el mismo intento idempotente.
    await escuchar(crearApp());
    const reintentoError = await request('/api/cobros/justificantes/subir', inquilino.idToken, {
      method: 'POST',
      headers: { ...headers, 'X-Contrato-Id': contratoErrorStorageId,
        'X-Cobro-Periodo-Id': cobroErrorStorageId, 'Idempotency-Key': `p2-storage-retry-${runId}` },
      body: PDF,
    });
    expect(reintentoError.status).toBe(200);
    expect((await reintentoError.json() as { justificante: { estado: string } }).justificante.estado).toBe('PENDIENTE_REVISION');
    const recuperadoError = await firestore.leer(COLECCION_P2, idError);
    expect(recuperadoError?.datos.estado).toBe('PENDIENTE_REVISION');
    const bytesErrorRecuperado = await storage.leer(String(recuperadoError?.datos.storagePath));
    expect(bytesErrorRecuperado).not.toBeNull();
    expect(Buffer.from(bytesErrorRecuperado!)).toEqual(PDF);
    rutaErrorStorage = String(recuperadoError?.datos.storagePath);

    // P2 no confirma ni altera el pago: sólo añade sus dos colecciones documentales y el objeto privado.
    expect((await firestore.leer('contratos_formalizacion', contratoId))?.datos).toEqual(contratoAntes?.datos);
    expect((await firestore.leer('contratos_formalizacion', contratoAjenoId))?.datos).toEqual(contratoAjenoAntes?.datos);
    expect((await firestore.leer('contratos_formalizacion', contratoErrorStorageId))?.datos.registroCobros)
      .toEqual([expect.objectContaining({ id: cobroErrorStorageId, estado: 'PENDIENTE', importePendiente: 975.5 })]);
    expect(await firestore.consultarIgualdadesOrden(COLECCION_AUDITORIA, {
      igualdades: [['justificanteId', justificanteId]], limite: 100,
    })).toHaveLength(eventos.length);
  });
});
