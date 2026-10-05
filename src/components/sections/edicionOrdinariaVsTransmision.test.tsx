/**
 * @vitest-environment jsdom
 *
 * K.2-C — SEPARACIÓN ENTRE EDICIÓN ORDINARIA Y TRANSMISIÓN PATRIMONIAL.
 *
 * Dos contratos distintos sobre la misma pantalla:
 *
 *  · EDICIÓN ORDINARIA (dirección, precio, datos fiscales permitidos…):
 *    conserva `propietarioId` y conserva el `propietarioPrincipalId` ya
 *    declarado. Es la corrección del hallazgo H2: la edición venía igualando
 *    el principal fiscal al canónico y destruía una divergencia legítima
 *    (K.2-B1: Rules, `validarCoherenciaTitularidad` y `marcarTitularPrincipal`
 *    admiten que principal ≠ canónico).
 *
 *  · TRANSMISIÓN: cambiar el titular ECONÓMICO no se guarda como una edición;
 *    exige confirmación explícita y se delega en la operación atómica de
 *    K.2-B2. Esta pantalla no reproduce la lógica ni escribe el canónico.
 *
 * Fuera de alcance deliberado: Rules (no se tocan; son la autoridad y reservan
 * el cambio de canónico al master), `propietarioSecundarioId`, H5 y H6.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatosFiscalesInmueble, Inmueble, Propietario, PropietarioFiscal } from '../../types';
import type { ResultadoTransmision } from '../../lib/transmisionPatrimonialFirestore';
import { InmueblesSection } from './InmueblesSection';

function propietario(id: string): Propietario {
  return {
    id,
    nombre: `Nombre ${id}`,
    nifCif: `NIF-${id}`,
    tipoPropietario: 'persona_fisica',
    telefono: '600000000',
    email: `${id}@correo.test`,
    direccion: `Calle ${id}`,
    ciudad: 'Madrid',
    codigoPostal: '28001',
    cuentasBancarias: [{ id: `cta-${id}`, alias: 'Principal', iban: `ES00${id}`, esPrincipal: true }],
    fechaCreacion: '2026-01-01',
    fechaActualizacion: '2026-01-01',
  };
}

function fiscal(id: string | undefined, nombre: string): PropietarioFiscal {
  return { nombre, nifDni: `NIF-${id}`, direccion: 'Domicilio snapshot', propietarioId: id };
}

function datos(principal: PropietarioFiscal): DatosFiscalesInmueble {
  return { propietarioPrincipal: principal, tieneSegundoPropietario: false };
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

const a = propietario('A');
const b = propietario('B');

function renderSeccion(opts: {
  inmueble: Inmueble;
  onUpdate?: (inm: Inmueble) => void;
  onTransmitir?: (p: unknown) => Promise<ResultadoTransmision>;
}) {
  return render(
    <InmueblesSection
      inmuebles={[opts.inmueble]}
      candidatos={[]}
      propietarios={[a, b]}
      onSelectCandidate={() => undefined}
      onUpdateInmueble={opts.onUpdate}
      onTransmitirInmueble={opts.onTransmitir as never}
    />,
  );
}

const abrirFiscal = () => fireEvent.click(screen.getByRole('button', { name: 'Fiscal' }));
const abrirEdicion = () => fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
const guardar = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));
const selectorTitular = () => screen.getByRole('combobox', { name: 'Titular del inmueble' }) as HTMLSelectElement;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('K.2-C · A · edición ordinaria: H2', () => {
  // CASO 1 — coherente de partida: nada debe moverse.
  it('C1. propietarioId A y principal A → la edición ordinaria conserva A / A', () => {
    const onUpdate = vi.fn();
    renderSeccion({
      onUpdate,
      inmueble: inmueble({
        propietarioId: 'A',
        propietarioPrincipalId: 'A',
        datosFiscales: datos(fiscal('A', 'Nombre A')),
      }),
    });
    abrirFiscal();
    guardar();
    const guardado = onUpdate.mock.calls[0][0] as Inmueble;
    expect(guardado.propietarioId).toBe('A');
    expect(guardado.propietarioPrincipalId).toBe('A');
  });

  // CASO 2 — el corazón de H2: divergencia LEGÍTIMA que debe sobrevivir.
  it('C2. propietarioId A y principal B → la edición ordinaria conserva A / B (no iguala el principal)', () => {
    const onUpdate = vi.fn();
    renderSeccion({
      onUpdate,
      inmueble: inmueble({
        propietarioId: 'A',
        propietarioPrincipalId: 'B',
        datosFiscales: datos(fiscal('B', 'Nombre B')),
      }),
    });
    abrirFiscal();
    guardar();
    const guardado = onUpdate.mock.calls[0][0] as Inmueble;
    expect(guardado.propietarioId).toBe('A');
    expect(guardado.propietarioPrincipalId).toBe('B');
    // El snapshot fiscal acompaña al principal efectivo: no lo reemplaza A.
    expect(guardado.datosFiscales?.propietarioPrincipal.propietarioId).toBe('B');
  });

  // CASO 3 — sin principal explícito NO se inventa regla nueva: se conserva el
  // comportamiento ya existente y respaldado por los tests del repositorio
  // («solo propietarioId: guardar escribe las tres referencias en A»).
  it('C3. inmueble sin principal explícito → se conserva el comportamiento actual (principal = canónico)', () => {
    const onUpdate = vi.fn();
    renderSeccion({ onUpdate, inmueble: inmueble({ propietarioId: 'A' }) });
    abrirFiscal();
    guardar();
    const guardado = onUpdate.mock.calls[0][0] as Inmueble;
    expect(guardado.propietarioId).toBe('A');
    expect(guardado.propietarioPrincipalId).toBe('A');
  });

  // CASO 4 — editar datos NO patrimoniales no mueve el titular económico.
  it('C4. cambiar la dirección no cambia propietarioId ni el principal declarado', () => {
    const onUpdate = vi.fn();
    renderSeccion({
      onUpdate,
      inmueble: inmueble({
        propietarioId: 'A',
        propietarioPrincipalId: 'B',
        datosFiscales: datos(fiscal('B', 'Nombre B')),
      }),
    });
    abrirEdicion();
    fireEvent.change(screen.getByLabelText('Dirección del Inmueble *'), {
      target: { value: 'Calle Nueva 42' },
    });
    guardar();
    const guardado = onUpdate.mock.calls[0][0] as Inmueble;
    expect(guardado.direccion).toBe('Calle Nueva 42');
    expect(guardado.propietarioId).toBe('A');
    expect(guardado.propietarioPrincipalId).toBe('B');
  });

  // §5 — cambiar el principal fiscal NO es transmitir: una edición con
  // divergencia viva jamás debe disparar la operación patrimonial.
  it('C5. una edición ordinaria con principal divergente no invoca la transmisión', () => {
    const onUpdate = vi.fn();
    const onTransmitir = vi.fn();
    renderSeccion({
      onUpdate,
      onTransmitir: onTransmitir as never,
      inmueble: inmueble({ propietarioId: 'A', propietarioPrincipalId: 'B' }),
    });
    abrirFiscal();
    guardar();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onTransmitir).not.toHaveBeenCalled();
  });
});

describe('K.2-C · B · transmisión patrimonial desde la UI', () => {
  const inmuebleAB = () =>
    inmueble({
      propietarioId: 'A',
      propietarioPrincipalId: 'A',
      titularesIds: ['A'],
      datosFiscales: datos(fiscal('A', 'Nombre A')),
    });

  it('cambiar el titular económico exige confirmación explícita y delega en la operación atómica', async () => {
    const onUpdate = vi.fn();
    const onTransmitir = vi.fn(async (_peticion: unknown) => ({ ok: true }) as ResultadoTransmision);
    // Sin host de diálogo, `confirmar` degrada a window.prompt (documentado).
    const prompt = vi.fn(() => 'Escritura de compraventa');
    vi.stubGlobal('prompt', prompt);

    renderSeccion({ onUpdate, onTransmitir, inmueble: inmuebleAB() });
    abrirFiscal();
    fireEvent.change(selectorTitular(), { target: { value: 'B' } });
    guardar();

    await waitFor(() => expect(onTransmitir).toHaveBeenCalledTimes(1));
    // Se pidió confirmación ANTES de tocar nada.
    expect(prompt).toHaveBeenCalled();
    const peticion = onTransmitir.mock.calls[0][0] as { inmuebleId: string; adquirenteId: string; detalle?: string };
    expect(peticion.inmuebleId).toBe('inm-1');
    expect(peticion.adquirenteId).toBe('B');
    expect(peticion.detalle).toBe('Escritura de compraventa');
    // La pantalla NO escribe el canónico por su cuenta: eso es de la operación.
    for (const [arg] of onUpdate.mock.calls) {
      expect((arg as Inmueble).propietarioId).toBe('A');
      expect((arg as Inmueble).titularesIds).toEqual(['A']);
    }
  });

  it('si el usuario cancela la confirmación no se transmite ni se guarda nada', async () => {
    const onUpdate = vi.fn();
    const onTransmitir = vi.fn(async (_peticion: unknown) => ({ ok: true }) as ResultadoTransmision);
    vi.stubGlobal('prompt', vi.fn(() => null));

    renderSeccion({ onUpdate, onTransmitir, inmueble: inmuebleAB() });
    abrirFiscal();
    fireEvent.change(selectorTitular(), { target: { value: 'B' } });
    guardar();

    await waitFor(() => expect(onTransmitir).not.toHaveBeenCalled());
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('sin motivo escrito la transmisión no se ejecuta', async () => {
    const onUpdate = vi.fn();
    const onTransmitir = vi.fn(async (_peticion: unknown) => ({ ok: true }) as ResultadoTransmision);
    vi.stubGlobal('prompt', vi.fn(() => '   '));

    renderSeccion({ onUpdate, onTransmitir, inmueble: inmuebleAB() });
    abrirFiscal();
    fireEvent.change(selectorTitular(), { target: { value: 'B' } });
    guardar();

    await waitFor(() => expect(onTransmitir).not.toHaveBeenCalled());
    expect(onUpdate).not.toHaveBeenCalled();
  });

  // Espejo de las Rules: `propietarioCanonicoInalterado()` reserva el cambio de
  // canónico al master, así que a los demás perfiles no se les pasa la
  // operación. Antes de K.2-C ese caso escribía el canónico igualmente.
  it('sin operación de transmisión disponible se rechaza el guardado y se explica por qué', () => {
    const onUpdate = vi.fn();
    renderSeccion({ onUpdate, inmueble: inmuebleAB() });
    abrirFiscal();
    fireEvent.change(selectorTitular(), { target: { value: 'B' } });
    guardar();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/transmisión patrimonial/i)).toBeTruthy();
  });
});
