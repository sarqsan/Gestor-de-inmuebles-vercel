/**
 * GAP4 — Motor financiero de financiación hipotecaria avanzada.
 * -------------------------------------------------------------
 * Motor DETERMINISTA (sin I/O) para:
 *   - cuadro de amortización francés y lineal;
 *   - tipo fijo / variable / mixto (con transición de tipo);
 *   - carencia (ninguna / solo intereses / total);
 *   - amortización anticipada (reducir cuota o reducir plazo);
 *   - coste financiero y datos para rentabilidad/flujo de caja.
 *
 * Fórmulas ANGLOSAJAS (explícitas):
 *   - Tasa mensual: r = tipoInteresAnual / 100 / 12.
 *   - Cuota francesa (constante): C = P·r / (1 − (1+r)^−n); si r = 0 → C = P/n.
 *   - Lineal: capital uniforme = P / nº_periodos_normales; intereses sobre saldo.
 *   - LTV = importeFinanciado / valorReferencia × 100.
 *   - Carencia SOLO_INTERESES: capital=0, cuota=intereses del saldo.
 *   - Carencia TOTAL: capital=0, cuota=0; los intereses se CAPITALIZAN al saldo
 *     (fórmula adoptada por este modelo, documentada como elección).
 *   - Último periodo: se cuadra capitalPendiente a 0 (sin errores acumulativos).
 */

import type {
  AsientoAmortizacion,
  Financiacion,
  FinanciacionParams,
} from '../types/financiacion';
import { calcularLTV, redondear2, validarFinanciacion } from '../types/financiacion';

export const tasaMensual = (tipoInteresAnual: number): number => tipoInteresAnual / 100 / 12;

/** Cuota francesa constante (referencia y cálculo puro). */
export function cuotaFrancesa(principal: number, tipoInteresAnual: number, plazoMeses: number): number {
  const r = tasaMensual(tipoInteresAnual);
  if (r === 0) return redondear2(principal / plazoMeses);
  const denominador = 1 - Math.pow(1 + r, -plazoMeses);
  if (denominador === 0) return redondear2(principal);
  return redondear2((principal * r) / denominador);
}

// ---------------------------------------------------------------------------
// Serie de tipos por periodo (fijo / variable / mixto)
// ---------------------------------------------------------------------------

export interface TramoTipo {
  desdePeriodo: number; // inclusive
  hastaPeriodo: number; // inclusive
  tipoAnual: number;
}

/**
 * Devuelve el tipo anual de interés aplicable a cada periodo 1..plazoMeses.
 * - FIJO: constante = tipoInteresAnual.
 * - VARIABLE: valorIndice (referencia) + diferencial (constante en simulación;
 *   sin datos de mercado).
 * - MIXTO: tramo inicial fijo (tipoInteresAnual) → tramo variable
 *   (tipoInteresAnualVariable).
 */
export function tiposPorPeriodo(p: FinanciacionParams): number[] {
  const n = p.plazoMeses;
  const tipos: number[] = new Array(n).fill(p.tipoInteresAnual);

  if (p.modalidadInteres === 'VARIABLE') {
    const tipo = (p.valorIndice ?? p.tipoInteresAnual) + (p.diferencial ?? 0);
    for (let i = 0; i < n; i++) tipos[i] = tipo;
  } else if (p.modalidadInteres === 'MIXTO') {
    const fijo = p.periodoInicialFijoMeses ?? 0;
    const variable = p.tipoInteresAnualVariable ?? p.tipoInteresAnual;
    for (let i = 0; i < n; i++) tipos[i] = i < fijo ? p.tipoInteresAnual : variable;
  }
  return tipos;
}

export function tramosDeTipo(p: FinanciacionParams): TramoTipo[] {
  const tipos = tiposPorPeriodo(p);
  const tramos: TramoTipo[] = [];
  let inicio = 0;
  for (let i = 1; i <= tipos.length; i++) {
    if (i === tipos.length || tipos[i] !== tipos[i - 1]) {
      tramos.push({ desdePeriodo: inicio + 1, hastaPeriodo: i, tipoAnual: tipos[i - 1] });
      inicio = i;
    }
  }
  return tramos;
}

function sumarMeses(fechaInicio: string, k: number): string {
  const d = new Date(`${fechaInicio}T00:00:00`);
  if (Number.isNaN(d.getTime())) return fechaInicio;
  d.setDate(1);
  d.setMonth(d.getMonth() + k);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

// ---------------------------------------------------------------------------
// Cuadro de amortización
// ---------------------------------------------------------------------------

export interface CuadroAmortizacionResult {
  asientos: AsientoAmortizacion[];
  cuotaNormal: number; // cuota de referencia (francés: cuota constante base)
  totalIntereses: number;
  totalPagado: number;
}

export function generarCuadroAmortizacion(p: FinanciacionParams): AsientoAmortizacion[] {
  const v = validarFinanciacion(p);
  if (!v.valido) {
    throw new Error(`financiacion_invalida: ${v.errores.join(', ')}`);
  }

  const n = p.plazoMeses;
  const carencia = p.carencia === 'NINGUNA' ? 0 : p.carenciaMeses || 0;
  const inicio = p.inicio || new Date().toISOString().slice(0, 10);
  const tipos = tiposPorPeriodo(p);

  const asientos: AsientoAmortizacion[] = [];
  let saldo = redondear2(p.principal);
  let cuotaActual = 0;

  for (let i = 1; i <= n; i++) {
    const enCarencia = i <= carencia;
    const modo: AsientoAmortizacion['tipoTramo'] = !enCarencia
      ? 'normal'
      : p.carencia === 'SOLO_INTERESES'
      ? 'carencia_solo_intereses'
      : 'carencia_total';

    const r = tasaMensual(tipos[i - 1]);
    const intereses = redondear2(saldo * r);
    const nRestanteNormal = n - i + 1;

    let capital = 0;
    let cuotaTotal = 0;

    if (modo === 'normal') {
      if (p.sistemaAmortizacion === 'FRANCES') {
        // Recalcular cuota al entrar en el tramo normal o al cambiar el tipo.
        if (i === 1 || i === carencia + 1 || (i > 1 && tipos[i - 1] !== tipos[i - 2])) {
          cuotaActual = cuotaFrancesa(saldo, tipos[i - 1], nRestanteNormal);
        }
        capital = redondear2(cuotaActual - intereses);
        if (i === n) capital = redondear2(saldo); // cuadre último periodo
        if (capital > saldo) capital = redondear2(saldo);
        cuotaTotal = redondear2(intereses + capital);
        saldo = redondear2(saldo - capital);
      } else {
        // LINEAL: capital uniforme sobre los periodos normales.
        const capitalUniforme = redondear2(p.principal / (n - carencia));
        capital = i === n ? redondear2(saldo) : Math.min(capitalUniforme, redondear2(saldo));
        cuotaTotal = redondear2(intereses + capital);
        saldo = redondear2(saldo - capital);
      }
    } else if (modo === 'carencia_solo_intereses') {
      capital = 0;
      cuotaTotal = intereses;
      // saldo no cambia
    } else {
      // carencia_total: se capitalizan intereses al saldo, sin cuota.
      capital = 0;
      cuotaTotal = 0;
      saldo = redondear2(saldo + intereses);
    }

    asientos.push({
      periodo: i,
      fecha: sumarMeses(inicio, i - 1),
      tipoTramo: modo,
      cuotaTotal,
      intereses,
      capitalAmortizado: capital,
      capitalPendiente: redondear2(saldo),
    });
  }

  return asientos;
}

export function resumenCuadro(asientos: AsientoAmortizacion[]): { totalIntereses: number; totalPagado: number } {
  const totalPagado = redondear2(asientos.reduce((acc, a) => acc + a.cuotaTotal, 0));
  const principalInicial = redondear2(
    asientos.reduce((acc, a) => acc + a.capitalAmortizado, 0) +
      (asientos.length > 0 ? asientos[asientos.length - 1].capitalPendiente : 0)
  );
  const totalIntereses = redondear2(Math.max(0, totalPagado - principalInicial));
  return { totalIntereses, totalPagado };
}

// ---------------------------------------------------------------------------
// Amortización anticipada
// ---------------------------------------------------------------------------

export interface ParametrosAmortizacionAnticipada {
  principalInicial: number;
  saldoPendiente: number;
  periodosRestantes: number;
  tipoInteresAnual: number; // tipo de referencia para recalcular
}

export interface ResultadoAmortizacionAnticipada {
  importeAmortizado: number;
  capitalPendienteAntes: number;
  capitalPendienteDespues: number;
  gastoCancelacion: number;
  modalidad: 'reducir_cuota' | 'reducir_plazo';
  nuevaCuota: number | null;
  nuevoPlazoMeses: number | null;
  cuotaAnterior: number;
}

export function simularAmortizacionAnticipada(
  params: ParametrosAmortizacionAnticipada,
  importe: number,
  modalidad: 'reducir_cuota' | 'reducir_plazo' = 'reducir_cuota',
  gastoCancelacion = 0
): ResultadoAmortizacionAnticipada {
  const importeAmortizado = redondear2(Math.max(0, Math.min(importe, params.saldoPendiente)));
  const antes = redondear2(params.saldoPendiente);
  const despues = redondear2(antes - importeAmortizado);
  const r = tasaMensual(params.tipoInteresAnual);
  const cuotaAnterior = cuotaFrancesa(params.saldoPendiente, params.tipoInteresAnual, params.periodosRestantes);

  let nuevaCuota: number | null = null;
  let nuevoPlazoMeses: number | null = null;

  if (modalidad === 'reducir_cuota') {
    nuevaCuota = despues > 0 && params.periodosRestantes > 0
      ? cuotaFrancesa(despues, params.tipoInteresAnual, params.periodosRestantes)
      : 0;
  } else {
    if (despues > 0 && cuotaAnterior > 0 && r > 0) {
      // n' = -ln(1 - r·saldo/C) / ln(1+r)
      const ratio = (r * despues) / cuotaAnterior;
      if (ratio < 1) {
        nuevoPlazoMeses = Math.max(1, Math.ceil(-Math.log(1 - ratio) / Math.log(1 + r)));
      } else {
        nuevoPlazoMeses = params.periodosRestantes;
      }
    } else if (despues === 0) {
      nuevoPlazoMeses = 0;
    }
  }

  return {
    importeAmortizado,
    capitalPendienteAntes: antes,
    capitalPendienteDespues: despues,
    gastoCancelacion: redondear2(gastoCancelacion),
    modalidad,
    nuevaCuota: nuevaCuota === null ? null : redondear2(nuevaCuota),
    nuevoPlazoMeses,
    cuotaAnterior,
  };
}

// ---------------------------------------------------------------------------
// Coste financiero e impacto económico
// ---------------------------------------------------------------------------

export function calcularCosteFinanciero(
  asientos: AsientoAmortizacion[],
  principal: number,
  valorReferencia: number
): {
  principal: number;
  totalIntereses: number;
  totalPagado: number;
  capitalPendiente: number;
  cuotasEjecutadas: number;
  cuotasTotales: number;
  ltvActual: number | null;
} {
  const { totalIntereses, totalPagado } = resumenCuadro(asientos);
  const capitalPendiente = asientos.length > 0 ? asientos[asientos.length - 1].capitalPendiente : principal;
  return {
    principal: redondear2(principal),
    totalIntereses,
    totalPagado,
    capitalPendiente: redondear2(capitalPendiente),
    cuotasEjecutadas: asientos.length,
    cuotasTotales: asientos.length,
    ltvActual: valorReferencia > 0 ? redondear2((capitalPendiente / valorReferencia) * 100) : null,
  };
}

export function calcularImpacto(
  asientos: AsientoAmortizacion[],
  importeFinanciado: number,
  valorReferencia: number
): {
  inversionInicial: number;
  importeFinanciado: number;
  capitalAportado: number;
  totalIntereses: number;
  capitalPendiente: number;
  flujoCajaSalidaCuotas: number;
} {
  const { totalIntereses, totalPagado } = resumenCuadro(asientos);
  const capitalPendiente = asientos.length > 0 ? asientos[asientos.length - 1].capitalPendiente : 0;
  return {
    inversionInicial: redondear2(valorReferencia),
    importeFinanciado: redondear2(importeFinanciado),
    capitalAportado: redondear2(valorReferencia - importeFinanciado),
    totalIntereses,
    capitalPendiente: redondear2(capitalPendiente),
    flujoCajaSalidaCuotas: totalPagado,
  };
}

export interface DatosCreacionFinanciacion {
  id: string;
  inmuebleId: string;
  propietarioId: string;
  inmuebleDireccion?: string;
  entidadNombre: string;
  entidadId?: string;
  importeFinanciado: number;
  valorReferencia: number;
  plazoMeses: number;
  tipoInteresAnual: number;
  modalidadInteres: FinanciacionParams['modalidadInteres'];
  sistemaAmortizacion: FinanciacionParams['sistemaAmortizacion'];
  fechaFormalizacion: string;
  carencia?: FinanciacionParams['carencia'];
  carenciaMeses?: number;
  diferencial?: number;
  indiceReferencia?: string;
  valorIndice?: number;
  periodoInicialFijoMeses?: number;
  tipoInteresAnualVariable?: number;
  gastosFormalizacion?: number;
}

/**
 * Factory canónica de financiación: valida, calcula LTV y genera el cuadro de
 * amortización de una sola vez (fuente única de construcción, sin duplicar la
 * lógica de la UI). El objeto se devuelve en estado SOLICITADA; el saldo
 * pendiente inicial es el importe financiado completo.
 */
export interface FinanciacionFactoryResult {
  financiacion: Financiacion;
  advertencias: string[];
}

export function crearFinanciacion(
  d: DatosCreacionFinanciacion
): FinanciacionFactoryResult {
  const params: FinanciacionParams = {
    principal: d.importeFinanciado,
    valorReferencia: d.valorReferencia,
    plazoMeses: d.plazoMeses,
    tipoInteresAnual: d.tipoInteresAnual,
    sistemaAmortizacion: d.sistemaAmortizacion,
    modalidadInteres: d.modalidadInteres,
    inicio: d.fechaFormalizacion,
    carencia: d.carencia || 'NINGUNA',
    carenciaMeses: d.carenciaMeses || 0,
    diferencial: d.diferencial,
    indiceReferencia: d.indiceReferencia,
    valorIndice: d.valorIndice,
    periodoInicialFijoMeses: d.periodoInicialFijoMeses,
    tipoInteresAnualVariable: d.tipoInteresAnualVariable,
  };

  const validacion = validarFinanciacion(params);
  if (!validacion.valido) {
    throw new Error(`financiacion_invalida: ${validacion.errores.join(', ')}`);
  }

  const ltv = calcularLTV(d.importeFinanciado, d.valorReferencia);
  if (ltv == null) {
    throw new Error('financiacion_invalida: LTV no calculable');
  }

  const cuadro = generarCuadroAmortizacion(params);

  return {
    financiacion: {
      id: d.id,
      inmuebleId: d.inmuebleId,
      propietarioId: d.propietarioId,
      entidad: {
        id: d.entidadId || `entidad_${d.id}`,
        nombre: d.entidadNombre,
      },
      importeFinanciado: redondear2(d.importeFinanciado),
      valorReferencia: redondear2(d.valorReferencia),
      ltv,
      plazoMeses: d.plazoMeses,
      fechaFormalizacion: d.fechaFormalizacion,
      fechaInicio: d.fechaFormalizacion,
      tipoInteresAnual: redondear2(d.tipoInteresAnual),
      modalidadInteres: d.modalidadInteres,
      diferencial: d.diferencial,
      indiceReferencia: d.indiceReferencia,
      sistemaAmortizacion: d.sistemaAmortizacion,
      carencia: d.carencia || 'NINGUNA',
      carenciaMeses: d.carenciaMeses || 0,
      gastosFinancieros: d.gastosFormalizacion,
      estado: 'SOLICITADA',
      saldoPendiente: redondear2(d.importeFinanciado),
      cuadroAmortizacion: cuadro,
      eventos: [
        {
          fecha: new Date().toISOString(),
          accion: 'CREADA',
          detalle: 'Financiación creada (estado SOLICITADA)',
        },
      ],
      reembolsosAnticipados: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    advertencias: [],
  };
}

// ---------------------------------------------------------------------------
// RBAC puro (aislamiento por propietario/inmueble; deny-by-default)
// ---------------------------------------------------------------------------

export interface ActorFinanciacion {
  tipoPerfil: 'ADMINISTRADOR' | 'PROPIETARIO' | 'PROFESIONAL' | null;
  propietarioId?: string;
  inmuebleIds?: string[];
}

export function puedeGestionarFinanciacion(
  actor: ActorFinanciacion,
  financiacion: { propietarioId: string; inmuebleId: string }
): boolean {
  if (!actor.tipoPerfil) return false; // anónimo ⇒ denegado
  if (actor.tipoPerfil === 'ADMINISTRADOR') return true;
  if (actor.tipoPerfil === 'PROFESIONAL') return false; // el profesional no gestiona financiación del propietario
  if (actor.propietarioId && financiacion.propietarioId === actor.propietarioId) return true;
  if (actor.inmuebleIds && actor.inmuebleIds.includes(financiacion.inmuebleId)) return true;
  return false;
}
