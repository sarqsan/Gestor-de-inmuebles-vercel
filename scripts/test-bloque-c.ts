/**
 * BLOQUE C — Batería de cierre (morosidad, recobro y expediente legal).
 * -------------------------------------------------------------------------
 * Ejecutar con: npm run test:bloque-c
 *
 * Este script NO reimplementa ni duplica lógica de negocio ni aserciones: es un
 * **runner/reporter** que invoca las suites reales de vitest del bloque C
 * (motor de estados, motor de recobro, casos de uso/store con dispatcher GAP 1
 * verificado y reglas de Firestore) y las presenta con el formato numerado
 * `C-NN` que usa este repo para los informes de cierre de bloque.
 *
 * Criterios que fija además del resultado de cada test:
 *  · las 4 suites del bloque se ejecutan todas (ninguna ausente);
 *  · ningún test queda pendiente/omitido (nada se "maquilla" con skip);
 *  · el número total de pruebas no baja del umbral del bloque (regresión interna).
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

/** Raíz del repo (ESM: no existe __dirname). */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Suites canónicas del BLOQUE C (la fuente de verdad de sus aserciones). */
const SUITES = [
  'src/utils/morosidad/morosidadEstados.test.ts',
  'src/utils/morosidad/morosidadEngine.test.ts',
  'src/utils/morosidad/morosidadStore.test.ts',
  'src/utils/morosidad/firestoreRulesMorosidad.test.ts',
] as const;

/** Umbral de pruebas del bloque (79 en el cierre; solo puede subir, nunca bajar). */
const MINIMO_PRUEBAS = 79;

interface AsercionJSON {
  ancestorTitles?: string[];
  title?: string;
  fullName?: string;
  status?: string;
  duration?: number;
  failureMessages?: string[];
}

interface ArchivoJSON {
  name?: string;
  status?: string;
  assertionResults?: AsercionJSON[];
}

interface ResultadoJSON {
  success?: boolean;
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  testResults?: ArchivoJSON[];
}

const ETIQUETA = (n: number): string => `C-${String(n).padStart(2, '0')}`;

function leerJSON(ruta: string): ResultadoJSON | null {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8')) as ResultadoJSON;
  } catch {
    return null;
  }
}

function nombreFichero(p: string | undefined): string {
  if (!p) return '(desconocido)';
  const abs = resolve(p);
  return existsSync(abs) ? relative(RAIZ, abs) : p.split('/').slice(-1)[0] as string;
}

function principal(): number {
  console.log('================================================================');
  console.log(' BLOQUE C — MOROSIDAD, RECOBRO Y EXPEDIENTE LEGAL (batería de cierre)');
  console.log('================================================================\n');
  console.log(' Suites ejecutadas (aserciones reales de vitest, sin duplicar lógica):');
  for (const s of SUITES) console.log(`   · ${s}`);
  console.log('');

  const salida = mkdtempSync(join(tmpdir(), 'bloque-c-'));
  const jsonPath = join(salida, 'resultado.json');

  const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const proc = spawnSync(bin, ['vitest', 'run', '--reporter=json', `--outputFile=${jsonPath}`, ...SUITES], {
    cwd: RAIZ,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  if (proc.error) {
    console.error('No se pudo invocar vitest:', proc.error.message);
    return 1;
  }

  const resultado = leerJSON(jsonPath);
  if (!resultado) {
    console.error('vitest no produjo el informe JSON esperado en', jsonPath);
    console.error((proc.stdout || '').slice(-2000));
    console.error((proc.stderr || '').slice(-2000));
    return 1;
  }

  const archivos = resultado.testResults || [];
  let n = 0;
  let passed = 0;
  let failed = 0;
  let pending = 0;

  for (const archivo of archivos) {
    const fichero = nombreFichero(archivo.name);
    const aserciones = archivo.assertionResults || [];
    console.log(`--- ${fichero} (${aserciones.length} pruebas) ---`);
    for (const a of aserciones) {
      n++;
      const suite = (a.ancestorTitles || []).join(' › ');
      const titulo = a.fullName && a.fullName.length > 0 ? a.title || a.fullName : '(anónima)';
      const dur = typeof a.duration === 'number' ? ` [${a.duration.toFixed(1)} ms]` : '';
      const etiquetaSuite = suite ? `${suite} · ${titulo}` : `${fichero} · ${titulo}`;
      if (a.status === 'passed') {
        passed++;
        console.log(`✅ [${ETIQUETA(n)}] PASS: ${etiquetaSuite}${dur}`);
      } else if (a.status === 'pending' || a.status === 'skipped' || a.status === 'todo') {
        pending++;
        console.log(`⚠️  [${ETIQUETA(n)}] SKIP: ${etiquetaSuite} — un test omitido no puede contar como cierre`);
      } else {
        failed++;
        const motivo = (a.failureMessages || []).join(' | ').replace(/\s+/g, ' ').slice(0, 400);
        console.error(`❌ [${ETIQUETA(n)}] FAIL: ${etiquetaSuite} — ${motivo || a.status || 'sin detalle'}`);
      }
    }
    console.log('');
  }

  // --- Criterios estructurales del cierre (numeración continuada tras los tests) ---
  const ejecutadas = new Set(archivos.map((a) => nombreFichero(a.name)));
  const ausentes = SUITES.filter((s) => !ejecutadas.has(s));
  n++;
  if (ausentes.length === 0) {
    passed++;
    console.log(`✅ [${ETIQUETA(n)}] PASS: las 4 suites del BLOQUE C se han ejecutado`);
  } else {
    failed++;
    console.error(`❌ [${ETIQUETA(n)}] FAIL: suites ausentes — ${ausentes.join(', ')}`);
  }

  n++;
  const total = resultado.numTotalTests ?? n - 1;
  if (total >= MINIMO_PRUEBAS) {
    passed++;
    console.log(`✅ [${ETIQUETA(n)}] PASS: cobertura mínima del bloque respetada (${total} pruebas ≥ ${MINIMO_PRUEBAS})`);
  } else {
    failed++;
    console.error(`❌ [${ETIQUETA(n)}] FAIL: cobertura por debajo del umbral (${total} < ${MINIMO_PRUEBAS})`);
  }

  n++;
  if (pending === 0 && (resultado.numPendingTests ?? 0) === 0) {
    passed++;
    console.log(`✅ [${ETIQUETA(n)}] PASS: ningún test queda omitido/pendiente (nada se oculta con skip)`);
  } else {
    failed++;
    console.error(`❌ [${ETIQUETA(n)}] FAIL: hay ${pending} prueba(s) omitida(s); el cierre exige cobertura real`);
  }

  console.log('\n================================================================');
  console.log(` RESULTADO BLOQUE C: ${passed} PASS · ${failed} FAIL (${passed + failed} comprobaciones)`);
  console.log(` (vitest: ${resultado.numPassedTests ?? passed - 3} tests de ${total}; fallo: ${resultado.numFailedTests ?? 0})`);
  console.log('================================================================');

  if (failed > 0) return 1;
  if (resultado.success !== true) {
    console.error('vitest informó success=false pese a la ausencia de fallos: revisar el informe.');
    return 1;
  }
  return 0;
}

try {
  process.exit(principal());
} catch (e) {
  console.error('ERROR fatal en batería BLOQUE C:', e instanceof Error ? e.message : e);
  process.exit(1);
}
