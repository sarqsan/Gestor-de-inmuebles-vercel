/**
 * BLOQUE 5 — OPERACIONES → FISCALIDAD (batería de cierre).
 * ---------------------------------------------------------------------------
 * Ejecutar con: npm run test:bloque-5
 *
 * Este script NO reimplementa ni duplica lógica de negocio ni aserciones: es un
 * **runner/reporter** que invoca las suites reales de vitest del bloque (motor
 * del circuito, fuente única de deducibilidad y el escritor real de
 * mantenimiento) junto con las suites de regresión fiscal/de gastos que fijan
 * los contratos que el bloque NO puede romper.
 *
 * Criterios que fija además del resultado de cada test:
 *  · todas las suites declaradas se ejecutan (ninguna ausente);
 *  · ningún test queda pendiente/omitido (nada se "maquilla" con skip);
 *  · el número de pruebas no baja de los umbrales del bloque (regresión interna);
 *  · existe el script reproducible (no hay aserciones artificiales de existencia).
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

/** Raíz del repo (ESM: no existe __dirname). */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Suites propias del BLOQUE 5 (fuente de verdad de sus aserciones). */
const SUITES_BLOQUE_5 = [
  'src/utils/operacionGastoEngine.test.ts',
  'src/utils/deducibilidadEngine.test.ts',
  'src/components/modals/RegistrarActuacionModal.test.tsx',
] as const;

/** Suites de regresión que fijan los contratos existentes (deducibilidad, gastos,
 *  informes y exportación fiscal). */
const SUITES_REGRESION = [
  'src/utils/gastosEngine.test.ts',
  'src/utils/fiscalEngine.test.ts',
  'tests/informesEngine.test.ts',
] as const;

/** Umbrales en el cierre: solo pueden subir, nunca bajar. */
const MINIMO_BLOQUE_5 = 46; // 33 motor del circuito + 7 deducibilidad + 6 escritor real
const MINIMO_REGRESION = 133; // 45 gastos + 47 fiscal + 41 informes/exportación

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

const ETIQUETA = (n: number): string => `B5-${String(n).padStart(2, '0')}`;

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
  return existsSync(abs) ? relative(RAIZ, abs) : (p.split('/').slice(-1)[0] as string);
}

function principal(): number {
  console.log('================================================================');
  console.log(' BLOQUE 5 — OPERACIONES → FISCALIDAD (batería de cierre)');
  console.log('================================================================\n');
  console.log(' Suites del bloque (aserciones reales de vitest, sin duplicar lógica):');
  for (const s of SUITES_BLOQUE_5) console.log(`   · ${s}`);
  console.log(' Suites de regresión fiscal/de gastos:');
  for (const s of SUITES_REGRESION) console.log(`   · ${s}`);
  console.log('');

  const salida = mkdtempSync(join(tmpdir(), 'bloque-5-'));
  const jsonPath = join(salida, 'resultado.json');

  const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const proc = spawnSync(bin, [
    'vitest', 'run', '--reporter=json', `--outputFile=${jsonPath}`,
    ...SUITES_BLOQUE_5, ...SUITES_REGRESION,
  ], {
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
  let delBloque = 0;
  let deRegresion = 0;

  for (const archivo of archivos) {
    const fichero = nombreFichero(archivo.name);
    const esDelBloque = (SUITES_BLOQUE_5 as readonly string[]).includes(fichero);
    const aserciones = archivo.assertionResults || [];
    console.log(`--- ${fichero} (${aserciones.length} pruebas)${esDelBloque ? ' [BLOQUE 5]' : ' [regresión]'} ---`);
    for (const a of aserciones) {
      n++;
      if (esDelBloque) delBloque++; else deRegresion++;
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
  n++;
  const ausentesBloque = SUITES_BLOQUE_5.filter((s) => !ejecutadas.has(s));
  const ausentesRegresion = SUITES_REGRESION.filter((s) => !ejecutadas.has(s));
  if (ausentesBloque.length === 0 && ausentesRegresion.length === 0) {
    passed++;
    console.log(`✅ [${ETIQUETA(n)}] PASS: las ${SUITES_BLOQUE_5.length} suites del bloque y las ${SUITES_REGRESION.length} de regresión se han ejecutado`);
  } else {
    failed++;
    console.error(`❌ [${ETIQUETA(n)}] FAIL: suites ausentes — ${[...ausentesBloque, ...ausentesRegresion].join(', ')}`);
  }

  n++;
  if (delBloque >= MINIMO_BLOQUE_5) {
    passed++;
    console.log(`✅ [${ETIQUETA(n)}] PASS: cobertura mínima del BLOQUE 5 respetada (${delBloque} pruebas ≥ ${MINIMO_BLOQUE_5})`);
  } else {
    failed++;
    console.error(`❌ [${ETIQUETA(n)}] FAIL: cobertura del bloque por debajo del umbral (${delBloque} < ${MINIMO_BLOQUE_5})`);
  }

  n++;
  if (deRegresion >= MINIMO_REGRESION) {
    passed++;
    console.log(`✅ [${ETIQUETA(n)}] PASS: regresión fiscal/de gastos cubierta (${deRegresion} pruebas ≥ ${MINIMO_REGRESION})`);
  } else {
    failed++;
    console.error(`❌ [${ETIQUETA(n)}] FAIL: regresión por debajo del umbral (${deRegresion} < ${MINIMO_REGRESION})`);
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
  console.log(` RESULTADO BLOQUE 5: ${passed} PASS · ${failed} FAIL (${passed + failed} comprobaciones)`);
  console.log(` (vitest: ${resultado.numPassedTests ?? passed - 4} tests de ${resultado.numTotalTests ?? n - 4}; fallo: ${resultado.numFailedTests ?? 0})`);
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
  console.error('ERROR fatal en batería BLOQUE 5:', e instanceof Error ? e.message : e);
  process.exit(1);
}
