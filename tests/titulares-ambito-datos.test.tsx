/**
 * @vitest-environment jsdom
 *
 * TITULARES EN EL ÁMBITO DEL PROPIETARIO — CAPA DE DATOS Y CABLEADO (PR #19, 2026-10-01)
 * ======================================================================================
 *   S · la escucha `subscribeTitularesAmbito` lee TODOS los titulares del ámbito con UNA consulta de
 *       igualdad, autorizada por el TEXTO REAL de `firestore.rules` (doble de Firestore + evaluador
 *       del repo); nada de otro ámbito ni sin ámbito; sin tope.
 *   I · AISLAMIENTO de la lectura: su fallo es CAPACIDAD (no error de carga del Portal), tiene
 *       aviso propio con «Reintentar lectura» y NO remite a un administrador; la ficha propia
 *       (lectura primaria) no depende de ella.
 *   H · el hook del host: quién consulta, reintento propio, sin escuchas huérfanas.
 *   W · cableado en `App.tsx` (pines sobre el fuente real; no se monta App completo).
 *   F · el endpoint de búsqueda de servidor no revela titulares de OTRO ámbito.
 *   C · Carteras NO cambia: lista de capacidades, texto del aviso y reintento propios.
 *
 * Limitación declarada (igual que en Carteras): el evaluador del repo decide documento a documento;
 * NO es el planificador de consultas de Google. La consulta (`list`) se modela con el criterio del
 * resto de tests del repo (la consulta se autoriza si la regla se cumple para un documento cuyos
 * ÚNICOS campos conocidos son los que fija el filtro de igualdad). Verificarla en el motor real
 * (`firebase emulators:exec`) queda pendiente de un entorno con Java y red.
 */
import React, { useEffect } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
import { completarPerfilesSinteticos } from './harness/perfilesSinteticos';
import { AvisoIncidenciasDatos } from '../src/components/estado-datos/AvisoIncidenciasDatos';
import {
  ORIGENES_CAPACIDAD_ADICIONAL,
  esCapacidadAdicional,
  incidenciasDatos,
  partirIncidenciasPorAlcance,
  reiniciarCanalIncidencias,
  reportarErrorLectura,
} from '../src/estadoDatos/canalIncidencias';
import { useTitularesAmbito, PERFILES_CON_AMBITO_DE_TITULARES, type SuscribirTitularesAmbito } from '../src/estadoDatos/useTitularesAmbito';
import { PuertaEstadoDatos } from '../src/components/estado-datos/EstadoDatosPantalla';
import { PropietariosSection } from '../src/components/sections/PropietariosSection';
import { useEstadoLecturas } from '../src/estadoDatos/useEstadoLecturas';
import { fichasVisiblesDelPropietario } from '../src/lib/titularesModelo';
import {
  construirTitularidad,
  esIdTitularidadValido,
  idTitularidad,
  partirIdTitularidad,
  validarPorcentajes,
} from '../src/utils/titularidadesEngine';
import { permisosTitulares } from '../src/utils/permisosTitulares';
import { buscarTitulares } from '../server/titularidades/backendTitulares';
import type { DependenciasBackendTitulares, DocumentoServidor } from '../server/titularidades/backendTitulares';
import type { CuentaServicio } from '../server/titularidades/googleBackend';
import { fichaDeAmbitoAjeno } from '../src/titularidades/busquedaTitulares';

const RAIZ = resolve(__dirname, '..');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const BLOQUE_ANTERIOR = readFileSync(resolve(__dirname, 'fixtures/propietarios-bloque-reglas-anterior.txt'), 'utf8');
const APP = readFileSync(resolve(RAIZ, 'src/App.tsx'), 'utf8');
const FIREBASE_TS = readFileSync(resolve(RAIZ, 'src/lib/firebase.ts'), 'utf8');

type Doc = Record<string, unknown>;
const mundo = vi.hoisted(() => ({
  authUid: null as string | null,
  db: {} as Record<string, Record<string, unknown>>,
  consultas: [] as Array<{ coleccion: string; filtros: Array<{ campo: string; valor: unknown }> }>,
  oyentesDoc: [] as string[],
}));
/** Reglas que aplica el doble: por defecto, las del repositorio. */
let permite = crearEvaluadorReglas(RULES).permite;
const bloqueDe = (reglas: string) => {
  const ini = reglas.indexOf('    match /propietarios/{propietarioId} {');
  return reglas.slice(ini, reglas.indexOf('    // =========================================================================\n    // 1. INMUEBLES', ini));
};
/** Lo que habría si las reglas nuevas NO estuvieran publicadas: el bloque anterior, tal cual. */
const REGLAS_SIN_PUBLICAR = RULES.replace(bloqueDe(RULES), () => BLOQUE_ANTERIOR);

vi.mock('firebase/app', () => ({ initializeApp: () => ({}), getApps: () => [] }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({
    get currentUser() {
      return mundo.authUid ? { uid: mundo.authUid } : null;
    },
  }),
}));
vi.mock('firebase/storage', () => ({
  getStorage: () => ({}), ref: () => ({}), uploadBytes: async () => ({}),
  uploadString: async () => ({}), getDownloadURL: async () => '', deleteObject: async () => {},
}));
vi.mock('firebase/firestore', () => {
  const errorPermisos = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  const peticion = (resource: Doc | null, docId: string): Peticion => ({
    auth: mundo.authUid ? { uid: mundo.authUid, token: { email: 'u@test.local', email_verified: true } } : null,
    db: mundo.db, resource, requestResource: null, docId,
  });
  const consultaAutorizada = (col: string, filtros: Array<{ campo: string; valor: unknown }>): boolean => {
    const representante = Object.fromEntries(filtros.map((f) => [f.campo, f.valor]));
    try { return permite(col, 'list', peticion(representante, 'x')); } catch { return false; }
  };
  const docsDe = (col: string, filtros: Array<{ campo: string; valor: unknown }>) =>
    Object.entries(mundo.db)
      .filter(([ruta]) => ruta.startsWith(`${col}/`))
      .map(([ruta, d]) => ({ id: ruta.slice(col.length + 1), d }))
      .filter(({ d }) => filtros.every((f) => d[f.campo] === f.valor))
      .map(({ id, d }) => ({ id, data: () => d, exists: () => true }));
  const decideGet = (ref: any): boolean => {
    const d = mundo.db[ref.path] ?? null;
    try { return permite(ref.__col, 'get', peticion(d, ref.id)); } catch { return false; }
  };
  return {
    getFirestore: () => ({}),
    collection: (_db: unknown, nombre: string) => ({ __col: nombre }),
    doc: (...args: any[]) => {
      const col = args.length === 2 ? args[0].__col : args[1];
      const id = args.length === 2 ? args[1] : args[2];
      return { __col: col, id, path: `${col}/${id}` };
    },
    where: (campo: string, _op: string, valor: unknown) => ({ campo, valor }),
    query: (col: any, ...filtros: any[]) => ({ __col: col.__col, filtros: filtros.filter((f) => f && f.campo) }),
    onSnapshot: (ref: any, onNext: (s: any) => void, onError?: (e: unknown) => void) => {
      if (ref.path && !ref.filtros) {
        // escucha de DOCUMENTO → `allow get` sobre el documento real
        mundo.oyentesDoc.push(ref.path);
        let vivo = true;
        void Promise.resolve().then(() => {
          if (!vivo) return;
          if (!decideGet(ref)) { onError?.(errorPermisos()); return; }
          const d = mundo.db[ref.path] ?? null;
          onNext({ id: ref.id, exists: () => d !== null, data: () => d, metadata: { fromCache: false } });
        });
        return () => { vivo = false; };
      }
      mundo.consultas.push({ coleccion: ref.__col, filtros: ref.filtros });
      let vivo = true;
      void Promise.resolve().then(() => {
        if (!vivo) return;
        if (!consultaAutorizada(ref.__col, ref.filtros)) { onError?.(errorPermisos()); return; }
        const docs = docsDe(ref.__col, ref.filtros);
        onNext({ docs, forEach: (fn: (d: any) => void) => docs.forEach(fn), metadata: { fromCache: false } });
      });
      return () => { vivo = false; };
    },
    getDocs: async () => ({ docs: [] }),
    getDoc: async () => ({ exists: () => false, data: () => null }),
    setDoc: async () => {}, deleteDoc: async () => {}, updateDoc: async () => {},
    deleteField: () => ({}), writeBatch: () => ({ set() {}, update() {}, commit: async () => {} }),
    runTransaction: async () => ({}), serverTimestamp: () => ({}), arrayUnion: () => ({}), arrayRemove: () => ({}),
  };
});

// ─────────────────────────────────────────────────────────────────────────── mundo de prueba
const idAmbito = (n: number) => `tit_${n.toString(36).padStart(10, '0')}`;
const titular = (n: number, ambito: string): Doc => ({
  id: idAmbito(n), ambitoPropietarioId: ambito, nombre: `Titular ${n}`, nifCif: `${40000000 + n}K`,
  tipoPropietario: 'persona_fisica', cuentasBancarias: [], fechaCreacion: '2026-10-01', fechaActualizacion: '2026-10-01',
});

function mundoBase(deA: number, deB = 12): Record<string, Doc> {
  const db: Record<string, Doc> = {
    'usuarios_auth/uid_A': { uid: 'uid_A', usuarioId: 'usr_A', email: 'a@test.local', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', roles: [], propietarioId: 'owner_A', profesionalId: '', inmuebleIds: [] },
    'usuarios_auth/uid_B': { uid: 'uid_B', usuarioId: 'usr_B', email: 'b@test.local', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', roles: [], propietarioId: 'owner_B', profesionalId: '', inmuebleIds: [] },
    'propietarios/owner_A': { id: 'owner_A', nombre: 'Propia A', nifCif: '11111111H', cuentasBancarias: [] },
    'propietarios/owner_B': { id: 'owner_B', nombre: 'Propia B', nifCif: '22222222J', cuentasBancarias: [] },
    'propietarios/owner_C': { id: 'owner_C', nombre: 'Ajena C', nifCif: '33333333P', cuentasBancarias: [] },
  };
  for (let n = 1; n <= deA; n++) db[`propietarios/${idAmbito(n)}`] = titular(n, 'owner_A');
  for (let n = 0; n < deB; n++) db[`propietarios/${idAmbito(100_000 + n)}`] = titular(100_000 + n, 'owner_B');
  completarPerfilesSinteticos(db);
  return db;
}

const consolas = { error: vi.spyOn(console, 'error'), info: vi.spyOn(console, 'info'), warn: vi.spyOn(console, 'warn') };
beforeEach(() => {
  permite = crearEvaluadorReglas(RULES).permite;
  mundo.authUid = null;
  mundo.db = {};
  mundo.consultas = [];
  mundo.oyentesDoc = [];
  for (const c of Object.values(consolas)) c.mockImplementation(() => {});
  vi.resetModules();
});
afterEach(() => {
  cleanup();
  for (const c of Object.values(consolas)) c.mockClear();
});

async function cargar() {
  const fb = await import('../src/lib/firebase');
  const canal = await import('../src/estadoDatos/canalIncidencias');
  canal.reiniciarCanalIncidencias();
  return { fb, canal };
}

async function abrirTitulares(fb: typeof import('../src/lib/firebase'), propietarioId: string) {
  const recibidas: any[][] = [];
  const baja = fb.subscribeTitularesAmbito((t) => recibidas.push(t), propietarioId);
  await vi.waitFor(() => {
    const hubo = recibidas.length > 0 || consolas.error.mock.calls.some((c) => String(c[0]).includes('titulares de ámbito'));
    expect(hubo).toBe(true);
  });
  return { recibidas, baja };
}

// ═════════════════════════════════════════════════════════════════════════════
// S · la escucha lee TODOS los titulares del ámbito, y solo los de su ámbito
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · S — la escucha por ámbito (regla real)', () => {
  it('S1 · una consulta de igualdad `ambitoPropietarioId == su id` entrega TODOS sus titulares: 0, 1, 2, 3, 10, 100 y 300', async () => {
    for (const cantidad of [0, 1, 2, 3, 10, 100, 300]) {
      vi.resetModules();
      mundo.consultas = [];
      mundo.authUid = 'uid_A';
      mundo.db = mundoBase(cantidad);
      const { fb } = await cargar();
      const { recibidas, baja } = await abrirTitulares(fb, 'owner_A');
      // una sola consulta, de igualdad, por el ámbito propio; ni colección entera ni ids sueltos
      expect(mundo.consultas).toEqual([{ coleccion: 'propietarios', filtros: [{ campo: 'ambitoPropietarioId', valor: 'owner_A' }] }]);
      expect(recibidas.at(-1)).toHaveLength(cantidad);
      expect(recibidas.at(-1)!.every((t: any) => t.ambitoPropietarioId === 'owner_A')).toBe(true);
      expect(incidenciasDatos()).toHaveLength(0);
      baja();
    }
  }, 60_000);

  it('S2 · entrega los de SU ámbito y NINGUNO de otro, ni la ficha propia ni las ajenas', async () => {
    mundo.authUid = 'uid_A';
    mundo.db = mundoBase(8, 15);
    const { fb } = await cargar();
    const { recibidas, baja } = await abrirTitulares(fb, 'owner_A');
    const ids = (recibidas.at(-1) as Array<{ id: string }>).map((t) => t.id);
    expect(ids).toHaveLength(8);
    expect(ids.some((id) => id.startsWith('tit_') && Number.parseInt(id.slice(4), 36) >= 100_000)).toBe(false);
    for (const ajena of ['owner_A', 'owner_B', 'owner_C']) expect(ids).not.toContain(ajena);
    baja();
  });

  it('S3 · pedir el ámbito DE OTRO se deniega (las Rules no son un filtro): B no lee los de A aunque lo intente', async () => {
    mundo.authUid = 'uid_B';
    mundo.db = mundoBase(8, 3);
    const { fb, canal } = await cargar();
    const { recibidas, baja } = await abrirTitulares(fb, 'owner_A'); // consulta hostil: ámbito de A
    expect(recibidas).toHaveLength(0); // jamás se entregan fichas de A
    const incidencia = canal.incidenciasDatos().find((i) => i.origen === 'titulares_ambito');
    expect(incidencia).toMatchObject({ tipo: 'LECTURA', alcance: 'CAPACIDAD', codigo: 'permission-denied' });
    baja();
    // y la suya propia sí funciona
    canal.reiniciarCanalIncidencias();
    const propia = await abrirTitulares(fb, 'owner_B');
    expect(propia.recibidas.at(-1)).toHaveLength(3);
    propia.baja();
  });

  it('S4 · sin sesión no hay lectura; sin propietarioId no se abre ninguna consulta', async () => {
    mundo.authUid = null;
    mundo.db = mundoBase(5);
    const { fb } = await cargar();
    const anonimo = await abrirTitulares(fb, 'owner_A');
    expect(anonimo.recibidas).toHaveLength(0);
    anonimo.baja();
    mundo.consultas = [];
    const recibidas: any[][] = [];
    const baja = fb.subscribeTitularesAmbito((t) => recibidas.push(t), undefined);
    expect(recibidas).toEqual([[]]);
    expect(mundo.consultas).toHaveLength(0);
    baja();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// I · AISLAMIENTO: el fallo de esta lectura no es un error del Portal
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · I — su fallo es una CAPACIDAD con aviso propio, no «No tienes permisos» global', () => {
  it('I1 · con las Rules aún sin publicar la consulta se rechaza como CAPACIDAD y la ficha propia se sigue leyendo', async () => {
    permite = crearEvaluadorReglas(REGLAS_SIN_PUBLICAR).permite;
    mundo.authUid = 'uid_A';
    mundo.db = mundoBase(5);
    const { fb, canal } = await cargar();

    // lectura PRIMARIA (ficha propia) — no depende de la capacidad nueva
    const primarias: any[][] = [];
    const bajaPrimaria = fb.subscribePropietarios((p) => primarias.push(p), { tipoPerfil: 'PROPIETARIO', propietarioId: 'owner_A', propietariosGestionados: [] });
    await vi.waitFor(() => expect(primarias.length).toBeGreaterThan(0));
    expect(primarias.at(-1)!.map((p: any) => p.id)).toEqual(['owner_A']);

    // capacidad `titulares_ambito`
    const { recibidas, baja } = await abrirTitulares(fb, 'owner_A');
    expect(recibidas).toHaveLength(0);

    const incidencias = canal.incidenciasDatos();
    const deAmbito = incidencias.filter((i) => i.origen === 'titulares_ambito');
    expect(deAmbito).toHaveLength(1);
    expect(deAmbito[0]).toMatchObject({ tipo: 'LECTURA', alcance: 'CAPACIDAD', codigo: 'permission-denied', etiqueta: 'Titulares' });
    // NO es un error de datos del Portal: ninguna incidencia de `propietarios` ni de alcance DATOS
    expect(incidencias.filter((i) => i.origen === 'propietarios')).toHaveLength(0);
    const { datos, capacidades } = partirIncidenciasPorAlcance(incidencias);
    expect(datos).toHaveLength(0);
    expect(capacidades).toHaveLength(1);
    // el texto no manda a nadie: ni «administrador» ni «administración», y trae la comprobación que falló
    expect(deAmbito[0].mensaje).not.toMatch(/administrador|administraci[oó]n/i);
    expect(deAmbito[0].mensaje).toMatch(/no ha autorizado la consulta/i);
    expect(deAmbito[0].detalle).toMatch(/ambitoPropietarioId/);
    expect(deAmbito[0].detalle).not.toMatch(/administrador|administraci[oó]n/i);
    bajaPrimaria();
    baja();
  });

  it('I2 · reabrir la escucha («Reintentar lectura») sustituye el aviso anterior; con las Rules publicadas no queda ninguno', async () => {
    permite = crearEvaluadorReglas(REGLAS_SIN_PUBLICAR).permite;
    mundo.authUid = 'uid_A';
    mundo.db = mundoBase(4);
    const { fb, canal } = await cargar();
    const primera = await abrirTitulares(fb, 'owner_A');
    expect(canal.incidenciasDatos().filter((i) => i.origen === 'titulares_ambito')).toHaveLength(1);
    primera.baja();

    // «publican» las reglas y se reintenta: el aviso del intento anterior desaparece y llegan los 4
    permite = crearEvaluadorReglas(RULES).permite;
    const segunda = await abrirTitulares(fb, 'owner_A');
    expect(segunda.recibidas.at(-1)).toHaveLength(4);
    expect(canal.incidenciasDatos().filter((i) => i.origen === 'titulares_ambito')).toHaveLength(0);
    segunda.baja();
  });

  it('I3 · un error de red también es CAPACIDAD y conserva su texto genérico de conexión', () => {
    reiniciarCanalIncidencias();
    reportarErrorLectura('titulares_ambito', { code: 'unavailable' }, 'x');
    const incidencia = incidenciasDatos().find((i) => i.origen === 'titulares_ambito')!;
    expect(incidencia.alcance).toBe('CAPACIDAD');
    expect(incidencia.mensaje).toMatch(/No hay conexión con el servidor de datos/);
  });

  it('I4 · el origen es una capacidad adicional DECLARADA (no depende de que el llamador pase el alcance)', () => {
    expect([...ORIGENES_CAPACIDAD_ADICIONAL]).toContain('titulares_ambito');
    expect(esCapacidadAdicional('titulares_ambito')).toBe(true);
    reiniciarCanalIncidencias();
    reportarErrorLectura('titulares_ambito', { code: 'permission-denied' });
    expect(incidenciasDatos().find((i) => i.origen === 'titulares_ambito')?.alcance).toBe('CAPACIDAD');
  });

  it('I5 · el aviso es ESPECÍFICO: título propio, «Reintentar lectura» que reabre ESA capacidad, y ningún texto de administrador', () => {
    reiniciarCanalIncidencias();
    reportarErrorLectura('titulares_ambito', { code: 'permission-denied' }, 'x', {
      alcance: 'CAPACIDAD',
      mensajesPorCodigo: { 'permission-denied': 'El servidor no ha autorizado la consulta de las fichas de titular de tu ámbito.' },
      detalle: 'Qué se ha comprobado: ámbito.',
    });
    const onReintentarCapacidad = vi.fn();
    const onReintentar = vi.fn();
    render(
      <AvisoIncidenciasDatos
        incidencias={incidenciasDatos()}
        onReintentar={onReintentar}
        onReintentarCapacidad={onReintentarCapacidad}
        onDescartar={() => undefined}
        onDescartarTodas={() => undefined}
      />,
    );
    const aviso = screen.getByTestId('aviso-capacidad-adicional');
    expect(aviso.getAttribute('data-origen')).toBe('titulares_ambito');
    expect(aviso.textContent).toContain('Titulares: no se han podido leer las fichas de titular de tu ámbito');
    expect(aviso.textContent).toContain('tus inmuebles, tu ficha de titular y demás datos');
    expect(aviso.textContent).not.toMatch(/administrador|administraci[oó]n/i);
    // NO aparece el aviso global de «No se han podido leer algunos datos»
    expect(screen.queryByTestId('aviso-incidencias-datos')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar lectura/ }));
    expect(onReintentarCapacidad).toHaveBeenCalledWith('titulares_ambito');
    expect(onReintentar).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// H · el hook del host
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · H — `useTitularesAmbito`', () => {
  type U = { tipoPerfil?: string; propietarioId?: string };
  function doble() {
    const bajas: Array<ReturnType<typeof vi.fn>> = [];
    const entregas: Array<(t: any[]) => void> = [];
    const suscribir = vi.fn<SuscribirTitularesAmbito>((cb, _pid) => {
      entregas.push(cb);
      const baja = vi.fn();
      bajas.push(baja);
      return baja;
    });
    return { suscribir, bajas, entregas };
  }
  function montar(usuario: U | null, intento = 0) {
    const d = doble();
    const vista = renderHook(({ u, i }: { u: U | null; i: number }) => useTitularesAmbito(u as never, i, d.suscribir), {
      initialProps: { u: usuario, i: intento },
    });
    return { ...d, ...vista };
  }

  it('solo el PROPIETARIO con propietarioId consulta, y con ESE id', () => {
    expect([...PERFILES_CON_AMBITO_DE_TITULARES]).toEqual(['PROPIETARIO']);
    const { suscribir } = montar({ tipoPerfil: 'PROPIETARIO', propietarioId: 'owner_A' });
    expect(suscribir).toHaveBeenCalledTimes(1);
    expect(suscribir).toHaveBeenCalledWith(expect.any(Function), 'owner_A');
  });

  it.each([
    ['ADMINISTRADOR', 'owner_A'], ['PROFESIONAL', 'owner_A'], ['INQUILINO', 'owner_A'], ['PROPIETARIO', undefined], [undefined, 'owner_A'],
  ])('perfil %s con propietarioId %s: NO abre ninguna consulta', (tipoPerfil, propietarioId) => {
    const { suscribir, result } = montar({ tipoPerfil, propietarioId });
    expect(suscribir).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it('lo que entrega la escucha pasa al estado (cualquier cantidad), y el reintento REABRE la escucha cerrando la anterior', () => {
    const { entregas, bajas, suscribir, result, rerender } = montar({ tipoPerfil: 'PROPIETARIO', propietarioId: 'owner_A' });
    const muchos = Array.from({ length: 500 }, (_, i) => ({ id: idAmbito(i + 1) }));
    act(() => entregas[0](muchos));
    expect(result.current).toHaveLength(500);

    rerender({ u: { tipoPerfil: 'PROPIETARIO', propietarioId: 'owner_A' }, i: 1 });
    expect(bajas[0]).toHaveBeenCalledTimes(1); // cierra la escucha denegada/anterior
    expect(suscribir).toHaveBeenCalledTimes(2); // y abre otra
    // lo último entregado se conserva mientras llega el resultado del reintento (no se vacía)
    expect(result.current).toHaveLength(500);
  });

  it('cambiar de persona o a un perfil que no consulta cierra la escucha y vacía; desmontar no deja escuchas huérfanas', () => {
    const { bajas, result, rerender, unmount, entregas } = montar({ tipoPerfil: 'PROPIETARIO', propietarioId: 'owner_A' });
    act(() => entregas[0]([{ id: idAmbito(1) }]));
    rerender({ u: { tipoPerfil: 'PROPIETARIO', propietarioId: 'owner_B' }, i: 0 });
    expect(bajas[0]).toHaveBeenCalledTimes(1);
    rerender({ u: { tipoPerfil: 'ADMINISTRADOR', propietarioId: 'owner_B' }, i: 0 });
    expect(bajas[1]).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual([]);
    unmount();
    expect(bajas.every((b) => b.mock.calls.length === 1)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// N · el motor de N-TITULARES admite cualquier número de titulares (con ids de ámbito)
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · N — N-TITULARES sin límite binario (1, 2, 3, 10, 60…)', () => {
  it('N1 · la clave de titularidad `{inmuebleId}__{propietarioId}` es válida y reversible con un id de ámbito `tit_…`', () => {
    for (const n of [1, 2, 3, 10, 60]) {
      const pid = idAmbito(n);
      const clave = idTitularidad('inm_A', pid);
      expect(clave).toBe(`inm_A__${pid}`);
      expect(esIdTitularidadValido(clave)).toBe(true);
      expect(partirIdTitularidad(clave)).toEqual({ inmuebleId: 'inm_A', propietarioId: pid });
    }
  });

  it('N2 · el reparto se diagnostica igual con 2, 3, 5, 10 y 60 titulares: OK con porcentajes que suman 100', () => {
    for (const total of [1, 2, 3, 5, 10, 60]) {
      const pct = total === 1 ? [100] : [...Array.from({ length: total - 1 }, () => 1.5), 100 - 1.5 * (total - 1)];
      const titularidades = pct.map((p, i) => construirTitularidad({ inmuebleId: 'inm_A', propietarioId: idAmbito(i + 1), porcentaje: p }));
      const d = validarPorcentajes(titularidades, 'inm_A');
      expect(d.vigentes).toHaveLength(total);
      expect(d.codigo, `${total} titulares`).toBe('OK');
      expect(d.bloquea).toBe(false);
    }
  });

  it('N3 · PENDIENTE sigue siendo PENDIENTE (nunca se inventa 50/50): uno se deriva del resto; varios bloquean con su mensaje, sea cual sea el número', () => {
    const mk = (n: number, p: number | null) => construirTitularidad({ inmuebleId: 'inm_A', propietarioId: idAmbito(n), porcentaje: p });
    // uno pendiente entre 5 titulares: se deriva (100 − suma)
    const uno = validarPorcentajes([mk(1, 40), mk(2, 20), mk(3, 10), mk(4, 10), mk(5, null)], 'inm_A');
    expect(uno.codigo).toBe('OK');
    expect(uno.porcentajes.find((p) => p.propietarioId === idAmbito(5))?.porcentaje).toBe(20);
    // varios pendientes entre 8: no es representable y bloquea (se pide indicar porcentajes), sin rechazar a ningún titular
    const varios = validarPorcentajes([1, 2, 3, 4, 5, 6, 7, 8].map((n) => mk(n, n <= 2 ? 25 : null)), 'inm_A');
    expect(varios.codigo).toBe('NO_REPRESENTABLE');
    expect(varios.bloquea).toBe(true);
    expect(varios.vigentes).toHaveLength(8);
    // dos titulares sin porcentaje: no se asume el 50/50
    expect(validarPorcentajes([mk(1, null), mk(2, null)], 'inm_A').codigo).toBe('PENDIENTE_SIN_REPARTO');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R · host equivalente a App.tsx: el fallo de la lectura no bloquea la sección y se puede reintentar
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · R — la sección sigue operativa si la lectura por ámbito falla, y «Reintentar lectura» la recupera', () => {
  const PROPIETARIO = {
    id: 'usr_A', nombre: 'Ana', email: 'a@test.local', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', roles: [], permisos: [],
    propietarioId: 'owner_A', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  } as never;
  const PROPIA = {
    id: 'owner_A', nombre: 'Ana Propia', nifCif: '11111111H', tipoPropietario: 'persona_fisica', telefono: '', email: 'a@test.local',
    direccion: '', ciudad: '', codigoPostal: '', cuentasBancarias: [], fechaCreacion: '', fechaActualizacion: '',
  } as never;

  function HostTitulares({ suscribir }: { suscribir: SuscribirTitularesAmbito }) {
    const {
      intento, marcarListo, iniciarLecturas, reintentar, reintentarCapacidad, intentoDeCapacidad,
      estadoDePantalla, incidencias, descartarIncidencia, descartarIncidencias,
    } = useEstadoLecturas(['inmuebles', 'propietarios']);
    useEffect(() => {
      iniciarLecturas();
      marcarListo('inmuebles');
      marcarListo('propietarios');
    }, [intento, iniciarLecturas, marcarListo]);
    const titularesAmbito = useTitularesAmbito(PROPIETARIO, intentoDeCapacidad('titulares_ambito'), suscribir);
    const visibles = fichasVisiblesDelPropietario([PROPIA, ...titularesAmbito], PROPIETARIO);
    const permisos = permisosTitulares(PROPIETARIO, visibles, 'master@test.local');
    return (
      <div>
        <AvisoIncidenciasDatos
          incidencias={incidencias}
          onReintentar={reintentar}
          onReintentarCapacidad={reintentarCapacidad}
          onDescartar={descartarIncidencia}
          onDescartarTodas={descartarIncidencias}
        />
        <PuertaEstadoDatos estado={estadoDePantalla('titulares')} onReintentar={reintentar}>
          <PropietariosSection
            propietarios={visibles}
            inmuebles={[]}
            puedeGestionar={permisos.puedeGestionar}
            puedeCrear={permisos.puedeCrear}
            puedeCrearFichaPropia={permisos.puedeCrearFichaPropia}
            ambitoPropietarioId={permisos.ambitoPropietarioId}
            fichasEditablesIds={permisos.fichasEditablesIds}
            idFichaPropia={permisos.idFichaPropia}
            onSavePropietario={() => undefined}
            onDeletePropietario={() => undefined}
          />
        </PuertaEstadoDatos>
      </div>
    );
  }

  it('R1 · lectura denegada: aviso ESPECÍFICO de capacidad, la sección y «Crear titular» siguen disponibles; reintentar entrega los titulares y limpia el aviso', () => {
    reiniciarCanalIncidencias();
    let llamadas = 0;
    const suscribir: SuscribirTitularesAmbito = (cb) => {
      llamadas++;
      if (llamadas === 1) {
        reportarErrorLectura('titulares_ambito', { code: 'permission-denied' }, 'x', {
          alcance: 'CAPACIDAD',
          mensajesPorCodigo: { 'permission-denied': 'El servidor no ha autorizado la consulta de las fichas de titular de tu ámbito.' },
          detalle: 'Qué se ha comprobado: ámbito.',
        });
        return () => undefined;
      }
      cb([titular(1, 'owner_A') as never, titular(2, 'owner_A') as never, titular(3, 'owner_A') as never]);
      return () => undefined;
    };
    render(<HostTitulares suscribir={suscribir} />);

    // fallo aislado: aviso de capacidad propio, SIN el aviso global y SIN bloquear la pantalla
    expect(screen.getByTestId('aviso-capacidad-adicional').getAttribute('data-origen')).toBe('titulares_ambito');
    expect(screen.queryByTestId('aviso-incidencias-datos')).toBeNull();
    expect(screen.getByTestId('aviso-capacidad-adicional').textContent).not.toMatch(/administrador|administraci[oó]n/i);
    expect(screen.getByTestId('boton-crear-titular')).toBeTruthy(); // se puede seguir creando titulares
    expect(screen.getByText('Ana Propia')).toBeTruthy(); // su ficha propia sigue visible
    expect(screen.queryByText('Titular 1')).toBeNull();

    // «Reintentar lectura» de ESA capacidad: reabre solo esa escucha
    fireEvent.click(screen.getByRole('button', { name: /Reintentar lectura/ }));
    expect(llamadas).toBe(2);
    expect(screen.queryByTestId('aviso-capacidad-adicional')).toBeNull();
    for (const n of [1, 2, 3]) expect(screen.getByText(`Titular ${n}`)).toBeTruthy();
    expect(screen.getByText('Ana Propia')).toBeTruthy();
    expect(screen.getByTestId('boton-crear-titular')).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// W · cableado de App.tsx
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · W — cableado en App.tsx', () => {
  it('W1 · App abre la escucha con reintento propio y la mezcla con la lista local SOLO para Titulares, Inmuebles y Portal', () => {
    expect(APP).toContain("const intentoTitularesAmbito = intentoDeCapacidad('titulares_ambito');");
    expect(APP).toContain('useTitularesAmbito(currentUser, intentoTitularesAmbito, subscribeTitularesAmbito)');
    const memo = APP.slice(APP.indexOf('const titularesVisibles = useMemo'), APP.indexOf('const scopedContratos'));
    expect(memo).toContain("if (currentUser.tipoPerfil === 'ADMINISTRADOR') return propietarios;");
    expect(memo).toContain('fichasVisiblesDelPropietario([...porId.values()], currentUser)');
    expect(memo).toContain('[currentUser, propietarios, titularesAmbito]');
    // consumidores de la lista ampliada
    expect(APP).toContain('propietarios={titularesVisibles}');
    expect(APP.split('titularesDisponibles={titularesVisibles}').length - 1).toBe(3);
    // `scopedPropietarios` sigue siendo «solo la ficha propia» para el resto (Tesorería, Facturación…)
    expect(APP).toMatch(/const scopedPropietarios = useMemo\(\(\) => \{[\s\S]*?p\.id === currentUser\.propietarioId \|\|\s*p\.email\.toLowerCase\(\) === currentUser\.email\.toLowerCase\(\)/);
    expect(APP.split('propietarios={scopedPropietarios}').length - 1).toBeGreaterThan(5);
  });

  it('W2 · el «Reintentar lectura» de la capacidad ya está conectado de forma genérica a `reintentarCapacidad(origen)`', () => {
    expect(APP).toContain('onReintentarCapacidad={reintentarCapacidad}');
  });

  it('W3 · la lectura primaria de la ficha propia NO se ha tocado: `subscribePropietarios` sigue sin consultas por ámbito', () => {
    const cuerpo = FIREBASE_TS.slice(FIREBASE_TS.indexOf('export function subscribePropietarios('), FIREBASE_TS.indexOf('/** Textos de la capacidad `titulares_ambito`'));
    expect(cuerpo).not.toContain('ambitoPropietarioId');
    expect(cuerpo).toContain("onSnapshot(doc(db, 'propietarios', id)");
  });

  it('W4 · la escucha por ámbito es UNA consulta de igualdad por el propietarioId, sin `in`, sin `or`, sin límite ni paginación', () => {
    const cuerpo = FIREBASE_TS.slice(FIREBASE_TS.indexOf('export function subscribeTitularesAmbito('), FIREBASE_TS.indexOf('export async function savePropietarioFirestore'));
    expect(cuerpo).toContain("query(PROPIETARIOS_COL, where('ambitoPropietarioId', '==', propietarioId))");
    expect(cuerpo).not.toMatch(/\blimit\(|\bin\b'|\bor\(|startAfter|limitToLast|getCountFromServer/);
  });

  it('W6 · inspección estática: NINGÚN límite de titulares en la UI, el modelo, la lectura, el guardado ni la API de alta', () => {
    const quitarComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const fuentes = [
      'src/components/sections/PropietariosSection.tsx',
      'src/utils/permisosTitulares.ts',
      'src/lib/titularesModelo.ts',
      'src/estadoDatos/useTitularesAmbito.ts',
      'src/components/titularidades/TitularidadesPanel.tsx',
      'src/components/titularidades/PanelTitularidadesInmueble.tsx',
      'src/lib/altaInmuebleTitulares.ts',
      'firestore.rules',
    ];
    for (const ruta of fuentes) {
      const codigo = quitarComentarios(readFileSync(resolve(RAIZ, ruta), 'utf8'));
      // nombres típicos de un tope/cuota/contador de titulares
      expect(codigo, ruta).not.toMatch(/titularesCreados|maxTitulares|MAX_TITULARES|MAXIMO_TITULARES|limiteTitulares|LIMITE_TITULARES|cuotaTitulares|cupoTitulares/);
      // comparaciones de la CANTIDAD de titulares/fichas con una cifra (solo se admite la de «vacío»: 0)
      expect(codigo, ruta).not.toMatch(
        /\b(propietarios|titulares|titularidades|vigentes|fichas|titularesAmbito|titularesVisibles|fichasEditablesIds|titularesIds|candidatosLocales|locales)\.length\s*(<=?|>=?|===?|!==?)\s*[1-9]\d*/,
      );
      // recortes de la lista de titulares a N elementos
      expect(codigo, ruta).not.toMatch(/\b(propietarios|titulares|fichas|titularesAmbito|titularesVisibles|candidatosLocales|locales|visibles)\.slice\(\s*0\s*,\s*\d+/);
    }
    // El módulo del alta de inmuebles tampoco cuenta titulares para rechazarlos
    const alta = quitarComentarios(readFileSync(resolve(RAIZ, 'src/lib/altaInmuebleTitulares.ts'), 'utf8'));
    expect(alta).not.toMatch(/\.length\s*(>|>=)\s*[1-9]/);
  });

  it('W6b · en el motor de titularidades, el único `vigentes.length <= 2` elige el TEXTO del diagnóstico de porcentajes pendientes; no rechaza a nadie', () => {
    const motor = readFileSync(resolve(RAIZ, 'src/utils/titularidadesEngine.ts'), 'utf8');
    const comparaciones = motor.match(/\b(vigentes|titularidades|titularesIds)\.length\s*(<=?|>=?|===?|!==?)\s*[1-9]\d*/g) ?? [];
    expect(comparaciones).toEqual(['vigentes.length <= 2']);
    expect(motor).toContain("const codigo: CodigoReparto = vigentes.length <= 2 ? 'PENDIENTE_SIN_REPARTO' : 'NO_REPRESENTABLE';");
  });

  it('W7 · el único tope del código de titulares es el de RESULTADOS de la búsqueda de servidor (F3), que no limita crear ni asignar', () => {
    const busqueda = readFileSync(resolve(RAIZ, 'src/titularidades/busquedaTitulares.ts'), 'utf8');
    expect(busqueda).toContain('export const MAXIMO_RESULTADOS = 10;');
    // quien asigna titulares propios no depende de ese endpoint: el panel ofrece la lista COMPLETA de su ámbito
    const panel = readFileSync(resolve(RAIZ, 'src/components/titularidades/TitularidadesPanel.tsx'), 'utf8');
    expect(panel).toContain('candidatosLocales');
    expect(panel).toContain("data-testid=\"titulares-locales\"");
    expect(panel).not.toMatch(/locales\.slice\(/);
  });

  it('W5 · el guardado de la ficha NO pasa por el aviso genérico «avisa a un administrador»', () => {
    const cuerpo = FIREBASE_TS.slice(FIREBASE_TS.indexOf('export async function savePropietarioFirestore'), FIREBASE_TS.indexOf('export async function deletePropietarioFirestore'));
    expect(cuerpo).not.toContain('reportarErrorGuardado');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// F · la búsqueda de servidor no revela titulares de otro ámbito
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · F — `/api/titulares/buscar` respeta el ámbito', () => {
  const CUENTA: CuentaServicio = {
    project_id: 'proyecto-demo', client_email: 'sa@proyecto-demo.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----x-----END PRIVATE KEY-----',
  };
  const doc = (id: string, nombre: string, ambito?: string): DocumentoServidor => ({
    id, datos: { nombre, nifCif: `NIF-${id}`, ...(ambito ? { ambitoPropietarioId: ambito } : {}) },
  });
  const CRUDO = [
    doc('tit_deamarta0001', 'Marta de A', 'owner_A'),
    doc('tit_debmarcos001', 'Marcos de B', 'owner_B'),
    doc('tit_decmarina001', 'Marina de C', 'owner_C'),
    doc('owner_heredada', 'María heredada'), // ficha sin ámbito (cuenta, heredada)
  ];
  function deps(perfil: { tipoPerfil: string; propietarioId?: string; email?: string }): DependenciasBackendTitulares {
    return {
      leerCredencial: () => CUENTA,
      verificarToken: async () => ({ uid: 'uid-1', email: perfil.email ?? 'ana@correo.com' }),
      leerDocumento: async (ruta: string) => {
        if (ruta.startsWith('usuarios_auth/')) return { estado: 'ACTIVO', usuarioId: 'u1', tipoPerfil: perfil.tipoPerfil, propietarioId: perfil.propietarioId, authUid: 'uid-1' };
        if (ruta.startsWith('usuarios/')) return { estado: 'ACTIVO', authUid: 'uid-1', tipoPerfil: perfil.tipoPerfil };
        if (ruta.startsWith('inmuebles/')) return { propietarioId: perfil.propietarioId ?? 'owner_A', titularesIds: [perfil.propietarioId ?? 'owner_A'] };
        return null;
      },
      consultarPrefijo: async () => CRUDO,
      auditar: () => undefined,
    };
  }
  const buscar = async (perfil: Parameters<typeof deps>[0]) =>
    (await buscarTitulares({ idToken: 'token', inmuebleId: 'inm-1', termino: 'mar' }, deps(perfil))).resultados?.map((r) => r.id) ?? [];

  it('F1 · un PROPIETARIO ve sus titulares y las fichas sin ámbito, y NO los nombres de los de otro ámbito', async () => {
    const ids = await buscar({ tipoPerfil: 'PROPIETARIO', propietarioId: 'owner_A' });
    expect(ids).toContain('tit_deamarta0001');
    expect(ids).toContain('owner_heredada');
    expect(ids).not.toContain('tit_debmarcos001');
    expect(ids).not.toContain('tit_decmarina001');
  });

  it('F2 · el aislamiento es simétrico (B ve los suyos, no los de A)', async () => {
    const ids = await buscar({ tipoPerfil: 'PROPIETARIO', propietarioId: 'owner_B' });
    expect(ids).toContain('tit_debmarcos001');
    expect(ids).not.toContain('tit_deamarta0001');
  });

  it('F3 · master y ADMINISTRADOR siguen viendo todas (capacidad conservada)', async () => {
    const todas = ['tit_deamarta0001', 'tit_debmarcos001', 'tit_decmarina001', 'owner_heredada'];
    expect((await buscar({ tipoPerfil: 'ADMINISTRADOR', email: 'adm@agencia.test' })).sort()).toEqual([...todas].sort());
    expect((await buscar({ tipoPerfil: 'ADMINISTRADOR', email: 'sarqsan2@gmail.com' })).sort()).toEqual([...todas].sort());
  });

  it('F4 · el filtro puro: solo una ficha con ámbito DISTINTO del llamador es «ajena»', () => {
    expect(fichaDeAmbitoAjeno({ ambitoPropietarioId: 'owner_B' }, 'owner_A')).toBe(true);
    expect(fichaDeAmbitoAjeno({ ambitoPropietarioId: 'owner_A' }, 'owner_A')).toBe(false);
    expect(fichaDeAmbitoAjeno({ nombre: 'sin ámbito' }, 'owner_A')).toBe(false);
    expect(fichaDeAmbitoAjeno({ ambitoPropietarioId: '' }, 'owner_A')).toBe(false);
    expect(fichaDeAmbitoAjeno({ ambitoPropietarioId: 'owner_A' }, undefined)).toBe(true);
    expect(fichaDeAmbitoAjeno(null, 'owner_A')).toBe(false);
  });

  it('F5 · la respuesta sigue siendo SOLO `{ id, nombre }` (sin NIF, ni ámbito)', async () => {
    const r = await buscarTitulares({ idToken: 'token', inmuebleId: 'inm-1', termino: 'mar' }, deps({ tipoPerfil: 'PROPIETARIO', propietarioId: 'owner_A' }));
    for (const item of r.resultados ?? []) expect(Object.keys(item).sort()).toEqual(['id', 'nombre']);
    expect(JSON.stringify(r.resultados)).not.toMatch(/NIF-|ambitoPropietarioId/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C · CARTERAS no cambia
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · C — el modelo funcional de Carteras se conserva tal cual', () => {
  it('C1 · Carteras sigue siendo capacidad adicional con su título, su texto y su reintento; solo se suma la de titulares', () => {
    expect(ORIGENES_CAPACIDAD_ADICIONAL[0]).toBe('gestiones_cartera');
    reiniciarCanalIncidencias();
    reportarErrorLectura('gestiones_cartera', { code: 'permission-denied' }, 'x');
    const incidencia = incidenciasDatos().find((i) => i.origen === 'gestiones_cartera')!;
    expect(incidencia).toMatchObject({ alcance: 'CAPACIDAD', etiqueta: 'Carteras' });
    // el texto genérico de siempre (NO el de titulares): la anulación por código es solo de quien la pide
    expect(incidencia.mensaje).toBe('No tienes permisos para consultar estos datos. Si crees que es un error, avisa a un administrador.');
    render(
      <AvisoIncidenciasDatos incidencias={incidenciasDatos()} onReintentarCapacidad={() => undefined} onDescartar={() => undefined} onDescartarTodas={() => undefined} />,
    );
    const aviso = screen.getByTestId('aviso-capacidad-adicional');
    expect(aviso.textContent).toContain('Carteras: no se han podido leer tus carteras ni delegaciones');
    expect(aviso.textContent).toContain(
      'Es una capacidad adicional: el resto del Portal sigue funcionando con tus inmuebles, titulares y demás datos. ' +
      'Puedes reintentar su lectura cuando quieras; el detalle técnico queda registrado para el diagnóstico.',
    );
  });

  it('C2 · las Rules de Carteras (`gestiones_cartera`) y la lectura de la ficha por cartera no se han tocado', () => {
    const gestiones = RULES.slice(RULES.indexOf('    match /gestiones_cartera/{gestionId} {'), RULES.indexOf('    // INC-06 — REGISTROS PATRIMONIALES IMPORTADOS'));
    expect(gestiones).toContain('allow list: if esAdminInmuebles() || gestionInvolucraAMi(resource.data);');
    expect(gestiones).toContain("allow create: if isMasterAdmin() && auditoriaVinculada(incoming(), 'gestiones_cartera/' + gestionId);");
    expect(gestiones).not.toContain('ambitoPropietarioId');
    const propietarios = bloqueDe(RULES);
    expect(propietarios).toContain('|| carteraGestionadaPorMi(propietarioId)');
    expect(propietarios).toContain("&& incoming().diff(existing()).affectedKeys().hasOnly(['fichaPatrimonial'])");
  });

  it('C3 · `subscribeGestionesCarteraGestor` no usa nada del ámbito de titulares', () => {
    const cuerpo = FIREBASE_TS.slice(FIREBASE_TS.indexOf('export function subscribeGestionesCarteraGestor('), FIREBASE_TS.indexOf('export function subscribeGestionesCarteraGestor(') + 9000);
    expect(cuerpo).not.toContain('ambitoPropietarioId');
    expect(cuerpo).not.toContain('titulares_ambito');
  });
});
