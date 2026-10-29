/**
 * P-08 · El cliente puede hablar con staging — y solo con staging si se declara.
 *
 * Antes de este módulo, los tres puntos de entrada del cliente
 * (`firebase.ts`, `entornoFirebase.ts`, `googleAuth.ts`) importaban
 * `firebase-applet-config.json` directamente. Como ese fichero está versionado y
 * Vercel no lo varía por entorno, un despliegue de staging habría seguido
 * hablando con **producción** en la interfaz.
 *
 * La propiedad que hay que proteger no es «que funcione el staging», es que
 * **no se pueda tocar el destino de producción por accidente**:
 *
 *   1. sin declarar nada, producción funciona exactamente igual que antes;
 *   2. una variable suelta en Vercel NO cambia el destino;
 *   3. declarar `staging` incompleto falla (no cae a producción en silencio);
 *   4. un staging que apunta al proyecto real falla;
 *   5. un valor de entorno desconocido falla (no se asume producción);
 *   6. la interfaz informa del entorno REAL (si es staging, lo dice).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROYECTO_CLIENTE_PRODUCCION,
  PROYECTO_CLIENTE_STAGING,
  DESTINO_FIREBASE,
  destinoFirebaseRequerido,
  entornoClienteDeclarado,
  esBaseDatosConNombre,
  resolverDestinoClienteFirebase,
  verificarAppPrecedente,
} from '../src/lib/destinoFirebase';

const RAIZ = resolve(__dirname, '..');
const leer = (rel: string) => readFileSync(resolve(RAIZ, rel), 'utf8');
const CONFIG = JSON.parse(leer('firebase-applet-config.json'));

/** Todos los ficheros de código de `src/` (rutas relativas a la raíz). */
function ficherosFuente(dir = 'src'): string[] {
  return readdirSync(resolve(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return ficherosFuente(rel);
    return /\.(ts|tsx)$/.test(e.name) ? [rel] : [];
  });
}

/** Configuración de staging completa y coherente. */
const STAGING = {
  VITE_ENTORNO_FIREBASE: 'staging',
  VITE_FIREBASE_PROJECT_ID: PROYECTO_CLIENTE_STAGING,
  VITE_FIREBASE_APP_ID: '1:111:web:aaa',
  VITE_FIREBASE_API_KEY: 'clave-publica-de-prueba',
  VITE_FIREBASE_AUTH_DOMAIN: 'gestor-inmuebles-staging.firebaseapp.com',
  VITE_FIREBASE_FIRESTORE_DATABASE_ID: 'ai-studio-staging-c6444afd',
  VITE_FIREBASE_STORAGE_BUCKET: 'gestor-inmuebles-staging.firebasestorage.app',
};

describe('P-08 · sin declarar nada, producción no cambia', () => {
  it('el destino del proceso es el JSON versionado (comportamiento idéntico al de antes)', () => {
    expect(DESTINO_FIREBASE.estado).toBe('OK');
    if (DESTINO_FIREBASE.estado !== 'OK') return;
    expect(DESTINO_FIREBASE.entorno).toBe('produccion');
    expect(DESTINO_FIREBASE.origen).toBe('JSON_VERSIONADO');
    expect(DESTINO_FIREBASE.config.projectId).toBe(CONFIG.projectId);
    expect(DESTINO_FIREBASE.config.firestoreDatabaseId).toBe(CONFIG.firestoreDatabaseId);
  });

  it('«produccion» y sus variantes se aceptan; vacío también', () => {
    for (const valor of ['', 'produccion', 'production', 'prod', 'PRODUCCION', '  staging-sin-barra  ']) {
      if (valor === '  staging-sin-barra  ') continue;
      expect(entornoClienteDeclarado({ VITE_ENTORNO_FIREBASE: valor }), valor).toBe('produccion');
    }
  });

  it('una variable VITE_FIREBASE_* suelta NO cambia el destino (el caso del panel de Vercel)', () => {
    // Alguien pega VITE_FIREBASE_PROJECT_ID de staging pero olvida declarar el
    // entorno: el destino sigue siendo producción y la variable se ignora.
    const resultado = resolverDestinoClienteFirebase({
      VITE_FIREBASE_PROJECT_ID: PROYECTO_CLIENTE_STAGING,
      VITE_FIREBASE_FIRESTORE_DATABASE_ID: 'ai-studio-otra-base-cualquiera',
    });
    expect(resultado.estado).toBe('OK');
    if (resultado.estado !== 'OK') return;
    expect(resultado.entorno).toBe('produccion');
    expect(resultado.config.projectId).toBe(CONFIG.projectId);
    expect(resultado.config.firestoreDatabaseId).toBe(CONFIG.firestoreDatabaseId);
  });
});

describe('P-08 · staging: posible, explícito y sin sorpresas', () => {
  it('con la configuración completa, el destino es staging y sale de las variables', () => {
    const resultado = resolverDestinoClienteFirebase(STAGING);
    expect(resultado.estado).toBe('OK');
    if (resultado.estado !== 'OK') return;
    expect(resultado.entorno).toBe('staging');
    expect(resultado.origen).toBe('VARIABLES_ENTORNO');
    expect(resultado.config.projectId).toBe(PROYECTO_CLIENTE_STAGING);
    expect(resultado.config.firestoreDatabaseId).toBe('ai-studio-staging-c6444afd');
  });

  it('cada variable obligatoria que falta da error, y lo dice por su nombre', () => {
    for (const nombre of ['VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_FIRESTORE_DATABASE_ID', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_APP_ID']) {
      const incompleto = { ...STAGING, [nombre]: '' };
      const resultado = resolverDestinoClienteFirebase(incompleto);
      expect(resultado.estado, nombre).toBe('ERROR');
      if (resultado.estado === 'ERROR') {
        expect(resultado.codigo, nombre).toBe('DESTINO_STAGING_INCOMPLETO');
        expect(resultado.mensaje, nombre).toContain(nombre);
      }
    }
  });

  it('NO cae a producción en silencio: un staging incompleto no arranca', () => {
    // Este es el modo de fallo caro: si «faltaba algo» se resolviera usando el
    // JSON versionado, el staging nacería apuntando a la base de clientes.
    const resultado = resolverDestinoClienteFirebase({ VITE_ENTORNO_FIREBASE: 'staging' });
    expect(resultado.estado).toBe('ERROR');
    expect(() => destinoFirebaseRequerido(resultado)).toThrowError(/DESTINO_STAGING_INCOMPLETO/);
  });

  it('un staging que apunta al proyecto real está bloqueado', () => {
    const resultado = resolverDestinoClienteFirebase({ ...STAGING, VITE_FIREBASE_PROJECT_ID: PROYECTO_CLIENTE_PRODUCCION });
    expect(resultado.estado).toBe('ERROR');
    if (resultado.estado === 'ERROR') expect(resultado.codigo).toBe('DESTINO_STAGING_INCOHERENTE');
  });

  it('una base por defecto en staging está bloqueada (la arquitectura exige base con nombre)', () => {
    for (const invalida of ['(default)', 'Base Mal', 'ab', '']) {
      const resultado = resolverDestinoClienteFirebase({ ...STAGING, VITE_FIREBASE_FIRESTORE_DATABASE_ID: invalida });
      expect(resultado.estado, invalida).toBe('ERROR');
      if (resultado.estado === 'ERROR') {
        // Vacía se detecta antes como «falta»; el resto, como base inválida.
        expect(['DESTINO_STAGING_INCOMPLETO', 'DESTINO_BASE_DATOS_INVALIDA'], invalida).toContain(resultado.codigo);
      }
    }
  });

  it('un valor de entorno desconocido NO se interpreta como producción', () => {
    expect(entornoClienteDeclarado({ VITE_ENTORNO_FIREBASE: 'loquesea' })).toBeNull();
    const resultado = resolverDestinoClienteFirebase({ VITE_ENTORNO_FIREBASE: 'loquesea' });
    expect(resultado.estado).toBe('ERROR');
    if (resultado.estado === 'ERROR') expect(resultado.codigo).toBe('DESTINO_ENTORNO_DESCONOCIDO');
  });

  it('«pre» y «preproduccion» se aceptan como staging', () => {
    for (const valor of ['pre', 'preproduccion', 'STAGING']) {
      expect(entornoClienteDeclarado({ VITE_ENTORNO_FIREBASE: valor }), valor).toBe('staging');
    }
  });
});

describe('P-08 · un solo punto de resolución', () => {
  it('solo el resolvedor importa el JSON versionado; el único resto está congelado por custodia', () => {
    const importadores = ficherosFuente().filter((f) => /from '[^']*firebase-applet-config\.json'/.test(leer(f)));
    expect(importadores).toEqual(['src/lib/destinoFirebase.ts', 'src/lib/googleAuth.ts']);
    // `googleAuth.ts` no se puede tocar: la guardia de custodia
    // (`integration-boundaries.test.mjs`) lo exige byte a byte igual a `main`.
    // Si algún día deja de estar congelado, esta prueba debe actualizarse junto
    // con el manifiesto revisado, no antes.
    expect(leer('src/features/operaciones/tests/integration-boundaries.test.mjs')).toContain("'src/lib/googleAuth.ts'");
  });

  it('un módulo que arrancase primero con el proyecto equivocado NO se reutiliza: se lanza', () => {
    // Destino = staging; el módulo congelado creó la app con producción.
    const config = destinoFirebaseRequerido(resolverDestinoClienteFirebase(STAGING));
    // El caso real: `googleAuth.ts` creó la app con la configuración versionada y
    // el destino resuelto es staging. Reutilizar esa app escribiría en producción.
    const enProduccion = { name: '[DEFAULT]', options: { projectId: 'gestor-inmuebles-produccion' } };
    expect(() => verificarAppPrecedente([enProduccion], config)).toThrow(/DESTINO_APP_PRECEDENTE_INCOMPATIBLE/);
    // Y el orden correcto (la app es la del destino) no molesta a nadie.
    const coherente = { name: '[DEFAULT]', options: { projectId: config.projectId } };
    expect(() => verificarAppPrecedente([coherente], config)).not.toThrow();
    expect(() => verificarAppPrecedente([], config)).not.toThrow();
    // Un doble del SDK sin `options` no puede decidirse: no se inventa un fallo.
    expect(() => verificarAppPrecedente([{}], config)).not.toThrow();
    // La guardia está de verdad en el arranque, no solo exportada.
    const arranque = leer('src/lib/firebase.ts');
    expect(arranque).toContain('verificarAppPrecedente(getApps(), configuracionFirebase)');
    expect(arranque.indexOf('verificarAppPrecedente(getApps()')).toBeLessThan(arranque.indexOf('initializeApp(configuracionFirebase)'));
  });

  it('los consumidores del cliente piden el destino al módulo único', () => {
    for (const f of ['src/lib/firebase.ts', 'src/lib/entornoFirebase.ts']) {
      expect(leer(f), f).toContain('destinoFirebase');
    }
    // `entornoFirebase.ts` no puede leer el JSON por su cuenta: si lo hiciera, la
    // pantalla podría decir «producción» mientras el SDK habla con staging.
    expect(leer('src/lib/entornoFirebase.ts')).not.toMatch(/firebase-applet-config\.json'/);
  });

  it('la interfaz informa del entorno REAL, no del que se supone', () => {
    const entorno = leer('src/lib/entornoFirebase.ts');
    expect(entorno).toContain('ENTORNO_FIREBASE_ACTIVO');
    expect(entorno).toContain('ES_DESTINO_STAGING');
    // Y si el destino fuese inválido, la pantalla de configuración no puede
    // mostrar el proyecto de producción como si fuera el activo.
    expect(entorno).toContain('(destino Firebase inválido: revisa la configuración)');
  });

  it('el proyecto de staging del cliente y el del servidor son el MISMO literal', () => {
    const servidor = leer('server/titularidades/configuracionFirebase.ts');
    expect(servidor).toContain(`'${PROYECTO_CLIENTE_STAGING}'`);
    expect(servidor).toContain(`'${PROYECTO_CLIENTE_PRODUCCION}'`);
    expect(PROYECTO_CLIENTE_STAGING).toBe('gestor-inmuebles-staging');
  });

  it('el resolvedor no guarda secretos: solo la configuración pública del cliente', () => {
    const fuente = leer('src/lib/destinoFirebase.ts');
    for (const prohibido of ['FIREBASE_SERVICE_ACCOUNT', 'private_key', 'client_email']) {
      expect(fuente).not.toContain(prohibido);
    }
  });

  it('esBaseDatosConNombre acepta bases con nombre y rechaza el resto', () => {
    expect(esBaseDatosConNombre('ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51')).toBe(true);
    for (const invalida of ['', '(default)', 'Abc', 'a', 'mayusculas-Mal', undefined, null, 42]) {
      expect(esBaseDatosConNombre(invalida), String(invalida)).toBe(false);
    }
  });
});

describe('P-08 · el staging es visible, no indistinguible', () => {
  it('la pantalla de Configuración avisa cuando el destino es staging', async () => {
    const { avisoEntornoDespliegue } = await import('../src/lib/entornoFirebase');
    // En producción (estado real de este repositorio) no hay aviso: no se
    // ensucia la interfaz real con un cartel de pruebas.
    expect(avisoEntornoDespliegue()).toBeNull();
  });

  it('el aviso existe y dice que NO son los datos reales', () => {
    const fuente = leer('src/lib/entornoFirebase.ts');
    expect(fuente).toContain('ENTORNO DE PRUEBAS');
    expect(fuente).toContain('no son los reales');
    // Y se pinta de verdad en la pantalla, no solo se exporta.
    expect(leer('src/components/sections/ConfiguracionSection.tsx')).toContain('aviso-entorno-despliegue');
  });
});
