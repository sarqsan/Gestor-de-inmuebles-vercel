/**
 * CAPA TRANSVERSAL §6 — FASE 1 · Resolver de contexto de experiencia.
 *
 * Única puerta de entrada para saber "dónde está y qué puede el usuario".
 * NO duplica RBAC: los permisos salen de `UsuarioApp.permisos` (asignados por
 * `authService`/`ROLES_PREDEFINIDOS`) y el rol de `UsuarioApp.tipoPerfil`.
 */
import type { SectionType, UsuarioApp } from '../types';
import type { ExperienceContext, ExperienceContextInput, ModuloERP } from './tipos';

/** Sección del ERP → módulo funcional. Fuente única para ayuda, tutoriales e IA. */
export const MODULO_POR_SECCION: Record<SectionType, ModuloERP> = {
  inicio: 'inicio',
  inmuebles: 'inmuebles',
  propietarios: 'propietarios',
  cobros: 'cobros',
  tesoreria: 'tesoreria',
  gastos: 'finanzas',
  conciliacion: 'finanzas',
  morosidad: 'morosidad',
  facturacion: 'finanzas',
  financiacion: 'finanzas',
  fiscal: 'finanzas',
  informes: 'finanzas',
  polizas: 'seguros',
  actas: 'actas',
  inquilinos: 'inquilinos',
  suministros: 'suministros',
  preseleccionados: 'captacion',
  seguro_impago: 'seguros',
  formalizacion: 'contratos',
  recomercializacion: 'captacion',
  incidencias: 'incidencias',
  operaciones: 'incidencias',
  solicitudes: 'captacion',
  candidatos: 'captacion',
  nuevo_candidato: 'captacion',
  cuestionario: 'captacion',
  analisis: 'captacion',
  configuracion: 'administracion',
  administracion: 'administracion',
  mis_profesionales: 'incidencias',
  mis_contratos: 'contratos',
  mis_servicios: 'incidencias',
  mis_zonas: 'incidencias',
  mis_asignaciones: 'incidencias',
  mi_perfil: 'administracion',
  ayuda: 'ayuda',
};

/** Pantallas del portal del inquilino (BLOQUE E) → módulo. */
export const MODULO_POR_VISTA_PORTAL: Record<string, ModuloERP> = {
  inicio: 'inicio',
  contrato: 'contratos',
  recibos: 'cobros',
  incidencias: 'incidencias',
  mensajes: 'inquilinos',
  documentos: 'actas',
  suministros: 'suministros',
  historial: 'inquilinos',
  cuenta: 'administracion',
  mas: 'inicio',
};

/** Pantallas reales del portal del inquilino (BLOQUE E, `InquilinoPortalShell`). */
export const PANTALLAS_PORTAL: readonly string[] = ['inicio', 'recibos', 'incidencias', 'suministros', 'mas', 'contrato', 'mensajes', 'documentos', 'historial', 'cuenta'];

export function moduloDeSeccion(section?: string): ModuloERP {
  if (!section) return 'desconocido';
  return (MODULO_POR_SECCION as Record<string, ModuloERP | undefined>)[section] ?? 'desconocido';
}

function limpiar(lista?: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  return Array.from(new Set(lista.filter((x): x is string => typeof x === 'string' && x.length > 0)));
}

/**
 * Resuelve el contexto de experiencia. Tolera entradas incompletas: nunca lanza,
 * y deja constancia en `missing` de lo que no pudo determinar.
 */
export function getExperienceContext(input: ExperienceContextInput = {}): ExperienceContext {
  const section = typeof input.section === 'string' ? input.section : '';
  const module: ModuloERP = input.module ?? moduloDeSeccion(section);
  const permissions = limpiar(input.permissions);
  const roles = limpiar(input.roles);
  const role = typeof input.role === 'string' && input.role ? input.role : undefined;

  const missing: ExperienceContext['missing'] = [];
  if (!section) missing.push('section');
  if (!role) missing.push('role');
  if (input.permissions === undefined) missing.push('permissions');
  if (!input.entityType || !input.entityId) missing.push('entity');
  if (!input.state) missing.push('state');

  return {
    host: input.host ?? 'ERP',
    module,
    section,
    route: input.route ?? (section ? `#${section}` : ''),
    role,
    roles,
    permissions,
    entityType: input.entityType,
    entityId: input.entityId,
    state: input.state,
    accessibleSections: input.accessibleSections ? limpiar(input.accessibleSections) : undefined,
    missing,
  };
}

/** Atajo: contexto a partir del usuario canónico (`UsuarioApp`) y la sección activa. */
export function contextoDesdeUsuario(
  usuario: Pick<UsuarioApp, 'tipoPerfil' | 'roles' | 'permisos'> | null | undefined,
  section?: SectionType | string,
  extra: Omit<ExperienceContextInput, 'role' | 'roles' | 'permissions' | 'section'> = {}
): ExperienceContext {
  return getExperienceContext({
    ...extra,
    // En el portal del inquilino el módulo se deriva de la pantalla del portal, no de `SectionType`.
    module: extra.module ?? (extra.host === 'PORTAL_INQUILINO' && section ? MODULO_POR_VISTA_PORTAL[section] ?? 'desconocido' : undefined),
    section,
    role: usuario?.tipoPerfil,
    roles: usuario?.roles,
    // Si no hay usuario, los permisos son desconocidos (no "ninguno"): se marca en `missing`.
    permissions: usuario ? usuario.permisos ?? [] : undefined,
  });
}

/** Comprobación de permiso sobre el contexto (solo lectura; nunca concede). */
export function contextoTienePermiso(ctx: Pick<ExperienceContext, 'permissions'>, permiso?: string): boolean {
  if (!permiso) return true;
  return ctx.permissions.includes(permiso);
}

/** Comprobación de rol. Sin restricción de roles = aplica a todos. Sin rol conocido = no aplica a contenido restringido. */
export function contextoCumpleRoles(ctx: Pick<ExperienceContext, 'role'>, roles?: string[]): boolean {
  if (!roles || roles.length === 0) return true;
  if (!ctx.role) return false;
  return roles.includes(ctx.role);
}
