/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ContratoFormalizacion } from '../types';
import type { PreviewActualizacionRenta } from '../utils/actualizacionRentaEngine';

const { previsualizarMock, confirmarMock } = vi.hoisted(() => ({ previsualizarMock: vi.fn(), confirmarMock: vi.fn() }));
vi.mock('../lib/actualizacionRentaApi', () => ({
  previsualizarActualizacionRenta: previsualizarMock,
  confirmarActualizacionRenta: confirmarMock,
  ErrorApiActualizacionRenta: class ErrorApiActualizacionRenta extends Error {},
}));

import { ActualizacionRentaPreviewPanel } from './ActualizacionRentaPreviewPanel';

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const contrato = {
  id: 'contrato-a',
  inmuebleNombre: 'Piso A',
  fechaInicioContrato: '2025-10-17',
  rentaMensual: 1_000,
} as unknown as ContratoFormalizacion;

const preview: PreviewActualizacionRenta = {
  estado: 'REQUIERE_REVISION',
  contratoId: 'contrato-a',
  propietarioId: 'propietario-a',
  modalidad: 'VIVIENDA_HABITUAL',
  finalidadUso: 'Vivienda habitual',
  referenciaContrato: 'contratos/a.pdf',
  evidenciaClausula: { estado: 'ACREDITADA', textoExtracto: 'Actualización conforme a índice.', referenciaDocumental: 'contratos/a.pdf#4', mecanismo: 'SIN_DETALLAR' },
  fechaCelebracion: '2026-10-08',
  fechaInicioContrato: '2025-10-17',
  fechaAniversario: '2026-10-17',
  fechaEfectividad: null,
  rentaActual: 1_000,
  codigo: 'COHORTE_EXTRAORDINARIA_REQUIERE_REVISION',
  motivo: 'La matriz normativa por cohorte no está cerrada.',
  baseLegal: ['https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20823'],
  fuentesOficiales: [{
    organismo: 'BOE', identificador: 'RDL 29/2026 · texto original · BOE-A-2026-20823',
    url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20823',
    fechaPublicacion: '2026-10-07', fechaEntradaVigor: '2026-10-08', fechaConsulta: '2026-10-17',
  }],
  comunicado: 'NO_COMUNICADO',
  estadoAviso: 'NO_PROGRAMADO',
};

describe('ActualizacionRentaPreviewPanel', () => {
  it('presenta los datos y fuentes devueltos por el servidor sin permitir confirmar, persistir ni enviar', async () => {
    previsualizarMock.mockResolvedValue({ preview, huellaPreview: 'a'.repeat(64) });
    render(<ActualizacionRentaPreviewPanel contrato={contrato} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previsualizar' }));

    await waitFor(() => expect(screen.getByText('REQUIERE_REVISION · no se propone importe')).toBeTruthy());
    expect(previsualizarMock).toHaveBeenCalledWith('contrato-a', undefined);
    expect(screen.getByText('2026-10-08')).toBeTruthy();
    expect(screen.getByText((_, node) => node?.textContent === '2025-10-17 · 2026-10-17')).toBeTruthy();
    expect(screen.getByText('No aplicable / no disponible')).toBeTruthy();
    expect(screen.getByText('Ningún importe propuesto')).toBeTruthy();
    expect(screen.getByText((_, node) => node?.textContent === 'Sin determinar · No comunicado')).toBeTruthy();
    expect(screen.getByText('La matriz normativa por cohorte no está cerrada.')).toBeTruthy();
    expect(screen.getByText(/BOE-A-2026-20823/).closest('a')?.getAttribute('href')).toBe('https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20823');
    expect(screen.getByText(/El estado calculable es aritmético, no autorización jurídica/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /confirmar|aplicar|enviar/i })).toBeNull();
  });

  it('solo confirma con checkbox, fecha elegida y devuelve aviso pendiente sin afirmar envío', async () => {
    const calculable: PreviewActualizacionRenta = {
      ...preview,
      estado: 'CALCULABLE',
      fechaAniversario: '2026-10-01', fechaEfectividad: '2026-10-01',
      evidenciaComunicacion: { fecha: '2026-09-20', referenciaDocumental: 'fixture.pdf', declaradaPorActor: true },
      codigo: undefined,
      motivo: undefined,
      porcentajeAplicado: 2,
      importeIncremento: 20,
      rentaFutura: 1_020,
      indice: {
        serie: 'IRAV1', periodo: '2026M09', estado: 'DEFINITIVO', valorPct: 2.54,
        publicadoEn: '2026-10-14', consultadoEn: '2026-10-17',
        urlSerie: 'https://www.ine.es/consul/serie.do?d=true&s=IRAV1',
        urlCalendario: 'https://www.ine.es/dynt3/Calendario/calenHTML.htm',
      },
      topes: { iravPct: 2.54, aplicable: ['IRAV art. 18'] },
    };
    previsualizarMock.mockResolvedValue({ preview: calculable, huellaPreview: 'a'.repeat(64) });
    confirmarMock.mockResolvedValue({
      estado: 'CREADA', contratoId: 'contrato-a', anexoId: 'anexo-a-v1', avisoId: 'aviso-a',
      version: 1, fechaAniversario: '2026-10-17', fechaProgramadaAviso: '2026-10-20',
      estadoAviso: 'PENDIENTE_ENVIO', comunicado: 'NO_COMUNICADO', fechaEfectividad: '2026-10-01',
      estadoActualizacion: 'EFECTIVA', rentaVigente: 1020,
    });
    render(<ActualizacionRentaPreviewPanel contrato={contrato} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previsualizar' }));
    await screen.findByText('Previsualización calculable (sin confirmar)');
    const boton = screen.getByRole('button', { name: 'Confirmar y aplicar renta' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Fecha elegida para programar la comunicación'), { target: { value: '2026-10-20' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo expresamente/ }));
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    await screen.findByRole('status');
    expect(confirmarMock).toHaveBeenCalledWith(expect.objectContaining({
      contratoId: 'contrato-a', huellaPreview: 'a'.repeat(64),
      fechaProgramadaAviso: '2026-10-20', confirmacionExplicita: true,
      idempotencyKey: expect.any(String),
    }));
    expect(screen.getByRole('status').textContent).toContain('Efectiva desde 2026-10-01');
    expect(screen.getByRole('status').textContent).toContain('1020');
    expect(screen.getByText('Actualización efectiva registrada')).toBeTruthy();
    expect(screen.getByText(/La aplicación no ha enviado este aviso/)).toBeTruthy();
  });

  it('deshabilita consulta desde una tarjeta sin permiso visible', () => {
    render(<ActualizacionRentaPreviewPanel contrato={contrato} disabled />);
    expect((screen.getByRole('button', { name: 'Previsualizar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(previsualizarMock).not.toHaveBeenCalled();
  });

  it('muestra fallos del endpoint sin crear estado local', async () => {
    previsualizarMock.mockRejectedValue(new Error('Firestore no disponible'));
    render(<ActualizacionRentaPreviewPanel contrato={contrato} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previsualizar' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Firestore no disponible');
    expect(screen.queryByText(/CALCULABLE|REQUIERE_REVISION/)).toBeNull();
  });

  const evidencia = { fecha: '2026-09-20', referenciaDocumental: 'fixture.pdf', declaradaPorActor: true as const };
  const calculable = { ...preview, estado: 'CALCULABLE' as const, codigo: undefined, motivo: undefined,
    fechaAniversario: '2026-10-01', fechaEfectividad: '2026-10-01', rentaFutura: 1020, porcentajeAplicado: 2,
    evidenciaComunicacion: evidencia, versionCalculo: 'P4-IRAV1-v1' };

  async function prepararConfirmacion() {
    previsualizarMock.mockResolvedValue({ preview: calculable, huellaPreview: 'a'.repeat(64) });
    render(<ActualizacionRentaPreviewPanel contrato={contrato} />);
    fireEvent.change(screen.getByLabelText('Fecha de comunicación realizada'), { target: { value: evidencia.fecha } });
    fireEvent.change(screen.getByLabelText('Referencia documental de la comunicación'), { target: { value: evidencia.referenciaDocumental } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Declaro que/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Previsualizar' }));
    await screen.findByText('Previsualización calculable (sin confirmar)');
    expect(previsualizarMock).toHaveBeenCalledWith('contrato-a', evidencia);
    fireEvent.change(screen.getByLabelText('Fecha elegida para programar la comunicación'), { target: { value: '2026-10-20' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo expresamente/ }));
  }

  it('cancelar no confirma ni cambia la renta y cambiar evidencia invalida el preview', async () => {
    await prepararConfirmacion();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar sin aplicar' }));
    expect(confirmarMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
    expect(contrato.rentaMensual).toBe(1000);
    fireEvent.click(screen.getByRole('button', { name: 'Previsualizar' }));
    await screen.findByText('Previsualización calculable (sin confirmar)');
    fireEvent.change(screen.getByLabelText('Referencia documental de la comunicación'), { target: { value: 'otra.pdf' } });
    expect(screen.queryByRole('button', { name: 'Confirmar y aplicar renta' })).toBeNull();
  });

  it('doble pulsación no duplica; fallo no muestra éxito y el reintento conserva la clave', async () => {
    let rechazar!: (error: Error) => void;
    confirmarMock.mockImplementationOnce(() => new Promise((_, reject) => { rechazar = reject; }));
    await prepararConfirmacion();
    const boton = screen.getByRole('button', { name: 'Confirmar y aplicar renta' });
    fireEvent.click(boton);
    fireEvent.click(boton);
    expect(confirmarMock).toHaveBeenCalledTimes(1);
    rechazar(new Error('Resultado incierto'));
    await screen.findByText('Resultado incierto');
    expect(screen.queryByRole('status')).toBeNull();
    confirmarMock.mockResolvedValueOnce({ estado: 'REPETIDA', estadoActualizacion: 'EFECTIVA', rentaVigente: 1020,
      anexoId: 'fixture', avisoId: 'aviso', fechaEfectividad: '2026-10-01', estadoAviso: 'PENDIENTE_ENVIO' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y aplicar renta' }));
    await screen.findByRole('status');
    expect(confirmarMock).toHaveBeenCalledTimes(2);
    expect(confirmarMock.mock.calls[0][0].idempotencyKey).toBe(confirmarMock.mock.calls[1][0].idempotencyKey);
  });

  it('no permite aplicar una fecha efectiva futura', async () => {
    previsualizarMock.mockResolvedValue({ preview: { ...calculable, fechaEfectividad: '2099-01-01' }, huellaPreview: 'a'.repeat(64) });
    render(<ActualizacionRentaPreviewPanel contrato={contrato} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previsualizar' }));
    await screen.findByText('Previsualización calculable (sin confirmar)');
    fireEvent.change(screen.getByLabelText('Fecha elegida para programar la comunicación'), { target: { value: '2099-01-01' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo expresamente/ }));
    expect((screen.getByRole('button', { name: 'Confirmar y aplicar renta' }) as HTMLButtonElement).disabled).toBe(true);
    expect(confirmarMock).not.toHaveBeenCalled();
  });

});
