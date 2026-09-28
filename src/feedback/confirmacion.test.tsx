/**
 * BLOQUE 10 · UX-3 — CONFIRMACIÓN DE ACCIONES DESTRUCTIVAS (comportamiento).
 *
 * Se comprueba lo que la orden exige de la confirmación: dice qué va a ocurrir,
 * distinguir cancelar/confirmar, no ejecutar dos veces, quedarse bloqueada mientras
 * la operación corre, mostrar el resultado y el error, y no convertir la confirmación
 * en una acción distinta (la operación ejecutada es exactamente la misma).
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { HostConfirmacion } from '../components/feedback/DialogoConfirmacion';
import {
  confirmar,
  hayHostConfirmacion,
  reiniciarConfirmacion,
} from './confirmacion';
import { ejecutarOperacion } from './operaciones';
import { reiniciarAvisosOperacion } from './canalFeedback';

afterEach(() => {
  cleanup();
  act(() => reiniciarConfirmacion());
});

beforeEach(() => {
  reiniciarAvisosOperacion();
  act(() => reiniciarConfirmacion());
});

describe('UX-3 · diálogo de confirmación', () => {
  it('muestra qué va a ocurrir antes de ejecutar nada', async () => {
    const alConfirmar = vi.fn(async () => undefined);
    render(<HostConfirmacion />);

    act(() => {
      void confirmar({
        titulo: 'Finalizar alquiler',
        mensaje: '¿Confirmas la finalización del contrato?',
        detalle: 'La vivienda quedará disponible para un nuevo alquiler.',
        etiquetaConfirmar: 'Finalizar alquiler',
        alConfirmar,
      });
    });

    expect(screen.getByTestId('dialogo-confirmacion').textContent).toContain('Finalizar alquiler');
    expect(screen.getByTestId('dialogo-confirmacion').textContent).toContain('¿Confirmas la finalización del contrato?');
    expect(screen.getByTestId('dialogo-confirmacion').textContent).toContain('quedará disponible');
    expect(alConfirmar).not.toHaveBeenCalled();
  });

  it('cancelar no ejecuta la acción y devuelve «no confirmado»', async () => {
    const alConfirmar = vi.fn(async () => undefined);
    let resultado: { confirmado: boolean } | null = null;
    render(<HostConfirmacion />);

    act(() => {
      void confirmar({ titulo: 'Eliminar póliza', mensaje: '¿Eliminar la póliza?', alConfirmar }).then(
        (r) => (resultado = r)
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByTestId('dialogo-confirmacion')).toBeNull());
    expect(alConfirmar).not.toHaveBeenCalled();
    expect(resultado && resultado.confirmado).toBe(false);
  });

  it('confirmar ejecuta exactamente la operación recibida y comunica el resultado', async () => {
    const operacion = vi.fn(async () => 'guardado');
    let resultado: { confirmado: boolean } | null = null;
    render(<HostConfirmacion />);

    act(() => {
      void confirmar({
        titulo: 'Eliminar gasto',
        mensaje: '¿Eliminar este gasto?',
        etiquetaConfirmar: 'Eliminar',
        alConfirmar: () => operacion(),
      }).then((r) => (resultado = r));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(resultado && resultado.confirmado).toBe(true));
    expect(operacion).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('dialogo-confirmacion')).toBeNull();
  });

  it('doble clic en confirmar no ejecuta la operación dos veces', async () => {
    let resolver: (() => void) | null = null;
    const operacion = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolver = r;
        })
    );
    render(<HostConfirmacion />);

    act(() => {
      void confirmar({
        titulo: 'Eliminar usuario',
        mensaje: '¿Eliminar al usuario?',
        etiquetaConfirmar: 'Eliminar',
        alConfirmar: () => operacion(),
      });
    });

    const boton = screen.getByRole('button', { name: 'Eliminar' });
    fireEvent.click(boton);
    fireEvent.click(boton);
    fireEvent.click(boton);

    expect(operacion).toHaveBeenCalledTimes(1);

    // Mientras ejecuta, el diálogo está bloqueado (no se puede repetir).
    const durante = screen.getByTestId('dialogo-confirmacion');
    expect(durante.textContent).toContain('Procesando');
    expect((screen.getByRole('button', { name: /procesando/i }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      resolver?.();
    });
    await waitFor(() => expect(screen.queryByTestId('dialogo-confirmacion')).toBeNull());
    expect(operacion).toHaveBeenCalledTimes(1);
  });

  it('si la operación falla, el diálogo sigue abierto con el motivo y se puede reintentar', async () => {
    const operacion = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('No se ha podido eliminar el gasto pendiente.'))
      .mockResolvedValueOnce(undefined);
    render(<HostConfirmacion />);

    act(() => {
      void confirmar({
        titulo: 'Eliminar gasto pendiente',
        mensaje: '¿Eliminar este gasto pendiente?',
        etiquetaConfirmar: 'Eliminar',
        alConfirmar: () => operacion(),
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.getByTestId('error-confirmacion')).toBeTruthy());
    expect(screen.getByTestId('error-confirmacion').textContent).toContain(
      'No se ha podido eliminar el gasto pendiente.'
    );
    // El diálogo no se cierra: la operación no se da por hecha.
    expect(screen.getByTestId('dialogo-confirmacion')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(operacion).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId('dialogo-confirmacion')).toBeNull());
  });

  it('un `false` del contrato de persistencia (B5) nunca se presenta como éxito', async () => {
    const persistir = vi.fn(async () => false);
    let resultado: { ok: boolean } | null = null;
    render(<HostConfirmacion />);

    act(() => {
      void confirmar({
        titulo: 'Eliminar inmueble',
        mensaje: '¿Eliminar el inmueble?',
        etiquetaConfirmar: 'Eliminar',
        alConfirmar: async () => {
          const r = await ejecutarOperacion({
            accion: () => persistir(),
            mensajeExito: 'Inmueble eliminado.',
            mensajeError: 'No se ha podido eliminar el inmueble.',
            origenesDatos: ['inmuebles'],
            avisarExito: true,
          });
          resultado = r;
          if (!r.ok) throw new Error('No se ha podido eliminar el inmueble.');
        },
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.getByTestId('error-confirmacion')).toBeTruthy());
    expect(resultado && resultado.ok).toBe(false);
    // Ni éxito en pantalla ni cierre del diálogo.
    expect(screen.queryByTestId('aviso-operacion-exito')).toBeNull();
    expect(screen.getByTestId('dialogo-confirmacion')).toBeTruthy();
  });

  it('exige el motivo cuando la confirmación lo pide (antes `window.prompt`)', async () => {
    const alConfirmar = vi.fn(async () => undefined);
    let textoRecibido: string | undefined;
    render(<HostConfirmacion />);

    act(() => {
      void confirmar({
        titulo: 'Anular factura',
        mensaje: 'Indica el motivo de la anulación.',
        etiquetaConfirmar: 'Anular factura',
        entradaTexto: { etiqueta: 'Motivo de anulación', obligatorio: true, errorObligatorio: 'El motivo es obligatorio.' },
        alConfirmar: async (texto) => {
          textoRecibido = texto;
          await alConfirmar();
        },
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Anular factura' }));
    await waitFor(() => expect(screen.getByTestId('error-confirmacion').textContent).toContain('El motivo es obligatorio.'));
    expect(alConfirmar).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Motivo de anulación/), {
      target: { value: 'Datos fiscales incorrectos' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Anular factura' }));

    await waitFor(() => expect(alConfirmar).toHaveBeenCalledTimes(1));
    expect(textoRecibido).toBe('Datos fiscales incorrectos');
  });

  it('sin host montado degrada al diálogo del navegador (comportamiento previo)', async () => {
    const confirmNativo = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alConfirmar = vi.fn(async () => undefined);
    expect(hayHostConfirmacion()).toBe(false);

    const resultado = await confirmar({
      titulo: 'Eliminar',
      mensaje: '¿Eliminar el registro?',
      alConfirmar,
    });

    expect(confirmNativo).toHaveBeenCalledWith('¿Eliminar el registro?');
    expect(alConfirmar).toHaveBeenCalledTimes(1);
    expect(resultado.confirmado).toBe(true);
    confirmNativo.mockRestore();
  });
});
