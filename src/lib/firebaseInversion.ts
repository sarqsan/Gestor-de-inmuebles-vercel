/**
 * Firebase — Análisis de Inversión
 * Colección privada por propietario, mismo patrón que gastos/contratos.
 * Aislamiento: where('propietarioId','==', pid) para list, get por propietario.
 */

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, sanitizeObjectForFirestore, type DataAccessScope } from './firebase';
import type { AnalisisInversion } from '../types/inversion';

export const ANALISIS_INVERSION_COL = collection(db, 'analisis_inversion');

function mapearAnalisis(snapshot: any): AnalisisInversion[] {
  const items: AnalisisInversion[] = [];
  snapshot.forEach((ds: any) => {
    items.push({ id: ds.id, ...ds.data() } as AnalisisInversion);
  });
  // Ordenar por actualización descendente
  items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return items;
}

export function subscribeAnalisisInversion(
  callback: (items: AnalisisInversion[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  // Profesional sin acceso a datos económicos de inversión
  if (scope?.tipoPerfil === 'PROFESIONAL') {
    callback([]);
    return () => {};
  }

  // Propietario: consulta demostrable where('propietarioId','==', pid)
  if (scope?.tipoPerfil === 'PROPIETARIO') {
    const pid = scope.propietarioId;
    if (!pid) {
      callback([]);
      return () => {};
    }
    const qScoped = query(ANALISIS_INVERSION_COL, where('propietarioId', '==', pid));
    return onSnapshot(
      qScoped,
      (snap) => callback(mapearAnalisis(snap)),
      (err) => console.error('Firestore analisis_inversion (scoped) snapshot error:', err)
    );
  }

  // Admin / sin ámbito: colección completa
  return onSnapshot(
    ANALISIS_INVERSION_COL,
    (snap) => callback(mapearAnalisis(snap)),
    (err) => console.error('Firestore analisis_inversion snapshot error:', err)
  );
}

export async function saveAnalisisInversionFirestore(item: AnalisisInversion): Promise<void> {
  try {
    const clean = sanitizeObjectForFirestore({
      ...item,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'analisis_inversion', item.id), clean, { merge: true });
  } catch (err) {
    console.error('Error saving analisis inversion:', err);
    throw err;
  }
}

export async function deleteAnalisisInversionFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'analisis_inversion', id));
  } catch (err) {
    console.error('Error deleting analisis inversion:', err);
    throw err;
  }
}
