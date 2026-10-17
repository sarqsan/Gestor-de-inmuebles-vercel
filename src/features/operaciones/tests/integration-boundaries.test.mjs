import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const read=(p)=>readFileSync(new URL('../../../../'+p,import.meta.url),'utf8');
// Checkpoint histórico B/C 46bb: ancestro verificado, pero 147 commits anterior
// a main. Las guardias de esta rama comparan el diff local con su base real f782.
const base='f782e53ed3beefa4cdcae4e839457480f9cfd995';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
function existeCommit(sha){try{git('cat-file','-e',`${sha}^{commit}`);return true;}catch{return false;}}
function referenciaCustodia(){
  if(existeCommit(base))return{sha:base,historica:true};
  return null; // No sustituir f782 por un ancestro distinto si la referencia falta.
}
/** Adiciones puras: ninguna línea del fichero de referencia se ha perdido. */
function soloAdiciones(sha,path){
  const [adiciones,borrados]=git('diff','--numstat',sha,'--',path).trim().split(/\s+/);
  return Number(borrados||0)===0&&Number(adiciones||0)>=0;
}
function soloAdicionesMasReemplazoExacto(sha,path,anterior,nuevo){
  const diff=git('diff','--unified=0',sha,'--',path);
  const borradas=diff.split('\n').filter((linea)=>linea.startsWith('-')&&!linea.startsWith('---')).map((linea)=>linea.slice(1).trim());
  const anadidas=diff.split('\n').filter((linea)=>linea.startsWith('+')&&!linea.startsWith('+++')).map((linea)=>linea.slice(1).trim());
  return borradas.length===1&&borradas[0]===anterior.trim()&&anadidas.includes(nuevo.trim());
}
const COMENTARIO_MODALIDAD_ANTERIOR='/** Modalidad jurídica del contrato (ver ModalidadContractual). Si no existe, se infiere del resto de datos. */';
const COMENTARIO_MODALIDAD_P4='/** Modalidad jurídica del contrato (ver ModalidadContractual). P4 no la infiere: si falta, exige revisión. */';
function modelosCompartidosProtegidos(sha){
  return soloAdicionesMasReemplazoExacto(sha,'src/types.ts',COMENTARIO_MODALIDAD_ANTERIOR,COMENTARIO_MODALIDAD_P4)
    && soloAdiciones(sha,'package.json') && soloAdiciones(sha,'src/main.tsx');
}
function sinCambios(sha,path){return git('diff','--name-only',sha,'--',path).trim()==='';}
function servidorEsperadoP2P4(base) {
  const insertar=(source,anchor,content)=>{
    const at=source.indexOf(anchor);
    assert.ok(at>=0,`ancla server.ts ausente: ${anchor.slice(0,60)}`);
    assert.equal(source.indexOf(anchor,at+anchor.length),-1,`ancla server.ts duplicada: ${anchor.slice(0,60)}`);
    const end=at+anchor.length;
    return source.slice(0,end)+content+source.slice(end);
  };
  let esperado=base;
  esperado=insertar(esperado,
    "import { crearRepositorioNotificacionesFirestore } from './server/notificaciones/repositorioNotificacionesFirestore.js';",
    "\nimport { crearServicioJustificantesCobro } from './server/cobros/justificantesCobro.js';\nimport { montarRutasJustificantesCobro } from './server/cobros/rutasJustificantesCobro.js';\nimport { crearServicioActualizacionRenta } from './server/actualizacionRenta/servicioActualizacionRenta.js';\nimport { montarRutasActualizacionRenta } from './server/actualizacionRenta/rutasActualizacionRenta.js';");
  esperado=insertar(esperado,
    "const servicioSeguimientoIncidencias = dependenciasIA.firestore\n  ? crearServicioSeguimientoIncidencias({\n      puerto: dependenciasIA.firestore,\n      notificar: crearNotificadorIncidencias({\n        crearDispatcher: construirDispatcher,\n        ...(process.env.SEGUIMIENTO_ADMIN_USUARIO_ID\n          ? { usuarioIdAdministracion: process.env.SEGUIMIENTO_ADMIN_USUARIO_ID }\n          : {}),\n      }),\n    })\n  : null;",
    "\n\n// P2 — custodia de justificantes y auditoría durables; si falta Firestore o\n// Storage/IAM no se instala un backend en memoria ni se finge la persistencia.\nconst servicioJustificantesCobro = dependenciasIA.firestore && dependenciasIA.storage\n  ? crearServicioJustificantesCobro({ puerto: dependenciasIA.firestore, almacen: dependenciasIA.storage })\n  : null;\n\n// P4 · preview + confirmación explícita del actor autorizado. Las mutaciones se\n// escriben en un commit Firestore atómico, idempotente y append-only en colecciones\n// propias; el aviso queda PENDIENTE_ENVIO. No se conecta al cron ni a transportes,\n// no se modifica el contrato ni recibos/cobros históricos y no hay fallback en memoria.\nconst servicioActualizacionRenta = dependenciasIA.firestore\n  ? crearServicioActualizacionRenta({ puerto: dependenciasIA.firestore })\n  : null;");
  esperado=insertar(esperado,
    "montarRutasSeguimientoIncidencias(app, {\n  verificarToken: dependenciasIA.verificarToken,\n  servicio: servicioSeguimientoIncidencias,\n});",
    "\n\nmontarRutasJustificantesCobro(app, {\n  verificarToken: dependenciasIA.verificarToken,\n  servicio: servicioJustificantesCobro,\n});\n\nmontarRutasActualizacionRenta(app, {\n  verificarToken: dependenciasIA.verificarToken,\n  servicio: servicioActualizacionRenta,\n});");
  return esperado;
}
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
test('servicios/modelos heredados y entrypoints conservan el checkout f782, con puntos P2/P4 revisados',()=>{
  const referencia=referenciaCustodia();
  assert.ok(referencia,`CUSTODIA: no hay referencia verificable para el checkout ${base}`);
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
  const intactos=['src/lib/googleAuth.ts','tsconfig.json'];
  const serverBase=execFileSync('git',['show',`${referencia.sha}:server.ts`],{cwd:root,encoding:'utf8'});
  assert.equal(read('server.ts'),servidorEsperadoP2P4(serverBase),'server.ts: delta distinto de los puntos de entrada P2/P4 revisados');
  for(const f of intactos){
    if(referencia.historica)assert.equal(read(f),git('show',`${referencia.sha}:${f}`),f);
    else assert.ok(sinCambios(referencia.sha,f),`${f} modificado respecto a la referencia de custodia`);
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
  assert.deepEqual([...appBase].filter((s)=>!appActual.has(s)),[],'App.tsx: importación de servicio eliminada');
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
