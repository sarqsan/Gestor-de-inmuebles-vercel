/**
 * BLOQUE A · existencia TRI-STATE del adaptador de importación.
 * ---------------------------------------------------------------------------
 * Contrato probado (unitario, con `getDoc` simulado; sin datos personales):
 *  · documento legible y existente  → EXISTE
 *  · documento legible y ausente    → NO_EXISTE
 *  · lectura DENEGADA (permission-denied) → NO_VERIFICABLE (ni existe ni no existe)
 *  · error de red u otro            → se PROPAGA (no se etiqueta como permiso)
 *  · `existeVisible` / `existeDestino` (booleanos) sólo son true con EXISTE.
 *  · `estadoDestino` rechaza colecciones no escribibles por importación.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const G = vi.hoisted(() => ({ getDoc: null as null | ((ref: unknown) => Promise<unknown>) }));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  getDoc: (ref: unknown) => G.getDoc!(ref),
  setDoc: async () => { throw new Error('no esperado: setDoc'); },
  writeBatch: () => { throw new Error('no esperado: writeBatch'); },
  arrayUnion: (...v: unknown[]) => v,
}));

vi.mock('../src/lib/firebase', () => ({
  db: {},
  deepCleanForFirestore: (v: unknown) => v,
  registrarAuditoriaFirestore: async () => {},
  saveContratoFirestore: async () => {},
  saveGastoFirestore: async () => {},
  subscribeContratos: () => () => {},
  subscribeGastos: () => () => {},
  subscribeInmuebles: () => () => {},
  subscribePropietarios: () => () => {},
}));

import { consultarExistencia, crearPuertoFirebase, existeVisible } from '../src/lib/importExportFirebase';

const DENEGADO = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
const ref = { col: 'inmuebles', id: 'inm_x' } as never;
const snap = (existe: boolean) => ({ exists: () => existe });
const IDENTIDAD = { usuarioId: 'u_test', usuarioEmail: 'u@test.local', usuarioNombre: 'Sintético' };

beforeEach(() => { G.getDoc = null; });

describe('consultarExistencia · tri-state', () => {
  it('EXISTE: lectura autorizada y documento presente', async () => {
    G.getDoc = async () => snap(true);
    expect(await consultarExistencia(ref)).toBe('EXISTE');
  });
  it('NO_EXISTE: lectura autorizada y documento ausente', async () => {
    G.getDoc = async () => snap(false);
    expect(await consultarExistencia(ref)).toBe('NO_EXISTE');
  });
  it('NO_VERIFICABLE: lectura denegada (no se afirma ni existencia ni inexistencia)', async () => {
    G.getDoc = async () => { throw DENEGADO; };
    expect(await consultarExistencia(ref)).toBe('NO_VERIFICABLE');
  });
  it('NO_VERIFICABLE también cuando el código llega sin code (mensaje de Firestore)', async () => {
    G.getDoc = async () => { throw new Error('Missing or insufficient permissions.'); };
    expect(await consultarExistencia(ref)).toBe('NO_VERIFICABLE');
  });
  it('error de red: se PROPAGA y no se etiqueta como denegación', async () => {
    G.getDoc = async () => { throw Object.assign(new Error('unavailable: red caída'), { code: 'unavailable' }); };
    await expect(consultarExistencia(ref)).rejects.toThrow(/red caída/);
  });
});

describe('compatibilidad booleana', () => {
  it('existeVisible sólo es true con EXISTE; una denegación sigue siendo false (sin afirmar existencia)', async () => {
    G.getDoc = async () => snap(true);
    expect(await existeVisible(ref)).toBe(true);
    G.getDoc = async () => { throw DENEGADO; };
    expect(await existeVisible(ref)).toBe(false);
    G.getDoc = async () => snap(false);
    expect(await existeVisible(ref)).toBe(false);
  });
  it('existeDestino (puerto) equivale a estadoDestino === EXISTE', async () => {
    const puerto = crearPuertoFirebase(IDENTIDAD);
    G.getDoc = async () => snap(true);
    expect(await puerto.existeDestino('inmuebles', 'inm_1')).toBe(true);
    G.getDoc = async () => { throw DENEGADO; };
    expect(await puerto.existeDestino('inmuebles', 'inm_1')).toBe(false);
    expect(await puerto.estadoDestino!('inmuebles', 'inm_1')).toBe('NO_VERIFICABLE');
  });
  it('estadoDestino rechaza colecciones no escribibles por importación', async () => {
    const puerto = crearPuertoFirebase(IDENTIDAD);
    await expect(puerto.estadoDestino!('contratos', 'c1')).rejects.toThrow(/no escribible/);
  });
});
