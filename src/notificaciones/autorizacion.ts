/**
 * GAP 1 — Resolver de autorización para el endpoint backend.
 * ----------------------------------------------------------
 * El servidor actual (server.ts) autentica vía Firebase Client SDK en el
 * frontend y, en backend, comparte estado por sesión. Para NO discrepar con
 * esa arquitectura, este resolver acepta:
 *   - un helper de verificación de token (por ejemplo la verificación de ID
 *     token de Firebase vía REST/OIDC) si estuviera configurado, o
 *   - un contexto resuelto por el servidor en modo de desarrollo.
 *
 * Demonstració IMPORTANTE: el backend nunca confía en `propietarioId` /
 * `inmuebleId` enviados por el cliente para conceder acceso: se derivan del
 * usuario autenticado y de su documento en Firestore (usuarios/{id} /
 * usuarios_auth/{uid}). Aquí se expone el punto de extensión.
 */

import type { ContextoAutorizacion } from '../types/notificaciones';

export interface InfoUsuarioResuelta {
  uid: string;
  perfil: 'ADMINISTRADOR' | 'PROPIETARIO' | 'PROFESIONAL' | null;
  propietarioId?: string;
  profesionalId?: string;
  inmuebleIds?: string[];
}

export interface VerificadorToken {
  /** Devuelve el UID autenticado o null si el token no es válido. */
  verificar(token: string): Promise<string | null>;
}

export interface FuentePerfilUsuario {
  /** Resuelve el perfil/vinculaciones del usuario a partir del UID verificado. */
  resolver(uid: string): Promise<InfoUsuarioResuelta | null>;
}

/**
 * Resuelve el contexto de autorización a partir del header Authorization.
 * Si no hay verificador configurado → contexto anónimo (deny-by-default).
 */
export async function resolverAutorizacion(
  authorizationHeader: string | undefined,
  verificador: VerificadorToken | undefined,
  perfilFuente: FuentePerfilUsuario | undefined
): Promise<ContextoAutorizacion> {
  if (!authorizationHeader || !verificador || !perfilFuente) {
    return { perfil: null };
  }
  const token = authorizationHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { perfil: null };

  let uid: string | null = null;
  try {
    uid = await verificador.verificar(token);
  } catch {
    return { perfil: null };
  }
  if (!uid) return { perfil: null };

  let info: InfoUsuarioResuelta | null = null;
  try {
    info = await perfilFuente.resolver(uid);
  } catch {
    return { perfil: null };
  }
  if (!info || !info.perfil) return { perfil: null };

  return {
    perfil: info.perfil,
    uid,
    propietarioId: info.propietarioId,
    profesionalId: info.profesionalId,
    inmuebleIds: info.inmuebleIds,
  };
}

/** Contexto anónimo (sin permisos). */
export function contextoAnonimo(): ContextoAutorizacion {
  return { perfil: null };
}
