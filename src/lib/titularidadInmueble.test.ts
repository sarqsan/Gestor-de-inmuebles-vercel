/**
 * D2 (ORDEN 3 §2/§6) — Titularidad jurídica del inmueble (puro, sin Firebase).
 */
import { describe, expect, it } from 'vitest';
import type { Inmueble } from '../types';
import {
  detectarCambioTitularidad,
  esSecundarioDelInmueble,
  esTitularDelInmueble,
  validarCoherenciaTitularidad,
} from './titularidadInmueble';

const BASE: Inmueble = {
  id: 'inm_A',
  direccion: 'Calle A 1',
  ciudad: 'Madrid',
  precio: 900,
  estado: 'disponible',
  habitaciones: 2,
  banos: 1,
  propietarioId: 'prop_A',
  propietarioPrincipalId: 'prop_A',
} as Inmueble;

describe('detectarCambioTitularidad', () => {
  it('sin cambios → cambio=false (edición ordinaria no se audita)', () => {
    const r = detectarCambioTitularidad(BASE, { ...BASE, precio: 950 });
    expect(r.cambio).toBe(false);
    expect(r.campos).toEqual([]);
  });
  it('detecta cambio del canónico', () => {
    const r = detectarCambioTitularidad(BASE, { ...BASE, propietarioId: 'prop_B' });
    expect(r.cambio).toBe(true);
    expect(r.campos).toEqual(['propietarioId']);
    expect(r.antes.propietarioId).toBe('prop_A');
    expect(r.despues.propietarioId).toBe('prop_B');
  });
  it('detecta alta/baja del secundario', () => {
    const alta = detectarCambioTitularidad(BASE, { ...BASE, propietarioSecundarioId: 'prop_S' });
    expect(alta.cambio).toBe(true);
    expect(alta.campos).toEqual(['propietarioSecundarioId']);
    const baja = detectarCambioTitularidad(
      { ...BASE, propietarioSecundarioId: 'prop_S' },
      { ...BASE, propietarioSecundarioId: undefined }
    );
    expect(baja.cambio).toBe(true);
  });
  it('normaliza undefined/"" (no audita ruido)', () => {
    const r = detectarCambioTitularidad(
      { ...BASE, propietarioSecundarioId: undefined },
      { ...BASE, propietarioSecundarioId: '' }
    );
    expect(r.cambio).toBe(false);
  });
});

describe('validarCoherenciaTitularidad', () => {
  it('sin secundario → válido', () => {
    expect(validarCoherenciaTitularidad({ propietarioId: 'prop_A', propietarioPrincipalId: 'prop_A' })).toEqual([]);
  });
  it('secundario distinto → válido', () => {
    expect(
      validarCoherenciaTitularidad({
        propietarioId: 'prop_A',
        propietarioPrincipalId: 'prop_A',
        propietarioSecundarioId: 'prop_S',
      })
    ).toEqual([]);
  });
  it('secundario == principal → error', () => {
    const e = validarCoherenciaTitularidad({
      propietarioId: 'prop_A',
      propietarioPrincipalId: 'prop_A',
      propietarioSecundarioId: 'prop_A',
    });
    expect(e.length).toBeGreaterThanOrEqual(1);
    expect(e.join(' ')).toMatch(/principal/);
  });
  it('secundario == económico → error', () => {
    const e = validarCoherenciaTitularidad({
      propietarioId: 'prop_A',
      propietarioPrincipalId: 'prop_P',
      propietarioSecundarioId: 'prop_A',
    });
    expect(e.length).toBeGreaterThanOrEqual(1);
    expect(e.join(' ')).toMatch(/económico/);
  });
});

describe('predicados de titularidad (UI)', () => {
  const CON_SECUNDARIO = { ...BASE, propietarioSecundarioId: 'prop_S' };
  it('titular: económico o principal; secundario no es titular', () => {
    expect(esTitularDelInmueble(BASE, 'prop_A')).toBe(true);
    expect(esTitularDelInmueble({ ...BASE, propietarioId: 'prop_X', propietarioPrincipalId: 'prop_A' }, 'prop_A')).toBe(true);
    expect(esTitularDelInmueble(CON_SECUNDARIO, 'prop_S')).toBe(false);
    expect(esTitularDelInmueble(BASE, 'prop_Z')).toBe(false);
    expect(esTitularDelInmueble(BASE, undefined)).toBe(false);
  });
  it('secundario: solo informativo', () => {
    expect(esSecundarioDelInmueble(CON_SECUNDARIO, 'prop_S')).toBe(true);
    expect(esSecundarioDelInmueble(CON_SECUNDARIO, 'prop_A')).toBe(false);
    expect(esSecundarioDelInmueble(BASE, 'prop_S')).toBe(false);
  });
});
