/**
 * BLOQUE 10 · UX-3 — ACCIÓN DESTRUCTIVA REAL DEL ERP (comportamiento extremo a extremo).
 *
 * Sobre un panel real (`ConfiguracionAseguradorasModal`) se comprueba el circuito
 * completo: se pide confirmación diciendo qué va a ocurrir, cancelar no ejecuta nada,
 * confirmar ejecuta **exactamente la operación que ya existía** (una sola vez) y el
 * resultado (éxito o fallo) se comunica sin detalles técnicos.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { reiniciarAvisosOperacion } from './canalFeedback';
import { reiniciarConfirmacion } from './confirmacion';
import { reiniciarCanalIncidencias } from '../estadoDatos/canalIncidencias';
import { AvisosOperacion } from '../components/feedback/AvisosOperacion';
import { HostConfirmacion } from '../components/feedback/DialogoConfirmacion';
import { ConfiguracionAseguradorasModal } from '../components/ConfiguracionAseguradorasModal';
import type { ConfiguracionAseguradora } from '../types';

const ASEGURADORA = {
  id: 'aseg-1',
  nombre: 'Compañía ficticia',
  nombreComercial: 'Compañía ficticia de seguros',
  emailTramitacion: 'tramitacion@example.invalid',
  activa: true,
  ratioEsfuerzoMaximo: 45,
  antiguedadMinimaMeses: 3,
  documentosRequeridos: [],
  tasaPrimaAnualPorcentaje: 4.5,
  mesesCoberturaImpago: 12,
  tiempoMedioRespuestaHoras: 2,
  coberturasSugeridas: {},
  instruccionesEnvio: '',
  formatoAsuntoEmail: '',
} as unknown as ConfiguracionAseguradora;

function montar(onDelete: (id: string) => Promise<void> | void) {
  return render(
    <>
      <AvisosOperacion />
      <HostConfirmacion />
      <ConfiguracionAseguradorasModal
        aseguradoras={[ASEGURADORA]}
        onClose={() => undefined}
        onSaveAseguradora={() => undefined}
        onDeleteAseguradora={onDelete}
      />
    </>
  );
}

async function abrirFicha() {
  fireEvent.click(screen.getByText('Compañía ficticia'));
  await screen.findByText(/Eliminar Aseguradora/i);
}

beforeEach(() => {
  reiniciarAvisosOperacion();
  reiniciarCanalIncidencias();
  act(() => reiniciarConfirmacion());
});
afterEach(() => {
  cleanup();
  act(() => reiniciarConfirmacion());
});

describe('UX-3 · eliminar una aseguradora (panel real)', () => {
  it('pide confirmación con el nombre y las consecuencias antes de ejecutar', async () => {
    const onDelete = vi.fn(async () => undefined);
    montar(onDelete);
    await abrirFicha();

    fireEvent.click(screen.getByText(/Eliminar Aseguradora/i));

    const dialogo = await screen.findByTestId('dialogo-confirmacion');
    expect(dialogo.textContent).toContain('Compañía ficticia');
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('cancelar cierra el diálogo sin ejecutar la eliminación', async () => {
    const onDelete = vi.fn(async () => undefined);
    montar(onDelete);
    await abrirFicha();

    fireEvent.click(screen.getByText(/Eliminar Aseguradora/i));
    await screen.findByTestId('dialogo-confirmacion');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByTestId('dialogo-confirmacion')).toBeNull());
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByTestId('aviso-operacion-exito')).toBeNull();
  });

  it('confirmar ejecuta la operación previa una sola vez y anuncia el resultado', async () => {
    const onDelete = vi.fn(async () => undefined);
    montar(onDelete);
    await abrirFicha();

    fireEvent.click(screen.getByText(/Eliminar Aseguradora/i));
    await screen.findByTestId('dialogo-confirmacion');

    const confirmar = screen.getByRole('button', { name: 'Eliminar' });
    fireEvent.click(confirmar);
    fireEvent.click(confirmar);

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(onDelete).toHaveBeenCalledWith('aseg-1');
    await waitFor(() =>
      expect(screen.getByTestId('aviso-operacion-exito').textContent).toContain('Aseguradora eliminada.')
    );
  });

  it('si la eliminación falla, no se anuncia éxito y el motivo queda visible', async () => {
    const onDelete = vi.fn(async () => {
      throw new Error('FirebaseError: Missing or insufficient permissions.');
    });
    montar(onDelete);
    await abrirFicha();

    fireEvent.click(screen.getByText(/Eliminar Aseguradora/i));
    await screen.findByTestId('dialogo-confirmacion');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.getByTestId('aviso-operacion-error')).toBeTruthy());
    expect(screen.queryByTestId('aviso-operacion-exito')).toBeNull();
    const texto = screen.getByTestId('dialogo-confirmacion').textContent ?? '';
    expect(texto).toContain('No se ha podido eliminar la aseguradora.');
    expect(texto).not.toMatch(/firebase|permission|insufficient/i);
  });
});
