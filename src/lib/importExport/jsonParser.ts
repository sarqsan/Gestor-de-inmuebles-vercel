/**
 * Parser JSON del importador canónico. Capa PURA (sin I/O).
 *
 * Acepta: objeto único, array de objetos, estructuras anidadas cuando el
 * llamante declara la ruta (`rutaAnidada`, p. ej. ['data','gastos']).
 * UTF-8. Archivos grandes: procesamiento acotado (límites explícitos, nunca
 * truncado silencioso: lo omitido se cuenta y se avisa).
 */
import type { FormatoEntrada } from './contrato';

export const JSON_MAX_BYTES_DEFECTO = 25 * 1024 * 1024;
export const JSON_MAX_REGISTROS_DEFECTO = 50_000;

export interface ResultadoParseo<TRegistro> {
  formato: FormatoEntrada;
  registros: TRegistro[];
  /** Avisos no fatales (siempre visibles en el informe). */
  avisos: string[];
  /** Errores estructurales del archivo (pueden impedir la importación). */
  errores: string[];
  /** Registros omitidos por cota (nunca silencioso). */
  registrosOmitidos: number;
  /** Localización legible por registro (índice → path). */
  localizaciones: string[];
}

export interface OpcionesJson {
  maxBytes?: number;
  maxRegistros?: number;
  /** Ruta a la lista cuando el array va anidado (p. ej. ['movimientos']). */
  rutaAnidada?: readonly string[];
}

function decodificarUtf8(entrada: string | Uint8Array): { texto: string; avisos: string[] } {
  if (typeof entrada === 'string') return { texto: entrada, avisos: [] };
  try {
    const estricto = new TextDecoder('utf-8', { fatal: true });
    return { texto: estricto.decode(entrada), avisos: [] };
  } catch {
    const tolerante = new TextDecoder('utf-8');
    return {
      texto: tolerante.decode(entrada),
      avisos: ['bytes no UTF-8 válidos: decodificados con reemplazo (U+FFFD); revisar el fichero'],
    };
  }
}

export function parseJson(
  entrada: string | Uint8Array,
  opciones: OpcionesJson = {},
): ResultadoParseo<Record<string, unknown>> {
  const maxBytes = opciones.maxBytes ?? JSON_MAX_BYTES_DEFECTO;
  const maxRegistros = opciones.maxRegistros ?? JSON_MAX_REGISTROS_DEFECTO;
  const base: ResultadoParseo<Record<string, unknown>> = {
    formato: 'JSON', registros: [], avisos: [], errores: [], registrosOmitidos: 0, localizaciones: [],
  };
  const bytes = typeof entrada === 'string' ? new TextEncoder().encode(entrada).length : entrada.length;
  if (bytes > maxBytes) {
    base.errores.push(`archivo de ${bytes} bytes supera la cota de ${maxBytes} (integridad estructural: dividir el archivo)`);
    return base;
  }
  if (bytes === 0) {
    base.errores.push('archivo vacío (0 bytes)');
    return base;
  }
  const { texto, avisos } = decodificarUtf8(entrada);
  base.avisos.push(...avisos);
  let raiz: unknown;
  try {
    raiz = JSON.parse(texto);
  } catch (e) {
    base.errores.push(`JSON inválido: ${e instanceof Error ? e.message : String(e)}`);
    return base;
  }
  if (opciones.rutaAnidada && opciones.rutaAnidada.length > 0) {
    let actual: unknown = raiz;
    for (const paso of opciones.rutaAnidada) {
      if (actual !== null && typeof actual === 'object' && !Array.isArray(actual)) {
        actual = (actual as Record<string, unknown>)[paso];
      } else {
        actual = undefined;
        break;
      }
    }
    if (actual === undefined) {
      base.errores.push(`ruta anidada '${opciones.rutaAnidada.join('.')}' no encontrada en el JSON`);
      return base;
    }
    raiz = actual;
  }
  const lista: unknown[] = Array.isArray(raiz) ? raiz : [raiz];
  if (!Array.isArray(raiz)) base.avisos.push('objeto único: se importa como un solo registro');
  const efectivas = lista.slice(0, maxRegistros);
  if (lista.length > maxRegistros) {
    base.registrosOmitidos = lista.length - maxRegistros;
    base.avisos.push(`${base.registrosOmitidos} registro(s) omitidos por cota (${maxRegistros}): dividir el archivo para el resto`);
  }
  efectivas.forEach((item, i) => {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      base.registros.push(item as Record<string, unknown>);
      base.localizaciones.push(Array.isArray(raiz) ? `registros[${i}]` : 'raiz');
    } else {
      // Registro no objeto: se aísla el fallo, el resto continúa.
      base.errores.push(`registros[${i}]: no es un objeto (tipo ${Array.isArray(item) ? 'array' : typeof item}); registro omitido`);
      base.registrosOmitidos += 1;
    }
  });
  return base;
}
