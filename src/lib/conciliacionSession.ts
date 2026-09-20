/**
 * PUENTE DE SESIÓN — Conciliación bancaria (GAP 6) → Tesorería (BLOQUE B).
 * (integración canónica 2026-09-20)
 *
 * El motor de conciliación bancaria (GAP 6) trabaja con movimientos importados
 * por sesión (CSV/OFX/MT940/Norma43) y sus propuestas de conciliación en
 * memoria; no tiene persistencia propia en Firestore (estado actual del GAP 6).
 *
 * Este módulo es un ESPEJO DE SESIÓN aditivo: la sección de Conciliación
 * registra en él los movimientos y las propuestas (sin alterar su lógica) y
 * la sección de Tesorería lo suscribe para ofrecer el selector de EVIDENCIA
 * de pago de liquidaciones a partir de movimientos con propuesta CONFIRMADA
 * (cadena propietario→liquidación→orden→PAIN.001→evidencia→conciliación).
 *
 * Sin conciliación automática aquí: solo se expone la evidencia de un
 * movimiento ya conciliado/confirmado por el GAP 6.
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
 * Registra movimientos importados (idempotente por `hashIdempotencia`,
 * la misma clave de deduplicación que usa el GAP 6).
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
 * Registra/actualiza propuestas de conciliación (idempotente por `id`:
 * la última versión por id es la que se conserva — refleja el estado actual
 * del GAP 6 tras confirmar/rechazar).
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
