/**
 * BLOQUE 10 · UX-3 — CANAL DE AVISOS DE OPERACIÓN.
 *
 * Un único punto donde las acciones del ERP informan de su resultado:
 *  · `exito` → «Inmueble guardado correctamente.»
 *  · `error` → «No se ha podido eliminar.»
 *  · `info`  → mensajes de contexto que no son ni éxito ni fallo.
 *
 * Mismo patrón (observable, sin dependencias, sin store global) que el canal de
 * incidencias de datos de UX-2. Reparto de responsabilidades:
 *  · `canalFeedback` → resultado de una OPERACIÓN que el usuario acaba de pulsar.
 *  · `canalIncidencias` (UX-2) → estado de DATOS: lecturas fallidas y fallos de
 *    persistencia en segundo plano (aviso persistente).
 *
 * Reglas: no hay mensajes técnicos (ver `mensajes.ts`), el éxito se autodescarta y
 * el error permanece hasta que la persona usuaria lo descarta.
 */
export type TipoAvisoOperacion = 'exito' | 'error' | 'info';

export interface AvisoOperacion {
  readonly id: string;
  readonly tipo: TipoAvisoOperacion;
  readonly mensaje: string;
  /** Contexto adicional para el usuario (nunca detalle técnico). */
  readonly detalle?: string;
  readonly ocurridoEn: number;
  /** Los avisos de éxito/informativos se cierran solos; los de error no. */
  readonly autocierre: boolean;
}

const MAXIMO_AVISOS = 4;
/** Tiempo que un aviso no-error permanece visible. */
export const MS_AUTOCIERRE = 6000;

let avisos: AvisoOperacion[] = [];
const oyentes = new Set<() => void>();
let secuencia = 0;

function notificar(): void {
  for (const oyente of Array.from(oyentes)) {
    try {
      oyente();
    } catch {
      // Un oyente defectuoso no puede romper el canal.
    }
  }
}

export function suscribirAvisosOperacion(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

export function avisosOperacion(): readonly AvisoOperacion[] {
  return avisos;
}

export function avisarOperacion(entrada: {
  tipo: TipoAvisoOperacion;
  mensaje: string;
  detalle?: string;
}): AvisoOperacion {
  const aviso: AvisoOperacion = {
    id: `av-${++secuencia}`,
    tipo: entrada.tipo,
    mensaje: entrada.mensaje,
    detalle: entrada.detalle,
    ocurridoEn: Date.now(),
    autocierre: entrada.tipo !== 'error',
  };
  // Los mismos mensajes repetidos no se apilan: se refresca el existente.
  avisos = [aviso, ...avisos.filter((a) => !(a.tipo === aviso.tipo && a.mensaje === aviso.mensaje))].slice(
    0,
    MAXIMO_AVISOS
  );
  notificar();
  return aviso;
}

export function descartarAvisoOperacion(id: string): void {
  const siguiente = avisos.filter((a) => a.id !== id);
  if (siguiente.length === avisos.length) return;
  avisos = siguiente;
  notificar();
}

/** Sólo para pruebas. */
export function reiniciarAvisosOperacion(): void {
  avisos = [];
  notificar();
}
