/**
 * CICLO PATRIMONIAL: baja / vendido + histórico.
 * Ideas fuerza: BAJA/VENDIDO ≠ BORRADO; TITULARIDAD ACTUAL ≠ HISTORIAL;
 * el histórico patrimonial nunca se pierde.
 */
import { describe, expect, it } from 'vitest';
import {
  ESTADO_EXPLOTACION_LABEL,
  darDeBajaInmueble,
  estadoExplotacionDe,
  estadoPatrimonialDe,
  inmuebleDadoDeBaja,
  inmuebleOperable,
  motivoNoOperable,
  revertirBajaInmueble,
} from '../src/utils/cicloPatrimonialEngine';
import { claseCicloPatrimonial, avisoCicloPatrimonial, etiquetaNumeroTitulares, lineaReparto } from '../src/utils/fichaInmueblePresentacion';
import { puedePublicarse, motivoNoPublicable, etiquetaCicloPatrimonial } from '../src/utils/publicacionCicloPatrimonial';
import { construirTitularidad } from '../src/utils/titularidadesEngine';
import type { Inmueble } from '../src/types';

function inmueble(parcial: Partial<Inmueble> & { id: string }): Inmueble {
  return {
    direccion: 'Calle Test 1',
    ciudad: 'Valencia',
    precio: 700,
    estado: 'disponible',
    habitaciones: 2,
    banos: 1,
    superficie: 70,
    candidatosCount: 0,
    fianzaMeses: 1,
    ...parcial,
  } as Inmueble;
}

describe('estado patrimonial: sin campo ⇒ ACTIVO (compatibilidad)', () => {
  it('los inmuebles antiguos siguen activos', () => {
    expect(estadoPatrimonialDe(inmueble({ id: 'A' }))).toBe('ACTIVO');
    expect(estadoPatrimonialDe(null)).toBe('ACTIVO');
    expect(inmuebleDadoDeBaja(inmueble({ id: 'A' }))).toBe(false);
    expect(inmuebleOperable(inmueble({ id: 'A' }))).toBe(true);
  });

  it('VENDIDO y BAJA dejan de ser operables, pero siguen existiendo', () => {
    for (const estado of ['VENDIDO', 'BAJA'] as const) {
      const inm = inmueble({ id: 'A', estadoPatrimonial: estado });
      expect(inmuebleDadoDeBaja(inm)).toBe(true);
      expect(inmuebleOperable(inm)).toBe(false);
      expect(motivoNoOperable(inm)).toBeTruthy();
      expect(inm.id).toBe('A'); // el documento NO se borra
    }
  });

  it('sin inmueble hay motivo, con inmueble activo no', () => {
    expect(motivoNoOperable(null)).toBe('El inmueble no existe.');
    expect(motivoNoOperable(inmueble({ id: 'A' }))).toBeNull();
  });
});

describe('dar de baja: cambio de estado, NUNCA borrado', () => {
  it('la venta deja VENDIDO + fecha + motivo + trazabilidad', () => {
    const res = darDeBajaInmueble(inmueble({ id: 'A' }), {
      fecha: '2026-06-01T00:00:00.000Z',
      motivo: 'VENTA',
      detalle: 'Escritura 1234',
      actor: { id: 'u1', nombre: 'Admin' },
    });
    expect(res.ok).toBe(true);
    expect(res.parche?.estadoPatrimonial).toBe('VENDIDO');
    expect(res.parche?.estadoExplotacion).toBe('SIN_EXPLOTACION');
    expect(res.parche?.fechaVenta).toBe('2026-06-01T00:00:00.000Z');
    expect(res.parche?.bajaPatrimonial).toMatchObject({ motivo: 'VENTA', detalle: 'Escritura 1234', usuarioId: 'u1' });
    // El parche NO contiene ninguna instrucción de borrado.
    expect(JSON.stringify(res.parche)).not.toMatch(/delete|eliminar/);
  });

  it('una baja administrativa deja BAJA y no fechaVenta', () => {
    const res = darDeBajaInmueble(inmueble({ id: 'A' }), {
      fecha: '2026-06-01T00:00:00.000Z',
      motivo: 'BAJA_ADMINISTRATIVA',
    });
    expect(res.parche?.estadoPatrimonial).toBe('BAJA');
    expect(res.parche?.fechaVenta).toBeUndefined();
  });

  it('valida fecha y motivo', () => {
    expect(darDeBajaInmueble(inmueble({ id: 'A' }), { fecha: '', motivo: 'VENTA' }).ok).toBe(false);
    expect(darDeBajaInmueble(inmueble({ id: 'A' }), { fecha: '2026-01-01', motivo: undefined as never }).ok).toBe(false);
  });

  it('conserva la baja anterior en el histórico al encadenar bajas', () => {
    const primera = darDeBajaInmueble(inmueble({ id: 'A' }), { fecha: '2026-01-01', motivo: 'VENTA' });
    const conBaja = inmueble({ id: 'A', ...(primera.parche as Partial<Inmueble>) });
    const segunda = darDeBajaInmueble(conBaja, { fecha: '2026-08-01', motivo: 'BAJA_ADMINISTRATIVA' });
    expect((segunda.parche as { historialBajas?: unknown[] }).historialBajas).toHaveLength(1);
  });
});

describe('revertir la baja: el histórico NO se pierde', () => {
  it('vuelve a ACTIVO y guarda la baja en historialBajas', () => {
    const baja = darDeBajaInmueble(inmueble({ id: 'A' }), { fecha: '2026-01-01', motivo: 'VENTA' });
    const dadoDeBaja = inmueble({ id: 'A', ...(baja.parche as Partial<Inmueble>) });
    const reversa = revertirBajaInmueble(dadoDeBaja, { id: 'u2', nombre: 'Master' });
    expect(reversa.ok).toBe(true);
    expect(reversa.parche?.estadoPatrimonial).toBe('ACTIVO');
    expect((reversa.parche as { historialBajas?: unknown[] }).historialBajas).toHaveLength(1);
    expect(reversa.parche?.notasInternas).toContain('Baja revertida');
  });

  it('no se puede revertir lo que no estaba dado de baja', () => {
    expect(revertirBajaInmueble(inmueble({ id: 'A' })).ok).toBe(false);
  });
});

describe('publicación y presentación', () => {
  it('un inmueble vendido no puede publicarse', () => {
    const vendido = inmueble({ id: 'A', estadoPatrimonial: 'VENDIDO' });
    expect(puedePublicarse(vendido)).toBe(false);
    expect(motivoNoPublicable(vendido)).toMatch(/Vendido/);
    expect(puedePublicarse(inmueble({ id: 'A' }))).toBe(true);
    expect(motivoNoPublicable(inmueble({ id: 'A' }))).toBeNull();
  });

  it('fuera de explotación tampoco se publica', () => {
    const sinExplotacion = inmueble({ id: 'A', estadoExplotacion: 'SIN_EXPLOTACION' });
    expect(puedePublicarse(sinExplotacion)).toBe(false);
    expect(estadoExplotacionDe(sinExplotacion)).toBe('SIN_EXPLOTACION');
    expect(ESTADO_EXPLOTACION_LABEL.SIN_EXPLOTACION).toBe('Sin explotación');
  });

  it('etiquetas y avisos de ciclo', () => {
    const vendido = inmueble({ id: 'A', estadoPatrimonial: 'VENDIDO', bajaPatrimonial: { fecha: '2026-06-01', motivo: 'VENTA', registradaEn: '2026-06-01' } });
    expect(etiquetaCicloPatrimonial(vendido)).toBe('Vendido');
    expect(etiquetaCicloPatrimonial(inmueble({ id: 'A' }))).toBe('Activo');
    expect(avisoCicloPatrimonial(vendido)).toContain('histórico');
    expect(avisoCicloPatrimonial(inmueble({ id: 'A' }))).toBeNull();
    expect(claseCicloPatrimonial(vendido)).toContain('amber');
  });

  it('presentación de N titulares sin inventar porcentajes', () => {
    const t = [
      construirTitularidad({ inmuebleId: 'A', propietarioId: 'p1', propietarioNombre: 'Ana', porcentaje: 50 }),
      construirTitularidad({ inmuebleId: 'A', propietarioId: 'p2', propietarioNombre: 'Luis' }),
    ];
    expect(etiquetaNumeroTitulares(t, 'A')).toBe('2 titulares');
    expect(lineaReparto(t, 'A')).toBe('Ana 50 % · Luis Pendiente');
    expect(lineaReparto([], 'A')).toBe('Sin titularidades declaradas');
    expect(etiquetaNumeroTitulares([], 'A')).toBe('Sin titulares declarados');
  });
});
