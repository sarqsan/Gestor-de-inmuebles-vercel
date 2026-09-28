import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({db:new Map<string,Record<string,unknown>>(),writes:[] as string[],failAudit:false,seq:0,
  actor:{currentUser:{uid:'master',email:'sarqsan2@gmail.com'} as {uid:string;email:string}|null}}));
vi.mock('../src/lib/firebase',()=>({db:{},auth:m.actor,sanitizeObjectForFirestore:(o:unknown)=>o,
  registrarAuditoriaFirestore:async()=>{throw new Error('No usar auditoría secundaria como garantía');}}));
vi.mock('firebase/firestore',()=>({
  collection:(_db:unknown,col:string)=>({col}),
  doc:(...a:unknown[])=>{
    if (a.length===1) return {id:`audit_${++m.seq}`,path:`${(a[0] as {col:string}).col}/audit_${m.seq}`};
    return {id:a[2],path:`${a[1]}/${a[2]}`};
  },
  getDoc:async (r:{id:string;path:string})=>({id:r.id,exists:()=>m.db.has(r.path),data:()=>m.db.get(r.path)}),
  getDocs:async()=>({docs:[]}),
  limit:()=>({}),query:()=>({}),where:()=>({}),
  runTransaction:async (_db:unknown,fn:(tx:unknown)=>Promise<unknown>)=>{
    const pending:Array<{path:string;data:Record<string,unknown>;merge:boolean}>=[];
    const result=await fn({
      get:async (r:{id:string;path:string})=>({id:r.id,exists:()=>m.db.has(r.path),data:()=>m.db.get(r.path)}),
      set:(r:{path:string},data:Record<string,unknown>,opts?:{merge?:boolean})=>{
        if (m.failAudit && r.path.startsWith('audit_logs/')) throw new Error('audit-denied');
        pending.push({path:r.path,data,merge:!!opts?.merge});
      },
    });
    for (const p of pending) {m.db.set(p.path,p.merge?{...m.db.get(p.path),...p.data}:p.data);m.writes.push(p.path);}
    return result;
  },
}));
import { guardarAccesosAuditados, guardarAccesoAuditado } from '../src/lib/auditoriaAccesoFirebase';
import { puertoGestionesCarteraFirestore } from '../src/lib/gestionesCarteraServicioFirebase';
beforeEach(()=>{m.db.clear();m.writes.length=0;m.failAudit=false;m.seq=0;m.actor.currentUser={uid:'master',email:'sarqsan2@gmail.com'};});
describe('ROADMAP-01 · adaptadores audit_logs (mismo commit)',()=>{
 it('perfil y espejo comparten evento nuevo, rutas y actor; fallo del log revierte ambos',async()=>{
   await guardarAccesosAuditados([
     {coleccion:'usuarios',id:'u',datos:{estado:'INACTIVO'}},
     {coleccion:'usuarios_auth',id:'uid',datos:{estado:'INACTIVO'}},
   ],'BAJA_USUARIO');
   expect(m.writes).toEqual(['usuarios/u','usuarios_auth/uid','audit_logs/audit_1']);
   expect(m.db.get('usuarios/u')?.roadmap01AuditId).toBe('audit_1');
   const detalles=m.db.get('audit_logs/audit_1')?.detalles as {rutas:string[];campos:Array<{ruta:string;claves:string[]}>};
   expect(detalles.rutas).toEqual(['usuarios/u','usuarios_auth/uid']);
   expect(detalles.campos.map(c=>c.claves)).toEqual([['estado'],['estado']]);
   expect(JSON.stringify(detalles)).not.toContain('INACTIVO'); // no exponer valores sensibles
   m.writes.length=0;m.failAudit=true;
   await expect(guardarAccesoAuditado('usuarios','u',{estado:'ACTIVO'},'REACTIVAR')).rejects.toThrow('audit-denied');
   expect(m.db.get('usuarios/u')?.estado).toBe('INACTIVO');
   expect(m.writes).toHaveLength(0);
 });
 it('alta de gestión y evento se confirman juntos; sin auditoría no existe gestión',async()=>{
   const g={id:'g',propietarioId:'p',gestorUsuarioId:'u',eventos:[]};
   m.failAudit=true;
   await expect(puertoGestionesCarteraFirestore.crearGestion(g as never)).rejects.toThrow('audit-denied');
   expect(m.db.has('gestiones_cartera/g')).toBe(false);
   m.failAudit=false;
   await puertoGestionesCarteraFirestore.crearGestion(g as never);
   expect(m.writes).toEqual(['gestiones_cartera/g','audit_logs/audit_2']);
   expect(m.db.get('gestiones_cartera/g')?.roadmap01AuditId).toBe('audit_2');
 });
 it('revocación recorta el espejo y registra ambas rutas EN el commit de gestión; si falla log no revoca',async()=>{
   const g={id:'g',gestorUsuarioId:'u',propietarioId:'p',tipoGestor:'GESTOR_PROFESIONAL',inmuebleIds:[],
     estado:'ACTIVA',permiso:'LECTURA_ESCRITURA',responsableActual:'GESTOR',requiereAceptacion:false,
     fechaAlta:'2026-09-28',createdAt:'2026-09-28',updatedAt:'2026-09-28',creadoPor:'master',eventos:[]};
   m.db.set('gestiones_cartera/g',g);
   m.db.set('usuarios/u',{id:'u',authUid:'uid'});
   m.db.set('usuarios_auth/uid',{usuarioId:'u',carterasL:['p','otra'],carterasE:['p','otra']});
   const revocar=()=>puertoGestionesCarteraFirestore.aplicarTransicion('g',f=>({...f,estado:'REVOCADA',
     eventos:[...f.eventos,{tipo:'REVOCACION'} as never]}));
   m.failAudit=true;
   await expect(revocar()).rejects.toThrow('audit-denied');
   expect(m.db.get('gestiones_cartera/g')?.estado).toBe('ACTIVA');
   expect(m.db.get('usuarios_auth/uid')?.carterasE).toEqual(['p','otra']);
   expect(m.writes).toEqual([]);
   m.failAudit=false;
   await revocar();
   expect(m.writes).toEqual(['gestiones_cartera/g','usuarios_auth/uid','audit_logs/audit_2']);
   expect(m.db.get('usuarios_auth/uid')?.carterasL).toEqual(['otra']);
   expect(m.db.get('usuarios_auth/uid')?.carterasE).toEqual(['otra']);
   expect(m.db.get('usuarios_auth/uid')?.roadmap01AuditId).toBe('audit_2');
   expect((m.db.get('audit_logs/audit_2')?.detalles as {rutas:string[]}).rutas)
     .toEqual(['gestiones_cartera/g','usuarios_auth/uid']);
 });
});
