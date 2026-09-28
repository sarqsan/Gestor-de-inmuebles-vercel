// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { formatDateInputLocal } from './formatters';
import {
  calcularFechaFinGarantia,
  calcularProximaFechaMantenimiento,
  evaluarEstadoGarantia,
  evaluarEstadoSeguimiento,
} from './mantenimientoEngine';

const tzOriginal = process.env.TZ;
afterEach(() => {
  if (tzOriginal === undefined) delete process.env.TZ;
  else process.env.TZ = tzOriginal;
});

describe('mantenimientoEngine · fechas civiles y meses de calendario', () => {
  it('conserva el día numérico al sumar meses cuando existe en el mes destino', () => {
    expect(calcularFechaFinGarantia('2026-02-28', 6)).toBe('2026-08-28');
    expect(calcularFechaFinGarantia('2026-03-29', 6)).toBe('2026-09-29');
    expect(calcularFechaFinGarantia('2026-01-31', 6)).toBe('2026-07-31');
  });

  it('limita al último día del mes destino sin desbordar al mes siguiente', () => {
    expect(calcularFechaFinGarantia('2026-01-31', 1)).toBe('2026-02-28');
    expect(calcularFechaFinGarantia('2026-08-31', 6)).toBe('2027-02-28');
    expect(calcularFechaFinGarantia('2026-01-30', 1)).toBe('2026-02-28');
    expect(calcularFechaFinGarantia('2026-03-30', 1)).toBe('2026-04-30');
  });

  it('respeta febrero bisiesto y febrero no bisiesto', () => {
    expect(calcularFechaFinGarantia('2024-02-29', 6)).toBe('2024-08-29');
    expect(calcularFechaFinGarantia('2024-08-31', 6)).toBe('2025-02-28');
    expect(calcularFechaFinGarantia('2028-08-31', 6)).toBe('2029-02-28');
  });

  it('aplica la misma regla de meses de calendario a las recurrencias', () => {
    expect(calcularProximaFechaMantenimiento('2026-01-31', 'MENSUAL')).toBe('2026-02-28');
    expect(calcularProximaFechaMantenimiento('2026-01-31', 'SEMESTRAL')).toBe('2026-07-31');
    expect(calcularProximaFechaMantenimiento('2026-08-31', 'SEMESTRAL')).toBe('2027-02-28');
    // La recurrencia conserva el día numérico del ancla que recibe; no almacena una marca EOM.
    expect(calcularProximaFechaMantenimiento('2026-02-28', 'MENSUAL')).toBe('2026-03-28');
  });

  it('mantiene las fechas civiles en Europe/Madrid alrededor del cambio DST', () => {
    process.env.TZ = 'Europe/Madrid';
    expect(calcularFechaFinGarantia('2026-03-29', 6)).toBe('2026-09-29');
    expect(calcularProximaFechaMantenimiento('2026-03-29', 'MENSUAL')).toBe('2026-04-29');
    const instanteEnDiaLocal29 = new Date('2026-03-28T23:30:00.000Z');
    expect(calcularProximaFechaMantenimiento(instanteEnDiaLocal29, 'MENSUAL')).toBe('2026-04-29');
  });

  it('los estados de mantenimiento y garantía comparan el día local del calendario', () => {
    process.env.TZ = 'Europe/Madrid';
    const ahoraLocalDia29 = new Date('2026-03-28T23:30:00.000Z');
    expect(evaluarEstadoGarantia('2026-03-28', undefined, ahoraLocalDia29)).toBe('VENCIDA');
    expect(evaluarEstadoSeguimiento('2026-03-28', true, 30, false, ahoraLocalDia29)).toBe('VENCIDO');
  });

  it('el valor inicial de un input date refleja el día local, no la fecha UTC', () => {
    process.env.TZ = 'Europe/Madrid';
    const instante = new Date('2026-03-28T23:30:00.000Z');
    expect(formatDateInputLocal(instante)).toBe('2026-03-29');
  });
});
