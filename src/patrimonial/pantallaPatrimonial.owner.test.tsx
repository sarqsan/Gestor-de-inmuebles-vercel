/**
 * @vitest-environment jsdom
 *
 * AUDITORÍA UX PROPIETARIO (2026-09-29) — «Mis titulares» (pantalla patrimonial):
 * el alta PATRIMONIAL de otro propietario (esta pantalla) es del ámbito administrativo.
 * Antes, el propietario VEÍA la pestaña «Nuevo propietario» y el guardado fallaba con
 * permission-denied. Ahora la vista se oculta con una explicación honesta.
 *
 * PR #19 (2026-10-01): el PROPIETARIO sí crea y mantiene TANTOS titulares como necesite, pero
 * en «Propietarios / Titulares» (ficha completa e independiente por titular, en su ámbito).
 * Por eso a él esta pantalla NO le dice que acuda a la administración: le indica dónde crear
 * titulares. Un perfil que no es ni administrador ni propietario conserva el texto anterior.
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
    // Aviso honesto (rol note): dice DÓNDE crear titulares (sin remitir a la administración) y desvía
    // el cotitular fiscal a la titularidad de la ficha del inmueble
    const nota = screen.getByRole('note');
    expect(nota.textContent).toMatch(/Propietarios \/ Titulares/);
    expect(nota.textContent).toMatch(/tantos como necesites/);
    expect(nota.textContent).toMatch(/titularidad en la ficha del inmueble/);
    expect(nota.textContent).not.toMatch(/administraci[oó]n/i);
    expect(nota.textContent).not.toMatch(/administrador/i);
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
