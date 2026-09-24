/**
 * Idempotencia de importación — CRÍTICO
 * Importar dos veces mismo extracto NO debe duplicar movimientos
 * Preferencia:
 * 1. identificador bancario estable
 * 2. FITID OFX
 * 3. identificador Norma43/MT940
 * 4. hash determinista
 */

import { MovimientoBancario } from '../../types/conciliacion';

export interface ResultadoIdempotencia {
  nuevos: MovimientoBancario[];
  duplicados: MovimientoBancario[];
  total: number;
}

export function detectarDuplicados(
  nuevosMovimientos: MovimientoBancario[],
  existentes: MovimientoBancario[]
): ResultadoIdempotencia {
  const existentesPorIdBanco = new Map<string, MovimientoBancario>();
  const existentesPorHash = new Map<string, MovimientoBancario>();

  for (const ex of existentes) {
    if (ex.identificadorBanco) {
      existentesPorIdBanco.set(ex.identificadorBanco, ex);
    }
    existentesPorHash.set(ex.hashIdempotencia, ex);
  }

  const nuevos: MovimientoBancario[] = [];
  const duplicados: MovimientoBancario[] = [];

  for (const mov of nuevosMovimientos) {
    // 1. identificador bancario estable
    if (mov.identificadorBanco && existentesPorIdBanco.has(mov.identificadorBanco)) {
      duplicados.push(mov);
      continue;
    }
    // 2-4. hash determinista
    if (existentesPorHash.has(mov.hashIdempotencia)) {
      duplicados.push(mov);
      continue;
    }
    nuevos.push(mov);
  }

  return { nuevos, duplicados, total: nuevosMovimientos.length };
}

export function generarIdImportacion(propietarioId: string, origen: string, fecha: string, nombreFichero?: string): string {
  // Determinista para idempotencia: mismo propietario+origen+fecha+fichero => mismo id base
  // Se usa Date.now solo como sufijo opcional si se quiere unicidad, pero para tests debe ser determinista
  const base = `${propietarioId}|${origen}|${fecha}|${nombreFichero||''}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < base.length; i++) {
    hash ^= base.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `imp_${(hash>>>0).toString(16).padStart(8,'0')}`;
}
