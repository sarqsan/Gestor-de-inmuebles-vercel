import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POLITICA_ESTADOS } from '../policies.ts';
import { CAMPOS } from '../validation.ts';
// Inspección FAIL-LOUD del archivo real. No es ejecución ni compilación de Rules.
// ADAPTACIÓN B: las Rules canónicas de B agregan varias secciones históricas; las pruebas
// del bloque se ejecutan sobre BLOQUE OPERACIONES + los 4 helpers canónicos que consume
// (cuerpos del contrato canónico). Las pruebas de archivo completo usan rulesFull.
const rulesFull=readFileSync(new URL('../../../../firestore.rules',import.meta.url),'utf8');
function helperCompleto(name){const st=rulesFull.indexOf(`function ${name}(`);assert.ok(st>=0,name);const o=rulesFull.indexOf('{',st);let d=1,q='',e2=false;for(let i=o+1;i<rulesFull.length;i++){const c=rulesFull[i];if(q){if(e2)e2=false;else if(c==='\\')e2=true;else if(c===q)q='';continue;}if(c==="'"||c==='"')q=c;else if(c==='{')d++;else if(c==='}'&&--d===0)return rulesFull.slice(st,i+1);}throw new Error(name);}
const bloque=rulesFull.slice(rulesFull.indexOf('// BLOQUE OPERACIONES'),rulesFull.indexOf('// FIN BLOQUE OPERACIONES'));
const rules=['me','isMasterAdmin','isSignedIn','authEmail'].map(helperCompleto).join('\n')+'\n'+bloque;
const norm=(s)=>s.replace(/\s+/g,'');
function fn(text,name){const start=text.indexOf(`function ${name}(`);assert.ok(start>=0,name);const open=text.indexOf('{',start);let depth=1,quote='',escaped=false;for(let i=open+1;i<text.length;i++){const c=text[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}if(c==='\''||c==='"')quote=c;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return text.slice(open+1,i);}throw new Error('Función incompleta: '+name);}
function verificar(text){
 assert.equal(norm(fn(text,'me')),norm('return get(/databases/$(database)/documents/usuarios_auth/$(request.auth.uid)).data;'));
 assert.equal(norm(fn(text,'opAcceso')),norm("let l = c.get('carterasL', []); let e = c.get('carterasE', []); return l is list && e is list && l.hasAll(e) && c.get('estado', '') == 'ACTIVO' && ((c.get('tipoPerfil', '') == 'PROPIETARIO' && p is string && p.size() > 0 && c.get('propietarioId', '') == p) || p in (escritura ? e : l));"));
 for(const [name,write] of [['opLectura',false],['opEscritura',true]])assert.equal(norm(fn(text,name)),norm(`return isMasterAdmin() || (isSignedIn() && opAcceso(p,me(),${write}));`));
}
test('Rules reales: helpers canónicos y espejo, no usuario directo por UID',()=>verificar(rules));
test('harness falla si cambia E por L o se introduce bypass genérico',()=>{for(const text of [rules.replace('opAcceso(p,me(),true)','opAcceso(p,me(),false)'),rules.replace('return isMasterAdmin() || (isSignedIn() && opAcceso','return isSignedIn() || (isSignedIn() && opAcceso')])assert.throws(()=>verificar(text));});
test('sin roles/permisos UI ni isStaff en bloque operativo',()=>assert.doesNotMatch(bloque,/isStaff|\.roles|\.permisos/));
// ADAPTACIÓN B: el match /audit_logs canónico de B (sección propia, previa al bloque) ya
// codifica el contrato literal; el port NO lo duplica.
test('audit_logs: contrato B literal create autenticado/read master/update-delete false',()=>{
 const block=rulesFull.slice(rulesFull.indexOf('match /audit_logs/'),rulesFull.indexOf('match /notificaciones/'));
 for(const s of ['allow read: if isMasterAdmin();','allow create: if isSignedIn();','allow update, delete: if false;'])assert.ok(block.includes(s));
 assert.ok(fn(rulesFull,'isMasterAdmin').includes("authEmail() == 'sarqsan2@gmail.com'"));
});
test('transiciones persistentes coinciden exactamente con el motor',()=>{
 const branches=[...fn(rules,'opDestinos').matchAll(/tipo == '([^']+)' \? (\{[^\n]+\})\[estado\]/g)];
 assert.equal(branches.length,Object.keys(POLITICA_ESTADOS).length);
 const data=Object.fromEntries(branches.map(([,k,v])=>[k,JSON.parse(v.replaceAll("'",'"'))]));
 for(const [tipo,flow]of Object.entries(POLITICA_ESTADOS))assert.deepEqual(data[tipo],flow.transiciones);
});
test('contadores verificados impiden cierre pendiente y cancelación de autorización utilizada',()=>{for(const c of ['abiertasPorIncidencia','abiertasPorAveria','presupuestosEnUso']){assert.ok(fn(rules,'opContadores').includes(c));assert.ok(fn(rules,'opInvariantes').includes(c));}assert.match(fn(rules,'opContador'),/diff\(antes\)\.affectedKeys\(\)\.hasOnly/);});
test('relación de ámbito inmutable y vinculación documental acotada',()=>{for(const s of ["e.get('ambito',null) == b.get('ambito',null)","e.get('propietarioId',null) == b.get('propietarioId',null)","opRef(p,'documento',r.documento,i)"])assert.ok(fn(rules,'opCambio').includes(s));});
// ADAPTACIÓN B: el borrado de inmuebles en B es master-only y el bloque de operaciones no
// declara permisos sobre inmuebles/propietarios/usuarios. (El update de B no fija
// propietarioPrincipalId: comportamiento previo de B, no alterado por este port.)
test('no transferencias ni borrado de titularidad desde operaciones',()=>{assert.doesNotMatch(bloque,/match \/inmuebles|match \/propietarios|match \/usuarios/);const s=rulesFull.slice(rulesFull.indexOf('match /inmuebles/'),rulesFull.indexOf('// 3. CANDIDATOS'));assert.match(s,/allow delete: if isMasterAdmin\(\);/);});
// ADAPTACIÓN B: firebase.json de B usa forma array y sus índices preexisten; se comprueba
// que el port no añade ningún índice para las colecciones de operaciones.
test('firebase.json despliega el archivo real; el port no añade índices',()=>{const c=JSON.parse(readFileSync(new URL('../../../../firebase.json',import.meta.url)));assert.equal(c.firestore[0].rules,'firestore.rules');const idx=JSON.parse(readFileSync(new URL('../../../../firestore.indexes.json',import.meta.url))).indexes;assert.ok(idx.length>0);assert.ok(!JSON.stringify(idx).includes('operaciones'));});
// ADAPTACIÓN B: el binding de B tiene su propio contrato (lectura propia + D3
// anti-autoasignación de carterasL/E). Mismo propósito: operaciones no puede ampliar su
// propia identidad ni redefinir el binding.
test('Operaciones solo consume el binding; carteras no autoasignables',()=>{const s=rulesFull.slice(rulesFull.indexOf('match /usuarios_auth/'),rulesFull.indexOf('match /propietarios/'));assert.ok(s.includes('request.auth.uid == uid'));assert.ok(s.includes('carterasNoAutoasignadasEnCreacion()'));assert.doesNotMatch(bloque,/match \/usuarios_auth/);});
test('campos de los nueve modelos siguen siendo los del núcleo',()=>{
 const branches=[...fn(rules,'opCampos').matchAll(/tipo == '([^']+)' \? (\[[^\n]+\])/g)];assert.equal(branches.length,9);
 assert.deepEqual(Object.fromEntries(branches.map(([,k,v])=>[k,JSON.parse(v.replaceAll("'",'"'))])),CAMPOS);
});
test('versión de negocio append-only ligada al audit canónico, sin copia de eventos auditados',()=>{
 const s=fn(rules,'opEventoValido');for(const x of ['fila.versiones == (vieja == null ? [] : vieja.versiones).concat([version])','data.usuarioId == usuarioId','data.registradoEn == request.time','opComando(e,antes,cmd,campos,cambios)'])assert.ok(s.includes(x),x);
 assert.doesNotMatch(s,/detalles\.evento/);
});
test('suma exacta de los diez conceptos máximos y enteros seguros',()=>{const c=fn(rules,'opConceptos');assert.ok(c.includes('c.size() <= 10'));for(let i=0;i<10;i++){assert.ok(c.includes(`opConcepto(c,${i})`));assert.ok(c.includes(`opImporte(c,${i})`));}assert.ok(fn(rules,'opDinero').includes('9007199254740991'));});
// ADAPTACIÓN B: la creación de propietario en B exige id propio exacto (myPropId); el
// gestor por carterasE NO puede crear titulares.
test('CREAR no sobrescribe y gestor E no crea titulares',()=>{assert.ok(fn(rules,'opCambio').includes("cmd.accion != 'CREAR' && e.id == b.id"));const s=rulesFull.slice(rulesFull.indexOf('match /propietarios/'),rulesFull.indexOf('// 1. INMUEBLES'));const crea=s.slice(s.indexOf('allow create'),s.indexOf('allow update'));assert.ok(crea.includes('isMasterAdmin()'));assert.ok(crea.includes('propietarioId == myPropId()'));assert.match(crea,/hasAny\(\[[^\]]*'carterasL'[^\]]*'carterasE'[^\]]*\]\)/,'la creación del propietario debe denegar explícitamente los campos de carteras');});

// Guardas de estructura, NO certifican el presupuesto de expresiones del Emulator.
function acoplamiento(text) {
 const h=fn(text,'opCabeceraValida')+fn(text,'opCabeceraEnlazada'), f=fn(text,'opFilaValida'), evento=fn(text,'opEventoValido');
 for(const x of ["getAfter(path).data", "fila.registro.version is int", "fila.auditId == n.ultimoEventoId", "fila.registro.version == (vieja == null ? 0 : vieja.registro.version) + 1", "n.revision == (a == null ? 0 : a.revision) + 1", "opContadores(a == null ? {} : a,n,{'antes':vieja == null ? null : vieja.registro,'despues':fila.registro})"])assert.ok(h.includes(x),x);
 for(const x of ['h.revision is int','h.revision == (anterior == null ? 0 : anterior.revision) + 1','!exists(auditPath)','opEventoValido(p,fila.auditId,getAfter(auditPath).data,h,fila,vieja,usuarioId)'])assert.ok(f.includes(x),x);
 for(const x of ['h.ultimoEventoId == id','fila.auditId == id','cmd.revisionEsperada == h.revision - 1','data.registradoEn == request.time'])assert.ok(evento.includes(x),x);
}
test('acoplamiento exige cambios observables en ambas direcciones y audit nuevo',()=>acoplamiento(rules));
test('guardas fallan al quitar cualquiera de los testigos de atomicidad',()=>{
 for(const x of ['fila.registro.version == (vieja == null ? 0 : vieja.registro.version) + 1','h.revision == (anterior == null ? 0 : anterior.revision) + 1','!exists(auditPath)','fila.auditId == n.ultimoEventoId'])assert.throws(()=>acoplamiento(rules.replace(x,'true')),{code:'ERR_ASSERTION'},x);
});
test('evento completo una sola ruta de evaluación: entidad, no cabecera',()=>{
 assert.doesNotMatch(fn(rules,'opCabeceraValida'),/opEventoValido|opEsquema|opComando|opCambio|opInvariantes|opEconomia/);
 assert.equal([...rules.matchAll(/opEventoValido\(/g)].length,2); // definición + único llamador
 for(const x of ['opEsquema(e,campos)','opComando(e,antes,cmd,campos,cambios)','opDominio(p,e,antes,cmd,data.idAfectado,cambios,h)'])assert.ok(fn(rules,'opEventoValido').includes(x),x);
 for(const x of ['opCambio(p,e,antes,cmd,i,cambios,r)','opRelaciones(p,e,i,r)','opInvariantes(p,e,h,r)','opEconomia(p,e,r)'])assert.ok(fn(rules,'opDominio').includes(x),x);
});
test('autorización sigue en ambas entradas; no bypass por quitar duplicación interior',()=>{
 const s=rules.slice(rules.indexOf('match /operaciones/'));
 assert.equal([...s.matchAll(/allow create, update: if opEscritura\(propietarioId\)/g)].length,1);
 assert.ok(s.includes('allow create, update: if isSignedIn()'));
 assert.match(fn(rules,'opFilaAutorizada'),/return \(isMasterAdmin\(\) \|\| opAcceso\(p,c,true\)\)/);
 assert.ok(fn(rules,'opFilaAutorizada').includes('opFilaValida(p,fila,vieja,c.usuarioId)'));
 assert.ok(s.includes('opCabeceraValida(propietarioId,resource == null ? null : resource.data,incoming())'));
 assert.ok(s.includes('opFilaAutorizada(propietarioId,entidadKey,incoming(),resource == null ? null : resource.data)'));
 assert.ok(fn(rules,'opEventoValido').includes('opActual(p,data.idAfectado)'));
});
test('campos y diferencias se calculan una vez, sin relectura de entidad anterior',()=>{
 const e=fn(rules,'opEventoValido');assert.ok(e.includes('let campos = opCampos(e.tipo)'));
 assert.ok(e.includes('let cambios = antes == null ? null : e.diff(antes).affectedKeys()'));
 assert.doesNotMatch(e,/exists\(|get\(path\)/);
 for(const f of ['opEsquema','opComando','opCambio'])assert.doesNotMatch(fn(rules,f),/opCampos\(|e\.diff\(b\)\.affectedKeys/);
});
test('esquema de cabecera y contadores no se sustituyen por simple existencia',()=>{
 const s=fn(rules,'opCabeceraValida');assert.ok(s.includes("n.keys().hasOnly(['propietarioId','revision','ultimoEventoId','abiertasPorIncidencia','abiertasPorAveria','presupuestosEnUso'])"));
 assert.ok(s.includes('n.propietarioId == p && n.revision is int'));assert.ok(fn(rules,'opCabeceraEnlazada').includes('opContadores('));
});
