/**
 * MATRIZ DE ORÍGENES DE LECTURA DE `inmuebles` — ORDEN 2026-10-03.
 * ===========================================================================
 * QUÉ COMPRUEBA (y qué NO)
 *
 *  1. ESTRUCTURA (CONFIRMADO POR CÓDIGO): a partir del TEXTO REAL de
 *     `src/lib/firebase.ts`, en qué condiciones se abre cada una de las cinco
 *     lecturas (INM-OWN, INM-COT, INM-GEST, INM-ID, INM-ADMIN) y qué consulta
 *     exacta abre cada una.
 *
 *  2. AUTORIZACIÓN DOCUMENTO A DOCUMENTO (harness estático): evalúa el TEXTO
 *     REAL de `firestore.rules` con `tests/harness/firestoreRulesEval.ts` para
 *     cada rol y cada forma de documento. Esto NO es el planificador de
 *     Firestore: el planificador (si el motor demuestra una consulta `list`
 *     sin leer documentos) NO es verificable en Arena — no hay emulador
 *     (sin `firebase-tools` operativo, sin JRE y con la descarga del JAR
 *     bloqueada por TLS; ver `docs/operaciones/alcance.md`). Cada caso que
 *     depende del planificador se marca en el informe como
 *     «NO DETERMINABLE DESDE ARENA», nunca como autorizado.
 *
 *  3. IDENTIDAD (CONFIRMADO POR CÓDIGO): de dónde sale el `propietarioId`
 *     del cliente y de dónde el de las Rules, y el punto exacto en el que
 *     pueden divergir.
 *
 *  4. IDENTIFICACIÓN POR ORIGEN: cada callback de error reporta al canal Y
 *     pasa SU etiqueta al diagnóstico (un fallo no puede confundirse con otro).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
import { completarPerfilesSinteticos } from './harness/perfilesSinteticos';
import {
  construirInformeInmuebles,
  evaluarComprobacionesInmuebles,
  type ContextoLecturaInmuebles,
  type ObservacionEspejoInmuebles,
} from '../src/lib/diagnosticoInmuebles';

const RAIZ = resolve(__dirname, '..');
const FB = readFileSync(resolve(RAIZ, 'src/lib/firebase.ts'), 'utf8');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const AUTH_SERVICE = readFileSync(resolve(RAIZ, 'src/lib/authService.ts'), 'utf8');
const CANAL = readFileSync(resolve(RAIZ, 'src/estadoDatos/canalIncidencias.ts'), 'utf8');
const APP = readFileSync(resolve(RAIZ, 'src/App.tsx'), 'utf8');

/** Recorte estable por marcadores: si un marcador desaparece, el test falla (contrato). */
function entre(fuente: string, inicio: string, fin: string): string {
  const i = fuente.indexOf(inicio);
  expect(i, `marcador de inicio ausente: ${inicio}`).toBeGreaterThan(-1);
  const j = fuente.indexOf(fin, i + inicio.length);
  expect(j, `marcador de fin ausente: ${fin}`).toBeGreaterThan(-1);
  return fuente.slice(i, j);
}

const UNION = entre(FB, 'function subscribeUnionInmuebles(', '/**\n * DIAGNÓSTICO «Lectura · Inmuebles');
const SUSCRIPCION = entre(FB, 'export function subscribeInmuebles(', '/**\n * Real-time listener for Candidatos');

// ═══════════════════════════════════════════════════════════════════════════
// 1 · ESTRUCTURA: qué abre cada origen
// ═══════════════════════════════════════════════════════════════════════════
describe('matriz de orígenes · estructura real de subscribeInmuebles (CONFIRMADO POR CÓDIGO)', () => {
  it('INM-OWN e INM-COT solo pueden abrirse con `pid`; INM-COT no tiene otra guarda', () => {
    expect(UNION).toContain("origen: 'INM-OWN'");
    expect(UNION).toMatch(/if \(opts\.propietarioId\) escucharPorCotitularidad\(opts\.propietarioId\);/);
    // Solo dos apariciones: la definición y su única llamada (sin filtro adicional).
    expect((UNION.match(/escucharPorCotitularidad/g) || []).length).toBe(2);
    // La consulta de cotitularidad es literalmente la de la rama de PR #21.
    expect(UNION).toContain("query(INMUEBLES_COL, where('titularesIds', 'array-contains', pid))");
    expect(UNION).toContain("query(INMUEBLES_COL, where('propietarioId', '==', pid))");
    // Sin `orderBy`: la forma de la consulta es solo la igualdad/array.
    expect(UNION).not.toContain('orderBy');
  });

  it('INM-GEST se abre por cada cartera gestionada distinta del propio pid', () => {
    const bloqueGest = entre(UNION, 'for (const pid of opts.gestionadoIds) {', 'for (const inmuebleId of opts.autorizadoIds)');
    expect(bloqueGest).toContain('if (pid && pid !== opts.propietarioId)');
    expect(bloqueGest).toContain("origen: 'INM-GEST'");
  });

  it('INM-ID se abre por cada id autorizado o de delegación parcial', () => {
    const bloqueId = entre(UNION, 'for (const inmuebleId of opts.autorizadoIds) {', 'return () => fuentes.forEach');
    expect(bloqueId).toContain("origen: 'INM-ID'");
    expect(bloqueId).toContain("doc(db, 'inmuebles', inmuebleId)");
  });

  it('rama A (PROPIETARIO) abre OWN+COT con `pid`; rama B (otros perfiles) NO pasa `pid`', () => {
    const ramaA = entre(SUSCRIPCION, "if (scope?.tipoPerfil === 'PROPIETARIO') {", '// B) Cualquier otro perfil');
    expect(ramaA).toContain('propietarioId: pid');
    const ramaB = entre(SUSCRIPCION, "if (scope?.tipoPerfil && scope.tipoPerfil !== 'ADMINISTRADOR') {", '// C) ADMINISTRADOR / sin ámbito');
    expect(ramaB).not.toContain('propietarioId: pid');
    expect(ramaB).toContain('autorizadoIds: autorizados, gestionadoIds: gestionados');
  });

  it('INM-ADMIN es la colección completa y solo está en la rama C (ADMINISTRADOR o sin `tipoPerfil`)', () => {
    const ramaC = entre(SUSCRIPCION, '// C) ADMINISTRADOR / sin ámbito', '\n}\n');
    expect(ramaC).toContain('return onSnapshot(');
    expect(ramaC).toContain('INMUEBLES_COL,');
    expect(ramaC).toContain("origen: 'INM-ADMIN'");
    expect(ramaC).not.toContain('where(');
    // Con `tipoPerfil` vacío/ausente se toma la rama C ⇒ colección completa para
    // una sesión no administrativa (denegada por diseño). Es el único camino por
    // el que un no-administrador abre INM-ADMIN.
    expect(SUSCRIPCION).toMatch(/if \(scope\?\.tipoPerfil && scope\.tipoPerfil !== 'ADMINISTRADOR'\)/);
  });

  it('cada origen tiene su propia etiqueta en el callback que reporta al canal', () => {
    for (const origen of ['INM-OWN', 'INM-COT', 'INM-GEST', 'INM-ID', 'INM-ADMIN']) {
      expect(FB).toContain(`origen: '${origen}'`);
    }
    // Los cinco orígenes cubren los cuatro puntos de reporte (OWN y GEST comparten callback).
    expect((FB.match(/reportarErrorLectura\('inmuebles', err/g) || []).length).toBe(4);
    expect((FB.match(/diagnosticarErrorLecturaInmuebles\(/g) || []).length).toBe(5);
    // La etiqueta viaja junta al diagnóstico en el mismo callback.
    const cbOwnGest = entre(FB, "reportarErrorLectura('inmuebles', err, `Firestore inmuebles (${clave})", 'const escucharPorCotitularidad');
    expect(cbOwnGest).toContain('void diagnosticarErrorLecturaInmuebles({ ...diagnostico, pid, scope }, err);');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 · AUTORIZACIÓN DOCUMENTO A DOCUMENTO (harness estático; NO planificador)
// ═══════════════════════════════════════════════════════════════════════════
const EVAL = crearEvaluadorReglas(RULES);
const { permite, SIN_COMENTARIOS } = EVAL;
const EMAIL_ADMIN = (SIN_COMENTARIOS(RULES).match(/function\s+isMasterAdmin\(\)\s*\{[\s\S]*?'([^'@\s]+@[^'\s]+)'/) || [])[1];

const DOC_PROP_A = { id: 'inm_A', propietarioId: 'prop_A', address: 'Calle A' };
const DOC_COT_A = { id: 'inm_cot', propietarioId: 'prop_B', titularesIds: ['prop_B', 'prop_A'], address: 'Calle Cot' };
const DOC_GEST_G = { id: 'inm_g', propietarioId: 'prop_G', address: 'Calle G' };
/** Inmueble anterior al índice de cotitularidad: SIN `titularesIds`. */
const DOC_LEGACY = { id: 'inm_legacy', propietarioId: 'prop_A', address: 'Legado' };
/** Delegación PARCIAL: el inmueble pertenece a prop_G y la gestión lo enumera. */
const DOC_PARCIAL = { id: 'inm_parcial', propietarioId: 'prop_G', address: 'Parcial' };

const FIRESTORE: Peticion['db'] = {
  'usuarios_auth/uid_propA': { usuarioId: 'usuario_propA', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_A', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_propB': { usuarioId: 'usuario_propB', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_B', profesionalId: '', inmuebleIds: [] },
  // PROPIETARIO al que el master le ha compartido un inmueble (autorización explícita).
  'usuarios_auth/uid_propAsig': { usuarioId: 'usuario_propAsig', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_D', profesionalId: '', inmuebleIds: ['inm_parcial'] },
  // GESTOR: misma cuenta PROPIETARIO con una cartera en lectura.
  'usuarios_auth/uid_gestor': { usuarioId: 'usuario_gestor', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_GS', profesionalId: '', inmuebleIds: [], carterasL: ['prop_G'] },
  // PROFESIONAL gestor: cartera en lectura SIN ser PROPIETARIO.
  'usuarios_auth/uid_profGestor': { usuarioId: 'usuario_profGestor', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [], carterasL: ['prop_G'] },
  'usuarios_auth/uid_admin': { usuarioId: 'usuario_admin', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_AD', profesionalId: '', inmuebleIds: [] },
  // Espejo con perfil NO ACTIVO (revocado) y espejo sin `propietarioId`.
  'usuarios_auth/uid_susp': { usuarioId: 'usuario_susp', tipoPerfil: 'PROPIETARIO', estado: 'SUSPENDIDO', propietarioId: 'prop_A', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_sin_pid': { usuarioId: 'usuario_sin_pid', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', profesionalId: '', inmuebleIds: [] },
  // Ficha administrativa: `esAdminInmuebles()` la mira en `usuarios/{request.auth.uid}`.
  'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_admin' },
  // D1R · índice de carteras del espejo (proyección que solo escribe el master):
  //   · uid_gestorIdx → gestión COMPLETA (inmuebleIds vacío) sobre prop_G
  //   · uid_gestorParcial → gestión PARCIAL (enumera inm_parcial) sobre prop_G
  'usuarios_auth/uid_gestorIdx': { usuarioId: 'usuario_gestorIdx', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_GS', profesionalId: '', inmuebleIds: [], gestionesPorPropietario: { prop_G: 'ges_completa' } },
  'usuarios_auth/uid_gestorParcial': { usuarioId: 'usuario_gestorParcial', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_GS2', profesionalId: '', inmuebleIds: [], gestionesPorPropietario: { prop_G: 'ges_parcial' } },
  'gestiones_cartera/ges_completa': { id: 'ges_completa', propietarioId: 'prop_G', gestorUsuarioId: 'usuario_gestorIdx', estado: 'ACTIVA', inmuebleIds: [], resolucionInvitacion: 'ACEPTADA' },
  'gestiones_cartera/ges_parcial': { id: 'ges_parcial', propietarioId: 'prop_G', gestorUsuarioId: 'usuario_gestorParcial', estado: 'ACTIVA', inmuebleIds: ['inm_parcial'], resolucionInvitacion: 'ACEPTADA' },
  'inmuebles/inm_A': DOC_PROP_A,
  'inmuebles/inm_cot': DOC_COT_A,
  'inmuebles/inm_g': DOC_GEST_G,
  'inmuebles/inm_legacy': DOC_LEGACY,
  'inmuebles/inm_parcial': DOC_PARCIAL,
};
completarPerfilesSinteticos(FIRESTORE);

const AUTH = {
  propA: { uid: 'uid_propA', token: { email: 'a@test.local' } },
  propB: { uid: 'uid_propB', token: { email: 'b@test.local' } },
  propAsig: { uid: 'uid_propAsig', token: { email: 'asig@test.local' } },
  gestor: { uid: 'uid_gestor', token: { email: 'gestor@test.local' } },
  profGestor: { uid: 'uid_profGestor', token: { email: 'profgestor@test.local' } },
  admin: { uid: 'uid_admin', token: { email: 'admin@test.local' } },
  gestorIdx: { uid: 'uid_gestorIdx', token: { email: 'gestoridx@test.local' } },
  gestorParcial: { uid: 'uid_gestorParcial', token: { email: 'gestorparcial@test.local' } },
  susp: { uid: 'uid_susp', token: { email: 'susp@test.local' } },
  sinPid: { uid: 'uid_sin_pid', token: { email: 'sinpid@test.local' } },
  sinFicha: { uid: 'uid_sin_ficha', token: { email: 'nadie@test.local' } },
  master: { uid: 'uid_master', token: { email: EMAIL_ADMIN } },
  anon: null,
} as const;

const DOCS: Record<string, Record<string, unknown>> = {
  inm_A: DOC_PROP_A,
  inm_cot: DOC_COT_A,
  inm_g: DOC_GEST_G,
  inm_legacy: DOC_LEGACY,
  inm_parcial: DOC_PARCIAL,
};

function peticion(over: Partial<Peticion>): Peticion {
  return { auth: null, db: FIRESTORE, resource: null, requestResource: null, docId: 'inm_A', ...over };
}
const listar = (doc: keyof typeof DOCS, auth: Peticion['auth']) =>
  permite('inmuebles', 'list', peticion({ auth, docId: doc, resource: DOCS[doc] }));
const leer = (doc: keyof typeof DOCS | null, auth: Peticion['auth']) =>
  permite('inmuebles', 'get', peticion({ auth, docId: doc ?? 'inm_inexistente', resource: doc ? DOCS[doc] : null }));

describe('matriz de orígenes · evaluación documento a documento (harness; NO planificador)', () => {
  it('INM-OWN: autoriza al titular del `propietarioId` y solo a él', () => {
    expect(listar('inm_A', AUTH.propA)).toBe(true);   // where propietarioId == myPropId
    expect(listar('inm_A', AUTH.propB)).toBe(false);  // otro propietario
    expect(listar('inm_A', AUTH.sinPid)).toBe(false); // espejo sin propietarioId
    expect(listar('inm_A', AUTH.susp)).toBe(false);   // espejo no ACTIVO
    expect(listar('inm_A', AUTH.profGestor)).toBe(false);
  });

  it('INM-COT: la rama de PR #21 autoriza al cotitular; exige espejo PROPIETARIO ACTIVO', () => {
    expect(listar('inm_cot', AUTH.propA)).toBe(true);
    expect(listar('inm_cot', AUTH.propB)).toBe(true);        // es el propietarioId canónico
    expect(listar('inm_cot', AUTH.gestor)).toBe(false);      // su pid no está en titularesIds
    expect(listar('inm_cot', AUTH.profGestor)).toBe(false);  // la rama exige isPropietarioRole()
    expect(listar('inm_cot', AUTH.sinFicha)).toBe(false);
    expect(listar('inm_cot', AUTH.anon)).toBe(false);
  });

  it('INM-GEST: autoriza al gestor por cartera (L) y deniega sin cartera', () => {
    expect(listar('inm_g', AUTH.gestor)).toBe(true);     // PROPIETARIO con carterasL: ['prop_G']
    expect(listar('inm_g', AUTH.profGestor)).toBe(true); // PROFESIONAL gestor (activeUser, sin rol PROPIETARIO)
    expect(listar('inm_g', AUTH.propA)).toBe(false);     // sin cartera
    expect(listar('inm_g', AUTH.propAsig)).toBe(false);  // autorización explícita de OTRO inmueble
  });

  it('INM-ID: `get` por autorización explícita, y `get` sobre documento inexistente deniega', () => {
    expect(leer('inm_parcial', AUTH.propAsig)).toBe(true); // inmuebleIds del espejo
    expect(leer('inm_A', AUTH.propAsig)).toBe(false);      // no está en su lista
    // INM-ID apunta por ids que pueden estar obsoletos: un `get` sin documento
    // no autoriza (en el motor real es `permission-denied`, indistinguible de «ajeno»).
    expect(leer(null, AUTH.propAsig)).toBe(false);
  });

  it('INM-ADMIN: con una fila AJENA, solo el ámbito administrativo queda autorizado', () => {
    // `list` se evalúa documento a documento en el harness: se usa una fila que
    // NO es de quien consulta, para que la única rama capaz de autorizarla sea
    // `esAdminInmuebles()` (las demás están acotadas por identidad).
    expect(listar('inm_A', AUTH.admin)).toBe(true);    // usuarios/{uid} ADMINISTRADOR ACTIVO con authUid
    expect(listar('inm_A', AUTH.master)).toBe(true);   // master por email
    expect(listar('inm_g', AUTH.propA)).toBe(false);   // propietario ordinario, fila ajena
    expect(listar('inm_A', AUTH.profGestor)).toBe(false); // gestor de OTRA cartera
    expect(listar('inm_A', AUTH.sinFicha)).toBe(false);
    expect(listar('inm_A', AUTH.anon)).toBe(false);
  });

  it('INM-GEST por índice D1R: cartera COMPLETA autoriza list; delegación PARCIAL solo autoriza get', () => {
    // Rama indexada de `inmuebleEnCarteraGestionada`: el índice del espejo apunta
    // a `gestiones_cartera/{id}` y la regla comprueba propietarioId, gestorUsuarioId,
    // estado, `inmuebleIds.size() == 0` y `resolucionInvitacion`. Documento a documento.
    expect(listar('inm_g', AUTH.gestorIdx)).toBe(true);
    expect(leer('inm_g', AUTH.gestorIdx)).toBe(true);
    // Delegación parcial: `inmuebleParcialIndexado` es SOLO `get` (no está en `allow list`).
    expect(leer('inm_parcial', AUTH.gestorParcial)).toBe(true);
    expect(listar('inm_parcial', AUTH.gestorParcial)).toBe(false);
    expect(listar('inm_g', AUTH.gestorParcial)).toBe(false);
  });

  it('un inmueble histórico sin `titularesIds` no se autoriza por la rama de cotitularidad (solo por titularidad)', () => {
    // La consulta `array-contains` no puede devolver este documento (no tiene el
    // campo), pero si otro camino lo incluyera, la rama de cotitularidad no lo
    // autoriza: solo `inmuebleEsMio` por `propietarioId`.
    expect(listar('inm_legacy', AUTH.propA)).toBe(true);
    expect(listar('inm_legacy', AUTH.propB)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2b · DATOS DISPONIBLES EN ARENA: no hay producción (CONFIRMADO POR DATOS)
// ═══════════════════════════════════════════════════════════════════════════
describe('matriz de orígenes · datos disponibles en Arena', () => {
  it('los mock del repositorio están VACÍOS: no hay inmuebles, propietarios ni usuarios', () => {
    const mock = readFileSync(resolve(RAIZ, 'src/data/mockData.ts'), 'utf8');
    expect(mock).toContain('export const INITIAL_INMUEBLES: Inmueble[] = [];');
    expect(mock).toContain('export const INITIAL_PROPIETARIOS: Propietario[] = [];');
    // Ningún fixture del repositorio aporta `usuarios_auth` ni documentos de `inmuebles`.
    const fixtures = readFileSync(resolve(RAIZ, 'tests/fixtures/propietarios-bloque-reglas-anterior.txt'), 'utf8');
    expect(fixtures).not.toContain('usuarios_auth');
    expect(fixtures).not.toContain('titularesIds');
  });

  it('la única evidencia con «inmuebles» es de OTRA app y no sirve para esta matriz', () => {
    const anexo = JSON.parse(readFileSync(resolve(RAIZ, 'docs/FASE2-ANEXO-EVIDENCIA-EXTERNA.json'), 'utf8')) as {
      __PROVENANCE__: { origen: string };
      inmuebles_esquema: { campos: string[] };
    };
    expect(anexo.__PROVENANCE__.origen).toContain('FUENTE EXTERNA');
    // No tiene los campos del modelo de identidad de esta app.
    expect(anexo.inmuebles_esquema.campos.join(' ')).not.toMatch(/titularesIds|propietarioId|propietarioPrincipalId/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 · IDENTIDAD: cliente vs Rules
// ═══════════════════════════════════════════════════════════════════════════
describe('matriz de orígenes · identidad cliente vs Rules (CONFIRMADO POR CÓDIGO)', () => {
  it('el cliente resuelve el perfil por `usuarios/{usuarioId}` y solo toma las carteras del espejo', () => {
    const resolucion = entre(AUTH_SERVICE, 'export async function getUsuarioByAuthUid(', '// 1. Búsqueda directa por authUid');
    // El espejo aporta usuarioId y carterasL/E; el perfil aporta propietarioId.
    expect(resolucion).toContain("const mirrorSnap = await getDoc(doc(db, 'usuarios_auth', authUid));");
    expect(resolucion).toContain("const perfilSnap = await getDoc(doc(db, 'usuarios', usuarioId));");
    expect(resolucion).toContain('usuario.carterasL = Array.isArray(mirrorData.carterasL)');
    expect(resolucion).not.toContain('usuario.propietarioId =');
  });

  it('el espejo se escribe con el `propietarioId` de la ficha (y `indexIsTruthful` lo pinna en las Rules)', () => {
    const sync = entre(AUTH_SERVICE, 'export async function syncAuthIndex(', '} catch (err) {');
    expect(sync).toContain('propietarioId: usuario.propietarioId ||');
    const regla = entre(RULES, 'function indexIsTruthful() {', '// =========================================================================');
    expect(regla).toContain('incoming().propietarioId == src.propietarioId');
  });

  it('App construye el `dataScope` solo con `currentUser` (no relee el espejo antes de suscribir)', () => {
    const scope = entre(APP, 'const dataScope = {', '// D2a: suscripción de inmuebles CON ÁMBITO');
    expect(scope).toContain('propietarioId: currentUser.propietarioId');
    expect(scope).not.toContain('usuarios_auth');
  });

  it('DIVERGENCIA POSIBLE: si la ficha cambia después de escribir el espejo, el pid del cliente ≠ myPropId()', () => {
    const observacion: ObservacionEspejoInmuebles = {
      espejo: { estado: 'EXISTE', datos: { usuarioId: 'u1', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_VIEJO', inmuebleIds: [] } },
      perfil: { estado: 'EXISTE', datos: { authUid: 'uid1', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_NUEVO', inmuebleIds: [] } },
      perfilPorUid: { estado: 'NO_EXISTE' },
    };
    const ctx: ContextoLecturaInmuebles = {
      origen: 'INM-COT',
      consulta: "inmuebles where('titularesIds','array-contains', pid)",
      pid: 'prop_NUEVO', // lo que el cliente lee de `usuarios/{id}`
      authUid: 'uid1',
      tipoPerfil: 'PROPIETARIO',
      propietarioIdCliente: 'prop_NUEVO',
      numeroInmuebleIds: 0,
      numeroInmueblesParciales: 0,
      numeroCarterasGestionadas: 0,
      proyecto: 'gestor-inmuebles-produccion',
      baseDeDatos: 'ai-studio-gestordeinmueble-ejemplo',
      codigoError: 'permission-denied',
      mensajeError: 'Missing or insufficient permissions.',
    };
    expect(evaluarComprobacionesInmuebles(ctx, observacion).find((c) => c.id === 'PID_ESPEJO')?.ok).toBe(false);
    expect(construirInformeInmuebles({ ctx, observacion, momento: '2026-10-03T00:00:00.000Z' }).causa)
      .toBe('PID_DISTINTO_DEL_ESPEJO');
    // Y documento a documento: ninguna fila con titularesIds del pid viejo autoriza
    // al espejo que dice otro pid (la rama compara con `myPropId()`).
    expect(listar('inm_cot', AUTH.gestor)).toBe(false);
  });

  it('un espejo ausente o no verdadero se detecta como causa de identidad, no de consulta', () => {
    const base = { proyecto: 'p', baseDeDatos: 'b', codigoError: 'permission-denied', mensajeError: 'm' };
    const ctxBase: ContextoLecturaInmuebles = {
      origen: 'INM-OWN', consulta: 'x', pid: 'prop_A', authUid: 'uid',
      tipoPerfil: 'PROPIETARIO', propietarioIdCliente: 'prop_A',
      numeroInmuebleIds: 0, numeroInmueblesParciales: 0, numeroCarterasGestionadas: 0, ...base,
    };
    const sinEspejo = construirInformeInmuebles({
      ctx: ctxBase,
      observacion: { espejo: { estado: 'NO_EXISTE' }, perfil: null, perfilPorUid: { estado: 'NO_EXISTE' } },
      momento: 'm',
    });
    expect(sinEspejo.causa).toBe('ESPEJO_AUSENTE_O_ILEGIBLE');
    const perfilNoVeraz = construirInformeInmuebles({
      ctx: ctxBase,
      observacion: {
        espejo: { estado: 'EXISTE', datos: { usuarioId: 'u', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_A' } },
        perfil: { estado: 'EXISTE', datos: { authUid: 'otro-uid', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_A' } },
        perfilPorUid: { estado: 'NO_EXISTE' },
      },
      momento: 'm',
    });
    expect(perfilNoVeraz.causa).toBe('PERFIL_NO_VERAZ');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 · OBSERVABILIDAD: un solo fallo ⇒ aviso global (documentado, no es la causa)
// ═══════════════════════════════════════════════════════════════════════════
describe('matriz de orígenes · observabilidad del aviso (CONFIRMADO POR CÓDIGO)', () => {
  it('el canal conserva UNA incidencia por origen+tipo: el aviso no dice qué escucha falló', () => {
    expect(CANAL).toContain('incidencias = [incidencia, ...incidencias.filter((i) => !(i.origen === origen && i.tipo === tipo))].slice(0, MAXIMO_INCIDENCIAS);');
  });

  it('`conDatos` marca LISTO pero no limpia el canal: el aviso persiste aunque otras lecturas carguen', () => {
    const marcado = entre(APP, 'const conDatos = useCallback(', 'const [authLoading');
    expect(marcado).toContain('marcarListo(origen);');
    expect(marcado).not.toContain('limpiarIncidenciasDe');
  });
});
