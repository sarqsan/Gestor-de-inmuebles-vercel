export type SectionType =
  | 'inicio'
  | 'inmuebles'
  | 'propietarios'
  | 'cobros'
  | 'gastos'
  | 'preseleccionados'
  | 'seguro_impago'
  | 'formalizacion'
  | 'solicitudes'
  | 'candidatos'
  | 'nuevo_candidato'
  | 'cuestionario'
  | 'analisis'
  | 'configuracion'
  | 'administracion'
  | 'mis_profesionales'
  | 'mis_contratos'
  | 'mis_servicios'
  | 'mis_zonas'
  | 'mis_asignaciones'
  | 'mi_perfil';

export type CandidateStatus =
  | 'nuevo'
  | 'pendiente_doc'
  | 'pendiente_analisis'
  | 'analizado'
  | 'preseleccionado'
  | 'visita_reservada'
  | 'seleccionado'
  | 'formalizado'
  | 'no_seleccionado';

export type SolicitudEstado =
  | 'NUEVA'
  | 'CONTACTADO'
  | 'CUESTIONARIO ENVIADO'
  | 'CUESTIONARIO COMPLETADO'
  | 'DOCUMENTACIÓN PENDIENTE'
  | 'DOCUMENTACIÓN COMPLETA'
  | 'EN ANÁLISIS'
  | 'REVISIÓN DEL PROPIETARIO'
  | 'SELECCIONADO'
  | 'NO SELECCIONADO'
  | 'CANCELADA';

export interface CotitularData {
  nombre: string;
  telefono?: string;
  email?: string;
  tipoEmpleo?: EmploymentType;
  empresa?: string;
  tipoContrato?: ContractType;
  antiguedadLaboral?: string;
  ingresosNetos?: number;
  otrosIngresos?: number;
  descripcionOtrosIngresos?: string;
}

export interface NotaPrivada {
  id: string;
  texto: string;
  fecha: string; // ej. "19/08/2026, 11:30"
  timestamp?: number;
  autor?: string; // "Propietario"
}

export interface SolicitudHistorialItem {
  id: string;
  fecha: string; // ISO or formatted date e.g. "08/08/2026, 14:30"
  accion: string;
  detalle?: string;
  estadoAnterior?: SolicitudEstado;
  estadoNuevo?: SolicitudEstado;
}

export interface SolicitudAlquiler {
  id: string;
  token: string; // token público p.ej. "sol-p1-8a9f"
  ownerId: string;
  inmuebleId: string;
  inmuebleNombre: string;
  inmueblePrecio: number;
  inmuebleCiudad?: string;
  inmuebleImagenUrl?: string;
  candidatoId: string;
  candidatoNombre: string;
  candidatoTelefono: string;
  candidatoEmail: string;
  numAdultos: number;
  numMenores: number;
  numTotalPersonas: number;
  fechaEntradaAproximada: string;
  duracionPrevista: string;
  tieneMascotas: boolean;
  detallesMascotas?: string;
  esFumador: boolean;
  situacionLaboral: EmploymentType;
  empresa?: string;
  puesto?: string;
  tipoContrato: ContractType;
  antiguedadLaboral: string;
  ingresosNetosMensuales: number;
  otrosIngresos?: number;
  descripcionOtrosIngresos?: string;
  tieneAvalista: boolean;
  numTitularesContrato?: 1 | 2;
  cotitular?: CotitularData;
  detallesAvalista?: {
    ingresosAproximados?: number;
    situacionLaboral?: string;
    tipoContrato?: string;
  };
  consentimientoAceptado: boolean;
  fechaConsentimiento: string;
  estado: SolicitudEstado;
  cuestionarioCompletado: boolean;
  cuestionarioData?: CuestionarioIncidenciasData;
  documentosCompletados: boolean;
  documentos: DocumentStatus[];
  documentosAnalizados?: DocumentoAnalizado[];
  historial: SolicitudHistorialItem[];
  fechaCreacion: string;
  fechaActualizacion: string;
  scoreSolvencia?: number;
  perfilOperativo?: number;
  analisisIa?: AnalisisIncidencias;
  observacionesOwner?: string;
  notasPropietario?: string;
  fechaUltimaActualizacion?: string;
}

export type EmploymentType =
  | 'cuenta_ajena'
  | 'autonomo'
  | 'funcionario'
  | 'pensionista'
  | 'estudiante_otro';

export type ContractType =
  | 'indefinido'
  | 'temporal'
  | 'practicas'
  | 'fijo_discontinuo'
  | 'no_aplica';

export type TipoDocumento =
  | 'nomina'
  | 'contrato'
  | 'vida_laboral'
  | 'renta'
  | 'dni_nie'
  | 'justificante_bancario'
  | 'otros_ingresos'
  | 'avalista'
  | 'otro';

export type EstadoAnalisisDoc =
  | 'pendiente'
  | 'analizando'
  | 'analizado'
  | 'error';

export interface ExtractedField {
  campo: string;
  label: string;
  valor: string | number | null;
  confirmado: boolean;
  editado?: boolean;
}

export interface DocumentoAnalizadoHistorialItem {
  fecha: string;
  accion: string;
  detalle?: string;
}

export interface ValoracionIADocumento {
  scoreSolvenciaSugerido: number; // 0-100
  nivelRiesgo: 'Bajo' | 'Medio' | 'Alto';
  explicacion: string;
  avisoLegal: string;
}

export interface DecisionPropietarioDocumento {
  estado: 'pendiente' | 'aprobado' | 'requiere_subsanacion' | 'descartado';
  notasPrivadas?: string;
  fechaDecision?: string;
  autor?: string;
}

export interface DocumentoAnalizado {
  id: string;
  candidatoId: string;
  nombreArchivo: string;
  mimeType: string;
  base64Data?: string;
  url?: string;
  tipoDocumento: TipoDocumento;
  tipoIdentificadoAI?: TipoDocumento;
  tipoIdentificadoNombre?: string;
  fechaSubida: string;
  estadoAnalisis: EstadoAnalisisDoc;
  mensajeError?: string;
  
  // BLOQUE 1: DATOS EXTRAÍDOS
  datosExtraidos?: Record<string, ExtractedField>;
  
  // BLOQUE 2: INFORMACIÓN DETECTADA
  informacionDetectada?: string;
  resumenAI?: string;
  
  // BLOQUE 3: INCIDENCIAS Y ALERTAS
  incidencias?: string[];
  coherenciaWarnings?: string[];
  
  // BLOQUE 4: VALORACIÓN DE IA
  valoracionIA?: ValoracionIADocumento;
  
  // BLOQUE 5: DECISIÓN DEL PROPIETARIO
  decisionPropietario?: DecisionPropietarioDocumento;
  
  // TRAZABILIDAD Y AUDITORÍA
  historialCambios?: DocumentoAnalizadoHistorialItem[];
  confirmadoUsuario?: boolean;
}

export interface DocumentStatus {
  id: string;
  nombre: string; // ej. DNI, Nómina 1, Nómina 2, Declaración Renta, Vida Laboral
  subido: boolean;
  valido?: boolean;
  fechaSubida?: string;
  documentoAnalizadoId?: string;
}

export interface ElementoCoherencia {
  campo: string;
  manual: string;
  documental: string;
  diferencia: string;
  accionRecomendada: string;
}

export interface InformeInteligente {
  id: string;
  candidatoId: string;
  versionNum: number;
  fechaGeneracion: string; // ej. "08/08/2026, 14:30"
  timestamp: number;
  resumenExplicativo: string;
  capacidadPago: {
    alquiler: number;
    ingresosNetosMedios: number;
    ratioEsfuerzo: number;
    valoracion: 'Favorable' | 'Aceptable' | 'Elevado' | 'Crítico';
    explicacion: string;
  };
  estabilidadLaboral: {
    empresa: string;
    tipoContrato: string;
    antiguedad: string;
    tipoEmpleoNombre: string;
    valoracion: string;
    explicacion: string;
  };
  documentacion: {
    recibidos: number;
    totalesEsperados: number;
    analizados: number;
    pendientesCount: number;
    pendientesLista: string[];
  };
  coherenciaDatos: {
    tieneDiferencias: boolean;
    diferencias: ElementoCoherencia[];
  };
  aspectosFavorables: string[];
  aspectosARevisar: string[];
  informacionFaltante: string[];
  valoracionGeneral: 'Favorable' | 'Requiere revisión' | 'Información insuficiente';
  scoreSolvencia: number;
  explicacionScore: string;
  calidadInformacion: 'Alta' | 'Media' | 'Baja';
  explicacionCalidad: string;
}

export interface SituacionDestacada {
  titulo: string;
  respuesta: string;
  valoracionTexto: string;
  nivelValoracion: 'adecuada' | 'revisar' | 'imprudente';
}

export interface ExplicacionDimensionCalculo {
  preguntaId: string;
  preguntaTitulo: string;
  respuestaDada: string;
  impacto: string;
}

export interface AnalisisIncidencias {
  analizado: boolean;
  fechaAnalisis: string;
  timestamp: number;
  scores: {
    iniciativa: number;
    prudencia: number;
    comunicacion: number;
    gestionIncidencias: number;
    perfilOperativo: number;
  };
  explicacionResumen: string;
  aspectosFavorables: string[];
  aspectosARevisar: string[];
  situacionesDestacadas: SituacionDestacada[];
  nivelConfianza: 'Alta' | 'Media' | 'Baja';
  explicacionConfianza: string;
  resultadoFinal: 'Adecuado' | 'Requiere atención' | 'Se observan varias conductas que conviene revisar';
  resultadoFinalNivel: 'adecuado' | 'requiere_atencion' | 'revisar';
  desgloseCalculo: ExplicacionDimensionCalculo[];
}

export interface RespuestaIncidencia {
  preguntaId: string; // 'sit_1', 'sit_2', ..., 'sit_12'
  preguntaTitulo: string; // 'SITUACIÓN 1 — SE VA LA LUZ'
  preguntaTexto: string;
  opcionSeleccionadaId?: 'A' | 'B' | 'C' | 'D';
  opcionSeleccionadaTexto?: string;
  respuestaTextoLibre?: string;
  esAbierta?: boolean;
}

export interface CuestionarioIncidenciasData {
  completado: boolean;
  fechaCompletado?: string; // ISO String
  numRespuestas: number;
  totalPreguntas: number; // 12
  respuestas: RespuestaIncidencia[];
  informacionAdicional?: string; // Section 4
  analisisIa?: AnalisisIncidencias;
}

export interface Candidato {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  inmuebleId: string;
  inmuebleNombre: string;
  numPersonas: number;
  ingresosNetos: number; // en euros mensuales
  tipoEmpleo: EmploymentType;
  tipoContrato: ContractType;
  antiguedadLaboral: string; // ej. "2 años y 4 meses"
  otrosIngresos: number; // euros mensuales
  descripcionOtrosIngresos?: string;
  avalista: boolean;
  observaciones: string;
  estado: CandidateStatus;
  fechaCreacion: string; // YYYY-MM-DD
  documentos: DocumentStatus[];
  documentosAnalizados?: DocumentoAnalizado[];
  informesHistorico?: InformeInteligente[];
  ultimoInforme?: InformeInteligente;
  cuestionarioToken?: string; // Token único seguro para el enlace público e.g. "q-a8f3d1"
  cuestionarioIncidencias?: CuestionarioIncidenciasData;
  // Campos para 1 o 2 titulares y notas privadas del propietario
  numTitularesContrato?: 1 | 2;
  cotitular?: CotitularData;
  notasPrivadas?: NotaPrivada[];
  estadoDocumentacion?: 'sin_solicitar' | 'solicitada' | 'parcial' | 'completa';
  // Campos preparados para puntuación / IA posterior
  scoreEstimado?: number; // 0 - 100
  ratioSolvencia?: number; // % sobre el alquiler del inmueble
}

export interface InmuebleImage {
  id: string;
  storagePath: string;
  downloadURL: string;
  order: number;
  isCover: boolean;
  isPublic: boolean;
  createdAt: string;
  nombreOriginal?: string;
  tamañoBytes?: number;
}

export type TipoPropietario = 'persona_fisica' | 'persona_juridica' | 'comunidad_bienes';

export interface CuentaBancariaPropietario {
  id: string;
  alias: string; // ej. "Cuenta BBVA Principal", "Santander Cobro Alquiler"
  iban: string;
  banco?: string;
  titular?: string;
  swiftBic?: string;
  esPrincipal?: boolean;
}

export interface Propietario {
  id: string;
  nombre: string; // Nombre y apellidos o Razón Social
  nifCif: string; // NIF / CIF / NIE
  tipoPropietario: TipoPropietario;
  telefono: string;
  email: string;
  
  // Domicilio a efectos de notificaciones y fiscal
  direccion: string; // Calle, número, piso
  ciudad: string;
  codigoPostal: string;
  provincia?: string;

  // Representante Legal (si es persona jurídica o apoderado)
  tieneRepresentanteLegal?: boolean;
  nombreRepresentante?: string;
  nifRepresentante?: string;
  cargoRepresentante?: string; // ej. "Administrador Único", "Apoderado"
  tituloRepresentacion?: string; // ej. "Escritura de poder notarial nº 1.234 ante el notario D. ..."

  // Cuentas Bancarias asociadas (1 o varias)
  cuentasBancarias: CuentaBancariaPropietario[];

  // Notas u observaciones privadas
  notasPrivadas?: string;
  
  // Metadatos
  fechaCreacion: string;
  fechaActualizacion: string;
}

export interface PropietarioFiscal {
  nombre: string;
  nifDni: string;
  direccion: string;
  telefono?: string;
  email?: string;
  esPersonaJuridica?: boolean;
  propietarioId?: string; // Referencia opcional al Propietario registrado
}

export interface DatosFiscalesInmueble {
  referenciaCatastral?: string;
  codigoPostal?: string;
  ibanCobro?: string;
  certificadoEnergetico?: string;
  numeroRegistroPropiedad?: string;
  propietarioPrincipal: PropietarioFiscal;
  tieneSegundoPropietario?: boolean;
  segundoPropietario?: PropietarioFiscal;
}

export interface Inmueble {
  id: string;
  tokenSolicitud?: string; // Token público de solicitud p.ej. "sol-prop-1"
  direccion: string; // Nombre o dirección identificativa
  ciudad: string;
  precio: number; // Euros al mes
  estado: 'disponible' | 'alquilado';
  habitaciones: number;
  banos: number;
  superficie: number; // m2
  descripcion?: string;
  imagenUrl?: string;
  images?: InmuebleImage[];
  imagenIa?: boolean;
  candidatosCount: number;
  fianzaMeses: number;
  referenciaCatastral?: string;
  codigoPostal?: string;
  // Vinculación con Propietarios y Cuentas Bancarias
  propietarioId?: string; // ID permanente del Propietario titular vinculado
  propietarioPrincipalId?: string;
  propietarioSecundarioId?: string;
  cuentaBancariaCobroId?: string;
  ibanCobro?: string;
  datosFiscales?: DatosFiscalesInmueble;

  // Modalidad y características del inmueble (entidad física permanente)
  modalidadAlquiler?: 'completo' | 'habitaciones';
  tipoInmueble?: 'piso' | 'casa' | 'chalet' | 'estudio' | 'atico' | 'duplex' | 'habitacion' | 'local';

  // Estado de arrendamiento actual
  inquilinoActualId?: string;
  inquilinoActualNombre?: string;
  contratoActivoId?: string;

  // Preparación patrimonial y financiera (base para siguientes fases)
  valorAdquisicion?: number;
  valoracionEstimada?: number;
  rentabilidadEstimada?: number;
  fechaAdquisicion?: string;
  notasInternas?: string;
}

export interface UserProfile {
  nombre: string;
  email: string;
  telefono: string;
  empresa?: string;
  notificacionesEmail: boolean;
  ratioSolvenciaMaximo: number; // % recomendado (ej. 35%)
}

export type InvitationStatus =
  | 'PENDIENTE DE ENVIAR'
  | 'ENLACE GENERADO'
  | 'ENVIADO'
  | 'ABIERTO'
  | 'HORARIO RESERVADO'
  | 'CANCELADO'
  | 'EXPIRADO';

export interface VisitSlot {
  id: string; // e.g. "slot-inm-1-1"
  inmuebleId: string;
  fecha: string; // YYYY-MM-DD
  horaInicio: string; // e.g. "10:15"
  horaFin: string; // e.g. "10:45"
  disponible: boolean;
  bloqueadoPorPropietario?: boolean;
  reservaCandidateId?: string;
  reservaCandidateNombre?: string;
  reservaInvitationId?: string;
}

export interface InvitacionVisita {
  id: string;
  token: string; // Unique token e.g. "vst-a9f8e7d6"
  candidateId: string;
  candidateNombre: string;
  candidateTelefono: string;
  candidateEmail?: string;
  inmuebleId: string;
  inmuebleNombre: string;
  inmueblePrecio: number;
  inmuebleCiudad?: string;
  solicitudEstado?: string;
  cuestionarioCompletado?: boolean;
  scoreSolvencia?: number;
  perfilOperativo?: number;
  status: InvitationStatus;
  fechaPreseleccion: string; // YYYY-MM-DD
  createdAt: string; // ISO string
  sentAt?: string; // ISO string
  openedAt?: string; // ISO string
  bookedAt?: string; // ISO string
  canceledAt?: string; // ISO string
  
  reserva?: {
    slotId: string;
    fecha: string;
    horaInicio: string;
    horaFin: string;
    direccionCompleta: string; // Full address visible ONLY after booking
    notasCandidato?: string;
  };
}

export type SolicitudDocEstado =
  | 'BORRADOR'
  | 'SOLICITADA'
  | 'PARCIALMENTE_APORTADA'
  | 'COMPLETADA'
  | 'REVISION_SOLICITADA'
  | 'APROBADA'
  | 'RECHAZADA';

export type DocItemEstado = 'pendiente' | 'subido' | 'requiere_correccion' | 'validado';

export interface ArchivoAportado {
  id: string;
  nombreArchivo: string;
  mimeType: string;
  url?: string;
  base64Data?: string;
  storagePath?: string;
  tamañoBytes?: number;
  fechaSubida: string;
}

export interface ItemDocumentoSolicitado {
  id: string;
  tipo: TipoDocumento;
  nombre: string;
  descripcion?: string;
  obligatorio: boolean;
  titular?: 'titular_1' | 'titular_2' | 'avalista' | 'general';
  estado: DocItemEstado;
  motivoCorreccion?: string;
  archivos: ArchivoAportado[];
  fechaSubida?: string;
  fechaValidacion?: string;
}

export interface SolicitudDocHistorialItem {
  id: string;
  fecha: string;
  autor: 'propietario' | 'candidato';
  accion: string;
  detalle?: string;
}

export interface SolicitudDocumentacion {
  id: string;
  token: string; // token privado e.g. "doc-8a7f9b2"
  candidatoId: string;
  candidatoNombre: string;
  candidatoTelefono: string;
  candidatoEmail?: string;
  inmuebleId: string;
  inmuebleNombre: string;
  inmuebleDireccion?: string;
  inmuebleCiudad?: string;
  visitaId?: string; // ID de la invitación o slot de visita
  fechaVisita?: string; // e.g. "25/08/2026 11:30"
  ownerId?: string;
  estado: SolicitudDocEstado;
  mensajePropietario?: string;
  documentos: ItemDocumentoSolicitado[];
  fechaCreacion: string;
  fechaSolicitud?: string;
  fechaEnvioCandidato?: string;
  historial: SolicitudDocHistorialItem[];
  notasPropietario?: string;
}

export interface SolicitudDocPublicData {
  id?: string;
  token: string;
  candidatoNombre: string;
  candidatoTelefono: string;
  inmuebleNombre: string;
  inmuebleDireccion?: string;
  inmuebleCiudad?: string;
  fechaVisita?: string;
  estado: SolicitudDocEstado;
  mensajePropietario?: string;
  documentos: ItemDocumentoSolicitado[];
  fechaCreacion?: string;
  fechaSolicitud?: string;
  fechaEnvioCandidato?: string;
}

// ==========================================
// FASE 3: FORMALIZACIÓN, CONTRATO LAU & SEGURO DE IMPAGO
// ==========================================

export type EstadoFormalizacion =
  | 'EN_ESTUDIO'
  | 'ADJUDICADO'
  | 'BORRADOR_CONTRATO'
  | 'ENVIADO_FIRMA'
  | 'FIRMADO'
  | 'FIANZA_DEPOSITADA'
  | 'FORMALIZADO_ACTIVO'
  | 'FINALIZADO'
  | 'CANCELADO';

export type DictamenAsegurabilidad =
  | 'APTO_RECOMENDADO'
  | 'APTO_CON_CONDICIONES'
  | 'RIESGO_ELEVADO';

export interface EvaluacionAsegurabilidad {
  dictamen: DictamenAsegurabilidad;
  scoreSolvencia: number;
  ratioEsfuerzo: number;
  ingresosNetosMensuales: number;
  rentaMensual: number;
  ingresosSobrantes: number;
  antiguedadSuficiente: boolean;
  documentosValidadosCount: number;
  documentosObligatoriosCompletos: boolean;
  puntosPositivos: string[];
  factoresRiesgo: string[];
  recomendaciones: string[];
  primaEstimadaAnual: number; // e.g. ~4% de la renta anual
  primaEstimadaMensual: number;
  coberturasSugeridas: {
    mesesImpago: number; // 6, 12 o 18 meses
    defensaJuridicaImporte: number; // 3.000 €
    actosVandalicosImporte: number; // 3.000 €
  };
}

export interface ActaEntregaLlaves {
  fechaEntrega: string; // YYYY-MM-DD
  horaEntrega?: string; // HH:MM
  contadorElectricidadKwh?: string;
  contadorAguaM3?: string;
  contadorGasM3?: string;
  juegosLlavesVivienda: number;
  juegosLlavesPortal: number;
  juegosLlavesBuzon: number;
  juegosLlavesGarajeTrastero: number;
  estadoPintura?: 'nuevo' | 'bueno' | 'con_marcas_leves' | 'requiere_repaso';
  estadoLimpieza?: 'optimo' | 'correcto' | 'requiere_limpieza';
  electrodomesticosRevisados?: boolean;
  inventarioAdjunto?: boolean;
  observacionesEstado?: string;
  firmadaPorAmbasPartes?: boolean;
  fechaFirma?: string;
}

export interface HistorialFormalizacionItem {
  id: string;
  fecha: string; // Formato legible o ISO
  autor: 'propietario' | 'arrendatario' | 'sistema';
  accion: string;
  detalle?: string;
}

export interface ClausulaPersonalizada {
  id: string;
  titulo: string;
  contenido: string;
  activa: boolean;
  categoria?: 'general' | 'fianza' | 'suministros' | 'mascotas' | 'obras' | 'inventario' | 'penalizaciones';
  generadaPorIa?: boolean;
  analisisLegal?: string;
  validezLegal?: boolean;
}

export interface ContratoFormalizacion {
  id: string;
  token?: string; // Enlace privado si se comparte
  candidatoId: string;
  inmuebleId: string;
  propietarioId?: string; // ID directo del Propietario arrendador asociado
  solicitudDocId?: string; // Vinculación opcional con solicitud de doc
  
  // Datos del Inmueble
  inmuebleNombre: string;
  inmuebleDireccion: string;
  inmuebleCiudad: string;
  inmuebleCodigoPostal?: string;
  inmuebleReferenciaCatastral?: string;
  inmuebleSuperficieM2?: number;
  inmuebleHabitaciones?: number;
  inmuebleCertificadoEnergetico?: string; // Ej: "Calificación C (Consumo 85 kWh/m2)"

  // Datos del Arrendador (Propietario Principal)
  propietarioNombre: string;
  propietarioDni: string;
  propietarioDireccion: string;
  propietarioTelefono: string;
  propietarioEmail: string;
  propietarioIban: string;
  propietarioEsPersonaJuridica?: boolean;

  // Segundo Propietario / Copropietario (si aplica)
  tieneSegundoPropietario?: boolean;
  segundoPropietarioNombre?: string;
  segundoPropietarioDni?: string;
  segundoPropietarioDireccion?: string;
  segundoPropietarioTelefono?: string;
  segundoPropietarioEmail?: string;
  segundoPropietarioEsPersonaJuridica?: boolean;

  // Datos del Arrendatario (Candidato Principal)
  candidatoNombre: string;
  candidatoDni: string;
  candidatoTelefono: string;
  candidatoEmail: string;
  candidatoDireccionActual?: string;

  // Cotitular (si aplica)
  tieneCotitular?: boolean;
  cotitularNombre?: string;
  cotitularDni?: string;
  cotitularTelefono?: string;
  cotitularEmail?: string;

  // Avalista (si aplica)
  tieneAvalista?: boolean;
  avalistaNombre?: string;
  avalistaDni?: string;
  avalistaDireccion?: string;
  avalistaTelefono?: string;

  // Condiciones Económicas y Temporales
  rentaMensual: number;
  fianzaLegalMeses: number; // Por defecto 1 (Art. 36.1 LAU)
  fianzaLegalImporte: number;
  garantiaAdicionalMeses: number; // Máximo 2 según LAU
  garantiaAdicionalImporte: number;
  fechaInicioContrato: string; // YYYY-MM-DD
  fechaFinContrato?: string; // YYYY-MM-DD (fecha de finalización, extinción o salida del inquilino)
  esVigente?: boolean; // Indica si es el contrato actualmente activo/en vigor para el inmueble
  modalidadAlquiler?: 'completo' | 'habitaciones';
  habitacionIdentificador?: string;
  duracionAnios: number; // 1 año prorrogable
  diaLimitePagoMes: number; // 1 al 5
  
  // Cláusulas de Configuración
  permitirMascotas: boolean;
  clausulaMascotasDetalle?: string;
  permitirSubarriendo: boolean; // Por defecto false
  incluyeMueblesInventario: boolean;
  inventarioDetalle?: string;
  gastosComunidadCargo: 'arrendador' | 'arrendatario';
  ibiCargo: 'arrendador' | 'arrendatario';
  suministrosCargo: 'arrendatario' | 'arrendador';
  clausulaDesistimientoAnticipado: boolean; // Indemnización de 1 mes por año restante tras 6 meses
  
  // Cláusulas adicionales editables
  clausulasPersonalizadas: ClausulaPersonalizada[];

  // Estado del Expediente
  estado: EstadoFormalizacion;
  
  // Evaluación y Scoring de Seguro de Impago
  evaluacionAsegurabilidad: EvaluacionAsegurabilidad;

  // Checklist y Acta de Entrega de Llaves
  actaEntregaLlaves: ActaEntregaLlaves;

  // Firmas
  firmaArrendador: {
    firmado: boolean;
    fecha?: string;
    firmanteNombre?: string;
  };
  firmaArrendatario: {
    firmado: boolean;
    fecha?: string;
    firmanteNombre?: string;
  };

  // Metadatos
  fechaCreacion: string;
  fechaActualizacion: string;
  historial: HistorialFormalizacionItem[];
  notasPrivadas?: string;

  // GESTIÓN DE COBROS MENSUALES (INMUEBLE → PROPIETARIO → CONTRATO → INQUILINO)
  registroCobros?: CobroPeriodo[];
}

// ==========================================
// GESTIÓN DE COBROS DE ALQUILER & JUSTIFICANTES
// ==========================================

export type EstadoCobroAlquiler =
  | 'PENDIENTE'
  | 'RECIBIDO'
  | 'VERIFICADO'
  | 'RETRASADO'
  | 'INCIDENCIA';

export interface JustificanteCobro {
  id: string;
  nombreArchivo: string;
  url?: string;
  storagePath?: string;
  tipoMime?: string;
  tamanoBytes?: number;
  fechaSubida: string;
  subidoPor?: string;
  notas?: string;
}

export interface HistorialCobroItem {
  id: string;
  fecha: string;
  usuarioId?: string;
  usuarioNombre?: string;
  accion: string;
  detalles?: string;
  estadoAnterior?: EstadoCobroAlquiler;
  estadoNuevo?: EstadoCobroAlquiler;
  importeAnterior?: number;
  importeNuevo?: number;
}

export interface CobroPeriodo {
  id: string; // "cobro_{contratoId}_{anio}_{mes}"
  inmuebleId: string;
  contratoId: string;
  inquilinoId: string;
  propietarioId: string;

  // Desnormalización informativa para listados ágiles y offline
  inmuebleDireccion?: string;
  inmuebleCiudad?: string;
  inquilinoNombre?: string;
  inquilinoDni?: string;
  inquilinoTelefono?: string;
  inquilinoEmail?: string;
  propietarioNombre?: string;

  // Periodo temporal
  mes: number; // 1 - 12
  anio: number; // Ej. 2026
  periodoMesAnio: string; // Ej. "2026-01"
  nombreMes: string; // Ej. "Enero 2026"

  // Importes y Vencimientos
  importePrevisto: number; // Obtenido del contrato vigente en su momento
  importeRecibido: number; // Importe realmente cobrado (0 si no pagado)
  fechaVencimiento: string; // YYYY-MM-DD según día límite del contrato
  fechaPago?: string; // YYYY-MM-DD cuando se recibe el pago

  // Estado
  estado: EstadoCobroAlquiler;

  // Justificante documental (por referencia, sin base64 en BD)
  justificante?: JustificanteCobro;

  // Observaciones e incidencias
  observaciones?: string;
  motivoIncidencia?: string;
  metodoPago?: 'transferencia' | 'domiciliacion' | 'bizum' | 'efectivo' | 'otro';
  referenciaBancaria?: string;

  // Trazabilidad y auditoría
  registradoPor?: string;
  registradoPorId?: string;
  fechaRegistro?: string;
  ultimaModificacion?: string;
  historialCambios: HistorialCobroItem[];
}

// ==========================================
// FASE 2: GASTOS — EXPLOTACIÓN vs FINANCIACIÓN
// ==========================================

/**
 * Naturaleza contable del gasto (clave de la Fase 2):
 * - EXPLOTACION: costes de mantener y alquilar la vivienda (comunidad, IBI,
 *   seguros, reparaciones, comisiones...). Computan al RESULTADO OPERATIVO del
 *   alquiler y, en su mayoría, son fiscalmente deducibles.
 * - FINANCIACION: cuotas de financiación ajena (hipoteca). Son una SALIDA DE
 *   CAJA del propietario, pero NO un gasto operativo del inmueble: la parte de
 *   capital es amortización de deuda (no es gasto); sólo los intereses serían
 *   gasto financiero. Por eso se registran aparte y nunca se mezclan con los
 *   gastos de explotación en los cuadres de rentabilidad.
 */
export type TipoGasto = 'EXPLOTACION' | 'FINANCIACION';

export type CategoriaGasto =
  // --- Explotación ---
  | 'COMUNIDAD'
  | 'IBI'
  | 'SEGURO_HOGAR'
  | 'SUMINISTROS'
  | 'MANTENIMIENTO'
  | 'REPARACION'
  | 'ADMINISTRACION'
  | 'LIMPIEZA'
  | 'OTRO_EXPLOTACION'
  // --- Financiación ---
  | 'CUOTA_HIPOTECARIA'
  | 'INTERESES_PRESTAMO'
  | 'OTRO_FINANCIACION';

export type EstadoGasto = 'PENDIENTE' | 'PAGADO' | 'ANULADO';

export interface Gasto {
  id: string; // "gas_{inmuebleId}_{timestamp}"
  inmuebleId: string;
  propietarioId: string; // Clave de aislamiento por propietario (igual que contratos)
  contratoId?: string; // Opcional: vinculación a un contrato/período

  tipo: TipoGasto;
  categoria: CategoriaGasto;
  concepto: string;
  proveedor?: string;

  importe: number; // Importe total del gasto (EUR)
  estado: EstadoGasto;

  // Fechas y período (para agrupación mensual/anual)
  fechaDevengo?: string; // YYYY-MM-DD (fecha de la factura / período)
  fechaPago?: string; // YYYY-MM-DD (cuando se abona)
  periodoMesAnio?: string; // YYYY-MM

  // ¿Quién soporta económicamente el coste según el contrato?
  aCargoDe: 'arrendador' | 'arrendatario';
  deducible?: boolean; // Deducible en IRPF del alquiler (gastos de explotación)

  // Desglose financiero (solo FINANCIACION / hipoteca)
  capitalAmortizado?: number; // Parte de la cuota que amortiza deuda (no es gasto)
  intereses?: number; // Parte de intereses (gasto financiero)

  metodoPago?: 'transferencia' | 'domiciliacion' | 'bizum' | 'efectivo' | 'otro';
  justificanteUrl?: string;
  justificantePath?: string;
  notas?: string;

  // Trazabilidad
  creadoPor?: string;
  creadoPorId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Frecuencia de un gasto recurrente (plantilla que genera apuntes `Gasto`).
 */
export type FrecuenciaRecurrente = 'MENSUAL' | 'TRIMESTRAL' | 'ANUAL';

/**
 * Plantilla de gasto periódico (comunidad mensual, IBI anual, cuota hipotecaria
 * mensual…). No es un gasto en sí: el sistema materializa documentos `Gasto`
 * en estado PENDIENTE a partir de ella. Los apuntes ya generados nunca se
 * borran al desactivar/eliminar la plantilla (se conserva el histórico).
 */
export interface GastoRecurrente {
  id: string; // "rec_{inmuebleId}_{ts}"
  inmuebleId: string;
  propietarioId: string; // Clave de aislamiento por propietario

  tipo: TipoGasto;
  categoria: CategoriaGasto;
  concepto: string;
  proveedor?: string;
  importe: number;

  frecuencia: FrecuenciaRecurrente;
  diaVencimiento: number; // Día del mes (1-28) de devengo de cada apunte
  fechaInicio: string; // YYYY-MM (primer período)
  fechaFin?: string; // YYYY-MM opcional (último período)

  aCargoDe: 'arrendador' | 'arrendatario';
  deducible?: boolean;
  metodoPago?: Gasto['metodoPago'];
  notas?: string;

  activo: boolean;
  ultimoPeriodoGenerado?: string; // YYYY-MM (cursór de materialización)

  creadoPor?: string;
  creadoPorId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * FASE 2.3 — Préstamo / financiación ajena (normalmente hipoteca). Describe las
 * condiciones para calcular el cuadro de amortización (sistema francés de cuota
 * constante) y así separar automáticamente capital e intereses en cada cuota.
 * Al crearse se enlaza con una plantilla `GastoRecurrente` que materializa los
 * recibos; este documento sólo guarda las condiciones financieras.
 */
export type TipoPrestamo = 'HIPOTECARIO' | 'PERSONAL';

/**
 * FASE 2.4 — Modalidad de la amortización anticipada:
 * - REDUCE_CUOTA: se mantiene el plazo y baja el importe mensual.
 * - REDUCE_PLAZO: se mantiene la cuota y el préstamo vence antes.
 */
export type ModalidadAmortizacion = 'REDUCE_CUOTA' | 'REDUCE_PLAZO';

/** Amortización anticipada (cancelación parcial de principal) en un mes dado. */
export interface AmortizacionAnticipada {
  id: string;
  periodo: string; // YYYY-MM en el que se aplica (al inicio del recibo)
  importe: number;
  modalidad: ModalidadAmortizacion;
}

/**
 * Tramo de tipo de interés variable (p. ej. revisión anual del Euribor): a
 * partir de `fechaInicio` pasa a aplicarse `tasaInteresAnual`. El primer tipo
 * es el `tasaInteresAnual` del propio préstamo.
 */
export interface TramoTipoInteres {
  id: string;
  fechaInicio: string; // YYYY-MM desde el que rige este TIN
  tasaInteresAnual: number;
}

/**
 * FASE 2.4 — Tipo de carencia inicial:
 * - TOTAL: no se paga nada durante la carencia; los intereses se capitalizan
 *   (se añaden al saldo vivo).
 * - PARCIAL: sólo se pagan intereses; no se amortiza capital.
 */
export type TipoCarencia = 'TOTAL' | 'PARCIAL';

export interface Prestamo {
  id: string; // "prest_{inmuebleId}_{ts}"
  inmuebleId: string;
  propietarioId: string; // Clave de aislamiento por propietario

  tipo: TipoPrestamo;
  descripcion?: string;
  entidad?: string; // Banco / acreedor

  capitalInicial: number; // Principal prestado (EUR)
  tasaInteresAnual: number; // TIN inicial en porcentaje (p.ej. 3,25 para el 3,25%)
  plazoMeses: number;
  fechaInicio: string; // YYYY-MM (primera cuota)
  diaVencimiento: number; // Día de cargo (1-28)

  // FASE 2.4 — flexibilidad financiera
  carenciaMeses?: number; // Meses iniciales de carencia (0 por defecto)
  tipoCarencia?: TipoCarencia; // 'TOTAL' | 'PARCIAL'
  tramosTipo?: TramoTipoInteres[]; // Revisiones de tipo (variable)
  amortizaciones?: AmortizacionAnticipada[]; // Amortizaciones anticipadas

  gastoRecurrenteId?: string; // Plantilla vinculada que genera los recibos
  activo: boolean;
  notas?: string;

  creadoPor?: string;
  creadoPorId?: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// FASE 4: ASEGURADORA DE IMPAGO & EXPEDIENTES
// ==========================================

export type DictamenAseguradora =
  | 'FAVORABLE'
  | 'FAVORABLE_CONDICIONADO'
  | 'DESFAVORABLE'
  | 'DOCUMENTACION_REQUERIDA'
  | 'EN_ESTUDIO';

export type SolicitudSeguroEstado =
  | 'BORRADOR'
  | 'CORREO_ENVIADO'
  | 'SOLICITUD_PENDIENTE'
  | 'RESPUESTA_RECIBIDA'
  | 'RESPUESTA_PROCESADA'
  | 'ERROR_PROCESAMIENTO'
  | 'CANCELADA';

export type DecisionFinalPropietarioSeguro =
  | 'PENDIENTE'
  | 'ACEPTAR_CANDIDATO'
  | 'SOLICITAR_AVAL_EXTRA'
  | 'RECHAZAR_CANDIDATO'
  | 'TRAMITAR_OTRA_ASEGURADORA';

export interface ConfiguracionAseguradora {
  id: string; // e.g. "arag", "caser", "mutua_propietarios", "das", "finaer", "personalizada"
  nombre: string;
  nombreComercial: string;
  emailTramitacion: string;
  activa: boolean;
  ratioEsfuerzoMaximo: number; // e.g. 40 o 35 (%)
  antiguedadMinimaMeses: number; // e.g. 12 meses o 6 meses
  documentosRequeridos: TipoDocumento[];
  tasaPrimaAnualPorcentaje: number; // e.g. 4.5 (%)
  mesesCoberturaImpago: number; // e.g. 12
  tiempoMedioRespuestaHoras: number; // e.g. 24
  coberturasSugeridas: {
    mesesImpago: number;
    defensaJuridicaEuros: number;
    actosVandalicosEuros: number;
  };
  instruccionesEnvio?: string;
  formatoAsuntoEmail?: string;
}

export interface DocumentoAdjuntoSeguro {
  id: string;
  nombre: string;
  tipo: TipoDocumento;
  verificado: boolean;
  url?: string;
  base64Data?: string;
  storagePath?: string;
  tamanoBytes?: number;
}

export interface TitularExpedienteSeguro {
  nombre: string;
  dniNie?: string;
  telefono?: string;
  email?: string;
  tipoEmpleo: EmploymentType | string;
  empresa?: string;
  tipoContrato: ContractType | string;
  antiguedadLaboral: string;
  ingresosNetosMensuales: number;
  otrosIngresosMensuales?: number;
}

export interface AvalistaExpedienteSeguro {
  nombre: string;
  dniNie?: string;
  telefono?: string;
  email?: string;
  relacion?: string;
  tipoEmpleo?: string;
  ingresosNetosMensuales?: number;
}

export interface HistorialSeguroImpagoItem {
  id: string;
  fecha: string;
  autor: 'propietario' | 'aseguradora' | 'sistema_ia' | 'gmail';
  accion: string;
  detalle?: string;
}

export interface SolicitudSeguroImpago {
  id: string;
  referenciaUnica: string; // e.g. "REF-IMPAGO-2026-0819-A8F"
  candidatoId: string;
  inmuebleId: string;
  inmuebleNombre: string;
  inmuebleDireccion: string;
  inmuebleCiudad: string;
  rentaMensual: number;
  
  // NÚMERO DE ORDEN DE CANDIDATO PARA EL INMUEBLE (e.g. 1 para "Candidato 1", 2 para "Candidato 2")
  numeroCandidatoInmueble?: number;
  
  // ASEGURADORA DESTINO
  aseguradoraId: string;
  aseguradoraNombre: string;
  aseguradoraEmail: string;
  
  // BLOQUE 1: DATOS DEL CANDIDATO (1 o 2 titulares + avalista)
  numTitulares: 1 | 2;
  titular1: TitularExpedienteSeguro;
  titular2?: TitularExpedienteSeguro;
  tieneAvalista: boolean;
  avalista?: AvalistaExpedienteSeguro;
  ingresosTotalesConjuntos: number;
  ratioEsfuerzoCalculado: number; // % sobre renta mensual
  
  // BLOQUE 2: DOCUMENTACIÓN APORTADA Y VERIFICADA
  documentosAdjuntos: DocumentoAdjuntoSeguro[];
  documentacionCompletaSegunAseguradora: boolean;
  
  // BLOQUE 3: ANÁLISIS IA PREVIO
  resumenSolvenciaIA: string;
  scoreSolvenciaIA: number;
  alertasDetectadasIA: string[];
  nivelRiesgoIA: 'Bajo' | 'Medio' | 'Alto';
  
  // BLOQUE 4: SOLICITUD A ASEGURADORA (ESTADO Y COMUNICACIÓN)
  estado: SolicitudSeguroEstado;
  metodoEnvio: 'GMAIL_API' | 'GMAIL_WEB' | 'MANUAL';
  emailAsunto?: string;
  emailCuerpo?: string;
  fechaEnvio?: string;
  
  // BLOQUE 5: RESPUESTA DE ASEGURADORA
  fechaRecepcionRespuesta?: string;
  dictamenAseguradora: DictamenAseguradora;
  importeMaximoAsegurable?: number;
  primaAnualCalculada?: number;
  condicionesEstipuladas?: string[];
  documentosSolicitadosExtra?: string[];
  comentariosAseguradora?: string;
  emailRespuestaRaw?: string;
  procesadoConIA: boolean;
  resumenProcesadoIA?: string;
  
  // BLOQUE 6: DECISIÓN FINAL DEL PROPIETARIO
  decisionFinalPropietario: DecisionFinalPropietarioSeguro;
  notasPrivadasPropietario?: string;
  fechaDecisionPropietario?: string;
  
  // METADATOS
  fechaCreacion: string;
  fechaActualizacion: string;
  historial: HistorialSeguroImpagoItem[];
}

// ==========================================
// FASE 5: INTEGRACIÓN CON GMAIL
// ==========================================

export interface GmailIntegracionConfig {
  conectado: boolean;
  emailConectado: string;
  nombreTitular?: string;
  tokenExpira?: string;
  ultimoSondeo?: string;
  autoProcesarRespuestas: boolean;
}

export interface AnalisisRespuestaAseguradoraAI {
  dictamen: DictamenAseguradora;
  dictamenTexto: string;
  importeMaximoAsegurable: number;
  condiciones: string[];
  documentosRequeridos: string[];
  resumenEjecutivo: string;
  requiereAtencionPropietario: boolean;
}

// ==========================================
// CAPA ESTRUCTURAL: USUARIOS, PERFILES Y PERMISOS
// ==========================================

export type TipoPerfilUsuario = 'ADMINISTRADOR' | 'PROPIETARIO' | 'PROFESIONAL';

export type EstadoUsuario = 'ACTIVO' | 'PENDIENTE' | 'BLOQUEADO' | 'INACTIVO';

export interface UsuarioApp {
  id: string;
  authUid?: string;
  nombre: string;
  apellidos?: string;
  email: string;
  telefono?: string;
  tipoPerfil: TipoPerfilUsuario;
  estado: EstadoUsuario;
  roles: string[];
  permisos: string[];
  inmuebleIds?: string[]; // IDs de inmuebles a los que tiene acceso
  propietarioId?: string; // ID del propietario vinculado en colección 'propietarios'
  profesionalId?: string; // ID del profesional vinculado en colección 'profesionales'
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  creadoPor?: string;
}

export type TipoProfesional = 'EMPRESA' | 'AUTONOMO' | 'PARTICULAR';

export interface ZonaServicio {
  id: string;
  provincia: string;
  municipio?: string;
  localidad?: string;
  codigosPostales?: string[];
}

export interface Profesional {
  id: string;
  usuarioId?: string; // Vinculado a UsuarioApp cuando se registre
  creadoPorPropietarioId?: string; // Si fue creado manualmente por un propietario (profesional privado)
  esPrivado?: boolean; // Privado de un propietario hasta que se registre o comparta
  tipo: TipoProfesional;
  nombreComercial: string;
  razonSocial?: string;
  cifNif?: string;
  contactoNombre?: string;
  email?: string;
  telefono?: string;
  web?: string;
  especialidades: string[]; // Nombres o IDs de especialidades
  zonasServicio: ZonaServicio[];
  inmuebleIdsAsignados?: string[]; // Viviendas asignadas donde presta servicio
  activo: boolean;
  tokenInvitacion?: string; // Token para invitarlo a registrarse
  createdAt: string;
  updatedAt: string;
}

export interface EnlaceRegistro {
  id: string;
  token: string;
  tipoPerfil: 'PROPIETARIO' | 'PROFESIONAL';
  textoVisible: string; // Ej: "🏠 Regístrate como propietario" o "🔧 Regístrate como profesional"
  descripcion?: string;
  activo: boolean;
  profesionalIdVinculado?: string; // Si es una invitación para un profesional privado existente
  propietarioIdVinculado?: string; // Si es una invitación para un propietario existente
  fechaCaducidad?: string; // Opcional ISO
  usosMaximos?: number;
  usosActuales: number;
  creadoPor: string;
  createdAt: string;
}

export interface Especialidad {
  id: string;
  nombre: string;
  descripcion?: string;
  icono?: string;
  activa: boolean;
  orden?: number;
}

export interface AuditLog {
  id: string;
  usuarioId: string;
  usuarioEmail: string;
  usuarioNombre: string;
  accion: string; // Ej: "ADMIN_CREO_USUARIO", "ADMIN_BLOQUEO_USUARIO", "PROPIETARIO_ASIGNO_PROFESIONAL"
  descripcion: string;
  fechaHora: string;
  entidadAfectada: 'usuario' | 'profesional' | 'inmueble' | 'enlace' | 'rol' | 'modulo' | 'especialidad';
  idAfectado: string;
  resultado: 'EXITO' | 'ERROR';
  detalles?: Record<string, any>;
}

export interface PermisoDefinicion {
  codigo: string;
  nombre: string;
  categoria: 'inmuebles' | 'propietarios' | 'profesionales' | 'contratos' | 'candidatos' | 'seguros' | 'administracion';
  descripcion: string;
}

export const PERMISOS_SISTEMA: PermisoDefinicion[] = [
  { codigo: 'inmuebles.ver', nombre: 'Ver Inmuebles', categoria: 'inmuebles', descripcion: 'Visualizar viviendas y detalles' },
  { codigo: 'inmuebles.crear', nombre: 'Crear Inmuebles', categoria: 'inmuebles', descripcion: 'Dar de alta nuevas propiedades' },
  { codigo: 'inmuebles.editar', nombre: 'Editar Inmuebles', categoria: 'inmuebles', descripcion: 'Modificar fichas de viviendas' },
  { codigo: 'inmuebles.eliminar', nombre: 'Eliminar Inmuebles', categoria: 'inmuebles', descripcion: 'Borrar viviendas del sistema' },

  { codigo: 'propietarios.ver', nombre: 'Ver Propietarios', categoria: 'propietarios', descripcion: 'Consultar fichas y cuentas bancarias' },
  { codigo: 'propietarios.crear', nombre: 'Crear Propietarios', categoria: 'propietarios', descripcion: 'Dar de alta propietarios' },
  { codigo: 'propietarios.editar', nombre: 'Editar Propietarios', categoria: 'propietarios', descripcion: 'Modificar datos fiscales y cuentas' },
  { codigo: 'propietarios.eliminar', nombre: 'Eliminar Propietarios', categoria: 'propietarios', descripcion: 'Borrar propietarios' },

  { codigo: 'profesionales.ver', nombre: 'Ver Profesionales', categoria: 'profesionales', descripcion: 'Consultar catálogo de profesionales' },
  { codigo: 'profesionales.crear', nombre: 'Crear Profesionales', categoria: 'profesionales', descripcion: 'Añadir profesionales y empresas' },
  { codigo: 'profesionales.editar', nombre: 'Editar Profesionales', categoria: 'profesionales', descripcion: 'Modificar perfiles, zonas y servicios' },
  { codigo: 'profesionales.eliminar', nombre: 'Eliminar Profesionales', categoria: 'profesionales', descripcion: 'Eliminar profesionales' },
  { codigo: 'profesionales.asignar', nombre: 'Asignar a Viviendas', categoria: 'profesionales', descripcion: 'Vincular profesionales a inmuebles' },

  { codigo: 'contratos.ver', nombre: 'Ver Contratos', categoria: 'contratos', descripcion: 'Consultar contratos LAU formalizados' },
  { codigo: 'contratos.crear', nombre: 'Formalizar Contratos', categoria: 'contratos', descripcion: 'Generar nuevos contratos LAU' },
  { codigo: 'contratos.editar', nombre: 'Editar Contratos', categoria: 'contratos', descripcion: 'Modificar cláusulas y actas' },

  { codigo: 'candidatos.ver', nombre: 'Ver Candidatos', categoria: 'candidatos', descripcion: 'Listar y filtrar solicitantes' },
  { codigo: 'candidatos.crear', nombre: 'Añadir Candidatos', categoria: 'candidatos', descripcion: 'Registrar nuevos candidatos' },
  { codigo: 'candidatos.editar', nombre: 'Editar Candidatos', categoria: 'candidatos', descripcion: 'Actualizar solvencia y estados' },
  { codigo: 'candidatos.eliminar', nombre: 'Eliminar Candidatos', categoria: 'candidatos', descripcion: 'Descartar o borrar candidatos' },

  { codigo: 'seguros.ver', nombre: 'Ver Seguros de Impago', categoria: 'seguros', descripcion: 'Consultar expedientes de pólizas' },
  { codigo: 'seguros.crear', nombre: 'Crear Solicitudes de Seguro', categoria: 'seguros', descripcion: 'Iniciar trámites de asegurabilidad' },
  { codigo: 'seguros.tramitar', nombre: 'Tramitar con Aseguradoras', categoria: 'seguros', descripcion: 'Enviar expedientes vía Gmail API' },

  { codigo: 'administracion.usuarios', nombre: 'Gestión de Usuarios', categoria: 'administracion', descripcion: 'Crear, editar, activar y bloquear usuarios' },
  { codigo: 'administracion.permisos', nombre: 'Gestión de Permisos', categoria: 'administracion', descripcion: 'Asignar roles y permisos granulares' },
  { codigo: 'administracion.configuracion', nombre: 'Configuración y Módulos', categoria: 'administracion', descripcion: 'Activar y desactivar módulos y enlaces' },
  { codigo: 'administracion.auditoria', nombre: 'Ver Auditoría', categoria: 'administracion', descripcion: 'Consultar logs de auditoría del sistema' },
];

export interface RolDefinicion {
  id: string;
  nombre: string;
  descripcion: string;
  permisos: string[];
  esSistema: boolean;
}

export const ROLES_PREDEFINIDOS: RolDefinicion[] = [
  {
    id: 'SUPERADMIN',
    nombre: 'Administrador Total',
    descripcion: 'Control absoluto sobre todos los recursos, usuarios y configuraciones',
    permisos: PERMISOS_SISTEMA.map((p) => p.codigo),
    esSistema: true,
  },
  {
    id: 'PROPIETARIO_ESTANDAR',
    nombre: 'Propietario Estándar',
    descripcion: 'Acceso exclusivo a sus inmuebles, contratos y profesionales asignados',
    permisos: [
      'inmuebles.ver',
      'inmuebles.editar',
      'contratos.ver',
      'profesionales.ver',
      'profesionales.crear',
      'profesionales.asignar',
    ],
    esSistema: true,
  },
  {
    id: 'GESTOR_INMUEBLES',
    nombre: 'Gestor de Inmuebles & Alquileres',
    descripcion: 'Gestión operativa de candidatos, visitas, contratos y seguros',
    permisos: [
      'inmuebles.ver',
      'inmuebles.crear',
      'inmuebles.editar',
      'candidatos.ver',
      'candidatos.crear',
      'candidatos.editar',
      'contratos.ver',
      'contratos.crear',
      'seguros.ver',
      'seguros.crear',
      'seguros.tramitar',
      'profesionales.ver',
    ],
    esSistema: true,
  },
  {
    id: 'PROFESIONAL_MANTENIMIENTO',
    nombre: 'Profesional de Mantenimiento',
    descripcion: 'Acceso a su perfil, especialidades, zonas y viviendas asignadas',
    permisos: ['profesionales.ver'],
    esSistema: true,
  },
];

export interface ModulosConfig {
  inmuebles: boolean;
  propietarios: boolean;
  candidatos: boolean;
  visitas: boolean;
  contratos: boolean;
  seguros: boolean;
  profesionales: boolean;
  gastos: boolean;
  cobros: boolean;
  hipotecas: boolean;
  patrimonio: boolean;
  incidencias: boolean;
}

export const DEFAULT_MODULOS_CONFIG: ModulosConfig = {
  inmuebles: true,
  propietarios: true,
  candidatos: true,
  visitas: true,
  contratos: true,
  seguros: true,
  profesionales: true,
  gastos: false,
  cobros: false,
  hipotecas: false,
  patrimonio: false,
  incidencias: false,
};

