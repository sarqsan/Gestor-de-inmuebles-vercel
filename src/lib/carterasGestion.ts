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
    // El espejo sólo expresa propietarioIds, no inmuebleIds. Proyectar una
    // delegación PARCIAL como cartera completa abriría todos los inmuebles y
    // recursos del titular en Firestore/Storage. Hasta ROADMAP-03 (enforcement
    // por inmueble), una relación limitada no concede acceso operativo.
    if (!Array.isArray(gestion.inmuebleIds) || gestion.inmuebleIds.length !== 0) continue;
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

/**
 * Inmuebles legibles por una delegación parcial ACTIVA y aceptada.
 * Es únicamente un ámbito de consulta del cliente: las Rules vuelven a
 * comprobar relación, estado, inmuebleId y permiso en cada operación.
 */
export interface InmuebleDelegadoParcial {
  propietarioId: string;
  inmuebleId: string;
}

export function ambitosInmueblesParcialesActivosDe(
  gestiones: readonly GestionCartera[],
  gestorUsuarioId: string
): InmuebleDelegadoParcial[] {
  const pares = new Map<string, InmuebleDelegadoParcial>();
  for (const gestion of gestiones) {
    if (!gestion || gestion.gestorUsuarioId !== gestorUsuarioId
      || gestion.estado !== 'ACTIVA' || gestion.resolucionInvitacion !== 'ACEPTADA'
      || !Array.isArray(gestion.inmuebleIds) || gestion.inmuebleIds.length === 0) continue;
    for (const inmuebleId of gestion.inmuebleIds) {
      if (typeof inmuebleId !== 'string' || !inmuebleId) continue;
      const clave = `${gestion.propietarioId}:${inmuebleId}`;
      pares.set(clave, { propietarioId: gestion.propietarioId, inmuebleId });
    }
  }
  return Array.from(pares.values());
}

export function inmueblesParcialesActivosDe(
  gestiones: readonly GestionCartera[],
  gestorUsuarioId: string
): string[] {
  return Array.from(new Set(ambitosInmueblesParcialesActivosDe(gestiones, gestorUsuarioId).map((p) => p.inmuebleId)));
}

/** Subconjunto parcial con permiso de escritura vigente según el dominio D1R. */
export function inmueblesParcialesEscrituraDe(
  gestiones: readonly GestionCartera[],
  gestorUsuarioId: string
): string[] {
  const ids = new Set<string>();
  for (const gestion of gestiones) {
    if (!gestion || gestion.gestorUsuarioId !== gestorUsuarioId
      || gestion.estado !== 'ACTIVA' || gestion.resolucionInvitacion !== 'ACEPTADA'
      || !Array.isArray(gestion.inmuebleIds) || gestion.inmuebleIds.length === 0
      || !puedeEscribir(gestion, gestorUsuarioId)) continue;
    for (const inmuebleId of gestion.inmuebleIds) if (inmuebleId) ids.add(inmuebleId);
  }
  return Array.from(ids);
}

/**
 * Ids de las gestiones que el espejo propio (`usuarios_auth/{uid}.gestionesPorPropietario`)
 * indexa para esta persona: `{ [propietarioId]: gestionId }` → los `gestionId`, sin
 * duplicados y descartando cualquier valor que no pueda ser id de documento.
 *
 * Es el MISMO índice con el que las Rules autorizan los inmuebles delegados
 * (`gestionActivaCompletaIndexada` / `inmuebleParcialIndexado`), de modo que leer las
 * gestiones por estos ids no ve ni más ni menos que lo que las reglas ya consideran
 * «mis relaciones». Con él la capa de datos lee cada relación con un `get` (evaluado
 * sobre el documento real) en lugar de depender de que el motor demuestre una consulta
 * de colección (`where gestorUsuarioId ==`). No autoriza nada: cada `get` lo decide la
 * regla de `gestiones_cartera`.
 */
export function idsGestionesIndexadas(indice: unknown): string[] {
  if (!indice || typeof indice !== 'object' || Array.isArray(indice)) return [];
  const ids = new Set<string>();
  for (const valor of Object.values(indice as Record<string, unknown>)) {
    // Mismo criterio que `isValidId` de las reglas (1–128) y un id de documento no lleva «/».
    if (typeof valor === 'string' && valor.length > 0 && valor.length <= 128 && !valor.includes('/')) ids.add(valor);
  }
  return Array.from(ids);
}

/**
 * Índice de resolución de gestiones vigentes por titular. A diferencia de
 * carterasL/E, incluye delegaciones parciales: el índice solo permite a Rules
 * localizar la relación canónica; inmuebleIds y el estado se revalidan en
 * cada acceso. No es una proyección de permisos por sí mismo.
 */
export function indexarGestionesActivas(
  gestiones: readonly GestionCartera[],
  gestorUsuarioId: string
): Record<string, string> {
  const indice: Record<string, string> = {};
  for (const gestion of gestiones) {
    if (!gestion || !gestion.propietarioId || gestion.gestorUsuarioId !== gestorUsuarioId
      || gestion.estado !== 'ACTIVA' || gestion.resolucionInvitacion !== 'ACEPTADA') continue;
    indice[gestion.propietarioId] = gestion.id;
  }
  return indice;
}
