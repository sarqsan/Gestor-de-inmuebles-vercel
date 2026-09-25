/**
 * CAPA TRANSVERSAL §6 — FASE 3 · Servicio ÚNICO de persistencia del progreso de tutoriales.
 *
 * Ruta: usuarios_auth/{uid}/progreso_tutoriales/{host}__{tutorialId}
 * - `uid` es SIEMPRE el del usuario autenticado actual (`auth.currentUser` canónico de
 *   `src/lib/firebase.ts`); el llamador no puede elegir otro UID.
 * - `tutorialId` debe existir en el registro tipado (`TUTORIALES_REGISTRO`).
 * - Los datos se validan con `esProgresoValido` antes de escribir y al leer.
 * - Nunca lanza: devuelve `ResultadoProgreso` para que el TutorialPlayer siga en memoria si
 *   Firestore no está disponible. Sin localStorage/sessionStorage. Sin auditoría.
 */
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { HostExperiencia, SesionTutorial, Tutorial } from '../experiencia/tipos';
import { obtenerTutorial } from '../experiencia/tutoriales';
import {
  COLECCION_PADRE_PROGRESO,
  SUBCOLECCION_PROGRESO_TUTORIALES,
  esHostExperiencia,
  esProgresoValido,
  hostDeTutorial,
  idProgreso,
  progresoDesdeSesion,
  type ResultadoProgreso,
  type ServicioProgresoTutoriales,
  type TutorialProgress,
} from '../experiencia/progreso';

function uidActual(): string | null {
  const u = auth?.currentUser;
  return u && typeof u.uid === 'string' && u.uid.length > 0 ? u.uid : null;
}

function refProgreso(uid: string, host: HostExperiencia, tutorialId: string) {
  return doc(db, COLECCION_PADRE_PROGRESO, uid, SUBCOLECCION_PROGRESO_TUTORIALES, idProgreso(host, tutorialId));
}

function resolverTutorial(tutorialId: unknown, host: unknown): { tutorial: Tutorial; host: HostExperiencia } | null {
  if (typeof tutorialId !== 'string' || tutorialId.length === 0 || tutorialId.length > 128) return null;
  const t = obtenerTutorial(tutorialId);
  if (!t) return null;
  const h = host === undefined ? hostDeTutorial(t) : host;
  if (!esHostExperiencia(h) || h !== hostDeTutorial(t)) return null;
  return { tutorial: t, host: h };
}

const errorFirestore = (err: unknown): ResultadoProgreso<never> => ({
  ok: false,
  motivo: 'ERROR_FIRESTORE',
  detalle: err instanceof Error ? err.message : String(err),
});

/** Lee el progreso del usuario actual para un tutorial. `data: null` si no hay progreso (o está corrupto). */
export async function getTutorialProgress(tutorialId: string, host?: HostExperiencia): Promise<ResultadoProgreso<TutorialProgress | null>> {
  const uid = uidActual();
  if (!uid) return { ok: false, motivo: 'NO_AUTENTICADO' };
  const r = resolverTutorial(tutorialId, host);
  if (!r) return { ok: false, motivo: 'TUTORIAL_DESCONOCIDO' };
  try {
    const snap = await getDoc(refProgreso(uid, r.host, tutorialId));
    if (!snap.exists()) return { ok: true, data: null };
    const datos = snap.data();
    return { ok: true, data: esProgresoValido(datos) ? datos : null };
  } catch (err) {
    return errorFirestore(err);
  }
}

/**
 * Guarda el estado de la sesión (sobrescritura completa del documento propio; conserva los
 * campos pegajosos `completed`/`completedAt`/`startedAt` leyendo el progreso previo).
 */
export async function saveTutorialProgress(sesion: SesionTutorial, tutorial: Tutorial): Promise<ResultadoProgreso<TutorialProgress>> {
  const uid = uidActual();
  if (!uid) return { ok: false, motivo: 'NO_AUTENTICADO' };
  const r = resolverTutorial(tutorial?.id, tutorial?.host);
  if (!r || sesion?.tutorialId !== tutorial.id) return { ok: false, motivo: 'TUTORIAL_DESCONOCIDO' };
  try {
    const ref = refProgreso(uid, r.host, tutorial.id);
    const snap = await getDoc(ref);
    const previo = snap.exists() && esProgresoValido(snap.data()) ? (snap.data() as TutorialProgress) : null;
    const progreso = progresoDesdeSesion(sesion, r.tutorial, previo);
    if (!esProgresoValido(progreso)) return { ok: false, motivo: 'DATOS_INVALIDOS' };
    await setDoc(ref, progreso); // sin merge: el documento es exactamente el modelo validado
    return { ok: true, data: progreso };
  } catch (err) {
    return errorFirestore(err);
  }
}

/** Borra el progreso propio de un tutorial (idempotente). */
export async function clearTutorialProgress(tutorialId: string, host?: HostExperiencia): Promise<ResultadoProgreso<null>> {
  const uid = uidActual();
  if (!uid) return { ok: false, motivo: 'NO_AUTENTICADO' };
  const r = resolverTutorial(tutorialId, host);
  if (!r) return { ok: false, motivo: 'TUTORIAL_DESCONOCIDO' };
  try {
    await deleteDoc(refProgreso(uid, r.host, tutorialId));
    return { ok: true, data: null };
  } catch (err) {
    return errorFirestore(err);
  }
}

/** Servicio inyectable en `TutorialPlayer` (ERP y Portal comparten esta única implementación). */
export const servicioProgresoTutoriales: ServicioProgresoTutoriales = {
  getTutorialProgress,
  saveTutorialProgress,
  clearTutorialProgress,
};
