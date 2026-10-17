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
    expect(previsualizarMock).toHaveBeenCalledWith('contrato-a');
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
      estadoAviso: 'PENDIENTE_ENVIO', comunicado: 'NO_COMUNICADO', fechaEfectividad: null,
    });
    render(<ActualizacionRentaPreviewPanel contrato={contrato} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previsualizar' }));
    await screen.findByText('Previsualización calculable (sin confirmar)');
    const boton = screen.getByRole('button', { name: 'Confirmar y guardar borrador' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Fecha elegida para programar la comunicación'), { target: { value: '2026-10-20' } });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    await screen.findByRole('status');
    expect(confirmarMock).toHaveBeenCalledWith(expect.objectContaining({
      contratoId: 'contrato-a', huellaPreview: 'a'.repeat(64),
      fechaProgramadaAviso: '2026-10-20', confirmacionExplicita: true,
      idempotencyKey: expect.any(String),
    }));
    expect(screen.getByRole('status').textContent).toContain('No está comunicado ni enviado');
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
});
