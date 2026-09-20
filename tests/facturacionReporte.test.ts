import { describe, it, expect } from 'vitest';
import type { Factura } from '../src/types/facturacion';
import { calcularLinea, totalesFactura, numeroFacturaFormateado } from '../src/utils/facturacionEngine';
import {
  resumenFacturacion,
  facturacionPorEjercicio,
  desgloseIvaFacturacion,
  resumenVerifactuFacturacion,
  generarContenidoPdfFacturacion,
} from '../src/utils/facturacionReporte';

function facturaBase(overrides: Partial<Factura> = {}): Factura {
  const linea = calcularLinea({ concepto: 'Renta', cantidad: 1, precioUnitario: 1000, tipoIva: 21 });
  const totales = totalesFactura([linea]);
  return {
    id: `fac_1`,
    propietarioId: 'prop_1',
    inmuebleId: 'inm_1',
    clase: 'EMITIDA',
    tipo: 'F1',
    serie: 'ALQ',
    numero: 1,
    ejercicio: 2026,
    fechaExpedicion: '01-01-2026',
    emisor: { nombre: 'Propietario A', nif: '89890001K' },
    receptor: { nombre: 'Inquilino', nif: '12345678Z' },
    lineas: [linea],
    baseImponible: totales.baseImponible,
    cuotaIva: totales.cuotaIva,
    cuotaRetencion: totales.cuotaRetencion,
    importeTotal: totales.importeTotal,
    estado: 'EMITIDA',
    estadoFiscal: 'PENDIENTE_REMISION',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('GAP7 — Reporting de facturación (integra GAP3 sin duplicarlo)', () => {
  const emitida = facturaBase();
  const rectificativa = facturaBase({ id: 'fac_2', tipo: 'R1', numero: 2, estado: 'ACEPTADA', estadoFiscal: 'ACEPTADA' });
  const anulada = facturaBase({ id: 'fac_3', tipo: 'F1', numero: 3, estado: 'ANULADA', estadoFiscal: null });
  const rechazada = facturaBase({ id: 'fac_4', tipo: 'F1', numero: 4, estado: 'RECHAZADA', estadoFiscal: 'RECHAZADA' });

  it('resumen: excluye anuladas del importe, cuenta rectificativas y estados', () => {
    const r = resumenFacturacion([emitida, rectificativa, anulada, rechazada]);
    expect(r.totalFacturas).toBe(4);
    expect(r.emitidas).toBe(3); // emitida + rectificativa + rechazada (anulada no)
    expect(r.rectificativas).toBe(1);
    expect(r.anuladas).toBe(1);
    expect(r.aceptadas).toBe(1);
    expect(r.rechazadas).toBe(1);
  });

  it('agrupa por ejercicio', () => {
    const otraEjercicio = facturaBase({ id: 'fac_5', numero: 5, ejercicio: 2025, fechaExpedicion: '01-02-2025' });
    const por = facturacionPorEjercicio([emitida, otraEjercicio]);
    expect(por.map((e) => e.ejercicio)).toEqual([2026, 2025]);
    expect(por[0].emitidas).toBe(1);
    expect(por[1].emitidas).toBe(1);
  });

  it('desglosa IVA por tipo impositivo', () => {
    const linea4 = calcularLinea({ concepto: 'Suministro', cantidad: 1, precioUnitario: 100, tipoIva: 4 });
    const t = totalesFactura([linea4]);
    const f4 = facturaBase({
      id: 'fac_6',
      numero: 6,
      lineas: [linea4],
      baseImponible: t.baseImponible,
      cuotaIva: t.cuotaIva,
      importeTotal: t.importeTotal,
    });
    const desglose = desgloseIvaFacturacion([emitida, f4]);
    const entrada21 = desglose.find((d) => d.tipoIva === 21);
    const entrada4 = desglose.find((d) => d.tipoIva === 4);
    expect(entrada21).toBeTruthy();
    expect(entrada4).toBeTruthy();
    expect(entrada4?.baseImponible).toBe(100);
    expect(entrada4?.cuotaIva).toBe(4);
  });

  it('resume el estado VERI*FACTU', () => {
    const r = resumenVerifactuFacturacion([emitida, rectificativa, anulada, rechazada]);
    expect(r.pendientes).toBe(1); // emitida con estadoFiscal PENDIENTE_REMISION
    expect(r.aceptadas).toBe(1);
    expect(r.rechazadas).toBe(1);
  });

  it('genera contenido PDF con el molde de GAP3', () => {
    const pdf = generarContenidoPdfFacturacion([emitida, rectificativa], 'prop_1', 'Propietario A', 2026);
    expect(pdf.titulo).toContain('Facturación 2026');
    expect(pdf.secciones.length).toBeGreaterThanOrEqual(4);
    expect(pdf.notaAEAT).toContain('SHA-256');
  });

  it('formatea el número de factura para el documento', () => {
    expect(numeroFacturaFormateado('ALQ', 6, 2026)).toBe('ALQ-2026-000006');
  });
});
