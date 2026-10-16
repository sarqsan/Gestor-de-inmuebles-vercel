/**
 * FASE 6 — EVOLUCIÓN DE LA INCIDENCIA EN EL PORTAL (jsdom, sin red)
 * ================================================================
 * La sección sólo pinta lo que el servidor autoriza: pasos del hilo, estado
 * real del aviso y, si el inquilino lo pide, la solicitud de seguimiento.
 * Si el servidor rechaza o falla, se muestra el motivo y no se inventa nada.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const leerSeguimientoIncidencia = vi.fn();
const sincronizarSeguimientoIncidencia = vi.fn();
vi.mock('../../lib/seguimientoIncidencias', () => ({
  leerSeguimientoIncidencia: (...args: unknown[]) => leerSeguimientoIncidencia(...args) as unknown,
  sincronizarSeguimientoIncidencia: (...args: unknown[]) => sincronizarSeguimientoIncidencia(...args) as unknown,
}));

import { EvolucionIncidenciaPortal } from './EvolucionIncidenciaPortal';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Fase 6 · evolución de la incidencia (portal)', () => {
  it('muestra los pasos autorizados con el estado real del aviso', async () => {
    leerSeguimientoIncidencia.mockResolvedValue({
      ok: true,
      pasos: [
        { id: 'seg_1', tipo: 'INCIDENCIA_ESTADO_CAMBIADO', etiqueta: 'Cambio de estado', fecha: '2026-10-16T09:00:00.000Z', detalle: 'ABIERTA → EN_REPARACION', requiereAtencion: false, notificacion: 'Aviso entregado' },
        { id: 'seg_2', tipo: 'INCIDENCIA_CREADA', etiqueta: 'Incidencia registrada', fecha: '2026-10-15T08:00:00.000Z', requiereAtencion: true },
      ],
    });
    render(<EvolucionIncidenciaPortal incidenciaId="inc-1" />);
    await waitFor(() => expect(screen.getByText('Cambio de estado')).toBeTruthy());
    expect(screen.getByText('ABIERTA → EN_REPARACION')).toBeTruthy();
    expect(screen.getByText(/aviso entregado/i)).toBeTruthy();
    expect(screen.getByText('Incidencia registrada')).toBeTruthy();
    expect(leerSeguimientoIncidencia).toHaveBeenCalledWith('inc-1');
  });

  it('sin eventos lo dice expresamente (no inventa evolución)', async () => {
    leerSeguimientoIncidencia.mockResolvedValue({ ok: true, pasos: [] });
    render(<EvolucionIncidenciaPortal incidenciaId="inc-1" />);
    await waitFor(() => expect(screen.getByText(/todavía no hay eventos/i)).toBeTruthy());
  });

  it('si el servidor rechaza, muestra el motivo y no pinta pasos', async () => {
    leerSeguimientoIncidencia.mockResolvedValue({ ok: false, error: 'La incidencia indicada no pertenece a tus contratos.' });
    render(<EvolucionIncidenciaPortal incidenciaId="inc-1" />);
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toMatch(/no pertenece a tus contratos/i);
  });

  it('la solicitud de seguimiento sólo se envía al pulsar y sólo si el servidor confirma', async () => {
    leerSeguimientoIncidencia.mockResolvedValue({ ok: true, pasos: [] });
    sincronizarSeguimientoIncidencia.mockResolvedValue({ ok: true, estado: 'OK', eventos: [], reintentos: 0 });
    render(<EvolucionIncidenciaPortal incidenciaId="inc-1" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /pedir seguimiento a gestión/i })).toBeTruthy());
    expect(sincronizarSeguimientoIncidencia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /pedir seguimiento a gestión/i }));
    await waitFor(() => expect(sincronizarSeguimientoIncidencia).toHaveBeenCalledWith('inc-1', { derivacionSolicitada: true }));
    await waitFor(() => expect(screen.getByText(/seguimiento solicitado a gestión/i)).toBeTruthy());
  });
});
