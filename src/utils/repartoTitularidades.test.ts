/**
 * Reparto entre N titulares: céntimos exactos y sin invenciones.
 */
import { describe, expect, it } from 'vitest';
import { calcularReparto } from './repartoTitularidades';
import { construirTitularidad } from './titularidadesEngine';
import type { Titularidad } from '../types';

function tit(inmuebleId: string, propietarioId: string, porcentaje: number | null): Titularidad {
  return construirTitularidad({ inmuebleId, propietarioId, porcentaje });
}

describe('reparto con N titulares', () => {
  it('3 titulares 50/30/20 sobre 1000 € ⇒ 500/300/200', () => {
    const r = calcularReparto(1000, [tit('A', 'p1', 50), tit('A', 'p2', 30), tit('A', 'p3', 20)], {
      propietarioPrincipalId: 'p1',
    });
    expect(r.ok).toBe(true);
    expect(r.reparto?.origen).toBe('TITULARIDADES');
    expect(r.reparto?.detalle.map((p) => p.importe)).toEqual([500, 300, 200]);
    expect(r.reparto?.importePrincipal).toBe(500);
    expect(r.reparto?.partes.map((p) => p.propietarioId)).toEqual(['p2', 'p3']);
  });

  it('4 titulares al 25 % ⇒ 250 € cada uno y suma exacta', () => {
    const r = calcularReparto(1000, [
      tit('A', 'p1', 25),
      tit('A', 'p2', 25),
      tit('A', 'p3', 25),
      tit('A', 'p4', 25),
    ], { propietarioPrincipalId: 'p1' });
    expect(r.ok).toBe(true);
    expect(r.reparto?.detalle.map((p) => p.importe)).toEqual([250, 250, 250, 250]);
  });

  it('reparte el residuo de céntimos por mayor resto sin descuadre', () => {
    const r = calcularReparto(100, [tit('A', 'p1', 33.33), tit('A', 'p2', 33.33), tit('A', 'p3', 33.34)], {
      propietarioPrincipalId: 'p1',
    });
    const suma = (r.reparto?.detalle || []).reduce((a, p) => a + p.importe, 0);
    expect(Math.abs(suma - 100) < 0.001).toBe(true);
  });

  it('3 titulares con porcentajes pendientes ⇒ BLOQUEA (no inventa)', () => {
    const r = calcularReparto(1000, [tit('A', 'p1', 50), tit('A', 'p2', null), tit('A', 'p3', null)], {
      propietarioPrincipalId: 'p1',
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/representable/);
  });

  it('2 titulares sin porcentaje ⇒ BLOQUEA (no asume 50/50)', () => {
    const r = calcularReparto(1000, [tit('A', 'p1', null), tit('A', 'p2', null)], {
      propietarioPrincipalId: 'p1',
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/50\/50/);
  });

  it('porcentajes que no suman 100 ⇒ BLOQUEA', () => {
    const r = calcularReparto(1000, [tit('A', 'p1', 70), tit('A', 'p2', 20)], {
      propietarioPrincipalId: 'p1',
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/suman 90/);
  });
});

describe('compatibilidad con el reparto binario anterior', () => {
  it('sin titularidades pero con repartoCopropiedad ⇒ REPARTO_BINARIO', () => {
    const r = calcularReparto(1000, [], {
      propietarioPrincipalId: 'p1',
      repartoBinario: { segundoPropietarioId: 'p2', porcentajeSegundo: 40, segundoPropietarioNombre: 'Segundo' },
    });
    expect(r.ok).toBe(true);
    expect(r.reparto?.origen).toBe('REPARTO_BINARIO');
    expect(r.reparto?.importePrincipal).toBe(600);
    expect(r.reparto?.partes[0]).toMatchObject({ propietarioId: 'p2', importe: 400, porcentaje: 40 });
  });

  it('sin titularidades y sin reparto configurado ⇒ SIN_REPARTO (todo al principal)', () => {
    const r = calcularReparto(1000, [], { propietarioPrincipalId: 'p1' });
    expect(r.ok).toBe(true);
    expect(r.reparto?.origen).toBe('SIN_REPARTO');
    expect(r.reparto?.importePrincipal).toBe(1000);
    expect(r.reparto?.partes).toHaveLength(0);
  });

  it('reparto binario fuera de rango ⇒ bloquea', () => {
    const r = calcularReparto(1000, [], {
      propietarioPrincipalId: 'p1',
      repartoBinario: { segundoPropietarioId: 'p2', porcentajeSegundo: 120 },
    });
    expect(r.ok).toBe(false);
  });

  it('importe 0 ⇒ sin reparto y sin error', () => {
    const r = calcularReparto(0, [tit('A', 'p1', 50), tit('A', 'p2', 50)], { propietarioPrincipalId: 'p1' });
    expect(r.ok).toBe(true);
    expect(r.reparto?.importePrincipal).toBe(0);
  });
});
