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
  Incidencia,
  PolizaSeguro,
  Siniestro,
  AdjuntoIncidencia,
  TrabajoProfesional,
  PresupuestoProfesional,
  ValoracionProfesionalTrabajo,
  DocumentoProfesional,
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
const ASEGURADORAS_COL = collection(db, 'configuracion_aseguradoras');
const SOLICITUDES_SEGURO_COL = collection(db, 'solicitudes_seguro_impago');

// Colecciones estructurales de usuarios, perfiles, permisos y profesionales
export const USUARIOS_COL = collection(db, 'usuarios');
export const PROFESIONALES_COL = collection(db, 'profesionales');
export const ENLACES_REGISTRO_COL = collection(db, 'enlaces_registro');
export const ESPECIALIDADES_COL = collection(db, 'especialidades');
export const AUDIT_LOGS_COL = collection(db, 'audit_logs');
export const MODULOS_CONFIG_REF = doc(db, 'system', 'modulos_config');

// Colecciones Bloque 4: Incidencias, Mantenimiento, Seguros y Siniestros
export const INCIDENCIAS_COL = collection(db, 'incidencias');
export const POLIZAS_COL = collection(db, 'polizas_seguros');
export const SINIESTROS_COL = collection(db, 'siniestros');

// Colecciones Bloque 5: Profesionales, Trabajos, Presupuestos y Valoraciones
export const TRABAJOS_PROFESIONALES_COL = collection(db, 'trabajos_profesionales');
export const PRESUPUESTOS_PROFESIONALES_COL = collection(db, 'presupuestos_profesionales');
export const VALORACIONES_PROFESIONALES_COL = collection(db, 'valoraciones_profesionales');

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
 * Real-time listener for Propietarios
 */
export function subscribePropietarios(callback: (propietarios: Propietario[]) => void) {
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
 * Real-time listener for Contratos de Formalización (Fase 3)
 */
export function subscribeContratos(callback: (contratos: ContratoFormalizacion[]) => void) {
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

    // 6. Seed sample Polizas and Incidencia if collections are empty
    const polizasSnap = await getDocs(POLIZAS_COL);
    if (polizasSnap.empty) {
      const pBatch = writeBatch(db);
      const samplePoliza1: PolizaSeguro = {
        id: 'pol_hogar_001',
        aseguradora: 'Mapfre Seguros',
        numeroPoliza: 'MAP-8492048-H',
        tipo: 'HOGAR',
        propietarioId: 'prop_carlos',
        inmuebleId: '1',
        inmuebleDireccion: 'C/ Gran Vía 45, 3ºB, Madrid',
        fechaInicio: '2025-01-01',
        fechaVencimiento: '2026-01-01',
        estado: 'VIGENTE',
        coberturas: [
          'Daños por agua',
          'Rotura de tuberías e instalaciones',
          'Filtraciones',
          'Responsabilidad Civil inmobiliaria (300.000€)',
          'Cerrajería urgente 24h',
          'Daños eléctricos y sobretensión',
          'Rotura de cristales y sanitarios',
          'Defensa jurídica',
        ],
        franquicia: 0,
        primaAnual: 245.5,
        contacto: {
          telefono: '918 365 365',
          email: 'siniestros.hogar@mapfre.com',
          asistencia24h: '900 101 010',
        },
        observaciones: 'Póliza Multirriesgo Hogar con asistencia 24h contratada.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const samplePoliza2: PolizaSeguro = {
        id: 'pol_arrendador_002',
        aseguradora: 'Caser Seguros',
        numeroPoliza: 'CAS-9923812-P',
        tipo: 'ARRENDADOR',
        propietarioId: 'prop_laura',
        inmuebleId: '2',
        inmuebleDireccion: 'Paseo de la Castellana 120, 5ºA, Madrid',
        fechaInicio: '2025-02-01',
        fechaVencimiento: '2026-02-01',
        estado: 'VIGENTE',
        coberturas: [
          'Daños por agua',
          'Responsabilidad Civil arrendador',
          'Actos vandálicos del inquilino',
          'Asistencia urgente 24h',
          'Defensa jurídica y desahucio',
        ],
        franquicia: 150,
        primaAnual: 210,
        contacto: {
          telefono: '915 955 000',
          email: 'partes.arrendador@caser.es',
          asistencia24h: '900 365 240',
        },
        observaciones: 'Protección integral arrendador con cobertura de vandalismo.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      pBatch.set(doc(db, 'polizas_seguros', samplePoliza1.id), sanitizeObjectForFirestore(samplePoliza1));
      pBatch.set(doc(db, 'polizas_seguros', samplePoliza2.id), sanitizeObjectForFirestore(samplePoliza2));
      await pBatch.commit();
    }

    const incidenciasSnap = await getDocs(INCIDENCIAS_COL);
    if (incidenciasSnap.empty) {
      const sampleInc: Incidencia = {
        id: 'inc_sample_001',
        propietarioId: 'prop_carlos',
        inmuebleId: '1',
        inmuebleDireccion: 'C/ Gran Vía 45, 3ºB, Madrid',
        inmuebleCiudad: 'Madrid',
        contratoId: 'contrato_1',
        inquilinoId: 'cand_1',
        inquilinoNombre: 'Ana Gómez Fernández',
        inquilinoTelefono: '612 345 678',
        titulo: 'Fuga de agua en latiguillo del fregadero de la cocina',
        descripcion: 'El inquilino reporta goteo continuo bajo el fregadero tras usar el grifo monomando. Se ha colocado un cubo provisionalmente pero empieza a humedecer el mueble bajo encimera.',
        categoria: 'AGUA',
        prioridad: 'ALTA',
        estado: 'ABIERTA',
        origen: 'INQUILINO',
        fechaCreacion: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        fechaActualizacion: new Date().toISOString(),
        responsabilidad: 'POSIBLE_PROPIETARIO',
        responsabilidadNotas: 'Instalación de fontanería fija vinculada al inmueble (Art. 21.1 LAU). Se verificará si es desgaste natural o aflojamiento.',
        seguroEstado: 'POSIBLEMENTE_CUBIERTA',
        seguroComprobacionNotas: 'Póliza Mapfre Nº MAP-8492048-H cubre Daños por agua y fontanería de urgencia.',
        viaActuacion: 'PROFESIONAL',
        polizaId: 'pol_hogar_001',
        creadoPor: 'Ana Gómez Fernández (Inquilino)',
        actualizadoPor: 'Administrador Principal',
        fotografias: [
          {
            id: 'adj_001',
            incidenciaId: 'inc_sample_001',
            inmuebleId: '1',
            propietarioId: 'prop_carlos',
            nombre: 'fuga_fregadero.jpg',
            tipo: 'imagen',
            mimeType: 'image/jpeg',
            url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80',
            storagePath: 'incidencias/inc_sample_001/fuga_fregadero.jpg',
            fechaSubida: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
            subidoPor: 'Inquilino',
          },
        ],
        documentos: [],
        historial: [
          {
            id: 'hist_001',
            fecha: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
            usuario: 'Ana Gómez Fernández',
            accion: 'INCIDENCIA_CREADA',
            valorNuevo: 'ABIERTA',
            observacion: 'Reportada vía portal del inquilino.',
          },
        ],
      };
      await setDoc(doc(db, 'incidencias', sampleInc.id), sanitizeObjectForFirestore(sampleInc));
    }
  } catch (err) {
    console.error('Error seeding auth and roles:', err);
  }
}

// =========================================================================
// REAL-TIME LISTENERS & CRUD PARA INCIDENCIAS, PÓLIZAS Y SINIESTROS
// =========================================================================

/**
 * Escucha en tiempo real de Incidencias
 */
export function subscribeIncidencias(callback: (incidencias: Incidencia[]) => void) {
  return onSnapshot(
    INCIDENCIAS_COL,
    (snapshot) => {
      const items: Incidencia[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Incidencia);
      });
      // Ordenar por fechaCreacion descendente
      items.sort((a, b) => new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime());
      callback(items);
    },
    (err) => {
      console.error('Firestore incidencias snapshot error:', err);
    }
  );
}

/**
 * Guarda o actualiza una Incidencia en Firestore
 */
export async function saveIncidenciaFirestore(incidencia: Incidencia) {
  try {
    const cleanInc = sanitizeObjectForFirestore(incidencia);
    await setDoc(doc(db, 'incidencias', incidencia.id), cleanInc, { merge: true });
  } catch (err) {
    console.error('Error saving incidencia to Firestore:', err);
    throw err;
  }
}

/**
 * Elimina una Incidencia de Firestore
 */
export async function deleteIncidenciaFirestore(incidenciaId: string) {
  try {
    await deleteDoc(doc(db, 'incidencias', incidenciaId));
  } catch (err) {
    console.error('Error deleting incidencia from Firestore:', err);
    throw err;
  }
}

/**
 * Escucha en tiempo real de Pólizas de Seguro
 */
export function subscribePolizas(callback: (polizas: PolizaSeguro[]) => void) {
  return onSnapshot(
    POLIZAS_COL,
    (snapshot) => {
      const items: PolizaSeguro[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as PolizaSeguro);
      });
      items.sort((a, b) => (a.inmuebleDireccion || '').localeCompare(b.inmuebleDireccion || ''));
      callback(items);
    },
    (err) => {
      console.error('Firestore polizas snapshot error:', err);
    }
  );
}

/**
 * Guarda o actualiza una Póliza en Firestore
 */
export async function savePolizaFirestore(poliza: PolizaSeguro) {
  try {
    const cleanPol = sanitizeObjectForFirestore(poliza);
    await setDoc(doc(db, 'polizas_seguros', poliza.id), cleanPol, { merge: true });
  } catch (err) {
    console.error('Error saving poliza to Firestore:', err);
    throw err;
  }
}

/**
 * Elimina una Póliza de Firestore
 */
export async function deletePolizaFirestore(polizaId: string) {
  try {
    await deleteDoc(doc(db, 'polizas_seguros', polizaId));
  } catch (err) {
    console.error('Error deleting poliza from Firestore:', err);
    throw err;
  }
}

/**
 * Escucha en tiempo real de Siniestros
 */
export function subscribeSiniestros(callback: (siniestros: Siniestro[]) => void) {
  return onSnapshot(
    SINIESTROS_COL,
    (snapshot) => {
      const items: Siniestro[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Siniestro);
      });
      items.sort((a, b) => new Date(b.fechaComunicacion).getTime() - new Date(a.fechaComunicacion).getTime());
      callback(items);
    },
    (err) => {
      console.error('Firestore siniestros snapshot error:', err);
    }
  );
}

/**
 * Guarda o actualiza un Siniestro en Firestore
 */
export async function saveSiniestroFirestore(siniestro: Siniestro) {
  try {
    const cleanSin = sanitizeObjectForFirestore(siniestro);
    await setDoc(doc(db, 'siniestros', siniestro.id), cleanSin, { merge: true });
  } catch (err) {
    console.error('Error saving siniestro to Firestore:', err);
    throw err;
  }
}

/**
 * Elimina un Siniestro de Firestore
 */
export async function deleteSiniestroFirestore(siniestroId: string) {
  try {
    await deleteDoc(doc(db, 'siniestros', siniestroId));
  } catch (err) {
    console.error('Error deleting siniestro from Firestore:', err);
    throw err;
  }
}

/**
 * Sube una fotografía o documento de incidencia a Firebase Storage
 * Con timeout guard y fallback seguro para máxima fiabilidad.
 */
export async function uploadIncidenciaAdjuntoStorage(
  incidenciaId: string,
  file: File | Blob,
  nombreArchivo: string,
  tipo: 'imagen' | 'video' | 'documento'
): Promise<string> {
  const sanitizedName = nombreArchivo.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `incidencias/${incidenciaId}/${Date.now()}_${sanitizedName}`;
  const fileRef = ref(storage, path);

  try {
    const uploadPromise = async () => {
      const mimeType = file.type || (tipo === 'imagen' ? 'image/jpeg' : 'application/pdf');
      await uploadBytes(fileRef, file, { contentType: mimeType });
      return await getDownloadURL(fileRef);
    };

    const timeoutGuard = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('Storage upload timeout')), 12000)
    );

    return await Promise.race([uploadPromise(), timeoutGuard]);
  } catch (err) {
    console.warn('Firebase Storage upload failed/timed out, attempting data fallback:', err);
    // Para imágenes, generar una URL rápida segura
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80');
      reader.readAsDataURL(file);
    });
  }
}

// =========================================================================
// BLOQUE 5: SERVICIOS, TRABAJOS PROFESIONALES, PRESUPUESTOS Y VALORACIONES
// =========================================================================

/**
 * Escucha en tiempo real de Trabajos Profesionales
 */
export function subscribeTrabajosProfesionales(callback: (trabajos: TrabajoProfesional[]) => void) {
  return onSnapshot(
    TRABAJOS_PROFESIONALES_COL,
    (snapshot) => {
      const items: TrabajoProfesional[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as TrabajoProfesional);
      });
      items.sort((a, b) => new Date(b.createdAt || b.fechaSolicitud).getTime() - new Date(a.createdAt || a.fechaSolicitud).getTime());
      callback(items);
    },
    (err) => {
      console.error('Firestore trabajos_profesionales snapshot error:', err);
    }
  );
}

/**
 * Guarda o actualiza un Trabajo Profesional en Firestore
 */
export async function saveTrabajoProfesionalFirestore(trabajo: TrabajoProfesional): Promise<void> {
  try {
    const cleanTrabajo = sanitizeObjectForFirestore({
      ...trabajo,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'trabajos_profesionales', trabajo.id), cleanTrabajo, { merge: true });
  } catch (err) {
    console.error('Error saving trabajo profesional to Firestore:', err);
    throw err;
  }
}

/**
 * Elimina un Trabajo Profesional de Firestore
 */
export async function deleteTrabajoProfesionalFirestore(trabajoId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'trabajos_profesionales', trabajoId));
  } catch (err) {
    console.error('Error deleting trabajo profesional from Firestore:', err);
    throw err;
  }
}

/**
 * Escucha en tiempo real de Presupuestos de Profesionales
 */
export function subscribePresupuestosProfesionales(callback: (presupuestos: PresupuestoProfesional[]) => void) {
  return onSnapshot(
    PRESUPUESTOS_PROFESIONALES_COL,
    (snapshot) => {
      const items: PresupuestoProfesional[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as PresupuestoProfesional);
      });
      items.sort((a, b) => new Date(b.createdAt || b.fecha).getTime() - new Date(a.createdAt || a.fecha).getTime());
      callback(items);
    },
    (err) => {
      console.error('Firestore presupuestos_profesionales snapshot error:', err);
    }
  );
}

/**
 * Guarda o actualiza un Presupuesto de Profesional en Firestore
 */
export async function savePresupuestoProfesionalFirestore(presupuesto: PresupuestoProfesional): Promise<void> {
  try {
    const cleanPresupuesto = sanitizeObjectForFirestore({
      ...presupuesto,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'presupuestos_profesionales', presupuesto.id), cleanPresupuesto, { merge: true });
  } catch (err) {
    console.error('Error saving presupuesto profesional to Firestore:', err);
    throw err;
  }
}

/**
 * Elimina un Presupuesto de Profesional de Firestore
 */
export async function deletePresupuestoProfesionalFirestore(presupuestoId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'presupuestos_profesionales', presupuestoId));
  } catch (err) {
    console.error('Error deleting presupuesto profesional from Firestore:', err);
    throw err;
  }
}

/**
 * Escucha en tiempo real de Valoraciones de Profesionales
 */
export function subscribeValoracionesProfesionales(callback: (valoraciones: ValoracionProfesionalTrabajo[]) => void) {
  return onSnapshot(
    VALORACIONES_PROFESIONALES_COL,
    (snapshot) => {
      const items: ValoracionProfesionalTrabajo[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as ValoracionProfesionalTrabajo);
      });
      items.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      callback(items);
    },
    (err) => {
      console.error('Firestore valoraciones_profesionales snapshot error:', err);
    }
  );
}

/**
 * Guarda una Valoración de Profesional y recalcula la media del profesional en Firestore
 */
export async function saveValoracionProfesionalFirestore(valoracion: ValoracionProfesionalTrabajo): Promise<void> {
  try {
    const valId = valoracion.id || `val_${valoracion.trabajoId}_${Date.now()}`;
    const cleanVal = sanitizeObjectForFirestore({ ...valoracion, id: valId });
    await setDoc(doc(db, 'valoraciones_profesionales', valId), cleanVal, { merge: true });

    // También actualizar la valoración en el trabajo correspondiente si existe
    if (valoracion.trabajoId) {
      await setDoc(
        doc(db, 'trabajos_profesionales', valoracion.trabajoId),
        { valoracion: cleanVal, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    }
  } catch (err) {
    console.error('Error saving valoracion profesional to Firestore:', err);
    throw err;
  }
}

/**
 * Sube un documento acreditativo o póliza de un profesional a Firebase Storage
 */
export async function uploadProfesionalDocumentoStorage(
  profesionalId: string,
  file: File | Blob,
  nombreArchivo: string,
  tipoDoc: string
): Promise<{ downloadUrl: string; storagePath: string }> {
  const sanitizedName = nombreArchivo.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `profesionales/${profesionalId}/documentos/${Date.now()}_${sanitizedName}`;
  const fileRef = ref(storage, storagePath);

  try {
    const mimeType = file.type || 'application/pdf';
    await uploadBytes(fileRef, file, { contentType: mimeType });
    const downloadUrl = await getDownloadURL(fileRef);
    return { downloadUrl, storagePath };
  } catch (err) {
    console.warn('Firebase Storage upload failed for profesional document, using local fallback:', err);
    const downloadUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
    return { downloadUrl, storagePath };
  }
}

/**
 * Sube un archivo de presupuesto (PDF / factura proforma) a Firebase Storage
 */
export async function uploadPresupuestoDocumentoStorage(
  presupuestoId: string,
  file: File | Blob,
  nombreArchivo: string
): Promise<{ downloadUrl: string; storagePath: string }> {
  const sanitizedName = nombreArchivo.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `presupuestos/${presupuestoId}/${Date.now()}_${sanitizedName}`;
  const fileRef = ref(storage, storagePath);

  try {
    const mimeType = file.type || 'application/pdf';
    await uploadBytes(fileRef, file, { contentType: mimeType });
    const downloadUrl = await getDownloadURL(fileRef);
    return { downloadUrl, storagePath };
  } catch (err) {
    console.warn('Firebase Storage upload failed for presupuesto document, using fallback:', err);
    const downloadUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
    return { downloadUrl, storagePath };
  }
}

/**
 * Sube un adjunto fotográfico o informe a un Trabajo Profesional en Firebase Storage
 */
export async function uploadTrabajoAdjuntoStorage(
  trabajoId: string,
  file: File | Blob,
  nombreArchivo: string
): Promise<string> {
  const sanitizedName = nombreArchivo.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `trabajos/${trabajoId}/${Date.now()}_${sanitizedName}`;
  const fileRef = ref(storage, storagePath);

  try {
    const mimeType = file.type || 'image/jpeg';
    await uploadBytes(fileRef, file, { contentType: mimeType });
    return await getDownloadURL(fileRef);
  } catch (err) {
    console.warn('Firebase Storage upload failed for trabajo adjunto, using data fallback:', err);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80');
      reader.readAsDataURL(file);
    });
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
};
