/**
 * N TITULARES — motor puro de titularidades.
 */
import { describe, expect, it } from 'vitest';
import {
  cerrarTitularidadEnMemoria,
  construirTitularidad,
  esIdTitularidadValido,
  etiquetaPorcentaje,
  idTitularidad,
  numeroTitulares,
  partirIdTitularidad,
  porcentajeTitular,
  sePuedeCerrar,
  titularidadesHistoricas,
  titularidadesVigentes,
  validarPorcentajes,
} from './titularidadesEngine';
import type { Titularidad } from '../types';

function titularidad(parcial: Partial<Titularidad> & { inmuebleId: string; propietarioId: string }): Titularidad {
  return {
    id: idTitularidad(parcial.inmuebleId, parcial.propietarioId),
    porcentajeTitularidad: null,
    estado: 'VIGENTE',
    fechaInicio: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...parcial,
  };
}

describe('N titulares — identidad determinista', () => {
  it('la clave es {inmuebleId}__{propietarioId}', () => {
    expect(idTitularidad('inm-1', 'prop-1')).toBe('inm-1__prop-1');
  });

  it('valida y parte la clave', () => {
    expect(esIdTitularidadValido('inm-1__prop-1')).toBe(true);
    expect(esIdTitularidadValido('inm-1')).toBe(false);
    expect(esIdTitularidadValido('')).toBe(false);
    expect(partirIdTitularidad('inm-1__prop-1')).toEqual({ inmuebleId: 'inm-1', propietarioId: 'prop-1' });
    expect(partirIdTitularidad('roto')).toBeNull();
  });
});

describe('N titulares — vigentes e histórico', () => {
  const t1 = titularidad({ inmuebleId: 'A', propietarioId: 'p1', porcentajeTitularidad: 50 });
  const t2 = titularidad({ inmuebleId: 'A', propietarioId: 'p2', porcentajeTitularidad: 50 });
  const t3 = titularidad({ inmuebleId: 'A', propietarioId: 'p3', estado: 'CERRADA', fechaCierre: '2026-05-01T00:00:00.000Z' });
  const t4 = titularidad({ inmuebleId: 'B', propietarioId: 'p1' });

  it('cuenta sólo las vigentes del inmueble indicado', () => {
    expect(numeroTitulares([t1, t2, t3, t4], 'A')).toBe(2);
    expect(numeroTitulares([t1, t2, t3, t4], 'B')).toBe(1);
  });

  it('el histórico son las CERRADAS, nunca borradas', () => {
    expect(titularidadesVigentes([t1, t2, t3], 'A').map((t) => t.propietarioId)).toEqual(['p1', 'p2']);
    expect(titularidadesHistoricas([t1, t2, t3], 'A').map((t) => t.propietarioId)).toEqual(['p3']);
    expect(titularidadesHistoricas([t1, t2], 'A')).toHaveLength(0);
  });
});

describe('Porcentajes: NO se inventan', () => {
  it('sin titularidades ⇒ SIN_TITULARIDADES y no bloquea', () => {
    const d = validarPorcentajes([]);
    expect(d.codigo).toBe('SIN_TITULARIDADES');
    expect(d.bloquea).toBe(false);
  });

  it('3 titulares con 50/30/20 ⇒ OK y reparte exacto', () => {
    const d = validarPorcentajes([
      titularidad({ inmuebleId: 'A', propietarioId: 'p1', porcentajeTitularidad: 50 }),
      titularidad({ inmuebleId: 'A', propietarioId: 'p2', porcentajeTitularidad: 30 }),
      titularidad({ inmuebleId: 'A', propietarioId: 'p3', porcentajeTitularidad: 20 }),
    ]);
    expect(d.codigo).toBe('OK');
    expect(d.porcentajes).toEqual([
      { propietarioId: 'p1', porcentaje: 50 },
      { propietarioId: 'p2', porcentaje: 30 },
      { propietarioId: 'p3', porcentaje: 20 },
    ]);
  });

  it('suma distinta de 100 ⇒ SUMA_INCORRECTA y BLOQUEA', () => {
    const d = validarPorcentajes([
      titularidad({ inmuebleId: 'A', propietarioId: 'p1', porcentajeTitularidad: 60 }),
      titularidad({ inmuebleId: 'A', propietarioId: 'p2', porcentajeTitularidad: 30 }),
    ]);
    expect(d.codigo).toBe('SUMA_INCORRECTA');
    expect(d.bloquea).toBe(true);
  });

  it('2 titulares sin porcentaje ⇒ PENDIENTE_SIN_REPARTO (no asume 50/50)', () => {
    const d = validarPorcentajes([
      titularidad({ inmuebleId: 'A', propietarioId: 'p1' }),
      titularidad({ inmuebleId: 'A', propietarioId: 'p2' }),
    ]);
    expect(d.codigo).toBe('PENDIENTE_SIN_REPARTO');
    expect(d.bloquea).toBe(true);
    expect(d.mensaje).toMatch(/50\/50/);
  });

  it('3 titulares con 2 pendientes ⇒ NO_REPRESENTABLE y BLOQUEA', () => {
    const d = validarPorcentajes([
      titularidad({ inmuebleId: 'A', propietarioId: 'p1', porcentajeTitularidad: 100 }),
      titularidad({ inmuebleId: 'A', propietarioId: 'p2' }),
      titularidad({ inmuebleId: 'A', propietarioId: 'p3' }),
    ]);
    expect(d.codigo).toBe('NO_REPRESENTABLE');
    expect(d.bloquea).toBe(true);
  });

  it('un único pendiente se DERIVA del resto (no se inventa: se calcula)', () => {
    const d = validarPorcentajes([
      titularidad({ inmuebleId: 'A', propietarioId: 'p1', porcentajeTitularidad: 70 }),
      titularidad({ inmuebleId: 'A', propietarioId: 'p2', porcentajeTitularidad: 10 }),
      titularidad({ inmuebleId: 'A', propietarioId: 'p3' }),
    ]);
    expect(d.codigo).toBe('OK');
    expect(d.porcentajes.find((p) => p.propietarioId === 'p3')?.porcentaje).toBe(20);
  });

  it('un único titular pendiente ⇒ 100 % (sin suponer nada)', () => {
    const d = validarPorcentajes([titularidad({ inmuebleId: 'A', propietarioId: 'p1' })]);
    expect(d.codigo).toBe('OK');
    expect(d.porcentajes).toEqual([{ propietarioId: 'p1', porcentaje: 100 }]);
  });

  it('si lo declarado ya suma 100 y queda un pendiente ⇒ bloquea', () => {
    const d = validarPorcentajes([
      titularidad({ inmuebleId: 'A', propietarioId: 'p1', porcentajeTitularidad: 100 }),
      titularidad({ inmuebleId: 'A', propietarioId: 'p2' }),
    ]);
    expect(d.codigo).toBe('SUMA_INCORRECTA');
    expect(d.bloquea).toBe(true);
  });

  it('etiqueta: pendiente cuando no hay porcentaje', () => {
    expect(etiquetaPorcentaje(titularidad({ inmuebleId: 'A', propietarioId: 'p1' }))).toBe('Pendiente');
    expect(etiquetaPorcentaje(titularidad({ inmuebleId: 'A', propietarioId: 'p1', porcentajeTitularidad: 40 }))).toBe('40 %');
  });

  it('porcentajeTitular devuelve null si no es un número válido', () => {
    expect(porcentajeTitular(null)).toBeNull();
    expect(porcentajeTitular(titularidad({ inmuebleId: 'A', propietarioId: 'p1' }))).toBeNull();
  });
});

describe('Alta y cierre (fábricas puras)', () => {
  it('el alta queda VIGENTE y con porcentaje null si no se indica', () => {
    const t = construirTitularidad({ inmuebleId: 'A', propietarioId: 'p9', propietarioNombre: 'Nuevo' });
    expect(t.id).toBe('A__p9');
    expect(t.estado).toBe('VIGENTE');
    expect(t.porcentajeTitularidad).toBeNull();
    expect(t.propietarioNombre).toBe('Nuevo');
  });

  it('el cierre NUNCA borra: estado CERRADA + fecha + motivo + responsable', () => {
    const t = construirTitularidad({ inmuebleId: 'A', propietarioId: 'p9', porcentaje: 30 });
    const cerrada = cerrarTitularidadEnMemoria({
      titularidad: t,
      motivo: 'VENTA',
      detalle: 'Escritura 123',
      fechaCierre: '2026-06-01T00:00:00.000Z',
      actor: { id: 'u1', nombre: 'Admin' },
    });
    expect(cerrada.estado).toBe('CERRADA');
    expect(cerrada.fechaCierre).toBe('2026-06-01T00:00:00.000Z');
    expect(cerrada.motivoCierre).toBe('VENTA');
    expect(cerrada.detalleCierre).toBe('Escritura 123');
    expect(cerrada.cerradoPorNombre).toBe('Admin');
    // El documento original no se pierde: sigue siendo la misma titularidad.
    expect(cerrada.id).toBe(t.id);
    expect(cerrada.porcentajeTitularidad).toBe(30);
  });

  it('no se puede cerrar dos veces', () => {
    const t = construirTitularidad({ inmuebleId: 'A', propietarioId: 'p9' });
    const cerrada = cerrarTitularidadEnMemoria({ titularidad: t, motivo: 'OTRO' });
    expect(sePuedeCerrar(t)).toBe(true);
    expect(sePuedeCerrar(cerrada)).toBe(false);
    expect(sePuedeCerrar(null)).toBe(false);
  });
});
