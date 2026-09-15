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

/**
 * Genera o complementa los periodos mensuales de cobro para un contrato.
 * REGLA ESTRICTA: Los periodos que ya existen NO se recalculan ni sobrescriben.
 * Conservan su importe previsto original, pagos registrados, justificantes y trazabilidad.
 */
export function generarPeriodosParaContrato(
  contrato: ContratoFormalizacion,
  limiteMesesFuturos: number = 2
): CobroPeriodo[] {
  const existingCobros = contrato.registroCobros || [];
  const existingMap = new Map<string, CobroPeriodo>();
  for (const c of existingCobros) {
    existingMap.set(c.periodoMesAnio, c);
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
    const existing = existingMap.get(periodoKey);

    if (existing) {
      // Si ya existía, conservar intacto
      result.push(existing);
    } else {
      // Crear nuevo periodo con los importes contratados
      const fechaVencimiento = `${y}-${String(m).padStart(2, '0')}-${String(diaLimite).padStart(2, '0')}`;
      const vencimientoDate = new Date(`${fechaVencimiento}T23:59:59`);
      const yaVencido = vencimientoDate < hoy;

      const nuevoPeriodo: CobroPeriodo = {
        id: `cobro_${contrato.id}_${y}_${String(m).padStart(2, '0')}`,
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

        estado: yaVencido ? 'RETRASADO' : 'PENDIENTE',

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

  // Ordenar cronológicamente ascendente
  return result.sort((a, b) => {
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
  const estadoNuevo: EstadoCobroAlquiler = datosPago.estado || (
    datosPago.importeRecibido >= actual.importePrevisto ? 'RECIBIDO' : 'INCIDENCIA'
  );

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
    detalles: datosPago.observaciones || `Cobro de ${datosPago.importeRecibido} € registrado el ${datosPago.fechaPago}`,
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
 * Registra una incidencia en un periodo de cobro.
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
    estadoNuevo: 'INCIDENCIA',
    detalles: motivoIncidencia,
  };

  const periodoActualizado: CobroPeriodo = {
    ...actual,
    estado: 'INCIDENCIA',
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
 * Calcula los totales agregados de un conjunto de periodos de cobro.
 */
export function calcularResumenCobros(cobros: CobroPeriodo[]) {
  let totalPrevisto = 0;
  let totalRecibido = 0;
  let totalPendiente = 0;
  let totalRetrasado = 0;
  let totalIncidencias = 0;
  let countCobrados = 0;
  let countPendientes = 0;
  let countRetrasados = 0;
  let countIncidencias = 0;
  let countConJustificante = 0;

  for (const c of cobros) {
    totalPrevisto += c.importePrevisto || 0;
    totalRecibido += c.importeRecibido || 0;

    if (c.estado === 'RECIBIDO' || c.estado === 'VERIFICADO') {
      countCobrados++;
    } else if (c.estado === 'RETRASADO') {
      countRetrasados++;
      totalRetrasado += (c.importePrevisto || 0) - (c.importeRecibido || 0);
    } else if (c.estado === 'INCIDENCIA') {
      countIncidencias++;
      totalIncidencias += (c.importePrevisto || 0) - (c.importeRecibido || 0);
    } else {
      // PENDIENTE
      countPendientes++;
      totalPendiente += (c.importePrevisto || 0) - (c.importeRecibido || 0);
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
    countCobrados,
    countPendientes,
    countRetrasados,
    countIncidencias,
    countConJustificante,
    porcentajeCobrado,
    totalPeriodos: cobros.length,
  };
}

/**
 * Prepara la estructura para el futuro resumen fiscal anual de un inmueble.
 * Agrupa todos los inquilinos y contratos que han habitado el inmueble en el año fiscal,
 * garantizando que si cambiaron inquilinos o rentas, se conserve cada tramo y el total cobrado.
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

    // Filtrar periodos del año seleccionado
    const periodosAnio = periodos.filter((p) => p.anio === anio);
    if (periodosAnio.length === 0) continue;

    let subtotalCobrado = 0;
    const mesesDetalle = periodosAnio.map((p) => {
      totalAnualPrevisto += p.importePrevisto || 0;
      totalAnualCobrado += p.importeRecibido || 0;
      subtotalCobrado += p.importeRecibido || 0;

      if (p.estado === 'RECIBIDO' || p.estado === 'VERIFICADO') {
        mesesCobradosCount++;
      } else if (p.estado === 'RETRASADO') {
        totalAnualPendiente += (p.importePrevisto || 0) - (p.importeRecibido || 0);
      } else if (p.estado === 'INCIDENCIA') {
        totalAnualIncidencias += (p.importePrevisto || 0) - (p.importeRecibido || 0);
      } else {
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
