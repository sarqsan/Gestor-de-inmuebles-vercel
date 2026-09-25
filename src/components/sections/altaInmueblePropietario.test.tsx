/**
 * @vitest-environment jsdom
 *
 * Alta de inmueble: preselección desde el contexto de un propietario y, en el
 * alta general, solo como valor inicial si el usuario autenticado es PROPIETARIO.
 * No cubre la edición ni hace obligatorio el titular.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Inmueble, Propietario, UsuarioApp } from '../../types';
import { InmueblesSection } from './InmueblesSection';
import { PropietarioPortalSection } from './PropietarioPortalSection';
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

function usuario(
  tipoPerfil: UsuarioApp['tipoPerfil'],
  extra: Partial<UsuarioApp> = {},
): UsuarioApp {
  return {
    id: 'user-test',
    nombre: 'Usuario test',
    email: 'user@correo.test',
    tipoPerfil,
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...extra,
  };
}

function renderAlta(opts: {
  propietarios: Propietario[];
  onAdd: (inm: Inmueble) => void;
  contexto?: string | null;
  onConsumido?: () => void;
  currentUser?: UsuarioApp | null;
  onEliminar?: (inmuebleId: string, campos: unknown) => void;
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
      currentUser={opts.currentUser}
      onEliminarTitularSecundario={opts.onEliminar}
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
    const onEliminar = vi.fn();
    renderAlta({ propietarios: [p1, p2], onAdd, contexto: 'P1', onConsumido, onEliminar });

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
    expect(onEliminar).not.toHaveBeenCalled();
  });

  it('B. el selector sigue editable y el segundo titular no se toca al cambiar el principal', () => {
    const onAdd = vi.fn();
    const onEliminar = vi.fn();
    renderAlta({ propietarios: [p1, p2, p3], onAdd, contexto: 'P1', onEliminar });

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
    expect(onEliminar).not.toHaveBeenCalled();
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

  it('UX-0A. el propietario abre el alta general con su titular preseleccionado, editable y con los tres ids', () => {
    const onAdd = vi.fn();
    renderAlta({
      propietarios: [p1, p2],
      onAdd,
      currentUser: usuario('PROPIETARIO', { propietarioId: 'P1' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Nuevo Inmueble/ }));
    irAFiscal();
    const selector = selectorTitular();
    expect(selector.value).toBe('P1');
    expect(selector.disabled).toBe(false);
    expect(Array.from(selector.options).some((opt) => opt.value === '')).toBe(true);
    expect((screen.getByPlaceholderText('Ej. Juan Pérez García o Arrendamientos SL') as HTMLInputElement).value).toBe('Nombre P1');
    expect((screen.getByPlaceholderText('Ej. 12345678Z o B-87654321') as HTMLInputElement).value).toBe('NIF-P1');
    expect((screen.getByPlaceholderText('Calle, número, ciudad') as HTMLInputElement).value).toBe('Calle P1, Madrid');

    irAGeneral();
    rellenarMinimo();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Inmueble' }));
    const creado = onAdd.mock.calls[0][0] as Inmueble;
    expect(creado.propietarioId).toBe('P1');
    expect(creado.propietarioPrincipalId).toBe('P1');
    expect(creado.datosFiscales?.propietarioPrincipal.propietarioId).toBe('P1');
    expect(creado.cuentaBancariaCobroId).toBe('cta-P1');
    expect(creado.ibanCobro).toBe('ES00P1');
  });

  it('UX-0A. el propietario puede cambiar el selector y el guardado sigue los tres ids nuevos', () => {
    const onAdd = vi.fn();
    renderAlta({
      propietarios: [p1, p2],
      onAdd,
      currentUser: usuario('PROPIETARIO', { propietarioId: 'P1' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Nuevo Inmueble/ }));
    irAFiscal();
    const selector = selectorTitular();
    fireEvent.change(selector, { target: { value: 'P2' } });
    expect(selector.value).toBe('P2');
    expect(selector.disabled).toBe(false);
    expect((screen.getByPlaceholderText('Ej. 12345678Z o B-87654321') as HTMLInputElement).value).toBe('NIF-P2');

    irAGeneral();
    rellenarMinimo();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Inmueble' }));
    const creado = onAdd.mock.calls[0][0] as Inmueble;
    expect(creado.propietarioId).toBe('P2');
    expect(creado.propietarioPrincipalId).toBe('P2');
    expect(creado.datosFiscales?.propietarioPrincipal.propietarioId).toBe('P2');
  });

  it('UX-0A. el administrador abre el alta general sin preselección y puede elegir a mano', () => {
    const onAdd = vi.fn();
    renderAlta({
      propietarios: [p1, p2],
      onAdd,
      currentUser: usuario('ADMINISTRADOR', { propietarioId: 'P1' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Nuevo Inmueble/ }));
    irAFiscal();
    expect(selectorTitular().value).toBe('');
    fireEvent.change(selectorTitular(), { target: { value: 'P2' } });

    irAGeneral();
    rellenarMinimo();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Inmueble' }));
    const creado = onAdd.mock.calls[0][0] as Inmueble;
    expect(creado.propietarioId).toBe('P2');
    expect(creado.propietarioPrincipalId).toBe('P2');
    expect(creado.datosFiscales?.propietarioPrincipal.propietarioId).toBe('P2');
  });

  it('UX-0A. el profesional no queda preseleccionado ni persiste un titular nuevo', () => {
    const onAdd = vi.fn();
    renderAlta({
      propietarios: [p1],
      onAdd,
      currentUser: usuario('PROFESIONAL', { profesionalId: 'PROF1', propietarioId: 'P1' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Nuevo Inmueble/ }));
    irAFiscal();
    expect(selectorTitular().value).toBe('');

    irAGeneral();
    rellenarMinimo();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Inmueble' }));
    const creado = onAdd.mock.calls[0][0] as Inmueble;
    expect(creado.propietarioId).toBeUndefined();
    expect(creado.propietarioPrincipalId).toBeUndefined();
    expect(creado.datosFiscales?.propietarioPrincipal.propietarioId).toBeUndefined();
  });

  it('UX-0A. un propietario cuyo id no está en la lista no se preselecciona', () => {
    const onAdd = vi.fn();
    renderAlta({
      propietarios: [p2],
      onAdd,
      currentUser: usuario('PROPIETARIO', { propietarioId: 'P1' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Nuevo Inmueble/ }));
    irAFiscal();
    expect(selectorTitular().value).toBe('');
  });

  it('UX-0A. el CTA del portal reutiliza el alta general ya preseleccionada', () => {
    const onAdd = vi.fn();
    const onCrear = vi.fn();
    const user = usuario('PROPIETARIO', { propietarioId: 'P1', nombre: 'Nombre P1', email: 'P1@correo.test' });
    const { rerender } = render(
      <>
        <PropietarioPortalSection
          currentUser={user}
          inmuebles={[]}
          profesionales={[]}
          contratos={[]}
          especialidades={[]}
          propietarios={[p1]}
          onOpenCrearProfesionalModal={() => undefined}
          onSaveProfesional={async () => undefined}
          onCrearInmueble={onCrear}
        />
        <InmueblesSection
          inmuebles={[]}
          candidatos={[]}
          propietarios={[p1, p2]}
          onSelectCandidate={() => undefined}
          onAddInmueble={onAdd}
          currentUser={user}
        />
      </>,
    );

    expect(screen.queryByText(/El administrador principal asignará/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: (nombre) => nombre === 'Nuevo inmueble' }));
    expect(onCrear).toHaveBeenCalledWith('P1');

    rerender(
      <>
        <PropietarioPortalSection
          currentUser={user}
          inmuebles={[]}
          profesionales={[]}
          contratos={[]}
          especialidades={[]}
          propietarios={[p1]}
          onOpenCrearProfesionalModal={() => undefined}
          onSaveProfesional={async () => undefined}
          onCrearInmueble={(propietarioId) => onCrear(propietarioId)}
        />
        <InmueblesSection
          inmuebles={[]}
          candidatos={[]}
          propietarios={[p1, p2]}
          onSelectCandidate={() => undefined}
          onAddInmueble={onAdd}
          propietarioContextoAltaId="P1"
          currentUser={user}
        />
      </>,
    );

    expect(screen.getByRole('heading', { name: /Añadir Nuevo Inmueble/ })).toBeTruthy();
    expect(selectorTitular().value).toBe('P1');
    expect(selectorTitular().disabled).toBe(false);
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
