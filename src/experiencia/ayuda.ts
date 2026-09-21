/**
 * CAPA TRANSVERSAL §6 — FASE 1 · Registro tipado de ayuda contextual y motor de consulta.
 *
 * El contenido describe funcionalidades REALES de la canónica (B/C/D/E y base).
 * Filtrado por rol/permiso = solo lectura del RBAC existente (nunca lo amplía).
 */
import type { ExperienceContext, HelpEntry, ModuloERP } from './tipos';
import { contextoCumpleRoles, contextoTienePermiso } from './contexto';

export const AYUDA_REGISTRO: HelpEntry[] = [
  {
    id: 'ayuda.inicio.panel',
    module: 'inicio',
    section: 'inicio',
    title: 'Panel de inicio',
    summary: 'Resumen de candidatos, inmuebles y accesos directos a las secciones más usadas.',
    content:
      'El panel de inicio muestra un resumen operativo de la cartera: candidatos por estado, inmuebles y avisos.\n\nDesde las tarjetas puedes saltar directamente a la sección correspondiente. Si no ves un dato, comprueba en la sección de origen que el registro existe y que tu perfil tiene acceso a él.',
    keywords: ['inicio', 'resumen', 'panel', 'dashboard'],
  },
  {
    id: 'ayuda.tesoreria.liquidaciones',
    module: 'tesoreria',
    section: 'tesoreria',
    title: 'Liquidaciones a propietarios (Tesorería)',
    summary: 'Cómo se genera, aprueba y paga una liquidación mensual y qué significa cada estado.',
    content:
      'Una liquidación agrupa, para un propietario y un periodo, los cobros efectivamente recibidos y los gastos imputables, y calcula el importe neto a transferir.\n\nEstados: BORRADOR (generada, editable) → APROBADA (validada para pago) → PAGADA (con referencia y evidencia). ANULADA y REVERSADA quedan trazadas con motivo.\n\nGenerar y aprobar requiere el permiso «tesoreria.liquidar»; registrar el pago o reversar requiere «tesoreria.pagar». Las pestañas SEPA preparan ficheros pain.008/pain.001 para la banca electrónica: nunca se ejecuta ningún cargo automáticamente.',
    roles: ['ADMINISTRADOR'],
    permissions: ['tesoreria.ver'],
    keywords: ['liquidación', 'liquidaciones', 'propietario', 'pago', 'sepa', 'pain.008', 'pain.001', 'tesorería', 'neto'],
    relatedTutorials: ['tutorial.tesoreria.liquidacion'],
  },
  {
    id: 'ayuda.tesoreria.mis-liquidaciones',
    module: 'tesoreria',
    section: 'tesoreria',
    title: 'Mis liquidaciones',
    summary: 'Consulta de las liquidaciones de tus inmuebles y del detalle de cada línea.',
    content:
      'Aquí ves las liquidaciones que la gestión ha generado para tus inmuebles: periodo, líneas de ingresos cobrados, gastos imputados y neto.\n\nNo puedes generar ni aprobar liquidaciones: esas acciones corresponden a la administración. Si detectas una diferencia, utiliza la sección de incidencias o contacta con gestión.',
    roles: ['PROPIETARIO'],
    keywords: ['liquidación', 'mis liquidaciones', 'neto', 'propietario'],
  },
  {
    id: 'ayuda.morosidad.expedientes',
    module: 'morosidad',
    section: 'morosidad',
    title: 'Morosidad y recobro',
    summary: 'Expedientes de impago: detección, comunicaciones, acuerdos de pago y vía legal.',
    content:
      'Cada expediente de morosidad agrupa la deuda pendiente de un contrato y su historial de actuaciones (comunicaciones, acuerdos de pago, escalado legal).\n\nLos saldos se calculan a partir de los cobros del ERP; el expediente no crea una segunda contabilidad. Las comunicaciones quedan registradas; el envío real por email/SMS depende del transporte configurado.',
    roles: ['ADMINISTRADOR'],
    keywords: ['morosidad', 'impago', 'recobro', 'expediente', 'deuda', 'acuerdo de pago'],
  },
  {
    id: 'ayuda.actas.entrada-salida',
    module: 'actas',
    section: 'actas',
    title: 'Actas de entrada y salida',
    summary: 'Inventario por elementos, lecturas, evidencias, firma con OTP y PDF.',
    content:
      'Un acta documenta el estado de la vivienda al inicio (ENTRADA) o al final (SALIDA) del contrato: elementos con su estado, lecturas de contadores, fotografías y observaciones.\n\nUna vez firmada, el acta es inmutable: cualquier corrección genera una nueva versión enlazada a la anterior. La comparación entrada↔salida es determinista y sirve de base objetiva ante desperfectos.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
    keywords: ['acta', 'entrada', 'salida', 'inventario', 'firma', 'otp', 'pdf', 'fianza', 'desperfectos'],
  },
  {
    id: 'ayuda.inquilinos.portal',
    module: 'inquilinos',
    section: 'inquilinos',
    title: 'Portal de inquilinos: accesos e invitaciones',
    summary: 'Cómo dar acceso a un inquilino a su portal y qué verá una vez dentro.',
    content:
      'El acceso del inquilino nace siempre de una invitación vinculada a un contrato: en «Invitaciones» eliges el contrato, la caducidad y los usos, y compartes el enlace generado. Al registrarse, el inquilino queda vinculado únicamente a ese contrato.\n\nEn su portal el inquilino ve una versión saneada de su contrato, recibos, incidencias, documentos (actas), suministros e historial, y puede escribir a gestión, notificar averías y registrar lecturas. Nunca accede al ERP ni a datos de otros inquilinos.\n\nEn «Accesos» puedes revisar y desvincular contratos; en «Mensajes» respondes los hilos por contrato.',
    roles: ['ADMINISTRADOR'],
    permissions: ['inquilinos.ver'],
    keywords: ['inquilino', 'portal', 'invitación', 'enlace', 'acceso', 'mensajes', 'vinculación'],
  },
  {
    id: 'ayuda.suministros.gestion',
    module: 'suministros',
    section: 'suministros',
    title: 'Suministros y lecturas',
    summary: 'Ficha de suministro (CUPS/contador), lecturas inmutables, reparto y cambios de titular.',
    content:
      'Cada suministro pertenece a un inmueble e identifica tipo, comercializadora y CUPS/contador. Las lecturas son inmutables: una corrección se registra como nueva lectura que referencia a la anterior.\n\nEl reparto permite distribuir un consumo entre unidades; los cambios de titular quedan trazados con su estado.',
    keywords: ['suministro', 'luz', 'agua', 'gas', 'lectura', 'contador', 'cups', 'reparto', 'titular'],
  },
  {
    id: 'ayuda.incidencias.flujo',
    module: 'incidencias',
    section: 'incidencias',
    title: 'Flujo de una incidencia',
    summary: 'Desde la avería hasta el gasto: incidencia → profesional → presupuesto → reparación → factura.',
    content:
      'Una incidencia describe una avería o necesidad en un inmueble, con prioridad y responsabilidad. Puede asignarse a un profesional, recibir presupuesto, ejecutarse y cerrarse con factura, que genera el gasto correspondiente.\n\nLas incidencias notificadas por inquilinos desde su portal aparecen con origen INQUILINO y quedan acotadas a su contrato.',
    keywords: ['incidencia', 'avería', 'reparación', 'profesional', 'presupuesto', 'factura'],
  },
  {
    id: 'ayuda.centro.uso',
    module: 'ayuda',
    section: 'ayuda',
    title: 'Cómo usar el Centro de Ayuda',
    summary: 'Busca por palabras, filtra por módulo y sigue tutoriales guiados paso a paso.',
    content:
      'El Centro de Ayuda reúne las explicaciones de cada pantalla y los tutoriales disponibles para tu perfil. Solo muestra contenido de funciones a las que ya tienes acceso: la ayuda nunca concede permisos.\n\nEl icono de ayuda de cada sección abre la explicación de esa pantalla concreta.',
    keywords: ['ayuda', 'tutorial', 'buscar', 'centro de ayuda'],
  },
];

/** Palabras vacías frecuentes en español que no deben puntuar en la búsqueda. */
const STOPWORDS = new Set(['los', 'las', 'del', 'una', 'uno', 'unos', 'unas', 'que', 'con', 'por', 'para', 'como', 'este', 'esta', 'esto', 'sobre', 'entre', 'desde', 'hasta', 'donde', 'cuando', 'quiero', 'puedo', 'tengo', 'hacer', 'necesito', 'mis', 'sus', 'sin', 'mas']);

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** ¿La entrada es visible para el contexto? (rol y permisos requeridos; solo lectura del RBAC). */
export function ayudaVisibleEn(entrada: HelpEntry, ctx: ExperienceContext): boolean {
  if (!contextoCumpleRoles(ctx, entrada.roles)) return false;
  if (entrada.permissions && entrada.permissions.length > 0) {
    // Si los permisos del usuario son desconocidos, el contenido condicionado no se muestra.
    if (ctx.missing.includes('permissions')) return false;
    if (!entrada.permissions.every((p) => contextoTienePermiso(ctx, p))) return false;
  }
  return true;
}

export interface OpcionesAyuda {
  registro?: HelpEntry[];
}

/** Ayuda visible para el contexto (todas las secciones). */
export function ayudaDisponible(ctx: ExperienceContext, opciones: OpcionesAyuda = {}): HelpEntry[] {
  const registro = opciones.registro ?? AYUDA_REGISTRO;
  return registro.filter((e) => ayudaVisibleEn(e, ctx));
}

/** Ayuda de la pantalla actual (coincidencia exacta por sección). */
export function ayudaParaContexto(ctx: ExperienceContext, opciones: OpcionesAyuda = {}): HelpEntry[] {
  if (!ctx.section) return [];
  return ayudaDisponible(ctx, opciones).filter((e) => e.section === ctx.section);
}

/** Ayuda del módulo actual (más amplia que la de la pantalla). */
export function ayudaParaModulo(ctx: ExperienceContext, modulo: ModuloERP, opciones: OpcionesAyuda = {}): HelpEntry[] {
  return ayudaDisponible(ctx, opciones).filter((e) => e.module === modulo);
}

/**
 * Búsqueda por texto sobre título, resumen, contenido y palabras clave, con puntuación
 * simple (título > keywords > resumen > contenido). Respeta rol/permisos del contexto.
 */
export function buscarAyuda(ctx: ExperienceContext, consulta: string, opciones: OpcionesAyuda = {}): HelpEntry[] {
  const q = normalizar(consulta);
  if (!q) return ayudaDisponible(ctx, opciones);
  const terminos = q.split(/\s+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  if (terminos.length === 0) return [];
  const puntuadas = ayudaDisponible(ctx, opciones)
    .map((e) => {
      const titulo = normalizar(e.title);
      const kws = (e.keywords ?? []).map(normalizar);
      const resumen = normalizar(e.summary);
      const contenido = normalizar(e.content);
      let puntos = 0;
      for (const t of terminos) {
        if (titulo.includes(t)) puntos += 5;
        if (kws.some((k) => k.includes(t))) puntos += 4;
        if (resumen.includes(t)) puntos += 2;
        if (contenido.includes(t)) puntos += 1;
      }
      return { e, puntos };
    })
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.e.title.localeCompare(b.e.title));
  return puntuadas.map((x) => x.e);
}

export function obtenerAyuda(id: string, opciones: OpcionesAyuda = {}): HelpEntry | undefined {
  return (opciones.registro ?? AYUDA_REGISTRO).find((e) => e.id === id);
}

/** Módulos con al menos una entrada visible (para el filtro del Centro de Ayuda). */
export function modulosConAyuda(ctx: ExperienceContext, opciones: OpcionesAyuda = {}): ModuloERP[] {
  return Array.from(new Set(ayudaDisponible(ctx, opciones).map((e) => e.module)));
}

export const NOMBRE_MODULO: Record<ModuloERP, string> = {
  inicio: 'Inicio',
  inmuebles: 'Inmuebles',
  propietarios: 'Propietarios',
  captacion: 'Captación y candidatos',
  contratos: 'Contratos',
  cobros: 'Cobros',
  tesoreria: 'Tesorería',
  morosidad: 'Morosidad',
  actas: 'Actas',
  inquilinos: 'Portal de inquilinos',
  suministros: 'Suministros',
  incidencias: 'Incidencias',
  finanzas: 'Finanzas y fiscalidad',
  seguros: 'Seguros',
  administracion: 'Administración',
  ayuda: 'Ayuda',
  desconocido: 'Otros',
};
