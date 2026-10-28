/**
 * AG-01 — Alta pública de solicitud de alquiler.
 * ==============================================
 * La regla `solicitudes.create` de `firestore.rules` §4 exige las claves
 * `nombre`, `email` y `telefono` (además de `inmuebleId` y `estado`) para
 * admitir el alta anónima. El portal construía el documento solo con
 * `candidatoNombre/candidatoEmail/candidatoTelefono`: Firestore denegaba la
 * escritura y la vista mostraba «solicitud enviada» igualmente.
 *
 * Este módulo concentra las dos garantías que el portal necesita:
 *  1. el documento que se persiste lleva también los alias canónicos que la
 *     regla exige (sin cambiar el modelo: los campos `candidato*` se conservan);
 *  2. el alta solo se considera correcta cuando la escritura de `solicitudes`
 *     ha terminado bien. El fallo se propaga para que la vista no anuncie un
 *     éxito que no existe.
 *
 * El candidato es un registro secundario: si falla, la solicitud (el dato que
 * el propietario necesita para contactar) ya está persistida y no se convierte
 * un alta correcta en un error que empujaría a la persona a reenviarla
 * (duplicando la solicitud). El fallo se comunica por el canal de diagnóstico.
 */
import type { Candidato, SolicitudAlquiler } from '../types';

/** Solicitud con los alias canónicos que exige `firestore.rules` §4. */
export type SolicitudPublicaCanonica = SolicitudAlquiler & {
  nombre: string;
  email: string;
  telefono: string;
};

export interface PersistenciaAltaPublica {
  /**
   * Escritura de la solicitud. Debe rechazar si el alta no se confirma.
   * P0.2: puede devolver el documento construido por el SERVIDOR (con ids y
   * campos controlados allí); en ese caso sustituye al documento local.
   */
  guardarSolicitud: (solicitud: SolicitudAlquiler) => Promise<void | SolicitudAlquiler>;
  /** Escritura del candidato (registro secundario, best-effort). */
  guardarCandidato?: (candidato: Candidato) => Promise<void>;
  /** Diagnóstico cuando el candidato no se pudo guardar. */
  avisarCandidatoNoGuardado?: (error: unknown) => void;
}

/**
 * Devuelve el documento con `nombre/email/telefono` derivados de los campos
 * `candidato*`. Es una función pura: no escribe ni decide sobre el resultado.
 */
export function conIdentidadCanonica(solicitud: SolicitudAlquiler): SolicitudPublicaCanonica {
  return {
    ...solicitud,
    nombre: solicitud.candidatoNombre,
    email: solicitud.candidatoEmail,
    telefono: solicitud.candidatoTelefono,
  };
}

/**
 * Registra el alta pública. Solo resuelve cuando `solicitudes` está escrita;
 * cualquier rechazo de esa escritura se propaga tal cual.
 */
export async function registrarSolicitudPublica(
  solicitud: SolicitudAlquiler,
  candidato: Candidato | null | undefined,
  persistencia: PersistenciaAltaPublica
): Promise<SolicitudPublicaCanonica> {
  const canonica = conIdentidadCanonica(solicitud);
  const confirmada = await persistencia.guardarSolicitud(canonica);

  if (candidato && persistencia.guardarCandidato) {
    try {
      await persistencia.guardarCandidato(candidato);
    } catch (error) {
      persistencia.avisarCandidatoNoGuardado?.(error);
    }
  }

  // El servidor puede haber asignado ids/estado/fechas distintos: manda su
  // respuesta. Los alias canónicos se conservan aunque no los devuelva.
  return (confirmada && typeof confirmada === 'object'
    ? { ...canonica, ...(confirmada as SolicitudAlquiler) }
    : canonica) as SolicitudPublicaCanonica;
}
