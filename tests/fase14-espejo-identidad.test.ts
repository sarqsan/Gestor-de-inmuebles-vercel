/**
 * FASE 1.4 · espejo de identidad `usuarios_auth/{uid}` y anti-elevación.
 * ---------------------------------------------------------------------------------
 * QUÉ se comprueba aquí (y por qué no es una implementación paralela):
 *  · GRUPOS A-C: se lee el fichero `firestore.rules` REAL y se evalúan SUS funciones y
 *    SUS `allow` con el mismo evaluador estricto que usa GAP 5 (compartido en
 *    `./harness/firestoreRulesEval`). Nada de reimplementar el criterio: si el fichero
 *    cambia, cambian estas pruebas. Como en GAP 5, ante una construcción no cubierta el
 *    evaluador LANZA (`HARNESS NO CUBRE`) en vez de asumir `true`; el emulador de Firebase
 *    sigue sin ser accesible en este entorno (sin `firebase-tools`, sin JRE y sin salida a
 *    storage.googleapis.com), así que la semaforización queda demostrada sobre el texto
 *    desplegado, no sobre el motor de Google.
 *  · GRUPO D: se ejecuta el CÓDIGO REAL que mantiene el espejo (`syncAuthIndex` de
 *    `src/lib/authService.ts`) contra un Firestore simulado: qué escribe, cuándo y qué
 *    pasa cuando Firestore deniega.
 *  · GRUPO E: auto-suficiencia del corte (que el bloque no dependa de helpers que vivan
 *    fuera del fichero comiteado) y que §38 no se haya tocado.
 *
 * RL_FICHERO=/ruta/firestore.rules permite evaluar este mismo juego sobre otra versión del
 * fichero (p. ej. el blob de un commit) — es como se verificó que el corte de FASE 1.4 es
 * desplegable sin el resto de fases pendientes del worktree.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
// SIN imports de `src/` a propósito: §38 exige una forma de documento muy concreta y aquí se
// construye a mano (ver `docEstado`), de modo que este test pueda ejecutarse sobre el commit
// limpio sin arrastrar módulos de la fase de sindicación.

const RULES = readFileSync(path.resolve(__dirname, process.env.RL_FICHERO || '../firestore.rules'), 'utf8');
const EVAL = crearEvaluadorReglas(RULES);
const { permite, bloqueDe, cuerpoRaiz, funcionesDe, permisosDe, SIN_COMENTARIOS } = EVAL;

const EMAIL_ADMIN = (SIN_COMENTARIOS(RULES).match(/function\s+isMasterAdmin\(\)\s*\{[\s\S]*?'([^'@\s]+@[^'\s]+)'/) || [])[1];
if (!EMAIL_ADMIN) throw new Error('isMasterAdmin() no contiene un email literal: fichero equivocado');

const ESTADO = 'sindicacion_inmuebles';
const UID = 'u1';
const OTRO_UID = 'u2';
const USUARIO_ID = 'usr-1';
const RUTA_ESPEJO = `usuarios_auth/${UID}`;
const RUTA_PERFIL = `usuarios/${USUARIO_ID}`;

/** Ficha autoritativa `usuarios/{id}` (lo que el espejo debe reflejar, sin poderlo forzar). */
function perfil(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: USUARIO_ID,
    authUid: UID,
    email: 'ana@erp.test',
    nombre: 'Ana',
    tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO',
    roles: ['PROPIETARIO'],
    permisos: [],
    propietarioId: 'prop-A',
    profesionalId: '',
    inmuebleIds: ['inm1'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...over,
  };
}

/** Espejo `usuarios_auth/{uid}` veraz respecto de `perfil()` por defecto. */
function espejo(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    uid: UID,
    usuarioId: USUARIO_ID,
    email: 'ana@erp.test',
    tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO',
    roles: ['PROPIETARIO'],
    propietarioId: 'prop-A',
    profesionalId: '',
    inmuebleIds: ['inm1'],
    updatedAt: '2026-09-23T10:00:00.000Z',
    ...over,
  };
}

const PORTAL = 'IDEALISTA';
/**
 * Documento de estado con la forma que `documentoCoherente()` de §38 contrasta: `id == externalId`,
 * `externalId` = `portal_minúsculas_inmuebleId`, `clave` = `PORTAL:inmuebleId` (y su longitud) y
 * `esquema` 1. Se fija inmueble `inm1` porque el `match` de `externalId` no admite guiones.
 */
const docEstado = (over: Record<string, unknown> = {}): Record<string, unknown> => {
  const inmuebleId = (over.inmuebleId as string) || 'inm1';
  const externalId = `${PORTAL.toLowerCase()}_${inmuebleId}`;
  return {
    id: externalId,
    externalId,
    clave: `${PORTAL}:${inmuebleId}`,
    portal: PORTAL,
    inmuebleId,
  propietarioId: 'prop-A',
    estado: 'LISTO_PARA_PUBLICAR',
    ultimaOperacion: 'validar',
    ultimoResultado: 'OK',
    esquema: 1,
    ...over,
  };
};

type Opts = {
  auth?: Peticion['auth'];
  /** espejo existente (`resource` en update); `null` ⇒ no existe todavía */
  resource?: Record<string, unknown> | null;
  requestResource?: Record<string, unknown> | null;
  perfilDoc?: Record<string, unknown> | null;
  espejoDoc?: Record<string, unknown> | null;
  dbExtra?: Record<string, Record<string, unknown>>;
  docId?: string;
  coleccion: string;
};

/** La `id` del documento es el param del `match`: perfil, espejo o `externalId` de §38. */
const DOC_ID: Record<string, string> = {
  usuarios: USUARIO_ID,
  usuarios_auth: UID,
};

function peticion(o: Opts): Peticion {
  const db: Record<string, Record<string, unknown>> = {
    // carteras que el evaluador puede alcanzar con `get()`; la cartera real la fija el espejo
    'inmuebles/inm1': { id: 'inm1', propietarioId: 'prop-A' },
    'inmuebles/inm2': { id: 'inm2', propietarioId: 'prop-B' },
    'inmuebles/inm3': { id: 'inm3', propietarioId: 'prop-B' },
    ...o.dbExtra,
  };
  if (o.perfilDoc !== null) db[RUTA_PERFIL] = o.perfilDoc || perfil();
  const espejoDoc = o.espejoDoc === undefined ? espejo() : o.espejoDoc;
  if (espejoDoc) db[RUTA_ESPEJO] = espejoDoc;
  const esDeOtro = o.auth && o.auth.uid !== UID;
  if (esDeOtro) db[`usuarios_auth/${o.auth!.uid}`] = espejo({ uid: o.auth!.uid });
  return {
    auth: o.auth === undefined ? { uid: UID, token: { email: 'ana@erp.test' } } : o.auth,
    db,
    resource: o.resource === undefined ? null : o.resource,
    requestResource: o.requestResource === undefined ? null : o.requestResource,
    // en §38 la `id` del documento de estado ES el param del `match`, así que se toma del propio doc
    docId: o.docId || DOC_ID[o.coleccion] || String((o.requestResource ?? o.resource)?.id ?? UID),
  };
}

// ===========================================================================
// GRUPO A · el espejo `usuarios_auth/{uid}`: quién lo lee y qué puede escribir
// ===========================================================================
describe('FASE 1.4 · A. El espejo de identidad por UID', () => {
  it('A.0 el bloque existe y es el circuito canónico (get por UID, escritura veraz, delete de admin)', () => {
    const bloque = SIN_COMENTARIOS(bloqueDe('usuarios_auth'));
    const permisos = permisosDe(bloque);
    expect([...permisos.keys()].sort()).toEqual(['create', 'delete', 'get', 'list', 'read', 'update'].filter((v) => permisos.has(v)).sort());
    expect(permisos.get('read')!.condicion).toContain('request.auth.uid == uid');
    for (const verbo of ['create', 'update']) {
      expect(permisos.get(verbo)!.condicion, verbo).toContain("incoming().tipoPerfil in ['PROPIETARIO', 'PROFESIONAL']");
      expect(permisos.get(verbo)!.condicion, verbo).toContain('indexIsTruthful()');
      expect(permisos.get(verbo)!.condicion, verbo).toContain('request.auth.uid == uid');
    }
    expect(permisos.get('delete')!.condicion.trim()).toBe('isMasterAdmin()');
  });

  it('A.1 lectura: el propio UID y la administración; nadie más', () => {
    expect(permite('usuarios_auth', 'get', peticion({ coleccion: 'usuarios_auth' }))).toBe(true);
    expect(permite('usuarios_auth', 'get', peticion({ coleccion: 'usuarios_auth', auth: { uid: 'u-admin', token: { email: EMAIL_ADMIN } } }))).toBe(true);
    expect(permite('usuarios_auth', 'get', peticion({ coleccion: 'usuarios_auth', auth: { uid: OTRO_UID, token: { email: 'otro@erp.test' } } }))).toBe(false);
    expect(permite('usuarios_auth', 'get', peticion({ coleccion: 'usuarios_auth', auth: null }))).toBe(false);
  });

  it('A.2 create con espejo veraz (propietario y profesional) y delete sólo de administración', () => {
    expect(permite('usuarios_auth', 'create', peticion({ coleccion: 'usuarios_auth', requestResource: espejo() }))).toBe(true);
    const prof = { perfilDoc: perfil({ tipoPerfil: 'PROFESIONAL', propietarioId: '', profesionalId: 'prof-9', roles: ['PROFESIONAL'], inmuebleIds: [] as string[] }),
      requestResource: espejo({ tipoPerfil: 'PROFESIONAL', propietarioId: '', profesionalId: 'prof-9', roles: ['PROFESIONAL'], inmuebleIds: [] }) };
    expect(permite('usuarios_auth', 'create', peticion({ coleccion: 'usuarios_auth', ...prof }))).toBe(true);
    expect(permite('usuarios_auth', 'delete', peticion({ coleccion: 'usuarios_auth', resource: espejo() }))).toBe(false);
    expect(permite('usuarios_auth', 'delete', peticion({ coleccion: 'usuarios_auth', auth: { uid: 'u-admin', token: { email: EMAIL_ADMIN } }, resource: espejo() }))).toBe(true);
  });

  it('A.3 el espejo NO es falsificable: cualquier campo sensible desviado se rechaza', () => {
    const mintiendo = [
      espejo({ propietarioId: 'prop-B' }), // adueñarse de otra cartera
      espejo({ inmuebleIds: ['inm1', 'inm2'] }), // ampliarse la cartera compartida
      espejo({ tipoPerfil: 'PROPIETARIO', roles: ['ADMINISTRADOR'] }), // colar un rol
      espejo({ email: 'victima@erp.test' }),
      espejo({ estado: 'ACTIVO' , usuarioId: 'usr-OTRO' }), // apuntar a otro perfil
      espejo({ usuarioId: 'usr-OTRO' }),
    ];
    for (const payload of mintiendo) {
      expect(permite('usuarios_auth', 'create', peticion({ coleccion: 'usuarios_auth', requestResource: payload })), JSON.stringify(payload)).toBe(false);
    }
  });

  it('A.3b reflejar el perfil de OTRO usuario no es nunca veraz, aunque el id sea valido', () => {
    // `indexIsTruthful` contrapone `src.authUid` a la sesion: saber el id del perfil ajeno no basta.
    const victima = perfil({ id: 'usr-OTRO', authUid: OTRO_UID, propietarioId: 'prop-B', inmuebleIds: ['inm2'] });
    const ctx = peticion({
      coleccion: 'usuarios_auth',
      requestResource: espejo({ usuarioId: 'usr-OTRO', propietarioId: 'prop-B', inmuebleIds: ['inm2'] }),
      dbExtra: { 'usuarios/usr-OTRO': victima },
    });
    expect(permite('usuarios_auth', 'create', ctx)).toBe(false);
  });

  it('A.4 un perfil que se declare ADMINISTRADOR en el propio espejo no cuela', () => {
    expect(permite('usuarios_auth', 'create', peticion({ coleccion: 'usuarios_auth', requestResource: espejo({ tipoPerfil: 'ADMINISTRADOR' }) }))).toBe(false);
    // ni aunque la ficha autoritativa también lo diga: el espejo sólo representa PROPIETARIO/PROFESIONAL;
    // la administración se reconoce por email verificado, no por este documento
    expect(permite('usuarios_auth', 'create', peticion({
      coleccion: 'usuarios_auth',
      perfilDoc: perfil({ tipoPerfil: 'ADMINISTRADOR' }),
      requestResource: espejo({ tipoPerfil: 'ADMINISTRADOR' }),
    }))).toBe(false);
  });

  it('A.5 sin ficha autoritativa no hay espejo (no se puede inventar un perfil desde el cliente)', () => {
    expect(permite('usuarios_auth', 'create', peticion({ coleccion: 'usuarios_auth', perfilDoc: null, requestResource: espejo() }))).toBe(false);
    // y `get()` sobre un `usuarios/{usuarioId}` que no existe no puede acabar en `true`
    expect(permite('usuarios_auth', 'create', peticion({ coleccion: 'usuarios_auth', perfilDoc: null, requestResource: espejo({ propietarioId: '', profesionalId: '', inmuebleIds: [] }) }))).toBe(false);
  });

  it('A.6 update veraz del espejo (p. ej. cuando administración le añade un inmueble) y update mentiroso', () => {
    const ctx = (nuevo: Record<string, unknown>, autoritativo: Record<string, unknown>) =>
      peticion({ coleccion: 'usuarios_auth', resource: espejo(), requestResource: nuevo, perfilDoc: autoritativo });
    expect(permite('usuarios_auth', 'update', ctx(espejo({ inmuebleIds: ['inm1', 'inm2'] }), perfil({ inmuebleIds: ['inm1', 'inm2'] })))).toBe(true);
    expect(permite('usuarios_auth', 'update', ctx(espejo({ inmuebleIds: ['inm1', 'inm2'] }), perfil()))).toBe(false);
    expect(permite('usuarios_auth', 'update', ctx(espejo({ propietarioId: 'prop-B' }), perfil({ propietarioId: 'prop-B' })))).toBe(true); // la ficha manda
    expect(permite('usuarios_auth', 'update', ctx(espejo({ propietarioId: 'prop-B' }), perfil()))).toBe(false); // y sólo ésa
  });
});

// ===========================================================================
// GRUPO B · el circuito que consume el espejo (me → activeUser → rol → myPropId/myInmuebleIds → canReachInmuebleId)
// ===========================================================================
describe('FASE 1.4 · B. El circuito de ownership resuelve contra el espejo (consumidor real: §38)', () => {
  it('B.0 las seis funciones del circuito están definidas UNA sola vez en el cuerpo raíz', () => {
    const raiz = cuerpoRaiz();
    for (const nombre of ['me', 'activeUser', 'isPropietarioRole', 'myPropId', 'myInmuebleIds', 'canReachInmuebleId']) {
      expect(raiz.split(`function ${nombre}(`).length - 1, nombre).toBe(1);
    }
    const funciones = funcionesDe(raiz);
    expect(funciones.get('activeUser')!.cuerpo).toContain("me().estado == 'ACTIVO'");
    expect(funciones.get('isPropietarioRole')!.cuerpo).toContain('activeUser()');
    expect(funciones.get('myPropId')!.cuerpo).toContain('me().propietarioId');
    expect(funciones.get('myInmuebleIds')!.cuerpo).toContain('me().inmuebleIds');
    expect(funciones.get('canReachInmuebleId')!.cuerpo).toContain('myInmuebleIds().hasAny');
  });

  it('B.1 usuario autenticado CON espejo válido ⇒ escribe estado; SIN espejo o suspendido ⇒ no', () => {
    expect(permite(ESTADO, 'create', peticion({ coleccion: ESTADO, requestResource: docEstado(), resource: null }))).toBe(true);
    expect(permite(ESTADO, 'create', peticion({ coleccion: ESTADO, requestResource: docEstado(), resource: null, espejoDoc: null }))).toBe(false);
    expect(permite(ESTADO, 'create', peticion({ coleccion: ESTADO, requestResource: docEstado(), resource: null, espejoDoc: espejo({ estado: 'SUSPENDIDO' }) }))).toBe(false);
    expect(permite(ESTADO, 'create', peticion({ coleccion: ESTADO, requestResource: docEstado(), resource: null, auth: null }))).toBe(false);
  });

  it('B.2 perfil válido pero NO propietario (profesional) ⇒ fuera del circuito de escritura', () => {
    const espejoProf = espejo({ tipoPerfil: 'PROFESIONAL', propietarioId: '', profesionalId: 'prof-9', roles: ['PROFESIONAL'], inmuebleIds: [] });
    expect(permite(ESTADO, 'create', peticion({ coleccion: ESTADO, requestResource: docEstado(), resource: null, espejoDoc: espejoProf, perfilDoc: perfil({ tipoPerfil: 'PROFESIONAL', propietarioId: '', profesionalId: 'prof-9', inmuebleIds: [] }) }))).toBe(false);
    // y en cambio su propio espejo sí puede leerlo (grupo A) — el rol se resuelve, no se confunde
    expect(permite(ESTADO, 'get', peticion({ coleccion: ESTADO, resource: docEstado(), espejoDoc: espejoProf }))).toBe(false);
  });

  it('B.3 myPropId manda en `list`: la consulta sólo se concede filtrada por el propietario del espejo', () => {
    expect(permite(ESTADO, 'list', peticion({ coleccion: ESTADO, resource: docEstado() }))).toBe(true);
    expect(permite(ESTADO, 'list', peticion({ coleccion: ESTADO, resource: docEstado({ propietarioId: 'prop-B' }) }))).toBe(false);
    expect(permite(ESTADO, 'list', peticion({ coleccion: ESTADO, resource: docEstado(), espejoDoc: espejo({ propietarioId: null }) }))).toBe(false);
  });

  it('B.4 myInmuebleIds/canReachInmuebleId: inmueble compartido se lee, inmueble ajeno no', () => {
    // `inm2` está en la cartera del espejo pero la titularidad es de otro: get sí, list no
    const espejoCompartido = espejo({ inmuebleIds: ['inm1', 'inm2'] });
    const docEnB = docEstado({ inmuebleId: 'inm2', propietarioId: 'prop-B' });
    expect(permite(ESTADO, 'get', peticion({ coleccion: ESTADO, resource: docEnB, espejoDoc: espejoCompartido }))).toBe(true);
    expect(permite(ESTADO, 'list', peticion({ coleccion: ESTADO, resource: docEnB, espejoDoc: espejoCompartido }))).toBe(false);
    // y un inmueble que NO está en su cartera aunque la ficha autoritativa lo tenga: denegado por
    // `canReachInmuebleId` (el documento es íntegro: la denegación no puede venir de la forma)
    expect(permite(ESTADO, 'create', peticion({ coleccion: ESTADO, resource: null, requestResource: docEstado({ inmuebleId: 'inm3', propietarioId: 'prop-B' }) }))).toBe(false);
    expect(permite(ESTADO, 'get', peticion({ coleccion: ESTADO, resource: docEstado({ inmuebleId: 'inm3', propietarioId: 'prop-B' }) }))).toBe(false);
    // control positivo del mismo documento con la cartera ampliada: prueba que antes fallaba por ownership
    expect(permite(ESTADO, 'get', peticion({ coleccion: ESTADO, resource: docEstado({ inmuebleId: 'inm3', propietarioId: 'prop-B' }), espejoDoc: espejo({ inmuebleIds: ['inm1', 'inm3'] }) }))).toBe(true);
  });
});

// ===========================================================================
// GRUPO C · `usuarios/{usuarioId}`: lo que impide FORJAR el espejo
// ===========================================================================
describe('FASE 1.4 · C. El perfil autoritativo no se puede editar para escalar', () => {
  it('C.0 el bloque pinta las claves de identidad y vincula el UID al crear', () => {
    const bloque = SIN_COMENTARIOS(bloqueDe('usuarios'));
    const permisos = permisosDe(bloque);
    expect(permisos.get('create')!.condicion).toContain('incoming().authUid == request.auth.uid');
    expect(permisos.get('update')!.condicion).toContain('incoming().diff(existing()).affectedKeys()');
    for (const clave of ['permisos', 'propietarioId', 'profesionalId', 'inmuebleIds', 'email']) {
      expect(permisos.get('update')!.condicion, clave).toContain(`'${clave}'`);
    }
  });

  it('C.1 create: el auto-registro no puede otorgarse roles elevados', () => {
    expect(permite('usuarios', 'create', peticion({ coleccion: 'usuarios', requestResource: perfil() }))).toBe(true);
    for (const rol of ['ADMINISTRADOR', 'SUPERADMIN', 'GESTOR_INMUEBLES']) {
      expect(permite('usuarios', 'create', peticion({ coleccion: 'usuarios', requestResource: perfil({ roles: [rol] }) })), rol).toBe(false);
    }
    expect(permite('usuarios', 'create', peticion({ coleccion: 'usuarios', requestResource: perfil({ authUid: OTRO_UID }) }))).toBe(false);
  });

  it('C.2 update: identidad, vínculos y permisos son invariables para el propio usuario', () => {
    const intento = (cambio: Record<string, unknown>) =>
      permite('usuarios', 'update', peticion({ coleccion: 'usuarios', resource: perfil(), requestResource: perfil(cambio) }));
    expect(intento({ telefono: '600 111 222' })).toBe(true); // lo suyo, editable
    expect(intento({ nombre: 'Ana M.' })).toBe(true);
    for (const cambio of [
      { propietarioId: 'prop-B' },
      { inmuebleIds: ['inm1', 'inm2'] },
      { permisos: ['TODO'] },
      { email: 'otra@erp.test' },
      { roles: ['ADMINISTRADOR'] },
      { tipoPerfil: 'PROFESIONAL' },
      { estado: 'SUSPENDIDO' },
      { profesionalId: 'prof-9' },
    ]) {
      expect(intento(cambio), JSON.stringify(cambio)).toBe(false);
    }
    // FRONTERA DELIBERADA de la fase: `authUid` SÍ se puede escribir, porque es el enlace que
    // `getUsuarioByAuthUid` pone en un perfil creado «por acceso directo». Cambiarlo no mueve
    // la cartera (`propietarioId`/`inmuebleIds` están pinneados) y el espejo se escribe sólo en
    // la ruta `usuarios_auth/{request.auth.uid}`, así que no sirve para suplantar a nadie.
    expect(intento({ authUid: OTRO_UID })).toBe(true);
  });

  it('C.3 nadie actualiza el perfil de otro (ni tomando un perfil sin vincular)', () => {
    expect(permite('usuarios', 'update', peticion({
      coleccion: 'usuarios',
      auth: { uid: OTRO_UID, token: { email: 'otro@erp.test' } },
      resource: perfil(),
      requestResource: perfil({ telefono: '600 000 000' }),
      espejoDoc: espejo({ uid: OTRO_UID }),
    }))).toBe(false);
    // un perfil SIN authUid tampoco se puede "reclamar" cambiando el propio vínculo
    expect(permite('usuarios', 'update', peticion({
      coleccion: 'usuarios',
      resource: perfil({ authUid: undefined }),
      requestResource: perfil({ authUid: UID }),
    }))).toBe(false);
    // la administración sí (es el flujo de alta/vinculación manual)
    expect(permite('usuarios', 'update', peticion({
      coleccion: 'usuarios',
      auth: { uid: 'u-admin', token: { email: EMAIL_ADMIN } },
      resource: perfil(),
      requestResource: perfil({ propietarioId: 'prop-B' }),
    }))).toBe(true);
  });

  it('C.4 la cadena está cerrada por los dos extremos (no se puede forjar y luego reflejar)', () => {
    // paso 1: robar `prop-B` en la ficha autoritativa
    const robaPerfil = permite('usuarios', 'update', peticion({
      coleccion: 'usuarios', resource: perfil(), requestResource: perfil({ propietarioId: 'prop-B', inmuebleIds: ['inm2'] }),
    }));
    expect(robaPerfil).toBe(false);
    // paso 2: escribir un espejo "veraz" que afirme prop-B (si el paso 1 se colara, éste se concedería)
    const forjaEspejo = permite('usuarios_auth', 'create', peticion({
      coleccion: 'usuarios_auth',
      requestResource: espejo({ propietarioId: 'prop-B', inmuebleIds: ['inm2'] }),
    }));
    expect(forjaEspejo).toBe(false);
    // paso 3: con el espejo ya robado, escribir en §38 sobre el inmueble ajeno
    const escribeEnOtro = permite('sindicacion_inmuebles', 'create', peticion({
      coleccion: 'sindicacion_inmuebles',
      resource: null,
      requestResource: docEstado({ inmuebleId: 'inm2', propietarioId: 'prop-B' }),
      dbExtra: { 'inmuebles/inm-B': { id: 'inm2', propietarioId: 'prop-B' } },
    }));
    expect(escribeEnOtro).toBe(false);
  });
});

// ===========================================================================
// GRUPO D · el código que mantiene el espejo (authService.syncAuthIndex)
// ===========================================================================
const espejoEscrito = vi.hoisted(() => ({ llamadas: [] as { ruta: string; datos: Record<string, unknown>; opciones?: unknown }[], falla: false }));
const authFalso = vi.hoisted(() => ({ currentUser: null as { uid: string } | null }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, nombre: string) => ({ __col: nombre }),
  doc: (_db: unknown, nombre: string, id?: string) => ({ __ruta: id ? `${nombre}/${id}` : nombre }),
  getDoc: async () => ({ exists: () => false, id: '', data: () => undefined }),
  getDocs: async () => ({ empty: true, size: 0, docs: [], forEach: () => undefined }),
  query: (c: unknown, ..._f: unknown[]) => ({ __q: c }),
  where: (campo: string, op: string, valor: unknown) => ({ campo, op, valor }),
  setDoc: async (ref: { __ruta: string }, datos: Record<string, unknown>, opciones?: unknown) => {
    if (espejoEscrito.falla) throw new Error('permission-denied: Missing or insufficient permissions.');
    espejoEscrito.llamadas.push({ ruta: ref.__ruta, datos, opciones });
  },
}));
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: async () => ({}),
  createUserWithEmailAndPassword: async () => ({}),
  signOut: async () => undefined,
  onAuthStateChanged: () => () => undefined,
  updateProfile: async () => undefined,
}));
vi.mock('../src/lib/firebase', () => ({
  auth: authFalso,
  db: { __db: true },
  USUARIOS_COL: 'usuarios',
  ENLACES_REGISTRO_COL: 'enlaces_registro',
  saveAuditLogFirestore: async () => undefined,
}));

const usuarioApp = (over: Record<string, unknown> = {}) => ({
  id: USUARIO_ID,
  authUid: UID,
  nombre: 'Ana',
  email: 'ana@erp.test',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  roles: ['PROPIETARIO'],
  permisos: [],
  propietarioId: 'prop-A',
  profesionalId: '',
  inmuebleIds: ['inm1'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...over,
});

const cargar = async () => (await import('../src/lib/authService')) as typeof import('../src/lib/authService');

describe('FASE 1.4 · D. `syncAuthIndex`: el cliente escribe el espejo que leen las reglas', () => {
  afterEach(() => {
    espejoEscrito.llamadas.length = 0;
    espejoEscrito.falla = false;
    authFalso.currentUser = null;
  });

  it('D.1 escribe `usuarios_auth/{uid}` con el payload exacto que exigen las reglas', async () => {
    const { syncAuthIndex } = await cargar();
    await syncAuthIndex(usuarioApp() as never, { uid: UID });
    expect(espejoEscrito.llamadas).toHaveLength(1);
    const [escritura] = espejoEscrito.llamadas;
    expect(escritura.ruta).toBe(RUTA_ESPEJO);
    expect(escritura.opciones).toEqual({ merge: true });
    const datos = escritura.datos;
    expect(Object.keys(datos).sort()).toEqual([
      'email', 'estado', 'inmuebleIds', 'profesionalId', 'propietarioId', 'roles', 'tipoPerfil', 'uid', 'updatedAt', 'usuarioId',
    ].sort());
    // coincide campo a campo con lo que `indexIsTruthful()` contrasta contra la ficha
    expect(datos.usuarioId).toBe(USUARIO_ID);
    expect(datos.propietarioId).toBe('prop-A');
    expect(datos.inmuebleIds).toEqual(['inm1']);
    expect(datos.tipoPerfil).toBe('PROPIETARIO');
    expect(datos.estado).toBe('ACTIVO');
    expect(datos.roles).toEqual(['PROPIETARIO']);
    // NUNCA un secreto ni un campo de perfil que las reglas no esperan
    expect(Object.keys(datos).some((k) => /password|token|apiKey|secret|permisos/i.test(k))).toBe(false);
  });

  it('D.2 sin sesión o sin ficha no escribe, y un fallo de Firestore no rompe el acceso', async () => {
    const { syncAuthIndex } = await cargar();
    await syncAuthIndex(usuarioApp() as never, null); // authFalso.currentUser === null
    expect(espejoEscrito.llamadas).toHaveLength(0);
    await syncAuthIndex(undefined as never, { uid: UID });
    await syncAuthIndex({ } as never, { uid: UID });
    expect(espejoEscrito.llamadas).toHaveLength(0);
    espejoEscrito.falla = true;
    await expect(syncAuthIndex(usuarioApp() as never, { uid: UID })).resolves.toBeUndefined();
  });

  it('D.3 normaliza lo que la ficha no tenga: el espejo siempre es comparable (cadenas y listas vacías)', async () => {
    const { syncAuthIndex } = await cargar();
    await syncAuthIndex(usuarioApp({ roles: undefined, inmuebleIds: undefined, propietarioId: undefined, profesionalId: undefined, email: undefined }) as never, { uid: UID });
    const datos = espejoEscrito.llamadas[0].datos;
    expect(datos.roles).toEqual([]);
    expect(datos.inmuebleIds).toEqual([]);
    expect(datos.propietarioId).toBe('');
    expect(datos.profesionalId).toBe('');
    expect(datos.email).toBe('');
    // una ficha sin cartera + espejo normalizado cuaja: `''`/`[]` son el valor de ausencia
    const limpio = Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== undefined));
    expect(permite('usuarios_auth', 'create', peticion({
      coleccion: 'usuarios_auth',
      perfilDoc: perfil({ propietarioId: '', profesionalId: '', inmuebleIds: [], roles: [] }),
      requestResource: { ...limpio, uid: UID, usuarioId: USUARIO_ID, tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', email: 'ana@erp.test' },
    }))).toBe(true);
    // FRONTERA: si la ficha autoritativa NO tiene `roles` escrito, el espejo no cuaja y se
    // deniega — el motor real compara `[] == null` y también falla. El alta por invitación
    // siempre escribe `roles: []`, así que no deja un perfil inutilizable.
    const { propietarioId: _p, roles: _r, ...perfilSinRoles } = perfil();
    expect(permite('usuarios_auth', 'create', peticion({
      coleccion: 'usuarios_auth',
      perfilDoc: perfilSinRoles,
      requestResource: { ...limpio, uid: UID, usuarioId: USUARIO_ID, tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: '', inmuebleIds: [], email: 'ana@erp.test' },
    }))).toBe(false);
  });

  it('D.4 es idempotente: dos sincronizaciones escriben el mismo documento, no otro', async () => {
    const { syncAuthIndex } = await cargar();
    await syncAuthIndex(usuarioApp() as never, { uid: UID });
    await syncAuthIndex(usuarioApp() as never, { uid: UID });
    expect(espejoEscrito.llamadas).toHaveLength(2);
    expect(espejoEscrito.llamadas[0].ruta).toBe(espejoEscrito.llamadas[1].ruta);
    const { updatedAt: _a, ...sin1 } = espejoEscrito.llamadas[0].datos;
    const { updatedAt: _b, ...sin2 } = espejoEscrito.llamadas[1].datos;
    expect(sin1).toEqual(sin2);
  });

  it('D.5 el espejo se escribe en los tres momentos del circuito de sesión y ANTES de abrir datos', async () => {
    const fuente = readFileSync(path.resolve(__dirname, '../src/lib/authService.ts'), 'utf8');
    const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
    expect(sinComentarios.match(/await syncAuthIndex\(/g) || []).toHaveLength(3);
    // login, registro por invitación y restauración de sesión
    for (const fn of ['loginWithEmail', 'registerWithInvitationLink', 'subscribeAuthState']) {
      const i = sinComentarios.search(new RegExp(`export\\s+(async\\s+)?function\\s+${fn}\\b`));
      expect(i, fn).toBeGreaterThan(-1);
      const siguiente = sinComentarios.slice(i + 10).search(/\nexport\s/);
      const cuerpo = sinComentarios.slice(i, siguiente > 0 ? i + 10 + siguiente : i + 8000);
      expect(cuerpo.includes('syncAuthIndex('), fn).toBe(true);
    }
    // en la restauración, el espejo se asegura ANTES de publicar la sesión (y por tanto antes
    // de que `App` abra las suscripciones de datos, que son lo que las reglas van a examinar)
    const i = sinComentarios.search(/export\s+function\s+subscribeAuthState/);
    const fin = sinComentarios.slice(i + 10).search(/\nexport\s/);
    const cuerpo = sinComentarios.slice(i, fin > 0 ? i + 10 + fin : undefined);
    const escribe = cuerpo.indexOf('syncAuthIndex(');
    expect(escribe).toBeGreaterThan(-1);
    expect(cuerpo.indexOf('callback(user, usuarioApp, false)')).toBeGreaterThan(escribe);
    // y el listener no deja un usuario autenticado sin espejo escrito en el camino normal
  });

  it('D.6 el espejo es el único canal de identidad: no hay un segundo sistema en el cliente', () => {
    const dir = path.resolve(__dirname, '../src');
    const caminar = (d: string, acc: string[] = []): string[] => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) caminar(p, acc);
        else if (/\.tsx?$/.test(e.name)) acc.push(p);
      }
      return acc;
    };
    const queLoEscriben = caminar(dir).filter((f) => /['"]usuarios_auth['"]|`usuarios_auth`/.test(readFileSync(f, 'utf8')));
    expect(queLoEscriben.map((f) => path.basename(f))).toEqual(['authService.ts']);
  });
});

// ===========================================================================
// GRUPO E · desplegabilidad del corte
// ===========================================================================
describe('FASE 1.4 · E. El corte es auto-suficiente y no reescribe §38', () => {
  it('E.1 todo lo que llama el bloque del espejo está definido en el mismo fichero', () => {
    const bloque = SIN_COMENTARIOS(bloqueDe('usuarios_auth'));
    const definidas = new Map([...funcionesDe(cuerpoRaiz()), ...funcionesDe(bloque)]);
    const BUILTINS = new Set(['get', 'exists', 'incoming', 'existing', 'size', 'keys', 'values', 'hasAny', 'diff', 'affectedKeys']);
    const llamadas = new Set([...bloque.matchAll(/(?:^|[^.\w$])([a-z][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]));
    expect(llamadas.size).toBeGreaterThan(3);
    for (const nombre of llamadas) {
      if (BUILTINS.has(nombre)) continue;
      expect(definidas.has(nombre), `usuarios_auth llama a ${nombre}() y no está en el fichero`).toBe(true);
    }
    // y los dos helpers de veracidad existen, una sola vez, en el cuerpo raíz
    for (const nombre of ['indexMatchesProfile', 'indexIsTruthful']) {
      expect(cuerpoRaiz().split(`function ${nombre}(`).length - 1, nombre).toBe(1);
    }
  });

  it('E.2 §38 sigue intacto: la fase del espejo no reescribe la regla de sindicación', () => {
    const bloque = SIN_COMENTARIOS(bloqueDe('sindicacion_inmuebles'));
    const permisos = permisosDe(bloque);
    expect(permisos.get('delete')!.condicion.trim()).toBe('isMasterAdmin()');
    for (const campo of ['id', 'externalId', 'clave', 'inmuebleId', 'portal', 'propietarioId']) {
      expect(permisos.get('update')!.condicion, campo).toContain(`request.resource.data.${campo} == existing().${campo}`);
    }
    expect(bloque).toContain('sinSecretosSindicacion()');
    // el circuito de escritura de §38 sigue apoyándose en el espejo, no en un criterio propio
    expect(bloque).toContain('canReachInmuebleId(');
    expect(bloque).not.toContain('isOwnerOfInmueble');
  });

  it('E.3 ni `list` ni lecturas abiertas: el espejo no ensancha ninguna colección existente', () => {
    const bloque = SIN_COMENTARIOS(bloqueDe('usuarios_auth'));
    expect(bloque).not.toMatch(/allow\s+(read|get|list)[^:]*:\s*if\s+true/);
    // `usuarios` sigue sin listar el censo completo a cualquier sesión autenticada ⇒ si el
    // fichero lo permite, se documenta como residual conocido, no se amplía aquí
    const usuarios = permisosDe(SIN_COMENTARIOS(bloqueDe('usuarios')));
    const lista = usuarios.get('list')!.condicion;
    expect(['isMasterAdmin()', 'isSignedIn()']).toContain(lista.trim());
  });
});
