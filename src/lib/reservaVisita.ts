/**
 * B — Confirmación de reserva de visita pública (delta de Arena C corregido).
 * ---------------------------------------------------------------------------
 * Fuente C: `PortalVisitaPublicaView.tsx` + `bookSlotTransaction` (commit
 * a6ac280 / head 1686b8e). Se recupera la actualización local inmediata
 * DESPUÉS de una reserva confirmada, con la secuencia obligatoria:
 *
 *   1. ejecutar la operación remota (`bookSlotTransaction`, atómica);
 *   2. comprobar el resultado;
 *   3. sólo si está confirmada → actualizar slot/invitación/candidato en
 *      local y mostrar éxito;
 *   4. si falla → NO marcar como confirmada, NO tocar el estado local de la
 *      reserva y conservar el estado de error.
 *
 * Lo que NO se porta de C (deliberado):
 *  · C actualizaba el estado local y mostraba éxito SIEMPRE, incluso cuando
 *    la transacción fallaba (`try/catch` vacío + actualización incondicional).
 *    Esa confirmación optimista convertida en éxito real NO se reproduce:
 *    mostraría una reserva que Firestore rechazó (doble reserva del mismo
 *    slot). Tampoco se reproduce el `fallback` de main anterior, que sólo
 *    actualizaba en local en el `catch` y anunciaba éxito en el `finally`.
 *  · C usa `transaction.set(..., { merge: true })` para el candidato dentro
 *    de `bookSlotTransaction`, lo que CREA el documento si no existe. Main
 *    usa `transaction.update` (falla si el candidato no existe): se conserva
 *    el cierre en fallo de main — una reserva anónima no debe fabricar
 *    registros de candidato — y el error se propaga como "no confirmada".
 */
import type { CandidateStatus, InvitacionVisita, VisitSlot } from '../types';

export const MENSAJE_RESERVA_CONFIRMADA = '¡Reserva confirmada con éxito!';
export const MENSAJE_RESERVA_FALLIDA = 'No se pudo confirmar la reserva. Inténtalo de nuevo.';

export interface DatosReservaLocal {
  readonly invitacion: InvitacionVisita;
  readonly slot: VisitSlot;
  readonly direccionCompleta: string;
  readonly notas: string;
  readonly ahoraIso: string;
}

export interface ActualizacionReservaLocal {
  readonly slot: VisitSlot;
  readonly invitacion: InvitacionVisita;
  readonly candidatoId: string;
  readonly nuevoEstadoCandidato: CandidateStatus;
}

/**
 * Construye la actualización local posterior al éxito (pura). No necesita
 * que el candidato exista en local: sólo transporta su id y el nuevo estado;
 * el reductor (`handleUpdateStatus`) ignora ids desconocidos sin errores.
 */
export function construirActualizacionReservaLocal(datos: DatosReservaLocal): ActualizacionReservaLocal {
  const slot: VisitSlot = {
    ...datos.slot,
    disponible: false,
    reservaCandidateId: datos.invitacion.candidateId,
    reservaCandidateNombre: datos.invitacion.candidateNombre,
    reservaInvitationId: datos.invitacion.id,
  };
  const invitacion: InvitacionVisita = {
    ...datos.invitacion,
    status: 'HORARIO RESERVADO',
    bookedAt: datos.ahoraIso,
    reserva: {
      slotId: datos.slot.id,
      fecha: datos.slot.fecha,
      horaInicio: datos.slot.horaInicio,
      horaFin: datos.slot.horaFin,
      direccionCompleta: datos.direccionCompleta,
      notasCandidato: datos.notas || '',
    },
  };
  return {
    slot,
    invitacion,
    candidatoId: datos.invitacion.candidateId,
    nuevoEstadoCandidato: 'visita_reservada',
  };
}

export interface DependenciasReservaVisita {
  /** Operación remota atómica. Si rechaza, la reserva NO está confirmada. */
  readonly reservarRemoto: () => Promise<unknown>;
  readonly alConfirmarSlot: (slot: VisitSlot) => void;
  readonly alConfirmarInvitacion: (inv: InvitacionVisita) => void;
  readonly alConfirmarCandidato?: (candidateId: string, estado: CandidateStatus) => void;
  readonly alExito: (mensaje: string) => void;
  readonly alError: (mensaje: string) => void;
  /** Reloj inyectable (tests deterministas). */
  readonly relojAhoraIso?: () => string;
}

function mensajeDeError(err: unknown): string {
  if (err instanceof Error && err.message.trim() !== '') return err.message;
  if (typeof err === 'string' && err.trim() !== '') return err;
  return MENSAJE_RESERVA_FALLIDA;
}

/**
 * Orquesta la confirmación: remoto primero; sólo ante éxito confirmado,
 * actualización local + éxito. Ante fallo: error conservado, cero
 * actualizaciones locales de reserva, cero mensaje de éxito.
 */
export async function confirmarReservaVisita(
  deps: DependenciasReservaVisita,
  args: Omit<DatosReservaLocal, 'ahoraIso'>
): Promise<{ confirmada: boolean }> {
  try {
    await deps.reservarRemoto();
  } catch (err) {
    deps.alError(mensajeDeError(err));
    return { confirmada: false };
  }
  const actualizacion = construirActualizacionReservaLocal({
    ...args,
    ahoraIso: deps.relojAhoraIso ? deps.relojAhoraIso() : new Date().toISOString(),
  });
  deps.alConfirmarSlot(actualizacion.slot);
  deps.alConfirmarInvitacion(actualizacion.invitacion);
  if (deps.alConfirmarCandidato) {
    deps.alConfirmarCandidato(actualizacion.candidatoId, actualizacion.nuevoEstadoCandidato);
  }
  deps.alExito(MENSAJE_RESERVA_CONFIRMADA);
  return { confirmada: true };
}
