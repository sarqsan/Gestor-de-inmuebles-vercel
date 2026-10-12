/**
 * @vitest-environment jsdom
 *
 * ALTA INCOMPLETA → EDICIÓN POSTERIOR (datos SINTÉTICOS).
 *
 * Un inmueble importado sólo con dirección y titular:
 *  · se muestra sin «NaN €», sin «Alquilado» falso y con su información pendiente;
 *  · se puede editar y guardar sin rellenar precio, ciudad, estado ni fianza;
 *  · guardar no escribe ceros ni valores por defecto para lo que no se indicó.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Inmueble, Propietario } from '../../types';
import { InmueblesSection } from './InmueblesSection';

const titular: Propietario = {
  id: 'prop_A',
  nombre: 'Titular sintético',
  nifCif: 'SYN-NIF-A',
  tipoPropietario: 'persona_fisica',
  telefono: '600000000',
  email: 'titular@correo.test',
  direccion: 'Calle sintética 1',
  ciudad: 'Alicante',
  codigoPostal: '03001',
  cuentasBancarias: [{ id: 'cta-A', alias: 'Principal', iban: 'ES00SINTETICO', esPrincipal: true }],
  fechaCreacion: '2026-01-01',
  fechaActualizacion: '2026-01-01',
};

/** Alta mínima tal como la deja la importación: sólo lo que el archivo declara. */
const incompleto = {
  id: 'inm_imp_sintetico_1',
  direccion: 'Calle Sintetica Cuatro 4',
  propietarioId: 'prop_A',
  propietarioPrincipalId: 'prop_A',
  rentaMensualDeclarada: 650,
  createdAt: '2026-10-12T10:00:00.000Z',
  updatedAt: '2026-10-12T10:00:00.000Z',
} as unknown as Inmueble;

function renderFicha(onUpdate?: (inm: Inmueble) => void) {
  return render(
    <InmueblesSection
      inmuebles={[incompleto]}
      candidatos={[]}
      propietarios={[titular]}
      onSelectCandidate={() => undefined}
      onUpdateInmueble={onUpdate}
    />,
  );
}

function abrirFicha() {
  // La tarjeta del listado abre la ficha al pulsar el título de la dirección.
  fireEvent.click(screen.getByText('Calle Sintetica Cuatro 4'));
}

afterEach(() => cleanup());

describe('alta incompleta: presentación honesta', () => {
  it('no muestra «NaN» ni afirma «Alquilado» cuando el estado no consta', () => {
    renderFicha();
    abrirFicha();
    expect(document.body.textContent ?? '').not.toContain('NaN');
    expect(screen.getAllByText('Estado pendiente').length).toBeGreaterThan(0);
    expect(screen.queryByText('Alquilado')).toBeNull();
  });

  it('lista lo pendiente y muestra la renta declarada como dato declarado', () => {
    renderFicha();
    abrirFicha();
    const bloque = screen.getByTestId('datos-pendientes-inmueble');
    expect(bloque.textContent).toContain('Pendiente de completar');
    expect(bloque.textContent).toContain('Ciudad');
    expect(bloque.textContent).toContain('Renta declarada en la importación');
    expect(bloque.textContent).toContain('no es el precio publicado');
  });
});

describe('alta incompleta: edición posterior sin rellenar todo', () => {
  it('guardar sin ciudad ni precio es posible y no escribe ceros ni valores por defecto', () => {
    const onUpdate = vi.fn();
    renderFicha(onUpdate);
    abrirFicha();
    fireEvent.click(screen.getByTitle('Editar precio, descripción y datos del inmueble'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const guardado = onUpdate.mock.calls[0][0] as Record<string, unknown>;
    // Lo que no se indicó sigue sin indicar: ni 0, ni 850, ni 1, ni «disponible».
    expect(guardado.precio).toBeUndefined();
    expect(guardado.estado).toBeUndefined();
    expect(guardado.habitaciones).toBeUndefined();
    expect(guardado.banos).toBeUndefined();
    expect(guardado.superficie).toBeUndefined();
    expect(guardado.fianzaMeses).toBeUndefined();
    expect(guardado.ciudad).toBeUndefined();
  });

  it('un precio escrito sí se guarda; un campo vacío nunca se guarda como 0', () => {
    const onUpdate = vi.fn();
    renderFicha(onUpdate);
    abrirFicha();
    fireEvent.click(screen.getByTitle('Editar precio, descripción y datos del inmueble'));
    const precio = screen.getByLabelText('Precio Alquiler (€/mes)') as HTMLInputElement;
    fireEvent.change(precio, { target: { value: '720' } });
    fireEvent.change(precio, { target: { value: '' } });
    fireEvent.change(precio, { target: { value: '690' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));

    const guardado = onUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(guardado.precio).toBe(690);
  });
});
