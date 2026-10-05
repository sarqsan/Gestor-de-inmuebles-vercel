/**
 * @vitest-environment jsdom
 *
 * ORDEN 4 · PROPIETARIOS/TITULARES COMO PUNTO OFICIAL + INMUEBLES CON TITULARES EXISTENTES
 * =========================================================================================
 * Cubre el alcance obligatorio de la intervención, sin duplicar los casos ya
 * existentes en `tests/alta-inmueble-titulares-existentes.test.tsx`:
 *
 *   A. Titulares: crear la ficha COMPLETA (personales + fiscales + contacto),
 *      editar conservando los datos fiscales, buscar, y no duplicar por NIF.
 *   B. Inmuebles: la edición no tiene ningún formulario de «segundo propietario»;
 *      el panel N-TITULARES vive en la ficha y respeta el alcance de lectura.
 *   C. Integridad: editar el inmueble NO modifica la ficha del titular ni copia
 *      su fiscalidad como entidad; editar el titular conserva sus relaciones (id).
 *   D. Legacy: el modelo binario se explica y se conserva (nunca se borra ni se
 *      crean registros legacy nuevos).
 *   E. Seguridad: espejos de las Rules (lectura de titularidades e aislamiento).
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { InmueblesSection } from '../src/components/sections/InmueblesSection';
import { PropietariosSection } from '../src/components/sections/PropietariosSection';
import { analizarLegadoTitularidad } from '../src/lib/legadoTitulares';
import { MENSAJE_TITULAR_NO_EXISTE_SECCION, titularDuplicado } from '../src/lib/titularesModelo';
import { puedeLeerTitularidadesInmueble, tieneEscrituraInmueble } from '../src/utils/permisosInmueble';
import type { Inmueble, Propietario } from '../src/types';

// El panel de titulares lee por claves deterministas con la capa de datos real.
// Se sustituye por un doble controlado para poder observar la relación servida.
vi.mock('../src/lib/titularidadesFirestore', () => ({
  subscribeTitularidadesEscopo: vi.fn(
    (_alcance: unknown, cb: (titulares: unknown[]) => void) => {
      cb([
        {
          id: 'inm-1__T1',
          inmuebleId: 'inm-1',
          propietarioId: 'T1',
          propietarioNombre: 'Titular Uno',
          porcentajeTitularidad: null,
          estado: 'VIGENTE',
          fechaInicio: '2026-01-01',
        },
      ]);
      return vi.fn();
    },
  ),
  guardarTitularidad: vi.fn(async () => true),
  cerrarTitularidad: vi.fn(async () => true),
  actualizarPorcentajeTitularidad: vi.fn(async () => true),
  marcarTitularPrincipal: vi.fn(async () => true),
}));

function titular(id: string, extra: Partial<Propietario> = {}): Propietario {
  return {
    id,
    nombre: `Titular ${id}`,
    nifCif: `NIF-${id}`,
    tipoPropietario: 'persona_fisica',
    telefono: `60000000${id}`,
    email: `${id.toLowerCase()}@correo.test`,
    direccion: `Calle ${id} 1`,
    ciudad: 'Madrid',
    codigoPostal: '28001',
    provincia: 'Madrid',
    cuentasBancarias: [
      { id: `cta-${id}`, alias: 'Principal', iban: `ES00${id}`, esPrincipal: true },
    ],
    fechaCreacion: '2026-01-01',
    fechaActualizacion: '2026-01-01',
    ...extra,
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

function renderEdicion(opts: {
  inmueble: Inmueble;
  propietarios: Propietario[];
  onUpdate?: (inm: Inmueble) => void;
  puedeLeer?: () => boolean;
}) {
  return render(
    <InmueblesSection
      inmuebles={[opts.inmueble]}
      candidatos={[]}
      propietarios={opts.propietarios}
      onSelectCandidate={() => undefined}
      onUpdateInmueble={opts.onUpdate}
      puedeLeerTitularidades={opts.puedeLeer}
    />,
  );
}

const abrirEdicion = () => fireEvent.click(screen.getByTitle('Editar inmueble'));
const irAFiscalEdicion = () =>
  fireEvent.click(screen.getByRole('button', { name: /Apartado Fiscal/ }));
const irATitulares = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Titulares del inmueble' }));
const guardarEdicion = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));

afterEach(() => cleanup());

describe('A · Titulares: la sección oficial crea la ficha completa', () => {
  it('crea un titular con datos personales, fiscales y de contacto en un solo formulario', () => {
    const onSave = vi.fn();
    render(
      <PropietariosSection
        propietarios={[]}
        inmuebles={[]}
        onSavePropietario={onSave}
        onDeletePropietario={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Crear titular/ }));
    fireEvent.change(screen.getByPlaceholderText('Ej: Manuel Gómez Rodríguez'), {
      target: { value: 'Ana Titular' },
    });
    fireEvent.change(screen.getByPlaceholderText('Ej: 12345678Z o B-12345678'), {
      target: { value: '12345678z' },
    });
    fireEvent.change(screen.getByPlaceholderText('Ej: +34 600 000 000'), {
      target: { value: '600111222' },
    });
    fireEvent.change(screen.getByPlaceholderText('Ej: arrendador@email.com'), {
      target: { value: 'ana@correo.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /2\. Domicilio/ }));
    fireEvent.change(screen.getByPlaceholderText('Ej: Calle Gran Vía 28, 4º B'), {
      target: { value: 'Calle Mayor 1' },
    });
    fireEvent.change(screen.getByPlaceholderText('28013'), { target: { value: '28001' } });
    fireEvent.change(screen.getAllByPlaceholderText('Madrid')[0], {
      target: { value: 'Madrid' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Crear Propietario/ }));

    expect(onSave).toHaveBeenCalledTimes(1);
    // Un único modelo completo: no existe «titular básico» ni conversión posterior.
    expect(onSave.mock.calls[0][0]).toMatchObject({
      nombre: 'Ana Titular',
      nifCif: '12345678Z',
      tipoPropietario: 'persona_fisica',
      telefono: '600111222',
      email: 'ana@correo.test',
      direccion: 'Calle Mayor 1',
      codigoPostal: '28001',
      ciudad: 'Madrid',
    });
  });

  it('editar la ficha conserva los datos fiscales que no se tocan', () => {
    const p1 = titular('P1', { nifCif: '12345678Z' });
    const onSave = vi.fn();
    render(
      <PropietariosSection
        propietarios={[p1]}
        inmuebles={[]}
        onSavePropietario={onSave}
        onDeletePropietario={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTitle('Editar titular'));
    fireEvent.change(screen.getByPlaceholderText('Ej: +34 600 000 000'), {
      target: { value: '699999999' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar Cambios/ }));

    const guardado = onSave.mock.calls[0][0] as Propietario;
    expect(guardado.id).toBe('P1'); // misma ficha: las relaciones siguen apuntando aquí
    expect(guardado.telefono).toBe('699999999');
    expect(guardado.nifCif).toBe('12345678Z');
    expect(guardado.direccion).toBe('Calle P1 1');
    expect(guardado.ciudad).toBe('Madrid');
    expect(guardado.codigoPostal).toBe('28001');
    expect(guardado.cuentasBancarias).toHaveLength(1);
    expect(guardado.fechaCreacion).toBe('2026-01-01');
  });

  it('no crea una segunda ficha con el mismo NIF: ofrece abrir la existente', () => {
    const p1 = titular('P1', { nifCif: '12345678Z' });
    const onSave = vi.fn();
    render(
      <PropietariosSection
        propietarios={[p1]}
        inmuebles={[]}
        onSavePropietario={onSave}
        onDeletePropietario={() => undefined}
      />,
    );

    expect(titularDuplicado([p1], { nifCif: '12345678-z' })?.id).toBe('P1');

    fireEvent.click(screen.getByRole('button', { name: /Crear titular/ }));
    fireEvent.change(screen.getByPlaceholderText('Ej: Manuel Gómez Rodríguez'), {
      target: { value: 'Otra Persona' },
    });
    fireEvent.change(screen.getByPlaceholderText('Ej: 12345678Z o B-12345678'), {
      target: { value: '12345678Z' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Crear Propietario/ }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('titular-duplicado').textContent).toContain('Titular P1');
  });

  it('sin permiso de gestión la sección queda en consulta y lo explica', () => {
    render(
      <PropietariosSection
        propietarios={[titular('P1')]}
        inmuebles={[]}
        onSavePropietario={() => undefined}
        onDeletePropietario={() => undefined}
        puedeGestionar={false}
      />,
    );

    expect(screen.getByTestId('propietarios-solo-consulta')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Crear titular/ })).toBeNull();
    expect(screen.queryByTitle('Editar titular')).toBeNull();
  });
});

describe('B · Inmuebles: sólo titulares existentes y panel N-TITULARES en la ficha', () => {
  it('la edición no ofrece ningún formulario de «segundo propietario» y explica el camino oficial', () => {
    // Inmueble heredado: su titular principal se guardó tecleado, sin ficha.
    renderEdicion({
      inmueble: inmueble({
        datosFiscales: { propietarioPrincipal: { nombre: 'Arrendador heredado', nifDni: '99999999R', direccion: 'Domicilio fiscal' } },
      }),
      propietarios: [titular('T1')],
    });
    abrirEdicion();
    irAFiscalEdicion();

    expect(screen.queryByText(/Segundo Propietario/i)).toBeNull();
    expect(screen.queryByText(/Co-Arrendador/i)).toBeNull();
    expect(screen.queryByPlaceholderText('Ej. Inmobiliaria SL o Juan Pérez')).toBeNull();
    expect(screen.getByTestId('edicion-titular')).toBeTruthy();
    // Si falta el titular, se explica dónde se crea (mensaje oficial).
    expect(screen.getByText(MENSAJE_TITULAR_NO_EXISTE_SECCION)).toBeTruthy();
  });

  it('el panel de titulares se monta en la ficha, muestra la participación y respeta la lectura', () => {
    const { unmount } = renderEdicion({
      inmueble: inmueble({ propietarioId: 'T1', titularesIds: ['T1'] }),
      propietarios: [titular('T1')],
      puedeLeer: () => true,
    });
    abrirEdicion();
    irATitulares();

    expect(screen.getByTestId('panel-titularidades')).toBeTruthy();
    expect(screen.getByText(/Titular Uno/)).toBeTruthy();
    // Sin porcentaje declarado: PENDIENTE. Nunca se inventa un reparto.
    expect(screen.getAllByText(/Pendiente/i).length).toBeGreaterThan(0);
    unmount();

    renderEdicion({
      inmueble: inmueble({ propietarioId: 'T1', titularesIds: ['T1'] }),
      propietarios: [titular('T1')],
      puedeLeer: () => false,
    });
    abrirEdicion();
    irATitulares();

    expect(screen.getByTestId('titularidades-sin-lectura')).toBeTruthy();
    expect(screen.queryByTestId('panel-titularidades')).toBeNull();
  });

  it('editar el inmueble cambia la relación pero NO copia ni mutila la ficha del titular', () => {
    const a = titular('A');
    const b = titular('B');
    const originalA = JSON.parse(JSON.stringify(a)) as Propietario;
    const onUpdate = vi.fn();
    renderEdicion({
      inmueble: inmueble({
        propietarioId: 'A',
        propietarioPrincipalId: 'A',
        datosFiscales: {
          propietarioPrincipal: { nombre: 'Titular A', nifDni: 'NIF-A', propietarioId: 'A', direccion: 'Domicilio fiscal' },
        },
      }),
      propietarios: [a, b],
      onUpdate,
    });

    abrirEdicion();
    irAFiscalEdicion();
    fireEvent.change(screen.getByRole('combobox', { name: 'Titular del inmueble' }), {
      target: { value: 'B' },
    });
    guardarEdicion();

    const guardado = onUpdate.mock.calls[0][0] as Inmueble;
    expect(guardado.propietarioId).toBe('B');
    expect(guardado.propietarioPrincipalId).toBe('B');
    expect(guardado.datosFiscales?.propietarioPrincipal.propietarioId).toBe('B');
    // Los datos fiscales salen de la ficha de B (nunca tecleados en el inmueble).
    expect(guardado.datosFiscales?.propietarioPrincipal.nombre).toBe('Titular B');
    // La ficha de A queda intacta: el inmueble no la edita ni la reescribe.
    expect(a).toEqual(originalA);
  });

  it('el modelo binario heredado se muestra y se conserva sin cambios al guardar', () => {
    const onUpdate = vi.fn();
    const legado = inmueble({
      propietarioId: 'A',
      propietarioSecundarioId: 'C',
      datosFiscales: {
        tieneSegundoPropietario: true,
        segundoPropietario: { nombre: 'Segundo C', nifDni: 'NIF-C', propietarioId: 'C', direccion: 'Domicilio fiscal' },
        propietarioPrincipal: { nombre: 'Titular A', nifDni: 'NIF-A', propietarioId: 'A', direccion: 'Domicilio fiscal' },
      },
    });
    renderEdicion({ inmueble: legado, propietarios: [titular('A'), titular('C')], onUpdate });

    abrirEdicion();
    irAFiscalEdicion();
    expect(screen.getByTestId('legado-titularidad')).toBeTruthy();
    guardarEdicion();

    const guardado = onUpdate.mock.calls[0][0] as Inmueble;
    // Nada se borra: el histórico sigue ahí y no se crea ningún dato legacy nuevo.
    expect(guardado.propietarioSecundarioId).toBe('C');
    expect(guardado.datosFiscales?.tieneSegundoPropietario).toBe(true);
    expect(guardado.datosFiscales?.segundoPropietario?.nombre).toBe('Segundo C');
  });
});

describe('D · Legacy: análisis no destructivo del modelo binario', () => {
  it('clasifica lo que hay sin migrar, sin borrar y sin inventar personas', () => {
    const titulares = [titular('A'), titular('C')];

    const sinLegado = analizarLegadoTitularidad(inmueble({ propietarioId: 'A' }), { titulares });
    expect(sinLegado.tieneLegado).toBe(false);

    const principalSinFicha = analizarLegadoTitularidad(
      inmueble({
        datosFiscales: { propietarioPrincipal: { nombre: 'Nombre tecleado', nifDni: 'X123', direccion: 'Domicilio fiscal' } },
      }),
      { titulares },
    );
    expect(principalSinFicha.tieneLegado).toBe(true);
    expect(principalSinFicha.principalSinFicha).toBe(true);

    const segundoSinFicha = analizarLegadoTitularidad(
      inmueble({
        datosFiscales: {
          propietarioPrincipal: { nombre: 'Principal sin ficha', nifDni: '', direccion: 'Calle X' },
          tieneSegundoPropietario: true,
          segundoPropietario: { nombre: 'Cotitular tecleado', nifDni: '99999999R', direccion: 'Domicilio fiscal' },
        },
      }),
      { titulares },
    );
    expect(segundoSinFicha.segundoSinFicha).toBe(true);
    expect(segundoSinFicha.requiereMigracionManual).toBe(true);

    const segundoConFicha = analizarLegadoTitularidad(
      inmueble({
        propietarioSecundarioId: 'C',
        datosFiscales: {
          propietarioPrincipal: { nombre: 'Principal sin ficha', nifDni: '', direccion: 'Calle X' },
          tieneSegundoPropietario: true,
          segundoPropietario: { nombre: 'Titular C', nifDni: 'NIF-C', propietarioId: 'C', direccion: 'Domicilio fiscal' },
        },
      }),
      { titulares },
    );
    expect(segundoConFicha.segundoSinFicha).toBe(false);
    expect(segundoConFicha.requiereMigracionManual).toBe(false);
  });
});

describe('E · Seguridad: espejos de las Rules', () => {
  it('la lectura de titularidades exige alcance propio; ver el inmueble no basta', () => {
    const inm = inmueble({
      propietarioId: 'P1',
      titularesIds: ['P1', 'P2'],
    });

    expect(puedeLeerTitularidadesInmueble({ esMaster: true }, inm)).toBe(true);
    expect(puedeLeerTitularidadesInmueble({ esMaster: false, tipoPerfil: 'ADMINISTRADOR' }, inm)).toBe(true);

    // Gestor con cartera de lectura / escritura sobre el propietario del inmueble.
    expect(
      puedeLeerTitularidadesInmueble(
        { esMaster: false, tipoPerfil: 'GESTOR', propietariosGestionadosLectura: ['P1'] },
        inm,
      ),
    ).toBe(true);
    expect(puedeLeerTitularidadesInmueble({ esMaster: false, tipoPerfil: 'GESTOR' }, inm)).toBe(false);

    // Cotitular indexado: sí. Titular ajeno: no.
    expect(
      puedeLeerTitularidadesInmueble(
        { esMaster: false, tipoPerfil: 'PROPIETARIO', propietarioId: 'P2' },
        inm,
      ),
    ).toBe(true);
    expect(
      puedeLeerTitularidadesInmueble(
        { esMaster: false, tipoPerfil: 'PROPIETARIO', propietarioId: 'P9' },
        inm,
      ),
    ).toBe(false);

    // `inmuebleIds` autoriza a VER el inmueble, pero no a leer sus titularidades.
    expect(
      puedeLeerTitularidadesInmueble(
        { esMaster: false, tipoPerfil: 'GESTOR', inmuebleIdsAutorizados: ['inm-1'] },
        inm,
      ),
    ).toBe(false);
  });

  it('la escritura de titularidades se limita a quien ya puede escribir el inmueble', () => {
    const inm = inmueble({ propietarioId: 'P1' });
    expect(tieneEscrituraInmueble({ esMaster: false, tipoPerfil: 'GESTOR' }, inm)).toBe(false);
    expect(
      tieneEscrituraInmueble(
        { esMaster: false, tipoPerfil: 'GESTOR', propietariosGestionadosEscritura: ['P1'] },
        inm,
      ),
    ).toBe(true);
    expect(
      tieneEscrituraInmueble(
        { esMaster: false, tipoPerfil: 'GESTOR', propietariosGestionadosLectura: ['P1'] },
        inm,
      ),
    ).toBe(false);
  });
});
