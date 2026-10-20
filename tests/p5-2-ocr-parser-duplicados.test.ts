import { describe, expect, it, vi } from 'vitest';
import type { Gasto, Inmueble } from '../src/types';
import { extraerCamposFactura, claveFacturaOcr } from '../src/lib/ocrFactura';
import {
  construirClaveOcr,
  confirmarGastoConFactura,
  esReintentoVinculoOcr,
  evaluarDuplicadosFacturaOcr,
  idGastoOcr,
} from '../src/lib/flujoFacturaOcr';

/**
 * P5.2 — Regresiones de los defectos D-02…D-05, D-09 y D-10 del informe
 * AG-05.1 (reproducciones R1–R10 con textos sintéticos, sin documentos reales).
 */

describe('P5.2-B · parser: subtotal, multilínea y totales', () => {
  it('R1: «Subtotal» ya no se extrae como importe total', () => {
    const campos = extraerCamposFactura('FONTANERIA LUIS SL\nSubtotal: 100,00 €\nIVA 21%: 21,00 €\nTotal factura: 121,00 €', 95);
    expect(campos.importeTotal.valor).toBe('121,00');
    expect(campos.importeIva.valor).toBe('21,00');
  });

  it('R6: «Total líneas» no enmascara el «Total a pagar» posterior', () => {
    const campos = extraerCamposFactura('Total líneas: 80,00 €\nDescuento: 5,00 €\nTotal a pagar: 90,75 €', 95);
    expect(campos.importeTotal.valor).toBe('90,75');
    expect(campos.importeTotal.estado).toBe('RECONOCIDO');
  });

  it('R4: un importe sin símbolo no concatena la cifra de la línea siguiente', () => {
    const campos = extraerCamposFactura('Base imponible: 100,00\n21% IVA\nTotal factura: 121,00 €', 95);
    expect(campos.baseImponible.valor).toBe('100,00');
    expect(campos.tipoIva.valor).toBe('21');
    expect(campos.importeTotal.valor).toBe('121,00');
  });

  it('R3: «IVA incluido» previo no impide leer el tipo «IVA 21%»', () => {
    const campos = extraerCamposFactura('Precios con IVA incluido\nBase imponible: 100,00 €\nIVA 21%\nCuota IVA: 21,00 €\nTotal: 121,00 €', 95);
    expect(campos.tipoIva.valor).toBe('21');
  });

  it('fecha «F. emisión» se reconoce y no se contamina con el vencimiento', () => {
    const campos = extraerCamposFactura('F. emisión 01/04/2026\nVencimiento: 30/04/2026\nTotal: 10,00 €', 95);
    expect(campos.fechaEmision.valor).toBe('2026-04-01');
  });

  it('P5.3: miles separados por espacio se leen completos («1 234,56» no es «1»)', () => {
    const campos = extraerCamposFactura('SUMINISTROS SL\nBase imponible: 1 000,00 €\nTotal factura: 1 210,00 €', 95);
    expect(campos.baseImponible.valor).toBe('1000,00');
    expect(campos.importeTotal.valor).toBe('1210,00');
  });

  it('abono: el total negativo se conserva pero queda DUDOSO, nunca fiable', () => {
    const campos = extraerCamposFactura('ACME SL\nTotal factura: -121,00 €', 95);
    expect(campos.importeTotal.valor).toBe('-121,00');
    expect(campos.importeTotal.estado).toBe('DUDOSO');
  });
});

describe('P5.2-B · parser: NIF del emisor', () => {
  it('R2: no captura el texto contiguo tras el CIF en la misma línea', () => {
    const campos = extraerCamposFactura('ACME SL CIF: B12345674 Calle Mayor 3 Alicante\nFactura nº: 2026/001\nTotal: 50,00 €', 95);
    expect(campos.nifProveedor.valor).toBe('B12345674');
    expect(campos.proveedor.valor).toBe('ACME SL');
  });

  it('R5: con NIF de cliente y de emisor, elige el del emisor', () => {
    const campos = extraerCamposFactura('Cliente: Juan Pérez\nNIF: 12345678Z\nEmisor: TALLERES SUR SL\nNIF: B12345674\nFactura nº: A-55\nTotal: 200,00 €', 95);
    expect(campos.nifProveedor.valor).toBe('B12345674');
    expect(campos.nifProveedor.estado).toBe('RECONOCIDO');
  });

  it('dos NIF sin contexto de emisor quedan DUDOSOS (sin confirmar)', () => {
    const campos = extraerCamposFactura('NIF: 12345678Z\nNIF: B12345674\nFactura nº: A-1\nTotal: 10,00 €', 95);
    expect(campos.nifProveedor.estado).toBe('DUDOSO');
  });

  it('P5.3: DNI de emisor autónomo con letra de control válida es RECONOCIDO', () => {
    const campos = extraerCamposFactura('Emisor: María Fontanera\nNIF: 12345678Z\nFactura nº: 7\nTotal: 60,50 €', 95);
    expect(campos.nifProveedor.valor).toBe('12345678Z');
    expect(campos.nifProveedor.estado).toBe('RECONOCIDO');
  });

  it('un NIF con formato pero control inválido queda DUDOSO, no RECONOCIDO', () => {
    const campos = extraerCamposFactura('NIF: B12345678\nFactura nº: A-1\nTotal: 10,00 €', 95);
    expect(campos.nifProveedor.valor).toBe('B12345678');
    expect(campos.nifProveedor.estado).toBe('DUDOSO');
  });
});

const inmuebleA = { id: 'inm-a', propietarioId: 'prop-1', direccion: 'Calle A 1' } as Inmueble;
const OCR_TEXTO = 'Proveedor: ACME Reparaciones SL\nNIF: B12345674\nFactura nº: F-2026/031\nFecha de emisión: 14/03/2026\nConcepto: Reparación\nTotal factura: 121,00 €';
const camposEntrada = extraerCamposFactura(OCR_TEXTO, 95);
const SHA = 'c'.repeat(64);

const gastoOcr = (inmuebleId: string, clave: string, completo = true): Gasto => ({
  id: idGastoOcr(clave), inmuebleId, propietarioId: 'prop-1', tipo: 'EXPLOTACION', categoria: 'REPARACION',
  concepto: 'Reparación', proveedor: 'ACME Reparaciones SL', importe: 121, estado: 'PENDIENTE',
  fechaDevengo: '2026-03-14', aCargoDe: 'arrendador', deducible: false, origen: 'FACTURA',
  createdAt: '2026-03-14T00:00:00.000Z', updatedAt: '2026-03-14T00:00:00.000Z',
  ...(completo ? { documento: { id: 'doc_1', nombre: 'f.pdf', url: '', storagePath: `inmuebles/${inmuebleId}/documentos_patrimoniales/doc_1/f.pdf` } } : {}),
  facturaOcr: {
    version: 1, sha256Documento: SHA, claveDeduplicacion: clave, procesadoEl: '2026-03-14',
    confianzaOcr: 90, camposReconocidos: { nifProveedor: 'B12345674', numeroFactura: 'F-2026/031' },
    camposConfirmados: { nifProveedor: 'B12345674', numeroFactura: 'F-2026/031' },
    nifProveedor: 'B12345674', numeroFactura: 'F-2026/031',
    ...(completo ? { documentoId: 'doc_1' } : {}),
  },
});

describe('P5.2-C · duplicados por inmueble', () => {
  const claveNueva = construirClaveOcr(camposEntrada, SHA, inmuebleA.id);
  const claveLegada = construirClaveOcr(camposEntrada, SHA);

  it('la clave incluye el inmueble: IDs distintos entre inmuebles, estable en el mismo', () => {
    expect(claveNueva).toBe(`factura:${inmuebleA.id}:b12345674:f2026031`);
    expect(claveLegada).toBe('factura:b12345674:f2026031');
    expect(idGastoOcr(construirClaveOcr(camposEntrada, SHA, 'inm-b'))).not.toBe(idGastoOcr(claveNueva));
    expect(idGastoOcr(construirClaveOcr(camposEntrada, SHA, inmuebleA.id))).toBe(idGastoOcr(claveNueva));
    expect(claveFacturaOcr(camposEntrada, SHA)).toBe(claveLegada);
  });

  it('la misma factura en el MISMO inmueble es duplicado exacto (clave nueva y legada P5)', () => {
    for (const previo of [gastoOcr(inmuebleA.id, claveNueva), gastoOcr(inmuebleA.id, claveLegada)]) {
      const ev = evaluarDuplicadosFacturaOcr([previo], { clave: claveNueva, sha256: 'otra-huella', inmuebleId: inmuebleA.id });
      expect(ev.exacto).toBe(previo);
    }
  });

  it('R10: la misma factura en OTRO inmueble NO bloquea: es solo posible', () => {
    const otro = gastoOcr('inm-b', construirClaveOcr(camposEntrada, SHA, 'inm-b'));
    const ev = evaluarDuplicadosFacturaOcr([otro], { clave: claveNueva, sha256: SHA, inmuebleId: inmuebleA.id });
    expect(ev.exacto).toBeUndefined();
    expect(ev.posibles).toContain(otro);
  });

  it('R9: un gasto MANUAL coincidente del mismo inmueble aparece como posible', () => {
    const manual = {
      id: 'gas_manual', inmuebleId: inmuebleA.id, propietarioId: 'prop-1', tipo: 'EXPLOTACION', categoria: 'REPARACION',
      concepto: 'Reparación persiana', proveedor: 'ACME Reparaciones', importe: 121, estado: 'PAGADO',
      fechaDevengo: '2026-03-14', aCargoDe: 'arrendador', deducible: true,
      justificanteUrl: 'https://storage.example/f.pdf', justificantePath: 'gastos_facturas/prop-1/gas_manual/f.pdf',
      createdAt: '2026-03-14T00:00:00.000Z', updatedAt: '2026-03-14T00:00:00.000Z',
    } as Gasto;
    const ev = evaluarDuplicadosFacturaOcr([manual], {
      clave: claveNueva, sha256: SHA, inmuebleId: inmuebleA.id,
      importeTotal: 121, fechaEmision: '2026-03-14', proveedor: 'ACME Reparaciones SL',
    });
    expect(ev.exacto).toBeUndefined();
    expect(ev.posibles).toContain(manual);
  });

  it('falso positivo: mismo importe/proveedor pero distinta fecha (suministro mensual) no avisa', () => {
    const manual = {
      id: 'gas_luz', inmuebleId: inmuebleA.id, propietarioId: 'prop-1', tipo: 'EXPLOTACION', categoria: 'SUMINISTROS',
      concepto: 'Recibo luz', proveedor: 'ACME Reparaciones SL', importe: 121, estado: 'PAGADO',
      fechaDevengo: '2026-02-14', aCargoDe: 'arrendador', justificanteUrl: 'https://storage.example/luz.pdf',
      createdAt: '2026-02-14T00:00:00.000Z', updatedAt: '2026-02-14T00:00:00.000Z',
    } as Gasto;
    const ev = evaluarDuplicadosFacturaOcr([manual], {
      clave: claveNueva, sha256: SHA, inmuebleId: inmuebleA.id,
      importeTotal: 121, fechaEmision: '2026-03-14', proveedor: 'ACME Reparaciones SL',
    });
    expect(ev.posibles).toEqual([]);
  });

  it('los gastos ANULADOS no cuentan como duplicado', () => {
    const anulado = { ...gastoOcr(inmuebleA.id, claveNueva), estado: 'ANULADO' as Gasto['estado'] };
    const ev = evaluarDuplicadosFacturaOcr([anulado], { clave: claveNueva, sha256: SHA, inmuebleId: inmuebleA.id });
    expect(ev.exacto).toBeUndefined();
    expect(ev.posibles).toEqual([]);
  });

  it('D-10: solo un duplicado INCOMPLETO con ID estable es reintentable; el completo, nunca', () => {
    const incompleto = gastoOcr(inmuebleA.id, claveLegada, false);
    expect(esReintentoVinculoOcr(incompleto, claveNueva, claveLegada)).toBe(true);
    const completo = gastoOcr(inmuebleA.id, claveNueva, true);
    expect(esReintentoVinculoOcr(completo, claveNueva, claveLegada)).toBe(false);
  });

  it('P5.3: un incompleto ya editado hasta PAGADO no es reintentable (no sobrescribir definitivos)', () => {
    const pagado = { ...gastoOcr(inmuebleA.id, claveNueva, false), estado: 'PAGADO' as Gasto['estado'], fechaPago: '2026-03-20' };
    expect(esReintentoVinculoOcr(pagado, claveNueva, claveLegada)).toBe(false);
    const anulado = { ...gastoOcr(inmuebleA.id, claveNueva, false), estado: 'ANULADO' as Gasto['estado'] };
    expect(esReintentoVinculoOcr(anulado, claveNueva, claveLegada)).toBe(false);
  });
});

describe('P5.2-A · etapas de la confirmación', () => {
  const base: Gasto = {
    id: 'gas_ocr_x', inmuebleId: inmuebleA.id, propietarioId: 'prop-1', tipo: 'EXPLOTACION', categoria: 'REPARACION',
    concepto: 'Reparación', importe: 121, estado: 'PENDIENTE', aCargoDe: 'arrendador', deducible: false,
    createdAt: '2026-03-14T00:00:00.000Z', updatedAt: '2026-03-14T00:00:00.000Z',
    facturaOcr: { version: 1, sha256Documento: SHA, claveDeduplicacion: 'k', procesadoEl: '2026-03-14', confianzaOcr: 90, camposReconocidos: {}, camposConfirmados: {} },
  };
  const documentoOk = { id: 'doc_9', nombre: 'f.pdf', storagePath: 'inmuebles/inm-a/documentos_patrimoniales/doc_9/f.pdf', estado: 'DISPONIBLE' } as unknown as import('../src/lib/expedienteDocumental/tipos').DocumentoPatrimonial;

  it('etapa 1: si guardar lanza, no se custodia ni se borra nada', async () => {
    const subir = vi.fn();
    const eliminar = vi.fn();
    await expect(confirmarGastoConFactura({
      gasto: base,
      guardarGasto: async () => { throw new Error('permission-denied'); },
      subirDocumento: subir,
      eliminarGasto: eliminar,
    })).rejects.toThrow(/No se pudo guardar el gasto/);
    expect(subir).not.toHaveBeenCalled();
    expect(eliminar).not.toHaveBeenCalled();
  });

  it('etapa 2: un documento que no vuelve DISPONIBLE se trata como fallo de custodia (reversión)', async () => {
    const eliminar = vi.fn(async () => undefined);
    await expect(confirmarGastoConFactura({
      gasto: base,
      guardarGasto: async (g: Gasto) => g,
      subirDocumento: async () => ({ ...documentoOk, estado: 'PENDIENTE_STORAGE' }) as never,
      eliminarGasto: eliminar,
    })).rejects.toThrow(/no confirmó el documento como disponible/);
    expect(eliminar).toHaveBeenCalledWith(base.id);
  });

  it('éxito: orden gasto → custodia → enlace, con referencias verificables', async () => {
    const orden: string[] = [];
    const resultado = await confirmarGastoConFactura({
      gasto: base,
      guardarGasto: async (g: Gasto) => { orden.push(g.facturaOcr?.documentoId ? 'guardar-enlace' : 'guardar-gasto'); return g; },
      subirDocumento: async () => { orden.push('custodia'); return documentoOk; },
      eliminarGasto: async () => { orden.push('borrar'); },
    });
    expect(orden).toEqual(['guardar-gasto', 'custodia', 'guardar-enlace']);
    expect(resultado.facturaOcr?.documentoId).toBe('doc_9');
    expect(resultado.documento).toMatchObject({ id: 'doc_9', url: '' });
    expect(resultado.estado).toBe('PENDIENTE');
  });
});
