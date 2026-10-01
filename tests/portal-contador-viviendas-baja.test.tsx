/**
 * @vitest-environment jsdom
 *
 * PORTAL DEL PROPIETARIO — CONTADOR DE VIVIENDAS Y BAJA PATRIMONIAL
 * ==================================================================
 * Se monta el componente REAL `PropietarioPortalSection` (sin reescribirlo).
 * Sólo se sustituye la suscripción a titularidades (frontera de datos), igual
 * que en `tests/portal-titularidades.integracion.test.tsx`.
 *
 * Criterio único: «vivienda operativa» es la de `inmueblesOperativos`
 * (`src/utils/bajaPatrimonialInmueble.ts`). El Portal NO tiene un filtro propio:
 * el contador, la lista y el resto de totales de viviendas salen del MISMO
 * conjunto que la cartera operativa del resto del ERP.
 *
 *  A · 2 activas + 1 histórica          → Viviendas = 2 (no 3)
 *  B · 0 activas + 1 histórica          → Viviendas = 0
 *  C · 1 activa con SIN_EXPLOTACION     → Viviendas = 1 (SIN_EXPLOTACION ≠ baja)
 *  H · la histórica no cuenta, no está en la cartera operativa, SIGUE existiendo
 *      y SIGUE en el histórico (y conserva sus datos relacionados)
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { PropietarioPortalSection } from '../src/components/sections/PropietarioPortalSection';
import { InmueblesSection } from '../src/components/sections/InmueblesSection';
import { inmueblesDadosDeBaja, inmueblesOperativos } from '../src/utils/bajaPatrimonialInmueble';
import type { ContratoFormalizacion, Inmueble, Propietario, UsuarioApp } from '../src/types';

vi.mock('../src/lib/titularidadesFirestore', () => ({
  subscribeTitularidadesEscopo: vi.fn((_alcance: unknown, cb: (t: unknown[]) => void) => {
    cb([]);
    return () => undefined;
  }),
  guardarTitularidad: vi.fn(async () => true),
  cerrarTitularidad: vi.fn(async () => true),
}));

const USUARIO = {
  id: 'user-1',
  nombre: 'Ana Propietaria',
  email: 'ana@test.es',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  roles: [],
  permisos: [],
  propietarioId: 'P1',
  inmuebleIds: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
} as unknown as UsuarioApp;

const PROPIETARIOS = [{ id: 'P1', nombre: 'Ana Propietaria', nifCif: '12345678Z' }] as unknown as Propietario[];

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
    propietarioId: 'P1',
    propietarioPrincipalId: 'P1',
    ...extra,
  } as Inmueble;
}

/** Vivienda dada de baja (vendida): sale de la cartera operativa y queda en el histórico. */
function historica(id: string, extra: Partial<Inmueble> = {}): Inmueble {
  return vivienda(id, {
    estadoPatrimonial: 'VENDIDO',
    estadoExplotacion: 'SIN_EXPLOTACION',
    fechaVenta: '2026-09-01',
    bajaPatrimonial: { fecha: '2026-09-01', motivo: 'VENTA', registradaEn: '2026-09-01T00:00:00.000Z' },
    ...extra,
  });
}

function montar(inmuebles: Inmueble[], contratos: ContratoFormalizacion[] = []) {
  return render(
    <PropietarioPortalSection
      currentUser={USUARIO}
      inmuebles={inmuebles}
      profesionales={[]}
      contratos={contratos}
      especialidades={[]}
      propietarios={PROPIETARIOS}
      gastos={[]}
      incidencias={[]}
      onOpenCrearProfesionalModal={() => undefined}
      onSaveProfesional={() => Promise.resolve()}
    />,
  );
}

/** Contador de la cabecera: «Viviendas en cartera» → valor numérico contiguo. */
function contadorCabecera(): string {
  const etiqueta = screen.getByText('Viviendas en cartera');
  return (etiqueta.nextElementSibling?.textContent ?? '').trim();
}

/** Insignia numérica de la pestaña «Mis Viviendas». */
function contadorPestana(): string {
  const boton = screen.getByRole('button', { name: /Mis Viviendas/ });
  return (within(boton).getAllByText(/^\d+$/)[0]?.textContent ?? '').trim();
}

afterEach(() => cleanup());

describe('A · 2 viviendas activas + 1 histórica → Viviendas = 2', () => {
  const inmuebles = [vivienda('a1'), vivienda('a2'), historica('h1')];

  it('la cabecera, la pestaña, el título de la lista y el perfil muestran 2 (no 3)', () => {
    montar(inmuebles);
    expect(contadorCabecera()).toBe('2');
    expect(contadorPestana()).toBe('2');
    expect(screen.getByText(/Viviendas Asignadas a Tu Cuenta \(2\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Mi Perfil/ }));
    expect(screen.getByText('2 viviendas')).toBeTruthy();
    expect(screen.queryByText('3 viviendas')).toBeNull();
  });

  it('la lista tiene exactamente las 2 activas y la histórica no aparece', () => {
    montar(inmuebles);
    expect(screen.getByText('Calle a1')).toBeTruthy();
    expect(screen.getByText('Calle a2')).toBeTruthy();
    expect(screen.queryByText('Calle h1')).toBeNull();
  });

  it('el contador del Portal coincide con la cartera operativa del ERP (mismo criterio)', () => {
    montar(inmuebles);
    expect(Number(contadorCabecera())).toBe(inmueblesOperativos(inmuebles).length);
  });
});

describe('B · 0 viviendas activas + 1 histórica → Viviendas = 0', () => {
  it('muestra 0 y el estado vacío (no «1»)', () => {
    montar([historica('h1')]);
    expect(contadorCabecera()).toBe('0');
    expect(contadorPestana()).toBe('0');
    expect(screen.getByText(/Viviendas Asignadas a Tu Cuenta \(0\)/)).toBeTruthy();
    expect(screen.getByText(/No tienes viviendas asignadas todavía/)).toBeTruthy();
    expect(screen.queryByText('Calle h1')).toBeNull();
  });
});

describe('C · SIN_EXPLOTACION no es una baja', () => {
  it('1 vivienda ACTIVA con SIN_EXPLOTACION → Viviendas = 1 y se lista', () => {
    const sinExplotacion = vivienda('s1', { estadoPatrimonial: 'ACTIVO', estadoExplotacion: 'SIN_EXPLOTACION' });
    montar([sinExplotacion]);
    expect(contadorCabecera()).toBe('1');
    expect(contadorPestana()).toBe('1');
    expect(screen.getByText('Calle s1')).toBeTruthy();
  });

  it('1 en explotación + 1 SIN_EXPLOTACION + 1 baja → 2 (sólo la baja se excluye)', () => {
    montar([
      vivienda('e1', { estadoExplotacion: 'EN_EXPLOTACION' }),
      vivienda('s1', { estadoPatrimonial: 'ACTIVO', estadoExplotacion: 'SIN_EXPLOTACION' }),
      historica('h1'),
    ]);
    expect(contadorCabecera()).toBe('2');
    expect(screen.getByText('Calle e1')).toBeTruthy();
    expect(screen.getByText('Calle s1')).toBeTruthy();
    expect(screen.queryByText('Calle h1')).toBeNull();
  });

  it('el historial de bajas previas de un inmueble hoy ACTIVO tampoco lo excluye', () => {
    const reactivada = vivienda('r1', {
      estadoPatrimonial: 'ACTIVO',
      historialBajas: [{ fecha: '2025-01-01', motivo: 'OTRO', registradaEn: '2025-01-01T00:00:00.000Z' }],
    });
    montar([reactivada]);
    expect(contadorCabecera()).toBe('1');
  });
});

describe('H · la vivienda histórica no cuenta, pero sigue existiendo y sigue en el histórico', () => {
  const a1 = vivienda('a1');
  const a2 = vivienda('a2');
  const h1 = historica('h1');
  const inmuebles = [a1, a2, h1];
  const contratoHistorico = {
    id: 'c-h1',
    inmuebleId: 'h1',
    propietarioId: 'P1',
  } as unknown as ContratoFormalizacion;

  it('no cuenta ni se lista en el Portal, pero el dato de origen sigue conteniéndola (nada se borra)', () => {
    const copia = [...inmuebles];
    montar(inmuebles);
    expect(contadorCabecera()).toBe('2');
    expect(screen.queryByText('Calle h1')).toBeNull();
    // El Portal no muta ni recorta el conjunto recibido.
    expect(inmuebles).toEqual(copia);
    expect(inmuebles).toHaveLength(3);
    expect(inmuebles.some((i) => i.id === 'h1')).toBe(true);
  });

  it('no está en la cartera operativa y sí en el histórico (misma proyección que el resto del ERP)', () => {
    expect(inmueblesOperativos(inmuebles).map((i) => i.id)).toEqual(['a1', 'a2']);
    expect(inmueblesDadosDeBaja(inmuebles).map((i) => i.id)).toEqual(['h1']);
  });

  it('el histórico de «Inmuebles» la sigue mostrando y el contador operativo no la cuenta', () => {
    render(
      <InmueblesSection
        inmuebles={inmuebles}
        candidatos={[]}
        propietarios={PROPIETARIOS}
        onSelectCandidate={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Todos (2)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Histórico (1)' })).toBeTruthy();
    expect(screen.queryByText('Calle h1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Histórico (1)' }));
    expect(screen.getByText('Calle h1')).toBeTruthy();
    expect(screen.queryByText('Calle a1')).toBeNull();
  });

  it('conserva sus datos relacionados: el contrato del inmueble histórico sigue en el ámbito del Portal', () => {
    montar(inmuebles, [contratoHistorico]);
    const botonContratos = screen.getByRole('button', { name: /Mis Contratos/ });
    expect(within(botonContratos).getByText('1')).toBeTruthy();
    // …mientras el contador de viviendas sigue siendo 2.
    expect(contadorCabecera()).toBe('2');
  });
});
