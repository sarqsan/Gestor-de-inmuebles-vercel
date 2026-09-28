// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { formatDateInputLocal } from './formatters';
import { calcularFechaFinGarantia, calcularProximaFechaMantenimiento, evaluarEstadoGarantia, evaluarEstadoSeguimiento } from './mantenimientoEngine';

const tzOriginal = process.env.TZ;
afterEach(() => {
  if (tzOriginal === undefined) delete process.env.TZ;
  else process.env.TZ = tzOriginal;
});

describe('mantenimientoEngine · fechas de calendario en Europe/Madrid', () => {
  it('mantiene la fecha de calendario al sumar meses de invierno a verano', () => {
    process.env.TZ = 'Europe/Madrid';
    expect(calcularFechaFinGarantia('2026-02-28', 6)).toBe('2026-08-28');
    expect(calcularFechaFinGarantia('2026-03-29', 6)).toBe('2026-09-29');
  });

  it('la planificación mensual mantiene el día calendario al atravesar el cambio de hora', () => {
    process.env.TZ = 'Europe/Madrid';
    expect(calcularProximaFechaMantenimiento('2026-03-29', 'MENSUAL')).toBe('2026-04-29');
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
