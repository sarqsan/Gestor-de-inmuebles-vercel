/**
 * BLOQUE 10 · UX-4 — VALIDACIÓN Y ERRORES EN UN FORMULARIO REAL DEL ERP.
 *
 * `GastoModal` es el formulario de gasto (creación/edición). Se comprueba el
 * comportamiento exigido: el error va junto al campo, no se envía con datos
 * inválidos, lo introducido no se pierde y el error de persistencia se distingue
 * del error de validación.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../lib/firebase', () => ({
  uploadFacturaGasto: vi.fn(),
  deleteFacturaGastoStorage: vi.fn(async () => undefined),
}));

import { uploadFacturaGasto } from '../../lib/firebase';
import { ErrorCustodiaDocumento, MENSAJES_CUSTODIA } from '../../lib/custodiaDocumental/subidaDirecta';
import { MENSAJE_GASTO_SIN_FACTURA } from './GastoModal';

import type { Gasto, Inmueble, UsuarioApp } from '../../types';
import { reiniciarAvisosOperacion } from '../../feedback/canalFeedback';
import { reiniciarCanalIncidencias } from '../../estadoDatos/canalIncidencias';
import { AvisosOperacion } from '../feedback/AvisosOperacion';
import { GastoModal } from './GastoModal';

const INMUEBLE = { id: 'inm-1', direccion: 'Calle ficticia 1', ciudad: 'Alicante' } as Inmueble;
const USUARIO = { id: 'u-1', nombre: 'Gestora ficticia', tipoPerfil: 'ADMINISTRADOR' } as UsuarioApp;

function renderModal(onSave: (g: Gasto) => Promise<Gasto | void> | Gasto | void) {
  return render(
    <>
      <AvisosOperacion />
      <GastoModal inmuebles={[INMUEBLE]} currentUser={USUARIO} onSave={onSave} onClose={() => undefined} />
    </>
  );
}

beforeEach(() => {
  reiniciarAvisosOperacion();
  reiniciarCanalIncidencias();
});
afterEach(() => cleanup());

describe('UX-4 · GastoModal', () => {
  it('un formulario válido se envía una sola vez', async () => {
    const onSave = vi.fn(async (g: Gasto) => g);
    renderModal(onSave);

    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '120.50' } });
    fireEvent.click(screen.getByRole('button', { name: /registrar gasto/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('error-campo')).toBeNull();
  });

  it('un importe <= 0 impide el envío y el error aparece junto al campo', async () => {
    const onSave = vi.fn(async (g: Gasto) => g);
    renderModal(onSave);

    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /registrar gasto/i }));

    const error = await screen.findByTestId('error-campo');
    expect(error.textContent).toContain('Importe total');
    expect(onSave).not.toHaveBeenCalled();
    // El resumen del formulario también está presente (formulario largo).
    expect(screen.getByTestId('resumen-errores')).toBeTruthy();
  });

  it('sin inmuebles, se avisa del campo obligatorio en lugar de enviar', async () => {
    const onSave = vi.fn(async (g: Gasto) => g);
    render(
      <>
        <AvisosOperacion />
        <GastoModal inmuebles={[]} currentUser={USUARIO} onSave={onSave} onClose={() => undefined} />
      </>
    );

    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /registrar gasto/i }));

    const errores = await screen.findAllByTestId('error-campo');
    expect(errores.map((e) => e.textContent).join(' ')).toContain('Inmueble');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('no se pierde lo introducido cuando la validación impide el envío', async () => {
    const onSave = vi.fn(async (g: Gasto) => g);
    renderModal(onSave);

    const importe = screen.getByPlaceholderText('0,00') as HTMLInputElement;
    fireEvent.change(importe, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /registrar gasto/i }));
    await screen.findByTestId('error-campo');

    expect((screen.getByPlaceholderText('0,00') as HTMLInputElement).value).toBe('0');

    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: /registrar gasto/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it('el error de persistencia se muestra aparte y no se confunde con la validación', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('FirebaseError: Missing or insufficient permissions.');
    });
    const onClose = vi.fn();
    render(
      <>
        <AvisosOperacion />
        <GastoModal inmuebles={[INMUEBLE]} currentUser={USUARIO} onSave={onSave} onClose={onClose} />
      </>
    );

    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: /registrar gasto/i }));

    await waitFor(() => expect(screen.getByTestId('error-persistencia-gasto')).toBeTruthy());
    const texto = screen.getByTestId('error-persistencia-gasto').textContent ?? '';
    expect(texto).toContain('No se ha podido guardar el gasto.');
    expect(texto).not.toMatch(/firebase|permission|insufficient/i);
    // No hay errores de validación (los datos eran válidos) y el modal sigue abierto.
    expect(screen.queryByTestId('error-campo')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    // El error queda visible para la persona usuaria (canal de avisos).
    expect(screen.getByTestId('aviso-operacion-error').textContent).toContain(
      'No se ha podido guardar el gasto.'
    );
  });

  it('el doble clic no registra el gasto dos veces', async () => {
    let resolver: (() => void) | null = null;
    const onSave = vi.fn(
      (g: Gasto) =>
        new Promise<Gasto>((r) => {
          resolver = () => r(g);
        })
    );
    renderModal(onSave);

    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '90' } });
    const boton = screen.getByRole('button', { name: /registrar gasto/i });
    fireEvent.click(boton);
    fireEvent.click(boton);

    expect(onSave).toHaveBeenCalledTimes(1);
    await waitFor(() => expect((screen.getByRole('button', { name: /guardando/i }) as HTMLButtonElement).disabled).toBe(true));

    await waitFor(() => {
      resolver?.();
    });
  });

  // -------------------------------------------------------------------------
  // ORDEN 1 · AG-04 — la factura ya no tiene respaldo efímero: si Storage la
  // deniega, el gasto queda guardado y el aviso dice EXACTAMENTE eso.
  // -------------------------------------------------------------------------
  it('AG-04 · si la factura no se custodia, se informa de que el gasto SÍ se guardó y la factura NO; el modal sigue abierto', async () => {
    const guardados: Gasto[] = [];
    const onSave = vi.fn(async (g: Gasto) => {
      const conTitular = { ...g, propietarioId: g.propietarioId || 'prop_A' };
      guardados.push(conTitular);
      return conTitular;
    });
    const onClose = vi.fn();
    vi.mocked(uploadFacturaGasto).mockRejectedValueOnce(new ErrorCustodiaDocumento('SIN_PERMISO'));
    const { container } = render(
      <>
        <AvisosOperacion />
        <GastoModal inmuebles={[INMUEBLE]} currentUser={USUARIO} onSave={onSave} onClose={onClose} />
      </>
    );

    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '45' } });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const factura = new File([new Uint8Array(10)], 'factura.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [factura] } });
    fireEvent.click(screen.getByRole('button', { name: /registrar gasto/i }));

    await waitFor(() => expect(screen.getByTestId('error-persistencia-gasto')).toBeTruthy());
    const texto = screen.getByTestId('error-persistencia-gasto').textContent ?? '';
    expect(texto).toContain(MENSAJE_GASTO_SIN_FACTURA);
    expect(texto).toContain(MENSAJES_CUSTODIA.SIN_PERMISO);
    expect(texto).not.toMatch(/firebase|storage\/|permission/i);
    // El aviso NO dice «no se ha podido guardar el gasto» (sería falso) ni «correctamente» (sería falso).
    expect(screen.getByTestId('aviso-operacion-error').textContent).toContain(MENSAJE_GASTO_SIN_FACTURA);
    expect(screen.queryByText(/registrado correctamente/i)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    // El gasto se guardó una vez (sin factura) y no se fabricó ninguna referencia sin custodia.
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(guardados[0].justificanteUrl).toBeUndefined();
    expect(guardados[0].justificantePath).toBeUndefined();
    expect(uploadFacturaGasto).toHaveBeenCalledWith(guardados[0].id, factura, 'factura.pdf', 'prop_A');

    // Reintento: ahora Storage acepta → se reutiliza el MISMO gasto (nunca se duplica) y se cierra.
    vi.mocked(uploadFacturaGasto).mockResolvedValueOnce({ url: 'https://storage.example/f.pdf', storagePath: 'gastos_facturas/prop_A/x/1_factura.pdf' });
    fireEvent.click(screen.getByRole('button', { name: /registrar gasto/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const ids = new Set(guardados.map((g) => g.id));
    expect(ids.size).toBe(1);
    expect(guardados.at(-1)?.justificantePath).toBe('gastos_facturas/prop_A/x/1_factura.pdf');
  });
});
