/**
 * GAP 8 — MOTOR DE FACTURA ELECTRÓNICA B2B (RD 238/2026).
 * Capa separada de: RRSIF, VERI*FACTU, factura ordinaria/PDF, conciliación y B2G/FACe.
 *
 * PRINCIPIOS:
 * - Reutiliza la Factura oficial de GAP 7: los importes se COPIAN, nunca se recalculan.
 * - Determinismo: misma factura + formato + versión → misma representación e IDs.
 * - Idempotencia: idempotencyKey estable por facturaId+formato; no duplica envíos ni estados.
 * - Información de pago: SOLO consulta el estado económico existente (Cobros/GAP 6).
 * - Sin APIs/certificados/endpoints inventados.
 */

import { Factura, LineaFactura } from '../types/facturacion';
import {
  EstadoFacturaB2B,
  EventoB2B,
  FacturaElectronicaB2B,
  FormatoFacturaElectronica,
  InformacionPagoB2B,
  ValidacionFacturaB2B,
} from '../types/facturaElectronicaB2B';
import { hashSha256, numeroFacturaFormateado } from './facturacionEngine';

export const FORMATOS_IMPLEMENTADOS: FormatoFacturaElectronica[] = ['CII', 'UBL_2_1', 'FACTURAE_3_2'];
export const FORMATOS_PREPARADOS: FormatoFacturaElectronica[] = ['EDIFACT'];

// ---------------------------------------------------------------------------
// Identidad determinista e idempotencia
// ---------------------------------------------------------------------------

/** idempotencyKey estable: misma factura + formato = misma clave (evita duplicados). */
export function idempotencyKeyB2B(facturaId: string, formato: FormatoFacturaElectronica): string {
  return `b2b_${hashSha256(`${facturaId}|${formato}`)}`;
}

/** ID determinista de la representación electrónica. */
export function idFacturaElectronica(facturaId: string, formato: FormatoFacturaElectronica, versionGeneracion: number): string {
  return `feb_${hashSha256(`${facturaId}|${formato}|v${versionGeneracion}`)}`;
}

/** ID determinista de evento de trazabilidad. */
export function idEventoB2B(febId: string, operacion: EventoB2B['operacion'], estadoNuevo: EstadoFacturaB2B, fecha: string): string {
  return `evb_${hashSha256(`${febId}|${operacion}|${estadoNuevo}|${fecha}`)}`;
}

// ---------------------------------------------------------------------------
// Normalización de datos (dd-mm-aaaa → yyyy-mm-dd) sin inventar valores
// ---------------------------------------------------------------------------

export function fechaIsoDesdeDdma(fecha?: string): string | undefined {
  if (!fecha) return undefined;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(fecha.trim());
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())) return fecha.trim();
  return undefined;
}

function esNifEspanolValido(nif: string): boolean {
  const limpio = nif.trim().toUpperCase();
  // NIF: 8 dígitos + letra; NIE: X/Y/Z + 7 dígitos + letra; CIF: letra + 7 dígitos + dígito/letra
  if (/^\d{8}[A-Z]$/.test(limpio)) return true;
  if (/^[XYZ]\d{7}[A-Z]$/.test(limpio)) return true;
  if (/^[A-HJ-NP-SUVW]\d{7}[\dA-J]$/.test(limpio)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Información de pago: SOLO lectura del estado económico existente
// ---------------------------------------------------------------------------

export interface EstadoEconomicoExistente {
  /** Estado del cobro conciliado (GAP 5/GAP 6): importe cobrado y fecha si existen. */
  importeCobrado?: number;
  fechaCobro?: string;
}

/**
 * Construye la información de pago B2B a partir de Cobros/GAP 6.
 * NO crea un segundo sistema de cobros: refleja el estado económico existente.
 */
export function informacionPagoDesdeCobros(factura: Factura, economico?: EstadoEconomicoExistente): InformacionPagoB2B {
  const info: InformacionPagoB2B = {
    formaPago: factura.formaPago,
    vencimiento: fechaIsoDesdeDdma(factura.vencimiento),
    estadoPago: 'NO_PAGADA',
  };
  if (factura.cobroPeriodoId || factura.movimientoBancarioId) {
    // La conciliación (GAP 6) ya vinculó la factura a un cobro/movimiento real.
    info.estadoPago = 'PAGADA';
    info.importePagado = economico?.importeCobrado ?? factura.importeTotal;
    info.fechaUltimoPago = economico?.fechaCobro;
  } else if (economico?.importeCobrado && economico.importeCobrado > 0) {
    if (economico.importeCobrado >= factura.importeTotal) {
      info.estadoPago = 'PAGADA';
    } else {
      info.estadoPago = 'PARCIALMENTE_PAGADA';
    }
    info.importePagado = economico.importeCobrado;
    info.fechaUltimoPago = economico.fechaCobro;
  }
  return info;
}

// ---------------------------------------------------------------------------
// Generación: Factura (GAP 7) → FacturaElectronicaB2B (representación fiel)
// ---------------------------------------------------------------------------

export interface OpcionesGeneracionB2B {
  formato: FormatoFacturaElectronica;
  generadoPor: string;
  generadoPorId?: string;
  estadoEconomico?: EstadoEconomicoExistente;
  /** Receptor enriquecido para el intercambio (plataforma, contacto). Si no, se usa el de la factura. */
  receptorIntercambio?: Partial<FacturaElectronicaB2B['receptor']>;
  fechaGeneracion?: string; // ISO (determinismo en tests/auditoría)
}

export type ResultadoB2B<T> = { ok: true; valor: T; error?: undefined } | { ok: false; error: string; valor?: undefined };

/**
 * Genera la representación electrónica B2B de una factura GAP 7 existente.
 * - No modifica los importes originales.
 * - Detecta datos obligatorios ausentes (requisitos mínimos del Reglamento de facturación).
 * - Determinista y regenerable (versionGeneracion).
 */
export function generarFacturaElectronicaB2B(
  factura: Factura,
  previas: FacturaElectronicaB2B[],
  opts: OpcionesGeneracionB2B
): ResultadoB2B<FacturaElectronicaB2B> {
  if (!FORMATOS_IMPLEMENTADOS.includes(opts.formato)) {
    return { ok: false, error: `Formato no soportado o pendiente de especificación oficial: ${opts.formato}.` };
  }
  if (factura.clase === 'RECIBIDA') {
    return { ok: false, error: 'Solo las facturas EMITIDAS generan factura electrónica B2B de intercambio.' };
  }

  const validacion = validarFacturaParaB2B(factura);
  if (!validacion.valido) {
    return { ok: false, error: `Errores bloqueantes: ${validacion.erroresBloqueantes.join(' | ')}` };
  }

  const versionAnterior = previas
    .filter((p) => p.facturaId === factura.id && p.formato === opts.formato)
    .sort((a, b) => b.versionGeneracion - a.versionGeneracion)[0];
  const versionGeneracion = versionAnterior ? versionAnterior.versionGeneracion + 1 : 1;

  // Idempotencia: si ya existe una representación GENERADA/VALIDADA no terminal para la
  // misma factura+formato, se devuelve la existente en lugar de duplicar.
  const existenteNoTerminal = previas.find(
    (p) => p.facturaId === factura.id && p.formato === opts.formato && !['ANULADA', 'RECTIFICADA'].includes(p.estado)
  );
  if (existenteNoTerminal && !opts.estadoEconomico) {
    return { ok: true, valor: existenteNoTerminal };
  }

  const fecha = opts.fechaGeneracion || new Date().toISOString();
  const id = idFacturaElectronica(factura.id, opts.formato, versionGeneracion);

  const feb: FacturaElectronicaB2B = {
    id,
    facturaId: factura.id,
    propietarioId: factura.propietarioId,
    emisor: {
      nombreRazonSocial: factura.emisor.nombre,
      nif: factura.emisor.nif,
      direccion: factura.emisor.direccion,
      codigoPostal: factura.emisor.codigoPostal,
      municipio: factura.emisor.ciudad,
      pais: 'ES',
    },
    receptor: {
      nombreRazonSocial: factura.receptor?.nombre || '',
      nif: factura.receptor?.nif || '',
      direccion: factura.receptor?.direccion,
      codigoPostal: factura.receptor?.codigoPostal,
      municipio: factura.receptor?.ciudad,
      pais: 'ES',
      ...opts.receptorIntercambio,
    },
    serie: factura.serie,
    numero: factura.numero,
    ejercicio: factura.ejercicio,
    numeroCompleto: numeroFacturaFormateado(factura.serie, factura.numero, factura.ejercicio),
    fechaExpedicion: fechaIsoDesdeDdma(factura.fechaExpedicion) || '',
    fechaOperacion: fechaIsoDesdeDdma(factura.fechaOperacion),
    vencimiento: fechaIsoDesdeDdma(factura.vencimiento),
    // Importes COPIADOS de GAP 7 — nunca recalculados
    baseImponible: factura.baseImponible,
    cuotaIva: factura.cuotaIva,
    cuotaRetencion: factura.cuotaRetencion || 0,
    importeTotal: factura.importeTotal,
    tipoIvaAplicado: factura.lineas.length > 0 ? factura.lineas[0].tipoIva : undefined,
    moneda: 'EUR',
    lineas: factura.lineas.map(lineaAB2B),
    referencias: [factura.id, ...(factura.rectificaFacturaId ? [`RECTIFICA:${factura.rectificaFacturaId}`] : [])],
    inmuebleId: factura.inmuebleId,
    contratoId: factura.contratoId,
    formato: opts.formato,
    estado: 'GENERADA',
    informacionPago: informacionPagoDesdeCobros(factura, opts.estadoEconomico),
    idempotencyKey: idempotencyKeyB2B(factura.id, opts.formato),
    versionGeneracion,
    historial: [
      {
        id: idEventoB2B(id, 'GENERACION', 'GENERADA', fecha),
        fecha,
        usuario: opts.generadoPor,
        operacion: 'GENERACION',
        estadoAnterior: 'BORRADOR',
        estadoNuevo: 'GENERADA',
        resultado: 'OK',
      },
    ],
    generadoPor: opts.generadoPor,
    createdAt: fecha,
    updatedAt: fecha,
  };
  return { ok: true, valor: feb };
}

function lineaAB2B(l: LineaFactura): FacturaElectronicaB2B['lineas'][number] {
  return {
    concepto: l.concepto,
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
    baseImponible: l.baseImponible,
    tipoIva: l.tipoIva,
    cuotaIva: l.cuotaIva,
    tipoRetencion: l.retencionTipo,
    cuotaRetencion: l.retencionCuota,
  };
}

// ---------------------------------------------------------------------------
// Validación específica B2B (bloqueantes vs advertencias)
// ---------------------------------------------------------------------------

const TOLERANCIA_CENTIMO = 0.011;

/**
 * Valida la factura interna antes de generar/intercambiar la representación B2B.
 * BLOQUEANTE: impide el envío. ADVERTENCIA: no lo impide.
 */
export function validarFacturaParaB2B(factura: Factura): ValidacionFacturaB2B {
  const erroresBloqueantes: string[] = [];
  const advertencias: string[] = [];

  // Emisor completo
  if (!factura.emisor?.nombre?.trim()) erroresBloqueantes.push('Emisor incompleto: falta nombre/razón social.');
  if (!factura.emisor?.nif?.trim()) erroresBloqueantes.push('Emisor incompleto: falta NIF.');
  else if (!esNifEspanolValido(factura.emisor.nif)) erroresBloqueantes.push(`NIF de emisor inválido: "${factura.emisor.nif}".`);
  if (!factura.emisor?.direccion?.trim()) advertencias.push('Emisor sin dirección (recomendado para interoperabilidad).');

  // Receptor completo (B2B exige destinatario identificado)
  if (!factura.receptor?.nombre?.trim()) erroresBloqueantes.push('Receptor incompleto: falta nombre/razón social.');
  if (!factura.receptor?.nif?.trim()) erroresBloqueantes.push('Receptor incompleto: falta NIF (obligatorio en B2B).');
  else if (!esNifEspanolValido(factura.receptor.nif)) erroresBloqueantes.push(`NIF de receptor inválido: "${factura.receptor.nif}".`);

  // Numeración
  if (!factura.serie?.trim() || !(factura.numero > 0) || !(factura.ejercicio > 2000)) {
    erroresBloqueantes.push('Numeración incorrecta: serie, número y ejercicio son obligatorios.');
  }

  // Fechas
  if (!fechaIsoDesdeDdma(factura.fechaExpedicion)) erroresBloqueantes.push('Fecha de expedición inválida o ausente.');

  // Coherencia económica (importes de GAP 7; no se recalculan, se comprueban)
  const sumaLineas = factura.lineas.reduce((acc, l) => acc + l.baseImponible, 0);
  if (factura.lineas.length === 0) {
    erroresBloqueantes.push('La factura no tiene líneas.');
  } else if (Math.abs(sumaLineas - factura.baseImponible) > TOLERANCIA_CENTIMO) {
    erroresBloqueantes.push(`Bases incoherentes: suma de líneas ${sumaLineas.toFixed(2)} ≠ base ${factura.baseImponible.toFixed(2)}.`);
  }
  const sumaIva = factura.lineas.reduce((acc, l) => acc + l.cuotaIva, 0);
  if (Math.abs(sumaIva - factura.cuotaIva) > TOLERANCIA_CENTIMO) {
    erroresBloqueantes.push(`IVA incoherente: suma de cuotas ${sumaIva.toFixed(2)} ≠ cuota ${factura.cuotaIva.toFixed(2)}.`);
  }
  const sumaRet = factura.lineas.reduce((acc, l) => acc + (l.retencionCuota || 0), 0);
  if (Math.abs(sumaRet - (factura.cuotaRetencion || 0)) > TOLERANCIA_CENTIMO) {
    erroresBloqueantes.push(`Retenciones incoherentes: suma ${sumaRet.toFixed(2)} ≠ declarada ${(factura.cuotaRetencion || 0).toFixed(2)}.`);
  }
  const totalEsperado = factura.baseImponible + factura.cuotaIva - (factura.cuotaRetencion || 0);
  if (Math.abs(totalEsperado - factura.importeTotal) > TOLERANCIA_CENTIMO) {
    erroresBloqueantes.push(`Total incorrecto: ${factura.importeTotal.toFixed(2)} ≠ esperado ${totalEsperado.toFixed(2)}.`);
  }

  // Datos de pago compatibles
  if (factura.formaPago === 'efectivo' && factura.importeTotal > 1000) {
    advertencias.push('Pago en efectivo superior a 1.000 €: revisar límites legales de pagos en efectivo.');
  }
  if (factura.vencimiento && factura.fechaExpedicion) {
    const v = fechaIsoDesdeDdma(factura.vencimiento);
    const e = fechaIsoDesdeDdma(factura.fechaExpedicion);
    if (v && e && v < e) erroresBloqueantes.push('Datos de pago incompatibles: vencimiento anterior a la expedición.');
  }

  // Advertencias de interoperabilidad
  if (!factura.receptor?.direccion?.trim()) advertencias.push('Receptor sin dirección (recomendado para interoperabilidad).');

  return { valido: erroresBloqueantes.length === 0, erroresBloqueantes, advertencias };
}

// ---------------------------------------------------------------------------
// Máquina de estados B2B (separada de VERI*FACTU; toda transición queda trazada)
// ---------------------------------------------------------------------------

const TRANSICIONES_B2B: Record<EstadoFacturaB2B, EstadoFacturaB2B[]> = {
  BORRADOR: ['GENERADA'],
  GENERADA: ['VALIDADA', 'ANULADA'],
  VALIDADA: ['DISPUESTA_PARA_ENVIO', 'GENERADA', 'ANULADA'],
  DISPUESTA_PARA_ENVIO: ['ENVIADA', 'VALIDADA', 'ANULADA'],
  ENVIADA: ['RECIBIDA', 'ACEPTADA', 'RECHAZADA', 'PAGADA', 'PARCIALMENTE_PAGADA', 'ANULADA', 'RECTIFICADA'],
  RECIBIDA: ['ACEPTADA', 'RECHAZADA', 'PAGADA', 'PARCIALMENTE_PAGADA', 'ANULADA', 'RECTIFICADA'],
  ACEPTADA: ['PAGADA', 'PARCIALMENTE_PAGADA', 'RECTIFICADA', 'ANULADA'],
  RECHAZADA: ['DISPUESTA_PARA_ENVIO', 'ANULADA', 'RECTIFICADA'],
  PARCIALMENTE_PAGADA: ['PAGADA', 'RECTIFICADA'],
  PAGADA: ['RECTIFICADA', 'ANULADA'],
  ANULADA: [],
  RECTIFICADA: [],
};

export function transicionB2BPermitida(actual: EstadoFacturaB2B, siguiente: EstadoFacturaB2B): boolean {
  return (TRANSICIONES_B2B[actual] || []).includes(siguiente);
}

export interface OpcionesTransicionB2B {
  usuario: string;
  operacion: EventoB2B['operacion'];
  fecha?: string; // ISO; determinismo
  externalId?: string;
  error?: string;
  resultado?: 'OK' | 'ERROR';
}

/**
 * Aplica una transición de estado B2B con trazabilidad completa e idempotencia:
 * - Rechaza transiciones no permitidas (una factura ANULADA/RECTIFICADA es terminal).
 * - No duplica eventos: mismo (operación + estadoNuevo + fecha) no se repite.
 * - No permite modificaciones silenciosas de una factura ya enviada.
 */
export function aplicarTransicionB2B(
  feb: FacturaElectronicaB2B,
  estadoNuevo: EstadoFacturaB2B,
  opts: OpcionesTransicionB2B
): ResultadoB2B<FacturaElectronicaB2B> {
  const fecha = opts.fecha || new Date().toISOString();

  if (!transicionB2BPermitida(feb.estado, estadoNuevo)) {
    return {
      ok: false,
      error: `Transición no permitida: ${feb.estado} → ${estadoNuevo}. Una factura en estado terminal o ya enviada no puede modificarse silenciosamente.`,
    };
  }

  const eventoId = idEventoB2B(feb.id, opts.operacion, estadoNuevo, fecha);
  if (feb.historial.some((e) => e.id === eventoId)) {
    // Idempotencia: operación ya registrada; no se duplica el evento.
    return { ok: true, valor: feb };
  }

  const evento: EventoB2B = {
    id: eventoId,
    fecha,
    usuario: opts.usuario,
    operacion: opts.operacion,
    estadoAnterior: feb.estado,
    estadoNuevo,
    resultado: opts.resultado || 'OK',
    error: opts.error,
    externalId: opts.externalId,
  };

  return {
    ok: true,
    valor: {
      ...feb,
      estado: estadoNuevo,
      externalId: opts.externalId ?? feb.externalId,
      updatedAt: fecha,
      historial: [...feb.historial, evento],
    },
  };
}

/**
 * Operaciones permitidas sobre una factura YA ENVIADA: solo estados de recepción,
 * aceptación/rechazo, pago, anulación/rectificación. Nunca volver a BORRADOR/GENERADA.
 */
export function modificacionSilenciosaProhibida(feb: FacturaElectronicaB2B, estadoIntentado: EstadoFacturaB2B): boolean {
  const enviados: EstadoFacturaB2B[] = ['ENVIADA', 'RECIBIDA', 'ACEPTADA', 'RECHAZADA', 'PAGADA', 'PARCIALMENTE_PAGADA'];
  if (!enviados.includes(feb.estado)) return false;
  const permitidosPost: EstadoFacturaB2B[] = ['RECIBIDA', 'ACEPTADA', 'RECHAZADA', 'PAGADA', 'PARCIALMENTE_PAGADA', 'ANULADA', 'RECTIFICADA'];
  return !permitidosPost.includes(estadoIntentado);
}

// ---------------------------------------------------------------------------
// Aislamiento / seguridad
// ---------------------------------------------------------------------------

/** Acceso denegado si la representación no pertenece al propietario indicado. */
export function accesoB2BDenegado(feb: FacturaElectronicaB2B, propietarioId?: string): boolean {
  if (!propietarioId) return true;
  return feb.propietarioId !== propietarioId;
}
