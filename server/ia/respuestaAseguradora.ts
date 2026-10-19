import type { AnalisisRespuestaAseguradoraAI } from '../../src/types.js';
import { esAnalisisRespuestaAseguradoraValido } from '../../src/ia/analisisRespuestaAseguradora.js';

export type ResultadoAnalisisRespuestaAseguradora =
  | { ok: true; datos: AnalisisRespuestaAseguradoraAI }
  | {
      ok: false;
      status: 502 | 503;
      codigo: 'IA_NO_DISPONIBLE' | 'ERROR_PROVEEDOR_IA' | 'RESPUESTA_IA_INVALIDA';
      error: string;
    };

type GeneradorRespuesta = (cliente: unknown, parametros: Record<string, unknown>) => Promise<unknown>;

/** Falla cerrada: sin cliente, error del proveedor o contrato inválido no hay dictamen. */
export async function ejecutarAnalisisRespuestaAseguradora(
  cliente: unknown,
  parametros: Record<string, unknown>,
  generar: GeneradorRespuesta,
): Promise<ResultadoAnalisisRespuestaAseguradora> {
  if (!cliente) {
    return {
      ok: false,
      status: 503,
      codigo: 'IA_NO_DISPONIBLE',
      error: 'El análisis automático no está disponible. El texto se conserva para revisión humana.',
    };
  }

  let respuesta: unknown;
  try {
    respuesta = await generar(cliente, parametros);
  } catch {
    return {
      ok: false,
      status: 502,
      codigo: 'ERROR_PROVEEDOR_IA',
      error: 'No se pudo obtener una respuesta válida del proveedor de IA.',
    };
  }

  let datos: unknown;
  try {
    if (typeof respuesta !== 'object' || respuesta === null || Array.isArray(respuesta)) {
      throw new Error('La respuesta del proveedor no tiene el formato esperado.');
    }
    const texto = (respuesta as { text?: unknown }).text;
    if (typeof texto !== 'string' || !texto.trim()) {
      throw new Error('La respuesta del proveedor no contiene JSON.');
    }
    datos = JSON.parse(texto);
  } catch {
    return {
      ok: false,
      status: 502,
      codigo: 'RESPUESTA_IA_INVALIDA',
      error: 'La IA no devolvió un dictamen válido con el esquema requerido.',
    };
  }

  if (!esAnalisisRespuestaAseguradoraValido(datos)) {
    return {
      ok: false,
      status: 502,
      codigo: 'RESPUESTA_IA_INVALIDA',
      error: 'La IA no devolvió un dictamen válido con el esquema requerido.',
    };
  }

  return { ok: true, datos };
}
