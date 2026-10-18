/**
 * AUDITORÍA ADVERSARIAL FASE F — ataques reproducibles sobre el núcleo del
 * paquete del asesor y su verificador. Cada caso declara: entrada, propiedad
 * atacada, resultado esperado y código de error/incidencia exigido. Las
 * fixtures son sintéticas y los resultados esperados (totales, vectores
 * CRC/SHA) se calculan aquí, no se leen del motor.
 */
import { describe, expect, it } from 'vitest';
import type {
  CobroPeriodo, ContratoFormalizacion, Gasto, Inmueble, PolizaSeguro,
} from '../../types';
import type { Factura } from '../../types/facturacion';
import type { LiquidacionPropietario } from '../../tesoreria/tipos';
import { crc32, crearZip, utf8Bytes, type EntradaZip } from '../expedienteFiscal/zip';
import { sha256Hex } from '../importacion/hash';
import {
  empaquetarPaqueteAsesor, generarPaqueteAsesor, validarAmbitoPaquete,
} from './motor';
import type {
  AmbitoAutorizado, EntradaPaqueteAsesor, SolicitudPaqueteAsesor,
} from './tipos';
import { leerEntradasZipPaqueteAsesor, verificarPaqueteAsesorZip } from './verificador';

const GENERADO = '2026-10-18T12:00:00.000Z';
const AUT_P1: AmbitoAutorizado = {
  esMaster: false, propietarioIdsLegibles: ['p1'], propietarioIdsEscribibles: ['p1'],
};
const AUT_MASTER: AmbitoAutorizado = {
  esMaster: true, propietarioIdsLegibles: null, propietarioIdsEscribibles: null,
};
const secretoP2 = 'DIRECCION-SECRETA-P2';

function inmueble(id: string, propietarioId = 'p1', extra: Record<string, unknown> = {}): Inmueble {
  return {
    id, direccion: `Calle ${id}`, ciudad: 'Alicante', referenciaCatastral: `RC-${id}`,
    propietarioId, estado: 'alquilado', tipoInmueble: 'piso', ...extra,
  } as unknown as Inmueble;
}

function cobro(id: string, extra: Record<string, unknown> = {}): CobroPeriodo {
  return {
    id, contratoId: 'c1', inmuebleId: 'i1', propietarioId: 'p1', inquilinoId: 'inq1',
    inquilinoNombre: 'Inquilina', mes: 2, anio: 2025, periodoMesAnio: '2025-02',
    nombreMes: 'Febrero 2025', importePrevisto: 600, importeRecibido: 600,
    fechaVencimiento: '2025-02-05', fechaPago: '2025-02-03', estado: 'COBRADO',
    metodoPago: 'transferencia', inmuebleDireccion: 'Calle i1', ...extra,
  } as unknown as CobroPeriodo;
}

function contrato(id: string, extra: Record<string, unknown> = {}): ContratoFormalizacion {
  return {
    id, inmuebleId: 'i1', propietarioId: 'p1', candidatoNombre: 'Inquilina',
    fechaInicioContrato: '2024-06-01', rentaMensual: 600, estado: 'FIRMADO',
    inmuebleDireccion: 'Calle i1', registroCobros: [cobro('cob1')], ...extra,
  } as unknown as ContratoFormalizacion;
}

function gasto(id: string, extra: Record<string, unknown> = {}): Gasto {
  return {
    id, inmuebleId: 'i1', propietarioId: 'p1', tipo: 'EXPLOTACION',
    categoria: 'MANTENIMIENTO', concepto: `Gasto ${id}`, proveedor: 'Proveedor',
    importe: 121, estado: 'PAGADO', aCargoDe: 'arrendador',
    fechaDevengo: '2025-03-10', ejercicioFiscal: 2025, deducible: true,
    createdAt: '2025-03-10T00:00:00Z', updatedAt: '2025-03-10T00:00:00Z', ...extra,
  } as unknown as Gasto;
}

function factura(id: string, extra: Record<string, unknown> = {}): Factura {
  return {
    id, propietarioId: 'p1', inmuebleId: 'i1', gastoId: 'g1', clase: 'RECIBIDA',
    tipo: 'F1', serie: 'A', numero: 1, ejercicio: 2025, fechaExpedicion: '10-03-2025',
    emisor: { nombre: 'Proveedor SL', nif: 'B00000000' },
    receptor: { nombre: 'Propietaria', nif: '00000000A' },
    baseImponible: 100, cuotaIva: 21, cuotaRetencion: 0, importeTotal: 121,
    estado: 'ACEPTADA', ...extra,
  } as unknown as Factura;
}

function liquidacion(id: string, extra: Record<string, unknown> = {}): LiquidacionPropietario {
  return {
    id, propietarioId: 'p1', propietarioNombre: 'Propietaria', periodo: '2025-02',
    anio: 2025, mes: 2, inmuebleIds: ['i1'], netoPropietario: 479,
    totalBrutoCobrado: 600, estado: 'PAGADA', ...extra,
  } as unknown as LiquidacionPropietario;
}

function poliza(id: string, extra: Record<string, unknown> = {}): PolizaSeguro {
  return {
    id, propietarioId: 'p1', inmuebleId: 'i1', aseguradora: 'Seguros', numeroPoliza: 'P-1',
    tipo: 'HOGAR', fechaInicio: '2025-01-01', fechaVencimiento: '2025-12-31',
    estado: 'ACTIVA', primaAnual: 200, ...extra,
  } as unknown as PolizaSeguro;
}

function entrada(extra: Partial<EntradaPaqueteAsesor> = {}): EntradaPaqueteAsesor {
  return {
    inmuebles: [inmueble('i1')],
    contratos: [contrato('c1')],
    gastos: [gasto('g1', { facturaId: 'f1' })],
    facturas: [factura('f1')],
    liquidaciones: [liquidacion('liq1')],
    polizas: [poliza('pol1')],
    ...extra,
  };
}

function generar(
  ent: EntradaPaqueteAsesor,
  solicitud: SolicitudPaqueteAsesor = { propietarioIds: ['p1'], ejercicios: [2025] },
  aut: AmbitoAutorizado = AUT_P1,
) {
  return generarPaqueteAsesor(ent, solicitud, aut, { generatedAt: GENERADO, generatedBy: 'auditoria' });
}

function zipDe(ent: EntradaPaqueteAsesor = entrada(), solicitud?: SolicitudPaqueteAsesor): Uint8Array {
  return empaquetarPaqueteAsesor(generar(ent, solicitud)).zip;
}

const dec = new TextDecoder('utf-8');
function entradasDe(zip: Uint8Array): EntradaZip[] {
  return leerEntradasZipPaqueteAsesor(zip).entradas
    .map((e) => ({ ruta: e.nombre, contenido: e.bytes }));
}

/** Reconstruye un paquete firmado de nuevo (hashes recalculados): aísla errores semánticos. */
function reconstruir(
  zip: Uint8Array,
  mutaciones: Record<string, (texto: string) => string>,
  resign = true,
): Uint8Array {
  let ents = entradasDe(zip).map((e) => {
    const mutar = mutaciones[e.ruta];
    return mutar ? { ruta: e.ruta, contenido: utf8Bytes(mutar(dec.decode(e.contenido))) } : e;
  });
  if (resign) {
    ents = ents.map((e) => {
      if (e.ruta !== 'manifest.json') return e;
      const manifest = JSON.parse(dec.decode(e.contenido)) as Record<string, unknown>;
      const hashes: Record<string, string> = {};
      for (const otra of ents) {
        if (otra.ruta !== 'manifest.json') hashes[otra.ruta] = sha256Hex(otra.contenido);
      }
      return { ruta: e.ruta, contenido: utf8Bytes(JSON.stringify({ ...manifest, hashes })) };
    });
  }
  return crearZip(ents);
}

function codigosError(zip: Uint8Array): string[] {
  return verificarPaqueteAsesorZip(zip).problemas
    .filter((p) => p.nivel === 'ERROR').map((p) => p.codigo);
}

function buscarPatron(zip: Uint8Array, patron: string): number[] {
  const p = new TextEncoder().encode(patron);
  const indices: number[] = [];
  for (let i = 0; i + p.length <= zip.length; i += 1) {
    if (p.every((b, j) => zip[i + j] === b)) indices.push(i);
  }
  return indices;
}

function escribirEn(zip: Uint8Array, offset: number, texto: string): void {
  zip.set(new TextEncoder().encode(texto), offset);
}

function offsetCentral(zip: Uint8Array): number {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  return dv.getUint32(zip.length - 22 + 16, true);
}

function vista(zip: Uint8Array): DataView {
  return new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
}

describe('Auditoría adversarial · A. Integridad ZIP/manifiesto/CSV', () => {
  it('vectores conocidos independientes: CRC-32 y SHA-256 de las primitivas reutilizadas', () => {
    expect(crc32(utf8Bytes('123456789'))).toBe(0xcbf43926);
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('banderas ZIP, tamaño local y contadores EOCD contradictorios se rechazan', () => {
    const conBanderas = new Uint8Array(zipDe());
    const primera = leerEntradasZipPaqueteAsesor(conBanderas).entradas[0];
    conBanderas[primera.localHeaderOffset + 6] = 1; // bit de cifrado
    conBanderas[offsetCentral(conBanderas) + 8] = 1;
    expect(codigosError(conBanderas)).toContain('ZIP_ESTRUCTURA_INVALIDA');

    const tamLocal = new Uint8Array(zipDe());
    const libro = leerEntradasZipPaqueteAsesor(tamLocal).entradas
      .find((e) => e.nombre === 'libro-ingresos-gastos.csv')!;
    vista(tamLocal).setUint32(libro.localHeaderOffset + 18, libro.tamanioDeclarado + 1, true);
    expect(codigosError(tamLocal)).toContain('ZIP_ESTRUCTURA_INVALIDA');

    const eocd = new Uint8Array(zipDe());
    vista(eocd).setUint16(eocd.length - 22 + 8, 11, true); // entradas en este disco vs total 12
    expect(codigosError(eocd)).toContain('ZIP_ESTRUCTURA_INVALIDA');

    const metodo = new Uint8Array(zipDe());
    const entrada0 = leerEntradasZipPaqueteAsesor(metodo).entradas[0];
    vista(metodo).setUint16(entrada0.localHeaderOffset + 8, 8, true); // DEFLATE no admitido
    vista(metodo).setUint16(offsetCentral(metodo) + 10, 8, true);
    expect(codigosError(metodo)).toContain('ZIP_ESTRUCTURA_INVALIDA');
  });

  it('nombre con traversal y nombre duplicado en cabeceras local/central se rechazan', () => {
    const traversal = new Uint8Array(zipDe());
    const occ = buscarPatron(traversal, 'informe.txt');
    escribirEn(traversal, occ[0], '../evil.txt');
    escribirEn(traversal, occ[occ.length - 1], '../evil.txt');
    expect(verificarPaqueteAsesorZip(traversal).ok).toBe(false);
    expect(codigosError(traversal)).toContain('ZIP_ESTRUCTURA_INVALIDA');

    const duplicado = new Uint8Array(zipDe());
    const occGastos = buscarPatron(duplicado, 'datos/gastos.csv');
    escribirEn(duplicado, occGastos[0], 'datos/cobros.csv');
    escribirEn(duplicado, occGastos[occGastos.length - 1], 'datos/cobros.csv');
    expect(verificarPaqueteAsesorZip(duplicado).ok).toBe(false);
    expect(codigosError(duplicado)).toContain('ZIP_ESTRUCTURA_INVALIDA');
  });

  it('manifiesto null/sin totales e incidencias no objeto: error, nunca excepción ni ok', () => {
    const nulo = reconstruir(zipDe(), { 'manifest.json': () => 'null' }, false);
    expect(() => verificarPaqueteAsesorZip(nulo)).not.toThrow();
    expect(verificarPaqueteAsesorZip(nulo).ok).toBe(false);
    expect(codigosError(nulo)).toContain('MANIFEST_ILEGIBLE');

    const sinTotales = reconstruir(zipDe(), {
      'manifest.json': (t) => {
        const m = JSON.parse(t); delete m.totales; return JSON.stringify(m);
      },
    }, false);
    expect(() => verificarPaqueteAsesorZip(sinTotales)).not.toThrow();
    expect(codigosError(sinTotales)).toContain('TOTALES_ILEGIBLES');

    const incidenciasMalas = reconstruir(zipDe(), { 'incidencias.json': () => '[null]' });
    expect(() => verificarPaqueteAsesorZip(incidenciasMalas)).not.toThrow();
    expect(codigosError(incidenciasMalas)).toContain('INCIDENCIAS_ILEGIBLES');
  });

  it('cabecera CSV no contractual y fila con aridad distinta se rechazan aunque los hashes se refirmen', () => {
    const cabecera = reconstruir(zipDe(), {
      'datos/polizas.csv': (t) => t.replace('aseguradora', 'aseguradorX'),
    });
    expect(codigosError(cabecera)).toContain('CABECERA_CSV_DISTINTA');

    const aridad = reconstruir(zipDe(), {
      'datos/polizas.csv': (t) => t.replace('\npol1,', '\npol1,,EXTRA,'),
    });
    expect(codigosError(aridad)).toContain('CSV_FILA_MALFORMADA');
  });

  it('el ámbito declarado en manifiesto/informe se contrasta con los CSV refirmados', () => {
    const otroPropietario = reconstruir(zipDe(), {
      'datos/gastos.csv': (t) => t.replace(',p1,', ',p2,'),
    });
    expect(codigosError(otroPropietario)).toContain('AMBITO_PROPIETARIO_FUERA_DE_MANIFEST');

    const informeDistinto = reconstruir(zipDe(), {
      'informe.txt': (t) => t.replace('Propietarios: p1', 'Propietarios: p9'),
    });
    expect(codigosError(informeDistinto)).toContain('INFORME_NO_COINCIDE_CON_MANIFEST');

    const anioFuera = reconstruir(zipDe(), {
      'datos/cobros.csv': (t) => t.replace(',2,2025,', ',2,2024,'),
    });
    expect(codigosError(anioFuera)).toContain('AMBITO_TEMPORAL_FUERA_DE_MANIFEST');
  });
});

describe('Auditoría adversarial · B. Cuadre contable/fiscal y fechas', () => {
  it('un paquete artesanal que duplica en el libro un gasto exacto duplicado se rechaza', () => {
    const soloDup = entrada({
      contratos: [], gastos: [gasto('g-dup', { importe: 30 }), gasto('g-dup', { importe: 30 })],
      facturas: [], liquidaciones: [], polizas: [],
    });
    const ajustar = (t: string): string => {
      const o = JSON.parse(t);
      const tot = (x: Record<string, any>) => {
        x.totalGastos = 60; x.totalGastosDeducibles = 60; x.resultado = -60;
        Object.assign(x.porEjercicio[0], {
          numGastos: 2, totalGastos: 60, totalGastosDeducibles: 60, resultado: -60,
        });
        Object.assign(x.porMes[0], {
          numGastos: 2, totalGastos: 60, totalGastosDeducibles: 60, resultado: -60,
        });
      };
      if (o.totales) { tot(o.totales); o.conteos.lineasLibro = 2; } else if (o.totalGastos !== undefined) tot(o);
      return JSON.stringify(o);
    };
    const duplicadoEnLibro = reconstruir(zipDe(soloDup), {
      'libro-ingresos-gastos.csv': (t) => {
        const [cab, linea] = t.split('\n');
        return [cab, linea, linea].join('\n');
      },
      'manifest.json': ajustar,
      'totales.json': (t) => {
        const o = JSON.parse(t); ajustar(JSON.stringify(o.totales));
        o.totales.totalGastos = 60; o.totales.totalGastosDeducibles = 60; o.totales.resultado = -60;
        Object.assign(o.totales.porEjercicio[0], { numGastos: 2, totalGastos: 60, totalGastosDeducibles: 60, resultado: -60 });
        Object.assign(o.totales.porMes[0], { numGastos: 2, totalGastos: 60, totalGastosDeducibles: 60, resultado: -60 });
        return JSON.stringify(o);
      },
    });
    expect(codigosError(duplicadoEnLibro)).toContain('CUADRE_GASTO_DISTINTO_LIBRO');
  });

  it('alias fecha: el importe sí es contrastable; cambiarlo en la fuente es error, no solo advertencia', () => {
    const conAlias = entrada({
      contratos: [],
      gastos: [gasto('g-alias', {
        importe: 50, fechaDevengo: undefined, fechaPago: undefined, fecha: '2025-03-10',
      })],
      facturas: [], liquidaciones: [], polizas: [],
    });
    const bueno = verificarPaqueteAsesorZip(zipDe(conAlias));
    expect(bueno.ok).toBe(true); // cuadre PARCIAL: importe sí, fecha no serializada
    expect(bueno.problemas.map((p) => p.codigo)).toContain('GASTO_ALIAS_FECHA_NO_SERIALIZADO');

    const manipulado = reconstruir(zipDe(conAlias), {
      'datos/gastos.csv': (t) => t.replace(',50,', ',99,'),
    });
    expect(codigosError(manipulado)).toContain('CUADRE_GASTO_DISTINTO_LIBRO');
  });

  it('mover el día de una línea dentro del mismo mes (totales intactos) se detecta contra la fuente', () => {
    const movida = reconstruir(zipDe(), {
      'libro-ingresos-gastos.csv': (t) => t.replace('2025-02-03,2025,INGRESO', '2025-02-20,2025,INGRESO'),
    });
    expect(codigosError(movida)).toContain('LINEA_NO_COINCIDE_CON_FUENTE');

    const imposible = reconstruir(zipDe(), {
      'libro-ingresos-gastos.csv': (t) => t.replace('2025-02-03,2025,INGRESO', '2025-02-31,2025,INGRESO'),
      'datos/cobros.csv': (t) => t.replace(',2025-02-03,', ',2025-02-31,'),
    });
    expect(codigosError(imposible)).toContain('LINEA_FECHA_INVALIDA');
  });

  it('un cobro del periodo de febrero pagado en marzo no se rechaza por la fecha del libro', () => {
    const pagadoDespues = entrada({
      contratos: [contrato('c1', {
        registroCobros: [cobro('cob1', { fechaPago: '2025-03-01' })],
      })],
      gastos: [], facturas: [], polizas: [],
    });
    const zip = zipDe(pagadoDespues, {
      propietarioIds: ['p1'], ejercicios: [2025], meses: ['2025-02'],
    });
    expect(verificarPaqueteAsesorZip(zip).ok).toBe(true);
  });

  it('dominios del libro: deducible en ingreso y desglose presente con SIN_DESGLOSE se rechazan', () => {
    const alterarFila = (t: string, fuenteId: string, cambios: Record<number, string>) => {
      const lineas = t.split('\n');
      return lineas.map((l) => {
        if (!l.includes(fuenteId)) return l;
        const c = l.split(',');
        for (const [idx, valor] of Object.entries(cambios)) c[Number(idx)] = valor;
        return c.join(',');
      }).join('\n');
    };
    const ingresoDeducible = reconstruir(zipDe(), {
      'libro-ingresos-gastos.csv': (t) => alterarFila(t, 'cob1', { 12: 'true' }),
    });
    expect(codigosError(ingresoDeducible)).toContain('LINEA_DEDUCIBLE_INVALIDO');

    const sinFactura = entrada({
      contratos: [], gastos: [gasto('g-sf', { importe: 50 })],
      facturas: [], liquidaciones: [], polizas: [],
    });
    const desgloseFalso = reconstruir(zipDe(sinFactura), {
      'libro-ingresos-gastos.csv': (t) => alterarFila(t, 'g-sf', { 7: '50', 8: '0', 9: '0' }),
    });
    expect(codigosError(desgloseFalso)).toContain('LINEA_DESGLOSE_INVALIDO');
  });

  it('fechaGasto: devengo imposible no bloquea una fechaPago válida acreditada', () => {
    const p = generar(entrada({
      contratos: [], facturas: [], liquidaciones: [], polizas: [],
      gastos: [gasto('g-f', { fechaDevengo: '2025-02-31', fechaPago: '2025-03-01' })],
    }));
    expect(p.libro.map((l) => [l.fuenteId, l.fecha])).toEqual([['g-f', '2025-03-01']]);
  });

  it('importes no finitos/negativos/enormes/subcéntimo no computan ni se presentan como cuadrados', () => {
    const invalidos = generar(entrada({
      contratos: [], facturas: [], liquidaciones: [], polizas: [],
      gastos: [
        gasto('g-neg', { importe: -1 }),
        gasto('g-nan', { importe: Number.NaN }),
        gasto('g-inf', { importe: Number.POSITIVE_INFINITY }),
        gasto('g-huge', { importe: 1e21 }),
      ],
    }));
    expect(invalidos.libro).toEqual([]);
    for (const id of ['g-neg', 'g-nan', 'g-inf', 'g-huge']) {
      expect(invalidos.incidencias.some((i) => i.codigo === 'GASTO_IMPORTE_INVALIDO' && i.id === id)).toBe(true);
    }

    // Un importe grande con dos decimales no es subcéntimo aunque su float
    // no sea exacto en binario (1234567.89 × 100 difiere ~1,5e-8 céntimos).
    const grandeExacto = generar(entrada({
      contratos: [], facturas: [], liquidaciones: [], polizas: [],
      gastos: [gasto('g-grande', { importe: 1234567.89 })],
    }));
    expect(grandeExacto.incidencias.map((i) => i.codigo)).not.toContain('IMPORTE_CON_SUBCENTIMO');
    expect(grandeExacto.libro).toHaveLength(1);

    // Subcéntimo: 3 × 0,004 €. El CSV solo representa céntimos; el paquete
    // resultante NO puede presentarse como verificado (cuadre no verificable).
    const subcentimo = entrada({
      contratos: [], facturas: [], liquidaciones: [], polizas: [],
      gastos: [gasto('s1', { importe: 0.004 }), gasto('s2', { importe: 0.004 }), gasto('s3', { importe: 0.004 })],
    });
    expect(verificarPaqueteAsesorZip(zipDe(subcentimo)).ok).toBe(false);
  });
});

describe('Auditoría adversarial · C/D/G. Ámbito, duplicados, determinismo, minimización', () => {
  it('referencias a inmueble de otro propietario: excluidas e identificadas, sin filtrar su dirección', () => {
    const cruzada = entrada({
      inmuebles: [inmueble('i1'), inmueble('i2', 'p2', { direccion: secretoP2 })],
      contratos: [contrato('c-cross', { inmuebleId: 'i2', inmuebleDireccion: secretoP2 })],
      gastos: [gasto('g-cross', { inmuebleId: 'i2', inmuebleDireccion: undefined })],
      facturas: [factura('f-cross', { inmuebleId: 'i2', gastoId: 'g-cross' })],
      liquidaciones: [liquidacion('liq-cross', { inmuebleIds: ['i2'] })],
      polizas: [poliza('pol-cross', { inmuebleId: 'i2' })],
    });
    const p = generar(cruzada);
    expect(p.filas.contratos).toEqual([]);
    expect(p.filas.cobros).toEqual([]);
    expect(p.filas.gastos).toEqual([]);
    expect(p.filas.facturas).toEqual([]);
    expect(p.filas.liquidaciones).toEqual([]);
    expect(p.filas.polizas).toEqual([]);
    expect(p.libro).toEqual([]);
    for (const codigo of [
      'CONTRATO_INMUEBLE_PROPIETARIO_DISTINTO', 'GASTO_INMUEBLE_PROPIETARIO_DISTINTO',
      'FACTURA_INMUEBLE_PROPIETARIO_DISTINTO', 'LIQUIDACION_INMUEBLE_PROPIETARIO_DISTINTO',
      'POLIZA_INMUEBLE_PROPIETARIO_DISTINTO',
    ]) {
      expect(p.incidencias.map((i) => i.codigo)).toContain(codigo);
    }
    const textoZip = dec.decode(empaquetarPaqueteAsesor(p).zip);
    expect(textoZip).not.toContain(secretoP2);
  });

  it('id de inmueble repetido entre propietarios no arrastra la fila ajena al paquete', () => {
    const p = generar(entrada({
      inmuebles: [
        inmueble('dup', 'p2', { direccion: secretoP2 }),
        inmueble('dup', 'p1', { direccion: 'Calle propia' }),
      ],
      contratos: [], gastos: [], facturas: [], liquidaciones: [], polizas: [],
    }));
    expect(p.filas.inmuebles.map((r) => r['direccion'])).toEqual(['Calle propia']);
    expect(p.incidencias.some((i) => i.codigo === 'INMUEBLE_DUPLICADO' && i.id === 'dup')).toBe(true);
    expect(JSON.stringify(p)).not.toContain(secretoP2);
  });

  it('master con propietario p1 e inmueble de p2 es solicitud contradictoria', () => {
    const v = validarAmbitoPaquete(
      { propietarioIds: ['p1'], inmuebleIds: ['i9'] },
      AUT_MASTER,
      [inmueble('i9', 'p2')],
    );
    expect(v.ok).toBe(false);
  });

  it('duplicado con deducibilidad/proveedor distintos es conflictivo, no réplica exacta', () => {
    const p = generar(entrada({
      contratos: [], facturas: [], liquidaciones: [], polizas: [],
      gastos: [
        gasto('g-x', { deducible: true, proveedor: 'Uno' }),
        gasto('g-x', { deducible: false, proveedor: 'Dos' }),
      ],
    }));
    expect(p.libro).toEqual([]);
    expect(p.incidencias.some((i) => i.codigo === 'GASTO_ID_CONFLICTIVO' && i.id === 'g-x')).toBe(true);
    expect(p.incidencias.some((i) => i.codigo === 'GASTO_DUPLICADO_EXACTO')).toBe(false);
  });

  it('duplicados de entidades no movimiento e ids vacíos quedan identificados', () => {
    const p = generar(entrada({
      contratos: [], facturas: [], polizas: [],
      gastos: [gasto('', { importe: 5 })],
      liquidaciones: [liquidacion('liq-dup'), liquidacion('liq-dup')],
    }));
    expect(p.filas.gastos).toEqual([]);
    expect(p.incidencias.some((i) => i.codigo === 'GASTO_SIN_ID')).toBe(true);
    expect(p.incidencias.some((i) => i.codigo === 'LIQUIDACION_DUPLICADA' && i.id === 'liq-dup')).toBe(true);
  });

  it('determinismo también con duplicados conflictivos en orden de llegada invertido', () => {
    const a = entrada({
      contratos: [], facturas: [], liquidaciones: [], polizas: [],
      gastos: [gasto('g-c', { importe: 10 }), gasto('g-c', { importe: 99 })],
    });
    const b = entrada({
      contratos: [], facturas: [], liquidaciones: [], polizas: [],
      gastos: [gasto('g-c', { importe: 99 }), gasto('g-c', { importe: 10 })],
    });
    expect(generar(a).manifest.paqueteId).toBe(generar(b).manifest.paqueteId);
    expect(sha256Hex(zipDe(a))).toBe(sha256Hex(zipDe(b)));
  });

  it('minimización en el paquete estructurado: filas.cobros no retiene DNI/teléfono/email/referencia bancaria', () => {
    const conSecretos = entrada({
      contratos: [contrato('c1', {
        registroCobros: [cobro('cob1', {
          inquilinoDni: '99999999R', inquilinoTelefono: '600111222',
          inquilinoEmail: 'secreto@example.com', referenciaBancaria: 'REF-BANCO-SECRETA',
          propietarioIban: 'ES0000000000000000000000',
        })],
      })],
    });
    const p = generar(conSecretos);
    const todo = JSON.stringify(p) + dec.decode(empaquetarPaqueteAsesor(p).zip);
    for (const secreto of ['99999999R', '600111222', 'secreto@', 'REF-BANCO-SECRETA', 'ES000000000']) {
      expect(todo).not.toContain(secreto);
    }
  });
});
