import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
// AG-03.2: motor mediado por el servidor (autoriza contra la base Firestore con nombre).
import { deleteObject, getBytes, getMetadata, ref, uploadBytes } from '../custodiaDocumental/almacenServidor';
import { auth, db, registrarAuditoriaFirestore, storage } from '../firebase';
import { construirAuditoriaExpediente } from './auditoria';
import { evaluarIntegridad, type ResultadoVerificacion } from './documentosProfesionales';
import {
  crearDocumentoPatrimonial,
  ErrorDocumentoPatrimonial,
  generarIdDocumentoPatrimonial,
  sha256DeBytes,
  validarRelacionesDocumento,
  validarTransicionDocumento,
  type FuenteRelacionada,
  type RelacionesDocumento,
} from './gestor';
import type { DocumentoPatrimonial, EstadoDocumentoPatrimonial, TipoDocumentoExpediente } from './tipos';

const SUBCOLECCION = 'documentos_patrimoniales';
const COLECCION_FUENTE: Partial<Record<keyof RelacionesDocumento, string>> = {
  contratoId: 'contratos_formalizacion',
  polizaId: 'polizas_seguros',
  gastoId: 'gastos',
  facturaId: 'facturas',
  incidenciaId: 'incidencias',
  tareaMantenimientoId: 'tareas_mantenimiento',
  garantiaId: 'garantias_reparacion',
  inventarioId: 'inventario_inmuebles',
};

export interface SubirDocumentoPatrimonialInput {
  inmuebleId: string;
  tipo: TipoDocumentoExpediente;
  archivo: File | Blob;
  nombre?: string;
  fechaDocumental?: string;
  relaciones?: RelacionesDocumento;
  referencia?: string;
  observaciones?: string;
  sustituyeA?: string;
  actorNombre: string;
}

function refDocumento(inmuebleId: string, documentoId: string) {
  return doc(db, 'inmuebles', inmuebleId, SUBCOLECCION, documentoId);
}

function actorActual() {
  const user = auth.currentUser;
  if (!user) throw new ErrorDocumentoPatrimonial('NO_AUTENTICADO', 'Inicia sesión para gestionar documentos.');
  return { id: user.uid, email: user.email || '', nombre: user.displayName || user.email || user.uid };
}

function adjuntarAuditoria(
  actor: { id?: string; email?: string; nombre: string },
  accion: 'EXPEDIENTE_DOCUMENTO_INCORPORADO' | 'EXPEDIENTE_DOCUMENTO_SUSTITUIDO' | 'EXPEDIENTE_DOCUMENTO_MODIFICADO' | 'EXPEDIENTE_DOCUMENTO_DESCARGADO' | 'EXPEDIENTE_DOCUMENTO_ELIMINADO' | 'EXPEDIENTE_INCIDENCIA',
  documento: DocumentoPatrimonial,
  resultado: 'EXITO' | 'ERROR',
  descripcion: string
) {
  const payload = construirAuditoriaExpediente(
    actor,
    accion,
    'documento_expediente',
    documento.id,
    descripcion,
    {
      inmuebleId: documento.inmuebleId, propietarioId: documento.propietarioId,
      storagePath: documento.storagePath, estado: documento.estado,
      tipo: documento.tipo, sha256: documento.sha256, version: documento.version,
      sustituyeA: documento.sustituyeA, contratoId: documento.contratoId,
      gastoId: documento.gastoId, facturaId: documento.facturaId,
      incidenciaId: documento.incidenciaId,
    },
    resultado
  );
  return registrarAuditoriaFirestore(payload);
}

async function cargarContexto(
  inmuebleId: string,
  relaciones: RelacionesDocumento
): Promise<{ propietarioId: string; fuentes: Partial<Record<keyof RelacionesDocumento, FuenteRelacionada>> }> {
  const inmuebleSnap = await getDoc(doc(db, 'inmuebles', inmuebleId));
  if (!inmuebleSnap.exists()) throw new ErrorDocumentoPatrimonial('INMUEBLE_INEXISTENTE', 'El inmueble ya no está disponible.');
  const inmueble = { id: inmuebleSnap.id, ...inmuebleSnap.data() } as FuenteRelacionada;
  const propietarioId = inmueble.propietarioId;
  if (!propietarioId) throw new ErrorDocumentoPatrimonial('SIN_TITULAR', 'El inmueble no tiene un titular canónico asociado.');

  const fuentes: Partial<Record<keyof RelacionesDocumento, FuenteRelacionada>> = {};
  await Promise.all((Object.keys(relaciones) as (keyof RelacionesDocumento)[]).map(async (campo) => {
    const id = relaciones[campo];
    if (!id || campo === 'movimientoId') return;
    const nombreColeccion = COLECCION_FUENTE[campo];
    if (!nombreColeccion) throw new ErrorDocumentoPatrimonial('RELACION_NO_ADMITIDA', `No se permite asociar documentos mediante ${campo}.`);
    const snap = await getDoc(doc(db, nombreColeccion, id));
    if (!snap.exists()) throw new ErrorDocumentoPatrimonial('RELACION_INEXISTENTE', `No se encontró la entidad relacionada (${campo}).`);
    const data = snap.data() as Record<string, unknown>;
    const fuente: FuenteRelacionada = {
      id: snap.id,
      inmuebleId: typeof data.inmuebleId === 'string' ? data.inmuebleId : undefined,
      propietarioId: typeof data.propietarioId === 'string' ? data.propietarioId : undefined,
      contratoId: typeof data.contratoId === 'string' ? data.contratoId : undefined,
      gastoId: typeof data.gastoId === 'string' ? data.gastoId : undefined,
      incidenciaId: typeof data.incidenciaId === 'string' ? data.incidenciaId : undefined,
    };
    if (campo === 'facturaId') {
      // Las facturas emitidas no se modifican desde este flujo fiscal. Se
      // relacionan sólo si ya declaran el inmueble o un gasto de ese inmueble.
      if (fuente.inmuebleId !== inmuebleId && typeof data.gastoId === 'string') {
        const gastoSnap = await getDoc(doc(db, 'gastos', data.gastoId));
        if (gastoSnap.exists() && gastoSnap.data().inmuebleId === inmuebleId) fuente.inmuebleId = inmuebleId;
      }
    }
    fuentes[campo] = fuente;
  }));
  validarRelacionesDocumento(inmueble, propietarioId, relaciones, fuentes);
  return { propietarioId, fuentes };
}

export function subscribeDocumentosPatrimoniales(
  inmuebleId: string,
  callback: (documentos: DocumentoPatrimonial[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const col = collection(db, 'inmuebles', inmuebleId, SUBCOLECCION);
  return onSnapshot(query(col, where('estado', '!=', 'ELIMINADO')), (snapshot) => {
    const documentos = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() } as DocumentoPatrimonial));
    documentos.sort((a, b) => b.fechaIncorporacion.localeCompare(a.fechaIncorporacion) || a.id.localeCompare(b.id));
    callback(documentos);
  }, (error) => onError?.(error));
}

export async function subirDocumentoPatrimonial(input: SubirDocumentoPatrimonialInput): Promise<{ documento: DocumentoPatrimonial; duplicado: boolean }> {
  const actor = actorActual();
  const nombre = input.nombre || (typeof File !== 'undefined' && input.archivo instanceof File ? input.archivo.name : 'documento');
  const mimeType = input.archivo.type || 'application/octet-stream';
  // P3: los bytes se leen UNA vez; la huella y la subida usan exactamente el
  // mismo contenido (Uint8Array: válido en navegador y en Node/emulador).
  const bytes = new Uint8Array(await input.archivo.arrayBuffer());
  const tamanoBytes = bytes.byteLength;
  const sha256 = await sha256DeBytes(bytes);
  const relaciones = input.relaciones || {};
  const { propietarioId } = await cargarContexto(input.inmuebleId, relaciones);
  let version = 1;
  if (input.sustituyeA) {
    const anteriorSnap = await getDoc(refDocumento(input.inmuebleId, input.sustituyeA));
    if (!anteriorSnap.exists()) throw new ErrorDocumentoPatrimonial('SUSTITUCION_INEXISTENTE', 'No se encontró el documento que se quiere sustituir.');
    const anterior = anteriorSnap.data() as DocumentoPatrimonial;
    if (anterior.inmuebleId !== input.inmuebleId || anterior.propietarioId !== propietarioId || anterior.estado !== 'DISPONIBLE') {
      throw new ErrorDocumentoPatrimonial('SUSTITUCION_INVALIDA', 'Sólo puede sustituirse una versión disponible del mismo inmueble y titular.');
    }
    version = anterior.version + 1;
  }
  const id = generarIdDocumentoPatrimonial(input.inmuebleId, sha256, relaciones, input.sustituyeA);
  const documento = crearDocumentoPatrimonial({
    id, inmuebleId: input.inmuebleId, propietarioId, tipo: input.tipo,
    nombre, mimeType, tamanoBytes, sha256,
    fechaDocumental: input.fechaDocumental,
    fechaIncorporacion: new Date().toISOString(),
    actorId: actor.id, actorNombre: input.actorNombre || actor.nombre,
    relaciones, referencia: input.referencia, observaciones: input.observaciones,
    version, sustituyeA: input.sustituyeA,
  });
  const metadataRef = refDocumento(input.inmuebleId, id);
  const metadata = Object.fromEntries(Object.entries(documento).filter(([, value]) => value !== undefined));
  const existente = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(metadataRef);
    if (snapshot.exists()) return { id: snapshot.id, ...snapshot.data() } as DocumentoPatrimonial;
    transaction.set(metadataRef, metadata);
    return undefined;
  });
  let actual = existente || documento;
  if (existente) {
    const mismasRelaciones = Object.entries(relaciones).every(([campo, valor]) => (actual as unknown as Record<string, unknown>)[campo] === valor);
    if (actual.sha256 !== sha256 || actual.inmuebleId !== input.inmuebleId || actual.propietarioId !== propietarioId || !mismasRelaciones) {
      throw new ErrorDocumentoPatrimonial('COLISION_ID', 'El identificador del documento ya existe con metadatos distintos.');
    }
    if (actual.estado === 'DISPONIBLE') return { documento: actual, duplicado: true };
    if (actual.estado === 'ELIMINADO' || actual.estado === 'PENDIENTE_ELIMINACION') {
      throw new ErrorDocumentoPatrimonial('DOCUMENTO_ELIMINADO', 'Este contenido ya está archivado o en eliminación; no se sobrescribirá.');
    }
    if (actual.estado === 'ERROR_STORAGE') {
      validarTransicionDocumento(actual.estado, 'PENDIENTE_STORAGE');
      await updateDoc(metadataRef, { estado: 'PENDIENTE_STORAGE', actualizadoEl: new Date().toISOString() });
      actual = { ...actual, estado: 'PENDIENTE_STORAGE' };
    }
  }

  try {
    const storageRef = ref(storage, actual.storagePath);
    // Recupera una subida que llegó a Storage pero perdió la confirmación en
    // Firestore (p. ej. desconexión tras completar el binario), sin re-subir.
    if (actual.estado === 'PENDIENTE_STORAGE') {
      try {
        const previa = await getMetadata(storageRef);
        if (previa.customMetadata?.sha256 !== actual.sha256 || previa.size !== actual.tamanoBytes || previa.contentType !== actual.mimeType) {
          throw new ErrorDocumentoPatrimonial('COLISION_STORAGE', 'La ruta de Storage ya contiene otro archivo; no se sobrescribirá.');
        }
        await updateDoc(metadataRef, { estado: 'DISPONIBLE', actualizadoEl: new Date().toISOString() });
        actual = { ...actual, estado: 'DISPONIBLE', actualizadoEl: new Date().toISOString() };
        await adjuntarAuditoria({ id: actor.id, email: actor.email, nombre: input.actorNombre || actor.nombre }, 'EXPEDIENTE_DOCUMENTO_INCORPORADO', actual, 'EXITO', `Documento patrimonial recuperado tras confirmación interrumpida: ${actual.nombre}`);
        return { documento: actual, duplicado: true };
      } catch (error) {
        // P3: con las reglas reales el `get` de un objeto PENDIENTE_STORAGE se
        // deniega (`storage/unauthorized`): no es verificable desde el cliente,
        // así que se re-sube el MISMO contenido (la regla `create` ata tamaño,
        // MIME y huella a los metadatos; sobrescribir con idéntico contenido es
        // idempotente). Cualquier otro error se propaga.
        const code = (error as { code?: string })?.code;
        if (code !== 'storage/object-not-found' && code !== 'storage/unauthorized') throw error;
      }
    }
    await uploadBytes(storageRef, bytes, {
      contentType: actual.mimeType,
      customMetadata: { documentoId: actual.id, inmuebleId: actual.inmuebleId, sha256: actual.sha256 },
    });
    validarTransicionDocumento(actual.estado, 'DISPONIBLE');
    const actualizadoEl = new Date().toISOString();
    await updateDoc(metadataRef, { estado: 'DISPONIBLE', actualizadoEl });
    actual = { ...actual, estado: 'DISPONIBLE', actualizadoEl };
    await adjuntarAuditoria({ id: actor.id, email: actor.email, nombre: input.actorNombre || actor.nombre },
      actual.sustituyeA ? 'EXPEDIENTE_DOCUMENTO_SUSTITUIDO' : 'EXPEDIENTE_DOCUMENTO_INCORPORADO', actual, 'EXITO',
      actual.sustituyeA ? `Documento patrimonial v${actual.version} sustituye explícitamente a ${actual.sustituyeA}: ${actual.nombre}` : `Documento patrimonial incorporado: ${actual.nombre}`);
    return { documento: actual, duplicado: false };
  } catch (error) {
    await adjuntarAuditoria({ id: actor.id, email: actor.email, nombre: input.actorNombre || actor.nombre }, 'EXPEDIENTE_INCIDENCIA', actual, 'ERROR', `Falló la incorporación del documento ${actual.id}; el registro pendiente se conserva para reintento.`);
    throw error;
  }
}

export async function actualizarMetadatosDocumentoPatrimonial(
  inmuebleId: string,
  documentoId: string,
  cambios: Pick<DocumentoPatrimonial, 'tipo' | 'nombre' | 'fechaDocumental' | 'referencia' | 'observaciones'>,
  actorNombre: string
): Promise<void> {
  const actor = actorActual();
  const metadataRef = refDocumento(inmuebleId, documentoId);
  const snap = await getDoc(metadataRef);
  if (!snap.exists()) throw new ErrorDocumentoPatrimonial('DOCUMENTO_INEXISTENTE', 'El documento ya no existe.');
  const actual = { id: snap.id, ...snap.data() } as DocumentoPatrimonial;
  if (actual.estado !== 'DISPONIBLE') throw new ErrorDocumentoPatrimonial('DOCUMENTO_NO_DISPONIBLE', 'Sólo se editan metadatos de documentos disponibles.');
  const actualizadoEl = new Date().toISOString();
  await updateDoc(metadataRef, {
    tipo: cambios.tipo,
    nombre: cambios.nombre.trim().slice(0, 200),
    fechaDocumental: cambios.fechaDocumental || '',
    referencia: cambios.referencia?.trim().slice(0, 160) || '',
    observaciones: cambios.observaciones?.trim().slice(0, 1000) || '',
    actualizadoEl,
  });
  await adjuntarAuditoria({ id: actor.id, email: actor.email, nombre: actorNombre || actor.nombre }, 'EXPEDIENTE_DOCUMENTO_MODIFICADO', { ...actual, ...cambios, actualizadoEl }, 'EXITO', `Metadatos modificados: ${actual.nombre}`);
}

/**
 * P3: registra la pérdida/alteración del objeto (DISPONIBLE → ERROR_STORAGE)
 * para que el expediente no lo siga presentando como disponible. Si el actor
 * no tiene ámbito de escritura, el estado no cambia pero la incidencia se audita.
 */
async function marcarNoDisponible(documento: DocumentoPatrimonial): Promise<boolean> {
  try {
    validarTransicionDocumento(documento.estado, 'ERROR_STORAGE');
    await updateDoc(refDocumento(documento.inmuebleId, documento.id), { estado: 'ERROR_STORAGE', actualizadoEl: new Date().toISOString() });
    return true;
  } catch {
    return false;
  }
}

export async function descargarDocumentoPatrimonial(inmuebleId: string, documentoId: string): Promise<{ blob: Blob; nombre: string; mimeType: string; verificacion: Extract<ResultadoVerificacion, { estado: 'VERIFICADO' }> }> {
  actorActual();
  const snap = await getDoc(refDocumento(inmuebleId, documentoId));
  if (!snap.exists()) throw new ErrorDocumentoPatrimonial('DOCUMENTO_INEXISTENTE', 'El documento no existe o no tienes acceso.');
  const documento = { id: snap.id, ...snap.data() } as DocumentoPatrimonial;
  if (documento.inmuebleId !== inmuebleId || documento.estado !== 'DISPONIBLE') {
    throw new ErrorDocumentoPatrimonial('DOCUMENTO_NO_DISPONIBLE', 'El documento no está disponible.');
  }
  const actor = auth.currentUser!;
  const auditor = { id: actor.uid, email: actor.email || '', nombre: actor.displayName || actor.email || actor.uid };
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await getBytes(ref(storage, documento.storagePath)));
  } catch (error) {
    if ((error as { code?: string })?.code === 'storage/object-not-found') {
      const marcado = await marcarNoDisponible(documento);
      await adjuntarAuditoria(auditor, 'EXPEDIENTE_DOCUMENTO_DESCARGADO', marcado ? { ...documento, estado: 'ERROR_STORAGE' } : documento, 'ERROR', `El objeto de ${documento.id} no existe en Storage; ${marcado ? 'marcado ERROR_STORAGE' : 'sin ámbito para marcarlo'}.`);
      throw new ErrorDocumentoPatrimonial('OBJETO_AUSENTE', 'El archivo no existe en el almacenamiento aunque su registro sí; queda marcado como no disponible.');
    }
    await adjuntarAuditoria(auditor, 'EXPEDIENTE_DOCUMENTO_DESCARGADO', documento, 'ERROR', `Falló la recuperación del documento ${documento.id}`);
    throw error;
  }
  // P3: la huella SHA-256 detecta alteraciones respecto al alta; no es firma
  // digital ni prueba de procedencia externa.
  const verificacion = evaluarIntegridad(documento, { sha256: await sha256DeBytes(bytes), tamanoBytes: bytes.byteLength });
  if (verificacion.estado !== 'VERIFICADO') {
    const marcado = await marcarNoDisponible(documento);
    await adjuntarAuditoria(auditor, 'EXPEDIENTE_DOCUMENTO_DESCARGADO', marcado ? { ...documento, estado: 'ERROR_STORAGE' } : documento, 'ERROR', `La huella recuperada de ${documento.id} no coincide con la registrada.`);
    throw new ErrorDocumentoPatrimonial('INTEGRIDAD_DISCREPANTE', 'El contenido recuperado no coincide con la huella registrada; no se entrega.');
  }
  await adjuntarAuditoria(auditor, 'EXPEDIENTE_DOCUMENTO_DESCARGADO', documento, 'EXITO', `Documento patrimonial recuperado y huella verificada: ${documento.nombre}`);
  return { blob: new Blob([bytes], { type: documento.mimeType }), nombre: documento.nombre, mimeType: documento.mimeType, verificacion };
}

/** P3: verificación explícita de disponibilidad e integridad (no entrega el contenido). */
export async function verificarDocumentoPatrimonial(inmuebleId: string, documentoId: string): Promise<ResultadoVerificacion> {
  try {
    return (await descargarDocumentoPatrimonial(inmuebleId, documentoId)).verificacion;
  } catch (error) {
    const codigo = (error as { codigo?: string; code?: string }).codigo;
    if (codigo === 'OBJETO_AUSENTE') return { estado: 'OBJETO_AUSENTE' };
    if (codigo === 'INTEGRIDAD_DISCREPANTE') return { estado: 'INTEGRIDAD_DISCREPANTE' };
    return { estado: 'NO_VERIFICABLE', motivo: codigo || (error as { code?: string }).code || 'desconocido' };
  }
}

export async function eliminarDocumentoPatrimonial(inmuebleId: string, documentoId: string, actorNombre: string): Promise<void> {
  const actor = actorActual();
  const metadataRef = refDocumento(inmuebleId, documentoId);
  const snap = await getDoc(metadataRef);
  if (!snap.exists()) throw new ErrorDocumentoPatrimonial('DOCUMENTO_INEXISTENTE', 'El documento ya no existe.');
  let documento = { id: snap.id, ...snap.data() } as DocumentoPatrimonial;
  if (documento.estado === 'DISPONIBLE' || documento.estado === 'ERROR_STORAGE' || documento.estado === 'PENDIENTE_STORAGE') {
    validarTransicionDocumento(documento.estado, 'PENDIENTE_ELIMINACION');
    await updateDoc(metadataRef, { estado: 'PENDIENTE_ELIMINACION', actualizadoEl: new Date().toISOString() });
    documento = { ...documento, estado: 'PENDIENTE_ELIMINACION' };
  }
  if (documento.estado !== 'PENDIENTE_ELIMINACION') throw new ErrorDocumentoPatrimonial('ELIMINACION_NO_PERMITIDA', 'El documento ya fue eliminado.');
  // La referencia se conserva como tombstone; si Storage falla, el mismo
  // estado permite reintentar sin perder contexto ni auditoría.
  try {
    await deleteObject(ref(storage, documento.storagePath));
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== 'storage/object-not-found') {
      await adjuntarAuditoria({ id: actor.id, email: actor.email, nombre: actorNombre || actor.nombre }, 'EXPEDIENTE_INCIDENCIA', documento, 'ERROR', `Eliminación física pendiente de reintento: ${documento.id}`);
      throw error;
    }
  }
  const eliminadoEl = new Date().toISOString();
  validarTransicionDocumento('PENDIENTE_ELIMINACION', 'ELIMINADO');
  await updateDoc(metadataRef, { estado: 'ELIMINADO', eliminadoEl, actualizadoEl: eliminadoEl });
  await adjuntarAuditoria({ id: actor.id, email: actor.email, nombre: actorNombre || actor.nombre }, 'EXPEDIENTE_DOCUMENTO_ELIMINADO', { ...documento, estado: 'ELIMINADO', eliminadoEl }, 'EXITO', `Documento eliminado: ${documento.nombre}`);
}

/** Para checks de duplicación en UI; la consulta queda siempre anclada al inmueble. */
export async function buscarDocumentoPorHash(inmuebleId: string, sha256: string): Promise<DocumentoPatrimonial | undefined> {
  actorActual();
  const snap = await getDocs(query(collection(db, 'inmuebles', inmuebleId, SUBCOLECCION), where('sha256', '==', sha256.toLowerCase())));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() } as DocumentoPatrimonial))
    .find((item) => item.estado !== 'ELIMINADO');
}

export function estadoDocumentoVisible(estado: EstadoDocumentoPatrimonial): boolean {
  return estado !== 'ELIMINADO';
}
