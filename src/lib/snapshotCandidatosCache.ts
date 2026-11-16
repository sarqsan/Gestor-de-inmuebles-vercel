/**
 * AG-09 — Manejo del snapshot de `subscribeCandidatos()` con la MISMA regla D2a
 * que ya rige para inmuebles (`snapshotInmueblesCache.ts`):
 *
 *   Firestore -> estado/caché   (la ÚNICA dirección automática que existe aquí)
 *   caché -> Firestore          (NO existe en este módulo: ni dependencia, ni
 *                                import de firebase, ni callback de escritura)
 *
 * QUÉ HABÍA ANTES
 * El callback de candidatos en `App.tsx` hacía, ante un snapshot vacío:
 *
 *   setCandidatos((current) => {
 *     if (current.length > 0) {
 *       current.forEach((c) => saveCandidatoFirestore(c));   // ← escritura
 *       return current;
 *     }
 *     return [];
 *   });
 *
 * Es decir: si Firestore devolvía una lista vacía, se **reescribían en Firestore
 * todos los candidatos que hubiera en memoria** (procedentes de `localStorage`).
 *
 * POR QUÉ ES UN DEFECTO
 * · Para el personal (que sí recibe `list` global), un snapshot vacío puede
 *   significar una lista LEGÍTIMAMENTE vacía. Reescribir la caché **resucita
 *   candidatos ya borrados**: vuelven a Firestore con sus datos personales.
 * · Para el resto de perfiles, la escritura se deniega → bucle de escrituras
 *   denegadas, incidencias y ruido en cada sesión.
 * · Contradice frontalmente la norma D2a aplicada a inmuebles, que prohíbe
 *   explícitamente restaurar caché → Firestore.
 *
 * QUÉ HACE AHORA
 * Igual que inmuebles: un snapshot vacío sincroniza el estado a `[]` (la consulta
 * acotada es la fuente de verdad) y NO toca Firestore ni borra la caché de
 * lectura histórica.
 *
 * El módulo es puro: no importa el SDK de Firebase ni ninguna función de
 * escritura, de modo que es estructuralmente imposible que restaure datos.
 */

export interface DependenciasSnapshotCandidatos<T> {
  /** Sincroniza el estado en memoria con el snapshot recibido. */
  setCandidatos: (candidatos: T[]) => void;
  /**
   * Actualiza la caché de LECTURA (dirección Firestore -> caché).
   * Implementaciones típicas: `localStorage.setItem(...)`. No debe escribir
   * en Firestore: esa dirección no forma parte del flujo de snapshot.
   */
  escribirCacheLectura: (candidatos: T[]) => void;
}

/**
 * Procesa el payload de `subscribeCandidatos()`.
 *
 * · Snapshot con datos: estado = datos y caché de lectura = datos.
 * · Snapshot vacío/nulo: estado = [] (la consulta es la fuente de verdad). NO se
 *   escribe nada en Firestore y NO se borra la caché histórica, que sigue
 *   disponible como caché de lectura previa.
 */
export function procesarSnapshotCandidatos<T>(
  data: T[] | null | undefined,
  deps: DependenciasSnapshotCandidatos<T>
): void {
  const items = Array.isArray(data) ? data : [];
  if (items.length === 0) {
    // Snapshot vacío: sólo se sincroniza el estado.
    // Prohibido: restaurar caché -> Firestore, borrar la caché histórica.
    deps.setCandidatos([]);
    return;
  }
  deps.setCandidatos(items);
  deps.escribirCacheLectura(items);
}
