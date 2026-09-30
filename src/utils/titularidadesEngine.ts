/**
 * MOTOR DE TITULARIDADES — N TITULARES (BLOQUE 2)
 * ================================================
 *
 * Principios que implementa (y que NO se pueden violar sin romper los tests):
 *
 *  2.1 · La titularidad vive en la colección raíz `titularidades`, con una
 *        relación por (inmueble, titular) y clave determinista
 *        `inmuebleId__propietarioId`. NO existen `propietarioTerciarioId`,
 *        `Cuarto` ni `Quinto`, y no hay límite práctico de titulares.
 *  2.2 · Cada relación lleva inmuebleId, propietarioId, porcentaje, esPrincipal,
 *        rol, estado, fechaDesde, fechaHasta, motivoBaja, origen, versión e
 *        historial. NUNCA se borra físicamente: se cierra.
 *  2.3 · Los porcentajes NUNCA se inventan. Sólo se toman de una fuente real
 *        (`repartoCopropiedad` de la configuración de liquidación). Si no la hay,
 *        queda `porcentaje: null` + `porcentajePendiente: true`.
 *  2.10· El historial es reconstruible: las relaciones cerradas se conservan.
 *
 * Todo este módulo es PURO (sin Firestore, sin React) ⇒ 100 % testeable.
 */

import type {
  EventoTitularidad,
  Inmueble,
  RolTitularidad,
  OrigenTitularidad,
  EstadoTitularidad,
  Titularidad,
} from '../types';
import type { ConfigFiscalLiquidacion } from '../tesoreria/tipos';

/* ------------------------------------------------------------------ */
/* Identidad determinista                                               */
/* ------------------------------------------------------------------ */

/** Separador oficial de la clave compuesta. */
export const SEPARADOR_CLAVE = '__';

/**
 * Clave determinista de la relación: `${inmuebleId}__${propietarioId}`.
 * Hace la migración IDEMPOTENTE: ejecutarla dos veces no crea duplicados.
 */
export function claveTitularidad(inmuebleId: string, propietarioId: string): string {
  return `${inmuebleId}${SEPARADOR_CLAVE}${propietarioId}`;
}

/** ¿Esta clave pertenece a este inmueble? (filtro de consultas y reglas). */
export function clavePerteneceAInmueble(clave: string, inmuebleId: string): boolean {
  return clave.startsWith(`${inmuebleId}${SEPARADOR_CLAVE}`);
}

/* ------------------------------------------------------------------ */
/* Utilidades de fecha                                                  */
/* ------------------------------------------------------------------ */

/** Normaliza cualquier valor de fecha a ISO. Si no hay valor válido, usa ahora. */
export function normalizarFecha(valor?: string | null): string {
  if (typeof valor === 'string' && valor.trim().length > 0) {
    const d = new Date(valor);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

/** ¿La relación está vigente en una fecha dada? */
export function estaVigenteEn(
  t: Pick<Titularidad, 'fechaDesde' | 'fechaHasta'>,
  fechaISO: string
): boolean {
  const f = new Date(fechaISO).getTime();
  if (Number.isNaN(f)) return false;
  const desde = new Date(t.fechaDesde).getTime();
  if (Number.isNaN(desde) || f < desde) return false;
  if (t.fechaHasta) {
    const hasta = new Date(t.fechaHasta).getTime();
    if (!Number.isNaN(hasta) && f > hasta) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Construcción y cierre (nunca borrado)                                */
/* ------------------------------------------------------------------ */

export interface DatosNuevaTitularidad {
  inmuebleId: string;
  propietarioId: string;
  porcentaje?: number | null;
  esPrincipal?: boolean;
  rol?: RolTitularidad;
  fechaDesde?: string;
  origen?: OrigenTitularidad;
  notas?: string;
  fichaPendiente?: boolean;
  migracionId?: string;
  actorId?: string;
  actorNombre?: string;
  motivo?: string;
}

/** Crea una titularidad ACTIVA con su evento de alta en el historial. */
export function crearTitularidad(datos: DatosNuevaTitularidad): Titularidad {
  const ahora = new Date().toISOString();
  const fechaDesde = normalizarFecha(datos.fechaDesde);
  const id = claveTitularidad(datos.inmuebleId, datos.propietarioId);
  const porcentaje =
    typeof datos.porcentaje === 'number' && Number.isFinite(datos.porcentaje)
      ? datos.porcentaje
      : null;

  const evento: EventoTitularidad = {
    id: `ev-${ahora}-${Math.random().toString(36).slice(2, 8)}`,
    fecha: ahora,
    tipo: datos.origen === 'MIGRACION' ? 'MIGRACION' : 'ALTA',
    actorId: datos.actorId,
    actorNombre: datos.actorNombre,
    estadoAnterior: undefined,
    estadoNuevo: 'ACTIVA',
    porcentajeAnterior: null,
    porcentajeNuevo: porcentaje,
    motivo: datos.motivo,
    detalle:
      datos.origen === 'MIGRACION'
        ? 'Alta derivada de la migración al modelo de N titulares.'
        : 'Alta de la relación de titularidad.',
  };

  return {
    id,
    inmuebleId: datos.inmuebleId,
    propietarioId: datos.propietarioId,
    porcentaje,
    porcentajePendiente: porcentaje === null,
    esPrincipal: datos.esPrincipal ?? false,
    rol: datos.rol ?? 'COTITULAR',
    estado: 'ACTIVA',
    fechaDesde,
    fechaHasta: null,
    motivoBaja: null,
    origen: datos.origen ?? 'ALTA',
    version: 1,
    historial: [evento],
    fichaPendiente: datos.fichaPendiente,
    notas: datos.notas,
    creadoPor: datos.actorId,
    actualizadoPor: datos.actorId,
    createdAt: ahora,
    updatedAt: ahora,
    migracionId: datos.migracionId,
  };
}

export interface DatosCierreTitularidad {
  fechaHasta: string;
  motivo?: string;
  estado?: Exclude<EstadoTitularidad, 'ACTIVA'>;
  actorId?: string;
  actorNombre?: string;
}

/**
 * CIERRA una titularidad (la deja fuera de la titularidad vigente) SIN BORRARLA.
 *
 * Devuelve el registro actualizado con:
 *   · `estado` = BAJA o TRANSMITIDA.
 *   · `fechaHasta` y `motivoBaja`.
 *   · `version` incrementada.
 *   · el evento añadido al `historial` (append-only, nunca se recorta).
 */
export function cerrarTitularidad(
  titularidad: Titularidad,
  datos: DatosCierreTitularidad
): Titularidad {
  const ahora = new Date().toISOString();
  const estado: EstadoTitularidad = datos.estado ?? 'BAJA';

  const evento: EventoTitularidad = {
    id: `ev-${ahora}-${Math.random().toString(36).slice(2, 8)}`,
    fecha: ahora,
    tipo: estado === 'TRANSMITIDA' ? 'TRANSMISION' : 'BAJA',
    actorId: datos.actorId,
    actorNombre: datos.actorNombre,
    estadoAnterior: titularidad.estado,
    estadoNuevo: estado,
    porcentajeAnterior: titularidad.porcentaje,
    porcentajeNuevo: titularidad.porcentaje,
    motivo: datos.motivo,
    detalle: 'La relación se cierra; NO se elimina (historial patrimonial).',
  };

  return {
    ...titularidad,
    estado,
    fechaHasta: normalizarFecha(datos.fechaHasta),
    motivoBaja: datos.motivo ?? null,
    version: titularidad.version + 1,
    historial: [...(titularidad.historial || []), evento],
    actualizadoPor: datos.actorId,
    updatedAt: ahora,
  };
}

/** Reactivar una titularidad cerrada: abre una NUEVA etapa, conservando el historial. */
export function reactivarTitularidad(
  titularidad: Titularidad,
  datos: { fechaDesde?: string; actorId?: string; actorNombre?: string; motivo?: string }
): Titularidad {
  const ahora = new Date().toISOString();
  const evento: EventoTitularidad = {
    id: `ev-${ahora}-${Math.random().toString(36).slice(2, 8)}`,
    fecha: ahora,
    tipo: 'REACTIVACION',
    actorId: datos.actorId,
    actorNombre: datos.actorNombre,
    estadoAnterior: titularidad.estado,
    estadoNuevo: 'ACTIVA',
    porcentajeAnterior: titularidad.porcentaje,
    porcentajeNuevo: titularidad.porcentaje,
    motivo: datos.motivo,
  };

  return {
    ...titularidad,
    estado: 'ACTIVA',
    fechaDesde: normalizarFecha(datos.fechaDesde),
    fechaHasta: null,
    motivoBaja: null,
    version: titularidad.version + 1,
    historial: [...(titularidad.historial || []), evento],
    actualizadoPor: datos.actorId,
    updatedAt: ahora,
  };
}

/**
 * Modifica campos editables SIN perder trazabilidad: añade un evento de
 * modificación e incrementa la versión.
 */
export function modificarTitularidad(
  titularidad: Titularidad,
  cambios: {
    porcentaje?: number | null;
    esPrincipal?: boolean;
    rol?: RolTitularidad;
    notas?: string;
    actorId?: string;
    actorNombre?: string;
    motivo?: string;
  }
): Titularidad {
  const ahora = new Date().toISOString();
  const porcentajeNuevo =
    cambios.porcentaje === undefined ? titularidad.porcentaje : cambios.porcentaje;

  // Sin cambios reales: no se toca nada (evita ruido e historial vacío).
  const sinCambios =
    porcentajeNuevo === titularidad.porcentaje &&
    (cambios.esPrincipal === undefined || cambios.esPrincipal === titularidad.esPrincipal) &&
    (cambios.rol === undefined || cambios.rol === titularidad.rol) &&
    (cambios.notas === undefined || cambios.notas === titularidad.notas);
  if (sinCambios) return titularidad;

  const evento: EventoTitularidad = {
    id: `ev-${ahora}-${Math.random().toString(36).slice(2, 8)}`,
    fecha: ahora,
    tipo: 'MODIFICACION',
    actorId: cambios.actorId,
    actorNombre: cambios.actorNombre,
    estadoAnterior: titularidad.estado,
    estadoNuevo: titularidad.estado,
    porcentajeAnterior: titularidad.porcentaje,
    porcentajeNuevo,
    motivo: cambios.motivo,
  };

  return {
    ...titularidad,
    porcentaje: porcentajeNuevo,
    porcentajePendiente: porcentajeNuevo === null,
    esPrincipal: cambios.esPrincipal ?? titularidad.esPrincipal,
    rol: cambios.rol ?? titularidad.rol,
    notas: cambios.notas ?? titularidad.notas,
    version: titularidad.version + 1,
    historial: [...(titularidad.historial || []), evento],
    actualizadoPor: cambios.actorId,
    updatedAt: ahora,
  };
}

/* ------------------------------------------------------------------ */
/* Consulta: vigentes, históricas, N titulares                          */
/* ------------------------------------------------------------------ */

/** Titularidades vigentes (estado ACTIVA) de un inmueble. */
export function titularidadesVigentes(lista: Titularidad[], inmuebleId: string): Titularidad[] {
  return lista.filter((t) => t.inmuebleId === inmuebleId && t.estado === 'ACTIVA');
}

/** Titularidades cerradas (histórico) de un inmueble. */
export function titularidadesHistoricas(lista: Titularidad[], inmuebleId: string): Titularidad[] {
  return lista.filter((t) => t.inmuebleId === inmuebleId && t.estado !== 'ACTIVA');
}

/** ¿Cuántos titulares tiene el inmueble? (1, 2, 3, 4… N). */
export function numeroTitulares(lista: Titularidad[], inmuebleId: string): number {
  return titularidadesVigentes(lista, inmuebleId).length;
}

/** IDs de los titulares vigentes de un inmueble. */
export function idsTitularesVigentes(lista: Titularidad[], inmuebleId: string): string[] {
  return titularidadesVigentes(lista, inmuebleId).map((t) => t.propietarioId);
}

/**
 * Aplica la regla de titular principal: como máximo UNO.
 * Devuelve la lista ajustada (el principal se decide explícitamente, nunca al azar).
 */
export function normalizarPrincipal(lista: Titularidad[]): Titularidad[] {
  const principales = lista.filter((t) => t.esPrincipal && t.estado === 'ACTIVA');
  if (principales.length <= 1) return lista;
  // Si hubiera varios (importación o migración inconsistente), se conserva el
  // más antiguo y se desmarca el resto: NUNCA se borra ni se decide al azar.
  const ordenado = [...principales].sort((a, b) => a.fechaDesde.localeCompare(b.fechaDesde));
  const ganador = ordenado[0];
  return lista.map((t) =>
    t.esPrincipal && t.id !== ganador.id ? { ...t, esPrincipal: false } : t
  );
}

/* ------------------------------------------------------------------ */
/* 2.3 · PORCENTAJES: sólo de fuente real, nunca inventados             */
/* ------------------------------------------------------------------ */

export interface RepartoDisponible {
  /** Titular principal (según la configuración). */
  primerTitularId: string;
  porcentajePrimero: number;
  segundoTitularId: string;
  porcentajeSegundo: number;
}

/**
 * Lee el reparto REAL desde `ConfigFiscalLiquidacion.repartoCopropiedad`.
 *
 * Devuelve `null` si no existe la configuración, si falta el segundo titular o
 * si el porcentaje no es válido. En ese caso el llamador DEBE marcar
 * `porcentajePendiente: true`: está PROHIBIDO suponer un 50/50.
 */
export function leerRepartoReal(
  config: ConfigFiscalLiquidacion | null | undefined,
  primerTitularId: string
): RepartoDisponible | null {
  if (!config || !config.repartoCopropiedad) return null;

  const { segundoPropietarioId, porcentajeSegundo } = config.repartoCopropiedad;

  if (typeof segundoPropietarioId !== 'string' || segundoPropietarioId.trim().length === 0) {
    return null;
  }
  if (typeof porcentajeSegundo !== 'number' || !Number.isFinite(porcentajeSegundo)) return null;
  if (porcentajeSegundo <= 0 || porcentajeSegundo >= 100) return null;
  if (segundoPropietarioId === primerTitularId) return null;

  return {
    primerTitularId,
    porcentajePrimero: redondear2(100 - porcentajeSegundo),
    segundoTitularId: segundoPropietarioId,
    porcentajeSegundo: redondear2(porcentajeSegundo),
  };
}

function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Deriva los porcentajes de dos titulares a partir del reparto real.
 *
 * Regla estricta:
 *   · El reparto SÓLO aplica si el segundo titular del reparto coincide con el
 *     segundo titular del inmueble. Si no coincide, NO se extrapola: se devuelve
 *     `null` y queda pendiente.
 */
export function derivarPorcentajes(
  config: ConfigFiscalLiquidacion | null | undefined,
  primerTitularId: string,
  segundoTitularId: string
): { primero: number; segundo: number } | null {
  const reparto = leerRepartoReal(config, primerTitularId);
  if (!reparto) return null;
  if (reparto.segundoTitularId !== segundoTitularId) return null;
  return { primero: reparto.porcentajePrimero, segundo: reparto.porcentajeSegundo };
}

export interface ValidacionPorcentajes {
  valido: boolean;
  /** Suma de porcentajes conocidos (null si hay alguno pendiente). */
  suma: number | null;
  pendientes: string[];
  errores: string[];
  /** Avisos: situaciones legítimas pero que conviene mostrar. */
  avisos: string[];
}

/**
 * Valida los porcentajes de las titularidades VIGENTES de un inmueble.
 *
 * · Si TODOS los porcentajes son conocidos, la suma debe ser 100 (±0,01).
 * · Si alguno es `null`/pendiente, NO se valida la suma: no hay base para hacerlo.
 * · Nunca se redistribuye ni se rellena un porcentaje faltante.
 */
export function validarPorcentajes(titularidades: Titularidad[]): ValidacionPorcentajes {
  const vigentes = titularidades.filter((t) => t.estado === 'ACTIVA');
  const errores: string[] = [];
  const avisos: string[] = [];
  const pendientes: string[] = [];

  if (vigentes.length === 0) {
    return { valido: true, suma: null, pendientes, errores, avisos };
  }

  let suma: number | null = 0;
  for (const t of vigentes) {
    if (typeof t.porcentaje === 'number' && Number.isFinite(t.porcentaje)) {
      if (t.porcentaje < 0 || t.porcentaje > 100) {
        errores.push(`El porcentaje de ${t.propietarioId} (${t.porcentaje}) está fuera de 0-100.`);
      }
      suma = (suma ?? 0) + t.porcentaje;
    } else {
      pendientes.push(t.propietarioId);
      suma = null;
    }
  }

  if (suma !== null) {
    suma = redondear2(suma);
    if (Math.abs(suma - 100) > 0.01) {
      errores.push(
        `La suma de porcentajes es ${suma} %, no 100 %. No se ajusta automáticamente: ` +
          `hay que indicar el reparto real.`
      );
    }
  } else if (pendientes.length > 0) {
    avisos.push(
      `Hay ${pendientes.length} titular(es) con porcentaje PENDIENTE. ` +
        `No se muestra ningún reparto como si fuera un dato real.`
    );
  }

  return { valido: errores.length === 0, suma, pendientes, errores, avisos };
}

/* ------------------------------------------------------------------ */
/* 2.10 · Reconstrucción del historial patrimonial                      */
/* ------------------------------------------------------------------ */

export interface FotoTitularidad {
  fecha: string;
  titulares: Array<{ propietarioId: string; porcentaje: number | null; rol: RolTitularidad }>;
}

/**
 * Reconstruye la titularidad vigente en cada momento a partir del historial.
 *
 * Ejemplo exigido: 2020 A50/B50 → 2025 A100 → 2028 VENDIDO.
 */
export function reconstruirHistorial(
  titularidades: Titularidad[],
  inmuebleId: string
): FotoTitularidad[] {
  const delInmueble = titularidades.filter((t) => t.inmuebleId === inmuebleId);

  // Instantes relevantes: cada fechaDesde y cada fechaHasta.
  const instantes = new Set<string>();
  for (const t of delInmueble) {
    instantes.add(t.fechaDesde);
    if (t.fechaHasta) instantes.add(t.fechaHasta);
  }

  return Array.from(instantes)
    .sort((a, b) => a.localeCompare(b))
    .map((fecha) => {
      // Un titular cuenta como vigente si fechaDesde <= fecha y (sin fechaHasta
      // o fecha < fechaHasta). En el instante exacto del cierre ya no lo está.
      const vigentes = delInmueble.filter((t) => {
        if (new Date(t.fechaDesde).getTime() > new Date(fecha).getTime()) return false;
        if (t.fechaHasta && new Date(fecha).getTime() >= new Date(t.fechaHasta).getTime()) {
          return false;
        }
        return true;
      });
      return {
        fecha,
        titulares: vigentes.map((t) => ({
          propietarioId: t.propietarioId,
          porcentaje: t.porcentaje,
          rol: t.rol,
        })),
      };
    })
    .filter((foto) => foto.titulares.length > 0);
}

/* ------------------------------------------------------------------ */
/* 2.5 · Visibilidad: 1 / 2 / 3 / 4 / N titulares                       */
/* ------------------------------------------------------------------ */

/** ¿El titular participa en el inmueble (en algún momento o ahora)? */
export function participaEnInmueble(
  titularidades: Titularidad[],
  inmuebleId: string,
  propietarioId: string
): boolean {
  return titularidades.some(
    (t) => t.inmuebleId === inmuebleId && t.propietarioId === propietarioId
  );
}

/** ¿Participa AHORA MISMO? (titularidad vigente). */
export function participaAhora(
  titularidades: Titularidad[],
  inmuebleId: string,
  propietarioId: string,
  fechaISO?: string
): boolean {
  const fecha = fechaISO ?? new Date().toISOString();
  return titularidades.some(
    (t) =>
      t.inmuebleId === inmuebleId &&
      t.propietarioId === propietarioId &&
      t.estado === 'ACTIVA' &&
      estaVigenteEn(t, fecha)
  );
}

/**
 * Inmuebles visibles para un titular según el modelo N.
 * Un titular ve el inmueble si tiene (o tuvo) titularidad sobre él.
 */
export function inmueblesDelTitular<T extends { id: string }>(
  inmuebles: T[],
  titularidades: Titularidad[],
  propietarioId: string
): T[] {
  const ids = new Set(
    titularidades.filter((t) => t.propietarioId === propietarioId).map((t) => t.inmuebleId)
  );
  return inmuebles.filter((i) => ids.has(i.id));
}

/* ------------------------------------------------------------------ */
/* Proyección sobre el inmueble (índice y compatibilidad)               */
/* ------------------------------------------------------------------ */

/**
 * Índice `titularesIds` derivado de las titularidades VIGENTES.
 * Es el campo que usan las reglas de Firestore para acotar las consultas.
 */
export function proyectarIdsDesdeTitularidades(
  titularidades: Titularidad[],
  inmuebleId: string
): string[] {
  const salida: string[] = [];
  for (const t of titularidadesVigentes(titularidades, inmuebleId)) {
    if (!salida.includes(t.propietarioId)) salida.push(t.propietarioId);
  }
  return salida;
}

/**
 * Aplica el modelo N sobre el inmueble SIN DESTRUIR los campos heredados:
 * rellena `titularesIds` y, sólo si están vacíos, los campos escalares
 * heredados (se conservan como compatibilidad, nunca se borran).
 */
export function aplicarTitularidadesAInmueble(
  inmueble: Inmueble,
  titularidades: Titularidad[]
): Inmueble {
  const vigentes = titularidadesVigentes(titularidades, inmueble.id);
  const principal = vigentes.find((t) => t.esPrincipal) ?? vigentes[0];
  const secundario = vigentes.filter((t) => t.id !== principal?.id)[0];

  return {
    ...inmueble,
    titularesIds: proyectarIdsDesdeTitularidades(titularidades, inmueble.id),
    propietarioId: inmueble.propietarioId ?? principal?.propietarioId,
    propietarioPrincipalId: inmueble.propietarioPrincipalId ?? principal?.propietarioId,
    propietarioSecundarioId: inmueble.propietarioSecundarioId ?? secundario?.propietarioId,
  };
}
