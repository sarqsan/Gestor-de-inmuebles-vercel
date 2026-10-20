/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const subirDocumento = vi.fn();
vi.mock('../../lib/expedienteDocumental/gestorFirebase', () => ({ subirDocumentoPatrimonial: (...args: unknown[]) => subirDocumento(...args) }));
vi.mock('../../lib/ocrFactura', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/ocrFactura')>();
  return { ...actual, reconocerDocumentoLocal: vi.fn(async () => ({
    texto: 'Proveedor: ACME Reparaciones SL\nNIF: B12345678\nFactura nº: F-2026-031\nFecha de emisión: 14/03/2026\nConcepto: Reparación de persiana\nBase imponible: 100,00 €\nIVA 21%\nCuota IVA: 21,00 €\nTotal factura: 121,00 €',
    confianza: 91,
  })), huellaFacturaOcr: vi.fn(async () => 'a'.repeat(64)) };
});

import type { Gasto, Inmueble, UsuarioApp } from '../../types';
import { reconocerDocumentoLocal } from '../../lib/ocrFactura';
import { EscanerFacturaModal } from './EscanerFacturaModal';

const INMUEBLE = { id: 'inm-1', propietarioId: 'prop-1', direccion: 'Calle Uno 1', ciudad: 'Alicante' } as Inmueble;
const USUARIO = { id: 'uid-1', nombre: 'Gestora', email: 'gestora@example.test' } as UsuarioApp;
const DOC = { id: 'doc_12345678', nombre: 'factura.png', storagePath: 'inmuebles/inm-1/documentos_patrimoniales/doc_12345678/factura.png' } as any;

afterEach(() => { cleanup(); vi.clearAllMocks(); });
function renderEscaner(onSave = vi.fn(async (g: Gasto) => g), onDelete = vi.fn(), gastos: Gasto[] = []) {
  const onClose = vi.fn();
  render(<EscanerFacturaModal gastos={gastos} inmuebles={[INMUEBLE]} currentUser={USUARIO} onSave={onSave} onDelete={onDelete} onClose={onClose} />);
  return { onSave, onDelete, onClose };
}
async function seleccionarFactura() {
  const input = screen.getByLabelText(/Selecciona o captura una factura/i) as HTMLInputElement;
  const file = new File(['fake image bytes'], 'factura.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByLabelText(/Proveedor \/ razón social/);
}

describe('P5 · revisión visible antes de cualquier persistencia', () => {
  it('cancelar después del OCR no crea gasto ni sube el documento', async () => {
    const { onSave, onClose } = renderEscaner();
    await seleccionarFactura();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(subirDocumento).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('permite corregir valores y sólo confirma después de elegir el responsable del gasto', async () => {
    subirDocumento.mockResolvedValue({ documento: DOC, duplicado: false });
    const { onSave } = renderEscaner();
    await seleccionarFactura();
    fireEvent.change(screen.getByLabelText(/Proveedor \/ razón social/), { target: { value: 'Proveedor corregido SL' } });
    fireEvent.change(screen.getByLabelText(/Importe total/), { target: { value: '125,00' } });
    fireEvent.change(screen.getByLabelText('Quién asume el gasto *'), { target: { value: 'arrendador' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar y añadir gasto/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    const primero = onSave.mock.calls[0][0];
    const segundo = onSave.mock.calls[1][0];
    expect(primero).toMatchObject({ importe: 125, proveedor: 'Proveedor corregido SL', estado: 'PENDIENTE', inmuebleId: 'inm-1' });
    expect(primero.fechaPago).toBeUndefined();
    expect(primero.facturaOcr.camposReconocidos.importeTotal).toBe('121,00');
    expect(primero.facturaOcr.camposConfirmados.importeTotal).toBe('125');
    expect(subirDocumento).toHaveBeenCalledWith(expect.objectContaining({ inmuebleId: 'inm-1', tipo: 'FACTURA_GASTO', relaciones: { gastoId: primero.id } }));
    expect(segundo.documento).toMatchObject({ id: DOC.id, storagePath: DOC.storagePath, url: '' });
    expect(segundo.facturaOcr.documentoId).toBe(DOC.id);
  });
});

describe('P5.2 · errores por etapa, abonos y posibles duplicados en la UI', () => {
  async function prepararConfirmacion() {
    await seleccionarFactura();
    fireEvent.change(screen.getByLabelText('Quién asume el gasto *'), { target: { value: 'arrendador' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar y añadir gasto/ }));
  }

  it('etapa 1: si el guardado del gasto falla, no sube el documento ni muestra éxito', async () => {
    const onSave = vi.fn(async () => { throw new Error('permission-denied'); });
    renderEscaner(onSave as never);
    await prepararConfirmacion();
    expect((await screen.findByRole('alert')).textContent).toMatch(/No se pudo guardar el gasto/);
    expect(subirDocumento).not.toHaveBeenCalled();
    expect(screen.queryByText(/Factura incorporada/)).toBeNull();
  });

  it('etapa 3: si falla la segunda escritura (enlace), muestra el estado real sin éxito', async () => {
    subirDocumento.mockResolvedValue({ documento: DOC, duplicado: false });
    const onSave = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'));
    renderEscaner(onSave as never);
    await prepararConfirmacion();
    expect((await screen.findByRole('alert')).textContent).toMatch(/referencia cruzada/);
    expect(screen.queryByText(/Factura incorporada/)).toBeNull();
  });

  it('abono/rectificativa: total negativo se bloquea con mensaje específico y no guarda nada', async () => {
    vi.mocked(reconocerDocumentoLocal).mockResolvedValueOnce({
      texto: 'Proveedor: ACME SL\nNIF: B12345674\nFactura nº: R-1\nConcepto: Devolución de material\nTotal factura: -121,00 €',
      confianza: 90,
    });
    const { onSave } = renderEscaner();
    await prepararConfirmacion();
    expect((await screen.findByRole('alert')).textContent).toMatch(/abono o rectificativa/);
    expect(onSave).not.toHaveBeenCalled();
    expect(subirDocumento).not.toHaveBeenCalled();
  });

  it('gasto manual coincidente: avisa como posible sin bloquear ni modificarlo', async () => {
    const manual = {
      id: 'gas_manual', inmuebleId: 'inm-1', propietarioId: 'prop-1', tipo: 'EXPLOTACION', categoria: 'REPARACION',
      concepto: 'Reparación de persiana', proveedor: 'ACME Reparaciones SL', importe: 121, estado: 'PAGADO',
      fechaDevengo: '2026-03-14', aCargoDe: 'arrendador', deducible: true,
      justificanteUrl: 'https://storage.example/f.pdf',
      createdAt: '2026-03-14T00:00:00.000Z', updatedAt: '2026-03-14T00:00:00.000Z',
    } as Gasto;
    const { onSave, onDelete } = renderEscaner(undefined, undefined, [manual]);
    await seleccionarFactura();
    expect(await screen.findByText(/Posibles coincidencias para revisar/)).toBeTruthy();
    const boton = screen.getByRole('button', { name: /Confirmar y añadir gasto/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalledWith('gas_manual');
  });
});
