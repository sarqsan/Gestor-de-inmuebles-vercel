/**
 * @vitest-environment jsdom
 *
 * Carga del titular al editar: propietarioId gana sobre el resto.
 * La desactivación del segundo titular pide deleteField solo de sus dos campos.
 * No cubre copropiedad ni motores fiscales.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { deleteField } from 'firebase/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatosFiscalesInmueble, Inmueble, Propietario, PropietarioFiscal } from '../../types';
import type { PayloadEliminacionTitularSecundario } from '../../lib/eliminacionTitularSecundario';
import { InmueblesSection } from './InmueblesSection';

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

function fiscal(id: string | undefined, nombre = 'Snapshot manual', nif = 'NIF-SNAPSHOT'): PropietarioFiscal {
  return {
    nombre,
    nifDni: nif,
    direccion: 'Domicilio snapshot',
    telefono: '611111111',
    email: 'snapshot@correo.test',
    propietarioId: id,
  };
}

function inmueble(extra: Partial<Inmueble> = {}): Inmueble {
  return {
    id: 'inm-1',
    direccion: 'Calle Mayor 1',
    ciudad: 'Sevilla',
    precio: 900,
    estado: 'disponible',
    habitaciones: 2,
    banos: 1,
    superficie: 70,
    candidatosCount: 0,
    fianzaMeses: 1,
    ...extra,
  };
}

function datos(principal?: PropietarioFiscal, segundo?: PropietarioFiscal, activo = false): DatosFiscalesInmueble {
  return {
    propietarioPrincipal: principal || fiscal(undefined, ''),
    tieneSegundoPropietario: activo,
    segundoPropietario: segundo,
  };
}

function renderEdicion(opts: {
  inmueble: Inmueble;
  propietarios: Propietario[];
  onUpdate?: (inm: Inmueble) => void;
  onEliminar?: (inmuebleId: string, campos: PayloadEliminacionTitularSecundario) => void;
}) {
  return render(
    <InmueblesSection
      inmuebles={[opts.inmueble]}
      candidatos={[]}
      propietarios={opts.propietarios}
      onSelectCandidate={() => undefined}
      onUpdateInmueble={opts.onUpdate}
      onEliminarTitularSecundario={opts.onEliminar}
    />,
  );
}

function abrirFiscal() {
  fireEvent.click(screen.getByRole('button', { name: 'Fiscal' }));
}

function selectorTitular(): HTMLSelectElement {
  const el = screen.getAllByRole('combobox').find((node) =>
    Array.from((node as HTMLSelectElement).options).some((opt) => opt.textContent?.includes('Asignación manual')),
  );
  if (!el) throw new Error('No está el selector de arrendador principal');
  return el as HTMLSelectElement;
}

function guardar() {
  fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));
}

describe('edición: carga del titular principal', () => {
  afterEach(() => cleanup());

  const a = propietario('A');
  const b = propietario('B');
  const c = propietario('C');

  it('1. titular único coherente: el selector muestra A', () => {
    renderEdicion({
      propietarios: [a, b],
      inmueble: inmueble({
        propietarioId: 'A',
        propietarioPrincipalId: 'A',
        datosFiscales: datos(fiscal('A', 'Snapshot A', 'NIF-A')),
      }),
    });
    abrirFiscal();
    expect(selectorTitular().value).toBe('A');
    expect((screen.getByPlaceholderText('Ej. Inmobiliaria SL o Juan Pérez') as HTMLInputElement).value).toBe('Snapshot A');
  });

  it('2 y 4. solo propietarioId: muestra A y guardar escribe las tres referencias en A', () => {
    const onUpdate = vi.fn();
    renderEdicion({
      propietarios: [a, b],
      onUpdate,
      inmueble: inmueble({
        propietarioId: 'A',
        datosFiscales: datos(fiscal(undefined, 'Snapshot manual', '99999999Z')),
      }),
    });
    abrirFiscal();
    expect(selectorTitular().value).toBe('A');
    expect((screen.getByPlaceholderText('Ej. Inmobiliaria SL o Juan Pérez') as HTMLInputElement).value).toBe('Snapshot manual');
    guardar();
    const guardado = onUpdate.mock.calls[0][0] as Inmueble;
    expect(guardado.propietarioId).toBe('A');
    expect(guardado.propietarioPrincipalId).toBe('A');
    expect(guardado.datosFiscales?.propietarioPrincipal.propietarioId).toBe('A');
    expect(guardado.datosFiscales?.propietarioPrincipal.nombre).toBe('Snapshot manual');
  });

  it('3. propietarioId A y principal B: el selector muestra A, no B', () => {
    renderEdicion({
      propietarios: [a, b],
      inmueble: inmueble({
        propietarioId: 'A',
        propietarioPrincipalId: 'B',
        datosFiscales: datos(fiscal('B', 'Nombre fiscal B', b.nifCif)),
      }),
    });
    abrirFiscal();
    expect(selectorTitular().value).toBe('A');
  });

  it('el caso crítico: abrir y guardar sin tocar el selector no sustituye A por B', () => {
    const onUpdate = vi.fn();
    renderEdicion({
      propietarios: [a, b],
      onUpdate,
      inmueble: inmueble({
        propietarioId: 'A',
        propietarioPrincipalId: 'B',
        datosFiscales: datos(fiscal('B', 'Snapshot de B', b.nifCif)),
      }),
    });
    abrirFiscal();
    expect(selectorTitular().value).toBe('A');
    guardar();
    const guardado = onUpdate.mock.calls[0][0] as Inmueble;
    expect(guardado.propietarioId).toBe('A');
    expect(guardado.propietarioPrincipalId).toBe('A');
    expect(guardado.datosFiscales?.propietarioPrincipal.propietarioId).toBe('A');
    expect(guardado.datosFiscales?.propietarioPrincipal.nombre).toBe('Snapshot de B');
  });

  it('5. sin propietarioId, el principal es el fallback', () => {
    renderEdicion({
      propietarios: [a, b],
      inmueble: inmueble({
        propietarioPrincipalId: 'B',
        datosFiscales: datos(fiscal('A', 'No debe ganar', a.nifCif)),
      }),
    });
    abrirFiscal();
    expect(selectorTitular().value).toBe('B');
  });

  it('6. sin ids de primer nivel, gana el id fiscal', () => {
    renderEdicion({
      propietarios: [a, b],
      inmueble: inmueble({
        datosFiscales: datos(fiscal('B', 'Snapshot fiscal', 'NO-COINCIDE')),
      }),
    });
    abrirFiscal();
    expect(selectorTitular().value).toBe('B');
    expect((screen.getByPlaceholderText('Ej. Inmobiliaria SL o Juan Pérez') as HTMLInputElement).value).toBe('Snapshot fiscal');
  });

  it('7. el NIF solo se usa si no hay ningún id', () => {
    renderEdicion({
      propietarios: [a, b],
      inmueble: inmueble({
        datosFiscales: datos(fiscal(undefined, 'Solo NIF', b.nifCif.toLowerCase())),
      }),
    });
    abrirFiscal();
    expect(selectorTitular().value).toBe('B');
    expect((screen.getByPlaceholderText('Ej. Inmobiliaria SL o Juan Pérez') as HTMLInputElement).value).toBe('Solo NIF');
  });

  it('8. sin ninguna referencia el selector sigue vacío', () => {
    renderEdicion({
      propietarios: [a],
      inmueble: inmueble({ datosFiscales: datos(fiscal(undefined, '', '')) }),
    });
    abrirFiscal();
    expect(selectorTitular().value).toBe('');
  });

  it('9 y 10. el cambio manual A → B actualiza las tres referencias y no toca al segundo', () => {
    const onUpdate = vi.fn();
    const onEliminar = vi.fn();
    renderEdicion({
      propietarios: [a, b, c],
      onUpdate,
      onEliminar,
      inmueble: inmueble({
        propietarioId: 'A',
        propietarioPrincipalId: 'B',
        propietarioSecundarioId: 'C',
        datosFiscales: datos(
          fiscal('B', 'Snapshot de B', b.nifCif),
          fiscal('C', 'Segundo C', c.nifCif),
          true,
        ),
      }),
    });
    abrirFiscal();
    expect(selectorTitular().value).toBe('A');
    fireEvent.change(selectorTitular(), { target: { value: 'B' } });
    expect((screen.getByPlaceholderText('Ej. Inmobiliaria SL o Juan Pérez') as HTMLInputElement).value).toBe('Nombre B');
    guardar();
    const guardado = onUpdate.mock.calls[0][0] as Inmueble;
    expect(guardado.propietarioId).toBe('B');
    expect(guardado.propietarioPrincipalId).toBe('B');
    expect(guardado.datosFiscales?.propietarioPrincipal.propietarioId).toBe('B');
    expect(guardado.datosFiscales?.propietarioPrincipal.nombre).toBe('Nombre B');
    expect(guardado.propietarioSecundarioId).toBe('C');
    expect(guardado.datosFiscales?.tieneSegundoPropietario).toBe(true);
    expect(guardado.datosFiscales?.segundoPropietario?.propietarioId).toBe('C');
    expect(guardado.datosFiscales?.segundoPropietario?.nombre).toBe('Segundo C');
    expect(onEliminar).not.toHaveBeenCalled();
  });
});

describe('edición: desactivar el segundo titular', () => {
  afterEach(() => cleanup());

  const p1 = propietario('P1');
  const p2 = propietario('P2');

  function conSegundo(): Inmueble {
    return inmueble({
      propietarioId: 'P1',
      propietarioPrincipalId: 'P1',
      propietarioSecundarioId: 'P2',
      datosFiscales: datos(
        fiscal('P1', 'Snapshot P1', p1.nifCif),
        fiscal('P2', 'Snapshot P2', p2.nifCif),
        true,
      ),
    });
  }

  it('desmarcar pide deleteField de los dos campos y deja la bandera en false', () => {
    const onUpdate = vi.fn();
    const onEliminar = vi.fn();
    renderEdicion({
      propietarios: [p1, p2],
      onUpdate,
      onEliminar,
      inmueble: conSegundo(),
    });
    abrirFiscal();
    const casilla = screen.getByRole('checkbox', { name: 'Inmueble con Segundo Propietario / Co-Arrendador' });
    expect((casilla as HTMLInputElement).checked).toBe(true);
    fireEvent.click(casilla);
    guardar();

    expect(onEliminar).toHaveBeenCalledTimes(1);
    const [id, campos] = onEliminar.mock.calls[0] as [string, PayloadEliminacionTitularSecundario];
    expect(id).toBe('inm-1');
    expect(campos.propietarioSecundarioId).toEqual(deleteField());
    expect(campos['datosFiscales.segundoPropietario']).toEqual(deleteField());
    expect(campos['datosFiscales.tieneSegundoPropietario']).toBe(false);
    expect(campos).not.toHaveProperty('datosFiscales');
    expect(Object.keys(campos).sort()).toEqual([
      'datosFiscales.segundoPropietario',
      'datosFiscales.tieneSegundoPropietario',
      'propietarioSecundarioId',
    ]);

    const guardado = onUpdate.mock.calls[0][0] as Inmueble;
    expect(guardado.propietarioId).toBe('P1');
    expect(guardado.propietarioPrincipalId).toBe('P1');
    expect(guardado.datosFiscales?.propietarioPrincipal.propietarioId).toBe('P1');
    expect(guardado.datosFiscales?.propietarioPrincipal.nombre).toBe('Snapshot P1');
    expect(guardado.propietarioSecundarioId).toBeUndefined();
    expect(guardado.datosFiscales?.segundoPropietario).toBeUndefined();
    expect(guardado.datosFiscales?.tieneSegundoPropietario).toBe(false);
  });

  it('con la casilla activa, editar otro dato no emite deleteField y conserva al segundo', () => {
    const onUpdate = vi.fn();
    const onEliminar = vi.fn();
    renderEdicion({
      propietarios: [p1, p2],
      onUpdate,
      onEliminar,
      inmueble: conSegundo(),
    });
    abrirFiscal();
    const casilla = screen.getByRole('checkbox', { name: 'Inmueble con Segundo Propietario / Co-Arrendador' });
    expect((casilla as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('Ej. Calificación E (145 kWh/m² año)'), {
      target: { value: 'Calificación C' },
    });
    guardar();

    expect(onEliminar).not.toHaveBeenCalled();
    const guardado = onUpdate.mock.calls[0][0] as Inmueble;
    expect(guardado.propietarioSecundarioId).toBe('P2');
    expect(guardado.datosFiscales?.segundoPropietario?.propietarioId).toBe('P2');
    expect(guardado.datosFiscales?.segundoPropietario?.nombre).toBe('Snapshot P2');
    expect(guardado.datosFiscales?.tieneSegundoPropietario).toBe(true);
    expect(guardado.datosFiscales?.certificadoEnergetico).toBe('Calificación C');
    expect(guardado.propietarioId).toBe('P1');
  });

  it('sin segundo titular previo, guardar no emite deleteField', () => {
    const onUpdate = vi.fn();
    const onEliminar = vi.fn();
    renderEdicion({
      propietarios: [p1, p2],
      onUpdate,
      onEliminar,
      inmueble: inmueble({
        propietarioId: 'P1',
        propietarioPrincipalId: 'P1',
        datosFiscales: datos(fiscal('P1', 'Snapshot P1', p1.nifCif)),
      }),
    });
    abrirFiscal();
    guardar();
    expect(onEliminar).not.toHaveBeenCalled();
    const guardado = onUpdate.mock.calls[0][0] as Inmueble;
    expect(guardado.propietarioId).toBe('P1');
    expect(guardado.propietarioSecundarioId).toBeUndefined();
    expect(guardado.datosFiscales?.tieneSegundoPropietario).toBe(false);
  });
});
