/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SolicitudSeguroImpago } from '../../types';

vi.mock('../../feedback/confirmacion', () => ({ confirmar: vi.fn() }));
vi.mock('../../feedback/operaciones', () => ({ ejecutarOperacion: vi.fn() }));
vi.mock('../../accesibilidad/interaccion', () => ({ propsInteraccion: () => ({}) }));

import { SeguroImpagoSection } from './SeguroImpagoSection';

function crearSolicitud(
  id: string,
  dictamen: SolicitudSeguroImpago['dictamenAseguradora'],
  verificado: boolean,
  estado: SolicitudSeguroImpago['estado'] = 'RESPUESTA_PROCESADA',
  confirmacionGmail?: SolicitudSeguroImpago['confirmacionGmail'],
): SolicitudSeguroImpago {
  return {
    id,
    referenciaUnica: id,
    candidatoId: 'candidato',
    inmuebleId: 'inmueble',
    inmuebleNombre: 'Piso de prueba',
    inmuebleDireccion: 'Calle de prueba',
    inmuebleCiudad: 'Alicante',
    rentaMensual: 900,
    aseguradoraId: 'aseguradora',
    aseguradoraNombre: 'Aseguradora de prueba',
    aseguradoraEmail: 'aseguradora@example.invalid',
    numTitulares: 1,
    titular1: {
      nombre: `Titular ${id}`,
      tipoEmpleo: 'INDEFINIDO',
      tipoContrato: 'INDEFINIDO',
      antiguedadLaboral: '3 años',
      ingresosNetosMensuales: 2400,
    },
    tieneAvalista: false,
    ingresosTotalesConjuntos: 2400,
    ratioEsfuerzoCalculado: 37.5,
    documentosAdjuntos: [],
    documentacionCompletaSegunAseguradora: false,
    estado,
    metodoEnvio: 'GMAIL_API',
    confirmacionGmail,
    dictamenAseguradora: dictamen,
    dictamenAseguradoraVerificadoManualmente: verificado,
    procesadoConIA: true,
    decisionFinalPropietario: 'PENDIENTE',
    fechaCreacion: '2026-10-01T10:00:00.000Z',
    fechaActualizacion: '2026-10-01T10:00:00.000Z',
    historial: [],
  };
}

describe('SeguroImpagoSection · métricas y filtros', () => {
  it('excluye clasificaciones IA/heredadas no verificadas de métricas y filtros de dictamen', () => {
    const expedientes = [
      crearSolicitud('REF-LEGACY', 'FAVORABLE', false, 'CORREO_ENVIADO'),
      crearSolicitud('REF-VERIFICADO', 'FAVORABLE', true),
      crearSolicitud('REF-DESFAVORABLE', 'DESFAVORABLE', true),
      crearSolicitud('REF-GMAIL', 'EN_ESTUDIO', false, 'CORREO_ENVIADO', {
        id: 'gmail-id-verificado',
        threadId: 'gmail-thread-verificado',
        fechaConfirmacion: '2026-10-20T10:00:00.000Z',
      }),
    ];

    render(
      <SeguroImpagoSection
        solicitudesSeguro={expedientes}
        aseguradoras={[]}
        candidatos={[]}
        inmuebles={[]}
        onOpenCrearModal={vi.fn()}
        onOpenConfigModal={vi.fn()}
        onOpenDetalleModal={vi.fn()}
        onDeleteSolicitud={vi.fn()}
      />,
    );

    const favorableCard = screen.getByText('Dictámenes favorables contrastados').parentElement;
    const gmailCard = screen.getByText('Aceptación de envío por Gmail').parentElement;
    expect(favorableCard?.textContent).toContain('1');
    expect(gmailCard?.textContent).toContain('1');
    expect(screen.getByText('REF-LEGACY')).toBeTruthy();
    expect(screen.getByText('Estado heredado · revisar Gmail')).toBeTruthy();
    expect(screen.getAllByText('Pendiente de contraste humano')).toHaveLength(2);

    const filtros = screen.getAllByRole('combobox');
    fireEvent.change(filtros[1], { target: { value: 'FAVORABLE' } });

    expect(screen.getByText('REF-VERIFICADO')).toBeTruthy();
    expect(screen.queryByText('REF-LEGACY')).toBeNull();
    expect(screen.queryByText('REF-DESFAVORABLE')).toBeNull();
  });
});
