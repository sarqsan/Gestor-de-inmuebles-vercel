import { describe, it, expect } from 'vitest';
import { runTestsReporting } from '../src/tests/tests_reporting';

describe('GAP 3: Informes Ejecutivos, Rentabilidad y Exportación Fiscal', () => {
  it('ejecuta los 40 tests del motor de reporting y validación', () => {
    const results = runTestsReporting();
    const failures = results.filter((r) => !r.passed);
    if (failures.length > 0) {
      const errorMsg = failures.map((f) => `${f.name}: ${f.error}`).join('\n');
      expect.fail(`Fallaron ${failures.length} tests de reporting:\n${errorMsg}`);
    }
    expect(results.length).toBe(40);
    expect(failures.length).toBe(0);
  });
});
