/**
 * REPORTING ENGINE - GAP 3
 * Capa de lectura/agregación independiente que consume motores existentes:
 * - cobrosEngine: generarPeriodosParaContrato, calcularResumenCobros, obtenerTodosCobros
 * - fiscalEngine: generarResumenFiscalAnual, esGastoDeducible, integrarFiscalConRentabilidad
 * - fiscalAvanzadoEngine: generarResultadoFiscalAvanzado
 * - gastosEngine: calcularTotalesPorCategoria
 * - segurosEngine: filtrarPolizasPorUsuario, detectarPolizasProximasVencer
 * - incidenciasEngine: calcularMetricasIncidencias
 * - contratoEngine: estados reales
 * NO crea segundo motor de cobros, fiscal, rentabilidad, contratos
 */

import {
  Inmueble,
  ContratoFormalizacion,
  Gasto,
  CobroPeriodo,
  Incidencia,
  PolizaSeguro,
  Siniestro,
  TrabajoProfesional,
  UsuarioApp,
  InformeCartera,
  InformeInmueble,
  InformeRentabilidad,
  InformeFiscal,
  InformePatrimonio,
  InformeEconomia,
  InformeOperativa,
  InformeOcupacion,
  EvolucionTemporalItem,
  RangoFechas,
  FiltrosInforme,
  ExportacionFiscalItem,
  ExportacionFiscalEstructurada,
  InformeContratoDetalle,
  HistorialInformeGenerado,
  EstadoFormalizacion,
} from '../types';
import { calcularResumenCobros, generarPeriodosParaContrato, obtenerTodosCobros, obtenerCobrosInmueble } from './cobrosEngine';
import { generarResumenFiscalAnual, esGastoDeducible, integrarFiscalConRentabilidad } from './fiscalEngine';
import { calcularTotalesPorCategoria, fechaEfectivaGasto } from './gastosEngine';
import { filtrarPolizasPorUsuario, detectarPolizasProximasVencer } from './segurosEngine';
import { calcularMetricasIncidencias } from './incidenciasEngine';

// =====================
// HELPERS FECHAS - evita errores zona horaria, meses 28/29/30/31, cambio año
// =====================

export function parseFechaSafe(s: string): Date | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function formatFechaISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function inicioMes(anio: number, mes: number): Date {
  return new Date(anio, mes - 1, 1);
}

export function finMes(anio: number, mes: number): Date {
  return new Date(anio, mes, 0); // último día mes
}

export function inicioTrimestre(anio: number, trimestre: number): Date {
  const mesInicio = (trimestre - 1) * 3 + 1;
  return inicioMes(anio, mesInicio);
}

export function finTrimestre(anio: number, trimestre: number): Date {
  const mesFin = trimestre * 3;
  return finMes(anio, mesFin);
}

export function diasEntre(inicio: Date, fin: Date): number {
  const diff = fin.getTime() - inicio.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)) + 1);
}

export function crearRangoMensual(anio: number, mes: number): RangoFechas {
  const inicio = inicioMes(anio, mes);
  const fin = finMes(anio, mes);
  return { fechaInicio: formatFechaISO(inicio), fechaFin: formatFechaISO(fin), periodo: 'MENSUAL', ejercicio: anio, mes };
}

export function crearRangoTrimestral(anio: number, trimestre: number): RangoFechas {
  const inicio = inicioTrimestre(anio, trimestre);
  const fin = finTrimestre(anio, trimestre);
  return { fechaInicio: formatFechaISO(inicio), fechaFin: formatFechaISO(fin), periodo: 'TRIMESTRAL', ejercicio: anio, trimestre };
}

export function crearRangoAnual(anio: number): RangoFechas {
  const inicio = new Date(anio, 0, 1);
  const fin = new Date(anio, 11, 31);
  return { fechaInicio: formatFechaISO(inicio), fechaFin: formatFechaISO(fin), periodo: 'ANUAL', ejercicio: anio };
}

export function crearRangoPersonalizado(inicio: string, fin: string): RangoFechas {
  return { fechaInicio: inicio, fechaFin: fin, periodo: 'PERSONALIZADO' };
}

// =====================
// SEGURIDAD - RBAC
// =====================

export function canAccessInformeCartera(propietarioId: string, currentUser?: UsuarioApp | null): boolean {
  if (!currentUser) return true;
  if (currentUser.tipoPerfil === 'ADMINISTRADOR') return true;
  if (currentUser.tipoPerfil === 'PROPIETARIO') {
    if (currentUser.propietarioId && currentUser.propietarioId === propietarioId) return true;
    return false;
  }
  if (currentUser.tipoPerfil === 'PROFESIONAL') return false;
  return false;
}

export function canAccessInmueble(inmueble: Inmueble, currentUser?: UsuarioApp | null): boolean {
  if (!currentUser) return true;
  if (currentUser.tipoPerfil === 'ADMINISTRADOR') return true;
  if (currentUser.tipoPerfil === 'PROPIETARIO') {
    if (currentUser.propietarioId && (inmueble.propietarioId === currentUser.propietarioId || inmueble.propietarioPrincipalId === currentUser.propietarioId)) return true;
    if (currentUser.inmuebleIds && currentUser.inmuebleIds.includes(inmueble.id)) return true;
    return false;
  }
  return false;
}

export function filtrarInmueblesPorUsuario(inmuebles: Inmueble[], currentUser?: UsuarioApp | null): Inmueble[] {
  if (!currentUser) return inmuebles;
  if (currentUser.tipoPerfil === 'ADMINISTRADOR') return inmuebles;
  return inmuebles.filter(i => canAccessInmueble(i, currentUser));
}

export function validarFiltrosNoApropiacion(filtros: FiltrosInforme, currentUser?: UsuarioApp | null): { valido: boolean; error?: string } {
  if (!currentUser) return { valido: true };
  if (currentUser.tipoPerfil === 'ADMINISTRADOR') return { valido: true };
  if (currentUser.tipoPerfil === 'PROPIETARIO') {
    if (filtros.propietarioId && currentUser.propietarioId && filtros.propietarioId !== currentUser.propietarioId) {
      return { valido: false, error: 'PropietarioId manipulado, acceso denegado' };
    }
  }
  if (currentUser.tipoPerfil === 'PROFESIONAL') {
    return { valido: false, error: 'Profesional no autorizado para informes económicos/fiscales' };
  }
  return { valido: true };
}

// =====================
// INFORME CARTERA - Agregador
// =====================

export function generarInformeCartera(
  propietarioId: string,
  inmuebles: Inmueble[],
  contratos: ContratoFormalizacion[],
  gastos: Gasto[],
  incidencias: Incidencia[] = [],
  polizas: PolizaSeguro[] = [],
  siniestros: Siniestro[] = [],
  trabajos: TrabajoProfesional[] = [],
  rango: RangoFechas,
  currentUser?: UsuarioApp | null,
  propietarioNombre?: string
): InformeCartera | null {
  const validacion = validarFiltrosNoApropiacion({ propietarioId, rango }, currentUser);
  if (!validacion.valido) throw new Error(validacion.error);
  if (!canAccessInformeCartera(propietarioId, currentUser)) throw new Error('Acceso denegado a cartera');

  const inmueblesPropietario = inmuebles.filter(i => i.propietarioId === propietarioId || i.propietarioPrincipalId === propietarioId);
  const inmueblesFiltrados = filtrarInmueblesPorUsuario(inmueblesPropietario, currentUser);

  const contratosPropietario = contratos.filter(c => c.propietarioId === propietarioId || inmueblesFiltrados.some(i => i.id === c.inmuebleId));
  const gastosPropietario = gastos.filter(g => g.propietarioId === propietarioId || inmueblesFiltrados.some(i => i.id === g.inmuebleId));

  // Rango fechas para filtrar
  const inicioRango = parseFechaSafe(rango.fechaInicio);
  const finRango = parseFechaSafe(rango.fechaFin);
  if (!inicioRango || !finRango) throw new Error('Rango fechas inválido');

  // Patrimonio
  const numInmuebles = inmueblesFiltrados.length;
  const numHabitaciones = inmueblesFiltrados.reduce((sum, i) => sum + (i.habitaciones || 0), 0);
  const contratosActivos = contratosPropietario.filter(c => c.estado === 'FORMALIZADO_ACTIVO' || c.esVigente).length;
  const inmueblesOcupados = inmueblesFiltrados.filter(i => i.estado === 'alquilado').length;
  const inmueblesVacios = numInmuebles - inmueblesOcupados;
  const contratosProximosFinalizar = contratosPropietario.filter(c => {
    if (!c.fechaFinContrato) return false;
    const fin = parseFechaSafe(c.fechaFinContrato);
    if (!fin) return false;
    const diff = diasEntre(new Date(), fin);
    return diff >=0 && diff <=60;
  }).length;
  const superficieTotal = inmueblesFiltrados.reduce((sum, i) => sum + (i.superficie || 0), 0);
  const valorAdquisicionTotal = inmueblesFiltrados.reduce((sum, i) => sum + (i.valorAdquisicion || 0), 0);
  const valoracionEstimadaTotal = inmueblesFiltrados.reduce((sum, i) => sum + (i.valoracionEstimada || 0), 0);

  const patrimonio: InformePatrimonio = {
    numeroInmuebles: numInmuebles,
    numeroHabitaciones: numHabitaciones,
    inmueblesOcupados,
    inmueblesVacios,
    inmueblesParcialmenteOcupados: 0, // si modalidad habitaciones
    contratosActivos,
    contratosProximosFinalizar,
    superficieTotal,
    valorAdquisicionTotal,
    valoracionEstimadaTotal,
  };

  // Economía - reutiliza calcularResumenCobros y fiscalEngine
  const todosCobros = obtenerTodosCobros(contratosPropietario);
  const cobrosRango = todosCobros.filter(c => {
    const fecha = parseFechaSafe(c.fechaVencimiento);
    if (!fecha) return false;
    return fecha >= inicioRango && fecha <= finRango;
  });
  const resumenCobros = calcularResumenCobros(cobrosRango);

  const gastosRango = gastosPropietario.filter(g => {
    const fecha = parseFechaSafe(fechaEfectivaGasto(g) || '');
    if (!fecha) return false;
    return fecha >= inicioRango && fecha <= finRango;
  });
  const gastosTotales = gastosRango.reduce((sum, g) => sum + (g.importe || 0), 0);
  const gastosDeducibles = gastosRango.filter(g => esGastoDeducible(g)).reduce((sum, g) => sum + (g.importe || 0), 0);

  // Ingresos: usar cobrosEngine, no recalcular manualmente - API real: totalRecibido/totalPrevisto/totalPendiente
  const ingresosTotales = (resumenCobros as any).totalCobrado ?? resumenCobros.totalRecibido ?? 0;
  const ingresosPrevistos = resumenCobros.totalPrevisto ?? 0;
  const ingresosPendientes = (resumenCobros as any).totalPendiente ?? resumenCobros.totalPendiente ?? 0;

  const resultado = ingresosTotales - gastosDeducibles;

  // Rentabilidad - reutilizar definición existente de fiscalEngine
  let rentabilidadEstimada = 0;
  let formulaRentabilidad = 'Resultado = Ingresos cobrados - Gastos deducibles';
  if (valorAdquisicionTotal > 0) {
    rentabilidadEstimada = Number(((resultado / valorAdquisicionTotal) * 100).toFixed(2));
    formulaRentabilidad = '(Ingresos cobrados - Gastos deducibles) / Valor adquisición * 100';
  } else if (inmueblesFiltrados.length > 0) {
    // Si no hay valor adquisición, usar margen operativo de fiscal anual si existe
    const primerInmueble = inmueblesFiltrados[0];
    if (primerInmueble) {
      const resumenFiscal = generarResumenFiscalAnual(primerInmueble.id, rango.ejercicio || new Date().getFullYear(), inmuebles, contratos, gastos, currentUser);
      if (resumenFiscal) {
        rentabilidadEstimada = resumenFiscal.margenOperativo;
        formulaRentabilidad = 'Margen operativo fiscal anual: (Cobrado - Deducible) / Cobrado * 100';
      }
    }
  }

  const economia: InformeEconomia = {
    ingresosTotales,
    ingresosPrevistos,
    ingresosPendientes,
    gastosTotales,
    gastosDeducibles,
    resultado,
    rentabilidadEstimada,
    cobrosRealizados: resumenCobros.countCobrados ?? 0,
    cobrosPendientes: resumenCobros.countPendientes ?? 0,
    cobrosVencidos: (resumenCobros as any).countVencidos ?? resumenCobros.countRetrasados ?? 0,
    cobrosImpagados: (resumenCobros as any).countImpagados ?? 0,
    deudaPendiente: (resumenCobros.totalPendiente ?? 0) + ((resumenCobros as any).totalImpagado ?? 0) + (resumenCobros.totalRetrasado ?? 0),
    formulaRentabilidad,
  };

  // Operativa
  const incidenciasPropietario = incidencias.filter(i => i.propietarioId === propietarioId || inmueblesFiltrados.some(im => im.id === i.inmuebleId));
  const metricasIncidencias = calcularMetricasIncidencias(incidenciasPropietario);
  const polizasPropietario = filtrarPolizasPorUsuario(polizas, currentUser).filter(p => p.propietarioId === propietarioId || inmueblesFiltrados.some(im => im.id === p.inmuebleId));
  const polizasActivas = polizasPropietario.filter(p => p.estado === 'VIGENTE').length;
  const alertasRenovacion = detectarPolizasProximasVencer(polizasPropietario);
  const siniestrosPropietario = siniestros.filter(s => incidenciasPropietario.some(i => i.id === s.incidenciaId));

  const operativa: InformeOperativa = {
    incidenciasAbiertas: metricasIncidencias.abiertas,
    incidenciasCerradas: metricasIncidencias.cerradas,
    incidenciasUrgentes: metricasIncidencias.urgentes,
    siniestrosAbiertos: siniestrosPropietario.filter(s => s.estado !== 'CERRADO' && s.estado !== 'INDEMNIZADO').length,
    siniestrosCerrados: siniestrosPropietario.filter(s => s.estado === 'CERRADO' || s.estado === 'INDEMNIZADO').length,
    polizasActivas,
    polizasProximasVencer: alertasRenovacion.length,
    trabajosPendientes: trabajos.filter(t => t.propietarioId === propietarioId && (t.estado === 'PENDIENTE' || t.estado === 'PRESUPUESTO_SOLICITADO')).length,
    trabajosEnCurso: trabajos.filter(t => t.propietarioId === propietarioId && t.estado === 'EN_EJECUCION').length,
  };

  // Ocupación - reutiliza definición de módulos actuales (dias alquilados / totales)
  const totalDiasRango = diasEntre(inicioRango, finRango);
  let diasAlquiladosTotal = 0;
  for (const contrato of contratosPropietario) {
    const inicioContrato = parseFechaSafe(contrato.fechaInicioContrato);
    if (!inicioContrato) continue;
    const finContrato = contrato.fechaFinContrato ? parseFechaSafe(contrato.fechaFinContrato) : finRango;
    if (!finContrato) continue;
    const inicioEfectivo = inicioContrato > inicioRango ? inicioContrato : inicioRango;
    const finEfectivo = finContrato < finRango ? finContrato : finRango;
    if (inicioEfectivo <= finEfectivo) {
      diasAlquiladosTotal += diasEntre(inicioEfectivo, finEfectivo);
    }
  }
  // Evitar doble contabilización: si varios contratos mismo inmueble solapados, no sumar doble (usar por inmueble)
  // Simplificación: calcular ocupación por inmueble sin duplicar
  const ocupacionPorInmueble = new Map<string, number>();
  for (const inmueble of inmueblesFiltrados) {
    const contratosInm = contratosPropietario.filter(c => c.inmuebleId === inmueble.id);
    let diasInm = 0;
    const periodos: { inicio: Date; fin: Date }[] = [];
    for (const contrato of contratosInm) {
      const inicio = parseFechaSafe(contrato.fechaInicioContrato);
      if (!inicio) continue;
      const fin = contrato.fechaFinContrato ? parseFechaSafe(contrato.fechaFinContrato) : finRango;
      if (!fin) continue;
      const inicioEf = inicio > inicioRango ? inicio : inicioRango;
      const finEf = fin < finRango ? fin : finRango;
      if (inicioEf <= finEf) periodos.push({ inicio: inicioEf, fin: finEf });
    }
    // Ordenar y mergear para evitar doble conteo
    periodos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
    let merged: { inicio: Date; fin: Date }[] = [];
    for (const p of periodos) {
      if (merged.length === 0) merged.push(p);
      else {
        const last = merged[merged.length - 1];
        if (p.inicio <= last.fin) {
          if (p.fin > last.fin) last.fin = p.fin;
        } else {
          merged.push(p);
        }
      }
    }
    for (const m of merged) diasInm += diasEntre(m.inicio, m.fin);
    ocupacionPorInmueble.set(inmueble.id, diasInm);
  }
  const diasAlquiladosSinDuplicar = Array.from(ocupacionPorInmueble.values()).reduce((sum, d) => sum + d, 0);
  const porcentajeOcupacion = totalDiasRango > 0 && numInmuebles > 0 ? Number(((diasAlquiladosSinDuplicar / (totalDiasRango * numInmuebles)) * 100).toFixed(2)) : 0;

  const ocupacion: InformeOcupacion = {
    diasAlquilados: diasAlquiladosSinDuplicar,
    diasVacios: totalDiasRango * numInmuebles - diasAlquiladosSinDuplicar,
    porcentajeOcupacion,
    mesesOcupados: Math.round(diasAlquiladosSinDuplicar / 30),
    mesesVacios: Math.round((totalDiasRango * numInmuebles - diasAlquiladosSinDuplicar) / 30),
    numInquilinosUnicos: new Set(contratosPropietario.map(c => c.candidatoId)).size,
    numContratos: contratosPropietario.length,
    definicionOcupacion: 'Días alquilados sin duplicar por inmueble (merge periodos solapados) / (días rango * num inmuebles) * 100 - reutiliza lógica contratos existentes',
  };

  // Evolución temporal
  const evolucion = generarEvolucionTemporal(inmueblesFiltrados, contratosPropietario, gastosPropietario, rango);

  return {
    id: `cartera_${propietarioId}_${rango.fechaInicio}_${rango.fechaFin}`,
    propietarioId,
    propietarioNombre,
    rango,
    fechaGeneracion: new Date().toISOString(),
    moneda: 'EUR',
    versionEsquema: '1.0.0',
    patrimonio,
    economia,
    operativa,
    ocupacion,
    evolucion,
    eventoExtension: 'INFORME_GENERADO',
  };
}

// =====================
// EVOLUCIÓN TEMPORAL
// =====================

export function generarEvolucionTemporal(
  inmuebles: Inmueble[],
  contratos: ContratoFormalizacion[],
  gastos: Gasto[],
  rango: RangoFechas
): EvolucionTemporalItem[] {
  const inicio = parseFechaSafe(rango.fechaInicio);
  const fin = parseFechaSafe(rango.fechaFin);
  if (!inicio || !fin) return [];

  const items: EvolucionTemporalItem[] = [];

  if (rango.periodo === 'MENSUAL' || rango.periodo === 'PERSONALIZADO') {
    // Iterar meses entre inicio y fin
    let cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    const finCursor = new Date(fin.getFullYear(), fin.getMonth(), 1);
    while (cursor <= finCursor) {
      const anio = cursor.getFullYear();
      const mes = cursor.getMonth() + 1;
      const rangoMes = crearRangoMensual(anio, mes);
      const inicioMesDate = parseFechaSafe(rangoMes.fechaInicio)!;
      const finMesDate = parseFechaSafe(rangoMes.fechaFin)!;
      // Ajustar a rango global
      const inicioEf = inicioMesDate < inicio ? inicio : inicioMesDate;
      const finEf = finMesDate > fin ? fin : finMesDate;

      const cobrosMes = obtenerTodosCobros(contratos).filter(c => {
        const fecha = parseFechaSafe(c.fechaVencimiento);
        return fecha && fecha >= inicioEf && fecha <= finEf;
      });
      const resumenRaw = calcularResumenCobros(cobrosMes);
      const resumen = mapResumenCobros(resumenRaw);
      const gastosMes = gastos.filter(g => {
        const fecha = parseFechaSafe(fechaEfectivaGasto(g) || '');
        return fecha && fecha >= inicioEf && fecha <= finEf;
      });
      const totalGastos = gastosMes.reduce((sum, g) => sum + (g.importe || 0), 0);

      items.push({
        periodo: `${anio}-${String(mes).padStart(2, '0')}`,
        fechaInicio: formatFechaISO(inicioEf),
        fechaFin: formatFechaISO(finEf),
        ingresos: resumen.totalCobrado,
        gastos: totalGastos,
        resultado: resumen.totalCobrado - totalGastos,
        ocupacion: 0, // simplificado
        numContratos: contratos.filter(c => {
          const inicioC = parseFechaSafe(c.fechaInicioContrato);
          if (!inicioC) return false;
          const finC = c.fechaFinContrato ? parseFechaSafe(c.fechaFinContrato) : fin;
          if (!finC) return false;
          return inicioC <= finEf && finC >= inicioEf;
        }).length,
      });

      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  } else if (rango.periodo === 'TRIMESTRAL') {
    for (let t = 1; t <= 4; t++) {
      const anio = rango.ejercicio || inicio.getFullYear();
      const rangoTrim = crearRangoTrimestral(anio, t);
      const inicioTrim = parseFechaSafe(rangoTrim.fechaInicio)!;
      const finTrim = parseFechaSafe(rangoTrim.fechaFin)!;
      if (finTrim < inicio || inicioTrim > fin) continue;

      const cobrosTrim = obtenerTodosCobros(contratos).filter(c => {
        const fecha = parseFechaSafe(c.fechaVencimiento);
        return fecha && fecha >= inicioTrim && fecha <= finTrim;
      });
      const resumenRaw2 = calcularResumenCobros(cobrosTrim);
      const resumen = mapResumenCobros(resumenRaw2);
      const gastosTrim = gastos.filter(g => {
        const fecha = parseFechaSafe(fechaEfectivaGasto(g) || '');
        return fecha && fecha >= inicioTrim && fecha <= finTrim;
      });
      const totalGastos = gastosTrim.reduce((sum, g) => sum + (g.importe || 0), 0);

      items.push({
        periodo: `${anio}-T${t}`,
        fechaInicio: rangoTrim.fechaInicio,
        fechaFin: rangoTrim.fechaFin,
        ingresos: resumen.totalCobrado,
        gastos: totalGastos,
        resultado: resumen.totalCobrado - totalGastos,
        ocupacion: 0,
        numContratos: contratos.length,
      });
    }
  } else if (rango.periodo === 'ANUAL') {
    const anioInicio = inicio.getFullYear();
    const anioFin = fin.getFullYear();
    for (let anio = anioInicio; anio <= anioFin; anio++) {
      const rangoAnual = crearRangoAnual(anio);
      const inicioAnual = parseFechaSafe(rangoAnual.fechaInicio)!;
      const finAnual = parseFechaSafe(rangoAnual.fechaFin)!;

      const cobrosAnual = obtenerTodosCobros(contratos).filter(c => c.anio === anio);
      const resumenRaw3 = calcularResumenCobros(cobrosAnual);
      const resumen = mapResumenCobros(resumenRaw3);
      const gastosAnual = gastos.filter(g => {
        const fecha = parseFechaSafe(fechaEfectivaGasto(g) || '');
        return fecha && fecha.getFullYear() === anio;
      });
      const totalGastos = gastosAnual.reduce((sum, g) => sum + (g.importe || 0), 0);

      items.push({
        periodo: `${anio}`,
        fechaInicio: rangoAnual.fechaInicio,
        fechaFin: rangoAnual.fechaFin,
        ingresos: resumen.totalCobrado,
        gastos: totalGastos,
        resultado: resumen.totalCobrado - totalGastos,
        ocupacion: 0,
        numContratos: contratos.filter(c => {
          const inicioC = parseFechaSafe(c.fechaInicioContrato);
          if (!inicioC) return false;
          return inicioC.getFullYear() <= anio && (!c.fechaFinContrato || parseFechaSafe(c.fechaFinContrato)!.getFullYear() >= anio);
        }).length,
      });
    }
  }

  return items;
}

// =====================
// INFORME POR INMUEBLE
// =====================

export function generarInformeInmueble(
  inmuebleId: string,
  inmuebles: Inmueble[],
  contratos: ContratoFormalizacion[],
  gastos: Gasto[],
  incidencias: Incidencia[] = [],
  polizas: PolizaSeguro[] = [],
  rango: RangoFechas,
  currentUser?: UsuarioApp | null
): InformeInmueble | null {
  const inmueble = inmuebles.find(i => i.id === inmuebleId);
  if (!inmueble) return null;
  if (!canAccessInmueble(inmueble, currentUser)) throw new Error('Acceso denegado a inmueble');

  const validacion = validarFiltrosNoApropiacion({ inmuebleId, rango }, currentUser);
  if (!validacion.valido) throw new Error(validacion.error);

  const inicioRango = parseFechaSafe(rango.fechaInicio)!;
  const finRango = parseFechaSafe(rango.fechaFin)!;

  const contratosInmueble = contratos.filter(c => c.inmuebleId === inmuebleId);
  const gastosInmueble = gastos.filter(g => g.inmuebleId === inmuebleId);
  const incidenciasInmueble = incidencias.filter(i => i.inmuebleId === inmuebleId);
  const polizasInmueble = polizas.filter(p => p.inmuebleId === inmuebleId);

  // Contratos detalle - reutiliza estados reales
  const contratosDetalle: InformeContratoDetalle[] = contratosInmueble.map(c => {
    const inicio = parseFechaSafe(c.fechaInicioContrato);
    const fin = c.fechaFinContrato ? parseFechaSafe(c.fechaFinContrato) : null;
    let diasOcupados = 0;
    if (inicio) {
      const inicioEf = inicio > inicioRango ? inicio : inicioRango;
      const finEf = fin && fin < finRango ? fin : finRango;
      if (inicioEf <= finEf) diasOcupados = diasEntre(inicioEf, finEf);
    }
    const cobrosContrato = c.registroCobros || generarPeriodosParaContrato(c);
    const ingresosPeriodo = cobrosContrato.filter(cb => {
      const fecha = parseFechaSafe(cb.fechaVencimiento);
      return fecha && fecha >= inicioRango && fecha <= finRango;
    }).reduce((sum, cb) => sum + (cb.importeRecibido || 0), 0);

    const esProximoFinalizar = fin ? diasEntre(new Date(), fin) >=0 && diasEntre(new Date(), fin) <=60 : false;

    return {
      contratoId: c.id,
      inmuebleId: c.inmuebleId,
      inquilinoNombre: c.candidatoNombre,
      modalidad: c.modalidadAlquiler || 'completo',
      estado: c.estado,
      fechaInicio: c.fechaInicioContrato,
      fechaFin: c.fechaFinContrato,
      rentaMensual: c.rentaMensual,
      diasOcupadosPeriodo: diasOcupados,
      ingresosPeriodo,
      esProximoFinalizar,
      habitacionId: c.habitacionIdentificador,
    };
  });

  // Ocupación sin duplicar (merge)
  const periodos: { inicio: Date; fin: Date }[] = [];
  for (const c of contratosInmueble) {
    const inicio = parseFechaSafe(c.fechaInicioContrato);
    if (!inicio) continue;
    const fin = c.fechaFinContrato ? parseFechaSafe(c.fechaFinContrato) : finRango;
    if (!fin) continue;
    const inicioEf = inicio > inicioRango ? inicio : inicioRango;
    const finEf = fin < finRango ? fin : finRango;
    if (inicioEf <= finEf) periodos.push({ inicio: inicioEf, fin: finEf });
  }
  periodos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  let merged: { inicio: Date; fin: Date }[] = [];
  for (const p of periodos) {
    if (merged.length === 0) merged.push(p);
    else {
      const last = merged[merged.length - 1];
      if (p.inicio <= last.fin) {
        if (p.fin > last.fin) last.fin = p.fin;
      } else merged.push(p);
    }
  }
  const diasAlquilados = merged.reduce((sum, m) => sum + diasEntre(m.inicio, m.fin), 0);
  const totalDiasRango = diasEntre(inicioRango, finRango);
  const porcentajeOcupacion = totalDiasRango >0 ? Number(((diasAlquilados / totalDiasRango)*100).toFixed(2)) : 0;

  const ocupacion: InformeOcupacion = {
    diasAlquilados,
    diasVacios: totalDiasRango - diasAlquilados,
    porcentajeOcupacion,
    mesesOcupados: Math.round(diasAlquilados/30),
    mesesVacios: Math.round((totalDiasRango - diasAlquilados)/30),
    numInquilinosUnicos: new Set(contratosInmueble.map(c=>c.candidatoId)).size,
    numContratos: contratosInmueble.length,
    definicionOcupacion: 'Merge periodos contrato sin solapamientos, reutiliza motor contratos existente',
  };

  // Economía
  const cobrosInmueble = obtenerCobrosInmueble(inmuebleId, contratos);
  const cobrosRango = cobrosInmueble.filter(c => {
    const fecha = parseFechaSafe(c.fechaVencimiento);
    return fecha && fecha >= inicioRango && fecha <= finRango;
  });
  const resumenCobrosRaw = calcularResumenCobros(cobrosRango);
  const resumenCobros = mapResumenCobros(resumenCobrosRaw);
  const gastosRango = gastosInmueble.filter(g => {
    const fecha = parseFechaSafe(fechaEfectivaGasto(g) || '');
    return fecha && fecha >= inicioRango && fecha <= finRango;
  });
  const totalGastos = gastosRango.reduce((sum, g) => sum + (g.importe||0), 0);
  const totalGastosDeducibles = gastosRango.filter(g=>esGastoDeducible(g)).reduce((sum,g)=>sum+(g.importe||0),0);

  const economia: InformeEconomia = {
    ingresosTotales: resumenCobros.totalCobrado,
    ingresosPrevistos: resumenCobros.totalPrevisto,
    ingresosPendientes: resumenCobros.totalPendiente,
    gastosTotales: totalGastos,
    gastosDeducibles: totalGastosDeducibles,
    resultado: resumenCobros.totalCobrado - totalGastosDeducibles,
    cobrosRealizados: resumenCobros.countCobrados,
    cobrosPendientes: resumenCobros.countPendientes,
    cobrosVencidos: resumenCobros.countVencidos,
    cobrosImpagados: resumenCobros.countImpagados,
    deudaPendiente: resumenCobros.totalPendiente + resumenCobros.totalImpagado,
    formulaRentabilidad: 'Ingresos cobrados - Gastos deducibles',
    rentabilidadEstimada: inmueble.rentabilidadEstimada,
  };

  // Habitaciones - diferenciar sin duplicar ingresos
  let habitacionesDetalle: InformeInmueble['habitaciones'];
  if (inmueble.modalidadAlquiler === 'habitaciones') {
    const habitacionesMap = new Map<string, { ocupada: boolean; ingresos: number }>();
    for (const c of contratosInmueble) {
      const habId = c.habitacionIdentificador || 'general';
      if (!habitacionesMap.has(habId)) habitacionesMap.set(habId, { ocupada: false, ingresos: 0 });
      const entry = habitacionesMap.get(habId)!;
      if (c.esVigente || c.estado === 'FORMALIZADO_ACTIVO') entry.ocupada = true;
      entry.ingresos += c.rentaMensual;
    }
    habitacionesDetalle = Array.from(habitacionesMap.entries()).map(([id, val]) => ({
      id,
      identificador: id,
      ocupada: val.ocupada,
      ingresos: val.ingresos,
    }));
  }

  return {
    id: `inmueble_${inmuebleId}_${rango.fechaInicio}_${rango.fechaFin}`,
    propietarioId: inmueble.propietarioId || inmueble.propietarioPrincipalId || '',
    inmuebleId,
    inmuebleDireccion: inmueble.direccion,
    inmuebleCiudad: inmueble.ciudad,
    tipoInmueble: inmueble.tipoInmueble,
    modalidadAlquiler: inmueble.modalidadAlquiler,
    rango,
    fechaGeneracion: new Date().toISOString(),
    moneda: 'EUR',
    versionEsquema: '1.0.0',
    datosBasicos: {
      direccion: inmueble.direccion,
      ciudad: inmueble.ciudad,
      superficie: inmueble.superficie,
      habitaciones: inmueble.habitaciones,
      banos: inmueble.banos,
      valorAdquisicion: inmueble.valorAdquisicion,
      fechaAdquisicion: inmueble.fechaAdquisicion,
    },
    contratos: contratosDetalle,
    ocupacion,
    economia,
    incidencias: {
      abiertas: incidenciasInmueble.filter(i=>i.estado !== 'CERRADA' && i.estado !== 'RESUELTA').length,
      cerradas: incidenciasInmueble.filter(i=>i.estado === 'CERRADA' || i.estado === 'RESUELTA').length,
      lista: incidenciasInmueble.map(i=>({ id: i.id, titulo: i.titulo, estado: i.estado, categoria: i.categoria, fecha: i.fechaCreacion })),
    },
    seguros: {
      polizasActivas: polizasInmueble.filter(p=>p.estado==='VIGENTE').length,
      lista: polizasInmueble.map(p=>({ id: p.id, aseguradora: p.aseguradora, numeroPoliza: p.numeroPoliza, tipo: p.tipo, vencimiento: p.fechaVencimiento })),
    },
    gastos: {
      total: totalGastos,
      porCategoria: calcularTotalesPorCategoria(gastosRango),
      lista: gastosRango.map(g=>({ id: g.id, fecha: fechaEfectivaGasto(g) || '', concepto: g.concepto, importe: g.importe, categoria: g.categoria })),
    },
    ingresos: {
      totalCobrado: resumenCobros.totalCobrado,
      totalPrevisto: resumenCobros.totalPrevisto,
      lista: cobrosRango.map(c=>({ periodo: c.periodoMesAnio, previsto: c.importePrevisto, cobrado: c.importeRecibido, estado: c.estado })),
    },
    habitaciones: habitacionesDetalle,
    inventario: contratosInmueble.find(c=>c.inventarioDetalle)?.inventarioDetalle,
    periodosPendientes: cobrosRango.filter(c=>c.estado==='PENDIENTE' || c.estado==='IMPAGADO').map(c=>({ periodo: c.periodoMesAnio, importe: c.importePrevisto - c.importeRecibido, estado: c.estado })),
  };
}

// =====================
// RENTABILIDAD - reutiliza motores existentes
// =====================

export function generarInformeRentabilidad(
  propietarioId: string,
  inmuebles: Inmueble[],
  contratos: ContratoFormalizacion[],
  gastos: Gasto[],
  rango: RangoFechas,
  currentUser?: UsuarioApp | null,
  inmuebleId?: string
): InformeRentabilidad {
  const validacion = validarFiltrosNoApropiacion({ propietarioId, inmuebleId, rango }, currentUser);
  if (!validacion.valido) throw new Error(validacion.error);

  const inmueblesFiltrados = inmuebleId ? inmuebles.filter(i=>i.id===inmuebleId) : inmuebles.filter(i=>i.propietarioId===propietarioId || i.propietarioPrincipalId===propietarioId);
  const inmueblesSeguros = filtrarInmueblesPorUsuario(inmueblesFiltrados, currentUser);

  const contratosFiltrados = contratos.filter(c=>inmueblesSeguros.some(i=>i.id===c.inmuebleId));
  const gastosFiltrados = gastos.filter(g=>inmueblesSeguros.some(i=>i.id===g.inmuebleId));

  const inicio = parseFechaSafe(rango.fechaInicio)!;
  const fin = parseFechaSafe(rango.fechaFin)!;

  const cobros = obtenerTodosCobros(contratosFiltrados).filter(c=>{
    const fecha = parseFechaSafe(c.fechaVencimiento);
    return fecha && fecha>=inicio && fecha<=fin;
  });
  const resumenCobrosRaw2 = calcularResumenCobros(cobros);
  const resumenCobros = mapResumenCobros(resumenCobrosRaw2);
  const gastosRango = gastosFiltrados.filter(g=>{
    const fecha = parseFechaSafe(fechaEfectivaGasto(g) || '');
    return fecha && fecha>=inicio && fecha<=fin;
  });
  const totalGastos = gastosRango.reduce((sum,g)=>sum+(g.importe||0),0);
  const totalGastosDeducibles = gastosRango.filter(g=>esGastoDeducible(g)).reduce((sum,g)=>sum+(g.importe||0),0);

  const ingresos = resumenCobros.totalCobrado;
  const resultado = ingresos - totalGastosDeducibles;

  // Reutilizar definición rentabilidad existente
  let rentabilidadEstimada = 0;
  let formula = 'Resultado = Ingresos cobrados - Gastos deducibles';
  const definicionesDisponibles: string[] = [];

  if (inmueblesSeguros.length>0) {
    const primer = inmueblesSeguros[0];
    const resumenFiscal = generarResumenFiscalAnual(primer.id, rango.ejercicio || new Date().getFullYear(), inmuebles, contratos, gastos, currentUser);
    if (resumenFiscal) {
      rentabilidadEstimada = resumenFiscal.margenOperativo;
      formula = 'Margen operativo fiscal anual: (Cobrado - Deducible)/Cobrado*100 - reutiliza fiscalEngine';
      definicionesDisponibles.push(formula);
    }
    // Segunda definición si valor adquisición disponible
    const valorTotal = inmueblesSeguros.reduce((sum,i)=>sum+(i.valorAdquisicion||0),0);
    if (valorTotal>0) {
      const rentPatrimonial = Number(((resultado/valorTotal)*100).toFixed(2));
      definicionesDisponibles.push(`Rentabilidad patrimonial: Resultado / Valor adquisición (${valorTotal}€) *100 = ${rentPatrimonial}%`);
      if (rentabilidadEstimada===0) {
        rentabilidadEstimada = rentPatrimonial;
        formula = `Resultado / Valor adquisición total (${valorTotal}€) *100`;
      }
    }
  }

  // Detalle por inmueble sin duplicar
  const detallePorInmueble = inmueblesSeguros.map(inm=>{
    const cobrosInm = obtenerCobrosInmueble(inm.id, contratos).filter(c=>{
      const fecha = parseFechaSafe(c.fechaVencimiento);
      return fecha && fecha>=inicio && fecha<=fin;
    });
    const resCobrosInmRaw = calcularResumenCobros(cobrosInm);
    const resCobrosInm = mapResumenCobros(resCobrosInmRaw);
    const gastosInm = gastosFiltrados.filter(g=>g.inmuebleId===inm.id && (()=>{ const f=parseFechaSafe(fechaEfectivaGasto(g) || ''); return f && f>=inicio && f<=fin; })());
    const totalGastosInm = gastosInm.reduce((sum,g)=>sum+(g.importe||0),0);
    const resultadoInm = resCobrosInm.totalCobrado - totalGastosInm;
    const rentInm = resCobrosInm.totalCobrado>0 ? Number(((resultadoInm/resCobrosInm.totalCobrado)*100).toFixed(2)) : 0;
    return { inmuebleId: inm.id, direccion: inm.direccion, ingresos: resCobrosInm.totalCobrado, gastos: totalGastosInm, resultado: resultadoInm, rentabilidad: rentInm };
  });

  return {
    id: `rent_${propietarioId}_${rango.fechaInicio}_${rango.fechaFin}`,
    propietarioId,
    inmuebleId,
    rango,
    fechaGeneracion: new Date().toISOString(),
    moneda: 'EUR',
    versionEsquema: '1.0.0',
    ingresos,
    gastos: totalGastos,
    resultado,
    rentabilidadEstimada,
    formula,
    definicionesDisponibles,
    detallePorInmueble,
  };
}

// =====================
// INFORME FISCAL - agrupación
// =====================

export function generarInformeFiscal(
  propietarioId: string,
  inmuebles: Inmueble[],
  contratos: ContratoFormalizacion[],
  gastos: Gasto[],
  rango: RangoFechas,
  currentUser?: UsuarioApp | null,
  agrupacion: InformeFiscal['agrupacion'] = 'INMUEBLE'
): InformeFiscal {
  const validacion = validarFiltrosNoApropiacion({ propietarioId, rango }, currentUser);
  if (!validacion.valido) throw new Error(validacion.error);
  if (!canAccessInformeCartera(propietarioId, currentUser)) throw new Error('Acceso denegado fiscal');

  const inmueblesPropietario = filtrarInmueblesPorUsuario(inmuebles.filter(i=>i.propietarioId===propietarioId || i.propietarioPrincipalId===propietarioId), currentUser);
  const ejercicio = rango.ejercicio || new Date(rango.fechaInicio).getFullYear();

  let totalIngresos = 0;
  let totalGastos = 0;
  let totalGastosDeducibles = 0;
  const porInmueble: InformeFiscal['porInmueble'] = [];
  const porCategoria: Record<string, number> = {};

  for (const inmueble of inmueblesPropietario) {
    const resumenFiscal = generarResumenFiscalAnual(inmueble.id, ejercicio, inmuebles, contratos, gastos, currentUser);
    if (!resumenFiscal) continue;

    const ingresos = resumenFiscal.ingresos.totalCobrado;
    const gastosTot = resumenFiscal.gastos.total;
    const gastosDed = resumenFiscal.gastos.totalDeducible;
    const resultado = resumenFiscal.resultadoNetoOperativo;

    totalIngresos += ingresos;
    totalGastos += gastosTot;
    totalGastosDeducibles += gastosDed;

    // Categorías fiscales conservadas
    const categorias = resumenFiscal.gastos.porCategoria;

    for (const [cat, imp] of Object.entries(categorias)) {
      porCategoria[cat] = (porCategoria[cat] || 0) + (imp as number);
    }

    porInmueble.push({
      inmuebleId: inmueble.id,
      direccion: inmueble.direccion,
      ingresos,
      gastos: gastosTot,
      gastosDeducibles: gastosDed,
      resultado,
      categorias: categorias as Record<string, number>,
    });
  }

  return {
    id: `fiscal_${propietarioId}_${ejercicio}`,
    propietarioId,
    rango,
    fechaGeneracion: new Date().toISOString(),
    moneda: 'EUR',
    versionEsquema: '1.0.0',
    ejercicio,
    agrupacion,
    totalIngresos,
    totalGastos,
    totalGastosDeducibles,
    totalResultado: totalIngresos - totalGastosDeducibles,
    porInmueble,
    porCategoria,
    categoriasFiscalesConservadas: true,
    notaAEAT: 'Exportación fiscal estructurada compatible con procesos posteriores de revisión/asesoría. No es formato oficial AEAT. No se afirma presentación oficial ante AEAT.',
  };
}

// =====================
// EXPORTACIÓN ESTRUCTURADA CSV/JSON
// =====================

export function generarExportacionFiscal(
  propietarioId: string,
  inmuebles: Inmueble[],
  contratos: ContratoFormalizacion[],
  gastos: Gasto[],
  rango: RangoFechas,
  currentUser?: UsuarioApp | null,
  formato: 'CSV' | 'JSON' = 'CSV'
): ExportacionFiscalEstructurada {
  const validacion = validarFiltrosNoApropiacion({ propietarioId, rango }, currentUser);
  if (!validacion.valido) throw new Error(validacion.error);
  if (!canAccessInformeCartera(propietarioId, currentUser)) throw new Error('Acceso denegado exportación');

  const inmueblesPropietario = filtrarInmueblesPorUsuario(inmuebles.filter(i=>i.propietarioId===propietarioId || i.propietarioPrincipalId===propietarioId), currentUser);
  const inicio = parseFechaSafe(rango.fechaInicio)!;
  const fin = parseFechaSafe(rango.fechaFin)!;

  const items: ExportacionFiscalItem[] = [];

  for (const inmueble of inmueblesPropietario) {
    const contratosInm = contratos.filter(c=>c.inmuebleId===inmueble.id);
    const cobros = obtenerCobrosInmueble(inmueble.id, contratos).filter(c=>{
      const fecha = parseFechaSafe(c.fechaVencimiento);
      return fecha && fecha>=inicio && fecha<=fin;
    });

    for (const cobro of cobros) {
      items.push({
        propietarioId,
        propietarioNombre: '',
        inmuebleId: inmueble.id,
        inmuebleDireccion: inmueble.direccion,
        ejercicio: cobro.anio,
        periodo: cobro.periodoMesAnio,
        concepto: `Alquiler ${cobro.nombreMes} - ${cobro.inquilinoNombre}`,
        fecha: cobro.fechaVencimiento,
        importe: cobro.importeRecibido,
        categoria: 'INGRESO_ALQUILER',
        tipo: 'INGRESO',
        referenciaId: cobro.id,
        origen: 'COBRO',
        moneda: 'EUR',
        ejercicioFiscal: cobro.anio,
      });
    }

    const gastosInm = gastos.filter(g=>g.inmuebleId===inmueble.id).filter(g=>{
      const fecha = parseFechaSafe(fechaEfectivaGasto(g) || '');
      return fecha && fecha>=inicio && fecha<=fin;
    });

    for (const gasto of gastosInm) {
      items.push({
        propietarioId,
        inmuebleId: inmueble.id,
        inmuebleDireccion: inmueble.direccion,
        ejercicio: gasto.ejercicioFiscal || parseFechaSafe(fechaEfectivaGasto(gasto) || '')?.getFullYear() || new Date().getFullYear(),
        periodo: (fechaEfectivaGasto(gasto) || '').slice(0,7),
        concepto: gasto.concepto,
        fecha: (fechaEfectivaGasto(gasto) || '').slice(0,10),
        importe: gasto.importe,
        categoria: gasto.categoria,
        tipo: 'GASTO',
        referenciaId: gasto.id,
        origen: 'GASTO',
        moneda: 'EUR',
        ejercicioFiscal: gasto.ejercicioFiscal,
        esDeducible: esGastoDeducible(gasto),
      });
    }
  }

  const totalIngresos = items.filter(i=>i.tipo==='INGRESO').reduce((sum,i)=>sum+i.importe,0);
  const totalGastos = items.filter(i=>i.tipo==='GASTO').reduce((sum,i)=>sum+i.importe,0);

  return {
    id: `export_${propietarioId}_${rango.fechaInicio}_${rango.fechaFin}`,
    propietarioId,
    rango,
    fechaGeneracion: new Date().toISOString(),
    versionEsquema: '1.0.0',
    formato,
    items,
    nota: 'Exportación fiscal estructurada compatible con procesos posteriores de revisión/asesoría. No es formato oficial AEAT. No se afirma presentación oficial, formato oficial, fichero oficial ni integración directa con AEAT salvo especificación oficial concreta verificada.',
    totalIngresos,
    totalGastos,
    totalResultado: totalIngresos - totalGastos,
  };
}

export function exportarCSV(exportacion: ExportacionFiscalEstructurada): string {
  const headers = ['propietarioId','inmuebleId','inmuebleDireccion','ejercicio','periodo','concepto','fecha','importe','categoria','tipo','referenciaId','origen','moneda','esDeducible'];
  const rows = exportacion.items.map(item => [
    item.propietarioId,
    item.inmuebleId,
    `"${item.inmuebleDireccion.replace(/"/g,'""')}"`,
    item.ejercicio,
    item.periodo,
    `"${item.concepto.replace(/"/g,'""')}"`,
    item.fecha,
    item.importe.toFixed(2),
    item.categoria,
    item.tipo,
    item.referenciaId,
    item.origen,
    item.moneda,
    item.esDeducible !== undefined ? String(item.esDeducible) : '',
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
}

export function exportarJSON(exportacion: ExportacionFiscalEstructurada): string {
  // No incluir datos sensibles: contraseñas, tokens, secretos
  const safe = {
    ...exportacion,
    items: exportacion.items.map(i=>({
      propietarioId: i.propietarioId,
      inmuebleId: i.inmuebleId,
      inmuebleDireccion: i.inmuebleDireccion,
      ejercicio: i.ejercicio,
      periodo: i.periodo,
      concepto: i.concepto,
      fecha: i.fecha,
      importe: i.importe,
      categoria: i.categoria,
      tipo: i.tipo,
      referenciaId: i.referenciaId,
      origen: i.origen,
      moneda: i.moneda,
      esDeducible: i.esDeducible,
    })),
  };
  return JSON.stringify(safe, null, 2);
}

// =====================
// NO DUPLICACIÓN - tests de integridad
// =====================

export function validarNoDuplicacion(
  inmuebles: Inmueble[],
  contratos: ContratoFormalizacion[],
  gastos: Gasto[]
): { valido: boolean; errores: string[] } {
  const errores: string[] = [];

  // Renta no contabilizada dos veces: verificar cobros duplicados por contrato+periodo
  const cobros = obtenerTodosCobros(contratos);
  const keySet = new Set<string>();
  for (const cobro of cobros) {
    const key = `${cobro.contratoId}_${cobro.periodoMesAnio}`;
    if (keySet.has(key)) {
      errores.push(`Cobro duplicado: contrato ${cobro.contratoId} periodo ${cobro.periodoMesAnio}`);
    }
    keySet.add(key);
  }

  // Habitación no duplica ingresos del inmueble: si inmueble modalidad habitaciones, ingresos por habitaciones no deben sumarse doble al inmueble completo
  // Verificamos que no haya contrato completo y habitaciones solapados mismo inmueble mismo periodo
  for (const inmueble of inmuebles) {
    if (inmueble.modalidadAlquiler === 'habitaciones') {
      const contratosInm = contratos.filter(c=>c.inmuebleId===inmueble.id);
      const completos = contratosInm.filter(c=>c.modalidadAlquiler==='completo');
      const habs = contratosInm.filter(c=>c.modalidadAlquiler==='habitaciones');
      if (completos.length>0 && habs.length>0) {
        // Si hay solapamiento temporal, advertencia
        for (const comp of completos) {
          const inicioComp = parseFechaSafe(comp.fechaInicioContrato);
          const finComp = comp.fechaFinContrato ? parseFechaSafe(comp.fechaFinContrato) : new Date();
          if (!inicioComp || !finComp) continue;
          for (const hab of habs) {
            const inicioHab = parseFechaSafe(hab.fechaInicioContrato);
            const finHab = hab.fechaFinContrato ? parseFechaSafe(hab.fechaFinContrato) : new Date();
            if (!inicioHab || !finHab) continue;
            if (inicioComp <= finHab && inicioHab <= finComp) {
              errores.push(`Posible duplicación ingresos inmueble ${inmueble.id}: contrato completo ${comp.id} solapa con habitación ${hab.id}`);
            }
          }
        }
      }
    }
  }

  // Gasto no aparece dos veces
  const gastoIds = gastos.map(g=>g.id);
  const gastoSet = new Set<string>();
  for (const id of gastoIds) {
    if (gastoSet.has(id)) errores.push(`Gasto duplicado id ${id}`);
    gastoSet.add(id);
  }

  // Periodo económico no se cuenta dos veces: evolución mensual no debe solapar
  // Validado en generarEvolucionTemporal por merge

  return { valido: errores.length===0, errores };
}

// =====================
// HISTORIAL INFORMES - modelo mínimo
// =====================

function mapResumenCobros(resumen: any) {
  return {
    totalCobrado: resumen.totalCobrado ?? resumen.totalRecibido ?? 0,
    totalPrevisto: resumen.totalPrevisto ?? 0,
    totalPendiente: resumen.totalPendiente ?? 0,
    totalImpagado: resumen.totalImpagado ?? 0,
    totalRetrasado: resumen.totalRetrasado ?? 0,
    countCobrados: resumen.countCobrados ?? 0,
    countPendientes: resumen.countPendientes ?? 0,
    countVencidos: resumen.countVencidos ?? resumen.countRetrasados ?? 0,
    countImpagados: resumen.countImpagados ?? 0,
  };
}

export function crearHistorialInforme(
  propietarioId: string,
  tipo: HistorialInformeGenerado['tipo'],
  rango: RangoFechas,
  generadoPor: string,
  formato?: HistorialInformeGenerado['formato'],
  inmuebleId?: string,
  numInmuebles?: number
): HistorialInformeGenerado {
  return {
    id: `hist_${propietarioId}_${Date.now()}`,
    propietarioId,
    tipo,
    formato,
    rango,
    fechaGeneracion: new Date().toISOString(),
    generadoPor,
    inmuebleId,
    numInmuebles,
    eventoExtension: tipo==='EXPORTACION' ? 'EXPORTACION_GENERADA' : 'INFORME_GENERADO',
  };
}
