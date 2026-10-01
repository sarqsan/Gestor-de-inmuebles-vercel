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
