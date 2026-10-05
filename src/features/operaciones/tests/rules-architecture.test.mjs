// ANÁLISIS LOCAL DE FUENTE: no compila Rules, no ejecuta Firestore y no cuenta sus expresiones.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {proyectarIdentidad,permitido} from '../persistence/authorization.ts';
// ADAPTACIÓN B: las Rules canónicas de B agregan varias secciones históricas; el parser se
// acota al BLOQUE OPERACIONES + los 4 helpers canónicos que el bloque consume (cuerpos del
// contrato canónico fc14156). Las aserciones sobre el bloque son idénticas a las de C.
const rulesFull=readFileSync(new URL('../../../../firestore.rules',import.meta.url),'utf8');
const bloque=rulesFull.slice(rulesFull.indexOf('// BLOQUE OPERACIONES'),rulesFull.indexOf('// FIN BLOQUE OPERACIONES'));
function helperCompleto(name){const s=rulesFull.indexOf(`function ${name}(`);assert.ok(s>=0,name);const o=rulesFull.indexOf('{',s);let d=1,q='',e2=false;for(let i=o+1;i<rulesFull.length;i++){const c=rulesFull[i];if(q){if(e2)e2=false;else if(c==='\\')e2=true;else if(c===q)q='';continue;}if(c==="'"||c==='"')q=c;else if(c==='{')d++;else if(c==='}'&&--d===0)return rulesFull.slice(s,i+1);}throw new Error(name);}
const rules=['me','isMasterAdmin','isSignedIn','authEmail'].map(helperCompleto).join('\n')+'\n'+bloque;
function functions(text) {
 const result=new Map();
 for(const m of text.matchAll(/function\s+(\w+)\(([^)]*)\)\s*\{/g)) {
  let i=m.index+m[0].length, start=i, depth=1, quote='';
  for(;i<text.length&&depth;i++) {
   const c=text[i];
   if(quote) {if(c===quote&&text[i-1]!=='\\')quote='';}
   else if(c==='"'||c==="'")quote=c;
   else if(c==='{')depth++; else if(c==='}')depth--;
  }
  assert.equal(depth,0,m[1]);assert.ok(!result.has(m[1]));
  result.set(m[1],{params:m[2].split(',').map(x=>x.trim()).filter(Boolean),body:text.slice(start,i-1)});
 }
 return result;
}
const f=functions(rules),body=n=>f.get(n).body;
const calls=b=>[...b.matchAll(/(?<![.\w])([A-Za-z_]\w*)\s*\(/g)].map(x=>x[1]);
const reads=b=>calls(b).filter(n=>['get','exists','getAfter'].includes(n));
function graph(text) {
 const fs=functions(text);
 const walk=(n,path=[])=>{
  assert.ok(!path.includes(n),'Ciclo: '+[...path,n].join(' -> '));
  const next=calls(fs.get(n).body).filter(c=>fs.has(c));
  return {depth:1+Math.max(0,...next.map(c=>walk(c,[...path,n]).depth)),names:[n,...next.flatMap(c=>walk(c,[...path,n]).names)]};
 };
 return {fs,walk};
}
const pure=['opAcceso','opRef','opRefOpcional','opVinculo','opRelaciones','opEconomia','opPresupuesto','opInvariantes','opCambio','opContadores','opContador','opEsquema','opComando'];
function pureGuards(text) {
 const g=graph(text);
 for(const name of pure)for(const child of g.walk(name).names)assert.deepEqual(reads(g.fs.get(child).body),[],`${name} -> ${child} incorpora I/O`);
}
test('arquitectura: los validadores de negocio y acceso son transitivamente puros',()=>pureGuards(rules));
test('arquitectura: detecta una relectura oculta detrás de otro helper',()=>{
 const mutated=rules.replace('return registro != null',"return opOculta() && registro != null")+"\nfunction opOculta() { return get(path).data != null; }";
 assert.throws(()=>pureGuards(mutated),{code:'ERR_ASSERTION'});
});
test('arquitectura: sin recursión, máximo siete parámetros y diez lets por función',()=>{
 const g=graph(rules);
 for(const [name,fn]of f) {
  assert.ok(fn.params.length<=7,name);assert.ok((fn.body.match(/\blet\s+/g)??[]).length<=10,name);
  for(const c of calls(fn.body).filter(c=>c.startsWith('op')))assert.ok(f.has(c),name+' llama helper inexistente '+c);
  assert.ok(g.walk(name).depth<=8,`${name}: profundidad ${g.walk(name).depth}`);
 }
 assert.throws(()=>graph(rules.replace('return registro != null','return opRef(p,tipo,registro,i) && registro != null')).walk('opRef'));
});
test('arquitectura: exactamente un cargador de referencias y un validador de evento por ruta',()=>{
 const g=graph(rules);
 const entity=g.walk('opFilaAutorizada').names,header=g.walk('opCabeceraValida').names;
 for(const name of ['opEventoValido','opReferencias','opDominio','opEsquema','opComando','opCambio','opEconomia','opInvariantes','opRelaciones','me'])assert.equal(entity.filter(x=>x===name).length,1,name);
 for(const name of ['opEventoValido','opReferencias','opDominio','opEsquema','opComando','opCambio','opEconomia','opInvariantes','opRelaciones'])assert.ok(!header.includes(name),name);
 assert.equal(header.filter(x=>x==='opContadores').length,1);
});
test('arquitectura: autorización no encadena propietarios/carteras que relean el espejo',()=>{
 for(const name of ['opLectura','opEscritura','opFilaAutorizada']) {
  const path=graph(rules).walk(name).names;
  assert.equal(path.filter(x=>x==='me').length,1,name);
  for(const forbidden of ['ownsPropietario','activeUser','isPropietarioRole','carterasLectura','carterasEscritura'])assert.ok(!path.includes(forbidden),name+' -> '+forbidden);
 }
 assert.ok(body('opFilaAutorizada').includes('let c = me();'));
 assert.ok(body('opFilaAutorizada').includes('opFilaValida(p,fila,vieja,c.usuarioId)'));
 assert.ok(body('opEventoValido').includes('data.usuarioId == usuarioId'));
});
test('arquitectura: carga condicional, una expresión get por cada referencia y sin exists',()=>{
 const r=body('opReferencias');assert.deepEqual(reads(r),Array(9).fill('get'));
 for(const [field,key] of [['proveedor','proveedorId'],['equipo','equipoId'],['garantia','garantiaId']]) {
  assert.ok(r.includes(`'${field}': negocio && '${key}' in e ? get(opEntidad(p,'${field}',e.${key})).data.registro : null`),field);
 }
 for(const [field,key] of [['incidencia','incidenciaId'],['averia','averiaId'],['reparacion','reparacionId']])assert.ok(r.includes(`'${field}': negocio && v != null && '${key}' in v ? get(opEntidad(p,'${field}',v.${key})).data.registro : null`),field);
 assert.ok(r.includes("let negocio = !(cmd.accion in ['ANOTAR','VINCULAR_DOCUMENTO'])"));
 assert.ok(r.includes("'documento': cmd.accion == 'VINCULAR_DOCUMENTO' ? get(opEntidad(p,'documento',cmd.documentoId)).data.registro : null"));
 assert.ok(r.includes('contratos_formalizacion/$(e.contratoId)'));assert.ok(r.includes('candidatos/$(e.inquilinoId)'));
 assert.ok(body('opDominio').includes('let r = opReferencias(p,e,cmd);'));
 assert.doesNotMatch(body('opDominio'),/incoming\(|request\.|\.get\('referencias'/);
});
test('arquitectura: schema y CAS rechazan antes de lecturas cruzadas de cabecera',()=>{
 assert.deepEqual(reads(body('opCabeceraValida')),[]);
 const h=body('opCabeceraValida');assert.ok(h.indexOf('n.revision ==')<h.indexOf('opCabeceraEnlazada('));
 const e=body('opEventoValido');assert.ok(e.indexOf('opEsquema(')<e.indexOf('opDominio('));assert.ok(e.indexOf('opComando(')<e.indexOf('opDominio('));
 const a=body('opFilaAutorizada');assert.ok(a.indexOf('opAcceso(')<a.indexOf('opFilaValida('));
});
test('arquitectura: solo se seleccionan los campos y transiciones del tipo pedido',()=>{
 assert.match(body('opCampos'),/return tipo == 'incidencia' \?/);
 assert.match(body('opDestinos'),/return tipo == 'incidencia' \?/);
 assert.doesNotMatch(body('opCampos'),/\}\[tipo\]/);assert.doesNotMatch(body('opDestinos'),/\}\[tipo\]/);
 assert.equal(calls(body('opEventoValido')).filter(x=>x==='opCampos').length,1);
 assert.equal(calls(body('opCambio')).filter(x=>x==='opDestinos').length,1);
});
test('arquitectura: delta de abiertas una sola vez para ambos contadores',()=>{
 assert.equal(calls(body('opContadores')).filter(x=>x==='opAbierta').length,2); // una evaluación por snapshot
 assert.ok(body('opContadores').includes('let delta = opAbierta(e)-opAbierta(b)'));
 assert.equal((body('opContadores').match(/,delta\)/g)??[]).length,2);
});

// Proyección de UNA fórmula pura para comparar su tabla de verdad con el adaptador canónico.
// No intérprete de Rules: no get/exists, ni matches, ni permisos Firestore, ni conteo de expresiones.
function accessFormula() {
 let source=body('opAcceso').replaceAll('c.get(', 'read(c,')
  .replaceAll('l is list','Array.isArray(l)').replaceAll('e is list','Array.isArray(e)')
  .replaceAll('p is string',"typeof p === 'string'").replaceAll('p.size()','p.length')
  .replaceAll('l.hasAll(e)','e.every(v=>l.some(x=>equal(x,v)))')
  .replaceAll('p in (escritura ? e : l)','(escritura ? e : l).some(x=>equal(x,p))');
 return new Function('p','c','escritura','read','equal',source);
}
test('álgebra de autorización: titular/L/E/revocado/suspendido/ajeno, sin nuevos grants',()=>{
 const check=accessFormula();let n=0;
 for(const estado of ['ACTIVO','BLOQUEADO','REVOCADA',undefined])for(const tipoPerfil of ['PROPIETARIO','PROFESIONAL','ADMINISTRADOR',undefined])
 for(const propietarioId of ['a','b',''])for(const [carterasL,carterasE] of [[[],[]],[['a'],[]],[['a'],['a']],[['a','b'],['b']],[[],['a']],[undefined,undefined],[false,[]]])
 for(const p of ['a','b'])for(const write of [false,true]) {
  const c={usuarioId:'usuario-no-uid',estado,tipoPerfil,propietarioId};if(carterasL!==undefined)c.carterasL=carterasL;if(carterasE!==undefined)c.carterasE=carterasE;
  let expected=false;try{expected=permitido(proyectarIdentidad('uid',c,{nombre:'Sintético'},''),p,write);}catch{}
  const actual=check(p,c,write,(o,k,d)=>Object.hasOwn(o,k)?o[k]:d,isDeepStrictEqual);
  assert.equal(actual,expected,JSON.stringify({c,p,write}));n++;
 }
 assert.equal(n,1344);
});

const obligations={
 opAcceso:["l is list && e is list && l.hasAll(e)","c.get('estado', '') == 'ACTIVO'","c.get('tipoPerfil', '') == 'PROPIETARIO'","c.get('propietarioId', '') == p","p in (escritura ? e : l)"],
 opRef:["registro != null","tipo == 'proveedor' ? registro.propietarioId == p","registro.ambito == {'propietarioId': p, 'inmuebleId': i}"],
 opVinculo:['r.averia.incidenciaId == v.incidenciaId','r.reparacion.incidenciaId == v.incidenciaId',"r.reparacion.get('averiaId','') == v.averiaId"],
 opRelaciones:["opRefOpcional(p,e,'proveedorId','proveedor',i,r.proveedor)","opRefOpcional(p,e,'equipoId','equipo',i,r.equipo)","opRefOpcional(p,e,'garantiaId','garantia',i,r.garantia)","opRef(p,'incidencia',r.incidencia,i)","opRef(p,'averia',r.averia,i)",'r.averia.incidenciaId == e.incidenciaId',"r.garantia.equipoId == e.get('equipoId','')",'r.contrato.inmuebleId == i','r.contrato.candidatoId == e.inquilinoId','r.inquilino.inmuebleId == i'],
 opEconomia:["e.moneda == 'EUR'","'proveedorId' in e",'r.reparacion.proveedorId == e.proveedorId',"r.incidencia.get('equipoId',e.equipoId) == e.equipoId","r.averia.get('equipoId',e.get('equipoId','')) == e.get('equipoId','')"],
 opInvariantes:["h.abiertasPorIncidencia.get(e.id,0) == 0","h.abiertasPorAveria.get(e.id,0) == 0","h.presupuestosEnUso.get(e.id,0) == 0","r.incidencia.estado in ['CERRADA','CANCELADA']",'e.fechaFin >= e.fechaInicio','e.resultado.size()>0','e.costeCentimos >= 0'],
 opCambio:["e.get('ambito',null) == b.get('ambito',null)","e.get('propietarioId',null) == b.get('propietarioId',null)","e.estado in opDestinos(e.tipo,b.estado)","opRef(p,'documento',r.documento,i)",'r.proveedor.activo == true',"r.averia.estado in ['RESUELTA','CANCELADA']",'e.version == b.version + 1'],
 opPresupuesto:["e.tipo in ['reparacion','factura']","opRef(p,'presupuesto',q,i)",'q.proveedorId == e.proveedorId','e.vinculo != null','q.vinculo.incidenciaId == e.vinculo.incidenciaId','q.vinculo.incidenciaId == e.incidenciaId',"q.vinculo.get('averiaId',e.vinculo.get('averiaId','')) == e.vinculo.get('averiaId','')","q.vinculo.get('reparacionId',e.vinculo.get('reparacionId','')) == e.vinculo.get('reparacionId','')","q.vinculo.get('averiaId',e.get('averiaId','')) == e.get('averiaId','')","q.vinculo.get('reparacionId',e.id) == e.id","e.tipo != 'reparacion' || !(e.estado in ['EN_CURSO','FINALIZADA']) || q.estado == 'APROBADO'"],
 opDominio:['opRelaciones(p,e,i,r)','opCambio(p,e,antes,cmd,i,cambios,r)','opInvariantes(p,e,h,r)','opEconomia(p,e,r)'],
 opCabeceraValida:['n.propietarioId == p','n.revision == (a == null ? 0 : a.revision) + 1','opCabeceraEnlazada(p,a,n)'],
 opCabeceraEnlazada:['fila.auditId == n.ultimoEventoId','fila.registro.version == (vieja == null ? 0 : vieja.registro.version) + 1','opContadores(',"audit.accion in ['OPERACIONES_ANOTAR','OPERACIONES_VINCULAR_DOCUMENTO'] || !('presupuestoId' in fila.registro)",'opPresupuestoEnlazado(p,fila.registro,audit.detalles.inmuebleId)'],
 opFilaValida:['h.revision == (anterior == null ? 0 : anterior.revision) + 1','!exists(auditPath)','opEventoValido(p,fila.auditId,getAfter(auditPath).data,h,fila,vieja,usuarioId)'],
 opEventoValido:['data.usuarioId == usuarioId','cmd.actor == request.auth.uid','data.registradoEn == request.time','h.ultimoEventoId == id','cmd.revisionEsperada == h.revision - 1','fila.versiones == (vieja == null ? [] : vieja.versiones).concat([version])',"version.ambito == {'propietarioId':p,'inmuebleId':data.idAfectado}",'opActual(p,data.idAfectado)','opEsquema(e,campos)','opComando(e,antes,cmd,campos,cambios)'],
};
function required(text) {
 const fs=functions(text);
 for(const [name,clauses]of Object.entries(obligations))for(const clause of clauses)assert.ok(fs.get(name).body.includes(clause),name+': '+clause);
}
test('seguridad de fuente: obligaciones de acceso, ámbito, finanzas, CAS y audit siguen conectadas',()=>required(rules));
test('seguridad de fuente: quitar cualquiera de las obligaciones rompe las guardas',()=>{
 for(const [name,clauses]of Object.entries(obligations))for(const clause of clauses) {
  const old=body(name),mutated=rules.replace(old,old.replace(clause,'true'));
  assert.notEqual(mutated,rules);assert.throws(()=>required(mutated),{code:'ERR_ASSERTION'},name+': '+clause);
 }
});
test('SDK directo: las dos rutas son cerradas, el cliente no suministra permiso ni referencias resueltas',()=>{
 const block=rules.slice(rules.indexOf('match /operaciones/'));
 assert.equal((block.match(/allow read: if opLectura\(propietarioId\);/g)??[]).length,2);
 assert.equal((block.match(/allow delete: if false;/g)??[]).length,2);
 assert.ok(block.includes('allow create, update: if opEscritura(propietarioId)'));
 assert.ok(block.includes('allow create, update: if isSignedIn()\n          && opFilaAutorizada('));
 assert.ok(body('opFilaAutorizada').includes('return (isMasterAdmin() || opAcceso(p,c,true))'));
 assert.ok(body('opFilaAutorizada').includes("fila.keys().hasOnly(['registro','auditId','versiones'])"));
 assert.ok(body('opFilaAutorizada').includes("key == fila.registro.tipo + '~' + fila.registro.id"));
 assert.doesNotMatch(block,/allow write:|if true/);
 const audit=rulesFull.slice(rulesFull.indexOf('match /audit_logs/'),rulesFull.indexOf('match /notificaciones/'));
 assert.match(audit,/allow read: if isMasterAdmin\(\);/);assert.match(audit,/allow create: if isSignedIn\(\);/);assert.match(audit,/allow update, delete: if false;/);
});

test('presupuesto: única lectura en cabecera, nunca duplicada desde la entidad',()=>{
 const g=graph(rules),head=g.walk('opCabeceraValida').names,entity=g.walk('opFilaAutorizada').names;
 assert.equal(head.filter(n=>n==='opPresupuestoEnlazado').length,1);
 assert.equal(head.filter(n=>n==='opPresupuesto').length,1);
 for(const n of ['opPresupuestoEnlazado','opPresupuesto'])assert.ok(!entity.includes(n));
 assert.deepEqual(reads(body('opPresupuestoEnlazado')),['get']);
 assert.ok(body('opPresupuestoEnlazado').includes("let q = get(opEntidad(p,'presupuesto',e.presupuestoId)).data.registro"));
 assert.ok(body('opPresupuestoEnlazado').includes('return opPresupuesto(p,e,i,q)'));
 assert.doesNotMatch(body('opReferencias'),/'presupuesto':/);
 assert.ok(body('opEventoValido').includes("data.accion == 'OPERACIONES_' + cmd.accion"));
 assert.ok(body('opCabeceraEnlazada').includes('fila.auditId == n.ultimoEventoId'));
});
test('presupuesto: el ámbito y proveedor son previos a la rama de vínculo y aprobación',()=>{
 const q=body('opPresupuesto');
 assert.ok(q.indexOf("opRef(p,'presupuesto',q,i)")<q.indexOf("e.tipo == 'factura' ?"));
 assert.ok(q.indexOf('q.proveedorId == e.proveedorId')<q.indexOf("e.tipo == 'factura' ?"));
 assert.equal((q.match(/q\.vinculo\.incidenciaId ==/g)??[]).length,2);
 assert.equal((q.match(/q\.vinculo\.get\('averiaId'/g)??[]).length,2);
 assert.equal((q.match(/q\.vinculo\.get\('reparacionId'/g)??[]).length,2);
});
test('plan estático: máximo cuatro referencias de negocio por esquema de entidad (no cuota nativa)',()=>{
 const fields=Object.fromEntries([...body('opCampos').matchAll(/tipo == '([^']+)' \? (\[[^\n]+\])/g)].map(([,k,v])=>[k,JSON.parse(v.replaceAll("'",'"'))]));
 const direct={proveedorId:'proveedor',equipoId:'equipo',garantiaId:'garantia',incidenciaId:'incidencia',averiaId:'averia',contratoId:'contrato',inquilinoId:'inquilino'};
 const expected={incidencia:4,averia:4,reparacion:4,proveedor:0,equipo:0,garantia:2,presupuesto:4,factura:4,documento:0};
 for(const [tipo,keys]of Object.entries(fields)) {
  const refs=new Set(keys.filter(k=>k in direct).map(k=>direct[k]));
  if(keys.includes('vinculo'))for(const x of ['incidencia','averia','reparacion'])refs.add(x);
  assert.equal(refs.size,expected[tipo],tipo);
 }
 // ANOTAR/VINCULAR no se suman a esas referencias: son ramas excluyentes del cargador.
 assert.ok(body('opReferencias').includes("let negocio = !(cmd.accion in ['ANOTAR','VINCULAR_DOCUMENTO'])"));
});

// CUSTODIA (ADAPTACIÓN B): la base git de C no existe en este repositorio; los cuerpos
// portados quedan fijados con SHA-256 calculado sobre C 1686b8e8. Cualquier desvío falla
// el test — mismo propósito anti-drift que la comparación original.
const PINNED = {
  opAbierta: '53472b2bcd0e269345feb84867008ea1b8b42cd1bc07411d9b419f975536721b',
  opAcceso: '60cc67a204e8063e748e2c30ccff9661bcb7ad2b0e92ccaec908bc634c607bba',
  // H8: re-fijado deliberadamente. `opActual` dejó de autorizar por el campo
  // legado `propietarioSecundarioId` y pasó a usar el índice `titularesIds`,
  // alineándose con `inmuebleEsMio` y con el cliente. Único pin modificado.
  opActual: '72ce98af13a1779a366146ef413ce0324c38f175fb418b040575b1eecef5ad41',
  opCabeceraEnlazada: '90b03f80742ee47bd7073eec6c1fe94a311ae154c44aa404b47e248588bddac2',
  opCabeceraValida: '4b66a9d9aace0c1e89dc280265dfde4771c5de93d57a72a9f78f92bb660f7862',
  opCambio: 'd717699e2eea386c938b614dcca2df76b3c2f85def60b6d8164a6f0107ba3358',
  opCampos: '0c3072effe83cf1b0393e3f6ec4581298ddef352bd6255f5a9f6f07572b36513',
  opComando: '72431723025c8249689c6e98313a03b2cea2678a7e79e5670336f7b98fa0dc12',
  opConcepto: 'a223dc9b5ea888e9228db06fdfbb02f1af80eb0303412b005d2f5365621f0996',
  opConceptos: 'a73bdf0c225ae00ac45d9f1af473f86d2fd6d5c9a689de69448ff86cb59859e5',
  opContador: '73f29ab4cc69895069ccd23a388b31af7e63e355d4bd563fb6f0daea99f907c5',
  opContadores: 'fb369e1da6f5f6547f4aa83c74d401611a6f9a2bc572c22b2f2d6b0b0e5c9d1e',
  opDestinos: '4ce88f8edb1ab96d3ce7139ef3486421447b4bc46dcae4b347dd30f6f62a9745',
  opDinero: 'a0033d5a26ed7896622261bb501f34d9678d066ae0313adad4ca00f93899de61',
  opDominio: 'b91a6650e6d0c30a7348993a697fc563e6c3df6356aa548fb49c0a7d22a610b2',
  opEconomia: '7a44cef5850c10fc317583933a4dff0979885d3b7423d07be07ae938fa69e8d3',
  opEntidad: '2bfba8602a6cd03ed25a7303620013fa0de54e60eb7d9b9236b9e7ac253ae129',
  opEscritura: '02215c0ef93838d632721400aab04ca7f278b1c6d7cde8b50188f1e12d20f65e',
  opEsquema: 'b6a961bfb72e1e4b9bccab9d18a85ca54cebd13bb260da95fe25535f4334a0e1',
  opEventoValido: '84f88a7316da852e9f128184081b01b466056e4940ab10c39a1bba969f937b58',
  opFilaAutorizada: '62c6a78cc50a2f0c0b7514bab08160daa28a6076acc5ee3f9b262e2d73f72b0e',
  opFilaValida: 'a9f07d5f3ee372a5752653d68a166af4c8f3a4b398263485b926c8ffac96bfd1',
  opImporte: '6021c16ab34031f99422ff40c56c9c8817154cea7511965704f27d4a49c54ca4',
  opInicial: '7612c3058fe23762693fa830e5526c0fc1f1805761fb3de609d3800f1d7d1adf',
  opInvariantes: '5cc20aaf1d37d5686823426bdea5ff4f80bae2c54071b1d3f2d8fc3bc852bddc',
  opLectura: 'c124028dfe3679846d9788daff0c99ddbd0a453adb8f5ba1d0cc60c87c9b7299',
  opPresupuesto: '4d03e27c895601bc7167873577f8d8798838926afb7823d9888b46b9627b099c',
  opPresupuestoEnlazado: '154f0e18ee75748b71b35933cf2afa500294a437aecd60a09f74c26cc8873642',
  opRef: '5d3c2989de3a78ecd283dc91f2b829acf2f3e6571dff10f21a19b0a08edeefd5',
  opRefOpcional: 'fad503b29fd9c1154c6f5a03ff87843b9f8ff5413141897678b040a16a2d24ea',
  opReferencias: 'a9744a445d074fa13779d3277f8f1ea75c8be8fb7738f1c1520c1fd852fc135e',
  opRelaciones: '0596bf230f7fbf38fd24d837a5d6866618d8b2aa55ab8a8b441c9caea6efa0c6',
  opTexto: '07379f25d5269d36250b330391142278017a686e2d3e06dc61860ab808c9c810',
  opUso: 'f5abd4adbebcfa1498fbbe37f2dd166844eb5a0c3c89c97dcb7daf44fdd9a79b',
  opVinculo: 'd38a3493ced407f48f6b66dc4fdca3680481b43b209bce1ff864c43711dd3338',
};
test('custodia: los 35 cuerpos portados están fijados byte a byte contra C 1686b8e8',()=>{
 const sha=(x)=>createHash('sha256').update(x).digest('hex');
 assert.equal(Object.keys(PINNED).length,35);
 for(const [name,esperado] of Object.entries(PINNED))assert.equal(sha(body(name).replace(/\s+/g,'')),esperado,name);
});
