/**
 * B4 — Motor del dry-run de migración histórica.
 *
 * `ejecutarDryRun()` es PURA y determinista: misma entrada ⇒ mismo resultado
 * byte a byte. No lee Firestore/Storage (catálogos inyectados), no escribe en
 * ningún sistema, no usa reloj ni azar, no depende del orden de entrada (las
 * líneas se procesan ordenadas por `migrationKey`).
 *
 * Garantías de decisión (§17/§24): AUTO solo con resolución inequívoca;
 * INCOMPLETO/BLOQUEADO/REVISIÓN/NO_MIGRABLE nunca se convierten en AUTO.
 */
import { sha256Hex } from '../importacion/hash';
import { claveOrigen } from '../importacion/dedup';
import type {
  CatalogosMigracion,
  ClasificacionDuplicado,
  ConfianzaPropuesta,
  DecisionMigracion,
  DestinoPropuesto,
  DryRunResult,
  EstadoMigracion,
  EstadoResolucion,
  LineaDryRun,
  Proveniencia,
  RegistroHistorico,
  ResolucionDestino,
  ResumenDryRun,
} from './tipos';
import { ENTIDADES_MIGRABLES } from './tipos';
import { resolverInmueble, resolverPropietario, viaInmuebleAptaAuto } from './resolucion';
import { evaluarRelaciones, resolverContrato } from './relaciones';
import {
  clasificarB4,
  huellasCobro,
  huellasGasto,
  indicesDesdeExistentesDestino,
  registrarHuellas,
  type HuellasLinea,
} from './duplicados';
import {
  chequearCompletitud,
  clasificarFiscal,
  proponerDestino,
  tipoDocumentalDeclarado,
} from './entidades';

export interface EntradaDryRun {
  registros: readonly RegistroHistorico[];
  catalogos: CatalogosMigracion;
  /** Fecha/actor inyectados (opacos; solo etiquetan el informe). */
  fechaHora?: string;
  actor?: string;
  esquemaVersion?: string;
  importadorVersion?: string;
}

/** JSON estable: claves ordenadas recursivamente (base de hashes). */
export function jsonEstable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(jsonEstable).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${jsonEstable(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

function clonar<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function textoPlano(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function numeroValido(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** migrationKey (§16): sha256(sistema|origen|sourceId|entidad). Estable entre ejecuciones. */
export function calcularMigrationKey(proveniencia: Proveniencia, entidad: string): string {
  const origen = proveniencia.sourceCollection ?? proveniencia.sourceFile ?? '';
  return sha256Hex([proveniencia.source, origen, proveniencia.sourceId, entidad].join('|'));
}

interface LineaEnConstruccion {
  key: string;
  registro: RegistroHistorico;
  datoOriginal: Record<string, unknown>;
  lectura: Record<string, unknown>;
  normalizadoDestino?: Record<string, unknown>;
  transformacion: string;
  propietario: ResolucionDestino;
  inmueble: ResolucionDestino & { via: 'ID_CANONICO' | 'MAPEO' | 'IDS_ORIGEN' | 'CATASTRAL' | 'DIRECCION' | 'NINGUNA' };
  contrato: ResolucionDestino | null;
  estado: EstadoMigracion;
  decision: DecisionMigracion;
  motivo: string;
  evidencias: string[];
  confianza: ConfianzaPropuesta;
  duplicado: ClasificacionDuplicado;
  destino: DestinoPropuesto | null;
  origenId: string | null;
}

function decidirLinea(
  l: LineaEnConstruccion,
  rel: ReturnType<typeof evaluarRelaciones>,
  comp: ReturnType<typeof chequearCompletitud>,
  esConflictoDedup: boolean,
  catalogos: CatalogosMigracion,
): void {
  const n = l.registro.normalizado;
  const incidenciasBloqueantes = (n?.incidencias ?? []).filter((i) => i.severidad === 'BLOQUEANTE');
  const requiereValidacion = (n?.incidencias ?? []).some((i) => i.severidad === 'REQUIERE_VALIDACION')
    || (n?.camposRequierenValidacion?.length ?? 0) > 0;

  const fijar = (estado: EstadoMigracion, decision: DecisionMigracion, motivo: string, confianza: ConfianzaPropuesta) => {
    l.estado = estado;
    l.decision = decision;
    l.motivo = motivo;
    l.confianza = confianza;
  };

  // 1) Entidad sin mapeo (salvo marca estructural B1, que tiene motivo propio).
  const marcaEstructuralB1 = n && (n.entidad === 'TRUNCADO' || n.entidad === 'DESCONOCIDO');
  if (!(ENTIDADES_MIGRABLES as readonly string[]).includes(l.registro.entidad) && !marcaEstructuralB1) {
    fijar('NO_MIGRABLE', 'NO_MIGRABLE', `entidad '${l.registro.entidad}' sin mapeo a modelo destino (no se inventa canal)`, 'ALTA');
    return;
  }
  // 2) Estructuralmente irrecuperable (B1).
  if (marcaEstructuralB1 && n) {
    fijar('NO_MIGRABLE', 'NO_MIGRABLE', `registro ${n.entidad.toLowerCase()} en origen (sin datos recuperables; se conserva la evidencia)`, 'ALTA');
    return;
  }
  // 3) Conflictos (dedup, ambigüedades, incidencias bloqueantes B1).
  const conflictos: string[] = [];
  if (esConflictoDedup) conflictos.push(`conflicto de duplicidad: ${l.duplicado.motivo}`);
  if (l.propietario.estado === 'BLOQUEADO') conflictos.push(`propietario: ${l.propietario.evidencia}`);
  if (l.inmueble.estado === 'BLOQUEADO') conflictos.push(`inmueble: ${l.inmueble.evidencia}`);
  if (l.contrato?.estado === 'BLOQUEADO') conflictos.push(`contrato: ${l.contrato.evidencia}`);
  for (const b of rel.bloqueos) conflictos.push(b);
  if (l.duplicado.tipo === 'EXACTO') conflictos.push(`duplicado exacto: ${l.duplicado.motivo}`);
  for (const i of incidenciasBloqueantes) conflictos.push(`B1 bloqueante [${i.codigo}]: ${i.detalle}`);
  if (n?.bloqueado && n.motivoBloqueo) conflictos.push(`B1: ${n.motivoBloqueo}`);
  // ORDEN 6 (revisión): coherencia cruzada. Una contradicción entre señales
  // resueltas NUNCA es AUTO: propietario ≠ titular del inmueble, o contrato
  // de otro inmueble ⇒ BLOQUEADO. Solo salta con ambos lados resueltos y
  // titular/contrato documentados (sin titular documentado no hay contradicción
  // demostrable y no se bloquea).
  if (l.propietario.id && l.inmueble.id && COHERENCIA_TITULAR.has(l.registro.entidad)) {
    const fichas = catalogos.inmuebles.filter((i) => i.id === l.inmueble.id);
    const titular = fichas.length === 1 ? textoPlano(fichas[0].propietarioId) : null;
    if (titular && titular !== l.propietario.id) {
      conflictos.push(`conflicto de titularidad: propietario destino '${l.propietario.id}' ≠ titular '${titular}' del inmueble '${l.inmueble.id}' (contradicción entre señales; requiere humano)`);
    }
  }
  if (l.contrato?.id && l.inmueble.id && (l.registro.entidad === 'COBRO' || l.registro.entidad === 'CONTRATO')) {
    const fichas = catalogos.contratos.filter((c) => c.id === l.contrato?.id);
    if (fichas.length === 1 && fichas[0].inmuebleId !== l.inmueble.id) {
      conflictos.push(`conflicto contrato↔inmueble: contrato '${l.contrato.id}' pertenece a '${fichas[0].inmuebleId}' pero la línea resuelve '${l.inmueble.id}' (contradicción; requiere humano)`);
    }
  }
  if (conflictos.length > 0) {
    fijar('BLOQUEADO', 'BLOQUEADO', conflictos.sort()[0], 'ALTA');
    l.evidencias.push(...conflictos.sort().slice(1, 4));
    return;
  }
  // 4) Incompletos (faltan datos, sin conflicto). Si hay match existente
  // (VINCULAR), los descriptivos del histórico no bloquean: el destino ya
  // tiene los datos (autocorrección B4: sin falsos negativos).
  const esVincular = matchExistente(l) !== null;
  const faltan: string[] = [];
  if (l.propietario.estado === 'INCOMPLETO' && necesitaPropietario(l.registro.entidad)) faltan.push(`propietario: ${l.propietario.evidencia}`);
  if (l.inmueble.estado === 'INCOMPLETO' && necesitaInmueble(l.registro.entidad)) faltan.push(`inmueble: ${l.inmueble.evidencia}`);
  if (l.contrato?.estado === 'INCOMPLETO' && l.registro.entidad === 'COBRO') faltan.push(`contrato: ${l.contrato.evidencia}`);
  for (const f of rel.faltantes) faltan.push(f);
  if (!esVincular) {
    for (const c of comp.faltantes) faltan.push(`campo necesario ausente: ${c}`);
  }
  if (faltan.length > 0) {
    fijar('INCOMPLETO', 'INCOMPLETO', faltan.sort()[0], 'ALTA');
    l.evidencias.push(...faltan.sort().slice(1, 4));
    return;
  }
  // 5) Topes de REVISIÓN (propuesta razonable, requiere humano).
  const revisiones: string[] = [];
  // ORDEN 6 (revisión §10): sin sourceId recuperable (o sin fuente) no hay
  // trazabilidad suficiente para AUTO: la trazabilidad queda limitada al hash.
  if (!l.origenId || !textoPlano(l.registro.proveniencia.source)) {
    revisiones.push('proveniencia insuficiente para AUTO (sourceId no recuperable o fuente ausente; trazabilidad limitada al hash)');
  }
  if (l.duplicado.tipo === 'PROBABLE') revisiones.push(`duplicado probable: ${l.duplicado.motivo}`);
  if (requiereValidacion) revisiones.push('B1 exige validación humana (camposRequierenValidacion o incidencia REQUIERE_VALIDACION)');
  if (l.inmueble.id && !viaInmuebleAptaAuto(l.inmueble.via)) revisiones.push(`inmueble por vía no determinista (${l.inmueble.via}): ${l.inmueble.evidencia}`);
  // §14: B4 NUNCA asocia por nombre de fichero (no parsea filenames): los
  // documentos sin entidad caen en INCOMPLETO por relación (paso 4), y la vía
  // DIRECCION (texto declarado) topa a REVISIÓN. Sin código muerto.
  // (VINCULAR: el destino existe; los recomendados del histórico no topan.)
  const esVincularDestino = matchExistente(l) !== null;
  if (!esVincularDestino) {
    for (const c of comp.recomendadosAusentes) revisiones.push(`recomendado ausente: ${c}`);
  }
  const destino = proponerDestino({
    entidad: l.registro.entidad,
    lectura: l.lectura,
    propiedadId: l.propietario.id,
    inmuebleId: l.inmueble.id,
    contratoId: l.contrato?.id ?? null,
    origenId: l.origenId,
    matchExistenteId: matchExistente(l),
  });
  l.destino = destino;
  if (!destino) {
    revisiones.push('sin destino proponible (falta id determinista computable)');
  } else if (destino.destinoId === null) {
    revisiones.push(`destino ${destino.operacion} en '${destino.coleccion}' sin id asignable (lo asigna la confirmación humana)`);
  }
  if (revisiones.length > 0) {
    fijar('REVISION', 'REVISION', revisiones.sort()[0], 'MEDIA');
    l.evidencias.push(...revisiones.sort().slice(1, 4));
    return;
  }
  // 6) AUTO: resolución inequívoca + destino computable.
  if (!destino || destino.destinoId === null) {
    fijar('REVISION', 'REVISION', 'sin destino computable (salvaguarda; requiere humano)', 'MEDIA');
    return;
  }
  l.evidencias.push(`destino ${destino.operacion} '${destino.coleccion}/${destino.destinoId}'`);
  fijar('COMPLETO', 'AUTO', 'resolución inequívoca con destino determinista computable', 'ALTA');
}

function necesitaPropietario(entidad: string): boolean {
  return entidad !== 'PROPIETARIO';
}

function necesitaInmueble(entidad: string): boolean {
  return entidad === 'GASTO' || entidad === 'COBRO' || entidad === 'CONTRATO';
}

/**
 * Entidades donde propietario e inmueble resueltos deben ser coherentes con
 * la titularidad documentada (ORDEN 6). PROPIETARIO se excluye: una mención
 * de dirección en la ficha de una persona es descriptiva, no titularidad.
 * LEGACY_STORAGE se excluye: no resuelve inmueble (el pid ES el propietario).
 */
const COHERENCIA_TITULAR: ReadonlySet<string> = new Set([
  'GASTO', 'COBRO', 'CONTRATO', 'INMUEBLE', 'DOCUMENTO',
]);

/** Id existente cuando la resolución fue por match determinista (VINCULAR). */
function matchExistente(l: LineaEnConstruccion): string | null {
  if (l.registro.entidad === 'INMUEBLE') return l.inmueble.id;
  if (l.registro.entidad === 'PROPIETARIO') return l.propietario.id;
  if (l.registro.entidad === 'CONTRATO') return l.contrato?.id ?? null;
  return null;
}

function extraerOrigenId(proveniencia: Proveniencia): string | null {
  const id = proveniencia.sourceId;
  if (!id || id.startsWith('__ID_NO_RECUPERADO_')) return null;
  return id;
}

function construirHuellas(
  l: LineaEnConstruccion,
  clave: string | null,
  idDestino: string | null,
): HuellasLinea | null {
  const lec = l.lectura;
  if (l.registro.entidad === 'GASTO') {
    // ORDEN 6 (revisión): el alias `fecha` que acepta completitud también
    // alimenta la huella; ignorarlo producía falsos EXACTO entre gastos que
    // solo difieren en `fecha`.
    return huellasGasto({
      inmuebleId: l.inmueble.id,
      importe: numeroValido(lec['importe']),
      categoria: textoPlano(lec['categoria']),
      fechaDevengo: textoPlano(lec['fechaDevengo'] ?? lec['fecha']),
      concepto: textoPlano(lec['concepto'] ?? lec['description']),
      claveOrigen: clave,
      idDestino,
    });
  }
  if (l.registro.entidad === 'COBRO') {
    const mes = lec['mes'];
    const anio = lec['anio'];
    return huellasCobro({
      inmuebleId: l.inmueble.id,
      importe: numeroValido(lec['importe']),
      mes: typeof mes === 'number' ? mes : null,
      anio: typeof anio === 'number' ? anio : null,
      concepto: textoPlano(lec['concepto'] ?? lec['description']),
      claveOrigen: clave,
      idDestino,
    });
  }
  return null;
}

export function ejecutarDryRun(entrada: EntradaDryRun): DryRunResult {
  const { catalogos } = entrada;
  const fechaHora = entrada.fechaHora ?? null;
  const actor = entrada.actor ?? null;

  // 1) Ingesta: clonar + migrationKey + sourceHash + orden determinista.
  const preparadas = entrada.registros.map((r, i) => {
    const datoOriginal = clonar(r.datos ?? {});
    const proveniencia: Proveniencia = {
      ...r.proveniencia,
      sourceHash: r.proveniencia.sourceHash ?? sha256Hex(jsonEstable(datoOriginal)),
    };
    return { registro: { entidad: r.entidad, proveniencia, datos: datoOriginal, normalizado: r.normalizado }, indice: i };
  });
  const withKeys = preparadas.map((p) => ({
    ...p,
    key: calcularMigrationKey(p.registro.proveniencia, p.registro.entidad),
  }));
  withKeys.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.indice - b.indice));

  // 2) Índices de dedup: existentes destino + avance del lote (orden migrationKey).
  const indices = indicesDesdeExistentesDestino(catalogos.existentes);
  const previas = new Map<string, { fechaDevengo: string | null; conceptoNorm: string | null }>();
  for (const e of catalogos.existentes) {
    previas.set(e.destinoId, { fechaDevengo: null, conceptoNorm: null });
  }

  // 3) Líneas.
  const lineas: LineaDryRun[] = [];
  const keysVistas = new Set<string>();
  const destinosVinculados = new Map<string, string>();
  for (const { registro, key } of withKeys) {
    // §10: mismo source+sourceId+entidad dos veces ⇒ duplicado exacto en lote.
    const duplicadoEnLote = keysVistas.has(key);
    keysVistas.add(key);
    const n = registro.normalizado;
    const normalizadoDestino = n ? { ...(n.destino as Record<string, unknown>) } : undefined;
    const lectura: Record<string, unknown> = { ...registro.datos, ...(normalizadoDestino ?? {}) };
    const transformacion = n
      ? `B1:${n.entidad} (${n.transformaciones.length} transformaciones, ${n.incidencias.length} incidencias)`
      : 'NINGUNA';

    const l: LineaEnConstruccion = {
      key,
      registro,
      datoOriginal: clonar(registro.datos),
      lectura,
      normalizadoDestino,
      transformacion,
      propietario: { id: null, estado: 'INCOMPLETO', evidencia: 'pendiente' },
      inmueble: { id: null, estado: 'INCOMPLETO', evidencia: 'pendiente', via: 'NINGUNA' },
      contrato: null,
      estado: 'INCOMPLETO',
      decision: 'INCOMPLETO',
      motivo: 'pendiente',
      evidencias: [],
      confianza: 'BAJA',
      duplicado: { tipo: 'NINGUNO', con: [], motivo: 'pendiente' },
      destino: null,
      origenId: extraerOrigenId(registro.proveniencia),
    };

    const esMigrable = (ENTIDADES_MIGRABLES as readonly string[]).includes(registro.entidad);
    const propertyId = textoPlano(lectura['propertyId']);
    const clavePropertyId = propertyId ? `${registro.proveniencia.source}:${propertyId}` : null;
    const claveRegistro = l.origenId ? claveOrigen(registro.proveniencia.source, l.origenId) : null;
    // Autocorrección B4: el `id` propio del registro histórico es candidato a
    // id canónico para su entidad (sin mutar el original: copia operativa).
    const datosResolucion: Record<string, unknown> = { ...registro.datos };
    const idPropio = textoPlano(lectura['id']);
    if (idPropio) {
      if (registro.entidad === 'INMUEBLE' && !textoPlano(datosResolucion['inmuebleId'])) datosResolucion['inmuebleId'] = idPropio;
      if (registro.entidad === 'CONTRATO' && !textoPlano(datosResolucion['contratoId'])) datosResolucion['contratoId'] = idPropio;
      if (registro.entidad === 'PROPIETARIO' && !textoPlano(datosResolucion['propietarioId'])) datosResolucion['propietarioId'] = idPropio;
    }

    if (esMigrable && !(n && (n.entidad === 'TRUNCADO' || n.entidad === 'DESCONOCIDO'))) {
      // Inmueble → propietario (titular) → contrato.
      l.inmueble = resolverInmueble({ datos: datosResolucion, normalizadoDestino, clavePropertyId, catalogos });
      l.propietario = resolverPropietario({
        entidad: registro.entidad,
        datos: datosResolucion,
        normalizadoDestino,
        claveOrigen: claveRegistro,
        inmuebleResueltoId: l.inmueble.id,
        catalogos,
      });
      if (registro.entidad === 'COBRO' || registro.entidad === 'CONTRATO') {
        l.contrato = resolverContrato({ datos: datosResolucion, normalizadoDestino, claveOrigen: claveRegistro, catalogos });
      }
    }

    const comp = chequearCompletitud(registro.entidad, lectura);
    const rel = evaluarRelaciones({
      entidad: registro.entidad,
      datos: lectura,
      propietario: l.propietario,
      inmueble: l.inmueble,
      contrato: l.contrato,
    });

    // Dedup (gastos/cobros con huellas computables).
    let esConflictoDedup = false;
    const idDestinoPrevio = proponerDestino({
      entidad: registro.entidad,
      lectura,
      propiedadId: l.propietario.id,
      inmuebleId: l.inmueble.id,
      contratoId: l.contrato?.id ?? null,
      origenId: l.origenId,
      matchExistenteId: matchExistente(l),
    })?.destinoId ?? null;
    const huellas = esMigrable ? construirHuellas(l, claveRegistro, idDestinoPrevio) : null;
    if (huellas && (huellas.claveOrigen || huellas.huella || huellas.huellaFuerte || huellas.claveImporte || huellas.idDestino)) {
      const v = clasificarB4(huellas, indices, previas);
      l.duplicado = v.clasificacion;
      esConflictoDedup = v.esConflicto;
      registrarHuellas(indices, huellas, key);
      previas.set(idDestinoPrevio ?? key, { fechaDevengo: huellas.fechaDevengo, conceptoNorm: huellas.conceptoNorm });
      previas.set(key, { fechaDevengo: huellas.fechaDevengo, conceptoNorm: huellas.conceptoNorm });
    } else {
      l.duplicado = { tipo: 'NINGUNO', con: [], motivo: 'sin huellas computables (entidad no gasto/cobro o datos insuficientes)' };
    }

    decidirLinea(l, rel, comp, esConflictoDedup, catalogos);

    // §10 intra-lote (autocorrección B4): sourceId repetido ⇒ BLOQUEADO;
    // mismo destino VINCULAR desde 2 orígenes ⇒ REVISIÓN. Solo se baja, nunca se sube.
    if (duplicadoEnLote) {
      l.duplicado = { tipo: 'EXACTO', con: [key], motivo: 'registro duplicado en el lote (mismo source+sourceId+entidad)' };
      l.estado = 'BLOQUEADO';
      l.decision = 'BLOQUEADO';
      l.motivo = 'registro duplicado en el lote (mismo source+sourceId+entidad)';
      l.confianza = 'ALTA';
    } else if (l.decision === 'AUTO' && l.destino?.operacion === 'VINCULAR' && l.destino.destinoId) {
      const previo = destinosVinculados.get(l.destino.destinoId);
      if (previo) {
        l.estado = 'REVISION';
        l.decision = 'REVISION';
        l.motivo = `mismo destino '${l.destino.destinoId}' propuesto por 2 orígenes (requiere humano)`;
        l.confianza = 'MEDIA';
        l.evidencias.push(`colisiona con ${previo}`);
      } else {
        destinosVinculados.set(l.destino.destinoId, key);
      }
    }

    const fiscal = clasificarFiscal({ entidad: registro.entidad, datos: registro.datos, normalizadoDestino });
    const linea: LineaDryRun = {
      migrationKey: key,
      proveniencia: registro.proveniencia,
      entidad: registro.entidad,
      datoOriginal: l.datoOriginal,
      transformacion: l.transformacion,
      destinoPropuesto: l.destino,
      propietarioDestinoId: l.propietario.id,
      estadoPropietario: l.propietario.estado,
      evidenciaPropietario: l.propietario.evidencia,
      inmuebleDestinoId: l.inmueble.id,
      estadoInmueble: l.inmueble.estado,
      evidenciaInmueble: l.inmueble.evidencia,
      estado: l.estado,
      decision: l.decision,
      motivo: l.motivo,
      evidencias: [...l.evidencias],
      confianza: l.confianza,
      duplicado: l.duplicado,
      huerfano: rel.huerfano,
      relaciones: rel.relaciones,
      ...(fiscal ? { fiscal } : {}),
      ...(registro.entidad === 'LEGACY_STORAGE' ? {
        legacyStorage: {
          rutaOrigen: textoPlano(lectura['rutaOrigen'] ?? lectura['ruta']) ?? '',
          destinoPropuesto: l.destino?.destinoId ?? null,
          estado: (l.propietario.id ? 'RESUELTO' : l.propietario.estado) as EstadoResolucion,
          motivo: l.propietario.id
            ? `ruta con pid '${l.propietario.id}' (propuesta; migración física fuera de B4)`
            : `sin pid: ${l.propietario.evidencia}`,
        },
      } : {}),
      ...(registro.entidad === 'DOCUMENTO' ? {
        evidencias: [...l.evidencias, `tipo declarado: ${tipoDocumentalDeclarado(lectura)}`],
      } : {}),
    };
    lineas.push(linea);
  }

  const loteSha256 = sha256Hex(lineas.map((x) => x.migrationKey).join('|'));
  const resumen = construirResumen(lineas);
  return {
    soloLectura: true,
    loteSha256,
    esquemaVersion: entrada.esquemaVersion ?? 'b4-dryrun-v1',
    importadorVersion: entrada.importadorVersion ?? 'B4 sin persistencia',
    fechaHora,
    actor,
    lineas,
    resumen,
  };
}

// ---------------------------------------------------------------------------
// Resumen estructurado (§22): conteos + categorías con fuentes/ejemplos/motivo
// ---------------------------------------------------------------------------

function etiqueta(linea: LineaDryRun): string {
  return `${linea.proveniencia.source}:${linea.proveniencia.sourceId}`;
}

function categoriaDe(lineas: readonly LineaDryRun[], decision: string): {
  numero: number; fuentes: string[]; ejemplos: string[]; motivo: string;
} {
  const ls = lineas.filter((x) => x.decision === decision);
  const fuentes = [...new Set(ls.map((x) => x.proveniencia.source))].sort();
  const ejemplos = ls.slice(0, 5).map(etiqueta);
  const motivos = new Map<string, number>();
  for (const x of ls) motivos.set(x.motivo, (motivos.get(x.motivo) ?? 0) + 1);
  const top = [...motivos.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3);
  return {
    numero: ls.length,
    fuentes,
    ejemplos,
    motivo: top.length === 0 ? '—' : top.map(([m, c]) => `×${c} ${m}`).join(' ‖ '),
  };
}

function construirResumen(lineas: readonly LineaDryRun[]): ResumenDryRun {
  const cuenta = (d: string) => lineas.filter((x) => x.decision === d).length;
  const duplicados = lineas.filter((x) => x.duplicado.tipo === 'EXACTO' || x.duplicado.tipo === 'PROBABLE');
  const huerfanos = lineas.filter((x) => x.huerfano.es);
  const conflictos = lineas.filter((x) => x.decision === 'BLOQUEADO');
  const cat = (ls: readonly LineaDryRun[], motivo: string) => ({
    numero: ls.length,
    fuentes: [...new Set(ls.map((x) => x.proveniencia.source))].sort(),
    ejemplos: ls.slice(0, 5).map(etiqueta),
    motivo,
  });
  const topMotivos = (ls: readonly LineaDryRun[]): string => {
    const m = new Map<string, number>();
    for (const x of ls) m.set(x.motivo, (m.get(x.motivo) ?? 0) + 1);
    const top = [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3);
    return top.length === 0 ? '—' : top.map(([t, c]) => `×${c} ${t}`).join(' ‖ ');
  };
  const porFuente: ResumenDryRun['porFuente'] = {};
  for (const x of lineas) {
    const f = porFuente[x.proveniencia.source] ?? { total: 0, auto: 0, revision: 0, incompleto: 0, bloqueado: 0, noMigrable: 0 };
    f.total += 1;
    if (x.decision === 'AUTO') f.auto += 1;
    else if (x.decision === 'REVISION') f.revision += 1;
    else if (x.decision === 'INCOMPLETO') f.incompleto += 1;
    else if (x.decision === 'BLOQUEADO') f.bloqueado += 1;
    else f.noMigrable += 1;
    porFuente[x.proveniencia.source] = f;
  }
  return {
    totalRegistros: lineas.length,
    auto: cuenta('AUTO'),
    revision: cuenta('REVISION'),
    incompleto: cuenta('INCOMPLETO'),
    bloqueado: cuenta('BLOQUEADO'),
    noMigrable: cuenta('NO_MIGRABLE'),
    duplicados: duplicados.length,
    huerfanos: huerfanos.length,
    conflictos: conflictos.length,
    porCategoria: {
      AUTO: categoriaDe(lineas, 'AUTO'),
      REVISION: categoriaDe(lineas, 'REVISION'),
      INCOMPLETO: categoriaDe(lineas, 'INCOMPLETO'),
      BLOQUEADO: categoriaDe(lineas, 'BLOQUEADO'),
      NO_MIGRABLE: categoriaDe(lineas, 'NO_MIGRABLE'),
      DUPLICADOS: cat(duplicados, topMotivos(duplicados)),
      HUERFANOS: cat(huerfanos, topMotivos(huerfanos)),
      CONFLICTOS: cat(conflictos, topMotivos(conflictos)),
    },
    porFuente,
  };
}
