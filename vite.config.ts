import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Permite hosts de previsualización remota (proxies/entornos alojados).
      // Solo afecta al servidor de desarrollo; no tiene efecto en el build de producción.
      allowedHosts: true as true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    test: {
      // Los tests nativos de la base patrimonial (Arena C) son `node --test`
      // (.mjs con su propio tsx-loader) y se ejecutan con:
      //   node --test src/features/patrimonial/tests/*.test.mjs
      // Vitest no debe capturarlos: usan node:test/node:assert directamente.
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        'src/features/patrimonial/tests/**',
      ],
    },
  };
});
