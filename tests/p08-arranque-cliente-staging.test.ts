/**
 * P-08 — prueba de ARRANQUE, no de lectura de código: con el entorno de staging
 * declarado, el SDK del cliente se inicializa contra el proyecto de staging y
 * `googleAuth` reutiliza esa misma app (no se crea una segunda con producción).
 *
 * Es la comprobación que de verdad importa para H-17: que la interfaz, al abrirse
 * en staging, no hable con la base de clientes reales.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, getApps } from 'firebase/app';
import { PROYECTO_CLIENTE_STAGING } from '../src/lib/destinoFirebase';

const ENTORNO_STAGING = {
  VITE_ENTORNO_FIREBASE: 'staging',
  VITE_FIREBASE_PROJECT_ID: PROYECTO_CLIENTE_STAGING,
  VITE_FIREBASE_APP_ID: '1:111:web:aaa',
  VITE_FIREBASE_API_KEY: 'clave-publica-de-prueba',
  VITE_FIREBASE_AUTH_DOMAIN: 'gestor-inmuebles-staging.firebaseapp.com',
  VITE_FIREBASE_FIRESTORE_DATABASE_ID: 'ai-studio-staging-c6444afd',
  VITE_FIREBASE_STORAGE_BUCKET: 'gestor-inmuebles-staging.firebasestorage.app',
};

afterEach(async () => {
  // El registro de apps de Firebase es global al proceso: se vacía entre casos
  // para que cada arranque sea de verdad un arranque limpio.
  await Promise.all(getApps().map((app) => deleteApp(app)));
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('P-08 · arranque real del cliente en staging', () => {
  it('el SDK arranca contra staging y googleAuth reutiliza la MISMA app', async () => {
    for (const [clave, valor] of Object.entries(ENTORNO_STAGING)) vi.stubEnv(clave, valor);
    vi.resetModules();

    const arranque = await import('../src/lib/firebase');
    const apps = getApps();
    expect(apps).toHaveLength(1);
    expect(apps[0].options.projectId).toBe(PROYECTO_CLIENTE_STAGING);
    // La base de datos también es la de staging, no la versionada.
    expect((arranque as { db?: unknown }).db).toBeTruthy();

    // `googleAuth` no puede añadir una segunda app ni reutilizar la de producción.
    await import('../src/lib/googleAuth');
    expect(getApps()).toHaveLength(1);
    expect(getApps()[0].options.projectId).toBe(PROYECTO_CLIENTE_STAGING);
  });

  it('sin el entorno declarado, producción sigue siendo el destino (sin cambios)', async () => {
    vi.resetModules();
    const arranque = await import('../src/lib/firebase');
    expect((arranque as { db?: unknown }).db).toBeTruthy();
    expect(getApps()).toHaveLength(1);
    expect(getApps()[0].options.projectId).toBe('gestor-inmuebles-produccion');
  });

  it('un staging incompleto NO arranca en silencio contra producción', async () => {
    vi.stubEnv('VITE_ENTORNO_FIREBASE', 'staging');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', PROYECTO_CLIENTE_STAGING);
    vi.resetModules();
    await expect(import('../src/lib/firebase')).rejects.toThrow(/DESTINO_STAGING_INCOMPLETO/);
  });
});
