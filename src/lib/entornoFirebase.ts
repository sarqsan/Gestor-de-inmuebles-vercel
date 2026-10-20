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
 */
import firebaseConfig from '../../firebase-applet-config.json';

const cfg = firebaseConfig as { projectId?: string; firestoreDatabaseId?: string };

/** `projectId` con el que la app inicializa Firebase (el destino de `firebase deploy --project`). */
export const FIREBASE_PROYECTO_ID: string = cfg.projectId || '(sin projectId)';

/** Base de datos Firestore (`(default)` si la configuración no declara una con nombre). */
export const FIREBASE_BASE_DATOS_ID: string = cfg.firestoreDatabaseId || '(default)';

/**
 * Base de datos Firestore que las reglas de Cloud Storage pueden consultar con
 * `firestore.get()` / `firestore.exists()`. Según la documentación de Firebase
 * (Storage Security Rules · «Cloud Firestore data»), cuando un proyecto tiene
 * varias bases de datos las reglas de Storage SÓLO acceden a la base por defecto;
 * `storage.rules` de este repositorio escribe literalmente `/databases/(default)/…`.
 */
export const BASE_DATOS_ACCESIBLE_DESDE_STORAGE_RULES = '(default)';

/**
 * AG-03 · Diagnóstico de topología (sin red): `true` cuando la aplicación opera
 * sobre una base Firestore CON NOMBRE mientras `storage.rules` resuelve el
 * ámbito (espejo de identidad, inmuebles, carteras…) contra `(default)`.
 *
 * Consecuencia en ese caso: salvo que el espejo exista también en `(default)`,
 * toda operación de Storage con ámbito se deniega para cualquier cuenta que no
 * sea la maestra (que las reglas reconocen por correo). Si realmente ocurre en
 * el proyecto desplegado sólo puede confirmarse con una prueba autorizada
 * (V — pendiente de verificación); esta función solo deja constancia de la
 * discrepancia de configuración que la haría inevitable.
 */
export function custodiaStorageDependeDeBaseDistinta(): boolean {
  return FIREBASE_BASE_DATOS_ID !== BASE_DATOS_ACCESIBLE_DESDE_STORAGE_RULES;
}

/** Texto para la pantalla de Configuración (sin datos sensibles). */
export function avisoTopologiaCustodia(): string | null {
  if (!custodiaStorageDependeDeBaseDistinta()) return null;
  return `La aplicación opera sobre la base de datos «${FIREBASE_BASE_DATOS_ID}», pero las reglas de almacenamiento de documentos sólo pueden comprobar permisos en la base «${BASE_DATOS_ACCESIBLE_DESDE_STORAGE_RULES}». Si esa base no contiene la ficha de usuarios, inmuebles y carteras, la custodia de documentos quedará denegada a toda cuenta que no sea la maestra (pendiente de verificación autorizada en el proyecto real).`;
}
