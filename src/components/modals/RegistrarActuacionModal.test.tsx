// @vitest-environment jsdom
/**
 * BLOQUE 5 — escritor real de mantenimiento (`RegistrarActuacionModal`).
 * ---------------------------------------------------------------------------
 * Prueba el problema funcional detectado: el apunte contable de una actuación
 * se creaba con `gasto_mant_<tarea>_<Date.now()>` y SIN `origenId`, de modo que
 * no era localizable por su operación y podía duplicarse al repetir el guardado.
 *
 * Ahora el modal usa el puente único de operaciones: `origen` MANTENIMIENTO_
 * PREVENTIVO + `origenId` de la tarea, ID determinista por (tarea, actuación) y
 * reutilización del gasto que el propio modelo ya asocia a la actuación.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../lib/firebase', () => ({
  saveGastoFirestore: vi.fn(async () => undefined),
  saveGarantiaReparacionFirestore: vi.fn(async () => undefined),
}));

import { saveGastoFirestore, saveGarantiaReparacionFirestore } from '../../lib/firebase';
import type { Inmueble, TareaMantenimiento, UsuarioApp } from '../../types';
import { esGastoDeducible } from '../../utils/deducibilidadEngine';
import { buscarGastoDeOperacion, esGastoDeOperacion } from '../../utils/operacionGastoEngine';
import { RegistrarActuacionModal } from './RegistrarActuacionModal';

const INMUEBLE = {
  id: 'inm-1',
  direccion: 'Calle ficticia 1',
  propietarioId: 'prop-1',
  propietarioPrincipalId: 'prop-1',
} as Inmueble;

const OTRO_INMUEBLE = {
  id: 'inm-1',
  direccion: 'Calle ficticia 1',
  propietarioId: 'prop-ajeno',
} as Inmueble;

const USUARIO: UsuarioApp = {
  id: 'usuario-1',
  nombre: 'Gestora ficticia',
  email: 'gestora@example.invalid',
  tipoPerfil: 'ADMINISTRADOR',
  estado: 'ACTIVO',
} as UsuarioApp;

function tarea(overrides: Partial<TareaMantenimiento> = {}): TareaMantenimiento {
  return {
    id: 'mant_1',
    inmuebleId: 'inm-1',
    propietarioId: 'prop-1',
    titulo: 'Revisión anual de la caldera',
    periodicidad: 'ANUAL',
    activa: true,
    proximaFecha: '2027-03-02',
    costeEstimado: 120,
    ultimaOrdenTrabajoId: 'ot-1',
    ultimaIncidenciaId: 'incidencia-demo',
    profesionalPreferidoId: 'proveedor-1',
    profesionalPreferidoNombre: 'Taller ficticio',
    createdAt: '2025-03-01T00:00:00.000Z',
    updatedAt: '2025-03-01T00:00:00.000Z',
    ...overrides,
  };
}

async function registrar(container: HTMLElement, fecha: string) {
  fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: fecha } });
  fireEvent.click(screen.getByText('Confirmar Actuación Realizada').closest('button')!);
}

describe('BLOQUE 5 · RegistrarActuacionModal (mantenimiento → gasto trazable e idempotente)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('genera el gasto con origen, origenId, categoría, importe y vínculos de la tarea', async () => {
    const onSave = vi.fn(async (_tarea: TareaMantenimiento) => undefined);
    const { container } = render(
      <RegistrarActuacionModal isOpen onClose={() => {}} onSave={onSave} tarea={tarea()} inmueble={INMUEBLE} currentUser={USUARIO} />
    );
    await registrar(container, '2026-03-02');

    await waitFor(() => expect(saveGastoFirestore).toHaveBeenCalledTimes(1));
    const gasto = vi.mocked(saveGastoFirestore).mock.calls[0][0];
    expect(gasto).toMatchObject({
      id: 'gop_mantenimiento_mant_1_2026-03-02',
      inmuebleId: 'inm-1',
      propietarioId: 'prop-1',
      tipo: 'EXPLOTACION',
      categoria: 'MANTENIMIENTO',
      concepto: 'Mantenimiento: Revisión anual de la caldera (Taller ficticio)',
      importe: 120,
      estado: 'PAGADO',
      fechaDevengo: '2026-03-02',
      fechaPago: '2026-03-02',
      periodoMesAnio: '2026-03',
      aCargoDe: 'arrendador',
      deducible: true,
      proveedor: 'Taller ficticio',
      proveedorId: 'proveedor-1',
      ordenTrabajoId: 'ot-1',
      incidenciaId: 'incidencia-demo',
      origen: 'MANTENIMIENTO_PREVENTIVO',
      origenId: 'mant_1',
    });
    expect(esGastoDeducible(gasto)).toBe(true);
    expect(esGastoDeOperacion(gasto)).toBe(true);
    expect(gasto.id).not.toMatch(/\d{13}/); // sin Date.now() en la identidad
    // La tarea queda enlazada al mismo gasto (trazabilidad en ambos sentidos).
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ id: 'mant_1', ultimoGastoId: gasto.id, ultimaFechaRealizada: '2026-03-02' });
    expect(buscarGastoDeOperacion([gasto], { tipo: 'MANTENIMIENTO', operacionId: 'mant_1' })).toBe(gasto);
  });

  it('repetir el registro de la misma actuación reescribe el mismo gasto (no duplica)', async () => {
    const onSave = vi.fn(async (_tarea: TareaMantenimiento) => undefined);
    const primera = render(
      <RegistrarActuacionModal isOpen onClose={() => {}} onSave={onSave} tarea={tarea()} inmueble={INMUEBLE} currentUser={USUARIO} />
    );
    await registrar(primera.container, '2026-03-02');
    await waitFor(() => expect(saveGastoFirestore).toHaveBeenCalledTimes(1));
    cleanup();

    const segunda = render(
      <RegistrarActuacionModal isOpen onClose={() => {}} onSave={onSave} tarea={tarea()} inmueble={INMUEBLE} currentUser={USUARIO} />
    );
    await registrar(segunda.container, '2026-03-02');
    await waitFor(() => expect(saveGastoFirestore).toHaveBeenCalledTimes(2));

    const ids = vi.mocked(saveGastoFirestore).mock.calls.map((c) => c[0].id);
    expect(new Set(ids).size).toBe(1); // un único documento, escrito dos veces
    expect(ids[0]).toBe('gop_mantenimiento_mant_1_2026-03-02');
  });

  it('una actuación ya asociada a un gasto reutiliza ese documento en lugar de crear otro', async () => {
    const onSave = vi.fn(async (_tarea: TareaMantenimiento) => undefined);
    const existente = 'gasto_mant_mant_1_1699999999999';
    const previa = tarea({
      ultimaFechaRealizada: '2026-03-02',
      ultimoGastoId: existente,
      historialActuaciones: [{
        id: 'act_1', fecha: '2026-03-02T10:00:00.000Z', fechaRealizacion: '2026-03-02',
        gastoId: existente, observaciones: 'Actuación previa', realizadoPor: 'Gestora ficticia',
      }],
    });
    const { container } = render(
      <RegistrarActuacionModal isOpen onClose={() => {}} onSave={onSave} tarea={previa} inmueble={INMUEBLE} currentUser={USUARIO} />
    );
    await registrar(container, '2026-03-02');
    await waitFor(() => expect(saveGastoFirestore).toHaveBeenCalledTimes(1));
    const gasto = vi.mocked(saveGastoFirestore).mock.calls[0][0];
    expect(gasto.id).toBe(existente);
    expect(gasto.origenId).toBe('mant_1');
  });

  it('sin coste real no se genera apunte contable ni gasto parcial', async () => {
    const onSave = vi.fn(async (_tarea: TareaMantenimiento) => undefined);
    const { container } = render(
      <RegistrarActuacionModal isOpen onClose={() => {}} onSave={onSave} tarea={tarea({ costeEstimado: 0 })} inmueble={INMUEBLE} currentUser={USUARIO} />
    );
    await registrar(container, '2026-03-02');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(saveGastoFirestore).not.toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].ultimoGastoId).toBeUndefined();
  });

  it('valida el aislamiento por inmueble antes de escribir: no guarda gasto ni tarea', async () => {
    const onSave = vi.fn(async (_tarea: TareaMantenimiento) => undefined);
    const { container } = render(
      <RegistrarActuacionModal isOpen onClose={() => {}} onSave={onSave} tarea={tarea()} inmueble={OTRO_INMUEBLE} currentUser={USUARIO} />
    );
    await registrar(container, '2026-03-02');
    await waitFor(() => expect(screen.getByText(/aislamiento por inmueble/)).toBeTruthy());
    expect(saveGastoFirestore).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('la garantía post-actuación se guarda apuntando al mismo gasto', async () => {
    const onSave = vi.fn(async (_tarea: TareaMantenimiento) => undefined);
    const { container } = render(
      <RegistrarActuacionModal isOpen onClose={() => {}} onSave={onSave} tarea={tarea()} inmueble={INMUEBLE} currentUser={USUARIO} />
    );
    fireEvent.click(screen.getByText('Registrar Garantía Post-Actuación').closest('label')!.querySelector('input')!);
    await registrar(container, '2026-03-02');
    await waitFor(() => expect(saveGarantiaReparacionFirestore).toHaveBeenCalledTimes(1));
    const gasto = vi.mocked(saveGastoFirestore).mock.calls[0][0];
    const garantia = vi.mocked(saveGarantiaReparacionFirestore).mock.calls[0][0];
    expect(garantia.gastoId).toBe(gasto.id);
    expect(garantia.inmuebleId).toBe('inm-1');
    expect(garantia.propietarioId).toBe('prop-1');
  });
});
