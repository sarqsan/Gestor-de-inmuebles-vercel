import { fileURLToPath } from 'node:url';

// Configuración independiente: no importa la configuración, App ni el servidor productivos.
const directorioModulo = fileURLToPath(new URL('../', import.meta.url));
const directorioDemo = fileURLToPath(new URL('./', import.meta.url));

export default {
  root: directorioDemo,
  base: './',
  esbuild: { jsx: 'automatic' },
  server: {
    host: '0.0.0.0',
    port: 4174,
    strictPort: true,
    allowedHosts: ['localhost', '.e2b.app'],
    fs: { allow: [directorioModulo] },
  },
  preview: {
    host: '0.0.0.0',
    port: 4174,
    strictPort: true,
    allowedHosts: ['localhost', '.e2b.app'],
  },
  build: {
    outDir: fileURLToPath(new URL('../../../../dist/patrimonial-demo/', import.meta.url)),
    emptyOutDir: true,
  },
};
