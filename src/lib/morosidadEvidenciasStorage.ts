/**
 * R2 — Persistencia real en Firebase Storage de evidencias de morosidad.
 *
 * Las evidencias (`evidencias_morosidad`, BLOQUE C) guardaban solo metadatos:
 * el campo `storagePath` estaba declarado pero nada lo poblaba (no existía
 * subida de ficheros, ni base64, ni localStorage en el flujo: nada que migrar).
 * Este módulo implementa la pata Storage que faltaba:
 *
 * - Subida: `subirEvidenciaMorosidadStorage` (valida tipo/tamaño en cliente,
 *   sube el binario y devuelve `{ url, storagePath, ...metadatos }` para
 *   anexarlos a la evidencia creada por el motor `crearEvidencia`).
 * - Lectura: `obtenerUrlEvidenciaMorosidad` (resuelve un `storagePath` propio
 *   a URL de descarga efímera; la referencia persistente sigue siendo el path).
 * - Sin borrado: las evidencias son append-only (regla Firestore §34 y regla
 *   Storage R2 deniegan el delete). Sin fallback a base64/data-URL jamás.
 *
 * Seguridad (paridad con las reglas):
 * - Ruta privada por propietario y expediente:
 *   `morosidad_evidencias/{propietarioId}/{expedienteId}/{ts}_{rand}_{fichero}`.
 * - Solo la administración maestra opera (regla Storage R2 con `isMasterAdmin`,
 *   igual que Firestore §34: el propietario/inquilino nunca leen evidencias).
 * - Tipos/tamaño espejan `esEvidenciaValida()`: PDF/JPEG/PNG/WEBP, < 10 MB.
 * - Los segmentos de ruta se sanean (sin `/`, sin `..`, sin vacío).
 * - Los errores se propagan al llamador (UI); este módulo nunca los silencia.
 */
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';

/** Raíz Storage de evidencias de morosidad (ver regla R2 en `storage.rules`). */
export const MOROSIDAD_EVIDENCIAS_RAIZ = 'morosidad_evidencias';

/** Tamaño máximo por adjunto: 10 MB (paridad con `esEvidenciaValida()`). */
export const TAMANO_MAX_EVIDENCIA_BYTES = 10 * 1024 * 1024;

/** MIME permitidos (paridad con `esEvidenciaValida()`). Minúsculas exactas. */
export const TIPOS_MIME_PERMITIDOS_EVIDENCIA: readonly string[] = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

/** Guarda anti-cuelgue de subida (igual que evidencias de actas). */
export const TIMEOUT_SUBIDA_EVIDENCIA_MS = 20000;

/**
 * Sanea un segmento de ruta Storage (solo `[A-Za-z0-9._-]`; nunca vacío).
 * Determinista: la misma entrada siempre produce lo mismo.
 */
export function sanearSegmentoRuta(segmento: string, defecto: string): string {
  const limpio = String(segmento || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  return limpio.length > 0 ? limpio : defecto;
}

export interface OpcionesRutaEvidencia {
  /** Timestamp inyectable (determinismo en tests). Por defecto `Date.now()`. */
  ahora?: number;
  /** Componente aleatorio inyectable. Por defecto 4 chars base36. */
  aleatorio?: string;
}

/**
 * Construye la ruta Storage de un adjunto de evidencia. Lanza si falta
 * propietario o expediente (sin esos segmentos no hay aislamiento).
 */
export function construirRutaEvidenciaMorosidad(
  propietarioId: string,
  expedienteId: string,
  fileName: string,
  opts: OpcionesRutaEvidencia = {},
): string {
  if (!propietarioId || propietarioId.trim().length === 0) {
    throw new Error('propietarioId requerido para subir una evidencia de morosidad');
  }
  if (!expedienteId || expedienteId.trim().length === 0) {
    throw new Error('expedienteId requerido para subir una evidencia de morosidad');
  }
  const ts = opts.ahora ?? Date.now();
  const rand = opts.aleatorio ?? Math.random().toString(36).substring(2, 6);
  const ownerSeg = sanearSegmentoRuta(propietarioId, 'sin_propietario');
  const expSeg = sanearSegmentoRuta(expedienteId, 'sin_expediente');
  const nombreSeg = sanearSegmentoRuta(fileName, 'evidencia.bin');
  return `${MOROSIDAD_EVIDENCIAS_RAIZ}/${ownerSeg}/${expSeg}/${ts}_${rand}_${nombreSeg}`;
}

export type ArchivoEvidencia = Pick<File, 'size' | 'type'> & { name?: string };

/**
 * Validación cliente del adjunto (la regla Storage re-valida en servidor).
 * Estricta: sin MIME reconocido no se sube (la regla exige contentType válido).
 */
export function validarArchivoEvidencia(
  file: ArchivoEvidencia | null | undefined,
): { ok: boolean; errores: string[] } {
  if (!file) return { ok: false, errores: ['archivo_requerido'] };
  const errores: string[] = [];
  if (!(file.size > 0)) errores.push('archivo_vacio');
  if (file.size > TAMANO_MAX_EVIDENCIA_BYTES) errores.push('tamano_excedido_10MB');
  const mime = String(file.type || '').toLowerCase();
  if (!TIPOS_MIME_PERMITIDOS_EVIDENCIA.includes(mime)) errores.push('tipo_no_permitido');
  return { ok: errores.length === 0, errores };
}

export interface AdjuntoEvidenciaSubido {
  /** URL de descarga efímera (uso inmediato; NO es la referencia persistente). */
  url: string;
  /** Referencia persistente (se guarda en `EvidenciaMorosidad.storagePath`). */
  storagePath: string;
  nombreArchivo: string;
  tipoMime: string;
  tamanoBytes: number;
}

/**
 * Sube un adjunto de evidencia a Storage. Valida antes de tocar la red;
 * ante timeout o fallo propaga el error (sin fallback a base64/data-URL).
 */
export async function subirEvidenciaMorosidadStorage(
  propietarioId: string,
  expedienteId: string,
  file: File | Blob,
  fileName?: string,
): Promise<AdjuntoEvidenciaSubido> {
  const v = validarArchivoEvidencia(file as ArchivoEvidencia);
  if (!v.ok) {
    throw new Error(`Adjunto de evidencia no válido: ${v.errores.join(', ')}`);
  }
  const nombre = fileName || (file as File).name || 'evidencia.bin';
  const mime = String((file as File).type || '').toLowerCase();
  const storagePath = construirRutaEvidenciaMorosidad(propietarioId, expedienteId, nombre);
  const fileRef = ref(storage, storagePath);
  const subida = (async () => {
    await uploadBytes(fileRef, file, { contentType: mime });
    return getDownloadURL(fileRef);
  })();
  // Evita unhandled rejection si el timeout gana la carrera (el error real de
  // la subida ya no importa: el llamador recibe el timeout y reintenta).
  subida.catch(() => undefined);
  const esperaMaxima = new Promise<null>((resolver) =>
    setTimeout(() => resolver(null), TIMEOUT_SUBIDA_EVIDENCIA_MS),
  );
  const url = await Promise.race([subida, esperaMaxima]);
  if (!url || typeof url !== 'string') {
    throw new Error(
      'La subida de la evidencia ha tardado demasiado. Revisa la conexión e inténtalo de nuevo.',
    );
  }
  return { url, storagePath, nombreArchivo: nombre, tipoMime: mime, tamanoBytes: file.size };
}

/**
 * Resuelve un `storagePath` de evidencia a URL de descarga efímera.
 * Solo resuelve rutas bajo `morosidad_evidencias/` (nunca URLs, data-URLs
 * ni rutas de otras colecciones): defensa en profundidad en cliente.
 */
export async function obtenerUrlEvidenciaMorosidad(storagePath: string): Promise<string> {
  const ruta = String(storagePath || '').trim();
  if (!ruta) throw new Error('storagePath requerido para recuperar la evidencia');
  if (!ruta.startsWith(`${MOROSIDAD_EVIDENCIAS_RAIZ}/`)) {
    throw new Error('Ruta de evidencia no válida: fuera de morosidad_evidencias/');
  }
  return getDownloadURL(ref(storage, ruta));
}
