/**
 * ARRANQUE REAL del cliente: no es una lectura de código, es el SDK inicializado.
 *
 * El nombre del fichero es histórico (nació como prueba de un entorno de pruebas
 * que se ha retirado). Lo que se comprueba hoy es lo contrario: que el arranque
 * solo pueda ir al proyecto real, aunque alguien declare variables de staging.
 *
 * Se comprueba lo que de verdad importa tras la decisión del titular (no hay
 * entorno de pruebas): la app arranca contra el proyecto real, y si el fichero de
 * configuración apuntara a otro sitio **no arranca**.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, getApps } from 'firebase/app';
import { PROYECTO_CLIENTE_PRODUCCION } from '../src/lib/destinoFirebase';

afterEach(async () => {
  // El registro de apps de Firebase es global al proceso: se vacía entre casos
  // para que cada arranque sea de verdad un arranque limpio.
  await Promise.all(getApps().map((app) => deleteApp(app)));
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('arranque del cliente · un solo destino', () => {
  it('el SDK arranca contra el proyecto real y googleAuth reutiliza la MISMA app', async () => {
    vi.resetModules();
    const arranque = await import('../src/lib/firebase');
    expect((arranque as { db?: unknown }).db).toBeTruthy();

    const apps = getApps();
    expect(apps).toHaveLength(1);
    expect(apps[0].options.projectId).toBe(PROYECTO_CLIENTE_PRODUCCION);

    // `googleAuth` no puede añadir una segunda app ni cambiar de proyecto.
    await import('../src/lib/googleAuth');
    expect(getApps()).toHaveLength(1);
    expect(getApps()[0].options.projectId).toBe(PROYECTO_CLIENTE_PRODUCCION);
  });

  it('las variables retiradas no tienen ningún efecto sobre el arranque', async () => {
    // Exactamente las que antes habilitaban un despliegue de pruebas.
    vi.stubEnv('VITE_ENTORNO_FIREBASE', 'staging');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'gestor-inmuebles-staging');
    vi.stubEnv('VITE_FIREBASE_FIRESTORE_DATABASE_ID', 'ai-studio-staging-1');
    vi.resetModules();

    const arranque = await import('../src/lib/firebase');
    expect((arranque as { db?: unknown }).db).toBeTruthy();
    expect(getApps()).toHaveLength(1);
    expect(getApps()[0].options.projectId).toBe(PROYECTO_CLIENTE_PRODUCCION);
  });
});
