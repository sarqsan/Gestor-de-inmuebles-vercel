/**
 * BLOQUE D — Actas de Entrada y Salida
 * Circuito: VIVIENDA/CONTRATO → ENTRADA → ACTA ENTRADA → INVENTARIO/ESTADO/EVIDENCIAS → FIRMA → ESTANCIA → SALIDA → COMPARACIÓN → INCIDENCIAS → ACTA SALIDA → FIRMA → TRAZABILIDAD
 * Persistencia Firestore, Storage para evidencias (no base64 en Firestore), auditoría canónica.
 */

export type TipoActa = 'ENTRADA' | 'SALIDA';
export type EstadoActa =
  | 'BORRADOR'
  | 'EN_REVISION'
  | 'PENDIENTE_FIRMA'
  | 'FIRMADA'
  | 'CERRADA'
  | 'ERROR'
  | 'CANCELADA';

export type RolParticipanteActa = 'ARRENDADOR' | 'ARRENDATARIO' | 'COTITULAR' | 'AVALISTA' | 'TESTIGO' | 'GESTOR' | 'ADMINISTRADOR' | 'OTRO';

export interface ParticipanteActa {
  id: string;
  nombre: string;
  rol: RolParticipanteActa;
  dni?: string;
  email?: string;
  telefono?: string;
  firmaRequerida: boolean;
  haFirmado: boolean;
  fechaFirma?: string;
}

export type CategoriaElementoActa =
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
  | 'INSTALACIONES'
  | 'SEGURIDAD'
  | 'VENTANAS'
  | 'PUERTAS'
  | 'SUELOS'
  | 'PAREDES_TECHOS'
  | 'FONTANERIA'
  | 'ELECTRICIDAD'
  | 'ESTRUCTURA'
  | 'OTROS';

export type EstadoElementoActa =
  | 'CORRECTO'
  | 'BUEN_ESTADO'
  | 'NUEVO'
  | 'CON_DESGASTE_LEVE'
  | 'CON_DESGASTE'
  | 'DETERIORADO'
  | 'DANADO'
  | 'DEFECTUOSO'
  | 'AUSENTE'
  | 'NO_VERIFICABLE'
  | 'PENDIENTE_REVISAR'
  | 'REPARADO'
  | 'USADO';

export interface ElementoActaInventario {
  id: string;
  actaId: string;
  categoria: CategoriaElementoActa;
  elemento: string; // nombre corto ej "Frigorífico", "Pintura salón"
  descripcion?: string;
  estado: EstadoElementoActa;
  estadoEntrada?: EstadoElementoActa; // para acta SALIDA, referencia al estado inicial
  estadoSalida?: EstadoElementoActa; // para acta SALIDA, estado final
  observaciones?: string;
  cantidad?: number;
  unidadCantidad?: string; // ej "uds", "m2"
  ubicacion?: string; // estancia
  marca?: string;
  modelo?: string;
  evidenciaIds?: string[]; // refs a EvidenciaActa
  fotoUrl?: string; // referencia rápida (no base64, URL Storage)
  activo: boolean;
  orden: number;
}

export type TipoContador = 'ELECTRICIDAD' | 'AGUA' | 'GAS' | 'CALEFACCION' | 'OTRO';

export interface LecturaContador {
  id: string;
  actaId: string;
  tipo: TipoContador;
  lectura: string; // puede ser numérica pero se guarda como string para tolerancia
  lecturaNumerica?: number;
  unidad?: string; // kWh, m3, etc.
  fechaHora: string; // ISO
  observaciones?: string;
  evidenciaId?: string;
}

export type TipoEvidenciaActa = 'FOTO' | 'VIDEO' | 'DOCUMENTO' | 'OTRO';

export interface EvidenciaActa {
  id: string;
  actaId: string;
  ownerId: string;
  propertyId: string;
  contractId?: string;
  tipo: TipoEvidenciaActa;
  storagePath: string; // Firebase Storage path, no base64
  downloadURL: string;
  orden: number;
  fechaHora: string; // ISO
  descripcion?: string;
  elementoRelacionadoId?: string; // ElementoActaInventario.id
  estancia?: string;
  nombreArchivo?: string;
  mimeType?: string;
  tamanoBytes?: number;
  subidoPor?: string;
}

export type EstadoIncidenciaActa = 'ABIERTA' | 'EN_VALORACION' | 'RESUELTA' | 'CERRADA' | 'CANCELADA';
export type OrigenIncidenciaActa = 'ENTRADA' | 'SALIDA' | 'ESTANCIA' | 'COMPARACION';

export interface IncidenciaActa {
  id: string;
  actaId: string;
  ownerId: string;
  propertyId: string;
  contractId?: string;
  elementoAfectadoId?: string;
  titulo: string;
  descripcion: string;
  estado: EstadoIncidenciaActa;
  origen: OrigenIncidenciaActa;
  fechaHora: string; // ISO
  evidenciaIds?: string[];
  observaciones?: string;
  prioridad?: 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE';
  responsable?: 'PROPIETARIO' | 'INQUILINO' | 'COMUNIDAD' | 'TERCERO' | 'PENDIENTE';
  historial?: {
    id: string;
    fecha: string;
    usuario: string;
    accion: string;
    detalle?: string;
  }[];
}

export type EstadoFirma = 'PENDIENTE' | 'SOLICITADA' | 'VALIDADA' | 'FIRMADA' | 'RECHAZADA' | 'EXPIRADA';
export type MetodoFirma = 'OTP' | 'MANUAL' | 'DIGITAL';

export interface FirmaActa {
  id: string;
  actaId: string;
  versionActa: number;
  firmanteId: string; // participante.id o usuarioId
  firmanteNombre: string;
  firmanteDni?: string;
  firmanteRol: RolParticipanteActa;
  estado: EstadoFirma;
  metodo: MetodoFirma;
  fechaSolicitud?: string;
  fechaFirma?: string;
  otpId?: string;
  ip?: string;
  userAgent?: string;
  trazabilidad?: {
    id: string;
    fecha: string;
    accion: string;
    detalle?: string;
  }[];
}

export interface OtpActa {
  id: string;
  actaId: string;
  firmaId: string;
  ownerId: string;
  codigoHash: string; // SHA-256 hash del código, no texto plano
  codigoPlainTemporal?: string; // solo para entrega inmediata en UI de prueba, no persistir en prod si se puede evitar; se limpia tras uso
  fechaCreacion: string; // ISO
  fechaExpiracion: string; // ISO
  intentos: number;
  maxIntentos: number; // ej 3-5
  usado: boolean;
  fechaUso?: string;
  solicitante?: string;
  canal?: 'MANUAL' | 'EMAIL' | 'SMS' | 'PENDIENTE_PROVEEDOR'; // transporte
  estado: 'ACTIVO' | 'USADO' | 'EXPIRADO' | 'BLOQUEADO';
}

export type AccionHistorialActa =
  | 'CREADA'
  | 'MODIFICADA'
  | 'ELEMENTO_ANADIDO'
  | 'ELEMENTO_MODIFICADO'
  | 'ELEMENTO_ELIMINADO'
  | 'EVIDENCIA_ANADIDA'
  | 'EVIDENCIA_ELIMINADA'
  | 'CONTADOR_REGISTRADO'
  | 'INCIDENCIA_CREADA'
  | 'INCIDENCIA_MODIFICADA'
  | 'SOLICITUD_FIRMA'
  | 'OTP_GENERADO'
  | 'OTP_VALIDADO'
  | 'OTP_FALLIDO'
  | 'FIRMADA'
  | 'PDF_GENERADO'
  | 'CERRADA'
  | 'CANCELADA'
  | 'VERSIONADA';

export interface HistorialActa {
  id: string;
  fecha: string; // ISO
  usuario: string;
  usuarioId?: string;
  accion: AccionHistorialActa;
  estadoAnterior?: EstadoActa;
  estadoNuevo?: EstadoActa;
  detalle?: string;
  version?: number;
}

// Comparación entrada ↔ salida — determinista y auditable, sin IA
export type DiferenciaElemento =
  | 'SIN_CAMBIOS'
  | 'DESGASTE_LEVE'
  | 'DESGASTE'
  | 'DETERIORO'
  | 'DANO'
  | 'AUSENCIA'
  | 'INCIDENCIA_NUEVA'
  | 'NO_VERIFICABLE'
  | 'MEJORA'
  | 'ELEMENTO_NUEVO';

export interface ComparacionElemento {
  elementoId: string;
  elementoIdEntrada?: string;
  elementoIdSalida?: string;
  nombre: string;
  categoria: CategoriaElementoActa;
  estadoEntrada: EstadoElementoActa;
  estadoSalida: EstadoElementoActa;
  diferencia: DiferenciaElemento;
  observaciones?: string;
  requiereAtencion: boolean;
  incidenciaRelacionadaId?: string;
}

export interface ComparacionContador {
  tipo: TipoContador;
  lecturaEntrada?: string;
  lecturaEntradaNumerica?: number;
  lecturaSalida?: string;
  lecturaSalidaNumerica?: number;
  diferencia?: number;
  diferenciaTexto?: string;
  unidad?: string;
  observaciones?: string;
}

export interface ComparacionEvidencias {
  elementoId: string;
  evidenciasEntrada: string[]; // ids
  evidenciasSalida: string[]; // ids
  relacionadas: boolean;
}

export interface ComparacionIncidencias {
  existentesDesdeEntrada: string[]; // ids incidencias entrada que persisten
  nuevasEnSalida: string[]; // ids nuevas detectadas en salida
  resueltas: string[];
}

export interface ResumenDiferencias {
  totalElementos: number;
  sinCambios: number;
  conDesgaste: number;
  conDeterioro: number;
  conDano: number;
  ausencias: number;
  noVerificables: number;
  incidenciasNuevas: number;
  elementosNuevos: number;
  requiereAtencion: number;
  contadores: ComparacionContador[];
  incidencias: ComparacionIncidencias;
  fechaComparacion: string;
}

export interface Acta {
  id: string;
  ownerId: string;
  propertyId: string;
  contractId?: string;
  tipo: TipoActa;
  estado: EstadoActa;
  version: number;
  fechaCreacion: string; // ISO
  fechaActualizacion: string; // ISO
  fechaActo: string; // YYYY-MM-DD fecha del acto de entrada/salida
  horaActo?: string; // HH:MM
  participantes: ParticipanteActa[];
  inventario: ElementoActaInventario[];
  lecturasContadores: LecturaContador[];
  evidenciaIds: string[]; // refs a EvidenciaActa
  incidenciaIds: string[]; // refs a IncidenciaActa
  observaciones?: string;
  observacionesGenerales?: string;
  actaEntradaId?: string; // para SALIDA, referencia a acta de entrada
  resumenDiferencias?: ResumenDiferencias; // solo SALIDA
  firmas: FirmaActa[];
  estadoFirma: 'PENDIENTE' | 'EN_PROCESO' | 'FIRMADA_PARCIAL' | 'FIRMADA' | 'RECHAZADA';
  fechaFirma?: string;
  historial: HistorialActa[];
  creadoPor: string;
  creadoPorId?: string;
  actualizadoPor?: string;
  cerradoPor?: string;
  fechaCierre?: string;
  pdfUrl?: string;
  pdfStoragePath?: string;
  pdfVersion?: number;
  notasInternas?: string;
}

// Para repositorio y UI
export interface FiltroActas {
  ownerId?: string;
  propertyId?: string;
  contractId?: string;
  tipo?: TipoActa;
  estado?: EstadoActa;
  fechaDesde?: string;
  fechaHasta?: string;
}
