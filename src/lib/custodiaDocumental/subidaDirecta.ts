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
 * AG-03.2 (2026-10-20): el transporte ya no es el SDK de Firebase Storage sino
 * el motor mediado por el servidor (`almacenServidor.ts`): el servidor autoriza
 * contra la base Firestore con nombre, el navegador envía los bytes directamente
 * a Cloud Storage y el servidor confirma el objeto. El contrato de este módulo
 * (códigos, mensajes, plazo con cancelación, ausencia total de respaldo) no cambia.
 */
import {
  getDownloadURL as getDownloadURLServidor,
  subirDocumentoPublico as subirDocumentoPublicoServidor,
  uploadBytes as uploadBytesServidor,
  type MetadatosSubida,
  type OpcionesSubida,
  type ReferenciaAlmacen,
  type ResultadoSubida,
} from './almacenServidor';

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

/** Traduce un fallo del almacén (motor servidor o SDK) a un error de custodia con código estable. */
export function clasificarErrorStorage(error: unknown, storagePath?: string): ErrorCustodiaDocumento {
  if (esErrorCustodiaDocumento(error)) return error;
  const codigo = codigoSdk(error);
  const motivo = typeof error === 'object' && error !== null ? (error as { motivo?: unknown }).motivo : undefined;
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
      // El motor servidor marca `motivo: 'PLAZO'` cuando la cancelación la provocó el plazo máximo.
      clasificado = motivo === 'PLAZO' ? 'TIEMPO_AGOTADO' : 'CANCELADO';
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

/**
 * Motor de almacén: la superficie mínima que necesita la subida duradera.
 * Inyectable en pruebas para no depender de red. Por defecto, el motor
 * mediado por el servidor (`almacenServidor.ts`).
 */
export interface MotorStorage {
  uploadBytes: (
    referencia: ReferenciaAlmacen,
    datos: Blob,
    metadata: MetadatosSubida,
    opciones: OpcionesSubida,
  ) => Promise<ResultadoSubida>;
  getDownloadURL: (referencia: ReferenciaAlmacen) => Promise<string>;
  subirDocumentoPublico: (
    peticion: { storagePath: string; datos: Blob; contentType: string; solicitudDocId: string; token: string },
    opciones: OpcionesSubida,
  ) => Promise<ResultadoSubida>;
}

/**
 * Implementación real. Las funciones del motor se resuelven en el momento de
 * la llamada (no al cargar el módulo) para que los dobles parciales de otras
 * suites no tengan que conocer toda la superficie.
 */
export const MOTOR_STORAGE_SERVIDOR: MotorStorage = {
  uploadBytes: (referencia, datos, metadata, opciones) => uploadBytesServidor(referencia, datos, metadata, opciones),
  getDownloadURL: (referencia) => getDownloadURLServidor(referencia),
  subirDocumentoPublico: (peticion, opciones) => subirDocumentoPublicoServidor(peticion, opciones),
};

/** @deprecated Nombre histórico (ORDEN 1); el motor ya no es el SDK. Se conserva por compatibilidad. */
export const MOTOR_STORAGE_SDK: MotorStorage = MOTOR_STORAGE_SERVIDOR;

export interface PeticionSubidaDuradera {
  storagePath: string;
  datos: Blob;
  contentType: string;
  /** Límite del prefijo (validación previa). Si se omite no se prevalida. */
  limite?: LimitePrefijo;
  plazoMs?: number;
  customMetadata?: Record<string, string>;
  /**
   * Portal público de candidatos (sin sesión): el servidor autoriza la subida
   * por el token de la solicitud, verificado en la base Firestore con nombre.
   */
  accesoPublico?: { solicitudDocId: string; token: string };
}

export interface ResultadoSubidaDuradera {
  /** URL de descarga (uso en la interfaz; la referencia persistente es `storagePath`). */
  url: string;
  storagePath: string;
  bytes: number;
  contentType: string;
}

function referenciaDe(storagePath: string): ReferenciaAlmacen {
  return { fullPath: storagePath, name: storagePath.slice(storagePath.lastIndexOf('/') + 1) };
}

/**
 * Sube un binario y devuelve `{ url, storagePath }` SOLO si el servidor ha
 * confirmado el objeto (bytes verificados) y se dispone de su URL de descarga.
 * Cualquier otro desenlace lanza `ErrorCustodiaDocumento`. Al agotarse el plazo
 * el envío se CANCELA (`TIEMPO_AGOTADO`). El primer parámetro se mantiene por
 * compatibilidad de firma (`storage` del SDK) y se ignora.
 */
export async function subirBinarioDuradero(
  _storage: unknown,
  peticion: PeticionSubidaDuradera,
  motor: MotorStorage = MOTOR_STORAGE_SERVIDOR,
): Promise<ResultadoSubidaDuradera> {
  const { storagePath, datos, contentType } = peticion;
  if (peticion.limite) validarPrevio(datos, contentType, peticion.limite, storagePath);

  const referencia = referenciaDe(storagePath);
  const plazoMs = peticion.plazoMs ?? PLAZO_SUBIDA_MS;
  const metadata: MetadatosSubida = { contentType };
  if (peticion.customMetadata) metadata.customMetadata = peticion.customMetadata;

  let resultado: ResultadoSubida;
  try {
    resultado = peticion.accesoPublico
      ? await motor.subirDocumentoPublico(
          { storagePath, datos, contentType, solicitudDocId: peticion.accesoPublico.solicitudDocId, token: peticion.accesoPublico.token },
          { plazoMs },
        )
      : await motor.uploadBytes(referencia, datos, metadata, { plazoMs });
  } catch (error) {
    throw clasificarErrorStorage(error, storagePath);
  }

  let url: string | undefined = resultado && typeof resultado.url === 'string' && resultado.url ? resultado.url : undefined;
  if (!url) {
    try {
      url = await motor.getDownloadURL(referencia);
    } catch (error) {
      throw clasificarErrorStorage(error, storagePath);
    }
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
