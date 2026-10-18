/** P2 · flujos de revisión de propietario/gestor en jsdom. */
// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ContratoFormalizacion, RegistroJustificanteCobro } from '../../types';

const api = vi.hoisted(() => ({
  consultar: vi.fn(),
  decidir: vi.fn(),
  descargar: vi.fn(),
  auditoria: vi.fn(),
  nuevaClave: vi.fn(() => 'synthetic_review_idempotency_0001'),
}));

vi.mock('../../lib/justificantesCobroApi', () => ({
  ErrorApiJustificantesCobro: class ErrorApiJustificantesCobro extends Error {
    constructor(message: string, readonly status: number, readonly codigo: string) { super(message); }
  },
  consultarJustificantesCobro: api.consultar,
  decidirJustificanteCobro: api.decidir,
  descargarArchivoJustificanteCobro: api.descargar,
  obtenerAuditoriaJustificanteCobro: api.auditoria,
  nuevaClaveIdempotencia: api.nuevaClave,
}));

import { JustificantesCobroInbox } from './JustificantesCobroInbox';

const REGISTRO_PENDIENTE: RegistroJustificanteCobro = {
  id: 'jc_' + 'b'.repeat(48), contratoId: 'contrato-a', cobroPeriodoId: 'cobro_contrato-a_2026_10',
  propietarioId: 'prop-a', inmuebleId: 'inm-a', estado: 'PENDIENTE_REVISION', version: 2, intento: 1,
  nombreArchivo: 'comprobante.pdf', tipoMime: 'application/pdf', tamanoBytes: 128,
  importeDeclarado: 950, fechaPagoDeclarada: '2026-10-03', metodoPagoDeclarado: 'transferencia',
  subidoEn: '2026-10-04T10:00:00.000Z', actualizadoEn: '2026-10-04T10:00:00.000Z',
  subidoPorUsuarioId: 'synthetic-tenant',
};

const CONTRATO = {
  id: 'contrato-a', inmuebleId: 'inm-a', propietarioId: 'prop-a', inmuebleDireccion: 'Inmueble sintético',
  registroCobros: [{ id: REGISTRO_PENDIENTE.cobroPeriodoId, nombreMes: 'Octubre 2026', periodoMesAnio: '2026-10' }],
} as unknown as ContratoFormalizacion;

beforeEach(() => {
  api.consultar.mockReset().mockResolvedValue({ items: [REGISTRO_PENDIENTE], hayMas: false });
  api.decidir.mockReset().mockResolvedValue({ justificante: { ...REGISTRO_PENDIENTE, estado: 'ACEPTADO' }, duplicada: false });
  api.descargar.mockReset().mockResolvedValue(undefined);
  api.auditoria.mockReset().mockResolvedValue({ eventos: [], hayMas: false });
  api.nuevaClave.mockClear();
});
afterEach(() => cleanup());

describe('JustificantesCobroInbox · revisión humana sin acciones financieras', () => {
  it('permite al ámbito de escritura aceptar solo el documento, con clave idempotente', async () => {
    render(<JustificantesCobroInbox contratos={[CONTRATO]} puedeEditarContrato={() => true} />);
    await screen.findByText('Octubre 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar justificante' }));
    expect(screen.getByText(/¿Aceptar el documento presentado\?/i)).toBeTruthy();
    expect(screen.getByText(/no registra el cobro ni verifica un abono bancario/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar aceptación' }));

    await waitFor(() => expect(api.decidir).toHaveBeenCalledTimes(1));
    expect(api.decidir).toHaveBeenCalledWith({
      justificanteId: REGISTRO_PENDIENTE.id,
      accion: 'ACEPTAR',
      claveIdempotencia: 'synthetic_review_idempotency_0001',
    });
    expect(api.consultar).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /registrar cobro|marcar pagado|conciliar/i })).toBeNull();
  });

  it('el modo solo lectura no ofrece decisiones; el backend sigue siendo quien autoriza', async () => {
    render(<JustificantesCobroInbox contratos={[CONTRATO]} puedeEditarContrato={() => false} />);
    await screen.findByText('Octubre 2026');
    expect(screen.getByText(/permite consultar, pero no decidir/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aceptar justificante' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rechazar con motivo' })).toBeNull();
  });
});
