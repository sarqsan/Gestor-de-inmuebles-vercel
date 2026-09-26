/**
 * D3 (parcial) — Proyección de `gestiones_cartera` al contexto de
 * autorización que consumen las Firestore Rules.
 *
 * Por qué existe este módulo (y qué NO es):
 *  · Las reglas de Firestore no pueden consultar una colección: sólo pueden
 *    hacer `get()` de RUTA FIJA. El punto de enforcement de las carteras
 *    gestionadas es por tanto el espejo de identidad `usuarios_auth/{uid}`
 *    (ruta fija = request.auth.uid), que las reglas ya leen como constante.
 *  · Este módulo es la ÚNICA derivación autorizada de
 *    `GestionCartera[] -> { carterasL, carterasE }`. No inventa semántica:
 *    delega en `puedeLeer`/`puedeEscribir` del dominio D1R
 *    (`src/lib/gestionesCartera.ts`), de modo que:
 *      - ACTIVA + LECTURA                        -> sólo carterasL;
 *      - ACTIVA + LECTURA_ESCRITURA + resp. GESTOR -> carterasL + carterasE;
 *      - ACTIVA + LECTURA_ESCRITURA + resp. TITULAR -> sólo carterasL (S7:
 *        la escritura no existe por el mero hecho de existir la gestión);
 *      - SUSPENDIDA                              -> nada (sin acceso operativo);
 *      - REVOCADA + conservarLecturaHistorica    -> sólo carterasL (S7:
 *        lectura histórica ≠ gestión activa);
 *      - REVOCADA sin conservación / PENDIENTE_ACEPTACION -> nada.
 *  · La gestión de una cartera NO modifica titularidad: la proyección sólo
 *    produce listas de `propietarioId` para acotar lecturas/escrituras.
 *
 * LÍMITE DOCUMENTADO (D3 completo): la escritura del espejo con estas listas
 * corresponde al master (reglas del espejo `usuarios_auth/{uid}`). Los custom claims de
 * Firebase Auth NO están disponibles en este repositorio (no existe
 * `firebase-admin` ni backend autorizado para `setCustomUserClaims`, y la
 * orden prohíbe instalarlo/simularlo); si en el futuro se despliega esa
 * infraestructura, la proyección es la misma y sólo cambia el destino.
 *
 * Módulo PURO: cero imports de Firebase.
 */
import { puedeEscribir, puedeLeer, type GestionCartera } from './gestionesCartera';

export interface CarterasProyectadas {
  /** propietarioIds con lectura autorizada (orden estable, sin duplicados). */
  carterasL: string[];
  /** propietarioIds con lectura+escritura autorizada (subconjunto de carterasL). */
  carterasE: string[];
}

/**
 * Proyecta las carteras que un gestor puede leer/escribir según el estado
 * D1R de sus gestiones. Determinista: recorre en el orden dado y deduplica.
 *
 * @param gestiones   gestiones candidatas (típicamente, todas las del gestor).
 * @param gestorUsuarioId id de usuario (`usuarios/{id}`) del gestor.
 */
export function proyectarCarterasGestionadas(
  gestiones: readonly GestionCartera[],
  gestorUsuarioId: string
): CarterasProyectadas {
  const carterasL: string[] = [];
  const carterasE: string[] = [];
  for (const gestion of gestiones) {
    if (!gestion || !gestion.propietarioId) continue;
    if (puedeLeer(gestion, gestorUsuarioId) && !carterasL.includes(gestion.propietarioId)) {
      carterasL.push(gestion.propietarioId);
    }
    if (puedeEscribir(gestion, gestorUsuarioId) && !carterasE.includes(gestion.propietarioId)) {
      carterasE.push(gestion.propietarioId);
    }
  }
  return { carterasL, carterasE };
}

/** Unión deduplicada L ∪ E: ámbito de CONSULTA del gestor (propietariosGestionados). */
export function propietariosGestionadosDe(carteras: CarterasProyectadas): string[] {
  return Array.from(new Set([...carteras.carterasL, ...carteras.carterasE]));
}
