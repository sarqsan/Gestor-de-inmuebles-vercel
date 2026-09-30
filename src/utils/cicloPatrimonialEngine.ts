/**
 * CICLO PATRIMONIAL DEL INMUEBLE (baja / vendido + histórico)
 * ============================================================
 * Motor puro. Separa tres conceptos que el sistema NO puede confundir:
 *
 *  · TITULARIDAD ACTUAL      → quién es titular HOY (`titularidades`).
 *  · HISTORIAL PATRIMONIAL   → titularidades CERRADAS (siguen consultables).
 *  · BAJA / VENDIDO          → estado del inmueble como entidad física.
 *
 * Y deja claro lo que NO es: **la baja patrimonial NO es un borrado**. El
 * documento del inmueble permanece, con su histórico, y sigue siendo legible.
 */
import type {
  BajaPatrimonial,
  EstadoExplotacion,
  EstadoPatrimonial,
  Inmueble,
  MotivoBajaPatrimonial,
} from '../types';

export const ESTADO_PATRIMONIAL_LABEL: Record<EstadoPatrimonial, string> = {
  ACTIVO: 'Activo',
  VENDIDO: 'Vendido',
  BAJA: 'Baja',
};

export const ESTADO_EXPLOTACION_LABEL: Record<EstadoExplotacion, string> = {
  EN_EXPLOTACION: 'En explotación',
  SIN_EXPLOTACION: 'Sin explotación',
};

/** Estado patrimonial efectivo (los inmuebles antiguos no tienen el campo). */
export function estadoPatrimonialDe(inmueble: Inmueble | null | undefined): EstadoPatrimonial {
  const e = inmueble?.estadoPatrimonial;
  return e === 'VENDIDO' || e === 'BAJA' ? e : 'ACTIVO';
}

export function estadoExplotacionDe(inmueble: Inmueble | null | undefined): EstadoExplotacion {
  return inmueble?.estadoExplotacion === 'SIN_EXPLOTACION' ? 'SIN_EXPLOTACION' : 'EN_EXPLOTACION';
}

/** ¿El inmueble está dado de baja (vendido o baja)? */
export function inmuebleDadoDeBaja(inmueble: Inmueble | null | undefined): boolean {
  return estadoPatrimonialDe(inmueble) !== 'ACTIVO';
}

export interface SolicitudBaja {
  fecha: string; // ISO: fecha EFECTIVA de la baja/venta
  motivo: MotivoBajaPatrimonial;
  detalle?: string;
  actor?: { id?: string; nombre?: string };
}

export interface ResultadoBaja {
  ok: boolean;
  errores: string[];
  /** Parche a aplicar sobre el inmueble (NUNCA un borrado). */
  parche?: Partial<Inmueble>;
}

/**
 * Da de baja un inmueble. Devuelve el PARCHE (cambio de estado + trazabilidad),
 * nunca una eliminación. El registro anterior se conserva en el histórico.
 */
export function darDeBajaInmueble(inmueble: Inmueble, solicitud: SolicitudBaja): ResultadoBaja {
  const errores: string[] = [];
  if (!inmueble?.id) errores.push('Falta el inmueble.');
  if (!solicitud?.fecha) errores.push('Falta la fecha efectiva de la baja.');
  if (!solicitud?.motivo) errores.push('Falta el motivo de la baja.');
  if (errores.length > 0) return { ok: false, errores };

  const registro: BajaPatrimonial = {
    fecha: solicitud.fecha,
    motivo: solicitud.motivo,
    detalle: solicitud.detalle?.trim() || undefined,
    usuarioId: solicitud.actor?.id,
    usuarioNombre: solicitud.actor?.nombre,
    registradaEn: new Date().toISOString(),
  };

  const historial: BajaPatrimonial[] = [...(inmueble.bajaPatrimonial ? [inmueble.bajaPatrimonial] : [])];

  return {
    ok: true,
    errores: [],
    parche: {
      estadoPatrimonial: solicitud.motivo === 'VENTA' ? 'VENDIDO' : 'BAJA',
      estadoExplotacion: 'SIN_EXPLOTACION',
      bajaPatrimonial: registro,
      fechaVenta: solicitud.motivo === 'VENTA' ? solicitud.fecha : inmueble.fechaVenta,
      // Histórico: se conserva TODO (incluida la baja que se sustituye).
      ...(historial.length > 0 ? { historialBajas: historial } : {}),
    } as Partial<Inmueble>,
  };
}

/**
 * Revierte la baja: el inmueble vuelve a ACTIVO. El registro de la baja NO se
 * borra: queda en `historialBajas` (trazabilidad completa).
 */
export function revertirBajaInmueble(inmueble: Inmueble, actor?: { id?: string; nombre?: string }): ResultadoBaja {
  if (!inmueble?.id) return { ok: false, errores: ['Falta el inmueble.'] };
  if (!inmueble.bajaPatrimonial) return { ok: false, errores: ['El inmueble no está dado de baja.'] };
  const historial: BajaPatrimonial[] = [
    ...(inmueble.historialBajas || []),
    inmueble.bajaPatrimonial,
  ];
  return {
    ok: true,
    errores: [],
    parche: {
      estadoPatrimonial: 'ACTIVO',
      estadoExplotacion: 'EN_EXPLOTACION',
      bajaPatrimonial: undefined,
      fechaVenta: undefined,
      historialBajas: historial,
      notasInternas: `${inmueble.notasInternas ? `${inmueble.notasInternas}\n` : ''}[${new Date().toISOString().slice(0, 10)}] Baja revertida por ${actor?.nombre || 'usuario'}.`,
    } as Partial<Inmueble>,
  };
}

/** ¿Puede seguir operándose el inmueble (altas, contratos…)? */
export function inmuebleOperable(inmueble: Inmueble | null | undefined): boolean {
  return !inmuebleDadoDeBaja(inmueble);
}

/** Motivo por el que no se puede operar (o `null`). */
export function motivoNoOperable(inmueble: Inmueble | null | undefined): string | null {
  if (!inmueble) return 'El inmueble no existe.';
  const estado = estadoPatrimonialDe(inmueble);
  if (estado === 'VENDIDO') return 'El inmueble está VENDIDO: no admite nuevas operaciones (el histórico permanece consultable).';
  if (estado === 'BAJA') return 'El inmueble está dado de BAJA: no admite nuevas operaciones (el histórico permanece consultable).';
  return null;
}
