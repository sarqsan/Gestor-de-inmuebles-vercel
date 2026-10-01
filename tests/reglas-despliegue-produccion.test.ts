/**
 * DESPLIEGUE DE REGLAS — el destino tiene que ser el proyecto REAL de la aplicación.
 * =================================================================================
 * Por qué existe: la auditoría de «Lectura · Carteras» encontró que las
 * instrucciones del repositorio publicaban `firestore.rules` en
 * `startup-sanctuary-sln7n`, mientras la aplicación (y el preview de Vercel)
 * inicializa el SDK con `gestor-inmuebles-produccion` (`firebase-applet-config.json`).
 * Publicar en el proyecto equivocado deja la aplicación con las reglas antiguas: es
 * exactamente la clase de discrepancia que produce denegaciones como la de Carteras.
 *
 * Este test fija, sin credenciales ni red:
 *  1. `.firebaserc` fija `gestor-inmuebles-produccion` como proyecto por defecto.
 *  2. `firebase.json` publica `firestore.rules` en la MISMA base de datos que usa la app.
 *  3. Ni las instrucciones de despliegue ni el código fuente apuntan al proyecto antiguo.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(__dirname, '..');
const CONFIG = JSON.parse(readFileSync(resolve(RAIZ, 'firebase-applet-config.json'), 'utf8'));
const FIREBASE_JSON = JSON.parse(readFileSync(resolve(RAIZ, 'firebase.json'), 'utf8'));

/** Documentos que contienen las instrucciones de publicación de reglas. */
const DOCS_DE_DESPLIEGUE = [
  'docs/MAPA-MAESTRO-ERP-ACTUAL.md',
  'docs/arquitectura/FASE_1.4_SEGURIDAD_PERMISOS.md',
  'docs/arquitectura/FASE_2.0_GASTOS.md',
  'docs/arquitectura/FASE_2.2_RECURRENTES_FACTURAS.md',
  'docs/arquitectura/FASE_2.3_PRESTAMOS_HIPOTECAS.md',
  'docs/arquitectura/FASE_3.0_MODELO_DATOS.md',
  'docs/arquitectura/FASE_3.2_INSPECCION_FOTOS.md',
];

const PROYECTO_ANTIGUO = 'startup-sanctuary-sln7n';

describe('destino de publicación de firestore.rules', () => {
  it('`.firebaserc` fija como proyecto por defecto el MISMO de la aplicación', () => {
    const ruta = resolve(RAIZ, '.firebaserc');
    expect(existsSync(ruta)).toBe(true);
    const rc = JSON.parse(readFileSync(ruta, 'utf8'));
    expect(rc.projects?.default).toBe(CONFIG.projectId);
    expect(rc.projects?.default).toBe('gestor-inmuebles-produccion');
  });

  it('`firebase.json` publica `firestore.rules` en la MISMA base de datos de la aplicación', () => {
    const firestore = FIREBASE_JSON.firestore?.[0] ?? {};
    expect(firestore.rules).toBe('firestore.rules');
    expect(firestore.database).toBe(CONFIG.firestoreDatabaseId);
  });

  it('ninguna instrucción de despliegue publica en un proyecto distinto del real', () => {
    for (const doc of DOCS_DE_DESPLIEGUE) {
      const texto = readFileSync(resolve(RAIZ, doc), 'utf8');
      expect(texto).not.toMatch(new RegExp(`--project\\s+${PROYECTO_ANTIGUO}\\b`));
    }
  });

  it('el código fuente no lleva escrito a mano ningún proyecto que no sea el configurado', () => {
    const configuracion = readFileSync(resolve(RAIZ, 'src/components/sections/ConfiguracionSection.tsx'), 'utf8');
    expect(configuracion).not.toContain(PROYECTO_ANTIGUO);
    const entorno = readFileSync(resolve(RAIZ, 'src/lib/entornoFirebase.ts'), 'utf8');
    expect(entorno).not.toContain(PROYECTO_ANTIGUO);
  });
});
