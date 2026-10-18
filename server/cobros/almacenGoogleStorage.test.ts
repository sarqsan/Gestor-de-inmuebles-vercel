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
