import test from 'node:test';
import assert from 'node:assert/strict';
import { crearTransporteFirebase } from '../persistence/firebase.ts';
import { crearRepositorioOperativo } from '../persistence/repository.ts';
import { ejecutarRecorridoFicticio } from '../demo/recorrido.mjs';
import { CONTEXTO_FICTICIO } from '../demo/fixtures.ts';

// Ejercita el adaptador REAL con un SDK inyectado en memoria. No valida Firebase/Rules.
function sdkDoble(){
  let store=new Map([['usuarios_auth/actor-ficticio',{usuarioId:'usuario-negocio-distinto',estado:'ACTIVO',tipoPerfil:'PROPIETARIO',propietarioId:'prop-demo-a'}],['usuarios/usuario-negocio-distinto',{nombre:'Persona sintética'}],['propietarios/prop-demo-a',{nombre:'Ficticio'}],['inmuebles/inm-demo-1',{direccion:'Ficticia',propietarioPrincipalId:'prop-demo-a'}]]),fallo=false;
  const path=(...parts)=>parts.filter((x)=>x!==db).map((p)=>typeof p==='string'?p:p.path).join('/');
  const snapshot=(key,map=store)=>({id:key.split('/').at(-1),exists:()=>map.has(key),data:()=>structuredClone(map.get(key))});
  const sdk={
    doc:(...parts)=>({path:path(...parts)}),collection:(...parts)=>({path:path(...parts)}),where:(key,op,value)=>({key,op,value}),query:(ref,...filters)=>({...ref,filters}),serverTimestamp:()=> 'SERVER_TIMESTAMP_DOUBLE',
    getDoc:async(ref)=>snapshot(ref.path),
    getDocs:async(ref)=>{assert.notEqual(ref.path,'audit_logs','El lector ordinario no consulta auditoría');return {docs:[...store.keys()].filter((k)=>k.startsWith(ref.path+'/')&&k.split('/').length===ref.path.split('/').length+1).filter((k)=>(ref.filters??[]).every((f)=>store.get(k)[f.key]===f.value)).map((k)=>snapshot(k))};},
    async runTransaction(_,fn){const draft=structuredClone(store);let escribiendo=false;
      const result=await fn({get:async(ref)=>{assert.equal(escribiendo,false,'Lecturas deben preceder escrituras');return snapshot(ref.path,draft);},set:(ref,value)=>{escribiendo=true;if(fallo&&ref.path.startsWith('audit_logs/'))throw new Error('SDK auditoría fallida');draft.set(ref.path,structuredClone(value));}});store=draft;return result;},
  };
  const db={};return {sdk,db,get store(){return store;},set fallo(v){fallo=v;}};
}
const auth={currentUser:{uid:'actor-ficticio',getIdTokenResult:async()=>({claims:{propietarioId:'prop-demo-a'}})}};
const a=CONTEXTO_FICTICIO.ambito,journey=ejecutarRecorridoFicticio().estado;
test('adaptador Firebase concreto: contexto existente, lecturas filtradas y transacciones auditadas',async()=>{
  const f=sdkDoble(),r=crearRepositorioOperativo(crearTransporteFirebase(f.db,auth,f.sdk));
  for(const h of journey.historial)await r.ejecutar(a,h.comando);
  assert.deepEqual((await r.cargar(a)).estado,journey);
  assert.equal(f.store.get('operaciones/prop-demo-a').revision,29);
  const logs=[...f.store].filter(([k])=>k.startsWith('audit_logs/'));assert.equal(logs.length,29);assert.ok(logs.every(([,v])=>v.registradoEn==='SERVER_TIMESTAMP_DOUBLE'));
  for(const h of journey.historial)await r.ejecutar(a,h.comando);assert.equal([...f.store].filter(([k])=>k.startsWith('audit_logs/')).length,29);
});
test('adaptador concreto: fallo SDK de auditoría no persiste entidad ni cabecera',async()=>{
  const f=sdkDoble(),r=crearRepositorioOperativo(crearTransporteFirebase(f.db,auth,f.sdk));f.fallo=true;const antes=structuredClone(f.store);
  await assert.rejects(r.ejecutar(a,journey.historial[0].comando),/auditoría fallida/);assert.deepEqual(f.store,antes);
});
test('adaptador concreto: no infiere identidad cuando Firebase Auth no tiene usuario',async()=>{
  const f=sdkDoble(),r=crearRepositorioOperativo(crearTransporteFirebase(f.db,{currentUser:null},f.sdk));await assert.rejects(r.cargar(a),/lectura/);
});

test('adaptador concreto: revocación efectiva se lee del usuario, no de claims antiguos',async()=>{
  const f=sdkDoble(),r=crearRepositorioOperativo(crearTransporteFirebase(f.db,auth,f.sdk));
  await r.ejecutar(a,journey.historial[0].comando);
  f.store.set('usuarios_auth/actor-ficticio',{usuarioId:'usuario-negocio-distinto',estado:'ACTIVO',tipoPerfil:'PROFESIONAL',carterasL:['prop-demo-a'],carterasE:[]});
  assert.equal((await r.cargar(a)).estado.revision,1);
  await assert.rejects(r.ejecutar(a,journey.historial[1].comando),/escritura/);
  assert.equal(auth.currentUser.uid,'actor-ficticio'); // mismo UID/token, permisos actuales distintos
});
test('límite financiero del adaptador explícito, sin truncado y sin escrituras parciales',async()=>{
  const f=sdkDoble(),transport=crearTransporteFirebase(f.db,auth,f.sdk),antes=structuredClone(f.store);
  await assert.rejects(transport.transaccion('prop-demo-a',async(tx)=>{tx.guardarEntidad({despues:{tipo:'factura',id:'larga',conceptos:Array.from({length:11},()=>({descripcion:'Línea',importeCentimos:1}))}},'audit-ficticio');}),/máximo 10 conceptos/);
  assert.deepEqual(f.store,antes);
});

test('adaptador: UID distinto del usuario de negocio consume el binding existente sin conceder carteras',async()=>{
 const f=sdkDoble(),t=crearTransporteFirebase(f.db,auth,f.sdk),antes=structuredClone(f.store);const identidad=await t.identidad();
 assert.equal(identidad.uid,'actor-ficticio');assert.equal(identidad.usuarioId,'usuario-negocio-distinto');assert.deepEqual(f.store,antes);
});
test('adaptador: usuario sin binding no usa usuarios/{uid} como sustituto',async()=>{
 const f=sdkDoble();f.store.delete('usuarios_auth/actor-ficticio');f.store.set('usuarios/actor-ficticio',{propietarioId:'prop-demo-a',carterasE:['prop-demo-a']});
 assert.equal(await crearTransporteFirebase(f.db,auth,f.sdk).identidad(),null);
});
test('adaptador nativo: UID igual a usuarioId también pasa por usuarios_auth',async()=>{
 const f=sdkDoble();f.store.set('usuarios_auth/actor-ficticio',{usuarioId:'actor-ficticio',tipoPerfil:'PROPIETARIO',estado:'ACTIVO',propietarioId:'prop-demo-a'});f.store.set('usuarios/actor-ficticio',{nombre:'Perfil sintético'});
 const i=await crearTransporteFirebase(f.db,auth,f.sdk).identidad();assert.equal(i.usuarioId,i.uid);
});
