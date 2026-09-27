/**
 * Importador + Exportador canónicos del ERP (`erp-import-export-v1`).
 *
 * Frontal general sobre B4/O7 (reutilizados, no duplicados):
 *  parsers → mapping registry → normalización → pipeline(B4) → informe;
 *  promoción vía O7 → ejecutor con puerto inyectado; exportador canónico.
 *
 * Todo es puro salvo el adaptador `src/lib/importExportFirebase.ts`.
 */
export * from './contrato';
export * from './jsonParser';
export * from './csvParser';
export * from './xlsxStub';
export * from './mappingRegistry';
export * from './normalizar';
export * from './pipeline';
export * from './informe';
export * from './promocion';
export * from './ejecucion';
export * from './exportador';
export * from './ambito';
