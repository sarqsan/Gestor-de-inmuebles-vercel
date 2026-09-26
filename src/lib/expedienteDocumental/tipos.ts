/**
 * BLOQUE 3 — EXPEDIENTE DOCUMENTAL Y FISCAL POR INMUEBLE (tipos).
 * ---------------------------------------------------------------------------
 * Circuito consolidado:
 *   INMUEBLE → DOCUMENTACIÓN → MOVIMIENTO FISCAL → ORIGEN → DOCUMENTO → AUDITORÍA
 *   INMUEBLE → CONTRATO → COBRO/GASTO → DOCUMENTO → EXPEDIENTE FISCAL
 *
 * PRINCIPIOS:
 *  · PROYECCIÓN PURA: el índice documental NO crea una colección paralela;
 *    referencia los documentos que YA existen en sus modelos canónicos por
 *    dominio (Gasto.documento/documentos, CobroPeriodo.justificante,
 *    ContratoFormalizacion.anexos, PolizaSeguro.documentos/documentosRenovacion,
 *    Incidencia.fotografias/documentos, TareaMantenimiento.documentos,
 *    GarantiaReparacion.documentoUrl, DocumentoInventario).
 *  · NUNCA sobrescritura silenciosa: sustituir es un acto EXPLÍCITO y
 *    versionado; el documento anterior pasa a estado SUSTITUIDO y sigue
 *    recuperable.
 *  · La clasificación de la información REUTILIZA las semánticas existentes
 *    (`ClasificacionDato` de expedienteFiscal B6, `ProcedenciaRegistro` /
 *    `EstadoEvidencia` de importacion B0-B3, `CategoriaEvidenciaCobertura`
 *    del Bloque 1) como subconjunto de un supertipo documentado: no crea una
 *    semántica paralela.
 *  · Exportación: el ZIP B6 (`rentasync-fiscal-export-v1`) sigue siendo
 *    exportación INTERNA — «exportación de expediente interno ≠ presentación
 *    oficial AEAT».
 *  · Módulo 100% puro: sin Firebase, sin I/O, fechas explícitas del llamante.
 */
import type { ClasificacionDato } from '../expedienteFiscal/tipos';

/**
 * Clasificación única de la información del expediente.
 * SUPERSET documentado de las enumeraciones ya existentes (no las duplica):
 *  · ALMACENADO/DERIVADO/CALCULADO/DOCUMENTAL/PENDIENTE → `ClasificacionDato` (B6).
 *  · IMPORTADO  → ALMACENADO cuya `procedencia.sistema` ≠ ERP (B0-B3).
 *  · INTERPRETACION / HIPOTESIS / PENDIENTE_REVISION / INCIDENCIA → misma
 *    semántica que `CategoriaEvidenciaCobertura` (Bloque 1); una
 *    interpretación de IA NUNCA pasa automáticamente a dato fiscal oficial.
 */
export type ClasificacionInformacion =
  | ClasificacionDato
  | 'IMPORTADO'
  | 'INTERPRETACION'
  | 'HIPOTESIS'
  | 'PENDIENTE_REVISION'
  | 'INCIDENCIA';

/** Tipos documentales extensibles (no se asume que todo documento es factura). */
export type TipoDocumentoExpediente =
  | 'FACTURA_GASTO'
  | 'JUSTIFICANTE_PAGO_GASTO'
  | 'JUSTIFICANTE_COBRO'
  | 'CONTRATO'
  | 'ANEXO_CONTRATO'
  | 'POLIZA_SEGURO'
  | 'DOCUMENTO_POLIZA'
  | 'DOCUMENTO_RENOVACION_POLIZA'
  | 'RECIBO'
  | 'LIQUIDACION_IBI'
  | 'TASA'
  | 'FOTO_INCIDENCIA'
  | 'DOCUMENTO_INCIDENCIA'
  | 'DOCUMENTO_MANTENIMIENTO'
  | 'DOCUMENTO_GARANTIA'
  | 'DOCUMENTO_INVENTARIO'
  | 'OTRO'
  | (string & {}); // extensible sin romper exhaustividad

/** Entidad de origen del documento (colección/modelo canónico ya existente). */
export type EntidadOrigenDocumento =
  | 'gastos'
  | 'cobros'
  | 'contratos'
  | 'polizas_seguros'
  | 'incidencias'
  | 'tareas_mantenimiento'
  | 'garantias_reparacion'
  | 'inventario'
  | 'siniestros';

export type EstadoDocumentoExpediente =
  | 'DISPONIBLE'   // referencia localizable (Storage/URL)
  | 'PENDIENTE'    // falta el binario/referencia; NUNCA se inventa
  | 'SUSTITUIDO';  // sustituido EXPLÍCITAMENTE por otra versión (sigue recuperable)

/**
 * Entrada del índice documental unificado del inmueble. Es una REFERENCIA
 * trazable al documento real (que vive en su modelo canónico), nunca una copia
 * que pueda divergir.
 */
export interface EntradaIndiceDocumental {
  /** Determinista: `idx_` + sha256[0:36] de la identidad documental. */
  id: string;
  tipo: TipoDocumentoExpediente;
  inmuebleId: string;
  propietarioId?: string;
  ejercicio?: number; // año documental cuando es derivable

  // Relaciones (todas con entidades YA existentes; no se duplican datos)
  movimientoId?: string;
  contratoId?: string;
  polizaId?: string;
  gastoId?: string;
  cobroId?: string;
  incidenciaId?: string;
  tareaMantenimientoId?: string;
  garantiaId?: string;
  inventarioId?: string;
  siniestroId?: string;

  // Documento original
  nombre: string;
  entidadOrigen: EntidadOrigenDocumento;
  origenDocumentoId: string; // id del documento dentro de su modelo canónico
  url?: string;
  storagePath?: string;
  hash?: string; // sha256 cuando el contenido está disponible

  // Fechas y actor
  fechaDocumental?: string; // fecha del documento (no de subida)
  fechaIncorporacion: string; // ISO: cuándo se incorporó al sistema
  actor?: string;
  actorId?: string;
  referencia?: string; // referencia externa (nº factura, expediente…)

  // Versionado (sustitución EXPLÍCITA únicamente)
  version: number;
  sustituyeA?: string; // id de la entrada anterior versionada
  estado: EstadoDocumentoExpediente;

  // Clasificación de la información (§6)
  clasificacion: ClasificacionInformacion;
  /** Procedencia de importación reutilizada (B0-B3) cuando aplica. */
  sistemaOrigen?: string; // 'ERP' | 'RENTASYNC' | …
  observaciones?: string;
}

export interface IncidenciaDocumental {
  codigo:
    | 'DOC_SIN_REFERENCIA'      // sin url ni storagePath: PENDIENTE, no se inventa
    | 'DOC_SIN_FECHA'
    | 'POSIBLE_DUPLICADO'       // mismo hash/referencia en otra entidad: se señalan, NO se borran
    | 'REF_ROTA'
    | 'SUSTITUCION_SIN_ANTERIOR'
    | 'SUSTITUCION_EXPLICITA'   // traza de sustitución versionada (informativa)
    | 'MOVIMIENTO_SIN_DOCUMENTO';
  severidad: 'INFO' | 'AVISO' | 'CRITICA';
  descripcion: string;
  entidad?: string;
  id?: string;
}

export interface IndiceDocumentalInmueble {
  inmuebleId: string;
  inmuebleDireccion: string;
  generadoEl: string; // ISO explícito del llamante (determinismo)
  entradas: EntradaIndiceDocumental[];
  incidencias: IncidenciaDocumental[];
  estadisticas: {
    total: number;
    disponibles: number;
    pendientes: number;
    sustituidos: number;
    porTipo: Record<string, number>;
  };
}

// ---------------------------------------------------------------------------
// Expediente documental + fiscal por inmueble
// ---------------------------------------------------------------------------

export interface TributoExpediente {
  gastoId: string;
  categoria: 'IBI' | 'IMPUESTOS_TASAS';
  concepto: string;
  importe: number;
  ejercicio?: number;
  fecha?: string;
  documentoIds: string[]; // referencias al índice documental
  deducibleSegunMotor?: boolean; // cálculo del motor existente, no re-decidido
}

export interface SeguroExpedienteRef {
  /** REFERENCIA a la póliza del Bloque 1: nunca una copia. */
  polizaId: string;
  aseguradora: string;
  numeroPoliza: string;
  tipo: string;
  estado: string;
  fechaVencimiento: string;
  primaAnual?: number;
  documentoIds: string[]; // referencias al índice documental
}

export interface ReparacionExpedienteRef {
  tipo: 'GASTO_REPARACION' | 'TAREA_MANTENIMIENTO' | 'GARANTIA';
  id: string;
  concepto: string;
  fecha?: string;
  importe?: number;
  incidenciaId?: string;
  documentoIds: string[];
}

export interface ExpedienteDocumentalInmueble {
  schema: 'rentasync-expediente-inmueble-v1';
  inmuebleId: string;
  inmuebleDireccion: string;
  ejercicio: number;
  generadoEl: string;

  ingresos: {
    totalCobros: number;
    cobrados: number;
    importePrevisto: number;
    importeRecibido: number;
    contratosActivos: number;
    documentoIds: string[];
  };
  gastos: {
    total: number;
    importeTotal: number;
    deducibles: number;
    importeDeducible: number;
    noDeducibles: number;
    porCategoria: Record<string, { count: number; importe: number }>;
    documentoIds: string[];
    /** Deducibilidad según `esGastoDeducible`/motor existente (DATO_CALCULADO). */
    clasificacion: 'CALCULADO';
  };
  tributos: TributoExpediente[];
  seguros: SeguroExpedienteRef[];
  reparaciones: ReparacionExpedienteRef[];
  indiceDocumental: IndiceDocumentalInmueble;
  incidenciasFiscales: IncidenciaDocumental[];

  /** Conservación histórica (§9): sin TTL; política ≥ 5 años. */
  retencion: {
    aniosMinimos: number;
    ttlConfigurado: false;
    auditoriaAppendOnly: true;
    garantiaTecnica: string;
  };
  procedencia: {
    sistema: string;
    modo: 'LECTURA';
    escriturasFirestore: 0;
    escriturasStorage: 0;
    /** «exportación de expediente interno ≠ presentación oficial AEAT». */
    formatoOficialAEAT: false;
    avisoAEAT: string;
    motoresReutilizados: string[];
  };
}

export const AVISO_EXPEDIENTE_INTERNO =
  'Exportación de expediente interno ≠ presentación oficial AEAT. El ZIP es reconstruible y determinista, pero no afirma ser un formato oficial de presentación.';

export const POLITICA_RETENCION = {
  aniosMinimos: 5,
  ttlConfigurado: false,
  auditoriaAppendOnly: true,
  garantiaTecnica:
    'Firestore sin TTL ni borrado automático: documentos, movimientos, auditoría (append-only) e histórico se conservan indefinidamente. Validación de conservación efectiva sobre infraestructura real: PENDIENTE — BLOQUE 4.',
} as const;
