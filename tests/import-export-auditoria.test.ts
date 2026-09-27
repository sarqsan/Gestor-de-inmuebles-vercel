/**
 * REGRESIÓN DE AUDITORÍA 3ac21a5 (orden de auditoría integral, FASE 23).
 *
 * Cada bloque fija un defecto REAL encontrado al auditar el commit 3ac21a5
 * (importador/exportador `erp-import-export-v1`) y demuestra su corrección.
 * Fixtures SINTÉTICOS (SYNTH_/AUDIT_); ningún dato histórico real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (solo para el bloque adaptador Firebase; el núcleo es puro)
// ---------------------------------------------------------------------------
const mem = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  saveGastoImpl: 'ok' as 'ok' | 'silencioso',
  subsMode: 'ok' as 'ok' | 'colgado',
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ __col: col, __id: id }),
  getDoc: async (r: { __col: string; __id: string }) => {
    const v = mem.store.get(`${r.__col}/${r.__id}`);
    return { exists: () => v !== undefined, data: () => v, id: r.__id };
  },
}));

vi.mock('../src/lib/firebase', () => {
  const sub = (items: unknown[]) => (_cb: (v: unknown) => void, _scope?: unknown) => {
    if (mem.subsMode === 'colgado') return () => {};
    queueMicrotask(() => _cb(items));
    return () => {};
  };
  return {
    db: {},
    saveGastoFirestore: async (g: { id: string }) => {
      // 'silencioso' reproduce el catch+console.error sin rethrow de firebase.ts
      if (mem.saveGastoImpl === 'ok') mem.store.set(`gastos/${g.id}`, g);
    },
    saveContratoFirestore: async () => {},
    registrarAuditoriaFirestore: async () => {},
    subscribePropietarios: sub([]),
    subscribeInmuebles: sub([]),
    subscribeContratos: sub([]),
    subscribeGastos: sub([]),
  };
});

import {
  ambitoAutorizadoDesdeUsuario,
  autorizarImportRun,
  ejecutarExportacion,
  ejecutarImportDryRun,
  ejecutarPromocion,
  esFechaVencimientoValida,
  construirCobroDestino,
  planificarPromocion,
  derivarTokenEjecucion,
  type PuertoPersistenciaImport,
} from '../src/lib/importExport';
import {
  catalogosDesdeFuentes as catalogosReales,
  cargarFuentesCatalogo as cargarReales,
  crearPuertoFirebase as puertoReal,
} from '../src/lib/importExportFirebase';
import { sha256Hex } from '../src/lib/importacion/hash';
import type { CatalogosMigracion } from '../src/lib/migracion/tipos';
import type { UsuarioApp } from '../src/types';

const CATS: CatalogosMigracion = {
  propietarios: [{ id: 'prop_A', nombre: 'A' }],
  inmuebles: [{ id: 'inm_1', direccion: 'C X', propietarioId: 'prop_A' }],
  contratos: [{ id: 'cont_1', inmuebleId: 'inm_1', propietarioId: 'prop_A' }],
  mapeos: [{ alcance: 'INMUEBLE', origen: 'EXTERNAL:prop_ext_1', destino: 'inm_1' }],
  existentes: [],
};
function entrada(crudos: Record<string, unknown>[], entityType: string, extra: Record<string, unknown> = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(crudos));
  return {
    registrosCrudos: crudos, localizaciones: crudos.map((_, i) => `fila ${i + 2}`), entityType,
    formato: 'JSON' as const, sourceName: 'AUDIT-test.json', sourceHash: sha256Hex(bytes),
    sourceTamanoBytes: bytes.length, sourceType: 'EXTERNAL' as const, catalogos: CATS,
    fechaHora: '2026-09-27T00:00:00.000Z', actor: 'auditoria', ...extra,
  };
}
const GASTO = (id: string, extra: Record<string, unknown> = {}) => ({
  id, type: 'gasto', category: 'community', amount: 100, propertyId: 'prop_ext_1',
  date: '2024-03-15', description: `Comunidad ${id}`, ...extra,
});
const COBRO_CRUDO = {
  id: 'AUDIT_cob_1', type: 'ingreso', category: 'rent', amount: 500, propertyId: 'prop_ext_1',
  date: '2024-03-05', description: 'Alquiler', mes: 3, anio: 2024, inquilinoId: 'inq_1', contratoId: 'cont_1',
};
const AMBITO_A = { propietarioIdsLegibles: ['prop_A'], propietarioIdsEscribibles: ['prop_A'], esMaster: false };

function puertoFake(): PuertoPersistenciaImport & { gastos: Map<string, unknown> } {
  const gastos = new Map<string, unknown>();
  return {
    gastos,
    async existeDestino(_c, id) { return gastos.has(id); },
    async existeCobro() { return false; },
    async crearGasto(g) { gastos.set(g.id, g); },
    async anexarCobro() {},
    async auditar() {},
  };
}
function decisionesGasto(run: { registros: ReadonlyArray<{ fingerprint: string }> }) {
  const d: Record<string, { aCargoDe: 'arrendador'; estadoGasto: 'PENDIENTE'; deducible: true }> = {};
  for (const r of run.registros) d[r.fingerprint] = { aCargoDe: 'arrendador', estadoGasto: 'PENDIENTE', deducible: true };
  return d;
}

beforeEach(() => {
  mem.store.clear();
  mem.saveGastoImpl = 'ok';
  mem.subsMode = 'ok';
});

// ---------------------------------------------------------------------------
// D9 — sourceId duplicado: trazabilidad por línea (colas por clave)
// ---------------------------------------------------------------------------
describe('D9: sourceId duplicado conserva trazabilidad propia por línea', () => {
  it('índices y paths distintos; 2º BLOQUEADO por B4 §10 (no AUTO)', () => {
    const run = ejecutarImportDryRun(entrada([GASTO('DUP'), GASTO('DUP')], 'GASTO'));
    expect(run.registros).toHaveLength(2);
    expect(run.registros.map((r) => r.indiceOrigen).sort()).toEqual([0, 1]);
    expect(run.registros.map((r) => r.sourcePath).sort()).toEqual(['fila 2', 'fila 3']);
    expect(run.registros[1].decision).toBe('BLOQUEADO');
    expect(run.registros[1].motivo).toMatch(/duplicado en el lote/);
    expect(run.registros.filter((r) => r.decision === 'AUTO')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// D3 — auditoría best-effort sin doble entradas
// ---------------------------------------------------------------------------
describe('D3: fallo de auditoría no duplica el detalle ni miente contadores', () => {
  async function planDeUnGasto() {
    const run = ejecutarImportDryRun(entrada([GASTO('AUDIT_g1')], 'GASTO', { parches: [{ deducible: true }] }));
    const aut = autorizarImportRun({ run, tamanoBytes: 10, commitDryRun: 'audit' });
    const decisiones = decisionesGasto(run);
    const plan = planificarPromocion({
      autorizacion: aut, run, canonicalBatchSha256: run.sourceHash,
      explicitExecutionToken: derivarTokenEjecucion(run.sourceHash), decisiones, ambito: AMBITO_A,
    });
    return { run, plan, decisiones };
  }
  it('CREADO + auditoría caída ⇒ 1 entrada CREADO (la escritura ocurrió)', async () => {
    const { run, plan, decisiones } = await planDeUnGasto();
    const puerto = puertoFake();
    puerto.auditar = async () => { throw new Error('audit caído'); };
    const res = await ejecutarPromocion({ plan, run, decisiones, puerto, actor: 'u', fechaHora: 'x' });
    expect(res.detalle).toHaveLength(1);
    expect(res.detalle[0].resultado).toBe('CREADO');
    expect(res.creados).toBe(1);
    expect(res.fallidos).toBe(0);
  });
  it('YA_EXISTENTE + auditoría caída ⇒ 1 entrada YA_EXISTENTE', async () => {
    const { run, plan, decisiones } = await planDeUnGasto();
    const puerto = puertoFake();
    await ejecutarPromocion({ plan, run, decisiones, puerto, actor: 'u', fechaHora: 'x' });
    puerto.auditar = async () => { throw new Error('audit caído'); };
    const res = await ejecutarPromocion({ plan, run, decisiones, puerto, actor: 'u', fechaHora: 'x' });
    expect(res.detalle).toHaveLength(1);
    expect(res.detalle[0].resultado).toBe('YA_EXISTENTE');
    expect(res.yaExistentes).toBe(1);
    expect(res.fallidos).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// D4/D5 — exportador INMUEBLE: filtro + fallback de titular
// ---------------------------------------------------------------------------
describe('D4/D5: exportador INMUEBLE filtra y no omite por titular alternativo', () => {
  const AUT = { propietarioIdsLegibles: ['prop_A'], propietarioIdsEscribibles: [], esMaster: false };
  it('D4: inmuebleIds se aplica a INMUEBLE (por id propio)', () => {
    const exp = ejecutarExportacion({
      solicitado: { entidad: 'INMUEBLE', propietarioIds: ['prop_A'], inmuebleIds: ['inm_1'], formato: 'JSON' },
      autorizado: AUT,
      catalogoInmuebles: [{ id: 'inm_1', propietarioId: 'prop_A' }, { id: 'inm_2', propietarioId: 'prop_A' }],
      registros: [
        { id: 'inm_1', propietarioId: 'prop_A', direccion: 'A' },
        { id: 'inm_2', propietarioId: 'prop_A', direccion: 'B' },
      ],
      exportedAt: 'x',
    });
    expect(exp.recordCount).toBe(1);
    expect(exp.contenido).toMatch(/inm_1/);
    expect(exp.contenido).not.toMatch(/inm_2/);
  });
  it('D5: inmueble con solo propietarioPrincipalId no se omite', () => {
    const exp = ejecutarExportacion({
      solicitado: { entidad: 'INMUEBLE', propietarioIds: ['prop_A'], formato: 'JSON' },
      autorizado: AUT,
      catalogoInmuebles: [{ id: 'inm_9', propietarioPrincipalId: 'prop_A' }],
      registros: [{ id: 'inm_9', propietarioPrincipalId: 'prop_A', direccion: 'C' }],
      exportedAt: 'x',
    });
    expect(exp.recordCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// D6 — importeRecibido según estado
// ---------------------------------------------------------------------------
describe('D6: importeRecibido honesto según estado del cobro', () => {
  function cobro(estado: 'PENDIENTE' | 'PAGADO' | 'PAGADO_PARCIAL' | 'RECIBIDO' | 'VERIFICADO' | 'IMPAGADO') {
    const run = ejecutarImportDryRun(entrada([{ ...COBRO_CRUDO }], 'COBRO'));
    return construirCobroDestino(
      run.registros[0],
      { estadoCobro: estado, fechaVencimiento: '2024-03-05' },
      { fechaHora: 'x', actor: null, migrationRunId: 'm' },
    );
  }
  it('PENDIENTE ⇒ 0 (no afirma cobro inexistente)', () => {
    expect(cobro('PENDIENTE').importeRecibido).toBe(0);
  });
  it('PAGADO/RECIBIDO/VERIFICADO ⇒ importe', () => {
    expect(cobro('PAGADO').importeRecibido).toBe(500);
    expect(cobro('RECIBIDO').importeRecibido).toBe(500);
    expect(cobro('VERIFICADO').importeRecibido).toBe(500);
  });
  it('PAGADO_PARCIAL ⇒ 0 + nota explícita de importe desconocido', () => {
    const c = cobro('PAGADO_PARCIAL');
    expect(c.importeRecibido).toBe(0);
    expect(c.observaciones).toMatch(/parcial: importe recibido desconocido/);
  });
  it('IMPAGADO ⇒ 0', () => {
    expect(cobro('IMPAGADO').importeRecibido).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// D7 — fechaVencimiento de calendario real
// ---------------------------------------------------------------------------
describe('D7: fechaVencimiento exige fecha de calendario', () => {
  it.each(['2024-03-05', '2024-02-29', '2025-12-31'])('acepta %s', (f) => {
    expect(esFechaVencimientoValida(f)).toBe(true);
  });
  it.each(['2024-13-99', '2024-02-30', '2024-00-10', '2024-01-00', '05/03/2024', '2024-3-5', '', 'x', null, undefined, 20240305])(
    'rechaza %s',
    (f) => {
      expect(esFechaVencimientoValida(f)).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// D11 — avisos de ámbito visibles en ExportRun
// ---------------------------------------------------------------------------
describe('D11: ExportRun expone avisos de ámbito', () => {
  it('sin propietarioIds ⇒ aviso "todos los legibles" en el run', () => {
    const exp = ejecutarExportacion({
      solicitado: { entidad: 'GASTO', propietarioIds: [], formato: 'JSON' },
      autorizado: { propietarioIdsLegibles: ['prop_A'], propietarioIdsEscribibles: [], esMaster: false },
      catalogoInmuebles: [],
      registros: [],
      exportedAt: 'x',
    });
    expect(exp.avisos.join(' ')).toMatch(/todos los legibles/);
  });
});

// ---------------------------------------------------------------------------
// D12 — adaptador: verificación post-escritura (falso-CREADO)
// ---------------------------------------------------------------------------
describe('D12: crearGasto verifica la escritura (no informa CREADO a ciegas)', () => {
  const IDENT = { usuarioId: 'u', usuarioEmail: 'u@t.es', usuarioNombre: 'U' };
  it('si el save falla en silencio (Rules) ⇒ lanza (ejecutor lo marca FALLIDO)', async () => {
    mem.saveGastoImpl = 'silencioso';
    const puerto = puertoReal(IDENT);
    await expect(puerto.crearGasto({ id: 'gas_x' } as unknown as Parameters<typeof puerto.crearGasto>[0]))
      .rejects.toThrow(/escritura no verificada/);
  });
  it('si la escritura persiste ⇒ resuelve sin lanzar', async () => {
    const puerto = puertoReal(IDENT);
    await expect(puerto.crearGasto({ id: 'gas_y' } as unknown as Parameters<typeof puerto.crearGasto>[0]))
      .resolves.toBeUndefined();
  });
  it('colección distinta de gastos ⇒ rechaza (allowlist)', async () => {
    const puerto = puertoReal(IDENT);
    await expect(puerto.existeDestino('contratos', 'c1')).rejects.toThrow(/no escribible/);
  });
});

// ---------------------------------------------------------------------------
// D2 — anti-cuelgue de lecturas + proyección de catálogos
// ---------------------------------------------------------------------------
describe('D2: lecturas acotadas y catálogos proyectados', () => {
  it('suscriptor colgado ⇒ rechaza por timeout (no cuelga)', async () => {
    mem.subsMode = 'colgado';
    await expect(cargarReales(undefined, 15)).rejects.toThrow(/sin respuesta/);
  });
  it('suscriptores sanos ⇒ resuelve fuentes', async () => {
    const f = await cargarReales(undefined, 500);
    expect(f.propietarios).toEqual([]);
    expect(f.gastos).toEqual([]);
  });
  it('catalogosDesdeFuentes: fallback propietarioPrincipalId + existentes gasto/cobro', () => {
    const cats = catalogosReales({
      propietarios: [{ id: 'p1', nombre: 'N', nifCif: 'X', email: 'e' }],
      inmuebles: [{ id: 'i1', direccion: 'D', ciudad: 'C', referenciaCatastral: 'R', propietarioPrincipalId: 'p1' }],
      contratos: [{ id: 'c1', inmuebleId: 'i1', propietarioId: 'p1', registroCobros: [{ id: 'cob_1' }] }],
      gastos: [{ id: 'g1', origen: 'IMPORTACION', origenId: 'o1' }],
    } as unknown as Parameters<typeof catalogosReales>[0]);
    expect(cats.inmuebles[0].propietarioId).toBe('p1');
    expect(cats.existentes).toContainEqual({ claveOrigen: 'IMPORTACION:o1', destinoId: 'g1', entidad: 'GASTO' });
    expect(cats.existentes).toContainEqual({ destinoId: 'cob_1', entidad: 'COBRO' });
  });
});

// ---------------------------------------------------------------------------
// Ámbito D2/D3 (puro): master/titular/gestor/sin-usuario
// ---------------------------------------------------------------------------
describe('ámbito: derivación D2/D3 sin bypass', () => {
  const base = {
    nombre: 'T', email: 't@t.es', estado: 'ACTIVO', roles: [], permisos: [],
    createdAt: 'x', updatedAt: 'x',
  } as unknown as UsuarioApp;
  it('sin usuario ⇒ ámbito vacío (fail-closed)', () => {
    expect(ambitoAutorizadoDesdeUsuario(null, [])).toEqual({
      propietarioIdsLegibles: [], propietarioIdsEscribibles: [], esMaster: false,
    });
  });
  it('ADMINISTRADOR ⇒ master (null = sin restricción)', () => {
    const a = ambitoAutorizadoDesdeUsuario({ ...base, id: 'u', tipoPerfil: 'ADMINISTRADOR' }, []);
    expect(a).toEqual({ propietarioIdsLegibles: null, propietarioIdsEscribibles: null, esMaster: true });
  });
  it('propietario ⇒ su pid en legible+escribible (coherente con Rules create)', () => {
    const a = ambitoAutorizadoDesdeUsuario(
      { ...base, id: 'u', tipoPerfil: 'PROPIETARIO', propietarioId: 'p1' }, [],
    );
    expect(a.propietarioIdsLegibles).toContain('p1');
    expect(a.propietarioIdsEscribibles).toContain('p1');
    expect(a.esMaster).toBe(false);
  });
  it('gestor con espejo ⇒ carteras espejo legibles, sin master', () => {
    const a = ambitoAutorizadoDesdeUsuario(
      { ...base, id: 'u', tipoPerfil: 'PROFESIONAL', carterasL: ['p2'], carterasE: ['p3'] }, [],
    );
    expect(a.propietarioIdsLegibles).toContain('p2');
    expect(a.propietarioIdsEscribibles).toContain('p3');
    expect(a.propietarioIdsEscribibles).not.toContain('p2');
    expect(a.esMaster).toBe(false);
  });
});
