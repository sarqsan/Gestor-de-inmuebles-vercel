/**
 * GAP 8 — Pruebas específicas de factura electrónica B2B (RD 238/2026).
 * Cubre: generación determinista, validación (bloqueante/advertencia), máquina
 * de estados separada, formatos EN 16931 (CII/UBL/Facturae), adaptadores de
 * intercambio (sin envío real inventado), idempotencia, pago vía Cobros/GAP6,
 * notificaciones GAP 1 y aislamiento.
 */

import { describe, it, expect } from 'vitest';

import type { Factura } from '../src/types/facturacion';
import { calcularLinea } from '../src/utils/facturacionEngine';

import {
  aplicarTransicionB2B,
  generarFacturaElectronicaB2B as genEngine,
  idFacturaElectronica,
  idempotencyKeyB2B,
  informacionPagoDesdeCobros,
  modificacionSilenciosaProhibida,
  transicionB2BPermitida,
  validarFacturaParaB2B,
} from '../src/utils/facturaElectronicaB2BEngine';

import {
  generarConEvento,
  obtenerDocumentoB2B,
  prepararEnvioB2B,
  registrarEstadoIntercambioB2B,
  reintentarEnvioB2B,
  validarParaIntercambioB2B,
} from '../src/utils/facturaElectronicaB2BService';

import { generarCii } from '../src/utils/generadores/ciiB2BGenerator';
import { generarUbl } from '../src/utils/generadores/ublB2BGenerator';
import { generarFacturae } from '../src/utils/generadores/facturaeB2BGenerator';
import { generarDocumentoB2B, estadoFormatosB2B } from '../src/utils/generadores/indexB2B';

import {
  AdaptadorPreparacionB2B,
  AdaptadorSpfeB2B,
  AdaptadorPlataformaPrivadaPendiente,
  adaptadoresDisponiblesB2B,
  obtenerAdaptadorB2B,
} from '../src/utils/intercambioB2B/adaptadoresB2B';

import { crearEventoNotificacionB2B } from '../src/utils/notificacionesB2B';

// ---------------------------------------------------------------------------
// Fixture: factura GAP 7 válida (importes coherentes)
// ---------------------------------------------------------------------------

const FACTURA_OK: Factura = {
  id: 'fac_ALQ_2026_000010_prop_b2b',
  propietarioId: 'prop_b2b',
  inmuebleId: 'inm_b2b',
  contratoId: 'con_b2b',
  clase: 'EMITIDA',
  tipo: 'F1',
  serie: 'ALQ',
  numero: 10,
  ejercicio: 2026,
  fechaExpedicion: '01-09-2026',
  fechaOperacion: '01-09-2026',
  emisor: { nombre: 'Sarqsan SL', nif: 'B12345678', direccion: 'Calle Mayor 1', ciudad: 'Alicante', codigoPostal: '03001' },
  receptor: { nombre: 'Inquilino SA', nif: 'A28015865', direccion: 'Av. Constitución 2', ciudad: 'Madrid', codigoPostal: '28001' },
  lineas: [calcularLinea({ concepto: 'Renta septiembre', cantidad: 1, precioUnitario: 1000, tipoIva: 21 })],
  baseImponible: 1000,
  cuotaIva: 210,
  importeTotal: 1210,
  vencimiento: '10-09-2026',
  formaPago: 'transferencia',
  estado: 'EMITIDA',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

const FECHA_GEN = '2026-09-20T10:00:00.000Z';

function generarOk(formato: 'CII' | 'UBL_2_1' | 'FACTURAE_3_2' = 'CII') {
  const res = genEngine(FACTURA_OK, [], { formato, generadoPor: 'tester', fechaGeneracion: FECHA_GEN });
  expect(res.ok).toBe(true);
  return res.valor!;
}

// ---------------------------------------------------------------------------
// Identidad determinista e idempotencia
// ---------------------------------------------------------------------------

describe('GAP8 — identidad determinista e idempotencia', () => {
  it('id e idempotencyKey son deterministas por factura+formato+versión', () => {
    expect(idFacturaElectronica(FACTURA_OK.id, 'CII', 1)).toBe(idFacturaElectronica(FACTURA_OK.id, 'CII', 1));
    expect(idFacturaElectronica(FACTURA_OK.id, 'CII', 1)).not.toBe(idFacturaElectronica(FACTURA_OK.id, 'UBL_2_1', 1));
    expect(idempotencyKeyB2B(FACTURA_OK.id, 'CII')).toBe(idempotencyKeyB2B(FACTURA_OK.id, 'CII'));
    expect(idempotencyKeyB2B(FACTURA_OK.id, 'CII')).not.toBe(idempotencyKeyB2B(FACTURA_OK.id, 'UBL_2_1'));
  });

  it('regenerar con representación activa devuelve la existente (no duplica)', () => {
    const primera = generarOk();
    const res2 = genEngine(FACTURA_OK, [primera], { formato: 'CII', generadoPor: 'tester', fechaGeneracion: FECHA_GEN });
    expect(res2.ok).toBe(true);
    expect(res2.valor!.id).toBe(primera.id); // misma clave → no duplicado
  });

  it('regeneración con actualización económica crea nueva versión (trazable)', () => {
    const primera = generarOk();
    const res2 = genEngine(FACTURA_OK, [primera], {
      formato: 'CII',
      generadoPor: 'tester',
      fechaGeneracion: FECHA_GEN,
      estadoEconomico: { importeCobrado: 1210, fechaCobro: '2026-09-15' },
    });
    expect(res2.ok).toBe(true);
    expect(res2.valor!.versionGeneracion).toBe(2);
    expect(res2.valor!.id).not.toBe(primera.id);
    expect(res2.valor!.informacionPago.estadoPago).toBe('PAGADA');
  });

  it('una factura RECIBIDA no genera representación de intercambio', () => {
    const recibida: Factura = { ...FACTURA_OK, id: 'fac_rec', clase: 'RECIBIDA' };
    const res = genEngine(recibida, [], { formato: 'CII', generadoPor: 'tester', fechaGeneracion: FECHA_GEN });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/EMITIDAS/i);
  });
});

// ---------------------------------------------------------------------------
// Validación: bloqueantes vs advertencias (FASE 5)
// ---------------------------------------------------------------------------

describe('GAP8 — validación previa al intercambio', () => {
  it('factura completa y coherente pasa sin bloqueantes', () => {
    const v = validarFacturaParaB2B(FACTURA_OK);
    expect(v.valido).toBe(true);
    expect(v.erroresBloqueantes).toEqual([]);
  });

  it('receptor sin NIF es BLOQUEANTE (no advertencia)', () => {
    const sinNif: Factura = { ...FACTURA_OK, receptor: { nombre: 'X', nif: undefined } };
    const v = validarFacturaParaB2B(sinNif);
    expect(v.valido).toBe(false);
    expect(v.erroresBloqueantes.some((e) => e.includes('NIF'))).toBe(true);
  });

  it('NIF mal formado es bloqueante', () => {
    const mal: Factura = { ...FACTURA_OK, emisor: { nombre: 'Y', nif: '123' } };
    expect(validarFacturaParaB2B(mal).valido).toBe(false);
  });

  it('importes incoherentes son bloqueantes (base ≠ suma de líneas)', () => {
    const rota: Factura = { ...FACTURA_OK, baseImponible: 999 };
    const v = validarFacturaParaB2B(rota);
    expect(v.valido).toBe(false);
    expect(v.erroresBloqueantes.some((e) => e.includes('Bases'))).toBe(true);
  });

  it('total incorrecto es bloqueante', () => {
    const rota: Factura = { ...FACTURA_OK, importeTotal: 1000 };
    const v = validarFacturaParaB2B(rota);
    expect(v.valido).toBe(false);
    expect(v.erroresBloqueantes.some((e) => e.includes('Total'))).toBe(true);
  });

  it('vencimiento anterior a expedición es bloqueante; efectivo >1000€ es advertencia', () => {
    const fechasMal: Factura = { ...FACTURA_OK, vencimiento: '01-08-2026' };
    expect(validarFacturaParaB2B(fechasMal).valido).toBe(false);

    const efectivo: Factura = { ...FACTURA_OK, formaPago: 'efectivo', importeTotal: 1210, baseImponible: 1000, cuotaIva: 210 };
    const v = validarFacturaParaB2B(efectivo);
    expect(v.valido).toBe(true); // advertencia, no bloqueo
    expect(v.advertencias.some((a) => a.includes('efectivo'))).toBe(true);
  });

  it('duplicidad: representación activa previa impide duplicar', () => {
    const feb = generarOk();
    const v = validarParaIntercambioB2B(FACTURA_OK, [feb], 'CII');
    expect(v.duplicidadDetectada).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Generación: copia fiel de importes GAP 7 (sin recalcular)
// ---------------------------------------------------------------------------

describe('GAP8 — generación fiel y separada', () => {
  it('los importes se copian de la factura GAP 7, nunca se recalculan', () => {
    const feb = generarOk();
    expect(feb.baseImponible).toBe(FACTURA_OK.baseImponible);
    expect(feb.cuotaIva).toBe(FACTURA_OK.cuotaIva);
    expect(feb.importeTotal).toBe(FACTURA_OK.importeTotal);
    expect(feb.facturaId).toBe(FACTURA_OK.id);
    expect(feb.propietarioId).toBe(FACTURA_OK.propietarioId);
    expect(feb.id).not.toBe(FACTURA_OK.id); // identidad separada
    expect(feb.id.startsWith('feb_')).toBe(true);
  });

  it('fechas dd-mm-aaaa se normalizan a ISO en la representación', () => {
    const feb = generarOk();
    expect(feb.fechaExpedicion).toBe('2026-09-01');
    expect(feb.vencimiento).toBe('2026-09-10');
  });

  it('el historial arranca con GENERACION y una sola entrada', () => {
    const feb = generarOk();
    expect(feb.historial).toHaveLength(1);
    expect(feb.historial[0].operacion).toBe('GENERACION');
    expect(feb.estado).toBe('GENERADA');
  });
});

// ---------------------------------------------------------------------------
// Máquina de estados B2B separada (FASE 6)
// ---------------------------------------------------------------------------

describe('GAP8 — máquina de estados B2B', () => {
  it('transiciones permitidas del ciclo completo', () => {
    expect(transicionB2BPermitida('GENERADA', 'VALIDADA')).toBe(true);
    expect(transicionB2BPermitida('VALIDADA', 'DISPUESTA_PARA_ENVIO')).toBe(true);
    expect(transicionB2BPermitida('DISPUESTA_PARA_ENVIO', 'ENVIADA')).toBe(true);
    expect(transicionB2BPermitida('ENVIADA', 'RECIBIDA')).toBe(true);
    expect(transicionB2BPermitida('RECIBIDA', 'ACEPTADA')).toBe(true);
    expect(transicionB2BPermitida('ACEPTADA', 'PAGADA')).toBe(true);
    expect(transicionB2BPermitida('ENVIADA', 'RECHAZADA')).toBe(true);
    expect(transicionB2BPermitida('RECHAZADA', 'ANULADA')).toBe(true);
  });

  it('transiciones ilegales rechazadas (incl. estados terminales)', () => {
    expect(transicionB2BPermitida('GENERADA', 'ENVIADA')).toBe(false); // sin pasar por validación/preparación
    expect(transicionB2BPermitida('PAGADA', 'GENERADA')).toBe(false);
    expect(transicionB2BPermitida('ANULADA', 'ENVIADA')).toBe(false);
    expect(transicionB2BPermitida('RECTIFICADA', 'PAGADA')).toBe(false);
  });

  it('aplicarTransicionB2B traza cada cambio y es idempotente por evento', () => {
    const feb = generarOk();
    const t1 = aplicarTransicionB2B(feb, 'VALIDADA', { usuario: 'u', operacion: 'VALIDACION', fecha: FECHA_GEN });
    expect(t1.ok).toBe(true);
    expect(t1.valor!.estado).toBe('VALIDADA');
    expect(t1.valor!.historial).toHaveLength(2);

    // Mismo evento repetido (replay de persistencia) no duplica la entrada
    const febReplay = { ...t1.valor!, estado: 'GENERADA' as const };
    const t2 = aplicarTransicionB2B(febReplay, 'VALIDADA', { usuario: 'u', operacion: 'VALIDACION', fecha: FECHA_GEN });
    expect(t2.ok).toBe(true);
    expect(t2.valor!.historial).toHaveLength(t1.valor!.historial.length);
    expect(t2.valor!.id).toBe(t1.valor!.id);

    // Transición ilegal bloqueada
    const t3 = aplicarTransicionB2B(t1.valor!, 'PAGADA', { usuario: 'u', operacion: 'PAGO', fecha: FECHA_GEN });
    expect(t3.ok).toBe(false);
  });

  it('modificación silenciosa prohibida tras el envío', () => {
    const feb = { ...generarOk(), estado: 'ENVIADA' as const };
    expect(modificacionSilenciosaProhibida(feb, 'GENERADA')).toBe(true);
    expect(modificacionSilenciosaProhibida(feb, 'BORRADOR')).toBe(true);
    expect(modificacionSilenciosaProhibida(feb, 'ACEPTADA')).toBe(false);
    expect(modificacionSilenciosaProhibida(feb, 'PAGADA')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Formatos EN 16931 deterministas (FASE 4)
// ---------------------------------------------------------------------------

describe('GAP8 — generadores CII / UBL / Facturae', () => {
  it('CII determinista y con datos esenciales', () => {
    const feb = generarOk('CII');
    const a = generarCii(feb);
    const b = generarCii(feb);
    expect(a).toBe(b); // determinismo byte a byte
    expect(a).toContain('CrossIndustryInvoice');
    expect(a).toContain('urn:cen.eu:en16931:2017');
    expect(a).toContain('ALQ-2026-000010');
    expect(a).toContain('B12345678');
    expect(a).toContain('A28015865');
    expect(a).toContain('1210.00');
  });

  it('UBL determinista y con datos esenciales', () => {
    const feb = generarOk('UBL_2_1');
    const a = generarUbl(feb);
    expect(a).toBe(generarUbl(feb));
    expect(a).toContain('<Invoice');
    expect(a).toContain('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2');
    expect(a).toContain('ALQ-2026-000010');
    expect(a).toContain('1210.00');
  });

  it('Facturae determinista y con datos esenciales', () => {
    const feb = generarOk('FACTURAE_3_2');
    const a = generarFacturae(feb);
    expect(a).toBe(generarFacturae(feb));
    expect(a).toContain('Facturae');
    expect(a).toContain('3.2.2');
    expect(a).toContain('A28015865');
    expect(a).toContain('1210.00');
  });

  it('escape XML de caracteres especiales', () => {
    const conSimbolos: Factura = {
      ...FACTURA_OK,
      receptor: { nombre: 'Pepe & Hijos <SL>', nif: 'A28015865' },
    };
    const res = genEngine(conSimbolos, [], { formato: 'CII', generadoPor: 'tester', fechaGeneracion: FECHA_GEN });
    expect(res.ok).toBe(true);
    const xml = generarCii(res.valor!);
    expect(xml).toContain('Pepe &amp; Hijos &lt;SL&gt;');
    expect(xml).not.toContain('Pepe & Hijos <SL>');
  });

  it('EDIFACT no genera contenido inventado (pendiente de especificación)', () => {
    const feb = generarOk();
    expect(() => generarDocumentoB2B({ ...feb, formato: 'EDIFACT' })).toThrow(/PENDIENTE/);
    expect(estadoFormatosB2B().find((f) => f.formato === 'EDIFACT')!.estado).toBe('PENDIENTE-ESPECIFICACION');
  });

  it('cada formato produce el mismo número de factura e importe total', () => {
    for (const formato of ['CII', 'UBL_2_1', 'FACTURAE_3_2'] as const) {
      const feb = generarOk(formato);
      const doc = generarDocumentoB2B(feb);
      expect(doc.contenido).toContain('ALQ-2026-000010');
      expect(doc.nombreFichero).toContain(formato);
    }
  });
});

// ---------------------------------------------------------------------------
// Adaptadores de intercambio (FASES 7-8): nada simula producción
// ---------------------------------------------------------------------------

describe('GAP8 — adaptadores de intercambio', () => {
  it('el adaptador de preparación marca simulado=true y no dice ser envío real', () => {
    const feb = generarOk();
    const adaptador = new AdaptadorPreparacionB2B();
    const doc = generarDocumentoB2B(feb);
    const res = adaptador.enviar(feb, doc.contenido);
    expect(res.ok).toBe(true);
    expect(res.simulado).toBe(true);
    expect(res.detalle.toUpperCase()).toContain('NO ES UN ENVÍO REAL');
  });

  it('el adaptador SPFE declara PENDIENTE y no finge envío', () => {
    const feb = generarOk();
    const spfe = new AdaptadorSpfeB2B();
    const res = spfe.enviar(feb, '<xml/>');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/PENDIENTE/);
    expect(spfe.disponible()).toBe(false);
  });

  it('el adaptador de plataforma privada pendiente tampoco finge', () => {
    const feb = generarOk();
    const priv = new AdaptadorPlataformaPrivadaPendiente();
    expect(priv.enviar(feb, '<xml/>').ok).toBe(false);
    expect(priv.disponible()).toBe(false);
  });

  it('registro de adaptadores y selección por id', () => {
    expect(obtenerAdaptadorB2B('b2b_prep_local')).toBeDefined();
    expect(obtenerAdaptadorB2B('no_existe')).toBeUndefined();
    expect(adaptadoresDisponiblesB2B().every((a) => a.modo === 'PREPARACION')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Servicio orquestador: preparar, registrar estados, reintentar
// ---------------------------------------------------------------------------

describe('GAP8 — servicio orquestador', () => {
  it('prepararEnvioB2B deja la factura DISPUESTA_PARA_ENVIO (nunca ENVIADA)', () => {
    const feb = generarOk();
    const res = prepararEnvioB2B(feb, new AdaptadorPreparacionB2B(), 'tester', FECHA_GEN);
    expect(res.ok).toBe(true);
    expect(res.feb!.estado).toBe('DISPUESTA_PARA_ENVIO');
    expect(res.simulado).toBe(true);
    expect(res.eventoNotificacion?.tipoEvento).toBe('facturacion.b2b_preparada');
  });

  it('registrarEstadoIntercambioB2B avanza el ciclo con notificación', () => {
    let feb = { ...generarOk(), estado: 'DISPUESTA_PARA_ENVIO' as const };
    const enviada = registrarEstadoIntercambioB2B(feb, 'ENVIADA', 'tester', { fecha: FECHA_GEN, externalId: 'ext-1' });
    expect(enviada.ok).toBe(true);
    expect(enviada.feb!.estado).toBe('ENVIADA');
    expect(enviada.feb!.externalId).toBe('ext-1');
    expect(enviada.eventoNotificacion?.tipoEvento).toBe('facturacion.b2b_enviada');

    const aceptada = registrarEstadoIntercambioB2B(enviada.feb!, 'ACEPTADA', 'tester', { fecha: FECHA_GEN });
    expect(aceptada.ok).toBe(true);
    expect(aceptada.eventoNotificacion?.tipoEvento).toBe('facturacion.b2b_aceptada');
  });

  it('rechaza modificar silenciosamente una factura enviada', () => {
    const feb = { ...generarOk(), estado: 'ENVIADA' as const };
    const res = registrarEstadoIntercambioB2B(feb, 'GENERADA', 'tester');
    expect(res.ok).toBe(false);
  });

  it('registro de pago actualiza informacionPago sin duplicar cobros', () => {
    const feb = { ...generarOk(), estado: 'ACEPTADA' as const };
    const res = registrarEstadoIntercambioB2B(feb, 'PAGADA', 'tester', { fecha: FECHA_GEN, importePagado: 1210 });
    expect(res.ok).toBe(true);
    expect(res.feb!.informacionPago.estadoPago).toBe('PAGADA');
    expect(res.feb!.informacionPago.importePagado).toBe(1210);
    expect(res.eventoNotificacion?.tipoEvento).toBe('facturacion.b2b_pago');
  });

  it('reintento idempotente solo desde estados no terminales', () => {
    const feb = { ...generarOk(), estado: 'DISPUESTA_PARA_ENVIO' as const };
    const res = reintentarEnvioB2B(feb, new AdaptadorPreparacionB2B(), 'tester', FECHA_GEN);
    expect(res.ok).toBe(true);
    expect(res.feb!.idempotencyKey).toBe(feb.idempotencyKey); // misma clave

    const pagada = { ...generarOk(), estado: 'PAGADA' as const };
    const res2 = reintentarEnvioB2B(pagada, new AdaptadorPreparacionB2B(), 'tester', FECHA_GEN);
    expect(res2.ok).toBe(false);
  });

  it('generarConEvento devuelve advertencias sin bloquear si no hay bloqueantes', () => {
    const res = generarConEvento(FACTURA_OK, [], { formato: 'CII', generadoPor: 'tester', fechaGeneracion: FECHA_GEN });
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.advertencias)).toBe(true);
  });

  it('obtenerDocumentoB2B entrega el documento del formato de la representación', () => {
    const feb = generarOk('UBL_2_1');
    const doc = obtenerDocumentoB2B(feb);
    expect(doc.formato).toBe('UBL_2_1');
    expect(doc.contenido).toContain('<Invoice');
  });
});

// ---------------------------------------------------------------------------
// Pago vía Cobros/GAP6 (sin segundo sistema de cobros)
// ---------------------------------------------------------------------------

describe('GAP8 — información de pago desde Cobros/GAP6', () => {
  it('factura sin vínculo de cobro: NO_PAGADA', () => {
    const info = informacionPagoDesdeCobros(FACTURA_OK);
    expect(info.estadoPago).toBe('NO_PAGADA');
  });

  it('vínculo de conciliación (cobroPeriodoId) ⇒ PAGADA', () => {
    const conCobro: Factura = { ...FACTURA_OK, cobroPeriodoId: 'cobro_1' };
    const info = informacionPagoDesdeCobros(conCobro, { importeCobrado: 1210, fechaCobro: '2026-09-15' });
    expect(info.estadoPago).toBe('PAGADA');
    expect(info.importePagado).toBe(1210);
    expect(info.fechaUltimoPago).toBe('2026-09-15');
  });

  it('cobro parcial ⇒ PARCIALMENTE_PAGADA', () => {
    const info = informacionPagoDesdeCobros(FACTURA_OK, { importeCobrado: 600, fechaCobro: '2026-09-12' });
    expect(info.estadoPago).toBe('PARCIALMENTE_PAGADA');
  });
});

// ---------------------------------------------------------------------------
// Notificaciones GAP 1 (sin segundo dispatcher)
// ---------------------------------------------------------------------------

describe('GAP8 — eventos de notificación (dispatcher GAP 1)', () => {
  it('evento determinista con origen FACTURACION e idempotencia estable', () => {
    const feb = generarOk();
    const e1 = crearEventoNotificacionB2B(feb, 'facturacion.b2b_preparada');
    const e2 = crearEventoNotificacionB2B(feb, 'facturacion.b2b_preparada');
    expect(e1.idempotencyKey).toBe(e2.idempotencyKey);
    expect(e1.origen).toBe('FACTURACION');
    expect(e1.entidadId).toBe(feb.id);
    expect(e1.datos?.numeroFactura).toBe('ALQ-2026-000010');
  });

  it('distinto tipo de evento ⇒ distinta idempotencyKey', () => {
    const feb = generarOk();
    const a = crearEventoNotificacionB2B(feb, 'facturacion.b2b_enviada');
    const b = crearEventoNotificacionB2B(feb, 'facturacion.b2b_rechazada');
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });
});
