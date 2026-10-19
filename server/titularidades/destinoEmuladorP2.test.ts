import { describe, expect, it } from 'vitest';
import { validarDestinoEmuladorP2 } from './googleBackend';

const base: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  GCLOUD_PROJECT: 'demo-p2-test',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
};

describe('guardarraíl del transporte P2 con emuladores', () => {
  it('resuelve sólo los hosts loopback y puertos oficiales del producto', () => {
    expect(validarDestinoEmuladorP2('firestore', 'demo-p2-test', base)).toBe('http://127.0.0.1:8080');
    expect(validarDestinoEmuladorP2('storage', 'demo-p2-test', base)).toBe('http://127.0.0.1:9199');
  });

  it.each([
    ['proyecto no demo', { GCLOUD_PROJECT: 'gestor-inmuebles-produccion' }, 'gestor-inmuebles-produccion'],
    ['proyecto contradictorio', { GCLOUD_PROJECT: 'demo-otro' }, 'demo-p2-test'],
    ['host remoto', { FIRESTORE_EMULATOR_HOST: 'firestore.example.invalid:8080' }, 'demo-p2-test'],
    ['puerto distinto', { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081' }, 'demo-p2-test'],
    ['credencial presente', { GOOGLE_APPLICATION_CREDENTIALS: '/tmp/no-leer.json' }, 'demo-p2-test'],
    ['entorno de producción', { NODE_ENV: 'production' }, 'demo-p2-test'],
    ['Vercel presente', { VERCEL: '1' }, 'demo-p2-test'],
  ])('falla cerrado ante %s', (_caso, cambio, proyecto) => {
    expect(() => validarDestinoEmuladorP2('firestore', proyecto, { ...base, ...cambio }))
      .toThrow('P2_EMULADOR_DESTINO_NO_SEGURO');
  });
});
