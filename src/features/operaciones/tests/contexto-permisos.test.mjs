import test from 'node:test';
import assert from 'node:assert/strict';
import { crearTransporteFirebase, esDenegacionPermiso } from '../persistence/firebase.ts';
import { CONTEXTO_FICTICIO, DATOS_FICTICIOS } from '../demo/fixtures.ts';
import { sesion } from './support.mjs';

// FASE 7 — El adaptador respeta los permisos REALES de main para `contratos_formalizacion`
// (list exige where('propietarioId','==',myPropId())). Sin re-portar Operations.
// SDK dobles en memoria; no valida Firebase/Rules.
function sdkDoble({ contratos = [], niegaContratos = null } = {}) {
  const base = [
    ['usuarios_auth/actor-demo', { usuarioId: 'usuario-demo', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-demo', carterasL: [], carterasE: [] }],
    ['usuarios/usuario-demo', { nombre: 'Persona demo' }],
    ['propietarios/prop-demo', { nombre: 'Propietaria demo' }],
    ['inmuebles/inm-demo', { direccion: 'Calle demo 1', propietarioId: 'prop-demo' }],
    ['candidatos/cand-demo', { inmuebleId: 'inm-demo', nombre: 'Arrendataria demo' }],
    ...contratos,
  ];
  const store = new Map(base);
  const consultas = [];
  const path = (...parts) => parts.filter((x) => x !== db).map((p) => (typeof p === 'string' ? p : p.path)).join('/');
  const snapshot = (key, map = store) => ({ id: key.split('/').at(-1), exists: () => map.has(key), data: () => structuredClone(map.get(key)) });
  const sdk = {
    doc: (...parts) => ({ path: path(...parts) }),
    collection: (...parts) => ({ path: path(...parts) }),
    where: (key, op, value) => ({ key, op, value }),
    query: (ref, ...filters) => ({ ...ref, filters }),
    serverTimestamp: () => 'SERVER_TIMESTAMP_DOUBLE',
    getDoc: async (ref) => snapshot(ref.path),
    getDocs: async (ref) => {
      consultas.push({ path: ref.path, filters: ref.filters ?? [] });
      if (ref.path === 'contratos_formalizacion' && niegaContratos) throw niegaContratos;
      return {
        docs: [...store.keys()]
          .filter((k) => k.startsWith(ref.path + '/') && k.split('/').length === ref.path.split('/').length + 1)
          .filter((k) => (ref.filters ?? []).every((f) => store.get(k)[f.key] === f.value))
          .map((k) => snapshot(k)),
      };
    },
    async runTransaction(_, fn) {
      const draft = structuredClone(store);
      const result = await fn({
        get: async (ref) => snapshot(ref.path, draft),
        set: (ref, value) => { draft.set(ref.path, structuredClone(value)); },
      });
      store = draft;
      return result;
    },
  };
  const db = {};
  return { sdk, db, consultas, store };
}
const auth = { currentUser: { uid: 'actor-demo', email: 'demo@example.invalid' } };
const AMBITO = { propietarioId: 'prop-demo', inmuebleId: 'inm-demo' };

test('propietario autorizado: consulta acotada por propietarioId y filtro en memoria por inmuebleId', async () => {
  const f = sdkDoble({
    contratos: [
      ['contratos_formalizacion/ct-ok', { propietarioId: 'prop-demo', inmuebleId: 'inm-demo', candidatoId: 'cand-demo', estado: 'FORMALIZADO_ACTIVO' }],
      ['contratos_formalizacion/ct-otro-inm', { propietarioId: 'prop-demo', inmuebleId: 'inm-otro', candidatoId: 'cand-x', estado: 'FORMALIZADO_ACTIVO' }],
      ['contratos_formalizacion/ct-ajeno', { propietarioId: 'prop-ajeno', inmuebleId: 'inm-demo', candidatoId: 'cand-y', estado: 'FORMALIZADO_ACTIVO' }],
    ],
  });
  const ctx = await crearTransporteFirebase(f.db, auth, f.sdk).contexto(AMBITO);
  const qContratos = f.consultas.find((q) => q.path === 'contratos_formalizacion');
  assert.ok(qContratos, 'Debe consultar contratos_formalizacion');
  assert.deepEqual(qContratos.filters, [{ key: 'propietarioId', op: '==', value: 'prop-demo' }]);
  assert.deepEqual(ctx.contratos.map((c) => c.id), ['ct-ok']);
  assert.equal(ctx.inmuebles[0].id, 'inm-demo');
  assert.equal(ctx.propietarios[0].id, 'prop-demo');
  assert.deepEqual(ctx.inquilinos.map((i) => i.id), ['cand-demo']);
});

test('gestor sin acceso al contrato: denegación degrada a [] sin romper el contexto', async () => {
  const denegacion = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  const f = sdkDoble({ niegaContratos: denegacion });
  const ctx = await crearTransporteFirebase(f.db, auth, f.sdk).contexto(AMBITO);
  assert.deepEqual(ctx.contratos, []);
  assert.equal(ctx.inmuebles[0].id, 'inm-demo');
  assert.deepEqual(ctx.inquilinos.map((i) => i.id), ['cand-demo']);
});

test('operación sin contrato: válida con contratos inaccesibles (el contrato no es requisito)', () => {
  const s = sesion({ ...CONTEXTO_FICTICIO, contratos: [] });
  s.crear('equipo');
  const r = s.crear('incidencia');
  assert.equal(r.ok, true);
});

test('contrato accesible: incidencia vinculada al contrato visible es válida', () => {
  const s = sesion(CONTEXTO_FICTICIO);
  s.crear('equipo');
  const r = s.crear('incidencia', { contratoId: 'contrato-demo', inquilinoId: 'candidato-demo' });
  assert.equal(r.ok, true);
});

test('contrato no accesible: referencia no verificable falla en cerrado (sin conceder nada)', () => {
  const s = sesion({ ...CONTEXTO_FICTICIO, contratos: [] });
  s.crear('equipo');
  s.error('RELACION_ALQUILER_INVALIDA', { accion: 'CREAR', tipo: 'incidencia', id: 'inc-ciega', datos: { ...DATOS_FICTICIOS.incidencia, contratoId: 'contrato-demo' } });
});

test('error distinto a denegación (red/servidor) se propaga, no se enmascara como vacío', async () => {
  const f = sdkDoble({ niegaContratos: Object.assign(new Error('Unavailable.'), { code: 'unavailable' }) });
  await assert.rejects(crearTransporteFirebase(f.db, auth, f.sdk).contexto(AMBITO), /Unavailable/);
});

test('contrato legacy sin propietarioId queda fuera del alcance (fail-closed documentado)', async () => {
  const f = sdkDoble({
    contratos: [['contratos_formalizacion/ct-legacy', { inmuebleId: 'inm-demo', candidatoId: 'cand-demo', estado: 'FORMALIZADO_ACTIVO' }]],
  });
  const ctx = await crearTransporteFirebase(f.db, auth, f.sdk).contexto(AMBITO);
  assert.deepEqual(ctx.contratos, []);
  const s = sesion({ ...CONTEXTO_FICTICIO, contratos: [] });
  s.error('RELACION_ALQUILER_INVALIDA', { accion: 'CREAR', tipo: 'incidencia', id: 'inc-legacy', datos: { fecha: '2026-09-26', descripcion: 'X', prioridad: 'MEDIA', origen: 'PROPIETARIO', alcance: 'INMUEBLE', contratoId: 'ct-legacy' } });
});

test('clasificador de denegación: solo permission-denied degrada', () => {
  assert.equal(esDenegacionPermiso(Object.assign(new Error('x'), { code: 'permission-denied' })), true);
  assert.equal(esDenegacionPermiso(Object.assign(new Error('x'), { code: 'unavailable' })), false);
  assert.equal(esDenegacionPermiso(new Error('permission-denied')), false);
  assert.equal(esDenegacionPermiso(null), false);
  assert.equal(esDenegacionPermiso('permission-denied'), false);
});
