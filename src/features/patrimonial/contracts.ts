/**
 * Contratos locales de presentación basados en D1/D1R.
 * No son esquemas persistentes, identidades autenticadas ni autorizaciones.
 */
export const MODALIDADES_USO = [
  'PROPIETARIO',
  'GESTOR_PROPIETARIO',
  'GESTOR_PROFESIONAL',
] as const;
export type ModalidadUso = (typeof MODALIDADES_USO)[number];

export const ESTADOS_ACCESO = ['SIN_CUENTA', 'INVITADO', 'ACTIVO'] as const;
export type EstadoAcceso = (typeof ESTADOS_ACCESO)[number];

/** Campos ya presentes en la ficha actual. Todos salvo el nombre pueden quedar vacíos. */
export interface BorradorPropietario {
  readonly nombre: string;
  readonly nifCif: string;
  readonly email: string;
  readonly telefono: string;
}

/** Referencia informativa: no adjudica ni cambia la titularidad. */
export interface ReferenciaInmueble {
  readonly id: string;
  readonly nombre: string;
}

export interface ReferenciaPropietario extends BorradorPropietario {
  readonly id: string;
  readonly estadoAcceso: EstadoAcceso;
  /** null significa que no se aporta una cuenta vinculada; INVITADO no implica tenerla. */
  readonly cuentaId: string | null;
  /** Admite cero o varias referencias; no representa facultades de gestión. */
  readonly inmuebles: readonly ReferenciaInmueble[];
}

/** Solo selección de destino. No contiene datos a importar ni ejecuta una importación. */
export interface SeleccionDestinoImportacion {
  readonly propietarioDestinoId: string;
}

/**
 * Puntos de extensión de UX. Las operaciones reales siguen sin implementación.
 * Son solicitudes de UX, nunca concesiones de acceso o cambios de estado automáticos.
 * La integración futura deberá resolver identidad, autorización y resultados fuera de la UI.
 */
export interface SolicitudesPatrimonialesFuturas {
  readonly onSolicitarInvitacion?: (propietarioId: string) => void;
  readonly onSolicitarActivacion?: (propietarioId: string) => void;
  readonly onSeleccionarDestinoImportacion?: (destino: SeleccionDestinoImportacion) => void;
  readonly onSolicitarRevisionDatos?: (propietarioId: string) => void;
}

/** Extensión genérica conservada; la evaluación contextual se define más abajo. */
export type EvaluadorCompletitudFuturo<Resultado> = (
  borrador: Readonly<BorradorPropietario>,
) => Resultado;

// Evaluación contextual: nunca se incorpora automáticamente a una ficha persistente.
export const ESTADOS_DATOS = ['COMPLETO', 'INCOMPLETO', 'BLOQUEADO'] as const;
export type EstadoDatos = (typeof ESTADOS_DATOS)[number];

export interface MotivoRevision {
  readonly codigo: string;
  readonly mensaje: string;
  readonly campo?: string;
}

export interface IncidenciaRevision extends MotivoRevision {
  readonly nivel: 'REVISION' | 'BLOQUEO';
  readonly indiceOrigen?: number;
}

/** Política resuelta por el consumidor para ESTA ficha/registro, no una lista universal. */
export interface PoliticaCompletitud {
  readonly id: string;
  /** Claves de primer nivel. Solo comprueba presencia; no validez fiscal/documental. */
  readonly camposRequeridos: readonly string[];
}

export interface EvaluacionDatos {
  readonly estadoDatos: EstadoDatos;
  readonly camposFaltantes: string[];
  readonly politicaId: string | null;
  readonly incidencias: readonly IncidenciaRevision[];
}

export interface ReglasRevisionDatos {
  readonly politica: PoliticaCompletitud | null;
  /** Motivos explícitos suministrados desde fuera; jamás derivados del acceso. */
  readonly bloqueos?: readonly MotivoRevision[];
  readonly revisiones?: readonly MotivoRevision[];
}

export type ValorOrigen = string | number | boolean | null
  | readonly ValorOrigen[] | { readonly [campo: string]: ValorOrigen };
export type DatosOrigenImportacion = Readonly<Record<string, ValorOrigen>>;

/** El importador futuro debe recibir siempre destino explícito. No incluye permisos. */
export interface SolicitudImportacionPatrimonial extends SeleccionDestinoImportacion {
  readonly datosOrigen: readonly DatosOrigenImportacion[];
}

/** En la revisión se admite null, pero jamás se suple automáticamente el destino. */
export interface SolicitudPrevisualizacion {
  readonly datosOrigen: readonly DatosOrigenImportacion[];
  readonly propietarioDestinoId: string | null;
}

export interface ContextoDestinoImportacion {
  readonly propietarios: readonly Pick<ReferenciaPropietario, 'id' | 'nombre'>[];
  /** Snapshot externo para planificar. No es una autorización efectiva. */
  readonly propietariosPermitidosIds: readonly string[];
}

export type ResultadoDestinoImportacion =
  | { readonly estado: 'VALIDO'; readonly propietarioDestinoId: string;
      readonly propietario: Pick<ReferenciaPropietario, 'id' | 'nombre'>; readonly incidencias: readonly IncidenciaRevision[] }
  | { readonly estado: 'AUSENTE' | 'NO_ENCONTRADO' | 'NO_PERMITIDO' | 'AMBIGUO';
      readonly propietarioDestinoId: string | null; readonly propietario: null; readonly incidencias: readonly IncidenciaRevision[] };

export interface ContextoPrevisualizacion extends ContextoDestinoImportacion {
  /** Una entrada por índice de origen. Si falta, no se aplica una política por defecto. */
  readonly reglasPorRegistro: readonly (ReglasRevisionDatos | null)[];
}

export interface RegistroPrevisualizado {
  /** Posición temporal para revisar. No es un ID de entidad ni de persistencia. */
  readonly indiceOrigen: number;
  readonly datosOrigen: DatosOrigenImportacion;
  readonly evaluacionDatos: EvaluacionDatos;
  /** Una propuesta sin incidencias sigue sin equivaler a un permiso de escritura. */
  readonly decision: 'CREARIA' | 'REVISAR' | 'BLOQUEADO';
  readonly incidencias: readonly IncidenciaRevision[];
}

export interface PrevisualizacionImportacion {
  readonly soloLectura: true;
  readonly destino: ResultadoDestinoImportacion;
  readonly registros: readonly RegistroPrevisualizado[];
  readonly registrosQueSeCrearian: readonly RegistroPrevisualizado[];
  readonly registrosIncompletos: readonly RegistroPrevisualizado[];
  readonly registrosBloqueados: readonly RegistroPrevisualizado[];
  /** Incluye incompletos, revisiones externas y bloqueados: no es una partición. */
  readonly datosQueRequierenRevision: readonly RegistroPrevisualizado[];
  readonly incidencias: readonly IncidenciaRevision[];
}

/** Puertos de lectura para un adaptador futuro; sin implementación ni invocaciones aquí. */
export interface ProveedorRevisionPatrimonial {
  obtenerReglasPropietario: (propietarioId: string) => Promise<ReglasRevisionDatos | null>;
  obtenerContextoImportacion: (solicitud: SolicitudPrevisualizacion) => Promise<ContextoPrevisualizacion>;
}

export interface AccionesRevisionPatrimonial {
  onRevisarRegistro?: (indiceOrigen: number) => void;
  /** Solo solicitud futura. El receptor deberá revalidar todo fuera de la UI. */
  onSolicitarImportacion?: (solicitud: SolicitudImportacionPatrimonial) => void;
}
