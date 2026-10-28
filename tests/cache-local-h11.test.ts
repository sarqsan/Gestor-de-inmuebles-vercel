/**
 * H-11 — CACHÉ LOCAL DE CARTERA: OPT-IN, AISLADA Y BORRADA AL CERRAR SESIÓN
 * =========================================================================
 * Comprueba el comportamiento REAL de `src/lib/cacheLocal.ts`:
 *  · sin `VITE_CACHE_LOCAL_ENABLED`, ni lee ni escribe (nunca muestra una
 *    cartera de otra sesión antes del primer snapshot);
 *  · con la bandera activa lee y escribe bajo el prefijo propio;
 *  · contenido corrupto o que no es un array ⇒ `null`, nunca una excepción;
 *  · `guardarCacheLocal` no propaga errores de cuota;
 *  · `limpiarCacheLocal` borra las 9 claves de la aplicación y no toca las
 *    claves de sesión ni las de terceros.
 *
 * El cierre de sesión se verifica de forma estructural sobre `authService.ts`
 * (una sola fuente de verdad: `CLAVES_CACHE_APP`), porque `logoutUser` arrastra
 * toda la inicialización de Firebase y aquí no se simula el SDK.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CLAVES_CACHE_APP,
  PREFIJO_CACHE_APP,
  cacheLocalHabilitada,
  guardarCacheLocal,
  leerCacheLocal,
  limpiarCacheLocal,
} from '../src/lib/cacheLocal';

const RAIZ = resolve(__dirname, '..');

/** `localStorage` mínimo y controlable (jsdom ya lo aporta). */
function almacenDePrueba() {
  const datos = new Map<string, string>();
  const almacen = {
    datos,
    getItem: (k: string) => (datos.has(k) ? datos.get(k)! : null),
    setItem: (k: string, v: string) => void datos.set(k, String(v)),
    removeItem: (k: string) => void datos.delete(k),
    clear: () => datos.clear(),
    key: (i: number) => Array.from(datos.keys())[i] ?? null,
    get length() {
      return datos.size;
    },
  };
  return almacen;
}

let almacen: ReturnType<typeof almacenDePrueba>;
const entorno = import.meta.env as Record<string, string | undefined>;
let banderaOriginal: string | undefined;

beforeEach(() => {
  almacen = almacenDePrueba();
  vi.stubGlobal('localStorage', almacen);
  banderaOriginal = entorno.VITE_CACHE_LOCAL_ENABLED;
  delete entorno.VITE_CACHE_LOCAL_ENABLED;
});

afterEach(() => {
  if (banderaOriginal === undefined) delete entorno.VITE_CACHE_LOCAL_ENABLED;
  else entorno.VITE_CACHE_LOCAL_ENABLED = banderaOriginal;
  vi.unstubAllGlobals();
});

describe('H-11 · la caché está apagada por defecto', () => {
  it('sin bandera no se lee aunque haya datos guardados', () => {
    expect(cacheLocalHabilitada()).toBe(false);
    almacen.datos.set(`${PREFIJO_CACHE_APP}inmuebles`, JSON.stringify([{ id: 'otra-cuenta' }]));
    expect(leerCacheLocal('inmuebles')).toBeNull();
  });

  it('sin bandera no se escribe nada', () => {
    guardarCacheLocal('inmuebles', [{ id: 'x' }]);
    expect(almacen.datos.size).toBe(0);
  });

  it('solo los valores afirmativos activan la bandera', () => {
    for (const valor of ['1', 'true', 'si', 'sí', 'on', 'ON']) {
      entorno.VITE_CACHE_LOCAL_ENABLED = valor;
      expect(cacheLocalHabilitada(), valor).toBe(true);
    }
    for (const valor of ['0', 'false', 'no', 'off', '', 'quizá']) {
      entorno.VITE_CACHE_LOCAL_ENABLED = valor;
      expect(cacheLocalHabilitada(), valor).toBe(false);
    }
  });
});

describe('H-11 · con la bandera activa', () => {
  beforeEach(() => {
    entorno.VITE_CACHE_LOCAL_ENABLED = '1';
  });

  it('guarda y recupera un array bajo el prefijo de la aplicación', () => {
    guardarCacheLocal('inmuebles', [{ id: 'inm_1' }]);
    expect(almacen.datos.has(`${PREFIJO_CACHE_APP}inmuebles`)).toBe(true);
    expect(almacen.datos.has('inmuebles')).toBe(false);
    expect(leerCacheLocal('inmuebles')).toEqual([{ id: 'inm_1' }]);
  });

  it('devuelve null si el contenido no es JSON o no es un array', () => {
    almacen.datos.set(`${PREFIJO_CACHE_APP}candidatos`, '{roto');
    almacen.datos.set(`${PREFIJO_CACHE_APP}contratos`, JSON.stringify({ no: 'es un array' }));
    expect(leerCacheLocal('candidatos')).toBeNull();
    expect(leerCacheLocal('contratos')).toBeNull();
    expect(leerCacheLocal('propietarios')).toBeNull();
  });

  it('guardarCacheLocal no lanza si el almacenamiento rechaza la escritura', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    });
    expect(() => guardarCacheLocal('inmuebles', [{ id: 'x' }])).not.toThrow();
    expect(() => leerCacheLocal('inmuebles')).not.toThrow();
  });

  it('funciona sin localStorage (SSR / pruebas)', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(leerCacheLocal('inmuebles')).toBeNull();
    expect(() => guardarCacheLocal('inmuebles', [])).not.toThrow();
    expect(() => limpiarCacheLocal()).not.toThrow();
  });

  it('limpiarCacheLocal borra las 9 claves de cartera y respeta el resto', () => {
    expect(CLAVES_CACHE_APP).toHaveLength(9);
    for (const clave of CLAVES_CACHE_APP) {
      almacen.datos.set(`${PREFIJO_CACHE_APP}${clave}`, JSON.stringify([]));
    }
    almacen.datos.set('rentselect_active_session', '{"id":"u1"}');
    almacen.datos.set('rentselect_current_user_id', 'u1');
    almacen.datos.set('otra_app:ajustes', 'tema=oscuro');

    limpiarCacheLocal();

    for (const clave of CLAVES_CACHE_APP) {
      expect(almacen.datos.has(`${PREFIJO_CACHE_APP}${clave}`), clave).toBe(false);
    }
    expect(almacen.datos.get('rentselect_active_session')).toBe('{"id":"u1"}');
    expect(almacen.datos.get('rentselect_current_user_id')).toBe('u1');
    expect(almacen.datos.get('otra_app:ajustes')).toBe('tema=oscuro');
  });
});

describe('H-11 · el cierre de sesión usa la lista única', () => {
  const fuente = readFileSync(resolve(RAIZ, 'src/lib/authService.ts'), 'utf8');

  it('logoutUser importa y llama a limpiarCacheLocal', () => {
    expect(fuente).toContain("import { limpiarCacheLocal } from './cacheLocal';");
    const inicio = fuente.indexOf('export async function logoutUser');
    expect(inicio).toBeGreaterThan(-1);
    const fin = fuente.indexOf('\n}', inicio);
    const cuerpo = fuente.slice(inicio, fin);
    expect(cuerpo).toContain('limpiarCacheLocal();');
  });

  it('logoutUser ya no duplica a mano las claves de cartera', () => {
    const inicio = fuente.indexOf('export async function logoutUser');
    const fin = fuente.indexOf('\n}', inicio);
    const cuerpo = fuente.slice(inicio, fin);
    for (const clave of CLAVES_CACHE_APP) {
      expect(cuerpo, clave).not.toContain(`removeItem('${PREFIJO_CACHE_APP}${clave}')`);
    }
    // Las claves de sesión sí se siguen borrando explícitamente.
    expect(cuerpo).toContain("removeItem('rentselect_active_session')");
    expect(cuerpo).toContain("removeItem('rentselect_current_user_id')");
  });
});
