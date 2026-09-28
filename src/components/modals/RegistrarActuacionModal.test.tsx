// @vitest-environment jsdom
/**
 * BLOQUE 5 — persistence outcomes for the maintenance actuation flow.
 * The Firestore helpers are result-based here so rejected writes cannot be
 * mistaken for success by the UI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../lib/firebase', () => ({
  saveGastoFirestoreWithResult: vi.fn(async () => ({ ok: true })),
  saveGarantiaReparacionFirestoreWithResult: vi.fn(async () => ({ ok: true })),
}));

import {
  saveGastoFirestoreWithResult,
  saveGarantiaReparacionFirestoreWithResult,
} from '../../lib/firebase';
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

function activarGarantia() {
  fireEvent.click(screen.getByText('Registrar Garantía Post-Actuación').closest('label')!.querySelector('input')!);
}

describe('BLOQUE 5 · RegistrarActuacionModal (persistencia verificable e idempotencia)', () => {
  beforeEach(() => {
    vi.mocked(saveGastoFirestoreWithResult).mockReset().mockResolvedValue({ ok: true });
    vi.mocked(saveGarantiaReparacionFirestoreWithResult).mockReset().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('informa éxito solo después de confirmar gasto, garantía y tarea', async () => {
    const onSave = vi.fn(async (_tarea: TareaMantenimiento) => undefined);
    const onClose = vi.fn();
    const { container } = render(
      <RegistrarActuacionModal isOpen onClose={onClose} onSave={onSave} tarea={tarea()} inmueble={INMUEBLE} currentUser={USUARIO} />
    );
    activarGarantia();
    await registrar(container, '2026-03-02');

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(saveGastoFirestoreWithResult).toHaveBeenCalledTimes(1);
    expect(saveGarantiaReparacionFirestoreWithResult).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);

    const gasto = vi.mocked(saveGastoFirestoreWithResult).mock.calls[0][0];
    const garantia = vi.mocked(saveGarantiaReparacionFirestoreWithResult).mock.calls[0][0];
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
    expect(gasto.id).not.toMatch(/\d{13}/);
    expect(garantia).toMatchObject({
      id: 'gar_mant_mant_1_2026-03-02',
      gastoId: gasto.id,
      inmuebleId: 'inm-1',
      propietarioId: 'prop-1',
      fechaInicio: '2026-03-02',
    });
    expect(onSave.mock.calls[0][0]).toMatchObject({
      id: 'mant_1',
      ultimoGastoId: gasto.id,
      ultimaFechaRealizada: '2026-03-02',
      garantiaId: garantia.id,
    });
    expect(buscarGastoDeOperacion([gasto], { tipo: 'MANTENIMIENTO', operacionId: 'mant_1' })).toBe(gasto);
  });

  it('un fallo al guardar el gasto no avanza a garantía/tarea ni cierra el modal como éxito', async () => {
    vi.mocked(saveGastoFirestoreWithResult).mockResolvedValueOnce({
      ok: false,
      error: new Error('permission-denied gasto'),
    });
    const onSave = vi.fn(async (_tarea: TareaMantenimiento) => undefined);
    const onClose = vi.fn();
    const { container } = render(
      <RegistrarActuacionModal isOpen onClose={onClose} onSave={onSave} tarea={tarea()} inmueble={INMUEBLE} currentUser={USUARIO} />
    );
    activarGarantia();
    await registrar(container, '2026-03-02');

    expect(await screen.findByText(/No se pudo guardar el gasto de la actuación: permission-denied gasto/)).toBeTruthy();
    expect(saveGarantiaReparacionFirestoreWithResult).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('un fallo al guardar la garantía no avanza a la tarea ni cierra el modal como éxito', async () => {
    vi.mocked(saveGarantiaReparacionFirestoreWithResult).mockResolvedValueOnce({
      ok: false,
      error: new Error('permission-denied garantía'),
    });
    const onSave = vi.fn(async (_tarea: TareaMantenimiento) => undefined);
    const onClose = vi.fn();
    const { container } = render(
      <RegistrarActuacionModal isOpen onClose={onClose} onSave={onSave} tarea={tarea()} inmueble={INMUEBLE} currentUser={USUARIO} />
    );
    activarGarantia();
    await registrar(container, '2026-03-02');

    expect(await screen.findByText(/No se pudo guardar la garantía de la actuación: permission-denied garantía/)).toBeTruthy();
    expect(saveGastoFirestoreWithResult).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('un fallo al guardar la tarea llega al modal y no produce cierre/éxito', async () => {
    const onSave = vi.fn(async (_tarea: TareaMantenimiento) => {
      throw new Error('permission-denied tarea');
    });
    const onClose = vi.fn();
    const { container } = render(
      <RegistrarActuacionModal isOpen onClose={onClose} onSave={onSave} tarea={tarea()} inmueble={INMUEBLE} currentUser={USUARIO} />
    );
    activarGarantia();
    await registrar(container, '2026-03-02');

    expect(await screen.findByText(/permission-denied tarea/)).toBeTruthy();
    expect(saveGastoFirestoreWithResult).toHaveBeenCalledTimes(1);
    expect(saveGarantiaReparacionFirestoreWithResult).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('repetir una actuación conserva IDs de gasto y garantía, sin crear documentos duplicados', async () => {
    const onSave = vi.fn(async (_tarea: TareaMantenimiento) => undefined);
    const onClose = vi.fn();
    const primera = render(
      <RegistrarActuacionModal isOpen onClose={onClose} onSave={onSave} tarea={tarea()} inmueble={INMUEBLE} currentUser={USUARIO} />
    );
    activarGarantia();
    await registrar(primera.container, '2026-03-02');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    cleanup();

    const segunda = render(
      <RegistrarActuacionModal isOpen onClose={onClose} onSave={onSave} tarea={tarea()} inmueble={INMUEBLE} currentUser={USUARIO} />
    );
    activarGarantia();
    await registrar(segunda.container, '2026-03-02');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));

    const gastoIds = vi.mocked(saveGastoFirestoreWithResult).mock.calls.map(([gasto]) => gasto.id);
    const garantiaIds = vi.mocked(saveGarantiaReparacionFirestoreWithResult).mock.calls.map(([garantia]) => garantia.id);
    expect(new Set(gastoIds)).toEqual(new Set(['gop_mantenimiento_mant_1_2026-03-02']));
    expect(new Set(garantiaIds)).toEqual(new Set(['gar_mant_mant_1_2026-03-02']));
  });

  it('reutiliza el gasto histórico únicamente cuando la tarea lo enlaza para la misma fecha', async () => {
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
    await waitFor(() => expect(saveGastoFirestoreWithResult).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveGastoFirestoreWithResult).mock.calls[0][0].id).toBe(existente);
    expect(vi.mocked(saveGastoFirestoreWithResult).mock.calls[0][0].origenId).toBe('mant_1');
  });

  it('no infiere un gasto huérfano por fecha, importe, texto ni similitud del ID', async () => {
    const legacyOrphanId = 'gasto_mant_mant_1_1699999999999';
    const sinVinculo = tarea({
      ultimaFechaRealizada: '2026-03-01',
      ultimoGastoId: legacyOrphanId,
      historialActuaciones: [{
        id: 'act_sin_vinculo',
        fecha: '2026-03-02T10:00:00.000Z',
        fechaRealizacion: '2026-03-02',
        costeReal: 120,
        observaciones: 'Mantenimiento: Revisión anual de la caldera (Taller ficticio)',
        realizadoPor: 'Gestora ficticia',
      }],
    });
    const onSave = vi.fn(async (_tarea: TareaMantenimiento) => undefined);
    const { container } = render(
      <RegistrarActuacionModal isOpen onClose={() => {}} onSave={onSave} tarea={sinVinculo} inmueble={INMUEBLE} currentUser={USUARIO} />
    );
    await registrar(container, '2026-03-02');

    await waitFor(() => expect(saveGastoFirestoreWithResult).toHaveBeenCalledTimes(1));
    const gasto = vi.mocked(saveGastoFirestoreWithResult).mock.calls[0][0];
    expect(gasto.id).toBe('gop_mantenimiento_mant_1_2026-03-02');
    expect(gasto.id).not.toBe(legacyOrphanId);
    expect(gasto.origenId).toBe('mant_1');
  });

  it('sin coste real no genera apunte contable ni gasto parcial', async () => {
    const onSave = vi.fn(async (_tarea: TareaMantenimiento) => undefined);
    const { container } = render(
      <RegistrarActuacionModal isOpen onClose={() => {}} onSave={onSave} tarea={tarea({ costeEstimado: 0 })} inmueble={INMUEBLE} currentUser={USUARIO} />
    );
    await registrar(container, '2026-03-02');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(saveGastoFirestoreWithResult).not.toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].ultimoGastoId).toBeUndefined();
  });

  it('valida el aislamiento por inmueble antes de escribir gasto, garantía o tarea', async () => {
    const onSave = vi.fn(async (_tarea: TareaMantenimiento) => undefined);
    const { container } = render(
      <RegistrarActuacionModal isOpen onClose={() => {}} onSave={onSave} tarea={tarea()} inmueble={OTRO_INMUEBLE} currentUser={USUARIO} />
    );
    await registrar(container, '2026-03-02');
    await waitFor(() => expect(screen.getByText(/aislamiento por inmueble/)).toBeTruthy());
    expect(saveGastoFirestoreWithResult).not.toHaveBeenCalled();
    expect(saveGarantiaReparacionFirestoreWithResult).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
