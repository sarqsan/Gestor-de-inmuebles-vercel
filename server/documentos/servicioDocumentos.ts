/**
 * AG-03.2 · SERVICIO DE CUSTODIA DOCUMENTAL (servidor)
 * ====================================================
 * Orquesta, con la credencial de servicio, las cuatro operaciones que el
 * cliente ya no puede hacer directamente contra Firebase Storage porque las
 * reglas no pueden leer la base Firestore con nombre:
 *
 *   iniciarSubida   → autoriza CREAR/SOBRESCRIBIR en la base con nombre, valida
 *                     tipo/tamaño/destino, fija nombre y metadatos en el
 *                     servidor y abre una SESIÓN REANUDABLE de Cloud Storage.
 *                     El navegador envía los bytes directamente a esa sesión
 *                     (no pasan por Vercel: sin el límite de 4,5 MB de cuerpo).
 *   confirmarSubida → vuelve a autorizar (revocación entre inicio y fin), lee
 *                     los metadatos reales del objeto y comprueba tamaño, tipo
 *                     y marca de origen. Si el objeto no respeta el destino se
 *                     ELIMINA y se responde error: nunca queda un objeto
 *                     admitido fuera de regla ni un éxito sin objeto.
 *   acceso          → autoriza LEER y devuelve la URL de descarga por token
 *                     (emitiéndolo o rotándolo según el destino).
 *   borrar          → autoriza BORRAR y elimina el objeto.
 *
 * El portal público de candidatos (sin sesión) sólo puede CREAR en
 * `documentos_solicitados/{solicitud}/{fichero}` tras validar el token de la
 * solicitud en la base con nombre; no obtiene acceso de lectura ni borrado
 * (sólo la URL del objeto que acaba de subir, que la administración guarda).
 *
 * Fallo cerrado en todo el recorrido: sin Firestore/Storage reales el servicio
 * no existe (503), y ninguna rama degrada a memoria, base64 ni data-URL.
 */
import { randomUUID } from 'node:crypto';
import type { ClienteFirestoreRest, IdentidadVerificada } from '../titularidades/googleBackend.js';
import { ErrorAlmacenGoogleStorage, type ClienteGoogleStorageRest, type MetadatosObjetoStorage } from '../cobros/almacenGoogleStorage.js';
import {
  ContextoAutorizacion,
  ErrorFuenteAutorizacion,
  decidirAccion,
  identidadAActor,
  resolverObjeto,
  validarContenido,
  type AccionDocumental,
  type ActorDocumental,
  type ObjetoDocumental,
} from './autorizacionDocumental.js';

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

export type CodigoErrorDocumental =
  | 'PETICION_INVALIDA'
  | 'NO_AUTENTICADO'
  | 'SIN_PERMISO'
  | 'RUTA_NO_ADMITIDA'
  | 'ARCHIVO_INVALIDO'
  | 'ARCHIVO_DEMASIADO_GRANDE'
  | 'OBJETO_NO_ENCONTRADO'
  | 'OBJETO_EXISTENTE'
  | 'OBJETO_INCOMPLETO'
  | 'SOLICITUD_NO_VALIDA'
  | 'ALMACEN_NO_DISPONIBLE'
  | 'FUENTE_NO_DISPONIBLE';

export class ErrorDocumental extends Error {
  constructor(readonly codigo: CodigoErrorDocumental, readonly status: number, readonly motivo?: string) {
    super(codigo);
    this.name = 'ErrorDocumental';
  }
}

// ---------------------------------------------------------------------------
// Tipos del servicio
// ---------------------------------------------------------------------------

export interface AccesoPublicoSolicitud {
  solicitudDocId: string;
  token: string;
}

export interface EntradaIniciarSubida {
  identidad?: IdentidadVerificada | null;
  publico?: AccesoPublicoSolicitud;
  storagePath: string;
  contentType: string;
  tamanoBytes: number;
  customMetadata?: Record<string, string>;
  /** `Origin` del navegador (cabecera de la petición HTTP). */
  origen?: string;
}

export interface MetadatosDocumento {
  storagePath: string;
  tamanoBytes: number;
  contentType: string;
  generation: string;
  md5Hash?: string;
  timeCreated?: string;
  customMetadata: Record<string, string>;
}

export type ResultadoIniciarSubida =
  | { estado: 'SESION'; sesionUri: string; storagePath: string }
  | { estado: 'YA_EXISTE'; storagePath: string; metadatos: MetadatosDocumento; url?: string };

export interface EntradaConfirmarSubida {
  identidad?: IdentidadVerificada | null;
  publico?: AccesoPublicoSolicitud;
  storagePath: string;
}

export interface ResultadoConfirmarSubida {
  storagePath: string;
  metadatos: MetadatosDocumento;
  /** Sólo en destinos cuya URL puede persistirse en el registro. */
  url?: string;
}

export interface EntradaAcceso {
  identidad: IdentidadVerificada;
  storagePath: string;
}

export interface ResultadoAcceso {
  storagePath: string;
  url: string;
  metadatos: MetadatosDocumento;
}

export interface EntradaBorrar {
  identidad: IdentidadVerificada;
  storagePath: string;
}

export interface EventoCustodia {
  operacion: 'INICIAR_SUBIDA' | 'CONFIRMAR_SUBIDA' | 'ACCESO' | 'BORRAR';
  resultado: 'OK' | 'DENEGADO' | 'ERROR';
  destino?: string;
  /** Ruta SIN el nombre del fichero (los nombres pueden contener datos personales). */
  carpeta?: string;
  actor: string;
  motivo?: string;
  codigo?: string;
}

export interface DependenciasServicioDocumentos {
  puerto: Pick<ClienteFirestoreRest, 'leerDocumento' | 'consultarIgualdadesOrden'>;
  almacen: Pick<ClienteGoogleStorageRest, 'metadatos' | 'iniciarSesionResumable' | 'borrar' | 'parchearMetadatos' | 'urlDescargaConToken'>;
  auditar?: (evento: EventoCustodia) => void;
  generarToken?: () => string;
}

export interface ServicioDocumentos {
  iniciarSubida(entrada: EntradaIniciarSubida): Promise<ResultadoIniciarSubida>;
  confirmarSubida(entrada: EntradaConfirmarSubida): Promise<ResultadoConfirmarSubida>;
  acceso(entrada: EntradaAcceso): Promise<ResultadoAcceso>;
  borrar(entrada: EntradaBorrar): Promise<{ storagePath: string; estado: 'BORRADO' | 'NO_EXISTE' }>;
}

/** Marca de origen que fija el servidor en cada objeto creado por esta vía. */
export const META_ORIGEN = 'custodia_origen';
export const META_UID = 'custodia_uid';
export const META_TOKENS = 'firebaseStorageDownloadTokens';
const VALOR_ORIGEN = 'servidor-ag03';

/** Metadatos del cliente admitidos (nunca los de control del servidor). */
const CLAVES_CLIENTE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const CLAVES_RESERVADAS = new Set([META_ORIGEN, META_UID, META_TOKENS]);

function auditoriaPorDefecto(evento: EventoCustodia): void {
  console.info(`[documentos] ${JSON.stringify(evento)}`);
}

function carpetaDe(path: string): string {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : path;
}

function proyectar(path: string, m: MetadatosObjetoStorage): MetadatosDocumento {
  const customMetadata: Record<string, string> = {};
  for (const [k, v] of Object.entries(m.metadata)) {
    if (k !== META_TOKENS) customMetadata[k] = v;
  }
  return {
    storagePath: path,
    tamanoBytes: m.size,
    contentType: m.contentType,
    generation: m.generation,
    ...(m.md5Hash ? { md5Hash: m.md5Hash } : {}),
    ...(m.timeCreated ? { timeCreated: m.timeCreated } : {}),
    customMetadata,
  };
}

function sanearMetadatosCliente(crudo: Record<string, string> | undefined): Record<string, string> {
  const salida: Record<string, string> = {};
  if (!crudo || typeof crudo !== 'object') return salida;
  for (const [k, v] of Object.entries(crudo)) {
    if (!CLAVES_CLIENTE.test(k) || CLAVES_RESERVADAS.has(k)) throw new ErrorDocumental('PETICION_INVALIDA', 400, 'METADATO_NO_ADMITIDO');
    if (typeof v !== 'string' || v.length > 512) throw new ErrorDocumental('PETICION_INVALIDA', 400, 'METADATO_NO_ADMITIDO');
    salida[k] = v;
  }
  if (Object.keys(salida).length > 16) throw new ErrorDocumental('PETICION_INVALIDA', 400, 'METADATO_NO_ADMITIDO');
  return salida;
}

export function crearServicioDocumentos(deps: DependenciasServicioDocumentos): ServicioDocumentos {
  const auditar = deps.auditar || auditoriaPorDefecto;
  const nuevoToken = deps.generarToken || (() => randomUUID());

  function resolver(path: unknown): ObjetoDocumental {
    if (typeof path !== 'string') throw new ErrorDocumental('PETICION_INVALIDA', 400, 'RUTA_AUSENTE');
    const objeto = resolverObjeto(path);
    if (!objeto) throw new ErrorDocumental('RUTA_NO_ADMITIDA', 403, 'SIN_DESTINO');
    return objeto;
  }

  function registrar(evento: EventoCustodia): void {
    try { auditar(evento); } catch { /* el registro nunca altera el resultado */ }
  }

  function actorDe(identidad: IdentidadVerificada | null | undefined): ActorDocumental | null {
    return identidad && identidad.uid ? identidadAActor(identidad) : null;
  }

  function etiquetaActor(actor: ActorDocumental | null, publico: boolean): string {
    if (actor) return actor.esMaster ? 'master' : `uid:${actor.uid}`;
    return publico ? 'portal-publico' : 'anonimo';
  }

  /** Decide con traducción de errores de fuente (503) y denegación (403). */
  async function autorizar(
    ctx: ContextoAutorizacion,
    objeto: ObjetoDocumental,
    accion: AccionDocumental,
    operacion: EventoCustodia['operacion'],
    contenido: { contentType?: string; tamanoBytes?: number; customMetadata?: Record<string, string> } = {},
    publicoVerificado = false,
  ): Promise<void> {
    const etiqueta = etiquetaActor(ctx.actor, publicoVerificado);
    let decisionFinal;
    try {
      decisionFinal = await decidirAccion(ctx, objeto, accion, contenido, publicoVerificado);
    } catch (error) {
      if (error instanceof ErrorFuenteAutorizacion) {
        registrar({ operacion, resultado: 'ERROR', destino: objeto.destino.clave, carpeta: carpetaDe(objeto.path), actor: etiqueta, codigo: 'FUENTE_NO_DISPONIBLE' });
        throw new ErrorDocumental('FUENTE_NO_DISPONIBLE', 503);
      }
      throw error;
    }
    if (!decisionFinal.permitido) {
      registrar({ operacion, resultado: 'DENEGADO', destino: objeto.destino.clave, carpeta: carpetaDe(objeto.path), actor: etiqueta, motivo: decisionFinal.motivo });
      if (decisionFinal.motivo === 'TAMANO_EXCEDIDO') throw new ErrorDocumental('ARCHIVO_DEMASIADO_GRANDE', 413, decisionFinal.motivo);
      if (decisionFinal.motivo === 'TIPO_NO_ADMITIDO' || decisionFinal.motivo === 'TAMANO_INVALIDO') {
        throw new ErrorDocumental('ARCHIVO_INVALIDO', 400, decisionFinal.motivo);
      }
      throw new ErrorDocumental('SIN_PERMISO', 403, decisionFinal.motivo);
    }
  }

  /** Portal público: el token debe coincidir con el de la solicitud en la base con nombre. */
  async function verificarPublico(publico: AccesoPublicoSolicitud | undefined, objeto: ObjetoDocumental): Promise<boolean> {
    if (!publico) return false;
    if (objeto.destino.clave !== 'DOCUMENTOS_SOLICITADOS') throw new ErrorDocumental('SIN_PERMISO', 403, 'PORTAL_SOLO_DOCUMENTOS_SOLICITADOS');
    const token = typeof publico.token === 'string' ? publico.token.trim() : '';
    const solicitudDocId = typeof publico.solicitudDocId === 'string' ? publico.solicitudDocId.trim() : '';
    if (!token || token.length < 8 || token.length > 200 || solicitudDocId !== objeto.ids.solicitudDocId) {
      throw new ErrorDocumental('SOLICITUD_NO_VALIDA', 403, 'TOKEN_AUSENTE');
    }
    let datos: Record<string, unknown> | null = null;
    try {
      const doc = await deps.puerto.leerDocumento(`solicitudes_documentacion/${encodeURIComponent(solicitudDocId)}`);
      datos = doc ? doc.datos : null;
      if (!datos) {
        // El portal construye `sol-{token}` cuando la solicitud no trae id: se localiza por token.
        const candidatas = await deps.puerto.consultarIgualdadesOrden('solicitudes_documentacion', { igualdades: [['token', token]], limite: 2 });
        const unica = candidatas.length === 1 ? candidatas[0] : null;
        if (unica && (unica.id === solicitudDocId || solicitudDocId === `sol-${token}`)) datos = unica.datos;
      }
    } catch {
      throw new ErrorDocumental('FUENTE_NO_DISPONIBLE', 503);
    }
    if (!datos || typeof datos.token !== 'string' || datos.token !== token) {
      registrar({ operacion: 'INICIAR_SUBIDA', resultado: 'DENEGADO', destino: objeto.destino.clave, carpeta: carpetaDe(objeto.path), actor: 'portal-publico', motivo: 'TOKEN_NO_COINCIDE' });
      throw new ErrorDocumental('SOLICITUD_NO_VALIDA', 403, 'TOKEN_NO_COINCIDE');
    }
    return true;
  }

  async function metadatosObjeto(path: string): Promise<MetadatosObjetoStorage | null> {
    try {
      return await deps.almacen.metadatos(path);
    } catch {
      throw new ErrorDocumental('ALMACEN_NO_DISPONIBLE', 503);
    }
  }

  /** Token de descarga: el primero existente o uno nuevo (emitido con `PATCH`). */
  async function asegurarToken(path: string, m: MetadatosObjetoStorage, rotar: boolean): Promise<string> {
    const actuales = String(m.metadata[META_TOKENS] || '').split(',').map((t) => t.trim()).filter(Boolean);
    if (actuales.length > 0 && !rotar) return actuales[0];
    const nuevo = nuevoToken();
    // Rotación: el nuevo token y el inmediatamente anterior (ventana para
    // lecturas concurrentes); los demás dejan de resolver.
    const valor = rotar ? [nuevo, ...actuales.slice(0, 1)].join(',') : nuevo;
    try {
      await deps.almacen.parchearMetadatos(path, { [META_TOKENS]: valor });
    } catch (error) {
      if (error instanceof ErrorAlmacenGoogleStorage && error.codigo === 'STORAGE_PRECONDICION') {
        throw new ErrorDocumental('OBJETO_NO_ENCONTRADO', 404);
      }
      throw new ErrorDocumental('ALMACEN_NO_DISPONIBLE', 503);
    }
    return nuevo;
  }

  function contextoDe(actor: ActorDocumental | null): ContextoAutorizacion {
    return new ContextoAutorizacion(actor, deps.puerto);
  }

  function validarEntradaSubida(entrada: EntradaIniciarSubida): { contentType: string; tamanoBytes: number } {
    const contentType = typeof entrada.contentType === 'string' ? entrada.contentType.split(';')[0].trim().toLowerCase() : '';
    const tamanoBytes = entrada.tamanoBytes;
    if (!contentType || contentType.length > 120 || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(contentType)) {
      throw new ErrorDocumental('ARCHIVO_INVALIDO', 400, 'TIPO_NO_ADMITIDO');
    }
    if (!Number.isInteger(tamanoBytes) || tamanoBytes <= 0) throw new ErrorDocumental('ARCHIVO_INVALIDO', 400, 'TAMANO_INVALIDO');
    return { contentType, tamanoBytes };
  }

  return {
    async iniciarSubida(entrada) {
      const objeto = resolver(entrada.storagePath);
      const { contentType, tamanoBytes } = validarEntradaSubida(entrada);
      const customMetadata = sanearMetadatosCliente(entrada.customMetadata);
      const actor = actorDe(entrada.identidad);
      const publicoVerificado = !actor && (await verificarPublico(entrada.publico, objeto));
      if (!actor && !publicoVerificado) throw new ErrorDocumental('NO_AUTENTICADO', 401);
      const ctx = contextoDe(actor);
      const etiqueta = etiquetaActor(actor, publicoVerificado);

      // Validación de contenido ANTES de cualquier lectura de ámbito (barata y determinista).
      const contenidoOk = validarContenido(objeto.destino, contentType, tamanoBytes);
      if (!contenidoOk.permitido) {
        registrar({ operacion: 'INICIAR_SUBIDA', resultado: 'DENEGADO', destino: objeto.destino.clave, carpeta: carpetaDe(objeto.path), actor: etiqueta, motivo: contenidoOk.motivo });
        if (contenidoOk.motivo === 'TAMANO_EXCEDIDO') throw new ErrorDocumental('ARCHIVO_DEMASIADO_GRANDE', 413, contenidoOk.motivo);
        throw new ErrorDocumental('ARCHIVO_INVALIDO', 400, contenidoOk.motivo);
      }

      const previo = await metadatosObjeto(objeto.path);
      const contenido = { contentType, tamanoBytes, customMetadata };
      if (previo) {
        if (objeto.destino.sobrescribible) {
          await autorizar(ctx, objeto, 'SOBRESCRIBIR', 'INICIAR_SUBIDA', contenido, publicoVerificado);
        } else {
          // Idempotencia: el MISMO contenido (huella declarada, tamaño y tipo)
          // ya custodiado se devuelve sin re-subir; otro contenido no se pisa.
          await autorizar(ctx, objeto, 'CREAR', 'INICIAR_SUBIDA', contenido, publicoVerificado);
          const huella = customMetadata.sha256;
          const identico = Boolean(huella) && previo.metadata.sha256 === huella
            && previo.size === tamanoBytes && previo.contentType === contentType;
          if (!identico) {
            registrar({ operacion: 'INICIAR_SUBIDA', resultado: 'DENEGADO', destino: objeto.destino.clave, carpeta: carpetaDe(objeto.path), actor: etiqueta, motivo: 'OBJETO_EXISTENTE' });
            throw new ErrorDocumental('OBJETO_EXISTENTE', 409);
          }
          const url = objeto.destino.urlPersistente
            ? deps.almacen.urlDescargaConToken(objeto.path, await asegurarToken(objeto.path, previo, false))
            : undefined;
          registrar({ operacion: 'INICIAR_SUBIDA', resultado: 'OK', destino: objeto.destino.clave, carpeta: carpetaDe(objeto.path), actor: etiqueta, motivo: 'YA_EXISTE_IDENTICO' });
          return { estado: 'YA_EXISTE', storagePath: objeto.path, metadatos: proyectar(objeto.path, previo), ...(url ? { url } : {}) };
        }
      } else {
        await autorizar(ctx, objeto, 'CREAR', 'INICIAR_SUBIDA', contenido, publicoVerificado);
      }

      const metadata: Record<string, string> = {
        ...customMetadata,
        [META_ORIGEN]: VALOR_ORIGEN,
        [META_UID]: actor ? actor.uid : 'portal-publico',
        [META_TOKENS]: nuevoToken(),
      };
      let resultado: { sesionUri: string } | 'YA_EXISTE';
      try {
        resultado = await deps.almacen.iniciarSesionResumable({
          path: objeto.path,
          contentType,
          tamanoBytes,
          metadata,
          ...(entrada.origen ? { origen: entrada.origen } : {}),
          soloSiNoExiste: !previo,
        });
      } catch {
        registrar({ operacion: 'INICIAR_SUBIDA', resultado: 'ERROR', destino: objeto.destino.clave, carpeta: carpetaDe(objeto.path), actor: etiqueta, codigo: 'ALMACEN_NO_DISPONIBLE' });
        throw new ErrorDocumental('ALMACEN_NO_DISPONIBLE', 503);
      }
      if (resultado === 'YA_EXISTE') {
        // Carrera: otro cliente creó el objeto entre la consulta y la sesión.
        throw new ErrorDocumental('OBJETO_EXISTENTE', 409);
      }
      registrar({ operacion: 'INICIAR_SUBIDA', resultado: 'OK', destino: objeto.destino.clave, carpeta: carpetaDe(objeto.path), actor: etiqueta });
      return { estado: 'SESION', sesionUri: resultado.sesionUri, storagePath: objeto.path };
    },

    async confirmarSubida(entrada) {
      const objeto = resolver(entrada.storagePath);
      const actor = actorDe(entrada.identidad);
      const publicoVerificado = !actor && (await verificarPublico(entrada.publico, objeto));
      if (!actor && !publicoVerificado) throw new ErrorDocumental('NO_AUTENTICADO', 401);
      const ctx = contextoDe(actor);
      const etiqueta = etiquetaActor(actor, publicoVerificado);

      const m = await metadatosObjeto(objeto.path);
      if (!m) {
        registrar({ operacion: 'CONFIRMAR_SUBIDA', resultado: 'ERROR', destino: objeto.destino.clave, carpeta: carpetaDe(objeto.path), actor: etiqueta, codigo: 'OBJETO_INCOMPLETO' });
        throw new ErrorDocumental('OBJETO_INCOMPLETO', 409, 'SIN_OBJETO');
      }
      const customMetadata: Record<string, string> = {};
      for (const [k, v] of Object.entries(m.metadata)) if (!CLAVES_RESERVADAS.has(k)) customMetadata[k] = v;
      const contenido = { contentType: m.contentType, tamanoBytes: m.size, customMetadata };

      // Sólo es confirmable el objeto que ESTE actor creó por esta vía: la
      // marca de origen y el uid los fijó el servidor en la sesión (el cliente
      // no puede falsificarlos). Un objeto ajeno o heredado nunca se toca aquí.
      const propio = m.metadata[META_ORIGEN] === VALOR_ORIGEN
        && m.metadata[META_UID] === (actor ? actor.uid : 'portal-publico');

      // Re-autorización con los datos REALES del objeto (tamaño/tipo observados,
      // no declarados): una revocación entre inicio y confirmación deniega aquí.
      try {
        await autorizar(ctx, objeto, 'CREAR', 'CONFIRMAR_SUBIDA', contenido, publicoVerificado);
        if (!propio) throw new ErrorDocumental('OBJETO_INCOMPLETO', 409, 'OBJETO_AJENO');
      } catch (error) {
        // El objeto propio ya está escrito: si no respeta el destino (o el actor
        // perdió el ámbito) se retira para no dejar material fuera de regla.
        // Nunca se informa éxito. Un objeto ajeno no se borra (sería una vía de
        // borrado sin permiso de BORRAR).
        if (propio && error instanceof ErrorDocumental
          && error.codigo !== 'FUENTE_NO_DISPONIBLE' && error.codigo !== 'ALMACEN_NO_DISPONIBLE') {
          try { await deps.almacen.borrar(objeto.path); } catch { /* se registra el fallo original */ }
        }
        throw error;
      }

      // URL persistible (flujos que guardan `url` en el registro). El portal
      // público la recibe sólo para el objeto que acaba de subir y que ya ha
      // sido verificado: equivale a la URL que la administración guardará.
      const url = objeto.destino.urlPersistente
        ? deps.almacen.urlDescargaConToken(objeto.path, await asegurarToken(objeto.path, m, false))
        : undefined;
      registrar({ operacion: 'CONFIRMAR_SUBIDA', resultado: 'OK', destino: objeto.destino.clave, carpeta: carpetaDe(objeto.path), actor: etiqueta });
      return { storagePath: objeto.path, metadatos: proyectar(objeto.path, m), ...(url ? { url } : {}) };
    },

    async acceso(entrada) {
      const objeto = resolver(entrada.storagePath);
      const actor = actorDe(entrada.identidad);
      if (!actor) throw new ErrorDocumental('NO_AUTENTICADO', 401);
      const ctx = contextoDe(actor);
      await autorizar(ctx, objeto, 'LEER', 'ACCESO');
      const m = await metadatosObjeto(objeto.path);
      if (!m) {
        registrar({ operacion: 'ACCESO', resultado: 'ERROR', destino: objeto.destino.clave, carpeta: carpetaDe(objeto.path), actor: etiquetaActor(actor, false), codigo: 'OBJETO_NO_ENCONTRADO' });
        throw new ErrorDocumental('OBJETO_NO_ENCONTRADO', 404);
      }
      const token = await asegurarToken(objeto.path, m, objeto.destino.tokenRotatorio);
      registrar({ operacion: 'ACCESO', resultado: 'OK', destino: objeto.destino.clave, carpeta: carpetaDe(objeto.path), actor: etiquetaActor(actor, false) });
      return { storagePath: objeto.path, url: deps.almacen.urlDescargaConToken(objeto.path, token), metadatos: proyectar(objeto.path, m) };
    },

    async borrar(entrada) {
      const objeto = resolver(entrada.storagePath);
      const actor = actorDe(entrada.identidad);
      if (!actor) throw new ErrorDocumental('NO_AUTENTICADO', 401);
      const ctx = contextoDe(actor);
      await autorizar(ctx, objeto, 'BORRAR', 'BORRAR');
      let estado: 'BORRADO' | 'NO_EXISTE';
      try {
        estado = await deps.almacen.borrar(objeto.path);
      } catch {
        registrar({ operacion: 'BORRAR', resultado: 'ERROR', destino: objeto.destino.clave, carpeta: carpetaDe(objeto.path), actor: etiquetaActor(actor, false), codigo: 'ALMACEN_NO_DISPONIBLE' });
        throw new ErrorDocumental('ALMACEN_NO_DISPONIBLE', 503);
      }
      registrar({ operacion: 'BORRAR', resultado: 'OK', destino: objeto.destino.clave, carpeta: carpetaDe(objeto.path), actor: etiquetaActor(actor, false), motivo: estado });
      return { storagePath: objeto.path, estado };
    },
  };
}
