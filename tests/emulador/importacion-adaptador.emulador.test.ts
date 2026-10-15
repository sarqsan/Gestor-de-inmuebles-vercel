/**
 * IMPORTACIÓN DE INMUEBLES EXTREMO A EXTREMO contra el EMULADOR OFICIAL (Auth + Firestore).
 * -----------------------------------------------------------------------------
 * Ejecuta el adaptador de PRODUCCIÓN (`crearPuertoFirebase`) y el ejecutor real
 * (`ejecutarPromocion`) sobre el motor real de reglas de `firestore.rules`. Cada
 * identidad inicia sesión en el Auth emulator y usa su propio cliente de Firestore.
 *
 * Aislamiento: `src/lib/firebase.ts` se sustituye sólo en `db`/`auth` (apuntan al
 * emulador) y en las funciones que escriben fuera de `inmuebles` (auditoría, gastos,
 * contratos), que se registran o se rechazan. Ninguna escritura llega a la base real.
 *
 * Ejecución (CI): npm run test:emulador:reglas (arranca auth + firestore).
 * Sin FIRESTORE_EMULATOR_HOST o FIREBASE_AUTH_EMULATOR_HOST la suite FALLA.
 * Datos: sintéticos (`*.invalid`, identificadores ficticios).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
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
} from '../../src/lib/importExport';
import { sha256Hex } from '../../src/lib/importacion/hash';
import { crearPuertoFirebase } from '../../src/lib/importExportFirebase';
import type { CatalogosMigracion, PropietarioCatalogo } from '../../src/lib/migracion/tipos';

// ---------------------------------------------------------------------------
// Sustitución controlada del módulo de Firebase de la app (sólo para esta prueba).
// ---------------------------------------------------------------------------
const estado = vi.hoisted(() => ({
  db: null as unknown,
  auth: null as unknown,
  auditorias: [] as unknown[],
}));

vi.mock('../../src/lib/firebase', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    get db() { return estado.db; },
    get auth() { return estado.auth; },
    registrarAuditoriaFirestore: async (evento: unknown) => { estado.auditorias.push(evento); },
    saveContratoFirestore: async () => { throw new Error('no usado por la importación de inmuebles'); },
    saveGastoFirestore: async () => { throw new Error('no usado por la importación de inmuebles'); },
  };
});

const PROYECTO = 'demo-gestor-importacion';
const AUTH_URL = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`;
const [FS_HOST, FS_PUERTO] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const CLAVE_SINTETICA = 'Solo-emulador-42!';
const FECHA = '2026-10-12T00:00:00.000Z';

type Doc = Record<string, unknown>;

interface Sesion {
  readonly usuarioId: string;
  readonly email: string;
  readonly uid: string;
  readonly db: Firestore;
  readonly auth: Auth;
}

const IDENTIDADES = {
  titularT: { usuarioId: 'usr_t', email: 'titular-t@sintetico.invalid', propietarioId: 'prop_t' },
  gestorG: { usuarioId: 'usr_g', email: 'gestor-g@sintetico.invalid', propietarioId: 'prop_g' },
  lectorL: { usuarioId: 'usr_l', email: 'lector-l@sintetico.invalid', propietarioId: 'prop_l' },
  titularB: { usuarioId: 'usr_b', email: 'titular-b@sintetico.invalid', propietarioId: 'prop_b' },
} as const;

let env: RulesTestEnvironment;
const uids = new Map<string, string>();
let contador = 0;

function nuevaSesion(email: string, crear: boolean): Promise<Sesion & { uid: string }> {
  const app = initializeApp(
    { projectId: PROYECTO, apiKey: 'clave-emulador-sintetica', authDomain: `${PROYECTO}.invalid` },
    `sesion-${++contador}`,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, AUTH_URL, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, FS_HOST, Number(FS_PUERTO));
  const acceso = crear
    ? createUserWithEmailAndPassword(auth, email, CLAVE_SINTETICA)
    : signInWithEmailAndPassword(auth, email, CLAVE_SINTETICA);
  return acceso.then((cred) => ({ usuarioId: '', email, uid: cred.user.uid, db, auth }));
}

/** Sesión de una identidad sintética (la misma instancia del SDK mientras dure la prueba). */
async function sesionDe(clave: keyof typeof IDENTIDADES): Promise<Sesion> {
  const id = IDENTIDADES[clave];
  const base = await nuevaSesion(id.email, false);
  return { ...base, usuarioId: id.usuarioId };
}

/** Lectura INDEPENDIENTE: sesión nueva (sin caché de la instancia que escribió). */
async function leerComo(clave: keyof typeof IDENTIDADES, ruta: string): Promise<Doc | undefined> {
  const s = await sesionDe(clave);
  const snap = await getDoc(doc(s.db, ruta));
  return snap.exists() ? (snap.data() as Doc) : undefined;
}

/** Estado persistido real (lectura administrativa del emulador; sólo para verificar). */
async function leerAdmin(ruta: string): Promise<Doc | undefined> {
  let salida: Doc | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx.firestore().doc(ruta).get();
    salida = snap.exists ? (snap.data() as Doc) : undefined;
  });
  return salida;
}

async function escribirAdmin(datos: Record<string, Doc>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [ruta, valor] of Object.entries(datos)) await db.doc(ruta).set(valor);
  });
}

/** Identidades, perfiles y carteras sintéticas (espejo `usuarios_auth` ↔ `usuarios`). */
function baseIdentidades(): Record<string, Doc> {
  const perfil = (uid: string, id: (typeof IDENTIDADES)[keyof typeof IDENTIDADES], extra: Doc = {}) => ({
    [`usuarios/${id.usuarioId}`]: { id: id.usuarioId, authUid: uid, estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', propietarioId: id.propietarioId },
    [`usuarios_auth/${uid}`]: {
      usuarioId: id.usuarioId, tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: id.propietarioId,
      profesionalId: '', inmuebleIds: [], ...extra,
    },
  });
  const gestion = (id: string, propietarioId: string, gestorUsuarioId: string, permiso: string): Doc => ({
    id, propietarioId, gestorUsuarioId, estado: 'ACTIVA', inmuebleIds: [],
    resolucionInvitacion: 'ACEPTADA', permiso, responsableActual: 'GESTOR',
  });
  return {
    ...perfil(uids.get('titularT')!, IDENTIDADES.titularT),
    ...perfil(uids.get('gestorG')!, IDENTIDADES.gestorG, { gestionesPorPropietario: { prop_x: 'ges_x' } }),
    ...perfil(uids.get('lectorL')!, IDENTIDADES.lectorL, { gestionesPorPropietario: { prop_r: 'ges_r' } }),
    ...perfil(uids.get('titularB')!, IDENTIDADES.titularB),
    'gestiones_cartera/ges_x': gestion('ges_x', 'prop_x', 'usr_g', 'LECTURA_ESCRITURA'),
    'gestiones_cartera/ges_r': gestion('ges_r', 'prop_r', 'usr_l', 'LECTURA'),
  };
}

beforeAll(async () => {
  // `emulators:exec` exporta FIRESTORE_EMULATOR_HOST. El Auth emulator usa su puerto por
  // defecto (9099) salvo que el entorno lo indique; si no está levantado, la creación de
  // usuarios falla en la propia prueba (nunca se omite en silencio).
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Falta FIRESTORE_EMULATOR_HOST: esta suite exige el emulador oficial de Firestore (no se omite).');
  }
  env = await initializeTestEnvironment({
    projectId: PROYECTO,
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host: FS_HOST, port: Number(FS_PUERTO) },
  });
  for (const [clave, id] of Object.entries(IDENTIDADES)) {
    const s = await nuevaSesion(id.email, true);
    uids.set(clave, s.uid);
  }
});

beforeEach(async () => {
  await env.clearFirestore();
  estado.auditorias = [];
  await escribirAdmin(baseIdentidades());
});

// ---------------------------------------------------------------------------
// Construcción del archivo y del plan (mismo pipeline que la interfaz).
// ---------------------------------------------------------------------------
const PROPIETARIOS: PropietarioCatalogo[] = [
  { id: 'prop_t', nombre: 'Titular T (sintético)', nifCif: '11111111A', estadoAcceso: 'ACTIVO' },
  { id: 'prop_x', nombre: 'Cartera X (sintética)', nifCif: '22222222B', estadoAcceso: 'ACTIVO' },
  { id: 'prop_r', nombre: 'Cartera R (sintética)', nifCif: '33333333C', estadoAcceso: 'ACTIVO' },
  { id: 'prop_b', nombre: 'Titular B (sintético)', nifCif: '44444444D', estadoAcceso: 'ACTIVO' },
];
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

/** Fila sintética válida: dirección, titular y cuota (la cuota debe quedar como renta declarada). */
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

/** Dry-run real del importador (sin escrituras) con el titular de destino elegido. */
function dryRun(filas: Record<string, unknown>[], destino: string): ImportRun {
  const p = parseXlsx(libro(filas));
  const crudos = p.registros as Record<string, unknown>[];
  const catalogos: CatalogosMigracion = {
    propietarios: PROPIETARIOS, inmuebles: [], contratos: [], mapeos: [], existentes: [],
    propietariosPermitidosIds: PROPIETARIOS.map((x) => x.id),
    importador: { uid: 'u_sintetico', modalidad: 'PROPIETARIO' },
  };
  return ejecutarImportDryRun({
    registrosCrudos: crudos,
    localizaciones: crudos.map((_, i) => `fila ${i + 2}`),
    entityType: 'INMUEBLE', formato: 'XLSX', sourceName: 'plantilla-sintetica.xlsx',
    sourceHash: sha256Hex(new TextEncoder().encode(JSON.stringify(crudos))), sourceTamanoBytes: 1024,
    sourceType: 'EXTERNAL', catalogos, fechaHora: FECHA, actor: 'u_sintetico',
    parches: crudos.map(() => ({
      propietarioDestinoId: destino,
      resolucionTitularidad: [{ ranura: 1 as const, propietarioId: destino }],
    })),
  } as never);
}

/**
 * Promoción real: planifica y ejecuta con el adaptador de producción. `ambito` es el que
 * derivaría la interfaz; en los casos de «ámbito declarado falso» se pasa uno ampliado
 * para comprobar que las REGLAS, no sólo la interfaz, deniegan la escritura.
 */
async function promocionar(
  clave: keyof typeof IDENTIDADES,
  destino: string,
  ambito: AmbitoAutorizado,
  filas: Record<string, unknown>[],
): Promise<{ res: ResultadoPromocion; run: ImportRun }> {
  const s = await sesionDe(clave);
  estado.db = s.db;
  estado.auth = s.auth;
  const run = dryRun(filas, destino);
  const autorizacion = autorizarImportRun({ run, tamanoBytes: 1024, commitDryRun: 'ui', autorizador: 'u_sintetico', fechaHora: FECHA });
  const plan = planificarPromocion({
    autorizacion, run, canonicalBatchSha256: run.sourceHash,
    explicitExecutionToken: derivarTokenEjecucion(run.sourceHash), ambito,
  });
  const puerto = crearPuertoFirebase({ usuarioId: s.usuarioId, usuarioEmail: s.email, usuarioNombre: 'Sesión sintética' });
  const res = await ejecutarPromocion({ plan, run, decisiones: {}, puerto, actor: s.usuarioId, fechaHora: FECHA });
  return { res, run };
}

/** Resultado por registro con su motivo real. */
function resumenDetalle(res: ResultadoPromocion): string[] {
  return res.detalle.map((d) => (d.resultado === 'FALLIDO' ? `FALLIDO: ${d.motivo}` : d.resultado));
}

/** Falla con el texto completo de cada registro (los mensajes de expect se truncan). */
function exigirCreadoTodo(res: ResultadoPromocion, esperado: string[]): void {
  const real = resumenDetalle(res);
  if (JSON.stringify([...real].sort()) !== JSON.stringify([...esperado].sort())) {
    throw new Error(`resultado por registro distinto del esperado. Esperado: ${JSON.stringify(esperado)}. Real: ${JSON.stringify(real)}`);
  }
}

const AMBITO_T: AmbitoAutorizado = { propietarioIdsLegibles: ['prop_t'], propietarioIdsEscribibles: ['prop_t'], esMaster: false };
const AMBITO_G: AmbitoAutorizado = { propietarioIdsLegibles: ['prop_x'], propietarioIdsEscribibles: ['prop_x'], esMaster: false };

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------
describe('titular propio: alta por importación persistida y leída de forma independiente', () => {
  it('crea los inmuebles con sus datos declarados, sin precio ni valores inventados, y los lee otra sesión', async () => {
    const filas = [fila(1), fila(2), fila(3)];
    const { res, run } = await promocionar('titularT', 'prop_t', AMBITO_T, filas);
    expect(res.creados).toBe(3);
    expect(res.fallidos).toBe(0);
    expect(res.actualizados).toBe(0);
    expect(res.omitidos).toBe(0);
    for (const [i, r] of run.registros.entries()) {
      const id = r.destinationId;
      const persistido = await leerAdmin(`inmuebles/${id}`);
      expect(persistido, `inmueble ${id} persistido`).toBeDefined();
      expect(persistido).toMatchObject({ id, propietarioId: 'prop_t', rentaMensualDeclarada: 601 + i });
      expect(persistido).not.toHaveProperty('precio');
      expect(persistido).not.toHaveProperty('rentaMensual');
      const independiente = await leerComo('titularT', `inmuebles/${id}`);
      expect(independiente).toMatchObject({ propietarioId: 'prop_t' });
    }
    expect(res.titularidadesCreadas).toHaveLength(3);
  });

  it('reejecutar el mismo archivo es idempotente: 0 creados, 3 omitidos, nada reescrito', async () => {
    const filas = [fila(1), fila(2), fila(3)];
    const primera = await promocionar('titularT', 'prop_t', AMBITO_T, filas);
    const antes = JSON.stringify(await Promise.all(primera.run.registros.map((r) => leerAdmin(`inmuebles/${r.destinationId}`))));
    const segunda = await promocionar('titularT', 'prop_t', AMBITO_T, filas);
    expect(segunda.res.creados).toBe(0);
    expect(segunda.res.actualizados).toBe(0);
    expect(segunda.res.omitidos).toBe(3);
    expect(segunda.res.fallidos).toBe(0);
    const despues = JSON.stringify(await Promise.all(segunda.run.registros.map((r) => leerAdmin(`inmuebles/${r.destinationId}`))));
    expect(despues).toBe(antes);
  });
});

describe('éxito parcial y aislamiento entre registros', () => {
  it('un registro ajeno bloqueado no impide crear los demás y no toca el inmueble ajeno', async () => {
    const filas = [fila(1), fila(2)];
    const idAjeno = dryRun(filas, 'prop_x').registros[0]!.destinationId;
    const ajeno: Doc = { id: idAjeno, propietarioId: 'prop_t', propietarioPrincipalId: 'prop_t', direccion: 'AJENO ORIGINAL' };
    await escribirAdmin({ [`inmuebles/${idAjeno}`]: ajeno });
    const { res, run } = await promocionar('gestorG', 'prop_x', AMBITO_G, filas);
    if (resumenDetalle(res).filter((m) => m === 'CREADO').length !== 1) {
      throw new Error(`éxito parcial esperado (1 CREADO + 1 FALLIDO). Real: ${JSON.stringify(resumenDetalle(res))}`);
    }
    expect(res.creados).toBe(1);
    expect(res.fallidos).toBe(1);
    expect(await leerAdmin(`inmuebles/${idAjeno}`)).toEqual(ajeno);
    const otro = run.registros.find((r) => r.destinationId !== idAjeno)!;
    expect(await leerAdmin(`inmuebles/${otro.destinationId}`)).toMatchObject({ propietarioId: 'prop_x' });
  });
});

describe('cartera delegada y revocación', () => {
  it('el gestor con LECTURA_ESCRITURA crea en su cartera', async () => {
    const { res, run } = await promocionar('gestorG', 'prop_x', AMBITO_G, [fila(1)]);
    exigirCreadoTodo(res, ['CREADO']);
    expect(res.creados).toBe(1);
    expect(await leerAdmin(`inmuebles/${run.registros[0]!.destinationId}`)).toMatchObject({ propietarioId: 'prop_x' });
  });

  it('tras revocar la gestión, la misma importación se deniega y no escribe', async () => {
    const espejoG = `usuarios_auth/${uids.get('gestorG')!}`;
    await escribirAdmin({
      'gestiones_cartera/ges_x': { ...(await leerAdmin('gestiones_cartera/ges_x')), estado: 'REVOCADA' },
      [espejoG]: { ...(await leerAdmin(espejoG)), gestionesPorPropietario: {} },
    });
    const { res, run } = await promocionar('gestorG', 'prop_x', AMBITO_G, [fila(7)]);
    expect(res.creados).toBe(0);
    expect(res.fallidos).toBe(1);
    expect(await leerAdmin(`inmuebles/${run.registros[0]!.destinationId}`)).toBeUndefined();
  });
});

describe('autorización: el ámbito declarado no sustituye a las reglas', () => {
  const AMBITO_FALSO_L: AmbitoAutorizado = { propietarioIdsLegibles: ['prop_r'], propietarioIdsEscribibles: ['prop_r'], esMaster: false };
  const AMBITO_FALSO_B: AmbitoAutorizado = { propietarioIdsLegibles: ['prop_t'], propietarioIdsEscribibles: ['prop_t'], esMaster: false };

  it('lector (sólo LECTURA) con ámbito declarado de escritura: las reglas deniegan y no crea nada', async () => {
    const filas = [fila(1), fila(2)];
    const { res, run } = await promocionar('lectorL', 'prop_r', AMBITO_FALSO_L, filas);
    expect(res.creados).toBe(0);
    expect(res.fallidos).toBe(2);
    for (const r of run.registros) expect(await leerAdmin(`inmuebles/${r.destinationId}`)).toBeUndefined();
  });

  it('titular ajeno sin cartera sobre el titular T: denegado por las reglas, cero escrituras', async () => {
    const filas = [fila(1), fila(2)];
    const { res, run } = await promocionar('titularB', 'prop_t', AMBITO_FALSO_B, filas);
    expect(res.creados).toBe(0);
    expect(res.fallidos).toBe(2);
    for (const r of run.registros) expect(await leerAdmin(`inmuebles/${r.destinationId}`)).toBeUndefined();
  });
});

describe('lectura denegada: no prueba inexistencia ni autoriza escritura', () => {
  it('un destino existente que el importador no puede leer no se sobrescribe', async () => {
    const filas = [fila(1)];
    const idDestino = dryRun(filas, 'prop_x').registros[0]!.destinationId;
    const existente: Doc = { id: idDestino, propietarioId: 'prop_t', propietarioPrincipalId: 'prop_t', direccion: 'NO TOCAR' };
    await escribirAdmin({ [`inmuebles/${idDestino}`]: existente });
    const { res } = await promocionar('gestorG', 'prop_x', AMBITO_G, filas);
    expect(res.creados).toBe(0);
    expect(res.fallidos).toBe(1);
    expect(await leerAdmin(`inmuebles/${idDestino}`)).toEqual(existente);
  });
});
