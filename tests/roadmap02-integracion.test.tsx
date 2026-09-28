/** @vitest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { InvitacionCarteraView } from '../src/components/InvitacionCarteraView';
import { OnboardingCarterasAdmin } from '../src/components/admin/OnboardingCarterasAdmin';
import { CarterasOnboardingPanel } from '../src/components/CarterasOnboardingPanel';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { crearEvaluadorReglas } from './harness/firestoreRulesEval';
import { crearEvaluadorStorage } from './harness/storageRulesEval';

// Real service callbacks + optimistic transaction retry + actual Rules text.
// This is NOT the Firebase Emulator: lookup budgets still need the official engine.
const m = vi.hoisted(() => ({
  db: {} as Record<string, any>, seq: 0, version: 0, failure: false, retries: 0,
  beforeCommit: null as null | ((auth: any) => Promise<void>),
  actor: { currentUser: { uid: 'master', email: 'sarqsan2.com', emailVerified: true } as any },
  authorize: null as null | ((before: Record<string, any>, after: Record<string, any>, writes: string[], auth: any) => void),
}));
vi.mock('../src/lib/firebase', () => ({ auth: m.actor, db: {}, sanitizeObjectForFirestore: (v: unknown) => JSON.parse(JSON.stringify(v)) }));
vi.mock('../src/lib/authService', () => ({ syncAuthIndex: vi.fn() }));
const fb = vi.hoisted(() => ({ signIn: vi.fn(), create: vi.fn(), verify: vi.fn() }));
vi.mock('firebase/auth', () => ({ signInWithEmailAndPassword: fb.signIn, createUserWithEmailAndPassword: fb.create, sendEmailVerification: fb.verify }));
vi.mock('firebase/firestore', () => {
  const snap = (path: string, db = m.db) => ({ id: path.split('/').at(-1)!, exists: () => !!db[path], data: () => db[path] });
  return {
    collection: (_db: unknown, path: string) => ({ path }),
    doc: (...args: any[]) => { const path = args.length === 1 ? `${args[0].path}/a${++m.seq}` : `${args[1]}/${args[2]}`; return { path, id: path.split('/').at(-1) }; },
    where: (field: string, op: string, val: any) => ({ field, op, val }),
    query: (col: any, ...filters: any[]) => ({ ...col, filters }),
    getDoc: async (ref: any) => {
      const [col, docId] = ref.path.split('/');
      if (!evaluator(col, 'get', {auth: m.actor.currentUser ? actorAuth() : null, db: m.db, docId, resource: m.db[ref.path] || null, requestResource: null})) throw Error('Rules denied read ' + ref.path);
      return snap(ref.path);
    },
    getDocs: async (ref: any) => {
      assertQuery(ref, m.actor.currentUser ? actorAuth() : null);
      const docs = Object.keys(m.db).filter(p => p.startsWith(ref.path + '/') && (ref.filters || []).every((f: any) => m.db[p][f.field] === f.val)).map(p => snap(p));
      for (const d of docs) if (!evaluator(ref.path, 'list', {auth: m.actor.currentUser ? actorAuth() : null, db: m.db, docId:d.id, resource:d.data(), requestResource:null})) throw Error('Rules denied list ' + ref.path);
      return { docs, empty: docs.length === 0 };
    },
    runTransaction: async (_db: unknown, fn: any) => {
      // Pin the authenticated principal per request, not the shared mock session.
      const requestAuth = m.actor.currentUser ? actorAuth() : null;
      for (let retry = 0; retry < 20; retry++) {
        const version = m.version, before = structuredClone(m.db), after = structuredClone(m.db), writes: string[] = [];
        let writing = false;
        const result = await fn({
          get: async (ref: any) => {
            if (writing) throw Error('Read after write');
            const [col, docId] = ref.path.split('/');
            if (!evaluator(col, 'get', {auth: requestAuth, db: before, docId, resource:before[ref.path] || null, requestResource:null})) throw Error('Rules denied transaction read ' + ref.path);
            return snap(ref.path, before);
          },
          set: (ref: any, data: any) => { writing = true; after[ref.path] = data; writes.push(ref.path); },
          update: (ref: any, data: any) => { writing = true; if (!before[ref.path]) throw Error('Missing update'); after[ref.path] = { ...before[ref.path], ...data }; writes.push(ref.path); },
        });
        await new Promise(resolve => setTimeout(resolve, 1));
        await m.beforeCommit?.(requestAuth);
        if (version !== m.version) { m.retries++; continue; }
        if (m.failure) { m.failure = false; throw Error('Injected network failure'); }
        m.authorize?.(before, after, writes, requestAuth);
        if (writes.length) { m.db = after; m.version++; }
        return result;
      }
      throw Error('Retry limit');
    },
  };
});
import { cargarCarterasOnboarding, aceptarOnboardingConCredenciales, invitarCarteraFirestore, prepararOnboardingPropietarioFirestore, resolverInvitacionCarteraFirestore } from '../src/lib/onboardingCarterasFirebase';
import { crearGestion } from '../src/lib/gestionesCartera';
import { proyectarCarterasGestionadas } from '../src/lib/carterasGestion';
const rules = readFileSync('firestore.rules', 'utf8'), storage = readFileSync('storage.rules', 'utf8');
const evaluator = crearEvaluadorReglas(rules).permite;
const storageEval = crearEvaluadorStorage(storage, rules).permiteStorage;
// Conservative query proof for this flow. Evaluate a synthetic potential result
// containing ONLY equality constraints, before reading fixtures (including empty
// collections). Unsupported query syntax fails loudly, never becomes allow-all.
function assertQuery(ref: any, auth: any) {
  if (auth?.token.email === 'sarqsan2@gmail.com') return;
  const key = ref.path === 'gestiones_cartera' ? 'gestorUsuarioId' : ref.path === 'inmuebles' ? 'propietarioId' : null;
  if (!key) throw Error('HARNESS NO CUBRE query ' + ref.path);
  if (ref.filters?.length !== 1 || ref.filters[0].field !== key || ref.filters[0].op !== '==' || typeof ref.filters[0].val !== 'string')
    throw Error('Query no demuestra ámbito');
  const resource = {[key]:ref.filters[0].val};
  if (!evaluator(ref.path, 'list', {auth, db:m.db, docId:'potential-result', resource, requestResource:null}))
    throw Error('Rules denied query ' + ref.path);
}
const actorAuth = () => ({ uid: m.actor.currentUser.uid, token: { email: m.actor.currentUser.email, email_verified: m.actor.currentUser.emailVerified } });
const master = () => { m.actor.currentUser = { uid: 'master', email: 'sarqsan2@gmail.com', emailVerified: true }; };
const recipient = () => { m.actor.currentUser = { uid: 'auth-owner', email: 'ana@example.es', emailVerified: true, reload: vi.fn(), getIdToken: vi.fn() }; };
const gestor = () => { m.actor.currentUser = { uid: 'auth-gestor', email: 'gestor@example.es', emailVerified: true }; };
const auditCount = () => Object.keys(m.db).filter(p => p.startsWith('audit_logs/')).length;
const alta = () => prepararOnboardingPropietarioFirestore({ propietarioId: 'o', nombre: 'Ana', email: 'ana@example.es' });
const preparar = async (scope = ['i']) => {
  const r = await alta();
  m.db['usuarios/g'] = { id: 'g', estado: 'ACTIVO', authUid: 'auth-gestor', tipoPerfil: 'PROPIETARIO', roles: ['GESTOR_PATRIMONIAL'], email: 'gestor@example.es' };
  m.db['usuarios_auth/auth-gestor'] = { uid: 'auth-gestor', usuarioId: 'g', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', roles: ['GESTOR_PATRIMONIAL'], email: 'gestor@example.es', propietarioId: '', profesionalId: '', inmuebleIds: [] };
  m.db['inmuebles/i'] = { id: 'i', propietarioId: 'o', descripcion: 'Casa' };
  m.db['inmuebles/otro'] = { id: 'otro', propietarioId: 'o', descripcion: 'Privado' };
  const enlace = await invitarCarteraFirestore({ enlaceId: 'e', propietarioId: 'o', usuarioId: r.usuarioId!, gestorUsuarioId: 'g', inmuebleIds: scope, permiso: 'LECTURA_ESCRITURA' });
  return { r, enlace };
};
const can = (col: string, op: 'get'|'list'|'create'|'update'|'delete', id: string, requestResource: any = null, after = m.db) => evaluator(col, op, {
  auth: actorAuth(), db: m.db, after, timeMs: Date.now(), docId: id, resource: m.db[`${col}/${id}`] || null, requestResource,
});
beforeEach(() => {

  m.db = {}; m.seq = 0; m.version = 0; m.failure = false; m.retries = 0; master(); vi.clearAllMocks();
  m.beforeCommit = null;
  m.authorize = (db, after, writes, requestAuth) => {
    for (const path of writes) {
      const [col, docId] = path.split('/');
      const ok = evaluator(col, db[path] ? 'update' : 'create', { auth: requestAuth, db, after, timeMs: Date.now(), docId, resource: db[path] || null, requestResource: after[path] });
      if (!ok) throw new Error(`Rules denied ${path}`);
    }
  };
});

afterEach(() => {cleanup(); vi.restoreAllMocks();});
// The 33 original tests remain unchanged. This stricter companion executes UI
// events against real services, optimistic commits AND read/write Rules.
describe('ROADMAP-02 · UI integrada y lecturas autorizadas', () => {
  it('alta → invitación → aceptación → vínculo → cartera parcial, desde controles reales', async () => {
    await preparar(); // existing owner and manager for the admin form
    delete m.db['enlaces_registro/e']; delete m.db['gestiones_cartera/o~g'];
    const owner = m.db['propietarios/o'];
    render(<OnboardingCarterasAdmin propietarios={[owner]} usuarios={[m.db['usuarios/g']]} inmuebles={[m.db['inmuebles/i'],m.db['inmuebles/otro']]} />);
    fireEvent.change(screen.getByLabelText('Propietario'), {target:{value:'o'}});
    fireEvent.change(screen.getByLabelText('Correo del titular'), {target:{value:'ana@example.es'}});
    fireEvent.change(screen.getByLabelText('Gestor'), {target:{value:'g'}});
    fireEvent.click(screen.getByLabelText('i — Casa'));
    fireEvent.click(screen.getByRole('button',{name:'Preparar e invitar'}));
    await screen.findByText('Invitación creada. Ningún acceso delegado hasta la aceptación.');
    const link = Object.values(m.db).find((d:any)=>d.finalidad==='ONBOARDING_CARTERA');
    expect(link.alcanceInmuebleIds).toEqual(['i']);
    cleanup(); m.actor.currentUser=null;
    fb.signIn.mockImplementationOnce(async()=>recipient());
    const done=vi.fn();render(<InvitacionCarteraView enlaceId={link.id} onComplete={done} onCancel={()=>{}} />);
    fireEvent.change(screen.getByLabelText('Correo invitado'),{target:{value:'ana@example.es'}});
    fireEvent.change(screen.getByLabelText('Contraseña'),{target:{value:'secret123'}});
    fireEvent.click(screen.getByRole('button',{name:'Consultar / verificar correo'}));
    await screen.findByText('Revisa antes de decidir');
    expect(screen.getByText('Alcance: i')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Aceptar / recuperar operación'}));
    await screen.findByRole('status');expect(m.db['enlaces_registro/'+link.id].estadoInvitacion).toBe('ACEPTADA');
    fireEvent.click(screen.getByRole('button',{name:'Entrar en mi espacio'}));
    expect(done.mock.calls[0][0]).toMatchObject({estado:'ACTIVO',personaId:owner.personaId,authUid:'auth-owner'});
    cleanup();gestor();render(<CarterasOnboardingPanel usuario={m.db['usuarios/g']} />);
    await screen.findByText('i — Casa');expect(screen.queryByText(/Privado/)).toBeNull();
    expect(m.db['usuarios_auth/auth-gestor'].carterasL).toEqual([]);
  });
  it('UI preserva Auth y permite recuperar un commit fallido sin doble consumo', async()=>{
    await preparar();recipient();const original=m.actor.currentUser;
    render(<InvitacionCarteraView enlaceId="e" onComplete={()=>{}} onCancel={()=>{}} />);
    fireEvent.change(screen.getByLabelText('Correo invitado'),{target:{value:'ana@example.es'}});
    fireEvent.change(screen.getByLabelText('Contraseña'),{target:{value:'secret123'}});
    fireEvent.click(screen.getByRole('button',{name:'Consultar / verificar correo'}));
    await screen.findByText('Revisa antes de decidir');m.failure=true;
    fireEvent.click(screen.getByRole('button',{name:'Aceptar / recuperar operación'}));
    expect((await screen.findByRole('alert')).textContent).toContain('No borres');
    expect(m.actor.currentUser).toBe(original);
    fireEvent.click(screen.getByRole('button',{name:'Aceptar / recuperar operación'}));
    await screen.findByRole('status');expect(m.db['enlaces_registro/e'].usosActuales).toBe(1);
  });
  it('cuenta sin delegación usa la misma invitación segura y activa sin G ficticia',async()=>{
    const a=await alta();await invitarCarteraFirestore({enlaceId:'solo',propietarioId:'o',usuarioId:a.usuarioId!});
    recipient();await aceptarOnboardingConCredenciales('solo','ana@example.es','secret');
    expect(m.db['enlaces_registro/solo'].estadoInvitacion).toBe('ACEPTADA');
    expect(Object.keys(m.db).filter(k=>k.startsWith('gestiones_cartera/'))).toEqual([]);
  });
  it('invitación privada deniega lectura anónima y UID distinto aunque email coincida',async()=>{
    const {r}=await preparar();m.actor.currentUser=null;
    expect(evaluator('enlaces_registro','get',{auth:null,db:m.db,docId:'e',resource:m.db['enlaces_registro/e'],requestResource:null})).toBe(false);
    recipient();m.db['usuarios/'+r.usuarioId].authUid='otro';expect(can('enlaces_registro','get','e')).toBe(false);
  });
  it.each(['RECHAZADA','REVOCADA'] as const)('doble %s concurrente es un solo commit terminal',async decision=>{
    await preparar();if(decision==='RECHAZADA')recipient();const n=auditCount();
    await Promise.all([resolverInvitacionCarteraFirestore('e',decision),resolverInvitacionCarteraFirestore('e',decision)]);
    expect(auditCount()).toBe(n+1);expect(m.db['enlaces_registro/e'].estadoInvitacion).toBe(decision);
  });
  it('aceptación contra expiración al vencer: gana expiración, nunca estado dividido',async()=>{
    await preparar();m.db['enlaces_registro/e'].fechaCaducidadMs=Date.now()-1;
    // The same admin actor cannot impersonate the recipient; calls are still concurrent.
    const results=await Promise.allSettled([resolverInvitacionCarteraFirestore('e','ACEPTADA'),resolverInvitacionCarteraFirestore('e','EXPIRADA')]);
    expect(results.map(x=>x.status)).toEqual(['rejected','fulfilled']);
    expect(m.db['enlaces_registro/e'].estadoInvitacion).toBe('EXPIRADA');expect(m.db['gestiones_cartera/o~g'].estado).toBe('PENDIENTE_ACEPTACION');
  });
  it('UI de invitación propia se carga solo tras autenticar; no existe lectura anónima/A/B',async()=>{
    const {r,enlace}=await preparar();
    m.actor.currentUser=null;
    expect(evaluator('enlaces_registro','get',{auth:null,db:m.db,docId:enlace.id,resource:{...enlace},requestResource:null})).toBe(false);
    expect(evaluator('usuarios','get',{auth:null,db:m.db,docId:r.usuarioId,resource:m.db['usuarios/'+r.usuarioId],requestResource:null})).toBe(false);
    recipient();
    expect(evaluator('usuarios','get',{auth:actorAuth(),db:m.db,docId:r.usuarioId,resource:m.db['usuarios/'+r.usuarioId],requestResource:null})).toBe(true);
    expect(evaluator('enlaces_registro','get',{auth:actorAuth(),db:m.db,docId:enlace.id,resource:{...enlace},requestResource:null})).toBe(true);
    gestor();expect(evaluator('usuarios','get',{auth:actorAuth(),db:m.db,docId:r.usuarioId,resource:m.db['usuarios/'+r.usuarioId],requestResource:null})).toBe(false);
    expect(evaluator('enlaces_registro','get',{auth:actorAuth(),db:m.db,docId:enlace.id,resource:{...enlace},requestResource:null})).toBe(false);
  });
  it('reanudación tras pasos Firestore ya confirmados conserva Persona/usuario/IDs',async()=>{
    const a=await alta();m.failure=true;
    await expect(invitarCarteraFirestore({enlaceId:'solo',propietarioId:'o',usuarioId:a.usuarioId!})).rejects.toThrow(/network/);
    expect(await alta()).toEqual(a);
    await invitarita(a.usuarioId!);
    expect(Object.keys(m.db).filter(p=>p.startsWith('usuarios/'))).toHaveLength(1);
    function invitarita(usuarioId:string){return invitarCarteraFirestore({enlaceId:'solo',propietarioId:'o',usuarioId});}
  });
  it('rechaza G aislada, replay, relink a invitación ajena, y auditoría discordante',async()=>{
    await preparar();recipient();const old=structuredClone(m.db);await resolverInvitacionCarteraFirestore('e','ACEPTADA');
    const after=structuredClone(m.db), g=after['gestiones_cartera/o~g'];
    const req={auth:actorAuth(),db:old,after,docId:'o~g',resource:old['gestiones_cartera/o~g'],requestResource:g};
    expect(evaluator('gestiones_cartera','update',req)).toBe(true);
    expect(evaluator('gestiones_cartera','update',{...req,after:old})).toBe(false);
    expect(evaluator('gestiones_cartera','update',{...req,db:after,resource:g})).toBe(false);
    expect(evaluator('gestiones_cartera','update',{...req,requestResource:{...g,enlaceRegistroId:'otra'}})).toBe(false);
    expect(evaluator('gestiones_cartera','update',{...req,after:{...after,'enlaces_registro/e':{...after['enlaces_registro/e'],estadoInvitacion:'RECHAZADA'}}})).toBe(false);
    expect(evaluator('gestiones_cartera','update',{...req,requestResource:{...g,roadmap01AuditId:'otra'}})).toBe(false);
    expect(evaluator('gestiones_cartera','update',{...req,requestResource:{...g,eventos:[...g.eventos].reverse()}})).toBe(false);
  });
  it('cartera completa obtiene acceso vivo; reducción de permiso y revocación se aplican sin refrescar índice',async()=>{
    await preparar([]);recipient();await resolverInvitacionCarteraFirestore('e','ACEPTADA');gestor();
    expect(can('inmuebles','list','i')).toBe(true);expect(can('propietarios','get','o')).toBe(true);
    expect(can('inmuebles','update','i',{...m.db['inmuebles/i'],descripcion:'x'})).toBe(true);
    m.db['gestiones_cartera/o~g'].permiso='LECTURA';
    expect(can('inmuebles','update','i',{...m.db['inmuebles/i'],descripcion:'x'})).toBe(false);
    m.db['gestiones_cartera/o~g'].estado='REVOCADA';expect(can('inmuebles','get','i')).toBe(false);
  });
});

describe('R02 cierre · autorización real y consultas potenciales', () => {
  it('A no lee ficha B, ni invitación B por get/list; B verificado sí lee la propia', async () => {
    const {r}=await preparar();gestor();
    expect(can('usuarios','get',r.usuarioId!)).toBe(false);
    expect(can('usuarios','list',r.usuarioId!)).toBe(false);
    expect(can('enlaces_registro','get','e')).toBe(false);
    expect(can('enlaces_registro','list','e')).toBe(false);
    recipient();expect(can('usuarios','get',r.usuarioId!)).toBe(true);
    expect(can('enlaces_registro','get','e')).toBe(true);
    expect(can('propietarios','get','o')).toBe(false);
    expect(can('personas','get',r.personaId)).toBe(false);
    m.actor.currentUser.emailVerified=false;
    expect(can('usuarios','get',r.usuarioId!)).toBe(false);
    expect(can('enlaces_registro','get','e')).toBe(false);
    m.actor.currentUser.emailVerified=true;
    m.db['usuarios/'+r.usuarioId].authUid='otro-uid';
    expect(can('usuarios','get',r.usuarioId!)).toBe(false);
    expect(can('enlaces_registro','get','e')).toBe(false);
  });
  it('ID coincidente sin binding y rol administrativo/patrimonial no autorizan datos ajenos',async()=>{
    const {r}=await preparar();gestor();
    m.actor.currentUser.uid=r.usuarioId;
    expect(can('usuarios','get',r.usuarioId!)).toBe(false);
    gestor();m.db['usuarios/g'].roles=['ADMINISTRADOR','GESTOR_PATRIMONIAL'];
    delete m.db['usuarios_auth/auth-gestor'].gestionesPorPropietario;
    expect(can('usuarios','get',r.usuarioId!)).toBe(false);
    expect(can('inmuebles','get','i')).toBe(false);
  });
  it.each(['propietarioId','personaId','authUid','estado','inmuebleIds','carterasE','gestionesPorPropietario'])('ficha propia no permite alterar %s',async campo=>{
    const {r}=await preparar();recipient();await resolverInvitacionCarteraFirestore('e','ACEPTADA');
    expect(can('usuarios','update',r.usuarioId!,{...m.db['usuarios/'+r.usuarioId],[campo]:'forjado'})).toBe(false);
  });
  it.each(['propietarioIdVinculado','personaIdVinculada','usuarioIdVinculado','gestionId','alcanceInmuebleIds','estadoInvitacion'])('invitación no permite alterar %s',async campo=>{
    await preparar();recipient();
    expect(can('enlaces_registro','update','e',{...m.db['enlaces_registro/e'],[campo]:'forjado'})).toBe(false);
  });
  it('queries usan identidad del espejo y prueba de resultado potencial, nunca filtrado post-lectura',async()=>{
    await preparar();recipient();await resolverInvitacionCarteraFirestore('e','ACEPTADA');gestor();
    const own=m.db['usuarios/g'];expect((await cargarCarterasOnboarding(own))[0].inmuebles.map(i=>i.id)).toEqual(['i']);
    await expect(cargarCarterasOnboarding({...own,id:'otro'})).rejects.toThrow(/Identidad/);
    const query=(field:string,val:string)=>({path:'inmuebles',filters:[{field,op:'==',val}]});
    expect(()=>assertQuery(query('propietarioId','o'),actorAuth())).toThrow(/denied/); // partial cannot list
    delete m.db['inmuebles/i'];delete m.db['inmuebles/otro'];
    expect(()=>assertQuery(query('propietarioId','o'),actorAuth())).toThrow(/denied/); // even empty!
    m.db['gestiones_cartera/o~g'].inmuebleIds=[];
    expect(()=>assertQuery(query('propietarioId','o'),actorAuth())).not.toThrow();
    expect((await cargarCarterasOnboarding(own))[0].inmuebles).toEqual([]);
    expect(()=>assertQuery(query('propietarioId','otro'),actorAuth())).toThrow();
    expect(()=>assertQuery({path:'inmuebles',filters:[]},actorAuth())).toThrow();
    expect(()=>assertQuery({path:'inmuebles',filters:[{field:'propietarioId',op:'in',val:['o']}]},actorAuth())).toThrow();
    m.db['gestiones_cartera/o~g'].estado='REVOCADA';
    expect(()=>assertQuery(query('propietarioId','o'),actorAuth())).toThrow();
  });
});

// Start both transactions against the same snapshot, then choose commit order.
// Each service call and each Rules check retain their own Auth identity.
function gateCommits() {
  const arrivals:string[]=[];
  const releases:Record<string,()=>void>={};
  const gates:Record<string,Promise<void>>={};
  for(const uid of ['auth-owner','master']) gates[uid]=new Promise<void>(r=>{releases[uid]=r;});
  m.beforeCommit=async auth=>{arrivals.push(auth.uid);await gates[auth.uid];};
  return {arrivals,releases};
}
describe('R02 cierre · carreras con dos principales y commit controlado',()=>{
  it.each(['auth-owner','master'])('aceptación + revocación, confirma primero %s',async primero=>{
    const {r}=await preparar();const count=auditCount();const gates=gateCommits();
    recipient();const acceptance=resolverInvitacionCarteraFirestore('e','ACEPTADA');
    master();const revocation=resolverInvitacionCarteraFirestore('e','REVOCADA');
    const outcomes=Promise.allSettled([acceptance,revocation]);
    await waitFor(()=>expect(new Set(gates.arrivals).size).toBe(2));
    gates.releases[primero]();
    await waitFor(()=>expect(auditCount()).toBe(count+1));
    gates.releases[primero==='master'?'auth-owner':'master']();
    const results=await outcomes;expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    const accepted=primero==='auth-owner';
    expect(m.db['enlaces_registro/e'].estadoInvitacion).toBe(accepted?'ACEPTADA':'REVOCADA');
    expect(m.db['enlaces_registro/e'].usosActuales).toBe(accepted?1:0);
    expect(m.db['gestiones_cartera/o~g'].estado).toBe(accepted?'ACTIVA':'PENDIENTE_ACEPTACION');
    expect(m.db['usuarios/'+r.usuarioId].estado).toBe(accepted?'ACTIVO':'PENDIENTE');
    expect(Object.keys(m.db).filter(k=>k.startsWith('gestiones_cartera/'))).toHaveLength(1);
    expect(auditCount()).toBe(count+1);gestor();expect(can('inmuebles','get','i')).toBe(accepted);
  });
  it('aceptación iniciada vigente + expiración: reloj de commit impide aceptación tardía',async()=>{
    await preparar();const expiry=Date.now()+1000; m.db['enlaces_registro/e'].fechaCaducidadMs=expiry;
    const clock=vi.spyOn(Date,'now').mockReturnValue(expiry-1);const count=auditCount();const gates=gateCommits();
    recipient();const acceptance=resolverInvitacionCarteraFirestore('e','ACEPTADA');
    // Attach a handler immediately, before a denied commit can reject.
    const aResult=Promise.allSettled([acceptance]);
    await waitFor(()=>expect(gates.arrivals).toContain('auth-owner'));
    clock.mockReturnValue(expiry);master();const expiration=resolverInvitacionCarteraFirestore('e','EXPIRADA');
    await waitFor(()=>expect(gates.arrivals).toContain('master'));
    gates.releases['auth-owner']();expect((await aResult)[0].status).toBe('rejected');
    gates.releases.master();await expiration;
    expect(m.db['enlaces_registro/e'].estadoInvitacion).toBe('EXPIRADA');
    expect(m.db['enlaces_registro/e'].usosActuales).toBe(0);
    expect(auditCount()).toBe(count+1);gestor();expect(can('inmuebles','get','i')).toBe(false);
  });
});
