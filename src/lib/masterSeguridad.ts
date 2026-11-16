/**
 * P0-C · CONTRATO DE PROTECCIÓN DE LA CUENTA MASTER (puro, sin efectos)
 * =====================================================================
 * Este módulo NO activa MFA ni cambia la autenticación. Define el contrato que
 * la aplicación necesita para poder aceptar un segundo factor sin bloquearse, y
 * evalúa el estado de protección de la cuenta.
 *
 * POR QUÉ EXISTE — hallazgo de P0-C:
 *   Hoy `signInWithEmailAndPassword` se maneja sin rama para
 *   `auth/multi-factor-auth-required`. Si se activara MFA en la cuenta master,
 *   el inicio de sesión caería en el error genérico y **la única cuenta capaz de
 *   administrar el sistema quedaría inaccesible**. Por eso el orden correcto es:
 *   primero este contrato (y su cableado), después la activación en Firebase.
 *
 * El SDK instalado (`firebase` 12.x) SÍ expone lo necesario:
 *   `multiFactor`, `getMultiFactorResolver`, `TotpMultiFactorGenerator`,
 *   `PhoneMultiFactorGenerator`.
 *
 * Lo que falta para activar MFA (ver informe, no ejecutado en P0):
 *   1. Cablear `resolverSegundoFactor` en el flujo de login.
 *   2. Pantalla de alta del segundo factor (TOTP recomendado: no depende de SMS).
 *   3. Procedimiento de recuperación ante pérdida del factor.
 *   4. Activación en Firebase Console (requiere despliegue/autorización aparte).
 */

/** Código de Firebase cuando la cuenta tiene MFA y exige el segundo paso. */
export const CODIGO_MFA_REQUERIDO = 'auth/multi-factor-auth-required';

export type EstadoProteccionMaster =
  | 'PROTEGIDA'
  | 'PARCIAL'
  | 'SIN_PROTECCION';

export interface DatosProteccionMaster {
  /** La cuenta de Firebase tiene el email verificado. */
  emailVerificado: boolean;
  /** Existe un segundo factor dado de alta (TOTP o teléfono). */
  segundoFactorActivo: boolean;
  /** La aplicación sabe resolver el reto de segundo factor (contrato cableado). */
  soporteSegundoFactor: boolean;
  /** Existe un correo de recuperación operativo (sendPasswordResetEmail). */
  recuperacionDisponible: boolean;
}

export interface EvaluacionProteccion {
  estado: EstadoProteccionMaster;
  motivos: string[];
  /** Riesgo de bloqueo al activar el factor sin el soporte correspondiente. */
  riesgoBloqueo: boolean;
}

/**
 * ¿El error corresponde a un reto de segundo factor?
 * Sin esta comprobación, el reto se confunde con credenciales incorrectas.
 */
export function esErrorMfa(error: unknown): boolean {
  const codigo = (error as { code?: string } | null)?.code;
  return codigo === CODIGO_MFA_REQUERIDO;
}

export type ResultadoAutenticacion =
  | { tipo: 'AUTENTICADO' }
  | { tipo: 'REQUIERE_SEGUNDO_FACTOR'; resolver: unknown; mensaje: string }
  | { tipo: 'ERROR'; mensaje: string };

/**
 * Clasifica el resultado de un intento de login.
 * Es el punto que hoy NO existe y que provoca el bloqueo del master si se
 * activa MFA sin cablearlo.
 */
export function clasificarIntentoLogin(error: unknown): ResultadoAutenticacion {
  if (!error) return { tipo: 'AUTENTICADO' };
  if (esErrorMfa(error)) {
    const e = error as { resolver?: unknown };
    return {
      tipo: 'REQUIERE_SEGUNDO_FACTOR',
      resolver: e.resolver ?? null,
      mensaje: 'Tu cuenta tiene verificación en dos pasos. Introduce el código de tu aplicación de autenticación.',
    };
  }
  return {
    tipo: 'ERROR',
    mensaje: 'No se ha podido iniciar sesión. Comprueba tus credenciales o recupera el acceso.',
  };
}

/**
 * Evalúa el estado de protección del master.
 * `riesgoBloqueo` es true cuando el factor está activo pero la app no sabe
 * resolverlo: activar en ese estado deja la cuenta inaccesible.
 */
export function evaluarProteccionMaster(datos: DatosProteccionMaster): EvaluacionProteccion {
  const motivos: string[] = [];
  if (!datos.emailVerificado) motivos.push('El email de la cuenta no está verificado.');
  if (!datos.segundoFactorActivo) motivos.push('No hay segundo factor activo: la cuenta depende solo de la contraseña.');
  if (!datos.recuperacionDisponible) motivos.push('No hay canal de recuperación operativo.');

  const riesgoBloqueo = datos.segundoFactorActivo && !datos.soporteSegundoFactor;
  if (riesgoBloqueo) {
    motivos.push('BLOQUEO INMINENTE: el segundo factor está activo pero la aplicación no puede resolverlo. La cuenta master quedaría inaccesible.');
  }

  let estado: EstadoProteccionMaster;
  if (riesgoBloqueo) estado = 'SIN_PROTECCION';
  else if (datos.emailVerificado && datos.segundoFactorActivo && datos.soporteSegundoFactor && datos.recuperacionDisponible) {
    estado = 'PROTEGIDA';
  } else estado = 'PARCIAL';

  return { estado, motivos, riesgoBloqueo };
}

/**
 * Requisitos mínimos antes de activar MFA en la cuenta master.
 * Devuelve la lista de lo que falta; vacía ⇒ se puede activar con seguridad.
 */
export function requisitosParaActivarMfa(datos: DatosProteccionMaster): string[] {
  const faltan: string[] = [];
  if (!datos.soporteSegundoFactor) {
    faltan.push('Cablear la resolución del reto de segundo factor en el login (hoy inexistente).');
  }
  if (!datos.emailVerificado) {
    faltan.push('Verificar el email de la cuenta master en Firebase Auth.');
  }
  if (!datos.recuperacionDisponible) {
    faltan.push('Confirmar que el correo de recuperación llega al buzón del master.');
  }
  faltan.push('Disponer de procedimiento documentado de recuperación ante pérdida del segundo factor (códigos de respaldo o administrador de respaldo).');
  faltan.push('Activar el factor en Firebase Console y validar el login completo en un entorno aislado ANTES de producción.');
  return faltan;
}

/**
 * Procedimiento de recuperación ante pérdida del segundo factor.
 * Se expone como datos para que la UI y la documentación operativa usen la
 * misma fuente y no se contradigan.
 */
export const PROCEDIMIENTO_RECUPERACION_MASTER: readonly { paso: number; accion: string; requiere: string }[] = Object.freeze([
  { paso: 1, accion: 'Usar un código de respaldo de MFA (si se generaron al dar de alta el factor).', requiere: 'Códigos de respaldo custodiados fuera del repositorio' },
  { paso: 2, accion: 'Si no hay códigos: restablecer el segundo factor desde Firebase Console con una cuenta de Google con rol Owner del proyecto.', requiere: 'Acceso a la consola con Owner + verificación en dos pasos del propio Google' },
  { paso: 3, accion: 'Registrar el incidente en audit_logs y revisar los accesos del periodo.', requiere: 'Lectura de audit_logs (solo master)' },
  { paso: 4, accion: 'Restablecer la contraseña con el enlace de recuperación y volver a enrolar el factor.', requiere: 'Buzón del master accesible' },
]);

/**
 * Comprueba que una escritura administrativa lleva su evento de auditoría.
 * Réplica en cliente del invariante `auditoriaVinculada` de las reglas, para
 * avisar ANTES de intentar la escritura (la regla sigue siendo la autoridad).
 */
export function escrituraAdministrativaAuditada(
  datos: Record<string, unknown> | null | undefined,
  ruta: string,
  evento: { id: string; usuarioEmail: string; rutas: string[]; resultado: string } | null | undefined,
): { ok: boolean; motivo?: string } {
  if (!datos) return { ok: false, motivo: 'Sin documento a escribir.' };
  const auditId = datos.roadmap01AuditId;
  if (typeof auditId !== 'string' || !auditId) {
    return { ok: false, motivo: 'La escritura administrativa exige roadmap01AuditId (evento nuevo de audit_logs en el mismo commit).' };
  }
  if (!evento) return { ok: false, motivo: `No se ha proporcionado el evento de auditoría ${auditId}.` };
  if (evento.id !== auditId) return { ok: false, motivo: 'El evento de auditoría no coincide con roadmap01AuditId.' };
  if (evento.resultado !== 'EXITO') return { ok: false, motivo: 'El evento de auditoría debe registrarse con resultado EXITO.' };
  if (!Array.isArray(evento.rutas) || !evento.rutas.includes(ruta)) {
    return { ok: false, motivo: `El evento de auditoría no declara la ruta «${ruta}».` };
  }
  return { ok: true };
}
