/**
 * GAP 5 · PERSISTENCIA DEL ESTADO DE SINDICACIÓN — capa de dominio (sin E/S propia).
 * ---------------------------------------------------------------------------------
 * Qué resuelve: que el ERP sepa, por `inmueble + portal`, en qué estado está la
 * publicación, qué VERSIÓN/HUELLA está publicada, cuál fue la última operación y con
 * qué resultado — y que eso sea recuperable de forma determinista.
 *
 * Composición, no otro motor:
 *   · la forma del dato la da `PublicacionInmueble` y el tipo canónico
 *     `EstadoSindicacionPortal` (NO se duplica: el registro lo EXTIENDE);
 *   · la acción la decide `resolverAccionSindicacion` (Fase 1) — aquí no hay ningún
 *     `if` que decida NUEVO/SIN_CAMBIOS/ACTUALIZAR/RETIRAR: sólo una TABLA que
 *     traduce la decisión a operación y a estado objetivo, igual para todos los
 *     portales;
 *   · la versión y la huella las da `calcularVersionPublicable` (Fase 1);
 *   · la máquina de estados es la del motor: `ESTADOS_PUBLICACION`,
 *     `transicionEstadoPublicacionPermitida` y `aplicarEstadoPublicacion`. Cuando el
 *     paso directo no está permitido se recorre el CAMINO MÁS CORTO sobre las
 *     transiciones del propio motor (BFS determinista): no se inventan transiciones;
 *   · el historial NO crea una auditoría paralela: se emite por el canal canónico del
 *     ERP (`audit_logs`, mediante el `AuditWriter` inyectable que ya usan Tesorería y
 *     Morosidad) y su payload lo fabrica `registrarTrazabilidadPublicacion` (motor);
 *   · la huella de un estado reutiliza `hashEstable` + `jsonDeterminista`.
 *
 * Todo el I/O pasa por `PuertoEstadoSindicacion`: en los tests se inyecta memoria; en
 * la app, `crearRepositorioEstadoSindicacionFirestore()` (src/lib/sindicacionFirestore.ts).
 * Este fichero NO importa Firebase, no hace red y no abre ficheros.
 *
 * Fechas: el ISO lo aporta SIEMPRE el llamador (`ctx.fecha`): el dominio no tiene reloj
 * (mismo invariante que en la Fase 1) y repetir la llamada con el mismo contexto da el
 * mismo resultado. La fecha NUNCA entra en la huella del estado ⇒ no provoca
 * reescrituras inútiles.
 */
import type {
  EstadoPublicacionPortal,
  EstadoSindicacionPortal,
  PortalInmobiliario,
  PublicacionInmueble,
  RegistroTrazabilidadPublicacion,
  ValidacionPublicacion,
} from '../types';
import {
  ESTADOS_PUBLICACION,
  aplicarEstadoPublicacion,
  estadoSindicacionInicial,
  hashEstable,
  identidadPublicacionPortal,
  registrarTrazabilidadPublicacion,
  transicionEstadoPublicacionPermitida,
} from '../utils/publicacionEngine';
import { jsonDeterminista } from '../utils/publicacionJson';
import type { AccionSindicacion, DecisionSindicacion } from './idempotencia';
import type { ResultadoAdaptador } from './adaptadores';
import { codigosDeValidacion, validarModeloPublicable } from './validacion';
import { identidadEnPortal, type VersionPublicable } from './hashContenido';

/** Nombre lógico de la colección del estado actual (la implementa el puerto). */
export const COLECCION_ESTADO_SINDICACION = 'sindicacion_inmuebles' as const;

/** Versión del esquema persistido: los lectores pueden detectar documentos antiguos. */
export const ESQUEMA_ESTADO_SINDICACION = 1 as const;

export type OperacionSindicacionRegistrada =
  | 'inicializar'
  | 'validar'
  | 'publicar'
  | 'actualizar'
  | 'retirar'
  | 'consultarEstado'
  | 'sin_envio';

export type ResultadoOperacionSindicacion = 'OK' | 'ERROR' | 'BLOQUEADO' | 'SIN_CAMBIOS' | 'RECHAZADO';

export type ResultadoEscritura = 'CREADO' | 'ACTUALIZADO' | 'SIN_CAMBIOS' | 'RECHAZADO';

/**
 * Estado de sindicación PERSISTIDO de un (inmueble, portal).
 * Extiende el tipo canónico del ERP: `portal`, `externalId`, `estado`,
 * `ultimaSincronizacion` y `ultimoError` siguen siendo los del motor, así que la UI
 * y el motor pueden consumir este registro SIN adaptación.
 */
export interface RegistroEstadoSindicacion extends EstadoSindicacionPortal {
  /** Id del documento: ES el `externalId` (determinista ⇒ imposible duplicar el par). */
  id: string;
  /** Clave lógica `PORTAL:inmuebleId` (identidad de la Fase 1). */
  clave: string;
  inmuebleId: string;
  idPublico?: string;
  /** Propietario del inmueble: campo de aislamiento, invariante como en los otros bloques. */
  propietarioId?: string;
  referenciaInterna?: string;
  /** Versión publicable publicada (contador de la Fase 1). */
  version?: number;
  etiquetaVersion?: string;
  /** Huella sha256 del contenido publicado: con esto se sabe QUÉ versión está fuera. */
  hashContenido?: string;
  ultimaOperacion?: OperacionSindicacionRegistrada;
  ultimoResultado?: ResultadoOperacionSindicacion;
  /** Id que el portal dé al anuncio (si lo devuelve): se guarda aparte, el `externalId`
   *  del ERP es el identificador estable y no se sustituye nunca por uno del portal. */
  idAnuncioPortal?: string;
  /** Código del último error del adaptador (el texto vive en `ultimoError`). */
  ultimoCodigo?: string;
  /** Códigos estables (no textos): lo que decide la Fase 1. */
  bloqueos?: string[];
  advertencias?: string[];
  /** Operaciones registradas sobre esta clave (compacto; el detalle está en la auditoría). */
  operacionesRegistradas: number;
  creadoEn: string;
  actualizadoEn: string;
  esquema: number;
}

/** Evento de historial (append-only) que el puerto envía al canal de auditoría. */
export interface EventoSindicacion {
  id: string;
  inmuebleId: string;
  idPublico: string;
  portal: PortalInmobiliario;
  externalId: string;
  operacion: OperacionSindicacionRegistrada;
  accion: AccionSindicacion;
  estadoAnterior?: EstadoPublicacionPortal;
  estado: EstadoPublicacionPortal;
  pasosAplicados: number;
  resultado: ResultadoOperacionSindicacion;
  version?: number;
  etiquetaVersion?: string;
  hashContenido?: string;
  errores: string[];
  advertencias: string[];
  mensaje?: string;
  fecha: string;
}

/** El único canal de I/O de esta capa. Tests: memoria. App: Firestore. */
export interface PuertoEstadoSindicacion {
  leerEstado(inmuebleId: string, portal: PortalInmobiliario): Promise<RegistroEstadoSindicacion | null>;
  listarEstados(inmuebleId: string): Promise<RegistroEstadoSindicacion[]>;
  /** Escribe en `registro.id`; informa si era nuevo o preexistente. */
  escribirEstado(registro: RegistroEstadoSindicacion): Promise<'CREADO' | 'ACTUALIZADO'>;
  /** Canal canónico de auditoría. Opcional: sin writer no hay historial (el estado sí). */
  registrarEvento?(evento: EventoSindicacion, trazabilidad: RegistroTrazabilidadPublicacion | null): Promise<void> | void;
  /**
   * Escucha los cambios del estado de un inmueble. Es OPCIONAL a propósito: el dominio
   * nunca depende de ella (hydrate + relee), así que un puerto de test o de importación
   * masiva puede no tener listener. Quien la implementa DEBE devolver el `unsubscribe`
   * y no emitir después de él (lo exige `sindicacionFirestore.ts` y lo vigila el test
   * del circuito del panel).
   */
  suscribirEstados?(inmuebleId: string, callback: (estados: RegistroEstadoSindicacion[]) => void): () => void;
}

export interface ContextoPersistencia {
  puerto: PuertoEstadoSindicacion;
  /**
   * ISO OBLIGATORIO: el dominio no tiene reloj (es el invariante de la Fase 1 que
   * vigila su test E.2). Quien persiste aporta la marca de tiempo, así que repetir la
   * llamada con el mismo contexto produce exactamente el mismo resultado.
   */
  fecha: string;
  actor?: { id?: string; nombre?: string; email?: string } | null;
}

// ===========================================================================
// TABLA DECISIÓN → OPERACIÓN/ESTADO (sin portales, sin ifs de decisión)
// ===========================================================================

interface ObjetivoPorAccion {
  operacion: OperacionSindicacionRegistrada;
  ok: EstadoPublicacionPortal;
  error: EstadoPublicacionPortal;
  /** true ⇒ corresponde ejecutar el puerto del portal. */
  envia: boolean;
}

/**
 * Hito LOCAL del panel (validar / generar feed): no hay envío al portal, así que
 * `envia:false` ⇒ nunca se estampa una versión como publicada. El éxito deja el
 * contenido en `LISTO_PARA_PUBLICAR`; el fracaso, en `ERROR` (transiciones que el
 * motor sí permite). No es una nueva decisión: es la misma tabla con un objetivo
 * declarado por el dominio, y sólo la aporta `registrarValidacionSindicacion`.
 */
const OBJETIVO_HITO_LOCAL: ObjetivoPorAccion = {
  operacion: 'validar',
  ok: 'LISTO_PARA_PUBLICAR',
  error: 'ERROR',
  envia: false,
};

/** La acción de la Fase 1 se traduce IGUAL para todos los portales. */
export const OBJETIVO_POR_ACCION: Readonly<Record<AccionSindicacion, ObjetivoPorAccion>> = {
  NUEVO: { operacion: 'publicar', ok: 'PUBLICADO', error: 'ERROR', envia: true },
  ACTUALIZAR: { operacion: 'actualizar', ok: 'ACTUALIZADO', error: 'ERROR', envia: true },
  RETIRAR: { operacion: 'retirar', ok: 'DESPUBLICADO', error: 'ERROR', envia: true },
  SIN_CAMBIOS: { operacion: 'sin_envio', ok: 'PUBLICADO', error: 'PUBLICADO', envia: false },
  BLOQUEADO: { operacion: 'sin_envio', ok: 'BORRADOR', error: 'BORRADOR', envia: false },
};

/** Camino MÁS CORTO entre dos estados usando SÓLO las transiciones del motor. */
export function caminoDeEstados(des: EstadoPublicacionPortal, hasta: EstadoPublicacionPortal): EstadoPublicacionPortal[] {
  if (des === hasta) return [];
  const previo = new Map<EstadoPublicacionPortal, EstadoPublicacionPortal | null>();
  const cola: EstadoPublicacionPortal[] = [des];
  previo.set(des, null);
  while (cola.length > 0) {
    const actual = cola.shift() as EstadoPublicacionPortal;
    for (const siguiente of ESTADOS_PUBLICACION) {
      if (previo.has(siguiente) || !transicionEstadoPublicacionPermitida(actual, siguiente)) continue;
      previo.set(siguiente, actual);
      if (siguiente === hasta) {
        const camino: EstadoPublicacionPortal[] = [];
        let cur: EstadoPublicacionPortal | null = siguiente;
        while (cur && cur !== des) {
          camino.unshift(cur);
          cur = previo.get(cur) ?? null;
        }
        return camino;
      }
      cola.push(siguiente);
    }
  }
  return [];
}

/** Avanza de estado a estado aplicando la autoridad del motor (`aplicarEstadoPublicacion`). */
export function avanzarEstadoHasta(
  estadoActual: EstadoPublicacionPortal,
  objetivo: EstadoPublicacionPortal,
  opts: { portal: PortalInmobiliario; externalId?: string; ultimoError?: string; fecha?: string },
): { ok: boolean; estado: EstadoPublicacionPortal; pasos: number; error?: string } {
  const camino = caminoDeEstados(estadoActual, objetivo);
  if (estadoActual !== objetivo && camino.length === 0) {
    return {
      ok: false,
      estado: estadoActual,
      pasos: 0,
      error: `Transición no permitida por el motor: ${estadoActual} → ${objetivo}.`,
    };
  }
  let registro: EstadoSindicacionPortal = {
    portal: opts.portal,
    externalId: opts.externalId || identidadPublicacionPortal('', opts.portal).externalId,
    estado: estadoActual,
  };
  let pasos = 0;
  for (const siguiente of camino) {
    const aplicado = aplicarEstadoPublicacion(registro, siguiente, {
      ...(siguiente === 'ERROR' && opts.ultimoError ? { ultimoError: opts.ultimoError } : {}),
      ...(opts.fecha ? { fecha: opts.fecha } : {}),
    });
    if (!aplicado.ok || !aplicado.registro) {
      return { ok: false, estado: registro.estado, pasos, error: aplicado.error };
    }
    registro = aplicado.registro;
    pasos++;
  }
  return { ok: true, estado: objetivo, pasos };
}

// ===========================================================================
// HUELLA DEL ESTADO (idempotencia de la persistencia: no reescribir lo idéntico)
// ===========================================================================

/** Claves que DEFINEN el estado. El tiempo y los contadores no lo hacen. */
export const CLAVES_DE_ESTADO: readonly string[] = [
  'estado',
  'externalId',
  'version',
  'etiquetaVersion',
  'hashContenido',
  'ultimaOperacion',
  'ultimoResultado',
  'ultimoCodigo',
  'idAnuncioPortal',
  'bloqueos',
  'advertencias',
  'ultimoError',
];

/** Subconjunto canónico del registro: con esto se decide si hay que escribir. */
export function proyeccionDeEstado(registro: RegistroEstadoSindicacion): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const clave of CLAVES_DE_ESTADO) {
    const valor = (registro as unknown as Record<string, unknown>)[clave];
    if (valor === undefined || valor === null || valor === '' || (Array.isArray(valor) && valor.length === 0)) continue;
    salida[clave] = Array.isArray(valor) ? [...valor].sort() : valor;
  }
  return salida;
}

/** Huella del estado (reutiliza `hashEstable` + `jsonDeterminista`: cero hashes nuevos). */
export function huellaDeEstado(registro: RegistroEstadoSindicacion): string {
  return hashEstable(jsonDeterminista(proyeccionDeEstado(registro)));
}

export function estadosIguales(a: RegistroEstadoSindicacion, b: RegistroEstadoSindicacion): boolean {
  return huellaDeEstado(a) === huellaDeEstado(b);
}

// ===========================================================================
// INVARIANTES ANTES DE ESCRIBIR
// ===========================================================================

export interface VerificacionInvariante {
  ok: boolean;
  errores: string[];
}

/**
 * La identidad la fija el núcleo: el id del documento ES el `externalId` y la clave
 * ES `PORTAL:inmuebleId`. Si algo no cuadra no se escribe ⇒ es estructuralmente
 * imposible tener dos estados "actuales" para el mismo inmueble+portal.
 */
export function verificarInvariantesDelRegistro(registro: RegistroEstadoSindicacion): VerificacionInvariante {
  const errores: string[] = [];
  const identidad = identidadPublicacionPortal(registro.inmuebleId, registro.portal);
  if (!registro.inmuebleId) errores.push('INVARIANTE_INMUEBLE_ID: falta el inmuebleId.');
  if (registro.clave !== identidad.clave) errores.push(`INVARIANTE_CLAVE: "${registro.clave}" ≠ "${identidad.clave}".`);
  if (registro.externalId !== identidad.externalId) {
    errores.push(`INVARIANTE_EXTERNAL_ID: "${registro.externalId}" ≠ "${identidad.externalId}".`);
  }
  if (registro.id !== registro.externalId) errores.push(`INVARIANTE_ID_DOCUMENTO: el id "${registro.id}" debe ser el externalId.`);
  if (!ESTADOS_PUBLICACION.includes(registro.estado)) errores.push(`INVARIANTE_ESTADO: "${registro.estado}" no es un estado del motor.`);
  if (typeof registro.hashContenido === 'string' && registro.hashContenido.length !== 64) {
    errores.push('INVARIANTE_HASH: la huella publicada debe medir 64 caracteres.');
  }
  if (registro.esquema !== ESQUEMA_ESTADO_SINDICACION) errores.push(`INVARIANTE_ESQUEMA: esperado ${ESQUEMA_ESTADO_SINDICACION}.`);
  return { ok: errores.length === 0, errores };
}

// ===========================================================================
// CONSTRUCCIÓN DEL REGISTRO Y DEL EVENTO (puras)
// ===========================================================================

export function construirRegistroEstado(params: {
  portal: PortalInmobiliario;
  inmuebleId: string;
  estado: EstadoPublicacionPortal;
  operacion: OperacionSindicacionRegistrada;
  resultado: ResultadoOperacionSindicacion;
  fecha: string;
  publicacion?: PublicacionInmueble;
  decision?: DecisionSindicacion;
  version?: VersionPublicable;
  externalId?: string;
  propietarioId?: string;
  ultimoError?: string;
  codigoError?: string;
  idAnuncioPortal?: string;
  bloqueos?: string[];
  advertencias?: string[];
  anterior?: RegistroEstadoSindicacion;
}): RegistroEstadoSindicacion {
  const identidad = identidadEnPortal(params.inmuebleId, params.portal);
  const pub = params.publicacion;
  const externalId = params.externalId || params.decision?.externalId || identidad.externalId;
  // `version` la aporta SIEMPRE el llamador con criterio: la que quedó PUBLICADA.
  // No se toma a ciegas de la decisión, porque la decisión lleva la versión
  // PROSPECTIVA (la que se intentó) y en un fallo/bloqueo eso mentiría.
  const version = params.version;
  const registro: RegistroEstadoSindicacion = {
    id: externalId,
    clave: identidad.clave,
    inmuebleId: params.inmuebleId,
    portal: params.portal,
    externalId,
    estado: params.estado,
    ultimaSincronizacion: params.fecha,
    ultimaOperacion: params.operacion,
    ultimoResultado: params.resultado,
    operacionesRegistradas: (params.anterior?.operacionesRegistradas || 0) + 1,
    creadoEn: params.anterior?.creadoEn || params.fecha,
    actualizadoEn: params.fecha,
    esquema: ESQUEMA_ESTADO_SINDICACION,
  };
  if (pub?.idPublico) registro.idPublico = pub.idPublico;
  const propietario = params.propietarioId || pub?.propietarioId || params.anterior?.propietarioId;
  if (propietario) registro.propietarioId = propietario;
  if (pub?.referenciaInterna) registro.referenciaInterna = pub.referenciaInterna;
  if (version) {
    registro.version = version.numero;
    registro.etiquetaVersion = version.etiqueta;
    registro.hashContenido = version.hashContenido;
  } else if (params.anterior?.version !== undefined) {
    // Sin versión nueva se CONSERVA la publicada: es lo que sigue vivo en el portal.
    registro.version = params.anterior.version;
    if (params.anterior.etiquetaVersion) registro.etiquetaVersion = params.anterior.etiquetaVersion;
    if (params.anterior.hashContenido) registro.hashContenido = params.anterior.hashContenido;
  }
  if (params.ultimoError) registro.ultimoError = params.ultimoError;
  if (params.codigoError) registro.ultimoCodigo = params.codigoError;
  else if (params.anterior?.ultimoCodigo && params.resultado === 'OK') delete registro.ultimoCodigo;
  const idPortal = params.idAnuncioPortal || params.anterior?.idAnuncioPortal;
  if (idPortal) registro.idAnuncioPortal = idPortal;
  const validacion = params.decision?.validacion;
  const bloqueos = params.bloqueos ?? (validacion ? codigosDeValidacion(validacion, 'BLOQUEANTE') : params.decision?.bloqueos ?? []);
  if (bloqueos.length > 0) registro.bloqueos = [...bloqueos].sort();
  const advertencias = params.advertencias ?? (validacion ? codigosDeValidacion(validacion, 'ADVERTENCIA') : params.decision?.advertencias ?? []);
  if (advertencias.length > 0) registro.advertencias = [...advertencias].sort();
  return registro;
}

/** Trazabilidad del evento: la fabrica el motor, con la validación real (mensajes literales). */
export function construirTrazabilidadDelEvento(params: {
  publicacion: PublicacionInmueble;
  portal: PortalInmobiliario;
  externalId: string;
  fecha: string;
  validacion?: ValidacionPublicacion;
}): RegistroTrazabilidadPublicacion {
  const validacion = params.validacion || { valido: true, erroresBloqueantes: [], advertencias: [] };
  return registrarTrazabilidadPublicacion(params.publicacion, params.portal, 'JSON_NORMALIZADO', validacion, params.externalId, params.fecha);
}

/** Id determinista del evento: el mismo cambio de estado produce el mismo id (nada de duplicar historial). */
export function idDelEvento(e: Omit<EventoSindicacion, 'id'>): string {
  const semilla = jsonDeterminista({
    externalId: e.externalId,
    operacion: e.operacion,
    estado: e.estado,
    version: e.version ?? null,
    hashContenido: e.hashContenido ?? null,
    resultado: e.resultado,
  });
  return `${e.externalId}__${e.operacion}__${hashEstable(semilla)}`;
}

// ===========================================================================
// CASOS DE USO
// ===========================================================================

export interface ResultadoOperacionPersistida {
  inmuebleId: string;
  portal: PortalInmobiliario;
  clave: string;
  externalId: string;
  accion: AccionSindicacion;
  operacion: OperacionSindicacionRegistrada;
  /** true ⇒ la operación correspondiente llegará/alcanzó al puerto del portal. */
  ejecutoPuerto: boolean;
  escritura: ResultadoEscritura;
  motivo: string;
  estadoAnterior?: EstadoPublicacionPortal;
  estado: EstadoPublicacionPortal;
  version?: number;
  etiquetaVersion?: string;
  hashContenido?: string;
  bloqueos: string[];
  advertencias: string[];
  registro?: RegistroEstadoSindicacion;
  evento?: EventoSindicacion;
  trazabilidad?: RegistroTrazabilidadPublicacion | null;
  invariantes: VerificacionInvariante;
  pasosDeEstado: number;
  huellaEstado: string;
  resumen: string;
}

function fechaDe(ctx: ContextoPersistencia): string {
  return ctx.fecha;
}

/** Estado inicial (BORRADOR) por portal. Idempotente: si ya existe, no escribe. */
export async function crearEstadoInicialSindicacion(
  params: { inmuebleId: string; portales: PortalInmobiliario[]; publicacion?: PublicacionInmueble; propietarioId?: string },
  ctx: ContextoPersistencia,
): Promise<{ creados: PortalInmobiliario[]; preexistentes: PortalInmobiliario[]; resultados: ResultadoOperacionPersistida[] }> {
  const fecha = fechaDe(ctx);
  const iniciales = estadoSindicacionInicial(params.inmuebleId, params.portales);
  const creados: PortalInmobiliario[] = [];
  const preexistentes: PortalInmobiliario[] = [];
  const resultados: ResultadoOperacionPersistida[] = [];
  for (const inicial of iniciales) {
    const anterior = await ctx.puerto.leerEstado(params.inmuebleId, inicial.portal);
    if (anterior) {
      preexistentes.push(inicial.portal);
      continue;
    }
    const registro = construirRegistroEstado({
      portal: inicial.portal,
      inmuebleId: params.inmuebleId,
      estado: 'BORRADOR',
      operacion: 'inicializar',
      resultado: 'OK',
      externalId: inicial.externalId,
      fecha,
      ...(params.publicacion ? { publicacion: params.publicacion } : {}),
      ...(params.propietarioId ? { propietarioId: params.propietarioId } : {}),
    });
    const invariantes = verificarInvariantesDelRegistro(registro);
    if (!invariantes.ok) {
      resultados.push({
        inmuebleId: params.inmuebleId,
        portal: inicial.portal,
        clave: registro.clave,
        externalId: registro.externalId,
        accion: 'BLOQUEADO',
        operacion: 'inicializar',
        ejecutoPuerto: false,
        escritura: 'RECHAZADO',
        motivo: 'Invariantes de identidad incumplidos: no se escribe.',
        estado: 'BORRADOR',
        bloqueos: [],
        advertencias: [],
        registro,
        trazabilidad: null,
        invariantes,
        pasosDeEstado: 0,
        huellaEstado: huellaDeEstado(registro),
        resumen: `${inicial.portal}: rechazo por invariantes.`,
      });
      continue;
    }
    const escritura = await ctx.puerto.escribirEstado(registro);
    const eventoBase: Omit<EventoSindicacion, 'id'> = {
      inmuebleId: params.inmuebleId,
      idPublico: params.publicacion?.idPublico || '',
      portal: inicial.portal,
      externalId: registro.externalId,
      operacion: 'inicializar',
      accion: 'SIN_CAMBIOS',
      estado: 'BORRADOR',
      pasosAplicados: 0,
      resultado: 'OK',
      errores: [],
      advertencias: [],
      mensaje: `Estado inicial de sindicación creado en ${inicial.portal}.`,
      fecha,
    };
    const evento: EventoSindicacion = { ...eventoBase, id: idDelEvento(eventoBase) };
    await ctx.puerto.registrarEvento?.(evento, null);
    creados.push(inicial.portal);
    resultados.push({
      inmuebleId: params.inmuebleId,
      portal: inicial.portal,
      clave: registro.clave,
      externalId: registro.externalId,
      accion: 'SIN_CAMBIOS',
      operacion: 'inicializar',
      ejecutoPuerto: false,
      escritura,
      motivo: 'Registro inicial creado (BORRADOR).',
      estado: 'BORRADOR',
      bloqueos: [],
      advertencias: [],
      registro,
      evento,
      trazabilidad: null,
      invariantes,
      pasosDeEstado: 0,
      huellaEstado: huellaDeEstado(registro),
      resumen: `${inicial.portal}·${params.inmuebleId}: BORRADOR (estado inicial).`,
    });
  }
  return { creados, preexistentes, resultados };
}

export interface ParamsRegistrarResultado {
  /** Decisión de la Fase 1: la ÚNICA fuente de la acción. */
  decision: DecisionSindicacion;
  /** Resultado del adaptador. Ausente ⇒ el puerto no se ejecutó (BLOQUEADO/SIN_CAMBIOS). */
  resultadoAdaptador?: ResultadoAdaptador;
  /** Payload publicable: identidad, propietario y trazabilidad. */
  publicacion?: PublicacionInmueble;
  /**
   * Hito declarado por el propio dominio (nunca por un publicador): 'validar' ⇒ el
   * objetivo sale de `OBJETIVO_HITO_LOCAL` en lugar de la tabla de acciones. Sin él,
   * manda la decisión de la Fase 1 y no hay forma de forzar un estado desde fuera.
   */
  hito?: 'validar';
}

/**
 * Persistir el resultado de una operación. Punto único de verdad: los registradores
 * específicos delegan aquí, así que la traducción decisión→estado, los invariantes,
 * la comparación de huellas y el append del evento no pueden desviarse entre sí.
 */
export async function registrarResultadoSindicacion(params: ParamsRegistrarResultado, ctx: ContextoPersistencia): Promise<ResultadoOperacionPersistida> {
  const { decision, resultadoAdaptador, publicacion } = params;
  const fecha = fechaDe(ctx);
  const objetivo = params.hito === 'validar' ? OBJETIVO_HITO_LOCAL : OBJETIVO_POR_ACCION[decision.accion];
  const portal = decision.portal;
  const anterior = await ctx.puerto.leerEstado(decision.inmuebleId, portal);
  const estadoBase: EstadoPublicacionPortal = anterior?.estado || 'BORRADOR';
  const ejecutoPuerto = Boolean(resultadoAdaptador) && objetivo.envia;
  const ok = resultadoAdaptador ? resultadoAdaptador.ok : decision.accion === 'BLOQUEADO' ? false : true;

  let estadoObjetivo: EstadoPublicacionPortal;
  let motivo: string;
  if (decision.accion === 'BLOQUEADO') {
    // Un bloqueo NO cambia lo publicado: deja el estado anterior y anota el intento.
    estadoObjetivo = estadoBase;
    motivo = `Contenido no publicable: se registra el bloqueo sin alterar el estado publicado.`;
  } else if (decision.accion === 'SIN_CAMBIOS') {
    estadoObjetivo = estadoBase;
    motivo = 'Decisión SIN_CAMBIOS: el estado publicado sigue siendo el correcto.';
  } else if (ok) {
    const publicadoVivo = estadoBase === 'PUBLICADO' || estadoBase === 'ACTUALIZADO';
    // Un hito local (validar, sin envío) NO puede borrar el hecho de que hay algo
    // publicado: registra la operación SOBRE el estado publicado, no lo revierte.
    if (!objetivo.envia && publicadoVivo) {
      estadoObjetivo = estadoBase;
      motivo = `Hito ${objetivo.operacion} registrado sin alterar lo publicado en ${portal}.`;
    } else {
      estadoObjetivo = objetivo.ok;
      motivo = `Operación ${objetivo.operacion} completada en ${portal}.`;
    }
  } else {
    estadoObjetivo = objetivo.error;
    motivo = `Operación ${objetivo.operacion} falló en ${portal}.`;
  }

  // SIN_CAMBIOS no es una operación: es la ausencia de ella. No se escribe ni se
  // emite historial (registrar un no-op sería reescribir el estado con otro timestamp).
  if (decision.accion === 'SIN_CAMBIOS') {
    return {
      inmuebleId: decision.inmuebleId,
      portal,
      clave: decision.claveIdentidad,
      externalId: decision.externalId,
      accion: decision.accion,
      operacion: objetivo.operacion,
      ejecutoPuerto: false,
      escritura: 'SIN_CAMBIOS',
      motivo,
      ...(anterior ? { estadoAnterior: anterior.estado } : {}),
      estado: estadoBase,
      ...(anterior?.version !== undefined ? { version: anterior.version } : {}),
      ...(anterior?.hashContenido ? { hashContenido: anterior.hashContenido } : {}),
      bloqueos: [...(decision.bloqueos || [])],
      advertencias: [...(decision.advertencias || [])],
      ...(anterior ? { registro: anterior } : {}),
      trazabilidad: null,
      invariantes: { ok: true, errores: [] },
      pasosDeEstado: 0,
      huellaEstado: anterior ? huellaDeEstado(anterior) : '',
      resumen: `${portal}·${decision.inmuebleId}: ${estadoBase} (sin escritura: contenido idéntico al publicado).`,
    };
  }

  const avance = avanzarEstadoHasta(estadoBase, estadoObjetivo, {
    portal,
    externalId: decision.externalId,
    ...(ok ? {} : { ultimoError: resultadoAdaptador?.error?.mensaje || resultadoAdaptador?.error?.codigo }),
    ...(ctx.fecha ? { fecha: ctx.fecha } : {}),
  });
  if (!avance.ok) {
    const huella = anterior ? huellaDeEstado(anterior) : '';
    return {
      inmuebleId: decision.inmuebleId,
      portal,
      clave: decision.claveIdentidad,
      externalId: decision.externalId,
      accion: decision.accion,
      operacion: objetivo.operacion,
      ejecutoPuerto,
      escritura: 'RECHAZADO',
      motivo: `El motor rechaza la transición necesaria: ${avance.error} No se escribe el estado.`,
      ...(anterior ? { estadoAnterior: anterior.estado } : {}),
      estado: estadoBase,
      bloqueos: [...(decision.bloqueos || [])],
      advertencias: [...(decision.advertencias || [])],
      ...(anterior ? { registro: anterior } : {}),
      trazabilidad: null,
      invariantes: { ok: false, errores: [avance.error || 'TRANSICION_NO_PERMITIDA'] },
      pasosDeEstado: avance.pasos,
      huellaEstado: huella,
      resumen: `${portal}·${decision.inmuebleId}: transición rechazada (${avance.error || 'sin camino'}).`,
    };
  }

  const registro = construirRegistroEstado({
    portal,
    inmuebleId: decision.inmuebleId,
    estado: estadoObjetivo,
    operacion: objetivo.operacion,
    // (SIN_CAMBIOS ya devolvió arriba: aquí sólo hay operación enviada o bloqueo)
    resultado: decision.accion === 'BLOQUEADO' ? 'BLOQUEADO' : ok ? 'OK' : 'ERROR',
    fecha,
    decision,
    // sólo si la operación llegó al portal y tuvo éxito la versión pasa a estar publicada
    ...(objetivo.envia && ok ? { version: decision.version } : {}),
    ...(publicacion ? { publicacion } : {}),
    ...(anterior ? { anterior } : {}),
    ...(ok ? {} : { ultimoError: resultadoAdaptador?.error?.mensaje || resultadoAdaptador?.error?.codigo || 'ERROR_ADAPTADOR' }),
    ...(!ok && resultadoAdaptador?.error?.codigo ? { codigoError: resultadoAdaptador.error.codigo } : {}),
    ...(resultadoAdaptador?.externalId && resultadoAdaptador.externalId !== decision.externalId
      ? { idAnuncioPortal: resultadoAdaptador.externalId }
      : {}),
  });
  const invariantes = verificarInvariantesDelRegistro(registro);
  if (!invariantes.ok) {
    return {
      inmuebleId: decision.inmuebleId,
      portal,
      clave: registro.clave,
      externalId: registro.externalId,
      accion: decision.accion,
      operacion: objetivo.operacion,
      ejecutoPuerto,
      escritura: 'RECHAZADO',
      motivo: 'No se escribe: los invariantes del registro no se cumplen.',
      ...(anterior ? { estadoAnterior: anterior.estado } : {}),
      estado: estadoObjetivo,
      bloqueos: [...(registro.bloqueos || [])],
      advertencias: [...(registro.advertencias || [])],
      registro,
      trazabilidad: null,
      invariantes,
      pasosDeEstado: avance.pasos,
      huellaEstado: huellaDeEstado(registro),
      resumen: `${portal}·${decision.inmuebleId}: rechazo por invariantes.`,
    };
  }

  const huellaEstado = huellaDeEstado(registro);
  const cambia = !anterior || huellaDeEstado(anterior) !== huellaEstado;
  let escritura: ResultadoEscritura = 'SIN_CAMBIOS';
  if (cambia) escritura = await ctx.puerto.escribirEstado(registro);

  const eventoBase: Omit<EventoSindicacion, 'id'> = {
    inmuebleId: decision.inmuebleId,
    idPublico: publicacion?.idPublico || '',
    portal,
    externalId: registro.externalId,
    operacion: objetivo.operacion,
    accion: decision.accion,
    ...(anterior ? { estadoAnterior: anterior.estado } : {}),
    estado: estadoObjetivo,
    pasosAplicados: avance.pasos,
    resultado: registro.ultimoResultado || 'OK',
    ...(registro.version !== undefined ? { version: registro.version } : {}),
    ...(registro.etiquetaVersion ? { etiquetaVersion: registro.etiquetaVersion } : {}),
    ...(registro.hashContenido ? { hashContenido: registro.hashContenido } : {}),
    errores: [...(registro.bloqueos || [])],
    advertencias: [...(registro.advertencias || [])],
    mensaje: registro.ultimoError || decision.resumen || motivo,
    fecha,
  };
  const evento: EventoSindicacion = { ...eventoBase, id: idDelEvento(eventoBase) };
  const trazabilidad =
    publicacion && cambia
      ? construirTrazabilidadDelEvento({
          publicacion,
          portal,
          externalId: registro.externalId,
          fecha,
          validacion: decision.validacion.origen,
        })
      : null;
  if (cambia) await ctx.puerto.registrarEvento?.(evento, trazabilidad);

  return {
    inmuebleId: decision.inmuebleId,
    portal,
    clave: registro.clave,
    externalId: registro.externalId,
    accion: decision.accion,
    operacion: objetivo.operacion,
    ejecutoPuerto,
    escritura,
    motivo: cambia ? motivo : `${motivo} El estado persistido ya era idéntico: escritura evitada.`,
    ...(anterior ? { estadoAnterior: anterior.estado } : {}),
    estado: estadoObjetivo,
    ...(registro.version !== undefined ? { version: registro.version } : {}),
    ...(registro.etiquetaVersion ? { etiquetaVersion: registro.etiquetaVersion } : {}),
    ...(registro.hashContenido ? { hashContenido: registro.hashContenido } : {}),
    bloqueos: [...(registro.bloqueos || [])],
    advertencias: [...(registro.advertencias || [])],
    registro,
    evento,
    trazabilidad,
    invariantes,
    pasosDeEstado: avance.pasos,
    huellaEstado,
    resumen: `${portal}·${decision.inmuebleId}: ${estadoObjetivo}${registro.version !== undefined ? ` v${registro.version}` : ''} → ${escritura}.`,
  };
}

// ---------------------------------------------------------------------------
// Registradores específicos: todos delegan en `registrarResultadoSindicacion`
// ---------------------------------------------------------------------------

export function registrarPublicacionSindicacion(params: ParamsRegistrarResultado, ctx: ContextoPersistencia) {
  return registrarResultadoSindicacion(params, ctx);
}
export function registrarActualizacionSindicacion(params: ParamsRegistrarResultado, ctx: ContextoPersistencia) {
  return registrarResultadoSindicacion(params, ctx);
}
export function registrarRetiradaSindicacion(params: ParamsRegistrarResultado, ctx: ContextoPersistencia) {
  return registrarResultadoSindicacion(params, ctx);
}
export function registrarErrorSindicacion(params: ParamsRegistrarResultado, ctx: ContextoPersistencia) {
  return registrarResultadoSindicacion(params, ctx);
}
export function registrarSinEnvioSindicacion(params: Omit<ParamsRegistrarResultado, 'resultadoAdaptador'>, ctx: ContextoPersistencia) {
  return registrarResultadoSindicacion(params, ctx);
}

/**
 * Hito del panel: se validó el contenido y se generó el feed, PERO no se llamó a ningún
 * portal. Se persiste el resultado real de esa operación local:
 *  · ok      → LISTO_PARA_PUBLICAR (o el estado publicado intacto si ya estaba fuera);
 *  · fallo   → ERROR con `ultimoError`/`ultimoCodigo`, sin tocar la versión publicada;
 *  · huella idéntica al estado persistido → SIN_CAMBIOS, cero escrituras y cero eventos.
 * La versión publicable NO se estampa aquí: sólo se estampa cuando un portal la acepta.
 */
export function registrarValidacionSindicacion(
  params: {
    decision: DecisionSindicacion;
    publicacion?: PublicacionInmueble;
    resultado: { ok: boolean; codigo?: string; mensaje?: string };
  },
  ctx: ContextoPersistencia,
) {
  const { decision, publicacion, resultado } = params;
  return registrarResultadoSindicacion(
    {
      decision,
      hito: 'validar',
      ...(publicacion ? { publicacion } : {}),
      // No es un adaptador real: es el resultado de la operación local, con la forma del
      // contrato para que el registrador decida ok/error exactamente igual que con un portal.
      resultadoAdaptador: {
        ok: resultado.ok,
        operacion: 'validar',
        portal: decision.portal,
        ...(decision.externalId ? { externalId: decision.externalId } : {}),
        ...(resultado.ok
          ? {}
          : { error: { codigo: resultado.codigo || 'HITO_LOCAL_FALLIDO', mensaje: resultado.mensaje || 'La operación local falló.' } }),
      },
    },
    ctx,
  );
}

/**
 * Recuperación posterior: un inmueble que estaba en ERROR vuelve a ser publicable.
 * El motor no permite ERROR → PUBLICADO, así que se registra la puesta a punto
 * (ERROR → LISTO_PARA_PUBLICAR); la publicación real la hace el siguiente ciclo.
 */
export async function registrarRecuperacionSindicacion(
  params: { decision: DecisionSindicacion; publicacion?: PublicacionInmueble },
  ctx: ContextoPersistencia,
): Promise<ResultadoOperacionPersistida> {
  const { decision, publicacion } = params;
  const fecha = fechaDe(ctx);
  const anterior = await ctx.puerto.leerEstado(decision.inmuebleId, decision.portal);
  const base = {
    inmuebleId: decision.inmuebleId,
    portal: decision.portal,
    clave: decision.claveIdentidad,
    externalId: decision.externalId,
    accion: decision.accion,
    operacion: 'validar' as OperacionSindicacionRegistrada,
    ejecutoPuerto: false,
    pasosDeEstado: 0,
    bloqueos: [...(decision.bloqueos || [])],
    advertencias: [...(decision.advertencias || [])],
    trazabilidad: null as RegistroTrazabilidadPublicacion | null,
  };
  if (!anterior) {
    return { ...base, escritura: 'SIN_CAMBIOS', motivo: 'No había estado que recuperar.', estado: 'BORRADOR', invariantes: { ok: true, errores: [] }, huellaEstado: '', resumen: `${decision.portal}: sin registro previo.` };
  }
  if (anterior.estado !== 'ERROR') {
    return { ...base, escritura: 'SIN_CAMBIOS', motivo: `Recuperación innecesaria: el estado es ${anterior.estado}, no ERROR.`, estadoAnterior: anterior.estado, estado: anterior.estado, registro: anterior, invariantes: { ok: true, errores: [] }, huellaEstado: huellaDeEstado(anterior), resumen: `${decision.portal}: ${anterior.estado} (sin cambio).` };
  }
  const avance = avanzarEstadoHasta('ERROR', 'LISTO_PARA_PUBLICAR', {
    portal: decision.portal,
    externalId: decision.externalId,
    ...(ctx.fecha ? { fecha: ctx.fecha } : {}),
  });
  const registro = construirRegistroEstado({
    portal: decision.portal,
    inmuebleId: decision.inmuebleId,
    estado: 'LISTO_PARA_PUBLICAR',
    operacion: 'validar',
    resultado: 'OK',
    fecha,
    decision,
    ...(publicacion ? { publicacion } : {}),
    anterior,
  });
  delete registro.ultimoError;
  delete registro.bloqueos;
  const invariantes = verificarInvariantesDelRegistro(registro);
  const escritura = await ctx.puerto.escribirEstado(registro);
  const eventoBase: Omit<EventoSindicacion, 'id'> = {
    inmuebleId: decision.inmuebleId,
    idPublico: publicacion?.idPublico || '',
    portal: decision.portal,
    externalId: registro.externalId,
    operacion: 'validar',
    accion: decision.accion,
    estadoAnterior: 'ERROR',
    estado: 'LISTO_PARA_PUBLICAR',
    pasosAplicados: avance.pasos,
    resultado: 'OK',
    ...(registro.version !== undefined ? { version: registro.version } : {}),
    ...(registro.hashContenido ? { hashContenido: registro.hashContenido } : {}),
    errores: [],
    advertencias: [...(registro.advertencias || [])],
    mensaje: 'Recuperación tras ERROR: la publicación vuelve a estar lista para publicar.',
    fecha,
  };
  const evento: EventoSindicacion = { ...eventoBase, id: idDelEvento(eventoBase) };
  await ctx.puerto.registrarEvento?.(evento, null);
  return {
    ...base,
    escritura,
    motivo: 'Estado recuperado de ERROR a LISTO_PARA_PUBLICAR.',
    estadoAnterior: 'ERROR',
    estado: 'LISTO_PARA_PUBLICAR',
    bloqueos: [],
    ...(registro.version !== undefined ? { version: registro.version } : {}),
    ...(registro.hashContenido ? { hashContenido: registro.hashContenido } : {}),
    registro,
    evento,
    invariantes,
    pasosDeEstado: avance.pasos,
    huellaEstado: huellaDeEstado(registro),
    resumen: `${decision.portal}·${decision.inmuebleId}: ERROR → LISTO_PARA_PUBLICAR (${escritura}).`,
  };
}

/** Actualización explícita de un estado (la vía del adaptador para informar sin decisión). */
export async function actualizarEstadoSindicacion(
  params: {
    inmuebleId: string;
    portal: PortalInmobiliario;
    estado: EstadoPublicacionPortal;
    operacion: OperacionSindicacionRegistrada;
    resultado: ResultadoOperacionSindicacion;
    publicacion?: PublicacionInmueble;
    version?: VersionPublicable;
    externalId?: string;
    ultimoError?: string;
  },
  ctx: ContextoPersistencia,
): Promise<ResultadoOperacionPersistida> {
  const fecha = fechaDe(ctx);
  const anterior = await ctx.puerto.leerEstado(params.inmuebleId, params.portal);
  const registro = construirRegistroEstado({
    portal: params.portal,
    inmuebleId: params.inmuebleId,
    estado: params.estado,
    operacion: params.operacion,
    resultado: params.resultado,
    fecha,
    ...(params.version ? { version: params.version } : {}),
    ...(params.externalId ? { externalId: params.externalId } : {}),
    ...(params.ultimoError ? { ultimoError: params.ultimoError } : {}),
    ...(params.publicacion ? { publicacion: params.publicacion } : {}),
    ...(anterior ? { anterior } : {}),
  });
  const invariantes = verificarInvariantesDelRegistro(registro);
  const base = {
    inmuebleId: params.inmuebleId,
    portal: params.portal,
    clave: registro.clave,
    externalId: registro.externalId,
    operacion: params.operacion,
    ejecutoPuerto: false,
    pasosDeEstado: 0,
    bloqueos: [...(registro.bloqueos || [])],
    advertencias: [...(registro.advertencias || [])],
    trazabilidad: null as RegistroTrazabilidadPublicacion | null,
    huellaEstado: huellaDeEstado(registro),
    ...(registro.version !== undefined ? { version: registro.version } : {}),
    ...(registro.hashContenido ? { hashContenido: registro.hashContenido } : {}),
    registro,
    ...(anterior ? { estadoAnterior: anterior.estado } : {}),
  };
  if (!invariantes.ok) {
    return { ...base, accion: 'BLOQUEADO', escritura: 'RECHAZADO', motivo: 'Invariantes incumplidos: no se escribe.', estado: registro.estado, invariantes, resumen: `${params.portal}: rechazo por invariantes.` };
  }
  const cambia = !anterior || !estadosIguales(anterior, registro);
  const escritura: ResultadoEscritura = cambia ? await ctx.puerto.escribirEstado(registro) : 'SIN_CAMBIOS';
  return {
    ...base,
    accion: 'SIN_CAMBIOS',
    escritura,
    motivo: cambia ? 'Estado actualizado.' : 'El estado ya contenía exactamente estos datos: sin escritura.',
    estado: params.estado,
    invariantes,
    resumen: `${params.portal}·${params.inmuebleId}: ${params.estado} → ${escritura}.`,
  };
}

// ===========================================================================
// LECTURA (resultado controlado cuando todavía no hay estado)
// ===========================================================================

export interface LecturaEstadosSindicacion {
  inmuebleId: string;
  estados: RegistroEstadoSindicacion[];
  total: number;
  vacio: boolean;
  motivo: 'CON_ESTADOS' | 'SIN_REGISTRO';
  porPortal: Partial<Record<PortalInmobiliario, RegistroEstadoSindicacion>>;
}

export async function leerEstadosSindicacion(inmuebleId: string, ctx: ContextoPersistencia): Promise<LecturaEstadosSindicacion> {
  const brutos = await ctx.puerto.listarEstados(inmuebleId);
  // Aislamiento defensivo: aunque el puerto devuelva de más, sólo se conserva lo del inmueble.
  const estados = brutos
    .filter((r) => Boolean(r) && r.inmuebleId === inmuebleId)
    .sort((a, b) => (a.portal < b.portal ? -1 : a.portal > b.portal ? 1 : 0));
  const porPortal: Partial<Record<PortalInmobiliario, RegistroEstadoSindicacion>> = {};
  for (const r of estados) porPortal[r.portal] = r;
  return {
    inmuebleId,
    estados,
    total: estados.length,
    vacio: estados.length === 0,
    motivo: estados.length === 0 ? 'SIN_REGISTRO' : 'CON_ESTADOS',
    porPortal,
  };
}

export interface LecturaEstadoPorPortal {
  encontrado: boolean;
  estado: RegistroEstadoSindicacion | null;
  motivo: 'ENCONTRADO' | 'SIN_REGISTRO';
  clave: string;
  externalId: string;
  /** Códigos de la validación actual, si el llamador aportó el payload. */
  bloqueosActuales?: string[];
  advertenciasActuales?: string[];
  publicable: boolean;
}

export async function leerEstadoSindicacionPorPortal(
  params: { inmuebleId: string; portal: PortalInmobiliario; publicacion?: PublicacionInmueble },
  ctx: ContextoPersistencia,
): Promise<LecturaEstadoPorPortal> {
  const identidad = identidadEnPortal(params.inmuebleId, params.portal);
  const estado = await ctx.puerto.leerEstado(params.inmuebleId, params.portal);
  const salida: LecturaEstadoPorPortal = {
    encontrado: Boolean(estado),
    estado: estado || null,
    motivo: estado ? 'ENCONTRADO' : 'SIN_REGISTRO',
    clave: identidad.clave,
    externalId: identidad.externalId,
    publicable: true,
  };
  if (params.publicacion) {
    const v = validarModeloPublicable(params.publicacion);
    const bloqueos = codigosDeValidacion(v, 'BLOQUEANTE');
    const advertencias = codigosDeValidacion(v, 'ADVERTENCIA');
    salida.publicable = bloqueos.length === 0;
    if (bloqueos.length > 0) salida.bloqueosActuales = bloqueos;
    if (advertencias.length > 0) salida.advertenciasActuales = advertencias;
  }
  return salida;
}

/** Resumen determinista, listo para log/UI, sin reconstruir nada. */
export function resumenDelEstado(r: RegistroEstadoSindicacion): string {
  const version = r.version !== undefined ? ` v${r.version}` : '';
  const huella = r.hashContenido ? ` ${r.hashContenido.slice(0, 8)}` : '';
  return `${r.portal}·${r.inmuebleId}: ${r.estado}${version}${huella}, ${r.ultimaOperacion || '—'}=${r.ultimoResultado || '—'}`;
}
