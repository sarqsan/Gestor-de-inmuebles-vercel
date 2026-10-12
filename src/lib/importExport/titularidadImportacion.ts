/**
 * TITULARIDAD DECLARADA EN UNA IMPORTACIÓN — resolución humana y sin inferencias.
 *
 * La plantilla patrimonial declara porcentajes (`% Propietario 1/2`) y un texto
 * de titularidad, pero **no identifica a los titulares**. Este módulo es PURO:
 *  · recoge los porcentajes declarados (valor original intacto);
 *  · los vincula a titulares SOLO cuando la persona ha resuelto explícitamente
 *    la ranura → `propietarioId` (nada se deduce del orden, del nombre ni del
 *    número de titulares);
 *  · valida el titular contra el catálogo y el ámbito escribible;
 *  · deja PENDIENTE todo lo que no se haya podido resolver, con su motivo;
 *  · NUNCA completa un reparto (si A=60 y de B no consta nada, B queda
 *    pendiente: jamás se asume 40, 50/50 ni 100 %).
 *
 * El resultado alimenta la promoción: por cada relación resuelta se crea la
 * titularidad por el flujo autorizado (`guardarTitularidad`, lote atómico con el
 * índice `inmuebles.titularesIds`); por cada relación pendiente se conserva el
 * valor original en el registro patrimonial importado y se informa.
 */
import type { TitularidadDeclaradaNormalizada } from './normalizar';

/** Ranuras de titularidad que la plantilla puede declarar. */
export type RanuraTitularidad = 1 | 2;

/** Resolución humana de una ranura declarada → titular existente. */
export interface ResolucionTitularImport {
  ranura: RanuraTitularidad;
  propietarioId: string;
}

/** Relación de titularidad lista para persistir (nunca inferida). */
export interface TitularidadResueltaImport {
  ranura: RanuraTitularidad;
  propietarioId: string;
  /**
   * Porcentaje DECLARADO por el archivo (nunca calculado). `null` = el archivo
   * no declara un porcentaje utilizable para esa ranura: la titularidad se crea
   * con porcentaje PENDIENTE (`null`), que es la representación honesta.
   */
  porcentaje: number | null;
  /** Valor original declarado (evidencia). */
  valorOriginal: unknown;
  campoOrigen: string;
}

/** Relación declarada que queda pendiente de resolución, con su motivo. */
export interface RelacionPendienteImport {
  ranura: RanuraTitularidad | null;
  clave: string;
  campoOrigen: string;
  valorOriginal: unknown;
  motivo: string;
}

export interface ResultadoResolucionTitularidad {
  resueltas: TitularidadResueltaImport[];
  pendientes: RelacionPendienteImport[];
  /** Incidencias de la resolución (id inexistente, no permitido, suma > 100). */
  incidencias: string[];
}

/** Catálogo mínimo inyectado (sin I/O). */
export interface CatalogoTitulares {
  propietarios: ReadonlyArray<{ id: string; nombre: string }>;
  /** Ids que el actor puede escribir; `null` = master (sin restricción). */
  propietariosPermitidosIds: readonly string[] | null;
}

/**
 * Resuelve la titularidad declarada con las asignaciones humanas.
 *
 * Invariantes:
 *  · sin asignación para una ranura declarada ⇒ queda PENDIENTE (no se inventa);
 *  · un propietarioId inexistente o fuera del ámbito escribible NO se aplica:
 *    se registra la incidencia y la ranura queda pendiente;
 *  · el porcentaje escrito es SIEMPRE el declarado (o `null`), jamás inferido;
 *  · una suma de porcentajes resueltos > 100 es una contradicción: no se escribe
 *    ninguna titularidad de esa fila (se informa y se conserva todo el original);
 *  · una misma persona no puede ocupar dos ranuras (se informa y se ignora la
 *    segunda: no se duplica la relación).
 */
export function resolverTitularidadDeclarada(p: {
  declarada: TitularidadDeclaradaNormalizada | null;
  /** Asignaciones humanas por ranura (vacío = todo pendiente). */
  resolucion?: readonly ResolucionTitularImport[];
  catalogo: CatalogoTitulares;
}): ResultadoResolucionTitularidad {
  const resueltas: TitularidadResueltaImport[] = [];
  const pendientes: RelacionPendienteImport[] = [];
  const incidencias: string[] = [];
  const declarada = p.declarada;
  if (!declarada) return { resueltas, pendientes, incidencias };

  if (declarada.texto) {
    pendientes.push({
      ranura: null,
      clave: 'titularidadDeclarada.texto',
      campoOrigen: 'Titularidad',
      valorOriginal: declarada.texto,
      motivo: 'TITULARIDAD declarada en texto libre: se conserva como evidencia; no identifica a ningún titular (no se interpreta)',
    });
  }

  const porRanura = new Map<RanuraTitularidad, ResolucionTitularImport>();
  for (const r of p.resolucion ?? []) {
    if (porRanura.has(r.ranura)) {
      incidencias.push(`ranura ${r.ranura}: asignación duplicada («${r.propietarioId}»); se conserva la primera`);
      continue;
    }
    porRanura.set(r.ranura, r);
  }

  const candidatas: TitularidadResueltaImport[] = [];
  const vistos = new Set<string>();
  for (const pct of declarada.porcentajes) {
    const asignacion = porRanura.get(pct.ranura);
    if (!asignacion) {
      pendientes.push({
        ranura: pct.ranura,
        clave: `titularidadDeclarada.propietario${pct.ranura}`,
        campoOrigen: pct.campoOrigen,
        valorOriginal: pct.valorOriginal,
        motivo: `porcentaje declarado ${pct.porcentaje === null ? `'${String(pct.valorOriginal)}' (no utilizable)` : `${pct.porcentaje} %`} SIN titular identificado: requiere resolución explícita (no se reparte ni se asigna por defecto)`,
      });
      continue;
    }
    const propietarioId = asignacion.propietarioId.trim();
    const coincidencias = p.catalogo.propietarios.filter((x) => x.id === propietarioId);
    if (coincidencias.length === 0) {
      incidencias.push(`ranura ${pct.ranura}: el titular '${propietarioId}' no existe en el catálogo (no se inventa)`);
      pendientes.push({
        ranura: pct.ranura,
        clave: `titularidadDeclarada.propietario${pct.ranura}`,
        campoOrigen: pct.campoOrigen,
        valorOriginal: pct.valorOriginal,
        motivo: `resolución descartada: el titular '${propietarioId}' no existe en el catálogo`,
      });
      continue;
    }
    if (coincidencias.length > 1) {
      incidencias.push(`ranura ${pct.ranura}: el titular '${propietarioId}' está duplicado en el catálogo (indeterminable)`);
      pendientes.push({
        ranura: pct.ranura,
        clave: `titularidadDeclarada.propietario${pct.ranura}`,
        campoOrigen: pct.campoOrigen,
        valorOriginal: pct.valorOriginal,
        motivo: `resolución descartada: '${propietarioId}' ambiguo en el catálogo (varias fichas con el mismo id)`,
      });
      continue;
    }
    if (p.catalogo.propietariosPermitidosIds !== null && !p.catalogo.propietariosPermitidosIds.includes(propietarioId)) {
      incidencias.push(`ranura ${pct.ranura}: el titular '${propietarioId}' está fuera del ámbito escribible del actor`);
      pendientes.push({
        ranura: pct.ranura,
        clave: `titularidadDeclarada.propietario${pct.ranura}`,
        campoOrigen: pct.campoOrigen,
        valorOriginal: pct.valorOriginal,
        motivo: `resolución descartada: '${propietarioId}' no está en el ámbito escribible (no se escribe fuera de ámbito)`,
      });
      continue;
    }
    if (vistos.has(propietarioId)) {
      incidencias.push(`ranura ${pct.ranura}: '${propietarioId}' ya ocupa otra ranura de esta misma fila (no se duplica la relación)`);
      pendientes.push({
        ranura: pct.ranura,
        clave: `titularidadDeclarada.propietario${pct.ranura}`,
        campoOrigen: pct.campoOrigen,
        valorOriginal: pct.valorOriginal,
        motivo: `'${propietarioId}' ya tiene una titularidad en esta fila: la segunda ranura queda pendiente`,
      });
      continue;
    }
    vistos.add(propietarioId);
    candidatas.push({
      ranura: pct.ranura,
      propietarioId,
      porcentaje: pct.porcentaje,
      valorOriginal: pct.valorOriginal,
      campoOrigen: pct.campoOrigen,
    });
  }

  // Validación de la suma de porcentajes DECLARADOS y resueltos.
  const conPorcentaje = candidatas.filter((c) => c.porcentaje !== null);
  const suma = conPorcentaje.reduce((acc, c) => acc + (c.porcentaje as number), 0);
  if (suma > 100 + 0.001) {
    incidencias.push(`la suma de porcentajes declarados y resueltos (${suma} %) supera el 100 %: no se escribe ninguna titularidad de esta fila (corrige el origen)`);
    for (const c of candidatas) {
      pendientes.push({
        ranura: c.ranura,
        clave: `titularidadDeclarada.propietario${c.ranura}`,
        campoOrigen: c.campoOrigen,
        valorOriginal: c.valorOriginal,
        motivo: `suma declarada (${suma} %) > 100 %: relación no escrita (el original se conserva)`,
      });
    }
    return { resueltas: [], pendientes, incidencias };
  }

  return { resueltas: candidatas, pendientes, incidencias };
}

/**
 * Vínculo de inquilino declarado (nombre y/o DNI). Es SOLO información: el
 * importador nunca crea contratos ni vínculos ambiguos. Devuelve los contratos
 * que coinciden de forma inequívoca por DNI en el MISMO inmueble para que una
 * persona pueda confirmarlo en el panel.
 */
export function candidatosVinculoInquilino(p: {
  dniDeclarado: string | null;
  inmuebleId: string | null;
  contratos: ReadonlyArray<{ id: string; inmuebleId: string; candidatoDni?: string; candidatoNombre?: string }>;
}): Array<{ contratoId: string; candidatoNombre?: string }> {
  const dni = normalizarDocumento(p.dniDeclarado);
  if (!dni || !p.inmuebleId) return [];
  return p.contratos
    .filter((c) => c.inmuebleId === p.inmuebleId && normalizarDocumento(c.candidatoDni) === dni)
    .map((c) => ({ contratoId: c.id, ...(c.candidatoNombre ? { candidatoNombre: c.candidatoNombre } : {}) }));
}

/** Normaliza un documento de identidad para comparación EXACTA (sin aproximar). */
export function normalizarDocumento(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const limpio = v.replace(/[\s.\-]/g, '').toUpperCase();
  return limpio === '' ? null : limpio;
}
