/**
 * R1 — Persistencia Firestore de conciliación bancaria (GAP 6).
 * Suite auto-contenida con Firestore mockeado en memoria (sin red/credenciales).
 * Cubre:ids deterministas namespaced, guardas, carga, guardado idempotente,
 * aislamiento por propietario, tolerancia a inválidos y propagación de errores.
 * GAP-R1 (consolidación): consulta filtrada demostrada, recuperar-tras-actualizar,
 * falsificación neutralizada e invariantes estáticos de firestore.rules §24
 * con control negativo de discriminación (§14).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock en memoria de firebase/firestore (+ contadores para verificar no-llamadas)
// ---------------------------------------------------------------------------
const mem = vi.hoisted(() => {
  const store = new Map<string, Map<string, any>>();
  const calls = { getDocs: 0, commits: 0, setDocs: 0 };
  const failNext = { getDocs: false };
  const queries: Array<{ col: string; conds: any[] }> = [];
  return { store, calls, failNext, queries };
});

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ __col: name }),
  doc: (_db: unknown, col: string, id: string) => ({ __col: col, __id: id }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (colRef: any, ...conds: any[]) => {
    mem.queries.push({ col: colRef.__col, conds });
    return { ...colRef, __conds: conds };
  },
  getDocs: async (q: any) => {
    mem.calls.getDocs += 1;
    if (mem.failNext.getDocs) {
      mem.failNext.getDocs = false;
      throw new Error('permission-denied');
    }
    const m = mem.store.get(q.__col) || new Map<string, any>();
    const docs = [...m.entries()]
      .filter(([, d]) =>
        (q.__conds || []).every((c: any) => (c.op === '==' ? d[c.field] === c.value : true)),
      )
      .map(([id, data]) => ({ id, data: () => data }));
    return { forEach: (fn: (d: any) => void) => docs.forEach(fn), docs };
  },
  setDoc: async (ref: any, data: any, opts?: any) => {
    mem.calls.setDocs += 1;
    let m = mem.store.get(ref.__col);
    if (!m) {
      m = new Map<string, any>();
      mem.store.set(ref.__col, m);
    }
    m.set(ref.__id, opts?.merge ? { ...(m.get(ref.__id) || {}), ...data } : data);
  },
  writeBatch: (_db: unknown) => {
    const ops: Array<[any, any]> = [];
    return {
      set: (ref: any, data: any) => {
        ops.push([ref, data]);
      },
      commit: async () => {
        mem.calls.commits += 1;
        for (const [ref, data] of ops) {
          let m = mem.store.get(ref.__col);
          if (!m) {
            m = new Map<string, any>();
            mem.store.set(ref.__col, m);
          }
          m.set(ref.__id, data);
        }
      },
    };
  },
}));

// Mock mínimo de ../src/lib/firebase: db ficticio + saneador equivalente
// (elimina undefined en profundidad, como el real).
vi.mock('../src/lib/firebase', () => {
  const clean = (v: any): any => {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object') {
      const o: Record<string, any> = {};
      for (const [k, val] of Object.entries(v)) if (val !== undefined) o[k] = clean(val);
      return o;
    }
    return v;
  };
  return { db: {}, sanitizeObjectForFirestore: clean };
});

import {
  actualizarPropuestaConciliacion,
  cargarConciliacionPropietario,
  CONCILIACIONES_BANCARIAS_COL,
  docIdImportacion,
  docIdMovimiento,
  docIdPropuesta,
  esPropietarioPersistible,
  fusionarSinDuplicados,
  guardarImportacionConciliacion,
  IMPORTACIONES_BANCARIAS_COL,
  MOVIMIENTOS_BANCARIOS_COL,
  sanearIdDoc,
} from '../src/lib/conciliacionFirestore';
import type {
  ImportacionBancaria,
  MovimientoBancario,
  PropuestaConciliacion,
} from '../src/types/conciliacion';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const mov = (over: Partial<MovimientoBancario> = {}): MovimientoBancario => ({
  idImportacion: 'imp_1',
  idMovimiento: 'mov_1',
  fechaOperacion: '2026-09-01',
  importe: 100,
  tipo: 'INGRESO',
  concepto: 'ALQUILER SEPT',
  conceptoOriginal: 'ALQUILER SEPT 2026',
  origen: 'CSV',
  propietarioId: 'prop_A',
  metadatosOriginales: { linea: 2 },
  hashIdempotencia: 'a1b2c3d4',
  fechaImportacion: '2026-09-20T10:00:00.000Z',
  ...over,
});

const prop = (over: Partial<PropuestaConciliacion> = {}): PropuestaConciliacion => ({
  id: 'conc_1',
  movimientoId: 'mov_1',
  idImportacion: 'imp_1',
  propietarioId: 'prop_A',
  puntuacion: 90,
  confianza: 'ALTA',
  factores: [{ criterio: 'IMPORTE_EXACTO', puntuacion: 40, detalle: '100 = 100', coincide: true }],
  estado: 'PROPUESTO',
  importeMovimiento: 100,
  esDiscrepancia: false,
  fechaPropuesta: '2026-09-20T10:05:00.000Z',
  propuestaPor: 'SISTEMA',
  historial: [{ id: 'h1', fecha: '2026-09-20T10:05:00.000Z', accion: 'CREADA' }],
  aplicado: false,
  reversible: true,
  ...over,
});

const imp = (over: Partial<ImportacionBancaria> = {}): ImportacionBancaria => ({
  id: 'imp_1',
  propietarioId: 'prop_A',
  origen: 'CSV',
  fechaImportacion: '2026-09-20T10:00:00.000Z',
  totalMovimientos: 1,
  nuevos: 1,
  duplicados: 0,
  errores: 0,
  estado: 'COMPLETADA',
  ...over,
});

beforeEach(() => {
  mem.store.clear();
  mem.calls.getDocs = 0;
  mem.calls.commits = 0;
  mem.calls.setDocs = 0;
  mem.failNext.getDocs = false;
  mem.queries.length = 0;
});

// ---------------------------------------------------------------------------
// IDs y guardas
// ---------------------------------------------------------------------------
describe('R1 ids deterministas y guardas', () => {
  it('esPropietarioPersistible acepta solo ids reales', () => {
    expect(esPropietarioPersistible('prop_A')).toBe(true);
    expect(esPropietarioPersistible('prop_demo')).toBe(false);
    expect(esPropietarioPersistible('')).toBe(false);
    expect(esPropietarioPersistible('   ')).toBe(false);
    expect(esPropietarioPersistible(undefined)).toBe(false);
    expect(esPropietarioPersistible(null)).toBe(false);
  });

  it('sanearIdDoc elimina / y es determinista con fallback', () => {
    expect(sanearIdDoc('a/b/c')).toBe('a_b_c');
    expect(sanearIdDoc('normal_123')).toBe('normal_123');
    expect(sanearIdDoc('')).toMatch(/^doc_[0-9a-f]{8}$/);
    expect(sanearIdDoc('')).toBe(sanearIdDoc(''));
    expect(sanearIdDoc('.')).toMatch(/^doc_[0-9a-f]{8}$/);
    expect(sanearIdDoc('..')).toMatch(/^doc_[0-9a-f]{8}$/);
  });

  it('docIds con namespace de propietario (mismo hash, distinto owner → distinto doc)', () => {
    const a = docIdMovimiento('prop_A', { hashIdempotencia: 'h1' });
    const b = docIdMovimiento('prop_B', { hashIdempotencia: 'h1' });
    expect(a).not.toBe(b);
    expect(a.startsWith('prop_A_')).toBe(true);
    expect(docIdMovimiento('prop_A', { hashIdempotencia: 'x/y' })).not.toContain('/');
    expect(docIdPropuesta('prop_A', { id: 'c1' })).toBe('prop_A_c1');
    expect(docIdImportacion('prop_A', { id: 'i1' })).toBe('prop_A_i1');
  });

  it('fusionarSinDuplicados: los actuales ganan, la base añade sin duplicar', () => {
    const base = [
      { id: 'a', v: 1 },
      { id: 'b', v: 1 },
    ];
    const actuales = [{ id: 'b', v: 2 }];
    const res = fusionarSinDuplicados(base, actuales, (x) => x.id);
    expect(res).toHaveLength(2);
    expect(res.find((x) => x.id === 'b')!.v).toBe(2);
    expect(res.find((x) => x.id === 'a')!.v).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------
describe('R1 cargarConciliacionPropietario', () => {
  it('devuelve vacío cuando no hay documentos', async () => {
    const estado = await cargarConciliacionPropietario('prop_A');
    expect(estado).toEqual({ movimientos: [], propuestas: [], importaciones: [], omitidosInvalidos: 0 });
    expect(mem.calls.getDocs).toBe(3);
  });

  it('no toca Firestore con propietario demo o vacío', async () => {
    for (const id of ['prop_demo', '', '   ']) {
      const estado = await cargarConciliacionPropietario(id);
      expect(estado.movimientos).toEqual([]);
      expect(estado.omitidosInvalidos).toBe(0);
    }
    expect(mem.calls.getDocs).toBe(0);
  });

  it('roundtrip guardar → cargar recupera el mismo estado con orden determinista', async () => {
    const m1 = mov({ idMovimiento: 'm_b', hashIdempotencia: 'hb', fechaOperacion: '2026-09-03' });
    const m2 = mov({ idMovimiento: 'm_a', hashIdempotencia: 'ha', fechaOperacion: '2026-09-01' });
    const m3 = mov({ idMovimiento: 'm_c', hashIdempotencia: 'hc', fechaOperacion: '2026-09-01' });
    await guardarImportacionConciliacion({
      propietarioId: 'prop_A',
      movimientos: [m1, m2, m3],
      propuestas: [prop({ id: 'conc_1', movimientoId: 'm_b' })],
      importacion: imp({ totalMovimientos: 3, nuevos: 3 }),
    });
    const estado = await cargarConciliacionPropietario('prop_A');
    expect(estado.movimientos.map((m) => m.idMovimiento)).toEqual(['m_a', 'm_c', 'm_b']);
    expect(estado.propuestas).toHaveLength(1);
    expect(estado.propuestas[0].movimientoId).toBe('m_b');
    expect(estado.importaciones).toHaveLength(1);
    expect(estado.importaciones[0].id).toBe('imp_1');
    expect(estado.omitidosInvalidos).toBe(0);
  });

  it('aislamiento estricto: no devuelve documentos de otro propietario', async () => {
    await guardarImportacionConciliacion({
      propietarioId: 'prop_A',
      movimientos: [mov({ idMovimiento: 'm_a', hashIdempotencia: 'ha' })],
      propuestas: [],
      importacion: imp({}),
    });
    await guardarImportacionConciliacion({
      propietarioId: 'prop_B',
      movimientos: [mov({ idMovimiento: 'm_b', hashIdempotencia: 'hb', propietarioId: 'prop_B' })],
      propuestas: [],
      importacion: imp({ id: 'imp_B', propietarioId: 'prop_B' }),
    });
    const estadoA = await cargarConciliacionPropietario('prop_A');
    expect(estadoA.movimientos.map((m) => m.idMovimiento)).toEqual(['m_a']);
    expect(estadoA.importaciones.map((i) => i.id)).toEqual(['imp_1']);
    const estadoB = await cargarConciliacionPropietario('prop_B');
    expect(estadoB.movimientos.map((m) => m.idMovimiento)).toEqual(['m_b']);
  });

  it('omite documentos inválidos y los cuenta (sin romper la carga)', async () => {
    mem.store.set(
      'movimientos_bancarios',
      new Map<string, any>([
        ['prop_A_ok', mov({ idMovimiento: 'ok', hashIdempotencia: 'hok' })],
        ['prop_A_bad1', { propietarioId: 'prop_A', concepto: 'incompleto' }],
        ['prop_A_bad2', { propietarioId: 'prop_X', idMovimiento: 'x' }],
      ]),
    );
    mem.store.set('conciliaciones_bancarias', new Map<string, any>([['prop_A_bad3', { id: 'c', propietarioId: 'prop_A' }]]));
    mem.store.set('importaciones_bancarias', new Map<string, any>());
    const estado = await cargarConciliacionPropietario('prop_A');
    expect(estado.movimientos.map((m) => m.idMovimiento)).toEqual(['ok']);
    // bad2 tiene otro propietarioId → lo filtra la query; bad1 y bad3 los filtra la guarda
    expect(estado.omitidosInvalidos).toBe(2);
  });

  it('propaga los errores de Firestore (nunca silencia fallos)', async () => {
    mem.failNext.getDocs = true;
    await expect(cargarConciliacionPropietario('prop_A')).rejects.toThrow('permission-denied');
  });
});

// ---------------------------------------------------------------------------
// Guardado
// ---------------------------------------------------------------------------
describe('R1 guardarImportacionConciliacion / actualizarPropuestaConciliacion', () => {
  it('guarda en batch con IDs namespaced e idempotente (re-guardar no duplica)', async () => {
    const args = {
      propietarioId: 'prop_A',
      movimientos: [mov({})],
      propuestas: [prop({})],
      importacion: imp({}),
    };
    const r1 = await guardarImportacionConciliacion(args);
    expect(r1).toEqual({ movimientos: 1, propuestas: 1 });
    expect(mem.calls.commits).toBe(1);
    expect(mem.store.get('movimientos_bancarios')!.has('prop_A_a1b2c3d4')).toBe(true);
    expect(mem.store.get('conciliaciones_bancarias')!.has('prop_A_conc_1')).toBe(true);
    expect(mem.store.get('importaciones_bancarias')!.has('prop_A_imp_1')).toBe(true);
    await guardarImportacionConciliacion(args);
    expect(mem.store.get('movimientos_bancarios')!.size).toBe(1);
    expect(mem.store.get('conciliaciones_bancarias')!.size).toBe(1);
    expect(mem.store.get('importaciones_bancarias')!.size).toBe(1);
  });

  it('sanea undefined antes de escribir (compatibilidad Firestore)', async () => {
    await guardarImportacionConciliacion({
      propietarioId: 'prop_A',
      movimientos: [mov({ importadoPor: undefined, cuentaIban: undefined })],
      propuestas: [],
      importacion: imp({}),
    });
    const stored = mem.store.get('movimientos_bancarios')!.get('prop_A_a1b2c3d4');
    expect('importadoPor' in stored).toBe(false);
    expect('cuentaIban' in stored).toBe(false);
    expect(stored.propietarioId).toBe('prop_A');
  });

  it('no escribe nada con propietario demo', async () => {
    const r = await guardarImportacionConciliacion({
      propietarioId: 'prop_demo',
      movimientos: [mov({})],
      propuestas: [prop({})],
      importacion: imp({}),
    });
    expect(r).toEqual({ movimientos: 0, propuestas: 0 });
    expect(mem.calls.commits).toBe(0);
    expect(mem.store.size).toBe(0);
    await actualizarPropuestaConciliacion('prop_demo', prop({}));
    expect(mem.calls.setDocs).toBe(0);
  });

  it('actualizarPropuesta usa merge (conserva campos previos)', async () => {
    mem.store.set(
      'conciliaciones_bancarias',
      new Map<string, any>([
        ['prop_A_conc_1', { ...prop({}), notas: 'nota original' }],
      ]),
    );
    const { notas: _omit, ...sinNotas } = prop({ estado: 'CONFIRMADO' }) as any;
    await actualizarPropuestaConciliacion('prop_A', sinNotas);
    const stored = mem.store.get('conciliaciones_bancarias')!.get('prop_A_conc_1');
    expect(stored.estado).toBe('CONFIRMADO');
    expect(stored.notas).toBe('nota original');
  });

  it('actualizarPropuesta crea el documento si no existe', async () => {
    await actualizarPropuestaConciliacion('prop_A', prop({ estado: 'RECHAZADO' }));
    const stored = mem.store.get('conciliaciones_bancarias')!.get('prop_A_conc_1');
    expect(stored.estado).toBe('RECHAZADO');
    expect(stored.propietarioId).toBe('prop_A');
  });
});

// ---------------------------------------------------------------------------
// GAP-R1 consolidación: query filtrada, recuperar-tras-actualizar, antifalsificación
// ---------------------------------------------------------------------------
describe('R1 consulta filtrada por propietario (compatible con reglas §24)', () => {
  it('las 3 consultas filtran con where(propietarioId == pid)', async () => {
    await cargarConciliacionPropietario('prop_A');
    expect(mem.queries.map((q) => q.col).sort()).toEqual(
      [CONCILIACIONES_BANCARIAS_COL, IMPORTACIONES_BANCARIAS_COL, MOVIMIENTOS_BANCARIOS_COL].sort(),
    );
    expect(mem.queries).toHaveLength(3);
    for (const q of mem.queries) {
      expect(q.conds).toEqual([{ field: 'propietarioId', op: '==', value: 'prop_A' }]);
    }
  });

  it('recuperar después de actualizar refleja la transición persistida', async () => {
    await guardarImportacionConciliacion({
      propietarioId: 'prop_A',
      movimientos: [mov({})],
      propuestas: [prop({})],
      importacion: imp({}),
    });
    await actualizarPropuestaConciliacion('prop_A', prop({ estado: 'CONFIRMADO' }));
    const estado = await cargarConciliacionPropietario('prop_A');
    expect(estado.propuestas).toHaveLength(1);
    expect(estado.propuestas[0].estado).toBe('CONFIRMADO');
    expect(estado.movimientos).toHaveLength(1);
    expect(estado.importaciones).toHaveLength(1);
  });

  it('propietario falsificado en el documento se neutraliza al guardar', async () => {
    await guardarImportacionConciliacion({
      propietarioId: 'prop_A',
      movimientos: [mov({ propietarioId: 'prop_B' })],
      propuestas: [prop({ propietarioId: 'prop_B' })],
      importacion: imp({ propietarioId: 'prop_B' }),
    });
    const movGuardado = mem.store.get('movimientos_bancarios')!.get('prop_A_a1b2c3d4');
    expect(movGuardado.propietarioId).toBe('prop_A');
    const propGuardada = mem.store.get('conciliaciones_bancarias')!.get('prop_A_conc_1');
    expect(propGuardada.propietarioId).toBe('prop_A');
    // B no recupera nada: el docId namespaced y el propietarioId sellado pertenecen a A
    const estadoB = await cargarConciliacionPropietario('prop_B');
    expect(estadoB.movimientos).toHaveLength(0);
    expect(estadoB.propuestas).toHaveLength(0);
    const estadoA = await cargarConciliacionPropietario('prop_A');
    expect(estadoA.movimientos).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// GAP-R1 consolidación: invariantes estáticos de firestore.rules §24.
// Sin emulator disponible: se fijan los invariantes leyendo el fichero
// (mismo patrón que BLOQUE C). Cada invariante es una función pura sobre el
// texto del bloque, con control negativo ante un bloque relajado (§14).
// ---------------------------------------------------------------------------
const RULES_SRC = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');

/** Bloque `match /{coleccion}/{param}` con su contenido (llaves anidadas incluidas). */
function bloqueReglas(coleccion: string): string {
  const inicio = RULES_SRC.indexOf(`match /${coleccion}/`);
  if (inicio < 0) throw new Error(`Sin sección ${coleccion} en firestore.rules`);
  const finLinea = RULES_SRC.indexOf('\n', inicio);
  // la llave de apertura del cuerpo es la ÚLTIMA '{' de la línea `match`
  // (la anterior es el {param} del path); desde ahí se balancea.
  const apertura = RULES_SRC.lastIndexOf('{', finLinea);
  let nivel = 0;
  for (let i = apertura; i < RULES_SRC.length; i++) {
    if (RULES_SRC[i] === '{') nivel++;
    else if (RULES_SRC[i] === '}') {
      nivel--;
      if (nivel === 0) return RULES_SRC.slice(inicio, i + 1);
    }
  }
  throw new Error(`Sección ${coleccion} sin cerrar`);
}

const COLECCIONES_R1 = [
  MOVIMIENTOS_BANCARIOS_COL,
  CONCILIACIONES_BANCARIAS_COL,
  IMPORTACIONES_BANCARIAS_COL,
];

const invDeleteSoloMaster = (b: string): boolean =>
  /allow delete:\s*if isMasterAdmin\(\);/.test(b);
const invCreateExigePropietario = (b: string): boolean =>
  b.includes('allow create:') && /incoming\(\)\.propietarioId == myPropId\(\)/.test(b);
const invUpdatePropietarioInmutable = (b: string): boolean =>
  b.includes('allow update:') &&
  /existing\(\)\.propietarioId == myPropId\(\)/.test(b) &&
  /incoming\(\)\.propietarioId == myPropId\(\)/.test(b);
const invSinAccesoGenerico = (b: string): boolean =>
  !/allow (read|get|list|create|update|write)[\w, ]*:\s*if isSignedIn\(\);/.test(b);
const invSoloRolesPropietarioYMaster = (b: string): boolean => {
  const allows = [...b.matchAll(/allow [\w, ]+: if ([\s\S]*?);/g)].map((m) => m[1]);
  if (allows.length === 0) return false;
  return allows.every(
    (cond) => cond.includes('isMasterAdmin()') || cond.includes('isPropietarioRole()'),
  );
};
const invSinSecretos = (b: string): boolean => b.includes('sinSecretosBancarios()');

/** Bloque deliberadamente relajado: control negativo de discriminación (§14). */
const BLOQUE_RELAJADO = `match /movimientos_bancarios/{movimientoId} {
  allow get, list: if isSignedIn();
  allow create, update: if isSignedIn();
  allow delete: if isSignedIn();
}`;

describe('R1 firestore.rules §24: invariantes de aislamiento', () => {
  it('las 3 colecciones existen y están antes del catch-all', () => {
    const catchAll = RULES_SRC.indexOf('match /{document=**}');
    expect(catchAll).toBeGreaterThan(0);
    for (const c of COLECCIONES_R1) {
      const idx = RULES_SRC.indexOf(`match /${c}/`);
      expect(idx).toBeGreaterThan(0);
      expect(idx).toBeLessThan(catchAll);
    }
  });

  it('el extractor captura el bloque completo (los 5 allows)', () => {
    for (const c of COLECCIONES_R1) {
      const b = bloqueReglas(c);
      for (const k of ['allow get:', 'allow list:', 'allow create:', 'allow update:', 'allow delete:']) {
        expect(b).toContain(k);
      }
    }
  });

  it('delete solo master en las 3 colecciones', () => {
    for (const c of COLECCIONES_R1) expect(invDeleteSoloMaster(bloqueReglas(c))).toBe(true);
  });

  it('create exige propietarioId propio', () => {
    for (const c of COLECCIONES_R1) expect(invCreateExigePropietario(bloqueReglas(c))).toBe(true);
  });

  it('update exige propietario inmutable (existente == entrante == propio)', () => {
    for (const c of COLECCIONES_R1) expect(invUpdatePropietarioInmutable(bloqueReglas(c))).toBe(true);
  });

  it('sin accesos genéricos isSignedIn() ni read/write abiertos', () => {
    for (const c of COLECCIONES_R1) expect(invSinAccesoGenerico(bloqueReglas(c))).toBe(true);
  });

  it('todo allow pasa por isMasterAdmin() o isPropietarioRole() (profesional/inquilino/anónimo sin vía)', () => {
    for (const c of COLECCIONES_R1) expect(invSoloRolesPropietarioYMaster(bloqueReglas(c))).toBe(true);
  });

  it('prohibición de secretos bancarios en las 3 colecciones', () => {
    for (const c of COLECCIONES_R1) expect(invSinSecretos(bloqueReglas(c))).toBe(true);
  });

  it('§14 discriminación: los invariantes FALLAN ante un bloque relajado', () => {
    expect(invDeleteSoloMaster(BLOQUE_RELAJADO)).toBe(false);
    expect(invCreateExigePropietario(BLOQUE_RELAJADO)).toBe(false);
    expect(invUpdatePropietarioInmutable(BLOQUE_RELAJADO)).toBe(false);
    expect(invSinAccesoGenerico(BLOQUE_RELAJADO)).toBe(false);
    expect(invSoloRolesPropietarioYMaster(BLOQUE_RELAJADO)).toBe(false);
    expect(invSinSecretos(BLOQUE_RELAJADO)).toBe(false);
  });
});
