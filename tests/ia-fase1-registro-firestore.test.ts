/**
 * IA · FASE 1 — REGISTRO DE OPERACIONES EN FIRESTORE (REST, sin SDK de administración)
 * ===================================================================================
 * Dobles de `fetch` (sin red y sin datos reales) que capturan las peticiones a
 * la API REST de Firestore: base de datos con nombre de la aplicación,
 * creación con id fijo (idempotencia atómica), 409 → duplicado sin
 * sobrescribir, cierre con `updateMask` + `currentDocument.exists`, códec de
 * fechas, y el recorrido extremo a extremo petición → reserva → cierre →
 * respuesta. Además: `firestore.rules` deniega `ia_operaciones` a TODO cliente.
 */
import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ClienteFirestoreRest,
  codificarValor,
  decodificarValor,
  reiniciarCacheTokens,
  type CuentaServicio,
} from '../server/titularidades/googleBackend';
import { COLECCION_OPERACIONES_IA, crearRegistroFirestore, type CierreOperacionIA } from '../server/ia/registroOperacionesIA';
import { crearGobiernoMemoria } from '../server/ia/gobiernoIA';
import { construirPoliticaIACompleta } from '../src/ia/gobiernoIAContrato';
import { clienteIA, crearNucleoIA, generateGeminiWithRetry, idOperacionIA, type ContextoProveedorIA } from '../server/ia/nucleoIA';
import type { ServicioLlavesIA } from '../server/ia/llavesUsuarioIA';
import { decidir, parsearReglas, type ContextoPeticion, type Metodo } from './helpers/evaluadorReglasFirestore';

const par = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CUENTA: CuentaServicio = {
  project_id: 'proyecto-demo',
  client_email: 'sa@proyecto-demo.iam.gserviceaccount.com',
  private_key: par.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};
const BASE_DATOS = 'ai-studio-base-con-nombre';
const RAIZ_DOCS = `https://firestore.googleapis.com/v1/projects/proyecto-demo/databases/${BASE_DATOS}/documents`;

interface PeticionCapturada {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

function respuesta(datos: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => datos,
    text: async () => (typeof datos === 'string' ? datos : JSON.stringify(datos)),
  };
}

/** Firestore falso en memoria que entiende createDocument / patch / get. */
function firestoreFalso(opciones: { fallo?: number } = {}) {
  const peticiones: PeticionCapturada[] = [];
  const documentos = new Map<string, Record<string, unknown>>();
  const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
    if (url.includes('oauth2')) return respuesta({ access_token: 'token-servicio', expires_in: 3600 });
    const method = init?.method || 'GET';
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    peticiones.push({ url, method, body });
    if (opciones.fallo) return respuesta('denegado', opciones.fallo);
    const u = new URL(url);
    if (method === 'POST') {
      const id = u.searchParams.get('documentId') || '';
      const clave = `${u.pathname.split('/documents/')[1]}/${id}`;
      if (documentos.has(clave)) return respuesta({ error: { status: 'ALREADY_EXISTS' } }, 409);
      documentos.set(clave, (body?.fields as Record<string, unknown>) || {});
      return respuesta({ name: clave, fields: body?.fields });
    }
    const clave = decodeURIComponent(u.pathname.split('/documents/')[1]);
    if (method === 'PATCH') {
      if (!documentos.has(clave)) return respuesta({ error: { status: 'NOT_FOUND' } }, 404);
      documentos.set(clave, { ...documentos.get(clave), ...((body?.fields as Record<string, unknown>) || {}) });
      return respuesta({ name: clave });
    }
    const doc = documentos.get(clave);
    return doc ? respuesta({ name: `projects/p/databases/${BASE_DATOS}/documents/${clave}`, fields: doc }) : respuesta('no', 404);
  };
  return { fetchImpl: fetchImpl as never, peticiones, documentos };
}

const CIERRE: CierreOperacionIA = {
  estado: 'COMPLETADA',
  codigoHttp: 200,
  finalizadaEn: new Date('2026-10-15T10:00:02.000Z'),
  duracionMs: 2000,
  origenRespuesta: 'PROVEEDOR',
  llamadasProveedor: 1,
  llamadasProveedorFallidas: 0,
  modelos: ['gemini-3.7-flash'],
  tokensEntrada: 100,
  tokensSalida: 20,
  tokensRazonamiento: 0,
  tokensTotales: 120,
};

const APERTURA = {
  id: idOperacionIA('uid-ana', 'clave-0001-aaaa'),
  uid: 'uid-ana',
  operacion: 'ANALIZAR_DOCUMENTO' as const,
  ruta: '/api/analizar-documento',
  iniciadaEn: new Date('2026-10-15T10:00:00.000Z'),
};

beforeEach(() => reiniciarCacheTokens());

describe('IA Fase 1 · registro Firestore (REST)', () => {
  it('la reserva es createDocument con id fijo en la base de datos CON NOMBRE de la aplicación', async () => {
    const fs = firestoreFalso();
    const registro = crearRegistroFirestore(new ClienteFirestoreRest({ cuenta: CUENTA, baseDatosId: BASE_DATOS, fetchImpl: fs.fetchImpl }));
    expect(registro.tipo).toBe('FIRESTORE');
    await expect(registro.reservar(APERTURA)).resolves.toEqual({ estado: 'RESERVADA' });
    const [peticion] = fs.peticiones;
    expect(peticion.method).toBe('POST');
    expect(peticion.url).toBe(`${RAIZ_DOCS}/${COLECCION_OPERACIONES_IA}?documentId=${APERTURA.id}`);
    expect(peticion.body).toEqual({
      fields: {
        version: { integerValue: '1' },
        id: { stringValue: APERTURA.id },
        uid: { stringValue: 'uid-ana' },
        operacion: { stringValue: 'ANALIZAR_DOCUMENTO' },
        ruta: { stringValue: '/api/analizar-documento' },
        estado: { stringValue: 'EN_CURSO' },
        iniciadaEn: { timestampValue: '2026-10-15T10:00:00.000Z' },
      },
    });
  });

  it('409 de Firestore → DUPLICADA sin sobrescribir el registro existente', async () => {
    const fs = firestoreFalso();
    const registro = crearRegistroFirestore(new ClienteFirestoreRest({ cuenta: CUENTA, baseDatosId: BASE_DATOS, fetchImpl: fs.fetchImpl }));
    await registro.reservar(APERTURA);
    await registro.completar(APERTURA.id, CIERRE);
    const antes = JSON.stringify([...fs.documentos.entries()]);
    await expect(registro.reservar({ ...APERTURA, iniciadaEn: new Date() })).resolves.toEqual({ estado: 'DUPLICADA', previa: { estado: 'COMPLETADA' } });
    expect(JSON.stringify([...fs.documentos.entries()])).toBe(antes);
    expect(fs.peticiones.map((p) => p.method)).toEqual(['POST', 'PATCH', 'POST', 'GET']);
  });

  it('el cierre es un PATCH con updateMask de SUS campos y currentDocument.exists=true (nunca crea)', async () => {
    const fs = firestoreFalso();
    const registro = crearRegistroFirestore(new ClienteFirestoreRest({ cuenta: CUENTA, baseDatosId: BASE_DATOS, fetchImpl: fs.fetchImpl }));
    await registro.reservar(APERTURA);
    await registro.completar(APERTURA.id, { ...CIERRE, errorProveedor: 'HTTP_503' });
    const patch = fs.peticiones[1];
    expect(patch.method).toBe('PATCH');
    const url = new URL(patch.url);
    expect(`${url.origin}${url.pathname}`).toBe(`${RAIZ_DOCS}/${COLECCION_OPERACIONES_IA}/${APERTURA.id}`);
    expect(url.searchParams.get('currentDocument.exists')).toBe('true');
    expect(url.searchParams.getAll('updateMask.fieldPaths').sort()).toEqual(Object.keys({ ...CIERRE, errorProveedor: 'x' }).sort());
    const campos = patch.body?.fields as Record<string, unknown>;
    expect(campos.finalizadaEn).toEqual({ timestampValue: '2026-10-15T10:00:02.000Z' });
    expect(campos.modelos).toEqual({ arrayValue: { values: [{ stringValue: 'gemini-3.7-flash' }] } });
    expect(campos.tokensTotales).toEqual({ integerValue: '120' });
    expect(campos).not.toHaveProperty('uid'); // el cierre no puede reasignar la operación a otro usuario
    // Un cierre sin reserva previa NO crea el documento.
    await expect(registro.completar('iaop_inexistente', CIERRE)).rejects.toThrow(/404/);
    expect(fs.documentos.has(`${COLECCION_OPERACIONES_IA}/iaop_inexistente`)).toBe(false);
  });

  it('los errores de Firestore se propagan (el núcleo los convierte en 503 sin ejecutar)', async () => {
    const fs = firestoreFalso({ fallo: 403 });
    const registro = crearRegistroFirestore(new ClienteFirestoreRest({ cuenta: CUENTA, baseDatosId: BASE_DATOS, fetchImpl: fs.fetchImpl }));
    await expect(registro.reservar(APERTURA)).rejects.toThrow(/403/);
    await expect(registro.completar(APERTURA.id, CIERRE)).rejects.toThrow(/403/);
  });

  it('sin baseDatosId el cliente REST sigue usando (default): la búsqueda de titulares no cambia', async () => {
    const fs = firestoreFalso();
    const cliente = new ClienteFirestoreRest({ cuenta: CUENTA, fetchImpl: fs.fetchImpl });
    expect(cliente.baseDatosId).toBe('(default)');
    await cliente.leer('inmuebles', 'inm-1');
    expect(fs.peticiones[0].url).toBe('https://firestore.googleapis.com/v1/projects/proyecto-demo/databases/(default)/documents/inmuebles/inm-1');
  });

  it('códec: Date ↔ timestampValue (y fecha inválida → null); rutas de campo especiales entre comillas', async () => {
    expect(codificarValor(new Date('2026-01-02T03:04:05.000Z'))).toEqual({ timestampValue: '2026-01-02T03:04:05.000Z' });
    expect(codificarValor(new Date('no es fecha'))).toEqual({ nullValue: null });
    expect(decodificarValor({ timestampValue: '2026-01-02T03:04:05.000Z' })).toBe('2026-01-02T03:04:05.000Z');
    const fs = firestoreFalso();
    const cliente = new ClienteFirestoreRest({ cuenta: CUENTA, baseDatosId: BASE_DATOS, fetchImpl: fs.fetchImpl });
    await cliente.crearDocumento('coleccion', 'doc', { a: 1 });
    await cliente.actualizarCampos('coleccion', 'doc', { 'campo-raro': 1, normal: 2 });
    expect(new URL(fs.peticiones[1].url).searchParams.getAll('updateMask.fieldPaths')).toEqual(['`campo-raro`', 'normal']);
  });
});

describe('IA Fase 1 · extremo a extremo con el registro Firestore', () => {
  const servidores: Server[] = [];
  afterEach(async () => {
    await Promise.all(servidores.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  });

  it('petición autenticada → reserva (POST) → proveedor → cierre (PATCH) → respuesta; el duplicado no llega al proveedor', async () => {
    const fs = firestoreFalso();
    const orden: string[] = [];
    const fetchTrazado = (async (url: string, init?: { method?: string; body?: string }) => {
      if (!url.includes('oauth2')) orden.push(`firestore:${init?.method || 'GET'}`);
      return (fs.fetchImpl as unknown as (u: string, i?: unknown) => Promise<unknown>)(url, init);
    }) as never;
    const registro = crearRegistroFirestore(new ClienteFirestoreRest({ cuenta: CUENTA, baseDatosId: BASE_DATOS, fetchImpl: fetchTrazado }));
    const llaveTitularPrueba = 'mock-sintetico-llave-titular-ana-no-valida-para-proveedor';
    const contextosProveedor: ContextoProveedorIA[] = [];
    const llaves = {
      modo: 'MEMORIA' as const,
      resolverParaOperacion: async (uid: string) => uid === 'uid-ana'
        ? { estado: 'DISPONIBLE' as const, valor: llaveTitularPrueba, sufijo: 'titular-ana' }
        : { estado: 'AUSENTE' as const },
    } as unknown as ServicioLlavesIA;
    const gobierno = crearGobiernoMemoria(
      construirPoliticaIACompleta({ costeCreditosPorOperacion: { ANALIZAR_DOCUMENTO: 0 } }),
      { listarOperaciones: () => [] },
    );
    gobierno.fijarPerfil(
      'uid-ana',
      { estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO' },
      { authUid: 'uid-ana', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO' },
    );
    const nucleo = crearNucleoIA({
      verificarToken: async (token) => (token === 'token-ana' ? { uid: 'uid-ana' } : null),
      registro,
      gobierno,
      llaves,
      crearClienteProveedor: (contexto) => {
        if (!contexto || contexto.uid !== 'uid-ana' || contexto.llaveUsuario !== llaveTitularPrueba) {
          throw new Error('El proveedor debe recibir únicamente la llave sintética del titular resuelto.');
        }
        contextosProveedor.push(contexto);
        return {
          models: {
            generateContent: async () => {
              orden.push('proveedor');
              return { text: '{"ok":true}', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 } };
            },
          },
        };
      },
      resolverTitularIA: async ({ uidActor, request }) => {
        const contratoId = (request.body as { contratoId?: unknown } | undefined)?.contratoId;
        if (uidActor !== 'uid-ana' || contratoId !== 'contrato-ana') {
          return { estado: 'RECHAZADO', codigo: 'CONTRATO_NO_AUTORIZADO' };
        }
        return {
          estado: 'RESUELTO',
          contexto: {
            propietarioUid: 'uid-ana',
            propietarioId: 'prop-ana',
            contratoId: 'contrato-ana',
            inmuebleId: 'inmueble-ana',
          },
        };
      },
      log: () => undefined,
    });
    const app = express();
    app.use(express.json());
    app.post('/api/analizar-documento', nucleo.operacion('ANALIZAR_DOCUMENTO'), async (_req, res) => {
      const ai = clienteIA(res);
      const r = await generateGeminiWithRetry(ai, { model: 'gemini-3.7-flash', contents: 'x' });
      res.json({ texto: r.text });
    });
    const servidor = app.listen(0, '127.0.0.1');
    await once(servidor, 'listening');
    servidores.push(servidor);
    const url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/analizar-documento`;
    const peticion = () =>
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-ana', 'Idempotency-Key': 'clave-e2e-0001' }, body: '{"documentBase64":"privado","contratoId":"contrato-ana"}' });

    const r = await peticion();
    orden.push('respuesta');
    expect(r.status).toBe(200);
    expect(orden).toEqual(['firestore:POST', 'proveedor', 'firestore:PATCH', 'respuesta']);
    expect(contextosProveedor).toHaveLength(1);
    expect(contextosProveedor[0]).toMatchObject({
      uid: 'uid-ana',
      actorUid: 'uid-ana',
      propietarioId: 'prop-ana',
      operacion: 'ANALIZAR_DOCUMENTO',
      llaveUsuario: llaveTitularPrueba,
    });
    const id = idOperacionIA('uid-ana', 'clave-e2e-0001');
    const guardado = fs.documentos.get(`${COLECCION_OPERACIONES_IA}/${id}`) as Record<string, Record<string, string>>;
    expect(guardado.uid).toEqual({ stringValue: 'uid-ana' });
    expect(guardado.estado).toEqual({ stringValue: 'COMPLETADA' });
    expect(guardado.tokensTotales).toEqual({ integerValue: '15' });
    expect(JSON.stringify(guardado)).not.toContain('privado');

    const duplicada = await peticion();
    expect(duplicada.status).toBe(409);
    expect(orden.filter((paso) => paso === 'proveedor')).toHaveLength(1);
  });
});

describe('IA Fase 1 · firestore.rules: `ia_operaciones` no es accesible desde ningún cliente', () => {
  const REGLAS = parsearReglas(readFileSync(resolve(__dirname, '..', 'firestore.rules'), 'utf8'));
  const RUTA = `${COLECCION_OPERACIONES_IA}/${APERTURA.id}`;
  const REGISTRO = { version: 1, id: APERTURA.id, uid: 'uid-ana', operacion: 'ANALIZAR_DOCUMENTO', ruta: '/api/analizar-documento', estado: 'COMPLETADA' };
  const FIRESTORE = {
    'usuarios_auth/uid-ana': { estado: 'ACTIVO', usuarioId: 'u-ana', authUid: 'uid-ana', tipoPerfil: 'PROPIETARIO', propietarioId: 'p-ana' },
    'usuarios/u-ana': { estado: 'ACTIVO', authUid: 'uid-ana', tipoPerfil: 'PROPIETARIO', propietarioId: 'p-ana' },
    [RUTA]: REGISTRO,
  };
  const ACTORES = {
    anonimo: null,
    propietarioDelRegistro: { uid: 'uid-ana', token: { email: 'ana@correo.com', email_verified: true } },
    administradorMaestro: { uid: 'uid-master', token: { email: 'sarqsan2@gmail.com', email_verified: true } },
  };

  for (const [actor, auth] of Object.entries(ACTORES)) {
    for (const metodo of ['get', 'list', 'create', 'update', 'delete'] as Metodo[]) {
      it(`${actor} · ${metodo} → DENEGADO (solo escribe el servidor con su credencial)`, () => {
        const ctx: ContextoPeticion = {
          auth,
          firestore: FIRESTORE,
          existente: metodo === 'create' ? null : REGISTRO,
          ...(metodo === 'create' || metodo === 'update' ? { entrante: { ...REGISTRO, estado: 'FALLIDA', tokensTotales: 0 } } : {}),
        };
        const decision = decidir(REGLAS, RUTA, metodo, ctx);
        expect(decision.permitido).toBe(false);
        // Sólo casa la denegación global: no existe ningún `match` que abra la colección.
        expect(decision.casan).toEqual(['/databases/{database}/documents/{document=**}']);
      });
    }
  }
});
