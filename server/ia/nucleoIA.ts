/**
 * IA · FASE 1 — NÚCLEO DE IA CENTRALIZADO EN EL SERVIDOR
 * ======================================================
 * Único punto de paso de TODAS las operaciones de IA del ERP (catálogo en
 * `src/ia/catalogoOperacionesIA.ts`). Cada endpoint se monta así:
 *
 *     app.post(ruta, nucleoIA.operacion('ID'), async (req, res) => {
 *       const ai = clienteIA(res);          // cliente del proveedor (o null)
 *       ...
 *     });
 *
 * y el núcleo garantiza, ANTES de ejecutar el manejador:
 *
 *   1. Usuario autenticado: `Authorization: Bearer <ID token de Firebase>`
 *      verificado en el servidor (firma, audiencia, emisor y caducidad). El uid
 *      sale SIEMPRE del token, nunca del cuerpo. Sin token válido → 401 y no se
 *      ejecuta nada.
 *   2. Idempotencia: `Idempotency-Key` obligatoria (400 si falta). El id de la
 *      operación es sha256(uid + clave): la misma clave de dos usuarios son dos
 *      operaciones distintas; la misma clave del mismo usuario es un duplicado
 *      → 409 sin volver a ejecutar ni llamar al proveedor.
 *   3. Registro por usuario: la operación se reserva en `ia_operaciones` antes
 *      de ejecutarse (si el registro falla → 503 y no se ejecuta) y se cierra
 *      con el resultado ANTES de entregar la respuesta.
 *
 * El cliente del proveedor sólo se obtiene a través de `clienteIA(res)`, que
 * está instrumentado por petición (llamadas, modelos, tokens, errores) y que
 * lanza si el endpoint no pasó por el núcleo: no hay ruta para llamar a la IA
 * sin autenticación ni registro.
 *
 * Modos del registro (ver `crearDependenciasNucleoIA`):
 *   · FIRESTORE      — credencial de servicio configurada (producción).
 *   · MEMORIA        — sólo desarrollo local/pruebas, sin credencial.
 *   · NO_CONFIGURADO — producción sin credencial: se exige igualmente la
 *     autenticación, pero `clienteIA` devuelve null (los endpoints responden con
 *     su respaldo heurístico, sin consumo del proveedor) y la respuesta lleva
 *     `X-IA-Registro: no-configurado`. Nunca hay consumo sin traza duradera.
 *
 * Reservado a fases posteriores: créditos y saldo, límites/cuotas por usuario,
 * permisos por rol y operación, y paneles de consumo/administración.
 */
import { createHash } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import {
  CABECERA_IDEMPOTENCIA_IA,
  OPERACIONES_IA,
  PATRON_CLAVE_IDEMPOTENCIA_IA,
  operacionIAPorId,
  type IdOperacionIA,
} from '../../src/ia/catalogoOperacionesIA';
import type { IdentidadVerificada } from '../titularidades/googleBackend';
import { tokenDe } from '../titularidades/manejadorBuscarTitulares';
import type { CierreOperacionIA, RegistroOperacionesIA } from './registroOperacionesIA';

export const CABECERA_ID_OPERACION_IA = 'X-IA-Operacion-Id';
export const CABECERA_REGISTRO_IA = 'X-IA-Registro';

/** Superficie del SDK que usan los endpoints (`ai.models.generateContent`). */
export interface ClienteProveedorIA {
  models: {
    generateContent(params: any): Promise<any>;
  };
}

export type ModoRegistroIA = 'FIRESTORE' | 'MEMORIA' | 'NO_CONFIGURADO';

export type CodigoRechazoIA =
  | 'NO_AUTENTICADO'
  | 'IDEMPOTENCIA_REQUERIDA'
  | 'OPERACION_DUPLICADA'
  | 'REGISTRO_NO_DISPONIBLE'
  | 'ERROR_NUCLEO_IA';

/** Evento de log estructurado (sin token, email, prompts ni cuerpos). */
export interface EventoNucleoIA {
  evento: 'RECHAZADA' | 'SIN_REGISTRO' | 'CIERRE_NO_REGISTRADO';
  operacion: IdOperacionIA;
  codigo?: CodigoRechazoIA;
  codigoHttp?: number;
  operacionId?: string;
  uid?: string;
}

export interface DependenciasNucleoIA {
  /** Verificación del ID token. `null` ⇒ no autenticado. */
  verificarToken: (token: string) => Promise<IdentidadVerificada | null>;
  /** Registro de operaciones; `null` ⇒ modo NO_CONFIGURADO (sin proveedor). */
  registro: RegistroOperacionesIA | null;
  /** Cliente real del proveedor; `null` si no hay clave (los endpoints usan su respaldo). */
  crearClienteProveedor: () => ClienteProveedorIA | null;
  ahora?: () => Date;
  log?: (evento: EventoNucleoIA) => void;
}

export interface EstadoNucleoIA {
  registro: ModoRegistroIA;
  autenticacion: 'TOKEN_FIREBASE';
  operaciones: number;
}

export interface NucleoIA {
  /** Middleware de la operación `id`: autentica, deduplica y registra. */
  operacion(id: IdOperacionIA): RequestHandler;
  /** Estado público (sin secretos) para `/api/health`. */
  estado(): EstadoNucleoIA;
}

interface MetricasProveedor {
  llamadas: number;
  exitosas: number;
  fallidas: number;
  modelos: Set<string>;
  tokensEntrada: number;
  tokensSalida: number;
  tokensRazonamiento: number;
  tokensTotales: number;
  ultimoError?: string;
}

interface ContextoOperacionIA {
  operacion: IdOperacionIA;
  operacionId: string;
  uid: string;
  cliente: ClienteProveedorIA | null;
}

const CLAVE_CONTEXTO_IA = '__nucleoIA';
const MAX_MODELOS_REGISTRADOS = 10;

// ---------------------------------------------------------------------------
// Utilidades puras
// ---------------------------------------------------------------------------

/** Id del registro: determinista por (uid, clave), no enumerable y aislado por usuario. */
export function idOperacionIA(uid: string, claveIdempotencia: string): string {
  const huella = createHash('sha256').update(`${uid}\n${claveIdempotencia}`).digest('hex');
  return `iaop_${huella.slice(0, 40)}`;
}

/** Código normalizado del error del proveedor: nunca se guarda el mensaje crudo. */
export function codigoErrorProveedor(error: unknown): string {
  const e = (error ?? {}) as { status?: unknown; code?: unknown; message?: unknown };
  const numero = [e.status, e.code].find((valor) => typeof valor === 'number');
  if (typeof numero === 'number') return `HTTP_${numero}`;
  const texto = String(e.message ?? error ?? '');
  for (const marca of ['RESOURCE_EXHAUSTED', 'UNAVAILABLE', 'DEADLINE_EXCEEDED', 'PERMISSION_DENIED', 'UNAUTHENTICATED', 'INVALID_ARGUMENT']) {
    if (texto.includes(marca)) return marca;
  }
  const http = /\b([45]\d\d)\b/.exec(texto);
  return http ? `HTTP_${http[1]}` : 'ERROR_PROVEEDOR';
}

function entero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : 0;
}

function metricasVacias(): MetricasProveedor {
  return {
    llamadas: 0,
    exitosas: 0,
    fallidas: 0,
    modelos: new Set<string>(),
    tokensEntrada: 0,
    tokensSalida: 0,
    tokensRazonamiento: 0,
    tokensTotales: 0,
  };
}

function acumularUso(metricas: MetricasProveedor, uso: unknown): void {
  if (!uso || typeof uso !== 'object') return;
  const u = uso as Record<string, unknown>;
  const entrada = entero(u.promptTokenCount);
  const salida = entero(u.candidatesTokenCount);
  const razonamiento = entero(u.thoughtsTokenCount);
  metricas.tokensEntrada += entrada;
  metricas.tokensSalida += salida;
  metricas.tokensRazonamiento += razonamiento;
  metricas.tokensTotales += entero(u.totalTokenCount) || entrada + salida + razonamiento;
}

/** Cliente instrumentado de UNA petición: cuenta llamadas, modelos, tokens y errores. */
function instrumentarCliente(real: ClienteProveedorIA, metricas: MetricasProveedor): ClienteProveedorIA {
  return {
    models: {
      async generateContent(params: any) {
        metricas.llamadas += 1;
        if (params && typeof params.model === 'string' && metricas.modelos.size < MAX_MODELOS_REGISTRADOS) {
          metricas.modelos.add(params.model.slice(0, 80));
        }
        try {
          const respuesta = await real.models.generateContent(params);
          metricas.exitosas += 1;
          acumularUso(metricas, respuesta?.usageMetadata);
          return respuesta;
        } catch (error) {
          metricas.fallidas += 1;
          metricas.ultimoError = codigoErrorProveedor(error);
          throw error;
        }
      },
    },
  };
}

function construirCierre(codigoHttp: number, inicio: Date, fin: Date, metricas: MetricasProveedor): CierreOperacionIA {
  const correcta = codigoHttp < 400;
  const cierre: CierreOperacionIA = {
    estado: correcta ? 'COMPLETADA' : 'FALLIDA',
    codigoHttp,
    finalizadaEn: fin,
    duracionMs: Math.max(0, fin.getTime() - inicio.getTime()),
    origenRespuesta: !correcta ? 'ERROR' : metricas.exitosas > 0 ? 'PROVEEDOR' : 'RESPALDO',
    llamadasProveedor: metricas.llamadas,
    llamadasProveedorFallidas: metricas.fallidas,
    modelos: [...metricas.modelos],
    tokensEntrada: metricas.tokensEntrada,
    tokensSalida: metricas.tokensSalida,
    tokensRazonamiento: metricas.tokensRazonamiento,
    tokensTotales: metricas.tokensTotales,
  };
  if (metricas.ultimoError) cierre.errorProveedor = metricas.ultimoError;
  return cierre;
}

/**
 * Aplaza el `end` real de la respuesta hasta que `alFinalizar` termina: el
 * cliente no recibe la respuesta antes de que la operación quede registrada.
 * Todos los endpoints de IA responden con `res.json`, que termina en `end`.
 */
function aplazarFinHastaRegistrar(res: Response, alFinalizar: () => Promise<void>): void {
  const endOriginal = res.end;
  let pendiente: Promise<void> | null = null;
  const endConRegistro = function (this: Response, ...args: unknown[]) {
    if (!pendiente) pendiente = alFinalizar().catch(() => undefined);
    void pendiente.then(() => {
      (endOriginal as (...a: unknown[]) => unknown).apply(res, args);
    });
    return res;
  };
  res.end = endConRegistro as unknown as Response['end'];
}

function logPorDefecto(evento: EventoNucleoIA): void {
  // Log estructurado (como `[titulares]`): sin token, email, prompts ni cuerpos.
  const linea = `[ia] ${JSON.stringify(evento)}`;
  if (evento.evento === 'RECHAZADA' && evento.codigoHttp === 401) console.info(linea);
  else console.warn(linea);
}

// ---------------------------------------------------------------------------
// Núcleo
// ---------------------------------------------------------------------------

export function crearNucleoIA(deps: DependenciasNucleoIA): NucleoIA {
  const ahora = deps.ahora ?? (() => new Date());
  const log = deps.log ?? logPorDefecto;
  const modo: ModoRegistroIA = deps.registro ? deps.registro.tipo : 'NO_CONFIGURADO';

  return {
    estado: () => ({ registro: modo, autenticacion: 'TOKEN_FIREBASE', operaciones: OPERACIONES_IA.length }),

    operacion(id: IdOperacionIA): RequestHandler {
      const definicion = operacionIAPorId(id);
      if (!definicion) throw new Error(`Operación de IA desconocida: ${id}`);

      return async function middlewareOperacionIA(req: Request, res: Response, next: NextFunction): Promise<void> {
        const rechazar = (
          codigoHttp: number,
          codigo: CodigoRechazoIA,
          mensaje: string,
          extra: Record<string, unknown> = {},
          traza: { uid?: string; operacionId?: string } = {},
        ): void => {
          log({ evento: 'RECHAZADA', operacion: id, codigo, codigoHttp, ...traza });
          res.status(codigoHttp).json({ error: mensaje, codigo, ...extra });
        };

        let contexto: ContextoOperacionIA;
        try {
          const inicio = ahora();

          // 1) Identidad: SOLO la del token verificado en servidor.
          const token = tokenDe(req);
          if (!token) {
            rechazar(401, 'NO_AUTENTICADO', 'Inicia sesión para usar las funciones de IA.');
            return;
          }
          let identidad: IdentidadVerificada | null = null;
          try {
            identidad = await deps.verificarToken(token);
          } catch {
            identidad = null; // nunca se falla abierto
          }
          if (!identidad?.uid) {
            rechazar(401, 'NO_AUTENTICADO', 'La sesión no es válida o ha caducado. Vuelve a iniciar sesión.');
            return;
          }
          const uid = identidad.uid;

          // 2) Idempotencia.
          const clave = req.get(CABECERA_IDEMPOTENCIA_IA) ?? '';
          if (!PATRON_CLAVE_IDEMPOTENCIA_IA.test(clave)) {
            rechazar(
              400,
              'IDEMPOTENCIA_REQUERIDA',
              `Falta la cabecera ${CABECERA_IDEMPOTENCIA_IA} o no es válida (8-128 caracteres: letras, números, _ - : .).`,
              {},
              { uid },
            );
            return;
          }
          const operacionId = idOperacionIA(uid, clave);
          res.setHeader(CABECERA_ID_OPERACION_IA, operacionId);

          // 3) Registro por usuario.
          const registro = deps.registro;
          if (!registro) {
            // Producción sin credencial de servicio: sin traza duradera NO hay consumo
            // del proveedor; el endpoint responde con su respaldo heurístico.
            res.setHeader(CABECERA_REGISTRO_IA, 'no-configurado');
            log({ evento: 'SIN_REGISTRO', operacion: id, operacionId, uid });
            contexto = { operacion: id, operacionId, uid, cliente: null };
          } else {
            let reserva;
            try {
              reserva = await registro.reservar({ id: operacionId, uid, operacion: id, ruta: definicion.ruta, iniciadaEn: inicio });
            } catch {
              rechazar(
                503,
                'REGISTRO_NO_DISPONIBLE',
                'No se ha podido registrar la operación de IA, así que no se ha ejecutado. Inténtalo de nuevo en unos segundos.',
                {},
                { uid, operacionId },
              );
              return;
            }
            if (reserva.estado === 'DUPLICADA') {
              rechazar(
                409,
                'OPERACION_DUPLICADA',
                'Esta operación de IA ya se recibió con la misma clave de idempotencia; no se vuelve a ejecutar.',
                { operacionId, estadoPrevio: reserva.previa?.estado ?? null },
                { uid, operacionId },
              );
              return;
            }
            const metricas = metricasVacias();
            const real = deps.crearClienteProveedor();
            contexto = { operacion: id, operacionId, uid, cliente: real ? instrumentarCliente(real, metricas) : null };
            aplazarFinHastaRegistrar(res, async () => {
              const codigoHttp = res.statusCode;
              try {
                await registro.completar(operacionId, construirCierre(codigoHttp, inicio, ahora(), metricas));
              } catch {
                // La operación YA se ejecutó y quedó reservada (EN_CURSO): se entrega la
                // respuesta y el fallo de cierre queda en el log del servidor.
                log({ evento: 'CIERRE_NO_REGISTRADO', operacion: id, operacionId, uid, codigoHttp });
              }
            });
          }
          res.locals[CLAVE_CONTEXTO_IA] = contexto;
        } catch {
          if (!res.headersSent) {
            rechazar(500, 'ERROR_NUCLEO_IA', 'Error interno al preparar la operación de IA.');
          }
          return;
        }
        next();
      };
    },
  };
}

/**
 * Cliente del proveedor para la operación en curso (instrumentado) o `null`
 * si no hay clave o el registro no está configurado. Lanza si el endpoint no
 * se montó con `nucleoIA.operacion(...)`: fallo cerrado, nunca IA sin núcleo.
 */
export function clienteIA(res: Response): ClienteProveedorIA | null {
  const contexto = res.locals?.[CLAVE_CONTEXTO_IA] as ContextoOperacionIA | undefined;
  if (!contexto) {
    throw new Error('Llamada de IA fuera del núcleo: monta el endpoint con nucleoIA.operacion(...).');
  }
  return contexto.cliente;
}

/** Cliente real de Gemini (antes `getGeminiClient` en server.ts). `null` sin clave. */
export function crearClienteGemini(apiKey: string | undefined = process.env.GEMINI_API_KEY): ClienteProveedorIA | null {
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Llamada al proveedor con reintento ante errores transitorios (503 alta
 * demanda, 429 límite). Trasladada sin cambios desde server.ts; cada intento
 * cuenta como llamada en el registro de la operación.
 */
export async function generateGeminiWithRetry(ai: any, params: any, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err: any) {
      const errStr = String(err?.message || err);
      const isTransient =
        err?.status === 503 ||
        err?.code === 503 ||
        err?.status === 429 ||
        err?.code === 429 ||
        errStr.includes('503') ||
        errStr.includes('429') ||
        errStr.includes('UNAVAILABLE') ||
        errStr.includes('high demand') ||
        errStr.includes('RESOURCE_EXHAUSTED');

      if (isTransient && attempt < maxRetries) {
        // Short pause before retrying
        await new Promise((resolve) => setTimeout(resolve, 800));
        continue;
      }
      throw err;
    }
  }
}
