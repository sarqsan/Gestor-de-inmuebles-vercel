/**
 * BLOQUE 3 · 3.5 — COMPATIBILIDAD DE IMPORTACIÓN/EXPORTACIÓN
 * ==========================================================
 * Los ficheros y documentos ANTERIORES al Bloque 2 no traen los campos nuevos
 * (`estadoPatrimonial`, `estadoExplotacion`, `bajaPatrimonial`, `fechaVenta`,
 * `titularesIds`) ni la colección `titularidades`.
 *
 * Garantías exigidas:
 *   1. Un inmueble heredado se comporta EXACTAMENTE igual que antes
 *      (ACTIVO en el eje patrimonial, explotación derivada de `estado`).
 *   2. Los campos nuevos son OPCIONALES: no se exigen en ninguna lectura.
 *   3. La migración es ADITIVA: no elimina ninguna clave heredada.
 *   4. Round-trip JSON: exportar y volver a importar no pierde información.
 */

import { describe, expect, it } from 'vitest';
import {
  estadoExplotacionDe,
  estadoPatrimonialDe,
  esCarteraActiva,
  esHistorico,
  filtrarCarteraActiva,
  filtrarHistorico,
} from '../src/utils/cicloPatrimonialEngine';
import { planificarMigracion } from '../src/lib/migracionTitularidades';
import type { Inmueble } from '../src/types';

/** Inmueble tal y como existía ANTES del Bloque 2 (sólo campos heredados). */
function inmuebleHeredado(parcial: Partial<Inmueble> = {}): Inmueble {
  const base = {
    id: 'inm-1',
    alias: 'Piso Centro',
    direccion: 'Calle Mayor 1',
    ciudad: 'Madrid',
    codigoPostal: '28013',
    estado: 'alquilado',
    propietarioId: 'prop-A',
    propietarioPrincipalId: 'prop-A',
    propietarioSecundarioId: 'prop-B',
    precio: 850,
    superficie: 74,
  };
  return { ...base, ...parcial } as unknown as Inmueble;
}

describe('3.5 · Compatibilidad import/export con documentos heredados', () => {
  it('un inmueble heredado es ACTIVO en el eje patrimonial (cero cambio de comportamiento)', () => {
    expect(estadoPatrimonialDe(inmuebleHeredado())).toBe('ACTIVO');
    expect(esCarteraActiva(inmuebleHeredado())).toBe(true);
    expect(esHistorico(inmuebleHeredado())).toBe(false);
  });

  it('la explotación se DERIVA del campo heredado `estado`', () => {
    expect(estadoExplotacionDe(inmuebleHeredado({ estado: 'alquilado' }))).toBe('ALQUILADO');
    expect(estadoExplotacionDe(inmuebleHeredado({ estado: 'disponible' }))).toBe('DISPONIBLE');
  });

  it('los inmuebles heredados entran en la cartera activa y NO en el histórico', () => {
    const lista = [
      inmuebleHeredado({ id: 'a' }),
      inmuebleHeredado({ id: 'b', estado: 'disponible' }),
    ];
    expect(filtrarCarteraActiva(lista)).toHaveLength(2);
    expect(filtrarHistorico(lista)).toHaveLength(0);
  });

  it('round-trip JSON de un inmueble heredado no pierde ninguna clave', () => {
    const original = inmuebleHeredado();
    const json = JSON.stringify(original);
    const recuperado = JSON.parse(json) as Inmueble;

    for (const clave of Object.keys(original)) {
      expect(recuperado).toHaveProperty(clave);
    }
    expect(recuperado.id).toBe('inm-1');
    expect(estadoPatrimonialDe(recuperado)).toBe('ACTIVO');
  });

  it('round-trip JSON de un inmueble CON los campos nuevos conserva la baja patrimonial', () => {
    const conBaja = {
      ...inmuebleHeredado(),
      estadoPatrimonial: 'VENDIDO' as const,
      bajaPatrimonial: {
        tipo: 'VENTA' as const,
        fecha: '2026-05-01T00:00:00.000Z',
        motivo: 'Venta a tercero',
      },
      fechaVenta: '2026-05-01T00:00:00.000Z',
      titularesIds: ['prop-A', 'prop-B'],
    };
    const recuperado = JSON.parse(JSON.stringify(conBaja)) as Inmueble;
    expect(estadoPatrimonialDe(recuperado)).toBe('VENDIDO');
    expect(esHistorico(recuperado)).toBe(true);
    expect(esCarteraActiva(recuperado)).toBe(false);
    expect(recuperado.titularesIds).toEqual(['prop-A', 'prop-B']);
  });

  it('la migración sobre un documento heredado es ADITIVA: no borra ninguna clave', () => {
    const original = inmuebleHeredado();
    const clavesAntes = Object.keys(original).sort();

    const plan = planificarMigracion([{ inmueble: original, config: null }], {
      migracionId: 'mig-compat',
    });

    expect(plan.inmueblesAfectados).toBe(1);
    // El inmueble NO se toca: sólo se crean titularidades.
    const clavesDespues = Object.keys(original).sort();
    expect(clavesDespues).toEqual(clavesAntes);

    expect(plan.titularidadesGeneradas).toBeGreaterThanOrEqual(1);
    expect(plan.propuestas.length).toBeGreaterThanOrEqual(1);
  });

  it('un documento heredado sin titular conocido se marca como pendiente, no se inventa', () => {
    const sinTitular = {
      id: 'inm-x',
      estado: 'disponible',
    } as unknown as Inmueble;

    const plan = planificarMigracion([{ inmueble: sinTitular, config: null }], {
      migracionId: 'mig-sin-titular',
    });

    expect(plan.inmueblesSinTitular).toContain('inm-x');
  });

  it('un JSON con campos desconocidos no rompe la lectura (tolerancia a versiones futuras)', () => {
    const raro = {
      ...inmuebleHeredado(),
      campoDelFuturo: { a: 1 },
      otroCampoNuevo: ['x'],
    } as unknown as Inmueble;

    expect(estadoPatrimonialDe(raro)).toBe('ACTIVO');
    expect(esCarteraActiva(raro)).toBe(true);
    expect(estadoExplotacionDe(raro)).toBe('ALQUILADO');
  });
});
