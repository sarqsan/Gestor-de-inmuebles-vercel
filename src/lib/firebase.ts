import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  writeBatch,
  runTransaction,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  Candidato,
  Inmueble,
  Propietario,
  SolicitudAlquiler,
  InvitacionVisita,
  VisitSlot,
  SolicitudDocumentacion,
  ContratoFormalizacion,
  Gasto,
  ConfiguracionAseguradora,
  SolicitudSeguroImpago,
  GmailIntegracionConfig,
  UsuarioApp,
  Profesional,
  EnlaceRegistro,
  Especialidad,
  AuditLog,
  ModulosConfig,
  DEFAULT_MODULOS_CONFIG,
  PERMISOS_SISTEMA,
} from '../types';
import {
  INITIAL_CANDIDATOS,
  INITIAL_INMUEBLES,
  INITIAL_PROPIETARIOS,
  INITIAL_SOLICITUDES,
  INITIAL_INVITACIONES,
  INITIAL_VISIT_SLOTS,
  INITIAL_SOLICITUDES_DOC,
  INITIAL_CONTRATOS,
  INITIAL_ASEGURADORAS,
  INITIAL_GMAIL_CONFIG,
} from '../data/mockData';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

const firestoreDbId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const db = firestoreDbId
  ? getFirestore(app, firestoreDbId)
  : getFirestore(app);

export const storage = getStorage(app);
export const auth = getAuth(app);

// Firestore Collections
const PROPIETARIOS_COL = collection(db, 'propietarios');
const INMUEBLES_COL = collection(db, 'inmuebles');
const CANDIDATOS_COL = collection(db, 'candidatos');
const SOLICITUDES_COL = collection(db, 'solicitudes');
const INVITACIONES_COL = collection(db, 'invitaciones');
const SLOTS_VISITA_COL = collection(db, 'slots_visita');
const SOLICITUDES_DOC_COL = collection(db, 'solicitudes_documentacion');
const CONTRATOS_COL = collection(db, 'contratos_formalizacion');
const GASTOS_COL = collection(db, 'gastos');
const ASEGURADORAS_COL = collection(db, 'configuracion_aseguradoras');
const SOLICITUDES_SEGURO_COL = collection(db, 'solicitudes_seguro_impago');

// Colecciones estructurales de usuarios, perfiles, permisos y profesionales
export const USUARIOS_COL = collection(db, 'usuarios');
export const PROFESIONALES_COL = collection(db, 'profesionales');
export const ENLACES_REGISTRO_COL = collection(db, 'enlaces_registro');
export const ESPECIALIDADES_COL = collection(db, 'especialidades');
export const AUDIT_LOGS_COL = collection(db, 'audit_logs');
export const MODULOS_CONFIG_REF = doc(db, 'system', 'modulos_config');

/**
 * Seeds initial mock data into Firestore if database has never been initialized,
 * or updates existing mock candidates with test questionnaires if missing.
 */
export async function seedInitialDataIfEmpty() {
  // Only attempt seeding if an authenticated user is present
  if (!auth.currentUser) {
    return;
  }
  try {
    const metaRef = doc(db, 'system', 'metadata');
    const metaSnap = await getDocs(collection(db, 'system'));
    
    if (metaSnap.empty) {
      await setDoc(metaRef, { initialized: true, createdAt: new Date().toISOString() });
    }

    // Seed default insurers if empty
    const aseguradorasSnap = await getDocs(ASEGURADORAS_COL);
    if (aseguradorasSnap.empty) {
      const aBatch = writeBatch(db);
      INITIAL_ASEGURADORAS.forEach((aseg) => {
        const cleanAseg = sanitizeObjectForFirestore(aseg);
        aBatch.set(doc(db, 'configuracion_aseguradoras', aseg.id), cleanAseg);
      });
      await aBatch.commit();
    }

    // Seed auth, roles, especialidades, modulos and initial demo users if empty
    await seedAuthAndRolesIfEmpty();
  } catch (error) {
    console.warn('Notice during initial Firestore check:', error);
  }
}

/**
 * Ámbito de acceso a datos (FASE 1.4).
 * - ADMINISTRADOR / sin ámbito: colección completa.
 * - PROPIETARIO: únicamente sus propios recursos.
 * - PROFESIONAL: sin acceso a datos económicos/fiscales.
 */
export interface DataAccessScope {
  tipoPerfil?: string;
  propietarioId?: string;
  inmuebleIds?: string[];
}

/**
 * Real-time listener for Propietarios.
 * Con ámbito de propietario escucha únicamente SU ficha (datos fiscales/cuentas);
 * los profesionales no reciben nada y el administrador, la colección completa.
 */
export function subscribePropietarios(
  callback: (propietarios: Propietario[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  if (scope?.tipoPerfil === 'PROFESIONAL') {
    callback([]);
    return () => {};
  }

  if (scope?.tipoPerfil === 'PROPIETARIO') {
    const pid = scope.propietarioId;
    if (!pid) {
      callback([]);
      return () => {};
    }
    return onSnapshot(
      doc(db, 'propietarios', pid),
      (docSnap) => {
        callback(docSnap.exists() ? [{ id: docSnap.id, ...docSnap.data() } as Propietario] : []);
      },
      (err) => {
        console.error('Firestore propietario (scoped) snapshot error:', err);
      }
    );
  }

  return onSnapshot(
    PROPIETARIOS_COL,
    (snapshot) => {
      const items: Propietario[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Propietario);
      });
      callback(items);
    },
    (err) => {
      console.error('Firestore propietarios snapshot error:', err);
    }
  );
}

/**
 * Save / Update Propietario in Firestore
 */
export async function savePropietarioFirestore(propietario: Propietario) {
  try {
    const cleanProp = sanitizeObjectForFirestore(propietario);
    await setDoc(doc(db, 'propietarios', propietario.id), cleanProp, { merge: true });
  } catch (err) {
    console.error('Error saving propietario to Firestore:', err);
  }
}

/**
 * Delete Propietario from Firestore
 */
export async function deletePropietarioFirestore(propietarioId: string) {
  try {
    await deleteDoc(doc(db, 'propietarios', propietarioId));
  } catch (err) {
    console.error('Error deleting propietario from Firestore:', err);
  }
}

/**
 * Real-time listener for Inmuebles
 */
export function subscribeInmuebles(callback: (inmuebles: Inmueble[]) => void) {
  return onSnapshot(
    INMUEBLES_COL,
    (snapshot) => {
      const items: Inmueble[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Inmueble);
      });
      callback(items);
    },
    (err) => {
      console.error('Firestore inmuebles snapshot error:', err);
    }
  );
}

/**
 * Real-time listener for Candidatos
 */
export function subscribeCandidatos(callback: (candidatos: Candidato[]) => void) {
  return onSnapshot(
    CANDIDATOS_COL,
    (snapshot) => {
      const items: Candidato[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Candidato;
        const initialMatch = INITIAL_CANDIDATOS.find((ic) => ic.id === docSnap.id);

        if (!data.cuestionarioToken) {
          data.cuestionarioToken = initialMatch?.cuestionarioToken || `q-${docSnap.id}`;
        }

        // Merge initial mock questionnaire if completely missing on Firestore doc
        if (initialMatch?.cuestionarioIncidencias && !data.cuestionarioIncidencias) {
          data.cuestionarioIncidencias = initialMatch.cuestionarioIncidencias;
        }

        items.push({ id: docSnap.id, ...data });
      });
      callback(items);
    },
    (err) => {
      console.error('Firestore candidatos snapshot error:', err);
    }
  );
}

/**
 * Real-time listener for Solicitudes
 */
export function subscribeSolicitudes(callback: (solicitudes: SolicitudAlquiler[]) => void) {
  return onSnapshot(
    SOLICITUDES_COL,
    (snapshot) => {
      const items: SolicitudAlquiler[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as SolicitudAlquiler);
      });
      callback(items);
    },
    (err) => {
      console.error('Firestore solicitudes snapshot error:', err);
    }
  );
}

/**
 * Cleans an Inmueble object before saving to Firestore to guarantee
 * that document size remains strictly under Firestore's 1MB limit.
 */
export function sanitizeInmuebleForFirestore(inmueble: Inmueble): Inmueble {
  const clean: Inmueble = JSON.parse(JSON.stringify(inmueble));

  // Measure JSON payload size
  let jsonStr = JSON.stringify(clean);
  if (jsonStr.length > 850000) {
    if (clean.images && Array.isArray(clean.images)) {
      // Limit images to fit within Firestore limit
      clean.images = clean.images.slice(0, 10);
      jsonStr = JSON.stringify(clean);
      if (jsonStr.length > 850000) {
        clean.images = clean.images.slice(0, 6);
      }
    }
  }

  return clean;
}

/**
 * Save / Update Inmueble in Firestore
 */
export async function saveInmuebleFirestore(inmueble: Inmueble) {
  try {
    const cleanInmueble = sanitizeInmuebleForFirestore(inmueble);
    await setDoc(doc(db, 'inmuebles', cleanInmueble.id), cleanInmueble, { merge: true });
  } catch (err) {
    console.error('Error saving inmueble to Firestore:', err);
  }
}

/**
 * Delete Inmueble from Firestore
 */
export async function deleteInmuebleFirestore(inmuebleId: string) {
  try {
    await deleteDoc(doc(db, 'inmuebles', inmuebleId));
  } catch (err) {
    console.error('Error deleting inmueble from Firestore:', err);
  }
}

import { compressImageForUpload } from '../utils/fileCompressor';

/**
 * Recursively cleans any object or array to ensure it contains NO `undefined` values,
 * which Firestore strictly rejects.
 * - For objects: keys with `undefined` values are omitted.
 * - For arrays: items are recursively sanitized, and `undefined` entries are filtered out.
 * - Dates are converted to ISO strings.
 */
export function deepCleanForFirestore(val: any): any {
  if (val === undefined) {
    return null;
  }
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== undefined)
      .map((item) => deepCleanForFirestore(item));
  }
  const cleaned: Record<string, any> = {};
  Object.keys(val).forEach((k) => {
    const v = val[k];
    if (v !== undefined) {
      cleaned[k] = deepCleanForFirestore(v);
    }
  });
  return cleaned;
}

/**
 * Sanitizes an object for Firestore setDoc/updateDoc calls.
 * Removes all undefined properties recursively from objects and arrays.
 */
export function sanitizeObjectForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  return deepCleanForFirestore(obj);
}

/**
 * Ensures candidate document objects do not exceed the 1MB Firestore limit.
 * Keeps URLs, metadata, and optimizes/trims oversized base64 strings so Firestore never rejects writes.
 */
export function sanitizeDocForFirestore(docObj: Record<string, any>): Record<string, any> {
  const clean = deepCleanForFirestore(docObj);
  try {
    if (Array.isArray(clean.documentos)) {
      clean.documentos = clean.documentos.map((item: any) => {
        if (Array.isArray(item.archivos)) {
          const trimmedArchivos = item.archivos.map((arch: any) => {
            // If the archivo has a server or cloud URL (/api/documents/ or http), strip bulky base64Data completely so Firestore doc stays tiny (<20KB)
            if (arch.url && (arch.url.startsWith('http') || arch.url.startsWith('/api/documents/') || arch.url.startsWith('/api/'))) {
              const { base64Data, ...rest } = arch;
              return rest;
            }
            // If base64Data is large (> 25KB), convert reference to server URL and strip raw string
            if (arch.base64Data && arch.base64Data.length > 25000) {
              const safeUrl = arch.url || `/api/documents/${arch.id || 'doc'}`;
              const { base64Data, ...rest } = arch;
              return { ...rest, url: safeUrl };
            }
            return arch;
          });
          return { ...item, archivos: trimmedArchivos };
        }
        return item;
      });
    }
  } catch (err) {
    console.error('Error optimizing doc for Firestore:', err);
  }
  return clean;
}

/**
 * Save / Update Candidato in Firestore
 */
export async function saveCandidatoFirestore(candidato: Candidato) {
  try {
    let cleanCand = deepCleanForFirestore(candidato);
    if (Array.isArray(cleanCand.documentosAnalizados)) {
      cleanCand.documentosAnalizados = cleanCand.documentosAnalizados.map((d: any) => {
        if (d.url && (d.url.startsWith('http') || d.url.startsWith('/api/documents/') || d.url.startsWith('/api/'))) {
          const { base64Data, ...rest } = d;
          return rest;
        }
        if (d.base64Data && d.base64Data.length > 25000) {
          const safeUrl = d.url || `/api/documents/${d.id || 'doc'}`;
          const { base64Data, ...rest } = d;
          return { ...rest, url: safeUrl };
        }
        return d;
      });
    }
    await setDoc(doc(db, 'candidatos', candidato.id), cleanCand, { merge: true });
  } catch (err) {
    console.error('Error saving candidato to Firestore:', err);
  }
}

/**
 * Delete Candidato from Firestore
 */
export async function deleteCandidatoFirestore(candidateId: string) {
  try {
    await deleteDoc(doc(db, 'candidatos', candidateId));
  } catch (err) {
    console.error('Error deleting candidato from Firestore:', err);
  }
}

/**
 * Real-time listener for Invitaciones de Visita
 */
export function subscribeInvitaciones(callback: (invitaciones: InvitacionVisita[]) => void) {
  return onSnapshot(
    INVITACIONES_COL,
    (snapshot) => {
      const items: InvitacionVisita[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as InvitacionVisita);
      });
      callback(items);
    },
    (err) => {
      console.error('Firestore invitaciones snapshot error:', err);
    }
  );
}

/**
 * Real-time listener for Visit Slots
 */
export function subscribeVisitSlots(callback: (slots: VisitSlot[]) => void) {
  return onSnapshot(
    SLOTS_VISITA_COL,
    (snapshot) => {
      const items: VisitSlot[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as VisitSlot);
      });
      callback(items);
    },
    (err) => {
      console.error('Firestore visit slots snapshot error:', err);
    }
  );
}

/**
 * Save / Update Invitacion in Firestore
 */
export async function saveInvitacionFirestore(invitacion: InvitacionVisita) {
  try {
    const cleanInv = sanitizeObjectForFirestore(invitacion);
    await setDoc(doc(db, 'invitaciones', invitacion.id), cleanInv, { merge: true });
  } catch (err) {
    console.error('Error saving invitacion to Firestore:', err);
  }
}

/**
 * Delete Invitacion from Firestore
 */
export async function deleteInvitacionFirestore(invitacionId: string) {
  try {
    await deleteDoc(doc(db, 'invitaciones', invitacionId));
  } catch (err) {
    console.error('Error deleting invitacion from Firestore:', err);
  }
}

/**
 * Atomic booking of a visit slot in Firestore using runTransaction.
 * Guarantees that if two candidates attempt to book the exact same slot simultaneously,
 * only one succeeds and the other receives an error.
 */
export async function bookSlotTransaction(
  slotId: string,
  candidateData: { id: string; nombre: string; telefono: string; email?: string },
  invitacionId: string,
  fullAddress: string,
  notas?: string
) {
  const slotRef = doc(db, 'slots_visita', slotId);
  const invRef = doc(db, 'invitaciones', invitacionId);
  const candRef = doc(db, 'candidatos', candidateData.id);

  return await runTransaction(db, async (transaction) => {
    const slotSnap = await transaction.get(slotRef);
    if (!slotSnap.exists()) {
      throw new Error('El horario seleccionado no existe en el sistema.');
    }

    const slotData = slotSnap.data() as VisitSlot;
    if (!slotData.disponible || slotData.reservaCandidateId) {
      throw new Error('Lo sentimos, este horario acaba de ser reservado. Selecciona otro horario.');
    }

    const nowIso = new Date().toISOString();

    // 1. Update slot atomically
    transaction.update(slotRef, {
      disponible: false,
      reservaCandidateId: candidateData.id,
      reservaCandidateNombre: candidateData.nombre,
      reservaInvitationId: invitacionId,
    });

    // 2. Update invitation status
    transaction.update(invRef, {
      status: 'HORARIO RESERVADO',
      bookedAt: nowIso,
      reserva: {
        slotId: slotData.id,
        fecha: slotData.fecha,
        horaInicio: slotData.horaInicio,
        horaFin: slotData.horaFin,
        direccionCompleta: fullAddress,
        notasCandidato: notas || '',
      },
    });

    // 3. Update candidate status
    transaction.update(candRef, {
      estado: 'visita_reservada',
    });

    return { ...slotData, disponible: false };
  });
}

/**
 * Saves a list of generated visit slots for an inmueble to Firestore in a batch write.
 */
export async function saveAgendaSlotsFirestore(slots: VisitSlot[]) {
  try {
    const batch = writeBatch(db);
    slots.forEach((s) => {
      const slotRef = doc(db, 'slots_visita', s.id);
      batch.set(slotRef, sanitizeObjectForFirestore(s), { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.error('Error saving agenda slots to Firestore:', err);
  }
}

/**
 * Save / Update Visit Slot in Firestore
 */
export async function saveVisitSlotFirestore(slot: VisitSlot) {
  try {
    const cleanSlot = sanitizeObjectForFirestore(slot);
    await setDoc(doc(db, 'slots_visita', slot.id), cleanSlot, { merge: true });
  } catch (err) {
    console.error('Error saving visit slot to Firestore:', err);
  }
}

/**
 * Delete Visit Slot from Firestore
 */
export async function deleteVisitSlotFirestore(slotId: string) {
  try {
    await deleteDoc(doc(db, 'slots_visita', slotId));
  } catch (err) {
    console.error('Error deleting visit slot from Firestore:', err);
  }
}

/**
 * Delete multiple Visit Slots from Firestore in a batch write
 */
export async function deleteMultipleSlotsFirestore(slotIds: string[]) {
  if (!slotIds || slotIds.length === 0) return;
  try {
    const batch = writeBatch(db);
    slotIds.forEach((id) => {
      batch.delete(doc(db, 'slots_visita', id));
    });
    await batch.commit();
  } catch (err) {
    console.error('Error deleting multiple visit slots from Firestore:', err);
  }
}

/**
 * Save / Update Solicitud in Firestore
 */
export async function saveSolicitudFirestore(solicitud: SolicitudAlquiler) {
  try {
    const cleanSol = sanitizeObjectForFirestore(solicitud);
    await setDoc(doc(db, 'solicitudes', solicitud.id), cleanSol, { merge: true });
  } catch (err) {
    console.error('Error saving solicitud to Firestore:', err);
  }
}

/**
 * Real-time listener for Solicitudes de Documentación Post-Visita
 */
export function subscribeSolicitudesDoc(callback: (solicitudesDoc: SolicitudDocumentacion[]) => void) {
  return onSnapshot(
    SOLICITUDES_DOC_COL,
    (snapshot) => {
      const items: SolicitudDocumentacion[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as SolicitudDocumentacion);
      });
      callback(items);
    },
    (err) => {
      console.error('Firestore solicitudes_documentacion snapshot error:', err);
    }
  );
}

/**
 * Save / Update Solicitud de Documentación in Firestore
 */
export async function saveSolicitudDocFirestore(solicitudDoc: SolicitudDocumentacion) {
  try {
    const cleanDoc = sanitizeDocForFirestore(solicitudDoc);
    await setDoc(doc(db, 'solicitudes_documentacion', solicitudDoc.id), cleanDoc, { merge: true });
  } catch (err) {
    console.error('Error saving solicitud documentacion to Firestore:', err);
  }
}

/**
 * Delete Solicitud de Documentación from Firestore
 */
export async function deleteSolicitudDocFirestore(solicitudDocId: string) {
  try {
    await deleteDoc(doc(db, 'solicitudes_documentacion', solicitudDocId));
  } catch (err) {
    console.error('Error deleting solicitud documentacion from Firestore:', err);
  }
}

/**
 * Real-time listener for Contratos de Formalización (Fase 3).
 * FASE 1.4: con ámbito de PROPIETARIO lanza una consulta acotada por
 * propietarioId (nunca la colección completa). Es exactamente el filtro que las
 * Security Rules exigen para conceder el listado. Los profesionales no reciben
 * contratos. El administrador mantiene la escucha global.
 */
export function subscribeContratos(
  callback: (contratos: ContratoFormalizacion[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  // Profesionales: cero acceso a contratos/cobros.
  if (scope?.tipoPerfil === 'PROFESIONAL') {
    callback([]);
    return () => {};
  }

  // Administrador o sin ámbito: colección completa.
  if (!scope || scope.tipoPerfil !== 'PROPIETARIO') {
    return onSnapshot(
      CONTRATOS_COL,
      (snapshot) => {
        const items: ContratoFormalizacion[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() } as ContratoFormalizacion);
        });
        callback(items);
      },
      (err) => {
        console.error('Firestore contratos_formalizacion snapshot error:', err);
      }
    );
  }

  // --- PROPIETARIO ---
  // La regla de Firestore EXIGE el filtro de igualdad por propietarioId (las
  // reglas no filtran); por eso se consulta únicamente por ese campo. Un
  // inmueble compartido pero titularidad de otro propietario no pertenece
  // económicamente a este usuario y, por tanto, no se incluye aquí.
  const pid = scope.propietarioId;
  if (!pid) {
    callback([]);
    return () => {};
  }

  const scopedQuery = query(CONTRATOS_COL, where('propietarioId', '==', pid));
  return onSnapshot(
    scopedQuery,
    (snap) => {
      const items: ContratoFormalizacion[] = [];
      snap.forEach((ds) => {
        items.push({ id: ds.id, ...ds.data() } as ContratoFormalizacion);
      });
      callback(items);
    },
    (err) => {
      console.error('Firestore contratos (scoped) snapshot error:', err);
    }
  );
}

/**
 * Save / Update Contrato de Formalización in Firestore
 */
export async function saveContratoFirestore(contrato: ContratoFormalizacion) {
  try {
    const cleanContrato = sanitizeObjectForFirestore(contrato);
    await setDoc(doc(db, 'contratos_formalizacion', contrato.id), cleanContrato, { merge: true });
  } catch (err) {
    console.error('Error saving contrato formalizacion to Firestore:', err);
  }
}

/**
 * Delete Contrato de Formalización from Firestore
 */
export async function deleteContratoFirestore(contratoId: string) {
  try {
    await deleteDoc(doc(db, 'contratos_formalizacion', contratoId));
  } catch (err) {
    console.error('Error deleting contrato formalizacion from Firestore:', err);
  }
}

// ============================================================
// FASE 2.0 — GASTOS (explotación vs financiación)
// ============================================================

/**
 * Listener de gastos con el mismo aislamiento que los contratos:
 * - PROFESIONAL: cero acceso (son datos económicos).
 * - PROPIETARIO: consulta demostrable where('propietarioId','==', pid).
 * - ADMINISTRADOR / sin ámbito: colección completa.
 */
export function subscribeGastos(
  callback: (gastos: Gasto[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  if (scope?.tipoPerfil === 'PROFESIONAL') {
    callback([]);
    return () => {};
  }

  if (!scope || scope.tipoPerfil !== 'PROPIETARIO') {
    return onSnapshot(
      GASTOS_COL,
      (snapshot) => {
        const items: Gasto[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() } as Gasto);
        });
        callback(items);
      },
      (err) => {
        console.error('Firestore gastos snapshot error:', err);
      }
    );
  }

  const pid = scope.propietarioId;
  if (!pid) {
    callback([]);
    return () => {};
  }

  const scopedQuery = query(GASTOS_COL, where('propietarioId', '==', pid));
  return onSnapshot(
    scopedQuery,
    (snap) => {
      const items: Gasto[] = [];
      snap.forEach((ds) => {
        items.push({ id: ds.id, ...ds.data() } as Gasto);
      });
      callback(items);
    },
    (err) => {
      console.error('Firestore gastos (scoped) snapshot error:', err);
    }
  );
}

export async function saveGastoFirestore(gasto: Gasto) {
  try {
    const cleanGasto = sanitizeObjectForFirestore(gasto);
    await setDoc(doc(db, 'gastos', gasto.id), cleanGasto, { merge: true });
  } catch (err) {
    console.error('Error saving gasto to Firestore:', err);
  }
}

export async function deleteGastoFirestore(gastoId: string) {
  try {
    await deleteDoc(doc(db, 'gastos', gastoId));
  } catch (err) {
    console.error('Error deleting gasto from Firestore:', err);
  }
}

/**
 * Real-time listener for Configuracion de Aseguradoras (Fase 4)
 */
export function subscribeAseguradoras(callback: (aseguradoras: ConfiguracionAseguradora[]) => void) {
  return onSnapshot(
    ASEGURADORAS_COL,
    (snapshot) => {
      const items: ConfiguracionAseguradora[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as ConfiguracionAseguradora);
      });
      if (items.length === 0) {
        callback(INITIAL_ASEGURADORAS);
      } else {
        // Ensure SEAG is present in the list
        const hasSeag = items.some(
          (i) => i.id === 'seag' || i.nombre.toLowerCase().includes('seag')
        );
        if (!hasSeag) {
          const seagDefault = INITIAL_ASEGURADORAS.find((a) => a.id === 'seag');
          if (seagDefault) {
            const merged = [seagDefault, ...items];
            callback(merged);
            // Proactively save SEAG to Firestore
            saveAseguradoraFirestore(seagDefault);
            return;
          }
        }
        callback(items);
      }
    },
    (err) => {
      console.error('Firestore configuracion_aseguradoras snapshot error:', err);
      callback(INITIAL_ASEGURADORAS);
    }
  );
}

/**
 * Save / Update Aseguradora in Firestore
 */
export async function saveAseguradoraFirestore(aseguradora: ConfiguracionAseguradora) {
  try {
    const cleanAseg = sanitizeObjectForFirestore(aseguradora);
    await setDoc(doc(db, 'configuracion_aseguradoras', aseguradora.id), cleanAseg, { merge: true });
  } catch (err) {
    console.error('Error saving aseguradora to Firestore:', err);
  }
}

/**
 * Delete Aseguradora from Firestore
 */
export async function deleteAseguradoraFirestore(aseguradoraId: string) {
  try {
    await deleteDoc(doc(db, 'configuracion_aseguradoras', aseguradoraId));
  } catch (err) {
    console.error('Error deleting aseguradora from Firestore:', err);
  }
}

/**
 * Real-time listener for Solicitudes de Seguro de Impago (Fase 4 & 5)
 */
export function subscribeSolicitudesSeguro(callback: (solicitudes: SolicitudSeguroImpago[]) => void) {
  return onSnapshot(
    SOLICITUDES_SEGURO_COL,
    (snapshot) => {
      const items: SolicitudSeguroImpago[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as SolicitudSeguroImpago);
      });
      callback(items);
    },
    (err) => {
      console.error('Firestore solicitudes_seguro_impago snapshot error:', err);
    }
  );
}

/**
 * Save / Update Solicitud de Seguro de Impago in Firestore
 */
export async function saveSolicitudSeguroFirestore(solicitud: SolicitudSeguroImpago) {
  try {
    const cleanSol = sanitizeObjectForFirestore(solicitud);
    await setDoc(doc(db, 'solicitudes_seguro_impago', solicitud.id), cleanSol, { merge: true });
  } catch (err) {
    console.error('Error saving solicitud seguro impago to Firestore:', err);
  }
}

/**
 * Delete Solicitud de Seguro de Impago from Firestore
 */
export async function deleteSolicitudSeguroFirestore(solicitudId: string) {
  try {
    await deleteDoc(doc(db, 'solicitudes_seguro_impago', solicitudId));
  } catch (err) {
    console.error('Error deleting solicitud seguro impago from Firestore:', err);
  }
}

/**
 * Real-time listener for Gmail Integration Config (Fase 5)
 */
export function subscribeGmailConfig(callback: (config: GmailIntegracionConfig) => void) {
  const configDocRef = doc(db, 'system', 'gmail_config');
  return onSnapshot(
    configDocRef,
    (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data() as GmailIntegracionConfig);
      } else {
        callback(INITIAL_GMAIL_CONFIG);
      }
    },
    (err) => {
      console.error('Firestore gmail_config snapshot error:', err);
    }
  );
}

/**
 * Save / Update Gmail Integration Config in Firestore
 */
export async function saveGmailConfigFirestore(config: GmailIntegracionConfig) {
  try {
    const cleanConfig = sanitizeObjectForFirestore(config);
    await setDoc(doc(db, 'system', 'gmail_config'), cleanConfig, { merge: true });
  } catch (err) {
    console.error('Error saving gmail config to Firestore:', err);
  }
}

/**
 * Uploads a candidate-provided document file to server document store / Firebase Storage with resilient fallback.
 * Automatically optimizes and compresses image uploads for rapid saving and small payload footprint.
 */
export async function uploadDocumentoAportadoFile(
  solicitudDocId: string,
  itemId: string,
  fileOrBlob: File | Blob,
  fileName: string
): Promise<{ downloadURL: string; storagePath: string; base64Data?: string }> {
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  let targetBlob = fileOrBlob;
  let compressedDataUrl = '';

  if (fileOrBlob instanceof File && fileOrBlob.type.startsWith('image/')) {
    try {
      const comp = await compressImageForUpload(fileOrBlob, 1400, 1400, 0.72);
      targetBlob = comp.blob;
      compressedDataUrl = comp.dataUrl;
    } catch (e) {
      console.warn('Image compression fallback:', e);
    }
  }

  const getDataUrlFallback = async (): Promise<string> => {
    if (compressedDataUrl) return compressedDataUrl;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(targetBlob);
    });
  };

  try {
    const dataURL = await getDataUrlFallback();

    // 1. Try uploading to server document store first (instant, works for large multi-page PDFs)
    try {
      const serverUploadRes = await fetch('/api/upload-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: dataURL,
          filename: fileName,
          mimeType: targetBlob.type || 'application/pdf',
          solicitudId: solicitudDocId,
          itemId,
        }),
      });

      if (serverUploadRes.ok) {
        const json = await serverUploadRes.json();
        if (json.url) {
          return {
            downloadURL: json.url,
            storagePath: json.storagePath || `server_${json.fileId}`,
            base64Data: dataURL,
          };
        }
      }
    } catch (serverErr) {
      console.warn('Server upload error, attempting Firebase Storage fallback:', serverErr);
    }

    // 2. Fallback to Firebase Storage if available
    const storagePath = `documentos_solicitados/${solicitudDocId}/${itemId}_${Date.now()}_${sanitizedName}`;
    const uploadWork = (async () => {
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, targetBlob, {
        contentType: targetBlob.type || 'application/pdf',
      });
      return await getDownloadURL(fileRef);
    })();

    // 2.5-second timeout guard for Cloud Storage
    const timeoutGuard = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 2500);
    });

    const resultURL = await Promise.race([uploadWork, timeoutGuard]);

    if (resultURL && typeof resultURL === 'string') {
      return { downloadURL: resultURL, base64Data: dataURL, storagePath };
    } else {
      return { downloadURL: dataURL, base64Data: dataURL, storagePath: `local_${itemId}` };
    }
  } catch (err) {
    console.warn('Document upload error fallback:', err);
    const dataURL = await getDataUrlFallback();
    return { downloadURL: dataURL, base64Data: dataURL, storagePath: `local_${itemId}` };
  }
}

/**
 * Delete Solicitud from Firestore
 */
export async function deleteSolicitudFirestore(solicitudId: string) {
  try {
    await deleteDoc(doc(db, 'solicitudes', solicitudId));
  } catch (err) {
    console.error('Error deleting solicitud from Firestore:', err);
  }
}

/**
 * Uploads an image blob to Firebase Storage.
 * Uses a fast 2-second timeout guard. If Firebase Storage is unavailable or slow,
 * it immediately returns a lightweight compressed Data URL so image uploading NEVER blocks or fails.
 */
export async function uploadInmuebleImageToStorage(
  inmuebleId: string,
  imageId: string,
  blob: Blob,
  fileName: string
): Promise<{ downloadURL: string; storagePath: string }> {
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `inmuebles/${inmuebleId}/${imageId}_${sanitizedName}`;

  // Helper to quickly convert blob to data URL as fallback
  const getDataUrlFallback = async (): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  };

  try {
    const uploadWork = (async () => {
      const imageRef = ref(storage, storagePath);
      await uploadBytes(imageRef, blob, {
        contentType: blob.type || 'image/jpeg',
      });
      return await getDownloadURL(imageRef);
    })();

    // 2-second timeout guard for Cloud Storage
    const timeoutGuard = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 2000);
    });

    const resultURL = await Promise.race([uploadWork, timeoutGuard]);

    if (resultURL && typeof resultURL === 'string') {
      return { downloadURL: resultURL, storagePath };
    } else {
      console.warn('Firebase Storage upload timed out, using compressed Data URL fallback.');
      const dataURL = await getDataUrlFallback();
      return { downloadURL: dataURL || URL.createObjectURL(blob), storagePath: `local_${imageId}` };
    }
  } catch (err) {
    console.warn('Firebase Storage upload failed, using compressed Data URL fallback:', err);
    const dataURL = await getDataUrlFallback();
    return { downloadURL: dataURL || URL.createObjectURL(blob), storagePath: `local_${imageId}` };
  }
}

/**
 * Sube el justificante mensual de un cobro (transferencia / ingreso) a Firebase Storage.
 * Regla arquitectónica: Firestore guarda SOLO metadatos y la URL; el PDF/imagen va a Storage.
 * Nunca se codifica el documento en base64 dentro del documento económico.
 *
 * Estrategia resilente:
 *  1) Firebase Storage (almacenamiento duradero).
 *  2) Si Storage falla o tarda demasiado, se intenta mediante el endpoint del servidor.
 *  3) Si ambos fallan, se lanza un error para no guardar una referencia efímera/rota.
 */
export async function uploadJustificanteCobro(
  cobroPeriodoId: string,
  file: File | Blob,
  fileName: string,
  propietarioId?: string
): Promise<{ url: string; storagePath: string }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  // FASE 1.4: se segmenta por propietario para que Storage Rules pueda aislar
  // los justificantes (datos económicos). Si no hay propietarioId se usa la
  // carpeta genérica "sin_asignar".
  const ownerSeg = (propietarioId || 'sin_asignar').replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `cobros_justificantes/${ownerSeg}/${cobroPeriodoId}/${Date.now()}_${safeName}`;
  const mime =
    (file as File).type ||
    (safeName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

  // 1) Firebase Storage
  try {
    const fileRef = ref(storage, storagePath);
    const uploadWork = (async () => {
      await uploadBytes(fileRef, file, { contentType: mime });
      return await getDownloadURL(fileRef);
    })();

    const timeoutGuard = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
    const url = await Promise.race([uploadWork, timeoutGuard]);

    if (url && typeof url === 'string') {
      return { url, storagePath };
    }
    console.warn('Timeout subiendo justificante a Firebase Storage; se intenta por servidor.');
  } catch (err) {
    console.warn('Firebase Storage no disponible para el justificante; se intenta por servidor:', err);
  }

  // 2) Respaldo mediante el endpoint del servidor (almacén de proceso)
  try {
    const dataURL = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || '');
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsDataURL(file);
    });

    const res = await fetch('/api/upload-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64: dataURL,
        filename: fileName,
        mimeType: mime,
        itemId: cobroPeriodoId,
      }),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.url) {
        return { url: json.url as string, storagePath: (json.storagePath as string) || storagePath };
      }
    }
  } catch (serverErr) {
    console.warn('Fallo también la subida del justificante por servidor:', serverErr);
  }

  throw new Error(
    'No se ha podido almacenar el justificante. Revisa la conexión o Firebase Storage e inténtalo de nuevo.'
  );
}

/**
 * Elimina un justificante de Firebase Storage. Las referencias del almacén temporal
 * del servidor (server_*) no se eliminan de Storage.
 */
export async function deleteJustificanteCobro(storagePath?: string): Promise<void> {
  if (!storagePath || storagePath.startsWith('local_') || storagePath.startsWith('server_')) {
    return;
  }
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (err) {
    console.warn('No se pudo eliminar el justificante de Storage:', err);
  }
}

/**
 * Deletes an image file from Firebase Storage.
 */
export async function deleteInmuebleImageFromStorage(storagePath: string): Promise<void> {
  if (!storagePath || storagePath.startsWith('local_') || storagePath.startsWith('http')) {
    return;
  }
  try {
    const imageRef = ref(storage, storagePath);
    await deleteObject(imageRef);
  } catch (err) {
    console.warn('Error deleting image from Firebase Storage:', err);
  }
}

// =========================================================================
// GESTIÓN DE USUARIOS (RBAC)
// =========================================================================

export function subscribeUsuarios(callback: (usuarios: UsuarioApp[]) => void) {
  return onSnapshot(
    USUARIOS_COL,
    (snapshot) => {
      const items: UsuarioApp[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as UsuarioApp);
      });
      callback(items);
    },
    (err) => {
      console.error('Firestore usuarios snapshot error:', err);
    }
  );
}

export async function saveUsuarioFirestore(usuario: UsuarioApp): Promise<void> {
  const userRef = doc(db, 'usuarios', usuario.id);
  const clean = sanitizeObjectForFirestore({
    ...usuario,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(userRef, clean, { merge: true });
}

export async function deleteUsuarioFirestore(usuarioId: string): Promise<void> {
  const userRef = doc(db, 'usuarios', usuarioId);
  await deleteDoc(userRef);
}

// =========================================================================
// GESTIÓN DE PROFESIONALES Y MANTENIMIENTO
// =========================================================================

export function subscribeProfesionales(callback: (profesionales: Profesional[]) => void) {
  return onSnapshot(
    PROFESIONALES_COL,
    (snapshot) => {
      const items: Profesional[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Profesional);
      });
      callback(items);
    },
    (err) => {
      console.error('Firestore profesionales snapshot error:', err);
    }
  );
}

export async function saveProfesionalFirestore(profesional: Profesional): Promise<void> {
  const profRef = doc(db, 'profesionales', profesional.id);
  const clean = sanitizeObjectForFirestore({
    ...profesional,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(profRef, clean, { merge: true });
}

export async function deleteProfesionalFirestore(profesionalId: string): Promise<void> {
  const profRef = doc(db, 'profesionales', profesionalId);
  await deleteDoc(profRef);
}

// =========================================================================
// ENLACES DE REGISTRO E INVITACIONES
// =========================================================================

export function subscribeEnlacesRegistro(callback: (enlaces: EnlaceRegistro[]) => void) {
  return onSnapshot(
    ENLACES_REGISTRO_COL,
    (snapshot) => {
      const items: EnlaceRegistro[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as EnlaceRegistro);
      });
      callback(items);
    },
    (err) => {
      console.error('Firestore enlaces_registro snapshot error:', err);
    }
  );
}

export async function saveEnlaceRegistroFirestore(enlace: EnlaceRegistro): Promise<void> {
  const enlaceRef = doc(db, 'enlaces_registro', enlace.id);
  const clean = sanitizeObjectForFirestore(enlace);
  await setDoc(enlaceRef, clean, { merge: true });
}

export async function deleteEnlaceRegistroFirestore(enlaceId: string): Promise<void> {
  const enlaceRef = doc(db, 'enlaces_registro', enlaceId);
  await deleteDoc(enlaceRef);
}

// =========================================================================
// CATÁLOGO DE ESPECIALIDADES
// =========================================================================

export function subscribeEspecialidades(callback: (especialidades: Especialidad[]) => void) {
  return onSnapshot(
    ESPECIALIDADES_COL,
    (snapshot) => {
      const items: Especialidad[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Especialidad);
      });
      items.sort((a, b) => (a.orden || 99) - (b.orden || 99));
      callback(items);
    },
    (err) => {
      console.error('Firestore especialidades snapshot error:', err);
    }
  );
}

export async function saveEspecialidadFirestore(especialidad: Especialidad): Promise<void> {
  const espRef = doc(db, 'especialidades', especialidad.id);
  const clean = sanitizeObjectForFirestore(especialidad);
  await setDoc(espRef, clean, { merge: true });
}

export async function deleteEspecialidadFirestore(especialidadId: string): Promise<void> {
  const espRef = doc(db, 'especialidades', especialidadId);
  await deleteDoc(espRef);
}

// =========================================================================
// REGISTRO DE AUDITORÍA (INMUTABLE)
// =========================================================================

export function subscribeAuditLogs(callback: (logs: AuditLog[]) => void) {
  return onSnapshot(
    AUDIT_LOGS_COL,
    (snapshot) => {
      const items: AuditLog[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as AuditLog);
      });
      // Sort descending by date
      items.sort((a, b) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime());
      callback(items);
    },
    (err) => {
      console.error('Firestore audit_logs snapshot error:', err);
    }
  );
}

export async function registrarAuditoriaFirestore(
  log: Omit<AuditLog, 'id' | 'fechaHora'> & { id?: string; fechaHora?: string }
): Promise<void> {
  try {
    const id = log.id || `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fechaHora = log.fechaHora || new Date().toISOString();
    const logRef = doc(db, 'audit_logs', id);
    const clean = sanitizeObjectForFirestore({
      id,
      fechaHora,
      ...log,
    });
    await setDoc(logRef, clean);
  } catch (err) {
    console.warn('Error saving audit log:', err);
  }
}

export const saveAuditLogFirestore = registrarAuditoriaFirestore;

// =========================================================================
// CONFIGURACIÓN DE MÓDULOS DEL SISTEMA
// =========================================================================

export function subscribeModulosConfig(callback: (config: ModulosConfig) => void) {
  return onSnapshot(
    MODULOS_CONFIG_REF,
    (snapshot) => {
      if (snapshot.exists()) {
        callback({ ...DEFAULT_MODULOS_CONFIG, ...snapshot.data() } as ModulosConfig);
      } else {
        callback(DEFAULT_MODULOS_CONFIG);
      }
    },
    (err) => {
      console.error('Firestore modulos_config snapshot error:', err);
      callback(DEFAULT_MODULOS_CONFIG);
    }
  );
}

export async function saveModulosConfigFirestore(config: ModulosConfig): Promise<void> {
  const clean = sanitizeObjectForFirestore(config);
  await setDoc(MODULOS_CONFIG_REF, clean, { merge: true });
}

// =========================================================================
// BOOTSTRAP DE USUARIOS, ROLES, ENLACES Y ESPECIALIDADES
// =========================================================================

export const DEFAULT_ESPECIALIDADES_INITIAL: Especialidad[] = [
  { id: 'esp_manitas', nombre: 'Manitas / Reparaciones Menores', icono: 'Wrench', activa: true, orden: 1 },
  { id: 'esp_fontaneria', nombre: 'Fontanería', icono: 'Droplet', activa: true, orden: 2 },
  { id: 'esp_electricidad', nombre: 'Electricidad e Iluminación', icono: 'Zap', activa: true, orden: 3 },
  { id: 'esp_albanileria', nombre: 'Albañilería y Reformas', icono: 'Hammer', activa: true, orden: 4 },
  { id: 'esp_pintura', nombre: 'Pintura y Empapelado', icono: 'Paintbrush', activa: true, orden: 5 },
  { id: 'esp_cerrajeria', nombre: 'Cerrajería 24h', icono: 'Key', activa: true, orden: 6 },
  { id: 'esp_climatizacion', nombre: 'Aire Acondicionado y Climatización', icono: 'Wind', activa: true, orden: 7 },
  { id: 'esp_calefaccion', nombre: 'Calefacción y Calderas', icono: 'Flame', activa: true, orden: 8 },
  { id: 'esp_electrodomesticos', nombre: 'Reparación de Electrodomésticos', icono: 'Tv', activa: true, orden: 9 },
  { id: 'esp_limpieza', nombre: 'Limpieza y Desinfección', icono: 'Sparkles', activa: true, orden: 10 },
  { id: 'esp_cristaleria', nombre: 'Cristalería y Ventanas', icono: 'Layers', activa: true, orden: 11 },
  { id: 'esp_carpinteria', nombre: 'Carpintería de Madera y Metal', icono: 'Scissors', activa: true, orden: 12 },
  { id: 'esp_persianas', nombre: 'Persianas y Toldos', icono: 'Sun', activa: true, orden: 13 },
  { id: 'esp_jardineria', nombre: 'Jardinería y Piscinas', icono: 'Flower', activa: true, orden: 14 },
  { id: 'esp_otros', nombre: 'Otros Servicios Técnicos', icono: 'Settings', activa: true, orden: 15 },
];

export async function seedAuthAndRolesIfEmpty() {
  try {
    // 1. Seed admin user if not exists
    const usersSnap = await getDocs(USUARIOS_COL);
    if (usersSnap.empty) {
      const uBatch = writeBatch(db);

      // Admin principal
      const adminUser: UsuarioApp = {
        id: 'user_admin_principal',
        nombre: 'Administrador Principal',
        apellidos: 'RentSelect',
        email: 'sarqsan2@gmail.com',
        telefono: '+34 600 111 222',
        tipoPerfil: 'ADMINISTRADOR',
        estado: 'ACTIVO',
        roles: ['SUPERADMIN'],
        permisos: PERMISOS_SISTEMA.map((p) => p.codigo),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      uBatch.set(doc(db, 'usuarios', adminUser.id), sanitizeObjectForFirestore(adminUser));

      // Propietario demo
      const propUser: UsuarioApp = {
        id: 'user_propietario_demo',
        nombre: 'Propietario Demo',
        apellidos: 'García Rentas',
        email: 'propietario@email.com',
        telefono: '+34 611 223 344',
        tipoPerfil: 'PROPIETARIO',
        estado: 'ACTIVO',
        roles: ['PROPIETARIO_ESTANDAR'],
        permisos: [
          'inmuebles.ver',
          'inmuebles.editar',
          'contratos.ver',
          'profesionales.ver',
          'profesionales.crear',
          'profesionales.asignar',
        ],
        propietarioId: 'prop_demo_1',
        inmuebleIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      uBatch.set(doc(db, 'usuarios', propUser.id), sanitizeObjectForFirestore(propUser));

      // Profesional demo
      const profUser: UsuarioApp = {
        id: 'user_profesional_demo',
        nombre: 'Juan García',
        apellidos: 'Técnico Instalador',
        email: 'contacto@fontaneriagarcia.es',
        telefono: '+34 622 334 455',
        tipoPerfil: 'PROFESIONAL',
        estado: 'ACTIVO',
        roles: ['PROFESIONAL_MANTENIMIENTO'],
        permisos: ['profesionales.ver'],
        profesionalId: 'prof_demo_1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      uBatch.set(doc(db, 'usuarios', profUser.id), sanitizeObjectForFirestore(profUser));

      await uBatch.commit();
    }

    // 2. Seed default especialidades if empty
    const espSnap = await getDocs(ESPECIALIDADES_COL);
    if (espSnap.empty) {
      const eBatch = writeBatch(db);
      DEFAULT_ESPECIALIDADES_INITIAL.forEach((esp) => {
        eBatch.set(doc(db, 'especialidades', esp.id), sanitizeObjectForFirestore(esp));
      });
      await eBatch.commit();
    }

    // 3. Seed demo profesional if empty
    const profSnap = await getDocs(PROFESIONALES_COL);
    if (profSnap.empty) {
      const pBatch = writeBatch(db);
      const demoProf: Profesional = {
        id: 'prof_demo_1',
        usuarioId: 'user_profesional_demo',
        tipo: 'AUTONOMO',
        nombreComercial: 'Fontanería y Reparaciones García',
        razonSocial: 'Juan García Fontaneros S.L.U.',
        cifNif: 'B04998877',
        contactoNombre: 'Juan García',
        email: 'contacto@fontaneriagarcia.es',
        telefono: '+34 622 334 455',
        especialidades: ['Fontanería', 'Calefacción y Calderas', 'Manitas / Reparaciones Menores'],
        zonasServicio: [
          { id: 'zona_1', provincia: 'Almería', municipio: 'Vera', codigosPostales: ['04620', '04621'] },
          { id: 'zona_2', provincia: 'Almería', municipio: 'Roquetas de Mar', codigosPostales: ['04740'] },
          { id: 'zona_3', provincia: 'Alicante', municipio: 'Alicante', codigosPostales: ['03001'] },
        ],
        inmuebleIdsAsignados: [],
        activo: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      pBatch.set(doc(db, 'profesionales', demoProf.id), sanitizeObjectForFirestore(demoProf));
      await pBatch.commit();
    }

    // 4. Seed default enlaces de registro if empty
    const enlacesSnap = await getDocs(ENLACES_REGISTRO_COL);
    if (enlacesSnap.empty) {
      const lBatch = writeBatch(db);
      const enlaceProp: EnlaceRegistro = {
        id: 'enlace_prop_publico',
        token: 'registro_propietario_oficial',
        tipoPerfil: 'PROPIETARIO',
        textoVisible: '🏠 Regístrate como propietario',
        descripcion: 'Enlace oficial para alta de nuevos propietarios y arrendadores de viviendas',
        activo: true,
        usosActuales: 0,
        creadoPor: 'user_admin_principal',
        createdAt: new Date().toISOString(),
      };
      const enlaceProf: EnlaceRegistro = {
        id: 'enlace_prof_publico',
        token: 'registro_profesional_oficial',
        tipoPerfil: 'PROFESIONAL',
        textoVisible: '🔧 Regístrate como profesional o empresa de mantenimiento',
        descripcion: 'Enlace oficial para registro de autónomos, fontaneros, electricistas y empresas de reformas',
        activo: true,
        usosActuales: 0,
        creadoPor: 'user_admin_principal',
        createdAt: new Date().toISOString(),
      };
      lBatch.set(doc(db, 'enlaces_registro', enlaceProp.id), sanitizeObjectForFirestore(enlaceProp));
      lBatch.set(doc(db, 'enlaces_registro', enlaceProf.id), sanitizeObjectForFirestore(enlaceProf));
      await lBatch.commit();
    }

    // 5. Seed initial audit log if empty
    const auditSnap = await getDocs(AUDIT_LOGS_COL);
    if (auditSnap.empty) {
      await registrarAuditoriaFirestore({
        usuarioId: 'user_admin_principal',
        usuarioEmail: 'sarqsan2@gmail.com',
        usuarioNombre: 'Administrador Principal',
        accion: 'SISTEMA_INICIALIZADO',
        descripcion: 'Capa estructural de autenticación, usuarios, perfiles, permisos y profesionales inicializada con éxito.',
        entidadAfectada: 'modulo',
        idAfectado: 'sistema',
        resultado: 'EXITO',
      });
    }
  } catch (err) {
    console.error('Error seeding auth and roles:', err);
  }
}

export {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  query,
  where,
};
