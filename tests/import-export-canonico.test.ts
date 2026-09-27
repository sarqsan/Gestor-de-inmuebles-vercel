/**
 * Importador + Exportador canónicos (`erp-import-export-v1`) — tests del contrato.
 *
 * Cubre §27 de la orden: parsers, mapping, estados, identidad, idempotencia,
 * parcialidad, seguridad/ámbito, fiscalidad, documentos, dry-run (0 escrituras),
 * promoción y exportación. Núcleo 100% puro: los tests de promoción usan un
 * puerto fake en memoria (cero Firebase real).
 *
 * FIXTURES SINTÉTICOS (§28): `SYNTH_*` / `SYNTHETIC-*` son datos inventados
 * para probar el contrato. NO son los archivos históricos reales, NO se les
 * atribuye ningún SHA real y NO sustituyen la futura reconciliación real.
 */
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/lib/importacion/hash';
import { huellaExacta } from '../src/lib/importacion/dedup';
import type { CatalogosMigracion } from '../src/lib/migracion/tipos';
import {
  aplicarMapping,
  autorizarImportRun,
  buscarMapeo,
  camposObligatorios,
  clasificarDuplicadoImport,
  construirCobroDestino,
  construirGastoDestino,
  contratoIdDeDestinoCobro,
  detectarEntidadRentasync,
  ejecutarExportacion,
  ejecutarImportDryRun,
  ejecutarPromocion,
  extraerMarcaExportPropio,
  IGNORADO_NO_MAPEADO,
  parseCsv,
  parseJson,
  parseXlsx,
  planificarPromocion,
  seleccionarAutorizables,
  soporteDe,
  validarAmbitoExportacion,
  verificarBarrera,
  derivarTokenEjecucion,
  ambitoAutorizadoDesdeUsuario,
  type DecisionPromocion,
  type ImportRun,
  type PuertoPersistenciaImport,
} from '../src/lib/importExport';

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------

function catalogosBase(extra?: Partial<CatalogosMigracion>): CatalogosMigracion {
  return {
    propietarios: [
      { id: 'prop_A', nombre: 'Propietaria A', nifCif: '11111111A', estadoAcceso: 'ACTIVO' },
      { id: 'prop_B', nombre: 'Propietario B', nifCif: '22222222B', estadoAcceso: 'SIN_CUENTA', cuentaId: null },
    ],
    inmuebles: [
      { id: 'inm_1', direccion: 'Calle X 1', ciudad: 'Madrid', referenciaCatastral: 'CAT001', propietarioId: 'prop_A', idsOrigen: ['EXTERNAL:prop_ext_1'] },
      { id: 'inm_2', direccion: 'Calle Y 2', ciudad: 'Madrid', propietarioId: 'prop_B' },
    ],
    contratos: [{ id: 'cont_1', inmuebleId: 'inm_1', propietarioId: 'prop_A' }],
    mapeos: [{ alcance: 'INMUEBLE', origen: 'EXTERNAL:prop_ext_1', destino: 'inm_1' }],
    existentes: [],
    ...extra,
  };
}

const GASTO_AUTO = {
  id: 'SYNTH_exp_1', type: 'gasto', category: 'community', amount: 100,
  propertyId: 'prop_ext_1', date: '2024-03-15', description: 'Comunidad marzo',
};

function entrada(crudos: Record<string, unknown>[], entityType: string, extra?: Record<string, unknown>) {
  const bytes = new TextEncoder().encode(JSON.stringify(crudos));
  return {
    registrosCrudos: crudos,
    localizaciones: crudos.map((_, i) => `registros[${i}]`),
    entityType,
    formato: 'JSON' as const,
    sourceName: 'SYNTHETIC-test.json',
    sourceHash: sha256Hex(bytes),
    sourceTamanoBytes: bytes.length,
    sourceType: 'EXTERNAL' as const,
    catalogos: catalogosBase(),
    fechaHora: '2026-09-27T00:00:00.000Z',
    actor: 'tester',
    ...extra,
  };
}

function puertoFake(fallaEn?: string): PuertoPersistenciaImport & {
  gastos: Map<string, unknown>; cobros: Map<string, unknown>; auditoria: unknown[];
} {
  const gastos = new Map<string, unknown>();
  const cobros = new Map<string, unknown>();
  const auditoria: unknown[] = [];
  return {
    gastos, cobros, auditoria,
    async existeDestino(_c, id) { return gastos.has(id); },
    async existeCobro(_c, id) { return cobros.has(id); },
    async crearGasto(g) {
      if (fallaEn === g.id) throw new Error('fallo inyectado');
      gastos.set(g.id, g);
    },
    async anexarCobro(c, cb) {
      if (fallaEn === cb.id) throw new Error('fallo inyectado');
      cobros.set(`${c}/${cb.id}`, cb);
    },
    async auditar(e) { auditoria.push(e); },
  };
}

// ---------------------------------------------------------------------------
// 1. Parsers JSON
// ---------------------------------------------------------------------------

describe('parser JSON', () => {
  it('objeto único → un registro + aviso', () => {
    const r = parseJson('{"a":1}');
    expect(r.registros).toHaveLength(1);
    expect(r.localizaciones).toEqual(['raiz']);
    expect(r.avisos.join(' ')).toMatch(/objeto único/);
    expect(r.errores).toEqual([]);
  });
  it('array → N registros con localizaciones', () => {
    const r = parseJson('[{"a":1},{"a":2}]');
    expect(r.registros).toHaveLength(2);
    expect(r.localizaciones).toEqual(['registros[0]', 'registros[1]']);
  });
  it('ruta anidada cuando el adaptador la declara', () => {
    const r = parseJson('{"data":{"gastos":[{"a":1}]}}', { rutaAnidada: ['data', 'gastos'] });
    expect(r.registros).toHaveLength(1);
  });
  it('ruta anidada inexistente → error', () => {
    const r = parseJson('{"a":1}', { rutaAnidada: ['no', 'existe'] });
    expect(r.registros).toHaveLength(0);
    expect(r.errores.join(' ')).toMatch(/ruta anidada/);
  });
  it('JSON inválido → error, 0 registros', () => {
    const r = parseJson('{no json');
    expect(r.registros).toHaveLength(0);
    expect(r.errores.join(' ')).toMatch(/JSON inválido/);
  });
  it('vacío → error', () => {
    expect(parseJson('').errores.join(' ')).toMatch(/vacío/);
  });
  it('supera maxBytes → error estructural', () => {
    const r = parseJson('{"a":1}', { maxBytes: 2 });
    expect(r.registros).toHaveLength(0);
    expect(r.errores.join(' ')).toMatch(/cota/);
  });
  it('cota de registros: omitidos contados y avisados (nunca silencioso)', () => {
    const r = parseJson('[{"a":1},{"a":2},{"a":3}]', { maxRegistros: 2 });
    expect(r.registros).toHaveLength(2);
    expect(r.registrosOmitidos).toBe(1);
    expect(r.avisos.join(' ')).toMatch(/1 registro\(s\) omitidos/);
  });
  it('item no-objeto: error aislado, el resto continúa', () => {
    const r = parseJson('[{"a":1},42,{"a":3}]');
    expect(r.registros).toHaveLength(2);
    expect(r.registrosOmitidos).toBe(1);
    expect(r.errores.join(' ')).toMatch(/registros\[1\]/);
  });
});

// ---------------------------------------------------------------------------
// 2. Parser CSV genérico
// ---------------------------------------------------------------------------

describe('parser CSV genérico', () => {
  it('cabecera + filas con delimitador detectado', () => {
    const r = parseCsv('a,b\n1,2\n3,4');
    expect(r.delimitadorUsado).toBe(',');
    expect(r.cabecera).toEqual(['a', 'b']);
    expect(r.registros).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }]);
    expect(r.localizaciones).toEqual(['fila 2', 'fila 3']);
  });
  it('delimitador explícito punto y coma', () => {
    const r = parseCsv('a;b\n1;2', { delimitador: ';' });
    expect(r.registros).toEqual([{ a: '1', b: '2' }]);
  });
  it('comillas RFC-4180: "" escapado y multilínea', () => {
    const r = parseCsv('a,b\n"x""y","li\nnea"');
    expect(r.registros).toEqual([{ a: 'x"y', b: 'li\nnea' }]);
  });
  it('campos vacíos se preservan como cadena vacía', () => {
    const r = parseCsv('a,b\n,2');
    expect(r.registros).toEqual([{ a: '', b: '2' }]);
  });
  it('columnas extra se conservan como __extra_N con aviso', () => {
    const r = parseCsv('a\n1,2');
    expect(r.registros[0]).toMatchObject({ a: '1', __extra_1: '2' });
    expect(r.avisos.join(' ')).toMatch(/extra/);
  });
  it('filas cortas se rellenan con cadena vacía y aviso', () => {
    const r = parseCsv('a,b\n1');
    expect(r.registros).toEqual([{ a: '1', b: '' }]);
    expect(r.avisos.join(' ')).toMatch(/ausente/);
  });
  it('cabecera duplicada se sufija con aviso', () => {
    const r = parseCsv('a,a\n1,2');
    expect(r.cabecera).toEqual(['a', 'a__2']);
    expect(r.avisos.join(' ')).toMatch(/duplicadas/);
  });
  it('cabecera vacía → error', () => {
    expect(parseCsv(' , \n1,2').errores.join(' ')).toMatch(/cabecera vacía/);
  });
  it('BOM inicial eliminado con aviso', () => {
    const r = parseCsv('﻿a\n1');
    expect(r.cabecera).toEqual(['a']);
    expect(r.avisos.join(' ')).toMatch(/BOM/);
  });
  it('cota de filas: omitidas contadas', () => {
    const r = parseCsv('a\n1\n2\n3', { maxRegistros: 1 });
    expect(r.registros).toHaveLength(1);
    expect(r.registrosOmitidos).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 3. XLSX stub honesto
// ---------------------------------------------------------------------------

describe('adaptador XLSX', () => {
  it('responde honesto sin romper: 0 registros + motivo documentado', () => {
    const r = parseXlsx();
    expect(r.formato).toBe('XLSX');
    expect(r.registros).toHaveLength(0);
    expect(r.errores.join(' ')).toMatch(/XLSX no soportado en erp-import-export-v1/);
  });
});

// ---------------------------------------------------------------------------
// 4. Mapping registry + normalización
// ---------------------------------------------------------------------------

describe('mapping', () => {
  it('canónico directo (importe)', () => {
    const m = aplicarMapping('GASTO', { importe: 50 });
    expect(m.canonico['importe']).toBe(50);
    expect(m.mapeos[0].regla).toBe('canonico;transformacion:redondeo2');
  });
  it('alias amount→importe con redondeo2 (B1)', () => {
    const m = aplicarMapping('GASTO', { amount: 1933.6999999999998 });
    expect(m.canonico['importe']).toBe(1933.7);
    expect(m.mapeos[0].regla).toMatch(/alias:rentasync-v1.*redondeo2/);
  });
  it('alias date ISO → fechaDevengo', () => {
    const m = aplicarMapping('GASTO', { date: '2024-01-31' });
    expect(m.canonico['fechaDevengo']).toBe('2024-01-31');
  });
  it('fecha D/M/YYYY → ISO día-primer con aviso', () => {
    const m = aplicarMapping('GASTO', { date: '7/7/2026' });
    expect(m.canonico['fechaDevengo']).toBe('2026-07-07');
    expect(m.warnings.join(' ')).toMatch(/día-primer/);
  });
  it('fecha no reconocida → ausente con aviso (no se inventa)', () => {
    const m = aplicarMapping('GASTO', { date: 'ayer más o menos' });
    expect('fechaDevengo' in m.canonico).toBe(false);
    expect(m.warnings.join(' ')).toMatch(/no reconocida/);
  });
  it('category community → COMUNIDAD (B1 clase A)', () => {
    const m = aplicarMapping('GASTO', { category: 'community', description: 'Comunidad' });
    expect(m.canonico['categoria']).toBe('COMUNIDAD');
    expect(m.incidencias).toHaveLength(0);
  });
  it('category insurance sin marcador → SEGUROS + incidencia de validación', () => {
    const m = aplicarMapping('GASTO', { category: 'insurance', description: 'Póliza X' });
    expect(m.canonico['categoria']).toBe('SEGUROS');
    expect(m.incidencias[0].severidad).toBe('REQUIERE_VALIDACION');
  });
  it('category desconocida → ausente con aviso', () => {
    const m = aplicarMapping('GASTO', { category: 'cohetes', description: 'x' });
    expect('categoria' in m.canonico).toBe(false);
  });
  it('description → concepto', () => {
    expect(aplicarMapping('GASTO', { description: 'Hola' }).canonico['concepto']).toBe('Hola');
  });
  it('campo desconocido → desconocidos[] (no fatal)', () => {
    const m = aplicarMapping('GASTO', { campoDesconocido1: 1, importe: 5 });
    expect(m.desconocidos).toEqual(['campoDesconocido1']);
    expect(m.canonico['importe']).toBe(5);
  });
  it('conocido sin destino (owner) → IGNORADO_NO_MAPEADO con motivo', () => {
    const m = aplicarMapping('INMUEBLE', { owner: 'user1', direccion: 'C X' });
    expect(m.mapeos.find((x) => x.campoOrigen === 'owner')?.campoCanonico).toBe(IGNORADO_NO_MAPEADO);
    expect(m.desconocidos).not.toContain('owner');
  });
  it('monthlyRent 1→N (precio + rentaMensual)', () => {
    const m = aplicarMapping('INMUEBLE', { monthlyRent: 500 });
    expect(m.canonico['precio']).toBe(500);
    expect(m.canonico['rentaMensual']).toBe(500);
  });
  it('multi-inquilino → primero + aviso (B1 I-13)', () => {
    const m = aplicarMapping('INMUEBLE', { tenantName: 'Ana, Bruno' });
    expect(m.canonico['inquilinoActualNombre']).toBe('Ana');
    expect(m.warnings.join(' ')).toMatch(/multi-inquilino/);
  });
  it('colisión al mismo canónico: primero gana + aviso', () => {
    const m = aplicarMapping('GASTO', { concepto: 'A', description: 'B' });
    expect(m.canonico['concepto']).toBe('A');
    expect(m.warnings.join(' ')).toMatch(/colisión/);
  });
  it('campo mapeado vacío → ausente, no inventa', () => {
    const m = aplicarMapping('GASTO', { amount: '' });
    expect('importe' in m.canonico).toBe(false);
  });
  it('importe en texto ES 1.234,56 → 1234.56 (reutiliza conciliación)', () => {
    expect(aplicarMapping('GASTO', { amount: '1.234,56' }).canonico['importe']).toBe(1234.56);
  });
  it('importe no numérico → ausente + mapping registrado', () => {
    const m = aplicarMapping('GASTO', { amount: 'mucho' });
    expect('importe' in m.canonico).toBe(false);
    expect(m.mapeos[0].regla).toMatch(/no_numerico/);
  });
  it('detectarEntidadRentasync: ingreso+rent→COBRO, gasto→GASTO, otro→null', () => {
    expect(detectarEntidadRentasync({ type: 'ingreso', category: 'rent' })).toBe('COBRO');
    expect(detectarEntidadRentasync({ type: 'gasto', category: 'ibi' })).toBe('GASTO');
    expect(detectarEntidadRentasync({ type: 'otro' })).toBeNull();
  });
  it('buscarMapeo: nif→nifCif (B4), startDate→fechaInicio (test), city→null (pendiente, no asumido)', () => {
    expect(buscarMapeo('PROPIETARIO', 'nif')?.canonicos).toEqual(['nifCif']);
    expect(buscarMapeo('CONTRATO', 'startDate')?.canonicos).toEqual(['fechaInicio']);
    expect(buscarMapeo('INMUEBLE', 'city')).toBeNull();
  });
  it('camposObligatorios ≡ B4 (gasto: importe/fechaDevengo/categoria/concepto)', () => {
    expect(camposObligatorios('GASTO').sort()).toEqual(['categoria', 'concepto', 'fechaDevengo', 'importe']);
  });
  it('soporteDe: GASTO completo, INCIDENCIA pendiente, XXX desconocida', () => {
    expect(soporteDe('GASTO')).toBe('COMPLETO');
    expect(soporteDe('INCIDENCIA')).toBe('PENDIENTE');
    expect(soporteDe('XXX')).toBe('DESCONOCIDA');
  });
});

// ---------------------------------------------------------------------------
// 5. Estados + parcialidad (pipeline sobre B4)
// ---------------------------------------------------------------------------

describe('pipeline: estados y parcialidad', () => {
  it('gasto completo → AUTO con destino determinista', () => {
    const run = ejecutarImportDryRun(entrada([{ ...GASTO_AUTO }], 'GASTO'));
    expect(run.importedRecords).toBe(1);
    const r = run.registros[0];
    expect(r.decision).toBe('AUTO');
    expect(r.destinationId).toBe('gas_inm_1_SYNTH_exp_1');
    expect(r.operacion).toBe('CREAR');
    expect(r.propietarioDestinoId).toBe('prop_A');
    expect(r.inmuebleDestinoId).toBe('inm_1');
    expect(r.fingerprint).toHaveLength(64);
  });
  it('gasto sin propertyId → INCOMPLETO (inmueble), sin destruir el registro', () => {
    const { propertyId: _o, ...sinProp } = GASTO_AUTO;
    void _o;
    const run = ejecutarImportDryRun(entrada([{ ...sinProp }], 'GASTO'));
    expect(run.registros[0].decision).toBe('INCOMPLETO');
    expect(run.registros[0].canonicalData['importe']).toBe(100);
  });
  it('gasto sin importe → INCOMPLETO por campo necesario', () => {
    const { amount: _a, ...sinImporte } = GASTO_AUTO;
    void _a;
    const run = ejecutarImportDryRun(entrada([{ ...sinImporte }], 'GASTO'));
    expect(run.registros[0].decision).toBe('INCOMPLETO');
    expect(run.registros[0].motivo).toMatch(/importe/);
  });
  it('mismo sourceId dos veces → segundo BLOQUEADO, primero intacto', () => {
    const run = ejecutarImportDryRun(entrada([{ ...GASTO_AUTO }, { ...GASTO_AUTO }], 'GASTO'));
    const decisiones = run.registros.map((r) => r.decision).sort();
    expect(decisiones).toEqual(['AUTO', 'BLOQUEADO']);
  });
  it('archivo mixto: válidos continúan (700/150/80/50/20 a escala)', () => {
    const { amount: _a, ...sinImporte } = GASTO_AUTO;
    void _a;
    const run = ejecutarImportDryRun(entrada([
      { ...GASTO_AUTO },
      { ...sinImporte, id: 'SYNTH_exp_2' },
      { ...(GASTO_AUTO as Record<string, unknown>), id: 'SYNTH_exp_1' },
    ], 'GASTO'));
    expect(run.totalRecords).toBe(3);
    expect(run.importedRecords).toBe(1);
    expect(run.incompleteRecords).toBe(1);
    expect(run.blockedRecords).toBe(1);
  });
  it('entidad INCIDENCIA → NO_MIGRABLE honesto (sin adaptador v1)', () => {
    const run = ejecutarImportDryRun(entrada([{ id: 'SYNTH_inc_1', titulo: 'x' }], 'INCIDENCIA'));
    expect(run.registros[0].decision).toBe('NO_MIGRABLE');
    expect(run.noMigrables).toBe(1);
  });
  it('AUTO sin forma Rentasync → DESCONOCIDA → NO_MIGRABLE', () => {
    const run = ejecutarImportDryRun(entrada([{ id: 'SYNTH_x', foo: 1 }], 'AUTO'));
    expect(run.registros[0].entityType).toBe('DESCONOCIDA');
    expect(run.registros[0].decision).toBe('NO_MIGRABLE');
  });
  it('AUTO resuelve forma Rentasync (gasto)', () => {
    const run = ejecutarImportDryRun(entrada([{ ...GASTO_AUTO }], 'AUTO'));
    expect(run.registros[0].entityType).toBe('GASTO');
    expect(run.registros[0].decision).toBe('AUTO');
  });
  it('campos desconocidos agregados con IGNORADO_NO_MAPEADO en informe', () => {
    const run = ejecutarImportDryRun(entrada([{ ...GASTO_AUTO, campoDesconocido1: 'x' }], 'GASTO'));
    expect(run.camposDesconocidos).toEqual([{ campo: 'campoDesconocido1', registros: 1 }]);
    expect(run.informe).toMatch(/IGNORADO_NO_MAPEADO/);
    expect(run.registros[0].decision).toBe('AUTO');
  });
});

// ---------------------------------------------------------------------------
// 6. Identidad y destino (B4 reutilizado)
// ---------------------------------------------------------------------------

describe('identidad y destino', () => {
  it('propietario explícito válido → RESUELTO', () => {
    const run = ejecutarImportDryRun(entrada([{ ...GASTO_AUTO, propietarioId: 'prop_A' }], 'GASTO'));
    expect(run.registros[0].propietarioDestinoId).toBe('prop_A');
    expect(run.registros[0].decision).toBe('AUTO');
  });
  it('propietario ambiguo (id duplicado en catálogo) → BLOQUEADO', () => {
    const cats = catalogosBase({
      propietarios: [
        { id: 'prop_X', nombre: 'Uno' },
        { id: 'prop_X', nombre: 'Dos' },
      ],
    });
    const run = ejecutarImportDryRun(entrada([{ ...GASTO_AUTO, propietarioId: 'prop_X' }], 'GASTO', { catalogos: cats }));
    expect(run.registros[0].decision).toBe('BLOQUEADO');
  });
  it('inmueble por id canónico → RESUELTO', () => {
    const { propertyId: _p, ...resto } = GASTO_AUTO;
    void _p;
    const run = ejecutarImportDryRun(entrada([{ ...resto, inmuebleId: 'inm_1' }], 'GASTO'));
    expect(run.registros[0].inmuebleDestinoId).toBe('inm_1');
    expect(run.registros[0].decision).toBe('AUTO');
  });
  it('inmueble ambiguo (id duplicado) → BLOQUEADO', () => {
    const cats = catalogosBase({
      inmuebles: [
        { id: 'inm_dup', direccion: 'A' },
        { id: 'inm_dup', direccion: 'B' },
      ],
    });
    const { propertyId: _p, ...resto } = GASTO_AUTO;
    void _p;
    const run = ejecutarImportDryRun(entrada([{ ...resto, inmuebleId: 'inm_dup' }], 'GASTO', { catalogos: cats }));
    expect(run.registros[0].decision).toBe('BLOQUEADO');
  });
  it('el importador (gestor) NUNCA es destino implícito', () => {
    const { propertyId: _p, ...resto } = GASTO_AUTO;
    void _p;
    const run = ejecutarImportDryRun(entrada([{ ...resto }], 'GASTO', {
      catalogos: catalogosBase({ importador: { uid: 'gestor_1', modalidad: 'GESTOR_PROFESIONAL' } }),
    }));
    expect(run.registros[0].propietarioDestinoId).toBeNull();
    expect(run.registros[0].decision).toBe('INCOMPLETO');
  });
  it('propietario explícito inexistente → INCOMPLETO (no se inventa)', () => {
    const run = ejecutarImportDryRun(entrada([{ ...GASTO_AUTO, propietarioId: 'prop_Z' }], 'GASTO'));
    // Titular no aplica (hay explícito): NO_ENCONTRADO → INCOMPLETO.
    expect(run.registros[0].decision).toBe('INCOMPLETO');
  });
  it('contradicción titularidad (prop ≠ titular) → BLOQUEADO (O6)', () => {
    const run = ejecutarImportDryRun(entrada([{ ...GASTO_AUTO, propietarioId: 'prop_B' }], 'GASTO'));
    expect(run.registros[0].decision).toBe('BLOQUEADO');
    expect(run.registros[0].motivo).toMatch(/titularidad/);
  });
  it('destino fuera de permitidos → BLOQUEADO NO_PERMITIDO', () => {
    const run = ejecutarImportDryRun(entrada([{ ...GASTO_AUTO }], 'GASTO', {
      catalogos: catalogosBase({ propietariosPermitidosIds: ['prop_B'] }),
    }));
    expect(run.registros[0].decision).toBe('BLOQUEADO');
    expect(run.registros[0].motivo).toMatch(/NO_PERMITIDO/);
  });
  it('inmueble por catastral exacta → REVISIÓN (vía no determinista)', () => {
    const { propertyId: _p, ...resto } = GASTO_AUTO;
    void _p;
    const run = ejecutarImportDryRun(entrada([{ ...resto, referenciaCatastral: 'CAT001' }], 'GASTO'));
    // La resolución por catastral topa a REVISIÓN aunque resuelva.
    expect(run.registros[0].inmuebleDestinoId).toBe('inm_1');
    expect(run.registros[0].decision).toBe('REVISION');
  });
});

// ---------------------------------------------------------------------------
// 7. Duplicados e idempotencia
// ---------------------------------------------------------------------------

describe('duplicados e idempotencia', () => {
  it('doble dry-run de los mismos bytes → mismo run + informe (fingerprint estable)', () => {
    const a = ejecutarImportDryRun(entrada([{ ...GASTO_AUTO }], 'GASTO'));
    const b = ejecutarImportDryRun(entrada([{ ...GASTO_AUTO }], 'GASTO'));
    expect(b.importRunId).toBe(a.importRunId);
    expect(b.informe).toBe(a.informe);
    expect(b.registros[0].fingerprint).toBe(a.registros[0].fingerprint);
  });
  it('EXACTO contra destino (misma clave+huella) → BLOQUEADO, clase EXACTO', () => {
    const huella = huellaExacta({
      inmuebleId: 'inm_1', importe: 100, categoria: 'COMUNIDAD',
      fechaDevengo: '2024-03-15', concepto: 'Comunidad marzo',
    });
    const cats = catalogosBase({
      existentes: [{ claveOrigen: 'EXTERNAL:SYNTH_exp_1', huellaExacta: huella, destinoId: 'gas_inm_1_SYNTH_exp_1', entidad: 'GASTO' }],
    });
    const run = ejecutarImportDryRun(entrada([{ ...GASTO_AUTO }], 'GASTO', { catalogos: cats }));
    expect(run.registros[0].duplicado).toBe('EXACTO');
    expect(run.registros[0].decision).toBe('BLOQUEADO');
    expect(run.duplicateRecords).toBe(1);
  });
  it('POSIBLE_DUPLICADO (mismo importe/inmueble/categoría, resto distinto) → REVISIÓN', () => {
    const cats = catalogosBase({
      existentes: [{ claveImporteInmuebleCategoria: 'inm_1|100.00|COMUNIDAD', destinoId: 'gas_otro', entidad: 'GASTO' }],
    });
    const run = ejecutarImportDryRun(entrada([{
      ...GASTO_AUTO, id: 'SYNTH_exp_9', description: 'Limpieza escalera', date: '2024-05-01',
    }], 'GASTO', { catalogos: cats }));
    expect(run.registros[0].duplicado).toBe('POSIBLE_DUPLICADO');
    expect(run.registros[0].decision).toBe('REVISION');
  });
  it('CONFLICTO: mismo destino VINCULAR desde 2 orígenes', () => {
    const run = ejecutarImportDryRun(entrada([
      { id: 'SYNTH_a', inmuebleId: 'inm_1', direccion: 'Calle X 1' },
      { id: 'SYNTH_b', inmuebleId: 'inm_1', direccion: 'Calle X 1' },
    ], 'INMUEBLE'));
    const clases = run.registros.map((r) => r.duplicado).sort();
    expect(clases).toContain('CONFLICTO');
  });
  it('clasificarDuplicadoImport mapea B4 sin nueva lógica', () => {
    const base = ejecutarImportDryRun(entrada([{ ...GASTO_AUTO }], 'GASTO')).dryRun.lineas[0];
    expect(clasificarDuplicadoImport({ ...base, duplicado: { tipo: 'NINGUNO', con: [], motivo: 'x' } }).clase).toBe('NUEVO');
    expect(clasificarDuplicadoImport({ ...base, duplicado: { tipo: 'EXACTO', con: [], motivo: 'x' } }).clase).toBe('EXACTO');
    expect(clasificarDuplicadoImport({ ...base, duplicado: { tipo: 'PROBABLE', con: [], motivo: 'x' } }).clase).toBe('POSIBLE_DUPLICADO');
    expect(clasificarDuplicadoImport({ ...base, motivo: 'mismo destino d propuesto por 2 orígenes' }).clase).toBe('CONFLICTO');
  });
});

// ---------------------------------------------------------------------------
// 8. Fiscalidad (conservar, no recalcular)
// ---------------------------------------------------------------------------

describe('fiscalidad', () => {
  function runGasto(crudos: Record<string, unknown>[], parches?: Array<{ deducible?: boolean } | null>) {
    return ejecutarImportDryRun(entrada(crudos, 'GASTO', parches ? { parches } : {}));
  }
  it('deducible explícito en fuente se conserva en payload', () => {
    const run = runGasto([{ ...GASTO_AUTO, deducible: true }]);
    const g = construirGastoDestino(run.registros[0], { aCargoDe: 'arrendador', estadoGasto: 'PAGADO' }, { fechaHora: '2026-01-01', actor: null });
    expect(g.deducible).toBe(true);
  });
  it('deducible ausente → payload sin deducible (no inferido)', () => {
    const run = runGasto([{ ...GASTO_AUTO }]);
    const g = construirGastoDestino(run.registros[0], { aCargoDe: 'arrendador', estadoGasto: 'PENDIENTE' }, { fechaHora: '2026-01-01', actor: null });
    expect('deducible' in g).toBe(false);
  });
  it('deducible confirmado en decisión → payload + puerta O7 superada', () => {
    const run = runGasto([{ ...GASTO_AUTO }], [{ deducible: false }]);
    const g = construirGastoDestino(run.registros[0], { aCargoDe: 'arrendador', estadoGasto: 'PENDIENTE', deducible: false }, { fechaHora: '2026-01-01', actor: null });
    expect(g.deducible).toBe(false);
    const sel = seleccionarAutorizables(run, null);
    expect(sel.elegibles).toHaveLength(1);
  });
  it('sin confirmación fiscal → O7 excluye (puerta §9 intacta)', () => {
    const run = runGasto([{ ...GASTO_AUTO }]);
    const sel = seleccionarAutorizables(run, null);
    expect(sel.elegibles).toHaveLength(0);
    expect(sel.excluidos[0].motivo).toMatch(/fiscal/);
  });
  it('ejercicio/periodo derivados de fechaDevengo (B1 G-10)', () => {
    const run = runGasto([{ ...GASTO_AUTO }]);
    const g = construirGastoDestino(run.registros[0], { aCargoDe: 'arrendador', estadoGasto: 'PENDIENTE' }, { fechaHora: '2026-01-01', actor: null });
    expect(g.ejercicioFiscal).toBe(2024);
    expect(g.periodoMesAnio).toBe('2024-03');
  });
  it('recibo base64 (data:) NO se embebe; http se conserva como referencia', () => {
    const runB64 = runGasto([{ ...GASTO_AUTO, receiptName: 't.pdf', receiptUrl: 'data:application/pdf;base64,AAA' }]);
    const gB64 = construirGastoDestino(runB64.registros[0], { aCargoDe: 'arrendador', estadoGasto: 'PENDIENTE' }, { fechaHora: 'x', actor: null });
    expect(gB64.documento).toBeUndefined();
    const runHttp = runGasto([{ ...GASTO_AUTO, receiptName: 't.pdf', receiptUrl: 'https://x/t.pdf' }]);
    const gHttp = construirGastoDestino(runHttp.registros[0], { aCargoDe: 'arrendador', estadoGasto: 'PENDIENTE' }, { fechaHora: 'x', actor: null });
    expect(gHttp.documento?.url).toBe('https://x/t.pdf');
  });
  it('tipo FINANCIACION por familia de categoría (regla explícita)', () => {
    const run = runGasto([{ id: 'SYNTH_h', type: 'gasto', category: 'community', amount: 408.13, propertyId: 'prop_ext_1', date: '2024-03-15', description: 'Cuota', categoria: 'CUOTA_HIPOTECARIA' }]);
    const g = construirGastoDestino(run.registros[0], { aCargoDe: 'arrendador', estadoGasto: 'PENDIENTE' }, { fechaHora: 'x', actor: null });
    expect(g.tipo).toBe('FINANCIACION');
  });
});

// ---------------------------------------------------------------------------
// 9. Documentos
// ---------------------------------------------------------------------------

describe('documentos', () => {
  it('DOCUMENTO con nombre+ruta+propietario+entidad → AUTO con destino Storage', () => {
    const run = ejecutarImportDryRun(entrada([{
      id: 'SYNTH_doc_1', nombreOriginal: 'factura.pdf', rutaOriginal: '/origen/factura.pdf',
      tipo: 'factura', propietarioId: 'prop_A', entidadRef: 'GASTO', entidadId: 'SYNTH_exp_1',
    }], 'DOCUMENTO'));
    expect(run.registros[0].decision).toBe('AUTO');
    expect(run.registros[0].destinoColeccion).toMatch(/Storage/);
  });
  it('DOCUMENTO sin ruta → INCOMPLETO', () => {
    const run = ejecutarImportDryRun(entrada([{
      id: 'SYNTH_doc_2', nombreOriginal: 'x.pdf', propietarioId: 'prop_A',
    }], 'DOCUMENTO'));
    expect(run.registros[0].decision).toBe('INCOMPLETO');
  });
  it('DOCUMENTO AUTO queda excluido de promoción con motivo honesto', () => {
    const run = ejecutarImportDryRun(entrada([{
      id: 'SYNTH_doc_1', nombreOriginal: 'factura.pdf', rutaOriginal: '/origen/factura.pdf',
      propietarioId: 'prop_A', entidadRef: 'GASTO', entidadId: 'SYNTH_exp_1',
    }], 'DOCUMENTO'));
    const aut = autorizarImportRun({ run, tamanoBytes: 10, commitDryRun: 'test' });
    // O7 §8 excluye documentos con entidadRef (no verificable contra destino).
    expect(aut.decision).toBe('CONDICIONADA');
  });
});

// ---------------------------------------------------------------------------
// 10. Dry-run: 0 escrituras
// ---------------------------------------------------------------------------

describe('dry-run sin escrituras', () => {
  it('solo lectura declarado + informe con 0 escrituras + puerto intacto', async () => {
    const run = ejecutarImportDryRun(entrada([{ ...GASTO_AUTO }], 'GASTO'));
    expect(run.status).toBe('DRY_RUN_COMPLETADO');
    expect(run.dryRun.soloLectura).toBe(true);
    expect(run.informe).toMatch(/escritura realizada: 0/);
    const puerto = puertoFake();
    // El dry-run no recibe puerto: nada puede haberse escrito.
    expect(puerto.gastos.size).toBe(0);
    expect(puerto.auditoria).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 11. Promoción (barrera O7 + ejecutor)
// ---------------------------------------------------------------------------

describe('promoción', () => {
  function runAutorizable(): ImportRun {
    return ejecutarImportDryRun(entrada([{ ...GASTO_AUTO }], 'GASTO', { parches: [{ deducible: true }] }));
  }
  const AMBITO = { propietarioIdsLegibles: ['prop_A'], propietarioIdsEscribibles: ['prop_A'], esMaster: false };
  const DECISIONES: Record<string, DecisionPromocion> = {};

  function decisionesPara(run: ImportRun): Record<string, DecisionPromocion> {
    const d: Record<string, DecisionPromocion> = {};
    for (const r of run.registros) d[r.fingerprint] = { aCargoDe: 'arrendador', estadoGasto: 'PENDIENTE', deducible: true };
    return d;
  }

  it('sin token → planificarPromocion lanza (barrera)', () => {
    const run = runAutorizable();
    const aut = autorizarImportRun({ run, tamanoBytes: 10, commitDryRun: 'test' });
    expect(aut.decision).toBe('CONCEDIDA');
    expect(() => planificarPromocion({
      autorizacion: aut, run, canonicalBatchSha256: run.sourceHash,
      explicitExecutionToken: null, decisiones: decisionesPara(run), ambito: AMBITO,
    })).toThrow(/barrera O7/);
  });
  it('token inválido → lanza', () => {
    const run = runAutorizable();
    const aut = autorizarImportRun({ run, tamanoBytes: 10, commitDryRun: 'test' });
    expect(() => planificarPromocion({
      autorizacion: aut, run, canonicalBatchSha256: run.sourceHash,
      explicitExecutionToken: 'falso', decisiones: decisionesPara(run), ambito: AMBITO,
    })).toThrow(/token/);
  });
  it('autorización no CONCEDIDA → lanza', () => {
    const run = ejecutarImportDryRun(entrada([{ ...GASTO_AUTO }], 'GASTO')); // sin parche fiscal
    const aut = autorizarImportRun({ run, tamanoBytes: 10, commitDryRun: 'test' });
    expect(aut.decision).toBe('CONDICIONADA');
    expect(() => planificarPromocion({
      autorizacion: aut, run, canonicalBatchSha256: run.sourceHash,
      explicitExecutionToken: derivarTokenEjecucion(run.sourceHash),
      decisiones: decisionesPara(run), ambito: AMBITO,
    })).toThrow(/barrera O7/);
  });
  it('plan solo con AUTO elegibles; resto excluido con motivo', () => {
    const { amount: _a, ...sinImporte } = GASTO_AUTO;
    void _a;
    const run = ejecutarImportDryRun(entrada(
      [{ ...GASTO_AUTO }, { ...sinImporte, id: 'SYNTH_exp_2' }], 'GASTO', { parches: [{ deducible: true }, null] },
    ));
    const aut = autorizarImportRun({ run, tamanoBytes: 10, commitDryRun: 'test' });
    const plan = planificarPromocion({
      autorizacion: aut, run, canonicalBatchSha256: run.sourceHash,
      explicitExecutionToken: derivarTokenEjecucion(run.sourceHash),
      decisiones: decisionesPara(run), ambito: AMBITO,
    });
    expect(plan.operaciones).toHaveLength(1);
    expect(plan.excluidas).toHaveLength(1);
    expect(plan.excluidas[0].motivo).toMatch(/no incluido en la autorización/);
  });
  it('fuera de ámbito escribible → excluido', () => {
    const run = runAutorizable();
    const aut = autorizarImportRun({ run, tamanoBytes: 10, commitDryRun: 'test' });
    const plan = planificarPromocion({
      autorizacion: aut, run, canonicalBatchSha256: run.sourceHash,
      explicitExecutionToken: derivarTokenEjecucion(run.sourceHash),
      decisiones: decisionesPara(run),
      ambito: { propietarioIdsLegibles: ['prop_B'], propietarioIdsEscribibles: ['prop_B'], esMaster: false },
    });
    expect(plan.operaciones).toHaveLength(0);
    expect(plan.excluidas[0].motivo).toMatch(/fuera del ámbito escribible/);
  });
  it('sin decisiones G-13 → excluido (no se inventan)', () => {
    const run = runAutorizable();
    const aut = autorizarImportRun({ run, tamanoBytes: 10, commitDryRun: 'test' });
    const plan = planificarPromocion({
      autorizacion: aut, run, canonicalBatchSha256: run.sourceHash,
      explicitExecutionToken: derivarTokenEjecucion(run.sourceHash),
      decisiones: {}, ambito: AMBITO,
    });
    expect(plan.operaciones).toHaveLength(0);
    expect(plan.excluidas[0].motivo).toMatch(/B1 G-13/);
  });
  it('VINCULAR → vinculada sin escritura', () => {
    const run = ejecutarImportDryRun(entrada(
      [{ id: 'SYNTH_inm', inmuebleId: 'inm_1', direccion: 'Calle X 1' }], 'INMUEBLE',
    ));
    expect(run.registros[0].decision).toBe('AUTO');
    const aut = autorizarImportRun({ run, tamanoBytes: 10, commitDryRun: 'test' });
    expect(aut.decision).toBe('CONCEDIDA');
    const plan = planificarPromocion({
      autorizacion: aut, run, canonicalBatchSha256: run.sourceHash,
      explicitExecutionToken: derivarTokenEjecucion(run.sourceHash),
      decisiones: {}, ambito: AMBITO,
    });
    expect(plan.operaciones).toHaveLength(0);
    expect(plan.vinculadasSinEscritura).toHaveLength(1);
  });
  it('ejecución: crea, audita e idempotente en 2ª vuelta (YA_EXISTENTE)', async () => {
    const run = runAutorizable();
    const aut = autorizarImportRun({ run, tamanoBytes: 10, commitDryRun: 'test' });
    const plan = planificarPromocion({
      autorizacion: aut, run, canonicalBatchSha256: run.sourceHash,
      explicitExecutionToken: derivarTokenEjecucion(run.sourceHash),
      decisiones: decisionesPara(run), ambito: AMBITO,
    });
    const puerto = puertoFake();
    const r1 = await ejecutarPromocion({ plan, run, decisiones: decisionesPara(run), puerto, actor: 'u', fechaHora: '2026-01-01' });
    expect(r1.creados).toBe(1);
    expect(puerto.gastos.has('gas_inm_1_SYNTH_exp_1')).toBe(true);
    expect(puerto.auditoria).toHaveLength(1);
    const r2 = await ejecutarPromocion({ plan, run, decisiones: decisionesPara(run), puerto, actor: 'u', fechaHora: '2026-01-01' });
    expect(r2.creados).toBe(0);
    expect(r2.yaExistentes).toBe(1);
    expect(puerto.gastos.size).toBe(1);
  });
  it('fallo aislado: resto CREADO + 1 FALLIDO con motivo', async () => {
    const run = ejecutarImportDryRun(entrada(
      [{ ...GASTO_AUTO }, { ...GASTO_AUTO, id: 'SYNTH_exp_2', amount: 55.5, date: '2024-04-02', description: 'Limpieza abril' }], 'GASTO',
      { parches: [{ deducible: true }, { deducible: true }] },
    ));
    const aut = autorizarImportRun({ run, tamanoBytes: 10, commitDryRun: 'test' });
    const plan = planificarPromocion({
      autorizacion: aut, run, canonicalBatchSha256: run.sourceHash,
      explicitExecutionToken: derivarTokenEjecucion(run.sourceHash),
      decisiones: decisionesPara(run), ambito: AMBITO,
    });
    const puerto = puertoFake('gas_inm_1_SYNTH_exp_2');
    const r = await ejecutarPromocion({ plan, run, decisiones: decisionesPara(run), puerto, actor: 'u', fechaHora: 'x' });
    expect(r.creados).toBe(1);
    expect(r.fallidos).toBe(1);
    expect(r.informe).toMatch(/FALLIDO/);
  });
  it('cobro: destino determinista + contrato derivado (dry-run AUTO)', () => {
    const run = ejecutarImportDryRun(entrada([{
      id: 'SYNTH_cob_1', type: 'ingreso', category: 'rent', amount: 500, propertyId: 'prop_ext_1',
      date: '2024-03-05', description: 'Alquiler marzo 2024', mes: 3, anio: 2024,
      inquilinoId: 'inq_1', contratoId: 'cont_1',
    }], 'COBRO'));
    expect(run.registros[0].decision).toBe('AUTO');
    expect(run.registros[0].destinationId).toBe('cobro_cont_1_2024_3');
    expect(contratoIdDeDestinoCobro('cobro_cont_1_2024_3')).toBe('cont_1');
    expect(contratoIdDeDestinoCobro('basura')).toBeNull();
  });
  it('cobro: O7 excluye por puerta fiscal (SIN_CLASIFICAR; coherente con B1: cobros sin categoría fiscal)', () => {
    const run = ejecutarImportDryRun(entrada([{
      id: 'SYNTH_cob_1', type: 'ingreso', category: 'rent', amount: 500, propertyId: 'prop_ext_1',
      date: '2024-03-05', description: 'Alquiler', mes: 3, anio: 2024,
      inquilinoId: 'inq_1', contratoId: 'cont_1',
    }], 'COBRO'));
    const aut = autorizarImportRun({ run, tamanoBytes: 10, commitDryRun: 'test' });
    expect(aut.decision).toBe('CONDICIONADA');
    expect(aut.excluidos[0].motivo).toMatch(/fiscal/);
  });
  it('cobro: el ejecutor anexa cuando el plan lo autoriza (maquinaria lista)', async () => {
    const run = ejecutarImportDryRun(entrada([{
      id: 'SYNTH_cob_1', type: 'ingreso', category: 'rent', amount: 500, propertyId: 'prop_ext_1',
      date: '2024-03-05', description: 'Alquiler', mes: 3, anio: 2024,
      inquilinoId: 'inq_1', contratoId: 'cont_1',
    }], 'COBRO'));
    const r = run.registros[0];
    const fp = r.fingerprint;
    const decisiones = { [fp]: { estadoCobro: 'PAGADO' as const, fechaVencimiento: '2024-03-05' } };
    const puerto = puertoFake();
    const res = await ejecutarPromocion({
      plan: {
        ejecutable: true, importRunId: run.importRunId, migrationRunId: 'imp_run_test',
        operaciones: [{
          fingerprint: fp, sourceRecordId: r.sourceRecordId, indiceOrigen: 0,
          entidad: 'COBRO', coleccion: 'contratos_formalizacion/registroCobros(embebido)',
          destinoId: 'cobro_cont_1_2024_3', propietarioDestinoId: 'prop_A',
        }],
        excluidas: [], vinculadasSinEscritura: [], condicionesAborto: [],
      },
      run, decisiones, puerto, actor: 'u', fechaHora: 'x',
    });
    expect(res.creados).toBe(1);
    const cobro = puerto.cobros.get('cont_1/cobro_cont_1_2024_3') as { periodoMesAnio: string; nombreMes: string };
    expect(cobro.periodoMesAnio).toBe('2024-03');
    expect(cobro.nombreMes).toBe('Marzo 2024');
  });
  it('payload cobro usa vencimiento/estado de decisión (no inventados)', () => {
    const run = ejecutarImportDryRun(entrada([{
      id: 'SYNTH_cob_1', type: 'ingreso', category: 'rent', amount: 500, propertyId: 'prop_ext_1',
      date: '2024-03-05', description: 'Alquiler', mes: 3, anio: 2024, inquilinoId: 'inq_1', contratoId: 'cont_1',
    }], 'COBRO'));
    const c = construirCobroDestino(run.registros[0], { estadoCobro: 'PENDIENTE', fechaVencimiento: '2024-03-10' }, { fechaHora: 'x', actor: null, migrationRunId: 'm' });
    expect(c.fechaVencimiento).toBe('2024-03-10');
    expect(c.estado).toBe('PENDIENTE');
    expect(c.importePrevisto).toBe(500);
  });
  it('verificarBarrera reutilizada de O7 (sha distinto → falla)', () => {
    const run = runAutorizable();
    const aut = autorizarImportRun({ run, tamanoBytes: 10, commitDryRun: 'test' });
    const v = verificarBarrera({
      autorizacion: aut, canonicalBatchSha256: 'f'.repeat(64),
      explicitExecutionToken: derivarTokenEjecucion(run.sourceHash), dryRunActual: run.dryRun,
    });
    expect(v.pasa).toBe(false);
  });
  void DECISIONES;
});

// ---------------------------------------------------------------------------
// 12. Exportación
// ---------------------------------------------------------------------------

describe('exportación', () => {
  const CATALOGO = [
    { id: 'inm_1', propietarioId: 'prop_A' },
    { id: 'inm_2', propietarioId: 'prop_B' },
  ];
  const AUT = { propietarioIdsLegibles: ['prop_A'], propietarioIdsEscribibles: ['prop_A'], esMaster: false };
  const GASTOS = [
    { id: 'g1', propietarioId: 'prop_A', inmuebleId: 'inm_1', categoria: 'IBI', concepto: 'IBI "24"', importe: 100, ejercicioFiscal: 2024, periodoMesAnio: '2024-06' },
    { id: 'g2', propietarioId: 'prop_B', inmuebleId: 'inm_2', categoria: 'IBI', concepto: 'otro', importe: 50, ejercicioFiscal: 2024, periodoMesAnio: '2024-06' },
    { id: 'g3', propietarioId: 'prop_A', inmuebleId: 'inm_1', categoria: 'IBI', concepto: 'viejo', importe: 10, ejercicioFiscal: 2022, periodoMesAnio: '2022-06' },
  ];
  it('JSON: marca __erpExport + versión + sha; reproducible 2×', () => {
    const p = {
      solicitado: { entidad: 'GASTO', propietarioIds: ['prop_A'], formato: 'JSON' as const },
      autorizado: AUT, catalogoInmuebles: CATALOGO, registros: GASTOS,
      exportedAt: '2026-01-01T00:00:00.000Z', exportedBy: 'u',
    };
    const a = ejecutarExportacion(p);
    const b = ejecutarExportacion(p);
    expect(a.recordCount).toBe(2);
    expect(a.contenido).toBe(b.contenido);
    expect(a.sha256).toBe(b.sha256);
    const parsed = JSON.parse(a.contenido) as { __erpExport: { schemaVersion: string; entityType: string }; recordCount: number };
    expect(parsed.__erpExport.schemaVersion).toBe('erp-import-export-v1');
    expect(parsed.__erpExport.entityType).toBe('GASTO');
    expect(a.sha256).toBe(sha256Hex(new TextEncoder().encode(a.contenido)));
  });
  it('marca de export propio detectable al reimportar (round-trip)', () => {
    const exp = ejecutarExportacion({
      solicitado: { entidad: 'GASTO', propietarioIds: ['prop_A'], formato: 'JSON' },
      autorizado: AUT, catalogoInmuebles: CATALOGO, registros: GASTOS, exportedAt: 'x', exportedBy: null,
    });
    const marca = extraerMarcaExportPropio(JSON.parse(exp.contenido));
    expect(marca).toEqual({ schemaVersion: 'erp-import-export-v1', entityType: 'GASTO' });
    expect(extraerMarcaExportPropio({ a: 1 })).toBeNull();
  });
  it('CSV: cabecera estable + escaping de comillas', () => {
    const exp = ejecutarExportacion({
      solicitado: { entidad: 'GASTO', propietarioIds: ['prop_A'], formato: 'CSV' },
      autorizado: AUT, catalogoInmuebles: CATALOGO, registros: GASTOS, exportedAt: 'x', exportedBy: null,
    });
    const lineas = exp.contenido.split('\n');
    expect(lineas[0].split(',')[0]).toBe('id');
    expect(exp.contenido).toMatch(/IBI ""24""/);
    expect(exp.recordCount).toBe(2);
  });
  it('filtros propietario + ejercicio + meses', () => {
    const exp = ejecutarExportacion({
      solicitado: { entidad: 'GASTO', propietarioIds: ['prop_A'], ejercicios: [2024], meses: ['2024-06'], formato: 'JSON' },
      autorizado: AUT, catalogoInmuebles: CATALOGO, registros: GASTOS, exportedAt: 'x', exportedBy: null,
    });
    expect(exp.recordCount).toBe(1);
  });
  it('fuera de ámbito → denegada (gestor A/B no exporta C)', () => {
    expect(() => ejecutarExportacion({
      solicitado: { entidad: 'GASTO', propietarioIds: ['prop_A', 'prop_C'], formato: 'JSON' },
      autorizado: { propietarioIdsLegibles: ['prop_A', 'prop_B'], propietarioIdsEscribibles: [], esMaster: false },
      catalogoInmuebles: CATALOGO, registros: GASTOS, exportedAt: 'x', exportedBy: null,
    })).toThrow(/fuera de ámbito.*prop_C/);
  });
  it('inmueble de otro propietario → denegado', () => {
    expect(() => ejecutarExportacion({
      solicitado: { entidad: 'GASTO', propietarioIds: ['prop_A'], inmuebleIds: ['inm_2'], formato: 'JSON' },
      autorizado: AUT, catalogoInmuebles: CATALOGO, registros: GASTOS, exportedAt: 'x', exportedBy: null,
    })).toThrow(/fuera de ámbito/);
  });
  it('entidad no exportable → error honesto', () => {
    expect(() => ejecutarExportacion({
      solicitado: { entidad: 'INCIDENCIA', propietarioIds: ['prop_A'], formato: 'JSON' },
      autorizado: AUT, catalogoInmuebles: CATALOGO, registros: [], exportedAt: 'x', exportedBy: null,
    })).toThrow(/no exportable/);
  });
  it('master sin propietarioIds → sin volcado global implícito', () => {
    expect(() => ejecutarExportacion({
      solicitado: { entidad: 'GASTO', propietarioIds: [], formato: 'JSON' },
      autorizado: { propietarioIdsLegibles: null, propietarioIdsEscribibles: null, esMaster: true },
      catalogoInmuebles: CATALOGO, registros: GASTOS, exportedAt: 'x', exportedBy: null,
    })).toThrow(/explícitos/);
  });
  it('PROPIETARIO filtra por propio id', () => {
    const exp = ejecutarExportacion({
      solicitado: { entidad: 'PROPIETARIO', propietarioIds: ['prop_A'], formato: 'JSON' },
      autorizado: AUT, catalogoInmuebles: CATALOGO,
      registros: [{ id: 'prop_A', nombre: 'A' }, { id: 'prop_B', nombre: 'B' }],
      exportedAt: 'x', exportedBy: null,
    });
    expect(exp.recordCount).toBe(1);
  });
  it('filtro temporal en INMUEBLE → aviso (solo GASTO/COBRO)', () => {
    const v = validarAmbitoExportacion(
      { entidad: 'INMUEBLE', propietarioIds: ['prop_A'], ejercicios: [2024], formato: 'JSON' },
      AUT, CATALOGO,
    );
    expect(v.ok).toBe(true);
    expect(v.avisos.join(' ')).toMatch(/solo aplica a GASTO\/COBRO/);
  });
});

// ---------------------------------------------------------------------------
// 13. Ámbito desde usuario (D2/D3)
// ---------------------------------------------------------------------------

describe('ámbito autorizado', () => {
  const baseUsuario = {
    id: 'u1', nombre: 'G', email: 'g@x.es', tipoPerfil: 'PROPIETARIO' as const,
    estado: 'ACTIVO' as const, roles: [], permisos: [], createdAt: 'x', updatedAt: 'x',
  };
  it('sin usuario → vacío', () => {
    expect(ambitoAutorizadoDesdeUsuario(null, [])).toEqual({
      propietarioIdsLegibles: [], propietarioIdsEscribibles: [], esMaster: false,
    });
  });
  it('master → sin restricción', () => {
    const a = ambitoAutorizadoDesdeUsuario({ ...baseUsuario, tipoPerfil: 'ADMINISTRADOR' as const }, []);
    expect(a.esMaster).toBe(true);
    expect(a.propietarioIdsLegibles).toBeNull();
  });
  it('propietario + espejo carteras → unión', () => {
    const a = ambitoAutorizadoDesdeUsuario({
      ...baseUsuario, propietarioId: 'prop_A', carterasL: ['prop_B'], carterasE: [],
    }, []);
    expect(a.propietarioIdsLegibles).toEqual(['prop_A', 'prop_B']);
    expect(a.propietarioIdsEscribibles).toEqual(['prop_A']);
  });
});

// ---------------------------------------------------------------------------
// 14. Fixtures tipo A/B (§28, sintéticos)
// ---------------------------------------------------------------------------

describe('fixtures tipo A/B (SINTÉTICOS, no históricos)', () => {
  // Fuente tipo A: gastos/ingresos multi-ejercicio + fiscal + extras + ausentes.
  const FIXTURE_A = [
    { id: 'SYNTH_A_1', type: 'gasto', category: 'ibi', amount: 170.59, propertyId: 'prop_ext_1', date: '2023-06-10', description: 'IBI 2023', deducible: true, campoExtraA: 'se ignora' },
    { id: 'SYNTH_A_2', type: 'gasto', category: 'insurance', amount: 216.19, propertyId: 'prop_ext_1', date: '2024-01-05', description: 'Póliza multirriesgo 2024', deducible: false },
    { id: 'SYNTH_A_3', type: 'gasto', category: 'community', propertyId: 'prop_ext_1', date: '2024-02-01', description: 'Sin importe' },
    { id: 'SYNTH_A_4', type: 'ingreso', category: 'rent', amount: 500, propertyId: 'prop_ext_1', date: '2024-03-05', description: 'Alquiler marzo 2024', mes: 3, anio: 2024, inquilinoId: 'inq_1', contratoId: 'cont_1' },
  ];
  // Fuente tipo B: inmuebles + propietario/dirección/ids + opcionales + extras.
  const FIXTURE_B = [
    { id: 'inm_1', address: 'Calle X 1', city: 'Madrid', cadastralReference: 'CAT001', monthlyRent: 500, owner: 'user1', campoExtraB: 1 },
    { id: 'SYNTH_B_nuevo', address: 'Calle Nueva 9', monthlyRent: 700 },
  ];

  it('A: parcial (AUTO + INCOMPLETO + REVISIÓN) con desconocidos tolerados', () => {
    const run = ejecutarImportDryRun(entrada(FIXTURE_A, 'AUTO'));
    expect(run.totalRecords).toBe(4);
    // A_1 AUTO (fiscal explícito), A_2 REVISIÓN (insurance ambiguo B1-C),
    // A_3 INCOMPLETO (sin importe), A_4 COBRO AUTO.
    const porId = Object.fromEntries(run.registros.map((r) => [r.sourceRecordId, r.decision]));
    expect(porId['SYNTH_A_1']).toBe('AUTO');
    expect(porId['SYNTH_A_2']).toBe('REVISION');
    expect(porId['SYNTH_A_3']).toBe('INCOMPLETO');
    expect(porId['SYNTH_A_4']).toBe('AUTO');
    expect(run.camposDesconocidos.map((c) => c.campo)).toContain('campoExtraA');
  });
  it('B: match canónico AUTO-VINCULAR + nuevo INCOMPLETO (sin titular)', () => {
    const run = ejecutarImportDryRun(entrada(FIXTURE_B, 'INMUEBLE'));
    const porId = Object.fromEntries(run.registros.map((r) => [r.sourceRecordId, r.decision]));
    expect(porId['inm_1']).toBe('AUTO');
    expect(porId['SYNTH_B_nuevo']).toBe('INCOMPLETO');
    expect(run.camposDesconocidos.map((c) => c.campo)).toContain('campoExtraB');
    expect(run.camposDesconocidos.map((c) => c.campo)).toContain('city'); // pendiente, no asumido
  });
  it('los fixtures NO declaran identidad histórica real', () => {
    for (const f of [...FIXTURE_A, ...FIXTURE_B]) {
      expect(String(f.id)).toMatch(/^(SYNTH_|inm_)/);
    }
    const run = ejecutarImportDryRun(entrada(FIXTURE_A, 'AUTO'));
    expect(run.sourceName).toMatch(/^SYNTHETIC-/);
  });
});

// ---------------------------------------------------------------------------
// 15. Informe (§23: 22 puntos)
// ---------------------------------------------------------------------------

describe('informe de importación', () => {
  it('contiene los 22 puntos y localiza cada pendiente', () => {
    const { amount: _a, ...sinImporte } = GASTO_AUTO;
    void _a;
    const run = ejecutarImportDryRun(entrada([{ ...GASTO_AUTO }, { ...sinImporte, id: 'SYNTH_x' }], 'GASTO'));
    for (let i = 1; i <= 22; i++) {
      expect(run.informe).toMatch(new RegExp(`^${i}\\. `, 'm'));
    }
    expect(run.informe).toMatch(/registros\[1\].*INCOMPLETO/);
  });
});
