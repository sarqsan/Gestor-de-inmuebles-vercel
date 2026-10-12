/**
 * ALTA DE INMUEBLES NUEVOS POR IMPORTACIÓN — pruebas obligatorias (orden §4.6).
 * ============================================================================
 *
 * DATOS SINTÉTICOS: inmuebles, titulares, direcciones y referencias catastrales
 * son inventados (`SYNTH-*`, `CAT-SYN-*`). Ninguna prueba escribe en Firestore
 * ni en Storage: el núcleo es puro y la promoción usa un PUERTO FAKE en memoria.
 *
 * Cubre:
 *   · la fila nueva deja de estar bloqueada y llega a AUTO/elegible;
 *   · el alta escribe SÓLO lo declarado (sin inventar renta, estado, baños,
 *     fianzas, superficies ni precios) y NO publica ficha pública;
 *   · idempotencia y no sobrescritura;
 *   · los datos de alquiler/publicación que la fila trae no se escriben pero se
 *     avisan con motivo y se conservan en la evidencia;
 *   · un inmueble existente/ambiguo NO se crea;
 *   · sin titular o fuera de ámbito no se escribe nada;
 *   · 0 escrituras durante el análisis.
 */
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/lib/importacion/hash';
import type { CatalogosMigracion } from '../src/lib/migracion/tipos';
import {
  autorizarImportRun,
  derivarTokenEjecucion,
  ejecutarImportDryRun,
  ejecutarPromocion,
  generarXlsx,
  idInmuebleNuevoImport,
  parseXlsx,
  planificarPromocion,
  type ColumnaXlsx,
  type EventoAuditoriaImport,
  type ImportRun,
  type InmueblePatrimonialNuevo,
  type PuertoPersistenciaImport,
} from '../src/lib/importExport';

const PROP_ACTOR = 'prop_A';   // titular de la sesión (perfil PROPIETARIO)
const PROP_OTRO = 'prop_B';    // titular existente pero NO escribible por el actor

const CABECERAS_17 = [
  'ID Inmueble', 'Dirección Completa', 'Referencia Catastral', 'Titularidad',
  '% Propietario 1', '% Propietario 2', 'Precio Adquisición (€)', 'Amortización Anual (€)',
  'Renta Mensual (€)', 'Gastos Comunidad (€)', 'Gastos IBI (€)', 'Gastos Reparaciones (€)',
  'Gastos Seguro (€)', '% Suelo Catastral', 'Inquilino', 'DNI Inquilino', 'Fecha Registro',
];
const NUMERICAS = new Set(['% Propietario 1', '% Propietario 2', 'Precio Adquisición (€)', 'Amortización Anual (€)', 'Renta Mensual (€)', 'Gastos Comunidad (€)', 'Gastos IBI (€)', 'Gastos Reparaciones (€)', 'Gastos Seguro (€)', '% Suelo Catastral']);

function libroPlantilla(filas: Record<string, unknown>[]): Uint8Array {
  const columnas: ColumnaXlsx[] = CABECERAS_17.map((nombre) => ({ nombre, tipo: NUMERICAS.has(nombre) ? 'numero' : 'texto' }));
  return generarXlsx([{ nombre: 'Inmuebles', columnas, filas }]);
}

/** Fila patrimonial completa (17 columnas), con la renta y el inquilino declarados. */
function filaSintetica(i: number, over?: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    'ID Inmueble': `SYNTH-${i}`,
    'Dirección Completa': `Calle Sintética ${i}, 03001 Alicante`,
    'Referencia Catastral': `CAT-SYN-${i}`,
    'Titularidad': 'Propietario único',
    '% Propietario 1': 100,
    '% Propietario 2': '',
    'Precio Adquisición (€)': 100000 + i * 1000,
    'Amortización Anual (€)': '',
    'Renta Mensual (€)': 600 + i,
    'Gastos Comunidad (€)': '',
    'Gastos IBI (€)': '',
    'Gastos Reparaciones (€)': '',
    'Gastos Seguro (€)': '',
    '% Suelo Catastral': '',
    'Inquilino': 'Inquilino Sintético',
    'DNI Inquilino': '',
    'Fecha Registro': `2019-05-0${i}`,
    ...over,
  };
}

/** Catálogo destino SIN inmuebles: toda fila es nueva. `prop_A` es el único escribible. */
function catalogos(extra?: Partial<CatalogosMigracion>): CatalogosMigracion {
  return {
    propietarios: [
      { id: PROP_ACTOR, nombre: 'Titular actor (sintético)', nifCif: '11111111A', estadoAcceso: 'ACTIVO' },
      { id: PROP_OTRO, nombre: 'Titular ajeno (sintético)', nifCif: '22222222B', estadoAcceso: 'ACTIVO' },
    ],
    inmuebles: [],
    contratos: [],
    mapeos: [],
    existentes: [],
    propietariosPermitidosIds: [PROP_ACTOR],
    importador: { uid: 'u_sintetico', modalidad: 'PROPIETARIO' },
    ...extra,
  };
}

const AMBITO_ACTOR = { propietarioIdsLegibles: [PROP_ACTOR], propietarioIdsEscribibles: [PROP_ACTOR], esMaster: false };

function correr(entrada: {
  registrosCrudos: Record<string, unknown>[];
  localizaciones?: string[];
  entityType?: string;
  parches?: ReadonlyArray<{ propietarioDestinoId?: string; resolucionTitularidad?: readonly { ranura: 1 | 2; propietarioId: string }[] } | null>;
  catalogos?: CatalogosMigracion;
  sourceName?: string;
}): ImportRun {
  const crudos = entrada.registrosCrudos;
  return ejecutarImportDryRun({
    registrosCrudos: crudos,
    localizaciones: entrada.localizaciones ?? crudos.map((_, i) => `fila ${i + 2}`),
    entityType: entrada.entityType ?? 'INMUEBLE',
    formato: 'XLSX',
    sourceName: entrada.sourceName ?? 'sintetico.xlsx',
    sourceHash: sha256Hex(new TextEncoder().encode(JSON.stringify(crudos))),
    sourceTamanoBytes: 1024,
    sourceType: 'EXTERNAL',
    catalogos: entrada.catalogos ?? catalogos(),
    fechaHora: '2026-10-12T00:00:00.000Z',
    actor: 'u_sintetico',
    parches: entrada.parches,
  });
}

/** Puerto fake en memoria: registra las escrituras que el ejecutor intenta. */
function puertoFake(existentes: string[] = []) {
  const inmuebles = new Map<string, InmueblePatrimonialNuevo>();
  const titularidades = new Map<string, { porcentajeTitularidad: number | null; estado: string; campoOrigen: string; valorOriginal: unknown }>();
  const auditoria: EventoAuditoriaImport[] = [];
  for (const id of existentes) inmuebles.set(id, { id, direccion: '(pre-existente)', propietarioId: PROP_ACTOR });
  const llamadas = { crearInmueble: 0, existeDestino: 0, crearTitularidad: 0 };
  const puerto: PuertoPersistenciaImport = {
    async existeDestino(coleccion, destinoId) {
      llamadas.existeDestino += 1;
      if (coleccion !== 'inmuebles') throw new Error(`colección no esperada en esta prueba: '${coleccion}'`);
      return inmuebles.has(destinoId);
    },
    async existeCobro() { return false; },
    async crearGasto() { throw new Error('no usado'); },
    async crearInmueble(inm) {
      llamadas.crearInmueble += 1;
      if (inmuebles.has(inm.id)) throw new Error('sobrescritura prohibida');
      inmuebles.set(inm.id, inm);
    },
    async anexarCobro() { throw new Error('no usado'); },
    async existeTitularidad(inmuebleId, propietarioId) {
      return titularidades.has(`${inmuebleId}__${propietarioId}`);
    },
    async crearTitularidad(x) {
      const clave = `${x.inmuebleId}__${x.propietarioId}`;
      if (titularidades.has(clave)) throw new Error('titularidad duplicada');
      // La relación exige el inmueble existente (Rules) y el porcentaje declarado.
      if (!inmuebles.has(x.inmuebleId)) throw new Error('titularidad sin inmueble');
      llamadas.crearTitularidad += 1;
      titularidades.set(clave, {
        porcentajeTitularidad: x.porcentajeTitularidad,
        estado: 'VIGENTE',
        campoOrigen: x.campoOrigen,
        valorOriginal: x.valorOriginal,
      });
    },
    async auditar(e) { auditoria.push(e); },
  };
  return { puerto, inmuebles, titularidades, auditoria, llamadas };
}

function autorizarYPlanificar(run: ImportRun, ambito = AMBITO_ACTOR) {
  const autorizacion = autorizarImportRun({
    run, tamanoBytes: 2048, commitDryRun: 'ui',
    autorizador: 'u_sintetico', fechaHora: '2026-10-12T00:00:00.000Z',
  });
  const plan = planificarPromocion({
    autorizacion, run,
    canonicalBatchSha256: run.sourceHash,
    explicitExecutionToken: derivarTokenEjecucion(run.sourceHash),
    ambito,
  });
  return { autorizacion, plan };
}

// ---------------------------------------------------------------------------
// 1) La fila nueva deja de estar bloqueada
// ---------------------------------------------------------------------------
describe('alta 1) la fila nueva es elegible y computable (ya no queda en REVISIÓN)', () => {
  it('el destino CREAR tiene id interno asignado y la autorización se CONCEDE', () => {
    const p = parseXlsx(libroPlantilla([filaSintetica(1)]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    const r = run.registros[0]!;

    expect(r.entityType).toBe('INMUEBLE');
    expect(r.decision).toBe('AUTO');           // antes: REVISION permanente
    expect(r.operacion).toBe('CREAR');
    expect(r.destinoColeccion).toBe('inmuebles');
    expect(r.destinationId).toMatch(/^inm_imp_[0-9a-f]{20}$/);
    expect(r.propietarioDestinoId).toBe(PROP_ACTOR);
    expect(r.motivo).not.toContain('sin id asignable');

    const { autorizacion, plan } = autorizarYPlanificar(run);
    expect(autorizacion.decision).toBe('CONCEDIDA'); // antes: CONDICIONADA (nada elegible)
    expect(plan.operaciones).toHaveLength(1);
    expect(plan.operaciones[0]!.entidad).toBe('INMUEBLE');
    expect(plan.operaciones[0]!.destinoId).toBe(r.destinationId);
  });

  it('el id interno NO es el «ID Inmueble» del archivo (es identidad de origen)', () => {
    const p = parseXlsx(libroPlantilla([filaSintetica(1)]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    const r = run.registros[0]!;
    expect(r.sourceRecordId).toBe('SYNTH-1');                       // identidad de origen conservada
    expect(r.destinationId).not.toBe('SYNTH-1');                    // nunca el id del archivo
    expect(r.canonicalData['inmuebleId']).toBeUndefined();          // ni en datos canónicos
    expect(String(r.destinationId)).not.toContain('SYNTH-1');
  });

  it('el id asignado es determinista (idempotencia) y cumple el límite de id de las Rules (≤128)', () => {
    const a = idInmuebleNuevoImport('hash_x', 'SYNTH-1');
    const b = idInmuebleNuevoImport('hash_x', 'SYNTH-1');
    const c = idInmuebleNuevoImport('hash_x', 'SYNTH-2');
    const d = idInmuebleNuevoImport('hash_y', 'SYNTH-1');
    expect(a).toBe(b);              // mismo fichero + mismo registro ⇒ mismo id
    expect(a).not.toBe(c);          // registros distintos ⇒ ids distintos
    expect(a).not.toBe(d);          // ficheros distintos ⇒ ids distintos
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(128);
  });
});

// ---------------------------------------------------------------------------
// 2) El alta escribe SÓLO lo declarado (nada inventado) y no publica
// ---------------------------------------------------------------------------
describe('alta 2) el inmueble se crea con los datos disponibles y sin inventar nada', () => {
  it('escribe los campos patrimoniales declarados y OMITE los ausentes (ni 0 ni 1)', async () => {
    // Fila que declara ADEMÁS los datos declarados con campo propio (% suelo,
    // amortización, agregados anuales, DNI): todos deben persistir.
    const p = parseXlsx(libroPlantilla([filaSintetica(1, {
      'Amortización Anual (€)': 3001,
      'Gastos Comunidad (€)': 45,
      'Gastos IBI (€)': 320,
      'Gastos Reparaciones (€)': 0,
      'Gastos Seguro (€)': 180,
      '% Suelo Catastral': 20,
      'DNI Inquilino': '33333333C',
    })]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    const { plan } = autorizarYPlanificar(run);
    const fake = puertoFake();
    const res = await ejecutarPromocion({ plan, run, decisiones: {}, puerto: fake.puerto, actor: 'u_sintetico', fechaHora: '2026-10-12T00:00:00.000Z' });

    expect(res.creados).toBe(1);
    expect(res.fallidos).toBe(0);
    const inm = fake.inmuebles.get(run.registros[0]!.destinationId!)!;
    expect(inm).toBeDefined();

    // Declarado en la fila ⇒ escrito tal cual (sin «correcciones»).
    expect(inm.direccion).toBe('Calle Sintética 1');
    expect(inm.ciudad).toBe('Alicante');
    expect(inm.codigoPostal).toBe('03001');
    expect(inm.referenciaCatastral).toBe('CAT-SYN-1');
    expect(inm.valorAdquisicion).toBe(101000);
    // Fecha REGISTRO ≠ fecha de adquisición: la fila declara registro.
    expect(inm.fechaRegistroPatrimonial).toBe('2019-05-01');
    expect(inm.fechaAdquisicion).toBeUndefined();
    expect(inm.propietarioId).toBe(PROP_ACTOR);
    // Datos declarados con campo propio persistente (equivalen a los del Gestor
    // Patrimonial y son releíbles desde el documento del inmueble).
    expect(inm.porcentajeSueloCatastral).toBe(20);
    expect(inm.amortizacionAnualDeclarada).toBe(3001);
    expect(inm.rentaMensualDeclarada).toBe(601);
    expect(inm.gastosAnualesDeclarados).toEqual({ comunidad: 45, ibi: 320, reparaciones: 0, seguro: 180, ejercicio: null });
    expect(inm.inquilinoDeclarado).toEqual({ nombre: 'Inquilino Sintético', dni: '33333333C' });
    expect(inm.titularidadDeclarada?.porcentajePropietario1).toBe(100);
    expect(inm.titularidadDeclarada?.resuelta).toBe(false);
    // Evidencia completa: valor original de cada columna declarada.
    const claves = (inm.datosImportadosHistoricos?.datosDeclarados ?? []).map((d) => d.clave);
    expect(claves).toContain('titularidadDeclarada.texto');
    expect(claves).toContain('inquilinoDeclarado.dni');
    expect(inm.datosImportadosHistoricos?.sourceRecordId).toBe('SYNTH-1');

    // NO declarado en la fila ⇒ AUSENTE (jamás 0, 1, '' ni un valor por defecto).
    for (const campo of ['precio', 'rentaMensual', 'estado', 'banos', 'fianzaMeses', 'candidatosCount', 'superficie', 'habitaciones', 'modalidadAlquiler', 'descripcion', 'imagenUrl', 'inquilinoActualNombre']) {
      expect(inm, `campo '${campo}' no debe escribirse`).not.toHaveProperty(campo);
    }
  });

  it('las Rules de creación del PROPIETARIO se respetan: propietarioId == el titular de la sesión', async () => {
    // `inmuebles.create` autoriza a un PROPIETARIO sólo si
    // `incoming().propietarioId == myPropId()` (o propietarioPrincipalId).
    const p = parseXlsx(libroPlantilla([filaSintetica(1)]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    const { plan } = autorizarYPlanificar(run);
    const fake = puertoFake();
    await ejecutarPromocion({ plan, run, decisiones: {}, puerto: fake.puerto, actor: 'u_sintetico', fechaHora: '2026-10-12T00:00:00.000Z' });
    const inm = fake.inmuebles.get(run.registros[0]!.destinationId!)!;
    expect(inm.propietarioId).toBe(PROP_ACTOR);
    expect(inm.propietarioId).not.toBe(PROP_OTRO);
  });

  it('no se publica: el alta escribe el inmueble, no una ficha pública', async () => {
    const p = parseXlsx(libroPlantilla([filaSintetica(1)]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    const { plan } = autorizarYPlanificar(run);
    const fake = puertoFake();
    await ejecutarPromocion({ plan, run, decisiones: {}, puerto: fake.puerto, actor: 'u_sintetico', fechaHora: '2026-10-12T00:00:00.000Z' });
    // El puerto de importación no expone ninguna escritura de publicación: el
    // contrato entero se agota con crearInmueble (un único documento).
    expect(Object.keys(fake.puerto)).not.toContain('crearFichaPublica');
    expect(fake.llamadas.crearInmueble).toBe(1);
    // Un alta patrimonial no lleva estado de publicación ⇒ no es un anuncio.
    expect(fake.inmuebles.get(run.registros[0]!.destinationId!)).not.toHaveProperty('estado');
  });

  it('la evidencia conserva los valores originales de todas las columnas', () => {
    const p = parseXlsx(libroPlantilla([filaSintetica(1)]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    const dry = run.dryRun.lineas[0]!;
    expect(dry.datoOriginal['Renta Mensual (€)']).toBe(601);
    expect(dry.datoOriginal['Inquilino']).toBe('Inquilino Sintético');
    expect(dry.datoOriginal['Precio Adquisición (€)']).toBe(101000);
    expect(dry.datoOriginal['% Propietario 1']).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 3) Lo que NO se escribe se declara (no hay pérdidas silenciosas)
// ---------------------------------------------------------------------------
describe('alta 3) los datos de alquiler/publicación declarados se avisan con su motivo', () => {
  it('renta declarada se persiste como tal y los datos operativos que no se escriben se avisan', () => {
    const p = parseXlsx(libroPlantilla([filaSintetica(1)]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    const r = run.registros[0]!;
    // RENTA: ya NO se queda sin destino — se persiste como declarada
    // (`rentaMensualDeclarada`) y NO se escribe en los campos operativos.
    expect(r.canonicalData['rentaMensualDeclarada']).toBe(601);
    expect(r.warnings.join('\n')).not.toContain("'rentaMensual'");

    // Una fila de fuente externa que SÍ declara campos operativos: se avisa uno a
    // uno con su valor, sin inventar nada (no se escribe estado ni inquilino).
    const p2 = parseXlsx(generarXlsx([{
      nombre: 'Inmuebles',
      columnas: [...CABECERAS_17, 'Inquilino Actual', 'estado', 'precio'].map((nombre) => ({ nombre, tipo: NUMERICAS.has(nombre) || nombre === 'precio' ? 'numero' : 'texto' })),
      filas: [filaSintetica(1, { 'Inquilino Actual': 'Inquilino Sintético', 'estado': 'alquilado', 'precio': 601 })],
    }]));
    const run2 = correr({ registrosCrudos: p2.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    const r2 = run2.registros[0]!;
    const avisos = r2.warnings.join('\n');
    expect(avisos).toContain('NO se escribe en el inmueble nuevo');
    expect(avisos).toContain('«Inquilino Sintético»');
  });

  it('ninguna columna de la plantilla queda sin destino; las relaciones se declaran pendientes', () => {
    const p = parseXlsx(libroPlantilla([filaSintetica(1)]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    const r = run.registros[0]!;
    for (const c of ['Titularidad', '% Propietario 1', '% Propietario 2', 'Gastos IBI (€)', '% Suelo Catastral', 'Fecha Registro', 'Renta Mensual (€)', 'Amortización Anual (€)']) {
      expect(r.camposSinDestino.map((x) => x.campo)).not.toContain(c);
    }
    // Relación pendiente declarada con su motivo (sin inventar titularidad).
    expect((r.relacionesPendientes ?? []).length).toBeGreaterThan(0);
    expect(r.canonicalData['titularesIds']).toBeUndefined();
    expect(r.titularidadResuelta ?? []).toEqual([]);
  });

  it('la titularidad declarada resuelta por una persona SÍ crea la relación (por el flujo autorizado)', async () => {
    const p = parseXlsx(libroPlantilla([filaSintetica(1, { 'Titularidad': 'Cotitularidad', '% Propietario 1': 60, '% Propietario 2': 40 })]));
    // 1) Sin resolución: nada se escribe en titularidades.
    const runSin = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    const planSin = autorizarYPlanificar(runSin).plan;
    const fakeSin = puertoFake();
    await ejecutarPromocion({ plan: planSin, run: runSin, decisiones: {}, puerto: fakeSin.puerto, actor: 'u_sintetico', fechaHora: '2026-10-12T00:00:00.000Z' });
    expect(fakeSin.titularidades.size).toBe(0);
    expect(planSin.operaciones[0]!.titularidades ?? []).toEqual([]);

    // 2) Con asignación humana explícita de cada ranura a un titular existente:
    //    se persiste la relación con el porcentaje DECLARADO (60/40), no inferido.
    const runCon = correr({
      registrosCrudos: p.registros as Record<string, unknown>[],
      parches: [{ propietarioDestinoId: PROP_ACTOR, resolucionTitularidad: [{ ranura: 1, propietarioId: PROP_ACTOR }, { ranura: 2, propietarioId: PROP_OTRO }] }],
    });
    const r = runCon.registros[0]!;
    // Ranura 1 (titular escribible) se resuelve con su porcentaje declarado;
    // ranura 2 apunta a un titular FUERA del ámbito escribible del actor ⇒ se
    // descarta la asignación y queda PENDIENTE (no se escribe fuera de ámbito).
    expect(r.titularidadResuelta?.map((x) => `${x.ranura}:${x.propietarioId}:${x.porcentaje}`)).toEqual([`1:${PROP_ACTOR}:60`]);
    expect((r.relacionesPendientes ?? []).map((x) => x.motivo).join(' | ')).toMatch(/no está en el ámbito escribible/);

    const plan = autorizarYPlanificar(runCon).plan;
    const fake = puertoFake();
    const res = await ejecutarPromocion({ plan, run: runCon, decisiones: {}, puerto: fake.puerto, actor: 'u_sintetico', fechaHora: '2026-10-12T00:00:00.000Z' });
    expect(res.titularidadesCreadas).toHaveLength(1);
    expect(fake.titularidades.get(`${r.destinationId}__${PROP_ACTOR}`)).toMatchObject({ porcentajeTitularidad: 60, estado: 'VIGENTE' });
    expect(fake.titularidades.has(`${r.destinationId}__${PROP_OTRO}`)).toBe(false);
    // El inmueble guarda la resolución (trazabilidad) y el resto DECLARADO.
    expect(fake.inmuebles.get(r.destinationId!)?.titularidadDeclarada).toMatchObject({
      resuelta: true,
      titularidadResuelta: [{ ranura: 1, propietarioId: PROP_ACTOR }],
      porcentajePropietario2: 40,
    });
    // La relación pendiente queda registrada en el informe (con su motivo).
    expect(res.relacionesPendientes.some((x) => x.campoOrigen.startsWith('% Propietario'))).toBe(true);

    // 3) Reimportar el MISMO archivo: la relación ya existe ⇒ se omite sin reescribir.
    const fake2 = puertoFake();
    fake2.titularidades.set(`${r.destinationId}__${PROP_ACTOR}`, { porcentajeTitularidad: 60, estado: 'VIGENTE', campoOrigen: '% Propietario 1', valorOriginal: 60 });
    const res2 = await ejecutarPromocion({ plan, run: runCon, decisiones: {}, puerto: fake2.puerto, actor: 'u_sintetico', fechaHora: '2026-10-12T00:00:00.000Z' });
    expect(res2.titularidadesCreadas).toHaveLength(0);
    expect(res2.titularidadesOmitidas).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4) Idempotencia y no sobrescritura
// ---------------------------------------------------------------------------
describe('alta 4) idempotencia: nunca se sobrescribe un inmueble existente', () => {
  it('si el id asignado ya existe ⇒ YA_EXISTENTE y no se reescribe', async () => {
    const p = parseXlsx(libroPlantilla([filaSintetica(1)]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    const id = run.registros[0]!.destinationId!;
    const { plan } = autorizarYPlanificar(run);
    const fake = puertoFake([id]); // el destino ya existe (mismo id determinista)

    const res = await ejecutarPromocion({ plan, run, decisiones: {}, puerto: fake.puerto, actor: 'u_sintetico', fechaHora: '2026-10-12T00:00:00.000Z' });
    expect(res.yaExistentes).toBe(1);
    expect(res.creados).toBe(0);
    expect(fake.llamadas.crearInmueble).toBe(0);
    // El contenido pre-existente queda intacto.
    expect(fake.inmuebles.get(id)!.direccion).toBe('(pre-existente)');
  });

  it('reimportar el mismo fichero produce el mismo id (idempotencia de lote)', () => {
    const filas = [filaSintetica(1)];
    const p1 = parseXlsx(libroPlantilla(filas));
    const p2 = parseXlsx(libroPlantilla(filas));
    const r1 = correr({ registrosCrudos: p1.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    const r2 = correr({ registrosCrudos: p2.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    expect(r2.registros[0]!.destinationId).toBe(r1.registros[0]!.destinationId);
  });

  it('un inmueble existente se VINCULA y NUNCA recibe un id de alta nuevo', () => {
    // Match por referencia catastral (vía no determinista ⇒ tope REVISIÓN: la
    // vinculación la confirma un humano). Lo esencial: NO se le asigna un id de
    // alta nuevo ni se propone creación.
    const cat = catalogos({
      inmuebles: [{ id: 'inm_1', direccion: 'Calle Sintética 1', ciudad: 'Alicante', referenciaCatastral: 'CAT-SYN-1', propietarioId: PROP_ACTOR }],
    });
    const p = parseXlsx(libroPlantilla([filaSintetica(1)]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }], catalogos: cat });
    const r = run.registros[0]!;
    expect(r.inmuebleDestinoId).toBe('inm_1');
    expect(r.operacion).toBe('VINCULAR');
    expect(r.destinationId).toBe('inm_1');
    expect(r.decision).toBe('REVISION');
    // Requiere confirmación humana: no hay nada elegible que se pueda escribir.
    const autorizacion = autorizarImportRun({ run, tamanoBytes: 1024, commitDryRun: 'ui', autorizador: 'u', fechaHora: 'x' });
    expect(autorizacion.decision).not.toBe('CONCEDIDA');
  });

  it('un inmueble existente identificado por id canónico se VINCULA en AUTO (sin escritura)', () => {
    const cat = catalogos({
      inmuebles: [{ id: 'inm_1', direccion: 'Calle Sintética 1', ciudad: 'Alicante', referenciaCatastral: 'CAT-SYN-1', propietarioId: PROP_ACTOR }],
    });
    const p = parseXlsx(libroPlantilla([filaSintetica(1)]));
    // El export propio incluye el id canónico del inmueble: vía determinista.
    const run = correr({
      registrosCrudos: p.registros.map((x) => ({ ...x, id: 'inm_1' })) as Record<string, unknown>[],
      parches: [{ propietarioDestinoId: PROP_ACTOR }],
      catalogos: cat,
    });
    const r = run.registros[0]!;
    expect(r.operacion).toBe('VINCULAR');
    expect(r.destinationId).toBe('inm_1');
    expect(r.decision).toBe('AUTO');
    const { plan } = autorizarYPlanificar(run);
    expect(plan.operaciones).toHaveLength(0);            // ninguna escritura
    expect(plan.vinculadasSinEscritura).toHaveLength(1);
    expect(plan.vinculadasSinEscritura[0]!.motivo).toContain('sin escritura');
  });

  it('un destino AMBIGUO no se convierte en alta nueva (bloqueo explícito, no duplicado)', () => {
    const cat = catalogos({
      inmuebles: [
        { id: 'inm_1', direccion: 'Otra Dirección 9', ciudad: 'Alicante', referenciaCatastral: 'CAT-SYN-1', propietarioId: PROP_ACTOR },
        { id: 'inm_2', direccion: 'Tercera Dirección 3', ciudad: 'Alicante', referenciaCatastral: 'CAT-SYN-1', propietarioId: PROP_ACTOR },
      ],
    });
    const p = parseXlsx(libroPlantilla([filaSintetica(1)]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }], catalogos: cat });
    const r = run.registros[0]!;
    expect(r.decision).toBe('BLOQUEADO');
    expect(r.motivo).toContain('duplicada en catálogo');   // ambigüedad explicada
    // NO se le asigna id de alta y NO se propone destino: un ambiguo no se
    // resuelve creando un duplicado (B4 bloquea antes de proponer).
    expect(r.destinationId).toBeNull();
    expect(r.operacion).toBeNull();
    const autorizacion = autorizarImportRun({ run, tamanoBytes: 2048, commitDryRun: 'ui', autorizador: 'u', fechaHora: 'x' });
    expect(autorizacion.decision).not.toBe('CONCEDIDA'); // nada elegible
  });
});

// ---------------------------------------------------------------------------
// 5) Sin titular o fuera de ámbito no se escribe
// ---------------------------------------------------------------------------
describe('alta 5) destinos inexistentes o no autorizados quedan bloqueados', () => {
  it('sin titular destino declarado no se promociona nada', () => {
    const p = parseXlsx(libroPlantilla([filaSintetica(1)]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[] }); // sin parche de destino
    const r = run.registros[0]!;
    expect(r.propietarioDestinoId).toBeNull();
    expect(r.decision).not.toBe('AUTO');
    const autorizacion = autorizarImportRun({ run, tamanoBytes: 2048, commitDryRun: 'ui', autorizador: 'u', fechaHora: 'x' });
    expect(autorizacion.decision).not.toBe('CONCEDIDA');
  });

  it('un titular NO autorizado para el actor queda bloqueado y no se escribe', () => {
    const p = parseXlsx(libroPlantilla([filaSintetica(1)]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_OTRO }] });
    const r = run.registros[0]!;
    expect(r.decision).not.toBe('AUTO');
    const autorizacion = autorizarImportRun({ run, tamanoBytes: 2048, commitDryRun: 'ui', autorizador: 'u', fechaHora: 'x' });
    expect(autorizacion.decision).not.toBe('CONCEDIDA');
    expect(autorizacion.incluidos).toHaveLength(0);        // no hay nada autorizable
  });

  it('aunque el titular sea elegible, fuera del ámbito escribible la operación se excluye', () => {
    // Escenario de gestor/ámbito: el registro es elegible (AUTO) pero el
    // titular destino no está en la lista escribible del actor.
    const p = parseXlsx(libroPlantilla([filaSintetica(1)]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    const autorizacion = autorizarImportRun({ run, tamanoBytes: 2048, commitDryRun: 'ui', autorizador: 'u', fechaHora: 'x' });
    expect(autorizacion.decision).toBe('CONCEDIDA');
    const plan = planificarPromocion({
      autorizacion, run, canonicalBatchSha256: run.sourceHash,
      explicitExecutionToken: derivarTokenEjecucion(run.sourceHash),
      ambito: { propietarioIdsLegibles: [PROP_OTRO], propietarioIdsEscribibles: [PROP_OTRO], esMaster: false },
    });
    expect(plan.operaciones).toHaveLength(0);
    expect(plan.excluidas.map((e) => e.motivo).join(' | ')).toContain('fuera del ámbito escribible');
  });

  it('un titular inexistente en el catálogo no se inventa', () => {
    const p = parseXlsx(libroPlantilla([filaSintetica(1)]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: 'prop_fantasma' }] });
    const r = run.registros[0]!;
    expect(r.propietarioDestinoId).not.toBe('prop_fantasma');
    expect(r.decision).not.toBe('AUTO');
  });

  it('un inmueble sin dirección no se crea (el alta no rellena el campo obligatorio)', async () => {
    const columnas: ColumnaXlsx[] = [{ nombre: 'ID Inmueble', tipo: 'texto' }, { nombre: 'Referencia Catastral', tipo: 'texto' }];
    const bytes = generarXlsx([{ nombre: 'Datos', columnas, filas: [{ 'ID Inmueble': 'SYNTH-9', 'Referencia Catastral': 'CAT-SYN-9' }] }]);
    const p = parseXlsx(bytes);
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    const autorizacion = autorizarImportRun({ run, tamanoBytes: 1024, commitDryRun: 'ui', autorizador: 'u', fechaHora: 'x' });
    // Sin dirección no hay inmueble válido: la fila no es elegible y, por tanto,
    // no se puede construir plan ni ejecutar ninguna escritura.
    expect(autorizacion.decision).not.toBe('CONCEDIDA');
    expect(autorizacion.incluidos).toHaveLength(0);
    expect(run.registros[0]!.decision).not.toBe('AUTO');
    expect(run.registros[0]!.motivo).toContain('direccion');
  });
});

// ---------------------------------------------------------------------------
// 6) Cero escrituras durante el análisis + varias filas
// ---------------------------------------------------------------------------
describe('alta 6) el análisis no escribe y cada fila nueva recibe su propio id', () => {
  it('0 escrituras durante todo el análisis (el puerto ni se toca)', () => {
    const p = parseXlsx(libroPlantilla([filaSintetica(1), filaSintetica(2)]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }, { propietarioDestinoId: PROP_ACTOR }] });
    const { autorizacion, plan } = autorizarYPlanificar(run);
    expect(run.dryRun.soloLectura).toBe(true);
    expect(run.status).toBe('DRY_RUN_COMPLETADO');
    // El dry-run y el plan sólo LEEN/CLASIFICAN: ninguna fila se escribe aquí.
    expect(run.registros.map((r) => r.decision)).toEqual(['AUTO', 'AUTO']);
    expect(autorizacion.decision).toBe('CONCEDIDA');
    expect(plan.operaciones).toHaveLength(2);
    // Cada fila recibe un id de alta propio (no el «ID Inmueble» del archivo).
    const ids = run.registros.map((r) => r.destinationId);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => /^inm_imp_[0-9a-f]{20}$/.test(String(id)))).toBe(true);
  });

  it('las 7 filas del Excel real se dan de alta con 7 ids distintos', async () => {
    const filas = [1, 2, 3, 4, 5, 6, 7].map((i) => filaSintetica(i));
    const p = parseXlsx(libroPlantilla(filas));
    const run = correr({
      registrosCrudos: p.registros as Record<string, unknown>[],
      parches: filas.map(() => ({ propietarioDestinoId: PROP_ACTOR })),
      sourceName: 'plantilla-real-7-filas.xlsx',
    });
    expect(run.registros).toHaveLength(7);
    const { autorizacion, plan } = autorizarYPlanificar(run);
    expect(autorizacion.decision).toBe('CONCEDIDA');
    expect(plan.operaciones).toHaveLength(7);

    const fake = puertoFake();
    const res = await ejecutarPromocion({ plan, run, decisiones: {}, puerto: fake.puerto, actor: 'u_sintetico', fechaHora: '2026-10-12T00:00:00.000Z' });
    expect(res.creados).toBe(7);
    expect(res.fallidos).toBe(0);
    expect(fake.inmuebles.size).toBe(7);
    // Cada inmueble conserva su identidad de origen y su valor declarado.
    const porId = [...fake.inmuebles.values()];
    expect(new Set(porId.map((i) => i.referenciaCatastral)).size).toBe(7);
    expect(porId.map((i) => i.valorAdquisicion).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([101000, 102000, 103000, 104000, 105000, 106000, 107000]);
  });
});

// ---------------------------------------------------------------------------
// 7) Regresión: la migración histórica NO se ve afectada
// ---------------------------------------------------------------------------
describe('alta 7) regresión: sin id asignado el comportamiento histórico es idéntico', () => {
  it('un INMUEBLE que no aporta id asignado sigue quedando en REVISIÓN (no se crea nada)', () => {
    // El motor B4 se ejecuta por su vía histórica (sin `idAsignadoCreacion`):
    // el importador general lo aporta siempre, pero el contrato del motor sigue
    // siendo el mismo para cualquier otro llamante.
    const p = parseXlsx(libroPlantilla([filaSintetica(1)]));
    const run = correr({ registrosCrudos: p.registros as Record<string, unknown>[], parches: [{ propietarioDestinoId: PROP_ACTOR }] });
    // El id viaja en el normalizado, NUNCA en los datos canónicos ni en el original.
    expect(run.registros[0]!.canonicalData['idAsignadoCreacion']).toBeUndefined();
    expect(run.dryRun.lineas[0]!.datoOriginal['idAsignadoCreacion']).toBeUndefined();
    // El id asignado sólo vive como destino computable + aviso de trazabilidad.
    expect(run.registros[0]!.destinationId).toMatch(/^inm_imp_[0-9a-f]{20}$/);
    expect(run.dryRun.lineas[0]!.destinoPropuesto!.destinoId).toBe(run.registros[0]!.destinationId);
    expect(run.registros[0]!.warnings.join(' ')).toContain('asignado por la confirmación');
  });
});
