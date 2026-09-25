/**
 * GAP 5 · fase 2B — el panel de publicación consume el repositorio (circuito real).
 * ---------------------------------------------------------------------------------
 * Qué se prueba y con qué nivel de realidad:
 *  · El CIRCUITO (`crearCircuitoSindicacionPanel`, exportado desde el propio panel): es el
 *    código que el componente ejecuta, así que no hay una segunda implementación que
 *    aprobar — si el circuito cambia de comportamiento, el test se entera.
 *  · Con `vi.mock('firebase/firestore')` se ejercita el ADAPTADOR REAL
 *    (`src/lib/sindicacionFirestore.ts`) contra un Firestore de juguete que sí aplica los
 *    filtros de `where` y mantiene listeners vivos: se comprueba QUÉ consulta hace el
 *    panel, QUÉ documento escribe y si CIERRA la escucha al desmontar. Cero red (spy de
 *    `fetch`) y cero Firebase real.
 *  · Con un puerto en memoria inyectado se comprueba lo que el adaptador no puede
 *    simular: degradación cuando Firestore deniega y ausencia de listener cuando el
 *    puerto no lo ofrece.
 *
 * El `match /sindicacion_inmuebles` de `firestore.rules` se valida en
 * `tests/sindicacion-reglas-firestore.test.ts` (fuera del alcance de este fichero).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { HabitacionInmueble, Inmueble, PortalInmobiliario, PublicacionInmueble } from '../src/types';
import { buildPublicacionInmueble, identidadPublicacionPortal } from '../src/utils/publicacionEngine';

// ---------------------------------------------------------------------------
// Firestore de juguete: filtros aplicados + listeners vivos + auditoría
// ---------------------------------------------------------------------------
const fs = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  llamadas: [] as unknown[][],
  listeners: [] as { filtros: { campo: string; valor: unknown }[]; next: (snap: unknown) => void; cerrado: boolean; id: number }[],
  audita: [] as Record<string, unknown>[],
}));

// `vi.hoisted` no puede capturar variables del módulo: los filtros se guardan en el
// propio objeto de consulta y `fs.listeners` se rellena desde el mock de `onSnapshot`.
let siguienteListener = 0;

function claveDoc(id: string): string {
  return `sindicacion_inmuebles/${id}`;
}

interface SnapshotDoc { id: string; data: () => Record<string, unknown> }

function aplicarFiltros(filtros: { campo: string; valor: unknown }[]): SnapshotDoc[] {
  return [...fs.docs.entries()]
    .filter(([ruta]) => ruta.startsWith('sindicacion_inmuebles/'))
    .map(([ruta, data]) => ({ ruta, data }))
    .filter((d) => filtros.every((f) => d.data[f.campo] === f.valor))
    .sort((a, b) => (String(a.data.portal) < String(b.data.portal) ? -1 : 1))
    .map((d) => ({
      id: d.ruta.split('/')[1],
      data: () => JSON.parse(JSON.stringify(d.data)) as Record<string, unknown>,
    }));
}

const fabricarSnap = (items: SnapshotDoc[]) => ({
  empty: items.length === 0,
  size: items.length,
  docs: items,
  forEach: (cb: (d: SnapshotDoc) => void) => items.forEach(cb),
});

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, nombre: string) => ({ __col: nombre }),
  doc: (_db: unknown, nombre: string, id?: string) => {
    const ruta = id ? `${nombre}/${id}` : nombre;
    fs.llamadas.push(['doc', ruta]);
    return { __ruta: ruta };
  },
  setDoc: async (ref: { __ruta: string }, datos: Record<string, unknown>, opciones?: { merge?: boolean }) => {
    const previo = (fs.docs.get(ref.__ruta) || {}) as Record<string, unknown>;
    const copia = JSON.parse(JSON.stringify(opciones?.merge ? { ...previo, ...datos } : datos)) as Record<string, unknown>;
    fs.llamadas.push(['setDoc', ref.__ruta, copia, opciones]);
    fs.docs.set(ref.__ruta, copia);
    // el emulator real notifica a los listeners: aquí se notifica de forma síncrona
    for (const l of fs.listeners) {
      // MOCK HOSTIL a propósito: notifica también a quien ya se desuscribió. Así el test
      // sólo pasa si la guarda está en el código del adaptador/del circuito, no en el emulator.
      if (ref.__ruta !== claveDoc(String(copia.id))) continue;
      const filtros = (l as unknown as { filtros: { campo: string; valor: unknown }[] }).filtros || [];
      if (!filtros.every((f) => copia[f.campo] === f.valor)) continue;
      l.next(fabricarSnap(aplicarFiltros(filtros)));
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
  getDocs: async (q: { __col: string; __filtros: { campo: string; valor: unknown }[] }) => {
    fs.llamadas.push(['getDocs', q.__col, (q.__filtros || []).map((f) => `${f.campo}==${String(f.valor)}`).join(' & ')]);
    return fabricarSnap(aplicarFiltros(q.__filtros || []));
  },
  query: (col: { __col: string }, ...filtros: { __filtro: { campo: string; valor: unknown } }[]) => ({
    __col: col.__col,
    __filtros: filtros.map((f) => f.__filtro),
  }),
  where: (campo: string, _op: string, valor: unknown) => ({ __filtro: { campo, valor } }),
  onSnapshot: (
    q: { __col: string; __filtros: { campo: string; valor: unknown }[] },
    next: (snap: unknown) => void,
    _err: (e: unknown) => void,
  ) => {
    const listener = { filtros: q.__filtros || [], next, cerrado: false, id: siguienteListener++ };
    fs.listeners.push(listener as never);
    fs.llamadas.push(['onSnapshot', q.__col, (q.__filtros || []).map((f) => `${f.campo}==${String(f.valor)}`).join(' & ')]);
    next(fabricarSnap(aplicarFiltros(listener.filtros)));
    return () => {
      listener.cerrado = true;
      fs.llamadas.push(['unsubscribe']);
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
    fs.llamadas.push(['audit']);
    (fs.audita as Record<string, unknown>[]).push(JSON.parse(JSON.stringify(log)));
  },
  subscribeHabitacionesInmueble: (_id: string, _cb: (h: unknown[]) => void) => () => undefined,
}));

// lucide-react no aporta nada al circuito y pesa: se sustituye por iconos tontos.
vi.mock('lucide-react', () => ({
  Megaphone: () => null,
  Download: () => null,
  AlertTriangle: () => null,
  CheckCircle2: () => null,
  XCircle: () => null,
}));

import {
  crearCircuitoSindicacionPanel,
  filasDerivadasSindicacion,
  type FilaEstadoSindicacionPanel,
  type InfoHidratacionSindicacion,
} from '../src/components/PublicacionInmueblesPanel';
import { ESQUEMA_ESTADO_SINDICACION, construirRegistroEstado, type PuertoEstadoSindicacion, type RegistroEstadoSindicacion } from '../src/sindicacion/estadoRepositorio';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const FECHA = '2026-09-23T10:00:00.000Z';
const FECHA_2 = '2026-09-23T12:00:00.000Z';
const PORTALES: PortalInmobiliario[] = ['IDEALISTA', 'FOTOCASA', 'HABITACLIA', 'KYERO'];

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

const publicacionDe = (p: Partial<Inmueble> = {}, habitaciones?: HabitacionInmueble[]): PublicacionInmueble =>
  buildPublicacionInmueble(inm(p), habitaciones);

const fetchSpy = vi.fn();
beforeAll(() => vi.stubGlobal('fetch', fetchSpy));

function limpiar() {
  fs.docs.clear();
  fs.llamadas.length = 0;
  fs.listeners.length = 0;
  fs.audita.length = 0;
  fetchSpy.mockClear();
}
afterEach(limpiar);

/** Panel simulado: captura lo que el componente pintaría y permite empujar cambios. */
function crearPanel(opts: {
  inmuebleId?: string;
  portales?: PortalInmobiliario[];
  publicacion?: PublicacionInmueble | null;
  propietarioIdAlcance?: string;
  puerto?: PuertoEstadoSindicacion;
  fecha?: () => string;
} = {}) {
  const vistas: { filas: FilaEstadoSindicacionPanel[]; info: InfoHidratacionSindicacion }[] = [];
  const pub = opts.publicacion === undefined ? publicacionDe() : opts.publicacion;
  const circuito = crearCircuitoSindicacionPanel({
    inmuebleId: opts.inmuebleId || 'inm-A',
    portales: opts.portales || PORTALES,
    publicacion: () => pub,
    actor: { id: 'u1', nombre: 'Ana', email: 'ana@erp.test' },
    ...(opts.propietarioIdAlcance ? { propietarioIdAlcance: opts.propietarioIdAlcance } : {}),
    ...(opts.puerto ? { puerto: opts.puerto } : {}),
    fecha: opts.fecha || (() => FECHA),
    onEstados: (filas, info) => vistas.push({ filas, info }),
  });
  return { circuito, vistas, ultima: () => vistas[vistas.length - 1] };
}

/** Puerto en memoria con fallos selectivos (para probar la degradación). */
function crearPuertoMemoria(opts: { fallaTodo?: boolean; sinListener?: boolean; seed?: RegistroEstadoSindicacion[] } = {}) {
  const docs = new Map<string, RegistroEstadoSindicacion>();
  for (const r of opts.seed || []) docs.set(r.id, r);
  const escribir = vi.fn(async (registro: RegistroEstadoSindicacion) => {
    if (opts.fallaTodo) throw new Error('permission-denied: Missing or insufficient permissions.');
    const previo = docs.get(registro.id);
    docs.set(registro.id, JSON.parse(JSON.stringify(registro)));
    return previo ? ('ACTUALIZADO' as const) : ('CREADO' as const);
  });
  const listeners: (() => void)[] = [];
  const suscribir = vi.fn((inmuebleId: string, cb: (e: RegistroEstadoSindicacion[]) => void) => {
    const emitir = () => cb([...docs.values()].filter((r) => r.inmuebleId === inmuebleId));
    emitir();
    listeners.push(emitir);
    return () => undefined;
  });
  const puerto: PuertoEstadoSindicacion = {
    async leerEstado(inmuebleId, portal) {
      if (opts.fallaTodo) throw new Error('permission-denied');
      const d = docs.get(identidadPublicacionPortal(inmuebleId, portal).externalId);
      return d ? (JSON.parse(JSON.stringify(d)) as RegistroEstadoSindicacion) : null;
    },
    async listarEstados(inmuebleId) {
      if (opts.fallaTodo) throw new Error('permission-denied');
      return [...docs.values()].filter((r) => r.inmuebleId === inmuebleId).map((r) => JSON.parse(JSON.stringify(r)) as RegistroEstadoSindicacion);
    },
    escribirEstado: escribir as PuertoEstadoSindicacion['escribirEstado'],
    ...(opts.sinListener ? {} : { suscribirEstados: suscribir as unknown as PuertoEstadoSindicacion['suscribirEstados'] }),
  };
  return { puerto, docs, escribir, suscribir, listeners };
}

const semilla = (portal: PortalInmobiliario, over: Partial<RegistroEstadoSindicacion> = {}): RegistroEstadoSindicacion => {
  const pub = publicacionDe();
  const base = construirRegistroEstado({
    portal,
    inmuebleId: over.inmuebleId || 'inm-A',
    estado: 'BORRADOR',
    operacion: 'inicializar',
    resultado: 'OK',
    fecha: FECHA,
    publicacion: over.inmuebleId ? undefined : pub,
    propietarioId: 'prop-A',
  });
  return { ...base, ...over };
};

// ===========================================================================
describe('PANEL · P1. Monta, carga e hidrata desde el repositorio', () => {
  it('P.1 al montar: lee por propietario+inmueble e inicializa un documento por portal', async () => {
    const { circuito, ultima } = crearPanel({ propietarioIdAlcance: 'prop-A' });
    const info = await circuito.inicializar();

    // consulta real del adaptador: el filtro por propietarioId es lo que hace legal el `list`
    const lectura = fs.llamadas.find((l) => l[0] === 'getDocs') as [string, string, string];
    expect(lectura[1]).toBe('sindicacion_inmuebles');
    expect(lectura[2]).toBe('inmuebleId==inm-A & propietarioId==prop-A');

    expect(info.persistido).toBe(true);
    expect(info.aviso).toBe(null);
    expect(info.creados.sort()).toEqual([...PORTALES].sort());
    expect(info.preexistentes).toEqual([]);
    expect(fs.docs.size).toBe(4);
    for (const portal of PORTALES) {
      const ruta = claveDoc(identidadPublicacionPortal('inm-A', portal).externalId);
      const doc = fs.docs.get(ruta)!;
      expect(doc.portal).toBe(portal);
      expect(doc.inmuebleId).toBe('inm-A');
      expect(doc.propietarioId).toBe('prop-A');
      expect(doc.estado).toBe('BORRADOR');
      expect(doc.ultimaOperacion).toBe('inicializar');
      expect(doc.esquema).toBe(ESQUEMA_ESTADO_SINDICACION);
      expect(doc.id).toBe(doc.externalId); // id = externalId, NUNCA idPublico
      expect(doc.clave).toBe(`${portal}:inm-A`);
    }
    const vista = ultima()!;
    expect(vista.filas.map((f) => f.portal).sort()).toEqual([...PORTALES].sort());
    expect(vista.filas.every((f) => f.origen === 'repositorio')).toBe(true);
  });

  it('P.2 los estados persistidos aparecen en el panel tal cual (con versión y última operación)', async () => {
    const semillaPublicado = {
      ...semilla('KYERO'),
      estado: 'PUBLICADO' as const,
      ultimaOperacion: 'publicar' as const,
      ultimoResultado: 'OK' as const,
      version: 3,
      etiquetaVersion: 'v3·abc',
      hashContenido: 'b'.repeat(64),
      idAnuncioPortal: 'kyero-555',
    };
    fs.docs.set(claveDoc(semillaPublicado.id), semillaPublicado as unknown as Record<string, unknown>);
    const f = crearPuertoMemoria();
    f.docs.set(semillaPublicado.id, semillaPublicado);

    for (const puerto of [f.puerto, undefined]) {
      limpiar();
      fs.docs.set(claveDoc(semillaPublicado.id), semillaPublicado as unknown as Record<string, unknown>);
      const { circuito, ultima } = crearPanel({ ...(puerto ? { puerto } : {}) });
      const info = await circuito.inicializar();
      const fila = ultima()!.filas.find((x) => x.portal === 'KYERO')!;
      expect(fila.estado).toBe('PUBLICADO');
      expect(fila.version).toBe(3);
      expect(fila.etiquetaVersion).toBe('v3·abc');
      expect(fila.idAnuncioPortal).toBe('kyero-555');
      expect(fila.origen).toBe('repositorio');
      expect(info.preexistentes).toEqual(['KYERO']);
      // lo seed (KYERO) se respetó y los otros tres portales se crearon: 4 documentos
      expect(info.persistidos).toBe(4);
      expect(info.creados.sort()).toEqual(['FOTOCASA', 'HABITACLIA', 'IDEALISTA', 'KYERO'].filter((x) => x !== 'KYERO').sort());
      expect((fs.docs.get(claveDoc(semillaPublicado.id))!.version as number)).toBe(3);
    }
  });

  it('P.3 separación entre inmuebles: el panel de inm-A no pinta nada de inm-B', async () => {
    const b = semilla('IDEALISTA', { inmuebleId: 'inm-B' });
    fs.docs.set(claveDoc(b.id), { ...b, idPublico: 'pub_b' } as unknown as Record<string, unknown>);
    const { circuito, ultima } = crearPanel({ inmuebleId: 'inm-A' });
    await circuito.inicializar();
    const filas = ultima()!.filas;
    // el panel de inm-A sólo conoce inmuebles de inm-A: ni una fila trae datos de inm-B
    expect(filas.every((f) => f.inmuebleId === 'inm-A')).toBe(true);
    expect(filas.some((f) => f.idPublico === 'pub_b')).toBe(false);
    expect(ultima()!.info.preexistentes).toEqual([]); // nada previo SUYO
    // y el documento de inm-B sigue intacto (el panel no lo tocó)
    expect((fs.docs.get(claveDoc(b.id))! as Record<string, unknown>).inmuebleId).toBe('inm-B');
  });

  it('P.4 la lectura sin alcance de propietario va por inmueble (camino de la administración)', async () => {
    const { circuito } = crearPanel();
    await circuito.inicializar();
    const lectura = fs.llamadas.find((l) => l[0] === 'getDocs') as [string, string, string];
    expect(lectura[2]).toBe('inmuebleId==inm-A');
  });
});

describe('PANEL · P5-P6. Escucha viva y limpieza', () => {
  it('P.5 el listener actualiza el panel cuando Firestore cambia', async () => {
    const { circuito, ultima } = crearPanel();
    await circuito.inicializar();
    const antes = ultima()!.filas.find((f) => f.portal === 'IDEALISTA')!;
    expect(antes.estado).toBe('BORRADOR');

    const ruta = claveDoc(identidadPublicacionPortal('inm-A', 'IDEALISTA').externalId);
    const escrito = await import('../src/lib/sindicacionFirestore').then((m) =>
      m.guardarEstadoSindicacionFirestore({
        ...(JSON.parse(JSON.stringify(fs.docs.get(ruta))) as RegistroEstadoSindicacion),
        estado: 'LISTO_PARA_PUBLICAR',
        ultimaOperacion: 'validar',
        ultimoResultado: 'OK',
        actualizadoEn: FECHA_2,
        ultimaSincronizacion: FECHA_2,
      }),
    );
    expect(escrito.escritura).toBe('ACTUALIZADO');
    // el mock notifica a los listeners en cada setDoc: el panel ya se repintó solo
    expect(ultima()!.filas.find((f) => f.portal === 'IDEALISTA')!.estado).toBe('LISTO_PARA_PUBLICAR');
    // y el resto de portales no se enteró
    expect(ultima()!.filas.filter((f) => f.portal !== 'IDEALISTA' && f.estado !== 'BORRADOR')).toHaveLength(0);
  });

  it('P.6 al desmontar se cierra la escucha: ni un listener vivo ni emisiones posteriores', async () => {
    const { circuito, vistas, ultima } = crearPanel();
    await circuito.inicializar();
    expect(fs.listeners.some((l) => !l.cerrado)).toBe(true);
    const vistasAntes = vistas.length;

    circuito.disposar();
    expect(fs.listeners.every((l) => l.cerrado)).toBe(true);
    expect(fs.llamadas.filter((l) => l[0] === 'unsubscribe').length).toBe(1);

    // un cambio posterior al desmontaje NO debe repintar el panel (aunque el servidor emita)
    const ruta = claveDoc(identidadPublicacionPortal('inm-A', 'KYERO').externalId);
    fs.docs.set(ruta, { ...(fs.docs.get(ruta) || {}), estado: 'PUBLICADO' });
    for (const l of fs.listeners) l.next(fabricarSnap(aplicarFiltros(l.filtros)));
    expect(vistas.length).toBe(vistasAntes);
    expect(ultima()!.filas.find((f) => f.portal === 'KYERO')!.estado).not.toBe('PUBLICADO');

    // idempotente y sin operaciones tras el cierre
    circuito.disposar();
    expect(fs.llamadas.filter((l) => l[0] === 'unsubscribe').length).toBe(1);
    expect(await circuito.registrarValidacion({ portal: 'KYERO', ok: true })).toBe(null);
  });
});

describe('PANEL · P7-P10. La acción existente persiste el resultado real', () => {
  it('P.7 «Validar y generar feed» persiste en Firestore y traza en audit_logs', async () => {
    const { circuito } = crearPanel();
    await circuito.inicializar();
    const r = await circuito.registrarValidacion({ portal: 'IDEALISTA', ok: true });
    expect(r).toBeTruthy();
    expect(r!.escritura).toBe('ACTUALIZADO');
    const doc = fs.docs.get(claveDoc(r!.externalId))!;
    expect(doc.estado).toBe('LISTO_PARA_PUBLICAR');
    expect(doc.ultimaOperacion).toBe('validar');
    expect(doc.ultimoResultado).toBe('OK');
    expect(doc.version).toBeUndefined(); // un hito local NO estampa versión publicada
    expect(doc.hashContenido).toBeUndefined();

    const auditoria = fs.audita[fs.audita.length - 1];
    expect(auditoria.accion).toBe('SINDICACION_VALIDAR');
    expect(auditoria.entidadAfectada).toBe('inmueble');
    expect(auditoria.idAfectado).toBe('inm-A');
    const detalles = auditoria.detalles as Record<string, unknown>;
    expect(detalles.clave).toBe('IDEALISTA:inm-A');
    expect(detalles.operacion).toBe('validar');
    // un hito local no estampa versión publicada en la trazabilidad, y no viaja ningún secreto
    expect(detalles.version ?? null).toBe(null);
    expect(detalles.accionSindicacion).toBe('NUEVO');
    expect(Object.keys(detalles).some((k) => /token|apiKey|secret|password/i.test(k))).toBe(false);
  });

  it('P.8 repetir la misma validación no vuelve a escribir (SIN_CAMBIOS, cero auditoría nueva)', async () => {
    const { circuito } = crearPanel();
    await circuito.inicializar();
    const primera = await circuito.registrarValidacion({ portal: 'IDEALISTA', ok: true });
    expect(primera!.escritura).toBe('ACTUALIZADO');
    const setDocs = fs.llamadas.filter((l) => l[0] === 'setDoc').length;
    const auditoria = fs.audita.length;

    const segunda = await circuito.registrarValidacion({ portal: 'IDEALISTA', ok: true });
    expect(segunda!.escritura).toBe('SIN_CAMBIOS');
    expect(fs.llamadas.filter((l) => l[0] === 'setDoc').length).toBe(setDocs);
    expect(fs.audita.length).toBe(auditoria);
  });

  it('P.9 el fallo del feed queda reflejado como ERROR sin tocar lo publicado', async () => {
    const { circuito } = crearPanel();
    await circuito.inicializar();
    const r = await circuito.registrarValidacion({ portal: 'FOTOCASA', ok: false, codigo: 'FEED_NO_GENERADO', mensaje: 'Formato no soportado' });
    const doc = fs.docs.get(claveDoc(r!.externalId))!;
    expect(doc.estado).toBe('ERROR');
    expect(doc.ultimoResultado).toBe('ERROR');
    expect(doc.ultimoError).toBe('Formato no soportado');
    expect(doc.ultimoCodigo).toBe('FEED_NO_GENERADO');
    expect(doc.version).toBeUndefined();
    const auditoria = fs.audita[fs.audita.length - 1];
    expect(auditoria.accion).toBe('SINDICACION_VALIDAR');
    expect(auditoria.resultado).toBe('ERROR');
    expect(String(auditoria.descripcion)).toContain('ERROR');
    expect((auditoria.detalles as Record<string, unknown>).ultimoCodigo ?? 'FEED_NO_GENERADO').toBe('FEED_NO_GENERADO');
  });

  it('P.10 un portal ya publicado no se revierte por validar otra vez (hito sobre lo publicado)', async () => {
    const publicado = {
      ...semilla('KYERO'),
      estado: 'PUBLICADO' as const,
      ultimaOperacion: 'publicar' as const,
      ultimoResultado: 'OK' as const,
      version: 2,
      hashContenido: 'c'.repeat(64),
    };
    fs.docs.set(claveDoc(publicado.id), publicado as unknown as Record<string, unknown>);
    const f = crearPuertoMemoria({ seed: [publicado] });
    const { circuito, ultima } = crearPanel({ puerto: f.puerto });
    await circuito.inicializar();
    const r = await circuito.registrarValidacion({ portal: 'KYERO', ok: true });
    expect(r!.estado).toBe('PUBLICADO');
    expect(r!.registro.ultimaOperacion).toBe('validar');
    expect(r!.registro.version).toBe(2); // conserva la versión que sigue viva en el portal
    expect(r!.registro.hashContenido).toBe('c'.repeat(64));
    expect(ultima()!.filas.find((x) => x.portal === 'KYERO')!.estado).toBe('PUBLICADO');
  });
});

describe('PANEL · P11-P13. El panel habla con el puerto, no con Firebase', () => {
  it('P.11 el circuito funciona con cualquier implementación del puerto', async () => {
    const f = crearPuertoMemoria();
    const { circuito, ultima } = crearPanel({ puerto: f.puerto });
    const info = await circuito.inicializar();
    expect(info.persistido).toBe(true);
    expect(f.escribir).toHaveBeenCalledTimes(4); // un documento por portal
    expect(f.suscribir).toHaveBeenCalledTimes(1);
    expect(fs.llamadas.length).toBe(0); // ni un solo toque de Firestore
    await circuito.registrarValidacion({ portal: 'IDEALISTA', ok: true });
    const fila = ultima()!.filas.find((x) => x.portal === 'IDEALISTA')!;
    expect(fila.estado).toBe('LISTO_PARA_PUBLICAR');
    expect(f.docs.get(identidadPublicacionPortal('inm-A', 'IDEALISTA').externalId)!.ultimaOperacion).toBe('validar');
    circuito.disposar();
  });

  it('P.12 si Firestore deniega, el panel no revienta: pinta el estado derivado y avisa', async () => {
    const f = crearPuertoMemoria({ fallaTodo: true });
    const { circuito, ultima } = crearPanel({ puerto: f.puerto });
    const info = await circuito.inicializar();
    expect(info.persistido).toBe(false);
    expect(info.aviso).toContain('No se pudo inicializar el estado persistido');
    const filas = ultima()!.filas;
    expect(filas).toHaveLength(4);
    expect(filas.every((x) => x.origen === 'deriva' && x.estado === 'BORRADOR')).toBe(true);
    expect(filas.every((x) => x.operacionesRegistradas === 0)).toBe(true);
    // y la acción del usuario no lanza: avisa y sigue (el feed se pudo generar igualmente)
    const r = await circuito.registrarValidacion({ portal: 'IDEALISTA', ok: true });
    expect(r).toBe(null);
    expect(ultima()!.info.persistido).toBe(false);
    expect(ultima()!.info.aviso).toContain('El estado no se pudo guardar');
    circuito.disposar();
  });

  it('P.13 un puerto sin listener no deja el circuito colgado (hidrata por lectura)', async () => {
    const f = crearPuertoMemoria({ sinListener: true });
    const { circuito } = crearPanel({ puerto: f.puerto });
    const info = await circuito.inicializar();
    expect(info.persistido).toBe(true);
    expect(f.suscribir).not.toHaveBeenCalled();
    circuito.disposar();
    expect(fs.listeners.length).toBe(0);
  });

  it('P.14 filas de arranque: proyección derivada del inmueble, no un estado inventado', () => {
    const filas = filasDerivadasSindicacion('inm-A', PORTALES);
    expect(filas).toHaveLength(4);
    expect(filas.every((f) => f.origen === 'deriva' && f.estado === 'BORRADOR' && f.operacionesRegistradas === 0)).toBe(true);
    expect(filas.find((f) => f.portal === 'IDEALISTA')!.externalId).toBe(identidadPublicacionPortal('inm-A', 'IDEALISTA').externalId);
  });
});

describe('PANEL · P15. Ciclo de vida de una operación en vuelo', () => {
  it('P.15 una operación en vuelo no repinta después del desmontaje', async () => {
    // es la guarda `cerrado` del circuito: sin ella, una escritura que termina tarde llamaría
    // al callback de un componente que ya no existe (estado fantasma + warning de React)
    const { circuito, vistas } = crearPanel({ propietarioIdAlcance: 'prop-A' });
    await circuito.inicializar();
    const previas = vistas.length;
    expect(previas).toBeGreaterThan(0);
    const vuelo = circuito.registrarValidacion({ portal: 'KYERO', ok: true });
    circuito.disposar();
    await vuelo;
    expect(vistas.length).toBe(previas); // ni un repintado nuevo tras disposar()
  });
});

describe('PANEL · I. Integridad de la conexión (Fase 1, Fase 2 y contrato del panel)', () => {
  const panelPath = path.resolve(__dirname, '../src/components/PublicacionInmueblesPanel.tsx');
  const panel = readFileSync(panelPath, 'utf8');
  const sinComentarios = (codigo: string): string => codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const codigo = sinComentarios(panel);

  it('I.1 el panel no importa el SDK de Firebase: toda la E/S pasa por el adaptador y el puerto', () => {
    expect(codigo).not.toContain("from 'firebase/"); // el SDK, ni directo ni por alias
    // `../lib/firebase` sólo puede aportar lo que ya aportaba antes de esta fase (rooms);
    // nunca la instancia `db` ni los primitivos de Firestore.
    const importaciones = [...codigo.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/lib\/firebase'/g)].map((m) => m[1].trim());
    expect(importaciones.length).toBeGreaterThan(0);
    for (const bruto of importaciones) {
      const nombres = bruto.split(',').map((x) => x.trim()).filter(Boolean);
      expect(nombres.sort()).toEqual(['subscribeHabitacionesInmueble']);
    }
    expect(codigo).not.toMatch(/\b(collection|setDoc|getDocs|getDoc|onSnapshot|deleteDoc)\s*\(/);
    expect(codigo).not.toMatch(/\bdb\b\s*\)/);
    expect(codigo).toContain('crearRepositorioEstadoSindicacionFirestore');
    expect(codigo).toContain('suscribirEstados');
    expect(codigo).toContain('disposar');
  });

  it('I.2 el `useState` dejó de ser la fuente de verdad del estado de sindicación', () => {
    expect(codigo).not.toContain('useState<Record<string, EstadoSindicacionPortal>');
    expect(codigo).not.toMatch(/setEstados\s*\(/);
    expect(codigo).not.toMatch(/aplicarEstadoPublicacion\s*\(/); // nada de transiciones locales
    expect(codigo).toContain('useState<FilaEstadoSindicacionPanel[]>');
    // la única vía de entrada del estado en el componente es el callback del circuito
    expect(codigo.match(/setFilas\s*\(/g)!.length).toBe(2); // inicialización vacía + onEstados
    expect(codigo).toContain('onEstados: (nuevas, nuevaInfo) =>');
  });

  it('I.3 no hay una segunda implementación de persistencia dentro del componente', () => {
    // el componente no construye registros a mano: delega en las funciones del dominio
    expect(codigo).not.toContain('construirRegistroEstado');
    expect(codigo).not.toContain('verificarInvariantesDelRegistro');
    expect(codigo).not.toContain('ESQUEMA_ESTADO_SINDICACION');
    expect(codigo).not.toContain('huellaDeEstado');
    expect(codigo).not.toContain('idDelEvento');
    expect(codigo).not.toContain('guardarEstadoSindicacionFirestore'); // sólo a través del puerto
    // y no escribe en ninguna colección que no sea la del puerto
    expect(codigo).not.toContain('sindicacion_inmuebles');
    expect(codigo).not.toContain('audit_logs');
  });

  it('I.4 la identidad sigue siendo PORTAL:inmuebleId y el documento sigue siendo el externalId', async () => {
    const { circuito } = crearPanel();
    await circuito.inicializar();
    for (const portal of PORTALES) {
      const esperada = identidadPublicacionPortal('inm-A', portal);
      const doc = fs.docs.get(claveDoc(esperada.externalId))!;
      expect(doc, portal).toBeTruthy();
      expect(doc.id).toBe(esperada.externalId);
      expect(doc.clave).toBe(esperada.clave);
      expect(String(doc.clave)).toBe(`${portal}:inm-A`);
      // idPublico es un dato del registro, jamás la clave del documento
      expect(fs.docs.has(claveDoc(String(doc.idPublico)))).toBe(false);
    }
  });

  it('I.5 `EstadoSindicacionPortal` sigue siendo el contrato del motor (5 campos, sin tocar)', () => {
    const tipos = readFileSync(path.resolve(__dirname, '../src/types.ts'), 'utf8');
    const bloque = tipos.slice(tipos.indexOf('export interface EstadoSindicacionPortal'), tipos.indexOf('}', tipos.indexOf('export interface EstadoSindicacionPortal')));
    const campos = [...bloque.matchAll(/^\s{2}([A-Za-z]+)\??:/gm)].map((m) => m[1]);
    expect(campos.sort()).toEqual(['estado', 'externalId', 'portal', 'ultimaSincronizacion', 'ultimoError']);
  });

  it('I.6 ni el panel ni el adaptador duplican la lista de claves de credencial', () => {
    const definiciones = readFileSync(path.resolve(__dirname, '../src/sindicacion/adaptadores.ts'), 'utf8');
    expect((definiciones.match(/export const CLAVES_CREDENCIAL_PROHIBIDAS/g) || []).length).toBe(1);
    expect(codigo).not.toMatch(/CLAVES_CREDENCIAL|apiKey|accessToken/);
  });

  it('I.7 el dominio GAP 5 sigue sin depender de Firebase ni de copias del grafo de estados', () => {
    const directorio = path.resolve(__dirname, '../src/sindicacion');
    const archivos = ['estadoRepositorio.ts', 'idempotencia.ts', 'hashContenido.ts', 'validacion.ts', 'adaptadores.ts', 'index.ts'];
    for (const nombre of archivos) {
      const fuente = sinComentarios(readFileSync(path.join(directorio, nombre), 'utf8'));
      expect(fuente, nombre).not.toMatch(/from 'firebase/);
      expect(fuente, nombre).not.toMatch(/from '\.\.\/lib\/firebase'/);
      expect(fuente, nombre).not.toContain('TRANSICIONES_PUBLICACION');
      expect(fuente, nombre).not.toMatch(/\bnew Date\(|Date\.now|Math\.random/);
    }
  });

  it('I.8 ningún otro componente consume el adaptador (el punto de conexión sigue siendo uno)', () => {
    const dir = path.resolve(__dirname, '../src/components');
    const caminar = (d: string, acc: string[] = []): string[] => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { readdirSync } = require('node:fs') as typeof import('node:fs');
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) caminar(p, acc);
        else if (/\.tsx?$/.test(e.name)) acc.push(p);
      }
      return acc;
    };
    const queLoUsan = caminar(dir).filter((f) => readFileSync(f, 'utf8').includes('sindicacionFirestore'));
    expect(queLoUsan.map((f) => path.basename(f))).toEqual(['PublicacionInmueblesPanel.tsx']);
  });

  it('I.10 el montaje en `InmueblesSection` es GAP 5 puro: una línea, sin E/S ni estado propio', () => {
    const seccion = readFileSync(path.resolve(__dirname, '../src/components/sections/InmueblesSection.tsx'), 'utf8');
    expect(seccion.match(/import\s*\{\s*PublicacionInmueblesPanel\s*\}\s*from/g) || []).toHaveLength(1);
    const montajes = seccion.match(/<PublicacionInmueblesPanel[^>]*\/>/g) || [];
    expect(montajes).toHaveLength(1);
    // Sólo recibe contexto (inmueble + usuario): sin estados, puertos ni callbacks de datos.
    // Es lo que hace que el montaje sea una línea suelta y no el resultado de rehacer la sección.
    expect(montajes[0]).toBe('<PublicacionInmueblesPanel inmueble={selectedInmueble} currentUser={currentUser} />');
    // la sección NO se convierte en consumidora del adaptador (la E/S sigue siendo del panel)
    expect(seccion).not.toContain('sindicacionFirestore');
    // el panel tolera `inmueble` nulo: por eso el montaje puede ser incondicional
    const panelSrc = readFileSync(path.resolve(__dirname, '../src/components/PublicacionInmueblesPanel.tsx'), 'utf8');
    expect(panelSrc).toContain('inmueble?: Inmueble | null');
    expect(panelSrc).toContain('if (!inmueble) return null;');
  });

  it('I.9 cero red: ni un fetch en todo el circuito', async () => {
    const { circuito } = crearPanel();
    await circuito.inicializar();
    await circuito.registrarValidacion({ portal: 'IDEALISTA', ok: true });
    circuito.disposar();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
