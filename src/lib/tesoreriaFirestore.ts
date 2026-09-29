/**
 * BLOQUE B — Persistencia Firestore de tesorería (aditivo; no toca firebase.ts).
 * Colecciones: liquidaciones_propietarios, gastos_inmuebles, ordenes_pago,
 * ficheros_sepa, mandatos_sepa, config_liquidacion.
 *
 * ÁMBITOS DE LECTURA (guards de suscripción, sin tocar firestore.rules):
 *  · `ficheros_sepa`, `ordenes_pago`, `mandatos_sepa`: `list` SOLO master
 *    (`isMasterAdmin()` en las reglas). Un contexto no master NO ejecuta
 *    `onSnapshot`: ni query, ni permission-denied, ni aviso.
 *  · `liquidaciones_propietarios`, `gastos_inmuebles`: SOLO master abre la
 *    lectura de colección completa (es la única identidad que las reglas §26–§27
 *    autorizan para un `list` sin filtro; un ADMINISTRADOR no master recibe
 *    `permission-denied`, así que NO se le abre consulta). PROPIETARIO consulta
 *    SIEMPRE acotada en origen `where('propietarioId', '==', propietarioIdActual)`
 *    (es la única forma que las reglas pueden demostrar en un `list`; una
 *    consulta global la deniegan, y el filtro posterior en memoria no la
 *    legaliza). Sin rama de lectura no se abre ninguna consulta.
 *  · El propietarioId procede del contexto `UsuarioApp` del usuario de la
 *    sesión (mismo modelo que usa App), nunca de datos arbitrarios de la UI.
 */
import { collection, doc, onSnapshot, query, where, setDoc, deleteDoc } from 'firebase/firestore';
import { db, sanitizeObjectForFirestore } from './firebase';
import { reportarErrorLectura } from '../estadoDatos/canalIncidencias';
// Helper canónico de la cuenta maestra (no se comparan emails a mano).
import { esUsuarioMaster } from './adminUsuarios';
import type { UsuarioApp } from '../types';
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
export function subscribeLiquidaciones(
  callback: (items: LiquidacionPropietario[]) => void,
  scope?: UsuarioApp | null,
) {
  // SOLO master: es la única identidad autorizada por las reglas §26 para la
  // lectura de colección completa (un ADMINISTRADOR no master la vería denegada).
  const esMaster = !!scope && esUsuarioMaster(scope);
  // PROPIETARIO: ámbito obligatorio por su propietarioId del contexto de sesión.
  const pid = scope?.tipoPerfil === 'PROPIETARIO' ? scope.propietarioId ?? '' : '';
  if (!esMaster && !pid) {
    // Sin contexto o perfil sin rama de lectura en las reglas: NO QUERY.
    callback([]);
    return () => {};
  }
  const ref = esMaster
    ? LIQUIDACIONES_COL
    : query(LIQUIDACIONES_COL, where('propietarioId', '==', pid));
  return onSnapshot(
    ref,
    (snap) => {
      const items: LiquidacionPropietario[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as LiquidacionPropietario));
      items.sort((a, b) => (a.periodo < b.periodo ? 1 : a.periodo > b.periodo ? -1 : 0));
      callback(items);
    },
    (err) => reportarErrorLectura('liquidaciones', err, 'Firestore liquidaciones snapshot error:'),
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
export function subscribeGastos(
  callback: (items: GastoInmueble[]) => void,
  scope?: UsuarioApp | null,
) {
  // SOLO master: es la única identidad autorizada por las reglas §27 para la
  // lectura de colección completa (un ADMINISTRADOR no master la vería denegada).
  const esMaster = !!scope && esUsuarioMaster(scope);
  // PROPIETARIO: ámbito obligatorio por su propietarioId del contexto de sesión.
  const pid = scope?.tipoPerfil === 'PROPIETARIO' ? scope.propietarioId ?? '' : '';
  if (!esMaster && !pid) {
    // Sin contexto o perfil sin rama de lectura en las reglas: NO QUERY.
    callback([]);
    return () => {};
  }
  const ref = esMaster
    ? GASTOS_COL
    : query(GASTOS_COL, where('propietarioId', '==', pid));
  return onSnapshot(
    ref,
    (snap) => {
      const items: GastoInmueble[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as GastoInmueble));
      items.sort((a, b) => (a.fechaGasto < b.fechaGasto ? 1 : -1));
      callback(items);
    },
    (err) => reportarErrorLectura('tesoreria_gastos', err, 'Firestore gastos snapshot error:'),
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
export function subscribeOrdenesPago(
  callback: (items: OrdenPago[]) => void,
  scope?: UsuarioApp | null,
) {
  // Reglas §28: `list` SOLO master. Sin contexto master NO se ejecuta onSnapshot.
  if (!esUsuarioMaster(scope)) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    ORDENES_PAGO_COL,
    (snap) => {
      const items: OrdenPago[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as OrdenPago));
      items.sort((a, b) => (a.fechaCreacion < b.fechaCreacion ? 1 : -1));
      callback(items);
    },
    (err) => reportarErrorLectura('ordenes_pago', err, 'Firestore ordenes_pago snapshot error:'),
  );
}

export async function saveOrdenPagoFirestore(orden: OrdenPago): Promise<void> {
  const clean = sanitizeObjectForFirestore(orden);
  await setDoc(doc(db, 'ordenes_pago', orden.id), clean, { merge: true });
}

// --- Ficheros SEPA ---
export function subscribeFicherosSepa(
  callback: (items: FicheroSEPA[]) => void,
  scope?: UsuarioApp | null,
) {
  // Reglas §29: `list` SOLO master. Sin contexto master NO se ejecuta onSnapshot.
  if (!esUsuarioMaster(scope)) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    FICHEROS_SEPA_COL,
    (snap) => {
      const items: FicheroSEPA[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as FicheroSEPA));
      items.sort((a, b) => (a.fechaCreacion < b.fechaCreacion ? 1 : -1));
      callback(items);
    },
    (err) => reportarErrorLectura('ficheros_sepa', err, 'Firestore ficheros_sepa snapshot error:'),
  );
}

export async function saveFicheroSepaFirestore(fichero: FicheroSEPA): Promise<void> {
  const clean = sanitizeObjectForFirestore(fichero);
  await setDoc(doc(db, 'ficheros_sepa', fichero.id), clean, { merge: true });
}

// --- Mandatos SEPA ---
export function subscribeMandatosSepa(
  callback: (items: MandatoSEPA[]) => void,
  scope?: UsuarioApp | null,
) {
  // Reglas §30: `list` SOLO master. Sin contexto master NO se ejecuta onSnapshot.
  if (!esUsuarioMaster(scope)) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    MANDATOS_SEPA_COL,
    (snap) => {
      const items: MandatoSEPA[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MandatoSEPA));
      callback(items);
    },
    (err) => reportarErrorLectura('mandatos_sepa', err, 'Firestore mandatos_sepa snapshot error:'),
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
    (err) => reportarErrorLectura('config_liquidacion', err, 'Firestore config_liquidacion snapshot error:'),
  );
}

export async function saveConfigLiquidacionFirestore(
  propietarioId: string,
  config: ConfigFiscalLiquidacion,
): Promise<void> {
  const clean = sanitizeObjectForFirestore(config);
  await setDoc(doc(db, 'config_liquidacion', propietarioId), clean, { merge: true });
}
