/**
 * H9 — CIERRE DE TITULARIDAD: EL ÍNDICE REFLEJA RELACIONES VIGENTES
 * =================================================================
 * Una titularidad CERRADA deja de representar una relación vigente. Como
 * `inmuebles.titularesIds[]` es a la vez índice de descubrimiento Y vía de
 * acceso (Rules: `titularesIds.hasAny([myPropId()])`, tanto en `/inmuebles`
 * como en `/operaciones` tras H8), el titular cerrado debe salir del índice.
 *
 * Invariantes que fija esta batería:
 *  · el histórico `/titularidades/{inmuebleId}__{propietarioId}` NUNCA se borra
 *    ni se reutiliza, y conserva porcentaje, fechas, motivo, actor y fiscalidad;
 *  · los cotitulares legítimos NO se revocan jamás;
 *  · todo ocurre en UNA transacción, con las lecturas antes de las escrituras,
 *    recomponiendo el índice desde lo leído DENTRO de la transacción (nunca
 *    desde la instantánea del llamante);
 *  · el modelo moderno `/titularidades` es quien decide: el campo legado
 *    `propietarioSecundarioId` no interviene;
 *  · no se introduce ninguna vía nueva de autorización: sólo se retira una
 *    entrada del índice que ya existía.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const root = (rel: string) => resolve(process.cwd(), rel);

// --- dobles de Firestore ----------------------------------------------------
let almacen: Map<string, Record<string, unknown>> = new Map();
let txLecturas: string[] = [];
let txEscrituras: Array<{ clave: string; datos: Record<string, unknown>; opciones?: unknown }> = [];
let ordenOperaciones: string[] = [];
let setDocSueltos: number = 0;
let transacciones: number = 0;
/** Se dispara entre la 1ª lectura y la 1ª escritura: simula una carrera. */
let interferencia: null | (() => void) = null;

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  onSnapshot: () => () => {},
  writeBatch: () => ({ set: () => {}, commit: async () => {} }),
  arrayUnion: (valor: unknown) => ({ __arrayUnion: valor }),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  setDoc: vi.fn(async () => {
    setDocSueltos += 1;
  }),
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    transacciones += 1;
    return fn({
      get: async (ref: { col: string; id: string }) => {
        const clave = `${ref.col}/${ref.id}`;
        txLecturas.push(clave);
        ordenOperaciones.push(`LEER ${clave}`);
        if (interferencia) {
          const f = interferencia;
          interferencia = null;
          f();
        }
        const datos = almacen.get(clave);
        return { exists: () => datos !== undefined, id: ref.id, data: () => (datos ? { ...datos } : undefined) };
      },
      set: (ref: { col: string; id: string }, datos: Record<string, unknown>, opciones?: unknown) => {
        const clave = `${ref.col}/${ref.id}`;
        txEscrituras.push({ clave, datos, opciones });
        ordenOperaciones.push(`ESCRIBIR ${clave}`);
        almacen.set(clave, { ...(almacen.get(clave) || {}), ...datos });
      },
      delete: () => {
        throw new Error('H9: el cierre jamás borra documentos');
      },
    });
  },
}));

vi.mock('../src/lib/firebase', () => ({ db: { __db: true } }));

import { cerrarTitularidad, clavesDeInmuebles } from '../src/lib/titularidadesFirestore';
import { idTitularidad, sePuedeCerrar } from '../src/utils/titularidadesEngine';
import type { Inmueble, Titularidad } from '../src/types';

// --- utilidades -------------------------------------------------------------
function titularidad(inmuebleId: string, propietarioId: string, extra: Partial<Titularidad> = {}): Titularidad {
  return {
    id: idTitularidad(inmuebleId, propietarioId),
    inmuebleId,
    propietarioId,
    porcentajeTitularidad: 50,
    estado: 'VIGENTE',
    fechaInicio: '2020-03-01',
    createdAt: '2020-03-01T00:00:00.000Z',
    updatedAt: '2020-03-01T00:00:00.000Z',
    ...extra,
  } as Titularidad;
}

function sembrar(inmuebleId: string, titulares: string[], extraInmueble: Record<string, unknown> = {}) {
  almacen.set(`inmuebles/${inmuebleId}`, { id: inmuebleId, titularesIds: [...titulares], ...extraInmueble });
}

const indiceDe = (inmuebleId: string) =>
  (almacen.get(`inmuebles/${inmuebleId}`)?.titularesIds as string[] | undefined) ?? [];

const docTitularidad = (id: string) => almacen.get(`titularidades/${id}`) as Record<string, unknown> | undefined;

const escriturasEn = (coleccion: string) => txEscrituras.filter((e) => e.clave.startsWith(`${coleccion}/`));

beforeEach(() => {
  almacen = new Map();
  txLecturas = [];
  txEscrituras = [];
  ordenOperaciones = [];
  setDocSueltos = 0;
  transacciones = 0;
  interferencia = null;
});

// ============================================================================
describe('H9-1 — único titular', () => {
  it('cerrar al único titular vacía el índice y deja la titularidad CERRADA', async () => {
    const t = titularidad('A', 'pA', { porcentajeTitularidad: 100 });
    almacen.set(`titularidades/${t.id}`, { ...t });
    sembrar('A', ['pA'], { propietarioId: 'pA' });

    const ok = await cerrarTitularidad({ titularidad: t, motivo: 'VENTA', detalle: 'Escritura 2026' });

    expect(ok).toBe(true);
    expect(indiceDe('A')).toEqual([]);
    expect(docTitularidad('A__pA')?.estado).toBe('CERRADA');
    expect(docTitularidad('A__pA')?.motivoCierre).toBe('VENTA');
    expect(docTitularidad('A__pA')?.fechaCierre).toBeTruthy();
  });

  it('el histórico sigue existiendo: no se borra ni se vacía el documento', async () => {
    const t = titularidad('A', 'pA', { porcentajeTitularidad: 100 });
    almacen.set(`titularidades/${t.id}`, { ...t });
    sembrar('A', ['pA']);

    await cerrarTitularidad({ titularidad: t, motivo: 'HERENCIA' });

    expect(almacen.has('titularidades/A__pA')).toBe(true);
    expect(docTitularidad('A__pA')?.inmuebleId).toBe('A');
    expect(docTitularidad('A__pA')?.propietarioId).toBe('pA');
    expect(docTitularidad('A__pA')?.fechaInicio).toBe('2020-03-01');
  });

  it('NO toca propietarioId: retirar al titular canónico es una transmisión (K.2), no un cierre', async () => {
    const t = titularidad('A', 'pA');
    almacen.set(`titularidades/${t.id}`, { ...t });
    sembrar('A', ['pA'], { propietarioId: 'pA', propietarioPrincipalId: 'pA' });

    await cerrarTitularidad({ titularidad: t, motivo: 'OTRO' });

    const inm = almacen.get('inmuebles/A') as Record<string, unknown>;
    expect(inm.propietarioId).toBe('pA');
    expect(inm.propietarioPrincipalId).toBe('pA');
    // La escritura sobre el inmueble sólo contiene el índice.
    expect(Object.keys(escriturasEn('inmuebles')[0].datos)).toEqual(['titularesIds']);
  });
});

// ============================================================================
describe('H9-2 — dos cotitulares', () => {
  it('cerrar a A deja exactamente [B]', async () => {
    const tA = titularidad('A', 'pA');
    almacen.set(`titularidades/${tA.id}`, { ...tA });
    almacen.set('titularidades/A__pB', { ...titularidad('A', 'pB') });
    sembrar('A', ['pA', 'pB']);

    await cerrarTitularidad({ titularidad: tA, motivo: 'DIVORCIO' });

    expect(indiceDe('A')).toEqual(['pB']);
  });

  it('la titularidad del cotitular NO se toca: sigue VIGENTE y sin escrituras', async () => {
    const tA = titularidad('A', 'pA');
    almacen.set(`titularidades/${tA.id}`, { ...tA });
    almacen.set('titularidades/A__pB', { ...titularidad('A', 'pB') });
    sembrar('A', ['pA', 'pB']);

    await cerrarTitularidad({ titularidad: tA, motivo: 'DIVORCIO' });

    expect(docTitularidad('A__pB')?.estado).toBe('VIGENTE');
    expect(escriturasEn('titularidades').map((e) => e.clave)).toEqual(['titularidades/A__pA']);
  });
});

// ============================================================================
describe('H9-3 — tres cotitulares', () => {
  it('cerrar a A deja [B,C]: nunca [B], ni [C], ni []', async () => {
    const tA = titularidad('A', 'pA', { porcentajeTitularidad: 33.34 });
    almacen.set(`titularidades/${tA.id}`, { ...tA });
    sembrar('A', ['pA', 'pB', 'pC']);

    await cerrarTitularidad({ titularidad: tA, motivo: 'DISOLUCION_CONDOMINIO' });

    expect(indiceDe('A')).toEqual(['pB', 'pC']);
    expect(indiceDe('A')).toHaveLength(2);
  });

  it('cerrar a un cotitular intermedio conserva el orden de los demás', async () => {
    const tB = titularidad('A', 'pB');
    almacen.set(`titularidades/${tB.id}`, { ...tB });
    sembrar('A', ['pA', 'pB', 'pC', 'pD']);

    await cerrarTitularidad({ titularidad: tB, motivo: 'VENTA' });

    expect(indiceDe('A')).toEqual(['pA', 'pC', 'pD']);
  });
});

// ============================================================================
describe('H9-4 — otra relación vigente del mismo titular', () => {
  // La clave es DETERMINISTA: `{inmuebleId}__{propietarioId}`. Por tanto existe
  // como máximo UN documento por par (inmueble, propietario) y es
  // estructuralmente imposible que un titular conserve otra relación vigente
  // sobre EL MISMO inmueble tras cerrar la suya. Se fija la invariante.
  it('la clave determinista impide dos relaciones distintas del mismo par', () => {
    expect(idTitularidad('A', 'pA')).toBe('A__pA');
    expect(idTitularidad('A', 'pA')).toBe(idTitularidad('A', 'pA'));
    expect(idTitularidad('A', 'pA')).not.toBe(idTitularidad('B', 'pA'));
  });

  it('cerrar en un inmueble NO afecta a la titularidad vigente del mismo titular en otro inmueble', async () => {
    const tA1 = titularidad('A', 'pA');
    almacen.set(`titularidades/${tA1.id}`, { ...tA1 });
    almacen.set('titularidades/B__pA', { ...titularidad('B', 'pA') });
    sembrar('A', ['pA', 'pB']);
    sembrar('B', ['pA']);

    await cerrarTitularidad({ titularidad: tA1, motivo: 'VENTA' });

    expect(indiceDe('A')).toEqual(['pB']);
    expect(indiceDe('B')).toEqual(['pA']); // intacto
    expect(docTitularidad('B__pA')?.estado).toBe('VIGENTE');
    expect(txEscrituras.some((e) => e.clave.includes('/B'))).toBe(false);
  });
});

// ============================================================================
describe('H9-5 — histórico íntegro', () => {
  it('conserva porcentaje, fechas, actor y datos fiscales del documento ALMACENADO', async () => {
    const guardada = titularidad('A', 'pA', {
      porcentajeTitularidad: 37.5,
      fechaInicio: '2015-06-30',
      createdAt: '2015-06-30T10:00:00.000Z',
      valorAdquisicion: 120000,
      referenciaCatastral: '1234567AB1234C0001XY',
    } as Partial<Titularidad>);
    almacen.set(`titularidades/${guardada.id}`, { ...guardada });
    sembrar('A', ['pA']);

    // El llamante trae una instantánea OBSOLETA (porcentaje y fecha viejos).
    const obsoleta = titularidad('A', 'pA', { porcentajeTitularidad: 50, fechaInicio: '2099-01-01' });

    await cerrarTitularidad({
      titularidad: obsoleta,
      motivo: 'DONACION',
      detalle: 'Donación a hijo',
      actor: { id: 'u1', nombre: 'Gestor' },
    });

    const doc = docTitularidad('A__pA')!;
    expect(doc.porcentajeTitularidad).toBe(37.5); // no lo pisa la instantánea
    expect(doc.fechaInicio).toBe('2015-06-30');
    expect(doc.createdAt).toBe('2015-06-30T10:00:00.000Z');
    expect(doc.valorAdquisicion).toBe(120000);
    expect(doc.referenciaCatastral).toBe('1234567AB1234C0001XY');
    expect(doc.estado).toBe('CERRADA');
    expect(doc.motivoCierre).toBe('DONACION');
    expect(doc.detalleCierre).toBe('Donación a hijo');
    expect(doc.cerradoPorId).toBe('u1');
    expect(doc.cerradoPorNombre).toBe('Gestor');
  });

  it('escribe con merge y nunca borra', async () => {
    const t = titularidad('A', 'pA');
    almacen.set(`titularidades/${t.id}`, { ...t });
    sembrar('A', ['pA']);

    await cerrarTitularidad({ titularidad: t, motivo: 'ERROR_DATOS' });

    expect(escriturasEn('titularidades')[0].opciones).toEqual({ merge: true });
    expect(escriturasEn('inmuebles')[0].opciones).toEqual({ merge: true });
    expect(almacen.has('titularidades/A__pA')).toBe(true);
  });
});

// ============================================================================
describe('H9-6 — idempotencia', () => {
  it('cerrar algo ya CERRADO no reescribe el histórico ni lo duplica', async () => {
    const cerrada = titularidad('A', 'pA', {
      estado: 'CERRADA',
      fechaCierre: '2024-01-01T00:00:00.000Z',
      motivoCierre: 'VENTA',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });
    almacen.set(`titularidades/${cerrada.id}`, { ...cerrada });
    sembrar('A', ['pB']); // ya reconciliado

    const ok = await cerrarTitularidad({ titularidad: cerrada, motivo: 'HERENCIA' });

    expect(ok).toBe(true);
    expect(sePuedeCerrar(cerrada as Titularidad)).toBe(false);
    expect(txEscrituras).toHaveLength(0); // ni una escritura innecesaria
    expect(docTitularidad('A__pA')?.motivoCierre).toBe('VENTA'); // no se pisa el motivo original
    expect(docTitularidad('A__pA')?.fechaCierre).toBe('2024-01-01T00:00:00.000Z');
  });

  it('si el índice quedó incoherente, el reintento lo reconcilia sin tocar el histórico', async () => {
    const cerrada = titularidad('A', 'pA', { estado: 'CERRADA', fechaCierre: '2024-01-01', motivoCierre: 'VENTA' });
    almacen.set(`titularidades/${cerrada.id}`, { ...cerrada });
    sembrar('A', ['pA', 'pB']); // quedó colgado del fallo anterior

    const ok = await cerrarTitularidad({ titularidad: cerrada, motivo: 'VENTA' });

    expect(ok).toBe(true);
    expect(indiceDe('A')).toEqual(['pB']);
    expect(escriturasEn('titularidades')).toHaveLength(0);
    expect(escriturasEn('inmuebles')).toHaveLength(1);
  });

  it('dos cierres seguidos dejan el mismo estado final (idempotente)', async () => {
    const t = titularidad('A', 'pA');
    almacen.set(`titularidades/${t.id}`, { ...t });
    sembrar('A', ['pA', 'pB']);

    await cerrarTitularidad({ titularidad: t, motivo: 'VENTA' });
    const trasPrimero = JSON.stringify(docTitularidad('A__pA'));
    const escriturasPrimero = txEscrituras.length;

    await cerrarTitularidad({ titularidad: t, motivo: 'VENTA' });

    expect(indiceDe('A')).toEqual(['pB']);
    expect(JSON.stringify(docTitularidad('A__pA'))).toBe(trasPrimero);
    expect(txEscrituras.length).toBe(escriturasPrimero); // el 2.º no escribe nada
  });
});

// ============================================================================
describe('H9-7 — el titular cerrado ya no es titular actual', () => {
  it('tras el cierre no genera clave de titularidad desde el índice del inmueble', async () => {
    const t = titularidad('A', 'pA');
    almacen.set(`titularidades/${t.id}`, { ...t });
    sembrar('A', ['pA', 'pB']);

    await cerrarTitularidad({ titularidad: t, motivo: 'VENTA' });

    const inm = { id: 'A', titularesIds: indiceDe('A') } as Inmueble;
    const claves = clavesDeInmuebles([inm]).map((c) => c.clave);
    expect(claves).not.toContain('A__pA');
    expect(claves).toEqual(['A__pB']);
  });

  it('el índice resultante ya no autoriza al titular cerrado (contrato de Rules)', async () => {
    const t = titularidad('A', 'pA');
    almacen.set(`titularidades/${t.id}`, { ...t });
    sembrar('A', ['pA', 'pB']);

    await cerrarTitularidad({ titularidad: t, motivo: 'VENTA' });

    // Réplica literal de `titularesIds.hasAny([myPropId()])`.
    const hasAny = (lista: string[], p: string) => lista.includes(p);
    expect(hasAny(indiceDe('A'), 'pA')).toBe(false);
    expect(hasAny(indiceDe('A'), 'pB')).toBe(true);
  });

  it('las Rules dejan leer el histórico propio por clave, al margen del índice', () => {
    // §17: acceso ACTUAL (índice) ≠ lectura del HISTÓRICO (clave propia).
    const reglas = readFileSync(root('firestore.rules'), 'utf8');
    const bloque = reglas.slice(reglas.indexOf('match /titularidades/{titularidadId}'));
    const allowGet = bloque.slice(bloque.indexOf('allow get:'), bloque.indexOf('allow list:'));
    expect(allowGet).toContain("resource.data.propietarioId == myPropId()");
    expect(bloque.slice(0, bloque.indexOf('allow create'))).toContain('allow list: if false');
  });
});

// ============================================================================
describe('H9-8 — el cotitular conserva acceso', () => {
  it('B sigue en el índice y sigue resolviendo su titularidad', async () => {
    const tA = titularidad('A', 'pA');
    almacen.set(`titularidades/${tA.id}`, { ...tA });
    almacen.set('titularidades/A__pB', { ...titularidad('A', 'pB') });
    sembrar('A', ['pA', 'pB']);

    await cerrarTitularidad({ titularidad: tA, motivo: 'VENTA' });

    const inm = { id: 'A', titularesIds: indiceDe('A') } as Inmueble;
    expect(clavesDeInmuebles([inm]).map((c) => c.clave)).toContain('A__pB');
    expect(docTitularidad('A__pB')?.estado).toBe('VIGENTE');
  });

  it('con 3 cotitulares, cerrar a uno no revoca a ninguno de los otros dos', async () => {
    const tA = titularidad('A', 'pA');
    almacen.set(`titularidades/${tA.id}`, { ...tA });
    sembrar('A', ['pA', 'pB', 'pC']);

    await cerrarTitularidad({ titularidad: tA, motivo: 'VENTA' });

    const lista = indiceDe('A');
    expect(lista).toContain('pB');
    expect(lista).toContain('pC');
  });
});

// ============================================================================
describe('H9-9 — el campo legado no decide', () => {
  it('la decisión sale de /titularidades, no de propietarioSecundarioId', async () => {
    const tB = titularidad('A', 'pB');
    almacen.set(`titularidades/${tB.id}`, { ...tB });
    // El legado dice que el secundario es pB; el índice manda igualmente.
    sembrar('A', ['pA', 'pB'], { propietarioId: 'pA', propietarioSecundarioId: 'pB' });

    await cerrarTitularidad({ titularidad: tB, motivo: 'VENTA' });

    expect(indiceDe('A')).toEqual(['pA']);
    const inm = almacen.get('inmuebles/A') as Record<string, unknown>;
    expect(inm.propietarioSecundarioId).toBe('pB'); // el legado NO se modifica
    expect(Object.keys(escriturasEn('inmuebles')[0].datos)).toEqual(['titularesIds']);
  });

  it('un legado que contradice al índice no añade ni conserva titulares', async () => {
    const tA = titularidad('A', 'pA');
    almacen.set(`titularidades/${tA.id}`, { ...tA });
    sembrar('A', ['pA'], { propietarioSecundarioId: 'pZ' }); // pZ no está en el índice

    await cerrarTitularidad({ titularidad: tA, motivo: 'VENTA' });

    expect(indiceDe('A')).toEqual([]); // pZ no se "rescata" desde el legado
  });

  it('el código del cierre no menciona el campo legado', () => {
    const fuente = readFileSync(root('src/lib/titularidadesFirestore.ts'), 'utf8');
    const inicio = fuente.indexOf('export async function cerrarTitularidad');
    const cuerpo = fuente.slice(inicio, fuente.indexOf('\n}', inicio));
    expect(cuerpo).not.toContain('propietarioSecundarioId');
  });
});

// ============================================================================
describe('H9-10 — K.2 (transmisión) sigue intacta', () => {
  const fuenteK2 = readFileSync(root('src/lib/transmisionPatrimonialFirestore.ts'), 'utf8');

  it('sigue siendo UNA sola transacción', () => {
    expect(fuenteK2.match(/runTransaction\(/g) || []).toHaveLength(1);
  });

  it('NO delega en cerrarTitularidad(): no se encadena una segunda transacción', () => {
    expect(/\bawait\s+cerrarTitularidad\s*\(/.test(fuenteK2)).toBe(false);
    expect(/from '\.\/titularidadesFirestore'/.test(fuenteK2)).toBe(false);
    // Sí reutiliza el motor PURO, que es lo correcto (§10).
    expect(fuenteK2).toContain('cerrarTitularidadEnMemoria');
  });
});

// ============================================================================
describe('H9-11 — concurrencia', () => {
  it('no pierde un cotitular añadido tras la instantánea del llamante', async () => {
    const tA = titularidad('A', 'pA');
    almacen.set(`titularidades/${tA.id}`, { ...tA });
    sembrar('A', ['pA', 'pB']); // lo que vio el llamante

    // Entre la lectura y la escritura entra pC (alta concurrente).
    interferencia = () => sembrar('A', ['pA', 'pB', 'pC']);

    await cerrarTitularidad({ titularidad: tA, motivo: 'VENTA' });

    expect(indiceDe('A')).toEqual(['pB', 'pC']); // pC sobrevive
    expect(indiceDe('A')).not.toContain('pA');
  });

  it('todas las lecturas van ANTES de cualquier escritura (requisito de Firestore)', async () => {
    const t = titularidad('A', 'pA');
    almacen.set(`titularidades/${t.id}`, { ...t });
    sembrar('A', ['pA', 'pB']);

    await cerrarTitularidad({ titularidad: t, motivo: 'VENTA' });

    const primeraEscritura = ordenOperaciones.findIndex((o) => o.startsWith('ESCRIBIR'));
    const ultimaLectura = ordenOperaciones.map((o) => o.startsWith('LEER')).lastIndexOf(true);
    expect(ultimaLectura).toBeLessThan(primeraEscritura);
    expect(txLecturas).toEqual(['titularidades/A__pA', 'inmuebles/A']);
  });

  it('todo el cierre ocurre en UNA transacción: ni un setDoc suelto', async () => {
    const t = titularidad('A', 'pA');
    almacen.set(`titularidades/${t.id}`, { ...t });
    sembrar('A', ['pA']);

    await cerrarTitularidad({ titularidad: t, motivo: 'VENTA' });

    expect(transacciones).toBe(1);
    expect(setDocSueltos).toBe(0);
  });

  it('el código no usa el patrón prohibido getDoc→filtrar→setDoc ni arrayRemove', () => {
    const fuente = readFileSync(root('src/lib/titularidadesFirestore.ts'), 'utf8');
    const inicio = fuente.indexOf('export async function cerrarTitularidad');
    const cuerpo = fuente.slice(inicio, fuente.indexOf('\n}', inicio));
    expect(cuerpo).toContain('runTransaction');
    expect(cuerpo).not.toContain('getDoc(');
    expect(cuerpo).not.toContain('arrayRemove');
    expect(cuerpo).not.toContain('arrayUnion');
  });
});
