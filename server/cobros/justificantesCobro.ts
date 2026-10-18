/**
 * P2 — servicio autoritativo de justificantes de alquiler.
 *
 * El justificante es una pieza documental separada de `CobroPeriodo`: presentar,
 * aceptar, rechazar o rectificar nunca altera `importeRecibido`, `fechaPago`,
 * `estado` del cobro, tesorería ni conciliación bancaria. El archivo se guarda
 * en Storage con creación condicional; los metadatos privados usan Firestore
 * (colecciones sin permiso cliente) y toda acción deja un evento append-only.
 */
import { createHash } from 'node:crypto';
import type { AlmacenJustificantes } from './almacenGoogleStorage.js';

export const COLECCION_JUSTIFICANTES_COBRO = 'justificantes_cobro';
export const COLECCION_AUDITORIA_JUSTIFICANTES_COBRO = 'justificantes_cobro_auditoria';
export const MAX_BYTES_JUSTIFICANTE_COBRO = 4 * 1024 * 1024;
export const MAX_CAS_JUSTIFICANTE_COBRO = 4;
export const MAX_PAGINA_JUSTIFICANTES_COBRO = 100;

export type EstadoJustificanteCobro =
  | 'SUBIENDO'
  | 'ERROR_SUBIDA'
  | 'PENDIENTE_REVISION'
  | 'ACEPTADO'
  | 'RECHAZADO';

export type ActorJustificanteCobro = 'INQUILINO' | 'PROPIETARIO' | 'GESTOR';
export type AccionAuditoriaJustificanteCobro =
  | 'SUBIDA_INICIADA'
  | 'REINTENTO_SUBIDA'
  | 'PRESENTADO'
  | 'ERROR_SUBIDA'
  | 'ACEPTADO'
  | 'RECHAZADO'
  | 'RECTIFICADO';
export type MetodoPagoDeclarado = 'transferencia' | 'domiciliacion' | 'bizum' | 'efectivo' | 'otro';

export interface PuertoJustificantesCobro {
  leerDocumento(ruta: string): Promise<{ id: string; datos: Record<string, unknown>; updateTime?: string } | null>;
  crearDocumento(coleccion: string, id: string, datos: Record<string, unknown>): Promise<'CREADO' | 'YA_EXISTE'>;
  actualizarCamposSiVersion(
    coleccion: string,
    id: string,
    datos: Record<string, unknown>,
    updateTimeEsperado: string,
  ): Promise<boolean>;
  consultarIgualdadesOrden(
    coleccion: string,
    consulta: {
      igualdades?: Array<[campo: string, valor: string]>;
      orden?: { campo: string; direccion: 'ASCENDING' | 'DESCENDING' };
      limite: number;
      offset?: number;
    },
  ): Promise<Array<{ id: string; datos: Record<string, unknown>; updateTime?: string }>>;
}

export interface EntradaPresentarJustificante {
  uid: string;
  contratoId: string;
  cobroPeriodoId: string;
  claveIdempotencia: string;
  nombreArchivo: string;
  tipoMime: string;
  importeDeclarado: number;
  fechaPagoDeclarada: string;
  metodoPagoDeclarado: MetodoPagoDeclarado;
  bytes: Uint8Array;
}

export interface EntradaDecisionJustificante {
  uid: string;
  justificanteId: string;
  claveIdempotencia: string;
  accion: 'ACEPTAR' | 'RECHAZAR' | 'RECTIFICAR';
  estadoCorregido?: 'ACEPTADO' | 'RECHAZADO';
  motivo?: string;
}

export interface VistaJustificanteCobro {
  id: string;
  contratoId: string;
  cobroPeriodoId: string;
  propietarioId: string;
  inmuebleId: string;
  estado: EstadoJustificanteCobro;
  version: number;
  intento: number;
  nombreArchivo: string;
  tipoMime: string;
  tamanoBytes: number;
  importeDeclarado: number;
  fechaPagoDeclarada: string;
  metodoPagoDeclarado: MetodoPagoDeclarado;
  subidoEn: string;
  actualizadoEn: string;
  subidoPorUsuarioId: string;
  revisadoEn?: string;
  revisadoPorUsuarioId?: string;
  motivoRevision?: string;
}

export interface VistaEventoJustificanteCobro {
  id: string;
  justificanteId: string;
  contratoId: string;
  cobroPeriodoId: string;
  accion: AccionAuditoriaJustificanteCobro;
  estadoAnterior?: EstadoJustificanteCobro;
  estadoNuevo: EstadoJustificanteCobro;
  creadoEn: string;
  actor: ActorJustificanteCobro;
  actorUsuarioId: string;
  motivo?: string;
  nombreArchivo?: string;
  tipoMime?: string;
  tamanoBytes?: number;
  importeDeclarado?: number;
  fechaPagoDeclarada?: string;
  metodoPagoDeclarado?: MetodoPagoDeclarado;
  archivoDisponible: boolean;
}

export interface ResultadoListaJustificantesCobro {
  items: VistaJustificanteCobro[];
  hayMas: boolean;
}

export interface ArchivoJustificanteCobro {
  bytes: Uint8Array;
  tipoMime: string;
  nombreArchivo: string;
}

export interface DependenciasJustificantesCobro {
  puerto: PuertoJustificantesCobro;
  almacen: AlmacenJustificantes;
  ahora?: () => Date;
}

export interface ServicioJustificantesCobro {
  presentar(entrada: EntradaPresentarJustificante): Promise<{ justificante: VistaJustificanteCobro; duplicada: boolean }>;
  listar(entrada: { uid: string; contratoIds: string[]; offset?: number }): Promise<ResultadoListaJustificantesCobro>;
  decidir(entrada: EntradaDecisionJustificante): Promise<{ justificante: VistaJustificanteCobro; duplicada: boolean }>;
  auditoria(entrada: { uid: string; justificanteId: string; offset?: number }): Promise<{ eventos: VistaEventoJustificanteCobro[]; hayMas: boolean }>;
  descargar(entrada: { uid: string; justificanteId: string; eventoId?: string }): Promise<ArchivoJustificanteCobro>;
}

export type CodigoErrorJustificanteCobro =
  | 'PETICION_INVALIDA'
  | 'ARCHIVO_INVALIDO'
  | 'ARCHIVO_DEMASIADO_GRANDE'
  | 'IMPORTE_INVALIDO'
  | 'FECHA_INVALIDA'
  | 'PERFIL_NO_VALIDO'
  | 'CONTRATO_NO_AUTORIZADO'
  | 'COBRO_NO_VALIDO'
  | 'JUSTIFICANTE_NO_ENCONTRADO'
  | 'JUSTIFICANTE_EN_CURSO'
  | 'TRANSICION_INVALIDA'
  | 'CLAVE_IDEMPOTENCIA_REUTILIZADA'
  | 'CONFLICTO_CONCURRENCIA'
  | 'AUDITORIA_NO_DISPONIBLE'
  | 'ALMACEN_NO_DISPONIBLE'
  | 'FUENTE_NO_DISPONIBLE';

export class ErrorJustificanteCobro extends Error {
  constructor(readonly codigo: CodigoErrorJustificanteCobro, readonly status: number) {
    super(codigo);
  }
}

interface ActorResuelto {
  uid: string;
  usuarioId: string;
  tipoPerfil: string;
  espejo: Record<string, unknown>;
  ficha: Record<string, unknown>;
}

interface DocumentoInterno {
  id: string;
  datos: Record<string, unknown>;
  updateTime?: string;
}

interface EventoInterno extends Record<string, unknown> {
  id: string;
  justificanteId: string;
  contratoId: string;
  cobroPeriodoId: string;
  accion: AccionAuditoriaJustificanteCobro;
  estadoNuevo: EstadoJustificanteCobro;
  creadoEn: string;
  actor: ActorJustificanteCobro;
  actorUid: string;
  actorUsuarioId: string;
  claveOperacionHash: string;
  archivoDisponible: boolean;
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const CLAVE_RE = /^[A-Za-z0-9_-]{16,128}$/;
const METODOS: readonly MetodoPagoDeclarado[] = ['transferencia', 'domiciliacion', 'bizum', 'efectivo', 'otro'];
const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function sha256(valor: string | Uint8Array): string {
  return createHash('sha256').update(valor).digest('hex');
}

function idJustificante(contratoId: string, cobroPeriodoId: string): string {
  return `jc_${sha256(`${contratoId}\n${cobroPeriodoId}`).slice(0, 48)}`;
}

function eventoId(justificanteId: string, version: number, accion: string, claveHash: string): string {
  return `ja_${sha256(`${justificanteId}\n${version}\n${accion}\n${claveHash}`).slice(0, 48)}`;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function texto(valor: unknown, max = 200): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio && limpio.length <= max ? limpio : null;
}

function listaTextos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];
}

function idsAmbitoExplicitos(valor: unknown): string[] | null {
  if (!Array.isArray(valor) || !valor.every((id) => validarId(id))) return null;
  return valor as string[];
}

function mapa(valor: unknown): Record<string, unknown> {
  return esObjeto(valor) ? valor : {};
}

function validarId(valor: unknown): valor is string {
  return typeof valor === 'string' && ID_RE.test(valor) && valor !== '.' && valor !== '..';
}

function validarFecha(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const fecha = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === iso;
}

function detectarMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-') return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && Buffer.from(bytes.subarray(1, 8)).toString('ascii') === 'PNG\r\n\x1a\n') return 'image/png';
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF'
    && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function nombreSeguro(nombre: string, tipoMime: string): string {
  const extension = MIME_EXT[tipoMime];
  const baseOriginal = nombre.split(/[\\/]/).pop() || '';
  const sinExt = baseOriginal.replace(/\.[^.]*$/, '').normalize('NFKD').replace(/[^A-Za-z0-9_-]/g, '_')
    .replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'justificante';
  return `${sinExt}.${extension}`;
}

function validarEntradaArchivo(entrada: EntradaPresentarJustificante): { tipoMime: string; nombreArchivo: string; sha: string } {
  const bytes = entrada.bytes;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new ErrorJustificanteCobro('ARCHIVO_INVALIDO', 400);
  }
  if (bytes.byteLength > MAX_BYTES_JUSTIFICANTE_COBRO) {
    throw new ErrorJustificanteCobro('ARCHIVO_DEMASIADO_GRANDE', 413);
  }
  const detectado = detectarMime(bytes);
  if (!detectado || detectado !== entrada.tipoMime || !(detectado in MIME_EXT)) {
    throw new ErrorJustificanteCobro('ARCHIVO_INVALIDO', 400);
  }
  if (typeof entrada.nombreArchivo !== 'string' || entrada.nombreArchivo.trim().length === 0 || entrada.nombreArchivo.length > 240) {
    throw new ErrorJustificanteCobro('ARCHIVO_INVALIDO', 400);
  }
  return { tipoMime: detectado, nombreArchivo: nombreSeguro(entrada.nombreArchivo, detectado), sha: sha256(bytes) };
}

function validarDatosDeclarados(entrada: EntradaPresentarJustificante): void {
  if (!Number.isFinite(entrada.importeDeclarado) || entrada.importeDeclarado <= 0
    || entrada.importeDeclarado > 1_000_000 || Math.round(entrada.importeDeclarado * 100) !== entrada.importeDeclarado * 100) {
    throw new ErrorJustificanteCobro('IMPORTE_INVALIDO', 400);
  }
  if (typeof entrada.fechaPagoDeclarada !== 'string' || !validarFecha(entrada.fechaPagoDeclarada)) {
    throw new ErrorJustificanteCobro('FECHA_INVALIDA', 400);
  }
  if (!METODOS.includes(entrada.metodoPagoDeclarado)) {
    throw new ErrorJustificanteCobro('PETICION_INVALIDA', 400);
  }
  if (!CLAVE_RE.test(entrada.claveIdempotencia)) {
    throw new ErrorJustificanteCobro('PETICION_INVALIDA', 400);
  }
}

function claveUsuarioHash(uid: string, clave: string): string {
  return sha256(`${uid}\n${clave}`);
}

function huellaPeticion(entrada: EntradaPresentarJustificante, hashArchivo: string, nombre: string): string {
  return sha256(JSON.stringify({
    contratoId: entrada.contratoId,
    cobroPeriodoId: entrada.cobroPeriodoId,
    hashArchivo,
    tipoMime: entrada.tipoMime,
    nombre,
    importeDeclarado: entrada.importeDeclarado,
    fechaPagoDeclarada: entrada.fechaPagoDeclarada,
    metodoPagoDeclarado: entrada.metodoPagoDeclarado,
  }));
}

function estadoEsFinal(estado: unknown): estado is 'ACEPTADO' | 'RECHAZADO' {
  return estado === 'ACEPTADO' || estado === 'RECHAZADO';
}

function estadoValido(valor: unknown): valor is EstadoJustificanteCobro {
  return valor === 'SUBIENDO' || valor === 'ERROR_SUBIDA' || valor === 'PENDIENTE_REVISION'
    || valor === 'ACEPTADO' || valor === 'RECHAZADO';
}

function vistaJustificante(documento: DocumentoInterno): VistaJustificanteCobro {
  const d = documento.datos;
  if (!estadoValido(d.estado)) throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
  return {
    id: documento.id,
    contratoId: String(d.contratoId || ''),
    cobroPeriodoId: String(d.cobroPeriodoId || ''),
    propietarioId: String(d.propietarioId || ''),
    inmuebleId: String(d.inmuebleId || ''),
    estado: d.estado,
    version: Number(d.version) || 0,
    intento: Number(d.intento) || 0,
    nombreArchivo: String(d.nombreArchivo || ''),
    tipoMime: String(d.tipoMime || ''),
    tamanoBytes: Number(d.tamanoBytes) || 0,
    importeDeclarado: Number(d.importeDeclarado) || 0,
    fechaPagoDeclarada: String(d.fechaPagoDeclarada || ''),
    metodoPagoDeclarado: d.metodoPagoDeclarado as MetodoPagoDeclarado,
    subidoEn: String(d.subidoEn || ''),
    actualizadoEn: String(d.actualizadoEn || ''),
    subidoPorUsuarioId: String(d.subidoPorUsuarioId || ''),
    ...(typeof d.revisadoEn === 'string' ? { revisadoEn: d.revisadoEn } : {}),
    ...(typeof d.revisadoPorUsuarioId === 'string' ? { revisadoPorUsuarioId: d.revisadoPorUsuarioId } : {}),
    ...(typeof d.motivoRevision === 'string' && d.motivoRevision ? { motivoRevision: d.motivoRevision } : {}),
  };
}

function vistaEvento(documento: DocumentoInterno): VistaEventoJustificanteCobro {
  const d = documento.datos;
  if (!estadoValido(d.estadoNuevo) || !['INQUILINO', 'PROPIETARIO', 'GESTOR'].includes(String(d.actor))) {
    throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
  }
  return {
    id: documento.id,
    justificanteId: String(d.justificanteId || ''),
    contratoId: String(d.contratoId || ''),
    cobroPeriodoId: String(d.cobroPeriodoId || ''),
    accion: d.accion as AccionAuditoriaJustificanteCobro,
    ...(estadoValido(d.estadoAnterior) ? { estadoAnterior: d.estadoAnterior } : {}),
    estadoNuevo: d.estadoNuevo,
    creadoEn: String(d.creadoEn || ''),
    actor: d.actor as ActorJustificanteCobro,
    actorUsuarioId: String(d.actorUsuarioId || ''),
    ...(typeof d.motivo === 'string' && d.motivo ? { motivo: d.motivo } : {}),
    ...(typeof d.nombreArchivo === 'string' ? { nombreArchivo: d.nombreArchivo } : {}),
    ...(typeof d.tipoMime === 'string' ? { tipoMime: d.tipoMime } : {}),
    ...(typeof d.tamanoBytes === 'number' ? { tamanoBytes: d.tamanoBytes } : {}),
    ...(typeof d.importeDeclarado === 'number' ? { importeDeclarado: d.importeDeclarado } : {}),
    ...(typeof d.fechaPagoDeclarada === 'string' ? { fechaPagoDeclarada: d.fechaPagoDeclarada } : {}),
    ...(METODOS.includes(d.metodoPagoDeclarado as MetodoPagoDeclarado)
      ? { metodoPagoDeclarado: d.metodoPagoDeclarado as MetodoPagoDeclarado }
      : {}),
    archivoDisponible: d.archivoDisponible === true,
  };
}

export function crearServicioJustificantesCobro(deps: DependenciasJustificantesCobro): ServicioJustificantesCobro {
  const ahora = deps.ahora ?? (() => new Date());
  const ahoraIso = () => ahora().toISOString();

  async function leer(ruta: string): Promise<DocumentoInterno | null> {
    try { return await deps.puerto.leerDocumento(ruta); }
    catch { throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503); }
  }

  async function crear(coleccion: string, id: string, datos: Record<string, unknown>): Promise<'CREADO' | 'YA_EXISTE'> {
    try { return await deps.puerto.crearDocumento(coleccion, id, datos); }
    catch { throw new ErrorJustificanteCobro(coleccion === COLECCION_AUDITORIA_JUSTIFICANTES_COBRO
      ? 'AUDITORIA_NO_DISPONIBLE' : 'FUENTE_NO_DISPONIBLE', 503); }
  }

  async function cas(id: string, datos: Record<string, unknown>, updateTime: string): Promise<boolean> {
    try { return await deps.puerto.actualizarCamposSiVersion(COLECCION_JUSTIFICANTES_COBRO, id, datos, updateTime); }
    catch { throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503); }
  }

  async function consultar(
    coleccion: string,
    igualdades: Array<[string, string]>,
    offset: number,
  ): Promise<DocumentoInterno[]> {
    try {
      return await deps.puerto.consultarIgualdadesOrden(coleccion, {
        igualdades,
        limite: MAX_PAGINA_JUSTIFICANTES_COBRO,
        offset,
      });
    } catch {
      throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
    }
  }

  async function resolverActor(uid: string): Promise<ActorResuelto> {
    const espejoDoc = await leer(`usuarios_auth/${uid}`);
    const espejo = espejoDoc?.datos;
    const usuarioId = texto(espejo?.usuarioId, 180);
    if (!espejo || espejo.estado !== 'ACTIVO' || !usuarioId
      || (typeof espejo.authUid === 'string' && espejo.authUid !== uid)) {
      throw new ErrorJustificanteCobro('PERFIL_NO_VALIDO', 403);
    }
    const fichaDoc = await leer(`usuarios/${usuarioId}`);
    const ficha = fichaDoc?.datos;
    if (!ficha || ficha.authUid !== uid || ficha.estado !== 'ACTIVO'
      || ficha.tipoPerfil !== espejo.tipoPerfil) {
      throw new ErrorJustificanteCobro('PERFIL_NO_VALIDO', 403);
    }
    return { uid, usuarioId, tipoPerfil: String(espejo.tipoPerfil || ''), espejo, ficha };
  }

  async function leerContrato(contratoId: string): Promise<Record<string, unknown>> {
    if (!validarId(contratoId)) throw new ErrorJustificanteCobro('PETICION_INVALIDA', 400);
    const doc = await leer(`contratos_formalizacion/${contratoId}`);
    if (!doc || (typeof doc.datos.id === 'string' && doc.datos.id !== contratoId)) {
      throw new ErrorJustificanteCobro('CONTRATO_NO_AUTORIZADO', 404);
    }
    return doc.datos;
  }

  async function esGestor(actor: ActorResuelto, contrato: Record<string, unknown>, escritura: boolean): Promise<boolean> {
    const propietarioId = texto(contrato.propietarioId, 180);
    const inmuebleId = texto(contrato.inmuebleId, 180);
    if (!propietarioId || !inmuebleId) return false;
    const relaciones = mapa(actor.espejo.gestionesPorPropietario);
    const relacionId = relaciones[propietarioId];
    if (!validarId(relacionId)) return false;
    const relacionDoc = await leer(`gestiones_cartera/${relacionId}`);
    if (!relacionDoc) return false;
    const gestion = relacionDoc.datos;
    const inmuebles = idsAmbitoExplicitos(gestion.inmuebleIds);
    // Solo [] explícito significa cartera completa; campo ausente o corrupto falla cerrado.
    const acotadaAlInmueble = inmuebles !== null && (inmuebles.length === 0 || inmuebles.includes(inmuebleId));
    const permisoLectura = gestion.permiso === 'LECTURA' || gestion.permiso === 'LECTURA_ESCRITURA';
    const activa = gestion.propietarioId === propietarioId
      && gestion.gestorUsuarioId === actor.usuarioId
      && gestion.estado === 'ACTIVA'
      && gestion.resolucionInvitacion === 'ACEPTADA'
      && permisoLectura
      && acotadaAlInmueble;
    if (!activa) return false;
    return !escritura || (gestion.permiso === 'LECTURA_ESCRITURA' && gestion.responsableActual === 'GESTOR');
  }

  async function autorizarContrato(
    actor: ActorResuelto,
    contratoId: string,
    contrato: Record<string, unknown>,
    nivel: 'LECTURA' | 'ESCRITURA' | 'INQUILINO',
  ): Promise<ActorJustificanteCobro> {
    const propietarioId = texto(contrato.propietarioId, 180);
    if (!propietarioId) throw new ErrorJustificanteCobro('CONTRATO_NO_AUTORIZADO', 404);
    if (actor.tipoPerfil === 'INQUILINO' && nivel !== 'ESCRITURA') {
      const vinculados = listaTextos(actor.ficha.contratoIds);
      if (vinculados.includes(contratoId)) return 'INQUILINO';
      throw new ErrorJustificanteCobro('CONTRATO_NO_AUTORIZADO', 404);
    }
    if (nivel === 'INQUILINO') throw new ErrorJustificanteCobro('CONTRATO_NO_AUTORIZADO', 403);

    if (actor.tipoPerfil === 'PROPIETARIO' && actor.ficha.propietarioId === propietarioId) {
      return 'PROPIETARIO';
    }
    if (await esGestor(actor, contrato, nivel === 'ESCRITURA')) return 'GESTOR';
    throw new ErrorJustificanteCobro('CONTRATO_NO_AUTORIZADO', 404);
  }

  function validarCobro(
    contrato: Record<string, unknown>,
    contratoId: string,
    cobroPeriodoId: string,
  ): Record<string, unknown> {
    if (!validarId(cobroPeriodoId)) throw new ErrorJustificanteCobro('PETICION_INVALIDA', 400);
    const periodos = Array.isArray(contrato.registroCobros) ? contrato.registroCobros : [];
    const cobro = periodos.map(mapa).find((p) => p.id === cobroPeriodoId);
    if (!cobro || cobro.contratoId !== contratoId
      || cobro.propietarioId !== contrato.propietarioId
      || cobro.inmuebleId !== contrato.inmuebleId
      || typeof contrato.candidatoId !== 'string' || !contrato.candidatoId
      || typeof cobro.inquilinoId !== 'string' || cobro.inquilinoId !== contrato.candidatoId) {
      throw new ErrorJustificanteCobro('COBRO_NO_VALIDO', 422);
    }
    // La UI también deshabilita la presentación en cobros cerrados o ya recibidos.
    // Repetimos el control aquí: el cliente nunca define el estado operativo.
    if (['RECIBIDO', 'VERIFICADO', 'PAGADO', 'ANULADO', 'DEVUELTO'].includes(String(cobro.estado))) {
      throw new ErrorJustificanteCobro('COBRO_NO_VALIDO', 409);
    }
    return cobro;
  }

  function rutaObjeto(propietarioId: string, contratoId: string, cobroPeriodoId: string, intento: number, claveHash: string, nombre: string): string {
    return `cobros_justificantes/${propietarioId}/${contratoId}/${cobroPeriodoId}/${intento}_${claveHash.slice(0, 24)}/${nombre}`;
  }

  function rutaObjetoValida(ruta: string, propietarioId: string, contratoId: string, cobroPeriodoId: string): boolean {
    const partes = ruta.split('/');
    return partes.length === 6
      && partes[0] === 'cobros_justificantes'
      && partes[1] === propietarioId
      && partes[2] === contratoId
      && partes[3] === cobroPeriodoId
      && /^[1-9][0-9]*_[a-f0-9]{24}$/.test(partes[4])
      && /^[A-Za-z0-9_-]{1,64}\.(pdf|jpg|png|webp)$/.test(partes[5]);
  }

  function crearEvento(
    id: string,
    datos: {
      justificanteId: string;
      contratoId: string;
      cobroPeriodoId: string;
      accion: AccionAuditoriaJustificanteCobro;
      estadoAnterior?: EstadoJustificanteCobro;
      estadoNuevo: EstadoJustificanteCobro;
      actor: ActorJustificanteCobro;
      actorResuelto: ActorResuelto;
      claveOperacionHash: string;
      creadoEn: string;
      motivo?: string;
      archivoDisponible: boolean;
      archivo?: Record<string, unknown>;
    },
  ): EventoInterno {
    return {
      id,
      justificanteId: datos.justificanteId,
      contratoId: datos.contratoId,
      cobroPeriodoId: datos.cobroPeriodoId,
      accion: datos.accion,
      ...(datos.estadoAnterior ? { estadoAnterior: datos.estadoAnterior } : {}),
      estadoNuevo: datos.estadoNuevo,
      creadoEn: datos.creadoEn,
      actor: datos.actor,
      actorUid: datos.actorResuelto.uid,
      actorUsuarioId: datos.actorResuelto.usuarioId,
      claveOperacionHash: datos.claveOperacionHash,
      ...(datos.motivo ? { motivo: datos.motivo } : {}),
      archivoDisponible: datos.archivoDisponible,
      ...(datos.archivo || {}),
    };
  }

  async function repararAuditoria(documento: DocumentoInterno): Promise<DocumentoInterno> {
    const pendiente = mapa(documento.datos.eventoAuditoriaPendiente);
    const id = texto(pendiente.id, 80);
    if (!id) return documento;
    const auditRuta = `${COLECCION_AUDITORIA_JUSTIFICANTES_COBRO}/${id}`;
    let existente = await leer(auditRuta);
    if (!existente) {
      await crear(COLECCION_AUDITORIA_JUSTIFICANTES_COBRO, id, pendiente);
      existente = await leer(auditRuta);
    }
    if (!existente || existente.datos.id !== id
      || existente.datos.justificanteId !== documento.id
      || existente.datos.accion !== pendiente.accion
      || existente.datos.claveOperacionHash !== pendiente.claveOperacionHash) {
      throw new ErrorJustificanteCobro('AUDITORIA_NO_DISPONIBLE', 503);
    }
    const actual = await leer(`${COLECCION_JUSTIFICANTES_COBRO}/${documento.id}`);
    if (!actual || !actual.updateTime) throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
    if (mapa(actual.datos.eventoAuditoriaPendiente).id !== id) return actual;
    let limpio = false;
    try {
      limpio = await cas(documento.id, { eventoAuditoriaPendiente: null }, actual.updateTime);
    } catch {
      throw new ErrorJustificanteCobro('AUDITORIA_NO_DISPONIBLE', 503);
    }
    if (!limpio) {
      const releido = await leer(`${COLECCION_JUSTIFICANTES_COBRO}/${documento.id}`);
      if (!releido || mapa(releido.datos.eventoAuditoriaPendiente).id === id) {
        throw new ErrorJustificanteCobro('CONFLICTO_CONCURRENCIA', 409);
      }
      return releido;
    }
    const releido = await leer(`${COLECCION_JUSTIFICANTES_COBRO}/${documento.id}`);
    if (!releido) throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
    return releido;
  }

  async function repararSiHaceFalta(documento: DocumentoInterno): Promise<DocumentoInterno> {
    return texto(mapa(documento.datos.eventoAuditoriaPendiente).id, 80)
      ? repararAuditoria(documento)
      : documento;
  }

  async function prepararTransicion(
    documento: DocumentoInterno,
    patch: Record<string, unknown>,
    evento: EventoInterno,
  ): Promise<DocumentoInterno | null> {
    if (!documento.updateTime) throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
    const version = (Number(documento.datos.version) || 0) + 1;
    const cambios = {
      ...patch,
      version,
      actualizadoEn: evento.creadoEn,
      eventoAuditoriaPendiente: { ...evento, version },
    };
    const gano = await cas(documento.id, cambios, documento.updateTime);
    if (!gano) return null;
    const releido = await leer(`${COLECCION_JUSTIFICANTES_COBRO}/${documento.id}`);
    if (!releido) throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
    return repararAuditoria(releido);
  }

  async function eventoYaAplicado(
    id: string,
    accion: AccionAuditoriaJustificanteCobro,
    claveOperacionHash: string,
    motivo?: string,
    estadoNuevo?: EstadoJustificanteCobro,
  ): Promise<DocumentoInterno | null> {
    const doc = await leer(`${COLECCION_AUDITORIA_JUSTIFICANTES_COBRO}/${id}`);
    if (!doc) return null;
    if (doc.datos.accion !== accion || doc.datos.claveOperacionHash !== claveOperacionHash
      || (motivo || '') !== (typeof doc.datos.motivo === 'string' ? doc.datos.motivo : '')
      || (estadoNuevo && doc.datos.estadoNuevo !== estadoNuevo)) {
      throw new ErrorJustificanteCobro('CLAVE_IDEMPOTENCIA_REUTILIZADA', 409);
    }
    return doc;
  }

  async function obtenerVistaActual(id: string): Promise<DocumentoInterno> {
    const actual = await leer(`${COLECCION_JUSTIFICANTES_COBRO}/${id}`);
    if (!actual) throw new ErrorJustificanteCobro('JUSTIFICANTE_NO_ENCONTRADO', 404);
    return repararSiHaceFalta(actual);
  }

  async function metadataArchivo(documento: DocumentoInterno): Promise<Record<string, unknown>> {
    const d = documento.datos;
    return {
      nombreArchivo: d.nombreArchivo,
      tipoMime: d.tipoMime,
      tamanoBytes: d.tamanoBytes,
      sha256: d.sha256,
      storagePath: d.storagePath,
      importeDeclarado: d.importeDeclarado,
      fechaPagoDeclarada: d.fechaPagoDeclarada,
      metodoPagoDeclarado: d.metodoPagoDeclarado,
      propietarioId: d.propietarioId,
      inmuebleId: d.inmuebleId,
    };
  }

  async function presentar(entrada: EntradaPresentarJustificante): Promise<{ justificante: VistaJustificanteCobro; duplicada: boolean }> {
    if (!validarId(entrada.contratoId) || !validarId(entrada.cobroPeriodoId)) {
      throw new ErrorJustificanteCobro('PETICION_INVALIDA', 400);
    }
    validarDatosDeclarados(entrada);
    const archivo = validarEntradaArchivo(entrada);
    const requestKeyHash = claveUsuarioHash(entrada.uid, entrada.claveIdempotencia);
    const requestFingerprint = huellaPeticion(entrada, archivo.sha, archivo.nombreArchivo);
    const actor = await resolverActor(entrada.uid);
    const contrato = await leerContrato(entrada.contratoId);
    await autorizarContrato(actor, entrada.contratoId, contrato, 'INQUILINO');
    validarCobro(contrato, entrada.contratoId, entrada.cobroPeriodoId);

    const id = idJustificante(entrada.contratoId, entrada.cobroPeriodoId);
    const propietarioId = String(contrato.propietarioId);
    const inmuebleId = String(contrato.inmuebleId);
    const submission = {
      contratoId: entrada.contratoId,
      cobroPeriodoId: entrada.cobroPeriodoId,
      propietarioId,
      inmuebleId,
      estado: 'SUBIENDO' as EstadoJustificanteCobro,
      intento: 1,
      version: 1,
      requestKeyHash,
      requestFingerprint,
      sha256: archivo.sha,
      nombreArchivo: archivo.nombreArchivo,
      tipoMime: archivo.tipoMime,
      tamanoBytes: entrada.bytes.byteLength,
      importeDeclarado: entrada.importeDeclarado,
      fechaPagoDeclarada: entrada.fechaPagoDeclarada,
      metodoPagoDeclarado: entrada.metodoPagoDeclarado,
      storagePath: rutaObjeto(propietarioId, entrada.contratoId, entrada.cobroPeriodoId, 1, requestKeyHash, archivo.nombreArchivo),
      subidoPorUid: actor.uid,
      subidoPorUsuarioId: actor.usuarioId,
      subidoEn: ahoraIso(),
      actualizadoEn: ahoraIso(),
      revisadoEn: null,
      revisadoPorUid: null,
      revisadoPorUsuarioId: null,
      motivoRevision: null,
    };

    let documento: DocumentoInterno | null = null;
    let duplicada = false;
    for (let intentoCas = 0; intentoCas < MAX_CAS_JUSTIFICANTE_COBRO; intentoCas += 1) {
      const actualRaw = await leer(`${COLECCION_JUSTIFICANTES_COBRO}/${id}`);
      if (!actualRaw) {
        const event = crearEvento(eventoId(id, 1, 'SUBIDA_INICIADA', requestKeyHash), {
          justificanteId: id,
          contratoId: entrada.contratoId,
          cobroPeriodoId: entrada.cobroPeriodoId,
          accion: 'SUBIDA_INICIADA',
          estadoNuevo: 'SUBIENDO',
          actor: 'INQUILINO',
          actorResuelto: actor,
          claveOperacionHash: requestKeyHash,
          creadoEn: ahoraIso(),
          archivoDisponible: false,
          archivo: await metadataArchivo({ id, datos: submission }),
        });
        const initial = { ...submission, eventoAuditoriaPendiente: { ...event, version: 1 } };
        const created = await crear(COLECCION_JUSTIFICANTES_COBRO, id, initial);
        if (created === 'CREADO') {
          documento = await obtenerVistaActual(id);
          break;
        }
        continue;
      }
      const actual = await repararSiHaceFalta(actualRaw);
      const d = actual.datos;
      const estado = d.estado;
      if (!estadoValido(estado)) throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
      if (d.requestKeyHash === requestKeyHash) {
        if (d.requestFingerprint !== requestFingerprint) {
          throw new ErrorJustificanteCobro('CLAVE_IDEMPOTENCIA_REUTILIZADA', 409);
        }
        duplicada = estado !== 'SUBIENDO' && estado !== 'ERROR_SUBIDA';
        documento = actual;
        if (estado === 'ERROR_SUBIDA') {
          const event = crearEvento(eventoId(id, (Number(d.version) || 0) + 1, 'REINTENTO_SUBIDA', requestKeyHash), {
            justificanteId: id,
            contratoId: entrada.contratoId,
            cobroPeriodoId: entrada.cobroPeriodoId,
            accion: 'REINTENTO_SUBIDA',
            estadoAnterior: 'ERROR_SUBIDA',
            estadoNuevo: 'SUBIENDO',
            actor: 'INQUILINO',
            actorResuelto: actor,
            claveOperacionHash: requestKeyHash,
            creadoEn: ahoraIso(),
            archivoDisponible: false,
            archivo: await metadataArchivo(actual),
          });
          documento = await prepararTransicion(actual, { estado: 'SUBIENDO' }, event);
          if (!documento) continue;
          duplicada = false;
        }
        break;
      }
      if (estado === 'SUBIENDO' || estado === 'PENDIENTE_REVISION' || estado === 'ACEPTADO') {
        throw new ErrorJustificanteCobro('JUSTIFICANTE_EN_CURSO', 409);
      }
      if (estado !== 'RECHAZADO' && estado !== 'ERROR_SUBIDA') {
        throw new ErrorJustificanteCobro('TRANSICION_INVALIDA', 409);
      }
      const intentoNuevo = (Number(d.intento) || 0) + 1;
      const versionNueva = (Number(d.version) || 0) + 1;
      const nuevoEstado = {
        ...submission,
        intento: intentoNuevo,
        version: versionNueva,
        storagePath: rutaObjeto(propietarioId, entrada.contratoId, entrada.cobroPeriodoId, intentoNuevo, requestKeyHash, archivo.nombreArchivo),
      };
      const event = crearEvento(eventoId(id, versionNueva, 'SUBIDA_INICIADA', requestKeyHash), {
        justificanteId: id,
        contratoId: entrada.contratoId,
        cobroPeriodoId: entrada.cobroPeriodoId,
        accion: 'SUBIDA_INICIADA',
        estadoAnterior: estado,
        estadoNuevo: 'SUBIENDO',
        actor: 'INQUILINO',
        actorResuelto: actor,
        claveOperacionHash: requestKeyHash,
        creadoEn: ahoraIso(),
        archivoDisponible: false,
        archivo: await metadataArchivo({ id, datos: nuevoEstado }),
      });
      documento = await prepararTransicion(actual, {
        ...nuevoEstado,
        revisadoEn: null,
        revisadoPorUid: null,
        revisadoPorUsuarioId: null,
        motivoRevision: null,
      }, event);
      if (!documento) continue;
      duplicada = false;
      break;
    }
    if (!documento) {
      const actual = await leer(`${COLECCION_JUSTIFICANTES_COBRO}/${id}`);
      if (!actual) throw new ErrorJustificanteCobro('CONFLICTO_CONCURRENCIA', 409);
      documento = await repararSiHaceFalta(actual);
      if (documento.datos.requestKeyHash !== requestKeyHash
        || documento.datos.requestFingerprint !== requestFingerprint) {
        throw new ErrorJustificanteCobro('JUSTIFICANTE_EN_CURSO', 409);
      }
      if (documento.datos.estado !== 'SUBIENDO') {
        return { justificante: vistaJustificante(documento), duplicada: true };
      }
    }

    if (documento.datos.estado !== 'SUBIENDO') {
      return { justificante: vistaJustificante(documento), duplicada: true };
    }
    const storagePath = texto(documento.datos.storagePath, 900);
    if (!storagePath) throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
    try {
      const creada = await deps.almacen.guardar(storagePath, entrada.bytes, archivo.tipoMime);
      if (creada === 'YA_EXISTE') {
        const existente = await deps.almacen.leer(storagePath);
        if (!existente || sha256(existente) !== archivo.sha || existente.byteLength !== entrada.bytes.byteLength) {
          throw new ErrorJustificanteCobro('CLAVE_IDEMPOTENCIA_REUTILIZADA', 409);
        }
      }
    } catch (error) {
      if (error instanceof ErrorJustificanteCobro && error.status === 409) throw error;
      const actual = await leer(`${COLECCION_JUSTIFICANTES_COBRO}/${id}`);
      if (actual?.datos.estado === 'SUBIENDO' && actual.datos.requestKeyHash === requestKeyHash) {
        const errorEvent = crearEvento(eventoId(id, (Number(actual.datos.version) || 0) + 1, 'ERROR_SUBIDA', requestKeyHash), {
          justificanteId: id,
          contratoId: entrada.contratoId,
          cobroPeriodoId: entrada.cobroPeriodoId,
          accion: 'ERROR_SUBIDA',
          estadoAnterior: 'SUBIENDO',
          estadoNuevo: 'ERROR_SUBIDA',
          actor: 'INQUILINO',
          actorResuelto: actor,
          claveOperacionHash: requestKeyHash,
          creadoEn: ahoraIso(),
          motivo: 'STORAGE_NO_DISPONIBLE',
          archivoDisponible: false,
          archivo: await metadataArchivo(actual),
        });
        await prepararTransicion(actual, { estado: 'ERROR_SUBIDA', errorSubida: 'STORAGE_NO_DISPONIBLE' }, errorEvent);
      }
      throw new ErrorJustificanteCobro('ALMACEN_NO_DISPONIBLE', 503);
    }

    for (let intentoCas = 0; intentoCas < MAX_CAS_JUSTIFICANTE_COBRO; intentoCas += 1) {
      const actual = await leer(`${COLECCION_JUSTIFICANTES_COBRO}/${id}`);
      if (!actual) throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
      const limpio = await repararSiHaceFalta(actual);
      if (limpio.datos.requestKeyHash !== requestKeyHash || limpio.datos.requestFingerprint !== requestFingerprint) {
        throw new ErrorJustificanteCobro('JUSTIFICANTE_EN_CURSO', 409);
      }
      if (limpio.datos.estado === 'PENDIENTE_REVISION') {
        return { justificante: vistaJustificante(limpio), duplicada: true };
      }
      if (limpio.datos.estado !== 'SUBIENDO') {
        return { justificante: vistaJustificante(limpio), duplicada: true };
      }
      const event = crearEvento(eventoId(id, (Number(limpio.datos.version) || 0) + 1, 'PRESENTADO', requestKeyHash), {
        justificanteId: id,
        contratoId: entrada.contratoId,
        cobroPeriodoId: entrada.cobroPeriodoId,
        accion: 'PRESENTADO',
        estadoAnterior: 'SUBIENDO',
        estadoNuevo: 'PENDIENTE_REVISION',
        actor: 'INQUILINO',
        actorResuelto: actor,
        claveOperacionHash: requestKeyHash,
        creadoEn: ahoraIso(),
        archivoDisponible: true,
        archivo: await metadataArchivo(limpio),
      });
      const final = await prepararTransicion(limpio, { estado: 'PENDIENTE_REVISION', errorSubida: null }, event);
      if (final) return { justificante: vistaJustificante(final), duplicada: false };
    }
    const recuperado = await obtenerVistaActual(id);
    if (recuperado.datos.estado === 'PENDIENTE_REVISION' && recuperado.datos.requestKeyHash === requestKeyHash) {
      return { justificante: vistaJustificante(recuperado), duplicada: true };
    }
    throw new ErrorJustificanteCobro('CONFLICTO_CONCURRENCIA', 409);
  }

  async function listar(entrada: { uid: string; contratoIds: string[]; offset?: number }): Promise<ResultadoListaJustificantesCobro> {
    const actor = await resolverActor(entrada.uid);
    const contratoIds = [...new Set(entrada.contratoIds)];
    if (contratoIds.length < 1 || contratoIds.length > 50 || contratoIds.some((id) => !validarId(id))) {
      throw new ErrorJustificanteCobro('PETICION_INVALIDA', 400);
    }
    const offset = Number.isInteger(entrada.offset) ? Math.max(0, Math.min(5000, entrada.offset || 0)) : 0;
    const items: VistaJustificanteCobro[] = [];
    let hayMas = false;
    for (const contratoId of contratoIds) {
      const contrato = await leerContrato(contratoId);
      await autorizarContrato(actor, contratoId, contrato, 'LECTURA');
      const propietarioId = String(contrato.propietarioId || '');
      const registros = await consultar(COLECCION_JUSTIFICANTES_COBRO, [['contratoId', contratoId]], offset);
      if (registros.length >= MAX_PAGINA_JUSTIFICANTES_COBRO) hayMas = true;
      for (const bruto of registros) {
        const limpio = await repararSiHaceFalta(bruto);
        if (limpio.datos.contratoId !== contratoId || limpio.datos.propietarioId !== propietarioId
          || limpio.datos.inmuebleId !== contrato.inmuebleId || !estadoValido(limpio.datos.estado)) continue;
        try { validarCobro(contrato, contratoId, String(limpio.datos.cobroPeriodoId || '')); }
        catch { continue; }
        items.push(vistaJustificante(limpio));
      }
    }
    items.sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn) || a.id.localeCompare(b.id));
    return { items, hayMas };
  }

  async function decidir(entrada: EntradaDecisionJustificante): Promise<{ justificante: VistaJustificanteCobro; duplicada: boolean }> {
    if (!/^jc_[a-f0-9]{48}$/.test(entrada.justificanteId) || !CLAVE_RE.test(entrada.claveIdempotencia)) {
      throw new ErrorJustificanteCobro('PETICION_INVALIDA', 400);
    }
    const actor = await resolverActor(entrada.uid);
    const actualInicial = await obtenerVistaActual(entrada.justificanteId);
    const contratoId = texto(actualInicial.datos.contratoId, 180);
    const cobroPeriodoId = texto(actualInicial.datos.cobroPeriodoId, 180);
    if (!contratoId || !cobroPeriodoId) throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
    const contrato = await leerContrato(contratoId);
    if (actualInicial.datos.propietarioId !== contrato.propietarioId
      || actualInicial.datos.inmuebleId !== contrato.inmuebleId) {
      throw new ErrorJustificanteCobro('JUSTIFICANTE_NO_ENCONTRADO', 404);
    }
    const actorTipo = await autorizarContrato(actor, contratoId, contrato, 'ESCRITURA');
    if (actorTipo === 'INQUILINO') throw new ErrorJustificanteCobro('CONTRATO_NO_AUTORIZADO', 403);
    validarCobro(contrato, contratoId, cobroPeriodoId);

    const motivo = typeof entrada.motivo === 'string' ? entrada.motivo.trim() : '';
    if (motivo.length > 1000) throw new ErrorJustificanteCobro('PETICION_INVALIDA', 400);
    let estadoDestino: 'ACEPTADO' | 'RECHAZADO';
    if (entrada.accion === 'ACEPTAR') {
      estadoDestino = 'ACEPTADO';
    } else if (entrada.accion === 'RECHAZAR') {
      if (motivo.length < 10) throw new ErrorJustificanteCobro('PETICION_INVALIDA', 400);
      estadoDestino = 'RECHAZADO';
    } else if (entrada.accion === 'RECTIFICAR') {
      if (!estadoEsFinal(entrada.estadoCorregido) || motivo.length < 10) {
        throw new ErrorJustificanteCobro('PETICION_INVALIDA', 400);
      }
      estadoDestino = entrada.estadoCorregido;
    } else {
      throw new ErrorJustificanteCobro('PETICION_INVALIDA', 400);
    }

    const claveHash = claveUsuarioHash(entrada.uid, entrada.claveIdempotencia);
    // La clave queda reservada a una sola operación sobre este justificante:
    // cambiar acción, motivo o estado destino con la misma clave es conflicto.
    const eventIdempotente = eventoId(entrada.justificanteId, 0, 'OPERACION_DECISION', claveHash);
    const motivoIdempotente = motivo;
    const accionAuditoriaEsperada = entrada.accion === 'RECTIFICAR' ? 'RECTIFICADO' : estadoDestino;
    const existente = await eventoYaAplicado(eventIdempotente, accionAuditoriaEsperada,
      claveHash, motivoIdempotente, estadoDestino);
    if (existente) {
      const actual = await obtenerVistaActual(entrada.justificanteId);
      return { justificante: vistaJustificante(actual), duplicada: true };
    }

    for (let intentoCas = 0; intentoCas < MAX_CAS_JUSTIFICANTE_COBRO; intentoCas += 1) {
      const aplicadaPorConcurrencia = await eventoYaAplicado(eventIdempotente, accionAuditoriaEsperada,
        claveHash, motivoIdempotente, estadoDestino);
      if (aplicadaPorConcurrencia) {
        const actual = await obtenerVistaActual(entrada.justificanteId);
        return { justificante: vistaJustificante(actual), duplicada: true };
      }
      const actualRaw = await leer(`${COLECCION_JUSTIFICANTES_COBRO}/${entrada.justificanteId}`);
      if (!actualRaw) throw new ErrorJustificanteCobro('JUSTIFICANTE_NO_ENCONTRADO', 404);
      const actual = await repararSiHaceFalta(actualRaw);
      const aplicadaTrasReparar = await eventoYaAplicado(eventIdempotente, accionAuditoriaEsperada,
        claveHash, motivoIdempotente, estadoDestino);
      if (aplicadaTrasReparar) {
        const vigente = await obtenerVistaActual(entrada.justificanteId);
        return { justificante: vistaJustificante(vigente), duplicada: true };
      }
      const estado = actual.datos.estado;
      if (entrada.accion === 'RECTIFICAR') {
        if (!estadoEsFinal(estado) || estado === estadoDestino) {
          throw new ErrorJustificanteCobro('TRANSICION_INVALIDA', 409);
        }
      } else if (estado !== 'PENDIENTE_REVISION') {
        throw new ErrorJustificanteCobro('TRANSICION_INVALIDA', 409);
      }
      const versionNueva = (Number(actual.datos.version) || 0) + 1;
      const accionAuditoria: AccionAuditoriaJustificanteCobro = entrada.accion === 'RECTIFICAR'
        ? 'RECTIFICADO' : estadoDestino;
      const auditId = eventIdempotente;
      const event = crearEvento(auditId, {
        justificanteId: entrada.justificanteId,
        contratoId,
        cobroPeriodoId,
        accion: accionAuditoria,
        estadoAnterior: estado as EstadoJustificanteCobro,
        estadoNuevo: estadoDestino,
        actor: actorTipo,
        actorResuelto: actor,
        claveOperacionHash: claveHash,
        creadoEn: ahoraIso(),
        ...(motivo ? { motivo } : {}),
        archivoDisponible: true,
        archivo: await metadataArchivo(actual),
      });
      const siguiente = await prepararTransicion(actual, {
        estado: estadoDestino,
        revisadoEn: event.creadoEn,
        revisadoPorUid: actor.uid,
        revisadoPorUsuarioId: actor.usuarioId,
        motivoRevision: motivo || null,
      }, event);
      if (siguiente) return { justificante: vistaJustificante(siguiente), duplicada: false };
    }
    const eventoAplicado = await eventoYaAplicado(eventIdempotente, accionAuditoriaEsperada,
      claveHash, motivoIdempotente, estadoDestino);
    if (eventoAplicado) {
      const recuperado = await obtenerVistaActual(entrada.justificanteId);
      return { justificante: vistaJustificante(recuperado), duplicada: true };
    }
    throw new ErrorJustificanteCobro('CONFLICTO_CONCURRENCIA', 409);
  }

  async function auditoria(entrada: { uid: string; justificanteId: string; offset?: number }): Promise<{ eventos: VistaEventoJustificanteCobro[]; hayMas: boolean }> {
    if (!/^jc_[a-f0-9]{48}$/.test(entrada.justificanteId)) throw new ErrorJustificanteCobro('PETICION_INVALIDA', 400);
    const actor = await resolverActor(entrada.uid);
    const registro = await obtenerVistaActual(entrada.justificanteId);
    const contratoId = texto(registro.datos.contratoId, 180);
    if (!contratoId) throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
    const contrato = await leerContrato(contratoId);
    if (registro.datos.propietarioId !== contrato.propietarioId || registro.datos.inmuebleId !== contrato.inmuebleId) {
      throw new ErrorJustificanteCobro('JUSTIFICANTE_NO_ENCONTRADO', 404);
    }
    validarCobro(contrato, contratoId, String(registro.datos.cobroPeriodoId || ''));
    await autorizarContrato(actor, contratoId, contrato, 'LECTURA');
    const offset = Number.isInteger(entrada.offset) ? Math.max(0, Math.min(5000, entrada.offset || 0)) : 0;
    const documentos = await consultar(COLECCION_AUDITORIA_JUSTIFICANTES_COBRO, [['justificanteId', entrada.justificanteId]], offset);
    const eventos = documentos
      .filter((doc) => doc.datos.justificanteId === entrada.justificanteId)
      .sort((a, b) => (Number(a.datos.version) || 0) - (Number(b.datos.version) || 0)
        || String(a.datos.creadoEn || '').localeCompare(String(b.datos.creadoEn || ''))
        || a.id.localeCompare(b.id))
      .map(vistaEvento);
    return { eventos, hayMas: documentos.length >= MAX_PAGINA_JUSTIFICANTES_COBRO };
  }

  async function descargar(entrada: { uid: string; justificanteId: string; eventoId?: string }): Promise<ArchivoJustificanteCobro> {
    if (!/^jc_[a-f0-9]{48}$/.test(entrada.justificanteId)
      || (entrada.eventoId && !/^ja_[a-f0-9]{48}$/.test(entrada.eventoId))) {
      throw new ErrorJustificanteCobro('PETICION_INVALIDA', 400);
    }
    const actor = await resolverActor(entrada.uid);
    let ruta: string;
    let hash: string;
    let tipoMime: string;
    let nombre: string;
    let tamano: number;
    let contratoId: string;
    let cobroPeriodoId: string;
    let propietarioId: string;
    let inmuebleId: string;
    let registro: DocumentoInterno;
    if (entrada.eventoId) {
      const evento = await leer(`${COLECCION_AUDITORIA_JUSTIFICANTES_COBRO}/${entrada.eventoId}`);
      if (!evento || evento.datos.justificanteId !== entrada.justificanteId || evento.datos.archivoDisponible !== true) {
        throw new ErrorJustificanteCobro('JUSTIFICANTE_NO_ENCONTRADO', 404);
      }
      registro = await obtenerVistaActual(entrada.justificanteId);
      if (evento.datos.contratoId !== registro.datos.contratoId
        || evento.datos.cobroPeriodoId !== registro.datos.cobroPeriodoId
        || evento.datos.propietarioId !== registro.datos.propietarioId
        || evento.datos.inmuebleId !== registro.datos.inmuebleId) {
        throw new ErrorJustificanteCobro('JUSTIFICANTE_NO_ENCONTRADO', 404);
      }
      ruta = String(evento.datos.storagePath || '');
      hash = String(evento.datos.sha256 || '');
      tipoMime = String(evento.datos.tipoMime || '');
      nombre = String(evento.datos.nombreArchivo || '');
      tamano = Number(evento.datos.tamanoBytes) || 0;
      contratoId = String(evento.datos.contratoId || '');
      cobroPeriodoId = String(evento.datos.cobroPeriodoId || '');
      propietarioId = String(evento.datos.propietarioId || '');
      inmuebleId = String(evento.datos.inmuebleId || '');
    } else {
      registro = await obtenerVistaActual(entrada.justificanteId);
      if (!['PENDIENTE_REVISION', 'ACEPTADO', 'RECHAZADO'].includes(String(registro.datos.estado))) {
        throw new ErrorJustificanteCobro('JUSTIFICANTE_NO_ENCONTRADO', 404);
      }
      ruta = String(registro.datos.storagePath || '');
      hash = String(registro.datos.sha256 || '');
      tipoMime = String(registro.datos.tipoMime || '');
      nombre = String(registro.datos.nombreArchivo || '');
      tamano = Number(registro.datos.tamanoBytes) || 0;
      contratoId = String(registro.datos.contratoId || '');
      cobroPeriodoId = String(registro.datos.cobroPeriodoId || '');
      propietarioId = String(registro.datos.propietarioId || '');
      inmuebleId = String(registro.datos.inmuebleId || '');
    }
    if (!validarId(contratoId) || !validarId(cobroPeriodoId) || !validarId(propietarioId) || !validarId(inmuebleId)
      || !HASH_RE.test(hash) || !MIME_EXT[tipoMime] || tamano < 1 || tamano > MAX_BYTES_JUSTIFICANTE_COBRO
      || !rutaObjetoValida(ruta, propietarioId, contratoId, cobroPeriodoId)) {
      throw new ErrorJustificanteCobro('FUENTE_NO_DISPONIBLE', 503);
    }
    const contrato = await leerContrato(contratoId);
    if (registro.datos.propietarioId !== propietarioId || registro.datos.inmuebleId !== inmuebleId
      || contrato.propietarioId !== propietarioId || contrato.inmuebleId !== inmuebleId) {
      throw new ErrorJustificanteCobro('JUSTIFICANTE_NO_ENCONTRADO', 404);
    }
    validarCobro(contrato, contratoId, cobroPeriodoId);
    await autorizarContrato(actor, contratoId, contrato, 'LECTURA');
    let bytes: Uint8Array | null;
    try { bytes = await deps.almacen.leer(ruta); }
    catch { throw new ErrorJustificanteCobro('ALMACEN_NO_DISPONIBLE', 503); }
    if (!bytes || bytes.byteLength !== tamano || sha256(bytes) !== hash || detectarMime(bytes) !== tipoMime) {
      throw new ErrorJustificanteCobro('ALMACEN_NO_DISPONIBLE', 503);
    }
    return { bytes, tipoMime, nombreArchivo: nombre };
  }

  return { presentar, listar, decidir, auditoria, descargar };
}
