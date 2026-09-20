/**
 * BLOQUE B — Persistencia Firestore de tesorería (aditivo; no toca firebase.ts).
 * Colecciones: liquidaciones_propietarios, gastos_inmuebles, ordenes_pago,
 * ficheros_sepa, mandatos_sepa, config_liquidacion.
 */
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db, sanitizeObjectForFirestore } from './firebase';
import type {
  ConfigFiscalLiquidacion,
  FicheroSEPA,
  GastoInmueble,
  LiquidacionPropietario,
  MandatoSEPA,
  OrdenPago,
} from '../tesoreria/tipos';

export const LIQUIDACIONES_COL = collection(db, 'liquidaciones_propietarios');
export const GASTOS_COL = collection(db, 'gastos_inmuebles');
export const ORDENES_PAGO_COL = collection(db, 'ordenes_pago');
export const FICHEROS_SEPA_COL = collection(db, 'ficheros_sepa');
export const MANDATOS_SEPA_COL = collection(db, 'mandatos_sepa');

// --- Liquidaciones ---
export function subscribeLiquidaciones(callback: (items: LiquidacionPropietario[]) => void) {
  return onSnapshot(
    LIQUIDACIONES_COL,
    (snap) => {
      const items: LiquidacionPropietario[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as LiquidacionPropietario));
      items.sort((a, b) => (a.periodo < b.periodo ? 1 : a.periodo > b.periodo ? -1 : 0));
      callback(items);
    },
    (err) => console.error('Firestore liquidaciones snapshot error:', err),
  );
}

export async function saveLiquidacionFirestore(liq: LiquidacionPropietario): Promise<void> {
  const clean = sanitizeObjectForFirestore(liq);
  await setDoc(doc(db, 'liquidaciones_propietarios', liq.id), clean, { merge: true });
}

/** Sin borrado físico de liquidaciones: se usa anulación/reversión. Se expone solo para admins en casos excepcionales. */
export async function deleteLiquidacionFirestore(id: string): Promise<void> {
  await deleteDoc(doc(db, 'liquidaciones_propietarios', id));
}

// --- Gastos ---
export function subscribeGastos(callback: (items: GastoInmueble[]) => void) {
  return onSnapshot(
    GASTOS_COL,
    (snap) => {
      const items: GastoInmueble[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as GastoInmueble));
      items.sort((a, b) => (a.fechaGasto < b.fechaGasto ? 1 : -1));
      callback(items);
    },
    (err) => console.error('Firestore gastos snapshot error:', err),
  );
}

export async function saveGastoFirestore(gasto: GastoInmueble): Promise<void> {
  const clean = sanitizeObjectForFirestore(gasto);
  await setDoc(doc(db, 'gastos_inmuebles', gasto.id), clean, { merge: true });
}

export async function deleteGastoFirestore(id: string): Promise<void> {
  await deleteDoc(doc(db, 'gastos_inmuebles', id));
}

// --- Órdenes de pago ---
export function subscribeOrdenesPago(callback: (items: OrdenPago[]) => void) {
  return onSnapshot(
    ORDENES_PAGO_COL,
    (snap) => {
      const items: OrdenPago[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as OrdenPago));
      items.sort((a, b) => (a.fechaCreacion < b.fechaCreacion ? 1 : -1));
      callback(items);
    },
    (err) => console.error('Firestore ordenes_pago snapshot error:', err),
  );
}

export async function saveOrdenPagoFirestore(orden: OrdenPago): Promise<void> {
  const clean = sanitizeObjectForFirestore(orden);
  await setDoc(doc(db, 'ordenes_pago', orden.id), clean, { merge: true });
}

// --- Ficheros SEPA ---
export function subscribeFicherosSepa(callback: (items: FicheroSEPA[]) => void) {
  return onSnapshot(
    FICHEROS_SEPA_COL,
    (snap) => {
      const items: FicheroSEPA[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as FicheroSEPA));
      items.sort((a, b) => (a.fechaCreacion < b.fechaCreacion ? 1 : -1));
      callback(items);
    },
    (err) => console.error('Firestore ficheros_sepa snapshot error:', err),
  );
}

export async function saveFicheroSepaFirestore(fichero: FicheroSEPA): Promise<void> {
  const clean = sanitizeObjectForFirestore(fichero);
  await setDoc(doc(db, 'ficheros_sepa', fichero.id), clean, { merge: true });
}

// --- Mandatos SEPA ---
export function subscribeMandatosSepa(callback: (items: MandatoSEPA[]) => void) {
  return onSnapshot(
    MANDATOS_SEPA_COL,
    (snap) => {
      const items: MandatoSEPA[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MandatoSEPA));
      callback(items);
    },
    (err) => console.error('Firestore mandatos_sepa snapshot error:', err),
  );
}

export async function saveMandatoSepaFirestore(mandato: MandatoSEPA): Promise<void> {
  const clean = sanitizeObjectForFirestore(mandato);
  await setDoc(doc(db, 'mandatos_sepa', mandato.id), clean, { merge: true });
}

// --- Configuración de liquidación por propietario ---
export function subscribeConfigLiquidacion(
  propietarioId: string,
  callback: (config: ConfigFiscalLiquidacion | null) => void,
) {
  const ref = doc(db, 'config_liquidacion', propietarioId);
  return onSnapshot(
    ref,
    (snap) => callback(snap.exists() ? (snap.data() as ConfigFiscalLiquidacion) : null),
    (err) => console.error('Firestore config_liquidacion snapshot error:', err),
  );
}

export async function saveConfigLiquidacionFirestore(
  propietarioId: string,
  config: ConfigFiscalLiquidacion,
): Promise<void> {
  const clean = sanitizeObjectForFirestore(config);
  await setDoc(doc(db, 'config_liquidacion', propietarioId), clean, { merge: true });
}
