/**
 * CAPA TRANSVERSAL §6 — FASE 1 · Tipos del motor de contexto, ayuda y tutoriales.
 *
 * Principios (MAPA MAESTRO §6.3/§6.4):
 *  - La capa NUNCA concede permisos: solo lee los que ya tiene el usuario (RBAC canónico).
 *  - Es agnóstica del bloque: todo campo del contexto es opcional salvo módulo/sección.
 *  - Sin persistencia ni auditoría propias (fase posterior si procede, reutilizando lo canónico).
 */
import type { SectionType, TipoPerfilUsuario } from '../types';

/** Módulo/bloque funcional al que pertenece una pantalla. */
export type ModuloERP =
  | 'inicio'
  | 'inmuebles'
  | 'propietarios'
  | 'captacion'
  | 'contratos'
  | 'cobros'
  | 'tesoreria' // BLOQUE B
  | 'morosidad' // BLOQUE C
  | 'actas' // BLOQUE D
  | 'inquilinos' // BLOQUE E
  | 'suministros' // BLOQUE E
  | 'incidencias'
  | 'finanzas'
  | 'seguros'
  | 'administracion'
  | 'ayuda'
  | 'desconocido';

/** Aplicación anfitriona: ERP (secciones `SectionType`) o portal del inquilino (pantallas del portal). */
export type HostExperiencia = 'ERP' | 'PORTAL_INQUILINO';

/** Entrada mínima que cualquier pantalla puede aportar para resolver el contexto. */
export interface ExperienceContextInput {
  /** Anfitrión actual (ERP por defecto). */
  host?: HostExperiencia;
  module?: ModuloERP;
  section?: SectionType | string;
  route?: string;
  role?: TipoPerfilUsuario | string;
  roles?: string[];
  permissions?: string[];
  entityType?: string;
  entityId?: string;
  state?: string;
  /** Secciones a las que el host sabe que el usuario puede navegar (opcional). */
  accessibleSections?: string[];
}

/** Contexto resuelto. `module` y `section` siempre existen (con 'desconocido'/'' si no se pudo resolver). */
export interface ExperienceContext {
  host: HostExperiencia;
  module: ModuloERP;
  section: string;
  route: string;
  role?: TipoPerfilUsuario | string;
  roles: string[];
  permissions: string[];
  entityType?: string;
  entityId?: string;
  state?: string;
  accessibleSections?: string[];
  /** Campos que no pudieron determinarse (para que la UI/IA no asuman). */
  missing: Array<'role' | 'permissions' | 'section' | 'entity' | 'state'>;
}

export interface HelpEntry {
  id: string;
  /** Anfitrión al que pertenece la pantalla ('ERP' por defecto). */
  host?: HostExperiencia;
  module: ModuloERP;
  section: SectionType | string;
  title: string;
  summary: string;
  /** Texto plano; párrafos separados por líneas en blanco. */
  content: string;
  /** Perfiles a los que aplica. Vacío/undefined = todos. */
  roles?: TipoPerfilUsuario[];
  /** Permisos REQUERIDOS (todos) para mostrar la entrada. Vacío/undefined = ninguno. */
  permissions?: string[];
  keywords?: string[];
  relatedTutorials?: string[];
}

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  /** Sección del ERP a la que lleva el paso (si aplica). */
  route?: SectionType | string;
  /** Selector CSS opcional del elemento destacado en la pantalla. */
  target?: string;
  /** Permiso necesario para EJECUTAR la acción del paso (no para leer la explicación). */
  requiredPermission?: string;
}

export interface Tutorial {
  id: string;
  title: string;
  description: string;
  module?: ModuloERP;
  /** Anfitrión cuyas rutas usa el recorrido. Por defecto 'ERP'. */
  host?: HostExperiencia;
  roles?: TipoPerfilUsuario[];
  /** Duración orientativa en minutos. */
  minutes?: number;
  steps: TutorialStep[];
}

export type EstadoSesionTutorial = 'EN_CURSO' | 'COMPLETADO' | 'CANCELADO';

/** Estado inmutable de una sesión de tutorial (sin persistencia en esta fase). */
export interface SesionTutorial {
  tutorialId: string;
  indice: number;
  estado: EstadoSesionTutorial;
  iniciadoEn: string;
  finalizadoEn?: string;
  /** Ids de pasos que el usuario decidió saltar (F2). */
  saltados?: string[];
}

export type MotivoBloqueoPaso = 'PERMISO_INSUFICIENTE' | 'RUTA_INEXISTENTE' | 'RUTA_INACCESIBLE' | 'TARGET_NO_VISIBLE';

/** Evaluación de un paso frente al contexto real del usuario. */
export interface EvaluacionPaso {
  paso: TutorialStep;
  indice: number;
  total: number;
  /** El usuario puede ejecutar la acción del paso con sus permisos actuales. */
  puedeEjecutar: boolean;
  /** Puede navegar a la ruta del paso (si el host informó de secciones accesibles). */
  puedeNavegar: boolean;
  motivos: MotivoBloqueoPaso[];
  /** Explicación breve para el usuario cuando hay bloqueo. */
  explicacion?: string;
}

// ---------------------------------------------------------------------------
// Contrato de la IA asistente (§6.2) — F1: tipos base · F4: resolución IA real.
// ---------------------------------------------------------------------------

/**
 * Clase de capacidad (F4). Determina si la IA puede resolverla directamente o si exige
 * confirmación explícita del usuario:
 * - CONSULTA / NAVEGACION / AYUDA → sin efectos: se resuelven directamente.
 * - ESCRITURA → modifica datos: siempre `REQUIERE_CONFIRMACION`; y en F4 la IA NUNCA ejecuta la
 *   operación: tras confirmar, solo abre la pantalla real del ERP donde el usuario la realiza con
 *   las validaciones del propio módulo.
 */
export type TipoCapacidad = 'CONSULTA' | 'NAVEGACION' | 'AYUDA' | 'ESCRITURA';

/** Esquema mínimo de un parámetro estructurado que la IA puede proponer para una capacidad. */
export interface EsquemaParametro {
  tipo: 'string' | 'number' | 'boolean';
  requerido?: boolean;
  /** Valores admitidos (enumeración cerrada) si procede. */
  valores?: readonly string[];
  /** Validación semántica adicional resuelta por el validador determinista (F4). */
  semantica?: 'RUTA_HOST' | 'HELP_ENTRY_VISIBLE' | 'TUTORIAL_DISPONIBLE';
}

/** Capacidad segura del ERP que la capa puede ofrecer/explicar. Deriva de permisos reales. */
export interface CapacidadERP {
  id: string;
  descripcion: string;
  module: ModuloERP;
  route?: SectionType | string;
  requiredPermission?: string;
  /** Anfitrión en el que existe (sin valor = disponible en ambos). */
  host?: HostExperiencia;
  /** Roles que pueden usarla (además del permiso). Sin valor = cualquier rol con el permiso. */
  roles?: TipoPerfilUsuario[];
  /** Clase (F4). Por compatibilidad, ausente = 'CONSULTA'. */
  tipo?: TipoCapacidad;
  /** Operación sensible: siempre exige confirmación aunque no sea escritura. */
  sensible?: boolean;
  /** Parámetros estructurados admitidos (cerrado: cualquier otro se rechaza). */
  parametros?: Record<string, EsquemaParametro>;
  /** Palabras clave para el resolutor local determinista. */
  keywords?: string[];
}

export type EstadoResolucionIA = 'RESUELTA' | 'REQUIERE_CONFIRMACION' | 'AMBIGUA' | 'SIN_CAPACIDAD' | 'SIN_PERMISO' | 'NO_SOPORTADA' | 'ERROR';

export type IntencionIA = 'NAVEGAR' | 'EXPLICAR' | 'TUTORIAL' | 'CONSULTAR' | 'EJECUTAR' | 'NINGUNA';

export type ValorParametroIA = string | number | boolean;

/** Petición completa que recibe el intérprete IA (nunca incluye códigos de permiso). */
export interface AIIntentRequest {
  input: string;
  context: ExperienceContext;
  host: HostExperiencia;
  module?: ModuloERP;
  section?: SectionType | string;
  role?: string;
  /** Capacidades YA filtradas por RBAC/host/rol. La IA solo puede elegir entre estas. */
  capabilities: CapacidadERP[];
  /** Contenidos de ayuda visibles (id + título) para que la IA pueda proponer EXPLICAR. */
  helpEntries: Array<{ id: string; title: string }>;
  /** Tutoriales disponibles (id + título) para que la IA pueda proponer TUTORIAL. */
  tutorials: Array<{ id: string; title: string }>;
  /** Rutas del host a las que el usuario puede navegar. */
  routes: string[];
}

/**
 * Propuesta CRUDA de un proveedor (IA o local). NO es de confianza: siempre pasa por
 * `validarResolucionIA` antes de mostrarse o ejecutarse.
 */
export interface PropuestaIA {
  intencion?: IntencionIA | string;
  capabilityId?: string;
  helpEntryId?: string;
  tutorialId?: string;
  parametros?: Record<string, unknown>;
  confianza?: number;
  explicacion?: string;
  /** Ids de capacidades alternativas cuando la petición es ambigua. */
  alternativas?: string[];
}

export interface AIIntentResolution {
  estado: EstadoResolucionIA;
  intencion: IntencionIA;
  /** Solo puede ser un id presente en `capacidadesDisponibles(ctx)`. */
  capabilityId?: string;
  helpEntryId?: string;
  tutorialId?: string;
  route?: SectionType | string;
  parametros: Record<string, ValorParametroIA>;
  confianza: number;
  explicacion: string;
  requiereConfirmacion: boolean;
  /** `true` solo tras `confirmarResolucion()` (confirmación explícita del usuario). */
  confirmada?: boolean;
  /** Capacidades entre las que elegir cuando `estado === 'AMBIGUA'` (todas permitidas). */
  alternativas?: Array<{ capabilityId: string; descripcion: string }>;
  errores: string[];
  /** Quién produjo la propuesta validada. */
  origen: 'IA' | 'LOCAL' | 'VALIDADOR';
  proveedor?: string;
  /** Avisos no bloqueantes (p. ej. «proveedor IA no disponible; resolutor local»). */
  avisos?: string[];
}

/** Proveedor de interpretación (Gemini vía servidor, local determinista, mock de tests). */
export interface ProveedorIA {
  nombre: string;
  interpretar(request: AIIntentRequest): Promise<PropuestaIA>;
}

export interface IntentRequest {
  input: string;
  context: ExperienceContext;
  /** Capacidades ya filtradas por RBAC que el resolutor puede proponer. Nunca otras. */
  capabilities: CapacidadERP[];
}

export type IntentKind = 'NAVEGAR' | 'EXPLICAR' | 'TUTORIAL' | 'DIAGNOSTICO' | 'NO_RESUELTO' | 'NO_AUTORIZADO';

export interface IntentResolution {
  kind: IntentKind;
  /** Solo puede referenciar ids presentes en `IntentRequest.capabilities`. */
  capabilityId?: string;
  helpEntryId?: string;
  tutorialId?: string;
  route?: SectionType | string;
  message: string;
  /** Confianza 0..1 (orientativa; un resolutor local determinista usa 1 o 0). */
  confidence: number;
}

/** Firma que deberá implementar el futuro resolutor (Gemini u otro). Sin implementación IA en Fase 1. */
export type ResolveUserIntent = (request: IntentRequest) => Promise<IntentResolution>;
