import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crearEvaluadorReglas } from './harness/firestoreRulesEval';
const rules=readFileSync(resolve(__dirname,'../firestore.rules'),'utf8');
const evalRules=crearEvaluadorReglas(rules).permite;
const auth={uid:'master',token:{email:'sarqsan2@gmail.com'}};
const docs: Record<string, Record<string,unknown>>={
 personas:{id:'p',nombre:'Ana',estado:'ACTIVA',estadoDatos:'INCOMPLETO',roles:[],propietarioIds:[],createdAt:'2026',updatedAt:'2026'},
 propietarios:{id:'o',nombre:'Ana'},
 usuarios:{id:'u',email:'u@test.local',tipoPerfil:'PROPIETARIO',estado:'ACTIVO',roles:[]},
 usuarios_auth:{uid:'uid',usuarioId:'u',email:'u@test.local',estado:'ACTIVO',tipoPerfil:'PROPIETARIO',roles:[]},
 gestiones_cartera:{id:'g',gestorUsuarioId:'u',propietarioId:'o'},
 enlaces_registro:{id:'e',tipoPerfil:'PROPIETARIO',activo:true,usosActuales:0},
};
const ids: Record<string,string>={personas:'p',propietarios:'o',usuarios:'u',usuarios_auth:'uid',gestiones_cartera:'g',enlaces_registro:'e'};
const audit=(ruta:string, uid='master')=>({'audit_logs/event':{id:'event',usuarioEmail:auth.token.email,resultado:'EXITO',
  detalles:{actorUid:uid,rutas:[ruta]}}});
describe('ROADMAP-01 · auditoría obligatoria en Rules',()=>{
 for (const [col,doc] of Object.entries(docs)) {
  it(`${col}: master no escribe sin evento nuevo; evento ajeno/repetido denegado; commit conjunto permitido`,()=>{
   const id=ids[col], ruta=`${col}/${id}`, incoming={...doc,roadmap01AuditId:'event'};
   const req={auth,db:{},docId:id,resource:null,requestResource:incoming};
   expect(evalRules(col,'create',req)).toBe(false);
   expect(evalRules(col,'create',{...req,after:audit(ruta,'otro')})).toBe(false);
   expect(evalRules(col,'create',{...req,db:audit(ruta),after:audit(ruta)})).toBe(false);
   expect(evalRules(col,'create',{...req,after:audit(ruta)})).toBe(true);
   expect(evalRules(col,'delete',{...req,resource:doc,requestResource:null})).toBe(false);
   expect(evalRules(col,'update',{...req,resource:doc,after:audit(ruta)})).toBe(true);
   expect(evalRules(col,'update',{...req,resource:{...doc,roadmap01AuditId:'event'},after:audit(ruta)})).toBe(false);
  });
 }
 it('vínculo Persona ↔ propietario ↔ cuenta requiere los tres extremos y un único log transaccional',()=>{
   const basePersona=docs.personas,owner={id:'o'},user={id:'u',email:'u@test.local',tipoPerfil:'PROPIETARIO',estado:'PENDIENTE',roles:[],propietarioId:'o'};
   const rutas=['personas/p','propietarios/o','usuarios/u'];
   const p={...basePersona,propietarioIds:['o'],usuarioId:'u',roadmap01AuditId:'event'};
   const o={...owner,personaId:'p',roadmap01AuditId:'event'};
   const u={...user,personaId:'p',roadmap01AuditId:'event'};
   const after={...audit(rutas[0]),'personas/p':p,'propietarios/o':o,'usuarios/u':u};
   (after['audit_logs/event'].detalles as {rutas:string[]}).rutas=rutas;
   const db={'propietarios/o':owner,'usuarios/u':user};
   expect(evalRules('personas','create',{auth,docId:'p',db,resource:null,requestResource:p,after})).toBe(true);
   expect(evalRules('propietarios','update',{auth,docId:'o',db,resource:owner,requestResource:o,after})).toBe(true);
   expect(evalRules('usuarios','update',{auth,docId:'u',db,resource:user,requestResource:u,after})).toBe(true);
   expect(evalRules('usuarios','update',{auth,docId:'u',db,resource:user,requestResource:u,
     after:{...after,'propietarios/o':{...owner,personaId:'otra'}}})).toBe(false);
 });
 it('no-owner no falsifica la marca de auditoría en perfil propio o espejo',()=>{
   const owner={uid:'uid',token:{email:'u@test.local'}};
   const existing={id:'u',authUid:'uid',email:'u@test.local',tipoPerfil:'PROPIETARIO',estado:'ACTIVO',roles:[],propietarioId:'o'};
   expect(evalRules('usuarios','update',{auth:owner,docId:'u',resource:existing,
     requestResource:{...existing,roadmap01AuditId:'event'},db:{},after:audit('usuarios/u')})).toBe(false);
 });
});
