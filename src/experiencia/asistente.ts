/**
 * CAPA TRANSVERSAL §6 — FASE 4 · IA asistente: circuito completo con validación determinista.
 *
 *   petición → contexto §6 → capacidades permitidas (RBAC/host/rol) → interpretación
 *   (proveedor IA o local) → PropuestaIA (NO fiable) → validarResolucionIA (determinista)
 *   → AIIntentResolution → confirmación si procede → ejecución por el HOST de una capacidad real.
 *
 * Invariantes:
 * - La IA solo elige entre `capacidadesDisponibles(ctx)`; cualquier otra cosa → SIN_CAPACIDAD/SIN_PERMISO.
 * - El validador funciona igual aunque el proveedor devuelva basura (estado ERROR/NO_SOPORTADA).
 * - Nada aquí toca Firestore ni ejecuta operaciones: `ejecutarResolucion` solo traduce la
 *   resolución validada (y confirmada si hace falta) en una acción del host: navegar, explicar,
 *   iniciar tutorial. Las capacidades de ESCRITURA se limitan a abrir la pantalla real.
 * - Ningún permiso ni rol se modifica; el contexto es de solo lectura.
 */
import type {
  AIIntentRequest,
  AIIntentResolution,
  CapacidadERP,
  EsquemaParametro,
  ExperienceContext,
  HostExperiencia,
  IntencionIA,
  PropuestaIA,
  ProveedorIA,
  TipoCapacidad,
  ValorParametroIA,
} from './tipos';
import { ayudaDisponible, buscarAyuda, obtenerAyuda } from './ayuda';
import { PANTALLAS_PORTAL, MODULO_POR_SECCION } from './contexto';
import { CAPACIDADES_ERP, capacidadesDisponibles, construirIntentRequest, resolverIntencionLocal } from './intenciones';
import { obtenerTutorial, tutorialesDisponibles } from './tutoriales';

export const INTENCIONES_IA: readonly IntencionIA[] = ['NAVEGAR', 'EXPLICAR', 'TUTORIAL', 'CONSULTAR', 'EJECUTAR', 'NINGUNA'] as const;
export const MAX_LONGITUD_PETICION = 500;

const hostDe = (ctx: ExperienceContext): HostExperiencia => ctx.host ?? 'ERP';
export const tipoDe = (c: Pick<CapacidadERP, 'tipo'>): TipoCapacidad => c.tipo ?? 'CONSULTA';

/** Rutas a las que el usuario puede navegar en su host (route guard del host + catálogo). */
export function rutasNavegables(ctx: ExperienceContext): string[] {
  const host = hostDe(ctx);
  const base = host === 'PORTAL_INQUILINO' ? [...PANTALLAS_PORTAL] : Object.keys(MODULO_POR_SECCION);
  if (ctx.accessibleSections && ctx.accessibleSections.length > 0) {
    const acc = new Set(ctx.accessibleSections);
    return base.filter((r) => acc.has(r));
  }
  if (host === 'ERP' && ctx.role && ctx.role !== 'ADMINISTRADOR') {
    // Sin lista del host, un no-administrador solo obtiene las rutas de sus capacidades (conservador).
    const propias = new Set(capacidadesDisponibles(ctx).map((c) => c.route).filter(Boolean) as string[]);
    propias.add('inicio');
    propias.add('ayuda');
    return base.filter((r) => propias.has(r));
  }
  return base;
}

/** Petición completa para el intérprete (sin códigos de permiso; solo lo que el usuario ya ve). */
export function construirAIIntentRequest(input: string, ctx: ExperienceContext): AIIntentRequest {
  const texto = (input ?? '').toString().slice(0, MAX_LONGITUD_PETICION);
  return {
    input: texto,
    context: ctx,
    host: hostDe(ctx),
    module: ctx.module,
    section: ctx.section,
    role: ctx.missing.includes('role') ? undefined : ctx.role,
    capabilities: capacidadesDisponibles(ctx).map((c) => ({ ...c, requiredPermission: undefined })),
    helpEntries: ayudaDisponible(ctx).map((e) => ({ id: e.id, title: e.title })),
    tutorials: tutorialesDisponibles(ctx).map((t) => ({ id: t.id, title: t.title })),
    routes: rutasNavegables(ctx),
  };
}

// ---------------------------------------------------------------------------
// Validación determinista
// ---------------------------------------------------------------------------

function base(estado: AIIntentResolution['estado'], explicacion: string, extra: Partial<AIIntentResolution> = {}): AIIntentResolution {
  return {
    estado,
    intencion: 'NINGUNA',
    parametros: {},
    confianza: 0,
    explicacion,
    requiereConfirmacion: false,
    errores: [],
    origen: 'VALIDADOR',
    ...extra,
  };
}

function validarParametros(cap: CapacidadERP, crudos: unknown, ctx: ExperienceContext): { ok: true; parametros: Record<string, ValorParametroIA> } | { ok: false; errores: string[] } {
  const esquema = cap.parametros ?? {};
  const errores: string[] = [];
  const parametros: Record<string, ValorParametroIA> = {};
  const obj = crudos && typeof crudos === 'object' && !Array.isArray(crudos) ? (crudos as Record<string, unknown>) : {};
  for (const k of Object.keys(obj)) if (!(k in esquema)) errores.push(`Parámetro no admitido: ${k}`);
  for (const [nombre, def] of Object.entries(esquema) as Array<[string, EsquemaParametro]>) {
    const v = obj[nombre];
    if (v === undefined || v === null || v === '') {
      if (def.requerido) errores.push(`Falta el parámetro «${nombre}»`);
      continue;
    }
    if (typeof v !== def.tipo) {
      errores.push(`Parámetro «${nombre}» debe ser ${def.tipo}`);
      continue;
    }
    if (def.tipo === 'string' && (v as string).length > 200) {
      errores.push(`Parámetro «${nombre}» demasiado largo`);
      continue;
    }
    if (def.valores && !def.valores.includes(v as string)) {
      errores.push(`Parámetro «${nombre}» fuera de los valores admitidos`);
      continue;
    }
    if (def.semantica === 'RUTA_HOST' && !rutasNavegables(ctx).includes(v as string)) {
      errores.push(`La pantalla «${v}» no está disponible para ti`);
      continue;
    }
    if (def.semantica === 'HELP_ENTRY_VISIBLE' && !ayudaDisponible(ctx).some((e) => e.id === v)) {
      errores.push('Ese contenido de ayuda no está disponible para ti');
      continue;
    }
    if (def.semantica === 'TUTORIAL_DISPONIBLE' && !tutorialesDisponibles(ctx).some((t) => t.id === v)) {
      errores.push('Ese tutorial no está disponible para ti');
      continue;
    }
    parametros[nombre] = v as ValorParametroIA;
  }
  return errores.length > 0 ? { ok: false, errores } : { ok: true, parametros };
}

const intencionPorTipo: Record<TipoCapacidad, IntencionIA> = { CONSULTA: 'CONSULTAR', NAVEGACION: 'NAVEGAR', AYUDA: 'EXPLICAR', ESCRITURA: 'EJECUTAR' };

/**
 * Validador determinista. Convierte una `PropuestaIA` (no fiable) en una `AIIntentResolution`
 * segura. Comprueba: capacidad existe → permitida (RBAC/host/rol) → host coincide → módulo
 * coherente con el host → parámetros según esquema → confirmación en escritura/sensible →
 * la resolución nunca añade permisos (solo referencia ids ya permitidos).
 */
export function validarResolucionIA(propuesta: unknown, ctx: ExperienceContext, meta: { origen?: 'IA' | 'LOCAL'; proveedor?: string; avisos?: string[] } = {}): AIIntentResolution {
  const origen = meta.origen ?? 'IA';
  const comun = { origen, proveedor: meta.proveedor, avisos: meta.avisos };
  if (!propuesta || typeof propuesta !== 'object' || Array.isArray(propuesta)) {
    return base('ERROR', 'La interpretación recibida no tiene un formato válido.', { ...comun, errores: ['PROPUESTA_MAL_FORMADA'] });
  }
  const p = propuesta as PropuestaIA;
  const permitidas = capacidadesDisponibles(ctx);
  const porId = new Map(permitidas.map((c) => [c.id, c]));
  const confianza = typeof p.confianza === 'number' && Number.isFinite(p.confianza) ? Math.min(1, Math.max(0, p.confianza)) : 0;
  const explicacionIA = typeof p.explicacion === 'string' ? p.explicacion.slice(0, 300) : '';

  // Intención declarada
  const intencion: IntencionIA | null = typeof p.intencion === 'string' && (INTENCIONES_IA as readonly string[]).includes(p.intencion) ? (p.intencion as IntencionIA) : null;
  if (intencion === null && p.intencion !== undefined) {
    return base('NO_SOPORTADA', 'La petición no corresponde a ninguna acción soportada por el asistente.', { ...comun, confianza, errores: ['INTENCION_DESCONOCIDA'] });
  }

  // Ambigüedad declarada por el proveedor
  if (Array.isArray(p.alternativas) && p.alternativas.length > 1 && !p.capabilityId) {
    const alts = p.alternativas.filter((id): id is string => typeof id === 'string' && porId.has(id)).map((id) => ({ capabilityId: id, descripcion: porId.get(id)!.descripcion }));
    if (alts.length > 1) {
      return base('AMBIGUA', explicacionIA || 'Tu petición puede referirse a varias acciones. Elige una.', { ...comun, intencion: intencion ?? 'NINGUNA', confianza, alternativas: alts });
    }
    if (alts.length === 1) p.capabilityId = alts[0].capabilityId;
  }

  if (intencion === 'NINGUNA' || (!p.capabilityId && !p.helpEntryId && !p.tutorialId)) {
    return base('NO_SOPORTADA', explicacionIA || 'No he encontrado una acción del ERP que corresponda a tu petición.', { ...comun, confianza });
  }

  // Resolver la capacidad (explícita o derivada de helpEntry/tutorial)
  let capId: string | undefined = typeof p.capabilityId === 'string' ? p.capabilityId : undefined;
  let parametrosCrudos: Record<string, unknown> = p.parametros && typeof p.parametros === 'object' && !Array.isArray(p.parametros) ? { ...(p.parametros as Record<string, unknown>) } : {};
  if (!capId && typeof p.tutorialId === 'string') {
    capId = 'cap.ayuda.tutorial';
    parametrosCrudos = { tutorialId: p.tutorialId };
  } else if (!capId && typeof p.helpEntryId === 'string') {
    capId = 'cap.ayuda.explicar';
    parametrosCrudos = { helpEntryId: p.helpEntryId };
  }
  if (capId === 'cap.ayuda.tutorial' && typeof p.tutorialId === 'string' && !parametrosCrudos.tutorialId) parametrosCrudos.tutorialId = p.tutorialId;
  if (capId === 'cap.ayuda.explicar' && typeof p.helpEntryId === 'string' && !parametrosCrudos.helpEntryId) parametrosCrudos.helpEntryId = p.helpEntryId;

  const enCatalogo = CAPACIDADES_ERP.find((c) => c.id === capId);
  if (!capId || !enCatalogo) {
    return base('SIN_CAPACIDAD', 'La acción propuesta no existe en el ERP.', { ...comun, confianza, errores: [`CAPACIDAD_INEXISTENTE:${String(capId)}`] });
  }
  const cap = porId.get(capId);
  if (!cap) {
    // Existe pero no está permitida: distinguir host de permiso/rol sin revelar detalles.
    const host = hostDe(ctx);
    const motivo = enCatalogo.host && enCatalogo.host !== host ? 'HOST_DISTINTO' : 'PERMISO_INSUFICIENTE';
    return base('SIN_PERMISO', 'Esa función requiere un permiso o perfil del que no dispones. Consulta con administración.', { ...comun, confianza, errores: [motivo] });
  }
  // Host y módulo coherentes
  if (cap.host && cap.host !== hostDe(ctx)) {
    return base('SIN_PERMISO', 'Esa función no está disponible en esta aplicación.', { ...comun, confianza, errores: ['HOST_DISTINTO'] });
  }
  if (hostDe(ctx) === 'PORTAL_INQUILINO' && !['inicio', 'ayuda', 'contratos', 'cobros', 'incidencias', 'suministros', 'inquilinos', 'actas', 'administracion'].includes(cap.module)) {
    return base('SIN_PERMISO', 'Esa función no está disponible en el portal.', { ...comun, confianza, errores: ['MODULO_FUERA_DE_HOST'] });
  }

  const val = validarParametros(cap, parametrosCrudos, ctx);
  if (val.ok === false) {
    return base('ERROR', 'La acción se ha identificado pero sus datos no son válidos.', { ...comun, intencion: intencionPorTipo[tipoDe(cap)], capabilityId: cap.id, confianza, errores: val.errores });
  }
  const parametros = val.parametros;
  const tipo = tipoDe(cap);
  const requiereConfirmacion = tipo === 'ESCRITURA' || cap.sensible === true;
  const route = (parametros.route as string | undefined) ?? cap.route;
  const helpEntryId = cap.id === 'cap.ayuda.explicar' ? (parametros.helpEntryId as string) : typeof p.helpEntryId === 'string' && ayudaDisponible(ctx).some((e) => e.id === p.helpEntryId) ? p.helpEntryId : undefined;
  const tutorialId = cap.id === 'cap.ayuda.tutorial' ? (parametros.tutorialId as string) : undefined;

  let explicacion = explicacionIA;
  if (!explicacion) {
    if (requiereConfirmacion) explicacion = `He identificado la acción «${cap.descripcion}». Te llevaré a la pantalla correspondiente para realizarla. ¿Quieres continuar?`;
    else if (helpEntryId) explicacion = obtenerAyuda(helpEntryId)?.summary ?? cap.descripcion;
    else if (tutorialId) explicacion = `Puedo iniciar el tutorial «${obtenerTutorial(tutorialId)?.title ?? tutorialId}».`;
    else explicacion = cap.descripcion;
  }

  return {
    estado: requiereConfirmacion ? 'REQUIERE_CONFIRMACION' : 'RESUELTA',
    intencion: intencion ?? intencionPorTipo[tipo],
    capabilityId: cap.id,
    helpEntryId,
    tutorialId,
    route,
    parametros,
    confianza: origen === 'LOCAL' ? 1 : confianza,
    explicacion,
    requiereConfirmacion,
    errores: [],
    ...comun,
  };
}

// ---------------------------------------------------------------------------
// Proveedor LOCAL determinista (fallback y referencia)
// ---------------------------------------------------------------------------

function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PATRONES_NAVEGAR = ['ir a', 've a', 'abre', 'abrir', 'llevame', 'muestrame', 'entrar en', 'ensename la', 'quiero ver'];
const PATRONES_EXPLICAR = ['que es', 'que significa', 'como funciona', 'explica', 'para que sirve', 'que quiere decir'];
const PATRONES_TUTORIAL = ['tutorial', 'recorrido', 'paso a paso', 'guiame', 'como hago', 'como se hace', 'como puedo', 'ensename a', 'como registro', 'como creo', 'como invito', 'como liquido'];

function puntuarCapacidad(q: string, cap: CapacidadERP): number {
  let s = 0;
  for (const k of cap.keywords ?? []) {
    const kk = normalizar(k);
    if (!kk) continue;
    if (q === kk) s += 6;
    else if (kk.includes(' ') ? q.includes(kk) : new RegExp(`(^|\\s)${kk}(s|es)?(\\s|$)`).test(q)) s += kk.includes(' ') ? 4 : 3;
  }
  if (q.includes(cap.module)) s += 1;
  return s;
}

/**
 * Proveedor local determinista: devuelve una `PropuestaIA` (que igualmente pasa por el validador).
 * Reglas: verbos de navegación → NAVEGAR a la capacidad mejor puntuada; «tutorial/cómo hago» →
 * TUTORIAL si hay uno relacionado; «qué es» → EXPLICAR con la ayuda; escritura → EJECUTAR
 * (el validador exigirá confirmación); empate de capacidades → alternativas (AMBIGUA).
 */
export const proveedorLocal: ProveedorIA = {
  nombre: 'local',
  async interpretar(req) {
    const q = normalizar(req.input);
    if (!q) return { intencion: 'NINGUNA', explicacion: 'Escribe qué necesitas hacer o encontrar.', confianza: 0 };
    const ctx = req.context;
    // Texto sin signos de puntuación para la búsqueda F1 (que no los elimina)
    const consulta = req.input.replace(/[¿?¡!.,;:«»"()]/g, ' ');
    const permitidas = capacidadesDisponibles(ctx);
    const quiereNavegar = PATRONES_NAVEGAR.some((p) => q.includes(p));
    const quiereExplicar = PATRONES_EXPLICAR.some((p) => q.includes(p));
    const quiereTutorial = PATRONES_TUTORIAL.some((p) => q.includes(p));

    const puntuadas = permitidas
      .filter((c) => !['cap.ayuda.explicar', 'cap.ayuda.tutorial', 'cap.navegacion.ir'].includes(c.id))
      .map((c) => ({ c, s: puntuarCapacidad(q, c) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);

    // Tutorial explícito
    if (quiereTutorial) {
      const tutoriales = tutorialesDisponibles(ctx);
      const ayuda = buscarAyuda(ctx, consulta);
      const relacionado = tutoriales.find((t) => ayuda.some((e) => e.relatedTutorials?.includes(t.id))) ?? tutoriales.find((t) => puntuadas[0] && t.module === puntuadas[0].c.module) ?? (tutoriales.length === 1 && q.includes('tutorial') ? tutoriales[0] : undefined);
      if (relacionado) return { intencion: 'TUTORIAL', capabilityId: 'cap.ayuda.tutorial', parametros: { tutorialId: relacionado.id }, confianza: 0.9, explicacion: `Puedo iniciar el tutorial «${relacionado.title}».` };
      if (ayuda.length > 0) return { intencion: 'EXPLICAR', capabilityId: 'cap.ayuda.explicar', parametros: { helpEntryId: ayuda[0].id }, confianza: 0.7, explicacion: ayuda[0].summary };
    }

    // Explicación explícita
    if (quiereExplicar) {
      const ayuda = buscarAyuda(ctx, consulta);
      if (ayuda.length > 0) return { intencion: 'EXPLICAR', capabilityId: 'cap.ayuda.explicar', parametros: { helpEntryId: ayuda[0].id }, confianza: 0.85, explicacion: ayuda[0].summary };
    }

    // Capacidades puntuadas
    if (puntuadas.length > 0) {
      const [mejor, segunda] = puntuadas;
      if (segunda && segunda.s === mejor.s && segunda.c.module !== mejor.c.module) {
        return { alternativas: puntuadas.filter((x) => x.s === mejor.s).slice(0, 4).map((x) => x.c.id), confianza: 0.5, explicacion: 'Tu petición puede referirse a varias acciones. Elige una.' };
      }
      const cap = mejor.c;
      const tipo = tipoDe(cap);
      if (tipo === 'ESCRITURA') return { intencion: 'EJECUTAR', capabilityId: cap.id, confianza: 0.8 };
      if (quiereNavegar || tipo === 'NAVEGACION') return { intencion: 'NAVEGAR', capabilityId: cap.id, confianza: 0.85, explicacion: `Te llevo a «${cap.descripcion}».` };
      // Consulta: si hay ayuda relacionada, acompañar con la explicación
      const ayuda = buscarAyuda(ctx, consulta).find((e) => e.module === cap.module);
      return { intencion: 'CONSULTAR', capabilityId: cap.id, helpEntryId: ayuda?.id, confianza: 0.8, explicacion: ayuda?.summary ?? cap.descripcion };
    }

    // La petición apunta a una capacidad de este host que el usuario NO tiene: se propone igualmente
    // para que el validador responda SIN_PERMISO (sin exponer contenido) en lugar de improvisar.
    const oculta = CAPACIDADES_ERP.filter((c) => (!c.host || c.host === req.host) && !permitidas.some((p) => p.id === c.id))
      .map((c) => ({ c, s: puntuarCapacidad(q, c) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)[0];
    if (oculta) return { intencion: 'CONSULTAR', capabilityId: oculta.c.id, confianza: 0.6 };

    // La petición apunta a una capacidad de OTRO host (p. ej. Tesorería desde el Portal): no se deriva ni se
    // improvisa con la ayuda; se responde que no está disponible en este entorno.
    const otroHost = CAPACIDADES_ERP.some((c) => c.host && c.host !== req.host && puntuarCapacidad(q, c) > 0);
    if (otroHost && !quiereExplicar && !quiereTutorial) {
      return { intencion: 'NINGUNA', confianza: 0, explicacion: req.host === 'PORTAL_INQUILINO' ? 'Esa función no está disponible en el portal del inquilino.' : 'Esa función no está disponible en este entorno.' };
    }

    // Navegación directa por nombre de ruta
    if (quiereNavegar) {
      const ruta = rutasNavegables(ctx).find((r) => new RegExp(`(^|\\s)${r.replace('_', ' ')}(\\s|$)`).test(q) || q.includes(r));
      if (ruta) return { intencion: 'NAVEGAR', capabilityId: 'cap.navegacion.ir', parametros: { route: ruta }, confianza: 0.75 };
    }

    // Último recurso: el resolutor F1 (búsqueda en la ayuda)
    const f1 = await resolverIntencionLocal(construirIntentRequest(consulta, ctx));
    if (f1.kind === 'TUTORIAL' && f1.tutorialId) return { intencion: 'TUTORIAL', capabilityId: 'cap.ayuda.tutorial', parametros: { tutorialId: f1.tutorialId }, confianza: 0.7, explicacion: f1.message };
    if (f1.kind === 'EXPLICAR' && f1.helpEntryId) return { intencion: 'EXPLICAR', capabilityId: 'cap.ayuda.explicar', parametros: { helpEntryId: f1.helpEntryId }, confianza: 0.6, explicacion: f1.message };
    if (f1.kind === 'NO_AUTORIZADO') return { intencion: 'NINGUNA', explicacion: f1.message, confianza: 0 };
    return { intencion: 'NINGUNA', explicacion: f1.message, confianza: 0 };
  },
};

// ---------------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------------

export interface OpcionesAsistente {
  /** Proveedor principal (Gemini vía servidor, mock…). Si falla o no existe → local. */
  proveedor?: ProveedorIA;
  /** Tiempo máximo de espera del proveedor (ms). */
  timeoutMs?: number;
}

function conTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * Resuelve una petición: construye la petición IA, consulta al proveedor (si lo hay), valida de
 * forma determinista y —si el proveedor falla, no está disponible o su propuesta es inservible—
 * cae al proveedor local. Nunca lanza.
 */
export async function resolverPeticion(input: string, ctx: ExperienceContext, opciones: OpcionesAsistente = {}): Promise<AIIntentResolution> {
  const texto = (input ?? '').toString().trim();
  if (!texto) return base('NO_SOPORTADA', 'Escribe qué necesitas hacer o encontrar.', { origen: 'VALIDADOR' });
  if (texto.length > MAX_LONGITUD_PETICION) return base('ERROR', `La petición es demasiado larga (máx. ${MAX_LONGITUD_PETICION} caracteres).`, { errores: ['PETICION_DEMASIADO_LARGA'] });
  const req = construirAIIntentRequest(texto, ctx);
  const avisos: string[] = [];

  if (opciones.proveedor) {
    try {
      const propuesta = await conTimeout(opciones.proveedor.interpretar(req), opciones.timeoutMs ?? 12000);
      const res = validarResolucionIA(propuesta, ctx, { origen: 'IA', proveedor: opciones.proveedor.nombre });
      if (res.estado !== 'ERROR') return res;
      avisos.push('La interpretación del asistente no era válida; se ha usado el resolutor local.');
    } catch (err) {
      avisos.push(`Asistente IA no disponible (${err instanceof Error ? err.message : 'error'}); se ha usado el resolutor local.`);
    }
  }
  try {
    const propuesta = await proveedorLocal.interpretar(req);
    return validarResolucionIA(propuesta, ctx, { origen: 'LOCAL', proveedor: 'local', avisos: avisos.length ? avisos : undefined });
  } catch (err) {
    return base('ERROR', 'No se ha podido interpretar la petición.', { errores: [err instanceof Error ? err.message : 'ERROR_LOCAL'], avisos });
  }
}

/** Resolución tras elegir una alternativa (AMBIGUA → capacidad concreta). Vuelve a validar. */
export function elegirAlternativa(res: AIIntentResolution, capabilityId: string, ctx: ExperienceContext): AIIntentResolution {
  if (res.estado !== 'AMBIGUA' || !res.alternativas?.some((a) => a.capabilityId === capabilityId)) {
    return base('ERROR', 'La opción elegida no forma parte de las alternativas.', { errores: ['ALTERNATIVA_INVALIDA'] });
  }
  return validarResolucionIA({ capabilityId, confianza: 1 }, ctx, { origen: res.origen === 'VALIDADOR' ? 'LOCAL' : res.origen, proveedor: res.proveedor });
}

/** Confirmación EXPLÍCITA del usuario: revalida contra el contexto actual y marca `confirmada`. */
export function confirmarResolucion(res: AIIntentResolution, ctx: ExperienceContext): AIIntentResolution {
  if (res.estado !== 'REQUIERE_CONFIRMACION' || !res.capabilityId) {
    return base('ERROR', 'No hay ninguna acción pendiente de confirmación.', { errores: ['NADA_QUE_CONFIRMAR'] });
  }
  const re = validarResolucionIA({ intencion: res.intencion, capabilityId: res.capabilityId, parametros: res.parametros, confianza: res.confianza, explicacion: res.explicacion }, ctx, { origen: res.origen === 'VALIDADOR' ? 'LOCAL' : res.origen, proveedor: res.proveedor });
  if (re.estado !== 'REQUIERE_CONFIRMACION') return re; // el contexto cambió: ya no procede
  return { ...re, confirmada: true };
}

/** Acción concreta que el HOST debe ejecutar con sus propios medios (route guard, tutoriales…). */
export type AccionHost =
  | { tipo: 'NAVEGAR'; route: string; capabilityId: string }
  | { tipo: 'EXPLICAR'; helpEntryId: string; route?: string; capabilityId: string }
  | { tipo: 'TUTORIAL'; tutorialId: string; capabilityId: string }
  | { tipo: 'NINGUNA'; motivo: string };

/**
 * Traduce una resolución validada en una acción del host. Reglas duras:
 * - Solo `RESUELTA`, o `REQUIERE_CONFIRMACION` con `confirmada === true`.
 * - Revalida la capacidad contra el contexto ACTUAL (por si cambió).
 * - Escritura/sensible → únicamente NAVEGAR a la pantalla real (la operación la hace el usuario en el módulo).
 */
export function ejecutarResolucion(res: AIIntentResolution, ctx: ExperienceContext): AccionHost {
  if (res.estado === 'REQUIERE_CONFIRMACION' && res.confirmada !== true) return { tipo: 'NINGUNA', motivo: 'CONFIRMACION_PENDIENTE' };
  if (res.estado !== 'RESUELTA' && res.estado !== 'REQUIERE_CONFIRMACION') return { tipo: 'NINGUNA', motivo: `ESTADO_${res.estado}` };
  if (!res.capabilityId) return { tipo: 'NINGUNA', motivo: 'SIN_CAPACIDAD' };
  const cap = capacidadesDisponibles(ctx).find((c) => c.id === res.capabilityId);
  if (!cap) return { tipo: 'NINGUNA', motivo: 'CAPACIDAD_NO_PERMITIDA' };
  if (tipoDe(cap) === 'ESCRITURA' || cap.sensible) {
    if (res.confirmada !== true) return { tipo: 'NINGUNA', motivo: 'CONFIRMACION_PENDIENTE' };
    return cap.route ? { tipo: 'NAVEGAR', route: cap.route, capabilityId: cap.id } : { tipo: 'NINGUNA', motivo: 'SIN_RUTA' };
  }
  if (res.tutorialId) {
    return tutorialesDisponibles(ctx).some((t) => t.id === res.tutorialId) ? { tipo: 'TUTORIAL', tutorialId: res.tutorialId, capabilityId: cap.id } : { tipo: 'NINGUNA', motivo: 'TUTORIAL_NO_DISPONIBLE' };
  }
  if (res.helpEntryId && (cap.id === 'cap.ayuda.explicar' || res.intencion === 'EXPLICAR' || res.intencion === 'CONSULTAR')) {
    if (!ayudaDisponible(ctx).some((e) => e.id === res.helpEntryId)) return { tipo: 'NINGUNA', motivo: 'AYUDA_NO_DISPONIBLE' };
    return { tipo: 'EXPLICAR', helpEntryId: res.helpEntryId, route: res.route, capabilityId: cap.id };
  }
  const route = res.route ?? cap.route;
  if (route) {
    if (!rutasNavegables(ctx).includes(route)) return { tipo: 'NINGUNA', motivo: 'RUTA_INACCESIBLE' };
    return { tipo: 'NAVEGAR', route, capabilityId: cap.id };
  }
  return { tipo: 'NINGUNA', motivo: 'SIN_ACCION' };
}
