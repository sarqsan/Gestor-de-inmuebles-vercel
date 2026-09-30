/**
 * ORQUESTADOR DE MUTACIONES FIRESTORE
 * ===================================
 * BLOQUE 1 — Portal Propietario: escrituras fiables, rollback y sin efectos colaterales.
 *
 * Antipatrón que este módulo elimina (detectado en auditoría):
 *
 *   const handleDeleteInmueble = (id) => {
 *     setInmuebles(prev => prev.filter(...));   // ① borra en UI
 *     deleteInmuebleFirestore(id);              // ② sin await, sin catch
 *     setCandidatos(... saveCandidatoFirestore) // ③ efectos colaterales SIEMPRE
 *   };
 *
 * Resultado: Firestore rechaza ② con permission-denied, nadie se entera,
 * la tarjeta desaparece y ③ ya ha desvinculado candidatos en la base de datos.
 *
 * Garantías que aporta `ejecutarMutacion`:
 *
 *   1. La persistencia se **espera** (`await`) y se **comprueba**.
 *   2. Si falla → se ejecuta el rollback (`revertir`) y se devuelve el error.
 *   3. Los efectos colaterales (`efectos`) SÓLO se ejecutan si la operación
 *      principal se confirmó. Nunca antes, nunca si falló.
 *   4. El error devuelto es un `ErrorFirestore` con mensaje comprensible.
 *   5. La función es PURA respecto a React: no importa React, no toca estado.
 *      El llamador decide cómo pintar el resultado.
 *
 * Todo es inyectado por el llamador ⇒ 100 % testeable sin Firestore ni React.
 */

import { AVISO_NO_GUARDADO, ErrorFirestore, normalizarErrorFirestore } from './erroresFirestore';

/**
 * Resultado de una mutación. Nunca lanza: siempre devuelve.
 *
 * NOTA: el discriminante es de TEXTO (`estado`) y no un booleano porque el
 * proyecto NO compila con `strict`; sin `strictNullChecks`, TypeScript no
 * estrecha uniones discriminadas por literales `true`/`false`.
 */
export type ResultadoMutacion =
  | { estado: 'OK'; efectosEjecutados: boolean; errorEfectos?: ErrorFirestore }
  | { estado: 'KO'; error: ErrorFirestore; revertido: boolean };

export interface OpcionesMutacion {
  /** Descripción legible de la operación, para mensajes y auditoría. */
  operacion: string;

  /**
   * Persistencia real. DEBE lanzar si Firestore rechaza la operación.
   * Se invoca exactamente una vez y se espera (`await`).
   */
  persistir: () => Promise<void>;

  /**
   * Actualización optimista de la UI. Opcional.
   * Se recomienda usarla sólo cuando el rollback sea trivial y fiable.
   */
  aplicarOptimista?: () => void;

  /**
   * Rollback: deja la UI exactamente como estaba antes de `aplicarOptimista`.
   * Se invoca SIEMPRE que `persistir` falla y se haya aplicado optimismo.
   */
  revertir?: () => void;

  /**
   * Efectos secundarios sobre OTRAS entidades (candidatos, contratos, fichas…).
   * SÓLO se ejecutan si `persistir` resolvió correctamente.
   * Si alguno falla, la operación principal YA está confirmada: no se revierte,
   * pero se informa del fallo parcial (`errorEfectos`).
   */
  efectos?: () => Promise<void>;

  /** Notificación de éxito (toast, mensaje…). Sólo si todo fue bien. */
  alExito?: () => void;

  /** Notificación de error. Recibe el error ya normalizado. */
  alError?: (error: ErrorFirestore) => void;

  /** Aviso que se añade al mensaje de usuario cuando falla. */
  avisoFallo?: string;

  /** Logger inyectable (por defecto `console.error`). */
  log?: (mensaje: string, ...args: unknown[]) => void;
}

/**
 * Ejecuta una mutación con persistencia comprobada, rollback y efectos
 * colaterales condicionados al éxito de la operación principal.
 *
 * Orden estricto:
 *   1. aplicarOptimista?()
 *   2. await persistir()          ← si falla: revertir?() + alError + return {ok:false}
 *   3. await efectos?.()          ← si falla: alError(parcial) + return {ok:true, errorEfectos}
 *   4. alExito?()
 */
export async function ejecutarMutacion(opciones: OpcionesMutacion): Promise<ResultadoMutacion> {
  const {
    operacion,
    persistir,
    aplicarOptimista,
    revertir,
    efectos,
    alExito,
    alError,
    avisoFallo = AVISO_NO_GUARDADO,
    log = (m: string, ...a: unknown[]) => console.error(m, ...a),
  } = opciones;

  const aplicoOptimismo = typeof aplicarOptimista === 'function';
  if (aplicoOptimismo) aplicarOptimista!();

  // --- 2. Persistencia REAL y comprobada -----------------------------------
  try {
    await persistir();
  } catch (err) {
    const error = normalizarErrorFirestore(err, operacion, avisoFallo);
    log(`[mutacion][KO] ${operacion}:`, error.mensajeTecnico);

    // Rollback completo: la UI vuelve exactamente a su estado anterior.
    if (aplicoOptimismo && typeof revertir === 'function') {
      try {
        revertir();
      } catch (errRevert) {
        log(`[mutacion] fallo adicional al revertir "${operacion}":`, errRevert);
      }
    }

    alError?.(error);
    return { estado: 'KO', error, revertido: aplicoOptimismo && typeof revertir === 'function' };
  }

  // --- 3. Efectos colaterales: SÓLO si la operación principal se confirmó ---
  if (typeof efectos === 'function') {
    try {
      await efectos();
    } catch (err) {
      const errorEfectos = normalizarErrorFirestore(
        err,
        `${operacion} (operaciones relacionadas)`,
        'La operación principal SÍ se ha guardado, pero algunas acciones asociadas no se completaron.'
      );
      log(`[mutacion][efectos] ${operacion}:`, errorEfectos.mensajeTecnico);
      alError?.(errorEfectos);
      return { estado: 'OK', efectosEjecutados: false, errorEfectos };
    }
  }

  // --- 4. Éxito ------------------------------------------------------------
  alExito?.();
  return { estado: 'OK', efectosEjecutados: typeof efectos === 'function' };
}

/**
 * Variante sin optimismo: la UI se actualiza SÓLO tras la confirmación.
 * Es la recomendada por defecto para operaciones destructivas (bajas, borrados).
 */
export async function ejecutarMutacionConfirmada(
  opciones: OpcionesMutacion & {
    /** Se ejecuta SÓLO después de que Firestore haya confirmado. */
    alConfirmar: () => void;
  }
): Promise<ResultadoMutacion> {
  const { alConfirmar, ...resto } = opciones;
  return ejecutarMutacion({
    ...resto,
    alExito: () => {
      alConfirmar();
      resto.alExito?.();
    },
  });
}
