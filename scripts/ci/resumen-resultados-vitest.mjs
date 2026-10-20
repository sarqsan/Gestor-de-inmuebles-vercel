#!/usr/bin/env node
/**
 * AG-03.3 · Resultados de vitest legibles desde fuera del runner.
 *
 * Lee el JSON del reporter de vitest y lo publica de tres formas que no
 * requieren descargar el log del job (que vive en un host de blobs externo):
 *   1. anotaciones del check-run (`::notice` / `::error`), consultables con la
 *      API REST `GET /repos/{owner}/{repo}/check-runs/{job_id}/annotations`;
 *   2. resumen del paso (`$GITHUB_STEP_SUMMARY`), visible en la interfaz;
 *   3. salida estándar (misma información).
 * Sin secretos ni red. Nunca altera el código de salida del job: informa.
 *
 * Uso: node scripts/ci/resumen-resultados-vitest.mjs <resultados.json> <etiqueta>
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const [, , rutaJson = 'vitest-resultados.json', etiqueta = 'vitest'] = process.argv;

// Codificación exigida por los comandos de flujo de trabajo de GitHub Actions.
const mensaje = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const titulo = (s) => mensaje(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
const compacto = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
const nombreCorto = (ruta) => String(ruta).split('/').slice(-2).join('/');

function anotar(nivel, tit, cuerpo) {
  process.stdout.write(`::${nivel} title=${titulo(tit)}::${mensaje(cuerpo)}\n`);
}

function resumen(texto) {
  process.stdout.write(`${texto}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${texto}\n`);
}

if (!existsSync(rutaJson)) {
  anotar('error', `${etiqueta}: sin resultados`, `No existe ${rutaJson}: la ejecución no llegó a producir el JSON de vitest (fallo de preparación o del propio runner).`);
  resumen(`### ${etiqueta}\n\nSin archivo de resultados \`${rutaJson}\`.`);
  process.exit(0);
}

let r;
try {
  r = JSON.parse(readFileSync(rutaJson, 'utf8'));
} catch (error) {
  anotar('error', `${etiqueta}: JSON ilegible`, `No se pudo leer ${rutaJson}: ${compacto(error && error.message, 300)}`);
  process.exit(0);
}

const archivos = Array.isArray(r.testResults) ? r.testResults : [];
const porArchivo = archivos.map((f) => {
  const casos = Array.isArray(f.assertionResults) ? f.assertionResults : [];
  const correctas = casos.filter((a) => a.status === 'passed').length;
  const fallidas = casos.filter((a) => a.status === 'failed');
  const omitidas = casos.filter((a) => a.status === 'skipped' || a.status === 'pending' || a.status === 'todo').length;
  const fallosDeArchivo = f.status !== 'passed' && fallidas.length === 0 && f.message ? compacto(f.message, 700) : '';
  return { nombre: nombreCorto(f.name), estado: f.status, total: casos.length, correctas, fallidas, omitidas, fallosDeArchivo };
});

const global = `${etiqueta}: ${r.success ? 'CORRECTO' : 'FALLIDO'} · archivos ${archivos.filter((f) => f.status === 'passed').length}/${archivos.length} correctos · pruebas ${r.numPassedTests}/${r.numTotalTests} correctas · ${r.numFailedTests} fallidas · ${r.numPendingTests || 0} omitidas`;
anotar(r.success ? 'notice' : 'error', `${etiqueta}: resumen`, global);

const lineas = [`### ${global}`, '', '| Archivo | Estado | Correctas | Fallidas | Omitidas |', '|---|---|---:|---:|---:|'];
for (const a of porArchivo) {
  lineas.push(`| ${a.nombre} | ${a.estado} | ${a.correctas}/${a.total} | ${a.fallidas.length} | ${a.omitidas} |`);
}
resumen(lineas.join('\n'));

// Una anotación por archivo con el detalle de sus pruebas (los emuladores tienen pocos archivos:
// cada uno cabe en una anotación; en la suite completa sólo se anotan los archivos no correctos).
const detallar = porArchivo.length <= 10 ? porArchivo : porArchivo.filter((a) => a.estado !== 'passed');
let anotaciones = 0;
for (const a of detallar.slice(0, 9)) {
  const archivo = archivos.find((f) => nombreCorto(f.name) === a.nombre);
  const casos = (archivo && archivo.assertionResults) || [];
  const detalle = porArchivo.length <= 10
    ? casos.map((c) => `${c.status === 'passed' ? 'OK ' : c.status === 'failed' ? 'FALLO ' : 'OMITIDA '}${compacto(c.fullName, 160)}`).join('\n')
    : a.fallidas.map((c) => `FALLO ${compacto(c.fullName, 160)}`).join('\n');
  const errores = a.fallidas.map((c) => `· ${compacto(c.fullName, 120)} → ${compacto((c.failureMessages || []).join(' '), 400)}`).join('\n');
  const cuerpo = [`${a.estado.toUpperCase()} · ${a.correctas}/${a.total} correctas · ${a.fallidas.length} fallidas · ${a.omitidas} omitidas`, detalle, a.fallosDeArchivo ? `ERROR DE ARCHIVO: ${a.fallosDeArchivo}` : '', errores ? `ERRORES:\n${errores}` : '']
    .filter(Boolean).join('\n').slice(0, 3800);
  anotar(a.estado === 'passed' ? 'notice' : 'error', `${etiqueta}: ${a.nombre}`, cuerpo);
  anotaciones += 1;
}
if (detallar.length > 9) {
  anotar('error', `${etiqueta}: más archivos`, `Hay ${detallar.length - 9} archivos no correctos adicionales; ver el artefacto ${rutaJson}.`);
}
process.stdout.write(`[resumen-resultados-vitest] ${anotaciones} anotaciones de archivo emitidas\n`);
