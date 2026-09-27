/**
 * B4 — Plan de escritura futura (§18).
 *
 * `derivarPlan()` produce una REPRESENTACIÓN informativa de lo que se
 * escribiría posteriormente. NO ejecuta ninguna escritura: este módulo no
 * contiene (ni puede contener: ver test de no-escritura) símbolos de
 * persistencia. Solo las líneas AUTO entran en el plan; el resto queda fuera
 * con su motivo en el `DryRunResult`.
 */
import type { DryRunResult, MigrationPlan, OperacionPotencial } from './tipos';

export function derivarPlan(resultado: DryRunResult): MigrationPlan {
  const operaciones: OperacionPotencial[] = [];
  let excluidas = 0;
  for (const linea of resultado.lineas) {
    const destinoId = linea.destinoPropuesto?.destinoId ?? null;
    if (linea.decision === 'AUTO' && destinoId) {
      operaciones.push({
        migrationKey: linea.migrationKey,
        sourceId: linea.proveniencia.sourceId,
        destinationId: destinoId,
        decision: 'AUTO',
        reason: linea.motivo,
        coleccion: linea.destinoPropuesto?.coleccion ?? 'DESCONOCIDA',
        operacion: linea.destinoPropuesto?.operacion ?? 'CREAR',
      });
    } else {
      excluidas += 1;
    }
  }
  operaciones.sort((a, b) => (a.migrationKey < b.migrationKey ? -1 : a.migrationKey > b.migrationKey ? 1 : 0));
  return {
    soloLectura: true,
    operaciones,
    excluidas,
    nota: 'Plan INFORMATIVO (B4): describe operaciones potenciales futuras. No es ejecutable por este módulo; la escritura real requiere fase posterior con revisión/autorización independiente.',
  };
}
