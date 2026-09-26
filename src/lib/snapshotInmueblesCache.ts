/**
 * D2a — Manejo del snapshot de `subscribeInmuebles()` con separación estricta
 * de direcciones de flujo:
 *
 *   Firestore -> estado/caché   (la ÚNICA dirección automática que existe aquí)
 *   caché -> Firestore          (NO existe en este módulo: ni dependencia, ni
 *                                import de firebase, ni callback de escritura)
 *
 * Regla D2a: un snapshot vacío —o una consulta legítimamente acotada con cero
 * resultados— NUNCA se interpreta como permiso para restaurar datos antiguos
 * hacia Firestore. El comportamiento anterior (re-escribir cada inmueble de la
 * caché hacia Firestore cuando el snapshot llegaba vacío) queda
 * eliminado de la ruta automática; con suscripciones acotadas por ámbito, un
 * resultado vacío es un resultado LEGÍTIMO (p. ej. un propietario sin
 * inmuebles propios ni autorizados).
 *
 * La caché local puede seguir existiendo como caché de LECTURA (UX), pero se
 * actualiza únicamente con lo que Firestore acaba de servir.
 */

export interface DependenciasSnapshotInmuebles<T> {
  /** Sincroniza el estado en memoria con el snapshot recibido. */
  setInmuebles: (inmuebles: T[]) => void;
  /**
   * Actualiza la caché de LECTURA (dirección Firestore -> caché).
   * Implementaciones típicas: `localStorage.setItem(...)`. No debe escribir
   * en Firestore: esa dirección no forma parte del flujo de snapshot.
   */
  escribirCacheLectura: (inmuebles: T[]) => void;
}

/**
 * Procesa el payload de `subscribeInmuebles()`.
 *
 * · Snapshot con datos: estado = datos y caché de lectura = datos.
 * · Snapshot vacío/nulo: estado = [] (la consulta acotada es la fuente de
 *   verdad). NO se toca la caché histórica (no se borra: sigue disponible
 *   como caché de lectura previa) y NO se escribe nada en Firestore.
 *
 * Este helper es puro: no importa el SDK de Firebase ni conoce ninguna
 * función de escritura, de modo que es estructuralmente imposible que
 * produzca una restauración caché -> Firestore.
 */
export function procesarSnapshotInmuebles<T>(
  data: T[] | null | undefined,
  deps: DependenciasSnapshotInmuebles<T>
): void {
  const items = Array.isArray(data) ? data : [];
  if (items.length === 0) {
    // Consulta acotada a cero resultados: sólo se sincroniza el estado.
    // Prohibido: restaurar caché -> Firestore, borrar la caché histórica.
    deps.setInmuebles([]);
    return;
  }
  deps.setInmuebles(items);
  deps.escribirCacheLectura(items);
}
