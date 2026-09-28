import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ejecutarRecorridoFicticio } from '../demo/recorrido.mjs';
import { POLITICA_ESTADOS } from '../index.ts';
const modulo = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const custodia = '7657eea2d08f1e66c480091c5b81ecfc16aac5a8';
// BLOQUE 5 — CUSTODIA: la base histórica puede no existir en este clon
// (incidencia de infraestructura, no del bloque). Cuando existe, la comprobación
// original se ejecuta sin cambios; cuando no, se compara contra la referencia
// verificable más próxima (el commit del que parte el bloque) exigiendo lo mismo:
// los ficheros patrimoniales byte a byte y el registro solo con inserciones.
const REFERENCIA_LOCAL_BLOQUE_5 = '967ea936c70c4402a3f325667c566f04fb88b415';
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
  'src/types.ts', 'package.json', 'scripts/test-bloque-5.ts',
  'docs/BLOQUE-5-OPERACIONES-FISCALIDAD.md',
];
const permitidaBloque5 = (path) => SUPERFICIE_BLOQUE_5.includes(path);
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
// ADAPTACIÓN B: la custodia patrimonial y el diff de alcance se verifican contra la base
// canónica de B (c4949a6, rama arena pre-port). La base git de C no existe aquí; el
// propósito (el port no toca Patrimonial ni nada fuera del alcance autorizado) es idéntico.
const BASE='c4949a62fb13bde3aeff74a213f2a2cd40e5305c';
const excepcionRegistro='src/features/patrimonial/tests/isolation.test.mjs';
test('custodia byte a byte de la base patrimonial de B: el port no toca Patrimonial',()=>{
  const referencia=referenciaCustodia(BASE);
  assert.ok(referencia,'CUSTODIA: no hay referencia verificable (base B ni commit de partida del bloque)');
  const paths=git('ls-tree','-r','--name-only',referencia.sha,'--','src/features/patrimonial').split('\n').filter((p)=>p&&p!==excepcionRegistro);
  assert.equal(paths.length,28,`archivos patrimoniales productivos: ${paths.length}`); // 29 en la base menos el registro
  for(const path of paths)assert.deepEqual(readFileSync(resolve(repo,path)),execFileSync('git',['show',`${referencia.sha}:${path}`],{cwd:repo}),path);
  // Único fichero patrimonial que cambia: su propio registro de superficie de
  // integración. Solo puede AÑADIR líneas (las dos superficies autorizadas);
  // toda línea previa se conserva, en orden, sin modificación ni borrado.
  const previo=git('show',`${referencia.sha}:${excepcionRegistro}`).split('\n');
  const actual=readFileSync(resolve(repo,excepcionRegistro),'utf8').split('\n');
  let pi=0;
  for(const linea of actual){ if(pi<previo.length&&linea===previo[pi])pi++; }
  assert.equal(pi,previo.length,'el registro patrimonial solo admite inserciones');
});
test('diff completo desde la base B permite solo el port y la conexión aditiva documentada',()=>{
  const permitida=(path)=>path.startsWith('src/features/operaciones/')||path==='docs/operaciones/alcance.md'
    ||path==='src/lib/auditoria.ts'||path==='src/components/inmueble/CentroOperativoInmueblePanel.tsx'
    ||path==='firestore.rules'||path==='vite.config.ts'
    ||path==='tests/fase14-espejo-identidad.test.ts'||path==='tests/helpers/evaluadorReglasFirestore.ts'
    ||path===excepcionRegistro
    // superficie EXACTA y mínima del BLOQUE 5 (Operaciones → Fiscalidad)
    ||permitidaBloque5(path);
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
