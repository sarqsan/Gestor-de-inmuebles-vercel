/**
 * ENTORNO FIREBASE EN USO — única fuente para mostrar/registrar A QUÉ proyecto y base
 * de datos habla realmente la aplicación.
 *
 * P-08 — lee el destino RESUELTO por `destinoFirebase.ts`, el mismo que usa
 * `src/lib/firebase.ts` para inicializar el SDK (no es una segunda configuración).
 * Sin dependencia del SDK: se puede importar desde la interfaz y desde los
 * diagnósticos sin arrastrar Firebase.
 *
 * Existe porque la identidad del proyecto activo estaba escrita a mano en la pantalla
 * de Configuración (y en la documentación de despliegue) y NO coincidía con la
 * configuración real: quien publica `firestore.rules` necesita saber el destino exacto.
 *
 * AG-03.2 (2026-10-20): la ÚNICA base Firestore de la arquitectura es la base CON
 * NOMBRE declarada en la configuración. Este módulo ya no ofrece ningún valor de
 * respaldo que pudiera señalar otra base: si falta el identificador, lo dice.
 */
import { DESTINO_FIREBASE, esBaseDatosConNombre as esBaseConNombre } from './destinoFirebase';

/**
 * P-08 — estos valores salen del destino RESUELTO, no del JSON directamente: si
 * el despliegue es de staging, la pantalla de Configuración tiene que decir
 * staging. Mostrar el proyecto de producción en un staging es exactamente el tipo
 * de mentira que este módulo existe para evitar.
 */
const destino = DESTINO_FIREBASE;

/** `projectId` con el que la app inicializa Firebase (el destino de `firebase deploy --project`). */
export const FIREBASE_PROYECTO_ID: string = destino.estado === 'OK'
  ? destino.config.projectId
  : '(destino Firebase inválido: revisa la configuración)';

/** Identificador estructuralmente válido de base Firestore con nombre. */
export function esBaseDatosConNombre(valor: unknown): valor is string {
  return esBaseConNombre(valor);
}

/** `true` si el destino resuelto declara la base con nombre (requisito de arranque de `firebase.ts`). */
export const FIREBASE_BASE_DATOS_CONFIGURADA: boolean = destino.estado === 'OK';

/**
 * Base de datos Firestore con nombre de la aplicación. Si el destino no la
 * declara, el valor es un texto de aviso (nunca el nombre de otra base).
 */
export const FIREBASE_BASE_DATOS_ID: string = destino.estado === 'OK'
  ? destino.config.firestoreDatabaseId
  : '(sin base de datos con nombre: configuración incompleta)';

/**
 * P-08 — entorno activo del cliente. `staging` solo aparece si el despliegue lo
 * declaró y la configuración resultó coherente; nunca por deducción.
 */
export const ENTORNO_FIREBASE_ACTIVO: 'produccion' | 'staging' = destino.estado === 'OK'
  ? destino.entorno
  : 'produccion';

/** `true` si la interfaz está hablando con el staging. Para avisos visibles. */
export const ES_DESTINO_STAGING: boolean = ENTORNO_FIREBASE_ACTIVO === 'staging';

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
  if (!FIREBASE_BASE_DATOS_CONFIGURADA) {
    return 'La configuración de la aplicación no declara la base de datos con nombre. La aplicación no arranca contra ninguna otra base: revisa «firestoreDatabaseId» en la configuración versionada antes de publicar.';
  }
  return null;
}

/**
 * P-08 — aviso de entorno, para que nadie confunda el staging con producción.
 * Un staging indistinguible del sistema real es la forma más fácil de probar algo
 * «en producción» creyendo que es una copia, o de dar por bueno un dato de prueba.
 */
export function avisoEntornoDespliegue(): string | null {
  if (!ES_DESTINO_STAGING) return null;
  return 'ENTORNO DE PRUEBAS (staging): esta interfaz NO habla con la base de producción. Los datos que veas y escribas aquí no son los reales.';
}
