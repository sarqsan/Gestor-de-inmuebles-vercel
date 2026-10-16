/**
 * FASE 6 — CLIENTE DEL SEGUIMIENTO DE INCIDENCIAS
 * ===============================================
 * Único punto de acceso del portal a `/api/incidencias/seguimiento`:
 *   · `leerSeguimientoIncidencia`  → evolución autorizada de una incidencia.
 *   · `sincronizarSeguimientoIncidencia` → pide al SERVIDOR que observe la
 *     incidencia escrita y registre/avise si algo cambió de verdad.
 *
 * El cliente no decide nada: ni quién puede ver, ni qué se avisa, ni a quién.
 * Sólo aporta el id de la incidencia y el token de la sesión; el servidor
 * resuelve autorización, destinatarios y estado real de entrega.
 */
import type { PasoEvolucionIncidencia } from '../seguimiento/incidencias';
import { tokenUsuarioActual } from './busquedaTitularesServidor';

export interface RespuestaSeguimiento {
  ok: boolean;
  pasos?: PasoEvolucionIncidencia[];
  autorizadoComo?: string;
  estado?: 'OK' | 'SIN_CAMBIOS';
  eventos?: Array<{ id: string; tipo: string; creadoEn: string; requiereAtencion: boolean }>;
  reintentos?: number;
  codigo?: string;
  error?: string;
}

async function peticion(
  ruta: string,
  init: RequestInit,
  fetchImpl?: typeof fetch,
): Promise<RespuestaSeguimiento> {
  const ejecutar = fetchImpl ?? fetch;
  const token = await tokenUsuarioActual();
  try {
    const respuesta = await ejecutar(ruta, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    const cuerpo = (await respuesta.json().catch(() => ({}))) as RespuestaSeguimiento;
    if (!respuesta.ok) {
      return { ok: false, codigo: cuerpo.codigo, error: cuerpo.error ?? 'No se ha podido consultar el seguimiento.' };
    }
    return { ...cuerpo, ok: true };
  } catch {
    return { ok: false, error: 'Sin conexión con el servidor de seguimiento.' };
  }
}

/** Lee la evolución autorizada de una incidencia (vacía si aún no hay hilo). */
export async function leerSeguimientoIncidencia(
  incidenciaId: string,
  opciones: { fetchImpl?: typeof fetch } = {},
): Promise<RespuestaSeguimiento> {
  return peticion(
    `/api/incidencias/seguimiento?incidenciaId=${encodeURIComponent(incidenciaId)}`,
    { method: 'GET' },
    opciones.fetchImpl,
  );
}

/**
 * Pide la sincronización del hilo. Idempotente por diseño: si nada ha cambiado
 * el servidor responde `SIN_CAMBIOS` sin escribir ni avisar. `derivacionSolicitada`
 * sólo lo envía el inquilino desde el asistente (Fase 5).
 */
export async function sincronizarSeguimientoIncidencia(
  incidenciaId: string,
  opciones: { derivacionSolicitada?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<RespuestaSeguimiento> {
  return peticion(
    '/api/incidencias/seguimiento/sincronizar',
    {
      method: 'POST',
      body: JSON.stringify({
        incidenciaId,
        ...(opciones.derivacionSolicitada === true ? { derivacionSolicitada: true } : {}),
      }),
    },
    opciones.fetchImpl,
  );
}
