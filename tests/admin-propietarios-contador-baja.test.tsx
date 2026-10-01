/**
 * @vitest-environment jsdom
 *
 * ADMINISTRACIÓN · «Inmuebles en Gestión» POR PROPIETARIO — CONTADOR Y BAJA PATRIMONIAL
 * ======================================================================================
 * Contador residual de la misma familia que el del Portal: la tabla de propietarios
 * y su ficha contaban TODOS los inmuebles del propietario (también los vendidos o
 * dados de baja), mientras que «Ver Inmuebles» sólo lista la cartera operativa.
 *
 * Criterio único: `inmueblesOperativos` (el mismo del resto del ERP). No hay filtro
 * propio. La vivienda dada de baja NO se borra: sigue en el histórico del inventario.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { AdminControlCenter } from '../src/components/admin/AdminControlCenter';
import type { Inmueble, Propietario, UsuarioApp } from '../src/types';

// ADMINISTRADOR que NO es el master: no dispara la carga de identidad (Firestore).
const ADMIN = {
  id: 'admin-1',
  nombre: 'Admin',
  email: 'admin@test.es',
  tipoPerfil: 'ADMINISTRADOR',
  estado: 'ACTIVO',
  roles: [],
  permisos: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
} as unknown as UsuarioApp;

const PROPIETARIO = {
  id: 'P1',
  nombre: 'Ana Propietaria',
  nifCif: '12345678Z',
  tipoPropietario: 'persona_fisica',
  telefono: '600000000',
  email: 'ana@test.es',
  direccion: 'Calle Real 5',
  ciudad: 'Sevilla',
  codigoPostal: '41001',
  cuentasBancarias: [],
  fechaCreacion: '2026-01-01',
  fechaActualizacion: '2026-01-01',
} as unknown as Propietario;

function inmueble(id: string, extra: Partial<Inmueble> = {}): Inmueble {
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

const historica = (id: string) =>
  inmueble(id, {
    estadoPatrimonial: 'VENDIDO',
    estadoExplotacion: 'SIN_EXPLOTACION',
    bajaPatrimonial: { fecha: '2026-09-01', motivo: 'VENTA', registradaEn: '2026-09-01T00:00:00.000Z' },
  });

function montar(inmuebles: Inmueble[]) {
  return render(
    <AdminControlCenter
      currentUser={ADMIN}
      usuarios={[]}
      inmuebles={inmuebles}
      propietarios={[PROPIETARIO]}
      profesionales={[]}
      contratos={[]}
      auditLogs={[]}
      enlacesRegistro={[]}
      especialidades={[]}
      onLogout={() => undefined}
      onSaveUsuario={async () => undefined}
      onDeleteUsuario={async () => undefined}
      onSaveEnlaceRegistro={async () => undefined}
      onDeleteEnlaceRegistro={async () => undefined}
      onRejectEnlaceRegistro={async () => undefined}
      onSaveEspecialidad={async () => undefined}
      onDeleteEspecialidad={async () => undefined}
      onOpenCrearUsuarioModal={() => undefined}
      onOpenCrearEnlaceModal={() => undefined}
      seccionInicial="propietarios"
    />,
  );
}

afterEach(() => cleanup());

describe('Administración · «Inmuebles en Gestión» de un propietario', () => {
  const inmuebles = [inmueble('a1'), inmueble('a2'), historica('h1')];

  it('la tabla cuenta 2 viviendas (2 activas + 1 histórica), no 3', () => {
    montar(inmuebles);
    const fila = screen.getByText('Ana Propietaria').closest('tr') as HTMLElement;
    expect(within(fila).getByText('2 viviendas')).toBeTruthy();
    expect(within(fila).queryByText('3 viviendas')).toBeNull();
  });

  it('la ficha del propietario cuenta lo mismo (2)', () => {
    montar(inmuebles);
    fireEvent.click(screen.getByRole('button', { name: 'Ficha' }));
    const etiqueta = screen.getByText('Inmuebles en Gestión:');
    expect((etiqueta.parentElement?.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe('Inmuebles en Gestión: 2');
  });

  it('con sólo una vivienda histórica el propietario tiene 0 viviendas en gestión', () => {
    montar([historica('h1')]);
    const fila = screen.getByText('Ana Propietaria').closest('tr') as HTMLElement;
    expect(within(fila).getByText('0 viviendas')).toBeTruthy();
  });

  it('SIN_EXPLOTACION con inmueble ACTIVO sigue contando (no es una baja)', () => {
    montar([inmueble('s1', { estadoPatrimonial: 'ACTIVO', estadoExplotacion: 'SIN_EXPLOTACION' })]);
    const fila = screen.getByText('Ana Propietaria').closest('tr') as HTMLElement;
    expect(within(fila).getByText('1 vivienda')).toBeTruthy();
  });

  it('la vivienda dada de baja no se borra: sigue en el histórico del inventario', () => {
    montar(inmuebles);
    fireEvent.click(screen.getByRole('button', { name: 'Ver Inmuebles' }));
    // Listado operativo (mismo conjunto que el contador): sin la histórica.
    expect(screen.queryByText('Calle h1')).toBeNull();
    // Histórico patrimonial: la baja sigue existiendo y es consultable.
    const filtroEstado = screen
      .getAllByRole('combobox')
      .find((el) => Array.from((el as HTMLSelectElement).options).some((o) => o.value === 'HISTORICO'));
    expect(filtroEstado).toBeTruthy();
    fireEvent.change(filtroEstado as HTMLSelectElement, { target: { value: 'HISTORICO' } });
    expect(screen.getAllByText('Calle h1').length).toBeGreaterThan(0);
  });
});
