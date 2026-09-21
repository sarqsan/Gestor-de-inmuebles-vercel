/**
 * CAPA TRANSVERSAL §6 — FASE 1 · Capacidades seguras y contrato de resolución de intención.
 *
 * SIN IA en esta fase. Se deja:
 *  - `capacidadesDisponibles(ctx)`: catálogo de lo que el usuario YA puede hacer/ver (derivado de RBAC).
 *  - `resolverIntencionLocal`: implementación determinista del contrato `ResolveUserIntent`
 *    (búsqueda en el registro de ayuda). Sirve de referencia y de fallback para el futuro
 *    resolutor con Gemini, que deberá cumplir la misma firma y los mismos límites (§6.3).
 */
import type { CapacidadERP, ExperienceContext, IntentRequest, IntentResolution, ResolveUserIntent } from './tipos';
import { ayudaDisponible, buscarAyuda } from './ayuda';
import { tutorialesDisponibles } from './tutoriales';

/** Catálogo estático de capacidades del ERP con su permiso de ejecución (solo las que existen). */
export const CAPACIDADES_ERP: CapacidadERP[] = [
  { id: 'cap.tesoreria.consultar', descripcion: 'Consultar liquidaciones y movimientos de tesorería', module: 'tesoreria', route: 'tesoreria', requiredPermission: 'tesoreria.ver' },
  { id: 'cap.tesoreria.liquidar', descripcion: 'Generar y aprobar liquidaciones de propietarios', module: 'tesoreria', route: 'tesoreria', requiredPermission: 'tesoreria.liquidar' },
  { id: 'cap.tesoreria.pagar', descripcion: 'Registrar pagos y reversiones de liquidaciones', module: 'tesoreria', route: 'tesoreria', requiredPermission: 'tesoreria.pagar' },
  { id: 'cap.tesoreria.sepa', descripcion: 'Preparar ficheros SEPA pain.008/pain.001', module: 'tesoreria', route: 'tesoreria', requiredPermission: 'tesoreria.sepa' },
  { id: 'cap.inquilinos.consultar', descripcion: 'Consultar accesos de inquilinos al portal', module: 'inquilinos', route: 'inquilinos', requiredPermission: 'inquilinos.ver' },
  { id: 'cap.inquilinos.invitar', descripcion: 'Invitar, vincular y revocar accesos de inquilinos', module: 'inquilinos', route: 'inquilinos', requiredPermission: 'inquilinos.gestionar' },
  { id: 'cap.suministros.consultar', descripcion: 'Consultar suministros, lecturas y repartos', module: 'suministros', route: 'suministros', requiredPermission: 'suministros.ver' },
  { id: 'cap.suministros.gestionar', descripcion: 'Dar de alta suministros, repartos y cambios de titular', module: 'suministros', route: 'suministros', requiredPermission: 'suministros.gestionar' },
  { id: 'cap.contratos.consultar', descripcion: 'Consultar contratos', module: 'contratos', route: 'formalizacion', requiredPermission: 'contratos.ver' },
  { id: 'cap.inmuebles.consultar', descripcion: 'Consultar inmuebles', module: 'inmuebles', route: 'inmuebles', requiredPermission: 'inmuebles.ver' },
  { id: 'cap.ayuda.consultar', descripcion: 'Consultar el Centro de Ayuda', module: 'ayuda', route: 'ayuda' },
];

/** Capacidades que el contexto YA tiene. Nunca añade permisos: filtra. */
export function capacidadesDisponibles(ctx: ExperienceContext, catalogo: CapacidadERP[] = CAPACIDADES_ERP): CapacidadERP[] {
  return catalogo.filter((c) => {
    if (!c.requiredPermission) return true;
    if (ctx.missing.includes('permissions')) return false;
    return ctx.permissions.includes(c.requiredPermission);
  });
}

/** Construye la petición para el resolutor con las capacidades ya filtradas por RBAC. */
export function construirIntentRequest(input: string, ctx: ExperienceContext): IntentRequest {
  return { input, context: ctx, capabilities: capacidadesDisponibles(ctx) };
}

/**
 * Resolutor local determinista (sin IA). Solo devuelve rutas/capacidades presentes en
 * `request.capabilities` y contenidos visibles para el contexto.
 */
export const resolverIntencionLocal: ResolveUserIntent = async (request) => {
  const { input, context, capabilities } = request;
  const texto = input.trim();
  if (!texto) return { kind: 'NO_RESUELTO', message: 'Escribe qué necesitas hacer o encontrar.', confidence: 0 };

  const permitidas = new Set(capabilities.map((c) => c.id));
  const resultados = buscarAyuda(context, texto);
  if (resultados.length > 0) {
    const mejor = resultados[0];
    const tutorial = tutorialesDisponibles(context).find((t) => mejor.relatedTutorials?.includes(t.id));
    const cap = CAPACIDADES_ERP.find((c) => c.module === mejor.module && permitidas.has(c.id));
    return {
      kind: tutorial ? 'TUTORIAL' : 'EXPLICAR',
      helpEntryId: mejor.id,
      tutorialId: tutorial?.id,
      capabilityId: cap?.id,
      route: cap?.route ?? mejor.section,
      message: mejor.summary,
      confidence: 1,
    };
  }

  // Sin coincidencias visibles: si la consulta apunta a un módulo con capacidades no autorizadas, decirlo sin exponer nada.
  const q = texto.toLowerCase();
  const capOculta = CAPACIDADES_ERP.find((c) => !permitidas.has(c.id) && (q.includes(c.module) || c.descripcion.toLowerCase().split(' ').some((w) => w.length > 4 && q.includes(w))));
  if (capOculta) {
    return { kind: 'NO_AUTORIZADO', message: 'Esa función requiere un permiso o perfil del que no dispones. Consulta con administración.', confidence: 1 };
  }
  return {
    kind: 'NO_RESUELTO',
    message: `No hay ayuda registrada para «${texto}». Prueba con otras palabras o revisa el Centro de Ayuda (${ayudaDisponible(context).length} contenidos disponibles).`,
    confidence: 0,
  };
};
