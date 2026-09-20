/**
 * GAP7 — Facturación y cumplimiento de los sistemas informáticos de facturación
 * (preparación VERI*FACTU).
 * ---------------------------------------------------------------------------
 * Modelo tipado AUTÓNOMO (sin imports runtime) con SEPARACIÓN ARQUITECTÓNICA
 * de las CUATRO capas que el alcance exige NO mezclar:
 *
 *   1. FACTURA            → documento económico emitido / recibido (negocio).
 *   2. REGISTRO FACTURACIÓN → registro técnico sujeto a los requisitos del
 *      Reglamento (RD 1007/2023; Orden HAC/1177/2024): huella/hash SHA-256
 *      encadenada, trazabilidad e inalterabilidad.
 *   3. VERI*FACTU         → MODALIDAD de funcionamiento del SIF (remisión
 *      voluntaria/inmediata) + estados de envío. NO es un formato de factura.
 *   4. FACTURA B2B        → obligación distinta (factura electrónica
 *      interempresarial) aquí tratada solo como MÓDULO SEPARADO/DESACOPLADO,
 *      sin implementar la remisión (pendiente de desarrollo reglamentario).
 *
 * Seguridad: SIN secretos. Los certificados/claves de firma electrónica y
 * autenticación ante la AEAT NO se modelan ni persisten (viven en backend /
 * secret manager). No hay endpoints AEAT inventados: la conexión real queda
 * explícitamente PENDIENTE detrás de un adaptador desacoplado (VerifactuTransport).
 *
 * Base normativa vigente (auditoría GAP7):
 *   - RD 1007/2023 de 5 de diciembre (Reglamento SIF).
 *   - RD 254/2025 de 1 de abril y RDL 15/2025 de 2 de diciembre (plazos y
 *     ámbito: 01-01-2027 / 01-07-2027 según tipo de obligado).
 *   - Orden HAC/1177/2024 de 17 de octubre (especificaciones técnicas).
 *   - Especificación AEAT «generación de la huella o hash» v0.1.2 (27/08/2024).
 *   - Especificación AEAT «código QR de la factura» v0.5.0 (10/12/2025).
 * Los 3 vectores oficiales de ejemplo AEAT (hash) se validan en tests.
 */

// ---------------------------------------------------------------------------
// 1. FACTURA — documento económico
// ---------------------------------------------------------------------------

export type TipoFactura = 'F1' | 'F2' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
export const TIPO_FACTURA_ORDINARIA = 'F1';

export type ClaseFactura = 'EMITIDA' | 'RECIBIDA';

export type EstadoFactura =
  | 'BORRADOR'
  | 'EMITIDA'
  | 'PENDIENTE_REMISION'
  | 'ENVIADA'
  | 'ACEPTADA'
  | 'ACEPTADA_CON_ERRORES'
  | 'RECHAZADA'
  | 'ERROR'
  | 'ANULADA';

/** Clasificación por defecto de números de serie de factura en el ERP. */
export type TipoSerieFactura = 'ALQUILER' | 'OTROS';

export interface SerieFacturacion {
  id: string;
  propietarioId: string; // clave de aislamiento
  codigo: string; // p. ej. "ALQ"
  descripcion?: string;
  ejercicio: number; // año al que pertenece la correlación
  tipo: TipoSerieFactura;
  ultimoNumero: number; // último numero asignado
  activa: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LineaFactura {
  id: string;
  concepto: string;
  cantidad: number;
  precioUnitario: number;
  baseImponible: number;
  tipoIva: number; // % (21, 10, 4, 0…)
  cuotaIva: number;
  retencionTipo?: number; // % IRPF si procede
  retencionCuota?: number;
}

export interface EmisorFactura {
  nombre: string;
  nif: string;
  direccion?: string;
  ciudad?: string;
  codigoPostal?: string;
}

export interface ReceptorFactura {
  nombre: string;
  nif?: string; // puede omitirse en factura simplificada B2C
  direccion?: string;
  ciudad?: string;
  codigoPostal?: string;
}

export interface Factura {
  id: string; // determinista: idFactura(serie, numero, ejercicio, propietarioId)
  propietarioId: string; // clave de aislamiento (obligado a expedir)
  inmuebleId?: string;
  contratoId?: string;
  gastoId?: string; // si deriva de un gasto/proveedor
  proveedorId?: string;

  clase: ClaseFactura; // EMITIDA | RECIBIDA (esta última limitada: ver FASE 15)
  tipo: TipoFactura;
  serie: string;
  numero: number;
  ejercicio: number;

  fechaExpedicion: string; // dd-mm-aaaa (formato del registro)
  fechaOperacion?: string; // dd-mm-aaaa
  fechaExpedicionUtc?: string; // ISO instantánea de expedición

  emisor: EmisorFactura;
  receptor?: ReceptorFactura;

  lineas: LineaFactura[];
  baseImponible: number;
  cuotaIva: number;
  cuotaRetencion?: number;
  importeTotal: number;

  vencimiento?: string;
  formaPago?: 'transferencia' | 'domiciliacion' | 'bizum' | 'efectivo' | 'otro';

  estado: EstadoFactura;
  estadoFiscal?: EstadoFactura | null;

  // Rectificaciones / anulaciones con trazabilidad (RD 1007/2023 art. 8.b)
  rectificaFacturaId?: string; // factura original que rectifica
  rectificadaPorId?: string; // factura rectificativa que la corrige
  anuladaPorFacturaId?: string; // registro de anulación
  motivoRectificacion?: string;

  // Trazabilidad de cobro: factura emitida ≠ cobro (la conciliación GAP6 manda)
  cobroPeriodoId?: string; // relleno SOLO por conciliación; nunca asume cobro
  movimientoBancarioId?: string;

  // Generado por el motor de registro (relleno en la emisión)
  registroFacturacionId?: string;

  creadoPor?: string;
  creadoPorId?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 2. REGISTRO DE FACTURACIÓN (RRSIF — huella encadenada)
// ---------------------------------------------------------------------------

export type TipoRegistroFacturacion = 'ALTA' | 'ANULACION';

export type ModalidadFacturacion = 'VERIFACTU' | 'NO_VERIFACTU';

export interface RegistroFacturacion {
  id: string;
  propietarioId: string; // aislar por obligado
  facturaId: string;
  tipoRegistro: TipoRegistroFacturacion;

  // Identificación de la factura referida (IDs del bloque anterior en el hash)
  idEmisorFactura: string; // NIF del obligado
  numSerieFactura: string; // serie + número, p. ej. "ALQ-2026-000001"
  fechaExpedicionFactura: string; // dd-mm-aaaa

  tipoFactura: TipoFactura;
  cuotaTotal: number;
  importeTotal: number;

  // Timestamp con huso (campo hashable FechaHoraHusoGenRegistro)
  fechaHoraHusoGenRegistro: string;

  // Encadenamiento
  registroAnteriorId?: string;
  huellaAnterior?: string; // Huella (hash) del registro previo
  primerRegistro: boolean; // "S" si es el primero del SIF

  // Huella / hash SHA-256 (64 hex, mayúsculas)
  huella: string;

  modalidad: ModalidadFacturacion;
  timestampUtc: string;
  createdAt: string;
}

/**
 * Resultado del motor de encadenamiento: evita recalcular la huella y expone
 * la cadena de caracteres hasheada para auditoría/verificación.
 */
export interface RegistroGenerado {
  registro: RegistroFacturacion;
  cadenaHasheada: string;
  huella: string;
  huellaAnterior: string; // '' si primerRegistro
}

// ---------------------------------------------------------------------------
// 3. VERI*FACTU — modalidad: envío/remisión (desacoplado del registro)
// ---------------------------------------------------------------------------

export type EstadoEnvioVerifactu =
  | 'PENDIENTE'
  | 'PREPARADO'
  | 'ENVIANDO'
  | 'ACEPTADO'
  | 'ACEPTADO_CON_ERRORES'
  | 'RECHAZADO'
  | 'ERROR'
  | 'REINTENTO';

export interface EnvioVerifactu {
  id: string; // DETERMINISTA: idEnvioVerifactu(registroFacturacionId) → idempotencia
  idempotencyKey: string;
  propietarioId: string;
  registroFacturacionId: string;
  modalidad: ModalidadFacturacion;

  estado: EstadoEnvioVerifactu;
  intentos: number;

  // Identificación AEAT (solo cuando la respuesta real lo aporte)
  codigoSeguroVerificacion?: string; // CSV
  codigoError?: string;
  descripcionError?: string;
  acuseRecibo?: string; // identificador de respuesta AEAT

  fechaCreacion: string;
  fechaEnvio?: string;
  fechaRespuesta?: string;
  ultimoIntento?: string;
  historial: HistorialEnvioVerifactu[];
}

export interface HistorialEnvioVerifactu {
  fecha: string;
  estado: EstadoEnvioVerifactu;
  detalle?: string;
  codigoError?: string;
}

export type CodigoErrorVerifactu =
  | 'FORMATO_INVALIDO'
  | 'VALIDACION_KO'
  | 'RECHAZADO'
  | 'INDISPONIBLE'
  | 'TIMEOUT'
  | 'RESPUESTA_DUPLICADA'
  | 'ERROR_INTERNO';

/**
 * Interfaz DESACOPLADA de transporte/remisión.
 * La GENERACIÓN del registro (motor) es independiente del TRANSPORTE.
 * NO hay endpoint inventado: la conexión real con certificados queda PENDIENTE.
 */
export interface VerifactuTransport {
  entorn0: 'sandbox' | 'produccion';
  readonly preparado: boolean;
  enviar(registro: RegistroFacturacion): Promise<ResultadoTransporteVerifactu>;
}

export interface ResultadoTransporteVerifactu {
  ok: boolean;
  estado: EstadoEnvioVerifactu;
  codigoSeguroVerificacion?: string;
  codigoError?: string;
  descripcionError?: string;
  acuse?: string;
  respondidoEn?: string;
  duplicada?: boolean;
}

export type VerifactuEndpointKind = 'remision' | 'validacion_no_verifactu';

/**
 * Datos de configuración de la capa de transporte, SIN secretos ni
 * certificados: sólo identificadores de entorno y habilitación.
 */
export interface ConfiguracionVerifactu {
  propietarioId: string;
  modalidad: ModalidadFacturacion;
  nif: string;
  nombreSistema: string;
  idSistemaInformatico?: string;
  versionSistema?: string;
  numeroInstalacion?: string;
  entorno: 'sandbox' | 'produccion';
  remisionActiva: boolean; // si es falsa, los registros se conservan (NO VERIFACTU)
}

// ---------------------------------------------------------------------------
// Datos para informes / reporting (integra con GAP3 sin duplicarlo)
// ---------------------------------------------------------------------------

export interface ResumenFacturacion {
  totalFacturas: number;
  emitidas: number;
  aceptadas: number;
  rechazadas: number;
  anuladas: number;
  rectificativas: number;
  baseImponible: number;
  cuotaIva: number;
  retenciones: number;
  importeTotal: number;
}

// ---------------------------------------------------------------------------
// IDs deterministas
// ---------------------------------------------------------------------------

export function idSerie(propietarioId: string, codigo: string, ejercicio: number): string {
  return `ser_${codigo}_${ejercicio}_${propietarioId}`;
}

export function idFactura(serie: string, numero: number, ejercicio: number, propietarioId: string): string {
  const n = String(numero).padStart(6, '0');
  return `fac_${serie}_${ejercicio}_${n}_${propietarioId}`;
}

export function idRegistroFacturacion(facturaId: string): string {
  return `rf_${facturaId}`;
}

export function idEnvioVerifactu(registroFacturacionId: string): string {
  return `env_${registroFacturacionId}`;
}

export const ETIQUETAS_ESTADO_FACTURA: Record<EstadoFactura, string> = {
  BORRADOR: 'Borrador',
  EMITIDA: 'Emitida',
  PENDIENTE_REMISION: 'Pendiente de remisión',
  ENVIADA: 'Enviada',
  ACEPTADA: 'Aceptada',
  ACEPTADA_CON_ERRORES: 'Aceptada con errores',
  RECHAZADA: 'Rechazada',
  ERROR: 'Error',
  ANULADA: 'Anulada',
};
