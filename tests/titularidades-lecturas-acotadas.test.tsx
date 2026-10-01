/**
 * @vitest-environment jsdom
 *
 * LECTURAS DE TITULARIDADES ACOTADAS — «Lectura · titularidades: No tienes permisos»
 * ===================================================================================
 * Diagnóstico (ver docs/auditoria/ESTABILIZACION_PORTAL_TITULARES_2026-10-01.md):
 *
 *  · Quién lee: `PropietarioPortalSection` (efecto de montaje) →
 *    `subscribeTitularidadesEscopo` → un `onSnapshot(doc('titularidades/{inm}__{pid}'))`
 *    por clave.
 *  · Por qué se denegaba: se sondeaban claves HIPOTÉTICAS (`propietarioId`,
 *    `propietarioPrincipalId`, usuario actual) de inmuebles sin titularidades
 *    (anteriores a N-TITULARES o recién creados en el alta). Ese documento no
 *    existe y la regla `allow get` evalúa `resource.data` sobre `null` ⇒ deniega.
 *  · Corrección: se elimina la lectura innecesaria (sólo claves del índice
 *    `titularesIds`, sólo viviendas cuyas titularidades sirven las Rules). NO se
 *    amplía ningún permiso y NO se silencia ningún error.
 *
 * Aquí se monta el Portal REAL y se observa qué le pide a la capa de datos.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { PropietarioPortalSection } from '../src/components/sections/PropietarioPortalSection';
import { subscribeTitularidadesEscopo } from '../src/lib/titularidadesFirestore';
import { clavesTitularidadesIndexadas } from '../src/utils/titularidadesEngine';
import { puedeLeerTitularidadesDe } from '../src/lib/titularidadInmueble';
import type { Inmueble, Propietario, UsuarioApp } from '../src/types';

vi.mock('../src/lib/titularidadesFirestore', () => ({
  subscribeTitularidadesEscopo: vi.fn((_alcance: unknown, cb: (t: unknown[]) => void) => {
    cb([]);
    return vi.fn();
  }),
  guardarTitularidad: vi.fn(async () => true),
  cerrarTitularidad: vi.fn(async () => true),
}));

const PROPIETARIOS = [{ id: 'P1', nombre: 'Ana', nifCif: '12345678Z' }] as unknown as Propietario[];

function usuario(extra: Partial<UsuarioApp> = {}): UsuarioApp {
  return {
    id: 'user-1',
    nombre: 'Ana',
    email: 'ana@test.es',
    tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    propietarioId: 'P1',
    inmuebleIds: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...extra,
  } as UsuarioApp;
}

function vivienda(id: string, extra: Partial<Inmueble> = {}): Inmueble {
  return {
    id,
    direccion: `Calle ${id}`,
    ciudad: 'Sevilla',
    precio: 700,
    estado: 'alquilado',
    habitaciones: 2,
    banos: 1,
    superficie: 70,
    candidatosCount: 0,
    fianzaMeses: 1,
    ...extra,
  } as Inmueble;
}

function montar(inmuebles: Inmueble[], currentUser: UsuarioApp = usuario()) {
  const props = {
    currentUser,
    profesionales: [],
    contratos: [],
    especialidades: [],
    propietarios: PROPIETARIOS,
    gastos: [],
    incidencias: [],
    onOpenCrearProfesionalModal: () => undefined,
    onSaveProfesional: () => Promise.resolve(),
  };
  const resultado = render(<PropietarioPortalSection {...props} inmuebles={inmuebles} />);
  return {
    ...resultado,
    actualizar: (siguientes: Inmueble[]) =>
      resultado.rerender(<PropietarioPortalSection {...props} inmuebles={siguientes} />),
  };
}

/** Claves que el Portal ha pedido leer en una llamada concreta a la capa de datos. */
function clavesDeLlamada(indice: number): string[] {
  const alcance = vi.mocked(subscribeTitularidadesEscopo).mock.calls[indice][0];
  return clavesTitularidadesIndexadas(alcance.inmuebles).map((c) => c.clave);
}

beforeEach(() => {
  vi.mocked(subscribeTitularidadesEscopo).mockClear();
});
afterEach(() => {
  cleanup();
});

describe('el Portal no sondea documentos de titularidad que pueden no existir', () => {
  it('inmueble propio SIN índice (anterior a N-TITULARES / recién creado): no se lee ninguna clave', () => {
    montar([vivienda('V1', { propietarioId: 'P1', propietarioPrincipalId: 'P1' })]);
    // Antes: se sondeaba `V1__P1` (inexistente) ⇒ permission-denied ⇒ aviso visible.
    expect(subscribeTitularidadesEscopo).not.toHaveBeenCalled();
    // …y la vivienda sigue mostrándose con normalidad.
    expect(screen.getByText('Viviendas en cartera').nextElementSibling?.textContent).toBe('1');
  });

  it('con índice, sólo se leen las claves que el índice declara', () => {
    montar([vivienda('V1', { propietarioId: 'P1', titularesIds: ['P1', 'P2'] })]);
    expect(subscribeTitularidadesEscopo).toHaveBeenCalledTimes(1);
    expect(clavesDeLlamada(0)).toEqual(['V1__P1', 'V1__P2']);
  });

  it('N titulares: una clave por titular indexado, sin límite binario', () => {
    montar([vivienda('V1', { propietarioId: 'P1', titularesIds: ['P1', 'P2', 'P3', 'P4'] })]);
    expect(clavesDeLlamada(0)).toEqual(['V1__P1', 'V1__P2', 'V1__P3', 'V1__P4']);
  });

  it('un cotitular indexado en una vivienda ajena SÍ lee sus titularidades', () => {
    montar([vivienda('V9', { propietarioId: 'OTRO', titularesIds: ['OTRO', 'P1'] })]);
    expect(subscribeTitularidadesEscopo).toHaveBeenCalledTimes(1);
    expect(clavesDeLlamada(0)).toEqual(['V9__OTRO', 'V9__P1']);
  });
});

describe('el Portal sólo lee titularidades de viviendas cuyas titularidades sirven las Rules', () => {
  it('autorizado sólo por `inmuebleIds` (vivienda ajena): ve la vivienda, no se leen sus titularidades', () => {
    const ajena = vivienda('VX', { propietarioId: 'OTRO', propietarioPrincipalId: 'OTRO', titularesIds: ['OTRO'] });
    montar([ajena], usuario({ inmuebleIds: ['VX'] }));
    expect(screen.getByText('Viviendas en cartera').nextElementSibling?.textContent).toBe('1');
    expect(subscribeTitularidadesEscopo).not.toHaveBeenCalled();
  });

  it('con una vivienda propia y otra sólo autorizada, únicamente se piden claves de la propia', () => {
    const propia = vivienda('V1', { propietarioId: 'P1', titularesIds: ['P1'] });
    const ajena = vivienda('VX', { propietarioId: 'OTRO', titularesIds: ['OTRO'] });
    montar([propia, ajena], usuario({ inmuebleIds: ['VX'] }));
    expect(clavesDeLlamada(0)).toEqual(['V1__P1']);
  });

  it('titular principal ficticio que no es canónico ni está indexado: no se leen titularidades ajenas', () => {
    const v = vivienda('V2', { propietarioId: 'OTRO', propietarioPrincipalId: 'P1', titularesIds: ['OTRO'] });
    montar([v]);
    expect(subscribeTitularidadesEscopo).not.toHaveBeenCalled();
  });

  it('la vivienda histórica (baja) conserva la lectura de sus titularidades indexadas', () => {
    const historica = vivienda('H1', {
      propietarioId: 'P1',
      titularesIds: ['P1', 'P2'],
      estadoPatrimonial: 'VENDIDO',
      bajaPatrimonial: { fecha: '2026-09-01', motivo: 'VENTA', registradaEn: '2026-09-01T00:00:00.000Z' },
    });
    montar([historica]);
    // No cuenta como vivienda operativa…
    expect(screen.getByText('Viviendas en cartera').nextElementSibling?.textContent).toBe('0');
    // …pero su histórico de titularidad sigue siendo consultable.
    expect(clavesDeLlamada(0)).toEqual(['H1__P1', 'H1__P2']);
  });
});

describe('la suscripción sigue al índice (no sólo a los ids de vivienda)', () => {
  it('al añadir un titular cambia el índice y se escucha su nueva clave sin remontar el Portal', () => {
    const antes = vivienda('V1', { propietarioId: 'P1', titularesIds: ['P1'] });
    const despues = { ...antes, titularesIds: ['P1', 'P3'] };
    const { actualizar } = montar([antes]);
    expect(subscribeTitularidadesEscopo).toHaveBeenCalledTimes(1);
    const cancelar = vi.mocked(subscribeTitularidadesEscopo).mock.results[0].value as ReturnType<typeof vi.fn>;

    actualizar([despues]);

    expect(subscribeTitularidadesEscopo).toHaveBeenCalledTimes(2);
    expect(clavesDeLlamada(1)).toEqual(['V1__P1', 'V1__P3']);
    expect(cancelar).toHaveBeenCalledTimes(1);
  });

  it('un re-render sin cambio de claves no re-suscribe', () => {
    const v = vivienda('V1', { propietarioId: 'P1', titularesIds: ['P1', 'P2'] });
    const { actualizar } = montar([v]);
    actualizar([{ ...v }]);
    expect(subscribeTitularidadesEscopo).toHaveBeenCalledTimes(1);
  });
});

describe('predicado de lectura (espejo de `puedoLeerTitularidadDe`)', () => {
  const inm = (extra: Partial<Inmueble>) => vivienda('V', extra);

  it('titular canónico o cotitular indexado: sí', () => {
    expect(puedeLeerTitularidadesDe(inm({ propietarioId: 'P1' }), 'P1')).toBe(true);
    expect(puedeLeerTitularidadesDe(inm({ propietarioId: 'X', titularesIds: ['X', 'P1'] }), 'P1')).toBe(true);
  });

  it('principal sin canónico ni índice, `inmuebleIds`, otro propietario o sin propietarioId: no', () => {
    expect(puedeLeerTitularidadesDe(inm({ propietarioId: 'X', propietarioPrincipalId: 'P1' }), 'P1')).toBe(false);
    expect(puedeLeerTitularidadesDe(inm({ propietarioId: 'X', titularesIds: ['X'] }), 'P1')).toBe(false);
    expect(puedeLeerTitularidadesDe(inm({ propietarioId: 'P1' }), 'P2')).toBe(false);
    expect(puedeLeerTitularidadesDe(inm({ propietarioId: 'P1' }), undefined)).toBe(false);
    expect(puedeLeerTitularidadesDe(inm({ propietarioId: 'P1' }), '')).toBe(false);
  });
});

describe('las Firestore Rules NO se han abierto (ni titularidades ni carteras)', () => {
  const reglas = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const bloque = (marca: string): string => {
    const inicio = reglas.indexOf(marca);
    expect(inicio, `falta ${marca}`).toBeGreaterThan(-1);
    let i = reglas.lastIndexOf('{', reglas.indexOf('\n', inicio));
    let profundidad = 0;
    for (; i < reglas.length; i += 1) {
      if (reglas[i] === '{') profundidad += 1;
      if (reglas[i] === '}') {
        profundidad -= 1;
        if (profundidad === 0) return reglas.slice(inicio, i + 1);
      }
    }
    return reglas.slice(inicio);
  };

  it('`titularidades`: sin list, sin borrado y sin permisos incondicionales', () => {
    const b = bloque('match /titularidades/{titularidadId}');
    expect(b).toContain('allow list: if false;');
    expect(b).toContain('allow delete: if false;');
    expect(b).not.toMatch(/allow[^;]*:\s*if\s+true/);
  });

  it('`gestiones_cartera`: lectura sólo para administración o parte implicada; sin borrado ni permisos incondicionales', () => {
    const b = bloque('match /gestiones_cartera/{gestionId}');
    expect(b).toContain('allow list: if esAdminInmuebles() || gestionInvolucraAMi(resource.data);');
    expect(b).toContain('allow delete: if false;');
    expect(b).not.toMatch(/allow[^;]*:\s*if\s+true/);
  });
});
