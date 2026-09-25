/**
 * UX-1B · Decisión de bienvenida sobre el progreso ya existente.
 *
 * No hay colección nueva ni campo nuevo. Las reglas de `progreso_tutoriales`
 * solo admiten el modelo actual, y no se tocan.
 *
 * Lectura del documento que ya existe:
 * - sin documento → no iniciado (puede mostrarse la bienvenida);
 * - `completed: true` → completado (no se muestra; se puede repetir desde el Centro de Ayuda);
 * - reanudable (`sesionDesdeProgreso` devuelve sesión) → a medias (no se arranca solo);
 * - documento no completado y no reanudable (paso 0, sin saltos) → descartado con «Ahora no»
 *   o abandonado en el primer paso. No es `completed`. El Centro de Ayuda ofrece «Comenzar».
 *
 * «Ahora no» no marca `completed`. Guarda una sesión cancelada en el paso 0, que
 * `progresoDesdeSesion` persiste con `completed: false`.
 */
import type { ExperienceContext, SesionTutorial, Tutorial } from './tipos';
import type { TutorialProgress } from './progreso';
import { hostDeTutorial, sesionDesdeProgreso } from './progreso';
import { cancelar, iniciarTutorial, tutorialesDisponibles } from './tutoriales';

/** Recorrido de entrada ya registrado en UX-1A / bloque E. No es un tutorial nuevo. */
const RECORRIDO_ENTRADA: Record<string, string> = {
  ADMINISTRADOR: 'recorrido.admin.centro-control',
  PROPIETARIO: 'recorrido.propietario.portal',
  PROFESIONAL: 'recorrido.profesional.portal',
  INQUILINO: 'recorrido.portal.primeros-pasos',
};

export type EstadoRecorrido = 'NO_INICIADO' | 'EN_CURSO' | 'COMPLETADO' | 'DESCARTADO';
export type ModoBienvenida = 'VER' | 'CONTINUAR';

/** El recorrido de entrada de este perfil, si el filtro actual se lo deja ver. */
export function tutorialDeBienvenida(ctx: ExperienceContext): Tutorial | null {
  const id = ctx.role ? RECORRIDO_ENTRADA[ctx.role] : undefined;
  if (!id) return null;
  return tutorialesDisponibles(ctx).find((t) => t.id === id) ?? null;
}

/**
 * Clasifica el documento de progreso del recorrido de entrada.
 * Un documento de otro tutorial o inválido se trata como ausencia: no se inventa un estado.
 */
export function estadoRecorrido(progreso: TutorialProgress | null | undefined, tutorial: Tutorial): EstadoRecorrido {
  if (!progreso) return 'NO_INICIADO';
  if (progreso.tutorialId !== tutorial.id || progreso.host !== hostDeTutorial(tutorial)) return 'NO_INICIADO';
  if (progreso.completed) return 'COMPLETADO';
  if (sesionDesdeProgreso(progreso, tutorial)) return 'EN_CURSO';
  return 'DESCARTADO';
}

/** Qué tarjeta mostrar. El reproductor abierto o el descarte de esta sesión ocultan la tarjeta. */
export function modoBienvenida(
  estado: EstadoRecorrido,
  opciones: { ocultoEnSesion?: boolean; reproductorAbierto?: boolean } = {}
): ModoBienvenida | null {
  if (opciones.ocultoEnSesion || opciones.reproductorAbierto) return null;
  if (estado === 'NO_INICIADO') return 'VER';
  if (estado === 'EN_CURSO') return 'CONTINUAR';
  return null;
}

/** Sesión que «Ahora no» persiste: cancelada en el paso 0, nunca completada. */
export function sesionDescartada(tutorial: Tutorial, ahora: () => string = () => new Date().toISOString()): SesionTutorial {
  return cancelar(iniciarTutorial(tutorial, ahora), ahora);
}

export function etiquetaTutorial(estado: EstadoRecorrido): 'Comenzar' | 'Continuar recorrido' | 'Volver a realizar' {
  if (estado === 'EN_CURSO') return 'Continuar recorrido';
  if (estado === 'COMPLETADO') return 'Volver a realizar';
  return 'Comenzar';
}

export function textoBienvenida(tutorial: Tutorial, modo: ModoBienvenida): { titulo: string; cuerpo: string; accion: string } {
  if (modo === 'CONTINUAR') {
    return {
      titulo: 'Recorrido a medias',
      cuerpo: 'Puedes seguir el recorrido por donde lo dejaste. No se inicia solo.',
      accion: 'Continuar recorrido',
    };
  }
  const cuerpos: Record<string, { titulo: string; cuerpo: string }> = {
    'recorrido.admin.centro-control': {
      titulo: 'Bienvenido al Centro de Control',
      cuerpo: 'Desde aquí supervisas la plataforma. El menú de la izquierda abre inmuebles, cobros, tesorería y el resto de la gestión.',
    },
    'recorrido.propietario.portal': {
      titulo: 'Bienvenido a tu portal',
      cuerpo: 'Aquí ves tus viviendas, contratos, cobros y tu perfil. El menú «Mi Cuenta» abre la pestaña Mi Perfil, no la configuración del sistema.',
    },
    'recorrido.profesional.portal': {
      titulo: 'Bienvenido a tu portal profesional',
      cuerpo: 'Aquí están tu ficha, las viviendas que te han asignado y las órdenes de trabajo. No administras la cartera.',
    },
    'recorrido.portal.primeros-pasos': {
      titulo: 'Bienvenido a tu portal',
      cuerpo: 'Aquí ves tu vivienda y tus recibos, y puedes avisar de una avería o escribir a gestión.',
    },
  };
  const propio = cuerpos[tutorial.id] ?? {
    titulo: 'Bienvenido',
    cuerpo: 'Este recorrido explica la pantalla en la que estás, con los controles que ya tienes.',
  };
  return { ...propio, accion: 'Ver recorrido' };
}
