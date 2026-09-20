/**
 * BLOQUE B — Tesorería, Liquidaciones de Propietarios y SEPA.
 * Tipos del dominio. Fichero nuevo y aditivo: no modifica src/types.ts.
 */

export type EstadoLiquidacion =
  | 'BORRADOR'
  | 'APROBADA'
  | 'PAGADA'
  | 'ANULADA'
  | 'REVERSADA';

/** Clasificación contable de cada línea para distinguir devengado/cobrado/pagado/etc. */
export type NaturalezaLineaLiquidacion =
  | 'cobrado' // ingreso efectivamente cobrado (RECIBIDO/VERIFICADO)
  | 'devengado_pendiente' // informativo: previsto no cobrado (NO liquida)
  | 'honorario' // comisión de administración
  | 'iva_honorarios' // IVA sobre honorarios (cuando proceda)
  | 'gasto' // gasto/adelanto imputable al propietario
  | 'retencion' // retención practicada cuando legalmente procede
  | 'ajuste' // ajuste de redondeo u otro ajuste trazable
  | 'pagado' // marca informativa de pago al propietario
  | 'retenido'; // importe retenido pendiente (p.ej. fianza en custodia informativa)

export interface LineaLiquidacion {
  id: string;
  naturaleza: NaturalezaLineaLiquidacion;
  concepto: string;
  /** Importe con signo: positivo suma al propietario, negativo resta. */
  importe: number;
  inmuebleId?: string;
  inmuebleDireccion?: string;
  contratoId?: string;
  cobroId?: string;
  periodoMesAnio?: string;
  gastoId?: string;
  referencia?: string;
  detalle?: string;
}

export interface ConfigFiscalLiquidacion {
  /** % comisión de administración sobre cobrado (p.ej. 8 = 8%). */
  honorariosPct: number;
  /** % IVA sobre honorarios. Parametrizable; por defecto 21. */
  ivaHonorariosPct: number;
  /** Si false, no se calcula IVA sobre honorarios (p.ej. exención justificada). */
  aplicaIvaHonorarios: boolean;
  /** Solo true cuando existe obligación legal (NO vivienda habitual). */
  aplicaRetencion: boolean;
  /** % retención (p.ej. 19 para inmuebles urbanos con arrendatario obligado). */
  retencionPct: number;
  motivoRetencion?: string;
  /** Fuente/regla aplicada (obligatorio si aplicaRetencion). Ej: "Art. 75.3.g RIRPF...". */
  fuenteRegla?: string;
  /** Reparto a copropietario: solo si se configura explícitamente. */
  repartoCopropiedad?: {
    segundoPropietarioId: string;
    segundoPropietarioNombre: string;
    porcentajeSegundo: number; // 0-100
  };
}

export interface HistorialLiquidacionItem {
  id: string;
  fecha: string; // ISO
  actorId?: string;
  actorNombre?: string;
  accion: string;
  detalle?: string;
  estadoAnterior?: EstadoLiquidacion;
  estadoNuevo?: EstadoLiquidacion;
}

export interface LiquidacionPropietario {
  id: string; // `liq_{propietarioId}_{YYYY-MM}` (idempotente por clave natural)
  propietarioId: string;
  propietarioNombre: string;
  propietarioNif?: string;
  /** Periodo de liquidación YYYY-MM. */
  periodo: string;
  anio: number;
  mes: number;
  inmuebleIds: string[];
  contratoIds: string[];
  cobroIds: string[];
  gastoIds: string[];
  lineas: LineaLiquidacion[];
  totalBrutoCobrado: number;
  totalDevengadoPendiente: number; // informativo, no suma al neto
  totalHonorarios: number;
  totalIvaHonorarios: number;
  totalGastos: number;
  totalRetenciones: number;
  totalAjustes: number;
  totalDeducciones: number;
  netoPropietario: number;
  estado: EstadoLiquidacion;
  configFiscal: ConfigFiscalLiquidacion;
  /** Clave de idempotencia: propietarioId|periodo|hash(cobros+gastos+config). */
  claveIdempotencia: string;
  hashCalculo: string;
  cuentaAbonoIban?: string;
  cuentaAbonoTitular?: string;
  fechaGeneracion: string;
  fechaAprobacion?: string;
  aprobadaPor?: string;
  aprobadaPorId?: string;
  fechaPago?: string;
  referenciaBancariaPago?: string;
  ordenPagoId?: string;
  pdfGeneradoEn?: string;
  pdfStoragePath?: string;
  anuladaMotivo?: string;
  reversaALiquidacionId?: string;
  creadoPor?: string;
  creadoPorId?: string;
  historial: HistorialLiquidacionItem[];
  notas?: string;
}

/** Gasto del inmueble imputable (colección `gastos_inmuebles`). */
export type EstadoGasto = 'pendiente' | 'pagado' | 'liquidado' | 'anulado';
export type ImputacionGasto = 'propietario' | 'inquilino' | 'comunidad' | 'seguro' | 'tercero';
export type PagadoPor = 'administracion' | 'propietario' | 'inquilino' | 'seguro';

export interface GastoInmueble {
  id: string;
  inmuebleId: string;
  inmuebleDireccion?: string;
  propietarioId: string;
  contratoId?: string;
  trabajoId?: string; // origen trazable (trabajo profesional finalizado)
  presupuestoId?: string;
  categoria: string; // reparacion|comunidad|ibi|seguro|suministro|administracion|otro
  concepto: string;
  base: number;
  ivaPct: number;
  ivaImporte: number;
  total: number;
  fechaGasto: string; // YYYY-MM-DD
  fechaPago?: string;
  pagadoPor: PagadoPor;
  imputableA: ImputacionGasto;
  estado: EstadoGasto;
  liquidacionId?: string;
  facturaNumero?: string;
  proveedorNombre?: string;
  notas?: string;
  creadoPor?: string;
  creadoPorId?: string;
  fechaCreacion: string;
  fechaActualizacion: string;
}

/** Mandato de adeudo directo SEPA (colección `mandatos_sepa`). */
export interface MandatoSEPA {
  id: string; // MndtId único
  deudorNombre: string;
  deudorIban: string;
  deudorBic?: string;
  acreedorNombre: string;
  acreedorId: string; // Creditor Identifier (AT-02)
  fechaFirma: string; // YYYY-MM-DD
  secuencia: 'FRST' | 'RCUR' | 'FNAL' | 'OOFF';
  esquema: 'CORE' | 'B2B';
  contratoId?: string;
  inquilinoId?: string;
  inmuebleId?: string;
  referenciaContrato?: string;
  activo: boolean;
  fechaCreacion: string;
}

/** Orden de pago con origen trazable (colección `ordenes_pago`). */
export type EstadoOrdenPago = 'BORRADOR' | 'APROBADA' | 'EN_FICHERO' | 'PREPARADA' | 'PAGADA' | 'CANCELADA';
export type TipoOrdenPago = 'liquidacion_propietario' | 'proveedor' | 'devolucion' | 'otro';

export interface OrdenPago {
  id: string; // `op_{origen}_{destinatario}` idempotente
  tipo: TipoOrdenPago;
  /** Entidad origen trazable. OBLIGATORIO: nunca un importe libre. */
  origenTipo: 'liquidacion' | 'gasto' | 'trabajo' | 'presupuesto';
  origenId: string;
  origenReferencia?: string;
  beneficiarioNombre: string;
  beneficiarioIban: string;
  beneficiarioBic?: string;
  importe: number;
  concepto: string;
  referenciaEndToEnd: string; // EndToEndId determinista
  estado: EstadoOrdenPago;
  ficheroSepaId?: string;
  fechaCreacion: string;
  fechaAprobacion?: string;
  fechaPago?: string;
  referenciaBancaria?: string;
  creadoPor?: string;
  creadoPorId?: string;
  historial: { id: string; fecha: string; accion: string; detalle?: string; actorNombre?: string }[];
}

/** Fichero SEPA generado (colecciones `ficheros_sepa`). GENERAR→VALIDAR→PREPARAR. */
export type TipoFicheroSEPA = 'pain.008' | 'pain.001';
export type EstadoFicheroSEPA = 'BORRADOR' | 'VALIDADO' | 'PREPARADO' | 'DESCARGADO' | 'ANULADO';

export interface ItemFicheroSEPA {
  id: string;
  origenTipo: 'cobro' | 'orden_pago';
  origenId: string;
  referencia: string; // EndToEndId
  deudorOacreedor: string;
  iban: string;
  importe: number;
}

export interface FicheroSEPA {
  id: string; // `sepa_{tipo}_{MsgId}`
  tipo: TipoFicheroSEPA;
  esquema: 'CORE' | 'B2B' | 'SCT';
  versionXml: string; // pain.008.001.02 | pain.001.001.03
  msgId: string; // MessageIdentification determinista
  fechaCreacion: string;
  fechaEjecucion: string; // ReqClctnDt / ReqdExctnDt
  acreedorNombre: string;
  acreedorId?: string; // CI (solo 008)
  acreedorIban: string;
  acreedorBic?: string;
  numOperaciones: number;
  importeTotal: number;
  moneda: string; // EUR
  items: ItemFicheroSEPA[];
  xml: string;
  hashContenido: string; // idempotencia + detección de duplicados
  estado: EstadoFicheroSEPA;
  erroresValidacion: string[];
  creadoPor?: string;
  creadoPorId?: string;
  historial: { id: string; fecha: string; accion: string; detalle?: string; actorNombre?: string }[];
}

/** Movimiento de tesorería (vista de lectura; adaptador hacia futura conciliación camt). */
export interface MovimientoTesoreria {
  id: string;
  fecha: string;
  tipo: 'cobro' | 'pago_propietario' | 'pago_proveedor' | 'gasto' | 'ajuste';
  descripcion: string;
  importe: number; // signo: + entrada, - salida
  estado: 'previsto' | 'cobrado' | 'pagado' | 'pendiente' | 'conciliado';
  cobroId?: string;
  liquidacionId?: string;
  ordenPagoId?: string;
  gastoId?: string;
  referenciaBancaria?: string;
  inmuebleId?: string;
  propietarioId?: string;
}

/** Evento de notificación del bloque (vía audit_logs + callback futuro dispatcher). */
export type EventoTesoreria =
  | 'liquidacion.generada'
  | 'liquidacion.aprobada'
  | 'liquidacion.pagada'
  | 'liquidacion.anulada'
  | 'pago.incidencia'
  | 'sepa.preparado'
  | 'sepa.error_validacion';

export interface NotificacionTesoreria {
  id: string;
  evento: EventoTesoreria;
  fecha: string;
  entidadTipo: 'liquidacion' | 'orden_pago' | 'fichero_sepa';
  entidadId: string;
  propietarioId?: string;
  titulo: string;
  mensaje: string;
  actorNombre?: string;
}
