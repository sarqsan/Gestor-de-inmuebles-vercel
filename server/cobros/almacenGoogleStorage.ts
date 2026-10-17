/**
 * Acceso privado a Firebase Storage mediante Cloud Storage REST.
 *
 * Este adaptador solo lo usa el servidor después de autorizar al actor contra
 * usuarios_auth + usuarios + contrato + relación patrimonial. No emite URLs de
 * descarga ni tokens de capacidad y no usa el fallback efímero de
 * /api/upload-document. `ifGenerationMatch=0` hace que los objetos sean
 * inmutables: un reintento solo acepta el objeto previo si sus bytes coinciden.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { obtenerTokenAcceso, type CuentaServicio, type ImplementacionFetch } from '../titularidades/googleBackend.js';

export interface AlmacenJustificantes {
  guardar(path: string, bytes: Uint8Array, tipoMime: string): Promise<'CREADO' | 'YA_EXISTE'>;
  leer(path: string): Promise<Uint8Array | null>;
}

export interface OpcionesAlmacenGoogleStorage {
  cuenta: CuentaServicio;
  bucket: string;
  fetchImpl?: ImplementacionFetch;
  ahora?: () => Date;
  timeoutMs?: number;
}

export class ErrorAlmacenGoogleStorage extends Error {
  constructor(readonly codigo: 'STORAGE_NO_DISPONIBLE' | 'STORAGE_RESPUESTA_INVALIDA') {
    super(codigo);
  }
}

function validarSegmento(valor: string): boolean {
  return typeof valor === 'string' && valor.length > 0 && valor.length <= 255
    && /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(valor);
}

function validarNombreObjeto(path: string): boolean {
  return typeof path === 'string' && path.length > 0 && Buffer.byteLength(path, 'utf8') <= 900
    && !path.startsWith('/') && !path.includes('\\')
    && path.split('/').every((segmento) => segmento !== '' && segmento !== '.' && segmento !== '..');
}

export class ClienteGoogleStorageRest implements AlmacenJustificantes {
  private readonly ejecutar: ImplementacionFetch;
  private readonly timeoutMs: number;

  constructor(private readonly opciones: OpcionesAlmacenGoogleStorage) {
    if (!validarSegmento(opciones.bucket)) throw new Error('STORAGE_BUCKET_INVALIDO');
    this.ejecutar = opciones.fetchImpl || (fetch as unknown as ImplementacionFetch);
    this.timeoutMs = Math.max(1000, Math.min(30000, opciones.timeoutMs || 12000));
  }

  private async token(): Promise<string> {
    try {
      return await obtenerTokenAcceso(this.opciones.cuenta, {
        fetchImpl: this.ejecutar,
        ...(this.opciones.ahora ? { ahora: this.opciones.ahora() } : {}),
      });
    } catch {
      throw new ErrorAlmacenGoogleStorage('STORAGE_NO_DISPONIBLE');
    }
  }

  private async peticion<T>(fabricar: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fabricar(controller.signal);
    } catch {
      throw new ErrorAlmacenGoogleStorage('STORAGE_NO_DISPONIBLE');
    } finally {
      clearTimeout(timer);
    }
  }

  async guardar(path: string, bytes: Uint8Array, tipoMime: string): Promise<'CREADO' | 'YA_EXISTE'> {
    if (!validarNombreObjeto(path) || bytes.byteLength === 0 || !tipoMime) {
      throw new ErrorAlmacenGoogleStorage('STORAGE_RESPUESTA_INVALIDA');
    }
    const token = await this.token();
    const query = new URLSearchParams({
      uploadType: 'media',
      name: path,
      ifGenerationMatch: '0',
    });
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.opciones.bucket)}/o?${query.toString()}`;
    const response = await this.peticion((signal) => this.ejecutar(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': tipoMime },
      body: bytes,
      signal,
    }));
    if (response.status === 409 || response.status === 412) return 'YA_EXISTE';
    if (!response.ok) throw new ErrorAlmacenGoogleStorage('STORAGE_NO_DISPONIBLE');

    let metadata: unknown;
    try { metadata = await response.json(); }
    catch { throw new ErrorAlmacenGoogleStorage('STORAGE_RESPUESTA_INVALIDA'); }
    const datos = metadata as { name?: unknown; generation?: unknown; size?: unknown; contentType?: unknown };
    if (datos.name !== path || typeof datos.generation !== 'string' || !/^\d+$/.test(datos.generation)
      || Number(datos.size) !== bytes.byteLength || datos.contentType !== tipoMime) {
      throw new ErrorAlmacenGoogleStorage('STORAGE_RESPUESTA_INVALIDA');
    }
    return 'CREADO';
  }

  async leer(path: string): Promise<Uint8Array | null> {
    if (!validarNombreObjeto(path)) throw new ErrorAlmacenGoogleStorage('STORAGE_RESPUESTA_INVALIDA');
    const token = await this.token();
    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.opciones.bucket)}/o/${encodeURIComponent(path)}?alt=media`;
    const response = await this.peticion((signal) => this.ejecutar(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal,
    }));
    if (response.status === 404) return null;
    if (!response.ok) throw new ErrorAlmacenGoogleStorage('STORAGE_NO_DISPONIBLE');
    if (typeof response.arrayBuffer !== 'function') {
      throw new ErrorAlmacenGoogleStorage('STORAGE_RESPUESTA_INVALIDA');
    }
    const buffer = await this.peticion(async () => Buffer.from(await response.arrayBuffer!()));
    return new Uint8Array(buffer);
  }
}

/**
 * Lee solo el `storageBucket` público de la configuración versionada. La
 * configuración no contiene credenciales; sin un bucket válido el flujo P2
 * queda deshabilitado (503), nunca usa almacenamiento temporal.
 */
export function resolverBucketStorage(
  leer: () => string = () => readFileSync(resolve(process.cwd(), 'firebase-applet-config.json'), 'utf8'),
): string | null {
  try {
    const config = JSON.parse(leer()) as Record<string, unknown>;
    const bucket = config.storageBucket;
    return typeof bucket === 'string' && validarSegmento(bucket) ? bucket : null;
  } catch {
    return null;
  }
}
