import { beforeEach, describe, expect, it, vi } from 'vitest';

const memoria = vi.hoisted(() => ({ consultas: [] as any[], bajas: 0 }));
vi.mock('firebase/app', () => ({ initializeApp: () => ({}), getApps: () => [] }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('firebase/storage', () => ({ getStorage: () => ({}) }));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (_db: unknown, nombre: string) => ({ nombre, filtros: [] }),
  doc: (...args: unknown[]) => ({ args }),
  where: (campo: string, op: string, valor: unknown) => ({ campo, op, valor }),
  query: (col: any, ...filtros: any[]) => ({ ...col, filtros }),
  onSnapshot: (ref: any, next: any, error: any) => {
    const entrada = { ...ref, next, error }; memoria.consultas.push(entrada);
    return () => { memoria.bajas++; };
  },
  getDocs: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(), deleteField: vi.fn(),
  writeBatch: vi.fn(), runTransaction: vi.fn(),
}));

import { incidenciasDatos, descartarIncidencias } from '../src/estadoDatos/canalIncidencias';
import { subscribeCandidatos, subscribeSolicitudes, subscribeInvitaciones, subscribeVisitSlots, subscribeSolicitudesDoc, subscribeProfesionales } from '../src/lib/firebase';

const snapshot = (...docs: any[]) => ({ forEach: (f: any) => docs.forEach((d) => f({ id: d.id, data: () => d })) });
const owner = { tipoPerfil: 'PROPIETARIO', propietarioId: 'p1', inmueblesAlquilerIds: ['inm1', 'inm2', 'inm1'] };

describe('lecturas de alquiler y profesionales según ámbito', () => {
  beforeEach(() => { memoria.consultas = []; memoria.bajas = 0; descartarIncidencias(); });

  it.each([subscribeCandidatos, subscribeSolicitudes, subscribeInvitaciones, subscribeVisitSlots, subscribeSolicitudesDoc])('consulta cada inmueble y une los resultados sin duplicados', (escuchar) => {
    const recibir = vi.fn();
    const baja = (escuchar as any)(recibir, owner);
    expect(memoria.consultas.map((q) => q.filtros)).toEqual([
      [{ campo: 'inmuebleId', op: '==', valor: 'inm1' }],
      [{ campo: 'inmuebleId', op: '==', valor: 'inm2' }],
    ]);
    memoria.consultas[0].next(snapshot({ id: 'a' }, { id: 'comun' }));
    expect(recibir).not.toHaveBeenCalled();
    memoria.consultas[1].next(snapshot({ id: 'b' }, { id: 'comun' }));
    expect(recibir.mock.lastCall![0].map((d: any) => d.id).sort()).toEqual(['a', 'b', 'comun']);
    memoria.consultas[0].next(snapshot()); memoria.consultas[1].next(snapshot());
    expect(recibir.mock.lastCall![0]).toEqual([]);
    baja(); expect(memoria.bajas).toBe(2);
  });

  it('catálogo del titular: públicos y sus privados, no los privados de otros', () => {
    const recibir = vi.fn(); subscribeProfesionales(recibir, owner);
    expect(memoria.consultas.map((q) => q.filtros)).toEqual([
      [{ campo: 'esPrivado', op: '==', valor: false }],
      [{ campo: 'creadoPorPropietarioId', op: '==', valor: 'p1' }],
    ]);
    memoria.consultas[0].next(snapshot({ id: 'publico' }));
    memoria.consultas[1].next(snapshot({ id: 'privado' }, { id: 'publico' }));
    expect(recibir.mock.lastCall![0].map((d: any) => d.id).sort()).toEqual(['privado', 'publico']);
  });

  it('personal consulta la colección; sin sesión ni inquilino no se consulta', () => {
    const recibir = vi.fn();
    subscribeCandidatos(recibir); subscribeInvitaciones(recibir, { tipoPerfil: 'INQUILINO' });
    expect(memoria.consultas).toHaveLength(0);
    expect(recibir).toHaveBeenCalledTimes(2);
    subscribeSolicitudes(recibir, { tipoPerfil: 'ADMINISTRADOR' });
    expect(memoria.consultas[0]).toMatchObject({ nombre: 'solicitudes', filtros: [] });
  });

  it('un fallo de una cartera se comunica y no se presenta la unión parcial como completa', () => {
    const recibir = vi.fn(); subscribeInvitaciones(recibir, owner);
    memoria.consultas[0].next(snapshot({ id: 'a' }));
    memoria.consultas[1].error({ code: 'permission-denied' });
    expect(recibir).not.toHaveBeenCalled();
    expect(incidenciasDatos()).toEqual(expect.arrayContaining([expect.objectContaining({ origen: 'invitaciones', tipo: 'LECTURA', codigo: 'permission-denied' })]));
  });

  it('propietario sin inmuebles no solicita toda la colección', () => {
    const recibir = vi.fn(); subscribeCandidatos(recibir, { tipoPerfil: 'PROPIETARIO' });
    expect(memoria.consultas).toHaveLength(0); expect(recibir).toHaveBeenCalledWith([]);
  });
});
