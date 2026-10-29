/**
 * P-08 · DESTINO FIREBASE DEL CLIENTE, RESUELTO EN UN SOLO SITIO
 * =====================================================================
 * Hasta ahora el cliente leía `firebase-applet-config.json` **versionado** desde
 * tres módulos (`firebase.ts`, `entornoFirebase.ts`, `googleAuth.ts`). El fichero
 * no se puede variar por entorno desde Vercel, así que un despliegue de staging
 * seguiría hablando con producción en la interfaz: el staging solo funcionaría
 * para `/api/*`.
 *
 * Este módulo resuelve el destino UNA vez y los tres lo consumen.
 *
 * REGLA DE ORO (lo que impide que esto se convierta en un riesgo)
 * ---------------------------------------------------------------
 * Las variables `VITE_FIREBASE_*` **solo se leen si `VITE_ENTORNO_FIREBASE` vale
 * exactamente `staging`**. En cualquier otro caso mandan el JSON versionado y las
 * variables se ignoran por completo. Consecuencia práctica: **una variable suelta
 * mal puesta en el panel de Vercel no puede cambiar el destino de producción.**
 *
 * Y al revés: declarar `staging` sin la configuración completa **no cae a
 * producción en silencio**, falla con un error explícito. Un despliegue de
 * pruebas que apunta a clientes reales es peor que un despliegue roto.
 *
 * Por qué fallar cerrado y no «usar lo que haya»: el modo de fallo silencioso de
 * esta clase de configuración es el caro — el staging nace apuntando a la base real
 * y nadie lo nota hasta que hay datos de clientes escritos desde un entorno sin
 * garantías.
 */
import firebaseConfigVersionado from '../../firebase-applet-config.json';

/** Entorno del cliente. `staging` es el único que habilita variables. */
export type EntornoClienteFirebase = 'produccion' | 'staging';

/** De dónde salió la configuración que se va a usar. */
export type OrigenDestino = 'JSON_VERSIONADO' | 'VARIABLES_ENTORNO';

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
  | 'DESTINO_ENTORNO_DESCONOCIDO'
  | 'DESTINO_STAGING_INCOMPLETO'
  | 'DESTINO_STAGING_INCOHERENTE'
  | 'DESTINO_JSON_INVALIDO'
  | 'DESTINO_BASE_DATOS_INVALIDA'
  // Un módulo ya creó la app de Firebase con OTRO proyecto (p. ej. la
  // configuración versionada) antes que este. Se falla en voz alta: reutilizar
  // esa app sería escribir en el destino equivocado sin que nadie lo note.
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
  | {
      estado: 'OK';
      config: ConfiguracionClienteFirebase;
      entorno: EntornoClienteFirebase;
      origen: OrigenDestino;
    }
  | { estado: 'ERROR'; codigo: CodigoErrorDestino; mensaje: string };

/** Proyecto de producción. Debe coincidir con `PROYECTO_PRODUCCION` del servidor. */
export const PROYECTO_CLIENTE_PRODUCCION = 'gestor-inmuebles-produccion';
/** Proyecto de staging. Debe coincidir con `PROYECTO_STAGING` del servidor. */
export const PROYECTO_CLIENTE_STAGING = 'gestor-inmuebles-staging';

/** Identificador estructuralmente válido de base Firestore con nombre. */
export function esBaseDatosConNombre(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(valor);
}

function leer(entorno: Readonly<Record<string, unknown>>, nombre: string): string {
  const valor = entorno[nombre];
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Entorno declarado por `VITE_ENTORNO_FIREBASE`.
 * Ausente o vacío = producción (compatibilidad con todo lo desplegado hoy).
 * Un valor no reconocido devuelve `null`: **no** se interpreta como producción.
 */
export function entornoClienteDeclarado(
  entorno: Readonly<Record<string, unknown>>
): EntornoClienteFirebase | null {
  const crudo = leer(entorno, 'VITE_ENTORNO_FIREBASE').toLowerCase();
  if (crudo === '') return 'produccion';
  if (crudo === 'produccion' || crudo === 'production' || crudo === 'prod') return 'produccion';
  if (crudo === 'staging' || crudo === 'pre' || crudo === 'preproduccion') return 'staging';
  return null;
}

/**
 * Configuración versionada, validada. Se usa tal cual en producción.
 * `versionada` es inyectable para poder probar el caso inválido sin tocar el
 * fichero real (antes esto solo se podía comprobar leyendo el código fuente).
 */
function configuracionVersionada(
  versionada: Readonly<Record<string, unknown>> = firebaseConfigVersionado as unknown as Record<string, unknown>
): ResultadoDestino {
  const crudo = versionada;
  const projectId = leer(crudo, 'projectId');
  const baseDatos = leer(crudo, 'firestoreDatabaseId');
  if (!projectId) {
    return { estado: 'ERROR', codigo: 'DESTINO_JSON_INVALIDO', mensaje: 'firebase-applet-config.json no declara `projectId`.' };
  }
  if (!esBaseDatosConNombre(baseDatos)) {
    return {
      estado: 'ERROR',
      codigo: 'FIREBASE_BASE_DATOS_AUSENTE',
      mensaje: 'firebase-applet-config.json debe declarar `firestoreDatabaseId` como base CON NOMBRE; la base por defecto no forma parte de la arquitectura.',
    };
  }
  return {
    estado: 'OK',
    entorno: 'produccion',
    origen: 'JSON_VERSIONADO',
    config: {
      projectId,
      appId: leer(crudo, 'appId'),
      apiKey: leer(crudo, 'apiKey'),
      authDomain: leer(crudo, 'authDomain'),
      firestoreDatabaseId: baseDatos,
      storageBucket: leer(crudo, 'storageBucket'),
      messagingSenderId: leer(crudo, 'messagingSenderId'),
      measurementId: leer(crudo, 'measurementId'),
      oAuthClientId: leer(crudo, 'oAuthClientId'),
      recaptchaSiteKey: leer(crudo, 'recaptchaSiteKey'),
    },
  };
}

const OBLIGATORIAS_STAGING = [
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_FIRESTORE_DATABASE_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
] as const;

/**
 * Resuelve la configuración del cliente.
 *
 * @param entorno variables de entorno inyectables para prueba
 *                (en el navegador: `import.meta.env`).
 */
export function resolverDestinoClienteFirebase(
  entorno: Readonly<Record<string, unknown>>,
  versionada?: Readonly<Record<string, unknown>>
): ResultadoDestino {
  const declarado = entornoClienteDeclarado(entorno);
  if (declarado === null) {
    return {
      estado: 'ERROR',
      codigo: 'DESTINO_ENTORNO_DESCONOCIDO',
      mensaje: `VITE_ENTORNO_FIREBASE tiene un valor no reconocido («${leer(entorno, 'VITE_ENTORNO_FIREBASE')}»): usa «produccion» o «staging». No se asume producción.`,
    };
  }
  // Producción: el JSON versionado manda y las VITE_FIREBASE_* se IGNORAN.
  if (declarado === 'produccion') return configuracionVersionada(versionada);

  const faltan = OBLIGATORIAS_STAGING.filter((nombre) => leer(entorno, nombre) === '');
  if (faltan.length > 0) {
    return {
      estado: 'ERROR',
      codigo: 'DESTINO_STAGING_INCOMPLETO',
      mensaje: `Entorno «staging» declarado sin configuración completa. Faltan: ${faltan.join(', ')}. No se cae a producción: el staging quedaría apuntando a clientes reales.`,
    };
  }

  const projectId = leer(entorno, 'VITE_FIREBASE_PROJECT_ID');
  // Un staging que apunta al proyecto real permitiría escribir datos de clientes
  // desde un entorno sin garantías: es el fallo que esta comprobación evita.
  if (projectId === PROYECTO_CLIENTE_PRODUCCION) {
    return {
      estado: 'ERROR',
      codigo: 'DESTINO_STAGING_INCOHERENTE',
      mensaje: `VITE_FIREBASE_PROJECT_ID apunta a producción (${PROYECTO_CLIENTE_PRODUCCION}) desde un despliegue declarado «staging».`,
    };
  }

  const baseDatos = leer(entorno, 'VITE_FIREBASE_FIRESTORE_DATABASE_ID');
  if (!esBaseDatosConNombre(baseDatos)) {
    return {
      estado: 'ERROR',
      codigo: 'DESTINO_BASE_DATOS_INVALIDA',
      mensaje: 'VITE_FIREBASE_FIRESTORE_DATABASE_ID debe ser una base CON NOMBRE; la base por defecto no forma parte de la arquitectura.',
    };
  }

  return {
    estado: 'OK',
    entorno: 'staging',
    origen: 'VARIABLES_ENTORNO',
    config: {
      projectId,
      appId: leer(entorno, 'VITE_FIREBASE_APP_ID'),
      apiKey: leer(entorno, 'VITE_FIREBASE_API_KEY'),
      authDomain: leer(entorno, 'VITE_FIREBASE_AUTH_DOMAIN'),
      firestoreDatabaseId: baseDatos,
      storageBucket: leer(entorno, 'VITE_FIREBASE_STORAGE_BUCKET'),
      messagingSenderId: leer(entorno, 'VITE_FIREBASE_MESSAGING_SENDER_ID'),
      measurementId: leer(entorno, 'VITE_FIREBASE_MEASUREMENT_ID'),
      oAuthClientId: leer(entorno, 'VITE_FIREBASE_OAUTH_CLIENT_ID'),
      recaptchaSiteKey: leer(entorno, 'VITE_FIREBASE_RECAPTCHA_SITE_KEY'),
    },
  };
}

/** Variables de `import.meta.env`; `{}` en entornos sin Vite (node:test, scripts). */
function entornoVite(): Readonly<Record<string, unknown>> {
  try {
    const meta = import.meta as unknown as { env?: Record<string, unknown> };
    return meta.env ?? {};
  } catch {
    return {};
  }
}

/**
 * Destino resuelto del proceso. Se calcula UNA vez: si la configuración es
 * incoherente, el error salta al importar cualquier módulo que use Firebase, en
 * lugar de degradarse a un destino por defecto.
 */
export const DESTINO_FIREBASE: ResultadoDestino = resolverDestinoClienteFirebase(entornoVite());

/** Destino válido o excepción. Para los módulos que no pueden arrancar sin él. */
export function destinoFirebaseRequerido(
  resultado: ResultadoDestino = DESTINO_FIREBASE
): ConfiguracionClienteFirebase {
  if (resultado.estado === 'OK') return resultado.config;
  throw new Error(`${resultado.codigo}: ${resultado.mensaje}`);
}

/**
 * Guardia de orden de arranque (P-08).
 *
 * `src/lib/googleAuth.ts` está **congelado por custodia**: conserva su
 * `initializeApp(firebaseConfig)` sobre el JSON versionado y no se puede tocar
 * sin regenerar el manifiesto revisado. En el uso real nunca es él quien crea la
 * app (`getApps().length === 0` es falso porque `firebase.ts` ya arrancó), pero
 * eso es un orden de importación, no una garantía del lenguaje.
 *
 * Esta función convierte ese riesgo en un fallo explícito: si la app existente
 * apunta a otro proyecto, no se reutiliza ni se crea una segunda app — se lanza.
 * Un staging que escribiese en la base de producción «porque el módulo equivocado
 * arrancó primero» es exactamente el accidente que P-08 debe hacer imposible.
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
      `${config.projectId}. No se reutiliza ni se crea una segunda app: revisa el orden de ` +
      `importación (src/lib/googleAuth.ts está congelado por custodia).`
  );
}
