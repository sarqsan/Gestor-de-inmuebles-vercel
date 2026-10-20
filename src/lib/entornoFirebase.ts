/**
 * ENTORNO FIREBASE EN USO — única fuente para mostrar/registrar A QUÉ proyecto y base
 * de datos habla realmente la aplicación.
 *
 * Lee el MISMO `firebase-applet-config.json` con el que `src/lib/firebase.ts`
 * inicializa el SDK (no es una segunda configuración). Sin dependencia del SDK: se
 * puede importar desde la interfaz y desde los diagnósticos sin arrastrar Firebase.
 *
 * Existe porque la identidad del proyecto activo estaba escrita a mano en la pantalla
 * de Configuración (y en la documentación de despliegue) y NO coincidía con la
 * configuración real: quien publica `firestore.rules` necesita saber el destino exacto.
 *
 * AG-03.2 (2026-10-20): la ÚNICA base Firestore de la arquitectura es la base CON
 * NOMBRE declarada en la configuración. Este módulo ya no ofrece ningún valor de
 * respaldo que pudiera señalar otra base: si falta el identificador, lo dice.
 */
import firebaseConfig from '../../firebase-applet-config.json';

const cfg = firebaseConfig as { projectId?: string; firestoreDatabaseId?: string };

/** `projectId` con el que la app inicializa Firebase (el destino de `firebase deploy --project`). */
export const FIREBASE_PROYECTO_ID: string = cfg.projectId || '(sin projectId)';

/** Identificador estructuralmente válido de base Firestore con nombre. */
export function esBaseDatosConNombre(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(valor);
}

/** `true` si la configuración declara la base con nombre (requisito de arranque de `firebase.ts`). */
export const FIREBASE_BASE_DATOS_CONFIGURADA: boolean = esBaseDatosConNombre(cfg.firestoreDatabaseId);

/**
 * Base de datos Firestore con nombre de la aplicación. Si la configuración no la
 * declara, el valor es un texto de aviso (nunca el nombre de otra base).
 */
export const FIREBASE_BASE_DATOS_ID: string = FIREBASE_BASE_DATOS_CONFIGURADA
  ? (cfg.firestoreDatabaseId as string)
  : '(sin base de datos con nombre: configuración incompleta)';

/**
 * AG-03.2 · Diagnóstico de topología (sin red). Las reglas de Cloud Storage de
 * este repositorio ya NO consultan Firestore (ninguna base): la autorización
 * documental la resuelve el servidor contra la base con nombre. Por tanto la
 * custodia no depende de ninguna base distinta de la de la aplicación; el único
 * estado anómalo es que la configuración no declare la base con nombre.
 */
export function custodiaStorageDependeDeBaseDistinta(): boolean {
  return false;
}

/** Texto para la pantalla de Configuración (sin datos sensibles); `null` si no hay nada que avisar. */
export function avisoTopologiaCustodia(): string | null {
  if (FIREBASE_BASE_DATOS_CONFIGURADA) return null;
  return 'La configuración de la aplicación no declara la base de datos con nombre. La aplicación no arranca contra ninguna otra base: revisa «firestoreDatabaseId» en la configuración versionada antes de publicar.';
}
