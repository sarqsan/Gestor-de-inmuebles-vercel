import { createHash } from 'node:crypto';
import type { ContratoFormalizacion } from '../../src/types';
import {
  calcularPreviewActualizacionRenta,
  FUENTES_IRAV_OFICIALES,
  programarAvisoActualizacionRenta,
  type DatoIRAVOficial,
  type EntradaCalculoActualizacionRenta,
  type PreviewActualizacionRenta,
} from '../../src/utils/actualizacionRentaEngine.js';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/;
const HASH_RE = /^[a-f0-9]{64}$/;

export interface EscrituraP4Atomica {
  coleccion: string;
  id: string;
  datos: Record<string, unknown>;
  precondicion: { tipo: 'NO_EXISTE' };
}

export interface PuertoActualizacionRenta {
  leerDocumento(ruta: string): Promise<{ id: string; datos: Record<string, unknown>; updateTime?: string } | null>;
  /** Un solo commit de Firestore; si una precondición falla no se escribe nada. */
  escribirAtomico?(escrituras: readonly EscrituraP4Atomica[]): Promise<'COMMIT' | 'CONFLICTO'>;
}

export interface DependenciasActualizacionRenta {
  puerto: PuertoActualizacionRenta;
  ahora?: () => Date;
  /** Snapshot de serie inyectable en pruebas; nunca procede del cuerpo HTTP. */
  serie?: readonly DatoIRAVOficial[];
  /** Punto de inyección del motor para pruebas de persistencia; producción usa el motor normativo. */
  calcularPreview?: typeof calcularPreviewActualizacionRenta;
}

export interface EntradaConfirmarActualizacionRenta {
  uid: string;
  contratoId: string;
  huellaPreview: string;
  idempotencyKey: string;
  fechaProgramadaAviso: string;
  confirmacionExplicita: boolean;
}

export interface ResultadoPrevisualizacionActualizacionRenta {
  preview: PreviewActualizacionRenta;
  huellaPreview: string;
}

export interface ResultadoConfirmacionActualizacionRenta {
  estado: 'CREADA' | 'REPETIDA';
  contratoId: string;
  anexoId: string;
  avisoId: string;
  version: 1;
  fechaAniversario: string;
  fechaProgramadaAviso: string;
  estadoAviso: 'PENDIENTE_ENVIO';
  comunicado: 'NO_COMUNICADO';
  fechaEfectividad: null;
}

export interface ServicioActualizacionRenta {
  previsualizar(entrada: { uid: string; contratoId: string }): Promise<ResultadoPrevisualizacionActualizacionRenta>;
  confirmar(entrada: EntradaConfirmarActualizacionRenta): Promise<ResultadoConfirmacionActualizacionRenta>;
}

export type CodigoErrorActualizacionRenta =
  | 'PETICION_INVALIDA'
  | 'PERFIL_NO_VALIDO'
  | 'CONTRATO_NO_AUTORIZADO'
  | 'FUENTE_NO_DISPONIBLE'
  | 'CONFIRMACION_EXPLICITA_REQUERIDA'
  | 'FECHA_PROGRAMADA_INVALIDA'
  | 'IDEMPOTENCY_KEY_INVALIDA'
  | 'IDEMPOTENCY_KEY_REUTILIZADA'
  | 'PREVIEW_REQUIERE_REVISION'
  | 'PREVIEW_DESACTUALIZADO'
  | 'ACTUALIZACION_YA_CONFIRMADA';

export class ErrorActualizacionRenta extends Error {
  constructor(readonly codigo: CodigoErrorActualizacionRenta, readonly status: number) {
    super(codigo);
  }
}

interface ActorActualizacionRenta {
  uid: string;
  usuarioId: string;
  tipoPerfil: string;
  espejo: Record<string, unknown>;
  ficha: Record<string, unknown>;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function mapa(valor: unknown): Record<string, unknown> {
  return esObjeto(valor) ? valor : {};
}

function idsAmbitoExplicitos(valor: unknown): string[] | null {
  if (!Array.isArray(valor) || !valor.every((item) => idValido(item))) return null;
  return valor as string[];
}

function idValido(valor: unknown): valor is string {
  return typeof valor === 'string' && ID_RE.test(valor) && valor !== '.' && valor !== '..';
}

function texto(valor: unknown, max = 180): string | null {
  if (typeof valor !== 'string') return null;
  const resultado = valor.trim();
  return resultado.length > 0 && resultado.length <= max ? resultado : null;
}

function esFechaISO(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [y, m, d] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return fecha.getUTCFullYear() === y && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

function fechaMadrid(fecha: Date): string {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(fecha);
  const valores = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}

function normalizarParaHuella(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(normalizarParaHuella);
  if (esObjeto(valor)) {
    return Object.fromEntries(Object.keys(valor).sort().flatMap((clave) =>
      valor[clave] === undefined ? [] : [[clave, normalizarParaHuella(valor[clave])]],
    ));
  }
  return valor;
}

function sha256(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('hex');
}

function huellaPreview(preview: PreviewActualizacionRenta, actor: ActorActualizacionRenta): string {
  return sha256(JSON.stringify(normalizarParaHuella({
    actor: { uid: actor.uid, usuarioId: actor.usuarioId },
    preview,
  })));
}

function resultadoDesdeOperacion(datos: Record<string, unknown>): ResultadoConfirmacionActualizacionRenta | null {
  const resultado = datos.resultado;
  if (!esObjeto(resultado)
    || typeof resultado.contratoId !== 'string'
    || typeof resultado.anexoId !== 'string'
    || typeof resultado.avisoId !== 'string'
    || resultado.version !== 1
    || typeof resultado.fechaAniversario !== 'string'
    || typeof resultado.fechaProgramadaAviso !== 'string'
    || resultado.estadoAviso !== 'PENDIENTE_ENVIO'
    || resultado.comunicado !== 'NO_COMUNICADO'
    || resultado.fechaEfectividad !== null) return null;
  return { ...(resultado as unknown as ResultadoConfirmacionActualizacionRenta), estado: 'REPETIDA' };
}

export function crearServicioActualizacionRenta(
  deps: DependenciasActualizacionRenta,
): ServicioActualizacionRenta {
  const ahora = deps.ahora ?? (() => new Date());
  const serie = deps.serie ?? FUENTES_IRAV_OFICIALES;
  const calcular = deps.calcularPreview ?? calcularPreviewActualizacionRenta;

  async function leer(ruta: string): Promise<{ id: string; datos: Record<string, unknown>; updateTime?: string } | null> {
    try { return await deps.puerto.leerDocumento(ruta); }
    catch { throw new ErrorActualizacionRenta('FUENTE_NO_DISPONIBLE', 503); }
  }

  async function resolverActor(uid: string): Promise<ActorActualizacionRenta> {
    if (typeof uid !== 'string' || !uid.trim() || uid.length > 128 || /[\u0000-\u001f/]/.test(uid)) {
      throw new ErrorActualizacionRenta('PERFIL_NO_VALIDO', 403);
    }
    const espejoDoc = await leer(`usuarios_auth/${encodeURIComponent(uid)}`);
    const espejo = espejoDoc?.datos;
    const usuarioId = texto(espejo?.usuarioId);
    if (!espejo || espejo.estado !== 'ACTIVO' || !idValido(usuarioId)
      || (typeof espejo.authUid === 'string' && espejo.authUid !== uid)) {
      throw new ErrorActualizacionRenta('PERFIL_NO_VALIDO', 403);
    }
    const fichaDoc = await leer(`usuarios/${usuarioId}`);
    const ficha = fichaDoc?.datos;
    if (!ficha || ficha.authUid !== uid || ficha.estado !== 'ACTIVO'
      || ficha.tipoPerfil !== espejo.tipoPerfil) {
      throw new ErrorActualizacionRenta('PERFIL_NO_VALIDO', 403);
    }
    return { uid, usuarioId, tipoPerfil: String(espejo.tipoPerfil || ''), espejo, ficha };
  }

  async function esGestorConEscritura(
    actor: ActorActualizacionRenta,
    contrato: Record<string, unknown>,
  ): Promise<boolean> {
    const propietarioId = texto(contrato.propietarioId);
    const inmuebleId = texto(contrato.inmuebleId);
    if (!propietarioId || !inmuebleId) return false;
    const relaciones = mapa(actor.espejo.gestionesPorPropietario);
    const relacionId = relaciones[propietarioId];
    if (!idValido(relacionId)) return false;
    const relacionDoc = await leer(`gestiones_cartera/${relacionId}`);
    if (!relacionDoc) return false;
    const gestion = relacionDoc.datos;
    const inmuebles = idsAmbitoExplicitos(gestion.inmuebleIds);
    // En el modelo de carteras, [] explícito significa cartera completa; la
    // ausencia o corrupción del campo nunca amplía permisos.
    const dentroDeAmbito = inmuebles !== null && (inmuebles.length === 0 || inmuebles.includes(inmuebleId));
    return gestion.propietarioId === propietarioId
      && gestion.gestorUsuarioId === actor.usuarioId
      && gestion.estado === 'ACTIVA'
      && gestion.resolucionInvitacion === 'ACEPTADA'
      && gestion.permiso === 'LECTURA_ESCRITURA'
      && gestion.responsableActual === 'GESTOR'
      && dentroDeAmbito;
  }

  async function autorizar(actor: ActorActualizacionRenta, contrato: Record<string, unknown>): Promise<void> {
    const propietarioId = texto(contrato.propietarioId);
    if (!propietarioId || actor.tipoPerfil === 'INQUILINO') {
      throw new ErrorActualizacionRenta('CONTRATO_NO_AUTORIZADO', 404);
    }
    if (actor.tipoPerfil === 'PROPIETARIO' && actor.ficha.propietarioId === propietarioId) return;
    if (await esGestorConEscritura(actor, contrato)) return;
    throw new ErrorActualizacionRenta('CONTRATO_NO_AUTORIZADO', 404);
  }

  async function cargarContratoAutorizado(uid: string, contratoId: string): Promise<{
    actor: ActorActualizacionRenta;
    contrato: ContratoFormalizacion;
  }> {
    if (!idValido(contratoId)) throw new ErrorActualizacionRenta('PETICION_INVALIDA', 400);
    const actor = await resolverActor(uid);
    const documento = await leer(`contratos_formalizacion/${contratoId}`);
    if (!documento || (typeof documento.datos.id === 'string' && documento.datos.id !== contratoId)) {
      throw new ErrorActualizacionRenta('CONTRATO_NO_AUTORIZADO', 404);
    }
    await autorizar(actor, documento.datos);
    return { actor, contrato: { ...documento.datos, id: contratoId } as unknown as ContratoFormalizacion };
  }

  function crearPreview(contrato: ContratoFormalizacion): PreviewActualizacionRenta {
    const fechaHoy = fechaMadrid(ahora());
    const entrada: EntradaCalculoActualizacionRenta = {};
    return calcular(contrato, entrada, { hoy: fechaHoy, serie });
  }

  async function previsualizar(entrada: { uid: string; contratoId: string }): Promise<ResultadoPrevisualizacionActualizacionRenta> {
    const { actor, contrato } = await cargarContratoAutorizado(entrada.uid, entrada.contratoId);
    const preview = crearPreview(contrato);
    return { preview, huellaPreview: huellaPreview(preview, actor) };
  }

  async function confirmar(entrada: EntradaConfirmarActualizacionRenta): Promise<ResultadoConfirmacionActualizacionRenta> {
    if (!entrada.confirmacionExplicita) {
      throw new ErrorActualizacionRenta('CONFIRMACION_EXPLICITA_REQUERIDA', 400);
    }
    if (!HASH_RE.test(entrada.huellaPreview)) throw new ErrorActualizacionRenta('PETICION_INVALIDA', 400);
    if (typeof entrada.idempotencyKey !== 'string' || !/^[\x21-\x7e]{16,200}$/.test(entrada.idempotencyKey)) {
      throw new ErrorActualizacionRenta('IDEMPOTENCY_KEY_INVALIDA', 400);
    }
    if (!esFechaISO(entrada.fechaProgramadaAviso)) {
      throw new ErrorActualizacionRenta('FECHA_PROGRAMADA_INVALIDA', 400);
    }

    // Resolver identidad y autorización tanto en el primer intento como en un reintento.
    const { actor, contrato } = await cargarContratoAutorizado(entrada.uid, entrada.contratoId);
    const fechaAhora = ahora();
    const hoy = fechaMadrid(fechaAhora);

    const idempotencyKeyHash = sha256(`${actor.uid}\u0000${entrada.idempotencyKey}`);
    const fingerprintSolicitud = sha256(JSON.stringify(normalizarParaHuella({
      uid: actor.uid,
      usuarioId: actor.usuarioId,
      contratoId: entrada.contratoId,
      huellaPreview: entrada.huellaPreview,
      fechaProgramadaAviso: entrada.fechaProgramadaAviso,
      confirmacionExplicita: entrada.confirmacionExplicita,
    })));
    const rutaOperacion = `actualizacion_renta_operaciones/${idempotencyKeyHash}`;
    const operacionExistente = await leer(rutaOperacion);
    if (operacionExistente) {
      if (operacionExistente.datos.fingerprintSolicitud !== fingerprintSolicitud) {
        throw new ErrorActualizacionRenta('IDEMPOTENCY_KEY_REUTILIZADA', 409);
      }
      const resultado = resultadoDesdeOperacion(operacionExistente.datos);
      if (!resultado) throw new ErrorActualizacionRenta('FUENTE_NO_DISPONIBLE', 503);
      return resultado;
    }
    if (entrada.fechaProgramadaAviso < hoy) {
      throw new ErrorActualizacionRenta('FECHA_PROGRAMADA_INVALIDA', 400);
    }

    const previewActual = crearPreview(contrato);
    if (previewActual.estado !== 'CALCULABLE') {
      throw new ErrorActualizacionRenta('PREVIEW_REQUIERE_REVISION', 409);
    }
    const huellaActual = huellaPreview(previewActual, actor);
    if (huellaActual !== entrada.huellaPreview) {
      throw new ErrorActualizacionRenta('PREVIEW_DESACTUALIZADO', 409);
    }
    if (!deps.puerto.escribirAtomico) {
      throw new ErrorActualizacionRenta('FUENTE_NO_DISPONIBLE', 503);
    }

    const borradorAviso = programarAvisoActualizacionRenta(previewActual, {
      actorUid: actor.uid,
      actorUsuarioId: actor.usuarioId,
      idempotencyKeyHash,
      confirmadoEn: fechaAhora.toISOString(),
      fechaProgramadaAviso: entrada.fechaProgramadaAviso,
    });
    if (!borradorAviso || !previewActual.fechaAniversario || !previewActual.propietarioId
      || previewActual.rentaActual === undefined || previewActual.rentaFutura === undefined
      || previewActual.porcentajeAplicado === undefined || previewActual.importeIncremento === undefined) {
      throw new ErrorActualizacionRenta('PREVIEW_REQUIERE_REVISION', 409);
    }

    const idControl = `${entrada.contratoId}__${previewActual.fechaAniversario}`;
    const anexoId = `anexo-${entrada.contratoId}-${previewActual.fechaAniversario}-v1`;
    const avisoId = borradorAviso.id;
    const auditId = idempotencyKeyHash;
    const fechaRegistro = fechaAhora.toISOString();
    const resultado: ResultadoConfirmacionActualizacionRenta = {
      estado: 'CREADA', contratoId: entrada.contratoId, anexoId, avisoId, version: 1,
      fechaAniversario: previewActual.fechaAniversario,
      fechaProgramadaAviso: entrada.fechaProgramadaAviso,
      estadoAviso: 'PENDIENTE_ENVIO', comunicado: 'NO_COMUNICADO', fechaEfectividad: null,
    };

    const anexo = {
      id: anexoId,
      tipo: 'ANEXO_ACTUALIZACION_RENTA_BORRADOR',
      version: 1,
      contratoId: entrada.contratoId,
      propietarioId: previewActual.propietarioId,
      estado: 'BORRADOR_NO_FIRMADO',
      inmutable: true,
      fechaCelebracion: previewActual.fechaCelebracion,
      fechaInicioContrato: previewActual.fechaInicioContrato,
      fechaAniversario: previewActual.fechaAniversario,
      modalidad: previewActual.modalidad,
      finalidadUso: previewActual.finalidadUso,
      referenciaContrato: previewActual.referenciaContrato,
      evidenciaClausula: previewActual.evidenciaClausula,
      evidenciaUso: previewActual.evidenciaUso,
      rentaAnterior: previewActual.rentaActual,
      porcentaje: previewActual.porcentajeAplicado,
      incremento: previewActual.importeIncremento,
      rentaPropuesta: previewActual.rentaFutura,
      indice: previewActual.indice,
      topes: previewActual.topes,
      baseLegal: previewActual.baseLegal,
      fuentesOficiales: previewActual.fuentesOficiales,
      huellaPreview: huellaActual,
      actorUid: actor.uid,
      actorUsuarioId: actor.usuarioId,
      creadoEn: fechaRegistro,
      comunicado: 'NO_COMUNICADO',
      fechaEfectividad: null,
      avisoId,
    };
    const aviso = {
      id: avisoId,
      tipo: 'AVISO_ACTUALIZACION_RENTA',
      contratoId: entrada.contratoId,
      propietarioId: previewActual.propietarioId,
      anexoId,
      fechaAniversario: previewActual.fechaAniversario,
      fechaProgramadaAviso: entrada.fechaProgramadaAviso,
      estado: 'PENDIENTE_ENVIO',
      comunicado: 'NO_COMUNICADO',
      fechaComunicacion: null,
      fechaEfectividad: null,
      canales: {
        EMAIL: { estado: 'PENDIENTE_VALIDACION', confirmadoSMTP: false },
        BANDEJA_INTERNA: { estado: 'PENDIENTE_VALIDACION', confirmadoPorCanal: false },
      },
      montoPropuesto: previewActual.importeIncremento,
      rentaPropuesta: previewActual.rentaFutura,
      creadoPorUid: actor.uid,
      creadoPorUsuarioId: actor.usuarioId,
      creadoEn: fechaRegistro,
    };
    const auditoria = {
      tipoEvento: 'P4_CONFIRMACION_EXPLICITA',
      contratoId: entrada.contratoId,
      propietarioId: previewActual.propietarioId,
      actorUid: actor.uid,
      actorUsuarioId: actor.usuarioId,
      actorTipoPerfil: actor.tipoPerfil,
      huellaPreview: huellaActual,
      idempotencyKeyHash,
      fechaEvento: fechaRegistro,
      resultado: 'ANEXO_BORRADOR_Y_AVISO_PENDIENTE_CREADOS',
      estadoAviso: 'PENDIENTE_ENVIO',
      comunicado: 'NO_COMUNICADO',
    };
    const control = {
      contratoId: entrada.contratoId,
      propietarioId: previewActual.propietarioId,
      fechaAniversario: previewActual.fechaAniversario,
      version: 1,
      anexoId,
      avisoId,
      estado: 'PENDIENTE_ENVIO',
      creadoPorUid: actor.uid,
      creadoEn: fechaRegistro,
    };
    const operacion = {
      fingerprintSolicitud,
      actorUid: actor.uid,
      actorUsuarioId: actor.usuarioId,
      idempotencyKeyHash,
      fechaEvento: fechaRegistro,
      resultado,
    };

    const escrituras: EscrituraP4Atomica[] = [
      { coleccion: 'anexos_actualizacion_renta', id: anexoId, datos: anexo, precondicion: { tipo: 'NO_EXISTE' } },
      { coleccion: 'avisos_actualizacion_renta', id: avisoId, datos: aviso, precondicion: { tipo: 'NO_EXISTE' } },
      { coleccion: 'auditoria_actualizacion_renta', id: auditId, datos: auditoria, precondicion: { tipo: 'NO_EXISTE' } },
      { coleccion: 'actualizacion_renta_operaciones', id: idempotencyKeyHash, datos: operacion, precondicion: { tipo: 'NO_EXISTE' } },
      { coleccion: 'actualizacion_renta_controles', id: idControl, datos: control, precondicion: { tipo: 'NO_EXISTE' } },
    ];

    let commit: 'COMMIT' | 'CONFLICTO';
    try { commit = await deps.puerto.escribirAtomico(escrituras); }
    catch { throw new ErrorActualizacionRenta('FUENTE_NO_DISPONIBLE', 503); }
    if (commit === 'COMMIT') return resultado;

    // En concurrencia: una misma clave devuelve el resultado ya persistido;
    // otra clave para el mismo contrato/aniversario se rechaza sin duplicar.
    const trasConflicto = await leer(rutaOperacion);
    if (trasConflicto) {
      if (trasConflicto.datos.fingerprintSolicitud !== fingerprintSolicitud) {
        throw new ErrorActualizacionRenta('IDEMPOTENCY_KEY_REUTILIZADA', 409);
      }
      const repetida = resultadoDesdeOperacion(trasConflicto.datos);
      if (!repetida) throw new ErrorActualizacionRenta('FUENTE_NO_DISPONIBLE', 503);
      return repetida;
    }
    const controlExistente = await leer(`actualizacion_renta_controles/${encodeURIComponent(idControl)}`);
    if (controlExistente) throw new ErrorActualizacionRenta('ACTUALIZACION_YA_CONFIRMADA', 409);
    throw new ErrorActualizacionRenta('FUENTE_NO_DISPONIBLE', 503);
  }

  return { previsualizar, confirmar };
}
