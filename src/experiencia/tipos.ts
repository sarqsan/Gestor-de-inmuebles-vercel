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

/** Entrada mínima que cualquier pantalla puede aportar para resolver el contexto. */
export interface ExperienceContextInput {
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
// Contrato para la futura IA asistente (§6.2) — SOLO TIPOS en esta fase.
// ---------------------------------------------------------------------------

/** Capacidad segura del ERP que la capa puede ofrecer/explicar. Deriva de permisos reales. */
export interface CapacidadERP {
  id: string;
  descripcion: string;
  module: ModuloERP;
  route?: SectionType | string;
  requiredPermission?: string;
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
