/**
 * Informe de importación por `importRunId` (§23). Capa PURA.
 *
 * Responde a los 22 puntos exigidos sin ocultar errores en contadores
 * globales: cada registro problemático es localizable por `sourcePath`.
 * Los conteos reutilizan el resumen B4 embebido en el run.
 */
import type { ImportRecord, ImportRun } from './contrato';
import { IGNORADO_NO_MAPEADO } from './contrato';

function lineaRegistro(r: ImportRecord): string {
  return `${r.sourcePath} [${r.entityType}] ${r.sourceRecordId} → ${r.decision} (${r.motivo})`;
}

export function generarInformeImportacion(run: ImportRun): string {
  const L: string[] = [];
  const r = run.dryRun.resumen;
  L.push(`INFORME DE IMPORTACIÓN — ${run.importRunId}`);
  L.push(`1. archivo recibido: ${run.sourceName}`);
  L.push(`2. hash (sha256 bytes): ${run.sourceHash}`);
  L.push(`3. formato: ${run.formato} (fuente: ${run.sourceType})`);
  L.push(`4. versión contrato: ${run.schemaVersion}`);
  L.push(`5. entidad declarada: ${run.entityType}`);
  L.push(`6. registros totales: ${run.totalRecords} (procesados: ${run.processedRecords})`);
  L.push(`7. registros aceptados (AUTO): ${run.importedRecords}`);
  L.push(`8. incompletos: ${run.incompleteRecords}`);
  L.push(`9. revisión: ${run.reviewRecords}`);
  L.push(`10. bloqueados: ${run.blockedRecords}`);
  L.push(`11. duplicados (EXACTO+POSIBLE): ${run.duplicateRecords}`);
  L.push(`12. campos desconocidos: ${run.camposDesconocidos.length} distinto(s)`);
  for (const c of run.camposDesconocidos.slice(0, 20)) {
    L.push(`    · '${c.campo}' en ${c.registros} registro(s) → ${IGNORADO_NO_MAPEADO}`);
  }
  if (run.camposDesconocidos.length > 20) L.push(`    · …y ${run.camposDesconocidos.length - 20} más`);
  L.push(`13. errores estructurales: ${run.errorRecords}`);
  for (const e of run.registros.filter((x) => x.sourceRecordId.startsWith('__ERROR_IE_'))) {
    L.push(`    · ${lineaRegistro(e)}`);
  }
  const conProp = run.registros.filter((x) => x.propietarioDestinoId);
  const conInm = run.registros.filter((x) => x.inmuebleDestinoId);
  L.push(`14. propietario destino resuelto: ${conProp.length}/${run.totalRecords}`);
  L.push(`15. inmueble destino resuelto: ${conInm.length}/${run.totalRecords}`);
  const conPadre = run.registros.filter((x) => {
    const linea = run.dryRun.lineas.find((l) => l.migrationKey === x.fingerprint);
    return linea?.relaciones.padreResuelto === true;
  });
  L.push(`16. relaciones resueltas (padre): ${conPadre.length}/${run.totalRecords}`);
  const transformados = run.registros.flatMap((x) =>
    x.fieldMappings.filter((m) => m.regla.includes('transformacion:')).map((m) => `${x.sourcePath}: ${m.campoOrigen}→${m.campoCanonico} [${m.regla}]`),
  );
  L.push(`17. transformaciones aplicadas: ${transformados.length}`);
  for (const t of transformados.slice(0, 30)) L.push(`    · ${t}`);
  if (transformados.length > 30) L.push(`    · …y ${transformados.length - 30} más`);
  L.push('18. incidencias no-AUTO (localizables):');
  const pendientes = run.registros.filter((x) => x.decision !== 'AUTO');
  if (pendientes.length === 0) L.push('    · ninguna (todo AUTO)');
  for (const p of pendientes.slice(0, 50)) L.push(`    · ${lineaRegistro(p)}`);
  if (pendientes.length > 50) L.push(`    · …y ${pendientes.length - 50} más`);
  L.push(`19. escritura realizada: 0 (dry-run; solo-lectura=${run.dryRun.soloLectura})`);
  L.push(`20. registros no escritos: ${run.totalRecords - 0} (todo, por diseño en dry-run)`);
  L.push(`21. motivo de cada exclusión: ver §18 (B4: AUTO=${r.auto} REVISIÓN=${r.revision} INCOMPLETO=${r.incompleto} BLOQUEADO=${r.bloqueado} NO_MIGRABLE=${r.noMigrable})`);
  L.push(`22. idempotencia: lote=${run.dryRun.loteSha256.slice(0, 16)}…; reimportar el mismo archivo reproduce este informe (fingerprints estables)`);
  return L.join('\n');
}
