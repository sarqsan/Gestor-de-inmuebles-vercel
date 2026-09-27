import type { EventoOperativo } from '../features/operaciones/contracts.ts';
import type { IdentidadCanonica } from '../features/operaciones/persistence/authorization.ts';

/** Envelope AuditLog canónico de B, fc14156 src/types.ts:1832.
 * Se usa la entidad canónica inmueble: detalles identifica el registro operativo afectado.
 * Único escritor de auditoría de C; transporte transaccional, sin fallback best-effort.
 */
export interface RegistroAuditoriaOperativa {
  readonly id: string; readonly usuarioId: string; readonly usuarioEmail: string; readonly usuarioNombre: string;
  readonly accion: string; readonly descripcion: string; readonly fechaHora: string;
  readonly entidadAfectada: 'inmueble'; readonly idAfectado: string; readonly resultado: 'EXITO';
  readonly detalles: {
    readonly modulo: 'OPERACIONES'; readonly propietarioId: string; readonly inmuebleId: string;
    readonly operacionId: string; readonly revision: number; readonly actorUid: string;
    readonly tipo: string; readonly entidadId: string; readonly version: number;
  };
}
export function idAuditoria(evento: EventoOperativo): string {
  for (const id of [evento.ambito.propietarioId, evento.operacionId, evento.referencia.id]) if (!id || id.length > 128 || /[\/~]/.test(id)) throw new Error('ID no compatible con el transporte: máximo 128 caracteres y sin / o ~. No se renombra el dato.');
  return `operaciones~${evento.ambito.propietarioId}~${evento.operacionId}`;
}
export function auditoriaDe(evento: EventoOperativo, identidad: IdentidadCanonica): RegistroAuditoriaOperativa {
  if (!identidad.uid || evento.actor !== identidad.uid) throw new Error('Actor de auditoría incoherente.');
  return {
    id: idAuditoria(evento), usuarioId: identidad.usuarioId, usuarioEmail: identidad.usuarioEmail, usuarioNombre: identidad.usuarioNombre,
    accion: `OPERACIONES_${evento.comando.accion}`, descripcion: evento.motivo, fechaHora: evento.fecha,
    entidadAfectada: 'inmueble', idAfectado: evento.ambito.inmuebleId, resultado: 'EXITO',
    detalles: {modulo:'OPERACIONES', ...evento.ambito, operacionId:evento.operacionId, revision:evento.revision, actorUid:evento.actor,
      tipo:evento.referencia.tipo, entidadId:evento.referencia.id, version:evento.despues.version},
  };
}
/** Mismo envelope log-first que B; el puerto adicional mantiene la unidad transaccional de C.
 * No modifica el logger best-effort de B, ni crea otro servicio/colección.
 */
export function registrarAuditoriaFirestore(log: RegistroAuditoriaOperativa, transaccion: {crearAuditoria: (id: string, registro: RegistroAuditoriaOperativa) => void}): void {
  transaccion.crearAuditoria(log.id, log);
}
