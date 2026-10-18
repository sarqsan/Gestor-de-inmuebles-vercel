/**
 * Motor P3 — matching asistido y decisiones manuales con historial.
 * Las propuestas no se confirman solas y ninguna transición modifica cobros, gastos o saldos.
 * Solo el adaptador Firestore autoriza y persiste la decisión junto a su evento.
 */

import { MovimientoBancario, PropuestaConciliacion, CandidatoConciliacion, EstadoMovimientoBancario, HistorialConciliacionItem, ConfiguracionMatching, DEFAULT_CONFIG_MATCHING, ResultadoMatching, EventoConciliacionBancaria } from '../../types/conciliacion';
import { CobroPeriodo, Gasto, ContratoFormalizacion, UsuarioApp, Inmueble } from '../../types';
import { buscarCandidatos } from './matchingEngine';
import { redactarTextoBancario } from './validacionExtracto';

function generarIdConciliacion(movimientoId: string): string {
  return `conc_${movimientoId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

function crearHistorial(
  accion: HistorialConciliacionItem['accion'],
  estadoAnterior?: EstadoMovimientoBancario,
  estadoNuevo?: EstadoMovimientoBancario,
  usuario?: string,
  detalle?: string,
): HistorialConciliacionItem {
  return {
    id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    fecha: new Date().toISOString(), accion, estadoAnterior, estadoNuevo, usuario, detalle,
  };
}

export function crearPropuestasParaMovimientos(
  movimientos: MovimientoBancario[],
  cobros: CobroPeriodo[],
  gastos: Gasto[],
  inmuebles: Inmueble[],
  contratos: ContratoFormalizacion[],
  config: ConfiguracionMatching = DEFAULT_CONFIG_MATCHING,
  propuestasExistentes: PropuestaConciliacion[] = [],
): PropuestaConciliacion[] {
  return movimientos.map((mov) => {
    const resultados = buscarCandidatos(mov, cobros, gastos, inmuebles, contratos, config, propuestasExistentes);
    const resultadosRelevantes = resultados.filter((resultado) => resultado.puntuacion >= config.umbralBaja && resultado.confianza !== 'SIN_MATCH');
    const mejor = resultadosRelevantes[0];
    const segundo = resultadosRelevantes[1];
    const ambigua = Boolean(mejor && segundo && !mejor.candidato.yaConciliado && !segundo.candidato.yaConciliado
      && mejor.puntuacion >= config.umbralMedia && Math.abs(mejor.puntuacion - segundo.puntuacion) < 8);
    const requiereRevision = mov.estadoValidacion === 'REQUIERE_REVISION';
    const candidatoBloqueado = Boolean(mejor?.candidato.yaConciliado);
    const candidato = !ambigua && !requiereRevision && !candidatoBloqueado ? mejor?.candidato : undefined;
    const alternativos = resultadosRelevantes.slice(ambigua || requiereRevision || candidatoBloqueado ? 0 : 1, 5).map((r) => r.candidato);
    const confianza = candidato ? mejor?.confianza || 'SIN_MATCH' : ambigua ? 'MEDIA' : 'SIN_MATCH';
    const puntuacion = candidato ? mejor?.puntuacion || 0 : ambigua ? mejor?.puntuacion || 0 : 0;
    const estado: EstadoMovimientoBancario = candidato || ambigua ? 'PROPUESTO' : 'PENDIENTE';
    const historial = crearHistorial('PROPUESTA', undefined, estado, 'SISTEMA',
      requiereRevision ? 'Movimiento marcado para revisión de datos.'
        : ambigua ? 'Hay varios candidatos próximos; requiere selección humana.'
          : candidatoBloqueado ? 'El mejor candidato ya tiene una conciliación activa.'
            : `Sugerencia ${confianza} ${puntuacion}pts; no confirmada.`);
    const propuesta: PropuestaConciliacion = {
      id: generarIdConciliacion(mov.idMovimiento),
      movimientoId: mov.idMovimiento,
      idImportacion: mov.idImportacion,
      propietarioId: mov.propietarioId,
      ...(candidato ? { candidato } : {}),
      candidatosAlternativos: alternativos,
      puntuacion,
      confianza,
      factores: candidato ? mejor?.factores || [] : [],
      estado,
      importeMovimiento: mov.importe,
      ...(candidato ? { importeCandidato: candidato.importe, diferenciaImporte: mejor?.diferenciaImporte } : {}),
      esDiscrepancia: candidato ? Boolean(mejor?.esDiscrepancia) : false,
      toleranciaAplicada: config.toleranciaImporteExacto,
      ventanaDias: config.ventanaDiasMedia,
      fechaPropuesta: mov.fechaImportacion,
      propuestaPor: 'SISTEMA',
      historial: [historial],
      aplicado: false,
      reversible: true,
      revision: 0,
      ...(ambigua ? { ambigua: true } : {}),
    };
    return propuesta;
  });
}

/** @deprecated Transición legacy de GAP6; P3 usa `decidirConciliacionManual` y exige actor+motivo en Firestore. */
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
 * @deprecated Compatibilidad de la suite GAP6 histórica; la UI P3 no llama esta ruta.
 * No modifica cobros/gastos/saldos. P3 usa `decidirConciliacionManual` más la transacción auditada.
 */
export function aplicarConciliacion(
  propuesta: PropuestaConciliacion,
  cobros: CobroPeriodo[],
  gastos: Gasto[],
  contratos: ContratoFormalizacion[],
  movimientos: MovimientoBancario[],
  usuario?: UsuarioApp | null,
): { propuestaActualizada: PropuestaConciliacion; contratoActualizado?: ContratoFormalizacion; error?: string } {
  if (propuesta.estado !== 'CONFIRMADO') return { propuestaActualizada: propuesta, error: 'Solo se puede aplicar una propuesta confirmada.' };
  if (!propuesta.candidato) return { propuestaActualizada: propuesta, error: 'Sin candidato.' };
  if (propuesta.aplicado) return { propuestaActualizada: propuesta, error: 'La propuesta ya fue aplicada.' };
  if (propuesta.candidato.yaConciliado) return { propuestaActualizada: propuesta, error: 'El candidato ya está conciliado.' };
  const movimiento = movimientos.find((m) => m.idMovimiento === propuesta.movimientoId);
  if (!movimiento || movimiento.propietarioId !== propuesta.propietarioId) {
    return { propuestaActualizada: propuesta, error: 'Movimiento fuera del ámbito o inexistente.' };
  }
  if (propuesta.candidato.propietarioId !== propuesta.propietarioId) {
    return { propuestaActualizada: propuesta, error: 'Candidato fuera del ámbito del titular.' };
  }
  if (propuesta.confianza !== 'ALTA') {
    return { propuestaActualizada: propuesta, error: 'La propuesta requiere revisión y decisión manual.' };
  }
  if (propuesta.candidato.tipo === 'COBRO') {
    const cobro = cobros.find((item) => item.id === propuesta.candidato!.id);
    if (!cobro || (cobro.propietarioId && cobro.propietarioId !== propuesta.propietarioId)) {
      return { propuestaActualizada: propuesta, error: 'Cobro fuera del ámbito o inexistente.' };
    }
    if (cobro.contratoId) {
      const contrato = contratos.find((item) => item.id === cobro.contratoId);
      if (!contrato || contrato.propietarioId !== propuesta.propietarioId || contrato.inmuebleId !== cobro.inmuebleId) {
        return { propuestaActualizada: propuesta, error: 'Contrato fuera del ámbito o inexistente.' };
      }
    }
  } else {
    const gasto = gastos.find((item) => item.id === propuesta.candidato!.id);
    if (!gasto || (gasto.propietarioId && gasto.propietarioId !== propuesta.propietarioId)) {
      return { propuestaActualizada: propuesta, error: 'Gasto fuera del ámbito o inexistente.' };
    }
  }
  const ahora = new Date().toISOString();
  return {
    propuestaActualizada: {
      ...propuesta,
      estado: 'CONCILIADO',
      aplicado: false,
      fechaAplicacion: ahora,
      aplicadoPor: usuario?.authUid || usuario?.uid || usuario?.id || 'USUARIO_AUTORIZADO',
      historial: [...propuesta.historial, crearHistorial('APLICADA', 'CONFIRMADO', 'CONCILIADO', usuario?.nombre || 'Usuario', 'Decisión bancaria registrada; la contabilidad operativa no se modificó.')],
    },
  };
}

export interface OpcionesDecisionConciliacion {
  accion: EventoConciliacionBancaria['accion'];
  actor: UsuarioApp;
  motivo: string;
  operacionId: string;
  candidato?: CandidatoConciliacion;
  fecha?: string;
}

function validarActorDecision(propuesta: PropuestaConciliacion, actor: UsuarioApp): string {
  const actorUid = actor.authUid || actor.uid;
  if (!actorUid) throw new Error('No se puede registrar la decisión sin UID autenticado.');
  if (actor.tipoPerfil !== 'ADMINISTRADOR' && actor.tipoPerfil !== 'PROPIETARIO') {
    throw new Error('Perfil no autorizado para decisiones de conciliación.');
  }
  if (actor.tipoPerfil === 'PROPIETARIO' && actor.propietarioId !== propuesta.propietarioId) {
    throw new Error('La propuesta no pertenece al ámbito del titular autenticado.');
  }
  return actorUid;
}

function validarMotivo(motivo: string): string {
  const limpio = motivo.trim().replace(/[\u0000-\u001f\u007f]/g, ' ');
  if (limpio.length < 5 || limpio.length > 500) throw new Error('El motivo debe tener entre 5 y 500 caracteres.');
  const compacto = limpio.replace(/[^A-Z0-9]/gi, '');
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i.test(compacto) || /\d{10,}/.test(compacto)) {
    throw new Error('El motivo contiene una secuencia bancaria o numérica que no debe almacenarse.');
  }
  return redactarTextoBancario(limpio, 500);
}

function validarCandidatoManual(propuesta: PropuestaConciliacion, candidato: CandidatoConciliacion): void {
  const tipoEsperado = propuesta.importeMovimiento >= 0 ? 'COBRO' : 'GASTO';
  if (candidato.propietarioId !== propuesta.propietarioId) throw new Error('El candidato pertenece a otro titular.');
  if (!candidato.inmuebleId) throw new Error('El candidato no tiene un inmueble verificable.');
  if (candidato.tipo !== tipoEsperado) throw new Error('El tipo de candidato no coincide con el sentido del movimiento.');
  if (candidato.yaConciliado) throw new Error('El candidato ya tiene una conciliación activa.');
}

/** Transición pura; la autorización real y la escritura atómica corresponden al adaptador Firestore. */
export function decidirConciliacionManual(
  propuesta: PropuestaConciliacion,
  opciones: OpcionesDecisionConciliacion,
): { propuestaActualizada: PropuestaConciliacion; evento: EventoConciliacionBancaria } {
  const actorUid = validarActorDecision(propuesta, opciones.actor);
  const motivo = validarMotivo(opciones.motivo);
  const operacionId = opciones.operacionId.trim();
  if (!/^[A-Za-z0-9._:-]{1,119}$/.test(operacionId)) throw new Error('Identificador de operación inválido.');
  const fecha = opciones.fecha ? new Date(opciones.fecha) : new Date();
  if (!Number.isFinite(fecha.getTime())) throw new Error('Fecha de decisión inválida.');
  const fechaIso = fecha.toISOString();
  const accion = opciones.accion;
  const estadoAnterior = propuesta.estado;
  const candidatoAnterior = propuesta.candidato;
  let candidatoNuevo = candidatoAnterior;
  let estadoNuevo: EstadoMovimientoBancario;

  if (accion === 'CONCILIAR') {
    if (!['PENDIENTE', 'PROPUESTO', 'CONFIRMADO'].includes(estadoAnterior)) throw new Error('La propuesta no está disponible para conciliar.');
    candidatoNuevo = opciones.candidato || candidatoAnterior;
    if (!candidatoNuevo) throw new Error('Seleccione un cobro o gasto antes de conciliar.');
    validarCandidatoManual(propuesta, candidatoNuevo);
    estadoNuevo = 'CONCILIADO';
  } else if (accion === 'RECHAZAR') {
    if (!['PENDIENTE', 'PROPUESTO', 'CONFIRMADO'].includes(estadoAnterior)) throw new Error('La propuesta no está disponible para rechazar.');
    estadoNuevo = 'RECHAZADO';
  } else if (accion === 'REVERSAR') {
    if (estadoAnterior !== 'CONCILIADO' || !candidatoAnterior) throw new Error('Solo se puede revertir una conciliación activa.');
    estadoNuevo = 'REVERSADO';
  } else {
    if (estadoAnterior !== 'CONCILIADO' || !candidatoAnterior) throw new Error('Solo se puede corregir una conciliación activa.');
    if (!opciones.candidato) throw new Error('Seleccione el candidato correcto.');
    validarCandidatoManual(propuesta, opciones.candidato);
    if (opciones.candidato.tipo === candidatoAnterior.tipo && opciones.candidato.id === candidatoAnterior.id) {
      throw new Error('El candidato corregido debe ser distinto del actual.');
    }
    candidatoNuevo = opciones.candidato;
    estadoNuevo = 'CONCILIADO';
  }

  const idEvento = `conc_evt_${operacionId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const evento: EventoConciliacionBancaria = {
    id: idEvento,
    propietarioId: propuesta.propietarioId,
    propuestaId: propuesta.id,
    movimientoId: propuesta.movimientoId,
    accion,
    fecha: fechaIso,
    actorUid,
    actorUsuarioId: opciones.actor.id,
    motivo,
    estadoAnterior,
    estadoNuevo,
    ...(candidatoAnterior ? { candidatoAnteriorId: `${candidatoAnterior.tipo}:${candidatoAnterior.id}` } : {}),
    ...(candidatoNuevo ? { candidatoNuevoId: `${candidatoNuevo.tipo}:${candidatoNuevo.id}` } : {}),
    operacionId,
  };
  const accionHistorial = ({
    CONCILIAR: 'APLICADA', RECHAZAR: 'RECHAZADA', REVERSAR: 'REVERSADA', CORREGIR: 'CORREGIDA',
  } as const)[accion];
  const historialItem: HistorialConciliacionItem = {
    id: idEvento, fecha: fechaIso, accion: accionHistorial, usuario: opciones.actor.nombre,
    actorUid, motivo, estadoAnterior, estadoNuevo,
    ...(evento.candidatoAnteriorId ? { candidatoAnteriorId: evento.candidatoAnteriorId } : {}),
    ...(evento.candidatoNuevoId ? { candidatoNuevoId: evento.candidatoNuevoId } : {}),
  };
  const candidatoCambiado = Boolean(candidatoNuevo && (!candidatoAnterior
    || candidatoNuevo.tipo !== candidatoAnterior.tipo || candidatoNuevo.id !== candidatoAnterior.id));
  const diferenciaImporte = candidatoNuevo
    ? Math.abs(propuesta.importeMovimiento) - Math.abs(candidatoNuevo.importe)
    : undefined;
  const tolerancia = propuesta.toleranciaAplicada ?? DEFAULT_CONFIG_MATCHING.toleranciaImporteExacto;
  const propuestaActualizada: PropuestaConciliacion = {
    ...propuesta,
    estado: estadoNuevo,
    candidato: candidatoNuevo,
    revision: (propuesta.revision || 0) + 1,
    ultimoEventoId: idEvento,
    motivoDecision: motivo,
    historial: [...propuesta.historial, historialItem],
    ...(accion === 'CONCILIAR' || accion === 'CORREGIR' ? {
      ambigua: false,
      importeCandidato: candidatoNuevo?.importe,
      diferenciaImporte,
      esDiscrepancia: diferenciaImporte !== undefined && Math.abs(diferenciaImporte) > tolerancia,
      ...(candidatoCambiado ? { confianza: 'SIN_MATCH' as const, puntuacion: 0, factores: [] } : {}),
    } : {}),
    ...(accion === 'CONCILIAR' ? {
      aplicado: false, fechaConfirmacion: fechaIso,
      confirmadoPor: actorUid, fechaAplicacion: undefined, aplicadoPor: undefined,
    } : {}),
    ...(accion === 'RECHAZAR' ? { fechaRechazo: fechaIso, rechazadoPor: actorUid } : {}),
    ...(accion === 'REVERSAR' ? { fechaReversion: fechaIso, revertidoPor: actorUid, motivoReversion: motivo } : {}),
    ...(accion === 'CORREGIR' ? { ambigua: false, aplicado: false, fechaConfirmacion: fechaIso, confirmadoPor: actorUid } : {}),
  };
  return { propuestaActualizada, evento };
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
