/**
 * B6 — EXPEDIENTE FISCAL / EXPORTACIÓN ZIP (contrato versionado).
 *
 * "rentasync-fiscal-export-v1" — Exportación fiscal INTERNA / expediente
 * reconstruible del ERP. NO es ni afirma ser un formato oficial de
 * presentación ante la AEAT.
 *
 * Módulo 100% puro: sin Firebase, sin Storage, sin Date.now() implícito
 * (la fecha de generación la aporta el llamante). CERO escrituras.
 */
import type { Inmueble, ContratoFormalizacion, Gasto } from '../../types';
import type { ResumenFiscalAnual } from '../../utils/fiscalEngine';

export const EXPEDIENTE_SCHEMA = 'rentasync-fiscal-export-v1';

/** Clasificación de cada dato del expediente (B6.4). */
export type ClasificacionDato =
  | 'ALMACENADO'   // tal cual está en la BD del ERP
  | 'DERIVADO'     // obtenido de datos almacenados sin cálculo nuevo (p.ej. cobro→ingreso)
  | 'CALCULADO'    // cálculo del motor fiscal (desgloses, totales)
  | 'DOCUMENTAL'   // referencia/hash de documento
  | 'PENDIENTE';   // no disponible hoy; NUNCA se inventa

/** Ámbito temporal determinista: el año de referencia lo aporta el llamante. */
export type PeriodoExportacion =
  | { tipo: 'ANIO'; anio: number }
  | { tipo: 'RANGO'; desde: number; hasta: number }
  | { tipo: 'ULTIMOS_5'; anioReferencia: number };

export interface AmbitoExportacion {
  seleccion: 'UN_INMUEBLE' | 'TODOS';
  inmuebleId?: string; // obligatorio si seleccion === 'UN_INMUEBLE'
  periodo: PeriodoExportacion;
}

/** Contexto de autorización (B6.12): se REGISTRA, aún no se aplica. */
export interface ContextoActor {
  actor: string;                       // uid o identificador de quien genera
  propietarioId?: string;              // ámbito de titular
  gestorId?: string;                   // ámbito de gestor (FASE 5B, futuro)
  cartera?: string;                    // ámbito de cartera (futuro)
  permisos?: string[];                 // permisos declarados (futuro)
  incluirPII?: boolean;                // por defecto FALSE: se sanea PII
}

export interface MovimientoExpediente {
  movimientoId: string;                // determinista: {tipo}:{referenciaId}[:{desglose}]
  inmuebleId: string;
  ejercicio: number;
  fecha: string;                       // YYYY-MM-DD
  concepto: string;
  importe: number;
  categoria: string;
  tipo: 'INGRESO' | 'GASTO' | 'AMORTIZACION' | 'INTERES';
  origen: string;                      // 'COBRO' | 'GASTO' | gasto.origen | 'ERP'
  origenId: string;
  referenciaDocumental?: string;       // documentoId
  hashDocumento?: string;              // sha256 cuando el binario está disponible
  clasificacion: ClasificacionDato;
  fuente: string;                      // cadena de trazabilidad (B6.8)
  /** true en desgloses calculados: NO acumulan en totales (no duplican). */
  noAcumulable?: boolean;
}

export interface DocumentoExpediente {
  documentoId: string;
  movimientoId?: string;
  inmuebleId: string;
  ejercicio: number;
  tipo: 'INGRESO' | 'GASTO';
  nombre: string;
  hash?: string;                       // sha256 si binario disponible
  rutaLogica: string;                  // ruta dentro del ZIP
  storagePath?: string;                // referencia Storage original (solo referencia)
  estado: 'DISPONIBLE' | 'PENDIENTE';
}

export interface IncidenciaExpediente {
  codigo: string;                      // MOV_SIN_INMUEBLE | MOV_SIN_FECHA | IMPORTE_INVALIDO |
                                       // CATEGORIA_DESCONOCIDA | DOC_FALTANTE | REF_ROTA |
                                       // DUP_ORIGEN | INCIDENCIA_FISCAL | DERIVADO_SIN_FUENTE |
                                       // RELACION_INCOMPLETA
  severidad: 'INFO' | 'AVISO' | 'CRITICA';
  descripcion: string;
  entidad?: string;
  id?: string;
}

export interface ManifestExpediente {
  exportId: string;                    // sha256 determinista del contenido
  schemaVersion: string;               // EXPEDIENTE_SCHEMA
  generatedAt: string;                 // ISO aportado por el llamante (explícito)
  actor: string;
  ambito: AmbitoExportacion;
  periodo: { ejercicios: number[] };
  inmueblesIncluidos: { inmuebleId: string; direccion: string }[];
  numMovimientos: number;
  numDocumentos: number;
  numDocumentosDisponibles: number;
  hashes: Record<string, string>;      // ruta ZIP → sha256 del contenido
  numIncidencias: number;
  advertencias: string[];
  origenDatos: string;                 // 'ERP Gestor de Inmuebles (Firestore, lectura)'
}

export interface ExpedienteFiscal {
  manifest: ManifestExpediente;
  resumenFiscal: ResumenFiscalAnual[]; // reutiliza generarResumenFiscalAnual (no duplica motor)
  movimientos: MovimientoExpediente[];
  documentos: DocumentoExpediente[];
  incidencias: IncidenciaExpediente[];
  /** Agregados históricos del origen externo: verbatim, NUNCA movimientos. */
  agregadosOrigen: { nota: string; registros: unknown[] };
  datosNoDisponibles: string[];
  procedencia: {
    sistema: string;
    modo: 'LECTURA';
    escriturasFirestore: 0;
    escriturasStorage: 0;
    formatoOficialAEAT: false;
  };
}

export interface EntradaExpediente {
  inmuebles: Inmueble[];
  contratos: ContratoFormalizacion[];
  gastos: Gasto[];
}

/** Resolución inyectable de binarios documentales (B6.5): si no está, PENDIENTE. */
export type ResolverBinarios = (
  doc: DocumentoExpediente
) => Uint8Array | undefined | Promise<Uint8Array | undefined>;

/** Categorías conocidas en runtime (paridad con CategoriaGasto de types.ts). */
export const CATEGORIAS_CONOCIDAS: string[] = [
  'COMUNIDAD', 'IBI', 'SEGURO_HOGAR', 'SEGUROS', 'SUMINISTROS', 'MANTENIMIENTO',
  'REPARACION', 'MANTENIMIENTO_REPARACION', 'ADMINISTRACION', 'GESTION',
  'LIMPIEZA', 'IMPUESTOS_TASAS', 'ELECTRODOMESTICOS', 'MOBILIARIO', 'REFORMAS',
  'OTRO', 'OTRO_EXPLOTACION', 'CUOTA_HIPOTECARIA', 'INTERESES_PRESTAMO',
  'OTRO_FINANCIACION',
];
