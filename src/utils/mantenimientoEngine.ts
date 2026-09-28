// =========================================================================
// MOTOR DE MANTENIMIENTO PREVENTIVO, GARANTÍAS Y SEGUIMIENTO POST-REPARACIÓN
// =========================================================================

import { formatDateInputLocal } from './formatters';
import {
  TareaMantenimiento,
  PlanMantenimiento,
  GarantiaReparacion,
  PeriodicidadMantenimiento,
  TipoMantenimiento,
  EstadoSeguimientoMantenimiento,
  EstadoGarantia,
  TrabajoProfesional,
  Incidencia,
  ActuacionMantenimientoHistorial,
  Gasto,
} from '../types';

export const TIPO_MANTENIMIENTO_LABELS: Record<TipoMantenimiento, string> = {
  PREVENTIVO: 'Preventivo',
  CORRECTIVO: 'Correctivo',
  REVISION: 'Revisión Oficial',
  GARANTIA: 'Garantía',
  LEGAL_OBLIGATORIO: 'Legal / Obligatorio',
  INSTALACIONES_CLIMA: 'Instalaciones y Climatización',
  OTRO: 'Otro Mantenimiento',
};

export const PERIODICIDAD_LABELS: Record<
  PeriodicidadMantenimiento,
  { label: string; mesesPaso: number; descripcion: string }
> = {
  PUNTUAL: { label: 'Puntual / Única vez', mesesPaso: 0, descripcion: 'Actuación única sin recurrencia automática' },
  UNICA: { label: 'Única vez', mesesPaso: 0, descripcion: 'Actuación única no periódica' },
  MENSUAL: { label: 'Mensual', mesesPaso: 1, descripcion: 'Cada 1 mes' },
  BIMESTRAL: { label: 'Bimestral', mesesPaso: 2, descripcion: 'Cada 2 meses' },
  TRIMESTRAL: { label: 'Trimestral', mesesPaso: 3, descripcion: 'Cada 3 meses (estacional)' },
  SEMESTRAL: { label: 'Semestral', mesesPaso: 6, descripcion: 'Cada 6 meses' },
  ANUAL: { label: 'Anual', mesesPaso: 12, descripcion: 'Cada 12 meses (revisión oficial / RITE)' },
  BIENAL: { label: 'Bienal', mesesPaso: 24, descripcion: 'Cada 2 años' },
  QUINQUENAL: { label: 'Quinquenal', mesesPaso: 60, descripcion: 'Cada 5 años (ITE / IEE)' },
  PERSONALIZADA: { label: 'Personalizada', mesesPaso: 0, descripcion: 'Intervalo específico de días' },
};

export const ESTADO_SEGUIMIENTO_LABELS: Record<
  EstadoSeguimientoMantenimiento,
  { label: string; badgeClass: string; iconName: string }
> = {
  ACTIVO: { label: 'Activo', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200', iconName: 'Activity' },
  FUTURO: { label: 'Programado', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', iconName: 'Calendar' },
  PROXIMO: { label: 'Próximo a Vencer', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 font-semibold', iconName: 'Clock' },
  VENCIDO: { label: 'Vencido / Pendiente', badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-bold', iconName: 'AlertTriangle' },
  EN_CURSO: { label: 'En Curso / En Obra', badgeClass: 'bg-cyan-100 text-cyan-800 border-cyan-300', iconName: 'Wrench' },
  COMPLETADO: { label: 'Completado', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold', iconName: 'CheckCircle' },
  CANCELADO: { label: 'Cancelado', badgeClass: 'bg-zinc-100 text-zinc-600 border-zinc-200', iconName: 'XCircle' },
  INACTIVO: { label: 'Pausado / Inactivo', badgeClass: 'bg-zinc-100 text-zinc-500 border-zinc-200', iconName: 'Pause' },
};

export const ESTADO_GARANTIA_LABELS: Record<
  EstadoGarantia,
  { label: string; badgeClass: string; descripcion: string }
> = {
  ACTIVA: {
    label: 'Garantía Activa',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold',
    descripcion: 'Dentro del plazo legal o contractual de cobertura',
  },
  VENCIDA: {
    label: 'Garantía Expirada',
    badgeClass: 'bg-zinc-100 text-zinc-600 border-zinc-200',
    descripcion: 'El periodo de garantía ha concluido',
  },
  SIN_GARANTIA: {
    label: 'Sin Garantía',
    badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
    descripcion: 'Intervención o material sin periodo de garantía aplicable',
  },
  RECLAMADA: {
    label: 'Garantía Reclamada',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 font-bold',
    descripcion: 'Incidencia abierta amparada bajo reclamación de garantía',
  },
};

interface FechaCalendario {
  year: number;
  month: number;
  day: number;
}

function esBisiesto(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function diasEnMes(year: number, month: number): number {
  if (month === 2) return esBisiesto(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function fechaCalendarioValida(fecha: FechaCalendario | null): fecha is FechaCalendario {
  return !!fecha
    && Number.isInteger(fecha.year) && fecha.year >= 1 && fecha.year <= 9999
    && Number.isInteger(fecha.month) && fecha.month >= 1 && fecha.month <= 12
    && Number.isInteger(fecha.day) && fecha.day >= 1 && fecha.day <= diasEnMes(fecha.year, fecha.month);
}

function parsearFechaCalendario(valor: string): FechaCalendario | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) return null;
  const fecha = { year: Number(partes[1]), month: Number(partes[2]), day: Number(partes[3]) };
  return fechaCalendarioValida(fecha) ? fecha : null;
}

function formatearFechaCalendario(fecha: FechaCalendario): string {
  return `${String(fecha.year).padStart(4, '0')}-${String(fecha.month).padStart(2, '0')}-${String(fecha.day).padStart(2, '0')}`;
}

/**
 * Suma meses de calendario manteniendo el día numérico cuando existe en el mes
 * destino; si no existe, lo limita al último día de ese mes. No conserva una
 * marca de “fin de mes”: así `2026-02-28 + 6 meses` sigue siendo `2026-08-28`,
 * que es la semántica ya fijada por la regresión existente.
 */
function sumarMesesCalendario(fecha: FechaCalendario, meses: number): FechaCalendario {
  const total = fecha.year * 12 + (fecha.month - 1) + Math.trunc(meses);
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12 + 1;
  return { year, month, day: Math.min(fecha.day, diasEnMes(year, month)) };
}

/** Suma días a una fecha civil sin convertirla en un instante horario. */
function sumarDiasCalendario(fecha: FechaCalendario, dias: number): FechaCalendario {
  let { year, month, day } = fecha;
  let restantes = Math.trunc(dias);
  while (restantes > 0) {
    const hastaFinDeMes = diasEnMes(year, month) - day;
    if (restantes <= hastaFinDeMes) {
      day += restantes;
      restantes = 0;
    } else {
      restantes -= hastaFinDeMes + 1;
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return { year, month, day };
}

/** Lee una fecha ISO como fecha civil; los instantes se interpretan en zona local. */
function leerFechaCalendario(fechaReferencia: string | Date): FechaCalendario | null {
  if (typeof fechaReferencia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaReferencia)) {
    return parsearFechaCalendario(fechaReferencia);
  }
  const fecha = typeof fechaReferencia === 'string' ? new Date(fechaReferencia) : new Date(fechaReferencia);
  if (!Number.isFinite(fecha.getTime())) return null;
  const local = { year: fecha.getFullYear(), month: fecha.getMonth() + 1, day: fecha.getDate() };
  return fechaCalendarioValida(local) ? local : null;
}

/**
 * Calcula la próxima fecha de mantenimiento con aritmética de fecha civil.
 */
export function calcularProximaFechaMantenimiento(
  fechaReferencia: string | Date,
  periodicidad: PeriodicidadMantenimiento,
  diasIntervaloPersonalizado?: number
): string {
  const fecha = leerFechaCalendario(fechaReferencia);
  if (!fecha) return formatDateInputLocal();

  if (periodicidad === 'PUNTUAL' || periodicidad === 'UNICA') {
    return formatearFechaCalendario(fecha);
  }

  if (periodicidad === 'PERSONALIZADA') {
    const dias = Number.isFinite(diasIntervaloPersonalizado) && diasIntervaloPersonalizado! > 0
      ? Math.trunc(diasIntervaloPersonalizado!)
      : 30;
    return formatearFechaCalendario(sumarDiasCalendario(fecha, dias));
  }

  const def = PERIODICIDAD_LABELS[periodicidad];
  const meses = def ? def.mesesPaso : 12;
  return formatearFechaCalendario(sumarMesesCalendario(fecha, meses));
}

/**
 * Evalúa el estado de seguimiento temporal de un mantenimiento preventivo.
 */
export function evaluarEstadoSeguimiento(
  proximaFecha: string,
  activa: boolean,
  diasVentanaProximo: number = 30,
  enCurso: boolean = false,
  fechaRef: Date = new Date()
): EstadoSeguimientoMantenimiento {
  if (!activa) return 'INACTIVO';
  if (enCurso) return 'EN_CURSO';
  if (!proximaFecha) return 'FUTURO';

  const hoyStr = formatDateInputLocal(fechaRef);
  const fechaProximaStr = proximaFecha.slice(0, 10);

  if (fechaProximaStr < hoyStr) {
    return 'VENCIDO';
  }

  const limiteProximo = new Date(`${hoyStr}T00:00:00.000Z`);
  limiteProximo.setUTCDate(limiteProximo.getUTCDate() + diasVentanaProximo);
  const limiteProximoStr = limiteProximo.toISOString().slice(0, 10);

  if (fechaProximaStr <= limiteProximoStr) {
    return 'PROXIMO';
  }

  return 'FUTURO';
}

/**
 * Registra una actuación realizada y actualiza el ciclo determinista.
 */
export function marcarActuacionRealizada(params: {
  plan: TareaMantenimiento;
  fechaRealizacion?: string;
  costeReal?: number;
  ordenTrabajoId?: string;
  profesionalId?: string;
  profesionalNombre?: string;
  gastoId?: string;
  observaciones?: string;
  realizadoPor?: string;
}): {
  planActualizado: TareaMantenimiento;
  proximaFechaCalculada?: string;
  actuacionHistorial: ActuacionMantenimientoHistorial;
} {
  const {
    plan,
    fechaRealizacion = new Date().toISOString().slice(0, 10),
    costeReal,
    ordenTrabajoId,
    profesionalId,
    profesionalNombre,
    gastoId,
    observaciones,
    realizadoPor = 'Gestor Patrimonial',
  } = params;

  const actuacionHistorial: ActuacionMantenimientoHistorial = {
    id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    fecha: new Date().toISOString(),
    fechaRealizacion,
    ordenTrabajoId: ordenTrabajoId || plan.ultimaOrdenTrabajoId,
    profesionalId: profesionalId || plan.profesionalPreferidoId,
    profesionalNombre: profesionalNombre || plan.profesionalPreferidoNombre,
    costeReal,
    gastoId,
    observaciones: observaciones || `Actuación realizada en fecha ${fechaRealizacion}`,
    realizadoPor,
  };

  const esPuntual = plan.periodicidad === 'PUNTUAL' || plan.periodicidad === 'UNICA';

  let proximaFecha = plan.proximaFecha;
  let activa = plan.activa;
  let estadoSeguimiento: EstadoSeguimientoMantenimiento = 'COMPLETADO';

  if (esPuntual) {
    activa = false;
    estadoSeguimiento = 'COMPLETADO';
  } else {
    proximaFecha = calcularProximaFechaMantenimiento(
      fechaRealizacion,
      plan.periodicidad,
      plan.diasIntervaloPersonalizado
    );
    estadoSeguimiento = evaluarEstadoSeguimiento(proximaFecha, activa);
  }

  const planActualizado: TareaMantenimiento = {
    ...plan,
    activa,
    ultimaFecha: fechaRealizacion,
    ultimaFechaRealizada: fechaRealizacion,
    proximaFecha,
    estadoSeguimiento,
    ultimoCosteReal: typeof costeReal === 'number' ? costeReal : plan.ultimoCosteReal,
    ultimaOrdenTrabajoId: ordenTrabajoId || plan.ultimaOrdenTrabajoId,
    ultimoGastoId: gastoId || plan.ultimoGastoId,
    historialActuaciones: [...(plan.historialActuaciones || []), actuacionHistorial],
    updatedAt: new Date().toISOString(),
  };

  return {
    planActualizado,
    proximaFechaCalculada: proximaFecha,
    actuacionHistorial,
  };
}

/**
 * Genera de forma IDEMPOTENTE una Orden de Trabajo preventiva a partir de un mantenimiento.
 */
export function generarOrdenTrabajoPreventiva(params: {
  plan: TareaMantenimiento;
  trabajosExistentes?: TrabajoProfesional[];
  usuarioNombre?: string;
  usuarioId?: string;
}): { trabajo?: TrabajoProfesional; yaExiste: boolean; error?: string } {
  const { plan, trabajosExistentes = [], usuarioNombre = 'Gestor Patrimonial', usuarioId } = params;

  if (!plan.inmuebleId) {
    return { yaExiste: false, error: 'El mantenimiento no tiene un inmueble asociado.' };
  }

  // Comprobar si ya existe una OT en curso o asociada a este mantenimiento que no esté cancelada
  const existente = trabajosExistentes.find(
    (t) =>
      (t.id === plan.ultimaOrdenTrabajoId || (t.observaciones && t.observaciones.includes(plan.id))) &&
      t.estado !== 'CANCELADO' &&
      t.estado !== 'CANCELADA' &&
      t.estado !== 'FINALIZADO' &&
      t.estado !== 'FINALIZADA'
  );

  if (existente) {
    return { trabajo: existente, yaExiste: true };
  }

  const trabajoId = `ot_prev_${plan.id.slice(-6)}_${Date.now().toString().slice(-4)}`;
  const now = new Date().toISOString();

  const nuevaOT: TrabajoProfesional = {
    id: trabajoId,
    propietarioId: plan.propietarioId,
    inmuebleId: plan.inmuebleId,
    inmuebleDireccion: plan.inmuebleDireccion,
    titulo: `Mantenimiento Preventivo: ${plan.titulo}`,
    descripcion: plan.descripcion || `Revisión periódica programada para ${plan.titulo}`,
    tipoTrabajo: 'MANTENIMIENTO_PREVENTIVO',
    categoria: plan.categoria || 'MANTENIMIENTO',
    prioridad: 'NORMAL',
    estado: 'PENDIENTE',
    fechaSolicitud: now,
    fechaInicio: plan.proximaFecha ? `${plan.proximaFecha}T09:00:00Z` : undefined,
    profesionalId: plan.profesionalPreferidoId || undefined,
    profesionalNombre: plan.profesionalPreferidoNombre || undefined,
    importeEstimado: plan.costeEstimado,
    observaciones: `Generada automáticamente desde el plan de mantenimiento preventivo ID: ${plan.id}`,
    creadoPor: usuarioNombre,
    actualizadoPor: usuarioNombre,
    historial: [
      {
        id: `hist_${Date.now()}`,
        fecha: now,
        usuario: usuarioNombre,
        accion: 'TRABAJO_CREADO',
        estadoNuevo: 'PENDIENTE',
        observacion: `Orden preventiva generada a partir del plan "${plan.titulo}"`,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  return { trabajo: nuevaOT, yaExiste: false };
}

/**
 * Calcula la fecha de finalización de una garantía en base a la fecha de inicio y duración en meses.
 */
export function calcularFechaFinGarantia(fechaInicio: string, duracionMeses: number): string {
  // Las garantías son fechas civiles. Se conserva el número de día y, si el mes
  // destino no lo tiene, se limita a su último día (p. ej. 31-08 + 6 meses = 28-02).
  const fecha = parsearFechaCalendario((fechaInicio || '').slice(0, 10));
  if (!fecha) return formatDateInputLocal();
  const meses = Number.isFinite(duracionMeses) && duracionMeses > 0 ? Math.trunc(duracionMeses) : 6;
  return formatearFechaCalendario(sumarMesesCalendario(fecha, meses));
}

/**
 * Evalúa si una garantía se encuentra activa o vencida respecto a una fecha de referencia.
 */
export function evaluarEstadoGarantia(
  fechaFin: string,
  estadoActual?: EstadoGarantia,
  fechaRef: Date = new Date()
): EstadoGarantia {
  if (estadoActual === 'SIN_GARANTIA' || estadoActual === 'RECLAMADA') {
    return estadoActual;
  }
  if (!fechaFin) return 'SIN_GARANTIA';

  const hoyStr = formatDateInputLocal(fechaRef);
  const finStr = fechaFin.slice(0, 10);

  return finStr >= hoyStr ? 'ACTIVA' : 'VENCIDA';
}

/**
 * Registra una garantía post-reparación a partir de una OT finalizada (IDEMPOTENTE).
 */
export function registrarGarantiaDesdeTrabajo(params: {
  trabajo: TrabajoProfesional;
  duracionMeses?: number;
  cobertura?: string;
  garantiasExistentes?: GarantiaReparacion[];
  usuarioNombre?: string;
}): { garantia?: GarantiaReparacion; yaExiste: boolean } {
  const {
    trabajo,
    duracionMeses = 6,
    cobertura = 'Piezas, materiales y mano de obra conforme a factura',
    garantiasExistentes = [],
    usuarioNombre = 'Gestor Patrimonial',
  } = params;

  // Comprobar idempotencia: si ya existe garantía para este trabajoId
  const existente = garantiasExistentes.find((g) => g.trabajoId === trabajo.id);
  if (existente) {
    return { garantia: existente, yaExiste: true };
  }

  const fechaInicio = trabajo.fechaFinalizacion
    ? trabajo.fechaFinalizacion.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const fechaFin = calcularFechaFinGarantia(fechaInicio, duracionMeses);
  const estado = evaluarEstadoGarantia(fechaFin);
  const now = new Date().toISOString();

  const nuevaGarantia: GarantiaReparacion = {
    id: `gar_${trabajo.inmuebleId.slice(-6)}_${Date.now().toString().slice(-4)}`,
    inmuebleId: trabajo.inmuebleId,
    inmuebleDireccion: trabajo.inmuebleDireccion,
    propietarioId: trabajo.propietarioId,
    trabajoId: trabajo.id,
    incidenciaId: trabajo.incidenciaId,
    presupuestoId: trabajo.presupuestoId,
    gastoId: trabajo.gastoId,
    titulo: `Garantía: ${trabajo.titulo}`,
    concepto: trabajo.descripcion || trabajo.titulo,
    categoria: (trabajo.categoria as any) || 'REPARACION',
    proveedor: trabajo.profesionalNombre || 'Profesional / Contratista',
    profesionalId: trabajo.profesionalId,
    fechaInicio,
    duracionMeses,
    fechaFin,
    cobertura,
    estado,
    notas: `Garantía post-reparación registrada tras la finalización de la OT "${trabajo.titulo}" (ID: ${trabajo.id})`,
    creadoPor: usuarioNombre,
    createdAt: now,
    updatedAt: now,
  };

  return { garantia: nuevaGarantia, yaExiste: false };
}

/**
 * Detecta de forma consultiva si una nueva incidencia coincide con una garantía vigente.
 */
export function detectarPosibleGarantiaIncidencia(
  incidencia: Incidencia,
  garantias: GarantiaReparacion[] = []
): {
  tieneGarantia: boolean;
  garantiasAplicables: GarantiaReparacion[];
  sugerencia?: string;
} {
  if (!incidencia || !incidencia.inmuebleId || !Array.isArray(garantias)) {
    return { tieneGarantia: false, garantiasAplicables: [] };
  }

  const garantiasDelInmueble = garantias.filter(
    (g) => g.inmuebleId === incidencia.inmuebleId && g.estado === 'ACTIVA'
  );

  const aplicables = garantiasDelInmueble.filter((g) => {
    // Coincidencia por categoría o coincidencia semántica en título/concepto
    const matchCat = g.categoria && incidencia.categoria && g.categoria.toUpperCase() === incidencia.categoria.toUpperCase();
    const matchTitulo =
      (incidencia.titulo && g.titulo && (
        incidencia.titulo.toLowerCase().includes(g.categoria?.toLowerCase() || '') ||
        g.titulo.toLowerCase().includes(incidencia.categoria?.toLowerCase() || '')
      )) || false;

    return matchCat || matchTitulo;
  });

  if (aplicables.length === 0) {
    return { tieneGarantia: false, garantiasAplicables: [] };
  }

  const gPrincipal = aplicables[0];
  const sugerencia = `⚠️ Posible trabajo en garantía previa: Existe una garantía activa ("${gPrincipal.titulo}", proveedor: ${gPrincipal.proveedor}) con validez hasta el ${gPrincipal.fechaFin}. Conforme a la política de garantías, se recomienda contactar con el profesional emisor antes de aprobar presupuestos a terceros.`;

  return {
    tieneGarantia: true,
    garantiasAplicables: aplicables,
    sugerencia,
  };
}

/**
 * Resumen consolidado del estado de mantenimiento y garantías de un inmueble.
 */
export function resumenMantenimientoInmueble(
  inmuebleId: string,
  planes: TareaMantenimiento[] = [],
  garantias: GarantiaReparacion[] = [],
  trabajos: TrabajoProfesional[] = [],
  gastos: Gasto[] = []
): {
  totalPlanes: number;
  planesActivos: number;
  planesVencidos: number;
  planesProximos: number;
  garantiasActivas: number;
  proximaActuacion?: TareaMantenimiento;
  costeTotalRealMantenimiento: number;
} {
  const planesInm = planes.filter((p) => p.inmuebleId === inmuebleId);
  const garantiasInm = garantias.filter((g) => g.inmuebleId === inmuebleId);
  const trabajosInm = trabajos.filter((t) => t.inmuebleId === inmuebleId);
  const gastosInm = gastos.filter((g) => g.inmuebleId === inmuebleId && g.categoria === 'MANTENIMIENTO');

  let planesActivos = 0;
  let planesVencidos = 0;
  let planesProximos = 0;

  const ordenados = [...planesInm]
    .filter((p) => p.activa)
    .sort((a, b) => (a.proximaFecha || '').localeCompare(b.proximaFecha || ''));

  planesInm.forEach((p) => {
    if (p.activa) {
      planesActivos++;
      const est = evaluarEstadoSeguimiento(p.proximaFecha, p.activa);
      if (est === 'VENCIDO') planesVencidos++;
      if (est === 'PROXIMO') planesProximos++;
    }
  });

  // Calcular coste total real acumulado en mantenimiento
  let costeTotalRealMantenimiento = 0;
  planesInm.forEach((p) => {
    (p.historialActuaciones || []).forEach((act) => {
      if (typeof act.costeReal === 'number') {
        costeTotalRealMantenimiento += act.costeReal;
      }
    });
  });

  trabajosInm.forEach((t) => {
    if (t.tipoTrabajo === 'MANTENIMIENTO_PREVENTIVO' && typeof t.importeFinal === 'number') {
      costeTotalRealMantenimiento += t.importeFinal;
    }
  });

  const garantiasActivas = garantiasInm.filter((g) => g.estado === 'ACTIVA').length;

  return {
    totalPlanes: planesInm.length,
    planesActivos,
    planesVencidos,
    planesProximos,
    garantiasActivas,
    proximaActuacion: ordenados[0],
    costeTotalRealMantenimiento,
  };
}
