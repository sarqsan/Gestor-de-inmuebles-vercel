/**
 * Ejecución de la promoción del importador canónico.
 *
 * Dos partes:
 *  1. `planificarPromocion()` — PURA: verifica la barrera O7, intersecta
 *     autorización+selección+ámbito escribible y produce un plan de operaciones.
 *  2. `ejecutarPromocion()` — con I/O SOLO a través del puerto inyectado
 *     `PuertoPersistenciaImport` (testeable con fake; el adaptador real vive
 *     en `src/lib/importExportFirebase.ts` y reutiliza los `save*Firestore`
 *     existentes + `uploadFacturaGasto` + auditoría best-effort).
 *
 * Reglas de promoción (v1, honestas):
 *  · Solo GASTO y COBRO con destino CREAR computable producen escrituras.
 *  · INMUEBLE/PROPIETARIO/CONTRATO AUTO son VINCULAR: el destino ya existe;
 *    no se escribe nada (se registra VINCULADO_SIN_ESCRITURA; sin
 *    sobrescritura sin regla).
 *  · DOCUMENTO/LEGACY_STORAGE: excluidos con motivo (sin colección canónica
 *    standalone en v1 / migración física fuera del importador). La referencia
 *    se conserva en el informe; el binario solo entra por flujo canónico.
 *  · COBRO: la puerta fiscal O7 (§9) excluye cobros (SIN_CLASIFICAR: el
 *    modelo no define categoría fiscal de ingresos, coherente con B1). La
 *    maquinaria (`construirCobroDestino`, `anexarCobro`) está implementada
 *    y probada, pero en v1 ningún cobro supera O7: pendiente real =
 *    decisión de producto sobre clasificación fiscal de ingresos.
 *    NO se relaja la puerta con un parche cosmético.
 *  · B1 G-13: aCargoDe/estado de gasto y estado/vencimiento de cobro exigen
 *    DECISIÓN humana de promoción (inyectada por fingerprint). Sin decisión,
 *    el registro se excluye (no se inventa).
 *  · Idempotencia: destino existente ⇒ YA_EXISTENTE (no se reescribe).
 *  · Aislamiento: un fallo no aborta el resto; informe con detalle por registro.
 */
import { sha256Hex } from '../importacion/hash';
import type {
  CobroPeriodo,
  EstadoCobroAlquiler,
  EstadoGasto,
  Gasto,
} from '../../types';
import type {
  AmbitoAutorizado,
  ImportRecord,
  ImportRun,
} from './contrato';
import {
  autorizacionVigente,
  derivarTokenEjecucion,
  verificarBarrera,
  type AutorizacionMigracion,
} from './promocion';

/** Decisiones humanas de promoción por fingerprint (fase DECISION). */
export interface DecisionPromocion {
  aCargoDe?: 'arrendador' | 'arrendatario';
  estadoGasto?: EstadoGasto;
  estadoCobro?: EstadoCobroAlquiler;
  fechaVencimiento?: string; // YYYY-MM-DD
  /**
   * Deducible CONFIRMADO por el humano durante la DECISIÓN (GASTO).
   * Fuente explícita >> decisión; nunca inferido. El dry-run previo a la
   * autorización lo embebe vía `parches` para que O7 lo vea.
   */
  deducible?: boolean;
}

export interface OperacionPromocion {
  fingerprint: string;
  sourceRecordId: string;
  indiceOrigen: number;
  entidad: 'GASTO' | 'COBRO';
  coleccion: string;
  destinoId: string;
  propietarioDestinoId: string;
}

export interface ExclusionPromocion {
  fingerprint: string;
  sourceRecordId: string;
  motivo: string;
}

export interface PlanPromocion {
  ejecutable: boolean;
  importRunId: string;
  migrationRunId: string;
  operaciones: readonly OperacionPromocion[];
  excluidas: readonly ExclusionPromocion[];
  vinculadasSinEscritura: readonly ExclusionPromocion[];
  condicionesAborto: readonly string[];
}

const ESCRIBIBLES = new Set(['GASTO', 'COBRO']);

/**
 * Contrato destino de un cobro, derivado del destinoId determinista
 * `cobro_{contratoId}_{anio}_{mes}` (B0/B2; contratoId puede contener '_').
 */
export function contratoIdDeDestinoCobro(destinoId: string): string | null {
  const m = /^cobro_(.+)_(\d{4})_(\d{1,2})$/.exec(destinoId);
  return m ? m[1] : null;
}

function escribiblePorAmbito(propietarioId: string | null, ambito: AmbitoAutorizado): boolean {
  if (ambito.esMaster) return true;
  if (!propietarioId) return false;
  return (ambito.propietarioIdsEscribibles ?? []).includes(propietarioId);
}

/**
 * Planifica la promoción (pura). Lanza si la barrera O7 no pasa o la
 * autorización no está vigente: sin barrera no hay plan ejecutable.
 */
export function planificarPromocion(p: {
  autorizacion: AutorizacionMigracion;
  run: ImportRun;
  canonicalBatchSha256: string;
  explicitExecutionToken: string | null;
  seleccionFingerprints?: readonly string[] | null;
  decisiones?: Readonly<Record<string, DecisionPromocion>>;
  ambito: AmbitoAutorizado;
}): PlanPromocion {
  const veredicto = verificarBarrera({
    autorizacion: p.autorizacion,
    canonicalBatchSha256: p.canonicalBatchSha256,
    explicitExecutionToken: p.explicitExecutionToken,
    dryRunActual: p.run.dryRun,
  });
  if (!veredicto.pasa) {
    throw new Error(`promoción bloqueada por barrera O7: ${veredicto.motivos.join(' | ')}`);
  }
  if (!autorizacionVigente(p.autorizacion, p.run.dryRun)) {
    throw new Error('promoción bloqueada: autorización no vigente (el contenido cambió tras autorizar)');
  }
  void derivarTokenEjecucion;
  const incluidos = new Set(
    p.autorizacion.incluidos.map((f) => `${f.source}:${f.sourceId}:${f.entidad}`),
  );
  const operaciones: OperacionPromocion[] = [];
  const excluidas: ExclusionPromocion[] = [];
  const vinculadasSinEscritura: ExclusionPromocion[] = [];
  for (const r of p.run.registros) {
    const clave = `${r.provenance.source}:${r.sourceRecordId}:${r.entityType}`;
    if (!incluidos.has(clave)) {
      excluidas.push({ fingerprint: r.fingerprint, sourceRecordId: r.sourceRecordId, motivo: 'no incluido en la autorización O7' });
      continue;
    }
    if (p.seleccionFingerprints && !p.seleccionFingerprints.includes(r.fingerprint)) {
      excluidas.push({ fingerprint: r.fingerprint, sourceRecordId: r.sourceRecordId, motivo: 'no seleccionado para promoción' });
      continue;
    }
    if (!escribiblePorAmbito(r.propietarioDestinoId, p.ambito)) {
      excluidas.push({ fingerprint: r.fingerprint, sourceRecordId: r.sourceRecordId, motivo: `propietario destino '${r.propietarioDestinoId}' fuera del ámbito escribible` });
      continue;
    }
    if (r.operacion === 'VINCULAR') {
      vinculadasSinEscritura.push({ fingerprint: r.fingerprint, sourceRecordId: r.sourceRecordId, motivo: `VINCULAR ${r.destinoColeccion}/${r.destinationId}: el destino ya existe; sin escritura (sin sobrescritura sin regla)` });
      continue;
    }
    if (!ESCRIBIBLES.has(r.entityType) || r.operacion !== 'CREAR' || !r.destinationId) {
      const motivo = r.entityType === 'DOCUMENTO'
        ? 'documento standalone sin colección canónica en v1: referencia conservada en informe; binario solo por flujo documental'
        : r.entityType === 'LEGACY_STORAGE'
          ? 'legacy Storage: migración física fuera del importador'
          : 'sin destino CREAR computable (requiere confirmación con id asignado)';
      excluidas.push({ fingerprint: r.fingerprint, sourceRecordId: r.sourceRecordId, motivo });
      continue;
    }
    // B1 G-13: decisiones humanas obligatorias.
    const d = p.decisiones?.[r.fingerprint];
    if (r.entityType === 'GASTO' && (!d?.aCargoDe || !d?.estadoGasto)) {
      excluidas.push({ fingerprint: r.fingerprint, sourceRecordId: r.sourceRecordId, motivo: 'requiere decisión humana: aCargoDe + estadoGasto (B1 G-13; no se inventan)' });
      continue;
    }
    if (r.entityType === 'COBRO' && (!d?.estadoCobro || !d?.fechaVencimiento)) {
      excluidas.push({ fingerprint: r.fingerprint, sourceRecordId: r.sourceRecordId, motivo: 'requiere decisión humana: estadoCobro + fechaVencimiento (no se inventan)' });
      continue;
    }
    if (r.entityType === 'COBRO' && d?.fechaVencimiento && !/^\d{4}-\d{2}-\d{2}$/.test(d.fechaVencimiento)) {
      excluidas.push({ fingerprint: r.fingerprint, sourceRecordId: r.sourceRecordId, motivo: `fechaVencimiento '${d.fechaVencimiento}' no ISO (YYYY-MM-DD)` });
      continue;
    }
    operaciones.push({
      fingerprint: r.fingerprint,
      sourceRecordId: r.sourceRecordId,
      indiceOrigen: r.indiceOrigen,
      entidad: r.entityType as 'GASTO' | 'COBRO',
      coleccion: r.destinoColeccion ?? '',
      destinoId: r.destinationId,
      propietarioDestinoId: r.propietarioDestinoId ?? '',
    });
  }
  operaciones.sort((a, b) => (a.fingerprint < b.fingerprint ? -1 : 1));
  const migrationRunId = `imp_run_${sha256Hex(`IE-PROMOVER:${p.run.importRunId}:${p.autorizacion.contenidoSha256}`).slice(0, 12)}`;
  return {
    ejecutable: true,
    importRunId: p.run.importRunId,
    migrationRunId,
    operaciones,
    excluidas,
    vinculadasSinEscritura,
    condicionesAborto: [
      'aborto antes de ejecutar: 0 efecto productivo',
      'fallo por registro: se aísla, el resto continúa; el informe lista cada fallo',
      'destino ya existente: se omite (YA_EXISTENTE), no se reescribe',
    ],
  };
}

// ---------------------------------------------------------------------------
// Constructores de payloads (puros; reglas explícitas y documentadas)
// ---------------------------------------------------------------------------

const CATEGORIAS_FINANCIACION = new Set(['CUOTA_HIPOTECARIA', 'INTERESES_PRESTAMO', 'OTRO_FINANCIACION']);
const MESES_ES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function esUrlHttp(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\//i.test(v.trim());
}

/** Gasto destino. Reglas: tipo por familia de categoría; periodo/ejercicio derivados de fechaDevengo (B1 G-10); deducible solo si explícito. */
export function construirGastoDestino(
  r: ImportRecord,
  decision: DecisionPromocion,
  ctx: { fechaHora: string; actor: string | null },
): Gasto {
  const c = r.canonicalData;
  const categoria = String(c['categoria']);
  const fechaDevengo = String(c['fechaDevengo']);
  const docNombre = typeof c['receiptName'] === 'string' && c['receiptName'].trim() !== '' ? (c['receiptName'] as string).trim() : null;
  const docUrl = esUrlHttp(c['receiptUrl']) ? (c['receiptUrl'] as string).trim() : null;
  return {
    id: r.destinationId as string,
    inmuebleId: r.inmuebleDestinoId as string,
    propietarioId: r.propietarioDestinoId as string,
    ...(typeof c['contratoId'] === 'string' && c['contratoId'] ? { contratoId: c['contratoId'] as string } : {}),
    tipo: CATEGORIAS_FINANCIACION.has(categoria) ? 'FINANCIACION' : 'EXPLOTACION',
    categoria: categoria as Gasto['categoria'],
    concepto: String(c['concepto']),
    ...(typeof c['proveedor'] === 'string' && c['proveedor'] ? { proveedor: c['proveedor'] as string } : {}),
    importe: c['importe'] as number,
    estado: decision.estadoGasto as EstadoGasto,
    fechaDevengo,
    ...(typeof c['fechaPago'] === 'string' && c['fechaPago'] ? { fechaPago: c['fechaPago'] as string } : {}),
    periodoMesAnio: fechaDevengo.slice(0, 7),
    aCargoDe: decision.aCargoDe as 'arrendador' | 'arrendatario',
    ...(typeof c['deducible'] === 'boolean'
      ? { deducible: c['deducible'] as boolean }
      : typeof decision.deducible === 'boolean' ? { deducible: decision.deducible } : {}),
    ...(typeof c['metodoPago'] === 'string' && c['metodoPago'] ? { metodoPago: c['metodoPago'] as Gasto['metodoPago'] } : {}),
    ...(typeof c['notas'] === 'string' && c['notas'] ? { notas: c['notas'] as string } : {}),
    origen: 'IMPORTACION',
    origenId: r.sourceRecordId,
    ejercicioFiscal: Number(fechaDevengo.slice(0, 4)),
    ...(docNombre && docUrl ? { documento: { id: `doc_${r.destinationId}`, nombre: docNombre, url: docUrl } } : {}),
    ...(ctx.actor ? { creadoPor: ctx.actor, creadoPorId: ctx.actor } : {}),
    createdAt: ctx.fechaHora,
    updatedAt: ctx.fechaHora,
  };
}

/** Cobro destino (embebido en contrato). Reglas: previsto=importe (documentada); nombreMes derivado; vencimiento/estado por decisión. */
export function construirCobroDestino(
  r: ImportRecord,
  decision: DecisionPromocion,
  ctx: { fechaHora: string; actor: string | null; migrationRunId: string },
): CobroPeriodo {
  const c = r.canonicalData;
  const mes = c['mes'] as number;
  const anio = c['anio'] as number;
  const importe = c['importe'] as number;
  const contratoId = contratoIdDeDestinoCobro(r.destinationId ?? '');
  if (!contratoId) throw new Error(`destino de cobro no determinista: '${r.destinationId}'`);
  return {
    id: r.destinationId as string,
    inmuebleId: r.inmuebleDestinoId as string,
    contratoId,
    inquilinoId: String(c['inquilinoId']),
    propietarioId: r.propietarioDestinoId as string,
    mes,
    anio,
    periodoMesAnio: `${anio}-${String(mes).padStart(2, '0')}`,
    nombreMes: `${MESES_ES[mes] ?? ''} ${anio}`,
    importePrevisto: importe,
    importeRecibido: importe,
    fechaVencimiento: decision.fechaVencimiento as string,
    ...(typeof c['fechaPago'] === 'string' && c['fechaPago'] ? { fechaPago: c['fechaPago'] as string } : {}),
    estado: decision.estadoCobro as EstadoCobroAlquiler,
    ...(typeof c['metodoPago'] === 'string' && c['metodoPago'] ? { metodoPago: c['metodoPago'] as CobroPeriodo['metodoPago'] } : {}),
    observaciones: `importacion:${r.provenance.source}:${r.sourceRecordId} run:${ctx.migrationRunId}${typeof c['observaciones'] === 'string' && c['observaciones'] ? ` | ${c['observaciones']}` : ''}`,
    ...(ctx.actor ? { registradoPor: ctx.actor, registradoPorId: ctx.actor } : {}),
    fechaRegistro: ctx.fechaHora,
    historialCambios: [{
      id: `hist_${r.destinationId}`,
      fecha: ctx.fechaHora,
      ...(ctx.actor ? { usuarioId: ctx.actor } : {}),
      accion: 'IMPORTACION',
      detalles: `creado por importación ${r.provenance.source}:${r.sourceRecordId} (${ctx.migrationRunId})`,
      estadoNuevo: decision.estadoCobro as EstadoCobroAlquiler,
      importeNuevo: importe,
    }],
  };
}

// ---------------------------------------------------------------------------
// Puerto de persistencia + ejecutor
// ---------------------------------------------------------------------------

export interface EventoAuditoriaImport {
  accion: string;
  descripcion: string;
  entidad: string;
  entidadId: string;
  propietarioId: string;
  inmuebleId?: string;
  importRunId: string;
  migrationRunId: string;
  source: string;
  sourceRecordId: string;
  resultado: 'CREADO' | 'YA_EXISTENTE' | 'FALLIDO';
  motivo?: string;
}

/** Puerto inyectado: el núcleo no conoce Firebase (testeable con fake). */
export interface PuertoPersistenciaImport {
  existeDestino(coleccion: string, destinoId: string): Promise<boolean>;
  /** ¿Existe ya el cobro embebido en el contrato? (idempotencia de cobros). */
  existeCobro(contratoId: string, cobroId: string): Promise<boolean>;
  crearGasto(gasto: Gasto): Promise<void>;
  anexarCobro(contratoId: string, cobro: CobroPeriodo): Promise<void>;
  auditar(evento: EventoAuditoriaImport): Promise<void>;
}

export type ResultadoOperacion =
  | { fingerprint: string; resultado: 'CREADO' }
  | { fingerprint: string; resultado: 'YA_EXISTENTE' }
  | { fingerprint: string; resultado: 'FALLIDO'; motivo: string };

export interface ResultadoPromocion {
  importRunId: string;
  migrationRunId: string;
  creados: number;
  yaExistentes: number;
  fallidos: number;
  detalle: readonly ResultadoOperacion[];
  informe: string;
}

export async function ejecutarPromocion(p: {
  plan: PlanPromocion;
  run: ImportRun;
  decisiones: Readonly<Record<string, DecisionPromocion>>;
  puerto: PuertoPersistenciaImport;
  actor: string | null;
  fechaHora: string;
}): Promise<ResultadoPromocion> {
  if (!p.plan.ejecutable) throw new Error('plan no ejecutable (barrera O7 no superada)');
  const porFp = new Map(p.run.registros.map((r) => [r.fingerprint, r]));
  const detalle: ResultadoOperacion[] = [];
  for (const op of p.plan.operaciones) {
    const r = porFp.get(op.fingerprint);
    const decision = p.decisiones[op.fingerprint];
    if (!r || !decision) {
      detalle.push({ fingerprint: op.fingerprint, resultado: 'FALLIDO', motivo: 'registro o decisión ausente en ejecución (incoherencia plan/run)' });
      continue;
    }
    try {
      const contratoId = op.entidad === 'COBRO' ? contratoIdDeDestinoCobro(op.destinoId) : null;
      if (op.entidad === 'COBRO' && !contratoId) {
        detalle.push({ fingerprint: op.fingerprint, resultado: 'FALLIDO', motivo: `destino de cobro no determinista: '${op.destinoId}'` });
        continue;
      }
      const existe = op.entidad === 'GASTO'
        ? await p.puerto.existeDestino('gastos', op.destinoId)
        : await p.puerto.existeCobro(contratoId as string, op.destinoId);
      if (existe) {
        detalle.push({ fingerprint: op.fingerprint, resultado: 'YA_EXISTENTE' });
        await p.puerto.auditar({
          accion: 'IMPORTACION_YA_EXISTENTE', descripcion: `destino existente, no reescrito (${op.entidad})`,
          entidad: op.entidad, entidadId: op.destinoId, propietarioId: op.propietarioDestinoId,
          importRunId: p.plan.importRunId, migrationRunId: p.plan.migrationRunId,
          source: r.provenance.source, sourceRecordId: r.sourceRecordId, resultado: 'YA_EXISTENTE',
        });
        continue;
      }
      if (op.entidad === 'GASTO') {
        await p.puerto.crearGasto(construirGastoDestino(r, decision, { fechaHora: p.fechaHora, actor: p.actor }));
      } else {
        await p.puerto.anexarCobro(contratoId as string, construirCobroDestino(r, decision, { fechaHora: p.fechaHora, actor: p.actor, migrationRunId: p.plan.migrationRunId }));
      }
      detalle.push({ fingerprint: op.fingerprint, resultado: 'CREADO' });
      await p.puerto.auditar({
        accion: 'IMPORTACION_CREADO', descripcion: `creado por importación (${op.entidad})`,
        entidad: op.entidad, entidadId: op.destinoId, propietarioId: op.propietarioDestinoId,
        ...(r.inmuebleDestinoId ? { inmuebleId: r.inmuebleDestinoId } : {}),
        importRunId: p.plan.importRunId, migrationRunId: p.plan.migrationRunId,
        source: r.provenance.source, sourceRecordId: r.sourceRecordId, resultado: 'CREADO',
      });
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      detalle.push({ fingerprint: op.fingerprint, resultado: 'FALLIDO', motivo });
      try {
        await p.puerto.auditar({
          accion: 'IMPORTACION_FALLIDO', descripcion: `fallo de promoción: ${motivo}`,
          entidad: op.entidad, entidadId: op.destinoId, propietarioId: op.propietarioDestinoId,
          importRunId: p.plan.importRunId, migrationRunId: p.plan.migrationRunId,
          source: r.provenance.source, sourceRecordId: r.sourceRecordId, resultado: 'FALLIDO', motivo,
        });
      } catch { /* auditoría best-effort: un fallo de auditoría no tumba la promoción */ }
    }
  }
  const creados = detalle.filter((d) => d.resultado === 'CREADO').length;
  const yaExistentes = detalle.filter((d) => d.resultado === 'YA_EXISTENTE').length;
  const fallidos = detalle.filter((d) => d.resultado === 'FALLIDO').length;
  const L = [
    `INFORME DE PROMOCIÓN — run ${p.plan.importRunId} / ejecución ${p.plan.migrationRunId}`,
    `operaciones planificadas: ${p.plan.operaciones.length} (excluidas: ${p.plan.excluidas.length}; vinculadas sin escritura: ${p.plan.vinculadasSinEscritura.length})`,
    `creados: ${creados}; ya existentes (omitidos): ${yaExistentes}; fallidos: ${fallidos}`,
  ];
  for (const d of detalle.filter((x) => x.resultado !== 'CREADO')) {
    L.push(`  · ${d.fingerprint.slice(0, 12)}: ${d.resultado}${d.resultado === 'FALLIDO' ? ` (${d.motivo})` : ''}`);
  }
  for (const e of p.plan.excluidas) L.push(`  · excluida ${e.fingerprint.slice(0, 12)}: ${e.motivo}`);
  return { importRunId: p.plan.importRunId, migrationRunId: p.plan.migrationRunId, creados, yaExistentes, fallidos, detalle, informe: L.join('\n') };
}
