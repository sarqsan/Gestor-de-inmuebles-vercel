import { describe, expect, it } from 'vitest';
import {
  diagnosticarReparto,
  repartoAplicable,
  type RepartoBinarioLike,
} from './repartoNTitulares';
import { crearTitularidad } from './titularidadesEngine';
import type { Titularidad } from '../types';

/** Construye N titularidades vigentes sobre el inmueble `inm-1`. */
function vigentes(ids: string[], porcentajes?: Array<number | null>): Titularidad[] {
  return ids.map((id, i) => {
    const t = crearTitularidad({
      inmuebleId: 'inm-1',
      propietarioId: id,
      porcentaje: porcentajes ? porcentajes[i] : null,
      esPrincipal: i === 0,
      rol: i === 0 ? 'PROPIETARIO' : 'COTITULAR',
    });
    // `crearTitularidad` ya marca PENDIENTE cuando el porcentaje es nulo;
    // aquí sólo forzamos explícitamente el caso "hay porcentaje".
    if (porcentajes && porcentajes[i] != null) {
      return { ...t, porcentajePendiente: false } as Titularidad;
    }
    return t;
  });
}

describe('3.4 · Reparto de liquidación con N titulares (sin repartos falsos)', () => {
  it('un solo titular ⇒ 100 % para él, sin reparto binario', () => {
    const d = diagnosticarReparto(vigentes(['A'], [100]), 'inm-1');
    expect(d.tipo).toBe('UNICO_TITULAR');
    expect(d.reparto).toEqual({ A: 100 });
    expect(repartoAplicable(d)).toBe(true);
  });

  it('sin titularidad vigente ⇒ NO se afirma ningún reparto', () => {
    const d = diagnosticarReparto([], 'inm-1');
    expect(d.tipo).toBe('SIN_TITULARIDAD');
    expect(d.reparto).toBeNull();
    expect(repartoAplicable(d)).toBe(false);
  });

  it('2 titulares con reparto binario que encaja ⇒ se aplica', () => {
    const reparto: RepartoBinarioLike = {
      segundoPropietarioId: 'B',
      porcentajeSegundo: 30,
    };
    const d = diagnosticarReparto(vigentes(['A', 'B']), 'inm-1', reparto);
    expect(d.tipo).toBe('REPARTO_BINARIO_OK');
    expect(d.reparto).toEqual({ A: 70, B: 30 });
    expect(repartoAplicable(d)).toBe(true);
  });

  it('2 titulares SIN reparto válido ⇒ PENDIENTE, nunca 50/50 inventado', () => {
    const d = diagnosticarReparto(vigentes(['A', 'B']), 'inm-1', null);
    expect(d.tipo).toBe('PENDIENTE_SIN_REPARTO');
    expect(d.reparto).toBeNull();
    expect(repartoAplicable(d)).toBe(false);
    expect(d.mensaje).toContain('no se inventa');
  });

  it('2 titulares con reparto que apunta a un tercero ⇒ no se usa ese reparto', () => {
    const d = diagnosticarReparto(vigentes(['A', 'B']), 'inm-1', {
      segundoPropietarioId: 'ZZZ',
      porcentajeSegundo: 40,
    });
    expect(d.tipo).toBe('PENDIENTE_SIN_REPARTO');
    expect(repartoAplicable(d)).toBe(false);
  });

  it('3 titulares SIN porcentajes ⇒ NO REPRESENTABLE y no se reparte (33,33 % NO se inventa)', () => {
    const d = diagnosticarReparto(vigentes(['A', 'B', 'C']), 'inm-1', {
      segundoPropietarioId: 'B',
      porcentajeSegundo: 30,
    });
    expect(d.tipo).toBe('NO_REPRESENTABLE');
    expect(d.reparto).toBeNull();
    expect(repartoAplicable(d)).toBe(false);
    expect(d.mensaje).toContain('NO se reparte a partes iguales');
  });

  it('3 titulares CON porcentajes reales que suman 100 ⇒ se usa el reparto real de la titularidad', () => {
    const d = diagnosticarReparto(vigentes(['A', 'B', 'C'], [50, 30, 20]), 'inm-1');
    expect(d.tipo).toBe('REPARTO_BINARIO_NO_ENCAJA');
    expect(d.reparto).toEqual({ A: 50, B: 30, C: 20 });
    expect(repartoAplicable(d)).toBe(true);
  });

  it('4 titulares con porcentajes que NO suman 100 ⇒ no se ajusta automáticamente', () => {
    const d = diagnosticarReparto(vigentes(['A', 'B', 'C', 'D'], [40, 30, 20, 5]), 'inm-1');
    expect(d.tipo).toBe('NO_REPRESENTABLE');
    expect(d.reparto).toBeNull();
    expect(repartoAplicable(d)).toBe(false);
  });

  it('2 titulares con porcentajes propios que suman 100 ⇒ se usan aunque falte el reparto binario', () => {
    const d = diagnosticarReparto(vigentes(['A', 'B'], [70, 30]), 'inm-1');
    expect(d.tipo).toBe('REPARTO_BINARIO_NO_ENCAJA');
    expect(d.reparto).toEqual({ A: 70, B: 30 });
  });

  it('2 titulares con porcentajes que suman distinto de 100 ⇒ SUMA_INCORRECTA, sin ajuste', () => {
    const d = diagnosticarReparto(vigentes(['A', 'B'], [70, 20]), 'inm-1');
    expect(d.tipo).toBe('SUMA_INCORRECTA');
    expect(d.reparto).toBeNull();
    expect(repartoAplicable(d)).toBe(false);
  });

  it('sólo cuenta las titularidades VIGENTES del inmueble indicado', () => {
    const cerrada = { ...crearTitularidad({ inmuebleId: 'inm-1', propietarioId: 'C' }) };
    const lista = [
      ...vigentes(['A', 'B'], [60, 40]),
      { ...cerrada, estado: 'BAJA' as const, fechaHasta: new Date().toISOString() },
    ];
    const d = diagnosticarReparto(lista, 'inm-1');
    expect(d.titulares).toBe(2);
    expect(d.reparto).toEqual({ A: 60, B: 40 });
  });

  it('ignora titularidades de otros inmuebles', () => {
    const otro = crearTitularidad({ inmuebleId: 'inm-2', propietarioId: 'Z', porcentaje: 100 });
    const d = diagnosticarReparto([...vigentes(['A'], [100]), otro], 'inm-1');
    expect(d.tipo).toBe('UNICO_TITULAR');
    expect(d.reparto).toEqual({ A: 100 });
  });

  it('porcentaje del segundo fuera de rango ⇒ no se considera válido', () => {
    const d = diagnosticarReparto(vigentes(['A', 'B']), 'inm-1', {
      segundoPropietarioId: 'B',
      porcentajeSegundo: 150,
    });
    expect(d.tipo).toBe('PENDIENTE_SIN_REPARTO');
    expect(repartoAplicable(d)).toBe(false);
  });
});
