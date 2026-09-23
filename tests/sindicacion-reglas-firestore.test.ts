/**
 * GAP 5 · fase 2B — `firestore.rules` §38 (`sindicacion_inmuebles`).
 * ---------------------------------------------------------------------------------
 * METODOLOGÍA (leer antes de dar por bueno ningún verde):
 *  · En esta base NO hay emulador de Firebase (no hay `firebase-tools`, no hay JRE y
 *    el drop de los emuladores de Google no es accesible desde el sandbox), así que las
 *    reglas no las ejecuta el motor de Google. Lo que SÍ se ejecuta aquí es un
 *    EVALUADOR PROPIO de las expresiones de autorización: se leen del fichero real las
 *    `function` y los `allow` del bloque §38 y se evalúan contra peticiones simuladas
 *    (auth, espejo `usuarios_auth/{uid}`, documento existente y documento entrante).
 *  · El evaluador es EXPRESIVO por diseño: ante cualquier construcción que no cubre
 *    lanza (`HARNESS NO CUBRE`). Así es imposible que una regla nueva con sintaxis
 *    distinta se cuele como "permitida" o se valide en falso por omisión.
 *  · No sustituye la prueba contra el emulador: fija la SEMÁNTICA del fichero que se
 *    despliega (quién puede leer/escribir/borrar y con qué documento). Ver el informe
 *    de la fase para la validación pendiente contra `firebase emulators:exec`.
 *
 * Escenarios (orden de la fase, apartado 7): lectura autorizada / lectura no
 * autorizada / create válido / create con identidad adulterada / create con inmueble
 * ajeno / create con secretos / update legítimo / update cambiando inmuebleId, portal
 * y propietarioId / delete no autorizado / delete de administración.
 */
import { readFileSync } from 'node:fs';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLAVES_CREDENCIAL_PROHIBIDAS } from '../src/sindicacion/adaptadores';
import { identidadPublicacionPortal, ESTADOS_PUBLICACION } from '../src/utils/publicacionEngine';
import { COLECCION_ESTADO_SINDICACION, ESQUEMA_ESTADO_SINDICACION } from '../src/sindicacion/estadoRepositorio';

// RL_FICHERO permite evaluar ESTE mismo juego de pruebas sobre otra versión del fichero de
// reglas. Se usa para comprobar que el corte que va al commit es desplegable por sí solo
// (sin los bloques de otras fases que siguen en el worktree): `RL_FICHERO=/tmp/x.rules
// vitest run tests/sindicacion-reglas-firestore.test.ts`. El emulador de Firebase sigue sin
// ser opción en este entorno (sin Java y sin salida a storage.googleapis.com), así que la
// validez se comprueba con este evaluador propio, que es estricto: si no entiende una
// construcción, lanza en vez de asumir `true`.
const RULES_FUENTE = process.env.RL_FICHERO || '../firestore.rules';
const RULES = readFileSync(path.resolve(__dirname, RULES_FUENTE), 'utf8');
const COLECCION = COLECCION_ESTADO_SINDICACION;

// ===========================================================================
// 1) + 2) El evaluador del fichero vive en `./harness/firestoreRulesEval` (INFRA
// COMPARTIDA con los tests de FASE 1.4: un solo criterio de evaluación para ambos).
// ===========================================================================
const EVAL = crearEvaluadorReglas(RULES);
const { SIN_COMENTARIOS, bloqueDe, cuerpoRaiz, funcionesDe, permisosDe } = EVAL;
const permite = (verbo: 'get' | 'list' | 'create' | 'update' | 'delete', req: Peticion): boolean =>
  EVAL.permite(COLECCION, verbo, req);

// ===========================================================================
// 3) FIXTURES DE PETICIÓN
// ===========================================================================

// El literal del administrador se saca por FORMA de email, no por posición: en el worktree
// `isMasterAdmin()` lo compara contra `authEmail()` (un solo literal) y en HEAD lo compara
// contra `request.auth.token.email` (el primer literal del cuerpo es 'email'). Ambos tienen
// que dar el mismo email, y ambos tienen que pasar estas pruebas.
const EMAIL_ADMIN = (SIN_COMENTARIOS(RULES).match(/function\s+isMasterAdmin\(\)\s*\{[\s\S]*?'([^'@\s]+@[^'\s]+)'/) || [])[1];
if (!EMAIL_ADMIN) throw new Error('No hay ningún email literal en isMasterAdmin(): el fichero de reglas evaluado no es evaluable con este harness');

const espejo = (o: Partial<Record<string, unknown>> = {}): Record<string, unknown> => ({
  estado: 'ACTIVO',
  tipoPerfil: 'PROPIETARIO',
  propietarioId: 'prop-A',
  inmuebleIds: ['inm-A'],
  ...o,
});

const PROPIETARIO: Peticion['auth'] = { uid: 'u1', token: { email: 'ana@erp.test' } };
const OTRO: Peticion['auth'] = { uid: 'u2', token: { email: 'otro@erp.test' } };
const ADMIN: Peticion['auth'] = { uid: 'u-admin', token: { email: EMAIL_ADMIN } };

function docEstado(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const identidad = identidadPublicacionPortal('inm-A', 'IDEALISTA');
  return {
    id: identidad.externalId,
    externalId: identidad.externalId,
    clave: identidad.clave,
    portal: 'IDEALISTA',
    inmuebleId: 'inm-A',
    idPublico: 'pub_abc',
    propietarioId: 'prop-A',
    estado: 'LISTO_PARA_PUBLICAR',
    ultimaOperacion: 'validar',
    ultimoResultado: 'OK',
    operacionesRegistradas: 2,
    esquema: ESQUEMA_ESTADO_SINDICACION,
    version: 1,
    hashContenido: 'a'.repeat(64),
    creadoEn: '2026-09-23T10:00:00.000Z',
    actualizadoEn: '2026-09-23T10:00:00.000Z',
    ...over,
  };
}

const peticion = (p: {
  auth?: Peticion['auth'];
  /** `null` ⇒ no existe el espejo `usuarios_auth/{uid}` (el caso del modo sin Auth). */
  espejoDoc?: Record<string, unknown> | null;
  resource?: Record<string, unknown> | null;
  requestResource?: Record<string, unknown> | null;
  docId?: string;
}): Peticion => {
  const identidad = identidadPublicacionPortal('inm-A', 'IDEALISTA');
  const auth = p.auth === undefined ? PROPIETARIO : p.auth;
  const db: Record<string, Record<string, unknown>> = { 'inmuebles/inm-A': { id: 'inm-A', propietarioId: 'prop-A' } };
  if (auth) {
    const espejoDoc = p.espejoDoc === undefined ? espejo() : p.espejoDoc;
    if (espejoDoc) db[`usuarios_auth/${auth.uid}`] = espejoDoc;
  }
  return {
    auth,
    db,
    resource: p.resource === undefined ? docEstado() : p.resource,
    requestResource: p.requestResource === undefined ? docEstado() : p.requestResource,
    docId: p.docId || identidad.externalId,
  };
};

// ===========================================================================
// GRUPO R · semántica del bloque §38 (evaluada)
// ===========================================================================

describe('REGLAS · R. Estructura del bloque §38 en firestore.rules', () => {
  it('R.0 el fichero está balanceado, el bloque está dentro del match raíz y antes del catch-all', () => {
    expect((RULES.match(/\{/g) || []).length).toBe((RULES.match(/\}/g) || []).length);
    const raiz = RULES.indexOf('match /databases/{database}/documents');
    const propio = RULES.indexOf(`match /${COLECCION}/`);
    const catchAll = SIN_COMENTARIOS(RULES).indexOf('match /{document=**}');
    expect(raiz).toBeGreaterThan(0);
    expect(propio).toBeGreaterThan(raiz);
    expect(SIN_COMENTARIOS(RULES).indexOf(`match /${COLECCION}/`)).toBeLessThan(catchAll);
    // hay UN solo bloque para la colección (nada de match duplicado que afloje permisos)
    expect(RULES.split(`match /${COLECCION}/`).length - 1).toBe(1);
    // y el catch-all sigue siendo el ÚLTIMO match del fichero: el deniego por defecto permanece
    expect(catchAll).toBeGreaterThan(0);
    expect(SIN_COMENTARIOS(RULES).slice(catchAll)).toContain('allow read, write: if false;');
    expect(SIN_COMENTARIOS(RULES).indexOf('match /', catchAll + 10)).toBe(-1);
  });

  it('R.0b no hay lecturas abiertas ni `if true` en el bloque', () => {
    const bloque = SIN_COMENTARIOS(bloqueDe(COLECCION));
    expect(bloque).not.toMatch(/allow[^;]*if\s+true/);
    expect(bloque).not.toMatch(/allow\s+(read|write)\s*:/); // sólo verbos granulares
    const permisos = permisosDe(bloque);
    expect([...permisos.keys()].sort()).toEqual(['create', 'delete', 'get', 'list', 'update']);
    const funciones = funcionesDe(cuerpoRaiz());
    const cuerpoActor = funciones.get('actorPuedeEscribirEstado');
    expect(cuerpoActor, 'falta actorPuedeEscribirEstado()').toBeTruthy();
    for (const [verbo, { condicion }] of permisos) {
      // toda condición pasa por identidad/roles del proyecto (nada de `request.auth != null` pelado):
      // o lo dice explícitamente o lo delega en la función del bloque, que sí lo dice.
      const origen = funciones.get('actorPuedeEscribirEstado')?.cuerpo || '';
      const veAdmin = /isMasterAdmin\(\)/.test(condicion) || (verbo === 'create' || verbo === 'update' ? /isMasterAdmin\(\)/.test(origen) : false);
      expect(veAdmin, verbo).toBe(true);
      expect(/isPropietarioRole\(\)|isMasterAdmin\(\)|actorPuedeEscribirEstado\(\)/.test(condicion), verbo).toBe(true);
    }
    // create y update, además, no escriben sin validar el contenido
    expect(permisos.get('create')!.condicion).toContain('documentoCoherente()');
    expect(permisos.get('update')!.condicion).toContain('documentoCoherente()');
  });

  it('R.0c el predicado de secretos es superconjunto de CLAVES_CREDENCIAL_PROHIBIDAS (regla y adaptador no se desincronizan)', () => {
    const inicio = RULES.indexOf('function sinSecretosSindicacion()');
    expect(inicio).toBeGreaterThan(0);
    const cuerpo = RULES.slice(inicio, RULES.indexOf('\n    }', inicio));
    for (const clave of CLAVES_CREDENCIAL_PROHIBIDAS) {
      expect(cuerpo, `la clave ${clave} no está en el predicado de reglas`).toContain(`'${clave}' in incoming()`);
    }
    for (const extra of ['credentials', 'privateKey', 'certificado', 'base64Data']) {
      expect(cuerpo, extra).toContain(`'${extra}' in incoming()`);
    }
    // y el documento persistido NO puede llevar ninguna clave de feed/adjunto
    expect(cuerpo).toContain('adjuntoBase64');
  });
});

describe('REGLAS · R1-R2. Lectura', () => {
  it('R.1 lectura autenticada autorizada: propietario del inmueble y administración', () => {
    expect(permite('get', peticion({}))).toBe(true);
    expect(permite('get', peticion({ auth: ADMIN, resource: docEstado() }))).toBe(true);
    // `list` con la consulta del panel (filtrada por propietarioId): documento propio
    expect(permite('list', peticion({ resource: docEstado() }))).toBe(true);
    // inmueble ASIGNADO al propietario (está en su cartera) → `get` también vale
    expect(permite('get', peticion({ resource: docEstado({ propietarioId: 'prop-Z' }), espejoDoc: espejo({ inmuebleIds: ['inm-A'] }) }))).toBe(true);
  });

  it('R.2 lectura no autorizada: otro propietario, sesión sin espejo y sin sesión', () => {
    const ajeno = peticion({ auth: OTRO, espejoDoc: espejo({ propietarioId: 'prop-B', inmuebleIds: ['inm-B'] }) });
    expect(permite('get', ajeno)).toBe(false);
    // lista SIN el filtro por propietarioId (documento de otra cartera) ⇒ se deniega
    expect(permite('list', ajeno)).toBe(false);
    // inmueble compartido con un propietario que NO es el titular: el `list` está
    // deliberadamente más estrecho que el `get` (no es demostrable en una consulta)
    expect(permite('list', peticion({ auth: OTRO, espejoDoc: espejo({ propietarioId: 'prop-B', inmuebleIds: ['inm-A'] }), resource: docEstado() }))).toBe(false);
    // sesión sin espejo `usuarios_auth/{uid}` ⇒ no se puede afirmar el rol ⇒ deniego
    expect(permite('get', peticion({ espejoDoc: null }))).toBe(false);
    // sin autenticación
    expect(permite('get', peticion({ auth: null }))).toBe(false);
    expect(permite('list', peticion({ auth: null }))).toBe(false);
    // cuenta inactiva o de otro perfil
    expect(permite('get', peticion({ espejoDoc: espejo({ estado: 'INACTIVO' }) }))).toBe(false);
    expect(permite('get', peticion({ espejoDoc: espejo({ tipoPerfil: 'PROFESIONAL' }) }))).toBe(false);
  });
});

describe('REGLAS · R3-R6. Create', () => {
  it('R.3 create válido (propietario sobre su inmueble, y administración)', () => {
    expect(permite('create', peticion({ resource: null, requestResource: docEstado({ operacionesRegistradas: 1 }) }))).toBe(true);
    expect(permite('create', peticion({ auth: ADMIN, resource: null }))).toBe(true);
  });

  it('R.4 create con identidad adulterada se rechaza (nunca se escribe otro id ni otra clave)', () => {
    const legitima = identidadPublicacionPortal('inm-A', 'IDEALISTA');
    const casos: [string, Record<string, unknown>][] = [
      ['id ≠ docId', docEstado({ id: 'otro-id' })],
      ['externalId ≠ docId', docEstado({ externalId: 'idealista_forjado' })],
      ['docId ajeno al payload', docEstado()],
      ['clave que no es PORTAL:inmuebleId', docEstado({ clave: 'IDEALISTA:inm-OTRA' })],
      ['clave con forma inválida', docEstado({ clave: 'sin-dos-puntos' })],
      // portal inventado CON la clave coherente: lo único que lo frena es el enum
      ['portal fuera del enum', docEstado({ portal: 'PORTAL_INVENTADO', clave: 'PORTAL_INVENTADO:inm-A' })],
      ['portal fuera del enum (con espacios)', docEstado({ portal: 'IDEALISTA ' })],
      ['clave con tamaño que no es PORTAL:inmuebleId', docEstado({ clave: 'IDEALISTA:in' })],
      ['estado fuera del enum', docEstado({ estado: 'EN_REVISION' })],
      ['operación fuera del enum', docEstado({ ultimaOperacion: 'forzarPublicacion' })],
      ['resultado fuera del enum', docEstado({ ultimoResultado: 'MASOQUISTA' })],
      ['esquema distinto', docEstado({ esquema: 2 })],
      ['sin propietarioId', docEstado({ propietarioId: undefined })],
      ['propietarioId vacío', docEstado({ propietarioId: '' })],
      ['inmuebleId vacío', docEstado({ inmuebleId: '' })],
      ['id ≠ externalId', docEstado({ externalId: legitima.externalId, id: `${legitima.externalId}x` })],
    ];
    for (const [nombre, documento] of casos) {
      const pet = peticion({ resource: null, requestResource: documento, docId: nombre === 'docId ajeno al payload' ? identidadPublicacionPortal('inm-A', 'KYERO').externalId : legitima.externalId });
      expect(permite('create', pet), nombre).toBe(false);
    }
  });

  it('R.5 create sobre inmueble ajeno se rechaza (el aislamiento por cartera se mantiene)', () => {
    expect(permite('create', peticion({ resource: null, requestResource: docEstado({ inmuebleId: 'inm-B', clave: 'IDEALISTA:inm-B' }) }))).toBe(false);
    // …aunque se presente con el propietarioId de la víctima: la cartera manda
    expect(permite('create', peticion({ auth: OTRO, espejoDoc: espejo({ propietarioId: 'prop-B', inmuebleIds: ['inm-B'] }), resource: null, requestResource: docEstado({ propietarioId: 'prop-A' }) }))).toBe(false);
    // documento sin inmueble existente: la regla exige alcanzarlo, no que exista
    expect(permite('create', peticion({ auth: OTRO, espejoDoc: espejo({ propietarioId: 'prop-B', inmuebleIds: [] }), resource: null }))).toBe(false);
  });

  it('R.6 create con secretos o con claves de credencial se rechaza (toda la lista del núcleo)', () => {
    for (const clave of CLAVES_CREDENCIAL_PROHIBIDAS) {
      expect(permite('create', peticion({ resource: null, requestResource: docEstado({ [clave]: 'NOPE' }) })), clave).toBe(false);
    }
    for (const extra of ['credentials', 'privateKey', 'certificado', 'psd2', 'oauthToken', 'base64Data', 'adjuntoBase64', 'consumerSecret']) {
      expect(permite('create', peticion({ resource: null, requestResource: docEstado({ [extra]: 'NOPE' }) })), extra).toBe(false);
    }
  });
});

describe('REGLAS · R7-R12. Update y delete', () => {
  it('R.7 update legítimo: cambia el estado y la trazabilidad, respeta la identidad', () => {
    const nuevo = docEstado({ estado: 'PUBLICADO', ultimaOperacion: 'publicar', ultimoResultado: 'OK', operacionesRegistradas: 3, actualizadoEn: '2026-09-23T12:00:00.000Z' });
    expect(permite('update', peticion({ requestResource: nuevo }))).toBe(true);
    expect(permite('update', peticion({ auth: ADMIN, requestResource: nuevo }))).toBe(true);
  });

  it('R.8 update intentando cambiar inmuebleId se rechaza', () => {
    expect(permite('update', peticion({ requestResource: docEstado({ inmuebleId: 'inm-B', clave: 'IDEALISTA:inm-B' }) }))).toBe(false);
  });

  it('R.9 update intentando cambiar portal se rechaza', () => {
    expect(permite('update', peticion({ requestResource: docEstado({ portal: 'FOTOCASA', externalId: identidadPublicacionPortal('inm-A', 'FOTOCASA').externalId, id: identidadPublicacionPortal('inm-A', 'FOTOCASA').externalId, clave: 'FOTOCASA:inm-A' }) }))).toBe(false);
  });

  it('R.10 update intentando cambiar propietarioId (reasignación) se rechaza', () => {
    expect(permite('update', peticion({ requestResource: docEstado({ propietarioId: 'prop-B' }) }))).toBe(false);
    // y tampoco cambian la clave, el externalId ni el id del documento
    expect(permite('update', peticion({ requestResource: docEstado({ clave: 'FOTOCASA:inm-A' }) }))).toBe(false);
    expect(permite('update', peticion({ requestResource: docEstado({ externalId: 'idealista_otra' }) }))).toBe(false);
    expect(permite('update', peticion({ requestResource: docEstado({ id: 'otro' }) }))).toBe(false);
  });

  it('R.11 delete no autorizado: ni propietario, ni sesión sin espejo, ni anónimo', () => {
    expect(permite('delete', peticion({}))).toBe(false);
    expect(permite('delete', peticion({ auth: OTRO, espejoDoc: espejo({ propietarioId: 'prop-B', inmuebleIds: ['inm-A'] }) }))).toBe(false);
    expect(permite('delete', peticion({ auth: null, resource: null }))).toBe(false);
  });

  it('R.12 delete de la administración', () => {
    expect(permite('delete', peticion({ auth: ADMIN }))).toBe(true);
  });

  it('R.13 update con un documento corrupto (esquema viejo) se rechaza', () => {
    expect(permite('update', peticion({ resource: docEstado({ esquema: 0 }), requestResource: docEstado({ esquema: 0, estado: 'ERROR' }) }))).toBe(false);
  });

  it('R.14 update con credenciales se rechaza igual que create (la segunda barrera no se olvida)', () => {
    expect(permite('update', peticion({ requestResource: docEstado({ accessToken: 'x' }) }))).toBe(false);
    expect(permite('update', peticion({ requestResource: docEstado({ credenciales: { usuario: 'x' } }) }))).toBe(false);
  });
});

describe('REGLAS · R15. Coherencia con el contrato del ERP', () => {
  it('R.15 los enums de las reglas son los del motor y los del dominio (ni más ni menos)', () => {
    const bloque = SIN_COMENTARIOS(bloqueDe(COLECCION));
    const estados = (bloque.match(/\(incoming\(\)\.estado in \[([^\]]+)\]/) || [])[1] || '';
    const listaEstados = estados.split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean);
    expect(listaEstados.sort()).toEqual([...ESTADOS_PUBLICACION].sort());

    const ops = (bloque.match(/incoming\(\)\.ultimaOperacion in \[([^\]]+)\]/) || [])[1] || '';
    const listaOps = ops.split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean);
    // Las operaciones registrables del dominio: si el dominio añade una, la regla debe
    // acompañarla (o el panel se encontrará con escrituras denegadas). Se compara con la
    // lista que el propio dominio declara como `OperacionSindicacionRegistrada`.
    const dominio = readFileSync(path.resolve(__dirname, '../src/sindicacion/estadoRepositorio.ts'), 'utf8');
    const bloqueOps = dominio.slice(dominio.indexOf('export type OperacionSindicacionRegistrada'), dominio.indexOf('export type ResultadoOperacionSindicacion'));
    const esperadas = [...bloqueOps.matchAll(/'([a-zA-Z_]+)'/g)].map((m) => m[1]);
    expect(listaOps.slice().sort()).toEqual(esperadas.slice().sort());

    const res = (bloque.match(/incoming\(\)\.ultimoResultado in \[([^\]]+)\]/) || [])[1] || '';
    const listaRes = res.split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean);
    const bloqueRes = dominio.slice(dominio.indexOf('export type ResultadoOperacionSindicacion'), dominio.indexOf('export type ResultadoEscritura'));
    const esperadosRes = [...bloqueRes.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(listaRes.slice().sort()).toEqual(esperadosRes.slice().sort());
  });

  it('R.15b todo campo citado por el bloque existe en el registro que escribe el dominio', () => {
    // Un nombre mal escrito en las reglas (p. ej. `proprietarioId`) NO falla al desplegar:
    // falla en producción negando escrituras legítimas. Este test ata los nombres de campo
    // del bloque a las claves reales de `construirRegistroEstado`.
    const bloque = SIN_COMENTARIOS(bloqueDe(COLECCION));
    const citados = [...bloque.matchAll(/(?:incoming\(\)|existing\(\)|resource\.data|request\.resource\.data)\.([A-Za-z_][A-Za-z0-9_]*)/g)]
      .map((m) => m[1]);
    expect(citados.length).toBeGreaterThan(8);
    const dominio = readFileSync(path.resolve(__dirname, '../src/sindicacion/estadoRepositorio.ts'), 'utf8');
    const cuerpo = dominio.slice(dominio.indexOf('export function construirRegistroEstado'), dominio.indexOf('/** Trazabilidad del evento'));
    const escritas = [...cuerpo.matchAll(/registro\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g)].map((m) => m[1]);
    const iniciales = [...cuerpo.matchAll(/^\s{4}([A-Za-z_][A-Za-z0-9_]*):/gm)].map((m) => m[1]);
    const abreviadas = [...cuerpo.matchAll(/^\s{4}([A-Za-z_][A-Za-z0-9_]*),\s*$/gm)].map((m) => m[1]);
    const claves = new Set([...escritas, ...iniciales, ...abreviadas]);
    for (const campo of [...new Set(citados)]) {
      expect(claves.has(campo), `el campo ${campo} de firestore.rules no lo escribe el dominio`).toBe(true);
    }
  });

  it('R.15c los guardas obligatorias del create/update siguen presentes (ni una se puede colar fuera)', () => {
    const bloque = SIN_COMENTARIOS(bloqueDe(COLECCION));
    const permisos = permisosDe(bloque);
    for (const verbo of ['create', 'update']) {
      const condicion = permisos.get(verbo)!.condicion;
      expect(condicion, verbo).toContain('documentoCoherente()');
      expect(condicion, verbo).toContain('isValidId(docId)');
    }
    const coherente = funcionesDe(bloque).get('documentoCoherente')!.cuerpo;
    for (const campo of ['id', 'externalId', 'clave', 'inmuebleId', 'portal', 'propietarioId', 'estado', 'ultimaOperacion', 'ultimoResultado', 'esquema']) {
      expect(coherente, campo).toContain(`.${campo}`);
    }
    expect(coherente).toContain('sinSecretosSindicacion()');
    // identidad estructural invariable en update (nadie reasigna el registro)
    const update = permisos.get('update')!.condicion;
    for (const campo of ['id', 'externalId', 'clave', 'inmuebleId', 'portal', 'propietarioId']) {
      expect(update, campo).toContain(`request.resource.data.${campo} == existing().${campo}`);
    }
    expect(permisos.get('delete')!.condicion.trim()).toBe('isMasterAdmin()');
  });

  it('R.16 el id del documento es el externalId (idPublico NUNCA es clave primaria)', () => {
    const bloque = SIN_COMENTARIOS(bloqueDe(COLECCION));
    expect(bloque).toContain('incoming().id == docId');
    expect(bloque).toContain('incoming().externalId == docId');
    expect(bloque).not.toContain('idPublico == docId');
    // y el `hash` del externalId no se puede rehacer en reglas: se documenta, no se finge
    // (forma método `.matches('…')`, la que entiende el evaluador de reglas de la canónica)
    expect(bloque).toContain(".matches('");
  });

  it('R.17 auto-suficiencia: todo lo que llama §38 está definido en el MISMO fichero', () => {
    // `firestore.rules` se despliega como fichero entero y el lenguaje de reglas no resuelve
    // nombres fuera de él: un bloque que llame a un helper inexistente no falla al commitear,
    // falla al DESPLEGAR. Esta prueba es la que autoriza a comitear §38 antes que el resto de
    // fases: si el corte es auto-suficiente, el fichero que queda en el commit es evaluable.
    const bloque = bloqueDe(COLECCION);
    const cuerpo = SIN_COMENTARIOS(bloque);
    const definidas = new Map([...funcionesDe(cuerpoRaiz()), ...funcionesDe(bloque)]);
    const BUILTINS = new Set(['get', 'exists', 'incoming', 'existing', 'size', 'keys', 'values', 'hasAny']);
    const llamadas = new Set([...cuerpo.matchAll(/(?:^|[^.\w$])([a-z][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]));
    expect(llamadas.size).toBeGreaterThan(4);
    for (const nombre of llamadas) {
      if (BUILTINS.has(nombre)) continue;
      expect(definidas.has(nombre), `§38 llama a ${nombre}() y no está definido en el fichero`).toBe(true);
    }
    // Los helpers de identidad son los canónicos del ERP, definidos UNA vez en el cuerpo raíz.
    // §38 no puede traer su propia copia: dos criterios de ownership es el peor bug posible.
    for (const nombre of ['activeUser', 'isPropietarioRole', 'myPropId', 'myInmuebleIds', 'canReachInmuebleId', 'sinSecretosSindicacion']) {
      expect(cuerpoRaiz().split(`function ${nombre}(`).length - 1, `${nombre} definido en el cuerpo raíz`).toBe(1);
      expect(cuerpo.includes(`function ${nombre}(`), `${nombre} redefinido dentro de §38`).toBe(false);
    }
    // y §38 no se inventa un criterio: el acceso a inmuebles ES el de la cartera del espejo
    // (`myInmuebleIds()`), el mismo que usan el resto de colecciones del ERP
    expect(funcionesDe(cuerpoRaiz()).get('canReachInmuebleId')!.cuerpo).toContain('myInmuebleIds()');
    expect(cuerpo).not.toMatch(/function\s+(canReach|owns|esMio|accesoA|visible)\w*\s*\(/);
  });

  it('R.17b el ownership de §38 ES el del espejo de identidad: rol, estado y cartera mandan', () => {
    const doc = docEstado();
    // propietario ACTIVO con el inmueble en su cartera ⇒ escribe y consulta
    expect(permite('create', peticion({ resource: null, requestResource: doc }))).toBe(true);
    expect(permite('list', peticion({ resource: doc }))).toBe(true);
    // el mismo usuario, suspendido en el espejo: `activeUser()` es la puerta de todo
    expect(permite('create', peticion({ resource: null, requestResource: doc, espejoDoc: espejo({ estado: 'SUSPENDIDO' }) }))).toBe(false);
    expect(permite('get', peticion({ espejoDoc: espejo({ estado: 'SUSPENDIDO' }) }))).toBe(false);
    // usuario activo que no es PROPIETARIO (inquilino, profesional, técnico)
    expect(permite('create', peticion({ resource: null, requestResource: doc, espejoDoc: espejo({ tipoPerfil: 'INQUILINO' }) }))).toBe(false);
    expect(permite('get', peticion({ espejoDoc: espejo({ tipoPerfil: 'PROFESIONAL' }) }))).toBe(false);
    // espejo sin identidad de propietario: la condición del `list` no se puede demostrar
    expect(permite('list', peticion({ resource: doc, espejoDoc: espejo({ propietarioId: null }) }))).toBe(false);
    // inmueble COMPARTIDO (en la cartera pero de otra titularidad): leer el documento sí,
    // la consulta por cartera no. Es exactamente el criterio de §2 (get y list no son iguales).
    const compartido = { ...doc, propietarioId: 'prop-OTRA' };
    expect(permite('get', peticion({ resource: compartido }))).toBe(true);
    expect(permite('list', peticion({ resource: compartido }))).toBe(false);
    // la administración, siempre (y sin necesitar el espejo)
    expect(permite('list', peticion({ auth: ADMIN, resource: compartido, espejoDoc: null }))).toBe(true);
    expect(permite('delete', peticion({ auth: ADMIN, espejoDoc: null }))).toBe(true);
  });
});
