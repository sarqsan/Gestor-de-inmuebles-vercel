/**
 * FASE 6 — Sincronización local entre pestañas (delta selectivo de C).
 * ---------------------------------------------------------------------------
 * Fuente C: commit a6ac280, `App.tsx / handleStorageChange`. Se recupera la
 * coherencia local para candidatos, invitaciones y slots (merge por id).
 *
 * NO se porta la arquitectura antigua de caché de C: la clave de inmuebles
 * se ignora siempre, el módulo no importa Firebase ni escribe en Firestore, y
 * `snapshotInmueblesCache.ts` sigue intacto como única vía Firestore → estado
 * para inmuebles. Sin restauración caché → Firestore por esta vía.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLAVE_STORAGE_CANDIDATOS,
  CLAVE_STORAGE_INVITACIONES,
  CLAVE_STORAGE_SLOTS,
  coleccionDeClaveStorage,
  fusionarPorId,
  reconciliarDesdeStorage,
} from '../src/lib/sincronizacionPestanas';

const RAIZ = resolve(__dirname, '..');

interface Item {
  id: string;
  nombre?: string;
  estado?: string;
}

const item = (id: string, extra: Partial<Item> = {}): Item => ({ id, ...extra });

describe('recepción del evento storage', () => {
  it('clave de candidatos + payload válido → fusiona', () => {
    const next = reconciliarDesdeStorage<Item>(
      CLAVE_STORAGE_CANDIDATOS,
      JSON.stringify([item('c-2', { nombre: 'Nueva' })]),
      [item('c-1', { nombre: 'Actual' })]
    );
    expect(next?.map((i) => i.id)).toEqual(['c-1', 'c-2']);
  });

  it('resuelve las tres claves sincronizadas', () => {
    expect(coleccionDeClaveStorage(CLAVE_STORAGE_CANDIDATOS)).toBe('candidatos');
    expect(coleccionDeClaveStorage(CLAVE_STORAGE_INVITACIONES)).toBe('invitaciones');
    expect(coleccionDeClaveStorage(CLAVE_STORAGE_SLOTS)).toBe('slots');
    expect(CLAVE_STORAGE_CANDIDATOS).toBe('rentselect_candidatos');
    expect(CLAVE_STORAGE_INVITACIONES).toBe('rentselect_invitaciones');
    expect(CLAVE_STORAGE_SLOTS).toBe('rentselect_slots');
  });
});

describe('merge por id', () => {
  it('actualiza existentes in situ, conserva el orden y añade nuevos al final', () => {
    const actuales = [item('a', { nombre: 'A' }), item('b', { nombre: 'B' })];
    const next = fusionarPorId(actuales, [item('b', { nombre: 'B2' }), item('c', { nombre: 'C' })]);
    expect(next.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(next[1].nombre).toBe('B2');
    expect(next[0]).toBe(actuales[0]);
  });

  it('actualización parcial: fusiona campos sin perder los previos', () => {
    const next = fusionarPorId([item('a', { nombre: 'A', estado: 'nuevo' })], [item('a', { estado: 'x' })]);
    expect(next[0]).toEqual({ id: 'a', nombre: 'A', estado: 'x' });
  });

  it('sin cambios → misma referencia (React omite el render)', () => {
    const actuales = [item('a', { nombre: 'A' })];
    expect(fusionarPorId(actuales, [item('a', { nombre: 'A' })])).toBe(actuales);
  });

  it('elementos entrantes sin id válido → se ignoran', () => {
    const actuales = [item('a')];
    const next = fusionarPorId(actuales, [
      { nombre: 'sin-id' } as unknown as Item,
      { id: '' } as unknown as Item,
      { id: 7 } as unknown as Item,
      item('b'),
    ]);
    expect(next.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('elementos locales sin id válido → se conservan tal cual', () => {
    const raro = { nombre: 'raro' } as unknown as Item;
    const next = fusionarPorId([raro, item('a')], [item('b')]);
    expect(next).toHaveLength(3);
    expect(next[0]).toBe(raro);
  });
});

describe('eliminación: conservadora por diseño', () => {
  it('los locales ausentes en el payload SE PRESERVAN (ausente ≠ eliminado)', () => {
    // Con suscripciones acotadas por ámbito, otra pestaña puede tener una
    // vista parcial: borrar por ausencia destruiría datos legítimos fuera de
    // su alcance. La autoridad de borrado es la suscripción Firestore propia.
    const next = fusionarPorId([item('a'), item('b')], [item('b', { nombre: 'B2' })]);
    expect(next.map((i) => i.id)).toEqual(['a', 'b']);
    expect(next[1].nombre).toBe('B2');
  });

  it('array vacío → null (no-op, nunca borra)', () => {
    expect(reconciliarDesdeStorage(CLAVE_STORAGE_SLOTS, '[]', [item('a')])).toBeNull();
  });

  it('clave eliminada (newValue null) → null (no-op)', () => {
    expect(reconciliarDesdeStorage(CLAVE_STORAGE_CANDIDATOS, null, [item('a')])).toBeNull();
  });
});

describe('payloads inválidos', () => {
  it.each([['JSON roto', '{no-json'], ['no-array', '{"id":"a"}'], ['número', '42'], ['vacío', '']])(
    '%s → null sin lanzar',
    (_nombre, payload) => {
      expect(reconciliarDesdeStorage(CLAVE_STORAGE_INVITACIONES, payload, [item('a')])).toBeNull();
    }
  );
});

describe('ausencia de restauración indebida desde caché', () => {
  it('la clave de inmuebles se ignora SIEMPRE', () => {
    expect(coleccionDeClaveStorage('rentselect_inmuebles')).toBeNull();
    expect(
      reconciliarDesdeStorage('rentselect_inmuebles', JSON.stringify([item('inm-x')]), [item('inm-a')])
    ).toBeNull();
  });

  it('claves desconocidas y clave nula → null', () => {
    expect(reconciliarDesdeStorage('rentselect_otro', JSON.stringify([item('x')]), [])).toBeNull();
    expect(reconciliarDesdeStorage(null, JSON.stringify([item('x')]), [])).toBeNull();
  });

  it('el módulo no importa Firebase ni la caché de snapshots (sin vía de escritura)', () => {
    const fuente = readFileSync(resolve(RAIZ, 'src/lib/sincronizacionPestanas.ts'), 'utf-8');
    // Sin comentarios: las menciones documentales no cuentan, sólo el código.
    const src = fuente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    for (const prohibido of [
      'firebase/firestore',
      'firebase/auth',
      'snapshotInmueblesCache',
      'setDoc',
      'updateDoc',
      'deleteDoc',
      'writeBatch',
      'localStorage',
    ]) {
      expect(src, prohibido).not.toContain(prohibido);
    }
    expect(src).not.toMatch(/^\s*import\s/m);
  });

  it('snapshotInmueblesCache.ts sigue intacto (única vía Firestore → estado)', () => {
    const src = readFileSync(resolve(RAIZ, 'src/lib/snapshotInmueblesCache.ts'), 'utf-8');
    expect(src).toContain('procesarSnapshotInmuebles');
    expect(src).not.toContain('sincronizacionPestanas');
  });
});

describe('cableado en App.tsx', () => {
  it('registra el listener con limpieza y sólo para las 3 claves', () => {
    const src = readFileSync(resolve(RAIZ, 'src/App.tsx'), 'utf-8');
    expect(src).toContain("from './lib/sincronizacionPestanas'");
    expect(src).toContain("window.addEventListener('storage', sincronizarDesdeOtraPestana)");
    expect(src).toContain('window.removeEventListener(\'storage\', sincronizarDesdeOtraPestana)');
    expect(src).toContain('reconciliarDesdeStorage(e.key, e.newValue, prev)');
    // Inmuebles fuera del listener: setInmuebles no aparece en ese bloque.
    const bloque = src.slice(
      src.indexOf('const sincronizarDesdeOtraPestana'),
      src.indexOf('window.removeEventListener(\'storage\'')
    );
    expect(bloque).not.toContain('setInmuebles');
    expect(bloque).not.toContain('saveInmuebleFirestore');
  });
});
