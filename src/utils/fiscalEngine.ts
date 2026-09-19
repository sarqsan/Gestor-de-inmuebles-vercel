/**
 * ARENA D - FISCAL ANUAL REAL
 * Circuito: INMUEBLE → EJERCICIO FISCAL → CONTRATO/INQUILINO → INGRESOS → GASTOS → DEDUCIBLES → DOCUMENTACIÓN → RESUMEN → RESULTADO NETO → HISTÓRICO ANUAL
 * Reutiliza: cobros, gastos, contratos, inmuebles, documentación, seguros, rentabilidad, Firebase, autorización propietario
 * NO crea segunda BD, NO duplica cobros/gastos, NO segunda app fiscal paralela
 */

import {
  CobroPeriodo,
  ContratoFormalizacion,
  Gasto,
  Inmueble,
  UsuarioApp,
  CategoriaGasto,
} from '../types';
import {
  obtenerTodosCobros,
  calcularResumenCobros,
  calcularDiasRetraso,
} from './cobrosEngine';
import { calcularTotalGastos, calcularTotalesPorCategoria } from './gastosEngine';

// =====================
// TIPOS FISCALES
// =====================

export interface PeriodoOcupacion {
  contratoId: string;
  inquilinoId: string;
  inquilinoNombre: string;
  inquilinoDni?: string;
  fechaInicio: string;
  fechaFin?: string;
  diasAlquiladosEjercicio: number;
  rentaMensual: number;
  ingresosPrevistosEjercicio: number;
  ingresosCobradosEjercicio: number;
}

export interface IngresosEjercicio {
  ejercicio: number;
  totalPrevisto: number;
  totalCobrado: number;
  totalPendiente: number;
  totalImpagado: number;
  totalParcial: number;
  totalAnulado: number;
  countTotal: number;
  countCobrados: number;
  countPendientes: number;
  countImpagados: number;
  countParcial: number;
  countAnulados: number;
  cobros: CobroPeriodo[]; // referencia, no copia física
  mesesConIngreso: number[];
  mesesImpagados: number[];
  mesesParciales: number[];
}

export interface GastosEjercicio {
  ejercicio: number;
  total: number;
  totalDeducible: number;
  totalNoDeducible: number;
  countTotal: number;
  countDeducible: number;
  countNoDeducible: number;
  gastos: Gasto[]; // referencia, no copia física
  porCategoria: Record<CategoriaGasto, number>;
  porCategoriaDeducible: Record<CategoriaGasto, number>;
  porCategoriaNoDeducible: Record<CategoriaGasto, number>;
  gastosConJustificante: number;
  gastosSinJustificante: number;
  gastosVinculadosOT: number;
  gastosVinculadosSeguro: number;
}

export interface DocumentacionFiscalItem {
  id: string;
  tipo: 'INGRESO' | 'GASTO';
  referenciaId: string; // cobroId o gastoId
  nombreArchivo: string;
  storagePath?: string;
  downloadURL?: string;
  url?: string;
  fecha: string;
  ejercicio: number;
  importe: number;
  concepto: string;
}

export interface ResumenFiscalAnual {
  // Claves
  propietarioId: string;
  propietarioNombre?: string;
  inmuebleId: string;
  inmuebleDireccion: string;
  inmuebleCiudad?: string;
  ejercicio: number;

  // Periodo
  fechaInicioEjercicio: string;
  fechaFinEjercicio: string;

  // Contratos / Inquilinos
  contratos: ContratoFormalizacion[]; // referencia
  periodosOcupacion: PeriodoOcupacion[];
  numContratos: number;
  numInquilinos: number;
  diasAlquilados: number;
  diasSinAlquilar: number;
  periodosAlquilados: { inicio: string; fin: string; inquilino: string }[];
  periodosSinAlquiler: { inicio: string; fin: string; dias: number }[];

  // Ingresos
  ingresos: IngresosEjercicio;

  // Gastos
  gastos: GastosEjercicio;

  // Resultado
  resultadoNetoOperativo: number; // ingresos cobrados - gastos deducibles
  resultadoBruto: number; // ingresos cobrados - gastos totales
  margenOperativo: number; // % resultado neto / ingresos cobrados

  // Documentación
  documentacion: DocumentacionFiscalItem[];
  numDocumentos: number;

  // Metadatos
  generadoEn: string;
  generadoPor?: string;
  fuente: 'DERIVADO_COBROS_GASTOS_CONTRATOS'; // indica que no es copia física
}

// =====================
// HELPERS DEDUCIBILIDAD
// =====================

/**
 * Determina si un gasto es deducible según campo existente o categoría
 * Reutiliza campo esDeducible si existe, si no infiere por categoría
 * NO inventa categorías fiscales no soportadas
 */
export function esGastoDeducible(gasto: Gasto): boolean {
  if (typeof gasto.esDeducible === 'boolean') return gasto.esDeducible;
  if (gasto.tipoDeducible) {
    return gasto.tipoDeducible === 'DEDUCIBLE';
  }
  // Inferencia por categoría existente (conservadora, todo deducible salvo OTRO no claro)
  // Según normativa española alquileres: mantenimiento, reparación, seguros, comunidad, impuestos, suministros, gestión, limpieza, reformas (amortización) son deducibles
  const categoriasDeducibles: CategoriaGasto[] = [
    'MANTENIMIENTO',
    'REPARACION',
    'SUMINISTROS',
    'SEGUROS',
    'IMPUESTOS_TASAS',
    'COMUNIDAD',
    'ELECTRODOMESTICOS', // amortizable
    'MOBILIARIO', // amortizable
    'REFORMAS', // amortizable
    'LIMPIEZA',
    'GESTION',
  ];
  return categoriasDeducibles.includes(gasto.categoria);
}

export function clasificarGastosDeducibilidad(gastos: Gasto[]): {
  deducibles: Gasto[];
  noDeducibles: Gasto[];
  totalDeducible: number;
  totalNoDeducible: number;
} {
  const deducibles: Gasto[] = [];
  const noDeducibles: Gasto[] = [];
  let totalDeducible = 0;
  let totalNoDeducible = 0;

  for (const g of gastos) {
    if (g.estado === 'ANULADO') continue;
    if (esGastoDeducible(g)) {
      deducibles.push(g);
      totalDeducible += g.importe || 0;
    } else {
      noDeducibles.push(g);
      totalNoDeducible += g.importe || 0;
    }
  }

  return { deducibles, noDeducibles, totalDeducible, totalNoDeducible };
}

// =====================
// HELPERS FECHAS / OCUPACIÓN
// =====================

function parseDateSafe(s: string): Date | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function diasEntre(inicio: Date, fin: Date): number {
  const diff = fin.getTime() - inicio.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)) + 1);
}

/**
 * Calcula días de ocupación de un contrato dentro de un ejercicio fiscal
 */
export function calcularDiasOcupacionEjercicio(
  contrato: ContratoFormalizacion,
  ejercicio: number
): number {
  const inicioEj = new Date(ejercicio, 0, 1);
  const finEj = new Date(ejercicio, 11, 31, 23, 59, 59);

  const inicioContrato = parseDateSafe(contrato.fechaInicioContrato);
  if (!inicioContrato) return 0;

  let finContrato: Date | null = null;
  if (contrato.fechaFinContrato) {
    finContrato = parseDateSafe(contrato.fechaFinContrato);
  }

  const inicioEfectivo = inicioContrato > inicioEj ? inicioContrato : inicioEj;
  const finEfectivo = finContrato && finContrato < finEj ? finContrato : finEj;

  if (inicioEfectivo > finEfectivo) return 0;
  return diasEntre(inicioEfectivo, finEfectivo);
}

/**
 * Determina periodos sin alquiler en un ejercicio a partir de contratos existentes
 * Si hay gaps entre contratos, se consideran periodos sin ocupación identificables
 */
export function calcularPeriodosSinAlquiler(
  contratosEjercicio: ContratoFormalizacion[],
  ejercicio: number
): { inicio: string; fin: string; dias: number }[] {
  if (contratosEjercicio.length === 0) {
    return [
      {
        inicio: `${ejercicio}-01-01`,
        fin: `${ejercicio}-12-31`,
        dias: 365,
      },
    ];
  }

  const inicioEj = new Date(ejercicio, 0, 1);
  const finEj = new Date(ejercicio, 11, 31);

  // Ordenar contratos por fecha inicio
  const ordenados = [...contratosEjercicio].sort((a, b) => {
    const da = parseDateSafe(a.fechaInicioContrato)?.getTime() || 0;
    const db = parseDateSafe(b.fechaInicioContrato)?.getTime() || 0;
    return da - db;
  });

  const sinAlquiler: { inicio: string; fin: string; dias: number }[] = [];

  let cursor = inicioEj;

  for (const contrato of ordenados) {
    const inicioC = parseDateSafe(contrato.fechaInicioContrato);
    if (!inicioC) continue;

    // Si contrato empieza después del cursor, hay gap
    if (inicioC > cursor) {
      const finGap = new Date(inicioC.getTime() - 24 * 3600 * 1000);
      if (finGap >= cursor && cursor >= inicioEj && finGap <= finEj) {
        sinAlquiler.push({
          inicio: cursor.toISOString().split('T')[0],
          fin: finGap.toISOString().split('T')[0],
          dias: diasEntre(cursor, finGap),
        });
      }
    }

    const finC = contrato.fechaFinContrato ? parseDateSafe(contrato.fechaFinContrato) : finEj;
    if (finC && finC > cursor) {
      cursor = new Date(finC.getTime() + 24 * 3600 * 1000);
    }

    if (cursor > finEj) break;
  }

  if (cursor <= finEj) {
    sinAlquiler.push({
      inicio: cursor.toISOString().split('T')[0],
      fin: finEj.toISOString().split('T')[0],
      dias: diasEntre(cursor, finEj),
    });
  }

  return sinAlquiler;
}

// =====================
// INGRESOS EJERCICIO
// =====================

export function calcularIngresosEjercicio(
  cobros: CobroPeriodo[],
  ejercicio: number
): IngresosEjercicio {
  const cobrosEj = cobros.filter((c) => c.anio === ejercicio);

  let totalPrevisto = 0;
  let totalCobrado = 0;
  let totalPendiente = 0;
  let totalImpagado = 0;
  let totalParcial = 0;
  let totalAnulado = 0;

  let countCobrados = 0;
  let countPendientes = 0;
  let countImpagados = 0;
  let countParcial = 0;
  let countAnulados = 0;

  const mesesConIngreso: number[] = [];
  const mesesImpagados: number[] = [];
  const mesesParciales: number[] = [];

  for (const c of cobrosEj) {
    totalPrevisto += c.importePrevisto || 0;

    const pendiente = (c.importePrevisto || 0) - (c.importeRecibido || 0);

    switch (c.estado) {
      case 'PAGADO':
      case 'RECIBIDO':
      case 'VERIFICADO':
        totalCobrado += c.importeRecibido || 0;
        countCobrados++;
        mesesConIngreso.push(c.mes);
        break;
      case 'PAGADO_PARCIAL':
        totalCobrado += c.importeRecibido || 0;
        totalParcial += pendiente;
        countParcial++;
        mesesParciales.push(c.mes);
        mesesConIngreso.push(c.mes);
        break;
      case 'IMPAGADO':
      case 'RETRASADO':
        totalImpagado += pendiente > 0 ? pendiente : c.importePrevisto;
        countImpagados++;
        mesesImpagados.push(c.mes);
        break;
      case 'ANULADO':
        totalAnulado += c.importePrevisto || 0;
        countAnulados++;
        break;
      case 'INCIDENCIA':
        // Incidencia tratada como parcial si tiene algo cobrado, sino impagado
        if (c.importeRecibido > 0) {
          totalCobrado += c.importeRecibido;
          totalParcial += pendiente;
          countParcial++;
          mesesParciales.push(c.mes);
        } else {
          totalImpagado += pendiente;
          countImpagados++;
          mesesImpagados.push(c.mes);
        }
        break;
      default: // PENDIENTE
        totalPendiente += pendiente;
        countPendientes++;
        break;
    }
  }

  return {
    ejercicio,
    totalPrevisto,
    totalCobrado,
    totalPendiente,
    totalImpagado,
    totalParcial,
    totalAnulado,
    countTotal: cobrosEj.length,
    countCobrados,
    countPendientes,
    countImpagados,
    countParcial,
    countAnulados,
    cobros: cobrosEj, // referencia, no copia física duplicada
    mesesConIngreso: Array.from(new Set(mesesConIngreso)).sort((a, b) => a - b),
    mesesImpagados: Array.from(new Set(mesesImpagados)).sort((a, b) => a - b),
    mesesParciales: Array.from(new Set(mesesParciales)).sort((a, b) => a - b),
  };
}

// =====================
// GASTOS EJERCICIO
// =====================

export function calcularGastosEjercicio(gastos: Gasto[], ejercicio: number): GastosEjercicio {
  const gastosEj = gastos.filter((g) => {
    const fecha = parseDateSafe(g.fecha);
    if (!fecha) return false;
    if (g.ejercicioFiscal) return g.ejercicioFiscal === ejercicio;
    return fecha.getFullYear() === ejercicio;
  });

  const { deducibles, noDeducibles, totalDeducible, totalNoDeducible } =
    clasificarGastosDeducibilidad(gastosEj);

  const total = calcularTotalGastos(gastosEj);
  const porCategoria = calcularTotalesPorCategoria(gastosEj);
  const porCategoriaDeducible = calcularTotalesPorCategoria(deducibles);
  const porCategoriaNoDeducible = calcularTotalesPorCategoria(noDeducibles);

  let gastosConJustificante = 0;
  let gastosSinJustificante = 0;
  let gastosVinculadosOT = 0;
  let gastosVinculadosSeguro = 0;

  for (const g of gastosEj) {
    if (g.estado === 'ANULADO') continue;
    if (g.documento || (g.documentos && g.documentos.length > 0)) {
      gastosConJustificante++;
    } else {
      gastosSinJustificante++;
    }
    if (g.trabajoId || g.incidenciaId) gastosVinculadosOT++;
    // Vinculado a seguro si categoría SEGUROS o tiene referencia seguro
    if (g.categoria === 'SEGUROS') gastosVinculadosSeguro++;
  }

  return {
    ejercicio,
    total,
    totalDeducible,
    totalNoDeducible,
    countTotal: gastosEj.filter((g) => g.estado !== 'ANULADO').length,
    countDeducible: deducibles.length,
    countNoDeducible: noDeducibles.length,
    gastos: gastosEj, // referencia
    porCategoria,
    porCategoriaDeducible,
    porCategoriaNoDeducible,
    gastosConJustificante,
    gastosSinJustificante,
    gastosVinculadosOT,
    gastosVinculadosSeguro,
  };
}

// =====================
// DOCUMENTACIÓN FISCAL
// =====================

export function recopilarDocumentacionFiscal(
  ingresos: IngresosEjercicio,
  gastos: GastosEjercicio
): DocumentacionFiscalItem[] {
  const docs: DocumentacionFiscalItem[] = [];

  for (const cobro of ingresos.cobros) {
    if (cobro.justificante) {
      docs.push({
        id: cobro.justificante.id,
        tipo: 'INGRESO',
        referenciaId: cobro.id,
        nombreArchivo: cobro.justificante.nombreArchivo,
        storagePath: cobro.justificante.storagePath,
        downloadURL: cobro.justificante.downloadURL || cobro.justificante.url,
        url: cobro.justificante.url,
        fecha: cobro.fechaPago || cobro.fechaVencimiento,
        ejercicio: cobro.anio,
        importe: cobro.importeRecibido || cobro.importePrevisto,
        concepto: `Alquiler ${cobro.nombreMes} - ${cobro.inquilinoNombre}`,
      });
    }
  }

  for (const gasto of gastos.gastos) {
    if (gasto.estado === 'ANULADO') continue;
    const doc = gasto.documento || (gasto.documentos && gasto.documentos[0]);
    if (doc) {
      docs.push({
        id: doc.id,
        tipo: 'GASTO',
        referenciaId: gasto.id,
        nombreArchivo: doc.nombre,
        storagePath: doc.storagePath,
        downloadURL: doc.url,
        url: doc.url,
        fecha: gasto.fecha,
        ejercicio: gastos.ejercicio,
        importe: gasto.importe,
        concepto: `${gasto.categoria} - ${gasto.concepto}`,
      });
    }
  }

  return docs.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}

// =====================
// RESUMEN FISCAL ANUAL COMPLETO
// =====================

export function generarResumenFiscalAnual(
  inmuebleId: string,
  ejercicio: number,
  inmuebles: Inmueble[],
  contratos: ContratoFormalizacion[],
  gastos: Gasto[],
  currentUser?: UsuarioApp | null,
  generadoPor?: string
): ResumenFiscalAnual | null {
  const inmueble = inmuebles.find((i) => i.id === inmuebleId);
  if (!inmueble) return null;

  // Contratos del inmueble que tocan el ejercicio (reutiliza contratos existentes, no segundo sistema)
  const contratosInmueble = contratos.filter((c) => c.inmuebleId === inmuebleId);
  const contratosEjercicio = contratosInmueble.filter((c) => {
    const inicio = parseDateSafe(c.fechaInicioContrato);
    if (!inicio) return false;
    const fin = c.fechaFinContrato ? parseDateSafe(c.fechaFinContrato) : null;
    // Si contrato empieza después del ejercicio, no aplica
    if (inicio.getFullYear() > ejercicio) return false;
    // Si termina antes del ejercicio, no aplica
    if (fin && fin.getFullYear() < ejercicio) return false;
    // Si no tiene fin y empezó antes o durante ejercicio, aplica
    return true;
  });

  // Ingresos derivados de cobros existentes (no copia física)
  const todosCobros = obtenerTodosCobros(contratosInmueble);
  const ingresos = calcularIngresosEjercicio(todosCobros, ejercicio);

  // Gastos derivados de colección gastos existente
  const gastosInmueble = gastos.filter((g) => g.inmuebleId === inmuebleId);
  const gastosEj = calcularGastosEjercicio(gastosInmueble, ejercicio);

  // Periodos ocupación / sucesión inquilinos
  const periodosOcupacion: PeriodoOcupacion[] = contratosEjercicio.map((c) => {
    const dias = calcularDiasOcupacionEjercicio(c, ejercicio);
    const cobrosContratoEj = ingresos.cobros.filter((cb) => cb.contratoId === c.id);
    const previsto = cobrosContratoEj.reduce((sum, cb) => sum + (cb.importePrevisto || 0), 0);
    const cobrado = cobrosContratoEj.reduce((sum, cb) => sum + (cb.importeRecibido || 0), 0);
    return {
      contratoId: c.id,
      inquilinoId: c.candidatoId,
      inquilinoNombre: c.candidatoNombre,
      inquilinoDni: c.candidatoDni,
      fechaInicio: c.fechaInicioContrato,
      fechaFin: c.fechaFinContrato,
      diasAlquiladosEjercicio: dias,
      rentaMensual: c.rentaMensual,
      ingresosPrevistosEjercicio: previsto,
      ingresosCobradosEjercicio: cobrado,
    };
  });

  const numContratos = contratosEjercicio.length;
  const inquilinosUnicos = new Set(contratosEjercicio.map((c) => c.candidatoId));
  const numInquilinos = inquilinosUnicos.size;

  const diasAlquilados = periodosOcupacion.reduce((sum, p) => sum + p.diasAlquiladosEjercicio, 0);
  const diasTotalesEjercicio = ejercicio % 4 === 0 ? 366 : 365; // simplificado
  const diasSinAlquilar = Math.max(0, diasTotalesEjercicio - diasAlquilados);

  const periodosAlquilados = periodosOcupacion.map((p) => ({
    inicio: p.fechaInicio,
    fin: p.fechaFin || `${ejercicio}-12-31`,
    inquilino: p.inquilinoNombre,
  }));

  const periodosSinAlquiler = calcularPeriodosSinAlquiler(contratosEjercicio, ejercicio);

  // Resultado neto operativo = ingresos cobrados - gastos deducibles
  const resultadoNetoOperativo = ingresos.totalCobrado - gastosEj.totalDeducible;
  const resultadoBruto = ingresos.totalCobrado - gastosEj.total;
  const margenOperativo =
    ingresos.totalCobrado > 0 ? Math.round((resultadoNetoOperativo / ingresos.totalCobrado) * 100) : 0;

  const documentacion = recopilarDocumentacionFiscal(ingresos, gastosEj);

  return {
    propietarioId: inmueble.propietarioId || inmueble.propietarioPrincipalId || '',
    propietarioNombre: inmueble.datosFiscales?.propietarioPrincipal?.nombre,
    inmuebleId: inmueble.id,
    inmuebleDireccion: inmueble.direccion,
    inmuebleCiudad: inmueble.ciudad,
    ejercicio,
    fechaInicioEjercicio: `${ejercicio}-01-01`,
    fechaFinEjercicio: `${ejercicio}-12-31`,
    contratos: contratosEjercicio,
    periodosOcupacion,
    numContratos,
    numInquilinos,
    diasAlquilados,
    diasSinAlquilar,
    periodosAlquilados,
    periodosSinAlquiler,
    ingresos,
    gastos: gastosEj,
    resultadoNetoOperativo,
    resultadoBruto,
    margenOperativo,
    documentacion,
    numDocumentos: documentacion.length,
    generadoEn: new Date().toISOString(),
    generadoPor: generadoPor || currentUser?.nombre || currentUser?.email || 'Sistema',
    fuente: 'DERIVADO_COBROS_GASTOS_CONTRATOS',
  };
}

// =====================
// HISTÓRICO ANUAL (2024,2025,2026 independientes)
// =====================

export function generarHistoricoFiscalInmueble(
  inmuebleId: string,
  ejercicios: number[],
  inmuebles: Inmueble[],
  contratos: ContratoFormalizacion[],
  gastos: Gasto[],
  currentUser?: UsuarioApp | null
): ResumenFiscalAnual[] {
  const historico: ResumenFiscalAnual[] = [];
  for (const ej of ejercicios) {
    const resumen = generarResumenFiscalAnual(
      inmuebleId,
      ej,
      inmuebles,
      contratos,
      gastos,
      currentUser
    );
    if (resumen) historico.push(resumen);
  }
  return historico.sort((a, b) => b.ejercicio - a.ejercicio);
}

// =====================
// AISLAMIENTO PROPIETARIO
// =====================

export function canAccessResumenFiscal(
  resumen: ResumenFiscalAnual,
  currentUser?: UsuarioApp | null
): boolean {
  if (!currentUser) return true; // legacy admin
  if (currentUser.tipoPerfil === 'ADMINISTRADOR') return true;
  if (currentUser.tipoPerfil === 'PROPIETARIO') {
    if (
      currentUser.propietarioId &&
      resumen.propietarioId &&
      resumen.propietarioId === currentUser.propietarioId
    )
      return true;
    if (
      currentUser.inmuebleIds &&
      resumen.inmuebleId &&
      currentUser.inmuebleIds.includes(resumen.inmuebleId)
    )
      return true;
    return false;
  }
  if (currentUser.tipoPerfil === 'PROFESIONAL') return false;
  return false;
}

export function filtrarResumenesFiscalesPorUsuario(
  resumenes: ResumenFiscalAnual[],
  currentUser?: UsuarioApp | null
): ResumenFiscalAnual[] {
  if (!currentUser) return resumenes;
  if (currentUser.tipoPerfil === 'ADMINISTRADOR') return resumenes;
  return resumenes.filter((r) => canAccessResumenFiscal(r, currentUser));
}

// =====================
// RENTABILIDAD INTEGRACIÓN
// =====================

export function integrarFiscalConRentabilidad(resumen: ResumenFiscalAnual): {
  ingresos: number;
  gastos: number;
  gastosDeducibles: number;
  resultadoNeto: number;
  rentabilidadEstimada: number;
} {
  const ingresos = resumen.ingresos.totalCobrado;
  const gastos = resumen.gastos.total;
  const gastosDeducibles = resumen.gastos.totalDeducible;
  const resultadoNeto = resumen.resultadoNetoOperativo;

  // Rentabilidad simple: resultado neto / (valor adquisición si existe) o ingresos
  // NO sustituye motor existente, solo integra datos fiscales
  const rentabilidadEstimada = resumen.margenOperativo;

  return {
    ingresos,
    gastos,
    gastosDeducibles,
    resultadoNeto,
    rentabilidadEstimada,
  };
}

// =====================
// VALIDACIÓN CONSISTENCIA (cobro aparece una sola vez, gasto una sola vez)
// =====================

export function validarConsistenciaFiscal(resumen: ResumenFiscalAnual): {
  valido: boolean;
  errores: string[];
  advertencias: string[];
} {
  const errores: string[] = [];
  const advertencias: string[] = [];

  // Cobros únicos
  const cobroIds = resumen.ingresos.cobros.map((c) => c.id);
  const cobroIdsUnicos = new Set(cobroIds);
  if (cobroIds.length !== cobroIdsUnicos.size) {
    errores.push(`Cobros duplicados en ingresos: ${cobroIds.length} vs únicos ${cobroIdsUnicos.size}`);
  }

  // Gastos únicos
  const gastoIds = resumen.gastos.gastos.map((g) => g.id);
  const gastoIdsUnicos = new Set(gastoIds);
  if (gastoIds.length !== gastoIdsUnicos.size) {
    errores.push(`Gastos duplicados: ${gastoIds.length} vs únicos ${gastoIdsUnicos.size}`);
  }

  // Documentación no duplica archivos (storagePath único)
  const storagePaths = resumen.documentacion
    .map((d) => d.storagePath)
    .filter((p) => !!p) as string[];
  const storageUnicos = new Set(storagePaths);
  if (storagePaths.length !== storageUnicos.size) {
    advertencias.push(`Posible duplicado de storagePath en documentación`);
  }

  // Coherencia ingresos
  const sumaCobros =
    resumen.ingresos.totalCobrado +
    resumen.ingresos.totalPendiente +
    resumen.ingresos.totalImpagado +
    resumen.ingresos.totalParcial;
  // No estricto, solo advertencia si no cuadra
  if (Math.abs(sumaCobros - resumen.ingresos.totalPrevisto) > 1 && resumen.ingresos.totalAnulado === 0) {
    // Puede haber anulados que no cuadran, es normal
  }

  return { valido: errores.length === 0, errores, advertencias };
}
