import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
const rules = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');
const permite = crearEvaluadorReglas(rules).permite;
const now = Date.parse('2026-09-28T10:00:00Z');
const auth = {uid:'uid-nuevo',token:{email:'ana@test.local',email_verified:true}};
const u = {id:'u', email:'ana@test.local',tipoPerfil:'PROPIETARIO',estado:'PENDIENTE',roles:['PROPIETARIO_ESTANDAR'],
  propietarioId:'o',permisos:[],inmuebleIds:[]};
const link = {id:'e', tipoPerfil:'PROPIETARIO',emailInvitado:'ana@test.local',activo:true,
  estadoInvitacion:'PENDIENTE',usuarioIdVinculado:'u',propietarioIdVinculado:'o',
  fechaCaducidadMs:now+86400000,usosMaximos:1,usosActuales:0};
const afterLink = {...link,estadoInvitacion:'ACEPTADA',usosActuales:1,roadmap01AuditId:'audit-accept'};
const active = {...u,estado:'ACTIVO',authUid:'uid-nuevo',enlaceRegistroId:'e',roadmap01AuditId:'audit-accept'};
const db: Peticion['db'] = {'usuarios/u':u,'enlaces_registro/e':link,'propietarios/o':{id:'o'}};
const audit = (uid:string,email:string,rutas:string[],id='audit-accept') => ({[`audit_logs/${id}`]:{
  id,usuarioEmail:email,resultado:'EXITO',detalles:{actorUid:uid,rutas}}});
const after = {'usuarios/u':active,'enlaces_registro/e':afterLink,
  ...audit(auth.uid,auth.token.email,['usuarios/u','enlaces_registro/e'])};
function can(col: string, verb:'create'|'update', resource: Peticion['resource'], requestResource:Peticion['requestResource'],
  opt: Partial<Peticion> = {}) {
  return permite(col,verb,{auth,docId:col==='usuarios'?'u':'e',db,after,timeMs:now,
    resource,requestResource,...opt});
}
describe('ROADMAP-01 · aceptación nominal Rules, con estado antes/después', () => {
  it('permite exclusivamente consumo y activación atómicos del invitado', () => {
    expect(can('usuarios','update',u,active)).toBe(true);
    expect(can('enlaces_registro','update',link,afterLink)).toBe(true);
    expect(can('enlaces_registro','create',null,link)).toBe(false);
  });
  it('deniega ausencia de transacción, expiración, revocación, propietario y UID manipulados', () => {
    expect(can('usuarios','update',u,active,{after:undefined})).toBe(false);
    expect(can('usuarios','update',u,active,{timeMs:now+2*86400000})).toBe(false);
    expect(can('usuarios','update',u,active,{db:{...db,'enlaces_registro/e':{...link,activo:false}}})).toBe(false);
    expect(can('usuarios','update',u,active,{db:{...db,'enlaces_registro/e':{...link,estadoInvitacion:'RECHAZADA'}}})).toBe(false);
    expect(can('usuarios','update',u,{...active,propietarioId:'otro'})).toBe(false);
    expect(can('usuarios','update',u,{...active,authUid:'uid-ajeno'})).toBe(false);
    expect(can('enlaces_registro','update',link,afterLink,{after:{...after,'usuarios/u':{...active,authUid:'otro'}}})).toBe(false);
    expect(can('usuarios','update',u,active,{db:{...db,'enlaces_registro/e':{...link,fechaCaducidadMs:undefined}}})).toBe(false);
    expect(can('usuarios','update',u,active,{db:{...db,'enlaces_registro/e':{...link,propietarioIdVinculado:'ajeno'}}})).toBe(false);
  });
  it('master solo puede resolver una pendiente, nunca reabrir, sobrescribir ni borrar una nominal', () => {
    const master = {uid:'master',token:{email:'sarqsan2@gmail.com'}};
    const opts = {auth:master,db:{...db,'usuarios/master':{tipoPerfil:'ADMIN',estado:'ACTIVO'}},
      after:audit(master.uid,master.token.email,['enlaces_registro/e'],'audit-master')};
    expect(can('enlaces_registro','update',link,{...link,activo:false,estadoInvitacion:'RECHAZADA',roadmap01AuditId:'audit-master'},opts)).toBe(true);
    expect(can('enlaces_registro','update',link,{...link,activo:false,estadoInvitacion:'REVOCADA',roadmap01AuditId:'audit-master'},opts)).toBe(true);
    expect(can('enlaces_registro','update',{...link,activo:false,estadoInvitacion:'REVOCADA'},link,opts)).toBe(false);
    expect(can('enlaces_registro','update',afterLink,{...link,activo:false,estadoInvitacion:'REVOCADA'},opts)).toBe(false);
    expect(can('enlaces_registro','update',link,{...link,emailInvitado:'otra@test.local'},opts)).toBe(false);
    expect(permite('enlaces_registro','delete',{...opts,docId:'e',resource:link,requestResource:null})).toBe(false);
  });
  it('master sin log, auditId reutilizado y evento ajeno quedan denegados', () => {
    const master={uid:'master',token:{email:'sarqsan2@gmail.com'}};
    const decision={...link,activo:false,estadoInvitacion:'REVOCADA',roadmap01AuditId:'audit-master'};
    expect(can('enlaces_registro','update',link,decision,{auth:master,after:{}})).toBe(false);
    expect(can('enlaces_registro','update',link,decision,{auth:master,
      db:{...db,'audit_logs/audit-master':{id:'audit-master'}} ,
      after:audit(master.uid,master.token.email,['enlaces_registro/e'],'audit-master')})).toBe(false);
    expect(can('enlaces_registro','update',link,decision,{auth:master,
      after:audit('otro',master.token.email,['enlaces_registro/e'],'audit-master')})).toBe(false);
  });
  it('mutación adversarial: bypass master global reabre invitación y la prueba lo detecta', () => {
    const mutadas = rules.replace("allow update: if (isMasterAdmin()\n        && auditoriaNueva(incoming(), existing(), 'enlaces_registro/' + enlaceId)",
      "allow update: if isMasterAdmin() || (isMasterAdmin()\n        && auditoriaNueva(incoming(), existing(), 'enlaces_registro/' + enlaceId)");
    expect(mutadas).not.toBe(rules);
    const master = {uid:'master',token:{email:'sarqsan2@gmail.com'}};
    const opts = {auth:master,docId:'e',db:{...db,'usuarios/master':{tipoPerfil:'ADMIN',estado:'ACTIVO'}},
      resource:{...link,activo:false,estadoInvitacion:'REVOCADA'},requestResource:link};
    expect(permite('enlaces_registro','update',opts)).toBe(false);
    expect(crearEvaluadorReglas(mutadas).permite('enlaces_registro','update',opts)).toBe(true);
  });
  it('invitar/consumir no da acceso por rol ni por isStaff/isTenant', () => {
    expect(can('enlaces_registro','update',link,{...link,propietarioIdVinculado:'otro'})).toBe(false);
    expect(can('usuarios','update',u,{...u,estado:'ACTIVO',authUid:'uid-nuevo',enlaceRegistroId:'e',roles:['GESTOR_PROFESIONAL']})).toBe(false);
    expect(can('enlaces_registro','update',link,afterLink,{auth:{uid:'inq',token:{email:'otro@test.local'}},
      db:{...db,'usuarios/inq':{tipoPerfil:'INQUILINO',estado:'ACTIVO',contratoIds:[]}}})).toBe(false);
  });
});
