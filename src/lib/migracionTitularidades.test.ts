/**
 * Migración a N titulares: PLANIFICADOR EN SECO.
 * No escribe nada; sólo propone. Por eso mismo debe ser idempotente y
 * conservador con los porcentajes.
 */
import { describe, expect, it } from 'vitest';
import { planificarMigracion, sustancialmenteIgual, titularesDeducidos } from './migracionTitularidades';
import { construirTitularidad } from '../utils/titularidadesEngine';
import type { Inmueble, Titularidad } from '../types';

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

describe('deducción de titulares desde el inmueble', () => {
  it('deduce propietarioId, principal y la ficha fiscal sin duplicar', () => {
    const deducidos = titularesDeducidos(
      inmueble({
        id: 'A',
        propietarioId: 'p1',
        propietarioPrincipalId: 'p1',
        datosFiscales: {
          propietarioPrincipal: { nombre: 'P1', nifDni: 'X', direccion: 'Y', propietarioId: 'p1' },
          tieneSegundoPropietario: true,
          segundoPropietario: { nombre: 'P2', nifDni: 'Z', direccion: 'Y', propietarioId: 'p2' },
        },
      }),
    );
    expect(deducidos.map((d) => d.propietarioId)).toEqual(['p1', 'p2']);
  });

  it('el segundo propietario sólo cuenta si la ficha lo marca', () => {
    const deducidos = titularesDeducidos(
      inmueble({
        id: 'A',
        propietarioId: 'p1',
        datosFiscales: {
          propietarioPrincipal: { nombre: 'P1', nifDni: 'X', direccion: 'Y', propietarioId: 'p1' },
          segundoPropietario: { nombre: 'P2', nifDni: 'Z', direccion: 'Y', propietarioId: 'p2' },
        },
      }),
    );
    expect(deducidos.map((d) => d.propietarioId)).toEqual(['p1']);
  });
});

describe('planificador (sin escritura)', () => {
  it('un único titular ⇒ 100 % (sin suponer nada)', () => {
    const informe = planificarMigracion({ inmuebles: [inmueble({ id: 'A', propietarioId: 'p1' })] });
    expect(informe.altasPropuestas).toBe(1);
    expect(informe.propuestas[0].altas[0]).toMatchObject({ propietarioId: 'p1', porcentaje: 100 });
  });

  it('dos titulares sin dato fiable ⇒ porcentaje PENDIENTE y advertencia', () => {
    const informe = planificarMigracion({
      inmuebles: [
        inmueble({
          id: 'A',
          propietarioId: 'p1',
          datosFiscales: {
            propietarioPrincipal: { nombre: 'P1', nifDni: 'X', direccion: 'Y', propietarioId: 'p1' },
            tieneSegundoPropietario: true,
            segundoPropietario: { nombre: 'P2', nifDni: 'Z', direccion: 'Y', propietarioId: 'p2' },
          },
        }),
      ],
    });
    expect(informe.altasPropuestas).toBe(2);
    expect(informe.propuestas[0].altas.every((a) => a.porcentaje === null)).toBe(true);
    expect(informe.advertencias.some((a) => a.includes('PENDIENTES'))).toBe(true);
  });

  it('es IDEMPOTENTE: no repropone lo que ya existe e igual', () => {
    const existentes: Titularidad[] = [
      construirTitularidad({ inmuebleId: 'A', propietarioId: 'p1', porcentaje: 100 }),
    ];
    const informe = planificarMigracion({
      inmuebles: [inmueble({ id: 'A', propietarioId: 'p1', titularesIds: ['p1'] })],
      titularidades: existentes,
    });
    expect(informe.altasPropuestas).toBe(0);
    expect(informe.inmueblesConCambios).toBe(0);
    expect(informe.propuestas[0].indiceActualizado).toBe(true);
  });

  it('avisa cuando la titularidad existe con otro porcentaje (no la pisa)', () => {
    const existentes: Titularidad[] = [
      construirTitularidad({ inmuebleId: 'A', propietarioId: 'p1', porcentaje: 60 }),
    ];
    const informe = planificarMigracion({
      inmuebles: [inmueble({ id: 'A', propietarioId: 'p1', titularesIds: ['p1'] })],
      titularidades: existentes,
    });
    expect(informe.altasPropuestas).toBe(0);
    expect(informe.advertencias.some((a) => a.includes('porcentaje distinto'))).toBe(true);
  });

  it('propone actualizar el índice si falta un titular en titularesIds', () => {
    const informe = planificarMigracion({
      inmuebles: [inmueble({ id: 'A', propietarioId: 'p1', titularesIds: [] })],
    });
    expect(informe.propuestas[0].titularesIds).toEqual(['p1']);
    expect(informe.propuestas[0].indiceActualizado).toBe(false);
  });

  it('incluye titularidades existentes de terceros en el índice calculado', () => {
    const existentes: Titularidad[] = [
      construirTitularidad({ inmuebleId: 'A', propietarioId: 'p1', porcentaje: 50 }),
      construirTitularidad({ inmuebleId: 'A', propietarioId: 'pX', porcentaje: 50 }),
    ];
    const informe = planificarMigracion({
      inmuebles: [inmueble({ id: 'A', propietarioId: 'p1', titularesIds: ['p1', 'pX'] })],
      titularidades: existentes,
    });
    expect(informe.propuestas[0].titularesIds).toEqual(['p1', 'pX']);
    expect(informe.inmueblesConCambios).toBe(0);
  });

  it('sustancialmenteIgual: null y 0 no son lo mismo; 50 y 50.001 sí', () => {
    const propuesta = { inmuebleId: 'A', propietarioId: 'p1', porcentaje: 50, origen: 'propietarioId' as const, clave: 'A__p1' };
    expect(sustancialmenteIgual(construirTitularidad({ inmuebleId: 'A', propietarioId: 'p1', porcentaje: 50 }), propuesta)).toBe(true);
    expect(sustancialmenteIgual(construirTitularidad({ inmuebleId: 'A', propietarioId: 'p1', porcentaje: 50.001 }), propuesta)).toBe(true);
    expect(sustancialmenteIgual(construirTitularidad({ inmuebleId: 'A', propietarioId: 'p1' }), propuesta)).toBe(false);
    expect(sustancialmenteIgual(construirTitularidad({ inmuebleId: 'A', propietarioId: 'p2', porcentaje: 50 }), propuesta)).toBe(false);
  });

  it('ignora inmuebles sin id y cuenta los analizados', () => {
    const informe = planificarMigracion({
      inmuebles: [inmueble({ id: 'A', propietarioId: 'p1' }), { ...inmueble({ id: '' }) }],
    });
    expect(informe.inmueblesAnalizados).toBe(1);
  });
});
