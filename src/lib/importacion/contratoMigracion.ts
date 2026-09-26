/**
 * FASE 4 · B0 — CONTRATO INTERNO DE MIGRACIÓN.
 *
 * Define las reglas invariantes de cualquier importación (FASE 3 §A/§E/§F):
 * versión de esquema, versión de importador, lote por sha256, modos,
 * ids deterministas, procedencia obligatoria e incidencias abiertas.
 *
 * Capa PURA: no escribe en Firestore. `crearContratoMigracion` es determinista:
 * fechaHora y actor se reciben por parámetro (nada de Date.now() interno).
 */
import { sha256Hex } from './hash';

export const ESQUEMA_IMPORTACION_VERSION = 'rentasync-v1';
export const IMPORTADOR_VERSION = '0.1.0-prep (B0-B3: sin persistencia)';

export type ModoMigracion = 'DRY_RUN' | 'PREVIEW' | 'CONFIRMADO';

export interface ResultadoMigracion {
  analizados: number;
  importados: number;
  bloqueados: number;
  pendientesValidacion: number;
  duplicadosDetectados: number;
  documentosProcesados: number;
  estado: 'OK' | 'PARCIAL' | 'SIN_CAMBIOS' | 'NO_EJECUTADO';
}

export interface ContratoMigracion {
  esquemaVersion: string;
  importadorVersion: string;
  sistemaOrigen: string;
  /** sha256 del contenido normalizado del lote: puerta de idempotencia (FASE 3 §F). */
  loteSha256: string;
  modo: ModoMigracion;
  /** Reglas de id determinista declaradas (FASE 3 §E). */
  idsDeterministas: {
    gasto: string;
    cobro: string;
    reglaClaveOrigen: string;
  };
  procedenciaObligatoria: boolean;
  /** INC-01…INC-15 de FASE 2: NINGUNA se resuelve automáticamente. */
  incidenciasAbiertas: string[];
  resultado: ResultadoMigracion;
  fechaHora: string; // ISO, inyectado por el llamante
  actor: string; // uid/nombre del usuario que lanza la operación
}

export const INCIDENCIAS_FASE2_ABIERTAS: readonly string[] = [
  'INC-01', 'INC-02', 'INC-03', 'INC-04', 'INC-05', 'INC-06', 'INC-07', 'INC-08',
  'INC-09', 'INC-10', 'INC-11', 'INC-12', 'INC-13', 'INC-14', 'INC-15',
] as const;

/** sha256 del contenido NORMALIZADO (JSON estable) del fichero externo. */
export function calcularLoteSha256(contenidoNormalizado: string): string {
  return sha256Hex(contenidoNormalizado);
}

export function crearContratoMigracion(p: {
  sistemaOrigen: string;
  loteSha256: string;
  modo: ModoMigracion;
  fechaHora: string;
  actor: string;
  resultado?: ResultadoMigracion;
}): ContratoMigracion {
  return {
    esquemaVersion: ESQUEMA_IMPORTACION_VERSION,
    importadorVersion: IMPORTADOR_VERSION,
    sistemaOrigen: p.sistemaOrigen,
    loteSha256: p.loteSha256,
    modo: p.modo,
    idsDeterministas: {
      gasto: 'gas_{inmuebleId}_{origenId}',
      cobro: 'cobro_{contratoId}_{anio}_{mes}', // computable solo cuando exista contrato (FASE 3 §J)
      reglaClaveOrigen: '{sistema}:{origenId}',
    },
    procedenciaObligatoria: true,
    incidenciasAbiertas: [...INCIDENCIAS_FASE2_ABIERTAS],
    resultado: p.resultado ?? {
      analizados: 0, importados: 0, bloqueados: 0, pendientesValidacion: 0,
      duplicadosDetectados: 0, documentosProcesados: 0, estado: 'NO_EJECUTADO',
    },
    fechaHora: p.fechaHora,
    actor: p.actor,
  };
}
