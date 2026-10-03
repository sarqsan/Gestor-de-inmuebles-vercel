/// <reference types="vite/client" />
/**
 * ENTORNO DE EJECUCIÓN — `development` (vista previa/Arena, `vite dev`) o
 * `production` (build desplegado; sesión real de usuario).
 *
 * Existe por la orden de observabilidad (2026-10-03): las incidencias de lectura de
 * `inmuebles` deben poder separarse sin ambigüedad entre:
 *   · diagnóstico REAL — lo generó una sesión de usuario en la aplicación desplegada;
 *   · diagnóstico LOCAL  — lo generó la vista previa/desarrollo.
 * Nunca se mezclan en la pantalla de administración (`environment` viaja en cada registro).
 *
 * Criterio deliberadamente conservador: solo se declara `production` cuando el bundler
 * lo afirma (`PROD`/`MODE === 'production'`). Si no hay información de entorno (scripts
 * con `tsx`, servidor, tests), el valor es `development`, de modo que un registro dudoso
 * jamás se presente como producción.
 */
export type EntornoEjecucion = 'development' | 'production';

function detectarEntorno(): EntornoEjecucion {
  try {
    const env = (import.meta as unknown as { env?: { DEV?: boolean; PROD?: boolean; MODE?: string } }).env;
    if (!env) return 'development';
    if (env.DEV === true) return 'development';
    if (env.PROD === true) return 'production';
    return env.MODE === 'production' ? 'production' : 'development';
  } catch {
    return 'development';
  }
}

/** Entorno detectado en el momento de cargar el módulo. */
export const ENTORNO_EJECUCION: EntornoEjecucion = detectarEntorno();
