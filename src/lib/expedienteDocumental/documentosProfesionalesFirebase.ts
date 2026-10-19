/**
 * P3 — Adaptador Firebase de documentos de profesionales.
 * ---------------------------------------------------------------------------
 * Fábrica con dependencias explícitas (Firestore, Storage, sesión y auditoría):
 * la app la enlaza con sus instancias en `documentosProfesionalesCliente.ts` y
 * las pruebas de emulador con instancias apuntadas a los emuladores locales,
 * sin sustituir el código que se certifica. Este módulo NO importa
 * `src/lib/firebase.ts` (no inicializa la app productiva).
 *
 * Garantías:
 *  · Un fallo de Storage NUNCA produce un éxito: no hay data-URL, Base64 ni
 *    URL de descarga con token de por medio. El metadato queda en
 *    ERROR_STORAGE (o PENDIENTE_STORAGE si ni siquiera eso pudo escribirse) y
 *    la llamada rechaza con `STORAGE_NO_DISPONIBLE`.
 *  · La descarga lee los bytes con la sesión del usuario (reglas de Storage),
 *    recomputa la huella SHA-256 y sólo entrega el contenido si coincide.
 *  · La pérdida o alteración del objeto se registra (DISPONIBLE → ERROR_STORAGE)
 *    cuando quien verifica tiene ámbito de escritura; siempre se audita.
 */
import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { construirAuditoriaExpediente, type AccionDocumental, type PayloadAuditoriaExpediente } from './auditoria';
import { ErrorDocumentoPatrimonial, sha256DeBytes } from './gestor';

export { sha256DeBytes };
import {
  crearDocumentoProfesional,
  evaluarIntegridad,
  generarIdDocumentoProfesional,
  SUBCOLECCION_DOCUMENTOS_PROFESIONALES,
  validarTransicionDocumentoProfesional,
  type DocumentoProfesionalAlmacenado,
  type MotivoErrorStorage,
  type ResultadoVerificacion,
  type TipoDocumentoProfesional,
} from './documentosProfesionales';

export interface SesionDocumental {
  readonly currentUser: { uid: string; email?: string | null; displayName?: string | null } | null;
}

export interface DependenciasDocumentosProfesionales {
  db: Firestore;
  storage: FirebaseStorage;
  auth: SesionDocumental;
  /** Persistencia de auditoría (en la app: `registrarAuditoriaFirestore` → audit_logs). */
  auditar: (payload: PayloadAuditoriaExpediente) => Promise<void>;
  ahora?: () => string;
}

export interface SubirDocumentoProfesionalInput {
  profesionalId: string;
  tipo: TipoDocumentoProfesional;
  archivo: Blob;
  nombre?: string;
  sustituyeA?: string;
  actorNombre?: string;
}

export interface DescargaDocumentoProfesional {
  bytes: Uint8Array;
  nombre: string;
  mimeType: string;
  verificacion: Extract<ResultadoVerificacion, { estado: 'VERIFICADO' }>;
}

function codigoError(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

export function crearAdaptadorDocumentosProfesionales(deps: DependenciasDocumentosProfesionales) {
  const ahora = deps.ahora ?? (() => new Date().toISOString());

  const refMetadata = (profesionalId: string, documentoId: string) =>
    doc(deps.db, 'profesionales', profesionalId, SUBCOLECCION_DOCUMENTOS_PROFESIONALES, documentoId);

  function actor(nombre?: string) {
    const user = deps.auth.currentUser;
    if (!user) throw new ErrorDocumentoPatrimonial('NO_AUTENTICADO', 'Inicia sesión para gestionar documentos.');
    return { id: user.uid, email: user.email || '', nombre: nombre || user.displayName || user.email || user.uid };
  }

  async function auditar(
    quien: { id: string; email: string; nombre: string },
    accion: AccionDocumental,
    documento: DocumentoProfesionalAlmacenado,
    resultado: 'EXITO' | 'ERROR',
    descripcion: string,
    extra: Record<string, unknown> = {}
  ): Promise<void> {
    await deps.auditar(construirAuditoriaExpediente(quien, accion, 'profesional', documento.profesionalId, descripcion, {
      documentoId: documento.id,
      profesionalId: documento.profesionalId,
      storagePath: documento.storagePath,
      estado: documento.estado,
      tipo: documento.tipo,
      sha256: documento.sha256,
      tamanoBytes: documento.tamanoBytes,
      version: documento.version,
      sustituyeA: documento.sustituyeA,
      ...extra,
    }, resultado));
  }

  async function leer(profesionalId: string, documentoId: string): Promise<DocumentoProfesionalAlmacenado> {
    const snap = await getDoc(refMetadata(profesionalId, documentoId));
    if (!snap.exists()) throw new ErrorDocumentoPatrimonial('DOCUMENTO_INEXISTENTE', 'El documento no existe o no tienes acceso.');
    const documento = { ...(snap.data() as DocumentoProfesionalAlmacenado), id: snap.id };
    if (documento.profesionalId !== profesionalId) {
      throw new ErrorDocumentoPatrimonial('REFERENCIA_INCOHERENTE', 'El documento no pertenece a este profesional.');
    }
    return documento;
  }

  async function marcarError(
    documento: DocumentoProfesionalAlmacenado,
    motivo: MotivoErrorStorage
  ): Promise<DocumentoProfesionalAlmacenado | null> {
    try {
      validarTransicionDocumentoProfesional(documento.estado, 'ERROR_STORAGE');
      const actualizadoEl = ahora();
      await updateDoc(refMetadata(documento.profesionalId, documento.id), { estado: 'ERROR_STORAGE', motivoError: motivo, actualizadoEl });
      return { ...documento, estado: 'ERROR_STORAGE', motivoError: motivo, actualizadoEl };
    } catch {
      // Sin ámbito de escritura (p. ej. lector) o sin conexión: el estado no se
      // puede registrar, pero la operación sigue fallando y queda auditada.
      return null;
    }
  }

  function subscribe(
    profesionalId: string,
    callback: (documentos: DocumentoProfesionalAlmacenado[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    const col = collection(deps.db, 'profesionales', profesionalId, SUBCOLECCION_DOCUMENTOS_PROFESIONALES);
    return onSnapshot(query(col, where('estado', '!=', 'ELIMINADO')), (snapshot) => {
      const documentos = snapshot.docs.map((s) => ({ ...(s.data() as DocumentoProfesionalAlmacenado), id: s.id }));
      documentos.sort((a, b) => b.fechaIncorporacion.localeCompare(a.fechaIncorporacion) || a.id.localeCompare(b.id));
      callback(documentos);
    }, (error) => onError?.(error));
  }

  async function subir(input: SubirDocumentoProfesionalInput): Promise<{ documento: DocumentoProfesionalAlmacenado; duplicado: boolean }> {
    const quien = actor(input.actorNombre);
    const bytes = new Uint8Array(await input.archivo.arrayBuffer());
    const sha256 = await sha256DeBytes(bytes);
    const nombre = input.nombre?.trim()
      || (typeof File !== 'undefined' && input.archivo instanceof File ? input.archivo.name : 'documento');

    let version = 1;
    if (input.sustituyeA) {
      const anterior = await leer(input.profesionalId, input.sustituyeA);
      if (anterior.estado !== 'DISPONIBLE') {
        throw new ErrorDocumentoPatrimonial('SUSTITUCION_INVALIDA', 'Sólo puede sustituirse una versión disponible del mismo profesional.');
      }
      version = anterior.version + 1;
    }
    const id = generarIdDocumentoProfesional(input.profesionalId, sha256, input.tipo, input.sustituyeA);
    const nuevo = crearDocumentoProfesional({
      id, profesionalId: input.profesionalId, tipo: input.tipo, nombre,
      mimeType: (input.archivo.type || '').toLowerCase(), tamanoBytes: bytes.byteLength, sha256,
      fechaIncorporacion: ahora(), actorId: quien.id, actorNombre: quien.nombre,
      version, sustituyeA: input.sustituyeA,
    });

    const metadataRef = refMetadata(input.profesionalId, id);
    const existente = await runTransaction(deps.db, async (tx) => {
      const snap = await tx.get(metadataRef);
      if (snap.exists()) return { ...(snap.data() as DocumentoProfesionalAlmacenado), id: snap.id };
      tx.set(metadataRef, nuevo);
      return undefined;
    });

    let actual: DocumentoProfesionalAlmacenado = existente || nuevo;
    if (existente) {
      if (existente.sha256 !== sha256 || existente.profesionalId !== input.profesionalId || existente.tipo !== input.tipo) {
        throw new ErrorDocumentoPatrimonial('COLISION_ID', 'El identificador del documento ya existe con metadatos distintos.');
      }
      if (existente.estado === 'DISPONIBLE') return { documento: existente, duplicado: true };
      if (existente.estado === 'PENDIENTE_ELIMINACION' || existente.estado === 'ELIMINADO') {
        throw new ErrorDocumentoPatrimonial('DOCUMENTO_ELIMINADO', 'Este contenido está archivado o en eliminación; no se sobrescribirá.');
      }
      if (existente.estado === 'ERROR_STORAGE') {
        validarTransicionDocumentoProfesional('ERROR_STORAGE', 'PENDIENTE_STORAGE');
        const actualizadoEl = ahora();
        await updateDoc(metadataRef, { estado: 'PENDIENTE_STORAGE', actualizadoEl, motivoError: deleteField() });
        const { motivoError: _motivoAnterior, ...sinMotivo } = existente;
        actual = { ...sinMotivo, estado: 'PENDIENTE_STORAGE', actualizadoEl };
      }
    }

    // Subida (o re-subida idempotente del MISMO contenido: la regla de Storage
    // ata tamaño, MIME y huella a los metadatos PENDIENTE_STORAGE).
    try {
      await uploadBytes(ref(deps.storage, actual.storagePath), bytes, {
        contentType: actual.mimeType,
        customMetadata: { documentoId: actual.id, profesionalId: actual.profesionalId, sha256: actual.sha256 },
      });
    } catch (error) {
      const marcado = await marcarError(actual, 'SUBIDA_FALLIDA');
      await auditar(quien, 'EXPEDIENTE_INCIDENCIA', marcado || actual, 'ERROR',
        `Falló el almacenamiento del documento profesional ${actual.id}; NO queda almacenado.`,
        { codigoStorage: codigoError(error) || 'desconocido' });
      throw new ErrorDocumentoPatrimonial(
        'STORAGE_NO_DISPONIBLE',
        'No se pudo guardar el archivo en el almacenamiento. El documento NO ha quedado almacenado; vuelve a intentarlo con el mismo archivo.'
      );
    }

    validarTransicionDocumentoProfesional(actual.estado, 'DISPONIBLE');
    const actualizadoEl = ahora();
    try {
      await updateDoc(metadataRef, { estado: 'DISPONIBLE', actualizadoEl });
    } catch (error) {
      await auditar(quien, 'EXPEDIENTE_INCIDENCIA', actual, 'ERROR',
        `El archivo ${actual.id} se subió pero su confirmación no pudo registrarse; queda PENDIENTE_STORAGE.`,
        { codigoFirestore: codigoError(error) || 'desconocido' });
      throw new ErrorDocumentoPatrimonial('CONFIRMACION_PENDIENTE', 'El archivo no pudo confirmarse; queda pendiente. Vuelve a intentarlo con el mismo archivo.');
    }
    actual = { ...actual, estado: 'DISPONIBLE', actualizadoEl };
    await auditar(quien, input.sustituyeA ? 'EXPEDIENTE_DOCUMENTO_SUSTITUIDO' : 'EXPEDIENTE_DOCUMENTO_INCORPORADO', actual, 'EXITO',
      input.sustituyeA
        ? `Documento profesional ${actual.id} (v${actual.version}) sustituye explícitamente a ${input.sustituyeA}.`
        : `Documento profesional incorporado: ${actual.nombre}`);
    return { documento: actual, duplicado: Boolean(existente) };
  }

  /** Recupera los bytes con la sesión actual y comprueba la huella antes de entregarlos. */
  async function descargar(profesionalId: string, documentoId: string, actorNombre?: string): Promise<DescargaDocumentoProfesional> {
    const quien = actor(actorNombre);
    const documento = await leer(profesionalId, documentoId);
    if (documento.estado !== 'DISPONIBLE') {
      throw new ErrorDocumentoPatrimonial('DOCUMENTO_NO_DISPONIBLE', 'El documento no está disponible para su descarga.');
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await getBytes(ref(deps.storage, documento.storagePath)));
    } catch (error) {
      if (codigoError(error) === 'storage/object-not-found') {
        const marcado = await marcarError(documento, 'OBJETO_AUSENTE');
        await auditar(quien, 'EXPEDIENTE_DOCUMENTO_DESCARGADO', marcado || documento, 'ERROR', `El objeto de ${documento.id} no existe en Storage.`);
        throw new ErrorDocumentoPatrimonial('OBJETO_AUSENTE', 'El archivo no existe en el almacenamiento aunque su registro sí; queda marcado como no disponible.');
      }
      await auditar(quien, 'EXPEDIENTE_DOCUMENTO_DESCARGADO', documento, 'ERROR', `Falló la recuperación de ${documento.id}.`, { codigoStorage: codigoError(error) || 'desconocido' });
      throw error;
    }
    const verificacion = evaluarIntegridad(documento, { sha256: await sha256DeBytes(bytes), tamanoBytes: bytes.byteLength });
    if (verificacion.estado !== 'VERIFICADO') {
      const marcado = await marcarError(documento, 'INTEGRIDAD_DISCREPANTE');
      await auditar(quien, 'EXPEDIENTE_DOCUMENTO_DESCARGADO', marcado || documento, 'ERROR', `La huella de ${documento.id} no coincide con la registrada.`, { verificacion });
      throw new ErrorDocumentoPatrimonial('INTEGRIDAD_DISCREPANTE', 'El contenido recuperado no coincide con la huella registrada; no se entrega.');
    }
    await auditar(quien, 'EXPEDIENTE_DOCUMENTO_DESCARGADO', documento, 'EXITO', `Documento profesional recuperado y huella verificada: ${documento.nombre}`);
    return { bytes, nombre: documento.nombre, mimeType: documento.mimeType, verificacion };
  }

  /** Verificación explícita de disponibilidad e integridad (sin entregar el contenido). */
  async function verificar(profesionalId: string, documentoId: string, actorNombre?: string): Promise<ResultadoVerificacion> {
    try {
      const resultado = await descargar(profesionalId, documentoId, actorNombre);
      return resultado.verificacion;
    } catch (error) {
      const codigo = (error as { codigo?: string }).codigo;
      if (codigo === 'OBJETO_AUSENTE') return { estado: 'OBJETO_AUSENTE' };
      if (codigo === 'INTEGRIDAD_DISCREPANTE') return { estado: 'INTEGRIDAD_DISCREPANTE' };
      return { estado: 'NO_VERIFICABLE', motivo: codigo || codigoError(error) || 'desconocido' };
    }
  }

  async function eliminar(profesionalId: string, documentoId: string, actorNombre?: string): Promise<void> {
    const quien = actor(actorNombre);
    let documento = await leer(profesionalId, documentoId);
    const metadataRef = refMetadata(profesionalId, documentoId);
    if (documento.estado === 'DISPONIBLE' || documento.estado === 'ERROR_STORAGE' || documento.estado === 'PENDIENTE_STORAGE') {
      validarTransicionDocumentoProfesional(documento.estado, 'PENDIENTE_ELIMINACION');
      await updateDoc(metadataRef, { estado: 'PENDIENTE_ELIMINACION', actualizadoEl: ahora() });
      documento = { ...documento, estado: 'PENDIENTE_ELIMINACION' };
    }
    if (documento.estado !== 'PENDIENTE_ELIMINACION') {
      throw new ErrorDocumentoPatrimonial('ELIMINACION_NO_PERMITIDA', 'El documento ya fue eliminado.');
    }
    try {
      await deleteObject(ref(deps.storage, documento.storagePath));
    } catch (error) {
      if (codigoError(error) !== 'storage/object-not-found') {
        await auditar(quien, 'EXPEDIENTE_INCIDENCIA', documento, 'ERROR', `Eliminación física pendiente de reintento: ${documento.id}`);
        throw error;
      }
    }
    const eliminadoEl = ahora();
    validarTransicionDocumentoProfesional('PENDIENTE_ELIMINACION', 'ELIMINADO');
    await updateDoc(metadataRef, { estado: 'ELIMINADO', eliminadoEl, actualizadoEl: eliminadoEl });
    await auditar(quien, 'EXPEDIENTE_DOCUMENTO_ELIMINADO', { ...documento, estado: 'ELIMINADO', eliminadoEl }, 'EXITO', `Documento profesional eliminado: ${documento.nombre}`);
  }

  return { subscribe, subir, descargar, verificar, eliminar, leer };
}

export type AdaptadorDocumentosProfesionales = ReturnType<typeof crearAdaptadorDocumentosProfesionales>;
