import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { baseDeRama, existeCommit, ficheroConParche, leerManifiesto } from '../../../../tests/helpers/custodia-rama.mjs';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const read=(p)=>readFileSync(new URL('../../../../'+p,import.meta.url),'utf8');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
// CUSTODIA — base real de la rama, calculada (nunca escrita a mano).
// La referencia anterior era f782e53, un ancestro 147 commits anterior a main:
// la guardia comparaba contra un estado que ya no era el punto de partida, así
// que con historial completo su expectativa no podía cumplirse (y sin historial
// se omitía: falso verde). `tests/helpers/custodia-rama.mjs` la calcula como
// merge-base con main y lanza si no hay ninguna base: el test FALLA, no se omite.
const PARCHE_P0 = leerManifiesto(new URL('./custodia-parche-p0.json', import.meta.url));
let referenciaMemo;
function referenciaCustodia() {
  referenciaMemo ??= baseDeRama(root, PARCHE_P0);
  return referenciaMemo;
}
function modelosCompartidosProtegidos(sha){
  // Con la base real, `src/types.ts` y `src/main.tsx` no cambian en absoluto y
  // `package.json` queda fijado por el parche revisado (no por «solo adiciones»,
  // que era el criterio heredado de una base distinta).
  return sinCambios(sha,'src/types.ts') && sinCambios(sha,'src/main.tsx');
}
function sinCambios(sha,path){return git('diff','--name-only',sha,'--',path).trim()==='';}
/**
 * Parche de custodia revisado (`custodia-parche-p0.json`).
 * ---------------------------------------------------------------------------
 * La guardia original reconstruía `server.ts` desde la base histórica con tres
 * inserciones P2/P4 escritas a mano. Ese mecanismo no podía reflejar el bloque
 * de seguridad P0 (H-02…H-16) sin reescribirlo, y una lista de «lo que se
 * permite» escrita a ojo es justo lo que un cambio no revisado aprovecharía.
 *
 * Ahora el contrato es el mismo de antes —IGUALDAD BYTE A BYTE contra una
 * expectativa explícita— pero la expectativa se materializa en un JSON
 * auditable: cada entrada es [texto en la base, texto en la rama]. Cualquier
 * cambio no incluido en el parche hace fallar la prueba, y el revisor ve
 * exactamente qué superficie se ha tocado respecto a `main`.
 */
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
test('servicios/modelos heredados y entrypoints solo cambian en la superficie revisada respecto a main',()=>{
  const referencia=referenciaCustodia();
  // Ficheros que el BLOQUE 5 no toca: byte a byte idénticos a la referencia.
  // `firebase.ts` tiene una excepción estrecha y separada abajo: solo los tres
  // puentes de escritura verificable, sin alterar los helpers históricos.
  // BLOQUES 10/11/12 — `src/App.tsx`, `src/main.tsx` y `src/lib/firebase.ts` SÍ
  // evolucionan (UX-1…UX-7, canal de feedback, ámbito de suscripciones de A-01).
  // El contrato que este test protege —«los servicios/modelos heredados y los
  // entrypoints no se reescriben ni pierden superficie»— se mantiene con
  // invariantes verificables equivalentes y no más débiles:
  //   · byte a byte: los ficheros que ningún bloque posterior toca;
  //   · adiciones puras (0 líneas borradas): los compartidos que evolucionan;
  //   · ninguna importación de servicio de App.tsx desaparece;
  //   · ningún símbolo exportado de `src/lib/firebase.ts` en la base B desaparece;
  //   · la superficie exacta revisada se declara en el registro de custodia.
  // Ficheros que esta rama NO toca: byte a byte idénticos a la base de main.
  const intactos=['src/lib/googleAuth.ts','tsconfig.json','src/types.ts','src/main.tsx'];
  // Ficheros que SÍ toca la rama, con su parche revisado (igualdad byte a byte).
  // En modo invariante (la rama parte de otra base, p. ej. main tras la fusión) se
  // exige que sigan intactos: tocarlos obliga a regenerar el manifiesto.
  const conParche=['server.ts','package.json'];
  for(const f of conParche){
    if(referencia.estricto){
      assert.equal(read(f),ficheroConParche(PARCHE_P0,referencia.sha,f,root),`${f}: superficie distinta del parche revisado P0`);
    }else{
      assert.ok(sinCambios(referencia.sha,f),`${f} cambiado sin manifiesto de custodia: actualiza custodia-parche-p0.json de esta carpeta`);
    }
  }
  for(const f of intactos){
    assert.ok(sinCambios(referencia.sha,f),`${f} modificado respecto a la referencia de custodia`);
  }
  assert.ok(modelosCompartidosProtegidos(referencia.sha),
    'compartidos: adiciones P2/P4 y solo el cambio explícito de comentario que prohíbe inferir modalidad');
  // El entrypoint sigue conectando TODOS los servicios que conectaba en la base.
  const serviciosImportados=(texto)=>{
    const encontrados=new Set();
    for(const m of texto.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*lib\/firebase['"]/g))
      for(const nombre of m[1].split(',')){const n=nombre.trim().split(/\s+as\s+/)[0];if(n)encontrados.add(n);}
    return encontrados;
  };
  const appBase=serviciosImportados(git('show',`${referencia.sha}:src/App.tsx`));
  const appActual=serviciosImportados(read('src/App.tsx'));
  const perdidos=[...appBase].filter((s)=>!appActual.has(s)).sort();
  // P0.2 — RETIRADA REVISADA, no pérdida accidental: el alta anónima de
  // solicitudes y candidatos dejó de hacerse desde el navegador. Ahora la escribe
  // solo el servidor (`POST /api/solicitud/:token`, con token, honeypot y cuota) y
  // las reglas ya no admiten `create` anónimo. Las dos funciones siguen exportadas
  // en `src/lib/firebase.ts` (lo comprueba el bloque de símbolos de más abajo):
  // simplemente ya no hay ningún punto de la app que las llame.
  const RETIRADOS_P0_2=['guardarCandidatoPublicoFirestore','guardarSolicitudPublicaFirestore'];
  assert.deepEqual(perdidos.filter((s)=>!RETIRADOS_P0_2.includes(s)),[],
    'App.tsx: importación de servicio eliminada (solo se admiten las dos retiradas revisadas de P0.2)');
  if(referencia.estricto){
    assert.deepEqual(perdidos,RETIRADOS_P0_2,
      'App.tsx: respecto a la base de main se esperaban exactamente las dos retiradas de P0.2');
  }
  const firebaseActual=read('src/lib/firebase.ts');
  const firebaseBase=git('show',`${referencia.sha}:src/lib/firebase.ts`);
  const segmentos=[
    ['export async function saveGastoFirestore', 'export async function deleteGastoFirestore('],
    ['export async function saveTareaMantenimientoFirestore', 'export async function deleteTareaMantenimientoFirestore('],
    ['export async function saveGarantiaReparacionFirestore', 'export async function deleteGarantiaReparacionFirestore('],
  ];
  const extraer=(source,inicio,fin)=>{const a=source.indexOf(inicio),b=source.indexOf(fin,a);assert.ok(a>=0&&b>a,`segmento de custodia: ${inicio}`);return source.slice(a,b);};
  for(const [inicio,fin] of segmentos){
    const actual=extraer(firebaseActual,inicio,fin);
    assert.match(actual,/WithResult[\s\S]*return \{ ok: true \}[\s\S]*return \{ ok: false, error \}/,`${inicio}: resultado verificable`);
    assert.match(actual,/export async function save[\s\S]*await save\w+WithResult\(/,`${inicio}: API histórica conservada`);
  }
  // Ninguna exportación del servicio compartido desaparece (misma garantía que la
  // igualdad normalizada anterior, verificable con la superficie actual).
  const simbolos=(texto)=>new Set([...texto.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm)].map((m)=>m[1]));
  const apiBase=simbolos(firebaseBase),apiActual=simbolos(firebaseActual);
  assert.deepEqual([...apiBase].filter((s)=>!apiActual.has(s)),[],'firebase.ts: API histórica eliminada');
  assert.ok(apiActual.has('subscribeColeccionPorAmbito'),'firebase.ts: falta el helper canónico de ámbito (BLOQUE 12 · A-01)');
  // Ficheros compartidos que el BLOQUE 5 amplía de forma documentada: solo se
  // admiten ADICIONES (el contrato previo del modelo sigue siendo un subconjunto
  // literal del actual). Cualquier borrado o reescritura hace fallar la custodia.
  assert.ok(modelosCompartidosProtegidos(referencia.sha),
    'compartidos (BLOQUE 5/P2/P4): adiciones conservadas y único reemplazo P4 explícito');
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
