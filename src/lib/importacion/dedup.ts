/**
 * FASE 4 · B2 — DETECCIÓN DE DUPLICADOS E IDEMPOTENCIA (cálculo puro, sin persistir).
 *
 * Cinco niveles de comparación, claramente distintos (requisito FASE 4):
 *   1. MISMO DOCUMENTO/ORIGEN  → claveOrigen = '{sistema}:{origenId}'
 *   2. MISMO CONTENIDO         → huellaExacta = sha256(inmueble|importe|categoria|fecha|concepto)
 *   3. MISMO IMPORTE           → componente de huellaFuerte / índice por importe
 *   4. MISMO CONCEPTO          → componente de huellaFuerte (concepto normalizado)
 *   5. POSIBLE DUPLICADO       → mismo inmueble+importe+categoría, resto distinto
 *
 * Reglas: NO elimina, NO fusiona. El caso conocido de 354,78 € (INC-05) se
 * conserva como DOS registros de origen distintos, enlazados por veredicto.
 */
import { sha256Hex } from './hash';
import { normalizarConcepto } from './normalizar';

export function idDeterministaGasto(inmuebleId: string, origenId: string): string {
  return `gas_${inmuebleId}_${origenId}`;
}

/** Solo computable cuando exista el contrato destino (FASE 3 §J). */
export function idDeterministaCobro(contratoId: string, anio: number, mes: number): string {
  return `cobro_${contratoId}_${anio}_${mes}`;
}

export function claveOrigen(sistema: string, origenId: string): string {
  return `${sistema}:${origenId}`;
}

export interface HuellaGastoInput {
  inmuebleId: string;
  importe: number;
  categoria: string;
  fechaDevengo?: string;
  concepto: string;
}

/** Nivel 2: contenido exacto (incluye fecha). */
export function huellaExacta(g: HuellaGastoInput): string {
  return sha256Hex([g.inmuebleId, g.importe.toFixed(2), g.categoria, g.fechaDevengo ?? '', normalizarConcepto(g.concepto)].join('|'));
}

/** Niveles 3+4: mismo inmueble + importe + categoría + concepto (fecha fuera). */
export function huellaFuerte(g: HuellaGastoInput): string {
  return sha256Hex([g.inmuebleId, g.importe.toFixed(2), g.categoria, normalizarConcepto(g.concepto)].join('|'));
}

/** Nivel 5: candidato a posible duplicado (importe + inmueble + categoría). */
export function claveImporteInmuebleCategoria(inmuebleId: string, importe: number, categoria: string): string {
  return `${inmuebleId}|${importe.toFixed(2)}|${categoria}`;
}

export function huellaCobro(c: { inmuebleId: string; importe: number; mes: number | null; anio: number | null; concepto: string }): string {
  return sha256Hex([c.inmuebleId, c.importe.toFixed(2), String(c.mes), String(c.anio), normalizarConcepto(c.concepto)].join('|'));
}

export interface RegistroExistenteRef {
  id: string | null; // id destino (si existe)
  claveOrigen: string | null;
  huellaContenido: string | null; // huellaExacta o huellaCobro
  huellaFuerteContenido?: string | null;
  claveImporte?: string | null;
  inmuebleId?: string;
  importe?: number;
  concepto?: string;
}

export interface IndicesDedup {
  porClaveOrigen: Map<string, RegistroExistenteRef>;
  porId: Map<string, RegistroExistenteRef>;
  porHuella: Map<string, RegistroExistenteRef>;
  porHuellaFuerte: Map<string, RegistroExistenteRef>;
  porImporteInmuebleCategoria: Map<string, RegistroExistenteRef>;
}

export function crearIndicesDedup(): IndicesDedup {
  return {
    porClaveOrigen: new Map(),
    porId: new Map(),
    porHuella: new Map(),
    porHuellaFuerte: new Map(),
    porImporteInmuebleCategoria: new Map(),
  };
}

export function registrarEnIndices(indices: IndicesDedup, ref: RegistroExistenteRef): void {
  if (ref.claveOrigen) indices.porClaveOrigen.set(ref.claveOrigen, ref);
  if (ref.id) indices.porId.set(ref.id, ref);
  if (ref.huellaContenido) indices.porHuella.set(ref.huellaContenido, ref);
  if (ref.huellaFuerteContenido) indices.porHuellaFuerte.set(ref.huellaFuerteContenido, ref);
  if (ref.claveImporte) indices.porImporteInmuebleCategoria.set(ref.claveImporte, ref);
}

export function indicesDesdeExistentes(refs: RegistroExistenteRef[]): IndicesDedup {
  const idx = crearIndicesDedup();
  for (const r of refs) registrarEnIndices(idx, r);
  return idx;
}

export type EstadoDedup =
  | 'NUEVO'
  | 'YA_IMPORTADO'      // 1: mismo origen, mismo contenido (reimportación idempotente)
  | 'INCOMPATIBLE'      // 1: mismo origenId pero contenido distinto (requiere --refrescar)
  | 'DUPLICADO_EXACTO'  // 2: distinto origen, contenido idéntico
  | 'DUPLICADO_ORIGEN'  // 3+4: mismo inmueble+importe+categoría+concepto (fecha puede diferir) — caso 354,78 €
  | 'POSIBLE_DUPLICADO' // 5: mismo inmueble+importe+categoría, concepto/fecha distintos
  | 'COLISION';         // id destino ocupado por OTRO origenId

export interface VeredictoDedup {
  estado: EstadoDedup;
  /** ids/claves contra los que se detectó la coincidencia. */
  contra: string[];
  motivo?: string;
}

export interface CandidatoDedup {
  idDestino: string | null;
  clave: string | null;
  huella: string | null;
  huellaFuerte?: string | null;
  claveImporte?: string | null;
}

export function clasificarDuplicidad(cand: CandidatoDedup, indices: IndicesDedup): VeredictoDedup {
  // 1) MISMO DOCUMENTO/ORIGEN
  if (cand.clave) {
    const prev = indices.porClaveOrigen.get(cand.clave);
    if (prev) {
      const mismoContenido = !!cand.huella && prev.huellaContenido === cand.huella;
      return mismoContenido
        ? { estado: 'YA_IMPORTADO', contra: [prev.id ?? prev.claveOrigen ?? cand.clave], motivo: 'Mismo sistema+origenId y mismo contenido: reimportación idempotente.' }
        : { estado: 'INCOMPATIBLE', contra: [prev.id ?? prev.claveOrigen ?? cand.clave], motivo: 'Mismo sistema+origenId pero contenido distinto: requiere modo --refrescar con revisión.' };
    }
  }
  // COLISIÓN de id destino (id ocupado por otro origen)
  if (cand.idDestino) {
    const porId = indices.porId.get(cand.idDestino);
    if (porId && porId.claveOrigen !== cand.clave) {
      return { estado: 'COLISION', contra: [porId.claveOrigen ?? porId.id ?? cand.idDestino], motivo: 'El id determinista ya está ocupado por un registro con distinto origenId.' };
    }
  }
  // 2) MISMO CONTENIDO (distinto origen)
  if (cand.huella) {
    const porHuella = indices.porHuella.get(cand.huella);
    if (porHuella && porHuella.claveOrigen !== cand.clave) {
      return { estado: 'DUPLICADO_EXACTO', contra: [porHuella.id ?? porHuella.claveOrigen ?? ''], motivo: 'Contenido idéntico (importe, categoría, fecha, concepto) con distinto origenId. NO se fusiona.' };
    }
  }
  // 3+4) MISMO IMPORTE + MISMO CONCEPTO (+ inmueble + categoría), fecha puede diferir
  if (cand.huellaFuerte) {
    const porFuerte = indices.porHuellaFuerte.get(cand.huellaFuerte);
    if (porFuerte && porFuerte.claveOrigen !== cand.clave) {
      return {
        estado: 'DUPLICADO_ORIGEN',
        contra: [porFuerte.id ?? porFuerte.claveOrigen ?? ''],
        motivo: 'Mismo inmueble + importe + categoría + concepto; la fecha puede diferir (caso INC-05: 354,78 € ×2). Se conservan AMBOS, enlazados.',
      };
    }
  }
  // 5) POSIBLE DUPLICADO (mismo inmueble+importe+categoría, resto distinto)
  if (cand.claveImporte) {
    const porImporte = indices.porImporteInmuebleCategoria.get(cand.claveImporte);
    if (porImporte && porImporte.claveOrigen !== cand.clave) {
      return { estado: 'POSIBLE_DUPLICADO', contra: [porImporte.id ?? porImporte.claveOrigen ?? ''], motivo: 'Mismo inmueble + importe + categoría con concepto o fecha distintos: posible duplicado, revisar.' };
    }
  }
  return { estado: 'NUEVO', contra: [] };
}
