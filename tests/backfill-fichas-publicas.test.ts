/**
 * Tests del backfill controlado de fichas públicas (R3) · `src/lib/backfillFichasPublicas.ts`
 * ----------------------------------------------------------------------------------------
 * Cero Firebase real: la utilidad recibe sus dependencias por parámetro, así que
 * estas pruebas ejercitan el algoritmo con un builder/lector/escritor falsos y un
 * `Map` en memoria.
 *
 * Qué se comprueba de fondo:
 *  · El backfill NO selecciona campos: cada ficha la produce el builder inyectado
 *    (en producción, `buildFichaPublicaInmueble`, el único canónico de R3) y la
 *    lista blanca solo se usa como contrato defensivo (`CAMPOS_FICHA_PUBLICA`).
 *  · En DRY-RUN es imposible escribir (la ruta de análisis no recibe escritor).
 *  · En ejecución solo se materializan `CREAR`/`ACTUALIZAR`, con `id === inmuebleId`
 *    y sin ninguna clave fuera de la lista blanca.
 *  · La equivalencia se decide sobre la proyección pública real, NUNCA sobre
 *    `actualizadoEn`, de modo que la segunda pasada no reescribe.
 *  · Un error puntual no aborta el lote y el documento `inmuebles` no se muta.
 *
 * La numeración `#N` de cada test corresponde al mandate del plan de backfill.
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type { Inmueble } from '../src/types';
import {
  CAMPO_NO_COMPARABLE,
  MOTIVO_SIN_TITULAR,
  analizarFichasPublicas,
  clavesFueraDeLista,
  fichasPublicasEquivalentes,
  idsAmaterializar,
  materializarFichasPublicas,
  proyeccionPublicaComparable,
  resolverDependenciasCanonicas,
  type DependenciasEjecucion,
  type FichaPublicaRef,
} from '../src/lib/backfillFichasPublicas';

const AHORA = '2026-05-05T10:00:00.000Z';
const ANTES = '2020-01-01T00:00:00.000Z';

/**
 * Subconjunto realista de `CAMPOS_FICHA_PUBLICA` de R3 (33 claves) que cubren los
 * fixtures de estas pruebas. Se usa como lista blanca de la prueba; el backfill no
 * la conoce ni la reimplementa: solo la verifica.
 */
const CAMPOS_PUBLICOS = [
  'id',
  'inmuebleId',
  'propietarioId',
  'direccion',
  'ciudad',
  'codigoPostal',
  'precio',
  'estado',
  'habitaciones',
  'banos',
  'superficie',
  'descripcion',
  'imagenUrl',
  'imagenes',
  'fianzaMeses',
  'tipoInmueble',
  'modalidadAlquiler',
  'actualizadoEn',
] as const;

/** Claves vetadas por R3 (`CAMPOS_PRIVADOS_INMUEBLE`): ninguna debe aparecer en la ficha. */
const CLAVES_PRIVADAS_PROBADAS = [
  'ibanCobro',
  'cuentaBancariaCobroId',
  'datosFiscales',
  'tokenSolicitud',
  'referenciaCatastral',
  'notasInternas',
  'inquilinoActualId',
  'inquilinoActualNombre',
  'contratoActivoId',
  'valorAdquisicion',
  'propietarioPrincipalId',
  'propietarioSecundarioId',
  'createdAt',
  'updatedAt',
];

function inmueble(
  id: string,
  cambios: Partial<Inmueble> = {},
): Inmueble {
  return {
    id,
    direccion: `Calle Mayor ${id}`,
    ciudad: 'Madrid',
    precio: 1200,
    estado: 'disponible',
    habitaciones: 2,
    banos: 1,
    superficie: 70,
    candidatosCount: 0,
    fianzaMeses: 2,
    descripcion: 'Piso luminoso con reforma reciente.',
    imagenUrl: 'https://firebasestorage.googleapis.com/v0/b/harqiba/o/piso-1.jpg',
    propietarioId: 'PROPIETARIO-1',
    codigoPostal: '28013',
    tipoInmueble: 'piso',
    modalidadAlquiler: 'completo',
    // --- Datos PRIVADOS: R3 no debe copiar NINGUNO a la ficha pública ---
    ibanCobro: 'ES9121000418401234567891',
    cuentaBancariaCobroId: 'CUENTA-1',
    referenciaCatastral: '1234567890123',
    tokenSolicitud: 'TOKEN-SECRETO-SOLICITUD',
    notasInternas: 'Teléfono privado del propietario: 600 111 222. No publicar.',
    inquilinoActualId: 'INQUILINO-9',
    inquilinoActualNombre: 'Nombre del inquilino real',
    contratoActivoId: 'CONTRATO-9',
    valorAdquisicion: 210000,
    propietarioPrincipalId: 'PROPIETARIO-1',
    propietarioSecundarioId: 'PROPIETARIO-2',
    datosFiscales: {
      referenciaCatastral: '1234567890123',
      codigoPostal: '28013',
      ibanCobro: 'ES9121000418401234567891',
      propietarioPrincipal: {
        nombre: 'Propietario Principal',
        nifDni: '12345678Z',
        direccion: 'Dirección fiscal privada',
        telefono: '600111222',
        email: 'privado@dominio.es',
      },
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    ...cambios,
  };
}

/**
 * Builder inyectado en las pruebas: imita el CONTRATO de `buildFichaPublicaInmueble`
 * (puro, devuelve `null` sin titular efectivo, reconstruye campo a campo y nunca usa
 * `{...inmueble}`). Es un doble de test: en producción se usa el de R3.
 */
function construirFicha(inm: Inmueble, ahoraIso?: string): FichaPublicaRef | null {
  const propietarioId = String(inm.propietarioId || '').trim();
  if (!propietarioId) return null;
  const ficha: FichaPublicaRef = {
    id: inm.id,
    inmuebleId: inm.id,
    propietarioId,
    direccion: inm.direccion,
    ciudad: inm.ciudad,
    precio: inm.precio,
    estado: inm.estado,
    habitaciones: inm.habitaciones,
    banos: inm.banos,
    superficie: inm.superficie,
    actualizadoEn: ahoraIso ?? ANTES,
  };
  if (inm.descripcion !== undefined) ficha.descripcion = inm.descripcion;
  if (inm.imagenUrl !== undefined) ficha.imagenUrl = inm.imagenUrl;
  if (inm.codigoPostal !== undefined) ficha.codigoPostal = inm.codigoPostal;
  if (inm.tipoInmueble !== undefined) ficha.tipoInmueble = inm.tipoInmueble;
  if (inm.modalidadAlquiler !== undefined) ficha.modalidadAlquiler = inm.modalidadAlquiler;
  if (inm.fianzaMeses !== undefined) ficha.fianzaMeses = inm.fianzaMeses;
  return ficha;
}

interface OpcionesEntorno {
  fichasExistentes?: Record<string, FichaPublicaRef | null>;
  construir?: (inmueble: Inmueble, ahoraIso?: string) => FichaPublicaRef | null;
  camposPublicos?: readonly string[];
  idsQueFalloAlLeer?: string[];
  idsQueFalloAlEscribir?: string[];
  /** Simula un árbol sin escritor canónico disponible. */
  omitirEscritor?: boolean;
}

function crearEntorno(inmuebles: Inmueble[], opciones: OpcionesEntorno = {}) {
  const store = new Map<string, FichaPublicaRef>();
  for (const [id, ficha] of Object.entries(opciones.fichasExistentes || {})) {
    if (ficha) store.set(id, ficha);
  }
  const llamadas = { construir: 0, leer: 0, escribir: 0 };
  const inmueblesRecibidos: Inmueble[] = [];
  const fichasProducidas: (FichaPublicaRef | null)[] = [];
  const escrituras: { id: string; ficha: FichaPublicaRef }[] = [];
  const construir = opciones.construir || construirFicha;

  const construirEspiado = (inmuebleArg: Inmueble, ahoraIso?: string) => {
    llamadas.construir++;
    inmueblesRecibidos.push(inmuebleArg);
    const salida = construir(inmuebleArg, ahoraIso);
    fichasProducidas.push(salida);
    return salida;
  };
  const leerFicha = async (id: string): Promise<FichaPublicaRef | null> => {
    llamadas.leer++;
    if (opciones.idsQueFalloAlLeer && opciones.idsQueFalloAlLeer.includes(id)) {
      throw new Error(`PERMISSION_DENIED leyendo ${id}`);
    }
    return store.get(id) || null;
  };
  const escribirFicha = async (ficha: FichaPublicaRef): Promise<void> => {
    llamadas.escribir++;
    if (opciones.idsQueFalloAlEscribir && opciones.idsQueFalloAlEscribir.includes(ficha.id)) {
      throw new Error(`PERMISSION_DENIED escribiendo ${ficha.id}`);
    }
    escrituras.push({ id: ficha.id, ficha: JSON.parse(JSON.stringify(ficha)) as FichaPublicaRef });
    store.set(ficha.id, ficha);
  };

  const base = {
    construir: construirEspiado,
    leerFicha,
    camposPublicos: opciones.camposPublicos || CAMPOS_PUBLICOS,
  };
  const deps: Partial<DependenciasEjecucion> = opciones.omitirEscritor ? base : { ...base, escribirFicha };

  return {
    deps,
    store,
    llamadas,
    inmueblesRecibidos,
    fichasProducidas,
    escrituras,
    listarInmuebles: () => Promise.resolve(inmuebles),
  };
}

describe('backfill R3 · análisis (DRY-RUN)', () => {
  it('#1 en DRY-RUN no se escribe absolutamente nada', async () => {
    const ent = crearEntorno([inmueble('INM-A'), inmueble('INM-B')]);
    const informe = await analizarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA });

    expect(informe.modo).toBe('DRY_RUN');
    expect(informe.escrituras).toBe(0);
    expect(ent.llamadas.escribir).toBe(0);
    expect(ent.escrituras).toHaveLength(0);
    expect(ent.store.size).toBe(0);
    // invariante del contrato: modo DRY_RUN ⇒ escrituras === 0 (siempre)
    expect(informe.modo).toBe('DRY_RUN');
    expect(informe.escrituras).toBe(0);
    expect(informe.aCrear).toBe(2); // sí hay trabajo pendiente, pero no se ha tocado nada
  });

  it('#2 la ficha la construye SIEMPRE el builder canónico (se le pasa el inmueble intacto)', async () => {
    const inmuebles = [inmueble('INM-A'), inmueble('INM-SIN-TITULAR', { propietarioId: '' })];
    const ent = crearEntorno(inmuebles);
    await analizarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA });

    // Un builder invocado por inmueble, sin preselección ni mapeo previo.
    expect(ent.llamadas.construir).toBe(2);
    expect(ent.inmueblesRecibidos[0]).toBe(inmuebles[0]); // misma referencia de objeto
    expect(ent.inmueblesRecibidos[1]).toBe(inmuebles[1]);

    // Y la proyección analizada es EXACTAMENTE la salida del builder, sin retoques.
    const esperado = construirFicha(inmuebles[0], AHORA) as FichaPublicaRef;
    expect(JSON.parse(JSON.stringify(esperado))).toEqual(
      JSON.parse(JSON.stringify(ent.fichasProducidas[0])),
    );

    // En ejecución se persiste esa misma ficha (sin campos añadidos por el backfill).
    const ent2 = crearEntorno(inmuebles);
    await materializarFichasPublicas({ listarInmuebles: ent2.listarInmuebles, deps: ent2.deps, ahoraIso: AHORA, ejecutar: true });
    expect(ent2.escrituras).toHaveLength(1);
    expect(ent2.escrituras[0].ficha).toEqual(JSON.parse(JSON.stringify(esperado)));
  });

  it('#3 ningún dato privado del inmueble aparece en la ficha pública', async () => {
    const ent = crearEntorno([inmueble('INM-A')]);
    await materializarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA, ejecutar: true });

    const escrita = ent.store.get('INM-A') as FichaPublicaRef;
    expect(escrita).toBeDefined();
    for (const clave of CLAVES_PRIVADAS_PROBADAS) {
      expect(Object.keys(escrita)).not.toContain(clave);
    }
    expect(JSON.stringify(escrita)).not.toMatch(/ES9121000418401234567891|12345678Z|TOKEN-SECRETO|600 111 222|privado@dominio\.es|IBAN|nifDni/i);
    // contrato defensivo de R3: ninguna clave fuera de la lista blanca
    expect(clavesFueraDeLista(escrita, CAMPOS_PUBLICOS)).toEqual([]);
    // el inmueble origen sí conservaba todos esos campos (no se han borrado)
    expect(ent.inmueblesRecibidos[0].ibanCobro).toBe('ES9121000418401234567891');
  });

  it('#4 inmueble sin titular efectivo → SIN_FICHA_POSIBLE (no es un error)', async () => {
    const ent = crearEntorno([
      inmueble('INM-SIN-ID-PROPIETARIO', { propietarioId: '' }),
      inmueble('INM-ESPACIOS', { propietarioId: '   ' }),
      inmueble('INM-OK'),
    ]);
    const informe = await analizarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA });

    expect(informe.items.find((i) => i.inmuebleId === 'INM-SIN-ID-PROPIETARIO')?.estado).toBe('SIN_FICHA_POSIBLE');
    expect(informe.items.find((i) => i.inmuebleId === 'INM-SIN-ID-PROPIETARIO')?.motivo).toBe(MOTIVO_SIN_TITULAR);
    expect(informe.items.find((i) => i.inmuebleId === 'INM-ESPACIOS')?.estado).toBe('SIN_FICHA_POSIBLE');
    expect(informe.noAptos).toBe(2);
    expect(informe.errores).toHaveLength(0);
    expect(informe.items.find((i) => i.inmuebleId === 'INM-OK')?.estado).toBe('CREAR');

    // y en ejecución tampoco se escribe para esos inmuebles
    const ent2 = crearEntorno([inmueble('INM-SIN-ID-PROPIETARIO', { propietarioId: '' })]);
    const ejec = await materializarFichasPublicas({ listarInmuebles: ent2.listarInmuebles, deps: ent2.deps, ahoraIso: AHORA, ejecutar: true });
    expect(ejec.escrituras).toBe(0);
    expect(ent2.store.size).toBe(0);
  });

  it('#5 ficha inexistente → CREAR', async () => {
    const ent = crearEntorno([inmueble('INM-A')], { fichasExistentes: {} });
    const informe = await analizarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA });

    expect(informe.items).toEqual([{ inmuebleId: 'INM-A', estado: 'CREAR', motivo: 'ficha_inexistente' }]);
    expect(informe.aCrear).toBe(1);
    expect(informe.fichasExistentes).toBe(0);
  });

  it('#6 ficha obsoleta → ACTUALIZAR (comparando la proyección pública real)', async () => {
    const obsoleta: FichaPublicaRef = {
      id: 'INM-A',
      inmuebleId: 'INM-A',
      propietarioId: 'PROPIETARIO-1',
      direccion: 'Calle Mayor INM-A',
      ciudad: 'Madrid',
      precio: 900, // precio desactualizado respecto del inmueble
      estado: 'disponible',
      habitaciones: 2,
      banos: 1,
      superficie: 70,
      actualizadoEn: ANTES,
    };
    const ent = crearEntorno([inmueble('INM-A')], { fichasExistentes: { 'INM-A': obsoleta } });
    const informe = await analizarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA });

    expect(informe.items[0].estado).toBe('ACTUALIZAR');
    expect(informe.fichasExistentes).toBe(1);
    expect(informe.aActualizar).toBe(1);
    expect(informe.errores).toHaveLength(0);
  });

  it('#7 ficha con la misma proyección pública → AL_DIA aunque cambie actualizadoEn', async () => {
    const alDia = construirFicha(inmueble('INM-A'), ANTES) as FichaPublicaRef;
    const ent = crearEntorno([inmueble('INM-A')], { fichasExistentes: { 'INM-A': alDia } });
    const informe = await analizarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA });

    expect(informe.items[0].estado).toBe('AL_DIA');
    expect(informe.alDia).toBe(1);
    // la prueba de que NO se compara actualizadoEn: los dos objetos difieren en ese campo
    expect((alDia[CAMPO_NO_COMPARABLE] as string)).toBe(ANTES);
    expect(fichasPublicasEquivalentes(alDia, construirFicha(inmueble('INM-A'), AHORA) as FichaPublicaRef)).toBe(true);
    expect(proyeccionPublicaComparable(alDia)).not.toHaveProperty(CAMPO_NO_COMPARABLE);
  });

  it('#8 segunda pasada sin cambios → AL_DIA y 0 escrituras (idempotencia)', async () => {
    const inmuebles = [inmueble('INM-A'), inmueble('INM-B'), inmueble('INM-C')];
    const ent = crearEntorno(inmuebles);

    const primera = await materializarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA, ejecutar: true });
    expect(primera.modo).toBe('EJECUCION');
    expect(primera.aCrear).toBe(3);
    expect(primera.escrituras).toBe(3);
    expect(ent.store.size).toBe(3);

    const segunda = await materializarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: '2027-01-01T00:00:00.000Z', ejecutar: true });
    expect(segunda.escrituras).toBe(0);
    expect(segunda.alDia).toBe(3);
    expect(segunda.aCrear).toBe(0);
    expect(segunda.aActualizar).toBe(0);
    expect(ent.llamadas.escribir).toBe(3); // no se añadió ni una escritura más
    expect(idsAmaterializar(segunda)).toEqual([]);
  });

  it('#10 un error en un inmueble no detiene el resto (análisis y escritura)', async () => {
    const inmuebles = [inmueble('INM-A'), inmueble('INM-B'), inmueble('INM-C'), inmueble('INM-D', { propietarioId: '' })];

    // Fallo de lectura del espejo en INM-B.
    const entLectura = crearEntorno(inmuebles, { idsQueFalloAlLeer: ['INM-B'] });
    const informeLectura = await analizarFichasPublicas({ listarInmuebles: entLectura.listarInmuebles, deps: entLectura.deps, ahoraIso: AHORA });
    expect(informeLectura.items.map((i) => i.estado)).toEqual(['CREAR', 'ERROR', 'CREAR', 'SIN_FICHA_POSIBLE']);
    expect(informeLectura.errores).toHaveLength(1);
    expect(informeLectura.errores[0].inmuebleId).toBe('INM-B');
    expect(informeLectura.errores[0].motivo).toBe('lectura_ficha_fallo');

    // Fallo de escritura (p. ej. reglas que rechazan) en INM-A: los demás se escriben.
    const entEscritura = crearEntorno(inmuebles, { idsQueFalloAlEscribir: ['INM-A'] });
    const informeEscritura = await materializarFichasPublicas({
      listarInmuebles: entEscritura.listarInmuebles,
      deps: entEscritura.deps,
      ahoraIso: AHORA,
      ejecutar: true,
    });
    expect(informeEscritura.escrituras).toBe(2);
    expect(informeEscritura.errores.map((i) => i.inmuebleId)).toEqual(['INM-A']);
    expect(informeEscritura.errores[0].motivo).toBe('escritura_fallo');
    expect(informeEscritura.items).toHaveLength(4);
    expect(entEscritura.store.has('INM-B')).toBe(true);
    expect(entEscritura.store.has('INM-C')).toBe(true);
    expect(entEscritura.store.has('INM-A')).toBe(false);
  });

  it('#17 el informe expone el contrato mínimo y su resumen es coherente', async () => {
    const ent = crearEntorno([inmueble('INM-A'), inmueble('INM-B'), inmueble('INM-C', { propietarioId: '' })], {
      fichasExistentes: { 'INM-B': construirFicha(inmueble('INM-B'), AHORA) as FichaPublicaRef },
    });
    const informe = await analizarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA });

    for (const campo of [
      'modo',
      'inmueblesLeidos',
      'aptos',
      'noAptos',
      'fichasExistentes',
      'aCrear',
      'aActualizar',
      'alDia',
      'escrituras',
      'errores',
      'items',
      'resumen',
    ] as const) {
      expect(informe).toHaveProperty(campo);
    }
    expect(informe.inmueblesLeidos).toBe(3);
    expect(informe.aptos).toBe(2);
    expect(informe.noAptos).toBe(1);
    expect(informe.fichasExistentes).toBe(1);
    expect(informe.aCrear).toBe(1);
    expect(informe.alDia).toBe(1);
    expect(informe.aptos + informe.noAptos + informe.errores.length).toBe(informe.inmueblesLeidos);
    expect(informe.resumen).toContain('DRY_RUN');
    expect(informe.resumen).toContain('escrituras=0');
    expect(informe.escrituras).toBe(0);
  });

  it('#18 el selector de lote (soloPropietarioId / soloInmuebleIds / limite) filtra sin escribir', async () => {
    const inmuebles = [
      inmueble('INM-A'),
      inmueble('INM-B'),
      inmueble('INM-OTRO-PROPIETARIO', { propietarioId: 'PROPIETARIO-X' }),
    ];
    const ent = crearEntorno(inmuebles);
    const porPropietario = await analizarFichasPublicas({
      listarInmuebles: ent.listarInmuebles,
      deps: ent.deps,
      ahoraIso: AHORA,
      soloPropietarioId: 'PROPIETARIO-1',
    });
    expect(porPropietario.items.map((i) => i.inmuebleId).sort()).toEqual(['INM-A', 'INM-B']);

    const porIds = await analizarFichasPublicas({
      listarInmuebles: ent.listarInmuebles,
      deps: ent.deps,
      ahoraIso: AHORA,
      soloInmuebleIds: ['INM-B'],
    });
    expect(porIds.items.map((i) => i.inmuebleId)).toEqual(['INM-B']);
    expect(idsAmaterializar(porIds)).toEqual(['INM-B']);

    const ent2 = crearEntorno(inmuebles);
    const conLimite = await analizarFichasPublicas({ listarInmuebles: ent2.listarInmuebles, deps: ent2.deps, ahoraIso: AHORA, limite: 1 });
    expect(conLimite.inmueblesLeidos).toBe(1);
    expect(ent2.llamadas.escribir).toBe(0);
  });
});

describe('backfill R3 · ejecución y guardas de seguridad', () => {
  it('#9 sin `ejecutar: true` no se escribe (flag obligatorio e inequívoco)', async () => {
    const inmuebles = [inmueble('INM-A'), inmueble('INM-B')];

    const sinFlag = await materializarFichasPublicas({ ...ent0(inmuebles), ahoraIso: AHORA });
    expect(sinFlag.modo).toBe('DRY_RUN');
    expect(sinFlag.autorizado).toBe(false);
    expect(sinFlag.escrituras).toBe(0);
    expect(sinFlag.motivo).toBe('sin_autorizacion_explicita');

    for (const valor of [false, undefined, 1, 'true', null, 0, {}] as unknown[]) {
      const ent = crearEntorno(inmuebles);
      const informe = await materializarFichasPublicas({
        listarInmuebles: ent.listarInmuebles,
        deps: ent.deps,
        ahoraIso: AHORA,
        ejecutar: valor as unknown as true | undefined,
      });
      expect(informe.escrituras).toBe(0);
      expect(ent.llamadas.escribir).toBe(0);
      expect(ent.store.size).toBe(0);
      expect(informe.modo).toBe('DRY_RUN');
    }
  });

  it('#11/#12 se respeta `id === inmuebleId` y `ficha.inmuebleId === id` en lo escrito', async () => {
    const ent = crearEntorno([inmueble('INM-A'), inmueble('INM-B')]);
    const informe = await materializarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA, ejecutar: true });

    expect(informe.escrituras).toBe(2);
    expect([...ent.store.keys()]).toEqual(['INM-A', 'INM-B']); // docId === id del inmueble
    for (const [docId, ficha] of ent.store) {
      expect(ficha.id).toBe(docId);
      expect(ficha.inmuebleId).toBe(docId);
      expect(ficha.propietarioId).toBe('PROPIETARIO-1');
    }
  });

  it('#11b un builder que rompa la invariante de id se rechaza y no se escribe', async () => {
    const construir = (inm: Inmueble, ahoraIso?: string) => {
      const ficha = construirFicha(inm, ahoraIso);
      return ficha ? ({ ...ficha, id: 'OTRA-COSA' } as FichaPublicaRef) : null;
    };
    const ent = crearEntorno([inmueble('INM-A')], { construir });
    const informe = await materializarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA, ejecutar: true });

    expect(informe.items[0].estado).toBe('ERROR');
    expect(informe.items[0].motivo).toBe('invariante_id_rota');
    expect(informe.escrituras).toBe(0);
    expect(ent.llamadas.escribir).toBe(0);
    expect(ent.store.size).toBe(0);
  });

  it('#13 ninguna clave fuera de la lista blanca: si aparece una, se rechaza ESA ficha', async () => {
    // Un builder (o una regresión de R3) que filtrara datos privados: el backfill los
    // detecta contra CAMPOS_FICHA_PUBLICA y NO escribe, sin ampliar nunca la lista.
    const construir = (inm: Inmueble, ahoraIso?: string) => {
      const ficha = construirFicha(inm, ahoraIso);
      if (!ficha) return null;
      return { ...ficha, ibanCobro: inm.ibanCobro, notasInternas: inm.notasInternas } as FichaPublicaRef;
    };
    const ent = crearEntorno([inmueble('INM-A'), inmueble('INM-B')], { construir });

    const analisis = await analizarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA });
    expect(analisis.items.every((i) => i.estado === 'ERROR')).toBe(true);
    expect(analisis.items[0].motivo).toBe('clave_fuera_de_lista');
    expect((analisis.items[0].fueraDeLista || []).sort()).toEqual(['ibanCobro', 'notasInternas']);

    const ejecucion = await materializarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA, ejecutar: true });
    expect(ejecucion.escrituras).toBe(0);
    expect(ent.llamadas.escribir).toBe(0);
    expect(ent.store.size).toBe(0);
    expect(ejecucion.resumen).toContain('errores=2');
  });

  it('#14 en ejecución solo se materializan los CREAR y ACTUALIZAR', async () => {
    const inmuebles = [inmueble('INM-CREAMOS'), inmueble('INM-ACTUALIZAMOS'), inmueble('INM-AL-DIA'), inmueble('INM-SIN-TITULAR', { propietarioId: '' })];
    const ent = crearEntorno(inmuebles, {
      fichasExistentes: {
        'INM-ACTUALIZAMOS': { ...(construirFicha(inmueble('INM-ACTUALIZAMOS'), ANTES) as FichaPublicaRef), precio: 700 },
        'INM-AL-DIA': construirFicha(inmueble('INM-AL-DIA'), ANTES) as FichaPublicaRef,
      },
    });
    const informe = await materializarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA, ejecutar: true });

    expect(informe.aCrear).toBe(1);
    expect(informe.aActualizar).toBe(1);
    expect(informe.alDia).toBe(1);
    expect(informe.noAptos).toBe(1);
    expect(informe.escrituras).toBe(2);
    expect(ent.escrituras.map((e) => e.id).sort()).toEqual(['INM-ACTUALIZAMOS', 'INM-CREAMOS']);
    expect(informe.items.find((i) => i.inmuebleId === 'INM-AL-DIA')?.escriturado).toBeUndefined();
    expect(informe.items.find((i) => i.inmuebleId === 'INM-CREAMOS')?.escriturado).toBe(true);
    // `AL_DIA` no se toca: sigue siendo el objeto preexistente
    expect(ent.store.get('INM-AL-DIA')?.actualizadoEn).toBe(ANTES);
  });

  it('#15 el backfill nunca modifica los inmuebles que recibe (ni sus fichas de entrada)', async () => {
    const inmuebles = [inmueble('INM-A'), inmueble('INM-B')];
    const instantanea = JSON.parse(JSON.stringify(inmuebles));
    const existente = construirFicha(inmueble('INM-B'), ANTES) as FichaPublicaRef;
    const instantaneaFicha = JSON.parse(JSON.stringify(existente));
    const ent = crearEntorno(inmuebles, { fichasExistentes: { 'INM-B': existente } });

    await analizarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA });
    await materializarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA, ejecutar: true });

    expect(inmuebles).toEqual(instantanea);
    expect(inmuebles.map((i) => i.id)).toEqual(['INM-A', 'INM-B']);
    expect(Object.keys(inmuebles[0]).sort()).toEqual(Object.keys(instantanea[0]).sort());
    expect(JSON.parse(JSON.stringify(existente))).toEqual(instantaneaFicha);
  });

  it('#15b la lista de inmuebles que devuelve la fuente no se reordena ni se muta', async () => {
    const inmuebles = [inmueble('INM-Z'), inmueble('INM-A')];
    const ordenOriginal = inmuebles.map((i) => i.id);
    const ent = crearEntorno(inmuebles);
    await materializarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA, ejecutar: true });
    expect(inmuebles.map((i) => i.id)).toEqual(ordenOriginal);
  });

  it('#16 la comparación ignora actualizadoEn y es orden-independiente', () => {
    const a: FichaPublicaRef = { id: 'X', inmuebleId: 'X', propietarioId: 'P', direccion: 'D', precio: 1, actualizadoEn: ANTES };
    const b: FichaPublicaRef = { actualizadoEn: AHORA, precio: 1, direccion: 'D', propietarioId: 'P', inmuebleId: 'X', id: 'X' };
    expect(fichasPublicasEquivalentes(a, b)).toBe(true);
    expect(fichasPublicasEquivalentes(a, { ...b, precio: 2 })).toBe(false);
    expect(fichasPublicasEquivalentes(a, { ...b, notasInternas: 'filtro' })).toBe(false);
    expect(proyeccionPublicaComparable(a)).not.toHaveProperty(CAMPO_NO_COMPARABLE);
  });
});

describe('backfill R3 · ausencia de rutas de escritura propias y enlace con el módulo canónico', () => {
  it('#19 el modo análisis no puede escribir: no recibe escritor y el módulo no tiene E/S propia', async () => {
    const inmuebles = [inmueble('INM-A'), inmueble('INM-B')];
    // `escribirFicha` explosiva: si el análisis la invocara, el test estallaría.
    const explosiva = vi.fn(async () => {
      throw new Error('ESCRITURA_NO_AUTORIZADA_EN_ANALISIS');
    });
    const ent = crearEntorno(inmuebles);
    const depsSinEscritorUsable = { ...ent.deps, escribirFicha: explosiva };

    const informe = await analizarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: depsSinEscritorUsable, ahoraIso: AHORA });
    expect(explosiva).not.toHaveBeenCalled();
    expect(informe.escrituras).toBe(0);
    expect(informe.aCrear).toBe(2);

    // Y el módulo no importa Firestore ni usa APIs de escritura por su cuenta:
    // su única vía de E/S son las dependencias inyectadas (o R3 en la canónica).
    const fuente = await readFile(new URL('../src/lib/backfillFichasPublicas.ts', import.meta.url), 'utf8');
    expect(fuente).not.toMatch(/from ['"]firebase/);
    expect(fuente).not.toMatch(/import\s*\(\s*['"]firebase/);
    expect(fuente).not.toMatch(/\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction|collection|getDocs)\s*\(/);
    // La firma de análisis recibe DependenciasAnalisis (sin escribirFicha).
    const soloAnalisis: Parameters<typeof analizarFichasPublicas>[0]['deps'] = {
      construir: ent.deps.construir,
      leerFicha: ent.deps.leerFicha,
      camposPublicos: CAMPOS_PUBLICOS,
    };
    expect('escribirFicha' in (soloAnalisis as object)).toBe(false);
  });

  it('#19b sin escritor canónico, la ejecución real se niega en lugar de improvisar uno', async () => {
    const ent = crearEntorno([inmueble('INM-A')], { omitirEscritor: true });
    // En este árbol (rama sin el módulo R3 integrado) la ruta canónica no está
    // disponible: debe fallar de forma explícita y CERO escrituras.
    await expect(
      materializarFichasPublicas({ listarInmuebles: ent.listarInmuebles, deps: ent.deps, ahoraIso: AHORA, ejecutar: true }),
    ).rejects.toThrow(/R3_NO_DISPONIBLE|R3_INCOMPLETO/);
    expect(ent.store.size).toBe(0);
    expect(ent.llamadas.escribir).toBe(0);
  });

  it('#20 resolverDependenciasCanonicas: o el contrato de R3, o un fallo explícito', async () => {
    try {
      const deps = await resolverDependenciasCanonicas();
      // Si R3 está integrado en este árbol, las cuatro piezas deben ser canónicas.
      expect(typeof deps.construir).toBe('function');
      expect(typeof deps.leerFicha).toBe('function');
      expect(typeof deps.escribirFicha).toBe('function');
      expect(Array.isArray(deps.camposPublicos)).toBe(true);
      expect(deps.camposPublicos.length).toBeGreaterThan(0);
      expect(deps.camposPublicos).toContain('inmuebleId');
      expect(deps.camposPublicos).not.toContain('ibanCobro');
    } catch (err) {
      // Y si no lo está, se niega: nunca construye un builder paralelo.
      expect(String((err as Error).message)).toMatch(/R3_NO_DISPONIBLE|R3_INCOMPLETO/);
    }
  });
});

/** Atajo para el test #9: mismo entorno, solo se varía el flag de ejecución. */
function ent0(inmuebles: Inmueble[]) {
  const ent = crearEntorno(inmuebles);
  return { listarInmuebles: ent.listarInmuebles, deps: ent.deps };
}
