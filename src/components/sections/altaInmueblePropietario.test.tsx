/**
 * @vitest-environment jsdom
 *
 * Alta de inmueble: preselección solo cuando nace del contexto de un propietario.
 * No cubre la edición ni hace obligatorio el titular.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Inmueble, Propietario } from '../../types';
import { InmueblesSection } from './InmueblesSection';
import { PropietariosSection } from './PropietariosSection';

function propietario(id: string, extra: Partial<Propietario> = {}): Propietario {
  return {
    id,
    nombre: `Nombre ${id}`,
    nifCif: `NIF-${id}`,
    tipoPropietario: 'persona_fisica',
    telefono: `600${id.slice(-3).padStart(3, '0')}`,
    email: `${id}@correo.test`,
    direccion: `Calle ${id}`,
    ciudad: 'Madrid',
    codigoPostal: '28001',
    cuentasBancarias: [
      { id: `cta-${id}`, alias: 'Principal', iban: `ES00${id}`, esPrincipal: true },
    ],
    fechaCreacion: '2026-01-01',
    fechaActualizacion: '2026-01-01',
    ...extra,
  };
}

function renderAlta(opts: {
  propietarios: Propietario[];
  onAdd: (inm: Inmueble) => void;
  contexto?: string | null;
  onConsumido?: () => void;
}) {
  return render(
    <InmueblesSection
      inmuebles={[]}
      candidatos={[]}
      propietarios={opts.propietarios}
      onSelectCandidate={() => undefined}
      onAddInmueble={opts.onAdd}
      propietarioContextoAltaId={opts.contexto}
      onContextoAltaConsumido={opts.onConsumido}
    />,
  );
}

function rellenarMinimo() {
  fireEvent.change(screen.getByPlaceholderText('Ej. Calle Gran Vía 42, 3ºB'), { target: { value: 'Calle Mayor 1' } });
  fireEvent.change(screen.getByPlaceholderText('Ej. Madrid'), { target: { value: 'Sevilla' } });
}

function selectorTitular(): HTMLSelectElement {
  const el = screen.getAllByRole('combobox').find((node) =>
    Array.from((node as HTMLSelectElement).options).some((opt) => opt.textContent?.includes('Asignación manual')),
  );
  if (!el) throw new Error('No está el selector de arrendador principal');
  return el as HTMLSelectElement;
}

function selectorSegundo(): HTMLSelectElement {
  const el = screen.getAllByRole('combobox').find((node) =>
    Array.from((node as HTMLSelectElement).options).some((opt) => opt.textContent?.includes('sin vincular')),
  );
  if (!el) throw new Error('No está el selector del segundo propietario');
  return el as HTMLSelectElement;
}

function irAGeneral() {
  fireEvent.click(screen.getByRole('button', { name: /Datos Generales y Vivienda/ }));
}

function irAFiscal() {
  fireEvent.click(screen.getByRole('button', { name: /Apartado Fiscal/ }));
}

describe('alta de inmueble desde propietario', () => {
  afterEach(() => cleanup());

  const p1 = propietario('P1');
  const p2 = propietario('P2');
  const p3 = propietario('P3');

  it('A. el contexto preselecciona al propietario y rellena fiscal, cuenta y los tres ids', () => {
    const onAdd = vi.fn();
    const onConsumido = vi.fn();
    renderAlta({ propietarios: [p1, p2], onAdd, contexto: 'P1', onConsumido });

    expect(screen.getByRole('heading', { name: /Añadir Nuevo Inmueble/ })).toBeTruthy();
    const selector = selectorTitular();
    expect(selector.value).toBe('P1');
    expect(selector.disabled).toBe(false);
    expect((screen.getByPlaceholderText('Ej. Juan Pérez García o Arrendamientos SL') as HTMLInputElement).value).toBe('Nombre P1');
    expect((screen.getByPlaceholderText('Ej. 12345678Z o B-87654321') as HTMLInputElement).value).toBe('NIF-P1');
    expect((screen.getByPlaceholderText('Calle, número, ciudad') as HTMLInputElement).value).toBe('Calle P1, Madrid');
    expect(onConsumido).toHaveBeenCalledTimes(1);

    irAGeneral();
    rellenarMinimo();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Inmueble' }));

    const creado = onAdd.mock.calls[0][0] as Inmueble;
    expect(creado.propietarioId).toBe('P1');
    expect(creado.propietarioPrincipalId).toBe('P1');
    expect(creado.datosFiscales?.propietarioPrincipal.propietarioId).toBe('P1');
    expect(creado.datosFiscales?.propietarioPrincipal).toMatchObject({
      nombre: 'Nombre P1',
      nifDni: 'NIF-P1',
      telefono: p1.telefono,
      email: p1.email,
    });
    expect(creado.cuentaBancariaCobroId).toBe('cta-P1');
    expect(creado.ibanCobro).toBe('ES00P1');
  });

  it('B. el selector sigue editable y el segundo titular no se toca al cambiar el principal', () => {
    const onAdd = vi.fn();
    renderAlta({ propietarios: [p1, p2, p3], onAdd, contexto: 'P1' });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Inmueble con Segundo Propietario / Co-Arrendador' }));
    const segundo = selectorSegundo();
    const principal = selectorTitular();
    fireEvent.change(segundo, { target: { value: 'P2' } });
    fireEvent.change(principal, { target: { value: 'P3' } });

    expect(principal.value).toBe('P3');
    expect((screen.getByPlaceholderText('Ej. Juan Pérez García o Arrendamientos SL') as HTMLInputElement).value).toBe('Nombre P3');
    expect(segundo.value).toBe('P2');

    irAGeneral();
    rellenarMinimo();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Inmueble' }));

    const creado = onAdd.mock.calls[0][0] as Inmueble;
    expect(creado.propietarioId).toBe('P3');
    expect(creado.propietarioPrincipalId).toBe('P3');
    expect(creado.datosFiscales?.propietarioPrincipal.propietarioId).toBe('P3');
    expect(creado.datosFiscales?.propietarioPrincipal.nombre).toBe('Nombre P3');
    expect(creado.cuentaBancariaCobroId).toBe('cta-P3');
    expect(creado.propietarioSecundarioId).toBe('P2');
    expect(creado.datosFiscales?.segundoPropietario?.propietarioId).toBe('P2');
    expect(creado.datosFiscales?.segundoPropietario?.nombre).toBe('Nombre P2');
    expect(creado.datosFiscales?.tieneSegundoPropietario).toBe(true);
  });

  it('C. el alta general sigue vacía y permite guardar sin propietario', () => {
    const onAdd = vi.fn();
    renderAlta({ propietarios: [p1], onAdd });

    expect(screen.queryByRole('heading', { name: /Añadir Nuevo Inmueble/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Nuevo Inmueble/ }));
    irAFiscal();
    const selector = selectorTitular();
    expect(selector.value).toBe('');

    irAGeneral();
    rellenarMinimo();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Inmueble' }));

    const creado = onAdd.mock.calls[0][0] as Inmueble;
    expect(creado.propietarioId).toBeUndefined();
    expect(creado.propietarioPrincipalId).toBeUndefined();
    expect(creado.datosFiscales?.propietarioPrincipal.propietarioId).toBeUndefined();
  });

  it('D. la selección manual del alta general sigue escribiendo los tres ids', () => {
    const onAdd = vi.fn();
    renderAlta({ propietarios: [p1, p2], onAdd });
    fireEvent.click(screen.getByRole('button', { name: /Nuevo Inmueble/ }));
    irAFiscal();
    fireEvent.change(selectorTitular(), { target: { value: 'P2' } });
    expect((screen.getByPlaceholderText('Ej. 12345678Z o B-87654321') as HTMLInputElement).value).toBe('NIF-P2');

    irAGeneral();
    rellenarMinimo();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Inmueble' }));

    const creado = onAdd.mock.calls[0][0] as Inmueble;
    expect(creado.propietarioId).toBe('P2');
    expect(creado.propietarioPrincipalId).toBe('P2');
    expect(creado.datosFiscales?.propietarioPrincipal.propietarioId).toBe('P2');
    expect(creado.ibanCobro).toBe('ES00P2');
  });

  it('el alta general posterior a un contexto no conserva el titular preseleccionado', () => {
    const onAdd = vi.fn();
    renderAlta({ propietarios: [p1], onAdd, contexto: 'P1' });
    expect(selectorTitular().value).toBe('P1');

    fireEvent.click(screen.getByRole('button', { name: /Nuevo Inmueble/ }));
    irAFiscal();
    expect(selectorTitular().value).toBe('');
    expect((screen.getByPlaceholderText('Ej. Juan Pérez García o Arrendamientos SL') as HTMLInputElement).value).toBe('');

    irAGeneral();
    rellenarMinimo();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Inmueble' }));
    const creado = onAdd.mock.calls[0][0] as Inmueble;
    expect(creado.propietarioId).toBeUndefined();
    expect(creado.propietarioPrincipalId).toBeUndefined();
    expect(creado.datosFiscales?.propietarioPrincipal.propietarioId).toBeUndefined();
  });

  it('la ficha del propietario abre el alta pasando su id', () => {
    const onCrear = vi.fn();
    render(
      <PropietariosSection
        propietarios={[p1]}
        inmuebles={[]}
        onSavePropietario={() => undefined}
        onDeletePropietario={() => undefined}
        onCrearInmueble={onCrear}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Crear inmueble/ }));
    expect(onCrear).toHaveBeenCalledWith('P1');
  });
});
