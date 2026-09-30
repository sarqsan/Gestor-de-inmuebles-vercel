/**
 * CICLO DE VIDA PATRIMONIAL (BLOQUE 2)
 * ====================================
 *
 * DOS EJES ORTOGONALES, deliberadamente separados:
 *
 *   · EJE PATRIMONIAL  → qué ocurre con el inmueble como BIEN de una cartera:
 *                        ACTIVO · EN_VENTA · VENDIDO · TRANSMITIDO · BAJA · HISTORICO
 *   · EJE DE EXPLOTACIÓN → qué ocurre con su USO:
 *                        DISPONIBLE · ALQUILADO · EN_REFORMA · NO_DISPONIBLE · SIN_EXPLOTACION
 *
 * Reglas de negocio que este módulo garantiza:
 *
 *  2.7 · Los dos ejes son independientes y NO rompen el `estado` actual
 *        ('disponible' | 'alquilado'), que sigue siendo la fuente de verdad de
 *        la explotación cuando no se fija `estadoExplotacion` explícitamente.
 *  2.8 · VENDER ≠ BORRAR. Un inmueble VENDIDO sale de la CARTERA ACTIVA pero
 *        sigue SIENDO ALCANZABLE desde el HISTÓRICO.
 *  2.9 · La venta/baja NO toca contratos, recibos, gastos, documentos, IBI,
 *        basura, reparaciones, incidencias, suministros, liquidaciones,
 *        fiscalidad ni titularidades: se conserva TODO.
 *  2.11· El borrado físico NO es el mecanismo normal: la acción normal es
 *        "Dar de baja" / "Marcar como vendido".
 *
 * Módulo PURO: no borra, no muta, no escribe. Devuelve objetos nuevos.
 */

import type {
  BajaPatrimonial,
  EstadoExplotacion,
  EstadoPatrimonial,
  Inmueble,
} from '../types';

/* ------------------------------------------------------------------ */
/* Lectura de los dos ejes                                              */
/* ------------------------------------------------------------------ */

/** Estados que forman la CARTERA ACTIVA. */
export const ESTADOS_CARTERA_ACTIVA: EstadoPatrimonial[] = ['ACTIVO', 'EN_VENTA'];
/** Estados que forman el HISTÓRICO. */
export const ESTADOS_HISTORICO: EstadoPatrimonial[] = ['VENDIDO', 'TRANSMITIDO', 'BAJA', 'HISTORICO'];

/**
 * Eje patrimonial. Un inmueble sin el campo (todos los existentes hoy) es ACTIVO:
 * compatibilidad total, ningún documento cambia de situación por migrar.
 */
export function estadoPatrimonialDe(inmueble: Pick<Inmueble, 'estadoPatrimonial'>): EstadoPatrimonial {
  return inmueble.estadoPatrimonial ?? 'ACTIVO';
}

/**
 * Eje de explotación.
 *
 * Se DERIVA del campo `estado` cuando no hay valor explícito, para no romper
 * ninguna lógica existente:
 *   · 'disponible' → DISPONIBLE
 *   · 'alquilado'  → ALQUILADO
 */
export function estadoExplotacionDe(
  inmueble: Pick<Inmueble, 'estadoExplotacion' | 'estado'>
): EstadoExplotacion {
  if (inmueble.estadoExplotacion) return inmueble.estadoExplotacion;
  return inmueble.estado === 'alquilado' ? 'ALQUILADO' : 'DISPONIBLE';
}

/** ¿Está en la cartera activa? (2.8) */
export function esCarteraActiva(inmueble: Pick<Inmueble, 'estadoPatrimonial'>): boolean {
  return ESTADOS_CARTERA_ACTIVA.includes(estadoPatrimonialDe(inmueble));
}

/** ¿Está en el histórico? (2.8) */
export function esHistorico(inmueble: Pick<Inmueble, 'estadoPatrimonial'>): boolean {
  return ESTADOS_HISTORICO.includes(estadoPatrimonialDe(inmueble));
}

/** Cartera activa de una lista (2.12). */
export function filtrarCarteraActiva<T extends Pick<Inmueble, 'estadoPatrimonial'>>(
  inmuebles: T[]
): T[] {
  return inmuebles.filter(esCarteraActiva);
}

/** Histórico de una lista (2.12). */
export function filtrarHistorico<T extends Pick<Inmueble, 'estadoPatrimonial'>>(
  inmuebles: T[]
): T[] {
  return inmuebles.filter(esHistorico);
}

/* ------------------------------------------------------------------ */
/* Transiciones permitidas                                              */
/* ------------------------------------------------------------------ */

const TRANSICIONES_PERMITIDAS: Record<EstadoPatrimonial, EstadoPatrimonial[]> = {
  ACTIVO: ['EN_VENTA', 'VENDIDO', 'TRANSMITIDO', 'BAJA', 'HISTORICO'],
  EN_VENTA: ['ACTIVO', 'VENDIDO', 'TRANSMITIDO', 'BAJA', 'HISTORICO'],
  VENDIDO: ['HISTORICO'], // ya fuera de cartera: sólo se archiva
  TRANSMITIDO: ['HISTORICO'],
  BAJA: ['ACTIVO'], // una baja puede revertirse (error material)
  HISTORICO: [],
};

export interface ValidacionTransicion {
  permitida: boolean;
  motivo?: string;
}

/** ¿Es válido pasar del estado actual al nuevo? */
export function validarTransicion(
  actual: EstadoPatrimonial,
  nuevo: EstadoPatrimonial
): ValidacionTransicion {
  if (actual === nuevo) {
    return { permitida: true };
  }
  if (!TRANSICIONES_PERMITIDAS[actual]?.includes(nuevo)) {
    return {
      permitida: false,
      motivo: `No se puede pasar de ${actual} a ${nuevo}.`,
    };
  }
  return { permitida: true };
}

/* ------------------------------------------------------------------ */
/* Operaciones de ciclo de vida (NUNCA destructivas)                    */
/* ------------------------------------------------------------------ */

export interface DatosOperacionPatrimonial {
  fecha?: string;
  motivo?: string;
  actorId?: string;
  actorNombre?: string;
  /** La publicación activa se retira, pero NO se borra (3.6). */
  publicacionRetirada?: boolean;
}

function construirBaja(
  tipo: BajaPatrimonial['tipo'],
  anterior: EstadoPatrimonial,
  datos: DatosOperacionPatrimonial
): BajaPatrimonial {
  return {
    fecha: datos.fecha ? new Date(datos.fecha).toISOString() : new Date().toISOString(),
    tipo,
    motivo: datos.motivo,
    actorId: datos.actorId,
    actorNombre: datos.actorNombre,
    estadoAnterior: anterior,
    publicacionRetirada: datos.publicacionRetirada ?? false,
    // POR DISEÑO: la baja/venta conserva TODO el histórico (2.9).
    conservaHistorico: true,
  };
}

function aplicarCambioPatrimonial(
  inmueble: Inmueble,
  nuevoEstado: EstadoPatrimonial,
  datos: DatosOperacionPatrimonial
): Inmueble {
  const actual = estadoPatrimonialDe(inmueble);
  const validacion = validarTransicion(actual, nuevoEstado);
  if (!validacion.permitida) {
    // No se improvisa: la operación se rechaza y el motivo llega a la UI.
    throw new Error(
      validacion.motivo ?? `Transición no permitida de ${actual} a ${nuevoEstado}.`
    );
  }

  const fecha = datos.fecha ? new Date(datos.fecha).toISOString() : new Date().toISOString();
  const esSalida = ESTADOS_HISTORICO.includes(nuevoEstado);

  // El spread conserva ABSOLUTAMENTE TODO lo demás: contratos, recibos, gastos,
  // documentos, IBI, suministros, titularidades, suministros… (2.9).
  return {
    ...inmueble,
    estadoPatrimonial: nuevoEstado,
    ...(esSalida
      ? {
          bajaPatrimonial: construirBaja(
            nuevoEstado === 'VENDIDO' ? 'VENTA' : nuevoEstado === 'TRANSMITIDO' ? 'TRANSMISION' : 'BAJA_DEFINITIVA',
            actual,
            datos
          ),
          fechaVenta: nuevoEstado === 'VENDIDO' ? fecha : inmueble.fechaVenta,
        }
      : {}),
  };
}

/**
 * 2.8 · MARCAR COMO VENDIDO.
 *
 * NO borra el documento y NO borra nada de lo asociado (2.9):
 *   · el inmueble sale de la CARTERA ACTIVA (`esCarteraActiva` → false);
 *   · sigue siendo ALCANZABLE desde el HISTÓRICO (`esHistorico` → true);
 *   · conserva contratos, recibos, gastos, documentos, fiscalidad y titularidad.
 */
export function marcarVendido(inmueble: Inmueble, datos: DatosOperacionPatrimonial = {}): Inmueble {
  return aplicarCambioPatrimonial(inmueble, 'VENDIDO', datos);
}

/** Transmisión (herencia, aportación, permuta…). Mismas garantías. */
export function marcarTransmitido(
  inmueble: Inmueble,
  datos: DatosOperacionPatrimonial = {}
): Inmueble {
  return aplicarCambioPatrimonial(inmueble, 'TRANSMITIDO', datos);
}

/** 2.11 · Dar de baja patrimonial: el mecanismo NORMAL, no el borrado físico. */
export function darDeBajaPatrimonial(
  inmueble: Inmueble,
  datos: DatosOperacionPatrimonial = {}
): Inmueble {
  return aplicarCambioPatrimonial(inmueble, 'BAJA', datos);
}

/**
 * Poner en venta: sigue en la CARTERA ACTIVA (se está comercializando).
 * La transición se VALIDA igual que las demás: desde VENDIDO no se puede volver
 * a poner en venta sin reactivar antes.
 */
export function ponerEnVenta(inmueble: Inmueble, datos: DatosOperacionPatrimonial = {}): Inmueble {
  return aplicarCambioPatrimonial(inmueble, 'EN_VENTA', datos);
}

/** Revertir a ACTIVO (p. ej. se cancela la venta). */
export function reactivarPatrimonial(
  inmueble: Inmueble,
  datos: DatosOperacionPatrimonial = {}
): Inmueble {
  const actual = estadoPatrimonialDe(inmueble);
  const permitido = actual === 'EN_VENTA' || actual === 'BAJA';
  if (!permitido) {
    throw new Error(`No se puede reactivar un inmueble en estado ${actual}.`);
  }
  // Se eliminan ÚNICAMENTE los campos de la baja; todo lo demás se conserva.
  const { bajaPatrimonial: _baja, fechaVenta: _fechaVenta, ...resto } = inmueble;
  void _baja;
  void _fechaVenta;
  void datos;
  return { ...resto, estadoPatrimonial: 'ACTIVO' };
}

/** Archivar: de VENDIDO/TRANSMITIDO a HISTORICO. Sigue accesible. */
export function archivarEnHistorico(inmueble: Inmueble): Inmueble {
  return aplicarCambioPatrimonial(inmueble, 'HISTORICO', {});
}

/* ------------------------------------------------------------------ */
/* 2.11 · El borrado físico NO es el mecanismo normal                   */
/* ------------------------------------------------------------------ */

/**
 * ¿Se permite el borrado físico de este inmueble?
 *
 * Criterio conservador y NO destructivo: sólo si no tiene ningún rastro de
 * explotación ni titularidad, es decir, si no hay NADA que perder. En cualquier
 * otro caso la operación correcta es `darDeBajaPatrimonial` / `marcarVendido`.
 */
export function esBorrableFisicamente(inmueble: Inmueble): { ok: boolean; motivo: string } {
  const conContrato = Boolean(inmueble.contratoActivoId);
  const conHistorial = esHistorico(inmueble);

  if (conContrato) {
    return {
      ok: false,
      motivo:
        'El inmueble tiene contrato vinculado. El borrado físico destruiría trazabilidad: ' +
        'usa "Dar de baja" o "Marcar como vendido".',
    };
  }
  if (conHistorial) {
    return {
      ok: false,
      motivo:
        'El inmueble ya forma parte del histórico patrimonial. Borrarlo destruiría el historial: ' +
        'el histórico es precisamente el lugar donde debe seguir estando.',
    };
  }
  return {
    ok: true,
    motivo:
      'Sin contrato ni histórico: no hay trazabilidad que perder. Aun así, la operación ' +
      'recomendada sigue siendo la baja patrimonial.',
  };
}

/**
 * 2.9 · Verificación explícita de conservación.
 * Devuelve las claves cuyo valor cambiaría al marcar como vendido.
 * La garantía es que SÓLO pueden cambiar las claves del eje patrimonial.
 */
export function clavesAfectadasPorVenta(inmueble: Inmueble): string[] {
  const antes = inmueble as unknown as Record<string, unknown>;
  const despues = marcarVendido(inmueble) as unknown as Record<string, unknown>;
  const claves = new Set<string>([...Object.keys(antes), ...Object.keys(despues)]);
  const afectadas: string[] = [];
  claves.forEach((k) => {
    if (JSON.stringify(antes[k]) !== JSON.stringify(despues[k])) afectadas.push(k);
  });
  return afectadas.sort();
}

/** Claves que la venta tiene PERMITIDO modificar (y nada más). */
export const CLAVES_PERMITIDAS_EN_VENTA = [
  'estadoPatrimonial',
  'bajaPatrimonial',
  'fechaVenta',
] as const;
