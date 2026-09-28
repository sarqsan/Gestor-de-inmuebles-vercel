import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  txWrites: [] as string[],
  outsideWrites: [] as string[],
  failTxPath: '' as string,
  seq: 0,
  actor: { currentUser: { uid: 'uid-owner', email: 'owner@test.local', displayName: 'Titular' } as { uid: string; email: string; displayName: string } | null },
}));

vi.mock('firebase/app', () => {
  const app = {};
  return { initializeApp: () => app, getApps: () => [app] };
});
vi.mock('firebase/auth', () => ({ getAuth: () => m.actor }));
vi.mock('firebase/storage', () => ({
  getStorage: () => ({}), ref: () => ({}), uploadBytes: async () => ({}),
  getDownloadURL: async () => '', deleteObject: async () => {},
}));
vi.mock('firebase/firestore', () => {
  const ref = (...args: any[]) => {
    const last = args[args.length - 1];
    if (args.length === 1 && last?.__collection) {
      const id = `audit-${++m.seq}`;
      return { id, path: `${last.__collection}/${id}` };
    }
    if (args.length === 2 && args[0]?.__collection) return { id: args[1], path: `${args[0].__collection}/${args[1]}` };
    return { id: args[2], path: `${args[1]}/${args[2]}` };
  };
  const snapshot = (r: { id: string; path: string }) => ({
    id: r.id,
    exists: () => m.docs.has(r.path),
    data: () => m.docs.get(r.path),
  });
  return {
    getFirestore: () => ({}), collection: (_db: unknown, name: string) => ({ __collection: name }), doc: ref,
    getDocs: async () => ({ empty: true, docs: [] }), getDoc: async (r: any) => snapshot(r),
    setDoc: async (r: any, data: Record<string, unknown>, options?: { merge?: boolean }) => {
      m.outsideWrites.push(r.path);
      m.docs.set(r.path, options?.merge ? { ...m.docs.get(r.path), ...data } : data);
    },
    deleteDoc: async () => {}, deleteField: () => ({ __deleteField: true }), onSnapshot: () => () => {},
    writeBatch: () => ({ set() {}, commit: async () => {} }), query: (...args: unknown[]) => args[0], where: () => ({}),
    runTransaction: async (_db: unknown, callback: (tx: any) => Promise<unknown>) => {
      const pending: Array<{ path: string; data: Record<string, unknown>; merge: boolean }> = [];
      const result = await callback({
        get: async (r: any) => snapshot(r),
        set: (r: any, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          if (m.failTxPath && r.path === m.failTxPath) throw new Error('permission-denied');
          pending.push({ path: r.path, data, merge: !!options?.merge });
        },
      });
      for (const write of pending) {
        m.txWrites.push(write.path);
        if (write.merge) {
          const merged = { ...m.docs.get(write.path) };
          for (const [key, value] of Object.entries(write.data)) {
            if (value && typeof value === 'object' && '__deleteField' in value) delete merged[key];
            else merged[key] = value;
          }
          m.docs.set(write.path, merged);
        } else m.docs.set(write.path, write.data);
      }
      return result;
    },
  };
});

import type { ContratoFormalizacion, HabitacionInmueble, Inmueble } from '../src/types';
import { persistirTransicionAlquilerFirestore } from '../src/lib/firebase';

const inmueble: Inmueble = {
  id: 'inm-1', propietarioId: 'prop-1', direccion: 'Calle Uno 1', ciudad: 'Alicante',
  precio: 900, habitaciones: 2, banos: 1, superficie: 65, candidatosCount: 0, fianzaMeses: 1,
  estado: 'disponible',
} as Inmueble;
const contrato: ContratoFormalizacion = {
  id: 'ct-1', inmuebleId: 'inm-1', propietarioId: 'prop-1', candidatoId: 'cand-1',
  candidatoNombre: 'Inquilino', estado: 'FIRMADO',
} as ContratoFormalizacion;

beforeEach(() => {
  m.docs.clear(); m.txWrites.length = 0; m.outsideWrites.length = 0; m.failTxPath = ''; m.seq = 0;
  m.actor.currentUser = { uid: 'uid-owner', email: 'owner@test.local', displayName: 'Titular' };
  m.docs.set('inmuebles/inm-1', inmueble as unknown as Record<string, unknown>);
});

describe('ROADMAP-04 · persistencia transaccional del ciclo de alquiler', () => {
  it('activa contrato e inmueble en el mismo commit y registra auditoría con referencias', async () => {
    m.docs.set('fichas_publicas_inmueble/inm-1', { id: 'inm-1', inmuebleId: 'inm-1', propietarioId: 'prop-1', estado: 'disponible' });
    const result = await persistirTransicionAlquilerFirestore(contrato, { marcarInmuebleAlquilado: true });
    expect(m.txWrites).toEqual([
      'inmuebles/inm-1', 'fichas_publicas_inmueble/inm-1', 'contratos_formalizacion/ct-1', 'audit_logs/audit-1',
    ]);
    expect(result.inmueble?.contratoActivoId).toBe('ct-1');
    expect(m.docs.get('contratos_formalizacion/ct-1')?.inmuebleId).toBe('inm-1');
    expect(m.docs.get('fichas_publicas_inmueble/inm-1')?.estado).toBe('alquilado');
    const audit = m.docs.get('audit_logs/audit-1')!;
    expect(audit.accion).toBe('ALQUILER_CONTRATO_ACTIVADO');
    expect((audit.detalles as { rutas: string[] }).rutas).toContain('inmuebles/inm-1');
  });

  it('rechaza sustituir una ocupación existente aunque falte contratoActivoId', async () => {
    m.docs.set('inmuebles/inm-1', { ...inmueble, estado: 'alquilado', inquilinoActualId: 'cand-previo' });
    await expect(persistirTransicionAlquilerFirestore(
      contrato, { marcarInmuebleAlquilado: true },
    )).rejects.toThrow('ocupado por otro inquilino');
    expect(m.txWrites).toEqual([]);
    expect(m.docs.get('inmuebles/inm-1')?.inquilinoActualId).toBe('cand-previo');
  });

  it('rechaza IDs de contrato incoherentes con la ruta Firestore', async () => {
    m.docs.set('contratos_formalizacion/ct-1', { ...contrato, id: 'ct-otro' } as unknown as Record<string, unknown>);
    await expect(persistirTransicionAlquilerFirestore(
      contrato, { marcarInmuebleAlquilado: true },
    )).rejects.toThrow('ID almacenado del contrato no coincide');
    expect(m.txWrites).toEqual([]);
    expect(m.docs.get('inmuebles/inm-1')?.estado).toBe('disponible');
  });

  it('rechaza PID cruzado antes de escribir contrato, inmueble o auditoría', async () => {
    await expect(persistirTransicionAlquilerFirestore(
      { ...contrato, propietarioId: 'prop-ajeno' }, { marcarInmuebleAlquilado: true },
    )).rejects.toThrow('no pertenecen al mismo titular');
    expect(m.txWrites).toEqual([]);
    expect(m.docs.has('contratos_formalizacion/ct-1')).toBe(false);
    expect(m.docs.get('inmuebles/inm-1')?.estado).toBe('disponible');
  });

  it('al cerrar un contrato elimina referencias activas del inmueble en el mismo commit', async () => {
    const activo = { ...contrato, estado: 'FORMALIZADO_ACTIVO' } as ContratoFormalizacion;
    m.docs.set('contratos_formalizacion/ct-1', activo as unknown as Record<string, unknown>);
    m.docs.set('inmuebles/inm-1', {
      ...inmueble, estado: 'alquilado', inquilinoActualId: 'cand-1',
      inquilinoActualNombre: 'Inquilino', contratoActivoId: 'ct-1',
    });

    await persistirTransicionAlquilerFirestore(
      { ...activo, estado: 'FINALIZADO' }, { liberarInmueble: true },
    );

    const guardado = m.docs.get('inmuebles/inm-1')!;
    expect(guardado.estado).toBe('disponible');
    expect(guardado.contratoActivoId).toBeUndefined();
    expect(guardado.inquilinoActualId).toBeUndefined();
    expect(guardado.inquilinoActualNombre).toBeUndefined();
    expect(m.txWrites).toEqual(['inmuebles/inm-1', 'contratos_formalizacion/ct-1', 'audit_logs/audit-1']);
  });

  it('un fallo al auditar aborta ambas escrituras del ciclo', async () => {
    m.failTxPath = 'audit_logs/audit-1';
    await expect(persistirTransicionAlquilerFirestore(contrato, { marcarInmuebleAlquilado: true })).rejects.toThrow('permission-denied');
    expect(m.txWrites).toEqual([]);
    expect(m.docs.has('contratos_formalizacion/ct-1')).toBe(false);
    expect(m.docs.get('inmuebles/inm-1')?.estado).toBe('disponible');
  });

  it('libera una habitación desde el contrato y conserva el estado patrimonial global del inmueble', async () => {
    const room: HabitacionInmueble = {
      id: 'hab-1', inmuebleId: 'inm-1', propietarioId: 'prop-1', nombre: 'Habitación 1',
      estado: 'OCUPADA', activo: true, fechaAlta: '2026-01-01', fechaModificacion: '2026-01-01',
      creadoPor: 'uid-owner', actualizadoPor: 'uid-owner', contratoId: 'ct-1',
    };
    const contratoHabitacion = { ...contrato, habitacionId: 'hab-1', estado: 'FIRMADO' } as ContratoFormalizacion;
    m.docs.set('contratos_formalizacion/ct-1', contratoHabitacion as unknown as Record<string, unknown>);
    m.docs.set('inmuebles/inm-1', { ...inmueble, estado: 'alquilado', contratoActivoId: 'ct-parent', inquilinoActualId: 'cand-parent' });
    m.docs.set('habitaciones_inmueble/hab-1', room as unknown as Record<string, unknown>);

    const result = await persistirTransicionAlquilerFirestore(
      { ...contratoHabitacion, estado: 'FINALIZADO' }, { liberarInmueble: true },
    );

    expect(result.habitacion?.estado).toBe('DISPONIBLE');
    expect(m.docs.get('habitaciones_inmueble/hab-1')?.contratoId).toBeUndefined();
    expect(m.docs.get('inmuebles/inm-1')?.contratoActivoId).toBe('ct-parent');
    expect(m.docs.get('inmuebles/inm-1')?.inquilinoActualId).toBe('cand-parent');
  });

  it('reintentar un cierre ya persistido no duplica escrituras ni auditoría ni pisa un nuevo alquiler', async () => {
    const contratoFinalizado = { ...contrato, estado: 'FINALIZADO', esVigente: false } as ContratoFormalizacion;
    const nuevaOcupacion = { ...inmueble, estado: 'alquilado', contratoActivoId: 'ct-new', inquilinoActualId: 'cand-new' };
    m.docs.set('contratos_formalizacion/ct-1', contratoFinalizado as unknown as Record<string, unknown>);
    m.docs.set('inmuebles/inm-1', nuevaOcupacion as unknown as Record<string, unknown>);

    const result = await persistirTransicionAlquilerFirestore(
      { ...contratoFinalizado, historial: [{ id: 'duplicado' }] } as ContratoFormalizacion,
      { liberarInmueble: true },
    );

    expect(result.contrato.historial).toBeUndefined();
    expect(m.txWrites).toEqual([]);
    expect(m.docs.get('inmuebles/inm-1')?.contratoActivoId).toBe('ct-new');
  });

  it('finaliza habitación y contrato en un commit sin borrar una ocupación posterior', async () => {
    const room: HabitacionInmueble = {
      id: 'hab-1', inmuebleId: 'inm-1', propietarioId: 'prop-1', nombre: 'Habitación 1',
      estado: 'OCUPADA', activo: true, fechaAlta: '2026-01-01', fechaModificacion: '2026-01-01',
      creadoPor: 'uid-owner', actualizadoPor: 'uid-owner', contratoId: 'ct-1',
    };
    const finalizado = { ...contrato, habitacionId: 'hab-1', estado: 'FINALIZADO' } as ContratoFormalizacion;
    m.docs.set('contratos_formalizacion/ct-1', contrato as unknown as Record<string, unknown>);
    m.docs.set('inmuebles/inm-1', { ...inmueble, estado: 'alquilado', contratoActivoId: 'ct-new', inquilinoActualId: 'cand-new' });
    m.docs.set('habitaciones_inmueble/hab-1', room as unknown as Record<string, unknown>);
    const roomLiberada: HabitacionInmueble = { ...room, estado: 'DISPONIBLE', contratoId: undefined };
    const result = await persistirTransicionAlquilerFirestore(finalizado, { liberarInmueble: true, habitacion: roomLiberada });
    expect(m.txWrites).toEqual([
      'habitaciones_inmueble/hab-1', 'contratos_formalizacion/ct-1', 'audit_logs/audit-1',
    ]);
    expect(result.contrato.estado).toBe('FINALIZADO');
    expect(m.docs.get('habitaciones_inmueble/hab-1')?.estado).toBe('DISPONIBLE');
    expect(m.docs.get('inmuebles/inm-1')?.contratoActivoId).toBe('ct-new');
    expect(m.docs.get('inmuebles/inm-1')?.inquilinoActualId).toBe('cand-new');
  });
});
