/**
 * NORMALIZACIÓN DE ERRORES DE FIRESTORE
 * =====================================
 * BLOQUE 1 — Portal Propietario: persistencia fiable.
 *
 * Problema que resuelve:
 *   Hoy los servicios de `src/lib/firebase.ts` capturan el error y sólo hacen
 *   `console.error(...)`. La UI nunca se entera, confirma la operación igualmente
 *   y el usuario cree que se ha guardado algo que Firestore rechazó.
 *
 * Qué aporta este módulo:
 *   · Un tipo de error propio (`ErrorFirestore`) con mensaje **comprensible** para
 *     el usuario y detalle técnico para consola/auditoría.
 *   · `normalizarErrorFirestore`: traduce códigos de Firebase a texto accionable
 *     en español (permisos, red, sesión, validación…).
 *   · `esErrorFirestore`: discriminador para no tratar como error de negocio lo
 *     que no lo es.
 *
 * Este módulo es PURO (sin efectos ni dependencias de Firebase): 100 % testeable.
 */

/** Código semántico propio, estable, independiente del código de Firebase. */
export type CodigoErrorFirestore =
  | 'PERMISOS'          // permission-denied
  | 'SESION'            // unauthenticated
  | 'RED'               // unavailable / deadline-exceeded
  | 'NO_ENCONTRADO'     // not-found
  | 'VALIDACION'        // invalid-argument / failed-precondition
  | 'LIMITE'            // resource-exhausted / quota
  | 'CANCELADO'         // cancelled / aborted
  | 'YA_EXISTE'         // already-exists
  | 'DESCONOCIDO';

export interface ErrorFirestore {
  /** Siempre true: discriminador cómodo en tiempo de ejecución. */
  esErrorFirestore: true;
  codigo: CodigoErrorFirestore;
  /** Código original de Firebase (p.ej. 'permission-denied'), si se pudo leer. */
  codigoOriginal?: string;
  /** Mensaje pensado para MOSTRAR al usuario: claro, accionable, sin jerga. */
  mensajeUsuario: string;
  /** Detalle técnico para consola / auditoría. */
  mensajeTecnico: string;
  /** Contexto de la operación (p.ej. 'alta de inmueble'). */
  operacion: string;
  /** Error original, si estaba disponible. */
  original?: unknown;
}

/** Tabla de traducción de códigos de Firebase a nuestro código semántico. */
const MAPA_CODIGOS: Record<string, CodigoErrorFirestore> = {
  'permission-denied': 'PERMISOS',
  'unauthenticated': 'SESION',
  'unavailable': 'RED',
  'deadline-exceeded': 'RED',
  'not-found': 'NO_ENCONTRADO',
  'invalid-argument': 'VALIDACION',
  'failed-precondition': 'VALIDACION',
  'out-of-range': 'VALIDACION',
  'resource-exhausted': 'LIMITE',
  'quota-exceeded': 'LIMITE',
  'cancelled': 'CANCELADO',
  'aborted': 'CANCELADO',
  'already-exists': 'YA_EXISTE',
};

/** Mensajes por defecto por código semántico. */
const MENSAJES_BASE: Record<CodigoErrorFirestore, string> = {
  PERMISOS:
    'No tienes permisos para realizar esta operación. Si crees que deberías poder hacerla, contacta con la administración.',
  SESION:
    'Tu sesión ha caducado o no está verificada. Vuelve a iniciar sesión y repite la operación.',
  RED:
    'No se ha podido contactar con el servidor. Comprueba tu conexión e inténtalo de nuevo.',
  NO_ENCONTRADO:
    'El registro que intentas modificar ya no existe. Actualiza la pantalla y vuelve a intentarlo.',
  VALIDACION:
    'Los datos enviados no son válidos o no cumplen las reglas del sistema. Revisa los campos e inténtalo de nuevo.',
  LIMITE:
    'Se ha superado el límite de uso del servicio. Espera unos instantes e inténtalo de nuevo.',
  CANCELADO:
    'La operación se ha cancelado. Inténtalo de nuevo.',
  YA_EXISTE:
    'El registro ya existe. Actualiza la pantalla para ver el estado real.',
  DESCONOCIDO:
    'Se ha producido un error inesperado al guardar. Inténtalo de nuevo y, si persiste, contacta con la administración.',
};

/**
 * Extrae el código de error de un error de Firebase.
 * Los errores del SDK traen `code` como string ('permission-denied') o como
 * cadena con prefijo ('firestore/permission-denied').
 */
export function extraerCodigoFirebase(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const candidato = (err as { code?: unknown }).code;
  if (typeof candidato !== 'string' || candidato.length === 0) return undefined;
  // 'firestore/permission-denied' → 'permission-denied'
  const partes = candidato.split('/');
  return partes.length > 1 ? partes[partes.length - 1] : candidato;
}

/** Extrae el mensaje técnico de un error desconocido sin romper si no es un Error. */
export function extraerMensajeTecnico(err: unknown): string {
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim().length > 0) return m;
  }
  return 'Error sin descripción';
}

/** ¿Es un error ya normalizado por este módulo? */
export function esErrorFirestore(err: unknown): err is ErrorFirestore {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { esErrorFirestore?: unknown }).esErrorFirestore === true
  );
}

/**
 * Traduce cualquier excepción a un `ErrorFirestore` con mensaje accionable.
 *
 * @param err       Excepción capturada (de Firebase o de otro tipo).
 * @param operacion Descripción legible de la operación ('alta de inmueble').
 * @param sufijo    Aclaración extra que se añade al mensaje de usuario
 *                  (p.ej. 'Los cambios NO se han guardado.').
 */
export function normalizarErrorFirestore(
  err: unknown,
  operacion: string,
  sufijo?: string
): ErrorFirestore {
  // Ya normalizado: sólo enriquecemos el contexto si faltaba.
  if (esErrorFirestore(err)) {
    return {
      ...err,
      operacion: err.operacion || operacion,
      mensajeUsuario: sufijo ? `${err.mensajeUsuario} ${sufijo}` : err.mensajeUsuario,
    };
  }

  const codigoOriginal = extraerCodigoFirebase(err);
  const codigo: CodigoErrorFirestore =
    (codigoOriginal && MAPA_CODIGOS[codigoOriginal]) || 'DESCONOCIDO';
  const mensajeTecnico = extraerMensajeTecnico(err);

  let mensajeUsuario = MENSAJES_BASE[codigo];

  // Traducciones específicas por operación para los casos más críticos.
  if (codigo === 'PERMISOS' && /inmueble/i.test(operacion)) {
    mensajeUsuario =
      'El sistema ha rechazado la operación sobre el inmueble por falta de permisos. ' +
      'Comprueba que el inmueble está vinculado a tu titularidad y que tu cuenta está activa.';
  }

  if (sufijo) mensajeUsuario = `${mensajeUsuario} ${sufijo}`;

  return {
    esErrorFirestore: true,
    codigo,
    codigoOriginal,
    mensajeUsuario,
    mensajeTecnico: `[${operacion}] ${mensajeTecnico}`,
    operacion,
    original: err,
  };
}

/** Mensaje por defecto cuando una operación falla: deja claro que NO se guardó. */
export const AVISO_NO_GUARDADO = 'Los cambios NO se han guardado.';
