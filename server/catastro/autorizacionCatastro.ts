/**
 * P0.2.4 — Autorización y cuota de `/api/catastro/consultar`.
 * ===========================================================================
 * Antes, cualquier persona (sin sesión) podía usar el servidor como proxy
 * ilimitado contra el servicio público del Catastro: coste de red, abuso y
 * superficie de SSRF indirecta (la referencia se normaliza, pero el endpoint
 * era abierto). Ahora se exige un ID token de Firebase verificado y se aplica
 * una cuota por usuario + IP.
 *
 * Es un módulo PURO (sin Express ni red): las dependencias se inyectan para
 * poder probar los códigos HTTP reales sin levantar el servidor.
 */
import type { Request } from 'express';
import {
  crearLimitadorVentana,
  claveClientePeticion,
  type LimitadorVentana,
} from '../shared/rateLimit.js';

export interface DependenciasAutorizacionCatastro {
  /** Verificador real: `dependenciasIA.verificarToken`. Devuelve `null` si no válido. */
  verificarToken: (token: string) => Promise<{ uid?: string | null } | null>;
  limitador?: LimitadorVentana;
  ahora?: () => number;
}

export type ResultadoAutorizacionCatastro =
  | { ok: true; uid: string }
  | {
      ok: false;
      status: 401 | 429;
      codigo: 'NO_AUTENTICADO' | 'TOKEN_INVALIDO' | 'DEMASIADAS_PETICIONES';
      error: string;
      reintentarEnSegundos?: number;
    };

export function tokenBearer(req: Pick<Request, 'headers'>): string {
  const cabecera = req.headers?.authorization;
  if (typeof cabecera !== 'string') return '';
  return cabecera.replace(/^Bearer\s+/i, '').trim().slice(0, 4096);
}

export async function autorizarConsultaCatastro(
  req: Pick<Request, 'headers' | 'ip' | 'socket'>,
  deps: DependenciasAutorizacionCatastro,
): Promise<ResultadoAutorizacionCatastro> {
  const token = tokenBearer(req as Pick<Request, 'headers'>);
  if (!token) {
    return { ok: false, status: 401, codigo: 'NO_AUTENTICADO', error: 'Se requiere una sesión autenticada.' };
  }
  const identidad = await deps.verificarToken(token);
  const uid = typeof identidad?.uid === 'string' ? identidad.uid : '';
  if (!uid) {
    return { ok: false, status: 401, codigo: 'TOKEN_INVALIDO', error: 'La sesión no se ha podido verificar.' };
  }
  const limitador = deps.limitador ?? crearLimitadorVentana({
    limite: 20,
    ventanaMs: 60_000,
    ...(deps.ahora ? { ahora: deps.ahora } : {}),
  });
  const clave = `${uid}|${claveClientePeticion(
    req.headers as Record<string, unknown>,
    'catastro',
    req.ip || (req.socket?.remoteAddress ?? ''),
  )}`;
  const cuota = limitador.permitir(clave);
  if (!cuota.permitido) {
    return {
      ok: false,
      status: 429,
      codigo: 'DEMASIADAS_PETICIONES',
      error: 'Demasiadas consultas catastrales. Inténtalo de nuevo en unos minutos.',
      reintentarEnSegundos: cuota.reintentarEnSegundos,
    };
  }
  return { ok: true, uid };
}
