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
  cuota: number; // Capital + intereses del recibo
  capital: number; // Amortización de deuda del recibo
  intereses: number; // Intereses del recibo
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

/**
 * Tabla de amortización completa. La última cuota se ajusta para que el saldo
* final sea exactamente cero (redondeo de céntimos).
 */
export function generarTablaAmortizacion(prestamo: Prestamo): CuotaAmortizacion[] {
  const capitalInicial = Number(prestamo.capitalInicial) || 0;
  const n = Math.round(Number(prestamo.plazoMeses) || 0);
  if (capitalInicial <= 0 || n <= 0) return [];

  const i = tasaMensual(prestamo.tasaInteresAnual);
  const cuota = calcularCuotaConstante(capitalInicial, prestamo.tasaInteresAnual, n);
  const filas: CuotaAmortizacion[] = [];
  let saldo = capitalInicial;

  for (let k = 1; k <= n; k += 1) {
    const periodo = sumarMeses(prestamo.fechaInicio, k - 1);
    const intereses = round2(saldo * i);
    let capital: number;
    let pago: number;
    if (k === n) {
      // Última cuota: se ajusta para dejar saldo cero.
      capital = round2(saldo);
      pago = round2(capital + intereses);
    } else {
      capital = round2(cuota - intereses);
      pago = cuota;
    }
    const saldoInicial = round2(saldo);
    saldo = round2(saldo - capital);
    if (saldo < 0.005 && k === n) saldo = 0;
    filas.push({
      numero: k,
      periodo,
      fecha: fechaDelPeriodo(periodo, prestamo.diaVencimiento),
      cuota: pago,
      capital,
      intereses,
      saldoInicial,
      saldoFinal: saldo,
    });
  }
  return filas;
}

/** Desglose de una cuota concreta por período YYYY-MM (null si no pertenece al cuadro). */
export function cuotaDelPeriodo(
  prestamo: Prestamo,
  periodo: string
): { capital: number; intereses: number; cuota: number; numero: number; saldoFinal: number } | null {
  const fila = generarTablaAmortizacion(prestamo).find((f) => f.periodo === periodo);
  if (!fila) return null;
  return {
    capital: fila.capital,
    intereses: fila.intereses,
    cuota: fila.cuota,
    numero: fila.numero,
    saldoFinal: fila.saldoFinal,
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

  const totalCapital = round2(tabla.reduce((a, f) => a + f.capital, 0));
  const totalIntereses = round2(tabla.reduce((a, f) => a + f.intereses, 0));
  const vencidas = tabla.filter((f) => f.periodo <= corte);
  const capitalAmortizado = round2(vencidas.reduce((a, f) => a + f.capital, 0));
  const interesesPagados = round2(vencidas.reduce((a, f) => a + f.intereses, 0));

  const capitalInicial = Number(prestamo.capitalInicial) || 0;
  const finalizado = tabla.length > 0 && corte >= tabla[tabla.length - 1].periodo;

  return {
    cuotaConstante: tabla.length ? tabla[0].cuota : 0,
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
