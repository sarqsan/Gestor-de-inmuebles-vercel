/**
 * INC-06 — Persistencia real de fichas patrimoniales y ejecución controlada
 * de importaciones (sobre la base patrimonial de Arena C integrada en 8a2fb20).
 * ---------------------------------------------------------------------------
 * PRINCIPIOS (D1R + S1–S7 + D2a/D2b/D3):
 *  · La ficha patrimonial VIVE en el documento EXISTENTE
 *    `propietarios/{propietarioId}` como subobjeto `fichaPatrimonial`: NO se
 *    duplica el propietario jurídico ni se crea una segunda fuente de verdad.
 *    Este servicio NUNCA crea propietarios (S3: crear ficha ≠ crear
 *    propietario ≠ crear cuenta ≠ conceder acceso).
 *  · `estadoAcceso` y `estadoDatos` siguen separados: el acceso se deriva
 *    SOLO del vínculo explícito de cuenta recibido por parámetro (nunca del
 *    usuario autenticado actual); los datos se evalúan con la política
 *    explícita de la ficha (módulo C, determinista y puro).
 *  · La importación exige `propietarioDestinoId` EXPLÍCITO, re-verificado
 *    contra el contexto en el momento de ejecutar (no se confía en una
 *    previsualización antigua). Sin autoasignación: ni cuenta actual, ni
 *    primer/único propietario, ni ficha abierta.
 *  · IDs deterministas por contenido+origen+destino; reejecución idempotente
 *    (SIN_CAMBIOS) y colisiones marcadas, nunca sobrescritas en silencio.
 *  · DRY-RUN preservado: `previsualizarImportacion` (módulo C) no escribe;
 *    este módulo solo escribe en la ejecución confirmada.
 *  · Auditoría integrada con el mecanismo EXISTENTE `audit_logs`
 *    (append-only por reglas): toda ejecución confirmada y toda operación de
 *    ficha registran actor, propietario, origen, resultado e incidencias.
 *
 * CAPAS: este fichero es el NÚCLEO (tipos, composición determinista y
 * orquestación sobre PUERTOS inyectados). El adaptador real de Firestore
 * vive en `patrimonialPersistenciaFirebase.ts` (único fichero que importa
 * Firebase). Los timestamps (`ahora`) y el actor se RECIBEN: nada de
 * `new Date()` oculto en la lógica de composición.
 */
import type {
  BorradorPropietario,
  ContextoDestinoImportacion,
  EstadoAcceso,
  EstadoDatos,
  EvaluacionDatos,
  IncidenciaRevision,
  ModalidadUso,
  PrevisualizacionImportacion,
  ReglasRevisionDatos,
} from '../features/patrimonial/contracts.ts';
import { evaluarCompletitud } from '../features/patrimonial/completeness.ts';
import { resolverDestinoImportacion } from '../features/patrimonial/importPreview.ts';

export const FICHA_PATRIMONIAL_ESQUEMA_VERSION = 1;
export const COLECCION_PROPIETARIOS = 'propietarios';
export const COLECCION_REGISTROS_PATRIMONIALES = 'registros_patrimoniales';

// ---------------------------------------------------------------------------
// Contratos persistentes
// ---------------------------------------------------------------------------

export interface ProcedenciaPatrimonial {
  /** Sistema de origen declarado (p. ej. 'RENTASYNC', 'PEGADO_MANUAL'). */
  readonly sistema: string;
  /** Id del registro en el origen; null si no es recuperable. */
  readonly origenId: string | null;
  readonly fuente: string | null;
  readonly loteId: string | null;
  readonly nota?: string;
}

/** Subobjeto `fichaPatrimonial` dentro de `propietarios/{id}`. */
export interface FichaPatrimonialPersistente {
  readonly version: number;
  readonly modalidad: ModalidadUso;
  readonly estadoAcceso: EstadoAcceso;
  readonly estadoDatos: EstadoDatos;
  readonly camposFaltantes: string[];
  readonly politicaId: string | null;
  readonly procedencia: ProcedenciaPatrimonial;
  readonly creadaEn: string;
  readonly actualizadaEn: string;
  /** usuarioId del actor de la última escritura. */
  readonly actualizadaPor: string;
}

/** Registro importado persistido en `registros_patrimoniales/{id}`. */
export interface RegistroPatrimonialPersistente {
  readonly id: string;
  readonly propietarioId: string;
  readonly loteId: string;
  readonly indiceOrigen: number;
  /** Copia íntegra del origen (campos desconocidos incluidos). */
  readonly datosOrigen: Record<string, unknown>;
  readonly estadoDatos: EstadoDatos;
  readonly camposFaltantes: string[];
  readonly politicaId: string | null;
  /** Solo decisiones ejecutables; los BLOQUEADO nunca se persisten. */
  readonly decision: 'CREARIA' | 'REVISAR';
  readonly incidencias: readonly IncidenciaRevision[];
  readonly procedencia: ProcedenciaPatrimonial;
  readonly creadaEn: string;
  readonly creadaPor: string;
}

export interface VinculoCuenta {
  readonly cuentaId: string | null;
  /** Cuenta vinculada Y activa. Sin cuenta activa nunca hay ACTIVO. */
  readonly cuentaActiva: boolean;
  readonly invitacionPendiente: boolean;
}

export interface ActorPatrimonial {
  readonly usuarioId: string;
  readonly email?: string;
  readonly nombre?: string;
}

// ---------------------------------------------------------------------------
// Puertos (inyectados: tests usan dobles locales; la app usa Firestore real)
// ---------------------------------------------------------------------------

export interface PuertoDocumentos {
  obtenerDocumento(coleccion: string, id: string): Promise<Record<string, unknown> | null>;
  /** Creación estricta: DEBE fallar si el documento ya existe (sin sobrescritura). */
  escribirDocumento(coleccion: string, id: string, datos: Record<string, unknown>): Promise<void>;
  /** Fusión explícita sobre documento existente (semántica merge). */
  fusionarDocumento(coleccion: string, id: string, datos: Record<string, unknown>): Promise<void>;
}

export interface EntradaAuditoriaPatrimonial {
  readonly accion: string;
  readonly descripcion: string;
  readonly entidadAfectada: 'propietario' | 'importacion_patrimonial';
  readonly idAfectado: string;
  readonly resultado: 'EXITO' | 'ERROR';
  readonly detalles: Record<string, unknown>;
  readonly usuarioId: string;
  readonly usuarioEmail: string;
  readonly usuarioNombre: string;
  readonly fechaHora: string;
}

export interface PuertoAuditoria {
  registrar(entrada: EntradaAuditoriaPatrimonial): Promise<void>;
}

export interface DependenciasPatrimoniales {
  readonly documentos: PuertoDocumentos;
  readonly auditoria: PuertoAuditoria;
}

// ---------------------------------------------------------------------------
// Utilidades deterministas
// ---------------------------------------------------------------------------

/** Stringify estable (claves ordenadas) para hashes y comparaciones. */
export function jsonEstable(valor: unknown): string {
  const vistos = new WeakSet<object>();
  function serializar(v: unknown): string {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
    if (vistos.has(v as object)) throw new Error('jsonEstable: referencia circular');
    vistos.add(v as object);
    if (Array.isArray(v)) return `[${v.map(serializar).join(',')}]`;
    const claves = Object.keys(v as Record<string, unknown>).sort();
    return `{${claves
      .map((c) => `${JSON.stringify(c)}:${serializar((v as Record<string, unknown>)[c])}`)
      .join(',')}}`;
  }
  return serializar(valor);
}

/** sha256 hex universal (WebCrypto: navegador y Node ≥ 19). Determinista. */
export async function sha256HexUniversal(entrada: string): Promise<string> {
  const cryptoGlobal = globalThis.crypto as Crypto | undefined;
  if (!cryptoGlobal?.subtle) throw new Error('WebCrypto no disponible en este entorno');
  const bytes = new TextEncoder().encode(entrada);
  const digest = await cryptoGlobal.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Id determinista de registro importado: mismo origen+contenido+destino ⇒ mismo id. */
export async function idDeterministaRegistro(p: {
  sistema: string;
  origenId: string | null;
  datosOrigen: Record<string, unknown>;
  propietarioDestinoId: string;
}): Promise<string> {
  const material = jsonEstable({
    sistema: p.sistema,
    origenId: p.origenId,
    // Sin id de origen la identidad la da el contenido íntegro del registro.
    contenido: p.origenId === null ? p.datosOrigen : null,
    propietarioDestinoId: p.propietarioDestinoId,
  });
  return `rp_${(await sha256HexUniversal(material)).slice(0, 40)}`;
}

/** Id determinista de lote: mismos sistema/fuente/destino/registros ⇒ mismo lote. */
export async function idDeterministaLote(p: {
  sistema: string;
  fuente: string | null;
  propietarioDestinoId: string;
  datosOrigen: readonly Record<string, unknown>[];
}): Promise<string> {
  const material = jsonEstable({
    sistema: p.sistema,
    fuente: p.fuente,
    propietarioDestinoId: p.propietarioDestinoId,
    datosOrigen: p.datosOrigen,
  });
  return `lote_pat_${(await sha256HexUniversal(material)).slice(0, 40)}`;
}

// ---------------------------------------------------------------------------
// Ficha patrimonial: composición pura (sin puertos, sin reloj)
// ---------------------------------------------------------------------------

/** Derivación EXPLÍCITA del estado de acceso. Nunca deducida del actor. */
export function estadoAccesoDesdeVinculo(vinculo: VinculoCuenta): EstadoAcceso {
  const tieneCuenta = typeof vinculo.cuentaId === 'string' && vinculo.cuentaId.trim().length > 0;
  if (tieneCuenta && vinculo.cuentaActiva) return 'ACTIVO';
  if (vinculo.invitacionPendiente) return 'INVITADO';
  return 'SIN_CUENTA';
}

export function componerFichaPatrimonial(p: {
  modalidad: ModalidadUso;
  vinculo: VinculoCuenta;
  datos: Readonly<BorradorPropietario>;
  reglas: ReglasRevisionDatos | null;
  procedencia: ProcedenciaPatrimonial;
  ahora: string;
  actorUsuarioId: string;
}): { ficha: FichaPatrimonialPersistente; evaluacion: EvaluacionDatos } {
  const evaluacion = evaluarCompletitud(p.datos, p.reglas);
  return {
    ficha: {
      version: FICHA_PATRIMONIAL_ESQUEMA_VERSION,
      modalidad: p.modalidad,
      estadoAcceso: estadoAccesoDesdeVinculo(p.vinculo),
      estadoDatos: evaluacion.estadoDatos,
      camposFaltantes: [...evaluacion.camposFaltantes],
      politicaId: evaluacion.politicaId,
      procedencia: p.procedencia,
      creadaEn: p.ahora,
      actualizadaEn: p.ahora,
      actualizadaPor: p.actorUsuarioId,
    },
    evaluacion,
  };
}

/** Semántica parcial EXPLÍCITA: solo cambian las claves presentes en `cambios`. */
export function aplicarCambiosParciales(
  datos: Readonly<BorradorPropietario>,
  cambios: Partial<Readonly<BorradorPropietario>>,
): BorradorPropietario {
  const resultado: Record<string, string> = { ...datos };
  for (const clave of Object.keys(cambios) as (keyof BorradorPropietario)[]) {
    const valor = cambios[clave];
    if (typeof valor === 'string') resultado[clave] = valor;
  }
  return {
    nombre: resultado.nombre ?? '',
    nifCif: resultado.nifCif ?? '',
    email: resultado.email ?? '',
    telefono: resultado.telefono ?? '',
  };
}

/** Extrae el borrador de ficha desde el documento propietario (campos base). */
export function borradorDesdePropietario(doc: Record<string, unknown>): BorradorPropietario {
  const texto = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    nombre: texto(doc.nombre),
    nifCif: texto(doc.nifCif),
    email: texto(doc.email),
    telefono: texto(doc.telefono),
  };
}

export function componerActualizacionFichaPatrimonial(p: {
  existente: FichaPatrimonialPersistente;
  datos: Readonly<BorradorPropietario>;
  reglas: ReglasRevisionDatos | null;
  /** Omitido ⇒ el estado de acceso NO cambia (explícito). */
  vinculo?: VinculoCuenta;
  /** Omitida ⇒ la modalidad NO cambia (explícito). */
  modalidad?: ModalidadUso;
  ahora: string;
  actorUsuarioId: string;
}): { ficha: FichaPatrimonialPersistente; evaluacion: EvaluacionDatos } {
  const evaluacion = evaluarCompletitud(p.datos, p.reglas);
  return {
    ficha: {
      ...p.existente,
      modalidad: p.modalidad ?? p.existente.modalidad,
      estadoAcceso: p.vinculo ? estadoAccesoDesdeVinculo(p.vinculo) : p.existente.estadoAcceso,
      estadoDatos: evaluacion.estadoDatos,
      camposFaltantes: [...evaluacion.camposFaltantes],
      politicaId: evaluacion.politicaId,
      actualizadaEn: p.ahora,
      actualizadaPor: p.actorUsuarioId,
    },
    evaluacion,
  };
}

function esFichaPersistente(v: unknown): v is FichaPatrimonialPersistente {
  return v !== null && typeof v === 'object'
    && typeof (v as FichaPatrimonialPersistente).version === 'number'
    && typeof (v as FichaPatrimonialPersistente).modalidad === 'string'
    && typeof (v as FichaPatrimonialPersistente).estadoAcceso === 'string'
    && typeof (v as FichaPatrimonialPersistente).estadoDatos === 'string';
}

// ---------------------------------------------------------------------------
// Servicios de ficha (orquestación sobre puertos)
// ---------------------------------------------------------------------------

export type ResultadoFicha =
  | {
      estado: 'OK';
      ficha: FichaPatrimonialPersistente;
      evaluacion: EvaluacionDatos;
      /** Códigos de incidencias no fatales (p. ej. auditoría fallida). */
      incidencias: string[];
    }
  | {
      estado: 'PROPIETARIO_NO_ENCONTRADO' | 'FICHA_YA_EXISTE' | 'FICHA_NO_EXISTE'
        | 'FICHA_INVALIDA' | 'ESCRITURA_FALLIDA';
      mensaje: string;
    };

async function auditarFicha(
  deps: DependenciasPatrimoniales,
  p: {
    accion: string;
    descripcion: string;
    propietarioId: string;
    actor: ActorPatrimonial;
    ahora: string;
    detalles: Record<string, unknown>;
  },
): Promise<boolean> {
  try {
    await deps.auditoria.registrar({
      accion: p.accion,
      descripcion: p.descripcion,
      entidadAfectada: 'propietario',
      idAfectado: p.propietarioId,
      resultado: 'EXITO',
      detalles: p.detalles,
      usuarioId: p.actor.usuarioId,
      usuarioEmail: p.actor.email ?? '',
      usuarioNombre: p.actor.nombre ?? '',
      fechaHora: p.ahora,
    });
    return true;
  } catch {
    return false;
  }
}

/** Crea la ficha sobre un propietario EXISTENTE. Nunca crea el propietario. */
export async function crearFichaPatrimonial(
  deps: DependenciasPatrimoniales,
  p: {
    propietarioId: string;
    modalidad: ModalidadUso;
    vinculo: VinculoCuenta;
    datos: Readonly<BorradorPropietario>;
    reglas: ReglasRevisionDatos | null;
    procedencia: ProcedenciaPatrimonial;
    actor: ActorPatrimonial;
    ahora: string;
  },
): Promise<ResultadoFicha> {
  const doc = await deps.documentos.obtenerDocumento(COLECCION_PROPIETARIOS, p.propietarioId);
  if (!doc) {
    return { estado: 'PROPIETARIO_NO_ENCONTRADO', mensaje: `El propietario ${p.propietarioId} no existe; crear propietario es otra operación (S3).` };
  }
  if (doc.fichaPatrimonial != null) {
    return { estado: 'FICHA_YA_EXISTE', mensaje: 'La ficha ya existe; usa la actualización explícita (sin sobrescritura silenciosa).' };
  }
  const { ficha, evaluacion } = componerFichaPatrimonial({
    modalidad: p.modalidad,
    vinculo: p.vinculo,
    datos: p.datos,
    reglas: p.reglas,
    procedencia: p.procedencia,
    ahora: p.ahora,
    actorUsuarioId: p.actor.usuarioId,
  });
  try {
    await deps.documentos.fusionarDocumento(COLECCION_PROPIETARIOS, p.propietarioId, { fichaPatrimonial: ficha });
  } catch (err) {
    return { estado: 'ESCRITURA_FALLIDA', mensaje: `No se pudo escribir la ficha: ${(err as Error).message}` };
  }
  const incidencias: string[] = [];
  const auditada = await auditarFicha(deps, {
    accion: 'FICHA_PATRIMONIAL_CREADA',
    descripcion: `Ficha patrimonial creada para ${p.propietarioId} (modalidad ${p.modalidad}).`,
    propietarioId: p.propietarioId,
    actor: p.actor,
    ahora: p.ahora,
    detalles: { modalidad: p.modalidad, estadoAcceso: ficha.estadoAcceso, estadoDatos: ficha.estadoDatos, procedencia: p.procedencia },
  });
  if (!auditada) incidencias.push('AUDITORIA_FALLIDA');
  return { estado: 'OK', ficha, evaluacion, incidencias };
}

export type ResultadoLecturaFicha =
  | { estado: 'OK'; existePropietario: boolean; ficha: FichaPatrimonialPersistente | null }
  | { estado: 'FICHA_INVALIDA'; mensaje: string };

export async function obtenerFichaPatrimonial(
  deps: DependenciasPatrimoniales,
  propietarioId: string,
): Promise<ResultadoLecturaFicha> {
  const doc = await deps.documentos.obtenerDocumento(COLECCION_PROPIETARIOS, propietarioId);
  if (!doc) return { estado: 'OK', existePropietario: false, ficha: null };
  if (doc.fichaPatrimonial == null) return { estado: 'OK', existePropietario: true, ficha: null };
  if (!esFichaPersistente(doc.fichaPatrimonial)) {
    return { estado: 'FICHA_INVALIDA', mensaje: 'El subobjeto fichaPatrimonial no cumple el esquema persistido.' };
  }
  return { estado: 'OK', existePropietario: true, ficha: doc.fichaPatrimonial };
}

/** Actualización parcial EXPLÍCITA: solo lo suministrado cambia. */
export async function actualizarFichaPatrimonial(
  deps: DependenciasPatrimoniales,
  p: {
    propietarioId: string;
    cambios?: Partial<Readonly<BorradorPropietario>>;
    reglas: ReglasRevisionDatos | null;
    vinculo?: VinculoCuenta;
    modalidad?: ModalidadUso;
    actor: ActorPatrimonial;
    ahora: string;
  },
): Promise<ResultadoFicha> {
  const doc = await deps.documentos.obtenerDocumento(COLECCION_PROPIETARIOS, p.propietarioId);
  if (!doc) return { estado: 'PROPIETARIO_NO_ENCONTRADO', mensaje: `El propietario ${p.propietarioId} no existe.` };
  if (doc.fichaPatrimonial == null) {
    return { estado: 'FICHA_NO_EXISTE', mensaje: 'Crea primero la ficha patrimonial (operación separada).' };
  }
  if (!esFichaPersistente(doc.fichaPatrimonial)) {
    return { estado: 'FICHA_INVALIDA', mensaje: 'El subobjeto fichaPatrimonial no cumple el esquema persistido.' };
  }
  const datosNuevos = aplicarCambiosParciales(borradorDesdePropietario(doc), p.cambios ?? {});
  const { ficha, evaluacion } = componerActualizacionFichaPatrimonial({
    existente: doc.fichaPatrimonial,
    datos: datosNuevos,
    reglas: p.reglas,
    ...(p.vinculo ? { vinculo: p.vinculo } : {}),
    ...(p.modalidad ? { modalidad: p.modalidad } : {}),
    ahora: p.ahora,
    actorUsuarioId: p.actor.usuarioId,
  });
  try {
    // Merge explícito: datos de ficha (si cambiaron) + subobjeto patrimonial.
    const fusion: Record<string, unknown> = { fichaPatrimonial: ficha };
    if (p.cambios) Object.assign(fusion, datosNuevos);
    await deps.documentos.fusionarDocumento(COLECCION_PROPIETARIOS, p.propietarioId, fusion);
  } catch (err) {
    return { estado: 'ESCRITURA_FALLIDA', mensaje: `No se pudo actualizar la ficha: ${(err as Error).message}` };
  }
  const incidencias: string[] = [];
  const auditada = await auditarFicha(deps, {
    accion: 'FICHA_PATRIMONIAL_ACTUALIZADA',
    descripcion: `Ficha patrimonial actualizada para ${p.propietarioId}.`,
    propietarioId: p.propietarioId,
    actor: p.actor,
    ahora: p.ahora,
    detalles: {
      camposCambiados: Object.keys(p.cambios ?? {}),
      vinculoActualizado: Boolean(p.vinculo),
      modalidadActualizada: p.modalidad ?? null,
      estadoAcceso: ficha.estadoAcceso,
      estadoDatos: ficha.estadoDatos,
    },
  });
  if (!auditada) incidencias.push('AUDITORIA_FALLIDA');
  return { estado: 'OK', ficha, evaluacion, incidencias };
}

/** Recalcula la completitud SIN escribir (evaluación separada de escritura). */
export function evaluarFichaPatrimonial(
  ficha: FichaPatrimonialPersistente,
  datos: Readonly<BorradorPropietario>,
  reglas: ReglasRevisionDatos | null,
): EvaluacionDatos {
  void ficha; // la evaluación depende de datos+política, no del estado previo
  return evaluarCompletitud(datos, reglas);
}

// ---------------------------------------------------------------------------
// Ejecución controlada de importaciones
// ---------------------------------------------------------------------------

export interface ParametrosEjecucionImportacion {
  /** Contexto re-verificado en el momento de ejecutar (no se confía en la preview). */
  readonly contexto: ContextoDestinoImportacion;
  readonly previsualizacion: PrevisualizacionImportacion;
  readonly propietarioDestinoId: string;
  readonly origen: {
    readonly sistema: string;
    readonly fuente?: string | null;
    /** Por índice de origen; null cuando el id externo no es recuperable. */
    readonly origenIdPorRegistro?: readonly (string | null)[];
  };
  readonly actor: ActorPatrimonial;
  /** ISO inyectado por la capa de persistencia/UI; nunca generado aquí. */
  readonly ahora: string;
}

export interface ResultadoEjecucionImportacion {
  readonly estado: 'OK' | 'PARCIAL' | 'SIN_CAMBIOS' | 'NO_EJECUTADO' | 'ERROR';
  readonly loteId: string | null;
  readonly propietarioDestinoId: string | null;
  readonly analizados: number;
  readonly creados: number;
  readonly sinCambios: number;
  readonly bloqueados: number;
  readonly colisiones: number;
  readonly errores: number;
  readonly documentosCreados: readonly string[];
  readonly incidencias: readonly IncidenciaRevision[];
  readonly auditoriaRegistrada: boolean;
}

function incidencia(
  codigo: string,
  mensaje: string,
  indiceOrigen?: number,
  nivel: 'REVISION' | 'BLOQUEO' = 'BLOQUEO',
): IncidenciaRevision {
  return { codigo, mensaje, nivel, ...(indiceOrigen === undefined ? {} : { indiceOrigen }) };
}

async function auditarEjecucion(
  deps: DependenciasPatrimoniales,
  entrada: EntradaAuditoriaPatrimonial,
): Promise<boolean> {
  try {
    await deps.auditoria.registrar(entrada);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ejecuta la importación confirmada. Reglas duras:
 *  1. destino explícito re-verificado contra el contexto (VALIDO obligatorio);
 *  2. la preview debe ser coherente con ese destino (sin previsualizaciones rancias);
 *  3. BLOQUEADO nunca se persiste; INCOMPLETO/REVISAR se persisten CON sus
 *     incidencias (nunca se convierten en éxito silencioso);
 *  4. ids deterministas ⇒ reejecución idempotente (SIN_CAMBIOS) y colisiones
 *     de contenido marcadas, sin sobrescritura;
 *  5. cada fallo de escritura es una incidencia y degrada el resultado
 *     (OK → PARCIAL/ERROR); la auditoría se registra siempre (también el rechazo).
 */
export async function ejecutarImportacionPatrimonial(
  deps: DependenciasPatrimoniales,
  p: ParametrosEjecucionImportacion,
): Promise<ResultadoEjecucionImportacion> {
  const fuente = p.origen.fuente ?? null;
  const incidencias: IncidenciaRevision[] = [];

  // 1) Re-verificación del destino en el momento de ejecutar.
  const destino = resolverDestinoImportacion(p.propietarioDestinoId, p.contexto);
  // 2) Coherencia con la previsualización confirmada por el usuario.
  const previewCoherente = p.previsualizacion.destino.estado === 'VALIDO'
    && p.previsualizacion.destino.propietarioDestinoId === p.propietarioDestinoId;

  if (destino.estado !== 'VALIDO' || !previewCoherente) {
    const motivos = [
      ...destino.incidencias,
      ...(previewCoherente ? [] : [incidencia('PREVIEW_INCONSISTENTE', 'La previsualización confirmada no corresponde al destino indicado.')]),
    ];
    const rechazada = await auditarEjecucion(deps, {
      accion: 'IMPORTACION_PATRIMONIAL_RECHAZADA',
      descripcion: `Importación rechazada antes de escribir (destino ${destino.estado}).`,
      entidadAfectada: 'importacion_patrimonial',
      idAfectado: p.propietarioDestinoId ?? 'sin-destino',
      resultado: 'ERROR',
      detalles: {
        estado: 'NO_EJECUTADO',
        destinoEstado: destino.estado,
        previewCoherente,
        incidenciasCodigos: motivos.map((i) => i.codigo),
        sistema: p.origen.sistema,
        fuente,
      },
      usuarioId: p.actor.usuarioId,
      usuarioEmail: p.actor.email ?? '',
      usuarioNombre: p.actor.nombre ?? '',
      fechaHora: p.ahora,
    });
    return {
      estado: 'NO_EJECUTADO',
      loteId: null,
      propietarioDestinoId: p.propietarioDestinoId,
      analizados: p.previsualizacion.registros.length,
      creados: 0, sinCambios: 0, bloqueados: 0, colisiones: 0, errores: 0,
      documentosCreados: [],
      incidencias: [...motivos, ...(rechazada ? [] : [incidencia('AUDITORIA_FALLIDA', 'No se pudo registrar la auditoría del rechazo.')])],
      auditoriaRegistrada: rechazada,
    };
  }

  if (p.previsualizacion.registros.length === 0) {
    return {
      estado: 'NO_EJECUTADO',
      loteId: null,
      propietarioDestinoId: p.propietarioDestinoId,
      analizados: 0, creados: 0, sinCambios: 0, bloqueados: 0, colisiones: 0, errores: 0,
      documentosCreados: [],
      incidencias: [incidencia('ORIGEN_VACIO', 'No hay registros de origen que importar.', undefined, 'REVISION')],
      auditoriaRegistrada: false,
    };
  }

  const loteId = await idDeterministaLote({
    sistema: p.origen.sistema,
    fuente,
    propietarioDestinoId: p.propietarioDestinoId,
    datosOrigen: p.previsualizacion.registros.map((r) => r.datosOrigen),
  });

  const documentosCreados: string[] = [];
  let creados = 0, sinCambios = 0, bloqueados = 0, colisiones = 0, errores = 0;

  for (const registro of p.previsualizacion.registros) {
    if (registro.decision === 'BLOQUEADO') {
      bloqueados++;
      incidencias.push(...registro.incidencias.map((i) => ({ ...i, indiceOrigen: registro.indiceOrigen })));
      continue;
    }
    const origenId = p.origen.origenIdPorRegistro?.[registro.indiceOrigen] ?? null;
    const id = await idDeterministaRegistro({
      sistema: p.origen.sistema,
      origenId,
      datosOrigen: registro.datosOrigen,
      propietarioDestinoId: p.propietarioDestinoId,
    });
    const existente = await deps.documentos.obtenerDocumento(COLECCION_REGISTROS_PATRIMONIALES, id);
    if (existente) {
      const mismoContenido = jsonEstable(existente.datosOrigen ?? null) === jsonEstable(registro.datosOrigen)
        && existente.propietarioId === p.propietarioDestinoId;
      if (mismoContenido) {
        sinCambios++; // reejecución idempotente
      } else {
        colisiones++;
        incidencias.push(incidencia(
          'COLISION_ORIGEN',
          `Ya existe un registro distinto con el mismo id determinista (${id}); no se sobrescribe.`,
          registro.indiceOrigen,
        ));
      }
      continue;
    }
    const documento: RegistroPatrimonialPersistente = {
      id,
      propietarioId: p.propietarioDestinoId,
      loteId,
      indiceOrigen: registro.indiceOrigen,
      datosOrigen: registro.datosOrigen,
      estadoDatos: registro.evaluacionDatos.estadoDatos,
      camposFaltantes: [...registro.evaluacionDatos.camposFaltantes],
      politicaId: registro.evaluacionDatos.politicaId,
      decision: registro.decision,
      incidencias: registro.incidencias,
      procedencia: { sistema: p.origen.sistema, origenId, fuente, loteId },
      creadaEn: p.ahora,
      creadaPor: p.actor.usuarioId,
    };
    try {
      await deps.documentos.escribirDocumento(COLECCION_REGISTROS_PATRIMONIALES, id, documento as unknown as Record<string, unknown>);
      creados++;
      documentosCreados.push(id);
    } catch (err) {
      errores++;
      incidencias.push(incidencia(
        'ESCRITURA_FALLIDA',
        `No se pudo persistir el registro ${registro.indiceOrigen}: ${(err as Error).message}`,
        registro.indiceOrigen,
      ));
    }
  }

  let estado: ResultadoEjecucionImportacion['estado'];
  if (errores > 0 || colisiones > 0) estado = creados === 0 && sinCambios === 0 ? 'ERROR' : 'PARCIAL';
  else if (creados > 0) estado = 'OK';
  else estado = 'SIN_CAMBIOS';

  const auditada = await auditarEjecucion(deps, {
    accion: 'IMPORTACION_PATRIMONIAL_EJECUTADA',
    descripcion: `Importación patrimonial ${estado} para ${p.propietarioDestinoId} (lote ${loteId}).`,
    entidadAfectada: 'importacion_patrimonial',
    idAfectado: loteId,
    resultado: estado === 'ERROR' ? 'ERROR' : 'EXITO',
    detalles: {
      estado,
      propietarioDestinoId: p.propietarioDestinoId,
      sistema: p.origen.sistema,
      fuente,
      analizados: p.previsualizacion.registros.length,
      creados, sinCambios, bloqueados, colisiones, errores,
      incidenciasCodigos: [...new Set(incidencias.map((i) => i.codigo))],
    },
    usuarioId: p.actor.usuarioId,
    usuarioEmail: p.actor.email ?? '',
    usuarioNombre: p.actor.nombre ?? '',
    fechaHora: p.ahora,
  });
  const incidenciasFinales = auditada
    ? incidencias
    : [...incidencias, incidencia('AUDITORIA_FALLIDA', 'Los datos se escribieron pero no se pudo registrar la auditoría.')];

  return {
    // Sin auditoría no hay éxito limpio: la trazabilidad es parte del contrato.
    estado: !auditada && estado === 'OK' ? 'PARCIAL' : estado,
    loteId,
    propietarioDestinoId: p.propietarioDestinoId,
    analizados: p.previsualizacion.registros.length,
    creados, sinCambios, bloqueados, colisiones, errores,
    documentosCreados,
    incidencias: incidenciasFinales,
    auditoriaRegistrada: auditada,
  };
}
