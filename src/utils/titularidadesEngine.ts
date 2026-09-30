/**
 * MOTOR PURO DE TITULARIDADES (N titulares)
 * ==========================================
 * Sin Firestore, sin React: reglas de negocio testeables de forma aislada.
 *
 * Principios que aplica (y que el resto del sistema NO puede saltarse):
 *  · N titulares: 1, 2, 3… sin límite. Nunca `segundo`/`tercer`.
 *  · Identidad determinista: `titularidades/{inmuebleId}__{propietarioId}`, de
 *    modo que leer una titularidad es un `get` (demostrable para las reglas) y
 *    no un `list` ni un `or()`.
 *  · Cerrar NO es borrar: la titularidad pasa a `CERRADA` y sigue consultable.
 *  · NO SE INVENTAN PORCENTAJES: `porcentajeTitularidad === null` es PENDIENTE.
 *    No se asume 50/50, ni 33/33/34, ni ningún reparto por defecto.
 */
import type { EstadoTitularidad, MotivoCierreTitularidad, Titularidad } from '../types';

/** Separador de la clave determinista. */
export const SEPARADOR_CLAVE = '__';

/** Construye el id determinista de la titularidad. */
export function idTitularidad(inmuebleId: string, propietarioId: string): string {
  return `${inmuebleId}${SEPARADOR_CLAVE}${propietarioId}`;
}

/** ¿El id tiene la forma `{inmuebleId}__{propietarioId}`? */
export function esIdTitularidadValido(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  const partes = id.split(SEPARADOR_CLAVE);
  return partes.length === 2 && partes[0].length > 0 && partes[1].length > 0;
}

/** Descompone la clave determinista. `null` si no es válida. */
export function partirIdTitularidad(
  id: string,
): { inmuebleId: string; propietarioId: string } | null {
  if (!esIdTitularidadValido(id)) return null;
  const [inmuebleId, propietarioId] = id.split(SEPARADOR_CLAVE);
  return { inmuebleId, propietarioId };
}

/** Titularidades vigentes (estado no CERRADA) de un inmueble. */
export function titularidadesVigentes(titularidades: readonly Titularidad[], inmuebleId?: string): Titularidad[] {
  return (titularidades || [])
    .filter((t) => t && t.estado !== 'CERRADA')
    .filter((t) => (inmuebleId ? t.inmuebleId === inmuebleId : true));
}

/** Titularidades cerradas = HISTÓRICO (nunca se borran). */
export function titularidadesHistoricas(
  titularidades: readonly Titularidad[],
  inmuebleId?: string,
): Titularidad[] {
  const cerradas = (titularidades || [])
    .filter((t) => t && t.estado === 'CERRADA')
    .filter((t) => (inmuebleId ? t.inmuebleId === inmuebleId : true));
  return cerradas.sort((a, b) => (b.fechaCierre || '').localeCompare(a.fechaCierre || ''));
}

/** Nº de titulares vigentes de un inmueble (0 = sin titularidades declaradas). */
export function numeroTitulares(titularidades: readonly Titularidad[], inmuebleId?: string): number {
  return titularidadesVigentes(titularidades, inmuebleId).length;
}

/**
 * Porcentaje efectivo o `null` (pendiente). Nunca devuelve un valor inventado:
 * `null`/`undefined` NO se convierten en 0 (un titular sin porcentaje no tiene
 * cero por ciento, tiene el porcentaje SIN DETERMINAR).
 */
export function porcentajeTitular(t: Titularidad | null | undefined): number | null {
  if (!t) return null;
  const bruto = t.porcentajeTitularidad;
  if (bruto === null || bruto === undefined) return null;
  const p = Number(bruto);
  if (!Number.isFinite(p) || p < 0) return null;
  return p;
}

/** ¿Tiene el propietario titularidad vigente sobre el inmueble? */
export function esTitularVigente(
  titularidades: readonly Titularidad[],
  inmuebleId: string,
  propietarioId: string,
): boolean {
  return titularidadesVigentes(titularidades, inmuebleId).some((t) => t.propietarioId === propietarioId);
}

export const ESTADO_TITULARIDAD_LABEL: Record<EstadoTitularidad, string> = {
  VIGENTE: 'Vigente',
  CERRADA: 'Cerrada (histórico)',
};

export const MOTIVOS_CIERRE: MotivoCierreTitularidad[] = [
  'VENTA',
  'DONACION',
  'HERENCIA',
  'DIVORCIO',
  'DISOLUCION_CONDOMINIO',
  'ERROR_DATOS',
  'OTRO',
];

// ---------------------------------------------------------------------------
// VALIDACIÓN DE PORCENTAJES
// ---------------------------------------------------------------------------

export type CodigoReparto =
  /** Reparto completo y demostrable. */
  | 'OK'
  /** No hay titularidades declaradas: se usa el reparto binario heredado (o nada). */
  | 'SIN_TITULARIDADES'
  /** Los porcentajes declarados no suman 100 %. */
  | 'SUMA_INCORRECTA'
  /** 2 titulares y ninguno tiene porcentaje: no se asume 50/50. */
  | 'PENDIENTE_SIN_REPARTO'
  /** 3 o más titulares sin porcentaje suficiente: no es representable. */
  | 'NO_REPRESENTABLE';

export interface DiagnosticoPorcentajes {
  codigo: CodigoReparto;
  /** Titularidades vigentes consideradas. */
  vigentes: Titularidad[];
  /** propietarioIds sin porcentaje declarado. */
  pendientes: string[];
  /** Suma de lo declarado (0 si no hay nada declarado). */
  suma: number;
  /** Porcentajes efectivos por propietario (sólo si `codigo === 'OK'`). */
  porcentajes: Array<{ propietarioId: string; porcentaje: number }>;
  mensaje: string;
  /** `true` ⇒ la liquidación NO puede continuar. */
  bloquea: boolean;
}

const EPSILON = 0.01;

/** Redondeo a céntimos: compartido por el motor y por el reparto (F4). */
export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Diagnostica el reparto de un inmueble a partir de sus titularidades.
 *
 * Reglas (sin invención):
 *  · 0 vigentes                       → SIN_TITULARIDADES (no bloquea).
 *  · todos con porcentaje             → la suma debe ser 100 ± 0,01 (si no,
 *                                       SUMA_INCORRECTA y BLOQUEA).
 *  · exactamente 1 pendiente          → se DERIVA: 100 − suma(conocidos)
 *                                       (sólo si el resto es > 0).
 *  · 2 pendientes y 2 titulares       → PENDIENTE_SIN_REPARTO (BLOQUEA).
 *  · 2 o más pendientes con 3+ titulares → NO_REPRESENTABLE (BLOQUEA).
 */
export function validarPorcentajes(
  titularidades: readonly Titularidad[],
  inmuebleId?: string,
): DiagnosticoPorcentajes {
  const vigentes = titularidadesVigentes(titularidades, inmuebleId);

  if (vigentes.length === 0) {
    return {
      codigo: 'SIN_TITULARIDADES',
      vigentes: [],
      pendientes: [],
      suma: 0,
      porcentajes: [],
      mensaje: 'El inmueble no tiene titularidades declaradas.',
      bloquea: false,
    };
  }

  const pendientes = vigentes.filter((t) => porcentajeTitular(t) === null).map((t) => t.propietarioId);
  const conocidos = vigentes.filter((t) => porcentajeTitular(t) !== null);
  const suma = redondear2(conocidos.reduce((acc, t) => acc + (porcentajeTitular(t) as number), 0));

  if (pendientes.length === 0) {
    if (Math.abs(suma - 100) > EPSILON) {
      return {
        codigo: 'SUMA_INCORRECTA',
        vigentes,
        pendientes: [],
        suma,
        porcentajes: [],
        mensaje: `Los porcentajes de titularidad suman ${suma} % y deben sumar 100 %.`,
        bloquea: true,
      };
    }
    return {
      codigo: 'OK',
      vigentes,
      pendientes: [],
      suma,
      porcentajes: vigentes.map((t) => ({ propietarioId: t.propietarioId, porcentaje: porcentajeTitular(t) as number })),
      mensaje: 'Reparto completo.',
      bloquea: false,
    };
  }

  if (pendientes.length > 1) {
    const codigo: CodigoReparto = vigentes.length <= 2 ? 'PENDIENTE_SIN_REPARTO' : 'NO_REPRESENTABLE';
    return {
      codigo,
      vigentes,
      pendientes,
      suma,
      porcentajes: [],
      mensaje:
        codigo === 'PENDIENTE_SIN_REPARTO'
          ? 'Hay 2 titulares sin porcentaje declarado: no se asume un reparto 50/50. Indique los porcentajes.'
          : `Hay ${pendientes.length} titulares sin porcentaje declarado: el reparto no es representable. Indique los porcentajes.`,
      bloquea: true,
    };
  }

  // Exactamente 1 pendiente: se DERIVA del resto (no se inventa, se calcula).
  const resto = redondear2(100 - suma);
  if (resto <= 0) {
    return {
      codigo: 'SUMA_INCORRECTA',
      vigentes,
      pendientes,
      suma,
      porcentajes: [],
      mensaje: `Los porcentajes declarados ya suman ${suma} %: no queda porcentaje para el titular pendiente.`,
      bloquea: true,
    };
  }

  return {
    codigo: 'OK',
    vigentes,
    pendientes,
    suma: 100,
    porcentajes: vigentes.map((t) => ({
      propietarioId: t.propietarioId,
      porcentaje: porcentajeTitular(t) === null ? resto : (porcentajeTitular(t) as number),
    })),
    mensaje: 'Reparto completo (un porcentaje derivado del resto hasta el 100 %).',
    bloquea: false,
  };
}

/** ¿El diagnóstico permite liquidar? */
export function repartoUtilizable(d: DiagnosticoPorcentajes): boolean {
  return d.codigo === 'OK';
}

/** Texto presentable del porcentaje (o la PENDENCIA explícita). */
export function etiquetaPorcentaje(t: Titularidad): string {
  const p = porcentajeTitular(t);
  return p === null ? 'Pendiente' : `${p} %`;
}

// ---------------------------------------------------------------------------
// CONSTRUCCIÓN / CIERRE (fábricas puras; la persistencia vive en `src/lib`)
// ---------------------------------------------------------------------------

export interface AltaTitularidad {
  inmuebleId: string;
  propietarioId: string;
  propietarioNombre?: string;
  /** `null` = pendiente. */
  porcentaje?: number | null;
  fechaInicio?: string;
  actor?: { id?: string; nombre?: string };
}

export function construirTitularidad(alta: AltaTitularidad): Titularidad {
  const ahora = new Date().toISOString();
  const pct = alta.porcentaje === undefined || alta.porcentaje === null ? null : Number(alta.porcentaje);
  const porcentaje = pct !== null && Number.isFinite(pct) && pct >= 0 ? redondear2(pct) : null;
  return {
    id: idTitularidad(alta.inmuebleId, alta.propietarioId),
    inmuebleId: alta.inmuebleId,
    propietarioId: alta.propietarioId,
    propietarioNombre: alta.propietarioNombre,
    porcentajeTitularidad: porcentaje,
    estado: 'VIGENTE',
    fechaInicio: alta.fechaInicio || ahora,
    creadoPorId: alta.actor?.id,
    creadoPorNombre: alta.actor?.nombre,
    createdAt: ahora,
    updatedAt: ahora,
  };
}

export interface CierreTitularidad {
  titularidad: Titularidad;
  motivo: MotivoCierreTitularidad;
  detalle?: string;
  fechaCierre?: string;
  actor?: { id?: string; nombre?: string };
}

/**
 * Cierra una titularidad: NUNCA la borra. Devuelve una COPIA en estado
 * `CERRADA` con fecha, motivo y quién lo registró (histórico consultable).
 */
export function cerrarTitularidadEnMemoria(cierre: CierreTitularidad): Titularidad {
  const ahora = new Date().toISOString();
  return {
    ...cierre.titularidad,
    estado: 'CERRADA',
    fechaCierre: cierre.fechaCierre || ahora,
    motivoCierre: cierre.motivo,
    detalleCierre: cierre.detalle?.trim() || undefined,
    cerradoPorId: cierre.actor?.id,
    cerradoPorNombre: cierre.actor?.nombre,
    updatedAt: ahora,
  };
}

/** ¿Se puede cerrar esta titularidad? (ya cerrada = no). */
export function sePuedeCerrar(t: Titularidad | null | undefined): boolean {
  return !!t && t.estado !== 'CERRADA';
}
