import { describe, it, expect } from 'vitest';
import { runTestsReporting } from '../src/tests/tests_reporting';

/**
 * GAP3 — Reporting. El runner `runTestsReporting()` contiene 40 comprobaciones del motor
 * (`reportingEngine` + `pdfExportEngine`). Antes de GAP-R4 se envolvían en un único test;
 * ahora cada comprobación se expone como test individual (misma lógica, sin duplicarla)
 * para que un fallo identifique la comprobación concreta.
 */
const resultados = runTestsReporting();

describe('GAP 3: Informes Ejecutivos, Rentabilidad y Exportación Fiscal', () => {
  it('el runner expone exactamente 40 comprobaciones con nombres únicos', () => {
    expect(resultados.length).toBe(40);
    expect(new Set(resultados.map((r) => r.name)).size).toBe(40);
  });

  it.each(resultados.map((r) => [r.name, r] as const))('%s', (_name, r) => {
    if (!r.passed) {
      expect.fail(`${r.name}: ${r.error}`);
    }
    expect(r.passed).toBe(true);
  });
});
