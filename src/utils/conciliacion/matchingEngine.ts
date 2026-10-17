/**
 * Motor de Matching — desacoplado
 * Busca candidatos entre COBROS y GASTOS
 * Criterios independientes y ponderables
 */

import { MovimientoBancario, CandidatoConciliacion, FactorCoincidencia, ResultadoMatching, ConfiguracionMatching, DEFAULT_CONFIG_MATCHING, ConfianzaMatch, PropuestaConciliacion } from '../../types/conciliacion';
import { CobroPeriodo, Gasto, Inmueble, ContratoFormalizacion } from '../../types';
import { normalizarFechaBancaria } from './validacionExtracto';

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
  config: ConfiguracionMatching = DEFAULT_CONFIG_MATCHING,
  inmuebleEtiqueta?: string,
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
  if (refCoincide) {
    factores.push({ criterio: 'REFERENCIA', puntuacion: config.pesoReferencia, detalle: refDetalle, coincide: true });
    puntuacionTotal += config.pesoReferencia;
  } else {
    factores.push({ criterio: 'REFERENCIA', puntuacion: 0, detalle: `Referencia no coincide`, coincide: false });
  }

  // 4. CONTRATO: solo se puntúa si el identificador completo aparece en el texto bancario.
  const textoBancario = normalizarTexto(`${movimiento.concepto} ${movimiento.referencia || ''}`);
  const contratoBuscado = candidato.contratoId ? normalizarTexto(candidato.contratoId) : '';
  const contratoCoincide = Boolean(contratoBuscado.length >= 5 && textoBancario.includes(contratoBuscado));
  const puntosContrato = contratoCoincide ? Math.round(config.pesoReferencia * 0.5) : 0;
  factores.push({
    criterio: 'CONTRATO', puntuacion: puntosContrato,
    detalle: contratoCoincide ? 'Identificador de contrato presente en concepto/referencia' : 'Contrato no identificable en el movimiento',
    coincide: contratoCoincide,
  });
  puntuacionTotal += puntosContrato;

  // 5. CONCEPTO
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

  // 6. INMUEBLE: cruza ID explícito o etiqueta del inmueble contra concepto/referencia.
  // Nunca se copia la dirección al detalle persistido del factor.
  const textoInmuebleBancario = normalizarTexto(`${movimiento.concepto} ${movimiento.referencia || ''}`);
  const etiquetas = String(inmuebleEtiqueta || '').split('|').map(normalizarTexto).filter(Boolean);
  const parada = new Set(['calle', 'avenida', 'av', 'del', 'de', 'la', 'el', 'piso', 'local', 'casa', 'edificio', 'plaza']);
  const etiquetaCoincideCompleta = etiquetas.some((etiqueta) => etiqueta.length >= 5 && textoInmuebleBancario.includes(etiqueta));
  const etiquetaCoincideParcial = etiquetas.some((etiqueta) => {
    const tokens = etiqueta.split(' ').filter((token) => token.length > 2 && !parada.has(token));
    const textoTokens = new Set(textoInmuebleBancario.split(' '));
    const alfanumericos = tokens.filter((token) => !/^[0-9]+$/.test(token));
    const numericos = tokens.filter((token) => /^[0-9]+$/.test(token));
    const aciertosAlfanumericos = alfanumericos.filter((token) => textoTokens.has(token)).length;
    const aciertosNumericos = numericos.filter((token) => textoTokens.has(token)).length;
    return aciertosAlfanumericos >= 2 || (aciertosAlfanumericos >= 1 && aciertosNumericos >= 1);
  });
  const inmuebleIdCoincide = Boolean(movimiento.inmuebleId && movimiento.inmuebleId === candidato.inmuebleId);
  let puntosInmueble = 0;
  let detalleInmueble = 'Sin dato de inmueble coincidente';
  if (inmuebleIdCoincide || etiquetaCoincideCompleta) {
    puntosInmueble = config.pesoEstructural;
    detalleInmueble = 'Referencia de inmueble coincidente';
  } else if (etiquetaCoincideParcial) {
    puntosInmueble = Math.round(config.pesoEstructural * 0.7);
    detalleInmueble = 'Referencia parcial de inmueble';
  } else if (movimiento.propietarioId === candidato.propietarioId) {
    puntosInmueble = Math.round(config.pesoEstructural * 0.5);
    detalleInmueble = 'Titular coincidente; inmueble pendiente de validar';
  }
  factores.push({ criterio: 'INMUEBLE', puntuacion: puntosInmueble, detalle: detalleInmueble, coincide: inmuebleIdCoincide || etiquetaCoincideCompleta || etiquetaCoincideParcial });
  puntuacionTotal += puntosInmueble;

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

function diaCandidato(valor: unknown): string | null {
  return typeof valor === 'string' ? normalizarFechaBancaria(valor) : null;
}

export function buscarCandidatos(
  movimiento: MovimientoBancario,
  cobros: CobroPeriodo[],
  gastos: Gasto[],
  inmuebles: Inmueble[],
  contratos: ContratoFormalizacion[],
  config: ConfiguracionMatching = DEFAULT_CONFIG_MATCHING,
  propuestasExistentes: PropuestaConciliacion[] = [],
): ResultadoMatching[] {
  const candidatos: CandidatoConciliacion[] = [];
  const inmueblePorId = new Map(inmuebles.map((i) => [i.id, i]));
  const contratoPorId = new Map(contratos.map((c) => [c.id, c]));
  const estaConciliado = (tipo: 'COBRO' | 'GASTO', id: string) => propuestasExistentes.some((p) =>
    p.propietarioId === movimiento.propietarioId && p.estado === 'CONCILIADO'
    && p.candidato?.tipo === tipo && p.candidato.id === id);
  const perteneceAlTitular = (propietario?: string, inmuebleId?: string) => {
    if (propietario && propietario !== movimiento.propietarioId) return false;
    if (movimiento.inmuebleId && inmuebleId && inmuebleId !== movimiento.inmuebleId) return false;
    if (propietario === movimiento.propietarioId) return true;
    const inmueble = inmuebleId ? inmueblePorId.get(inmuebleId) : undefined;
    return Boolean(inmueble && (inmueble.propietarioId === movimiento.propietarioId
      || inmueble.propietarioPrincipalId === movimiento.propietarioId
      || inmueble.titularesIds?.includes(movimiento.propietarioId)));
  };
  const cobrosFiltrados = cobros.flatMap((c) => {
    if (!perteneceAlTitular(c.propietarioId, c.inmuebleId)) return [];
    if (c.estado === 'ANULADO' || c.estado === 'DEVUELTO') return [];
    const contrato = c.contratoId
      ? contratoPorId.get(c.contratoId)
      : contratos.find((item) => item.propietarioId === movimiento.propietarioId
        && item.inmuebleId === c.inmuebleId
        && item.registroCobros?.some((registro) => registro.id === c.id));
    if (!contrato || contrato.propietarioId !== movimiento.propietarioId || contrato.inmuebleId !== c.inmuebleId) return [];
    const importe = c.importeRecibido > 0 ? c.importeRecibido : c.importePrevisto;
    const fechaRaw = ((c.estado === 'RECIBIDO' || c.estado === 'VERIFICADO') && c.fechaPago) ? c.fechaPago : c.fechaVencimiento;
    const fecha = diaCandidato(fechaRaw);
    if (!Number.isFinite(importe) || importe <= 0 || !fecha || !c.id) return [];
    return [{ cobro: c, contratoId: contrato.id, importe, fecha }];
  });
  const gastosFiltrados = gastos.filter((g) => perteneceAlTitular(g.propietarioId, g.inmuebleId)
    && g.estado !== 'ANULADO' && g.estado !== 'EN_REVISION'
    && typeof g.id === 'string' && typeof g.inmuebleId === 'string' && Boolean(g.inmuebleId)
    && Number.isFinite(g.importe) && g.importe > 0
    && Boolean(diaCandidato(g.fechaPago || g.fechaDevengo || g.fecha)));

  // COBROS: solo si movimiento es INGRESO
  if (movimiento.tipo === 'INGRESO') {
    for (const registro of cobrosFiltrados) {
      const cobro = registro.cobro;
      candidatos.push({
        tipo: 'COBRO',
        id: cobro.id,
        contratoId: registro.contratoId,
        inmuebleId: cobro.inmuebleId,
        propietarioId: cobro.propietarioId || movimiento.propietarioId,
        importe: registro.importe,
        fecha: registro.fecha,
        referencia: cobro.referenciaBancaria || cobro.id,
        concepto: cobro.nombreMes,
        inquilinoNombre: cobro.inquilinoNombre,
        estadoActual: cobro.estado,
        yaConciliado: estaConciliado('COBRO', cobro.id),
      });
    }
  }

  // GASTOS: solo si movimiento es GASTO
  if (movimiento.tipo === 'GASTO') {
    for (const gasto of gastosFiltrados) {
      const fecha = diaCandidato(gasto.fechaPago || gasto.fechaDevengo || gasto.fecha);
      if (!fecha) continue;
      candidatos.push({
        tipo: 'GASTO',
        id: gasto.id,
        inmuebleId: gasto.inmuebleId,
        propietarioId: gasto.propietarioId || movimiento.propietarioId,
        importe: gasto.importe,
        fecha,
        referencia: gasto.id,
        concepto: gasto.concepto,
        proveedor: gasto.proveedor,
        estadoActual: gasto.estado,
        yaConciliado: estaConciliado('GASTO', gasto.id),
      });
    }
  }

  const resultados = candidatos.map((c) => {
    const inmueble = inmueblePorId.get(c.inmuebleId);
    const etiqueta = inmueble ? [inmueble.alias, inmueble.direccion, inmueble.ciudad, inmueble.id].filter(Boolean).join('|') : '';
    return evaluarCandidato(movimiento, c, config, etiqueta);
  });
  // Ordenar por puntuación descendente
  resultados.sort((a,b) => b.puntuacion - a.puntuacion);
  return resultados;
}
