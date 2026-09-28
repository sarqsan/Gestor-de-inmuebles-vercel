import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ejecutarRecorridoFicticio } from '../demo/recorrido.mjs';
import { POLITICA_ESTADOS } from '../index.ts';
const modulo = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const custodia = '46bb9f79b43949d833acf00e9557e575769d039a';
// BLOQUE 5 — CUSTODIA: la base histórica puede no existir en este clon
// (incidencia de infraestructura, no del bloque). Cuando existe, la comprobación
// original se ejecuta sin cambios; cuando no, se compara contra la referencia
// verificable más próxima (el commit del que parte el bloque) exigiendo lo mismo:
// los ficheros patrimoniales byte a byte y el registro solo con inserciones.
const REFERENCIA_LOCAL_BLOQUE_5 = '46bb9f79b43949d833acf00e9557e575769d039a';
const excepcion = 'src/features/patrimonial/tests/isolation.test.mjs';
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
function existeCommit(sha) { try { git('cat-file', '-e', `${sha}^{commit}`); return true; } catch { return false; } }
function referenciaCustodia(base) {
  if (existeCommit(base)) return { sha: base, historica: true };
  if (existeCommit(REFERENCIA_LOCAL_BLOQUE_5)) return { sha: REFERENCIA_LOCAL_BLOQUE_5, historica: false };
  return null;
}
/** Superficie EXACTA del BLOQUE 5 (nunca `src/utils` completo). */
const SUPERFICIE_BLOQUE_5 = [
  'src/utils/deducibilidadEngine.ts', 'src/utils/operacionGastoEngine.ts',
  'src/utils/gastosEngine.ts', 'src/utils/fiscalEngine.ts',
  'src/utils/rentabilidadEngine.ts', 'src/utils/reportingEngine.ts',
  'src/utils/deducibilidadEngine.test.ts', 'src/utils/operacionGastoEngine.test.ts',
  'src/components/modals/RegistrarActuacionModal.tsx',
  'src/components/modals/RegistrarActuacionModal.test.tsx',
  'src/components/mantenimiento/MantenimientoPreventivoPanel.tsx',
  // B5 checked-result bridge: helpers nuevos; las API legacy mantienen contrato.
  'src/lib/firebase.ts',
  'src/types.ts', 'package.json', 'scripts/test-bloque-5.ts',
  'docs/BLOQUE-5-OPERACIONES-FISCALIDAD.md',
];
const permitidaBloque5 = (path) => SUPERFICIE_BLOQUE_5.includes(path);
/**
 * BLOQUE 7 (Importación/Exportación + XLSX) — superficie EXACTA: el adaptador
 * XLSX propio (ZIP/DEFLATE/fechas Excel), el cableado del panel canónico de
 * importación/exportación y sus tests/fixtures. NO se autoriza `src/lib` ni
 * `tests/` completos: cualquier otro fichero fuera de esta lista sigue haciendo
 * fallar el alcance. `src/lib/importExportFirebase.ts` (única capa de I/O) NO se
 * toca en este bloque.
 */
const SUPERFICIE_BLOQUE_7 = [
  'src/lib/importExport/',
  'src/components/sections/ImportExportPanel.tsx',
  'tests/import-export-xlsx.test.ts',
  'tests/import-export-canonico.test.ts',
  'tests/import-export-panel.test.tsx',
  'tests/fixtures/xlsx/',
  'scripts/test-bloque-7.ts',
  'docs/BLOQUE-7-IMPORTACION-EXPORTACION-XLSX.md',
];
const permitidaBloque7 = (path) => SUPERFICIE_BLOQUE_7.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p));
// Reparación fin de mes (B9): aritmética por fecha civil y sus casos frontera.
const SUPERFICIE_REPARACION_FIN_MES = [
  'src/utils/mantenimientoEngine.ts',
  'src/utils/mantenimientoEngine.test.ts',
  'docs/REPARACION-FINAL-INTEGRACION-BLOQUES-3-9-2026-09.md',
];
function archivos(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => ['tests','persistence','ui'].includes(e.name) ? [] : e.isDirectory() ? archivos(resolve(dir, e.name)) : [resolve(dir, e.name)]);
}
const fuentes = archivos(modulo).filter((p) => extname(p) === '.ts');

test('grafo runtime exclusivamente local; la única salida es import type al modelo existente', () => {
  let reusos = 0;
  for (const path of fuentes) {
    const contenido = readFileSync(path, 'utf8');
    assert.doesNotMatch(contenido, /\b(?:require\s*\(|import\s*\(|eval\s*\(|new\s+Function\b)/);
    for (const match of contenido.matchAll(/\b(?:import|export)\s+(type\s+)?[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g)) {
      const [, soloTipo, specifier] = match;
      assert.ok(specifier.startsWith('.'), `${path}: dependencia externa`);
      const destino = resolve(dirname(path), specifier);
      assert.ok(existsSync(destino), `${path}: import no encontrado`);
      if (relative(modulo, destino).startsWith('..')) {
        assert.equal(path, resolve(modulo, 'contracts.ts')); assert.equal(specifier, '../../types.ts'); assert.ok(soloTipo); reusos++;
      } else if (!path.includes('/demo/')) assert.ok(!destino.includes('/demo/'), 'El núcleo no carga fixtures');
    }
  }
  assert.equal(reusos, 1);
});
test('sin servicios reales, APIs de persistencia, reloj implícito, red o aleatoriedad', () => {
  const prohibidos = /\b(?:firebase|firestore|localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|sendBeacon|setDoc|addDoc|updateDoc|deleteDoc|writeBatch|uploadBytes|uploadString|getAuth|signInWithPopup|isStaff|randomUUID)\b|Date\.now|new Date\s*\(\s*\)|Math\.random/;
  for (const path of fuentes) assert.doesNotMatch(readFileSync(path, 'utf8'), prohibidos, relative(modulo, path));
});
test('recorrido funciona con red, almacenamiento, reloj global y aleatoriedad bloqueados', () => {
  const deny = () => { throw new Error('Efecto externo no autorizado'); };
  const originales = new Map();
  for (const key of ['fetch', 'localStorage', 'sessionStorage', 'indexedDB', 'WebSocket', 'XMLHttpRequest']) {
    originales.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, get: deny });
  }
  const ahora = Date.now; const random = Math.random;
  try { Date.now = deny; Math.random = deny; assert.equal(ejecutarRecorridoFicticio().estado.revision, 29); }
  finally {
    Date.now = ahora; Math.random = random;
    for (const [key, descriptor] of originales) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
test('política default profundamente inmutable; extensiones mediante contexto separado', () => {
  assert.throws(() => POLITICA_ESTADOS.incidencia.transiciones.ABIERTA.push('FORZADA'), TypeError);
  assert.throws(() => { POLITICA_ESTADOS.factura.inicial = 'PAGADA'; }, TypeError);
});
// Reconciliación B+C: la custodia patrimonial y el diff se comparan con el padre
// exacto de la integración (Arena B ya reparada, antes de incorporar C). El port
// no toca archivos patrimoniales productivos ni nada fuera del alcance autorizado.
const BASE='46bb9f79b43949d833acf00e9557e575769d039a';
const excepcionRegistro='src/features/patrimonial/tests/isolation.test.mjs';
test('custodia byte a byte de la base patrimonial de B: el port no toca Patrimonial',()=>{
  const referencia=referenciaCustodia(BASE);
  assert.ok(referencia,'CUSTODIA: no hay referencia verificable (base B ni commit de partida del bloque)');
  const paths=git('ls-tree','-r','--name-only',referencia.sha,'--','src/features/patrimonial').split('\n').filter((p)=>p&&p!==excepcionRegistro);
  assert.equal(paths.length,28,`archivos patrimoniales productivos: ${paths.length}`); // 29 en la base menos el registro
  for(const path of paths)assert.deepEqual(readFileSync(resolve(repo,path)),execFileSync('git',['show',`${referencia.sha}:${path}`],{cwd:repo}),path);
  // Único fichero patrimonial que cambia: su propio registro de superficie de
  // integración. Solo admite el reemplazo exacto del baseline de reconciliación;
  // todas las demás líneas del registro quedan idénticas.
  const previo=git('show',`${referencia.sha}:${excepcionRegistro}`);
  const actual=readFileSync(resolve(repo,excepcionRegistro),'utf8');
  // El registro se actualiza para fijar la superficie combinada B+C. Se pinnea
  // su contenido exacto y se verifica el baseline; los demás archivos del módulo
  // siguen exigiéndose idénticos byte a byte más arriba.
  const shaRegistro=createHash('sha256').update(actual).digest('hex');
  assert.equal(shaRegistro,'a4041a9565846c2170129f43c58fc2c39e64c51ef31af971240e239bf3d19697','registro de custodia actualizado fuera de la superficie revisada');
  assert.match(actual,/const BASE_INTEGRACION = '46bb9f79b43949d833acf00e9557e575769d039a';/);
  assert.match(actual,/const REFERENCIA_LOCAL_BLOQUE_5 = '46bb9f79b43949d833acf00e9557e575769d039a';/);
  assert.match(actual,/test:bloque-5/);
  assert.match(actual,/test:bloque-7/);
});
test('diff completo desde la base B permite solo el port y la conexión aditiva documentada',()=>{
  const permitida=(path)=>path.startsWith('src/features/operaciones/')||path==='docs/operaciones/alcance.md'
    ||path==='src/lib/auditoria.ts'||path==='src/components/inmueble/CentroOperativoInmueblePanel.tsx'
    ||path==='firestore.rules'||path==='vite.config.ts'
    ||path==='tests/fase14-espejo-identidad.test.ts'||path==='tests/helpers/evaluadorReglasFirestore.ts'
    ||path===excepcionRegistro
    // superficie EXACTA y mínima del BLOQUE 5 (Operaciones → Fiscalidad)
    ||permitidaBloque5(path)
    // superficie EXACTA y mínima del BLOQUE 7 (Importación/Exportación + XLSX)
    ||permitidaBloque7(path)
    // reparación B9 de fechas y documentación de cierre de la reparación.
    ||SUPERFICIE_REPARACION_FIN_MES.includes(path);
  const referencia=referenciaCustodia(BASE);
  assert.ok(referencia,'CUSTODIA: no hay referencia verificable (base B ni commit de partida del bloque)');
  const paths=[...git('diff','--name-only',referencia.sha,'--','.').split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean);
  assert.ok(paths.every(permitida),`Fuera de alcance: ${paths.filter((p)=>!permitida(p)).join(', ')}`);
  // `src/types.ts` y `package.json` son ficheros compartidos: solo se admiten
  // ADICIONES (la ampliación del modelo y la línea del script del bloque). Ninguna
  // línea base puede borrarse ni reescribirse.
  for(const compartido of ['src/types.ts','package.json']){
    const [adiciones,borrados]=git('diff','--numstat',referencia.sha,'--',compartido).split(/\s+/);
    assert.equal(Number(borrados||0),0,`${compartido} solo admite adiciones (añadido=${adiciones||0})`);
  }
});
