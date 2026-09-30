/**
 * BLOQUE 2 · REGLAS DE `titularidades` (N titulares)
 * ---------------------------------------------------------------------------
 * METODOLOGÍA: sin emulador de Firebase en este entorno (ni `firebase-tools`
 * ni JRE), las reglas se evalúan con el intérprete del subconjunto del lenguaje
 * (tests/helpers/evaluadorReglasFirestore.ts) sobre el TEXTO REAL de
 * `firestore.rules`. No es el motor de Google: la validación en emulador queda
 * PENDIENTE y se declara.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decidir, parsearReglas, type ContextoPeticion } from './helpers/evaluadorReglasFirestore';

const REGLAS = parsearReglas(readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'));

const base = (id: string, inmuebleId: string, propietarioId: string) => ({
  id,
  inmuebleId,
  propietarioId,
  porcentaje: null,
  porcentajePendiente: true,
  esPrincipal: false,
  rol: 'COTITULAR',
  estado: 'ACTIVA',
  fechaDesde: '2026-01-01T00:00:00.000Z',
  fechaHasta: null,
  origen: 'ALTA',
  version: 1,
  historial: [{ id: 'ev-1', fecha: '2026-01-01T00:00:00.000Z', tipo: 'ALTA' }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const T_A = base('inm-2__prop-A', 'inm-2', 'prop-A');
const T_B = base('inm-B__prop-B', 'inm-B', 'prop-B');
const T_AB = base('inm-1__prop-B', 'inm-1', 'prop-B');

const FIRESTORE: ContextoPeticion['firestore'] = {
  'usuarios/uid_prop_A': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop-A' },
  'usuarios/uid_prop_B': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop-B' },
  'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', propietarioId: '' },

  'usuarios_auth/uid_prop_A': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop-A', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_prop_B': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop-B', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', propietarioId: '', profesionalId: '', inmuebleIds: [] },

  'inmuebles/inm-1': { id: 'inm-1', propietarioId: 'prop-A', titularesIds: ['prop-A', 'prop-B'] },
  'inmuebles/inm-2': { id: 'inm-2', propietarioId: 'prop-A', titularesIds: ['prop-A'] },
  'inmuebles/inm-B': { id: 'inm-B', propietarioId: 'prop-B', titularesIds: ['prop-B'] },

  'titularidades/inm-2__prop-A': T_A,
  'titularidades/inm-B__prop-B': T_B,
  'titularidades/inm-1__prop-B': T_AB,
};

const AUTH = {
  propA: { uid: 'uid_prop_A', token: { email: 'prop-a@test.local' } },
  propB: { uid: 'uid_prop_B', token: { email: 'prop-b@test.local' } },
  admin: { uid: 'uid_admin', token: { email: 'admin@test.local' } },
  master: { uid: 'uid_master', token: { email: 'sarqsan2@gmail.com' } },
};

const permitido = (d: ReturnType<typeof decidir>) => d.permitido === true;
const denegado = (d: ReturnType<typeof decidir>) => d.permitido !== true;

function get(id: string, auth: ContextoPeticion['auth']) {
  return decidir(REGLAS, `titularidades/${id}`, 'get', {
    auth,
    firestore: FIRESTORE,
    existente: FIRESTORE[`titularidades/${id}`],
  });
}
function list(id: string, auth: ContextoPeticion['auth']) {
  return decidir(REGLAS, `titularidades/${id}`, 'list', {
    auth,
    firestore: FIRESTORE,
    existente: FIRESTORE[`titularidades/${id}`],
  });
}
function crear(entrante: Record<string, unknown>, auth: ContextoPeticion['auth']) {
  return decidir(REGLAS, `titularidades/${String(entrante.id)}`, 'create', {
    auth,
    firestore: FIRESTORE,
    existente: null,
    entrante,
  });
}
function actualizar(id: string, entrante: Record<string, unknown>, auth: ContextoPeticion['auth']) {
  return decidir(REGLAS, `titularidades/${id}`, 'update', {
    auth,
    firestore: FIRESTORE,
    existente: FIRESTORE[`titularidades/${id}`],
    entrante,
  });
}
function borrar(id: string, auth: ContextoPeticion['auth']) {
  return decidir(REGLAS, `titularidades/${id}`, 'delete', {
    auth,
    firestore: FIRESTORE,
    existente: FIRESTORE[`titularidades/${id}`],
  });
}

/* ------------------------------------------------------------------ */

describe('BLOQUE 2 · Reglas titularidades: aislamiento por titular', () => {
  it('A ve SU titularidad', () => {
    expect(permitido(get('inm-2__prop-A', AUTH.propA))).toBe(true);
  });

  it('A NO ve la titularidad de B', () => {
    expect(denegado(get('inm-B__prop-B', AUTH.propA))).toBe(true);
  });

  it('B ve la titularidad del inmueble que comparte con A', () => {
    expect(permitido(get('inm-1__prop-B', AUTH.propB))).toBe(true);
  });

  it('list: la consulta debe ir acotada por propietarioId', () => {
    expect(permitido(list('inm-2__prop-A', AUTH.propA))).toBe(true);
    expect(denegado(list('inm-B__prop-B', AUTH.propA))).toBe(true);
  });

  it('administración conserva el acceso', () => {
    expect(permitido(list('inm-B__prop-B', AUTH.admin))).toBe(true);
    expect(permitido(get('inm-B__prop-B', AUTH.admin))).toBe(true);
  });
});

describe('BLOQUE 2 · Reglas titularidades: integridad de la relación', () => {
  it('A crea una titularidad sobre SU inmueble: permitido', () => {
    expect(permitido(crear(base('inm-2__prop-C', 'inm-2', 'prop-C'), AUTH.propA))).toBe(true);
  });

  it('A NO crea titularidades sobre un inmueble ajeno', () => {
    expect(denegado(crear(base('inm-B__prop-C', 'inm-B', 'prop-C'), AUTH.propA))).toBe(true);
  });

  it('la clave debe ser inmuebleId__propietarioId (no se puede suplantar)', () => {
    expect(denegado(crear({ ...base('clave-inventada', 'inm-2', 'prop-C') }, AUTH.propA))).toBe(true);
    expect(denegado(crear({ ...base('inm-2__prop-C', 'inm-9', 'prop-C') }, AUTH.propA))).toBe(true);
  });

  it('un porcentaje nulo SIN marcar pendiente se rechaza', () => {
    const mala = { ...base('inm-2__prop-C', 'inm-2', 'prop-C'), porcentaje: null, porcentajePendiente: false };
    expect(denegado(crear(mala, AUTH.propA))).toBe(true);
  });

  it('un porcentaje fuera de rango se rechaza', () => {
    const mala = { ...base('inm-2__prop-C', 'inm-2', 'prop-C'), porcentaje: 130, porcentajePendiente: false };
    expect(denegado(crear(mala, AUTH.propA))).toBe(true);
  });

  it('estado / rol / origen fuera de catálogo se rechazan', () => {
    expect(
      denegado(crear({ ...base('inm-2__prop-C', 'inm-2', 'prop-C'), estado: 'BORRADO' }, AUTH.propA))
    ).toBe(true);
    expect(
      denegado(crear({ ...base('inm-2__prop-C', 'inm-2', 'prop-C'), rol: 'CUARTO' }, AUTH.propA))
    ).toBe(true);
  });

  it('el alta exige historial (trazabilidad)', () => {
    const sinHistorial = { ...base('inm-2__prop-C', 'inm-2', 'prop-C'), historial: [] };
    expect(denegado(crear(sinHistorial, AUTH.propA))).toBe(true);
  });
});

describe('BLOQUE 2 · Reglas titularidades: NUNCA borrado físico', () => {
  it('la versión debe avanzar de 1 en 1', () => {
    const ok = { ...T_A, porcentaje: 100, porcentajePendiente: false, version: 2, historial: [...T_A.historial, { id: 'ev-2', fecha: 'x', tipo: 'MODIFICACION' }] };
    expect(permitido(actualizar('inm-2__prop-A', ok, AUTH.propA))).toBe(true);

    const mal = { ...T_A, version: 5, historial: [...T_A.historial] };
    expect(denegado(actualizar('inm-2__prop-A', mal, AUTH.propA))).toBe(true);
  });

  it('el historial NUNCA puede menguar', () => {
    const recortado = { ...T_A, version: 2, historial: [] };
    expect(denegado(actualizar('inm-2__prop-A', recortado, AUTH.propA))).toBe(true);
  });

  it('no se puede mover una titularidad de inmueble ni de titular', () => {
    const movida = { ...T_A, version: 2, inmuebleId: 'inm-B', historial: [...T_A.historial, { id: 'e', fecha: 'x', tipo: 'MODIFICACION' }] };
    expect(denegado(actualizar('inm-2__prop-A', movida, AUTH.propA))).toBe(true);

    const otroTitular = { ...T_A, version: 2, propietarioId: 'prop-Z', historial: [...T_A.historial, { id: 'e', fecha: 'x', tipo: 'MODIFICACION' }] };
    expect(denegado(actualizar('inm-2__prop-A', otroTitular, AUTH.propA))).toBe(true);
  });

  it('delete SIEMPRE denegado, incluso para el administrador principal', () => {
    expect(denegado(borrar('inm-2__prop-A', AUTH.master))).toBe(true);
    expect(denegado(borrar('inm-2__prop-A', AUTH.propA))).toBe(true);
    expect(denegado(borrar('inm-B__prop-B', AUTH.propB))).toBe(true);
  });

  it('el fichero declara explícitamente `allow delete: if false`', () => {
    const RULES = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');
    // Sólo CÓDIGO: se descartan las líneas de comentario (que sí mencionan los
    // nombres prohibidos para explicar precisamente por qué no se usan).
    const codigo = RULES.split('\n')
      .filter((l) => l.trim().indexOf('//') !== 0 && l.trim().indexOf('*') !== 0)
      .join('\n');

    const bloque = RULES.slice(RULES.indexOf('match /titularidades/'));
    expect(bloque).toContain('allow delete: if false;');
    expect(bloque).toContain("titularidadId == incoming().inmuebleId + '__' + incoming().propietarioId");
    // El modelo es N: NO aparecen campos escalares "terciario / cuarto / quinto".
    expect(codigo).not.toMatch(/propietarioTerciarioId/);
    expect(codigo).not.toMatch(/propietarioCuartoId/);
    expect(codigo).not.toMatch(/propietarioQuintoId/);
  });
});
