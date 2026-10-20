/**
 * P6 — Paquete del asesor: intervalo de fechas, documentos originales
 * custodiados (P3), titularidades registradas y resumen estructurado.
 *
 * Fixtures sintéticas; el motor y el verificador son puros (sin Firebase ni
 * red). Los binarios se aportan como bytes en memoria, igual que hará el
 * adaptador de Storage, para probar la cadena completa índice → ZIP → verificación.
 */
import { describe, expect, it } from 'vitest';
import type { CobroPeriodo, ContratoFormalizacion, Gasto, Inmueble, PolizaSeguro, Titularidad } from '../../types';
import type { Factura } from '../../types/facturacion';
import type { LiquidacionPropietario } from '../../tesoreria/tipos';
import type { DocumentoPatrimonial } from '../expedienteDocumental/tipos';
import type { AmbitoAutorizado } from '../importExport/contrato';
import { crearZip, utf8Bytes, type EntradaZip } from '../expedienteFiscal/zip';
import { sha256Hex } from '../importacion/hash';
import { empaquetarPaqueteAsesor, generarPaqueteAsesor, validarAmbitoPaquete } from './motor';
import { leerEntradasZipPaqueteAsesor, verificarPaqueteAsesorZip } from './verificador';
import type { EntradaPaqueteAsesor, PaqueteAsesorGenerado, SolicitudPaqueteAsesor } from './tipos';

const GENERADO_EN = '2026-10-20T09:00:00.000Z';
const AUT: AmbitoAutorizado = {
  propietarioIdsLegibles: ['p1'], propietarioIdsEscribibles: ['p1'], esMaster: false,
};

const inmuebles = [
  {
    id: 'i1', direccion: 'Calle Mayor 1', ciudad: 'Alicante', propietarioId: 'p1',
    propietarioPrincipalId: 'p1', referenciaCatastral: 'RC-1', estado: 'alquilado',
    tipoInmueble: 'piso', estadoPatrimonial: 'ACTIVO', superficie: 80,
    gastosAnualesDeclarados: { comunidad: 600, ibi: 210, ejercicio: 2024 },
    titularidadDeclarada: { texto: '100% propietaria', porcentajePropietario1: 100, resuelta: true },
  },
  {
    id: 'i2', direccion: 'Calle Sol 2', ciudad: 'Madrid', propietarioId: 'p1',
    estado: 'disponible', tipoInmueble: 'piso',
  },
  {
    id: 'i9', direccion: 'Ajena 9', ciudad: 'Valencia', propietarioId: 'p2',
    estado: 'alquilado', tipoInmueble: 'piso',
  },
] as unknown as Inmueble[];

function cobro(id: string, extra: Record<string, unknown> = {}): CobroPeriodo {
  return {
    id, contratoId: 'c1', inmuebleId: 'i1', propietarioId: 'p1',
    anio: 2024, mes: 6, periodoMesAnio: '2024-06', nombreMes: 'Junio 2024',
    fechaVencimiento: '2024-06-05', fechaPago: '2024-06-03',
    importePrevisto: 600, importeRecibido: 600, estado: 'RECIBIDO',
    inquilinoNombre: 'Inquilina',
    ...extra,
  } as unknown as CobroPeriodo;
}

const contratos = [{
  id: 'c1', inmuebleId: 'i1', propietarioId: 'p1', candidatoNombre: 'Inquilina',
  fechaInicioContrato: '2023-01-01', fechaFinContrato: '2025-12-31',
  rentaMensual: 600, estado: 'FIRMADO', inmuebleDireccion: 'Calle Mayor 1',
  registroCobros: [
    cobro('cob-en'),
    cobro('cob-fuera', {
      mes: 1, periodoMesAnio: '2024-01', nombreMes: 'Enero 2024',
      fechaVencimiento: '2024-01-05', fechaPago: '2024-01-03',
    }),
    cobro('cob-sin-fecha', { fechaVencimiento: undefined, fechaPago: undefined }),
  ],
}] as unknown as ContratoFormalizacion[];

function gasto(id: string, extra: Record<string, unknown> = {}): Gasto {
  return {
    id, inmuebleId: 'i1', propietarioId: 'p1', tipo: 'EXPLOTACION', categoria: 'MANTENIMIENTO',
    concepto: `Gasto ${id}`, proveedor: 'Proveedor SL', importe: 100, estado: 'PAGADO',
    aCargoDe: 'arrendador', fechaDevengo: '2024-06-10', ejercicioFiscal: 2024,
    createdAt: '2024-06-10T00:00:00Z', updatedAt: '2024-06-10T00:00:00Z',
    ...extra,
  } as unknown as Gasto;
}

const gastos: Gasto[] = [
  gasto('g-en', { facturaId: 'f-en', fechaPago: '2024-06-15' }),
  gasto('g-fuera', { fechaDevengo: '2024-01-10' }),
  gasto('g-sin-fecha', { fechaDevengo: undefined, fechaPago: undefined, fecha: undefined }),
  gasto('g-ajeno', { propietarioId: 'p2', inmuebleId: 'i9', fechaDevengo: '2024-06-11' }),
];

const facturas = [{
  id: 'f-en', propietarioId: 'p1', inmuebleId: 'i1', gastoId: 'g-en',
  clase: 'RECIBIDA', tipo: 'F1', serie: 'REC', numero: 1, ejercicio: 2024,
  fechaExpedicion: '10-06-2024', emisor: { nombre: 'Proveedor SL', nif: 'B1' },
  receptor: { nombre: 'Propietaria', nif: 'A1' },
  baseImponible: 100, cuotaIva: 21, cuotaRetencion: 0, importeTotal: 121,
  estado: 'ACEPTADA',
}] as unknown as Factura[];

const liquidaciones = [{
  id: 'liq-en', propietarioId: 'p1', propietarioNombre: 'Propietaria',
  periodo: '2024-06', anio: 2024, mes: 6, inmuebleIds: ['i1'],
  totalBrutoCobrado: 600, totalHonorarios: 0, totalIvaHonorarios: 0,
  totalGastos: 0, totalRetenciones: 0, totalAjustes: 0, totalDeducciones: 0,
  netoPropietario: 600, estado: 'PAGADA', fechaGeneracion: '2024-07-01T00:00:00Z',
}] as unknown as LiquidacionPropietario[];

const polizas = [{
  id: 'pol-en', propietarioId: 'p1', inmuebleId: 'i1', aseguradora: 'Seguros X',
  numeroPoliza: 'PX-1', tipo: 'HOGAR', fechaInicio: '2024-01-01',
  fechaVencimiento: '2024-12-31', estado: 'ACTIVA', primaAnual: 240,
}] as unknown as PolizaSeguro[];

function bytesDe(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

const BYTES_FACTURA = bytesDe('%PDF-1.4 factura original (contenido binario sintético)');
const BYTES_JUSTIFICANTE = bytesDe('%PDF-1.4 justificante de pago sintético');

function documento(over: Record<string, unknown> = {}): DocumentoPatrimonial {
  return {
    id: 'd1', inmuebleId: 'i1', propietarioId: 'p1', tipo: 'FACTURA_GASTO',
    nombre: 'Factura fontanería.pdf', nombreStorage: 'factura.pdf',
    mimeType: 'application/pdf', tamanoBytes: BYTES_FACTURA.byteLength,
    sha256: sha256Hex(BYTES_FACTURA),
    storagePath: 'inmuebles/i1/documentos_patrimoniales/d1/factura.pdf',
    fechaDocumental: '2024-06-10', fechaIncorporacion: '2024-06-11T08:00:00.000Z',
    actorId: 'p1', actorNombre: 'Propietaria', version: 1, estado: 'DISPONIBLE',
    gastoId: 'g-en', facturaId: 'f-en',
    ...over,
  } as unknown as DocumentoPatrimonial;
}

const documentos = [
  documento(),
  documento({
    id: 'd2', tipo: 'JUSTIFICANTE_PAGO_GASTO', nombre: 'Justificante pago.pdf',
    nombreStorage: 'justificante.pdf', tamanoBytes: BYTES_JUSTIFICANTE.byteLength,
    sha256: sha256Hex(BYTES_JUSTIFICANTE),
    storagePath: 'inmuebles/i1/documentos_patrimoniales/d2/justificante.pdf',
    gastoId: 'g-en', facturaId: undefined,
  }),
  documento({
    id: 'd3', tipo: 'CONTRATO', nombre: 'Contrato 2023.pdf', nombreStorage: 'contrato.pdf',
    tamanoBytes: 10, sha256: sha256Hex(bytesDe('contrato!!')),
    storagePath: 'inmuebles/i1/documentos_patrimoniales/d3/contrato.pdf',
    fechaDocumental: '2023-01-01', fechaIncorporacion: '2023-01-02T08:00:00.000Z',
    gastoId: undefined, facturaId: undefined, contratoId: 'c1',
  }),
  documento({
    id: 'PENDIENTE-1', tipo: 'OTRO', estado: 'PENDIENTE_STORAGE', nombre: 'Escritura pendiente.pdf',
    storagePath: '', sha256: '', tamanoBytes: 0, fechaDocumental: '2024-06-12',
    gastoId: undefined, facturaId: undefined,
  }),
  documento({
    id: 'SIN-HASH', tipo: 'OTRO', nombre: 'Recibo sin hash.pdf', sha256: '', tamanoBytes: 12,
    storagePath: 'inmuebles/i1/documentos_patrimoniales/SIN-HASH/r.pdf',
    gastoId: undefined, facturaId: undefined,
  }),
  documento({
    id: 'AJENO', inmuebleId: 'i9', propietarioId: 'p2', nombre: 'Documento ajeno.pdf',
    storagePath: 'inmuebles/i9/documentos_patrimoniales/AJENO/a.pdf',
    gastoId: undefined, facturaId: undefined,
  }),
];

const titularidades = [
  {
    id: 'i1__p1', inmuebleId: 'i1', propietarioId: 'p1', porcentajeTitularidad: 60,
    estado: 'ACTIVA', fechaInicio: '2020-01-01', createdAt: '2020-01-01T00:00:00Z',
    updatedAt: '2020-01-01T00:00:00Z',
  },
  {
    id: 'i1__p1-bis', inmuebleId: 'i1', propietarioId: 'p1', porcentajeTitularidad: null,
    estado: 'PENDIENTE', fechaInicio: '2021-01-01', createdAt: '2021-01-01T00:00:00Z',
    updatedAt: '2021-01-01T00:00:00Z',
  },
  {
    id: 'i1__invalida', inmuebleId: 'i1', propietarioId: 'p1', porcentajeTitularidad: 140,
    estado: 'ACTIVA', fechaInicio: '2022-01-01', createdAt: '2022-01-01T00:00:00Z',
    updatedAt: '2022-01-01T00:00:00Z',
  },
  {
    id: 'i9__p2', inmuebleId: 'i9', propietarioId: 'p2', porcentajeTitularidad: 100,
    estado: 'ACTIVA', fechaInicio: '2020-01-01', createdAt: '2020-01-01T00:00:00Z',
    updatedAt: '2020-01-01T00:00:00Z',
  },
] as unknown as Titularidad[];

function entrada(extra: Partial<EntradaPaqueteAsesor> = {}): EntradaPaqueteAsesor {
  return { inmuebles, contratos, gastos, facturas, liquidaciones, polizas, ...extra };
}

function generar(
  solicitud: SolicitudPaqueteAsesor,
  extra: Partial<EntradaPaqueteAsesor> = {},
): PaqueteAsesorGenerado {
  return generarPaqueteAsesor(entrada(extra), solicitud, AUT, {
    generatedAt: GENERADO_EN, generatedBy: 'test-p6',
  });
}

function zipDe(paquete: PaqueteAsesorGenerado, opciones = {}): Uint8Array {
  return empaquetarPaqueteAsesor(paquete, opciones).zip;
}

function errores(zip: Uint8Array): string[] {
  return verificarPaqueteAsesorZip(zip).problemas.filter((p) => p.nivel === 'ERROR').map((p) => p.codigo);
}

function entradaTexto(zip: Uint8Array, ruta: string): string {
  const { entradas } = leerEntradasZipPaqueteAsesor(zip);
  const e = entradas.find((x) => x.nombre === ruta);
  if (!e) throw new Error(`entrada ${ruta} ausente`);
  return new TextDecoder('utf-8').decode(e.bytes);
}

function zipConEntrada(zip: Uint8Array, ruta: string, contenido: Uint8Array | null): Uint8Array {
  const { entradas } = leerEntradasZipPaqueteAsesor(zip);
  const nuevas: EntradaZip[] = entradas
    .filter((e) => e.nombre !== ruta)
    .map((e) => ({ ruta: e.nombre, contenido: e.bytes }));
  if (contenido !== null) nuevas.push({ ruta, contenido });
  return crearZip(nuevas);
}

const SOLO_RANGO: SolicitudPaqueteAsesor = {
  propietarioIds: ['p1'],
  rangoFechas: { desde: '2024-06-01', hasta: '2024-06-30' },
  incluirDocumentos: false,
};

describe('P6 · intervalo de fechas', () => {
  it('valida el rango y sus contradicciones con ejercicios/meses (fail-closed)', () => {
    expect(validarAmbitoPaquete(SOLO_RANGO, AUT, inmuebles).ok).toBe(true);
    expect(validarAmbitoPaquete(
      { propietarioIds: ['p1'], rangoFechas: { desde: '2024-06-31', hasta: '2024-07-01' } }, AUT, inmuebles,
    ).ok).toBe(false);
    expect(validarAmbitoPaquete(
      { propietarioIds: ['p1'], rangoFechas: { desde: '2024-07-01', hasta: '2024-06-01' } }, AUT, inmuebles,
    ).ok).toBe(false);
    expect(validarAmbitoPaquete(
      {
        propietarioIds: ['p1'], ejercicios: [2024],
        rangoFechas: { desde: '2024-12-01', hasta: '2025-01-31' },
      }, AUT, inmuebles,
    ).ok).toBe(false);
    expect(validarAmbitoPaquete(
      {
        propietarioIds: ['p1'], meses: ['2024-06'],
        rangoFechas: { desde: '2024-06-01', hasta: '2024-07-31' },
      }, AUT, inmuebles,
    ).ok).toBe(false);
  });

  it('filtra por fecha de libro/factura y lo declara en manifest e informe', () => {
    const p = generar(SOLO_RANGO);
    expect(p.manifest.rangoFechasEfectivo).toEqual({ desde: '2024-06-01', hasta: '2024-06-30' });
    expect(p.filas.cobros.map((c) => c.id)).toEqual(['cob-en']);
    expect(p.incidencias.some((i) => i.codigo === 'COBRO_SIN_FECHA_RANGO' && i.id === 'cob-sin-fecha')).toBe(true);
    expect(p.filas.gastos.map((g) => g.id)).toEqual(['g-en']);
    expect(p.incidencias.some((i) => i.codigo === 'GASTO_SIN_FECHA_RANGO' && i.id === 'g-sin-fecha')).toBe(true);
    expect(p.filas.facturas.map((f) => f.id)).toEqual(['f-en']);
    expect(p.filas.liquidaciones.map((l) => l.id)).toEqual(['liq-en']);
    expect(p.filas.polizas.map((l) => l.id)).toEqual(['pol-en']); // solapa con junio
    expect(p.libro.map((l) => l.fuenteId).sort()).toEqual(['cob-en', 'g-en']);

    const zip = zipDe(p);
    expect(errores(zip)).toEqual([]);
    const informe = entradaTexto(zip, 'informe.txt');
    expect(informe).toContain('Rango de fechas: 2024-06-01..2024-06-30');
  });

  it('un rango sin coincidencias produce un paquete válido y vacío (no silencioso)', () => {
    const p = generar({
      propietarioIds: ['p1'], rangoFechas: { desde: '2030-01-01', hasta: '2030-01-31' },
      incluirDocumentos: false,
    });
    expect(p.libro).toEqual([]);
    expect(p.manifest.advertencias.some((a) => a.includes('no contiene líneas'))).toBe(true);
    expect(errores(zipDe(p))).toEqual([]);
  });
});

describe('P6 · documentos originales (custodia P3)', () => {
  it('indexa solo documentos del ámbito y distingue estados, sin inventar binarios', () => {
    const p = generar({
      propietarioIds: ['p1'], ejercicios: [2024], incluirDocumentos: true, incluirResumenEstructurado: true,
    }, { documentosPatrimoniales: documentos });
    const porId = new Map(p.documentos.map((d) => [d.documentoId, d]));
    expect([...porId.keys()].sort()).toEqual(['PENDIENTE-1', 'SIN-HASH', 'd1', 'd2']);
    expect(porId.get('d1')?.estado).toBe('PENDIENTE_BINARIO');
    expect(porId.get('PENDIENTE-1')?.estado).toBe('NO_DISPONIBLE');
    expect(porId.get('SIN-HASH')?.estado).toBe('SIN_HASH');
    // El documento de 2023 (contrato) queda fuera del periodo aunque su
    // contrato siga vigente: no se atribuye por el vínculo.
    expect(porId.has('d3')).toBe(false);
    expect(p.incidencias.some((i) => i.codigo === 'DOCUMENTO_NO_DISPONIBLE' && i.id === 'PENDIENTE-1')).toBe(true);
    expect(p.incidencias.some((i) => i.codigo === 'DOCUMENTO_SIN_HASH' && i.id === 'SIN-HASH')).toBe(true);
    expect(p.manifest.conteos.documentos).toBe(4);
    expect(p.manifest.numDocumentosIncluidos).toBe(0);
    expect(p.manifest.numDocumentosNoIncluidos).toBe(4);
    // El resumen declara la misma limitación; no hay binarios aún.
    expect(p.resumen?.documentos.incluidos).toBe(0);
    expect(p.resumen?.documentos.noIncluidos).toBe(4);
  });

  it('respeta el filtro de tipos documentales y lo deja declarado', () => {
    const p = generar({
      propietarioIds: ['p1'], ejercicios: [2024], incluirDocumentos: true,
      tiposDocumento: ['FACTURA_GASTO'],
    }, { documentosPatrimoniales: documentos });
    expect(p.documentos.map((d) => d.documentoId)).toEqual(['d1']);
    expect(p.manifest.advertencias.some((a) => a.includes('filtro de tipos'))).toBe(true);
  });

  it('empaqueta los originales verificados con rutas seguras, hashes y conteos', () => {
    const p = generar({
      propietarioIds: ['p1'], ejercicios: [2024], incluirDocumentos: true, incluirResumenEstructurado: true,
    }, { documentosPatrimoniales: documentos });
    const resultado = empaquetarPaqueteAsesor(p, {
      documentosOriginales: [
        { documentoId: 'd1', bytes: BYTES_FACTURA },
        { documentoId: 'd2', bytes: BYTES_JUSTIFICANTE },
      ],
    });
    const rutas = resultado.entradas.map((e) => e.ruta);
    expect(rutas.filter((r) => r.startsWith('documentos/')).sort()).toEqual([
      'documentos/i1/FACTURA_GASTO/' + `${sha256Hex(BYTES_FACTURA).slice(0, 8)}_Factura_fontaneria.pdf`,
      'documentos/i1/JUSTIFICANTE_PAGO_GASTO/' + `${sha256Hex(BYTES_JUSTIFICANTE).slice(0, 8)}_Justificante_pago.pdf`,
    ].sort());
    expect(rutas).toContain('documentos.json');
    expect(resultado.manifest.incluyeBinariosDocumentales).toBe(true);
    expect(resultado.manifest.numDocumentosIncluidos).toBe(2);
    expect(resultado.manifest.numDocumentosNoIncluidos).toBe(2);
    for (const doc of resultado.documentos.filter((d) => d.estado === 'INCLUIDO')) {
      expect(doc.sha256Incluido).toBe(doc.sha256);
      expect(resultado.manifest.hashes[doc.rutaZip ?? '']).toBe(doc.sha256);
    }
    const informe = verificarPaqueteAsesorZip(resultado.zip);
    expect(informe.ok).toBe(true);
    expect(informe.numEntradasZip).toBe(16); // 12 base + resumen + índice + 2 binarios
    // Los bytes del ZIP son EXACTAMENTE los originales (no OCR ni resumen).
    const { entradas } = leerEntradasZipPaqueteAsesor(resultado.zip);
    const binario = entradas.find((e) => e.nombre === resultado.documentos.find((d) => d.documentoId === 'd1')?.rutaZip);
    expect(binario && sha256Hex(binario.bytes)).toBe(sha256Hex(BYTES_FACTURA));
  });

  it('un binario manipulado NO se incluye y queda INTEGRIDAD_DUDOSA sin bloquear el paquete', () => {
    const p = generar({
      propietarioIds: ['p1'], ejercicios: [2024], incluirDocumentos: true,
    }, { documentosPatrimoniales: documentos });
    const alterado = bytesDe('%PDF-1.4 factura MANIPULADA');
    const resultado = empaquetarPaqueteAsesor(p, {
      documentosOriginales: [
        { documentoId: 'd1', bytes: alterado },
        { documentoId: 'd2', bytes: BYTES_JUSTIFICANTE },
      ],
    });
    const d1 = resultado.documentos.find((d) => d.documentoId === 'd1');
    expect(d1).toMatchObject({ estado: 'INTEGRIDAD_DUDOSA', sha256Incluido: null, rutaZip: null });
    expect(resultado.entradas.some((e) => e.ruta.includes('Factura_fontaneria'))).toBe(false);
    expect(resultado.manifest.advertencias.some((a) => a.includes('no coincide con el registrado'))).toBe(true);
    expect(verificarPaqueteAsesorZip(resultado.zip).ok).toBe(true);
  });

  it('un fallo de lectura se declara NO_ACCESIBLE y el ZIP sigue siendo válido', () => {
    const p = generar({
      propietarioIds: ['p1'], ejercicios: [2024], incluirDocumentos: true,
    }, { documentosPatrimoniales: documentos });
    const resultado = empaquetarPaqueteAsesor(p, {
      documentosOriginales: [{ documentoId: 'd2', bytes: BYTES_JUSTIFICANTE }],
      fallosDocumentos: [{ documentoId: 'd1', codigo: 'NO_ACCESIBLE' }],
    });
    expect(resultado.documentos.find((d) => d.documentoId === 'd1')?.estado).toBe('NO_ACCESIBLE');
    expect(resultado.manifest.numDocumentosIncluidos).toBe(1);
    expect(resultado.manifest.advertencias.some((a) => a.includes('no incluido'))).toBe(true);
    expect(verificarPaqueteAsesorZip(resultado.zip).ok).toBe(true);
  });

  it('el índice declara los documentos no incluidos y el verificador detecta un índice inflado', () => {
    const p = generar({
      propietarioIds: ['p1'], ejercicios: [2024], incluirDocumentos: true,
    }, { documentosPatrimoniales: documentos });
    const resultado = empaquetarPaqueteAsesor(p, {
      documentosOriginales: [{ documentoId: 'd1', bytes: BYTES_FACTURA }],
    });
    expect(JSON.parse(entradaTexto(resultado.zip, 'documentos.json'))).toHaveLength(4);

    const manifiesto = JSON.parse(entradaTexto(resultado.zip, 'manifest.json'));
    manifiesto.numDocumentosIncluidos = 3; // mentira
    const manipulado = zipConEntrada(resultado.zip, 'manifest.json', utf8Bytes(JSON.stringify(manifiesto)));
    expect(errores(manipulado)).toContain('DOCUMENTOS_CONTEO_NO_COINCIDE');

    const bandera = JSON.parse(entradaTexto(resultado.zip, 'manifest.json'));
    bandera.incluyeBinariosDocumentales = false;
    const sinBandera = zipConEntrada(resultado.zip, 'manifest.json', utf8Bytes(JSON.stringify(bandera)));
    expect(errores(sinBandera)).toContain('BANDERAS_MANIFEST_INVALIDAS');
  });

  it('rechaza un binario huérfano y un binario alterado en el ZIP', () => {
    const p = generar({
      propietarioIds: ['p1'], ejercicios: [2024], incluirDocumentos: true,
    }, { documentosPatrimoniales: documentos });
    const resultado = empaquetarPaqueteAsesor(p, {
      documentosOriginales: [{ documentoId: 'd1', bytes: BYTES_FACTURA }],
    });
    const huerfano = zipConEntrada(resultado.zip, 'documentos/i1/OTRO/huerfano.pdf', utf8Bytes('x'));
    expect(errores(huerfano)).toContain('DOCUMENTO_ZIP_NO_DECLARADO');

    const ruta = resultado.documentos.find((d) => d.documentoId === 'd1')?.rutaZip ?? '';
    const alterado = zipConEntrada(resultado.zip, ruta, bytesDe('%PDF-1.4 otro contenido'));
    const codigos = errores(alterado);
    expect(codigos).toContain('DOCUMENTO_HASH_NO_COINCIDE');
  });

  it('un binario aportado que no está en el índice se ignora (no entra al ZIP)', () => {
    const p = generar({
      propietarioIds: ['p1'], ejercicios: [2024], incluirDocumentos: true,
    }, { documentosPatrimoniales: documentos });
    const resultado = empaquetarPaqueteAsesor(p, {
      documentosOriginales: [
        { documentoId: 'd1', bytes: BYTES_FACTURA },
        { documentoId: 'NO-INDEXADO', bytes: bytesDe('intruso') },
      ],
    });
    expect(resultado.entradas.some((e) => e.ruta.includes('intruso'))).toBe(false);
    expect(resultado.manifest.advertencias.some((a) => a.includes('sin entrada en el índice'))).toBe(true);
    expect(verificarPaqueteAsesorZip(resultado.zip).ok).toBe(true);
  });

  it('sin documentos solicitados lo declara y no emite índice documental', () => {
    const p = generar({ propietarioIds: ['p1'], ejercicios: [2024], incluirDocumentos: false });
    expect(p.documentos).toEqual([]);
    expect(p.manifest.advertencias.some((a) => a.includes('no solicitados'))).toBe(true);
    const resultado = empaquetarPaqueteAsesor(p);
    expect(resultado.entradas.map((e) => e.ruta)).not.toContain('documentos.json');
    expect(resultado.manifest.incluyeBinariosDocumentales).toBe(false);
  });
});

describe('P6 · titularidades y resumen estructurado', () => {
  it('copia el porcentaje registrado (null = PENDIENTE) y excluye fuera de ámbito/ilegibles', () => {
    const p = generar({
      propietarioIds: ['p1'], ejercicios: [2024], incluirResumenEstructurado: true,
    }, { titularidades });
    const porId = new Map((p.resumen?.titularidades ?? []).map((t) => [t.id, t]));
    expect([...porId.keys()].sort()).toEqual(['i1__p1', 'i1__p1-bis']);
    expect(porId.get('i1__p1')?.porcentajeTitularidad).toBe(60);
    expect(porId.get('i1__p1-bis')?.porcentajeTitularidad).toBeNull();
    expect(p.resumen?.titularidades.every((t) => t.origen === 'TITULARIDAD_REGISTRADA')).toBe(true);
    expect(p.incidencias.some((i) => i.codigo === 'TITULARIDAD_PORCENTAJE_INVALIDO' && i.id === 'i1__invalida')).toBe(true);
    expect(p.incidencias.some((i) => i.codigo === 'TITULARIDAD_INMUEBLE_PROPIETARIO_DISTINTO')).toBe(false);
    // La ficha separa el dato DECLARADO en origen de las titularidades registradas.
    const ficha = p.resumen?.inmuebles.find((i) => i.id === 'i1');
    expect(ficha?.titularidadDeclarada?.texto).toBe('100% propietaria');
    expect(ficha?.titulares.map((t) => t.propietarioId)).toEqual(['p1', 'p1']);
    expect(p.manifest.conteos.titularidades).toBe(2);
  });

  it('resumen.json se serializa, coincide con el manifiesto y el verificador lo valida', () => {
    const p = generar({
      propietarioIds: ['p1'], ejercicios: [2024],
      incluirDocumentos: true, incluirResumenEstructurado: true,
    }, { documentosPatrimoniales: documentos, titularidades });
    const resultado = empaquetarPaqueteAsesor(p, {
      documentosOriginales: [{ documentoId: 'd1', bytes: BYTES_FACTURA }],
    });
    expect(resultado.manifest.incluyeResumenEstructurado).toBe(true);
    const resumen = JSON.parse(entradaTexto(resultado.zip, 'resumen.json'));
    expect(resumen.documentos.incluidos).toBe(1);
    expect(resumen.documentos.noIncluidos).toBe(3);
    expect(resumen.titularidades).toHaveLength(2);
    expect(errores(resultado.zip)).toEqual([]);
    expect(errores(resultado.zip)).not.toContain('RESUMEN_CONTEO_NO_COINCIDE');

    const alterado = JSON.parse(entradaTexto(resultado.zip, 'resumen.json'));
    alterado.conteos.titularidades = 99;
    const zip = zipConEntrada(resultado.zip, 'resumen.json', utf8Bytes(JSON.stringify(alterado)));
    expect(errores(zip)).toContain('RESUMEN_CONTEO_NO_COINCIDE');

    const porcentaje = JSON.parse(entradaTexto(resultado.zip, 'resumen.json'));
    porcentaje.titularidades[0].porcentajeTitularidad = 120;
    const zipPorcentaje = zipConEntrada(resultado.zip, 'resumen.json', utf8Bytes(JSON.stringify(porcentaje)));
    expect(errores(zipPorcentaje)).toContain('TITULARIDAD_PORCENTAJE_INVALIDO');
  });

  it('la cobertura fiscal distingue gasto, factura, pago y deducibilidad del motor', () => {
    const p = generar({
      propietarioIds: ['p1'], ejercicios: [2024], incluirResumenEstructurado: true,
      incluirDocumentos: true,
    }, { documentosPatrimoniales: documentos });
    const c = p.resumen?.coberturaFiscal;
    expect(c).toMatchObject({
      gastosRegistrados: 3,
      gastosConFacturaVinculada: 1,
      gastosSinFacturaVinculada: 2,
      gastosConJustificantePagoRegistrado: 1,
      gastosDeduciblesSegunMotor: 3,
      gastosNoDeduciblesSegunMotor: 0,
      documentosTipoFactura: 1,
      documentosTipoJustificantePago: 1,
    });
    // El justificante de pago no altera la decisión de deducibilidad del motor.
    const g = p.libro.find((l) => l.fuenteId === 'g-en');
    expect(g?.deducible).toBe(true);
    const sinFactura = p.libro.find((l) => l.fuenteId === 'g-sin-fecha');
    expect(sinFactura).toBeUndefined(); // sin fecha no entra al libro
    expect(p.manifest.totales.totalGastosDeducibles).toBe(200); // g-en + g-fuera (ambos 2024)

    const zip = zipDe(p, { documentosOriginales: [{ documentoId: 'd2', bytes: BYTES_JUSTIFICANTE }] });
    const informe = entradaTexto(zip, 'informe.txt');
    expect(informe).toContain('justificante de pago NO confirma');
  });

  it('sin resumen solicitado no se emite resumen.json (contrato anterior intacto)', () => {
    const p = generar({ propietarioIds: ['p1'], ejercicios: [2024] });
    expect(p.resumen).toBeUndefined();
    expect(p.manifest.incluyeResumenEstructurado).toBeUndefined();
    const resultado = empaquetarPaqueteAsesor(p);
    expect(resultado.entradas.map((e) => e.ruta)).not.toContain('resumen.json');
    expect(verificarPaqueteAsesorZip(resultado.zip).numEntradasZip).toBe(12);
  });

  it('el documento no puede alterar el libro ni sustituir el original', () => {
    const p = generar({
      propietarioIds: ['p1'], ejercicios: [2024], incluirDocumentos: true,
    }, { documentosPatrimoniales: documentos });
    const resultado = empaquetarPaqueteAsesor(p, {
      documentosOriginales: [{ documentoId: 'd2', bytes: BYTES_JUSTIFICANTE }],
    });
    // El libro sigue exactamente igual que sin documentos.
    const sinDocs = generar({ propietarioIds: ['p1'], ejercicios: [2024], incluirDocumentos: false });
    expect(p.libro).toEqual(sinDocs.libro);
    expect(p.manifest.totales).toEqual(sinDocs.manifest.totales);
    // La entrada del ZIP es el original, byte a byte.
    const { entradas } = leerEntradasZipPaqueteAsesor(resultado.zip);
    const ruta = resultado.documentos.find((d) => d.documentoId === 'd2')?.rutaZip ?? '';
    const binario = entradas.find((e) => e.nombre === ruta);
    expect(binario?.bytes).toEqual(BYTES_JUSTIFICANTE);
  });
});
