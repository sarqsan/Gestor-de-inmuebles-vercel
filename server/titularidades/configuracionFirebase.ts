import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ErrorCredencialServicio, leerCuentaServicio, type CuentaServicio, type CodigoErrorCredencial } from './googleBackend.js';

export type CodigoErrorConfiguracionFirebase = CodigoErrorCredencial
  | 'FIREBASE_CREDENCIAL_AUSENTE' | 'FIREBASE_PROYECTO_INCOMPATIBLE'
  | 'FIREBASE_CONFIGURACION_AUSENTE' | 'FIREBASE_CONFIGURACION_ILEGIBLE'
  | 'FIREBASE_CONFIGURACION_INVALIDA' | 'FIREBASE_BASE_DATOS_AUSENTE'
  | 'FIREBASE_OVERRIDE_INCOMPATIBLE'
  // H-17 — el proyecto declarado y `ENTORNO_DESPLIEGUE` no coinciden.
  | 'FIREBASE_ENTORNO_INCOMPATIBLE';

/**
 * H-17 — DESTINOS PERMITIDOS, EXPLÍCITOS.
 * =====================================================================
 * Antes solo se admitía `gestor-inmuebles-produccion` escrito a mano, así que
 * **un staging era imposible**: cualquier otro proyecto se bloqueaba. Eso hacía
 * que «staging documentado» fuese una promesa sin código detrás.
 *
 * Ahora hay una lista cerrada de dos destinos. No se «abre» nada: se nombra.
 * `proyecto-ajeno`, un fork o un proyecto personal siguen bloqueados igual.
 */
export const PROYECTO_PRODUCCION = 'gestor-inmuebles-produccion';
export const PROYECTO_STAGING = 'gestor-inmuebles-staging';
export const PROYECTOS_PERMITIDOS: readonly string[] = [PROYECTO_PRODUCCION, PROYECTO_STAGING];

/**
 * Entornos de despliegue. `ENTORNO_DESPLIEGUE` es la ÚNICA variable que decide
 * con qué proyecto se habla, y solo como confirmación: si el JSON dice staging y
 * la variable no lo confirma, se bloquea. Nunca se adivina.
 */
export type EntornoDespliegue = 'produccion' | 'staging';

/** Proyecto que corresponde a cada entorno. Un entorno sin proyecto no existe. */
export const PROYECTO_POR_ENTORNO: Readonly<Record<EntornoDespliegue, string>> = {
  produccion: PROYECTO_PRODUCCION,
  staging: PROYECTO_STAGING,
};

/**
 * Entorno declarado. **Ausente = producción**, que es el caso de hoy: así este
 * cambio no altera ni un byte del comportamiento actual del despliegue.
 */
export function entornoDeclarado(entorno: NodeJS.ProcessEnv = process.env): EntornoDespliegue | null {
  const crudo = (entorno.ENTORNO_DESPLIEGUE ?? '').trim().toLowerCase();
  if (crudo === '') return 'produccion';
  if (crudo === 'produccion' || crudo === 'production' || crudo === 'prod') return 'produccion';
  if (crudo === 'staging' || crudo === 'pre' || crudo === 'preproduccion') return 'staging';
  return null; // valor desconocido: se trata como error, no como producción
}

export interface DestinoFirebase {
  proyectoId: string | null;
  baseDatosId: string | null;
  errorConfiguracion?: CodigoErrorConfiguracionFirebase;
}

/** El JSON versionado es la fuente autorizada. No hay respaldo implícito. */
export function resolverDestinoFirebase(
  entorno: NodeJS.ProcessEnv = process.env,
  leer: () => string = () => readFileSync(resolve(process.cwd(), 'firebase-applet-config.json'), 'utf8'),
): DestinoFirebase {
  const bloqueado = (errorConfiguracion: CodigoErrorConfiguracionFirebase): DestinoFirebase =>
    ({ proyectoId: null, baseDatosId: null, errorConfiguracion });
  let crudo: string;
  try { crudo = leer(); }
  catch (error) {
    return bloqueado((error as NodeJS.ErrnoException)?.code === 'ENOENT'
      ? 'FIREBASE_CONFIGURACION_AUSENTE' : 'FIREBASE_CONFIGURACION_ILEGIBLE');
  }
  let config: unknown;
  try { config = JSON.parse(crudo); }
  catch { return bloqueado('FIREBASE_CONFIGURACION_INVALIDA'); }
  if (!config || typeof config !== 'object' || Array.isArray(config)) return bloqueado('FIREBASE_CONFIGURACION_INVALIDA');
  const { projectId, firestoreDatabaseId } = config as Record<string, unknown>;
  if (typeof projectId !== 'string' || !projectId) return bloqueado('FIREBASE_CONFIGURACION_INVALIDA');
  if (!PROYECTOS_PERMITIDOS.includes(projectId)) return bloqueado('FIREBASE_PROYECTO_INCOMPATIBLE');
  // H-17 — el proyecto y el entorno declarado tienen que ser el MISMO destino.
  // Sin esta comprobación, un `firebase-applet-config.json` de staging desplegado
  // en el dominio de producción pasaría inadvertido: el servidor hablaría con la
  // base de staging creyendo servir a clientes reales.
  const entornoSolicitado = entornoDeclarado(entorno);
  if (entornoSolicitado === null) return bloqueado('FIREBASE_ENTORNO_INCOMPATIBLE');
  if (PROYECTO_POR_ENTORNO[entornoSolicitado] !== projectId) {
    return bloqueado('FIREBASE_ENTORNO_INCOMPATIBLE');
  }
  if (firestoreDatabaseId === undefined || firestoreDatabaseId === null || firestoreDatabaseId === '') {
    return bloqueado('FIREBASE_BASE_DATOS_AUSENTE');
  }
  if (typeof firestoreDatabaseId !== 'string' || !/^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(firestoreDatabaseId)) {
    return bloqueado('FIREBASE_CONFIGURACION_INVALIDA');
  }
  // Los overrides se conservan como confirmatorios, nunca como selectores.
  if ((entorno.FIREBASE_PROJECT_ID !== undefined && entorno.FIREBASE_PROJECT_ID.trim() !== projectId)
    || (entorno.FIRESTORE_DATABASE_ID !== undefined && entorno.FIRESTORE_DATABASE_ID.trim() !== firestoreDatabaseId)) {
    return bloqueado('FIREBASE_OVERRIDE_INCOMPATIBLE');
  }
  return { proyectoId: projectId, baseDatosId: firestoreDatabaseId };
}

/** Valida destino y credencial antes de permitir construir cualquier cliente. */
export function resolverAccesoFirebase(
  entorno: NodeJS.ProcessEnv = process.env,
  cuentaInyectada?: CuentaServicio | null,
) {
  const destino = resolverDestinoFirebase(entorno);
  if (destino.errorConfiguracion) return { ...destino, cuenta: null };
  let cuenta: CuentaServicio | null;
  try { cuenta = cuentaInyectada === undefined ? leerCuentaServicio(entorno) : cuentaInyectada; }
  catch (error) {
    if (!(error instanceof ErrorCredencialServicio)) throw error;
    return { ...destino, cuenta: null, errorConfiguracion: error.codigo };
  }
  if (!cuenta) return { ...destino, cuenta: null, errorConfiguracion: 'FIREBASE_CREDENCIAL_AUSENTE' as const };
  if (cuenta.project_id !== destino.proyectoId) {
    return { ...destino, cuenta: null, errorConfiguracion: 'FIREBASE_PROYECTO_INCOMPATIBLE' as const };
  }
  return { ...destino, cuenta };
}
