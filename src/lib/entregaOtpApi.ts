/**
 * H-07/H-08 — Cliente de las rutas de OTP de actas (autoridad en servidor).
 * ---------------------------------------------------------------------------
 * El navegador YA NO genera códigos, NO calcula hashes, NO decide intentos y NO
 * elige el buzón de destino: sólo pide «envía el código a este firmante del
 * acta» y «valida este código». El servidor deriva el destino del propio acta,
 * guarda el hash con sal, limita los intentos y acredita la firma.
 */
import { tokenUsuarioActual } from './busquedaTitularesServidor';

export interface ResultadoSolicitudOtpApi {
  ok: boolean;
  enviado: boolean;
  codigo?: string;
  error?: string;
  firmante?: string;
  firmaId?: string;
  destinoEnmascarado?: string;
  expiraEn?: string;
  actaEstado?: string;
}

export interface ResultadoValidacionOtpApi {
  ok: boolean;
  valido: boolean;
  codigo?: string;
  error?: string;
  intentosRestantes?: number;
  firmante?: string;
  firmaId?: string;
  estadoFirma?: string;
  actaCerrada?: boolean;
}

type Respuesta<T> =
  | { exito: true; datos: T }
  | { exito: false; codigo: string; error: string; intentosRestantes?: number };

async function pedir<T>(ruta: string, cuerpo: Record<string, unknown>): Promise<Respuesta<T>> {
  const token = await tokenUsuarioActual();
  if (!token) return { exito: false, codigo: 'NO_AUTENTICADO', error: 'Inicia sesión para firmar actas.' };
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(cuerpo),
    });
  } catch {
    return { exito: false, codigo: 'SIN_CONEXION', error: 'No se ha podido contactar con el servidor.' };
  }
  const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!respuesta.ok || datos.ok !== true) {
    return {
      exito: false,
      codigo: typeof datos.codigo === 'string' ? datos.codigo : 'ERROR_SERVIDOR',
      error: typeof datos.error === 'string' ? datos.error : `El servidor rechazó la operación (HTTP ${respuesta.status}).`,
      ...(typeof datos.intentosRestantes === 'number' ? { intentosRestantes: datos.intentosRestantes } : {}),
    };
  }
  return { exito: true, datos: datos as T };
}

/** Pide al servidor que genere y entregue el código al firmante DEL ACTA. */
export async function solicitarOtpFirma(entrada: {
  actaId: string;
  participanteId: string;
}): Promise<ResultadoSolicitudOtpApi> {
  const respuesta = await pedir<ResultadoSolicitudOtpApi>('/api/actas/otp/solicitar', entrada);
  if ('codigo' in respuesta) {
    return { ok: false, enviado: false, codigo: respuesta.codigo, error: respuesta.error };
  }
  return { ...respuesta.datos, ok: true, enviado: true };
}

/** Valida el código EN EL SERVIDOR; la firma queda acreditada allí si es correcto. */
export async function validarOtpFirmaApi(entrada: {
  actaId: string;
  participanteId: string;
  codigo: string;
}): Promise<ResultadoValidacionOtpApi> {
  const respuesta = await pedir<ResultadoValidacionOtpApi>('/api/actas/otp/validar', entrada);
  if ('codigo' in respuesta) {
    return {
      ok: false,
      valido: false,
      codigo: respuesta.codigo,
      error: respuesta.error,
      intentosRestantes: respuesta.intentosRestantes,
    };
  }
  return { ...respuesta.datos, ok: true, valido: true };
}
