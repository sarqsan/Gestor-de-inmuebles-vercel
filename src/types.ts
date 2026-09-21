export type SectionType =
  | 'inicio'
  | 'inmuebles'
  | 'propietarios'
  | 'cobros'
  | 'tesoreria'
  | 'incidencias'
  | 'profesionales'
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
  | 'preseleccionado'
  | 'visita_reservada'
  | 'seleccionado'
  | 'pendiente_doc'
  | 'doc_solicitada'
  | 'doc_recibida'
  | 'pendiente_analisis'
  | 'en_analisis'
  | 'analizado'
  | 'seguro_solicitado'
  | 'aprobado_seguro'
  | 'rechazado_seguro'
  | 'decision_pendiente'
  | 'aceptado_final'
  | 'rechazado_final'
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

export interface CandidatoHistorialItem {
  id: string;
  fecha: string;
  timestamp?: number;
  autor: 'propietario' | 'candidato' | 'sistema_ia' | 'aseguradora';
  autorNombre?: string;
  fase: 'preseleccion' | 'seleccion' | 'documentacion' | 'analisis_ia' | 'seguro' | 'decision_final';
  accion: string;
  detalle?: string;
  estadoAnterior?: CandidateStatus | string;
  estadoNuevo?: CandidateStatus | string;
  metadatos?: Record<string, any>;
}

export interface Candidato {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  inmuebleId: string;
  inmuebleNombre: string;
  inmuebleInteresId?: string;
  propietarioId?: string; // ID permanente del propietario arrendador vinculante
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
  // Trazabilidad del circuito completo hasta seguro de impago y decisión
  historial?: CandidatoHistorialItem[];
  fechaPreseleccion?: string;
  fechaSeleccion?: string;
  seleccionadoMotivo?: string;
  clasificacionDocumental?: 'COMPLETO' | 'INCOMPLETO' | 'REVISAR' | 'NO_VALIDO';
  clasificacionDocumentalMotivo?: string;
  solicitudDocId?: string;
  solicitudSeguroId?: string;
  seguroDictamen?: DictamenAseguradora;
  decisionFinal?: 'ACEPTAR' | 'RECHAZAR' | 'PENDIENTE';
  decisionFinalMotivo?: string;
  decisionFinalFecha?: string;
  decisionFinalAutor?: string;
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

  // BLOQUE E: suministros del inmueble (lectura por get para el inquilino vinculado)
  suministroIds?: string[];
  // BLOQUE E: contratos cuyos inquilinos pueden leer (get) este inmueble
  contratoIdsAutorizados?: string[];
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

export type DocItemEstado = 'pendiente' | 'subido' | 'requiere_correccion' | 'validado' | 'revisar' | 'rechazado';

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

  // BLOQUE E: índices de capacidad — IDs de documentos hijos que el inquilino
  // vinculado puede leer por get() directo (deny list para INQUILINO en reglas).
  incidenciaIds?: string[];
  mensajeIds?: string[];
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
  propietarioId?: string; // ID del propietario arrendador vinculante
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

export type TipoPerfilUsuario = 'ADMINISTRADOR' | 'PROPIETARIO' | 'PROFESIONAL' | 'INQUILINO';

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
  contratoIds?: string[]; // BLOQUE E: contratos LAU vinculados (alcance del perfil INQUILINO)
  habitacionIdentificador?: string; // BLOQUE E: habitación arrendada (modalidad 'habitaciones')
  enlaceRegistroId?: string; // BLOQUE E: invitación que originó la cuenta (trazabilidad + verificación en reglas)
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  creadoPor?: string;
}

export type TipoProfesional =
  | 'AUTONOMO'
  | 'EMPRESA'
  | 'PROFESIONAL_INDIVIDUAL'
  | 'PARTICULAR'
  | 'OTRO';

export type EstadoProfesional =
  | 'ACTIVO'
  | 'INACTIVO'
  | 'PENDIENTE_VALIDACION'
  | 'BLOQUEADO';

export interface ServicioProfesional {
  id?: string;
  especialidad: string;
  nombre: string;
  descripcion?: string;
  precioEstimado?: number;
}

export interface DocumentoProfesional {
  id: string;
  nombre: string;
  tipo:
    | 'SEGURO_RC'
    | 'ALTA_IAE'
    | 'PREVENCION_RIESGOS'
    | 'CERTIFICADO_CONTRATISTA'
    | 'TITULO_OFICIAL'
    | 'OTRO';
  tamano?: number;
  storagePath: string;
  downloadUrl: string;
  fechaSubida: string;
  subidoPor: string;
}

export interface ZonaServicio {
  id: string;
  provincia: string;
  municipio?: string;
  localidad?: string;
  codigosPostales?: string[];
  radioKm?: number;
}

export interface Profesional {
  id: string;
  tipo: TipoProfesional;
  nombre?: string;
  nombreComercial: string;
  razonSocial?: string;
  empresa?: string;
  cifNif?: string;
  contactoNombre?: string;
  email?: string;
  telefono?: string;
  web?: string;
  descripcion?: string;
  especialidades: string[]; // Nombres o IDs de especialidades
  servicios?: ServicioProfesional[];
  estado?: EstadoProfesional;
  activo: boolean; // compatibilidad
  zonasServicio: ZonaServicio[];
  inmuebleIdsAsignados?: string[]; // Viviendas asignadas donde presta servicio
  documentos?: DocumentoProfesional[];
  observaciones?: string;
  creadoPor?: string;
  actualizadoPor?: string;
  usuarioId?: string; // Vinculado a UsuarioApp cuando se registre
  creadoPorPropietarioId?: string; // Si fue creado manualmente por un propietario (profesional privado)
  esPrivado?: boolean; // Privado de un propietario hasta que se registre o comparta
  tokenInvitacion?: string; // Token para invitarlo a registrarse
  valoracionMedia?: number;
  totalValoraciones?: number;
  fechaAlta?: string;
  fechaActualizacion?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnlaceRegistro {
  id: string;
  token: string;
  tipoPerfil: 'PROPIETARIO' | 'PROFESIONAL' | 'INQUILINO';
  textoVisible: string; // Ej: "🏠 Regístrate como propietario" o "🔧 Regístrate como profesional"
  descripcion?: string;
  activo: boolean;
  profesionalIdVinculado?: string; // Si es una invitación para un profesional privado existente
  propietarioIdVinculado?: string; // Si es una invitación para un propietario existente
  contratoIdVinculado?: string; // BLOQUE E: contrato LAU que da acceso (invitación INQUILINO)
  inmuebleIdVinculado?: string; // BLOQUE E: inmueble del contrato (invitación INQUILINO)
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
  categoria: 'inmuebles' | 'propietarios' | 'profesionales' | 'contratos' | 'candidatos' | 'seguros' | 'administracion' | 'tesoreria' | 'inquilinos' | 'suministros';
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

  { codigo: 'tesoreria.ver', nombre: 'Ver Tesorería', categoria: 'tesoreria', descripcion: 'Consultar liquidaciones, gastos y movimientos' },
  { codigo: 'tesoreria.liquidar', nombre: 'Generar Liquidaciones', categoria: 'tesoreria', descripcion: 'Generar y recalcular borradores de liquidación' },
  { codigo: 'tesoreria.aprobar', nombre: 'Aprobar y Pagar', categoria: 'tesoreria', descripcion: 'Aprobar liquidaciones y registrar pagos' },
  { codigo: 'tesoreria.sepa', nombre: 'Generar SEPA', categoria: 'tesoreria', descripcion: 'Generar ficheros pain.008 y pain.001' },

  { codigo: 'inquilinos.ver', nombre: 'Ver Inquilinos', categoria: 'inquilinos', descripcion: 'Consultar accesos de inquilinos al portal' },
  { codigo: 'inquilinos.gestionar', nombre: 'Gestionar Inquilinos', categoria: 'inquilinos', descripcion: 'Invitar, vincular y revocar accesos de inquilinos' },
  { codigo: 'suministros.ver', nombre: 'Ver Suministros', categoria: 'suministros', descripcion: 'Consultar suministros, lecturas y repartos' },
  { codigo: 'suministros.gestionar', nombre: 'Gestionar Suministros', categoria: 'suministros', descripcion: 'Alta de suministros, repartos y cambios de titular' },
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
      'inquilinos.ver',
      'inquilinos.gestionar',
      'suministros.ver',
      'suministros.gestionar',
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
  {
    id: 'INQUILINO_PORTAL',
    nombre: 'Inquilino (Portal)',
    descripcion: 'BLOQUE E: acceso exclusivo al Portal del Inquilino, limitado a sus contratos vinculados',
    permisos: ['inmuebles.ver', 'contratos.ver'],
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
  tesoreria?: boolean;
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
  tesoreria: true,
  hipotecas: false,
  patrimonio: false,
  incidencias: true,
};

// =========================================================================
// BLOQUE 4: GESTIÓN DE INCIDENCIAS, MANTENIMIENTO, SEGUROS Y SINIESTROS
// =========================================================================

export type CategoriaIncidencia =
  | 'AGUA'
  | 'ELECTRICIDAD'
  | 'FONTANERIA'
  | 'CLIMATIZACION'
  | 'ELECTRODOMESTICO'
  | 'CERRAJERIA'
  | 'HUMEDADES'
  | 'ESTRUCTURAL'
  | 'COMUNIDAD'
  | 'PLAGAS'
  | 'OTRO';

export type PrioridadIncidencia =
  | 'URGENTE'
  | 'ALTA'
  | 'NORMAL'
  | 'BAJA';

export type EstadoIncidencia =
  | 'ABIERTA'
  | 'EN_ANALISIS'
  | 'PENDIENTE_INFORMACION'
  | 'PENDIENTE_SEGURO'
  | 'PENDIENTE_PROFESIONAL'
  | 'EN_REPARACION'
  | 'PENDIENTE_RESOLUCION'
  | 'RESUELTA'
  | 'CERRADA'
  | 'CANCELADA';

export type OrigenIncidencia =
  | 'INQUILINO'
  | 'PROPIETARIO'
  | 'ADMINISTRADOR'
  | 'INSPECCION'
  | 'COMUNIDAD'
  | 'OTRO';

export type ResponsabilidadIncidencia =
  | 'PENDIENTE_DE_DETERMINAR'
  | 'PROPIETARIO'
  | 'INQUILINO'
  | 'GARANTIA'
  | 'SEGURO'
  | 'PROFESIONAL'
  | 'COMUNIDAD'
  | 'TERCERO'
  // Compatibilidad con registros existentes
  | 'POSIBLE_PROPIETARIO'
  | 'POSIBLE_INQUILINO'
  | 'POSIBLE_COMUNIDAD'
  | 'POSIBLE_TERCERO'
  | 'INDETERMINADA'
  | 'PENDIENTE_COMPROBACION';

export type EstadoSeguroIncidencia =
  | 'POSIBLEMENTE_CUBIERTA'
  | 'NO_CUBIERTA_SEGUN_DATOS'
  | 'COBERTURA_DUDOSA'
  | 'SIN_SEGURO_APLICABLE'
  | 'PENDIENTE_COMPROBACION';

export type SeguroEstadoIncidencia = EstadoSeguroIncidencia;

export type ViaActuacionIncidencia =
  | 'REPARACION_DIRECTA'
  | 'SOLICITAR_INFORMACION'
  | 'PROFESIONAL'
  | 'SEGURO'
  | 'COMUNIDAD'
  | 'TERCERO';

export interface AdjuntoIncidencia {
  id: string;
  incidenciaId?: string;
  inmuebleId?: string;
  propietarioId?: string;
  nombre: string;
  tipo: 'imagen' | 'video' | 'documento';
  mimeType?: string;
  url: string;
  storagePath?: string;
  tamanoBytes?: number;
  tamano?: number;
  fechaSubida: string;
  subidoPor?: string;
  observaciones?: string;
}

export interface CausaIncidenciaIA {
  causa: string;
  probabilidad?: string;
  detalles?: string;
}

export interface AnalisisIaIncidencia {
  urgenciaEstimada: PrioridadIncidencia;
  posiblesCausas: (string | CausaIncidenciaIA)[];
  informacionFaltante: string[];
  posiblesActuaciones: string[];
  posibleResponsabilidad: ResponsabilidadIncidencia;
  justificacionResponsabilidad: string;
  necesidadProfesional: boolean;
  especialidadRequerida?: string;
  relacionSeguros?: {
    posibleCobertura: EstadoSeguroIncidencia;
    explicacion: string;
    ramoRecomendado?: string;
  };
  advertenciaLegal: string;
  fechaAnalisis: string;
  modeloUtilizado?: string;

  // Propiedades opcionales de compatibilidad
  evaluacionUrgencia?: string;
  recomendacionResponsabilidad?: string;
  fundamentoResponsabilidad?: string;
  estimacionCoberturaSeguro?: string;
  fundamentoSeguro?: string;
  resumenDiagnostico?: string;
  pasosRecomendados?: string[];
}

export type AnalisisIncidenciaIA = AnalisisIaIncidencia;

export interface HistorialIncidenciaItem {
  id: string;
  fecha: string;
  usuario: string;
  accion: string;
  valorAnterior?: string;
  valorNuevo?: string;
  observacion?: string;
}

export interface TrabajoProfesionalIncidencia {
  profesionalId: string;
  profesionalNombre: string;
  profesionalTelefono?: string;
  profesionalEmail?: string;
  especialidad?: string;
  servicio: string;
  fechaAsignacion: string;
  presupuestoEstimado?: number;
  presupuestoAceptado?: boolean;
  fechaInicio?: string;
  fechaFinalizacion?: string;
  costeReal?: number;
  facturaNumero?: string;
  facturaUrl?: string;
  facturaStoragePath?: string;
  estadoTrabajo: 'ASIGNADO' | 'PRESUPUESTADO' | 'ACEPTADO' | 'EN_CURSO' | 'FINALIZADO' | 'CANCELADO';
  observaciones?: string;
}

export interface Incidencia {
  id: string;
  propietarioId: string;
  inmuebleId: string;
  inmuebleDireccion?: string;
  inmuebleCiudad?: string;
  contratoId?: string;
  contratoIdsVisibles?: string[]; // BLOQUE E: contratos cuyos inquilinos pueden leer (get) esta incidencia
  inquilinoId?: string;
  inquilinoNombre?: string;
  inquilinoTelefono?: string;
  titulo: string;
  descripcion: string;
  categoria: CategoriaIncidencia;
  prioridad: PrioridadIncidencia;
  estado: EstadoIncidencia;
  origen: OrigenIncidencia;
  fechaCreacion: string;
  fechaActualizacion: string;
  fechaCierre?: string;
  responsabilidad: ResponsabilidadIncidencia;
  responsabilidadNotas?: string;
  responsabilidadMotivo?: string;
  responsabilidadFechaDecision?: string;
  responsabilidadDecididoPor?: string;
  responsabilidadGarantiaRef?: string;
  seguroEstado: EstadoSeguroIncidencia;
  seguroComprobacionNotas?: string;
  viaActuacion?: ViaActuacionIncidencia;
  polizaId?: string;
  siniestroId?: string;
  profesionalId?: string;
  presupuestoId?: string;
  resolucion?: string;
  observaciones?: string;
  creadoPor: string;
  actualizadoPor: string;
  fotografias: AdjuntoIncidencia[];
  documentos: AdjuntoIncidencia[];
  analisisIa?: AnalisisIaIncidencia;
  historial: HistorialIncidenciaItem[];
  trabajoProfesional?: TrabajoProfesionalIncidencia;
}

// -------------------------------------------------------------------------
// PÓLIZAS DE SEGURO (Hogar, Arrendador, RC, Comunidad, etc.)
// -------------------------------------------------------------------------
export type TipoPolizaSeguro =
  | 'HOGAR'
  | 'ARRENDADOR'
  | 'IMPAGO_ALQUILER'
  | 'RESPONSABILIDAD_CIVIL'
  | 'COMUNIDAD'
  | 'OTRO';

export type EstadoPolizaSeguro =
  | 'VIGENTE'
  | 'VENCIDA'
  | 'CANCELADA'
  | 'EN_TRAMITE';

export interface DocumentoPoliza {
  id: string;
  nombre: string;
  url: string;
  storagePath?: string;
  tipo?: string;
  fechaSubida: string;
}

export interface PolizaSeguro {
  id: string;
  aseguradora: string;
  numeroPoliza: string;
  tipo: TipoPolizaSeguro;
  propietarioId: string;
  inmuebleId?: string; // Opcional si es cobertura multirriesgo o global
  inmuebleDireccion?: string;
  fechaInicio: string; // YYYY-MM-DD
  fechaVencimiento: string; // YYYY-MM-DD
  estado: EstadoPolizaSeguro;
  coberturas: string[]; // Ej: 'Daños por agua', 'Cerrajería urgente', 'Rotura cristales', etc.
  franquicia?: number;
  primaAnual?: number;
  contacto?: {
    telefono?: string;
    email?: string;
    asistencia24h?: string;
  };
  documentos?: DocumentoPoliza[];
  observaciones?: string;
  createdAt: string;
  updatedAt: string;
}

// -------------------------------------------------------------------------
// SINIESTROS VINCULADOS A INCIDENCIAS
// -------------------------------------------------------------------------
export type EstadoSiniestro =
  | 'PENDIENTE_COMUNICAR'
  | 'COMUNICADO'
  | 'EN_ESTUDIO'
  | 'PENDIENTE_DOCUMENTACION'
  | 'ACEPTADO'
  | 'RECHAZADO'
  | 'INDEMNIZADO'
  | 'CERRADO';

export interface ComunicacionSiniestro {
  id: string;
  fecha: string;
  remitente: string; // Ej: 'Aseguradora', 'Perito', 'Gestor', 'Propietario'
  mensaje: string;
  canal?: 'email' | 'telefono' | 'portal' | 'presencial';
}

export interface Siniestro {
  id: string;
  incidenciaId: string;
  polizaId: string;
  aseguradora: string;
  numeroExpediente?: string;
  numeroSiniestro?: string;
  fechaComunicacion: string;
  estado: EstadoSiniestro;
  fechaResolucion?: string;
  indemnizacion?: number;
  franquicia?: number;
  resolucion?: string;
  documentos?: DocumentoPoliza[];
  comunicaciones?: ComunicacionSiniestro[];
  observaciones?: string;
  createdAt: string;
  updatedAt: string;
}

// =========================================================================
// BLOQUE 5: PROFESIONALES, SERVICIOS Y GESTIÓN DE TRABAJOS
// =========================================================================

export type EspecialidadCodigo =
  | 'FONTANERIA'
  | 'ELECTRICIDAD'
  | 'CLIMATIZACION'
  | 'CERRAJERIA'
  | 'ALBANILERIA'
  | 'PINTURA'
  | 'CARPINTERIA'
  | 'CRISTALERIA'
  | 'ELECTRODOMESTICOS'
  | 'CALEFACCION'
  | 'TELECOMUNICACIONES'
  | 'PLAGAS'
  | 'LIMPIEZA'
  | 'JARDINERIA'
  | 'REFORMAS'
  | 'TECNICO'
  | 'ARQUITECTURA'
  | 'APAREJADOR'
  | 'INGENIERIA'
  | 'SEGUROS'
  | 'OTRO';

export type TipoTrabajoProfesional =
  | 'REPARACION_INCIDENCIA'
  | 'MANTENIMIENTO_PREVENTIVO'
  | 'REFORMA'
  | 'INSPECCION'
  | 'MEJORA'
  | 'OTRO';

export type EstadoTrabajoProfesional =
  | 'PENDIENTE'
  | 'BUSCANDO_PROFESIONAL'
  | 'PROFESIONAL_PROPUESTO'
  | 'ASIGNADO'
  | 'ASIGNADA'
  | 'PRESUPUESTO_SOLICITADO'
  | 'PRESUPUESTO_RECIBIDO'
  | 'PENDIENTE_ACEPTACION'
  | 'ACEPTADO'
  | 'PROGRAMADO'
  | 'EN_EJECUCION'
  | 'EN_CURSO'
  | 'PENDIENTE_MATERIAL'
  | 'PENDIENTE_PROPIETARIO'
  | 'FINALIZADO'
  | 'FINALIZADA'
  | 'CANCELADO'
  | 'CANCELADA';

export interface HistorialTrabajoItem {
  id: string;
  fecha: string;
  usuario: string;
  accion:
    | 'TRABAJO_CREADO'
    | 'PROFESIONAL_ASIGNADO'
    | 'PRESUPUESTO_SOLICITADO'
    | 'PRESUPUESTO_RECIBIDO'
    | 'PRESUPUESTO_ACEPTADO'
    | 'PRESUPUESTO_RECHAZADO'
    | 'TRABAJO_PROGRAMADO'
    | 'TRABAJO_INICIADO'
    | 'TRABAJO_FINALIZADO'
    | 'TRABAJO_CANCELADO'
    | 'VALORACION_REGISTRADA'
    | 'ESTADO_MODIFICADO'
    | 'NOTA_ANADIDA';
  estadoAnterior?: EstadoTrabajoProfesional;
  estadoNuevo?: EstadoTrabajoProfesional;
  observacion?: string;
}

export interface ValoracionProfesionalTrabajo {
  id?: string;
  puntuacion: number; // 1 a 5
  calidad: number; // 1 a 5
  puntualidad: number; // 1 a 5
  precio: number; // 1 a 5
  comunicacion: number; // 1 a 5
  resultado: 'SATISFACTORIO' | 'ACEPTABLE' | 'DEFICIENTE';
  comentario?: string;
  fecha: string;
  usuarioId?: string;
  usuarioNombre?: string;
  evaluador?: string;
  trabajoId: string;
  profesionalId: string;
  inmuebleId: string;
  inmuebleDireccion?: string;
  createdAt?: string;
}

export interface TrabajoProfesional {
  id: string;
  propietarioId: string;
  inmuebleId: string;
  inmuebleDireccion?: string;
  incidenciaId?: string; // Opcional (puede no proceder de una incidencia)
  profesionalId?: string;
  profesionalNombre?: string;
  profesionalTelefono?: string;
  profesionalEmail?: string;
  titulo: string;
  descripcion: string;
  categoria: string; // Especialidad o tipo de servicio
  tipoTrabajo?: TipoTrabajoProfesional;
  prioridad: PrioridadIncidencia;
  estado: EstadoTrabajoProfesional;
  fechaSolicitud: string;
  fechaAsignacion?: string;
  fechaInicio?: string;
  fechaFinalizacion?: string;
  presupuestoId?: string;
  importeEstimado?: number;
  importeFinal?: number;
  facturaNumero?: string;
  observaciones?: string;
  creadoPor: string;
  actualizadoPor: string;
  documentos?: AdjuntoIncidencia[];
  historial: HistorialTrabajoItem[];
  valoracion?: ValoracionProfesionalTrabajo;
  createdAt: string;
  updatedAt: string;
}

export type EstadoPresupuestoProfesional =
  | 'BORRADOR'
  | 'RECIBIDO'
  | 'EN_REVISION'
  | 'ACEPTADO'
  | 'RECHAZADO'
  | 'CADUCADO'
  | 'EN_NEGOCIACION';

export interface PartidaPresupuesto {
  id: string;
  concepto: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
}

export interface HistorialDecisionPresupuesto {
  fecha: string;
  usuario: string;
  estadoAnterior: EstadoPresupuestoProfesional;
  estadoNuevo: EstadoPresupuestoProfesional;
  observaciones?: string;
}

export interface PresupuestoProfesional {
  id: string;
  numeroPresupuesto?: string;
  trabajoId: string;
  profesionalId: string;
  profesionalNombre?: string;
  propietarioId: string;
  inmuebleId: string;
  inmuebleDireccion?: string;
  incidenciaId?: string;
  fecha: string;
  importeBase: number;
  iva: number; // importe de IVA calculado
  porcentajeIva?: number; // Ej: 21
  importeTotal: number;
  validez: string; // Ej: "30 días" o fecha límite
  descripcion: string;
  partidas: PartidaPresupuesto[];
  estado: EstadoPresupuestoProfesional;
  observaciones?: string;
  documentoUrl?: string;
  documentoStoragePath?: string;
  motivoRechazo?: string;
  fechaDecision?: string;
  decididoPor?: string;
  historialDecision?: HistorialDecisionPresupuesto[];
  creadoPor?: string;
  actualizadoPor?: string;
  createdAt: string;
  updatedAt: string;
}




// =========================================================================
// BLOQUE E — PORTAL DEL INQUILINO + SUMINISTROS
// Tipos nuevos E (aditivos). No se modifica la semántica de tipos existentes.
// =========================================================================

/** Suministro doméstico o comunitario asociado a un inmueble. Colección: `suministros`. */
export type TipoSuministro = 'LUZ' | 'AGUA' | 'GAS' | 'INTERNET' | 'OTRO';

export type ModoRepartoSuministro =
  | 'SIN_REPARTO'
  | 'IGUALITARIO'
  | 'POR_HABITACION'
  | 'PERSONALIZADO';

export interface TramoRepartoSuministro {
  /** Etiqueta del tramo (p. ej. 'HAB-1', 'Planta baja', 'Local A'). */
  etiqueta: string;
  /** Identificador de habitación del contrato (si aplica). */
  habitacionIdentificador?: string;
  /** Porcentaje 0-100. La suma de tramos debe ser 100. */
  porcentaje: number;
}

export interface Suministro {
  id: string;
  inmuebleId: string;
  tipo: TipoSuministro;
  /** CUPS (luz/gas) o código de punto de suministro. */
  cups?: string;
  /** Número de contador (agua u otros). */
  numeroContador?: string;
  titularNombre?: string;
  titularNif?: string;
  comercializadora?: string;
  tarifa?: string;
  potenciaContratadaKw?: number;
  modoReparto: ModoRepartoSuministro;
  reparto?: TramoRepartoSuministro[];
  activo: boolean;
  // Contratos cuyos inquilinos pueden leer (get) este suministro
  contratoIdsAutorizados?: string[];
  /** Índices de capacidad E (lectura por get para el inquilino vinculado). */
  lecturaIds?: string[];
  cambioTitularIds?: string[];
  observaciones?: string;
  createdByUid?: string;
  createdByEmail?: string;
  fechaAlta: string;
  fechaActualizacion: string;
}

/**
 * Lectura de contador. INMUTABLE: una vez creada no admite update ni delete
 * (reglas Firestore). Las correcciones se registran como nueva lectura con
 * `corrigeLecturaId` apuntando a la lectura sustituida (trazabilidad).
 * Colección: `lecturas_suministro`.
 */
export type OrigenLecturaSuministro = 'INQUILINO' | 'ADMIN' | 'PROPIETARIO' | 'CONTADOR_INTELIGENTE';

export interface LecturaSuministro {
  id: string;
  suministroId: string;
  inmuebleId: string;
  contratoId?: string;
  /** Valor del contador en la unidad indicada. */
  valor: number;
  unidad: string; // 'kWh' | 'm3' | ...
  fechaLectura: string; // ISO
  origen: OrigenLecturaSuministro;
  registradoPorUid?: string;
  registradoPorEmail?: string;
  registradoPorNombre?: string;
  /** Foto del contador en Storage (ruta privada, nunca base64). */
  fotoStoragePath?: string;
  /** Si corrige una lectura anterior, ID de la lectura sustituida. */
  corrigeLecturaId?: string;
  observaciones?: string;
  createdAt: string;
}

/**
 * Solicitud de cambio de titularidad de un suministro.
 * Colección: `cambios_titular`.
 */
export type EstadoCambioTitular = 'SOLICITADO' | 'CONFIRMADO' | 'RECHAZADO';

export interface CambioTitularSuministro {
  id: string;
  suministroId: string;
  inmuebleId: string;
  contratoId?: string;
  titularAnteriorNombre?: string;
  titularNuevoNombre: string;
  titularNuevoNif?: string;
  titularNuevoTelefono?: string;
  titularNuevoEmail?: string;
  fechaEfecto: string; // ISO
  estado: EstadoCambioTitular;
  motivoRechazo?: string;
  solicitadoPorUid?: string;
  solicitadoPorEmail?: string;
  gestionadoPorUid?: string;
  createdAt: string;
  fechaActualizacion: string;
}

/**
 * Mensaje del hilo portal inquilino ↔ gestión, anclado a un contrato.
 * Hilo visible completo para ambas partes (sin borrado).
 * Colección: `mensajes_portal`.
 */
export type RolRemitenteMensaje = 'INQUILINO' | 'GESTION';

export interface MensajePortal {
  id: string;
  contratoId: string;
  inmuebleId: string;
  remitenteUid: string;
  remitenteNombre: string;
  remitenteRol: RolRemitenteMensaje;
  texto: string;
  leidoPorGestion?: boolean;
  leidoPorInquilino?: boolean;
  createdAt: string;
}

/** Vista saneada del historial del inquilino (derivada de entidades visibles + auditoría redactada). */
export type CategoriaHistorialInquilino =
  | 'CONTRATO'
  | 'RECIBO'
  | 'INCIDENCIA'
  | 'SUMINISTRO'
  | 'MENSAJE'
  | 'DOCUMENTO';

export interface HistorialInquilinoItem {
  id: string;
  fecha: string; // ISO
  categoria: CategoriaHistorialInquilino;
  titulo: string;
  detalle?: string;
  entidadId?: string;
}
