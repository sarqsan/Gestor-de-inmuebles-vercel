import { describe, it, expect } from 'vitest';
import NodeCrypto from 'crypto';

import {
  sha256Hex,
} from '../src/utils/sha256';

import {
  calcularLinea,
  totalesFactura,
  numeroFacturaFormateado,
  validarNumeracion,
  cadenaHashAlta,
  cadenaHashAnulacion,
  generarRegistroFacturacionAlta,
  verificarCadenaFacturacion,
  urlQrFactura,
  crearFacturaRectificativa,
  anularFactura,
  redondear2,
  fechaExpedicionDesdeFecha,
  hashSha256,
} from '../src/utils/facturacionEngine';

import {
  crearEnvioPendiente,
  transicionEnvio,
  remitirRegistroConTransport,
  VerifactuTransportPendiente,
} from '../src/utils/verifactuTransport';

import type {
  Factura,
  RegistroFacturacion,
  SerieFacturacion,
  TipoFactura,
  RegistroGenerado,
} from '../src/types/facturacion';
import { idEnvioVerifactu } from '../src/types/facturacion';

// ---------------------------------------------------------------------------
// SHA-256 puro: validación contra Node crypto
// ---------------------------------------------------------------------------

describe('GAP7 — SHA-256 puro (portable)', () => {
  it('coincide con crypto de Node en múltiples entradas', () => {
    const casos = ['', 'abc', 'IDEmisorFactura=89890001K&Huella=&Fecha=2024-01-01T19:20:30+01:00', 'ñandú € 123'];
    for (const c of casos) {
      const esperado = NodeCrypto.createHash('sha256').update(c, 'utf8').digest('hex').toUpperCase();
      expect(sha256Hex(c)).toBe(esperado);
      expect(hashSha256(c)).toBe(esperado);
    }
  });

  it('primer vector oficial AEAT (registro de alta sin anterior)', () => {
    const cadena = cadenaHashAlta({
      idEmisorFactura: '89890001K',
      numSerieFactura: '12345678/G33',
      fechaExpedicionFactura: '01-01-2024',
      tipoFactura: 'F1',
      cuotaTotal: 12.35,
      importeTotal: 123.45,
      huellaAnterior: '',
      fechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
    });
    expect(cadena).toBe(
      'IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00'
    );
    expect(hashSha256(cadena)).toBe('3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60');
  });

  it('tercer vector oficial AEAT (registro de ANULACIÓN encadenado)', () => {
    const cadena = cadenaHashAnulacion({
      idEmisorFacturaAnulada: '89890001K',
      numSerieFacturaAnulada: '12345679/G34',
      fechaExpedicionFacturaAnulada: '01-01-2024',
      huellaAnterior: 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97',
      fechaHoraHusoGenRegistro: '2024-01-01T19:20:40+01:00',
    });
    expect(cadena).toBe(
      'IDEmisorFacturaAnulada=89890001K&NumSerieFacturaAnulada=12345679/G34&FechaExpedicionFacturaAnulada=01-01-2024&Huella=F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97&FechaHoraHusoGenRegistro=2024-01-01T19:20:40+01:00'
    );
    expect(hashSha256(cadena)).toBe('177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68');
  });
});

// ---------------------------------------------------------------------------
// Facturas / numeración / series / impuestos
// ---------------------------------------------------------------------------

describe('GAP7 — Facturas, numeración, series e impuestos', () => {
  const linea = calcularLinea({ concepto: 'Renta mensual', cantidad: 1, precioUnitario: 1000, tipoIva: 21, retencionTipo: 19 });
  it('cálculo de línea con IVA y retención', () => {
    expect(linea.baseImponible).toBe(1000);
    expect(linea.cuotaIva).toBe(210);
    expect(linea.retencionCuota).toBe(190);
  });

  it('totales: base + IVA - retención', () => {
    const t = totalesFactura([linea]);
    expect(t.baseImponible).toBe(1000);
    expect(t.cuotaIva).toBe(210);
    expect(t.cuotaRetencion).toBe(190);
    expect(t.importeTotal).toBe(1020);
  });

  const serie: SerieFacturacion = {
    id: 'serie_1',
    propietarioId: 'prop_1',
    codigo: 'ALQ',
    ejercicio: 2026,
    tipo: 'ALQUILER',
    ultimoNumero: 5,
    activa: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  it('numeración correlativa y formato', () => {
    expect(numeroFacturaFormateado('ALQ', 6, 2026)).toBe('ALQ-2026-000006');
  });

  it('no duplicados ni saltos en numeración', () => {
    expect(validarNumeracion(serie, 6, []).valido).toBe(true);
    expect(validarNumeracion(serie, 6, [6]).valido).toBe(false); // duplicado
    expect(validarNumeracion(serie, 8, []).valido).toBe(false); // salto
    expect(validarNumeracion(serie, 0, []).valido).toBe(false); // inválido
  });
});

// ---------------------------------------------------------------------------
// Registro de facturación: generación y encadenamiento
// ---------------------------------------------------------------------------

function registroAlta(vector: {
  propietarioId: string;
  facturaId: string;
  idEmisorFactura: string;
  numSerieFactura: string;
  fechaExpedicionFactura: string;
  tipoFactura: TipoFactura;
  cuotaTotal: number;
  importeTotal: number;
  fechaHoraHusoGenRegistro: string;
  registroAnterior?: RegistroFacturacion | null;
}): RegistroGenerado {
  return generarRegistroFacturacionAlta({
    ...vector,
    modalidad: 'VERIFACTU',
    timestampUtc: '2024-01-01T18:20:30Z',
  });
}

describe('GAP7 — Registro de facturación (RRSIF)', () => {
  it('primer registro de alta: huella correcta (vector oficial)', () => {
    const r = registroAlta({
      propietarioId: 'prop_1',
      facturaId: 'fac_1',
      idEmisorFactura: '89890001K',
      numSerieFactura: '12345678/G33',
      fechaExpedicionFactura: '01-01-2024',
      tipoFactura: 'F1',
      cuotaTotal: 12.35,
      importeTotal: 123.45,
      fechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
    });
    expect(r.registro.primerRegistro).toBe(true);
    expect(r.registro.huella).toBe('3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60');
  });

  it('segundo registro encadenado (vector oficial caso 2)', () => {
    const primero = registroAlta({
      propietarioId: 'prop_1',
      facturaId: 'fac_1',
      idEmisorFactura: '89890001K',
      numSerieFactura: '12345678/G33',
      fechaExpedicionFactura: '01-01-2024',
      tipoFactura: 'F1',
      cuotaTotal: 12.35,
      importeTotal: 123.45,
      fechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
    });

    const segundo = registroAlta({
      propietarioId: 'prop_1',
      facturaId: 'fac_2',
      idEmisorFactura: '89890001K',
      numSerieFactura: '12345679/G34',
      fechaExpedicionFactura: '01-01-2024',
      tipoFactura: 'F1',
      cuotaTotal: 12.35,
      importeTotal: 123.45,
      fechaHoraHusoGenRegistro: '2024-01-01T19:20:35+01:00',
      registroAnterior: primero.registro,
    });

    expect(segundo.registro.primerRegistro).toBe(false);
    expect(segundo.registro.huellaAnterior).toBe('3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60');
    expect(segundo.registro.huella).toBe('F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97');
  });

  it('cadena verificable en orden', () => {
    const r1 = registroAlta({
      propietarioId: 'prop_1', facturaId: 'fac_1', idEmisorFactura: '89890001K',
      numSerieFactura: '1/G1', fechaExpedicionFactura: '01-01-2024', tipoFactura: 'F1',
      cuotaTotal: 1, importeTotal: 6.05, fechaHoraHusoGenRegistro: '2024-01-01T10:00:00+01:00',
    });
    const r2 = registroAlta({
      propietarioId: 'prop_1', facturaId: 'fac_2', idEmisorFactura: '89890001K',
      numSerieFactura: '2/G1', fechaExpedicionFactura: '01-01-2024', tipoFactura: 'F1',
      cuotaTotal: 1, importeTotal: 6.05, fechaHoraHusoGenRegistro: '2024-01-01T10:01:00+01:00',
      registroAnterior: r1.registro,
    });
    const res = verificarCadenaFacturacion([r1.registro, r2.registro]);
    expect(res.valida).toBe(true);
  });

  it('detecta hash incorrecto', () => {
    const r = registroAlta({
      propietarioId: 'prop_1', facturaId: 'fac_1', idEmisorFactura: '89890001K',
      numSerieFactura: '1/G1', fechaExpedicionFactura: '01-01-2024', tipoFactura: 'F1',
      cuotaTotal: 1, importeTotal: 6.05, fechaHoraHusoGenRegistro: '2024-01-01T10:00:00+01:00',
    });
    const alterado = { ...r.registro, importeTotal: 9999 };
    const res = verificarCadenaFacturacion([alterado]);
    expect(res.valida).toBe(false);
    if (res.valida === false) expect(res.error).toBe('hash_incorrecto');
  });

  it('detecta cadena rota (segundo registro alterado)', () => {
    const r1 = registroAlta({
      propietarioId: 'prop_1', facturaId: 'fac_1', idEmisorFactura: '89890001K',
      numSerieFactura: '1/G1', fechaExpedicionFactura: '01-01-2024', tipoFactura: 'F1',
      cuotaTotal: 1, importeTotal: 6.05, fechaHoraHusoGenRegistro: '2024-01-01T10:00:00+01:00',
    });
    const r2 = registroAlta({
      propietarioId: 'prop_1', facturaId: 'fac_2', idEmisorFactura: '89890001K',
      numSerieFactura: '2/G1', fechaExpedicionFactura: '01-01-2024', tipoFactura: 'F1',
      cuotaTotal: 1, importeTotal: 6.05, fechaHoraHusoGenRegistro: '2024-01-01T10:01:00+01:00',
      registroAnterior: r1.registro,
    });
    // Eliminar el primero → el segundo queda huérfano (huellaAnterior no vacía).
    const res = verificarCadenaFacturacion([r2.registro]);
    expect(res.valida).toBe(false);
  });

  it('detecta reordenación', () => {
    const r1 = registroAlta({
      propietarioId: 'prop_1', facturaId: 'fac_1', idEmisorFactura: '89890001K',
      numSerieFactura: '1/G1', fechaExpedicionFactura: '01-01-2024', tipoFactura: 'F1',
      cuotaTotal: 1, importeTotal: 6.05, fechaHoraHusoGenRegistro: '2024-01-01T10:00:00+01:00',
    });
    const r2 = registroAlta({
      propietarioId: 'prop_1', facturaId: 'fac_2', idEmisorFactura: '89890001K',
      numSerieFactura: '2/G1', fechaExpedicionFactura: '01-01-2024', tipoFactura: 'F1',
      cuotaTotal: 1, importeTotal: 6.05, fechaHoraHusoGenRegistro: '2024-01-01T10:01:00+01:00',
      registroAnterior: r1.registro,
    });
    const res = verificarCadenaFacturacion([r2.registro, r1.registro]);
    expect(res.valida).toBe(false);
    if (res.valida === false) expect(res.error).toBe('orden_incorrecto');
  });
});

// ---------------------------------------------------------------------------
// QR (payload conforme v0.5.0)
// ---------------------------------------------------------------------------

describe('GAP7 — QR de factura', () => {
  it('URL verificable entorno de pruebas con codificación correcta', () => {
    const url = urlQrFactura({
      nif: '89890001K',
      numserie: '12345678&G33',
      fecha: '01-01-2024',
      importe: 241.4,
      entorno: 'sandbox',
      claseSistema: 'VERIFACTU',
    });
    expect(url).toBe(
      'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=12345678%26G33&fecha=01-01-2024&importe=241.4'
    );
  });

  it('URL de producción verificable', () => {
    const url = urlQrFactura({
      nif: '89890001K',
      numserie: '12345678-G33',
      fecha: '01-09-2024',
      importe: 241.4,
      entorno: 'produccion',
      claseSistema: 'VERIFACTU',
    });
    expect(url).toBe(
      'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=12345678-G33&fecha=01-09-2024&importe=241.4'
    );
  });

  it('URL no verificable distinta (NO VERIFACTU)', () => {
    const url = urlQrFactura({
      nif: '89890001K', numserie: '12345678-G33', fecha: '01-09-2024', importe: 241.4,
      entorno: 'produccion', claseSistema: 'NO_VERIFACTU',
    });
    expect(url).toContain('ValidarQRNoVerifactu');
  });

  it('importe con dos decimales aceptado (241.40 normaliza a 241.4 igualmente válido)', () => {
    // La especificación acepta 241.4 y 241.40 como equivalentes; normalizamos a 2 dec.
    const url = urlQrFactura({
      nif: '89890001K', numserie: 'G', fecha: '01-01-2024', importe: 241.4,
      entorno: 'sandbox', claseSistema: 'VERIFACTU',
    });
    expect(url).toContain('importe=241.4');
  });
});

// ---------------------------------------------------------------------------
// Inalterabilidad: rectificativas y anulación
// ---------------------------------------------------------------------------

const baseFactura: Factura = {
  id: 'fac_ALQ_2026_000001_prop_1',
  propietarioId: 'prop_1',
  inmuebleId: 'inm_1',
  clase: 'EMITIDA',
  tipo: 'F1',
  serie: 'ALQ',
  numero: 1,
  ejercicio: 2026,
  fechaExpedicion: '01-01-2026',
  emisor: { nombre: 'Prop A', nif: '89890001K' },
  lineas: [calcularLinea({ concepto: 'Renta', cantidad: 1, precioUnitario: 1000, tipoIva: 21 })],
  baseImponible: 1000,
  cuotaIva: 210,
  importeTotal: 1210,
  estado: 'EMITIDA',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('GAP7 — Inalterabilidad y rectificativas', () => {
  it('rectificativa referencia a la original sin mutarla', () => {
    const rect = crearFacturaRectificativa(baseFactura, [calcularLinea({ concepto: 'Renta corregida', cantidad: 1, precioUnitario: 1100, tipoIva: 21 })], 'Error en importe');
    expect(rect.tipo).toBe('R1');
    expect(rect.rectificaFacturaId).toBe(baseFactura.id);
    expect(rect.numero).toBe(2);
    expect(baseFactura.tipo).toBe('F1'); // original intacta
    expect(baseFactura.importeTotal).toBe(1210);
  });

  it('anulación marca estado sin borrar el documento', () => {
    const { factura } = anularFactura(baseFactura, 'Factura duplicada');
    expect(factura.estado).toBe('ANULADA');
    expect(factura.motivoRectificacion).toBe('Factura duplicada');
    expect(factura.id).toBe(baseFactura.id);
  });
});

// ---------------------------------------------------------------------------
// VERI*FACTU: preparación, idempotencia, aceptación/rechazo/error/reintento
// ---------------------------------------------------------------------------

describe('GAP7 — VERI*FACTU (transporte desacoplado e idempotencia)', () => {
  const registro = generarRegistroFacturacionAlta({
    propietarioId: 'prop_1',
    facturaId: 'fac_1',
    idEmisorFactura: '89890001K',
    numSerieFactura: '1/G1',
    fechaExpedicionFactura: '01-01-2024',
    tipoFactura: 'F1',
    cuotaTotal: 12.35,
    importeTotal: 123.45,
    fechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
    modalidad: 'VERIFACTU',
  }).registro;

  it('identidad determinista del envío (idempotencia por registro)', () => {
    const e1 = crearEnvioPendiente(registro, 'prop_1');
    const e2 = crearEnvioPendiente(registro, 'prop_1');
    expect(e1.id).toBe(e2.id);
    expect(e1.id).toBe(idEnvioVerifactu(registro.id));
  });

  it('aceptación', () => {
    const envio = crearEnvioPendiente(registro, 'prop_1');
    const next = transicionEnvio(envio, { ok: true, estado: 'ACEPTADO', codigoSeguroVerificacion: 'CSV123', respondidoEn: '2024-01-01T19:21:00Z' });
    expect(next.estado).toBe('ACEPTADO');
    expect(next.codigoSeguroVerificacion).toBe('CSV123');
  });

  it('rechazo', () => {
    const envio = crearEnvioPendiente(registro, 'prop_1');
    const next = transicionEnvio(envio, { ok: false, estado: 'RECHAZADO', codigoError: 'VALIDACION_KO', descripcionError: 'NIF inválido', respondidoEn: '2024-01-01T19:21:00Z' });
    expect(next.estado).toBe('RECHAZADO');
    expect(next.codigoError).toBe('VALIDACION_KO');
  });

  it('reintento reutiliza la identidad (no duplica)', () => {
    const envio = crearEnvioPendiente(registro, 'prop_1');
    const reintento = transicionEnvio(envio, { ok: false, estado: 'REINTENTO', respondidoEn: '2024-01-01T19:21:00Z' });
    expect(reintento.estado).toBe('REINTENTO');
    expect(reintento.intentos).toBe(1);
    expect(reintento.id).toBe(envio.id);
  });

  it('respuesta duplicada no altera estado terminal', () => {
    const envio = crearEnvioPendiente(registro, 'prop_1');
    const aceptado = transicionEnvio(envio, { ok: true, estado: 'ACEPTADO', respondidoEn: '2024-01-01T19:21:00Z' });
    const dup = transicionEnvio(aceptado, { ok: true, estado: 'ACEPTADO', duplicada: true, respondidoEn: '2024-01-01T19:22:00Z' });
    expect(dup.estado).toBe('ACEPTADO');
    expect(dup.historial.length).toBe(aceptado.historial.length); // sin registro nuevo
  });

  it('transporte no preparado devuelve INDISPONIBLE (sin endpoint inventado)', async () => {
    const transport = new VerifactuTransportPendiente('sandbox');
    expect(transport.preparado).toBe(false);
    const envio = crearEnvioPendiente(registro, 'prop_1');
    const res = await remitirRegistroConTransport(envio, registro, transport);
    expect(res.estado).toBe('ERROR');
    expect(res.codigoError).toBe('INDISPONIBLE');
  });

  it('no almacena secretos', () => {
    const envio = crearEnvioPendiente(registro, 'prop_1');
    const json = JSON.stringify(envio);
    expect(json).not.toContain('certificado');
    expect(json).not.toContain('privateKey');
    expect(json).not.toContain('password');
    expect(Object.keys(envio)).not.toContain('token');
  });
});

describe('GAP7 — Utilidades de precisión', () => {
  it('redondea a céntimos', () => {
    expect(redondear2(123.456)).toBe(123.46);
    expect(redondear2(241.4)).toBe(241.4);
  });
  it('fecha de expedición formateada dd-mm-aaaa', () => {
    expect(fechaExpedicionDesdeFecha(new Date(2026, 0, 5))).toBe('05-01-2026');
  });
});
