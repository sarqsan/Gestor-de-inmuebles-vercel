/**
 * BLOQUE 10 · UX-6 — COMPORTAMIENTO DE LOS DIÁLOGOS ACCESIBLES.
 *
 * Verifica el patrón común que se aplicó a los modales del ERP (`useDialogoAccesible`):
 * semántica de diálogo con nombre accesible, foco que entra y vuelve, cierre con Escape
 * —que nunca ejecuta la operación— y `Tab`/`Shift+Tab` que no se escapan del diálogo.
 *
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { useDialogoAccesible } from './dialogo';

afterEach(() => cleanup());

const DialogoDePrueba: React.FC<{
  onCerrar?: () => void;
  cerrableConEscape?: boolean;
  etiqueta?: string;
}> = ({ onCerrar = () => undefined, cerrableConEscape = true, etiqueta = 'Diálogo de prueba' }) => {
  const { refDialogo, propsDialogo } = useDialogoAccesible({ abierto: true, onCerrar, cerrableConEscape }, etiqueta);
  return (
    <div ref={refDialogo} {...propsDialogo}>
      <button type="button">Primero</button>
      <input aria-label="Campo de prueba" />
      <button type="button">Último</button>
    </div>
  );
};

const Anfitrion: React.FC<{ onCerrar?: () => void }> = ({ onCerrar = () => undefined }) => {
  const [abierto, setAbierto] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setAbierto(true)}>
        Abrir diálogo
      </button>
      {abierto && (
        <DialogoDePrueba
          onCerrar={() => {
            setAbierto(false);
            onCerrar();
          }}
        />
      )}
    </div>
  );
};

describe('UX-6 · diálogos accesibles', () => {
  it('el diálogo se anuncia como tal y con su nombre', () => {
    render(<DialogoDePrueba etiqueta="Editar gasto" />);
    const dialogo = screen.getByRole('dialog', { name: 'Editar gasto' });
    expect(dialogo.getAttribute('aria-modal')).toBe('true');
  });

  it('al abrirse, el foco entra en el diálogo', () => {
    render(<DialogoDePrueba />);
    expect(document.activeElement?.textContent).toBe('Primero');
  });

  it('Escape cierra el diálogo mediante la acción de cierre', () => {
    const onCerrar = vi.fn();
    render(<DialogoDePrueba onCerrar={onCerrar} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('mientras la operación está en curso, Escape no cierra', () => {
    const onCerrar = vi.fn();
    render(<DialogoDePrueba onCerrar={onCerrar} cerrableConEscape={false} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('Tab no se escapa del diálogo: del último vuelve al primero', () => {
    render(<DialogoDePrueba />);
    const ultimo = screen.getByRole('button', { name: 'Último' });
    ultimo.focus();

    fireEvent.keyDown(document.activeElement as Element, { key: 'Tab' });

    expect(document.activeElement?.textContent).toBe('Primero');
  });

  it('Shift+Tab desde el primero salta al último', () => {
    render(<DialogoDePrueba />);
    const primero = screen.getByRole('button', { name: 'Primero' });
    primero.focus();

    fireEvent.keyDown(document.activeElement as Element, { key: 'Tab', shiftKey: true });

    expect(document.activeElement?.textContent).toBe('Último');
  });

  it('con dos diálogos abiertos, Escape sólo afecta al de arriba', () => {
    const cerrarAbajo = vi.fn();
    const cerrarArriba = vi.fn();
    render(
      <div>
        <DialogoDePrueba onCerrar={cerrarAbajo} etiqueta="Ficha de fondo" />
        <DialogoDePrueba onCerrar={cerrarArriba} etiqueta="Confirmación encima" />
      </div>
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(cerrarArriba).toHaveBeenCalledTimes(1);
    expect(cerrarAbajo).not.toHaveBeenCalled();
  });

  it('al cerrarse, el foco vuelve al punto desde el que se abrió', () => {
    render(<Anfitrion />);
    const disparador = screen.getByRole('button', { name: 'Abrir diálogo' });
    disparador.focus();
    fireEvent.click(disparador);
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(disparador);
  });
});
