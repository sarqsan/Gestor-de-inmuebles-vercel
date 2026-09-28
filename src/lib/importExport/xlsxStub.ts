/**
 * Adaptador XLSX del importador canónico — HISTÓRICO.
 *
 * En la v1 este módulo era un PUERTO NO IMPLEMENTADO: el proyecto no tenía
 * dependencia XLSX y se dejó constancia documentada de la carencia (respuesta
 * honesta "XLSX no soportado", sin dependencia pesada).
 *
 * BLOQUE 7: el puerto está IMPLEMENTADO en `./xlsx.ts` sin dependencias
 * externas (ZIP + DEFLATE + SpreadsheetML propios, puros y verificados contra
 * implementaciones independientes). Este fichero se conserva únicamente como
 * REEXPORTACIÓN de compatibilidad para que ningún importador existente
 * (`index.ts`, panel, tests) cambie ni se rompa: el nombre `parseXlsx` y el
 * puerto `AdaptadorXlsx` significan ahora el adaptador real.
 *
 * Decisión de arquitectura (una sola implementación, no dos):
 *  · lectura y escritura reales: `src/lib/importExport/xlsx.ts`;
 *  · sin `xlsx`/`exceljs`: se evita una dependencia pesada y con CVEs para un
 *    uso acotado (leer/escribir libros con el contrato del ERP);
 *  · el motivo histórico se mantiene como constante informativa, no como
 *    comportamiento: ya no se devuelve "no soportado".
 */
export {
  ADAPTADOR_XLSX_REAL,
  ErrorXlsxGeneracion,
  XLSX_MAX_BYTES_DEFECTO,
  XLSX_MAX_CARACTERES_CELDA,
  XLSX_MAX_CARACTERES_HOJA,
  XLSX_MAX_REGISTROS_DEFECTO,
  generarXlsx,
  parseXlsx,
  previsualizarXlsx,
  sanearNombreHoja,
  type AdaptadorXlsx,
  type ColumnaXlsx,
  type HojaXlsxDatos,
  type OpcionesXlsx,
  type ResultadoXlsx,
  type TipoColumnaXlsx,
} from './xlsx';

/**
 * Motivo histórico (solo informativo): describía la carencia de la v1. Se
 * conserva para trazabilidad de la decisión documentada en el Master Map.
 */
export const XLSX_MOTIVO_NO_SOPORTADO =
  'XLSX no soportado en erp-import-export-v1 (histórico): la v1 no incluía lectura Excel. ' +
  'BLOQUE 7 lo resolvió con adaptador propio sin dependencias (ver ./xlsx.ts): ' +
  'este texto ya NO es la respuesta del importador.';
