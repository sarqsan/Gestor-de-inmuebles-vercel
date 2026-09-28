/**
 * BLOQUE 7 — Importación/Exportación XLSX de extremo a extremo por el contrato
 * canónico (`erp-import-export-v1`).
 *
 * Qué demuestra, con archivos REALES de fixture (SheetJS + DEFLATE de zlib,
 * generados fuera del repositorio):
 *  · el libro real entra por el MISMO contrato que JSON/CSV (lectura → mapping →
 *    validación → dry-run de 0 escrituras) sin lógica paralela;
 *  · idempotencia: reimportar el mismo archivo reproduce el mismo run (mismo
 *    `importRunId`, mismo hash de lote, mismas decisiones);
 *  · aislamiento: el archivo NUNCA manda — un libro que apunta a una cartera no
 *    autorizada queda bloqueado (0 escrituras, 0 AUTO);
 *  · exportación XLSX real: mismas columnas y orden que CSV, ámbito exacto,
 *    determinista y reimportable; los valores que parecen fórmula viajan como
 *    TEXTO;
 *  · regresión: CSV y JSON del exportador canónico siguen intactos.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/lib/importacion/hash';
import type { CatalogosMigracion } from '../src/lib/migracion/tipos';
import {
  COLUMNAS_CSV,
  ENTIDADES_EXPORTABLES,
  columnasXlsxDeEntidad,
  ejecutarExportacion,
  ejecutarImportDryRun,
  nombreHojaDeEntidad,
  parseXlsx,
  type AmbitoAutorizado,
  type ImportRun,
} from '../src/lib/importExport';

const FIXTURES = new URL('./fixtures/xlsx/', import.meta.url);
const fixture = (nombre: string): Uint8Array => new Uint8Array(readFileSync(new URL(nombre, FIXTURES)));

const MASTER: AmbitoAutorizado = { propietarioIdsLegibles: null, propietarioIdsEscribibles: null, esMaster: true };
const AUT_AB: AmbitoAutorizado = {
  propietarioIdsLegibles: ['prop_A', 'prop_B'],
  propietarioIdsEscribibles: ['prop_A', 'prop_B'],
  esMaster: false,
};
const AUT_SOLO_A: AmbitoAutorizado = {
  propietarioIdsLegibles: ['prop_A'], propietarioIdsEscribibles: ['prop_A'], esMaster: false,
};

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

const CATALOGO_INMUEBLES = [
  { id: 'inm_1', direccion: 'Calle X 1', propietarioId: 'prop_A' },
  { id: 'inm_2', direccion: 'Calle Y 2', propietarioId: 'prop_B' },
];

/** Ejecuta la importación del libro real de fixture por el contrato canónico. */
function importarFixture(
  nombre = 'movimientos-rentasync.xlsx',
  extra?: { catalogos?: CatalogosMigracion; hoja?: string; entityType?: string },
): ImportRun {
  const bytes = fixture(nombre);
  const parseo = parseXlsx(bytes, extra?.hoja ? { hoja: extra.hoja } : {});
  expect(parseo.errores).toEqual([]);
  return ejecutarImportDryRun({
    registrosCrudos: parseo.registros,
    localizaciones: parseo.localizaciones,
    entityType: extra?.entityType ?? 'AUTO',
    formato: 'XLSX',
    sourceName: nombre,
    sourceHash: sha256Hex(bytes),
    sourceTamanoBytes: bytes.length,
    sourceType: 'EXTERNAL',
    catalogos: extra?.catalogos ?? catalogosBase(),
    fechaHora: '2026-09-27T00:00:00.000Z',
    actor: 'tester',
  });
}

describe('importación XLSX por el contrato canónico', () => {
  it('mapea y clasifica el libro real (gasto AUTO, cobro incompleto, campos desconocidos)', () => {
    const run = importarFixture();
    expect(run.formato).toBe('XLSX');
    expect(run.totalRecords).toBe(4);
    expect(run.entityType).toBe('AUTO');

    const porOrigen = new Map(run.registros.map((r) => [r.sourceRecordId, r]));
    const g1 = porOrigen.get('exp-g1')!;
    expect(g1.entityType).toBe('GASTO');
    expect(g1.decision).toBe('AUTO');
    expect(g1.canonicalData).toMatchObject({ importe: 100.5, fechaDevengo: '2024-03-15', categoria: 'COMUNIDAD' });
    expect(g1.sourcePath).toBe("hoja 'Movimientos' fila 2");
    expect(g1.destinoColeccion).toBe('gastos');
    expect(g1.propietarioDestinoId).toBe('prop_A');
    expect(g1.inmuebleDestinoId).toBe('inm_1');
    expect(g1.provenance.sourceVersion).toBe('external/unknown');

    // Importe en texto ES y fecha D/M/Y: el mapping los convierte y lo avisa.
    const g2 = porOrigen.get('exp-g2')!;
    expect(g2.canonicalData).toMatchObject({ importe: 1234.56, fechaDevengo: '2024-04-15' });
    expect(g2.warnings.join(' ')).toMatch(/interpretado como 2024-04-15/);

    // Fórmula cacheada: se importa el valor del libro, nunca se evalúa.
    const g3 = porOrigen.get('exp-g3')!;
    expect(g3.canonicalData).toMatchObject({ importe: 712.75, categoria: 'REPARACION' });

    // ingreso+rent en el mismo libro: se reconoce como COBRO y, sin mes/año, es
    // INCOMPLETO (nunca AUTO a ciegas).
    const i1 = porOrigen.get('exp-i1')!;
    expect(i1.entityType).toBe('COBRO');
    expect(i1.decision).toBe('INCOMPLETO');
    expect(i1.motivo).toMatch(/mes|anio|año/i);

    // Columnas del libro sin mapping: agregadas y visibles en el informe.
    expect(run.camposDesconocidos.map((c) => c.campo)).toContain('campoDesconocido');
    expect(run.informe).toMatch(/hoja 'Movimientos' fila 5/);
    expect(run.dryRun.soloLectura).toBe(true);
  });

  it('reimportar el mismo archivo reproduce exactamente el mismo run (idempotencia)', () => {
    const a = importarFixture();
    const b = importarFixture();
    expect(b.importRunId).toBe(a.importRunId);
    expect(b.dryRun.loteSha256).toBe(a.dryRun.loteSha256);
    expect(b.registros).toEqual(a.registros);
    expect(b.informe).toBe(a.informe);
  });

  it('aislamiento: un libro que apunta a una cartera no autorizada queda bloqueado', () => {
    const run = importarFixture('movimientos-rentasync.xlsx', {
      catalogos: catalogosBase({ propietariosPermitidosIds: ['prop_B'] }),
    });
    expect(run.importedRecords).toBe(0);
    expect(run.registros.every((r) => r.decision !== 'AUTO')).toBe(true);
    expect(run.registros[0].motivo).toMatch(/NO_PERMITIDO|permitid/i);
    expect(run.dryRun.soloLectura).toBe(true);
  });

  it('hoja explícita del libro: se importa la hoja indicada (y solo esa)', () => {
    const porDefecto = importarFixture('inmuebles-varias-hojas.xlsx');
    expect(porDefecto.registros.map((r) => r.sourcePath)).toEqual([
      "hoja 'Inmuebles' fila 2", "hoja 'Inmuebles' fila 3",
    ]);
    const contratos = importarFixture('inmuebles-varias-hojas.xlsx', { hoja: 'Contratos', entityType: 'CONTRATO' });
    expect(contratos.registros).toHaveLength(1);
    expect(contratos.registros[0].sourceRecordId).toBe('cont_ext_1');
    expect(contratos.registros[0].sourcePath).toBe("hoja 'Contratos' fila 2");
    // El mismo archivo con otra entidad declarada es otro run (trazabilidad).
    expect(contratos.importRunId).not.toBe(porDefecto.importRunId);
    // Sin catálogo que resuelva el inmueble de origen no se promociona a AUTO.
    expect(contratos.registros[0].decision).not.toBe('AUTO');
  });
});

describe('exportación XLSX por el contrato canónico', () => {
  const gastos = [
    { id: 'g_a1', inmuebleId: 'inm_1', propietarioId: 'prop_A', concepto: 'Comunidad marzo', importe: 100.5, fechaDevengo: '2024-03-15', categoria: 'COMUNIDAD', deducible: true, origen: 'FACTURA', origenId: 'fac_1' },
    { id: 'g_a2', inmuebleId: 'inm_1', propietarioId: 'prop_A', concepto: '=SUM(A1:A9)', importe: 20, fechaDevengo: '2024-04-01', categoria: 'SEGUROS', deducible: false },
    { id: 'g_b1', inmuebleId: 'inm_2', propietarioId: 'prop_B', concepto: 'Otra cartera', importe: 999, fechaDevengo: '2024-05-01' },
  ];

  it('usa exactamente las columnas del exportador CSV, con ámbitos y tipos declarados', () => {
    expect(ENTIDADES_EXPORTABLES).toEqual(['GASTO', 'COBRO', 'INMUEBLE', 'PROPIETARIO', 'CONTRATO']);
    expect(columnasXlsxDeEntidad('GASTO').map((c) => c.nombre)).toEqual([...COLUMNAS_CSV.GASTO]);
    expect(columnasXlsxDeEntidad('GASTO').find((c) => c.nombre === 'importe')?.tipo).toBe('numero');
    expect(columnasXlsxDeEntidad('GASTO').find((c) => c.nombre === 'fechaDevengo')?.tipo).toBe('fecha');
    expect(columnasXlsxDeEntidad('GASTO').find((c) => c.nombre === 'id')?.tipo).toBe('texto');
    // NIF y códigos postales viajan como texto (no se numericen).
    expect(columnasXlsxDeEntidad('PROPIETARIO').every((c) => c.tipo === 'texto')).toBe(true);
    expect(nombreHojaDeEntidad('GASTO')).toBe('GASTO');
  });

  it('genera un libro con el ámbito exacto, determinista y reimportable', () => {
    const exp = ejecutarExportacion({
      solicitado: { entidad: 'GASTO', propietarioIds: ['prop_A'], formato: 'XLSX' },
      autorizado: AUT_SOLO_A,
      catalogoInmuebles: CATALOGO_INMUEBLES,
      registros: gastos,
      exportedAt: '2026-09-27T00:00:00.000Z',
      exportedBy: 'u_1',
    });
    expect(exp.formato).toBe('XLSX');
    expect(exp.recordCount).toBe(2);
    expect(exp.contenido).toBe('');
    expect(exp.bytes!.length).toBeGreaterThan(0);
    expect(exp.sha256).toBe(sha256Hex(exp.bytes!));

    const repetida = ejecutarExportacion({
      solicitado: { entidad: 'GASTO', propietarioIds: ['prop_A'], formato: 'XLSX' },
      autorizado: AUT_SOLO_A,
      catalogoInmuebles: CATALOGO_INMUEBLES,
      registros: gastos,
      exportedAt: '2026-09-27T00:00:00.000Z',
      exportedBy: 'u_1',
    });
    expect(repetida.sha256).toBe(exp.sha256);
    expect(repetida.exportRunId).toBe(exp.exportRunId);
    expect(Buffer.from(repetida.bytes!).equals(Buffer.from(exp.bytes!))).toBe(true);

    const leido = parseXlsx(exp.bytes!);
    expect(leido.errores).toEqual([]);
    expect(leido.hojas).toEqual(['GASTO']);
    expect(leido.registros).toHaveLength(2);
    expect(leido.registros.map((r) => r['id'])).toEqual(['g_a1', 'g_a2']);
    expect(leido.registros[0]).toMatchObject({
      id: 'g_a1', propietarioId: 'prop_A', importe: 100.5, fechaDevengo: '2024-03-15',
      deducible: true, origen: 'FACTURA', origenId: 'fac_1',
    });
    // La cartera ajena no aparece ni en el archivo ni en el recuento.
    expect(JSON.stringify(leido.registros)).not.toContain('g_b1');
    expect(leido.registros.some((r) => r['propietarioId'] === 'prop_B')).toBe(false);
  });

  it('los valores que parecen fórmula viajan como texto (sin inyección en el libro)', () => {
    const exp = ejecutarExportacion({
      solicitado: { entidad: 'GASTO', propietarioIds: ['prop_A'], formato: 'XLSX' },
      autorizado: AUT_AB,
      catalogoInmuebles: CATALOGO_INMUEBLES,
      registros: gastos,
      exportedAt: '2026-09-27T00:00:00.000Z',
    });
    const leido = parseXlsx(exp.bytes!);
    expect(leido.registros.find((r) => r['id'] === 'g_a2')?.['concepto']).toBe('=SUM(A1:A9)');
  });

  it('ámbito: se rechaza exportar otra cartera, el volcado implícito y entidades no exportables', () => {
    const comun = {
      catalogoInmuebles: CATALOGO_INMUEBLES,
      registros: gastos,
      exportedAt: '2026-09-27T00:00:00.000Z',
    };
    expect(() => ejecutarExportacion({
      ...comun,
      solicitado: { entidad: 'GASTO', propietarioIds: ['prop_B'], formato: 'XLSX' },
      autorizado: AUT_SOLO_A,
    })).toThrowError(/fuera de ámbito/);
    expect(() => ejecutarExportacion({
      ...comun,
      solicitado: { entidad: 'GASTO', propietarioIds: [], formato: 'XLSX' },
      autorizado: MASTER,
    })).toThrowError(/explícitos/);
    expect(() => ejecutarExportacion({
      ...comun,
      solicitado: { entidad: 'INCIDENCIA', propietarioIds: ['prop_A'], formato: 'XLSX' },
      autorizado: AUT_SOLO_A,
    })).toThrowError(/no exportable/);
    expect(() => ejecutarExportacion({
      ...comun,
      solicitado: { entidad: 'GASTO', propietarioIds: ['prop_A'], inmuebleIds: ['inm_2'], formato: 'XLSX' },
      autorizado: AUT_SOLO_A,
    })).toThrowError(/fuera de ámbito/);
  });

  it('regresión: CSV y JSON del exportador canónico no cambian (columnas, orden y marcas)', () => {
    const csv = ejecutarExportacion({
      solicitado: { entidad: 'GASTO', propietarioIds: ['prop_A'], formato: 'CSV' },
      autorizado: AUT_SOLO_A,
      catalogoInmuebles: CATALOGO_INMUEBLES,
      registros: gastos,
      exportedAt: '2026-09-27T00:00:00.000Z',
    });
    expect(csv.bytes).toBeUndefined();
    const lineas = csv.contenido.split('\n');
    expect(lineas[0]).toBe([...COLUMNAS_CSV.GASTO].join(','));
    expect(lineas[1].startsWith('g_a1,inm_1,prop_A,')).toBe(true);
    expect(csv.contenido).not.toContain('g_b1');

    const json = ejecutarExportacion({
      solicitado: { entidad: 'GASTO', propietarioIds: ['prop_A'], formato: 'JSON' },
      autorizado: AUT_SOLO_A,
      catalogoInmuebles: CATALOGO_INMUEBLES,
      registros: gastos,
      exportedAt: '2026-09-27T00:00:00.000Z',
    });
    const raiz = JSON.parse(json.contenido);
    expect(raiz.__erpExport).toMatchObject({ entityType: 'GASTO', schemaVersion: 'erp-import-export-v1' });
    expect(raiz.records.map((r: { id: string }) => r.id)).toEqual(['g_a1', 'g_a2']);
    expect(raiz.recordCount).toBe(2);

    // CSV y JSON del MISMO ámbito contienen el mismo conjunto de registros que XLSX.
    const xlsx = ejecutarExportacion({
      solicitado: { entidad: 'GASTO', propietarioIds: ['prop_A'], formato: 'XLSX' },
      autorizado: AUT_SOLO_A,
      catalogoInmuebles: CATALOGO_INMUEBLES,
      registros: gastos,
      exportedAt: '2026-09-27T00:00:00.000Z',
    });
    expect(xlsx.recordCount).toBe(raiz.recordCount);
    expect(xlsx.sha256).not.toBe(json.sha256);
  });

  it('cada entidad exportable tiene columnas propias (sin exportadores ficticios)', () => {
    for (const entidad of ENTIDADES_EXPORTABLES) {
      const columnas = columnasXlsxDeEntidad(entidad);
      expect(columnas.length).toBeGreaterThan(0);
      expect(columnas.every((c) => ['texto', 'numero', 'fecha'].includes(c.tipo))).toBe(true);
    }
  });
});
