/**
 * GAP 5 · FASE 1 — HUECO 4: CONTRATO de adaptador de portal (sin portales reales).
 * --------------------------------------------------------------------------------
 * Aquí está SÓLO el contrato que la fase 2 implementará por portal. Nada de este
 * fichero hace red, lee credenciales ni conoce reglas de un portal concreto:
 *   · Ninguna operación exige `Promise`, pero el contrato admite sync o async
 *     ⇒ la fase 2 puede ir a HTTP sin romper el tipo.
 *   · El motor decide la acción (`idempotencia.ts`) y el adaptador la ejecuta: el
 *     núcleo nunca tiene `if (portal === ...)`.
 *   · Las cinco operaciones exigidas: validar, publicar, actualizar, retirar,
 *     consultarEstado.
 *   · `crearAdaptadorNoConectado()` es la implementación de esta fase: `validar`
 *     sí funciona (es pura) y las cuatro operaciones de red devuelven un rechazo
 *     ESTRUCTURADO con `PORTAL_NO_CONECTADO`. No hay llamada, ni timeout, ni sdk.
 *   · El contexto de operación se SANEÁ por construcción: cualquier clave de
 *     credencial que un llamador intentara colar se elimina antes de llegar al
 *     puerto. Las credenciales, si algún día hay, viven fuera del ERP.
 *
 * La capacidad de EXPORTACIÓN ya existente (`AdaptadorPortal.generar` en
 * src/utils/publicacionPortales.ts) se REUTILIZA vía `exportarFeed()`: no se
 * duplican los generadores de feed.
 */
import type { PortalInmobiliario, PublicacionInmueble } from '../types';
import { ADAPTADORES_PORTAL, type AdaptadorPortal } from '../utils/publicacionPortales';
import type { DecisionSindicacion } from './idempotencia';
import type { VersionPublicable } from './hashContenido';
import { validarModeloPublicable, type ValidacionEstructurada } from './validacion';

export const VERSION_CONTRATO_ADAPTADOR = 'sindicacion/1' as const;

export type OperacionAdaptador = 'validar' | 'publicar' | 'actualizar' | 'retirar' | 'consultarEstado';

export const OPERACIONES_ADAPTADOR: readonly OperacionAdaptador[] = ['validar', 'publicar', 'actualizar', 'retirar', 'consultarEstado'];

export const CODIGO_PORTAL_NO_CONECTADO = 'PORTAL_NO_CONECTADO';
export const CODIGO_CONTEXTO_RECHAZADO = 'CONTEXTO_NO_PERMITIDO';
export const CODIGO_DECISION_NO_ENVIABLE = 'DECISION_NO_ENVIABLE';
export const CODIGO_OPERACION_NO_IMPLEMENTADA = 'OPERACION_NO_IMPLEMENTADA';

/**
 * Lista ÚNICA de claves de credencial del módulo. La comparten dos cosas: el saneado
 * del contexto que llega a un adaptador y el guardián del documento de Firestore
 * (`documentoSinCredenciales` en src/lib/sindicacionFirestore.ts) ⇒ una sola barrera,
 * no dos listas que se puedan desincronizar.
 */
export const CLAVES_CREDENCIAL_PROHIBIDAS = [
  'credenciales',
  'credential',
  'apiKey',
  'api_key',
  'apikey',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'clientSecret',
  'password',
  'authorization',
] as const;

export interface ErrorAdaptador {
  codigo: string;
  mensaje: string;
  detalles?: Record<string, unknown>;
}

export interface ResultadoAdaptador<T = unknown> {
  ok: boolean;
  operacion: OperacionAdaptador;
  portal: PortalInmobiliario;
  externalId?: string;
  version?: VersionPublicable;
  datos?: T;
  error?: ErrorAdaptador;
}

export type ResultadoO_PROMESA<T> = T | Promise<T>;

export interface ContextoOperacion {
  publicacion: PublicacionInmueble;
  decision?: DecisionSindicacion;
  version?: VersionPublicable;
  externalId?: string;
  /** Clave idempotente (`PORTAL:inmuebleId`): el adaptador la usa como delta de duplicados. */
  claveIdempotencia?: string;
  /** Datos de soporte del llamador (referencia de anuncio, notas). Sin credenciales: se sanitizan. */
  extras?: Record<string, unknown>;
}

/** Lo que implementará cada portal en la fase 2. Las cinco operaciones son obligatorias. */
export interface PuertoAdaptadorSindicacion {
  portal: PortalInmobiliario;
  nombre: string;
  validar?: (ctx: ContextoOperacion) => ResultadoO_PROMESA<ResultadoAdaptador<ValidacionEstructurada>>;
  publicar: (ctx: ContextoOperacion) => ResultadoO_PROMESA<ResultadoAdaptador>;
  actualizar: (ctx: ContextoOperacion) => ResultadoO_PROMESA<ResultadoAdaptador>;
  retirar: (ctx: ContextoOperacion) => ResultadoO_PROMESA<ResultadoAdaptador>;
  consultarEstado: (ctx: ContextoOperacion) => ResultadoO_PROMESA<ResultadoAdaptador<{ estado?: string; externalId?: string }>>;
}

export interface AdaptadorSindicacion {
  portal: PortalInmobiliario;
  nombre: string;
  versionContrato: typeof VERSION_CONTRATO_ADAPTADOR;
  conectado: boolean;
  operacionesSoportadas: readonly OperacionAdaptador[];
  validar: (ctx: ContextoOperacion) => ResultadoO_PROMESA<ResultadoAdaptador<ValidacionEstructurada>>;
  publicar: (ctx: ContextoOperacion) => ResultadoO_PROMESA<ResultadoAdaptador>;
  actualizar: (ctx: ContextoOperacion) => ResultadoO_PROMESA<ResultadoAdaptador>;
  retirar: (ctx: ContextoOperacion) => ResultadoO_PROMESA<ResultadoAdaptador>;
  consultarEstado: (ctx: ContextoOperacion) => ResultadoO_PROMESA<ResultadoAdaptador<{ estado?: string; externalId?: string }>>;
}

/**
 * Contexto canónico para un adaptador: identidad y versión salen de la DECISIÓN,
 * no se recalculan aquí (una sola fuente de verdad).
 */
export function contextoParaAdaptador(publicacion: PublicacionInmueble, decision?: DecisionSindicacion): ContextoOperacion {
  return {
    publicacion,
    ...(decision ? { decision, version: decision.version, externalId: decision.externalId, claveIdempotencia: decision.claveIdentidad } : {}),
  };
}

/** Elimina cualquier rastro de credenciales del contexto que llega a un adaptador. */export function sanearContexto(ctx: ContextoOperacion): { contexto: ContextoOperacion; eliminadas: string[] } {
  const eliminadas: string[] = [];
  const extras: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(ctx?.extras || {})) {
    if ((CLAVES_CREDENCIAL_PROHIBIDAS as readonly string[]).includes(clave)) {
      eliminadas.push(clave);
      continue;
    }
    extras[clave] = valor;
  }
  const raiz: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(ctx as unknown as Record<string, unknown>)) {
    if ((CLAVES_CREDENCIAL_PROHIBIDAS as readonly string[]).includes(clave)) {
      eliminadas.push(clave);
      continue;
    }
    raiz[clave] = valor;
  }
  return { contexto: { ...(raiz as unknown as ContextoOperacion), extras }, eliminadas };
}

function rechazoNoConectado(portal: PortalInmobiliario, operacion: OperacionAdaptador): ResultadoAdaptador {
  return {
    ok: false,
    operacion,
    portal,
    error: {
      codigo: CODIGO_PORTAL_NO_CONECTADO,
      mensaje:
        `${portal}: la Fase 1 del GAP 5 no conecta con portales reales (sin API, sin credenciales, sin red). ` +
        `La operación "${operacion}" queda pendiente de su adaptador en la Fase 2.`,
    },
  };
}

/**
 * Adaptador de esta fase: validación útil y rechazo explícito para lo demás.
 * No hace NADA de E/S: se puede llamar 10.000 veces y no cambia el mundo.
 */
export function crearAdaptadorNoConectado(portal: PortalInmobiliario, nombre?: string): AdaptadorSindicacion {
  const denominacion = nombre || portal;
  return {
    portal,
    nombre: denominacion,
    versionContrato: VERSION_CONTRATO_ADAPTADOR,
    conectado: false,
    operacionesSoportadas: ['validar'],
    validar: (ctx) => {
      const { contexto } = sanearContexto(ctx);
      const validacion = validarModeloPublicable(contexto.publicacion);
      return {
        ok: validacion.estado === 'VALIDO',
        operacion: 'validar',
        portal,
        datos: validacion,
        ...(contexto.externalId ? { externalId: contexto.externalId } : {}),
      };
    },
    publicar: (ctx) => rechazoNoConectado(portal, 'publicar'),
    actualizar: (ctx) => rechazoNoConectado(portal, 'actualizar'),
    retirar: (ctx) => rechazoNoConectado(portal, 'retirar'),
    consultarEstado: (ctx) => rechazoNoConectado(portal, 'consultarEstado'),
  };
}

/** Construye un adaptador completo a partir de un puerto (fase 2): contrato exigido en tiempo y forma. */
export function crearAdaptador(puerto: PuertoAdaptadorSindicacion): {
  ok: boolean;
  adaptador?: AdaptadorSindicacion;
  error?: ErrorAdaptador;
} {
  const faltan = OPERACIONES_ADAPTADOR.filter((op) => op !== 'validar' && typeof puerto?.[op] !== 'function');
  if (faltan.length > 0) {
    return {
      ok: false,
      error: {
        codigo: CODIGO_OPERACION_NO_IMPLEMENTADA,
        mensaje: `El adaptador de ${puerto?.portal || '(sin portal)'} no implementa: ${faltan.join(', ')}.`,
        detalles: { faltan },
      },
    };
  }
  const envolver = <T>(
    operacion: OperacionAdaptador,
    fn: (ctx: ContextoOperacion) => ResultadoO_PROMESA<ResultadoAdaptador<T>>,
  ): ((ctx: ContextoOperacion) => ResultadoO_PROMESA<ResultadoAdaptador<T>>) => (
    ctx: ContextoOperacion,
  ): ResultadoO_PROMESA<ResultadoAdaptador<T>> => {
    const { contexto, eliminadas } = sanearContexto(ctx);
    if (eliminadas.length > 0) {
      return {
        ok: false,
        operacion,
        portal: puerto.portal,
        error: {
          codigo: CODIGO_CONTEXTO_RECHAZADO,
          mensaje: `El contexto no puede llevar credenciales (${eliminadas.join(', ')}).`,
          detalles: { clavesEliminadas: eliminadas },
        },
      };
    }
    const decision = contexto.decision;
    if (operacion !== 'validar' && decision && decision.accion === 'SIN_CAMBIOS') {
      return {
        ok: false,
        operacion,
        portal: puerto.portal,
        ...(decision.externalId ? { externalId: decision.externalId } : {}),
        error: {
          codigo: CODIGO_DECISION_NO_ENVIABLE,
          mensaje: 'La decisión del motor es SIN_CAMBIOS: no se envía nada al portal (idempotencia).',
        },
      };
    }
    return Promise.resolve(fn(contexto));
  };

  const adaptador: AdaptadorSindicacion = {
    portal: puerto.portal,
    nombre: puerto.nombre,
    versionContrato: VERSION_CONTRATO_ADAPTADOR,
    conectado: true,
    operacionesSoportadas: [...OPERACIONES_ADAPTADOR],
    validar: envolver<ValidacionEstructurada>('validar', (ctx) => {
      if (typeof puerto.validar === 'function') return puerto.validar(ctx);
      const validacion = validarModeloPublicable(ctx.publicacion);
      return {
        ok: validacion.estado === 'VALIDO',
        operacion: 'validar' as const,
        portal: puerto.portal,
        datos: validacion,
      };
    }),
    publicar: envolver<unknown>('publicar', (ctx) => puerto.publicar(ctx)),
    actualizar: envolver<unknown>('actualizar', (ctx) => puerto.actualizar(ctx)),
    retirar: envolver<unknown>('retirar', (ctx) => puerto.retirar(ctx)),
    consultarEstado: envolver<{ estado?: string; externalId?: string }>('consultarEstado', (ctx) => puerto.consultarEstado(ctx)),
  };
  return { ok: true, adaptador };
}

/** Verificación de contrato para implementaciones sueltas (JS, mocks de test). */
export function auditarContratoAdaptador(candidato: unknown): { ok: boolean; faltan: OperacionAdaptador[]; portal?: PortalInmobiliario } {
  const c = candidato as Record<string, unknown> | null;
  const faltan = OPERACIONES_ADAPTADOR.filter((op) => typeof c?.[op] !== 'function');
  return { ok: faltan.length === 0, faltan, ...(typeof c?.portal === 'string' ? { portal: c.portal as PortalInmobiliario } : {}) };
}

/** Ejecuta una operación normalizando sync/async (utilidad para quien consume el contrato). */
export async function ejecutarOperacion<T>(
  adaptador: AdaptadorSindicacion,
  operacion: OperacionAdaptador,
  ctx: ContextoOperacion,
): Promise<ResultadoAdaptador<T>> {
  const fn = adaptador?.[operacion];
  if (typeof fn !== 'function') {
    return {
      ok: false,
      operacion,
      portal: adaptador?.portal || ('DESCONOCIDO' as PortalInmobiliario),
      error: { codigo: CODIGO_OPERACION_NO_IMPLEMENTADA, mensaje: `El adaptador no expone "${operacion}".` },
    };
  }
  return (await (fn as (c: ContextoOperacion) => ResultadoO_PROMESA<ResultadoAdaptador<T>>)(ctx)) as ResultadoAdaptador<T>;
}

export interface EstadoAdaptadorPortal {
  portal: PortalInmobiliario;
  nombre: string;
  modo: AdaptadorPortal['modo'];
  /** Capacidad de generación de feed ya existente (reutilizada, no duplicada). */
  soportaExportacion: boolean;
  /** Operaciones del contrato disponibles en la Fase 1. */
  disponibles: readonly OperacionAdaptador[];
  pendientes: readonly OperacionAdaptador[];
}

/** Panorama de los portales declarados en el ERP, sin condicionales por portal en el núcleo. */
export function estadoAdaptadores(): EstadoAdaptadorPortal[] {
  return ADAPTADORES_PORTAL.map((a) => ({
    portal: a.portal,
    nombre: a.nombre,
    modo: a.modo,
    soportaExportacion: a.modo === 'FEED_XML_GENERABLE',
    disponibles: ['validar'] as const,
    pendientes: ['publicar', 'actualizar', 'retirar', 'consultarEstado'] as const,
  }));
}

/** Registro de la Fase 1: un adaptador no-conectado por cada portal DECLARADO en el ERP. */
export const ADAPTADORES_SINDICACION_FASE1: Readonly<Record<string, AdaptadorSindicacion>> = Object.fromEntries(
  ADAPTADORES_PORTAL.map((a) => [a.portal, crearAdaptadorNoConectado(a.portal, a.nombre)]),
);

/** Delega la exportación en el generador existente del ERP (cero duplicación de feeds). */
export function exportarFeed(portal: PortalInmobiliario, publicaciones: PublicacionInmueble[]): {
  ok: boolean;
  formato?: string;
  contenido?: string;
  motivo?: string;
} {
  const adaptador = ADAPTADORES_PORTAL.find((a) => a.portal === portal);
  if (!adaptador) return { ok: false, motivo: `No hay adaptador declarado para ${portal} en publicacionPortales.ts.` };
  const salida = adaptador.generar(publicaciones);
  return { ok: salida.ok, ...(adaptador.formato ? { formato: adaptador.formato } : {}), ...(salida.contenido !== undefined ? { contenido: salida.contenido } : {}), ...(salida.motivo !== undefined ? { motivo: salida.motivo } : {}) };
}
