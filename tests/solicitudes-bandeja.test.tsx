/**
 * @vitest-environment jsdom
 *
 * P0.2.5 — La bandeja de solicitudes se MONTA de verdad y permite abrir el
 * detalle. Antes `SolicitudesSection` estaba importada pero era una sección
 * huérfana: una solicitud pública recién creada no tenía vista de revisión.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';

afterEach(() => cleanup());
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SolicitudesSection } from '../src/components/sections/SolicitudesSection';
import { solicitudFixture, inmuebleFixture } from './helpers/solicitudFixture';

const APP = readFileSync(resolve(__dirname, '../src/App.tsx'), 'utf8');

describe('SolicitudesSection · render real', () => {
  it('muestra el total y las solicitudes recibidas', () => {
    render(
      <SolicitudesSection
        solicitudes={[solicitudFixture(), solicitudFixture({ id: 'sol-2', candidatoNombre: 'Otra Persona' })]}
        inmuebles={[inmuebleFixture()]}
        onSelectSolicitud={vi.fn()}
        onTriggerAiAnalysis={vi.fn()}
      />
    );
    expect(screen.getByText('Total Solicitudes: 2')).toBeDefined();
    expect(screen.getAllByText(/Persona Sintética|Otra Persona/).length).toBeGreaterThan(0);
  });

  it('«Ver Solicitud» dispara onSelectSolicitud con la solicitud correcta', () => {
    const onSelectSolicitud = vi.fn();
    const solicitud = solicitudFixture();
    render(
      <SolicitudesSection
        solicitudes={[solicitud]}
        inmuebles={[inmuebleFixture()]}
        onSelectSolicitud={onSelectSolicitud}
        onTriggerAiAnalysis={vi.fn()}
      />
    );
    fireEvent.click(screen.getAllByText('Ver Solicitud')[0]);
    expect(onSelectSolicitud).toHaveBeenCalledTimes(1);
    expect(onSelectSolicitud.mock.calls[0][0].id).toBe('sol-1');
  });

  it('el botón «Analizar» dispara su callback, no una escritura', () => {
    const onTriggerAiAnalysis = vi.fn();
    render(
      <SolicitudesSection
        solicitudes={[solicitudFixture()]}
        inmuebles={[inmuebleFixture()]}
        onSelectSolicitud={vi.fn()}
        onTriggerAiAnalysis={onTriggerAiAnalysis}
      />
    );
    fireEvent.click(screen.getAllByText('Analizar')[0]);
    expect(onTriggerAiAnalysis).toHaveBeenCalledTimes(1);
  });

  it('con bandeja vacía muestra un estado vacío honesto (no datos de demo)', () => {
    const { container } = render(
      <SolicitudesSection
        solicitudes={[]}
        inmuebles={[]}
        onSelectSolicitud={vi.fn()}
        onTriggerAiAnalysis={vi.fn()}
      />
    );
    expect(container.textContent).toContain('Total Solicitudes: 0');
    expect(container.textContent).not.toContain('Persona Sintética');
  });
});

describe('App.tsx · cableado de la bandeja', () => {
  it('monta SolicitudesSection en la sección «solicitudes»', () => {
    expect(APP).toContain("{activeSection === 'solicitudes' && (");
    expect(APP).toContain('<SolicitudesSection');
    expect(APP).toContain('onSelectSolicitud={(sol) => setSelectedSolicitudForModal(sol)}');
  });

  it('ya no redirige «solicitudes» a CandidatosSection', () => {
    const condicion = /\{\(activeSection === 'candidatos'[^)]*\) && \(/.exec(APP);
    expect(condicion, 'condición de CandidatosSection no encontrada').not.toBeNull();
    expect(condicion![0]).not.toContain("activeSection === 'solicitudes'");
  });
});
