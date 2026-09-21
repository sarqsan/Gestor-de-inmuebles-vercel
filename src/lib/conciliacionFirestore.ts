/**
 * R1 — Persistencia Firestore del estado de conciliación bancaria (GAP 6).
 *
 * El GAP 6 trabajaba con movimientos/propuestas/importaciones solo en memoria
 * (useState + espejo de sesión). Este módulo persiste ese estado en las
 * colecciones canónicas ya previstas por las reglas §24, sin cambiar la
 * semántica del motor (importar → proponer → confirmar → aplicar).
 *
 * - Lectura: `cargarConciliacionPropietario` (una query acotada por
 *   `propietarioId` y colección; exigible por reglas a master/propietario).
 * - Escritura: `guardarImportacionConciliacion` (batch atómico) y
 *   `actualizarPropuestaConciliacion` (set con merge).
 * - Los document ID se namespacing por propietario porque `hashIdempotencia`
 *   no incluye propietario (dos propietarios podrían importar el mismo
 *   apunte bancario): `${propietarioId}_${idDeterminista}`, saneado.
 * - Los documentos inválidos/incompatibles se omiten al cargar (se cuentan
 *   en `omitidosInvalidos`); los errores de Firestore se propagan al
 *   llamador para su tratamiento en UI. Este módulo nunca silencia fallos.
 */
import { collection, doc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db, sanitizeObjectForFirestore } from './firebase';
import type {
  ImportacionBancaria,
  MovimientoBancario,
  PropuestaConciliacion,
} from '../types/conciliacion';

export const MOVIMIENTOS_BANCARIOS_COL = 'movimientos_bancarios';
export const CONCILIACIONES_BANCARIAS_COL = 'conciliaciones_bancarias';
export const IMPORTACIONES_BANCARIAS_COL = 'importaciones_bancarias';

/** Id sintético que usa la UI cuando aún no hay inmuebles: nunca se persiste. */
export const ID_PROPIETARIO_DEMO = 'prop_demo';

/** Solo un propietarioId real y no vacío puede leerse/persistirse. */
export function esPropietarioPersistible(
  propietarioId: string | undefined | null,
): propietarioId is string {
  return (
    typeof propietarioId === 'string' &&
    propietarioId.trim().length > 0 &&
    propietarioId !== ID_PROPIETARIO_DEMO
  );
}

/**
 * Sanea un id para usarlo como document ID de Firestore (prohibido `/`,
 * vacío o `.`/`..`). Determinista: el mismo id siempre produce lo mismo.
 */
export function sanearIdDoc(id: string): string {
  const limpio = String(id || '').trim().replace(/\//g, '_');
  if (limpio.length === 0 || limpio === '.' || limpio === '..') {
    let hash = 0x811c9dc5;
    const base = String(id || '');
    for (let i = 0; i < base.length; i++) {
      hash ^= base.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return `doc_${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }
  return limpio;
}

export function docIdMovimiento(propietarioId: string, m: { hashIdempotencia: string }): string {
  return sanearIdDoc(`${propietarioId}_${m.hashIdempotencia}`);
}

export function docIdPropuesta(propietarioId: string, p: { id: string }): string {
  return sanearIdDoc(`${propietarioId}_${p.id}`);
}

export function docIdImportacion(propietarioId: string, i: { id: string }): string {
  return sanearIdDoc(`${propietarioId}_${i.id}`);
}

/** Unión race-safe: conserva `actuales` (gana en conflicto) + añade `base` sin duplicar. */
export function fusionarSinDuplicados<T>(base: T[], actuales: T[], clave: (x: T) => string): T[] {
  const vistas = new Set(actuales.map(clave));
  const extra = base.filter((x) => !vistas.has(clave(x)));
  return [...actuales, ...extra];
}

// ---------------------------------------------------------------------------
// Validación de documentos persistidos (tolerante a datos incompatibles)
// ---------------------------------------------------------------------------

function esRegistro(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function esMovimientoBancarioValido(d: unknown, propietarioId: string): d is MovimientoBancario {
  if (!esRegistro(d)) return false;
  return (
    typeof d.idMovimiento === 'string' &&
    typeof d.hashIdempotencia === 'string' &&
    typeof d.fechaOperacion === 'string' &&
    typeof d.importe === 'number' &&
    typeof d.tipo === 'string' &&
    typeof d.concepto === 'string' &&
    d.propietarioId === propietarioId
  );
}

export function esPropuestaConciliacionValida(
  d: unknown,
  propietarioId: string,
): d is PropuestaConciliacion {
  if (!esRegistro(d)) return false;
  return (
    typeof d.id === 'string' &&
    typeof d.movimientoId === 'string' &&
    typeof d.estado === 'string' &&
    d.propietarioId === propietarioId
  );
}

export function esImportacionBancariaValida(
  d: unknown,
  propietarioId: string,
): d is ImportacionBancaria {
  if (!esRegistro(d)) return false;
  return (
    typeof d.id === 'string' &&
    typeof d.estado === 'string' &&
    typeof d.totalMovimientos === 'number' &&
    d.propietarioId === propietarioId
  );
}

export interface EstadoConciliacionPersistido {
  movimientos: MovimientoBancario[];
  propuestas: PropuestaConciliacion[];
  importaciones: ImportacionBancaria[];
  /** Documentos leídos pero descartados por inválidos/incompatibles. */
  omitidosInvalidos: number;
}

const ESTADO_VACIO: EstadoConciliacionPersistido = {
  movimientos: [],
  propuestas: [],
  importaciones: [],
  omitidosInvalidos: 0,
};

function campo(obj: object, clave: string): unknown {
  return (obj as Record<string, unknown>)[clave];
}

function porFechaEntoncesId(a: object, b: object, fecha: string, id: string): number {
  const fa = String(campo(a, fecha) ?? '');
  const fb = String(campo(b, fecha) ?? '');
  if (fa !== fb) return fa < fb ? -1 : 1;
  const ia = String(campo(a, id) ?? '');
  const ib = String(campo(b, id) ?? '');
  return ia < ib ? -1 : ia > ib ? 1 : 0;
}

/**
 * Carga el estado persistido de UN propietario (aislamiento estricto: las
 * tres consultas filtran por igualdad en `propietarioId`). Ordenación
 * determinista para que la recarga recupere el mismo estado visible.
 * Sin propietario persistible no toca Firestore y devuelve vacío.
 * Los errores de Firestore se propagan (el llamador los muestra en UI).
 */
export async function cargarConciliacionPropietario(
  propietarioId: string,
): Promise<EstadoConciliacionPersistido> {
  if (!esPropietarioPersistible(propietarioId)) {
    return { ...ESTADO_VACIO };
  }
  const qMov = query(collection(db, MOVIMIENTOS_BANCARIOS_COL), where('propietarioId', '==', propietarioId));
  const qProp = query(collection(db, CONCILIACIONES_BANCARIAS_COL), where('propietarioId', '==', propietarioId));
  const qImp = query(collection(db, IMPORTACIONES_BANCARIAS_COL), where('propietarioId', '==', propietarioId));
  const [snapMov, snapProp, snapImp] = await Promise.all([getDocs(qMov), getDocs(qProp), getDocs(qImp)]);

  let omitidosInvalidos = 0;
  const movimientos: MovimientoBancario[] = [];
  snapMov.forEach((d) => {
    const data = d.data();
    if (esMovimientoBancarioValido(data, propietarioId)) movimientos.push(data);
    else omitidosInvalidos += 1;
  });
  const propuestas: PropuestaConciliacion[] = [];
  snapProp.forEach((d) => {
    const data = d.data();
    if (esPropuestaConciliacionValida(data, propietarioId)) propuestas.push(data);
    else omitidosInvalidos += 1;
  });
  const importaciones: ImportacionBancaria[] = [];
  snapImp.forEach((d) => {
    const data = d.data();
    if (esImportacionBancariaValida(data, propietarioId)) importaciones.push(data);
    else omitidosInvalidos += 1;
  });

  movimientos.sort((a, b) => porFechaEntoncesId(a, b, 'fechaOperacion', 'idMovimiento'));
  propuestas.sort((a, b) => porFechaEntoncesId(a, b, 'fechaPropuesta', 'id'));
  importaciones.sort((a, b) => porFechaEntoncesId(a, b, 'fechaImportacion', 'id'));

  return { movimientos, propuestas, importaciones, omitidosInvalidos };
}

/**
 * Persiste una importación completa (movimientos + propuestas + cabecera) en
 * UN batch atómico. Idempotente por IDs deterministas: reimportar no duplica.
 * Sin propietario persistible no toca Firestore. Propaga errores.
 */
export async function guardarImportacionConciliacion(args: {
  propietarioId: string;
  movimientos: MovimientoBancario[];
  propuestas: PropuestaConciliacion[];
  importacion: ImportacionBancaria;
}): Promise<{ movimientos: number; propuestas: number }> {
  const { propietarioId, movimientos, propuestas, importacion } = args;
  if (!esPropietarioPersistible(propietarioId)) {
    return { movimientos: 0, propuestas: 0 };
  }
  const batch = writeBatch(db);
  for (const m of movimientos) {
    batch.set(
      doc(db, MOVIMIENTOS_BANCARIOS_COL, docIdMovimiento(propietarioId, m)),
      sanitizeObjectForFirestore({ ...m, propietarioId }),
    );
  }
  for (const p of propuestas) {
    batch.set(
      doc(db, CONCILIACIONES_BANCARIAS_COL, docIdPropuesta(propietarioId, p)),
      sanitizeObjectForFirestore({ ...p, propietarioId }),
    );
  }
  batch.set(
    doc(db, IMPORTACIONES_BANCARIAS_COL, docIdImportacion(propietarioId, importacion)),
    sanitizeObjectForFirestore({ ...importacion, propietarioId }),
  );
  await batch.commit();
  return { movimientos: movimientos.length, propuestas: propuestas.length };
}

/**
 * Persiste una transición de propuesta (confirmar/aplicar/rechazar/clasificar)
 * con merge para no perder campos gestionados por otras versiones.
 * Sin propietario persistible no toca Firestore. Propaga errores.
 */
export async function actualizarPropuestaConciliacion(
  propietarioId: string,
  propuesta: PropuestaConciliacion,
): Promise<void> {
  if (!esPropietarioPersistible(propietarioId)) return;
  await setDoc(
    doc(db, CONCILIACIONES_BANCARIAS_COL, docIdPropuesta(propietarioId, propuesta)),
    sanitizeObjectForFirestore({ ...propuesta, propietarioId }),
    { merge: true },
  );
}
