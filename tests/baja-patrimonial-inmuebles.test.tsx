/**
 * @vitest-environment jsdom
 *
 * BAJA PATRIMONIAL DEL INMUEBLE (sustituye al borrado físico)
 * ==========================================================
 * Cubre el circuito completo de la corrección:
 *  · Reglas REALES (`firestore.rules`): la baja es un `update` autorizado sólo a
 *    quien ya tiene escritura; `allow delete` sigue reservado al master.
 *  · Núcleo puro: el parche NO borra nada, conserva titularidad e histórico y
 *    el estado de la UI sólo cambia con persistencia confirmada.
 *  · Adaptador: `updateDoc` (nunca `deleteDoc`), retirada de publicación como
 *    `DESPUBLICADO` conservando el registro, y error de persistencia que no
 *    altera la vista.
 *  · UI: un fallo de persistencia deja el inmueble visible; un inmueble dado de
 *    baja sale de la vista activa y sigue accesible desde el histórico.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
import { completarPerfilesSinteticos } from './harness/perfilesSinteticos';
import { identidadPublicacionPortal } from '../src/utils/publicacionEngine';
import { darDeBajaInmueble } from '../src/utils/cicloPatrimonialEngine';
import {
  aplicarBajaAlEstado,
  inmueblesDadosDeBaja,
  inmueblesOperativos,
  inmueblesParaSeleccion,
  registrosARetirarPorBaja,
  requiereRetiradaPublicacion,
  resumenBajaPatrimonial,
} from '../src/utils/bajaPatrimonialInmueble';
import { puedeDarDeBajaInmueble, type AmbitoEscrituraInmuebles } from '../src/utils/permisosInmueble';
import { InicioSection } from '../src/components/sections/InicioSection';
import { DashboardEjecutivoSection } from '../src/components/sections/DashboardEjecutivoSection';
import { InmueblesSection } from '../src/components/sections/InmueblesSection';
import type { Inmueble } from '../src/types';

const RAIZ = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Mock mínimo de Firestore (patrón de `ficha-publica-inmueble.test.ts`)
// ---------------------------------------------------------------------------
const mem = vi.hoisted(() => {
  const docs = new Map<string, unknown>();
  const updateCalls: Array<{ col: string; id: string; data: unknown }> = [];
  const setCalls: Array<{ col: string; id: string; data: unknown }> = [];
  const deleteCalls: Array<{ col: string; id: string }> = [];
  return { docs, updateCalls, setCalls, deleteCalls };
});

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ __col: col, __id: id }),
  collection: (_db: unknown, col: string) => ({ __col: col }),
  getDoc: async (ref: { __col: string; __id: string }) => {
    const value = mem.docs.get(`${ref.__col}/${ref.__id}`);
    return { id: ref.__id, exists: () => value !== undefined, data: () => value };
  },
  // El repositorio de sindicación lee con `getDocs`: el mock sirve la memoria local.
  getDocs: async () => {
    const docs = [...mem.docs.entries()].map(([ruta, value]) => ({ id: ruta.split('/')[1], data: () => value }));
    return { docs, forEach: (cb: (d: { id: string; data: () => unknown }) => void) => docs.forEach(cb) };
  },
  onSnapshot: () => () => undefined,
  query: (...args: unknown[]) => ({ __query: args }),
  where: (...args: unknown[]) => ({ __where: args }),
  setDoc: async (ref: { __col: string; __id: string }, data: unknown) => {
    mem.setCalls.push({ col: ref.__col, id: ref.__id, data });
    mem.docs.set(`${ref.__col}/${ref.__id}`, data);
  },
  updateDoc: async (ref: { __col: string; __id: string }, data: unknown) => {
    mem.updateCalls.push({ col: ref.__col, id: ref.__id, data });
  },
  deleteDoc: async (ref: { __col: string; __id: string }) => {
    mem.deleteCalls.push({ col: ref.__col, id: ref.__id });
    mem.docs.delete(`${ref.__col}/${ref.__id}`);
  },
}));

vi.mock('../src/lib/firebase', () => ({
  db: {},
  scopeDeUsuario: () => ({}),
  claveScope: () => 'test',
  subscribeIncidencias: () => () => undefined,
  subscribeTareasMantenimiento: () => () => undefined,
  subscribePolizas: () => () => undefined,
  subscribeSiniestros: () => () => undefined,
  subscribeTrabajosProfesionales: () => () => undefined,
  subscribeExpedientesRecomercializacion: () => () => undefined,
  subscribeAuditLogs: () => () => undefined,
  subscribeGarantiasReparacion: () => () => undefined,
  subscribeNecesidadesReforma: () => () => undefined,
  subscribePolizasSeguras: () => () => undefined,
  subscribeProyectosReforma: () => () => undefined,
  subscribePresupuestosProfesionales: () => () => undefined,
  subscribeGastos: () => () => undefined,

  // Paridad con el limpiador real: omite las claves `undefined` (Firestore las rechaza).
  deepCleanForFirestore: (valor: unknown): unknown => JSON.parse(JSON.stringify(valor ?? null)),
  sanitizeObjectForFirestore: (valor: unknown): unknown => JSON.parse(JSON.stringify(valor ?? null)),
  registrarAuditoriaFirestore: async () => undefined,
}));

// Imports DESPUÉS de los mocks (el adaptador importa `./firebase`).
import {
  crearDepsBajaPatrimonialFirestore,
  darDeBajaInmuebleFirestore,
  type DepsBajaPatrimonialInmueble,
} from '../src/lib/bajaPatrimonialInmuebleFirestore';
import type { RegistroEstadoSindicacion } from '../src/sindicacion/estadoRepositorio';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function inmueble(parcial: Partial<Inmueble> & { id: string }): Inmueble {
  return {
    direccion: 'Calle Test 1',
    ciudad: 'Valencia',
    precio: 900,
    estado: 'disponible',
    habitaciones: 2,
    banos: 1,
    superficie: 70,
    candidatosCount: 0,
    fianzaMeses: 1,
    ...parcial,
  } as Inmueble;
}

const SOLICITUD_BAJA = { fecha: '2026-10-01T00:00:00.000Z', motivo: 'BAJA_ADMINISTRATIVA' as const };

const AMBITO_MASTER: AmbitoEscrituraInmuebles = { esMaster: true, tipoPerfil: 'ADMINISTRADOR' };
const AMBITO_TITULAR: AmbitoEscrituraInmuebles = { esMaster: false, tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_A' };
const AMBITO_LECTURA: AmbitoEscrituraInmuebles = { esMaster: false, tipoPerfil: 'ADMINISTRADOR' };

/** Puerto falso: registra cada llamada y no toca Firestore. */
function puertoFalso(over: Partial<DepsBajaPatrimonialInmueble> = {}) {
  const llamadas = {
    updates: [] as Array<{ id: string; parche: Partial<Inmueble> }>,
    retiradas: [] as Array<{ inmuebleId: string; portal: string; registro: RegistroEstadoSindicacion }>,
    listados: 0,
  };
  const deps: DepsBajaPatrimonialInmueble = {
    actualizarInmueble: async (id, parche) => {
      llamadas.updates.push({ id, parche });
    },
    listarPublicaciones: async () => {
      llamadas.listados += 1;
      return [];
    },
    retirarPublicacion: async ({ inmuebleId, registro }) => {
      llamadas.retiradas.push({ inmuebleId, portal: registro.portal, registro });
    },
    ...over,
  };
  return { deps, llamadas };
}

function registroPublicacion(over: Partial<RegistroEstadoSindicacion> = {}): RegistroEstadoSindicacion {
  const identidad = identidadPublicacionPortal('inm_1', 'IDEALISTA');
  return {
    id: identidad.externalId,
    clave: identidad.clave,
    inmuebleId: 'inm_1',
    propietarioId: 'prop_A',
    portal: 'IDEALISTA',
    externalId: identidad.externalId,
    estado: 'PUBLICADO',
    version: 3,
    hashContenido: 'a'.repeat(64),
    operacionesRegistradas: 2,
    creadoEn: '2026-09-01T00:00:00.000Z',
    actualizadoEn: '2026-09-01T00:00:00.000Z',
    esquema: 1,
    ...over,
  };
}

// ===========================================================================
// 1. REGLAS REALES
// ===========================================================================
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const { permite, SIN_COMENTARIOS } = crearEvaluadorReglas(RULES);
const EMAIL_ADMIN = (SIN_COMENTARIOS(RULES).match(/function\s+isMasterAdmin\(\)\s*\{[\s\S]*?'([^'@\s]+@[^'\s]+)'/) || [])[1];
if (!EMAIL_ADMIN) throw new Error('isMasterAdmin() no contiene un email literal: fichero equivocado');

const INM_A = { id: 'inm_A', propietarioId: 'prop_A', direccion: 'Calle A 1', precio: 900 };
const INM_B = { id: 'inm_B', propietarioId: 'prop_B', direccion: 'Calle B 2', precio: 800 };
const PARCHE_BAJA = {
  estadoPatrimonial: 'BAJA',
  estadoExplotacion: 'SIN_EXPLOTACION',
  bajaPatrimonial: { fecha: '2026-10-01', motivo: 'BAJA_ADMINISTRATIVA', registradaEn: '2026-10-01T00:00:00.000Z' },
};

const FIRESTORE: Peticion['db'] = {
  'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_admin' },
  'usuarios_auth/uid_propA': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_A', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_propB': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_B', profesionalId: '', inmuebleIds: [] },
  // Gestor de cartera con ESCRITURA (carterasE) sobre la cartera de prop_A.
  'usuarios_auth/uid_gestorE': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_gestor', profesionalId: '', inmuebleIds: [], carterasL: ['prop_A'], carterasE: ['prop_A'] },
  // Gestor de la misma cartera con SÓLO lectura (carterasL).
  'usuarios_auth/uid_gestorL': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_lector', profesionalId: '', inmuebleIds: [], carterasL: ['prop_A'], carterasE: [] },
  'inmuebles/inm_A': INM_A,
  'inmuebles/inm_B': INM_B,
};
completarPerfilesSinteticos(FIRESTORE);

const AUTH = {
  propA: { uid: 'uid_propA', token: { email: 'prop-a@test.local' } },
  propB: { uid: 'uid_propB', token: { email: 'prop-b@test.local' } },
  admin: { uid: 'uid_admin', token: { email: 'admin@test.local' } },
  gestorE: { uid: 'uid_gestorE', token: { email: 'gestor-e@test.local' } },
  gestorL: { uid: 'uid_gestorL', token: { email: 'gestor-l@test.local' } },
  master: { uid: 'uid_master', token: { email: EMAIL_ADMIN } },
};

function peticion(over: Partial<Peticion>): Peticion {
  return { auth: null, db: FIRESTORE, resource: null, requestResource: null, docId: 'inm_A', ...over };
}

const updateInmueble = (auth: Peticion['auth'], docId: string, resource: Record<string, unknown>, requestResource: Record<string, unknown>) =>
  permite('inmuebles', 'update', peticion({ auth, docId, resource, requestResource }));

describe('rules · la baja es un update: sin escritura no se puede, con escritura sí', () => {
  it('R1 · master: puede dar de baja (update con el parche patrimonial)', () => {
    expect(updateInmueble(AUTH.master, 'inm_A', INM_A, { ...INM_A, ...PARCHE_BAJA })).toBe(true);
  });

  it('R2 · titular del inmueble: puede dar de baja conservando la titularidad', () => {
    expect(updateInmueble(AUTH.propA, 'inm_A', INM_A, { ...INM_A, ...PARCHE_BAJA })).toBe(true);
  });

  it('R3 · gestor con cartera de ESCRITURA: puede dar de baja', () => {
    expect(updateInmueble(AUTH.gestorE, 'inm_A', INM_A, { ...INM_A, ...PARCHE_BAJA })).toBe(true);
  });

  it('R4 · SIN escritura no se puede: propietario ajeno, perfil ADMINISTRADOR y gestor de sólo lectura', () => {
    expect(updateInmueble(AUTH.propB, 'inm_A', INM_A, { ...INM_A, ...PARCHE_BAJA })).toBe(false);
    expect(updateInmueble(AUTH.admin, 'inm_A', INM_A, { ...INM_A, ...PARCHE_BAJA })).toBe(false);
    expect(updateInmueble(AUTH.gestorL, 'inm_A', INM_A, { ...INM_A, ...PARCHE_BAJA })).toBe(false);
  });

  it('R5 · `allow delete` de inmuebles NO se ha ampliado: sigue siendo sólo master', () => {
    const puedeBorrar = (auth: Peticion['auth']) =>
      permite('inmuebles', 'delete', peticion({ auth, docId: 'inm_A', resource: INM_A, requestResource: null }));
    expect(puedeBorrar(AUTH.master)).toBe(true);
    expect(puedeBorrar(AUTH.admin)).toBe(false);
    expect(puedeBorrar(AUTH.propA)).toBe(false);
    expect(puedeBorrar(AUTH.gestorE)).toBe(false);
    expect(puedeBorrar(AUTH.propB)).toBe(false);
  });
});

// ===========================================================================
// 2. NÚCLEO PURO
// ===========================================================================
describe('núcleo · la baja conserva el inmueble, la titularidad y el histórico', () => {
  const CON_TITULARES = inmueble({ id: 'inm_1', propietarioId: 'prop_A', titularesIds: ['prop_A', 'prop_B'] });

  it('N1 · el parche cambia el estado patrimonial y NO toca titularidad ni titularesIds', () => {
    const plan = darDeBajaInmueble(CON_TITULARES, SOLICITUD_BAJA);
    expect(plan.ok).toBe(true);
    expect(plan.parche?.estadoPatrimonial).toBe('BAJA');
    expect(plan.parche?.estadoExplotacion).toBe('SIN_EXPLOTACION');
    expect(Object.keys(plan.parche || {})).not.toContain('titularesIds');
    expect(Object.keys(plan.parche || {})).not.toContain('propietarioId');
    expect(JSON.stringify(plan.parche)).not.toMatch(/delete|borrar/i);
  });

  it('N2 · VENTA ⇒ VENDIDO con fecha; BAJA_ADMINISTRATIVA ⇒ BAJA sin fecha de venta', () => {
    const venta = darDeBajaInmueble(inmueble({ id: 'inm_1' }), { fecha: '2026-05-01', motivo: 'VENTA' });
    expect(venta.parche?.estadoPatrimonial).toBe('VENDIDO');
    expect(venta.parche?.fechaVenta).toBe('2026-05-01');
    const baja = darDeBajaInmueble(inmueble({ id: 'inm_1' }), SOLICITUD_BAJA);
    expect(baja.parche?.estadoPatrimonial).toBe('BAJA');
    expect(baja.parche?.fechaVenta).toBeUndefined();
  });

  it('N3 · fallo de persistencia ⇒ el estado de la UI NO cambia (misma referencia)', () => {
    const estado = [CON_TITULARES, inmueble({ id: 'inm_2' })];
    const intacto = aplicarBajaAlEstado(estado, 'inm_1', { ok: false });
    expect(intacto).toBe(estado);
    expect(intacto.find((i) => i.id === 'inm_1')?.estadoPatrimonial).toBeUndefined();
  });

  it('N4 · éxito ⇒ se aplica el parche guardado y sólo al inmueble afectado', () => {
    const otro = inmueble({ id: 'inm_2', direccion: 'Otra' });
    const plan = darDeBajaInmueble(CON_TITULARES, SOLICITUD_BAJA);
    const estado = aplicarBajaAlEstado([CON_TITULARES, otro], 'inm_1', { ok: true, parche: plan.parche });
    expect(estado[0].estadoPatrimonial).toBe('BAJA');
    expect(estado[0].titularesIds).toEqual(['prop_A', 'prop_B']);
    expect(estado[1]).toBe(otro);
    expect(estado[1].estadoPatrimonial).toBeUndefined();
  });

  it('N5 · vista activa / histórico: el dado de baja sale de la actividad pero se conserva', () => {
    const activo = inmueble({ id: 'inm_1' });
    const baja = inmueble({ id: 'inm_2', estadoPatrimonial: 'BAJA', bajaPatrimonial: { fecha: '2026-10-01', motivo: 'BAJA_ADMINISTRATIVA', registradaEn: '2026-10-01T00:00:00.000Z' } });
    expect(inmueblesOperativos([activo, baja]).map((i) => i.id)).toEqual(['inm_1']);
    expect(inmueblesDadosDeBaja([activo, baja]).map((i) => i.id)).toEqual(['inm_2']);
    expect(resumenBajaPatrimonial(baja)).toContain('histórico');
  });

  it('N6 · la publicación a retirar es la que pudo estar fuera; el registro se conserva', () => {
    expect(requiereRetiradaPublicacion(registroPublicacion({ estado: 'PUBLICADO' }))).toBe(true);
    expect(requiereRetiradaPublicacion(registroPublicacion({ estado: 'ACTUALIZADO' }))).toBe(true);
    expect(requiereRetiradaPublicacion(registroPublicacion({ estado: 'LISTO_PARA_PUBLICAR' }))).toBe(true);
    expect(requiereRetiradaPublicacion(registroPublicacion({ estado: 'ERROR' }))).toBe(true);
    expect(requiereRetiradaPublicacion(registroPublicacion({ estado: 'DESPUBLICADO' }))).toBe(false);
    expect(requiereRetiradaPublicacion(registroPublicacion({ estado: 'BORRADOR', version: undefined, hashContenido: undefined }))).toBe(false);
    expect(requiereRetiradaPublicacion(registroPublicacion({ estado: 'BORRADOR', version: 2 }))).toBe(true);
    const pendientes = registrosARetirarPorBaja(
      [registroPublicacion({ estado: 'PUBLICADO' }), registroPublicacion({ estado: 'DESPUBLICADO' })],
      'inm_1',
    );
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].portal).toBe('IDEALISTA');
  });

  it('N7 · autorización: master y titular sí; sólo-lectura no; un inmueble ya dado de baja tampoco', () => {
    const propio = inmueble({ id: 'inm_1', propietarioId: 'prop_A' });
    expect(puedeDarDeBajaInmueble(AMBITO_MASTER, propio)).toBe(true);
    expect(puedeDarDeBajaInmueble(AMBITO_TITULAR, propio)).toBe(true);
    expect(puedeDarDeBajaInmueble(AMBITO_LECTURA, propio)).toBe(false);
    expect(puedeDarDeBajaInmueble(AMBITO_TITULAR, inmueble({ id: 'inm_9', propietarioId: 'prop_B' }))).toBe(false);
    expect(puedeDarDeBajaInmueble({ esMaster: false, tipoPerfil: 'PROPIETARIO', propietariosGestionadosEscritura: ['prop_A'] }, propio)).toBe(true);
    expect(puedeDarDeBajaInmueble({ esMaster: false, tipoPerfil: 'PROPIETARIO', inmueblesParcialesEscritura: ['inm_1'] }, propio)).toBe(true);
    expect(puedeDarDeBajaInmueble(AMBITO_MASTER, inmueble({ id: 'inm_1', estadoPatrimonial: 'VENDIDO' }))).toBe(false);
  });
});

// ===========================================================================
// 3. ADAPTADOR
// ===========================================================================
describe('adaptador · update (nunca delete) + retirada de publicación', () => {
  const BASE = inmueble({ id: 'inm_1', propietarioId: 'prop_A', titularesIds: ['prop_A', 'prop_B'] });

  it('A1 · persiste con update, sin borrar nada, y con el parche patrimonial', async () => {
    const { deps, llamadas } = puertoFalso();
    const resultado = await darDeBajaInmuebleFirestore(BASE, SOLICITUD_BAJA, { deps });
    expect(resultado.ok).toBe(true);
    expect(llamadas.updates).toHaveLength(1);
    expect(llamadas.updates[0].id).toBe('inm_1');
    expect(llamadas.updates[0].parche.estadoPatrimonial).toBe('BAJA');
    expect(llamadas.updates[0].parche.estadoExplotacion).toBe('SIN_EXPLOTACION');
    expect(llamadas.updates[0].parche.bajaPatrimonial?.motivo).toBe('BAJA_ADMINISTRATIVA');
    // El parche persistido es el que la UI puede aplicar (sin `undefined`).
    expect(JSON.stringify(resultado.parche)).not.toContain('undefined');
    expect((resultado.parche as Record<string, unknown>).titularesIds).toBeUndefined();
  });

  it('A2 · retira la publicación de los registros con algo fuera, conservando el registro', async () => {
    const publicados = [
      registroPublicacion({ estado: 'PUBLICADO' }),
      registroPublicacion({ portal: 'FOTOCASA', estado: 'DESPUBLICADO' }),
    ];
    const { deps, llamadas } = puertoFalso({ listarPublicaciones: async () => publicados });
    const resultado = await darDeBajaInmuebleFirestore(BASE, SOLICITUD_BAJA, { deps });
    expect(resultado.ok).toBe(true);
    expect(resultado.publicacion.retirada).toBe(true);
    expect(resultado.publicacion.portales).toEqual(['IDEALISTA']);
    expect(llamadas.retiradas).toHaveLength(1);
    // El registro NO se borra ni se mutila: se entrega íntegro para el cambio de estado.
    expect(llamadas.retiradas[0].registro.version).toBe(3);
    expect(llamadas.retiradas[0].registro.hashContenido).toBe('a'.repeat(64));
  });

  it('A3 · el puerto real de retirada deja el registro en DESPUBLICADO conservando versión y huella', async () => {
    mem.setCalls.length = 0;
    const publicacion = registroPublicacion({ estado: 'PUBLICADO' });
    mem.docs.set(`sindicacion_inmuebles/${publicacion.id}`, publicacion);
    const deps = crearDepsBajaPatrimonialFirestore(BASE, { id: 'u1', nombre: 'Admin' });
    await deps.retirarPublicacion({ inmuebleId: 'inm_1', registro: publicacion, fecha: '2026-10-01T00:00:00.000Z' });
    const guardado = mem.setCalls[0]?.data as RegistroEstadoSindicacion;
    expect(guardado.estado).toBe('DESPUBLICADO');
    expect(guardado.ultimaOperacion).toBe('retirar');
    expect(guardado.version).toBe(3);
    expect(guardado.hashContenido).toBe('a'.repeat(64));
    expect(guardado.propietarioId).toBe('prop_A');
    expect(mem.deleteCalls).toHaveLength(0);
  });

  it('A4 · error de persistencia ⇒ ok:false, sin retirar publicación y con el inmueble intacto', async () => {
    const error = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    const { deps, llamadas } = puertoFalso({
      actualizarInmueble: async () => {
        throw error;
      },
    });
    const espia = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const resultado = await darDeBajaInmuebleFirestore(BASE, SOLICITUD_BAJA, { deps });
    espia.mockRestore();
    expect(resultado.ok).toBe(false);
    expect(resultado.errorPermisos).toBe(true);
    expect(resultado.parche).toBeUndefined();
    expect(llamadas.retiradas).toHaveLength(0);
    expect(llamadas.listados).toBe(0);
  });

  it('A5 · si la publicación no se pudo retirar, la baja sigue siendo válida y se avisa', async () => {
    const { deps } = puertoFalso({
      listarPublicaciones: async () => {
        throw new Error('permission-denied');
      },
    });
    const espia = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const resultado = await darDeBajaInmuebleFirestore(BASE, SOLICITUD_BAJA, { deps });
    espia.mockRestore();
    expect(resultado.ok).toBe(true);
    expect(resultado.publicacion.retirada).toBe(false);
    expect(resultado.publicacion.aviso).toMatch(/publicación/i);
  });

  it('A6 · la operación no toca titularidades, propietarios ni la ficha pública', async () => {
    const { deps, llamadas } = puertoFalso();
    await darDeBajaInmuebleFirestore(BASE, SOLICITUD_BAJA, { deps });
    const claves = Object.keys(llamadas.updates[0].parche);
    expect(claves.some((c) => /titular|propietarioId$/.test(c))).toBe(false);
  });
});

// ===========================================================================
// 4. INVARIANTES DE FUENTE (no queda ninguna vía de borrado del inmueble)
// ===========================================================================
describe('fuente · el borrado físico de inmuebles ha desaparecido', () => {
  /** Fuente sin comentarios: los invariantes se miden sobre el CÓDIGO, no sobre las notas. */
  const leer = (rel: string) =>
    readFileSync(resolve(RAIZ, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('S1 · firebase.ts ya no expone deleteInmuebleFirestore ni borra `inmuebles`', () => {
    const fuente = leer('src/lib/firebase.ts');
    expect(fuente).not.toMatch(/deleteInmuebleFirestore/);
    expect(fuente).not.toMatch(/deleteDoc\(\s*doc\(db,\s*'inmuebles'/);
  });

  it('S2 · App.tsx usa la baja patrimonial y ya no llama al borrado', () => {
    const fuente = leer('src/App.tsx');
    expect(fuente).not.toMatch(/deleteInmuebleFirestore/);
    expect(fuente).toMatch(/darDeBajaInmuebleFirestore/);
    expect(fuente).toMatch(/onBajaInmueble=\{handleBajaInmueble\}/);
  });

  it('S3 · el adaptador de baja no contiene ninguna instrucción de borrado', () => {
    const fuente = leer('src/lib/bajaPatrimonialInmuebleFirestore.ts');
    expect(fuente).not.toMatch(/deleteDoc|deleteFichaPublicaInmueble|borrarEstadoSindicacionFirestore/);
  });
});

// ===========================================================================
// 5. UI
// ===========================================================================
afterEach(() => cleanup());

function renderSeccion(props: {
  inmuebles: Inmueble[];
  onBajaInmueble?: (inmueble: Inmueble) => Promise<boolean>;
  puedeDarDeBaja?: (inmueble: Inmueble) => boolean;
}) {
  return render(
    <InmueblesSection
      inmuebles={props.inmuebles}
      candidatos={[]}
      propietarios={[]}
      onSelectCandidate={() => undefined}
      onBajaInmueble={props.onBajaInmueble}
      puedeDarDeBaja={props.puedeDarDeBaja ?? (() => true)}
    />,
  );
}

describe('UI · el inmueble nunca desaparece por un fallo de persistencia', () => {
  it('U1 · fallo de la baja ⇒ error visible, modal abierto y tarjeta intacta', async () => {
    const activo = inmueble({ id: 'inm_1', direccion: 'Calle Test 1' });
    renderSeccion({ inmuebles: [activo], onBajaInmueble: async () => false });

    fireEvent.click(screen.getByTitle('Dar de baja el inmueble (se conserva todo el histórico)'));
    fireEvent.click(screen.getByRole('button', { name: /Sí, dar de baja/ }));

    await screen.findByText(/No se pudo registrar la baja del inmueble/);
    // El inmueble sigue en la vista: no ha habido borrado optimista.
    expect(screen.getAllByText('Calle Test 1').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Sí, dar de baja/ })).toBeTruthy();
  });

  it('U2 · éxito ⇒ el modal se cierra y la tarjeta sigue (el histórico lo gobierna el host)', async () => {
    const activo = inmueble({ id: 'inm_1', direccion: 'Calle Test 1' });
    renderSeccion({ inmuebles: [activo], onBajaInmueble: async () => true });

    fireEvent.click(screen.getByTitle('Dar de baja el inmueble (se conserva todo el histórico)'));
    fireEvent.click(screen.getByRole('button', { name: /Sí, dar de baja/ }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /Sí, dar de baja/ })).toBeNull());
    expect(screen.getAllByText('Calle Test 1').length).toBeGreaterThan(0);
  });

  it('U3 · sin autorización de escritura no se ofrece la baja', () => {
    const activo = inmueble({ id: 'inm_1' });
    renderSeccion({ inmuebles: [activo], onBajaInmueble: async () => true, puedeDarDeBaja: () => false });
    expect(screen.queryByTitle('Dar de baja el inmueble (se conserva todo el histórico)')).toBeNull();
  });

  it('U4 · dado de baja: fuera de la vista activa y accesible desde el histórico', () => {
    const baja = inmueble({
      id: 'inm_2',
      direccion: 'Calle Histórica 9',
      estadoPatrimonial: 'VENDIDO',
      bajaPatrimonial: { fecha: '2026-09-01', motivo: 'VENTA', registradaEn: '2026-09-01T00:00:00.000Z' },
    });
    renderSeccion({ inmuebles: [baja], onBajaInmueble: async () => true });

    // Vista activa: el inmueble dado de baja no aparece y no se ofrece otra baja.
    expect(screen.queryByText('Calle Histórica 9')).toBeNull();
    expect(screen.queryByTitle('Dar de baja el inmueble (se conserva todo el histórico)')).toBeNull();

    // Histórico: sigue accesible, con su etiqueta de ciclo patrimonial.
    fireEvent.click(screen.getByRole('button', { name: /Histórico \(1\)/ }));
    expect(screen.getAllByText('Calle Histórica 9').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vendido').length).toBeGreaterThan(0);
  });
});


describe('visibilidad transversal · cartera operativa e histórico', () => {
  const a = inmueble({ id: 'a', direccion: 'Activa A', titularesIds: ['p1', 'p2'], propietarioId: 'p1' });
  const b = inmueble({ id: 'b', direccion: 'Activa B', estadoExplotacion: 'SIN_EXPLOTACION' });
  const h = inmueble({ id: 'h', direccion: 'Histórica H', estadoPatrimonial: 'BAJA', titularesIds: ['p1', 'p2'] });
  const mezcla = [a, b, h];

  it('listado y contador usan el mismo conjunto; histórico exclusivamente histórico', () => {
    renderSeccion({ inmuebles: mezcla });
    expect(screen.getByRole('button', { name: 'Todos (2)' })).toBeTruthy();
    expect(screen.getAllByText('Activa A').length).toBeGreaterThan(0);
    expect(screen.getByText('Activa B')).toBeTruthy();
    expect(screen.queryByText('Histórica H')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Histórico (1)' }));
    expect(screen.getByText('Histórica H')).toBeTruthy();
    expect(screen.queryByText('Activa A')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Todos (2)' }));
    expect(screen.queryByText('Histórica H')).toBeNull();
  });

  it('inicio elimina tarjeta histórica y cuenta sólo activas sin depender del host', () => {
    render(<InicioSection inmuebles={mezcla} candidatos={[]} onSelectCandidate={() => {}} onSelectSection={() => {}} />);
    expect(screen.getByText('De 2 viviendas activas')).toBeTruthy();
    expect(screen.getAllByText('Activa A').length).toBeGreaterThan(0);
    expect(screen.queryByText('Histórica H')).toBeNull();
  });

  it('dashboard no ofrece tarjetas históricas, incluso con props de caché completas', () => {
    render(<DashboardEjecutivoSection inmuebles={mezcla} contratos={[]} cobros={[]} gastos={[]} candidatos={[]} onSelectSection={() => {}} />);
    expect(screen.getAllByText('Activa A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Activa B').length).toBeGreaterThan(0);
    expect(screen.queryByText('Histórica H')).toBeNull();
  });

  it('snapshot de baja con ficha abierta produce aviso, no una ficha vacía', () => {
    const props = { candidatos: [], propietarios: [], onSelectCandidate: () => {} };
    const { rerender } = render(<InmueblesSection {...props} inmuebles={[a]} />);
    fireEvent.click(screen.getByText('Activa A'));
    const actualizado = { ...a, estadoPatrimonial: 'BAJA' as const };
    rerender(<InmueblesSection {...props} inmuebles={[actualizado]} />);
    expect(screen.getByText('Inmueble histórico / dado de baja')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar ficha histórica' }));
    expect(screen.getAllByText('Activa A').length).toBeGreaterThan(0);
  });

  it('baja confirmada actualiza listado y contador sin recargar; conserva el documento', () => {
    const props = { candidatos: [], propietarios: [], onSelectCandidate: () => {} };
    const { rerender } = render(<InmueblesSection {...props} inmuebles={mezcla} />);
    const siguiente = aplicarBajaAlEstado(mezcla, 'a', { ok: true, parche: { estadoPatrimonial: 'BAJA' } });
    rerender(<InmueblesSection {...props} inmuebles={siguiente} />);
    expect(screen.getByRole('button', { name: 'Todos (1)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Histórico (2)' })).toBeTruthy();
    expect(screen.queryByText('Activa A')).toBeNull();
    expect(siguiente).toHaveLength(3);
  });

  it.each(['p1', 'p2'])('N titulares: %s conserva acceso histórico y activo', (pid) => {
    const autorizados = mezcla.filter(i => i.titularesIds?.includes(pid));
    expect(inmueblesOperativos(autorizados)).toEqual([a]);
    expect(inmueblesDadosDeBaja(autorizados)).toEqual([h]);
    expect(inmueblesOperativos(autorizados)[0].titularesIds).toEqual(['p1', 'p2']);
  });

  it('selectores normales excluyen histórico; editar conserva la referencia histórica previa', () => {
    expect(inmueblesParaSeleccion(mezcla)).toEqual([a, b]);
    expect(inmueblesParaSeleccion(mezcla, 'h')).toEqual([a, b, h]);
    expect(inmueblesParaSeleccion(mezcla, 'a')).toEqual([a, b]);
  });

  it('SIN_EXPLOTACION e historial de bajas previas no significan baja actual', () => {
    expect(inmueblesOperativos([b, { ...a, estadoPatrimonial: 'ACTIVO', historialBajas: [h.bajaPatrimonial!] }])).toHaveLength(2);
  });

  it('App conecta cabeceras, dashboard y selectores al conjunto operativo sin mutilar histórico', () => {
    const app = readFileSync(resolve(RAIZ, 'src/App.tsx'), 'utf8');
    expect(app).not.toContain('inmueblesCount={scopedInmuebles.length}');
    expect(app.match(/inmueblesCount=\{inmueblesCarteraOperativa.length\}/g)).toHaveLength(2);
    expect(app).toMatch(/<DashboardEjecutivoSection\s+inmuebles=\{inmueblesCarteraOperativa\}/);
    expect(app).toMatch(/<InmueblesSection\s+inmuebles=\{scopedInmuebles\}/);
    expect(app).toContain('i.titularesIds?.includes(currentUser.propietarioId)');
  });
});
