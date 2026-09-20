/**
 * GAP4 — Financiación Hipotecaria Avanzada.
 * -----------------------------------------
 * Modelo tipado y persistible de financiación asociada a un inmueble.
 * Bloque económico PURA (sin imports runtime). Diseñado para que Arena A lo
 * integre selectivamente sobre los motores existentes y lo persista donde
 * corresponda (Firestore), sin sustituir cobros.
 *
 * Seguridad:
 *  - No se almacenan credenciales, tokens PSD2 ni secretos bancarios.
 *  - La titularidad (cumple aislamiento por propietario/inmueble) se valida
 *    en el usuario autorizado; un no propietario no puede ver/editar la
 *    financiación de otro.
 */

export type ModalidadInteres = 'FIJO' | 'VARIABLE' | 'MIXTO';
export type SistemaAmortizacion = 'FRANCES' | 'LINEAL';
export type TipoCarencia = 'NINGUNA' | 'SOLO_INTERESES' | 'TOTAL';
export type EstadoFinanciacion = 'SOLICITADA' | 'FORMALIZADA' | 'CANCELADA' | 'LIQUIDADA';

/** Criterio de redondeo para la cuota/importes del modelo. */
export type Redondeo = 'centimo' | 'euro';

export interface FinanciacionParams {
  principal: number;
  valorReferencia: number;
  plazoMeses: number;
  tipoInteresAnual: number; // en tanto por ciento: 3.5 == 3.5%
  sistemaAmortizacion: SistemaAmortizacion;
  modalidadInteres: ModalidadInteres;
  inicio?: string; // YYYY-MM-DD
  diferencial?: number; // puntos porcentuales sobre el índice (variable/mixto)
  indiceReferencia?: string; // p.ej. 'EURIBOR_12M'
  valorIndice?: number; // valor del índice en tanto por ciento
  carencia?: TipoCarencia;
  carenciaMeses?: number;
  // Mixto
  periodoInicialFijoMeses?: number;
  tipoInteresAnualVariable?: number; // tipo efectivo variable tras el tramo fijo (para simulación sin banco)
  criterioRedondeo?: Redondeo;
}

export interface EntidadFinanciera {
  id: string;
  nombre: string;
  area?: string;
  telefono?: string;
  email?: string;
  sucursal?: string;
}

export interface EventoFinanciacion {
  fecha: string; // ISO
  accion:
    | 'CREADA'
    | 'MODIFICADA'
    | 'AMORTIZACION_ANTICIPADA'
    | 'CANCELADA'
    | 'LIQUIDADA'
    | 'ESCENARIO_CONFIRMADO';
  detalle?: string;
  actor?: string;
  actorId?: string;
}

export interface AsientoAmortizacion {
  periodo: number; // 1..plazoMeses
  fecha: string; // YYYY-MM-DD
  tipoTramo?: 'normal' | 'carencia_solo_intereses' | 'carencia_total';
  cuotaTotal: number;
  intereses: number;
  capitalAmortizado: number;
  capitalPendiente: number;
}

export interface EscenarioFinanciacion {
  id: string;
  financiacionId: string;
  nombre: string;
  params: FinanciacionParams;
  fechaCreacion: string;
  esSimulacion: boolean;
}

export interface Financiacion {
  id: string;
  inmuebleId: string;
  propietarioId: string;
  entidad: EntidadFinanciera;
  importeFinanciado: number;
  valorReferencia: number;
  ltv: number; // importeFinanciado / valorReferencia * 100
  plazoMeses: number;
  fechaFormalizacion: string;
  fechaInicio: string;
  tipoInteresAnual: number;
  modalidadInteres: ModalidadInteres;
  diferencial?: number;
  indiceReferencia?: string;
  sistemaAmortizacion: SistemaAmortizacion;
  carencia: TipoCarencia;
  carenciaMeses: number;
  gastosFinancieros?: number;
  gastosFormalizacion?: number;
  estado: EstadoFinanciacion;
  saldoPendiente: number;
  fechaCancelacion?: string;
  cuadroAmortizacion: AsientoAmortizacion[];
  eventos: EventoFinanciacion[];
  reembolsosAnticipados?: {
    id: string;
    fecha: string;
    importe: number;
    gastoCancelacion?: number;
    capitalPendienteAntes: number;
    capitalPendienteDespues: number;
    traza: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface CosteFinanciero {
  principal: number;
  totalIntereses: number;
  costeGastos?: number;
  totalPagado: number;
  capitalPendiente: number;
  cuotasEjecutadas: number;
  cuotasTotales: number;
  ltvActual: number;
}

export interface ImpactoFinanciero {
  inversInicial?: number;
  importeFinanciado: number;
  capitalAportado: number;
  totalIntereses: number;
  capitalPendiente: number;
  flujoCaja?: number;
  impactoRentabilidad?: number;
  explicacion?: string;
}

export interface ResultadoValidacionFinanciacion {
  valido: boolean;
  errores: string[];
}

// ---------------------------------------------------------------------------
// LTV
// ---------------------------------------------------------------------------

export function calcularLTV(importeFinanciado: number, valorReferencia: number): number | null {
  if (!Number.isFinite(importeFinanciado) || !Number.isFinite(valorReferencia)) return null;
  if (importeFinanciado < 0 || valorReferencia <= 0) return null;
  return redondear2((importeFinanciado / valorReferencia) * 100);
}

// ---------------------------------------------------------------------------
// Precisión numérica (2 decimales, céntimos)
// ---------------------------------------------------------------------------

export function redondear2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Validación del modelo
// ---------------------------------------------------------------------------

export function validarFinanciacion(p: FinanciacionParams): ResultadoValidacionFinanciacion {
  const errores: string[] = [];
  if (!Number.isFinite(p.principal) || p.principal <= 0) errores.push('principal_debe_ser_positivo');
  if (!Number.isFinite(p.valorReferencia) || p.valorReferencia <= 0) errores.push('valor_referencia_invalido');
  if (!Number.isInteger(p.plazoMeses) || p.plazoMeses <= 0) errores.push('plazo_invalido');
  if (!Number.isFinite(p.tipoInteresAnual) || p.tipoInteresAnual < 0) errores.push('tipo_interes_invalido');
  if (p.tipoInteresAnual === 0 && p.carencia !== 'NINGUNA' && (p.carenciaMeses || 0) > 0) {
    // sin interés y con carencia no sería consistente financieramente, permitido pero sin intereses
  }
  if (p.carenciaMeses != null && (p.carenciaMeses < 0 || p.carenciaMeses > p.plazoMeses)) {
    errores.push('carencia_fuera_de_plazo');
  }
  if (p.sistemaAmortizacion !== 'FRANCES' && p.sistemaAmortizacion !== 'LINEAL') {
    errores.push('sistema_invalido');
  }
  if (p.modalidadInteres !== 'FIJO' && p.modalidadInteres !== 'VARIABLE' && p.modalidadInteres !== 'MIXTO') {
    errores.push('modalidad_invalida');
  }
  if (p.modalidadInteres === 'MIXTO') {
    if (!p.periodoInicialFijoMeses || p.periodoInicialFijoMeses <= 0) errores.push('mixto_requiere_periodo_fijo');
    if (p.periodoInicialFijoMeses >= p.plazoMeses) errores.push('mixto_periodo_fijo_debe_ser_menor_que_plazo');
    if (p.tipoInteresAnualVariable == null || p.tipoInteresAnualVariable < 0) errores.push('mixto_requiere_tipo_variable');
  }
  return { valido: errores.length === 0, errores };
}
