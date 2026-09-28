import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const read=(p)=>readFileSync(new URL('../../../../'+p,import.meta.url),'utf8');
const base='46bb9f79b43949d833acf00e9557e575769d039a'; // Arena B justo antes de reconciliar C (límite exacto del diff de integración)
// BLOQUE 5 — CUSTODIA/INCOMPATIBILIDAD DOCUMENTADA: la base canónica de B no
// existe en este clon (incidencia de infraestructura, no del bloque) y el BLOQUE 5
// necesita ampliar el modelo (`src/types.ts`, ampliación ADITIVA de `Gasto` y
// `ExportacionFiscalItem`) y añadir su script (`package.json`, una línea).
// No se reconstruye ni se falsifica la base. Cuando el commit existe, la
// comprobación original se ejecuta sin cambios y, para los dos ficheros
// compartidos que el bloque evoluciona, se exige la garantía equivalente y
// verificable: NINGUNA línea base puede borrarse ni reescribirse (solo adiciones).
const REFERENCIA_LOCAL_BLOQUE_5='46bb9f79b43949d833acf00e9557e575769d039a';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
function existeCommit(sha){try{git('cat-file','-e',`${sha}^{commit}`);return true;}catch{return false;}}
function referenciaCustodia(){
  if(existeCommit(base))return{sha:base,historica:true};
  if(existeCommit(REFERENCIA_LOCAL_BLOQUE_5))return{sha:REFERENCIA_LOCAL_BLOQUE_5,historica:false};
  return null;
}
/** Adiciones puras: ninguna línea del fichero de referencia se ha perdido. */
function soloAdiciones(sha,path){
  const [adiciones,borrados]=git('diff','--numstat',sha,'--',path).trim().split(/\s+/);
  return Number(borrados||0)===0&&Number(adiciones||0)>=0;
}
function sinCambios(sha,path){return git('diff','--name-only',sha,'--',path).trim()==='';}
// ADAPTACIÓN B: en C el punto de entrada era InmueblesSection.tsx; en B la entrada
// canónica del detalle del inmueble es el Centro Operativo (subtab 'operaciones').
// Mismo propósito: entrada desde el inmueble, sin app paralela ni navegación global nueva.
test('el punto de entrada es el detalle del inmueble (Centro Operativo de B), sin app paralela',()=>{
  const s2=read('src/components/inmueble/CentroOperativoInmueblePanel.tsx');
  assert.ok(s2.includes("import { OperacionesInmueble } from '../../features/operaciones/ui/OperacionesInmueble';"));
  assert.ok(s2.includes("type SubTab = 'resumen' | 'seguros' | 'averias' | 'expediente' | 'historico' | 'operaciones';"));
  assert.ok(s2.includes("{ id: 'operaciones', label: 'Operaciones',"));
  assert.match(s2,/subTab === 'operaciones' && \(\s*<OperacionesInmueble inmueble=\{inmueble\} onVolver=\{\(\) => setSubTab\('resumen'\)\} \/>\s*\)/);
  for(const g of ['src/App.tsx','src/main.tsx'])assert.doesNotMatch(read(g),/features\/operaciones/);
});
test('no se introducen seeds, carga a Storage, provisioning de usuarios ni llamadas de IA',()=>{
  for(const f of ['persistence/firebase.ts','persistence/repository.ts','ui/OperacionesInmueble.tsx','ui/panel.tsx'])assert.doesNotMatch(read('src/features/operaciones/'+f),/seedInitial|uploadBytes|uploadString|createUser|setCustomUserClaims|signInAnonymously|genai|generateContent/);
  const f=read('src/features/operaciones/persistence/firebase.ts');assert.ok(f.includes("COLECCION_USUARIOS_CANONICOS = 'usuarios'"));assert.doesNotMatch(f,/setDoc|addDoc|deleteDoc/);
});
test('auditoría usa una sola función canónica y una sola colección; no hay fallback de guardado ciego',()=>{
  const adapter=read('src/features/operaciones/persistence/firebase.ts'),repo=read('src/features/operaciones/persistence/repository.ts');
  assert.ok(adapter.includes("COLECCION_AUDITORIA = 'audit_logs'"));assert.match(repo,/registrarAuditoriaFirestore\(auditoriaDe\(evento, identidad\), tx\)/);
  assert.doesNotMatch(adapter+repo,/audit_logs_v2|collection\([^\n]*['"]historial|localStorage|catch\s*\([^)]*\)\s*\{\s*\}/);
});
// ADAPTACIÓN B: los compartidos se comparan contra la base canónica de B (bun.lock no
// existe en B). El único compartido que cambia es vite.config.ts, de forma aditiva
// (exclude de vitest para los tests node:test del módulo); package.json queda intacto
// (convención de B: el comando se documenta en el comentario de vite.config).
test('servicios/modelos heredados, configuración TS y entrypoints intactos frente a la base B',()=>{
  const referencia=referenciaCustodia();
  assert.ok(referencia,'CUSTODIA: no hay referencia verificable (base B ni commit de partida del bloque)');
  // Ficheros que el BLOQUE 5 no toca: byte a byte idénticos a la referencia.
  // `firebase.ts` tiene una excepción estrecha y separada abajo: solo los tres
  // puentes de escritura verificable, sin alterar los helpers históricos.
  const intactos=['src/App.tsx','src/main.tsx','src/lib/googleAuth.ts','server.ts','tsconfig.json'];
  for(const f of intactos){
    if(referencia.historica)assert.equal(read(f),git('show',`${referencia.sha}:${f}`),f);
    else assert.ok(sinCambios(referencia.sha,f),`${f} modificado respecto a la referencia de custodia`);
  }
  const firebaseActual=read('src/lib/firebase.ts');
  const firebaseBase=git('show',`${referencia.sha}:src/lib/firebase.ts`);
  const segmentos=[
    ['export async function saveGastoFirestore', 'export async function deleteGastoFirestore('],
    ['export async function saveTareaMantenimientoFirestore', 'export async function deleteTareaMantenimientoFirestore('],
    ['export async function saveGarantiaReparacionFirestore', 'export async function deleteGarantiaReparacionFirestore('],
  ];
  const extraer=(source,inicio,fin)=>{const a=source.indexOf(inicio),b=source.indexOf(fin,a);assert.ok(a>=0&&b>a,`segmento de custodia: ${inicio}`);return source.slice(a,b);};
  const sustituir=(source,inicio,fin,replacement)=>{const a=source.indexOf(inicio),b=source.indexOf(fin,a);return source.slice(0,a)+replacement+source.slice(b);};
  let firebaseNormalizado=firebaseActual;
  for(const [inicio,fin] of segmentos){
    const actual=extraer(firebaseActual,inicio,fin);
    const previo=extraer(firebaseBase,inicio,fin);
    assert.match(actual,/WithResult[\s\S]*return \{ ok: true \}[\s\S]*return \{ ok: false, error \}/,`${inicio}: resultado verificable`);
    assert.match(actual,/export async function save[\s\S]*await save\w+WithResult\(/,`${inicio}: API histórica conservada`);
    firebaseNormalizado=sustituir(firebaseNormalizado,inicio,fin,previo);
  }
  firebaseNormalizado=firebaseNormalizado
    .replace(/\/\*\* Escritura verificable para flujos que no pueden tratar un fallo como éxito\. \*\/\n/,'')
    .replace(/export type FirestoreWriteResult =\n  \| \{ ok: true \}\n  \| \{ ok: false; error: unknown \};\n\n/,'');
  assert.equal(firebaseNormalizado,firebaseBase,'firebase.ts solo admite los tres puentes checked-result de B5');
  // Ficheros compartidos que el BLOQUE 5 amplía de forma documentada: solo se
  // admiten ADICIONES (el contrato previo del modelo sigue siendo un subconjunto
  // literal del actual). Cualquier borrado o reescritura hace fallar la custodia.
  for(const f of ['src/types.ts','package.json'])
    assert.ok(soloAdiciones(referencia.sha,f),`${f} solo admite adiciones (BLOQUE 5)`);
  const types=read('src/types.ts');
  for(const campo of ['facturaId','reparacionId','proveedorId','suministroId','polizaId','lecturaId'])
    assert.ok(types.includes(campo),`el modelo debe conservar la procedencia operativa: ${campo}`);
  assert.ok(types.includes('origenOperacionId')&&types.includes('documentoId'),'la exportación fiscal conserva el origen de la operación');
  assert.ok(read('package.json').includes('test:bloque-5'),'el script del bloque debe existir');
  assert.ok(read('vite.config.ts').includes("'src/features/operaciones/tests/**'"));
  assert.ok(read('vite.config.ts').includes('node --import tsx --test src/features/operaciones/tests/*.test.mjs'));
});
test('histórico/idempotencia se reconstruyen de versiones de negocio, nunca de audit_logs',()=>{
 const source=read('src/features/operaciones/persistence/firebase.ts');assert.match(source,/reconstruirHistorial/);
 assert.doesNotMatch(source,/getDocs\(query\(collection\(db, COLECCION_AUDITORIA|detalles\.evento/);
 assert.match(source,/versiones: \[\.\.\.\(previa\?\.versiones/);
});
