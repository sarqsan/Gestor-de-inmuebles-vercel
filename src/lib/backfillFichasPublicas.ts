/**
 * R3 · BACKFILL CONTROLADO DE FICHAS PÚBLICAS (`fichas_publicas_inmueble`).
 * -------------------------------------------------------------------------
 * Propósito: materializar, de forma **segura, auditable, repetible y con lista
 * blanca**, las fichas públicas de los inmuebles que ya existen en Firestore y
 * que nunca llegaron a tener espejo (R3 solo mantiene la ficha "mejor esfuerzo"
 * desde `saveInmuebleFirestore`, de modo que los inmuebles anteriores a R3 no la
 * tienen).
 *
 * LO QUE ESTA UTILIDAD **NO** HACE (deliberadamente):
 *  · NO define ni copia una lista propia de campos publicables. La selección de
 *    campos es **exclusivamente** la de R3: `buildFichaPublicaInmueble` y
 *    `CAMPOS_FICHA_PUBLICA` (ver `src/lib/fichaPublicaInmueble.ts` en la canónica).
 *    Aquí no hay ningún `{ id: inm.id, direccion: inm.direccion, ... }`: sería una
 *    segunda whitelist y divergiría de las reglas (`clavesFichaPublicaOk()`).
 *  · NO escribe nada en modo análisis (`analizarFichasPublicas` no recibe ni
 *    necesita la función de escritura: la invariante es estructural, no de buena fe).
 *  · NO se ejecuta solo: `materializarFichasPublicas` requiere `ejecutar: true`.
 *  · NO toca `firestore.rules`, `storage.rules`, `App.tsx` ni el documento
 *    `inmuebles` (solo lo lee a través de la función inyectada).
 *
 * Resolución del módulo canónico: se importa de forma **perezosa** (`import(ruta)`)
 * para que (a) el backfill llame siempre al builder real de R3 y (b) esta utilidad
 * pueda cargarse y testearse en árboles donde R3 aún no está integrado, en cuyo
 * caso **falla de forma explícita** (`R3_NO_DISPONIBLE`) en lugar de improvisar un
 * builder alternativo. En la canónica A, donde R3 existe, la ruta resuelve al
 * módulo canónico sin cambios en este fichero.
 *
 * Contrato de las reglas R3 que este backfill respeta y verifica antes de escribir:
 *  · `id === inmuebleId === fichaId` (invariante de identidad de R3)
 *  · `propietarioId` string no vacío (titular efectivo derivado por R3)
 *  · `Object.keys(ficha) ⊆ CAMPOS_FICHA_PUBLICA` (lista blanca CERRADA)
 */
import type { Inmueble } from '../types';

/** Ruta del módulo canónico de R3 (relativa a este fichero). */
export const RUTA_MODULO_CANONICO_R3 = './fichaPublicaInmueble';

/**
 * Campo que NUNCA participa en la comparación de equivalencia: `actualizadoEn`
 * cambia en cada construcción y usarlo provocaría escrituras inútiles (y una
 * segunda pasada que nunca converge). R3 solo lo define en la raíz de la ficha.
 */
export const CAMPO_NO_COMPARABLE = 'actualizadoEn';

/** Motivo por el que R3 no produce ficha: inmueble sin titular efectivo. */
export const MOTIVO_SIN_TITULAR = 'sin_titular_efectivo';

export type EstadoItemBackfill =
  | 'CREAR'
  | 'ACTUALIZAR'
  | 'AL_DIA'
  | 'SIN_FICHA_POSIBLE'
  | 'ERROR';

/**
 * Vista estructural de la ficha pública. **No** es una lista de campos: es el tipo
 * mínimo que necesita este módulo para operar (identidad + titular) y deja el resto
 * exactamente como lo produce `buildFichaPublicaInmueble`.
 */
export interface FichaPublicaRef {
  id: string;
  inmuebleId: string;
  propietarioId: string;
  [campo: string]: unknown;
}

export interface ItemBackfill {
  inmuebleId: string;
  estado: EstadoItemBackfill;
  motivo?: string;
  /** Claves detectadas fuera de la lista blanca de R3 (si las hubo). */
  fueraDeLista?: string[];
  /** true solo si este ítem fue efectivamente escrito en modo ejecución. */
  escriturado?: boolean;
  error?: string;
}

export interface InformeBackfill {
  /** `DRY_RUN` nunca escribe; `EJECUCION` exige `ejecutar: true`. */
  modo: 'DRY_RUN' | 'EJECUCION';
  /** false si `materializarFichasPublicas` se invocó sin `ejecutar: true`. */
  autorizado: boolean;
  motivo?: string;
  inmueblesLeidos: number;
  /** Inmuebles con proyección pública válida (CREAR + ACTUALIZAR + AL_DIA). */
  aptos: number;
  /** Inmuebles sin proyección posible (sin titular efectivo). */
  noAptos: number;
  /** Inmuebles que ya tenían ficha pública al analizar. */
  fichasExistentes: number;
  aCrear: number;
  aActualizar: number;
  alDia: number;
  /** En DRY_RUN es SIEMPRE 0 (invariante asertada en los tests). */
  escrituras: number;
  /** Errores aislados (un inmueble no aborta el lote). */
  errores: ItemBackfill[];
  items: ItemBackfill[];
  resumen: string;
}

/** Dependencias mínimas para ANALIZAR (sin ninguna capacidad de escritura). */
export interface DependenciasAnalisis {
  construir: (inmueble: Inmueble, ahoraIso?: string) => FichaPublicaRef | null;
  leerFicha: (id: string) => Promise<FichaPublicaRef | null>;
  camposPublicos: readonly string[];
}

/** Dependencias para EJECUTAR: las de análisis + el guardado canónico de R3. */
export interface DependenciasEjecucion extends DependenciasAnalisis {
  escribirFicha: (ficha: FichaPublicaRef) => Promise<void>;
}

/** Firma esperada del módulo canónico de R3 (solo se usa para tipar la carga). */
interface ModuloCanonicoR3 {
  buildFichaPublicaInmueble: (inmueble: Inmueble, ahoraIso?: string) => FichaPublicaRef | null;
  getFichaPublicaInmueble: (id: string) => Promise<FichaPublicaRef | null>;
  saveFichaPublicaInmueble: (ficha: FichaPublicaRef) => Promise<void>;
  CAMPOS_FICHA_PUBLICA: readonly string[];
}

const NOMBRES_REQUERIDOS = [
  'buildFichaPublicaInmueble',
  'getFichaPublicaInmueble',
  'saveFichaPublicaInmueble',
  'CAMPOS_FICHA_PUBLICA',
] as const;

/**
 * Carga el módulo canónico de R3 y deriva de él las cuatro piezas del contrato
 * (builder, lector, escritor y lista blanca). No reimplementa ninguna.
 *
 * @throws `R3_NO_DISPONIBLE` si el módulo no está en este árbol (p. ej. rama sin
 *         la integración de R3) o `R3_INCOMPLETO` si le falta alguna exportación.
 */
export async function resolverDependenciasCanonicas(): Promise<DependenciasEjecucion> {
  const ruta = RUTA_MODULO_CANONICO_R3;
  let mod: ModuloCanonicoR3;
  try {
    // Importación dinámica con especificador no literal: lo resuelve el entorno de
    // ejecución (así este fichero es cargable aunque R3 no esté en el árbol).
    mod = (await import(/* @vite-ignore */ ruta)) as ModuloCanonicoR3;
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    throw new Error(
      `R3_NO_DISPONIBLE: no se pudo cargar ${ruta} (${detalle}). El backfill usa exclusivamente el builder y la lista blanca de R3; no se construye un builder alternativo.`,
    );
  }
  for (const nombre of NOMBRES_REQUERIDOS) {
    if (!mod || !(nombre in mod)) {
      throw new Error(`R3_INCOMPLETO: falta '${nombre}' en ${ruta}; el contrato de R3 ha cambiado.`);
    }
  }
  return {
    construir: mod.buildFichaPublicaInmueble,
    leerFicha: mod.getFichaPublicaInmueble,
    escribirFicha: mod.saveFichaPublicaInmueble,
    camposPublicos: mod.CAMPOS_FICHA_PUBLICA,
  };
}

// ==========================================================================
// Comparación estable de la proyección pública (sin `actualizadoEn`)
// ==========================================================================

/** Ordena claves y normaliza `undefined` para que la comparación sea determinista. */
function valorEstable(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(valorEstable);
  if (valor && typeof valor === 'object') {
    const origen = valor as Record<string, unknown>;
    const salida: Record<string, unknown> = {};
    for (const clave of Object.keys(origen).sort()) {
      if (clave === CAMPO_NO_COMPARABLE) continue;
      const interno = origen[clave];
      if (interno === undefined) continue;
      salida[clave] = valorEstable(interno);
    }
    return salida;
  }
  return valor === undefined ? null : valor;
}

/** Proyección pública comparable de una ficha (copia: no muta la original). */
export function proyeccionPublicaComparable(ficha: FichaPublicaRef): Record<string, unknown> {
  return valorEstable(ficha) as Record<string, unknown>;
}

/**
 * ¿Es la misma proyección pública? Se ignora `actualizadoEn` y se comparan las
 * claves en orden estable, de modo que una segunda pasada sobre datos inmutados
 * dé `AL_DIA` (y por tanto cero escrituras).
 */
export function fichasPublicasEquivalentes(a: FichaPublicaRef, b: FichaPublicaRef): boolean {
  return JSON.stringify(valorEstable(a)) === JSON.stringify(valorEstable(b));
}

/** Claves de la ficha que están fuera de la lista blanca de R3 (vacío = correcto). */
export function clavesFueraDeLista(ficha: FichaPublicaRef, camposPublicos: readonly string[]): string[] {
  const permitidas = new Set(camposPublicos);
  return Object.keys(ficha).filter((clave) => !permitidas.has(clave));
}

// ==========================================================================
// Análisis (DRY-RUN): structuralemente sin escritura
// ==========================================================================

interface ItemInterno {
  inmuebleId: string;
  estado: EstadoItemBackfill;
  motivo?: string;
  fueraDeLista?: string[];
  error?: string;
  /** true si al analizar ya existía una ficha pública para este inmueble. */
  existiaFicha?: boolean;
  /** true si este ítem fue escrito en el modo ejecución. */
  escriturado?: boolean;
  /** Ficha construida por R3; solo la consume el paso de escritura. */
  ficha?: FichaPublicaRef;
}

function itemPublicable(it: ItemInterno): ItemBackfill {
  const item: ItemBackfill = { inmuebleId: it.inmuebleId, estado: it.estado };
  if (it.motivo) item.motivo = it.motivo;
  if (it.fueraDeLista && it.fueraDeLista.length > 0) item.fueraDeLista = it.fueraDeLista;
  if (it.error) item.error = it.error;
  if (it.escriturado === true) item.escriturado = true;
  return item;
}

function construirInforme(items: ItemInterno[], modo: InformeBackfill['modo'], escrituras: number, autorizado: boolean, motivo?: string): InformeBackfill {
  const cuenta = (estado: EstadoItemBackfill) => items.filter((i) => i.estado === estado).length;
  const aCrear = cuenta('CREAR');
  const aActualizar = cuenta('ACTUALIZAR');
  const alDia = cuenta('AL_DIA');
  const noAptos = cuenta('SIN_FICHA_POSIBLE');
  const errores = items.filter((i) => i.estado === 'ERROR').map(itemPublicable);
  const resumen =
    `[${modo}] inmuebles leídos=${items.length} · aptos=${aCrear + aActualizar + alDia} · a crear=${aCrear} · a actualizar=${aActualizar} · ` +
    `al día=${alDia} · sin ficha posible=${noAptos} · errores=${errores.length} · escrituras=${escrituras}` +
    (motivo ? ` · ${motivo}` : '');
  return {
    modo,
    autorizado,
    ...(motivo ? { motivo } : {}),
    inmueblesLeidos: items.length,
    aptos: aCrear + aActualizar + alDia,
    noAptos,
    fichasExistentes: items.filter((i) => i.existiaFicha === true).length,
    aCrear,
    aActualizar,
    alDia,
    escrituras,
    errores,
    items: items.map(itemPublicable),
    resumen,
  };
}

export interface OpcionesAnalisis {
  /** Fuente de inmuebles: la inyecta la llamada (esta utilidad no consulta Firestore por su cuenta). */
  listarInmuebles: () => Promise<Inmueble[]>;
  /** Parciales: lo que falte se resuelve contra el módulo canónico de R3. */
  deps?: Partial<DependenciasEjecucion>;
  /** Fecha ISO inyectable (determinismo en tests y en ejecuciones auditables). */
  ahoraIso?: string;
  /** Restringe el backfill a la cartera de un propietario (filtro de lectura). */
  soloPropietarioId?: string;
  /** Restringe a ids concretos (p. ej. los CREAR/ACTUALIZAR de un DRY-RUN previo). */
  soloInmuebleIds?: string[];
  /** Máximo de inmuebles a procesar (lotes controlados). */
  limite?: number;
}

async function resolverDeps(
  depsParciales: Partial<DependenciasEjecucion> | undefined,
  necesitaEscritor: boolean,
): Promise<DependenciasEjecucion> {
  const d = depsParciales || {};
  const faltanDeAnalisis = typeof d.construir !== 'function' || typeof d.leerFicha !== 'function' || !Array.isArray(d.camposPublicos);
  const faltaEscritor = necesitaEscritor && typeof d.escribirFicha !== 'function';
  // Con todas las dependencias inyectadas no se toca el módulo canónico (permite
  // auditar el backfill fuera del árbol de R3 y en tests sin E/S).
  if (!faltanDeAnalisis && !faltaEscritor) return d as DependenciasEjecucion;
  const canonicas = await resolverDependenciasCanonicas();
  return { ...canonicas, ...d };
}

/** Núcleo del análisis: recibe `deps` SIN capacidad de escritura (por tipo). */
async function analizarCon(items: Inmueble[], deps: DependenciasAnalisis, ahoraIso?: string): Promise<ItemInterno[]> {
  const resultados: ItemInterno[] = [];
  for (const inmueble of items) {
    const inmuebleId = String(inmueble?.id || '').trim();
    if (!inmuebleId) {
      resultados.push({ inmuebleId: '(sin id)', estado: 'ERROR', motivo: 'inmueble_sin_id' });
      continue;
    }
    // 1) Ficha SIEMPRE por el builder canónico de R3. Un fallo aquí no aborta el lote.
    let ficha: FichaPublicaRef | null = null;
    try {
      ficha = deps.construir(inmueble, ahoraIso);
    } catch (err) {
      resultados.push({
        inmuebleId,
        estado: 'ERROR',
        motivo: 'builder_fallo',
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    // 2) Sin titular efectivo R3 no produce ficha → controlado, no es un error.
    if (!ficha) {
      resultados.push({ inmuebleId, estado: 'SIN_FICHA_POSIBLE', motivo: MOTIVO_SIN_TITULAR });
      continue;
    }
    // 3) Guarda defensiva de la lista blanca (no la amplía: solo la verifica).
    const fuera = clavesFueraDeLista(ficha, deps.camposPublicos);
    if (fuera.length > 0) {
      resultados.push({
        inmuebleId,
        estado: 'ERROR',
        motivo: 'clave_fuera_de_lista',
        fueraDeLista: fuera,
        error: `La ficha contiene claves no publicables: ${fuera.join(', ')}. No se escribe.`,
      });
      continue;
    }
    // 4) Invariantes de identidad y titularidad exigidas por las reglas R3.
    if (ficha.id !== inmuebleId || ficha.inmuebleId !== inmuebleId) {
      resultados.push({
        inmuebleId,
        estado: 'ERROR',
        motivo: 'invariante_id_rota',
        error: `id=${String(ficha.id)} / inmuebleId=${String(ficha.inmuebleId)} no coinciden con ${inmuebleId}.`,
      });
      continue;
    }
    if (typeof ficha.propietarioId !== 'string' || ficha.propietarioId.trim().length === 0) {
      resultados.push({ inmuebleId, estado: 'ERROR', motivo: 'titular_invalido', error: 'propietarioId vacío o no string (las reglas R3 lo exigen no vacío).' });
      continue;
    }
    // 5) Estado del espejo.
    let existente: FichaPublicaRef | null = null;
    try {
      existente = await deps.leerFicha(inmuebleId);
    } catch (err) {
      resultados.push({
        inmuebleId,
        estado: 'ERROR',
        motivo: 'lectura_ficha_fallo',
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if (!existente) {
      resultados.push({ inmuebleId, estado: 'CREAR', motivo: 'ficha_inexistente', existiaFicha: false, ficha });
      continue;
    }
    if (fichasPublicasEquivalentes(existente, ficha)) {
      resultados.push({ inmuebleId, estado: 'AL_DIA', motivo: 'proyeccion_publica_identica', existiaFicha: true });
      continue;
    }
    resultados.push({ inmuebleId, estado: 'ACTUALIZAR', motivo: 'proyeccion_publica_distinta', existiaFicha: true, ficha });
  }
  return resultados;
}

/**
 * DRY-RUN del backfill. Clasifica cada inmueble y **no escribe**: la firma no
 * expone ningún medio de escritura y el núcleo recibe `DependenciasAnalisis`.
 */
export async function analizarFichasPublicas(opts: OpcionesAnalisis): Promise<InformeBackfill> {
  // El análisis se resuelve SIN escritor: ni siquiera se carga la función de guardado.
  const deps = await resolverDeps(opts.deps, false);
  const todos = await opts.listarInmuebles();
  const seleccionados = filtrar(todos, opts);
  const internos = await analizarCon(seleccionados, deps, opts.ahoraIso);
  return construirInforme(internos, 'DRY_RUN', 0, false, 'analisis');
}

function filtrar(inmuebles: Inmueble[], opts: Pick<OpcionesAnalisis, 'soloPropietarioId' | 'soloInmuebleIds' | 'limite'>): Inmueble[] {
  let lista = inmuebles;
  if (opts.soloPropietarioId) {
    const objetivo = opts.soloPropietarioId.trim();
    lista = lista.filter((i) => String((i as { propietarioId?: string }).propietarioId || '').trim() === objetivo);
  }
  if (opts.soloInmuebleIds && opts.soloInmuebleIds.length > 0) {
    const ids = new Set(opts.soloInmuebleIds.map((x) => String(x).trim()));
    lista = lista.filter((i) => ids.has(String(i?.id || '').trim()));
  }
  if (typeof opts.limite === 'number' && opts.limite >= 0) lista = lista.slice(0, opts.limite);
  return lista;
}

export interface OpcionesEjecucion extends OpcionesAnalisis {
  /**
   * ÚNICA vía para escribir. Sin `ejecutar: true` literal la función se comporta
   * como un DRY-RUN y no invoca al escritor canónico.
   */
  ejecutar?: boolean;
}

/**
 * Modo ejecución. Vuelve a analizar en el momento de escribir (nunca escribe sobre
 * un informe posiblemente caducado) y solo materializa `CREAR`/`ACTUALIZAR`.
 * `AL_DIA`, `SIN_FICHA_POSIBLE` y `ERROR` no generan escrituras.
 * Un error en un inmueble no interrumpe el resto del lote.
 */
export async function materializarFichasPublicas(opts: OpcionesEjecucion): Promise<InformeBackfill> {
  const deps = await resolverDeps(opts.deps, opts.ejecutar === true);
  const internos = await analizarCon(filtrar(await opts.listarInmuebles(), opts), deps, opts.ahoraIso);

  if (opts.ejecutar !== true) {
    // Cero escrituras: se devuelve el análisis tal cual, marcado como no autorizado.
    return construirInforme(internos, 'DRY_RUN', 0, false, 'sin_autorizacion_explicita');
  }

  let escrituras = 0;
  const resultados: ItemInterno[] = [];
  for (const item of internos) {
    const escribible = (item.estado === 'CREAR' || item.estado === 'ACTUALIZAR') && item.ficha !== undefined;
    if (!escribible) {
      resultados.push(item);
      continue;
    }
    const ficha = item.ficha as FichaPublicaRef;
    // Re-guarda inmediata antes de escribir (la lista blanca manda; no se amplía).
    const fuera = clavesFueraDeLista(ficha, deps.camposPublicos);
    if (fuera.length > 0 || ficha.id !== item.inmuebleId || ficha.inmuebleId !== item.inmuebleId) {
      resultados.push({
        ...item,
        estado: 'ERROR',
        motivo: 'rechazado_antes_de_escribir',
        fueraDeLista: fuera,
        error: 'La ficha no cumple la lista blanca o la invariante id === inmuebleId. No se escribe.',
      });
      continue;
    }
    try {
      await deps.escribirFicha(ficha);
      escrituras++;
      resultados.push({ ...item, escriturado: true });
    } catch (err) {
      resultados.push({
        ...item,
        estado: 'ERROR',
        motivo: 'escritura_fallo',
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
  }
  return construirInforme(resultados, 'EJECUCION', escrituras, true, undefined);
}

/** Ids que una ejecución posterior debería materializar (para lotes auditables). */
export function idsAmaterializar(informe: InformeBackfill): string[] {
  return informe.items.filter((i) => i.estado === 'CREAR' || i.estado === 'ACTUALIZAR').map((i) => i.inmuebleId);
}
