/**
 * IMPORTACIÓN REAL — reutilización del sistema que YA funciona (Gestor Patrimonial).
 *
 * DATOS SINTÉTICOS: inmuebles, titulares, direcciones, referencias catastrales y
 * DNIs de este fichero son inventados (`INM-REAL-*`, `CAT-REAL-*`, `1111111XA`).
 * No son datos reales, no se ha importado nada en ningún entorno y ninguna
 * prueba escribe en Firestore/Storage: el núcleo es puro y la promoción usa un
 * puerto fake en memoria.
 *
 * Casos exigidos:
 *  1. Importar el JSON EXPORTADO por el Gestor Patrimonial de referencia
 *     (`address`/`owner`/`monthlyRent`/`landValuePercent`/`amortizationAmount`/
 *     `expenses*`/`registrationDate`/`tenant*`).
 *  2. Ida y vuelta: exportar con el exportador del ERP e importar ese mismo
 *     archivo (el inmueble existente se VINCULA: nunca se duplica ni se pisa) y
 *     los datos declarados se recuperan.
 *  3. Excel real de 7 inmuebles × 17 columnas: las 7 filas se importan y CADA
 *     campo declarado se persiste y se puede RELEER del almacén.
 *  4. Agregados anuales: se conservan como agregados y NO generan movimientos
 *     de gasto (no se duplica ni se re-suma el detalle).
 *  5. Reimportación: sin duplicados ni sobrescrituras (inmuebles y titularidades).
 *  6. Filas inválidas: se rechazan con motivo y el original sigue en evidencia.
 *  7. Titularidad: existente, ausente y ambigua — nunca inventada.
 *  8. DNI del inquilino: sólo se OFRECE un vínculo inequívoco; jamás se crea
 *     contrato ni arrendamiento.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/lib/importacion/hash';
import { COLUMNAS_CSV, generarXlsx, type ColumnaXlsx } from '../src/lib/importExport';
import { parseJson } from '../src/lib/importExport/jsonParser';
import { parseXlsx } from '../src/lib/importExport/xlsx';
import { ejecutarImportDryRun } from '../src/lib/importExport/pipeline';
import {
  ACEPTAR_IMPORTACION, analizarEstructuraJson, detectarFormatoEntrada, motivoJsonSinRegistros,
  validarNombreFicheroImportacion,
} from '../src/lib/importExport/formato';
import { ejecutarExportacion } from '../src/lib/importExport/exportador';
import { ejecutarPromocion, planificarPromocion, type DecisionPromocion } from '../src/lib/importExport/ejecucion';
import { autorizarImportRun, derivarTokenEjecucion } from '../src/lib/importExport/promocion';
import type { EventoAuditoriaImport, InmueblePatrimonialNuevo, PuertoPersistenciaImport } from '../src/lib/importExport/ejecucion';
import type { AmbitoAutorizado, ImportRun } from '../src/lib/importExport/contrato';
import type { CatalogosMigracion } from '../src/lib/migracion/tipos';

const PROP_ACTOR = 'prop_A';
const PROP_OTRO = 'prop_B';

/** Ámbito del actor: puede escribir las carteras de ambos titulares. */
const AMBITO: AmbitoAutorizado = {
  propietarioIdsLegibles: [PROP_ACTOR, PROP_OTRO],
  propietarioIdsEscribibles: [PROP_ACTOR, PROP_OTRO],
  esMaster: false,
};

const CABECERAS_17 = [
  'ID Inmueble', 'Dirección Completa', 'Referencia Catastral', 'Titularidad',
  '% Propietario 1', '% Propietario 2', 'Precio Adquisición (€)', 'Amortización Anual (€)',
  'Renta Mensual (€)', 'Gastos Comunidad (€)', 'Gastos IBI (€)', 'Gastos Reparaciones (€)',
  'Gastos Seguro (€)', '% Suelo Catastral', 'Inquilino', 'DNI Inquilino', 'Fecha Registro',
];
const NUMERICAS = new Set([
  '% Propietario 1', '% Propietario 2', 'Precio Adquisición (€)', 'Amortización Anual (€)',
  'Renta Mensual (€)', 'Gastos Comunidad (€)', 'Gastos IBI (€)', 'Gastos Reparaciones (€)',
  'Gastos Seguro (€)', '% Suelo Catastral',
]);

/** Las SIETE filas reales: 7 inmuebles × 17 columnas. */
function filasReales(): Array<Record<string, unknown>> {
  return Array.from({ length: 7 }, (_, i) => ({
    'ID Inmueble': `INM-REAL-${i + 1}`,
    'Dirección Completa': `Calle Patrimonial ${i + 1}, 0300${i + 1} Alicante`,
    'Referencia Catastral': `CAT-REAL-${i + 1}`,
    'Titularidad': i % 2 === 0 ? 'Propietario único' : 'Cotitularidad',
    '% Propietario 1': i % 2 === 0 ? 100 : 60,
    '% Propietario 2': i % 2 === 0 ? '' : 40,
    'Precio Adquisición (€)': 100000 + i * 10000,
    'Amortización Anual (€)': 2500 + i,
    'Renta Mensual (€)': 700 + i * 25,
    'Gastos Comunidad (€)': 480 + i,
    'Gastos IBI (€)': 300 + i,
    'Gastos Reparaciones (€)': 150 + i,
    'Gastos Seguro (€)': 200 + i,
    '% Suelo Catastral': 25 + i,
    'Inquilino': `Inquilino Real ${i + 1}`,
    'DNI Inquilino': `1111111${i}A`,
    'Fecha Registro': `2021-0${(i % 9) + 1}-1${i % 10}`,
  }));
}

function libroReal(filas: Record<string, unknown>[] = filasReales()): Uint8Array {
  const columnas: ColumnaXlsx[] = CABECERAS_17.map((nombre) => ({ nombre, tipo: NUMERICAS.has(nombre) ? 'numero' : 'texto' }));
  return generarXlsx([{ nombre: 'Inmuebles', columnas, filas }]);
}

/** Inmueble tal como lo exporta el Gestor Patrimonial de referencia. */
const FILA_GESTOR_PATRIMONIAL = {
  id: 'gp_prop_1',
  address: 'Calle Referencia 7, Madrid',
  cadastralReference: '9876543210987654321',
  owner: 'both',
  ownershipPercentageUser1: 60,
  ownershipPercentageUser2: 40,
  tenantName: 'Ana Referencia',
  tenantDni: '12345678A',
  monthlyRent: 950,
  purchasePrice: 180000,
  currentValue: 210000,
  mortgageDebt: 90000,
  mortgageInterestRate: 2.5,
  mortgageStartDate: '2021-01-15',
  landValuePercent: 25,
  amortizationAmount: 3600,
  expensesCommunity: 600,
  expensesIBI: 450,
  expensesInsurance: 180,
  expensesRepairs: 200,
  registrationDate: '2021-02-01',
  contract: { startDate: '2021-02-01', monthlyRent: 950 },
  tenantHistory: [{ id: 'tc_1', tenantName: 'Ana Referencia', startDate: '2021-02-01', monthlyRent: 950 }],
  yearlyFinancials: { 2025: { currentValue: 205000 } },
};

/**
 * Lee un JSON por el MISMO camino que la UI real: se reconoce la estructura
 * (`analizarEstructuraJson`) y se importa la lista real con su ruta anidada. Sin
 * este paso, un sobre de exportación (`{__erpExport, records: […]}`) se leería
 * como UN solo registro — que es exactamente el defecto corregido en el panel.
 */
function leerJsonComoLaUi(bytes: Uint8Array) {
  const raiz: unknown = JSON.parse(new TextDecoder().decode(bytes));
  const estructura = analizarEstructuraJson(raiz);
  const parseo = parseJson(
    bytes,
    estructura.rutaRegistros && estructura.rutaRegistros.length > 0
      ? { rutaAnidada: estructura.rutaRegistros }
      : {},
  );
  return { estructura, parseo };
}

function catalogos(extra?: Partial<CatalogosMigracion>): CatalogosMigracion {
  return {
    propietarios: [
      { id: PROP_ACTOR, nombre: 'Titular actor', nifCif: '11111111A', estadoAcceso: 'ACTIVO' },
      { id: PROP_OTRO, nombre: 'Titular cotitular', nifCif: '22222222B', estadoAcceso: 'ACTIVO' },
    ],
    inmuebles: [],
    contratos: [],
    mapeos: [],
    existentes: [],
    propietariosPermitidosIds: [PROP_ACTOR, PROP_OTRO],
    importador: { uid: 'u_sintetico', modalidad: 'PROPIETARIO' },
    ...extra,
  };
}

type Parche = {
  propietarioDestinoId?: string;
  resolucionTitularidad?: ReadonlyArray<{ ranura: 1 | 2; propietarioId: string }>;
};

function correr(entrada: {
  registrosCrudos: Record<string, unknown>[];
  entityType?: string;
  formato?: 'JSON' | 'CSV' | 'XLSX';
  parches?: ReadonlyArray<Parche | null>;
  catalogos?: CatalogosMigracion;
  contratosParaVinculoInquilino?: ReadonlyArray<{ id: string; inmuebleId: string; candidatoDni?: string; candidatoNombre?: string }>;
  sourceName?: string;
}): ImportRun {
  const crudos = entrada.registrosCrudos;
  return ejecutarImportDryRun({
    registrosCrudos: crudos,
    localizaciones: crudos.map((_, i) => `fila ${i + 2}`),
    entityType: entrada.entityType ?? 'INMUEBLE',
    formato: entrada.formato ?? 'XLSX',
    sourceName: entrada.sourceName ?? 'inmuebles_reales.xlsx',
    sourceHash: sha256Hex(new TextEncoder().encode(JSON.stringify(crudos))),
    sourceTamanoBytes: 4096,
    sourceType: 'EXTERNAL',
    catalogos: entrada.catalogos ?? catalogos(),
    fechaHora: '2026-10-12T00:00:00.000Z',
    actor: 'u_sintetico',
    parches: entrada.parches,
    ...(entrada.contratosParaVinculoInquilino ? { contratosParaVinculoInquilino: entrada.contratosParaVinculoInquilino } : {}),
  });
}

/** Almacén en memoria que imita el puerto real (con relectura). */
function almacen(existentes: string[] = []) {
  const inmuebles = new Map<string, InmueblePatrimonialNuevo>();
  const titularidades = new Map<string, { inmuebleId: string; propietarioId: string; porcentajeTitularidad: number | null; estado: string }>();
  const gastos = new Map<string, unknown>();
  const cobros = new Set<string>();
  const auditoria: EventoAuditoriaImport[] = [];
  for (const id of existentes) inmuebles.set(id, { id, direccion: '(pre-existente)', propietarioId: PROP_ACTOR });
  const puerto: PuertoPersistenciaImport = {
    async existeDestino(coleccion, destinoId) {
      if (coleccion === 'inmuebles') return inmuebles.has(destinoId);
      if (coleccion === 'gastos') return gastos.has(destinoId);
      throw new Error(`colección no esperada: '${coleccion}'`);
    },
    async existeCobro(contratoId, cobroId) { return cobros.has(`${contratoId}/${cobroId}`); },
    async crearGasto(g) { gastos.set((g as { id: string }).id, g); },
    async crearInmueble(inm) {
      if (inmuebles.has(inm.id)) throw new Error('sobrescritura prohibida');
      inmuebles.set(inm.id, inm);
    },
    async anexarCobro(contratoId, cobro) { cobros.add(`${contratoId}/${(cobro as { id: string }).id}`); },
    async existeTitularidad(inmuebleId, propietarioId) { return titularidades.has(`${inmuebleId}__${propietarioId}`); },
    async crearTitularidad(x) {
      if (!inmuebles.has(x.inmuebleId)) throw new Error('titularidad sin inmueble');
      titularidades.set(`${x.inmuebleId}__${x.propietarioId}`, {
        inmuebleId: x.inmuebleId, propietarioId: x.propietarioId,
        porcentajeTitularidad: x.porcentajeTitularidad, estado: 'VIGENTE',
      });
    },
    async auditar(e) { auditoria.push(e); },
  };
  return { puerto, inmuebles, titularidades, gastos, auditoria };
}

function autorizarYPlanificar(
  run: ImportRun,
  decisiones: Readonly<Record<string, DecisionPromocion>> = {},
  seleccion?: readonly string[],
) {
  const autorizacion = autorizarImportRun({
    run, tamanoBytes: 4096, commitDryRun: 'ui', autorizador: 'u_sintetico', fechaHora: '2026-10-12T00:00:00.000Z',
  });
  const plan = planificarPromocion({
    autorizacion, run,
    canonicalBatchSha256: run.sourceHash,
    explicitExecutionToken: derivarTokenEjecucion(run.sourceHash),
    decisiones,
    ambito: AMBITO,
    ...(seleccion ? { seleccionFingerprints: seleccion } : {}),
  });
  return { autorizacion, plan };
}

async function promover(run: ImportRun, store: ReturnType<typeof almacen>, fechaHora = '2026-10-12T00:00:00.000Z') {
  const { plan } = autorizarYPlanificar(run);
  const res = await ejecutarPromocion({ plan, run, decisiones: {}, puerto: store.puerto, actor: 'u_sintetico', fechaHora });
  return { plan, res };
}

// ---------------------------------------------------------------------------

describe('selección del archivo: MIME del navegador/Android', () => {
  it('el selector declara MIME genéricos (text/plain, octet-stream) además de .json', () => {
    for (const trozo of ['.json', 'application/json', 'text/json', 'text/plain', 'application/octet-stream', 'text/csv', '.xlsx', 'application/vnd.ms-excel']) {
      expect(ACEPTAR_IMPORTACION).toContain(trozo);
    }
  });

  it('un JSON con MIME vacío, text/plain o octet-stream se reconoce igual (nombre o firma)', () => {
    const bytes = new TextEncoder().encode(JSON.stringify([FILA_GESTOR_PATRIMONIAL]));
    for (const nombre of ['datos.json', 'datos', 'documento (1)']) {
      expect(detectarFormatoEntrada(nombre, bytes)).toBe('JSON');
    }
    const conBom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes]);
    expect(detectarFormatoEntrada('datos.json', conBom)).toBe('JSON');
    expect(validarNombreFicheroImportacion('datos.json')).toBeNull();
    // La firma manda: un .pdf que en realidad es JSON se procesa y se avisa.
    expect(validarNombreFicheroImportacion('datos.pdf', bytes)).toBeNull();
    expect(validarNombreFicheroImportacion('datos.pdf')).toMatch(/Formato no admitido/);
    expect(validarNombreFicheroImportacion('datos.xlsx', bytes)).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('1) JSON exportado por el Gestor Patrimonial de referencia', () => {
  const { estructura, parseo } = leerJsonComoLaUi(new TextEncoder().encode(JSON.stringify([FILA_GESTOR_PATRIMONIAL])));
  const run = correr({
    registrosCrudos: parseo.registros, entityType: 'AUTO', formato: 'JSON',
    sourceName: 'backup_gestor_patrimonial.json', parches: [{ propietarioDestinoId: PROP_ACTOR }],
  });
  const r = run.registros[0]!;
  const c = r.canonicalData;

  it('se reconoce como INMUEBLE (no «DESCONOCIDA») y es elegible', () => {
    expect(estructura.tipo).toBe('array');
    expect(estructura.registros).toBe(1);
    expect(parseo.errores).toEqual([]);
    expect(parseo.registros).toHaveLength(1);
    expect(r.entityType).toBe('INMUEBLE');
    expect(r.decision).toBe('AUTO');
    expect(r.operacion).toBe('CREAR');
    expect(run.importedRecords).toBe(1);
  });

  it('los datos patrimoniales se importan con su significado real', () => {
    expect(c['direccion']).toBe('Calle Referencia 7, Madrid');
    expect(c['referenciaCatastral']).toBe('9876543210987654321');
    expect(c['valorAdquisicion']).toBe(180000);      // purchasePrice
    expect(c['valoracionEstimada']).toBe(210000);    // currentValue
    expect(c['porcentajeSueloCatastral']).toBe(25);  // landValuePercent
    expect(c['amortizacionAnualDeclarada']).toBe(3600); // amortizationAmount
    expect(c['fechaRegistroPatrimonial']).toBe('2021-02-01'); // registrationDate = REGISTRO
    // Los agregados anuales se fusionan en UN objeto declarado.
    expect(c['gastosAnualesDeclarados']).toEqual({ comunidad: 600, ibi: 450, reparaciones: 200, seguro: 180 });
    // Y NUNCA se confunde la fecha de registro con la adquisición.
    expect(c['fechaAdquisicion']).toBeUndefined();
  });

  it('la renta de la fuente externa se conserva como DECLARADA (y mantiene su 1→N histórico)', () => {
    expect(c['rentaMensual']).toBe(950);
    expect(c['precio']).toBe(950);
    // `monthlyRent` del Gestor Patrimonial es la renta declarada del activo: se
    // conserva como tal para que el alta la persista. Los otros dos destinos son
    // de explotación/publicación y el alta patrimonial NO los escribe.
    expect(c['rentaMensualDeclarada']).toBe(950);
  });

  it('la titularidad declarada (owner=both, 60/40) se conserva pendiente y NO crea relación', () => {
    const porClave = new Map((r.declarados ?? []).map((d) => [d.clave, d]));
    expect(porClave.get('titularidadDeclarada.texto')?.valorOriginal).toBe('both');
    expect(porClave.get('titularidadDeclarada.texto')?.estado).toBe('PENDIENTE_RESOLUCION');
    expect(porClave.get('titularidadDeclarada.propietario1')?.valor).toBe(60);
    expect(porClave.get('titularidadDeclarada.propietario2')?.valor).toBe(40);
    expect(r.titularidadResuelta ?? []).toEqual([]);
    const pendientes = (r.relacionesPendientes ?? []).map((x) => x.motivo).join(' | ').toLowerCase();
    expect(pendientes).toContain('no se reparte');
    expect(pendientes).toContain('sin titular identificado');
  });

  it('el inquilino y su DNI quedan declarados, y lo no importable se declara con motivo', () => {
    const porClave = new Map((r.declarados ?? []).map((d) => [d.clave, d]));
    expect(porClave.get('inquilinoDeclarado.nombre')?.valor).toBe('Ana Referencia');
    expect(porClave.get('inquilinoDeclarado.dni')?.valor).toBe('12345678A');
    // Subcampos sin adaptador seguro en v1: declarados, nunca silenciosos.
    const sinDestino = r.camposSinDestino.map((x) => x.campo);
    expect(sinDestino).toContain('contract');
    expect(sinDestino.some((x) => x.startsWith('mortgage'))).toBe(true);
    expect(r.camposDesconocidos).toEqual([]);
    // `tenantName` de la fuente externa SÍ afirma el inquilino actual (alias
    // documentado): se mapea, y el alta patrimonial NO lo escribe: lo avisa con
    // su motivo y lo conserva como declarado. Nunca se crea un arrendamiento.
    expect(r.canonicalData['inquilinoActualNombre']).toBe('Ana Referencia');
    expect(r.warnings.join(' ')).toMatch(/inquilinoActualNombre.*NO se escribe/s);
    expect(r.camposSinDestino.map((x) => x.campo)).not.toContain('tenantName');
  });

  it('el alta persiste TODO lo declarado y es releíble (evidencia incluida)', async () => {
    const store = almacen();
    const { res } = await promover(run, store);
    expect(res.creados).toBe(1);
    const inm = store.inmuebles.get(r.destinationId!)!;
    expect(inm.direccion).toBe('Calle Referencia 7, Madrid');
    expect(inm.referenciaCatastral).toBe('9876543210987654321');
    expect(inm.valorAdquisicion).toBe(180000);
    expect(inm.valoracionEstimada).toBe(210000);
    expect(inm.porcentajeSueloCatastral).toBe(25);
    expect(inm.amortizacionAnualDeclarada).toBe(3600);
    expect(inm.fechaRegistroPatrimonial).toBe('2021-02-01');
    expect(inm.fechaAdquisicion).toBeUndefined();
    expect(inm.gastosAnualesDeclarados).toEqual({ comunidad: 600, ibi: 450, reparaciones: 200, seguro: 180, ejercicio: null });
    expect(inm.inquilinoDeclarado).toEqual({ nombre: 'Ana Referencia', dni: '12345678A' });
    expect(inm.titularidadDeclarada).toMatchObject({
      texto: 'both', porcentajePropietario1: 60, porcentajePropietario2: 40, resuelta: false,
    });
    // Evidencia completa releíble: valor original + motivo por dato declarado.
    const evidencias = inm.datosImportadosHistoricos!.datosDeclarados;
    expect(evidencias.find((d) => d.clave === 'inquilinoDeclarado.dni')?.valorOriginal).toBe('12345678A');
    expect(evidencias.some((d) => d.estado === 'PENDIENTE_RESOLUCION')).toBe(true);
    // Ni publicación ni campos de anuncio: el alta es patrimonial. El inquilino
    // declarado NUNCA se escribe como inquilino actual (no se inventa contrato).
    expect(inm).not.toHaveProperty('estado');
    expect(inm).not.toHaveProperty('precio');
    expect(inm).not.toHaveProperty('rentaMensual');
    expect(inm).not.toHaveProperty('inquilinoActualNombre');
    // 0 movimientos de gasto: un agregado anual no es un gasto individual.
    expect(store.gastos.size).toBe(0);
    // Y 0 titularidades: nadie ha resuelto todavía quién es cada titular.
    expect(store.titularidades.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('2) ida y vuelta: exportar con el ERP e importar el mismo archivo', () => {
  const INMUEBLE_CON_DECLARADOS = {
    id: 'inm_1', direccion: 'Calle Exportada 1', ciudad: 'Alicante', referenciaCatastral: 'CAT-EXP-1',
    propietarioId: PROP_ACTOR, propietarioPrincipalId: PROP_ACTOR, estado: 'disponible', tipoInmueble: 'piso',
    precio: 800, rentaMensual: 800, superficie: 80, habitaciones: 3, codigoPostal: '03001',
    porcentajeSueloCatastral: 30, amortizacionAnualDeclarada: 2400, rentaMensualDeclarada: 750,
    fechaRegistroPatrimonial: '2020-03-01', ejercicioDeclarado: 2025,
    'gastosAnualesDeclarados.comunidad': 500, 'gastosAnualesDeclarados.ibi': 350,
    'gastosAnualesDeclarados.reparaciones': 120, 'gastosAnualesDeclarados.seguro': 190,
    'titularidadDeclarada.texto': 'Cotitularidad', 'titularidadDeclarada.propietario1': 55,
    'titularidadDeclarada.propietario2': 45, 'inquilinoDeclarado.nombre': 'Inquilino Exportado',
    'inquilinoDeclarado.dni': '87654321B',
  };

  it('el exportador incluye los datos declarados (no se pierden al exportar)', () => {
    const exp = ejecutarExportacion({
      solicitado: { entidad: 'INMUEBLE', propietarioIds: [PROP_ACTOR], inmuebleIds: [], ejercicios: [], formato: 'JSON' },
      autorizado: AMBITO,
      catalogoInmuebles: [INMUEBLE_CON_DECLARADOS],
      registros: [INMUEBLE_CON_DECLARADOS],
      exportedAt: '2026-10-12T00:00:00.000Z',
      exportedBy: 'u_sintetico',
    });
    for (const columna of [
      'porcentajeSueloCatastral', 'amortizacionAnualDeclarada', 'rentaMensualDeclarada',
      'fechaRegistroPatrimonial', 'ejercicioDeclarado', 'gastosAnualesDeclarados.comunidad',
      'gastosAnualesDeclarados.ibi', 'gastosAnualesDeclarados.reparaciones', 'gastosAnualesDeclarados.seguro',
      'titularidadDeclarada.texto', 'titularidadDeclarada.propietario1', 'titularidadDeclarada.propietario2',
      'inquilinoDeclarado.nombre', 'inquilinoDeclarado.dni',
    ]) {
      expect(COLUMNAS_CSV.INMUEBLE, `falta la columna exportada ${columna}`).toContain(columna);
    }
    expect(exp.contenido).toContain('amortizacionAnualDeclarada');
    expect(exp.contenido).toContain('gastosAnualesDeclarados.seguro');
    expect(exp.contenido).toContain('inquilinoDeclarado.dni');
  });

  it('el archivo exportado se reimporta y su inmueble existente se VINCULA (no se duplica ni se pisa)', async () => {
    const exp = ejecutarExportacion({
      solicitado: { entidad: 'INMUEBLE', propietarioIds: [PROP_ACTOR], inmuebleIds: [], ejercicios: [], formato: 'JSON' },
      autorizado: AMBITO,
      catalogoInmuebles: [INMUEBLE_CON_DECLARADOS],
      registros: [INMUEBLE_CON_DECLARADOS],
      exportedAt: '2026-10-12T00:00:00.000Z',
      exportedBy: 'u_sintetico',
    });
    const { estructura, parseo } = leerJsonComoLaUi(new TextEncoder().encode(exp.contenido));
    expect(estructura.tipo).toBe('sobre_propio');
    expect(estructura.rutaRegistros).toEqual(['records']);
    expect(parseo.registros).toHaveLength(1);
    const run = correr({
      registrosCrudos: parseo.registros, formato: 'JSON', sourceName: 'export_inmueble.json',
      catalogos: catalogos({ inmuebles: [INMUEBLE_CON_DECLARADOS] }),
      parches: [{ propietarioDestinoId: PROP_ACTOR }],
    });
    const r = run.registros[0]!;
    expect(r.entityType).toBe('INMUEBLE');
    // El `id` del propio archivo es el id canónico del inmueble ⇒ VINCULAR.
    expect(r.operacion).toBe('VINCULAR');
    expect(r.destinationId).toBe('inm_1');

    // Lo exportado se RECUPERA al reimportar: nada se pierde por el camino.
    expect(r.canonicalData['porcentajeSueloCatastral']).toBe(30);
    expect(r.canonicalData['amortizacionAnualDeclarada']).toBe(2400);
    expect(r.canonicalData['rentaMensualDeclarada']).toBe(750);
    expect(r.canonicalData['fechaRegistroPatrimonial']).toBe('2020-03-01');
    expect(r.canonicalData['ejercicioDeclarado']).toBe(2025);
    expect(r.canonicalData['gastosAnualesDeclarados']).toEqual({ comunidad: 500, ibi: 350, reparaciones: 120, seguro: 190 });
    const porClave = new Map((r.declarados ?? []).map((d) => [d.clave, d]));
    expect(porClave.get('titularidadDeclarada.texto')?.valor).toBe('Cotitularidad');
    expect(porClave.get('titularidadDeclarada.propietario1')?.valor).toBe(55);
    expect(porClave.get('inquilinoDeclarado.dni')?.valor).toBe('87654321B');
    // Y siguen PENDIENTES: reimportar no resuelve titularidades ni crea contratos.
    expect(r.titularidadResuelta ?? []).toEqual([]);
    expect(r.canonicalData['inquilinoActualNombre']).toBeUndefined();
    expect(r.camposDesconocidos).toEqual([]);

    const store = almacen();
    const { plan, res } = await promover(run, store);
    expect(plan.operaciones).toHaveLength(0);        // VINCULAR no escribe
    expect(plan.vinculadasSinEscritura).toHaveLength(1);
    expect(res.creados).toBe(0);
    expect(store.inmuebles.size).toBe(0);            // no se ha creado nada
    expect(store.titularidades.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('3) Excel real: 7 inmuebles × 17 columnas', () => {
  const parseo = parseXlsx(libroReal());
  const parches = filasReales().map(() => ({ propietarioDestinoId: PROP_ACTOR }));
  const run = correr({ registrosCrudos: parseo.registros as Record<string, unknown>[], parches });

  it('el libro se lee completo: 7 filas, 17 cabeceras, sin errores', () => {
    expect(parseo.errores).toEqual([]);
    expect(parseo.registros).toHaveLength(7);
    expect(Object.keys(parseo.registros[0] ?? {})).toHaveLength(17);
  });

  it('la entidad se detecta como INMUEBLE también con AUTO (por cabeceras)', () => {
    const auto = correr({ registrosCrudos: parseo.registros as Record<string, unknown>[], entityType: 'AUTO', parches });
    expect(auto.registros.every((r) => r.entityType === 'INMUEBLE')).toBe(true);
    expect(auto.noMigrables).toBe(0);
  });

  it('las 7 filas son altas elegibles: 17 cabeceras cubiertas y ninguna sin destino', () => {
    expect(run.totalRecords).toBe(7);
    expect(run.errorRecords).toBe(0);
    expect(run.importedRecords).toBe(7);
    expect(run.incompleteRecords).toBe(0);
    expect(run.camposDesconocidos).toEqual([]);
    expect(run.camposSinDestino).toEqual([]); // ninguna columna reconocida y sin incorporar
    const cubiertas = new Set([
      ...run.registros.flatMap((r) => r.fieldMappings.map((m) => m.campoOrigen)),
      ...run.registros.flatMap((r) => (r.declarados ?? []).map((d) => d.campoOrigen)),
    ]);
    for (const cabecera of CABECERAS_17) expect(cubiertas.has(cabecera), `sin tratar: ${cabecera}`).toBe(true);
  });

  it('cada columna se transforma en su dato con su significado (no sólo se reconoce)', () => {
    const fila1 = run.registros.find((r) => r.sourceRecordId === 'INM-REAL-1')!;
    expect(fila1.sourceRecordId).toBe('INM-REAL-1');            // identidad de origen
    expect(fila1.canonicalData['inmuebleId']).toBeUndefined();  // nunca como id interno
    expect(fila1.canonicalData['codigoPostal']).toBe('03001');  // separado del texto
    expect(fila1.canonicalData['ciudad']).toBe('Alicante');
    expect(fila1.canonicalData['valorAdquisicion']).toBe(100000);
    expect(fila1.canonicalData['rentaMensualDeclarada']).toBe(700);
    expect(fila1.canonicalData['porcentajeSueloCatastral']).toBe(25);
    expect(fila1.canonicalData['amortizacionAnualDeclarada']).toBe(2500);
    expect(fila1.canonicalData['fechaRegistroPatrimonial']).toBe('2021-01-10');
    expect(fila1.canonicalData['gastosAnualesDeclarados']).toEqual({ comunidad: 480, ibi: 300, reparaciones: 150, seguro: 200 });
    // La renta de la PLANTILLA nunca va al precio ni a la renta vigente.
    expect(fila1.canonicalData['precio']).toBeUndefined();
    expect(fila1.canonicalData['rentaMensual']).toBeUndefined();
    expect(fila1.canonicalData['fechaAdquisicion']).toBeUndefined();
    const porClave = new Map((fila1.declarados ?? []).map((d) => [d.clave, d]));
    expect(porClave.get('titularidadDeclarada.texto')?.valor).toBe('Propietario único');
    expect(porClave.get('titularidadDeclarada.propietario1')?.valor).toBe(100);
    expect(porClave.get('inquilinoDeclarado.nombre')?.valor).toBe('Inquilino Real 1');
    expect(porClave.get('inquilinoDeclarado.dni')?.valor).toBe('11111110A');
  });

  it('las 7 altas se persisten con TODOS sus datos declarados y se releen', async () => {
    const store = almacen();
    const { res } = await promover(run, store);
    expect(res.creados).toBe(7);
    expect(res.fallidos).toBe(0);
    expect(store.inmuebles.size).toBe(7);
    for (const [i, fila] of filasReales().entries()) {
      const registro = run.registros.find((r) => r.sourceRecordId === fila['ID Inmueble'])!;
      const inm = store.inmuebles.get(registro.destinationId!)!;
      expect(inm.direccion).toBe(`Calle Patrimonial ${i + 1}`);
      expect(inm.codigoPostal).toBe(`0300${i + 1}`);
      expect(inm.ciudad).toBe('Alicante');
      expect(inm.referenciaCatastral).toBe(fila['Referencia Catastral']);
      expect(inm.valorAdquisicion).toBe(fila['Precio Adquisición (€)']);
      expect(inm.rentaMensualDeclarada).toBe(fila['Renta Mensual (€)']);
      expect(inm.porcentajeSueloCatastral).toBe(fila['% Suelo Catastral']);
      expect(inm.amortizacionAnualDeclarada).toBe(fila['Amortización Anual (€)']);
      expect(inm.gastosAnualesDeclarados).toEqual({
        comunidad: fila['Gastos Comunidad (€)'], ibi: fila['Gastos IBI (€)'],
        reparaciones: fila['Gastos Reparaciones (€)'], seguro: fila['Gastos Seguro (€)'], ejercicio: null,
      });
      expect(inm.fechaRegistroPatrimonial).toBe(fila['Fecha Registro']);
      expect(inm.inquilinoDeclarado).toEqual({ nombre: fila['Inquilino'], dni: fila['DNI Inquilino'] });
      expect(inm.propietarioId).toBe(PROP_ACTOR);
      // Titularidad declarada conservada tal cual (100/'' y 60/40).
      if (i % 2 === 0) {
        expect(inm.titularidadDeclarada).toMatchObject({ texto: 'Propietario único', porcentajePropietario1: 100, resuelta: false });
        expect(inm.titularidadDeclarada!.porcentajePropietario2).toBeUndefined();
      } else {
        expect(inm.titularidadDeclarada).toMatchObject({ texto: 'Cotitularidad', porcentajePropietario1: 60, porcentajePropietario2: 40 });
      }
      // La evidencia declara TODAS las columnas de la fila (nada se pierde).
      const camposEvidencia = new Set(inm.datosImportadosHistoricos!.datosDeclarados.map((d) => d.campoOrigen));
      for (const cabecera of ['Titularidad', '% Propietario 1', 'Inquilino', 'DNI Inquilino']) {
        if (fila[cabecera] === '') continue;
        expect(camposEvidencia.has(cabecera), `sin evidencia: ${cabecera}`).toBe(true);
      }
    }
  });

  it('los agregados anuales NO se convierten en movimientos de gasto (sin duplicar)', async () => {
    const store = almacen();
    await promover(run, store);
    expect(store.gastos.size).toBe(0); // 0 movimientos: el agregado no se despliega
  });

  it('la amortización declarada se conserva identificada y no alimenta cálculo fiscal alguno', async () => {
    const store = almacen();
    await promover(run, store);
    const inm = store.inmuebles.get(run.registros[0]!.destinationId!)!;
    const claves = Object.keys(inm as unknown as Record<string, unknown>);
    expect(claves).toContain('amortizacionAnualDeclarada');
    expect(claves.filter((k) => /amortizacion|amortization/i.test(k))).toEqual(['amortizacionAnualDeclarada']);
    expect(inm).not.toHaveProperty('datosFiscales');
  });
});

// ---------------------------------------------------------------------------

describe('4) reimportación del mismo Excel real: sin duplicados ni sobrescrituras', () => {
  it('la segunda importación deja los 7 inmuebles como YA_EXISTENTE y no reescribe', async () => {
    const crudos = parseXlsx(libroReal()).registros as Record<string, unknown>[];
    const parches = filasReales().map(() => ({ propietarioDestinoId: PROP_ACTOR }));
    const run1 = correr({ registrosCrudos: crudos, parches });
    const store = almacen();
    await promover(run1, store);
    const idsPrimera = [...store.inmuebles.keys()].sort();
    expect(idsPrimera).toHaveLength(7);

    // Mismo archivo ⇒ misma huella y mismo id interno determinista.
    const run2 = correr({ registrosCrudos: crudos, parches });
    expect([...run2.registros.map((r) => r.destinationId)].sort()).toEqual(idsPrimera);
    const { res } = await promover(run2, store, '2026-10-12T00:00:01.000Z');
    expect(res.creados).toBe(0);
    expect(res.yaExistentes).toBe(7);
    expect(res.fallidos).toBe(0);
    expect(store.inmuebles.size).toBe(7);
    // Nada se ha reescrito: el alta anterior sigue intacta y verificable.
    const idReal1 = run1.registros.find((r) => r.sourceRecordId === 'INM-REAL-1')!.destinationId!;
    const inm = store.inmuebles.get(idReal1)!;
    expect(inm.createdAt).toBe('2026-10-12T00:00:00.000Z');
    expect(inm.rentaMensualDeclarada).toBe(700);
  });

  it('las titularidades resueltas tampoco se duplican ni se reescriben al reimportar', async () => {
    const crudos = parseXlsx(libroReal()).registros as Record<string, unknown>[];
    const parche = (i: number): Parche => ({
      propietarioDestinoId: PROP_ACTOR,
      ...(i === 1
        ? { resolucionTitularidad: [{ ranura: 1 as const, propietarioId: PROP_ACTOR }, { ranura: 2 as const, propietarioId: PROP_OTRO }] }
        : {}),
    });
    const parches = filasReales().map((_, i) => parche(i));
    const store = almacen();
    await promover(correr({ registrosCrudos: crudos, parches }), store);
    // Sólo la fila cotitular tiene resolución humana; los porcentajes escritos
    // son los DECLARADOS (60/40), nunca repartidos.
    expect(store.titularidades.size).toBe(2);
    expect([...store.titularidades.values()].map((t) => t.porcentajeTitularidad).sort()).toEqual([40, 60]);

    const { res } = await promover(correr({ registrosCrudos: crudos, parches }), store, '2026-10-12T00:00:01.000Z');
    expect(res.yaExistentes).toBe(7);
    expect(res.titularidadesCreadas).toHaveLength(0);
    expect(store.titularidades.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------

describe('5) filas inválidas: rechazo con motivo y sin pérdida silenciosa', () => {
  it('una fila sin dirección se bloquea; los valores no interpretables se conservan', () => {
    const base = filasReales();
    const filas = [
      base[0]!,
      { ...base[1]!, 'Dirección Completa': '' },
      { ...base[2]!, 'Amortización Anual (€)': 'no es un número', '% Suelo Catastral': 150 },
    ];
    const parseo = parseXlsx(libroReal(filas));
    const run = correr({
      registrosCrudos: parseo.registros as Record<string, unknown>[],
      parches: filas.map(() => ({ propietarioDestinoId: PROP_ACTOR })),
    });
    // Sólo la fila sin dirección queda fuera; los valores no interpretables se
    // conservan y NO impiden dar de alta el inmueble (no se pierde el registro).
    expect(run.importedRecords).toBe(2);
    expect(run.registros.filter((r) => r.decision !== 'AUTO')).toHaveLength(1);

    // Fila sin dirección: no se importa y se dice por qué (no se inventa).
    const segunda = run.registros.find((r) => r.sourceRecordId === 'INM-REAL-2')!;
    expect(segunda.decision).not.toBe('AUTO');
    expect(`${segunda.motivo} ${segunda.warnings.join(' ')}`).toMatch(/direccion/i);
    const originalSegunda = run.dryRun.lineas.find((l) => l.proveniencia.sourceId === 'INM-REAL-2')!.datoOriginal;
    expect(originalSegunda['Referencia Catastral']).toBe('CAT-REAL-2');

    // Importe no numérico y % fuera de rango: original conservado, no escrito.
    const tercera = run.registros.find((r) => r.sourceRecordId === 'INM-REAL-3')!;
    const claves = new Map((tercera.declarados ?? []).map((d) => [d.clave, d]));
    expect(claves.get('declarado.noInterpretable.amortizacionAnualDeclarada')?.valorOriginal).toBe('no es un número');
    expect(claves.get('declarado.noInterpretable.porcentajeSueloCatastral')?.valorOriginal).toBe(150);
    expect(tercera.canonicalData['amortizacionAnualDeclarada']).toBeUndefined();
    expect(tercera.canonicalData['porcentajeSueloCatastral']).toBeUndefined();
    expect(tercera.warnings.join(' ')).toMatch(/no num|fuera de rango/i);
  });

  it('la evidencia original de TODAS las columnas permanece intacta en el dry-run', () => {
    const parseo = parseXlsx(libroReal());
    const run = correr({ registrosCrudos: parseo.registros as Record<string, unknown>[] });
    const original = run.dryRun.lineas.find((l) => l.proveniencia.sourceId === 'INM-REAL-1')!.datoOriginal as Record<string, unknown>;
    expect(original['Gastos IBI (€)']).toBe(300);
    expect(original['Inquilino']).toBe('Inquilino Real 1');
    expect(original['Titularidad']).toBe('Propietario único');
    expect(original['% Suelo Catastral']).toBe(25);
  });
});

// ---------------------------------------------------------------------------

describe('6) titularidad: sin resolución, titular ausente, ambiguo y suma > 100 %', () => {
  const cotitular = [filasReales()[1]!];      // 60/40
  const unicoTitular = [filasReales()[0]!];   // 100 / vacío

  it('un titular único al 100 % tampoco genera reparto ni titularidad automática', async () => {
    const run = correr({
      registrosCrudos: parseXlsx(libroReal(unicoTitular)).registros as Record<string, unknown>[],
      parches: [{ propietarioDestinoId: PROP_ACTOR }],
    });
    const store = almacen();
    const { res } = await promover(run, store);
    expect(res.creados).toBe(1);
    expect(store.titularidades.size).toBe(0);   // nunca se asume el 100 %
    const inm = store.inmuebles.get(run.registros[0]!.destinationId!)!;
    expect(inm.titularidadDeclarada).toMatchObject({ porcentajePropietario1: 100, resuelta: false });
    // La ranura 2 vacía no inventa un 0 % ni un 50 %: simplemente no consta.
    expect(inm.titularidadDeclarada!.porcentajePropietario2).toBeUndefined();
    expect(res.relacionesPendientes.length).toBeGreaterThan(0);
  });

  it('sin resolución humana: 60/40 quedan pendientes y el alta no se bloquea', async () => {
    const run = correr({
      registrosCrudos: parseXlsx(libroReal(cotitular)).registros as Record<string, unknown>[],
      parches: [{ propietarioDestinoId: PROP_ACTOR }],
    });
    const store = almacen();
    const { res } = await promover(run, store);
    expect(res.creados).toBe(1);
    expect(store.titularidades.size).toBe(0);
    const motivos = res.relacionesPendientes.map((x) => x.motivo).join(' | ').toLowerCase();
    expect(motivos).toContain('sin titular identificado');
    expect(motivos).toContain('no se reparte');
    const inm = store.inmuebles.get(run.registros[0]!.destinationId!)!;
    expect(inm.datosImportadosHistoricos!.datosDeclarados.some((d) => d.estado === 'PENDIENTE_RESOLUCION')).toBe(true);
  });

  it('titular ausente del catálogo: la asignación se descarta con motivo (no se inventa)', () => {
    const run = correr({
      registrosCrudos: parseXlsx(libroReal(cotitular)).registros as Record<string, unknown>[],
      parches: [{ propietarioDestinoId: PROP_ACTOR, resolucionTitularidad: [{ ranura: 1, propietarioId: 'prop_fantasma' }] }],
    });
    const r = run.registros[0]!;
    expect(r.titularidadResuelta ?? []).toEqual([]);
    expect((r.relacionesPendientes ?? []).map((x) => x.motivo).join(' ')).toMatch(/no existe en el catálogo/);
  });

  it('titular AMBIGUO en el catálogo (id duplicado): no se resuelve y queda pendiente', () => {
    const run = correr({
      registrosCrudos: parseXlsx(libroReal(cotitular)).registros as Record<string, unknown>[],
      catalogos: catalogos({
        propietarios: [
          { id: PROP_ACTOR, nombre: 'Titular actor', nifCif: '11111111A', estadoAcceso: 'ACTIVO' },
          { id: PROP_ACTOR, nombre: 'Titular actor (duplicado)', nifCif: '11111111A', estadoAcceso: 'ACTIVO' },
        ],
      }),
      parches: [{ propietarioDestinoId: PROP_ACTOR, resolucionTitularidad: [{ ranura: 1, propietarioId: PROP_ACTOR }] }],
    });
    const r = run.registros[0]!;
    expect(r.titularidadResuelta ?? []).toEqual([]);
    expect((r.relacionesPendientes ?? []).map((x) => x.motivo).join(' ')).toMatch(/ambiguo/);
  });

  it('la misma persona no puede ocupar dos ranuras (no se duplica la relación)', () => {
    const run = correr({
      registrosCrudos: parseXlsx(libroReal(cotitular)).registros as Record<string, unknown>[],
      parches: [{
        propietarioDestinoId: PROP_ACTOR,
        resolucionTitularidad: [{ ranura: 1, propietarioId: PROP_ACTOR }, { ranura: 2, propietarioId: PROP_ACTOR }],
      }],
    });
    const r = run.registros[0]!;
    expect(r.titularidadResuelta?.map((x) => x.ranura)).toEqual([1]);
    expect((r.relacionesPendientes ?? []).map((x) => x.motivo).join(' ')).toMatch(/ya tiene una titularidad/);
  });

  it('suma declarada > 100 %: no se escribe NINGUNA titularidad y el original se conserva', async () => {
    const fila = { ...cotitular[0]!, '% Propietario 1': 80, '% Propietario 2': 50 };
    const run = correr({
      registrosCrudos: parseXlsx(libroReal([fila])).registros as Record<string, unknown>[],
      parches: [{
        propietarioDestinoId: PROP_ACTOR,
        resolucionTitularidad: [{ ranura: 1, propietarioId: PROP_ACTOR }, { ranura: 2, propietarioId: PROP_OTRO }],
      }],
    });
    const r = run.registros[0]!;
    expect(r.titularidadResuelta ?? []).toEqual([]);
    expect((r.relacionesPendientes ?? []).map((x) => x.motivo).join(' ')).toMatch(/> 100/);
    const store = almacen();
    await promover(run, store);
    expect(store.titularidades.size).toBe(0);
    const inm = store.inmuebles.get(r.destinationId!)!;
    expect(inm.titularidadDeclarada).toMatchObject({ porcentajePropietario1: 80, porcentajePropietario2: 50, resuelta: false });
  });

  it('una ranura que la persona SÍ resuelve se persiste con el porcentaje declarado', async () => {
    const run = correr({
      registrosCrudos: parseXlsx(libroReal(cotitular)).registros as Record<string, unknown>[],
      parches: [{
        propietarioDestinoId: PROP_ACTOR,
        resolucionTitularidad: [{ ranura: 1, propietarioId: PROP_ACTOR }, { ranura: 2, propietarioId: PROP_OTRO }],
      }],
    });
    const store = almacen();
    const { res } = await promover(run, store);
    expect(res.creados).toBe(1);
    expect(store.titularidades.size).toBe(2);
    expect(res.titularidadesCreadas.map((x) => x.porcentaje).sort()).toEqual([40, 60]);
    const inm = store.inmuebles.get(run.registros[0]!.destinationId!)!;
    expect(inm.titularidadDeclarada).toMatchObject({ resuelta: true });
    expect(inm.titularidadDeclarada!.titularidadResuelta).toHaveLength(2);
    // Y queda auditado, no silencioso.
    expect(store.auditoria.some((e) => e.accion === 'IMPORTACION_CREADO')).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('7) DNI del inquilino: vínculo inequívoco OFRECIDO, nunca automático', () => {
  const INMUEBLE_EXISTENTE = {
    id: 'inm_existente', direccion: 'Calle Patrimonial 1', ciudad: 'Alicante',
    referenciaCatastral: 'CAT-REAL-1', propietarioId: PROP_ACTOR,
  };
  const filas = [filasReales()[0]!];   // INM-REAL-1 / CAT-REAL-1 / DNI 1111111 0A

  function correrConContratos(contratos: ReadonlyArray<{ id: string; inmuebleId: string; candidatoDni?: string; candidatoNombre?: string }>) {
    return correr({
      registrosCrudos: parseXlsx(libroReal(filas)).registros as Record<string, unknown>[],
      catalogos: catalogos({ inmuebles: [INMUEBLE_EXISTENTE] }),
      contratosParaVinculoInquilino: contratos,
      parches: [{ propietarioDestinoId: PROP_ACTOR }],
    });
  }

  it('sin contratos candidatos no se ofrece nada y no se crea contrato', () => {
    const run = correrConContratos([]);
    const r = run.registros[0]!;
    expect(r.vinculosInquilinoCandidatos ?? []).toEqual([]);
    expect(r.canonicalData['inquilinoActualNombre']).toBeUndefined();
    expect(r.operacion).toBe('VINCULAR');   // el inmueble existe: se vincula
  });

  it('una coincidencia EXACTA por DNI en el MISMO inmueble se ofrece (normalizando el documento)', () => {
    const run = correrConContratos([
      { id: 'ctr_1', inmuebleId: INMUEBLE_EXISTENTE.id, candidatoDni: '1111111 0-A', candidatoNombre: 'Inquilino Real 1' },
      { id: 'ctr_2', inmuebleId: INMUEBLE_EXISTENTE.id, candidatoDni: '99999999Z', candidatoNombre: 'Otra persona' },
      { id: 'ctr_3', inmuebleId: 'inm_otro', candidatoDni: '11111110A', candidatoNombre: 'Mismo DNI, otro inmueble' },
    ]);
    const r = run.registros[0]!;
    expect(r.vinculosInquilinoCandidatos).toEqual([{ contratoId: 'ctr_1', candidatoNombre: 'Inquilino Real 1' }]);
    // Sigue SIN escribirse: es una oferta, no una vinculación.
    expect(r.canonicalData['inquilinoActualNombre']).toBeUndefined();
    const porClave = new Map((r.declarados ?? []).map((d) => [d.clave, d]));
    expect(porClave.get('inquilinoDeclarado.dni')?.estado).toBe('PENDIENTE_RESOLUCION');
  });

  it('un lote cuyo único destino es VINCULAR no es autorizable: nada que ejecutar', () => {
    const run = correrConContratos([
      { id: 'ctr_1', inmuebleId: INMUEBLE_EXISTENTE.id, candidatoDni: '11111110A', candidatoNombre: 'Inquilino Real 1' },
    ]);
    const autorizacion = autorizarImportRun({
      run, tamanoBytes: 4096, commitDryRun: 'ui', autorizador: 'u_sintetico', fechaHora: '2026-10-12T00:00:00.000Z',
    });
    // El vínculo se OFRECE en el dry-run (es lo que muestra el panel) …
    expect(run.registros[0]!.vinculosInquilinoCandidatos).toEqual([{ contratoId: 'ctr_1', candidatoNombre: 'Inquilino Real 1' }]);
    // … y no hay ninguna operación elegible (VINCULAR no escribe) ⇒ la
    // autorización es CONDICIONADA y la promoción queda bloqueada: no se simula
    // ninguna importación ni se crea contrato alguno.
    expect(autorizacion.decision).toBe('CONDICIONADA');
    expect(() => planificarPromocion({
      autorizacion, run,
      canonicalBatchSha256: run.sourceHash,
      explicitExecutionToken: derivarTokenEjecucion(run.sourceHash),
      decisiones: {}, ambito: AMBITO,
    })).toThrow(/CONDICIONADA/);
    const store = almacen([INMUEBLE_EXISTENTE.id]);
    expect(store.inmuebles.size).toBe(1);
    expect(store.gastos.size).toBe(0);
  });

  it('la relación del inquilino queda declarada y pendiente, con el DNI original', () => {
    const run = correrConContratos([]);
    const r = run.registros[0]!;
    const porClave = new Map((r.declarados ?? []).map((d) => [d.clave, d]));
    expect(porClave.get('inquilinoDeclarado.nombre')?.valor).toBe('Inquilino Real 1');
    expect(porClave.get('inquilinoDeclarado.dni')?.valor).toBe('11111110A');
    expect(porClave.get('inquilinoDeclarado.dni')?.estado).toBe('PENDIENTE_RESOLUCION');
    const pendiente = (r.relacionesPendientes ?? []).find((x) => x.campoOrigen === 'DNI Inquilino');
    expect(pendiente?.motivo).toMatch(/PENDIENTE_RESOLUCION/);
  });
});

// ---------------------------------------------------------------------------

describe('8) estructura de un respaldo REAL del Gestor Patrimonial', () => {
  const cuerpoPortfolio = {
    user1: { name: 'Titular 1' },
    user2: { name: 'Titular 2' },
    properties: [FILA_GESTOR_PATRIMONIAL],
    payments: [],
    expenses: [{ id: 'exp_1', amount: 10, category: 'ibi' }],
    contracts: [],
    isOnboarded: true,
    currentYear: 2026,
  };

  it('documento portfolio (lista `properties` en la raíz): sus inmuebles, no el objeto entero', () => {
    const estructura = analizarEstructuraJson(cuerpoPortfolio);
    expect(estructura.rutaRegistros).toEqual(['properties']);
    expect(estructura.registros).toBe(1);
    const parseo = parseJson(new TextEncoder().encode(JSON.stringify(cuerpoPortfolio)), { rutaAnidada: estructura.rutaRegistros! });
    expect(parseo.registros).toHaveLength(1);
    expect((parseo.registros[0] as Record<string, unknown>)['address']).toBe('Calle Referencia 7, Madrid');
    // Y el inmueble del respaldo se importa como alta patrimonial.
    const run = correr({
      registrosCrudos: parseo.registros, entityType: 'AUTO', formato: 'JSON',
      sourceName: 'portfolio.json', parches: [{ propietarioDestinoId: PROP_ACTOR }],
    });
    expect(run.registros[0]!.entityType).toBe('INMUEBLE');
    expect(run.registros[0]!.decision).toBe('AUTO');
    expect(run.registros[0]!.canonicalData['amortizacionAnualDeclarada']).toBe(3600);
  });

  it('envoltorio `{ portfolio: { properties: […] } }`: se desciende al contenedor', () => {
    const estructura = analizarEstructuraJson({ portfolio: cuerpoPortfolio });
    expect(estructura.rutaRegistros).toEqual(['portfolio', 'properties']);
    expect(estructura.registros).toBe(1);
  });

  it('envoltorio `{ data: { inmuebles: […] } }`: ruta anidada correcta', () => {
    const estructura = analizarEstructuraJson({ data: { inmuebles: [FILA_GESTOR_PATRIMONIAL] } });
    expect(estructura.rutaRegistros).toEqual(['data', 'inmuebles']);
    expect(estructura.registros).toBe(1);
  });

  it('respaldo sólo de MOVIMIENTOS: dice que es una lista de gastos/ingresos, no de inmuebles', () => {
    const raiz = { version: 2, expenses: [{ id: 'e1' }, { id: 'e2' }] };
    const estructura = analizarEstructuraJson(raiz);
    expect(estructura.registros).toBeNull();
    expect(estructura.listaMovimientos).toEqual({ clave: 'expenses', ruta: ['expenses'], registros: 2 });
    expect(motivoJsonSinRegistros(raiz)).toMatch(/lista de movimientos «expenses» \(2 registro\(s\)\), no de inmuebles/);
    // Y al importar GASTO/COBRO la lista que se lee es ésa (no se pierde).
    const parseo = parseJson(new TextEncoder().encode(JSON.stringify(raiz)), { rutaAnidada: estructura.listaMovimientos!.ruta });
    expect(parseo.registros).toHaveLength(2);
  });

  it('un JSON sin lista alguna mantiene el mensaje genérico (no se inventa contenido)', () => {
    const raiz = { configuracion: { idioma: 'es' }, version: 2 };
    expect(analizarEstructuraJson(raiz).listaMovimientos).toBeNull();
    expect(motivoJsonSinRegistros(raiz)).toContain('no se encuentra la lista de registros');
  });
});

// ---------------------------------------------------------------------------

describe('9) regresión con el libro REAL de la plantilla (7 inmuebles × 17 columnas)', () => {
  /**
   * `tests/fixtures/xlsx/inmuebles-plantilla-7x17.xlsx` es un libro .xlsx real
   * (estructura de Excel: `sharedStrings`, estilos y fechas como serial con
   * formato `yyyy-mm-dd`), con las 17 cabeceras reales de la incidencia y 7
   * filas SINTÉTICAS (`INM-FIX-*`). No contiene datos de ninguna persona.
   */
  const bytes = new Uint8Array(readFileSync(new URL('./fixtures/xlsx/inmuebles-plantilla-7x17.xlsx', import.meta.url)));
  const parseo = parseXlsx(bytes);
  const parches = [1, 2, 3, 4, 5, 6, 7].map(() => ({ propietarioDestinoId: PROP_ACTOR }));
  const run = correr({
    registrosCrudos: parseo.registros as Record<string, unknown>[],
    entityType: 'AUTO', parches, sourceName: 'inmuebles-plantilla-7x17.xlsx',
  });

  it('el libro se lee por FIRMA y completo: 7 filas × 17 cabeceras', () => {
    expect(detectarFormatoEntrada('inmuebles-plantilla-7x17.xlsx', bytes)).toBe('XLSX');
    expect(parseo.errores).toEqual([]);
    expect(parseo.avisos).toEqual([]);
    expect(parseo.registros).toHaveLength(7);
    expect(Object.keys(parseo.registros[0] ?? {})).toHaveLength(17);
  });

  it('las 7 filas se importan enteras: ninguna cabecera sin tratar ni sin destino', () => {
    expect(run.registros.every((r) => r.entityType === 'INMUEBLE')).toBe(true);
    expect(run.importedRecords).toBe(7);
    expect(run.camposDesconocidos).toEqual([]);
    expect(run.camposSinDestino).toEqual([]);
  });

  it('los valores con tipo real (números y seriales de fecha) se transforman bien', () => {
    const fila2 = run.registros.find((r) => r.sourceRecordId === 'INM-FIX-2')!;
    expect(fila2.canonicalData['direccion']).toBe('Calle Plantilla 2');
    expect(fila2.canonicalData['codigoPostal']).toBe('03002');
    expect(fila2.canonicalData['ciudad']).toBe('Alicante');
    expect(fila2.canonicalData['referenciaCatastral']).toBe('CAT-FIX-2');
    expect(fila2.canonicalData['valorAdquisicion']).toBe(110000);
    expect(fila2.canonicalData['rentaMensualDeclarada']).toBe(725);
    expect(fila2.canonicalData['porcentajeSueloCatastral']).toBe(26);
    expect(fila2.canonicalData['amortizacionAnualDeclarada']).toBe(2501);
    // El serial de Excel (fecha con formato) llega a fecha civil, no a número.
    expect(fila2.canonicalData['fechaRegistroPatrimonial']).toBe('2021-02-11');
    expect(fila2.canonicalData['gastosAnualesDeclarados']).toEqual({ comunidad: 481, ibi: 301, reparaciones: 151, seguro: 201 });
    const porClave = new Map((fila2.declarados ?? []).map((d) => [d.clave, d]));
    expect(porClave.get('titularidadDeclarada.propietario1')?.valor).toBe(60);
    expect(porClave.get('titularidadDeclarada.propietario2')?.valor).toBe(40);
    expect(porClave.get('inquilinoDeclarado.dni')?.valor).toBe('11111111A');
  });

  it('las 7 fichas se persisten y se releen con TODO lo declarado', async () => {
    const store = almacen();
    const { res } = await promover(run, store);
    expect(res.creados).toBe(7);
    for (const i of [1, 2, 3, 4, 5, 6, 7]) {
      const fila = run.registros.find((r) => r.sourceRecordId === `INM-FIX-${i}`)!;
      const inm = store.inmuebles.get(fila.destinationId!)!;
      expect(inm.direccion).toBe(`Calle Plantilla ${i}`);
      expect(inm.referenciaCatastral).toBe(`CAT-FIX-${i}`);
      expect(inm.valorAdquisicion).toBe(100000 + (i - 1) * 10000);
      expect(inm.rentaMensualDeclarada).toBe(700 + (i - 1) * 25);
      expect(inm.porcentajeSueloCatastral).toBe(25 + (i - 1));
      expect(inm.amortizacionAnualDeclarada).toBe(2500 + (i - 1));
      expect(inm.inquilinoDeclarado?.nombre).toBe(`Inquilino Plantilla ${i}`);
      // 0 movimientos de gasto: los agregados anuales no se despliegan.
    }
    expect(store.gastos.size).toBe(0);
    expect(store.titularidades.size).toBe(0); // ninguna titularidad inventada
  });
});

// ---------------------------------------------------------------------------

/**
 * 10) El libro que EXPORTA el Gestor Patrimonial de referencia, con SU orden de
 * columnas exacto (`Properties.tsx` → `handleExportExcel`): Inquilino y DNI
 * antes de la renta, renta antes del precio, Seguro antes de Reparaciones y
 * % Suelo antes de Amortización, con sus ceros por defecto.
 *
 * Importa por NOMBRE de cabecera, no por posición: si se confundiera el orden,
 * los valores (deliberadamente distintos por columna: seguro 1xx, reparaciones
 * 2xx) lo delatarían. Filas SINTÉTICAS `GP-FIX-*`.
 */
describe('10) XLSX exportado por el Gestor Patrimonial: su orden de columnas', () => {
  const bytes = new Uint8Array(readFileSync(new URL('./fixtures/xlsx/inmuebles-export-gestor-patrimonial-7x17.xlsx', import.meta.url)));
  const parseo = parseXlsx(bytes);
  const run = correr({
    registrosCrudos: parseo.registros as Record<string, unknown>[],
    entityType: 'AUTO', parches: [1, 2, 3, 4, 5, 6, 7].map(() => ({ propietarioDestinoId: PROP_ACTOR })),
    sourceName: 'inmuebles_2026-10-12.xlsx', formato: 'XLSX',
  });

  it('se lee por firma y completo: 7 filas, 17 cabeceras, sin errores ni desconocidas', () => {
    expect(detectarFormatoEntrada('inmuebles_2026-10-12.xlsx', bytes)).toBe('XLSX');
    expect(parseo.errores).toEqual([]);
    expect(parseo.registros).toHaveLength(7);
    expect(Object.keys(parseo.registros[0] ?? {})).toHaveLength(17);
    expect(run.importedRecords).toBe(7);
    expect(run.camposDesconocidos).toEqual([]);
    expect(run.camposSinDestino).toEqual([]);
  });

  it('cada columna cae en SU campo, sin mezclarse con la de al lado', () => {
    const f2 = run.registros.find((r) => r.sourceRecordId === 'GP-FIX-2')!;
    const c = f2.canonicalData;
    expect(c['direccion']).toBe('Avenida Exportadora 2');
    expect(c['codigoPostal']).toBe('46002');
    expect(c['ciudad']).toBe('Valencia');
    expect(c['referenciaCatastral']).toBe('CAT-GP-2');
    expect(c['valorAdquisicion']).toBe(202000);
    expect(c['rentaMensualDeclarada']).toBe(802);      // NO el precio
    expect(c['porcentajeSueloCatastral']).toBe(42);     // NO la amortización
    expect(c['amortizacionAnualDeclarada']).toBe(4002); // NO el % de suelo
    expect(c['fechaRegistroPatrimonial']).toBe('2022-03-03');
    expect(c['gastosAnualesDeclarados']).toEqual({ comunidad: 102, ibi: 302, seguro: 112, reparaciones: 222 });
    const porClave = new Map((f2.declarados ?? []).map((d) => [d.clave, d]));
    expect(porClave.get('titularidadDeclarada.propietario1')?.valor).toBe(60);
    expect(porClave.get('titularidadDeclarada.propietario2')?.valor).toBe(40);
    expect(porClave.get('inquilinoDeclarado.nombre')?.valor).toBe('Inquilino Exportado 2');
    expect(porClave.get('inquilinoDeclarado.dni')?.valor).toBe('22222222B');
  });

  it('la fila de titular único con el 100 % no reparte ni crea relación por su cuenta', () => {
    const f1 = run.registros.find((r) => r.sourceRecordId === 'GP-FIX-1')!;
    expect(f1.canonicalData['rentaMensualDeclarada']).toBe(801);
    const porClave = new Map((f1.declarados ?? []).map((d) => [d.clave, d]));
    expect(porClave.get('titularidadDeclarada.texto')?.valor).toBe('Propietario único');
    expect(porClave.get('titularidadDeclarada.propietario1')?.valor).toBe(100);
    // El 0 % declarado se conserva TAL CUAL (es lo que dice el archivo) y no
    // crea ninguna relación ni reparte el 100 % entre nadie.
    expect(porClave.get('titularidadDeclarada.propietario2')?.valor).toBe(0);
    expect(porClave.get('titularidadDeclarada.propietario2')?.estado).toBe('PENDIENTE_RESOLUCION');
    expect(f1.titularidadResuelta ?? []).toEqual([]);
  });

  it('las 7 altas se persisten y se releen (sin duplicar movimientos)', async () => {
    const store = almacen();
    const { res } = await promover(run, store);
    expect(res.creados).toBe(7);
    const inm2 = store.inmuebles.get(run.registros.find((r) => r.sourceRecordId === 'GP-FIX-2')!.destinationId!)!;
    expect(inm2.gastosAnualesDeclarados).toEqual({ comunidad: 102, ibi: 302, seguro: 112, reparaciones: 222, ejercicio: null });
    expect(inm2.rentaMensualDeclarada).toBe(802);
    expect(inm2).not.toHaveProperty('precio');
    expect(inm2).not.toHaveProperty('rentaMensual');
    expect(inm2.inquilinoDeclarado).toEqual({ nombre: 'Inquilino Exportado 2', dni: '22222222B' });
    expect(store.gastos.size).toBe(0);
    expect(store.titularidades.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------

/**
 * 11) Destino indeterminable: la importación NO elige por su cuenta.
 *
 * Casos reales de la cartera: dos fichas con la MISMA referencia catastral, un
 * solo candidato por catastro (vía no determinista) y ninguna coincidencia.
 */
describe('11) destino indeterminable: bloquea o exige revisión, nunca adivina', () => {
  const fila = { id: 'PISOS_1', address: 'Calle Mayor 3', cadastralReference: 'CAT1', purchasePrice: 200000 };
  const correrCon = (inmuebles: CatalogosMigracion['inmuebles'], parches?: ReadonlyArray<{ propietarioDestinoId: string }>) =>
    correr({ registrosCrudos: [fila], entityType: 'INMUEBLE', catalogos: catalogos({ inmuebles }), ...(parches ? { parches } : {}) });

  it('DOS fichas con la misma referencia catastral: BLOQUEADO con el motivo exacto', () => {
    const r = correrCon([
      { id: 'inm_a', direccion: 'Calle Mayor 3', referenciaCatastral: 'CAT1', propietarioId: PROP_ACTOR },
      { id: 'inm_b', direccion: 'Calle Mayor 3', referenciaCatastral: 'CAT1', propietarioId: PROP_ACTOR },
    ]).registros[0]!;
    expect(r.decision).toBe('BLOQUEADO');
    expect(r.destinationId).toBeNull();
    expect(r.motivo).toMatch(/referencia catastral duplicada en catálogo \(2 fichas\): inmueble indeterminable/);
  });

  it('UNA sola coincidencia por catastro: se propone VINCULAR pero con tope REVISIÓN', () => {
    const r = correrCon([{ id: 'inm_a', direccion: 'Calle Mayor 3', referenciaCatastral: 'CAT1', propietarioId: PROP_ACTOR }]).registros[0]!;
    expect(r.decision).toBe('REVISION');
    expect(r.operacion).toBe('VINCULAR');
    expect(r.destinationId).toBe('inm_a');
    expect(r.motivo).toMatch(/no determinista|REVISI/i);
  });

  it('NINGUNA coincidencia: alta nueva con el titular declarado por la persona', () => {
    const run = correrCon([], [{ propietarioDestinoId: PROP_ACTOR }]);
    const r = run.registros[0]!;
    expect(r.decision).toBe('AUTO');
    expect(r.operacion).toBe('CREAR');
    // El id destino NO es el «ID Inmueble» del archivo: lo asigna la confirmación.
    expect(r.destinationId).toMatch(/^inm_imp_/);
    expect(r.sourceRecordId).toBe('PISOS_1');
  });
});
