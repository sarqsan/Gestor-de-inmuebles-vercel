/**
 * BLOQUE C — Morosidad avanzada, recobro y expediente legal.
 * Tipos del dominio. Fichero NUEVO y ADITIVO: no modifica src/types.ts.
 *
 * Principios rectores (idénticos a los del BLOQUE B):
 *  - CERO duplicación de la realidad económica: la deuda se DERIVA de
 *    `CobroPeriodo` (colección canónica `contratos_formalizacion.registroCobros`
 *    gestionada por `cobrosEngine`). Aquí solo se guardan REFERENCIAS + importes
 *    congelados como evidencia de la reclamación en una fecha dada.
 *  - Ningún plazo de este fichero es un «plazo legal»: son políticas configurables
 *    (ver `PoliticaMorosidad`). Los plazos verificados se documentan en
 *    `docs/BLOQUE-C-NORMATIVA.md` con norma/artículo/fecha de consulta/ámbito.
 *  - Cantidades jurídicas (intereses, penalizaciones, costas) NUNCA se calculan
 *    si no existe una fuente verificada: ver `ModuloImporteJuridico`.
 *  - Nada se simula: una comunicación solo consta como «enviada» si un transporte
 *    real la confirmó (dispatcher GAP1). Mientras no lo haya: PREPARADA /
 *    PENDIENTE_ENVIO / DEPENDENCIA_EXTERNA.
 *  - Sin secretos ni datos innecesarios: las evidencias usan una lista blanca de
 *    tipos y un filtro de claves (ver `morosidadEngine.sanearEvidencia`).
 */

// ==========================================================================
// CLASIFICACIÓN DE LA DEUDA (detección determinista sobre cobros canónicos)
// ==========================================================================

/**
 * Clasificación de un periodo de cobro a efectos de morosidad.
 * La detección NUNCA se hace «porque exista un recibo»: exige fecha de vencimiento
 * superada + impago real, y excluye explícitamente anulaciones, devoluciones de
 * liquidación, correcciones y deudas en disputa.
 */
export type ClasificacionDeuda =
  /** Pendiente pero aún NO vencida (dentro de plazo o días de gracia). */
  | 'EN_PLAZO'
  /** Vencida con la totalidad impagada. */
  | 'VENCIDA_TOTAL'
  /** Vencida con pago parcial (queda saldo). */
  | 'VENCIDA_PARCIAL'
  /** Cobro íntegro efectivamente cobrado y verificado (RECIBIDO/VERIFICADO). */
  | 'PAGADA'
  /** Cobro íntegro pagado pero sin verificación/conciliación (PAGADO). */
  | 'PAGADA_SIN_VERIFICAR'
  /** Estado INCIDENCIA: el impago está en disputa → NO recobrable automáticamente. */
  | 'EN_DISPUTA'
  /** ANULADO / DEVUELTO / CORREGIDO: no existe deuda exigible. */
  | 'NO_RECLAMABLE';

/** Estado del tramo de deuda dentro del expediente. */
export type EstadoTramoDeuda =
  | 'ABIERTA'
  | 'EN_RECOBRO'
  | 'PARCIALMENTE_PAGADA'
  | 'PAGADA'
  | 'ANULADA'
  | 'CORREGIDA'
  | 'EN_DISPUTA';

/**
 * Pieza de deuda: una línea DERIVADA de un `CobroPeriodo` canónico.
 * No duplica el cobro: guarda la referencia (cobroId) y el importe reclamado en la
 * fecha de congelación (`fechaDeteccion`), más la trazabilidad de la disputa.
 */
export interface PiezaDeuda {
  /** Id determinista e idempotente: `pieza_{cobroId}`. */
  id: string;
  cobroId: string;
  contratoId: string;
  inmuebleId: string;
  propietarioId: string;
  habitacionId?: string;
  periodoMesAnio: string;
  nombreMes?: string;
  fechaVencimiento: string; // YYYY-MM-DD (copiada del cobro: fuente = cobrosEngine)
  importePrevisto: number;
  /** Importe efectivamente cobrado en la fuente en el momento de la detección. */
  importeRecibido: number;
  /** Capital reclamado = max(0, previsto − recibido), redondeado a céntimos. */
  importeReclamado: number;
  estadoCobroOrigen: string;
  clasificacion: ClasificacionDeuda;
  estado: EstadoTramoDeuda;
  /** Días de retraso en la fecha de detección. */
  diasRetraso: number;
  /** Motivo de disputa registrado en el cobro (INCIDENCIA), si existiera. */
  motivoDisputa?: string;
  /** Si la deuda es objeto de rectificación/anulación posterior (trazable, no se borra). */
  notaRectificacion?: string;
  fechaDeteccion: string; // ISO
  ultimaActualizacion: string; // ISO
}

// ==========================================================================
// MÁQUINA DE ESTADOS DEL EXPEDIENTE
// ==========================================================================

export type EstadoExpediente =
  | 'DETECTADA'
  | 'PENDIENTE_CONTACTO'
  | 'RECLAMACION_INICIADA'
  | 'EN_RECOBRO'
  | 'COMPROMISO_PAGO'
  | 'PAGO_PARCIAL'
  | 'COMPROMISO_INCUMPLIDO'
  | 'PAGADA'
  | 'ESCALADA'
  | 'JURIDICA'
  | 'CERRADA';

/** Estados sin salida ordinario (solo reapertura documentada o cierre). */
export const ESTADOS_TERMINALES_EXPEDIENTE: EstadoExpediente[] = ['PAGADA', 'CERRADA'];

export const ESTADO_EXPEDIENTE_LABELS: Record<EstadoExpediente, string> = {
  DETECTADA: 'Deuda detectada',
  PENDIENTE_CONTACTO: 'Pendiente de contacto',
  RECLAMACION_INICIADA: 'Reclamación iniciada',
  EN_RECOBRO: 'En recobro',
  COMPROMISO_PAGO: 'Compromiso de pago',
  PAGO_PARCIAL: 'Pago parcial',
  COMPROMISO_INCUMPLIDO: 'Compromiso incumplido',
  PAGADA: 'Pagada',
  ESCALADA: 'Escalada (aseguradora)',
  JURIDICA: 'Vía jurídica',
  CERRADA: 'Cerrada',
};

/**
 * Códigos de motivo OBLIGATORIOS en transiciones sensibles. No son causales
 * jurídicas: son claves operativas para que el histórico sea interpretable
 * (incluida la futura capa de IA asistente, mapa maestro §6.3).
 */
export type MotivoTransicion =
  | 'DETECCION_AUTOMATICA'
  | 'CONTACTO_REALIZADO'
  | 'REQUERIMIENTO_ENVIADO'
  | 'PAGO_RECIBIDO'
  | 'PAGO_PARCIAL_RECIBIDO'
  | 'COMPROMISO_ALCANZADO'
  | 'COMPROMISO_CUMPLIDO'
  | 'COMPROMISO_INCUMPLIDO'
  | 'DEUDA_SALDADA'
  | 'ESCALADO_ASEGURADORA'
  | 'ESCALADO_JURIDICO'
  | 'DISPUTA_APERTURA'
  | 'DISPUTA_RESUELTA'
  | 'ANULACION_O_RECTIFICACION'
  | 'REAPERTURA'
  | 'CERRADA_SIN_COBRO'
  | 'CAMBIO_MANUAL';

export interface TransicionExpediente {
  id: string;
  expedienteId: string;
  /** Clave de aislamiento (las reglas §33 la exigen): siempre se deriva del expediente. */
  propietarioId?: string;
  fecha: string; // ISO
  estadoAnterior: EstadoExpediente | null;
  estadoNuevo: EstadoExpediente;
  motivo: MotivoTransicion;
  observaciones?: string;
  actorId?: string;
  actorNombre?: string;
  /** Referencia a evidencia documental cuando procede (id de `actuaciones_morosidad`). */
  evidenciaId?: string;
  /** Huella de la deuda en el momento del cambio (importe total), para auditoría. */
  importeTotalAntes: number;
  importeTotalDespues: number;
}

// ==========================================================================
// POLÍTICA DE RECOBRO (dunning) — 100 % CONFIGURABLE
// ==========================================================================

export type CanalDeseado = 'EMAIL' | 'INAPP' | 'WEBHOOK' | 'WHATSAPP';

/**
 * Destinatarios posibles de una acción de recobro (mínimo privilegio por defecto).
 * `AVALISTA`/`CODEUDOR` solo se usan cuando constan en el contrato canónico
 * (cotitular/avalista): no se inventan contactos.
 */
export type DestinatarioPolitica = 'INQUILINO' | 'PROPIETARIO' | 'ADMINISTRACION' | 'AVALISTA' | 'CODEUDOR';

/** Acción del paso de la política. */
export type AccionPasoPolitica =
  /** Genera/registra una comunicación vía GAP1 (plantilla canónica). */
  | 'NOTIFICAR'
  /** Solo crea una tarea interna en la bandeja de administración. */
  | 'TAREA INTERNA'
  /** No hace nada (paso desactivable sin romper el histórico). */
  | 'NO_ACTION';

/**
 * PASO de la política de recobro. `diasOffset` son DÍAS NATURALES respecto del
 * vencimiento del periodo (negativo = antes del vencimiento: pre-recobro).
 * ⚠️ Son una política operativa configurable, NO un plazo legal.
 */
export interface PasoPoliticaMorosidad {
  /** Clave estable dentro de la política (p. ej. 'D+10'). Cambiarla invalida el plan en curso. */
  codigo: string;
  nombre: string;
  /** Días naturales desde `fechaVencimiento` en que el paso deviene accionable. */
  diasOffset: number;
  accion: AccionPasoPolitica;
  /** Clave de plantilla GAP1. Si se omite, se deriva de `codigo` (ver resolverPlantillaPaso). */
  tipoEvento?: string;
  /** Canal preferido (GAP1 decide el definitivo según disponibilidad real del transporte). */
  canal?: CanalDeseado;
  destinatarios: DestinatarioPolitica[];
  prioridad: 1 | 2 | 3; // 1 = alta
  /** Acción posterior sugerida al cerrarse el paso (clave de otro paso o 'ESCALAR'). */
  accionPosterior?: string;
  activo: boolean;
  /** Nota operativa libre (nunca se interpreta como requisito legal). */
  notas?: string;
}

export interface CriterioEscalado {
  /** Umbral configurable (días naturales de retraso del tramo más antiguo). */
  diasRetrasoMinimo: number;
  /** Umbral configurable de mensualidades completas impagadas. */
  mesesImpagadosMinimos: number;
  /** Exige que exista una comunicación de requerimiento registrada. */
  requiereRequerimientoFehaciente: boolean;
  /** Requiere que exista un MASC/actividad negociadora declarada ANTES de la vía judicial. */
  requiereMascDeclaradoParaJuridica: boolean;
}

export interface PoliticaMorosidad {
  id: string; // `pol_{propietarioId|'global'}_{slug}`
  propietarioId?: string; // ausente/global ⇒ política de referencia del ERP
  nombre: string;
  version: number;
  /** Días de gracia adicionales antes de considerar la deuda como recobrable. */
  diasGracia: number;
  pasos: PasoPoliticaMorosidad[];
  escalado: CriterioEscalado;
  activo: boolean;
  fechaCreacion: string;
  fechaActualizacion: string;
  creadoPor?: string;
  notas?: string;
  /**
   * Política por defecto del ERP. Los offsets D+3/D+10/D+20/D+30 que aparecen en la
   * orden de trabajo son un punto de partida CONFIGURABLE, no plazos legales.
   */
  origenDefecto?: boolean;
}

/** Ejecución de un paso de la política sobre un tramo de deuda (plan de recobro). */
export type EstadoPasoPlan =
  | 'PROGRAMADO'
  | 'ACCIONABLE'
  | 'PREPARADO'
  | 'ENVIADO'
  | 'SIN_TRANSPORTE'
  | 'OMITIDO'
  | 'ERROR'
  | 'BLOQUEADO';

export interface PasoPlanRecobro {
  /** Id determinista e idempotente: `paso_{expedienteId}_{pasoCodigo}_{cobroId}`. */
  id: string;
  expedienteId: string;
  piezaDeudaId?: string;
  cobroId?: string;
  pasoCodigo: string;
  pasoNombre: string;
  accion: AccionPasoPolitica;
  /** Fecha en la que el paso deviene accionable (vencimiento + offset + gracia). */
  fechaObjetivo: string; // YYYY-MM-DD
  /** Clave GAP1 resuelta (si `accion === 'NOTIFICAR'`). */
  tipoEvento?: string;
  canalSolicitado?: CanalDeseado;
  destinatarios: DestinatarioPolitica[];
  prioridad: 1 | 2 | 3;
  estado: EstadoPasoPlan;
  /** Referencia a la notificación GAP1 creada (si existe). */
  notificacionId?: string;
  idempotencyKey?: string;
  motivoBloqueo?: string;
  resultado?: string;
  versionPolitica: number;
  politicaId: string;
  generadoEn: string; // ISO
  actualizadoEn: string; // ISO
}

// ==========================================================================
// COMUNICACIONES (espejo local del registro GAP1 — nunca un segundo canal)
// ==========================================================================

/**
 * `PENDIENTE_ENVIO` / `PREPARADA` / `DEPENDENCIA_EXTERNA` se usan cuando NO hay
 * transporte real: el ERP prepara y registra, pero NUNCA afirma una entrega.
 */
export type EstadoComunicacion =
  | 'PREPARADA'
  | 'PENDIENTE_ENVIO'
  | 'PROGRAMADA'
  | 'ENVIADA'
  | 'FALLIDA'
  | 'CANCELADA'
  | 'DEPENDENCIA_EXTERNA'
  /** Registro manual de una comunicación ya realizada fuera del canal del ERP. */
  | 'REGISTRADA_MANUALMENTE';

export type MedioComunicacion =
  | 'EMAIL'
  | 'INAPP'
  | 'WEBHOOK'
  | 'WHATSAPP'
  | 'BUROFAX'
  | 'CARTA_CERTIFICADA'
  | 'LLAMADA'
  | 'PRESENCIAL'
  | 'NOTARIAL';

export interface ComunicacionExpediente {
  /** `com_{expedienteId}_{tipoEventoHash}` — derivado del idempotencyKey GAP1. */
  id: string;
  expedienteId: string;
  piezaDeudaId?: string;
  cobroId?: string;
  /** Clave de plantilla GAP1 usada (registro canónico). */
  tipoEvento: string;
  plantillaId: string;
  /** Origen GAP1 declarado (MOROSIDAD o COBRO para el pre-recobro). */
  origenNotificacion: string;
  idempotencyKey: string;
  /** Id de `notificaciones/{id}` si se creó el documento GAP1. */
  notificacionId?: string;
  medio: MedioComunicacion;
  canalReal?: string;
  destinatarioTipo: DestinatarioPolitica;
  /** Solo el dato de contacto estrictamente necesario (mínimo privilegio). */
  destinatarioReferencia?: string;
  asunto?: string;
  cuerpoResumen?: string;
  estado: EstadoComunicacion;
  /** Resultado devuelto por el dispatcher GAP1 (nunca inventado). */
  provider?: string;
  externalId?: string;
  error?: string;
  fechaPrevista?: string; // YYYY-MM-DD (plan)
  fechaRegistro: string; // ISO
  fechaEnvio?: string; // ISO — solo con confirmación real del canal
  /** Evidencia asociada en `actuaciones_morosidad` (si existe). */
  evidenciaId?: string;
  actorId?: string;
  actorNombre?: string;
  /** true = comunicación realizada fuera del ERP y solo documentada aquí. */
  externa: boolean;
  notas?: string;
}

// ==========================================================================
// ACTUACIONES / EVIDENCIAS (append-only)
// ==========================================================================

export type TipoEvidencia =
  | 'COMUNICACION'
  | 'LLAMADA'
  | 'RESPUESTA_DEUDOR'
  | 'PROMESA_PAGO'
  | 'PAGO'
  | 'DOCUMENTO'
  | 'ACTUACION_PROFESIONAL'
  | 'NOTIFICACION_FEHACIENTE'
  | 'INCIDENCIA'
  | 'VISITA_PRESENCIAL'
  | 'OTRO';

/** Lista negra de claves: una evidencia jamás debe contener credenciales. */
export const CLAVES_PROHIBIDAS_EVIDENCIA = [
  'password',
  'contraseña',
  'apiKey',
  'access_token',
  'accessToken',
  'refreshToken',
  'secret',
  'privateKey',
  'certificado',
  'firmaDigitalPin',
  'ibanSecreto',
  'cvv',
  'pin',
  'otp',
  // Adjuntos: la evidencia guarda REFERENCIA de Storage, nunca el binario embebido
  // (mantiene la coherencia con `sinSecretosMorosidad()` de firestore.rules).
  'base64Data',
  'adjuntoBase64',
] as const;

export interface EvidenciaMorosidad {
  /** `evi_{expedienteId}_{tipo}_{hash}` — determinista (replay no duplica). */
  id: string;
  expedienteId: string;
  /** Clave de aislamiento (las reglas §34 la exigen en la escritura). */
  propietarioId?: string;
  piezaDeudaId?: string;
  cobroId?: string;
  tipo: TipoEvidencia;
  fecha: string; // YYYY-MM-DD (fecha del hecho)
  hora?: string; // HH:mm (opcional)
  resumen: string;
  detalle?: string;
  /** Referencias a entidades canónicas (nunca datos duplicados de estas). */
  referenciaEntidadTipo?: 'cobro' | 'contrato' | 'comunicacion' | 'compromiso' | 'cuota' | 'liquidacion' | 'movimiento';
  referenciaEntidadId?: string;
  /** Archivo en Storage (ruta declarada; sin base64 en Firestore). */
  storagePath?: string;
  storageBucket?: string;
  nombreArchivo?: string;
  tipoMime?: string;
  tamanoBytes?: number;
  /** Importe si la evidencia es un pago/indemnización (siempre referenciado). */
  importeRelacionado?: number;
  resultado?: string;
  actorId?: string;
  actorNombre?: string;
  creadoEn: string; // ISO
  /** Solo append-only: no existe campo de edición. Una corrección = nueva evidencia. */
  corrigeEvidenciaId?: string;
}

// ==========================================================================
// COMPROMISOS DE PAGO
// ==========================================================================

export type EstadoCompromiso =
  | 'BORRADOR'
  | 'VIGENTE'
  | 'CUMPLIDO'
  | 'INCUMPLIDO'
  | 'CANCELADO';

export type EstadoCuotaCompromiso = 'PENDIENTE' | 'PARCIAL' | 'CUBIERTA' | 'VENCIDA_SIN_PAGO';

/**
 * Los pagos que cubren un compromiso NUNCA se inventan aquí: cada cuota se
 * «cubre» referenciando importes ya cobrados en `CobroPeriodo`
 * (`registrarPagoPeriodo` / conciliación GAP6 = fuente oficial del cobro).
 */
export interface CuotaCompromiso {
  /** `cuota_{compromisoId}_{n}` */
  id: string;
  numero: number;
  /** Importe pactado (cobrar antes de `fechaPrevista`). */
  importePrevisto: number;
  importeCubierto: number;
  fechaPrevista: string; // YYYY-MM-DD
  estado: EstadoCuotaCompromiso;
  /** Cobros canónicos que cubren esta cuota (referencias a CobroPeriodo). */
  cobroIds: string[];
  fechaCubierta?: string; // YYYY-MM-DD
  notas?: string;
}

export interface CompromisoPago {
  /** `cmp_{expedienteId}_{fechaPropuesta}` — determinista. */
  id: string;
  expedienteId: string;
  contratoId: string;
  inmuebleId: string;
  propietarioId: string;
  estado: EstadoCompromiso;
  fechaPropuesta: string; // YYYY-MM-DD
  importeTotal: number;
  importeCubierto: number;
  numPagos: number;
  periodicidadDias: number; // configurable (30 por defecto)
  cuotas: CuotaCompromiso[];
  /** Cómo se alcanzó (telefónico, email, documento firmado fuera, etc.). */
  origenRegistro: 'LLAMADA' | 'EMAIL' | 'ESCRITO' | 'PRESENCIAL' | 'OTRO';
  evidenciaId?: string;
  observaciones?: string;
  fechaIncumplimiento?: string; // ISO
  motivoIncumplimiento?: string;
  fechaCierre?: string; // ISO
  actorId?: string;
  actorNombre?: string;
  creadoEn: string; // ISO
  actualizadoEn: string; // ISO
  historial: {
    id: string;
    fecha: string;
    accion: string;
    detalle?: string;
    actorNombre?: string;
  }[];
}

// ==========================================================================
// ASEGURADORA (PREPARADO — sin API de aseguradora inventada)
// ==========================================================================

/** Ningún valor de este enum afirma una transmisión real: ver `canalUso`. */
export type EstadoExpedienteAseguradora =
  | 'SIN_POLIZA'
  | 'PREPARADO'
  | 'ENVIADO_MANUALMENTE'
  | 'PENDIENTE_RESPUESTA'
  | 'DOCUMENTACION_ADICIONAL_SOLICITADA'
  | 'ADMITIDA'
  | 'RECHAZADA'
  | 'INDEMNIZACION_PROPUESTA'
  | 'INDEMNIZACION_ACEPTADA'
  | 'INDEMNIZACION_PAGADA'
  | 'CERRADO_SIN_INDEMNIZACION';

export type CanalUso = 'MANUAL_GMAIL' | 'EMAIL_CLIENTE' | 'PORTAL_PROVEEDOR' | 'TELEFONO' | 'SIN_CANAL';

export interface ExpedienteAseguradora {
  expedienteId: string;
  /** Referencia a la póliza canónica (`polizas_seguros`) — no se copian sus datos. */
  polizaId?: string;
  aseguradoraNombre: string;
  aseguradoraEmail?: string;
  numeroPoliza?: string;
  referenciaSiniestro?: string;
  /** Referencia a la solicitud de seguro de impago existente, si aplica. */
  solicitudSeguroId?: string;
  fechaApertura: string; // YYYY-MM-DD
  fechaUltimaActualizacion: string; // ISO
  /** Suma de capital reclamada (derivada del expediente, nunca recalculada aquí). */
  importeReclamado: number;
  estado: EstadoExpedienteAseguradora;
  canalUso: CanalUso;
  franquicia?: number;
  indemnizacionCalculada?: number;
  indemnizacionAbonada?: number;
  fechaResolucion?: string; // YYYY-MM-DD
  /** Documentación remitida: SOLO referencias a evidencias/Storage del ERP. */
  documentacionEnviadaIds: string[];
  respuestas: {
    id: string;
    fecha: string; // YYYY-MM-DD
    resumen: string;
    evidenciaId?: string;
    actorNombre?: string;
  }[];
  notas?: string;
  /** Aviso de verificación: la cobertura/franquicia son condiciones de póliza, no reglas del ERP. */
  avisoCondicionesPoliza?: string;
}

// ==========================================================================
// EXPEDIENTE JURÍDICO (PREPARADO — sin presentación judicial simulada)
// ==========================================================================

export type EstadoExpedienteJuridico =
  | 'SIN_INICIAR'
  | 'PREPARADO'
  | 'DOCUMENTACION_COMPLETADA'
  | 'MASC_PENDIENTE'
  | 'MASC_DECLARADO_IMPOSIBLE'
  | 'MASC_CUMPLIDO'
  | 'DERIVADO_A_ABOGADO'
  | 'ESCRITO_PREPARADO'
  | 'DEPENDENCIA_EXTERNA_PRESENTACION'
  | 'PROCEDIMIENTO_EN_CURSO'
  | 'RESUELTO_FAVORABLE'
  | 'RESUELDO_DESFAVORABLE'
  | 'ARCHIVADO';

/** Estado del requisito de procedibilidad (actividad negociadora previa, LO 1/2025). */
export type EstadoRequisitoProcedibilidad =
  | 'NO_VERIFICADO'
  | 'PENDIENTE'
  | 'CUMPLIDO_EVIDENCIA'
  | 'IMPOSIBILIDAD_DECLARADA';

export interface ExpedienteJuridico {
  expedienteId: string;
  /** Referencia interna del expediente ante el despacho (la pone el usuario). */
  referenciaInterna?: string;
  estado: EstadoExpedienteJuridico;
  fechaDerivacion?: string; // YYYY-MM-DD
  /** Referencia al directorio `profesionales` si el despacho está dado de alta. */
  abogadoProfesionalId?: string;
  abogadoNombre?: string;
  abogadoColegiado?: string;
  abogadoContacto?: string;
  procuradorNombre?: string;
  procuradorReferencia?: string;
  /** Importe reclamado (derivado del expediente: no se recalcula). */
  importeReclamado: number;
  /** Conceptos adicionales admitidos solo si están respaldados (ver ModuloImporteJuridico). */
  conceptosAdicionalesIds: string[];
  documentacionIds: string[];
  /** Nº de procedimiento/órgano: SOLO si el usuario lo aporta (nunca generado). */
  numeroProcedimiento?: string;
  organoJudicial?: string;
  tipoProcedimiento?: 'VERBAL_250_1_1_LEC' | 'MONITORIO_812_LEC' | 'ORDINARIO' | 'OTRO';
  /** CAUCE VERIFICADO, NO AUTOMÁTICO: ver docs/BLOQUE-C-NORMATIVA.md. */
  cauceAviso?: string;
  requisitoProcedibilidad: EstadoRequisitoProcedibilidad;
  requisitoProcedibilidadEvidenciaId?: string;
  requisitoProcedibilidadNota?: string;
  fechasRelevantes: { id: string; fecha: string; concepto: string }[];
  actuaciones: {
    id: string;
    fecha: string; // YYYY-MM-DD
    resumen: string;
    evidenciaId?: string;
    actorNombre?: string;
  }[];
  resultado?: string;
  fechaResolucion?: string; // YYYY-MM-DD
  fechaUltimaActualizacion: string; // ISO
  notas?: string;
}

// ==========================================================================
// MÓDULO DE IMPORTES JURÍDICOS (intereses/gastos/costas) — NO AUTOMATIZADO
// ==========================================================================

export type NaturalezaConceptoJuridico =
  | 'INTERESES_MORA'
  | 'CLAUSULA_PENALIZACION'
  | 'GASTOS_RECLAMACION'
  | 'COSTAS_PROCESALES'
  | 'HONORARIOS_LETRADOS'
  | 'OTRO_CONFIGURABLE';

/**
 * Separación obligatoria (FASE 11): un concepto puede estar
 *  - NO_CONFIGURADO: sin parámetros definidos;
 *  - NO_CALCULABLE: requiere una fuente/verificación jurídica previa;
 *  - ESTIMADO: calculado con parámetros APORTADOS POR EL USUARIO (no es una
 *    liquidación definitivamente admisible);
 *  - VERIFICADO: admitido solo si hay fuente con norma + artículo + fecha consulta.
 * El ERP nunca presenta un importe jurídico como definitivo sin fuente.
 */
export type EstadoConceptoJuridico =
  | 'NO_CONFIGURADO'
  | 'NO_CALCULABLE'
  | 'ESTIMADO'
  | 'VERIFICADO'
  | 'BLOQUEADO';

export interface ParametrosIntereses {
  /** TNA en % (p. ej. 5). OBLIGATORIA y aportada por el usuario con su fuente. */
  tipoAnualPct?: number;
  /**
   * Base de cálculo admitida: SOLO_CAPITAL. Los demás valores se aceptan como
   * declaración del usuario pero la validación los rechaza (`anatocismo_no_admitido`):
   * el ERP no computa intereses sobre intereses ni sobre gastos sin verificación jurídica.
   */
  baseCalculo: 'SOLO_CAPITAL' | 'CON_GASTOS' | 'CON_INTERESES_PREVIOS';
  /** Día de inicio de la mora: requiere requerimiento fehaciente registrado. */
  inicioMoraRequiereRequerimiento: boolean;
  /** Fuente normativa citada (obligatoria para estado VERIFICADO). */
  fuente?: string;
  /** Fecha de consulta de la fuente (YYYY-MM-DD). */
  fechaConsultaFuente?: string;
  /** Ámbito de aplicación verificado. */
  ambitoAplicacion?: string;
  diasAnio: 365 | 360;
  redondeoDecimales: 2;
}

export interface ModuloImporteJuridico {
  /** `jur_{expedienteId}_{naturaleza}` — determinista. */
  id: string;
  expedienteId: string;
  naturaleza: NaturalezaConceptoJuridico;
  estado: EstadoConceptoJuridico;
  importe: number;
  /** Desglose: principal + intereses + gastos + otros conceptos. */
  principalBase: number;
  intereses: number;
  gastos: number;
  otros: number;
  /** Referencias a los tramos de deuda que generan el concepto. */
  piezaDeudaIds: string[];
  parametros?: ParametrosIntereses;
  /** Advertencia permanente: no es una liquidación judicial. */
  aviso: string;
  fechaCalculo?: string; // ISO
  motivoBloqueo?: string;
  actorId?: string;
  actorNombre?: string;
  actualizadoEn: string; // ISO
  notas?: string;
}

// ==========================================================================
// EXPEDIENTE DE MOROSIDAD (entidad raíz)
// ==========================================================================

export interface ExpedienteMorosidad {
  /**
   * `mor_{contratoSanitizado}_{hash12 de la firma de tramos}#{n}`.
   * Determinista e idempotente: la misma colección de cobros impagados produce el
   * mismo id; un episodio posterior con tramos distintos abre una ocurrencia nueva.
   */
  id: string;
  claveIdempotencia: string;
  /** Firma normalizada de los cobros incluidos (ordena y hash). */
  firmaTramos: string;
  ocurrencia: number;

  propietarioId: string;
  propietarioNombre?: string;
  inmuebleId: string;
  inmuebleDireccion?: string;
  contratoId: string;
  /** Referencia al contrato canónico (el contrato es la fuente, no se copia). */
  habitacionId?: string;
  inquilinoReferencia?: string;

  estado: EstadoExpediente;
  subestado?: string;
  versionEstado: number;

  // --- Deuda (referencias + importes congelados; la contabilidad vive en cobros) ---
  piezasDeuda: PiezaDeuda[];
  cobroIds: string[];
  importePrincipal: number;
  /** Solo si existe un concepto jurídico con fuente verificada. */
  importeInteresesReclamados: number;
  importeGastosReclamables: number;
  importeTotalReclamado: number;
  importeCubierto: number;
  saldoPendiente: number;

  // --- Detección / política ---
  fechaDeteccion: string; // ISO
  fechaUltimaVencimiento: string; // YYYY-MM-DD (tramo más antiguo: base del dunning)
  diasRetrasoActual: number;
  politicaId: string;
  versionPolitica: number;
  planRecobro: PasoPlanRecobro[];

  // --- Estado de comunicaciones (cache derivada; el registro es GAP1) ---
  comunicaciones: ComunicacionExpediente[];
  ultimaComunicacionId?: string;
  requerimientoFehacienteExiste: boolean;
  proximaAccionFecha?: string; // YYYY-MM-DD
  proximaAccionCodigo?: string;

  // --- Compromisos ---
  compromisoVigenteId?: string;

  // --- Evidencias (cache de las últimas; el append-only vive en actuaciones) ---
  ultimaEvidenciaFecha?: string;
  numEvidencias: number;

  // --- Aseguradora / jurídico ---
  aseguradora?: ExpedienteAseguradora;
  juridico?: ExpedienteJuridico;

  // --- Cierre / disputas ---
  enDisputa: boolean;
  motivoDisputa?: string;
  fechaCierre?: string; // ISO
  motivoCierre?: string;
  reabiertoDeExpedienteId?: string;

  // --- Tesorería / BLOQUE B (referencias, nunca importes duplicados) ---
  liquidacionIds?: string[];
  ordenPagoIds?: string[];

  // --- Metadatos ---
  origenCreacion: 'DETECTOR_AUTOMATICO' | 'APERTURA_MANUAL';
  creadoPor?: string;
  creadoPorId?: string;
  actualizadoPor?: string;
  actualizadoPorId?: string;
  creadoEn: string; // ISO
  actualizadoEn: string; // ISO
  /** Contador de histórico (la lista append-only vive en `expedientes_morosidad_hist`). */
  numHistorial: number;
  notas?: string;
}

// ==========================================================================
// VISTAS DERIVADAS (portal del propietario — mínimo privilegio)
// ==========================================================================

/**
 * Vista EXCLUSA de datos del inquilino y de estrategia de recobro (no expone
 * abogado, aseguradora, penalizaciones ni comunicaciones internas).
 * La regla de Firestore §35 exige que la lista de campos sea exactamente esta.
 */
export interface ResumenMorosidadPropietario {
  id: string; // = expedienteId
  expedienteId: string;
  propietarioId: string;
  inmuebleId: string;
  inmuebleDireccion?: string;
  contratoId: string;
  periodoDesde: string; // YYYY-MM
  periodoHasta: string; // YYYY-MM
  numPeriodosImpagados: number;
  importeTotalReclamado: number;
  importeCubierto: number;
  saldoPendiente: number;
  estadoVisible: EstadoVisiblePropietario;
  estadoEtiqueta: string;
  diasRetraso: number;
  ultimaActualizacion: string; // ISO
  fechaProximosPasos?: string; // YYYY-MM-DD
  /** Solo el último evento comunicativo apto para el propietario. */
  ultimoHechoResumen?: string;
  numHistorial: number;
  versionFuente: number;
}

export type EstadoVisiblePropietario =
  | 'DEUDA_ABIERTA'
  | 'EN_GESTION'
  | 'COMPROMISO_ACTIVO'
  | 'PAGO_PARCIAL'
  | 'EN_TRAMITE_EXTERNO'
  | 'SALDADA'
  | 'EN_REVISION';
