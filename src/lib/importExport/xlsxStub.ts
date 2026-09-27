/**
 * Adaptador XLSX del importador canónico — PREPARADO, NO IMPLEMENTADO (v1).
 *
 * El proyecto no dispone de dependencia XLSX (verificado: package.json sin
 * `xlsx`/`exceljs`), y la orden prohíbe introducir una dependencia pesada
 * innecesariamente. Este módulo deja:
 *  · el puerto `AdaptadorXlsx` listo para inyectar una implementación futura;
 *  · `parseXlsx()` que responde con estado honesto (no rompe el resto);
 *  · la decisión documentada para el Master Map.
 *
 * Cuando exista dependencia adecuada: implementar el puerto y registrarlo en
 * el pipeline; ningún otro módulo cambia.
 */
import type { FormatoEntrada } from './contrato';
import type { ResultadoParseo } from './jsonParser';

export const XLSX_MOTIVO_NO_SOPORTADO =
  'XLSX no soportado en erp-import-export-v1: el proyecto no incluye dependencia de lectura Excel y no se introduce una pesada. ' +
  'Convertir a CSV/JSON (el contenido tabular es equivalente) o implementar el puerto AdaptadorXlsx.';

/** Puerto futuro: cualquier implementación debe devolver este contrato. */
export interface AdaptadorXlsx {
  readonly nombre: string;
  parse(
    bytes: Uint8Array,
    opciones?: { hoja?: string | number; maxRegistros?: number },
  ): ResultadoParseo<Record<string, unknown>> & { hojas: string[] };
}

/** Respuesta honesta hasta que se inyecte un adaptador real. */
export function parseXlsx(): ResultadoParseo<Record<string, unknown>> {
  return {
    formato: 'XLSX' as FormatoEntrada,
    registros: [],
    avisos: [],
    errores: [XLSX_MOTIVO_NO_SOPORTADO],
    registrosOmitidos: 0,
    localizaciones: [],
  };
}
