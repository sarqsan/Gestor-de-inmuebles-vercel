/**
 * Import Engine — desacoplado, maneja CSV, OFX, MT940, Norma43
 * Arquitectura: parser → normalizador → motor conciliación
 */

import { MovimientoBancario, ImportacionBancaria, OrigenFormatoBancario } from '../../types/conciliacion';
import { parseCSV, normalizarMovimientosCSV, CsvMapping } from './csvParser';
import { parseOFX } from './ofxParser';
import { parseMT940 } from './mt940Parser';
import { parseNorma43 } from './norma43Parser';
import { normalizarDesdeCSV, normalizarDesdeOFX, normalizarDesdeMT940, normalizarDesdeNorma43 } from './normalizador';
import { detectarDuplicados, generarIdImportacion } from './idempotencia';

export interface ResultadoImportacion {
  importacion: ImportacionBancaria;
  movimientos: MovimientoBancario[];
  nuevos: MovimientoBancario[];
  duplicados: MovimientoBancario[];
  errores: string[];
}

export function importarDesdeCSV(
  contenido: string,
  propietarioId: string,
  existentes: MovimientoBancario[],
  mapping?: CsvMapping,
  nombreFichero?: string,
  cuentaIban?: string,
  importadoPor?: string
): ResultadoImportacion {
  const idImportacion = generarIdImportacion(propietarioId, 'CSV', new Date().toISOString(), nombreFichero);
  const fechaImportacion = new Date().toISOString();

  const parsed = parseCSV(contenido, mapping);
  const normalizado = normalizarMovimientosCSV(parsed.movimientosRaw, mapping);

  const errores = [...parsed.errores, ...normalizado.errores];
  const movimientosNorm = normalizarDesdeCSV(normalizado.movimientos, idImportacion, propietarioId, fechaImportacion, cuentaIban, importadoPor);

  const idemp = detectarDuplicados(movimientosNorm, existentes);

  const importacion: ImportacionBancaria = {
    id: idImportacion,
    propietarioId,
    origen: 'CSV',
    fechaImportacion,
    importadoPor,
    nombreFichero,
    totalMovimientos: movimientosNorm.length,
    nuevos: idemp.nuevos.length,
    duplicados: idemp.duplicados.length,
    errores: errores.length,
    cuentaIban,
    estado: errores.length>0 && idemp.nuevos.length===0 ? 'ERROR' : errores.length>0 ? 'PARCIAL' : 'COMPLETADA',
  };

  return {
    importacion,
    movimientos: movimientosNorm,
    nuevos: idemp.nuevos,
    duplicados: idemp.duplicados,
    errores,
  };
}

export function importarDesdeOFX(
  contenido: string,
  propietarioId: string,
  existentes: MovimientoBancario[],
  nombreFichero?: string,
  cuentaIban?: string,
  importadoPor?: string
): ResultadoImportacion {
  const idImportacion = generarIdImportacion(propietarioId, 'OFX', new Date().toISOString(), nombreFichero);
  const fechaImportacion = new Date().toISOString();

  const parsed = parseOFX(contenido);
  const movimientosNorm = normalizarDesdeOFX(parsed.movimientos, idImportacion, propietarioId, fechaImportacion, cuentaIban, importadoPor);

  const idemp = detectarDuplicados(movimientosNorm, existentes);

  const importacion: ImportacionBancaria = {
    id: idImportacion,
    propietarioId,
    origen: 'OFX',
    fechaImportacion,
    importadoPor,
    nombreFichero,
    totalMovimientos: movimientosNorm.length,
    nuevos: idemp.nuevos.length,
    duplicados: idemp.duplicados.length,
    errores: parsed.errores.length,
    cuentaIban,
    saldoFinal: parsed.saldoFinal,
    estado: parsed.errores.length>0 && idemp.nuevos.length===0 ? 'ERROR' : parsed.errores.length>0 ? 'PARCIAL' : 'COMPLETADA',
  };

  return {
    importacion,
    movimientos: movimientosNorm,
    nuevos: idemp.nuevos,
    duplicados: idemp.duplicados,
    errores: parsed.errores,
  };
}

export function importarDesdeMT940(
  contenido: string,
  propietarioId: string,
  existentes: MovimientoBancario[],
  nombreFichero?: string,
  importadoPor?: string
): ResultadoImportacion {
  const idImportacion = generarIdImportacion(propietarioId, 'MT940', new Date().toISOString(), nombreFichero);
  const fechaImportacion = new Date().toISOString();

  const parsed = parseMT940(contenido);
  const movimientosNorm = normalizarDesdeMT940(parsed.movimientos, idImportacion, propietarioId, fechaImportacion, parsed.iban, importadoPor);

  const idemp = detectarDuplicados(movimientosNorm, existentes);

  const importacion: ImportacionBancaria = {
    id: idImportacion,
    propietarioId,
    origen: 'MT940',
    fechaImportacion,
    importadoPor,
    nombreFichero,
    totalMovimientos: movimientosNorm.length,
    nuevos: idemp.nuevos.length,
    duplicados: idemp.duplicados.length,
    errores: parsed.errores.length,
    cuentaIban: parsed.iban,
    saldoInicial: parsed.saldoInicial,
    saldoFinal: parsed.saldoFinal,
    estado: parsed.errores.length>0 && idemp.nuevos.length===0 ? 'ERROR' : parsed.errores.length>0 ? 'PARCIAL' : 'COMPLETADA',
  };

  return {
    importacion,
    movimientos: movimientosNorm,
    nuevos: idemp.nuevos,
    duplicados: idemp.duplicados,
    errores: parsed.errores,
  };
}

export function importarDesdeNorma43(
  contenido: string,
  propietarioId: string,
  existentes: MovimientoBancario[],
  nombreFichero?: string,
  cuentaIban?: string,
  importadoPor?: string
): ResultadoImportacion {
  const idImportacion = generarIdImportacion(propietarioId, 'NORMA43', new Date().toISOString(), nombreFichero);
  const fechaImportacion = new Date().toISOString();

  const parsed = parseNorma43(contenido);
  const movimientosNorm = normalizarDesdeNorma43(parsed.movimientos, idImportacion, propietarioId, fechaImportacion, parsed.iban || cuentaIban, importadoPor);

  const idemp = detectarDuplicados(movimientosNorm, existentes);

  const importacion: ImportacionBancaria = {
    id: idImportacion,
    propietarioId,
    origen: 'NORMA43',
    fechaImportacion,
    importadoPor,
    nombreFichero,
    totalMovimientos: movimientosNorm.length,
    nuevos: idemp.nuevos.length,
    duplicados: idemp.duplicados.length,
    errores: parsed.errores.length,
    cuentaIban: parsed.iban || cuentaIban,
    fechaExtractoDesde: parsed.fechaInicial,
    fechaExtractoHasta: parsed.fechaFinal,
    estado: parsed.errores.length>0 && idemp.nuevos.length===0 ? 'ERROR' : parsed.errores.length>0 ? 'PARCIAL' : 'COMPLETADA',
  };

  return {
    importacion,
    movimientos: movimientosNorm,
    nuevos: idemp.nuevos,
    duplicados: idemp.duplicados,
    errores: parsed.errores,
  };
}

export function detectarFormato(contenido: string): OrigenFormatoBancario | 'DESCONOCIDO' {
  const trimmed = contenido.trim();
  if (trimmed.startsWith('OFXHEADER') || trimmed.includes('<OFX>') || trimmed.includes('<STMTTRN>')) return 'OFX';
  if (trimmed.includes(':20:') && trimmed.includes(':61:')) return 'MT940';
  if (/^11/.test(trimmed) || trimmed.split('\n').some(l=>l.startsWith('11') && l.length>=40)) return 'NORMA43';
  // CSV: tiene comas o punto y coma y primera línea con headers
  const firstLine = trimmed.split('\n')[0];
  if (firstLine && (firstLine.includes(',') || firstLine.includes(';') || firstLine.includes('\t'))) return 'CSV';
  return 'DESCONOCIDO';
}
