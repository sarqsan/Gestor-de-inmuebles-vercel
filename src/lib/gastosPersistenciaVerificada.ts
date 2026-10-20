import { deleteDoc, doc, getDocFromServer, setDoc } from 'firebase/firestore';
import type { Gasto } from '../types';
import { db, sanitizeObjectForFirestore } from './firebase';

/**
 * P5.2-A · PERSISTENCIA VERIFICADA DE GASTOS (para el flujo OCR)
 * =======================================================================
 * `saveGastoFirestore`/`deleteGastoFirestore` (API histórica de
 * `firebase.ts`) son *best-effort*: capturan el error, lo registran y
 * RESUELVEN, así que sus llamantes no pueden distinguir éxito de fracaso.
 * El flujo OCR encadena gasto→custodia→enlace y necesita lo contrario:
 * saber con certeza qué se escribió antes de anunciar ningún éxito.
 *
 * Estas funciones:
 *  · LANZAN si Firestore rechaza la operación (permisos, red…).
 *  · Tras el asentimiento del servidor, RELEEN el documento desde el
 *    servidor (`getDocFromServer`, sin caché local) y comprueban los
 *    campos críticos esperados. Si la relectura no confirma, lanzan un
 *    error de VERIFICACIÓN distinguible del de escritura: el llamante no
 *    debe anunciar éxito, aunque la escritura pudiera haber llegado.
 *  · NO proporcionan atomicidad entre documentos ni rollback: la
 *    recuperación ante fallos parciales vive en `flujoFacturaOcr` y se
 *    describe en los mensajes al usuario tal como queda el estado real.
 *
 * Alcance deliberado: las usan el escáner OCR y su recuperación. El resto
 * de la aplicación conserva la API histórica (cambiarla globalmente
 * afectaría a llamantes que hoy no gestionan rechazos; es deuda anotada,
 * fuera del alcance P5.2).
 */

export type EtapaPersistenciaGasto = 'ESCRITURA' | 'VERIFICACION' | 'BORRADO' | 'VERIFICACION_BORRADO';

export class ErrorPersistenciaGasto extends Error {
  readonly etapa: EtapaPersistenciaGasto;
  readonly gastoId: string;
  constructor(etapa: EtapaPersistenciaGasto, gastoId: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorPersistenciaGasto';
    this.etapa = etapa;
    this.gastoId = gastoId;
  }
}

const codigoDe = (error: unknown): string | undefined => (error as { code?: string })?.code;
/** Motivo apto para la persona usuaria (sin mensajes internos de Firebase). */
const detalle = (error: unknown): string => {
  switch (codigoDe(error)) {
    case 'permission-denied':
      return 'tu cuenta no tiene permiso para esta operación sobre este gasto';
    case 'unauthenticated':
      return 'la sesión ha caducado; vuelve a iniciar sesión';
    case 'unavailable':
    case 'deadline-exceeded':
      return 'el servidor no respondió a tiempo; comprueba la conexión';
    case 'not-found':
      return 'el gasto ya no existe en el servidor';
    default:
      return error instanceof Error ? error.message : 'error desconocido';
  }
};

/**
 * Guarda el gasto y confirma contra el servidor que quedó persistido con
 * los enlaces esperados. Devuelve el gasto tal como se envió (la relectura
 * se usa para verificar, no para sustituir silenciosamente los datos).
 */
export async function guardarGastoVerificado(gasto: Gasto): Promise<Gasto> {
  const referencia = doc(db, 'gastos', gasto.id);
  try {
    await setDoc(referencia, sanitizeObjectForFirestore(gasto), { merge: true });
  } catch (error) {
    throw new ErrorPersistenciaGasto('ESCRITURA', gasto.id, `Firestore no aceptó el guardado del gasto. Motivo: ${detalle(error)}`);
  }

  let persistido: Record<string, unknown> | undefined;
  try {
    const snap = await getDocFromServer(referencia);
    if (!snap.exists()) {
      throw new ErrorPersistenciaGasto('VERIFICACION', gasto.id, 'El gasto no aparece en el servidor tras guardarlo; no se da por guardado.');
    }
    persistido = snap.data() as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ErrorPersistenciaGasto) throw error;
    throw new ErrorPersistenciaGasto('VERIFICACION', gasto.id, `No se pudo verificar en el servidor que el gasto quedó guardado (la escritura pudo haber llegado). Motivo: ${detalle(error)}`);
  }

  const ocrPersistido = (persistido.facturaOcr || undefined) as { documentoId?: unknown } | undefined;
  const documentoPersistido = (persistido.documento || undefined) as { id?: unknown } | undefined;
  if (gasto.facturaOcr?.documentoId && ocrPersistido?.documentoId !== gasto.facturaOcr.documentoId) {
    throw new ErrorPersistenciaGasto('VERIFICACION', gasto.id, 'El gasto quedó guardado sin el enlace al documento esperado; no se da el alta por completada.');
  }
  if (gasto.documento?.id && documentoPersistido?.id !== gasto.documento.id) {
    throw new ErrorPersistenciaGasto('VERIFICACION', gasto.id, 'El gasto quedó guardado sin la referencia documental esperada; no se da el alta por completada.');
  }
  if (persistido.estado !== gasto.estado || persistido.inmuebleId !== gasto.inmuebleId) {
    throw new ErrorPersistenciaGasto('VERIFICACION', gasto.id, 'El gasto guardado en el servidor no coincide con el enviado (estado o inmueble); no se da el alta por completada.');
  }
  return gasto;
}

/**
 * Borra el gasto y LANZA si el servidor lo deniega (con las reglas
 * actuales, un gestor de cartera puede no tener permiso de borrado: el
 * llamante debe prever una neutralización alternativa, p. ej. anular).
 * La confirmación de ausencia es el asentimiento del borrado más una
 * relectura: si el documento sigue legible y existiendo, lanza. Una
 * relectura con `permission-denied` tras un borrado aceptado es
 * indistinguible de «ya no existe» para las reglas de lectura por ámbito,
 * y se acepta como borrado (limitación documentada, no éxito inventado:
 * el servidor ya había aceptado la eliminación).
 */
export async function eliminarGastoVerificado(gastoId: string): Promise<void> {
  const referencia = doc(db, 'gastos', gastoId);
  try {
    await deleteDoc(referencia);
  } catch (error) {
    throw new ErrorPersistenciaGasto('BORRADO', gastoId, `Firestore no aceptó el borrado del gasto. Motivo: ${detalle(error)}`);
  }
  try {
    const snap = await getDocFromServer(referencia);
    if (snap.exists()) {
      throw new ErrorPersistenciaGasto('VERIFICACION_BORRADO', gastoId, 'El gasto sigue existiendo en el servidor tras intentar borrarlo.');
    }
  } catch (error) {
    if (error instanceof ErrorPersistenciaGasto) throw error;
    if (codigoDe(error) !== 'permission-denied') {
      throw new ErrorPersistenciaGasto('VERIFICACION_BORRADO', gastoId, `No se pudo verificar el borrado del gasto en el servidor. Motivo: ${detalle(error)}`);
    }
  }
}
