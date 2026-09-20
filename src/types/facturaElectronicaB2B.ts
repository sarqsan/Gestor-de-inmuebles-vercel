/**
 * GAP 8 — FACTURA ELECTRÓNICA OBLIGATORIA B2B (RD 238/2026, BOE-A-2026-7295).
 * ============================================================================
 * MARCO NORMATIVO Y SEPARACIÓN DE BLOQUES (FASE 2):
 *
 * 1) Factura ordinaria/PDF      → GAP 7 (Factura + PDF). El PDF NO basta para la
 *                                 obligación B2B: hace falta mensaje estructurado EN 16931.
 * 2) Factura electrónica B2B    → ESTE BLOQUE (GAP 8): intercambio entre empresarios
 *                                 y profesionales (Ley 18/2022 + RD 238/2026).
 * 3) RRSIF                      → GAP 7 (registros de facturación, huella encadenada).
 *                                 Independiente: el registro RRSIF documenta la factura
 *                                 en el sistema; la factura electrónica B2B la intercambia.
 * 4) VERI*FACTU                 → GAP 7 (verifactuTransport). Obligación de remisión de
 *                                 registros a la AEAT; NO se confunde con el intercambio B2B.
 * 5) NO VERI*FACTU              → GAP 7 (modalidad del sistema de facturación).
 * 6) B2G / FACe                 → FUERA de GAP 8 (Ley 25/2013, Facturae 3.2.x para
 *                                 Administraciones Públicas). Bloque independiente;
 *                                 no se mezcla con B2B.
 *
 * SINTAXIS ADMITIDAS (RD 238/2026, modelo europeo EN 16931):
 *   - CII (UN/CEFACT Cross Industry Invoice)  → implementada en GAP 8.
 *   - UBL 2.1 (OASIS)                         → implementada en GAP 8 (además, la copia
 *                                                fiel a la solución pública se remite en UBL).
 *   - Facturae 3.2.x                          → implementada en GAP 8 (sintaxis oficial española).
 *   - EDIFACT                                 → NO implementado (adaptador previsto; sin
 *                                                esquema propio: no se inventa).
 *
 * PLATAFORMAS: solución pública de facturación electrónica (SPFE, AEAT, vía FACeB2B)
 * y plataformas privadas certificadas e interoperables. Las especificaciones técnicas
 * de conexión dependen de desarrollo normativo/técnico posterior → PENDIENTE: los
 * adaptadores existen como preparación, nunca simulan una conexión de producción.
 *
 * NO se inventan APIs, endpoints, certificados, credenciales ni esquemas XSD.
 */

import { Factura } from './facturacion';

// ---------------------------------------------------------------------------
// Formato y plataformas
// ---------------------------------------------------------------------------

export type FormatoFacturaElectronica = 'CII' | 'UBL_2_1' | 'FACTURAE_3_2' | 'EDIFACT';

export type PlataformaIntercambio =
  | 'SPFE_AEAT' // solución pública (AEAT / FACeB2B)
  | 'PLATAFORMA_PRIVADA';

// ---------------------------------------------------------------------------
// Estados del intercambio B2B (separados de VERI*FACTU y del estado fiscal)
// ---------------------------------------------------------------------------

/**
 * Estado de intercambio/aceptación/pago de la factura electrónica B2B.
 * Incluye el ciclo de vida de la factura (aceptación/rechazo) y el estado de
 * pago (comunicación de estados obligatoria del RD 238/2026).
 */
export type EstadoFacturaB2B =
  | 'BORRADOR'
  | 'GENERADA'
  | 'VALIDADA'
  | 'DISPUESTA_PARA_ENVIO'
  | 'ENVIADA'
  | 'RECIBIDA'
  | 'ACEPTADA'
  | 'RECHAZADA'
  | 'PAGADA'
  | 'PARCIALMENTE_PAGADA'
  | 'ANULADA'
  | 'RECTIFICADA';

// ---------------------------------------------------------------------------
// Partes (identificación fiscal requerida por el Reglamento de facturación)
// ---------------------------------------------------------------------------

export interface ParteFacturaB2B {
  nombreRazonSocial: string;
  nif: string;
  direccion?: string;
  codigoPostal?: string;
  municipio?: string;
  provincia?: string;
  pais?: string; // ISO 3166-1 alfa-2; por defecto 'ES'
  email?: string;
  telefono?: string;
  /** Identificador del receptor en su plataforma (interoperabilidad entre plataformas). */
  identificadorPlataforma?: string;
  /** Plataforma de intercambio que utiliza (interoperabilidad). */
  plataforma?: PlataformaIntercambio;
}

// ---------------------------------------------------------------------------
// Información de pago (separada del cobro: la conciliación GAP 6 manda)
// ---------------------------------------------------------------------------

export interface InformacionPagoB2B {
  formaPago?: Factura['formaPago'];
  iban?: string;
  referencia?: string;
  vencimiento?: string; // yyyy-mm-dd
  /** Estado económico derivado de Cobros/GAP 6 (nunca inventado por GAP 8). */
  estadoPago?: 'NO_PAGADA' | 'PARCIALMENTE_PAGADA' | 'PAGADA';
  importePagado?: number;
  fechaUltimoPago?: string; // yyyy-mm-dd
}

// ---------------------------------------------------------------------------
// Modelo de intercambio (representación electrónica de una Factura GAP 7)
// ---------------------------------------------------------------------------

/**
 * FacturaElectronicaB2B: representación/intercambio electrónico de una Factura interna.
 * NO duplica el cálculo económico de GAP 7: los importes se copian de la factura
 * validada y nunca se recalculan ni alteran aquí.
 */
export interface FacturaElectronicaB2B {
  /** ID determinista: sha256(facturaId + formato + versión de generación). */
  id: string;
  facturaId: string; // correlación con la factura interna GAP 7
  propietarioId: string; // aislamiento (mismo obligado que la factura)

  emisor: ParteFacturaB2B;
  receptor: ParteFacturaB2B;

  // Identificación documental (de la factura interna; no se re-numera)
  serie: string;
  numero: number;
  ejercicio: number;
  numeroCompleto: string;
  fechaExpedicion: string; // yyyy-mm-dd (representación electrónica)
  fechaOperacion?: string; // yyyy-mm-dd
  vencimiento?: string; // yyyy-mm-dd

  // Datos económicos COPIADOS de la factura GAP 7 (sin recalcular)
  baseImponible: number;
  cuotaIva: number;
  cuotaRetencion: number;
  importeTotal: number;
  tipoIvaAplicado?: number; // % principal informado en la factura
  moneda: 'EUR';

  // Líneas (representación fiel de las líneas de la factura interna)
  lineas: LineaFacturaB2B[];

  // Referencias e inmueble/contrato cuando proceda
  referencias?: string[];
  inmuebleId?: string;
  contratoId?: string;

  // Formato y estado
  formato: FormatoFacturaElectronica;
  estado: EstadoFacturaB2B;
  informacionPago: InformacionPagoB2B;

  // Intercambio / interoperabilidad
  plataforma?: PlataformaIntercambio;
  externalId?: string; // identificador asignado por la plataforma (si existe)
  idempotencyKey: string; // evita envíos/registros duplicados

  // Trazabilidad
  versionGeneracion: number; // regeneraciones deterministas
  historial: EventoB2B[];
  generadoPor: string;
  createdAt: string;
  updatedAt: string;
}

export interface LineaFacturaB2B {
  concepto: string;
  cantidad: number;
  precioUnitario: number;
  baseImponible: number;
  tipoIva: number; // %
  cuotaIva: number;
  tipoRetencion?: number; // %
  cuotaRetencion?: number;
}

// ---------------------------------------------------------------------------
// Trazabilidad de operaciones (toda transición queda registrada)
// ---------------------------------------------------------------------------

export interface EventoB2B {
  id: string; // determinista: sha256(facturaElectronicaId + operacion + estadoNuevo + fecha)
  fecha: string; // ISO
  usuario: string;
  operacion:
    | 'GENERACION'
    | 'VALIDACION'
    | 'PREPARACION_ENVIO'
    | 'ENVIO'
    | 'RECEPCION'
    | 'ACEPTACION'
    | 'RECHAZO'
    | 'PAGO'
    | 'PAGO_PARCIAL'
    | 'ANULACION'
    | 'RECTIFICACION'
    | 'REINTENTO'
    | 'ERROR';
  estadoAnterior: EstadoFacturaB2B;
  estadoNuevo: EstadoFacturaB2B;
  resultado: 'OK' | 'ERROR';
  error?: string;
  externalId?: string;
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

export interface ValidacionFacturaB2B {
  valido: boolean; // sin errores bloqueantes (puede tener advertencias)
  erroresBloqueantes: string[];
  advertencias: string[];
}

// ---------------------------------------------------------------------------
// Transporte / intercambio (FASE 7: arquitectura desacoplada)
// ---------------------------------------------------------------------------

export type ModoTransporteB2B = 'PREPARACION' | 'PRODUCCION';

/**
 * Interfaz abstracta de transporte/intercambio. Permite conectar en el futuro la
 * solución pública (SPFE), plataformas privadas certificadas u otros mecanismos
 * oficialmente admitidos, sin acoplar el ERP a un proveedor concreto.
 */
export interface AdaptadorIntercambioB2B {
  id: string;
  nombre: string;
  plataforma: PlataformaIntercambio;
  modo: ModoTransporteB2B;
  /** Descripción del mecanismo oficial y requisitos externos reales. */
  mecanismo: string;
  requisitosExternos: string[];
  /** Prepara/entrega la factura. En modo PREPARACION deja constancia clara de que NO es un envío real. */
  enviar(feb: FacturaElectronicaB2B, contenido: string): ResultadoTransporteB2B;
  /** Reintento controlado con la misma idempotencyKey (no duplica envíos). */
  reintentar(feb: FacturaElectronicaB2B, contenido: string): ResultadoTransporteB2B;
}

export interface ResultadoTransporteB2B {
  ok: boolean;
  simulado: boolean; // true ⇒ NO es un envío real a producción
  externalId?: string;
  error?: string;
  detalle: string;
}
