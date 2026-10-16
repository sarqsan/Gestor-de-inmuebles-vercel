/**
 * IA · FASE 9 — CLIENTE DEL ALTA GUIADA DE LA LLAVE PROPIA
 * =========================================================
 * Único acceso del navegador a `/api/ia/llave*` (misma disciplina que
 * `clienteIA.ts` y `adminGobiernoIA.ts`):
 *
 *   · `Authorization: Bearer <ID token>` de la sesión actual; el servidor
 *     verifica el token y deriva el uid. Este cliente no decide nada.
 *   · Las mutaciones (alta, revocación, verificación) llevan una
 *     `Idempotency-Key` nueva: un reenvío accidental no aplica dos veces.
 *   · La llave se envía UNA vez, en el cuerpo del `PUT`, y nunca se guarda en
 *     el navegador (ni en estado persistente, ni en almacenamiento local).
 */
import { CABECERA_IDEMPOTENCIA_IA } from '../ia/catalogoOperacionesIA';
import {
  RUTA_LLAVE_USUARIO_IA,
  RUTA_VERIFICAR_LLAVE_USUARIO_IA,
  type ModoLlavesIA,
  type ModoSinLlaveIA,
  type ModoVerificacionLlaveIA,
  type ResumenLlaveUsuarioIA,
} from '../ia/llavesUsuarioContrato';
import type { ClavePasoAltaGuiada } from '../ia/tutorialLlaveUsuarioIA';
import { tokenUsuarioActual } from './busquedaTitularesServidor';
import { nuevaClaveIdempotencia } from './clienteIA';

export interface OpcionesLlavesUsuarioIA {
  obtenerToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export interface EstadoSubsistemaLlavesDTO {
  modo: ModoLlavesIA;
  sinLlave: ModoSinLlaveIA;
  verificacion: ModoVerificacionLlaveIA;
}

export interface EstadoLlaveUsuarioDTO {
  llaves: EstadoSubsistemaLlavesDTO;
  llave: ResumenLlaveUsuarioIA;
  altaGuiada: Array<{ numero: number; clave: ClavePasoAltaGuiada; titulo: string; enlace?: string }>;
}

/** Resultado normalizado: nunca lanza por errores HTTP. */
export interface ResultadoLlaveUsuarioIA {
  ok: boolean;
  status: number;
  estado?: string;
  codigo?: string;
  error?: string;
  detalle?: string;
  llave?: ResumenLlaveUsuarioIA;
  llaves?: EstadoSubsistemaLlavesDTO;
}

async function cabeceras(opciones: OpcionesLlavesUsuarioIA, conIdempotencia: boolean): Promise<Record<string, string>> {
  const salida: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await (opciones.obtenerToken ?? tokenUsuarioActual)();
  if (token) salida.Authorization = `Bearer ${token}`;
  if (conIdempotencia) salida[CABECERA_IDEMPOTENCIA_IA] = nuevaClaveIdempotencia();
  return salida;
}

function ejecutar(opciones: OpcionesLlavesUsuarioIA): typeof fetch {
  return opciones.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
}

async function leerCuerpo(respuesta: Response): Promise<Record<string, unknown>> {
  try {
    const cuerpo = (await respuesta.json()) as unknown;
    return cuerpo && typeof cuerpo === 'object' ? (cuerpo as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function normalizar(respuesta: Response, cuerpo: Record<string, unknown>): ResultadoLlaveUsuarioIA {
  return {
    ok: respuesta.ok,
    status: respuesta.status,
    ...(typeof cuerpo.estado === 'string' ? { estado: cuerpo.estado } : {}),
    ...(typeof cuerpo.codigo === 'string' ? { codigo: cuerpo.codigo } : {}),
    ...(typeof cuerpo.error === 'string' ? { error: cuerpo.error } : {}),
    ...(typeof cuerpo.detalle === 'string' ? { detalle: cuerpo.detalle } : {}),
    ...(cuerpo.llave && typeof cuerpo.llave === 'object' ? { llave: cuerpo.llave as ResumenLlaveUsuarioIA } : {}),
    ...(cuerpo.llaves && typeof cuerpo.llaves === 'object' ? { llaves: cuerpo.llaves as EstadoSubsistemaLlavesDTO } : {}),
  };
}

/** Estado del subsistema y de la llave del usuario. Devuelve el resultado normalizado también en error (503 sin clave maestra, 401, …). */
export async function cargarEstadoLlaveIA(opciones: OpcionesLlavesUsuarioIA = {}): Promise<{ ok: true; datos: EstadoLlaveUsuarioDTO } | { ok: false; resultado: ResultadoLlaveUsuarioIA }> {
  const respuesta = await ejecutar(opciones)(RUTA_LLAVE_USUARIO_IA, { method: 'GET', headers: await cabeceras(opciones, false) });
  const cuerpo = await leerCuerpo(respuesta);
  if (!respuesta.ok) return { ok: false, resultado: normalizar(respuesta, cuerpo) };
  return { ok: true, datos: cuerpo as unknown as EstadoLlaveUsuarioDTO };
}

/** Alta o sustitución. El valor se envía tal cual lo pegó el usuario; el servidor normaliza y valida. */
export async function registrarLlaveIA(llave: string, opciones: OpcionesLlavesUsuarioIA = {}): Promise<ResultadoLlaveUsuarioIA> {
  const respuesta = await ejecutar(opciones)(RUTA_LLAVE_USUARIO_IA, {
    method: 'PUT',
    headers: await cabeceras(opciones, true),
    body: JSON.stringify({ llave }),
  });
  return normalizar(respuesta, await leerCuerpo(respuesta));
}

export async function revocarLlaveIA(opciones: OpcionesLlavesUsuarioIA = {}): Promise<ResultadoLlaveUsuarioIA> {
  const respuesta = await ejecutar(opciones)(RUTA_LLAVE_USUARIO_IA, { method: 'DELETE', headers: await cabeceras(opciones, true) });
  return normalizar(respuesta, await leerCuerpo(respuesta));
}

export async function verificarLlaveIA(opciones: OpcionesLlavesUsuarioIA = {}): Promise<ResultadoLlaveUsuarioIA> {
  const respuesta = await ejecutar(opciones)(RUTA_VERIFICAR_LLAVE_USUARIO_IA, { method: 'POST', headers: await cabeceras(opciones, true), body: '{}' });
  return normalizar(respuesta, await leerCuerpo(respuesta));
}
