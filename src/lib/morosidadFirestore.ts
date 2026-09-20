/**
 * BLOQUE C — Persistencia Firestore de morosidad (aditivo; no toca firebase.ts).
 * Colecciones propias: `expedientes_morosidad`, `expedientes_morosidad_hist`,
 * `compromisos_morosidad`, `evidencias_morosidad`, `politicas_morosidad` y la
 * vista de mínimo privilegio `morosidad_resumen_propietario`.
 *
 * Reglas aplicadas (verificación §32–37 de `firestore.rules`):
 *  - deny-by-default (catch-all canónico intacto) y aislamiento por `propietarioId`;
 *  - invarianza de ids: el id del documento es el id determinista del modelo;
 *  - `propietarioId` validado en cada escritura;
 *  - histórico y evidencias APPEND-ONLY (sin update ni delete para nadie);
 *  - sin borrado ordinario del expediente: cerrar/anaular es la vía (delete solo
 *    reservado al administrador principal, como en BLOQUE B);
 *  - inmutables: `id`, `claveIdempotencia`, `contratoId`, `propietarioId`,
 *    `inmuebleId`, `fechaDeteccion`, `versionPolitica`;
 *  - sin secretos: predicado `sinSecretosMorosidad()`.
 */

import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db, sanitizeObjectForFirestore } from './firebase';
import type {
  CompromisoPago,
  ComunicacionExpediente,
  EvidenciaMorosidad,
  ExpedienteMorosidad,
  PoliticaMorosidad,
  ResumenMorosidadPropietario,
  TransicionExpediente,
} from '../types/morosidad';
import { CAMPOS_RESUMEN_PROPIETARIO, construirResumenPropietario, recortarResumenPropietario } from '../utils/morosidad/morosidadEngine';
import type { Notificacion } from '../types/notificaciones';
import type { RepositorioMorosidad } from '../utils/morosidad/morosidadStore';

export const EXPEDIENTES_MOROSIDAD_COL = collection(db, 'expedientes_morosidad');
export const HISTORIAL_MOROSIDAD_COL = collection(db, 'expedientes_morosidad_hist');
export const COMPROMISOS_MOROSIDAD_COL = collection(db, 'compromisos_morosidad');
export const EVIDENCIAS_MOROSIDAD_COL = collection(db, 'evidencias_morosidad');
export const POLITICAS_MOROSIDAD_COL = collection(db, 'politicas_morosidad');
export const RESUMEN_MOROSIDAD_COL = collection(db, 'morosidad_resumen_propietario');
export const NOTIFICACIONES_COL = collection(db, 'notificaciones');

// ---------------------------------------------------------------------------
// Subscripciones (patrón canónico: escucha la colección; el aislamiento real lo
// aplican las reglas de Firestore y, en la UI, el scoping por `propietarioId`).
// ---------------------------------------------------------------------------

function mapSnap<T>(snap: { forEach(cb: (d: { id: string; data(): unknown }) => void): void }): T[] {
  const items: T[] = [];
  snap.forEach((d) => items.push({ id: d.id, ...(d.data() as object) } as T));
  return items;
}

export function subscribeExpedientesMorosidad(
  callback: (items: ExpedienteMorosidad[]) => void,
  propietarioId?: string | null,
): () => void {
  const q = propietarioId ? query(EXPEDIENTES_MOROSIDAD_COL, where('propietarioId', '==', propietarioId)) : EXPEDIENTES_MOROSIDAD_COL;
  return onSnapshot(
    q,
    (snap) => {
      const items = mapSnap<ExpedienteMorosidad>(snap);
      items.sort((a, b) => (a.actualizadoEn < b.actualizadoEn ? 1 : a.actualizadoEn > b.actualizadoEn ? -1 : 0));
      callback(items);
    },
    (err) => console.error('Firestore expedientes_morosidad snapshot error:', err),
  );
}

export function subscribeHistorialMorosidad(expedienteId: string, callback: (items: TransicionExpediente[]) => void): () => void {
  return onSnapshot(
    query(HISTORIAL_MOROSIDAD_COL, where('expedienteId', '==', expedienteId)),
    (snap) => {
      const items = mapSnap<TransicionExpediente>(snap);
      items.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
      callback(items);
    },
    (err) => console.error('Firestore expedientes_morosidad_hist snapshot error:', err),
  );
}

export function subscribeCompromisosMorosidad(
  callback: (items: CompromisoPago[]) => void,
  propietarioId?: string | null,
): () => void {
  const q = propietarioId ? query(COMPROMISOS_MOROSIDAD_COL, where('propietarioId', '==', propietarioId)) : COMPROMISOS_MOROSIDAD_COL;
  return onSnapshot(
    q,
    (snap) => {
      const items = mapSnap<CompromisoPago>(snap);
      items.sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1));
      callback(items);
    },
    (err) => console.error('Firestore compromisos_morosidad snapshot error:', err),
  );
}

export function subscribeEvidenciasMorosidad(expedienteId: string, callback: (items: EvidenciaMorosidad[]) => void): () => void {
  return onSnapshot(
    query(EVIDENCIAS_MOROSIDAD_COL, where('expedienteId', '==', expedienteId)),
    (snap) => {
      const items = mapSnap<EvidenciaMorosidad>(snap);
      items.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
      callback(items);
    },
    (err) => console.error('Firestore evidencias_morosidad snapshot error:', err),
  );
}

export function subscribePoliticasMorosidad(callback: (items: PoliticaMorosidad[]) => void): () => void {
  return onSnapshot(
    POLITICAS_MOROSIDAD_COL,
    (snap) => {
      const items = mapSnap<PoliticaMorosidad>(snap);
      items.sort((a, b) => (a.fechaActualizacion < b.fechaActualizacion ? 1 : -1));
      callback(items);
    },
    (err) => console.error('Firestore politicas_morosidad snapshot error:', err),
  );
}

/** Vista de mínimo privilegio para el Portal del Propietario. */
export function subscribeResumenMorosidadPropietario(
  propietarioId: string,
  callback: (items: ResumenMorosidadPropietario[]) => void,
): () => void {
  return onSnapshot(
    query(RESUMEN_MOROSIDAD_COL, where('propietarioId', '==', propietarioId)),
    (snap) => {
      callback(mapSnap<ResumenMorosidadPropietario>(snap));
    },
    (err) => console.error('Firestore morosidad_resumen_propietario snapshot error:', err),
  );
}

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------

export async function saveExpedienteMorosidadFirestore(exp: ExpedienteMorosidad): Promise<void> {
  const clean = sanitizeObjectForFirestore(exp);
  await setDoc(doc(db, 'expedientes_morosidad', exp.id), clean, { merge: true });
  // Espejo de mínimo privilegio para el portal del propietario.
  try {
    const resumen = recortarResumenPropietario(
      construirResumenPropietario(exp, {
        versionFuente: exp.versionEstado,
        ultimoHechoResumen: (exp.comunicaciones || [])[0]?.cuerpoResumen,
      }),
    );
    await setDoc(doc(db, 'morosidad_resumen_propietario', exp.id), sanitizeObjectForFirestore(resumen), { merge: true });
  } catch (err) {
    // El propietario no puede escribir la vista: la escribe la administración.
    console.warn('No se pudo actualizar el resumen de morosidad para el propietario:', err);
  }
}

/** Append-only: el histórico solo se inserta (nunca se actualiza ni se borra). */
export async function appendHistorialMorosidadFirestore(t: TransicionExpediente): Promise<void> {
  await setDoc(doc(db, 'expedientes_morosidad_hist', t.id), sanitizeObjectForFirestore(t), { merge: false });
}

export async function saveCompromisoMorosidadFirestore(c: CompromisoPago): Promise<void> {
  await setDoc(doc(db, 'compromisos_morosidad', c.id), sanitizeObjectForFirestore(c), { merge: true });
}

export async function appendEvidenciaMorosidadFirestore(e: EvidenciaMorosidad): Promise<void> {
  await setDoc(doc(db, 'evidencias_morosidad', e.id), sanitizeObjectForFirestore(e), { merge: false });
}

export async function savePoliticaMorosidadFirestore(p: PoliticaMorosidad): Promise<void> {
  await setDoc(doc(db, 'politicas_morosidad', p.id), sanitizeObjectForFirestore(p), { merge: true });
}

/** Sin borrado ordinario: solo el administrador principal (vía de emergencia). */
export async function deleteExpedienteMorosidadFirestore(id: string): Promise<void> {
  await deleteDoc(doc(db, 'expedientes_morosidad', id));
}

// ---------------------------------------------------------------------------
// Repositorio del dispatcher GAP 1 (el hueco que GAP 1 dejó sin implementación)
// ---------------------------------------------------------------------------

export async function saveNotificacionFirestore(n: Notificacion): Promise<void> {
  await setDoc(doc(db, 'notificaciones', n.id), sanitizeObjectForFirestore(n), { merge: true });
}

export async function getNotificacionFirestore(id: string): Promise<Notificacion | null> {
  const snap = await getDoc(doc(db, 'notificaciones', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Notificacion) : null;
}

export async function getNotificacionByIdempotenciaFirestore(idempotencyKey: string): Promise<Notificacion | null> {
  const snap = await getDocs(query(NOTIFICACIONES_COL, where('idempotencyKey', '==', idempotencyKey)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as object) } as Notificacion;
}

export const escritorNotificacionesGAP1 = {
  guardar: saveNotificacionFirestore,
  buscarPorId: getNotificacionFirestore,
  buscarPorIdempotencia: getNotificacionByIdempotenciaFirestore,
};

// ---------------------------------------------------------------------------
// Implementación Firestore de `RepositorioMorosidad`
// ---------------------------------------------------------------------------

export interface FabricaRepositorioParams {
  /** Contratos (para leer `registroCobros` sin duplicar la fuente). */
  leerContratos: () => Promise<import('../types').ContratoFormalizacion[]> | import('../types').ContratoFormalizacion[];
  guardarContrato: (c: import('../types').ContratoFormalizacion) => Promise<void>;
  /** Lista de liquidaciones del BLOQUE B (solo lectura, para referencias). */
  listarLiquidaciones?: () => Promise<{ id: string; periodo: string; estado: string; cobroIds: string[] }[]>;
  audit: (accion: string, descripcion: string, detalles: Record<string, unknown>) => Promise<void>;
  actor?: { id?: string; nombre?: string; email?: string } | null;
}

export function crearRepositorioMorosidadFirestore(params: FabricaRepositorioParams): RepositorioMorosidad {
  const cacheExpedientes = new Map<string, ExpedienteMorosidad>();
  return {
    async leerExpediente(id) {
      if (cacheExpedientes.has(id)) return cacheExpedientes.get(id) || null;
      const snap = await getDoc(doc(db, 'expedientes_morosidad', id));
      if (!snap.exists()) return null;
      const e = { id: snap.id, ...(snap.data() as object) } as ExpedienteMorosidad;
      cacheExpedientes.set(e.id, e);
      return e;
    },
    async listarExpedientes() {
      const snap = await getDocs(EXPEDIENTES_MOROSIDAD_COL);
      const items = mapSnap<ExpedienteMorosidad>(snap);
      for (const i of items) cacheExpedientes.set(i.id, i);
      return items;
    },
    async guardarExpediente(exp) {
      cacheExpedientes.set(exp.id, exp);
      await saveExpedienteMorosidadFirestore(exp);
    },
    async appendHistorial(t) {
      await appendHistorialMorosidadFirestore(t);
    },
    async guardarCompromiso(c) {
      await saveCompromisoMorosidadFirestore(c);
    },
    async listarCompromisos(expedienteId) {
      const snap = await getDocs(query(COMPROMISOS_MOROSIDAD_COL, where('expedienteId', '==', expedienteId)));
      return mapSnap<CompromisoPago>(snap);
    },
    async appendEvidencia(e) {
      await appendEvidenciaMorosidadFirestore(e);
    },
    async listarEvidencias(expedienteId) {
      const snap = await getDocs(query(EVIDENCIAS_MOROSIDAD_COL, where('expedienteId', '==', expedienteId)));
      const items = mapSnap<EvidenciaMorosidad>(snap);
      return items.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    },
    async listarHistorial(expedienteId) {
      const snap = await getDocs(query(HISTORIAL_MOROSIDAD_COL, where('expedienteId', '==', expedienteId)));
      const items = mapSnap<TransicionExpediente>(snap);
      return items.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    },
    async listarPoliticas() {
      const snap = await getDocs(POLITICAS_MOROSIDAD_COL);
      return mapSnap<PoliticaMorosidad>(snap);
    },
    async listarCobrosContrato(contratoId) {
      const contratos = await Promise.resolve(params.leerContratos());
      const c = contratos.find((x) => x.id === contratoId);
      return (c?.registroCobros || []) as import('../types').CobroPeriodo[];
    },
    async guardarContrato(c) {
      await params.guardarContrato(c);
    },
    async listarLiquidacionesPorCobros(cobroIds) {
      if (!params.listarLiquidaciones) return [];
      const liq = await params.listarLiquidaciones();
      const set = new Set(cobroIds);
      return liq.filter((l) => (l.cobroIds || []).some((id) => set.has(id)));
    },
    async auditar(accion, descripcion, detalles) {
      try {
        await params.audit(accion, descripcion, { ...detalles, actorId: params.actor?.id, actorNombre: params.actor?.nombre });
      } catch {
        // La auditoría nunca rompe el flujo de negocio (comportamiento canónico).
      }
    },
  };
}

export type { ComunicacionExpediente };
