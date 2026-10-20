import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ClienteGoogleStorageRest,
  ErrorAlmacenGoogleStorage,
  resolverBucketStorage,
} from './almacenGoogleStorage';
import { reiniciarCacheTokens, type CuentaServicio } from '../titularidades/googleBackend';

const par = generateKeyPairSync('rsa', { modulusLength: 2048 });
const cuenta: CuentaServicio = {
  project_id: 'proyecto-sintetico',
  client_email: 'cuenta-sintetica@proyecto-sintetico.iam.gserviceaccount.com',
  private_key: par.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};
const contenido = new Uint8Array(Buffer.from('%PDF-1.7\nprueba\n', 'ascii'));
const objectName = 'cobros_justificantes/prop-a/contrato-a/cobro-a/1_012345678901234567890123/comprobante.pdf';

afterEach(() => reiniciarCacheTokens());

describe('ClienteGoogleStorageRest · REST autenticado, creación condicional y recuperación', () => {
  it('crea el objeto privado con precondición de no sobrescritura y lo lee en una instancia nueva', async () => {
    const objeto = new Map<string, Uint8Array>();
    const llamadas: Array<{ url: string; method: string; headers: Record<string, string>; body?: Uint8Array }> = [];
    const fetchFake = async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array } = {}) => {
      const method = init.method || 'GET';
      const headers = init.headers || {};
      llamadas.push({ url, method, headers, ...(init.body instanceof Uint8Array ? { body: new Uint8Array(init.body) } : {}) });
      if (url === 'https://oauth2.googleapis.com/token') {
        return respuesta({ access_token: 'token-sintetico', expires_in: 3600 });
      }
      if (url.includes('/upload/storage/v1/')) {
        const parsed = new URL(url);
        const name = parsed.searchParams.get('name')!;
        expect(parsed.searchParams.get('ifGenerationMatch')).toBe('0');
        expect(headers.Authorization).toBe('Bearer token-sintetico');
        expect(headers['Content-Type']).toBe('application/pdf');
        const bytes = new Uint8Array(init.body as Uint8Array);
        objeto.set(name, bytes);
        return respuesta({ name, generation: '123456', size: String(bytes.byteLength), contentType: 'application/pdf' });
      }
      if (url.includes('?alt=media')) {
        const encoded = url.split('/o/')[1].split('?')[0];
        const name = decodeURIComponent(encoded);
        const bytes = objeto.get(name);
        if (!bytes) return respuesta({}, 404);
        return respuesta(bytes, 200, () => Uint8Array.from(bytes).buffer);
      }
      throw new Error('endpoint sintético inesperado');
    };
    const almacenA = new ClienteGoogleStorageRest({ cuenta, bucket: 'bucket-sintetico.appspot.com', fetchImpl: fetchFake as never });
    expect(await almacenA.guardar(objectName, contenido, 'application/pdf')).toBe('CREADO');
    expect(objeto.size).toBe(1);
    expect(llamadas.some((p) => p.method === 'POST' && p.body && Buffer.from(p.body).equals(Buffer.from(contenido)))).toBe(true);

    // Nueva instancia del cliente: lee por la API autenticada el mismo binario persistido.
    const almacenB = new ClienteGoogleStorageRest({ cuenta, bucket: 'bucket-sintetico.appspot.com', fetchImpl: fetchFake as never });
    const recuperado = await almacenB.leer(objectName);
    expect(Buffer.from(recuperado!)).toEqual(Buffer.from(contenido));
    expect(llamadas.some((p) => p.method === 'GET' && p.url.includes(encodeURIComponent(objectName)))).toBe(true);
  });

  it('un reintento no sobrescribe: devuelve YA_EXISTE y obliga al servicio a comparar bytes', async () => {
    const fetchFake = async (url: string) => {
      if (url === 'https://oauth2.googleapis.com/token') return respuesta({ access_token: 'token-sintetico', expires_in: 3600 });
      if (url.includes('/upload/storage/v1/')) return respuesta({ error: 'precondition failed' }, 412);
      throw new Error('no debe leer ni escribir en una URL inesperada');
    };
    const almacen = new ClienteGoogleStorageRest({ cuenta, bucket: 'bucket-sintetico.appspot.com', fetchImpl: fetchFake as never });
    await expect(almacen.guardar(objectName, contenido, 'application/pdf')).resolves.toBe('YA_EXISTE');
  });

  it('falla cerrado ante bucket, ruta, bytes o respuesta incompatibles', async () => {
    expect(resolverBucketStorage(() => JSON.stringify({ storageBucket: 'bucket-sintetico.appspot.com' })))
      .toBe('bucket-sintetico.appspot.com');
    expect(resolverBucketStorage(() => '{invalid')).toBeNull();
    expect(resolverBucketStorage(() => JSON.stringify({ storageBucket: 'https://example.test/bucket' }))).toBeNull();
    expect(() => new ClienteGoogleStorageRest({ cuenta, bucket: 'https://example.test', fetchImpl: (async () => respuesta({})) as never }))
      .toThrow('STORAGE_BUCKET_INVALIDO');
    const fetchFake = async (url: string) => url === 'https://oauth2.googleapis.com/token'
      ? respuesta({ access_token: 'token-sintetico', expires_in: 3600 })
      : respuesta({}, 500);
    const almacen = new ClienteGoogleStorageRest({ cuenta, bucket: 'bucket-sintetico.appspot.com', fetchImpl: fetchFake as never });
    await expect(almacen.guardar('../otro/archivo.pdf', contenido, 'application/pdf'))
      .rejects.toBeInstanceOf(ErrorAlmacenGoogleStorage);
    await expect(almacen.guardar(objectName, new Uint8Array(), 'application/pdf'))
      .rejects.toBeInstanceOf(ErrorAlmacenGoogleStorage);
    await expect(almacen.guardar(objectName, contenido, 'application/pdf'))
      .rejects.toMatchObject({ codigo: 'STORAGE_NO_DISPONIBLE' });
  });
});

describe('ClienteGoogleStorageRest · AG-03.2 métodos de custodia mediada (sesión reanudable, metadatos, borrado, token)', () => {
  const BUCKET = 'bucket-sintetico.appspot.com';
  const objetoMeta = (name: string, extra: Record<string, unknown> = {}) => ({
    name, bucket: BUCKET, generation: '987', size: '17', contentType: 'application/pdf', metadata: { origen: 'documentos', uid: 'uid-a' }, ...extra,
  });

  function crearFetch(opciones: { inicio?: number; metadatos?: number | 'json-roto' | 'otro-nombre'; borrar?: number; patch?: number } = {}) {
    const llamadas: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];
    const fetchFake = async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
      const method = init.method || 'GET';
      const headers = init.headers || {};
      llamadas.push({ url, method, headers, ...(typeof init.body === 'string' ? { body: init.body } : {}) });
      if (url === 'https://oauth2.googleapis.com/token') return respuesta({ access_token: 'token-sintetico', expires_in: 3600 });
      if (url.includes('/upload/storage/v1/') && method === 'POST') {
        const status = opciones.inicio ?? 200;
        return { ...respuesta({}, status), headers: { get: (k: string) => (k.toLowerCase() === 'location' && status === 200 ? 'https://storage.googleapis.com/upload/storage/v1/b/bucket/o?uploadType=resumable&upload_id=abc' : null) } };
      }
      const encoded = url.split('/o/')[1]?.split('?')[0];
      const name = encoded ? decodeURIComponent(encoded) : '';
      if (method === 'GET') {
        if (opciones.metadatos === 'json-roto') return { ...respuesta({}, 200), json: async () => { throw new Error('json roto'); } };
        if (opciones.metadatos === 'otro-nombre') return respuesta(objetoMeta('otra/ruta.pdf'));
        const status = opciones.metadatos ?? 200;
        return respuesta(status === 200 ? objetoMeta(name) : {}, status);
      }
      if (method === 'DELETE') return respuesta({}, opciones.borrar ?? 204);
      if (method === 'PATCH') {
        const status = opciones.patch ?? 200;
        const pedido = JSON.parse(init.body || '{}') as { metadata: Record<string, string | null> };
        const metadata: Record<string, string> = { origen: 'documentos', uid: 'uid-a' };
        for (const [k, v] of Object.entries(pedido.metadata || {})) { if (v === null) delete metadata[k]; else metadata[k] = v; }
        return respuesta(status === 200 ? objetoMeta(name, { metadata }) : {}, status);
      }
      throw new Error(`endpoint sintético inesperado: ${method} ${url}`);
    };
    return { llamadas, fetchFake };
  }
  const cliente = (fetchFake: unknown) => new ClienteGoogleStorageRest({ cuenta, bucket: BUCKET, fetchImpl: fetchFake as never });

  it('iniciarSesionResumable: JSON API `uploadType=resumable`, nombre/tipo/metadatos fijados por el servidor, `ifGenerationMatch=0`, `Origin` del navegador', async () => {
    const { llamadas, fetchFake } = crearFetch();
    const r = await cliente(fetchFake).iniciarSesionResumable({
      path: objectName, contentType: 'application/pdf', tamanoBytes: 17, metadata: { origen: 'documentos', uid: 'uid-a' }, origen: 'https://app.example', soloSiNoExiste: true,
    });
    expect(r).toEqual({ sesionUri: 'https://storage.googleapis.com/upload/storage/v1/b/bucket/o?uploadType=resumable&upload_id=abc' });
    const inicio = llamadas.find((l) => l.method === 'POST' && l.url.includes('/upload/storage/v1/'))!;
    const url = new URL(inicio.url);
    expect(url.pathname).toBe(`/upload/storage/v1/b/${encodeURIComponent(BUCKET)}/o`);
    expect(url.searchParams.get('uploadType')).toBe('resumable');
    expect(url.searchParams.get('ifGenerationMatch')).toBe('0');
    expect(inicio.headers.Authorization).toBe('Bearer token-sintetico');
    expect(inicio.headers['X-Upload-Content-Type']).toBe('application/pdf');
    expect(inicio.headers['X-Upload-Content-Length']).toBe('17');
    expect(inicio.headers.Origin).toBe('https://app.example');
    expect(JSON.parse(inicio.body!)).toEqual({ name: objectName, contentType: 'application/pdf', metadata: { origen: 'documentos', uid: 'uid-a' } });
    // Sin `soloSiNoExiste` (destinos sobrescribibles) no se envía la precondición.
    const { llamadas: l2, fetchFake: f2 } = crearFetch();
    await cliente(f2).iniciarSesionResumable({ path: objectName, contentType: 'application/pdf', tamanoBytes: 17, metadata: {}, soloSiNoExiste: false });
    const inicio2 = l2.find((l) => l.method === 'POST')!;
    expect(new URL(inicio2.url).searchParams.has('ifGenerationMatch')).toBe(false);
    expect(inicio2.headers.Origin).toBeUndefined();
  });

  it('iniciarSesionResumable: 412/409 ⇒ YA_EXISTE (el servicio compara bytes); 5xx ⇒ STORAGE_NO_DISPONIBLE; sin `location` ⇒ RESPUESTA_INVALIDA; entrada inválida no toca la red', async () => {
    await expect(cliente(crearFetch({ inicio: 412 }).fetchFake).iniciarSesionResumable({ path: objectName, contentType: 'application/pdf', tamanoBytes: 17, metadata: {}, soloSiNoExiste: true })).resolves.toBe('YA_EXISTE');
    await expect(cliente(crearFetch({ inicio: 409 }).fetchFake).iniciarSesionResumable({ path: objectName, contentType: 'application/pdf', tamanoBytes: 17, metadata: {}, soloSiNoExiste: true })).resolves.toBe('YA_EXISTE');
    await expect(cliente(crearFetch({ inicio: 503 }).fetchFake).iniciarSesionResumable({ path: objectName, contentType: 'application/pdf', tamanoBytes: 17, metadata: {}, soloSiNoExiste: false })).rejects.toMatchObject({ codigo: 'STORAGE_NO_DISPONIBLE' });
    await expect(cliente(crearFetch({ inicio: 201 }).fetchFake).iniciarSesionResumable({ path: objectName, contentType: 'application/pdf', tamanoBytes: 17, metadata: {}, soloSiNoExiste: false })).rejects.toMatchObject({ codigo: 'STORAGE_RESPUESTA_INVALIDA' });
    const { llamadas, fetchFake } = crearFetch();
    for (const mala of [
      { path: '../x.pdf', contentType: 'application/pdf', tamanoBytes: 1, metadata: {}, soloSiNoExiste: true },
      { path: objectName, contentType: '', tamanoBytes: 1, metadata: {}, soloSiNoExiste: true },
      { path: objectName, contentType: 'application/pdf', tamanoBytes: 0, metadata: {}, soloSiNoExiste: true },
      { path: objectName, contentType: 'application/pdf', tamanoBytes: 1.5, metadata: {}, soloSiNoExiste: true },
    ]) {
      await expect(cliente(fetchFake).iniciarSesionResumable(mala)).rejects.toBeInstanceOf(ErrorAlmacenGoogleStorage);
    }
    expect(llamadas).toHaveLength(0);
  });

  it('metadatos: GET autenticado normalizado; 404 ⇒ null; nombre distinto o JSON roto ⇒ RESPUESTA_INVALIDA; 5xx ⇒ NO_DISPONIBLE', async () => {
    const { llamadas, fetchFake } = crearFetch();
    const m = await cliente(fetchFake).metadatos(objectName);
    expect(m).toMatchObject({ name: objectName, bucket: BUCKET, generation: '987', size: 17, contentType: 'application/pdf', metadata: { origen: 'documentos', uid: 'uid-a' } });
    const get = llamadas.find((l) => l.method === 'GET')!;
    expect(get.url).toBe(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(BUCKET)}/o/${encodeURIComponent(objectName)}`);
    expect(get.headers.Authorization).toBe('Bearer token-sintetico');
    await expect(cliente(crearFetch({ metadatos: 404 }).fetchFake).metadatos(objectName)).resolves.toBeNull();
    await expect(cliente(crearFetch({ metadatos: 'otro-nombre' }).fetchFake).metadatos(objectName)).rejects.toMatchObject({ codigo: 'STORAGE_RESPUESTA_INVALIDA' });
    await expect(cliente(crearFetch({ metadatos: 'json-roto' }).fetchFake).metadatos(objectName)).rejects.toMatchObject({ codigo: 'STORAGE_RESPUESTA_INVALIDA' });
    await expect(cliente(crearFetch({ metadatos: 500 }).fetchFake).metadatos(objectName)).rejects.toMatchObject({ codigo: 'STORAGE_NO_DISPONIBLE' });
    await expect(cliente(fetchFake).metadatos('//doble')).rejects.toBeInstanceOf(ErrorAlmacenGoogleStorage);
  });

  it('borrar: DELETE autenticado ⇒ BORRADO; 404 ⇒ NO_EXISTE (idempotente); 5xx ⇒ NO_DISPONIBLE; ruta inválida no toca la red', async () => {
    const { llamadas, fetchFake } = crearFetch();
    await expect(cliente(fetchFake).borrar(objectName)).resolves.toBe('BORRADO');
    const del = llamadas.find((l) => l.method === 'DELETE')!;
    expect(del.url).toContain(`/o/${encodeURIComponent(objectName)}`);
    expect(del.headers.Authorization).toBe('Bearer token-sintetico');
    await expect(cliente(crearFetch({ borrar: 404 }).fetchFake).borrar(objectName)).resolves.toBe('NO_EXISTE');
    await expect(cliente(crearFetch({ borrar: 500 }).fetchFake).borrar(objectName)).rejects.toMatchObject({ codigo: 'STORAGE_NO_DISPONIBLE' });
    const antes = llamadas.length;
    await expect(cliente(fetchFake).borrar('../fuera.pdf')).rejects.toBeInstanceOf(ErrorAlmacenGoogleStorage);
    expect(llamadas.length).toBe(antes);
  });

  it('parchearMetadatos: PATCH con `{metadata}` (null elimina), respuesta normalizada; 404/412 ⇒ PRECONDICION; 5xx ⇒ NO_DISPONIBLE', async () => {
    const { llamadas, fetchFake } = crearFetch();
    const m = await cliente(fetchFake).parchearMetadatos(objectName, { firebaseStorageDownloadTokens: 'tok-1', uid: null });
    const patch = llamadas.find((l) => l.method === 'PATCH')!;
    expect(patch.headers['Content-Type']).toMatch(/^application\/json/);
    expect(JSON.parse(patch.body!)).toEqual({ metadata: { firebaseStorageDownloadTokens: 'tok-1', uid: null } });
    expect(m.metadata).toEqual({ origen: 'documentos', firebaseStorageDownloadTokens: 'tok-1' });
    await expect(cliente(crearFetch({ patch: 404 }).fetchFake).parchearMetadatos(objectName, { a: 'b' })).rejects.toMatchObject({ codigo: 'STORAGE_PRECONDICION' });
    await expect(cliente(crearFetch({ patch: 412 }).fetchFake).parchearMetadatos(objectName, { a: 'b' })).rejects.toMatchObject({ codigo: 'STORAGE_PRECONDICION' });
    await expect(cliente(crearFetch({ patch: 502 }).fetchFake).parchearMetadatos(objectName, { a: 'b' })).rejects.toMatchObject({ codigo: 'STORAGE_NO_DISPONIBLE' });
  });

  it('urlDescargaConToken: mismo formato que getDownloadURL del SDK (firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media&token=…)', () => {
    const url = cliente(crearFetch().fetchFake).urlDescargaConToken(objectName, 'tok/1 2');
    expect(url).toBe(`https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(BUCKET)}/o/${encodeURIComponent(objectName)}?alt=media&token=${encodeURIComponent('tok/1 2')}`);
    expect(url).not.toContain('token-sintetico'); // nunca filtra el token OAuth de la cuenta de servicio
    expect(cliente(crearFetch().fetchFake).bucket).toBe(BUCKET);
  });
});

function respuesta(
  datos: unknown,
  status = 200,
  arrayBuffer?: () => ArrayBuffer,
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => datos,
    text: async () => JSON.stringify(datos),
    ...(arrayBuffer ? { arrayBuffer: async () => arrayBuffer() } : {}),
  };
}
