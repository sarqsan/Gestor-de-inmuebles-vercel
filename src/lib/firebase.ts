import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  writeBatch,
  runTransaction,
  query,
  where,
  type Unsubscribe,
  type QuerySnapshot,
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
  GastoRecurrente,
  Prestamo,
  ExpedienteRecomercializacion,
  InmobiliariaDirectorio,
  PropuestaInmobiliaria,
  LeadInmobiliario,
  Incidencia,
  TareaMantenimiento,
  GarantiaReparacion,
  TrabajoProfesional,
  PresupuestoProfesional,
  ValoracionProfesionalTrabajo,
  NecesidadReforma,
  ProyectoReforma,
  ElementoInventario,
  HabitacionInmueble,
  PolizaSeguro,
  Siniestro,
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
import type { Financiacion } from '../types/financiacion';
import type {
  Factura,
  RegistroFacturacion,
  EnvioVerifactu,
  SerieFacturacion,
} from '../types/facturacion';
import type { FacturaElectronicaB2B } from '../types/facturaElectronicaB2B';
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
const GASTOS_RECURRENTES_COL = collection(db, 'gastos_recurrentes');
const PRESTAMOS_COL = collection(db, 'prestamos');
// FASE 3 — Recomercialización inteligente
const EXPEDIENTES_RECOMERCIALIZACION_COL = collection(db, 'expedientes_recomercializacion');
const INMOBILIARIAS_DIRECTORIO_COL = collection(db, 'inmobiliarias_directorio');
const PROPUESTAS_INMOBILIARIA_COL = collection(db, 'propuestas_inmobiliaria');
const LEADS_INMOBILIARIOS_COL = collection(db, 'leads_inmobiliario');
const INCIDENCIAS_COL = collection(db, 'incidencias');
const TAREAS_MANTENIMIENTO_COL = collection(db, 'tareas_mantenimiento');
export const GARANTIAS_REPARACION_COL = collection(db, 'garantias_reparacion');
const ASEGURADORAS_COL = collection(db, 'configuracion_aseguradoras');
const SOLICITUDES_SEGURO_COL = collection(db, 'solicitudes_seguro_impago');
export const POLIZAS_SEGUROS_COL = collection(db, 'polizas_seguros');
export const SINIESTROS_COL = collection(db, 'siniestros');
export const TRABAJOS_PROFESIONALES_COL = collection(db, 'trabajos_profesionales');
export const PRESUPUESTOS_PROFESIONALES_COL = collection(db, 'presupuestos_profesionales');
export const VALORACIONES_PROFESIONALES_COL = collection(db, 'valoraciones_profesionales');
export const NECESIDADES_REFORMA_COL = collection(db, 'necesidades_reforma');
export const PROYECTOS_REFORMA_COL = collection(db, 'proyectos_reforma');
export const INVENTARIO_COL = collection(db, 'inventario_inmuebles');
export const INVENTARIO_HISTORIAL_COL = collection(db, 'inventario_historial');
export const HABITACIONES_COL = collection(db, 'habitaciones_inmueble');
export const FINANCIACIONES_COL = collection(db, 'financiaciones');

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
  /**
   * D2b — RESERVADO, sin efecto en D2a. Propietarios cuyas carteras están en
   * gestión ACTIVA (`gestiones_cartera`). Cuando D2b se implemente, los
   * suscriptores con ámbito añadirán
   * `where('propietarioId', 'in', scope.propietariosGestionados)` a la unión
   * sin rehacer el suscriptor. D2a NO resuelve `gestiones_cartera` aquí.
   */
  propietariosGestionados?: string[];
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
 * D2a/D2b — Fusión "propios ∪ autorizados explícitos ∪ carteras gestionadas"
 * sin duplicados.
 *
 * Fuentes (todas demostrables para las reglas):
 * · `propietarioId` (titularidad): `where('propietarioId','==', pid)` — la
 *   ÚNICA condición que las reglas pueden demostrar para un `list` (mismo
 *   criterio que `contratoEsMio`: el valor se obtiene con un `get` de ruta
 *   fija que el motor trata como constante).
 * · `autorizadoIds` (inmuebleIds explícitos): listeners DOCUMENTO A DOCUMENTO
 *   (`onSnapshot(doc(...))`). La pertenencia a un array no es demostrable
 *   para una consulta `list`; el `get` sí admite `hasAny([...])`.
 * · `gestionadoIds` (D2b — propietarioIds de carterasL ∪ carterasE): UN
 *   listener de igualdad POR PROPIETARIO. No se usa `where('in', ...)`: el
 *   motor no puede demostrar la pertenencia de un conjunto literal contra la
 *   lista constante del espejo; pid a pid, cada consulta sí lo es.
 *
 * Cada fuente mantiene su propio mapa y la unión se notifica deduplicada por
 * id de documento en cada cambio.
 */
function subscribeUnionInmuebles(
  callback: (inmuebles: Inmueble[]) => void,
  opts: { propietarioId?: string; autorizadoIds: string[]; gestionadoIds: string[] }
): Unsubscribe {
  const porFuente = new Map<string, Map<string, Inmueble>>();
  const fuentes: Unsubscribe[] = [];

  const notificar = () => {
    const union = new Map<string, Inmueble>();
    porFuente.forEach((fuente) => fuente.forEach((v, k) => union.set(k, v)));
    callback(Array.from(union.values()));
  };

  const escucharPorPropietario = (clave: string, pid: string) => {
    fuentes.push(
      onSnapshot(
        query(INMUEBLES_COL, where('propietarioId', '==', pid)),
        (snap) => {
          const parcial = new Map<string, Inmueble>();
          snap.forEach((ds) => parcial.set(ds.id, { id: ds.id, ...ds.data() } as Inmueble));
          porFuente.set(clave, parcial);
          notificar();
        },
        (err) => {
          console.error(`Firestore inmuebles (${clave}) snapshot error:`, err);
        }
      )
    );
  };

  if (opts.propietarioId) escucharPorPropietario('propios', opts.propietarioId);

  // D2b: carteras gestionadas, un listener por propietario gestionado. Un
  // propietario que además gestiona carteras recibe la unión completa.
  for (const pid of opts.gestionadoIds) {
    if (pid && pid !== opts.propietarioId) escucharPorPropietario(`gestion:${pid}`, pid);
  }

  for (const inmuebleId of opts.autorizadoIds) {
    fuentes.push(
      onSnapshot(
        doc(db, 'inmuebles', inmuebleId),
        (ds) => {
          const autorizados = porFuente.get('autorizados') ?? new Map<string, Inmueble>();
          if (ds.exists()) {
            autorizados.set(inmuebleId, { id: ds.id, ...ds.data() } as Inmueble);
          } else {
            autorizados.delete(inmuebleId);
          }
          porFuente.set('autorizados', autorizados);
          notificar();
        },
        (err) => {
          console.error(`Firestore inmueble autorizado ${inmuebleId} snapshot error:`, err);
        }
      )
    );
  }

  return () => fuentes.forEach((unsub) => unsub());
}

/**
 * Real-time listener for Inmuebles.
 *
 * D2a — suscripción con ámbito (cierre de F5-1): el acceso server-side deja
 * de ser "autenticado no-tenant ⇒ colección completa".
 * D2b — se completa la parte reservada: `scope.propietariosGestionados`
 * (propietarioIds de las carteras en gestión autorizada, proyección D1R que
 * sólo el master escribe en el espejo `usuarios_auth/{uid}`).
 *
 * · PROPIETARIO: propios ∪ autorizados explícitos ∪ carteras gestionadas.
 * · PROFESIONAL (y cualquier perfil no titular): SOLO autorizados explícitos
 *   y carteras gestionadas; sin ellos, vacío. Nunca la colección completa.
 * · ADMINISTRADOR / sin ámbito: colección completa (ámbito administrativo
 *   legítimo ya existente, sin ampliación).
 *
 * La gestión de carteras NO modifica titularidad ni concede escritura más
 * allá de carterasE (reglas de `inmuebles/update`).
 */
export function subscribeInmuebles(
  callback: (inmuebles: Inmueble[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  const autorizados = Array.from(
    new Set((scope?.inmuebleIds ?? []).filter((id) => typeof id === 'string' && id.length > 0))
  );
  const gestionados = Array.from(
    new Set(
      (scope?.propietariosGestionados ?? []).filter((id) => typeof id === 'string' && id.length > 0)
    )
  );

  // A) PROPIETARIO — propios ∪ autorizados ∪ carteras gestionadas.
  if (scope?.tipoPerfil === 'PROPIETARIO') {
    const pid = scope.propietarioId;
    if (!pid && autorizados.length === 0 && gestionados.length === 0) {
      callback([]);
      return () => {};
    }
    return subscribeUnionInmuebles(callback, { propietarioId: pid, autorizadoIds: autorizados, gestionadoIds: gestionados });
  }

  // B) Cualquier otro perfil conocido no administrativo (PROFESIONAL,
  //    INQUILINO, …): sin acceso a la colección; solo autorización explícita
  //    o carteras gestionadas.
  if (scope?.tipoPerfil && scope.tipoPerfil !== 'ADMINISTRADOR') {
    if (autorizados.length === 0 && gestionados.length === 0) {
      callback([]);
      return () => {};
    }
    return subscribeUnionInmuebles(callback, { autorizadoIds: autorizados, gestionadoIds: gestionados });
  }

  // C) ADMINISTRADOR / sin ámbito — colección completa (comportamiento
  //    administrativo legítimo conservado tal cual).
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
    // R3: espejo público mínimo (mejor esfuerzo: nunca rompe el guardado principal).
    try {
      const ficha = buildFichaPublicaInmueble(inmueble);
      if (ficha) await saveFichaPublicaInmueble(ficha);
    } catch (errMirror) {
      console.warn('No se pudo actualizar la ficha pública del inmueble:', errMirror);
    }
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
    // R3: la ficha pública no debe sobrevivir al documento (mejor esfuerzo).
    try {
      await deleteFichaPublicaInmueble(inmuebleId);
    } catch (errMirror) {
      console.warn('No se pudo eliminar la ficha pública del inmueble:', errMirror);
    }
  } catch (err) {
    console.error('Error deleting inmueble from Firestore:', err);
  }
}

import { compressImageForUpload } from '../utils/fileCompressor';
import { buildFichaPublicaInmueble, deleteFichaPublicaInmueble, saveFichaPublicaInmueble } from './fichaPublicaInmueble';

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
      ...(slotData.habitacionId ? { habitacionId: slotData.habitacionId } : {}),
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
    const refC = doc(db, 'contratos_formalizacion', contrato.id);
    const existing = await getDoc(refC);
    if (existing.exists()) {
      const prev = existing.data() as ContratoFormalizacion;
      if (prev.habitacionId && contrato.habitacionId && prev.habitacionId !== contrato.habitacionId) {
        throw new Error('No se puede reasignar habitacionId de un contrato activo.');
      }
      if (prev.inmuebleId && contrato.inmuebleId && prev.inmuebleId !== contrato.inmuebleId) {
        throw new Error('No se puede reasignar inmuebleId de un contrato.');
      }
    }
    const cleanContrato = sanitizeObjectForFirestore(contrato);
    await setDoc(refC, cleanContrato, { merge: true });
  } catch (err) {
    console.error('Error saving contrato formalizacion to Firestore:', err);
    throw err;
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
 * Listener de plantillas de gastos recurrentes con el mismo aislamiento que los
 * gastos: profesionales sin datos, propietario por where('propietarioId','=='),
 * administrador con la colección completa.
 */
export function subscribeGastosRecurrentes(
  callback: (plantillas: GastoRecurrente[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  if (scope?.tipoPerfil === 'PROFESIONAL') {
    callback([]);
    return () => {};
  }
  if (!scope || scope.tipoPerfil !== 'PROPIETARIO') {
    return onSnapshot(
      GASTOS_RECURRENTES_COL,
      (snapshot) => {
        const items: GastoRecurrente[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() } as GastoRecurrente);
        });
        callback(items);
      },
      (err) => {
        console.error('Firestore gastos_recurrentes snapshot error:', err);
      }
    );
  }
  const pid = scope.propietarioId;
  if (!pid) {
    callback([]);
    return () => {};
  }
  const scopedQuery = query(GASTOS_RECURRENTES_COL, where('propietarioId', '==', pid));
  return onSnapshot(
    scopedQuery,
    (snap) => {
      const items: GastoRecurrente[] = [];
      snap.forEach((ds) => {
        items.push({ id: ds.id, ...ds.data() } as GastoRecurrente);
      });
      callback(items);
    },
    (err) => {
      console.error('Firestore gastos_recurrentes (scoped) snapshot error:', err);
    }
  );
}

export async function saveGastoRecurrenteFirestore(plantilla: GastoRecurrente) {
  try {
    const clean = sanitizeObjectForFirestore(plantilla);
    await setDoc(doc(db, 'gastos_recurrentes', plantilla.id), clean, { merge: true });
  } catch (err) {
    console.error('Error saving gasto recurrente to Firestore:', err);
  }
}

export async function deleteGastoRecurrenteFirestore(plantillaId: string) {
  try {
    // No se eliminan los apuntes ya materializados: se conserva el histórico.
    await deleteDoc(doc(db, 'gastos_recurrentes', plantillaId));
  } catch (err) {
    console.error('Error deleting gasto recurrente from Firestore:', err);
  }
}

// ============================================================
// FASE 2.3 — PRÉSTAMOS / HIPOTECAS (condiciones financieras)
// ============================================================

export function subscribePrestamos(
  callback: (prestamos: Prestamo[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  if (scope?.tipoPerfil === 'PROFESIONAL') {
    callback([]);
    return () => {};
  }
  if (!scope || scope.tipoPerfil !== 'PROPIETARIO') {
    return onSnapshot(
      PRESTAMOS_COL,
      (snapshot) => {
        const items: Prestamo[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() } as Prestamo);
        });
        callback(items);
      },
      (err) => {
        console.error('Firestore prestamos snapshot error:', err);
      }
    );
  }
  const pid = scope.propietarioId;
  if (!pid) {
    callback([]);
    return () => {};
  }
  const scopedQuery = query(PRESTAMOS_COL, where('propietarioId', '==', pid));
  return onSnapshot(
    scopedQuery,
    (snap) => {
      const items: Prestamo[] = [];
      snap.forEach((ds) => {
        items.push({ id: ds.id, ...ds.data() } as Prestamo);
      });
      callback(items);
    },
    (err) => {
      console.error('Firestore prestamos (scoped) snapshot error:', err);
    }
  );
}

export async function savePrestamoFirestore(prestamo: Prestamo) {
  try {
    const clean = sanitizeObjectForFirestore(prestamo);
    await setDoc(doc(db, 'prestamos', prestamo.id), clean, { merge: true });
  } catch (err) {
    console.error('Error saving prestamo to Firestore:', err);
  }
}

export async function deletePrestamoFirestore(prestamoId: string) {
  try {
    await deleteDoc(doc(db, 'prestamos', prestamoId));
  } catch (err) {
    console.error('Error deleting prestamo from Firestore:', err);
  }
}

// ============================================================
// FASE 3.0 — RECOMERCIALIZACIÓN INTELIGENTE
// Suscripción genérica aislada por propietario (patrón de
// contratos/gastos): profesionales sin datos, propietario con
// where('propietarioId','==', pid), administrador con todo.
// ============================================================
function subscribeColeccionPropietario<T extends { id: string }>(
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
  return onSnapshot(query(col, where('propietarioId', '==', pid)), mapear, onError);
}

// ---- Expedientes de recomercialización ----
export function subscribeExpedientesRecomercializacion(
  callback: (items: ExpedienteRecomercializacion[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<ExpedienteRecomercializacion>(
    EXPEDIENTES_RECOMERCIALIZACION_COL,
    callback,
    scope,
    'expedientes_recomercializacion'
  );
}
export async function saveExpedienteRecomercializacionFirestore(item: ExpedienteRecomercializacion) {
  try {
    await setDoc(
      doc(db, 'expedientes_recomercializacion', item.id),
      sanitizeObjectForFirestore(item),
      { merge: true }
    );
  } catch (err) {
    console.error('Error saving expediente recomercializacion:', err);
  }
}
export async function deleteExpedienteRecomercializacionFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'expedientes_recomercializacion', id));
  } catch (err) {
    console.error('Error deleting expediente recomercializacion:', err);
  }
}

// ---- Directorio de inmobiliarias (lectura propietario+admin; escritura admin) ----
export function subscribeInmobiliarias(
  callback: (items: InmobiliariaDirectorio[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  // El directorio lo consultan administrador y propietario (bolsa para delegar);
  // los profesionales no participan en la comercialización.
  if (scope?.tipoPerfil === 'PROFESIONAL') {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    INMOBILIARIAS_DIRECTORIO_COL,
    (snap) => {
      const items: InmobiliariaDirectorio[] = [];
      snap.forEach((ds) => items.push({ id: ds.id, ...ds.data() } as InmobiliariaDirectorio));
      callback(items);
    },
    (err) => console.error('Firestore inmobiliarias_directorio snapshot error:', err)
  );
}
export async function saveInmobiliariaFirestore(item: InmobiliariaDirectorio) {
  try {
    await setDoc(doc(db, 'inmobiliarias_directorio', item.id), sanitizeObjectForFirestore(item), {
      merge: true,
    });
  } catch (err) {
    console.error('Error saving inmobiliaria:', err);
  }
}
export async function deleteInmobiliariaFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'inmobiliarias_directorio', id));
  } catch (err) {
    console.error('Error deleting inmobiliaria:', err);
  }
}

// ---- Propuestas de inmobiliarias (RFP) ----
export function subscribePropuestasInmobiliaria(
  callback: (items: PropuestaInmobiliaria[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<PropuestaInmobiliaria>(
    PROPUESTAS_INMOBILIARIA_COL,
    callback,
    scope,
    'propuestas_inmobiliaria'
  );
}
export async function savePropuestaInmobiliariaFirestore(item: PropuestaInmobiliaria) {
  try {
    await setDoc(doc(db, 'propuestas_inmobiliaria', item.id), sanitizeObjectForFirestore(item), {
      merge: true,
    });
  } catch (err) {
    console.error('Error saving propuesta inmobiliaria:', err);
  }
}
export async function deletePropuestaInmobiliariaFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'propuestas_inmobiliaria', id));
  } catch (err) {
    console.error('Error deleting propuesta inmobiliaria:', err);
  }
}

// ---- Leads de intermediación ----
export function subscribeLeadsInmobiliarios(
  callback: (items: LeadInmobiliario[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<LeadInmobiliario>(
    LEADS_INMOBILIARIOS_COL,
    callback,
    scope,
    'leads_inmobiliario'
  );
}
export async function saveLeadInmobiliarioFirestore(item: LeadInmobiliario) {
  try {
    await setDoc(doc(db, 'leads_inmobiliario', item.id), sanitizeObjectForFirestore(item), {
      merge: true,
    });
  } catch (err) {
    console.error('Error saving lead inmobiliario:', err);
  }
}
export async function deleteLeadInmobiliarioFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'leads_inmobiliario', id));
  } catch (err) {
    console.error('Error deleting lead inmobiliario:', err);
  }
}

// ============================================================
// BLOQUE 4 — INCIDENCIAS Y MANTENIMIENTO
// Aislamiento por propietarioId (patrón de contratos/gastos). Los
// profesionales también necesitan ver sus órdenes ASIGNADAS: se
// resuelve en la regla con where('profesionalAsignadoId','==', id).
// ============================================================
export function subscribeIncidencias(
  callback: (items: Incidencia[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<Incidencia>(
    INCIDENCIAS_COL,
    callback,
    scope,
    'incidencias'
  );
}
export async function saveIncidenciaFirestore(item: Incidencia) {
  try {
    await setDoc(doc(db, 'incidencias', item.id), sanitizeObjectForFirestore(item), { merge: true });
  } catch (err) {
    console.error('Error saving incidencia:', err);
  }
}
export async function deleteIncidenciaFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'incidencias', id));
  } catch (err) {
    console.error('Error deleting incidencia:', err);
  }
}

export function subscribeTareasMantenimiento(
  callback: (items: TareaMantenimiento[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<TareaMantenimiento>(
    TAREAS_MANTENIMIENTO_COL,
    callback,
    scope,
    'tareas_mantenimiento'
  );
}
export async function saveTareaMantenimientoFirestore(item: TareaMantenimiento) {
  try {
    await setDoc(doc(db, 'tareas_mantenimiento', item.id), sanitizeObjectForFirestore(item), {
      merge: true,
    });
  } catch (err) {
    console.error('Error saving tarea mantenimiento:', err);
  }
}
export async function deleteTareaMantenimientoFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'tareas_mantenimiento', id));
  } catch (err) {
    console.error('Error deleting tarea mantenimiento:', err);
  }
}

export function subscribeGarantiasReparacion(
  callback: (items: GarantiaReparacion[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<GarantiaReparacion>(
    GARANTIAS_REPARACION_COL,
    callback,
    scope,
    'garantias_reparacion'
  );
}

export async function saveGarantiaReparacionFirestore(item: GarantiaReparacion) {
  try {
    await setDoc(doc(db, 'garantias_reparacion', item.id), sanitizeObjectForFirestore(item), {
      merge: true,
    });
  } catch (err) {
    console.error('Error saving garantia reparacion:', err);
  }
}

export async function deleteGarantiaReparacionFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'garantias_reparacion', id));
  } catch (err) {
    console.error('Error deleting garantia reparacion:', err);
  }
}

// =========================================================================
// REFORMAS: NECESIDADES Y PROYECTOS DE REFORMA
// =========================================================================

export function subscribeNecesidadesReforma(
  callback: (items: NecesidadReforma[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<NecesidadReforma>(
    NECESIDADES_REFORMA_COL,
    callback,
    scope,
    'necesidades_reforma'
  );
}

export async function saveNecesidadReformaFirestore(item: NecesidadReforma) {
  try {
    await setDoc(doc(db, 'necesidades_reforma', item.id), sanitizeObjectForFirestore(item), {
      merge: true,
    });
  } catch (err) {
    console.error('Error saving necesidad de reforma:', err);
    throw err;
  }
}

export async function deleteNecesidadReformaFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'necesidades_reforma', id));
  } catch (err) {
    console.error('Error deleting necesidad de reforma:', err);
    throw err;
  }
}

export function subscribeProyectosReforma(
  callback: (items: ProyectoReforma[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<ProyectoReforma>(
    PROYECTOS_REFORMA_COL,
    callback,
    scope,
    'proyectos_reforma'
  );
}

export async function saveProyectoReformaFirestore(item: ProyectoReforma) {
  try {
    await setDoc(doc(db, 'proyectos_reforma', item.id), sanitizeObjectForFirestore(item), {
      merge: true,
    });
  } catch (err) {
    console.error('Error saving proyecto de reforma:', err);
    throw err;
  }
}

export async function deleteProyectoReformaFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'proyectos_reforma', id));
  } catch (err) {
    console.error('Error deleting proyecto de reforma:', err);
    throw err;
  }
}

export async function uploadReformaAdjuntoStorage(
  proyectoId: string,
  file: File | Blob,
  fileName: string,
  propietarioId?: string
): Promise<{ url: string; storagePath: string }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ownerSeg = (propietarioId || 'sin_asignar').replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `reformas_documentos/${ownerSeg}/${proyectoId}/${Date.now()}_${safeName}`;
  const mime =
    (file as File).type ||
    (safeName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

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
  } catch (err) {
    console.warn('Storage upload error / timeout, using fallback data URL:', err);
  }

  // Fallback seguro a data URL local
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ url: reader.result as string, storagePath });
    reader.onerror = () => resolve({ url: '', storagePath });
    reader.readAsDataURL(file);
  });
}

// ============================================================
// FASE 2.2 — FACTURAS / JUSTIFICANTES DE GASTOS en Storage
// Ruta: gastos_facturas/{propietarioId}/{gastoId}/{archivo}
// ============================================================

export async function uploadFacturaGasto(
  gastoId: string,
  file: File | Blob,
  fileName: string,
  propietarioId?: string
): Promise<{ url: string; storagePath: string }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ownerSeg = (propietarioId || 'sin_asignar').replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `gastos_facturas/${ownerSeg}/${gastoId}/${Date.now()}_${safeName}`;
  const mime =
    (file as File).type ||
    (safeName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

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
    console.warn('Timeout subiendo la factura del gasto a Firebase Storage.');
  } catch (err) {
    console.warn('Firebase Storage no disponible para la factura del gasto:', err);
  }

  // Respaldo por el endpoint del servidor (igual que los justificantes de cobro).
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
      body: JSON.stringify({ fileBase64: dataURL, filename: fileName, mimeType: mime, itemId: gastoId }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.url) {
        return { url: json.url as string, storagePath: (json.storagePath as string) || storagePath };
      }
    }
  } catch (serverErr) {
    console.warn('Falló también la subida de la factura por servidor:', serverErr);
  }

  throw new Error('No se ha podido almacenar la factura. Revisa la conexión e inténtalo de nuevo.');
}

export async function deleteFacturaGastoStorage(storagePath?: string): Promise<void> {
  if (!storagePath || storagePath.startsWith('local_') || storagePath.startsWith('server_')) {
    return;
  }
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (err) {
    console.warn('No se pudo eliminar la factura de Storage:', err);
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

// ============================================================
// FASE 3.2 — FOTOGRAFÍAS DE INSPECCIÓN (recomercialización)
// Ruta privada por propietario y expediente:
//   recomercializacion_fotos/{propietarioId}/{expedienteId}/{archivo}
// A diferencia de las imágenes de catálogo, estas fotos son documentos de
// trabajo internos (estado/deterioro) y NO se leen públicamente. Tampoco se
// usa fallback base64: un expediente acumula muchas fotos y un data URL
// inflaría el documento de Firestore por encima de su límite de 1 MB. Si
// Storage falla, se lanza el error y la UI ofrece reintentar.
// ============================================================

export async function uploadFotoInspeccionStorage(
  propietarioId: string,
  expedienteId: string,
  estancia: string,
  blob: Blob,
  fileName: string
): Promise<{ url: string; storagePath: string }> {
  const ownerSeg = (propietarioId || 'sin_asignar').replace(/[^a-zA-Z0-9._-]/g, '_');
  const expSeg = (expedienteId || 'exp').replace(/[^a-zA-Z0-9._-]/g, '_');
  const estSeg = (estancia || 'otro').replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeName = (fileName || 'foto.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const rand = Math.random().toString(36).substring(2, 6);
  const storagePath = `recomercializacion_fotos/${ownerSeg}/${expSeg}/${estSeg}_${Date.now()}_${rand}_${safeName}`;

  const fileRef = ref(storage, storagePath);
  const uploadWork = (async () => {
    await uploadBytes(fileRef, blob, { contentType: blob.type || 'image/jpeg' });
    return getDownloadURL(fileRef);
  })();

  // 20 s: las inspecciones pueden incluir varias fotos con conexión lenta.
  const timeoutGuard = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000));
  const url = await Promise.race([uploadWork, timeoutGuard]);
  if (!url || typeof url !== 'string') {
    throw new Error('La subida de la fotografía ha tardado demasiado. Revisa la conexión e inténtalo de nuevo.');
  }
  return { url, storagePath };
}

export async function deleteFotoInspeccionStorage(storagePath?: string): Promise<void> {
  if (!storagePath) return;
  // Nunca borrar referencias locales/efímeras ni URLs http directas.
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
    // El objeto puede ya no existir; no debe bloquear la baja del metadato.
    console.warn('No se pudo eliminar la foto de inspección de Storage:', err);
  }
}

// ============================================================
// BLOQUE 4 — FOTOGRAFÍAS DE INCIDENCIAS
// Ruta privada: incidencias_fotos/{propietarioId}/{incidenciaId}/{archivo}
// Documentos internos de trabajo (desperfectos), nunca públicos.
// ============================================================
export async function uploadFotoIncidenciaStorage(
  propietarioId: string,
  incidenciaId: string,
  blob: Blob,
  fileName: string
): Promise<{ url: string; storagePath: string }> {
  const ownerSeg = (propietarioId || 'sin_asignar').replace(/[^a-zA-Z0-9._-]/g, '_');
  const incSeg = (incidenciaId || 'inc').replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeName = (fileName || 'foto.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const rand = Math.random().toString(36).substring(2, 6);
  const storagePath = `incidencias_fotos/${ownerSeg}/${incSeg}/${Date.now()}_${rand}_${safeName}`;

  const fileRef = ref(storage, storagePath);
  const uploadWork = (async () => {
    await uploadBytes(fileRef, blob, { contentType: blob.type || 'image/jpeg' });
    return getDownloadURL(fileRef);
  })();
  const timeoutGuard = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000));
  const url = await Promise.race([uploadWork, timeoutGuard]);
  if (!url || typeof url !== 'string') {
    throw new Error('La subida de la fotografía ha tardado demasiado. Revisa la conexión e inténtalo de nuevo.');
  }
  return { url, storagePath };
}

export async function deleteFotoIncidenciaStorage(storagePath?: string): Promise<void> {
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
    console.warn('No se pudo eliminar la foto de incidencia de Storage:', err);
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

// =========================================================================
// PÓLIZAS DE SEGUROS Y SINIESTROS
// =========================================================================

export function subscribePolizas(callback: (items: PolizaSeguro[]) => void): Unsubscribe {
  return onSnapshot(
    POLIZAS_SEGUROS_COL,
    (snapshot) => {
      const items: PolizaSeguro[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as PolizaSeguro);
      });
      items.sort((a, b) => new Date(b.createdAt || b.fechaInicio).getTime() - new Date(a.createdAt || a.fechaInicio).getTime());
      callback(items);
    },
    (err) => {
      console.error('Firestore polizas_seguros snapshot error:', err);
    }
  );
}

export const subscribePolizasSeguras = subscribePolizas;
export const subscribeGastosSeguros = subscribeGastos;

export async function savePolizaFirestore(poliza: PolizaSeguro): Promise<void> {
  try {
    const cleanPol = sanitizeObjectForFirestore({ ...poliza, updatedAt: new Date().toISOString() });
    await setDoc(doc(db, 'polizas_seguros', poliza.id), cleanPol, { merge: true });
  } catch (err) {
    console.error('Error saving poliza to Firestore:', err);
    throw err;
  }
}

export async function deletePolizaFirestore(polizaId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'polizas_seguros', polizaId));
  } catch (err) {
    console.error('Error deleting poliza from Firestore:', err);
    throw err;
  }
}

export function subscribeSiniestros(callback: (items: Siniestro[]) => void): Unsubscribe {
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

export async function saveSiniestroFirestore(siniestro: Siniestro): Promise<void> {
  try {
    const cleanSin = sanitizeObjectForFirestore({ ...siniestro, updatedAt: new Date().toISOString() });
    await setDoc(doc(db, 'siniestros', siniestro.id), cleanSin, { merge: true });
  } catch (err) {
    console.error('Error saving siniestro to Firestore:', err);
    throw err;
  }
}

export async function deleteSiniestroFirestore(siniestroId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'siniestros', siniestroId));
  } catch (err) {
    console.error('Error deleting siniestro from Firestore:', err);
    throw err;
  }
}

export async function uploadIncidenciaAdjuntoStorage(
  incidenciaId: string,
  file: File | Blob,
  nombreArchivo: string,
  tipo?: 'imagen' | 'video' | 'documento'
): Promise<string> {
  const sanitizedName = nombreArchivo.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `incidencias/${incidenciaId}/${Date.now()}_${sanitizedName}`;
  const fileRef = ref(storage, storagePath);

  try {
    const mimeType = file.type || (tipo === 'imagen' ? 'image/jpeg' : 'application/pdf');
    await uploadBytes(fileRef, file, { contentType: mimeType });
    return await getDownloadURL(fileRef);
  } catch (err) {
    console.warn('Firebase Storage upload failed for incidencia adjunto, fallback to data url:', err);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }
}

// =========================================================================
// TRABAJOS PROFESIONALES, PRESUPUESTOS Y VALORACIONES
// =========================================================================

export function subscribeTrabajosProfesionales(callback: (trabajos: TrabajoProfesional[]) => void): Unsubscribe {
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

export async function deleteTrabajoProfesionalFirestore(trabajoId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'trabajos_profesionales', trabajoId));
  } catch (err) {
    console.error('Error deleting trabajo profesional from Firestore:', err);
    throw err;
  }
}

export function subscribePresupuestosProfesionales(callback: (presupuestos: PresupuestoProfesional[]) => void): Unsubscribe {
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

export async function deletePresupuestoProfesionalFirestore(presupuestoId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'presupuestos_profesionales', presupuestoId));
  } catch (err) {
    console.error('Error deleting presupuesto profesional from Firestore:', err);
    throw err;
  }
}

/**
 * Valoraciones de trabajos profesionales, aisladas por propietario (patrón
 * `subscribeColeccionPropietario`): PROPIETARIO → where('propietarioId','==', pid)
 * (única consulta compatible con la regla `list`); PROFESIONAL → sin datos;
 * administrador/sin ámbito → colección completa. Sin orderBy: se ordena en cliente.
 */
export function subscribeValoracionesProfesionales(
  callback: (valoraciones: ValoracionProfesionalTrabajo[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<ValoracionProfesionalTrabajo & { id: string }>(
    VALORACIONES_PROFESIONALES_COL,
    (items) => {
      const ordenadas = [...items].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      callback(ordenadas);
    },
    scope,
    'valoraciones_profesionales'
  );
}

export async function saveValoracionProfesionalFirestore(valoracion: ValoracionProfesionalTrabajo): Promise<void> {
  try {
    const valId = valoracion.id || `val_${valoracion.trabajoId}_${Date.now()}`;
    const cleanVal = sanitizeObjectForFirestore({ ...valoracion, id: valId });
    await setDoc(doc(db, 'valoraciones_profesionales', valId), cleanVal, { merge: true });

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

export async function uploadProfesionalDocumentoStorage(
  profesionalId: string,
  file: File | Blob,
  nombreArchivo: string,
  _tipoDoc?: string
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
    console.warn('Firebase Storage upload failed for trabajo adjunto, using fallback:', err);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }
}

// =========================================================================
// INVENTARIO Y HABITACIONES (ARENA C)
// =========================================================================

export function subscribeInventarioInmueble(
  inmuebleId: string,
  callback: (items: ElementoInventario[]) => void
) {
  if (!inmuebleId) {
    callback([]);
    return () => undefined;
  }
  const qInv = query(INVENTARIO_COL, where('inmuebleId', '==', inmuebleId));
  return onSnapshot(
    qInv,
    (snapshot) => {
      const items: ElementoInventario[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as ElementoInventario);
      });
      items.sort(
        (a, b) => new Date(b.fechaModificacion).getTime() - new Date(a.fechaModificacion).getTime()
      );
      callback(items);
    },
    (err) => {
      console.error('Firestore inventario snapshot error:', err);
      callback([]);
    }
  );
}

export async function saveElementoInventarioFirestore(item: ElementoInventario): Promise<void> {
  const clean = sanitizeObjectForFirestore(item);
  await setDoc(doc(db, 'inventario_inmuebles', item.id), clean, { merge: true });
}

export async function deleteElementoInventarioFirestore(inventarioId: string): Promise<void> {
  await deleteDoc(doc(db, 'inventario_inmuebles', inventarioId));
}

export async function registrarHistorialInventarioFirestore(entry: {
  id?: string;
  inmuebleId: string;
  inventarioId?: string;
  fecha: string;
  usuarioId?: string;
  usuarioNombre: string;
  accion: string;
  elementoAfectado: string;
  cambios?: string;
}): Promise<void> {
  const id = entry.id || `invh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await setDoc(
    doc(db, 'inventario_historial', id),
    sanitizeObjectForFirestore({ ...entry, id }),
    { merge: false }
  );
}

export function subscribeHistorialInventario(
  inmuebleId: string,
  callback: (items: any[]) => void
) {
  if (!inmuebleId) {
    callback([]);
    return () => undefined;
  }
  const qHist = query(INVENTARIO_HISTORIAL_COL, where('inmuebleId', '==', inmuebleId));
  return onSnapshot(
    qHist,
    (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      items.sort(
        (a, b) => new Date(b.fecha || b.timestamp || 0).getTime() - new Date(a.fecha || a.timestamp || 0).getTime()
      );
      callback(items);
    },
    (err) => {
      console.error('Firestore historial inventario snapshot error:', err);
      callback([]);
    }
  );
}

export async function uploadInventarioAdjuntoStorage(
  inmuebleId: string,
  inventarioId: string,
  file: File | Blob,
  nombreArchivo: string
): Promise<{ downloadURL: string; storagePath: string }> {
  const sanitizedName = nombreArchivo.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `inmuebles/${inmuebleId}/inventario/${inventarioId}/${Date.now()}_${sanitizedName}`;
  const fileRef = ref(storage, storagePath);
  try {
    await uploadBytes(fileRef, file, { contentType: file.type || 'image/jpeg' });
    const downloadURL = await getDownloadURL(fileRef);
    return { downloadURL, storagePath };
  } catch (err) {
    console.warn('Storage inventario fallback:', err);
    const downloadURL = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
    return { downloadURL, storagePath };
  }
}

export function subscribeHabitacionesInmueble(
  inmuebleId: string,
  callback: (items: HabitacionInmueble[]) => void
) {
  if (!inmuebleId) {
    callback([]);
    return () => undefined;
  }
  const qHab = query(HABITACIONES_COL, where('inmuebleId', '==', inmuebleId));
  return onSnapshot(
    qHab,
    (snapshot) => {
      const items: HabitacionInmueble[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as HabitacionInmueble);
      });
      items.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      callback(items);
    },
    (err) => {
      console.error('Firestore habitaciones snapshot error:', err);
      callback([]);
    }
  );
}

export async function saveHabitacionFirestore(habitacion: HabitacionInmueble): Promise<void> {
  const refH = doc(db, 'habitaciones_inmueble', habitacion.id);
  const existing = await getDoc(refH);
  if (existing.exists()) {
    const prev = existing.data() as HabitacionInmueble;
    if (prev.inmuebleId && prev.inmuebleId !== habitacion.inmuebleId) {
      throw new Error('No se puede reasignar inmuebleId de una habitación.');
    }
  }
  const clean = sanitizeObjectForFirestore(habitacion);
  await setDoc(refH, clean, { merge: true });
}

/** Asignación atómica: solo un candidato puede quedar selectedCandidatoId. */
export async function asignarCandidatoHabitacionFirestore(
  habitacionId: string,
  candidatoId: string,
  usuarioNombre: string
): Promise<HabitacionInmueble> {
  const refH = doc(db, 'habitaciones_inmueble', habitacionId);
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(refH);
    if (!snap.exists()) throw new Error('La habitación no existe.');
    const prev = { id: snap.id, ...snap.data() } as HabitacionInmueble;
    if (prev.selectedCandidatoId && prev.selectedCandidatoId !== candidatoId) {
      throw new Error('Conflicto: la habitación ya está asignada a otro candidato.');
    }
    const next: HabitacionInmueble = {
      ...prev,
      selectedCandidatoId: candidatoId,
      fechaModificacion: new Date().toISOString(),
      actualizadoPor: usuarioNombre,
    };
    transaction.set(refH, sanitizeObjectForFirestore(next), { merge: true });
    return next;
  });
}

// =========================================================================
// GAP4 — FINANCIACIÓN HIPOTECARIA AVANZADA
// =========================================================================

/**
 * Suscripción en tiempo real de financiaciones.
 * La autorización/aislamiento real la aplica Firestore rules; aquí se devuelve
 * la lista y el ámbito (scoping) lo decide la UI igual que el resto de módulos.
 */
export function subscribeFinanciaciones(callback: (financiaciones: Financiacion[]) => void) {
  return onSnapshot(
    FINANCIACIONES_COL,
    (snapshot) => {
      const items: Financiacion[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Financiacion);
      });
      items.sort((a, b) => (b.fechaFormalizacion || '').localeCompare(a.fechaFormalizacion || ''));
      callback(items);
    },
    (err) => {
      console.error('Firestore financiaciones snapshot error:', err);
    }
  );
}

/**
 * Guarda o actualiza una Financiación. Sin secretos: `sanitizeObjectForFirestore`
 * elimina undefined y el modelo Financiacion no contempla credenciales.
 */
export async function saveFinanciacionFirestore(financiacion: Financiacion): Promise<void> {
  try {
    const clean = sanitizeObjectForFirestore({
      ...financiacion,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'financiaciones', financiacion.id), clean, { merge: true });
  } catch (err) {
    console.error('Error saving financiacion to Firestore:', err);
    throw err;
  }
}

/**
 * Elimina una financiación. La cancelación lógica (estado CANCELADA) es la vía
 * habitual; el borrado físico queda restringido por reglas a administrador.
 */
export async function deleteFinanciacionFirestore(financiacionId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'financiaciones', financiacionId));
  } catch (err) {
    console.error('Error deleting financiacion from Firestore:', err);
    throw err;
  }
}

// =========================================================================
// GAP7 — FACTURACIÓN Y VERI*FACTU (aislamiento por propietario; sin secretos)
// =========================================================================

export const FACTURAS_COL = collection(db, 'facturas');
export const REGISTROS_FACTURACION_COL = collection(db, 'registros_facturacion');
export const ENVIOS_VERIFACTU_COL = collection(db, 'envios_verifactu');
export const SERIES_FACTURACION_COL = collection(db, 'series_facturacion');

/**
 * Suscripción en tiempo real de facturas. La autorización/aislamiento real la
 * aplica Firestore rules; la UI aplica el ámbito igual que el resto de módulos.
 */
export function subscribeFacturas(callback: (facturas: Factura[]) => void) {
  return onSnapshot(
    FACTURAS_COL,
    (snapshot) => {
      const items: Factura[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Factura);
      });
      items.sort((a, b) => (b.fechaExpedicionUtc || '').localeCompare(a.fechaExpedicionUtc || ''));
      callback(items);
    },
    (err) => {
      console.error('Firestore facturas snapshot error:', err);
    }
  );
}

/** Guarda una factura. Sin secretos: modelo Factura no contempla credenciales. */
export async function saveFacturaFirestore(factura: Factura): Promise<void> {
  try {
    const clean = sanitizeObjectForFirestore({
      ...factura,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'facturas', factura.id), clean, { merge: true });
  } catch (err) {
    console.error('Error saving factura to Firestore:', err);
    throw err;
  }
}

export async function deleteFacturaFirestore(facturaId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'facturas', facturaId));
  } catch (err) {
    console.error('Error deleting factura from Firestore:', err);
    throw err;
  }
}

/** Suscripción en tiempo real de registros de facturación (RRSIF). */
export function subscribeRegistrosFacturacion(callback: (registros: RegistroFacturacion[]) => void) {
  return onSnapshot(
    REGISTROS_FACTURACION_COL,
    (snapshot) => {
      const items: RegistroFacturacion[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as RegistroFacturacion);
      });
      items.sort((a, b) => a.fechaHoraHusoGenRegistro.localeCompare(b.fechaHoraHusoGenRegistro));
      callback(items);
    },
    (err) => {
      console.error('Firestore registros_facturacion snapshot error:', err);
    }
  );
}

/**
 * Guarda un registro de facturación. El registro es INALTERABLE: una vez
 * existente, no se sobrescribe (merge: false) salvo que el documento no exista.
 */
export async function createRegistroFacturacionFirestore(registro: RegistroFacturacion): Promise<void> {
  try {
    const refReg = doc(db, 'registros_facturacion', registro.id);
    const existente = await getDoc(refReg);
    if (existente.exists()) {
      throw new Error('El registro de facturación ya existe y es inalterable.');
    }
    const clean = sanitizeObjectForFirestore(registro);
    await setDoc(refReg, clean, { merge: false });
  } catch (err) {
    console.error('Error creating registro_facturacion in Firestore:', err);
    throw err;
  }
}

/** Suscripción en tiempo real de envíos VERI*FACTU. */
export function subscribeEnviosVerifactu(callback: (envios: EnvioVerifactu[]) => void) {
  return onSnapshot(
    ENVIOS_VERIFACTU_COL,
    (snapshot) => {
      const items: EnvioVerifactu[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as EnvioVerifactu);
      });
      items.sort((a, b) => (b.fechaCreacion || '').localeCompare(a.fechaCreacion || ''));
      callback(items);
    },
    (err) => {
      console.error('Firestore envios_verifactu snapshot error:', err);
    }
  );
}

/** Crea o actualiza un envío VERI*FACTU conservando su identidad idempotente. */
export async function saveEnvioVerifactuFirestore(envio: EnvioVerifactu): Promise<void> {
  try {
    const clean = sanitizeObjectForFirestore(envio);
    await setDoc(doc(db, 'envios_verifactu', envio.id), clean, { merge: true });
  } catch (err) {
    console.error('Error saving envio_verifactu to Firestore:', err);
    throw err;
  }
}

/** Suscripción en tiempo real de series de facturación. */
export function subscribeSeriesFacturacion(callback: (series: SerieFacturacion[]) => void) {
  return onSnapshot(
    SERIES_FACTURACION_COL,
    (snapshot) => {
      const items: SerieFacturacion[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as SerieFacturacion);
      });
      items.sort((a, b) => `${b.ejercicio}-${b.codigo}`.localeCompare(`${a.ejercicio}-${a.codigo}`));
      callback(items);
    },
    (err) => {
      console.error('Firestore series_facturacion snapshot error:', err);
    }
  );
}

/** Guarda o actualiza una serie de facturación (avanza la correlación). */
export async function saveSerieFacturacionFirestore(serie: SerieFacturacion): Promise<void> {
  try {
    const clean = sanitizeObjectForFirestore({
      ...serie,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'series_facturacion', serie.id), clean, { merge: true });
  } catch (err) {
    console.error('Error saving serie_facturacion to Firestore:', err);
    throw err;
  }
}

// =========================================================================
// GAP8 — FACTURA ELECTRÓNICA B2B (RD 238/2026). Colección propia y aislada de
// facturas / registros_facturacion / envios_verifactu. Sin secretos: el modelo
// FacturaElectronicaB2B no contempla credenciales ni certificados.
// =========================================================================

export const FACTURAS_ELECTRONICAS_B2B_COL = collection(db, 'facturas_electronicas_b2b');

/** Suscripción en tiempo real de representaciones electrónicas B2B. */
export function subscribeFacturasElectronicasB2B(callback: (items: FacturaElectronicaB2B[]) => void) {
  return onSnapshot(
    FACTURAS_ELECTRONICAS_B2B_COL,
    (snapshot) => {
      const items: FacturaElectronicaB2B[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as FacturaElectronicaB2B);
      });
      items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      callback(items);
    },
    (err) => {
      console.error('Firestore facturas_electronicas_b2b snapshot error:', err);
    }
  );
}

/**
 * Crea o actualiza una factura electrónica B2B. Idempotencia por id determinista
 * (mismo factura+formato+versión ⇒ mismo id ⇒ no duplica documentos).
 * El historial es append-only a nivel de motor; Firestore rules lo garantizan.
 */
export async function saveFacturaElectronicaB2BFirestore(feb: FacturaElectronicaB2B): Promise<void> {
  try {
    const clean = sanitizeObjectForFirestore({
      ...feb,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'facturas_electronicas_b2b', feb.id), clean, { merge: true });
  } catch (err) {
    console.error('Error saving factura_electronica_b2b to Firestore:', err);
    throw err;
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
