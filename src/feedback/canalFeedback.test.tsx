/**
 * BLOQUE 10 · UX-3 — CANAL DE AVISOS DE OPERACIÓN (comportamiento).
 *
 * Se prueba lo que la persona usuaria percibe: un éxito se anuncia y desaparece,
 * un error se queda hasta que se descarta, no se apilan repetidos y el host los
 * muestra en pantalla.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AvisosOperacion } from '../components/feedback/AvisosOperacion';
import {
  avisarOperacion,
  avisosOperacion,
  descartarAvisoOperacion,
  MS_AUTOCIERRE,
  reiniciarAvisosOperacion,
} from './canalFeedback';

beforeEach(() => reiniciarAvisosOperacion());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('UX-3 · canal de avisos', () => {
  it('el éxito se anuncia en pantalla', () => {
    render(<AvisosOperacion />);

    act(() => {
      avisarOperacion({ tipo: 'exito', mensaje: 'Inmueble guardado correctamente.' });
    });

    expect(screen.getByTestId('avisos-operacion')).toBeTruthy();
    expect(screen.getByTestId('aviso-operacion-exito').textContent).toContain(
      'Inmueble guardado correctamente.'
    );
  });

  it('el fallo se anuncia con un mensaje claro', () => {
    render(<AvisosOperacion />);

    act(() => {
      avisarOperacion({ tipo: 'error', mensaje: 'No se ha podido guardar el inmueble.' });
    });

    expect(screen.getByTestId('aviso-operacion-error').textContent).toContain(
      'No se ha podido guardar el inmueble.'
    );
  });

  it('los avisos de éxito se cierran solos y los de error permanecen', () => {
    vi.useFakeTimers();
    render(<AvisosOperacion />);

    act(() => {
      avisarOperacion({ tipo: 'exito', mensaje: 'Cambios guardados correctamente.' });
      avisarOperacion({ tipo: 'error', mensaje: 'No se ha podido guardar el inmueble.' });
    });

    act(() => {
      vi.advanceTimersByTime(MS_AUTOCIERRE + 100);
    });

    expect(screen.queryByTestId('aviso-operacion-exito')).toBeNull();
    expect(screen.getByTestId('aviso-operacion-error')).toBeTruthy();
  });

  it('el error lo descarta la persona usuaria (recuperación tras error)', () => {
    render(<AvisosOperacion />);

    act(() => {
      avisarOperacion({ tipo: 'error', mensaje: 'No se ha podido eliminar el gasto.' });
    });

    fireEvent.click(screen.getByLabelText(/descartar/i));

    expect(screen.queryByTestId('aviso-operacion-error')).toBeNull();
  });

  it('el mismo mensaje repetido no se apila', () => {
    avisarOperacion({ tipo: 'error', mensaje: 'No se ha podido guardar el inmueble.' });
    avisarOperacion({ tipo: 'error', mensaje: 'No se ha podido guardar el inmueble.' });

    expect(avisosOperacion().filter((a) => a.tipo === 'error')).toHaveLength(1);
  });

  it('nunca muestra detalles técnicos: el canal sólo publica lo que recibe ya traducido', () => {
    render(<AvisosOperacion />);

    act(() => {
      avisarOperacion({ tipo: 'error', mensaje: 'No se ha podido guardar el inmueble.' });
    });

    const texto = screen.getByTestId('aviso-operacion-error').textContent ?? '';
    expect(texto).not.toMatch(/firebase|firestore|permission|firebaseerror/i);
  });

  it('se pueden descartar todos los avisos', () => {
    const aviso = avisarOperacion({ tipo: 'info', mensaje: 'Operación en curso.' });
    descartarAvisoOperacion(aviso.id);
    expect(avisosOperacion()).toHaveLength(0);
  });
});
