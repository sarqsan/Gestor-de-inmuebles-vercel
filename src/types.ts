export type SectionType =
  | 'inicio'
  | 'inmuebles'
  | 'propietarios'
  | 'cobros'
  // BLOQUE B (integración canónica 2026-09-20): tesorería y liquidaciones de propietarios
  | 'tesoreria'
  | 'gastos'
  | 'conciliacion'
  // BLOQUE C (morosidad avanzada): recobro y expediente legal
  | 'morosidad'
  | 'facturacion'
  | 'financiacion'
  | 'fiscal'
  | 'informes'
  | 'polizas'
  | 'actas'
  // BLOQUE E (reconciliado): portal del inquilino y suministros
  | 'inquilinos'
  | 'suministros'
  | 'preseleccionados'
  | 'seguro_impago'
  | 'formalizacion'
  | 'recomercializacion'
  | 'incidencias'
  | 'operaciones'
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
  habitacionId?: string;
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
  // FASE 3.5.1 — detalle catastral para afinar la valoración
  datosCatastrales?: DatosCatastrales;
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

  // Campos adicionales y alias operativos
  alias?: string;
  municipio?: string;
  localidad?: string;
  provincia?: string;
  pais?: string;
  tipo?: string;
  rentaMensual?: number;
  createdAt?: string;
  updatedAt?: string;

  // Ficha técnica (campos opcionales: inmuebles antiguos siguen válidos)
  planta?: string;
  ascensor?: boolean;
  terraza?: boolean;
  balcon?: boolean;
  interiorExterior?: 'exterior' | 'interior' | 'mixto';
  orientacion?: string;
  anioConstruccion?: number;
  estadoConservacion?: 'nuevo' | 'muy_bueno' | 'bueno' | 'a_reformar' | 'en_obras';
  aireAcondicionado?: boolean;
  calefaccion?: boolean;
  cocinaEquipada?: boolean;
  electrodomesticosIncluidos?: boolean;
  armariosEmpotrados?: boolean;
  tipoVentanas?: string;
  tipoPersianas?: string;
  fechaActualizacionFicha?: string;
  actualizadoPorFicha?: string;
  // BLOQUE E (reconciliado): suministros del inmueble (lectura por get para el inquilino vinculado)
  suministroIds?: string[];
  // BLOQUE E (reconciliado): contratos cuyos inquilinos pueden leer (get) este inmueble
  contratoIdsAutorizados?: string[];
}

export type CategoriaInventario =
  | 'COCINA'
  | 'SALON'
  | 'DORMITORIO'
  | 'BANO'
  | 'TERRAZA'
  | 'EXTERIOR'
  | 'ELECTRODOMESTICOS'
  | 'MOBILIARIO'
  | 'ILUMINACION'
  | 'CLIMATIZACION'
  | 'OTROS';

export type EstadoInventario =
  | 'NUEVO'
  | 'BUEN_ESTADO'
  | 'USADO'
  | 'DETERIORADO'
  | 'REPARAR'
  | 'BAJA';

export interface DocumentoInventario {
  id: string;
  inventarioId: string;
  inmuebleId: string;
  nombre: string;
  mimeType?: string;
  url: string;
  storagePath: string;
  tamanoBytes?: number;
  fechaSubida: string;
  subidoPor?: string;
}

export interface HistorialInventarioItem {
  id: string;
  fecha: string;
  usuarioId?: string;
  usuarioNombre: string;
  accion: string;
  elementoAfectado: string;
  cambios?: string;
  estadoAnterior?: EstadoInventario;
  estadoNuevo?: EstadoInventario;
}

export interface ElementoInventario {
  id: string;
  inmuebleId: string;
  nombre: string;
  categoria?: CategoriaInventario | string;
  descripcion?: string;
  cantidad?: number;
  estado?: EstadoInventario | string;
  ubicacion?: string;
  estancia?: string;
  estadoUso?: string;
  marca?: string;
  modelo?: string;
  numeroSerie?: string;
  garantiaHasta?: string;
  observaciones?: string;
  fechaAlta?: string;
  fechaModificacion?: string;
  creadoPor?: string;
  actualizadoPor?: string;
  activo?: boolean;
  documentos?: DocumentoInventario[];
  historial?: HistorialInventarioItem[];
  habitacionId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type EstadoHabitacion =
  | 'DISPONIBLE'
  | 'RESERVADA'
  | 'EN_PROCESO'
  | 'OCUPADA'
  | 'ALQUILADA'
  | 'NO_DISPONIBLE'
  | 'BLOQUEADA'
  | 'INACTIVA';

export interface HistorialHabitacionItem {
  id: string;
  fecha: string;
  usuarioNombre: string;
  accion: string;
  estadoAnterior?: EstadoHabitacion;
  estadoNuevo?: EstadoHabitacion;
  detalle?: string;
  contratoId?: string;
}

export interface HabitacionInmueble {
  id: string;
  inmuebleId: string;
  propietarioId?: string;
  nombre: string;
  descripcion?: string;
  estado: EstadoHabitacion;
  superficie?: number;
  precioObjetivo?: number;
  caracteristicas?: string;
  activo: boolean;
  fechaAlta: string;
  fechaModificacion: string;
  creadoPor: string;
  actualizadoPor: string;
  historial?: HistorialHabitacionItem[];
  contratoId?: string;
  motivoBloqueo?: string;
  fianza?: number;
  selectedCandidatoId?: string;
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
  habitacionId?: string;
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
  habitacionId?: string;
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
  | 'RESCINDIDO'
  | 'CANCELADO';

// ==========================================
// GAP 2: MODALIDADES CONTRACTUALES, ANEXOS, RESCISIÓN Y FINIQUITO
// ==========================================

/**
 * Modalidad jurídica/funcional del contrato. Extensible.
 * - VIVIENDA_HABITUAL: arrendamiento LAU de vivienda permanente (modelo actual).
 * - TEMPORADA: uso distinto de vivienda por temporada (Art. 3.2 LAU).
 * - LOCAL_USO_DISTINTO: local comercial / uso distinto de vivienda (Art. 3.1 LAU).
 * - HABITACION: alquiler de una habitación concreta dentro de un inmueble en modo habitaciones.
 */
export type ModalidadContractual =
  | 'VIVIENDA_HABITUAL'
  | 'TEMPORADA'
  | 'LOCAL_USO_DISTINTO'
  | 'HABITACION';

/** Motivo/tipo por el que un contrato alcanza un estado terminal. */
export type TipoFinalizacionContrato =
  | 'FINALIZACION_NATURAL'
  | 'RESCISION_ANTICIPADA'
  | 'MUTUO_ACUERDO'
  | 'CANCELACION_EXPEDIENTE';

/** Datos formales de la finalización/rescisión/cancelación de un contrato. */
export interface FinalizacionContrato {
  tipo: TipoFinalizacionContrato;
  fechaEfectiva: string; // YYYY-MM-DD
  motivo?: string;
  observaciones?: string;
  ejecutadoPor: string; // nombre del usuario que ejecuta la operación
  ejecutadoPorId?: string;
  fechaOperacion: string; // ISO
}

export type TipoAnexoContractual =
  | 'MODIFICACION_CONTRACTUAL'
  | 'PRORROGA'
  | 'INVENTARIO'
  | 'GARANTIA_ADICIONAL'
  | 'CONDICIONES_PARTICULARES'
  | 'OTRO';

export type EstadoAnexoContractual = 'BORRADOR' | 'CONFIRMADO' | 'SUPERSEDIDO';

/**
 * Anexo contractual versionado.
 * REGLA: un anexo CONFIRMADO no se modifica; si necesita corrección se crea una
 * nueva versión (nuevo anexo con version+1 y anexoOriginalId) y el anterior pasa
 * a SUPERSEDIDO, conservándose el histórico completo.
 */
export interface AnexoContractual {
  id: string; // anexoId
  contratoId: string;
  propietarioId?: string;
  inmuebleId: string;
  habitacionId?: string;
  tipo: TipoAnexoContractual;
  titulo: string;
  descripcion?: string;
  fecha: string; // YYYY-MM-DD fecha del anexo
  contenido: string; // texto o datos estructurados serializados
  version: number;
  estado: EstadoAnexoContractual;
  anexoOriginalId?: string; // si es una nueva versión de un anexo anterior
  referenciaDocumental?: string; // p.ej. ruta Storage o URL del documento
  fechaCreacion: string; // ISO
  fechaConfirmacion?: string; // ISO
  creadoPor: string;
  creadoPorId?: string;
}

/** Concepto económico del finiquito. favoreceA indica a quién beneficia el importe. */
export type TipoConceptoFiniquito =
  | 'RENTA_PENDIENTE'
  | 'SUMINISTROS_PENDIENTES'
  | 'DANOS'
  | 'OTROS_CARGOS_PROPIETARIO'
  | 'DEVOLUCION_FIANZA'
  | 'GARANTIAS_A_DEVOLVER'
  | 'SALDOS_A_FAVOR_INQUILINO';

export type EstadoConceptoFiniquito = 'PENDIENTE' | 'PARCIAL' | 'LIQUIDADO';

export interface ConceptoFiniquito {
  id: string;
  tipo: TipoConceptoFiniquito;
  favoreceA: 'PROPIETARIO' | 'INQUILINO';
  concepto: string;
  periodoRelacionado?: string; // p.ej. "2026-05" si deriva de un cobro concreto (solo referencia)
  importeReclamado: number;
  importePendiente: number;
  importePagado: number; // pagado por el inquilino (cargos del propietario)
  importeDevuelto: number; // devuelto al inquilino (conceptos a su favor)
  estado: EstadoConceptoFiniquito;
  fechaCreacion: string; // ISO
  creadoPor: string;
}

export type EstadoFiniquito = 'ABIERTO' | 'CERRADO';

/**
 * Finiquito económico de cierre del contrato.
 * saldoFinal > 0: el inquilino debe pagar al propietario.
 * saldoFinal < 0: el propietario debe devolver al inquilino.
 * Nunca modifica retroactivamente los cobros históricos (registroCobros).
 */
export interface FiniquitoContrato {
  contratoId: string;
  inmuebleId: string;
  habitacionId?: string;
  propietarioId?: string;
  estado: EstadoFiniquito;
  conceptos: ConceptoFiniquito[];
  saldoFinal: number;
  fechaGeneracion: string; // ISO
  generadoPor: string;
  fechaCierre?: string; // ISO
  cerradoPor?: string;
  observaciones?: string;
}

/**
 * Eventos del ciclo contractual para el sistema de notificaciones (Arena B, GAP 1).
 * C solo define el contrato de eventos y los puntos de emisión; el dispatcher es de B.
 */
export type TipoEventoContrato =
  | 'CONTRATO_CREADO'
  | 'CONTRATO_FORMALIZADO'
  | 'ANEXO_CREADO'
  | 'CONTRATO_PROXIMO_A_FINALIZAR'
  | 'CONTRATO_FINALIZADO'
  | 'FINIQUITO_GENERADO'
  | 'FINIQUITO_CERRADO';

export interface EventoContrato {
  tipo: TipoEventoContrato;
  contratoId: string;
  inmuebleId: string;
  habitacionId?: string;
  propietarioId?: string;
  fecha: string; // ISO
  detalle?: string;
}

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
  habitacionId?: string;
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

  // ---- GAP 2: MODALIDAD CONTRACTUAL Y CICLO DE VIDA ----
  /** Modalidad jurídica del contrato (ver ModalidadContractual). Si no existe, se infiere del resto de datos. */
  modalidadContractual?: ModalidadContractual;
  /** Finalidad o uso pactado (actividad en locales, uso concreto en temporada/habitación). */
  finalidadUso?: string;
  /** TEMPORADA: causa/motivo declarado de la temporalidad (dato aportado por el usuario). */
  motivoTemporalidad?: string;
  /** Duración pactada en meses (temporada/locales), complementaria a duracionAnios. */
  duracionMeses?: number;
  /** Relación histórica: contrato precedente (prórroga/renovación/novación). */
  contratoOrigenId?: string;
  /** Relación histórica: contrato que sustituye a este. */
  contratoDerivadoId?: string;
  /** IDs de contratos que se derivaron de este (historial hacia delante). */
  contratosDerivadosIds?: string[];
  /** Tipo de relación con el contratoOrigenId. */
  relacionHistoricaTipo?: 'RENOVACION' | 'PRORROGA' | 'SUBROGACION' | 'ORIGINAL';
  /** Versión dentro de la cadena origen→derivado (1 = contrato inicial). */
  version?: number;
  /** Datos formales cuando el contrato alcanza un estado terminal (FINALIZADO / RESCINDIDO / CANCELADO). */
  finalizacion?: FinalizacionContrato;
  /** Anexos versionados asociados a este contrato (adendas, prórrogas, inventario, etc.). */
  anexos?: AnexoContractual[];
  /** Finiquito económico de cierre (cargos pendientes, fianza a devolver, saldo neto final). */
  finiquito?: FiniquitoContrato;

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
  | 'PAGADO'
  | 'PAGADO_PARCIAL'
  | 'IMPAGADO'
  | 'ANULADO'
  | 'RECIBIDO'
  | 'VERIFICADO'
  | 'RETRASADO'
  | 'RECLAMADO'
  | 'DEVUELTO'
  | 'INCIDENCIA';

export interface JustificanteCobro {
  id: string;
  nombreArchivo: string;
  url?: string;
  downloadURL?: string;
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
  habitacionId?: string;
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
  | 'SEGUROS'
  | 'SUMINISTROS'
  | 'MANTENIMIENTO'
  | 'REPARACION'
  | 'MANTENIMIENTO_REPARACION'
  | 'ADMINISTRACION'
  | 'GESTION'
  | 'LIMPIEZA'
  | 'IMPUESTOS_TASAS'
  | 'ELECTRODOMESTICOS'
  | 'MOBILIARIO'
  | 'REFORMAS'
  | 'OTRO'
  | 'OTRO_EXPLOTACION'
  // --- Financiación ---
  | 'CUOTA_HIPOTECARIA'
  | 'INTERESES_PRESTAMO'
  | 'OTRO_FINANCIACION';

export type EstadoGasto = 'PENDIENTE' | 'PAGADO' | 'ANULADO' | 'EN_REVISION';

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

  // Trazabilidad de origen (reparaciones / OT / incidencias / seguros)
  origen?: 'MANUAL' | 'RECURRENTE' | 'REPARACION' | 'ORDEN_TRABAJO' | 'INCIDENCIA' | 'SEGURO' | 'OTRO' | string;
  origenId?: string; // ID del registro origen (ej: trabajoId)
  trabajoId?: string; // ID de la Orden de Trabajo vinculada
  ordenTrabajoId?: string; // Alias de compatibilidad con trabajoId
  incidenciaId?: string; // ID de la Incidencia vinculada
  proyectoId?: string; // ID del Proyecto de Reforma vinculado
  partidaId?: string; // ID de la partida vinculada si aplica
  profesionalId?: string; // ID del Profesional que ejecutó el trabajo
  presupuestoId?: string; // ID del Presupuesto previo asociado si existió
  fecha?: string; // Alias de conveniencia
  pagado?: boolean; // Alias de conveniencia
  esDeducible?: boolean; // Alias fiscal
  tipoDeducible?: 'DEDUCIBLE' | 'NO_DEDUCIBLE';
  ejercicioFiscal?: number;
  documento?: { id: string; nombre: string; url: string; storagePath?: string };
  documentos?: { id: string; nombre: string; url: string; storagePath?: string }[];
  inmuebleDireccion?: string;

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

export type TipoPerfilUsuario = 'ADMINISTRADOR' | 'PROPIETARIO' | 'PROFESIONAL' | 'INQUILINO';

export type EstadoUsuario = 'ACTIVO' | 'PENDIENTE' | 'BLOQUEADO' | 'INACTIVO';

export interface UsuarioApp {
  id: string;
  uid?: string; // Alias auth
  authUid?: string;
  nombre: string;
  apellidos?: string;
  email: string;
  telefono?: string;
  tipoPerfil: TipoPerfilUsuario;
  rol?: string; // Alias
  estado: EstadoUsuario;
  activo?: boolean; // Flag de estado
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

export type TipoProfesional = 'EMPRESA' | 'AUTONOMO' | 'PARTICULAR' | 'PROFESIONAL_INDIVIDUAL' | 'OTRO';
export type EstadoProfesional = 'ACTIVO' | 'INACTIVO' | 'PAUSADO' | 'PENDIENTE_VALIDACION' | 'BLOQUEADO';

export interface ServicioProfesional {
  id: string;
  nombre: string;
  descripcion?: string;
  especialidad: string;
  precioOrientativo?: number;
}

export interface DocumentoProfesional {
  id: string;
  nombre: string;
  tipo: string;
  url?: string;
  downloadUrl?: string;
  storagePath?: string;
  fechaSubida: string;
  tamano?: number;
  subidoPor?: string;
}

export interface ZonaServicio {
  id?: string;
  provincia: string;
  municipio?: string;
  municipios?: string[];
  localidad?: string;
  codigosPostales?: string[];
  esTodaProvincia?: boolean;
}

export interface Profesional {
  id: string;
  usuarioId?: string; // Vinculado a UsuarioApp cuando se registre
  creadoPorPropietarioId?: string; // Si fue creado manualmente por un propietario (profesional privado)
  esPrivado?: boolean; // Privado de un propietario hasta que se registre o comparta
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
  servicios?: (ServicioProfesional | string)[];
  estado?: EstadoProfesional;
  activo: boolean;
  disponible?: boolean;
  propietarioId?: string;
  zonasServicio: ZonaServicio[];
  inmuebleIdsAsignados?: string[]; // Viviendas asignadas donde presta servicio
  documentos?: DocumentoProfesional[];
  observaciones?: string;
  valoracionMedia?: number;
  totalValoraciones?: number;
  fechaAlta?: string;
  fechaActualizacion?: string;
  tokenInvitacion?: string; // Token para invitarlo a registrarse
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
  entidadAfectada: 'usuario' | 'profesional' | 'inmueble' | 'enlace' | 'rol' | 'modulo' | 'especialidad' | 'contrato' | 'incidencia' | 'suministro' | 'mensaje';
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

  { codigo: 'tesoreria.ver', nombre: 'Ver Tesorería', categoria: 'tesoreria', descripcion: 'Consultar liquidaciones, gastos de tesorería y movimientos (BLOQUE B)' },
  { codigo: 'tesoreria.liquidar', nombre: 'Generar y Aprobar Liquidaciones', categoria: 'tesoreria', descripcion: 'Crear borradores de liquidación y aprobarlas para pago' },
  { codigo: 'tesoreria.pagar', nombre: 'Pagar y Reversar Liquidaciones', categoria: 'tesoreria', descripcion: 'Registrar pago con evidencia y reversión con motivo (trazable)' },
  { codigo: 'tesoreria.sepa', nombre: 'Ficheros SEPA (PAIN.008/001)', categoria: 'tesoreria', descripcion: 'Preparar y validar ficheros SEPA. Solo preparación: sin envío bancario' },

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
  hipotecas: boolean;
  patrimonio: boolean;
  incidencias: boolean;
  // BLOQUE B (integración canónica 2026-09-20)
  tesoreria: boolean;
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
  tesoreria: true,
};


// ==========================================================
// FASE 3 — RECOMERCIALIZACIÓN INTELIGENTE DEL INMUEBLE
// Ciclo: salida del inquilino → inspección/IA → reformas/ROI →
// pricing → estrategia de comercialización → nuevo contrato/venta.
// INVARIANTE: se reutiliza siempre el mismo inmuebleId (histórico).
// ==========================================================

export type EstadoRecomercializacion =
  | 'BORRADOR'
  | 'SALIDA_NOTIFICADA'
  | 'REVISION_PENDIENTE'
  | 'FOTOS_ACTUALIZADAS'
  | 'VALORACION_COMPLETADA'
  | 'DECISION_ESTRATEGIA'
  | 'EN_COMERCIALIZACION'
  | 'CERRADO_REARRENDADO'
  | 'CERRADO_VENDIDO'
  | 'CANCELADO';

export type DestinoInmueble =
  | 'ALQUILER_TRADICIONAL'
  | 'ALQUILER_HABITACIONES'
  | 'ALQUILER_TEMPORAL'
  | 'VENTA'
  | 'INDECISO';

export type ModalidadComercializacion = 'GESTION_PROPIA' | 'INMOBILIARIA' | 'AMBAS';

export type EstanciaFoto =
  | 'salon'
  | 'cocina'
  | 'bano'
  | 'dormitorio'
  | 'terraza'
  | 'exterior'
  | 'otro';

export interface FotoInspeccion {
  id: string;
  estancia: EstanciaFoto;
  url: string;
  storagePath?: string;
  fecha: string; // ISO
  analisisIa?: {
    observaciones: string[]; // Redacción no asertiva / prudente
    sugerenciasMejora: string[];
    // FASE 3.3: prioridad orientativa de revisión (no una certeza de daño)
    prioridad?: 'baja' | 'media' | 'alta';
    // 'gemini' = análisis multimodal real; 'heuristico' = respaldo sin API key
    motor?: 'gemini' | 'heuristico';
    analizFecha?: string;
  };
}

export interface DatosSalidaInquilino {
  fechaComunicacion?: string; // ISO: notificación del desistimiento/fin
  fechaPrevistaSalida?: string; // ISO: desalojo pactado
  fechaEntregaLlaves?: string; // ISO: inspección y recepción de llaves
  observaciones?: string;
  depositoFianzaADevolver?: number;
  contratoEstado?: 'ACTIVO' | 'EN_PROCESO_RESOLUCION' | 'FINALIZADO_LIQUIDADO';
}

/**
 * Datos catastrales del activo (FASE 3.5.1). El propietario puede
 * transcribirlos desde el IBI / la Sede Electrónica del Catastro; la
 * plataforma puede completar dirección y coordenadas con el servicio
 * público OVC (sólo datos abiertos; superficie construida, año y valor
 * catastral NO los sirve ese servicio sin convenio).
 */
export interface DatosCatastrales {
  referenciaCatastral: string;
  superficieCatastralConstruida?: number; // m² construidos catastrales
  anioConstruccion?: number;
  valorCatastral?: number;
  usoCatastral?: string; // p. ej. "V: Vivienda"
  planta?: string;
  direccionCatastral?: string; // Domicilio normalizado (ldt) por la OVC
  latitud?: number;
  longitud?: number;
  fuente?: 'manual' | 'catastro_ovc';
  fechaConsulta?: string; // ISO
  notas?: string;
}

/** Testigo/manual de mercado de la misma zona y tipología (FASE 3.5). */
export interface ComparableMercado {
  id: string;
  fuente?: string; // Portal, inmobiliaria, enlace…
  descripcion?: string;
  metros?: number;
  precioAlquilerMensual?: number;
  precioVenta?: number;
  // FASE 3.5.1 — características para comparar perfiles homogéneos
  habitaciones?: number;
  banos?: number;
  tipoInmueble?: string;
  planta?: string;
  estadoConservacion?: 'nuevo' | 'bueno' | 'reformado' | 'a_reformar' | 'desconocido';
  distanciaKm?: number; // distancia aproximada al activo
}

export interface PricingRecomercializacion {
  rentaAnterior?: number;
  escenarioConservador?: number;
  escenarioRecomendado?: number;
  escenarioMaximo?: number;
  valoracionVentaEstimada?: number;
  horquillaVentaMin?: number;
  horquillaVentaMax?: number;
  precioSalidaRecomendado?: number;
  plazoMedioComercializacionDias?: number;
  notasCalculo?: string;
  fechaCalculo?: string; // ISO
  // FASE 3.5 — hipótesis y datos de cálculo (trazabilidad del precio)
  ipcAcumuladoPct?: number; // Variación por IPC desde el contrato anterior (%)
  ajusteMercadoPct?: number; // Ajuste manual de mercado/zona (%) sin comparables
  mejoraRentaConfirmada?: number; // Suma de incrementos de renta de mejoras confirmadas (€/mes)
  precioM2Alquiler?: number; // €/m² al mes resultante del escenario recomendado
  precioM2Venta?: number; // €/m² de venta estimado
  comparables?: ComparableMercado[];
  motor?: 'ia' | 'calculadora'; // Quién produjo la última estimación
}

export type CategoriaMejora =
  | 'PINTURA'
  | 'ILUMINACION'
  | 'COCINA'
  | 'BANO'
  | 'SUELOS'
  | 'MOBILIARIO'
  | 'LIMPIEZA_PUESTA_A_PUNTO'
  | 'EFICIENCIA_ENERGETICA'
  | 'REPARACION'
  | 'OTRA';

export interface MejoraROI {
  id: string;
  actuacion: string;
  categoria?: CategoriaMejora;
  costeEstimadoMin?: number;
  costeEstimadoMax?: number;
  incrementoRentaMensual?: number;
  incrementoValoracion?: number;
  paybackMeses?: number;
  // Impacto orientativo en la presentación del anuncio (no una certeza de daño)
  impacto?: 'bajo' | 'medio' | 'alto';
  confirmadaPorPropietario?: boolean;
  profesionalIdSolicitado?: string;
  presupuestoSolicitadoFecha?: string; // ISO
  origen?: 'ia' | 'manual';
}

export interface KitPublicacion {
  titulo?: string;
  descripcion?: string;
  puntosFuertes?: string[];
  entorno?: string[];
  extras?: string[]; // p. ej. "Ascensor (verificar en la visita)"
  motor?: 'ia' | 'heuristico';
  fechaGeneracion?: string;
}

export interface ComercializacionExpediente {
  inmobiliariasContactadasIds: string[];
  enlaceAnuncioManualGenerado?: boolean;
  kitPublicacion?: KitPublicacion;
  fechaPublicacion?: string; // ISO
  // FASE 3.6 — cierre del ciclo
  fechaInicioComercializacion?: string; // ISO
  fechaCierre?: string; // ISO
  resultadoCierre?: 'REARRENDADO' | 'VENDIDO';
  nuevoContratoId?: string; // enlace al contrato que reabre el ciclo (mismo inmuebleId)
}

export interface ExpedienteRecomercializacion {
  id: string;
  inmuebleId: string; // INVARIANTE: mismo inmuebleId, se conserva el histórico
  propietarioId: string; // Clave de aislamiento por propietario
  contratoAnteriorId?: string;
  fechaInicio: string; // ISO
  estado: EstadoRecomercializacion;
  destinoPrevisto: DestinoInmueble;
  modalidadElegida?: ModalidadComercializacion;

  datosSalida?: DatosSalidaInquilino;
  revisionFotografica?: {
    fechaCarga?: string;
    fotografias: FotoInspeccion[];
  };
  mejorasPropuestas?: MejoraROI[];
  pricing?: PricingRecomercializacion;
  comercializacion?: ComercializacionExpediente;

  notasInternas?: string;
  creadoPor?: string;
  creadoPorId?: string;
  createdAt: string;
  updatedAt: string;
}

// Directorio de inmobiliarias (bolsa para delegar/comparar la comercialización)
export interface InmobiliariaDirectorio {
  id: string;
  nombreComercial: string;
  razonSocial?: string;
  cifNif?: string;
  logoUrl?: string;
  telefono: string;
  email: string;
  web?: string;

  // Cobertura geográfica
  localidad: string;
  provincia: string;
  codigosPostales: string[];

  // Servicios y especialidades
  operaVenta: boolean;
  operaAlquiler: boolean;
  operaHabitaciones: boolean;
  especialidades: string[];
  comisionMediaVenta?: string;
  comisionMediaAlquiler?: string;

  // Estado y verificación
  origen: 'REGISTRADA_EN_PLATAFORMA' | 'LOCALIZADA_EXTERNA';
  verificada: boolean;
  esPatrocinada: boolean;
  activo: boolean;

  createdAt: string;
  updatedAt?: string;
}

// Propuestas (RFP) emitidas por inmobiliarias para un expediente
export type EstadoPropuestaInmobiliaria = 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' | 'EXPIRADA';

export interface PropuestaInmobiliaria {
  id: string;
  expedienteId: string;
  inmuebleId: string;
  propietarioId: string; // Aislamiento
  inmobiliariaId: string;
  fechaPropuesta: string; // ISO
  honorariosPropuestos: string;
  plazoEstimadoDias: number;
  serviciosIncluidos: string[];
  estrategiaResumen: string;
  estado: EstadoPropuestaInmobiliaria;
  createdAt: string;
  updatedAt?: string;
}

// Lead/contacto de intermediación con una inmobiliaria
export type EstadoLeadInmobiliario =
  | 'SOLICITADO'
  | 'CONTACTADO'
  | 'ACUERDO_FIRMADO'
  | 'DESCARTADO';

export interface LeadInmobiliario {
  id: string;
  inmuebleId: string;
  propietarioId: string; // Aislamiento
  inmobiliariaId: string;
  fechaSolicitud: string; // ISO
  tipoOperacion: 'ALQUILER' | 'VENTA' | 'HABITACIONES';
  estado: EstadoLeadInmobiliario;
  notas?: string;
  createdAt: string;
  updatedAt?: string;
}

// ============================================================
// BLOQUE 4 — INCIDENCIAS, SEGUROS Y MANTENIMIENTO
// ============================================================

export type CategoriaIncidencia =
  | 'FONTANERIA'
  | 'ELECTRICIDAD'
  | 'CALEFACCION_ACS'
  | 'CERRAJERIA'
  | 'ELECTRODOMESTICOS'
  | 'HUMEDADES'
  | 'CARPINTERIA'
  | 'PINTURA'
  | 'CRISTALERIA'
  | 'PLAGAS_SANEAMIENTO'
  | 'LIMPIEZA'
  | 'OTROS';

export type PrioridadIncidencia = 'BAJA' | 'MEDIA' | 'NORMAL' | 'ALTA' | 'URGENTE';

export type EstadoIncidencia =
  | 'ABIERTA'
  | 'REGISTRADA'
  | 'REPORTADA'
  | 'EN_VALORACION'
  | 'PRESUPUESTOS'
  | 'ASIGNADA'
  | 'EN_REPARACION'
  | 'EN_CURSO'
  | 'RESUELTA'
  | 'CERRADA'
  | 'CANCELADA'
  | 'RECHAZADA';

export type OrigenIncidencia =
  | 'INQUILINO'
  | 'PROPIETARIO'
  | 'INSPECCION'
  | 'MANTENIMIENTO_PREVENTIVO'
  | 'REFORMA_ROI'
  | 'OTRO';

export type ResponsabilidadIncidencia =
  | 'PENDIENTE_DETERMINAR'
  | 'PROPIETARIO'
  | 'INQUILINO'
  | 'COMUNIDAD'
  | 'TERCERO'
  | 'INDETERMINADA';

export type EstadoSeguroIncidencia =
  | 'PENDIENTE_VERIFICACION'
  | 'NO_APLICA'
  | 'POSIBLE_COBERTURA'
  | 'SINIESTRO_APERTURADO'
  | 'RECHAZADO_ASEGURADORA'
  | 'INDEMNIZADO';

export type SeguroEstadoIncidencia = EstadoSeguroIncidencia;

export type ViaActuacionIncidencia =
  | 'PROFESIONAL_DIRECTO'
  | 'SEGURO'
  | 'COMUNIDAD'
  | 'INQUILINO_GESTIONA'
  | 'GARANTIA_CONSTRUCTOR';

export interface AdjuntoIncidencia {
  id: string;
  nombre: string;
  url: string;
  storagePath?: string;
  tipo?: 'IMAGEN' | 'VIDEO' | 'DOCUMENTO' | 'OTRO' | 'imagen' | 'video' | 'documento';
  fechaSubida: string; // ISO
  tamano?: number;
  tamanoBytes?: number;
  mimeType?: string;
  incidenciaId?: string;
  inmuebleId?: string;
  propietarioId?: string;
  trabajoId?: string;
  subidoPor?: string;
}

export interface FotoIncidencia {
  id: string;
  url: string;
  storagePath?: string;
  etiqueta?: string;
  fechaSubida: string; // ISO
}

export interface CausaIncidenciaIA {
  titulo: string;
  probabilidad: number; // 0-100
  explicacion: string;
  responsabilidadProbable: ResponsabilidadIncidencia;
}

export interface AnalisisIaIncidencia {
  id?: string;
  resumenPericial: string;
  gravedadEstimada: PrioridadIncidencia;
  causasPosibles: CausaIncidenciaIA[];
  actuacionesRecomendadas: string[];
  estimacionEconomica: {
    minimo: number;
    maximo: number;
    moneda: string;
  };
  evaluacionResponsabilidad: {
    responsableSugerido: ResponsabilidadIncidencia;
    argumentacionJuridicaLAU: string;
    articulosAplicables: string[];
  };
  evaluacionSeguro: {
    posibleCobertura: EstadoSeguroIncidencia;
    explicacion: string;
    ramoRecomendado?: string;
  };
  advertenciaLegal: string;
  fechaAnalisis: string;
  modeloUtilizado?: string;
  categoriaSugerida?: CategoriaIncidencia;
  prioridadSugerida?: PrioridadIncidencia;
  resumen?: string;
  posibleCausa?: string;
  actuacionesSugeridas?: string[];
  senalesAtencion?: string[];
  preguntasClave?: string[];
  motor?: 'ia' | 'heuristico';
  fecha?: string;
  evaluacionUrgencia?: string;
  urgenciaEstimada?: PrioridadIncidencia | string;
  posiblesCausas?: Array<string | { causa?: string; probabilidad?: string }>;
  informacionFaltante?: string[];
  recomendacionResponsabilidad?: string;
  fundamentoResponsabilidad?: string;
  estimacionCoberturaSeguro?: string;
  fundamentoSeguro?: string;
  resumenDiagnostico?: string;
  pasosRecomendados?: string[];
}

export type AnalisisIncidenciaIA = AnalisisIaIncidencia;
export type AnalisisIncidencia = AnalisisIaIncidencia;

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
  gastoId?: string; // ID del Gasto contable generado
  estadoTrabajo: 'ASIGNADO' | 'PRESUPUESTADO' | 'ACEPTADO' | 'EN_CURSO' | 'FINALIZADO' | 'CANCELADO';
  observaciones?: string;
}

export type TipoEventoIncidencia =
  | 'CREACION'
  | 'CAMBIO_ESTADO'
  | 'NOTA'
  | 'FOTO'
  | 'ANALISIS_IA'
  | 'PRESUPUESTO'
  | 'ASIGNACION'
  | 'RESOLUCION'
  | 'GASTO'
  | 'REAPERTURA';

export interface EventoIncidencia {
  id: string;
  fecha: string; // ISO
  tipo: TipoEventoIncidencia;
  autor?: string;
  descripcion: string;
}

export interface OrdenTrabajo {
  numero: string; // OT-YYYY-NNNN
  fechaEmision: string; // ISO
  profesionalId: string;
  fechaPrevista?: string; // ISO date
  instrucciones?: string;
}

export interface ResolucionIncidencia {
  fechaResolucion: string; // ISO
  descripcionTrabajo: string;
  aCargoDe: 'arrendador' | 'arrendatario';
  importeFinal?: number;
  deducibleIRPF?: boolean;
  proveedor?: string;
  gastoId?: string; // apunte contable generado en el cierre
}

export interface Incidencia {
  id: string;
  numero?: string; // INC-YYYY-NNNN
  propietarioId: string;
  inmuebleId: string;
  inmuebleDireccion?: string;
  inmuebleCiudad?: string;
  contratoId?: string;
  contratoIdsVisibles?: string[]; // BLOQUE E: contratos cuyos inquilinos pueden leer (get) esta incidencia
  inquilinoId?: string;
  inquilinoNombre?: string;
  inquilinoTelefono?: string;
  expedienteId?: string;
  mejoraOrigenId?: string;
  titulo: string;
  descripcion: string;
  categoria: CategoriaIncidencia;
  prioridad: PrioridadIncidencia;
  estado: EstadoIncidencia;
  origen: OrigenIncidencia;
  fechaCreacion?: string;
  fechaActualizacion?: string;
  fechaCompromiso?: string;
  fechaCierre?: string;
  responsabilidad?: ResponsabilidadIncidencia;
  responsabilidadNotas?: string;
  responsabilidadMotivo?: string;
  responsabilidadFechaDecision?: string;
  responsabilidadDecididoPor?: string;
  responsabilidadGarantiaRef?: string;
  seguroEstado?: EstadoSeguroIncidencia;
  seguroComprobacionNotas?: string;
  viaActuacion?: ViaActuacionIncidencia;
  polizaId?: string;
  siniestroId?: string;
  profesionalId?: string;
  presupuestoId?: string;
  profesionalAsignadoId?: string;
  profesionalAsignadoNombre?: string;
  fechaReporte?: string;
  reportadoPor?: string;
  origenReporte?: string;
  ordenTrabajo?: OrdenTrabajo;
  fechaInicioReparacion?: string;
  resolucion?: string | ResolucionIncidencia;
  observaciones?: string;
  notasInternas?: string;
  contactoNombre?: string;
  contactoTelefono?: string;
  creadoPor?: string;
  creadoPorId?: string;
  actualizadoPor?: string;
  fotografias?: AdjuntoIncidencia[];
  fotos?: FotoIncidencia[];
  documentos?: AdjuntoIncidencia[];
  analisisIa?: AnalisisIaIncidencia;
  inventarioId?: string; // Vinculación a elemento de inventario
  elementoInventarioId?: string;
  historial?: HistorialIncidenciaItem[];
  eventos?: EventoIncidencia[];
  trabajoProfesional?: TrabajoProfesionalIncidencia;
  presupuestos?: PresupuestoProfesional[];
  createdAt?: string;
  updatedAt?: string;
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
  | 'ELECTRODOMESTICOS'
  | 'OTRO';

export type EstadoPolizaSeguro =
  | 'VIGENTE'
  | 'VENCIDA'
  | 'CANCELADA'
  | 'EN_TRAMITE';

export type EstadoRenovacionPoliza =
  | 'VIGENTE'
  | 'PENDIENTE'
  | 'PENDIENTE_RENOVACION'
  | 'RENOVACION_SOLICITADA'
  | 'RENOVACION_RECIBIDA'
  | 'RENOVADA'
  | 'NO_RENOVADA'
  | 'SUSTITUIDA'
  | 'CANCELADA';

export type TipoDocumentoPoliza =
  | 'POLIZA_ORIGINAL'
  | 'POLIZA_RENOVACION'
  | 'CARTA_RENOVACION'
  | 'CONDICIONES_PARTICULARES'
  | 'RECIBO_PRIMA'
  | 'OTRO';

export interface DocumentoPoliza {
  id: string;
  nombre: string;
  url: string;
  storagePath?: string;
  tipo?: string;
  fechaSubida: string;
}

export interface DocumentoRenovacionPoliza {
  id: string;
  nombre: string;
  tipo: TipoDocumentoPoliza;
  url: string;
  storagePath?: string;
  fechaRecepcion: string; // YYYY-MM-DD fecha en que se recibió físicamente
  fechaSubida: string; // ISO
  subidoPor?: string;
  subidoPorId?: string;
  tamanoBytes?: number;
  mimeType?: string;
  observaciones?: string;
}

export interface HistorialPolizaItem {
  id: string;
  fecha: string; // ISO
  usuario: string; // nombre visible
  usuarioId?: string;
  accion:
    | 'CREACION'
    | 'COMPROBACION_RENOVACION'
    | 'RENOVACION_SOLICITADA'
    | 'RENOVACION_RECIBIDA'
    | 'RENOVACION_CONFIRMADA'
    | 'MODIFICACION'
    | 'SUSTITUCION'
    | 'CANCELACION'
    | 'NO_RENOVACION'
    | 'DOCUMENTO_ADJUNTADO'
    | 'COMPARACION_REALIZADA'
    | 'ESTADO_MODIFICADO'
    | 'ALERTA_GENERADA';
  detalle?: string;
  resultado?: string;
  observaciones?: string;
  estadoAnterior?: string;
  estadoNuevo?: string;
  datosAnteriores?: Partial<PolizaSeguro>;
  datosNuevos?: Partial<PolizaSeguro>;
}

export interface DatosExtraidosRenovacion {
  aseguradora?: string;
  numeroPoliza?: string;
  fechaInicio?: string;
  fechaVencimiento?: string;
  primaAnual?: number;
  coberturas?: string[];
  franquicia?: number;
  limites?: string;
  cambiosRelevantes?: string[];
  confianza: 'ALTA' | 'MEDIA' | 'BAJA';
  fechaExtraccion: string;
  confirmadoUsuario: boolean;
  confirmadoPor?: string;
  fechaConfirmacion?: string;
  observaciones?: string;
}

export interface ComparacionPoliza {
  id: string;
  polizaAnteriorId: string;
  polizaNuevaId: string;
  primaAnterior?: number;
  primaNueva?: number;
  diferenciaAbsoluta?: number;
  variacionPorcentual?: number;
  fechaInicioAnterior?: string;
  fechaInicioNueva?: string;
  fechaVencimientoAnterior?: string;
  fechaVencimientoNueva?: string;
  coberturasAnadidas: string[];
  coberturasEliminadas: string[];
  coberturasComunes: string[];
  franquiciaAnterior?: number;
  franquiciaNueva?: number;
  diferenciaFranquicia?: number;
  aumentoPrima: boolean;
  reduccionCobertura: boolean;
  aumentoFranquicia: boolean;
  modificacionLimites: boolean;
  observaciones?: string;
  fechaComparacion: string;
  generadoPor?: string;
  generadoPorId?: string;
}

export interface AlertaRenovacionPoliza {
  polizaId: string;
  polizaNumero: string;
  aseguradora: string;
  inmuebleId?: string;
  inmuebleDireccion?: string;
  propietarioId: string;
  fechaVencimiento: string;
  diasRestantes: number;
  nivelProximidad: 60 | 45 | 30 | 15 | 0 | -1; // 0 hoy, -1 vencida
  estadoRenovacion: EstadoRenovacionPoliza;
  tipoPoliza: TipoPolizaSeguro;
  primaAnual?: number;
  ultimaComprobacion?: string;
}

export interface PolizaSeguro {
  id: string;
  aseguradora: string;
  numeroPoliza: string;
  tipo: TipoPolizaSeguro;
  propietarioId: string;
  inmuebleId?: string;
  inmuebleDireccion?: string;
  fechaInicio: string; // YYYY-MM-DD
  fechaVencimiento: string; // YYYY-MM-DD
  estado: EstadoPolizaSeguro;
  coberturas: string[];
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

  // --- CIRCUITO DE RENOVACIÓN ARENA D ---
  estadoRenovacion?: EstadoRenovacionPoliza;
  fechaUltimaComprobacion?: string; // ISO
  usuarioUltimaComprobacion?: string;
  usuarioUltimaComprobacionId?: string;
  resultadoUltimaComprobacion?: string;
  observacionesRenovacion?: string;
  polizaAnteriorId?: string;
  polizaSiguienteId?: string;
  historial?: HistorialPolizaItem[];
  documentosRenovacion?: DocumentoRenovacionPoliza[];
  datosExtraidosRenovacion?: DatosExtraidosRenovacion;
  comparacionUltima?: ComparacionPoliza;
  comparacionesHistorial?: ComparacionPoliza[];
  fechaRecepcionRenovacion?: string; // YYYY-MM-DD
  primaAnterior?: number;
  alertaGenerada?: boolean;
  fechaAlertaGenerada?: string;
  nivelAlertaActual?: 60 | 45 | 30 | 15 | 0 | -1;
  diasRestantes?: number;
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
  remitente: string;
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
// BLOQUE 5: PROFESIONALES, SERVICIOS Y GESTIÓN DE TRABAJOS (OT & PRESUPUESTOS)
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

// =========================================================================
// MOTOR DE MATCHING Y COMPATIBILIDAD OPERATIVA DE PROFESIONALES
// =========================================================================

export type NivelCompatibilidad = 'COMPATIBLE' | 'COMPATIBLE_CON_RESERVA' | 'NO_COMPATIBLE';

export type EstadoZonaCompatibilidad =
  | 'MUNICIPIO_O_CP_EXACTO'
  | 'ZONA_COINCIDENTE'
  | 'PROVINCIAL'
  | 'ZONA_PROVINCIAL'
  | 'COBERTURA_GENERAL'
  | 'ZONA_NO_DETERMINADA'
  | 'FUERA_DE_ZONA';

export interface ResultadoCompatibilidadProfesional {
  profesional: Profesional;
  nivel: NivelCompatibilidad;
  cumpleEspecialidad: boolean;
  cumpleZona: boolean;
  cumpleEstado: boolean;
  estadoZona: EstadoZonaCompatibilidad;
  especialidadEvaluada?: EspecialidadCodigo | string;
  servicioEvaluado?: string;
  motivo: string;
  detalles: {
    especialidad: string;
    zona: string;
    estado: string;
  };
}

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
    | 'PROFESIONAL_CAMBIADO'
    | 'PROFESIONAL_REASIGNADO'
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
  profesionalAnteriorId?: string;
  profesionalNuevoId?: string;
  motivo?: string;
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
  proyectoId?: string; // Vinculación a Proyecto de Reforma si procede
  partidaId?: string; // Partida específica de reforma si procede
  profesionalId?: string;
  profesionalNombre?: string;
  profesionalTelefono?: string;
  profesionalEmail?: string;
  titulo: string;
  descripcion: string;
  categoria: string; // Especialidad o tipo de servicio
  servicioRequerido?: string; // Servicio específico identificado
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
  gastoId?: string; // ID del Gasto contable generado a partir de este trabajo
  inventarioId?: string; // Vinculación a elemento de inventario
  elementoInventarioId?: string;
  inventarioNombre?: string;
  inventarioUbicacion?: string;
  observaciones?: string;
  creadoPor: string;
  actualizadoPor: string;
  fotos?: AdjuntoIncidencia[] | string[];
  adjuntos?: AdjuntoIncidencia[] | any[];
  documentos?: AdjuntoIncidencia[];
  historial: HistorialTrabajoItem[];
  valoracion?: ValoracionProfesionalTrabajo;
  createdAt: string;
  updatedAt: string;
}

// =========================================================================
// PRESUPUESTOS DE PROFESIONALES (CIRCUITO COMPLETO DE REVISIÓN Y AJUSTES)
// =========================================================================

export type EstadoPresupuestoProfesional =
  | 'BORRADOR'
  | 'RECIBIDO'
  | 'EN_REVISION'
  | 'EN_NEGOCIACION'
  | 'ACEPTADO'
  | 'RECHAZADO'
  | 'CADUCADO';

export type EstadoPresupuesto = EstadoPresupuestoProfesional;

export type CategoriaMotivoAjuste =
  | 'PRECIO'
  | 'ALCANCE'
  | 'MATERIALES'
  | 'PARTIDAS'
  | 'CANTIDADES'
  | 'PLAZO'
  | 'DOCUMENTACION'
  | 'OTRO';

export type AccionHistorialPresupuesto =
  | 'CREACION'
  | 'PRESENTACION'
  | 'EN_REVISION'
  | 'SOLICITUD_AJUSTE'
  | 'MODIFICACION'
  | 'REENVIO'
  | 'APROBACION'
  | 'RECHAZO'
  | 'CAMBIO_ESTADO';

export interface PartidaPresupuesto {
  id: string;
  concepto: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
}

export interface HistorialDecisionPresupuesto {
  id?: string;
  fecha: string;
  usuario: string;
  usuarioId?: string;
  accion?: AccionHistorialPresupuesto;
  estadoAnterior: EstadoPresupuestoProfesional;
  estadoNuevo: EstadoPresupuestoProfesional;
  categoriaMotivo?: CategoriaMotivoAjuste | string;
  motivo?: string;
  observaciones?: string;
  version?: number;
  importeTotal?: number;
  partidasSnapshot?: PartidaPresupuesto[];
}

export interface PresupuestoProfesional {
  id: string;
  numeroPresupuesto?: string;
  trabajoId: string;
  proyectoId?: string; // Vinculación a Proyecto de Reforma si procede
  partidaId?: string; // Partida específica si procede
  profesionalId: string;
  profesionalNombre?: string;
  propietarioId: string;
  inmuebleId: string;
  inmuebleDireccion?: string;
  incidenciaId?: string;
  fecha: string; // ISO
  importeBase: number;
  iva: number; // importe de IVA calculado
  porcentajeIva?: number; // Ej: 21, 10, 0
  importeTotal: number;
  validez: string; // Ej: "30 días" o fecha límite
  descripcion: string;
  partidas: PartidaPresupuesto[];
  estado: EstadoPresupuestoProfesional;
  version?: number; // 1, 2, 3...
  
  // Solicitud de Ajuste / Negociación
  categoriaAjuste?: CategoriaMotivoAjuste | string;
  motivoAjuste?: string;
  fechaSolicitudAjuste?: string;
  solicitadoAjustePor?: string;
  
  // Decisión definitiva (SÓLO para ACEPTADO o RECHAZADO)
  motivoRechazo?: string;
  fechaDecision?: string;
  fechaPresupuesto?: string;
  fechaAceptacion?: string;
  decididoPor?: string;
  
  documentoUrl?: string;
  documentoStoragePath?: string;
  observaciones?: string;
  
  historialDecision?: HistorialDecisionPresupuesto[];
  
  creadoPor?: string;
  actualizadoPor?: string;
  createdAt: string;
  updatedAt: string;
  
  // Propiedades opcionales de compatibilidad legacy
  fechaSolicitud?: string;
  fechaRespuesta?: string;
  importeEstimado?: number;
  importePresupuestado?: number;
  plazoDias?: number;
}

// =========================================================================
// MANTENIMIENTO PREVENTIVO, GARANTÍAS Y SEGUIMIENTO POST-REPARACIÓN
// =========================================================================

export type TipoMantenimiento =
  | 'PREVENTIVO'
  | 'CORRECTIVO'
  | 'GARANTIA'
  | 'REVISION'
  | 'LEGAL_OBLIGATORIO'
  | 'INSTALACIONES_CLIMA'
  | 'OTRO';

export type PeriodicidadMantenimiento =
  | 'PUNTUAL'
  | 'UNICA'
  | 'MENSUAL'
  | 'BIMESTRAL'
  | 'TRIMESTRAL'
  | 'SEMESTRAL'
  | 'ANUAL'
  | 'BIENAL'
  | 'QUINQUENAL'
  | 'PERSONALIZADA';

export type EstadoSeguimientoMantenimiento =
  | 'ACTIVO'
  | 'FUTURO'
  | 'PROXIMO'
  | 'VENCIDO'
  | 'EN_CURSO'
  | 'COMPLETADO'
  | 'CANCELADO'
  | 'INACTIVO';

export interface ActuacionMantenimientoHistorial {
  id: string;
  fecha: string; // ISO
  fechaRealizacion: string; // ISO date
  ordenTrabajoId?: string;
  profesionalId?: string;
  profesionalNombre?: string;
  costeReal?: number;
  gastoId?: string;
  observaciones?: string;
  realizadoPor?: string;
}

export interface DocumentoMantenimiento {
  id: string;
  nombre: string;
  url: string;
  storagePath?: string;
  fechaSubida: string;
  tipo?: string;
}

export interface TareaMantenimiento {
  id: string; // "mant_{inmuebleId}_{ts}"
  inmuebleId: string;
  inmuebleDireccion?: string;
  propietarioId: string; // Aislamiento
  elementoInventarioId?: string; // Vinculación opcional a elemento de inventario
  elementoNombre?: string;
  titulo: string;
  descripcion?: string;
  tipo?: TipoMantenimiento;
  categoria?: CategoriaIncidencia;
  periodicidad: PeriodicidadMantenimiento;
  diasIntervaloPersonalizado?: number;
  
  // Fechas deterministas
  fechaInicio?: string; // ISO
  ultimaFecha?: string; // ISO date de la última realización (compatibilidad legacy)
  ultimaFechaRealizada?: string; // ISO date
  proximaFecha: string; // ISO date calculada
  
  // Responsable y asignación
  responsableTipo?: 'PROPIETARIO' | 'INQUILINO' | 'COMUNIDAD' | 'EMPRESA_MANTENIMIENTO';
  profesionalPreferidoId?: string;
  profesionalPreferidoNombre?: string;
  preferredProfessionalId?: string;
  preferredProfessionalName?: string;
  
  // Estado y seguimiento
  activa: boolean;
  activo?: boolean;
  estadoSeguimiento?: EstadoSeguimientoMantenimiento;
  costeEstimado?: number;
  ultimoCosteReal?: number;
  
  // Relaciones con OT, Incidencia y Gasto
  ultimaOrdenTrabajoId?: string;
  ultimoPresupuestoId?: string;
  ultimoGastoId?: string;
  ultimaIncidenciaId?: string;
  garantiaId?: string;
  
  historialActuaciones?: ActuacionMantenimientoHistorial[];
  documentos?: DocumentoMantenimiento[];
  notas?: string;
  creadoPor?: string;
  createdAt: string;
  updatedAt: string;
}

export type PlanMantenimiento = TareaMantenimiento;

export type EstadoGarantia = 'ACTIVA' | 'VENCIDA' | 'SIN_GARANTIA' | 'RECLAMADA';

export interface GarantiaReparacion {
  id: string; // "gar_{inmuebleId}_{ts}"
  inmuebleId: string;
  inmuebleDireccion?: string;
  propietarioId: string;
  trabajoId: string; // OT de origen
  incidenciaId?: string;
  presupuestoId?: string;
  gastoId?: string;
  elementoInventarioId?: string;
  elementoNombre?: string;
  
  titulo: string;
  concepto: string;
  categoria: CategoriaIncidencia;
  
  proveedor: string; // Profesional o empresa emisora
  profesionalId?: string;
  profesionalContacto?: string;
  
  fechaInicio: string; // ISO date (YYYY-MM-DD o ISO)
  duracionMeses: number; // Ej: 6, 12, 24
  fechaFin: string; // ISO date
  
  cobertura: string;
  documentoUrl?: string;
  documentoStoragePath?: string;
  facturaRef?: string;
  
  estado: EstadoGarantia;
  notas?: string;
  
  reincidencias?: {
    incidenciaId: string;
    fecha: string;
    resultado: string;
  }[];
  
  creadoPor?: string;
  createdAt: string;
  updatedAt: string;
}

// =========================================================================
// CIRCUITO OPERATIVO DE REFORMAS (NECESIDAD -> PROYECTO -> PARTIDAS -> CIERRE)
// =========================================================================

export type CategoriaReforma =
  | 'INTEGRAL'
  | 'COCINA'
  | 'BANO'
  | 'SUELOS'
  | 'PINTURA'
  | 'CLIMATIZACION'
  | 'ELECTRICIDAD'
  | 'FONTANERIA'
  | 'CARPINTERIA'
  | 'FACHADA_EXTERIOR'
  | 'PARCIAL'
  | 'OTRO';

export type EstadoNecesidadReforma =
  | 'BORRADOR'
  | 'IDENTIFICADA'
  | 'EN_ESTUDIO'
  | 'PRESUPUESTANDO'
  | 'APROBADA'
  | 'EN_EJECUCION'
  | 'FINALIZADA'
  | 'CANCELADA';

export interface NecesidadReforma {
  id: string; // "nec_ref_{inmuebleId}_{ts}"
  inmuebleId: string;
  inmuebleDireccion?: string;
  propietarioId: string; // Aislamiento RBAC
  incidenciaId?: string; // Vinculación opcional a incidencia origen
  expedienteId?: string; // Vinculación opcional a expediente de recomercialización
  mejoraRoiId?: string; // Vinculación opcional a mejora ROI sugerida
  
  titulo: string;
  descripcion: string;
  prioridad: PrioridadIncidencia;
  estado: EstadoNecesidadReforma;
  categoria: CategoriaReforma | string;
  tipoReforma?: string;
  
  presupuestoEstimadoMin?: number;
  presupuestoEstimadoMax?: number;
  observaciones?: string;
  fotos?: string[] | any[];
  documentos?: any[];
  
  proyectoReformaId?: string; // ID del ProyectoReforma creado al aprobar
  fechaIdentificacion?: string; // ISO
  fecha: string; // ISO
  creadoPor?: string;
  createdAt: string;
  updatedAt: string;
}

export type CategoriaPartidaReforma =
  | 'ALBANILERIA'
  | 'ELECTRICIDAD'
  | 'FONTANERIA'
  | 'PINTURA'
  | 'CARPINTERIA'
  | 'CLIMATIZACION'
  | 'COCINA'
  | 'BANO'
  | 'SUELO'
  | 'VENTANAS'
  | 'DERRIBOS'
  | 'AISLAMIENTO'
  | 'OTROS'
  | string;

export type EstadoPartidaReforma =
  | 'PENDIENTE'
  | 'PRESUPUESTADA'
  | 'EN_EJECUCION'
  | 'EJECUTADA'
  | 'CANCELADA';

export interface PartidaReforma {
  id: string; // "part_{ts}_{random}"
  proyectoId?: string;
  concepto: string;
  descripcion?: string;
  categoria: CategoriaPartidaReforma;
  cantidad: number;
  unidad: string; // "m2", "ud", "ml", "paquete", "h", "global", etc.
  precioEstimado: number; // Precio unitario estimado
  importeEstimado: number; // cantidad * precioEstimado
  precioReal?: number; // Precio unitario real liquidado
  importeReal?: number; // Importe real final
  profesionalId?: string; // Profesional asignado a esta partida
  profesionalNombre?: string;
  ordenTrabajoId?: string; // OT técnica específica generada
  estado: EstadoPartidaReforma;
  observaciones?: string;
}

export type EstadoProyectoReforma =
  | 'PENDIENTE'
  | 'PRESUPUESTANDO'
  | 'ADJUDICADO'
  | 'ASIGNADO'
  | 'EN_EJECUCION'
  | 'PAUSADO'
  | 'PAUSADA'
  | 'FINALIZADO'
  | 'FINALIZADA'
  | 'CANCELADO'
  | 'CANCELADA';

export type AccionHistorialProyectoReforma =
  | 'PROYECTO_CREADO'
  | 'PARTIDA_ANADIDA'
  | 'PARTIDA_MODIFICADA'
  | 'PARTIDA_ELIMINADA'
  | 'PRESUPUESTO_SOLICITADO'
  | 'PRESUPUESTO_RECIBIDO'
  | 'PRESUPUESTO_SELECCIONADO'
  | 'PROFESIONAL_ASIGNADO'
  | 'PROFESIONAL_CAMBIADO'
  | 'EJECUCION_INICIADA'
  | 'PAUSADO'
  | 'REANUDADO'
  | 'OT_GENERADA'
  | 'COSTE_REGISTRADO'
  | 'GASTO_GENERADO'
  | 'PROYECTO_FINALIZADO'
  | 'PROYECTO_CANCELADO'
  | 'CIERRE_PATRIMONIAL'
  | 'NOTA_AUDITORIA';

export interface HistorialProyectoReformaItem {
  id: string;
  fecha: string; // ISO
  usuario: string;
  usuarioId?: string;
  accion: AccionHistorialProyectoReforma;
  estadoAnterior?: EstadoProyectoReforma | string;
  estadoNuevo?: EstadoProyectoReforma | string;
  profesionalId?: string;
  presupuestoId?: string;
  partidaId?: string;
  ordenTrabajoId?: string;
  gastoId?: string;
  importe?: number;
  motivo?: string;
  observacion?: string;
}

export interface ResumenCierreReforma {
  fechaCierre: string; // ISO
  presupuestoInicial: number;
  presupuestoSeleccionado: number;
  costeRealFinal: number;
  desviacionTotal: number; // costeRealFinal - presupuestoSeleccionado
  desviacionPorcentaje: number;
  gastosGeneradosTotal: number;
  numPartidasEjecutadas: number;
  numOTsCompletadas: number;
  profesionalesParticipantes: { id: string; nombre: string; partidas?: string[] }[];
  observacionesCierre?: string;
  cerradoPor: string;
}

export interface ImpactoPatrimonialReforma {
  costeTotalReforma: number;
  gastoAsociadoId?: string;
  fechaCierreReforma: string;
  inmuebleId: string;
  
  // Observación neutral de valoración (sin causalidad económica inventada)
  valoracionPreviaInmueble?: number;
  fechaValoracionPrevia?: string;
  valoracionPosteriorInmueble?: number;
  fechaValoracionPosterior?: string;
  variacionValoracion?: number; // valoracionPosterior - valoracionPrevia (informativo)
  notas?: string;
}

export interface ProyectoReforma {
  id: string; // "proj_ref_{inmuebleId}_{ts}"
  inmuebleId: string;
  inmuebleDireccion?: string;
  propietarioId: string; // Aislamiento RBAC
  necesidadId?: string; // Necesidad de reforma origen
  incidenciaId?: string; // Incidencia origen si existió
  expedienteId?: string; // Expediente de recomercialización origen si existió
  
  titulo: string;
  descripcion: string;
  alcance?: string;
  categoria: CategoriaReforma | string;
  tipoReforma?: string;
  
  fechaPrevistaInicio?: string; // ISO
  fechaPrevistaFin?: string; // ISO
  fechaRealInicio?: string; // ISO
  fechaRealFin?: string; // ISO
  fechaCierre?: string; // ISO
  
  estado: EstadoProyectoReforma;
  prioridad?: PrioridadIncidencia;
  
  partidas: PartidaReforma[];
  presupuestoPrevisto: number; // Suma importes estimados de partidas
  presupuestoAdjudicadoId?: string; // ID del presupuesto seleccionado
  presupuestoAdjudicadoImporte?: number;
  costeReal: number; // Suma costes reales liquidados
  desviacionCoste?: number; // costeReal - presupuestoPrevisto / presupuestoAdjudicado
  
  profesionalPrincipalId?: string;
  profesionalPrincipalNombre?: string;
  profesionalesAsignados?: {
    profesionalId: string;
    nombre: string;
    especialidad?: string;
    partidaId?: string;
  }[];
  
  ordenesTrabajoIds?: string[];
  presupuestosIds?: string[];
  gastosIds?: string[];
  
  documentos?: AdjuntoIncidencia[] | any[];
  fotosAntes?: string[];
  fotosDurante?: string[];
  fotosDespues?: string[];
  
  resumenCierre?: ResumenCierreReforma;
  impactoPatrimonial?: ImpactoPatrimonialReforma;
  
  historial: HistorialProyectoReformaItem[];
  creadoPor?: string;
  actualizadoPor?: string;
  createdAt: string;
  updatedAt: string;
}

// =========================================================================
// BLOQUE 9: REPORTING EJECUTIVO - INFORMES CARTERA, INMUEBLE, RENTABILIDAD, FISCAL, EVOLUCIÓN, EXPORTACIÓN
// Capa de lectura/agregación que consume motores existentes (cobros, gastos, fiscal, contratos, incidencias, seguros)
// NO crea segundo motor económico, NO segundo cálculo de rentabilidad, NO segundo motor fiscal
// =========================================================================

export type PeriodoInforme = 'MENSUAL' | 'TRIMESTRAL' | 'ANUAL' | 'PERSONALIZADO';
export type FormatoExportacion = 'CSV' | 'JSON' | 'PDF';

export interface RangoFechas {
  fechaInicio: string; // YYYY-MM-DD explícito, evita errores zona horaria
  fechaFin: string; // YYYY-MM-DD explícito
  periodo: PeriodoInforme;
  ejercicio?: number;
  trimestre?: number; // 1-4
  mes?: number; // 1-12
}

export interface FiltrosInforme {
  propietarioId?: string;
  inmuebleId?: string;
  habitacionId?: string;
  rango: RangoFechas;
  incluirHabitaciones?: boolean;
  categoriaGasto?: string;
  estadoContrato?: string;
}

export interface InformePatrimonio {
  numeroInmuebles: number;
  numeroHabitaciones: number;
  inmueblesOcupados: number;
  inmueblesVacios: number;
  inmueblesParcialmenteOcupados: number;
  contratosActivos: number;
  contratosProximosFinalizar: number; // próximos 60 días
  superficieTotal: number;
  valorAdquisicionTotal: number;
  valoracionEstimadaTotal: number;
}

export interface InformeEconomia {
  ingresosTotales: number; // cobrados
  ingresosPrevistos: number; // contractuales
  ingresosPendientes: number;
  gastosTotales: number;
  gastosDeducibles: number;
  resultado: number; // ingresos - gastos deducibles
  rentabilidadBruta?: number; // % si se puede calcular con datos existentes
  rentabilidadNeta?: number;
  rentabilidadEstimada?: number; // reutiliza definición existente
  cobrosRealizados: number;
  cobrosPendientes: number;
  cobrosVencidos: number;
  cobrosImpagados: number;
  deudaPendiente: number;
  formulaRentabilidad: string; // documenta fórmula usada
}

export interface InformeOperativa {
  incidenciasAbiertas: number;
  incidenciasCerradas: number;
  incidenciasUrgentes: number;
  siniestrosAbiertos: number;
  siniestrosCerrados: number;
  polizasActivas: number;
  polizasProximasVencer: number;
  trabajosPendientes: number;
  trabajosEnCurso: number;
}

export interface InformeOcupacion {
  diasAlquilados: number;
  diasVacios: number;
  porcentajeOcupacion: number; // 0-100
  mesesOcupados: number;
  mesesVacios: number;
  numInquilinosUnicos: number;
  numContratos: number;
  definicionOcupacion: string; // reutiliza definición módulos actuales
}

export interface EvolucionTemporalItem {
  periodo: string; // ej "2025-01", "2025-T1", "2025"
  fechaInicio: string;
  fechaFin: string;
  ingresos: number;
  gastos: number;
  resultado: number;
  ocupacion: number;
  numContratos: number;
}

export interface InformeCartera {
  id: string;
  propietarioId: string;
  propietarioNombre?: string;
  rango: RangoFechas;
  fechaGeneracion: string;
  moneda: 'EUR';
  versionEsquema: string; // ej "1.0.0"
  patrimonio: InformePatrimonio;
  economia: InformeEconomia;
  operativa: InformeOperativa;
  ocupacion: InformeOcupacion;
  evolucion: EvolucionTemporalItem[];
  // Para extensión notificaciones GAP 1
  eventoExtension?: 'INFORME_GENERADO';
}

export interface InformeContratoDetalle {
  contratoId: string;
  inmuebleId: string;
  inquilinoNombre: string;
  modalidad: string; // vivienda habitual, temporada, local, habitación
  estado: EstadoFormalizacion;
  fechaInicio: string;
  fechaFin?: string;
  rentaMensual: number;
  diasOcupadosPeriodo: number;
  ingresosPeriodo: number;
  esProximoFinalizar: boolean;
  habitacionId?: string;
}

export interface InformeInmueble {
  id: string;
  propietarioId: string;
  inmuebleId: string;
  inmuebleDireccion: string;
  inmuebleCiudad: string;
  tipoInmueble?: string;
  modalidadAlquiler?: string;
  rango: RangoFechas;
  fechaGeneracion: string;
  moneda: 'EUR';
  versionEsquema: string;
  datosBasicos: {
    direccion: string;
    ciudad: string;
    superficie: number;
    habitaciones: number;
    banos: number;
    valorAdquisicion?: number;
    fechaAdquisicion?: string;
  };
  contratos: InformeContratoDetalle[];
  ocupacion: InformeOcupacion;
  economia: InformeEconomia;
  incidencias: {
    abiertas: number;
    cerradas: number;
    lista: { id: string; titulo: string; estado: string; categoria: string; fecha: string }[];
  };
  seguros: {
    polizasActivas: number;
    lista: { id: string; aseguradora: string; numeroPoliza: string; tipo: string; vencimiento: string }[];
  };
  gastos: {
    total: number;
    porCategoria: Record<string, number>;
    lista: { id: string; fecha: string; concepto: string; importe: number; categoria: string }[];
  };
  ingresos: {
    totalCobrado: number;
    totalPrevisto: number;
    lista: { periodo: string; previsto: number; cobrado: number; estado: string }[];
  };
  habitaciones?: {
    id: string;
    identificador: string;
    ocupada: boolean;
    ingresos: number;
  }[];
  inventario?: string;
  periodosPendientes: { periodo: string; importe: number; estado: string }[];
}

export interface InformeRentabilidad {
  id: string;
  propietarioId: string;
  inmuebleId?: string;
  rango: RangoFechas;
  fechaGeneracion: string;
  moneda: 'EUR';
  versionEsquema: string;
  ingresos: number;
  gastos: number;
  resultado: number;
  rentabilidadBruta?: number;
  rentabilidadNeta?: number;
  rentabilidadEstimada: number;
  formula: string; // documenta fórmula exacta reutilizada
  definicionesDisponibles: string[]; // si existen varias definiciones legítimas
  detallePorInmueble?: { inmuebleId: string; direccion: string; ingresos: number; gastos: number; resultado: number; rentabilidad: number }[];
}

export interface InformeFiscal {
  id: string;
  propietarioId: string;
  rango: RangoFechas;
  fechaGeneracion: string;
  moneda: 'EUR';
  versionEsquema: string;
  ejercicio: number;
  agrupacion: 'PROPIETARIO' | 'INMUEBLE' | 'EJERCICIO' | 'CONCEPTO';
  totalIngresos: number;
  totalGastos: number;
  totalGastosDeducibles: number;
  totalResultado: number;
  porInmueble: {
    inmuebleId: string;
    direccion: string;
    ingresos: number;
    gastos: number;
    gastosDeducibles: number;
    resultado: number;
    categorias: Record<string, number>;
  }[];
  porCategoria?: Record<string, number>;
  categoriasFiscalesConservadas: boolean;
  notaAEAT: string; // "Exportación fiscal estructurada compatible con procesos posteriores..."
}

export interface ExportacionFiscalItem {
  propietarioId: string;
  propietarioNombre?: string;
  inmuebleId: string;
  inmuebleDireccion: string;
  ejercicio: number;
  periodo: string; // YYYY-MM o YYYY
  concepto: string;
  fecha: string; // YYYY-MM-DD
  importe: number;
  categoria: string;
  tipo: 'INGRESO' | 'GASTO' | 'AMORTIZACION' | 'INTERES';
  referenciaId: string; // id cobro, gasto, etc.
  origen: string; // 'COBRO' | 'GASTO' | 'FISCAL' | etc.
  moneda: 'EUR';
  ejercicioFiscal?: number;
  esDeducible?: boolean;
}

export interface ExportacionFiscalEstructurada {
  id: string;
  propietarioId: string;
  rango: RangoFechas;
  fechaGeneracion: string;
  versionEsquema: string;
  formato: FormatoExportacion;
  items: ExportacionFiscalItem[];
  nota: string; // Exportación fiscal estructurada compatible...
  totalIngresos: number;
  totalGastos: number;
  totalResultado: number;
}

export interface HistorialInformeGenerado {
  id: string;
  propietarioId: string;
  tipo: 'CARTERA' | 'INMUEBLE' | 'RENTABILIDAD' | 'FISCAL' | 'EXPORTACION';
  formato?: FormatoExportacion;
  rango: RangoFechas;
  fechaGeneracion: string;
  generadoPor: string;
  inmuebleId?: string;
  numInmuebles?: number;
  eventoExtension?: 'INFORME_GENERADO' | 'EXPORTACION_GENERADA';
}

// ==========================================
// GAP 5: SINDICACIÓN Y PUBLICACIÓN MULTICANAL DE INMUEBLES
// Capa desacoplada: DATOS ERP → MODELO NORMALIZADO → VALIDADOR → GENERADOR → FEED
// ==========================================

export type PortalInmobiliario = 'IDEALISTA' | 'FOTOCASA' | 'HABITACLIA' | 'KYERO';

export type FormatoFeedPublicacion = 'XML_GENERICO' | 'XML_KYLERO' | 'JSON_NORMALIZADO' | 'JSON_LD';

/**
 * Estado de publicación POR PORTAL. Independiente del estado interno del inmueble
 * ('disponible' | 'alquilado'): un inmueble puede estar publicado en un portal y no en otro.
 */
export type EstadoPublicacionPortal =
  | 'BORRADOR'
  | 'VALIDADO'
  | 'LISTO_PARA_PUBLICAR'
  | 'PUBLICADO'
  | 'ACTUALIZADO'
  | 'DESPUBLICADO'
  | 'ERROR';

/** Imagen normalizada para publicación (URL de Firebase Storage; nunca base64 en Firestore). */
export interface ImagenPublicacion {
  url: string;
  orden: number;
  portada: boolean;
  estadoPublicacion?: 'PENDIENTE' | 'PUBLICADA' | 'RECHAZADA';
}

/** Habitación publicable dentro de un inmueble en modalidad habitaciones (solo lectura del circuito). */
export interface HabitacionPublicacion {
  habitacionId: string;
  nombre: string;
  descripcion?: string;
  superficieM2?: number;
  precioMensual?: number;
  disponible: boolean;
}

/** Modelo normalizado de publicación: única fuente para validadores, generadores y adaptadores. */
export interface PublicacionInmueble {
  // Identificación
  inmuebleId: string;
  idPublico: string; // identificador público estable del inmueble
  referenciaInterna: string; // referencia interna del ERP
  propietarioId?: string;
  // Ubicación
  direccion: string;
  municipio: string;
  provincia?: string;
  codigoPostal?: string;
  coordenadas?: { latitud: number; longitud: number };
  // Características
  tipoInmueble?: string;
  modalidadAlquiler: 'completo' | 'habitaciones';
  superficieM2?: number;
  habitaciones?: number;
  banos?: number;
  planta?: string;
  ascensor?: boolean;
  terraza?: boolean;
  balcon?: boolean;
  garaje?: boolean;
  trastero?: boolean;
  aireAcondicionado?: boolean;
  calefaccion?: boolean;
  // Económico
  precioMensual: number;
  fianzaMeses?: number;
  tipoOperacion: 'ALQUILER';
  // Descripción
  titulo: string;
  descripcion?: string;
  caracteristicas: string[];
  // Imágenes (Storage URLs, orden y portada)
  imagenes: ImagenPublicacion[];
  // Habitaciones (solo modalidad 'habitaciones'; no altera el circuito actual)
  habitacionesPublicables?: HabitacionPublicacion[];
  // Generación (determinista: mismo dato → mismo resultado)
  generadoEn?: string; // ISO opcional, solo si el llamador lo aporta explícitamente
}

export interface ValidacionPublicacion {
  valido: boolean; // true si no hay errores bloqueantes (puede haber advertencias)
  erroresBloqueantes: string[];
  advertencias: string[];
}

/** Identidad estable por inmueble + portal (idempotencia: actualizar no duplica anuncios). */
export interface EstadoSindicacionPortal {
  portal: PortalInmobiliario;
  externalId: string; // derivado determinista de inmuebleId + portal
  estado: EstadoPublicacionPortal;
  ultimaSincronizacion?: string; // ISO
  ultimoError?: string;
}

/** Trazabilidad de generación/exportación (sin credenciales ni secretos). */
export interface RegistroTrazabilidadPublicacion {
  inmuebleId: string;
  idPublico: string;
  portal: PortalInmobiliario | 'EXPORTACION_DIRECTA';
  formato: FormatoFeedPublicacion;
  fecha: string; // ISO
  externalId?: string;
  resultado: 'OK' | 'ERROR';
  errores: string[];
  advertencias: string[];
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
