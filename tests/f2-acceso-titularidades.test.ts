/**
 * F2 — ACCESO Y CONSULTA DE TITULARIDADES
 * ========================================
 * Comprueba las dos piezas del circuito:
 *  1) el índice `inmuebles.titularesIds[]` + claves deterministas
 *     `{inmuebleId}__{propietarioId}` resuelven la titularidad con `get`
 *     individuales: SIN `or()` y SIN `list` global;
 *  2) el circuito funciona aunque un TERCERO haya creado la titularidad: el
 *     propietario ve el inmueble, lee el índice y obtiene todas las
 *     titularidades sin conocer de antemano el id del tercero.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const root = (rel: string) => resolve(process.cwd(), rel);

// --- dobles de Firestore ----------------------------------------------------
type Oyente = { ref: { col: string; id: string }; ok: (snap: unknown) => void; err?: (e: unknown) => void };
let oyentes: Oyente[] = [];
let lote: { operaciones: Array<{ ref: unknown; datos: unknown; opciones?: unknown }>; commit: () => Promise<void> };
let setDocLlamadas: Array<{ ref: unknown; datos: unknown }> = [];

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  onSnapshot: (ref: { col: string; id: string }, ok: (s: unknown) => void, err?: (e: unknown) => void) => {
    const oyente: Oyente = { ref, ok, err };
    oyentes.push(oyente);
    return () => {
      oyentes = oyentes.filter((o) => o !== oyente);
    };
  },
  writeBatch: () => {
    lote = {
      operaciones: [],
      commit: vi.fn(async () => {}),
    };
    return {
      set: (ref: unknown, datos: unknown, opciones?: unknown) => lote.operaciones.push({ ref, datos, opciones }),
      commit: () => lote.commit(),
    };
  },
  arrayUnion: (valor: unknown) => ({ __arrayUnion: valor }),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  setDoc: vi.fn(async (ref: unknown, datos: unknown) => {
    setDocLlamadas.push({ ref, datos });
  }),
}));

vi.mock('../src/lib/firebase', () => ({ db: { __db: true } }));

import {
  clavesDeInmuebles,
  cerrarTitularidad,
  guardarTitularidad,
  subscribeTitularidadesEscopo,
} from '../src/lib/titularidadesFirestore';
import { idTitularidad } from '../src/utils/titularidadesEngine';
import type { Inmueble, Titularidad } from '../src/types';

function inmueble(parcial: Partial<Inmueble> & { id: string }): Inmueble {
  return { direccion: 'Calle Test', ciudad: 'Valencia', precio: 700, estado: 'disponible', habitaciones: 2, banos: 1, superficie: 70, candidatosCount: 0, fianzaMeses: 1, ...parcial } as Inmueble;
}

const reglas = readFileSync(root('firestore.rules'), 'utf8');

beforeEach(() => {
  oyentes = [];
  setDocLlamadas = [];
});

describe('F2 — índice y claves deterministas', () => {
  it('las claves salen del índice titularesIds del inmueble', () => {
    const claves = clavesDeInmuebles([inmueble({ id: 'A', propietarioId: 'p1', titularesIds: ['p2', 'p3'] })]);
    expect(claves.map((c) => c.clave)).toEqual(['A__p1', 'A__p2', 'A__p3']);
  });

  it('incluye la titularidad creada por un TERCERO sin conocer su id', () => {
    // El inmueble es de p1; pX creó una titularidad y quedó en el índice.
    const claves = clavesDeInmuebles([inmueble({ id: 'A', propietarioId: 'p1', titularesIds: ['p1', 'pX'] })], ['p1']);
    expect(claves.some((c) => c.propietarioId === 'pX')).toBe(true);
  });

  it('sin duplicados cuando el propietario aparece por varias vías', () => {
    const claves = clavesDeInmuebles(
      [inmueble({ id: 'A', propietarioId: 'p1', propietarioPrincipalId: 'p1', titularesIds: ['p1'] })],
      ['p1'],
    );
    expect(claves).toHaveLength(1);
  });

  it('la clave es determinista y reversible', () => {
    expect(idTitularidad('A', 'p1')).toBe('A__p1');
    expect(clavesDeInmuebles([inmueble({ id: 'A', propietarioId: 'p1' })])[0].clave).toBe(idTitularidad('A', 'p1'));
  });
});

describe('F2 — suscripción por clave (ni list ni or)', () => {
  it('abre un listener por clave determinista y entrega todas las titularidades', () => {
    const recibidas: Titularidad[][] = [];
    const cancelar = subscribeTitularidadesEscopo(
      { inmuebles: [inmueble({ id: 'A', propietarioId: 'p1', titularesIds: ['p1', 'pX'] })], propietarioId: 'p1' },
      (t) => recibidas.push(t),
    );
    expect(oyentes.map((o) => o.ref.id).sort()).toEqual(['A__p1', 'A__pX']);

    // El documento de pX lo creó un tercero: aparece igualmente.
    oyentes[0].ok({ id: 'A__p1', exists: () => true, data: () => ({ inmuebleId: 'A', propietarioId: 'p1', porcentajeTitularidad: 60, estado: 'VIGENTE' }) });
    oyentes[1].ok({ id: 'A__pX', exists: () => true, data: () => ({ inmuebleId: 'A', propietarioId: 'pX', porcentajeTitularidad: 40, estado: 'VIGENTE' }) });

    const ultimas = recibidas[recibidas.length - 1];
    expect(ultimas.map((t) => t.propietarioId)).toEqual(['p1', 'pX']);
    cancelar();
    expect(oyentes).toHaveLength(0);
  });

  it('sin inmuebles ni propietario no abre ningún listener', () => {
    const cb = vi.fn();
    subscribeTitularidadesEscopo({ inmuebles: [] }, cb);
    expect(oyentes).toHaveLength(0);
    expect(cb).toHaveBeenCalledWith([]);
  });

  it('un permiso denegado sobre una clave ajena no contamina las demás', () => {
    const recibidas: Titularidad[][] = [];
    subscribeTitularidadesEscopo(
      { inmuebles: [inmueble({ id: 'A', propietarioId: 'p1', titularesIds: ['pX'] })], propietarioId: 'p1' },
      (t) => recibidas.push(t),
    );
    oyentes[0].ok({ id: 'A__p1', exists: () => true, data: () => ({ inmuebleId: 'A', propietarioId: 'p1', estado: 'VIGENTE' }) });
    oyentes[1].err?.({ code: 'permission-denied' });
    expect(recibidas[recibidas.length - 1].map((t) => t.propietarioId)).toEqual(['p1']);
  });
});

describe('F2 — escritura atómica del índice', () => {
  it('el alta escribe titularidad + arrayUnion en el mismo lote', async () => {
    const ok = await guardarTitularidad({ inmuebleId: 'A', propietarioId: 'p2', porcentaje: 30 });
    expect(ok).toBe(true);
    expect(lote.operaciones).toHaveLength(2);
    const [titularidad, indice] = lote.operaciones;
    expect((titularidad.ref as { id: string }).id).toBe('A__p2');
    expect((titularidad.datos as { porcentajeTitularidad: number }).porcentajeTitularidad).toBe(30);
    expect((indice.ref as { id: string }).id).toBe('A');
    expect(indice.datos).toEqual({ titularesIds: { __arrayUnion: 'p2' } });
  });

  it('el porcentaje desconocido se persiste como null (PENDIENTE, no 50/50)', async () => {
    await guardarTitularidad({ inmuebleId: 'A', propietarioId: 'p2' });
    expect((lote.operaciones[0].datos as { porcentajeTitularidad: unknown }).porcentajeTitularidad).toBeNull();
  });

  it('el CIERRE no borra: escribe estado CERRADA con fecha y motivo', async () => {
    const titularidad: Titularidad = {
      id: 'A__p2', inmuebleId: 'A', propietarioId: 'p2', porcentajeTitularidad: 30,
      estado: 'VIGENTE', fechaInicio: '2026-01-01', createdAt: '2026-01-01', updatedAt: '2026-01-01',
    };
    const ok = await cerrarTitularidad({ titularidad, motivo: 'VENTA', detalle: 'Escritura' });
    expect(ok).toBe(true);
    expect(setDocLlamadas).toHaveLength(1); // sólo escritura: nunca deleteDoc
    const datos = setDocLlamadas[0].datos as { estado: string; motivoCierre: string; fechaCierre?: string };
    expect(datos.estado).toBe('CERRADA');
    expect(datos.motivoCierre).toBe('VENTA');
    expect(datos.fechaCierre).toBeTruthy();
  });
});

describe('F2 — reglas de Firestore', () => {
  // Extrae el bloque `match ... { ... }` completo contando llaves desde la
  // PRIMERA llave de apertura posterior a la línea de la marca (los `{param}`
  // de la propia marca no cuentan).
  const bloque = (marca: string): string => {
    const inicio = reglas.indexOf(marca);
    expect(inicio, `falta ${marca}`).toBeGreaterThan(-1);
    const finLinea = reglas.indexOf('\n', inicio);
    // La llave de apertura es la ÚLTIMA de la línea de la marca
    // (`match /x/{param} {`): la de `{param}` no cuenta.
    let i = reglas.lastIndexOf('{', finLinea);
    expect(i, `sin llave de apertura en ${marca}`).toBeGreaterThan(-1);
    let profundidad = 0;
    for (; i < reglas.length; i += 1) {
      if (reglas[i] === '{') profundidad += 1;
      if (reglas[i] === '}') {
        profundidad -= 1;
        if (profundidad === 0) return reglas.slice(inicio, i + 1);
      }
    }
    return reglas.slice(inicio);
  };

  it('existe la colección titularidades como hermana de inmuebles', () => {
    const titularidades = bloque('match /titularidades/{titularidadId}');
    expect(titularidades).toContain('allow list: if false;');
  });

  it('prohíbe el borrado físico de una titularidad', () => {
    expect(bloque('match /titularidades/{titularidadId}')).toContain('allow delete: if false;');
  });

  it('la clave del documento es su identidad: inmuebleId__propietarioId', () => {
    expect(bloque('match /titularidades/{titularidadId}')).toContain("titularidadId == d.inmuebleId + '__' + d.propietarioId");
  });

  it('el cierre exige fecha y motivo', () => {
    const t = bloque('match /titularidades/{titularidadId}');
    expect(t).toContain('fechaCierre');
    expect(t).toContain('motivoCierre');
  });

  it('la cotitularidad (titularesIds) da acceso al inmueble en las reglas', () => {
    expect(reglas).toContain("d.titularesIds.hasAny([myPropId()])");
  });

  it('el cliente consulta la cotitularidad con array-contains (demostrable)', () => {
    const cliente = readFileSync(root('src/lib/firebase.ts'), 'utf8');
    expect(cliente).toContain("where('titularesIds', 'array-contains', pid)");
  });

  it('la capa de titularidades no usa or() ni list global', () => {
    const capa = readFileSync(root('src/lib/titularidadesFirestore.ts'), 'utf8');
    // Se analiza el CÓDIGO, no los comentarios (que documentan precisamente
    // que NO se usa `or()`).
    const codigo = capa
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
      .join('\n');
    expect(codigo).not.toMatch(/\bor\s*\(/);
    expect(codigo).not.toMatch(/\bcollection\s*\(/);
    expect(codigo).not.toMatch(/\bquery\s*\(/);
  });
});
