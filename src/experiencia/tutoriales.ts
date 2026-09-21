/**
 * CAPA TRANSVERSAL §6 — FASE 1 · Modelo de tutoriales y motor de sesión (puro, sin persistencia).
 *
 * La sesión es un valor inmutable: `iniciar` → `avanzar`/`retroceder` → `finalizar`/`cancelar`.
 * Cada paso se evalúa contra el contexto REAL (permisos/rutas); el tutorial explica, nunca habilita.
 */
import type { ExperienceContext, EvaluacionPaso, MotivoBloqueoPaso, SesionTutorial, Tutorial, TutorialStep } from './tipos';
import { contextoCumpleRoles, contextoTienePermiso, MODULO_POR_SECCION } from './contexto';

/** Secciones válidas del ERP (fuente: `SectionType` vía el mapa de módulos). */
const SECCIONES_ERP = new Set<string>(Object.keys(MODULO_POR_SECCION));

// ---------------------------------------------------------------------------
// Tutorial real nº 1 — BLOQUE B: generar, aprobar y pagar una liquidación
// ---------------------------------------------------------------------------
export const TUTORIAL_LIQUIDACION: Tutorial = {
  id: 'tutorial.tesoreria.liquidacion',
  title: 'Liquidar a un propietario paso a paso',
  description:
    'Recorre el ciclo real de una liquidación mensual en Tesorería: generar el borrador, revisar sus líneas, aprobarla y registrar el pago con evidencia.',
  module: 'tesoreria',
  roles: ['ADMINISTRADOR'],
  minutes: 4,
  steps: [
    {
      id: 'abrir-tesoreria',
      title: 'Abre Tesorería & SEPA',
      description: 'En el menú principal entra en «Tesorería & SEPA». La pestaña «Liquidaciones» muestra las existentes con su estado y el filtro por propietario.',
      route: 'tesoreria',
      requiredPermission: 'tesoreria.ver',
    },
    {
      id: 'generar-borrador',
      title: 'Genera el borrador del mes',
      description:
        'Pulsa «Nueva liquidación», elige propietario y periodo y confirma con «Generar borrador». El motor reúne solo los cobros efectivamente recibidos y los gastos imputables: los importes previstos no cobrados aparecen como informativos y no liquidan.',
      route: 'tesoreria',
      requiredPermission: 'tesoreria.liquidar',
    },
    {
      id: 'revisar-lineas',
      title: 'Revisa las líneas',
      description:
        'Abre el detalle de la liquidación en BORRADOR y comprueba ingresos cobrados, gastos y neto. Si falta un cobro, regístralo primero en «Gestión de Cobros» y vuelve a generar: la liquidación nunca recalcula por su cuenta.',
      route: 'tesoreria',
      requiredPermission: 'tesoreria.ver',
    },
    {
      id: 'aprobar',
      title: 'Aprueba la liquidación',
      description: 'Con las líneas correctas pulsa «Aprobar». El estado pasa a APROBADA y queda lista para pago; la transición se registra en el histórico.',
      route: 'tesoreria',
      requiredPermission: 'tesoreria.liquidar',
    },
    {
      id: 'pagar',
      title: 'Registra el pago',
      description:
        'Pulsa «Pagar», indica la referencia bancaria y la evidencia del comprobante. El estado pasa a PAGADA. Si hubiera que deshacerlo, «Reversar» exige motivo y deja traza: nada se borra.',
      route: 'tesoreria',
      requiredPermission: 'tesoreria.pagar',
    },
  ],
};

export const TUTORIALES_REGISTRO: Tutorial[] = [TUTORIAL_LIQUIDACION];

export interface OpcionesTutoriales {
  registro?: Tutorial[];
  /** Secciones existentes en la aplicación (por defecto, las del ERP). */
  seccionesExistentes?: Set<string> | string[];
  /** Comprobador opcional de visibilidad de `target` (DOM). Si no se aporta, no se evalúa. */
  targetVisible?: (selector: string) => boolean;
}

export function obtenerTutorial(id: string, opciones: OpcionesTutoriales = {}): Tutorial | undefined {
  return (opciones.registro ?? TUTORIALES_REGISTRO).find((t) => t.id === id);
}

/** Tutoriales visibles para el contexto (por rol). Los pasos se evalúan aparte. */
export function tutorialesDisponibles(ctx: ExperienceContext, opciones: OpcionesTutoriales = {}): Tutorial[] {
  return (opciones.registro ?? TUTORIALES_REGISTRO).filter((t) => contextoCumpleRoles(ctx, t.roles));
}

export function tutorialesDeModulo(ctx: ExperienceContext, modulo: string, opciones: OpcionesTutoriales = {}): Tutorial[] {
  return tutorialesDisponibles(ctx, opciones).filter((t) => t.module === modulo);
}

/** Evalúa un paso frente al contexto. Nunca modifica permisos; solo informa. */
export function evaluarPaso(paso: TutorialStep, indice: number, total: number, ctx: ExperienceContext, opciones: OpcionesTutoriales = {}): EvaluacionPaso {
  const existentes = opciones.seccionesExistentes instanceof Set ? opciones.seccionesExistentes : new Set(opciones.seccionesExistentes ?? Array.from(SECCIONES_ERP));
  const motivos: MotivoBloqueoPaso[] = [];

  const puedeEjecutar = contextoTienePermiso(ctx, paso.requiredPermission) && !(paso.requiredPermission && ctx.missing.includes('permissions'));
  if (!puedeEjecutar) motivos.push('PERMISO_INSUFICIENTE');

  let puedeNavegar = true;
  if (paso.route) {
    if (!existentes.has(paso.route)) {
      puedeNavegar = false;
      motivos.push('RUTA_INEXISTENTE');
    } else if (ctx.accessibleSections && !ctx.accessibleSections.includes(paso.route)) {
      puedeNavegar = false;
      motivos.push('RUTA_INACCESIBLE');
    }
  }
  if (paso.target && opciones.targetVisible && !opciones.targetVisible(paso.target)) {
    motivos.push('TARGET_NO_VISIBLE');
  }

  let explicacion: string | undefined;
  if (motivos.includes('RUTA_INEXISTENTE')) explicacion = 'Este paso apunta a una pantalla que no existe en esta versión de la aplicación.';
  else if (motivos.includes('RUTA_INACCESIBLE')) explicacion = 'Tu perfil no tiene acceso a la pantalla de este paso.';
  else if (motivos.includes('PERMISO_INSUFICIENTE'))
    explicacion = `Puedes leer este paso, pero ejecutar la acción requiere el permiso «${paso.requiredPermission}». Solicítalo a administración si lo necesitas.`;
  else if (motivos.includes('TARGET_NO_VISIBLE')) explicacion = 'El elemento destacado no está visible en pantalla ahora mismo; sigue la descripción del paso.';

  return { paso, indice, total, puedeEjecutar, puedeNavegar, motivos, explicacion };
}

export function evaluarTutorial(tutorial: Tutorial, ctx: ExperienceContext, opciones: OpcionesTutoriales = {}): EvaluacionPaso[] {
  return tutorial.steps.map((p, i) => evaluarPaso(p, i, tutorial.steps.length, ctx, opciones));
}

// ---------------------------------------------------------------------------
// Sesión (valor inmutable)
// ---------------------------------------------------------------------------
export function iniciarTutorial(tutorial: Tutorial, ahora: () => string = () => new Date().toISOString()): SesionTutorial {
  if (tutorial.steps.length === 0) throw new Error(`El tutorial «${tutorial.id}» no tiene pasos.`);
  return { tutorialId: tutorial.id, indice: 0, estado: 'EN_CURSO', iniciadoEn: ahora() };
}

export function pasoActual(sesion: SesionTutorial, tutorial: Tutorial): TutorialStep {
  return tutorial.steps[Math.min(sesion.indice, tutorial.steps.length - 1)];
}

export function esUltimoPaso(sesion: SesionTutorial, tutorial: Tutorial): boolean {
  return sesion.indice >= tutorial.steps.length - 1;
}

export function avanzar(sesion: SesionTutorial, tutorial: Tutorial): SesionTutorial {
  if (sesion.estado !== 'EN_CURSO') return sesion;
  if (esUltimoPaso(sesion, tutorial)) return sesion;
  return { ...sesion, indice: sesion.indice + 1 };
}

export function retroceder(sesion: SesionTutorial): SesionTutorial {
  if (sesion.estado !== 'EN_CURSO' || sesion.indice === 0) return sesion;
  return { ...sesion, indice: sesion.indice - 1 };
}

export function finalizar(sesion: SesionTutorial, tutorial: Tutorial, ahora: () => string = () => new Date().toISOString()): SesionTutorial {
  if (sesion.estado !== 'EN_CURSO') return sesion;
  if (!esUltimoPaso(sesion, tutorial)) throw new Error('Solo se puede finalizar en el último paso.');
  return { ...sesion, estado: 'COMPLETADO', finalizadoEn: ahora() };
}

export function cancelar(sesion: SesionTutorial, ahora: () => string = () => new Date().toISOString()): SesionTutorial {
  if (sesion.estado !== 'EN_CURSO') return sesion;
  return { ...sesion, estado: 'CANCELADO', finalizadoEn: ahora() };
}

/** Reanuda una sesión cancelada en el paso donde se dejó (sin persistencia: el host guarda el valor). */
export function reanudar(sesion: SesionTutorial): SesionTutorial {
  if (sesion.estado !== 'CANCELADO') return sesion;
  return { ...sesion, estado: 'EN_CURSO', finalizadoEn: undefined };
}

/** Progreso 0..1 según el paso actual. */
export function progreso(sesion: SesionTutorial, tutorial: Tutorial): number {
  if (sesion.estado === 'COMPLETADO') return 1;
  if (tutorial.steps.length <= 1) return 0;
  return sesion.indice / (tutorial.steps.length - 1);
}
