import type { ArchivoAportado, Candidato, ContratoFormalizacion, Inmueble, Propietario } from '../../types.ts';

// Reutilización de identidades existentes, sin nuevos modelos patrimoniales ni alquiler paralelo.
export type ReferenciaInmuebleOperativo = Readonly<Pick<Inmueble, 'id' | 'direccion'>>;
export type ReferenciaPropietarioOperativo = Readonly<Pick<Propietario, 'id' | 'nombre'>>;
export type ReferenciaContratoOperativo = Readonly<Pick<ContratoFormalizacion, 'id' | 'inmuebleId' | 'candidatoId' | 'estado'>>;
export type ReferenciaInquilinoOperativo = Readonly<Pick<Candidato, 'id' | 'inmuebleId' | 'nombre'>>;
export type ReferenciaArchivoOperativo = Readonly<Pick<ArchivoAportado, 'id' | 'nombreArchivo' | 'mimeType' | 'fechaSubida'>
  & Partial<Pick<ArchivoAportado, 'storagePath' | 'tamañoBytes'>>>;

/** Contexto explícito aportado desde fuera. No infiere ni modifica la titularidad. */
export interface AmbitoOperacion { readonly inmuebleId: Inmueble['id']; readonly propietarioId: Propietario['id'] }
export type TipoEntidad = 'incidencia' | 'averia' | 'reparacion' | 'proveedor' | 'equipo' | 'garantia' | 'presupuesto' | 'factura' | 'documento';
export interface ReferenciaOperacion { readonly tipo: TipoEntidad; readonly id: string }
export interface VinculoActuacion { readonly incidenciaId: string; readonly averiaId?: string; readonly reparacionId?: string }
export interface ConceptoImporte { readonly descripcion: string; readonly importeCentimos: number }
export interface MaterialReparacion { readonly descripcion: string; readonly cantidad: number }

export interface DatosIncidencia {
  readonly fecha: string; readonly descripcion: string;
  readonly prioridad: 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE';
  readonly origen: string;
  readonly alcance: 'INMUEBLE' | 'ZONAS_COMUNES' | 'MANTENIMIENTO_GENERAL';
  readonly contratoId?: ContratoFormalizacion['id'];
  /** Reutiliza Candidato.id, arrendatario del contrato actual. */
  readonly inquilinoId?: Candidato['id'];
  readonly responsable?: string; readonly proveedorId?: string; readonly equipoId?: string;
}
export interface DatosAveria {
  readonly incidenciaId: string; readonly equipoId?: string; readonly descripcion: string;
  readonly sintomas: readonly string[]; readonly fecha: string; readonly proveedorId?: string;
  readonly garantiaId?: string;
}
export interface DatosReparacion {
  readonly incidenciaId: string; readonly averiaId?: string; readonly equipoId?: string;
  readonly descripcion: string; readonly proveedorId: string; readonly presupuestoId?: string;
  readonly fechaPrevista?: string; readonly fechaInicio?: string; readonly fechaFin?: string;
  readonly costeCentimos?: number; readonly moneda: 'EUR';
  readonly materiales: readonly MaterialReparacion[]; readonly resultado?: string;
}
export interface DatosProveedor {
  readonly nombre: string; readonly servicios: readonly string[];
  readonly contacto: Readonly<Partial<Pick<Candidato, 'email' | 'telefono'>>>;
  readonly referenciaExterna?: string; readonly activo: boolean;
}
export interface DatosEquipo {
  readonly tipoEquipo: string; readonly marca?: string; readonly modelo?: string; readonly numeroSerie?: string;
  readonly fechaAdquisicion?: string; readonly fechaInstalacion?: string; readonly instalacion?: string;
}
export interface DatosGarantia {
  readonly equipoId: string; readonly inicio?: string; readonly vencimiento?: string;
  readonly proveedorId?: string; readonly fabricante?: string;
  readonly condiciones?: string; readonly referenciaCompra?: string;
}
export interface DatosPresupuesto {
  readonly vinculo: VinculoActuacion; readonly proveedorId: string; readonly fecha: string;
  readonly referencia: string; readonly moneda: 'EUR'; readonly importeCentimos: number;
  readonly conceptos: readonly ConceptoImporte[];
}
export interface DatosFactura {
  readonly proveedorId: string; readonly fecha: string; readonly referencia: string;
  readonly moneda: 'EUR'; readonly importeCentimos: number; readonly conceptos: readonly ConceptoImporte[];
  readonly origen: string; readonly vinculo: VinculoActuacion | null; readonly presupuestoId?: string;
}
export interface DatosDocumento {
  readonly referenciaExterna?: Pick<EnlaceProteccionExterna, 'sistemaExterno' | 'referenciaExterna'>;
  readonly archivo: ReferenciaArchivoOperativo;
  readonly categoria: 'FOTO' | 'PRESUPUESTO' | 'FACTURA' | 'GARANTIA' | 'PARTE' | 'COMUNICACION' | 'OTRO';
  readonly descripcion: string;
}
export interface DatosPorTipo {
  incidencia: DatosIncidencia; averia: DatosAveria; reparacion: DatosReparacion; proveedor: DatosProveedor;
  equipo: DatosEquipo; garantia: DatosGarantia; presupuesto: DatosPresupuesto; factura: DatosFactura; documento: DatosDocumento;
}
interface BaseRegistro {
  readonly id: string; readonly version: number; readonly creadoEn: string; readonly actualizadoEn: string;
}
interface BaseInmueble extends BaseRegistro { readonly ambito: AmbitoOperacion; readonly documentoIds: readonly string[] }
export type IncidenciaOperativa = BaseInmueble & DatosIncidencia & { readonly tipo: 'incidencia'; readonly estado: string };
export type AveriaOperativa = BaseInmueble & DatosAveria & { readonly tipo: 'averia'; readonly estado: string };
export type ReparacionOperativa = BaseInmueble & DatosReparacion & { readonly tipo: 'reparacion'; readonly estado: string };
export type ProveedorProfesional = BaseRegistro & DatosProveedor & { readonly tipo: 'proveedor'; readonly propietarioId: Propietario['id'] };
export type EquipoOperativo = BaseInmueble & DatosEquipo & { readonly tipo: 'equipo'; readonly estado: string };
export type GarantiaEquipo = BaseInmueble & DatosGarantia & { readonly tipo: 'garantia' };
export type PresupuestoOperativo = BaseInmueble & DatosPresupuesto & { readonly tipo: 'presupuesto'; readonly estado: string };
export type FacturaOperativa = BaseInmueble & DatosFactura & { readonly tipo: 'factura'; readonly estado: string };
export type DocumentoOperativo = BaseInmueble & DatosDocumento & { readonly tipo: 'documento' };
export type EntidadOperativa = IncidenciaOperativa | AveriaOperativa | ReparacionOperativa | ProveedorProfesional
  | EquipoOperativo | GarantiaEquipo | PresupuestoOperativo | FacturaOperativa | DocumentoOperativo;

export interface FlujoEstados {
  readonly inicial: string; readonly transiciones: Readonly<Record<string, readonly string[]>>; readonly terminales: readonly string[];
}
export type TipoConEstado = 'incidencia' | 'averia' | 'reparacion' | 'equipo' | 'presupuesto' | 'factura';
export type PoliticaEstados = Readonly<Record<TipoConEstado, FlujoEstados>>;
export interface ContextoOperativo {
  readonly ambito: AmbitoOperacion;
  /** Snapshot de ámbitos admisibles; no es seguridad efectiva ni un rol/claim. */
  readonly ambitosPermitidos: readonly AmbitoOperacion[];
  readonly inmuebles: readonly ReferenciaInmuebleOperativo[];
  readonly propietarios: readonly ReferenciaPropietarioOperativo[];
  readonly contratos: readonly ReferenciaContratoOperativo[];
  readonly inquilinos: readonly ReferenciaInquilinoOperativo[];
  readonly flujoIncidencias?: FlujoEstados;
}
export interface MetaOperacion {
  readonly operacionId: string; readonly fecha: string; readonly actor: string;
  readonly revisionEsperada: number; readonly motivo: string;
}
export type CrearEntidad = { [K in TipoEntidad]: {
  readonly accion: 'CREAR'; readonly tipo: K; readonly id: string; readonly datos: DatosPorTipo[K];
} }[TipoEntidad];
type TipoModificable = Exclude<TipoEntidad, 'documento' | 'factura'>;
type DatosModificables<K extends TipoModificable> = Omit<DatosPorTipo[K], 'incidenciaId' | 'averiaId' | 'equipoId' | 'contratoId' | 'inquilinoId' | 'vinculo'>;
export type ModificarEntidad = { [K in TipoModificable]: {
  readonly accion: 'MODIFICAR'; readonly tipo: K; readonly id: string; readonly cambios: Partial<DatosModificables<K>>;
} }[TipoModificable];
export type InstruccionOperativa = CrearEntidad | ModificarEntidad
  | { readonly accion: 'CAMBIAR_ESTADO'; readonly tipo: TipoConEstado; readonly id: string; readonly estado: string }
  | { readonly accion: 'ANOTAR'; readonly tipo: TipoEntidad; readonly id: string; readonly clase: 'DIAGNOSTICO' | 'ACTUACION' | 'COMUNICACION' | 'NOTA'; readonly texto: string }
  | { readonly accion: 'VINCULAR_DOCUMENTO'; readonly tipo: Exclude<TipoEntidad, 'proveedor' | 'documento'>; readonly id: string; readonly documentoId: string }
  | { readonly accion: 'ASOCIAR_FACTURA'; readonly tipo: 'factura'; readonly id: string; readonly vinculo: VinculoActuacion; readonly presupuestoId?: string };
export type ComandoOperativo = MetaOperacion & InstruccionOperativa;

export interface EventoOperativo {
  readonly operacionId: string; readonly fecha: string; readonly actor: string; readonly motivo: string;
  readonly ambito: AmbitoOperacion; readonly referencia: ReferenciaOperacion;
  readonly revision: number; readonly comando: ComandoOperativo;
  readonly antes: EntidadOperativa | null; readonly despues: EntidadOperativa;
}
export interface EstadoOperaciones {
  /** Revisión del snapshot en memoria, no un contador global productivo. */
  readonly revision: number; readonly entidades: readonly EntidadOperativa[]; readonly historial: readonly EventoOperativo[];
}
export type ResultadoOperacion =
  | { readonly ok: true; readonly estado: EstadoOperaciones; readonly evento: EventoOperativo; readonly repetida: boolean }
  | { readonly ok: false; readonly estado: EstadoOperaciones; readonly error: { readonly codigo: string; readonly mensaje: string } };

/** Lote preparado, no ejecutado: documento + evento en una transacción futura autorizada. */
export interface CambioOperativoPreparado {
  readonly ambito: AmbitoOperacion; readonly revisionSnapshotEsperada: number;
  readonly versionEntidadEsperada: number | null; readonly entidad: EntidadOperativa; readonly evento: EventoOperativo;
}
export interface RepositorioOperativoFuturo {
  leerSnapshot: (contexto: ContextoOperativo) => Promise<EstadoOperaciones>;
  /** Revalidar permisos, referencias, idempotencia y CAS; insertar histórico de forma atómica. */
  aplicarCambioAutorizado: (cambio: CambioOperativoPreparado) => Promise<{ readonly revisionConfirmada: number }>;
}

/** Referencia opaca al dominio futuro de B: ni póliza, ni cobertura, ni decisión de siniestro. */
export interface EnlaceProteccionExterna {
  readonly sistemaExterno: string; readonly referenciaExterna: string;
  readonly documentos: readonly ReferenciaArchivoOperativo[];
}
export interface PuenteProteccionFuturo {
  consultarReferenciasAutorizadas: (ambito: AmbitoOperacion, actuacion: ReferenciaOperacion) => Promise<readonly EnlaceProteccionExterna[]>;
}
