/**
 * BLOQUE 5 — DEDUCIBILIDAD (fuente única, cierre de D1).
 * ---------------------------------------------------------------------------
 * Prueba la regla única que consumen fiscalidad, gastos, rentabilidad,
 * expedientes e informes: prioridad de decisión, inferencia por categoría,
 * cambio de clasificación, gastos anulados y equivalencia con el re-export
 * histórico de `fiscalEngine`.
 */
import { describe, expect, it } from 'vitest';
import type { Gasto } from '../types';
import {
  analizarDeducibilidad,
  CATEGORIAS_DEDUCIBLES,
  clasificarGastosDeducibilidad,
  esGastoDeducible,
} from './deducibilidadEngine';
import { esGastoDeducible as esGastoDeducibleFiscal } from './fiscalEngine';
import { calcularTotalesGastos } from './gastosEngine';

function gasto(overrides: Partial<Gasto> = {}): Gasto {
  return {
    id: 'gas_1',
    inmuebleId: 'inm-1',
    propietarioId: 'prop-1',
    tipo: 'EXPLOTACION',
    categoria: 'REPARACION',
    concepto: 'Reparación ficticia',
    importe: 100,
    estado: 'PAGADO',
    fechaDevengo: '2026-02-01',
    periodoMesAnio: '2026-02',
    aCargoDe: 'arrendador',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('BLOQUE 5 · deducibilidad (una sola decisión para todos los consumidores)', () => {
  it('fiscalEngine reexporta exactamente la misma función (no hay segunda lógica)', () => {
    expect(esGastoDeducibleFiscal).toBe(esGastoDeducible);
  });

  it('prioridad de decisión: esDeducible → tipoDeducible → deducible → categoría', () => {
    expect(analizarDeducibilidad(gasto({ esDeducible: false, deducible: true })))
      .toEqual({ deducible: false, origenDecision: 'ES_DEDUCIBLE' });
    expect(analizarDeducibilidad(gasto({ tipoDeducible: 'DEDUCIBLE', deducible: false })))
      .toEqual({ deducible: true, origenDecision: 'TIPO_DEDUCIBLE' });
    expect(analizarDeducibilidad(gasto({ tipoDeducible: 'NO_DEDUCIBLE' })))
      .toEqual({ deducible: false, origenDecision: 'TIPO_DEDUCIBLE' });
    expect(analizarDeducibilidad(gasto({ categoria: 'OTRO', deducible: true })))
      .toEqual({ deducible: true, origenDecision: 'DEDUCIBLE' });
    expect(analizarDeducibilidad(gasto({ categoria: 'COMUNIDAD', deducible: undefined })))
      .toEqual({ deducible: true, origenDecision: 'CATEGORIA' });
  });

  it('la lista cerrada es exactamente la del contrato fiscal histórico', () => {
    expect([...CATEGORIAS_DEDUCIBLES]).toEqual([
      'MANTENIMIENTO', 'REPARACION', 'SUMINISTROS', 'SEGUROS', 'IMPUESTOS_TASAS', 'COMUNIDAD',
      'ELECTRODOMESTICOS', 'MOBILIARIO', 'REFORMAS', 'LIMPIEZA', 'GESTION', 'IBI',
      'SEGURO_HOGAR', 'ADMINISTRACION', 'OTRO_EXPLOTACION',
    ]);
  });

  it('categoría fuera de la lista y sin decisión: la deducibilidad NO se inventa', () => {
    for (const categoria of ['OTRO', 'CUOTA_HIPOTECARIA', 'INTERESES_PRESTAMO', 'OTRO_FINANCIACION'] as const) {
      const analisis = analizarDeducibilidad(gasto({ categoria, deducible: undefined }));
      expect(analisis.deducible).toBe(false);
      expect(analisis.origenDecision).toBe(categoria === 'OTRO' ? 'NO_INFERIBLE' : 'NO_INFERIBLE');
    }
  });

  it('cambio de clasificación: se refleja a la vez en todos los consumidores', () => {
    const base = gasto({ categoria: 'REPARACION', deducible: undefined });
    expect(esGastoDeducible(base)).toBe(true);
    expect(calcularTotalesGastos([base]).totalDeducible).toBe(100);
    const cambiado = gasto({ ...base, deducible: false });
    expect(esGastoDeducible(cambiado)).toBe(false);
    expect(calcularTotalesGastos([cambiado]).totalDeducible).toBe(0);
    const reexpresado = gasto({ ...base, deducible: undefined, esDeducible: true });
    expect(esGastoDeducible(reexpresado)).toBe(true);
  });

  it('los gastos ANULADO no computan en ninguna clasificación ni total', () => {
    const deducibleAnulado = gasto({ estado: 'ANULADO' });
    const noDeducibleAnulado = gasto({ id: 'gas_2', estado: 'ANULADO', categoria: 'OTRO', deducible: false });
    expect(clasificarGastosDeducibilidad([deducibleAnulado, noDeducibleAnulado])).toEqual({
      deducibles: [], noDeducibles: [], totalDeducible: 0, totalNoDeducible: 0,
    });
    // La decisión en sí no depende del estado (el estado decide si computa).
    expect(esGastoDeducible(deducibleAnulado)).toBe(true);
    expect(calcularTotalesGastos([deducibleAnulado]).totalDeducible).toBe(100);
  });

  it('clasificación con importes: separa deducibles y no deducibles sin perder ninguno', () => {
    const clasificacion = clasificarGastosDeducibilidad([
      gasto({ id: 'gas_a', importe: 100 }),
      gasto({ id: 'gas_b', importe: 40, categoria: 'OTRO_FINANCIACION', deducible: false }),
      gasto({ id: 'gas_c', importe: 10, estado: 'ANULADO' }),
    ]);
    expect(clasificacion.deducibles.map((g) => g.id)).toEqual(['gas_a']);
    expect(clasificacion.noDeducibles.map((g) => g.id)).toEqual(['gas_b']);
    expect(clasificacion.totalDeducible).toBe(100);
    expect(clasificacion.totalNoDeducible).toBe(40);
  });
});
