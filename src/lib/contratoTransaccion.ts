/**
 * AG-10 · Escritura TRANSACCIONAL del contrato y de sus periodos de cobro.
 *
 * PROBLEMA QUE RESUELVE
 * `saveContratoFirestore` hacía `getDoc` + `setDoc(merge)` del contrato completo.
 * El `registroCobros` viaja EMBEBIDO en el documento, así que cualquier cliente
 * que guardara «el contrato que tiene en pantalla» escribía también SU copia del
 * calendario de cobros. Con dos clientes abiertos (titular + gestor, o dos
 * pestañas) —o con la materialización automática de periodos que se dispara al
 * abrir la aplicación— la última escritura pisaba:
 *
 *   · un pago registrado por el otro cliente (`importeRecibido`, `fechaPago`,
 *     `justificante`, estado RECIBIDO/VERIFICADO…),
 *   · una incidencia manual,
 *   · un periodo nuevo materializado en paralelo,
 *   · una firma ya estampada,
 *   · los índices de capacidad que el inquilino añade por `arrayUnion`.
 *
 * El `merge: true` no protege nada: a nivel de documento `registroCobros` es una
 * LISTA completa y se sustituye entera. Tampoco valía «envolver la escritura en
 * runTransaction»: una transacción sobre una instantánea vieja confirma
 * exactamente la misma pérdida de datos.
 *
 * QUÉ HACE ESTE MÓDULO
 * Es la FUSIÓN que se ejecuta DENTRO de la transacción, con el estado persistido
 * ya leído. Es puro: no importa Firebase, no lee ni escribe. `firebase.ts` le
 * aporta el `runTransaction`; aquí sólo está la política de datos.
 *
 *   1. **Sólo viajan los periodos que la operación declara.** Nunca se reenvía
 *      el array completo del contrato en memoria.
 *   2. Cada escritura de periodo se resuelve contra el estado PERSISTIDO (no
 *      contra la instantánea del cliente):
 *        · sin cambios → no se escribe (idempotencia real),
 *        · conflicto + `descartar` → se conserva el persistido (materialización
 *          automática: jamás pisa un pago),
 *        · conflicto + `reintentar` → se REAPLICA la intención de la operación
 *          (sólo los campos que cambió) sobre el periodo persistido, de modo que
 *          el justificante o el estado que puso el otro cliente no se pierden.
 *   3. Los periodos que la operación NO declara se conservan como estén
 *      persistidos: un tercer cliente que añadió un periodo o registró un pago no
 *      puede perderlo porque este cliente no lo tuviera en pantalla.
 *   4. Los campos monotónicos (firmas, `historial`, índices de capacidad) se
 *      PROTEGEN: una instantánea vieja no puede desmarcar una firma, borrar una
 *      entrada de historial ni quitar un índice añadido después.
 *   5. Si la fusión no cambia nada, la transacción **no escribe** el contrato
 *      (`hayCambios: false`): reintentar no genera commits vacíos ni duplicados.
 *
 * La concurrencia se prueba sin emulador: dos «clientes» compiten sobre el mismo
 * estado canónico y se verifica qué queda persistido.
 */
import type { CobroPeriodo, ContratoFormalizacion, HistorialCobroItem } from '../types';

/** Conflicto de concurrencia que la transacción no puede resolver sin abortar. */
export class ErrorConflictoContrato extends Error {
  readonly codigo = 'CONFLICTO_CONCURRENCIA_CONTRATO';
  readonly detalle: string;

  constructor(detalle: string) {
    super(`Conflicto de concurrencia en el contrato: ${detalle}. Se reintenta sobre el estado persistido.`);
    this.name = 'ErrorConflictoContrato';
    this.detalle = detalle;
  }
}

/**
 * Política ante una escritura de periodo cuya base ya no coincide con lo
 * persistido.
 */
export type PoliticaConflicto = 'descartar' | 'reintentar';

/** Qué se hace con el campo `registroCobros` del contrato. */
export type ModoCobros =
  /** No se toca el calendario persistido (cierre, edición de cláusulas, avisos). */
  | 'CONSERVAR'
  /** Se aplican las escrituras declaradas sobre el calendario persistido y se conserva el resto. */
  | 'FUSIONAR'
  /**
   * Se conserva el calendario persistido y SÓLO se crean periodos de id inexistente
   * (alta de contrato: nunca pisa historia).
   */
  | 'CREAR_SOLO_NUEVOS';

/**
 * Escritura de UN periodo referida a la lectura base de la operación.
 *
 * `antes` es el periodo tal y como lo vio la operación (`undefined` si creía que
 * no existía). Es la base de la detección de modificaciones concurrentes.
 */
export interface EscrituraPeriodo {
  despues: CobroPeriodo;
  antes?: CobroPeriodo;
  politica: PoliticaConflicto;
}

export interface EntradaFusionContrato {
  /** Contrato tal y como lo construyó la operación (lectura base + sus cambios). */
  contrato: ContratoFormalizacion;
  /** Estado persistido leído DENTRO de la transacción (`null`/`undefined` si no existe). */
  persistido: ContratoFormalizacion | null | undefined;
  /** Instantánea desde la que la operación construyó `contrato` (para detectar concurrencia). */
  base?: ContratoFormalizacion | null;
  modoCobros: ModoCobros;
  escrituras?: EscrituraPeriodo[];
  /** Campos que esta operación NO escribe aunque vengan en `contrato`. */
  omitirCampos?: string[];
}

export interface SalidaFusionContrato {
  /** Documento a escribir (`merge: true`). */
  datos: Record<string, unknown>;
  /** `false` ⇒ la transacción NO escribe el contrato (nada que persistir). */
  hayCambios: boolean;
  /** Ids de periodos efectivamente escritos. */
  periodosEscritos: string[];
  /** Ids de periodos descartados por conflicto (se conserva el persistido). */
  periodosDescartados: string[];
  /** Ids de periodos cuya intención se reaplicó sobre el estado persistido. */
  periodosReaplicados: string[];
  /** `true` si el documento persistido cambió desde la instantánea de la operación. */
  cambioConcurrente: boolean;
}

// ---------------------------------------------------------------------------
// Comparación de periodos
// ---------------------------------------------------------------------------

/** Marcas de tiempo accesorias: cambian en cada recálculo y no son contenido. */
const CLAVES_ACCESORIAS = new Set(['ultimaModificacion', 'fechaRegistro']);

const mismoValor = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** ¿Hay algún dato económico registrado en el periodo? (pago, justificante, incidencia). */
export function tieneDatosEconomicos(periodo: CobroPeriodo | undefined | null): boolean {
  if (!periodo) return false;
  if (Number(periodo.importeRecibido) > 0) return true;
  if (periodo.fechaPago) return true;
  if (periodo.justificante) return true;
  if (periodo.referenciaBancaria) return true;
  if (periodo.motivoIncidencia) return true;
  if ((periodo.historialCambios?.length ?? 0) > 0) return true;
  return periodo.estado !== 'PENDIENTE' && periodo.estado !== 'RETRASADO';
}

/**
 * Compara dos periodos por contenido económico y de trazabilidad.
 * Ignora las marcas accesorias para que dos recálculos equivalentes del mismo
 * mes produzcan «sin cambios» (sin esto la idempotencia sería imposible).
 */
export function mismoPeriodo(
  a: CobroPeriodo | undefined | null,
  b: CobroPeriodo | undefined | null,
): boolean {
  if (!a || !b) return !a && !b;
  const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const clave of claves) {
    if (CLAVES_ACCESORIAS.has(clave)) continue;
    if (!mismoValor(
      (a as unknown as Record<string, unknown>)[clave],
      (b as unknown as Record<string, unknown>)[clave],
    )) return false;
  }
  return true;
}

function indicePeriodos(periodos: CobroPeriodo[] | undefined): Map<string, CobroPeriodo> {
  const mapa = new Map<string, CobroPeriodo>();
  for (const p of periodos ?? []) if (p?.id) mapa.set(p.id, p);
  return mapa;
}

/** Une historiales por id: primero los de `preferente`, después los que falten. */
function unirHistorial(
  preferente: HistorialCobroItem[] | undefined,
  anterior: HistorialCobroItem[] | undefined,
): HistorialCobroItem[] {
  const vistos = new Set<string>();
  const salida: HistorialCobroItem[] = [];
  for (const item of [...(preferente ?? []), ...(anterior ?? [])]) {
    const clave = item?.id || `${item?.fecha}|${item?.accion}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(item);
  }
  return salida;
}

/**
 * Reaplica la INTENCIÓN de la operación sobre el periodo persistido: sólo los
 * campos que de verdad cambió respecto de su lectura base. Así el pago que
 * registró el otro cliente (justificante, estado, referencia) no desaparece
 * porque esta operación no lo tocara, y el cambio más reciente del usuario sí se
 * aplica. El historial se une: nunca se pierde una entrada de trazabilidad.
 */
export function reaplicarPeriodo(
  antes: CobroPeriodo | undefined,
  despues: CobroPeriodo,
  persistido: CobroPeriodo,
): CobroPeriodo {
  const resultado: CobroPeriodo = { ...persistido };
  const previo = (antes ?? {}) as unknown as Record<string, unknown>;
  const nuevo = despues as unknown as Record<string, unknown>;
  const destino = resultado as unknown as Record<string, unknown>;

  for (const clave of Object.keys(nuevo)) {
    if (clave === 'historialCambios') continue;
    if (!mismoValor(previo[clave], nuevo[clave])) destino[clave] = nuevo[clave];
  }

  resultado.historialCambios = unirHistorial(despues.historialCambios, persistido.historialCambios);
  resultado.ultimaModificacion = despues.ultimaModificacion || persistido.ultimaModificacion;
  return resultado;
}

/** Diferencia «antes → después» como escrituras declaradas de periodo. */
export function escriturasPorDiferencia(
  antes: CobroPeriodo[] | undefined,
  despues: CobroPeriodo[] | undefined,
  politica: PoliticaConflicto,
): EscrituraPeriodo[] {
  const indiceAntes = indicePeriodos(antes);
  const salida: EscrituraPeriodo[] = [];
  for (const periodo of despues ?? []) {
    if (!periodo?.id) continue;
    const previo = indiceAntes.get(periodo.id);
    if (previo && mismoPeriodo(previo, periodo)) continue;
    salida.push({ despues: periodo, antes: previo, politica });
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Fusión del calendario
// ---------------------------------------------------------------------------

export interface ResultadoFusionPeriodos {
  /** `undefined` ⇒ el campo `registroCobros` no se escribe. */
  cobros: CobroPeriodo[] | undefined;
  escritos: string[];
  descartados: string[];
  reaplicados: string[];
}

/**
 * Aplica las escrituras declaradas sobre el calendario PERSISTIDO.
 *
 * Conserva el orden persistido (y añade los periodos nuevos al final) para no
 * reordenar el documento en cada guardado.
 */
export function fusionarPeriodos(
  persistidos: CobroPeriodo[] | undefined,
  escrituras: EscrituraPeriodo[],
  modo: ModoCobros,
): ResultadoFusionPeriodos {
  if (modo === 'CONSERVAR') {
    return { cobros: undefined, escritos: [], descartados: [], reaplicados: [] };
  }

  const base = persistidos ?? [];
  const mapa = indicePeriodos(base);
  const escritos: string[] = [];
  const descartados: string[] = [];
  const reaplicados: string[] = [];
  const resultado: CobroPeriodo[] = [...base];

  const colocar = (periodo: CobroPeriodo) => {
    const posicion = resultado.findIndex((p) => p.id === periodo.id);
    if (posicion >= 0) resultado[posicion] = periodo;
    else resultado.push(periodo);
    mapa.set(periodo.id, periodo);
  };

  for (const escritura of escrituras) {
    const despues = escritura.despues;
    const id = despues?.id;
    if (!id) continue;
    const persistido = mapa.get(id);

    // ---- Alta: se conserva la historia persistida; sólo se crea lo que falta.
    if (modo === 'CREAR_SOLO_NUEVOS') {
      if (persistido) {
        if (!tieneDatosEconomicos(persistido) && tieneDatosEconomicos(despues)) {
          colocar(despues);
          escritos.push(id);
          reaplicados.push(id);
        }
        continue;
      }
      colocar(despues);
      escritos.push(id);
      continue;
    }

    if (!persistido) {
      // Periodo nuevo (materialización, importación, alta): se crea. El id es
      // determinista (contrato + año + mes), así que no puede duplicarse.
      colocar(despues);
      escritos.push(id);
      if (escritura.antes) reaplicados.push(id);
      continue;
    }

    // Integridad: el periodo persistido no puede pertenecer a otro contrato.
    if (despues.contratoId && persistido.contratoId && despues.contratoId !== persistido.contratoId) {
      throw new ErrorConflictoContrato(`el periodo ${id} pertenece a otro contrato`);
    }

    // ---- Idempotencia: el contenido a escribir ya está persistido.
    if (mismoPeriodo(persistido, despues)) continue;

    const sinConflicto = escritura.antes ? mismoPeriodo(escritura.antes, persistido) : false;
    if (sinConflicto) {
      colocar(despues);
      escritos.push(id);
      continue;
    }

    // ---- Conflicto: lo persistido cambió desde la lectura base de la operación.
    if (escritura.politica === 'descartar') {
      // Materialización / refresco automático: se conserva el dato más reciente.
      descartados.push(id);
      continue;
    }

    if (escritura.antes) {
      // Escritura del usuario: se reaplica SU intención sobre el estado fresco.
      colocar(reaplicarPeriodo(escritura.antes, despues, persistido));
      escritos.push(id);
      reaplicados.push(id);
      continue;
    }

    // Creación en colisión: nunca se descarta un pago; si el persistido no tiene
    // datos económicos, manda la operación que sí los aporta.
    if (!tieneDatosEconomicos(persistido) && tieneDatosEconomicos(despues)) {
      colocar(despues);
      escritos.push(id);
      reaplicados.push(id);
    } else {
      descartados.push(id);
    }
  }

  if (escritos.length === 0) {
    return { cobros: undefined, escritos, descartados, reaplicados };
  }
  return { cobros: resultado, escritos, descartados, reaplicados };
}

// ---------------------------------------------------------------------------
// Campos monotónicos del contrato
// ---------------------------------------------------------------------------

type Firmas = Pick<ContratoFormalizacion, 'firmaArrendador' | 'firmaArrendatario'>;

/**
 * La firma es MONOTÓNICA frente a instantáneas viejas: una operación que leyó el
 * contrato sin firmar no puede desmarcar una firma que otro cliente estampó
 * después. Desmarcar exige haber visto la firma (acción explícita del usuario).
 */
function firmasProtegidas(
  contrato: ContratoFormalizacion,
  persistido: ContratoFormalizacion,
  base: ContratoFormalizacion | null | undefined,
): Firmas | undefined {
  const protegidas: Partial<Firmas> = {};
  for (const campo of ['firmaArrendador', 'firmaArrendatario'] as const) {
    const entrante = contrato[campo];
    const guardada = persistido[campo];
    if (!entrante || !guardada) continue;
    if (!guardada.firmado || entrante.firmado) continue;
    // Desmarcar sólo es legítimo si el usuario VIO la firma (acción explícita).
    if (base && base[campo]?.firmado) continue;
    protegidas[campo] = guardada;
  }
  return Object.keys(protegidas).length > 0 ? (protegidas as Firmas) : undefined;
}

/** Unión de índices de capacidad: un guardado viejo no puede quitarlos. */
function unionLista(entrante: string[] | undefined, persistida: string[] | undefined): string[] | undefined {
  if (!persistida?.length) return undefined;
  const valores = new Set([...(persistida ?? []), ...(entrante ?? [])]);
  if ((entrante ?? []).length === valores.size) return undefined; // ya los tiene todos
  return [...valores];
}

/** Unión del historial contractual por id (append-only). */
function unionHistorialContrato(
  entrante: ContratoFormalizacion['historial'],
  persistido: ContratoFormalizacion['historial'],
): ContratoFormalizacion['historial'] | undefined {
  if (!persistido?.length) return undefined;
  const vistos = new Set((entrante ?? []).map((h) => h?.id ?? `${h?.fecha}|${h?.accion}`));
  const extra = (persistido ?? []).filter((h) => !vistos.has(h?.id ?? `${h?.fecha}|${h?.accion}`));
  if (extra.length === 0) return undefined;
  return [...(entrante ?? []), ...extra];
}

/**
 * ¿El documento persistido cambió desde la instantánea de la operación?
 * Se compara por contenido (ignorando marcas accesorias) para no confundir un
 * `fechaActualizacion` nuevo del propio usuario con una modificación ajena.
 */
export function detectarCambioConcurrente(
  base: ContratoFormalizacion | null | undefined,
  persistido: ContratoFormalizacion | null | undefined,
): boolean {
  if (!base || !persistido) return false;
  const claves = new Set([...Object.keys(base), ...Object.keys(persistido)]);
  for (const clave of claves) {
    if (CLAVES_ACCESORIAS.has(clave) || clave === 'fechaActualizacion') continue;
    if (!mismoValor(
      (base as unknown as Record<string, unknown>)[clave],
      (persistido as unknown as Record<string, unknown>)[clave],
    )) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Fusión del documento
// ---------------------------------------------------------------------------

/**
 * Calcula el documento a escribir a partir del contrato de la operación, el
 * estado persistido y la política de fusión. NO escribe: `firebase.ts` envuelve
 * esta función en `runTransaction`.
 */
export function fusionarContratoParaPersistencia(entrada: EntradaFusionContrato): SalidaFusionContrato {
  const { contrato, persistido, base, modoCobros, escrituras = [], omitirCampos = [] } = entrada;

  const fusion = fusionarPeriodos(persistido?.registroCobros, escrituras, modoCobros);

  // Se parte del contrato completo de la operación: los cinco flujos siguen
  // guardando la ficha entera. Lo que NUNCA se hereda de la instantánea vieja es
  // el calendario de cobros: se sustituye por la fusión.
  const datos: Record<string, unknown> = { ...(contrato as unknown as Record<string, unknown>) };
  datos.id = contrato.id;

  if (fusion.cobros !== undefined) {
    datos.registroCobros = fusion.cobros;
  } else if (persistido && modoCobros !== 'CONSERVAR') {
    // Nada que fusionar: se escribe el calendario persistido tal cual (nunca el
    // array vacío o viejo que traiga la instantánea del cliente).
    datos.registroCobros = persistido.registroCobros ?? [];
  } else if (persistido) {
    // Cierre / edición de cláusulas: el calendario no se toca. Se deja
    // EXACTAMENTE el persistido (puede tener pagos registrados después de la
    // lectura base).
    datos.registroCobros = persistido.registroCobros;
  }
  // Alta (documento inexistente): manda el calendario del contrato de la operación.

  let cambioConcurrente = false;
  if (persistido) {
    cambioConcurrente = detectarCambioConcurrente(base, persistido);

    const firmas = firmasProtegidas(contrato, persistido, base);
    if (firmas) Object.assign(datos, firmas);

    const historial = unionHistorialContrato(
      contrato.historial as ContratoFormalizacion['historial'],
      persistido.historial as ContratoFormalizacion['historial'],
    );
    if (historial) datos.historial = historial;

    const incidencias = unionLista(contrato.incidenciaIds, persistido.incidenciaIds);
    if (incidencias) datos.incidenciaIds = incidencias;
    const mensajes = unionLista(contrato.mensajeIds, persistido.mensajeIds);
    if (mensajes) datos.mensajeIds = mensajes;
  }

  for (const campo of omitirCampos) delete datos[campo];

  // ¿Hay algo que escribir? Si el documento no existe (alta) sí. Si existe, se
  // compara lo que se va a escribir con lo persistido: un guardado idéntico no
  // genera escritura, así que reintentar es idempotente.
  let hayCambios = true;
  if (persistido) {
    hayCambios = false;
    for (const [clave, valor] of Object.entries(datos)) {
      if (!mismoValor(valor, (persistido as unknown as Record<string, unknown>)[clave])) {
        hayCambios = true;
        break;
      }
    }
  }

  return {
    datos,
    hayCambios,
    periodosEscritos: fusion.escritos,
    periodosDescartados: fusion.descartados,
    periodosReaplicados: fusion.reaplicados,
    cambioConcurrente,
  };
}

/**
 * Contrato que la aplicación debe mostrar tras confirmar la escritura.
 *
 * No es la instantánea del cliente: es el DOCUMENTO PERSISTIDO superpuesto a la
 * ficha que la operación quería guardar. Así la pantalla incorpora enseguida los
 * pagos y periodos que otro cliente escribió mientras tanto, en lugar de seguir
 * mostrando la lectura vieja hasta el siguiente snapshot.
 */
export function contratoTrasPersistir(
  contratoOperacion: ContratoFormalizacion,
  documentoPersistido: ContratoFormalizacion,
): ContratoFormalizacion {
  return { ...contratoOperacion, ...documentoPersistido, id: documentoPersistido.id || contratoOperacion.id };
}
