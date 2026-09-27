/**
 * IMPORTADOR + EXPORTADOR CANÓNICOS DEL ERP — Contrato central y único.
 *
 * Capa PURA: tipos y constantes. No hay persistencia, Firebase, I/O, reloj
 * ni azar en este fichero ni en el núcleo `importExport/` (salvo el adaptador
 * `src/lib/importExportFirebase.ts`, que es la única pieza con I/O).
 *
 * Decisiones de no-duplicación (verificadas en FASE 1):
 *  · Estados/decisiones: se REUTILIZAN `EstadoMigracion`/`DecisionMigracion`
 *    de B4 (`src/lib/migracion/tipos.ts`). No se crea un tercer vocabulario.
 *  · Proveniencia: se REUTILIZA `Proveniencia` de B4.
 *  · Resolución/dedup/fingerprints: los ejecuta B4 (`ejecutarDryRun`); este
 *    contrato solo envuelve sus líneas con mapping y procedencia de importación.
 *  · Barreras de promoción: O7 (`autorizarMigracion`/`verificarBarrera`), sin
 *    lógica paralela (ver `promocion.ts`).
 *  · `__erpExport`: marcador de archivos generados por nuestro exportador.
 */
import type {
  DecisionMigracion,
  DryRunResult,
  EstadoMigracion,
  Proveniencia,
} from '../migracion/tipos';

/** Versión del contrato de importación/exportación (evoluciona v1→v2→…). */
export const ESQUEMA_IMPORT_EXPORT_VERSION = 'erp-import-export-v1';
export const IMPORTADOR_CANONICO_VERSION = 'erp-import-export-v1';
export const EXPORTADOR_CANONICO_VERSION = 'erp-import-export-v1';

/** Archivos externos sin versión declarada. */
export const FUENTE_EXTERNA_SIN_VERSION = 'external/unknown';

/** Campo presente en origen pero sin mapping: se ignora SIN romper la importación. */
export const IGNORADO_NO_MAPEADO = 'IGNORADO_NO_MAPEADO';

/** Marcador de cabecera de archivos generados por el exportador propio. */
export const MARCA_EXPORT_PROPIO = '__erpExport';

export type FormatoEntrada = 'JSON' | 'CSV' | 'XLSX';
export type TipoFuente = 'ERP_EXPORT' | 'EXTERNAL';
export type ModoImportacion = 'DRY_RUN' | 'PROMOVER';

/** Entidades que el importador general sabe vehicular (≡ B4; ver tabla de soporte). */
export type EntidadImportable =
  | 'PROPIETARIO'
  | 'INMUEBLE'
  | 'CONTRATO'
  | 'GASTO'
  | 'COBRO'
  | 'DOCUMENTO'
  | 'LEGACY_STORAGE';

/**
 * Tabla honesta de soporte por entidad (NO fingir soporte que no existe).
 * `PENDIENTE` = documentado, con adaptador futuro previsto, hoy NO_MIGRABLE.
 */
export const SOPORTE_ENTIDADES: ReadonlyArray<{
  entidad: string;
  soporte: 'COMPLETO' | 'PENDIENTE';
  nota: string;
}> = [
  { entidad: 'PROPIETARIO', soporte: 'COMPLETO', nota: 'vía B4 (resolución inequívoca o explícita)' },
  { entidad: 'INMUEBLE', soporte: 'COMPLETO', nota: 'vía B4 (id canónico, mapeo, ids origen, catastral)' },
  { entidad: 'CONTRATO', soporte: 'COMPLETO', nota: 'vía B4 (exige inmueble; cobros embebidos)' },
  { entidad: 'GASTO', soporte: 'COMPLETO', nota: 'vía B4 (huellas, fiscalidad conservada)' },
  { entidad: 'COBRO', soporte: 'COMPLETO', nota: 'vía B4 (exige contrato destino; mes/año obligatorios)' },
  { entidad: 'DOCUMENTO', soporte: 'COMPLETO', nota: 'referencia siempre; binario solo por flujo canónico Storage' },
  { entidad: 'LEGACY_STORAGE', soporte: 'COMPLETO', nota: 'rutas legacy con pid; migración física fuera del importador' },
  { entidad: 'GASTO_RECURRENTE', soporte: 'PENDIENTE', nota: 'plantilla periódica: sin adaptador seguro en v1 (NO_MIGRABLE honesto)' },
  { entidad: 'INCIDENCIA', soporte: 'PENDIENTE', nota: 'sin adaptador seguro en v1 (NO_MIGRABLE honesto)' },
  { entidad: 'INVENTARIO', soporte: 'PENDIENTE', nota: 'sin adaptador seguro en v1 (NO_MIGRABLE honesto)' },
  { entidad: 'PRESTAMO', soporte: 'PENDIENTE', nota: 'sin adaptador seguro en v1 (NO_MIGRABLE honesto)' },
  { entidad: 'CANDIDATO', soporte: 'PENDIENTE', nota: 'sin adaptador seguro en v1 (NO_MIGRABLE honesto)' },
];

export function soporteDe(entidad: string): 'COMPLETO' | 'PENDIENTE' | 'DESCONOCIDA' {
  const fila = SOPORTE_ENTIDADES.find((s) => s.entidad === entidad);
  return fila ? fila.soporte : 'DESCONOCIDA';
}

/** Un campo origen → un campo canónico, con regla trazable. */
export interface MapeoCampo {
  campoOrigen: string;
  campoCanonico: string;
  /** Regla aplicada, p. ej. 'alias:rentasync-v1', 'canonico', 'transformacion:redondeo2'. */
  regla: string;
  /** Valor original cuando hubo transformación (trazabilidad; undefined si copia directa). */
  valorOriginal?: unknown;
}

/** Clasificación de duplicidad del importador (mapeada desde B4, ver pipeline.ts). */
export type ClasificacionDuplicadoImport = 'NUEVO' | 'EXACTO' | 'POSIBLE_DUPLICADO' | 'CONFLICTO';

/** Un registro dentro de un ImportRun. */
export interface ImportRecord {
  importRunId: string;
  /** Posición en el archivo (0-based). No es un ID de entidad. */
  indiceOrigen: number;
  sourceRecordId: string;
  /** Localización en el archivo: `fila 12`, `registros[3]`, … */
  sourcePath: string;
  entityType: string;
  /** Datos canónicos mapeados (parciales si faltan opcionales; nunca inventados). */
  canonicalData: Record<string, unknown>;
  /** Referencia al original: hash del registro crudo + nombre del fichero. */
  originalDataReference: { registroHash: string; fichero: string };
  fieldMappings: readonly MapeoCampo[];
  /** Proveniencia B4 (reutilizada) + run. */
  provenance: Proveniencia & { importRunId: string };
  /** Estado/decisión B4 (reutilizados; sin tercer vocabulario). */
  estado: EstadoMigracion;
  decision: DecisionMigracion;
  motivo: string;
  evidencias: readonly string[];
  /** Fingerprint estable = migrationKey de B4 (reutilizado, no recalculado). */
  fingerprint: string;
  destinationId: string | null;
  destinoColeccion: string | null;
  operacion: 'VINCULAR' | 'CREAR' | null;
  duplicado: ClasificacionDuplicadoImport;
  motivoDuplicado: string;
  propietarioDestinoId: string | null;
  inmuebleDestinoId: string | null;
  /** Campos presentes en origen sin mapping (IGNORADO_NO_MAPEADO, no fatal). */
  camposDesconocidos: readonly string[];
  warnings: readonly string[];
  conflictos: readonly string[];
}

export type EstadoImportRun = 'DRY_RUN_COMPLETADO' | 'AUTORIZADO' | 'PROMOCIONADO' | 'PROMOCIONADO_PARCIAL';

/** Ejecución de importación: contrato único (dry-run o promoción posterior). */
export interface ImportRun {
  importRunId: string;
  sourceName: string;
  sourceType: TipoFuente;
  /** sha256 de los bytes del fichero (idempotencia de lote). */
  sourceHash: string;
  formato: FormatoEntrada;
  importedAt: string;
  importedBy: string | null;
  schemaVersion: string;
  entityType: string;
  totalRecords: number;
  processedRecords: number;
  /** AUTO elegibles (dry-run) / escritos (promoción). */
  importedRecords: number;
  incompleteRecords: number;
  reviewRecords: number;
  blockedRecords: number;
  duplicateRecords: number;
  errorRecords: number;
  noMigrables: number;
  status: EstadoImportRun;
  registros: readonly ImportRecord[];
  /** Agregado de campos desconocidos: campo → nº de registros afectados. */
  camposDesconocidos: ReadonlyArray<{ campo: string; registros: number }>;
  /** Resultado B4 íntegro (motor reutilizado; base de O7). */
  dryRun: DryRunResult;
  informe: string;
}

/** Ámbito solicitado para una exportación (lo que el usuario pide). */
export interface AmbitoExportacionSolicitado {
  entidad: string;
  propietarioIds: readonly string[];
  inmuebleIds?: readonly string[];
  /** Periodo opcional según entidad: ejercicios y/or meses 'YYYY-MM'. */
  ejercicios?: readonly number[];
  meses?: readonly string[];
  formato: 'JSON' | 'CSV';
}

/** Ámbito autorizado del actor (inyectado por el adaptador desde UsuarioApp/carteras). */
export interface AmbitoAutorizado {
  /** null = sin restricción (master). En cualquier otro caso, lista cerrada. */
  propietarioIdsLegibles: readonly string[] | null;
  propietarioIdsEscribibles: readonly string[] | null;
  esMaster: boolean;
}

export interface ExportRun {
  exportRunId: string;
  exportedAt: string;
  exportedBy: string | null;
  schemaVersion: string;
  scope: AmbitoExportacionSolicitado;
  recordCount: number;
  formato: 'JSON' | 'CSV';
  /** sha256 del contenido generado (reproducibilidad). */
  sha256: string;
  contenido: string;
  /** Avisos de ámbito de la exportación (auditoría 3ac21a5/D11: antes se descartaban). */
  avisos: readonly string[];
}

/** Cabecera de exportación propia (permite reconocer versión al reimportar). */
export interface MarcaExportPropio {
  [MARCA_EXPORT_PROPIO]: {
    schemaVersion: string;
    exportRunId: string;
    exportedAt: string;
    entityType: string;
  };
}
