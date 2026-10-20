import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          // El OCR y el renderizador PDF sólo se solicitan desde el escáner; no
          // deben inflar ni descargarse con el arranque normal de la aplicación.
          manualChunks(id) {
            if (id.includes('/node_modules/tesseract.js/') || id.includes('/node_modules/tesseract.js-core/')
              || id.includes('/node_modules/bmp-js/') || id.includes('/node_modules/zlibjs/')) return 'ocr-engine';
            if (id.includes('/node_modules/pdfjs-dist/')) return 'pdf-renderer';
          },
        },
      },
    },
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
        // Los tests .mjs de Operaciones (port de C) son `node --test` con tsx-loader
        // y se ejecutan con:
        //   node --import tsx --test src/features/operaciones/tests/*.test.mjs
        // Vitest no debe capturarlos: usan node:test/node:assert directamente.
        'src/features/operaciones/tests/**',
        // Pruebas de reglas contra el EMULADOR OFICIAL (requieren Java y firebase emulators:exec):
        //   npm run test:emulador:reglas  (vitest.emulador.config.ts)
        'tests/emulador/**',
      ],
    },
  };
});
