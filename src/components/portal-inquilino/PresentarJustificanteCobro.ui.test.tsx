/** P2 · contrato UI del formulario del inquilino en jsdom. */
// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CobroPeriodo, RegistroJustificanteCobro } from '../../types';

const api = vi.hoisted(() => ({
  presentar: vi.fn(),
  nuevaClave: vi.fn(() => 'synthetic_ui_idempotency_0001'),
}));

vi.mock('../../lib/justificantesCobroApi', () => ({
  ErrorApiJustificantesCobro: class ErrorApiJustificantesCobro extends Error {
    constructor(message: string, readonly status: number, readonly codigo: string) { super(message); }
  },
  nuevaClaveIdempotencia: api.nuevaClave,
  presentarJustificanteCobro: api.presentar,
}));

import { PresentarJustificanteCobro } from './PresentarJustificanteCobro';

const COBRO: CobroPeriodo = {
  id: 'cobro_contrato-a_2026_10', contratoId: 'contrato-a', inmuebleId: 'inm-a',
  inquilinoId: 'inquilino-a', propietarioId: 'prop-a', mes: 10, anio: 2026,
  periodoMesAnio: '2026-10', nombreMes: 'Octubre 2026', importePrevisto: 950,
  importeRecibido: 0, fechaVencimiento: '2026-10-05', estado: 'PENDIENTE', historialCambios: [],
};

const REGISTRO_ACEPTADO: RegistroJustificanteCobro = {
  id: 'jc_' + 'a'.repeat(48), contratoId: 'contrato-a', cobroPeriodoId: COBRO.id,
  propietarioId: 'prop-a', inmuebleId: 'inm-a', estado: 'ACEPTADO', version: 3, intento: 1,
  nombreArchivo: 'comprobante.pdf', tipoMime: 'application/pdf', tamanoBytes: 128,
  importeDeclarado: 950, fechaPagoDeclarada: '2026-10-03', metodoPagoDeclarado: 'transferencia',
  subidoEn: '2026-10-04T10:00:00.000Z', actualizadoEn: '2026-10-05T10:00:00.000Z',
  subidoPorUsuarioId: 'synthetic-tenant', revisadoEn: '2026-10-05T10:00:00.000Z',
  revisadoPorUsuarioId: 'synthetic-owner',
};

beforeEach(() => {
  api.presentar.mockReset();
  api.nuevaClave.mockClear();
  window.sessionStorage.clear();
});
afterEach(() => cleanup());

describe('PresentarJustificanteCobro · UI separada de la contabilización', () => {
  it('presenta archivo, importe y datos declarados vinculados al contrato/cobro; confirma recepción documental', async () => {
    api.presentar.mockResolvedValue({ justificante: { ...REGISTRO_ACEPTADO, estado: 'PENDIENTE_REVISION' }, duplicada: false });
    const onActualizado = vi.fn().mockResolvedValue(undefined);
    render(<PresentarJustificanteCobro contratoId="contrato-a" cobro={COBRO} onActualizado={onActualizado} />);

    const archivo = new File(['%PDF-1.7 documento sintético'], 'recibo sintético.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Archivo \(PDF/), { target: { files: [archivo] } });
    fireEvent.change(screen.getByLabelText(/Importe declarado/), { target: { value: '950,00' } });
    fireEvent.change(screen.getByLabelText(/Fecha declarada/), { target: { value: '2026-10-03' } });
    fireEvent.change(screen.getByLabelText(/Método declarado/), { target: { value: 'transferencia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a gestión' }));

    await waitFor(() => expect(api.presentar).toHaveBeenCalledTimes(1));
    expect(api.presentar).toHaveBeenCalledWith(expect.objectContaining({
      contratoId: 'contrato-a', cobroPeriodoId: COBRO.id,
      claveIdempotencia: 'synthetic_ui_idempotency_0001', archivo,
      importeDeclarado: 950, fechaPagoDeclarada: '2026-10-03', metodoPagoDeclarado: 'transferencia',
    }));
    expect(screen.getByText(/pendiente de revisión humana/i)).toBeTruthy();
    expect(screen.queryByText(/no registra el cobro como recibido/i)).toBeNull();
    expect(onActualizado).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /marcar.*pagado|verificar.*pago/i })).toBeNull();
  });

  it('rechaza en la UI un MIME fuera de la lista que el servidor puede inspeccionar', () => {
    render(<PresentarJustificanteCobro contratoId="contrato-a" cobro={COBRO} onActualizado={async () => undefined} />);
    const archivoWebp = new File(['imagen sintética'], 'comprobante.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText(/Archivo/), { target: { files: [archivoWebp] } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a gestión' }));
    expect(screen.getByRole('alert').textContent).toContain('PDF, PNG o JPEG válido');
    expect(api.presentar).not.toHaveBeenCalled();
  });

  it('un documento aceptado no ofrece acciones financieras y explica que requiere evidencia bancaria', () => {
    render(<PresentarJustificanteCobro contratoId="contrato-a" cobro={COBRO} registro={REGISTRO_ACEPTADO} onActualizado={async () => undefined} />);
    expect(screen.getByText(/Justificante aceptado/i)).toBeTruthy();
    expect(screen.getByText(/no registra el cobro como recibido ni lo concilia con el banco/i)).toBeTruthy();
    expect(screen.queryByTestId(`form-justificante-${COBRO.id}`)).toBeNull();
    expect(screen.queryByRole('button', { name: /marcar.*pagado|registrar.*cobro/i })).toBeNull();
  });
});
