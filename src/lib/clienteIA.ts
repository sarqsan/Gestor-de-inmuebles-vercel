/**
 * IA · FASE 1 — CLIENTE ÚNICO DE LOS ENDPOINTS DE IA
 * ==================================================
 * Todas las pantallas llaman a la IA por aquí (y nunca con `fetch` directo):
 *
 *   · `Authorization: Bearer <ID token>` de la sesión actual (el servidor
 *     verifica el token y deriva el usuario de él; sin sesión responde 401).
 *   · `Idempotency-Key` nueva por operación: un reenvío accidental de la MISMA
 *     petición no vuelve a ejecutarse (409 en el servidor).
 *
 * El cliente NO decide permisos ni registra nada: la validación y el registro
 * por usuario son del servidor (`server/ia/nucleoIA.ts`). Reutiliza
 * `tokenUsuarioActual` (mismo contrato que la búsqueda de titulares).
 */
import { CABECERA_IDEMPOTENCIA_IA, type RutaOperacionIA } from '../ia/catalogoOperacionesIA';
import { tokenUsuarioActual } from './busquedaTitularesServidor';

export interface OpcionesClienteIA {
  /** Obtención del ID token (inyectable en pruebas). Por defecto, la sesión de Firebase. */
  obtenerToken?: () => Promise<string | null>;
  /** Implementación de fetch (inyectable en pruebas). */
  fetchImpl?: typeof fetch;
  /** Clave de idempotencia explícita (por defecto, una nueva por llamada). */
  claveIdempotencia?: string;
  signal?: AbortSignal;
}

/** Clave de idempotencia única (UUID v4 o, sin `randomUUID`, 128 bits aleatorios en hex). */
export function nuevaClaveIdempotencia(): string {
  const cripto = globalThis.crypto;
  if (cripto && typeof cripto.randomUUID === 'function') return cripto.randomUUID();
  if (cripto && typeof cripto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cripto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('No hay generador criptográfico para la clave de idempotencia de la IA.');
}

function cabecerasPlanas(base?: HeadersInit): Record<string, string> {
  const salida: Record<string, string> = {};
  if (!base) return salida;
  if (typeof Headers !== 'undefined' && base instanceof Headers) {
    base.forEach((valor, nombre) => {
      salida[nombre] = valor;
    });
    return salida;
  }
  if (Array.isArray(base)) {
    for (const [nombre, valor] of base) salida[nombre] = valor;
    return salida;
  }
  return { ...(base as Record<string, string>) };
}

/** Cabeceras de una petición de IA: JSON + identidad (si hay sesión) + idempotencia. */
export async function cabecerasIA(base?: HeadersInit, opciones: OpcionesClienteIA = {}): Promise<Record<string, string>> {
  const cabeceras = cabecerasPlanas(base);
  if (!Object.keys(cabeceras).some((nombre) => nombre.toLowerCase() === 'content-type')) {
    cabeceras['Content-Type'] = 'application/json';
  }
  const token = await (opciones.obtenerToken ?? tokenUsuarioActual)();
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  cabeceras[CABECERA_IDEMPOTENCIA_IA] = opciones.claveIdempotencia ?? nuevaClaveIdempotencia();
  return cabeceras;
}

/** POST JSON a un endpoint de IA del catálogo. Devuelve la `Response` tal cual (la pantalla decide). */
export async function solicitarIA(
  ruta: RutaOperacionIA,
  cuerpo: unknown,
  opciones: OpcionesClienteIA = {},
): Promise<Response> {
  const ejecutar = opciones.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  return ejecutar(ruta, {
    method: 'POST',
    headers: await cabecerasIA(undefined, opciones),
    body: JSON.stringify(cuerpo),
    signal: opciones.signal,
  });
}

/**
 * `fetch` con identidad e idempotencia y la MISMA firma que `fetch`, para los
 * adaptadores que ya reciben un `fetchImpl` (proveedor remoto del asistente).
 */
export function crearFetchIA(opciones: Omit<OpcionesClienteIA, 'claveIdempotencia' | 'signal'> = {}): typeof fetch {
  const ejecutar = opciones.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  return (async (input: RequestInfo | URL, init?: RequestInit) =>
    ejecutar(input, { ...init, headers: await cabecerasIA(init?.headers, opciones) })) as typeof fetch;
}

export const fetchIA: typeof fetch = crearFetchIA();
