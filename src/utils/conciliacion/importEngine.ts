/** Importación P3: parsear → validar íntegro → deduplicar → previsualizar → confirmar atómicamente. */
import type { ImportacionBancaria, MovimientoBancario, OrigenFormatoBancario, ResultadoFilaImportacion } from '../../types/conciliacion';
import { parseCSV, normalizarMovimientosCSV, type CsvMapping } from './csvParser';
import { parseOFX } from './ofxParser';
import { parseMT940 } from './mt940Parser';
import { normalizarDesdeCSV, normalizarDesdeOFX, normalizarDesdeMT940, normalizarDesdeNorma43 } from './normalizador';
import { detectarDuplicados, generarIdImportacion } from './idempotencia';
import { cuentaRefBancaria, cuentaRefBancariaSegura, DIVISA_BANCARIA_P3, enmascararCuentaBancaria, huellaEstable, MAX_BYTES_EXTRACTO_P3, MAX_MOVIMIENTOS_EXTRACTO_P3, nombreFicheroSeguro, normalizarDivisa, sha256Hex } from './validacionExtracto';

export interface OpcionesImportacionBancaria {
  mapping?: CsvMapping;
  divisaDeclarada?: string;
  cuentaAlias?: string;
  nombreFichero?: string;
  hashFichero?: string;
  importadoPor?: string;
  fechaImportacion?: string;
  intentoId?: string;
  tamanoBytes?: number;
}

export interface ResultadoImportacion {
  importacion: ImportacionBancaria;
  movimientos: MovimientoBancario[];
  nuevos: MovimientoBancario[];
  duplicados: MovimientoBancario[];
  requiereRevision: MovimientoBancario[];
  errores: string[];
  confirmable: boolean;
}

interface ParseoComun {
  movimientos: MovimientoBancario[];
  errores: string[];
  total: number;
  cuenta?: string;
  divisa?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  saldoInicial?: number;
  saldoFinal?: number;
}

function codigoError(error: string): { fila: number; codigo: string } {
  const fila = error.match(/^Fila (\d+):\s*([A-Z0-9_]+)/i);
  const codigo = (fila?.[2] || error.match(/([A-Z][A-Z0-9_]{2,})\s*$/)?.[1] || 'EXTRACTO_INVALIDO').toUpperCase();
  return { fila: fila ? Number(fila[1]) : 0, codigo };
}

function normalizarErrores(errores: string[]): string[] {
  return [...new Set(errores.map((error) => {
    const { fila, codigo } = codigoError(error);
    return fila ? `Fila ${fila}: ${codigo}` : codigo;
  }))];
}

function fechaOrdenada(movimientos: MovimientoBancario[]): { desde?: string; hasta?: string } {
  const fechas = movimientos.map((m) => m.fechaOperacion).filter(Boolean).sort();
  return fechas.length ? { desde: fechas[0], hasta: fechas[fechas.length - 1] } : {};
}

function construirResultado(args: {
  contenido: string;
  formato: OrigenFormatoBancario | 'DESCONOCIDO';
  propietarioId: string;
  existentes: MovimientoBancario[];
  opciones?: OpcionesImportacionBancaria;
  parseo: ParseoComun;
}): ResultadoImportacion {
  const { contenido, formato, propietarioId, existentes, parseo } = args;
  const opciones = args.opciones || {};
  const fechaImportacion = opciones.fechaImportacion || new Date().toISOString();
  const hashFichero = opciones.hashFichero || huellaEstable(contenido);
  const formatoSeguro: OrigenFormatoBancario | 'DESCONOCIDO' = formato;
  const id = generarIdImportacion(propietarioId, formatoSeguro, fechaImportacion, opciones.nombreFichero, hashFichero, opciones.intentoId);
  const errores = normalizarErrores(parseo.errores);
  if ((opciones.tamanoBytes ?? new TextEncoder().encode(contenido).byteLength) > MAX_BYTES_EXTRACTO_P3) errores.push('LIMITE_5MB_POR_EXTRACTO');
  const monedas = new Set(parseo.movimientos.map((m) => normalizarDivisa(m.divisa, parseo.divisa || opciones.divisaDeclarada) || 'SIN_DIVISA'));
  if (monedas.size === 0 && parseo.total > 0) monedas.add(normalizarDivisa(parseo.divisa, opciones.divisaDeclarada) || 'SIN_DIVISA');
  if (monedas.has('SIN_DIVISA')) errores.push('DIVISA_NO_INDICADA');
  if (monedas.size > 1) errores.push('DIVISAS_MEZCLADAS');
  for (const moneda of monedas) if (moneda !== 'SIN_DIVISA' && moneda !== DIVISA_BANCARIA_P3) errores.push('DIVISA_NO_ADMITIDA');
  if (parseo.total === 0 || parseo.movimientos.length === 0) errores.push('EXTRACTO_SIN_MOVIMIENTOS_VALIDOS');
  if (parseo.total > MAX_MOVIMIENTOS_EXTRACTO_P3) errores.push(`LIMITE_${MAX_MOVIMIENTOS_EXTRACTO_P3}_MOVIMIENTOS_POR_IMPORTACION`);
  const cuentas = new Set(parseo.movimientos.map((m) => m.cuentaRef).filter(Boolean));
  if (parseo.total > 0 && cuentas.size === 0) errores.push('CUENTA_NO_IDENTIFICADA_ALIAS_REQUERIDO');
  if (cuentas.size > 1) errores.push('CUENTAS_MEZCLADAS_SEPARAR_EXTRACTOS');

  const idempotencia = detectarDuplicados(parseo.movimientos, existentes);
  const nuevos = idempotencia.nuevos;
  const duplicados = idempotencia.duplicados;
  const requiereRevision = nuevos.filter((m) => m.estadoValidacion === 'REQUIERE_REVISION');
  const filaEstado = new Map<string, ResultadoFilaImportacion['estado']>();
  for (const mov of duplicados) filaEstado.set(`${mov.filaOrigen || 0}|${mov.hashIdempotencia}`, 'DUPLICADO');
  for (const mov of nuevos) filaEstado.set(`${mov.filaOrigen || 0}|${mov.hashIdempotencia}`, mov.estadoValidacion === 'REQUIERE_REVISION' ? 'REQUIERE_REVISION' : 'NUEVO');
  const resultadosMovimientos: ResultadoFilaImportacion[] = parseo.movimientos.map((mov) => ({
    fila: mov.filaOrigen || 0,
    estado: filaEstado.get(`${mov.filaOrigen || 0}|${mov.hashIdempotencia}`) || 'REQUIERE_REVISION',
    idMovimiento: mov.idMovimiento,
    hashIdempotencia: mov.hashIdempotencia,
    fechaOperacion: mov.fechaOperacion,
  }));
  for (const error of errores) {
    const { fila, codigo } = codigoError(error);
    if (fila) resultadosMovimientos.push({ fila, estado: 'ERROR', codigoError: codigo });
  }
  resultadosMovimientos.sort((a, b) => a.fila - b.fila || a.estado.localeCompare(b.estado));
  const rango = fechaOrdenada(parseo.movimientos);
  const divisa = monedas.size === 1 && !monedas.has('SIN_DIVISA') ? [...monedas][0] : undefined;
  const cuenta = parseo.cuenta || opciones.cuentaAlias || parseo.movimientos[0]?.cuentaIbanEnmascarado;
  const estado = errores.length ? 'ERROR' : duplicados.length || requiereRevision.length ? 'PARCIAL' : 'COMPLETADA';
  const importacion: ImportacionBancaria = {
    id,
    propietarioId,
    origen: formatoSeguro,
    fechaImportacion,
    ...(opciones.importadoPor ? { importadoPor: opciones.importadoPor } : {}),
    nombreFichero: nombreFicheroSeguro(opciones.nombreFichero, formatoSeguro),
    totalMovimientos: Math.max(parseo.total, parseo.movimientos.length),
    nuevos: nuevos.length,
    duplicados: duplicados.length,
    errores: errores.length,
    requiereRevision: requiereRevision.length,
    hashFichero,
    ...(divisa ? { divisa } : {}),
    ...(parseo.movimientos[0]?.cuentaRef || cuenta ? { cuentaRef: parseo.movimientos[0]?.cuentaRef || cuentaRefBancaria(cuenta) } : {}),
    ...(cuenta ? { cuentaIbanEnmascarado: parseo.movimientos[0]?.cuentaIbanEnmascarado || enmascararCuentaBancaria(cuenta) } : {}),
    ...(parseo.fechaDesde ? { fechaExtractoDesde: parseo.fechaDesde } : rango.desde ? { fechaExtractoDesde: rango.desde } : {}),
    ...(parseo.fechaHasta ? { fechaExtractoHasta: parseo.fechaHasta } : rango.hasta ? { fechaExtractoHasta: rango.hasta } : {}),
    ...(parseo.saldoInicial !== undefined ? { saldoInicial: parseo.saldoInicial } : {}),
    ...(parseo.saldoFinal !== undefined ? { saldoFinal: parseo.saldoFinal } : {}),
    resultadosMovimientos,
    idsMovimientosNuevos: nuevos.map((m) => m.idMovimiento),
    estado,
  };
  return { importacion, movimientos: parseo.movimientos, nuevos, duplicados, requiereRevision, errores, confirmable: errores.length === 0 && requiereRevision.length === 0 };
}

export async function prepararImportacionBancaria(args: {
  contenido: string;
  formato?: OrigenFormatoBancario | 'DESCONOCIDO';
  propietarioId: string;
  existentes: MovimientoBancario[];
  opciones?: OpcionesImportacionBancaria;
}): Promise<ResultadoImportacion> {
  const formato = args.formato || detectarFormato(args.contenido);
  const opciones = args.opciones || {};
  const bytesContenido = new TextEncoder().encode(args.contenido);
  const hashFichero = opciones.hashFichero || await sha256Hex(
    bytesContenido.buffer.slice(bytesContenido.byteOffset, bytesContenido.byteOffset + bytesContenido.byteLength),
  );
  const opcionesSeguras = { ...opciones, hashFichero };
  const fechaImportacion = opciones.fechaImportacion || new Date().toISOString();
  const id = generarIdImportacion(args.propietarioId, formato, fechaImportacion, opciones.nombreFichero, hashFichero, opciones.intentoId);
  const normalizarContextoBase = { divisa: opciones.divisaDeclarada, cuenta: opciones.cuentaAlias, importadoPor: opciones.importadoPor };
  let parseo: ParseoComun = { movimientos: [], errores: [], total: 0 };

  if (formato === 'CSV') {
    const parsed = parseCSV(args.contenido);
    const normalizado = normalizarMovimientosCSV(parsed.movimientosRaw, opciones.mapping);
    const cuentasCsv = new Set(normalizado.movimientos.map((m) => String(m.cuenta || '').toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(Boolean));
    if (cuentasCsv.size > 1) normalizado.errores.push('CUENTAS_MEZCLADAS_SEPARAR_EXTRACTOS');
    const cuentaFila = normalizado.movimientos.map((m) => m.cuenta).find(Boolean) || opciones.cuentaAlias;
    const cuentaRef = await cuentaRefBancariaSegura(cuentaFila);
    const movimientos = normalizarDesdeCSV(normalizado.movimientos, id, args.propietarioId, fechaImportacion,
      undefined, opciones.importadoPor, { ...normalizarContextoBase, cuenta: cuentaFila, cuentaRef });
    parseo = {
      movimientos,
      errores: [...parsed.errores, ...normalizado.errores],
      total: parsed.movimientosRaw.length + parsed.errores.length,
    };
  } else if (formato === 'OFX') {
    const parsed = parseOFX(args.contenido);
    const cuentaRef = await cuentaRefBancariaSegura(parsed.cuenta || opciones.cuentaAlias);
    const movimientos = normalizarDesdeOFX(parsed.movimientos, id, args.propietarioId, fechaImportacion,
      parsed.cuenta, opciones.importadoPor, { ...normalizarContextoBase, cuentaRef });
    parseo = { movimientos, errores: parsed.errores, total: parsed.movimientos.length + parsed.errores.filter((e) => /^Fila \d+:/i.test(e)).length, cuenta: parsed.cuenta, divisa: parsed.divisa, saldoFinal: parsed.saldoFinal };
  } else if (formato === 'MT940') {
    const parsed = parseMT940(args.contenido);
    const cuentaRef = await cuentaRefBancariaSegura(parsed.iban || opciones.cuentaAlias);
    const movimientos = normalizarDesdeMT940(parsed.movimientos, id, args.propietarioId, fechaImportacion,
      parsed.iban, opciones.importadoPor, { ...normalizarContextoBase, cuentaRef });
    parseo = {
      movimientos, errores: parsed.errores,
      total: parsed.movimientos.length + parsed.errores.filter((e) => /^Fila \d+:/i.test(e)).length,
      cuenta: parsed.iban, divisa: parsed.divisa,
      fechaDesde: parsed.movimientos.map((m) => m.fecha).sort()[0],
      fechaHasta: parsed.movimientos.map((m) => m.fecha).sort().slice(-1)[0],
      saldoInicial: parsed.saldoInicial, saldoFinal: parsed.saldoFinal,
    };
  } else if (formato === 'NORMA43') {
    // El parser histórico no acredita offsets AEB ni divisa con una fixture normativa verificable.
    // Fail-closed: no se aceptan ni se guardan movimientos de este formato en P3.
    parseo = { movimientos: [], errores: ['NORMA43_FORMATO_PENDIENTE_VALIDACION'], total: 0 };
  } else {
    parseo = { movimientos: [], errores: ['FORMATO_EXTRACTO_NO_SOPORTADO'], total: 0 };
  }
  if (parseo.total > 0 && !parseo.divisa && !opciones.divisaDeclarada && formato !== 'CSV') {
    parseo.errores.push('DIVISA_NO_INDICADA');
  }
  return construirResultado({ ...args, opciones: opcionesSeguras, formato, parseo });
}

// Wrappers de compatibilidad del GAP6: ahora preparan una vista previa y nunca persisten.
export function importarDesdeCSV(
  contenido: string, propietarioId: string, existentes: MovimientoBancario[], mapping?: CsvMapping,
  nombreFichero?: string, _cuentaIban?: string, importadoPor?: string,
): Promise<ResultadoImportacion> {
  return prepararImportacionBancaria({ contenido, formato: 'CSV', propietarioId, existentes,
    opciones: { mapping, nombreFichero, importadoPor } });
}
export function importarDesdeOFX(
  contenido: string, propietarioId: string, existentes: MovimientoBancario[], nombreFichero?: string,
  _cuentaIban?: string, importadoPor?: string,
): Promise<ResultadoImportacion> {
  return prepararImportacionBancaria({ contenido, formato: 'OFX', propietarioId, existentes,
    opciones: { nombreFichero, importadoPor } });
}
export function importarDesdeMT940(
  contenido: string, propietarioId: string, existentes: MovimientoBancario[], nombreFichero?: string,
  importadoPor?: string,
): Promise<ResultadoImportacion> {
  return prepararImportacionBancaria({ contenido, formato: 'MT940', propietarioId, existentes,
    opciones: { nombreFichero, importadoPor } });
}
export function importarDesdeNorma43(
  contenido: string, propietarioId: string, existentes: MovimientoBancario[], nombreFichero?: string,
  _cuentaIban?: string, importadoPor?: string,
): Promise<ResultadoImportacion> {
  return prepararImportacionBancaria({ contenido, formato: 'NORMA43', propietarioId, existentes,
    opciones: { nombreFichero, importadoPor } });
}

export function detectarFormato(contenido: string): OrigenFormatoBancario | 'DESCONOCIDO' {
  const trimmed = String(contenido ?? '').replace(/^\uFEFF/, '').trimStart();
  if (/^OFXHEADER/i.test(trimmed) || /<OFX(?:\s|>)/i.test(trimmed) || /<STMTTRN>/i.test(trimmed)) return 'OFX';
  if (/:20:/.test(trimmed) && /:61:/.test(trimmed)) return 'MT940';
  if (/^11/.test(trimmed) || trimmed.split(/\r?\n/).some((line) => /^11.{30,}$/.test(line))) return 'NORMA43';
  const primeraLinea = trimmed.split(/\r?\n/, 1)[0];
  if (primeraLinea && /[,;\t|]/.test(primeraLinea)) return 'CSV';
  return 'DESCONOCIDO';
}
