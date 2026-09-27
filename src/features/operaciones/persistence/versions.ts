import type { AmbitoOperacion, ComandoOperativo, EntidadOperativa, EventoOperativo } from '../contracts.ts';

/** Versiones del registro de negocio existente, NO registros AuditLog.
 * No contienen email, nombre, resultado, descripción administrativa ni payload de audit_logs.
 * Su propósito es conservar el original, reconstruir expediente y reconocer un comando ya aplicado.
 */
export interface VersionRegistro {
  readonly ambito: AmbitoOperacion;
  readonly comando: ComandoOperativo;
  readonly registro: EntidadOperativa;
}
export interface FilaOperativa {
  readonly registro: EntidadOperativa;
  readonly auditId: string;
  readonly versiones: readonly VersionRegistro[];
}
export function versionDe(evento: EventoOperativo): VersionRegistro {
  return structuredClone({ambito: evento.ambito, comando: evento.comando, registro: evento.despues});
}
export function reconstruirHistorial(filas: readonly FilaOperativa[], propietarioId: string): EventoOperativo[] {
  const historial: EventoOperativo[] = [];
  for (const fila of filas) {
    if (!Array.isArray(fila.versiones) || !fila.versiones.length) throw new Error('Registro sin versiones de negocio: requiere adaptación explícita; no se consulta auditoría como fallback.');
    let antes: EntidadOperativa | null = null;
    for (const {ambito, comando, registro} of fila.versiones) {
      if (ambito.propietarioId !== propietarioId || registro.version !== (antes?.version ?? 0) + 1 || registro.tipo !== fila.registro.tipo || registro.id !== fila.registro.id) throw new Error('Versiones de negocio incoherentes/fuera de ámbito.');
      historial.push({ambito, comando, antes, despues: registro, operacionId: comando.operacionId, fecha: comando.fecha, actor: comando.actor, motivo: comando.motivo,
        referencia: {tipo: registro.tipo, id: registro.id}, revision: comando.revisionEsperada + 1});
      antes = registro;
    }
    if (JSON.stringify(antes) !== JSON.stringify(fila.registro)) {
      // Firestore no conserva el orden de claves de un mapa.
      const canon = (v: unknown): string => JSON.stringify(v, function(_k, x) { return x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k)=>[k,x[k]])) : x; });
      if (canon(antes) !== canon(fila.registro)) throw new Error('La versión vigente no coincide con el registro.');
    }
  }
  historial.sort((a,b)=>a.revision-b.revision);
  if (historial.some((h,i)=>h.revision!==i+1) || new Set(historial.map((h)=>h.operacionId)).size!==historial.length) throw new Error('Histórico incompleto o ID de operación duplicado.');
  return structuredClone(historial);
}
