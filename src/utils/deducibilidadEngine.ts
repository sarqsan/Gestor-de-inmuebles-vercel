/**
 * BLOQUE 5 — OPERACIONES → FISCALIDAD · DEDUCIBILIDAD (fuente única).
 * ---------------------------------------------------------------------------
 * Módulo puro que decide si un `Gasto` es deducible y expone DE DÓNDE procede
 * esa decisión (`origenDecisionDeducibilidad`).
 *
 * Por qué existe un módulo propio (cierre de D1):
 *   Antes había TRES decisiones distintas sobre el mismo dato:
 *     · `fiscalEngine.esGastoDeducible` (prioridad `esDeducible`→`tipoDeducible`
 *       →`deducible`→categoría) — la que usan informes fiscales y expediente.
 *     · `gastosEngine.calcularTotalesGastos` (`if (g.deducible)`) — un gasto sin
 *       el campo marcado quedaba NO deducible aunque su categoría sí lo fuese.
 *     · `rentabilidadEngine` (`g.deducible !== false`) — el mismo gasto quedaba
 *       DEDUCIBLE aunque su categoría no lo fuese (financiación/OTRO).
 *   Este módulo concentra la decisión; los tres consumidores la reutilizan.
 *
 * Reglas (NO inventan norma fiscal: reutilizan la decisión ya persistida y, solo
 * si falta, infieren por la lista cerrada de categorías que sí computan):
 *   1. `esDeducible` booleano  → alias fiscal explícito.
 *   2. `tipoDeducible`         → decisión fiscal categorizada.
 *   3. `deducible` booleano    → campo operativo (GastoModal, crearGasto,
 *                                recurrentes, puentes de operaciones).
 *   4. Categoría (lista cerrada) → inferencia documentada.
 *
 * `clasificarGastosDeducibilidad` ignora los gastos `ANULADO` (no computan),
 * igual que el resto de agregados fiscales del ERP.
 */

import type { CategoriaGasto, Gasto } from '../types';

/** Categorías que el ERP infiere como deducibles cuando no hay decisión explícita. */
export const CATEGORIAS_DEDUCIBLES: readonly CategoriaGasto[] = [
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
  'IBI',
  'SEGURO_HOGAR',
  'ADMINISTRACION',
  'OTRO_EXPLOTACION',
];

/** De dónde sale la clasificación de un gasto (trazabilidad de la decisión). */
export type OrigenDecisionDeducibilidad =
  | 'ES_DEDUCIBLE' // alias fiscal explícito
  | 'TIPO_DEDUCIBLE' // decisión fiscal categorizada
  | 'DEDUCIBLE' // campo operativo
  | 'CATEGORIA' // inferencia documentada por categoría
  | 'NO_INFERIBLE'; // sin decisión y categoría fuera de la lista cerrada

/**
 * Decide la deducibilidad de un gasto y devuelve también el origen de la
 * decisión, sin duplicar la lógica (una sola función decide; el resto consume).
 */
export function analizarDeducibilidad(gasto: Gasto): {
  deducible: boolean;
  origenDecision: OrigenDecisionDeducibilidad;
} {
  if (typeof gasto.esDeducible === 'boolean') {
    return { deducible: gasto.esDeducible, origenDecision: 'ES_DEDUCIBLE' };
  }
  if (gasto.tipoDeducible) {
    return {
      deducible: gasto.tipoDeducible === 'DEDUCIBLE',
      origenDecision: 'TIPO_DEDUCIBLE',
    };
  }
  if (typeof gasto.deducible === 'boolean') {
    return { deducible: gasto.deducible, origenDecision: 'DEDUCIBLE' };
  }
  const porCategoria = CATEGORIAS_DEDUCIBLES.includes(gasto.categoria);
  return {
    deducible: porCategoria,
    origenDecision: porCategoria ? 'CATEGORIA' : 'NO_INFERIBLE',
  };
}

/**
 * Determina si un gasto es deducible (fuente única de verdad del ERP).
 *
 * No inventa norma fiscal: reutiliza la decisión ya persistida y, solo si falta,
 * infiere por la lista cerrada. Un cambio de clasificación (marcar/desmarcar
 * `deducible`, o registrar `esDeducible`/`tipoDeducible`) se refleja de inmediato
 * en TODOS los consumidores porque ninguno recalcula por su cuenta.
 */
export function esGastoDeducible(gasto: Gasto): boolean {
  return analizarDeducibilidad(gasto).deducible;
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
