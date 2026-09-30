/**
 * MUTACIONES CON VEREDICTO REAL DE PERSISTENCIA
 * ==============================================
 * Envoltorio de `ejecutarOperacion` (BLOQUE 10 · UX-3) que NO relaja ninguna
 * de sus garantías:
 *
 *  · si la acción lanza → fallo;
 *  · si la acción devuelve `false` → fallo (contrato booleano B5);
 *  · si la capa de datos registra un fallo de guardado → fallo;
 *  · sólo entonces → éxito (y sólo entonces se muestra el aviso de éxito).
 *
 * Lo que AÑADE es que, cuando hay fallo, el aviso muestra el MOTIVO real
 * (`permission-denied`, red, datos…) en lugar de un genérico que oculta el
 * problema: se sustituye el aviso genérico emitido por `ejecutarOperacion`.
 */
import {
  avisarOperacion,
  avisosOperacion,
  descartarAvisoOperacion,
} from '../feedback/canalFeedback';
import { ejecutarOperacion } from '../feedback/operaciones';
import type { MotivoFalloOperacion, OpcionesOperacion, ResultadoOperacion } from '../feedback/operaciones';
import { mensajeErrorOperacion } from './erroresFirestore';

export interface OpcionesMutacion<T> extends OpcionesOperacion<T> {
  /**
   * `true` (por defecto): sustituye el mensaje genérico por el motivo real del
   * error. El aviso nunca se elimina: sólo se reemplaza por uno más útil.
   */
  concretarError?: boolean;
}

/** Sustituye el aviso de error genérico por el motivo concreto. */
function concretarAvisoError(error: unknown, mensajeGenerico: string): void {
  const especifico = mensajeErrorOperacion(error, mensajeGenerico);
  if (especifico === mensajeGenerico) return;
  for (const aviso of avisosOperacion()) {
    if (aviso.tipo === 'error' && aviso.mensaje === mensajeGenerico) descartarAvisoOperacion(aviso.id);
  }
  avisarOperacion({ tipo: 'error', mensaje: especifico });
}

export async function ejecutarMutacion<T>(opciones: OpcionesMutacion<T>): Promise<ResultadoOperacion<T>> {
  const { concretarError = true, ...resto } = opciones;
  const resultado = await ejecutarOperacion<T>(resto);
  if (!resultado.ok && concretarError) {
    const fallo = resultado as { ok: false; motivo: MotivoFalloOperacion; error?: unknown };
    if (fallo.motivo === 'excepcion') concretarAvisoError(fallo.error, opciones.mensajeError);
  }
  return resultado;
}

export type { MotivoFalloOperacion, ResultadoOperacion };
