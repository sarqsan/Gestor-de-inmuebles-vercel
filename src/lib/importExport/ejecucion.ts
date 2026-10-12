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
import { construirInmueblePatrimonialDestino } from './altaInmueble';
import type { InmueblePatrimonialNuevo } from './altaInmueble';
import type { TitularidadResueltaImport } from './contrato';

// El puerto y su payload se consumen juntos: se reexporta el tipo del alta.
export type { InmueblePatrimonialNuevo } from './altaInmueble';

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
  /**
   * TITULARIDAD DECLARADA: asignación humana de cada ranura (`% Propietario 1`,
   * `% Propietario 2`) a un titular EXISTENTE del ámbito escribible. Se embebe en
   * el dry-run (parches) para que el run lleve la resolución validada; lo que no
   * se resuelva queda declarado y pendiente en el inmueble, sin bloquear el alta.
   */
  titularidad?: readonly TitularidadResueltaImport[];
}

export interface OperacionPromocion {
  fingerprint: string;
  sourceRecordId: string;
  indiceOrigen: number;
  entidad: 'GASTO' | 'COBRO' | 'INMUEBLE';
  coleccion: string;
  destinoId: string;
  propietarioDestinoId: string;
  /**
   * Titularidades RESUELTAS por una persona para esta fila (ranura → titular
   * existente + porcentaje declarado). Sólo se persisten éstas: lo que no se
   * resolvió queda declarado y pendiente en el inmueble, nunca inventado.
   * Se crean DESPUÉS del alta del inmueble (las Rules exigen que exista).
   */
  titularidades?: readonly TitularidadResueltaImport[];
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

const ESCRIBIBLES = new Set(['GASTO', 'COBRO', 'INMUEBLE']);

/**
 * Contrato destino de un cobro, derivado del destinoId determinista
 * `cobro_{contratoId}_{anio}_{mes}` (B0/B2; contratoId puede contener '_').
 */
export function contratoIdDeDestinoCobro(destinoId: string): string | null {
  const m = /^cobro_(.+)_(\d{4})_(\d{1,2})$/.exec(destinoId);
  return m ? m[1] : null;
}

/**
 * Fecha de vencimiento válida: formato YYYY-MM-DD + fecha de calendario real
 * (auditoría 3ac21a5/D7: el regex solo aceptaba '2024-13-99'). Pura y probada.
 */
export function esFechaVencimientoValida(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
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
          : r.entityType === 'INMUEBLE'
            ? 'inmueble sin id interno asignable ni match existente: requiere revisión humana (no se crea a ciegas)'
            : 'sin destino CREAR computable (requiere confirmación con id asignado)';
      excluidas.push({ fingerprint: r.fingerprint, sourceRecordId: r.sourceRecordId, motivo });
      continue;
    }
    // El alta de inmueble exige titular destino: las Rules de `inmuebles`
    // autorizan a un PROPIETARIO sólo si `propietarioId == myPropId()`. Sin
    // titular resuelto no hay escritura legítima posible: se excluye con
    // motivo (nunca se elige el principal por defecto).
    if (r.entityType === 'INMUEBLE' && !r.propietarioDestinoId) {
      excluidas.push({ fingerprint: r.fingerprint, sourceRecordId: r.sourceRecordId, motivo: 'alta de inmueble sin titular destino resuelto (las Rules exigen propietarioId del propio titular): declara el titular en el panel' });
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
    if (r.entityType === 'COBRO' && d?.fechaVencimiento && !esFechaVencimientoValida(d.fechaVencimiento)) {
      excluidas.push({ fingerprint: r.fingerprint, sourceRecordId: r.sourceRecordId, motivo: `fechaVencimiento '${d.fechaVencimiento}' no es fecha válida (YYYY-MM-DD de calendario)` });
      continue;
    }
    // TITULARIDAD DECLARADA: se persiste sólo lo que una persona resolvió a
    // titulares existentes. Cada titularidad resuelta viaja como parte de la
    // operación (idempotente: si ya existe, no se reescribe) y NUNCA bloquea el
    // alta del inmueble: lo no resuelto queda declarado y pendiente.
    const titularidades = r.entityType === 'INMUEBLE' ? (r.titularidadResuelta ?? []) : [];
    operaciones.push({
      fingerprint: r.fingerprint,
      sourceRecordId: r.sourceRecordId,
      indiceOrigen: r.indiceOrigen,
      entidad: r.entityType as 'GASTO' | 'COBRO' | 'INMUEBLE',
      coleccion: r.destinoColeccion ?? '',
      destinoId: r.destinationId,
      propietarioDestinoId: r.propietarioDestinoId ?? '',
      ...(titularidades.length > 0 ? { titularidades } : {}),
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

/** Cobro destino (embebido en contrato). Reglas: previsto=importe (documentada); recibido=importe solo si PAGADO/RECIBIDO/VERIFICADO (0 en otro caso); nombreMes derivado; vencimiento/estado por decisión. */
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
  // Recibido solo cuando el estado afirma cobro total (auditoría 3ac21a5/D6):
  // un PENDIENTE con importeRecibido=importe afirmaba un cobro inexistente.
  // PARCIAL: el importe parcial se desconoce → 0 + nota explícita (revisar).
  const estado = decision.estadoCobro as EstadoCobroAlquiler;
  const cobradoTotal = estado === 'PAGADO' || estado === 'RECIBIDO' || estado === 'VERIFICADO';
  const notaParcial = estado === 'PAGADO_PARCIAL' ? ' | parcial: importe recibido desconocido, revisar' : '';
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
    importeRecibido: cobradoTotal ? importe : 0,
    fechaVencimiento: decision.fechaVencimiento as string,
    ...(typeof c['fechaPago'] === 'string' && c['fechaPago'] ? { fechaPago: c['fechaPago'] as string } : {}),
    estado: decision.estadoCobro as EstadoCobroAlquiler,
    ...(typeof c['metodoPago'] === 'string' && c['metodoPago'] ? { metodoPago: c['metodoPago'] as CobroPeriodo['metodoPago'] } : {}),
    observaciones: `importacion:${r.provenance.source}:${r.sourceRecordId} run:${ctx.migrationRunId}${typeof c['observaciones'] === 'string' && c['observaciones'] ? ` | ${c['observaciones']}` : ''}${notaParcial}`,
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

/**
 * Estado TRI-STATE de la existencia de un destino (bloque A):
 *  · EXISTE         — el documento es legible para esta sesión y está ocupado.
 *  · NO_EXISTE      — la lectura fue autorizada y el documento no está.
 *  · NO_VERIFICABLE — la lectura fue DENEGADA: no se puede afirmar ni que existe
 *                     ni que no existe. Las reglas deniegan la lectura de un
 *                     documento inexistente a quien no es master, así que una
 *                     denegación NO equivale a «existe» ni a «es ajeno».
 */
export type EstadoExistencia = 'EXISTE' | 'NO_EXISTE' | 'NO_VERIFICABLE';

/** Puerto inyectado: el núcleo no conoce Firebase (testeable con fake). */
export interface PuertoPersistenciaImport {
  existeDestino(coleccion: string, destinoId: string): Promise<boolean>;
  /**
   * Versión tri-state de `existeDestino` (opcional por compatibilidad con los
   * fakes existentes). Si el puerto NO la implementa, el ejecutor usa
   * `existeDestino` y sólo distingue EXISTE/NO_EXISTE.
   */
  estadoDestino?(coleccion: string, destinoId: string): Promise<EstadoExistencia>;
  /** ¿Existe ya el cobro embebido en el contrato? (idempotencia de cobros). */
  existeCobro(contratoId: string, cobroId: string): Promise<boolean>;
  crearGasto(gasto: Gasto): Promise<void>;
  anexarCobro(contratoId: string, cobro: CobroPeriodo): Promise<void>;
  /**
   * Alta de un inmueble patrimonial. Escribe SÓLO el documento `inmuebles/{id}`
   * con los campos declarados (ver `InmueblePatrimonialNuevo`): no publica
   * ficha pública ni rellena campos de alquiler. Las Rules siguen siendo la
   * autorización efectiva (`propietarioId == myPropId()` para un PROPIETARIO).
   */
  crearInmueble(inmueble: InmueblePatrimonialNuevo): Promise<void>;
  /**
   * ¿Existe ya la titularidad `{inmuebleId}__{propietarioId}`? (idempotencia:
   * reimportar no duplica relaciones ni reescribe porcentajes ya resueltos).
   */
  existeTitularidad(inmuebleId: string, propietarioId: string): Promise<boolean>;
  /**
   * Crea la RELACIÓN de titularidad por el flujo autorizado: documento
   * `titularidades/{inmuebleId}__{propietarioId}` + índice
   * `inmuebles/{inmuebleId}.titularesIds` en el MISMO lote atómico. Sólo se
   * llama con una ranura resuelta por una persona y después de existir el
   * inmueble (las Rules lo exigen). Nunca crea propietarios.
   */
  crearTitularidad(t: {
    inmuebleId: string;
    propietarioId: string;
    propietarioNombre?: string;
    porcentajeTitularidad: number | null;
    campoOrigen: string;
    valorOriginal: unknown;
    importRunId: string;
    migrationRunId: string;
  }): Promise<void>;
  /**
   * Titular (`propietarioId`) del inmueble EXISTENTE, o `null` si no consta o no es
   * legible para esta sesión. Necesario para completar relaciones pendientes de un
   * inmueble ya creado: sin este método, esas relaciones NO se escriben (se informan).
   */
  propietarioDeInmueble?(inmuebleId: string): Promise<string | null>;
  auditar(evento: EventoAuditoriaImport): Promise<void>;
}

/**
 * Completa las titularidades resueltas de un inmueble que YA EXISTE (idempotente).
 * Sólo escribe si el inmueble existente pertenece al titular de destino del registro:
 * un inmueble ajeno o no verificable NO se modifica. Devuelve un motivo de FALLIDO
 * si una relación no pudo completarse (el inmueble existente se conserva intacto).
 */
async function completarRelacionesDeExistente(
  op: { destinoId: string; fingerprint: string; propietarioDestinoId: string; titularidades?: readonly TitularidadResueltaImport[] },
  p: { puerto: PuertoPersistenciaImport; plan: PlanPromocion },
  creadas: Array<{ fingerprint: string; propietarioId: string; porcentaje: number | null }>,
  omitidas: Array<{ fingerprint: string; motivo: string }>,
): Promise<string | null> {
  const titulares = op.titularidades ?? [];
  if (titulares.length === 0) return null;
  const sinVerificar = 'inmueble ya existente sin verificación de titular; relación no completada';
  if (!p.puerto.propietarioDeInmueble) {
    for (const t of titulares) omitidas.push({ fingerprint: op.fingerprint, motivo: `${sinVerificar} (${t.propietarioId})` });
    return null;
  }
  const actual = await p.puerto.propietarioDeInmueble(op.destinoId);
  if (actual !== op.propietarioDestinoId) {
    const motivo = actual === null
      ? sinVerificar
      : 'inmueble ya existente de otro titular; relación no completada (no se modifica)';
    for (const t of titulares) omitidas.push({ fingerprint: op.fingerprint, motivo: `${motivo} (${t.propietarioId})` });
    return null;
  }
  for (const t of titulares) {
    try {
      if (await p.puerto.existeTitularidad(op.destinoId, t.propietarioId)) {
        omitidas.push({ fingerprint: op.fingerprint, motivo: `titularidad ya existente (${t.propietarioId}); no se reescribe` });
        continue;
      }
      await p.puerto.crearTitularidad({
        inmuebleId: op.destinoId,
        propietarioId: t.propietarioId,
        porcentajeTitularidad: t.porcentaje,
        campoOrigen: t.campoOrigen,
        valorOriginal: t.valorOriginal,
        importRunId: p.plan.importRunId,
        migrationRunId: p.plan.migrationRunId,
      });
      creadas.push({ fingerprint: op.fingerprint, propietarioId: t.propietarioId, porcentaje: t.porcentaje });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return `inmueble ya existente; relación pendiente no completada (${t.propietarioId}): ${msg}`;
    }
  }
  return null;
}

export type ResultadoOperacion =
  | { fingerprint: string; resultado: 'CREADO' }
  | { fingerprint: string; resultado: 'YA_EXISTENTE' }
  | { fingerprint: string; resultado: 'FALLIDO'; motivo: string };

export interface ResultadoPromocion {
  importRunId: string;
  migrationRunId: string;
  creados: number;
  /** Desglose de `yaExistentes`: destino existente al que se AÑADIERON relaciones pendientes resueltas. */
  actualizados: number;
  /** Desglose de `yaExistentes`: destino existente sin cambios (no se reescribe nada). */
  omitidos: number;
  /** Total de destinos ya existentes (= actualizados + omitidos). Se conserva por compatibilidad. */
  yaExistentes: number;
  fallidos: number;
  /** Titularidades creadas por resolución humana explícita (ranura → titular). */
  titularidadesCreadas: readonly { fingerprint: string; propietarioId: string; porcentaje: number | null }[];
  /** Titularidades ya existentes: omitidas sin reescribir (idempotencia). */
  titularidadesOmitidas: readonly { fingerprint: string; motivo: string }[];
  /** Relaciones declaradas que quedan PENDIENTES con el dato exacto que falta. */
  relacionesPendientes: readonly { fingerprint: string; campoOrigen: string; motivo: string }[];
  detalle: readonly ResultadoOperacion[];
  informe: string;
}

/**
 * Registra en el informe las relaciones declaradas que quedan PENDIENTES. No se
 * escribe nada nuevo: su conservación ya viaja en el propio documento del
 * inmueble (`titularidadDeclarada` / `inquilinoDeclarado` /
 * `datosImportadosHistoricos`), que es lo que hace verificable qué falta.
 */
async function escribirPendientes(
  r: ImportRecord,
  op: OperacionPromocion,
  p: { fechaHora: string; actor: string | null; plan: PlanPromocion },
  destino: Array<{ fingerprint: string; campoOrigen: string; motivo: string }>,
): Promise<void> {
  for (const rel of r.relacionesPendientes ?? []) {
    destino.push({ fingerprint: op.fingerprint, campoOrigen: rel.campoOrigen, motivo: rel.motivo });
  }
  for (const v of r.vinculosInquilinoCandidatos ?? []) {
    destino.push({
      fingerprint: op.fingerprint,
      campoOrigen: 'DNI Inquilino',
      motivo: `posible vínculo inequívoco por DNI con el contrato ${v.contratoId}${v.candidatoNombre ? ` (${v.candidatoNombre})` : ''}: requiere confirmación humana (no se crea ningún contrato)`,
    });
  }
  void p;
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
  const titularidadesCreadas: Array<{ fingerprint: string; propietarioId: string; porcentaje: number | null }> = [];
  const titularidadesOmitidas: Array<{ fingerprint: string; motivo: string }> = [];
  const pendientesPersistidos: Array<{ fingerprint: string; campoOrigen: string; motivo: string }> = [];
  for (const op of p.plan.operaciones) {
    const r = porFp.get(op.fingerprint);
    const decision = p.decisiones[op.fingerprint];
    // B1 G-13: sólo GASTO y COBRO exigen decisión humana (aCargoDe/estado); el
    // alta de inmueble no tiene campos que decidir, así que su ausencia no es
    // una incoherencia plan/run.
    const exigeDecision = op.entidad === 'GASTO' || op.entidad === 'COBRO';
    if (!r || (exigeDecision && !decision)) {
      detalle.push({ fingerprint: op.fingerprint, resultado: 'FALLIDO', motivo: 'registro o decisión ausente en ejecución (incoherencia plan/run)' });
      continue;
    }
    let estadoPrevio: EstadoExistencia = 'NO_EXISTE';
    try {
      const contratoId = op.entidad === 'COBRO' ? contratoIdDeDestinoCobro(op.destinoId) : null;
      if (op.entidad === 'COBRO' && !contratoId) {
        detalle.push({ fingerprint: op.fingerprint, resultado: 'FALLIDO', motivo: `destino de cobro no determinista: '${op.destinoId}'` });
        continue;
      }
      const coleccionDestino = op.entidad === 'GASTO' ? 'gastos' : op.entidad === 'INMUEBLE' ? 'inmuebles' : null;
      if (coleccionDestino) {
        estadoPrevio = p.puerto.estadoDestino
          ? await p.puerto.estadoDestino(coleccionDestino, op.destinoId)
          : (await p.puerto.existeDestino(coleccionDestino, op.destinoId)) ? 'EXISTE' : 'NO_EXISTE';
      } else {
        estadoPrevio = (await p.puerto.existeCobro(contratoId as string, op.destinoId)) ? 'EXISTE' : 'NO_EXISTE';
      }
      // EXISTE → no se escribe el destino (idempotencia). NO_EXISTE y NO_VERIFICABLE
      // → la REGLA DE CREACIÓN decide: si el documento no existe se crea; si existe
      // y no es legible, la escritura (que Firestore evalúa como update, y update ⊆
      // get en `inmuebles`) se rechaza y el motivo queda etiquetado como
      // NO_VERIFICABLE. Ninguna rama afirma inexistencia con una lectura denegada.
      if (estadoPrevio === 'EXISTE') {
        if (op.entidad === 'INMUEBLE') {
          const fallo = await completarRelacionesDeExistente(op, p, titularidadesCreadas, titularidadesOmitidas);
          if (fallo) {
            detalle.push({ fingerprint: op.fingerprint, resultado: 'FALLIDO', motivo: fallo });
            continue;
          }
        }
        detalle.push({ fingerprint: op.fingerprint, resultado: 'YA_EXISTENTE' });
        // Best-effort (auditoría 3ac21a5/D3): si auditar falla, el resultado
        // sobre DATOS sigue siendo YA_EXISTENTE; no se añade un FALLIDO
        // fantasma que duplicaría la entrada e inflaría contadores.
        try {
          await p.puerto.auditar({
            accion: 'IMPORTACION_YA_EXISTENTE', descripcion: `destino existente, no reescrito (${op.entidad})`,
            entidad: op.entidad, entidadId: op.destinoId, propietarioId: op.propietarioDestinoId,
            importRunId: p.plan.importRunId, migrationRunId: p.plan.migrationRunId,
            source: r.provenance.source, sourceRecordId: r.sourceRecordId, resultado: 'YA_EXISTENTE',
          });
        } catch { /* auditoría best-effort */ }
        continue;
      }
      if (op.entidad === 'GASTO') {
        await p.puerto.crearGasto(construirGastoDestino(r, decision as DecisionPromocion, { fechaHora: p.fechaHora, actor: p.actor }));
      } else if (op.entidad === 'INMUEBLE') {
        await p.puerto.crearInmueble(construirInmueblePatrimonialDestino(r, { fechaHora: p.fechaHora, actor: p.actor }));
        // RELACIONES RESUELTAS: se crean después del inmueble (las Rules exigen
        // que exista) y sólo las que una persona asignó a un titular existente.
        for (const t of op.titularidades ?? []) {
          const yaExiste = await p.puerto.existeTitularidad(op.destinoId, t.propietarioId);
          if (yaExiste) {
            titularidadesOmitidas.push({ fingerprint: op.fingerprint, motivo: `titularidad ya existente (${t.propietarioId}); no se reescribe` });
            continue;
          }
          await p.puerto.crearTitularidad({
            inmuebleId: op.destinoId,
            propietarioId: t.propietarioId,
            porcentajeTitularidad: t.porcentaje,
            campoOrigen: t.campoOrigen,
            valorOriginal: t.valorOriginal,
            importRunId: p.plan.importRunId,
            migrationRunId: p.plan.migrationRunId,
          });
          titularidadesCreadas.push({ fingerprint: op.fingerprint, propietarioId: t.propietarioId, porcentaje: t.porcentaje });
        }
        await escribirPendientes(r, op, p, pendientesPersistidos);
      } else {
        await p.puerto.anexarCobro(contratoId as string, construirCobroDestino(r, decision as DecisionPromocion, { fechaHora: p.fechaHora, actor: p.actor, migrationRunId: p.plan.migrationRunId }));
      }
      detalle.push({ fingerprint: op.fingerprint, resultado: 'CREADO' });
      // Best-effort (auditoría 3ac21a5/D3): la escritura YA ocurrió; un fallo
      // de auditoría no convierte el resultado en FALLIDO (eso invitaría a
      // reintentos y mentiría en el informe: CREADO+FALLIDO a la vez).
      try {
        await p.puerto.auditar({
          accion: 'IMPORTACION_CREADO', descripcion: `creado por importación (${op.entidad})`,
          entidad: op.entidad, entidadId: op.destinoId, propietarioId: op.propietarioDestinoId,
          ...(r.inmuebleDestinoId ? { inmuebleId: r.inmuebleDestinoId } : {}),
          importRunId: p.plan.importRunId, migrationRunId: p.plan.migrationRunId,
          source: r.provenance.source, sourceRecordId: r.sourceRecordId, resultado: 'CREADO',
        });
      } catch { /* auditoría best-effort */ }
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      // Se conserva el MENSAJE REAL de Firestore. Si la existencia era NO_VERIFICABLE
      // y la escritura también se rechazó, se etiqueta para que el informe no lo
      // presente como «inexistente» ni como «sobrescrito»: no hubo escritura.
      const motivo = estadoPrevio === 'NO_VERIFICABLE'
        ? `NO_VERIFICABLE (lectura denegada y escritura rechazada; no se sobrescribió): ${mensaje}`
        : mensaje;
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
  // Un destino ya existente es «actualizado» sólo si se le añadió alguna relación
  // pendiente resuelta; si no, queda «omitido» (idempotencia: nada que escribir).
  const conRelacionAnadida = new Set(titularidadesCreadas.map((t) => t.fingerprint));
  const actualizados = detalle.filter((d) => d.resultado === 'YA_EXISTENTE' && conRelacionAnadida.has(d.fingerprint)).length;
  const omitidos = yaExistentes - actualizados;
  const L = [
    `INFORME DE PROMOCIÓN — run ${p.plan.importRunId} / ejecución ${p.plan.migrationRunId}`,
    `operaciones planificadas: ${p.plan.operaciones.length} (excluidas: ${p.plan.excluidas.length}; vinculadas sin escritura: ${p.plan.vinculadasSinEscritura.length})`,
    `creados: ${creados}; actualizados (relaciones añadidas a inmueble existente): ${actualizados}; omitidos (ya existían sin cambios): ${omitidos}; fallidos: ${fallidos}`,
    `titularidades creadas: ${titularidadesCreadas.length}; ya existentes (omitidas): ${titularidadesOmitidas.length}`,
    `relaciones declaradas PENDIENTES (conservadas en el inmueble, sin inventar): ${pendientesPersistidos.length}`,
  ];
  for (const q of pendientesPersistidos) L.push(`  · pendiente ${q.fingerprint.slice(0, 12)} «${q.campoOrigen}»: ${q.motivo}`);
  for (const d of detalle.filter((x) => x.resultado !== 'CREADO')) {
    L.push(`  · ${d.fingerprint.slice(0, 12)}: ${d.resultado}${d.resultado === 'FALLIDO' ? ` (${d.motivo})` : ''}`);
  }
  for (const e of p.plan.excluidas) L.push(`  · excluida ${e.fingerprint.slice(0, 12)}: ${e.motivo}`);
  return {
    importRunId: p.plan.importRunId,
    migrationRunId: p.plan.migrationRunId,
    creados, actualizados, omitidos, yaExistentes, fallidos,
    titularidadesCreadas, titularidadesOmitidas,
    relacionesPendientes: pendientesPersistidos,
    detalle,
    informe: L.join('\n'),
  };
}
