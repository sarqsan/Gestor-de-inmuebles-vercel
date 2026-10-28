import { OtpActa } from '../../types/actas';

/**
 * P0.3 — Motor de OTP de actas: entropía criptográfica y SIN texto plano.
 * ===========================================================================
 * Antes: un generador pseudoaleatorio inseguro creaba el código, un hash no criptográfico servía
 * de fallback y `codigoPlainTemporal` viajaba a Firestore y se mostraba en la
 * UI. Eso permitía predecir/adivinar códigos y los exponía a cualquiera con
 * acceso de lectura al documento.
 *
 * Ahora:
 *  · `crypto.getRandomValues` con muestreo por rechazo (sin sesgo de módulo).
 *    Si no hay CSPRNG se LANZA: nunca se degrada a un generador inseguro.
 *  · SHA-256 **con sal por OTP** (`codigoSalt`). Sin `crypto.subtle` se LANZA:
 *    no existe el hash débil de respaldo. Los OTP antiguos sin sal siguen
 *    validándose (compatibilidad) pero los nuevos son siempre salados.
 *  · `codigoPlainTemporal` NO se escribe NUNCA. El código solo existe en la
 *    memoria de quien lo genera y se entrega por un transporte explícito.
 *  · `entregarOtpActa` convierte un `enviado:false` silencioso en un error
 *    tipado: ningún flujo puede confundir «no entregado» con «entregado».
 */
const OTP_LENGTH = 6;
const OTP_MAX_INTENTOS = 5;
const OTP_EXPIRACION_MINUTOS = 15;

export class ErrorOtpActa extends Error {
  constructor(readonly codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorOtpActa';
  }
}

function bytesAleatorios(longitud: number): Uint8Array {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new ErrorOtpActa('OTP_ENTROPIA_NO_DISPONIBLE', 'No hay generador criptográfico disponible; no se puede crear un OTP seguro.');
  }
  return c.getRandomValues(new Uint8Array(longitud));
}

function aHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Seis dígitos uniformes: se descartan los bytes >= 250 para evitar sesgo. */
export function generarCodigoOtp(): string {
  let codigo = '';
  while (codigo.length < OTP_LENGTH) {
    for (const byte of bytesAleatorios(OTP_LENGTH * 2)) {
      if (byte >= 250) continue; // 250 = múltiplo de 10 más alto <= 255
      codigo += String(byte % 10);
      if (codigo.length === OTP_LENGTH) break;
    }
  }
  return codigo;
}

async function hashCodigo(codigo: string, sal: string): Promise<string> {
  const c = globalThis.crypto;
  if (!c || !c.subtle || typeof c.subtle.digest !== 'function') {
    throw new ErrorOtpActa('OTP_HASH_NO_DISPONIBLE', 'SHA-256 no disponible; no se puede proteger el OTP.');
  }
  const datos = new TextEncoder().encode(`${sal}:${codigo}`);
  return aHex(new Uint8Array(await c.subtle.digest('SHA-256', datos)));
}

export async function crearOtpActa(params: {
  actaId: string;
  firmaId: string;
  ownerId: string;
  propertyId?: string;
  contractId?: string;
  versionActa?: number;
  solicitante?: string;
  solicitanteId?: string;
  canal?: OtpActa['canal'];
}): Promise<{ otp: OtpActa; codigoPlain: string }> {
  const codigoPlain = generarCodigoOtp();
  const sal = aHex(bytesAleatorios(16));
  const codigoHash = await hashCodigo(codigoPlain, sal);

  const ahora = new Date();
  const expiracion = new Date(ahora.getTime() + OTP_EXPIRACION_MINUTOS * 60 * 1000);
  const sufijo = aHex(bytesAleatorios(6));

  const otp: OtpActa = {
    id: `otp_${params.actaId}_${ahora.getTime()}_${sufijo}`,
    actaId: params.actaId,
    firmaId: params.firmaId,
    ownerId: params.ownerId,
    propertyId: params.propertyId,
    contractId: params.contractId,
    versionActa: params.versionActa,
    codigoHash,
    codigoSalt: sal,
    algoritmoHash: 'SHA-256_SALTED',
    // P0.3.3: NUNCA se persiste el código en texto plano.
    fechaCreacion: ahora.toISOString(),
    fechaExpiracion: expiracion.toISOString(),
    intentos: 0,
    maxIntentos: OTP_MAX_INTENTOS,
    usado: false,
    solicitante: params.solicitante,
    solicitanteId: params.solicitanteId,
    canal: params.canal || 'PENDIENTE_PROVEEDOR',
    estado: 'ACTIVO',
    // La entrega es un paso POSTERIOR y explícito; crear un OTP no la acredita.
    transporteRealizado: false,
  };

  return { otp, codigoPlain };
}

export async function validarOtp(
  otp: OtpActa,
  codigoIngresado: string
): Promise<{ valido: boolean; motivo?: string; otpActualizado: OtpActa }> {
  const ahora = new Date();
  const expiracion = new Date(otp.fechaExpiracion);

  if (otp.estado !== 'ACTIVO') {
    return { valido: false, motivo: `OTP no activo: ${otp.estado}`, otpActualizado: otp };
  }
  if (otp.usado) {
    return { valido: false, motivo: 'OTP ya usado', otpActualizado: { ...otp, estado: 'USADO' } };
  }
  if (ahora > expiracion) {
    return { valido: false, motivo: 'OTP expirado', otpActualizado: { ...otp, estado: 'EXPIRADO' } };
  }
  if (otp.intentos >= otp.maxIntentos) {
    return { valido: false, motivo: 'Intentos excedidos', otpActualizado: { ...otp, estado: 'BLOQUEADO' } };
  }

  // Compatibilidad: documentos anteriores a P0.3 no tienen sal.
  const sal = otp.codigoSalt ?? '';
  const hashIngresado = await hashCodigo(codigoIngresado, sal);

  if (hashIngresado !== otp.codigoHash) {
    const nuevoIntentos = otp.intentos + 1;
    const bloqueado = nuevoIntentos >= otp.maxIntentos;
    return {
      valido: false,
      motivo: bloqueado ? 'Intentos excedidos, OTP bloqueado' : `Código incorrecto, intentos restantes: ${otp.maxIntentos - nuevoIntentos}`,
      otpActualizado: {
        ...otp,
        intentos: nuevoIntentos,
        estado: bloqueado ? 'BLOQUEADO' : 'ACTIVO',
      },
    };
  }

  const { codigoPlainTemporal: _descartado, ...sinPlain } = otp as OtpActa & { codigoPlainTemporal?: string };
  return {
    valido: true,
    otpActualizado: {
      ...sinPlain,
      usado: true,
      fechaUso: ahora.toISOString(),
      intentos: otp.intentos + 1,
      estado: 'USADO',
      codigoPlainTemporal: undefined,
    },
  };
}

export function esOtpExpirado(otp: OtpActa): boolean {
  return new Date() > new Date(otp.fechaExpiracion);
}

export function esOtpUtilizable(otp: OtpActa): boolean {
  return otp.estado === 'ACTIVO' && !otp.usado && !esOtpExpirado(otp) && otp.intentos < otp.maxIntentos;
}

/** Invariante de seguridad comprobable en tests y antes de persistir. */
export function esOtpSeguro(otp: OtpActa): boolean {
  const registro = otp as unknown as Record<string, unknown>;
  return /^[0-9a-f]{64}$/.test(otp.codigoHash)
    && typeof otp.codigoSalt === 'string' && /^[0-9a-f]{32}$/.test(otp.codigoSalt)
    && !('codigo' in registro)
    && !('plain' in registro)
    && (otp.codigoPlainTemporal === undefined || otp.codigoPlainTemporal === null);
}

export function validarOtpContexto(otp: OtpActa, contexto: { actaId: string; firmaId: string; ownerId: string; versionActa?: number; propertyId?: string }): { valido: boolean; motivo?: string } {
  if (otp.actaId !== contexto.actaId) return { valido: false, motivo: 'OTP no pertenece a esta acta' };
  if (otp.firmaId !== contexto.firmaId) return { valido: false, motivo: 'OTP no pertenece a esta firma' };
  if (otp.ownerId !== contexto.ownerId) return { valido: false, motivo: 'OTP no pertenece a este propietario (aislamiento)' };
  if (contexto.versionActa !== undefined && otp.versionActa !== undefined && otp.versionActa !== contexto.versionActa) {
    return { valido: false, motivo: `OTP versión ${otp.versionActa} no coincide con acta versión ${contexto.versionActa}` };
  }
  if (contexto.propertyId && otp.propertyId && otp.propertyId !== contexto.propertyId) {
    return { valido: false, motivo: 'OTP propertyId no coincide' };
  }
  return { valido: true };
}

// ---------------------------------------------------------------------------
// P0.3.5 — Transporte: NUNCA un `enviado:false` silencioso.
// ---------------------------------------------------------------------------

export interface ResultadoEnvioOtp {
  enviado: boolean;
  proveedor?: string;
  error?: string;
  /** `true` solo en adaptadores de desarrollo; NO acredita entrega real. */
  simulado?: boolean;
}

export interface TransporteOtpAdapter {
  enviarOtp(destino: string, codigo: string, contexto: { actaId: string; firmaId: string }): Promise<ResultadoEnvioOtp>;
}

/**
 * Adaptador de DESARROLLO. Devuelve `simulado: true`: sirve para pruebas, pero
 * `entregarOtpActa` lo marca como NO entregado y nunca acredita una firma.
 */
export class TransporteManualAdapter implements TransporteOtpAdapter {
  async enviarOtp(_destino: string, _codigo: string, _contexto: { actaId: string; firmaId: string }): Promise<ResultadoEnvioOtp> {
    return { enviado: false, simulado: true, proveedor: 'MANUAL_DEV', error: 'Entrega manual de desarrollo: no es una entrega real.' };
  }
}

/** Canal pendiente: error EXPLÍCITO, no un booleano perdido en el flujo. */
export class TransportePendienteAdapter implements TransporteOtpAdapter {
  async enviarOtp(_destino: string, _codigo: string, _contexto: { actaId: string; firmaId: string }): Promise<ResultadoEnvioOtp> {
    return {
      enviado: false,
      proveedor: 'PENDIENTE',
      error: 'OTP_ENTREGA_NO_DISPONIBLE: canal de entrega pendiente de configurar (decisión P-01).',
    };
  }
}

export interface ResultadoEntregaOtp {
  enviado: boolean;
  proveedor: string;
  externalId?: string;
}

/**
 * Orquesta la entrega. Si el adaptador no acredita la entrega LANZA un error
 * tipado con motivo accionable: el llamador no puede seguir como si el
 * firmante hubiera recibido el código.
 */
export async function entregarOtpActa(
  adaptador: TransporteOtpAdapter,
  entrada: { destino: string; codigo: string; actaId: string; firmaId: string },
): Promise<ResultadoEntregaOtp> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entrada.destino)) {
    throw new ErrorOtpActa('OTP_DESTINO_INVALIDO', 'El destino del OTP debe ser un correo válido.');
  }
  if (!/^\d{6}$/.test(entrada.codigo)) {
    throw new ErrorOtpActa('OTP_CODIGO_INVALIDO', 'El código debe tener seis dígitos.');
  }
  const resultado = await adaptador.enviarOtp(entrada.destino, entrada.codigo, {
    actaId: entrada.actaId,
    firmaId: entrada.firmaId,
  });
  if (!resultado.enviado || resultado.simulado) {
    throw new ErrorOtpActa(
      'OTP_ENTREGA_NO_DISPONIBLE',
      resultado.error || 'El canal de entrega no ha confirmado el envío del OTP.',
    );
  }
  return { enviado: true, proveedor: resultado.proveedor || 'DESCONOCIDO' };
}
