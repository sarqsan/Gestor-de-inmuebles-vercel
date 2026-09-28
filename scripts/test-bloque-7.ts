/**
 * BLOQUE 7 — IMPORTACIÓN / EXPORTACIÓN + XLSX (batería de cierre).
 * ---------------------------------------------------------------------------
 * Ejecutar con: npm run test:bloque-7
 *
 * Este script NO reimplementa ni duplica lógica de negocio ni aserciones: es un
 * **runner/reporter** que invoca las suites reales de vitest del bloque (lector
 * y escritor XLSX propios, contrato canónico de importación/exportación,
 * auditoría y panel) junto con las suites de regresión de los contratos que el
 * bloque NO puede romper (importador histórico B1, dry-run B4, conciliación
 * CSV, autorización O7, auditoría, expediente fiscal y el circuito del Bloque 5).
 *
 * Criterios que fija además del resultado de cada test:
 *  · todas las suites declaradas se ejecutan (ninguna ausente);
 *  · ningún test queda pendiente/omitido (nada se "maquilla" con skip);
 *  · el número de pruebas no baja de los umbrales del bloque (regresión interna);
 *  · los libros de fixture son ZIP reales y los entiende zlib (decodificador
 *    independiente del lector del bloque);
 *  · el libro que escribe el bloque se relee con el propio lector (round-trip
 *    byte a byte determinista, sin depender del fixture);
 *  · no se ha añadido ninguna dependencia: ZIP/DEFLATE/XLSX son implementación
 *    propia y ningún módulo del bloque importa una librería externa de Excel/ZIP.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'fs';
import zlib from 'node:zlib';
import { tmpdir } from 'os';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { generarXlsx, parseXlsx } from '../src/lib/importExport';
import { leerZip } from '../src/lib/importExport/zip';

/** Raíz del repo (ESM: no existe __dirname). */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Suites propias del BLOQUE 7 (fuente de verdad de sus aserciones). */
const SUITES_BLOQUE_7 = [
  'src/lib/importExport/xlsx.test.ts',
  'tests/import-export-xlsx.test.ts',
  'tests/import-export-canonico.test.ts',
  'tests/import-export-auditoria.test.ts',
  'tests/import-export-panel.test.tsx',
] as const;

/** Suites de regresión que fijan los contratos existentes (importación B1/B4,
 *  conciliación CSV, autorización O7, auditoría, fiscal y circuito Bloque 5). */
const SUITES_REGRESION = [
  'src/lib/importacion/importacion.test.ts',
  'tests/migracion-dry-run-b4.test.ts',
  'tests/conciliacion.test.ts',
  'tests/conciliacion-persistencia.test.ts',
  'tests/autorizacion-migracion-o7.test.ts',
  'tests/auditoria-coexistencia.test.ts',
  'src/lib/expedienteFiscal/expedienteFiscal.test.ts',
  'src/utils/operacionGastoEngine.test.ts',
  'src/components/modals/RegistrarActuacionModal.test.tsx',
] as const;

/** Umbrales en el cierre: solo pueden subir, nunca bajar. */
const MINIMO_BLOQUE_7 = 195; // 37 lector/escritor XLSX + 10 extremo a extremo + 107 contrato + 34 auditoría + 7 panel
const MINIMO_REGRESION = 230; // importación B1/B4, conciliación, O7, auditoría, fiscal y circuito Bloque 5

/** Nº de libros reales de fixture exigido (SheetJS + zlib, fuera del repo). */
const MINIMO_FIXTURES = 12;

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

const ETIQUETA = (n: number): string => `B7-${String(n).padStart(2, '0')}`;

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

/**
 * Decodificador ZIP INDEPENDIENTE (solo zlib + DataView): lee el directorio
 * central, infla cada parte con `zlib.inflateRawSync` y devuelve su contenido.
 * Sirve para verificar que el lector del bloque no "interpreta" los fixtures.
 */
function partesConZlib(zip: Uint8Array): Map<string, Uint8Array> {
  const vista = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let p = zip.length - 22; p >= 0; p--) {
    if (vista.getUint32(p, true) === 0x06054b50) { eocd = p; break; }
  }
  if (eocd < 0) throw new Error('EOCD no encontrado');
  const total = vista.getUint16(eocd + 10, true);
  let p = vista.getUint32(eocd + 16, true);
  const salida = new Map<string, Uint8Array>();
  for (let i = 0; i < total; i++) {
    const metodo = vista.getUint16(p + 10, true);
    const comprimido = vista.getUint32(p + 20, true);
    const descomprimido = vista.getUint32(p + 24, true);
    const largoNombre = vista.getUint16(p + 28, true);
    const offsetLocal = vista.getUint32(p + 42, true);
    const nombre = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + largoNombre));
    const largoLocal = vista.getUint16(offsetLocal + 26, true);
    const inicio = offsetLocal + 30 + largoLocal;
    const crudo = zip.subarray(inicio, inicio + comprimido);
    const datos = metodo === 0 ? crudo : new Uint8Array(zlib.inflateRawSync(crudo));
    if (datos.length !== descomprimido) throw new Error(`tamaño descomprimido distinto en '${nombre}'`);
    salida.set(nombre, datos);
    p += 46 + largoNombre + vista.getUint16(p + 30, true) + vista.getUint16(p + 32, true);
  }
  return salida;
}

function principal(): number {
  console.log('================================================================');
  console.log(' BLOQUE 7 — IMPORTACIÓN / EXPORTACIÓN + XLSX (batería de cierre)');
  console.log('================================================================\n');
  console.log(' Suites del bloque (aserciones reales de vitest, sin duplicar lógica):');
  for (const s of SUITES_BLOQUE_7) console.log(`   · ${s}`);
  console.log(' Suites de regresión de los contratos que el bloque no puede romper:');
  for (const s of SUITES_REGRESION) console.log(`   · ${s}`);
  console.log('');

  const salida = mkdtempSync(join(tmpdir(), 'bloque-7-'));
  const jsonPath = join(salida, 'resultado.json');

  const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const proc = spawnSync(bin, [
    'vitest', 'run', '--reporter=json', `--outputFile=${jsonPath}`,
    ...SUITES_BLOQUE_7, ...SUITES_REGRESION,
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
    const esDelBloque = (SUITES_BLOQUE_7 as readonly string[]).includes(fichero);
    const aserciones = archivo.assertionResults || [];
    console.log(`--- ${fichero} (${aserciones.length} pruebas)${esDelBloque ? ' [BLOQUE 7]' : ' [regresión]'} ---`);
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
  const ausentesBloque = SUITES_BLOQUE_7.filter((s) => !ejecutadas.has(s));
  const ausentesRegresion = SUITES_REGRESION.filter((s) => !ejecutadas.has(s));
  if (ausentesBloque.length === 0 && ausentesRegresion.length === 0) {
    passed++;
    console.log(`✅ [${ETIQUETA(n)}] PASS: las ${SUITES_BLOQUE_7.length} suites del bloque y las ${SUITES_REGRESION.length} de regresión se han ejecutado`);
  } else {
    failed++;
    console.error(`❌ [${ETIQUETA(n)}] FAIL: suites ausentes — ${[...ausentesBloque, ...ausentesRegresion].join(', ')}`);
  }

  n++;
  if (delBloque >= MINIMO_BLOQUE_7) {
    passed++;
    console.log(`✅ [${ETIQUETA(n)}] PASS: cobertura mínima del BLOQUE 7 respetada (${delBloque} pruebas ≥ ${MINIMO_BLOQUE_7})`);
  } else {
    failed++;
    console.error(`❌ [${ETIQUETA(n)}] FAIL: cobertura del bloque por debajo del umbral (${delBloque} < ${MINIMO_BLOQUE_7})`);
  }

  n++;
  if (deRegresion >= MINIMO_REGRESION) {
    passed++;
    console.log(`✅ [${ETIQUETA(n)}] PASS: regresión de los contratos afectados cubierta (${deRegresion} pruebas ≥ ${MINIMO_REGRESION})`);
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

  // --- Verificación cruzada de fixtures con zlib (decodificador independiente) ---
  n++;
  const dirFixtures = resolve(RAIZ, 'tests/fixtures/xlsx');
  const nombresFixture = existsSync(dirFixtures)
    ? readdirSync(dirFixtures).filter((f) => f.endsWith('.xlsx')).sort()
    : [];
  const problemasFixtures: string[] = [];
  for (const nombre of nombresFixture) {
    const bytes = new Uint8Array(readFileSync(resolve(dirFixtures, nombre)));
    try {
      const conZlib = partesConZlib(bytes);
      const conBloque = new Map(leerZip(bytes).map((p) => [p.nombre, p.datos]));
      for (const [parte, datos] of conZlib) {
        const propios = conBloque.get(parte);
        if (!propios || !Buffer.from(propios).equals(Buffer.from(datos))) {
          problemasFixtures.push(`${nombre}:${parte} (el lector del bloque no coincide con zlib)`);
        }
      }
      if (conZlib.size !== conBloque.size) problemasFixtures.push(`${nombre}: nº de partes distinto`);
    } catch (e) {
      problemasFixtures.push(`${nombre}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (nombresFixture.length >= MINIMO_FIXTURES && problemasFixtures.length === 0) {
    passed++;
    console.log(`✅ [${ETIQUETA(n)}] PASS: ${nombresFixture.length} libros de fixture (≥ ${MINIMO_FIXTURES}) legibles por zlib con partes IDÉNTICAS a las del lector del bloque`);
  } else {
    failed++;
    console.error(`❌ [${ETIQUETA(n)}] FAIL: fixtures XLSX (${nombresFixture.length}) o desacuerdo con zlib: ${problemasFixtures.slice(0, 6).join(' | ') || 'sin detalle'}`);
  }

  // --- Round-trip propio: lo que escribe el bloque lo relee el bloque, sin depender del fixture ---
  n++;
  let roundTripOk = false;
  let detalleRoundTrip = '';
  try {
    const libro = [{
      nombre: 'GASTO',
      columnas: [
        { nombre: 'id', tipo: 'texto' as const },
        { nombre: 'importe', tipo: 'numero' as const },
        { nombre: 'fechaDevengo', tipo: 'fecha' as const },
      ],
      filas: [
        { id: 'rt1', importe: 1234.56, fechaDevengo: '2024-03-15' },
        { id: 'rt2', importe: -99.9, fechaDevengo: '' },
      ],
    }];
    const a = generarXlsx(libro);
    const b = generarXlsx(libro);
    const r = parseXlsx(a);
    roundTripOk = Buffer.from(a).equals(Buffer.from(b))
      && r.errores.length === 0
      && r.registros.length === 2
      && r.registros[0]['id'] === 'rt1'
      && r.registros[0]['importe'] === 1234.56
      && r.registros[0]['fechaDevengo'] === '2024-03-15'
      && r.registros[1]['importe'] === -99.9
      && r.registros[1]['fechaDevengo'] === '';
    detalleRoundTrip = roundTripOk ? '' : JSON.stringify(r.registros);
  } catch (e) {
    detalleRoundTrip = e instanceof Error ? e.message : String(e);
  }
  if (roundTripOk) {
    passed++;
    console.log(`✅ [${ETIQUETA(n)}] PASS: round-trip propio determinista (generarXlsx → parseXlsx) sin depender de los fixtures`);
  } else {
    failed++;
    console.error(`❌ [${ETIQUETA(n)}] FAIL: round-trip propio del libro generado — ${detalleRoundTrip}`);
  }

  // --- Sin dependencias nuevas ni librerías externas en el camino XLSX ---
  n++;
  let sinDependenciasExternas = true;
  try {
    const pkg = JSON.parse(readFileSync(resolve(RAIZ, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
    };
    const deps = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) });
    const prohibidas = deps.filter((d) => /xlsx|excel|sheet|zip|archiver|csv-parse|papaparse/i.test(d));
    if (prohibidas.length > 0) {
      sinDependenciasExternas = false;
      console.error(`   dependencias sospechosas en package.json: ${prohibidas.join(', ')}`);
    }
    const modulos = readdirSync(resolve(RAIZ, 'src/lib/importExport')).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    for (const m of modulos) {
      const fuente = readFileSync(resolve(RAIZ, 'src/lib/importExport', m), 'utf8');
      const externos = [...fuente.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)]
        .map(([, spec]) => spec)
        .filter((spec) => !spec.startsWith('.'));
      if (externos.length > 0) {
        sinDependenciasExternas = false;
        console.error(`   ${m} importa módulos externos: ${externos.join(', ')}`);
      }
    }
  } catch (e) {
    sinDependenciasExternas = false;
    console.error('   no se pudo verificar dependencias:', e instanceof Error ? e.message : e);
  }
  if (sinDependenciasExternas) {
    passed++;
    console.log(`✅ [${ETIQUETA(n)}] PASS: ZIP/DEFLATE/XLSX son implementación propia — sin dependencias nuevas ni imports externos en \`src/lib/importExport\``);
  } else {
    failed++;
    console.error(`❌ [${ETIQUETA(n)}] FAIL: el bloque no puede depender de librerías externas de Excel/ZIP/CSV`);
  }

  console.log('\n================================================================');
  console.log(` RESULTADO BLOQUE 7: ${passed} PASS · ${failed} FAIL (${passed + failed} comprobaciones)`);
  console.log(` (vitest: ${resultado.numPassedTests ?? passed - 6} tests de ${resultado.numTotalTests ?? n - 6}; fallo: ${resultado.numFailedTests ?? 0})`);
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
  console.error('ERROR fatal en batería BLOQUE 7:', e instanceof Error ? e.message : e);
  process.exit(1);
}
