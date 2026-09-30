/**
 * NORMALIZACIÓN DE ERRORES DE PERSISTENCIA
 * ========================================
 * Un fallo de Firestore llega como `FirebaseError` con un código tipo
 * `permission-denied`. El usuario no debe recibir un texto técnico, pero sí
 * necesita saber QUÉ pasó (permisos, red, datos…), porque "no se ha podido
 * guardar, inténtelo de nuevo" esconde el problema real.
 *
 * Se usa para que el aviso de error muestro el motivo ESPECÍFICO (BLOQUE 10 ·
 * UX-3 mantiene su veredicto de persistencia; aquí sólo se afina el mensaje).
 */

export interface ErrorNormalizado {
  /** Código crudo (`permission-denied`, `unavailable`, …) o `desconocido`. */
  codigo: string;
  /** ¿Es un problema de permisos/reglas? */
  esPermisos: boolean;
  /** ¿Es un problema de red / disponibilidad? */
  esRed: boolean;
  /** Mensaje presentable al usuario (sin jerga técnica). */
  mensaje: string;
}

const MENSAJES: Record<string, string> = {
  'permission-denied':
    'No tienes permiso para realizar esta operación. Si crees que es un error, contacta con administración.',
  unauthenticated: 'Tu sesión ha caducado. Vuelve a iniciar sesión para continuar.',
  unavailable: 'El servicio no responde en este momento. Inténtalo de nuevo en unos segundos.',
  'deadline-exceeded': 'La operación ha tardado demasiado y se ha cancelado. Inténtalo de nuevo.',
  'not-found': 'El documento ya no existe. Actualiza la vista y vuelve a intentarlo.',
  'already-exists': 'Ya existe un registro con esa referencia. Actualiza la vista.',
  'resource-exhausted': 'Se ha superado el límite de uso del servicio. Inténtalo más tarde.',
  'failed-precondition':
    'La operación no cumple las condiciones requeridas (por ejemplo, un índice o una regla). Actualiza la vista y reinténtalo.',
  'invalid-argument': 'Los datos enviados no son válidos. Revisa el formulario.',
  aborted: 'Otra operación concurrente ha cancelado ésta. Inténtalo de nuevo.',
  cancelled: 'La operación se ha cancelado.',
  unimplemented: 'Operación no disponible en esta versión.',
  internal: 'Error interno del servicio de datos. Inténtalo de nuevo.',
};

export function normalizarErrorFirestore(error: unknown): ErrorNormalizado {
  const codigo =
    (error && typeof error === 'object' && 'code' in error && String((error as { code?: unknown }).code || '')) ||
    '';
  const clave = codigo.replace(/^firestore\//, '').trim();
  const esPermisos = clave === 'permission-denied' || clave === 'unauthenticated';
  const esRed = clave === 'unavailable' || clave === 'deadline-exceeded' || clave === 'cancelled';
  const mensaje = MENSAJES[clave] || 'No se ha podido completar la operación. Inténtalo de nuevo.';
  return { codigo: clave || 'desconocido', esPermisos, esRed, mensaje };
}

/** Mensaje presentable combinando el contexto de la operación y el motivo real. */
export function mensajeErrorOperacion(error: unknown, contexto: string): string {
  const n = normalizarErrorFirestore(error);
  if (n.codigo === 'desconocido') return contexto;
  return `${contexto} ${n.mensaje}`;
}
