/**
 * B4 — Clasificación de duplicados (§10) sobre el dedup B2 (reutilizado).
 *
 * Capa PURA. Mapeo B2 → B4:
 *  · YA_IMPORTADO / DUPLICADO_EXACTO / COLISION ⇒ EXACTO (bloquea AUTO).
 *  · DUPLICADO_ORIGEN / POSIBLE_DUPLICADO     ⇒ PROBABLE (tope REVISIÓN),
 *    salvo recurrencia mensual legítima (mismo concepto, distinto mes).
 *  · INCOMPATIBLE (mismo origen, distinto contenido) ⇒ no es duplicado:
 *    es CONFLICTO (el motor lo marca BLOQUEADO por conflicto).
 *  · NUEVO ⇒ NINGUNO.
 *
 * NUNCA elimina ni fusiona: solo clasifica y enlaza (`con`).
 */
import {
  clasificarDuplicidad,
  claveImporteInmuebleCategoria,
  huellaCobro,
  huellaExacta,
  huellaFuerte,
  indicesDesdeExistentes,
  registrarEnIndices,
  type CandidatoDedup,
  type IndicesDedup,
  type RegistroExistenteRef,
  type VeredictoDedup,
} from '../importacion/dedup';
import type { ClasificacionDuplicado, ExistenteDestino } from './tipos';

export interface HuellasLinea {
  claveOrigen: string | null;
  huella: string | null;
  huellaFuerte: string | null;
  claveImporte: string | null;
  idDestino: string | null;
  fechaDevengo: string | null;
  conceptoNorm: string | null;
}

/** Calcula huellas B2 para un gasto/cobro con inmueble destino conocido. */
export function huellasGasto(p: {
  inmuebleId: string | null;
  importe: number | null;
  categoria: string | null;
  fechaDevengo: string | null;
  concepto: string | null;
  claveOrigen: string | null;
  idDestino: string | null;
}): HuellasLinea {
  const base = {
    claveOrigen: p.claveOrigen,
    huella: null as string | null,
    huellaFuerte: null as string | null,
    claveImporte: null as string | null,
    idDestino: p.idDestino,
    fechaDevengo: p.fechaDevengo,
    conceptoNorm: typeof p.concepto === 'string' ? p.concepto.trim().toLowerCase().replace(/\s+/g, ' ') : null,
  };
  if (p.inmuebleId === null || p.importe === null || p.categoria === null || p.concepto === null) return base;
  const input = {
    inmuebleId: p.inmuebleId,
    importe: p.importe,
    categoria: p.categoria,
    fechaDevengo: p.fechaDevengo ?? undefined,
    concepto: p.concepto,
  };
  return {
    ...base,
    huella: huellaExacta(input),
    huellaFuerte: huellaFuerte(input),
    claveImporte: claveImporteInmuebleCategoria(p.inmuebleId, p.importe, p.categoria),
  };
}

/** Calcula huellas B2 para un cobro (periodo mes/año en lugar de fecha). */
export function huellasCobro(p: {
  inmuebleId: string | null;
  importe: number | null;
  mes: number | null;
  anio: number | null;
  concepto: string | null;
  claveOrigen: string | null;
  idDestino: string | null;
}): HuellasLinea {
  const base: HuellasLinea = {
    claveOrigen: p.claveOrigen, huella: null, huellaFuerte: null, claveImporte: null,
    idDestino: p.idDestino, fechaDevengo: null, conceptoNorm: null,
  };
  if (p.inmuebleId === null || p.importe === null || p.concepto === null) return base;
  return { ...base, huella: huellaCobro({ inmuebleId: p.inmuebleId, importe: p.importe, mes: p.mes, anio: p.anio, concepto: p.concepto }) };
}

export function indicesDesdeExistentesDestino(existentes: readonly ExistenteDestino[]): IndicesDedup {
  const refs: RegistroExistenteRef[] = existentes.map((e) => ({
    id: e.destinoId,
    claveOrigen: e.claveOrigen ?? null,
    huellaContenido: e.huellaExacta ?? null,
    huellaFuerteContenido: e.huellaFuerte ?? null,
    claveImporte: e.claveImporteInmuebleCategoria ?? null,
  }));
  return indicesDesdeExistentes(refs);
}

export function registrarHuellas(indices: IndicesDedup, h: HuellasLinea, migrationKey: string): void {
  registrarEnIndices(indices, {
    id: h.idDestino ?? migrationKey,
    claveOrigen: h.claveOrigen,
    huellaContenido: h.huella,
    huellaFuerteContenido: h.huellaFuerte,
    claveImporte: h.claveImporte,
  });
}

function mesDeFechaDevengo(iso: string | null): string | null {
  const m = typeof iso === 'string' ? iso.match(/^(\d{4})-(\d{2})-\d{2}$/) : null;
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * Recurrencia mensual legítima: misma huella fuerte (concepto+importe+
 * inmueble+categoría) pero meses distintos ⇒ registros legítimamente
 * repetidos (cuotas), NO duplicado probable.
 */
export function esRecurrenciaLegitima(
  actual: HuellasLinea,
  previaFechaDevengo: string | null,
  previaConceptoNorm: string | null,
): boolean {
  if (!actual.huellaFuerte || !actual.fechaDevengo || !actual.conceptoNorm) return false;
  if (!previaFechaDevengo || !previaConceptoNorm) return false;
  if (actual.conceptoNorm !== previaConceptoNorm) return false;
  const mesActual = mesDeFechaDevengo(actual.fechaDevengo);
  const mesPrevio = mesDeFechaDevengo(previaFechaDevengo);
  return mesActual !== null && mesPrevio !== null && mesActual !== mesPrevio;
}

export interface VeredictoB4 {
  clasificacion: ClasificacionDuplicado;
  /** true cuando el veredicto B2 subyacente es un conflicto (no duplicado). */
  esConflicto: boolean;
  veredictoB2: VeredictoDedup;
}

/** Clasifica con B2 y traduce a vocabulario B4 (§10). Determinista. */
export function clasificarB4(
  h: HuellasLinea,
  indices: IndicesDedup,
  previas: ReadonlyMap<string, { fechaDevengo: string | null; conceptoNorm: string | null }>,
): VeredictoB4 {
  const cand: CandidatoDedup = {
    idDestino: h.idDestino,
    clave: h.claveOrigen,
    huella: h.huella,
    huellaFuerte: h.huellaFuerte ?? null,
    claveImporte: h.claveImporte,
  };
  const v = clasificarDuplicidad(cand, indices);
  const con = [...v.contra].sort();
  switch (v.estado) {
    case 'NUEVO':
      return { clasificacion: { tipo: 'NINGUNO', con: [], motivo: 'sin coincidencia en índices (origen, contenido, importe)' }, esConflicto: false, veredictoB2: v };
    case 'YA_IMPORTADO':
      return { clasificacion: { tipo: 'EXACTO', con, motivo: `mismo origen y mismo contenido (reimportación idempotente; no migrar de nuevo)${v.motivo ? `: ${v.motivo}` : ''}` }, esConflicto: false, veredictoB2: v };
    case 'DUPLICADO_EXACTO':
      return { clasificacion: { tipo: 'EXACTO', con, motivo: 'distinto origen, contenido idéntico (mismo inmueble+importe+categoría+fecha+concepto)' }, esConflicto: false, veredictoB2: v };
    case 'COLISION':
      return { clasificacion: { tipo: 'EXACTO', con, motivo: 'id destino ocupado por OTRO origen (colisión de id determinista)' }, esConflicto: true, veredictoB2: v };
    case 'INCOMPATIBLE':
      return { clasificacion: { tipo: 'NINGUNO', con, motivo: 'mismo origen pero contenido distinto (requiere refresco con revisión; es conflicto, no duplicado)' }, esConflicto: true, veredictoB2: v };
    case 'DUPLICADO_ORIGEN':
    case 'POSIBLE_DUPLICADO': {
      const prevKey = con[0];
      const prev = prevKey ? previas.get(prevKey) : undefined;
      if (prev && esRecurrenciaLegitima(h, prev.fechaDevengo, prev.conceptoNorm)) {
        return { clasificacion: { tipo: 'LEGITIMO', con, motivo: 'recurrencia mensual legítima (mismo concepto+importe, distinto mes)' }, esConflicto: false, veredictoB2: v };
      }
      return {
        clasificacion: {
          tipo: 'PROBABLE', con,
          motivo: v.estado === 'DUPLICADO_ORIGEN'
            ? 'mismo inmueble+importe+categoría+concepto, fecha distinta (caso 354,78 €: se enlazan, NO se fusionan)'
            : 'mismo inmueble+importe+categoría, concepto/fecha distintos (posible duplicado)',
        },
        esConflicto: false,
        veredictoB2: v,
      };
    }
  }
}
