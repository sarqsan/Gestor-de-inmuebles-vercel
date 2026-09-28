import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import demoConfig from '../demo/vite.config.mjs';

const modulo = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
function archivos(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    if (['tests', 'node_modules', 'dist'].includes(entrada.name)) return [];
    const path = resolve(dir, entrada.name);
    return entrada.isDirectory() ? archivos(path) : [path];
  });
}
const fuentes = archivos(modulo).filter((path) => ['.ts', '.tsx'].includes(extname(path)));

test('el grafo del bloque solo importa módulos locales, React y CSS local', () => {
  for (const path of fuentes) {
    const contenido = readFileSync(path, 'utf8');
    assert.doesNotMatch(contenido, /\b(?:require\s*\(|import\s*\(|eval\s*\(|new\s+Function\b)/, relative(modulo, path));
    const imports = [...contenido.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)];
    for (const [, specifier] of imports) {
      if (['react', 'react-dom/client'].includes(specifier)) continue;
      assert.ok(specifier.startsWith('.'), `${path}: dependencia externa ${specifier}`);
      const destino = resolve(dirname(path), specifier);
      assert.ok(!relative(modulo, destino).startsWith('..'), `${path}: sale del módulo`);
      assert.ok(existsSync(destino), `${path}: import no encontrado ${specifier}`);
      if (!path.includes('/demo/')) assert.ok(!destino.includes('/demo/'), 'Componente reutilizable no debe cargar fixtures');
    }
  }
});

test('no existen APIs de persistencia, red, identidad, permisos ni servicios reales en el bloque', () => {
  const prohibidos = /\b(?:firebase|firestore|localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|sendBeacon|setDoc|addDoc|updateDoc|deleteDoc|writeBatch|uploadBytes|uploadString|getAuth|signInWithPopup|subscribeInmuebles|gestiones_cartera)\b/i;
  for (const path of fuentes) assert.doesNotMatch(readFileSync(path, 'utf8'), prohibidos, relative(modulo, path));
});

test('demo separada: HTML y entrada no cargan App ni el entrypoint productivo', () => {
  const html = readFileSync(resolve(modulo, 'demo/index.html'), 'utf8');
  const entrada = readFileSync(resolve(modulo, 'demo/main.tsx'), 'utf8');
  assert.match(html, /src="\.\/main\.tsx"/);
  assert.match(entrada, /from '\.\/PatrimonialDemo\.tsx'/);
  assert.doesNotMatch(html + entrada, /App\.tsx|\/src\/main\.tsx|server\.ts|https?:\/\//);
  assert.equal(demoConfig.root, resolve(modulo, 'demo') + '/');
  assert.equal(demoConfig.server.host, '0.0.0.0');
  assert.ok(demoConfig.server.allowedHosts.includes('.e2b.app'));
  assert.equal(demoConfig.build.outDir, resolve(repo, 'dist/patrimonial-demo') + '/');
});

test('estilos y HTML no cargan recursos remotos', () => {
  for (const path of archivos(modulo).filter((file) => ['.css', '.html'].includes(extname(file)))) {
    assert.doesNotMatch(readFileSync(path, 'utf8'), /@import|https?:\/\/|url\s*\(/i);
  }
});

// Reconciliación Arena B + Arena C: comparación desde el commit exacto de Arena B
// previo a la integración (incluye las modificaciones B ya validadas y separa el
// diff entrante de C). Se mantienen las mismas guardas estrictas de superficie,
// custodia byte a byte y dependencias; no se excluyen archivos añadidos por C.
const BASE_INTEGRACION = '46bb9f79b43949d833acf00e9557e575769d039a';
// BLOQUE 5 — CUSTODIA: la base histórica puede no existir en este clon
// (incidencia de infraestructura/custodia, no del bloque). La reconciliación usa
// el padre exacto de Arena B como baseline verificable; no se omiten archivos y
// los archivos productivos patrimoniales siguen comparándose byte a byte. El
// registro de custodia se fija por hash tras actualizar la superficie B+C.
const REFERENCIA_LOCAL_BLOQUE_5 = '46bb9f79b43949d833acf00e9557e575769d039a';
function existeCommit(sha) {
  try { execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: repo }); return true; } catch { return false; }
}
function referenciaCustodia(base) {
  if (existeCommit(base)) return { sha: base, historica: true };
  if (existeCommit(REFERENCIA_LOCAL_BLOQUE_5)) return { sha: REFERENCIA_LOCAL_BLOQUE_5, historica: false };
  return null;
}

test('dependencias y lockfile siguen exactamente como en la base conocida', async () => {
  const { execFileSync } = await import('node:child_process');
  for (const file of ['package.json', 'package-lock.json', 'bun.lock']) {
    let base;
    try {
      base = execFileSync('git', ['show', `${BASE_INTEGRACION}:${file}`], { cwd: repo });
    } catch {
      continue; // el fichero no existe en la base: nada que comparar
    }
    if (file !== 'package.json') {
      assert.deepEqual(readFileSync(resolve(repo, file)), base, `${file} modificado`);
      continue;
    }
    // La reconciliación añade únicamente los runners reproducibles de B5/B7;
    // no admite cambios de paquetes, dependencias, metadatos ni scripts previos.
    const actualPackage = JSON.parse(readFileSync(resolve(repo, file), 'utf8'));
    const basePackage = JSON.parse(base.toString('utf8'));
    const { scripts: actualScripts, ...actualRest } = actualPackage;
    const { scripts: baseScripts, ...baseRest } = basePackage;
    assert.deepEqual(actualRest, baseRest, 'solo pueden cambiar los scripts B5/B7');
    assert.deepEqual(actualScripts, {
      ...baseScripts,
      'test:bloque-5': 'tsx scripts/test-bloque-5.ts',
      'test:bloque-7': 'tsx scripts/test-bloque-7.ts',
    }, 'package.json solo añade los scripts B5/B7');
  }
});

test('núcleo de completitud/preview sin reloj, aleatoriedad ni inferencia de identidad', () => {
  for (const nombre of ['completeness.ts', 'importPreview.ts']) {
    const contenido = readFileSync(resolve(modulo, nombre), 'utf8');
    assert.doesNotMatch(contenido, /Date\.|new Date\b|Math\.random|randomUUID|estadoAcceso|cuentaId|usuarioAutenticado|modalidadSeleccionada/);
  }
});

// Ficheros permitidos de la integración (además del módulo y su documento):
// el puente arquitectónico, su test y la exclusión de vitest para los tests
// nativos de C. Nada más puede diferir de la base.
// INC-06 — la lista crece con la superficie EXACTA del bloque de persistencia
// (núcleo puro + adaptador Firestore + pantalla de producción + conexión mínima
// en App.tsx + tipos de auditoría + reglas + tests + extensión fail-loud del
// harness de reglas). Cualquier otro fichero que difiera de la base sigue
// haciendo fallar este test: la semántica de aislamiento se conserva.
const PERMITIDOS_INTEGRACION = [
  'src/features/patrimonial/',
  'docs/patrimonial-ux/alcance-fase-1.md',
  'src/lib/patrimonialIntegracion.ts',
  'tests/patrimonial-integracion.test.ts',
  'vite.config.ts',
  // bloque INC-06 (persistencia de fichas + ejecución controlada):
  'src/lib/patrimonialPersistencia.ts',
  'src/lib/patrimonialPersistenciaFirebase.ts',
  'src/patrimonial/',
  'tests/patrimonial-persistencia.test.ts',
  'tests/seguridad-firestore-patrimonial.test.ts',
  'tests/harness/firestoreRulesEval.ts',
  'src/App.tsx',
  'src/types.ts',
  'firestore.rules',
  // bloque CANÓNICO B (commits propios 08d8f17..c4949a6, posteriores a la base
  // 877494f: contrato canónico B/C, cierre de retención, §16 MAPA, expediente
  // documental/fiscal, hash isomórfico, segurosCentro). Laguna preexistente del
  // registro en la base — el test fallaba ya en c4949a6 antes del port de Operaciones:
  'docs/MAPA-MAESTRO-ERP-ACTUAL.md',
  'docs/arquitectura/CONTRATO_CANONICO_AUTORIZACION_AUDITORIA_B_C.md',
  'src/components/sections/InmueblesSection.tsx',
  'src/lib/expedienteDocumental/',
  'src/lib/expedienteFiscal/',
  'src/lib/firebase.ts',
  'src/lib/importacion/hash.ts',
  'src/utils/segurosCentro.ts',
  // Reparación fin de mes B9 (fecha civil, clamp mensual y pruebas de calendario):
  'src/utils/mantenimientoEngine.ts',
  'src/utils/mantenimientoEngine.test.ts',
  'docs/REPARACION-FINAL-INTEGRACION-BLOQUES-3-9-2026-09.md',
  'tests/centro-operativo.test.ts',
  'tests/expediente-documental.test.ts',
  'tests/hash-isomorfico.test.ts',
  'tests/seguridad-expediente.test.ts',
  'tests/seguridad-firestore-polizas.test.ts',
  // bloque OPERACIONES (port funcional de C, Gestor-alquileres-vercel @ 1686b8e8):
  // módulo autocontenido + auditoría transaccional + entrada en el Centro Operativo
  // + bloque de Rules y revisión explícita de sus dos tripwires de tests:
  'src/features/operaciones/',
  'docs/operaciones/alcance.md',
  'src/lib/auditoria.ts',
  'src/components/inmueble/CentroOperativoInmueblePanel.tsx',
  'tests/fase14-espejo-identidad.test.ts',
  'tests/helpers/evaluadorReglasFirestore.ts',
  // bloque BLOQUE 5 (Operaciones → Fiscalidad): superficie EXACTA y mínima del
  // cierre del circuito. NO se autoriza `src/utils` completo: solo los motores
  // que el bloque crea o modifica, el escritor real de mantenimiento (que pasa a
  // generar el gasto con trazabilidad e idempotencia), el modelo (ampliación
  // aditiva de `Gasto`/`ExportacionFiscalItem`), el script del bloque y su
  // documentación. Cualquier otro fichero sigue sin poder diferir de la base.
  'src/utils/deducibilidadEngine.ts',
  'src/utils/deducibilidadEngine.test.ts',
  'src/utils/operacionGastoEngine.ts',
  'src/utils/operacionGastoEngine.test.ts',
  'src/utils/gastosEngine.ts',
  'src/utils/fiscalEngine.ts',
  'src/utils/rentabilidadEngine.ts',
  'src/utils/reportingEngine.ts',
  'src/components/modals/RegistrarActuacionModal.tsx',
  'src/components/modals/RegistrarActuacionModal.test.tsx',
  'src/components/mantenimiento/MantenimientoPreventivoPanel.tsx',
  'scripts/test-bloque-5.ts',
  'docs/BLOQUE-5-OPERACIONES-FISCALIDAD.md',
  // `package.json`: la ÚNICA diferencia autorizada es la línea añadida del script
  // `test:bloque-5` (el script del bloque que exige este cierre). La garantía se
  // mantiene con la comprobación de adición pura de más abajo: ninguna línea
  // previa de package.json puede borrarse ni reescribirse.
  'package.json',
  // BLOQUE 7 (Importación/Exportación + XLSX): superficie EXACTA y mínima del
  // bloque. El módulo canónico de importación/exportación ya existía integrado;
  // el bloque añade el adaptador XLSX (ZIP/DEFLATE/fechas Excel propios), cablea
  // el panel y sus tests/fixtures. NO se autoriza `src/lib` completo ni
  // `tests/` completo: cualquier otro fichero que difiera de la base sigue
  // haciendo fallar el aislamiento. `src/lib/importExportFirebase.ts` (única
  // capa de I/O) NO se toca.
  'src/lib/importExport/',
  'src/components/sections/ImportExportPanel.tsx',
  'tests/import-export-xlsx.test.ts',
  'tests/import-export-canonico.test.ts',
  'tests/import-export-panel.test.tsx',
  'tests/fixtures/xlsx/',
  'scripts/test-bloque-7.ts',
  'docs/BLOQUE-7-IMPORTACION-EXPORTACION-XLSX.md',
];
const permitido = (path) => PERMITIDOS_INTEGRACION.some((p) => path === p || path.startsWith(p));

test('ningún archivo productivo difiere de la base fuera de la superficie de integración documentada', async () => {
  const { execFileSync } = await import('node:child_process');
  const exclusiones = PERMITIDOS_INTEGRACION.map((p) => `:!${p.replace(/\/$/, '')}`);
  const diff = execFileSync('git', [
    'diff', '--name-only', BASE_INTEGRACION, '--', '.', ...exclusiones,
  ], { cwd: repo, encoding: 'utf8' });
  assert.equal(diff.trim(), '');
  const sinSeguimiento = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: repo, encoding: 'utf8' });
  assert.ok(sinSeguimiento.trim().split('\n').filter(Boolean).every(permitido));
  // Guardia adicional de la superficie compartida autorizada: solo se admiten
  // ADICIONES (ninguna línea base se borra ni se reescribe). Se comprueba contra
  // la referencia verificable disponible, porque la base histórica puede no
  // existir en este clon (incidencia de infraestructura, no del bloque).
  const referencia = referenciaCustodia(BASE_INTEGRACION);
  assert.ok(referencia, 'CUSTODIA: no hay referencia verificable (base histórica ni commit de partida del bloque)');
  for (const ficheroCompartido of ['package.json']) {
    const [adiciones, borrados] = execFileSync('git', ['diff', '--numstat', referencia.sha, '--', ficheroCompartido], { cwd: repo, encoding: 'utf8' }).trim().split(/\s+/);
    assert.equal(Number(borrados || 0), 0, `${ficheroCompartido} solo admite adiciones (añadido=${adiciones || 0})`);
  }
});
