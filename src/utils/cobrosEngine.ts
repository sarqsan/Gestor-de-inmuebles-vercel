import {
  CobroPeriodo,
  ContratoFormalizacion,
  EstadoCobroAlquiler,
  HistorialCobroItem,
  Inmueble,
  JustificanteCobro,
  UsuarioApp,
} from '../types';

export const MESES_NOMBRES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export interface ResumenFiscalInmuebleAnual {
  inmuebleId: string;
  inmuebleDireccion: string;
  inmuebleCiudad: string;
  referenciaCatastral?: string;
  propietarioId: string;
  propietarioNombre: string;
  anio: number;
  totalAnualPrevisto: number;
  totalAnualCobrado: number;
  totalAnualPendiente: number;
  totalAnualIncidencias: number;
  mesesCobradosCount: number;
  contratosPeriodos: {
    contratoId: string;
    inquilinoId: string;
    inquilinoNombre: string;
    inquilinoDni: string;
    fechaInicio: string;
    fechaFin?: string;
    rentaMensual: number;
    meses: {
      mes: number;
      nombreMes: string;
      importePrevisto: number;
      importeRecibido: number;
      fechaPago?: string;
      estado: EstadoCobroAlquiler;
      tieneJustificante: boolean;
      justificanteId?: string;
      justificanteNombre?: string;
    }[];
    subtotalCobrado: number;
  }[];
  justificantesCount: number;
}

export interface AlertaImpago {
  cobroId: string;
  contratoId: string;
  inmuebleId: string;
  inmuebleDireccion: string;
  propietarioId: string;
  inquilinoNombre?: string;
  periodo: string; // YYYY-MM
  nombreMes: string;
  fechaVencimiento: string;
  importePrevisto: number;
  importeRecibido: number;
  importePendiente: number;
  diasRetraso: number;
  estado: EstadoCobroAlquiler;
}

/**
 * Calcula días de retraso desde vencimiento hasta hoy (o fecha dada)
 */
export function calcularDiasRetraso(fechaVencimiento: string, fechaReferencia?: string): number {
  const venc = new Date(fechaVencimiento);
  if (isNaN(venc.getTime())) return 0;
  const ref = fechaReferencia ? new Date(fechaReferencia) : new Date();
  const diffMs = ref.getTime() - venc.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDias > 0 ? diffDias : 0;
}

/**
 * Determina si un recibo está vencido
 */
export function estaVencido(fechaVencimiento: string, fechaReferencia?: string): boolean {
  const venc = new Date(fechaVencimiento);
  if (isNaN(venc.getTime())) return false;
  const ref = fechaReferencia ? new Date(fechaReferencia) : new Date();
  return ref > venc;
}

/**
 * Determina el estado de cobro según importe y vencimiento
 * - Si importe recibido == previsto → PAGADO
 * - Si importe recibido >0 < previsto → PAGADO_PARCIAL
 * - Si importe 0 y vencido → IMPAGADO
 * - Si no vencido y 0 → PENDIENTE
 */
export function determinarEstadoCobro(
  importePrevisto: number,
  importeRecibido: number,
  fechaVencimiento: string,
  estadoActual?: EstadoCobroAlquiler
): EstadoCobroAlquiler {
  if (estadoActual === 'ANULADO') return 'ANULADO';
  const previsto = Number(importePrevisto) || 0;
  const recibido = Number(importeRecibido) || 0;

  if (recibido >= previsto && previsto > 0) {
    return 'PAGADO';
  }
  if (recibido > 0 && recibido < previsto) {
    return 'PAGADO_PARCIAL';
  }
  // recibido ==0
  if (estaVencido(fechaVencimiento)) {
    return 'IMPAGADO';
  }
  return 'PENDIENTE';
}

/**
 * Compatibilidad: mapea estados nuevos a antiguos para UI existente
 */
export function normalizarEstadoCobro(estado: EstadoCobroAlquiler): EstadoCobroAlquiler {
  // Mantener nuevos como principales, pero mapear antiguos a nuevos para lógica
  switch (estado) {
    case 'RECIBIDO':
    case 'VERIFICADO':
      return 'PAGADO';
    case 'RETRASADO':
      return 'IMPAGADO';
    case 'INCIDENCIA':
      return 'PAGADO_PARCIAL';
    default:
      return estado;
  }
}

/**
 * Genera o complementa los periodos mensuales de cobro para un contrato.
 * REGLA ESTRICTA: Los periodos que ya existen NO se recalculan ni sobrescriben.
 * Conservan su importe previsto original, pagos registrados, justificantes y trazabilidad.
 * Unicidad lógica: contratoId + periodo (periodoMesAnio)
 * NO duplica por modalidad habitaciones.
 */
export function generarPeriodosParaContrato(
  contrato: ContratoFormalizacion,
  limiteMesesFuturos: number = 2
): CobroPeriodo[] {
  // NO implementar cobros por habitación
  if (contrato.modalidadAlquiler === 'habitaciones') {
    // Retornar existentes sin generar nuevos por habitación
    return contrato.registroCobros ? [...contrato.registroCobros] : [];
  }

  const existingCobros = contrato.registroCobros || [];
  const existingMap = new Map<string, CobroPeriodo>();
  for (const c of existingCobros) {
    // Unicidad por periodoMesAnio
    existingMap.set(c.periodoMesAnio, c);
    // También por id para seguridad
    existingMap.set(c.id, c);
  }

  // Determinar fecha de inicio
  let startYear: number;
  let startMonth: number; // 1-12
  if (contrato.fechaInicioContrato && !isNaN(Date.parse(contrato.fechaInicioContrato))) {
    const d = new Date(contrato.fechaInicioContrato);
    startYear = d.getFullYear();
    startMonth = d.getMonth() + 1;
  } else {
    const d = new Date();
    startYear = d.getFullYear();
    startMonth = 1;
  }

  // Determinar fecha límite
  const hoy = new Date();
  const currentYear = hoy.getFullYear();
  const currentMonth = hoy.getMonth() + 1;

  let endYear = currentYear;
  let endMonth = currentMonth + limiteMesesFuturos;
  while (endMonth > 12) {
    endMonth -= 12;
    endYear += 1;
  }

  // Si el contrato está finalizado y tiene fecha de fin, no generar más allá del mes de fin
  if (!contrato.esVigente && contrato.fechaFinContrato && !isNaN(Date.parse(contrato.fechaFinContrato))) {
    const dFin = new Date(contrato.fechaFinContrato);
    const finYear = dFin.getFullYear();
    const finMonth = dFin.getMonth() + 1;
    if (finYear < endYear || (finYear === endYear && finMonth < endMonth)) {
      endYear = finYear;
      endMonth = finMonth;
    }
  }

  // Generar secuencia mensual
  const result: CobroPeriodo[] = [];
  let y = startYear;
  let m = startMonth;

  const diaLimite = Math.min(Math.max(contrato.diaLimitePagoMes || 5, 1), 28);
  const rentaContratada = Number(contrato.rentaMensual) || 0;

  while (y < endYear || (y === endYear && m <= endMonth)) {
    const periodoKey = `${y}-${String(m).padStart(2, '0')}`;
    const idKey = `cobro_${contrato.id}_${y}_${String(m).padStart(2, '0')}`;
    const existingByPeriodo = existingMap.get(periodoKey);
    const existingById = existingMap.get(idKey);
    const existing = existingByPeriodo || existingById;

    if (existing) {
      // Si ya existía, conservar intacto (no modificar retroactivamente)
      // Pero actualizar estado si está vencido y sigue pendiente (coherencia)
      const estadoActualizado = determinarEstadoCobro(
        existing.importePrevisto,
        existing.importeRecibido,
        existing.fechaVencimiento,
        existing.estado
      );
      // Solo auto-actualizar PENDIENTE→IMPAGADO, no tocar PAGADO/PARCIAL/ANULADO
      if (
        existing.estado !== estadoActualizado &&
        (existing.estado === 'PENDIENTE' || existing.estado === 'RETRASADO') &&
        (estadoActualizado === 'IMPAGADO' || estadoActualizado === 'PENDIENTE')
      ) {
        result.push({ ...existing, estado: estadoActualizado });
      } else {
        result.push(existing);
      }
    } else {
      // Crear nuevo periodo con los importes contratados
      const fechaVencimiento = `${y}-${String(m).padStart(2, '0')}-${String(diaLimite).padStart(2, '0')}`;
      const vencimientoDate = new Date(`${fechaVencimiento}T23:59:59`);
      const yaVencido = vencimientoDate < hoy;

      const estadoInicial = yaVencido ? 'IMPAGADO' : 'PENDIENTE';

      const nuevoPeriodo: CobroPeriodo = {
        id: idKey,
        inmuebleId: contrato.inmuebleId,
        contratoId: contrato.id,
        inquilinoId: contrato.candidatoId,
        propietarioId: contrato.propietarioId || '',

        inmuebleDireccion: contrato.inmuebleDireccion,
        inmuebleCiudad: contrato.inmuebleCiudad,
        inquilinoNombre: contrato.candidatoNombre,
        inquilinoDni: contrato.candidatoDni,
        inquilinoTelefono: contrato.candidatoTelefono,
        inquilinoEmail: contrato.candidatoEmail,
        propietarioNombre: contrato.propietarioNombre,

        mes: m,
        anio: y,
        periodoMesAnio: periodoKey,
        nombreMes: `${MESES_NOMBRES[m - 1]} ${y}`,

        importePrevisto: rentaContratada,
        importeRecibido: 0,
        fechaVencimiento,

        estado: estadoInicial,

        historialCambios: [
          {
            id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            fecha: new Date().toISOString(),
            usuarioNombre: 'Sistema',
            accion: 'Periodo generado según contrato vigente',
            detalles: `Importe previsto establecido en ${rentaContratada} € según condiciones del contrato`,
          },
        ],
      };

      result.push(nuevoPeriodo);
    }

    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  // Ordenar cronológicamente ascendente y asegurar unicidad final
  const uniqueMap = new Map<string, CobroPeriodo>();
  for (const p of result) {
    const key = `${p.contratoId}_${p.periodoMesAnio}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, p);
    }
  }

  return Array.from(uniqueMap.values()).sort((a, b) => {
    if (a.anio !== b.anio) return a.anio - b.anio;
    return a.mes - b.mes;
  });
}

/**
 * Asegura que un contrato tenga su registroCobros completo e inicializado.
 */
export function asegurarContratoCobros(contrato: ContratoFormalizacion): ContratoFormalizacion {
  const periodos = generarPeriodosParaContrato(contrato);
  return {
    ...contrato,
    registroCobros: periodos,
  };
}

/**
 * Obtiene todos los periodos de cobro de un inmueble físico determinado,
 * sumando los de su contrato activo y los de sus contratos anteriores.
 * Toda la historia se mantiene permanentemente vinculada al inmuebleId.
 */
export function obtenerCobrosInmueble(
  inmuebleId: string,
  contratos: ContratoFormalizacion[]
): CobroPeriodo[] {
  const inmuebleContratos = contratos.filter((c) => c.inmuebleId === inmuebleId);
  const todosPeriodos: CobroPeriodo[] = [];

  for (const contrato of inmuebleContratos) {
    const periodos = contrato.registroCobros && contrato.registroCobros.length > 0
      ? contrato.registroCobros
      : generarPeriodosParaContrato(contrato);
    todosPeriodos.push(...periodos);
  }

  // Ordenar por año y mes descendente (más recientes primero)
  return todosPeriodos.sort((a, b) => {
    if (a.anio !== b.anio) return b.anio - a.anio;
    return b.mes - a.mes;
  });
}

/**
 * Obtiene todos los periodos de cobro de una lista de contratos (ej. scoped para el usuario).
 */
export function obtenerTodosCobros(contratos: ContratoFormalizacion[]): CobroPeriodo[] {
  const todos: CobroPeriodo[] = [];
  for (const contrato of contratos) {
    const periodos = contrato.registroCobros && contrato.registroCobros.length > 0
      ? contrato.registroCobros
      : generarPeriodosParaContrato(contrato);
    todos.push(...periodos);
  }
  return todos.sort((a, b) => {
    if (a.anio !== b.anio) return b.anio - a.anio;
    return b.mes - a.mes;
  });
}

/**
 * Registra o actualiza el pago de un periodo mensual con trazabilidad inmutable.
 * Lógica de estados según orden:
 * - importe recibido = previsto → PAGADO
 * - importe recibido >0 < previsto → PAGADO_PARCIAL
 * - importe 0 y vencido → IMPAGADO
 */
export function registrarPagoPeriodo(
  contrato: ContratoFormalizacion,
  periodoId: string,
  datosPago: {
    importeRecibido: number;
    fechaPago: string;
    metodoPago?: 'transferencia' | 'domiciliacion' | 'bizum' | 'efectivo' | 'otro';
    estado?: EstadoCobroAlquiler;
    observaciones?: string;
    justificante?: JustificanteCobro;
    referenciaBancaria?: string;
  },
  usuario?: UsuarioApp | null
): ContratoFormalizacion {
  const periodos = generarPeriodosParaContrato(contrato);
  const idx = periodos.findIndex((p) => p.id === periodoId);
  if (idx === -1) return contrato;

  const actual = periodos[idx];

  // No alterar importe contractual original, solo registrar recibido
  const estadoCalculado = determinarEstadoCobro(
    actual.importePrevisto,
    datosPago.importeRecibido,
    actual.fechaVencimiento,
    actual.estado
  );

  const estadoNuevo: EstadoCobroAlquiler = datosPago.estado || estadoCalculado;

  const cambioItem: HistorialCobroItem = {
    id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    fecha: new Date().toISOString(),
    usuarioId: usuario?.id,
    usuarioNombre: usuario?.nombre || usuario?.email || 'Administrador',
    accion: actual.importeRecibido > 0 ? 'Modificación de pago' : 'Registro de pago recibido',
    estadoAnterior: actual.estado,
    estadoNuevo,
    importeAnterior: actual.importeRecibido,
    importeNuevo: datosPago.importeRecibido,
    detalles: datosPago.observaciones || `Cobro de ${datosPago.importeRecibido} € registrado el ${datosPago.fechaPago} - Estado: ${estadoNuevo}`,
  };

  const periodoActualizado: CobroPeriodo = {
    ...actual,
    importeRecibido: datosPago.importeRecibido,
    fechaPago: datosPago.fechaPago,
    metodoPago: datosPago.metodoPago || actual.metodoPago || 'transferencia',
    estado: estadoNuevo,
    observaciones: datosPago.observaciones !== undefined ? datosPago.observaciones : actual.observaciones,
    referenciaBancaria: datosPago.referenciaBancaria || actual.referenciaBancaria,
    justificante: datosPago.justificante || actual.justificante,
    registradoPor: usuario?.nombre || usuario?.email || 'Administrador',
    registradoPorId: usuario?.id,
    fechaRegistro: actual.fechaRegistro || new Date().toISOString(),
    ultimaModificacion: new Date().toISOString(),
    historialCambios: [cambioItem, ...actual.historialCambios],
  };

  const nuevosPeriodos = [...periodos];
  nuevosPeriodos[idx] = periodoActualizado;

  return {
    ...contrato,
    registroCobros: nuevosPeriodos,
    fechaActualizacion: new Date().toISOString(),
  };
}

/**
 * Registra una incidencia en un periodo de cobro (compatibilidad)
 */
export function registrarIncidenciaPeriodo(
  contrato: ContratoFormalizacion,
  periodoId: string,
  motivoIncidencia: string,
  usuario?: UsuarioApp | null
): ContratoFormalizacion {
  const periodos = generarPeriodosParaContrato(contrato);
  const idx = periodos.findIndex((p) => p.id === periodoId);
  if (idx === -1) return contrato;

  const actual = periodos[idx];
  const cambioItem: HistorialCobroItem = {
    id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    fecha: new Date().toISOString(),
    usuarioId: usuario?.id,
    usuarioNombre: usuario?.nombre || usuario?.email || 'Administrador',
    accion: 'Incidencia de cobro reportada',
    estadoAnterior: actual.estado,
    estadoNuevo: 'PAGADO_PARCIAL',
    detalles: motivoIncidencia,
  };

  const periodoActualizado: CobroPeriodo = {
    ...actual,
    estado: 'PAGADO_PARCIAL',
    motivoIncidencia,
    ultimaModificacion: new Date().toISOString(),
    historialCambios: [cambioItem, ...actual.historialCambios],
  };

  const nuevosPeriodos = [...periodos];
  nuevosPeriodos[idx] = periodoActualizado;

  return {
    ...contrato,
    registroCobros: nuevosPeriodos,
    fechaActualizacion: new Date().toISOString(),
  };
}

/**
 * Detección de impagos: recibos pendientes después de vencimiento
 */
export function detectarImpagos(cobros: CobroPeriodo[]): CobroPeriodo[] {
  return cobros.filter((c) => {
    if (c.estado === 'ANULADO') return false;
    if (c.estado === 'PAGADO') return false;
    if (c.estado === 'PAGADO_PARCIAL') {
      // Si parcial pero vencido con pendiente, sigue siendo alerta
      return estaVencido(c.fechaVencimiento) && c.importeRecibido < c.importePrevisto;
    }
    return c.estado === 'IMPAGADO' || (c.estado === 'PENDIENTE' && estaVencido(c.fechaVencimiento));
  });
}

export function generarAlertasImpago(cobros: CobroPeriodo[]): AlertaImpago[] {
  const impagos = detectarImpagos(cobros);
  return impagos.map((c) => {
    const pendiente = (c.importePrevisto || 0) - (c.importeRecibido || 0);
    return {
      cobroId: c.id,
      contratoId: c.contratoId,
      inmuebleId: c.inmuebleId,
      inmuebleDireccion: c.inmuebleDireccion || c.inmuebleId,
      propietarioId: c.propietarioId,
      inquilinoNombre: c.inquilinoNombre,
      periodo: c.periodoMesAnio,
      nombreMes: c.nombreMes,
      fechaVencimiento: c.fechaVencimiento,
      importePrevisto: c.importePrevisto,
      importeRecibido: c.importeRecibido,
      importePendiente: pendiente,
      diasRetraso: calcularDiasRetraso(c.fechaVencimiento),
      estado: c.estado,
    };
  }).sort((a, b) => b.diasRetraso - a.diasRetraso);
}

/**
 * Seguridad cobros: aislamiento por propietario
 */
export function canAccessCobro(cobro: CobroPeriodo, currentUser?: UsuarioApp | null): boolean {
  if (!currentUser) return true; // legacy admin
  const perfil = currentUser.tipoPerfil || 'ADMINISTRADOR';
  if (perfil === 'ADMINISTRADOR') return true;
  if (perfil === 'PROPIETARIO') {
    if (currentUser.propietarioId && cobro.propietarioId && cobro.propietarioId === currentUser.propietarioId) return true;
    if (currentUser.inmuebleIds && cobro.inmuebleId && currentUser.inmuebleIds.includes(cobro.inmuebleId)) return true;
    return false;
  }
  if (perfil === 'PROFESIONAL') {
    return false;
  }
  return false;
}

export function filtrarCobrosPorUsuario(cobros: CobroPeriodo[], currentUser?: UsuarioApp | null): CobroPeriodo[] {
  if (!currentUser) return cobros;
  if (currentUser.tipoPerfil === 'ADMINISTRADOR') return cobros;
  return cobros.filter((c) => canAccessCobro(c, currentUser));
}

export function filtrarCobrosPorContratoIds(cobros: CobroPeriodo[], contratoIds: string[]): CobroPeriodo[] {
  if (!contratoIds || contratoIds.length === 0) return [];
  const set = new Set(contratoIds);
  return cobros.filter((c) => set.has(c.contratoId));
}

/**
 * Calcula los totales agregados de un conjunto de periodos de cobro.
 */
export function calcularResumenCobros(cobros: CobroPeriodo[]) {
  let totalPrevisto = 0;
  let totalRecibido = 0;
  let totalPendiente = 0;
  let totalRetrasado = 0;
  let totalIncidencias = 0;
  let totalImpagado = 0;
  let totalParcial = 0;
  let totalAnulado = 0;
  let countCobrados = 0;
  let countPendientes = 0;
  let countRetrasados = 0;
  let countIncidencias = 0;
  let countImpagados = 0;
  let countParcial = 0;
  let countAnulados = 0;
  let countConJustificante = 0;

  for (const c of cobros) {
    totalPrevisto += c.importePrevisto || 0;
    totalRecibido += c.importeRecibido || 0;

    const pendiente = (c.importePrevisto || 0) - (c.importeRecibido || 0);

    switch (c.estado) {
      case 'PAGADO':
      case 'RECIBIDO':
      case 'VERIFICADO':
        countCobrados++;
        break;
      case 'PAGADO_PARCIAL':
        countParcial++;
        totalParcial += pendiente;
        break;
      case 'IMPAGADO':
        countImpagados++;
        totalImpagado += pendiente;
        break;
      case 'ANULADO':
        countAnulados++;
        totalAnulado += c.importePrevisto || 0;
        break;
      case 'RETRASADO':
        countRetrasados++;
        totalRetrasado += pendiente;
        break;
      case 'INCIDENCIA':
        countIncidencias++;
        totalIncidencias += pendiente;
        break;
      default: // PENDIENTE
        countPendientes++;
        totalPendiente += pendiente;
        break;
    }

    if (c.justificante) {
      countConJustificante++;
    }
  }

  const porcentajeCobrado = totalPrevisto > 0 ? Math.round((totalRecibido / totalPrevisto) * 100) : 0;

  return {
    totalPrevisto,
    totalRecibido,
    totalPendiente,
    totalRetrasado,
    totalIncidencias,
    totalImpagado,
    totalParcial,
    totalAnulado,
    countCobrados,
    countPendientes,
    countRetrasados,
    countIncidencias,
    countImpagados,
    countParcial,
    countAnulados,
    countConJustificante,
    porcentajeCobrado,
    totalPeriodos: cobros.length,
  };
}

/**
 * Prepara la estructura para el futuro resumen fiscal anual de un inmueble.
 */
export function generarResumenFiscalInmueble(
  inmuebleId: string,
  anio: number,
  inmuebles: Inmueble[],
  contratos: ContratoFormalizacion[]
): ResumenFiscalInmuebleAnual | null {
  const inmueble = inmuebles.find((i) => i.id === inmuebleId);
  if (!inmueble) return null;

  const inmuebleContratos = contratos.filter((c) => c.inmuebleId === inmuebleId);
  const contratosPeriodos: ResumenFiscalInmuebleAnual['contratosPeriodos'] = [];

  let totalAnualPrevisto = 0;
  let totalAnualCobrado = 0;
  let totalAnualPendiente = 0;
  let totalAnualIncidencias = 0;
  let mesesCobradosCount = 0;
  let justificantesCount = 0;

  for (const contrato of inmuebleContratos) {
    const periodos = contrato.registroCobros && contrato.registroCobros.length > 0
      ? contrato.registroCobros
      : generarPeriodosParaContrato(contrato);

    const periodosAnio = periodos.filter((p) => p.anio === anio);
    if (periodosAnio.length === 0) continue;

    let subtotalCobrado = 0;
    const mesesDetalle = periodosAnio.map((p) => {
      totalAnualPrevisto += p.importePrevisto || 0;
      totalAnualCobrado += p.importeRecibido || 0;
      subtotalCobrado += p.importeRecibido || 0;

      if (p.estado === 'PAGADO' || p.estado === 'RECIBIDO' || p.estado === 'VERIFICADO') {
        mesesCobradosCount++;
      } else if (p.estado === 'IMPAGADO' || p.estado === 'RETRASADO') {
        totalAnualPendiente += (p.importePrevisto || 0) - (p.importeRecibido || 0);
      } else if (p.estado === 'INCIDENCIA' || p.estado === 'PAGADO_PARCIAL') {
        totalAnualIncidencias += (p.importePrevisto || 0) - (p.importeRecibido || 0);
      } else if (p.estado !== 'ANULADO') {
        totalAnualPendiente += (p.importePrevisto || 0) - (p.importeRecibido || 0);
      }

      if (p.justificante) {
        justificantesCount++;
      }

      return {
        mes: p.mes,
        nombreMes: p.nombreMes,
        importePrevisto: p.importePrevisto,
        importeRecibido: p.importeRecibido,
        fechaPago: p.fechaPago,
        estado: p.estado,
        tieneJustificante: !!p.justificante,
        justificanteId: p.justificante?.id,
        justificanteNombre: p.justificante?.nombreArchivo,
      };
    });

    contratosPeriodos.push({
      contratoId: contrato.id,
      inquilinoId: contrato.candidatoId,
      inquilinoNombre: contrato.candidatoNombre,
      inquilinoDni: contrato.candidatoDni,
      fechaInicio: contrato.fechaInicioContrato,
      fechaFin: contrato.fechaFinContrato,
      rentaMensual: contrato.rentaMensual,
      meses: mesesDetalle,
      subtotalCobrado,
    });
  }

  return {
    inmuebleId: inmueble.id,
    inmuebleDireccion: inmueble.direccion,
    inmuebleCiudad: inmueble.ciudad,
    referenciaCatastral: inmueble.referenciaCatastral || inmueble.datosFiscales?.referenciaCatastral,
    propietarioId: inmueble.propietarioId || inmueble.propietarioPrincipalId || '',
    propietarioNombre: inmueble.datosFiscales?.propietarioPrincipal?.nombre || 'Propietario',
    anio,
    totalAnualPrevisto,
    totalAnualCobrado,
    totalAnualPendiente,
    totalAnualIncidencias,
    mesesCobradosCount,
    contratosPeriodos,
    justificantesCount,
  };
}
