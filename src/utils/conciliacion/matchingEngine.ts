/**
 * Motor de Matching — desacoplado
 * Busca candidatos entre COBROS y GASTOS
 * Criterios independientes y ponderables
 */

import { MovimientoBancario, CandidatoConciliacion, FactorCoincidencia, ResultadoMatching, ConfiguracionMatching, DEFAULT_CONFIG_MATCHING, ConfianzaMatch } from '../../types/conciliacion';
import { CobroPeriodo, Gasto, Inmueble, ContratoFormalizacion } from '../../types';
import { fechaEfectivaGasto } from '../gastosEngine';

function normalizarTexto(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function diasDiferencia(fecha1: string, fecha2: string): number {
  const d1 = new Date(fecha1);
  const d2 = new Date(fecha2);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 999;
  const diff = Math.abs(d1.getTime() - d2.getTime());
  return Math.floor(diff / (1000*60*60*24));
}

function importeCoincide(impMov: number, impCand: number, config: ConfiguracionMatching): { coincide: boolean; exacto: boolean; diferencia: number; dentroTolerancia: boolean } {
  const movAbs = Math.abs(impMov);
  const candAbs = Math.abs(impCand);
  const diff = Math.abs(movAbs - candAbs);
  const exacto = diff <= config.toleranciaImporteExacto;
  const porcentaje = candAbs >0 ? (diff / candAbs)*100 : 100;
  const dentroPorcentaje = config.toleranciaImportePorcentaje ? porcentaje <= config.toleranciaImportePorcentaje : false;
  const dentroComision = diff <= config.toleranciaComision;
  return {
    coincide: exacto || dentroPorcentaje,
    exacto,
    diferencia: movAbs - candAbs,
    dentroTolerancia: dentroPorcentaje || dentroComision,
  };
}

export function evaluarCandidato(
  movimiento: MovimientoBancario,
  candidato: CandidatoConciliacion,
  config: ConfiguracionMatching = DEFAULT_CONFIG_MATCHING
): ResultadoMatching {
  const factores: FactorCoincidencia[] = [];
  let puntuacionTotal = 0;

  // 1. IMPORTE
  const impRes = importeCoincide(movimiento.importe, candidato.importe, config);
  if (impRes.exacto) {
    factores.push({ criterio: 'IMPORTE_EXACTO', puntuacion: config.pesoImporte, detalle: `Importe exacto ${candidato.importe}€`, coincide: true });
    puntuacionTotal += config.pesoImporte;
  } else if (impRes.dentroTolerancia) {
    const puntos = Math.round(config.pesoImporte * 0.7);
    factores.push({ criterio: 'IMPORTE_TOLERANCIA', puntuacion: puntos, detalle: `Importe con tolerancia diff ${impRes.diferencia.toFixed(2)}€`, coincide: true });
    puntuacionTotal += puntos;
  } else {
    factores.push({ criterio: 'IMPORTE_EXACTO', puntuacion: 0, detalle: `Importe no coincide mov ${movimiento.importe} vs cand ${candidato.importe} diff ${impRes.diferencia.toFixed(2)}`, coincide: false });
  }

  // 2. FECHA
  const diasDiff = diasDiferencia(movimiento.fechaOperacion, candidato.fecha);
  if (diasDiff === 0) {
    factores.push({ criterio: 'FECHA_EXACTA', puntuacion: config.pesoFecha, detalle: `Fecha exacta ${candidato.fecha}`, coincide: true });
    puntuacionTotal += config.pesoFecha;
  } else if (diasDiff <= config.ventanaDiasAlta) {
    factores.push({ criterio: 'FECHA_VENTANA', puntuacion: config.pesoFecha, detalle: `Fecha ±${diasDiff}d dentro ventana ALTA`, coincide: true });
    puntuacionTotal += config.pesoFecha;
  } else if (diasDiff <= config.ventanaDiasMedia) {
    const puntos = Math.round(config.pesoFecha * 0.7);
    factores.push({ criterio: 'FECHA_VENTANA', puntuacion: puntos, detalle: `Fecha ±${diasDiff}d dentro ventana MEDIA`, coincide: true });
    puntuacionTotal += puntos;
  } else if (diasDiff <= config.ventanaDiasBaja) {
    const puntos = Math.round(config.pesoFecha * 0.3);
    factores.push({ criterio: 'FECHA_VENTANA', puntuacion: puntos, detalle: `Fecha ±${diasDiff}d dentro ventana BAJA`, coincide: true });
    puntuacionTotal += puntos;
  } else {
    factores.push({ criterio: 'FECHA_EXACTA', puntuacion: 0, detalle: `Fecha fuera ventana ${diasDiff}d`, coincide: false });
  }

  // 3. REFERENCIA
  const movRefNorm = movimiento.referencia ? normalizarTexto(movimiento.referencia) : '';
  const candRefNorm = candidato.referencia ? normalizarTexto(candidato.referencia) : '';
  const movConceptoNorm = normalizarTexto(movimiento.concepto);
  let refCoincide = false;
  let refDetalle = '';
  if (movRefNorm && candRefNorm) {
    if (movRefNorm.includes(candRefNorm) || candRefNorm.includes(movRefNorm)) {
      refCoincide = true;
      refDetalle = `Referencia coincide ${candidato.referencia}`;
    }
  }
  // Buscar id candidato en concepto bancario
  const candIdNorm = normalizarTexto(candidato.id);
  if (!refCoincide && movConceptoNorm.includes(candIdNorm.slice(0,8))) {
    refCoincide = true;
    refDetalle = `ID candidato en concepto bancario`;
  }
  // Buscar contratoId
  if (!refCoincide && candidato.contratoId) {
    const contratoNorm = normalizarTexto(candidato.contratoId);
    if (movConceptoNorm.includes(contratoNorm.slice(0,8)) || movRefNorm.includes(contratoNorm.slice(0,8))) {
      refCoincide = true;
      refDetalle = `Contrato ${candidato.contratoId} en banco`;
    }
  }

  if (refCoincide) {
    factores.push({ criterio: 'REFERENCIA', puntuacion: config.pesoReferencia, detalle: refDetalle, coincide: true });
    puntuacionTotal += config.pesoReferencia;
  } else {
    factores.push({ criterio: 'REFERENCIA', puntuacion: 0, detalle: `Referencia no coincide`, coincide: false });
  }

  // 4. CONCEPTO
  let conceptoPuntos = 0;
  let conceptoDetalle = '';
  const candConceptoNorm = candidato.concepto ? normalizarTexto(candidato.concepto) : '';
  if (candidato.inquilinoNombre) {
    const inquilinoNorm = normalizarTexto(candidato.inquilinoNombre);
    const partes = inquilinoNorm.split(' ').filter(p=>p.length>2);
    const coincidencias = partes.filter(p => movConceptoNorm.includes(p)).length;
    if (coincidencias >= 2 || (partes.length===1 && coincidencias===1)) {
      conceptoPuntos = config.pesoConcepto;
      conceptoDetalle = `Inquilino ${candidato.inquilinoNombre} en concepto`;
    } else if (coincidencias ===1) {
      conceptoPuntos = Math.round(config.pesoConcepto*0.5);
      conceptoDetalle = `Parcial inquilino ${candidato.inquilinoNombre}`;
    }
  }
  if (conceptoPuntos===0 && candidato.proveedor) {
    const provNorm = normalizarTexto(candidato.proveedor);
    if (movConceptoNorm.includes(provNorm) || provNorm.includes(movConceptoNorm.slice(0,20))) {
      conceptoPuntos = config.pesoConcepto;
      conceptoDetalle = `Proveedor ${candidato.proveedor} en concepto`;
    }
  }
  if (conceptoPuntos===0 && candConceptoNorm && movConceptoNorm.includes(candConceptoNorm.slice(0,10))) {
    conceptoPuntos = Math.round(config.pesoConcepto*0.5);
    conceptoDetalle = `Concepto similar`;
  }

  if (conceptoPuntos>0) {
    factores.push({ criterio: 'CONCEPTO', puntuacion: conceptoPuntos, detalle: conceptoDetalle, coincide: true });
    puntuacionTotal += conceptoPuntos;
  } else {
    factores.push({ criterio: 'CONCEPTO', puntuacion: 0, detalle: `Concepto no coincide`, coincide: false });
  }

  // 5. RELACIÓN ESTRUCTURAL
  let estructuralPuntos = 0;
  let estructuralDetalle = '';
  if (movimiento.inmuebleId && candidato.inmuebleId && movimiento.inmuebleId === candidato.inmuebleId) {
    estructuralPuntos = config.pesoEstructural;
    estructuralDetalle = `Mismo inmueble ${candidato.inmuebleId}`;
  } else if (movimiento.propietarioId === candidato.propietarioId) {
    estructuralPuntos = Math.round(config.pesoEstructural*0.5);
    estructuralDetalle = `Mismo propietario`;
  }

  if (estructuralPuntos>0) {
    factores.push({ criterio: 'INMUEBLE', puntuacion: estructuralPuntos, detalle: estructuralDetalle, coincide: true });
    puntuacionTotal += estructuralPuntos;
  } else {
    factores.push({ criterio: 'INMUEBLE', puntuacion: 0, detalle: `Sin relación estructural`, coincide: false });
  }

  // Confianza
  let confianza: ConfianzaMatch = 'SIN_MATCH';
  if (puntuacionTotal >= config.umbralAlta) confianza = 'ALTA';
  else if (puntuacionTotal >= config.umbralMedia) confianza = 'MEDIA';
  else if (puntuacionTotal >= config.umbralBaja) confianza = 'BAJA';
  else confianza = 'SIN_MATCH';

  const diferencia = Math.abs(movimiento.importe) - Math.abs(candidato.importe);
  const esDiscrepancia = Math.abs(diferencia) > config.toleranciaImporteExacto;

  return {
    candidato,
    puntuacion: Math.min(100, puntuacionTotal),
    confianza,
    factores,
    diferenciaImporte: diferencia,
    esDiscrepancia,
  };
}

export function buscarCandidatos(
  movimiento: MovimientoBancario,
  cobros: CobroPeriodo[],
  gastos: Gasto[],
  inmuebles: Inmueble[],
  contratos: ContratoFormalizacion[],
  config: ConfiguracionMatching = DEFAULT_CONFIG_MATCHING
): ResultadoMatching[] {
  const candidatos: CandidatoConciliacion[] = [];

  // Aislamiento estricto por propietario: movimiento propietario no concilia otro propietario
  const cobrosFiltrados = cobros.filter(c => {
    if (c.propietarioId && c.propietarioId === movimiento.propietarioId) return true;
    // Fallback solo si el inmueble del cobro pertenece al mismo propietario que el movimiento
    if (c.inmuebleId) {
      const inm = inmuebles.find(i => i.id === c.inmuebleId);
      if (inm && (inm.propietarioId === movimiento.propietarioId || inm.propietarioPrincipalId === movimiento.propietarioId)) {
        // Pero si el cobro ya tiene propietarioId distinto, no permitir cruce
        if (c.propietarioId && c.propietarioId !== movimiento.propietarioId) return false;
        return true;
      }
    }
    return false;
  });
  const gastosFiltrados = gastos.filter(g => {
    if (g.propietarioId && g.propietarioId === movimiento.propietarioId) return true;
    if (g.inmuebleId) {
      const inm = inmuebles.find(i => i.id === g.inmuebleId);
      if (inm && (inm.propietarioId === movimiento.propietarioId || inm.propietarioPrincipalId === movimiento.propietarioId)) {
        if (g.propietarioId && g.propietarioId !== movimiento.propietarioId) return false;
        return true;
      }
    }
    return false;
  });

  // COBROS: solo si movimiento es INGRESO
  if (movimiento.tipo === 'INGRESO') {
    for (const cobro of cobrosFiltrados) {
      // No buscar ya conciliados? Se valida después, pero incluimos para scoring
      candidatos.push({
        tipo: 'COBRO',
        id: cobro.id,
        contratoId: cobro.contratoId,
        inmuebleId: cobro.inmuebleId,
        propietarioId: cobro.propietarioId,
        importe: cobro.importePrevisto,
        fecha: cobro.fechaVencimiento,
        referencia: cobro.id,
        concepto: cobro.nombreMes,
        inquilinoNombre: cobro.inquilinoNombre,
        estadoActual: cobro.estado,
      });
    }
  }

  // GASTOS: solo si movimiento es GASTO
  if (movimiento.tipo === 'GASTO') {
    for (const gasto of gastosFiltrados) {
      candidatos.push({
        tipo: 'GASTO',
        id: gasto.id,
        inmuebleId: gasto.inmuebleId,
        propietarioId: gasto.propietarioId || movimiento.propietarioId,
        importe: gasto.importe,
        fecha: (fechaEfectivaGasto(gasto, 'PAGO') || '').slice(0,10),
        referencia: gasto.id,
        concepto: gasto.concepto,
        proveedor: gasto.proveedor,
        estadoActual: gasto.estado,
      });
    }
  }

  const resultados = candidatos.map(c => evaluarCandidato(movimiento, c, config));
  // Ordenar por puntuación descendente
  resultados.sort((a,b) => b.puntuacion - a.puntuacion);
  return resultados;
}
