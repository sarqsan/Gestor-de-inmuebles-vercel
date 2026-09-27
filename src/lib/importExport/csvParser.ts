/**
 * Parser CSV genérico del importador canónico. Capa PURA (sin I/O).
 *
 * Contrato (distinto del parser bancario `src/utils/conciliacion/csvParser.ts`,
 * que es específico de extractos con matching heurístico de columnas y manejo
 * simple de comillas): cabecera obligatoria preservada, delimitador configurable
 * o detectado, comillas RFC-4180 ("" escapado, multilínea), campos vacíos
 * preservados como '', columnas desconocidas preservadas en el registro crudo,
 * errores aislados por fila.
 *
 * Reutiliza de B1/conciliación solo tipado de importes en la fase de mapping
 * (ver `normalizar.ts`); el parseo tabular es propio de este contrato.
 */
import type { FormatoEntrada } from './contrato';
import type { ResultadoParseo } from './jsonParser';

export const CSV_MAX_BYTES_DEFECTO = 25 * 1024 * 1024;
export const CSV_MAX_REGISTROS_DEFECTO = 50_000;
const DELIMITADORES_CANDIDATOS = [',', ';', '\t', '|'] as const;

export interface OpcionesCsv {
  maxBytes?: number;
  maxRegistros?: number;
  /** Delimitador explícito. Si falta, se detecta en la cabecera. */
  delimitador?: string;
  /** Codificación declarada; por defecto UTF-8 con BOM tolerado. */
  encoding?: 'utf-8' | 'windows-1252';
}

export interface ResultadoCsv extends ResultadoParseo<Record<string, string>> {
  delimitadorUsado: string;
  cabecera: string[];
}

function decodificar(entrada: string | Uint8Array, encoding: 'utf-8' | 'windows-1252'): { texto: string; avisos: string[] } {
  if (typeof entrada === 'string') return { texto: entrada, avisos: [] };
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(entrada);
  } catch {
    texto = new TextDecoder('windows-1252').decode(entrada);
    return { texto, avisos: ['bytes no UTF-8: decodificados como windows-1252 (revisar acentos)'] };
  }
  if (encoding === 'windows-1252') {
    return { texto: new TextDecoder('windows-1252').decode(entrada), avisos: ['decodificado como windows-1252 por opción explícita'] };
  }
  return { texto, avisos: [] };
}

function detectarDelimitador(cabecera: string): string {
  let mejor = ',';
  let max = 0;
  for (const d of DELIMITADORES_CANDIDATOS) {
    // Contar fuera de comillas.
    let n = 0;
    let comillas = false;
    for (let i = 0; i < cabecera.length; i++) {
      const c = cabecera[i];
      if (c === '"') {
        if (comillas && cabecera[i + 1] === '"') i++;
        else comillas = !comillas;
      } else if (c === d && !comillas) n++;
    }
    if (n > max) { max = n; mejor = d; }
  }
  return mejor;
}

/** Divide el texto en filas lógicas respetando comillas multilínea. */
function dividirFilas(texto: string, delimitador: string): { filas: string[][]; errores: string[] } {
  const filas: string[][] = [];
  const errores: string[] = [];
  let fila: string[] = [];
  let campo = '';
  let comillas = false;
  let i = 0;
  const pushCampo = () => { fila.push(campo); campo = ''; };
  const pushFila = () => { filas.push(fila); fila = []; };
  while (i < texto.length) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i += 2; continue; }
        comillas = false; i++; continue;
      }
      campo += c; i++; continue;
    }
    if (c === '"') { comillas = true; i++; continue; }
    if (c === delimitador) { pushCampo(); i++; continue; }
    if (c === '\r' && texto[i + 1] === '\n') { pushCampo(); pushFila(); i += 2; continue; }
    if (c === '\n' || c === '\r') { pushCampo(); pushFila(); i++; continue; }
    campo += c; i++;
  }
  if (comillas) errores.push('comilla sin cerrar al final del archivo (última fila importada tal cual)');
  pushCampo();
  pushFila();
  // Eliminar filas totalmente vacías (líneas en blanco).
  return { filas: filas.filter((f) => !(f.length === 1 && f[0] === '')), errores };
}

export function parseCsv(
  entrada: string | Uint8Array,
  opciones: OpcionesCsv = {},
): ResultadoCsv {
  const maxBytes = opciones.maxBytes ?? CSV_MAX_BYTES_DEFECTO;
  const maxRegistros = opciones.maxRegistros ?? CSV_MAX_REGISTROS_DEFECTO;
  const base: ResultadoCsv = {
    formato: 'CSV' as FormatoEntrada, registros: [], avisos: [], errores: [],
    registrosOmitidos: 0, localizaciones: [], delimitadorUsado: ',', cabecera: [],
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
  const { texto, avisos } = decodificar(entrada, opciones.encoding ?? 'utf-8');
  base.avisos.push(...avisos);
  const sinBom = texto.replace(/^﻿/, '');
  if (sinBom !== texto) base.avisos.push('BOM inicial eliminado');
  const primeraLinea = sinBom.split(/\r?\n/)[0] ?? '';
  const delimitador = opciones.delimitador ?? detectarDelimitador(primeraLinea);
  base.delimitadorUsado = delimitador;
  if (!opciones.delimitador) base.avisos.push(`delimitador detectado: '${delimitador === '\t' ? 'TAB' : delimitador}'`);
  const { filas, errores } = dividirFilas(sinBom, delimitador);
  base.errores.push(...errores);
  if (filas.length === 0) {
    base.errores.push('CSV sin filas (ni cabecera)');
    return base;
  }
  const cruda = filas[0];
  if (cruda.every((h) => h.trim() === '')) {
    base.errores.push('cabecera vacía: el CSV exige primera fila con nombres de columna');
    return base;
  }
  // Cabecera: trim; duplicadas se sufijan (aviso, nunca silencioso).
  const vistas = new Map<string, number>();
  base.cabecera = cruda.map((h) => {
    const nombre = h.trim() === '' ? '__sin_nombre__' : h.trim();
    const n = (vistas.get(nombre) ?? 0) + 1;
    vistas.set(nombre, n);
    return n === 1 ? nombre : `${nombre}__${n}`;
  });
  if ([...vistas.values()].some((n) => n > 1)) {
    base.avisos.push('columnas duplicadas en cabecera: se sufijan (__2, __3…) para no mezclar valores');
  }
  const cuerpo = filas.slice(1);
  const efectivas = cuerpo.slice(0, maxRegistros);
  if (cuerpo.length > maxRegistros) {
    base.registrosOmitidos = cuerpo.length - maxRegistros;
    base.avisos.push(`${base.registrosOmitidos} fila(s) omitidas por cota (${maxRegistros}): dividir el archivo para el resto`);
  }
  efectivas.forEach((valores, i) => {
    const numeroFila = i + 2; // + cabecera
    const registro: Record<string, string> = {};
    base.cabecera.forEach((col, j) => {
      registro[col] = j < valores.length ? valores[j] : '';
    });
    if (valores.length < base.cabecera.length) {
      base.avisos.push(`fila ${numeroFila}: ${base.cabecera.length - valores.length} columna(s) ausente(s) → '' (no se inventan)`);
    }
    if (valores.length > base.cabecera.length) {
      for (let k = base.cabecera.length; k < valores.length; k++) {
        registro[`__extra_${k - base.cabecera.length + 1}`] = valores[k];
      }
      base.avisos.push(`fila ${numeroFila}: ${valores.length - base.cabecera.length} valor(es) extra conservados como __extra_N`);
    }
    base.registros.push(registro);
    base.localizaciones.push(`fila ${numeroFila}`);
  });
  return base;
}
