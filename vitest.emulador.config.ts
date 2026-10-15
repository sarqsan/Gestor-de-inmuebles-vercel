// Configuración de las pruebas de reglas contra el EMULADOR OFICIAL de Firestore.
// No forma parte de `vitest run` (ver exclude en vite.config.ts): se ejecuta con
// `npm run test:emulador:reglas`, que arranca el emulador con firebase emulators:exec.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/emulador/**/*.emulador.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
