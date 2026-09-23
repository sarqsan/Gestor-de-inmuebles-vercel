/**
 * GAP 5 · PERSISTENCIA DEL ESTADO DE SINDICACIÓN (inmueble + portal).
 * ------------------------------------------------------------------
 *  · La capa de dominio (`src/sindicacion/estadoRepositorio.ts`) se prueba contra un
 *    PUERTO EN MEMORIA: cero Firebase, cero red, cero Storage.
 *  · El adaptador real (`src/lib/sindicacionFirestore.ts`) se prueba con `vi.mock` de
 *    `firebase/firestore` y de `src/lib/firebase`: se comprueba QUÉ se escribe, dónde y
 *    cuándo NO se escribe, sin tocar ninguna instancia real.
 *  · Un spy global de `fetch` garantiza que ningún test sale a la red.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  llamadas: [] as unknown[][],
  /** oyentes de `onSnapshot`; sólo se rellaman si el test activa `emitirAlEscribir` */
  oyentes: [] as { col: string; next: (snap: unknown) => void; cerrado: boolean }[],
  emitirAlEscribir: false,
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, nombre: string) => ({ __col: nombre }),
  doc: (_db: unknown, nombre: string, id?: string) => {
    const ruta = id ? `${nombre}/${id}` : nombre;
    fs.llamadas.push(['doc', ruta]);
    return { __ruta: ruta };
  },
  setDoc: async (ref: { __ruta: string }, datos: Record<string, unknown>, opciones?: unknown) => {
    const copia = JSON.parse(JSON.stringify(datos)) as Record<string, unknown>;
    fs.llamadas.push(['setDoc', ref.__ruta, copia, opciones]);
    fs.docs.set(ref.__ruta, copia);
    if (fs.emitirAlEscribir) {
      for (const o of fs.oyentes) {
        // hostil a propósito: un servidor real ya no llamaría tras el unsubscribe; aquí se
        // sigue llamando para que la única barrera sea la guarda `cerrado` del adaptador
        const items = [...fs.docs.entries()]
          .filter(([ruta]) => ruta.startsWith(`${o.col}/`))
          .map(([ruta, d]) => ({ id: ruta.split('/')[1], data: () => d }));
        o.next({ forEach: (cb: (d: unknown) => void) => items.forEach(cb) });
      }
    }
  },
  getDoc: async (ref: { __ruta: string }) => {
    const d = fs.docs.get(ref.__ruta);
    fs.llamadas.push(['getDoc', ref.__ruta]);
    return {
      exists: () => Boolean(d),
      id: (ref.__ruta || '').split('/')[1],
      data: () => (d ? (JSON.parse(JSON.stringify(d)) as Record<string, unknown>) : undefined),
    };
  },
  getDocs: async (q: { __col: string }) => {
    const items = [...fs.docs.entries()]
      .filter(([ruta]) => ruta.startsWith(`${q.__col}/`))
      .map(([ruta, datos]) => ({ id: ruta.split('/')[1], data: () => JSON.parse(JSON.stringify(datos)) }));
    fs.llamadas.push(['getDocs', q.__col]);
    return { empty: items.length === 0, docs: items, size: items.length, forEach: (cb: (d: unknown) => void) => items.forEach(cb) };
  },
  query: (col: { __col: string }, ...filtros: unknown[]) => ({ __col: col.__col, filtros }),
  where: (campo: string, op: string, valor: unknown) => ({ campo, op, valor }),
  onSnapshot: (q: { __col: string }, next: (snap: unknown) => void) => {
    const oyente = { col: q.__col, next, cerrado: false };
    fs.oyentes.push(oyente);
    const items = [...fs.docs.entries()]
      .filter(([ruta]) => ruta.startsWith(`${q.__col}/`))
      .map(([ruta, datos]) => ({ id: ruta.split('/')[1], data: () => datos }));
    next({ forEach: (cb: (d: unknown) => void) => items.forEach(cb) });
    // el unsubscribe queda registrado pero NO apaga al emisor: lo que se prueba es la guarda
    // `cerrado` del ADAPTADOR (si falta, el callback de un oyente cerrado se vuelve a disparar)
    return () => {
      fs.llamadas.push(['unsubscribe', q.__col]);
      oyente.cerrado = true;
    };
  },
  deleteDoc: async (ref: { __ruta: string }) => {
    fs.llamadas.push(['deleteDoc', ref.__ruta]);
    fs.docs.delete(ref.__ruta);
  },
}));

vi.mock('../src/lib/firebase', () => ({
  db: { __fakeDb: true },
  sanitizeObjectForFirestore: (o: Record<string, unknown>) => JSON.parse(JSON.stringify(o)) as Record<string, unknown>,
  registrarAuditoriaFirestore: async (log: Record<string, unknown>) => {
    fs.llamadas.push(['audit', log]);
  },
}));

import type { HabitacionInmueble, Inmueble, PortalInmobiliario, PublicacionInmueble } from '../src/types';
import { ESTADOS_PUBLICACION, buildPublicacionInmueble, identidadPublicacionPortal } from '../src/utils/publicacionEngine';
import { PORTALES_DISPONIBLES } from '../src/utils/publicacionPortales';
import { resolverAccionSindicacion, calcularVersionPublicable, crearAdaptadorNoConectado, type DecisionSindicacion } from '../src/sindicacion';
import {
  CLAVES_DE_ESTADO,
  COLECCION_ESTADO_SINDICACION,
  ESQUEMA_ESTADO_SINDICACION,
  OBJETIVO_POR_ACCION,
  actualizarEstadoSindicacion,
  avanzarEstadoHasta,
  caminoDeEstados,
  construirRegistroEstado,
  crearEstadoInicialSindicacion,
  estadosIguales,
  huellaDeEstado,
  idDelEvento,
  leerEstadoSindicacionPorPortal,
  leerEstadosSindicacion,
  proyeccionDeEstado,
  registrarActualizacionSindicacion,
  registrarErrorSindicacion,
  registrarPublicacionSindicacion,
  registrarRecuperacionSindicacion,
  registrarResultadoSindicacion,
  registrarRetiradaSindicacion,
  resumenDelEstado,
  verificarInvariantesDelRegistro,
  type ContextoPersistencia,
  type EventoSindicacion,
  type PuertoEstadoSindicacion,
  type RegistroEstadoSindicacion,
} from '../src/sindicacion/estadoRepositorio';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const FECHA = '2026-09-23T10:00:00.000Z';
const FECHA_2 = '2026-09-23T11:00:00.000Z';

const inm = (p: Partial<Inmueble> = {}): Inmueble =>
  ({
    id: 'inm-A',
    direccion: 'Calle Sol 1 & 2',
    ciudad: 'Alicante',
    provincia: 'Alicante',
    codigoPostal: '03001',
    precio: 950,
    estado: 'disponible',
    habitaciones: 3,
    banos: 2,
    superficie: 90,
    descripcion: 'Piso luminoso con terraza cerca del mar y del centro de Alicante.',
    candidatosCount: 0,
    fianzaMeses: 1,
    propietarioId: 'prop-A',
    tipoInmueble: 'piso',
    ascensor: true,
    terraza: true,
    referenciaCatastral: '1234567AB1234C',
    images: [
      { id: 'i1', storagePath: 'a', downloadURL: 'https://storage.example.com/a.jpg', order: 0, isCover: true, isPublic: true, createdAt: '' },
      { id: 'i2', storagePath: 'b', downloadURL: 'https://storage.example.com/b.jpg', order: 1, isCover: false, isPublic: true, createdAt: '' },
    ],
    ...p,
  }) as Inmueble;

const publicacion = (p: Partial<Inmueble> = {}, habitaciones?: HabitacionInmueble[]): PublicacionInmueble =>
  buildPublicacionInmueble(inm(p), habitaciones);

const decision = (
  publicacionDatos: PublicacionInmueble,
  portal: PortalInmobiliario = 'IDEALISTA',
  extra: { version?: ReturnType<typeof calcularVersionPublicable>; retirada?: boolean; publicada?: { version?: ReturnType<typeof calcularVersionPublicable>; publicacion?: PublicacionInmueble } } = {},
): DecisionSindicacion =>
  resolverAccionSindicacion({
    publicacion: publicacionDatos,
    portal,
    ...(extra.publicada ? { publicada: extra.publicada } : {}),
    ...(extra.retirada ? { intencion: { retirar: true } } : {}),
  });

/** Quita el id para poder recalcularlo (el id del evento es derivado, nunca aporte del llamador). */
function sinId(e: EventoSindicacion): Omit<EventoSindicacion, 'id'> {
  const { id: _id, ...resto } = e;
  return resto;
}

/** Puerto en memoria: el único I/O del dominio durante los tests. */
interface Fabrica {
  puerto: PuertoEstadoSindicacion;
  docs: Map<string, RegistroEstadoSindicacion>;
  eventos: EventoSindicacion[];
  trazabilidades: unknown[];
  llamadas: { leer: number; listar: number; escribir: number; evento: number };
  ctx: ContextoPersistencia;
}

function crearPuertoMemoria(opts: { devuelveDeMas?: boolean; fallaEscritura?: boolean } = {}): Fabrica {
  const docs = new Map<string, RegistroEstadoSindicacion>();
  const eventos: EventoSindicacion[] = [];
  const trazabilidades: unknown[] = [];
  const llamadas = { leer: 0, listar: 0, escribir: 0, evento: 0 };
  const clave = (inmuebleId: string, portal: PortalInmobiliario) => identidadPublicacionPortal(inmuebleId, portal).externalId;
  const puerto: PuertoEstadoSindicacion = {
    async leerEstado(inmuebleId, portal) {
      llamadas.leer++;
      const d = docs.get(clave(inmuebleId, portal));
      return d ? (JSON.parse(JSON.stringify(d)) as RegistroEstadoSindicacion) : null;
    },
    async listarEstados(inmuebleId) {
      llamadas.listar++;
      const todos = [...docs.values()];
      // con `devuelveDeMas` simulamos un puerto perezoso que no filtró: el dominio debe aislar
      const lista = opts.devuelveDeMas ? todos : todos.filter((r) => r.inmuebleId === inmuebleId);
      return JSON.parse(JSON.stringify(lista)) as RegistroEstadoSindicacion[];
    },
    async escribirEstado(registro) {
      llamadas.escribir++;
      if (opts.fallaEscritura) throw new Error('permission-denied: firestore');
      const previo = docs.get(registro.id);
      docs.set(registro.id, JSON.parse(JSON.stringify(registro)) as RegistroEstadoSindicacion);
      return previo ? 'ACTUALIZADO' : 'CREADO';
    },
    async registrarEvento(evento, trazabilidad) {
      llamadas.evento++;
      eventos.push(JSON.parse(JSON.stringify(evento)) as EventoSindicacion);
      trazabilidades.push(trazabilidad);
    },
  };
  return { puerto, docs, eventos, trazabilidades, llamadas, ctx: { puerto, fecha: FECHA } };
}

function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const fetchSpy = vi.fn();
beforeAll(() => vi.stubGlobal('fetch', fetchSpy));
afterEach(() => {
  fs.docs.clear();
  fs.llamadas.length = 0;
  fs.oyentes.length = 0;
  fs.emitirAlEscribir = false;
  fetchSpy.mockClear();
});

// ===========================================================================
describe('PERSISTENCIA · A. Guardar y leer el estado actual', () => {
  it('A.1 guarda un estado nuevo (un documento por inmueble+portal, id = externalId)', async () => {
    const f = crearPuertoMemoria();
    const r = await crearEstadoInicialSindicacion({ inmuebleId: 'inm-A', portales: ['IDEALISTA'], propietarioId: 'prop-A' }, f.ctx);
    expect(r.creados).toEqual(['IDEALISTA']);
    expect(r.preexistentes).toEqual([]);
    expect(f.docs.size).toBe(1);
    const [registro] = [...f.docs.values()];
    expect(registro.id).toBe(identidadPublicacionPortal('inm-A', 'IDEALISTA').externalId);
    expect(registro.externalId).toBe(registro.id);
    expect(registro.clave).toBe('IDEALISTA:inm-A');
    expect(registro.inmuebleId).toBe('inm-A');
    expect(registro.propietarioId).toBe('prop-A');
    expect(registro.estado).toBe('BORRADOR');
    expect(registro.ultimaOperacion).toBe('inicializar');
    expect(registro.operacionesRegistradas).toBe(1);
    expect(registro.creadoEn).toBe(FECHA);
    expect(registro.esquema).toBe(ESQUEMA_ESTADO_SINDICACION);
    expect(verificarInvariantesDelRegistro(registro).ok).toBe(true);
  });

  it('A.2 recupera el estado por inmueble + portal', async () => {
    const f = crearPuertoMemoria();
    await crearEstadoInicialSindicacion({ inmuebleId: 'inm-A', portales: ['IDEALISTA', 'KYERO'] }, f.ctx);
    const lectura = await leerEstadoSindicacionPorPortal({ inmuebleId: 'inm-A', portal: 'KYERO' }, f.ctx);
    expect(lectura.encontrado).toBe(true);
    expect(lectura.motivo).toBe('ENCONTRADO');
    expect(lectura.estado?.portal).toBe('KYERO');
    expect(lectura.clave).toBe('KYERO:inm-A');
    expect(lectura.externalId).toBe(identidadPublicacionPortal('inm-A', 'KYERO').externalId);
    // el portal de un inmueble vecino no se confunde
    expect((await leerEstadoSindicacionPorPortal({ inmuebleId: 'inm-A', portal: 'FOTOCASA' }, f.ctx)).motivo).toBe('SIN_REGISTRO');
  });

  it('A.3 recupera TODOS los estados de un inmueble, ordenados e indexados por portal', async () => {
    const f = crearPuertoMemoria();
    const portales = [...PORTALES_DISPONIBLES] as PortalInmobiliario[];
    await crearEstadoInicialSindicacion({ inmuebleId: 'inm-A', portales }, f.ctx);
    await crearEstadoInicialSindicacion({ inmuebleId: 'inm-B', portales: ['IDEALISTA'] }, f.ctx);
    const lectura = await leerEstadosSindicacion('inm-A', f.ctx);
    expect(lectura.total).toBe(portales.length);
    expect(lectura.vacio).toBe(false);
    expect(lectura.motivo).toBe('CON_ESTADOS');
    expect(lectura.estados.map((e) => e.portal)).toEqual([...portales].sort());
    expect(Object.keys(lectura.porPortal).sort()).toEqual([...portales].sort());
    expect(lectura.porPortal.KYERO?.inmuebleId).toBe('inm-A');
  });

  it('A.4 inmueble sin estado ⇒ resultado vacío controlado (nunca excepción, nunca undefined)', async () => {
    const f = crearPuertoMemoria();
    const lista = await leerEstadosSindicacion('inm-Z', f.ctx);
    expect(lista).toMatchObject({ inmuebleId: 'inm-Z', total: 0, vacio: true, motivo: 'SIN_REGISTRO' });
    expect(lista.estados).toEqual([]);
    const uno = await leerEstadoSindicacionPorPortal({ inmuebleId: 'inm-Z', portal: 'KYERO' }, f.ctx);
    expect(uno.encontrado).toBe(false);
    expect(uno.estado).toBeNull();
    expect(uno.motivo).toBe('SIN_REGISTRO');
    // y la lectura puede informar además si el contenido sería publicable YA
    const conContenido = await leerEstadoSindicacionPorPortal({ inmuebleId: 'inm-Z', portal: 'KYERO', publicacion: { ...publicacion(), precioMensual: 0 } }, f.ctx);
    expect(conContenido.publicable).toBe(false);
    expect(conContenido.bloqueosActuales).toEqual(['PRECIO_NO_POSITIVO']);
  });

  it('A.5 la lectura aísla aunque el puerto devuelva documentos de otros inmuebles', async () => {
    const f = crearPuertoMemoria({ devuelveDeMas: true });
    await crearEstadoInicialSindicacion({ inmuebleId: 'inm-A', portales: ['IDEALISTA'] }, f.ctx);
    await crearEstadoInicialSindicacion({ inmuebleId: 'inm-B', portales: ['IDEALISTA'] }, f.ctx);
    const a = await leerEstadosSindicacion('inm-A', f.ctx);
    expect(a.total).toBe(1);
    expect(a.estados.every((e) => e.inmuebleId === 'inm-A')).toBe(true);
  });

  it('A.6 PORTAL_NO_CONECTADO se persiste como ERROR con código, sin excepción', async () => {
    const f = crearPuertoMemoria();
    const pub = publicacion();
    const d = decision(pub, 'FOTOCASA');
    const adaptador = crearAdaptadorNoConectado('FOTOCASA');
    const rechazo = adaptador.publicar({ publicacion: pub }) as { ok: boolean; operacion: 'publicar'; portal: 'FOTOCASA'; error?: { codigo: string; mensaje: string } };
    expect(rechazo.ok).toBe(false);
    const r = await registrarPublicacionSindicacion({ decision: d, resultadoAdaptador: rechazo, publicacion: pub }, f.ctx);
    expect(r.estado).toBe('ERROR');
    expect(r.registro?.ultimoError).toContain('no conecta con portales reales');
    expect(r.registro?.ultimoCodigo).toBe('PORTAL_NO_CONECTADO');
    expect(r.escritura).toBe('CREADO');
    // el siguiente intento correcto limpia el error
    const ok = await registrarActualizacionSindicacion(
      { decision: { ...d, accion: 'ACTUALIZAR' }, resultadoAdaptador: { ok: true, operacion: 'actualizar', portal: 'FOTOCASA' }, publicacion: pub },
      { ...f.ctx, fecha: FECHA_2 },
    );
    expect(ok.estado).toBe('ACTUALIZADO');
    expect(ok.registro?.ultimoError).toBeUndefined();
    expect(ok.registro?.ultimoCodigo).toBeUndefined();
  });

  it('A.7 un fallo real del puerto se propaga (la persistencia no se finge)', async () => {
    const f = crearPuertoMemoria({ fallaEscritura: true });
    await expect(crearEstadoInicialSindicacion({ inmuebleId: 'inm-A', portales: ['IDEALISTA'] }, f.ctx)).rejects.toThrow(/permission-denied/);
  });

  it('A.8 reinicializar NO pisa el estado actual (el inicializador es idempotente)', async () => {
    const f = crearPuertoMemoria();
    const pub = publicacion();
    await crearEstadoInicialSindicacion({ inmuebleId: 'inm-A', portales: ['IDEALISTA'] }, f.ctx);
    await registrarPublicacionSindicacion({ decision: decision(pub), resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'IDEALISTA' }, publicacion: pub }, { ...f.ctx, fecha: FECHA_2 });
    const escrituras = f.llamadas.escribir;
    const re = await crearEstadoInicialSindicacion({ inmuebleId: 'inm-A', portales: ['IDEALISTA'] }, { ...f.ctx, fecha: '2026-09-24T00:00:00.000Z' });
    expect(re.creados).toEqual([]);
    expect(re.preexistentes).toEqual(['IDEALISTA']);
    expect(f.llamadas.escribir).toBe(escrituras);
    const estado = await leerEstadoSindicacionPorPortal({ inmuebleId: 'inm-A', portal: 'IDEALISTA' }, f.ctx);
    expect(estado.estado?.estado).toBe('PUBLICADO');
    expect(estado.estado?.creadoEn).toBe(FECHA);
  });

});

// ===========================================================================
describe('PERSISTENCIA · B. Transiciones, versión y contenido publicado', () => {
  it('B.1 publicar guarda versión, etiqueta y huella exactamente las del núcleo', async () => {
    const f = crearPuertoMemoria();
    const pub = publicacion();
    const version = calcularVersionPublicable(pub);
    const d = decision(pub);
    const r = await registrarPublicacionSindicacion(
      { decision: d, resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'IDEALISTA' }, publicacion: pub },
      f.ctx,
    );
    expect(d.accion).toBe('NUEVO');
    expect(r.estado).toBe('PUBLICADO');
    expect(r.pasosDeEstado).toBe(3); // BORRADOR → VALIDADO → LISTO_PARA_PUBLICAR → PUBLICADO (lo decide el motor)
    expect(r.registro?.version).toBe(version.numero);
    expect(r.registro?.etiquetaVersion).toBe(version.etiqueta);
    expect(r.registro?.hashContenido).toBe(version.hashContenido);
    expect(r.registro?.hashContenido).toHaveLength(64);
    expect(r.huellaEstado).toBe(huellaDeEstado(r.registro as RegistroEstadoSindicacion));
  });

  it('B.2 actualizar guarda la versión siguiente y conserva el id que dio el portal', async () => {
    const f = crearPuertoMemoria();
    const pub = publicacion();
    const primera = await registrarPublicacionSindicacion({ decision: decision(pub), resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'IDEALISTA' }, publicacion: pub }, f.ctx);
    expect(primera.registro?.version).toBe(1);
    const pub2 = publicacion({ precio: 990 });
    const d2 = decision(pub2, 'IDEALISTA', { publicada: { version: calcularVersionPublicable(pub), publicacion: pub } });
    expect(d2.accion).toBe('ACTUALIZAR');
    const r = await registrarActualizacionSindicacion(
      { decision: d2, resultadoAdaptador: { ok: true, operacion: 'actualizar', portal: 'IDEALISTA', externalId: 'ANUNCIO-PORTAL-555' }, publicacion: pub2 },
      { ...f.ctx, fecha: FECHA_2 },
    );
    expect(r.estado).toBe('ACTUALIZADO');
    expect(r.registro?.version).toBe(2);
    expect(r.registro?.hashContenido).toBe(calcularVersionPublicable(pub2).hashContenido);
    expect(r.registro?.idAnuncioPortal).toBe('ANUNCIO-PORTAL-555');
    // la identidad del ERP NO se sustituye por la del portal
    expect(r.registro?.externalId).toBe(primera.externalId);
    expect(f.docs.size).toBe(1);
  });

  it('B.3 la retirada pasa a DESPUBLICADO y CONSERVA la versión/huella de lo que estaba publicado', async () => {
    const f = crearPuertoMemoria();
    const pub = publicacion();
    const publicado = await registrarPublicacionSindicacion({ decision: decision(pub), resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'KYERO' }, publicacion: pub }, f.ctx);
    const d = decision(pub, 'KYERO', { retirada: true, publicada: { version: calcularVersionPublicable(pub), publicacion: pub } });
    expect(d.accion).toBe('RETIRAR');
    const r = await registrarRetiradaSindicacion({ decision: d, resultadoAdaptador: { ok: true, operacion: 'retirar', portal: 'KYERO' }, publicacion: pub }, { ...f.ctx, fecha: FECHA_2 });
    expect(r.estado).toBe('DESPUBLICADO');
    expect(r.registro?.version).toBe(publicado.version);
    expect(r.registro?.hashContenido).toBe(publicado.hashContenido);
    expect(r.registro?.ultimaOperacion).toBe('retirar');
    expect(r.registro?.ultimoResultado).toBe('OK');
  });

  it('B.4 retirar un contenido NO publicable también se persiste (la Fase 1 lo permite)', async () => {
    const f = crearPuertoMemoria();
    const roto = { ...publicacion(), precioMensual: 0 };
    const d = decision(roto, 'HABITACLIA', { retirada: true, publicada: { version: calcularVersionPublicable(roto) } });
    expect(d.accion).toBe('RETIRAR');
    expect(d.bloqueos).toBeUndefined(); // retirar no exige contenido publicable…
    const r = await registrarRetiradaSindicacion({ decision: d, resultadoAdaptador: { ok: true, operacion: 'retirar', portal: 'HABITACLIA' }, publicacion: roto }, f.ctx);
    expect(r.estado).toBe('DESPUBLICADO');
    expect(r.escritura).toBe('CREADO');
    // …pero el bloqueo queda informado en el registro (aunque no bloquee la retirada)
    expect(r.registro?.bloqueos).toEqual(['PRECIO_NO_POSITIVO']);
  });

  it('B.5 BLOQUEADO: registra el bloqueo sin alterar el estado publicado', async () => {
    const f = crearPuertoMemoria();
    const pub = publicacion();
    await registrarPublicacionSindicacion({ decision: decision(pub), resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'IDEALISTA' }, publicacion: pub }, f.ctx);
    const roto = { ...pub, precioMensual: 0 };
    const d = decision(roto, 'IDEALISTA', { publicada: { version: calcularVersionPublicable(pub), publicacion: pub } });
    expect(d.accion).toBe('BLOQUEADO');
    const r = await registrarResultadoSindicacion({ decision: d, publicacion: roto }, { ...f.ctx, fecha: FECHA_2 });
    expect(r.ejecutoPuerto).toBe(false);
    expect(r.estado).toBe('PUBLICADO'); // el portal sigue teniendo la última versión válida
    expect(r.registro?.ultimoResultado).toBe('BLOQUEADO');
    expect(r.registro?.bloqueos).toEqual(['PRECIO_NO_POSITIVO']);
    expect(r.registro?.version).toBe(1); // NO se publica la versión 2
    expect(r.registro?.hashContenido).toBe(calcularVersionPublicable(pub).hashContenido);
  });

  it('B.6 SIN_CAMBIOS no escribe ni genera historial (idempotencia de la persistencia)', async () => {
    const f = crearPuertoMemoria();
    const pub = publicacion();
    await registrarPublicacionSindicacion({ decision: decision(pub), resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'IDEALISTA' }, publicacion: pub }, f.ctx);
    const llamadasAntes = f.llamadas.escribir;
    const eventosAntes = f.eventos.length;
    const d = decision(pub, 'IDEALISTA', { publicada: { version: calcularVersionPublicable(pub), publicacion: pub } });
    expect(d.accion).toBe('SIN_CAMBIOS');
    const r = await registrarResultadoSindicacion({ decision: d, publicacion: pub }, { ...f.ctx, fecha: FECHA_2 });
    expect(r.escritura).toBe('SIN_CAMBIOS');
    expect(r.ejecutoPuerto).toBe(false);
    expect(f.llamadas.escribir).toBe(llamadasAntes);
    expect(f.eventos.length).toBe(eventosAntes);
    expect(f.docs.get(r.externalId)?.ultimaSincronizacion).toBe(FECHA); // intacto: ni el timestamp se reescribe
  });

  it('B.7 la huella del estado ignora reloj y contadores, y SÍ ve el contenido', () => {
    const pub = publicacion();
    const version = calcularVersionPublicable(pub);
    const base = construirRegistroEstado({ portal: 'IDEALISTA', inmuebleId: 'inm-A', estado: 'PUBLICADO', operacion: 'publicar', resultado: 'OK', fecha: FECHA, version, publicacion: pub });
    const igual = construirRegistroEstado({ portal: 'IDEALISTA', inmuebleId: 'inm-A', estado: 'PUBLICADO', operacion: 'publicar', resultado: 'OK', fecha: FECHA_2, version, publicacion: pub });
    expect(huellaDeEstado(base)).toBe(huellaDeEstado(igual));
    expect(estadosIguales(base, igual)).toBe(true);
    expect(proyeccionDeEstado(base)).not.toHaveProperty('actualizadoEn');
    expect(proyeccionDeEstado(base)).not.toHaveProperty('creadoEn');
    expect(proyeccionDeEstado(base)).not.toHaveProperty('operacionesRegistradas');
    expect(CLAVES_DE_ESTADO).toContain('hashContenido');
    const otro = construirRegistroEstado({ portal: 'IDEALISTA', inmuebleId: 'inm-A', estado: 'PUBLICADO', operacion: 'publicar', resultado: 'OK', fecha: FECHA, version: calcularVersionPublicable(publicacion({ precio: 999 })), publicacion: pub });
    expect(huellaDeEstado(otro)).not.toBe(huellaDeEstado(base));
  });

  it('B.8 el estado sólo se mueve por transiciones del motor (camino mínimo, sin invenciones)', () => {
    expect(caminoDeEstados('BORRADOR', 'PUBLICADO')).toEqual(['VALIDADO', 'LISTO_PARA_PUBLICAR', 'PUBLICADO']);
    expect(caminoDeEstados('BORRADOR', 'BORRADOR')).toEqual([]);
    expect(caminoDeEstados('PUBLICADO', 'DESPUBLICADO')).toEqual(['DESPUBLICADO']);
    expect(caminoDeEstados('ERROR', 'PUBLICADO')).toEqual(['LISTO_PARA_PUBLICAR', 'PUBLICADO']);
    const avance = avanzarEstadoHasta('BORRADOR', 'PUBLICADO', { portal: 'KYERO', fecha: FECHA });
    expect(avance).toMatchObject({ ok: true, estado: 'PUBLICADO', pasos: 3 });
    // un estado corrupto en el documento persistido NO avanza: se rechaza en vez de inventar
    const roto = avanzarEstadoHasta('NO_EXISTE' as never, 'PUBLICADO', { portal: 'KYERO', fecha: FECHA });
    expect(roto.ok).toBe(false);
    expect(roto.error).toContain('Transición no permitida');
    // todos los estados VÁLIDOS del motor son alcanzables entre sí: el guard
    // `RECHAZADO` sólo sirve para documentos corruptos, no para datos sanos.
    for (const desde of ESTADOS_PUBLICACION) {
      for (const hasta of ESTADOS_PUBLICACION) {
        if (desde === hasta) continue;
        expect(caminoDeEstados(desde, hasta).length, `${desde} → ${hasta}`).toBeGreaterThan(0);
      }
    }
  });

  it('B.9 un estado persistido con identidad forjada se rechaza y no se escribe', () => {
    const registro = construirRegistroEstado({ portal: 'IDEALISTA', inmuebleId: 'inm-A', estado: 'PUBLICADO', operacion: 'publicar', resultado: 'OK', fecha: FECHA });
    expect(verificarInvariantesDelRegistro(registro).ok).toBe(true);
    const idFalso: RegistroEstadoSindicacion = { ...registro, id: 'otro_id' };
    const v = verificarInvariantesDelRegistro(idFalso);
    expect(v.ok).toBe(false);
    expect(v.errores.join(' ')).toContain('INVARIANTE_ID_DOCUMENTO');
    const externalIdFalso: RegistroEstadoSindicacion = { ...registro, id: 'otro_id', externalId: 'otro_id' };
    expect(verificarInvariantesDelRegistro(externalIdFalso).errores.join(' ')).toContain('INVARIANTE_EXTERNAL_ID');
    const cruzado: RegistroEstadoSindicacion = { ...registro, clave: 'KYERO:inm-A', portal: 'KYERO' as PortalInmobiliario };
    expect(verificarInvariantesDelRegistro(cruzado).errores.join(' ')).toContain('INVARIANTE_EXTERNAL_ID');
  });

  it('B.10 la recuperación sale de ERROR hacia LISTO_PARA_PUBLICAR (nunca a PUBLICADO a salto)', async () => {
    const f = crearPuertoMemoria();
    const pub = publicacion();
    await crearEstadoInicialSindicacion({ inmuebleId: 'inm-A', portales: ['IDEALISTA'] }, f.ctx);
    const error = await registrarErrorSindicacion(
      { decision: decision(pub), resultadoAdaptador: { ok: false, operacion: 'publicar', portal: 'IDEALISTA', error: { codigo: 'RATE_LIMITED', mensaje: 'Límite del portal' } }, publicacion: pub },
      f.ctx,
    );
    expect(error.estado).toBe('ERROR');
    expect(error.registro?.ultimoCodigo).toBe('RATE_LIMITED');
    expect(error.registro?.ultimoError).toBe('Límite del portal');
    const r = await registrarRecuperacionSindicacion({ decision: decision(pub), publicacion: pub }, { ...f.ctx, fecha: FECHA_2 });
    expect(r.estado).toBe('LISTO_PARA_PUBLICAR');
    expect(r.estadoAnterior).toBe('ERROR');
    expect(r.registro?.ultimoError).toBeUndefined();
    expect(r.escritura).toBe('ACTUALIZADO');
    // sin estado previo no hay nada que recuperar, y no se escribe
    const f2 = crearPuertoMemoria();
    const vacio = await registrarRecuperacionSindicacion({ decision: decision(pub, 'KYERO'), publicacion: pub }, f2.ctx);
    expect(vacio.escritura).toBe('SIN_CAMBIOS');
    expect(vacio.motivo).toContain('No había estado que recuperar');
    expect(f2.llamadas.escribir).toBe(0);
  });

  it('B.11 recuperación con un estado que no es ERROR no escribe', async () => {
    const f = crearPuertoMemoria();
    const pub = publicacion();
    await registrarPublicacionSindicacion({ decision: decision(pub), resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'IDEALISTA' }, publicacion: pub }, f.ctx);
    const llamadas = f.llamadas.escribir;
    const r = await registrarRecuperacionSindicacion({ decision: decision(pub), publicacion: pub }, { ...f.ctx, fecha: FECHA_2 });
    expect(r.escritura).toBe('SIN_CAMBIOS');
    expect(r.motivo).toContain('Recuperación innecesaria');
    expect(f.llamadas.escribir).toBe(llamadas);
  });

  it('B.12 una identidad adulterada en la decisión se rechaza ANTES de escribir', async () => {
    const f = crearPuertoMemoria();
    const pub = publicacion();
    const d = decision(pub);
    const adulterada = { ...d, externalId: 'idealista_ajeno', claveIdentidad: 'IDEALISTA:inm-OTRO' };
    const r = await registrarResultadoSindicacion({ decision: adulterada, resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'IDEALISTA' }, publicacion: pub }, f.ctx);
    expect(r.escritura).toBe('RECHAZADO');
    expect(r.invariantes.ok).toBe(false);
    expect(r.invariantes.errores.join(' ')).toContain('INVARIANTE_EXTERNAL_ID');
    expect(f.llamadas.escribir).toBe(0);
    expect(f.eventos).toEqual([]);
    expect(f.docs.size).toBe(0);
    // y la decisión legítima del mismo inmueble sí escribe
    const ok = await registrarResultadoSindicacion({ decision: d, resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'IDEALISTA' }, publicacion: pub }, f.ctx);
    expect(ok.escritura).toBe('CREADO');
    expect(f.docs.size).toBe(1);
  });
});

// ===========================================================================
describe('PERSISTENCIA · C. Idempotencia, historial e inmutabilidad', () => {
  it('C.1 repetir la misma operación no duplica el estado (una clave = un documento)', async () => {
    const f = crearPuertoMemoria();
    const pub = publicacion();
    const d = decision(pub);
    const adapt = { ok: true as const, operacion: 'publicar' as const, portal: 'IDEALISTA' as const };
    const primera = await registrarPublicacionSindicacion({ decision: d, resultadoAdaptador: adapt, publicacion: pub }, f.ctx);
    const llamadasTrasPrimera = f.llamadas.escribir;
    for (let i = 0; i < 5; i++) {
      const otra = await registrarPublicacionSindicacion({ decision: d, resultadoAdaptador: adapt, publicacion: pub }, { ...f.ctx, fecha: `2026-09-23T12:0${i}:00.000Z` });
      expect(otra.escritura).toBe('SIN_CAMBIOS');
    }
    expect(f.llamadas.escribir).toBe(llamadasTrasPrimera);
    expect(f.docs.size).toBe(1);
    expect(primera.registro?.operacionesRegistradas).toBe(1);
  });

  it('C.2 el historial es append-only y su id es determinista por cambio de estado', async () => {
    const f = crearPuertoMemoria();
    const pub = publicacion();
    await crearEstadoInicialSindicacion({ inmuebleId: 'inm-A', portales: ['IDEALISTA'] }, f.ctx);
    expect(f.eventos.filter((x) => x.operacion === 'publicar')).toHaveLength(0);
    await registrarPublicacionSindicacion({ decision: decision(pub), resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'IDEALISTA' }, publicacion: pub }, { ...f.ctx, fecha: FECHA_2 });
    expect(f.eventos).toHaveLength(2); // inicializar + publicar: append-only, nada de reescritura
    const e = f.eventos[1];
    expect(f.eventos[0].fecha).toBe(FECHA);
    expect(e.id).toBe(idDelEvento(sinId(e)));
    expect(e.inmuebleId).toBe('inm-A');
    expect(e.portal).toBe('IDEALISTA');
    expect(e.operacion).toBe('publicar');
    expect(e.accion).toBe('NUEVO');
    expect(e.estado).toBe('PUBLICADO');
    expect(e.estadoAnterior).toBe('BORRADOR');
    expect(e.version).toBe(1);
    expect(e.hashContenido).toHaveLength(64);
    expect(e.fecha).toBe(FECHA_2);
    // la misma decisión repetida produce el MISMO id (nada de eventos duplicados)…
    expect(idDelEvento(sinId(e))).toBe(idDelEvento(sinId(e)));
    // …y un cambio de versión produce uno distinto (no pisa el anterior en audit_logs)
    const otro = idDelEvento({ ...sinId(e), version: 2 });
    expect(otro).not.toBe(e.id);
  });

  it('C.3 la trazabilidad del evento la firma el motor existente (mensajes literales, no códigos)', async () => {
    const f = crearPuertoMemoria();
    const pub = publicacion({ images: [] });
    const r = await registrarPublicacionSindicacion({ decision: decision(pub), resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'IDEALISTA' }, publicacion: pub }, f.ctx);
    expect(r.trazabilidad).toMatchObject({
      inmuebleId: 'inm-A',
      idPublico: pub.idPublico,
      portal: 'IDEALISTA',
      formato: 'JSON_NORMALIZADO',
      externalId: r.externalId,
      fecha: FECHA,
      resultado: 'OK',
    });
    expect(r.trazabilidad?.advertencias).toEqual(['Sin imágenes: el anuncio se publicará sin fotografías.']);
    expect(r.trazabilidad?.errores).toEqual([]);
    expect(f.trazabilidades[0]).toEqual(r.trazabilidad);
  });

  it('C.4 ni el payload, ni la decisión, ni el registro previo se modifican (el dominio no muta)', async () => {
    const f = crearPuertoMemoria();
    const pub = publicacion();
    const d = decision(pub);
    const snapshotPub = JSON.stringify(pub);
    const snapshotDecision = JSON.stringify(d);
    const congelada = JSON.parse(JSON.stringify(pub)) as PublicacionInmueble;
    Object.freeze(congelada);
    Object.freeze(congelada.imagenes);
    await crearEstadoInicialSindicacion({ inmuebleId: 'inm-A', portales: ['IDEALISTA'], publicacion: congelada }, f.ctx);
    await registrarResultadoSindicacion({ decision: d, resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'IDEALISTA' }, publicacion: congelada }, { ...f.ctx, fecha: FECHA_2 });
    await leerEstadosSindicacion('inm-A', f.ctx);
    expect(JSON.stringify(pub)).toBe(snapshotPub);
    expect(JSON.stringify(d)).toBe(snapshotDecision);
    expect(() => construirRegistroEstado({ portal: 'IDEALISTA', inmuebleId: 'inm-A', estado: 'PUBLICADO', operacion: 'publicar', resultado: 'OK', fecha: FECHA, publicacion: congelada, version: calcularVersionPublicable(congelada) })).not.toThrow();
  });

  it('C.5 el dominio no crea estado global: dos contextos son independientes', async () => {
    const pub = publicacion();
    const a = crearPuertoMemoria();
    const b = crearPuertoMemoria();
    await registrarPublicacionSindicacion({ decision: decision(pub), resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'IDEALISTA' }, publicacion: pub }, a.ctx);
    expect(b.docs.size).toBe(0);
    expect(b.eventos).toEqual([]);
    expect(b.llamadas).toEqual({ leer: 0, listar: 0, escribir: 0, evento: 0 });
    await expect(leerEstadosSindicacion('inm-A', b.ctx)).resolves.toMatchObject({ total: 0 });
  });

  it('C.6 dos llamadas con el mismo contexto y la misma entrada dan el mismo resultado lógico', async () => {
    const pub = publicacion({ precio: 980 });
    const f1 = crearPuertoMemoria();
    const f2 = crearPuertoMemoria();
    const r1 = await registrarPublicacionSindicacion({ decision: decision(pub), resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'KYERO' }, publicacion: pub }, f1.ctx);
    const r2 = await registrarPublicacionSindicacion({ decision: decision(pub), resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'KYERO' }, publicacion: pub }, f2.ctx);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    expect(JSON.stringify([...f1.docs.values()])).toBe(JSON.stringify([...f2.docs.values()]));
    expect(r1.huellaEstado).toBe(r2.huellaEstado);
  });

  it('C.7 `actualizarEstadoSindicacion` escribe sólo si el estado cambia (y valida invariantes)', async () => {
    const f = crearPuertoMemoria();
    const pub = publicacion();
    const version = calcularVersionPublicable(pub);
    const r1 = await actualizarEstadoSindicacion({ inmuebleId: 'inm-A', portal: 'IDEALISTA', estado: 'LISTO_PARA_PUBLICAR', operacion: 'validar', resultado: 'OK', publicacion: pub, version }, f.ctx);
    expect(r1.escritura).toBe('CREADO');
    const r2 = await actualizarEstadoSindicacion({ inmuebleId: 'inm-A', portal: 'IDEALISTA', estado: 'LISTO_PARA_PUBLICAR', operacion: 'validar', resultado: 'OK', publicacion: pub, version }, f.ctx);
    expect(r2.escritura).toBe('SIN_CAMBIOS');
    expect(f.llamadas.escribir).toBe(1);
    const r3 = await actualizarEstadoSindicacion({ inmuebleId: 'inm-A', portal: 'IDEALISTA', estado: 'ERROR', operacion: 'publicar', resultado: 'ERROR', publicacion: pub, version, ultimoError: 'boom' }, f.ctx);
    expect(r3.escritura).toBe('ACTUALIZADO');
    expect(resumenDelEstado(r3.registro as RegistroEstadoSindicacion)).toMatch(/^IDEALISTA·inm-A: ERROR/);
    // identidad forjada ⇒ RECHAZADO y cero escrituras
    const forjada = await actualizarEstadoSindicacion({ inmuebleId: '', portal: 'IDEALISTA', estado: 'PUBLICADO', operacion: 'publicar', resultado: 'OK' }, f.ctx);
    expect(forjada.escritura).toBe('RECHAZADO');
    expect(forjada.invariantes.ok).toBe(false);
    expect(f.llamadas.escribir).toBe(2);
  });

  it('C.8 aislamiento entre portales: retirar en uno no toca a los demás', async () => {
    const f = crearPuertoMemoria();
    const pub = publicacion();
    for (const portal of ['IDEALISTA', 'FOTOCASA'] as PortalInmobiliario[]) {
      await registrarPublicacionSindicacion({ decision: decision(pub, portal), resultadoAdaptador: { ok: true, operacion: 'publicar', portal }, publicacion: pub }, f.ctx);
    }
    const d = decision(pub, 'IDEALISTA', { retirada: true, publicada: { version: calcularVersionPublicable(pub), publicacion: pub } });
    await registrarRetiradaSindicacion({ decision: d, resultadoAdaptador: { ok: true, operacion: 'retirar', portal: 'IDEALISTA' }, publicacion: pub }, { ...f.ctx, fecha: FECHA_2 });
    const lectura = await leerEstadosSindicacion('inm-A', f.ctx);
    expect(lectura.porPortal.IDEALISTA?.estado).toBe('DESPUBLICADO');
    expect(lectura.porPortal.FOTOCASA?.estado).toBe('PUBLICADO');
    expect(lectura.porPortal.FOTOCASA?.ultimaSincronizacion).toBe(FECHA);
  });

  it('C.9 aislamiento entre inmuebles con el mismo portal', async () => {
    const f = crearPuertoMemoria();
    const pubA = publicacion();
    const pubB = publicacion({ id: 'inm-B', referenciaCatastral: '9999999ZZ9999Z' });
    await registrarPublicacionSindicacion({ decision: resolverAccionSindicacion({ publicacion: pubA, portal: 'KYERO' }), resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'KYERO' }, publicacion: pubA }, f.ctx);
    const dB = resolverAccionSindicacion({ publicacion: pubB, portal: 'KYERO' });
    await registrarPublicacionSindicacion({ decision: dB, resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'KYERO' }, publicacion: pubB }, f.ctx);
    const a = await leerEstadoSindicacionPorPortal({ inmuebleId: 'inm-A', portal: 'KYERO' }, f.ctx);
    const b = await leerEstadoSindicacionPorPortal({ inmuebleId: 'inm-B', portal: 'KYERO' }, f.ctx);
    expect(a.estado?.hashContenido).toBe(calcularVersionPublicable(pubA).hashContenido);
    expect(b.estado?.hashContenido).toBe(calcularVersionPublicable(pubB).hashContenido);
    expect(a.externalId).not.toBe(b.externalId);
    expect(f.docs.size).toBe(2);
  });
});

// ===========================================================================
describe('PERSISTENCIA · D. Independencia del portal', () => {
  it('D.1 el mismo flujo y el mismo estado en los cuatro portales declarados', async () => {
    const pub = publicacion();
    const resultados = [];
    for (const portal of PORTALES_DISPONIBLES as PortalInmobiliario[]) {
      const f = crearPuertoMemoria();
      await crearEstadoInicialSindicacion({ inmuebleId: 'inm-A', portales: [portal] }, f.ctx);
      resultados.push(
        await registrarPublicacionSindicacion({ decision: decision(pub, portal), resultadoAdaptador: { ok: true, operacion: 'publicar', portal }, publicacion: pub }, { ...f.ctx, fecha: FECHA_2 }),
      );
    }
    const [primero] = resultados;
    for (const r of resultados) {
      expect(r.estado).toBe(primero.estado);
      expect(r.pasosDeEstado).toBe(primero.pasosDeEstado);
      expect(r.registro?.hashContenido).toBe(primero.registro?.hashContenido);
      expect(r.registro?.version).toBe(primero.registro?.version);
      expect(r.escritura).toBe(primero.escritura);
    }
    expect(new Set(resultados.map((r) => r.clave)).size).toBe(4);
  });

  it('D.2 el dominio no conoce portales: ni literales, ni condicionales', () => {
    const dir = path.resolve(__dirname, '../src/sindicacion');
    const fuentes = readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => ({ nombre: f, codigo: readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') }));
    const ejecutable = fuentes.map((f) => f.codigo).join('\n');
    for (const nombre of ['IDEALISTA', 'FOTOCASA', 'HABITACLIA', 'KYERO']) {
      expect(ejecutable.includes(`'${nombre}'`), `literal '${nombre}'`).toBe(false);
    }
    expect(ejecutable).not.toMatch(/portal\s*(===|!==|==|!=)\s*['"](IDEALISTA|FOTOCASA|HABITACLIA|KYERO)['"]/);
    expect(ejecutable).not.toMatch(/switch\s*\(\s*\w*portal\w*\s*\)/i);
    // y la persistencia tampoco importa Firebase ni hace red
    for (const f of fuentes) {
      expect(f.codigo, f.nombre).not.toMatch(/from\s+'firebase/i);
      expect(f.codigo, f.nombre).not.toMatch(/\bfetch\s*\(/);
    }
  });
});

// ===========================================================================
const rutaDoc = (externalId: string) => `${COLECCION_ESTADO_SINDICACION}/${externalId}`;
const cargarAdaptador = () => import('../src/lib/sindicacionFirestore');

describe('PERSISTENCIA · E. Adaptador real de Firestore (mockeado: nunca una instancia real)', () => {

  it('E.1 escribe en la colección y el documento correctos, sanitizado y con el esquema', async () => {
    const m = await cargarAdaptador();
    const pub = publicacion();
    const registro = construirRegistroEstado({
      portal: 'KYERO',
      inmuebleId: 'inm-A',
      estado: 'PUBLICADO',
      operacion: 'publicar',
      resultado: 'OK',
      fecha: FECHA,
      publicacion: pub,
      version: calcularVersionPublicable(pub),
      propietarioId: 'prop-A',
    });
    const r = await m.guardarEstadoSindicacionFirestore(registro);
    expect(r).toMatchObject({ escritura: 'CREADO', sinCambio: false });
    const escrita = fs.llamadas.find((l) => l[0] === 'setDoc');
    expect(escrita?.[1]).toBe(rutaDoc(registro.id));
    const datos = escrita?.[2] as Record<string, unknown>;
    expect(datos.inmuebleId).toBe('inm-A');
    expect(datos.portal).toBe('KYERO');
    expect(datos.esquema).toBe(ESQUEMA_ESTADO_SINDICACION);
    expect(datos.hashContenido).toHaveLength(64);
    expect(escrita?.[3]).toEqual({ merge: false });
    // nada de claves de credencial ni de campos undefined
    expect(Object.keys(datos).some((k) => /token|apiKey|secret|password/i.test(k))).toBe(false);
  });

  it('E.2 no reescribe cuando la huella del estado es idéntica (segunda barrera, en el adaptador)', async () => {
    const m = await cargarAdaptador();
    const pub = publicacion();
    const registro = construirRegistroEstado({ portal: 'KYERO', inmuebleId: 'inm-A', estado: 'PUBLICADO', operacion: 'publicar', resultado: 'OK', fecha: FECHA, publicacion: pub, version: calcularVersionPublicable(pub), propietarioId: 'prop-A' });
    await m.guardarEstadoSindicacionFirestore(registro);
    const setDocsAntes = fs.llamadas.filter((l) => l[0] === 'setDoc').length;
    const otraVez = await m.guardarEstadoSindicacionFirestore({ ...registro, actualizadoEn: FECHA_2, ultimaSincronizacion: FECHA_2, operacionesRegistradas: 9 });
    expect(otraVez.sinCambio).toBe(true);
    expect(fs.llamadas.filter((l) => l[0] === 'setDoc').length).toBe(setDocsAntes);
  });

  it('E.3 rechaza identidades forjadas, credenciales y documentos sin propietario', async () => {
    const m = await cargarAdaptador();
    const pub = publicacion();
    const valido = construirRegistroEstado({ portal: 'IDEALISTA', inmuebleId: 'inm-A', estado: 'PUBLICADO', operacion: 'publicar', resultado: 'OK', fecha: FECHA, publicacion: pub, propietarioId: 'prop-A' });
    await expect(m.guardarEstadoSindicacionFirestore({ ...valido, id: 'forjado' })).rejects.toThrow(/INVARIANTE_ID_DOCUMENTO/);
    await expect(m.guardarEstadoSindicacionFirestore({ ...valido, propietarioId: undefined })).rejects.toThrow(/propietarioId/);
    await expect(m.guardarEstadoSindicacionFirestore({ ...valido, accessToken: 'NO' } as never)).rejects.toThrow(/credenciales/);
    expect(fs.llamadas.filter((l) => l[0] === 'setDoc')).toHaveLength(0);
  });

  it('E.4 lee por inmueble filtrando en la propia consulta y ordenando por portal', async () => {
    const m = await cargarAdaptador();
    const pub = publicacion();
    for (const portal of ['KYERO', 'IDEALISTA'] as PortalInmobiliario[]) {
      const registro = construirRegistroEstado({ portal, inmuebleId: 'inm-A', estado: 'PUBLICADO', operacion: 'publicar', resultado: 'OK', fecha: FECHA, publicacion: pub, propietarioId: 'prop-A' });
      fs.docs.set(rutaDoc(registro.id), registro as unknown as Record<string, unknown>);
    }
    // un documento de otro inmueble, en la misma colección: la regla de aislamiento es la query + el filtro
    const otro = construirRegistroEstado({ portal: 'KYERO', inmuebleId: 'inm-B', estado: 'PUBLICADO', operacion: 'publicar', resultado: 'OK', fecha: FECHA, publicacion: pub, propietarioId: 'prop-B' });
    fs.docs.set(rutaDoc(otro.id), otro as unknown as Record<string, unknown>);
    const lista = await m.listarEstadosSindicacionFirestore('inm-A');
    expect(lista.map((e) => e.portal)).toEqual(['IDEALISTA', 'KYERO']);
    const consulta = fs.llamadas.find((l) => l[0] === 'getDocs');
    expect(consulta?.[1]).toBe(COLECCION_ESTADO_SINDICACION);
    expect(await m.leerEstadoSindicacionFirestore('inm-A', 'FOTOCASA')).toBeNull();
  });

  it('E.5 el historial va a `audit_logs` (canal canónico), con id determinista y sin update', async () => {
    const m = await cargarAdaptador();
    const pub = publicacion();
    const version = calcularVersionPublicable(pub);
    const repositorio = m.crearRepositorioEstadoSindicacionFirestore({ actor: { id: 'u1', nombre: 'Ana', email: 'ana@test' } });
    const registro = construirRegistroEstado({ portal: 'IDEALISTA', inmuebleId: 'inm-A', estado: 'PUBLICADO', operacion: 'publicar', resultado: 'OK', fecha: FECHA, publicacion: pub, version, propietarioId: 'prop-A' });
    await repositorio.escribirEstado(registro);
    expect(fs.docs.has(rutaDoc(registro.id))).toBe(true);
    const eventoBase = {
      inmuebleId: 'inm-A',
      idPublico: pub.idPublico,
      portal: 'IDEALISTA' as PortalInmobiliario,
      externalId: registro.externalId,
      operacion: 'publicar' as const,
      accion: 'NUEVO' as const,
      estado: 'PUBLICADO' as const,
      estadoAnterior: 'BORRADOR' as const,
      pasosAplicados: 3,
      resultado: 'OK' as const,
      version: 1,
      hashContenido: version.hashContenido,
      errores: [],
      advertencias: ['Sin imágenes: el anuncio se publicará sin fotografías.'],
      mensaje: 'ok',
      fecha: FECHA,
    };
    const evento: EventoSindicacion = { ...eventoBase, id: idDelEvento(eventoBase) };
    await repositorio.registrarEvento?.(evento, null);
    const auditoria = fs.llamadas.find((l) => l[0] === 'audit');
    expect(auditoria).toBeDefined();
    const log = auditoria?.[1] as Record<string, unknown>;
    expect(log.id).toBe(evento.id);
    expect(log.fechaHora).toBe(FECHA);
    expect(log.accion).toBe('SINDICACION_PUBLICAR');
    expect(log.entidadAfectada).toBe('inmueble');
    expect(log.idAfectado).toBe('inm-A');
    expect(log.resultado).toBe('EXITO');
    expect((log.detalles as Record<string, unknown>).externalId).toBe(registro.externalId);
    expect((log.detalles as Record<string, unknown>).hashContenido).toBe(version.hashContenido);
    // auditoría es append-only: NUNCA un setDoc sobre audit_logs con merge
    expect(fs.llamadas.some((l) => l[0] === 'setDoc' && String(l[1]).startsWith('audit_logs'))).toBe(false);
    // y `auditoria:false` silencia el canal sin silenciar el estado
    const silencioso = m.crearRepositorioEstadoSindicacionFirestore({ auditoria: false });
    const antes = fs.llamadas.filter((l) => l[0] === 'audit').length;
    await silencioso.registrarEvento?.(evento, null);
    expect(fs.llamadas.filter((l) => l[0] === 'audit').length).toBe(antes);
    await silencioso.escribirEstado(registro);
    expect(fs.docs.has(rutaDoc(registro.id))).toBe(true);
  });

  it('E.6 el repositorio implementa el puerto y la suscripción de estados no lanza', async () => {
    const m = await cargarAdaptador();
    const repo = m.crearRepositorioEstadoSindicacionFirestore();
    expect(typeof repo.leerEstado).toBe('function');
    expect(typeof repo.listarEstados).toBe('function');
    expect(typeof repo.escribirEstado).toBe('function');
    expect(typeof repo.registrarEvento).toBe('function');
    const recibidos: RegistroEstadoSindicacion[] = [];
    const unsubscribe = m.subscribeEstadosSindicacionFirestore('inm-A', (items) => recibidos.push(...items));
    expect(typeof unsubscribe).toBe('function');
    expect(await repo.listarEstados('inm-A')).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('E.7 el dominio funciona contra el repositorio de Firestore (integración puerto ↔ adaptador)', async () => {
    const m = await cargarAdaptador();
    const ctx: ContextoPersistencia = { puerto: m.crearRepositorioEstadoSindicacionFirestore({ actor: { id: 'u1' } }), fecha: FECHA };
    const pub = publicacion();
    const inicial = await crearEstadoInicialSindicacion({ inmuebleId: 'inm-A', portales: ['IDEALISTA'], publicacion: pub, propietarioId: 'prop-A' }, ctx);
    expect(inicial.creados).toEqual(['IDEALISTA']);
    const r = await registrarPublicacionSindicacion({ decision: decision(pub), resultadoAdaptador: { ok: true, operacion: 'publicar', portal: 'IDEALISTA' }, publicacion: pub }, { ...ctx, fecha: FECHA_2 });
    expect(r.escritura).toBe('ACTUALIZADO');
    const lectura = await leerEstadoSindicacionPorPortal({ inmuebleId: 'inm-A', portal: 'IDEALISTA' }, ctx);
    expect(lectura.estado?.estado).toBe('PUBLICADO');
    expect(lectura.estado?.hashContenido).toBe(calcularVersionPublicable(pub).hashContenido);
    // reintentar la misma operación no vuelve a escribir en Firestore
    const setDocs = fs.llamadas.filter((l) => l[0] === 'setDoc').length;
    const repetida = await registrarResultadoSindicacion({ decision: decision(pub, 'IDEALISTA', { publicada: { version: calcularVersionPublicable(pub), publicacion: pub } }), publicacion: pub }, { ...ctx, fecha: FECHA_2 });
    expect(repetida.escritura).toBe('SIN_CAMBIOS');
    expect(fs.llamadas.filter((l) => l[0] === 'setDoc').length).toBe(setDocs);
  });

  it('E.8 la suscripción deja de emitir en cuanto se cierra, aunque el servidor siga empujando', async () => {
    // Con `emitirAlEscribir` el fake rellama a los oyentes en cada setDoc: es más duro que el
    // SDK real (que deja de llamar tras el unsubscribe). Así la guarda `cerrado` del adaptador
    // es observable; sin ella, un componente desmontado seguiría recibiendo estados.
    const m = await cargarAdaptador();
    fs.emitirAlEscribir = true;
    const pub = publicacion();
    const inicial = construirRegistroEstado({ portal: 'IDEALISTA', inmuebleId: 'inm-A', estado: 'BORRADOR', operacion: 'inicializar', resultado: 'OK', fecha: FECHA, publicacion: pub, propietarioId: 'prop-A' });
    let veces = 0;
    const cerrar = m.subscribeEstadosSindicacionFirestore('inm-A', () => { veces += 1; });
    expect(veces).toBe(1); // el snapshot inicial llega
    await m.guardarEstadoSindicacionFirestore(inicial);
    expect(veces).toBe(2); // y con la escucha abierta, los cambios también
    cerrar();
    const validado = construirRegistroEstado({ portal: 'IDEALISTA', inmuebleId: 'inm-A', estado: 'VALIDADO', operacion: 'validar', resultado: 'OK', fecha: FECHA_2, publicacion: pub, propietarioId: 'prop-A' });
    await m.guardarEstadoSindicacionFirestore(validado);
    expect(veces).toBe(2); // cerrado: ni un callback más, aunque el servidor empuje
    expect(fs.llamadas.filter((l) => l[0] === 'unsubscribe')).toHaveLength(1);
  });
});

// ===========================================================================
describe('PERSISTENCIA · F. Cero Firebase real y cero red', () => {
  it('F.1 ningún módulo del dominio importa Firebase, Storage ni HTTP', () => {
    const dir = path.resolve(__dirname, '../src/sindicacion');
    const nombres = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    const prohibido: Array<[string, RegExp]> = [
      ['firebase', /from\s+'firebase|@firebase/i],
      ['fetch', /\bfetch\s*\(/],
      ['http', /node:https?\b|XMLHttpRequest/],
      ['storage', /uploadBytes|getDownloadURL|storage\.bucket/],
      ['reloj', /Date\.now|new Date\(/],
      ['azar', /Math\.random/],
      ['persistencia local', /localStorage|sessionStorage|indexedDB/],
      ['jobs', /setTimeout|setInterval|\bcron\b|webhook/i],
    ];
    for (const nombre of nombres) {
      const codigo = sinComentarios(readFileSync(path.join(dir, nombre), 'utf8'));
      for (const [etiqueta, patron] of prohibido) {
        expect(patron.test(codigo), `${nombre} contiene ${etiqueta}`).toBe(false);
      }
    }
  });

  it('F.2 el adaptador de Firestore es el ÚNICO fichero del ERP que conoce esa colección', () => {
    const raiz = path.resolve(__dirname, '../src');
    const walk = (dir: string, acc: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, acc);
        else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
      }
      return acc;
    };
    const ficheros = walk(raiz);
    const usan = ficheros.filter((f) => sinComentarios(readFileSync(f, 'utf8')).includes(`'${COLECCION_ESTADO_SINDICACION}'`));
    expect(usan.map((f) => path.basename(f)).sort()).toEqual(['estadoRepositorio.ts']);
    // ningún consumidor nuevo en App.tsx / firestore.rules (fuera de alcance en esta orden)
    expect(readFileSync(path.resolve(raiz, 'App.tsx'), 'utf8')).not.toContain(COLECCION_ESTADO_SINDICACION);
    // Desde la fase 2B la colección SÍ está en `firestore.rules` (bloque §38): la regla
    // es lo que la hace persistible. Lo que sigue ratchetado es que nadie la consuma
    // fuera del adaptador (el único lector/escritor es src/lib/sindicacionFirestore.ts).
    const reglas = readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
    expect(reglas).toContain(`match /${COLECCION_ESTADO_SINDICACION}/{docId}`);
    const desdeBloque = reglas.indexOf(`match /${COLECCION_ESTADO_SINDICACION}/`) + 1;
    expect(desdeBloque).toBeLessThan(reglas.indexOf('match /{document=**}'));
    // entre el bloque §38 y el catch-all no hay otro `match` (ni colecciones sueltas)
    expect(reglas.slice(desdeBloque, reglas.indexOf('match /{document=**}')).indexOf('match /')).toBe(-1);
  });

  it('F.3 ningún test toca Firebase real: el único `db` es el duplicado del mock', async () => {
    const m = await cargarAdaptador();
    const pub = publicacion();
    await m.guardarEstadoSindicacionFirestore(
      construirRegistroEstado({ portal: 'FOTOCASA', inmuebleId: 'inm-A', estado: 'PUBLICADO', operacion: 'publicar', resultado: 'OK', fecha: FECHA, publicacion: pub, propietarioId: 'prop-A' }),
    );
    expect(fs.llamadas.some((l) => (l[1] as string).includes('sindicacion_inmuebles'))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
