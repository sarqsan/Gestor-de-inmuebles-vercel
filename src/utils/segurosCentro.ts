/**
 * BLOQUE 1 — CENTRO OPERATIVO DEL INMUEBLE + SEGUROS (dominio puro).
 * ---------------------------------------------------------------------------
 * Extiende el modelo EXISTENTE de seguros (`PolizaSeguro`, `segurosEngine.ts`,
 * colección `polizas_seguros`): NO crea un modelo paralelo. Principios:
 *
 *  · Inmueble → 1..N Pólizas → 1..N Documentos. Adjuntar un documento NUNCA
 *    reemplaza ni elimina los anteriores (append-only + `reemplazaA`
 *    informativo). El histórico es append-only.
 *  · Renovaciones/cambios de compañía generan una NUEVA póliza encadenada
 *    (`polizaAnteriorId`/`polizaSiguienteId`); la anterior conserva íntegros
 *    sus datos, documentos e historial.
 *  · IDs deterministas (SHA-256) + idempotencia: repetir la misma operación
 *    no duplica ni sobrescribe.
 *  · El ERP NO afirma cobertura automáticamente: `clasificarEvidenciaCobertura`
 *    separa DATO DOCUMENTAL / INTERPRETACIÓN / HIPÓTESIS / CONCLUSIÓN
 *    PENDIENTE DE REVISIÓN. La fuente documental es la póliza original.
 *  · Sin efectos de red: este módulo es puro (tests deterministas). La
 *    persistencia usa `savePolizaFirestore`/`guardarPolizaConAuditoria` y la
 *    auditoría reutiliza `audit_logs` (sin sistema paralelo).
 */
import {
  AlertaRenovacionPoliza,
  CobroPeriodo,
  ComparacionPoliza,
  ContratoFormalizacion,
  DocumentoPoliza,
  EstadoPolizaSeguro,
  Gasto,
  GarantiaReparacion,
  HistorialPolizaItem,
  Incidencia,
  Inmueble,
  PeriodicidadPagoPoliza,
  PolizaSeguro,
  ProcedenciaSeguro,
  TareaMantenimiento,
  TipoDocumentoPoliza,
  TipoPolizaSeguro,
} from '../types';
import { sha256Hex } from './sha256';
import {
  INTERVALOS_ALERTA_RENOVACION,
  calcularDiasRestantes,
  compararPolizas,
  generarAlertaRenovacion,
  obtenerCadenaHistorialPoliza,
  type EvaluacionSeguroResultado,
} from './segurosEngine';

// ============================================================================
// ACTOR / CONTEXTO
// ============================================================================

export interface ActorSeguros {
  id?: string;
  nombre: string;
}

export interface ResultadoOperacionSeguro<T = PolizaSeguro> {
  estado: 'OK' | 'SIN_CAMBIOS' | 'ERROR';
  poliza?: T;
  polizaNueva?: T; // operaciones que encadenan (renovación/sustitución)
  comparacion?: ComparacionPoliza;
  error?: string;
}

// ============================================================================
// IDs DETERMINISTAS (idempotencia)
// ============================================================================

function normalizar(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase();
}

/** `pol_` + sha256[0:36] de la identidad de negocio de la póliza. */
export function generarIdPolizaDeterminista(input: {
  propietarioId: string;
  numeroPoliza: string;
  aseguradora: string;
  fechaInicio: string;
}): string {
  const base = [
    'poliza',
    normalizar(input.propietarioId),
    normalizar(input.numeroPoliza),
    normalizar(input.aseguradora),
    normalizar(input.fechaInicio),
  ].join('|');
  return `pol_${sha256Hex(base).slice(0, 36).toLowerCase()}`;
}

/** `dpd_` + sha256[0:36] de la identidad del documento dentro de su póliza. */
export function generarIdDocumentoPoliza(input: {
  polizaId: string;
  nombre: string;
  categoria: string;
  fechaDocumento: string;
}): string {
  const base = [
    'doc-poliza',
    normalizar(input.polizaId),
    normalizar(input.nombre),
    normalizar(input.categoria),
    normalizar(input.fechaDocumento),
  ].join('|');
  return `dpd_${sha256Hex(base).slice(0, 36).toLowerCase()}`;
}

// ============================================================================
// VALIDACIÓN Y CREACIÓN
// ============================================================================

export interface DatosNuevaPoliza {
  propietarioId: string;
  inmuebleId?: string;
  inmuebleDireccion?: string;
  tipo: TipoPolizaSeguro;
  aseguradora: string;
  numeroPoliza: string;
  fechaInicio: string; // YYYY-MM-DD
  fechaVencimiento: string; // YYYY-MM-DD
  estado?: EstadoPolizaSeguro;
  coberturas?: string[];
  exclusiones?: string[];
  franquicia?: number;
  primaAnual?: number;
  periodicidadPago?: PeriodicidadPagoPoliza;
  condiciones?: string;
  avisoRenovacionDias?: number;
  contacto?: PolizaSeguro['contacto'];
  observaciones?: string;
  procedencia?: ProcedenciaSeguro;
}

const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;

export function validarDatosPoliza(
  datos: Partial<DatosNuevaPoliza>
): { valido: boolean; errores: string[] } {
  const errores: string[] = [];
  if (!datos.propietarioId) errores.push('propietarioId es obligatorio (destino explícito, sin asignación implícita)');
  if (!datos.aseguradora) errores.push('aseguradora es obligatoria');
  if (!datos.numeroPoliza) errores.push('numeroPoliza es obligatorio');
  if (!datos.tipo) errores.push('tipo es obligatorio');
  if (!datos.fechaInicio || !FECHA_OK.test(datos.fechaInicio)) errores.push('fechaInicio debe ser YYYY-MM-DD');
  if (!datos.fechaVencimiento || !FECHA_OK.test(datos.fechaVencimiento)) errores.push('fechaVencimiento debe ser YYYY-MM-DD');
  if (
    datos.fechaInicio && datos.fechaVencimiento &&
    FECHA_OK.test(datos.fechaInicio) && FECHA_OK.test(datos.fechaVencimiento) &&
    datos.fechaInicio >= datos.fechaVencimiento
  ) {
    errores.push('fechaInicio debe ser anterior a fechaVencimiento');
  }
  return { valido: errores.length === 0, errores };
}

function crearHistorialItem(
  accion: HistorialPolizaItem['accion'],
  actor: ActorSeguros,
  ahora: string,
  extra: Partial<HistorialPolizaItem> = {}
): HistorialPolizaItem {
  return {
    id: `hp_${sha256Hex(`hist|${accion}|${ahora}|${normalizar(actor.nombre)}|${JSON.stringify(extra)}`).slice(0, 32).toLowerCase()}`,
    fecha: ahora,
    usuario: actor.nombre,
    usuarioId: actor.id,
    accion,
    ...extra,
  };
}

/** Alta de póliza con id determinista, procedencia e historial inicial. */
export function crearPolizaSeguro(
  datos: DatosNuevaPoliza,
  actor: ActorSeguros,
  ahora: string
): ResultadoOperacionSeguro {
  const validacion = validarDatosPoliza(datos);
  if (!validacion.valido) {
    return { estado: 'ERROR', error: validacion.errores.join('; ') };
  }
  const id = generarIdPolizaDeterminista(datos);
  const poliza: PolizaSeguro = {
    id,
    propietarioId: datos.propietarioId,
    inmuebleId: datos.inmuebleId,
    inmuebleDireccion: datos.inmuebleDireccion,
    tipo: datos.tipo,
    aseguradora: datos.aseguradora,
    numeroPoliza: datos.numeroPoliza,
    fechaInicio: datos.fechaInicio,
    fechaVencimiento: datos.fechaVencimiento,
    estado: datos.estado || 'VIGENTE',
    coberturas: datos.coberturas || [],
    exclusiones: datos.exclusiones || [],
    franquicia: datos.franquicia,
    primaAnual: datos.primaAnual,
    periodicidadPago: datos.periodicidadPago,
    condiciones: datos.condiciones,
    avisoRenovacionDias: datos.avisoRenovacionDias,
    contacto: datos.contacto,
    observaciones: datos.observaciones,
    documentos: [],
    estadoRenovacion: 'VIGENTE',
    procedencia: datos.procedencia || {
      origen: 'MANUAL',
      actorId: actor.id,
      actorNombre: actor.nombre,
      fecha: ahora,
    },
    creadoPor: actor.nombre,
    creadoPorId: actor.id,
    actualizadoPor: actor.nombre,
    actualizadoPorId: actor.id,
    historial: [crearHistorialItem('CREACION', actor, ahora, { detalle: 'Alta de póliza en el centro operativo' })],
    createdAt: ahora,
    updatedAt: ahora,
  };
  return { estado: 'OK', poliza };
}

// ============================================================================
// DOCUMENTOS (1 PÓLIZA → N DOCUMENTOS, APPEND-ONLY)
// ============================================================================

export interface DatosDocumentoPoliza {
  id?: string; // si se omite, se genera de forma determinista
  nombre: string;
  url: string;
  storagePath?: string;
  categoria?: TipoDocumentoPoliza;
  origen?: string;
  referencia?: string;
  observaciones?: string;
  tamanoBytes?: number;
  mimeType?: string;
  reemplazaA?: string;
}

/**
 * Adjunta un documento a la póliza SIN eliminar ni sobrescribir los anteriores.
 *  · id determinista si no se aporta → adjuntar dos veces el mismo documento
 *    es `SIN_CAMBIOS` (idempotencia).
 *  · mismo id con contenido distinto → `ERROR` (nunca sobrescritura silenciosa).
 *  · `version` se autoincrementa por categoría (histórico de versiones).
 *  · registra `DOCUMENTO_ADJUNTADO` en el historial (append-only).
 */
export function adjuntarDocumentoPoliza(
  poliza: PolizaSeguro,
  datos: DatosDocumentoPoliza,
  actor: ActorSeguros,
  ahora: string
): ResultadoOperacionSeguro {
  if (!datos.nombre || !datos.url) {
    return { estado: 'ERROR', error: 'nombre y url del documento son obligatorios' };
  }
  const categoria = datos.categoria || 'OTRO';
  const id =
    datos.id ||
    generarIdDocumentoPoliza({
      polizaId: poliza.id,
      nombre: datos.nombre,
      categoria,
      fechaDocumento: ahora,
    });

  const documentos = poliza.documentos || [];
  const existente = documentos.find((d) => d.id === id);
  if (existente) {
    const identico =
      existente.url === datos.url &&
      (existente.nombre || '') === datos.nombre &&
      String(existente.categoria || existente.tipo || 'OTRO') === String(categoria);
    if (identico) return { estado: 'SIN_CAMBIOS', poliza };
    return {
      estado: 'ERROR',
      error: `El documento ${id} ya existe con contenido distinto: no se sobrescribe. Adjunte una versión nueva.`,
    };
  }

  const versionesCategoria = documentos.filter(
    (d) => String(d.categoria || d.tipo || 'OTRO') === String(categoria)
  ).length;

  const nuevoDoc: DocumentoPoliza = {
    id,
    nombre: datos.nombre,
    url: datos.url,
    storagePath: datos.storagePath,
    tipo: categoria,
    categoria,
    version: versionesCategoria + 1,
    fechaSubida: ahora,
    origen: datos.origen,
    subidoPor: actor.nombre,
    subidoPorId: actor.id,
    referencia: datos.referencia,
    observaciones: datos.observaciones,
    tamanoBytes: datos.tamanoBytes,
    mimeType: datos.mimeType,
    reemplazaA: datos.reemplazaA,
  };

  const actualizada: PolizaSeguro = {
    ...poliza,
    documentos: [...documentos, nuevoDoc],
    historial: [
      ...(poliza.historial || []),
      crearHistorialItem('DOCUMENTO_ADJUNTADO', actor, ahora, {
        detalle: `Documento «${datos.nombre}» (${categoria}, v${versionesCategoria + 1})${datos.reemplazaA ? ` — sucede a ${datos.reemplazaA} (el anterior sigue disponible)` : ''}`,
      }),
    ],
    actualizadoPor: actor.nombre,
    actualizadoPorId: actor.id,
    updatedAt: ahora,
  };
  return { estado: 'OK', poliza: actualizada };
}

// ============================================================================
// MODIFICACIÓN TRAZABLE (sin sobrescritura silenciosa)
// ============================================================================

/** Campos de negocio editables; `documentos` e `historial` NUNCA son editables aquí. */
const CAMPOS_EDITABLES_POLIZA = [
  'aseguradora',
  'numeroPoliza',
  'fechaInicio',
  'fechaVencimiento',
  'estado',
  'coberturas',
  'exclusiones',
  'franquicia',
  'primaAnual',
  'periodicidadPago',
  'condiciones',
  'avisoRenovacionDias',
  'contacto',
  'observaciones',
  'inmuebleId',
  'inmuebleDireccion',
] as const;

export type CambiosPoliza = Partial<Pick<PolizaSeguro, (typeof CAMPOS_EDITABLES_POLIZA)[number]>>;

/**
 * Modifica campos de negocio registrando datosAnteriores/datosNuevos en el
 * historial (append-only). Un cambio de prima guarda `primaAnterior` y genera
 * la comparación encadenada; un cambio de compañía queda registrado como
 * `MODIFICACION` con ambos valores (la sustitución formal usa
 * `registrarRenovacionPoliza`).
 */
export function modificarPolizaTrazable(
  poliza: PolizaSeguro,
  cambios: CambiosPoliza,
  actor: ActorSeguros,
  ahora: string
): ResultadoOperacionSeguro {
  const aplicados: CambiosPoliza = {};
  const anteriores: CambiosPoliza = {};
  for (const campo of CAMPOS_EDITABLES_POLIZA) {
    if (campo in cambios) {
      const nuevo = cambios[campo];
      const actual = poliza[campo];
      if (JSON.stringify(actual ?? null) !== JSON.stringify(nuevo ?? null)) {
        (aplicados as Record<string, unknown>)[campo] = nuevo;
        (anteriores as Record<string, unknown>)[campo] = actual;
      }
    }
  }
  if (Object.keys(aplicados).length === 0) return { estado: 'SIN_CAMBIOS', poliza };

  const cambioPrima = 'primaAnual' in aplicados && aplicados.primaAnual !== poliza.primaAnual;
  const cambioCompania = 'aseguradora' in aplicados && aplicados.aseguradora !== poliza.aseguradora;

  const actualizada: PolizaSeguro = {
    ...poliza,
    ...aplicados,
    primaAnterior: cambioPrima ? poliza.primaAnual : poliza.primaAnterior,
    historial: [
      ...(poliza.historial || []),
      crearHistorialItem('MODIFICACION', actor, ahora, {
        detalle: `Campos modificados: ${Object.keys(aplicados).join(', ')}`,
        datosAnteriores: anteriores as Partial<PolizaSeguro>,
        datosNuevos: aplicados as Partial<PolizaSeguro>,
      }),
    ],
    actualizadoPor: actor.nombre,
    actualizadoPorId: actor.id,
    updatedAt: ahora,
  };

  if (cambioCompania) {
    actualizada.historial = [
      ...(actualizada.historial || []),
      crearHistorialItem('MODIFICACION', actor, ahora, {
        detalle: `Cambio de compañía registrado: ${poliza.aseguradora} → ${aplicados.aseguradora}. Para sustitución formal con nueva póliza use el circuito de renovación.`,
      }),
    ];
  }
  return { estado: 'OK', poliza: actualizada };
}

// ============================================================================
// RENOVACIÓN / CAMBIO DE COMPAÑÍA (cadena de pólizas, sin perder historia)
// ============================================================================

export interface DatosRenovacionPoliza {
  fechaInicio: string;
  fechaVencimiento: string;
  primaAnual?: number;
  aseguradora?: string; // si difiere → SUSTITUCION (cambio de compañía)
  numeroPoliza?: string;
  coberturas?: string[];
  exclusiones?: string[];
  franquicia?: number;
  condiciones?: string;
  observaciones?: string;
}

/**
 * Registra la renovación como NUEVA póliza encadenada: la anterior conserva
 * íntegros datos, documentos e historial (no se sobrescribe nada histórico).
 * Devuelve ambas pólizas y la comparación (evolución de prima/coberturas).
 */
export function registrarRenovacionPoliza(
  anterior: PolizaSeguro,
  datos: DatosRenovacionPoliza,
  actor: ActorSeguros,
  ahora: string
): ResultadoOperacionSeguro {
  const validacion = validarDatosPoliza({
    propietarioId: anterior.propietarioId,
    aseguradora: datos.aseguradora || anterior.aseguradora,
    numeroPoliza: datos.numeroPoliza || anterior.numeroPoliza,
    tipo: anterior.tipo,
    fechaInicio: datos.fechaInicio,
    fechaVencimiento: datos.fechaVencimiento,
  });
  if (!validacion.valido) return { estado: 'ERROR', error: validacion.errores.join('; ') };
  if (anterior.polizaSiguienteId) {
    return {
      estado: 'ERROR',
      error: `La póliza ${anterior.id} ya tiene sucesora (${anterior.polizaSiguienteId}); no se encadena dos veces.`,
    };
  }

  const esSustitucion = Boolean(datos.aseguradora && datos.aseguradora !== anterior.aseguradora);
  const nueva: PolizaSeguro = {
    ...anterior,
    id: generarIdPolizaDeterminista({
      propietarioId: anterior.propietarioId,
      numeroPoliza: datos.numeroPoliza || anterior.numeroPoliza,
      aseguradora: datos.aseguradora || anterior.aseguradora,
      fechaInicio: datos.fechaInicio,
    }),
    aseguradora: datos.aseguradora || anterior.aseguradora,
    numeroPoliza: datos.numeroPoliza || anterior.numeroPoliza,
    fechaInicio: datos.fechaInicio,
    fechaVencimiento: datos.fechaVencimiento,
    estado: 'VIGENTE',
    estadoRenovacion: 'VIGENTE',
    primaAnual: datos.primaAnual !== undefined ? datos.primaAnual : anterior.primaAnual,
    primaAnterior: anterior.primaAnual,
    coberturas: datos.coberturas || anterior.coberturas || [],
    exclusiones: datos.exclusiones || anterior.exclusiones || [],
    franquicia: datos.franquicia !== undefined ? datos.franquicia : anterior.franquicia,
    condiciones: datos.condiciones !== undefined ? datos.condiciones : anterior.condiciones,
    observaciones: datos.observaciones !== undefined ? datos.observaciones : anterior.observaciones,
    // La nueva póliza arranca SIN documentos propios: los documentos de la
    // anterior pertenecen a su histórico y siguen en ella (recuperables).
    documentos: [],
    documentosRenovacion: [],
    datosExtraidosRenovacion: undefined,
    alertaGenerada: false,
    fechaAlertaGenerada: undefined,
    polizaAnteriorId: anterior.id,
    polizaSiguienteId: undefined,
    createdAt: ahora,
    updatedAt: ahora,
    creadoPor: actor.nombre,
    creadoPorId: actor.id,
    actualizadoPor: actor.nombre,
    actualizadoPorId: actor.id,
    procedencia: { origen: 'MANUAL', detalle: esSustitucion ? 'Cambio de compañía' : 'Renovación', actorId: actor.id, actorNombre: actor.nombre, fecha: ahora },
    historial: [
      crearHistorialItem('CREACION', actor, ahora, {
        detalle: esSustitucion
          ? `Póliza creada por cambio de compañía (sucede a ${anterior.id})`
          : `Póliza creada por renovación (sucede a ${anterior.id})`,
      }),
    ],
  };
  if (nueva.id === anterior.id) {
    return { estado: 'ERROR', error: 'La renovación generaría el mismo id que la póliza anterior: revise número/compañía/fecha de inicio.' };
  }

  const comparacion: ComparacionPoliza = compararPolizas(anterior, nueva);
  nueva.comparacionUltima = comparacion;
  nueva.comparacionesHistorial = [comparacion];

  const anteriorActualizada: PolizaSeguro = {
    ...anterior,
    polizaSiguienteId: nueva.id,
    estadoRenovacion: esSustitucion ? 'SUSTITUIDA' : 'RENOVADA',
    historial: [
      ...(anterior.historial || []),
      crearHistorialItem(esSustitucion ? 'SUSTITUCION' : 'RENOVACION_CONFIRMADA', actor, ahora, {
        detalle: esSustitucion
          ? `Sustituida por nueva póliza ${nueva.id} (${nueva.aseguradora})`
          : `Renovación confirmada: nueva póliza ${nueva.id}`,
        observaciones: datos.primaAnual !== undefined ? `Prima ${anterior.primaAnual ?? '?'} € → ${datos.primaAnual} €` : undefined,
      }),
    ],
    actualizadoPor: actor.nombre,
    actualizadoPorId: actor.id,
    updatedAt: ahora,
  };

  return { estado: 'OK', poliza: anteriorActualizada, polizaNueva: nueva, comparacion };
}

/** Cancelación lógica: conserva datos, documentos e historial. */
export function cancelarPoliza(
  poliza: PolizaSeguro,
  motivo: string,
  actor: ActorSeguros,
  ahora: string
): ResultadoOperacionSeguro {
  if (poliza.estado === 'CANCELADA') return { estado: 'SIN_CAMBIOS', poliza };
  const actualizada: PolizaSeguro = {
    ...poliza,
    estado: 'CANCELADA',
    estadoRenovacion: 'CANCELADA',
    historial: [
      ...(poliza.historial || []),
      crearHistorialItem('CANCELACION', actor, ahora, {
        detalle: `Cancelación lógica: ${motivo}`,
        estadoAnterior: poliza.estado,
        estadoNuevo: 'CANCELADA',
      }),
    ],
    actualizadoPor: actor.nombre,
    actualizadoPorId: actor.id,
    updatedAt: ahora,
  };
  return { estado: 'OK', poliza: actualizada };
}

// ============================================================================
// RENOVACIONES — VENTANA DE AVISO
// ============================================================================

export interface EstadoVentanaRenovacion {
  diasRestantes: number;
  enVentana: boolean;
  vencida: boolean;
  nivel: AlertaRenovacionPoliza['nivelProximidad'] | null;
}

/**
 * Ventana de aviso de renovación: usa `avisoRenovacionDias` de la propia
 * póliza cuando existe; si no, los intervalos estándar del motor.
 */
export function evaluarVentanaRenovacion(
  poliza: PolizaSeguro,
  hoyISO: string = new Date().toISOString()
): EstadoVentanaRenovacion {
  if (poliza.estado === 'CANCELADA') {
    return { diasRestantes: Number.NaN, enVentana: false, vencida: false, nivel: null };
  }
  const dias = calcularDiasRestantesDesde(poliza.fechaVencimiento, hoyISO);
  const ventanaPropia = typeof poliza.avisoRenovacionDias === 'number' && poliza.avisoRenovacionDias > 0;
  const enVentana = ventanaPropia ? dias <= poliza.avisoRenovacionDias! : INTERVALOS_ALERTA_RENOVACION.some((i) => dias <= i);
  const alerta = generarAlertaRenovacion({ ...poliza, fechaVencimiento: poliza.fechaVencimiento });
  return {
    diasRestantes: dias,
    enVentana: enVentana && dias >= 0,
    vencida: dias < 0,
    nivel: alerta ? alerta.nivelProximidad : null,
  };
}

function calcularDiasRestantesDesde(fechaVencimiento: string, hoyISO: string): number {
  const hoy = new Date(hoyISO.slice(0, 10));
  const fin = new Date(fechaVencimiento);
  return Math.round((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

/** Pólizas del inmueble dentro de su ventana de renovación (uso operativo). */
export function detectarRenovacionesInmueble(
  polizas: PolizaSeguro[],
  hoyISO: string = new Date().toISOString()
): { poliza: PolizaSeguro; ventana: EstadoVentanaRenovacion }[] {
  return polizas
    .filter((p) => p.estado !== 'CANCELADA')
    .map((p) => ({ poliza: p, ventana: evaluarVentanaRenovacion(p, hoyISO) }))
    .filter((x) => x.ventana.enVentana || x.ventana.vencida)
    .sort((a, b) => a.ventana.diasRestantes - b.ventana.diasRestantes);
}

// Reexporta utilidades del motor existente para un único punto de entrada.
export { calcularDiasRestantes, generarAlertaRenovacion, compararPolizas, obtenerCadenaHistorialPoliza };

// ============================================================================
// SEGURO ↔ AVERÍA — EVIDENCIA CLASIFICADA (nunca decisión automática)
// ============================================================================

export type CategoriaEvidenciaCobertura =
  | 'DATO_DOCUMENTAL'
  | 'INTERPRETACION'
  | 'HIPOTESIS'
  | 'CONCLUSION_PENDIENTE_REVISION';

export interface EvidenciaCobertura {
  categoria: CategoriaEvidenciaCobertura;
  texto: string;
  polizaId?: string;
  documentoIds?: string[];
}

export interface AnalisisCoberturaNoVinculante {
  vinculante: false;
  evidencia: EvidenciaCobertura[];
  polizasPotencialmenteRelacionadas: PolizaSeguro[];
  documentacionDisponible: { polizaId: string; documentoId: string; nombre: string; categoria?: string }[];
  aviso: string;
}

export const AVISO_COBERTURA_NO_AUTOMATICA =
  'El ERP no afirma automáticamente que una avería esté cubierta. La póliza y sus documentos originales son la única fuente documental; cualquier conclusión requiere revisión humana.';

/**
 * Clasifica la salida de `evaluarCoberturaPolizas` en las cuatro categorías
 * exigidas. Sólo los datos REGISTRADOS en pólizas/documentos son
 * DATO_DOCUMENTAL; el cruce categoría↔cobertura es INTERPRETACIÓN/HIPÓTESIS;
 * la cobertura efectiva queda SIEMPRE como CONCLUSIÓN PENDIENTE DE REVISIÓN.
 */
export function clasificarEvidenciaCobertura(
  incidencia: Pick<Incidencia, 'id' | 'categoria' | 'titulo' | 'descripcion'>,
  evaluacion: EvaluacionSeguroResultado
): AnalisisCoberturaNoVinculante {
  const evidencia: EvidenciaCobertura[] = [];
  const documentacionDisponible: AnalisisCoberturaNoVinculante['documentacionDisponible'] = [];

  for (const poliza of evaluacion.polizasAplicables) {
    for (const cobertura of poliza.coberturas || []) {
      evidencia.push({
        categoria: 'DATO_DOCUMENTAL',
        texto: `Cobertura registrada en póliza ${poliza.aseguradora} (Nº ${poliza.numeroPoliza}): «${cobertura}»`,
        polizaId: poliza.id,
      });
    }
    for (const exclusion of poliza.exclusiones || []) {
      evidencia.push({
        categoria: 'DATO_DOCUMENTAL',
        texto: `Exclusión registrada en póliza ${poliza.aseguradora} (Nº ${poliza.numeroPoliza}): «${exclusion}»`,
        polizaId: poliza.id,
      });
    }
    if (typeof poliza.franquicia === 'number') {
      evidencia.push({
        categoria: 'DATO_DOCUMENTAL',
        texto: `Franquicia registrada en póliza ${poliza.aseguradora} (Nº ${poliza.numeroPoliza}): ${poliza.franquicia} €`,
        polizaId: poliza.id,
      });
    }
    for (const doc of poliza.documentos || []) {
      documentacionDisponible.push({
        polizaId: poliza.id,
        documentoId: doc.id,
        nombre: doc.nombre,
        categoria: String(doc.categoria || doc.tipo || 'OTRO'),
      });
    }
  }

  if (evaluacion.explicacion) {
    evidencia.push({ categoria: 'INTERPRETACION', texto: evaluacion.explicacion });
  }
  if (evaluacion.estado === 'POSIBLE_COBERTURA') {
    evidencia.push({
      categoria: 'HIPOTESIS',
      texto: `La incidencia «${incidencia.titulo}» (${incidencia.categoria}) PODRÍA relacionarse con las coberturas: ${evaluacion.coberturasIdentificadas.join(', ')}. Hipótesis sujeta al clausulado y al peritaje.`,
      polizaId: evaluacion.polizaPrincipal?.id,
    });
  } else if (evaluacion.estado === 'PENDIENTE_VERIFICACION') {
    evidencia.push({
      categoria: 'HIPOTESIS',
      texto: `Existen pólizas activas pero sin coincidencia explícita con la categoría ${incidencia.categoria}; no se descarta cobertura (p. ej. RC o todo riesgo).`,
    });
  }
  evidencia.push({
    categoria: 'CONCLUSION_PENDIENTE_REVISION',
    texto: `Cobertura de «${incidencia.titulo}» PENDIENTE DE REVISIÓN: contrastar con la póliza original y, en su caso, con el dictamen de la aseguradora.`,
  });

  return {
    vinculante: false,
    evidencia,
    polizasPotencialmenteRelacionadas: evaluacion.polizasAplicables,
    documentacionDisponible,
    aviso: AVISO_COBERTURA_NO_AUTOMATICA,
  };
}

/**
 * Contexto estructurado para una futura IA documental: localizar coberturas,
 * exclusiones, franquicias y documentos relevantes. La IA NO afirma cobertura
 * ni sustituye el documento original (preparación, no decisión).
 */
export function prepararContextoIaCobertura(
  incidencia: Pick<Incidencia, 'id' | 'categoria' | 'titulo' | 'descripcion'>,
  polizas: PolizaSeguro[]
): {
  finalidad: string;
  incidencia: { id: string; categoria: string; titulo: string; descripcion: string };
  polizas: {
    id: string;
    aseguradora: string;
    numeroPoliza: string;
    tipo: TipoPolizaSeguro;
    estado: EstadoPolizaSeguro;
    coberturas: string[];
    exclusiones: string[];
    franquicia?: number;
    condiciones?: string;
    documentos: { id: string; nombre: string; categoria?: string; fechaSubida: string }[];
  }[];
  limitaciones: string[];
} {
  return {
    finalidad:
      'Preparar datos para asistencia IA (localizar coberturas/exclusiones/franquicias y documentación potencialmente relevante). No es una decisión de cobertura.',
    incidencia: {
      id: incidencia.id,
      categoria: incidencia.categoria,
      titulo: incidencia.titulo,
      descripcion: incidencia.descripcion,
    },
    polizas: polizas.map((p) => ({
      id: p.id,
      aseguradora: p.aseguradora,
      numeroPoliza: p.numeroPoliza,
      tipo: p.tipo,
      estado: p.estado,
      coberturas: p.coberturas || [],
      exclusiones: p.exclusiones || [],
      franquicia: p.franquicia,
      condiciones: p.condiciones,
      documentos: (p.documentos || []).map((d) => ({
        id: d.id,
        nombre: d.nombre,
        categoria: String(d.categoria || d.tipo || 'OTRO'),
        fechaSubida: d.fechaSubida,
      })),
    })),
    limitaciones: [
      'NO afirmar cobertura: la conclusión es siempre pendiente de revisión humana.',
      'NO sustituir el documento original de la póliza.',
      'NO modificar la póliza ni tomar decisiones jurídicas.',
      AVISO_COBERTURA_NO_AUTOMATICA,
    ],
  };
}

// ============================================================================
// RESUMEN OPERATIVO DEL INMUEBLE (agregador puro)
// ============================================================================

export interface AlertaOperativaInmueble {
  id: string;
  severidad: 'INFO' | 'AVISO' | 'URGENTE';
  tipo:
    | 'RENOVACION_POLIZA'
    | 'GARANTIA_VENCIMIENTO'
    | 'COBRO_RETRASADO'
    | 'INCIDENCIA_ABIERTA'
    | 'MANTENIMIENTO_PROGRAMADO'
    | 'CONTRATO_VENCIMIENTO';
  mensaje: string;
  entidadId?: string;
}

export interface ResumenOperativoInmueble {
  inmuebleId: string;
  inmuebleDireccion: string;
  generadoEl: string;
  situacion: {
    estado: Inmueble['estado'];
    modalidadAlquiler?: Inmueble['modalidadAlquiler'];
    contratoActivoId?: string;
    inquilinoActualNombre?: string;
  };
  cobros: {
    totalPeriodos: number;
    cobrados: number;
    pendientes: number;
    retrasados: number;
    totalPrevisto: number;
    totalRecibido: number;
    proximos: CobroPeriodo[];
  };
  gastosRecientes: Gasto[];
  incidenciasAbiertas: Incidencia[];
  mantenimientosPendientes: TareaMantenimiento[];
  garantiasProximas: GarantiaReparacion[];
  polizas: { total: number; activas: PolizaSeguro[] };
  renovacionesProximas: { poliza: PolizaSeguro; ventana: EstadoVentanaRenovacion }[];
  documentacion: { documentosPoliza: number; documentosRenovacion: number };
  alertas: AlertaOperativaInmueble[];
}

const ESTADOS_INCIDENCIA_ABIERTA: Incidencia['estado'][] = [
  'ABIERTA',
  'REGISTRADA',
  'REPORTADA',
  'EN_VALORACION',
  'PRESUPUESTOS',
  'ASIGNADA',
  'EN_REPARACION',
  'EN_CURSO',
];

const ESTADOS_COBRO_COMPLETADO: CobroPeriodo['estado'][] = ['RECIBIDO', 'VERIFICADO', 'PAGADO'];
const ESTADOS_COBRO_RETRASADO: CobroPeriodo['estado'][] = ['RETRASADO', 'IMPAGADO', 'RECLAMADO', 'DEVUELTO', 'INCIDENCIA'];
const ESTADOS_COBRO_PROXIMO: CobroPeriodo['estado'][] = ['PENDIENTE', 'PAGADO_PARCIAL'];

export interface EntradaResumenOperativo {
  inmueble: Inmueble;
  cobros?: CobroPeriodo[];
  gastos?: Gasto[];
  incidencias?: Incidencia[];
  tareasMantenimiento?: TareaMantenimiento[];
  garantias?: GarantiaReparacion[];
  polizas?: PolizaSeguro[];
  contratos?: ContratoFormalizacion[];
  hoyISO?: string;
  diasGarantiaProxima?: number;
  diasMantenimientoProximo?: number;
  maxGastosRecientes?: number;
}

/**
 * Agrega la situación operativa del inmueble a partir de colecciones ya
 * existentes (enlazadas, no duplicadas). Es puro: recibe arrays completos y
 * filtra por `inmuebleId`.
 */
export function construirResumenOperativoInmueble(entrada: EntradaResumenOperativo): ResumenOperativoInmueble {
  const { inmueble } = entrada;
  const hoy = entrada.hoyISO || new Date().toISOString();
  const hoyFecha = hoy.slice(0, 10);

  const cobros = (entrada.cobros || []).filter((c) => c.inmuebleId === inmueble.id);
  const cobrados = cobros.filter((c) => ESTADOS_COBRO_COMPLETADO.includes(c.estado));
  const retrasados = cobros.filter((c) => ESTADOS_COBRO_RETRASADO.includes(c.estado));
  const proximos = cobros
    .filter((c) => ESTADOS_COBRO_PROXIMO.includes(c.estado))
    .sort((a, b) => a.periodoMesAnio.localeCompare(b.periodoMesAnio))
    .slice(0, 3);

  const gastos = (entrada.gastos || [])
    .filter((g) => g.inmuebleId === inmueble.id)
    .sort((a, b) => (b.fechaDevengo || b.fechaPago || '').localeCompare(a.fechaDevengo || a.fechaPago || ''))
    .slice(0, entrada.maxGastosRecientes ?? 5);

  const incidencias = (entrada.incidencias || []).filter((i) => i.inmuebleId === inmueble.id);
  const incidenciasAbiertas = incidencias.filter((i) => ESTADOS_INCIDENCIA_ABIERTA.includes(i.estado));

  const diasMant = entrada.diasMantenimientoProximo ?? 30;
  const mantenimientos = (entrada.tareasMantenimiento || [])
    .filter((t) => t.inmuebleId === inmueble.id && (t.activa || t.activo))
    .filter((t) => (t.proximaFecha || '') <= sumarDias(hoyFecha, diasMant))
    .sort((a, b) => (a.proximaFecha || '').localeCompare(b.proximaFecha || ''));

  const diasGar = entrada.diasGarantiaProxima ?? 60;
  const garantias = (entrada.garantias || [])
    .filter((g) => g.inmuebleId === inmueble.id && g.estado === 'ACTIVA')
    .filter((g) => (g.fechaFin || '') <= sumarDias(hoyFecha, diasGar))
    .sort((a, b) => (a.fechaFin || '').localeCompare(b.fechaFin || ''));

  const polizasInmueble = (entrada.polizas || []).filter(
    (p) => p.inmuebleId === inmueble.id || (!p.inmuebleId && p.propietarioId === inmueble.propietarioId)
  );
  const polizasActivas = polizasInmueble.filter((p) => p.estado === 'VIGENTE');
  const renovaciones = detectarRenovacionesInmueble(polizasInmueble, hoy);

  const contratos = (entrada.contratos || []).filter((c) => c.inmuebleId === inmueble.id);
  const contratoActivo = contratos.find((c) => c.estado === 'FORMALIZADO_ACTIVO' || c.esVigente);

  const documentosPoliza = polizasInmueble.reduce((n, p) => n + (p.documentos?.length || 0), 0);
  const documentosRenovacion = polizasInmueble.reduce((n, p) => n + (p.documentosRenovacion?.length || 0), 0);

  const alertas: AlertaOperativaInmueble[] = [];
  for (const { poliza, ventana } of renovaciones) {
    alertas.push({
      id: `alerta_pol_${poliza.id}`,
      severidad: ventana.vencida ? 'URGENTE' : ventana.diasRestantes <= 15 ? 'AVISO' : 'INFO',
      tipo: 'RENOVACION_POLIZA',
      mensaje: ventana.vencida
        ? `Póliza ${poliza.aseguradora} (Nº ${poliza.numeroPoliza}) VENCIDA`
        : `Póliza ${poliza.aseguradora} (Nº ${poliza.numeroPoliza}) vence en ${ventana.diasRestantes} día(s) — ventana de renovación`,
      entidadId: poliza.id,
    });
  }
  for (const cobro of retrasados.slice(0, 3)) {
    alertas.push({
      id: `alerta_cobro_${cobro.id}`,
      severidad: 'AVISO',
      tipo: 'COBRO_RETRASADO',
      mensaje: `Cobro retrasado: ${cobro.nombreMes} — ${cobro.inquilinoNombre || 'inquilino'}`,
      entidadId: cobro.id,
    });
  }
  for (const incidencia of incidenciasAbiertas.slice(0, 5)) {
    alertas.push({
      id: `alerta_inc_${incidencia.id}`,
      severidad: incidencia.prioridad === 'URGENTE' ? 'URGENTE' : 'INFO',
      tipo: 'INCIDENCIA_ABIERTA',
      mensaje: `Incidencia abierta (${incidencia.categoria}): ${incidencia.titulo}`,
      entidadId: incidencia.id,
    });
  }
  for (const garantia of garantias.slice(0, 3)) {
    alertas.push({
      id: `alerta_gar_${garantia.id}`,
      severidad: 'INFO',
      tipo: 'GARANTIA_VENCIMIENTO',
      mensaje: `Garantía «${garantia.titulo}» próxima a vencer (${garantia.fechaFin})`,
      entidadId: garantia.id,
    });
  }
  for (const tarea of mantenimientos.slice(0, 3)) {
    alertas.push({
      id: `alerta_mant_${tarea.id}`,
      severidad: 'INFO',
      tipo: 'MANTENIMIENTO_PROGRAMADO',
      mensaje: `Mantenimiento programado: ${tarea.titulo} (${tarea.proximaFecha})`,
      entidadId: tarea.id,
    });
  }

  return {
    inmuebleId: inmueble.id,
    inmuebleDireccion: inmueble.direccion,
    generadoEl: hoy,
    situacion: {
      estado: inmueble.estado,
      modalidadAlquiler: inmueble.modalidadAlquiler,
      contratoActivoId: inmueble.contratoActivoId || contratoActivo?.id,
      inquilinoActualNombre: inmueble.inquilinoActualNombre,
    },
    cobros: {
      totalPeriodos: cobros.length,
      cobrados: cobrados.length,
      pendientes: cobros.length - cobrados.length - retrasados.length,
      retrasados: retrasados.length,
      totalPrevisto: cobros.reduce((s, c) => s + (c.importePrevisto || 0), 0),
      totalRecibido: cobros.reduce((s, c) => s + (c.importeRecibido || 0), 0),
      proximos,
    },
    gastosRecientes: gastos,
    incidenciasAbiertas,
    mantenimientosPendientes: mantenimientos,
    garantiasProximas: garantias,
    polizas: { total: polizasInmueble.length, activas: polizasActivas },
    renovacionesProximas: renovaciones,
    documentacion: { documentosPoliza, documentosRenovacion },
    alertas,
  };
}

function sumarDias(fechaISO: string, dias: number): string {
  const d = new Date(fechaISO);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Pólizas de un inmueble (mismo criterio que el resumen y la evaluación). */
export function polizasDelInmueble(polizas: PolizaSeguro[], inmueble: Inmueble): PolizaSeguro[] {
  return polizas.filter(
    (p) => p.inmuebleId === inmueble.id || (!p.inmuebleId && p.propietarioId === inmueble.propietarioId)
  );
}
