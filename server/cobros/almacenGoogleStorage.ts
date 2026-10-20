/**
 * Acceso privado a Firebase Storage mediante Cloud Storage REST.
 *
 * Este adaptador solo lo usa el servidor después de autorizar al actor contra
 * usuarios_auth + usuarios + contrato + relación patrimonial. El flujo P2
 * (`guardar`/`leer`) no emite URLs de descarga ni tokens de capacidad y no usa
 * el fallback efímero de /api/upload-document. `ifGenerationMatch=0` hace que
 * los objetos sean inmutables: un reintento solo acepta el objeto previo si sus
 * bytes coinciden.
 *
 * AG-03.2 (2026-10-20): la custodia documental general (`server/documentos/*`)
 * reutiliza este cliente para iniciar sesiones reanudables, leer metadatos,
 * borrar y emitir/rotar tokens de descarga — siempre tras autorizar en el
 * servidor contra la base Firestore con nombre, nunca a petición ciega del cliente.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { obtenerTokenAcceso, validarDestinoEmuladorP2, type CuentaServicio, type ImplementacionFetch } from '../titularidades/googleBackend.js';

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
  /** Opt-in de pruebas P2: GCS JSON API del emulador oficial, validado como demo+loopback. */
  usarEmuladorFirebase?: boolean;
}

export class ErrorAlmacenGoogleStorage extends Error {
  constructor(readonly codigo: 'STORAGE_NO_DISPONIBLE' | 'STORAGE_RESPUESTA_INVALIDA' | 'STORAGE_PRECONDICION') {
    super(codigo);
  }
}

/** Metadatos de un objeto tal como los devuelve la JSON API (`storage/v1`). */
export interface MetadatosObjetoStorage {
  name: string;
  bucket: string;
  generation: string;
  size: number;
  contentType: string;
  md5Hash?: string;
  crc32c?: string;
  timeCreated?: string;
  updated?: string;
  /** Metadatos personalizados (`metadata` en la JSON API), p. ej. `sha256`, `firebaseStorageDownloadTokens`. */
  metadata: Record<string, string>;
}

export interface PeticionSesionResumable {
  path: string;
  contentType: string;
  /** Tamaño que el cliente declara; se envía como `X-Upload-Content-Length` y se re-verifica al confirmar. */
  tamanoBytes: number;
  /** Metadatos personalizados fijados por el SERVIDOR en la petición inicial (el cliente no los elige). */
  metadata: Record<string, string>;
  /**
   * `Origin` del navegador que subirá los bytes. Cloud Storage decide las
   * cabeceras CORS de la sesión a partir de la petición inicial; sin él, el
   * `PUT` posterior desde el navegador fallaría (doc. «Resumable uploads»).
   */
  origen?: string;
  /** `true` ⇒ `ifGenerationMatch=0`: nunca sobrescribe un objeto existente. */
  soloSiNoExiste: boolean;
}

function normalizarMetadatos(crudo: unknown): MetadatosObjetoStorage | null {
  const datos = crudo as Record<string, unknown> | null;
  if (!datos || typeof datos !== 'object') return null;
  if (typeof datos.name !== 'string' || typeof datos.generation !== 'string' || !/^\d+$/.test(datos.generation)) return null;
  const size = Number(datos.size);
  if (!Number.isFinite(size) || size < 0) return null;
  const metadata: Record<string, string> = {};
  if (datos.metadata && typeof datos.metadata === 'object') {
    for (const [clave, valor] of Object.entries(datos.metadata as Record<string, unknown>)) {
      if (typeof valor === 'string') metadata[clave] = valor;
    }
  }
  return {
    name: datos.name,
    bucket: typeof datos.bucket === 'string' ? datos.bucket : '',
    generation: datos.generation,
    size,
    contentType: typeof datos.contentType === 'string' ? datos.contentType : '',
    ...(typeof datos.md5Hash === 'string' ? { md5Hash: datos.md5Hash } : {}),
    ...(typeof datos.crc32c === 'string' ? { crc32c: datos.crc32c } : {}),
    ...(typeof datos.timeCreated === 'string' ? { timeCreated: datos.timeCreated } : {}),
    ...(typeof datos.updated === 'string' ? { updated: datos.updated } : {}),
    metadata,
  };
}

/** Nombre de objeto admisible para la custodia documental (reexportado para el servicio). */
export function esNombreObjetoValido(path: string): boolean {
  return validarNombreObjeto(path);
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
  private readonly baseUrl: string;

  constructor(private readonly opciones: OpcionesAlmacenGoogleStorage) {
    if (!validarSegmento(opciones.bucket)) throw new Error('STORAGE_BUCKET_INVALIDO');
    this.baseUrl = opciones.usarEmuladorFirebase
      ? validarDestinoEmuladorP2('storage', opciones.cuenta.project_id)
      : 'https://storage.googleapis.com';
    this.ejecutar = opciones.fetchImpl || (fetch as unknown as ImplementacionFetch);
    this.timeoutMs = Math.max(1000, Math.min(30000, opciones.timeoutMs || 12000));
  }

  private async token(): Promise<string> {
    if (this.opciones.usarEmuladorFirebase) return 'owner';
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
    const url = `${this.baseUrl}/upload/storage/v1/b/${encodeURIComponent(this.opciones.bucket)}/o?${query.toString()}`;
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
    const url = `${this.baseUrl}/storage/v1/b/${encodeURIComponent(this.opciones.bucket)}/o/${encodeURIComponent(path)}?alt=media`;
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

  // -------------------------------------------------------------------------
  // AG-03.2 · Custodia documental mediada por el servidor
  // Los métodos siguientes los usa SOLO `server/documentos/*` después de
  // autorizar al actor contra la base Firestore con nombre. Ninguno emite
  // credenciales al cliente: la sesión reanudable es una capacidad de ESCRITURA
  // acotada a UN nombre de objeto fijado aquí, y la URL con token sólo se
  // devuelve a quien el servidor ha autorizado a leer.
  // -------------------------------------------------------------------------

  get bucket(): string {
    return this.opciones.bucket;
  }

  private urlObjeto(path: string, query?: string): string {
    return `${this.baseUrl}/storage/v1/b/${encodeURIComponent(this.opciones.bucket)}/o/${encodeURIComponent(path)}${query ? `?${query}` : ''}`;
  }

  /** `GET` de metadatos. `null` si el objeto no existe. */
  async metadatos(path: string): Promise<MetadatosObjetoStorage | null> {
    if (!validarNombreObjeto(path)) throw new ErrorAlmacenGoogleStorage('STORAGE_RESPUESTA_INVALIDA');
    const token = await this.token();
    const response = await this.peticion((signal) => this.ejecutar(this.urlObjeto(path), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal,
    }));
    if (response.status === 404) return null;
    if (!response.ok) throw new ErrorAlmacenGoogleStorage('STORAGE_NO_DISPONIBLE');
    let crudo: unknown;
    try { crudo = await response.json(); }
    catch { throw new ErrorAlmacenGoogleStorage('STORAGE_RESPUESTA_INVALIDA'); }
    const datos = normalizarMetadatos(crudo);
    if (!datos || datos.name !== path) throw new ErrorAlmacenGoogleStorage('STORAGE_RESPUESTA_INVALIDA');
    return datos;
  }

  /**
   * Inicia una SESIÓN REANUDABLE (JSON API, `uploadType=resumable`) y devuelve
   * su URI. El nombre, el tipo y los metadatos personalizados quedan fijados en
   * esta petición inicial; el navegador sólo aporta los bytes con un `PUT` a la
   * URI de sesión. Documentación: cloud.google.com/storage/docs/performing-resumable-uploads
   * (§ «Initiate a resumable upload session») y …/resumable-uploads (§ «Session URIs», CORS).
   */
  async iniciarSesionResumable(peticion: PeticionSesionResumable): Promise<{ sesionUri: string } | 'YA_EXISTE'> {
    if (!validarNombreObjeto(peticion.path) || !peticion.contentType
      || !Number.isInteger(peticion.tamanoBytes) || peticion.tamanoBytes <= 0) {
      throw new ErrorAlmacenGoogleStorage('STORAGE_RESPUESTA_INVALIDA');
    }
    const token = await this.token();
    const query = new URLSearchParams({ uploadType: 'resumable' });
    if (peticion.soloSiNoExiste) query.set('ifGenerationMatch', '0');
    const url = `${this.baseUrl}/upload/storage/v1/b/${encodeURIComponent(this.opciones.bucket)}/o?${query.toString()}`;
    const cuerpo = JSON.stringify({
      name: peticion.path,
      contentType: peticion.contentType,
      metadata: peticion.metadata,
    });
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': peticion.contentType,
      'X-Upload-Content-Length': String(peticion.tamanoBytes),
    };
    if (peticion.origen) headers.Origin = peticion.origen;
    const response = await this.peticion((signal) => this.ejecutar(url, { method: 'POST', headers, body: cuerpo, signal }));
    if (response.status === 409 || response.status === 412) return 'YA_EXISTE';
    if (!response.ok) throw new ErrorAlmacenGoogleStorage('STORAGE_NO_DISPONIBLE');
    const sesionUri = response.headers?.get('location') || response.headers?.get('Location') || '';
    if (!sesionUri || !/^https?:\/\//.test(sesionUri)) throw new ErrorAlmacenGoogleStorage('STORAGE_RESPUESTA_INVALIDA');
    return { sesionUri };
  }

  /** `DELETE` del objeto. `NO_EXISTE` si ya no estaba (idempotente). */
  async borrar(path: string): Promise<'BORRADO' | 'NO_EXISTE'> {
    if (!validarNombreObjeto(path)) throw new ErrorAlmacenGoogleStorage('STORAGE_RESPUESTA_INVALIDA');
    const token = await this.token();
    const response = await this.peticion((signal) => this.ejecutar(this.urlObjeto(path), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal,
    }));
    if (response.status === 404) return 'NO_EXISTE';
    if (!response.ok) throw new ErrorAlmacenGoogleStorage('STORAGE_NO_DISPONIBLE');
    return 'BORRADO';
  }

  /**
   * `PATCH` de metadatos personalizados (p. ej. emitir o rotar el token de
   * descarga). Las claves con valor `null` se eliminan. 404/412 ⇒ `STORAGE_PRECONDICION`.
   */
  async parchearMetadatos(
    path: string,
    metadata: Record<string, string | null>,
  ): Promise<MetadatosObjetoStorage> {
    if (!validarNombreObjeto(path)) throw new ErrorAlmacenGoogleStorage('STORAGE_RESPUESTA_INVALIDA');
    const token = await this.token();
    const response = await this.peticion((signal) => this.ejecutar(this.urlObjeto(path), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ metadata }),
      signal,
    }));
    if (response.status === 404) throw new ErrorAlmacenGoogleStorage('STORAGE_PRECONDICION');
    if (response.status === 412) throw new ErrorAlmacenGoogleStorage('STORAGE_PRECONDICION');
    if (!response.ok) throw new ErrorAlmacenGoogleStorage('STORAGE_NO_DISPONIBLE');
    let crudo: unknown;
    try { crudo = await response.json(); }
    catch { throw new ErrorAlmacenGoogleStorage('STORAGE_RESPUESTA_INVALIDA'); }
    const datos = normalizarMetadatos(crudo);
    if (!datos || datos.name !== path) throw new ErrorAlmacenGoogleStorage('STORAGE_RESPUESTA_INVALIDA');
    return datos;
  }

  /**
   * URL de descarga por token de Firebase Storage para un objeto cuyo metadato
   * `firebaseStorageDownloadTokens` contiene `token`. Es el mismo formato que
   * devuelve `getDownloadURL()` del SDK; en el emulador apunta a su host local.
   */
  urlDescargaConToken(path: string, token: string): string {
    const host = this.opciones.usarEmuladorFirebase ? this.baseUrl : 'https://firebasestorage.googleapis.com';
    return `${host}/v0/b/${encodeURIComponent(this.opciones.bucket)}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`;
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
