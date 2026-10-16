/**
 * IA · FASE 9 — SERVICIO DE LLAVES DE USUARIO (Vía 2: clave propia)
 * ===================================================================
 * Custodia, por usuario, la clave del proveedor que ese usuario ha registrado
 * en el alta guiada, y la entrega SOLO al núcleo (`nucleoIA.ts`) para ejecutar
 * las operaciones de ese mismo uid. Lo que sale hacia el cliente es siempre el
 * `ResumenLlaveUsuarioIA` (estado, sufijo, fechas), nunca el valor.
 *
 *   · ALMACÉN  — `ia_llaves/{uid}` (una llave por usuario y proveedor) con el
 *     criptograma AES-256-GCM (`cifradoLlavesIA.ts`), la huella HMAC y los
 *     metadatos; `ia_llaves_eventos/{id}` es el historial append-only de altas,
 *     sustituciones, revocaciones y verificaciones. Ninguna de las dos tiene
 *     `match` en `firestore.rules`: las cubre el catch-all deny-by-default y
 *     sólo el servidor (REST con credencial de servicio) las toca.
 *   · IDEMPOTENCIA — el id del evento es determinista por (uid, Idempotency-Key)
 *     y se crea ANTES de mutar la llave: un reintento devuelve DUPLICADA sin
 *     volver a escribir.
 *   · CONCURRENCIA — las mutaciones del documento de la llave son CAS sobre
 *     `updateTime` (mismo patrón que `gobiernoIA.ts`).
 *   · REVOCACIÓN — borra el criptograma (`cifrado: null`) y conserva el
 *     documento con `estado: 'REVOCADA'` y la fecha: el historial no se
 *     reescribe.
 *
 * Qué NO hace: no valida la llave con el proveedor (eso es `verificar`, con
 * un verificador inyectado y desactivado por defecto), no decide permisos ni
 * cuotas (gobierno) y no escribe en logs el valor de la llave.
 */
import { createHash } from 'node:crypto';
import {
  PROVEEDOR_LLAVE_IA,
  llaveActiva,
  resumenLlaveAusente,
  validarFormatoLlaveProveedorIA,
  type CodigoFormatoLlaveIA,
  type EstadoLlaveUsuarioIA,
  type ResultadoVerificacionLlaveIA,
  type ResumenLlaveUsuarioIA,
} from '../../src/ia/llavesUsuarioContrato.js';
import {
  cifrarLlaveUsuario,
  descifrarLlaveUsuario,
  huellaLlaveUsuario,
  llaveCifradaDesdeDatos,
  mismaHuella,
  type LlaveCifrada,
} from './cifradoLlavesIA.js';

export const COLECCION_LLAVES_IA = 'ia_llaves';
export const COLECCION_EVENTOS_LLAVES_IA = 'ia_llaves_eventos';
export const VERSION_LLAVE_IA = 1;
export const MAX_INTENTOS_CAS_LLAVES = 5;

export type TipoEventoLlaveIA = 'ALTA' | 'SUSTITUCION' | 'REVOCACION' | 'VERIFICACION_OK' | 'VERIFICACION_FALLIDA';

/** Documento completo de `ia_llaves/{uid}` (uso interno del servidor). */
export interface DocumentoLlaveIA {
  version: number;
  proveedor: typeof PROVEEDOR_LLAVE_IA;
  estado: Exclude<EstadoLlaveUsuarioIA, 'AUSENTE'>;
  cifrado: LlaveCifrada | null;
  huella: string | null;
  sufijo: string | null;
  registradaEn: string | null;
  verificadaEn: string | null;
  revocadaEn: string | null;
  actualizadaEn: string;
  sustituciones: number;
  ultimaVerificacion: ResultadoVerificacionLlaveIA | null;
}

export interface EntradaRegistroLlaveIA {
  uid: string;
  /** Valor tal y como lo pegó el usuario (se normaliza y valida aquí). */
  valor: unknown;
  claveIdempotencia: string;
  ahora: Date;
}

export type ResultadoRegistroLlaveIA =
  | { estado: 'REGISTRADA'; resumen: ResumenLlaveUsuarioIA; sustitucion: boolean }
  | { estado: 'SIN_CAMBIOS'; resumen: ResumenLlaveUsuarioIA }
  | { estado: 'DUPLICADA' }
  | { estado: 'FORMATO_INVALIDO'; codigo: CodigoFormatoLlaveIA; mensaje: string };

export interface EntradaRevocacionLlaveIA {
  uid: string;
  claveIdempotencia: string;
  ahora: Date;
}

export type ResultadoRevocacionLlaveIA =
  | { estado: 'REVOCADA'; resumen: ResumenLlaveUsuarioIA }
  | { estado: 'SIN_LLAVE' }
  | { estado: 'DUPLICADA' };

export interface EntradaMarcaVerificacionLlaveIA {
  uid: string;
  resultado: ResultadoVerificacionLlaveIA;
  claveIdempotencia: string;
  ahora: Date;
}

export type ResultadoMarcaVerificacionLlaveIA =
  | { estado: 'MARCADA'; resumen: ResumenLlaveUsuarioIA }
  | { estado: 'SIN_LLAVE' }
  | { estado: 'DUPLICADA' };

/** Resolución INTERNA para el núcleo: la única salida del valor descifrado. */
export type ResolucionLlaveOperacionIA =
  | { estado: 'DISPONIBLE'; valor: string; sufijo: string }
  | { estado: 'AUSENTE' };

/** Puerto Firestore que necesita el servicio (lo cumple `ClienteFirestoreRest`). */
export interface PuertoLlavesFirestoreIA {
  leerDocumento(ruta: string): Promise<{ datos: Record<string, unknown>; updateTime?: string } | null>;
  crearDocumento(coleccion: string, id: string, datos: Record<string, unknown>): Promise<'CREADO' | 'YA_EXISTE'>;
  actualizarCamposSiVersion(coleccion: string, id: string, datos: Record<string, unknown>, updateTimeEsperado: string): Promise<boolean>;
}

export interface ServicioLlavesIA {
  readonly modo: 'FIRESTORE' | 'MEMORIA';
  resumen(uid: string): Promise<ResumenLlaveUsuarioIA>;
  registrar(entrada: EntradaRegistroLlaveIA): Promise<ResultadoRegistroLlaveIA>;
  revocar(entrada: EntradaRevocacionLlaveIA): Promise<ResultadoRevocacionLlaveIA>;
  marcarVerificacion(entrada: EntradaMarcaVerificacionLlaveIA): Promise<ResultadoMarcaVerificacionLlaveIA>;
  /** SOLO para el núcleo: descifra la llave activa del uid. */
  resolverParaOperacion(uid: string): Promise<ResolucionLlaveOperacionIA>;
}

export class ConflictoConcurrenciaLlavesIA extends Error {
  constructor(operacion: string) {
    super(`Conflicto de concurrencia persistente en ${operacion} (llaves de IA).`);
    this.name = 'ConflictoConcurrenciaLlavesIA';
  }
}

// ---------------------------------------------------------------------------
// Utilidades puras (exportadas para pruebas directas)
// ---------------------------------------------------------------------------

/** Id determinista del evento: la misma clave del mismo usuario es el mismo evento. */
export function idEventoLlaveIA(uid: string, claveIdempotencia: string): string {
  const huella = createHash('sha256').update(`${uid}\n${claveIdempotencia}`).digest('hex');
  return `iaklv_${huella.slice(0, 40)}`;
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor !== '' ? valor : null;
}

function entero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 ? Math.floor(valor) : 0;
}

/** Reconstruye el documento desde el almacén, defensivamente. */
export function normalizarDocumentoLlaveIA(datos: Record<string, unknown>, uid: string): DocumentoLlaveIA {
  const version = entero(datos.version);
  if (version !== VERSION_LLAVE_IA) {
    throw new Error(`La llave de IA de ${uid} tiene versión ${version}, no soportada (esperada ${VERSION_LLAVE_IA}).`);
  }
  const estado = datos.estado;
  if (estado !== 'REGISTRADA' && estado !== 'VERIFICADA' && estado !== 'REVOCADA') {
    throw new Error(`La llave de IA de ${uid} tiene un estado desconocido.`);
  }
  const verificacion = datos.ultimaVerificacion;
  return {
    version,
    proveedor: PROVEEDOR_LLAVE_IA,
    estado,
    cifrado: llaveCifradaDesdeDatos(datos.cifrado),
    huella: texto(datos.huella),
    sufijo: texto(datos.sufijo),
    registradaEn: texto(datos.registradaEn),
    verificadaEn: texto(datos.verificadaEn),
    revocadaEn: texto(datos.revocadaEn),
    actualizadaEn: texto(datos.actualizadaEn) ?? new Date(0).toISOString(),
    sustituciones: entero(datos.sustituciones),
    ultimaVerificacion: verificacion === 'OK' || verificacion === 'FALLIDA' ? verificacion : null,
  };
}

/** Proyección SIN secretos (lo único que ve el cliente). */
export function resumenDesdeDocumentoLlaveIA(documento: DocumentoLlaveIA | null): ResumenLlaveUsuarioIA {
  if (!documento) return resumenLlaveAusente();
  return {
    version: 1,
    proveedor: documento.proveedor,
    estado: documento.estado,
    sufijo: documento.estado === 'REVOCADA' ? null : documento.sufijo,
    registradaEn: documento.registradaEn,
    verificadaEn: documento.verificadaEn,
    revocadaEn: documento.revocadaEn,
    sustituciones: documento.sustituciones,
    ultimaVerificacion: documento.ultimaVerificacion,
  };
}

/** Campos del documento tal y como se escriben (sin el uid: lo identifica el id). */
export function aCamposDocumentoLlaveIA(documento: DocumentoLlaveIA): Record<string, unknown> {
  return {
    version: documento.version,
    proveedor: documento.proveedor,
    estado: documento.estado,
    cifrado: documento.cifrado ? { ...documento.cifrado } : null,
    huella: documento.huella,
    sufijo: documento.sufijo,
    registradaEn: documento.registradaEn,
    verificadaEn: documento.verificadaEn,
    revocadaEn: documento.revocadaEn,
    actualizadaEn: documento.actualizadaEn,
    sustituciones: documento.sustituciones,
    ultimaVerificacion: documento.ultimaVerificacion,
  };
}

function documentoRegistrado(previo: DocumentoLlaveIA | null, cifrado: LlaveCifrada, huella: string, sufijo: string, ahora: Date): DocumentoLlaveIA {
  const sustitucion = Boolean(previo && previo.estado !== 'REVOCADA');
  return {
    version: VERSION_LLAVE_IA,
    proveedor: PROVEEDOR_LLAVE_IA,
    estado: 'REGISTRADA',
    cifrado,
    huella,
    sufijo,
    registradaEn: ahora.toISOString(),
    verificadaEn: null,
    revocadaEn: null,
    actualizadaEn: ahora.toISOString(),
    sustituciones: (previo?.sustituciones ?? 0) + (sustitucion ? 1 : 0),
    ultimaVerificacion: null,
  };
}

function documentoRevocado(previo: DocumentoLlaveIA, ahora: Date): DocumentoLlaveIA {
  return {
    ...previo,
    estado: 'REVOCADA',
    cifrado: null,
    huella: null,
    revocadaEn: ahora.toISOString(),
    actualizadaEn: ahora.toISOString(),
  };
}

function documentoConVerificacion(previo: DocumentoLlaveIA, resultado: ResultadoVerificacionLlaveIA, ahora: Date): DocumentoLlaveIA {
  return {
    ...previo,
    estado: resultado === 'OK' ? 'VERIFICADA' : 'REGISTRADA',
    verificadaEn: resultado === 'OK' ? ahora.toISOString() : previo.verificadaEn,
    actualizadaEn: ahora.toISOString(),
    ultimaVerificacion: resultado,
  };
}

function camposEvento(uid: string, tipo: TipoEventoLlaveIA, sufijo: string | null, ahora: Date): Record<string, unknown> {
  return { version: VERSION_LLAVE_IA, uid, tipo, sufijo, en: ahora.toISOString() };
}

// ---------------------------------------------------------------------------
// Núcleo del servicio (compartido por Firestore y memoria a través de un puerto)
// ---------------------------------------------------------------------------

interface AlmacenLlaves {
  leer(uid: string): Promise<{ documento: DocumentoLlaveIA; version: string } | null>;
  crear(uid: string, documento: DocumentoLlaveIA): Promise<'CREADO' | 'YA_EXISTE'>;
  actualizarSiVersion(uid: string, documento: DocumentoLlaveIA, version: string): Promise<boolean>;
  crearEvento(id: string, campos: Record<string, unknown>): Promise<'CREADO' | 'YA_EXISTE'>;
}

function construirServicio(modo: 'FIRESTORE' | 'MEMORIA', almacen: AlmacenLlaves, claveMaestra: Buffer): ServicioLlavesIA {
  /** CAS genérico sobre el documento de la llave. */
  async function mutar(
    uid: string,
    operacion: string,
    paso: (previo: DocumentoLlaveIA | null) => { resultado?: unknown; aplicar?: DocumentoLlaveIA },
  ): Promise<{ resultado?: unknown; aplicado?: DocumentoLlaveIA }> {
    for (let intento = 0; intento < MAX_INTENTOS_CAS_LLAVES; intento++) {
      const leido = await almacen.leer(uid);
      const decision = paso(leido?.documento ?? null);
      if (decision.resultado !== undefined) return { resultado: decision.resultado };
      if (!decision.aplicar) return {};
      if (!leido) {
        const creado = await almacen.crear(uid, decision.aplicar);
        if (creado === 'CREADO') return { aplicado: decision.aplicar };
        continue; // otro escritor creó el documento: releer y decidir de nuevo
      }
      const escrito = await almacen.actualizarSiVersion(uid, decision.aplicar, leido.version);
      if (escrito) return { aplicado: decision.aplicar };
    }
    throw new ConflictoConcurrenciaLlavesIA(operacion);
  }

  return {
    modo,

    async resumen(uid) {
      const leido = await almacen.leer(uid);
      return resumenDesdeDocumentoLlaveIA(leido?.documento ?? null);
    },

    async registrar(entrada) {
      const formato = validarFormatoLlaveProveedorIA(entrada.valor);
      if (formato.estado === 'INVALIDA') return { estado: 'FORMATO_INVALIDO', codigo: formato.codigo, mensaje: formato.mensaje };
      const huella = huellaLlaveUsuario(formato.valor, claveMaestra);
      // ¿Misma llave ya activa? No hay nada que escribir (ni evento): respuesta estable.
      const actual = await almacen.leer(entrada.uid);
      if (actual && llaveActiva(actual.documento) && mismaHuella(actual.documento.huella, huella)) {
        return { estado: 'SIN_CAMBIOS', resumen: resumenDesdeDocumentoLlaveIA(actual.documento) };
      }
      const sustitucion = Boolean(actual && actual.documento.estado !== 'REVOCADA');
      const idEvento = idEventoLlaveIA(entrada.uid, entrada.claveIdempotencia);
      const evento = await almacen.crearEvento(idEvento, camposEvento(entrada.uid, sustitucion ? 'SUSTITUCION' : 'ALTA', formato.sufijo, entrada.ahora));
      if (evento === 'YA_EXISTE') return { estado: 'DUPLICADA' };
      const cifrado = cifrarLlaveUsuario(formato.valor, claveMaestra, entrada.uid);
      const { aplicado } = await mutar(entrada.uid, 'registrar', (previo) => ({
        aplicar: documentoRegistrado(previo, cifrado, huella, formato.sufijo, entrada.ahora),
      }));
      const documento = aplicado ?? documentoRegistrado(null, cifrado, huella, formato.sufijo, entrada.ahora);
      return { estado: 'REGISTRADA', resumen: resumenDesdeDocumentoLlaveIA(documento), sustitucion };
    },

    async revocar(entrada) {
      const actual = await almacen.leer(entrada.uid);
      if (!actual || !llaveActiva(actual.documento)) return { estado: 'SIN_LLAVE' };
      const idEvento = idEventoLlaveIA(entrada.uid, entrada.claveIdempotencia);
      const evento = await almacen.crearEvento(idEvento, camposEvento(entrada.uid, 'REVOCACION', actual.documento.sufijo, entrada.ahora));
      if (evento === 'YA_EXISTE') return { estado: 'DUPLICADA' };
      const { resultado, aplicado } = await mutar(entrada.uid, 'revocar', (previo) => {
        if (!previo || !llaveActiva(previo)) return { resultado: 'SIN_LLAVE' };
        return { aplicar: documentoRevocado(previo, entrada.ahora) };
      });
      if (resultado === 'SIN_LLAVE' || !aplicado) return { estado: 'SIN_LLAVE' };
      return { estado: 'REVOCADA', resumen: resumenDesdeDocumentoLlaveIA(aplicado) };
    },

    async marcarVerificacion(entrada) {
      const actual = await almacen.leer(entrada.uid);
      if (!actual || !llaveActiva(actual.documento)) return { estado: 'SIN_LLAVE' };
      const idEvento = idEventoLlaveIA(entrada.uid, entrada.claveIdempotencia);
      const tipo: TipoEventoLlaveIA = entrada.resultado === 'OK' ? 'VERIFICACION_OK' : 'VERIFICACION_FALLIDA';
      const evento = await almacen.crearEvento(idEvento, camposEvento(entrada.uid, tipo, actual.documento.sufijo, entrada.ahora));
      if (evento === 'YA_EXISTE') return { estado: 'DUPLICADA' };
      const { resultado, aplicado } = await mutar(entrada.uid, 'marcarVerificacion', (previo) => {
        if (!previo || !llaveActiva(previo)) return { resultado: 'SIN_LLAVE' };
        return { aplicar: documentoConVerificacion(previo, entrada.resultado, entrada.ahora) };
      });
      if (resultado === 'SIN_LLAVE' || !aplicado) return { estado: 'SIN_LLAVE' };
      return { estado: 'MARCADA', resumen: resumenDesdeDocumentoLlaveIA(aplicado) };
    },

    async resolverParaOperacion(uid) {
      const leido = await almacen.leer(uid);
      const documento = leido?.documento ?? null;
      if (!documento || !llaveActiva(documento) || !documento.cifrado || !documento.sufijo) return { estado: 'AUSENTE' };
      const valor = descifrarLlaveUsuario(documento.cifrado, claveMaestra, uid);
      // Criptograma ilegible (otra clave maestra, otro uid o corrupción): se trata como
      // ausente — nunca se «adivina» una llave — y el usuario deberá registrarla de nuevo.
      if (!valor) return { estado: 'AUSENTE' };
      return { estado: 'DISPONIBLE', valor, sufijo: documento.sufijo };
    },
  };
}

// ---------------------------------------------------------------------------
// Implementación Firestore (REST, credencial de servicio)
// ---------------------------------------------------------------------------

export function crearServicioLlavesFirestore(puerto: PuertoLlavesFirestoreIA, claveMaestra: Buffer): ServicioLlavesIA {
  const almacen: AlmacenLlaves = {
    async leer(uid) {
      const leido = await puerto.leerDocumento(`${COLECCION_LLAVES_IA}/${encodeURIComponent(uid)}`);
      if (!leido) return null;
      if (!leido.updateTime) throw new Error(`La llave de IA de ${uid} se leyó sin versión (updateTime).`);
      return { documento: normalizarDocumentoLlaveIA(leido.datos, uid), version: leido.updateTime };
    },
    crear: (uid, documento) => puerto.crearDocumento(COLECCION_LLAVES_IA, uid, aCamposDocumentoLlaveIA(documento)),
    actualizarSiVersion: (uid, documento, version) =>
      puerto.actualizarCamposSiVersion(COLECCION_LLAVES_IA, uid, aCamposDocumentoLlaveIA(documento), version),
    crearEvento: (id, campos) => puerto.crearDocumento(COLECCION_EVENTOS_LLAVES_IA, id, campos),
  };
  return construirServicio('FIRESTORE', almacen, claveMaestra);
}

// ---------------------------------------------------------------------------
// Implementación en memoria (desarrollo explícito y pruebas)
// ---------------------------------------------------------------------------

export interface ServicioLlavesMemoriaIA extends ServicioLlavesIA {
  /** Inspección para pruebas: documentos y eventos tal y como se habrían escrito. */
  documentos(): Map<string, Record<string, unknown>>;
  eventos(): Map<string, Record<string, unknown>>;
}

export function crearServicioLlavesMemoria(claveMaestra: Buffer): ServicioLlavesMemoriaIA {
  const documentos = new Map<string, { campos: Record<string, unknown>; version: number }>();
  const eventos = new Map<string, Record<string, unknown>>();
  let reloj = 0;
  const almacen: AlmacenLlaves = {
    async leer(uid) {
      const actual = documentos.get(uid);
      if (!actual) return null;
      return { documento: normalizarDocumentoLlaveIA(actual.campos, uid), version: String(actual.version) };
    },
    async crear(uid, documento) {
      if (documentos.has(uid)) return 'YA_EXISTE';
      documentos.set(uid, { campos: aCamposDocumentoLlaveIA(documento), version: ++reloj });
      return 'CREADO';
    },
    async actualizarSiVersion(uid, documento, version) {
      const actual = documentos.get(uid);
      if (!actual || String(actual.version) !== version) return false;
      documentos.set(uid, { campos: aCamposDocumentoLlaveIA(documento), version: ++reloj });
      return true;
    },
    async crearEvento(id, campos) {
      if (eventos.has(id)) return 'YA_EXISTE';
      eventos.set(id, { ...campos });
      return 'CREADO';
    },
  };
  const servicio = construirServicio('MEMORIA', almacen, claveMaestra);
  return {
    ...servicio,
    documentos: () => new Map([...documentos].map(([uid, d]) => [uid, { ...d.campos }])),
    eventos: () => new Map([...eventos].map(([id, e]) => [id, { ...e }])),
  };
}
