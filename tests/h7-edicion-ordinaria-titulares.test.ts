/**
 * H7 — LA EDICIÓN ORDINARIA NO ES PROPIETARIA DE "titularesIds"
 * =============================================================
 * El formulario de edición trabaja sobre una INSTANTÁNEA del inmueble y puede
 * quedarse abierto mientras el estado patrimonial cambia por otras vías
 * (alta de cotitular, cierre H9, transmisión K.2, otra sesión). Si el guardado
 * ordinario persistiera esa fotografía completa, devolvería al documento un
 * índice caducado.
 *
 * Esta batería ataca la FRONTERA DE PERSISTENCIA REAL: importa
 * `saveInmuebleOrdinarioFirestore` y observa el payload exacto que llega a
 * `setDoc`, con un almacén que reproduce la semántica de `merge: true`.
 * No basta con comprobar el resultado final: se exige que el campo ni siquiera
 * viaje en el payload (§12, H7-8).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const root = (rel: string) => resolve(process.cwd(), rel);

// --- almacén con semántica merge ------------------------------------------
type Ref = { col: string; id: string };
let almacen: Map<string, Record<string, unknown>> = new Map();
let escrituras: Array<{ ref: Ref; datos: Record<string, unknown>; opciones?: { merge?: boolean } }> = [];

const clave = (r: Ref) => `${r.col}/${r.id}`;

vi.mock('firebase/app', () => ({ initializeApp: () => ({}), getApps: () => [] }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), onAuthStateChanged: () => () => {} }));
vi.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  ref: () => ({}),
  uploadBytes: async () => ({}),
  getDownloadURL: async () => '',
  deleteObject: async () => {},
  uploadBytesResumable: () => ({}),
  listAll: async () => ({ items: [], prefixes: [] }),
}));
vi.mock('firebase/firestore', async () => {
  const noop = () => ({});
  return {
    getFirestore: () => ({ __db: true }),
    doc: (_db: unknown, col: string, id: string) => ({ col, id }),
    collection: (_db: unknown, col: string) => ({ col }),
    setDoc: async (ref: Ref, datos: Record<string, unknown>, opciones?: { merge?: boolean }) => {
      escrituras.push({ ref, datos, opciones });
      const k = clave(ref);
      almacen.set(k, opciones?.merge ? { ...(almacen.get(k) || {}), ...datos } : { ...datos });
    },
    getDoc: async (ref: Ref) => {
      const datos = almacen.get(clave(ref));
      return { exists: () => datos !== undefined, id: ref.id, data: () => datos };
    },
    updateDoc: async () => {},
    deleteDoc: async () => {},
    addDoc: async () => ({ id: 'x' }),
    getDocs: async () => ({ docs: [], empty: true, forEach: () => {} }),
    onSnapshot: () => () => {},
    query: noop,
    where: noop,
    orderBy: noop,
    limit: noop,
    serverTimestamp: () => 'ts',
    writeBatch: () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} }),
    runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({}),
    arrayUnion: (v: unknown) => ({ __arrayUnion: v }),
    arrayRemove: (v: unknown) => ({ __arrayRemove: v }),
    increment: (v: unknown) => ({ __increment: v }),
    enableIndexedDbPersistence: async () => {},
    initializeFirestore: () => ({ __db: true }),
    persistentLocalCache: noop,
    persistentMultipleTabManager: noop,
  };
});

import { saveInmuebleFirestore, saveInmuebleOrdinarioFirestore } from '../src/lib/firebase';
import {
  CAMPOS_FUERA_DE_EDICION_ORDINARIA,
  fusionarEdicionOrdinaria,
  payloadOrdinarioInmueble,
} from '../src/lib/edicionOrdinariaInmueble';
import type { Inmueble } from '../src/types';

function inmueble(parcial: Partial<Inmueble> & { id: string }): Inmueble {
  return {
    direccion: 'Calle Mayor 1',
    ciudad: 'Alicante',
    precio: 900,
    estado: 'disponible',
    habitaciones: 3,
    banos: 2,
    superficie: 95,
    candidatosCount: 0,
    fianzaMeses: 2,
    ...parcial,
  } as Inmueble;
}

/** Lo que el formulario tenía cargado cuando se abrió. */
const sembrarAlmacen = (inm: Inmueble) => almacen.set(`inmuebles/${inm.id}`, JSON.parse(JSON.stringify(inm)));
const guardado = (id: string) => almacen.get(`inmuebles/${id}`) as Record<string, unknown>;
const escriturasInmuebles = () => escrituras.filter((e) => e.ref.col === 'inmuebles');

beforeEach(() => {
  almacen = new Map();
  escrituras = [];
});

// ===========================================================================
describe('H7-1 — la edición ordinaria no escribe titularesIds', () => {
  it('el payload enviado NO contiene el campo y el índice almacenado no cambia', async () => {
    sembrarAlmacen(inmueble({ id: 'A', titularesIds: ['pA', 'pB'] }));

    // El formulario edita un campo ordinario sobre su instantánea.
    const editado = inmueble({ id: 'A', titularesIds: ['pA', 'pB'], direccion: 'Calle Nueva 7' });
    const ok = await saveInmuebleOrdinarioFirestore(editado);

    expect(ok).toBe(true);
    const payload = escriturasInmuebles()[0].datos;
    expect('titularesIds' in payload).toBe(false); // ausencia estructural
    expect(escriturasInmuebles()[0].opciones).toEqual({ merge: true });
    expect(guardado('A').titularesIds).toEqual(['pA', 'pB']); // intacto
    expect(guardado('A').direccion).toBe('Calle Nueva 7'); // lo ordinario sí se guarda
  });

  it('tampoco lo escribe cuando el formulario nunca tuvo índice', async () => {
    sembrarAlmacen(inmueble({ id: 'A', titularesIds: ['pA'] }));
    await saveInmuebleOrdinarioFirestore(inmueble({ id: 'A', precio: 1200 }));

    expect('titularesIds' in escriturasInmuebles()[0].datos).toBe(false);
    expect(guardado('A').titularesIds).toEqual(['pA']);
    expect(guardado('A').precio).toBe(1200);
  });
});

// ===========================================================================
describe('H7-2 — un titular cerrado no vuelve', () => {
  it('instantánea [A,B] + cierre H9 de A ⇒ queda [B], nunca [A,B]', async () => {
    const abierto = inmueble({ id: 'A', titularesIds: ['pA', 'pB'], direccion: 'Calle Mayor 1' });
    sembrarAlmacen(abierto);

    // … mientras el formulario está abierto, H9 cierra la titularidad de pA.
    almacen.set('inmuebles/A', { ...guardado('A'), titularesIds: ['pB'] });

    // El usuario guarda su edición ordinaria con la instantánea antigua.
    await saveInmuebleOrdinarioFirestore({ ...abierto, direccion: 'Calle Mayor 3' });

    expect(guardado('A').titularesIds).toEqual(['pB']);
    expect(guardado('A').titularesIds).not.toContain('pA');
    expect(guardado('A').direccion).toBe('Calle Mayor 3');
  });
});

// ===========================================================================
describe('H7-3 — un cotitular añadido después sobrevive', () => {
  it('instantánea [A] + alta de B ⇒ queda [A,B], nunca [A]', async () => {
    const abierto = inmueble({ id: 'A', titularesIds: ['pA'] });
    sembrarAlmacen(abierto);

    almacen.set('inmuebles/A', { ...guardado('A'), titularesIds: ['pA', 'pB'] });

    await saveInmuebleOrdinarioFirestore({ ...abierto, superficie: 110 });

    expect(guardado('A').titularesIds).toEqual(['pA', 'pB']);
    expect(guardado('A').superficie).toBe(110);
  });
});

// ===========================================================================
describe('H7-4 — una transmisión K.2 concurrente no se revierte', () => {
  it('instantánea [A] + transmisión A→B ⇒ queda [B], nunca vuelve [A]', async () => {
    const abierto = inmueble({ id: 'A', titularesIds: ['pA'], propietarioId: 'pA' });
    sembrarAlmacen(abierto);

    // K.2 transmite A→B de forma atómica mientras el formulario sigue abierto.
    almacen.set('inmuebles/A', { ...guardado('A'), titularesIds: ['pB'], propietarioId: 'pB' });

    await saveInmuebleOrdinarioFirestore({ ...abierto, descripcion: 'Reformado' });

    expect(guardado('A').titularesIds).toEqual(['pB']);
    expect(guardado('A').descripcion).toBe('Reformado');
  });

  it('el estado LOCAL tampoco resucita al titular transmitido', () => {
    const vigente = inmueble({ id: 'A', titularesIds: ['pB'] }); // ya actualizado por la escucha
    const instantanea = inmueble({ id: 'A', titularesIds: ['pA'], descripcion: 'Reformado' });

    const fusionado = fusionarEdicionOrdinaria(vigente, instantanea);

    expect(fusionado.titularesIds).toEqual(['pB']);
    expect(fusionado.descripcion).toBe('Reformado');
  });
});

// ===========================================================================
describe('H7-5 — los flujos patrimoniales siguen pudiendo escribir el índice', () => {
  it('el filtro NO es global: saveInmuebleFirestore conserva su capacidad', async () => {
    sembrarAlmacen(inmueble({ id: 'A', titularesIds: ['pA'] }));

    await saveInmuebleFirestore(inmueble({ id: 'A', titularesIds: ['pA', 'pB'] }));

    expect(guardado('A').titularesIds).toEqual(['pA', 'pB']);
  });

  it('H9 sigue retirando al titular dentro de su transacción (código intacto)', () => {
    const fuente = readFileSync(root('src/lib/titularidadesFirestore.ts'), 'utf8');
    const inicio = fuente.indexOf('export async function cerrarTitularidad');
    const cuerpo = fuente.slice(inicio, fuente.indexOf('\n}', inicio));
    expect(cuerpo).toContain('runTransaction');
    expect(cuerpo).toContain("titularesIds: indice.filter");
  });
});

// ===========================================================================
describe('H7-6 — K.2 intacta', () => {
  const fuenteK2 = readFileSync(root('src/lib/transmisionPatrimonialFirestore.ts'), 'utf8');

  it('sigue siendo una única transacción y no pasa por la edición ordinaria', () => {
    expect(fuenteK2.match(/runTransaction\(/g) || []).toHaveLength(1);
    expect(fuenteK2).not.toContain('saveInmuebleOrdinarioFirestore');
    expect(fuenteK2).not.toContain('payloadOrdinarioInmueble');
  });
});

// ===========================================================================
describe('H7-7 — los campos ordinarios se siguen guardando', () => {
  it('sólo falta titularesIds: ningún otro campo desaparece del payload', async () => {
    const completo = inmueble({
      id: 'A',
      titularesIds: ['pA', 'pB'],
      propietarioId: 'pA',
      propietarioPrincipalId: 'pA',
      propietarioSecundarioId: 'pB',
      descripcion: 'Ático con terraza',
      referenciaCatastral: '1234567AB1234C0001XY',
      codigoPostal: '03001',
      ibanCobro: 'ES7620770024003102575766',
      modalidadAlquiler: 'completo',
      imagenUrl: 'https://example.com/a.jpg',
    } as Partial<Inmueble> & { id: string });
    sembrarAlmacen(inmueble({ id: 'A' }));

    await saveInmuebleOrdinarioFirestore(completo);

    const payload = escriturasInmuebles()[0].datos;
    const esperados = Object.keys(completo).filter((k) => k !== 'titularesIds');
    expect(Object.keys(payload).sort()).toEqual(esperados.sort());
    for (const campo of esperados) {
      expect(payload[campo]).toEqual((completo as unknown as Record<string, unknown>)[campo]);
    }
  });

  it('la diferencia antes/después del payload es EXACTAMENTE un campo', () => {
    const completo = inmueble({ id: 'A', titularesIds: ['pA'], descripcion: 'x' });
    const antes = Object.keys(completo);
    const despues = Object.keys(payloadOrdinarioInmueble(completo));
    expect(antes.filter((k) => !despues.includes(k))).toEqual(['titularesIds']);
    expect(despues.filter((k) => !antes.includes(k))).toEqual([]);
  });
});

// ===========================================================================
describe('H7-8 — ausencia estructural del campo', () => {
  it('el contrato declara titularesIds fuera de la edición ordinaria', () => {
    expect([...CAMPOS_FUERA_DE_EDICION_ORDINARIA]).toEqual(['titularesIds']);
  });

  it('el payload ordinario no tiene la propiedad ni siquiera como undefined', () => {
    const p = payloadOrdinarioInmueble(inmueble({ id: 'A', titularesIds: ['pA'] }));
    expect(Object.prototype.hasOwnProperty.call(p, 'titularesIds')).toBe(false);
    expect(Object.keys(p)).not.toContain('titularesIds');
    expect(JSON.stringify(p)).not.toContain('titularesIds');
  });

  it('la única vía de edición ordinaria de App.tsx usa la frontera H7', () => {
    const app = readFileSync(root('src/App.tsx'), 'utf8');
    const inicio = app.indexOf('const handleUpdateInmueble');
    const cuerpo = app.slice(inicio, app.indexOf('\n  };', inicio));
    expect(cuerpo).toContain('saveInmuebleOrdinarioFirestore(updatedInmueble)');
    expect(cuerpo).toContain('fusionarEdicionOrdinaria');
    // y NO la vía completa
    expect(/\bsaveInmuebleFirestore\(updatedInmueble\)/.test(cuerpo)).toBe(false);
  });

  it('el guardado ordinario de InmueblesSection sigue pasando por onUpdateInmueble', () => {
    const sec = readFileSync(root('src/components/sections/InmueblesSection.tsx'), 'utf8');
    expect(sec).toContain('const guardarCambios = onUpdateInmueble');
    // la sección no escribe el índice por su cuenta
    expect(/titularesIds\s*:/.test(sec)).toBe(false);
  });
});
