/**
 * GAP 6 — Conciliación Bancaria Automática
 * Modelo normalizado, idempotencia, matching, propuestas, trazabilidad
 * Regla: NO modificar silenciosamente contabilidad operativa
 * Flujo: detectar → proponer → validar → aplicar → trazable
 */

export type TipoMovimientoBancario = 'INGRESO' | 'GASTO';
export type OrigenFormatoBancario = 'CSV' | 'OFX' | 'MT940' | 'NORMA43';
export type EstadoMovimientoBancario =
  | 'PENDIENTE'
  | 'PROPUESTO'
  | 'CONFIRMADO'
  | 'RECHAZADO'
  | 'CONCILIADO'
  | 'ERROR'
  | 'NO_CONCILIABLE';

export type TipoClasificacionNoConciliado =
  | 'NO_IDENTIFICADO'
  | 'COMISION_BANCARIA'
  | 'TRANSFERENCIA_INTERNA'
  | 'DEVOLUCION'
  | 'INGRESO_EXTRAORDINARIO'
  | 'GASTO_EXTRAORDINARIO'
  | 'OTRO';

export type ConfianzaMatch = 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_MATCH';

export interface MovimientoBancario {
  idImportacion: string;
  idMovimiento: string; // determinista: hash o FITID o id banco
  fechaOperacion: string; // YYYY-MM-DD
  fechaValor?: string; // YYYY-MM-DD
  importe: number; // positivo = ingreso, negativo = gasto, o absoluto + tipo
  tipo: TipoMovimientoBancario;
  concepto: string; // normalizado
  conceptoOriginal: string; // raw
  referencia?: string;
  identificadorBanco?: string; // FITID, :61: ref, Norma43 ref, etc.
  saldo?: number;
  origen: OrigenFormatoBancario;
  propietarioId: string; // aislamiento estricto
  inmuebleId?: string; // si se puede inferir
  cuentaIban?: string; // :25: o cabecera Norma43
  metadatosOriginales: Record<string, string | number | null>; // mínimo para auditoría
  hashIdempotencia: string; // hash determinista campos normalizados
  fechaImportacion: string; // ISO
  importadoPor?: string;
}

export interface ImportacionBancaria {
  id: string;
  propietarioId: string;
  origen: OrigenFormatoBancario;
  fechaImportacion: string;
  importadoPor?: string;
  nombreFichero?: string;
  totalMovimientos: number;
  nuevos: number;
  duplicados: number;
  errores: number;
  cuentaIban?: string;
  fechaExtractoDesde?: string;
  fechaExtractoHasta?: string;
  saldoInicial?: number;
  saldoFinal?: number;
  hashFichero?: string;
  estado: 'COMPLETADA' | 'PARCIAL' | 'ERROR';
}

export interface FactorCoincidencia {
  criterio: 'IMPORTE_EXACTO' | 'IMPORTE_TOLERANCIA' | 'FECHA_EXACTA' | 'FECHA_VENTANA' | 'REFERENCIA' | 'CONCEPTO' | 'INQUILINO' | 'PROVEEDOR' | 'INMUEBLE' | 'CONTRATO' | 'HABITACION' | 'PROPIETARIO';
  puntuacion: number; // 0-100 por factor
  detalle: string;
  coincide: boolean;
}

export interface CandidatoConciliacion {
  tipo: 'COBRO' | 'GASTO';
  id: string; // id cobro o gasto
  contratoId?: string;
  inmuebleId: string;
  propietarioId: string;
  importe: number;
  fecha: string; // fecha esperada cobro/gasto
  referencia?: string;
  concepto?: string;
  inquilinoNombre?: string;
  proveedor?: string;
  estadoActual?: string;
  yaConciliado?: boolean;
}

export interface PropuestaConciliacion {
  id: string; // id conciliacion
  movimientoId: string;
  idImportacion: string;
  propietarioId: string;
  candidato?: CandidatoConciliacion;
  candidatosAlternativos?: CandidatoConciliacion[]; // top 3-5
  puntuacion: number; // 0-100
  confianza: ConfianzaMatch;
  factores: FactorCoincidencia[];
  estado: EstadoMovimientoBancario;
  clasificacionNoConciliado?: TipoClasificacionNoConciliado;
  importeMovimiento: number;
  importeCandidato?: number;
  diferenciaImporte?: number; // movimiento - candidato
  esDiscrepancia: boolean;
  toleranciaAplicada?: number;
  ventanaDias?: number;
  fechaPropuesta: string;
  propuestaPor: 'SISTEMA' | 'USUARIO';
  fechaConfirmacion?: string;
  confirmadoPor?: string;
  fechaRechazo?: string;
  rechazadoPor?: string;
  notas?: string;
  historial: HistorialConciliacionItem[];
  // Trazabilidad aplicación
  aplicado: boolean;
  fechaAplicacion?: string;
  aplicadoPor?: string;
  // Reversibilidad
  reversible: boolean;
}

export interface HistorialConciliacionItem {
  id: string;
  fecha: string;
  accion: 'CREADA' | 'PROPUESTA' | 'CONFIRMADA' | 'RECHAZADA' | 'APLICADA' | 'REVERSADA' | 'ERROR' | 'NO_CONCILIABLE';
  usuario?: string;
  detalle?: string;
  estadoAnterior?: EstadoMovimientoBancario;
  estadoNuevo?: EstadoMovimientoBancario;
}

export interface ResultadoMatching {
  candidato: CandidatoConciliacion;
  puntuacion: number;
  confianza: ConfianzaMatch;
  factores: FactorCoincidencia[];
  diferenciaImporte: number;
  esDiscrepancia: boolean;
}

export interface ConfiguracionMatching {
  toleranciaImporteExacto: number; // 0 = exacto, ej 0.01
  toleranciaImportePorcentaje?: number; // ej 1%
  toleranciaComision?: number; // ej 2€ para comisiones bancarias
  ventanaDiasAlta: number; // ej 1 día para ALTA
  ventanaDiasMedia: number; // ej 3 días
  ventanaDiasBaja: number; // ej 5 días
  umbralAlta: number; // ej 85
  umbralMedia: number; // ej 60
  umbralBaja: number; // ej 30
  pesoImporte: number; // 0-100
  pesoFecha: number;
  pesoReferencia: number;
  pesoConcepto: number;
  pesoEstructural: number;
}

export const DEFAULT_CONFIG_MATCHING: ConfiguracionMatching = {
  toleranciaImporteExacto: 0.01,
  toleranciaImportePorcentaje: 0.5,
  toleranciaComision: 2.0,
  ventanaDiasAlta: 1,
  ventanaDiasMedia: 3,
  ventanaDiasBaja: 5,
  umbralAlta: 85,
  umbralMedia: 60,
  umbralBaja: 30,
  pesoImporte: 40,
  pesoFecha: 20,
  pesoReferencia: 25,
  pesoConcepto: 10,
  pesoEstructural: 5,
};

export interface ResumenConciliacion {
  totalMovimientos: number;
  nuevos: number;
  duplicados: number;
  pendientes: number;
  propuestos: number;
  confirmados: number;
  conciliados: number;
  rechazados: number;
  noConciliables: number;
  errores: number;
  discrepancias: number;
  altaConfianza: number;
  mediaConfianza: number;
  bajaConfianza: number;
  sinMatch: number;
}
