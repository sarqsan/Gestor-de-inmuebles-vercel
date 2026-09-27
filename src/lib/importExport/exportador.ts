/**
 * Exportador canónico: ERP CANÓNICO → SELECT → VALIDATE SCOPE → SERIALIZE → EXPORT.
 *
 * Capa PURA (sin I/O): recibe registros ya leídos (el llamante consulta con
 * sus Rules; aquí se revalida el ámbito en profundidad) y devuelve el archivo
 * como string + sha256. JSON canónico estable y CSV por entidad.
 * No depende de cómo llegó originalmente el dato (solo modelo canónico).
 */
import { sha256Hex } from '../importacion/hash';
import { jsonEstable } from '../migracion/motor';
import type {
  AmbitoAutorizado,
  AmbitoExportacionSolicitado,
  ExportRun,
} from './contrato';
import { EXPORTADOR_CANONICO_VERSION, MARCA_EXPORT_PROPIO } from './contrato';

/** Entidades exportables en v1 (modelo canónico directo). */
export const ENTIDADES_EXPORTABLES: ReadonlyArray<string> = [
  'GASTO', 'COBRO', 'INMUEBLE', 'PROPIETARIO', 'CONTRATO',
];

const COLUMNAS_CSV: Record<string, readonly string[]> = {
  GASTO: ['id', 'inmuebleId', 'propietarioId', 'contratoId', 'tipo', 'categoria', 'concepto', 'proveedor', 'importe', 'estado', 'fechaDevengo', 'fechaPago', 'periodoMesAnio', 'aCargoDe', 'deducible', 'ejercicioFiscal', 'metodoPago', 'origen', 'origenId', 'createdAt', 'updatedAt'],
  COBRO: ['id', 'inmuebleId', 'contratoId', 'inquilinoId', 'propietarioId', 'mes', 'anio', 'periodoMesAnio', 'nombreMes', 'importePrevisto', 'importeRecibido', 'fechaVencimiento', 'fechaPago', 'estado', 'metodoPago', 'observaciones'],
  INMUEBLE: ['id', 'direccion', 'ciudad', 'referenciaCatastral', 'propietarioId', 'propietarioPrincipalId', 'estado', 'tipoInmueble', 'precio', 'rentaMensual', 'superficie', 'habitaciones', 'codigoPostal'],
  PROPIETARIO: ['id', 'nombre', 'nifCif', 'email', 'telefono', 'direccion', 'ciudad', 'codigoPostal'],
  CONTRATO: ['id', 'inmuebleId', 'propietarioId', 'candidatoId', 'candidatoNombre', 'fechaInicio', 'fechaFin', 'rentaMensual', 'estado', 'inmuebleDireccion'],
};

export interface VeredictoAmbito {
  ok: boolean;
  error?: string;
  propietariosEfectivos: string[];
  inmueblesEfectivos: string[] | null; // null = todos los de los propietarios efectivos
  avisos: string[];
}

/**
 * Valida el ámbito solicitado contra el autorizado (defensa en profundidad;
 * las Rules siguen siendo la autorización efectiva). Pura.
 */
export function validarAmbitoExportacion(
  solicitado: AmbitoExportacionSolicitado,
  autorizado: AmbitoAutorizado,
  catalogoInmuebles: ReadonlyArray<{ id: string; propietarioId?: string; propietarioPrincipalId?: string }>,
): VeredictoAmbito {
  const avisos: string[] = [];
  if (!ENTIDADES_EXPORTABLES.includes(solicitado.entidad)) {
    return { ok: false, error: `entidad '${solicitado.entidad}' no exportable en v1 (exportables: ${ENTIDADES_EXPORTABLES.join(', ')})`, propietariosEfectivos: [], inmueblesEfectivos: [], avisos };
  }
  const legibles = autorizado.propietarioIdsLegibles; // null = master (sin restricción)
  let propietariosEfectivos: string[];
  if (solicitado.propietarioIds.length === 0) {
    if (legibles === null) {
      return { ok: false, error: 'master debe indicar propietarioIds explícitos (sin volcado global implícito)', propietariosEfectivos: [], inmueblesEfectivos: [], avisos };
    }
    propietariosEfectivos = [...legibles];
    avisos.push('sin propietarioIds: se exportan todos los legibles');
  } else {
    if (legibles !== null) {
      const fuera = solicitado.propietarioIds.filter((p) => !legibles.includes(p));
      if (fuera.length > 0) {
        return { ok: false, error: `fuera de ámbito: ${fuera.join(', ')} (no legible)`, propietariosEfectivos: [], inmueblesEfectivos: [], avisos };
      }
    }
    propietariosEfectivos = [...solicitado.propietarioIds];
  }
  const efectivos = new Set(propietariosEfectivos);
  const titularDe = (i: { propietarioId?: string; propietarioPrincipalId?: string }): string | null =>
    i.propietarioId ?? i.propietarioPrincipalId ?? null;
  let inmueblesEfectivos: string[] | null = null;
  if (solicitado.inmuebleIds && solicitado.inmuebleIds.length > 0) {
    for (const id of solicitado.inmuebleIds) {
      const ficha = catalogoInmuebles.find((c) => c.id === id);
      if (!ficha) return { ok: false, error: `inmueble '${id}' no encontrado en catálogo`, propietariosEfectivos: [], inmueblesEfectivos: [], avisos };
      const titular = titularDe(ficha);
      if (legibles !== null && (!titular || !efectivos.has(titular))) {
        return { ok: false, error: `inmueble '${id}' fuera de ámbito (titular '${titular ?? '?'}' no autorizado)`, propietariosEfectivos: [], inmueblesEfectivos: [], avisos };
      }
    }
    inmueblesEfectivos = [...solicitado.inmuebleIds];
  }
  if ((solicitado.ejercicios?.length || solicitado.meses?.length) && solicitado.entidad !== 'GASTO' && solicitado.entidad !== 'COBRO') {
    avisos.push(`filtro temporal ignorado para ${solicitado.entidad} (solo aplica a GASTO/COBRO)`);
  }
  return { ok: true, propietariosEfectivos, inmueblesEfectivos, avisos };
}

function ejercicioDe(entidad: string, r: Record<string, unknown>): number | null {
  if (entidad === 'GASTO') {
    if (typeof r['ejercicioFiscal'] === 'number') return r['ejercicioFiscal'] as number;
    if (typeof r['fechaDevengo'] === 'string') {
      const y = Number((r['fechaDevengo'] as string).slice(0, 4));
      return Number.isInteger(y) ? y : null;
    }
    return null;
  }
  if (entidad === 'COBRO') return typeof r['anio'] === 'number' ? (r['anio'] as number) : null;
  return null;
}

function mesDe(entidad: string, r: Record<string, unknown>): string | null {
  if ((entidad === 'GASTO' || entidad === 'COBRO') && typeof r['periodoMesAnio'] === 'string') {
    return r['periodoMesAnio'] as string;
  }
  return null;
}

/** Filtra registros por ámbito efectivo + periodo (puro). */
export function filtrarPorAmbito(
  entidad: string,
  registros: ReadonlyArray<Record<string, unknown>>,
  propietariosEfectivos: readonly string[],
  inmueblesEfectivos: readonly string[] | null,
  ejercicios?: readonly number[],
  meses?: readonly string[],
): Record<string, unknown>[] {
  const props = new Set(propietariosEfectivos);
  const inms = inmueblesEfectivos ? new Set(inmueblesEfectivos) : null;
  return registros.filter((r) => {
    // Titular con el mismo fallback que la validación (auditoría 3ac21a5/D5):
    // sin él, un inmueble con solo propietarioPrincipalId se omitía en silencio.
    const pid = typeof r['propietarioId'] === 'string'
      ? (r['propietarioId'] as string)
      : typeof r['propietarioPrincipalId'] === 'string' ? (r['propietarioPrincipalId'] as string) : null;
    // PROPIETARIO se filtra por su propio id.
    if (entidad === 'PROPIETARIO') {
      if (typeof r['id'] !== 'string' || !props.has(r['id'] as string)) return false;
    } else if (!pid || !props.has(pid)) {
      return false;
    }
    // INMUEBLE se filtra por su propio id (auditoría 3ac21a5/D4): antes se
    // comparaba r['inmuebleId'] (que los inmuebles no tienen) y el filtro se
    // ignoraba, sobre-incluyendo dentro del ámbito.
    const claveInm = entidad === 'INMUEBLE' ? r['id'] : r['inmuebleId'];
    if (inms && typeof claveInm === 'string' && !inms.has(claveInm)) return false;
    if (ejercicios && ejercicios.length > 0 && (entidad === 'GASTO' || entidad === 'COBRO')) {
      const ej = ejercicioDe(entidad, r);
      if (ej === null || !ejercicios.includes(ej)) return false;
    }
    if (meses && meses.length > 0 && (entidad === 'GASTO' || entidad === 'COBRO')) {
      const m = mesDe(entidad, r);
      if (m === null || !meses.includes(m)) return false;
    }
    return true;
  });
}

function escaparCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' && Number.isFinite(v)
    ? (Number.isInteger(v) ? String(v) : v.toFixed(2))
    : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function serializarJson(entityType: string, registros: ReadonlyArray<Record<string, unknown>>, meta: { exportRunId: string; exportedAt: string; scope: AmbitoExportacionSolicitado }): string {
  const ordenados = [...registros].sort((a, b) => String(a['id'] ?? '') < String(b['id'] ?? '') ? -1 : 1);
  return jsonEstable({
    [MARCA_EXPORT_PROPIO]: {
      schemaVersion: EXPORTADOR_CANONICO_VERSION,
      exportRunId: meta.exportRunId,
      exportedAt: meta.exportedAt,
      entityType,
    },
    entityType,
    scope: { ...meta.scope },
    recordCount: ordenados.length,
    records: ordenados,
  });
}

function serializarCsv(entityType: string, registros: ReadonlyArray<Record<string, unknown>>): string {
  const columnas = COLUMNAS_CSV[entityType] ?? [];
  const ordenados = [...registros].sort((a, b) => String(a['id'] ?? '') < String(b['id'] ?? '') ? -1 : 1);
  const filas = ordenados.map((r) => columnas.map((c) => escaparCsv(r[c])).join(','));
  return [columnas.join(','), ...filas].join('\n');
}

/**
 * Ejecuta una exportación (pura; `exportedAt` inyectado para reproducibilidad).
 * Lanza si el ámbito no es válido: nunca exporta fuera de ámbito.
 */
export function ejecutarExportacion(p: {
  solicitado: AmbitoExportacionSolicitado;
  autorizado: AmbitoAutorizado;
  catalogoInmuebles: ReadonlyArray<{ id: string; propietarioId?: string; propietarioPrincipalId?: string }>;
  registros: ReadonlyArray<Record<string, unknown>>;
  exportedAt: string;
  exportedBy?: string | null;
  exportRunId?: string;
}): ExportRun {
  const veredicto = validarAmbitoExportacion(p.solicitado, p.autorizado, p.catalogoInmuebles);
  if (!veredicto.ok) throw new Error(`exportación denegada: ${veredicto.error}`);
  const filtrados = filtrarPorAmbito(
    p.solicitado.entidad, p.registros, veredicto.propietariosEfectivos,
    veredicto.inmueblesEfectivos, p.solicitado.ejercicios, p.solicitado.meses,
  );
  const exportRunId = p.exportRunId
    ?? `exp_${sha256Hex(`IE-EXP:${EXPORTADOR_CANONICO_VERSION}:${jsonEstable(p.solicitado)}:${p.exportedAt}`).slice(0, 12)}`;
  const contenido = p.solicitado.formato === 'JSON'
    ? serializarJson(p.solicitado.entidad, filtrados, { exportRunId, exportedAt: p.exportedAt, scope: p.solicitado })
    : serializarCsv(p.solicitado.entidad, filtrados);
  return {
    exportRunId,
    exportedAt: p.exportedAt,
    exportedBy: p.exportedBy ?? null,
    schemaVersion: EXPORTADOR_CANONICO_VERSION,
    scope: p.solicitado,
    recordCount: filtrados.length,
    formato: p.solicitado.formato,
    sha256: sha256Hex(new TextEncoder().encode(contenido)),
    contenido,
    avisos: [...veredicto.avisos],
  };
}
