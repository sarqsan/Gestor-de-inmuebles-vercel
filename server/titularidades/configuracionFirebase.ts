import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ErrorCredencialServicio, leerCuentaServicio, type CuentaServicio, type CodigoErrorCredencial } from './googleBackend.js';

export type CodigoErrorConfiguracionFirebase = CodigoErrorCredencial
  | 'FIREBASE_CREDENCIAL_AUSENTE' | 'FIREBASE_PROYECTO_INCOMPATIBLE'
  | 'FIREBASE_CONFIGURACION_AUSENTE' | 'FIREBASE_CONFIGURACION_ILEGIBLE'
  | 'FIREBASE_CONFIGURACION_INVALIDA' | 'FIREBASE_BASE_DATOS_AUSENTE'
  | 'FIREBASE_OVERRIDE_INCOMPATIBLE';

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
  if (projectId !== 'gestor-inmuebles-produccion') return bloqueado('FIREBASE_PROYECTO_INCOMPATIBLE');
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
