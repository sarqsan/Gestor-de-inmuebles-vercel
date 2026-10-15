/**
 * IA · FASE 2 — CLIENTE DEL PANEL DE ADMINISTRACIÓN DEL GOBIERNO DE IA
 * =====================================================================
 * Único punto de acceso del panel (`src/components/ia/PanelGobiernoIA.tsx`) a
 * las rutas `/api/ia/admin/*`. Mismas reglas que `clienteIA.ts`:
 *
 *   · `Authorization: Bearer <ID token>` de la sesión actual: el servidor
 *     verifica el token y exige perfil veraz ADMINISTRADOR. Este cliente JAMÁS
 *     decide permisos, saldos ni límites: sólo consulta y envía acciones
 *     explícitas del administrador.
 *   · Las acciones (bloqueo y crédito) llevan `Idempotency-Key` nueva: un
 *     reenvío accidental no aplica dos veces el mismo cambio.
 */
import { CABECERA_IDEMPOTENCIA_IA } from '../ia/catalogoOperacionesIA';
import type {
  AjusteResumenIADTO,
  CuentaIADTO,
  OperacionResumenIADTO,
  ResumenPoliticaIA,
} from '../ia/gobiernoIAContrato';
import { tokenUsuarioActual } from './busquedaTitularesServidor';
import { nuevaClaveIdempotencia } from './clienteIA';

export interface OpcionesAdminGobiernoIA {
  obtenerToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export interface ResumenGobiernoIADTO {
  gobierno: { modo: string; errorPolitica?: string };
  politica: ResumenPoliticaIA | null;
  operacionesRecientes: OperacionResumenIADTO[];
}

export interface CuentaGobiernoIADTO {
  uid: string;
  cuenta: CuentaIADTO | null;
  operaciones: OperacionResumenIADTO[];
  ajustes: AjusteResumenIADTO[];
}

/** Resultado normalizado de una acción: nunca lanza por errores HTTP. */
export interface ResultadoAccionAdminIA {
  ok: boolean;
  status: number;
  codigo?: string;
  error?: string;
}

async function cabecerasAdmin(base?: Record<string, string>, opciones: OpcionesAdminGobiernoIA = {}): Promise<Record<string, string>> {
  const cabeceras: Record<string, string> = { 'Content-Type': 'application/json', ...(base ?? {}) };
  const token = await (opciones.obtenerToken ?? tokenUsuarioActual)();
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  return cabeceras;
}

function ejecutar(opciones: OpcionesAdminGobiernoIA): typeof fetch {
  return opciones.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
}

export async function cargarResumenGobiernoIA(opciones: OpcionesAdminGobiernoIA = {}): Promise<ResumenGobiernoIADTO | null> {
  const respuesta = await ejecutar(opciones)('/api/ia/admin/resumen', { headers: await cabecerasAdmin(undefined, opciones) });
  if (!respuesta.ok) return null;
  return (await respuesta.json()) as ResumenGobiernoIADTO;
}

export async function cargarCuentaGobiernoIA(uid: string, opciones: OpcionesAdminGobiernoIA = {}): Promise<CuentaGobiernoIADTO | null> {
  const respuesta = await ejecutar(opciones)(`/api/ia/admin/cuenta/${encodeURIComponent(uid)}`, {
    headers: await cabecerasAdmin(undefined, opciones),
  });
  if (!respuesta.ok) return null;
  return (await respuesta.json()) as CuentaGobiernoIADTO;
}

async function accionAdmin(
  ruta: string,
  cuerpo: unknown,
  opciones: OpcionesAdminGobiernoIA = {},
): Promise<ResultadoAccionAdminIA> {
  const respuesta = await ejecutar(opciones)(ruta, {
    method: 'POST',
    headers: await cabecerasAdmin({ [CABECERA_IDEMPOTENCIA_IA]: nuevaClaveIdempotencia() }, opciones),
    body: JSON.stringify(cuerpo),
  });
  const datos = (await respuesta.json().catch(() => ({}))) as { codigo?: string; error?: string };
  return { ok: respuesta.ok, status: respuesta.status, codigo: datos.codigo, error: datos.error };
}

/** Bloquear (`bloqueado: true`) o desbloquear el uso de IA de un usuario. */
export function bloquearCuentaGobiernoIA(uid: string, bloqueado: boolean, motivo: string, opciones: OpcionesAdminGobiernoIA = {}): Promise<ResultadoAccionAdminIA> {
  return accionAdmin(`/api/ia/admin/cuenta/${encodeURIComponent(uid)}/bloqueo`, { bloqueado, motivo }, opciones);
}

/** Mover el saldo con un importe EXPLÍCITO (positivo o negativo) y motivo. */
export function moverCreditoGobiernoIA(uid: string, creditos: number, motivo: string, opciones: OpcionesAdminGobiernoIA = {}): Promise<ResultadoAccionAdminIA> {
  return accionAdmin(`/api/ia/admin/cuenta/${encodeURIComponent(uid)}/credito`, { creditos, motivo }, opciones);
}
