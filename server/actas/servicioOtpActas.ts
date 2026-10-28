/**
 * H-07/H-08/H-09 — AUTORIDAD DEL OTP EN EL SERVIDOR (firma de actas)
 * =====================================================================
 * Antes (P0.3) el OTP seguía naciendo y validándose en el NAVEGADOR: el cliente
 * generaba el código, guardaba el hash en `actas_otp`, decidía los intentos,
 * escribía `firmas`/`estado` en el acta y, además, enviaba al servidor un
 * `destino` libre que el relé aceptaba sin comprobarlo. Consecuencias medidas en
 * la auditoría de cierre del 27-10-2026:
 *   · H-08: `POST /api/actas/otp/entregar` devolvía 200 `enviado:true` con
 *     `CORREO_ENVIADO_A=cualquier-persona@externo.example` (relé abierto).
 *   · H-07: la firma se acreditaba con código de cliente; el hash y el contador
 *     de intentos vivían en documentos que el propio cliente podía escribir.
 *   · H-09: fuerza bruta offline en 134 ms (10^6 códigos, hash conocido).
 *
 * Ahora TODO lo decide este módulo, que corre sólo en el servidor:
 *   · El DESTINO no lo elige el cliente: se deriva del email del participante
 *     guardado en el acta (o, si el firmante se autentica, del email VERIFICADO
 *     del token). Nunca se acepta un buzón arbitrario.
 *   · El CÓDIGO se genera con CSPRNG, se guarda sólo como SHA-256 con sal y no
 *     se registra ni se devuelve nunca.
 *   · Los INTENTOS los incrementa el servidor con compare-and-swap: dos
 *     peticiones simultáneas no pueden saltarse el máximo.
 *   · La AUTORIZACIÓN se deriva del acta (`ownerId`) y del espejo de identidad
 *     (`usuarios_auth` + `usuarios`), no de lo que declare el cliente.
 *   · La FIRMA se acredita en un commit atómico (acta + OTP + auditoría): o se
 *     aplican las tres escrituras o ninguna, y el acta llega a FIRMADA sólo por
 *     este camino. Las reglas de Firestore ya no admiten que el cliente cambie
 *     `firmas`, `estadoFirma` ni `fechaFirma`.
 */
import type { Acta, FirmaActa, OtpActa } from '../../src/types/actas.js';
import {
  crearOtpActa,
  validarOtp,
  validarOtpContexto,
  esOtpUtilizable,
} from '../../src/utils/actas/actaOtpEngine.js';
import {
  prepararActaParaFirma,
  validarFirmaConOtp,
  completarFirma,
  todasFirmasCompletadas,
  cerrarActaTrasFirmas,
} from '../../src/utils/actas/actaFirmaEngine.js';
import { resolverPerfilLlamador, type PerfilResuelto } from '../titularidades/backendTitulares.js';
import type {
  DocumentoLeido,
  EscrituraDocumentoFirestoreAtomica,
  IdentidadVerificada,
} from '../titularidades/googleBackend.js';
import { PLANTILLAS } from '../../src/notificaciones/plantillas.js';

// ---------------------------------------------------------------------------
// Contratos
// ---------------------------------------------------------------------------

/** Puerto Firestore mínimo (lo satisface `ClienteFirestoreRest`). */
export interface PuertoOtpActas {
  leer(coleccion: string, id: string): Promise<DocumentoLeido | null>;
  leerDocumento(ruta: string): Promise<DocumentoLeido | null>;
  crearDocumento(coleccion: string, id: string, datos: Record<string, unknown>): Promise<'CREADO' | 'YA_EXISTE'>;
  actualizarCampos(coleccion: string, id: string, datos: Record<string, unknown>): Promise<void>;
  escribirAtomico(escrituras: readonly EscrituraDocumentoFirestoreAtomica[]): Promise<'COMMIT' | 'CONFLICTO'>;
  consultarIgualdadesOrden(
    coleccion: string,
    consulta: {
      igualdades?: Array<[campo: string, valor: string]>;
      orden?: { campo: string; direccion: 'ASCENDING' | 'DESCENDING' };
      limite: number;
    },
  ): Promise<DocumentoLeido[]>;
}

export interface ProveedorCorreo {
  enviar(mensaje: { to: string; subject: string; body: string }): Promise<{ ok: boolean; externalId?: string; error?: string }>;
}

export interface TransporteCorreoOtp {
  modo: 'REAL' | 'MODO_SEGURO';
  proveedor: string | null;
  provider: ProveedorCorreo;
}

export const PLANTILLA_OTP_ACTA = 'acta.otp_firma';

export type CodigoErrorOtpActas =
  | 'NO_AUTENTICADO'
  | 'PETICION_INVALIDA'
  | 'ACTA_NO_ENCONTRADA'
  | 'SIN_AUTORIZACION'
  | 'ACTA_NO_FIRMABLE'
  | 'FIRMA_NO_ENCONTRADA'
  | 'FIRMA_YA_COMPLETADA'
  | 'DESTINO_NO_DISPONIBLE'
  | 'OTP_NO_DISPONIBLE'
  | 'OTP_INVALIDO'
  | 'OTP_ENTREGA_NO_DISPONIBLE'
  | 'OTP_ENTREGA_RECHAZADA'
  | 'ENFRIAMIENTO_ACTIVO'
  | 'CONFLICTO_CONCURRENCIA'
  | 'ERROR_INTERNO';

export interface ResultadoSolicitudOtp {
  ok: boolean;
  http: 200 | 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502 | 503;
  codigo?: CodigoErrorOtpActas;
  mensaje?: string;
  firmante?: string;
  firmaId?: string;
  otpId?: string;
  destinoEnmascarado?: string;
  expiraEn?: string;
  actaEstado?: string;
  /** Segundos de espera cuando `codigo === 'ENFRIAMIENTO_ACTIVO'`. */
  reintentarEnSegundos?: number;
}

export interface ResultadoValidacionOtp {
  ok: boolean;
  http: 200 | 400 | 401 | 403 | 404 | 409 | 429 | 500;
  codigo?: CodigoErrorOtpActas;
  mensaje?: string;
  valido?: boolean;
  intentosRestantes?: number;
  firmante?: string;
  firmaId?: string;
  estadoFirma?: string;
  actaCerrada?: boolean;
}

// ---------------------------------------------------------------------------
// Constantes de control
// ---------------------------------------------------------------------------

/** Enfriamiento entre envíos de la MISMA firma: evita bombardeo de correo. */
export const ENFRIAMIENTO_ENVIO_MS = 60_000;

/** Secreto de relleno para comparaciones de longitud constante no aplica aquí:
 *  el hash lo compara el motor; el control real es el tope de intentos. */

const ID_VALIDO = /^[A-Za-z0-9._:-]{1,120}$/;
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function construirMensajeOtp(codigo: string, actaId: string): { subject: string; body: string } {
  const plantilla = PLANTILLAS[PLANTILLA_OTP_ACTA];
  const rellenar = (texto: string) => texto
    .replace(/\{codigo\}/g, codigo)
    .replace(/\{actaId\}/g, actaId.slice(0, 80));
  return {
    subject: rellenar(plantilla?.asunto || 'Código de firma — {actaId}'),
    body: rellenar(plantilla?.cuerpo || 'Su código de firma es {codigo}. Caduca en 15 minutos.'),
  };
}

/** `ana.perez@dominio.es` → `a***@dominio.es` (nunca se publica el buzón completo). */
export function enmascararCorreo(correo: string): string {
  const [usuario, dominio] = String(correo).split('@');
  if (!dominio) return '***';
  const inicial = usuario.slice(0, 1) || '*';
  return `${inicial}***@${dominio}`;
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function correoNormalizado(valor: unknown): string {
  const bruto = texto(valor).trim().toLowerCase();
  return CORREO_VALIDO.test(bruto) ? bruto : '';
}

function comoActa(datos: Record<string, unknown>): Acta {
  return datos as unknown as Acta;
}

function firmasDe(acta: Acta): FirmaActa[] {
  return Array.isArray(acta.firmas) ? acta.firmas : [];
}

function participantesDe(acta: Acta): Acta['participantes'] {
  return Array.isArray(acta.participantes) ? acta.participantes : [];
}

function negar(http: ResultadoSolicitudOtp['http'], codigo: CodigoErrorOtpActas, mensaje: string, extra: Partial<ResultadoSolicitudOtp> = {}): ResultadoSolicitudOtp {
  return { ok: false, http, codigo, mensaje, ...extra };
}

// ---------------------------------------------------------------------------
// Autorización
// ---------------------------------------------------------------------------

type RolSobreActa = 'GESTOR' | 'FIRMANTE';

interface AccesoConcedido {
  rol: RolSobreActa;
  perfil: PerfilResuelto | null;
  /** Nombre que queda en la trazabilidad del acta. */
  etiqueta: string;
  emailVerificado: string;
}

interface ParticipanteResuelto {
  id: string;
  nombre: string;
  email: string;
}

async function resolverPerfil(
  puerto: PuertoOtpActas,
  identidad: IdentidadVerificada,
): Promise<PerfilResuelto | null> {
  try {
    return await resolverPerfilLlamador(identidad, {
      leerDocumento: async (ruta) => {
        const documento = await puerto.leerDocumento(ruta);
        return documento ? documento.datos : null;
      },
    });
  } catch {
    // Un fallo de lectura del espejo de identidad NO concede nada.
    return null;
  }
}

function autorizar(
  acta: Acta,
  identidad: IdentidadVerificada,
  perfil: PerfilResuelto | null,
  participante: ParticipanteResuelto | undefined,
): AccesoConcedido | null {
  const emailVerificado = correoNormalizado(identidad.email);
  const esGestor = Boolean(perfil) && (
    perfil!.esMaster
    || perfil!.tipoPerfil === 'ADMINISTRADOR'
    || (Boolean(perfil!.propietarioId) && perfil!.propietarioId === acta.ownerId)
  );
  if (esGestor) {
    return {
      rol: 'GESTOR',
      perfil,
      etiqueta: perfil!.email || perfil!.uid,
      emailVerificado,
    };
  }
  // Camino del firmante: exige correo VERIFICADO por el proveedor de identidad
  // y que coincida con el correo que el acta guarda para ese participante.
  const emailParticipante = correoNormalizado(participante?.email);
  if (identidad.emailVerificado === true && emailVerificado && emailParticipante && emailVerificado === emailParticipante) {
    return {
      rol: 'FIRMANTE',
      perfil,
      etiqueta: participante?.nombre || emailVerificado,
      emailVerificado,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lectura del acta y resolución del participante
// ---------------------------------------------------------------------------

async function leerActa(
  puerto: PuertoOtpActas,
  actaId: string,
): Promise<{ ok: true; acta: Acta; updateTime?: string } | { ok: false; resultado: ResultadoSolicitudOtp }> {
  const documento = await puerto.leer('actas', actaId);
  if (!documento) {
    return { ok: false, resultado: negar(404, 'ACTA_NO_ENCONTRADA', 'El acta indicada no existe.') };
  }
  const acta = comoActa(documento.datos);
  if (texto(acta.id) && acta.id !== actaId) {
    return { ok: false, resultado: negar(409, 'CONFLICTO_CONCURRENCIA', 'El identificador del acta no coincide con el documento.') };
  }
  return { ok: true, acta, ...(documento.updateTime ? { updateTime: documento.updateTime } : {}) };
}

function resolverParticipante(acta: Acta, participanteId: string): ParticipanteResuelto | undefined {
  return participantesDe(acta)
    .filter((p) => p && p.id === participanteId)
    .map((p) => ({ id: p.id, nombre: String(p.nombre || ''), email: correoNormalizado(p.email) }))[0];
}

function buscarFirma(acta: Acta, participanteId: string): FirmaActa | undefined {
  return firmasDe(acta).find((f) => f && f.firmanteId === participanteId);
}

// ---------------------------------------------------------------------------
// 1 · SOLICITUD: el servidor crea el OTP y lo entrega al firmante del acta
// ---------------------------------------------------------------------------

export interface EntradaSolicitudOtp {
  identidad: IdentidadVerificada;
  actaId: string;
  participanteId: string;
}

export async function solicitarOtpFirma(params: {
  puerto: PuertoOtpActas;
  transporte: TransporteCorreoOtp;
  entrada: EntradaSolicitudOtp;
  ahora?: Date;
}): Promise<ResultadoSolicitudOtp> {
  const { puerto, transporte, entrada } = params;
  const actaId = texto(entrada.actaId).trim();
  const participanteId = texto(entrada.participanteId).trim();
  if (!ID_VALIDO.test(actaId) || !ID_VALIDO.test(participanteId)) {
    return negar(400, 'PETICION_INVALIDA', 'Los identificadores de acta y participante no son válidos.');
  }

  const lectura = await leerActa(puerto, actaId);
  if ('resultado' in lectura) return lectura.resultado;
  let acta = lectura.acta;

  const participante = resolverParticipante(acta, participanteId);
  const perfil = await resolverPerfil(puerto, entrada.identidad);
  const acceso = autorizar(acta, entrada.identidad, perfil, participante);
  if (!acceso) {
    return negar(403, 'SIN_AUTORIZACION', 'La sesión no tiene autorización sobre esta acta ni sobre este firmante.');
  }
  if (!participante) {
    return negar(404, 'FIRMA_NO_ENCONTRADA', 'El participante indicado no forma parte del acta.');
  }
  if (!participante.email) {
    return negar(
      409,
      'DESTINO_NO_DISPONIBLE',
      'El participante no tiene un correo válido guardado en el acta. Añádelo y vuelve a solicitar la firma: el servidor no envía códigos a direcciones no registradas.',
      { firmante: participante.nombre },
    );
  }
  const participanteFirma = participantesDe(acta).find((p) => p.id === participante.id);
  if (!participanteFirma?.firmaRequerida) {
    return negar(409, 'FIRMA_NO_ENCONTRADA', 'El participante no tiene firma requerida en esta acta.', { firmante: participante.nombre });
  }

  // Preparación del acta: SÓLO el gestor puede moverla a PENDIENTE_FIRMA.
  let preparada: Acta | null = null;
  if (acta.estado !== 'PENDIENTE_FIRMA') {
    if (acceso.rol !== 'GESTOR') {
      return negar(409, 'ACTA_NO_FIRMABLE', `El acta está en ${acta.estado}; todavía no admite firma.`, { actaEstado: String(acta.estado) });
    }
    if (firmasDe(acta).some((f) => f && (f.estado === 'FIRMADA' || f.estado === 'VALIDADA'))) {
      return negar(409, 'ACTA_NO_FIRMABLE', 'El acta ya tiene firmas acreditadas y no está en PENDIENTE_FIRMA: no se regeneran.', {
        actaEstado: String(acta.estado),
      });
    }
    try {
      preparada = prepararActaParaFirma(acta, acceso.etiqueta, entrada.identidad.uid).actaActualizada;
    } catch (error) {
      return negar(409, 'ACTA_NO_FIRMABLE', `El acta no puede pasar a firma desde ${acta.estado}.`, {
        actaEstado: String(acta.estado),
      });
    }
    acta = preparada;
  }

  const firma = buscarFirma(acta, participante.id);
  if (!firma) {
    return negar(409, 'FIRMA_NO_ENCONTRADA', 'El acta no tiene una firma asociada a este participante.', { firmante: participante.nombre });
  }
  if (firma.estado === 'FIRMADA' || firma.estado === 'VALIDADA') {
    return negar(409, 'FIRMA_YA_COMPLETADA', 'La firma de este participante ya está completada.', { firmante: participante.nombre, firmaId: firma.id });
  }

  // Enfriamiento por firma: un OTP nuevo cada minuto como mucho.
  const ahora = params.ahora ?? new Date();
  const previos = await puerto.consultarIgualdadesOrden('actas_otp', {
    igualdades: [['actaId', actaId], ['firmaId', firma.id]],
    limite: 20,
  });
  const ultimo = previos
    .map((d) => texto(d.datos.fechaCreacion))
    .filter(Boolean)
    .sort()
    .pop();
  if (ultimo) {
    const transcurrido = ahora.getTime() - new Date(ultimo).getTime();
    if (Number.isFinite(transcurrido) && transcurrido >= 0 && transcurrido < ENFRIAMIENTO_ENVIO_MS) {
      const espera = Math.ceil((ENFRIAMIENTO_ENVIO_MS - transcurrido) / 1000);
      return negar(429, 'ENFRIAMIENTO_ACTIVO', `Ya se envió un código hace menos de un minuto. Espera ${espera} s para pedir otro.`, {
        reintentarEnSegundos: espera,
        firmante: participante.nombre,
      });
    }
  }

  // Creación del OTP en el SERVIDOR (CSPRNG + SHA-256 con sal).
  let otp: OtpActa;
  let codigoPlain: string;
  try {
    const creado = await crearOtpActa({
      actaId,
      firmaId: firma.id,
      ownerId: String(acta.ownerId),
      propertyId: typeof acta.propertyId === 'string' ? acta.propertyId : undefined,
      contractId: typeof acta.contractId === 'string' ? acta.contractId : undefined,
      versionActa: acta.version,
      solicitante: acceso.etiqueta,
      solicitanteId: entrada.identidad.uid,
      canal: 'EMAIL',
    });
    otp = creado.otp;
    codigoPlain = creado.codigoPlain;
  } catch (error) {
    return negar(500, 'ERROR_INTERNO', 'No se ha podido generar un código seguro; no se ha enviado nada.');
  }

  // Commit 1: preparación del acta (si procede) + OTP con entrega pendiente.
  // El acta se escribe con compare-and-swap: sin versión conocida no se toca.
  if (preparada && !lectura.updateTime) {
    return negar(409, 'CONFLICTO_CONCURRENCIA', 'No se ha podido fijar la versión del acta; no se ha enviado nada.');
  }
  const escrituras: EscrituraDocumentoFirestoreAtomica[] = [];
  if (preparada) {
    const datosActa = {
      firmas: preparada.firmas,
      estado: preparada.estado,
      estadoFirma: preparada.estadoFirma,
      historial: preparada.historial,
      fechaActualizacion: preparada.fechaActualizacion,
      actualizadoPor: preparada.actualizadoPor,
    };
    escrituras.push({
      coleccion: 'actas',
      id: actaId,
      datos: datosActa,
      camposActualizar: Object.keys(datosActa),
      precondicion: { tipo: 'VERSION', updateTime: String(lectura.updateTime) },
    });
  }
  escrituras.push({
    coleccion: 'actas_otp',
    id: otp.id,
    datos: { ...otp, transporteRealizado: false },
    precondicion: { tipo: 'NO_EXISTE' },
  });
  let commit: 'COMMIT' | 'CONFLICTO';
  try {
    commit = await puerto.escribirAtomico(escrituras);
  } catch {
    return negar(500, 'ERROR_INTERNO', 'No se ha podido registrar el código; no se ha enviado nada.');
  }
  if (commit !== 'COMMIT') {
    return negar(409, 'CONFLICTO_CONCURRENCIA', 'El acta cambió mientras se preparaba el envío. Vuelve a intentarlo.');
  }

  if (transporte.modo !== 'REAL') {
    return negar(
      503,
      'OTP_ENTREGA_NO_DISPONIBLE',
      'No hay transporte de correo REAL configurado. El firmante NO ha recibido el código; configura EMAIL_PROVEEDOR/SMTP_URL y EMAIL_FROM.',
      { firmante: participante.nombre },
    );
  }

  const mensaje = construirMensajeOtp(codigoPlain, actaId);
  let entrega: { ok: boolean; externalId?: string; error?: string };
  try {
    entrega = await transporte.provider.enviar({ to: participante.email, ...mensaje });
  } catch {
    entrega = { ok: false, error: 'EXCEPCION_PROVEEDOR' };
  }
  if (!entrega.ok) {
    return negar(
      502,
      'OTP_ENTREGA_RECHAZADA',
      'El proveedor de correo no aceptó el mensaje; el firmante NO ha recibido el código.',
      { firmante: participante.nombre },
    );
  }

  // Commit 2: se acredita la entrega REAL (sin ella el código no vale).
  const datosEntrega: Record<string, unknown> = {
    transporteRealizado: true,
    fechaEntrega: ahora.toISOString(),
    canal: 'EMAIL',
    proveedorEntrega: transporte.proveedor || 'DESCONOCIDO',
  };
  if (entrega.externalId) datosEntrega.proveedorMensajeId = String(entrega.externalId).slice(0, 200);
  let entregaRegistrada = true;
  try {
    await puerto.actualizarCampos('actas_otp', otp.id, datosEntrega);
  } catch {
    entregaRegistrada = false;
  }
  if (!entregaRegistrada) {
    // La entrega ya ocurrió; el código caduca en 15 min y no se acredita firma
    // alguna sin `transporteRealizado`. Se informa para poder reintentar.
    return negar(500, 'ERROR_INTERNO', 'El correo se envió, pero no se pudo registrar la entrega. Solicita un código nuevo.', {
      firmante: participante.nombre,
    });
  }

  return {
    ok: true,
    http: 200,
    firmante: participante.nombre,
    firmaId: firma.id,
    otpId: otp.id,
    destinoEnmascarado: enmascararCorreo(participante.email),
    expiraEn: otp.fechaExpiracion,
    actaEstado: String(acta.estado),
  };
}

// ---------------------------------------------------------------------------
// 2 · VALIDACIÓN: el servidor comprueba el código y acredita la firma
// ---------------------------------------------------------------------------

export interface EntradaValidacionOtp {
  identidad: IdentidadVerificada;
  actaId: string;
  participanteId: string;
  codigo: string;
  ip?: string;
  userAgent?: string;
}

function auditoriaFirma(params: {
  accion: string;
  descripcion: string;
  resultado: 'EXITO' | 'ERROR';
  identidad: IdentidadVerificada;
  etiqueta: string;
  acta: Acta;
  detalles: Record<string, unknown>;
}): EscrituraDocumentoFirestoreAtomica {
  const id = `audit_otp_${String(params.acta.id)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fechaHora = new Date().toISOString();
  return {
    coleccion: 'audit_logs',
    id,
    datos: {
      id,
      fechaHora,
      usuarioId: params.identidad.uid,
      usuarioEmail: correoNormalizado(params.identidad.email),
      usuarioNombre: params.etiqueta,
      accion: params.accion,
      descripcion: params.descripcion,
      entidadAfectada: 'inmueble',
      idAfectado: String(params.acta.propertyId || ''),
      resultado: params.resultado,
      detalles: params.detalles,
    },
    precondicion: { tipo: 'NO_EXISTE' },
  };
}

export async function validarOtpYFirmar(params: {
  puerto: PuertoOtpActas;
  entrada: EntradaValidacionOtp;
  ahora?: Date;
}): Promise<ResultadoValidacionOtp> {
  const { puerto, entrada } = params;
  const actaId = texto(entrada.actaId).trim();
  const participanteId = texto(entrada.participanteId).trim();
  const codigo = texto(entrada.codigo).trim();
  if (!ID_VALIDO.test(actaId) || !ID_VALIDO.test(participanteId) || !/^\d{6}$/.test(codigo)) {
    return { ok: false, http: 400, codigo: 'PETICION_INVALIDA', mensaje: 'Datos de validación no válidos (se espera un código de 6 dígitos).' };
  }

  const lectura = await leerActa(puerto, actaId);
  if ('resultado' in lectura) {
    const fallo = lectura.resultado;
    return { ok: false, http: fallo.http as ResultadoValidacionOtp['http'], codigo: fallo.codigo, mensaje: fallo.mensaje };
  }
  const acta = lectura.acta;
  const participante = resolverParticipante(acta, participanteId);
  const perfil = await resolverPerfil(puerto, entrada.identidad);
  const acceso = autorizar(acta, entrada.identidad, perfil, participante);
  if (!acceso) {
    return { ok: false, http: 403, codigo: 'SIN_AUTORIZACION', mensaje: 'La sesión no tiene autorización para firmar esta acta.' };
  }
  if (!participante) {
    return { ok: false, http: 404, codigo: 'FIRMA_NO_ENCONTRADA', mensaje: 'El participante indicado no forma parte del acta.' };
  }
  const firma = buscarFirma(acta, participante.id);
  if (!firma) {
    return { ok: false, http: 409, codigo: 'FIRMA_NO_ENCONTRADA', mensaje: 'El acta no tiene una firma asociada a este participante.', firmante: participante.nombre };
  }
  if (firma.estado === 'FIRMADA') {
    return { ok: false, http: 409, codigo: 'FIRMA_YA_COMPLETADA', mensaje: 'Esta firma ya está completada.', firmante: participante.nombre };
  }

  // OTP ACTIVO de ESA firma. Consulta SÓLO por igualdades (no exige índice
  // compuesto nuevo y no enumera la colección).
  const candidatos = await puerto.consultarIgualdadesOrden('actas_otp', {
    igualdades: [['actaId', actaId], ['firmaId', firma.id], ['estado', 'ACTIVO']],
    limite: 20,
  });
  const otps = candidatos
    .map((documento) => ({ documento, otp: documento.datos as unknown as OtpActa }))
    .filter(({ otp }) => Boolean(otp) && typeof otp.codigoHash === 'string')
    .sort((a, b) => texto(b.otp.fechaCreacion).localeCompare(texto(a.otp.fechaCreacion)));

  if (otps.length === 0) {
    return { ok: false, http: 404, codigo: 'OTP_NO_DISPONIBLE', mensaje: 'No hay un código activo para esta firma. Solicita uno nuevo.', firmante: participante.nombre, firmaId: firma.id };
  }

  const elegido = otps.find(({ otp }) => otp.transporteRealizado === true && esOtpUtilizable(otp));
  if (!elegido) {
    const hayPendienteDeEntrega = otps.some(({ otp }) => otp.transporteRealizado !== true);
    return {
      ok: false,
      http: 409,
      codigo: hayPendienteDeEntrega ? 'OTP_ENTREGA_RECHAZADA' : 'OTP_NO_DISPONIBLE',
      mensaje: hayPendienteDeEntrega
        ? 'El código no llegó a entregarse al firmante: no se puede usar para firmar. Solicita uno nuevo.'
        : 'El código está caducado o bloqueado. Solicita uno nuevo.',
      firmante: participante.nombre,
      firmaId: firma.id,
    };
  }

  const otp = elegido.otp;
  const contexto = validarOtpContexto(otp, {
    actaId,
    firmaId: firma.id,
    ownerId: String(acta.ownerId),
    versionActa: acta.version,
    propertyId: typeof acta.propertyId === 'string' ? acta.propertyId : undefined,
  });
  if (!contexto.valido) {
    return { ok: false, http: 409, codigo: 'OTP_NO_DISPONIBLE', mensaje: `El código no corresponde a esta acta: ${contexto.motivo}`, firmante: participante.nombre, firmaId: firma.id };
  }

  const resultado = await validarOtp(otp, codigo);
  const ahora = params.ahora ?? new Date();
  const otpActualizado = resultado.otpActualizado;

  if (!resultado.valido) {
    const intentosRestantes = Math.max(0, (otpActualizado.maxIntentos || 5) - (otpActualizado.intentos || 0));
    const datosOtp = {
      intentos: otpActualizado.intentos,
      estado: otpActualizado.estado,
      fechaUltimoIntento: ahora.toISOString(),
      ultimoIntentoPor: entrada.identidad.uid,
    };
    const commit = await puerto.escribirAtomico([
      {
        coleccion: 'actas_otp',
        id: otp.id,
        datos: datosOtp,
        camposActualizar: Object.keys(datosOtp),
        precondicion: elegido.documento.updateTime
          ? { tipo: 'VERSION', updateTime: elegido.documento.updateTime }
          : { tipo: 'NO_EXISTE' },
      },
      auditoriaFirma({
        accion: 'ACTA_OTP_FALLIDO',
        descripcion: `Código OTP incorrecto en acta ${acta.id} para ${participante.nombre}`,
        resultado: 'ERROR',
        identidad: entrada.identidad,
        etiqueta: acceso.etiqueta,
        acta,
        detalles: { actaId, firmaId: firma.id, otpId: otp.id, intentosRestantes, motivo: String(resultado.motivo || '') },
      }),
    ]).catch(() => 'CONFLICTO' as const);
    if (commit !== 'COMMIT') {
      return { ok: false, http: 409, codigo: 'CONFLICTO_CONCURRENCIA', mensaje: 'Se está validando otro código para esta firma. Inténtalo de nuevo.', firmante: participante.nombre, firmaId: firma.id };
    }
    return {
      ok: false,
      http: 401,
      codigo: 'OTP_INVALIDO',
      mensaje: intentosRestantes > 0
        ? `Código incorrecto. Intentos restantes: ${intentosRestantes}.`
        : 'Código incorrecto y sin intentos restantes. Solicita un código nuevo.',
      valido: false,
      intentosRestantes,
      firmante: participante.nombre,
      firmaId: firma.id,
    };
  }

  // Código correcto: se acredita la firma y se consume el OTP en un único commit.
  let firmaFirmada: FirmaActa;
  try {
    firmaFirmada = completarFirma(
      validarFirmaConOtp(firma),
      String(entrada.ip || '').slice(0, 60) || undefined,
      String(entrada.userAgent || '').slice(0, 240) || undefined,
    );
    firmaFirmada = {
      ...firmaFirmada,
      otpId: otp.id,
      trazabilidad: [
        ...(firmaFirmada.trazabilidad || []),
        {
          id: `tr_otp_${Date.now()}`,
          fecha: ahora.toISOString(),
          accion: 'OTP_VALIDADO_SERVIDOR',
          detalle: `Validado en servidor (${acceso.rol === 'GESTOR' ? 'propietario/gestor en presencia del firmante' : 'firmante autenticado'})`,
        },
      ],
    };
  } catch (error) {
    return { ok: false, http: 409, codigo: 'CONFLICTO_CONCURRENCIA', mensaje: 'La firma cambió de estado mientras se validaba el código.', firmante: participante.nombre, firmaId: firma.id };
  }

  let actaActualizada: Acta = {
    ...acta,
    firmas: firmasDe(acta).map((f) => (f.id === firma.id ? firmaFirmada : f)),
    fechaActualizacion: ahora.toISOString(),
    actualizadoPor: acceso.etiqueta,
    version: acta.version,
  };
  let actaCerrada = false;
  try {
    if (todasFirmasCompletadas(actaActualizada)) {
      actaActualizada = cerrarActaTrasFirmas(actaActualizada, acceso.etiqueta, entrada.identidad.uid).actaActualizada;
      actaCerrada = true;
    } else {
      actaActualizada = {
        ...actaActualizada,
        estadoFirma: 'EN_PROCESO',
        historial: [
          ...(actaActualizada.historial || []),
          {
            id: `hist_${Date.now()}`,
            fecha: ahora.toISOString(),
            usuario: acceso.etiqueta,
            usuarioId: entrada.identidad.uid,
            accion: 'OTP_VALIDADO',
            estadoAnterior: actaActualizada.estado,
            estadoNuevo: actaActualizada.estado,
            detalle: `Firma completada por ${participante.nombre} (${firma.id}) con OTP validado en servidor`,
            version: actaActualizada.version,
          },
        ],
      };
    }
  } catch {
    return { ok: false, http: 409, codigo: 'CONFLICTO_CONCURRENCIA', mensaje: 'El acta no puede cerrarse en este estado.', firmante: participante.nombre, firmaId: firma.id };
  }

  if (!lectura.updateTime) {
    return { ok: false, http: 409, codigo: 'CONFLICTO_CONCURRENCIA', mensaje: 'No se ha podido fijar la versión del acta; la firma no se ha acreditado.', firmante: participante.nombre, firmaId: firma.id };
  }
  const datosActa: Record<string, unknown> = {
    firmas: actaActualizada.firmas,
    estado: actaActualizada.estado,
    estadoFirma: actaActualizada.estadoFirma,
    historial: actaActualizada.historial,
    fechaActualizacion: actaActualizada.fechaActualizacion,
    actualizadoPor: actaActualizada.actualizadoPor,
  };
  if (actaActualizada.fechaFirma) datosActa.fechaFirma = actaActualizada.fechaFirma;

  const datosOtp: Record<string, unknown> = {
    estado: 'USADO',
    usado: true,
    intentos: otpActualizado.intentos,
    fechaUso: ahora.toISOString(),
    validadoPor: entrada.identidad.uid,
    origenValidacion: acceso.rol === 'GESTOR' ? 'GESTOR_EN_PRESENCIA' : 'FIRMANTE_AUTENTICADO',
  };

  let commit: 'COMMIT' | 'CONFLICTO';
  try {
    commit = await puerto.escribirAtomico([
      {
        coleccion: 'actas',
        id: actaId,
        datos: datosActa,
        camposActualizar: Object.keys(datosActa),
        precondicion: { tipo: 'VERSION', updateTime: String(lectura.updateTime) },
      },
      {
        coleccion: 'actas_otp',
        id: otp.id,
        datos: datosOtp,
        camposActualizar: Object.keys(datosOtp),
        precondicion: elegido.documento.updateTime
          ? { tipo: 'VERSION', updateTime: elegido.documento.updateTime }
          : { tipo: 'NO_EXISTE' },
      },
      auditoriaFirma({
        accion: 'ACTA_FIRMADA',
        descripcion: `Firma ${firma.id} completada por ${participante.nombre} en acta ${acta.id} v${acta.version}`,
        resultado: 'EXITO',
        identidad: entrada.identidad,
        etiqueta: acceso.etiqueta,
        acta,
        detalles: { actaId, firmaId: firma.id, otpId: otp.id, version: acta.version, actaCerrada, rol: acceso.rol },
      }),
    ]);
  } catch {
    return { ok: false, http: 500, codigo: 'ERROR_INTERNO', mensaje: 'No se ha podido acreditar la firma. El código sigue sin consumir; reinténtalo.', firmante: participante.nombre, firmaId: firma.id };
  }
  if (commit !== 'COMMIT') {
    // Nada se ha escrito (commit atómico): el OTP no se consume.
    return { ok: false, http: 409, codigo: 'CONFLICTO_CONCURRENCIA', mensaje: 'El acta o el código cambiaron mientras se validaba. Reinténtalo.', firmante: participante.nombre, firmaId: firma.id };
  }

  return {
    ok: true,
    http: 200,
    valido: true,
    firmante: participante.nombre,
    firmaId: firma.id,
    estadoFirma: String(actaActualizada.estadoFirma),
    actaCerrada,
  };
}
