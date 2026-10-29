/**
 * DESTINO FIREBASE DEL CLIENTE, EN UN SOLO SITIO
 * =====================================================================
 * La aplicación habla con **un único proyecto**: el que declara el fichero
 * `firebase-applet-config.json` que está guardado en el repositorio. No hay
 * ninguna variable de entorno capaz de cambiarlo.
 *
 * DECISIÓN DEL TITULAR (2026-10-29): **no hay ni habrá entorno de pruebas.**
 * Se llegaron a preparar variables (`VITE_ENTORNO_FIREBASE`, `VITE_FIREBASE_*`)
 * para poder desplegar una copia de pruebas; se han **retirado**. La aplicación
 * solo puede apuntar a la base real, y si algo la dejara mal configurada, **no
 * arranca** en vez de conectarse a un sitio que no es el suyo.
 *
 * Este módulo resuelve el destino UNA vez y lo consumen los demás, para que solo
 * exista una respuesta a «¿con qué base de datos estoy hablando?».
 */
import firebaseConfigVersionado from '../../firebase-applet-config.json';

/** Proyecto real. Único destino admitido, escrito aquí para poder comprobarlo. */
export const PROYECTO_CLIENTE_PRODUCCION = 'gestor-inmuebles-produccion';

/** Mínimo que necesitamos de una app de Firebase ya inicializada por otro módulo. */
export interface AppPrecedenteFirebase {
  readonly name?: string;
  // Opcional a propósito: hay pruebas que sustituyen el SDK por un doble sin
  // `options`. La guardia solo puede decidir cuando el proyecto es legible.
  readonly options?: { readonly projectId?: string };
}

export type CodigoErrorDestino =
  // Se conserva el código histórico del arranque del cliente (AG-03.2): el
  // mensaje que ve quien despliega no cambia por un refactor interno.
  | 'FIREBASE_BASE_DATOS_AUSENTE'
  | 'DESTINO_JSON_INVALIDO'
  | 'DESTINO_BASE_DATOS_INVALIDA'
  // El fichero declara un proyecto que no es el real. Antes de la decisión del
  // titular, este código se usaba para señalar un despliegue de pruebas; ahora
  // solo significa una cosa: la configuración está mal y no se arranca.
  | 'DESTINO_PROYECTO_INCOMPATIBLE'
  // Un módulo ya creó la app de Firebase con OTRO proyecto antes que este. Se
  // falla en voz alta: reutilizar esa app sería escribir donde no toca.
  | 'DESTINO_APP_PRECEDENTE_INCOMPATIBLE';

/** Campos que `initializeApp` necesita para funcionar de verdad. */
export interface ConfiguracionClienteFirebase {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId?: string;
  measurementId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

/**
 * Resultado discriminado por `estado` (cadena, no booleano): este proyecto
 * compila sin `strictNullChecks` y ahí TypeScript **no estrecha** uniones por un
 * discriminante booleano (`{ ok: true } | { ok: false }`). Un fallo silencioso de
 * tipos en el módulo que decide a qué base se conecta la app es justo lo que no
 * se puede permitir, así que el discriminante es explícito.
 */
export type ResultadoDestino =
  | { estado: 'OK'; config: ConfiguracionClienteFirebase }
  | { estado: 'ERROR'; codigo: CodigoErrorDestino; mensaje: string };

/** Identificador estructuralmente válido de base Firestore con nombre. */
export function esBaseDatosConNombre(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(valor);
}

function leer(config: Readonly<Record<string, unknown>>, nombre: string): string {
  const valor = config[nombre];
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Configuración versionada, validada.
 * `versionada` es inyectable para poder probar los casos inválidos sin tocar el
 * fichero real.
 */
export function resolverDestinoClienteFirebase(
  versionada: Readonly<Record<string, unknown>> = firebaseConfigVersionado as unknown as Record<string, unknown>
): ResultadoDestino {
  const projectId = leer(versionada, 'projectId');
  const baseDatos = leer(versionada, 'firestoreDatabaseId');

  if (!projectId) {
    return {
      estado: 'ERROR',
      codigo: 'DESTINO_JSON_INVALIDO',
      mensaje: 'firebase-applet-config.json no declara `projectId`.',
    };
  }
  // El cliente no arranca contra un proyecto que no sea el real: es la garantía
  // de que no existe forma de que la interfaz hable con otro sitio.
  if (projectId !== PROYECTO_CLIENTE_PRODUCCION) {
    return {
      estado: 'ERROR',
      codigo: 'DESTINO_PROYECTO_INCOMPATIBLE',
      mensaje:
        `firebase-applet-config.json declara el proyecto «${projectId}» y el único destino ` +
        `admitido es ${PROYECTO_CLIENTE_PRODUCCION}. No hay entornos alternativos: si este ` +
        `fichero se editó, hay que devolverlo al proyecto real.`,
    };
  }
  if (!esBaseDatosConNombre(baseDatos)) {
    return {
      estado: 'ERROR',
      codigo: 'FIREBASE_BASE_DATOS_AUSENTE',
      mensaje:
        'firebase-applet-config.json debe declarar `firestoreDatabaseId` como base CON NOMBRE; ' +
        'la base por defecto no forma parte de la arquitectura.',
    };
  }

  return {
    estado: 'OK',
    config: {
      projectId,
      appId: leer(versionada, 'appId'),
      apiKey: leer(versionada, 'apiKey'),
      authDomain: leer(versionada, 'authDomain'),
      firestoreDatabaseId: baseDatos,
      storageBucket: leer(versionada, 'storageBucket'),
      messagingSenderId: leer(versionada, 'messagingSenderId'),
      measurementId: leer(versionada, 'measurementId'),
      oAuthClientId: leer(versionada, 'oAuthClientId'),
      recaptchaSiteKey: leer(versionada, 'recaptchaSiteKey'),
    },
  };
}

/**
 * Destino resuelto del proceso. Se calcula UNA vez: si la configuración es
 * incoherente, el error salta al importar cualquier módulo que use Firebase, en
 * lugar de degradarse a un destino por defecto.
 */
export const DESTINO_FIREBASE: ResultadoDestino = resolverDestinoClienteFirebase();

/** Destino válido o excepción. Para los módulos que no pueden arrancar sin él. */
export function destinoFirebaseRequerido(
  resultado: ResultadoDestino = DESTINO_FIREBASE
): ConfiguracionClienteFirebase {
  if (resultado.estado === 'OK') return resultado.config;
  throw new Error(`${resultado.codigo}: ${resultado.mensaje}`);
}

/**
 * Guardia de orden de arranque.
 *
 * `src/lib/googleAuth.ts` está **congelado por custodia** (debe seguir byte a byte
 * igual a `main`): conserva su `initializeApp(firebaseConfig)` y no se puede
 * tocar sin regenerar el manifiesto revisado. En el uso real nunca es él quien
 * crea la app (`getApps().length === 0` es falso porque `firebase.ts` ya arrancó),
 * pero eso es un orden de importación, no una garantía del lenguaje.
 *
 * Esta función convierte ese riesgo en un fallo explícito: si la app existente
 * apunta a otro proyecto, no se reutiliza ni se crea una segunda app — se lanza.
 */
export function verificarAppPrecedente(
  apps: readonly AppPrecedenteFirebase[],
  config: ConfiguracionClienteFirebase
): void {
  const ajena = apps.find(
    (app) => app.options?.projectId !== undefined && app.options.projectId !== config.projectId
  );
  if (!ajena) return;
  const proyectoAjeno = String(ajena.options?.projectId);
  throw new Error(
    `DESTINO_APP_PRECEDENTE_INCOMPATIBLE: la app de Firebase «${ajena.name ?? '[DEFAULT]'}» ya estaba ` +
      `inicializada con el proyecto ${proyectoAjeno} y el destino resuelto es ` +
      `${config.projectId}. No se reutiliza ni se crea una segunda app.`
  );
}
