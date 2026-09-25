/**
 * CAPA TRANSVERSAL §6 — FASE 1 · Modelo de tutoriales y motor de sesión (puro, sin persistencia).
 *
 * La sesión es un valor inmutable: `iniciar` → `avanzar`/`retroceder` → `finalizar`/`cancelar`.
 * Cada paso se evalúa contra el contexto REAL (permisos/rutas); el tutorial explica, nunca habilita.
 */
import type { ExperienceContext, EvaluacionPaso, HostExperiencia, MotivoBloqueoPaso, SesionTutorial, Tutorial, TutorialStep } from './tipos';
import { contextoCumpleRoles, contextoTienePermiso, MODULO_POR_SECCION, PANTALLAS_PORTAL } from './contexto';
import { selectorTour } from './targets';

/** Secciones válidas del ERP (fuente: `SectionType` vía el mapa de módulos). */
const SECCIONES_ERP = new Set<string>(Object.keys(MODULO_POR_SECCION));
/** Pantallas válidas del portal del inquilino (BLOQUE E). */
const PANTALLAS_PORTAL_SET = new Set<string>(PANTALLAS_PORTAL);

function rutasDeHost(host: HostExperiencia): Set<string> {
  return host === 'PORTAL_INQUILINO' ? PANTALLAS_PORTAL_SET : SECCIONES_ERP;
}

// ---------------------------------------------------------------------------
// Tutorial real nº 1 — BLOQUE B: generar, aprobar y pagar una liquidación
// ---------------------------------------------------------------------------
export const TUTORIAL_LIQUIDACION: Tutorial = {
  id: 'tutorial.tesoreria.liquidacion',
  title: 'Liquidar a un propietario paso a paso',
  description:
    'Recorre el ciclo real de una liquidación mensual en Tesorería: generar el borrador, revisar sus líneas, aprobarla y registrar el pago con evidencia.',
  module: 'tesoreria',
  host: 'ERP',
  roles: ['ADMINISTRADOR'],
  minutes: 4,
  steps: [
    {
      id: 'abrir-tesoreria',
      title: 'Abre Tesorería & SEPA',
      description: 'En el menú principal entra en «Tesorería & SEPA». La pestaña «Liquidaciones» muestra las existentes con su estado y el filtro por propietario.',
      route: 'tesoreria',
      target: selectorTour('nav-tesoreria'),
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

// ---------------------------------------------------------------------------
// Recorrido real nº 2 — PORTAL DEL INQUILINO (BLOQUE E): primeros pasos
// ---------------------------------------------------------------------------
export const RECORRIDO_PORTAL_INQUILINO: Tutorial = {
  id: 'recorrido.portal.primeros-pasos',
  title: 'Conoce tu portal',
  description: 'Un recorrido por las pantallas de tu portal: dónde ver tu contrato y recibos, cómo avisar de una avería, dar una lectura y escribir a gestión.',
  module: 'inquilinos',
  host: 'PORTAL_INQUILINO',
  roles: ['INQUILINO'],
  minutes: 3,
  steps: [
    {
      id: 'inicio',
      title: 'Tu hogar de un vistazo',
      description: 'En «Inicio» ves tu vivienda, la renta mensual, el estado del recibo de este mes y accesos rápidos a las acciones más habituales.',
      route: 'inicio',
      target: selectorTour('portal-tab-inicio'),
    },
    {
      id: 'recibos',
      title: 'Recibos y pagos',
      description: 'En «Recibos» encuentras cada mes con su estado: Pendiente, Pagado o En revisión. Si hay justificantes publicados por gestión, puedes abrirlos desde aquí.',
      route: 'recibos',
      target: selectorTour('portal-tab-recibos'),
    },
    {
      id: 'averias',
      title: 'Avisar de una avería',
      description: 'En «Averías» pulsa el botón «+» para notificar una incidencia: título, descripción y fotos opcionales. Quedará ABIERTA y gestión la asignará a un profesional.',
      route: 'incidencias',
      target: selectorTour('portal-nueva-averia'),
    },
    {
      id: 'lecturas',
      title: 'Dar una lectura de contador',
      description: 'En «Luz/Agua» abre un suministro y pulsa «Dar lectura». La lectura debe ser igual o superior a la anterior; una vez guardada no se puede editar, solo corregir con otra lectura.',
      route: 'suministros',
      target: selectorTour('portal-tab-suministros'),
    },
    {
      id: 'mensajes',
      title: 'Hablar con gestión',
      description: 'En «Más» → «Mensajes» tienes un hilo directo con gestión para este contrato. Los mensajes no leídos aparecen marcados en «Más».',
      route: 'mas',
      target: selectorTour('portal-mas-mensajes'),
    },
  ],
};

// ---------------------------------------------------------------------------
// Recorrido real nº 3 — ERP · BLOQUE E: invitar a un inquilino al portal
// ---------------------------------------------------------------------------
export const RECORRIDO_INVITAR_INQUILINO: Tutorial = {
  id: 'recorrido.inquilinos.invitar',
  title: 'Dar acceso a un inquilino a su portal',
  description: 'Genera una invitación vinculada a un contrato, compártela y revisa después el acceso creado y el hilo de mensajes.',
  module: 'inquilinos',
  host: 'ERP',
  roles: ['ADMINISTRADOR'],
  minutes: 3,
  steps: [
    {
      id: 'abrir-portal-inquilinos',
      title: 'Abre «Portal Inquilinos»',
      description: 'En el menú principal entra en «Portal Inquilinos». Verás cuatro pestañas: Accesos, Invitaciones, Mensajes y Vinculación.',
      route: 'inquilinos',
      target: selectorTour('nav-inquilinos'),
      requiredPermission: 'inquilinos.ver',
    },
    {
      id: 'nueva-invitacion',
      title: 'Crea la invitación',
      description: 'En la pestaña «Invitaciones» elige el contrato, la caducidad y los usos máximos y pulsa «Crear invitación». La invitación queda ligada solo a ese contrato.',
      route: 'inquilinos',
      target: selectorTour('inquilinos-tab-invitaciones'),
      requiredPermission: 'inquilinos.gestionar',
    },
    {
      id: 'compartir-enlace',
      title: 'Comparte el enlace',
      description: 'Copia el enlace generado y envíaselo al inquilino por el canal que uses. Al registrarse, su cuenta nace vinculada al contrato; no hay alta manual.',
      route: 'inquilinos',
      requiredPermission: 'inquilinos.gestionar',
    },
    {
      id: 'revisar-acceso',
      title: 'Revisa el acceso',
      description: 'En «Accesos» aparece el inquilino con sus contratos vinculados. Desde aquí puedes desvincular un contrato si deja de corresponder.',
      route: 'inquilinos',
      target: selectorTour('inquilinos-tab-accesos'),
      requiredPermission: 'inquilinos.ver',
    },
    {
      id: 'mensajes',
      title: 'Atiende sus mensajes',
      description: 'En «Mensajes» respondes al hilo por contrato. Los mensajes que el inquilino no ha leído se marcan hasta que los abre en su portal.',
      route: 'inquilinos',
      target: selectorTour('inquilinos-tab-mensajes'),
      requiredPermission: 'inquilinos.ver',
    },
  ],
};

// ---------------------------------------------------------------------------
// UX-1A · Recorridos de entrada. Explican controles reales; no conceden permisos.
// ---------------------------------------------------------------------------
export const RECORRIDO_ADMIN_CENTRO: Tutorial = {
  id: 'recorrido.admin.centro-control',
  title: 'Conoce el Centro de Control',
  description: 'Dónde estás, qué supervisa el panel, cómo llegar a las áreas de gestión, y dónde están el Centro de Ayuda y el asistente.',
  module: 'administracion',
  host: 'ERP',
  roles: ['ADMINISTRADOR'],
  minutes: 3,
  steps: [
    {
      id: 'donde',
      title: 'Estás en el Centro de Control',
      description:
        'El menú principal abre «Centro de Control». La marca interior identifica esta pantalla de supervisión. No es el listado operativo de viviendas: eso está en «Inmuebles».',
      route: 'administracion',
      target: selectorTour('admin-centro-marca'),
    },
    {
      id: 'que-hay',
      title: 'Qué puedes supervisar',
      description:
        'El panel inicial muestra usuarios, inmuebles en la plataforma, tasa de ocupación y eventos de auditoría, más la actividad reciente. El menú interior abre usuarios, el directorio de inmuebles, propietarios, profesionales, módulos y el registro de auditoría.',
      route: 'administracion',
      target: selectorTour('admin-kpis'),
    },
    {
      id: 'areas',
      title: 'Accede a las áreas de gestión',
      description:
        'El menú de la izquierda es el de gestión: «Inmuebles», «Tesorería & SEPA», «Gestión de Cobros», «Formalización & LAU» y el resto. «Inmuebles» abre el listado y el alta. Este menú solo navega a pantallas que tu perfil ya puede abrir.',
      route: 'administracion',
      target: selectorTour('nav-inmuebles'),
    },
    {
      id: 'ayuda',
      title: 'Centro de Ayuda',
      description:
        '«Ayuda» en el menú abre el Centro de Ayuda: explicaciones de cada pantalla y los tutoriales de tu perfil. El icono ? junto al título explica la pantalla en la que estás.',
      route: 'administracion',
      target: selectorTour('nav-ayuda'),
    },
    {
      id: 'asistente',
      title: 'Cómo usar el asistente',
      description:
        'El botón del asistente, junto al título, acepta una pregunta en lenguaje natural. Puede explicar una ayuda visible, llevarte a una pantalla a la que ya tienes acceso o iniciar un tutorial disponible. No concede permisos ni ejecuta altas o pagos.',
      route: 'administracion',
      target: selectorTour('asistente-erp'),
    },
  ],
};

export const RECORRIDO_PROPIETARIO_PORTAL: Tutorial = {
  id: 'recorrido.propietario.portal',
  title: 'Conoce tu portal',
  description: 'Recorre tu portal: viviendas, cobros y liquidaciones, contratos y actas, Mi Perfil, y dónde están la ayuda y el asistente.',
  module: 'propietarios',
  host: 'ERP',
  roles: ['PROPIETARIO'],
  minutes: 4,
  steps: [
    {
      id: 'inicio',
      title: 'Tu pantalla principal',
      description: 'Al entrar estás en el Portal del Propietario. La cabecera muestra tu nombre y las viviendas en cartera. Las pestañas de abajo son el recorrido de tu cuenta.',
      route: 'propietarios',
      target: selectorTour('propietario-portal-cabecera'),
    },
    {
      id: 'viviendas',
      title: 'Tus inmuebles',
      description:
        '«Mis Viviendas» lista solo tus inmuebles. Si no hay ninguno, «Nuevo inmueble» crea el primero vinculado a tu cuenta. El menú «Mis Viviendas» abre el listado completo, con el mismo alta y el selector de titular editable.',
      route: 'propietarios',
      target: selectorTour('propietario-tab-viviendas'),
    },
    {
      id: 'liquidaciones',
      title: 'Cobros y liquidaciones',
      description:
        '«Mis Liquidaciones» muestra lo que la gestión ha generado: periodo, líneas y neto. No puedes generarlas ni aprobarlas. La pestaña «Cobros» y el menú «Mis Cobros» consultan los recibos de tus contratos.',
      route: 'propietarios',
      target: selectorTour('propietario-tab-liquidaciones'),
    },
    {
      id: 'contratos',
      title: 'Contratos',
      description:
        '«Mis Contratos» lista los contratos de tus viviendas: inquilino, renta, fianza y vigencia. El menú «Mis Contratos» abre Formalización. Desde aquí no se invita a un inquilino: eso lo hace la administración.',
      route: 'propietarios',
      target: selectorTour('propietario-tab-contratos'),
    },
    {
      id: 'actas',
      title: 'Actas de entrada y salida',
      description:
        'En el menú, «Actas Entrada/Salida» abre las actas de tus viviendas: inventario, lecturas y estado de firma. Una acta firmada no se edita; una corrección es una versión nueva.',
      route: 'actas',
      target: selectorTour('nav-actas'),
    },
    {
      id: 'perfil',
      title: 'Mi Perfil',
      description: 'La pestaña «Mi Perfil» guarda nombre, NIF, contacto y domicilio. El menú «Mi Cuenta» abre esta misma pestaña. No abre la configuración del sistema.',
      route: 'propietarios',
      target: selectorTour('propietario-tab-perfil'),
    },
    {
      id: 'ayuda',
      title: 'Centro de Ayuda',
      description: '«Ayuda» en el menú abre el Centro de Ayuda con las explicaciones y tutoriales de tu perfil. El icono ? junto al título explica la pantalla actual.',
      route: 'propietarios',
      target: selectorTour('nav-ayuda'),
    },
    {
      id: 'asistente',
      title: 'Asistente',
      description: 'El botón del asistente, junto al título, responde con la ayuda que ya puedes ver y puede llevarte a una pantalla de tu menú. No amplía tus permisos.',
      route: 'propietarios',
      target: selectorTour('asistente-erp'),
    },
  ],
};

export const RECORRIDO_PROFESIONAL_PORTAL: Tutorial = {
  id: 'recorrido.profesional.portal',
  title: 'Conoce tu portal profesional',
  description: 'Tu pantalla de servicios: órdenes, viviendas asignadas, ficha, Centro de Ayuda y asistente.',
  module: 'administracion',
  host: 'ERP',
  roles: ['PROFESIONAL'],
  minutes: 3,
  steps: [
    {
      id: 'inicio',
      title: 'Tu pantalla principal',
      description: 'Al entrar estás en el Portal de Servicios y Mantenimiento. La cabecera muestra tu nombre comercial y cuántas viviendas tienes asignadas.',
      route: 'administracion',
      target: selectorTour('profesional-portal-cabecera'),
    },
    {
      id: 'funciones',
      title: 'Qué puedes hacer aquí',
      description:
        'Las pestañas son Mi Ficha y Datos, Mis Especialidades, Mis Zonas de Cobertura, Viviendas Asignadas y Órdenes de Trabajo y Partes. Al entrar ves las órdenes. No administras la cartera ni las liquidaciones.',
      route: 'administracion',
      target: selectorTour('profesional-tab-incidencias'),
    },
    {
      id: 'viviendas',
      title: 'Viviendas asignadas',
      description:
        'La pestaña «Viviendas Asignadas» lista las viviendas donde estás autorizado. El menú del mismo nombre abre ese listado. Si está vacío, aún no te han designado. No das de alta la cartera ni cambias al titular.',
      route: 'administracion',
      target: selectorTour('profesional-tab-asignaciones'),
    },
    {
      id: 'menu-viviendas',
      title: 'El listado del menú',
      description: '«Viviendas Asignadas» en el menú abre el listado de inmuebles vinculados a tu ficha. Es consulta: la asignación la hace quien gestiona la vivienda.',
      route: 'inmuebles',
      target: selectorTour('nav-inmuebles'),
    },
    {
      id: 'ficha',
      title: 'Mi Ficha y Datos',
      description:
        'Esta pestaña guarda el nombre comercial, el contacto y los datos que ven los propietarios al asignarte. El menú «Mi Cuenta» abre esta misma pestaña, no la configuración del sistema.',
      route: 'administracion',
      target: selectorTour('profesional-tab-ficha'),
    },
    {
      id: 'ayuda',
      title: 'Centro de Ayuda',
      description: '«Ayuda» en el menú abre el Centro de Ayuda con las explicaciones y tutoriales de tu perfil.',
      route: 'administracion',
      target: selectorTour('nav-ayuda'),
    },
    {
      id: 'asistente',
      title: 'Asistente',
      description: 'El botón del asistente, junto al título, responde con la ayuda visible para tu perfil y puede llevarte a una pantalla de tu menú. No añade capacidades.',
      route: 'administracion',
      target: selectorTour('asistente-erp'),
    },
  ],
};

export const TUTORIALES_REGISTRO: Tutorial[] = [
  TUTORIAL_LIQUIDACION,
  RECORRIDO_INVITAR_INQUILINO,
  RECORRIDO_PORTAL_INQUILINO,
  RECORRIDO_ADMIN_CENTRO,
  RECORRIDO_PROPIETARIO_PORTAL,
  RECORRIDO_PROFESIONAL_PORTAL,
];

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
  return (opciones.registro ?? TUTORIALES_REGISTRO).filter((t) => contextoCumpleRoles(ctx, t.roles) && (t.host ?? 'ERP') === ctx.host);
}

export function tutorialesDeModulo(ctx: ExperienceContext, modulo: string, opciones: OpcionesTutoriales = {}): Tutorial[] {
  return tutorialesDisponibles(ctx, opciones).filter((t) => t.module === modulo);
}

/** Evalúa un paso frente al contexto. Nunca modifica permisos; solo informa. */
export function evaluarPaso(paso: TutorialStep, indice: number, total: number, ctx: ExperienceContext, opciones: OpcionesTutoriales = {}): EvaluacionPaso {
  const existentes = opciones.seccionesExistentes instanceof Set ? opciones.seccionesExistentes : new Set(opciones.seccionesExistentes ?? Array.from(rutasDeHost(ctx.host)));
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

/** Salta el paso actual (queda anotado) y avanza; en el último paso, finaliza el tutorial. */
export function saltar(sesion: SesionTutorial, tutorial: Tutorial, ahora: () => string = () => new Date().toISOString()): SesionTutorial {
  if (sesion.estado !== 'EN_CURSO') return sesion;
  const id = pasoActual(sesion, tutorial).id;
  const saltados = Array.from(new Set([...(sesion.saltados ?? []), id]));
  if (esUltimoPaso(sesion, tutorial)) return { ...sesion, saltados, estado: 'COMPLETADO', finalizadoEn: ahora() };
  return { ...sesion, saltados, indice: sesion.indice + 1 };
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
