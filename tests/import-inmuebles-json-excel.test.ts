/**
 * INCIDENCIA — IMPORTACIÓN DE INMUEBLES (JSON / EXCEL)
 * =====================================================
 *
 * Batería de la incidencia «el JSON no se acepta» + «el Excel no reconoce las
 * cabeceras y marca `direccion` como ausente».
 *
 * DATOS SINTÉTICOS: todos los inmuebles, titulares, direcciones y referencias
 * catastrales de este fichero son inventados (`SYNTH-*`, `CAT-EXT-*`). No son
 * datos reales, no se ha importado nada en ningún entorno y ninguna prueba
 * escribe en Firestore/Storage (todo el núcleo es puro; la promoción usa puerto
 * fake y aquí ni se ejecuta).
 *
 * Cubre las 8 pruebas obligatorias de la orden:
 *   1. JSON exportado por la propia aplicación.
 *   2. Excel de 7 filas: reconocimiento de «Dirección Completa».
 *   3. Las 17 cabeceras: mapeo correcto o incidencia explícita.
 *   4. Porcentajes y cotitularidad: sin inferencias.
 *   5. Perfil PROPIETARIO: destino correcto y respeto de permisos.
 *   6. Archivo incompatible: error claro, sin importación vacía silenciosa.
 *   7. Duplicados: detección sin sobrescritura.
 *   8. Exportación → importación → exportación.
 */
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/lib/importacion/hash';
import type { CatalogosMigracion } from '../src/lib/migracion/tipos';
import {
  analizarEstructuraJson,
  aplicarMapping,
  detectarFormatoEntrada,
  ejecutarExportacion,
  ejecutarImportDryRun,
  esOle2,
  esZip,
  extraerMarcaExportPropio,
  generarXlsx,
  motivoJsonSinRegistros,
  parseJson,
  parseXlsx,
  planificarPromocion,
  autorizarImportRun,
  derivarTokenEjecucion,
  claveCabecera,
  separarDireccionCompleta,
  type ColumnaXlsx,
  type ImportRun,
} from '../src/lib/importExport';

// ---------------------------------------------------------------------------
// Fixtures sintéticos
// ---------------------------------------------------------------------------

const PROP_ACTOR = 'prop_A';          // titular de la sesión (perfil PROPIETARIO)
const PROP_SEGUNDO = 'prop_B';        // segundo titular creado en su perfil

/** Catálogo destino: `prop_A` es el único escribible para el actor. */
function catalogos(extra?: Partial<CatalogosMigracion>): CatalogosMigracion {
  return {
    propietarios: [
      { id: PROP_ACTOR, nombre: 'Titular principal (sintético)', nifCif: '11111111A', estadoAcceso: 'ACTIVO' },
      { id: PROP_SEGUNDO, nombre: 'Segundo titular (sintético)', nifCif: '22222222B', estadoAcceso: 'SIN_CUENTA', cuentaId: null },
    ],
    inmuebles: [
      { id: 'inm_1', direccion: 'Calle Sintética Uno 1', ciudad: 'Alicante', referenciaCatastral: 'CAT-001', propietarioId: PROP_ACTOR },
      { id: 'inm_2', direccion: 'Calle Sintética Dos 2', ciudad: 'Alicante', referenciaCatastral: 'CAT-002', propietarioId: PROP_ACTOR },
      { id: 'inm_3', direccion: 'Calle Sintética Tres 3', ciudad: 'Elche', referenciaCatastral: 'CAT-003', propietarioId: PROP_ACTOR },
    ],
    contratos: [],
    mapeos: [],
    existentes: [],
    propietariosPermitidosIds: [PROP_ACTOR],
    importador: { uid: 'u_sintetico', modalidad: 'PROPIETARIO' },
    ...extra,
  };
}

/** Las 17 cabeceras exactas informadas en la incidencia. */
const CABECERAS_17 = [
  'ID Inmueble', 'Dirección Completa', 'Referencia Catastral', 'Titularidad',
  '% Propietario 1', '% Propietario 2', 'Precio Adquisición (€)', 'Amortización Anual (€)',
  'Renta Mensual (€)', 'Gastos Comunidad (€)', 'Gastos IBI (€)', 'Gastos Reparaciones (€)',
  'Gastos Seguro (€)', '% Suelo Catastral', 'Inquilino', 'DNI Inquilino', 'Fecha Registro',
] as const;

const NUMERICAS = new Set<string>([
  '% Propietario 1', '% Propietario 2', 'Precio Adquisición (€)', 'Amortización Anual (€)',
  'Renta Mensual (€)', 'Gastos Comunidad (€)', 'Gastos IBI (€)', 'Gastos Reparaciones (€)',
  'Gastos Seguro (€)', '% Suelo Catastral',
]);

function filaSintetica(i: number): Record<string, unknown> {
  return {
    'ID Inmueble': `INM-EXT-${i}`,
    'Dirección Completa': `Calle Sintética ${i}, 03001 Alicante`,
    'Referencia Catastral': `CAT-EXT-${i}`,
    'Titularidad': i === 1 ? 'Propietario único' : 'Cotitularidad',
    '% Propietario 1': i === 1 ? 100 : 60,
    '% Propietario 2': i === 1 ? '' : 40,
    'Precio Adquisición (€)': 120000 + i * 1000,
    'Amortización Anual (€)': 3000 + i,
    'Renta Mensual (€)': 650 + i * 10,
    'Gastos Comunidad (€)': 45,
    'Gastos IBI (€)': 320,
    'Gastos Reparaciones (€)': 0,
    'Gastos Seguro (€)': 180,
    '% Suelo Catastral': 20,
    'Inquilino': i % 2 === 0 ? 'Inquilino Sintético' : '',
    'DNI Inquilino': i % 2 === 0 ? '33333333C' : '',
    'Fecha Registro': `2019-05-0${i}`,
  };
}

function libroPlantilla(filas: Record<string, unknown>[]): Uint8Array {
  const columnas: ColumnaXlsx[] = CABECERAS_17.map((nombre) => ({ nombre, tipo: NUMERICAS.has(nombre) ? 'numero' : 'texto' }));
  return generarXlsx([{ nombre: 'Inmuebles', columnas, filas }]);
}

function libroConCabeceras(columnas: string[], filas: Record<string, unknown>[]): Uint8Array {
  return generarXlsx([{ nombre: 'Datos', columnas: columnas.map((nombre) => ({ nombre, tipo: 'texto' })), filas }]);
}

function correr(entrada: {
  registrosCrudos: Record<string, unknown>[];
  localizaciones?: string[];
  entityType?: string;
  formato?: 'JSON' | 'CSV' | 'XLSX';
  sourceName?: string;
  parches?: ReadonlyArray<{ propietarioDestinoId?: string } | null>;
  catalogos?: CatalogosMigracion;
  sourceType?: 'ERP_EXPORT' | 'EXTERNAL';
  schemaVersionSource?: string;
}): ImportRun {
  const crudos = entrada.registrosCrudos;
  return ejecutarImportDryRun({
    registrosCrudos: crudos,
    localizaciones: entrada.localizaciones ?? crudos.map((_, i) => `registros[${i}]`),
    entityType: entrada.entityType ?? 'AUTO',
    formato: entrada.formato ?? 'XLSX',
    sourceName: entrada.sourceName ?? 'sintetico.xlsx',
    // Hash real (64 hex): la barrera O7 exige un SHA-256 canónico válido.
    sourceHash: sha256Hex(new TextEncoder().encode(JSON.stringify(crudos))),
    sourceTamanoBytes: 1024,
    sourceType: entrada.sourceType ?? 'EXTERNAL',
    schemaVersionSource: entrada.schemaVersionSource,
    catalogos: entrada.catalogos ?? catalogos(),
    fechaHora: '2026-10-12T00:00:00.000Z',
    actor: 'u_sintetico',
    parches: entrada.parches,
  });
}

// ---------------------------------------------------------------------------
// 1) JSON exportado por la propia aplicación
// ---------------------------------------------------------------------------

describe('1) JSON exportado por la propia aplicación: lectura y reconocimiento', () => {
  const inmuebles = [
    { id: 'inm_1', direccion: 'Calle Sintética Uno 1', ciudad: 'Alicante', referenciaCatastral: 'CAT-001', propietarioId: PROP_ACTOR, propietarioPrincipalId: PROP_ACTOR, estado: 'alquilado', tipoInmueble: 'piso', precio: 700, rentaMensual: 700, superficie: 80, habitaciones: 3, codigoPostal: '03001' },
    { id: 'inm_2', direccion: 'Calle Sintética Dos 2', ciudad: 'Alicante', referenciaCatastral: 'CAT-002', propietarioId: PROP_ACTOR, propietarioPrincipalId: PROP_ACTOR, estado: 'disponible', tipoInmueble: 'piso', precio: 600, rentaMensual: 600, superficie: 70, habitaciones: 2, codigoPostal: '03002' },
    { id: 'inm_3', direccion: 'Calle Sintética Tres 3', ciudad: 'Elche', referenciaCatastral: 'CAT-003', propietarioId: PROP_ACTOR, propietarioPrincipalId: PROP_ACTOR, estado: 'disponible', tipoInmueble: 'casa', precio: 500, rentaMensual: 500, superficie: 90, habitaciones: 4, codigoPostal: '03201' },
  ];

  const exportacion = ejecutarExportacion({
    solicitado: { entidad: 'INMUEBLE', propietarioIds: [], formato: 'JSON' },
    autorizado: { propietarioIdsLegibles: [PROP_ACTOR], propietarioIdsEscribibles: [PROP_ACTOR], esMaster: false },
    catalogoInmuebles: inmuebles,
    registros: inmuebles,
    exportedAt: '2026-10-12T00:00:00.000Z',
    exportedBy: 'u_sintetico',
  });
  const bytes = new TextEncoder().encode(exportacion.contenido);
  const raiz = JSON.parse(new TextDecoder().decode(bytes));

  it('el sobre de exportación propia se reconoce (marca, entidad y records)', () => {
    const marca = extraerMarcaExportPropio(raiz);
    expect(marca).not.toBeNull();
    expect(marca?.entityType).toBe('INMUEBLE');
    expect(marca?.schemaVersion).toBe('erp-import-export-v1');
    const estructura = analizarEstructuraJson(raiz);
    expect(estructura.tipo).toBe('sobre_propio');
    expect(estructura.rutaRegistros).toEqual(['records']);
    expect(estructura.registros).toBe(3);
  });

  it('el formato se detecta por firma aunque el nombre no tenga extensión (Android)', () => {
    expect(detectarFormatoEntrada('documento', bytes)).toBe('JSON');
    expect(detectarFormatoEntrada('export.JSON', bytes)).toBe('JSON');
    const libro = libroPlantilla([filaSintetica(1)]);
    expect(detectarFormatoEntrada('1719-2', libro)).toBe('XLSX');
    expect(esZip(libro)).toBe(true);
    expect(esOle2(libro)).toBe(false);
  });

  it('el JSON exportado se reimporta: 3 registros reconocidos, con su id de origen', () => {
    const parseo = parseJson(bytes, { rutaAnidada: ['records'] });
    expect(parseo.errores).toEqual([]);
    expect(parseo.registros).toHaveLength(3);
    const run = correr({
      registrosCrudos: parseo.registros as Record<string, unknown>[],
      localizaciones: parseo.localizaciones,
      entityType: 'INMUEBLE',
      formato: 'JSON',
      sourceName: 'export_inmueble_exp_x.json',
      sourceType: 'ERP_EXPORT',
      schemaVersionSource: 'erp-import-export-v1',
    });
    expect(run.entityType).toBe('INMUEBLE');
    expect(run.totalRecords).toBe(3);
    expect(run.noMigrables).toBe(0);
    expect(run.registros.map((r) => r.sourceRecordId).sort()).toEqual(['inm_1', 'inm_2', 'inm_3']);
    // Ninguna columna del export propio queda como desconocida.
    expect(run.camposDesconocidos).toEqual([]);
    for (const r of run.registros) {
      expect(r.canonicalData['direccion']).toBeTruthy();
      expect(r.propietarioDestinoId).toBe(PROP_ACTOR);
    }
  });

  it('un JSON sin sobre de exportación también se reconoce por sus campos (AUTO)', () => {
    // Diferencia irrelevante de formato: mismo contenido, sin la marca
    // `__erpExport`. Antes caía íntegro en DESCONOCIDA → NO_MIGRABLE.
    const suelto = JSON.stringify([
      { id: 'inm_1', direccion: 'Calle Sintética Uno 1', ciudad: 'Alicante', referenciaCatastral: 'CAT-001', propietarioId: PROP_ACTOR },
      { id: 'inm_2', direccion: 'Calle Sintética Dos 2', ciudad: 'Alicante', referenciaCatastral: 'CAT-002', propietarioId: PROP_ACTOR },
    ]);
    const parseo = parseJson(new TextEncoder().encode(suelto));
    expect(parseo.errores).toEqual([]);
    const run = correr({
      registrosCrudos: parseo.registros as Record<string, unknown>[],
      localizaciones: parseo.localizaciones,
      entityType: 'AUTO',
      formato: 'JSON',
      sourceName: 'inmuebles_sin_sobre.json',
    });
    expect(run.registros.every((r) => r.entityType === 'INMUEBLE')).toBe(true);
    expect(run.noMigrables).toBe(0);
    expect(run.registros.map((r) => r.sourceRecordId).sort()).toEqual(['inm_1', 'inm_2']);
  });

  it('los inmuebles que ya existen se VINCULAN (AUTO) y no se reescriben', () => {
    const parseo = parseJson(bytes, { rutaAnidada: ['records'] });
    const run = correr({
      registrosCrudos: parseo.registros as Record<string, unknown>[],
      localizaciones: parseo.localizaciones,
      entityType: 'INMUEBLE',
      formato: 'JSON',
      sourceType: 'ERP_EXPORT',
      schemaVersionSource: 'erp-import-export-v1',
    });
    expect(run.registros.every((r) => r.operacion === 'VINCULAR')).toBe(true);
    expect(run.registros.every((r) => r.destinoColeccion === 'inmuebles')).toBe(true);
    expect(run.registros.filter((r) => r.decision === 'AUTO')).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 2) Excel de 7 filas: reconocimiento de «Dirección Completa»
// ---------------------------------------------------------------------------

describe('2) Excel de 7 filas: «Dirección Completa» se reconoce', () => {
  const libro = libroPlantilla([1, 2, 3, 4, 5, 6, 7].map(filaSintetica));
  const parseo = parseXlsx(libro);
  const run = correr({
    registrosCrudos: parseo.registros as Record<string, unknown>[],
    localizaciones: parseo.localizaciones,
    entityType: 'AUTO',
    parches: parseo.registros.map(() => ({ propietarioDestinoId: PROP_ACTOR })),
  });

  it('el libro se lee completo: 7 filas, 17 cabeceras, sin errores de parseo', () => {
    expect(parseo.errores).toEqual([]);
    expect(parseo.registros).toHaveLength(7);
    expect(Object.keys(parseo.registros[0] ?? {})).toHaveLength(17);
  });

  it('la entidad se detecta como INMUEBLE también con AUTO por cabeceras', () => {
    expect(run.registros.every((r) => r.entityType === 'INMUEBLE')).toBe(true);
    expect(run.noMigrables).toBe(0);
  });

  it('`direccion` ya NO falta: las 7 filas traen dirección (y CP + ciudad separados del texto)', () => {
    for (const r of run.registros) {
      expect(typeof r.canonicalData['direccion']).toBe('string');
      expect(String(r.canonicalData['direccion']).trim()).not.toBe('');
      expect(r.canonicalData['codigoPostal']).toBe('03001');
      expect(r.canonicalData['ciudad']).toBe('Alicante');
    }
    expect(run.incompleteRecords).toBe(0);
    expect(run.registros.some((r) => r.motivo.includes('direccion'))).toBe(false);
  });

  it('ninguna de las 17 cabeceras queda como campo desconocido', () => {
    expect(run.camposDesconocidos).toEqual([]);
  });

  it('la dirección sólo se separa cuando el CP y la ciudad son explícitos', () => {
    expect(separarDireccionCompleta('Calle Sintética 1, 03001 Alicante')).toEqual({
      direccion: 'Calle Sintética 1', codigoPostal: '03001', ciudad: 'Alicante',
    });
    // Sin patrón explícito: NO se inventa nada y la dirección se conserva íntegra.
    expect(separarDireccionCompleta('Calle Sintética 1')).toEqual({ direccion: 'Calle Sintética 1' });
    expect(separarDireccionCompleta('Avenida Sin Ciudad 12')).toEqual({ direccion: 'Avenida Sin Ciudad 12' });
  });
});

// ---------------------------------------------------------------------------
// 3) Las 17 cabeceras: mapeo correcto o incidencia explícita
// ---------------------------------------------------------------------------

describe('3) Las 17 cabeceras: cada una se mapea o se declara no importable', () => {
  const libro = libroPlantilla([filaSintetica(1), filaSintetica(2)]);
  const parseo = parseXlsx(libro);
  const run = correr({
    registrosCrudos: parseo.registros as Record<string, unknown>[],
    localizaciones: parseo.localizaciones,
    entityType: 'INMUEBLE',
    parches: parseo.registros.map(() => ({ propietarioDestinoId: PROP_ACTOR })),
  });
  const registro = run.registros[0]!;
  const canonico = registro.canonicalData;
  const sinDestino = new Map(run.camposSinDestino.map((c) => [c.campo, c.motivo]));

  it('cabeceras con destino compatible en el modelo', () => {
    expect(canonico['direccion']).toBe('Calle Sintética 1');
    expect(canonico['referenciaCatastral']).toBe('CAT-EXT-1');
    expect(canonico['valorAdquisicion']).toBe(121000);
    // RENTA DECLARADA: campo propio. NO se escribe `precio` (alimenta la ficha
    // pública) ni `rentaMensual` (renta vigente de explotación): la fila sólo
    // declara una renta.
    expect(canonico['rentaMensualDeclarada']).toBe(660);
    expect(canonico['precio']).toBeUndefined();
    expect(canonico['rentaMensual']).toBeUndefined();
    // FECHA DE REGISTRO ≠ fecha de adquisición.
    expect(canonico['fechaRegistroPatrimonial']).toBe('2019-05-01');
    expect(canonico['fechaAdquisicion']).toBeUndefined();
    // Datos declarados con campo propio (equivalen al Gestor Patrimonial).
    expect(canonico['porcentajeSueloCatastral']).toBe(20);
    expect(canonico['amortizacionAnualDeclarada']).toBe(3001);
    expect(canonico['gastosAnualesDeclarados']).toEqual({ comunidad: 45, ibi: 320, reparaciones: 0, seguro: 180 });
    // El inquilino declarado NO se escribe como inquilino actual: queda como
    // declaración pendiente (no se inventa un arrendamiento).
    expect(canonico['inquilinoActualNombre']).toBeUndefined();
  });

  it('«ID Inmueble» va a la identidad de origen (sourceRecordId), nunca a inmuebleId', () => {
    expect(registro.sourceRecordId).toBe('INM-EXT-1');
    expect(canonico['inmuebleId']).toBeUndefined();
    expect(run.registros.map((r) => r.sourceRecordId)).toEqual(['INM-EXT-1', 'INM-EXT-2']);
  });

  it('relaciones declaradas: conservadas con destino persistente (ya NO quedan sin destino)', () => {
    // Ninguna columna de la plantilla queda «reconocida y sin destino»: las
    // relaciones se conservan como declaradas y las demás tienen campo propio.
    for (const campo of ['Titularidad', '% Propietario 1', '% Propietario 2', 'Amortización Anual (€)', 'Gastos Comunidad (€)', 'Gastos IBI (€)', 'Gastos Reparaciones (€)', 'Gastos Seguro (€)', '% Suelo Catastral', 'DNI Inquilino', 'Fecha Registro', 'Renta Mensual (€)']) {
      expect(sinDestino.has(campo), `sigue declarada sin destino: ${campo}`).toBe(false);
    }
    const porClave = new Map(registro.declarados!.map((d) => [d.clave, d]));
    expect(porClave.get('titularidadDeclarada.texto')?.valorOriginal).toBe('Propietario único');
    expect(porClave.get('titularidadDeclarada.texto')?.estado).toBe('PENDIENTE_RESOLUCION');
    expect(porClave.get('titularidadDeclarada.propietario1')?.valorOriginal).toBe(100);
    expect(porClave.get('titularidadDeclarada.propietario1')?.estado).toBe('PENDIENTE_RESOLUCION');
    // Fila 2 (INM-EXT-2) sí declara inquilino y DNI; la fila 1 los deja vacíos.
    const fila2 = run.registros.find((r) => r.sourceRecordId === 'INM-EXT-2')!;
    const claves2 = new Map((fila2.declarados ?? []).map((d) => [d.clave, d]));
    expect(claves2.get('inquilinoDeclarado.nombre')?.valor).toBe('Inquilino Sintético');
    expect(claves2.get('inquilinoDeclarado.dni')?.valor).toBe('33333333C');
    // El valor original sigue en la evidencia del dry-run (nada se pierde).
    const original = run.dryRun.lineas.find((l) => l.proveniencia.sourceId === 'INM-EXT-1')?.datoOriginal;
    expect(original?.['% Propietario 1']).toBe(100);
    expect(original?.['Titularidad']).toBe('Propietario único');
  });

  it('las relaciones declaradas quedan PENDIENTES con el dato exacto que falta', () => {
    const pendientes = registro.relacionesPendientes ?? [];
    const texto = pendientes.map((x) => `${x.campoOrigen}: ${x.motivo}`).join(' | ').toLowerCase();
    expect(texto).toContain('titularidad');
    expect(texto).toContain('sin titular identificado');
    // El inquilino declarado (fila 2) también queda pendiente, sin crear contrato.
    const fila2 = run.registros.find((r) => r.sourceRecordId === 'INM-EXT-2')!;
    const pendientes2 = (fila2.relacionesPendientes ?? []).map((x) => `${x.campoOrigen}: ${x.motivo}`).join(' | ').toLowerCase();
    expect(pendientes2).toContain('inquilino');
    expect(fila2.vinculosInquilinoCandidatos ?? []).toEqual([]);
    // El dato que falta se dice explícitamente: el titular al que asignar el %.
    expect(texto).toContain('requiere resolución explícita');
    // Ninguna relación se resuelve sin asignación humana explícita.
    expect(registro.titularidadResuelta ?? []).toEqual([]);
    expect(registro.canonicalData['titularesIds']).toBeUndefined();
  });

  it('las 17 cabeceras están cubiertas: ninguna desconocida y ninguna silenciosa', () => {
    const cubiertas = new Set([
      ...run.registros.flatMap((r) => r.fieldMappings.map((m) => m.campoOrigen)),
      ...run.camposSinDestino.map((c) => c.campo),
      ...run.registros.flatMap((r) => (r.declarados ?? []).map((d) => d.campoOrigen)),
    ]);
    for (const cabecera of CABECERAS_17) {
      expect(cubiertas.has(cabecera), `cabecera sin tratar: ${cabecera}`).toBe(true);
    }
    expect(run.camposDesconocidos).toEqual([]);
  });

  it('variantes de escritura de la misma cabecera se reconocen igual', () => {
    const variantes = ['Dirección Completa', 'Dirección  Completa', 'dirección completa', 'DIRECCION COMPLETA', 'Direccion Completa'];
    for (const v of variantes) {
      const r = aplicarMapping('INMUEBLE', { [v]: 'Calle Variante 9, 03001 Alicante' });
      expect(r.desconocidos, `no reconocida: ${JSON.stringify(v)}`).toEqual([]);
      expect(r.canonico['direccion']).toBe('Calle Variante 9');
    }
    expect(claveCabecera('Precio Adquisición (€)')).toBe('precio adquisicion');
    expect(claveCabecera('% Propietario 1')).toBe('propietario 1');
  });
});

// ---------------------------------------------------------------------------
// 4) Porcentajes y cotitularidad: conservación exacta, sin inferencias
// ---------------------------------------------------------------------------

describe('4) Porcentajes y cotitularidad: sin inferencias ni repartos', () => {
  const libro = libroPlantilla([filaSintetica(2)]); // fila 2 = cotitularidad 60/40
  const parseo = parseXlsx(libro);
  const run = correr({
    registrosCrudos: parseo.registros as Record<string, unknown>[],
    entityType: 'INMUEBLE',
    parches: [{ propietarioDestinoId: PROP_ACTOR }],
  });
  const registro = run.registros[0]!;

  it('no se crea ninguna titularidad ni relación por los porcentajes declarados', () => {
    expect(Object.keys(registro.canonicalData).filter((c) => /titularidad|propietario.?\d|cotitular/i.test(c))).toEqual([]);
    expect(registro.canonicalData['titularesIds']).toBeUndefined();
    expect(registro.canonicalData['propietarioSecundarioId']).toBeUndefined();
    expect(registro.canonicalData['propietarioPrincipalId']).toBeUndefined();
    expect(registro.titularidadResuelta ?? []).toEqual([]);
  });

  it('el 60/40 original se conserva como declaración pendiente, sin reparto', () => {
    const original = run.dryRun.lineas[0]!.datoOriginal;
    expect(original['% Propietario 1']).toBe(60);
    expect(original['% Propietario 2']).toBe(40);
    expect(original['Titularidad']).toBe('Cotitularidad');
    const porClave = new Map(registro.declarados!.map((d) => [d.clave, d]));
    expect(porClave.get('titularidadDeclarada.propietario1')?.valor).toBe(60);
    expect(porClave.get('titularidadDeclarada.propietario2')?.valor).toBe(40);
    // Pendientes: sin asignación humana NO se completa el reparto (ni 40, ni
    // 50/50, ni 100 %).
    const motivos = (registro.relacionesPendientes ?? []).map((x) => x.motivo).join(' | ').toLowerCase();
    expect(motivos).toContain('sin titular identificado');
    expect(motivos).toContain('no se reparte');
  });

  it('una fila con un solo titular al 100 % tampoco genera reparto automático', () => {
    const libroUno = libroPlantilla([filaSintetica(1)]); // 100 % / vacío
    const p = parseXlsx(libroUno);
    const r = correr({
      registrosCrudos: p.registros as Record<string, unknown>[],
      entityType: 'INMUEBLE',
      parches: [{ propietarioDestinoId: PROP_ACTOR }],
    });
    expect(r.registros[0]!.canonicalData['titularesIds']).toBeUndefined();
    expect(r.dryRun.lineas[0]!.datoOriginal['% Propietario 1']).toBe(100);
    // La ranura 2 vacía no inventa un 0 % ni un 50 %: simplemente no consta.
    const claves = (r.registros[0]!.declarados ?? []).map((d) => d.clave);
    expect(claves).toContain('titularidadDeclarada.propietario1');
    expect(claves).not.toContain('titularidadDeclarada.propietario2');
    expect(r.registros[0]!.titularidadResuelta ?? []).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5) Perfil PROPIETARIO: destino correcto y respeto de permisos
// ---------------------------------------------------------------------------

describe('5) Perfil PROPIETARIO: destino declarado y permisos respetados', () => {
  const filas = [filaSintetica(1)];
  const libro = libroPlantilla(filas);
  const parseo = parseXlsx(libro);
  const crudos = parseo.registros as Record<string, unknown>[];

  it('con destino declarado y permitido, el titular se resuelve', () => {
    const run = correr({ registrosCrudos: crudos, entityType: 'INMUEBLE', parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    expect(run.registros[0]!.propietarioDestinoId).toBe(PROP_ACTOR);
    expect(run.registros[0]!.canonicalData['propietarioId']).toBe(PROP_ACTOR);
    expect(run.registros[0]!.warnings.some((w) => w.includes('destino declarado por selección explícita'))).toBe(true);
  });

  it('SIN destino declarado no se asigna nada (ni el titular principal por defecto)', () => {
    const run = correr({ registrosCrudos: crudos, entityType: 'INMUEBLE' });
    expect(run.registros[0]!.propietarioDestinoId).toBeNull();
    expect(run.registros[0]!.decision).toBe('INCOMPLETO');
    expect(`${run.registros[0]!.motivo} ${run.registros[0]!.evidencias.join(' ')}`).toContain('sin propietario determinable');
    expect(run.registros[0]!.canonicalData['propietarioId']).toBeUndefined();
  });

  it('un destino NO permitido por el ámbito se bloquea con motivo (sin admin)', () => {
    const run = correr({ registrosCrudos: crudos, entityType: 'INMUEBLE', parches: [{ propietarioDestinoId: PROP_SEGUNDO }] });
    expect(run.registros[0]!.decision).toBe('BLOQUEADO');
    expect(run.registros[0]!.motivo).toContain('NO_PERMITIDO');
  });

  it('un destino inexistente en catálogo no se inventa', () => {
    const run = correr({ registrosCrudos: crudos, entityType: 'INMUEBLE', parches: [{ propietarioDestinoId: 'prop_INVENTADO' }] });
    expect(run.registros[0]!.propietarioDestinoId).toBeNull();
    expect(`${run.registros[0]!.motivo} ${run.registros[0]!.evidencias.join(' ')}`).toContain('no encontrado en catálogo');
  });

  it('la columna «ID Propietario» manda sobre la selección global (por fila)', () => {
    const libro2 = libroConCabeceras(
      ['ID Inmueble', 'Dirección Completa', 'ID Propietario'],
      [{ 'ID Inmueble': 'INM-EXT-9', 'Dirección Completa': 'Calle Con Columna 9, 03001 Alicante', 'ID Propietario': PROP_SEGUNDO }],
    );
    const p = parseXlsx(libro2);
    const run = correr({
      registrosCrudos: p.registros as Record<string, unknown>[],
      entityType: 'INMUEBLE',
      parches: [{ propietarioDestinoId: PROP_ACTOR }],
    });
    // Manda la columna (aunque no esté permitida): se bloquea y se dice por qué.
    expect(run.registros[0]!.canonicalData['propietarioId']).toBe(PROP_SEGUNDO);
    expect(run.registros[0]!.decision).toBe('BLOQUEADO');
    expect(run.registros[0]!.motivo).toContain('NO_PERMITIDO');
  });

  it('una columna «ID Propietario» válida resuelve el destino por fila', () => {
    const libro3 = libroConCabeceras(
      ['ID Inmueble', 'Dirección Completa', 'ID Propietario'],
      [{ 'ID Inmueble': 'INM-EXT-8', 'Dirección Completa': 'Calle Con Columna 8, 03001 Alicante', 'ID Propietario': PROP_ACTOR }],
    );
    const p = parseXlsx(libro3);
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], entityType: 'INMUEBLE' });
    expect(run.registros[0]!.propietarioDestinoId).toBe(PROP_ACTOR);
  });

  it('el dry-run no escribe: 0 escrituras y solo-lectura', () => {
    const run = correr({ registrosCrudos: crudos, entityType: 'INMUEBLE', parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    expect(run.dryRun.soloLectura).toBe(true);
    expect(run.status).toBe('DRY_RUN_COMPLETADO');
    expect(run.informe).toContain('escritura realizada: 0');
  });
});

// ---------------------------------------------------------------------------
// 6) Archivo incompatible: error claro, sin importación vacía silenciosa
// ---------------------------------------------------------------------------

describe('6) Archivo incompatible: motivo concreto y sin importación vacía', () => {
  it('JSON válido sin lista de registros: se describe la estructura hallada', () => {
    const raiz = { configuracion: { idioma: 'es' }, version: 2 };
    const e = analizarEstructuraJson(raiz);
    expect(e.tipo).toBe('objeto');
    expect(e.registros).toBeNull();
    expect(motivoJsonSinRegistros(raiz)).toContain('no se encuentra la lista de registros');
  });

  it('JSON con «records» vacío: lo dice y no crea una importación vacía', () => {
    const raiz = { __erpExport: { schemaVersion: 'erp-import-export-v1', entityType: 'INMUEBLE' }, records: [] };
    expect(motivoJsonSinRegistros(raiz)).toContain('está vacía (0 registros)');
    const parseo = parseJson(new TextEncoder().encode(JSON.stringify(raiz)), { rutaAnidada: ['records'] });
    expect(parseo.registros).toHaveLength(0);
    const run = correr({ registrosCrudos: [], formato: 'JSON', entityType: 'INMUEBLE' });
    expect(run.totalRecords).toBe(0);
    expect(run.registros).toHaveLength(0);
    expect(run.importedRecords).toBe(0); // nada promocionable
  });

  it('array de escalares: cada elemento se aísla con error y no se cuela ninguno', () => {
    const parseo = parseJson(new TextEncoder().encode('[1, 2, 3]'));
    expect(parseo.registros).toHaveLength(0);
    expect(parseo.errores.length).toBe(3);
    expect(parseo.errores[0]).toContain('no es un objeto');
  });

  it('JSON inválido: error de parseo explícito', () => {
    const parseo = parseJson(new TextEncoder().encode('{ esto no es json'));
    expect(parseo.registros).toHaveLength(0);
    expect(parseo.errores[0]).toContain('JSON inválido');
  });

  it('un archivo sin formato reconocible no se clasifica por defecto', () => {
    const basura = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(detectarFormatoEntrada('datos.bin', basura)).toBeNull();
    expect(detectarFormatoEntrada('', new Uint8Array(0))).toBeNull();
  });

  it('un CSV con nombre de Excel se detecta por contenido, no por extensión', () => {
    const csv = new TextEncoder().encode('a,b\n1,2\n');
    expect(detectarFormatoEntrada('listado.xlsx', csv)).toBe('CSV');
  });
});

// ---------------------------------------------------------------------------
// 7) Duplicados: detección sin sobrescritura automática
// ---------------------------------------------------------------------------

describe('7) Duplicados: detección sin sobrescritura', () => {
  it('el mismo «ID Inmueble» repetido en el lote se marca y se bloquea', () => {
    const libro = libroPlantilla([filaSintetica(1), filaSintetica(1)]);
    const p = parseXlsx(libro);
    const run = correr({
      registrosCrudos: p.registros as Record<string, unknown>[],
      entityType: 'INMUEBLE',
      parches: [{ propietarioDestinoId: PROP_ACTOR }, { propietarioDestinoId: PROP_ACTOR }],
    });
    expect(run.registros).toHaveLength(2);
    const bloqueados = run.registros.filter((r) => r.decision === 'BLOQUEADO');
    expect(bloqueados).toHaveLength(1);
    expect(bloqueados[0]!.motivo).toContain('duplicado en el lote');
  });

  it('un inmueble que ya existe (referencia catastral) se VINCULA y no se sobrescribe', () => {
    const libro = libroConCabeceras(
      ['ID Inmueble', 'Dirección Completa', 'Referencia Catastral'],
      [{ 'ID Inmueble': 'INM-EXT-1', 'Dirección Completa': 'Calle Sintética Uno 1, 03001 Alicante', 'Referencia Catastral': 'CAT-001' }],
    );
    const p = parseXlsx(libro);
    const run = correr({
      registrosCrudos: p.registros as Record<string, unknown>[],
      entityType: 'INMUEBLE',
      parches: [{ propietarioDestinoId: PROP_ACTOR }],
    });
    const r = run.registros[0]!;
    expect(r.inmuebleDestinoId).toBe('inm_1');
    expect(r.operacion).toBe('VINCULAR');
    expect(r.destinationId).toBe('inm_1');
    expect(r.sourceRecordId).toBe('INM-EXT-1'); // identidad de origen conservada
  });

  it('la promoción excluye los VINCULAR: no se reescribe el destino existente', () => {
    // Vía determinista (id canónico del propio export): AUTO + VINCULAR.
    const inmuebles = [
      { id: 'inm_1', direccion: 'Calle Sintética Uno 1', ciudad: 'Alicante', referenciaCatastral: 'CAT-001', propietarioId: PROP_ACTOR, propietarioPrincipalId: PROP_ACTOR, estado: 'alquilado', tipoInmueble: 'piso', precio: 700, rentaMensual: 700, superficie: 80, habitaciones: 3, codigoPostal: '03001' },
    ];
    const exp = ejecutarExportacion({
      solicitado: { entidad: 'INMUEBLE', propietarioIds: [], formato: 'JSON' },
      autorizado: { propietarioIdsLegibles: [PROP_ACTOR], propietarioIdsEscribibles: [PROP_ACTOR], esMaster: false },
      catalogoInmuebles: inmuebles,
      registros: inmuebles,
      exportedAt: '2026-10-12T00:00:00.000Z',
      exportedBy: 'u_sintetico',
    });
    const bytesExport = new TextEncoder().encode(exp.contenido);
    const p = parseJson(bytesExport, { rutaAnidada: ['records'] });
    const run = correr({
      registrosCrudos: p.registros as Record<string, unknown>[],
      localizaciones: p.localizaciones,
      entityType: 'INMUEBLE',
      formato: 'JSON',
      sourceType: 'ERP_EXPORT',
      schemaVersionSource: 'erp-import-export-v1',
      sourceName: 'export_inmueble_exp_x.json',
    });
    expect(run.registros[0]!.decision).toBe('AUTO');
    expect(run.registros[0]!.operacion).toBe('VINCULAR');
    const autorizacion = autorizarImportRun({
      run, tamanoBytes: 2048, commitDryRun: 'ui',
      autorizador: 'u_sintetico', fechaHora: '2026-10-12T00:00:00.000Z',
    });
    expect(autorizacion.decision).toBe('CONCEDIDA');
    const token = derivarTokenEjecucion(run.sourceHash);
    const plan = planificarPromocion({
      autorizacion, run, canonicalBatchSha256: run.sourceHash, explicitExecutionToken: token,
      ambito: { propietarioIdsLegibles: [PROP_ACTOR], propietarioIdsEscribibles: [PROP_ACTOR], esMaster: false },
    });
    expect(plan.operaciones).toHaveLength(0); // ninguna escritura
    expect(plan.vinculadasSinEscritura).toHaveLength(1);
    expect(plan.vinculadasSinEscritura[0]!.motivo).toContain('sin escritura');
  });
});

// ---------------------------------------------------------------------------
// 8) Exportación → importación → exportación
// ---------------------------------------------------------------------------

describe('8) Exportación → importación → exportación: campos compatibles', () => {
  const inmuebles = [
    { id: 'inm_1', direccion: 'Calle Sintética Uno 1', ciudad: 'Alicante', referenciaCatastral: 'CAT-001', propietarioId: PROP_ACTOR, propietarioPrincipalId: PROP_ACTOR, estado: 'alquilado', tipoInmueble: 'piso', precio: 700, rentaMensual: 700, superficie: 80, habitaciones: 3, codigoPostal: '03001' },
    { id: 'inm_2', direccion: 'Calle Sintética Dos 2', ciudad: 'Elche', referenciaCatastral: 'CAT-002', propietarioId: PROP_ACTOR, propietarioPrincipalId: PROP_ACTOR, estado: 'disponible', tipoInmueble: 'casa', precio: 600, rentaMensual: 600, superficie: 70, habitaciones: 2, codigoPostal: '03201' },
  ];
  const CAMPOS_COMPATIBLES = [
    'direccion', 'ciudad', 'referenciaCatastral', 'propietarioId', 'propietarioPrincipalId',
    'estado', 'tipoInmueble', 'precio', 'rentaMensual', 'superficie', 'habitaciones', 'codigoPostal',
  ] as const;

  it('el viaje completo conserva los campos compatibles (sin inventar los ausentes)', () => {
    const exp1 = ejecutarExportacion({
      solicitado: { entidad: 'INMUEBLE', propietarioIds: [], formato: 'JSON' },
      autorizado: { propietarioIdsLegibles: [PROP_ACTOR], propietarioIdsEscribibles: [PROP_ACTOR], esMaster: false },
      catalogoInmuebles: inmuebles,
      registros: inmuebles,
      exportedAt: '2026-10-12T00:00:00.000Z',
      exportedBy: 'u_sintetico',
    });
    const bytes = new TextEncoder().encode(exp1.contenido);
    const parseo = parseJson(bytes, { rutaAnidada: ['records'] });
    const run = correr({
      registrosCrudos: parseo.registros as Record<string, unknown>[],
      localizaciones: parseo.localizaciones,
      entityType: 'INMUEBLE',
      formato: 'JSON',
      sourceType: 'ERP_EXPORT',
      schemaVersionSource: 'erp-import-export-v1',
    });

    const porId = new Map(run.registros.map((r) => [r.sourceRecordId, r.canonicalData]));
    expect(porId.size).toBe(2);
    for (const original of inmuebles) {
      const importado = porId.get(original.id)!;
      for (const campo of CAMPOS_COMPATIBLES) {
        expect(importado[campo], `${original.id}.${campo}`).toEqual((original as unknown as Record<string, unknown>)[campo]);
      }
    }

    // Reexportar desde lo importado reproduce el mismo contenido compatible.
    const reconstruidos = run.registros
      .map((r) => ({ id: r.sourceRecordId, ...r.canonicalData }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const exp2 = ejecutarExportacion({
      solicitado: { entidad: 'INMUEBLE', propietarioIds: [], formato: 'JSON' },
      autorizado: { propietarioIdsLegibles: [PROP_ACTOR], propietarioIdsEscribibles: [PROP_ACTOR], esMaster: false },
      catalogoInmuebles: reconstruidos as never,
      registros: reconstruidos as never,
      exportedAt: '2026-10-12T00:00:00.000Z',
      exportedBy: 'u_sintetico',
    });
    const raiz1 = JSON.parse(exp1.contenido) as { records: Record<string, unknown>[] };
    const raiz2 = JSON.parse(exp2.contenido) as { records: Record<string, unknown>[] };
    const limpiar = (r: Record<string, unknown>): Record<string, unknown> => {
      const copia: Record<string, unknown> = {};
      for (const c of CAMPOS_COMPATIBLES) copia[c] = r[c];
      copia['id'] = r['id'];
      return copia;
    };
    expect(raiz2.records.map(limpiar)).toEqual(raiz1.records.map(limpiar));
    expect(sha256Hex(new TextEncoder().encode(JSON.stringify(raiz2.records.map(limpiar)))))
      .toBe(sha256Hex(new TextEncoder().encode(JSON.stringify(raiz1.records.map(limpiar)))));
  });
});
