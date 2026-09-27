/**
 * ORDEN 7 — Autorización independiente y preparación de la migración histórica.
 *
 * Capa PURA (sin I/O, sin persistencia, sin reloj, sin azar). Esta orden
 * PREPARA y FORMALIZA la autorización; NO ejecuta ninguna migración real:
 * `ejecutarMigracion()` rechaza siempre por diseño (barrera §14 + Orden 7 §0).
 * La escritura real queda separada para una ejecución explícita posterior.
 *
 * Piezas:
 *  · `LoteCanonica`: identidad reproducible del lote (nunca «el lote actual»).
 *    Sin fichero custodiado + SHA-256 NO hay autorización (BLOQUEADA).
 *  · `reconciliarCapas()`: correspondencia 1:1 lote→dry-run→preguntas→
 *    informe→plan; ningún registro puede desaparecer entre capas.
 *  · `autorizarMigracion()`: solo AUTO elegible puede entrar; REVISIÓN/
 *    INCOMPLETO/BLOQUEADO/NO_MIGRABLE quedan excluidos con decisión humana.
 *  · `planificarEjecucion()`: plan REVERSIBLE (staging→validación→promoción)
 *    con rollback identificado por `migrationRunId`. Dato, NO ejecución.
 *  · `verificarBarrera()`: autorización + sha canónico + token explícito.
 */
import { sha256Hex } from '../importacion/hash';
import { PREGUNTAS_CANONICAS, type RespuestaPregunta } from './informe';
import { jsonEstable } from './motor';
import type {
  DryRunResult,
  LineaDryRun,
  MigrationPlan,
} from './tipos';

// ---------------------------------------------------------------------------
// Lote canónico (§3): identidad reproducible
// ---------------------------------------------------------------------------

export interface LoteCanonica {
  /** Identificador humano del lote (p. ej. 'RENTASYNC-A/B-2026-09'). */
  id: string;
  fuente: string;
  /** Rutas custodiadas en el repositorio. Vacío = sin lote canónico. */
  ficheros: readonly string[];
  numRegistros: number;
  tamanoBytes: number | null;
  /** SHA-256 del fichero canónico. null = pendiente (NO se inventa). */
  sha256: string | null;
  generadoEn: string | null;
  esquemaVersion: string;
  motorB4Version: string;
  commitDryRun: string;
}

// ---------------------------------------------------------------------------
// Elegibilidad (§5/§8/§9): solo AUTO que supera las 7 puertas
// ---------------------------------------------------------------------------

function procedenciaSuficiente(l: LineaDryRun): boolean {
  return (
    typeof l.proveniencia.source === 'string' && l.proveniencia.source.trim() !== '' &&
    typeof l.proveniencia.sourceId === 'string' && l.proveniencia.sourceId.trim() !== '' &&
    !l.proveniencia.sourceId.startsWith('__ID_NO_RECUPERADO_')
  );
}

function fiscalConIncidencia(l: LineaDryRun): boolean {
  if (!l.fiscal) return false;
  return l.fiscal.deducible === null || l.fiscal.clasificacion === 'SIN_CLASIFICAR';
}

function necesitaInmueble(entidad: string): boolean {
  return entidad === 'GASTO' || entidad === 'COBRO' || entidad === 'CONTRATO';
}

export interface VeredictoElegibilidad {
  elegible: boolean;
  motivoExclusion: string | null;
}

/**
 * ¿Puede un registro entrar en la autorización? Solo AUTO, y aun así con las
 * 7 puertas (§5) + regla documental (§8: entidadRef no verificable ⇒ fuera) +
 * regla fiscal (§9: incidencia que requiera decisión ⇒ fuera).
 */
export function evaluarElegibilidad(l: LineaDryRun): VeredictoElegibilidad {
  if (l.decision !== 'AUTO') {
    return { elegible: false, motivoExclusion: `clasificación ${l.decision}: no entra automáticamente (requiere decisión humana)` };
  }
  if (!(l.estadoPropietario === 'RESUELTO' && l.propietarioDestinoId !== null)) {
    return { elegible: false, motivoExclusion: 'AUTO sin propietario resuelto (defecto del dry-run; no autorizable)' };
  }
  if (necesitaInmueble(l.entidad) && !(l.estadoInmueble === 'RESUELTO' && l.inmuebleDestinoId !== null)) {
    return { elegible: false, motivoExclusion: 'AUTO sin inmueble resuelto (defecto del dry-run; no autorizable)' };
  }
  if (!l.relaciones.padreResuelto) {
    return { elegible: false, motivoExclusion: 'AUTO sin relaciones resueltas (defecto del dry-run; no autorizable)' };
  }
  if (!procedenciaSuficiente(l)) {
    return { elegible: false, motivoExclusion: 'AUTO con proveniencia insuficiente (defecto del dry-run; no autorizable)' };
  }
  if (l.duplicado.tipo === 'EXACTO' || l.duplicado.tipo === 'PROBABLE') {
    return { elegible: false, motivoExclusion: `AUTO con duplicidad ${l.duplicado.tipo} (defecto del dry-run; no autorizable)` };
  }
  if (!l.destinoPropuesto || l.destinoPropuesto.destinoId === null) {
    return { elegible: false, motivoExclusion: 'AUTO sin destino computable (defecto del dry-run; no autorizable)' };
  }
  if (l.confianza !== 'ALTA') {
    return { elegible: false, motivoExclusion: 'AUTO sin confianza ALTA (defecto del dry-run; no autorizable)' };
  }
  // §8: documento con entidadRef no verificable contra destino ⇒ fuera.
  if (l.entidad === 'DOCUMENTO') {
    const ref = l.datoOriginal['entidadRef'] ?? l.datoOriginal['entidad'];
    const refId = l.datoOriginal['entidadId'] ?? l.datoOriginal['entidadOrigenId'];
    if (typeof ref === 'string' && ref.trim() !== '' && typeof refId === 'string' && refId.trim() !== '') {
      return { elegible: false, motivoExclusion: `documento con entidadRef '${ref}:${refId}' no verificable contra destino (B4 no cataloga gastos destino; revisión pendiente)` };
    }
  }
  // §9: incidencia fiscal que requiera decisión ⇒ fuera (sin transformador
  // canónico validado no se autoriza fiscalidad inferida o sin confirmar).
  if (fiscalConIncidencia(l)) {
    return { elegible: false, motivoExclusion: `incidencia fiscal requiere decisión (${l.fiscal?.motivo ?? 'sin motivo'})` };
  }
  return { elegible: true, motivoExclusion: null };
}

// ---------------------------------------------------------------------------
// Decisiones humanas (§6) y fichas AUTO (§7)
// ---------------------------------------------------------------------------

export interface DecisionHumana {
  source: string;
  sourceId: string;
  entidad: string;
  propietarioPropuesto: string | null;
  inmueblePropuesto: string | null;
  clasificacion: string;
  motivo: string;
  evidencia: string;
  datoFaltanteOConflicto: string;
  accionNecesaria: string;
}

export interface FichaAuto {
  source: string;
  sourceId: string;
  entidad: string;
  propietarioDestinoId: string;
  inmuebleDestinoId: string | null;
  relaciones: { padre: string | null; padreResuelto: boolean };
  proveniencia: LineaDryRun['proveniencia'];
  evidencia: string;
  decision: 'AUTO';
  motivo: string;
}

function accionPara(clasificacion: string, motivoExclusion: string | null): string {
  if (motivoExclusion) return `resolver exclusión de autorización: ${motivoExclusion}`;
  switch (clasificacion) {
    case 'REVISION': return 'revisión humana y confirmación explícita antes de incluir';
    case 'INCOMPLETO': return 'aportar el dato faltante y re-ejecutar el dry-run';
    case 'BLOQUEADO': return 'resolver el conflicto/contradicción antes de incluir';
    case 'NO_MIGRABLE': return 'excluir de la migración (no migrable por naturaleza)';
    default: return 'decisión humana pendiente';
  }
}

export function decisionHumanaDe(l: LineaDryRun, motivoExclusion: string | null): DecisionHumana {
  return {
    source: l.proveniencia.source,
    sourceId: l.proveniencia.sourceId,
    entidad: l.entidad,
    propietarioPropuesto: l.propietarioDestinoId,
    inmueblePropuesto: l.inmuebleDestinoId,
    clasificacion: l.decision,
    motivo: motivoExclusion ?? l.motivo,
    evidencia: [`motivo: ${l.motivo}`, ...l.evidencias.slice(0, 3)].join(' ‖ '),
    datoFaltanteOConflicto: motivoExclusion ?? l.motivo,
    accionNecesaria: accionPara(l.decision, motivoExclusion),
  };
}

export function fichaAutoDe(l: LineaDryRun): FichaAuto {
  return {
    source: l.proveniencia.source,
    sourceId: l.proveniencia.sourceId,
    entidad: l.entidad,
    propietarioDestinoId: l.propietarioDestinoId as string,
    inmuebleDestinoId: l.inmuebleDestinoId,
    relaciones: { padre: l.relaciones.padre, padreResuelto: l.relaciones.padreResuelto },
    proveniencia: l.proveniencia,
    evidencia: [
      `propietario: ${l.evidenciaPropietario}`,
      `inmueble: ${l.evidenciaInmueble}`,
      `destino: ${l.destinoPropuesto?.operacion} ${l.destinoPropuesto?.coleccion}/${l.destinoPropuesto?.destinoId}`,
      `confianza: ${l.confianza}`,
    ].join(' ‖ '),
    decision: 'AUTO',
    motivo: l.motivo,
  };
}

// ---------------------------------------------------------------------------
// Autorización (§5–§7, §13)
// ---------------------------------------------------------------------------

export type EstadoAutorizacion = 'CONCEDIDA' | 'CONDICIONADA' | 'BLOQUEADA';

export interface AutorizacionMigracion {
  loteId: string;
  loteSha256: string | null;
  /** Huella del contenido conciliado en el momento de autorizar (§14 test). */
  contenidoSha256: string;
  loteShaDryRun: string;
  motorVersion: string;
  commit: string;
  autorizador: string | null;
  fechaHora: string | null;
  decision: EstadoAutorizacion;
  motivo: string;
  incluidos: readonly FichaAuto[];
  excluidos: readonly DecisionHumana[];
  condiciones: readonly string[];
  /** Trazabilidad sin fingir ejecución: solo AUTORIZACIÓN PREVIA. */
  resultado: 'AUTORIZACIÓN PREVIA (migración no ejecutada)';
}

/** Huella estable del contenido de un dry-run (orden-independiente). */
export function shaContenidoDryRun(dryRun: DryRunResult): string {
  const items = dryRun.lineas.map((l) => ({
    source: l.proveniencia.source,
    sourceId: l.proveniencia.sourceId,
    entidad: l.entidad,
    hash: sha256Hex(jsonEstable(l.datoOriginal)),
  }));
  items.sort((a, b) => (jsonEstable(a) < jsonEstable(b) ? -1 : 1));
  return sha256Hex(jsonEstable(items));
}

export function autorizarMigracion(p: {
  lote: LoteCanonica;
  dryRun: DryRunResult;
  autorizador?: string | null;
  fechaHora?: string | null;
  /** SHAs canónicos de lotes ya ejecutados (idempotencia de ejecución). */
  ejecucionesPrevias?: readonly string[];
}): AutorizacionMigracion {
  const incluidos: FichaAuto[] = [];
  const excluidos: DecisionHumana[] = [];
  const condiciones: string[] = [];
  for (const l of [...p.dryRun.lineas].sort((a, b) => (a.migrationKey < b.migrationKey ? -1 : 1))) {
    const v = evaluarElegibilidad(l);
    if (v.elegible) incluidos.push(fichaAutoDe(l));
    else excluidos.push(decisionHumanaDe(l, l.decision === 'AUTO' ? v.motivoExclusion : null));
  }

  const base = {
    loteId: p.lote.id,
    loteSha256: p.lote.sha256,
    contenidoSha256: shaContenidoDryRun(p.dryRun),
    loteShaDryRun: p.dryRun.loteSha256,
    motorVersion: p.lote.motorB4Version,
    commit: p.lote.commitDryRun,
    autorizador: p.autorizador ?? null,
    fechaHora: p.fechaHora ?? null,
    incluidos,
    excluidos,
    resultado: 'AUTORIZACIÓN PREVIA (migración no ejecutada)' as const,
  };

  // Sin identidad canónica no hay autorización (no se inventa el lote).
  if (!p.lote.sha256 || p.lote.ficheros.length === 0) {
    return {
      ...base,
      decision: 'BLOQUEADA',
      motivo: 'sin fichero canónico A/B custodiado (SHA-256 pendiente): autorización bloqueada',
      condiciones: [
        'custodiar el fichero canónico A/B en el repositorio con SHA-256 registrado',
        'definir staging operativo (colección de lotes + acta + rollback)',
        ...excluidos.map((e) => `${e.source}:${e.sourceId} [${e.clasificacion}]: ${e.accionNecesaria}`),
      ],
    };
  }
  if (p.lote.numRegistros !== p.dryRun.resumen.totalRegistros) {
    return {
      ...base,
      decision: 'BLOQUEADA',
      motivo: `el lote declara ${p.lote.numRegistros} registros pero el dry-run contiene ${p.dryRun.resumen.totalRegistros} (lote cambiado; no autoriza)`,
      condiciones: ['reconciliar lote↔dry-run antes de autorizar'],
    };
  }
  if (!/^[0-9a-f]{64}$/.test(p.lote.sha256 as string)) {
    return {
      ...base,
      decision: 'BLOQUEADA',
      motivo: 'SHA-256 canónico inválido (se exigen 64 caracteres hexadecimales; no autoriza)',
      condiciones: ['registrar el SHA-256 real del fichero canónico custodiado'],
    };
  }
  if ((p.ejecucionesPrevias ?? []).includes(p.lote.sha256)) {
    return {
      ...base,
      decision: 'BLOQUEADA',
      motivo: 'lote ya ejecutado anteriormente (idempotencia de ejecución: segunda ejecución bloqueada)',
      condiciones: [],
    };
  }
  if (incluidos.length === 0) {
    return {
      ...base,
      decision: 'CONDICIONADA',
      motivo: 'lote válido pero ningún registro elegible: todo requiere decisión humana',
      condiciones: excluidos.map((e) => `${e.source}:${e.sourceId} [${e.clasificacion}]: ${e.accionNecesaria}`),
    };
  }
  return {
    ...base,
    decision: 'CONCEDIDA',
    motivo: `${incluidos.length} registro(s) elegible(s) autorizado(s); ${excluidos.length} excluido(s) por diseño (requieren decisión humana)`,
    condiciones: excluidos.map((e) => `${e.source}:${e.sourceId} [${e.clasificacion}]: ${e.accionNecesaria}`),
  };
}

/** ¿Sigue vigente una autorización frente al contenido actual del lote? */
export function autorizacionVigente(aut: AutorizacionMigracion, dryRunActual: DryRunResult): boolean {
  if (aut.decision !== 'CONCEDIDA' && aut.decision !== 'CONDICIONADA') return false;
  return shaContenidoDryRun(dryRunActual) === aut.contenidoSha256;
}

// ---------------------------------------------------------------------------
// Reconciliación 1:1 entre capas (§4)
// ---------------------------------------------------------------------------

const ETIQUETAS_NUMERICAS: ReadonlyArray<{ etiqueta: string; valor: (r: DryRunResult) => number }> = [
  { etiqueta: 'Registros analizados', valor: (r) => r.resumen.totalRegistros },
  { etiqueta: 'AUTO', valor: (r) => r.resumen.auto },
  { etiqueta: 'REVISIÓN', valor: (r) => r.resumen.revision },
  { etiqueta: 'INCOMPLETO', valor: (r) => r.resumen.incompleto },
  { etiqueta: 'BLOQUEADO', valor: (r) => r.resumen.bloqueado },
  { etiqueta: 'NO_MIGRABLE', valor: (r) => r.resumen.noMigrable },
  { etiqueta: 'Duplicados exactos', valor: (r) => r.lineas.filter((x) => x.duplicado.tipo === 'EXACTO').length },
  { etiqueta: 'Duplicados probables', valor: (r) => r.lineas.filter((x) => x.duplicado.tipo === 'PROBABLE').length },
  { etiqueta: 'Huérfanos', valor: (r) => r.resumen.huerfanos },
  { etiqueta: 'Conflictos', valor: (r) => r.resumen.conflictos },
  { etiqueta: 'Documentos con incidencia', valor: (r) => r.lineas.filter((x) => x.entidad === 'DOCUMENTO' && x.decision !== 'AUTO').length },
  { etiqueta: 'Objetos legacy pendientes', valor: (r) => r.lineas.filter((x) => x.entidad === 'LEGACY_STORAGE' && x.legacyStorage?.estado !== 'RESUELTO').length },
  { etiqueta: 'Registros fiscales analizados', valor: (r) => r.lineas.filter((x) => x.fiscal !== undefined).length },
  { etiqueta: 'Registros fiscales con incidencia', valor: (r) => r.lineas.filter((x) => x.fiscal !== undefined && (x.fiscal.deducible === null || x.fiscal.clasificacion === 'SIN_CLASIFICAR')).length },
  { etiqueta: 'Registros potencialmente migrables', valor: (r) => r.resumen.auto },
];

export interface VeredictoReconciliacion {
  ok: boolean;
  fallos: string[];
}

/** Cruza dry-run ↔ preguntas ↔ informe ↔ plan: 1:1, sin fugas ni invenciones. */
export function reconciliarCapas(p: {
  dryRun: DryRunResult;
  preguntas: readonly RespuestaPregunta[];
  informe: string;
  plan: MigrationPlan;
}): VeredictoReconciliacion {
  const fallos: string[] = [];
  const { dryRun } = p;

  // Preguntas: exactamente las 14 canónicas en orden.
  if (p.preguntas.length !== PREGUNTAS_CANONICAS.length) {
    fallos.push(`preguntas: ${p.preguntas.length} ≠ 14 canónicas`);
  } else {
    p.preguntas.forEach((r, i) => {
      if (r.numero !== i + 1 || r.pregunta !== PREGUNTAS_CANONICAS[i]) {
        fallos.push(`pregunta ${i + 1}: texto/orden alterado`);
      }
    });
  }
  // Las respuestas reflejan los conteos del dry-run.
  const q = (n: number): string => p.preguntas[n - 1]?.respuesta ?? '';
  const exige = (n: number, fragmento: string): void => {
    if (!q(n).includes(fragmento)) fallos.push(`pregunta ${n}: falta «${fragmento}»`);
  };
  exige(1, `${dryRun.resumen.totalRegistros} registro(s) histórico(s) analizados`);
  exige(7, `${dryRun.resumen.auto} registro(s) AUTO`);
  exige(8, `${dryRun.resumen.revision} registro(s) requieren REVISIÓN humana`);
  exige(9, `${dryRun.resumen.incompleto} registro(s) INCOMPLETOS`);
  exige(10, `${dryRun.resumen.bloqueado} registro(s) BLOQUEADOS`);
  exige(11, `${dryRun.resumen.noMigrable} registro(s) NO_MIGRABLES`);

  // Informe: todos los conteos coinciden con el modelo.
  for (const { etiqueta, valor } of ETIQUETAS_NUMERICAS) {
    const m = p.informe.match(new RegExp(`^${etiqueta}: (\\d+)$`, 'm'));
    if (!m) fallos.push(`informe: falta «${etiqueta}»`);
    else if (Number(m[1]) !== valor(dryRun)) {
      fallos.push(`informe: «${etiqueta}» dice ${m[1]} pero el modelo contiene ${valor(dryRun)}`);
    }
  }
  // Ningún registro desaparece: no-AUTO en §10, AUTO en evidencia Q7.
  for (const l of dryRun.lineas) {
    const corto = l.migrationKey.slice(0, 12);
    if (l.decision === 'AUTO') {
      if (!p.informe.includes(corto)) fallos.push(`informe: falta evidencia AUTO ${corto}`);
    } else if (!p.informe.includes(corto)) {
      fallos.push(`informe: falta pendiente ${corto} (${l.decision})`);
    }
  }

  // Plan: solo AUTO, 1:1 con las líneas AUTO.
  const keysAuto = new Set(dryRun.lineas.filter((x) => x.decision === 'AUTO').map((x) => x.migrationKey));
  if (p.plan.operaciones.length !== keysAuto.size) {
    fallos.push(`plan: ${p.plan.operaciones.length} operaciones ≠ ${keysAuto.size} AUTO`);
  }
  for (const op of p.plan.operaciones) {
    if (!keysAuto.has(op.migrationKey)) fallos.push(`plan: operación huérfana ${op.migrationKey.slice(0, 12)}`);
    if (op.decision !== 'AUTO') fallos.push('plan: operación no AUTO infiltrada');
  }
  if (p.plan.excluidas !== dryRun.resumen.totalRegistros - keysAuto.size) {
    fallos.push('plan: excluidas no cuadra con no-AUTO');
  }
  if (p.plan.soloLectura !== true || dryRun.soloLectura !== true) {
    fallos.push('solo-lectura declarado en falso en alguna capa');
  }
  return { ok: fallos.length === 0, fallos };
}

// ---------------------------------------------------------------------------
// Plan de ejecución reversible (§11/§12): DATO, no ejecución
// ---------------------------------------------------------------------------

export interface OperacionStaging {
  migrationKey: string;
  sourceId: string;
  coleccion: string;
  destinoId: string;
  operacion: 'VINCULAR' | 'CREAR';
  migrationRunId: string;
}

export interface PasoRollback {
  revierteDestinoId: string;
  coleccion: string;
  migrationKey: string;
  /** Identificación inequívoca de la ejecución (nunca borrado indiscriminado). */
  via: 'migrationRunId';
  migrationRunId: string;
  accion: string;
}

export interface PlanEjecucion {
  /** Siempre false en Orden 7: el plan describe, no ejecuta. */
  ejecutable: false;
  migrationRunId: string;
  loteId: string;
  loteSha256: string | null;
  fases: readonly ['STAGING', 'VALIDACION', 'PROMOCION'];
  staging: readonly OperacionStaging[];
  validaciones: readonly string[];
  promocion: readonly string[];
  rollback: readonly PasoRollback[];
  condicionesAborto: readonly string[];
}

/**
 * Planifica staging→validación→promoción con rollback por migrationRunId.
 * Solo acepta autorizaciones CONCEDIDAS; devuelve un DATO no ejecutable.
 */
export function planificarEjecucion(p: { autorizacion: AutorizacionMigracion; dryRun: DryRunResult }): PlanEjecucion {
  if (p.autorizacion.decision !== 'CONCEDIDA') {
    throw new Error(`no planificable: autorización ${p.autorizacion.decision} (${p.autorizacion.motivo})`);
  }
  if (!autorizacionVigente(p.autorizacion, p.dryRun)) {
    throw new Error('no planificable: el lote cambió tras autorizar (autorización invalidada)');
  }
  const porKey = new Map(p.dryRun.lineas.map((l) => [l.migrationKey, l]));
  const migrationRunId = `mig_${sha256Hex(`O7:${p.autorizacion.loteSha256}:${p.autorizacion.contenidoSha256}`).slice(0, 12)}`;
  const staging: OperacionStaging[] = [];
  for (const f of p.autorizacion.incluidos) {
    const linea = [...porKey.values()].find(
      (l) => l.proveniencia.source === f.source && l.proveniencia.sourceId === f.sourceId && l.entidad === f.entidad,
    );
    if (!linea || !linea.destinoPropuesto || linea.destinoPropuesto.destinoId === null) {
      throw new Error(`no planificable: ficha sin destino computable (${f.source}:${f.sourceId})`);
    }
    staging.push({
      migrationKey: linea.migrationKey,
      sourceId: f.sourceId,
      coleccion: linea.destinoPropuesto.coleccion,
      destinoId: linea.destinoPropuesto.destinoId,
      operacion: linea.destinoPropuesto.operacion,
      migrationRunId,
    });
  }
  staging.sort((a, b) => (a.migrationKey < b.migrationKey ? -1 : 1));
  const rollback: PasoRollback[] = staging.map((s) => ({
    revierteDestinoId: s.destinoId,
    coleccion: s.coleccion,
    migrationKey: s.migrationKey,
    via: 'migrationRunId',
    migrationRunId,
    accion: s.operacion === 'CREAR'
      ? `revertir creación ${s.coleccion}/${s.destinoId} identificada por ${migrationRunId}`
      : `desvincular ${s.coleccion}/${s.destinoId} identificada por ${migrationRunId} (sin borrar el destino preexistente)`,
  }));
  return {
    ejecutable: false,
    migrationRunId,
    loteId: p.autorizacion.loteId,
    loteSha256: p.autorizacion.loteSha256,
    fases: ['STAGING', 'VALIDACION', 'PROMOCION'],
    staging,
    validaciones: [
      `recontar staging: ${staging.length} operaciones = ${p.autorizacion.incluidos.length} incluidas`,
      'verificar unicidad de destinoId en staging (sin colisiones)',
      'verificar idempotencia: ningún destinoId existe ya con el mismo migrationKey',
      'validar relaciones contra staging antes de promocionar',
      'abortar si cualquier validación falla (promoción separada y posterior)',
    ],
    promocion: [
      'promoción posterior y separada: solo tras validación verde y confirmación explícita',
      'promoción por fases abortables (nunca todo-o-nada sin revisión)',
    ],
    rollback,
    condicionesAborto: [
      'aborto antes de promoción: descartar staging (0 efecto productivo)',
      'aborto tras promoción parcial: aplicar rollback por migrationRunId, operación a operación',
    ],
  };
}

// ---------------------------------------------------------------------------
// Barrera de ejecución (§14): anti-accidental por diseño
// ---------------------------------------------------------------------------

/** Token explícito esperado para un lote (derivado; anti-accidental, no auth). */
export function derivarTokenEjecucion(canonicalBatchSha256: string): string {
  return sha256Hex(`O7-EJECUTAR:${canonicalBatchSha256}`);
}

export interface VeredictoBarrera {
  pasa: boolean;
  motivos: string[];
}

/**
 * Barrera: autorización CONCEDIDA + sha canónico coincidente + token explícito
 * + (opcional) contenido del lote sin cambios. Pura; impide ejecución
 * accidental desde UI, script, test, llamada directa o desarrollo local.
 */
export function verificarBarrera(p: {
  autorizacion: AutorizacionMigracion;
  canonicalBatchSha256: string;
  explicitExecutionToken: string | null;
  dryRunActual?: DryRunResult;
}): VeredictoBarrera {
  const motivos: string[] = [];
  if (p.autorizacion.decision !== 'CONCEDIDA') {
    motivos.push(`autorización ${p.autorizacion.decision} (se exige CONCEDIDA)`);
  }
  if (p.autorizacion.loteSha256 !== p.canonicalBatchSha256) {
    motivos.push('sha canónico no coincide con la autorización (autorización de otro lote no sirve)');
  }
  if (!p.explicitExecutionToken) {
    motivos.push('falta token explícito de ejecución');
  } else if (p.explicitExecutionToken !== derivarTokenEjecucion(p.canonicalBatchSha256)) {
    motivos.push('token explícito inválido para este lote');
  }
  if (p.dryRunActual && !autorizacionVigente(p.autorizacion, p.dryRunActual)) {
    motivos.push('el lote cambió tras autorizar (autorización invalidada)');
  }
  return { pasa: motivos.length === 0, motivos };
}

/**
 * Ejecutor real de la migración: DESACTIVADO por diseño en Orden 7 (§0).
 * Rechaza SIEMPRE, incluso con barrera válida. La ejecución real será un
 * paso posterior explícito. Esta función no contiene ningún camino de
 * escritura: su único comportamiento es rechazar.
 */
export function ejecutarMigracion(_p: {
  autorizacion: AutorizacionMigracion;
  canonicalBatchSha256: string;
  explicitExecutionToken: string | null;
}): never {
  void _p;
  throw new Error(
    'EJECUCION_BLOQUEADA: Orden 7 prepara y formaliza la autorización; el ejecutor permanece desactivado por diseño. Ninguna escritura histórica ha sido ejecutada.',
  );
}
