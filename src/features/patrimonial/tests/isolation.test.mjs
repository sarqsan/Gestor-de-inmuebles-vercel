import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

// Base adaptada tras la integración en la rama D2a+D2b+D3: el punto de
// comparación es el commit custodiado previo a la integración de este módulo
// (877494f), no el main del sandbox aislado original de Arena C. La semántica
// se conserva: la integración NO puede añadir dependencias.
const BASE_INTEGRACION = '877494f236707038e5ab07717df1724029f29513';

test('dependencias y lockfile siguen exactamente como en la base conocida', async () => {
  const { execFileSync } = await import('node:child_process');
  for (const file of ['package.json', 'package-lock.json', 'bun.lock']) {
    let base;
    try {
      base = execFileSync('git', ['show', `${BASE_INTEGRACION}:${file}`], { cwd: repo });
    } catch {
      continue; // el fichero no existe en la base: nada que comparar
    }
    assert.deepEqual(readFileSync(resolve(repo, file)), base, `${file} modificado`);
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
});
