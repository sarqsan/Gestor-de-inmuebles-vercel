/**
 * P3 — TRAZABILIDAD DOCUMENTAL · DOCUMENTOS ACREDITATIVOS DE PROFESIONALES (núcleo puro).
 * ---------------------------------------------------------------------------
 * Extiende el MISMO sistema documental del expediente (BLOQUE 6,
 * `documentos_patrimoniales`): mismas validaciones de nombre/MIME/tamaño, misma
 * huella SHA-256, mismo ciclo de vida (`EstadoDocumentoPatrimonial`) y misma
 * auditoría (`audit_logs`). No crea una colección global ni un almacén paralelo:
 * los metadatos viven como subcolección del profesional
 * (`profesionales/{id}/documentos_profesionales/{docId}`) y el binario en la ruta
 * privada `profesionales/{id}/documentos/{docId}/{nombreStorage}` de Storage.
 *
 * Estados (distinción exigida por P3 §2):
 *  · seleccionado/pendiente de subir → sólo en la UI, nunca persistido como éxito;
 *  · PENDIENTE_STORAGE → metadato creado, binario aún no confirmado;
 *  · DISPONIBLE → binario confirmado (descarga autorizada por reglas);
 *  · ERROR_STORAGE → la subida falló o el objeto no existe/está alterado;
 *  · PENDIENTE_ELIMINACION / ELIMINADO → tombstone auditado.
 * La integridad VERIFICADA es un resultado de operación (`ResultadoVerificacion`),
 * no un estado declarativo: sólo se afirma tras recomputar la huella de los bytes.
 *
 * La huella SHA-256 detecta alteraciones del contenido respecto a la registrada
 * en el alta. NO es firma digital, ni sello de tiempo cualificado, ni prueba de
 * autoría o procedencia externa.
 *
 * Módulo 100% puro: sin Firebase ni I/O.
 */
import { sha256Hex } from '../../utils/sha256';
import type { DocumentoProfesional } from '../../types';
import {
  ErrorDocumentoPatrimonial,
  sanearNombreDocumento,
  validarArchivoDocumento,
} from './gestor';
import type { EstadoDocumentoPatrimonial } from './tipos';

export const SUBCOLECCION_DOCUMENTOS_PROFESIONALES = 'documentos_profesionales';

export const TIPOS_DOCUMENTO_PROFESIONAL = [
  'SEGURO_RC',
  'ALTA_IAE',
  'PREVENCION_RIESGOS',
  'CERTIFICADO_CONTRATISTA',
  'TITULO_OFICIAL',
  'OTRO',
] as const;
export type TipoDocumentoProfesional = (typeof TIPOS_DOCUMENTO_PROFESIONAL)[number];

/** Motivos registrables de ERROR_STORAGE (lista cerrada, paridad con firestore.rules). */
export const MOTIVOS_ERROR_STORAGE = ['SUBIDA_FALLIDA', 'OBJETO_AUSENTE', 'INTEGRIDAD_DISCREPANTE'] as const;
export type MotivoErrorStorage = (typeof MOTIVOS_ERROR_STORAGE)[number];

export interface DocumentoProfesionalAlmacenado {
  id: string;
  profesionalId: string;
  tipo: TipoDocumentoProfesional;
  nombre: string;
  nombreStorage: string;
  mimeType: string;
  tamanoBytes: number;
  sha256: string;
  storagePath: string;
  fechaIncorporacion: string;
  actorId: string;
  actorNombre: string;
  version: number;
  sustituyeA?: string;
  estado: EstadoDocumentoPatrimonial;
  motivoError?: MotivoErrorStorage;
  actualizadoEl?: string;
  eliminadoEl?: string;
}

export interface EntradaDocumentoProfesional {
  id: string;
  profesionalId: string;
  tipo: string;
  nombre: string;
  mimeType: string;
  tamanoBytes: number;
  sha256: string;
  fechaIncorporacion: string;
  actorId: string;
  actorNombre: string;
  version?: number;
  sustituyeA?: string;
}

export type ResultadoVerificacion =
  | { estado: 'VERIFICADO'; sha256: string; tamanoBytes: number }
  | { estado: 'OBJETO_AUSENTE' }
  | { estado: 'INTEGRIDAD_DISCREPANTE'; sha256Obtenido?: string; tamanoObtenido?: number }
  | { estado: 'NO_VERIFICABLE'; motivo: string };

const ID_PROFESIONAL = /^[A-Za-z0-9_-]{1,128}$/;
const ID_DOCUMENTO = /^dpr_[a-f0-9]{64}$/;

export function esTipoDocumentoProfesional(tipo: string): tipo is TipoDocumentoProfesional {
  return (TIPOS_DOCUMENTO_PROFESIONAL as readonly string[]).includes(tipo);
}

/** Ruta de Storage canónica: el ID del documento forma parte de la ruta (no reutilizable). */
export function rutaStorageDocumentoProfesional(profesionalId: string, documentoId: string, nombreStorage: string): string {
  return `profesionales/${profesionalId}/documentos/${documentoId}/${nombreStorage}`;
}

/**
 * ID determinista por profesional + contenido + tipo + versión sustituida: un
 * doble clic o un reintento tras fallo NO crean otra copia, y el mismo archivo
 * no puede reaparecer bajo otro profesional con el mismo ID.
 */
export function generarIdDocumentoProfesional(profesionalId: string, sha256: string, tipo: string, sustituyeA?: string): string {
  return `dpr_${sha256Hex(`${profesionalId}|${sha256.toLowerCase()}|${tipo}|${sustituyeA || ''}`).toLowerCase()}`;
}

export function crearDocumentoProfesional(input: EntradaDocumentoProfesional): DocumentoProfesionalAlmacenado {
  if (!ID_PROFESIONAL.test(input.profesionalId || '')) {
    throw new ErrorDocumentoPatrimonial('PROFESIONAL_INVALIDO', 'El identificador del profesional no es válido.');
  }
  if (!esTipoDocumentoProfesional(input.tipo)) {
    throw new ErrorDocumentoPatrimonial('TIPO_NO_PERMITIDO', 'Tipo de documento profesional no admitido.');
  }
  const mimeType = validarArchivoDocumento(input);
  const nombreStorage = sanearNombreDocumento(input.nombre);
  if (!ID_DOCUMENTO.test(input.id)) {
    throw new ErrorDocumentoPatrimonial('ID_INVALIDO', 'El identificador documental no es válido.');
  }
  if (input.id !== generarIdDocumentoProfesional(input.profesionalId, input.sha256, input.tipo, input.sustituyeA)) {
    throw new ErrorDocumentoPatrimonial('ID_INCOHERENTE', 'El identificador no corresponde al contenido y al profesional.');
  }
  if (!input.actorId || !input.fechaIncorporacion) {
    throw new ErrorDocumentoPatrimonial('CONTEXTO_INCOMPLETO', 'Faltan datos de actor o fecha.');
  }
  return {
    id: input.id,
    profesionalId: input.profesionalId,
    tipo: input.tipo,
    nombre: input.nombre.trim().slice(0, 200) || nombreStorage,
    nombreStorage,
    mimeType,
    tamanoBytes: input.tamanoBytes,
    sha256: input.sha256.toLowerCase(),
    storagePath: rutaStorageDocumentoProfesional(input.profesionalId, input.id, nombreStorage),
    fechaIncorporacion: input.fechaIncorporacion,
    actorId: input.actorId,
    actorNombre: (input.actorNombre || 'Usuario').trim().slice(0, 120) || 'Usuario',
    version: input.version ?? 1,
    ...(input.sustituyeA ? { sustituyeA: input.sustituyeA } : {}),
    estado: 'PENDIENTE_STORAGE',
  };
}

/**
 * Ciclo de vida. Respecto al patrimonial añade DISPONIBLE → ERROR_STORAGE:
 * la pérdida o alteración del objeto detectada al verificar NO se oculta tras
 * metadatos que siguen diciendo «disponible».
 */
const TRANSICIONES: Record<EstadoDocumentoPatrimonial, readonly EstadoDocumentoPatrimonial[]> = {
  PENDIENTE_STORAGE: ['DISPONIBLE', 'ERROR_STORAGE', 'PENDIENTE_ELIMINACION'],
  DISPONIBLE: ['ERROR_STORAGE', 'PENDIENTE_ELIMINACION'],
  ERROR_STORAGE: ['PENDIENTE_STORAGE', 'PENDIENTE_ELIMINACION'],
  PENDIENTE_ELIMINACION: ['ELIMINADO'],
  ELIMINADO: [],
};

export function validarTransicionDocumentoProfesional(actual: EstadoDocumentoPatrimonial, siguiente: EstadoDocumentoPatrimonial): void {
  if (!TRANSICIONES[actual]?.includes(siguiente)) {
    throw new ErrorDocumentoPatrimonial('TRANSICION_INVALIDA', `No se permite pasar de ${actual} a ${siguiente}.`);
  }
}

/** Compara la huella recomputada de los bytes recuperados con la registrada. */
export function evaluarIntegridad(
  documento: Pick<DocumentoProfesionalAlmacenado, 'sha256' | 'tamanoBytes'>,
  obtenido: { sha256: string; tamanoBytes: number }
): ResultadoVerificacion {
  const sha = obtenido.sha256.toLowerCase();
  if (sha === documento.sha256.toLowerCase() && obtenido.tamanoBytes === documento.tamanoBytes) {
    return { estado: 'VERIFICADO', sha256: sha, tamanoBytes: obtenido.tamanoBytes };
  }
  return { estado: 'INTEGRIDAD_DISCREPANTE', sha256Obtenido: sha, tamanoObtenido: obtenido.tamanoBytes };
}

// ---------------------------------------------------------------------------
// Presentación honesta del estado (UI): nunca «guardado» si no hay binario.
// ---------------------------------------------------------------------------

export type PresentacionDocumento = {
  etiqueta: string;
  tono: 'ok' | 'pendiente' | 'error' | 'heredado';
  descargable: boolean;
};

export function presentarEstadoDocumentoProfesional(doc: Pick<DocumentoProfesionalAlmacenado, 'estado' | 'motivoError'>): PresentacionDocumento {
  switch (doc.estado) {
    case 'DISPONIBLE':
      return { etiqueta: 'Almacenado en Storage privado', tono: 'ok', descargable: true };
    case 'PENDIENTE_STORAGE':
      return { etiqueta: 'Pendiente de almacenamiento (no confirmado)', tono: 'pendiente', descargable: false };
    case 'ERROR_STORAGE':
      return {
        etiqueta: doc.motivoError === 'OBJETO_AUSENTE'
          ? 'No disponible: el archivo no existe en Storage'
          : doc.motivoError === 'INTEGRIDAD_DISCREPANTE'
            ? 'No disponible: el contenido no coincide con la huella registrada'
            : 'Error de almacenamiento: vuelve a subir el mismo archivo',
        tono: 'error',
        descargable: false,
      };
    case 'PENDIENTE_ELIMINACION':
      return { etiqueta: 'Eliminación pendiente de completar', tono: 'pendiente', descargable: false };
    default:
      return { etiqueta: 'Eliminado (se conserva la traza)', tono: 'heredado', descargable: false };
  }
}

/**
 * Entradas HEREDADAS del array `profesional.documentos` (flujo anterior a P3).
 * No se modifican ni migran (P3 §7: no tocar datos documentales preexistentes);
 * sólo se clasifican para no presentarlas como almacenadas cuando no lo están:
 *  · data:/base64 o vacío → el fallback anterior las guardó SIN Storage.
 *  · URL http(s) → referencia externa sin metadatos ni huella: no verificable.
 */
export type ClaseDocumentoHeredado = 'NO_ALMACENADO' | 'REFERENCIA_NO_VERIFICADA';

export function clasificarDocumentoProfesionalHeredado(doc: Pick<DocumentoProfesional, 'downloadUrl' | 'url'>): ClaseDocumentoHeredado {
  const url = (doc.downloadUrl || doc.url || '').trim();
  if (!url || /^data:/i.test(url) || !/^https:\/\//i.test(url)) return 'NO_ALMACENADO';
  return 'REFERENCIA_NO_VERIFICADA';
}
