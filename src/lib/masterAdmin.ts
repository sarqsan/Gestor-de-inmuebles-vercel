/**
 * P0.1 — Identidad del administrador principal: ÚNICA fuente de verdad.
 * ===========================================================================
 * Antes de este módulo el correo del master estaba repetido como literal en
 * más de quince ficheros de cliente, en el backend y en `firestore.rules`.
 * Eso hacía imposible cambiarlo sin olvidar un sitio y, sobre todo, permitía
 * que una comprobación de seguridad comparase un valor distinto al de las
 * reglas (la autoridad real).
 *
 * Contrato:
 *  · `MASTER_ADMIN_EMAIL_POR_DEFECTO` es el valor histórico y DEBE coincidir
 *    con el literal de `isMasterAdmin()` en `firestore.rules`. El test
 *    `tests/master-admin-paridad.test.ts` lo verifica. Las reglas no pueden
 *    leer variables de entorno: mientras no exista un custom claim desplegado,
 *    el literal de las reglas sigue siendo la autoridad.
 *  · El SERVIDOR puede sobrescribirlo con `MASTER_ADMIN_EMAIL` (variable de
 *    entorno), para entornos de prueba con otro buzón. El cliente NO puede:
 *    Vite no expone `process.env`, así que usa el valor por defecto.
 *  · `esEmailMaster()` normaliza (trim + minúsculas) y compara. Sustituye a
 *    los `email?.toLowerCase() === 'literal'` dispersos.
 *
 * NO se relaja ninguna regla: este módulo solo elimina la divergencia.
 */

export const MASTER_ADMIN_EMAIL_POR_DEFECTO = 'sarqsan2@gmail.com';

/** Normaliza un correo para compararlo de forma segura. Nunca lanza. */
export function normalizarEmail(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim().toLowerCase() : '';
}

/**
 * Resuelve el correo maestro del SERVIDOR.
 * Se le puede inyectar un entorno (pruebas) para no depender de `process.env`.
 */
export function resolverEmailMaster(
  entorno: Readonly<Record<string, string | undefined>> = {},
): string {
  return normalizarEmail(entorno.MASTER_ADMIN_EMAIL) || MASTER_ADMIN_EMAIL_POR_DEFECTO;
}

/**
 * Alias de compatibilidad para el cliente y para todo el código que ya
 * importaba `ADMIN_MASTER_EMAIL` desde `authService`.
 */
export const ADMIN_MASTER_EMAIL = MASTER_ADMIN_EMAIL_POR_DEFECTO;

/**
 * ¿Es este correo el del administrador principal?
 * `maestro` es inyectable para pruebas con otro buzón.
 */
export function esEmailMaster(email: unknown, maestro: string = ADMIN_MASTER_EMAIL): boolean {
  const candidato = normalizarEmail(email);
  const esperado = normalizarEmail(maestro);
  return candidato.length > 0 && esperado.length > 0 && candidato === esperado;
}
