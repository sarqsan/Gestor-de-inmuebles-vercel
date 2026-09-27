/** Lectura del contrato B fc14156: espejo usuarios_auth + perfil resuelto.
 * No provisiona usuarios, binding ni carteras. Las Rules son la autoridad.
 */
export const MASTER_EMAIL_CANONICO = 'sarqsan2@gmail.com';
export interface IdentidadCanonica {
  readonly uid: string;
  readonly usuarioId: string;
  readonly usuarioEmail: string;
  readonly usuarioNombre: string;
  readonly master: boolean;
  readonly propietarioId?: string;
  readonly carterasL: readonly string[];
  readonly carterasE: readonly string[];
}
export function proyectarIdentidad(
  uid: string | null, espejo: Record<string, unknown>,
  perfil?: Record<string, unknown>, emailAuth = '',
): IdentidadCanonica | null {
  if (!uid || !perfil || typeof espejo.usuarioId !== 'string' || !espejo.usuarioId || espejo.usuarioId.includes('/')) return null;
  const lista = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length > 0);
  const l = espejo.carterasL ?? [], e = espejo.carterasE ?? [];
  if (!lista(l) || !lista(e) || !e.every((p) => l.includes(p))) throw new Error('Proyección canónica inválida: carterasE debe estar contenida en carterasL.');
  if (espejo.propietarioId !== undefined && typeof espejo.propietarioId !== 'string') throw new Error('propietarioId canónico inválido.');
  const activo = espejo.estado === 'ACTIVO';
  return {
    uid, usuarioId: espejo.usuarioId, usuarioEmail: emailAuth,
    usuarioNombre: typeof perfil.nombre === 'string' ? perfil.nombre : '',
    master: emailAuth === MASTER_EMAIL_CANONICO,
    ...(activo && espejo.tipoPerfil === 'PROPIETARIO' && espejo.propietarioId ? {propietarioId: espejo.propietarioId as string} : {}),
    carterasL: activo ? [...l] : [], carterasE: activo ? [...e] : [],
  };
}
export function permitido(identidad: IdentidadCanonica | null, propietarioId: string, escritura = false): boolean {
  return !!identidad && (identidad.master || identidad.propietarioId === propietarioId || (escritura ? identidad.carterasE : identidad.carterasL).includes(propietarioId));
}
export function exigirAcceso(identidad: IdentidadCanonica | null, propietarioId: string, escritura = false): asserts identidad is IdentidadCanonica {
  if (!permitido(identidad, propietarioId, escritura)) throw new Error(escritura ? 'Sin permiso efectivo de escritura en este propietario.' : 'Sin permiso efectivo de lectura en este propietario.');
}
