import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearTransporteFirebase } from '../persistence/firebase.ts';

// H8 — AUTORIZACIÓN OPERATIVA POR TITULARIDAD ACTUAL.
//
// Contrato: conceden capacidad operativa actual el titular CANÓNICO
// (`propietarioId`), el PRINCIPAL declarado (`propietarioPrincipalId`) y el
// COTITULAR MODERNO presente en el índice `titularesIds`. El campo LEGADO
// `propietarioSecundarioId` NO autoriza por sí solo.
//
// Se ejercita el adaptador REAL con un SDK inyectado en memoria y se compara,
// caso a caso, con un espejo ANCLADO al texto literal de `firestore.rules`.
// Esto NO es una ejecución de Rules: la validación E2E con emulador queda
// fuera (ausencia de Java/firebase-tools en el entorno) y no se simula.

const INMUEBLE_ID = 'inm-h8';

function sdkDoble(datosInmueble) {
  const db = {};
  const store = new Map([[`inmuebles/${INMUEBLE_ID}`, datosInmueble]]);
  const path = (...partes) => partes.filter((x) => x !== db).map((p) => (typeof p === 'string' ? p : p.path)).join('/');
  const snapshot = (key) => ({ id: key.split('/').at(-1), exists: () => store.has(key), data: () => structuredClone(store.get(key)) });
  const sdk = {
    doc: (...partes) => ({ path: path(...partes) }),
    collection: (...partes) => ({ path: path(...partes) }),
    where: (key, op, value) => ({ key, op, value }),
    query: (ref, ...filtros) => ({ ...ref, filtros }),
    serverTimestamp: () => 'TS_DOBLE',
    getDoc: async (ref) => snapshot(ref.path),
    getDocs: async () => ({ docs: [] }),
    async runTransaction(_db, fn) {
      return fn({ get: async (ref) => snapshot(ref.path), set: () => {} });
    },
  };
  return { sdk, db };
}

/** ¿El CLIENTE real autoriza a `p` a operar sobre el inmueble? */
async function clienteAutoriza(datosInmueble, p) {
  const { sdk, db } = sdkDoble(datosInmueble);
  const transporte = crearTransporteFirebase(db, { currentUser: null }, sdk);
  try {
    return await transporte.transaccion(p, async (tx) => {
      await tx.comprobarInmuebleActual({ propietarioId: p, inmuebleId: INMUEBLE_ID });
      return true;
    });
  } catch (err) {
    if (String(err.message).startsWith('Sin titularidad actual')) return false;
    throw err;
  }
}

// --- Espejo ANCLADO al archivo real -----------------------------------------
const rulesFull = readFileSync(new URL('../../../../firestore.rules', import.meta.url), 'utf8');
function cuerpoRule(nombre) {
  const inicio = rulesFull.indexOf(`function ${nombre}(`);
  assert.ok(inicio >= 0, `No se encuentra la función ${nombre} en firestore.rules`);
  const abre = rulesFull.indexOf('{', inicio);
  let prof = 1;
  for (let i = abre + 1; i < rulesFull.length; i++) {
    if (rulesFull[i] === '{') prof++;
    else if (rulesFull[i] === '}' && --prof === 0) return rulesFull.slice(abre + 1, i);
  }
  throw new Error(`Función incompleta: ${nombre}`);
}
const OP_ACTUAL = cuerpoRule('opActual');

/** Espejo en JS de `opActual`. Su fidelidad la garantiza el test de anclaje. */
function rulesAutoriza(datosInmueble, p) {
  const leer = (campo, porDefecto) => (campo in datosInmueble ? datosInmueble[campo] : porDefecto);
  const titulares = leer('titularesIds', []);
  return leer('propietarioId', '') === p
    || leer('propietarioPrincipalId', '') === p
    || (Array.isArray(titulares) && titulares.includes(p));
}

test('H8 · anclaje: `opActual` usa canónico, principal e índice, y NO el campo legado', () => {
  assert.match(OP_ACTUAL, /inmueble\.get\('propietarioId', ''\) == p/);
  assert.match(OP_ACTUAL, /inmueble\.get\('propietarioPrincipalId', ''\) == p/);
  assert.match(OP_ACTUAL, /titulares\.hasAny\(\[p\]\)/);
  assert.doesNotMatch(OP_ACTUAL, /propietarioSecundarioId/);
});

test('H8 · anclaje: el cliente tampoco autoriza por el campo legado', () => {
  const fuente = readFileSync(new URL('../persistence/firebase.ts', import.meta.url), 'utf8');
  const fn = fuente.slice(fuente.indexOf('async comprobarInmuebleActual'), fuente.indexOf('guardarEntidad(evento, auditId)'));
  assert.doesNotMatch(fn, /propietarioSecundarioId/);
  assert.match(fn, /titularesIds/);
});

// --- Casos H8-1 .. H8-7 ------------------------------------------------------
const CASOS = [
  {
    id: 'H8-1', nombre: 'titular canónico A → autorizado',
    inmueble: { propietarioId: 'A', propietarioPrincipalId: 'A', titularesIds: ['A'] }, p: 'A', esperado: true,
  },
  {
    id: 'H8-2', nombre: 'principal declarado B (diverge del canónico A) → autorizado',
    inmueble: { propietarioId: 'A', propietarioPrincipalId: 'B' }, p: 'B', esperado: true,
  },
  {
    id: 'H8-3', nombre: 'cotitular moderno C en titularesIds → autorizado',
    inmueble: { propietarioId: 'A', propietarioPrincipalId: 'A', titularesIds: ['A', 'B', 'C'] }, p: 'C', esperado: true,
  },
  {
    id: 'H8-4', nombre: 'solo propietarioSecundarioId D → NO autorizado',
    inmueble: { propietarioId: 'A', propietarioPrincipalId: 'A', propietarioSecundarioId: 'D', titularesIds: ['A'] }, p: 'D', esperado: false,
  },
  {
    id: 'H8-5', nombre: 'ex-titular A tras transmisión A→B, aún en el campo legado → NO autorizado',
    inmueble: { propietarioId: 'B', propietarioPrincipalId: 'B', titularesIds: ['B'], propietarioSecundarioId: 'A' }, p: 'A', esperado: false,
  },
  {
    id: 'H8-6', nombre: 'cotitular legítimo C conserva autorización tras la transmisión A→B',
    inmueble: { propietarioId: 'B', propietarioPrincipalId: 'B', titularesIds: ['B', 'C'], propietarioSecundarioId: 'A' }, p: 'C', esperado: true,
  },
  {
    id: 'H8-7', nombre: 'usuario D sin ninguna relación → NO autorizado',
    inmueble: { propietarioId: 'A', propietarioPrincipalId: 'A', titularesIds: ['A'] }, p: 'D', esperado: false,
  },
];

for (const caso of CASOS) {
  test(`${caso.id} · ${caso.nombre}`, async () => {
    assert.equal(await clienteAutoriza(caso.inmueble, caso.p), caso.esperado, `${caso.id}: cliente`);
    assert.equal(rulesAutoriza(caso.inmueble, caso.p), caso.esperado, `${caso.id}: espejo de Rules`);
  });
}

test('H8 · SIMETRÍA cliente/Rules: ningún caso diverge', async () => {
  for (const caso of CASOS) {
    const cliente = await clienteAutoriza(caso.inmueble, caso.p);
    const reglas = rulesAutoriza(caso.inmueble, caso.p);
    assert.equal(cliente, reglas, `${caso.id}: cliente=${cliente} Rules=${reglas} (divergencia prohibida)`);
  }
});

test('H8 · el inmueble inexistente sigue denegando (sin cambio de comportamiento)', async () => {
  const { sdk, db } = sdkDoble(undefined);
  const transporte = crearTransporteFirebase(db, { currentUser: null }, sdk);
  await assert.rejects(
    transporte.transaccion('A', async (tx) => tx.comprobarInmuebleActual({ propietarioId: 'A', inmuebleId: 'otro' })),
    /Sin titularidad actual/,
  );
});
