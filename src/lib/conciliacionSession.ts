/**
 * PUENTE LEGACY GAP6 → Tesorería (BLOQUE B).
 *
 * La persistencia P3 y sus Rules requieren aún validación con emulador; en todo
 * caso, P3 deliberadamente NO publica importaciones ni sugerencias a este
 * espejo: importar no crea cobros, evidencia aceptada ni altera saldos.
 *
 * El espejo se conserva por compatibilidad con consumidores heredados. Solo
 * una integración futura explícita podrá exponer movimientos con decisión
 * manual CONCILIADO; una propuesta o un justificante aceptado no bastan.
 */
import type { MovimientoBancario, PropuestaConciliacion } from '../types/conciliacion';

export interface SesionConciliacion {
  movimientos: MovimientoBancario[];
  propuestas: PropuestaConciliacion[];
}

type Listener = (sesion: SesionConciliacion) => void;

let movimientosSesion: MovimientoBancario[] = [];
let propuestasSesion: PropuestaConciliacion[] = [];
const listeners = new Set<Listener>();

function notificar(): void {
  listeners.forEach((l) => {
    try {
      l({ movimientos: movimientosSesion, propuestas: propuestasSesion });
    } catch {
      // el espejo nunca rompe el flujo de conciliación
    }
  });
}

/**
 * API de compatibilidad legacy. P3 no la llama ni publica sus documentos en sesión.
 */
export function registrarMovimientosSesion(nuevos: MovimientoBancario[]): void {
  if (!nuevos || nuevos.length === 0) return;
  const ids = new Set(movimientosSesion.map((m) => m.hashIdempotencia));
  const sinDuplicar = nuevos.filter((m) => m.hashIdempotencia && !ids.has(m.hashIdempotencia));
  if (sinDuplicar.length === 0) return;
  movimientosSesion = [...movimientosSesion, ...sinDuplicar];
  notificar();
}

/**
 * API de compatibilidad legacy; no sustituye el historial transaccional append-only de P3.
 */
export function registrarPropuestasSesion(actualizadas: PropuestaConciliacion[]): void {
  if (!actualizadas || actualizadas.length === 0) return;
  const porId = new Map(propuestasSesion.map((p) => [p.id, p]));
  let cambio = false;
  for (const p of actualizadas) {
    const prev = porId.get(p.id);
    if (!prev || prev.estado !== p.estado || prev.puntuacion !== p.puntuacion) cambio = true;
    porId.set(p.id, p);
  }
  if (!cambio) return;
  propuestasSesion = Array.from(porId.values());
  notificar();
}

/** Suscribe el espejo; devuelve la función de suscripción. */
export function suscribirMovimientosSesion(listener: Listener): () => void {
  listeners.add(listener);
  listener({ movimientos: movimientosSesion, propuestas: propuestasSesion });
  return () => {
    listeners.delete(listener);
  };
}
