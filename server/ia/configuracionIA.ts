/**
 * IA · FASE 1 — DEPENDENCIAS REALES DEL NÚCLEO DE IA
 * ==================================================
 * Construye, a partir del entorno del servidor, las dependencias del núcleo
 * (`server/ia/nucleoIA.ts`) reutilizando la integración Google ya existente
 * (`server/titularidades/googleBackend.ts`, sin SDK de administración):
 *
 *   · Proyecto para verificar el ID token: `FIREBASE_PROJECT_ID` o, por
 *     defecto, el `projectId` con el que la app inicializa Firebase
 *     (`firebase-applet-config.json`, el mismo que lee `src/lib/entornoFirebase.ts`)
 *     o, en último lugar, el de la credencial de servicio. No necesita
 *     credencial: la autenticación funciona siempre.
 *   · Registro: con credencial de servicio (`FIREBASE_SERVICE_ACCOUNT`,
 *     `_B64`, `_PATH` o `GOOGLE_APPLICATION_CREDENTIALS`, las mismas variables
 *     que la búsqueda de titulares) → Firestore REST en la base de datos de la
 *     aplicación (`FIRESTORE_DATABASE_ID` o la de la configuración). Sin
 *     credencial: memoria en desarrollo; NO_CONFIGURADO en producción.
 *   · Proveedor: `GEMINI_API_KEY` (la misma clave de siempre).
 *
 * No escribe ni modifica secretos: sólo los lee.
 */
import {
  ClienteFirestoreRest,
  leerCuentaServicio,
  verificarIdToken,
  type CuentaServicio,
} from '../titularidades/googleBackend';
// Mismo fichero con el que la app inicializa Firebase (no es una segunda configuración).
// Con atributo de importación: la función de Vercel se ejecuta como ESM nativo
// (`"type": "module"`), donde un JSON sin `with { type: 'json' }` no se puede importar.
import configuracionAplicacion from '../../firebase-applet-config.json' with { type: 'json' };
import { crearClienteGemini, type DependenciasNucleoIA, type ModoRegistroIA } from './nucleoIA';
import { crearRegistroFirestore, crearRegistroMemoria } from './registroOperacionesIA';

export interface ConfiguracionNucleoIA {
  proyectoId: string | null;
  baseDatosId: string;
  produccion: boolean;
  modoRegistro: ModoRegistroIA;
}

function limpio(valor: string | undefined): string {
  return (valor ?? '').trim();
}

/** Resuelve la configuración (pura; sin red). */
export function resolverConfiguracionIA(
  entorno: NodeJS.ProcessEnv = process.env,
  cuenta: CuentaServicio | null = leerCuentaServicio(entorno),
): ConfiguracionNucleoIA {
  const aplicacion = configuracionAplicacion as { projectId?: string; firestoreDatabaseId?: string };
  const proyectoId = limpio(entorno.FIREBASE_PROJECT_ID) || limpio(aplicacion.projectId) || cuenta?.project_id || null;
  const baseDatosId = limpio(entorno.FIRESTORE_DATABASE_ID) || limpio(aplicacion.firestoreDatabaseId) || '(default)';
  const produccion = Boolean(limpio(entorno.VERCEL)) || entorno.NODE_ENV === 'production';
  const modoRegistro: ModoRegistroIA = cuenta ? 'FIRESTORE' : produccion ? 'NO_CONFIGURADO' : 'MEMORIA';
  return { proyectoId, baseDatosId, produccion, modoRegistro };
}

/** Dependencias reales del núcleo de IA a partir del entorno del servidor. */
export function crearDependenciasNucleoIA(
  entorno: NodeJS.ProcessEnv = process.env,
): DependenciasNucleoIA & { configuracion: ConfiguracionNucleoIA } {
  const cuenta = leerCuentaServicio(entorno);
  const configuracion = resolverConfiguracionIA(entorno, cuenta);

  let registro: DependenciasNucleoIA['registro'] = null;
  if (cuenta && configuracion.modoRegistro === 'FIRESTORE') {
    if (configuracion.proyectoId && cuenta.project_id !== configuracion.proyectoId) {
      console.warn(
        `[ia] La credencial de servicio es del proyecto ${cuenta.project_id} y la aplicación usa ${configuracion.proyectoId}: el registro se escribe en el proyecto de la credencial.`,
      );
    }
    registro = crearRegistroFirestore(new ClienteFirestoreRest({ cuenta, baseDatosId: configuracion.baseDatosId }));
  } else if (configuracion.modoRegistro === 'MEMORIA') {
    console.warn('[ia] Registro de operaciones de IA EN MEMORIA (sólo desarrollo): no es duradero. Configura FIREBASE_SERVICE_ACCOUNT para persistirlo en Firestore.');
    registro = crearRegistroMemoria();
  } else {
    console.warn(
      '[ia] Registro de operaciones de IA NO CONFIGURADO en producción: se exige sesión, pero los endpoints de IA responden con su respaldo heurístico (sin llamadas al proveedor) hasta configurar FIREBASE_SERVICE_ACCOUNT con permiso de escritura en Firestore.',
    );
  }

  const proyectoId = configuracion.proyectoId;
  return {
    configuracion,
    verificarToken: (token: string) => (proyectoId ? verificarIdToken(token, proyectoId) : Promise.resolve(null)),
    registro,
    crearClienteProveedor: () => crearClienteGemini(entorno.GEMINI_API_KEY),
  };
}
