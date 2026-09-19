import { SectionType, UsuarioApp } from '../types';

// =========================================================================
// AUTORIZACIÓN CENTRALIZADA — DENY BY DEFAULT (única fuente de verdad de la UI)
// -------------------------------------------------------------------------
// Decisión, en este orden estricto:
//   1. Debe existir usuario autenticado (Firebase Auth). Si falta -> DENEGAR.
//   2. Estado ACTIVO. PENDIENTE/BLOQUEADO/INACTIVO -> DENEGAR.
//   3. tipoPerfil reconocido. Si falta -> DENEGAR
//      (NUNCA se asume ADMINISTRADOR por defecto).
//   4. Cada sección depende del perfil autorizado.
// Este módulo NO importa Firebase: es lógica pura y verificable. La autoridad
// final sobre los datos son las Security Rules de Firestore/Storage.
// No crear comprobaciones de navegación paralelas: todo pasa por aquí.
// =========================================================================

export const PERFILES_VALIDOS = ['ADMINISTRADOR', 'PROPIETARIO', 'PROFESIONAL'] as const;
export type PerfilValido = (typeof PERFILES_VALIDOS)[number];

/** Estados de cuenta que NO conceden acceso (todo lo que no sea ACTIVO). */
export const ESTADOS_SIN_ACCESO = ['PENDIENTE', 'BLOQUEADO', 'INACTIVO'] as const;

/** Secciones de la aplicación autorizadas por perfil. */
export const SECCIONES_POR_PERFIL: Record<PerfilValido, SectionType[]> = {
  ADMINISTRADOR: [
    'inicio',
    'administracion',
    'inmuebles',
    'propietarios',
    'cobros',
    'gastos',
    'recomercializacion',
    'incidencias',
    'profesionales',
    'solicitudes',
    'preseleccionados',
    'seguro_impago',
    'formalizacion',
    'candidatos',
    'nuevo_candidato',
    'cuestionario',
    'analisis',
    'configuracion',
  ],
  PROPIETARIO: [
    'propietarios',
    'inmuebles',
    'formalizacion',
    'cobros',
    'gastos',
    'recomercializacion',
    'incidencias',
    'profesionales',
    'configuracion',
  ],
  PROFESIONAL: ['administracion', 'inmuebles', 'incidencias', 'profesionales', 'configuracion'],
};

/** Sólo ACTIVO concede acceso. Sin dato de estado -> DENEGADO. */
export function estadoConAcceso(estado?: string | null): boolean {
  return estado === 'ACTIVO';
}

/**
 * Perfil autorizado o null (DENEGADO). Nunca hay perfil por defecto: si falta
 * el usuario, el estado válido o el tipoPerfil -> null.
 */
export function perfilAutorizado(usuario?: UsuarioApp | null): PerfilValido | null {
  if (!usuario) return null;
  if (!estadoConAcceso(usuario.estado)) return null;
  const perfil = usuario.tipoPerfil;
  if (perfil === 'ADMINISTRADOR' || perfil === 'PROPIETARIO' || perfil === 'PROFESIONAL') {
    return perfil;
  }
  return null;
}

/** Secciones permitidas. Sin autorización -> lista vacía (deny by default). */
export function seccionesPermitidas(usuario?: UsuarioApp | null): SectionType[] {
  const perfil = perfilAutorizado(usuario);
  if (!perfil) return [];
  return SECCIONES_POR_PERFIL[perfil];
}

/** ¿Puede acceder a esta sección? Deny-by-default. */
export function puedeAccederSeccion(
  usuario: UsuarioApp | null | undefined,
  seccion: SectionType
): boolean {
  const perfil = perfilAutorizado(usuario);
  if (!perfil) return false;
  return SECCIONES_POR_PERFIL[perfil].includes(seccion);
}

/** Sección inicial del panel según perfil autorizado. */
export function seccionInicialPorPerfil(usuario?: UsuarioApp | null): SectionType {
  const perfil = perfilAutorizado(usuario);
  if (perfil === 'ADMINISTRADOR') return 'administracion';
  if (perfil === 'PROPIETARIO') return 'propietarios';
  if (perfil === 'PROFESIONAL') return 'administracion';
  return 'inicio';
}

/** ¿Administrador autorizado? Sin usuario/estado/perfil -> false. */
export function esAdministradorAutorizado(usuario?: UsuarioApp | null): boolean {
  return perfilAutorizado(usuario) === 'ADMINISTRADOR';
}

/** ¿Propietario autorizado? */
export function esPropietarioAutorizado(usuario?: UsuarioApp | null): boolean {
  return perfilAutorizado(usuario) === 'PROPIETARIO';
}

/** ¿Profesional autorizado? */
export function esProfesionalAutorizado(usuario?: UsuarioApp | null): boolean {
  return perfilAutorizado(usuario) === 'PROFESIONAL';
}

/**
 * Ámbito de datos resuelto a partir del usuario autorizado (deny by default).
 * - Sin autorización -> objeto con listas vacías (ninguna consulta global).
 * - ADMINISTRADOR -> alcance global explícito.
 * - PROPIETARIO / PROFESIONAL -> sólo sus recursos.
 */
export interface AlcanceDatosResuelto {
  global: boolean;
  propietarioId?: string;
  profesionalId?: string;
  usuarioId?: string;
  inmuebleIds: string[];
}

export function alcanceDatos(usuario?: UsuarioApp | null): AlcanceDatosResuelto {
  const perfil = perfilAutorizado(usuario);
  if (!perfil) {
    return { global: false, inmuebleIds: [] };
  }
  if (perfil === 'ADMINISTRADOR') {
    return { global: true, usuarioId: usuario?.id, inmuebleIds: [] };
  }
  return {
    global: false,
    propietarioId: usuario?.propietarioId,
    profesionalId: usuario?.profesionalId,
    usuarioId: usuario?.id,
    inmuebleIds: usuario?.inmuebleIds || [],
  };
}
