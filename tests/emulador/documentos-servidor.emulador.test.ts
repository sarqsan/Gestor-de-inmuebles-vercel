/**
 * AG-03.2 — CUSTODIA DOCUMENTAL MEDIADA POR EL SERVIDOR contra los EMULADORES OFICIALES
 * (Auth + Firestore CON NOMBRE + Storage), sólo proyecto demo-gestor-reglas.
 * -----------------------------------------------------------------------------
 * Qué certifica (código REAL de la app: motor cliente `almacenServidor.ts`,
 * rutas `server/documentos/rutasDocumentos.ts`, servicio y autorizador, cliente
 * REST de Storage y de Firestore apuntados a los emuladores):
 *  1. La autorización se resuelve ÚNICAMENTE con datos de la base Firestore con
 *     nombre (`BASE_DATOS_P2`); `(default)` permanece vacía durante toda la suite.
 *  2. Titular: inicio → PUT directo a la sesión reanudable → confirmación; el
 *     objeto queda con metadatos fijados por el servidor y se descarga por la URL
 *     autorizada con huella idéntica. El reintento no duplica (`YA_EXISTE`).
 *  3. Cartera E opera; otro titular y anónimo quedan denegados; la revocación del
 *     espejo bloquea las operaciones nuevas; el master lee sin enmascarar el
 *     fallo del titular ajeno.
 *  4. Límites de tipo/tamaño del destino aplicados por el servidor ANTES de abrir
 *     sesión; confirmación sin bytes ⇒ `OBJETO_INCOMPLETO` y ningún objeto.
 *  5. Portal público: token de solicitud correcto ⇒ sube; incorrecto ⇒ denegado;
 *     el titular del inmueble lee lo aportado.
 *  6. Catálogo: la foto subida por el servidor es legible SIN sesión por la ruta
 *     pública que conceden las reglas; una factura no lo es.
 *  7. Borrado idempotente y acotado al ámbito.
 *
 * Fail-closed: `validarEntornoP2()` antes de cualquier escritura (NODE_ENV=test,
 * proyecto demo, hosts 127.0.0.1 exactos, sin credenciales de servicio). Ningún
 * request sale de los emuladores (`fetchSoloEmuladores`). Datos 100 % sintéticos.
 *
 * Estado: escrita en AG-03.2 SIN emulador disponible en el entorno de desarrollo
 * (V — pendiente de ejecución con `npm run test:emulador:reglas`). Se apoya en
 * las mismas utilidades que la suite P2 ya ejecutada contra emuladores.
 * Límite conocido: el emulador v15.33.0 sólo registra `PATCH` de metadatos en
 * `/b/{bucket}/o/{objeto}` (no bajo `/storage/v1/`), por lo que los destinos con
 * token ROTATORIO (patrimoniales/profesionales) no se cubren aquí: su
 * autorización se demuestra en `server/documentos/*.test.ts`.
 */
import express from 'express';
import { createServer, type Server } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearServicioDocumentos } from '../../server/documentos/servicioDocumentos';
import { montarRutasDocumentos } from '../../server/documentos/rutasDocumentos';
import { EMAIL_MASTER } from '../../server/titularidades/backendTitulares';
import {
  ErrorAlmacenServidor,
  configurarAlmacenServidor,
  deleteObject,
  getBytes,
  getDownloadURL,
  ref,
  uploadBytes,
  type ConfiguracionAlmacenServidor,
} from '../../src/lib/custodiaDocumental/almacenServidor';
import { ErrorCustodiaDocumento, LIMITES_PREFIJO, subirBinarioDuradero } from '../../src/lib/custodiaDocumental/subidaDirecta';
import {
  BASE_DATOS_P2,
  BUCKET_P2,
  PROYECTO_P2,
  borrarCuentaAuthEmulador,
  crearCuentaAuthEmulador,
  crearFirestoreP2,
  crearStorageP2,
  fetchSoloEmuladores,
  validarEntornoP2,
  verificarTokenAuthEmulador,
  type CuentaAuthEmulador,
} from './justificantes-cobro.emulador-util';

const RUN = randomUUID().replace(/-/g, '').slice(0, 10);
const PDF = new TextEncoder().encode(`%PDF-1.7\n% AG-03.2 factura sintetica ${RUN}\n%%EOF`);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const sha = (b: Uint8Array | ArrayBuffer) => createHash('sha256').update(b instanceof Uint8Array ? b : new Uint8Array(b)).digest('hex');
const PROP_A = `prop-ag03-a-${RUN}`;
const PROP_B = `prop-ag03-b-${RUN}`;
const INM_A = `inm-ag03-a-${RUN}`;
const CAND_A = `cand-ag03-${RUN}`;
const SOL_A = `sol-ag03-${RUN}`;
const TOKEN_SOL = `tok-ag03-${RUN}-0123456789`;
const RUTA_FACTURA = `gastos_facturas/${PROP_A}/gasto-${RUN}/1_factura.pdf`;
const RUTA_FOTO = `inmuebles/${INM_A}/portada-${RUN}.jpg`;

const firestore = crearFirestoreP2();
const storage = crearStorageP2();
const servidores: Server[] = [];
const cuentas: CuentaAuthEmulador[] = [];
const sembrados: Array<[string, string]> = [];
const objetos = new Set<string>();
let puerto = 0;
let tokenActivo: string | null = null;
let configuracionPrevia: ConfiguracionAlmacenServidor | null = null;
let titularA: CuentaAuthEmulador;
let titularB: CuentaAuthEmulador;
let gestorE: CuentaAuthEmulador;
let master: CuentaAuthEmulador;

async function sembrar(coleccion: string, id: string, datos: Record<string, unknown>): Promise<void> {
  const r = await firestore.crearDocumento(coleccion, id, datos);
  if (r !== 'CREADO') throw new Error(`AG03_FIXTURE_EXISTENTE:${coleccion}/${id}`);
  sembrados.push([coleccion, id]);
}

async function identidad(cuenta: CuentaAuthEmulador, usuarioId: string, tipoPerfil: string, espejo: Record<string, unknown>): Promise<void> {
  await sembrar('usuarios_auth', cuenta.uid, { usuarioId, tipoPerfil, estado: 'ACTIVO', authUid: cuenta.uid, propietarioId: '', profesionalId: '', inmuebleIds: [], ...espejo });
  await sembrar('usuarios', usuarioId, { id: usuarioId, authUid: cuenta.uid, tipoPerfil, estado: 'ACTIVO', ...espejo });
}

const como = (cuenta: CuentaAuthEmulador | null) => { tokenActivo = cuenta ? cuenta.idToken : null; };

/** Enrutador del motor cliente: rutas relativas → servidor en proceso; absolutas → sólo emuladores. */
const fetchMotor: typeof fetch = async (entrada, init) => {
  const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
  const destino = url.startsWith('/') ? `http://127.0.0.1:${puerto}${url}` : url;
  return await fetchSoloEmuladores(destino, init as never) as unknown as Response;
};

async function llamarServidor(ruta: string, cuerpo: unknown, cuenta: CuentaAuthEmulador | null): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(`http://127.0.0.1:${puerto}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cuenta ? { Authorization: `Bearer ${cuenta.idToken}` } : {}) },
    body: JSON.stringify(cuerpo),
  });
  return { status: r.status, json: await r.json() as Record<string, unknown> };
}

async function documentosEn(baseDatos: string, coleccion: string): Promise<number> {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${PROYECTO_P2}/databases/${encodeURIComponent(baseDatos)}/documents/${coleccion}?pageSize=5`;
  const r = await fetchSoloEmuladores(url, { headers: { Authorization: 'Bearer owner' } });
  if (!r.ok) throw new Error(`AG03_FIRESTORE_LIST_HTTP_${r.status}`);
  const datos = await r.json() as { documents?: unknown[] };
  return datos.documents?.length ?? 0;
}

const codigoDe = async (p: Promise<unknown>): Promise<string> => {
  try { await p; return 'PERMITIDO'; } catch (e) {
    if (e instanceof ErrorCustodiaDocumento) return e.codigo;
    if (e instanceof ErrorAlmacenServidor) return e.codigoServidor || e.code;
    return (e as { code?: string }).code || 'ERROR';
  }
};

async function vaciarBaseEmulador(baseDatos: string): Promise<void> {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROYECTO_P2}/databases/${encodeURIComponent(baseDatos)}/documents`;
  const r = await fetchSoloEmuladores(url, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  if (!r.ok) throw new Error(`AG03_FIRESTORE_RESET_HTTP_${r.status}`);
}

beforeAll(async () => {
  validarEntornoP2();
  // Punto de partida verificable: `(default)` del emulador vacía (ninguna suite debe depender de ella).
  await vaciarBaseEmulador('(default)');
  titularA = await crearCuentaAuthEmulador(`ag03-titular-a-${RUN}@sintetico.invalid`);
  titularB = await crearCuentaAuthEmulador(`ag03-titular-b-${RUN}@sintetico.invalid`);
  gestorE = await crearCuentaAuthEmulador(`ag03-gestor-e-${RUN}@sintetico.invalid`);
  master = await crearCuentaAuthEmulador(EMAIL_MASTER);
  cuentas.push(titularA, titularB, gestorE, master);

  // Sólo la base CON NOMBRE recibe datos de ámbito.
  await identidad(titularA, `usr-ag03-a-${RUN}`, 'PROPIETARIO', { propietarioId: PROP_A });
  await identidad(titularB, `usr-ag03-b-${RUN}`, 'PROPIETARIO', { propietarioId: PROP_B });
  await identidad(gestorE, `usr-ag03-e-${RUN}`, 'PROFESIONAL', { profesionalId: `ge-${RUN}`, carterasE: [PROP_A] });
  await sembrar('inmuebles', INM_A, { id: INM_A, propietarioId: PROP_A, propietarioPrincipalId: PROP_A, direccion: 'Calle Sintética AG-03 1' });
  await sembrar('candidatos', CAND_A, { id: CAND_A, inmuebleId: INM_A, nombre: 'Candidato sintético' });
  await sembrar('solicitudes_documentacion', SOL_A, { id: SOL_A, candidatoId: CAND_A, inmuebleId: INM_A, token: TOKEN_SOL, estado: 'PENDIENTE' });

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  montarRutasDocumentos(app, {
    verificarToken: verificarTokenAuthEmulador,
    servicio: crearServicioDocumentos({ puerto: firestore, almacen: storage }),
  });
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const direccion = server.address();
  if (!direccion || typeof direccion === 'string') throw new Error('AG03_HTTP_SIN_PUERTO');
  puerto = direccion.port;
  servidores.push(server);
  configuracionPrevia = configurarAlmacenServidor({ fetchImpl: fetchMotor, obtenerToken: async () => tokenActivo });
}, 120_000);

afterAll(async () => {
  if (configuracionPrevia) configurarAlmacenServidor(configuracionPrevia);
  for (const path of objetos) await storage.borrar(path).catch(() => undefined);
  for (const [coleccion, id] of sembrados) {
    const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${PROYECTO_P2}/databases/${encodeURIComponent(BASE_DATOS_P2)}/documents/${coleccion}/${encodeURIComponent(id)}`;
    await fetchSoloEmuladores(url, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } }).catch(() => undefined);
  }
  for (const cuenta of cuentas) await borrarCuentaAuthEmulador(cuenta.idToken).catch(() => undefined);
  for (const server of servidores) await new Promise<void>((resolve) => server.close(() => resolve()));
}, 120_000);

describe('AG-03.2 · custodia mediada por el servidor (emuladores oficiales)', () => {
  it('1 · (default) está vacía y la base con nombre contiene el ámbito: el servidor sólo leerá esta última', async () => {
    expect(await documentosEn('(default)', 'usuarios_auth')).toBe(0);
    expect(await documentosEn('(default)', 'usuarios')).toBe(0);
    expect(await documentosEn(BASE_DATOS_P2, 'usuarios_auth')).toBeGreaterThan(0);
    expect(firestore.baseDatosId).toBe(BASE_DATOS_P2);
  });

  it('2 · titular: inicio → PUT a la sesión → confirmación; objeto con metadatos del servidor; descarga autorizada con huella idéntica; reintento sin duplicar', async () => {
    como(titularA);
    const r = await subirBinarioDuradero(null, {
      storagePath: RUTA_FACTURA, datos: new Blob([PDF], { type: 'application/pdf' }), contentType: 'application/pdf', limite: LIMITES_PREFIJO.gastos_facturas,
      customMetadata: { sha256: sha(PDF) },
    });
    objetos.add(RUTA_FACTURA);
    expect(r.storagePath).toBe(RUTA_FACTURA);
    expect(r.url).toMatch(/\/v0\/b\/.+\/o\/.+\?alt=media&token=/);

    const m = await storage.metadatos(RUTA_FACTURA);
    expect(m).not.toBeNull();
    expect(m!.size).toBe(PDF.byteLength);
    expect(m!.contentType).toBe('application/pdf');
    expect(m!.metadata.custodia_origen).toBe('servidor-ag03');
    expect(m!.metadata.custodia_uid).toBe(titularA.uid);
    expect(m!.metadata.firebaseStorageDownloadTokens).toBeTruthy();

    const bytes = await getBytes(ref(null, RUTA_FACTURA));
    expect(sha(bytes)).toBe(sha(PDF));

    // Reintento idempotente: misma huella declarada, tamaño y tipo ⇒ YA_EXISTE sin volver a enviar bytes.
    const otraVez = await uploadBytes(ref(null, RUTA_FACTURA), new Blob([PDF], { type: 'application/pdf' }), { contentType: 'application/pdf', customMetadata: { sha256: sha(PDF) } });
    expect(otraVez.yaExistia).toBe(true);
    expect((await storage.metadatos(RUTA_FACTURA))!.generation).toBe(m!.generation);
    // Contenido DISTINTO sobre la misma ruta (destino no sobrescribible): rechazado, el objeto no cambia.
    const distinto = new TextEncoder().encode(`%PDF-1.7\n% otro ${RUN}\n%%EOF`);
    expect(await codigoDe(uploadBytes(ref(null, RUTA_FACTURA), new Blob([distinto]), { contentType: 'application/pdf', customMetadata: { sha256: sha(distinto) } }))).toBe('OBJETO_EXISTENTE');
    expect(await codigoDe(uploadBytes(ref(null, RUTA_FACTURA), new Blob([PDF]), { contentType: 'application/pdf' }))).toBe('OBJETO_EXISTENTE'); // sin huella declarada tampoco se pisa
    expect(sha(await getBytes(ref(null, RUTA_FACTURA)))).toBe(sha(PDF));
  });

  it('3 · cartera E lee y sube; otro titular y anónimo denegados; revocación bloquea; el master lee sin enmascarar el fallo ajeno', async () => {
    como(gestorE);
    expect(sha(await getBytes(ref(null, RUTA_FACTURA)))).toBe(sha(PDF));
    const rutaGestor = `gastos_facturas/${PROP_A}/gasto-e-${RUN}/1_factura_gestor.pdf`;
    await uploadBytes(ref(null, rutaGestor), new Blob([PDF]), { contentType: 'application/pdf' });
    objetos.add(rutaGestor);
    expect((await storage.metadatos(rutaGestor))!.metadata.custodia_uid).toBe(gestorE.uid);

    como(titularB);
    expect(await codigoDe(getDownloadURL(ref(null, RUTA_FACTURA)))).toBe('SIN_PERMISO');
    expect(await codigoDe(uploadBytes(ref(null, `gastos_facturas/${PROP_A}/gasto-b-${RUN}/1_f.pdf`), new Blob([PDF]), { contentType: 'application/pdf' }))).toBe('SIN_PERMISO');
    expect(await codigoDe(deleteObject(ref(null, RUTA_FACTURA)))).toBe('SIN_PERMISO');
    expect(await storage.metadatos(`gastos_facturas/${PROP_A}/gasto-b-${RUN}/1_f.pdf`)).toBeNull();

    como(null);
    expect(await codigoDe(getDownloadURL(ref(null, RUTA_FACTURA)))).toBe('storage/unauthenticated');
    const sinSesion = await llamarServidor('/api/documentos/acceso', { storagePath: RUTA_FACTURA }, null);
    expect(sinSesion.status).toBe(401);
    expect(sinSesion.json.codigo).toBe('NO_AUTENTICADO');

    // Revocación: el espejo deja de estar ACTIVO ⇒ la siguiente operación se deniega (lectura fresca por petición).
    await firestore.actualizarCampos('usuarios_auth', gestorE.uid, { estado: 'BLOQUEADO' });
    como(gestorE);
    expect(await codigoDe(getDownloadURL(ref(null, RUTA_FACTURA)))).toBe('SIN_PERMISO');
    await firestore.actualizarCampos('usuarios_auth', gestorE.uid, { estado: 'ACTIVO' });
    expect(await codigoDe(getDownloadURL(ref(null, RUTA_FACTURA)))).toBe('PERMITIDO');

    como(master);
    expect(sha(await getBytes(ref(null, RUTA_FACTURA)))).toBe(sha(PDF));
    como(titularB);
    expect(await codigoDe(getBytes(ref(null, RUTA_FACTURA)))).toBe('SIN_PERMISO');
  });

  it('4 · límites del destino en el servidor (tipo y tamaño) antes de abrir sesión; confirmación sin bytes ⇒ OBJETO_INCOMPLETO sin objeto', async () => {
    como(titularA);
    const rutaTxt = `gastos_facturas/${PROP_A}/gasto-t-${RUN}/notas.txt`;
    expect(await codigoDe(uploadBytes(ref(null, rutaTxt), new Blob(['hola']), { contentType: 'text/plain' }))).toBe('ARCHIVO_INVALIDO');
    expect(await storage.metadatos(rutaTxt)).toBeNull();

    const rutaGrande = `gastos_facturas/${PROP_A}/gasto-g-${RUN}/grande.pdf`;
    const grande = await llamarServidor('/api/documentos/subidas', { storagePath: rutaGrande, contentType: 'application/pdf', tamanoBytes: 12 * 1024 * 1024 + 1 }, titularA);
    expect(grande.status).toBe(413);
    expect(grande.json.codigo).toBe('ARCHIVO_DEMASIADO_GRANDE');
    expect(await storage.metadatos(rutaGrande)).toBeNull();

    const rutaIncompleta = `gastos_facturas/${PROP_A}/gasto-i-${RUN}/incompleta.pdf`;
    const inicio = await llamarServidor('/api/documentos/subidas', { storagePath: rutaIncompleta, contentType: 'application/pdf', tamanoBytes: PDF.byteLength }, titularA);
    expect(inicio.status).toBe(200);
    expect(inicio.json.estado).toBe('SESION');
    expect(String(inicio.json.sesionUri)).toMatch(/^http:\/\/127\.0\.0\.1:9199\//);
    const confirmacion = await llamarServidor('/api/documentos/subidas/confirmar', { storagePath: rutaIncompleta }, titularA);
    expect(confirmacion.status).toBeGreaterThanOrEqual(400);
    expect(confirmacion.json.codigo).toBe('OBJETO_INCOMPLETO');
    expect(await storage.metadatos(rutaIncompleta)).toBeNull();
  });

  it('5 · portal público: token de solicitud correcto sube sin sesión; incorrecto denegado; el titular del inmueble lo lee', async () => {
    como(null);
    const ruta = `documentos_solicitados/${SOL_A}/item-dni_${Date.now()}_dni.pdf`;
    const r = await subirBinarioDuradero(null, {
      storagePath: ruta, datos: new Blob([PDF]), contentType: 'application/pdf', limite: LIMITES_PREFIJO.documentos_solicitados,
      accesoPublico: { solicitudDocId: SOL_A, token: TOKEN_SOL },
    });
    objetos.add(ruta);
    expect(r.url).toContain('alt=media');
    expect((await storage.metadatos(ruta))!.metadata.custodia_uid).toBe('portal-publico');

    const rutaMala = `documentos_solicitados/${SOL_A}/item-dni_${Date.now()}_otro.pdf`;
    expect(await codigoDe(subirBinarioDuradero(null, {
      storagePath: rutaMala, datos: new Blob([PDF]), contentType: 'application/pdf', accesoPublico: { solicitudDocId: SOL_A, token: 'token-incorrecto-0123456789' },
    }))).toBe('SIN_PERMISO');
    expect(await storage.metadatos(rutaMala)).toBeNull();

    como(titularA);
    expect(sha(await getBytes(ref(null, ruta)))).toBe(sha(PDF));
    como(titularB);
    expect(await codigoDe(getDownloadURL(ref(null, ruta)))).toBe('SIN_PERMISO');
  });

  it('6 · catálogo: la foto subida por el servidor se lee SIN sesión por la ruta pública de las reglas; la factura no', async () => {
    como(titularA);
    await uploadBytes(ref(null, RUTA_FOTO), new Blob([JPG], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
    objetos.add(RUTA_FOTO);
    const base = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${encodeURIComponent(BUCKET_P2)}/o`;
    const foto = await fetchSoloEmuladores(`${base}/${encodeURIComponent(RUTA_FOTO)}?alt=media`, {});
    expect(foto.status).toBe(200);
    expect(sha(new Uint8Array(await foto.arrayBuffer!()))).toBe(sha(JPG));
    const factura = await fetchSoloEmuladores(`${base}/${encodeURIComponent(RUTA_FACTURA)}?alt=media`, {});
    expect(factura.status).toBe(403);
  });

  it('7 · borrado: el titular borra su factura; repetir ⇒ object-not-found; la foto ajena no se borra', async () => {
    como(titularA);
    await deleteObject(ref(null, RUTA_FACTURA));
    expect(await storage.metadatos(RUTA_FACTURA)).toBeNull();
    objetos.delete(RUTA_FACTURA);
    expect(await codigoDe(deleteObject(ref(null, RUTA_FACTURA)))).toBe('storage/object-not-found');
    como(titularB);
    expect(await codigoDe(deleteObject(ref(null, RUTA_FOTO)))).toBe('SIN_PERMISO');
    expect(await storage.metadatos(RUTA_FOTO)).not.toBeNull();
    // Durante toda la suite el servidor autorizó, subió, leyó y borró sin que `(default)` recibiera nada.
    expect(await documentosEn('(default)', 'usuarios_auth')).toBe(0);
    expect(await documentosEn('(default)', 'usuarios')).toBe(0);
  });
});
