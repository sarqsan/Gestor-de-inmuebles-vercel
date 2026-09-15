// ============================================================
// FASE 2.3 — Motor de PRÉSTAMOS / HIPOTECAS
// Sistema francés de amortización (cuota constante): cada recibo
// se compone de intereses sobre el saldo vivo + la parte de capital
// necesaria para que la cuota total sea la misma todos los meses.
//
//   i   = TIN/100/12
//   c   = C0 · i / (1 − (1+i)^−n)
//   I_k = saldo_{k-1} · i
//   A_k = c − I_k
//
// Estos importes alimentan el desglose capitalAmortizado/intereses de los
// gastos FINANCIACION, que es lo que el cuadre de rentabilidad necesita:
// el capital NO es gasto y solo los intereses entran en la base fiscal.
// ============================================================

import type { Prestamo } from '../types';
import { etiquetaMesAnio, sumarMeses } from './gastosEngine';

export interface CuotaAmortizacion {
  numero: number; // 1..n
  periodo: string; // YYYY-MM
  fecha: string; // YYYY-MM-DD
  cuota: number; // Capital + intereses del recibo (sin contar la amortización anticipada)
  capital: number; // Amortización ordinaria de deuda del recibo
  intereses: number; // Intereses del recibo
  amortizacionAdicional: number; // Amortización anticipada aplicada en ese mes
  enCarencia: boolean;
  saldoInicial: number;
  saldoFinal: number;
}

export interface ResumenPrestamo {
  cuotaConstante: number;
  numeroCuotas: number;
  totalPagado: number; // Suma de cuotas del cuadro completo
  totalIntereses: number;
  totalCapital: number;
  // Estado teórico a una fecha de corte (mes en curso por defecto)
  cuotasVencidas: number;
  capitalAmortizado: number;
  interesesPagados: number;
  importePagado: number;
  saldoPendiente: number;
  porcentajeAmortizado: number; // 0-100 sobre el principal
  finalizado: boolean;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

export function tasaMensual(tasaAnualPct: number): number {
  return (Number(tasaAnualPct) || 0) / 100 / 12;
}

/** Cuota constante (capital + intereses) del sistema francés. */
export function calcularCuotaConstante(
  capitalInicial: number,
  tasaAnualPct: number,
  plazoMeses: number
): number {
  const capital = Number(capitalInicial) || 0;
  const n = Math.round(Number(plazoMeses) || 0);
  if (capital <= 0 || n <= 0) return 0;
  const i = tasaMensual(tasaAnualPct);
  if (i === 0) return round2(capital / n);
  const cuota = (capital * i) / (1 - Math.pow(1 + i, -n));
  return round2(cuota);
}

/** Fecha de cargo (YYYY-MM-DD) de un período a partir del día de vencimiento. */
function fechaDelPeriodo(periodo: string, dia: number): string {
  const d = Math.min(Math.max(Number(dia) || 1, 1), 28);
  return `${periodo}-${String(d).padStart(2, '0')}`;
}

/** TIN anual (%) vigente en un período dado (tramos variables) (FASE 2.4). */
export function tasaEnPeriodo(prestamo: Prestamo, periodo: string): number {
  const tramos = (prestamo.tramosTipo || [])
    .slice()
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  let tasa = Number(prestamo.tasaInteresAnual) || 0;
  tramos.forEach((t) => {
    if (t.fechaInicio <= periodo) tasa = Number(t.tasaInteresAnual) || 0;
  });
  return tasa;
}

function prepagosDelPeriodo(
  prestamo: Prestamo,
  periodo: string
): { importe: number; reduceCuota: boolean } {
  const lista = (prestamo.amortizaciones || []).filter((a) => a.periodo === periodo);
  return {
    importe: round2(lista.reduce((acc, a) => acc + (Number(a.importe) || 0), 0)),
    reduceCuota: lista.some((a) => a.modalidad === 'REDUCE_CUOTA'),
  };
}

/**
 * Tabla de amortización completa (simulación mes a mes). Soporta:
 *  - carencia inicial TOTAL (no se paga; intereses capitalizados) o PARCIAL
 *    (sólo se pagan intereses);
 *  - tipo variable por tramos (la cuota se recalcula en cada cambio de TIN,
 *    manteniendo el plazo restante, como una revisión de hipoteca);
 *  - amortizaciones anticipadas que reducen cuota (recálculo) o plazo (se
 *    mantiene la cuota y el préstamo vence antes).
 * La última cuota se ajusta para dejar el saldo exactamente a cero.
 */
export function generarTablaAmortizacion(prestamo: Prestamo): CuotaAmortizacion[] {
  const capitalInicial = Number(prestamo.capitalInicial) || 0;
  const n = Math.round(Number(prestamo.plazoMeses) || 0);
  if (capitalInicial <= 0 || n <= 0) return [];

  const carencia = Math.min(Math.max(Number(prestamo.carenciaMeses) || 0, 0), n - 1);
  const carenciaTotal = (prestamo.tipoCarencia || 'TOTAL') === 'TOTAL';
  const filas: CuotaAmortizacion[] = [];
  let saldo = capitalInicial;
  let cuotaActual = 0;
  let tasaPrevia = NaN;

  for (let m = 0; m < n; m += 1) {
    const periodo = sumarMeses(prestamo.fechaInicio, m);
    const tasaAnual = tasaEnPeriodo(prestamo, periodo);
    const i = tasaMensual(tasaAnual);
    const enCarencia = m < carencia;
    const saldoInicial = round2(saldo);

    // 1) Amortización anticipada del mes (reduce el principal antes de intereses).
    const prepago = prepagosDelPeriodo(prestamo, periodo);
    if (prepago.importe > 0) {
      saldo = round2(Math.max(saldo - prepago.importe, 0));
    }

    // 2) Intereses del mes sobre el saldo vivo.
    const intereses = round2(saldo * i);
    let capital = 0;
    let cuota = 0;

    if (saldo <= 0.005) {
      // Prepago que cancela toda la deuda: fila final sin nada que pagar.
      filas.push({
        numero: m + 1,
        periodo,
        fecha: fechaDelPeriodo(periodo, prestamo.diaVencimiento),
        cuota: 0,
        capital: 0,
        intereses: 0,
        amortizacionAdicional: prepago.importe,
        enCarencia,
        saldoInicial,
        saldoFinal: 0,
      });
      break;
    }

    if (enCarencia && carenciaTotal) {
      // Carencia total: no hay pago; los intereses se capitalizan.
      cuota = 0;
      capital = 0;
      saldo = round2(saldo + intereses);
    } else if (enCarencia) {
      // Carencia parcial: se pagan sólo los intereses.
      cuota = intereses;
      capital = 0;
    } else {
      // 3) ¿Hay que (re)calcular la cuota constante?
      const primerPeriodoNormal = m === carencia;
      const cambioDeTipo = !Number.isNaN(tasaPrevia) && tasaAnual !== tasaPrevia;
      if (cuotaActual === 0 || primerPeriodoNormal || cambioDeTipo || prepago.reduceCuota) {
        const cuotasRestantes = n - m;
        cuotaActual = calcularCuotaConstante(saldo, tasaAnual, cuotasRestantes);
      }
      tasaPrevia = tasaAnual;

      // Cierre: cuando la cuota ya cubre el saldo (o es el último mes del
      // calendario), se ajusta el recibo para dejar el saldo exactamente a cero
      // (absorbe errores de céntimos por cambios de tipo o carencia).
      if (m === n - 1 || cuotaActual - intereses >= saldo - 0.005) {
        capital = round2(saldo);
        cuota = round2(capital + intereses);
        saldo = 0;
      } else {
        capital = round2(cuotaActual - intereses);
        cuota = cuotaActual;
        saldo = round2(saldo - capital);
      }
    }

    if (!enCarencia) tasaPrevia = tasaAnual;

    filas.push({
      numero: m + 1,
      periodo,
      fecha: fechaDelPeriodo(periodo, prestamo.diaVencimiento),
      cuota,
      capital,
      intereses,
      amortizacionAdicional: prepago.importe,
      enCarencia,
      saldoInicial,
      saldoFinal: saldo,
    });

    if (!enCarencia && saldo <= 0.005) break; // REDUCE_PLAZO: vence antes.
  }

  return filas;
}

/** Desglose de una cuota concreta por período YYYY-MM (null si no pertenece al cuadro). */
export function cuotaDelPeriodo(
  prestamo: Prestamo,
  periodo: string
): {
  capital: number;
  intereses: number;
  cuota: number;
  numero: number;
  saldoFinal: number;
  amortizacionAdicional: number;
} | null {
  const fila = generarTablaAmortizacion(prestamo).find((f) => f.periodo === periodo);
  if (!fila) return null;
  return {
    capital: round2(fila.capital + fila.amortizacionAdicional),
    intereses: fila.intereses,
    // El recibo del mes incluye también la amortización anticipada (salida de caja).
    cuota: round2(fila.cuota + fila.amortizacionAdicional),
    numero: fila.numero,
    saldoFinal: fila.saldoFinal,
    amortizacionAdicional: fila.amortizacionAdicional,
  };
}

/**
 * Resumen del préstamo. `periodoCorte` (YYYY-MM) marca hasta qué cuota se
 * considera vencida para el saldo vivo teórico; por defecto el mes en curso.
 */
export function resumenPrestamo(
  prestamo: Prestamo,
  periodoCorte?: string
): ResumenPrestamo {
  const tabla = generarTablaAmortizacion(prestamo);
  const corte =
    periodoCorte ||
    (() => {
      const h = new Date();
      return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
    })();

  const totalCapital = round2(
    tabla.reduce((a, f) => a + f.capital + f.amortizacionAdicional, 0)
  );
  const totalIntereses = round2(tabla.reduce((a, f) => a + f.intereses, 0));
  const vencidas = tabla.filter((f) => f.periodo <= corte);
  const capitalAmortizado = round2(
    vencidas.reduce((a, f) => a + f.capital + f.amortizacionAdicional, 0)
  );
  const interesesPagados = round2(vencidas.reduce((a, f) => a + f.intereses, 0));

  const capitalInicial = Number(prestamo.capitalInicial) || 0;
  const finalizado = tabla.length > 0 && corte >= tabla[tabla.length - 1].periodo;

  // Con carencia, la primera cuota ordinaria (no la de carencia) es la referencia.
  const cuotaReferencia =
    tabla.find((f) => !f.enCarencia && f.capital > 0)?.cuota ||
    tabla.find((f) => f.cuota > 0)?.cuota ||
    (tabla.length ? tabla[0].cuota : 0);

  return {
    cuotaConstante: cuotaReferencia,
    numeroCuotas: tabla.length,
    totalPagado: round2(totalCapital + totalIntereses),
    totalIntereses,
    totalCapital,
    cuotasVencidas: vencidas.length,
    capitalAmortizado: finalizado ? totalCapital : capitalAmortizado,
    interesesPagados: finalizado ? totalIntereses : interesesPagados,
    importePagado: finalizado
      ? round2(totalCapital + totalIntereses)
      : round2(capitalAmortizado + interesesPagados),
    saldoPendiente: round2(Math.max(capitalInicial - (finalizado ? totalCapital : capitalAmortizado), 0)),
    porcentajeAmortizado:
      capitalInicial > 0
        ? round2(((finalizado ? totalCapital : capitalAmortizado) / capitalInicial) * 100)
        : 0,
    finalizado,
  };
}

export function nuevoPrestamoId(inmuebleId: string): string {
  const seg = (inmuebleId || 'inm').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `prest_${seg}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

export function etiquetaPeriodoLarga(periodo: string): string {
  return etiquetaMesAnio(periodo);
}
