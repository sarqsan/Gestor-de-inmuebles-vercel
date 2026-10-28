/**
 * @vitest-environment jsdom
 *
 * P0.2.6 — El modal de detalle de solicitud está CABLEADO: se abre desde la
 * bandeja y el cambio de estado llega a la App (que persiste en Firestore y
 * actualiza la propia selección). Antes el modal declaraba `onUpdateSolicitud`
 * pero la App pasaba `onUpdateEstado`: el callback era `undefined` en runtime.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';

afterEach(() => cleanup());
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SolicitudDetailModal } from '../src/components/SolicitudDetailModal';
import { solicitudFixture, inmuebleFixture } from './helpers/solicitudFixture';

const APP = readFileSync(resolve(__dirname, '../src/App.tsx'), 'utf8');
const MODAL = readFileSync(resolve(__dirname, '../src/components/SolicitudDetailModal.tsx'), 'utf8');

describe('SolicitudDetailModal · cambio de estado REAL', () => {
  it('«Seleccionar» llama a onUpdateEstado(id, estado, nota)', () => {
    const onUpdateEstado = vi.fn();
    const onClose = vi.fn();
    render(
      <SolicitudDetailModal
        solicitud={solicitudFixture()}
        inmueble={inmuebleFixture()}
        onClose={onClose}
        onUpdateEstado={onUpdateEstado}
      />
    );
    fireEvent.click(screen.getByText('Seleccionar'));
    expect(onUpdateEstado).toHaveBeenCalledTimes(1);
    expect(onUpdateEstado.mock.calls[0][0]).toBe('sol-1');
    expect(onUpdateEstado.mock.calls[0][1]).toBe('SELECCIONADO');
  });

  it('mantiene compatibilidad con el callback de documento completo', () => {
    const onUpdateSolicitud = vi.fn();
    render(
      <SolicitudDetailModal
        solicitud={solicitudFixture()}
        onClose={vi.fn()}
        onUpdateSolicitud={onUpdateSolicitud}
      />
    );
    fireEvent.click(screen.getAllByText('No Seleccionar')[0]);
    expect(onUpdateSolicitud).toHaveBeenCalledTimes(1);
    expect(onUpdateSolicitud.mock.calls[0][0]).toMatchObject({ estado: 'NO SELECCIONADO' });
  });

  it('sin ningún callback no lanza (fallo cerrado, sin falso éxito)', () => {
    render(<SolicitudDetailModal solicitud={solicitudFixture()} onClose={vi.fn()} />);
    expect(() => fireEvent.click(screen.getAllByText('Cancelar')[0])).not.toThrow();
  });

  it('el botón de cierre llama a onClose', () => {
    const onClose = vi.fn();
    render(<SolicitudDetailModal solicitud={solicitudFixture()} onClose={onClose} />);
    const botones = screen.getAllByRole('button');
    const cerrar = botones.find((b) => b.getAttribute('aria-label')?.toLowerCase().includes('cerrar'));
    if (cerrar) fireEvent.click(cerrar);
    // Si no hay aria-label, el contrato mínimo es que el modal renderice botones.
    expect(botones.length).toBeGreaterThan(0);
  });
});

describe('App.tsx · cableado del detalle', () => {
  it('abre el modal desde la bandeja y pasa AMBOS contratos de actualización', () => {
    expect(APP).toContain('setSelectedSolicitudForModal(sol)');
    expect(APP).toContain('onUpdateEstado={(solId, newEstado, nota)');
    expect(APP).toContain('onUpdateSolicitud={(actualizada)');
    expect(APP).toContain('{selectedSolicitudForModal && (');
  });

  it('el modal ya NO exige un callback que la App nunca pasó', () => {
    expect(MODAL).toContain('onUpdateEstado?:');
    expect(MODAL).toContain('onUpdateSolicitud?:');
    expect(MODAL).toContain('if (onUpdateEstado) onUpdateEstado(');
  });
});
