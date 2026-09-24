import { describe, it, expect } from 'vitest';
import { PLANTILLAS } from '../src/notificaciones/plantillas';
import {
  eventoFacturaEmitida,
  eventoFacturaErrorRemision,
  eventoFacturaAceptada,
  eventoFacturaRechazada,
  eventoFacturaRectificada,
} from '../src/notificaciones/adaptadores';

describe('GAP7 — Notificaciones de facturación (reutilizan GAP1)', () => {
  it('registra las 5 plantillas de factoración', () => {
    expect(PLANTILLAS['facturacion.emitida']).toBeTruthy();
    expect(PLANTILLAS['facturacion.error_remision']).toBeTruthy();
    expect(PLANTILLAS['facturacion.aceptada']).toBeTruthy();
    expect(PLANTILLAS['facturacion.rechazada']).toBeTruthy();
    expect(PLANTILLAS['facturacion.rectificada']).toBeTruthy();
  });

  it('adaptador emitida usa origen FACTURACION y clave determinista', () => {
    const e = eventoFacturaEmitida({ id: 'fac_1', propietarioId: 'prop_1', numeroFactura: 'ALQ-2026-000001', importeTotal: 1210 });
    expect(e.origen).toBe('FACTURACION');
    expect(e.tipoEvento).toBe('facturacion.emitida');
    // normalizarClave pasa a minúsculas; la clave es determinista y estable.
    expect(e.idempotencyKey).toBe('ev:facturacion:emitida:fac_1');
  });

  it('adaptadores de error/rechazo incluyen código en la clave idempotente', () => {
    const err = eventoFacturaErrorRemision({ id: 'fac_1', propietarioId: 'prop_1', numeroFactura: 'A', codigoError: 'TIMEOUT' });
    expect(err.idempotencyKey).toContain('timeout');
    const rech = eventoFacturaRechazada({ id: 'fac_1', propietarioId: 'prop_1', numeroFactura: 'A', codigoError: 'VALIDACION_KO' });
    expect(rech.idempotencyKey).toContain('validacion_ko');
  });

  it('adaptador aceptada propaga CSV', () => {
    const e = eventoFacturaAceptada({ id: 'fac_1', propietarioId: 'prop_1', numeroFactura: 'A', csv: 'CSV-123' });
    expect(e.datos?.csv).toBe('CSV-123');
  });

  it('adaptador rectificada referencia la original', () => {
    const e = eventoFacturaRectificada({ id: 'fac_2', propietarioId: 'prop_1', numeroFactura: 'R2', facturaOriginal: 'F1', motivo: 'Error' });
    expect(e.datos?.facturaOriginal).toBe('F1');
    expect(e.datos?.motivo).toBe('Error');
  });
});
