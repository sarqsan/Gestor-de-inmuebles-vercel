/** Normalizadores P3: almacenan referencias mínimas; no guardan filas crudas ni IBAN completo. */
import type { MovimientoBancario, OrigenFormatoBancario } from '../../types/conciliacion';
import type { MovimientoCsvNormalizado } from './csvParser';
import type { MovimientoOfxRaw } from './ofxParser';
import type { MovimientoMt940Raw } from './mt940Parser';
import type { MovimientoNorma43Raw } from './norma43Parser';
import { cuentaRefBancaria, enmascararCuentaBancaria, huellaEstable, redactarTextoBancario } from './validacionExtracto';

export interface OpcionesNormalizacionBancaria {
  divisa?: string;
  cuenta?: string;
  cuentaRef?: string;
  importadoPor?: string;
}

function textoClave(valor?: string): string {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function generarHashIdempotencia(
  fecha: string,
  importe: number,
  concepto: string,
  referencia?: string,
  identificador?: string,
  propietarioId = '',
  cuentaRef = 'cuenta-no-indicada',
  divisa = 'EUR',
): string {
  const base = identificador
    ? `${propietarioId}|${cuentaRef}|ID|${textoClave(identificador)}`
    : `${propietarioId}|${cuentaRef}|${divisa}|${fecha}|${Number(importe).toFixed(2)}|${textoClave(referencia)}|${textoClave(concepto)}`;
  return huellaEstable(base);
}

function identidadCuenta(cuenta?: string, cuentaFallback?: string, cuentaRef?: string): { cuentaRef?: string; cuentaIbanEnmascarado?: string } {
  const valor = cuenta || cuentaFallback;
  if (!valor && !cuentaRef) return {};
  return {
    ...(cuentaRef || cuentaRefBancaria(valor) ? { cuentaRef: cuentaRef || cuentaRefBancaria(valor) } : {}),
    ...(valor ? { cuentaIbanEnmascarado: enmascararCuentaBancaria(valor) } : {}),
  };
}

function completarMovimiento(args: {
  idImportacion: string;
  propietarioId: string;
  fechaImportacion: string;
  origen: OrigenFormatoBancario;
  fecha: string;
  fechaValor?: string;
  importe: number;
  concepto: string;
  conceptoOriginal?: string;
  referencia?: string;
  identificador?: string;
  saldo?: number;
  divisa?: string;
  cuenta?: string;
  cuentaIban?: string;
  cuentaRef?: string;
  fila?: number;
  importadoPor?: string;
}): MovimientoBancario {
  const cuenta = identidadCuenta(args.cuenta, args.cuentaIban, args.cuentaRef);
  const tipo = args.importe >= 0 ? 'INGRESO' : 'GASTO';
  const concepto = redactarTextoBancario(args.concepto.trim(), 500);
  const referenciaSegura = redactarTextoBancario(args.referencia, 180);
  const identificadorSeguro = args.identificador ? `idb_${huellaEstable(textoClave(args.identificador))}` : undefined;
  const hash = generarHashIdempotencia(
    args.fecha, args.importe, concepto, referenciaSegura, args.identificador,
    args.propietarioId, cuenta.cuentaRef || 'cuenta-no-indicada', args.divisa || 'EUR',
  );
  return {
    idImportacion: args.idImportacion,
    idMovimiento: `mov_${hash}`,
    fechaOperacion: args.fecha,
    ...(args.fechaValor ? { fechaValor: args.fechaValor } : {}),
    importe: args.importe,
    tipo,
    concepto,
    conceptoOriginal: redactarTextoBancario(args.conceptoOriginal || concepto, 500),
    ...(referenciaSegura ? { referencia: referenciaSegura } : {}),
    ...(identificadorSeguro ? { identificadorBanco: identificadorSeguro } : {}),
    ...(args.saldo !== undefined ? { saldo: args.saldo } : {}),
    origen: args.origen,
    propietarioId: args.propietarioId,
    ...cuenta,
    ...(args.divisa ? { divisa: args.divisa } : {}),
    ...(Number.isInteger(args.fila) ? { filaOrigen: args.fila } : {}),
    estadoValidacion: concepto || args.referencia || args.identificador ? 'VALIDO' : 'REQUIERE_REVISION',
    metadatosOriginales: {
      ...(Number.isInteger(args.fila) ? { filaOrigen: args.fila as number } : {}),
      divisa: args.divisa || null,
    },
    hashIdempotencia: hash,
    fechaImportacion: args.fechaImportacion,
    ...(args.importadoPor ? { importadoPor: args.importadoPor } : {}),
  };
}

export function normalizarDesdeCSV(
  movimientos: MovimientoCsvNormalizado[],
  idImportacion: string,
  propietarioId: string,
  fechaImportacion: string,
  cuentaIban?: string,
  importadoPor?: string,
  opciones: OpcionesNormalizacionBancaria = {},
): MovimientoBancario[] {
  return movimientos.map((m) => completarMovimiento({
    idImportacion, propietarioId, fechaImportacion, origen: 'CSV', fecha: m.fecha,
    fechaValor: m.fechaValor, importe: m.importe, concepto: m.concepto,
    referencia: m.referencia, identificador: m.identificador, saldo: m.saldo,
    divisa: m.divisa || opciones.divisa, cuenta: m.cuenta || opciones.cuenta, cuentaRef: opciones.cuentaRef,
    cuentaIban, fila: m.fila, importadoPor: opciones.importadoPor || importadoPor,
  }));
}

export function normalizarDesdeOFX(
  movimientos: MovimientoOfxRaw[],
  idImportacion: string,
  propietarioId: string,
  fechaImportacion: string,
  cuentaIban?: string,
  importadoPor?: string,
  opciones: OpcionesNormalizacionBancaria = {},
): MovimientoBancario[] {
  return movimientos.map((m) => {
    const concepto = `${m.nombre || ''} ${m.memo || ''}`.trim();
    return completarMovimiento({
      idImportacion, propietarioId, fechaImportacion, origen: 'OFX', fecha: m.fecha,
      importe: m.importe, concepto, referencia: m.referencia, identificador: m.fitid,
      saldo: m.saldo, divisa: m.divisa || opciones.divisa, cuenta: opciones.cuenta, cuentaRef: opciones.cuentaRef,
      cuentaIban, fila: m.fila, importadoPor: opciones.importadoPor || importadoPor,
    });
  });
}

export function normalizarDesdeMT940(
  movimientos: MovimientoMt940Raw[],
  idImportacion: string,
  propietarioId: string,
  fechaImportacion: string,
  cuentaIban?: string,
  importadoPor?: string,
  opciones: OpcionesNormalizacionBancaria = {},
): MovimientoBancario[] {
  return movimientos.map((m) => completarMovimiento({
    idImportacion, propietarioId, fechaImportacion, origen: 'MT940', fecha: m.fecha,
    fechaValor: m.fechaValor, importe: m.importe, concepto: m.concepto,
    referencia: m.referencia, identificador: m.identificador, saldo: m.saldo,
    divisa: m.divisa || opciones.divisa, cuenta: opciones.cuenta, cuentaRef: opciones.cuentaRef,
    cuentaIban, fila: m.fila, importadoPor: opciones.importadoPor || importadoPor,
  }));
}

export function normalizarDesdeNorma43(
  movimientos: MovimientoNorma43Raw[],
  idImportacion: string,
  propietarioId: string,
  fechaImportacion: string,
  cuentaIban?: string,
  importadoPor?: string,
  opciones: OpcionesNormalizacionBancaria = {},
): MovimientoBancario[] {
  return movimientos.map((m) => {
    const concepto = m.conceptoAdicional.join(' ').trim()
      || [m.conceptoComun, m.conceptoPropio].filter(Boolean).join(' ').trim();
    const referencia = [m.referencia1, m.referencia2].filter(Boolean).join(' ').trim() || m.documento;
    const identificador = [m.referencia1, m.referencia2].filter(Boolean).join('').trim() || undefined;
    return completarMovimiento({
      idImportacion, propietarioId, fechaImportacion, origen: 'NORMA43', fecha: m.fechaOperacion,
      fechaValor: m.fechaValor, importe: m.importe, concepto, referencia, identificador,
      divisa: opciones.divisa, cuenta: opciones.cuenta, cuentaRef: opciones.cuentaRef, cuentaIban,
      fila: m.fila, importadoPor: opciones.importadoPor || importadoPor,
    });
  });
}
