/**
 * B — Lógica local de invitaciones y candidatos (deltas de Arena C).
 * ---------------------------------------------------------------------------
 * Recupera de C (`App.tsx`, commit a6ac280, `handleSaveInvitacion` /
 * `handleAddCandidato`):
 *  A) transición explícita `nuevo → preseleccionado` del candidato al guardar
 *     su invitación (sólo cuando el candidato existe y está en `nuevo`);
 *  B) defensa local contra duplicados de candidato por id;
 *  C) contador `candidatosCount` seguro ante valor inexistente/null.
 *
 * ADAPTACIÓN a main:
 *  · Funciones puras sobre listas; `App.tsx` las aplica y persiste con las
 *    funciones canónicas (`saveInvitacionFirestore`, `saveCandidatoFirestore`,
 *    `saveInmuebleFirestore`). No se escribe en `localStorage` desde estos
 *    manejadores (main persiste la caché en las suscripciones, no en cada
 *    handler como C): la coherencia entre pestañas vive en
 *    `src/lib/sincronizacionPestanas.ts`, no aquí.
 *  · La persistencia es best-effort por construcción (`persistirMejorEsfuerzo`:
 *    captura errores, no reintenta, no revierte el estado local). Estas
 *    defensas son de ESTADO LOCAL: NO son idempotencia transaccional y NO
 *    alteran el modelo de persistencia canónico.
 *  · La transición sólo se aplica desde `nuevo`: cualquier otro estado
 *    (`preseleccionado`, `visita_reservada`, …) se respeta tal cual, sin
 *    convertir el guardado en una transición de negocio distinta de la que
 *    indica la lógica canónica de main.
 */
import type { Candidato, Inmueble, InvitacionVisita } from '../types';

/** Upsert local de invitación por id (conserva el orden; actualiza in situ). */
export function upsertInvitacionLocal(
  actuales: readonly InvitacionVisita[],
  inv: InvitacionVisita
): InvitacionVisita[] {
  const idx = actuales.findIndex((i) => i.id === inv.id);
  if (idx < 0) return [...actuales, inv];
  const next = [...actuales];
  next[idx] = inv;
  return next;
}

/**
 * Transición `nuevo → preseleccionado` ligada al guardado de una invitación.
 * Devuelve la lista resultante y el candidato actualizado (o `null` cuando no
 * corresponde transición: candidato inexistente o en otro estado).
 */
export function transicionPreseleccionPorInvitacion(
  candidatos: readonly Candidato[],
  inv: InvitacionVisita
): { candidatos: Candidato[]; actualizado: Candidato | null } {
  let actualizado: Candidato | null = null;
  const next = candidatos.map((c) => {
    if (c.id === inv.candidateId && c.estado === 'nuevo') {
      actualizado = { ...c, estado: 'preseleccionado' as const };
      return actualizado;
    }
    return c;
  });
  return { candidatos: actualizado ? next : [...candidatos], actualizado };
}

/** Alta local con defensa contra duplicados por id (el nuevo queda primero). */
export function agregarCandidatoSinDuplicados(
  actuales: readonly Candidato[],
  nuevo: Candidato
): Candidato[] {
  return [nuevo, ...actuales.filter((c) => c.id !== nuevo.id)];
}

/**
 * Incremento seguro del contador de candidatos del inmueble. Un valor
 * inexistente/null/NaN se trata como 0. Si el inmueble no está en la lista,
 * devuelve la lista intacta y `actualizado: null`.
 */
export function incrementarContadorCandidatos(
  inmuebles: readonly Inmueble[],
  inmuebleId: string
): { inmuebles: Inmueble[]; actualizado: Inmueble | null } {
  let actualizado: Inmueble | null = null;
  const next = inmuebles.map((inm) => {
    if (inm.id !== inmuebleId) return inm;
    const base = typeof inm.candidatosCount === 'number' && Number.isFinite(inm.candidatosCount)
      ? inm.candidatosCount
      : 0;
    actualizado = { ...inm, candidatosCount: base + 1 };
    return actualizado;
  });
  return { inmuebles: actualizado ? next : [...inmuebles], actualizado };
}

export interface PlanGuardadoInvitacion {
  readonly invitaciones: InvitacionVisita[];
  readonly candidatos: Candidato[];
  /** Candidato a persistir cuando hubo transición, o `null`. */
  readonly candidatoAPersistir: Candidato | null;
}

/** Plan local completo de `handleSaveInvitacion` (listas + qué persistir). */
export function planificarGuardadoInvitacion(
  invitaciones: readonly InvitacionVisita[],
  candidatos: readonly Candidato[],
  inv: InvitacionVisita
): PlanGuardadoInvitacion {
  const transicion = transicionPreseleccionPorInvitacion(candidatos, inv);
  return {
    invitaciones: upsertInvitacionLocal(invitaciones, inv),
    candidatos: transicion.candidatos,
    candidatoAPersistir: transicion.actualizado,
  };
}

export interface PlanAltaCandidato {
  readonly candidatos: Candidato[];
  readonly inmuebles: Inmueble[];
  /** Inmueble a persistir cuando se actualizó su contador, o `null`. */
  readonly inmuebleAPersistir: Inmueble | null;
}

/** Plan local completo de `handleAddCandidato` (listas + qué persistir). */
export function planificarAltaCandidato(
  candidatos: readonly Candidato[],
  inmuebles: readonly Inmueble[],
  nuevo: Candidato
): PlanAltaCandidato {
  const contador = incrementarContadorCandidatos(inmuebles, nuevo.inmuebleId);
  return {
    candidatos: agregarCandidatoSinDuplicados(candidatos, nuevo),
    inmuebles: contador.inmuebles,
    inmuebleAPersistir: contador.actualizado,
  };
}

/**
 * Ejecuta tareas de persistencia en orden capturando errores. Nunca lanza:
 * devuelve los errores capturados. Contrato best-effort explícito — NO es
 * transaccionalidad ni idempotencia: un fallo deja Firestore por detrás del
 * estado local hasta la próxima sincronización/guardado.
 */
export async function persistirMejorEsfuerzo(
  tareas: ReadonlyArray<() => unknown | Promise<unknown>>
): Promise<{ errores: unknown[] }> {
  const errores: unknown[] = [];
  for (const tarea of tareas) {
    try {
      await tarea();
    } catch (err) {
      errores.push(err);
    }
  }
  return { errores };
}
