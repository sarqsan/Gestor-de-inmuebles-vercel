/**
 * AG-03.2 · Motor de almacén MEDIADO POR EL SERVIDOR (cliente) — contrato con
 * `/api/documentos/*` y con la URI de sesión de Cloud Storage, sin red real.
 *
 * Qué demuestra (unitario, dobles explícitos de `fetch` y del token):
 *  · Cada operación lleva el ID token de la sesión como `Bearer`; sin sesión
 *    no se llama al servidor (salvo la vía pública con token de solicitud).
 *  · `uploadBytes`: inicio → `PUT` de un solo tramo a la URI de sesión →
 *    confirmación; resuelve SÓLO con la confirmación del servidor; tamaño
 *    distinto ⇒ error; `YA_EXISTE` evita el reenvío; plazo/`signal` cancelan.
 *  · Los códigos del servidor se traducen a códigos `storage/*` estables.
 *  · `getDownloadURL`/`getMetadata` pasan por `/acceso`; `getBytes` reintenta
 *    una vez si el token de descarga acaba de rotar; `deleteObject` traduce
 *    `NO_EXISTE` a `storage/object-not-found` (paridad con el SDK).
 *  · Fallo cerrado: ninguna rama devuelve data-URL, memoria ni referencias
 *    `server_*`/`local_*`.
 * Qué NO demuestra: CORS de la URI de sesión en el navegador real ni la
 * autorización con cuentas reales (aceptación, V).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ErrorAlmacenServidor,
  PLAZO_ENVIO_BYTES_MS,
  configurarAlmacenServidor,
  deleteObject,
  getBytes,
  getDownloadURL,
  getMetadata,
  ref,
  subirDocumentoPublico,
  uploadBytes,
  type ConfiguracionAlmacenServidor,
} from './almacenServidor';

const SESION = 'https://storage.googleapis.com/upload/storage/v1/b/b/o?uploadType=resumable&upload_id=1';
const URL_TOKEN = (path: string, token = 't1') => `https://firebasestorage.googleapis.com/v0/b/b/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
const RUTA = 'gastos_facturas/prop_A/g1/1_f.pdf';

type Llamada = { url: string; method: string; headers: Record<string, string>; body?: unknown; signal?: AbortSignal | null };

function json(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Servidor + Storage sintéticos programables por URL. */
function crearEntorno(handlers: Record<string, (llamada: Llamada, n: number) => Response | Promise<Response>>) {
  const llamadas: Llamada[] = [];
  const contadores = new Map<string, number>();
  const fetchImpl: typeof fetch = async (entrada, init) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const llamada: Llamada = { url, method: init?.method || 'GET', headers: (init?.headers as Record<string, string>) || {}, body: init?.body, signal: init?.signal };
    llamadas.push(llamada);
    const clave = Object.keys(handlers).find((k) => url === k || url.startsWith(k));
    if (!clave) throw new TypeError(`Failed to fetch (sin handler): ${url}`);
    const n = (contadores.get(clave) || 0) + 1;
    contadores.set(clave, n);
    return handlers[clave](llamada, n);
  };
  return { llamadas, fetchImpl };
}

const servidorOk = (extras: Record<string, (l: Llamada, n: number) => Response | Promise<Response>> = {}) => crearEntorno({
  '/api/documentos/subidas/confirmar': (l) => {
    const { storagePath } = JSON.parse(String(l.body));
    return json(200, { ok: true, storagePath, metadatos: { storagePath, tamanoBytes: 4, contentType: 'application/pdf', generation: '7', customMetadata: { origen: 'documentos' } }, url: URL_TOKEN(storagePath) });
  },
  '/api/documentos/subidas': () => json(200, { ok: true, estado: 'SESION', sesionUri: SESION, storagePath: RUTA }),
  [SESION]: () => json(200, { name: RUTA, size: '4' }),
  ...extras,
});

let previa: ConfiguracionAlmacenServidor;
let token: string | null = 'tok-sesion';

beforeEach(() => {
  token = 'tok-sesion';
});
afterEach(() => {
  configurarAlmacenServidor(previa);
  vi.useRealTimers();
});

function usar(fetchImpl: typeof fetch) {
  previa = configurarAlmacenServidor({ fetchImpl, obtenerToken: async () => token });
}

const blob = (n = 4) => new Blob([new Uint8Array(n)], { type: 'application/pdf' });

describe('uploadBytes · inicio → PUT directo → confirmación', () => {
  it('recorre las tres fases con Bearer, Content-Type real, y sólo resuelve con la confirmación', async () => {
    const { llamadas, fetchImpl } = servidorOk();
    usar(fetchImpl);
    const r = await uploadBytes(ref(null, RUTA), blob(), { contentType: 'application/pdf', customMetadata: { origenCliente: 'x' } });
    expect(llamadas.map((l) => `${l.method} ${l.url}`)).toEqual([
      'POST /api/documentos/subidas',
      `PUT ${SESION}`,
      'POST /api/documentos/subidas/confirmar',
    ]);
    expect(llamadas[0].headers.Authorization).toBe('Bearer tok-sesion');
    expect(JSON.parse(String(llamadas[0].body))).toEqual({ storagePath: RUTA, contentType: 'application/pdf', tamanoBytes: 4, customMetadata: { origenCliente: 'x' } });
    expect(llamadas[1].headers['Content-Type']).toBe('application/pdf');
    expect(llamadas[1].headers.Authorization).toBeUndefined(); // la URI de sesión es la credencial; nunca se envía el ID token a Storage
    expect(llamadas[1].body).toBeInstanceOf(Blob);
    expect(llamadas[2].headers.Authorization).toBe('Bearer tok-sesion');
    expect(r.yaExistia).toBe(false);
    expect(r.url).toBe(URL_TOKEN(RUTA));
    expect(r.metadata).toMatchObject({ fullPath: RUTA, name: '1_f.pdf', size: 4, contentType: 'application/pdf', generation: '7', customMetadata: { origen: 'documentos' } });
  });

  it('sin sesión no se llama al servidor (storage/unauthenticated); el servidor con 401 también', async () => {
    const { llamadas, fetchImpl } = servidorOk({ '/api/documentos/subidas': () => json(401, { ok: false, codigo: 'NO_AUTENTICADO', error: 'Sesión caducada.' }) });
    usar(fetchImpl);
    token = null;
    await expect(uploadBytes(ref(null, RUTA), blob(), {})).rejects.toMatchObject({ code: 'storage/unauthenticated' });
    expect(llamadas).toHaveLength(0);
    token = 'tok-sesion';
    await expect(uploadBytes(ref(null, RUTA), blob(), {})).rejects.toMatchObject({ code: 'storage/unauthenticated', codigoServidor: 'NO_AUTENTICADO', status: 401 });
  });

  it('traduce los códigos del servidor a códigos storage/* estables y conserva código/motivo del servidor', async () => {
    const casos: Array<[number, string, string]> = [
      [403, 'SIN_PERMISO', 'storage/unauthorized'],
      [403, 'RUTA_NO_ADMITIDA', 'storage/unauthorized'], // el servidor responde 403: fuera del catálogo ⇒ sin permiso (como las reglas antiguas)
      [403, 'SOLICITUD_NO_VALIDA', 'storage/unauthorized'],
      [400, 'PETICION_INVALIDA', 'storage/invalid-argument'],
      [400, 'ARCHIVO_INVALIDO', 'storage/invalid-argument'],
      [413, 'ARCHIVO_DEMASIADO_GRANDE', 'storage/invalid-argument'],
      [409, 'OBJETO_INCOMPLETO', 'storage/server-file-wrong-size'],
      [503, 'CUSTODIA_NO_DISPONIBLE', 'storage/retry-limit-exceeded'],
      [503, 'FUENTE_NO_DISPONIBLE', 'storage/retry-limit-exceeded'],
      [404, 'OBJETO_NO_ENCONTRADO', 'storage/object-not-found'],
    ];
    for (const [status, codigo, esperado] of casos) {
      const { fetchImpl } = servidorOk({ '/api/documentos/subidas': () => json(status, { ok: false, codigo, error: 'x', motivo: 'M' }) });
      usar(fetchImpl);
      const error = await uploadBytes(ref(null, RUTA), blob(), {}).catch((e: unknown) => e);
      expect(error, codigo).toBeInstanceOf(ErrorAlmacenServidor);
      expect((error as ErrorAlmacenServidor).code, codigo).toBe(esperado);
      expect((error as ErrorAlmacenServidor).codigoServidor).toBe(codigo);
      expect((error as ErrorAlmacenServidor).motivo).toBe('M');
      expect((error as ErrorAlmacenServidor).storagePath).toBe(RUTA);
      configurarAlmacenServidor(previa);
    }
  });

  it('YA_EXISTE (mismo contenido ya custodiado) ⇒ resuelve sin PUT ni confirmación, con yaExistia=true', async () => {
    const { llamadas, fetchImpl } = servidorOk({
      '/api/documentos/subidas': () => json(200, { ok: true, estado: 'YA_EXISTE', storagePath: RUTA, metadatos: { tamanoBytes: 4, contentType: 'application/pdf', generation: '1' }, url: URL_TOKEN(RUTA) }),
    });
    usar(fetchImpl);
    const r = await uploadBytes(ref(null, RUTA), blob(), {});
    expect(r.yaExistia).toBe(true);
    expect(r.url).toBe(URL_TOKEN(RUTA));
    expect(llamadas).toHaveLength(1);
  });

  it('la confirmación con tamaño distinto NO es éxito (storage/server-file-wrong-size); una sesión inválida tampoco', async () => {
    const { fetchImpl } = servidorOk({
      '/api/documentos/subidas/confirmar': () => json(200, { ok: true, storagePath: RUTA, metadatos: { tamanoBytes: 3, contentType: 'application/pdf', generation: '7' } }),
    });
    usar(fetchImpl);
    await expect(uploadBytes(ref(null, RUTA), blob(4), {})).rejects.toMatchObject({ code: 'storage/server-file-wrong-size' });
    const { llamadas, fetchImpl: f2 } = servidorOk({ '/api/documentos/subidas': () => json(200, { ok: true, estado: 'SESION', sesionUri: 'javascript:alert(1)', storagePath: RUTA }) });
    configurarAlmacenServidor(previa);
    usar(f2);
    await expect(uploadBytes(ref(null, RUTA), blob(4), {})).rejects.toMatchObject({ code: 'storage/unknown', motivo: 'SESION_INVALIDA' });
    expect(llamadas.filter((l) => l.method === 'PUT')).toHaveLength(0);
  });

  it('respuestas del almacén en el PUT: 308 ⇒ wrong-size; 404/410 (sesión caducada) ⇒ retry-limit; 412 ⇒ OBJETO_EXISTENTE; 5xx ⇒ retry-limit', async () => {
    const casos: Array<[number, string, string | undefined]> = [
      [308, 'storage/server-file-wrong-size', undefined],
      [404, 'storage/retry-limit-exceeded', undefined],
      [410, 'storage/retry-limit-exceeded', undefined],
      [412, 'storage/unknown', 'OBJETO_EXISTENTE'],
      [503, 'storage/retry-limit-exceeded', undefined],
    ];
    for (const [status, code, codigoServidor] of casos) {
      const { llamadas, fetchImpl } = servidorOk({ [SESION]: () => new Response('', { status }) });
      usar(fetchImpl);
      const error = await uploadBytes(ref(null, RUTA), blob(), {}).catch((e: unknown) => e) as ErrorAlmacenServidor;
      expect(error.code, String(status)).toBe(code);
      if (codigoServidor) expect(error.codigoServidor).toBe(codigoServidor);
      expect(llamadas.some((l) => l.url.endsWith('/confirmar')), String(status)).toBe(false); // sin confirmación ⇒ sin éxito
      configurarAlmacenServidor(previa);
    }
  });

  it('plazo agotado ⇒ aborta el PUT (motivo PLAZO); `signal` externo ⇒ motivo CANCELADO; archivo vacío ⇒ invalid-argument sin red', async () => {
    vi.useFakeTimers();
    const colgada = (l: Llamada) => new Promise<Response>((_r, reject) => {
      l.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    const { llamadas, fetchImpl } = servidorOk({ [SESION]: colgada });
    usar(fetchImpl);
    const p1 = uploadBytes(ref(null, RUTA), blob(), {}, { plazoMs: 1000 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p1).toMatchObject({ code: 'storage/canceled', motivo: 'PLAZO' });
    expect(llamadas.at(-1)?.signal?.aborted).toBe(true);

    const controlador = new AbortController();
    const p2 = uploadBytes(ref(null, RUTA), blob(), {}, { signal: controlador.signal }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10);
    controlador.abort();
    await vi.advanceTimersByTimeAsync(1);
    expect(await p2).toMatchObject({ code: 'storage/canceled', motivo: 'CANCELADO' });

    const antes = llamadas.length;
    await expect(uploadBytes(ref(null, RUTA), new Blob([]), {})).rejects.toMatchObject({ code: 'storage/invalid-argument' });
    expect(llamadas.length).toBe(antes);
    expect(PLAZO_ENVIO_BYTES_MS).toBe(90_000);
  });

  it('red caída hacia el servidor o hacia el almacén ⇒ retry-limit-exceeded con el mensaje de la causa en `motivo`', async () => {
    usar(crearEntorno({}).fetchImpl);
    await expect(uploadBytes(ref(null, RUTA), blob(), {})).rejects.toMatchObject({ code: 'storage/retry-limit-exceeded', motivo: expect.stringContaining('Failed to fetch') });
    configurarAlmacenServidor(previa);
    const { fetchImpl } = servidorOk({ [SESION]: () => { throw new TypeError('Failed to fetch'); } });
    usar(fetchImpl);
    await expect(uploadBytes(ref(null, RUTA), blob(), {})).rejects.toMatchObject({ code: 'storage/retry-limit-exceeded' });
  });
});

describe('subirDocumentoPublico · portal de candidatos sin sesión', () => {
  it('usa las rutas públicas con {solicitudDocId, token} y no exige ID token; con sesión también lo adjunta', async () => {
    const RUTA_SOL = 'documentos_solicitados/sol-1/item_1_dni.pdf';
    const { llamadas, fetchImpl } = crearEntorno({
      '/api/documentos/publico/subidas/confirmar': () => json(200, { ok: true, storagePath: RUTA_SOL, metadatos: { tamanoBytes: 4, contentType: 'application/pdf', generation: '1' }, url: URL_TOKEN(RUTA_SOL) }),
      '/api/documentos/publico/subidas': () => json(200, { ok: true, estado: 'SESION', sesionUri: SESION, storagePath: RUTA_SOL }),
      [SESION]: () => json(200, {}),
    });
    usar(fetchImpl);
    token = null;
    const r = await subirDocumentoPublico({ storagePath: RUTA_SOL, datos: blob(), contentType: 'application/pdf', solicitudDocId: 'sol-1', token: 'tok-sol' });
    expect(r.url).toBe(URL_TOKEN(RUTA_SOL));
    expect(llamadas.map((l) => l.method + ' ' + l.url)).toEqual(['POST /api/documentos/publico/subidas', `PUT ${SESION}`, 'POST /api/documentos/publico/subidas/confirmar']);
    expect(JSON.parse(String(llamadas[0].body))).toMatchObject({ solicitudDocId: 'sol-1', token: 'tok-sol', storagePath: RUTA_SOL, tamanoBytes: 4 });
    expect(JSON.parse(String(llamadas[2].body))).toMatchObject({ solicitudDocId: 'sol-1', token: 'tok-sol', storagePath: RUTA_SOL });
    expect(llamadas[0].headers.Authorization).toBeUndefined();
  });
  it('token de solicitud inválido ⇒ el servidor deniega (SOLICITUD_NO_VALIDA) y no hay PUT', async () => {
    const { llamadas, fetchImpl } = crearEntorno({
      '/api/documentos/publico/subidas': () => json(403, { ok: false, codigo: 'SOLICITUD_NO_VALIDA', error: 'El enlace no es válido o ha caducado.' }),
    });
    usar(fetchImpl);
    token = null;
    await expect(subirDocumentoPublico({ storagePath: 'documentos_solicitados/sol-1/x.pdf', datos: blob(), contentType: 'application/pdf', solicitudDocId: 'sol-1', token: 'malo' }))
      .rejects.toMatchObject({ code: 'storage/unauthorized', codigoServidor: 'SOLICITUD_NO_VALIDA' });
    expect(llamadas).toHaveLength(1);
  });
});

describe('getDownloadURL / getMetadata / getBytes / deleteObject', () => {
  it('getDownloadURL y getMetadata pasan por /acceso con Bearer; una URL no http se rechaza', async () => {
    const { llamadas, fetchImpl } = crearEntorno({
      '/api/documentos/acceso': (_l, n) => json(200, { ok: true, storagePath: RUTA, url: n === 3 ? 'ftp://x' : URL_TOKEN(RUTA), metadatos: { tamanoBytes: 9, contentType: 'application/pdf', generation: '3', customMetadata: { sha256: 'abc' } } }),
    });
    usar(fetchImpl);
    expect(await getDownloadURL(ref(null, RUTA))).toBe(URL_TOKEN(RUTA));
    expect(await getMetadata(ref(null, RUTA))).toMatchObject({ fullPath: RUTA, size: 9, contentType: 'application/pdf', generation: '3', customMetadata: { sha256: 'abc' } });
    await expect(getDownloadURL(ref(null, RUTA))).rejects.toMatchObject({ code: 'storage/unknown', motivo: 'URL_INVALIDA' });
    expect(llamadas.every((l) => l.url === '/api/documentos/acceso' && l.headers.Authorization === 'Bearer tok-sesion')).toBe(true);
    expect(llamadas.every((l) => JSON.parse(String(l.body)).storagePath === RUTA)).toBe(true);
  });

  it('getBytes descarga desde la URL autorizada; si el token acaba de rotar (403/404) vuelve a pedir URL UNA vez; límite de tamaño', async () => {
    let tokenActual = 't1';
    const { llamadas, fetchImpl } = crearEntorno({
      '/api/documentos/acceso': () => json(200, { ok: true, storagePath: RUTA, url: URL_TOKEN(RUTA, tokenActual), metadatos: {} }),
      'https://firebasestorage.googleapis.com/': (l) => {
        if (!l.url.endsWith(`token=${tokenActual}`)) return new Response('', { status: 403 });
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      },
    });
    usar(fetchImpl);
    const bytes = await getBytes(ref(null, RUTA));
    expect(new Uint8Array(bytes)).toEqual(new Uint8Array([1, 2, 3]));
    expect(llamadas.filter((l) => l.url === '/api/documentos/acceso')).toHaveLength(1);
    // Rotación entre la URL y la descarga: la primera descarga falla con 403, se repide la URL y se completa.
    const { llamadas: l2, fetchImpl: f2 } = crearEntorno({
      '/api/documentos/acceso': (_l, n) => json(200, { ok: true, storagePath: RUTA, url: URL_TOKEN(RUTA, `t${n}`), metadatos: {} }),
      'https://firebasestorage.googleapis.com/': (l) => (l.url.endsWith('token=t1') ? new Response('', { status: 403 }) : new Response(new Uint8Array([9]), { status: 200 })),
    });
    configurarAlmacenServidor(previa);
    usar(f2);
    expect(new Uint8Array(await getBytes(ref(null, RUTA)))).toEqual(new Uint8Array([9]));
    expect(l2.filter((l) => l.url === '/api/documentos/acceso')).toHaveLength(2);
    // Segundo 403 ⇒ no hay tercer intento: storage/unauthorized.
    const { llamadas: l3, fetchImpl: f3 } = crearEntorno({
      '/api/documentos/acceso': () => json(200, { ok: true, storagePath: RUTA, url: URL_TOKEN(RUTA), metadatos: {} }),
      'https://firebasestorage.googleapis.com/': () => new Response('', { status: 403 }),
    });
    configurarAlmacenServidor(previa);
    usar(f3);
    await expect(getBytes(ref(null, RUTA))).rejects.toMatchObject({ code: 'storage/unauthorized' });
    expect(l3.filter((l) => l.url.startsWith('https://firebasestorage'))).toHaveLength(2);
    // Límite de descarga.
    configurarAlmacenServidor(previa);
    usar(fetchImpl);
    tokenActual = 't1';
    await expect(getBytes(ref(null, RUTA), 2)).rejects.toMatchObject({ code: 'storage/invalid-argument' });
  });

  it('deleteObject: BORRADO ⇒ resuelve; NO_EXISTE ⇒ storage/object-not-found (paridad SDK); denegado ⇒ unauthorized', async () => {
    const { llamadas, fetchImpl } = crearEntorno({
      '/api/documentos/borrar': (_l, n) => (n === 1 ? json(200, { ok: true, estado: 'BORRADO' }) : n === 2 ? json(200, { ok: true, estado: 'NO_EXISTE' }) : json(403, { ok: false, codigo: 'SIN_PERMISO', error: 'x' })),
    });
    usar(fetchImpl);
    await expect(deleteObject(ref(null, RUTA))).resolves.toBeUndefined();
    await expect(deleteObject(ref(null, RUTA))).rejects.toMatchObject({ code: 'storage/object-not-found', status: 404 });
    await expect(deleteObject(ref(null, RUTA))).rejects.toMatchObject({ code: 'storage/unauthorized' });
    expect(llamadas.every((l) => l.method === 'POST' && JSON.parse(String(l.body)).storagePath === RUTA)).toBe(true);
  });

  it('ref: referencia con fullPath/name/path (compatibilidad con consumidores del SDK); configurarAlmacenServidor devuelve la configuración previa', () => {
    const r = ref({ cualquierCosa: true }, 'a/b/c.pdf');
    expect(r).toMatchObject({ fullPath: 'a/b/c.pdf', name: 'c.pdf' });
    const devuelta = configurarAlmacenServidor({});
    expect(typeof devuelta.fetchImpl).toBe('function');
    expect(typeof devuelta.obtenerToken).toBe('function');
    previa = devuelta;
  });
});
