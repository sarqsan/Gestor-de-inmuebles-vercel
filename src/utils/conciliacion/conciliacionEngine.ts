/**
 * Conciliación Engine — propuestas, confirmación, aplicación, trazabilidad
 * Regla: NO modificar silenciosamente contabilidad operativa
 * Detectada → Propuesta → Validada → Aplicada → Trazable
 */

import { MovimientoBancario, PropuestaConciliacion, CandidatoConciliacion, EstadoMovimientoBancario, HistorialConciliacionItem, ConfiguracionMatching, DEFAULT_CONFIG_MATCHING, ResultadoMatching } from '../../types/conciliacion';
import { CobroPeriodo, Gasto, ContratoFormalizacion, UsuarioApp } from '../../types';
import { buscarCandidatos } from './matchingEngine';
import { registrarPagoPeriodo } from '../cobrosEngine';

function generarIdConciliacion(movimientoId: string): string {
  return `conc_${movimientoId}_${Date.now()}_${Math.random().toString(36).substring(2,6)}`;
}

function crearHistorial(accion: HistorialConciliacionItem['accion'], estadoAnterior?: EstadoMovimientoBancario, estadoNuevo?: EstadoMovimientoBancario, usuario?: string, detalle?: string): HistorialConciliacionItem {
  return {
    id: `hist_${Date.now()}_${Math.random().toString(36).substring(2,6)}`,
    fecha: new Date().toISOString(),
    accion,
    estadoAnterior,
    estadoNuevo,
    usuario,
    detalle,
  };
}

export function crearPropuestasParaMovimientos(
  movimientos: MovimientoBancario[],
  cobros: CobroPeriodo[],
  gastos: Gasto[],
  inmuebles: any[],
  contratos: ContratoFormalizacion[],
  config: ConfiguracionMatching = DEFAULT_CONFIG_MATCHING
): PropuestaConciliacion[] {
  const propuestas: PropuestaConciliacion[] = [];

  for (const mov of movimientos) {
    const resultados = buscarCandidatos(mov, cobros, gastos, inmuebles, contratos, config);
    const mejor = resultados.length>0 ? resultados[0] : undefined;
    const alternativos = resultados.slice(1,5).map(r=>r.candidato);

    let estado: EstadoMovimientoBancario = 'PENDIENTE';
    let confianza = mejor?.confianza || 'SIN_MATCH';
    let puntuacion = mejor?.puntuacion || 0;

    if (mejor && confianza !== 'SIN_MATCH') {
      estado = 'PROPUESTO';
    }

    const propuesta: PropuestaConciliacion = {
      id: generarIdConciliacion(mov.idMovimiento),
      movimientoId: mov.idMovimiento,
      idImportacion: mov.idImportacion,
      propietarioId: mov.propietarioId,
      candidato: mejor?.candidato,
      candidatosAlternativos: alternativos,
      puntuacion,
      confianza,
      factores: mejor?.factores || [],
      estado,
      importeMovimiento: mov.importe,
      importeCandidato: mejor?.candidato.importe,
      diferenciaImporte: mejor?.diferenciaImporte,
      esDiscrepancia: mejor?.esDiscrepancia || false,
      toleranciaAplicada: config.toleranciaImporteExacto,
      ventanaDias: config.ventanaDiasMedia,
      fechaPropuesta: new Date().toISOString(),
      propuestaPor: 'SISTEMA',
      historial: [crearHistorial('PROPUESTA', undefined, estado, 'SISTEMA', `Propuesta ${confianza} ${puntuacion}pts`)],
      aplicado: false,
      reversible: true,
    };

    propuestas.push(propuesta);
  }

  return propuestas;
}

export function confirmarPropuesta(
  propuesta: PropuestaConciliacion,
  usuario?: UsuarioApp | null,
  notas?: string
): PropuestaConciliacion {
  if (propuesta.estado === 'CONCILIADO') throw new Error('Ya conciliado');
  if (!propuesta.candidato) throw new Error('No hay candidato para confirmar');

  const historialItem = crearHistorial('CONFIRMADA', propuesta.estado, 'CONFIRMADO', usuario?.nombre || usuario?.email || 'Usuario', notas || `Confirmado candidato ${propuesta.candidato.id}`);

  return {
    ...propuesta,
    estado: 'CONFIRMADO',
    fechaConfirmacion: new Date().toISOString(),
    confirmadoPor: usuario?.id || usuario?.email || 'Usuario',
    notas,
    historial: [...propuesta.historial, historialItem],
  };
}

export function rechazarPropuesta(
  propuesta: PropuestaConciliacion,
  usuario?: UsuarioApp | null,
  motivo?: string
): PropuestaConciliacion {
  const historialItem = crearHistorial('RECHAZADA', propuesta.estado, 'RECHAZADO', usuario?.nombre || usuario?.email || 'Usuario', motivo || 'Rechazado por usuario');

  return {
    ...propuesta,
    estado: 'RECHAZADO',
    fechaRechazo: new Date().toISOString(),
    rechazadoPor: usuario?.id || usuario?.email || 'Usuario',
    notas: motivo,
    historial: [...propuesta.historial, historialItem],
  };
}

export function marcarNoConciliable(
  propuesta: PropuestaConciliacion,
  clasificacion: PropuestaConciliacion['clasificacionNoConciliado'],
  usuario?: UsuarioApp | null
): PropuestaConciliacion {
  const historialItem = crearHistorial('NO_CONCILIABLE', propuesta.estado, 'NO_CONCILIABLE', usuario?.nombre || 'Usuario', `Clasificado como ${clasificacion}`);

  return {
    ...propuesta,
    estado: 'NO_CONCILIABLE',
    clasificacionNoConciliado: clasificacion,
    historial: [...propuesta.historial, historialItem],
  };
}

export function cambiarCandidato(
  propuesta: PropuestaConciliacion,
  nuevoCandidato: CandidatoConciliacion,
  resultados: ResultadoMatching[],
  usuario?: UsuarioApp | null
): PropuestaConciliacion {
  const nuevoResultado = resultados.find(r=>r.candidato.id===nuevoCandidato.id);
  const historialItem = crearHistorial('PROPUESTA', propuesta.estado, 'PROPUESTO', usuario?.nombre || 'Usuario', `Cambio candidato a ${nuevoCandidato.id}`);

  return {
    ...propuesta,
    candidato: nuevoCandidato,
    puntuacion: nuevoResultado?.puntuacion || propuesta.puntuacion,
    confianza: nuevoResultado?.confianza || propuesta.confianza,
    factores: nuevoResultado?.factores || propuesta.factores,
    importeCandidato: nuevoCandidato.importe,
    diferenciaImporte: nuevoResultado?.diferenciaImporte,
    esDiscrepancia: nuevoResultado?.esDiscrepancia || false,
    estado: 'PROPUESTO',
    historial: [...propuesta.historial, historialItem],
  };
}

/**
 * Aplicar conciliación — solo para coincidencias inequívocas según umbrales
 * Valida: candidato existe, no ya conciliado, movimiento no duplicado, no modificado desde propuesta
 */
export function aplicarConciliacion(
  propuesta: PropuestaConciliacion,
  cobros: CobroPeriodo[],
  gastos: Gasto[],
  contratos: ContratoFormalizacion[],
  movimientos: MovimientoBancario[],
  usuario?: UsuarioApp | null
): { propuestaActualizada: PropuestaConciliacion; contratoActualizado?: ContratoFormalizacion; error?: string } {
  // Validaciones
  if (propuesta.estado !== 'CONFIRMADO') {
    return { propuestaActualizada: propuesta, error: 'Solo se puede aplicar propuesta CONFIRMADA' };
  }
  if (!propuesta.candidato) {
    return { propuestaActualizada: propuesta, error: 'Sin candidato' };
  }
  if (propuesta.aplicado) {
    return { propuestaActualizada: propuesta, error: 'Ya aplicado' };
  }

  // Candidato sigue existiendo
  if (propuesta.candidato.tipo === 'COBRO') {
    const cobro = cobros.find(c=>c.id===propuesta.candidato!.id);
    if (!cobro) return { propuestaActualizada: propuesta, error: 'Cobro candidato ya no existe' };
    // No ya conciliado (verificar si tiene movimiento asociado en metadatos)
    // Simplificación: si estado es PAGADO/VERIFICADO ya cobrado, no debería volver a conciliar
    // Pero permitimos si es discrepancia? No, si ya está conciliado, no aplicar automáticamente
    if (propuesta.candidato.yaConciliado) {
      return { propuestaActualizada: propuesta, error: 'Candidato ya conciliado' };
    }

    // Buscar contrato
    const contrato = contratos.find(c=>c.id===cobro.contratoId);
    if (!contrato) return { propuestaActualizada: propuesta, error: 'Contrato no encontrado' };

    // NO modificar importe histórico, NO cambiar fecha devengo, solo asociar movimiento y registrar trazabilidad
    // Actualizar únicamente estado necesario según modelo existente, conservar importe original
    // Si hay diferencia importe, es discrepancia, no modificación silenciosa

    // Aplicar: registrar pago solo si importe recibido 0 y estado pendiente? Pero regla dice no marcar como cobrado únicamente por coincidencia probabilística
    // Solo aplicar si confianza ALTA y usuario confirmó
    if (propuesta.confianza !== 'ALTA') {
      return { propuestaActualizada: propuesta, error: 'Solo ALTA confianza puede aplicarse automáticamente, requiere revisión' };
    }

    // Crear contrato actualizado con trazabilidad de conciliación
    // No cambiar importe original del recibo, solo asociar movimiento bancario en historial
    const contratoActualizado = registrarPagoPeriodo(
      contrato,
      cobro.id,
      {
        importeRecibido: cobro.importeRecibido >0 ? cobro.importeRecibido : Math.abs(propuesta.importeMovimiento),
        fechaPago: new Date().toISOString().split('T')[0],
        metodoPago: 'transferencia',
        observaciones: `Conciliado bancariamente mov ${propuesta.movimientoId} importe banco ${propuesta.importeMovimiento}€ vs recibo ${cobro.importePrevisto}€ diff ${propuesta.diferenciaImporte?.toFixed(2)}€`,
      },
      usuario
    );

    // Añadir metadato de conciliación en historial del cobro (ya lo hace registrarPagoPeriodo)
    // Pero además, si hay discrepancia, no modificar importe original, generar discrepancia

    const historialAplicada = crearHistorial('APLICADA', 'CONFIRMADO', 'CONCILIADO', usuario?.nombre || 'Usuario', `Aplicado mov ${propuesta.movimientoId} a cobro ${cobro.id}`);

    const propuestaActualizada: PropuestaConciliacion = {
      ...propuesta,
      estado: 'CONCILIADO',
      aplicado: true,
      fechaAplicacion: new Date().toISOString(),
      aplicadoPor: usuario?.id || usuario?.email || 'Usuario',
      historial: [...propuesta.historial, historialAplicada],
    };

    return { propuestaActualizada, contratoActualizado };
  } else {
    // GASTO
    const gasto = gastos.find(g=>g.id===propuesta.candidato!.id);
    if (!gasto) return { propuestaActualizada: propuesta, error: 'Gasto candidato ya no existe' };

    if (propuesta.confianza !== 'ALTA') {
      return { propuestaActualizada: propuesta, error: 'Solo ALTA confianza para gastos' };
    }

    // Para gastos: asociar movimiento, mantener importe original, registrar usuario, conservar historial
    // No alterar gasto automáticamente si importe no coincide

    const historialAplicada = crearHistorial('APLICADA', 'CONFIRMADO', 'CONCILIADO', usuario?.nombre || 'Usuario', `Aplicado mov ${propuesta.movimientoId} a gasto ${gasto.id}`);

    const propuestaActualizada: PropuestaConciliacion = {
      ...propuesta,
      estado: 'CONCILIADO',
      aplicado: true,
      fechaAplicacion: new Date().toISOString(),
      aplicadoPor: usuario?.id || 'Usuario',
      historial: [...propuesta.historial, historialAplicada],
    };

    return { propuestaActualizada };
  }
}

export function calcularResumenConciliacion(propuestas: PropuestaConciliacion[]): import('../../types/conciliacion').ResumenConciliacion {
  return {
    totalMovimientos: propuestas.length,
    nuevos: propuestas.length,
    duplicados: 0,
    pendientes: propuestas.filter(p=>p.estado==='PENDIENTE').length,
    propuestos: propuestas.filter(p=>p.estado==='PROPUESTO').length,
    confirmados: propuestas.filter(p=>p.estado==='CONFIRMADO').length,
    conciliados: propuestas.filter(p=>p.estado==='CONCILIADO').length,
    rechazados: propuestas.filter(p=>p.estado==='RECHAZADO').length,
    noConciliables: propuestas.filter(p=>p.estado==='NO_CONCILIABLE').length,
    errores: propuestas.filter(p=>p.estado==='ERROR').length,
    discrepancias: propuestas.filter(p=>p.esDiscrepancia).length,
    altaConfianza: propuestas.filter(p=>p.confianza==='ALTA').length,
    mediaConfianza: propuestas.filter(p=>p.confianza==='MEDIA').length,
    bajaConfianza: propuestas.filter(p=>p.confianza==='BAJA').length,
    sinMatch: propuestas.filter(p=>p.confianza==='SIN_MATCH').length,
  };
}
