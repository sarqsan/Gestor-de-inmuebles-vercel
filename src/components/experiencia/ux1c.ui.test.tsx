/**
 * UX-1C · El ? existente muestra la ficha de la sección y no aparece si el perfil no la tiene.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ROLES_PREDEFINIDOS, type UsuarioApp } from '../../types';
import { ContextualHelp } from './ContextualHelp';

afterEach(() => cleanup());

const rol = (id: string) => ROLES_PREDEFINIDOS.find((r) => r.id === id)!;
function usuario(tipo: UsuarioApp['tipoPerfil']): UsuarioApp {
  return {
    id: `u-${tipo}`,
    nombre: 'Usuario',
    email: 'u@test.local',
    tipoPerfil: tipo,
    estado: 'ACTIVO',
    roles: [],
    permisos: tipo === 'ADMINISTRADOR' ? rol('SUPERADMIN').permisos : [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
}

describe('UX-1C · ayuda contextual en pantalla', () => {
  it('el administrador ve la ficha de Gastos en esa sección y el profesional no', () => {
    render(<ContextualHelp usuario={usuario('ADMINISTRADOR')} section="gastos" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ayuda: Gastos, recurrentes y préstamos' }));
    fireEvent.click(screen.getByText('Leer más'));
    expect(screen.getByText(/Qué puedes hacer/)).toBeTruthy();
    expect(screen.getByText(/Después/)).toBeTruthy();
    cleanup();

    const { container } = render(<ContextualHelp usuario={usuario('PROFESIONAL')} section="gastos" />);
    expect(container.innerHTML).toBe('');
  });

  it('el propietario ve su resumen y no el panel ejecutivo del administrador', () => {
    render(<ContextualHelp usuario={usuario('PROPIETARIO')} section="dashboard" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ayuda: Resumen de tu cartera' }));
    expect(screen.queryByText('Panel ejecutivo')).toBeNull();
  });
});
