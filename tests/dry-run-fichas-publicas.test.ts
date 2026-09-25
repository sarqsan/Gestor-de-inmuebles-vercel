/**
 * Tests del punto de invocación de SOLO LECTURA del backfill de fichas públicas
 * (`src/lib/dryRunFichasPublicas.ts`).
 *
 * Firestore se sustituye por una memoria en proceso: `getDocs`/`getDoc` leen de
 * ella y CUALQUIER primitiva de escritura, si llegara a invocarse, queda
 * registrada y hace fallar el test. No hay red ni credenciales.
 */
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Inmueble, UsuarioApp } from '../src/types';

const mem = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const escrituras: string[] = [];
  const lecturasFicha: string[] = [];
  const sesion: { email: string | null } = { email: 'sarqsan2@gmail.com' };
  /** Si está definido, `getDoc` de esa ficha lanza este error (simula permisos/red). */
  const fallosLectura = new Map<string, Error>();
  let llamadasGetDocs = 0;
  return {
    store,
    escrituras,
    lecturasFicha,
    sesion,
    fallosLectura,
    get llamadasGetDocs() {
      return llamadasGetDocs;
    },
    incGetDocs() {
      llamadasGetDocs++;
    },
    resetGetDocs() {
      llamadasGetDocs = 0;
    },
  };
});

vi.mock('firebase/firestore', () => {
  const escribir = (nombre: string) => async () => {
    mem.escrituras.push(nombre);
    throw new Error(`ESCRITURA PROHIBIDA EN DRY-RUN: ${nombre}`);
  };
  return {
    collection: (_db: unknown, col: string) => ({ __col: col }),
    doc: (_db: unknown, col: string, id: string) => ({ __col: col, __id: id }),
    getDocs: async (ref: { __col: string }) => {
      mem.incGetDocs();
      const docs = [...mem.store.entries()]
        .filter(([k]) => k.startsWith(`${ref.__col}/`))
        .map(([k, v]) => ({ id: k.slice(ref.__col.length + 1), data: () => v }));
      return { forEach: (fn: (d: { id: string; data: () => unknown }) => void) => docs.forEach(fn), size: docs.length };
    },
    getDoc: async (ref: { __col: string; __id: string }) => {
      const clave = `${ref.__col}/${ref.__id}`;
      mem.lecturasFicha.push(clave);
      const fallo = mem.fallosLectura.get(clave);
      if (fallo) throw fallo;
      const v = mem.store.get(clave);
      return { id: ref.__id, exists: () => v !== undefined, data: () => v };
    },
    onSnapshot: () => {
      throw new Error('onSnapshot no debe usarse en el DRY-RUN');
    },
    setDoc: escribir('setDoc'),
    updateDoc: escribir('updateDoc'),
    addDoc: escribir('addDoc'),
    deleteDoc: escribir('deleteDoc'),
    writeBatch: escribir('writeBatch'),
    runTransaction: escribir('runTransaction'),
  };
});

vi.mock('../src/lib/firebase', () => ({
  db: {},
  auth: {
    get currentUser() {
      return mem.sesion.email === null ? null : { email: mem.sesion.email };
    },
  },
}));

vi.mock('../src/lib/authService', () => ({ ADMIN_MASTER_EMAIL: 'sarqsan2@gmail.com' }));

import {
  ERROR_DRY_RUN_NO_AUTORIZADO,
  agruparIdsPorEstado,
  ejecutarDryRunFichasPublicas,
  leerFichaPublicaEstricta,
  listarInmueblesUnaVez,
  puedeEjecutarDryRunFichasPublicas,
  serializarInformeDryRun,
} from '../src/lib/dryRunFichasPublicas';
import { buildFichaPublicaInmueble, FICHAS_PUBLICAS_COL } from '../src/lib/fichaPublicaInmueble';
import { materializarFichasPublicas, type FichaPublicaRef } from '../src/lib/backfillFichasPublicas';

const AHORA = '2026-09-23T10:00:00.000Z';

const master: UsuarioApp = {
  id: 'u-master',
  nombre: 'Master',
  email: 'sarqsan2@gmail.com',
  tipoPerfil: 'ADMINISTRADOR',
  estado: 'ACTIVO',
  roles: [],
  permisos: [],
  createdAt: AHORA,
  updatedAt: AHORA,
};
const otroAdmin: UsuarioApp = { ...master, id: 'u-admin2', email: 'otro@example.com' };
const propietario: UsuarioApp = { ...master, id: 'u-prop', tipoPerfil: 'PROPIETARIO', propietarioId: 'P1' };
const inquilino: UsuarioApp = { ...master, id: 'u-inq', tipoPerfil: 'INQUILINO', email: 'inq@example.com' };

function inmueble(id: string, extra: Partial<Inmueble> = {}): Inmueble {
  return {
    id,
    direccion: `Calle ${id}`,
    ciudad: 'Madrid',
    precio: 900,
    estado: 'disponible',
    habitaciones: 2,
    banos: 1,
    superficie: 70,
    fianzaMeses: 1,
    propietarioId: 'P1',
    ...extra,
  } as Inmueble;
}

function sembrar(inmuebles: Inmueble[], fichas: Array<Record<string, unknown>> = []) {
  mem.store.clear();
  for (const i of inmuebles) {
    const { id, ...resto } = i as unknown as Record<string, unknown>;
    mem.store.set(`inmuebles/${String(id)}`, resto);
  }
  for (const f of fichas) mem.store.set(`${FICHAS_PUBLICAS_COL}/${String(f.id)}`, f);
}

beforeEach(() => {
  mem.store.clear();
  mem.escrituras.length = 0;
  mem.lecturasFicha.length = 0;
  mem.fallosLectura.clear();
  mem.resetGetDocs();
  mem.sesion.email = 'sarqsan2@gmail.com';
});

afterEach(() => {
  // Invariante global de la suite: NINGUNA primitiva de escritura fue invocada.
  expect(mem.escrituras).toEqual([]);
});

describe('dry-run fichas públicas · autorización', () => {
  it('solo el master (ADMINISTRADOR + email principal + sesión Auth) puede invocarlo', () => {
    expect(puedeEjecutarDryRunFichasPublicas(master, 'sarqsan2@gmail.com')).toBe(true);
    expect(puedeEjecutarDryRunFichasPublicas(master, ' SARQSAN2@GMAIL.COM ')).toBe(true);
    expect(puedeEjecutarDryRunFichasPublicas(otroAdmin, 'otro@example.com')).toBe(false);
    expect(puedeEjecutarDryRunFichasPublicas(propietario, 'sarqsan2@gmail.com')).toBe(false);
    expect(puedeEjecutarDryRunFichasPublicas(inquilino, 'inq@example.com')).toBe(false);
    expect(puedeEjecutarDryRunFichasPublicas(null)).toBe(false);
    expect(puedeEjecutarDryRunFichasPublicas(undefined)).toBe(false);
    // Perfil correcto pero sesión Auth de otra cuenta (las reglas evalúan la sesión).
    expect(puedeEjecutarDryRunFichasPublicas(master, 'otro@example.com')).toBe(false);
    expect(puedeEjecutarDryRunFichasPublicas(master, null)).toBe(false);
  });

  it('un usuario no master recibe DRY_RUN_NO_AUTORIZADO ANTES de cualquier lectura', async () => {
    sembrar([inmueble('INM-1')]);
    for (const u of [otroAdmin, propietario, inquilino, null]) {
      await expect(ejecutarDryRunFichasPublicas(u, { ahoraIso: AHORA })).rejects.toThrow(ERROR_DRY_RUN_NO_AUTORIZADO);
    }
    expect(mem.llamadasGetDocs).toBe(0);
    expect(mem.lecturasFicha).toEqual([]);
  });

  it('perfil master sin sesión Firebase Auth (o con otra) → no autorizado, sin lecturas', async () => {
    sembrar([inmueble('INM-1')]);
    mem.sesion.email = null;
    await expect(ejecutarDryRunFichasPublicas(master, { ahoraIso: AHORA })).rejects.toThrow(ERROR_DRY_RUN_NO_AUTORIZADO);
    mem.sesion.email = 'otro@example.com';
    await expect(ejecutarDryRunFichasPublicas(master, { ahoraIso: AHORA })).rejects.toThrow(ERROR_DRY_RUN_NO_AUTORIZADO);
    expect(mem.llamadasGetDocs).toBe(0);
  });
});

describe('dry-run fichas públicas · lectura única y solo lectura', () => {
  it('listarInmueblesUnaVez usa getDocs (una sola vez) y devuelve id + datos', async () => {
    sembrar([inmueble('INM-1'), inmueble('INM-2', { propietarioId: 'P2' })]);
    const lista = await listarInmueblesUnaVez();
    expect(lista.map((i) => i.id).sort()).toEqual(['INM-1', 'INM-2']);
    expect(lista.find((i) => i.id === 'INM-2')?.propietarioId).toBe('P2');
    expect(mem.llamadasGetDocs).toBe(1);
  });

  it('el DRY-RUN completo nunca invoca una primitiva de escritura y lee inmuebles una sola vez', async () => {
    const i1 = inmueble('INM-1');
    const fichaViva = buildFichaPublicaInmueble(i1, AHORA)!;
    sembrar([i1, inmueble('INM-2'), inmueble('INM-3', { propietarioId: undefined })], [fichaViva as unknown as Record<string, unknown>]);
    const r = await ejecutarDryRunFichasPublicas(master, { ahoraIso: AHORA });
    expect(r.modo).toBe('DRY_RUN');
    expect(r.informe.modo).toBe('DRY_RUN');
    expect(r.informe.autorizado).toBe(false); // el motor marca 'no autorizado a escribir'
    expect(r.informe.escrituras).toBe(0);
    expect(mem.escrituras).toEqual([]);
    expect(mem.llamadasGetDocs).toBe(1);
    // La memoria no cambió: mismas claves y mismos valores.
    expect([...mem.store.keys()].sort()).toEqual(['fichas_publicas_inmueble/INM-1', 'inmuebles/INM-1', 'inmuebles/INM-2', 'inmuebles/INM-3']);
  });

  it('no se puede activar `ejecutar:true` por accidente: la opción se ignora y sigue sin escribir', async () => {
    sembrar([inmueble('INM-1'), inmueble('INM-2')]);
    const opcionesConFlagIlegitimo = { ahoraIso: AHORA, ejecutar: true } as unknown as Parameters<typeof ejecutarDryRunFichasPublicas>[1];
    const r = await ejecutarDryRunFichasPublicas(master, opcionesConFlagIlegitimo);
    expect(r.modo).toBe('DRY_RUN');
    expect(r.resumen.aCrear).toBe(2);
    expect(r.informe.escrituras).toBe(0);
    expect(mem.escrituras).toEqual([]);
    expect(mem.store.has('fichas_publicas_inmueble/INM-1')).toBe(false);
  });

  it('un `deps.escribirFicha` inyectado no otorga capacidad de escritura al DRY-RUN', async () => {
    sembrar([inmueble('INM-1')]);
    const escritor = vi.fn(async () => undefined);
    const deps = { escribirFicha: escritor } as unknown as Parameters<typeof ejecutarDryRunFichasPublicas>[1] extends infer O
      ? O extends { deps?: infer D } ? D : never
      : never;
    const r = await ejecutarDryRunFichasPublicas(master, { ahoraIso: AHORA, deps });
    expect(r.resumen.aCrear).toBe(1);
    expect(escritor).not.toHaveBeenCalled();
  });
});

describe('dry-run fichas públicas · propagación de errores de lectura', () => {
  it('leerFichaPublicaEstricta devuelve null solo si NO existe y propaga cualquier error', async () => {
    sembrar([], [{ id: 'F-OK', inmuebleId: 'F-OK', propietarioId: 'P1' }]);
    expect(await leerFichaPublicaEstricta('F-OK')).toMatchObject({ id: 'F-OK', propietarioId: 'P1' });
    expect(await leerFichaPublicaEstricta('NO-EXISTE')).toBeNull();
    expect(await leerFichaPublicaEstricta('')).toBeNull();
    mem.fallosLectura.set(`${FICHAS_PUBLICAS_COL}/F-DENEGADA`, new Error('Missing or insufficient permissions.'));
    await expect(leerFichaPublicaEstricta('F-DENEGADA')).rejects.toThrow('Missing or insufficient permissions.');
  });

  it('un error de permisos/red al leer una ficha se clasifica como ERROR·lectura_ficha_fallo y NUNCA como CREAR', async () => {
    sembrar([inmueble('INM-OK'), inmueble('INM-DENEGADO'), inmueble('INM-RED')]);
    mem.fallosLectura.set(`${FICHAS_PUBLICAS_COL}/INM-DENEGADO`, new Error('Missing or insufficient permissions.'));
    mem.fallosLectura.set(`${FICHAS_PUBLICAS_COL}/INM-RED`, new Error('unavailable: network'));
    const r = await ejecutarDryRunFichasPublicas(master, { ahoraIso: AHORA });
    expect(r.resumen.ids.CREAR).toEqual(['INM-OK']);
    expect(r.resumen.ids.ERROR.sort()).toEqual(['INM-DENEGADO', 'INM-RED']);
    expect(r.resumen.errores).toBe(2);
    const porId = Object.fromEntries(r.informe.errores.map((e) => [e.inmuebleId, e]));
    expect(porId['INM-DENEGADO'].motivo).toBe('lectura_ficha_fallo');
    expect(porId['INM-DENEGADO'].error).toContain('insufficient permissions');
    expect(porId['INM-RED'].motivo).toBe('lectura_ficha_fallo');
    // El error en un inmueble no aborta el lote.
    expect(r.resumen.N).toBe(3);
  });

  it('contraste: el lector canónico silenciaría el mismo error (motivo por el que el DRY-RUN no lo usa)', async () => {
    const { getFichaPublicaInmueble } = await import('../src/lib/fichaPublicaInmueble');
    mem.fallosLectura.set(`${FICHAS_PUBLICAS_COL}/X`, new Error('Missing or insufficient permissions.'));
    expect(await getFichaPublicaInmueble('X')).toBeNull();
  });

  it('un fallo al listar inmuebles se propaga (no se devuelve un informe vacío engañoso)', async () => {
    await expect(
      ejecutarDryRunFichasPublicas(master, {
        ahoraIso: AHORA,
        listarInmuebles: async () => {
          throw new Error('Missing or insufficient permissions.');
        },
      }),
    ).rejects.toThrow('insufficient permissions');
  });
});

describe('dry-run fichas públicas · contadores e ids por categoría', () => {
  it('N, aCrear, aActualizar, alDia, noAptos y errores coinciden con el motor y los ids están agrupados', async () => {
    const alDia = inmueble('INM-ALDIA');
    const obsoleto = inmueble('INM-OBS');
    const fichaAlDia = buildFichaPublicaInmueble(alDia, '2025-01-01T00:00:00.000Z')!; // actualizadoEn distinto → sigue AL_DIA
    const fichaObsoleta = { ...buildFichaPublicaInmueble(obsoleto, AHORA)!, precio: 1 };
    sembrar(
      [alDia, obsoleto, inmueble('INM-NUEVA-1'), inmueble('INM-NUEVA-2'), inmueble('INM-SINTIT', { propietarioId: undefined }), inmueble('INM-ERR')],
      [fichaAlDia as unknown as Record<string, unknown>, fichaObsoleta as unknown as Record<string, unknown>],
    );
    mem.fallosLectura.set(`${FICHAS_PUBLICAS_COL}/INM-ERR`, new Error('boom'));

    const r = await ejecutarDryRunFichasPublicas(master, { ahoraIso: AHORA });
    expect(r.resumen).toMatchObject({ N: 6, aCrear: 2, aActualizar: 1, alDia: 1, noAptos: 1, errores: 1 });
    expect(r.resumen.ids.CREAR.sort()).toEqual(['INM-NUEVA-1', 'INM-NUEVA-2']);
    expect(r.resumen.ids.ACTUALIZAR).toEqual(['INM-OBS']);
    expect(r.resumen.ids.AL_DIA).toEqual(['INM-ALDIA']);
    expect(r.resumen.ids.SIN_FICHA_POSIBLE).toEqual(['INM-SINTIT']);
    expect(r.resumen.ids.ERROR).toEqual(['INM-ERR']);
    // Coherencia con el informe del motor.
    expect(r.informe.inmueblesLeidos).toBe(6);
    expect(r.informe.aCrear + r.informe.aActualizar + r.informe.alDia).toBe(r.informe.aptos);
    expect(r.resumen.aCrear + r.resumen.aActualizar + r.resumen.alDia + r.resumen.noAptos + r.resumen.errores).toBe(r.resumen.N);
    expect(agruparIdsPorEstado(r.informe)).toEqual(r.resumen.ids);
    expect(r.ejecutadoPor).toBe('sarqsan2@gmail.com');
    expect(r.generadoEn).toBe(AHORA);
  });

  it('el informe serializado es JSON íntegro (items, errores, resumen, ids)', async () => {
    sembrar([inmueble('INM-1')]);
    const r = await ejecutarDryRunFichasPublicas(master, { ahoraIso: AHORA });
    const json = JSON.parse(serializarInformeDryRun(r));
    expect(json.modo).toBe('DRY_RUN');
    expect(json.resumen.ids.CREAR).toEqual(['INM-1']);
    expect(json.informe.items).toHaveLength(1);
    expect(json.informe.resumen).toContain('[DRY_RUN]');
  });

  it('soloInmuebleIds / limite acotan el lote sin escribir', async () => {
    sembrar([inmueble('A'), inmueble('B'), inmueble('C')]);
    const r1 = await ejecutarDryRunFichasPublicas(master, { ahoraIso: AHORA, soloInmuebleIds: ['B'] });
    expect(r1.resumen.N).toBe(1);
    expect(r1.resumen.ids.CREAR).toEqual(['B']);
    const r2 = await ejecutarDryRunFichasPublicas(master, { ahoraIso: AHORA, limite: 2 });
    expect(r2.resumen.N).toBe(2);
  });
});

/** Código fuente sin comentarios (los comentarios documentan lo que NO se hace y citan nombres). */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('dry-run fichas públicas · aislamiento respecto al motor de escritura', () => {
  it('el módulo de DRY-RUN no importa materializarFichasPublicas ni ninguna primitiva de escritura', async () => {
    const fuente = sinComentarios(await readFile(new URL('../src/lib/dryRunFichasPublicas.ts', import.meta.url), 'utf8'));
    expect(fuente).not.toMatch(/materializarFichasPublicas/);
    expect(fuente).not.toMatch(/\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction|onSnapshot)\b/);
    expect(fuente).not.toMatch(/ejecutar\s*:\s*true/);
    expect(fuente).toMatch(/analizarFichasPublicas/);
    expect(fuente).toMatch(/getDocs\(collection\(db, INMUEBLES_COL_NOMBRE\)\)/);
    // La única importación de firebase/firestore es de lecturas.
    const importFirestore = fuente.match(/import\s*\{([^}]*)\}\s*from\s*'firebase\/firestore'/);
    expect(importFirestore).not.toBeNull();
    expect(importFirestore![1].split(',').map((x) => x.trim()).filter(Boolean).sort()).toEqual(['collection', 'doc', 'getDoc', 'getDocs']);
  });

  it('el panel de UI tampoco importa el escritor ni primitivas de Firestore', async () => {
    const fuente = sinComentarios(await readFile(new URL('../src/components/admin/DryRunFichasPublicasPanel.tsx', import.meta.url), 'utf8'));
    expect(fuente).not.toMatch(/materializarFichasPublicas/);
    expect(fuente).not.toMatch(/from ['"]firebase/);
    expect(fuente).not.toMatch(/ejecutar\s*:\s*true/);
  });

  it('materializarFichasPublicas conserva su contrato: sin `ejecutar:true` no escribe y con él usa solo el escritor inyectado', async () => {
    const escritor = vi.fn(async () => undefined);
    const deps = {
      construir: (inm: Inmueble, ahora?: string): FichaPublicaRef | null => {
        const f = buildFichaPublicaInmueble(inm, ahora);
        return f ? { ...f } : null;
      },
      leerFicha: async (): Promise<FichaPublicaRef | null> => null,
      camposPublicos: (await import('../src/lib/fichaPublicaInmueble')).CAMPOS_FICHA_PUBLICA,
      escribirFicha: escritor,
    };
    const listar = async () => [inmueble('INM-1')];
    const sinFlag = await materializarFichasPublicas({ listarInmuebles: listar, deps, ahoraIso: AHORA });
    expect(sinFlag.modo).toBe('DRY_RUN');
    expect(sinFlag.escrituras).toBe(0);
    expect(escritor).not.toHaveBeenCalled();
    const conFlag = await materializarFichasPublicas({ listarInmuebles: listar, deps, ahoraIso: AHORA, ejecutar: true });
    expect(conFlag.modo).toBe('EJECUCION');
    expect(conFlag.escrituras).toBe(1);
    expect(escritor).toHaveBeenCalledTimes(1);
    // Ninguna primitiva real de Firestore: el escritor inyectado es el único usado.
    expect(mem.escrituras).toEqual([]);
  });
});
