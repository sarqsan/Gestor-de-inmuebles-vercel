/**
 * @vitest-environment jsdom
 *
 * AUDITORÍA UX PROPIETARIO (2026-09-29) — «Mis titulares» (pantalla patrimonial):
 * GAP DE PERMISOS documentado — las Firestore Rules solo permiten crear
 * titulares patrimoniales al ADMINISTRADOR. Antes, el propietario VEÍA la
 * pestaña «Nuevo propietario» y el guardado fallaba con permission-denied.
 * Ahora la vista se oculta con explicación honesta y la guardia de
 * `guardarAlta` rechaza el intento sin tocar el backend (el test F5 lo fija).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Propietario, UsuarioApp } from '../types';
import { PantallaPatrimonial } from './PantallaPatrimonial';

const usuario = (tipoPerfil: UsuarioApp['tipoPerfil']): UsuarioApp => ({
  id: 'u-1',
  nombre: 'Prueba',
  email: 'p@t.local',
  tipoPerfil,
  estado: 'ACTIVO',
  roles: [],
  permisos: [],
  propietarioId: 'P1',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
});

const PROPIETARIOS: Propietario[] = [
  {
    id: 'P1',
    nombre: 'Ana Propietaria',
    nifCif: '12345678Z',
    tipoPropietario: 'persona_fisica',
    telefono: '600000000',
    email: 'ana@correo.test',
    direccion: 'Calle Real 5',
    ciudad: 'Sevilla',
    codigoPostal: '41001',
    cuentasBancarias: [],
    fechaCreacion: '2026-01-01',
    fechaActualizacion: '2026-01-01',
  },
];

function renderPatrimonial(perfil: UsuarioApp['tipoPerfil'], onCrearPropietario = vi.fn(async () => {})) {
  return {
    onCrearPropietario,
    ...render(
      <PantallaPatrimonial
        propietarios={PROPIETARIOS}
        usuarioActual={usuario(perfil)}
        onCrearPropietario={onCrearPropietario}
      />,
    ),
  };
}

describe('pantalla patrimonial — honestidad de permisos por perfil (auditoría 2026-09-29)', () => {
  afterEach(() => cleanup());

  it('PROPIETARIO: no ve «Nuevo propietario», ve la explicación y conserva Propietarios e Importación', () => {
    renderPatrimonial('PROPIETARIO');

    expect(screen.queryByRole('button', { name: /Nuevo propietario/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Propietarios/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Importación/i })).toBeTruthy();
    // Aviso honesto (rol note): explica el GAP DE PERMISOS y desvía el cotitular a la ficha del inmueble
    const nota = screen.getByRole('note');
    expect(nota.textContent).toMatch(/titulares patrimoniales corresponde a la administración/);
    expect(nota.textContent).toMatch(/titularidad desde la ficha del inmueble/);
    // No se ha eliminado funcionalidad: la ficha y la importación siguen ahí.
    expect(screen.getByText(/Ana Propietaria/)).toBeTruthy();
  });

  it('ADMINISTRADOR: ve «Nuevo propietario» exactamente una vez (funcionalidad conservada)', () => {
    renderPatrimonial('ADMINISTRADOR');

    const botones = screen.getAllByRole('button', { name: /Nuevo propietario/i });
    expect(botones).toHaveLength(1);
    fireEvent.click(botones[0]);
    // El onboarding de alta se abre (flujo del admin intacto); la lista desaparece al cambiar de vista
    expect(screen.queryByText(/Ana Propietaria/)).toBeNull();
  });

  it('GESTOR tampoco es administrador: mismo tratamiento honesto (sin viñeta de alta)', () => {
    renderPatrimonial('GESTOR' as UsuarioApp['tipoPerfil']);
    expect(screen.queryByRole('button', { name: /Nuevo propietario/i })).toBeNull();
    expect(screen.getByRole('note').textContent).toMatch(/corresponde a la administración/);
  });
});
