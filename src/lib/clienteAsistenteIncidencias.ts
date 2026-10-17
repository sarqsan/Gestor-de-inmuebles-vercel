/**
 * IA · FASE 5 — CLIENTE DEL ASISTENTE DE INCIDENCIAS PARA INQUILINOS
 * ==================================================================
 * Único punto de acceso del portal a `POST /api/asistente/incidencias-inquilino`.
 * Reutiliza el cliente único de IA (`solicitarIA`): ID token de la sesión,
 * `Idempotency-Key` nueva por análisis y respuesta normalizada.
 *
 * El cliente NO decide alcance, permisos, categorías ni seguridad: sólo envía
 * la descripción, las respuestas aclaratorias y (opcionalmente) el identificador
 * de la incidencia o del contrato. El servidor es quien resuelve en fuentes
 * autorizadas qué contrato, inmueble e incidencia se analizan.
 */
import type { DiagnosticoIncidenciaIA, RespuestaAclaratoriaIA } from '../ia/asistenteIncidenciasIA';
import { solicitarIA, type OpcionesClienteIA } from './clienteIA';

export interface PeticionAsistenteIncidencias {
  contratoId?: string;
  incidenciaId?: string;
  descripcion?: string;
  categoria?: string;
  respuestas?: RespuestaAclaratoriaIA[];
}

export interface AlcanceAsistenteIncidencias {
  contratoId: string;
  inmuebleId: string;
  incidenciaId: string | null;
}

export type ResultadoAsistenteIncidencias =
  | {
      estado: 'OK';
      diagnostico: DiagnosticoIncidenciaIA;
      origenRespuesta: 'DETERMINISTA' | 'PROVEEDOR';
      avisos: string[];
      alcance: AlcanceAsistenteIncidencias;
      /** Cabecera X-IA-Llave-Usuario del servidor: 'ausente' = sin llave propia registrada (respaldo por reglas). */
      llaveUsuario: 'activa' | 'ausente' | 'no-configurado' | null;
    }
  | { estado: 'ERROR'; status: number; codigo?: string; error: string };

/** Mensajes de usuario por código de rechazo (nunca se muestra el código crudo). */
const MENSAJES_POR_CODIGO: Record<string, string> = {
  NO_AUTENTICADO: 'Tu sesión ha caducado. Vuelve a iniciar sesión para usar el asistente.',
  IDEMPOTENCIA_REQUERIDA: 'No se ha podido preparar el análisis. Vuelve a intentarlo.',
  OPERACION_DUPLICADA: 'Este análisis ya se había enviado; no se repite.',
  OPERACION_NO_PERMITIDA: 'Tu rol no tiene permiso para este análisis.',
  CUOTA_DIA_EXCEDIDA: 'Has alcanzado el límite diario de análisis. Podrás volver a usarlo mañana.',
  CUOTA_MES_EXCEDIDA: 'Has alcanzado el límite mensual de análisis.',
  SALDO_INSUFICIENTE: 'No hay créditos disponibles para este análisis.',
  CUENTA_BLOQUEADA: 'El acceso al asistente está bloqueado en tu cuenta. Contacta con gestión.',
  APROBACION_COMERCIAL_PENDIENTE: 'El asistente todavía no está activo para los inquilinos.',
  FUENTE_NO_DISPONIBLE: 'No se han podido leer tus datos autorizados. Inténtalo de nuevo más tarde.',
  PERFIL_INQUILINO_REQUERIDO: 'Este asistente sólo está disponible para cuentas de inquilino.',
  SIN_CONTRATO_AUTORIZADO: 'No hay ningún contrato vinculado a tu cuenta.',
  CONTRATO_NO_AUTORIZADO: 'El contrato indicado no está vinculado a tu cuenta.',
  INCIDENCIA_NO_AUTORIZADA: 'La incidencia indicada no pertenece a tus contratos.',
  PETICION_INVALIDA: 'Describe qué ocurre (con algo más de detalle) para poder analizarlo.',
  GOBIERNO_NO_DISPONIBLE: 'El servicio de análisis no está disponible en este momento.',
  REGISTRO_NO_DISPONIBLE: 'El servicio no ha podido registrar la operación; no se ha ejecutado nada.',
};

export function mensajeAsistenteIncidencias(codigo: string | undefined, porDefecto: string): string {
  if (codigo && MENSAJES_POR_CODIGO[codigo]) return MENSAJES_POR_CODIGO[codigo];
  return porDefecto;
}

function leerEstadoLlaveUsuario(respuesta: Response): 'activa' | 'ausente' | 'no-configurado' | null {
  const valor = respuesta.headers?.get?.('X-IA-Llave-Usuario');
  return valor === 'activa' || valor === 'ausente' || valor === 'no-configurado' ? valor : null;
}

export async function analizarIncidenciaInquilino(
  peticion: PeticionAsistenteIncidencias,
  opciones: OpcionesClienteIA = {},
): Promise<ResultadoAsistenteIncidencias> {
  let respuesta: Response;
  try {
    respuesta = await solicitarIA('/api/asistente/incidencias-inquilino', peticion, opciones);
  } catch {
    return { estado: 'ERROR', status: 0, error: 'No hay conexión con el asistente. Comprueba tu red e inténtalo de nuevo.' };
  }
  const cuerpo = (await respuesta.json().catch(() => ({}))) as {
    diagnostico?: DiagnosticoIncidenciaIA;
    origenRespuesta?: 'DETERMINISTA' | 'PROVEEDOR';
    avisos?: string[];
    alcance?: AlcanceAsistenteIncidencias;
    codigo?: string;
    error?: string;
  };
  if (!respuesta.ok || !cuerpo.diagnostico || !cuerpo.alcance) {
    return {
      estado: 'ERROR',
      status: respuesta.status,
      ...(cuerpo.codigo ? { codigo: cuerpo.codigo } : {}),
      error: mensajeAsistenteIncidencias(cuerpo.codigo, 'El asistente no ha podido completar el análisis. Inténtalo más tarde.'),
    };
  }
  return {
    estado: 'OK',
    diagnostico: cuerpo.diagnostico,
    origenRespuesta: cuerpo.origenRespuesta === 'PROVEEDOR' ? 'PROVEEDOR' : 'DETERMINISTA',
    avisos: Array.isArray(cuerpo.avisos) ? cuerpo.avisos.filter((a): a is string => typeof a === 'string') : [],
    alcance: cuerpo.alcance,
    llaveUsuario: leerEstadoLlaveUsuario(respuesta),
  };
}
