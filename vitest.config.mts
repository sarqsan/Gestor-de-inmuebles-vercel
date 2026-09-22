import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/tests/tests_conciliacion.ts', 'src/**/*.{test,spec}.ts'],
    exclude: ['src/tests/tests_reporting.ts'],
  }
});
