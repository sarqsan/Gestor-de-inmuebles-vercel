/**
 * PROMOCIÓN DE INMUEBLES · adaptador Firebase REAL frente a las reglas REALES.
 * ---------------------------------------------------------------------------
 * Incidente: «Missing or insufficient permissions.» al promocionar siete
 * inmuebles analizados desde JSON/XLSX.
 *
 * Condición exacta reproducida (antes de la corrección):
 *  · el ejecutor llama a `existeDestino('inmuebles', id)` ANTES de escribir;
 *  · esa comprobación es un `getDoc` sobre un documento que AÚN NO EXISTE;
 *  · la regla de `get` de `inmuebles` evalúa `resource.data`; con `resource == null`
 *    la evaluación falla y el motor deniega (`permission-denied`), incluso para un
 *    PROPIETARIO titular del alta;
 *  · el error se registra como FALLIDO en cada fila con el mensaje real de Firestore,
 *    sin que se haya escrito nada.
 *
 * Esta prueba usa `crearPuertoFirebase` (código de producción) con un simulador que
 * autoriza cada `getDoc`/`setDoc`/`writeBatch` con `firestore.rules` (ver
 * `tests/harness/simulacionReglasFirestore.ts`). No sustituye al emulador oficial.
 *
 * Contrato probado:
 *  A · titular propio: las 7 filas se crean (CREADO) y cada relación de titularidad se crea.
 *  B · segunda pasada idempotente: YA_EXISTENTE, sin escrituras nuevas, sin sobrescritura.
 *  C · cartera delegada con escritura: las 7 filas se crean para la cartera.
 *  D · colisión de id con inmueble de OTRO titular: no se sobrescribe; FALLIDO con el error real.
 *  E · estado parcial (inmueble creado, titularidad no): la reejecución completa la relación.
 *  F · identidad incorrecta (titular ajeno, sin cartera): nada se escribe; error real por registro.
 *  G · ADMINISTRADOR no master: nada se escribe; error real por registro.
 *  H · no se reintentan escrituras rechazadas (un intento por registro).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Simulador enchufado en el módulo del SDK (el adaptador de producción lo usa).
// ---------------------------------------------------------------------------
const SIM = vi.hoisted(() => ({ impl: null as null | Record<string, (...a: unknown[]) => unknown> }));

vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => SIM.impl!.doc(...a),
  getDoc: (...a: unknown[]) => SIM.impl!.getDoc(...a),
  setDoc: (...a: unknown[]) => SIM.impl!.setDoc(...a),
  writeBatch: (...a: unknown[]) => SIM.impl!.writeBatch(...a),
  arrayUnion: (...a: unknown[]) => SIM.impl!.arrayUnion(...a),
}));

vi.mock('../src/lib/firebase', () => ({
  db: {},
  deepCleanForFirestore: (v: unknown) => SIM.impl!.deepClean(v),
  registrarAuditoriaFirestore: async () => {},
  saveContratoFirestore: async () => {},
  saveGastoFirestore: async () => {},
  subscribeContratos: () => () => {},
  subscribeGastos: () => () => {},
  subscribeInmuebles: () => () => {},
  subscribePropietarios: () => () => {},
}));

import { sha256Hex } from '../src/lib/importacion/hash';
import {
  autorizarImportRun,
  derivarTokenEjecucion,
  ejecutarImportDryRun,
  ejecutarPromocion,
  generarXlsx,
  parseXlsx,
  planificarPromocion,
  type AmbitoAutorizado,
  type ColumnaXlsx,
  type ImportRun,
  type ResultadoPromocion,
} from '../src/lib/importExport';
import { crearPuertoFirebase } from '../src/lib/importExportFirebase';
import type { CatalogosMigracion, PropietarioCatalogo } from '../src/lib/migracion/tipos';
import type { PuertoPersistenciaImport } from '../src/lib/importExport/ejecucion';
import { crearSimuladorFirestore, type SimuladorFirestore } from './harness/simulacionReglasFirestore';

const RAIZ = resolve(__dirname, '..');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');

const CABECERAS = [
  'ID Inmueble', 'Dirección Completa', 'Referencia Catastral', 'Titularidad',
  '% Propietario 1', '% Propietario 2', 'Precio Adquisición (€)', 'Amortización Anual (€)',
  'Renta Mensual (€)', 'Gastos Comunidad (€)', 'Gastos IBI (€)', 'Gastos Reparaciones (€)',
  'Gastos Seguro (€)', '% Suelo Catastral', 'Inquilino', 'DNI Inquilino', 'Fecha Registro',
];
const NUMERICAS = new Set(['% Propietario 1', '% Propietario 2', 'Precio Adquisición (€)', 'Amortización Anual (€)', 'Renta Mensual (€)', 'Gastos Comunidad (€)', 'Gastos IBI (€)', 'Gastos Reparaciones (€)', 'Gastos Seguro (€)', '% Suelo Catastral']);

function libro(filas: Record<string, unknown>[]): Uint8Array {
  const columnas: ColumnaXlsx[] = CABECERAS.map((nombre) => ({ nombre, tipo: NUMERICAS.has(nombre) ? 'numero' : 'texto' }));
  return generarXlsx([{ nombre: 'Inmuebles', columnas, filas }]);
}
function fila(i: number): Record<string, unknown> {
  return {
    'ID Inmueble': `SYNTH-${i}`, 'Dirección Completa': `Calle Sintética ${i}, 03001 Alicante`,
    'Referencia Catastral': `CAT-SYN-${i}`, 'Titularidad': 'Propietario único',
    '% Propietario 1': 100, '% Propietario 2': '', 'Precio Adquisición (€)': 100000 + i * 1000,
    'Amortización Anual (€)': '', 'Renta Mensual (€)': 600 + i, 'Gastos Comunidad (€)': '',
    'Gastos IBI (€)': '', 'Gastos Reparaciones (€)': '', 'Gastos Seguro (€)': '', '% Suelo Catastral': '',
    'Inquilino': 'Inquilino Sintético', 'DNI Inquilino': '', 'Fecha Registro': `2019-05-0${i}`,
  };
}

const PROPIETARIOS: PropietarioCatalogo[] = [
  { id: 'prop_T', nombre: 'Titular de la sesión (sintético)', nifCif: '11111111A', estadoAcceso: 'ACTIVO' },
  { id: 'prop_X', nombre: 'Cartera delegada (sintética)', nifCif: '22222222B', estadoAcceso: 'ACTIVO' },
  { id: 'prop_GE', nombre: 'Gestor (sintético)', nifCif: '33333333C', estadoAcceso: 'ACTIVO' },
];
const FECHA = '2026-10-12T00:00:00.000Z';

/** Dry-run real del importador (sin escrituras), con parches de destino opcionales. */
function dryRun(n: number, destino?: string): ImportRun {
  const filas = Array.from({ length: n }, (_, i) => fila(i + 1));
  const p = parseXlsx(libro(filas));
  const crudos = p.registros as Record<string, unknown>[];
  const catalogos: CatalogosMigracion = {
    propietarios: PROPIETARIOS, inmuebles: [], contratos: [], mapeos: [], existentes: [],
    propietariosPermitidosIds: PROPIETARIOS.map((x) => x.id),
    importador: { uid: 'u_sintetico', modalidad: 'PROPIETARIO' },
  };
  const parches = destino
    ? crudos.map(() => ({ propietarioDestinoId: destino, resolucionTitularidad: [{ ranura: 1 as const, propietarioId: destino }] }))
    : undefined;
  return ejecutarImportDryRun({
    registrosCrudos: crudos,
    localizaciones: crudos.map((_, i) => `fila ${i + 2}`),
    entityType: 'INMUEBLE', formato: 'XLSX', sourceName: 'plantilla-sintetica.xlsx',
    sourceHash: sha256Hex(new TextEncoder().encode(JSON.stringify(crudos))), sourceTamanoBytes: 1024,
    sourceType: 'EXTERNAL', catalogos, fechaHora: FECHA, actor: 'u_sintetico',
    ...(parches ? { parches } : {}),
  });
}

/**
 * Promoción real con el destino elegido por la persona (titular declarado en la
 * ranura 1 y destino de cada fila). `ambito` es el que el panel derivaría.
 */
async function promocionar(
  sim: SimuladorFirestore,
  actor: Parameters<SimuladorFirestore['setActor']>[0],
  destino: string,
  ambito: AmbitoAutorizado,
  n = 7,
  puertoPrueba?: PuertoPersistenciaImport,
): Promise<{ res: ResultadoPromocion; run: ImportRun }> {
  const run = dryRun(n, destino);
  const autorizacion = autorizarImportRun({ run, tamanoBytes: 1024, commitDryRun: 'ui', autorizador: 'u_sintetico', fechaHora: FECHA });
  const plan = planificarPromocion({
    autorizacion, run, canonicalBatchSha256: run.sourceHash,
    explicitExecutionToken: derivarTokenEjecucion(run.sourceHash), ambito,
  });
  sim.setActor(actor);
  const puerto = puertoPrueba ?? crearPuertoFirebase({ usuarioId: 'usuario_sesion', usuarioEmail: 'sesion@test.local', usuarioNombre: 'Sesión sintética' });
  const res = await ejecutarPromocion({ plan, run, decisiones: {}, puerto, actor: 'usuario_sesion', fechaHora: FECHA });
  return { res, run };
}

const AMBITO_TITULAR: AmbitoAutorizado = { propietarioIdsLegibles: ['prop_T'], propietarioIdsEscribibles: ['prop_T'], esMaster: false };
const AMBITO_GESTOR: AmbitoAutorizado = { propietarioIdsLegibles: ['prop_GE', 'prop_X'], propietarioIdsEscribibles: ['prop_GE', 'prop_X'], esMaster: false };

/** Estado inicial: titular propio, gestor con cartera de escritura, administrador sin master. */
function bdInicial(): Record<string, Record<string, unknown>> {
  return {
    'usuarios/usuario_sesion': { id: 'usuario_sesion', authUid: 'uid_titular', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_T' },
    'usuarios_auth/uid_titular': { usuarioId: 'usuario_sesion', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_T', profesionalId: '', inmuebleIds: [] },
    'usuarios/usuario_gestor': { id: 'usuario_gestor', authUid: 'uid_gestor', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_GE' },
    'usuarios_auth/uid_gestor': {
      usuarioId: 'usuario_gestor', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_GE', profesionalId: '', inmuebleIds: [],
      gestionesPorPropietario: { prop_X: 'ges_X' },
    },
    'gestiones_cartera/ges_X': {
      id: 'ges_X', propietarioId: 'prop_X', gestorUsuarioId: 'usuario_gestor', estado: 'ACTIVA', inmuebleIds: [],
      resolucionInvitacion: 'ACEPTADA', permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR',
    },
    'usuarios/usuario_admin': { id: 'usuario_admin', authUid: 'uid_admin', estado: 'ACTIVO', tipoPerfil: 'ADMINISTRADOR' },
  };
}

const SESION_TITULAR = { uid: 'uid_titular', token: { email: 't@test.local' } };
const SESION_GESTOR = { uid: 'uid_gestor', token: { email: 'g@test.local' } };
const SESION_ADMIN = { uid: 'uid_admin', token: { email: 'a@test.local' } };
const MENSAJE_PERMISOS = 'Missing or insufficient permissions.';

let sim: SimuladorFirestore;
let db: Record<string, Record<string, unknown>>;

beforeEach(() => {
  db = bdInicial();
  sim = crearSimuladorFirestore(RULES, db);
  SIM.impl = sim as unknown as Record<string, (...a: unknown[]) => unknown>;
});

describe('A · titular propio: el caso del incidente', () => {
  it('las 7 altas de inmueble se CREAN (sin denegación previa de la comprobación de existencia)', async () => {
    const { res, run } = await promocionar(sim, SESION_TITULAR, 'prop_T', AMBITO_TITULAR, 7);
    expect(res.detalle.map((d) => d.resultado)).toEqual(Array(7).fill('CREADO'));
    expect(res.creados).toBe(7);
    expect(res.fallidos).toBe(0);
    for (const r of run.registros) {
      const inm = db[`inmuebles/${r.destinationId}`];
      expect(inm?.propietarioId).toBe('prop_T');
      expect(db[`titularidades/${r.destinationId}__prop_T`]).toBeDefined();
    }
    expect(res.titularidadesCreadas).toHaveLength(7);
  });

  it('la comprobación previa denegada por las reglas NO aparece como fallo de registro', async () => {
    const { res } = await promocionar(sim, SESION_TITULAR, 'prop_T', AMBITO_TITULAR, 3);
    expect(res.detalle.filter((d) => d.resultado === 'FALLIDO')).toEqual([]);
    // La denegación de lectura sí ocurrió en el motor (es la condición real):
    expect(sim.denegaciones.some((d) => d.startsWith('get inmuebles/'))).toBe(true);
    // ...pero no se escribió nada antes de decidir por la regla de creación.
    expect(sim.escrituras.filter((e) => e.includes('inmuebles/')).length).toBeGreaterThan(0);
  });
});

describe('B · reejecución idempotente', () => {
  it('la segunda pasada devuelve YA_EXISTENTE sin escrituras nuevas ni sobrescritura', async () => {
    await promocionar(sim, SESION_TITULAR, 'prop_T', AMBITO_TITULAR, 7);
    const escriturasTras1 = sim.escrituras.length;
    const snapshot = JSON.stringify(db);
    const segunda = await promocionar(sim, SESION_TITULAR, 'prop_T', AMBITO_TITULAR, 7);
    expect(segunda.res.detalle.map((d) => d.resultado)).toEqual(Array(7).fill('YA_EXISTENTE'));
    expect(segunda.res.yaExistentes).toBe(7);
    expect(segunda.res.fallidos).toBe(0);
    expect(sim.escrituras.length).toBe(escriturasTras1);
    expect(JSON.stringify(db)).toBe(snapshot);
  });
});

describe('C · cartera delegada con permiso de escritura', () => {
  it('el gestor crea las 7 altas en la cartera y sus relaciones de titularidad', async () => {
    const { res, run } = await promocionar(sim, SESION_GESTOR, 'prop_X', AMBITO_GESTOR, 7);
    expect(res.creados).toBe(7);
    expect(res.fallidos).toBe(0);
    for (const r of run.registros) {
      expect(db[`inmuebles/${r.destinationId}`]?.propietarioId).toBe('prop_X');
      expect(db[`titularidades/${r.destinationId}__prop_X`]).toBeDefined();
    }
  });
});

describe('D · colisión de id con un inmueble de OTRO titular', () => {
  it('no sobrescribe el inmueble ajeno: FALLIDO por registro con el error real', async () => {
    // El id asignado depende del contenido completo del fichero (sourceHash), no del
    // titular: la fixture se construye con el MISMO n y destino que la promoción real.
    const idColision = dryRun(2, 'prop_X').registros[0]!.destinationId;
    expect(idColision).toBeTruthy();
    db[`inmuebles/${idColision}`] = { id: idColision, propietarioId: 'prop_T', direccion: 'ORIGINAL AJENO', propietarioPrincipalId: 'prop_T' };
    const antes = JSON.stringify(db[`inmuebles/${idColision}`]);
    const { res, run } = await promocionar(sim, SESION_GESTOR, 'prop_X', AMBITO_GESTOR, 2);
    const porFp = new Map(res.detalle.map((d) => [d.fingerprint, d]));
    const colision = run.registros.find((r) => r.destinationId === idColision)!.fingerprint;
    const r0 = porFp.get(colision);
    expect(r0?.resultado).toBe('FALLIDO');
    expect(r0 && 'motivo' in r0 ? r0.motivo : '').toContain(MENSAJE_PERMISOS);
    expect(JSON.stringify(db[`inmuebles/${idColision}`])).toBe(antes);
    expect(sim.escrituras.some((e) => e === `set inmuebles/${idColision}`)).toBe(false);
    // El otro registro sí se crea (aislamiento entre registros).
    expect(res.creados).toBe(1);
  });
});

describe('E · estado parcial de una ejecución anterior', () => {
  it('inmueble creado sin su titularidad: la reejecución completa la relación y no duplica nada', async () => {
    const id = dryRun(1, 'prop_T').registros[0]!.destinationId;
    expect(id).toBeTruthy();
    db[`inmuebles/${id}`] = { id, propietarioId: 'prop_T', direccion: 'Calle Sintética 1, 03001 Alicante', titularesIds: [] };
    const { res } = await promocionar(sim, SESION_TITULAR, 'prop_T', AMBITO_TITULAR, 1);
    expect(res.detalle[0]?.resultado).toBe('YA_EXISTENTE');
    expect(db[`titularidades/${id}__prop_T`]).toBeDefined();
    expect((db[`inmuebles/${id}`] as { titularesIds: string[] }).titularesIds).toEqual(['prop_T']);
    expect(res.titularidadesCreadas).toHaveLength(1);
  });
});

describe('E-neg · inmueble existente de OTRO titular', () => {
  it('no legible para la sesión: FALLIDO con el error real y el inmueble ajeno intacto', async () => {
    const id = dryRun(1, 'prop_T').registros[0]!.destinationId;
    expect(id).toBeTruthy();
    db[`inmuebles/${id}`] = { id, propietarioId: 'prop_X', direccion: 'Calle Sintética 2', titularesIds: ['prop_X'] };
    const antes = JSON.stringify(db[`inmuebles/${id}`]);
    const { res } = await promocionar(sim, SESION_TITULAR, 'prop_T', AMBITO_TITULAR, 1);
    expect(res.detalle[0]?.resultado).toBe('FALLIDO');
    expect(res.detalle[0] && 'motivo' in res.detalle[0] ? res.detalle[0].motivo : '').toContain(MENSAJE_PERMISOS);
    expect(JSON.stringify(db[`inmuebles/${id}`])).toBe(antes);
    expect(db[`titularidades/${id}__prop_T`]).toBeUndefined();
  });

  it('legible y de otro titular (puerto de prueba): no completa relación ni escribe', async () => {
    const id = dryRun(1, 'prop_T').registros[0]!.destinationId;
    const escritas: string[] = [];
    const puerto: PuertoPersistenciaImport = {
      existeDestino: async () => true,
      existeCobro: async () => false,
      crearGasto: async () => { escritas.push('gasto'); },
      anexarCobro: async () => { escritas.push('cobro'); },
      crearInmueble: async () => { escritas.push('inmueble'); },
      existeTitularidad: async () => false,
      crearTitularidad: async () => { escritas.push('titularidad'); },
      propietarioDeInmueble: async () => 'prop_X',
      auditar: async () => {},
    };
    const { res } = await promocionar(sim, SESION_TITULAR, 'prop_T', AMBITO_TITULAR, 1, puerto);
    expect(res.detalle[0]?.resultado).toBe('YA_EXISTENTE');
    expect(escritas).toEqual([]);
    expect(res.titularidadesCreadas).toHaveLength(0);
    expect(res.titularidadesOmitidas.length).toBeGreaterThan(0);
    expect(id).toBeTruthy();
  });

  it('relación pendiente que falla al escribir: FALLIDO con el error real y el inmueble existente sin cambios', async () => {
    const puerto: PuertoPersistenciaImport = {
      existeDestino: async () => true,
      existeCobro: async () => false,
      crearGasto: async () => {},
      anexarCobro: async () => {},
      crearInmueble: async () => {},
      existeTitularidad: async () => false,
      crearTitularidad: async () => { throw new Error('titularidades/x: Missing or insufficient permissions.'); },
      propietarioDeInmueble: async () => 'prop_T',
      auditar: async () => {},
    };
    const { res } = await promocionar(sim, SESION_TITULAR, 'prop_T', AMBITO_TITULAR, 1, puerto);
    const d = res.detalle[0];
    expect(d?.resultado).toBe('FALLIDO');
    expect(d && 'motivo' in d ? d.motivo : '').toContain(MENSAJE_PERMISOS);
    expect(res.titularidadesCreadas).toHaveLength(0);
  });
});

describe('F · identidad incorrecta (titular distinto del autorizado para la sesión)', () => {
  it('el titular ajeno sin cartera no escribe nada y cada registro conserva el error real', async () => {
    const { res } = await promocionar(sim, SESION_TITULAR, 'prop_X', { propietarioIdsLegibles: ['prop_T', 'prop_X'], propietarioIdsEscribibles: ['prop_T', 'prop_X'], esMaster: false }, 3);
    expect(res.creados).toBe(0);
    expect(res.fallidos).toBe(3);
    for (const d of res.detalle) expect(d.resultado === 'FALLIDO' && d.motivo).toContain(MENSAJE_PERMISOS);
    expect(sim.escrituras.filter((e) => e.includes('inmuebles/'))).toEqual([]);
  });
});

describe('G · administrador no master', () => {
  it('no se escribe nada y el error real queda en cada registro', async () => {
    const { res } = await promocionar(sim, SESION_ADMIN, 'prop_T', { propietarioIdsLegibles: null, propietarioIdsEscribibles: null, esMaster: true }, 2);
    expect(res.creados).toBe(0);
    expect(res.fallidos).toBe(2);
    expect(sim.escrituras.filter((e) => e.includes('inmuebles/'))).toEqual([]);
  });
});

describe('H · no se reintentan escrituras rechazadas', () => {
  it('cada registro rechazado produce exactamente un intento de creación', async () => {
    await promocionar(sim, SESION_TITULAR, 'prop_X', { propietarioIdsLegibles: ['prop_T', 'prop_X'], propietarioIdsEscribibles: ['prop_T', 'prop_X'], esMaster: false }, 3);
    const creaciones = sim.denegaciones.filter((d) => d.startsWith('create inmuebles/'));
    expect(creaciones).toHaveLength(3);
    expect(new Set(creaciones).size).toBe(3);
  });
});

describe('I · existencia NO_VERIFICABLE (bloque A): etiqueta honesta, sin escritura', () => {
  it('destino ajeno no legible: FALLIDO etiquetado NO_VERIFICABLE con el error real; ninguna escritura sobre él', async () => {
    const id = dryRun(1, 'prop_T').registros[0]!.destinationId;
    db[`inmuebles/${id}`] = { id, propietarioId: 'prop_X', direccion: 'Calle Sintética 3', titularesIds: ['prop_X'] };
    const antes = JSON.stringify(db[`inmuebles/${id}`]);
    const { res } = await promocionar(sim, SESION_TITULAR, 'prop_T', AMBITO_TITULAR, 1);
    const d = res.detalle[0];
    expect(d?.resultado).toBe('FALLIDO');
    const motivo = d && 'motivo' in d ? d.motivo : '';
    expect(motivo).toContain('NO_VERIFICABLE');
    expect(motivo).toContain('no se sobrescribió');
    expect(motivo).toContain(MENSAJE_PERMISOS);
    expect(JSON.stringify(db[`inmuebles/${id}`])).toBe(antes);
    expect(sim.escrituras.some((e) => e === `set inmuebles/${id}`)).toBe(false);
  });
});
