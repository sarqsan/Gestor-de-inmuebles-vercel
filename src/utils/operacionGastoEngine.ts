/**
 * BLOQUE 5 — OPERACIONES → FISCALIDAD (motor de cierre del circuito).
 * ---------------------------------------------------------------------------
 * Circuito que cierra este módulo:
 *
 *   INCIDENCIA → REPARACIÓN → PROVEEDOR → PRESUPUESTO → FACTURA → GASTO
 *              → DEDUCIBILIDAD → DOCUMENTO → INFORME FISCAL
 *
 * Principios (no duplicación):
 *  · El gasto se construye con `gastosEngine.crearGasto`/`normalizarGasto`
 *    (mismo catálogo de categorías, mismo período, mismas coherencias).
 *  · La deducibilidad la decide `deducibilidadEngine` (fuente única, cierre D1).
 *  · Los totales del informe salen de `fiscalEngine.calcularGastosEjercicio`.
 *  · Los puentes ya existentes NO se reimplementan:
 *      - Orden de trabajo → gasto: `gastosEngine.generarGastoDesdeTrabajo`.
 *      - Reforma → gasto: `reformasEngine.liquidarGastoDesdeProyecto`.
 *    Este motor cubre las operaciones patrimoniales que carecían de puente
 *    (incidencia/reparación directa, mantenimiento, suministro, seguro y
 *    factura de operación) y las del módulo de Operaciones.
 *  · Módulo PURO: no lee ni escribe Firestore/Storage, no usa reloj implícito
 *    ni aleatoriedad. La fecha de registro (`ahora`) y el propio `Gasto` los
 *    aporta el llamante; la persistencia la hace la capa que ya exista.
 *
 * Trazabilidad: cada gasto generado guarda `origen`+`origenId` (operación) y las
 * referencias reales (`facturaId`, `reparacionId`, `presupuestoId`,
 * `incidenciaId`, `proveedorId`, `suministroId`, `polizaId`, `lecturaId`) más
 * los documentos aportados. `reconstruirTrazabilidadGasto` reconstruye la cadena
 * a partir del propio gasto, por lo que sigue siendo auditable aunque el
 * documento de operación ya no esté cargado.
 */
import type {
  CategoriaGasto,
  EstadoGasto,
  Gasto,
  Inmueble,
  ContratoFormalizacion,
  LecturaSuministro,
  PolizaSeguro,
  TareaMantenimiento,
} from '../types';
import { categoriaDef, crearGasto, normalizarGasto, periodoDesdeFecha } from './gastosEngine';
import { analizarDeducibilidad, esGastoDeducible, type OrigenDecisionDeducibilidad } from './deducibilidadEngine';
import { calcularGastosEjercicio } from './fiscalEngine';
// Modelo del módulo de Operaciones (solo tipos: no acopla runtime entre módulos).
import type {
  DocumentoOperativo,
  EntidadOperativa,
  FacturaOperativa,
  ProveedorProfesional,
  ReparacionOperativa,
} from '../features/operaciones/contracts.ts';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Tipos de operación patrimonial con puente a gasto en este motor.
 * (Orden de trabajo y Proyecto de reforma tienen su puente canónico propio.)
 */
export type TipoOperacionGasto =
  | 'INCIDENCIA'
  | 'REPARACION'
  | 'MANTENIMIENTO'
  | 'SUMINISTRO'
  | 'SEGURO'
  | 'FACTURA';

/** Referencia documental aportada por la operación (sin inventar URLs). */
export interface DocumentoOperacionGasto {
  readonly id: string;
  readonly nombre: string;
  /** URL real existente; si no la hay se conserva solo la referencia. */
  readonly url?: string;
  /** Ruta/Referencia de Storage existente (arquitectura documental del ERP). */
  readonly storagePath?: string;
}

/** Operación patrimonial normalizada: entrada única del puente. */
export interface OperacionGasto {
  readonly tipo: TipoOperacionGasto;
  /** ID único de la operación (factura, reparación/actuación, factura suelta…). */
  readonly operacionId: string;
  /**
   * Ejecución concreta de una operación RECURRENTE (p. ej. la fecha de la
   * actuación de un plan de mantenimiento periódico). Se usa solo para la
   * identidad del documento: un reintento de la misma ejecución reescribe el
   * MISMO gasto, mientras que una ejecución distinta (otra fecha) genera el
   * gasto de esa ejecución. `origenId` sigue siendo `operacionId` para que el
   * gasto se pueda localizar por la operación/tarea.
   */
  readonly actuacionId?: string;
  /**
   * ID del documento de gasto YA asociado a esta ejecución en el modelo (p. ej.
   * `TareaMantenimiento.historialActuaciones[].gastoId`). Si existe, la
   * operación reescribe ESE documento en lugar de crear otro: la identidad la
   * aporta la fuente de verdad, no un contador nuevo, así que un registro
   * anterior (de cualquier versión del ERP) no se convierte en un duplicado.
   */
  readonly idGasto?: string;
  readonly inmuebleId: string;
  readonly propietarioId: string;
  /** Fecha del hecho económico (YYYY-MM-DD o ISO). */
  readonly fecha: string;
  /** Importe en EUR del hecho económico. */
  readonly importe: number;
  /** Categoría del catálogo de gastos; si falta se usa la de su tipo. */
  readonly categoria?: CategoriaGasto;
  /** Texto de concepto/descripción de la operación (se usa para el gasto). */
  readonly descripcion?: string;
  readonly concepto?: string;
  readonly contratoId?: string;
  readonly proveedor?: string;
  readonly proveedorId?: string;
  readonly profesionalId?: string;
  readonly incidenciaId?: string;
  readonly reparacionId?: string;
  readonly presupuestoId?: string;
  readonly facturaId?: string;
  readonly ordenTrabajoId?: string;
  readonly suministroId?: string;
  readonly polizaId?: string;
  readonly lecturaId?: string;
  readonly documentos?: readonly DocumentoOperacionGasto[];
  readonly estado?: EstadoGasto;
  readonly aCargoDe?: Gasto['aCargoDe'];
  /** Decisión humana de deducibilidad. Si falta NO se inventa: se infiere por categoría. */
  readonly deducible?: boolean;
  readonly ejercicioFiscal?: number;
  readonly metodoPago?: Gasto['metodoPago'];
  readonly notas?: string;
  readonly creadoPor?: string;
  readonly creadoPorId?: string;
}

export interface ResultadoGeneracionGasto {
  readonly gasto?: Gasto;
  readonly yaExiste: boolean;
  readonly error?: string;
}

/** Categoría por defecto de cada tipo de operación (`null` = debe aportarse). */
export const CATEGORIA_POR_TIPO: Readonly<Record<TipoOperacionGasto, CategoriaGasto | null>> = Object.freeze({
  INCIDENCIA: 'REPARACION',
  REPARACION: 'REPARACION',
  MANTENIMIENTO: 'MANTENIMIENTO',
  SUMINISTRO: 'SUMINISTROS',
  SEGURO: 'SEGUROS',
  FACTURA: null,
});

/** `Gasto.origen` canónico de cada tipo de operación (valores ya usados en el ERP). */
export const ORIGEN_POR_TIPO: Readonly<Record<TipoOperacionGasto, string>> = Object.freeze({
  INCIDENCIA: 'INCIDENCIA',
  REPARACION: 'REPARACION',
  MANTENIMIENTO: 'MANTENIMIENTO_PREVENTIVO',
  SUMINISTRO: 'SUMINISTRO',
  SEGURO: 'SEGURO',
  FACTURA: 'FACTURA',
});

export const ETIQUETA_TIPO_OPERACION: Readonly<Record<TipoOperacionGasto, string>> = Object.freeze({
  INCIDENCIA: 'Incidencia',
  REPARACION: 'Reparación',
  MANTENIMIENTO: 'Mantenimiento',
  SUMINISTRO: 'Suministro',
  SEGURO: 'Seguro',
  FACTURA: 'Factura',
});

const ORIGENES_OPERACION: readonly string[] = Object.freeze(Object.values(ORIGEN_POR_TIPO));

// ---------------------------------------------------------------------------
// Identidad determinista e idempotencia
// ---------------------------------------------------------------------------

/** Normaliza una referencia a un tramo válido de ID de documento. */
export function referenciaIdSegura(valor: string): string {
  return (valor || '')
    .trim()
    .replace(/[^A-Za-z0-9_.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 120);
}

/**
 * ID determinista del gasto de una operación: `gop_<tipo>_<operacionId>`.
 * Determinista ⇒ un reintento reescribe el MISMO documento (idempotencia real,
 * sin depender de una lectura previa) y la procedencia queda visible en el ID.
 */
export function idGastoDeOperacion(
  operacion: Pick<OperacionGasto, 'tipo' | 'operacionId'> & {
    readonly actuacionId?: string;
    readonly idGasto?: string;
  }
): string {
  const explicito = typeof operacion.idGasto === 'string' ? operacion.idGasto.trim() : '';
  if (explicito) return explicito;
  const base = `gop_${operacion.tipo.toLowerCase()}_${referenciaIdSegura(operacion.operacionId)}`;
  return operacion.actuacionId ? `${base}_${referenciaIdSegura(operacion.actuacionId)}` : base;
}

/** ¿Es un gasto generado por este puente de operaciones? */
export function esGastoDeOperacion(gasto: Pick<Gasto, 'origen' | 'origenId'>): boolean {
  return typeof gasto.origen === 'string'
    && ORIGENES_OPERACION.includes(gasto.origen)
    && typeof gasto.origenId === 'string'
    && gasto.origenId.length > 0;
}

/**
 * Busca el gasto ya existente de una operación (idempotencia).
 * Criterios (en orden): ID determinista → `origenId`+`origen` → referencias
 * explícitas de factura/reparación. No duplica por contenido ni por importe.
 */
export function buscarGastoDeOperacion(
  gastos: readonly Gasto[] | undefined,
  operacion: Pick<OperacionGasto, 'tipo' | 'operacionId' | 'facturaId' | 'reparacionId'>
): Gasto | undefined {
  if (!Array.isArray(gastos) || gastos.length === 0) return undefined;
  const id = idGastoDeOperacion(operacion);
  const origen = ORIGEN_POR_TIPO[operacion.tipo];
  return gastos.find((g) => g.id === id)
    || gastos.find((g) => g.origenId === operacion.operacionId && g.origen === origen)
    || (operacion.facturaId ? gastos.find((g) => g.facturaId === operacion.facturaId) : undefined)
    || (operacion.reparacionId ? gastos.find((g) => g.reparacionId === operacion.reparacionId) : undefined);
}

// ---------------------------------------------------------------------------
// Validación (aislamiento por inmueble/propietario incluido)
// ---------------------------------------------------------------------------

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;

function fechaValida(fecha?: string): boolean {
  if (!fecha || !FECHA_ISO.test(fecha)) return false;
  return !Number.isNaN(Date.parse(fecha));
}

/**
 * Valida que la operación pueda convertirse en gasto. Comprueba, además del
 * contenido, que el inmueble exista y que pertenezca al propietario declarado:
 * una operación nunca debe acabar asociada accidentalmente a otro inmueble.
 */
export function puedeGenerarGastoDesdeOperacion(
  operacion?: Partial<OperacionGasto> | null,
  inmuebles?: readonly Inmueble[]
): { valido: boolean; motivo?: string } {
  if (!operacion) return { valido: false, motivo: 'No se ha proporcionado la operación' };
  const tipo = operacion.tipo as TipoOperacionGasto | undefined;
  if (!tipo || !Object.prototype.hasOwnProperty.call(CATEGORIA_POR_TIPO, tipo)) {
    return { valido: false, motivo: 'Tipo de operación desconocido' };
  }
  if (!operacion.operacionId || !operacion.operacionId.trim() || !referenciaIdSegura(operacion.operacionId)) {
    return { valido: false, motivo: 'La operación necesita un ID estable' };
  }
  // Una operación anulada no genera gasto con independencia del resto de datos:
  // el rechazo no debe depender de si además le falta categoría o importe.
  if (operacion.estado === 'ANULADO') {
    return { valido: false, motivo: 'Una operación anulada no genera gasto; conserva el documento original' };
  }
  if (!operacion.inmuebleId) return { valido: false, motivo: 'La operación no tiene inmueble asociado' };
  if (!operacion.propietarioId) return { valido: false, motivo: 'La operación no tiene propietario asociado' };
  if (!fechaValida(operacion.fecha)) return { valido: false, motivo: 'La operación no tiene una fecha válida' };
  const importe = operacion.importe;
  if (typeof importe !== 'number' || !Number.isFinite(importe) || importe <= 0) {
    return { valido: false, motivo: 'El importe de la operación debe ser un número mayor que cero (0 €)' };
  }
  const categoria = operacion.categoria ?? CATEGORIA_POR_TIPO[tipo];
  if (!categoria) {
    return { valido: false, motivo: `La operación de tipo ${tipo} necesita categoría explícita (no se infiere)` };
  }
  if (inmuebles && inmuebles.length > 0) {
    const inmueble = inmuebles.find((i) => i.id === operacion.inmuebleId);
    if (!inmueble) return { valido: false, motivo: 'El inmueble de la operación no existe en el ámbito aportado' };
    const titulares = [inmueble.propietarioId, inmueble.propietarioPrincipalId, inmueble.propietarioSecundarioId]
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (!titulares.includes(operacion.propietarioId)) {
      return { valido: false, motivo: 'El inmueble no pertenece al propietario declarado (aislamiento por inmueble)' };
    }
  }
  return { valido: true };
}

// ---------------------------------------------------------------------------
// Construcción del gasto
// ---------------------------------------------------------------------------

/** Referencias de la operación ya normalizadas (rellenan el ID propio si falta). */
function referenciasDe(operacion: OperacionGasto): Partial<Gasto> {
  const refs: Partial<Gasto> = {
    facturaId: operacion.facturaId,
    reparacionId: operacion.reparacionId,
    presupuestoId: operacion.presupuestoId,
    incidenciaId: operacion.incidenciaId,
    proveedorId: operacion.proveedorId,
    profesionalId: operacion.profesionalId,
    suministroId: operacion.suministroId,
    polizaId: operacion.polizaId,
    lecturaId: operacion.lecturaId,
    trabajoId: operacion.ordenTrabajoId,
    ordenTrabajoId: operacion.ordenTrabajoId,
  };
  if (operacion.tipo === 'INCIDENCIA' && !refs.incidenciaId) refs.incidenciaId = operacion.operacionId;
  if (operacion.tipo === 'REPARACION' && !refs.reparacionId) refs.reparacionId = operacion.operacionId;
  if (operacion.tipo === 'FACTURA' && !refs.facturaId) refs.facturaId = operacion.operacionId;
  if (operacion.tipo === 'SUMINISTRO' && !refs.suministroId) refs.suministroId = operacion.operacionId;
  if (operacion.tipo === 'SEGURO' && !refs.polizaId) refs.polizaId = operacion.operacionId;
  return Object.fromEntries(Object.entries(refs).filter(([, v]) => typeof v === 'string' && v.length > 0));
}

/** Documentos aportados, sin duplicar y sin inventar URL. */
export function documentosDeOperacion(
  documentos?: readonly DocumentoOperacionGasto[]
): Gasto['documentos'] {
  if (!documentos || documentos.length === 0) return undefined;
  const vistos = new Set<string>();
  const salida: NonNullable<Gasto['documentos']> = [];
  for (const d of documentos) {
    if (!d || typeof d.id !== 'string' || !d.id.trim() || vistos.has(d.id)) continue;
    vistos.add(d.id);
    salida.push({
      id: d.id,
      nombre: d.nombre || d.id,
      url: d.url ?? '',
      ...(d.storagePath ? { storagePath: d.storagePath } : {}),
    });
  }
  return salida.length > 0 ? salida : undefined;
}

/**
 * Convierte una operación patrimonial en `Gasto` reutilizando el motor de gastos.
 * No persiste nada: devuelve el documento y si ya existía (idempotencia).
 */
export function generarGastoDesdeOperacion(params: {
  operacion: OperacionGasto;
  inmuebles?: readonly Inmueble[];
  gastosExistentes?: readonly Gasto[];
  usuarioNombre?: string;
  usuarioId?: string;
  estadoGasto?: EstadoGasto;
  /** ISO de registro; mantiene el motor determinista y auditable. */
  ahora?: string;
}): ResultadoGeneracionGasto {
  const { operacion, inmuebles, gastosExistentes, usuarioNombre, usuarioId, estadoGasto = 'PAGADO', ahora } = params;

  const check = puedeGenerarGastoDesdeOperacion(operacion, inmuebles);
  if (!check.valido) return { yaExiste: false, error: check.motivo };

  const existente = buscarGastoDeOperacion(gastosExistentes, operacion);
  if (existente) return { gasto: existente, yaExiste: true };

  const categoria = (operacion.categoria ?? CATEGORIA_POR_TIPO[operacion.tipo]) as CategoriaGasto;
  const fechaDevengo = operacion.fecha.slice(0, 10);
  // `concepto` es el texto FINAL si la operación lo aporta (permite conservar el
  // literal histórico de cada escritor); si no, se compone etiqueta + descripción.
  const descripcion = (operacion.descripcion ?? '').trim();
  const concepto = (operacion.concepto ?? '').trim()
    || (descripcion
      ? `${ETIQUETA_TIPO_OPERACION[operacion.tipo]}: ${descripcion}`
      : `${ETIQUETA_TIPO_OPERACION[operacion.tipo]} ${operacion.operacionId}`);

  const base = crearGasto({
    inmuebleId: operacion.inmuebleId,
    propietarioId: operacion.propietarioId,
    categoria,
    concepto,
    importe: operacion.importe,
    fechaDevengo,
    contratoId: operacion.contratoId,
    creadoPor: operacion.creadoPor ?? usuarioNombre,
    creadoPorId: operacion.creadoPorId ?? usuarioId,
  });

  const documentos = documentosDeOperacion(operacion.documentos);
  const normalizado = normalizarGasto({
    ...base,
    ...referenciasDe(operacion),
    id: idGastoDeOperacion(operacion),
    concepto,
    importe: operacion.importe,
    estado: estadoGasto,
    aCargoDe: operacion.aCargoDe ?? base.aCargoDe,
    // La decisión de deducibilidad NO se inventa: si la operación no la declara
    // queda sin marcar y la resuelve la fuente única (por categoría).
    ...(typeof operacion.deducible === 'boolean' ? { deducible: operacion.deducible } : {}),
    ...(operacion.proveedor ? { proveedor: operacion.proveedor } : {}),
    ...(operacion.ejercicioFiscal ? { ejercicioFiscal: operacion.ejercicioFiscal } : {}),
    ...(operacion.metodoPago ? { metodoPago: operacion.metodoPago } : {}),
    notas: operacion.notas
      ?? `Gasto generado desde ${ETIQUETA_TIPO_OPERACION[operacion.tipo].toLowerCase()} de operación (ID: ${operacion.operacionId})`,
    origen: ORIGEN_POR_TIPO[operacion.tipo],
    origenId: operacion.operacionId,
    ...(documentos && documentos.length > 0 ? { documento: documentos[0], documentos } : {}),
  });

  const gasto: Gasto = ahora ? { ...normalizado, createdAt: ahora, updatedAt: ahora } : normalizado;
  // Coherencia final: período derivado del devengo (normalizarGasto ya lo hace,
  // pero se garantiza también cuando el devengo llega explícito).
  if (!gasto.periodoMesAnio) gasto.periodoMesAnio = periodoDesdeFecha(gasto.fechaDevengo);

  return { gasto, yaExiste: false };
}

// ---------------------------------------------------------------------------
// Trazabilidad reconstruible
// ---------------------------------------------------------------------------

export type EslabonCadena =
  | 'INMUEBLE'
  | 'INCIDENCIA'
  | 'REPARACION'
  | 'ORDEN_TRABAJO'
  | 'PROVEEDOR'
  | 'PRESUPUESTO'
  | 'FACTURA'
  | 'SUMINISTRO'
  | 'LECTURA'
  | 'SEGURO'
  | 'GASTO'
  | 'DEDUCIBILIDAD'
  | 'DOCUMENTO';

export interface EslabonTrazabilidad {
  readonly eslabon: EslabonCadena;
  readonly id?: string;
  readonly detalle?: string;
}

export interface TrazabilidadGasto {
  readonly gastoId: string;
  readonly eslabones: readonly EslabonTrazabilidad[];
  /** Pasos de la cadena presentes (las relaciones son condicionales por tipo). */
  readonly presencia: {
    readonly incidencia: boolean;
    readonly reparacion: boolean;
    readonly ordenTrabajo: boolean;
    readonly proveedor: boolean;
    readonly presupuesto: boolean;
    readonly factura: boolean;
    readonly suministro: boolean;
    readonly lectura: boolean;
    readonly seguro: boolean;
    readonly documento: boolean;
  };
  /** Avisos reales, no errores: cadena incompleta o decisión no inferible. */
  readonly avisos: readonly string[];
}

/**
 * Reconstruye de dónde procede un gasto usando SOLO el propio gasto (los
 * vínculos se persisten en él), de modo que la auditoría no depende de cargar
 * de nuevo el expediente operativo.
 */
export function reconstruirTrazabilidadGasto(gasto: Gasto): TrazabilidadGasto {
  const docs = [
    ...(gasto.documento ? [gasto.documento] : []),
    ...(gasto.documentos ?? []),
  ];
  const documentosUnicos = Array.from(new Map(docs.map((d) => [d.id, d])).values());
  const { deducible, origenDecision } = analizarDeducibilidad(gasto);

  const eslabones: EslabonTrazabilidad[] = [{ eslabon: 'INMUEBLE', id: gasto.inmuebleId }];
  if (gasto.incidenciaId) eslabones.push({ eslabon: 'INCIDENCIA', id: gasto.incidenciaId });
  if (gasto.reparacionId) eslabones.push({ eslabon: 'REPARACION', id: gasto.reparacionId });
  const ordenTrabajoId = gasto.ordenTrabajoId || gasto.trabajoId;
  if (ordenTrabajoId) eslabones.push({ eslabon: 'ORDEN_TRABAJO', id: ordenTrabajoId });
  if (gasto.proveedorId || gasto.proveedor) {
    eslabones.push({ eslabon: 'PROVEEDOR', id: gasto.proveedorId, detalle: gasto.proveedor });
  }
  if (gasto.presupuestoId) eslabones.push({ eslabon: 'PRESUPUESTO', id: gasto.presupuestoId });
  if (gasto.facturaId) eslabones.push({ eslabon: 'FACTURA', id: gasto.facturaId });
  if (gasto.suministroId) eslabones.push({ eslabon: 'SUMINISTRO', id: gasto.suministroId });
  if (gasto.lecturaId) eslabones.push({ eslabon: 'LECTURA', id: gasto.lecturaId });
  if (gasto.polizaId) eslabones.push({ eslabon: 'SEGURO', id: gasto.polizaId });
  eslabones.push({ eslabon: 'GASTO', id: gasto.id });
  eslabones.push({
    eslabon: 'DEDUCIBILIDAD',
    detalle: `${deducible ? 'DEDUCIBLE' : 'NO DEDUCIBLE'} (${origenDecision})`,
  });
  for (const d of documentosUnicos) eslabones.push({ eslabon: 'DOCUMENTO', id: d.id, detalle: d.nombre });

  const presencia = {
    incidencia: !!gasto.incidenciaId,
    reparacion: !!gasto.reparacionId,
    ordenTrabajo: !!ordenTrabajoId,
    proveedor: !!(gasto.proveedorId || gasto.proveedor),
    presupuesto: !!gasto.presupuestoId,
    factura: !!gasto.facturaId,
    suministro: !!gasto.suministroId,
    lectura: !!gasto.lecturaId,
    seguro: !!gasto.polizaId,
    documento: documentosUnicos.length > 0,
  } as const;

  const avisos: string[] = [];
  if (!esGastoDeOperacion(gasto)) avisos.push('SIN_OPERACION: el gasto no declara operación de origen (origen+origenId)');
  if (documentosUnicos.length === 0) avisos.push('SIN_DOCUMENTO: no hay factura/comprobante asociado al gasto');
  if (origenDecision === 'NO_INFERIBLE') avisos.push('DEDUCIBILIDAD_NO_INFERIBLE: categoría fuera de la lista cerrada y sin decisión explícita');
  return { gastoId: gasto.id, eslabones, presencia, avisos };
}

// ---------------------------------------------------------------------------
// Informe fiscal de operaciones (salida del circuito)
// ---------------------------------------------------------------------------

export interface FilaInformeFiscalOperacion {
  readonly gastoId: string;
  readonly inmuebleId: string;
  readonly ejercicio: number;
  readonly fecha: string;
  readonly importe: number;
  readonly categoria: CategoriaGasto;
  readonly concepto: string;
  readonly deducible: boolean;
  readonly origenDecision: OrigenDecisionDeducibilidad;
  readonly procedenciaOperativa: boolean;
  readonly origen?: string;
  readonly origenId?: string;
  readonly incidenciaId?: string;
  readonly reparacionId?: string;
  readonly proveedorId?: string;
  readonly proveedor?: string;
  readonly presupuestoId?: string;
  readonly facturaId?: string;
  readonly suministroId?: string;
  readonly polizaId?: string;
  readonly documentoIds: readonly string[];
  readonly trazabilidad: TrazabilidadGasto;
}

export interface IncidenciaInformeFiscalOperacion {
  readonly codigo: 'SIN_DOCUMENTO' | 'DEDUCIBILIDAD_NO_INFERIBLE' | 'SIN_OPERACION' | 'GASTO_ANULADO';
  readonly descripcion: string;
  readonly gastoId: string;
}

export interface InformeFiscalOperaciones {
  readonly ejercicio: number;
  readonly inmuebleId?: string;
  readonly propietarioId?: string;
  readonly filas: readonly FilaInformeFiscalOperacion[];
  /** Totales del motor fiscal existente (no se recalcula nada por separado). */
  readonly totales: {
    readonly total: number;
    readonly totalDeducible: number;
    readonly totalNoDeducible: number;
    readonly count: number;
    readonly countDeducible: number;
    readonly countNoDeducible: number;
  };
  readonly incidencias: readonly IncidenciaInformeFiscalOperacion[];
}

/**
 * Salida fiscal del circuito: cada gasto con su trazabilidad hasta la operación
 * original y los totales del motor fiscal (`calcularGastosEjercicio`), que a su
 * vez usa la fuente única de deducibilidad. No crea un segundo informe fiscal:
 * prepara las filas trazables que consumen los informes existentes.
 *
 * Coherencia fiscal (heredada de los contratos existentes):
 *  · los gastos ANULADO no computan ni aparecen como fila (se informan como
 *    incidencia `GASTO_ANULADO`);
 *  · el ejercicio lo decide `calcularGastosEjercicio` (devengo/pago/alias o
 *    `ejercicioFiscal`), no este módulo;
 *  · `total`/`totalDeducible`/`totalNoDeducible` suman las mismas filas que se
 *    devuelven, de modo que el informe nunca muestra importes que no liste.
 */
export function generarInformeFiscalOperaciones(params: {
  gastos: readonly Gasto[];
  ejercicio: number;
  inmuebles?: readonly Inmueble[];
  contratos?: readonly ContratoFormalizacion[];
  inmuebleId?: string;
  propietarioId?: string;
  /** true ⇒ solo gastos con procedencia operativa trazable (circuito BLOQUE 5). */
  soloOperaciones?: boolean;
}): InformeFiscalOperaciones {
  const { gastos, ejercicio, inmuebleId, propietarioId, soloOperaciones = false } = params;
  const delAlcance = gastos.filter((g) =>
    (!inmuebleId || g.inmuebleId === inmuebleId)
    && (!propietarioId || g.propietarioId === propietarioId)
  );
  // El motor fiscal existente decide el ejercicio (fecha de devengo/pago/alias
  // o `ejercicioFiscal`) y la deducibilidad; aquí no se duplica esa lógica.
  const gastosEjercicio = calcularGastosEjercicio([...delAlcance], ejercicio);
  // Un gasto ANULADO no computa en el informe (misma semántica que
  // `calcularGastosEjercicio.total` y los agregados fiscales del ERP): se
  // informa aparte como incidencia, nunca como fila ni como importe.
  const considerados = gastosEjercicio.gastos.filter((g) =>
    g.estado !== 'ANULADO' && (!soloOperaciones || esGastoDeOperacion(g)));

  const filas: FilaInformeFiscalOperacion[] = considerados
    .map((g) => {
      const trazabilidad = reconstruirTrazabilidadGasto(g);
      const documentos = [
        ...(g.documento ? [g.documento] : []),
        ...(g.documentos ?? []),
      ];
      return {
        gastoId: g.id,
        inmuebleId: g.inmuebleId,
        ejercicio,
        fecha: (g.fechaDevengo || g.fechaPago || g.fecha || g.createdAt || '').slice(0, 10),
        importe: Number(g.importe) || 0,
        categoria: g.categoria,
        concepto: g.concepto,
        deducible: esGastoDeducible(g),
        origenDecision: analizarDeducibilidad(g).origenDecision,
        procedenciaOperativa: esGastoDeOperacion(g),
        origen: g.origen,
        origenId: g.origenId,
        incidenciaId: g.incidenciaId,
        reparacionId: g.reparacionId,
        proveedorId: g.proveedorId,
        proveedor: g.proveedor,
        presupuestoId: g.presupuestoId,
        facturaId: g.facturaId,
        suministroId: g.suministroId,
        polizaId: g.polizaId,
        documentoIds: Array.from(new Set(documentos.map((d) => d.id))),
        trazabilidad,
      } satisfies FilaInformeFiscalOperacion;
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.gastoId.localeCompare(b.gastoId));

  const incidencias: IncidenciaInformeFiscalOperacion[] = [];
  for (const g of delAlcance) {
    if (g.estado === 'ANULADO') {
      incidencias.push({ codigo: 'GASTO_ANULADO', descripcion: `Gasto ${g.id} ANULADO: no computa en el informe`, gastoId: g.id });
    }
  }
  for (const f of filas) {
    if (!f.trazabilidad.presencia.documento) {
      incidencias.push({ codigo: 'SIN_DOCUMENTO', descripcion: `Gasto ${f.gastoId} sin factura/comprobante asociado`, gastoId: f.gastoId });
    }
    if (!f.procedenciaOperativa) {
      incidencias.push({ codigo: 'SIN_OPERACION', descripcion: `Gasto ${f.gastoId} sin operación de origen declarada`, gastoId: f.gastoId });
    }
    if (f.origenDecision === 'NO_INFERIBLE') {
      incidencias.push({ codigo: 'DEDUCIBILIDAD_NO_INFERIBLE', descripcion: `Gasto ${f.gastoId} sin decisión de deducibilidad y categoría no inferible`, gastoId: f.gastoId });
    }
  }

  return {
    ejercicio,
    inmuebleId,
    propietarioId,
    filas,
    totales: {
      total: considerados.reduce((sum, g) => sum + (Number(g.importe) || 0), 0),
      totalDeducible: filas.filter((f) => f.deducible).reduce((sum, f) => sum + f.importe, 0),
      totalNoDeducible: filas.filter((f) => !f.deducible).reduce((sum, f) => sum + f.importe, 0),
      count: filas.length,
      countDeducible: filas.filter((f) => f.deducible).length,
      countNoDeducible: filas.filter((f) => !f.deducible).length,
    },
    incidencias,
  };
}

// ---------------------------------------------------------------------------
// Adaptador del módulo de Operaciones (entidades operativas → operación)
// ---------------------------------------------------------------------------

/** Documentos vinculados a una entidad operativa (referencias, sin duplicar). */
export function documentosDeEntidadOperativa(
  entidades: readonly EntidadOperativa[],
  entidad: { readonly documentoIds?: readonly string[] }
): DocumentoOperacionGasto[] {
  const ids = Array.isArray(entidad?.documentoIds) ? entidad.documentoIds : [];
  const porId = new Map<string, DocumentoOperativo>();
  for (const e of entidades) if (e.tipo === 'documento') porId.set(e.id, e);
  return ids
    .map((id) => porId.get(id))
    .filter((d): d is DocumentoOperativo => !!d)
    .map((d) => ({
      id: d.archivo.id || d.id,
      nombre: d.archivo.nombreArchivo || d.descripcion || d.id,
      ...(d.archivo.storagePath ? { storagePath: d.archivo.storagePath } : {}),
    }));
}

function proveedorDe(entidades: readonly EntidadOperativa[], proveedorId?: string): ProveedorProfesional | undefined {
  if (!proveedorId) return undefined;
  return entidades.find((e): e is ProveedorProfesional => e.tipo === 'proveedor' && e.id === proveedorId);
}

/**
 * Factura del módulo de Operaciones → operación normalizada del puente.
 * La cadena (incidencia → avería → reparación → proveedor → presupuesto) sale
 * del propio vínculo de la factura: no se infiere nada que no esté declarado.
 */
export function operacionDesdeFacturaOperativa(
  entidades: readonly EntidadOperativa[],
  facturaId: string,
  propietarioId: string
): OperacionGasto | null {
  const factura = entidades.find((e): e is FacturaOperativa => e.tipo === 'factura' && e.id === facturaId);
  if (!factura) return null;
  // Una factura anulada conserva su documento original pero no genera gasto.
  if (factura.estado === 'ANULADA') return null;
  const reparacion = factura.vinculo?.reparacionId
    ? entidades.find((e): e is ReparacionOperativa => e.tipo === 'reparacion' && e.id === factura.vinculo?.reparacionId)
    : undefined;
  const proveedor = proveedorDe(entidades, factura.proveedorId);
  const documentos = [
    ...documentosDeEntidadOperativa(entidades, factura),
    ...(reparacion ? documentosDeEntidadOperativa(entidades, reparacion) : []),
  ];
  const descripcion = factura.conceptos?.[0]?.descripcion || factura.referencia;
  return {
    tipo: 'FACTURA',
    operacionId: factura.id,
    inmuebleId: factura.ambito.inmuebleId,
    propietarioId,
    fecha: factura.fecha,
    importe: factura.importeCentimos / 100,
    categoria: reparacion ? 'REPARACION' : undefined,
    descripcion,
    concepto: `Factura ${factura.referencia}`,
    proveedor: proveedor?.nombre,
    proveedorId: factura.proveedorId,
    presupuestoId: factura.presupuestoId,
    facturaId: factura.id,
    incidenciaId: factura.vinculo?.incidenciaId,
    reparacionId: factura.vinculo?.reparacionId,
    documentos,
    estado: 'PAGADO',
    metodoPago: 'transferencia',
  };
}

/**
 * Reparación/actuación finalizada del módulo de Operaciones → operación
 * normalizada (se usa cuando no se desea esperar a la factura del proveedor).
 */
export function operacionDesdeReparacionOperativa(
  entidades: readonly EntidadOperativa[],
  reparacionId: string,
  propietarioId: string
): OperacionGasto | null {
  const reparacion = entidades.find((e): e is ReparacionOperativa => e.tipo === 'reparacion' && e.id === reparacionId);
  if (!reparacion) return null;
  // Solo una actuación terminada con coste real puede convertirse en gasto
  // (misma semántica que el puente canónico de órdenes de trabajo).
  if (reparacion.estado !== 'FINALIZADA') return null;
  if (!(typeof reparacion.costeCentimos === 'number' && reparacion.costeCentimos > 0)) return null;
  const proveedor = proveedorDe(entidades, reparacion.proveedorId);
  return {
    tipo: 'REPARACION',
    operacionId: reparacion.id,
    inmuebleId: reparacion.ambito.inmuebleId,
    propietarioId,
    fecha: reparacion.fechaFin || reparacion.fechaInicio || reparacion.fechaPrevista || '',
    importe: (reparacion.costeCentimos ?? 0) / 100,
    categoria: 'REPARACION',
    descripcion: reparacion.descripcion,
    concepto: reparacion.descripcion,
    proveedor: proveedor?.nombre,
    proveedorId: reparacion.proveedorId,
    presupuestoId: reparacion.presupuestoId,
    reparacionId: reparacion.id,
    incidenciaId: reparacion.incidenciaId,
    documentos: documentosDeEntidadOperativa(entidades, reparacion),
    estado: 'PAGADO',
    metodoPago: 'transferencia',
  };
}

/** Entidades del inmueble/propietario (los catálogos viven por propietario). */
export function entidadesDelInmueble(
  entidades: readonly EntidadOperativa[],
  propietarioId: string,
  inmuebleId: string
): EntidadOperativa[] {
  return entidades.filter((e) => (e.tipo === 'proveedor'
    ? e.propietarioId === propietarioId
    : e.ambito.inmuebleId === inmuebleId && e.ambito.propietarioId === propietarioId));
}

// ---------------------------------------------------------------------------
// Adaptadores de los escritores/operaciones del modelo patrimonial existente
// ---------------------------------------------------------------------------

/**
 * Documentos de un plan de mantenimiento (referencias reales de Storage, sin
 * inventar URL): son los que acompañan a la actuación registrada.
 */
function documentosDeDocumentosMantenimiento(
  documentos?: TareaMantenimiento['documentos']
): DocumentoOperacionGasto[] {
  if (!Array.isArray(documentos)) return [];
  return documentos
    .filter((d) => !!d && typeof d.id === 'string' && d.id.trim().length > 0)
    .map((d) => ({
      id: d.id,
      nombre: d.nombre || d.id,
      url: d.url ?? '',
      ...(d.storagePath ? { storagePath: d.storagePath } : {}),
    }));
}

/**
 * Actuación de mantenimiento (escritor real `RegistrarActuacionModal`) →
 * operación normalizada del puente.
 *
 * Decisiones (BLOQUE 5, fix de duplicidad):
 *  · `operacionId` = la TAREA ⇒ `origen`/`origenId` identifican la operación de
 *    origen y `buscarGastoDeOperacion` localiza el gasto por la tarea.
 *  · `actuacionId` = fecha de la actuación ⇒ el ID del gasto es determinista
 *    (`gop_mantenimiento_<tarea>_<fecha>`): repetir el guardado reescribe el
 *    mismo documento (no duplica) y una actuación posterior del mismo plan
 *    conserva su propio gasto (un plan periódico tiene N actuaciones reales).
 *  · Se conserva el concepto histórico (`Mantenimiento: <título> (<profesional>)`),
 *    el importe, el estado PAGADO, el devengo, las notas de factura y los
 *    vínculos ya existentes (OT e incidencia de la tarea).
 *  · La categoría MANTENIMIENTO y su tratamiento fiscal (deducible) los resuelve
 *    el catálogo de `gastosEngine`/`deducibilidadEngine`, igual que antes.
 * Devuelve `null` si la actuación no puede ser un hecho económico con importe
 * (sin coste real > 0 o sin fecha válida): no se genera gasto parcial.
 */
export function operacionDesdeTareaMantenimiento(
  tarea: TareaMantenimiento,
  ejecucion: {
    fechaRealizacion: string;
    costeReal?: number;
    profesionalId?: string;
    profesionalNombre?: string;
    observaciones?: string;
    numFactura?: string;
    ordenTrabajoId?: string;
    /** ID del gasto que el modelo ya asocia a esta misma actuación, si lo hay. */
    gastoIdExistente?: string;
  }
): OperacionGasto | null {
  if (!tarea || !tarea.id || !tarea.inmuebleId || !tarea.propietarioId) return null;
  const fecha = (ejecucion?.fechaRealizacion || '').slice(0, 10);
  if (!fechaValida(fecha)) return null;
  const coste = ejecucion?.costeReal;
  if (typeof coste !== 'number' || !Number.isFinite(coste) || coste <= 0) return null;

  const profesional = (ejecucion.profesionalNombre ?? tarea.profesionalPreferidoNombre ?? '').trim();
  const observaciones = (ejecucion.observaciones ?? '').trim();
  const numFactura = (ejecucion.numFactura ?? '').trim();
  const notas = numFactura
    ? `Factura nº ${numFactura}.${observaciones ? ` ${observaciones}` : ''}`
    : (observaciones || undefined);

  return {
    tipo: 'MANTENIMIENTO',
    operacionId: tarea.id,
    actuacionId: fecha,
    inmuebleId: tarea.inmuebleId,
    propietarioId: tarea.propietarioId,
    fecha,
    importe: coste,
    categoria: 'MANTENIMIENTO',
    descripcion: tarea.titulo,
    concepto: `Mantenimiento: ${tarea.titulo}${profesional ? ` (${profesional})` : ''}`,
    proveedor: profesional || 'Servicio Técnico',
    proveedorId: ejecucion.profesionalId ?? tarea.profesionalPreferidoId,
    ordenTrabajoId: ejecucion.ordenTrabajoId ?? tarea.ultimaOrdenTrabajoId,
    incidenciaId: tarea.ultimaIncidenciaId,
    documentos: documentosDeDocumentosMantenimiento(tarea.documentos),
    estado: 'PAGADO',
    ...(notas ? { notas } : {}),
    ...(ejecucion.gastoIdExistente ? { idGasto: ejecucion.gastoIdExistente } : {}),
  };
}

/**
 * Documentos reales de una lectura de contador (foto en Storage privado). La
 * lectura NO aporta importe (el importe lo aporta la factura del suministro):
 * aquí solo se conserva la referencia documental y el vínculo `lecturaId`.
 */
export function documentosDeLecturaSuministro(lectura: LecturaSuministro): DocumentoOperacionGasto[] {
  if (!lectura || !lectura.id) return [];
  const fecha = (lectura.fechaLectura ?? '').slice(0, 10);
  return [{
    id: lectura.id,
    nombre: `Lectura de contador${fecha ? ` ${fecha}` : ''}`,
    url: '',
    ...(lectura.fotoStoragePath ? { storagePath: lectura.fotoStoragePath } : {}),
  }];
}

/** Documentos reales de una póliza (condiciones/recibos), sin inventar URL. */
export function documentosDePolizaSeguro(poliza: PolizaSeguro): DocumentoOperacionGasto[] {
  if (!poliza || !Array.isArray(poliza.documentos)) return [];
  return poliza.documentos
    .filter((d) => !!d && typeof d.id === 'string' && d.id.trim().length > 0)
    .map((d) => ({
      id: d.id,
      nombre: d.nombre || d.id,
      url: d.url ?? '',
      ...(d.storagePath ? { storagePath: d.storagePath } : {}),
    }));
}

/**
 * Gasto que el propio modelo ya asocia a una actuación concreta de un plan
 * (`historialActuaciones[].gastoId`, o `ultimoGastoId` si la última actuación
 * realizada es la misma fecha). Es la referencia que evita duplicar el gasto de
 * una actuación ya registrada antes de este puente.
 */
export function gastoIdDeActuacion(tarea: TareaMantenimiento, fechaRealizacion: string): string | undefined {
  if (!tarea || !fechaRealizacion) return undefined;
  const fecha = fechaRealizacion.slice(0, 10);
  const historial = Array.isArray(tarea.historialActuaciones) ? tarea.historialActuaciones : [];
  const deHistorial = [...historial]
    .reverse()
    .find((h) => (h?.fechaRealizacion ?? '').slice(0, 10) === fecha && !!h?.gastoId)?.gastoId;
  if (deHistorial) return deHistorial;
  if ((tarea.ultimaFechaRealizada ?? '').slice(0, 10) === fecha && tarea.ultimoGastoId) return tarea.ultimoGastoId;
  return undefined;
}
