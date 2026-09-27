/**
 * Promoción del importador canónico sobre las barreras de O7. Capa PURA.
 *
 * NO existe una segunda lógica de autorización: el ImportRun se adapta a
 * `LoteCanonica` de O7 y la autorización/verificación las ejecutan
 * `autorizarMigracion`/`verificarBarrera` de O7 sin modificar.
 * Flujo: SOURCE → PARSE → MAP → VALIDATE → RESOLVE → DRY-RUN → DECISION
 * (humana + O7) → PROMOTE (ejecutor con puerto inyectado, ver `ejecucion.ts`).
 *
 * Puerta fiscal (§9 O7, sin adaptar): el dry-run autorizable debe llevar
 * deducible explícito (fuente o parche de decisión humana). El pipeline lo
 * garantiza vía `parches`; sin confirmación fiscal, O7 excluye (CONDICIONADA)
 * y la barrera bloquea. Ninguna fiscalidad se infiere jamás.
 */
import {
  autorizarMigracion,
  autorizacionVigente,
  derivarTokenEjecucion,
  evaluarElegibilidad,
  verificarBarrera,
} from '../migracion/autorizacion';
import type {
  AutorizacionMigracion,
  LoteCanonica,
} from '../migracion/autorizacion';
import type { LineaDryRun } from '../migracion/tipos';
import type { ImportRun } from './contrato';
import { ESQUEMA_IMPORT_EXPORT_VERSION } from './contrato';

export {
  autorizarMigracion,
  autorizacionVigente,
  derivarTokenEjecucion,
  evaluarElegibilidad,
  verificarBarrera,
};
export type { AutorizacionMigracion, LoteCanonica };

/**
 * Adapta un ImportRun a lote canónico O7. El "fichero custodiado" es el
 * archivo subido (sha256 de sus bytes); la custodia en repo (B0) aplica a
 * la migración histórica, no a cada importación general.
 */
export function loteCanonicaDeImportRun(
  run: ImportRun,
  tamanoBytes: number,
  commitDryRun: string,
): LoteCanonica {
  return {
    id: run.importRunId,
    fuente: `${run.sourceType}:${run.sourceName}`,
    ficheros: [run.sourceName],
    numRegistros: run.dryRun.resumen.totalRegistros,
    tamanoBytes,
    sha256: run.sourceHash,
    generadoEn: run.importedAt || null,
    esquemaVersion: ESQUEMA_IMPORT_EXPORT_VERSION,
    motorB4Version: 'B4 (reutilizado por importador general)',
    commitDryRun,
  };
}

/**
 * Registros autorizables: decisión AUTO + elegibles O7 (7 puertas + reglas
 * documental/fiscal), intersectados con la selección explícita si se da.
 * Nunca upload → escritura automática: la selección es explícita.
 */
export function seleccionarAutorizables(
  run: ImportRun,
  seleccionFingerprints?: readonly string[] | null,
): { elegibles: LineaDryRun[]; excluidos: Array<{ fingerprint: string; motivo: string }> } {
  const elegibles: LineaDryRun[] = [];
  const excluidos: Array<{ fingerprint: string; motivo: string }> = [];
  for (const linea of run.dryRun.lineas) {
    const v = evaluarElegibilidad(linea);
    if (!v.elegible) {
      excluidos.push({ fingerprint: linea.migrationKey, motivo: v.motivoExclusion ?? 'no elegible' });
      continue;
    }
    if (seleccionFingerprints && !seleccionFingerprints.includes(linea.migrationKey)) {
      excluidos.push({ fingerprint: linea.migrationKey, motivo: 'no seleccionado para promoción' });
      continue;
    }
    elegibles.push(linea);
  }
  return { elegibles, excluidos };
}

/** Autoriza un ImportRun vía O7 (pura; no ejecuta nada). */
export function autorizarImportRun(p: {
  run: ImportRun;
  tamanoBytes: number;
  commitDryRun: string;
  autorizador?: string | null;
  fechaHora?: string | null;
  ejecucionesPrevias?: readonly string[];
}): AutorizacionMigracion {
  return autorizarMigracion({
    lote: loteCanonicaDeImportRun(p.run, p.tamanoBytes, p.commitDryRun),
    dryRun: p.run.dryRun,
    ...(p.autorizador !== undefined ? { autorizador: p.autorizador } : {}),
    ...(p.fechaHora !== undefined ? { fechaHora: p.fechaHora } : {}),
    ...(p.ejecucionesPrevias !== undefined ? { ejecucionesPrevias: p.ejecucionesPrevias } : {}),
  });
}
