/**
 * B4 — Interfaz de auditoría: 14 preguntas canónicas + informe determinista.
 *
 * NOTA SOBRE LA ESPECIFICACIÓN PERDIDA (no ocultar):
 * La especificación literal histórica de este bloque no se encuentra
 * disponible en el estado recuperado. Las 14 preguntas y el formato del
 * informe implementados aquí constituyen una interpretación canónica
 * documentada derivada del contrato funcional B4: conteos, proveniencia,
 * resolución de propietario/inmueble, relaciones, duplicados, huérfanos,
 * documentos/Storage, fiscalidad, idempotencia y garantía de no-escritura.
 * Esta implementación no debe presentarse como recuperación literal de la
 * especificación histórica.
 *
 * Reglas: todo se deriva EXCLUSIVAMENTE del `DryRunResult` recibido (nunca se
 * recalcula información paralela fuera del modelo canónico); las respuestas
 * conservan número, evidencia cuando existe, estado e incidencias relevantes;
 * lo indeterminable se contesta `NO DETERMINADO` (nunca se rellena con cero
 * salvo que el modelo demuestre que el valor es realmente cero). Puro y
 * determinista: mismo resultado ⇒ mismo informe byte a byte. Sin I/O, sin
 * persistencia, sin reloj, sin azar.
 */
import { sha256Hex } from '../importacion/hash';
import type { DryRunResult, LineaDryRun } from './tipos';

/** Las 14 preguntas canónicas, en orden exacto (ver nota superior). */
export const PREGUNTAS_CANONICAS: readonly string[] = [
  '¿Cuántos registros históricos se han analizado?',
  '¿De qué fuentes/orígenes proceden los registros analizados?',
  '¿Cuántos registros tienen una procedencia completa y trazable?',
  '¿Cuántos registros tienen propietario destino resuelto inequívocamente?',
  '¿Cuántos registros tienen inmueble destino resuelto inequívocamente?',
  '¿Cuántos registros tienen relaciones necesarias completamente resueltas?',
  '¿Cuántos registros quedan clasificados como AUTO y, por tanto, serían potencialmente migrables sin decisión humana adicional?',
  '¿Cuántos registros requieren REVISIÓN humana?',
  '¿Cuántos registros están INCOMPLETOS?',
  '¿Cuántos registros están BLOQUEADOS o presentan conflictos que impiden una migración segura?',
  '¿Cuántos registros están clasificados como NO_MIGRABLE?',
  '¿Cuántos duplicados, posibles duplicados y registros huérfanos se han detectado?',
  '¿Qué incidencias afectan a documentos, Storage o información fiscal que deban conservarse sin pérdida de procedencia?',
  '¿El dry-run es reproducible e idempotente y se ha confirmado que no ejecuta ninguna escritura real?',
];

/** Respuesta a una pregunta canónica: número + evidencia/estado/incidencias. */
export interface RespuestaPregunta {
  numero: number;
  pregunta: string;
  respuesta: string;
}

function etiqueta(l: LineaDryRun): string {
  return `${l.proveniencia.source}:${l.proveniencia.sourceId}`;
}

/** Procedencia completa y trazable: sistema + id original recuperado (no marcador). */
function procedenciaCompleta(l: LineaDryRun): boolean {
  const p = l.proveniencia;
  return (
    typeof p.source === 'string' && p.source.trim() !== '' &&
    typeof p.sourceId === 'string' && p.sourceId.trim() !== '' &&
    !p.sourceId.startsWith('__ID_NO_RECUPERADO_')
  );
}

/** Incidencia fiscal: deducibilidad no conservada o categoría sin clasificar. */
function fiscalConIncidencia(l: LineaDryRun): boolean {
  if (!l.fiscal) return false;
  return l.fiscal.deducible === null || l.fiscal.clasificacion === 'SIN_CLASIFICAR';
}

/** Verifica idempotencia por recomputación: el motor ordena por migrationKey. */
export function idempotenciaVerificada(resultado: DryRunResult): boolean {
  const claves = resultado.lineas.map((x) => x.migrationKey).sort();
  return sha256Hex(claves.join('|')) === resultado.loteSha256;
}

/** Top de motivos determinista: más frecuentes primero; empate ⇒ alfabético. */
function topMotivos(lineas: readonly LineaDryRun[]): string {
  const cuenta = new Map<string, number>();
  for (const l of lineas) cuenta.set(l.motivo, (cuenta.get(l.motivo) ?? 0) + 1);
  const top = [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 3);
  return top.length === 0 ? '—' : top.map(([m, c]) => `×${c} ${m}`).join(' ‖ ');
}

function porClave(lineas: readonly LineaDryRun[]): LineaDryRun[] {
  return [...lineas].sort((a, b) => (a.migrationKey < b.migrationKey ? -1 : 1));
}

/**
 * Responde las 14 preguntas canónicas a partir del `DryRunResult`.
 * Exactamente 14 respuestas, en orden; sin preguntas adicionales.
 */
export function responderPreguntas(resultado: DryRunResult): readonly RespuestaPregunta[] {
  const lineas = resultado.lineas;
  const resumen = resultado.resumen;
  const total = resumen.totalRegistros;
  const porDecision = (d: string): LineaDryRun[] => lineas.filter((x) => x.decision === d);
  const fuentes = [...new Set(lineas.map((x) => x.proveniencia.source))].sort();
  const completas = lineas.filter(procedenciaCompleta);
  const prop = {
    resueltos: lineas.filter((x) => x.estadoPropietario === 'RESUELTO' && x.propietarioDestinoId !== null),
    incompletos: lineas.filter((x) => x.estadoPropietario === 'INCOMPLETO').length,
    bloqueados: lineas.filter((x) => x.estadoPropietario === 'BLOQUEADO').length,
    noMigrables: lineas.filter((x) => x.estadoPropietario === 'NO_MIGRABLE').length,
  };
  const inmb = {
    resueltos: lineas.filter((x) => x.estadoInmueble === 'RESUELTO' && x.inmuebleDestinoId !== null),
    incompletos: lineas.filter((x) => x.estadoInmueble === 'INCOMPLETO').length,
    bloqueados: lineas.filter((x) => x.estadoInmueble === 'BLOQUEADO').length,
    noMigrables: lineas.filter((x) => x.estadoInmueble === 'NO_MIGRABLE').length,
  };
  const relOk = lineas.filter((x) => x.relaciones.padreResuelto);
  const autos = porDecision('AUTO');
  const revisiones = porDecision('REVISION');
  const incompletos = porDecision('INCOMPLETO');
  const bloqueados = porDecision('BLOQUEADO');
  const noMigrables = porDecision('NO_MIGRABLE');
  const exactos = lineas.filter((x) => x.duplicado.tipo === 'EXACTO');
  const probables = lineas.filter((x) => x.duplicado.tipo === 'PROBABLE');
  const huerfanos = lineas.filter((x) => x.huerfano.es);
  const documentos = lineas.filter((x) => x.entidad === 'DOCUMENTO');
  const docsOk = documentos.filter((x) => x.decision === 'AUTO');
  const docsInc = documentos.filter((x) => x.decision !== 'AUTO');
  const legacyPdtes = lineas.filter((x) => x.entidad === 'LEGACY_STORAGE' && x.legacyStorage?.estado !== 'RESUELTO');
  const fiscales = lineas.filter((x) => x.fiscal !== undefined);
  const fiscalesInc = fiscales.filter(fiscalConIncidencia);
  const idem = idempotenciaVerificada(resultado);
  const noEsc = resultado.soloLectura === true;

  const r: string[] = [];
  // 1
  r.push(
    total === 0
      ? '0 registros históricos analizados (lote vacío: cero demostrado por el modelo).'
      : `${total} registro(s) histórico(s) analizados (lote ${resultado.loteSha256.slice(0, 12)}…, esquema ${resultado.esquemaVersion}).`,
  );
  // 2
  if (fuentes.length === 0) {
    r.push('Ninguna: lote vacío sin registros analizados.');
  } else {
    const detalle = fuentes.map((f) => {
      const c = resumen.porFuente[f] ?? { total: 0, auto: 0, revision: 0, incompleto: 0, bloqueado: 0, noMigrable: 0 };
      return `${f}: total ${c.total} (AUTO ${c.auto}, REVISIÓN ${c.revision}, INCOMPLETO ${c.incompleto}, BLOQUEADO ${c.bloqueado}, NO_MIGRABLE ${c.noMigrable})`;
    });
    r.push(`${fuentes.length} fuente(s) analizada(s): ${fuentes.join(', ')}.\n${detalle.join('\n')}`);
  }
  // 3
  r.push(
    `${completas.length} de ${total} con procedencia completa y trazable ` +
    `(${total - completas.length} con procedencia incompleta).` +
    (total - completas.length > 0
      ? `\nProcedencia incompleta: ${porClave(lineas.filter((x) => !procedenciaCompleta(x))).map(etiqueta).join(' ‖ ')}.`
      : ''),
  );
  // 4
  r.push(
    `${prop.resueltos.length} registro(s) con propietario destino resuelto inequívocamente ` +
    `(estado RESUELTO con id destino único).` +
    (total > 0 ? `\nResto: INCOMPLETO ${prop.incompletos}, BLOQUEADO ${prop.bloqueados}, NO_MIGRABLE ${prop.noMigrables}.` : ''),
  );
  // 5
  r.push(
    `${inmb.resueltos.length} registro(s) con inmueble destino resuelto inequívocamente ` +
    `(estado RESUELTO con id destino único).` +
    (total > 0 ? `\nResto: INCOMPLETO ${inmb.incompletos}, BLOQUEADO ${inmb.bloqueados}, NO_MIGRABLE ${inmb.noMigrables}.` : ''),
  );
  // 6
  r.push(
    `${relOk.length} de ${total} con relaciones necesarias completamente resueltas (padreResuelto).` +
    (total - relOk.length > 0 ? ` Incidencias: ${topMotivos(lineas.filter((x) => !x.relaciones.padreResuelto))}.` : ''),
  );
  // 7
  r.push(
    `${autos.length} registro(s) AUTO (potencialmente migrables sin decisión humana adicional).` +
    (autos.length > 0 ? `\nEvidencia (migrationKey): ${porClave(autos).map((x) => x.migrationKey.slice(0, 12)).join(', ')}.` : ''),
  );
  // 8
  r.push(
    `${revisiones.length} registro(s) requieren REVISIÓN humana.` +
    (revisiones.length > 0 ? ` Motivos: ${topMotivos(revisiones)}.` : ''),
  );
  // 9
  r.push(
    `${incompletos.length} registro(s) INCOMPLETOS.` +
    (incompletos.length > 0 ? ` Motivos: ${topMotivos(incompletos)}.` : ''),
  );
  // 10
  r.push(
    `${bloqueados.length} registro(s) BLOQUEADOS; ${resumen.conflictos} línea(s) con conflicto registrado.` +
    (bloqueados.length > 0 ? ` Motivos: ${topMotivos(bloqueados)}.` : ''),
  );
  // 11
  r.push(
    `${noMigrables.length} registro(s) NO_MIGRABLES.` +
    (noMigrables.length > 0 ? ` Motivos: ${topMotivos(noMigrables)}.` : ''),
  );
  // 12
  {
    const ev: string[] = [];
    for (const l of porClave(exactos)) ev.push(`EXACTO ${l.migrationKey.slice(0, 12)}↔${[...l.duplicado.con].sort().join(',') || '—'}`);
    for (const l of porClave(probables)) ev.push(`PROBABLE ${l.migrationKey.slice(0, 12)}↔${[...l.duplicado.con].sort().join(',') || '—'}`);
    for (const l of porClave(huerfanos)) ev.push(`HUÉRFANO ${l.migrationKey.slice(0, 12)} (${l.huerfano.motivo ?? 'sin motivo'})`);
    r.push(
      `Duplicados exactos: ${exactos.length}; probables: ${probables.length}; huérfanos: ${huerfanos.length}.` +
      (ev.length > 0 ? `\nEvidencia: ${ev.join(' ‖ ')}.` : ''),
    );
  }
  // 13
  {
    const inc: string[] = [];
    for (const l of porClave(docsInc)) inc.push(`${l.migrationKey.slice(0, 12)} DOCUMENTO [${etiqueta(l)}]: ${l.motivo}`);
    for (const l of porClave(legacyPdtes)) inc.push(`${l.migrationKey.slice(0, 12)} LEGACY_STORAGE [${etiqueta(l)}]: ${l.legacyStorage?.motivo ?? l.motivo}`);
    for (const l of porClave(fiscalesInc)) inc.push(`${l.migrationKey.slice(0, 12)} FISCAL [${etiqueta(l)}]: ${l.fiscal?.motivo ?? '—'}`);
    r.push(
      `Documentos: ${documentos.length} analizados (${docsOk.length} completos, ${docsInc.length} con incidencia). ` +
      `Objetos legacy pendientes: ${legacyPdtes.length}. ` +
      `Registros fiscales: ${fiscales.length} analizados (${fiscalesInc.length} con incidencia).` +
      (inc.length > 0 ? `\nIncidencias (procedencia conservada):\n${inc.join('\n')}` : '\nSin incidencias: nada que conservar.'),
    );
  }
  // 14
  r.push(
    `Idempotencia: ${idem ? 'PASS' : 'FAIL'} — loteSha256 ${idem ? 'verificado por recomputación sobre ' + total + ' migrationKey(s) ordenadas; el orden de entrada no influye (el motor ordena por migrationKey)' : 'NO coincide con la recomputación; NO DETERMINADO si el resultado es íntegro'}.\n` +
    `No-escritura: ${noEsc ? 'PASS' : 'FAIL'} — ${noEsc ? 'soloLectura=true; B4 no ejecuta escrituras reales (garantía testeada)' : 'el resultado NO declara solo-lectura; NO DETERMINADO'}.`,
  );

  return PREGUNTAS_CANONICAS.map((pregunta, i) => ({ numero: i + 1, pregunta, respuesta: r[i] ?? 'NO DETERMINADO' }));
}

// ---------------------------------------------------------------------------
// Informe final en formato exacto (ver nota superior)
// ---------------------------------------------------------------------------

function lineaPendiente(l: LineaDryRun): string {
  return `- ${l.migrationKey.slice(0, 12)} ${l.entidad} [${etiqueta(l)}] → ${l.decision}: ${l.motivo}`;
}

/** Informe final determinista del dry-run, en el formato exacto especificado. */
export function generarInforme(resultado: DryRunResult): string {
  const resumen = resultado.resumen;
  const lineas = resultado.lineas;
  const total = resumen.totalRegistros;
  const fuentes = [...new Set(lineas.map((x) => x.proveniencia.source))].sort();
  const procOk = lineas.filter(procedenciaCompleta).length;
  const propOk = lineas.filter((x) => x.estadoPropietario === 'RESUELTO' && x.propietarioDestinoId !== null).length;
  const inmbOk = lineas.filter((x) => x.estadoInmueble === 'RESUELTO' && x.inmuebleDestinoId !== null).length;
  const relOk = lineas.filter((x) => x.relaciones.padreResuelto).length;
  const exactos = lineas.filter((x) => x.duplicado.tipo === 'EXACTO').length;
  const probables = lineas.filter((x) => x.duplicado.tipo === 'PROBABLE').length;
  const documentos = lineas.filter((x) => x.entidad === 'DOCUMENTO');
  const docsOk = documentos.filter((x) => x.decision === 'AUTO').length;
  const legacyPdtes = lineas.filter((x) => x.entidad === 'LEGACY_STORAGE' && x.legacyStorage?.estado !== 'RESUELTO').length;
  const fiscales = lineas.filter((x) => x.fiscal !== undefined);
  const fiscalesInc = fiscales.filter(fiscalConIncidencia).length;
  const idem = idempotenciaVerificada(resultado);
  const noEsc = resultado.soloLectura === true;
  const respuestas = responderPreguntas(resultado);
  const pendientes = porClave(lineas.filter((x) => x.decision !== 'AUTO'));

  const bloque8 = respuestas
    .map((p) => {
      const sangria = ' '.repeat(`${p.numero}. `.length);
      const cuerpo = p.respuesta.split('\n').map((ln, i) => (i === 0 ? `${sangria}${ln}` : `${sangria}${ln}`)).join('\n');
      return `${p.numero}. ${p.pregunta}\n${cuerpo}`;
    })
    .join('\n\n');

  const bloque10 =
    total === 0
      ? '(lote vacío: sin registros analizados)'
      : pendientes.length === 0
        ? 'Sin incidencias pendientes.'
        : pendientes.map(lineaPendiente).join('\n');

  return [
    'ORDEN 5 — B4 DRY-RUN DE MIGRACIÓN',
    '==================================',
    '',
    '1. RESUMEN',
    '-----------',
    `Registros analizados: ${total}`,
    `AUTO: ${resumen.auto}`,
    `REVISIÓN: ${resumen.revision}`,
    `INCOMPLETO: ${resumen.incompleto}`,
    `BLOQUEADO: ${resumen.bloqueado}`,
    `NO_MIGRABLE: ${resumen.noMigrable}`,
    '',
    '2. PROVENIENCIA',
    '---------------',
    `Fuentes analizadas: ${fuentes.length}`,
    `Registros con procedencia completa: ${procOk}`,
    `Registros con procedencia incompleta: ${total - procOk}`,
    '',
    '3. RESOLUCIÓN',
    '-------------',
    `Propietario resuelto: ${propOk}`,
    `Inmueble resuelto: ${inmbOk}`,
    `Relaciones completas: ${relOk}`,
    '',
    '4. INTEGRIDAD',
    '-------------',
    `Duplicados exactos: ${exactos}`,
    `Duplicados probables: ${probables}`,
    `Huérfanos: ${resumen.huerfanos}`,
    `Conflictos: ${resumen.conflictos}`,
    '',
    '5. DOCUMENTOS Y STORAGE',
    '-----------------------',
    `Documentos completos: ${docsOk}`,
    `Documentos con incidencia: ${documentos.length - docsOk}`,
    `Objetos legacy pendientes: ${legacyPdtes}`,
    '',
    '6. FISCALIDAD',
    '-------------',
    `Registros fiscales analizados: ${fiscales.length}`,
    `Registros fiscales con incidencia: ${fiscalesInc}`,
    '',
    '7. IDEMPOTENCIA Y SEGURIDAD',
    '---------------------------',
    `Idempotencia: ${idem ? 'PASS' : 'FAIL'}`,
    `No-escritura: ${noEsc ? 'PASS' : 'FAIL'}`,
    '',
    '8. 14 PREGUNTAS CANÓNICAS',
    '-------------------------',
    bloque8,
    '',
    '9. DECISIÓN DE MIGRACIÓN',
    '------------------------',
    'Migración real ejecutada: NO',
    'Escrituras históricas ejecutadas: NO',
    `Registros potencialmente migrables: ${resumen.auto}`,
    `Registros que requieren revisión/autorización: ${total - resumen.auto}`,
    '',
    '10. PENDIENTES',
    '-------------',
    bloque10,
    '',
    'FIN DEL INFORME',
    '===============',
    '',
  ].join('\n');
}
