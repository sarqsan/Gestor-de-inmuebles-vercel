import { OtpActa } from '../../types/actas';

const OTP_LENGTH = 6;
const OTP_MAX_INTENTOS = 5;
const OTP_EXPIRACION_MINUTOS = 15;

// Utilidad simple para hash SHA-256 (en browser)
async function hashCodigo(codigo: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codigo);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Fallback si crypto no disponible (Node tests)
function hashCodigoSync(codigo: string): string {
  // Simple hash no criptográfico para tests, en prod se usa crypto.subtle
  let hash = 0;
  for (let i = 0; i < codigo.length; i++) {
    const char = codigo.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `hash_${hash}_${codigo.length}`;
}

export function generarCodigoOtp(): string {
  // 6 dígitos numéricos
  let codigo = '';
  for (let i = 0; i < OTP_LENGTH; i++) {
    codigo += Math.floor(Math.random() * 10).toString();
  }
  return codigo;
}

export async function crearOtpActa(params: {
  actaId: string;
  firmaId: string;
  ownerId: string;
  solicitante?: string;
  canal?: OtpActa['canal'];
}): Promise<{ otp: OtpActa; codigoPlain: string }> {
  const codigoPlain = generarCodigoOtp();
  let codigoHash: string;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      codigoHash = await hashCodigo(codigoPlain);
    } else {
      codigoHash = hashCodigoSync(codigoPlain);
    }
  } catch {
    codigoHash = hashCodigoSync(codigoPlain);
  }

  const ahora = new Date();
  const expiracion = new Date(ahora.getTime() + OTP_EXPIRACION_MINUTOS * 60 * 1000);

  const otp: OtpActa = {
    id: `otp_${params.actaId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    actaId: params.actaId,
    firmaId: params.firmaId,
    ownerId: params.ownerId,
    codigoHash,
    // codigoPlainTemporal solo para entrega inmediata en UI de demostración, se limpia tras uso
    codigoPlainTemporal: codigoPlain,
    fechaCreacion: ahora.toISOString(),
    fechaExpiracion: expiracion.toISOString(),
    intentos: 0,
    maxIntentos: OTP_MAX_INTENTOS,
    usado: false,
    solicitante: params.solicitante,
    canal: params.canal || 'PENDIENTE_PROVEEDOR',
    estado: 'ACTIVO',
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

  let hashIngresado: string;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      hashIngresado = await hashCodigo(codigoIngresado);
    } else {
      hashIngresado = hashCodigoSync(codigoIngresado);
    }
  } catch {
    hashIngresado = hashCodigoSync(codigoIngresado);
  }

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

  // Válido
  return {
    valido: true,
    otpActualizado: {
      ...otp,
      usado: true,
      fechaUso: ahora.toISOString(),
      intentos: otp.intentos + 1,
      estado: 'USADO',
      codigoPlainTemporal: undefined, // limpiar plain tras uso
    },
  };
}

export function esOtpExpirado(otp: OtpActa): boolean {
  return new Date() > new Date(otp.fechaExpiracion);
}

export function esOtpUtilizable(otp: OtpActa): boolean {
  return otp.estado === 'ACTIVO' && !otp.usado && !esOtpExpirado(otp) && otp.intentos < otp.maxIntentos;
}

// Adaptador preparado para transporte externo (PENDIENTE)
export interface TransporteOtpAdapter {
  enviarOtp(destino: string, codigo: string, contexto: { actaId: string; firmaId: string }): Promise<{ enviado: boolean; proveedor?: string; error?: string }>;
}

// Implementación manual/mock para desarrollo, no SMS/email ficticio real
export class TransporteManualAdapter implements TransporteOtpAdapter {
  async enviarOtp(destino: string, codigo: string, contexto: { actaId: string; firmaId: string }) {
    console.log(`[OTP MANUAL] Acta ${contexto.actaId}, Firma ${contexto.firmaId}, Destino ${destino}, Código ${codigo}`);
    return { enviado: true, proveedor: 'MANUAL' };
  }
}

export class TransportePendienteAdapter implements TransporteOtpAdapter {
  async enviarOtp(_destino: string, _codigo: string, _contexto: { actaId: string; firmaId: string }) {
    return { enviado: false, proveedor: 'PENDIENTE', error: 'Transporte externo pendiente de integración' };
  }
}
