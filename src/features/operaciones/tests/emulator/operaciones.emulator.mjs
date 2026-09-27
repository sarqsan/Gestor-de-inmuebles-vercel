// INTEGRACIÓN REAL: Firebase Auth Emulator + Firestore Emulator, SDK nativo, Rules del repo.
// Sin mocks, sin firebase-admin, sin App/seeds. Falla, no omite, si falta infraestructura.
import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp,terminate} from 'firebase/firestore';
import {crearRepositorioFirebase} from '../../persistence/firebase.ts';
import {auditoriaDe,idAuditoria} from '../../../../lib/auditoria.ts';
import {cabeceraDe} from '../../persistence/repository.ts';
import {versionDe} from '../../persistence/versions.ts';
import {ejecutarRecorridoFicticio} from '../../demo/recorrido.mjs';
import {CONTEXTO_FICTICIO} from '../../demo/fixtures.ts';
import {MASTER_EMAIL_CANONICO} from '../../persistence/authorization.ts';
const PROJECT='demo-operaciones-c';
assert.equal(process.env.GCLOUD_PROJECT,PROJECT,'Solo se admite el proyecto demo aislado, nunca Firebase real');
for(const [env,port]of [['FIRESTORE_EMULATOR_HOST',8080],['FIREBASE_AUTH_EMULATOR_HOST',9099]])assert.match(process.env[env]??'',new RegExp(`^(127\\.0\\.0\\.1|localhost|0\\.0\\.0\\.0):${port}$`),`Falta Emulator local: ${env}`);
const base='http://127.0.0.1:8080',docs=`${base}/v1/projects/${PROJECT}/databases/(default)/documents`;
const a=CONTEXTO_FICTICIO.ambito,journey=ejecutarRecorridoFicticio().estado;
const clientes=[],usuarios=new Map();let n=0;
function encode(v){if(v===null)return {nullValue:null};if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}};if(typeof v==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};return typeof v==='boolean'?{booleanValue:v}:{stringValue:v};}
async function admin(path,data){const r=await fetch(`${docs}/${path}`,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify(encode(data).mapValue)});assert.ok(r.ok,await r.text());}
async function evidencia(path){const r=await fetch(`${docs}/${path}`,{headers:{Authorization:'Bearer owner'}});if(r.status===404)return null;assert.ok(r.ok);return r.json();}
async function client(label,email){
 if(usuarios.has(label))return usuarios.get(label);
 const app=initializeApp({projectId:PROJECT,apiKey:'synthetic-emulator-only',authDomain:`${PROJECT}.invalid`},`emulator-${++n}`);
 const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
 const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);
 if(label!=='anon')await createUserWithEmailAndPassword(auth,email??`${label}-${n}@synthetic.invalid`,'Only-synthetic-emulator-42!');
 const c={app,auth,db,repo:crearRepositorioFirebase(db,auth)};clientes.push(c);usuarios.set(label,c);return c;
}
async function identidad(c,campos={},mismoId=false){const uid=c.auth.currentUser.uid,usuarioId=mismoId?uid:`usuario-${uid}`;await admin(`usuarios/${usuarioId}`,{nombre:'Persona sintética',propietarioId:campos.propietarioId??''});await admin(`usuarios_auth/${uid}`,{uid,usuarioId,tipoPerfil:'PROPIETARIO',estado:'ACTIVO',carterasL:[],carterasE:[],...campos});return usuarioId;}
async function fixture(label='titular',campos={propietarioId:'prop-demo-a'}){const c=await client(label,label==='master'?MASTER_EMAIL_CANONICO:undefined);await identidad(c,campos);return c;}
const cmd=(c,i)=>({...journey.historial[i].comando,actor:c.auth.currentUser.uid});
async function recorrido(c,hasta=29){for(let i=0;i<hasta;i++)await c.repo.ejecutar(a,cmd(c,i));}
async function denegado(p){await assert.rejects(p,e=>{
 assert.doesNotMatch(e.message,/maximum of 1000|expressions to evaluate|maximum.*(?:expression|access call)/i,'Un límite de evaluación no es una negativa de seguridad válida');
 return e.code==='permission-denied'||/permiso efectivo/.test(e.message);
});}
async function propuesta(c,index=0){
 const h=structuredClone(journey.historial[index]);h.comando={...h.comando,actor:c.auth.currentUser.uid,revisionEsperada:0};h.actor=h.comando.actor;h.revision=1;
 const sesion=(await c.repo.cargar(a)).identidad;
 return {evento:h,head:cabeceraDe({revision:1,entidades:[h.despues],historial:[h]},h),row:{registro:h.despues,auditId:idAuditoria(h),versiones:[versionDe(h)]},log:auditoriaDe(h,sesion)};
}
async function escribir(c,p,{entidad=true,cabecera=true,auditoria=true}={}){
 const batch=writeBatch(c.db),e=p.row.registro;
 if(entidad)batch.set(doc(c.db,'operaciones',a.propietarioId,'entidades',`${e.tipo}~${e.id}`),p.row);
 if(cabecera)batch.set(doc(c.db,'operaciones',a.propietarioId),p.head);
 if(auditoria)batch.set(doc(c.db,'audit_logs',p.log.id),{...p.log,registradoEn:serverTimestamp()});
 return batch.commit();
}
async function vacio(){assert.equal(await evidencia(`operaciones/${a.propietarioId}`),null);assert.equal(await evidencia(`operaciones/${a.propietarioId}/entidades/proveedor~proveedor-demo`),null);assert.equal(await evidencia(`audit_logs/${idAuditoria(journey.historial[0])}`),null);}
before(async()=>{const r=await fetch(`${base}/`);assert.ok(r.status<500,'No responde Firestore Emulator');});
beforeEach(async()=>{
 const r=await fetch(`${base}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,{method:'DELETE',headers:{Authorization:'Bearer owner'}});assert.ok(r.ok);
 for(const p of ['prop-demo-a','prop-demo-b'])await admin(`propietarios/${p}`,{nombre:'Titular jurídico sintético SIN cuenta'});
 await admin('inmuebles/inm-demo-1',{direccion:'Inmueble sintético',propietarioPrincipalId:'prop-demo-a'});
});
after(async()=>{for(const c of clientes){await terminate(c.db);await deleteApp(c.app);}});
for(const mismo of [true,false])test(`REAL identidad: UID ${mismo?'=':'!='} usuarioId; no writes de binding`,async()=>{
 const c=await client('identidad-'+mismo),id=await identidad(c,{propietarioId:'prop-demo-a'},mismo);assert.equal((await c.repo.cargar(a)).identidad.usuarioId,id);
 await denegado(updateDoc(doc(c.db,'usuarios_auth',c.auth.currentUser.uid),{carterasL:['prop-demo-b'],carterasE:['prop-demo-b']}));
 await denegado(updateDoc(doc(c.db,'usuarios',id),{roles:['MASTER'],propietarioId:'prop-demo-b'}));
});
test('REAL sin binding no hay fallback usuarios/{uid}',async()=>{const c=await client('sin-binding');await admin(`usuarios/${c.auth.currentUser.uid}`,{propietarioId:'prop-demo-a'});await denegado(c.repo.cargar(a));});
for(const [nombre,atributos,l,e] of [
 ['titular',{propietarioId:'prop-demo-a'},true,true],['otro',{propietarioId:'prop-demo-b'},false,false],
 ['gestor-L',{tipoPerfil:'PROFESIONAL',carterasL:['prop-demo-a']},true,false],
 ['gestor-E',{tipoPerfil:'PROFESIONAL',carterasL:['prop-demo-a','prop-demo-b'],carterasE:['prop-demo-a']},true,true],
 ['revocado',{tipoPerfil:'PROFESIONAL',carterasL:['prop-demo-a'],carterasE:[]},true,false],
 ['sin-relacion',{tipoPerfil:'PROFESIONAL'},false,false],['admin',{tipoPerfil:'ADMINISTRADOR',roles:['MASTER'],permisos:['*']},false,false],
 ['master',{tipoPerfil:'ADMINISTRADOR'},true,true],['suspendido',{estado:'BLOQUEADO',propietarioId:'prop-demo-a'},false,false],
])test(`REAL matriz ${nombre}, propietario sin cuenta`,async()=>{
 const c=await fixture(nombre,atributos);const read=getDoc(doc(c.db,'operaciones',a.propietarioId));if(l)await read;else await denegado(read);
 if(e)await c.repo.ejecutar(a,cmd(c,0));else await denegado(c.repo.ejecutar(a,cmd(c,0)));
});
test('REAL anónimo: expediente, entidad y auditoría denegados',async()=>{const c=await client('anon');for(const path of ['operaciones/prop-demo-a','operaciones/prop-demo-a/entidades/proveedor~proveedor-demo','audit_logs/inexistente'])await denegado(getDoc(doc(c.db,path)));await denegado(setDoc(doc(c.db,'audit_logs','anon'),{resultado:'EXITO'}));});
test('REAL lectura histórica tras revocación; mismo usuario/token no conserva E',async()=>{
 const c=await fixture('historico',{tipoPerfil:'PROFESIONAL',carterasL:['prop-demo-a'],carterasE:['prop-demo-a']});await recorrido(c,9);const token=await c.auth.currentUser.getIdToken();
 await identidad(c,{tipoPerfil:'PROFESIONAL',carterasL:['prop-demo-a'],carterasE:[]});assert.equal((await c.repo.cargar(a)).estado.historial.length,9);assert.equal(await c.auth.currentUser.getIdToken(),token);await denegado(c.repo.ejecutar(a,cmd(c,9)));
});
test('REAL cross-owner y transferencia/borrado de titularidad denegados',async()=>{
 const c=await fixture();await denegado(getDoc(doc(c.db,'operaciones','prop-demo-b')));
 await denegado(updateDoc(doc(c.db,'inmuebles','inm-demo-1'),{propietarioPrincipalId:'prop-demo-b'}));await denegado(deleteDoc(doc(c.db,'inmuebles','inm-demo-1')));await denegado(deleteDoc(doc(c.db,'propietarios','prop-demo-a')));
});
test('REAL gestor E no crea titular ni altera su ficha fiscal',async()=>{const c=await fixture('E-S3',{tipoPerfil:'PROFESIONAL',carterasL:['prop-demo-a'],carterasE:['prop-demo-a']});await denegado(updateDoc(doc(c.db,'propietarios','prop-demo-a'),{nombre:'Cambio no autorizado'}));});
test('REAL audit: create autenticado, read solo master, update/delete incluso master denegados',async()=>{
 const c=await fixture(),master=await fixture('master',{tipoPerfil:'ADMINISTRADOR'});await recorrido(c,1);const id=idAuditoria(journey.historial[0]);
 await denegado(getDoc(doc(c.db,'audit_logs',id)));await denegado(getDocs(collection(c.db,'audit_logs')));assert.ok((await getDoc(doc(master.db,'audit_logs',id))).exists());
 for(const u of [c,master]){await denegado(updateDoc(doc(u.db,'audit_logs',id),{descripcion:'Alterado'}));await denegado(deleteDoc(doc(u.db,'audit_logs',id)));}
 await setDoc(doc(c.db,'audit_logs','audit-standalone-sintetica'),{id:'audit-standalone-sintetica',usuarioId:'actor-sintetico',accion:'PRUEBA',resultado:'EXITO'});
});
test('REAL 29 operaciones y replay: histórico/cierre/idempotencia sin lectura ordinaria de audit_logs',async()=>{
 const c=await fixture(),master=await fixture('master',{tipoPerfil:'ADMINISTRADOR'});await recorrido(c);const antes=await c.repo.cargar(a);await recorrido(c);const despues=await c.repo.cargar(a);assert.deepEqual(despues.estado,antes.estado);assert.equal(despues.estado.revision,29);assert.equal(despues.estado.entidades.find(e=>e.tipo==='incidencia').estado,'CERRADA');
 assert.equal((await getDocs(collection(master.db,'audit_logs'))).size,29);await assert.rejects(c.repo.ejecutar(a,{...cmd(c,0),motivo:'Modificado'}),/CONFLICTO_IDEMPOTENCIA/);
});
for(const fallo of ['sin-auditoria','sin-cabecera','sin-entidad','CAS','version','contador','payload','auditoria-incoherente','historial'])test(`REAL rechazo atómico: ${fallo}`,async()=>{
 const c=await fixture(),p=await propuesta(c);const opciones={};
 if(fallo==='sin-entidad')opciones.entidad=false;if(fallo==='sin-auditoria')opciones.auditoria=false;if(fallo==='sin-cabecera')opciones.cabecera=false;
 if(fallo==='CAS')p.head.revision=42;if(fallo==='version')p.row.registro.version=9;
 if(fallo==='contador')p.head.abiertasPorIncidencia.falso=1;if(fallo==='payload')p.row.registro.coberturaAutomatica=true;
 if(fallo==='auditoria-incoherente')p.log.detalles.propietarioId='prop-demo-b';if(fallo==='historial')p.row.versiones=[];
 await denegado(escribir(c,p,opciones));await vacio();
});
test('REAL referencia inexistente/cross-owner rechazada por Rules aunque se eluda el motor',async()=>{const c=await fixture(),p=await propuesta(c,5);await denegado(escribir(c,p));assert.equal(await evidencia(`operaciones/${a.propietarioId}`),null);});
test('REAL fallo transaccional inyectado: rollback de entidad, cabecera y audit',async()=>{
 const c=await fixture(),p=await propuesta(c);const {runTransaction}=await import('firebase/firestore');
 await assert.rejects(runTransaction(c.db,async(tx)=>{tx.set(doc(c.db,'operaciones',a.propietarioId),p.head);tx.set(doc(c.db,'audit_logs',p.log.id),p.log);throw new Error('Fallo controlado antes de commit');}),/Fallo controlado/);await vacio();
});
test('REAL límite financiero: diez conceptos pasan, once son rechazados por Rules',async()=>{
 const c=await fixture();await recorrido(c,9);const actual=await c.repo.cargar(a),h=structuredClone(journey.historial[7]);
 async function factura(cantidad){const id=`factura-${cantidad}`,conceptos=Array.from({length:cantidad},()=>({descripcion:'Línea sintética',importeCentimos:1}));
  const evento={...h,operacionId:`factura-op-${cantidad}`,actor:c.auth.currentUser.uid,revision:10,referencia:{tipo:'factura',id},antes:null,
   despues:{...h.despues,id,referencia:`F-${cantidad}`,importeCentimos:cantidad,conceptos},comando:{...h.comando,id,operacionId:`factura-op-${cantidad}`,actor:c.auth.currentUser.uid,revisionEsperada:9,datos:{...h.comando.datos,referencia:`F-${cantidad}`,importeCentimos:cantidad,conceptos}}};
  return {evento,head:cabeceraDe({...actual.estado,revision:10,entidades:[...actual.estado.entidades,evento.despues]},evento,actual.cabecera),row:{registro:evento.despues,auditId:idAuditoria(evento),versiones:[versionDe(evento)]},log:auditoriaDe(evento,actual.identidad)};
 }
 await denegado(escribir(c,await factura(11)));assert.equal((await c.repo.cargar(a)).estado.revision,9);await escribir(c,await factura(10));assert.equal((await c.repo.cargar(a)).estado.revision,10);
});
test('REAL CAS concurrente: solo una operación confirma y solo una auditoría se crea',async()=>{
 const c=await fixture(),p=await propuesta(c),q=await propuesta(c),sesion=(await c.repo.cargar(a)).identidad;
 q.evento.operacionId='op-concurrente';q.evento.comando.operacionId='op-concurrente';q.evento.comando.id='proveedor-concurrente';q.evento.referencia.id='proveedor-concurrente';q.evento.despues.id='proveedor-concurrente';
 q.row={registro:q.evento.despues,auditId:idAuditoria(q.evento),versiones:[versionDe(q.evento)]};q.log=auditoriaDe(q.evento,sesion);q.head=cabeceraDe({revision:1,entidades:[q.evento.despues]},q.evento);
 const results=await Promise.allSettled([escribir(c,p),escribir(c,q)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='permission-denied').length,1);
 assert.equal((await c.repo.cargar(a)).estado.revision,1);const master=await fixture('master',{tipoPerfil:'ADMINISTRADOR'});assert.equal((await getDocs(collection(master.db,'audit_logs'))).size,1);
});
test('REAL no cierra incidencia con actuaciones pendientes ni reescribe versiones anteriores',async()=>{
 const c=await fixture();await recorrido(c,11);const actual=await c.repo.cargar(a),old=actual.estado.entidades.find(e=>e.tipo==='incidencia');
 const comando={accion:'CAMBIAR_ESTADO',tipo:'incidencia',id:old.id,estado:'CANCELADA',operacionId:'cierre-ilegal',fecha:'2026-09-27T12:00:00.000Z',actor:c.auth.currentUser.uid,motivo:'Prueba sintética',revisionEsperada:11};
 const evento={comando,operacionId:comando.operacionId,fecha:comando.fecha,actor:comando.actor,motivo:comando.motivo,revision:12,ambito:a,referencia:{tipo:old.tipo,id:old.id},antes:old,despues:{...old,estado:'CANCELADA',version:old.version+1,actualizadoEn:comando.fecha}};
 const row=(await getDoc(doc(c.db,'operaciones',a.propietarioId,'entidades',`incidencia~${old.id}`))).data();
 const p={evento,head:cabeceraDe({...actual.estado,revision:12},evento,actual.cabecera),log:auditoriaDe(evento,actual.identidad),row:{registro:evento.despues,auditId:idAuditoria(evento),versiones:[...row.versiones,versionDe(evento)]}};
 await denegado(escribir(c,p));assert.equal((await c.repo.cargar(a)).estado.revision,11);
 await denegado(updateDoc(doc(c.db,'operaciones',a.propietarioId,'entidades',`incidencia~${old.id}`),{versiones:[]}));
});

// Estas negativas eluden el repositorio: la denegación debe proceder de Rules.
async function denegadoRules(p) {
 await assert.rejects(p,e=>{
  assert.doesNotMatch(e.message,/maximum of 1000|expressions to evaluate|maximum.*(?:expression|access call)/i,'Un límite de evaluación no demuestra una denegación de seguridad');
  return e.code==='permission-denied';
 });
}
for(const [nombre,atributos] of [
 ['L-directo',{tipoPerfil:'PROFESIONAL',carterasL:['prop-demo-a']}],
 ['revocado-directo',{tipoPerfil:'PROFESIONAL',carterasL:['prop-demo-a'],carterasE:[]}],
 ['suspendido-directo',{estado:'BLOQUEADO',propietarioId:'prop-demo-a'}],
 ['ajeno-directo',{propietarioId:'prop-demo-b'}],
 ['sin-relacion-directo',{tipoPerfil:'PROFESIONAL'}],
 ['E-fuera-L',{tipoPerfil:'PROFESIONAL',carterasL:[],carterasE:['prop-demo-a']}],
])test(`REAL SDK sin permiso no deja escrituras parciales: ${nombre}`,async()=>{
 const c=await fixture(nombre),p=await propuesta(c);
 await identidad(c,atributos); // mismo UID, mismo actor y payload; cambia solo la autoridad
 await denegadoRules(escribir(c,p));await vacio();
});
test('REAL SDK sin espejo no usa usuarios/UID aunque el perfil declare titularidad',async()=>{
 const c=await client('sin-binding-directo'),owner=await fixture(),p=await propuesta(owner);
 await admin(`usuarios/${c.auth.currentUser.uid}`,{tipoPerfil:'PROPIETARIO',estado:'ACTIVO',propietarioId:a.propietarioId});
 p.evento.actor=c.auth.currentUser.uid;p.evento.comando.actor=c.auth.currentUser.uid;
 p.row.versiones=[versionDe(p.evento)];p.log=auditoriaDe(p.evento,{uid:c.auth.currentUser.uid,usuarioId:c.auth.currentUser.uid,usuarioEmail:c.auth.currentUser.email,usuarioNombre:'Persona sintética'});
 await denegadoRules(escribir(c,p));await vacio();
});
test('REAL cabecera no puede avanzar referenciando una entidad anterior sin escribirla',async()=>{
 const c=await fixture(),p=await propuesta(c);await escribir(c,p);
 const anterior=await evidencia(`operaciones/${a.propietarioId}`);
 p.head.revision=2;p.head.ultimoEventoId='operaciones~prop-demo-a~cabecera-sola';
 p.log.id=p.head.ultimoEventoId;p.log.detalles.revision=2;p.log.detalles.operacionId='cabecera-sola';
 await denegadoRules(escribir(c,p,{entidad:false}));
 assert.deepEqual(await evidencia(`operaciones/${a.propietarioId}`),anterior);assert.equal(await evidencia(`audit_logs/${p.log.id}`),null);
});
test('REAL audit precreado no autoriza una nueva operación; contrato standalone intacto',async()=>{
 const c=await fixture(),p=await propuesta(c);
 await setDoc(doc(c.db,'audit_logs',p.log.id),{...p.log,registradoEn:serverTimestamp()});
 const anterior=await evidencia(`audit_logs/${p.log.id}`);
 await denegadoRules(escribir(c,p,{auditoria:false}));
 assert.equal(await evidencia(`operaciones/${a.propietarioId}`),null);
 assert.equal(await evidencia(`operaciones/${a.propietarioId}/entidades/proveedor~proveedor-demo`),null);
 assert.deepEqual(await evidencia(`audit_logs/${p.log.id}`),anterior);
});
test('REAL un evento no permite colar una segunda entidad en el mismo batch',async()=>{
 const c=await fixture(),p=await propuesta(c),otra=structuredClone(p.row);otra.registro.id='proveedor-colado';otra.versiones[0].registro.id='proveedor-colado';otra.versiones[0].comando.id='proveedor-colado';
 const batch=writeBatch(c.db);
 batch.set(doc(c.db,'operaciones',a.propietarioId),p.head);
 batch.set(doc(c.db,'audit_logs',p.log.id),{...p.log,registradoEn:serverTimestamp()});
 for(const row of [p.row,otra])batch.set(doc(c.db,'operaciones',a.propietarioId,'entidades',`proveedor~${row.registro.id}`),row);
 await denegadoRules(batch.commit());await vacio();assert.equal(await evidencia(`operaciones/${a.propietarioId}/entidades/proveedor~proveedor-colado`),null);
});
for(const campo of ['usuarioId','usuarioEmail','actorUid','revision','entidadId','propietarioId'])test(`REAL audit operativo fabricado denegado: ${campo}`,async()=>{
 const c=await fixture(),p=await propuesta(c);
 if(campo==='usuarioId'||campo==='usuarioEmail')p.log[campo]='suplantado';else p.log.detalles[campo]=campo==='revision'?99:'suplantado';
 await denegadoRules(escribir(c,p));await vacio();
});
