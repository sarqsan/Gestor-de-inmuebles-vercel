/**
 * Pipeline del importador canónico: PARSE → MAP → VALIDATE → RESOLVE → DRY-RUN.
 *
 * Capa PURA (sin I/O). Este pipeline NO reimplementa resolución, dedup,
 * fingerprints ni decisiones: construye `RegistroHistorico[]` y delega en
 * B4 (`ejecutarDryRun`), envolviendo después cada línea en `ImportRecord`
 * con mapping y procedencia de importación.
 *
 * Garantías:
 *  · Parcialidad: el fallo de un registro (mapping o estructura) se aísla;
 *    el resto continúa. Un archivo nunca se descarta entero por un registro.
 *  · 0 escrituras: el dry-run solo lee/analiza/mapea/resuelve/clasifica.
 *  · Fingerprint estable: reutiliza `migrationKey` de B4 (no recalcula).
 *  · Normalizado general: cada registro alimenta B4 con su `normalizado`
 *    (destino=canónico, transformaciones del mapping, incidencias del mapping).
 *    Así la fiscalidad viaja clasificada y O7 se reutiliza SIN cambios:
 *    la puerta fiscal (§9) exige deducible explícito, que solo llega por
 *    fuente explícita o parche de decisión humana (`parches`), nunca inferido.
 *    Nota cosmética: B4 etiqueta todo normalizado previo como `B4:B1:…`
 *    (motor intacto; el contenido es del mapping general, visible en el run).
 */
import { sha256Hex } from '../importacion/hash';
import {
  calcularMigrationKey,
  ejecutarDryRun,
  jsonEstable,
} from '../migracion/motor';
import type {
  CatalogosMigracion,
  LineaDryRun,
  RegistroHistorico,
} from '../migracion/tipos';
import type {
  ClasificacionDuplicadoImport,
  FormatoEntrada,
  ImportRecord,
  ImportRun,
  TipoFuente,
} from './contrato';
import {
  ESQUEMA_IMPORT_EXPORT_VERSION,
  FUENTE_EXTERNA_SIN_VERSION,
  IMPORTADOR_CANONICO_VERSION,
  MARCA_EXPORT_PROPIO,
} from './contrato';
import { aplicarMapping, detectarEntidadRentasync, type ResultadoNormalizacion } from './normalizar';
import { generarInformeImportacion } from './informe';

export interface EntradaImportDryRun {
  registrosCrudos: readonly Record<string, unknown>[];
  localizaciones: readonly string[];
  /** Entidad declarada o 'AUTO' (AUTO solo resuelve forma Rentasync; resto → honesto). */
  entityType: string;
  formato: FormatoEntrada;
  sourceName: string;
  /** sha256 de los bytes del fichero (calculado por el llamante). */
  sourceHash: string;
  sourceTamanoBytes: number;
  sourceType: TipoFuente;
  /** Versión declarada por la fuente (export propio) o 'external/unknown'. */
  schemaVersionSource?: string;
  /** Catálogos destino inyectados (snapshots; B4 nunca lee en vivo). */
  catalogos: CatalogosMigracion;
  fechaHora?: string;
  actor?: string;
  /**
   * Enriquecimiento B1 opcional por registro (para fuente RENTASYNC: usar
   * `adaptarMovimientoRentasync`/`adaptarInmuebleRentasync` existentes).
   * Precede al normalizado general (documentado). Nota: B1 marca G-13
   * (aCargoDe/estado/deducible requieren validación) ⇒ tope REVISIÓN:
   * el enriquecimiento B1 sirve a la revisión de migración histórica;
   * la promoción general usa mapping general + decisiones.
   */
  normalizadosB1?: ReadonlyArray<RegistroHistorico['normalizado'] | null>;
  /**
   * Parches de decisión humana por índice (fase DECISION): hoy solo
   * `deducible` confirmado (booleano explícito). Sin parche y sin
   * deducible en fuente, la puerta fiscal O7 excluye (honesto).
   */
  parches?: ReadonlyArray<{ deducible?: boolean } | null>;
}

/** Normalizado general desde el mapping (uniforme para toda fuente). */
function construirNormalizadoGeneral(
  entidad: string,
  mapping: ResultadoNormalizacion,
  parche?: { deducible?: boolean } | null,
): NonNullable<RegistroHistorico['normalizado']> {
  return {
    entidad,
    destino: {
      ...mapping.canonico,
      ...(parche?.deducible !== undefined ? { deducible: parche.deducible } : {}),
    },
    transformaciones: mapping.mapeos
      .filter((m) => m.regla.includes('transformacion:') || m.regla.startsWith('alias:'))
      .map((m) => ({ campo: `${m.campoOrigen}→${m.campoCanonico}`, regla: m.regla, clasificacion: 'B' })),
    incidencias: mapping.incidencias.map((i) => ({
      codigo: 'MAPEO_GENERAL',
      detalle: `${i.campo}: ${i.detalle}`,
      severidad: i.severidad,
    })),
    camposRequierenValidacion: [],
    bloqueado: false,
  };
}

/** Marca de exportación propia en un JSON parseado (raíz objeto). */
export function extraerMarcaExportPropio(raiz: unknown): { schemaVersion: string; entityType: string } | null {
  if (raiz === null || typeof raiz !== 'object' || Array.isArray(raiz)) return null;
  const marca = (raiz as Record<string, unknown>)[MARCA_EXPORT_PROPIO] as
    | { schemaVersion?: unknown; entityType?: unknown }
    | undefined;
  if (!marca || typeof marca !== 'object') return null;
  if (typeof marca['schemaVersion'] !== 'string' || typeof marca['entityType'] !== 'string') return null;
  return { schemaVersion: marca['schemaVersion'], entityType: marca['entityType'] };
}

/**
 * Clasificación de duplicidad del importador, MAPEADA desde B4 (sin nueva lógica):
 *  · CONFLICTO: B4 bloqueó por colisión (mismo destino desde 2 orígenes,
 *    duplicado en lote, conflicto de duplicidad).
 *  · EXACTO: B4 `duplicado.tipo === 'EXACTO'`.
 *  · POSIBLE_DUPLICADO: B4 `duplicado.tipo === 'PROBABLE'`.
 *  · NUEVO: resto (incluye LEGITIMO = recurrencia legítima, con nota).
 */
export function clasificarDuplicadoImport(linea: LineaDryRun): { clase: ClasificacionDuplicadoImport; motivo: string } {
  if (
    linea.motivo.includes('mismo destino') && linea.motivo.includes('propuesto por 2 orígenes')
    || linea.motivo.includes('duplicado en el lote')
    || linea.motivo.includes('conflicto de duplicidad')
  ) {
    return { clase: 'CONFLICTO', motivo: linea.motivo };
  }
  if (linea.duplicado.tipo === 'EXACTO') return { clase: 'EXACTO', motivo: linea.duplicado.motivo };
  if (linea.duplicado.tipo === 'PROBABLE') return { clase: 'POSIBLE_DUPLICADO', motivo: linea.duplicado.motivo };
  if (linea.duplicado.tipo === 'LEGITIMO') {
    return { clase: 'NUEVO', motivo: `nuevo (B4: recurrencia legítima — ${linea.duplicado.motivo})` };
  }
  return { clase: 'NUEVO', motivo: linea.duplicado.motivo };
}

interface RegistroPreparado {
  historico: RegistroHistorico;
  mapping: ResultadoNormalizacion;
  indice: number;
  localizacion: string;
}

export function ejecutarImportDryRun(entrada: EntradaImportDryRun): ImportRun {
  const fechaHora = entrada.fechaHora ?? null;
  const actor = entrada.actor ?? null;
  const schemaSource = entrada.schemaVersionSource ?? FUENTE_EXTERNA_SIN_VERSION;
  const importRunId = `imp_${sha256Hex(`IE:${entrada.sourceHash}:${entrada.entityType}:${ESQUEMA_IMPORT_EXPORT_VERSION}`).slice(0, 12)}`;
  const fuente = entrada.sourceType === 'ERP_EXPORT' ? 'ERP' : 'EXTERNAL';

  // 1) MAP por registro, con aislamiento de fallos.
  const preparados: RegistroPreparado[] = [];
  const erroresEstructurales: ImportRecord[] = [];
  entrada.registrosCrudos.forEach((crudo, indice) => {
    const localizacion = entrada.localizaciones[indice] ?? `registro ${indice}`;
    try {
      const entidad = entrada.entityType === 'AUTO'
        ? (detectarEntidadRentasync(crudo) ?? 'DESCONOCIDA')
        : entrada.entityType;
      const mapping = aplicarMapping(entidad, crudo);
      const idCrudo = crudo['id'];
      const sourceRecordId = typeof idCrudo === 'string' && idCrudo.trim() !== ''
        ? idCrudo.trim()
        : `__ID_NO_RECUPERADO_IE_${indice}`;
      const parche = entrada.parches?.[indice] ?? null;
      const baseB1 = entrada.normalizadosB1?.[indice] ?? null;
      const general = construirNormalizadoGeneral(entidad, mapping, parche);
      const normalizado = baseB1
        ? {
            ...baseB1,
            destino: {
              ...(baseB1.destino as Record<string, unknown>),
              ...(parche?.deducible !== undefined ? { deducible: parche.deducible } : {}),
            },
          }
        : general;
      // B4 lee la fusión crudo+canónico (el canónico manda); el clon íntegro
      // conserva los campos desconocidos como evidencia.
      const datos = { ...crudo, ...mapping.canonico };
      preparados.push({
        historico: {
          entidad,
          proveniencia: {
            source: fuente,
            sourceFile: entrada.sourceName,
            sourceId: sourceRecordId,
            sourceVersion: schemaSource,
          },
          datos,
          normalizado,
        },
        mapping,
        indice,
        localizacion,
      });
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e);
      erroresEstructurales.push({
        importRunId,
        indiceOrigen: indice,
        sourceRecordId: `__ERROR_IE_${indice}`,
        sourcePath: localizacion,
        entityType: entrada.entityType,
        canonicalData: {},
        originalDataReference: { registroHash: sha256Hex(jsonEstable(crudo)), fichero: entrada.sourceName },
        fieldMappings: [],
        provenance: {
          source: fuente, sourceFile: entrada.sourceName,
          sourceId: `__ERROR_IE_${indice}`, sourceVersion: schemaSource, importRunId,
        },
        estado: 'BLOQUEADO',
        decision: 'BLOQUEADO',
        motivo: `error de mapping (aislado; el resto continúa): ${detalle}`,
        evidencias: [],
        fingerprint: sha256Hex(jsonEstable({ crudo, indice })),
        destinationId: null,
        destinoColeccion: null,
        operacion: null,
        duplicado: 'NUEVO',
        motivoDuplicado: 'no evaluado (error de mapping)',
        propietarioDestinoId: null,
        inmuebleDestinoId: null,
        camposDesconocidos: Object.keys(crudo),
        warnings: [],
        conflictos: [`error de mapping: ${detalle}`],
      });
    }
  });

  // 2) RESOLVE + DRY-RUN en B4 (motor reutilizado, sin cambios).
  // Colas por clave (auditoría 3ac21a5/D9): dos registros con el mismo
  // sourceId comparten migrationKey; B4 los procesa en orden de índice
  // (mismo orden en su salida) y marca duplicadoEnLote al segundo. Un mapa
  // 1:1 atribuía a ambas líneas la trazabilidad del ÚLTIMO preparado.
  const colasPorClave = new Map<string, RegistroPreparado[]>();
  for (const p of preparados) {
    const k = calcularMigrationKey(p.historico.proveniencia, p.historico.entidad);
    const cola = colasPorClave.get(k) ?? [];
    cola.push(p);
    colasPorClave.set(k, cola);
  }
  const dryRun = ejecutarDryRun({
    registros: preparados.map((p) => p.historico),
    catalogos: entrada.catalogos,
    ...(fechaHora ? { fechaHora } : {}),
    ...(actor ? { actor } : {}),
    esquemaVersion: ESQUEMA_IMPORT_EXPORT_VERSION,
    importadorVersion: `${IMPORTADOR_CANONICO_VERSION} (frontal general; motor B4)`,
  });

  // 3) Envolver líneas B4 en ImportRecord.
  const registros: ImportRecord[] = dryRun.lineas.map((linea) => {
    const prep = colasPorClave.get(linea.migrationKey)?.shift();
    const mapping = prep?.mapping;
    const dedup = clasificarDuplicadoImport(linea);
    const warnings = [...(mapping?.warnings ?? [])];
    for (const inc of mapping?.incidencias ?? []) {
      warnings.push(`[${inc.severidad}] ${inc.campo}: ${inc.detalle}`);
    }
    return {
      importRunId,
      indiceOrigen: prep?.indice ?? -1,
      sourceRecordId: linea.proveniencia.sourceId,
      sourcePath: prep?.localizacion ?? '?',
      entityType: linea.entidad,
      canonicalData: { ...(mapping?.canonico ?? {}) },
      originalDataReference: {
        registroHash: linea.proveniencia.sourceHash ?? sha256Hex(jsonEstable(linea.datoOriginal)),
        fichero: entrada.sourceName,
      },
      fieldMappings: [...(mapping?.mapeos ?? [])],
      provenance: { ...linea.proveniencia, importRunId },
      estado: linea.estado,
      decision: linea.decision,
      motivo: linea.motivo,
      evidencias: [...linea.evidencias],
      fingerprint: linea.migrationKey,
      destinationId: linea.destinoPropuesto?.destinoId ?? null,
      destinoColeccion: linea.destinoPropuesto?.coleccion ?? null,
      operacion: linea.destinoPropuesto?.operacion ?? null,
      duplicado: dedup.clase,
      motivoDuplicado: dedup.motivo,
      propietarioDestinoId: linea.propietarioDestinoId,
      inmuebleDestinoId: linea.inmuebleDestinoId,
      camposDesconocidos: [...(mapping?.desconocidos ?? [])],
      warnings,
      conflictos: linea.decision === 'BLOQUEADO' ? [linea.motivo] : [],
    } satisfies ImportRecord;
  });
  registros.push(...erroresEstructurales);
  registros.sort((a, b) => a.indiceOrigen - b.indiceOrigen);

  // 4) Agregados.
  const cuenta = (pred: (r: ImportRecord) => boolean) => registros.filter(pred).length;
  const desconocidos = new Map<string, number>();
  for (const r of registros) {
    for (const c of r.camposDesconocidos) desconocidos.set(c, (desconocidos.get(c) ?? 0) + 1);
  }
  const runSinInforme: ImportRun = {
    importRunId,
    sourceName: entrada.sourceName,
    sourceType: entrada.sourceType,
    sourceHash: entrada.sourceHash,
    formato: entrada.formato,
    importedAt: fechaHora ?? '',
    importedBy: actor,
    schemaVersion: ESQUEMA_IMPORT_EXPORT_VERSION,
    entityType: entrada.entityType,
    totalRecords: entrada.registrosCrudos.length,
    processedRecords: preparados.length,
    importedRecords: cuenta((r) => r.decision === 'AUTO'),
    incompleteRecords: cuenta((r) => r.decision === 'INCOMPLETO'),
    reviewRecords: cuenta((r) => r.decision === 'REVISION'),
    blockedRecords: cuenta((r) => r.decision === 'BLOQUEADO'),
    duplicateRecords: cuenta((r) => r.duplicado === 'EXACTO' || r.duplicado === 'POSIBLE_DUPLICADO'),
    errorRecords: erroresEstructurales.length,
    noMigrables: cuenta((r) => r.decision === 'NO_MIGRABLE'),
    status: 'DRY_RUN_COMPLETADO',
    registros,
    camposDesconocidos: [...desconocidos.entries()]
      .map(([campo, n]) => ({ campo, registros: n }))
      .sort((a, b) => b.registros - a.registros || (a.campo < b.campo ? -1 : 1)),
    dryRun,
    informe: '',
  };
  return { ...runSinInforme, informe: generarInformeImportacion(runSinInforme) };
}
