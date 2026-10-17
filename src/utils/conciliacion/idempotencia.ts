/** Deduplicación P3 por cartera/cuenta: identificador bancario primero, huella estable después. */
import type { MovimientoBancario } from '../../types/conciliacion';
import { huellaEstable } from './validacionExtracto';

export interface ResultadoIdempotencia {
  nuevos: MovimientoBancario[];
  duplicados: MovimientoBancario[];
  total: number;
}

function normalizar(valor?: string): string {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function scopeCuenta(m: MovimientoBancario): string {
  return m.cuentaRef || 'cuenta-no-indicada';
}

function claveIdentificador(m: MovimientoBancario): string | null {
  if (!m.identificadorBanco) return null;
  return `${m.propietarioId}|${scopeCuenta(m)}|ID|${normalizar(m.identificadorBanco)}`;
}

function claveHuella(m: MovimientoBancario): string {
  return `${m.propietarioId}|${scopeCuenta(m)}|HASH|${m.hashIdempotencia}`;
}

/** Hash FNV-1a legado, solo para reconocer movimientos ya persistidos por el GAP6 anterior. */
function hashLegacy(m: MovimientoBancario): string {
  const base = `${m.fechaOperacion}|${Number(m.importe).toFixed(2)}|${String(m.concepto || '').trim().toLowerCase()}|${String(m.referencia || '').trim().toLowerCase()}|${String(m.identificadorBanco || '').trim().toLowerCase()}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < base.length; i += 1) {
    hash ^= base.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function detectarDuplicados(
  nuevosMovimientos: MovimientoBancario[],
  existentes: MovimientoBancario[],
): ResultadoIdempotencia {
  const idsBancarios = new Set<string>();
  const huellas = new Set<string>();
  const huellasLegacy = new Set<string>();
  for (const existente of existentes) {
    if (existente.propietarioId !== nuevosMovimientos[0]?.propietarioId) continue;
    const id = claveIdentificador(existente);
    if (id) idsBancarios.add(id);
    huellas.add(claveHuella(existente));
    huellasLegacy.add(`${existente.propietarioId}|${hashLegacy(existente)}`);
    huellasLegacy.add(`${existente.propietarioId}|${String(existente.hashIdempotencia || '')}`);
  }

  const nuevos: MovimientoBancario[] = [];
  const duplicados: MovimientoBancario[] = [];
  for (const movimiento of nuevosMovimientos) {
    const id = claveIdentificador(movimiento);
    const huella = claveHuella(movimiento);
    const duplicado = (id !== null && idsBancarios.has(id))
      || huellas.has(huella)
      || huellasLegacy.has(`${movimiento.propietarioId}|${hashLegacy(movimiento)}`);
    if (duplicado) duplicados.push(movimiento);
    else nuevos.push(movimiento);
    // Evita duplicados también dentro del mismo archivo (no solo contra lo ya guardado).
    if (id) idsBancarios.add(id);
    huellas.add(huella);
    huellasLegacy.add(`${movimiento.propietarioId}|${hashLegacy(movimiento)}`);
  }
  return { nuevos, duplicados, total: nuevosMovimientos.length };
}

export function generarIdImportacion(
  propietarioId: string,
  origen: string,
  fecha: string,
  nombreFichero?: string,
  hashFichero?: string,
  intentoId?: string,
): string {
  const base = `${propietarioId}|${origen}|${fecha}|${hashFichero || ''}|${nombreFichero || ''}|${intentoId || ''}`;
  return `imp_${huellaEstable(base)}`;
}
