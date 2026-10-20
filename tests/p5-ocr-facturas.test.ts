import { describe, expect, it, vi } from 'vitest';
import type { Gasto, Inmueble } from '../src/types';
import { extraerCamposFactura, esArchivoOcrAdmitido, claveFacturaOcr } from '../src/lib/ocrFactura';
import { construirGastoOcr, construirClaveOcr, confirmarGastoConFactura, duplicadoFacturaOcr, importeDesdeTexto } from '../src/lib/flujoFacturaOcr';

const OCR = `ACME REPARACIONES SL\nNIF: B12345678\nFactura nº: F-2026/031\nFecha de emisión: 14/03/2026\nConcepto: Reparación de persiana\nBase imponible: 100,00 €\nIVA 21%\nCuota IVA: 21,00 €\nTotal factura: 121,00 €`;
const gastoBase: Gasto = {
  id: 'gas_ocr_test', inmuebleId: 'inmueble-a', propietarioId: 'prop-a', tipo: 'EXPLOTACION', categoria: 'REPARACION',
  concepto: 'Reparación', importe: 121, estado: 'PENDIENTE', aCargoDe: 'arrendador', deducible: false,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  facturaOcr: { version: 1, sha256Documento: 'hash-a', claveDeduplicacion: 'factura:b12345678:f-2026/031', procesadoEl: '2026-01-01', confianzaOcr: 90, camposReconocidos: {}, camposConfirmados: {} },
};
const inmueble = { id: 'inmueble-a', propietarioId: 'prop-a', direccion: 'Calle Uno 1' } as Inmueble;

describe('P5 · OCR local y extracción conservadora', () => {
  it('extrae campos presentes en una factura española, sin calcular los ausentes', () => {
    const fields = extraerCamposFactura(OCR, 92);
    expect(fields.proveedor.valor).toContain('ACME');
    expect(fields.nifProveedor.valor).toBe('B12345678');
    expect(fields.numeroFactura.valor).toBe('F-2026/031');
    expect(fields.fechaEmision.valor).toBe('2026-03-14');
    expect(fields.baseImponible.valor).toContain('100,00');
    expect(fields.tipoIva.valor).toBe('21');
    expect(fields.importeIva.valor).toContain('21,00');
    expect(fields.importeTotal.valor).toContain('121,00');
    expect(fields.concepto.valor).toBe('Reparación de persiana');
    expect(fields.otrosImpuestos.estado).toBe('AUSENTE');
  });

  it('marca ausencias y rebaja a dudoso un resultado de baja confianza', () => {
    const fields = extraerCamposFactura('Factura nº: A-9\nTotal: 10,00 €', 40);
    expect(fields.proveedor.estado).toBe('AUSENTE');
    expect(fields.importeTotal.estado).toBe('DUDOSO');
    expect(fields.baseImponible.estado).toBe('AUSENTE');
  });

  it('valida extensiones, tipo y tamaño sin leer contenido no admitido', () => {
    expect(esArchivoOcrAdmitido({ name: 'factura.pdf', type: 'application/pdf', size: 10 })).toBeUndefined();
    expect(esArchivoOcrAdmitido({ name: 'factura.pdf', type: 'image/png', size: 10 })).toMatch(/coinciden/);
    expect(esArchivoOcrAdmitido({ name: 'factura.exe', type: 'application/pdf', size: 10 })).toMatch(/coinciden/);
    expect(esArchivoOcrAdmitido({ name: 'factura.png', type: 'image/png', size: 20 * 1024 * 1024 + 1 })).toMatch(/20 MB/);
  });

  it('interpreta importes españoles/anglosajones y crea una clave estable de factura', () => {
    expect(importeDesdeTexto('1.234,56 €')).toBe(1234.56);
    expect(importeDesdeTexto('1,234.56')).toBe(1234.56);
    expect(importeDesdeTexto('1.234 €')).toBe(1234);
    expect(importeDesdeTexto('1234.50 €')).toBe(1234.5);
    expect(importeDesdeTexto('texto')).toBeUndefined();
    const campos = extraerCamposFactura(OCR);
    expect(claveFacturaOcr(campos, 'hash')).toBe('factura:b12345678:f2026031');
    expect(construirClaveOcr(campos, 'hash')).toBe('factura:b12345678:f2026031');
  });

  it('evita una segunda alta para la misma clave o huella', () => {
    expect(duplicadoFacturaOcr([gastoBase], 'factura:b12345678:f-2026/031', 'otro')).toBe(gastoBase);
    expect(duplicadoFacturaOcr([gastoBase], 'otra-factura', 'hash-a')).toBe(gastoBase);
    const corregido = { ...gastoBase, facturaOcr: { ...gastoBase.facturaOcr!, claveDeduplicacion: 'otro-id', nifProveedor: 'B12345678', numeroFactura: 'F-2026/031' } };
    expect(duplicadoFacturaOcr([corregido], 'factura:b12345678:f2026031', 'otra-foto')).toBe(corregido);
    expect(duplicadoFacturaOcr([gastoBase], 'distinta', 'distinta')).toBeUndefined();
  });

  it('mantiene reconocidos y confirmados separados y crea el gasto como pendiente', () => {
    const campos = extraerCamposFactura(OCR, 92);
    const gasto = construirGastoOcr({
      datos: { inmuebleId: inmueble.id, concepto: 'Concepto corregido', proveedor: 'ACME Reparaciones', importeTotal: 121, categoria: 'REPARACION', aCargoDe: 'arrendador', numeroFactura: 'F-2026/031' },
      camposReconocidos: campos, confianzaOcr: 92, sha256Documento: 'hash-a', claveDeduplicacion: 'factura:b12345678:f-2026/031', inmueble, fechaProceso: '2026-03-14T12:00:00.000Z',
    });
    expect(gasto.estado).toBe('PENDIENTE');
    expect(gasto.fechaPago).toBeUndefined();
    expect(gasto.facturaOcr?.camposReconocidos.concepto).toBe('Reparación de persiana');
    expect(gasto.facturaOcr?.camposConfirmados.concepto).toBe('Concepto corregido');
    expect(gasto.facturaOcr?.camposConfirmados.importeTotal).toBe('121');
  });
});

describe('P5 · confirmación y custodia documental', () => {
  const gasto = construirGastoOcr({
    datos: { inmuebleId: inmueble.id, concepto: 'Reparación', proveedor: 'ACME', importeTotal: 121, categoria: 'REPARACION', aCargoDe: 'arrendador' },
    camposReconocidos: extraerCamposFactura(OCR), confianzaOcr: 90, sha256Documento: 'hash-z', claveDeduplicacion: 'documento:hash-z', inmueble,
  });
  const documento = { id: 'doc_12345678', nombre: 'factura.pdf', storagePath: 'inmuebles/inmueble-a/documentos_patrimoniales/doc_12345678/factura.pdf' } as any;

  it('no escribe nada si el usuario cancela antes de confirmar', () => {
    const guardar = vi.fn();
    const subir = vi.fn();
    // El flujo mutante sólo se invoca desde la acción explícita de confirmación.
    expect(guardar).not.toHaveBeenCalled();
    expect(subir).not.toHaveBeenCalled();
  });

  it('guarda el gasto, custodia el original P3 y deja referencias cruzadas', async () => {
    const guardar = vi.fn(async (g: Gasto) => g);
    const subir = vi.fn(async () => documento);
    const eliminar = vi.fn();
    const result = await confirmarGastoConFactura({ gasto, guardarGasto: guardar, subirDocumento: subir, eliminarGasto: eliminar });
    expect(guardar).toHaveBeenCalledTimes(2);
    expect(subir).toHaveBeenCalledWith(expect.objectContaining({ id: gasto.id }));
    expect(result.documento).toMatchObject({ id: documento.id, storagePath: documento.storagePath, url: '' });
    expect(result.facturaOcr?.documentoId).toBe(documento.id);
    expect(result.estado).toBe('PENDIENTE');
    expect(eliminar).not.toHaveBeenCalled();
  });

  it('reversa gasto si la custodia documental falla y no presenta éxito', async () => {
    const guardar = vi.fn(async (g: Gasto) => g);
    const subir = vi.fn(async () => { throw new Error('STORAGE_NO_DISPONIBLE'); });
    const eliminar = vi.fn(async () => undefined);
    await expect(confirmarGastoConFactura({ gasto, guardarGasto: guardar, subirDocumento: subir, eliminarGasto: eliminar })).rejects.toThrow('STORAGE_NO_DISPONIBLE');
    expect(eliminar).toHaveBeenCalledWith(gasto.id);
    expect(guardar).toHaveBeenCalledTimes(1);
  });

  it('no oculta que la reversión también puede fallar', async () => {
    const falloStorage = new Error('STORAGE_NO_DISPONIBLE');
    const guardar = vi.fn(async (g: Gasto) => g);
    await expect(confirmarGastoConFactura({
      gasto, guardarGasto: guardar, subirDocumento: async () => { throw falloStorage; },
      eliminarGasto: async () => { throw new Error('offline'); },
    })).rejects.toThrow(/No se pudo guardar el documento ni revertir el gasto/);
  });

  it('si falla el segundo guardado conserva gasto y documento para completar el enlace por reintento', async () => {
    const guardar = vi.fn().mockResolvedValueOnce(gasto).mockRejectedValueOnce(new Error('firestore offline'));
    const subir = vi.fn(async () => documento);
    const eliminar = vi.fn();
    await expect(confirmarGastoConFactura({ gasto, guardarGasto: guardar, subirDocumento: subir, eliminarGasto: eliminar }))
      .rejects.toThrow(/Reprocesa esta misma factura/);
    expect(guardar).toHaveBeenCalledTimes(2);
    expect(subir).toHaveBeenCalledOnce();
    expect(eliminar).not.toHaveBeenCalled();
  });
});
