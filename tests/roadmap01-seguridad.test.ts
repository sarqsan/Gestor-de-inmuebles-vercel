import { completarPerfilesSinteticos } from './harness/perfilesSinteticos';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
const original = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');
const emailMaster = original.match(/function\s+isMasterAdmin\(\)\s*\{[\s\S]*?'([^'@\s]+@[^'\s]+)'/)?.[1];
if (!emailMaster) throw new Error('Master desconocido');
const master = { uid: 'master', token: { email: emailMaster } };
const actor = { uid: 'prop', token: { email: 'prop@test.local' } };
const tenant = { uid: 'tenant', token: { email: 'tenant@test.local' } };
const propio = { id: 'inm_A', propietarioId: 'owner_A', propietarioPrincipalId: 'owner_A' };
const ajeno = { id: 'inm_B', propietarioId: 'owner_B', propietarioPrincipalId: 'owner_B' };
const db: Peticion['db'] = {
  'usuarios_auth/prop': { usuarioId: 'prop', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'owner_A', inmuebleIds: [], carterasL: [] },
  'usuarios/prop': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', authUid: 'prop' },
  'usuarios/tenant': { tipoPerfil: 'INQUILINO', estado: 'ACTIVO', authUid: 'tenant', contratoIds: [] },
  'usuarios_auth/manager': { usuarioId:'manager', tipoPerfil:'PROFESIONAL', estado:'ACTIVO', propietarioId:'', profesionalId:'prof', inmuebleIds:[], carterasL:['owner_A'], carterasE:['owner_A'] },
  'usuarios_auth/managerL': { usuarioId:'managerL', tipoPerfil:'PROFESIONAL', estado:'ACTIVO', propietarioId:'', profesionalId:'prof', inmuebleIds:[], carterasL:['owner_A'], carterasE:[] },
  'usuarios_auth/revoked': { usuarioId:'revoked', tipoPerfil:'PROFESIONAL', estado:'ACTIVO', propietarioId:'', profesionalId:'prof', inmuebleIds:[], carterasL:[], carterasE:[] },
  'usuarios_auth/blocked': { usuarioId:'blocked', tipoPerfil:'PROFESIONAL', estado:'BLOQUEADO', propietarioId:'', profesionalId:'prof', inmuebleIds:[], carterasL:['owner_A'], carterasE:['owner_A'] },
  'usuarios_auth/ownerManager': { usuarioId:'ownerManager', tipoPerfil:'PROPIETARIO', estado:'ACTIVO', propietarioId:'owner_B', inmuebleIds:[], carterasL:['owner_A'], carterasE:['owner_A'] },
  'inmuebles/inm_A': propio, 'inmuebles/inm_B': ajeno,
};
// Los fixtures históricos deben contener la ficha autoritativa del espejo.
completarPerfilesSinteticos(db);

const persona = { id: 'p', nombre: 'Ana', estado: 'ACTIVA', estadoDatos: 'INCOMPLETO', roles: [], propietarioIds: [], createdAt: '2026', updatedAt: '2026' };
const evento = (ruta:string) => ({'audit_logs/audit-r01':{id:'audit-r01',usuarioEmail:emailMaster,resultado:'EXITO',
  detalles:{actorUid:master.uid,rutas:[ruta]}}});
function permit(rules: string, col: string, verb: 'get'|'list'|'create'|'update'|'delete', auth: Peticion['auth'],
  resource: Peticion['resource'], requestResource: Peticion['requestResource'], docId: string): boolean {
  const ruta = `${col}/${docId}`;
  const auditId = 'audit-r01';
  const privilegio = auth?.token?.email === emailMaster && !!requestResource && (verb === 'create' || verb === 'update');
  const auditoria = {[`audit_logs/${auditId}`]:{id:auditId,usuarioEmail:emailMaster,resultado:'EXITO',
    detalles:{actorUid:auth?.uid,rutas:[ruta]}}};
  return crearEvaluadorReglas(rules).permite(col, verb, { auth, db, resource,
    requestResource: privilegio ? {...requestResource,roadmap01AuditId:auditId} : requestResource,
    after: privilegio ? auditoria : undefined, docId });
}
const run = (r: string) => ({
  personaGet: permit(r, 'personas', 'get', actor, persona, null, 'p'),
  personaCreate: crearEvaluadorReglas(r).permite('personas','create',{auth:actor,db,resource:null,
    requestResource:{...persona,roadmap01AuditId:'probe-event'},docId:'p',
    after:{'audit_logs/probe-event':{id:'probe-event',usuarioEmail:actor.token.email,resultado:'EXITO',
      detalles:{actorUid:actor.uid,rutas:['personas/p']}}}}),
  ownerGet: permit(r, 'propietarios', 'get', actor, { id: 'owner_B' }, null, 'owner_B'),
  inmuebleGet: permit(r, 'inmuebles', 'get', actor, ajeno, null, 'inm_B'),
  tenantGet: permit(r, 'inmuebles', 'get', tenant, ajeno, null, 'inm_B'),
});

describe('ROADMAP-01 · Rules efectivas (harness del fichero desplegable)', () => {
  it('matriz positiva/negativa: persona master, titular propio, gestor sin cartera y ajeno', () => {
    expect(run(original)).toEqual({ personaGet: false, personaCreate: false, ownerGet: false, inmuebleGet: false, tenantGet: false });
    expect(permit(original,'personas','get',master,persona,null,'p')).toBe(true);
    expect(permit(original,'personas','create',master,null,persona,'p')).toBe(true);
    expect(permit(original,'personas','delete',master,persona,null,'p')).toBe(false);
    expect(permit(original,'personas','create',master,null,{ ...persona, id:'otro' },'p')).toBe(false);
    expect(permit(original,'propietarios','get',actor,{ id: 'owner_A' },null,'owner_A')).toBe(true);
    expect(permit(original,'inmuebles','get',actor,propio,null,'inm_A')).toBe(true);
    expect(permit(original,'inmuebles','update',actor,ajeno,ajeno,'inm_B')).toBe(false);
    expect(permit(original,'gestiones_cartera','update',actor,{ propietarioId:'owner_B', gestorUsuarioId:'otro' },{ propietarioId:'owner_A', gestorUsuarioId:'prop' },'g')).toBe(false);
  });
  it('matriz propietario / gestor propietario / profesional: propio, gestionado y ajeno por recurso/acción', () => {
    const identities = {
      owner: actor, manager: { uid:'manager', token:{ email:'manager@test.local' } },
      ownerManager: { uid:'ownerManager', token:{ email:'owner-manager@test.local' } },
      managerL: { uid:'managerL', token:{ email:'manager-l@test.local' } },
      revoked: { uid:'revoked', token:{ email:'revoked@test.local' } },
      blocked: { uid:'blocked', token:{ email:'blocked@test.local' } },
    };
    const get = (uid: keyof typeof identities, resource: typeof propio) =>
      permit(original,'inmuebles','get',identities[uid],resource,null,resource.id);
    const update = (uid: keyof typeof identities, resource: typeof propio) =>
      permit(original,'inmuebles','update',identities[uid],resource,{ ...resource, direccion:'Nueva' },resource.id);
    for (const role of ['owner','manager','ownerManager','managerL','revoked','blocked'] as const) {
      const expected = { owner:[true,false], manager:[true,false], ownerManager:[true,true],
        managerL:[true,false], revoked:[false,false], blocked:[false,false] }[role];
      expect([get(role,propio),get(role,ajeno)], role).toEqual(expected);
    }
    expect(update('owner',propio)).toBe(true);
    expect(update('owner',ajeno)).toBe(false);
    expect(update('manager',propio)).toBe(true);
    expect(update('managerL',propio)).toBe(false);
    expect(update('revoked',propio)).toBe(false);
    expect(update('blocked',propio)).toBe(false);
    expect(permit(original,'propietarios','get',identities.manager,{id:'owner_A'},null,'owner_A')).toBe(true);
    expect(permit(original,'propietarios','get',identities.manager,{id:'owner_B'},null,'owner_B')).toBe(false);
    for (const id of ['manager','ownerManager','managerL','revoked','blocked'] as const) {
      expect(permit(original,'gestiones_cartera','update',identities[id],{ propietarioId:'owner_A',gestorUsuarioId:'manager' },{ propietarioId:'owner_B',gestorUsuarioId:id },'g')).toBe(false);
    }
    expect(permit(original,'inmuebles','delete',identities.manager,propio,null,'inm_A')).toBe(false);
  });
  it('personaId no es asignable ni modificable por cuenta/propietario ordinarios', () => {
    const o = { id:'owner_A', nombre:'Ana' };
    const u = { id:'prop', authUid:'prop', email:'prop@test.local', tipoPerfil:'PROPIETARIO', estado:'ACTIVO', roles:[], propietarioId:'owner_A' };
    expect(permit(original,'propietarios','create',actor,null,{ ...o, personaId:'p' },'owner_A')).toBe(false);
    expect(permit(original,'propietarios','update',actor,o,{ ...o, personaId:'p' },'owner_A')).toBe(false);
    expect(permit(original,'usuarios','update',actor,u,{ ...u, personaId:'p' },'prop')).toBe(false);
    expect(permit(original,'propietarios','update',master,o,{ ...o, personaId:'p' },'owner_A')).toBe(false);
    expect(crearEvaluadorReglas(original).permite('propietarios','update',{
      auth:master,db,docId:'owner_A',resource:o,requestResource:{ ...o,personaId:'p',roadmap01AuditId:'audit-r01' },
      after:{...evento('propietarios/owner_A'),'personas/p':{...persona,propietarioIds:['owner_A']},'propietarios/owner_A':{...o,personaId:'p'}}
    })).toBe(true);
  });
  it('el master tampoco puede forjar vínculos unilaterales mediante payload', () => {
    const o = {id:'owner_A',nombre:'Ana'};
    const u = {id:'prop',email:'prop@test.local',estado:'ACTIVO',tipoPerfil:'PROPIETARIO',roles:[],propietarioId:'owner_A'};
    expect(permit(original,'personas','create',master,null,{...persona,propietarioIds:['owner_A'],roles:['PROPIETARIO']},'p')).toBe(false);
    expect(permit(original,'usuarios','update',master,u,{...u,personaId:'p'},'prop')).toBe(false);
    const snap = {'personas/p':{...persona,usuarioId:'prop',propietarioIds:['owner_A'],roles:['PROPIETARIO']},
      'propietarios/owner_A':{...o,personaId:'p'}, 'usuarios/prop':{...u,personaId:'p'}};
    expect(crearEvaluadorReglas(original).permite('usuarios','update',{
      auth:master,db,docId:'prop',resource:u,requestResource:{...u,personaId:'p',roadmap01AuditId:'audit-r01'},
      after:{...snap,...evento('usuarios/prop')}
    })).toBe(true);
    expect(crearEvaluadorReglas(original).permite('usuarios','update',{
      auth:master,db,docId:'prop',resource:u,requestResource:{...u,personaId:'p',roadmap01AuditId:'audit-r01'},
      after:{...snap,...evento('usuarios/prop'),'propietarios/owner_A':{...o,personaId:'otra'}}
    })).toBe(false);
  });
  it('un perfil Persona no puede reescribir UID; legacy conserva el re-enlace de fase14', () => {
    const base = { id:'prop', authUid:'prop', email:'prop@test.local', tipoPerfil:'PROPIETARIO',
      estado:'ACTIVO', roles:[], propietarioId:'owner_A', personaId:'p' };
    expect(permit(original,'usuarios','update',actor,base,{ ...base, authUid:'otro' },'prop')).toBe(false);
    expect(permit(original,'usuarios','update',actor,base,{ ...base, nombre:'Nuevo' },'prop')).toBe(true);
    const legacy = { ...base }; delete (legacy as {personaId?:string}).personaId;
    expect(permit(original,'usuarios','update',actor,legacy,{ ...legacy, authUid:'otro' },'prop')).toBe(true);
  });
  it('mutar el veto de personaId abre vínculos forjados: el test los detecta', () => {
    const o = { id:'owner_A', nombre:'Ana' };
    const u = { id:'prop', authUid:'prop', email:'prop@test.local', tipoPerfil:'PROPIETARIO', estado:'ACTIVO', roles:[], propietarioId:'owner_A' };
    const probes = [
      { guard:"&& !('personaId' in incoming())", col:'propietarios', verb:'create' as const, old:null, next:{ ...o, personaId:'p' }, id:'owner_A' },
      { guard:"&& !incoming().diff(existing()).affectedKeys().hasAny(['personaId', 'roadmap01AuditId'])", col:'propietarios', verb:'update' as const, old:o, next:{ ...o, personaId:'p' }, id:'owner_A' },
      { guard:"'personaId',", col:'usuarios', verb:'update' as const, old:u, next:{ ...u, personaId:'p' }, id:'prop' },
    ];
    for (const p of probes) {
      expect(permit(original,p.col,p.verb,actor,p.old,p.next,p.id)).toBe(false);
      const inicio = original.indexOf(`match /${p.col}/{`);
      const fin = original.indexOf('\n    match /', inicio + 1);
      const bloque = original.slice(inicio, fin);
      expect(bloque.includes(p.guard)).toBe(true);
      const mutated = original.slice(0, inicio) + bloque.replace(p.guard, '') + original.slice(fin);
      expect(permit(mutated,p.col,p.verb,actor,p.old,p.next,p.id), p.col + p.verb).toBe(true);
    }
  });
  it('mutaciones adversariales: cada bypass cambia una decisión, nunca solo un string', () => {
    const cases: { label:string; col:string; from:string; to:string; key:keyof ReturnType<typeof run> }[] = [
      { label:'global persona', col:'personas', from:'allow get, list: if isMasterAdmin();', to:'allow get, list: if isStaff();', key:'personaGet' },
      { label:'rol sin ámbito persona', col:'personas', from:'allow create: if isMasterAdmin() && personaValida()', to:'allow create: if isSignedIn() && personaValida()', key:'personaCreate' },
      { label:'propietario incorrecto', col:'propietarios', from:'allow get: if isMasterAdmin() || ownsPropietario(propietarioId)', to:'allow get: if isMasterAdmin() || isPropietarioRole()', key:'ownerGet' },
      { label:'inmueble incorrecto', col:'inmuebles', from:'allow get: if esAdminInmuebles()\n        || inmuebleEsMio(resource.data)', to:'allow get: if esAdminInmuebles()\n        || isPropietarioRole()', key:'inmuebleGet' },
      { label:'bypass staff', col:'inmuebles', from:'|| inmuebleAutorizadoExplicito(inmuebleId)\n        || inmuebleEnCarteraGestionada(resource.data)', to:'|| inmuebleAutorizadoExplicito(inmuebleId)\n        || isStaff()', key:'inmuebleGet' },
      { label:'bypass tenant', col:'inmuebles', from:'|| inmuebleAutorizadoExplicito(inmuebleId)\n        || inmuebleEnCarteraGestionada(resource.data)', to:'|| inmuebleAutorizadoExplicito(inmuebleId)\n        || isTenant()', key:'tenantGet' },
      { label:'sin cartera', col:'inmuebles', from:'|| inmuebleAutorizadoExplicito(inmuebleId)\n        || inmuebleEnCarteraGestionada(resource.data)', to:'|| inmuebleAutorizadoExplicito(inmuebleId)\n        || activeUser()', key:'inmuebleGet' },
    ];
    for (const c of cases) {
      const inicio = original.indexOf(`match /${c.col}/{`);
      const fin = original.indexOf('\n    match /', inicio + 1);
      const bloque = original.slice(inicio, fin);
      expect(bloque.split(c.from).length, c.label).toBe(2);
      const mutated = original.slice(0, inicio) + bloque.replace(c.from, c.to) + original.slice(fin);
      expect(run(mutated)[c.key], `mutación no detectada: ${c.label}`).toBe(true);
      expect(run(original)[c.key], `control original: ${c.label}`).toBe(false);
    }
  });
});
