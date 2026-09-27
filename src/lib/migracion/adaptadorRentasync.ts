/**
 * B4 — Adaptador Rentasync → RegistroHistorico.
 *
 * Reutiliza el normalizador B1 (`normalizarMovimiento`/`normalizarInmueble`):
 * no duplica reglas de mapeo FASE 2. Cada registro conserva proveniencia
 * completa (§6): sistema, fichero, id original (o `__ID_NO_RECUPERADO_*`),
 * versión de esquema y cadena de transformación.
 *
 * Capa PURA (B1 es puro).
 */
import {
  normalizarInmueble,
  normalizarMovimiento,
  type CtxNormalizacion,
} from '../importacion/normalizar';
import { SISTEMA_ORIGEN_RENTASYNC, type RegistroInmuebleExterno, type RegistroMovimientoExterno } from '../importacion/tipos';
import { ESQUEMA_IMPORTACION_VERSION } from '../importacion/contratoMigracion';
import type { RegistroHistorico } from './tipos';

export interface CtxAdaptadorRentasync extends CtxNormalizacion {
  /** Fichero custodiado del que procede el registro (anexo/documento). */
  sourceFile: string;
}

function baseProveniencia(ctx: CtxAdaptadorRentasync, origenId: string | null, indice: number) {
  return {
    source: SISTEMA_ORIGEN_RENTASYNC,
    sourceFile: ctx.sourceFile,
    sourceId: origenId ?? `__ID_NO_RECUPERADO_${indice}`,
    sourceVersion: ESQUEMA_IMPORTACION_VERSION,
    cadena: ['B1:normalizarRentasync'] as readonly string[],
  };
}

/** Movimiento (gasto/cobro/truncado) → RegistroHistorico con normalizado B1. */
export function adaptarMovimientoRentasync(
  reg: RegistroMovimientoExterno,
  ctx: CtxAdaptadorRentasync,
  indice = 0,
): RegistroHistorico {
  const n = normalizarMovimiento(reg, ctx);
  const origenId = typeof reg.id === 'string' && reg.id ? reg.id : null;
  const entidad = n.entidad === 'GASTO' || n.entidad === 'COBRO' ? n.entidad : n.entidad;
  return {
    entidad,
    proveniencia: baseProveniencia(ctx, origenId, indice),
    datos: { ...(reg as Record<string, unknown>) },
    normalizado: {
      entidad: n.entidad,
      destino: { ...(n.destino as Record<string, unknown>) },
      transformaciones: n.transformaciones.map((t) => ({ ...t })),
      incidencias: n.incidencias.map((i) => ({ ...i })),
      camposRequierenValidacion: [...n.camposRequierenValidacion],
      bloqueado: n.bloqueado,
      motivoBloqueo: n.motivoBloqueo,
    },
  };
}

/** Inmueble externo → RegistroHistorico con normalizado B1. */
export function adaptarInmuebleRentasync(
  reg: RegistroInmuebleExterno,
  ctx: CtxAdaptadorRentasync,
  indice = 0,
): RegistroHistorico {
  const n = normalizarInmueble(reg, ctx);
  const origenId = typeof reg.id === 'string' && reg.id ? reg.id : null;
  return {
    entidad: n.entidad === 'INMUEBLE' ? 'INMUEBLE' : n.entidad,
    proveniencia: baseProveniencia(ctx, origenId, indice),
    datos: { ...(reg as Record<string, unknown>) },
    normalizado: {
      entidad: n.entidad,
      destino: { ...(n.destino as Record<string, unknown>) },
      transformaciones: n.transformaciones.map((t) => ({ ...t })),
      incidencias: n.incidencias.map((i) => ({ ...i })),
      camposRequierenValidacion: [...n.camposRequierenValidacion],
      bloqueado: n.bloqueado,
      motivoBloqueo: n.motivoBloqueo,
    },
  };
}
