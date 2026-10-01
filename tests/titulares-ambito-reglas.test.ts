/**
 * TITULARES EN EL ÁMBITO DEL PROPIETARIO — REGLAS DE FIRESTORE (PR #19, 2026-10-01)
 * ==================================================================================
 * Modelo funcional exigido: «Un PROPIETARIO puede crear y mantener CUALQUIER NÚMERO de fichas de
 * PROPIETARIOS/TITULARES dentro de su ámbito autorizado». No existe límite 1, 2, 3, 10, 50 ni otro:
 * la cantidad no forma parte de ninguna condición. Y, a la vez, ILIMITADO ≠ GLOBAL: lo único que
 * acota es la autorización/ámbito (`ambitoPropietarioId == myPropId()`).
 *
 * Metodología (la misma que el resto de tests de reglas del repo): se lee el TEXTO REAL de
 * `firestore.rules` y se evalúa con `tests/harness/firestoreRulesEval.ts`. No hay emulador de Firebase
 * en este entorno (sin Java ni acceso a los drops), así que NO se prueba el planificador de consultas
 * `list` del motor real: se prueba la semántica del texto que se despliega. Ver docs de la intervención.
 *
 * Numeración (1-12) = pruebas obligatorias de la orden:
 *   1 · un PROPIETARIO crea un titular · 2 · crea un segundo · 3 · un tercero · 4 · muchos, sin
 *   condición numérica · 5 · cada ficha conserva SUS datos fiscales · 6 · se asignan después a
 *   inmuebles autorizados · 7 · N-TITULARES con más de dos · 8 · no lee ni modifica titulares de
 *   fuera de su ámbito · 9 · sin acceso global a `propietarios` · 10 · ADMINISTRADOR/MASTER mantienen
 *   sus capacidades · 11 · alta y edición de inmuebles siguen funcionando · 12 · (UI) no hay
 *   «segundo propietario»: ver `tests/titulares-ambito-ui.test.tsx`.
 * Además: comparación DIFERENCIAL con el bloque anterior (nada cambia para fichas sin ámbito) y
 * pruebas de MUTACIÓN (cada guarda nueva es real: quitarla abre exactamente el agujero que cierra).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
import { completarPerfilesSinteticos } from './harness/perfilesSinteticos';

const RULES = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');
const BLOQUE_ANTERIOR = readFileSync(resolve(__dirname, 'fixtures/propietarios-bloque-reglas-anterior.txt'), 'utf8');

const INICIO_BLOQUE = '    match /propietarios/{propietarioId} {';
const FIN_BLOQUE = '    // =========================================================================\n    // 1. INMUEBLES';
const bloqueDe = (reglas: string): string => {
  const ini = reglas.indexOf(INICIO_BLOQUE);
  expect(ini).toBeGreaterThan(-1);
  return reglas.slice(ini, reglas.indexOf(FIN_BLOQUE, ini));
};
const BLOQUE_ACTUAL = bloqueDe(RULES);
const sinComentarios = (texto: string) => texto.replace(/\/\/[^\n]*/g, '');

// ─────────────────────────────────────────────────────────────────────────── fixtures
const emailMaster = RULES.match(/function\s+isMasterAdmin\(\)\s*\{[\s\S]*?'([^'@\s]+@[^'\s]+)'/)?.[1] as string;
if (!emailMaster) throw new Error('No se pudo leer el email del master en firestore.rules');

const autenticar = (uid: string, email: string) => ({ uid, token: { email, email_verified: true } });
const A = autenticar('uid_A', 'a@test.local'); // PROPIETARIO, ámbito owner_A
const B = autenticar('uid_B', 'b@test.local'); // PROPIETARIO, ámbito owner_B
const G = autenticar('uid_G', 'g@test.local'); // gestor con cartera (carterasL/E: owner_A)
const ADM = autenticar('uid_ADM', 'adm@test.local'); // ADMINISTRADOR NO master
const BLOQ = autenticar('uid_BLOQ', 'bloq@test.local'); // PROPIETARIO bloqueado
const INQ = autenticar('uid_INQ', 'inq@test.local'); // inquilino
const C = autenticar('uid_C', 'c@test.local'); // PROPIETARIO cuyo propietarioId (mal asignado) tiene la forma reservada `tit_…`
const MASTER = autenticar('uid_M', emailMaster);

const espejo = (extra: Record<string, unknown>) => ({
  estado: 'ACTIVO', propietarioId: '', profesionalId: '', inmuebleIds: [], carterasL: [], carterasE: [], ...extra,
});
function nuevaBase(): Peticion['db'] {
  const db: Peticion['db'] = {
    'usuarios_auth/uid_A': espejo({ usuarioId: 'usr_A', tipoPerfil: 'PROPIETARIO', propietarioId: 'owner_A' }),
    'usuarios_auth/uid_B': espejo({ usuarioId: 'usr_B', tipoPerfil: 'PROPIETARIO', propietarioId: 'owner_B' }),
    'usuarios_auth/uid_C': espejo({ usuarioId: 'usr_C', tipoPerfil: 'PROPIETARIO', propietarioId: 'tit_abcdefgh' }),
    'usuarios_auth/uid_G': espejo({ usuarioId: 'usr_G', tipoPerfil: 'PROFESIONAL', profesionalId: 'prof_G', carterasL: ['owner_A'], carterasE: ['owner_A'] }),
    'usuarios_auth/uid_ADM': espejo({ usuarioId: 'usr_ADM', tipoPerfil: 'ADMINISTRADOR' }),
    'usuarios_auth/uid_BLOQ': espejo({ usuarioId: 'usr_BLOQ', tipoPerfil: 'PROPIETARIO', estado: 'BLOQUEADO', propietarioId: 'owner_A' }),
    'usuarios_auth/uid_INQ': espejo({ usuarioId: 'usr_INQ', tipoPerfil: 'INQUILINO' }),
    'inmuebles/inm_A': { id: 'inm_A', propietarioId: 'owner_A', propietarioPrincipalId: 'owner_A', titularesIds: ['owner_A'] },
    'inmuebles/inm_B': { id: 'inm_B', propietarioId: 'owner_B', propietarioPrincipalId: 'owner_B', titularesIds: ['owner_B'] },
  };
  completarPerfilesSinteticos(db);
  return db;
}
const DB = nuevaBase();

/** Id con la forma reservada `tit_<token>` (espejo de `idDeTitularDeAmbito`). */
const idTitular = (n: number) => `tit_${n.toString(36).padStart(10, '0')}`;

function titular(id: string, ambito = 'owner_A', extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    ambitoPropietarioId: ambito,
    nombre: `Titular ${id}`,
    nifCif: `NIF-${id}`,
    tipoPropietario: 'persona_fisica',
    telefono: '600000000',
    email: '',
    direccion: 'Calle Mayor 1',
    ciudad: 'Alicante',
    codigoPostal: '03001',
    cuentasBancarias: [{ id: `cta-${id}`, alias: 'Principal', iban: `ES00 ${id}`, esPrincipal: true }],
    fechaCreacion: '2026-10-01',
    fechaActualizacion: '2026-10-01',
    ...extra,
  };
}
const fichaPropia = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => {
  const { ambitoPropietarioId: _omitido, ...resto } = titular(id, '', extra);
  return resto;
};

const evaluador = crearEvaluadorReglas(RULES);
type Verbo = 'get' | 'list' | 'create' | 'update' | 'delete';
function permite(
  verbo: Verbo,
  auth: Peticion['auth'],
  docId: string,
  resource: Peticion['resource'],
  requestResource: Peticion['requestResource'],
  opciones: { db?: Peticion['db']; reglas?: ReturnType<typeof crearEvaluadorReglas>; coleccion?: string } = {},
): boolean {
  return (opciones.reglas ?? evaluador).permite(opciones.coleccion ?? 'propietarios', verbo, {
    auth, db: opciones.db ?? DB, resource, requestResource, docId,
  });
}
const crea = (auth: Peticion['auth'], id: string, datos: Record<string, unknown>, opciones = {}) =>
  permite('create', auth, id, null, datos, opciones);
const actualiza = (auth: Peticion['auth'], id: string, antes: Record<string, unknown>, despues: Record<string, unknown>, opciones = {}) =>
  permite('update', auth, id, antes, despues, opciones);

/** Master: sus escrituras privilegiadas exigen un evento de auditoría en el mismo commit (ROADMAP-01). */
function permiteMaster(verbo: 'create' | 'update', id: string, antes: Record<string, unknown> | null, despues: Record<string, unknown>): boolean {
  const auditId = 'audit-ambito-01';
  return evaluador.permite('propietarios', verbo, {
    auth: MASTER, db: DB, resource: antes, docId: id,
    requestResource: { ...despues, roadmap01AuditId: auditId },
    after: {
      [`audit_logs/${auditId}`]: {
        id: auditId, usuarioEmail: emailMaster, resultado: 'EXITO', detalles: { actorUid: MASTER.uid, rutas: [`propietarios/${id}`] },
      },
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 1-4 · CREAR TITULARES EN EL ÁMBITO — sin condición numérica
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · 1-4 — un PROPIETARIO crea los titulares que necesite', () => {
  it('1 · un PROPIETARIO crea un titular (cónyuge, copropietario, sociedad…) en SU ámbito', () => {
    expect(crea(A, idTitular(1), titular(idTitular(1)))).toBe(true);
  });

  it('2 · el MISMO propietario crea un segundo titular', () => {
    expect(crea(A, idTitular(1), titular(idTitular(1)))).toBe(true);
    expect(crea(A, idTitular(2), titular(idTitular(2)))).toBe(true);
  });

  it('3 · …y un tercero', () => {
    for (const n of [1, 2, 3]) expect(crea(A, idTitular(n), titular(idTitular(n)))).toBe(true);
  });

  it('4 · MUCHOS: 250 titulares seguidos, todos permitidos y cada uno con SUS datos', () => {
    for (let n = 1; n <= 250; n++) {
      const id = idTitular(n);
      expect(crea(A, id, titular(id, 'owner_A', { nifCif: `NIF-${n}`, nombre: `Persona ${n}` })), `titular ${n}`).toBe(true);
    }
  });

  it('4b · la decisión NO depende de cuántos titulares haya ya (0, 1, 2, 3, 10, 100, 1000 en la base)', () => {
    for (const existentes of [0, 1, 2, 3, 10, 100, 1000]) {
      const db = nuevaBase();
      for (let n = 0; n < existentes; n++) db[`propietarios/${idTitular(10_000 + n)}`] = titular(idTitular(10_000 + n));
      expect(crea(A, idTitular(1), titular(idTitular(1)), { db }), `con ${existentes} existentes`).toBe(true);
      // y las ya existentes se siguen pudiendo editar, también con muchas
      const previo = titular(idTitular(10_000));
      if (existentes > 0) expect(actualiza(A, idTitular(10_000), previo, { ...previo, telefono: '611' }, { db })).toBe(true);
    }
  });

  it('4c · el TEXTO de las reglas no contiene contador, tope ni cuota de titulares (ni oculto en una función)', () => {
    const codigo = sinComentarios(BLOQUE_ACTUAL);
    // Nombres típicos de un límite…
    expect(codigo).not.toMatch(/titularesCreados|maxTitulares|MAX_TITULARES|limiteTitulares|numTitulares|totalTitulares|cuota|cupo|contador|\bcount\b|\blimit\b/i);
    // …comparaciones numéricas de tamaño (solo se admite la de «no vacío»: `size() > 0`)…
    expect(codigo).not.toMatch(/\.size\(\)\s*(<=?|>=?|==|!=)\s*[1-9]\d*/);
    expect(codigo).not.toMatch(/\.size\(\)\s*<\s*\d/);
    // …lecturas de otros documentos para CONTAR: las ramas de ÁMBITO (helpers, alta y edición de titulares)
    // se deciden sobre el propio documento y el espejo de identidad, sin `get`/`exists` de otras fichas.
    const helpers = codigo.slice(codigo.indexOf('function titularEnMiAmbito'), codigo.indexOf('allow get:'));
    const altaAmbito = codigo.slice(codigo.indexOf('!isMasterAdmin() && titularEnMiAmbito(incoming())'), codigo.indexOf('allow update:'));
    const edicionAmbito = codigo.slice(codigo.indexOf('!isMasterAdmin() && titularEnMiAmbito(existing())'), codigo.indexOf('allow delete:'));
    for (const rama of [helpers, altaAmbito, edicionAmbito]) {
      expect(rama.length).toBeGreaterThan(80);
      expect(rama).not.toMatch(/\b(get|exists|getAfter|existsAfter)\(/);
    }
    // La única cifra «de negocio» del bloque es el rango del token del id (`{8,48}`: largo de un identificador,
    // no un número de fichas); fuera de esa expresión regular solo aparece el `0` de «no vacío».
    const literales = codigo.match(/matches\('[^']*'\)/g) ?? [];
    expect(literales).toEqual(["matches('^tit_[a-z0-9]{8,48}$')"]);
    const sinRegex = codigo.replace(/matches\('[^']*'\)/g, 'matches(RE)');
    const cifras = sinRegex.match(/(?<![A-Za-z_'$])\d+(?![A-Za-z_'])/g) ?? [];
    expect(cifras).toEqual(['0']);
  });

  it('4d · el id de cada titular lo genera el cliente como `tit_<token>` único: dos altas nunca comparten id', () => {
    const ids = new Set<string>();
    for (let n = 1; n <= 500; n++) ids.add(idTitular(n));
    expect(ids.size).toBe(500);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · CADA FICHA ES INDEPENDIENTE (sus datos fiscales no se copian ni se relacionan)
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · 5 — cada ficha conserva SUS datos fiscales', () => {
  it('5 · editar los datos fiscales/IBAN de un titular se decide sobre ESE documento y no toca a los demás', () => {
    const t1 = titular(idTitular(1), 'owner_A', { nifCif: '11111111H', cuentasBancarias: [{ id: 'c1', alias: 'T1', iban: 'ES11', esPrincipal: true }] });
    const t2 = titular(idTitular(2), 'owner_A', { nifCif: '22222222J', cuentasBancarias: [{ id: 'c2', alias: 'T2', iban: 'ES22', esPrincipal: true }] });
    expect(crea(A, idTitular(1), t1)).toBe(true);
    expect(crea(A, idTitular(2), t2)).toBe(true);
    // Editar T2 (NIF, domicilio fiscal, representante, IBAN, notas) es una operación sobre T2 solamente:
    const t2Editado = {
      ...t2, nifCif: 'B12345678', direccion: 'Avenida Fiscal 9', tieneRepresentanteLegal: true, nombreRepresentante: 'Rep',
      cuentasBancarias: [{ id: 'c2', alias: 'T2', iban: 'ES2222', esPrincipal: true }, { id: 'c3', alias: 'Otra', iban: 'ES33', esPrincipal: false }],
      notasPrivadas: 'nota',
    };
    expect(actualiza(A, idTitular(2), t2, t2Editado)).toBe(true);
    // T1 no se ve afectado por la regla: sigue siendo editable por separado con sus propios datos.
    expect(actualiza(A, idTitular(1), t1, { ...t1, telefono: '699' })).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6-7 · ASIGNACIÓN A INMUEBLES AUTORIZADOS + N-TITULARES (más de dos)
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · 6-7 — se asignan a inmuebles autorizados (N titulares, sin límite binario)', () => {
  const NIVELES = [2, 3, 5, 10, 60];

  it('6 · el PROPIETARIO añade titulares de su ámbito al índice `titularesIds` de SU inmueble', () => {
    for (const n of NIVELES) {
      const ids = ['owner_A', ...Array.from({ length: n }, (_, i) => idTitular(i + 1))];
      const antes = DB['inmuebles/inm_A'];
      const despues = { ...antes, titularesIds: ids };
      expect(permite('update', A, 'inm_A', antes, despues, { coleccion: 'inmuebles' }), `${ids.length} titulares`).toBe(true);
    }
  });

  it('7 · una titularidad `{inmuebleId}__{propietarioId}` por cada titular, con porcentaje conocido o PENDIENTE (null)', () => {
    for (let i = 1; i <= 15; i++) {
      const pid = idTitular(i);
      const titularidad = {
        id: `inm_A__${pid}`, inmuebleId: 'inm_A', propietarioId: pid, estado: 'VIGENTE',
        porcentajeTitularidad: i % 3 === 0 ? null : 100 / 15, fechaInicio: '2026-10-01',
      };
      expect(permite('create', A, `inm_A__${pid}`, null, titularidad, { coleccion: 'titularidades' }), `titularidad ${i}`).toBe(true);
    }
  });

  it('7b · NO sobre un inmueble ajeno (aunque el titular sea suyo): la asignación exige ámbito sobre el INMUEBLE', () => {
    const pid = idTitular(1);
    const titularidad = { id: `inm_B__${pid}`, inmuebleId: 'inm_B', propietarioId: pid, estado: 'VIGENTE', porcentajeTitularidad: null };
    expect(permite('create', A, `inm_B__${pid}`, null, titularidad, { coleccion: 'titularidades' })).toBe(false);
    const antes = DB['inmuebles/inm_B'];
    expect(permite('update', A, 'inm_B', antes, { ...antes, titularesIds: ['owner_B', pid] }, { coleccion: 'inmuebles' })).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8 · AISLAMIENTO: ni lee ni modifica titulares fuera de su ámbito
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · 8 — un PROPIETARIO no lee ni modifica titulares fuera de su ámbito', () => {
  const deA = titular(idTitular(1), 'owner_A');
  const deB = titular(idTitular(2), 'owner_B');

  it('8a · LEE (get y list) los de SU ámbito y NINGUNO de otro ámbito ni sin ámbito', () => {
    expect(permite('get', A, idTitular(1), deA, null)).toBe(true);
    expect(permite('list', A, idTitular(1), deA, null)).toBe(true);
    // otro ámbito
    expect(permite('get', A, idTitular(2), deB, null)).toBe(false);
    expect(permite('list', A, idTitular(2), deB, null)).toBe(false);
    // ficha de cuenta ajena y ficha sin ámbito
    expect(permite('get', A, 'owner_B', fichaPropia('owner_B'), null)).toBe(false);
    expect(permite('list', A, 'owner_B', fichaPropia('owner_B'), null)).toBe(false);
    expect(permite('list', A, 'owner_A', fichaPropia('owner_A'), null)).toBe(false); // su ficha propia se lee por `get`, no por list
    expect(permite('get', A, 'owner_A', fichaPropia('owner_A'), null)).toBe(true);
  });

  it('8b · el aislamiento es simétrico: B no ve los de A', () => {
    expect(permite('get', B, idTitular(1), deA, null)).toBe(false);
    expect(permite('list', B, idTitular(1), deA, null)).toBe(false);
    expect(permite('get', B, idTitular(2), deB, null)).toBe(true);
  });

  it('8c · NO modifica los de otro ámbito (ni los edita, ni los «mueve» a su ámbito)', () => {
    expect(actualiza(B, idTitular(1), deA, { ...deA, telefono: '611' })).toBe(false);
    // intento de apropiárselo: cambiar el ámbito de la ficha de A a B
    expect(actualiza(B, idTitular(1), deA, { ...deA, ambitoPropietarioId: 'owner_B' })).toBe(false);
    // y A tampoco puede regalárselo a B (ámbito inmutable)
    expect(actualiza(A, idTitular(1), deA, { ...deA, ambitoPropietarioId: 'owner_B' })).toBe(false);
    // ni quitarle el ámbito (dejaría una ficha huérfana fuera de todo control)
    const { ambitoPropietarioId: _quitado, ...sinAmbito } = deA;
    expect(actualiza(A, idTitular(1), deA, sinAmbito)).toBe(false);
  });

  it('8d · NO crea fichas en el ámbito de otro propietario, ni con el id de la ficha de cuenta de otro', () => {
    expect(crea(A, idTitular(5), titular(idTitular(5), 'owner_B'))).toBe(false);
    // ocupar el id de la ficha de cuenta (aún inexistente) de B
    expect(crea(A, 'owner_B', titular('owner_B', 'owner_A'))).toBe(false);
    expect(crea(A, 'owner_B', fichaPropia('owner_B'))).toBe(false);
  });

  it('8e · no hay NINGUNA forma de inyectar la ficha propia en el ámbito de otro (ni de «etiquetarse» en el propio)', () => {
    // B crea SU ficha con ámbito de A, o con el suyo propio: ambas denegadas
    expect(crea(B, 'owner_B', { ...fichaPropia('owner_B'), ambitoPropietarioId: 'owner_A' })).toBe(false);
    expect(crea(B, 'owner_B', { ...fichaPropia('owner_B'), ambitoPropietarioId: 'owner_B' })).toBe(false);
    expect(crea(B, 'owner_B', fichaPropia('owner_B'))).toBe(true); // y la propia, sin ámbito, sí
    // actualizar la ficha propia añadiendo un ámbito ajeno
    const propia = fichaPropia('owner_B');
    expect(actualiza(B, 'owner_B', propia, { ...propia, ambitoPropietarioId: 'owner_A' })).toBe(false);
    expect(actualiza(B, 'owner_B', propia, { ...propia, ambitoPropietarioId: 'owner_B' })).toBe(false);
    expect(actualiza(B, 'owner_B', propia, { ...propia, telefono: '611' })).toBe(true);
  });

  it('8f · formas de id NO reservadas son rechazadas (no se puede ocupar un id arbitrario)', () => {
    const malos = [
      'owner_B', 'prop-123', 'tit_', 'tit_corto', 'TIT_abcdefghij', 'tit_ABCDEFGHIJ', 'tit_abcdefghij__x', 'tit_abcdefg~hij',
      'tit_abcdefg.hij', 'tit_' + 'a'.repeat(49), 'xtit_abcdefghij', ' tit_abcdefghij',
    ];
    for (const id of malos) expect(crea(A, id, titular(id)), `id «${id}»`).toBe(false);
    for (const id of ['tit_abcdefgh', 'tit_' + 'a1'.repeat(24)]) expect(crea(A, id, titular(id)), `id «${id}»`).toBe(true);
  });

  it('8g · no se cuelan campos de identidad, auditoría ni cartera en una ficha de titular', () => {
    const id = idTitular(7);
    for (const extra of [
      { personaId: 'p1' }, { roadmap01AuditId: 'x' }, { isStaff: true }, { isTenant: true },
      { gestionesPorPropietario: { owner_A: 'g' } }, { carterasL: ['owner_B'] }, { carterasE: ['owner_B'] },
    ]) {
      expect(crea(A, id, titular(id, 'owner_A', extra)), JSON.stringify(extra)).toBe(false);
    }
    // `id` ausente o distinto del id del documento
    const { id: _id, ...sinId } = titular(id);
    expect(crea(A, id, sinId)).toBe(false);
    expect(crea(A, id, titular(id, 'owner_A', { id: idTitular(8) }))).toBe(false);
    // y tampoco al editar
    const previo = titular(id);
    for (const extra of [{ personaId: 'p1' }, { roadmap01AuditId: 'x' }, { carterasE: ['owner_B'] }, { isStaff: true }, { id: idTitular(8) }]) {
      expect(actualiza(A, id, previo, { ...previo, ...extra }), JSON.stringify(extra)).toBe(false);
    }
  });

  it('8h · solo un PROPIETARIO ACTIVO: gestor, administrador no master, inquilino, bloqueado y anónimo no crean ni leen titulares', () => {
    const id = idTitular(9);
    const ficha = titular(id, 'owner_A');
    for (const [nombre, auth] of [['gestor', G], ['administrador no master', ADM], ['inquilino', INQ], ['bloqueado', BLOQ], ['anónimo', null]] as const) {
      expect(crea(auth, id, ficha), `crear · ${nombre}`).toBe(false);
      expect(permite('get', auth, id, ficha, null), `get · ${nombre}`).toBe(false);
      expect(permite('list', auth, id, ficha, null), `list · ${nombre}`).toBe(false);
      expect(actualiza(auth, id, ficha, { ...ficha, telefono: '611' }), `update · ${nombre}`).toBe(false);
    }
  });

  it('8i · el gestor de cartera NO hereda los titulares del ámbito del propietario (Carteras no cambia)', () => {
    const id = idTitular(9);
    const ficha = titular(id, 'owner_A');
    expect(permite('get', G, id, ficha, null)).toBe(false);
    expect(actualiza(G, id, ficha, { ...ficha, fichaPatrimonial: { x: 1 } })).toBe(false);
  });

  it('8j · nadie borra una ficha de titular (ni el propietario ni el master)', () => {
    const ficha = titular(idTitular(1));
    expect(permite('delete', A, idTitular(1), ficha, null)).toBe(false);
    expect(permite('delete', MASTER, idTitular(1), ficha, null)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9 · SIN ACCESO GLOBAL A `propietarios`
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · 9 — ilimitado NO es global', () => {
  it('9a · ninguna regla de `propietarios` concede lectura/listado general', () => {
    const codigo = sinComentarios(BLOQUE_ACTUAL);
    expect(codigo).not.toMatch(/allow\s+(read|get|list|get\s*,\s*list|list\s*,\s*get)\s*:\s*if\s+true/);
    expect(codigo).not.toMatch(/allow\s+(read|list|get\s*,\s*list)\s*:\s*if\s+(isSignedIn\(\)|isStaff\(\)|activeUser\(\)|isPropietarioRole\(\))\s*;/);
    // `list` solo admite al master o la comprobación del ámbito sobre el documento
    expect(codigo).toContain('allow list: if isMasterAdmin() || titularEnMiAmbito(resource.data);');
    // y el ámbito siempre se compara con el propietarioId del ESPEJO (que solo escribe el master)
    expect(codigo).toContain('d.ambitoPropietarioId == myPropId()');
    expect(codigo).not.toMatch(/ambitoPropietarioId\s*==\s*['"]/);
  });

  it('9b · un PROPIETARIO solo «lista» documentos cuyo ámbito es el suyo, dentro de una colección mixta', () => {
    const coleccion: Array<[string, Record<string, unknown>]> = [
      ['owner_A', fichaPropia('owner_A')],
      ['owner_B', fichaPropia('owner_B')],
      ['owner_C', fichaPropia('owner_C')],
      ...Array.from({ length: 20 }, (_, i): [string, Record<string, unknown>] => [idTitular(100 + i), titular(idTitular(100 + i), 'owner_A')]),
      ...Array.from({ length: 20 }, (_, i): [string, Record<string, unknown>] => [idTitular(200 + i), titular(idTitular(200 + i), 'owner_B')]),
      ...Array.from({ length: 5 }, (_, i): [string, Record<string, unknown>] => [idTitular(300 + i), titular(idTitular(300 + i), 'owner_C')]),
    ];
    const visiblesA = coleccion.filter(([id, d]) => permite('list', A, id, d, null)).map(([id]) => id);
    expect(visiblesA).toHaveLength(20);
    expect(visiblesA.every((id) => id >= idTitular(100) && id <= idTitular(119))).toBe(true);
    const visiblesB = coleccion.filter(([id, d]) => permite('list', B, id, d, null)).map(([id]) => id);
    expect(visiblesB).toHaveLength(20);
    // El master es el único con listado general.
    expect(coleccion.every(([id, d]) => permite('list', MASTER, id, d, null))).toBe(true);
    // Un administrador que no es el master NO lista `propietarios` (sin cambios).
    expect(coleccion.some(([id, d]) => permite('list', ADM, id, d, null))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10 · ADMINISTRADOR / MASTER_ADMIN mantienen sus capacidades
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · 10 — master y administración mantienen sus capacidades', () => {
  it('10a · el master lee, lista, crea y mantiene cualquier ficha (con auditoría), también las de ámbito', () => {
    const deA = titular(idTitular(1), 'owner_A');
    expect(permite('get', MASTER, idTitular(1), deA, null)).toBe(true);
    expect(permite('list', MASTER, idTitular(1), deA, null)).toBe(true);
    expect(permiteMaster('create', 'prop-master-1', null, fichaPropia('prop-master-1'))).toBe(true);
    expect(permiteMaster('update', idTitular(1), deA, { ...deA, telefono: '699' })).toBe(true);
    // sin el evento de auditoría de ROADMAP-01 el master tampoco escribe (no cambia)
    expect(crea(MASTER, 'prop-master-2', fichaPropia('prop-master-2'))).toBe(false);
  });

  it('10b · el ADMINISTRADOR que no es master conserva EXACTAMENTE su (falta de) capacidad sobre `propietarios`', () => {
    const ficha = fichaPropia('owner_A');
    expect(permite('get', ADM, 'owner_A', ficha, null)).toBe(false);
    expect(crea(ADM, 'prop-adm', fichaPropia('prop-adm'))).toBe(false);
    expect(actualiza(ADM, 'owner_A', ficha, { ...ficha, telefono: '611' })).toBe(false);
  });

  it('10c · el gestor con cartera conserva su lectura de la ficha del propietario gestionado y su única escritura (`fichaPatrimonial`)', () => {
    const ficha = fichaPropia('owner_A');
    expect(permite('get', G, 'owner_A', ficha, null)).toBe(true);
    expect(permite('get', G, 'owner_B', fichaPropia('owner_B'), null)).toBe(false);
    expect(actualiza(G, 'owner_A', ficha, { ...ficha, fichaPatrimonial: { modalidad: 'x' } })).toBe(true);
    expect(actualiza(G, 'owner_A', ficha, { ...ficha, telefono: '611' })).toBe(false);
    expect(crea(G, 'prop-gestor', fichaPropia('prop-gestor'))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11 · ALTA Y EDICIÓN DE INMUEBLES siguen funcionando
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · 11 — el alta y la edición de inmuebles no se han tocado', () => {
  it('11a · el PROPIETARIO sigue creando inmuebles con SU propietarioId y no con el de otro', () => {
    const inmueble = { id: 'inm_nuevo', direccion: 'Calle 1', propietarioId: 'owner_A', propietarioPrincipalId: 'owner_A' };
    expect(permite('create', A, 'inm_nuevo', null, inmueble, { coleccion: 'inmuebles' })).toBe(true);
    expect(permite('create', A, 'inm_nuevo', null, { ...inmueble, propietarioId: 'owner_B', propietarioPrincipalId: 'owner_B' }, { coleccion: 'inmuebles' })).toBe(false);
  });

  it('11b · edita su inmueble (otros campos, titularidades) y no puede transmitirlo ni tocar el de otro', () => {
    const antes = DB['inmuebles/inm_A'];
    expect(permite('update', A, 'inm_A', antes, { ...antes, direccion: 'Nueva' }, { coleccion: 'inmuebles' })).toBe(true);
    expect(permite('update', A, 'inm_A', antes, { ...antes, propietarioId: 'owner_B' }, { coleccion: 'inmuebles' })).toBe(false);
    expect(permite('update', A, 'inm_B', DB['inmuebles/inm_B'], { ...DB['inmuebles/inm_B'], direccion: 'x' }, { coleccion: 'inmuebles' })).toBe(false);
  });

  it('11c · el bloque de `inmuebles` y el de `titularidades` del fichero real no han cambiado', () => {
    const inmuebles = RULES.slice(RULES.indexOf('    match /inmuebles/{inmuebleId} {'), RULES.indexOf('match /documentos_patrimoniales'));
    expect(inmuebles).toContain("allow create: if isMasterAdmin() || (");
    expect(inmuebles).toContain('(isPropietarioRole() && soyTitularActual() && propietarioCanonicoInalterado() && (titularidadInalterada() || sigoSiendoTitular()))');
    expect(inmuebles).not.toContain('ambitoPropietarioId');
    const titularidades = RULES.slice(RULES.indexOf('    match /titularidades/{titularidadId} {'), RULES.indexOf('    match /gestiones_cartera/{gestionId} {'));
    expect(titularidades).not.toContain('ambitoPropietarioId');
    expect(titularidades).toContain("titularidadId == d.inmuebleId + '__' + d.propietarioId");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DIFERENCIAL — nada cambia para fichas SIN `ambitoPropietarioId`
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · diferencial — las decisiones sobre fichas sin ámbito son IDÉNTICAS a las del bloque anterior', () => {
  // Reemplazo con FUNCIÓN: el texto de las reglas contiene `$'`, que `String.replace` interpretaría como patrón.
  const REGLAS_ANTERIORES = RULES.replace(BLOQUE_ACTUAL, () => BLOQUE_ANTERIOR);
  const anterior = crearEvaluadorReglas(REGLAS_ANTERIORES);

  it('el bloque anterior es realmente el anterior (no contiene el ámbito) y la sustitución es efectiva', () => {
    expect(BLOQUE_ANTERIOR).not.toContain('ambitoPropietarioId');
    expect(REGLAS_ANTERIORES).not.toContain('titularEnMiAmbito');
    expect(BLOQUE_ACTUAL).toContain('titularEnMiAmbito');
  });

  it('matriz actor × verbo × documento × carga útil: ninguna decisión difiere', () => {
    const propiaA = fichaPropia('owner_A');
    const propiaB = fichaPropia('owner_B');
    const actores: Array<[string, Peticion['auth']]> = [
      ['A', A], ['B', B], ['gestor', G], ['administrador', ADM], ['bloqueado', BLOQ], ['inquilino', INQ], ['anónimo', null],
    ];
    const documentos: Array<[string, Record<string, unknown>]> = [
      ['owner_A', propiaA], ['owner_B', propiaB], ['owner_C', fichaPropia('owner_C')], ['prop-nuevo', fichaPropia('prop-nuevo')],
    ];
    let comparadas = 0;
    for (const [, auth] of actores) {
      for (const [id, doc] of documentos) {
        const cargas: Array<Record<string, unknown>> = [
          doc,
          { ...doc, telefono: '611' },
          { ...doc, personaId: 'p1' },
          { ...doc, roadmap01AuditId: 'x' },
          { ...doc, isStaff: true },
          { ...doc, carterasE: ['owner_A'] },
          { ...doc, fichaPatrimonial: { modalidad: 'x' } },
          { ...doc, id: 'otro' },
        ];
        for (const verbo of ['get', 'list', 'delete'] as const) {
          expect(permite(verbo, auth, id, doc, null), `${verbo} ${id}`).toBe(permite(verbo, auth, id, doc, null, { reglas: anterior }));
          comparadas++;
        }
        for (const carga of cargas) {
          expect(crea(auth, id, carga), `create ${id}`).toBe(crea(auth, id, carga, { reglas: anterior }));
          expect(actualiza(auth, id, doc, carga), `update ${id}`).toBe(actualiza(auth, id, doc, carga, { reglas: anterior }));
          comparadas += 2;
        }
        // el documento aún no existe (get de una ficha propia inexistente)
        expect(permite('get', auth, id, null, null)).toBe(permite('get', auth, id, null, null, { reglas: anterior }));
        comparadas++;
      }
    }
    // 7 actores × 4 documentos × (3 verbos + 8 cargas × 2 + 1 lectura de ficha inexistente)
    expect(comparadas).toBe(7 * 4 * (3 + 8 * 2 + 1));
  }, 120_000);

  it('lo ÚNICO que cambia respecto al bloque anterior son las altas/lecturas/ediciones CON ámbito propio', () => {
    const id = idTitular(1);
    const ficha = titular(id, 'owner_A');
    expect(crea(A, id, ficha, { reglas: anterior })).toBe(false); // antes: denegado
    expect(crea(A, id, ficha)).toBe(true); // ahora: permitido SOLO en su ámbito
    expect(permite('get', A, id, ficha, null, { reglas: anterior })).toBe(false);
    expect(permite('get', A, id, ficha, null)).toBe(true);
    expect(crea(A, idTitular(2), titular(idTitular(2), 'owner_B'))).toBe(false); // y sigue denegado fuera de su ámbito
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MUTACIÓN — cada guarda nueva es real
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · mutación — quitar una guarda abre exactamente el agujero que cierra', () => {
  const reemplazarUnica = (texto: string, de: string, a: string): string => {
    expect(texto.split(de).length - 1, `«${de}» debe aparecer una sola vez`).toBe(1);
    return texto.replace(de, () => a);
  };
  const reemplazarUltima = (texto: string, de: string, a: string): string => {
    const i = texto.lastIndexOf(de);
    expect(i, `«${de}» debe existir`).toBeGreaterThan(-1);
    return texto.slice(0, i) + a + texto.slice(i + de.length);
  };
  const con = (reglas: string) => ({ reglas: crearEvaluadorReglas(reglas) });

  const deA = titular(idTitular(1), 'owner_A');
  const propiaB = fichaPropia('owner_B');

  it('M1 · sin comparar el ámbito, B leería los titulares de A', () => {
    const mutado = reemplazarUnica(RULES, "&& 'ambitoPropietarioId' in d && d.ambitoPropietarioId == myPropId();", "&& 'ambitoPropietarioId' in d;");
    expect(permite('get', B, idTitular(1), deA, null)).toBe(false);
    expect(permite('get', B, idTitular(1), deA, null, con(mutado))).toBe(true);
    expect(permite('list', B, idTitular(1), deA, null, con(mutado))).toBe(true);
  });

  it('M2 · sin el id reservado, A podría ocupar el id de la ficha de cuenta de B', () => {
    const mutado = reemplazarUnica(RULES, '        && idDeTitularDeAmbito(propietarioId)\n', '');
    expect(crea(A, 'owner_B', titular('owner_B', 'owner_A'))).toBe(false);
    expect(crea(A, 'owner_B', titular('owner_B', 'owner_A'), con(mutado))).toBe(true);
  });

  it('M3 · sin vetar el ámbito en la ficha propia, B podría inyectar su ficha en el ámbito de A', () => {
    const mutado = reemplazarUnica(RULES, "        && !('ambitoPropietarioId' in incoming())\n", '');
    const inyectada = { ...fichaPropia('owner_B'), ambitoPropietarioId: 'owner_A' };
    expect(crea(B, 'owner_B', inyectada)).toBe(false);
    expect(crea(B, 'owner_B', inyectada, con(mutado))).toBe(true);
  });

  it('M4 · sin vetar el cambio de ámbito al editar la ficha propia, B podría moverla al ámbito de A', () => {
    const mutado = reemplazarUnica(RULES, "        && !incoming().diff(existing()).affectedKeys().hasAny(['ambitoPropietarioId'])\n", '');
    const movida = { ...propiaB, ambitoPropietarioId: 'owner_A' };
    expect(actualiza(B, 'owner_B', propiaB, movida)).toBe(false);
    expect(actualiza(B, 'owner_B', propiaB, movida, con(mutado))).toBe(true);
  });

  it('M5 · sin la igualdad de ámbito en la edición, A podría regalar un titular a otro ámbito', () => {
    const mutado = reemplazarUnica(
      RULES,
      "        && 'ambitoPropietarioId' in incoming() && incoming().ambitoPropietarioId == existing().ambitoPropietarioId\n",
      '',
    );
    const regalado = { ...deA, ambitoPropietarioId: 'owner_B' };
    expect(actualiza(A, idTitular(1), deA, regalado)).toBe(false);
    expect(actualiza(A, idTitular(1), deA, regalado, con(mutado))).toBe(true);
  });

  it('M6 · un `list` abierto a cualquier propietario listaría los titulares de otros', () => {
    const mutado = reemplazarUnica(RULES, 'allow list: if isMasterAdmin() || titularEnMiAmbito(resource.data);', 'allow list: if isMasterAdmin() || isPropietarioRole();');
    expect(permite('list', B, idTitular(1), deA, null)).toBe(false);
    expect(permite('list', B, idTitular(1), deA, null, con(mutado))).toBe(true);
  });

  it('M7 · sin vetar `personaId` en el alta de titular, el propietario podría vincular una persona (reservado al master)', () => {
    const bloque = bloqueDe(RULES);
    const bloqueMutado = reemplazarUltima(bloque, "        && !('personaId' in incoming())\n", '');
    const mutado = RULES.replace(bloque, () => bloqueMutado);
    const conPersona = titular(idTitular(1), 'owner_A', { personaId: 'p1' });
    expect(crea(A, idTitular(1), conPersona)).toBe(false);
    expect(crea(A, idTitular(1), conPersona, con(mutado))).toBe(true);
  });

  it('M8 · sin vetar claves de cartera/identidad en el alta de titular, el propietario podría escribir `carterasE`', () => {
    const bloque = bloqueDe(RULES);
    const linea = "        && !incoming().keys().hasAny(['isStaff','isTenant','gestionesPorPropietario','carterasL','carterasE'])\n";
    const bloqueMutado = reemplazarUltima(bloque, linea, '');
    const mutado = RULES.replace(bloque, () => bloqueMutado);
    const escalada = titular(idTitular(1), 'owner_A', { carterasE: ['owner_B'] });
    expect(crea(A, idTitular(1), escalada)).toBe(false);
    expect(crea(A, idTitular(1), escalada, con(mutado))).toBe(true);
  });

  it('M10 · los dos espacios de ids son disjuntos: una ficha de CUENTA no puede nacer con el id reservado de las de ámbito', () => {
    // Caso límite: un propietarioId mal asignado con la forma `tit_<token>`. Su ficha de cuenta se rechaza
    // (la rama propia veta el id reservado); sin ese veto podría colisionar con el id de un titular ajeno.
    const propiaC = fichaPropia('tit_abcdefgh');
    expect(crea(C, 'tit_abcdefgh', propiaC)).toBe(false);
    const mutado = reemplazarUnica(RULES, '        && !idDeTitularDeAmbito(propietarioId)\n', '');
    expect(crea(C, 'tit_abcdefgh', propiaC, con(mutado))).toBe(true);
    // y sus titulares de ámbito (id reservado distinto, ámbito propio) siguen funcionando con normalidad
    expect(crea(C, 'tit_zzzzzzzzzz', titular('tit_zzzzzzzzzz', 'tit_abcdefgh'))).toBe(true);
  });

  it('M9 · sin `titularEnMiAmbito` en la edición, nadie podría mantener sus titulares (la rama es necesaria)', () => {
    const mutado = reemplazarUnica(RULES, '        !isMasterAdmin() && titularEnMiAmbito(existing())\n', '        !isMasterAdmin() && false\n');
    expect(actualiza(A, idTitular(1), deA, { ...deA, telefono: '611' })).toBe(true);
    expect(actualiza(A, idTitular(1), deA, { ...deA, telefono: '611' }, con(mutado))).toBe(false);
  });
});
