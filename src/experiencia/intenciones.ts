/**
 * CAPA TRANSVERSAL §6 — FASE 1/4 · Capacidades seguras y contrato de resolución de intención.
 *
 * F1: `capacidadesDisponibles(ctx)` (catálogo filtrado por RBAC) y `resolverIntencionLocal`
 *     (resolutor determinista, referencia y fallback).
 * F4: el catálogo se enriquece con host/rol/tipo/parámetros (sin añadir capacidades de negocio:
 *     solo consulta, navegación y ayuda sobre funciones que YA existen), y se implementa en
 *     `asistente.ts` el circuito completo con validación determinista.
 *
 * Autoridad: Usuario → rol → permisos → contexto → capacidad permitida → ejecución (por el host).
 */
import type { CapacidadERP, ExperienceContext, IntentRequest, IntentResolution, ResolveUserIntent } from './tipos';
import { ayudaDisponible, buscarAyuda } from './ayuda';
import { tutorialesDisponibles } from './tutoriales';

const NAV = (id: string, descripcion: string, module: CapacidadERP['module'], route: string, requiredPermission: string | undefined, keywords: string[]): CapacidadERP => ({
  id,
  descripcion,
  module,
  route,
  requiredPermission,
  host: 'ERP',
  tipo: 'NAVEGACION',
  keywords,
});

/**
 * Catálogo estático de capacidades (solo las que existen). F4 añade clase, host, rol, parámetros
 * y palabras clave; NO añade operaciones de negocio nuevas. Las capacidades de ESCRITURA se
 * mantienen del F1 y, en F4, solo se resuelven como «abrir la pantalla real tras confirmación».
 */
export const CAPACIDADES_ERP: CapacidadERP[] = [
  // --- Transversales (ambos hosts) -------------------------------------------------------
  {
    id: 'cap.ayuda.consultar',
    descripcion: 'Consultar el Centro de Ayuda',
    module: 'ayuda',
    route: 'ayuda',
    host: 'ERP',
    tipo: 'AYUDA',
    keywords: ['ayuda', 'centro de ayuda', 'documentacion', 'manual'],
  },
  {
    id: 'cap.ayuda.explicar',
    descripcion: 'Explicar una funcionalidad o un estado con la ayuda contextual',
    module: 'ayuda',
    tipo: 'AYUDA',
    parametros: { helpEntryId: { tipo: 'string', requerido: true, semantica: 'HELP_ENTRY_VISIBLE' } },
    keywords: ['que es', 'que significa', 'como funciona', 'explica', 'explicar', 'para que sirve', 'estado'],
  },
  {
    id: 'cap.ayuda.tutorial',
    descripcion: 'Iniciar un tutorial o recorrido guiado disponible',
    module: 'ayuda',
    tipo: 'AYUDA',
    parametros: { tutorialId: { tipo: 'string', requerido: true, semantica: 'TUTORIAL_DISPONIBLE' } },
    keywords: ['tutorial', 'recorrido', 'guia', 'guiame', 'paso a paso', 'como hago', 'como se hace', 'ensename'],
  },
  {
    id: 'cap.navegacion.ir',
    descripcion: 'Ir a una sección o pantalla accesible',
    module: 'inicio',
    tipo: 'NAVEGACION',
    parametros: { route: { tipo: 'string', requerido: true, semantica: 'RUTA_HOST' } },
    keywords: ['ir a', 've a', 'abre', 'abrir', 'llevame', 'muestrame', 'seccion', 'pantalla', 'donde esta', 'donde puedo'],
  },

  // --- ERP: consulta / navegación por módulo (permisos reales) -------------------------------
  { ...NAV('cap.inmuebles.consultar', 'Consultar inmuebles', 'inmuebles', 'inmuebles', 'inmuebles.ver', ['inmueble', 'inmuebles', 'vivienda', 'viviendas', 'piso', 'pisos', 'cartera']), tipo: 'CONSULTA' },
  { ...NAV('cap.propietarios.consultar', 'Consultar propietarios', 'propietarios', 'propietarios', 'propietarios.ver', ['propietario', 'propietarios', 'dueño', 'arrendador']), tipo: 'CONSULTA' },
  { ...NAV('cap.contratos.consultar', 'Consultar contratos', 'contratos', 'formalizacion', 'contratos.ver', ['contrato', 'contratos', 'formalizacion', 'firma']), tipo: 'CONSULTA' },
  { ...NAV('cap.cobros.consultar', 'Consultar cobros de alquiler y su estado', 'cobros', 'cobros', 'contratos.ver', ['cobro', 'cobros', 'recibo', 'recibos', 'renta', 'alquiler', 'impagado', 'pendiente de cobro']), tipo: 'CONSULTA' },
  { ...NAV('cap.tesoreria.consultar', 'Consultar liquidaciones y movimientos de tesorería', 'tesoreria', 'tesoreria', 'tesoreria.ver', ['tesoreria', 'liquidacion', 'liquidaciones', 'movimientos']), tipo: 'CONSULTA' },
  { ...NAV('cap.morosidad.consultar', 'Consultar expedientes de morosidad y recobro', 'morosidad', 'morosidad', 'contratos.ver', ['morosidad', 'moroso', 'deuda', 'recobro', 'expediente', 'reclamacion']), tipo: 'CONSULTA', roles: ['ADMINISTRADOR'] },
  { ...NAV('cap.actas.consultar', 'Consultar actas de entrada/salida y su estado de firma', 'actas', 'actas', 'contratos.ver', ['acta', 'actas', 'entrada', 'salida', 'inventario', 'firma digital']), tipo: 'CONSULTA' },
  { ...NAV('cap.incidencias.consultar', 'Consultar incidencias y averías', 'incidencias', 'incidencias', 'inmuebles.ver', ['incidencia', 'incidencias', 'averia', 'averias', 'reparacion', 'mantenimiento']), tipo: 'CONSULTA' },
  { ...NAV('cap.inquilinos.consultar', 'Consultar accesos de inquilinos al portal', 'inquilinos', 'inquilinos', 'inquilinos.ver', ['inquilino', 'inquilinos', 'portal de inquilinos', 'acceso', 'accesos', 'invitacion', 'invitaciones', 'mensajes']), tipo: 'CONSULTA' },
  { ...NAV('cap.suministros.consultar', 'Consultar suministros, lecturas y repartos', 'suministros', 'suministros', 'suministros.ver', ['suministro', 'suministros', 'luz', 'agua', 'gas', 'lectura', 'lecturas', 'contador', 'reparto']), tipo: 'CONSULTA' },

  // --- ERP: capacidades con efectos (F1). En F4 solo «abrir la pantalla real» tras confirmación.
  { id: 'cap.tesoreria.liquidar', descripcion: 'Generar y aprobar liquidaciones de propietarios', module: 'tesoreria', route: 'tesoreria', requiredPermission: 'tesoreria.liquidar', host: 'ERP', tipo: 'ESCRITURA', keywords: ['liquidar', 'generar liquidacion', 'aprobar liquidacion'] },
  { id: 'cap.tesoreria.pagar', descripcion: 'Registrar pagos y reversiones de liquidaciones', module: 'tesoreria', route: 'tesoreria', requiredPermission: 'tesoreria.pagar', host: 'ERP', tipo: 'ESCRITURA', sensible: true, keywords: ['registrar pago', 'pagar', 'pago', 'reversion', 'transferencia'] },
  { id: 'cap.tesoreria.sepa', descripcion: 'Preparar ficheros SEPA pain.008/pain.001', module: 'tesoreria', route: 'tesoreria', requiredPermission: 'tesoreria.sepa', host: 'ERP', tipo: 'ESCRITURA', sensible: true, keywords: ['sepa', 'pain', 'remesa', 'fichero bancario', 'banco'] },
  { id: 'cap.inquilinos.invitar', descripcion: 'Invitar, vincular y revocar accesos de inquilinos', module: 'inquilinos', route: 'inquilinos', requiredPermission: 'inquilinos.gestionar', host: 'ERP', tipo: 'ESCRITURA', keywords: ['invitar', 'invitar inquilino', 'dar acceso', 'revocar acceso', 'vincular'] },
  { id: 'cap.suministros.gestionar', descripcion: 'Dar de alta suministros, repartos y cambios de titular', module: 'suministros', route: 'suministros', requiredPermission: 'suministros.gestionar', host: 'ERP', tipo: 'ESCRITURA', keywords: ['alta suministro', 'cambio de titular', 'crear reparto'] },

  // --- Portal del inquilino (host PORTAL_INQUILINO, rol INQUILINO). Solo consulta/navegación. ---
  { id: 'cap.portal.inicio', descripcion: 'Ver el resumen de tu vivienda y tu contrato', module: 'inicio', route: 'inicio', host: 'PORTAL_INQUILINO', roles: ['INQUILINO'], tipo: 'NAVEGACION', keywords: ['inicio', 'resumen', 'mi hogar', 'vivienda', 'casa'] },
  { id: 'cap.portal.contrato', descripcion: 'Consultar tu contrato de alquiler', module: 'contratos', route: 'contrato', requiredPermission: 'contratos.ver', host: 'PORTAL_INQUILINO', roles: ['INQUILINO'], tipo: 'CONSULTA', keywords: ['contrato', 'renta', 'fianza', 'duracion', 'vencimiento'] },
  { id: 'cap.portal.recibos', descripcion: 'Consultar tus recibos y pagos', module: 'cobros', route: 'recibos', requiredPermission: 'contratos.ver', host: 'PORTAL_INQUILINO', roles: ['INQUILINO'], tipo: 'CONSULTA', keywords: ['recibo', 'recibos', 'pago', 'pagos', 'pagar', 'cuota', 'mensualidad', 'alquiler', 'deuda', 'pendiente'] },
  { id: 'cap.portal.incidencias', descripcion: 'Ver tus incidencias y avisar de una avería', module: 'incidencias', route: 'incidencias', host: 'PORTAL_INQUILINO', roles: ['INQUILINO'], tipo: 'NAVEGACION', keywords: ['averia', 'averias', 'incidencia', 'incidencias', 'reparacion', 'roto', 'no funciona', 'fuga', 'caldera'] },
  { id: 'cap.portal.suministros', descripcion: 'Ver tus suministros, dar una lectura o pedir el cambio de titular', module: 'suministros', route: 'suministros', host: 'PORTAL_INQUILINO', roles: ['INQUILINO'], tipo: 'NAVEGACION', keywords: ['luz', 'agua', 'gas', 'suministro', 'suministros', 'lectura', 'contador', 'titular', 'cambio de titular'] },
  { id: 'cap.portal.mensajes', descripcion: 'Escribir o leer mensajes con gestión', module: 'inquilinos', route: 'mensajes', host: 'PORTAL_INQUILINO', roles: ['INQUILINO'], tipo: 'NAVEGACION', keywords: ['mensaje', 'mensajes', 'escribir', 'contactar', 'gestion', 'hablar', 'preguntar'] },
  { id: 'cap.portal.documentos', descripcion: 'Consultar tus documentos y actas', module: 'actas', route: 'documentos', host: 'PORTAL_INQUILINO', roles: ['INQUILINO'], tipo: 'CONSULTA', keywords: ['documento', 'documentos', 'acta', 'actas', 'inventario', 'descargar'] },
  { id: 'cap.portal.historial', descripcion: 'Ver el historial de tu contrato', module: 'inquilinos', route: 'historial', host: 'PORTAL_INQUILINO', roles: ['INQUILINO'], tipo: 'CONSULTA', keywords: ['historial', 'cronologia', 'hitos'] },
  { id: 'cap.portal.cuenta', descripcion: 'Ver tu cuenta y cerrar sesión', module: 'administracion', route: 'cuenta', host: 'PORTAL_INQUILINO', roles: ['INQUILINO'], tipo: 'NAVEGACION', keywords: ['cuenta', 'perfil', 'sesion', 'salir', 'cerrar sesion', 'email'] },
];

/** Host efectivo del contexto (ERP por defecto). */
const hostDe = (ctx: ExperienceContext) => ctx.host ?? 'ERP';

/**
 * Capacidades que el contexto YA tiene. Nunca añade permisos: filtra por permiso, host y rol.
 * (F1 filtraba solo por permiso; F4 añade host/rol sin ampliar nada.)
 */
export function capacidadesDisponibles(ctx: ExperienceContext, catalogo: CapacidadERP[] = CAPACIDADES_ERP): CapacidadERP[] {
  const host = hostDe(ctx);
  return catalogo.filter((c) => {
    if (c.host && c.host !== host) return false;
    if (c.roles && c.roles.length > 0) {
      if (ctx.missing.includes('role') || !ctx.role || !c.roles.includes(ctx.role as never)) return false;
    }
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
 * Resolutor local determinista (sin IA) — contrato F1 `ResolveUserIntent`. Solo devuelve
 * rutas/capacidades presentes en `request.capabilities` y contenidos visibles para el contexto.
 * Se mantiene intacto como referencia; F4 lo envuelve (`proveedorLocal`) para el nuevo contrato.
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
  const capOculta = CAPACIDADES_ERP.find(
    (c) => !permitidas.has(c.id) && (!c.host || c.host === hostDe(context)) && (q.includes(c.module) || c.descripcion.toLowerCase().split(' ').some((w) => w.length > 4 && q.includes(w)))
  );
  if (capOculta) {
    return { kind: 'NO_AUTORIZADO', message: 'Esa función requiere un permiso o perfil del que no dispones. Consulta con administración.', confidence: 1 };
  }
  return {
    kind: 'NO_RESUELTO',
    message: `No hay ayuda registrada para «${texto}». Prueba con otras palabras o revisa el Centro de Ayuda (${ayudaDisponible(context).length} contenidos disponibles).`,
    confidence: 0,
  };
};
