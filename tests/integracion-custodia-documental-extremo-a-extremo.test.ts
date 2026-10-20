/**
 * AG-03.3 · INTEGRACIÓN EN PROCESO — CUSTODIA DOCUMENTAL DE EXTREMO A EXTREMO
 * =============================================================================
 * Nivel: integración (entre unitario y emulador). Une las piezas REALES que en
 * las suites unitarias se probaron por separado contra dobles escritos a mano:
 *   · rutas HTTP reales (`montarRutasDocumentos` sobre Express, escuchando en
 *     127.0.0.1) + servicio + autorizador del servidor;
 *   · cliente REST de Storage real (`ClienteGoogleStorageRest`, OAuth con clave
 *     RSA sintética) contra una **Cloud Storage JSON API sintética** que
 *     implementa el contrato documentado (sesión reanudable con `location`,
 *     `PUT` de un tramo, metadatos, `PATCH`, `DELETE`, `ifGenerationMatch=0`,
 *     descarga por token en `firebasestorage.googleapis.com/v0`);
 *   · motor cliente real (`almacenServidor.ts`) y `subirBinarioDuradero`
 *     hablando por HTTP con ese servidor y enviando los bytes a la sesión;
 *   · puerto Firestore en memoria con la FORMA de la base con nombre
 *     (espejo de identidad, fichas, inmuebles, relaciones de cartera…).
 * Así se verifica el cableado cliente↔servidor↔almacén (nombres de campos,
 * códigos, formas de error, cabeceras) que ningún doble unitario garantiza.
 *
 * Qué NO demuestra: el motor de Google (CORS real del `PUT`, semántica exacta
 * de la API) ni las cuentas reales del proyecto: eso es emulador / aceptación.
 */
import express from 'express';
import { createServer, type Server } from 'node:http';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearServicioDocumentos, type EventoCustodia } from '../server/documentos/servicioDocumentos';
import { montarRutasDocumentos } from '../server/documentos/rutasDocumentos';
import { ClienteGoogleStorageRest } from '../server/cobros/almacenGoogleStorage';
import {
  reiniciarCacheTokens,
  type CuentaServicio,
  type DocumentoLeido,
  type IdentidadVerificada,
  type ImplementacionFetch,
} from '../server/titularidades/googleBackend';
import { EMAIL_MASTER } from '../server/titularidades/backendTitulares';
import {
  ErrorAlmacenServidor,
  configurarAlmacenServidor,
  deleteObject,
  getBytes,
  getDownloadURL,
  getMetadata,
  ref,
  uploadBytes,
  type ConfiguracionAlmacenServidor,
} from '../src/lib/custodiaDocumental/almacenServidor';
import { ErrorCustodiaDocumento, LIMITES_PREFIJO, subirBinarioDuradero } from '../src/lib/custodiaDocumental/subidaDirecta';

// ---------------------------------------------------------------------------
// Cloud Storage JSON API sintética (contrato documentado por Google)
// ---------------------------------------------------------------------------
const BUCKET = 'bucket-sintetico.appspot.com';
const GCS = 'https://storage.googleapis.com';
const FSB = 'https://firebasestorage.googleapis.com';
const ORIGEN_NAVEGADOR = 'https://app.sintetica.invalid';

interface ObjetoSintetico { bytes: Uint8Array; contentType: string; generation: string; metadata: Record<string, string> }
interface SesionSintetica { name: string; contentType: string; metadata: Record<string, string>; origin?: string; soloSiNoExiste: boolean }
interface InitSintetico { method?: string; headers?: HeadersInit; body?: unknown; signal?: AbortSignal | null }

const almacen = {
  objetos: new Map<string, ObjetoSintetico>(),
  sesiones: new Map<string, SesionSintetica>(),
  llamadas: [] as Array<{ method: string; url: string; headers: Record<string, string> }>,
  generacion: 1000,
  reset() { this.objetos.clear(); this.sesiones.clear(); this.llamadas.length = 0; },
};

const json = (status: number, cuerpo: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const metadataJson = (name: string, o: ObjetoSintetico) => ({
  kind: 'storage#object', name, bucket: BUCKET, generation: o.generation, size: String(o.bytes.byteLength),
  contentType: o.contentType, md5Hash: createHash('md5').update(o.bytes).digest('base64'),
  timeCreated: '2026-10-20T00:00:00Z', updated: '2026-10-20T00:00:00Z', metadata: o.metadata,
});
const cabeceras = (h: HeadersInit | undefined): Record<string, string> => {
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries([...h.entries()]);
  if (Array.isArray(h)) return Object.fromEntries(h.map(([k, v]) => [k.toLowerCase(), String(v)]));
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v)]));
};
async function cuerpoBytes(body: unknown): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (typeof body === 'string') return new TextEncoder().encode(body);
  throw new Error('cuerpo no soportado por el GCS sintético');
}

/** Un único `fetch` sintético para el servidor (cuenta de servicio) y para el navegador (sesión/descarga). */
async function gcsSintetico(url: string, init?: InitSintetico): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  const h = cabeceras(init?.headers);
  almacen.llamadas.push({ method, url, headers: h });
  const u = new URL(url);

  if (url === 'https://oauth2.googleapis.com/token') return json(200, { access_token: 'token-oauth-sintetico', expires_in: 3600 });

  const autorizadoServidor = h.authorization === 'Bearer token-oauth-sintetico';
  const rutaSubida = `/upload/storage/v1/b/${encodeURIComponent(BUCKET)}/o`;
  // Sesión reanudable: `PUT` de un solo tramo (el navegador, sin credenciales).
  if (u.origin === GCS && u.pathname === rutaSubida && method === 'PUT') {
    const sesion = almacen.sesiones.get(url);
    if (!sesion) return new Response('', { status: 404 });
    if (sesion.soloSiNoExiste && almacen.objetos.has(sesion.name)) return new Response('', { status: 412 });
    const bytes = await cuerpoBytes(init?.body);
    const objeto: ObjetoSintetico = { bytes, contentType: sesion.contentType, generation: String(++almacen.generacion), metadata: { ...sesion.metadata } };
    almacen.objetos.set(sesion.name, objeto);
    almacen.sesiones.delete(url);
    return json(200, metadataJson(sesion.name, objeto));
  }
  // Inicio de sesión reanudable (JSON API, cuenta de servicio).
  if (u.origin === GCS && u.pathname === rutaSubida && method === 'POST') {
    if (!autorizadoServidor) return new Response('', { status: 401 });
    if (u.searchParams.get('uploadType') !== 'resumable') return new Response('', { status: 400 });
    const cuerpo = JSON.parse(new TextDecoder().decode(await cuerpoBytes(init?.body))) as { name: string; contentType: string; metadata: Record<string, string> };
    const soloSiNoExiste = u.searchParams.get('ifGenerationMatch') === '0';
    if (soloSiNoExiste && almacen.objetos.has(cuerpo.name)) return new Response('', { status: 412 });
    const sesionUri = `${GCS}${rutaSubida}?uploadType=resumable&upload_id=${randomUUID()}`;
    almacen.sesiones.set(sesionUri, { name: cuerpo.name, contentType: cuerpo.contentType, metadata: cuerpo.metadata || {}, origin: h.origin, soloSiNoExiste });
    return new Response('', { status: 200, headers: { location: sesionUri } });
  }
  // Objetos: metadatos / borrado / parche (cuenta de servicio).
  const prefijoObjeto = `/storage/v1/b/${encodeURIComponent(BUCKET)}/o/`;
  if (u.origin === GCS && u.pathname.startsWith(prefijoObjeto)) {
    if (!autorizadoServidor) return new Response('', { status: 401 });
    const name = decodeURIComponent(u.pathname.slice(prefijoObjeto.length));
    const objeto = almacen.objetos.get(name);
    if (method === 'GET') return objeto ? json(200, metadataJson(name, objeto)) : json(404, { error: { code: 404 } });
    if (method === 'DELETE') {
      if (!objeto) return new Response('', { status: 404 });
      almacen.objetos.delete(name);
      return new Response(null, { status: 204 }); // 204 sin cuerpo (como la API real)
    }
    if (method === 'PATCH') {
      if (!objeto) return new Response('', { status: 404 });
      const cuerpo = JSON.parse(new TextDecoder().decode(await cuerpoBytes(init?.body))) as { metadata?: Record<string, string | null> };
      for (const [k, v] of Object.entries(cuerpo.metadata || {})) { if (v === null) delete objeto.metadata[k]; else objeto.metadata[k] = v; }
      return json(200, metadataJson(name, objeto));
    }
  }
  // Descarga por token de Firebase Storage (navegador, sin credenciales).
  const prefijoV0 = `/v0/b/${encodeURIComponent(BUCKET)}/o/`;
  if (u.origin === FSB && u.pathname.startsWith(prefijoV0) && method === 'GET') {
    const name = decodeURIComponent(u.pathname.slice(prefijoV0.length));
    const objeto = almacen.objetos.get(name);
    if (!objeto) return new Response('', { status: 404 });
    const tokens = String(objeto.metadata.firebaseStorageDownloadTokens || '').split(',').filter(Boolean);
    const token = u.searchParams.get('token') || '';
    if (u.searchParams.get('alt') !== 'media' || !token || !tokens.includes(token)) return new Response('', { status: 403 });
    return new Response(new Uint8Array(objeto.bytes), { status: 200, headers: { 'Content-Type': objeto.contentType } });
  }
  throw new Error(`GCS sintético: petición no soportada ${method} ${url}`);
}

// ---------------------------------------------------------------------------
// Base Firestore CON NOMBRE en memoria (forma real de los documentos)
// ---------------------------------------------------------------------------
const RUN = randomUUID().slice(0, 8);
const PROP_A = `prop_A_${RUN}`;
const PROP_B = `prop_B_${RUN}`;
const INM_A1 = `inm_A1_${RUN}`;
const INM_A2 = `inm_A2_${RUN}`;
const REL = `rel_${RUN}`;
const SOL_A = `sol_${RUN}`;
const TOKEN_SOL = `token-solicitud-${RUN}-abcdef`;
const UID = {
  titularA: 'uid_titular_a', titularB: 'uid_titular_b', gestorE: 'uid_gestor_e', gestorL: 'uid_gestor_l',
  parcial: 'uid_parcial', revocado: 'uid_revocado', master: 'uid_master', sinFicha: 'uid_sin_ficha',
} as const;
type Actor = keyof typeof UID;

function baseInicial(): Map<string, Record<string, unknown>> {
  const b = new Map<string, Record<string, unknown>>();
  const persona = (uid: string, tipoPerfil: string, espejo: Record<string, unknown>) => {
    b.set(`usuarios_auth/${uid}`, { authUid: uid, usuarioId: `usr_${uid}`, tipoPerfil, estado: 'ACTIVO', ...espejo });
    b.set(`usuarios/usr_${uid}`, { id: `usr_${uid}`, authUid: uid, tipoPerfil, estado: 'ACTIVO', ...espejo });
  };
  persona(UID.titularA, 'PROPIETARIO', { propietarioId: PROP_A });
  persona(UID.titularB, 'PROPIETARIO', { propietarioId: PROP_B });
  persona(UID.gestorE, 'PROFESIONAL', { profesionalId: 'pro_e', carterasE: [PROP_A] });
  persona(UID.gestorL, 'PROFESIONAL', { profesionalId: 'pro_l', carterasL: [PROP_A] });
  persona(UID.parcial, 'PROFESIONAL', { profesionalId: 'pro_p', gestionesPorPropietario: { [PROP_A]: REL } });
  persona(UID.revocado, 'PROPIETARIO', { propietarioId: PROP_A });
  b.set(`usuarios_auth/${UID.revocado}`, { ...b.get(`usuarios_auth/${UID.revocado}`)!, estado: 'BLOQUEADO' });
  b.set(`gestiones_cartera/${REL}`, {
    propietarioId: PROP_A, gestorUsuarioId: `usr_${UID.parcial}`, estado: 'ACTIVA', resolucionInvitacion: 'ACEPTADA',
    inmuebleIds: [INM_A1], permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR',
  });
  b.set(`inmuebles/${INM_A1}`, { id: INM_A1, propietarioId: PROP_A, propietarioPrincipalId: PROP_A });
  b.set(`inmuebles/${INM_A2}`, { id: INM_A2, propietarioId: PROP_A, propietarioPrincipalId: PROP_A });
  b.set(`candidatos/cand_${RUN}`, { id: `cand_${RUN}`, inmuebleId: INM_A1 });
  b.set(`solicitudes_documentacion/${SOL_A}`, { id: SOL_A, candidatoId: `cand_${RUN}`, inmuebleId: INM_A1, token: TOKEN_SOL });
  return b;
}
let base = baseInicial();
const puerto = {
  async leerDocumento(ruta: string): Promise<DocumentoLeido | null> {
    const clave = decodeURIComponent(ruta);
    const datos = base.get(clave);
    return datos ? { id: clave.slice(clave.lastIndexOf('/') + 1), datos } : null;
  },
  async consultarIgualdadesOrden(coleccion: string, consulta: { igualdades?: Array<[string, string]>; limite: number }): Promise<DocumentoLeido[]> {
    const salida: DocumentoLeido[] = [];
    for (const [clave, datos] of base) {
      if (!clave.startsWith(`${coleccion}/`) || clave.slice(coleccion.length + 1).includes('/')) continue;
      if ((consulta.igualdades || []).every(([campo, valor]) => datos[campo] === valor)) salida.push({ id: clave.slice(coleccion.length + 1), datos });
      if (salida.length >= consulta.limite) break;
    }
    return salida;
  },
};

// ---------------------------------------------------------------------------
// Servidor real en proceso + motor cliente real
// ---------------------------------------------------------------------------
const par = generateKeyPairSync('rsa', { modulusLength: 2048 });
const cuenta: CuentaServicio = {
  project_id: 'proyecto-sintetico',
  client_email: 'cuenta-sintetica@proyecto-sintetico.iam.gserviceaccount.com',
  private_key: par.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};
const IDENTIDADES: Record<string, IdentidadVerificada> = Object.fromEntries(
  (Object.keys(UID) as Actor[]).map((a) => [`tok-${a}`, { uid: UID[a], email: a === 'master' ? EMAIL_MASTER : `${a}@sintetico.invalid` }]),
);
const eventos: EventoCustodia[] = [];
let servidor: Server;
let puertoHttp = 0;
let tokenActivo: string | null = null;
let configuracionPrevia: ConfiguracionAlmacenServidor;
const como = (actor: Actor | null) => { tokenActivo = actor ? `tok-${actor}` : null; };

/** `fetch` del navegador: rutas relativas → servidor en proceso (con `Origin`); URLs absolutas → GCS sintético. */
const fetchNavegador: typeof fetch = async (entrada, init) => {
  const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
  if (url.startsWith('/')) {
    return fetch(`http://127.0.0.1:${puertoHttp}${url}`, { ...init, headers: { ...cabeceras(init?.headers), Origin: ORIGEN_NAVEGADOR } });
  }
  return gcsSintetico(url, init as InitSintetico | undefined);
};

async function http(ruta: string, cuerpo: unknown, actor: Actor | null, extra: Record<string, string> = {}): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(`http://127.0.0.1:${puertoHttp}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGEN_NAVEGADOR, ...(actor ? { Authorization: `Bearer tok-${actor}` } : {}), ...extra },
    body: JSON.stringify(cuerpo),
  });
  return { status: r.status, json: await r.json() as Record<string, unknown> };
}

const PDF = new TextEncoder().encode(`%PDF-1.7\n% integracion AG-03.3 ${RUN}\n%%EOF`);
const JPG = new Uint8Array(64).fill(0xff);
const sha = (b: Uint8Array | ArrayBuffer) => createHash('sha256').update(b instanceof Uint8Array ? b : new Uint8Array(b)).digest('hex');
const codigoDe = async (p: Promise<unknown>): Promise<string> => {
  try { await p; return 'PERMITIDO'; } catch (e) {
    if (e instanceof ErrorCustodiaDocumento) return e.codigo;
    if (e instanceof ErrorAlmacenServidor) return e.codigoServidor || e.code;
    return (e as { code?: string }).code || 'ERROR';
  }
};
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  const almacenServidor = new ClienteGoogleStorageRest({ cuenta, bucket: BUCKET, fetchImpl: gcsSintetico as unknown as ImplementacionFetch });
  const servicio = crearServicioDocumentos({ puerto, almacen: almacenServidor, auditar: (e) => eventos.push(e) });
  montarRutasDocumentos(app, { verificarToken: async (token) => IDENTIDADES[token] ?? null, servicio });
  servidor = createServer(app);
  await new Promise<void>((resolve, reject) => { servidor.once('error', reject); servidor.listen(0, '127.0.0.1', resolve); });
  const direccion = servidor.address();
  if (!direccion || typeof direccion === 'string') throw new Error('sin puerto');
  puertoHttp = direccion.port;
  configuracionPrevia = configurarAlmacenServidor({ fetchImpl: fetchNavegador, obtenerToken: async () => tokenActivo });
});
afterAll(async () => {
  configurarAlmacenServidor(configuracionPrevia);
  reiniciarCacheTokens();
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
});
beforeEach(() => { almacen.reset(); base = baseInicial(); eventos.length = 0; como(null); });

let secuencia = 0;
const rutaFacturaA = () => `gastos_facturas/${PROP_A}/g${++secuencia}/${RUN}_factura.pdf`;

async function subirComo(actor: Actor | null, storagePath: string, extra: Partial<Parameters<typeof subirBinarioDuradero>[1]> = {}) {
  como(actor);
  return subirBinarioDuradero(null, {
    storagePath,
    datos: new Blob([PDF], { type: 'application/pdf' }),
    contentType: 'application/pdf',
    customMetadata: { sha256: sha(PDF) },
    ...extra,
  });
}

// ---------------------------------------------------------------------------
describe('1 · flujo completo del titular: sesión → PUT → confirmación → acceso → borrado', () => {
  it('cablea cliente, servidor y almacén: el objeto nace con los metadatos del servidor y se lee con la huella íntegra', async () => {
    const ruta = rutaFacturaA();
    const r = await subirComo('titularA', ruta, { limite: LIMITES_PREFIJO.gastos_facturas });
    expect(r.storagePath).toBe(ruta);
    expect(r.bytes).toBe(PDF.byteLength);
    expect(r.url).toMatch(new RegExp(`^${escapar(`${FSB}/v0/b/${encodeURIComponent(BUCKET)}/o/${encodeURIComponent(ruta)}`)}\\?alt=media&token=`));

    // Contrato HTTP observado en el almacén sintético.
    const inicio = almacen.llamadas.find((l) => l.method === 'POST' && l.url.includes('/upload/storage/v1/'))!;
    expect(new URL(inicio.url).searchParams.get('uploadType')).toBe('resumable');
    expect(new URL(inicio.url).searchParams.get('ifGenerationMatch')).toBe('0');
    expect(inicio.headers.origin).toBe(ORIGEN_NAVEGADOR); // el servidor reenvía el Origin del navegador (CORS de la sesión)
    expect(inicio.headers['x-upload-content-type']).toBe('application/pdf');
    expect(inicio.headers['x-upload-content-length']).toBe(String(PDF.byteLength));
    const put = almacen.llamadas.find((l) => l.method === 'PUT')!;
    expect(put.headers.authorization).toBeUndefined(); // el navegador nunca recibe credenciales
    expect(put.headers['content-type']).toBe('application/pdf');
    const objeto = almacen.objetos.get(ruta)!;
    expect(sha(objeto.bytes)).toBe(sha(PDF));
    expect(objeto.contentType).toBe('application/pdf');
    expect(objeto.metadata).toMatchObject({ custodia_origen: 'servidor-ag03', custodia_uid: UID.titularA, sha256: sha(PDF) });
    expect(objeto.metadata.firebaseStorageDownloadTokens).toMatch(/^[A-Za-z0-9_-]{16,}$/);

    // Lectura por el motor cliente: URL autorizada + descarga directa íntegra.
    como('titularA');
    expect(sha(await getBytes(ref(null, ruta)))).toBe(sha(PDF));
    const metadatos = await getMetadata(ref(null, ruta));
    expect(metadatos).toMatchObject({ fullPath: ruta, size: PDF.byteLength, contentType: 'application/pdf', customMetadata: { sha256: sha(PDF) } });
    expect(metadatos.customMetadata.firebaseStorageDownloadTokens).toBeUndefined(); // el token no se proyecta como metadato
    expect(metadatos.generation).toBe(objeto.generation);

    // Borrado autorizado e idempotente.
    await deleteObject(ref(null, ruta));
    expect(almacen.objetos.has(ruta)).toBe(false);
    expect(await codigoDe(deleteObject(ref(null, ruta)))).toBe('storage/object-not-found');

    // Traza de custodia sin datos sensibles.
    expect(eventos.map((e) => `${e.operacion}:${e.resultado}`)).toEqual([
      'INICIAR_SUBIDA:OK', 'CONFIRMAR_SUBIDA:OK', 'ACCESO:OK', 'ACCESO:OK', 'BORRAR:OK', 'BORRAR:OK',
    ]);
    expect(eventos.every((e) => e.actor === `uid:${UID.titularA}` && e.carpeta === ruta.slice(0, ruta.lastIndexOf('/')))).toBe(true);
    expect(JSON.stringify(eventos)).not.toMatch(/token=|Bearer|@sintetico|private_key|_factura\.pdf/);
  });

  it('reintento idéntico ⇒ YA_EXISTE sin reenviar bytes; contenido distinto en la misma ruta ⇒ OBJETO_EXISTENTE y el objeto no cambia', async () => {
    const ruta = rutaFacturaA();
    await subirComo('titularA', ruta);
    const puts = () => almacen.llamadas.filter((l) => l.method === 'PUT').length;
    expect(puts()).toBe(1);
    como('titularA');
    const otra = await uploadBytes(ref(null, ruta), new Blob([PDF]), { contentType: 'application/pdf', customMetadata: { sha256: sha(PDF) } });
    expect(otra.yaExistia).toBe(true);
    expect(otra.url).toMatch(/alt=media&token=/);
    expect(puts()).toBe(1);
    const distinto = new TextEncoder().encode('%PDF-1.7 otro contenido');
    expect(await codigoDe(uploadBytes(ref(null, ruta), new Blob([distinto]), { contentType: 'application/pdf', customMetadata: { sha256: sha(distinto) } }))).toBe('OBJETO_EXISTENTE');
    expect(puts()).toBe(1);
    expect(sha(almacen.objetos.get(ruta)!.bytes)).toBe(sha(PDF));
  });

  it('confirmación sin bytes ⇒ OBJETO_INCOMPLETO; bytes reales fuera de regla ⇒ el servidor retira el objeto PROPIO y no informa éxito', async () => {
    const ruta = rutaFacturaA();
    const inicio = await http('/api/documentos/subidas', { storagePath: ruta, contentType: 'application/pdf', tamanoBytes: PDF.byteLength }, 'titularA');
    expect(inicio.status).toBe(200);
    expect(inicio.json).toMatchObject({ ok: true, estado: 'SESION', storagePath: ruta });
    expect(String(inicio.json.sesionUri)).toMatch(/^https:\/\/storage\.googleapis\.com\/upload\/storage\/v1\//);

    const sinBytes = await http('/api/documentos/subidas/confirmar', { storagePath: ruta }, 'titularA');
    expect(sinBytes.status).toBe(409);
    expect(sinBytes.json).toMatchObject({ ok: false, codigo: 'OBJETO_INCOMPLETO', motivo: 'SIN_OBJETO' });

    // El navegador envía MÁS bytes de los admitidos (≥ 12 MB en gastos_facturas): el objeto existe un instante…
    const enorme = new Uint8Array(12 * 1024 * 1024);
    const put = await gcsSintetico(String(inicio.json.sesionUri), { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: enorme });
    expect(put.status).toBe(200);
    expect(almacen.objetos.get(ruta)!.metadata.custodia_uid).toBe(UID.titularA);
    const confirmacion = await http('/api/documentos/subidas/confirmar', { storagePath: ruta }, 'titularA');
    expect(confirmacion.status).toBe(413);
    expect(confirmacion.json).toMatchObject({ ok: false, codigo: 'ARCHIVO_DEMASIADO_GRANDE' });
    expect(almacen.objetos.has(ruta)).toBe(false); // …y el servidor lo retira: nunca queda material fuera de regla
    expect(eventos.filter((e) => e.operacion === 'CONFIRMAR_SUBIDA').map((e) => e.resultado)).toEqual(['ERROR', 'DENEGADO']);
  });

  it('un objeto que NO marcó este servidor (heredado/ajeno) no se confirma ni se borra por la vía de confirmación', async () => {
    const ruta = rutaFacturaA();
    almacen.objetos.set(ruta, { bytes: PDF, contentType: 'application/pdf', generation: '1', metadata: {} });
    const r = await http('/api/documentos/subidas/confirmar', { storagePath: ruta }, 'titularA');
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ ok: false, codigo: 'OBJETO_INCOMPLETO', motivo: 'OBJETO_AJENO' });
    expect(almacen.objetos.has(ruta)).toBe(true);
    // Lo heredado sigue siendo legible (el acceso emite su token) y borrable por quien tiene ámbito, por la vía explícita.
    como('titularA');
    expect(sha(await getBytes(ref(null, ruta)))).toBe(sha(PDF));
    await deleteObject(ref(null, ruta));
    expect(almacen.objetos.has(ruta)).toBe(false);
  });
});

describe('2 · matriz de permisos sobre la misma base con nombre (la cuenta maestra, la última)', () => {
  it('otro propietario: denegado en lectura, escritura y borrado; sin ficha: denegado; sin sesión o sesión inválida: 401', async () => {
    const ruta = rutaFacturaA();
    await subirComo('titularA', ruta);
    como('titularB');
    expect(await codigoDe(getDownloadURL(ref(null, ruta)))).toBe('SIN_PERMISO');
    expect(await codigoDe(getBytes(ref(null, ruta)))).toBe('SIN_PERMISO');
    expect(await codigoDe(deleteObject(ref(null, ruta)))).toBe('SIN_PERMISO');
    const rutaIntrusa = `gastos_facturas/${PROP_A}/g-b/${RUN}.pdf`;
    expect(await codigoDe(subirComo('titularB', rutaIntrusa))).toBe('SIN_PERMISO');
    expect(almacen.objetos.has(rutaIntrusa)).toBe(false);
    expect(almacen.sesiones.size).toBe(0);
    como('sinFicha');
    expect(await codigoDe(getDownloadURL(ref(null, ruta)))).toBe('SIN_PERMISO');
    como(null);
    expect(await codigoDe(getDownloadURL(ref(null, ruta)))).toBe('storage/unauthenticated');
    const sinSesion = await http('/api/documentos/acceso', { storagePath: ruta }, null);
    expect(sinSesion.status).toBe(401);
    expect(sinSesion.json.codigo).toBe('NO_AUTENTICADO');
    const tokenFalso = await fetch(`http://127.0.0.1:${puertoHttp}/api/documentos/acceso`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-inventado' }, body: JSON.stringify({ storagePath: ruta }),
    });
    expect(tokenFalso.status).toBe(401);
    expect(almacen.objetos.has(ruta)).toBe(true);
    expect(eventos.filter((e) => e.resultado === 'DENEGADO').map((e) => e.motivo)).toEqual([
      'AMBITO_PROPIETARIO_LECTURA', 'AMBITO_PROPIETARIO_LECTURA', 'AMBITO_PROPIETARIO_BORRADO', 'AMBITO_PROPIETARIO_ESCRITURA', 'AMBITO_PROPIETARIO_LECTURA',
    ]);
  });

  it('cartera E lee y sube; cartera L sólo lee; ninguno borra lo del titular', async () => {
    const ruta = rutaFacturaA();
    await subirComo('titularA', ruta);
    como('gestorE');
    expect(sha(await getBytes(ref(null, ruta)))).toBe(sha(PDF));
    const rutaE = `gastos_facturas/${PROP_A}/g-e/${RUN}_f.pdf`;
    await uploadBytes(ref(null, rutaE), new Blob([PDF]), { contentType: 'application/pdf' });
    expect(almacen.objetos.get(rutaE)!.metadata.custodia_uid).toBe(UID.gestorE);
    expect(await codigoDe(deleteObject(ref(null, ruta)))).toBe('SIN_PERMISO');
    como('gestorL');
    expect(sha(await getBytes(ref(null, ruta)))).toBe(sha(PDF));
    expect(await codigoDe(uploadBytes(ref(null, `gastos_facturas/${PROP_A}/g-l/${RUN}_f.pdf`), new Blob([PDF]), { contentType: 'application/pdf' }))).toBe('SIN_PERMISO');
    expect(await codigoDe(deleteObject(ref(null, ruta)))).toBe('SIN_PERMISO');
    expect(almacen.objetos.size).toBe(2);
  });

  it('delegación parcial: sólo el inmueble enumerado; escritura sólo con LECTURA_ESCRITURA y responsable GESTOR; fin de la relación ⇒ nada', async () => {
    const foto1 = `inmuebles/${INM_A1}/inventario/${RUN}-salon.jpg`;
    const foto2 = `inmuebles/${INM_A2}/inventario/${RUN}-salon.jpg`;
    como('parcial');
    await uploadBytes(ref(null, foto1), new Blob([JPG]), { contentType: 'image/jpeg' });
    expect(almacen.objetos.has(foto1)).toBe(true);
    expect(await codigoDe(uploadBytes(ref(null, foto2), new Blob([JPG]), { contentType: 'image/jpeg' }))).toBe('SIN_PERMISO');
    // La cartera completa no aplica a quien tiene relación indexada: facturas del propietario fuera de alcance.
    expect(await codigoDe(uploadBytes(ref(null, `gastos_facturas/${PROP_A}/g-p/${RUN}_f.pdf`), new Blob([PDF]), { contentType: 'application/pdf' }))).toBe('SIN_PERMISO');
    expect(await codigoDe(getDownloadURL(ref(null, foto1)))).toBe('PERMITIDO');
    // Otro propietario no ve el inventario del inmueble de A.
    como('titularB');
    expect(await codigoDe(getDownloadURL(ref(null, foto1)))).toBe('SIN_PERMISO');
    // Degradar a sólo lectura: la siguiente escritura se deniega (lectura fresca de la relación), la lectura sigue.
    como('parcial');
    base.set(`gestiones_cartera/${REL}`, { ...base.get(`gestiones_cartera/${REL}`)!, permiso: 'LECTURA' });
    expect(await codigoDe(uploadBytes(ref(null, `inmuebles/${INM_A1}/inventario/${RUN}-cocina.jpg`), new Blob([JPG]), { contentType: 'image/jpeg' }))).toBe('SIN_PERMISO');
    expect(await codigoDe(getDownloadURL(ref(null, foto1)))).toBe('PERMITIDO');
    // Fin de la relación: ni lectura.
    base.set(`gestiones_cartera/${REL}`, { ...base.get(`gestiones_cartera/${REL}`)!, estado: 'FINALIZADA' });
    expect(await codigoDe(getDownloadURL(ref(null, foto1)))).toBe('SIN_PERMISO');
    expect(almacen.objetos.size).toBe(1);
  });

  it('revocación: espejo no ACTIVO ⇒ denegado al instante (también entre inicio y confirmación); reactivar restaura', async () => {
    const ruta = rutaFacturaA();
    await subirComo('titularA', ruta);
    como('revocado'); // misma propiedad que titularA, espejo BLOQUEADO
    expect(await codigoDe(getDownloadURL(ref(null, ruta)))).toBe('SIN_PERMISO');
    // Revocación a mitad de subida: el inicio se concede, la confirmación se deniega y el objeto propio se retira.
    const ruta2 = rutaFacturaA();
    const inicio = await http('/api/documentos/subidas', { storagePath: ruta2, contentType: 'application/pdf', tamanoBytes: PDF.byteLength }, 'titularA');
    expect(inicio.json.estado).toBe('SESION');
    await gcsSintetico(String(inicio.json.sesionUri), { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: PDF });
    base.set(`usuarios_auth/${UID.titularA}`, { ...base.get(`usuarios_auth/${UID.titularA}`)!, estado: 'BLOQUEADO' });
    const confirmacion = await http('/api/documentos/subidas/confirmar', { storagePath: ruta2 }, 'titularA');
    expect(confirmacion.status).toBe(403);
    expect(confirmacion.json.codigo).toBe('SIN_PERMISO');
    expect(almacen.objetos.has(ruta2)).toBe(false);
    como('titularA');
    expect(await codigoDe(getDownloadURL(ref(null, ruta)))).toBe('SIN_PERMISO');
    base.set(`usuarios_auth/${UID.titularA}`, { ...base.get(`usuarios_auth/${UID.titularA}`)!, estado: 'ACTIVO' });
    expect(await codigoDe(getDownloadURL(ref(null, ruta)))).toBe('PERMITIDO');
  });

  it('portal público: token correcto sube sin sesión a la ruta plana; token incorrecto / ruta anidada / otro destino denegados; el titular lee', async () => {
    const ruta = `documentos_solicitados/${SOL_A}/item-dni_${RUN}_dni.pdf`;
    const r = await subirComo(null, ruta, { accesoPublico: { solicitudDocId: SOL_A, token: TOKEN_SOL }, limite: LIMITES_PREFIJO.documentos_solicitados });
    expect(r.url).toContain('alt=media');
    expect(almacen.objetos.get(ruta)!.metadata).toMatchObject({ custodia_origen: 'servidor-ag03', custodia_uid: 'portal-publico' });
    const peticionesPortal = almacen.llamadas.filter((l) => l.method === 'POST' && l.url.includes('/upload/'));
    expect(peticionesPortal).toHaveLength(1);
    expect(peticionesPortal[0].headers.origin).toBe(ORIGEN_NAVEGADOR);

    expect(await codigoDe(subirComo(null, `documentos_solicitados/${SOL_A}/otro.pdf`, { accesoPublico: { solicitudDocId: SOL_A, token: 'token-incorrecto-0123456789' } }))).toBe('SIN_PERMISO');
    expect(await codigoDe(subirComo(null, `documentos_solicitados/${SOL_A}/otro.pdf`, { accesoPublico: { solicitudDocId: `otra_${RUN}`, token: TOKEN_SOL } }))).toBe('SIN_PERMISO');
    // Ruta anidada = destino PROFUNDO: el portal sólo admite la ruta plana (403 antes de tocar el almacén).
    expect(await codigoDe(subirComo(null, `documentos_solicitados/${SOL_A}/anidado/otro.pdf`, { accesoPublico: { solicitudDocId: SOL_A, token: TOKEN_SOL } }))).toBe('SIN_PERMISO');
    expect(await codigoDe(subirComo(null, `gastos_facturas/${PROP_A}/g-portal/f.pdf`, { accesoPublico: { solicitudDocId: SOL_A, token: TOKEN_SOL } }))).toBe('SIN_PERMISO');
    expect([...almacen.objetos.keys()]).toEqual([ruta]);
    expect(almacen.sesiones.size).toBe(0);

    como('titularA');
    expect(sha(await getBytes(ref(null, ruta)))).toBe(sha(PDF));
    como('titularB');
    expect(await codigoDe(getDownloadURL(ref(null, ruta)))).toBe('SIN_PERMISO');
    como(null);
    expect(await codigoDe(getDownloadURL(ref(null, ruta)))).toBe('storage/unauthenticated');
  });

  it('límites y rutas: tipo 400, tamaño 413, ruta fuera de catálogo o manipulada 403, sin titular 403, metadatos/campos reservados 400 — sin abrir sesión', async () => {
    const casos: Array<[Record<string, unknown>, number, string]> = [
      [{ storagePath: `gastos_facturas/${PROP_A}/g/notas.txt`, contentType: 'text/plain', tamanoBytes: 10 }, 400, 'ARCHIVO_INVALIDO'],
      [{ storagePath: `gastos_facturas/${PROP_A}/g/grande.pdf`, contentType: 'application/pdf', tamanoBytes: 12 * 1024 * 1024 }, 413, 'ARCHIVO_DEMASIADO_GRANDE'],
      [{ storagePath: `gastos_facturas/${PROP_A}/g/vacio.pdf`, contentType: 'application/pdf', tamanoBytes: 0 }, 400, 'ARCHIVO_INVALIDO'],
      [{ storagePath: 'presupuestos/x/f.pdf', contentType: 'application/pdf', tamanoBytes: 10 }, 403, 'RUTA_NO_ADMITIDA'],
      [{ storagePath: `gastos_facturas/../${PROP_A}/g/f.pdf`, contentType: 'application/pdf', tamanoBytes: 10 }, 403, 'RUTA_NO_ADMITIDA'],
      [{ storagePath: `/gastos_facturas/${PROP_A}/g/f.pdf`, contentType: 'application/pdf', tamanoBytes: 10 }, 403, 'RUTA_NO_ADMITIDA'],
      [{ storagePath: 'gastos_facturas/sin_asignar/g/f.pdf', contentType: 'application/pdf', tamanoBytes: 10 }, 403, 'SIN_PERMISO'],
      [{ storagePath: `gastos_facturas/${PROP_A}/g/f.pdf`, contentType: 'application/pdf', tamanoBytes: 10, customMetadata: { custodia_uid: 'otro' } }, 400, 'PETICION_INVALIDA'],
      [{ storagePath: `gastos_facturas/${PROP_A}/g/f.pdf`, contentType: 'application/pdf', tamanoBytes: 10, customMetadata: { firebaseStorageDownloadTokens: 'x' } }, 400, 'PETICION_INVALIDA'],
      [{ storagePath: `gastos_facturas/${PROP_A}/g/f.pdf`, contentType: 'application/pdf', tamanoBytes: 10, campoExtra: 1 }, 400, 'PETICION_INVALIDA'],
      [{ storagePath: `gastos_facturas/${PROP_A}/g/f.pdf`, contentType: 'application/pdf', tamanoBytes: '10' }, 400, 'ARCHIVO_INVALIDO'],
    ];
    for (const [cuerpo, status, codigo] of casos) {
      const r = await http('/api/documentos/subidas', cuerpo, 'titularA');
      expect(r.status, JSON.stringify(cuerpo)).toBe(status);
      expect(r.json.codigo, JSON.stringify(cuerpo)).toBe(codigo);
      expect(r.json.ok).toBe(false);
    }
    expect(almacen.llamadas.filter((l) => l.method === 'POST' && l.url.includes('/upload/'))).toHaveLength(0);
    expect(almacen.sesiones.size).toBe(0);
    expect(almacen.objetos.size).toBe(0);
  });

  it('cuenta maestra al final: opera sobre lo ajeno, no custodia en sin_asignar, y su éxito no altera las denegaciones anteriores', async () => {
    const ruta = rutaFacturaA();
    await subirComo('titularA', ruta);
    como('titularB');
    expect(await codigoDe(getDownloadURL(ref(null, ruta)))).toBe('SIN_PERMISO');
    como('master');
    expect(sha(await getBytes(ref(null, ruta)))).toBe(sha(PDF));
    expect(await codigoDe(uploadBytes(ref(null, 'gastos_facturas/sin_asignar/g/f.pdf'), new Blob([PDF]), { contentType: 'application/pdf' }))).toBe('SIN_PERMISO');
    const rutaM = `gastos_facturas/${PROP_B}/g-m/${RUN}_f.pdf`;
    await uploadBytes(ref(null, rutaM), new Blob([PDF]), { contentType: 'application/pdf' });
    expect(almacen.objetos.get(rutaM)!.metadata.custodia_uid).toBe(UID.master);
    expect(eventos.filter((e) => e.actor === 'master').every((e) => e.resultado === 'OK' || e.motivo === 'SIN_TITULAR')).toBe(true);
    como('titularB');
    expect(await codigoDe(getDownloadURL(ref(null, ruta)))).toBe('SIN_PERMISO');
    expect(sha(await getBytes(ref(null, rutaM)))).toBe(sha(PDF)); // lo que la administración deja en SU carpeta sí lo ve B
    como('titularA');
    expect(await codigoDe(getDownloadURL(ref(null, rutaM)))).toBe('SIN_PERMISO');
  });
});

describe('3 · fallo cerrado ante infraestructura', () => {
  it('sin servicio configurado (503 CUSTODIA_NO_DISPONIBLE) el cliente informa fallo y no fabrica ningún resultado', async () => {
    const app = express();
    app.use(express.json());
    montarRutasDocumentos(app, { verificarToken: async (token) => IDENTIDADES[token] ?? null, servicio: null });
    const s = createServer(app);
    await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
    const puertoSin = (s.address() as { port: number }).port;
    try {
      const r = await fetch(`http://127.0.0.1:${puertoSin}/api/documentos/subidas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-titularA' },
        body: JSON.stringify({ storagePath: rutaFacturaA(), contentType: 'application/pdf', tamanoBytes: 10 }),
      });
      expect(r.status).toBe(503);
      expect(await r.json()).toMatchObject({ ok: false, codigo: 'CUSTODIA_NO_DISPONIBLE' });
      const previa = configurarAlmacenServidor({ fetchImpl: async (entrada, init) => fetch(`http://127.0.0.1:${puertoSin}${String(entrada)}`, init) });
      como('titularA');
      const e = await subirBinarioDuradero(null, { storagePath: rutaFacturaA(), datos: new Blob([PDF]), contentType: 'application/pdf' }).catch((x: unknown) => x);
      configurarAlmacenServidor(previa);
      expect(e).toBeInstanceOf(ErrorCustodiaDocumento);
      expect((e as ErrorCustodiaDocumento).codigo).toBe('RED');
    } finally {
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
  });

  it('la fuente de autorización caída ⇒ 503 FUENTE_NO_DISPONIBLE (nunca permiso ni denegación inventados)', async () => {
    const ruta = rutaFacturaA();
    await subirComo('titularA', ruta);
    const leerOriginal = puerto.leerDocumento;
    puerto.leerDocumento = async () => { throw new Error('firestore caído'); };
    try {
      const r = await http('/api/documentos/acceso', { storagePath: ruta }, 'titularA');
      expect(r.status).toBe(503);
      expect(r.json.codigo).toBe('FUENTE_NO_DISPONIBLE');
      como('titularA');
      expect(await codigoDe(getDownloadURL(ref(null, ruta)))).toBe('FUENTE_NO_DISPONIBLE');
    } finally {
      puerto.leerDocumento = leerOriginal;
    }
    expect(await codigoDe(getDownloadURL(ref(null, ruta)))).toBe('PERMITIDO');
  });
});
