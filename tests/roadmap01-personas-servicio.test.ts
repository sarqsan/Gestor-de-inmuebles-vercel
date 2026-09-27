import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Persona } from '../src/lib/personas';
import type { Propietario, UsuarioApp } from '../src/types';
const data = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), committed: [] as { path:string; value:Record<string, unknown> }[], email: 'sarqsan2@gmail.com', seq: 0 }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => name,
  doc: (dbOrCol: unknown, col?: string, id?: string) => { const key = id ?? `log_${++data.seq}`; return { path: `${col ?? dbOrCol}/${key}`, id: key }; },
  runTransaction: async (_db: unknown, fn: (tx: any) => Promise<unknown>) => {
    const writes: {path:string;value:Record<string, unknown>}[] = [];
    const tx = {
      get: async (ref: {path:string;id:string}) => ({ exists: () => data.docs.has(ref.path), data: () => data.docs.get(ref.path), id: ref.id }),
      set: (ref: {path:string}, value: Record<string, unknown>) => writes.push({path:ref.path,value}),
      update: (ref: {path:string}, value: Record<string, unknown>) => writes.push({path:ref.path,value}),
    };
    const result = await fn(tx);
    data.committed.push(...writes);
    for (const write of writes) data.docs.set(write.path, { ...data.docs.get(write.path), ...write.value });
    return result;
  },
}));
vi.mock('../src/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid:'master', get email() { return data.email; } } } }));
import { crearPersonaFirestore, vincularPropietarioPersonaFirestore, vincularUsuarioPersonaFirestore, cambiarRolesPersonaFirestore } from '../src/lib/personasServicioFirebase';
const T = '2026-09-27T12:00:00Z';
const owner: Propietario = { id:'o', nombre:'Ana', nifCif:'', tipoPropietario:'persona_fisica', email:'', telefono:'', direccion:'', ciudad:'', codigoPostal:'', cuentasBancarias:[], fechaCreacion:T, fechaActualizacion:T };
const user: UsuarioApp = { id:'u', nombre:'Ana', email:'u@test.local', tipoPerfil:'PROPIETARIO', estado:'PENDIENTE', roles:[], permisos:[], propietarioId:'o', createdAt:T, updatedAt:T };

describe('ROADMAP-01 · escritura opt-in y auditoría atómica', () => {
  beforeEach(() => { data.docs.clear(); data.committed.length = 0; data.seq = 0; data.email = 'sarqsan2@gmail.com'; });
  it('crea persona sin cuenta, vincula titular y usuario pendiente sin duplicarlos, audita cada operación', async () => {
    data.docs.set('propietarios/o', { ...owner });
    data.docs.set('usuarios/u', { ...user });
    await crearPersonaFirestore('p', 'Ana');
    await vincularPropietarioPersonaFirestore('p','o');
    await vincularUsuarioPersonaFirestore('p','u');
    await cambiarRolesPersonaFirestore('p',['PROPIETARIO','GESTOR_PROPIETARIO']);
    expect((data.docs.get('personas/p') as unknown as Persona).propietarioIds).toEqual(['o']);
    expect(data.docs.get('propietarios/o')?.personaId).toBe('p');
    expect(data.docs.get('usuarios/u')?.personaId).toBe('p');
    expect(data.docs.get('usuarios/u')?.authUid).toBeUndefined();
    expect(data.committed.filter(w => w.path.startsWith('audit_logs/'))).toHaveLength(4);
    expect(data.committed.filter(w => w.path.startsWith('inmuebles/'))).toHaveLength(0);
    await expect(vincularPropietarioPersonaFirestore('p','o')).rejects.toThrow('Vínculo ya existente');
    expect(data.committed.filter(w => w.path.startsWith('audit_logs/'))).toHaveLength(4);
  });
  it('una identidad ajena no escribe; conflictos de persona/usuario abortan antes de persistir/auditar', async () => {
    data.email = 'other@test.local';
    await expect(crearPersonaFirestore('p','Ana')).rejects.toThrow('master');
    expect(data.committed).toHaveLength(0);
    data.email = 'sarqsan2@gmail.com';
    data.docs.set('propietarios/o', { ...owner, personaId:'otra' });
    await crearPersonaFirestore('p','Ana');
    await expect(vincularPropietarioPersonaFirestore('p','o')).rejects.toThrow('Vínculo ya existente');
    expect(data.docs.get('propietarios/o')?.personaId).toBe('otra');
    expect(data.committed).toHaveLength(2);
  });
});
