import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnlaceRegistro } from '../src/types';

const m = vi.hoisted(() => ({
  data: new Map<string, Record<string, unknown>>(),
  writes: [] as {path:string; type:string; data:Record<string, unknown>}[],
  actor: { currentUser: {uid:'master',email:'sarqsan2@gmail.com'} as {uid:string;email:string}|null },
  seq: 0,
}));
vi.mock('../src/lib/firebase', () => ({auth:m.actor,db:{}}));
vi.mock('firebase/firestore', () => ({
  collection: (_db:unknown, path:string) => ({path}),
  doc: (...args:unknown[]) => {
    const parent = args[0] as {path?:string};
    if (parent?.path) return {path:`${parent.path}/audit-${++m.seq}`,id:`audit-${m.seq}`};
    return {path:`${args[1]}/${args[2]}`,id:args[2]};
  },
  runTransaction: async (_db:unknown, cb:(tx:unknown)=>Promise<unknown>) => {
    const staged: typeof m.writes = [];
    const result = await cb({
      get: async (ref:{path:string;id:string}) => ({id:ref.id, exists:()=>m.data.has(ref.path), data:()=>m.data.get(ref.path)}),
      set: (ref:{path:string}, data:Record<string,unknown>) => staged.push({path:ref.path,type:'set',data}),
      update: (ref:{path:string}, data:Record<string,unknown>) => staged.push({path:ref.path,type:'update',data}),
    });
    m.writes.push(...staged);
    for (const op of staged) m.data.set(op.path,{...m.data.get(op.path),...op.data});
    return result;
  },
}));
import { emitirInvitacionNominalFirestore, resolverInvitacionNominalFirestore } from '../src/lib/accesoPropietariosFirebase';
const enlace = ():EnlaceRegistro => ({
  id:'e',token:'e',textoVisible:'Invitación',tipoPerfil:'PROPIETARIO',activo:true,
  creadoPor:'master',createdAt:'2026-09-28T00:00:00Z',usosMaximos:1,usosActuales:0,
  estadoInvitacion:'PENDIENTE',usuarioIdVinculado:'u',propietarioIdVinculado:'o',
  emailInvitado:'ana@test.local',fechaCaducidadMs:Date.now()+86400000,
  fechaCaducidad:new Date(Date.now()+86400000).toISOString(),
});
const seed = () => {
  m.data.set('usuarios/u',{id:'u',tipoPerfil:'PROPIETARIO',estado:'PENDIENTE',email:'ana@test.local',propietarioId:'o'});
  m.data.set('propietarios/o',{id:'o'});
};
beforeEach(() => { m.data.clear(); m.writes.length=0; m.actor.currentUser={uid:'master',email:'sarqsan2@gmail.com'}; m.seq=0; seed(); });
describe('ROADMAP-01 · invitación nominal: transacciones administrativas', () => {
  it('crea enlace y auditoría en un solo commit; duplicado no sobreescribe ni audita', async () => {
    await emitirInvitacionNominalFirestore(enlace());
    expect(m.writes.map(w=>w.path)).toEqual(['enlaces_registro/e','audit_logs/audit-1']);
    await expect(emitirInvitacionNominalFirestore(enlace())).rejects.toThrow(/existente/);
    expect(m.writes).toHaveLength(2);
  });
  it('revoca/rechaza solo pendiente; guarda auditoría atómica e impide reapertura', async () => {
    await emitirInvitacionNominalFirestore(enlace());
    m.writes.length=0;
    await resolverInvitacionNominalFirestore('e','REVOCADA');
    expect(m.writes.map(w=>w.type)).toEqual(['update','set']);
    expect(m.data.get('enlaces_registro/e')).toMatchObject({activo:false,estadoInvitacion:'REVOCADA'});
    await expect(resolverInvitacionNominalFirestore('e','RECHAZADA')).rejects.toThrow(/resuelta/);
    expect(m.writes).toHaveLength(2);
  });
  it('usuario ajeno, destino incorrecto o sesión no master: ninguna escritura', async () => {
    m.data.set('usuarios/u',{id:'u',tipoPerfil:'INQUILINO',estado:'PENDIENTE',email:'ana@test.local',propietarioId:'o'});
    await expect(emitirInvitacionNominalFirestore(enlace())).rejects.toThrow(/incoherente/);
    m.actor.currentUser=null;
    await expect(emitirInvitacionNominalFirestore(enlace())).rejects.toThrow(/master/);
    expect(m.writes).toHaveLength(0);
  });
});
