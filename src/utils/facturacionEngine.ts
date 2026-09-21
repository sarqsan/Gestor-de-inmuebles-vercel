/**
 * GAP7 — Motor de facturación, registro de facturación (RRSIF) y VERI*FACTU.
 * ---------------------------------------------------------------------------
 * Bloque PURA (sin I/O) que implementa, sobre el modelo de `src/types/facturacion.ts`:
 *
 *   - Numeración y series con control correlativo, de duplicados y de saltos.
 *   - Cálculo de líneas, base imponible, cuota IVA, retención y total.
 *   - GENERACIÓN del registro de facturación con huella/hash SHA-256 ENCADENADA
 *     conforme a la especificación AEAT «generación de la huella o hash» v0.1.2:
 *       · cadena: nombreCampo=valor&nombreCampo=valor&… (UTF-8, trim de valores,
 *         espacios inicial/final eliminados; ausente → "nombre=").
 *       · orden de campos de ALTA: IDEmisorFactura, NumSerieFactura,
 *         FechaExpedicionFactura, TipoFactura, CuotaTotal, ImporteTotal,
 *         Huella, FechaHoraHusoGenRegistro.
 *       · salida: SHA-256, hexadecimal, MAYÚSCULAS, 64 caracteres.
 *       · primer registro: Huella vacía ('').
 *   - Verificación independiente de la cadena: detecta hash incorrecto,
 *     registro alterado, eliminado, reordenado o ruptura de cadena.
 *   - QR: separación datosFactura → payloadQR (URL oficial) → render (capa UI).
 *   - Inalterabilidad: rectificativas y anulación con trazabilidad; nunca
 *     edición silenciosa de números/fechas/importes tras la emisión.
 *   - Idempotencia del envío VERI*FACTU (id determinista).
 *
 * NO almacena secretos. NO implementa transporte real con la AEAT (capa
 * VerifactuTransport desacoplada; la conexión queda PENDIENTE).
 */

import type {
  Factura,
  LineaFactura,
  RegistroFacturacion,
  RegistroGenerado,
  SerieFacturacion,
  TipoFactura,
} from '../types/facturacion';
import { sha256Hex } from './sha256';

// ---------------------------------------------------------------------------
// Precisión monetaria (céntimos)
// ---------------------------------------------------------------------------

export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Cálculo de líneas e impuestos
// ---------------------------------------------------------------------------

export interface LineaInput {
  concepto: string;
  cantidad: number;
  precioUnitario: number;
  tipoIva: number; // % tipo impositivo
  retencionTipo?: number; // % retención (IRPF) si procede
}

export function calcularLinea(input: LineaInput): LineaFactura {
  const baseImponible = redondear2(input.cantidad * input.precioUnitario);
  const cuotaIva = redondear2((baseImponible * input.tipoIva) / 100);
  const retencionTipo = input.retencionTipo || 0;
  const retencionCuota = retencionTipo > 0 ? redondear2((baseImponible * retencionTipo) / 100) : 0;
  return {
    id: `lin_${Math.random().toString(36).slice(2, 10)}`,
    concepto: input.concepto,
    cantidad: input.cantidad,
    precioUnitario: input.precioUnitario,
    baseImponible,
    tipoIva: input.tipoIva,
    cuotaIva,
    retencionTipo: retencionTipo || undefined,
    retencionCuota: retencionCuota || undefined,
  };
}

export function totalesFactura(lineas: LineaFactura[]): {
  baseImponible: number;
  cuotaIva: number;
  cuotaRetencion: number;
  importeTotal: number;
} {
  const baseImponible = redondear2(lineas.reduce((a, l) => a + l.baseImponible, 0));
  const cuotaIva = redondear2(lineas.reduce((a, l) => a + l.cuotaIva, 0));
  const cuotaRetencion = redondear2(lineas.reduce((a, l) => a + (l.retencionCuota || 0), 0));
  // Importe total: base + IVA - retención (práctica habitual; revisar perfil del obligado).
  const importeTotal = redondear2(baseImponible + cuotaIva - cuotaRetencion);
  return { baseImponible, cuotaIva, cuotaRetencion, importeTotal };
}

// ---------------------------------------------------------------------------
// Numeración y series
// ---------------------------------------------------------------------------

export function proximoNumero(serie: SerieFacturacion): number {
  return serie.ultimoNumero + 1;
}

export function numeroFacturaFormateado(serie: string, numero: number, ejercicio: number): string {
  return `${serie}-${ejercicio}-${String(numero).padStart(6, '0')}`;
}

export interface ValidacionNumeracion {
  valido: boolean;
  errores: string[];
}

/**
 * Una factura emitida NO puede ser silenciosamente renumerada ni puede reutilizar
 * un número anulado. Valida correlación, saltos y duplicados contra el histórico.
 */
export function validarNumeracion(
  serie: SerieFacturacion,
  numero: number,
  numerosExistentes: number[]
): ValidacionNumeracion {
  const errores: string[] = [];
  if (!Number.isInteger(numero) || numero <= 0) errores.push('numero_invalido');
  if (numero !== serie.ultimoNumero + 1) errores.push('salto_en_correlacion');
  if (numerosExistentes.includes(numero)) errores.push('numero_duplicado');
  return { valido: errores.length === 0, errores };
}

// ---------------------------------------------------------------------------
// Huella / hash — especificación AEAT v0.1.2
// ---------------------------------------------------------------------------

/** Hash SHA-256 en hexadecimal MAYÚSCULAS (64 chars). */
export function hashSha256(input: string): string {
  return sha256Hex(input);
}

/**
 * Formatea un valor según la especificación: trim de espacios iniciales/finales.
 * Los campos numéricos se normalizan a máx. 2 decimales sin ceros a la derecha
 * (123.10 y 123.1 son equivalentes). Vacío/ausente → ''.
 */
export function normalizarValorCampo(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') {
    // Normalización numérica conforme a la especificación (123.1 == 123.10).
    return String(redondear2(valor));
  }
  return String(valor).trim();
}

/**
 * Construye la cadena de entrada del hash para un REGISTRO DE ALTA, en el orden
 * exacto de la especificación AEAT v0.1.2 (apartado 3.a).
 */
export function cadenaHashAlta(input: {
  idEmisorFactura: string;
  numSerieFactura: string;
  fechaExpedicionFactura: string;
  tipoFactura: string;
  cuotaTotal: number;
  importeTotal: number;
  huellaAnterior: string; // '' si primer registro
  fechaHoraHusoGenRegistro: string;
}): string {
  const campos: [string, string][] = [
    ['IDEmisorFactura', normalizarValorCampo(input.idEmisorFactura)],
    ['NumSerieFactura', normalizarValorCampo(input.numSerieFactura)],
    ['FechaExpedicionFactura', normalizarValorCampo(input.fechaExpedicionFactura)],
    ['TipoFactura', normalizarValorCampo(input.tipoFactura)],
    ['CuotaTotal', normalizarValorCampo(input.cuotaTotal)],
    ['ImporteTotal', normalizarValorCampo(input.importeTotal)],
    ['Huella', normalizarValorCampo(input.huellaAnterior)],
    ['FechaHoraHusoGenRegistro', normalizarValorCampo(input.fechaHoraHusoGenRegistro)],
  ];
  return campos.map(([k, v]) => `${k}=${v}`).join('&');
}

/**
 * Cadena de entrada del hash para un REGISTRO DE ANULACIÓN (apartado 3.b).
 */
export function cadenaHashAnulacion(input: {
  idEmisorFacturaAnulada: string;
  numSerieFacturaAnulada: string;
  fechaExpedicionFacturaAnulada: string;
  huellaAnterior: string;
  fechaHoraHusoGenRegistro: string;
}): string {
  const campos: [string, string][] = [
    ['IDEmisorFacturaAnulada', normalizarValorCampo(input.idEmisorFacturaAnulada)],
    ['NumSerieFacturaAnulada', normalizarValorCampo(input.numSerieFacturaAnulada)],
    ['FechaExpedicionFacturaAnulada', normalizarValorCampo(input.fechaExpedicionFacturaAnulada)],
    ['Huella', normalizarValorCampo(input.huellaAnterior)],
    ['FechaHoraHusoGenRegistro', normalizarValorCampo(input.fechaHoraHusoGenRegistro)],
  ];
  return campos.map(([k, v]) => `${k}=${v}`).join('&');
}

// ---------------------------------------------------------------------------
// Generación del registro de facturación
// ---------------------------------------------------------------------------

export interface DatosRegistroAlta {
  propietarioId: string;
  facturaId: string;
  idEmisorFactura: string; // NIF emisor (obligado)
  numSerieFactura: string;
  fechaExpedicionFactura: string; // dd-mm-aaaa
  tipoFactura: TipoFactura;
  cuotaTotal: number;
  importeTotal: number;
  fechaHoraHusoGenRegistro: string; // ISO con huso
  registroAnterior?: RegistroFacturacion | null;
  modalidad?: 'VERIFACTU' | 'NO_VERIFACTU';
  timestampUtc?: string;
}

export function generarRegistroFacturacionAlta(datos: DatosRegistroAlta): RegistroGenerado {
  const previo = datos.registroAnterior ?? null;
  const huellaAnterior = previo ? previo.huella : '';
  const cadena = cadenaHashAlta({
    idEmisorFactura: datos.idEmisorFactura,
    numSerieFactura: datos.numSerieFactura,
    fechaExpedicionFactura: datos.fechaExpedicionFactura,
    tipoFactura: datos.tipoFactura,
    cuotaTotal: datos.cuotaTotal,
    importeTotal: datos.importeTotal,
    huellaAnterior,
    fechaHoraHusoGenRegistro: datos.fechaHoraHusoGenRegistro,
  });
  const huella = hashSha256(cadena);

  const registro: RegistroFacturacion = {
    id: `rf_${datos.facturaId}`,
    propietarioId: datos.propietarioId,
    facturaId: datos.facturaId,
    tipoRegistro: 'ALTA',
    idEmisorFactura: datos.idEmisorFactura,
    numSerieFactura: datos.numSerieFactura,
    fechaExpedicionFactura: datos.fechaExpedicionFactura,
    tipoFactura: datos.tipoFactura,
    cuotaTotal: redondear2(datos.cuotaTotal),
    importeTotal: redondear2(datos.importeTotal),
    fechaHoraHusoGenRegistro: datos.fechaHoraHusoGenRegistro,
    registroAnteriorId: previo?.id,
    huellaAnterior: huellaAnterior || undefined,
    primerRegistro: !previo,
    huella,
    modalidad: datos.modalidad || 'NO_VERIFACTU',
    timestampUtc: datos.timestampUtc || new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  return { registro, cadenaHasheada: cadena, huella, huellaAnterior };
}

// ---------------------------------------------------------------------------
// Verificación independiente de la cadena
// ---------------------------------------------------------------------------

export type ResultadoVerificacionCadena =
  | { valida: true; registros: number; huellas: string[] }
  | { valida: false; error: string; indice?: number };

export function verificarCadenaFacturacion(registros: RegistroFacturacion[]): ResultadoVerificacionCadena {
  if (registros.length === 0) {
    return { valida: false, error: 'sin_registros' };
  }

  // Orden cronológico por FechaHoraHusoGenRegistro; si no se cumple ⇒ reordenación.
  const ordenado = [...registros];
  ordenado.sort((a, b) => (a.fechaHoraHusoGenRegistro < b.fechaHoraHusoGenRegistro ? -1 : a.fechaHoraHusoGenRegistro > b.fechaHoraHusoGenRegistro ? 1 : 0));

  if (ordenado.map((r) => r.id).join('|') !== registros.map((r) => r.id).join('|')) {
    return { valida: false, error: 'orden_incorrecto', indice: -1 };
  }

  let huellaAnteriorEsperada = '';
  const huellas: string[] = [];

  for (let i = 0; i < ordenado.length; i++) {
    const r = ordenado[i];

    // Primer registro no debe tener huella anterior.
    if (i === 0) {
      if (!r.primerRegistro && r.huellaAnterior) {
        // Encadenado con anterior inexistente ⇒ eliminación del registro previo.
        return { valida: false, error: 'registro_eliminado_o_roto', indice: i };
      }
    } else {
      if (r.huellaAnterior !== huellaAnteriorEsperada) {
        return { valida: false, error: 'ruptura_de_cadena', indice: i };
      }
    }

    // Recalcular la huella del registro según el tipo.
    let cadena: string;
    if (r.tipoRegistro === 'ALTA') {
      cadena = cadenaHashAlta({
        idEmisorFactura: r.idEmisorFactura,
        numSerieFactura: r.numSerieFactura,
        fechaExpedicionFactura: r.fechaExpedicionFactura,
        tipoFactura: r.tipoFactura,
        cuotaTotal: r.cuotaTotal,
        importeTotal: r.importeTotal,
        huellaAnterior: r.huellaAnterior || '',
        fechaHoraHusoGenRegistro: r.fechaHoraHusoGenRegistro,
      });
    } else {
      cadena = cadenaHashAnulacion({
        idEmisorFacturaAnulada: r.idEmisorFactura,
        numSerieFacturaAnulada: r.numSerieFactura,
        fechaExpedicionFacturaAnulada: r.fechaExpedicionFactura,
        huellaAnterior: r.huellaAnterior || '',
        fechaHoraHusoGenRegistro: r.fechaHoraHusoGenRegistro,
      });
    }
    const recalculada = hashSha256(cadena);

    if (recalculada !== r.huella) {
      return { valida: false, error: 'hash_incorrecto', indice: i };
    }

    huellaAnteriorEsperada = r.huella;
    huellas.push(r.huella);
  }

  return { valida: true, registros: ordenado.length, huellas };
}

// ---------------------------------------------------------------------------
// QR — separación datosFactura → payloadQR (URL oficial) → render (UI)
// ---------------------------------------------------------------------------

export type ClaseSistemaFacturacion = 'VERIFACTU' | 'NO_VERIFACTU';

const URL_BASE_VERIFACTU = {
  sandbox: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
  produccion: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
} as const;

const URL_BASE_NO_VERIFACTU = {
  sandbox: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu',
  produccion: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu',
} as const;

export interface DatosQRFactura {
  nif: string; // NIF del obligado a expedir (9)
  numserie: string; // serie + número
  fecha: string; // dd-mm-aaaa
  importe: number; // total factura
  entorno: 'sandbox' | 'produccion';
  claseSistema: ClaseSistemaFacturacion;
}

/** Codifica un parámetro conforme a URL-encoding estándar (espacio→%20, etc.). */
function urlEncode(valor: string): string {
  return encodeURIComponent(valor)
    .replace(/%20/g, '%20') // mantener espacios como %20 (evitar '+')
    .replace(/%2F/gi, '%2F');
}

/**
 * URL de cotejo del código QR conforme a la especificación AEAT v0.5.0 (10/12/2025):
 * 4 parámetros obligatorios nif, numserie, fecha (DD-MM-AAAA), importe (punto decimal).
 * El número de serie y fecha mantienen sus caracteres (el '/' se URL-codifica).
 */
export function urlQrFactura(datos: DatosQRFactura): string {
  const base =
    datos.claseSistema === 'VERIFACTU'
      ? URL_BASE_VERIFACTU[datos.entorno]
      : URL_BASE_NO_VERIFACTU[datos.entorno];

  const importe = normalizarImporteQR(datos.importe);
  const params = [
    `nif=${urlEncode(normalizarValorCampo(datos.nif))}`,
    `numserie=${urlEncode(normalizarValorCampo(datos.numserie))}`,
    `fecha=${urlEncode(normalizarValorCampo(datos.fecha))}`,
    `importe=${importe}`,
  ].join('&');

  return `${base}?${params}`;
}

function normalizarImporteQR(importe: number): string {
  // Máx 12 enteros + 2 decimales, separador punto, sin ceros irrelevantes (241.4 válido).
  return String(redondear2(importe));
}

// ---------------------------------------------------------------------------
// Inalterabilidad: rectificativas / anulación (facturas emitidas no se editan)
// ---------------------------------------------------------------------------

/**
 * Crea una factura rectificativa. Nunca muta la original: la original queda
 * referenciada por `rectificadaPorId` y ésta apunta a `rectificaFacturaId`.
 */
export function crearFacturaRectificativa(
  original: Factura,
  nuevasLineas: LineaFactura[],
  motivo: string,
  tipoFacturaRectificativa: Factura['tipo'] = 'R1'
): Factura {
  const totales = totalesFactura(nuevasLineas);
  const ahora = new Date().toISOString();
  return {
    ...original,
    id: idFacturaDeInput(original.serie, original.numero + 1, original.ejercicio, original.propietarioId),
    tipo: tipoFacturaRectificativa,
    numero: original.numero + 1,
    fechaExpedicion: formatoDiaMesAnio(new Date()),
    fechaExpedicionUtc: ahora,
    lineas: nuevasLineas,
    baseImponible: totales.baseImponible,
    cuotaIva: totales.cuotaIva,
    cuotaRetencion: totales.cuotaRetencion,
    importeTotal: totales.importeTotal,
    estado: 'BORRADOR',
    rectificaFacturaId: original.id,
    motivoRectificacion: motivo,
    registroFacturacionId: undefined,
    createdAt: ahora,
    updatedAt: ahora,
  };
}

export function anularFactura(
  original: Factura,
  motivo: string
): { factura: Factura; datosAnulacion: { facturaId: string; motivo: string } } {
  const ahora = new Date().toISOString();
  return {
    factura: {
      ...original,
      estado: 'ANULADA',
      motivoRectificacion: motivo,
      updatedAt: ahora,
    },
    datosAnulacion: { facturaId: original.id, motivo: motivo },
  };
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function idFacturaDeInput(serie: string, numero: number, ejercicio: number, propietarioId: string): string {
  return `fac_${serie}_${ejercicio}_${String(numero).padStart(6, '0')}_${propietarioId}`;
}

function formatoDiaMesAnio(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export function fechaExpedicionDesdeFecha(d: Date): string {
  return formatoDiaMesAnio(d);
}

export function fechaHoraHusoActual(d: Date = new Date()): string {
  // ISO 8601 con huso local (equivalente al formato del ejemplo oficial).
  const pad = (n: number) => String(n).padStart(2, '0');
  const offset = -d.getTimezoneOffset();
  const signo = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const hh = pad(Math.floor(abs / 60));
  const mm = pad(abs % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${signo}${hh}:${mm}`;
}
