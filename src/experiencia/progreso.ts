/**
 * CAPA TRANSVERSAL §6 — FASE 3 · Progreso persistido de tutoriales (parte PURA).
 *
 * Aquí vive el modelo mínimo, la conversión sesión ⇄ progreso y la validación de datos.
 * NO hay Firebase en este módulo: el acceso a Firestore está en
 * `src/lib/progresoTutorialesFirestore.ts` (servicio transversal único), y la UI
 * (`TutorialPlayer`) recibe el servicio por inyección, de modo que ERP y Portal comparten
 * el mismo motor y la misma persistencia.
 *
 * Modelo Firestore elegido:
 *   usuarios_auth/{uid}/progreso_tutoriales/{host}__{tutorialId}
 * - Cuelga del espejo de identidad por UID de Firebase Auth que ya existe (FASE 1.4), que es
 *   la única clave que las Security Rules pueden comprobar con `request.auth.uid`.
 * - No se crea ninguna colección global de progreso; el documento pertenece al usuario.
 * - El id incluye el host para que un mismo `tutorialId` en ERP y Portal nunca colisione.
 * - Solo se guarda el estado (paso, completado, saltados, fechas); el contenido del tutorial
 *   sigue siendo el registro tipado del código.
 */
import type { HostExperiencia, SesionTutorial, Tutorial } from './tipos';

export const COLECCION_PADRE_PROGRESO = 'usuarios_auth';
export const SUBCOLECCION_PROGRESO_TUTORIALES = 'progreso_tutoriales';
/** Límite defensivo (coincide con la regla Firestore). */
export const MAX_PASOS_PROGRESO = 100;

export const HOSTS_EXPERIENCIA: readonly HostExperiencia[] = ['ERP', 'PORTAL_INQUILINO'] as const;

/** Documento persistido. Fechas en ISO-8601 (convención del proyecto, p. ej. `usuarios_auth.updatedAt`). */
export interface TutorialProgress {
  tutorialId: string;
  host: HostExperiencia;
  /** Índice (0-based) del paso en el que se quedó el usuario. */
  currentStep: number;
  /** Nº de pasos del tutorial cuando se guardó: si cambia, el progreso se considera de otra versión. */
  stepCount: number;
  /** Pegajoso: una vez completado, sigue siendo `true` aunque se repita el tutorial. */
  completed: boolean;
  skippedSteps: string[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

export const CAMPOS_PROGRESO: readonly (keyof TutorialProgress)[] = [
  'tutorialId',
  'host',
  'currentStep',
  'stepCount',
  'completed',
  'skippedSteps',
  'startedAt',
  'updatedAt',
  'completedAt',
] as const;

export type MotivoProgreso = 'NO_AUTENTICADO' | 'TUTORIAL_DESCONOCIDO' | 'DATOS_INVALIDOS' | 'ERROR_FIRESTORE';

/** Resultado que NUNCA lanza: la UI decide qué hacer (seguir en memoria, avisar…). */
export type ResultadoProgreso<T> = { ok: true; data: T } | { ok: false; motivo: MotivoProgreso; detalle?: string };

/** Contrato del servicio de persistencia (implementación Firestore en `src/lib`). */
export interface ServicioProgresoTutoriales {
  getTutorialProgress(tutorialId: string, host?: HostExperiencia): Promise<ResultadoProgreso<TutorialProgress | null>>;
  saveTutorialProgress(sesion: SesionTutorial, tutorial: Tutorial): Promise<ResultadoProgreso<TutorialProgress>>;
  clearTutorialProgress(tutorialId: string, host?: HostExperiencia): Promise<ResultadoProgreso<null>>;
}

export function esHostExperiencia(v: unknown): v is HostExperiencia {
  return typeof v === 'string' && (HOSTS_EXPERIENCIA as readonly string[]).includes(v);
}

export function hostDeTutorial(tutorial: Pick<Tutorial, 'host'>): HostExperiencia {
  return tutorial.host ?? 'ERP';
}

/** Id de documento: `{host}__{tutorialId}` (evita colisiones entre hosts). */
export function idProgreso(host: HostExperiencia, tutorialId: string): string {
  return `${host}__${tutorialId}`;
}

/** Ruta completa del documento del progreso de un usuario. */
export function rutaProgreso(uid: string, host: HostExperiencia, tutorialId: string): string {
  return `${COLECCION_PADRE_PROGRESO}/${uid}/${SUBCOLECCION_PROGRESO_TUTORIALES}/${idProgreso(host, tutorialId)}`;
}

const esIso = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 40 && !Number.isNaN(Date.parse(v));
const esEntero = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * Validación estricta (espejo de la regla Firestore): claves permitidas, tipos y rangos.
 * Se aplica al LEER (un documento corrupto o manipulado se ignora) y al ESCRIBIR.
 */
export function esProgresoValido(d: unknown): d is TutorialProgress {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  const o = d as Record<string, unknown>;
  const claves = Object.keys(o);
  if (claves.some((k) => !(CAMPOS_PROGRESO as readonly string[]).includes(k))) return false;
  if (typeof o.tutorialId !== 'string' || o.tutorialId.length === 0 || o.tutorialId.length > 128) return false;
  if (!esHostExperiencia(o.host)) return false;
  if (!esEntero(o.currentStep, 0, MAX_PASOS_PROGRESO - 1)) return false;
  if (!esEntero(o.stepCount, 1, MAX_PASOS_PROGRESO)) return false;
  if (typeof o.completed !== 'boolean') return false;
  if (!Array.isArray(o.skippedSteps) || o.skippedSteps.length > MAX_PASOS_PROGRESO || o.skippedSteps.some((s) => typeof s !== 'string' || s.length > 128)) return false;
  if (!esIso(o.startedAt) || !esIso(o.updatedAt)) return false;
  if ('completedAt' in o && o.completedAt !== undefined && !esIso(o.completedAt)) return false;
  return true;
}

/**
 * Progreso a persistir a partir de la sesión en memoria. `previo` conserva los campos
 * pegajosos (`completed`, `completedAt`, `startedAt`) si el usuario repite el tutorial.
 */
export function progresoDesdeSesion(
  sesion: SesionTutorial,
  tutorial: Tutorial,
  previo?: TutorialProgress | null,
  ahora: () => string = () => new Date().toISOString()
): TutorialProgress {
  const completadoAhora = sesion.estado === 'COMPLETADO';
  const completed = completadoAhora || previo?.completed === true;
  const total = tutorial.steps.length;
  const currentStep = Math.min(Math.max(sesion.indice, 0), Math.max(total - 1, 0));
  const p: TutorialProgress = {
    tutorialId: tutorial.id,
    host: hostDeTutorial(tutorial),
    currentStep,
    stepCount: total,
    completed,
    skippedSteps: [...(sesion.saltados ?? [])].slice(0, MAX_PASOS_PROGRESO),
    startedAt: previo?.startedAt ?? sesion.iniciadoEn,
    updatedAt: ahora(),
  };
  const completedAt = previo?.completedAt ?? (completadoAhora ? sesion.finalizadoEn ?? p.updatedAt : undefined);
  if (completedAt) p.completedAt = completedAt;
  return p;
}

/**
 * Sesión reanudable a partir del progreso guardado, o `null` si no procede reanudar:
 * - no hay progreso, o es de otro tutorial/host;
 * - el tutorial cambió de nº de pasos (otra versión) o el paso ya no existe;
 * - el usuario ya lo completó (se empieza de nuevo; el flag `completed` se conserva);
 * - estaba en el paso 0 sin saltos (no hay nada que reanudar).
 */
export function sesionDesdeProgreso(progreso: TutorialProgress | null | undefined, tutorial: Tutorial): SesionTutorial | null {
  if (!progreso || !esProgresoValido(progreso)) return null;
  if (progreso.tutorialId !== tutorial.id || progreso.host !== hostDeTutorial(tutorial)) return null;
  if (progreso.completed) return null;
  if (progreso.stepCount !== tutorial.steps.length) return null;
  if (progreso.currentStep < 0 || progreso.currentStep >= tutorial.steps.length) return null;
  const ids = new Set(tutorial.steps.map((s) => s.id));
  const saltados = progreso.skippedSteps.filter((s) => ids.has(s));
  if (progreso.currentStep === 0 && saltados.length === 0) return null;
  return {
    tutorialId: tutorial.id,
    indice: progreso.currentStep,
    estado: 'EN_CURSO',
    iniciadoEn: progreso.startedAt,
    ...(saltados.length > 0 ? { saltados } : {}),
  };
}
