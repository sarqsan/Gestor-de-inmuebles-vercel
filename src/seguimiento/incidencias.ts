/**
 * FASE 6 — SEGUIMIENTO DE INCIDENCIAS (motor PURO, compartido cliente/servidor)
 * ============================================================================
 * Traduce un CAMBIO REAL de la incidencia (la instantánea autorizada que lee el
 * servidor de Firestore) en eventos de seguimiento deterministas. Es la única
 * pieza que decide:
 *
 *   · qué se considera un cambio real (estado, prioridad, evidencias o
 *     asignación) y qué NO genera evento (un guardado idéntico ⇒ sin ruido);
 *   · el id/clave de idempotencia de cada evento (reutiliza las claves canónicas
 *     de GAP 1, así el mismo suceso dos veces NO duplica nada);
 *   · a quién corresponde avisar de cada suceso (lista blanca por tipo);
 *   · cuándo una incidencia queda escalada (prioridad URGENTE/Alta sin trabajo
 *     asignado, o plazo vencido sin asignar).
 *
 * NO guarda texto libre: ni descripciones, ni nombres, ni importes. Sólo
 * códigos, estados, nombres de campo y contadores; las etiquetas se derivan en
 * la UI con `pasosEvolucionIncidencia`.
 *
 * Este módulo es puro (sin Firebase ni HTTP): lo usan el servidor
 * (`server/seguimiento/seguimientoIncidencias.ts`) y el portal del inquilino.
 */
import {
  idDeNotificacion,
  idempotenciaDeEvento,
  normalizarClave,
} from '../types/notificaciones.js';

/** Colección de los hilos de seguimiento (una por incidencia). Sólo servidor. */
export const COLECCION_SEGUIMIENTO_INCIDENCIAS = 'incidencias_seguimiento';

/** Tope de eventos conservados por hilo (los más recientes). */
export const MAX_EVENTOS_HILO = 200;

/** Tope de eventos pendientes de entrega que un reintento revisa cada vez. */
export const MAX_REINTENTOS_ENTREGA = 5;

export type TipoEventoSeguimientoIncidencia =
  | 'INCIDENCIA_CREADA'
  | 'INCIDENCIA_ESTADO_CAMBIADO'
  | 'INCIDENCIA_PRIORIDAD_CAMBIADA'
  | 'INCIDENCIA_ACTUALIZADA'
  | 'INCIDENCIA_ESCALADA'
  | 'INCIDENCIA_RESUELTA'
  | 'INCIDENCIA_DERIVACION_SOLICITADA';

/** Quién provoca el cambio (se deduce del perfil verificado en el servidor). */
export type ActorSeguimientoIncidencia =
  | 'INQUILINO'
  | 'PROPIETARIO'
  | 'PROFESIONAL'
  | 'ADMINISTRACION'
  | 'SISTEMA';

/** Destinos posibles de un aviso (nunca se avisa a quien no corresponde). */
export type DestinoAvisoIncidencia = 'INQUILINO' | 'PROPIETARIO' | 'ADMINISTRACION' | 'PROFESIONAL';

/** Estados terminales: no escalan y no avisan de cambios de estado previos. */
export const ESTADOS_TERMINALES_INCIDENCIA: readonly string[] = ['RESUELTA', 'CERRADA', 'CANCELADA', 'RECHAZADA'];

/** Horas sin asignación antes de escalar por plazo, según prioridad. */
export const HORAS_ESCALADO_POR_PRIORIDAD: Readonly<Record<string, number>> = {
  URGENTE: 4,
  ALTA: 24,
  NORMAL: 72,
  BAJA: 168,
};

export const ETIQUETA_EVENTO_SEGUIMIENTO: Readonly<Record<TipoEventoSeguimientoIncidencia, string>> = {
  INCIDENCIA_CREADA: 'Incidencia registrada',
  INCIDENCIA_ESTADO_CAMBIADO: 'Cambio de estado',
  INCIDENCIA_PRIORIDAD_CAMBIADA: 'Cambio de prioridad',
  INCIDENCIA_ACTUALIZADA: 'Información actualizada',
  INCIDENCIA_ESCALADA: 'Incidencia escalada',
  INCIDENCIA_RESUELTA: 'Incidencia resuelta',
  INCIDENCIA_DERIVACION_SOLICITADA: 'Derivación solicitada',
};

/** Estado de la notificación asociada al evento (entrega REAL, nunca supuesta). */
export interface EntregaEventoSeguimiento {
  canal: 'EMAIL' | 'INAPP' | 'WEBHOOK' | 'WHATSAPP' | null;
  estado: 'ENVIADA' | 'PENDIENTE' | 'NO_ENVIADA' | 'DUPLICADA' | 'SIN_DESTINATARIO';
  notificacionId?: string;
  provider?: string;
  externalId?: string;
  intentos: number;
  motivo?: string;
  actualizadoEn: string;
}

export interface EventoSeguimientoIncidencia {
  /** Id determinista del evento (`seg_<clave normalizada>`): reintentar no duplica. */
  id: string;
  incidenciaId: string;
  contratoId?: string;
  inmuebleId: string;
  propietarioId: string;
  tipo: TipoEventoSeguimientoIncidencia;
  actorTipo: ActorSeguimientoIncidencia;
  estadoAnterior?: string;
  estado?: string;
  prioridad?: string;
  /** Nombres de los campos afectados (sin valores libres). */
  campos: string[];
  /** Código corto del suceso cuando aporta precisión (p. ej. motivo de escalado). */
  detalleCodigo?: string;
  requiereAtencion: boolean;
  avisarA: DestinoAvisoIncidencia[];
  claveIdempotencia: string;
  creadoEn: string;
  entrega?: EntregaEventoSeguimiento;
}

/** Instantánea autorizada y SEGURA de la incidencia (nada de texto ni terceros). */
export interface InstantaneaIncidenciaSeguimiento {
  estado: string;
  prioridad: string;
  tieneTrabajoAsignado: boolean;
  fotografias: number;
  adjuntos: number;
  creadaEn: string;
  actualizadaEn: string;
  /** Código del motivo de escalado ya registrado (para no repetir el aviso). */
  escaladaPor?: string;
}

export interface HiloSeguimientoIncidencia {
  version: 1;
  incidenciaId: string;
  ultima: InstantaneaIncidenciaSeguimiento;
  eventos: EventoSeguimientoIncidencia[];
  actualizadoEn: string;
}

export interface ContextoSeguimientoIncidencia {
  incidenciaId: string;
  inmuebleId: string;
  propietarioId: string;
  contratoId?: string;
}

function texto(valor: unknown, max = 80): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const limpio = valor.trim();
  if (limpio === '') return undefined;
  return limpio.length > max ? limpio.slice(0, max) : limpio;
}

function fechaIso(valor: unknown, porDefecto: string): string {
  const bruto = texto(valor, 40);
  if (!bruto) return porDefecto;
  const fecha = new Date(bruto);
  return Number.isNaN(fecha.getTime()) ? porDefecto : fecha.toISOString();
}

function contador(valor: unknown): number {
  return Array.isArray(valor) ? valor.length : 0;
}

/** Lee una instantánea segura del documento de incidencia (lista blanca). */
export function instantaneaIncidenciaSeguimiento(
  datos: Record<string, unknown>,
  ahora: Date,
): InstantaneaIncidenciaSeguimiento {
  const porDefecto = ahora.toISOString();
  return {
    estado: texto(datos.estado, 40) ?? 'DESCONOCIDO',
    prioridad: texto(datos.prioridad, 40) ?? 'NORMAL',
    tieneTrabajoAsignado: typeof datos.trabajoProfesional === 'object' && datos.trabajoProfesional !== null,
    fotografias: contador(datos.fotografias) + contador(datos.fotos),
    adjuntos: contador(datos.documentos),
    creadaEn: fechaIso(datos.fechaCreacion ?? datos.createdAt, porDefecto),
    actualizadaEn: fechaIso(datos.fechaActualizacion ?? datos.updatedAt, porDefecto),
    ...(texto(datos.escaladaPor, 40) ? { escaladaPor: texto(datos.escaladaPor, 40) as string } : {}),
  };
}

export function esEstadoTerminal(estado: string): boolean {
  return ESTADOS_TERMINALES_INCIDENCIA.includes(estado);
}

/**
 * Motivo de escalado, o `null` si no procede. Determinista: depende sólo de la
 * instantánea autorizada y del reloj del servidor.
 */
export function motivoEscalado(
  instantanea: InstantaneaIncidenciaSeguimiento,
  ahora: Date,
): 'URGENTE_SIN_ASIGNAR' | 'PLAZO_SIN_ASIGNAR' | null {
  if (instantanea.tieneTrabajoAsignado) return null;
  if (esEstadoTerminal(instantanea.estado)) return null;
  if (instantanea.prioridad === 'URGENTE') return 'URGENTE_SIN_ASIGNAR';
  const limiteHoras = HORAS_ESCALADO_POR_PRIORIDAD[instantanea.prioridad] ?? HORAS_ESCALADO_POR_PRIORIDAD.NORMAL;
  const creada = new Date(instantanea.creadaEn).getTime();
  if (!Number.isFinite(creada)) return null;
  const horas = (ahora.getTime() - creada) / 3_600_000;
  return horas >= limiteHoras ? 'PLAZO_SIN_ASIGNAR' : null;
}

/** Destinos del aviso por tipo de evento (lista blanca, sin terceros). */
export function destinosAvisoDeEvento(
  tipo: TipoEventoSeguimientoIncidencia,
  actorTipo: ActorSeguimientoIncidencia,
): DestinoAvisoIncidencia[] {
  switch (tipo) {
    case 'INCIDENCIA_CREADA':
      // Quien registra la incidencia (normalmente el inquilino) no se avisa a sí
      // mismo: el aviso va a quien debe atenderla.
      return actorTipo === 'INQUILINO' ? ['PROPIETARIO', 'ADMINISTRACION'] : ['INQUILINO'];
    case 'INCIDENCIA_ESTADO_CAMBIADO':
    case 'INCIDENCIA_RESUELTA':
    case 'INCIDENCIA_PRIORIDAD_CAMBIADA':
      return actorTipo === 'INQUILINO' ? ['PROPIETARIO', 'ADMINISTRACION'] : ['INQUILINO'];
    case 'INCIDENCIA_ESCALADA':
      return ['PROPIETARIO', 'ADMINISTRACION'];
    case 'INCIDENCIA_DERIVACION_SOLICITADA':
      return ['PROPIETARIO', 'ADMINISTRACION', 'PROFESIONAL'];
    case 'INCIDENCIA_ACTUALIZADA':
      return actorTipo === 'INQUILINO' ? ['PROPIETARIO', 'ADMINISTRACION'] : ['INQUILINO'];
    default:
      return [];
  }
}

export interface EntradaDerivarEventos {
  contexto: ContextoSeguimientoIncidencia;
  /** Instantánea anterior conocida por el hilo (`null` = primera vez). */
  anterior: InstantaneaIncidenciaSeguimiento | null;
  actual: InstantaneaIncidenciaSeguimiento;
  actorTipo: ActorSeguimientoIncidencia;
  ahora: Date;
  /** Ids ya registrados en el hilo: lo que ya está escrito no se repite. */
  idsExistentes?: ReadonlySet<string>;
  /** Derivación solicitada por el inquilino desde el asistente (Fase 5). */
  derivacionSolicitada?: boolean;
}

function claveDe(
  incidenciaId: string,
  sufijoTipo: string,
): string {
  return idempotenciaDeEvento('INCIDENCIA', sufijoTipo, incidenciaId);
}

function construirEvento(
  entrada: EntradaDerivarEventos,
  parcial: {
    tipo: TipoEventoSeguimientoIncidencia;
    sufijoClave: string;
    campos: string[];
    requiereAtencion?: boolean;
    estadoAnterior?: string;
    estado?: string;
    prioridad?: string;
    detalleCodigo?: string;
  },
): EventoSeguimientoIncidencia {
  const claveIdempotencia = claveDe(entrada.contexto.incidenciaId, parcial.sufijoClave);
  return {
    id: `seg_${normalizarClave(claveIdempotencia)}`,
    incidenciaId: entrada.contexto.incidenciaId,
    ...(entrada.contexto.contratoId ? { contratoId: entrada.contexto.contratoId } : {}),
    inmuebleId: entrada.contexto.inmuebleId,
    propietarioId: entrada.contexto.propietarioId,
    tipo: parcial.tipo,
    actorTipo: entrada.actorTipo,
    ...(parcial.estadoAnterior ? { estadoAnterior: parcial.estadoAnterior } : {}),
    ...(parcial.estado ? { estado: parcial.estado } : {}),
    ...(parcial.prioridad ? { prioridad: parcial.prioridad } : {}),
    campos: [...parcial.campos],
    ...(parcial.detalleCodigo ? { detalleCodigo: parcial.detalleCodigo } : {}),
    requiereAtencion: parcial.requiereAtencion === true,
    avisarA: destinosAvisoDeEvento(parcial.tipo, entrada.actorTipo),
    claveIdempotencia,
    creadoEn: entrada.actual.actualizadaEn,
  };
}

/**
 * Eventos de seguimiento derivados de un cambio REAL. Devuelve `[]` cuando no
 * hay nada nuevo que registrar (guardado idéntico, reintento, o eventos ya
 * presentes en el hilo): en ese caso el servidor NO escribe ni notifica.
 */
export function derivarEventosSeguimiento(
  entrada: EntradaDerivarEventos,
): EventoSeguimientoIncidencia[] {
  const { anterior, actual, ahora } = entrada;
  const existentes = entrada.idsExistentes ?? new Set<string>();
  const nuevos: EventoSeguimientoIncidencia[] = [];
  const añadir = (evento: EventoSeguimientoIncidencia): void => {
    if (existentes.has(evento.id)) return;
    if (nuevos.some((e) => e.id === evento.id)) return;
    nuevos.push(evento);
  };

  // 1 · Registro inicial
  if (!anterior) {
    añadir(
      construirEvento(entrada, {
        tipo: 'INCIDENCIA_CREADA',
        sufijoClave: 'nueva',
        campos: ['estado', 'prioridad'],
        requiereAtencion: true,
        estado: actual.estado,
        prioridad: actual.prioridad,
      }),
    );
  } else {
    // 2 · Cambio de estado (sólo si de verdad cambia)
    if (anterior.estado !== actual.estado) {
      añadir(
        construirEvento(entrada, {
          tipo: actual.estado === 'RESUELTA' ? 'INCIDENCIA_RESUELTA' : 'INCIDENCIA_ESTADO_CAMBIADO',
          sufijoClave: actual.estado === 'RESUELTA' ? 'resuelta' : `cambio_estado:${anterior.estado}:${actual.estado}`,
          campos: ['estado'],
          requiereAtencion: false,
          estadoAnterior: anterior.estado,
          estado: actual.estado,
        }),
      );
    }
    // 3 · Cambio de prioridad
    if (anterior.prioridad !== actual.prioridad) {
      añadir(
        construirEvento(entrada, {
          tipo: 'INCIDENCIA_PRIORIDAD_CAMBIADA',
          sufijoClave: `prioridad:${anterior.prioridad}:${actual.prioridad}`,
          campos: ['prioridad'],
          prioridad: actual.prioridad,
        }),
      );
    }
    // 4 · Evidencias o asignación (fotografías/adjuntos/trabajo profesional)
    const campos: string[] = [];
    if (actual.fotografias !== anterior.fotografias) campos.push('fotografias');
    if (actual.adjuntos !== anterior.adjuntos) campos.push('documentos');
    if (actual.tieneTrabajoAsignado !== anterior.tieneTrabajoAsignado) campos.push('trabajoProfesional');
    if (campos.length > 0) {
      añadir(
        construirEvento(entrada, {
          tipo: 'INCIDENCIA_ACTUALIZADA',
          sufijoClave: `actualizada:${campos.join('+')}`,
          campos,
          requiereAtencion: false,
        }),
      );
    }
  }

  // 5 · Escalado (una sola vez por motivo, aunque se siga sincronizando)
  const motivo = motivoEscalado(actual, ahora);
  if (motivo && anterior?.escaladaPor !== motivo) {
    añadir(
      construirEvento(entrada, {
        tipo: 'INCIDENCIA_ESCALADA',
        sufijoClave: `escalada:${motivo}`,
        campos: ['escalada'],
        requiereAtencion: true,
        detalleCodigo: motivo,
        estado: actual.estado,
        prioridad: actual.prioridad,
      }),
    );
  }

  // 6 · Derivación solicitada por el inquilino (una sola vez)
  if (entrada.derivacionSolicitada === true) {
    añadir(
      construirEvento(entrada, {
        tipo: 'INCIDENCIA_DERIVACION_SOLICITADA',
        sufijoClave: 'derivacion_solicitada',
        campos: ['derivacion'],
        requiereAtencion: true,
      }),
    );
  }

  return nuevos;
}

/** Instantánea que debe quedar como «última» tras aplicar los eventos nuevos. */
export function instantaneaConEscalada(
  actual: InstantaneaIncidenciaSeguimiento,
  eventosNuevos: readonly EventoSeguimientoIncidencia[],
  ahora: Date,
): InstantaneaIncidenciaSeguimiento {
  const escalada = eventosNuevos.find((e) => e.tipo === 'INCIDENCIA_ESCALADA');
  const motivo = escalada?.detalleCodigo;
  if (!escalada || !motivo) return actual;
  return { ...actual, escaladaPor: motivo, actualizadaEn: ahora.toISOString() };
}

/** Hilo nuevo (primera sincronización de una incidencia). */
export function hiloInicial(
  contexto: ContextoSeguimientoIncidencia,
  actual: InstantaneaIncidenciaSeguimiento,
  eventos: readonly EventoSeguimientoIncidencia[],
  ahora: Date,
): HiloSeguimientoIncidencia {
  return {
    version: 1,
    incidenciaId: contexto.incidenciaId,
    ultima: instantaneaConEscalada(actual, eventos, ahora),
    eventos: [...eventos].slice(-MAX_EVENTOS_HILO),
    actualizadoEn: ahora.toISOString(),
  };
}

/** Hilo actualizado con los eventos nuevos (append-only, acotado). */
export function hiloConEventos(
  hilo: HiloSeguimientoIncidencia,
  actual: InstantaneaIncidenciaSeguimiento,
  eventosNuevos: readonly EventoSeguimientoIncidencia[],
  ahora: Date,
): HiloSeguimientoIncidencia {
  return {
    version: 1,
    incidenciaId: hilo.incidenciaId,
    ultima: instantaneaConEscalada(actual, eventosNuevos, ahora),
    eventos: [...hilo.eventos, ...eventosNuevos].slice(-MAX_EVENTOS_HILO),
    actualizadoEn: ahora.toISOString(),
  };
}

/** Eventos pendientes de entrega que un reintento puede revisar (los más antiguos). */
export function eventosPendientesDeEntrega(
  hilo: HiloSeguimientoIncidencia,
  max = MAX_REINTENTOS_ENTREGA,
): EventoSeguimientoIncidencia[] {
  return hilo.eventos
    .filter((e) => e.entrega?.estado === 'PENDIENTE' || e.entrega?.estado === 'NO_ENVIADA')
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// Presentación (UI): evolución legible a partir del hilo
// ---------------------------------------------------------------------------

export interface PasoEvolucionIncidencia {
  id: string;
  tipo: TipoEventoSeguimientoIncidencia;
  etiqueta: string;
  fecha: string;
  detalle?: string;
  requiereAtencion: boolean;
  notificacion?: string;
}

function detalleDeEvento(evento: EventoSeguimientoIncidencia): string | undefined {
  if (evento.tipo === 'INCIDENCIA_ESTADO_CAMBIADO' && evento.estadoAnterior && evento.estado) {
    return `${evento.estadoAnterior} → ${evento.estado}`;
  }
  if (evento.tipo === 'INCIDENCIA_PRIORIDAD_CAMBIADA' && evento.prioridad) {
    return `Prioridad ${evento.prioridad.toLowerCase()}`;
  }
  if (evento.tipo === 'INCIDENCIA_ESCALADA') {
    return evento.detalleCodigo === 'URGENTE_SIN_ASIGNAR'
      ? 'Prioridad urgente sin profesional asignado'
      : 'Plazo de atención superado sin profesional asignado';
  }
  if (evento.tipo === 'INCIDENCIA_RESUELTA') return 'Trabajo cerrado y comunicado';
  if (evento.tipo === 'INCIDENCIA_DERIVACION_SOLICITADA') return 'Solicitada por el inquilino desde el asistente';
  if (evento.tipo === 'INCIDENCIA_ACTUALIZADA' && evento.campos.length > 0) {
    const nombres: Record<string, string> = {
      fotografias: 'fotografías',
      documentos: 'documentos',
      trabajoProfesional: 'profesional asignado',
    };
    return `Nuevos: ${evento.campos.map((c) => nombres[c] ?? c).join(', ')}`;
  }
  return undefined;
}

const TEXTO_ENTREGA: Record<NonNullable<EntregaEventoSeguimiento['estado']>, string> = {
  ENVIADA: 'Aviso entregado',
  DUPLICADA: 'Aviso ya enviado antes',
  PENDIENTE: 'Aviso pendiente de entrega',
  NO_ENVIADA: 'Aviso no enviado',
  SIN_DESTINATARIO: 'Sin destinatario autorizado',
};

/** Pasos de la evolución (más reciente primero) para mostrar en el portal. */
export function pasosEvolucionIncidencia(
  hilo: HiloSeguimientoIncidencia | null,
): PasoEvolucionIncidencia[] {
  if (!hilo) return [];
  return [...hilo.eventos]
    .reverse()
    .map((evento) => {
      const detalle = detalleDeEvento(evento);
      const notificacion = evento.entrega ? TEXTO_ENTREGA[evento.entrega.estado] : undefined;
      return {
        id: evento.id,
        tipo: evento.tipo,
        etiqueta: ETIQUETA_EVENTO_SEGUIMIENTO[evento.tipo] ?? evento.tipo,
        fecha: evento.creadoEn,
        ...(detalle ? { detalle } : {}),
        requiereAtencion: evento.requiereAtencion,
        ...(notificacion ? { notificacion } : {}),
      };
    });
}

/** Id determinista de la notificación de un evento (idempotencia de GAP 1). */
export function idNotificacionDeEvento(evento: EventoSeguimientoIncidencia): string {
  return idDeNotificacion(evento.claveIdempotencia);
}
