import { sha256Hex } from '../../utils/sha256';
import type { DocumentoPatrimonial, EstadoDocumentoPatrimonial, TipoDocumentoExpediente } from './tipos';

export const TAMANO_MAXIMO_DOCUMENTO_BYTES = 20 * 1024 * 1024;
export const MIME_DOCUMENTOS_PATRIMONIALES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type RelacionesDocumento = Pick<DocumentoPatrimonial,
  | 'contratoId' | 'polizaId' | 'gastoId' | 'facturaId'
  | 'incidenciaId' | 'tareaMantenimientoId' | 'garantiaId' | 'inventarioId' | 'movimientoId'
>;

export interface FuenteRelacionada {
  id: string;
  inmuebleId?: string;
  propietarioId?: string;
  contratoId?: string;
  gastoId?: string;
  incidenciaId?: string;
  estado?: string;
}

export interface ArchivoDocumentoInput {
  id: string;
  inmuebleId: string;
  propietarioId: string;
  tipo: TipoDocumentoExpediente;
  nombre: string;
  mimeType: string;
  tamanoBytes: number;
  sha256: string;
  fechaDocumental?: string;
  fechaIncorporacion: string;
  actorId: string;
  actorNombre: string;
  relaciones?: RelacionesDocumento;
  referencia?: string;
  observaciones?: string;
  version?: number;
  sustituyeA?: string;
}

export class ErrorDocumentoPatrimonial extends Error {
  constructor(readonly codigo: string, message: string) {
    super(message);
    this.name = 'ErrorDocumentoPatrimonial';
  }
}

export function sanearNombreDocumento(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop()?.trim() || 'documento';
  const safe = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 150);
  if (!safe || safe === '.' || safe === '..') {
    throw new ErrorDocumentoPatrimonial('NOMBRE_INVALIDO', 'El nombre del archivo no es válido.');
  }
  return safe;
}

export function validarArchivoDocumento(input: Pick<ArchivoDocumentoInput, 'nombre' | 'mimeType' | 'tamanoBytes' | 'sha256'>): string {
  sanearNombreDocumento(input.nombre);
  const mime = input.mimeType.trim().toLowerCase();
  if (!(MIME_DOCUMENTOS_PATRIMONIALES as readonly string[]).includes(mime)) {
    throw new ErrorDocumentoPatrimonial('MIME_NO_PERMITIDO', 'Sólo se admiten PDF, JPEG, PNG y WEBP.');
  }
  if (!Number.isSafeInteger(input.tamanoBytes) || input.tamanoBytes <= 0 || input.tamanoBytes > TAMANO_MAXIMO_DOCUMENTO_BYTES) {
    throw new ErrorDocumentoPatrimonial('TAMANO_INVALIDO', 'El archivo debe ocupar entre 1 byte y 20 MB.');
  }
  if (!/^[a-f0-9]{64}$/i.test(input.sha256)) {
    throw new ErrorDocumentoPatrimonial('HASH_INVALIDO', 'No se pudo calcular una huella SHA-256 válida.');
  }
  return mime;
}

export async function calcularSha256Archivo(file: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new ErrorDocumentoPatrimonial('CRYPTO_NO_DISPONIBLE', 'El navegador no permite verificar la huella del archivo.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Valida cada referencia contra snapshots ya cargados y vinculados al inmueble. */
export function validarRelacionesDocumento(
  inmueble: FuenteRelacionada,
  propietarioId: string,
  relaciones: RelacionesDocumento,
  fuentes: Partial<Record<keyof RelacionesDocumento, FuenteRelacionada | undefined>>
): void {
  if (!inmueble.id || inmueble.propietarioId !== propietarioId) {
    throw new ErrorDocumentoPatrimonial('INMUEBLE_NO_AUTORIZADO', 'El inmueble no pertenece al titular indicado.');
  }
  if (relaciones.movimientoId && (!relaciones.gastoId || relaciones.movimientoId !== `GASTO:${relaciones.gastoId}`)) {
    throw new ErrorDocumentoPatrimonial('MOVIMIENTO_INVALIDO', 'La operación debe derivarse del gasto canónico relacionado.');
  }
  const gastoFuente = fuentes.gastoId;
  if (relaciones.gastoId && relaciones.contratoId && gastoFuente?.contratoId !== relaciones.contratoId) {
    throw new ErrorDocumentoPatrimonial('RELACION_CRUZADA_INVALIDA', 'El gasto no pertenece al contrato seleccionado.');
  }
  if (relaciones.gastoId && relaciones.incidenciaId && gastoFuente?.incidenciaId !== relaciones.incidenciaId) {
    throw new ErrorDocumentoPatrimonial('RELACION_CRUZADA_INVALIDA', 'El gasto no pertenece a la incidencia seleccionada.');
  }
  if (relaciones.facturaId && relaciones.gastoId && fuentes.facturaId?.gastoId !== relaciones.gastoId) {
    throw new ErrorDocumentoPatrimonial('RELACION_CRUZADA_INVALIDA', 'La factura no está vinculada al gasto seleccionado.');
  }
  if (relaciones.garantiaId && relaciones.incidenciaId && fuentes.garantiaId?.incidenciaId !== relaciones.incidenciaId) {
    throw new ErrorDocumentoPatrimonial('RELACION_CRUZADA_INVALIDA', 'La garantía no pertenece a la incidencia seleccionada.');
  }
  const campos = (Object.keys(relaciones) as (keyof RelacionesDocumento)[]).filter((campo) => campo !== 'movimientoId');
  for (const campo of campos) {
    const id = relaciones[campo];
    if (!id) continue;
    const fuente = fuentes[campo];
    if (!fuente || fuente.id !== id || fuente.inmuebleId !== inmueble.id) {
      throw new ErrorDocumentoPatrimonial('RELACION_INVALIDA', `La relación ${campo} no corresponde a este inmueble.`);
    }
    if (fuente.propietarioId && fuente.propietarioId !== propietarioId) {
      throw new ErrorDocumentoPatrimonial('RELACION_TITULAR_INVALIDA', `La relación ${campo} pertenece a otro titular.`);
    }
  }
}

export function crearDocumentoPatrimonial(input: ArchivoDocumentoInput): DocumentoPatrimonial {
  const mimeType = validarArchivoDocumento(input);
  const nombreStorage = sanearNombreDocumento(input.nombre);
  if (!input.id || !/^[a-zA-Z0-9_-]{8,128}$/.test(input.id)) {
    throw new ErrorDocumentoPatrimonial('ID_INVALIDO', 'El identificador documental no es válido.');
  }
  if (!input.inmuebleId || !input.propietarioId || !input.actorId || !input.fechaIncorporacion) {
    throw new ErrorDocumentoPatrimonial('CONTEXTO_INCOMPLETO', 'Faltan datos de inmueble, titular, actor o fecha.');
  }
  const storagePath = `inmuebles/${input.inmuebleId}/documentos_patrimoniales/${input.id}/${nombreStorage}`;
  return {
    id: input.id,
    inmuebleId: input.inmuebleId,
    propietarioId: input.propietarioId,
    tipo: input.tipo,
    nombre: input.nombre.trim().slice(0, 200),
    nombreStorage,
    mimeType,
    tamanoBytes: input.tamanoBytes,
    sha256: input.sha256.toLowerCase(),
    storagePath,
    fechaDocumental: input.fechaDocumental,
    fechaIncorporacion: input.fechaIncorporacion,
    actorId: input.actorId,
    actorNombre: input.actorNombre.trim().slice(0, 120),
    referencia: input.referencia?.trim().slice(0, 160) || undefined,
    observaciones: input.observaciones?.trim().slice(0, 1000) || undefined,
    version: input.version ?? 1,
    sustituyeA: input.sustituyeA,
    estado: 'PENDIENTE_STORAGE',
    ...input.relaciones,
  };
}

const TRANSICIONES: Record<EstadoDocumentoPatrimonial, readonly EstadoDocumentoPatrimonial[]> = {
  PENDIENTE_STORAGE: ['DISPONIBLE', 'ERROR_STORAGE', 'PENDIENTE_ELIMINACION'],
  DISPONIBLE: ['PENDIENTE_ELIMINACION'],
  ERROR_STORAGE: ['PENDIENTE_STORAGE', 'PENDIENTE_ELIMINACION'],
  PENDIENTE_ELIMINACION: ['ELIMINADO'],
  ELIMINADO: [],
};

export function validarTransicionDocumento(estadoActual: EstadoDocumentoPatrimonial, siguiente: EstadoDocumentoPatrimonial): void {
  if (!TRANSICIONES[estadoActual].includes(siguiente)) {
    throw new ErrorDocumentoPatrimonial('TRANSICION_INVALIDA', `No se permite pasar de ${estadoActual} a ${siguiente}.`);
  }
}

/** ID estable por inmueble + contenido + relación: doble clic/concurrencia no crea otra copia. */
export function generarIdDocumentoPatrimonial(inmuebleId: string, sha256: string, relaciones: RelacionesDocumento = {}, sustituyeA?: string): string {
  const rel = Object.entries(relaciones).filter(([, value]) => Boolean(value)).sort(([a], [b]) => a.localeCompare(b));
  return `doc_${sha256Hex(`${inmuebleId}|${sha256.toLowerCase()}|${JSON.stringify(rel)}|${sustituyeA || ''}`)}`;
}

export function metadatosEditablesIguales(a: DocumentoPatrimonial, b: DocumentoPatrimonial): boolean {
  return a.id === b.id
    && a.inmuebleId === b.inmuebleId
    && a.propietarioId === b.propietarioId
    && a.storagePath === b.storagePath
    && a.sha256 === b.sha256
    && a.tamanoBytes === b.tamanoBytes
    && a.mimeType === b.mimeType
    && a.estado === b.estado;
}
