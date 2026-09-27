/**
 * BLOQUE 3 — Auditoría del expediente documental/fiscal.
 * ---------------------------------------------------------------------------
 * REUTILIZA exclusivamente `audit_logs` mediante la función existente
 * `registrarAuditoriaFirestore` (src/lib/firebase.ts). NO crea
 * `audit_logs_fiscal`, ni `historicoDocumentos`, ni ninguna auditoría
 * alternativa. Cada payload permite reconstruir actor + fecha + entidad +
 * acción (la fecha la estampa la función existente).
 */
import type { AuditLog } from '../../types';

export type AccionDocumental =
  | 'EXPEDIENTE_DOCUMENTO_INCORPORADO'
  | 'EXPEDIENTE_DOCUMENTO_RELACIONADO'
  | 'EXPEDIENTE_DOCUMENTO_SUSTITUIDO'   // sustitución EXPLÍCITA y versionada
  | 'EXPEDIENTE_DOCUMENTO_MODIFICADO'
  | 'EXPEDIENTE_IMPORTACION'
  | 'EXPEDIENTE_EXPORTACION'
  | 'EXPEDIENTE_INCIDENCIA'
  | 'EXPEDIENTE_PROCEDENCIA_CAMBIADA'
  | 'EXPEDIENTE_ASOCIACION'
  | 'EXPEDIENTE_DESASOCIACION';

export type EntidadExpedienteAuditada = 'documento_expediente' | 'expediente_fiscal';

export interface PayloadAuditoriaExpediente {
  usuarioId: string;
  usuarioEmail: string;
  usuarioNombre: string;
  accion: AccionDocumental;
  descripcion: string;
  entidadAfectada: EntidadExpedienteAuditada;
  idAfectado: string;
  resultado: 'EXITO' | 'ERROR';
  detalles?: Record<string, unknown>;
}

/**
 * Construye el payload para `registrarAuditoriaFirestore` (audit_logs).
 * Puro: no escribe; el llamante persiste con la función existente.
 */
export function construirAuditoriaExpediente(
  actor: { id?: string; email?: string; nombre: string },
  accion: AccionDocumental,
  entidad: EntidadExpedienteAuditada,
  idAfectado: string,
  descripcion: string,
  detalles?: Record<string, unknown>,
  resultado: 'EXITO' | 'ERROR' = 'EXITO'
): PayloadAuditoriaExpediente {
  return {
    usuarioId: actor.id || 'desconocido',
    usuarioEmail: actor.email || '',
    usuarioNombre: actor.nombre,
    accion,
    descripcion,
    entidadAfectada: entidad,
    idAfectado,
    resultado,
    detalles,
  };
}

/** Compatibilidad de tipos con el AuditLog existente (entidad extendida). */
export type AuditLogExpediente = Omit<AuditLog, 'entidadAfectada'> & {
  entidadAfectada: AuditLog['entidadAfectada'] | EntidadExpedienteAuditada;
};
