/**
 * PUBLICACIÓN ↔ CICLO DE VIDA PATRIMONIAL (BLOQUE 3 · 3.6)
 * ========================================================
 * Cuando un inmueble se VENDE o se DA DE BAJA, su publicación activa debe
 * RETIRARSE. Retirar NO es borrar (mismo criterio que `sindicacion_inmuebles`):
 *
 *   · la publicación pasa a `DESPUBLICADO`;
 *   · se anota el motivo y la fecha de la retirada (trazabilidad);
 *   · el registro SIGUE EXISTIENDO y es consultable.
 *
 * Sólo se retiran las publicaciones realmente publicadas
 * (`PUBLICADO` / `ACTUALIZADO`); el resto se respeta tal cual.
 *
 * Módulo PURO: no escribe, no borra, no depende de Firestore.
 */

/** Estados que significan "está publicado ahora mismo". */
export const ESTADOS_PUBLICADOS: string[] = ['PUBLICADO', 'ACTUALIZADO'];

/** Forma mínima que debe cumplir un registro de publicación. */
export interface RegistroPublicacion {
  inmuebleId?: string;
  externalId?: string;
  estado?: string;
}

export interface RetiradaPublicacion<T> {
  registro: T & { motivoRetirada?: string; fechaRetirada?: string };
  /** ¿Se ha retirado en esta operación? */
  retirada: boolean;
  /** Motivo por el que NO se ha retirado (si procede). */
  detalle?: string;
}

/** ¿El registro pertenece al inmueble indicado? */
function perteneceA<T extends RegistroPublicacion>(registro: T, inmuebleId: string): boolean {
  if (typeof registro.inmuebleId === 'string') return registro.inmuebleId === inmuebleId;
  // Algunos modelos sólo guardan el `externalId` derivado de (inmueble, portal).
  if (typeof registro.externalId === 'string') return registro.externalId.includes(inmuebleId);
  return false;
}

/**
 * Retira las publicaciones activas del inmueble indicado.
 *
 * @param registros Publicaciones actuales.
 * @param inmuebleId Inmueble vendido / dado de baja.
 * @param motivo    Motivo de la retirada (se conserva como trazabilidad).
 */
export function retirarPublicacionesTrasBaja<T extends RegistroPublicacion>(
  registros: T[],
  inmuebleId: string,
  motivo = 'Retirada automática por venta/baja patrimonial'
): Array<RetiradaPublicacion<T>> {
  return registros.map((registro) => {
    if (!perteneceA(registro, inmuebleId)) {
      return { registro: { ...registro }, retirada: false, detalle: 'Pertenece a otro inmueble.' };
    }

    if (!ESTADOS_PUBLICADOS.includes(String(registro.estado))) {
      return {
        registro: { ...registro },
        retirada: false,
        detalle: `La publicación ya estaba en "${registro.estado}": no requiere retirada.`,
      };
    }

    // RETIRAR ≠ BORRAR: se despublica y se anota el motivo.
    return {
      registro: {
        ...registro,
        estado: 'DESPUBLICADO',
        motivoRetirada: motivo,
        fechaRetirada: new Date().toISOString(),
      } as T & { motivoRetirada?: string; fechaRetirada?: string },
      retirada: true,
    };
  });
}

/** ¿Cuántas publicaciones se han retirado? (para el aviso al usuario). */
export function contarRetiradas<T>(resultado: Array<RetiradaPublicacion<T>>): number {
  return resultado.filter((r) => r.retirada).length;
}
