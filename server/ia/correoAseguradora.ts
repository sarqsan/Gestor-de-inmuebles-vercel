import {
  esBorradorCorreoAseguradoraValido,
  type BorradorCorreoAseguradoraIA,
} from '../../src/ia/borradorCorreoAseguradora.js';

export type ResultadoGeneracionCorreoAseguradora =
  | { ok: true; datos: BorradorCorreoAseguradoraIA }
  | {
      ok: false;
      codigo: 'IA_NO_DISPONIBLE' | 'ERROR_PROVEEDOR_IA' | 'RESPUESTA_IA_INVALIDA';
      error: string;
    };

type GeneradorRespuesta = (cliente: unknown, parametros: Record<string, unknown>) => Promise<unknown>;

/**
 * P7 · Falla cerrada del borrador de correo.
 *
 * Si no hay cliente de IA, el proveedor falla o devuelve un JSON que no cumple
 * el contrato, el resultado NO es un borrador "generado por IA": el llamador
 * debe caer a la plantilla determinista y declararlo explícitamente. Así la
 * interfaz nunca atribuye a la IA un texto que no ha producido.
 */
export async function ejecutarGeneracionCorreoAseguradora(
  cliente: unknown,
  parametros: Record<string, unknown>,
  generar: GeneradorRespuesta,
): Promise<ResultadoGeneracionCorreoAseguradora> {
  if (!cliente) {
    return {
      ok: false,
      codigo: 'IA_NO_DISPONIBLE',
      error: 'El servicio de IA no está disponible; se mantiene la plantilla estándar.',
    };
  }

  let respuesta: unknown;
  try {
    respuesta = await generar(cliente, parametros);
  } catch {
    return {
      ok: false,
      codigo: 'ERROR_PROVEEDOR_IA',
      error: 'El proveedor de IA no respondió; se mantiene la plantilla estándar.',
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
      codigo: 'RESPUESTA_IA_INVALIDA',
      error: 'La IA no devolvió un borrador válido con el esquema requerido; se mantiene la plantilla estándar.',
    };
  }

  if (!esBorradorCorreoAseguradoraValido(datos)) {
    return {
      ok: false,
      codigo: 'RESPUESTA_IA_INVALIDA',
      error: 'La IA no devolvió un borrador válido con el esquema requerido; se mantiene la plantilla estándar.',
    };
  }

  return { ok: true, datos };
}
