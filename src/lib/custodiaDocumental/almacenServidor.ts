/**
 * CUSTODIA DOCUMENTAL — MOTOR DE ALMACÉN MEDIADO POR EL SERVIDOR (AG-03.2)
 * =======================================================================
 * Por qué existe (ORDEN AG-03.2 · 2026-10-20): las reglas de Firebase Storage
 * sólo pueden consultar la base Firestore `(default)`, y esta aplicación opera
 * ÚNICAMENTE sobre una base con nombre. Cualquier regla que dependa de datos
 * de Firestore se evalúa contra una base vacía: a toda cuenta que no sea la
 * maestra se le deniega la custodia. No hay forma oficial de que las reglas
 * lean otra base y `(default)` NO forma parte de la arquitectura.
 *
 * Solución: el navegador ya no habla con Firebase Storage mediante el SDK. Cada
 * operación pasa por `/api/documentos/*`, donde el servidor verifica la sesión,
 * autoriza contra la base con nombre (titularidad, carteras, revocaciones,
 * metadatos P3/P5) y, sólo entonces:
 *
 *   · SUBIDA: abre una sesión reanudable de Cloud Storage para ESE nombre de
 *     objeto, con tipo y metadatos fijados por el servidor. El navegador envía
 *     los bytes directamente a Cloud Storage (no pasan por Vercel: el límite de
 *     4,5 MB de cuerpo de las funciones no afecta) y confirma. El servidor
 *     vuelve a autorizar, comprueba tamaño y tipo reales y elimina el objeto si
 *     no respeta el destino. Sin confirmación no hay éxito.
 *   · LECTURA: devuelve la URL de descarga por token (rotada en los destinos
 *     sin enlace permanente); los bytes se leen de esa URL.
 *   · BORRADO: lo ejecuta el servidor tras autorizar.
 *
 * La superficie imita la del SDK (`ref`, `uploadBytes`, `getDownloadURL`,
 * `getBytes`, `getMetadata`, `deleteObject`) y los errores llevan `code`
 * `storage/...` para que los módulos existentes y `clasificarErrorStorage`
 * no cambien. Fallo cerrado: ninguna rama degrada a memoria, base64 ni data-URL.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ReferenciaAlmacen {
  fullPath: string;
  name: string;
}

export interface MetadatosSubida {
  contentType?: string;
  customMetadata?: Record<string, string>;
}

export interface MetadatosAlmacen {
  fullPath: string;
  name: string;
  size: number;
  contentType: string;
  generation: string;
  md5Hash?: string;
  timeCreated?: string;
  customMetadata: Record<string, string>;
}

export interface ResultadoSubida {
  ref: ReferenciaAlmacen;
  metadata: MetadatosAlmacen;
  /** URL de descarga, sólo en destinos cuya URL puede guardarse en el registro. */
  url?: string;
  /** `true` cuando el servidor reconoció el MISMO contenido ya custodiado (reintento idempotente). */
  yaExistia: boolean;
}

export type CodigoAlmacenServidor =
  | 'storage/unauthenticated'
  | 'storage/unauthorized'
  | 'storage/object-not-found'
  | 'storage/invalid-argument'
  | 'storage/server-file-wrong-size'
  | 'storage/retry-limit-exceeded'
  | 'storage/canceled'
  | 'storage/unknown';

export class ErrorAlmacenServidor extends Error {
  readonly code: CodigoAlmacenServidor;
  readonly status?: number;
  /** Código estable del servidor (`SIN_PERMISO`, `ARCHIVO_DEMASIADO_GRANDE`…) si lo hubo. */
  readonly codigoServidor?: string;
  readonly motivo?: string;
  readonly storagePath?: string;

  constructor(
    code: CodigoAlmacenServidor,
    mensaje: string,
    detalle: { status?: number; codigoServidor?: string; motivo?: string; storagePath?: string } = {},
  ) {
    super(mensaje);
    this.name = 'ErrorAlmacenServidor';
    this.code = code;
    this.status = detalle.status;
    this.codigoServidor = detalle.codigoServidor;
    this.motivo = detalle.motivo;
    this.storagePath = detalle.storagePath;
  }
}

export interface OpcionesSubida {
  /** Plazo máximo del envío de bytes; al agotarse se CANCELA (`storage/canceled` ⇒ TIEMPO_AGOTADO en la capa superior). */
  plazoMs?: number;
  signal?: AbortSignal;
}

export interface ConfiguracionAlmacenServidor {
  /** ID token de la sesión actual; `null` sin sesión. Por defecto, la sesión de Firebase. */
  obtenerToken: () => Promise<string | null>;
  fetchImpl: typeof fetch;
}

// ---------------------------------------------------------------------------
// Configuración (inyectable en pruebas)
// ---------------------------------------------------------------------------

/** Plazo por defecto del envío de bytes (documentos de varios MB en redes móviles). */
export const PLAZO_ENVIO_BYTES_MS = 90_000;

async function tokenSesionFirebase(): Promise<string | null> {
  try {
    const { auth } = await import('../firebase');
    return (await auth.currentUser?.getIdToken()) || null;
  } catch {
    return null;
  }
}

const configuracion: ConfiguracionAlmacenServidor = {
  obtenerToken: tokenSesionFirebase,
  fetchImpl: (input, init) => fetch(input, init),
};

/** Sustituye la obtención del token o el `fetch` (pruebas). Devuelve la configuración anterior. */
export function configurarAlmacenServidor(parcial: Partial<ConfiguracionAlmacenServidor>): ConfiguracionAlmacenServidor {
  const previa = { ...configuracion };
  if (parcial.obtenerToken) configuracion.obtenerToken = parcial.obtenerToken;
  if (parcial.fetchImpl) configuracion.fetchImpl = parcial.fetchImpl;
  return previa;
}

// ---------------------------------------------------------------------------
// Transporte con el servidor
// ---------------------------------------------------------------------------

interface RespuestaServidorError {
  ok?: boolean;
  codigo?: string;
  motivo?: string;
  error?: string;
}

const MENSAJE_GENERICO = 'No se pudo completar la operación con el almacén de documentos.';

function codigoDesdeServidor(status: number, codigo: string | undefined): CodigoAlmacenServidor {
  switch (codigo) {
    case 'NO_AUTENTICADO': return 'storage/unauthenticated';
    case 'SIN_PERMISO':
    case 'RUTA_NO_ADMITIDA':
    case 'SOLICITUD_NO_VALIDA': return 'storage/unauthorized';
    case 'OBJETO_NO_ENCONTRADO': return 'storage/object-not-found';
    case 'ARCHIVO_INVALIDO':
    case 'ARCHIVO_DEMASIADO_GRANDE':
    case 'PETICION_INVALIDA': return 'storage/invalid-argument';
    case 'OBJETO_INCOMPLETO': return 'storage/server-file-wrong-size';
    case 'ALMACEN_NO_DISPONIBLE':
    case 'FUENTE_NO_DISPONIBLE':
    case 'CUSTODIA_NO_DISPONIBLE': return 'storage/retry-limit-exceeded';
    default:
      if (status === 401) return 'storage/unauthenticated';
      if (status === 403) return 'storage/unauthorized';
      if (status === 404) return 'storage/object-not-found';
      if (status === 400 || status === 413) return 'storage/invalid-argument';
      if (status >= 500) return 'storage/retry-limit-exceeded';
      return 'storage/unknown';
  }
}

function esAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

async function llamarServidor<T>(
  ruta: string,
  cuerpo: Record<string, unknown>,
  storagePath: string,
  opciones: { exigirSesion: boolean } = { exigirSesion: true },
): Promise<T> {
  const token = await configuracion.obtenerToken();
  if (!token && opciones.exigirSesion) {
    throw new ErrorAlmacenServidor('storage/unauthenticated', 'Inicia sesión para continuar.', { status: 401, storagePath });
  }
  let respuesta: Response;
  try {
    respuesta = await configuracion.fetchImpl(ruta, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(cuerpo),
    });
  } catch (error) {
    throw new ErrorAlmacenServidor('storage/retry-limit-exceeded', 'No se ha podido conectar con el servidor de documentos.', { storagePath, motivo: String((error as Error)?.message || error) });
  }
  let datos: unknown = null;
  try { datos = await respuesta.json(); } catch { datos = null; }
  if (!respuesta.ok || !datos || (datos as RespuestaServidorError).ok !== true) {
    const cuerpoError = (datos || {}) as RespuestaServidorError;
    throw new ErrorAlmacenServidor(
      codigoDesdeServidor(respuesta.status, cuerpoError.codigo),
      cuerpoError.error || MENSAJE_GENERICO,
      { status: respuesta.status, codigoServidor: cuerpoError.codigo, motivo: cuerpoError.motivo, storagePath },
    );
  }
  return datos as T;
}

function aMetadatos(path: string, crudo: unknown): MetadatosAlmacen {
  const m = (crudo || {}) as Record<string, unknown>;
  const customMetadata: Record<string, string> = {};
  if (m.customMetadata && typeof m.customMetadata === 'object') {
    for (const [k, v] of Object.entries(m.customMetadata as Record<string, unknown>)) if (typeof v === 'string') customMetadata[k] = v;
  }
  return {
    fullPath: path,
    name: path.slice(path.lastIndexOf('/') + 1),
    size: Number(m.tamanoBytes) || 0,
    contentType: typeof m.contentType === 'string' ? m.contentType : '',
    generation: typeof m.generation === 'string' ? m.generation : '',
    ...(typeof m.md5Hash === 'string' ? { md5Hash: m.md5Hash } : {}),
    ...(typeof m.timeCreated === 'string' ? { timeCreated: m.timeCreated } : {}),
    customMetadata,
  };
}

function aBlob(datos: Blob | Uint8Array | ArrayBuffer, contentType: string): Blob {
  if (typeof Blob !== 'undefined' && datos instanceof Blob) return datos;
  const parte = datos instanceof ArrayBuffer ? new Uint8Array(datos) : datos;
  return new Blob([parte as BlobPart], { type: contentType });
}

function tipoDe(datos: Blob | Uint8Array | ArrayBuffer, metadata?: MetadatosSubida): string {
  const declarado = String(metadata?.contentType || '').split(';')[0].trim().toLowerCase();
  if (declarado) return declarado;
  if (typeof Blob !== 'undefined' && datos instanceof Blob && datos.type) return datos.type.toLowerCase();
  return 'application/octet-stream';
}

function tamanoDe(datos: Blob | Uint8Array | ArrayBuffer): number {
  if (typeof Blob !== 'undefined' && datos instanceof Blob) return datos.size;
  return (datos as ArrayBuffer | Uint8Array).byteLength;
}

// ---------------------------------------------------------------------------
// Envío de bytes a la sesión reanudable (directo a Cloud Storage)
// ---------------------------------------------------------------------------

/** `PUT` de un solo tramo a la URI de sesión (doc. «Performing resumable uploads» · single chunk). */
async function enviarBytes(sesionUri: string, blob: Blob, contentType: string, storagePath: string, opciones: OpcionesSubida): Promise<void> {
  const controlador = new AbortController();
  let agotado = false;
  const temporizador = setTimeout(() => { agotado = true; controlador.abort(); }, opciones.plazoMs ?? PLAZO_ENVIO_BYTES_MS);
  const propagar = () => controlador.abort();
  if (opciones.signal) {
    if (opciones.signal.aborted) propagar();
    else opciones.signal.addEventListener('abort', propagar, { once: true });
  }
  let respuesta: Response;
  try {
    respuesta = await configuracion.fetchImpl(sesionUri, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
      signal: controlador.signal,
    });
  } catch (error) {
    if (esAbort(error) || controlador.signal.aborted) {
      throw new ErrorAlmacenServidor('storage/canceled', agotado
        ? 'La subida ha superado el tiempo máximo y se ha cancelado.'
        : 'La subida se ha cancelado antes de completarse.', { storagePath, motivo: agotado ? 'PLAZO' : 'CANCELADO' });
    }
    throw new ErrorAlmacenServidor('storage/retry-limit-exceeded', 'No se ha podido conectar con el almacenamiento.', { storagePath, motivo: String((error as Error)?.message || error) });
  } finally {
    clearTimeout(temporizador);
    if (opciones.signal) opciones.signal.removeEventListener('abort', propagar);
  }
  if (respuesta.status === 200 || respuesta.status === 201) return;
  if (respuesta.status === 308) {
    throw new ErrorAlmacenServidor('storage/server-file-wrong-size', 'El almacenamiento no recibió el archivo completo. Vuelve a intentarlo.', { status: 308, storagePath });
  }
  if (respuesta.status === 404 || respuesta.status === 410) {
    throw new ErrorAlmacenServidor('storage/retry-limit-exceeded', 'La sesión de subida ha caducado. Vuelve a intentarlo.', { status: respuesta.status, storagePath });
  }
  if (respuesta.status === 412 || respuesta.status === 409) {
    throw new ErrorAlmacenServidor('storage/unknown', 'Ya existe un documento con ese nombre.', { status: respuesta.status, storagePath, codigoServidor: 'OBJETO_EXISTENTE' });
  }
  throw new ErrorAlmacenServidor(respuesta.status >= 500 ? 'storage/retry-limit-exceeded' : 'storage/unknown', 'El almacenamiento rechazó la subida.', { status: respuesta.status, storagePath });
}

// ---------------------------------------------------------------------------
// Superficie compatible con el SDK
// ---------------------------------------------------------------------------

/** Referencia por ruta. El primer parámetro se ignora: existe por compatibilidad con `ref(storage, path)`. */
export function ref(_almacen: unknown, path: string): ReferenciaAlmacen {
  const ruta = String(path || '');
  return { fullPath: ruta, name: ruta.slice(ruta.lastIndexOf('/') + 1) };
}

interface RespuestaInicio {
  ok: true;
  estado: 'SESION' | 'YA_EXISTE';
  sesionUri?: string;
  storagePath: string;
  metadatos?: unknown;
  url?: string;
}

interface RespuestaConfirmacion {
  ok: true;
  storagePath: string;
  metadatos: unknown;
  url?: string;
}

async function subir(
  rutas: { inicio: string; confirmacion: string },
  extra: Record<string, unknown>,
  exigirSesion: boolean,
  referencia: ReferenciaAlmacen,
  datos: Blob | Uint8Array | ArrayBuffer,
  metadata: MetadatosSubida | undefined,
  opciones: OpcionesSubida,
): Promise<ResultadoSubida> {
  const storagePath = referencia.fullPath;
  const contentType = tipoDe(datos, metadata);
  const tamanoBytes = tamanoDe(datos);
  if (!storagePath || !(tamanoBytes > 0)) {
    throw new ErrorAlmacenServidor('storage/invalid-argument', 'El archivo está vacío o la ruta no es válida.', { storagePath });
  }
  const inicio = await llamarServidor<RespuestaInicio>(rutas.inicio, {
    ...extra,
    storagePath,
    contentType,
    tamanoBytes,
    ...(metadata?.customMetadata ? { customMetadata: metadata.customMetadata } : {}),
  }, storagePath, { exigirSesion });

  if (inicio.estado === 'YA_EXISTE') {
    return { ref: referencia, metadata: aMetadatos(storagePath, inicio.metadatos), ...(inicio.url ? { url: inicio.url } : {}), yaExistia: true };
  }
  if (inicio.estado !== 'SESION' || typeof inicio.sesionUri !== 'string' || !/^https?:\/\//.test(inicio.sesionUri)) {
    throw new ErrorAlmacenServidor('storage/unknown', MENSAJE_GENERICO, { storagePath, motivo: 'SESION_INVALIDA' });
  }

  await enviarBytes(inicio.sesionUri, aBlob(datos, contentType), contentType, storagePath, opciones);

  const confirmacion = await llamarServidor<RespuestaConfirmacion>(rutas.confirmacion, { ...extra, storagePath }, storagePath, { exigirSesion });
  const metadatosFinales = aMetadatos(storagePath, confirmacion.metadatos);
  if (metadatosFinales.size !== tamanoBytes) {
    // El servidor ya habría retirado el objeto; aquí sólo se evita informar éxito con un tamaño distinto.
    throw new ErrorAlmacenServidor('storage/server-file-wrong-size', 'El archivo guardado no coincide con el enviado.', { storagePath });
  }
  return { ref: referencia, metadata: metadatosFinales, ...(confirmacion.url ? { url: confirmacion.url } : {}), yaExistia: false };
}

/**
 * Sube bytes a la ruta de la referencia. Resuelve SÓLO cuando el servidor ha
 * confirmado el objeto (tamaño/tipo verificados). Misma firma que el SDK más
 * `opciones` (plazo/cancelación).
 */
export async function uploadBytes(
  referencia: ReferenciaAlmacen,
  datos: Blob | Uint8Array | ArrayBuffer,
  metadata?: MetadatosSubida,
  opciones: OpcionesSubida = {},
): Promise<ResultadoSubida> {
  return subir(
    { inicio: '/api/documentos/subidas', confirmacion: '/api/documentos/subidas/confirmar' },
    {},
    true,
    referencia,
    datos,
    metadata,
    opciones,
  );
}

/**
 * Portal público de candidatos: subida a `documentos_solicitados/{sol}/{fichero}`
 * autorizada por el TOKEN de la solicitud (verificado en el servidor contra la
 * base con nombre). Si hay sesión, se envía también y el servidor aplica su ámbito.
 */
export async function subirDocumentoPublico(
  peticion: {
    storagePath: string;
    datos: Blob | Uint8Array | ArrayBuffer;
    contentType?: string;
    solicitudDocId: string;
    token: string;
    customMetadata?: Record<string, string>;
  },
  opciones: OpcionesSubida = {},
): Promise<ResultadoSubida> {
  return subir(
    { inicio: '/api/documentos/publico/subidas', confirmacion: '/api/documentos/publico/subidas/confirmar' },
    { solicitudDocId: peticion.solicitudDocId, token: peticion.token },
    false,
    ref(null, peticion.storagePath),
    peticion.datos,
    { contentType: peticion.contentType, customMetadata: peticion.customMetadata },
    opciones,
  );
}

interface RespuestaAcceso {
  ok: true;
  storagePath: string;
  url: string;
  metadatos: unknown;
}

async function acceso(referencia: ReferenciaAlmacen): Promise<RespuestaAcceso> {
  const respuesta = await llamarServidor<RespuestaAcceso>('/api/documentos/acceso', { storagePath: referencia.fullPath }, referencia.fullPath);
  if (typeof respuesta.url !== 'string' || !/^https?:\/\//.test(respuesta.url)) {
    throw new ErrorAlmacenServidor('storage/unknown', MENSAJE_GENERICO, { storagePath: referencia.fullPath, motivo: 'URL_INVALIDA' });
  }
  return respuesta;
}

/** URL de descarga autorizada por el servidor (token de descarga; rotado en destinos P3/P5). */
export async function getDownloadURL(referencia: ReferenciaAlmacen): Promise<string> {
  return (await acceso(referencia)).url;
}

/** Metadatos del objeto (tras autorizar la lectura). */
export async function getMetadata(referencia: ReferenciaAlmacen): Promise<MetadatosAlmacen> {
  const respuesta = await acceso(referencia);
  return aMetadatos(referencia.fullPath, respuesta.metadatos);
}

async function descargar(url: string, storagePath: string): Promise<Response> {
  try {
    return await configuracion.fetchImpl(url, { method: 'GET' });
  } catch (error) {
    throw new ErrorAlmacenServidor('storage/retry-limit-exceeded', 'No se ha podido descargar el documento.', { storagePath, motivo: String((error as Error)?.message || error) });
  }
}

/**
 * Bytes del objeto. Pide la URL autorizada y la descarga; si el token acaba de
 * rotar por una lectura concurrente (403/404) vuelve a pedir una URL una vez.
 */
export async function getBytes(referencia: ReferenciaAlmacen, maxDownloadSizeBytes?: number): Promise<ArrayBuffer> {
  const storagePath = referencia.fullPath;
  let respuesta = await descargar((await acceso(referencia)).url, storagePath);
  if (respuesta.status === 403 || respuesta.status === 404) {
    respuesta = await descargar((await acceso(referencia)).url, storagePath);
  }
  if (!respuesta.ok) {
    const code: CodigoAlmacenServidor = respuesta.status === 404 ? 'storage/object-not-found'
      : respuesta.status === 403 ? 'storage/unauthorized'
      : respuesta.status >= 500 ? 'storage/retry-limit-exceeded' : 'storage/unknown';
    throw new ErrorAlmacenServidor(code, 'No se ha podido descargar el documento.', { status: respuesta.status, storagePath });
  }
  const bytes = await respuesta.arrayBuffer();
  if (typeof maxDownloadSizeBytes === 'number' && bytes.byteLength > maxDownloadSizeBytes) {
    throw new ErrorAlmacenServidor('storage/invalid-argument', 'El documento supera el tamaño máximo de descarga.', { storagePath });
  }
  return bytes;
}

/** Borra el objeto tras autorizar en el servidor. Si ya no existe lanza `storage/object-not-found` (como el SDK). */
export async function deleteObject(referencia: ReferenciaAlmacen): Promise<void> {
  const respuesta = await llamarServidor<{ ok: true; estado: 'BORRADO' | 'NO_EXISTE' }>(
    '/api/documentos/borrar',
    { storagePath: referencia.fullPath },
    referencia.fullPath,
  );
  if (respuesta.estado === 'NO_EXISTE') {
    throw new ErrorAlmacenServidor('storage/object-not-found', 'El documento ya no existe en el almacén.', { status: 404, storagePath: referencia.fullPath });
  }
}
