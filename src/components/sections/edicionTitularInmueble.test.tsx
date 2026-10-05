/**
 * @vitest-environment jsdom
 *
 * Carga del titular al editar: propietarioId gana sobre el resto.
 * No cubre deleteField, copropiedad ni motores fiscales.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatosFiscalesInmueble, Inmueble, Propietario, PropietarioFiscal } from '../../types';
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

function renderEdicion(opts: { inmueble: Inmueble; propietarios: Propietario[]; onUpdate?: (inm: Inmueble) => void }) {
  return render(
    <InmueblesSection
      inmuebles={[opts.inmueble]}
      candidatos={[]}
      propietarios={opts.propietarios}
      onSelectCandidate={() => undefined}
      onUpdateInmueble={opts.onUpdate}
    />,
  );
}

function abrirFiscal() {
  fireEvent.click(screen.getByRole('button', { name: 'Fiscal' }));
}

function selectorTitular(): HTMLSelectElement {
  // ORDEN 4: la edición asigna TITULARES EXISTENTES; ya no hay «Asignación manual».
  return screen.getByRole('combobox', { name: 'Titular del inmueble' }) as HTMLSelectElement;
}

/** Resumen de sólo lectura de la ficha del titular elegido (fuente de los datos fiscales). */
function resumenTitular(): string {
  const nodo = screen.queryByTestId('resumen-titular-edicion');
  return nodo?.textContent || '';
}

/** ¿Se ofrece algún control para teclear datos fiscales del titular? Debe ser NO. */
function hayCamposFiscalesManuales(): boolean {
  return (
    screen.queryByPlaceholderText('Ej. Inmobiliaria SL o Juan Pérez') !== null ||
    screen.queryByPlaceholderText('Ej. 12345678Z o B-87654321') !== null
  );
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
    // La fuente es SIEMPRE la ficha: se muestra la entidad A, no el snapshot manual.
    expect(resumenTitular()).toContain('Nombre A');
    expect(resumenTitular()).toContain('NIF-A');
    expect(hayCamposFiscalesManuales()).toBe(false);
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
    expect(resumenTitular()).toContain('Nombre A');
    guardar();
    const guardado = onUpdate.mock.calls[0][0] as Inmueble;
    expect(guardado.propietarioId).toBe('A');
    expect(guardado.propietarioPrincipalId).toBe('A');
    // Las tres referencias apuntan a la ficha A y su instantánea fiscal se lee de ella.
    expect(guardado.datosFiscales?.propietarioPrincipal.propietarioId).toBe('A');
    expect(guardado.datosFiscales?.propietarioPrincipal.nombre).toBe('Nombre A');
    expect(guardado.datosFiscales?.propietarioPrincipal.nifDni).toBe('NIF-A');
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

  // K.2-C (H2): el caso crítico original protegía el CANÓNICO frente a B, y lo
  // sigue haciendo. Lo que cambia es que ya NO se iguala el principal fiscal al
  // canónico: `propietarioPrincipalId` puede divergir legítimamente (K.2-B1) y
  // una edición ordinaria debe conservarlo.
  it('el caso crítico: abrir y guardar sin tocar el selector no sustituye A por B ni pisa el principal declarado', () => {
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
    expect(resumenTitular()).toContain('Nombre A');
    guardar();
    const guardado = onUpdate.mock.calls[0][0] as Inmueble;
    // El canónico sigue siendo A: B no se lo queda (intención original intacta).
    expect(guardado.propietarioId).toBe('A');
    // H2: el principal fiscal declarado (B) se PRESERVA, no se convierte en A.
    expect(guardado.propietarioPrincipalId).toBe('B');
    // Y su instantánea fiscal acompaña al principal efectivo, no al canónico.
    expect(guardado.datosFiscales?.propietarioPrincipal.propietarioId).toBe('B');
    expect(guardado.datosFiscales?.propietarioPrincipal.nombre).toBe('Nombre B');
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
    expect(resumenTitular()).toContain('Nombre B');
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
    expect(resumenTitular()).toContain('Nombre B');
  });

  it('8. sin ninguna referencia el selector sigue vacío', () => {
    renderEdicion({
      propietarios: [a],
      inmueble: inmueble({ datosFiscales: datos(fiscal(undefined, '', '')) }),
    });
    abrirFiscal();
    expect(selectorTitular().value).toBe('');
  });

  // K.2-C: cambiar a mano el titular ECONÓMICO ya no es una edición ordinaria,
  // es una TRANSMISIÓN. Sin operación de transmisión disponible, el guardado se
  // rechaza por completo en vez de mover el canónico a medias.
  it('9 y 10. el cambio manual A → B NO se guarda como edición ordinaria (es transmisión) y no toca al segundo', () => {
    const onUpdate = vi.fn();
    renderEdicion({
      propietarios: [a, b, c],
      onUpdate,
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
    expect(resumenTitular()).toContain('Nombre B');
    expect(resumenTitular()).toContain('NIF-B');
    guardar();
    // Ninguna escritura ordinaria: la transmisión no se improvisa desde aquí.
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/transmisión patrimonial/i)).toBeTruthy();
  });
});
