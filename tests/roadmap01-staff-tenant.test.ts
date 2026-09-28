import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import {crearEvaluadorReglas} from './harness/firestoreRulesEval';
const ev=crearEvaluadorReglas(readFileSync(resolve(__dirname,'../firestore.rules'),'utf8'));
const base={docId:'x',resource:null,requestResource:{},db:{} as Record<string,Record<string,unknown>>};
const auth=(uid:string)=>({uid,token:{email:`${uid}@test.local`}});
const test=(col:string,verb:'create'|'delete'|'get'|'list',uid:string,db=base.db,resource:Record<string,unknown>|null=null)=>
 ev.permite(col,verb,{...base,auth:auth(uid),db,resource,requestResource:{id:'x'}});
describe('ROADMAP-01 · isStaff/isTenant no depende solo de Auth',()=>{
 it('Auth recién creada sin perfil ni espejo no es staff en catálogo ni listado de enlaces',()=>{
   expect(test('profesionales','create','nuevo')).toBe(false);
   expect(test('enlaces_registro','list','nuevo')).toBe(false);
   const link={id:'x',tipoPerfil:'PROFESIONAL',roadmap01AuditId:'a'};
   const evento={id:'a',resultado:'EXITO',usuarioEmail:'nuevo@test.local',
     detalles:{actorUid:'nuevo',rutas:['enlaces_registro/x']}};
   expect(ev.permite('enlaces_registro','create',{...base,auth:auth('nuevo'),
     requestResource:link,after:{'audit_logs/a':evento}})).toBe(false);
   const db={'usuarios_auth/nuevo':{usuarioId:'p',tipoPerfil:'PROFESIONAL',estado:'ACTIVO'},
     'usuarios/p':{authUid:'nuevo',tipoPerfil:'PROFESIONAL',estado:'ACTIVO'}};
   expect(ev.permite('enlaces_registro','create',{...base,auth:auth('nuevo'),db,
     requestResource:link,after:{'audit_logs/a':evento}})).toBe(true);
   expect(ev.permite('enlaces_registro','create',{...base,auth:auth('nuevo'),db,
     requestResource:{...link,profesionalIdVinculado:'victima',emailInvitado:'nuevo@test.local'},
     after:{'audit_logs/a':evento}})).toBe(false);
   const previo={id:'x',tipoPerfil:'PROFESIONAL',profesionalIdVinculado:'victima',
     emailInvitado:'titular@test.local',roadmap01AuditId:'old'};
   expect(ev.permite('enlaces_registro','update',{...base,auth:auth('nuevo'),db,resource:previo,
     requestResource:{...previo,emailInvitado:'nuevo@test.local',roadmap01AuditId:'a'},
     after:{'audit_logs/a':evento}})).toBe(false);
 });
 it('el espejo inquilino con id de perfil distinto del UID nunca recibe derechos staff',()=>{
   const db={
     'usuarios_auth/t':{uid:'t',usuarioId:'perfil_t',tipoPerfil:'INQUILINO',estado:'ACTIVO'},
     'usuarios/perfil_t':{id:'perfil_t',authUid:'t',tipoPerfil:'INQUILINO',estado:'ACTIVO'},
   };
   expect(test('profesionales','create','t',db)).toBe(false);
   expect(test('slots_visita','delete','t',db,{id:'x'})).toBe(false);
 });
 it('inquilino con perfil id distinto del UID puede crear espejo veraz y leer solo su contrato',()=>{
   const perfil={id:'perfil_t',authUid:'t',email:'t@test.local',tipoPerfil:'INQUILINO',estado:'ACTIVO',roles:[],
     contratoIds:['ct_1']};
   const mirror={uid:'t',usuarioId:'perfil_t',email:perfil.email,tipoPerfil:'INQUILINO',estado:'ACTIVO',roles:[],
     propietarioId:'',profesionalId:'',inmuebleIds:[]};
   const db={'usuarios/perfil_t':perfil};
   expect(ev.permite('usuarios_auth','create',{...base,auth:auth('t'),db,docId:'t',requestResource:mirror})).toBe(true);
   const after={...db,'usuarios_auth/t':mirror};
   expect(ev.permite('contratos_formalizacion','get',{...base,auth:auth('t'),db:after,docId:'ct_1',resource:{id:'ct_1'}})).toBe(true);
   expect(ev.permite('contratos_formalizacion','get',{...base,auth:auth('t'),db:after,docId:'ct_2',resource:{id:'ct_2'}})).toBe(false);
 });
 it('UID antiguo con espejo activo no retiene la cartera tras re-enlace del perfil',()=>{
   const db={
     'usuarios_auth/old':{usuarioId:'p',tipoPerfil:'PROPIETARIO',estado:'ACTIVO',propietarioId:'owner'},
     'usuarios/p':{id:'p',authUid:'new',tipoPerfil:'PROPIETARIO',estado:'ACTIVO'},
   };
   expect(ev.permite('inmuebles','get',{...base,auth:auth('old'),db,docId:'house',
     resource:{id:'house',propietarioId:'owner'}})).toBe(false);
   expect(test('profesionales','create','old',db)).toBe(false);
 });
 it('alta propia nunca acepta email de tercero ni permisos administrativos autodeclarados',()=>{
   const perfil={id:'p',authUid:'u',email:'u@test.local',tipoPerfil:'PROPIETARIO',estado:'ACTIVO',roles:[],permisos:[]};
   const req=(usuario:Record<string,unknown>)=>ev.permite('usuarios','create',
     {...base,auth:auth('u'),db:{},docId:'p',requestResource:usuario});
   expect(req(perfil)).toBe(true);
   expect(req({...perfil,email:'tercero@test.local'})).toBe(false);
   expect(req({...perfil,permisos:['usuarios.gestionar']})).toBe(false);
 });
 it('ficha profesional existente solo se vincula con invitación nominal al email Auth',()=>{
   const perfil={id:'p',authUid:'u',email:'u@test.local',tipoPerfil:'PROFESIONAL',estado:'ACTIVO',
     roles:['PROFESIONAL_MANTENIMIENTO'],permisos:['profesionales.ver'],profesionalId:'prof_ajeno',enlaceRegistroId:'inv'};
   const db={'profesionales/prof_ajeno':{id:'prof_ajeno'}};
   const req=(extra:Record<string,Record<string,unknown>>)=>ev.permite('usuarios','create',
     {...base,auth:auth('u'),db:{...db,...extra},docId:'p',requestResource:perfil});
   expect(req({})).toBe(false);
   expect(req({'enlaces_registro/inv':{id:'inv',activo:true,tipoPerfil:'PROFESIONAL',
     profesionalIdVinculado:'prof_ajeno',emailInvitado:'otro@test.local'}})).toBe(false);
   expect(req({'enlaces_registro/inv':{id:'inv',activo:true,tipoPerfil:'PROFESIONAL',
     profesionalIdVinculado:'prof_ajeno',emailInvitado:'u@test.local'}})).toBe(true);
 });
 it('no perfil / espejo falso o bloqueado tampoco asciende a staff',()=>{
   for (const estado of ['BLOQUEADO','ACTIVO']) {
     const db={
       'usuarios_auth/u':{usuarioId:'p',tipoPerfil:'PROFESIONAL',estado:'ACTIVO'},
       'usuarios/p':{authUid:estado==='ACTIVO'?'otro':'u',tipoPerfil:'PROFESIONAL',estado},
     };
     expect(test('profesionales','create','u',db)).toBe(false);
   }
 });
});
