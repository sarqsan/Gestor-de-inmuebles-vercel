/**
 * CUSTODIA DOCUMENTAL — SUBIDA DIRECTA Y DURADERA A FIREBASE STORAGE (AG-04)
 * ===========================================================================
 * Por qué existe (ORDEN 1 · 2026-10-20): las subidas legadas de facturas de
 * gasto, justificantes de cobro y documentos aportados por el portal público
 * hacían una carrera de 8 s contra Storage y, al perderla o ser denegadas,
 * caían en silencio en el almacén EFÍMERO del servidor (`/api/upload-document`,
 * RAM de una función de Vercel) o en una data-URL local. El registro quedaba
 * guardado con una referencia `server_*`/`local_*` que dejaba de resolver al
 * reciclarse la función: pérdida del binario con apariencia de éxito.
 *
 * Contrato de este módulo (fail-closed):
 *  - Una subida sólo se considera correcta cuando el objeto ha quedado escrito
 *    en Firebase Storage y se ha obtenido su URL de descarga. No hay ningún
 *    respaldo: ni servidor efímero, ni base64, ni data-URL.
 *  - Sin titular (`propietarioId`) no se intenta nada: las reglas de Storage
 *    deniegan siempre el segmento `sin_asignar`, así que intentarlo sólo
 *    produciría una denegación tardía. Se lanza `SIN_TITULAR` de inmediato.
 *  - El plazo máximo CANCELA la tarea (subida reanudable) en vez de abandonarla:
 *    nunca queda un objeto subido a destiempo sin referencia en el registro.
 *  - Todo fallo se traduce a `ErrorCustodiaDocumento`, con un código estable y
 *    un mensaje en lenguaje de la persona usuaria (compatible con el filtro de
 *    `mensajeDeErrorUsuario`, UX-3). El detalle técnico viaja en `causa`.
 *
 * Qué NO resuelve: si las reglas de Storage deniegan al titular legítimo porque
 * resuelven el ámbito contra una base Firestore distinta de la que usa la app
 * (AG-03), aquí se verá como `SIN_PERMISO` explícito — nunca como un éxito.
 */
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type FirebaseStorage,
  type StorageReference,
  type UploadMetadata,
  type UploadTask,
} from 'firebase/storage';

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

export type CodigoErrorCustodia =
  /** El registro no tiene titular asignado: no existe carpeta de custodia posible. */
  | 'SIN_TITULAR'
  /** Las reglas de Storage han denegado la operación a esta cuenta. */
  | 'SIN_PERMISO'
  /** No hay sesión (o ha caducado) en el momento de subir. */
  | 'NO_AUTENTICADO'
  /** La subida ha superado el plazo máximo y se ha cancelado. */
  | 'TIEMPO_AGOTADO'
  /** Tipo MIME o tamaño fuera de lo admitido por la regla del prefijo. */
  | 'TIPO_O_TAMANO'
  /** Fallo de red/transporte (reintentos agotados, sin conexión…). */
  | 'RED'
  /** Cancelación ajena al plazo (p. ej. cierre de la pestaña). */
  | 'CANCELADO'
  /** Cualquier otro fallo del almacenamiento. */
  | 'DESCONOCIDO';

/**
 * Mensajes para la persona usuaria: qué ha pasado y qué puede hacer. Sin
 * nombres de SDK, códigos ni colecciones (filtro UX-3 de `mensajeDeErrorUsuario`).
 */
export const MENSAJES_CUSTODIA: Readonly<Record<CodigoErrorCustodia, string>> = {
  SIN_TITULAR:
    'El documento no se ha guardado: el registro no tiene titular asignado y no existe una carpeta donde custodiarlo. Asigna el titular y vuelve a adjuntarlo.',
  SIN_PERMISO:
    'El documento no se ha guardado: tu cuenta no tiene permiso para custodiar archivos de este titular. Si debería tenerlo, avisa a la administración.',
  NO_AUTENTICADO:
    'El documento no se ha guardado: la sesión ha caducado. Vuelve a iniciar sesión e inténtalo de nuevo.',
  TIEMPO_AGOTADO:
    'El documento no se ha guardado: la subida ha superado el tiempo máximo y se ha cancelado. Comprueba la conexión e inténtalo de nuevo.',
  TIPO_O_TAMANO:
    'El documento no se ha guardado: el tipo o el tamaño del archivo no están admitidos. Adjunta un PDF o una imagen dentro del límite indicado.',
  RED:
    'El documento no se ha guardado: no se ha podido conectar con el almacenamiento. Comprueba la conexión e inténtalo de nuevo.',
  CANCELADO:
    'El documento no se ha guardado: la subida se ha cancelado antes de completarse. Inténtalo de nuevo.',
  DESCONOCIDO:
    'El documento no se ha guardado. Inténtalo de nuevo y, si el problema continúa, avisa a la administración.',
};

export class ErrorCustodiaDocumento extends Error {
  readonly codigo: CodigoErrorCustodia;
  readonly storagePath?: string;
  readonly causa?: unknown;

  constructor(codigo: CodigoErrorCustodia, opciones: { storagePath?: string; causa?: unknown; mensaje?: string } = {}) {
    super(opciones.mensaje || MENSAJES_CUSTODIA[codigo]);
    this.name = 'ErrorCustodiaDocumento';
    this.codigo = codigo;
    this.storagePath = opciones.storagePath;
    this.causa = opciones.causa;
  }
}

export function esErrorCustodiaDocumento(error: unknown): error is ErrorCustodiaDocumento {
  return error instanceof ErrorCustodiaDocumento
    || (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'ErrorCustodiaDocumento');
}

/** Código `storage/...` del SDK si el error lo trae; `''` en caso contrario. */
function codigoSdk(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const codigo = (error as { code?: unknown }).code;
  return typeof codigo === 'string' ? codigo : '';
}

/** Traduce un fallo del SDK de Storage a un error de custodia con código estable. */
export function clasificarErrorStorage(error: unknown, storagePath?: string): ErrorCustodiaDocumento {
  if (esErrorCustodiaDocumento(error)) return error;
  const codigo = codigoSdk(error);
  const sinConexion = typeof navigator !== 'undefined' && navigator && navigator.onLine === false;
  let clasificado: CodigoErrorCustodia;
  switch (codigo) {
    case 'storage/unauthorized':
      clasificado = 'SIN_PERMISO';
      break;
    case 'storage/unauthenticated':
      clasificado = 'NO_AUTENTICADO';
      break;
    case 'storage/canceled':
      clasificado = 'CANCELADO';
      break;
    case 'storage/retry-limit-exceeded':
    case 'storage/server-file-wrong-size':
      clasificado = 'RED';
      break;
    case 'storage/invalid-argument':
    case 'storage/invalid-format':
      clasificado = 'TIPO_O_TAMANO';
      break;
    default:
      clasificado = sinConexion ? 'RED' : 'DESCONOCIDO';
  }
  return new ErrorCustodiaDocumento(clasificado, { storagePath, causa: error });
}

// ---------------------------------------------------------------------------
// Rutas y validación previa (paridad con `storage.rules`)
// ---------------------------------------------------------------------------

/** Segmento de ruta seguro (`[A-Za-z0-9._-]`), nunca vacío. */
export function sanearSegmento(valor: string | undefined | null, defecto: string): string {
  const limpio = String(valor ?? '').trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  return limpio.length > 0 ? limpio : defecto;
}

/** Exige un identificador de titular real: sin él no hay carpeta de custodia. */
export function exigirTitular(propietarioId: string | undefined | null, storagePathPrevisto?: string): string {
  const pid = String(propietarioId ?? '').trim();
  if (!pid || pid === 'sin_asignar') {
    throw new ErrorCustodiaDocumento('SIN_TITULAR', { storagePath: storagePathPrevisto });
  }
  return pid;
}

/** MIME efectivo del archivo (por extensión si el navegador no lo informa). */
export function tipoContenidoDe(file: Blob, nombre: string): string {
  const declarado = String((file as File).type || '').trim().toLowerCase();
  if (declarado) return declarado;
  const n = nombre.toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

/** Límites que impone cada prefijo de `storage.rules` (la regla sigue siendo la autoridad). */
export const LIMITES_PREFIJO = {
  /** `gastos_facturas/{pid}/…` · `isPdfOrImage()` y `< 12 MB`. */
  gastos_facturas: { maxBytes: 12 * 1024 * 1024, tipos: /^(application\/pdf|application\/octet-stream|image\/)/ },
  /** `cobros_justificantes/{pid}/…` · `isPdfOrImage()` y `< 12 MB`. */
  cobros_justificantes: { maxBytes: 12 * 1024 * 1024, tipos: /^(application\/pdf|application\/octet-stream|image\/)/ },
  /** `documentos_solicitados/{sol}/{file}` · `isPdfOrImage()` y `< 15 MB`. */
  documentos_solicitados: { maxBytes: 15 * 1024 * 1024, tipos: /^(application\/pdf|application\/octet-stream|image\/)/ },
} as const;

export interface LimitePrefijo {
  maxBytes: number;
  tipos: RegExp;
}

/** Validación en cliente ANTES de tocar la red (la denegación de la regla sería la misma, pero opaca). */
export function validarPrevio(file: Blob, contentType: string, limite: LimitePrefijo, storagePath: string): void {
  if (!(file.size > 0) || file.size >= limite.maxBytes || !limite.tipos.test(contentType)) {
    throw new ErrorCustodiaDocumento('TIPO_O_TAMANO', { storagePath });
  }
}

// ---------------------------------------------------------------------------
// Subida duradera
// ---------------------------------------------------------------------------

/** Plazo por defecto de una subida antes de cancelarla (facturas de varios MB en redes móviles). */
export const PLAZO_SUBIDA_MS = 90_000;

export interface MotorStorage {
  ref: (storage: FirebaseStorage, path: string) => StorageReference;
  uploadBytesResumable: (referencia: StorageReference, datos: Blob, metadata?: UploadMetadata) => UploadTask;
  getDownloadURL: (referencia: StorageReference) => Promise<string>;
}

/**
 * Implementación real (SDK). Inyectable en tests para no depender de red. Las
 * funciones del SDK se resuelven en el momento de la llamada (no al cargar el
 * módulo) para que los dobles parciales de `firebase/storage` de otras suites
 * no tengan que conocer `uploadBytesResumable`.
 */
export const MOTOR_STORAGE_SDK: MotorStorage = {
  ref: (storage, path) => ref(storage, path),
  uploadBytesResumable: (referencia, datos, metadata) => uploadBytesResumable(referencia, datos, metadata),
  getDownloadURL: (referencia) => getDownloadURL(referencia),
};

export interface PeticionSubidaDuradera {
  storagePath: string;
  datos: Blob;
  contentType: string;
  /** Límite del prefijo (validación previa). Si se omite no se prevalida. */
  limite?: LimitePrefijo;
  plazoMs?: number;
  customMetadata?: Record<string, string>;
}

export interface ResultadoSubidaDuradera {
  /** URL de descarga (uso en la interfaz; la referencia persistente es `storagePath`). */
  url: string;
  storagePath: string;
  bytes: number;
  contentType: string;
}

/**
 * Sube un binario a Storage y devuelve `{ url, storagePath }` SOLO si el objeto
 * ha quedado escrito y su URL se ha obtenido. Cualquier otro desenlace lanza
 * `ErrorCustodiaDocumento`. Al agotarse el plazo la tarea se CANCELA.
 */
export async function subirBinarioDuradero(
  storage: FirebaseStorage,
  peticion: PeticionSubidaDuradera,
  motor: MotorStorage = MOTOR_STORAGE_SDK,
): Promise<ResultadoSubidaDuradera> {
  const { storagePath, datos, contentType } = peticion;
  if (peticion.limite) validarPrevio(datos, contentType, peticion.limite, storagePath);

  const referencia = motor.ref(storage, storagePath);
  const metadata: UploadMetadata = { contentType };
  if (peticion.customMetadata) metadata.customMetadata = peticion.customMetadata;
  const tarea = motor.uploadBytesResumable(referencia, datos, metadata);
  const plazoMs = peticion.plazoMs ?? PLAZO_SUBIDA_MS;

  await new Promise<void>((resolver, rechazar) => {
    let agotado = false;
    const temporizador = setTimeout(() => {
      agotado = true;
      // `cancel()` devuelve false si la tarea ya había terminado: en ese caso
      // la promesa de la tarea resuelve y la subida cuenta como correcta.
      try { tarea.cancel(); } catch { /* la promesa de la tarea decide */ }
    }, plazoMs);
    tarea.then(
      () => { clearTimeout(temporizador); resolver(); },
      (error: unknown) => {
        clearTimeout(temporizador);
        rechazar(agotado
          ? new ErrorCustodiaDocumento('TIEMPO_AGOTADO', { storagePath, causa: error })
          : clasificarErrorStorage(error, storagePath));
      },
    );
  });

  let url: string;
  try {
    url = await motor.getDownloadURL(referencia);
  } catch (error) {
    throw clasificarErrorStorage(error, storagePath);
  }
  if (typeof url !== 'string' || url.length === 0) {
    throw new ErrorCustodiaDocumento('DESCONOCIDO', { storagePath });
  }
  return { url, storagePath, bytes: datos.size, contentType };
}

// ---------------------------------------------------------------------------
// Referencias heredadas sin custodia
// ---------------------------------------------------------------------------

/**
 * `true` si una referencia guardada apunta al almacén efímero retirado
 * (`server_*`) o a una data-URL local (`local_*`): no hay binario custodiado.
 */
export function esReferenciaSinCustodia(storagePath: string | undefined | null): boolean {
  const ruta = String(storagePath ?? '');
  return ruta.startsWith('server_') || ruta.startsWith('local_');
}
