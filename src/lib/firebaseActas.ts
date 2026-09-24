import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
  type QuerySnapshot,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, sanitizeObjectForFirestore, type DataAccessScope } from './firebase';
import type {
  Acta,
  EvidenciaActa,
  IncidenciaActa,
  OtpActa,
  FirmaActa,
} from '../types/actas';

// Collections
const ACTAS_COL = collection(db, 'actas');
const EVIDENCIAS_ACTA_COL = collection(db, 'actas_evidencias');
const INCIDENCIAS_ACTA_COL = collection(db, 'actas_incidencias');
const OTP_ACTA_COL = collection(db, 'actas_otp');

function subscribeColeccionPropietarioActas<T extends { id: string; ownerId?: string }>(
  col: ReturnType<typeof collection>,
  callback: (items: T[]) => void,
  scope: DataAccessScope | undefined,
  etiqueta: string
): Unsubscribe {
  const mapear = (snap: QuerySnapshot) => {
    const items: T[] = [];
    snap.forEach((ds) => items.push({ id: ds.id, ...ds.data() } as unknown as T));
    callback(items);
  };
  const onError = (err: unknown) => console.error(`Firestore ${etiqueta} snapshot error:`, err);

  if (scope?.tipoPerfil === 'PROFESIONAL') {
    callback([]);
    return () => {};
  }
  if (!scope || scope.tipoPerfil !== 'PROPIETARIO') {
    return onSnapshot(col, mapear, onError);
  }
  const pid = scope.propietarioId;
  if (!pid) {
    callback([]);
    return () => {};
  }
  return onSnapshot(query(col, where('ownerId', '==', pid)), mapear, onError);
}

// ---- ACTAS ----
export function subscribeActas(
  callback: (items: Acta[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietarioActas<Acta>(ACTAS_COL, callback, scope, 'actas');
}

export function subscribeActasPorInmueble(
  propertyId: string,
  callback: (items: Acta[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  const baseCallback = (items: Acta[]) => {
    callback(items.filter(a => a.propertyId === propertyId));
  };
  return subscribeActas(baseCallback, scope);
}

export function subscribeActasPorContrato(
  contractId: string,
  callback: (items: Acta[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  const baseCallback = (items: Acta[]) => {
    callback(items.filter(a => a.contractId === contractId));
  };
  return subscribeActas(baseCallback, scope);
}

export async function saveActaFirestore(acta: Acta): Promise<void> {
  try {
    const clean = sanitizeObjectForFirestore(acta);
    await setDoc(doc(db, 'actas', acta.id), clean, { merge: true });
  } catch (err) {
    console.error('Error saving acta:', err);
    throw err;
  }
}

export async function getActaFirestore(actaId: string): Promise<Acta | null> {
  const snap = await getDoc(doc(db, 'actas', actaId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Acta;
}

export async function deleteActaFirestore(actaId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'actas', actaId));
  } catch (err) {
    console.error('Error deleting acta:', err);
    throw err;
  }
}

// ---- EVIDENCIAS ----
export function subscribeEvidenciasActa(
  actaId: string,
  callback: (items: EvidenciaActa[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  const mapear = (snap: QuerySnapshot) => {
    const items: EvidenciaActa[] = [];
    snap.forEach((ds) => items.push({ id: ds.id, ...ds.data() } as EvidenciaActa));
    items.sort((a, b) => a.orden - b.orden);
    callback(items);
  };
  const onError = (err: unknown) => console.error('Firestore actas_evidencias snapshot error:', err);

  // Profesionales sin acceso a datos económicos pero evidencias de actas podrían ser internas; se permite si tienen inmuebleIds?
  // Para simplicidad, mismo patrón ownerId
  if (scope?.tipoPerfil === 'PROFESIONAL') {
    callback([]);
    return () => {};
  }

  if (!scope || scope.tipoPerfil !== 'PROPIETARIO') {
    return onSnapshot(query(EVIDENCIAS_ACTA_COL, where('actaId', '==', actaId)), mapear, onError);
  }
  const pid = scope.propietarioId;
  if (!pid) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    query(EVIDENCIAS_ACTA_COL, where('actaId', '==', actaId), where('ownerId', '==', pid)),
    mapear,
    onError
  );
}

export function subscribeEvidenciasPorPropietario(
  callback: (items: EvidenciaActa[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietarioActas<EvidenciaActa>(EVIDENCIAS_ACTA_COL, callback, scope, 'actas_evidencias');
}

export async function saveEvidenciaActaFirestore(ev: EvidenciaActa): Promise<void> {
  try {
    const clean = sanitizeObjectForFirestore(ev);
    await setDoc(doc(db, 'actas_evidencias', ev.id), clean, { merge: true });
  } catch (err) {
    console.error('Error saving evidencia acta:', err);
    throw err;
  }
}

export async function deleteEvidenciaActaFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'actas_evidencias', id));
  } catch (err) {
    console.error('Error deleting evidencia acta:', err);
    throw err;
  }
}

// ---- INCIDENCIAS ACTA ----
export function subscribeIncidenciasActa(
  actaId: string,
  callback: (items: IncidenciaActa[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  const mapear = (snap: QuerySnapshot) => {
    const items: IncidenciaActa[] = [];
    snap.forEach((ds) => items.push({ id: ds.id, ...ds.data() } as IncidenciaActa));
    items.sort((a, b) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime());
    callback(items);
  };
  const onError = (err: unknown) => console.error('Firestore actas_incidencias snapshot error:', err);

  if (scope?.tipoPerfil === 'PROFESIONAL') {
    callback([]);
    return () => {};
  }

  if (!scope || scope.tipoPerfil !== 'PROPIETARIO') {
    return onSnapshot(query(INCIDENCIAS_ACTA_COL, where('actaId', '==', actaId)), mapear, onError);
  }
  const pid = scope.propietarioId;
  if (!pid) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    query(INCIDENCIAS_ACTA_COL, where('actaId', '==', actaId), where('ownerId', '==', pid)),
    mapear,
    onError
  );
}

export function subscribeTodasIncidenciasActa(
  callback: (items: IncidenciaActa[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietarioActas<IncidenciaActa>(INCIDENCIAS_ACTA_COL, callback, scope, 'actas_incidencias');
}

export async function saveIncidenciaActaFirestore(inc: IncidenciaActa): Promise<void> {
  try {
    const clean = sanitizeObjectForFirestore(inc);
    await setDoc(doc(db, 'actas_incidencias', inc.id), clean, { merge: true });
  } catch (err) {
    console.error('Error saving incidencia acta:', err);
    throw err;
  }
}

export async function deleteIncidenciaActaFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'actas_incidencias', id));
  } catch (err) {
    console.error('Error deleting incidencia acta:', err);
    throw err;
  }
}

// ---- OTP ----
export function subscribeOtpPorActa(
  actaId: string,
  callback: (items: OtpActa[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  const mapear = (snap: QuerySnapshot) => {
    const items: OtpActa[] = [];
    snap.forEach((ds) => items.push({ id: ds.id, ...ds.data() } as OtpActa));
    callback(items);
  };
  const onError = (err: unknown) => console.error('Firestore actas_otp snapshot error:', err);

  if (scope?.tipoPerfil === 'PROFESIONAL') {
    callback([]);
    return () => {};
  }

  if (!scope || scope.tipoPerfil !== 'PROPIETARIO') {
    return onSnapshot(query(OTP_ACTA_COL, where('actaId', '==', actaId)), mapear, onError);
  }
  const pid = scope.propietarioId;
  if (!pid) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    query(OTP_ACTA_COL, where('actaId', '==', actaId), where('ownerId', '==', pid)),
    mapear,
    onError
  );
}

export async function saveOtpActaFirestore(otp: OtpActa): Promise<void> {
  try {
    // Limpieza obligatoria: un OTP usado/expirado/bloqueado no conserva el código
    // temporal en texto plano (merge:true no borra campos omitidos ⇒ null explícita).
    const payload: OtpActa & { codigoPlainTemporal?: string | null } =
      otp.usado || otp.estado !== 'ACTIVO'
        ? { ...otp, codigoPlainTemporal: null }
        : otp;
    const clean = sanitizeObjectForFirestore(payload);
    await setDoc(doc(db, 'actas_otp', otp.id), clean, { merge: true });
  } catch (err) {
    console.error('Error saving OTP acta:', err);
    throw err;
  }
}

export async function getOtpActaFirestore(otpId: string): Promise<OtpActa | null> {
  const snap = await getDoc(doc(db, 'actas_otp', otpId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as OtpActa;
}

// ---- STORAGE EVIDENCIAS ----
export async function uploadEvidenciaActaStorage(
  ownerId: string,
  actaId: string,
  file: File | Blob,
  fileName: string
): Promise<{ url: string; storagePath: string }> {
  const ownerSeg = (ownerId || 'sin_asignar').replace(/[^a-zA-Z0-9._-]/g, '_');
  const actaSeg = (actaId || 'acta').replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeName = (fileName || 'evidencia.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const rand = Math.random().toString(36).substring(2, 6);
  const storagePath = `actas_fotos/${ownerSeg}/${actaSeg}/${Date.now()}_${rand}_${safeName}`;

  const fileRef = ref(storage, storagePath);
  const mime = (file as File).type || (safeName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

  const uploadWork = (async () => {
    await uploadBytes(fileRef, file, { contentType: mime });
    return getDownloadURL(fileRef);
  })();

  const timeoutGuard = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000));
  const url = await Promise.race([uploadWork, timeoutGuard]);
  if (!url || typeof url !== 'string') {
    throw new Error('La subida de la evidencia ha tardado demasiado. Revisa la conexión e inténtalo de nuevo.');
  }
  return { url, storagePath };
}

export async function deleteEvidenciaActaStorage(storagePath?: string): Promise<void> {
  if (!storagePath) return;
  if (
    storagePath.startsWith('local_') ||
    storagePath.startsWith('server_') ||
    storagePath.startsWith('data:') ||
    storagePath.startsWith('http')
  ) {
    return;
  }
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (err) {
    console.warn('No se pudo eliminar evidencia de Storage:', err);
  }
}

// ---- PDF STORAGE ----
export async function uploadPdfActaStorage(
  ownerId: string,
  actaId: string,
  pdfBlob: Blob,
  fileName: string
): Promise<{ url: string; storagePath: string }> {
  const ownerSeg = (ownerId || 'sin_asignar').replace(/[^a-zA-Z0-9._-]/g, '_');
  const actaSeg = (actaId || 'acta').replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeName = (fileName || 'acta.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `actas_pdfs/${ownerSeg}/${actaSeg}/${safeName}`;

  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, pdfBlob, { contentType: 'application/pdf' });
  const url = await getDownloadURL(fileRef);
  return { url, storagePath };
}
