// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CrearProfesionalModal } from '../src/components/modals/CrearProfesionalModal';
import type { UsuarioApp, Especialidad } from '../src/types';

afterEach(cleanup);
const propietario = { id: 'cuenta-1', propietarioId: 'titular-1', tipoPerfil: 'PROPIETARIO' } as UsuarioApp;
const especialidades = [{ id: 'e1', nombre: 'Fontanería' }] as Especialidad[];
function abrir(usuario: UsuarioApp) {
  const onSave = vi.fn(async () => {});
  render(<CrearProfesionalModal currentUser={usuario} especialidades={especialidades} inmueblesDisponibles={[]} onSave={onSave} onClose={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText('Ej. Fontanería Vera y Reparaciones'), { target: { value: 'Técnico' } });
  fireEvent.click(screen.getByText('Fontanería'));
  fireEvent.click(screen.getByText('Guardar Profesional'));
  return onSave;
}

describe('profesional privado de propietario', () => {
  it('guarda el identificador de titular, no el de la cuenta', async () => {
    const onSave = abrir(propietario);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ creadoPorPropietarioId: 'titular-1', esPrivado: true })));
  });
  it('si la cuenta no tiene titular vinculado informa y no guarda', () => {
    const onSave = abrir({ ...propietario, propietarioId: undefined });
    expect(screen.getByText(/no tiene un propietario vinculado/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});
