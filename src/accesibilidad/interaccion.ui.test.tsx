/**
 * BLOQUE 10 · UX-6 — CONTENEDORES CLICABLES ACCESIBLES POR TECLADO.
 *
 * En el ERP hay tarjetas y filas que abren un detalle con `onClick` sobre un `<div>`.
 * `propsInteraccion` las convierte en controles reales: foco por `Tab`, activación con
 * `Enter` y con `Espacio`, y nombre accesible cuando el contenido no lo aporta.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { propsInteraccion } from './interaccion';

afterEach(() => cleanup());

const TarjetaDePrueba: React.FC<{ onAbrir: () => void; etiqueta?: string }> = ({ onAbrir, etiqueta }) => (
  <div {...propsInteraccion(onAbrir, etiqueta)} data-testid="tarjeta">
    <span>Contenido de la tarjeta</span>
  </div>
);

describe('UX-6 · interacción accesible', () => {
  it('la tarjeta es un control enfocable con su nombre accesible', () => {
    render(<TarjetaDePrueba onAbrir={() => undefined} etiqueta="Abrir ficha del inmueble" />);
    const tarjeta = screen.getByRole('button', { name: 'Abrir ficha del inmueble' });
    expect(tarjeta.getAttribute('tabindex')).toBe('0');
  });

  it('se activa con el ratón', () => {
    const onAbrir = vi.fn();
    render(<TarjetaDePrueba onAbrir={onAbrir} etiqueta="Abrir" />);
    fireEvent.click(screen.getByTestId('tarjeta'));
    expect(onAbrir).toHaveBeenCalledTimes(1);
  });

  it('se activa con Enter', () => {
    const onAbrir = vi.fn();
    render(<TarjetaDePrueba onAbrir={onAbrir} etiqueta="Abrir" />);
    fireEvent.keyDown(screen.getByTestId('tarjeta'), { key: 'Enter' });
    expect(onAbrir).toHaveBeenCalledTimes(1);
  });

  it('se activa con Espacio sin desplazar la página', () => {
    const onAbrir = vi.fn();
    render(<TarjetaDePrueba onAbrir={onAbrir} etiqueta="Abrir" />);
    const evento = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });

    screen.getByTestId('tarjeta').dispatchEvent(evento);

    expect(onAbrir).toHaveBeenCalledTimes(1);
    expect(evento.defaultPrevented).toBe(true);
  });

  it('una tecla que no activa (p. ej. Tab) no dispara la acción', () => {
    const onAbrir = vi.fn();
    render(<TarjetaDePrueba onAbrir={onAbrir} etiqueta="Abrir" />);
    fireEvent.keyDown(screen.getByTestId('tarjeta'), { key: 'Tab' });
    expect(onAbrir).not.toHaveBeenCalled();
  });
});
