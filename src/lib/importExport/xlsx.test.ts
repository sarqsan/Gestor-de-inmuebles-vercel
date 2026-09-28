/**
 * BLOQUE 7 — Tests del adaptador XLSX (lectura y escritura) y de sus piezas
 * (ZIP/CRC32, DEFLATE, fechas de Excel).
 *
 * Estrategia de verificación (real > mocks):
 *  · FIXTURES REALES en `tests/fixtures/xlsx/`: libros escritos con SheetJS
 *    0.18.5 (implementación independiente) fuera del repositorio, y
 *    reempaquetados con el DEFLATE de zlib (Python) en 7 variantes de
 *    compresión (niveles 0/1/6/9, Huffman fijo, Huffman-only y RLE).
 *  · zlib de Node como codificador/decodificador INDEPENDIENTE: se comprueba
 *    que `inflarRaw` devuelve exactamente los mismos bytes que
 *    `zlib.inflateRawSync` para flujos generados al vuelo con varias
 *    estrategias, y que el lector ZIP entiende contenedores construidos por el
 *    propio test (no por el código bajo prueba).
 *  · El contenedor que ESCRIBE el bloque se valida con un lector ZIP mínimo
 *    independiente escrito en este mismo fichero (no reutiliza `zip.ts`).
 */
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, escribirZip, ErrorZip, leerZip, textoDeParte } from './zip';
import { ErrorDeflate, inflarRaw } from './inflate';
import {
  clasificarFormatoExcel,
  esFechaCivilIso,
  fechaIsoDesdeSerialExcel,
  serialDesdeFechaIso,
} from './fechasExcel';
import {
  ErrorXlsxGeneracion,
  generarXlsx,
  parseXlsx,
  previsualizarXlsx,
  refColumna,
  sanearNombreHoja,
  type HojaXlsxDatos,
} from './xlsx';

const FIXTURES = new URL('../../../tests/fixtures/xlsx/', import.meta.url);
const fixture = (nombre: string): Uint8Array => new Uint8Array(readFileSync(new URL(nombre, FIXTURES)));

const VARIANTES_DEFLATE = [
  'movimientos-rentasync.xlsx',
  'movimientos-rentasync-deflate.xlsx',
  'movimientos-rentasync-deflate-nivel1.xlsx',
  'movimientos-rentasync-deflate-nivel9.xlsx',
  'movimientos-rentasync-deflate-fijo.xlsx',
  'movimientos-rentasync-deflate-huffman.xlsx',
  'movimientos-rentasync-deflate-rle.xlsx',
  'movimientos-rentasync-deflate-almacenado.xlsx',
];

// ---------------------------------------------------------------------------
// Utilidades del test: ZIP construido aquí (independiente del código probado)
// ---------------------------------------------------------------------------

interface EntradaCruda {
  nombre: string;
  datos: Uint8Array;
  /** Flujo DEFLATE ya comprimido (se inyecta tal cual). */
  deflate: Uint8Array;
}

/** Ensambla un ZIP con los flujos DEFLATE indicados (escritor del test). */
function zipCrudo(entradas: EntradaCruda[]): Uint8Array {
  const locales: Uint8Array[] = [];
  const centrales: Uint8Array[] = [];
  let offset = 0;
  for (const e of entradas) {
    const nombre = new TextEncoder().encode(e.nombre);
    const crc = crc32(e.datos);
    const local = new Uint8Array(30 + nombre.length + e.deflate.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 8, true); // método deflate
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.deflate.length, true);
    lv.setUint32(22, e.datos.length, true);
    lv.setUint16(26, nombre.length, true);
    local.set(nombre, 30);
    local.set(e.deflate, 30 + nombre.length);
    locales.push(local);

    const central = new Uint8Array(46 + nombre.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.deflate.length, true);
    cv.setUint32(24, e.datos.length, true);
    cv.setUint16(28, nombre.length, true);
    cv.setUint32(42, offset, true);
    central.set(nombre, 46);
    centrales.push(central);
    offset += local.length;
  }
  const tamCentral = centrales.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entradas.length, true);
  ev.setUint16(10, entradas.length, true);
  ev.setUint32(12, tamCentral, true);
  ev.setUint32(16, offset, true);
  const salida = new Uint8Array(offset + tamCentral + 22);
  let p = 0;
  for (const l of locales) { salida.set(l, p); p += l.length; }
  for (const c of centrales) { salida.set(c, p); p += c.length; }
  salida.set(eocd, p);
  return salida;
}

function deflateCon(datos: Uint8Array, opciones: zlib.ZlibOptions): Uint8Array {
  return new Uint8Array(zlib.deflateRawSync(datos, opciones));
}

/** Lector ZIP mínimo INDEPENDIENTE (solo entradas almacenadas) para verificar el escritor. */
function leerAlmacenadoIndependiente(zip: Uint8Array): Map<string, Uint8Array> {
  const vista = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let p = zip.length - 22; p >= 0; p--) {
    if (vista.getUint32(p, true) === 0x06054b50) { eocd = p; break; }
  }
  if (eocd < 0) throw new Error('EOCD no encontrado por el lector del test');
  const total = vista.getUint16(eocd + 10, true);
  let p = vista.getUint32(eocd + 16, true);
  const salida = new Map<string, Uint8Array>();
  for (let i = 0; i < total; i++) {
    if (vista.getUint32(p, true) !== 0x02014b50) throw new Error('entrada central inválida');
    const metodo = vista.getUint16(p + 10, true);
    if (metodo !== 0) throw new Error(`el escritor del bloque debe usar método 0 (visto ${metodo})`);
    const crc = vista.getUint32(p + 16, true);
    const tam = vista.getUint32(p + 24, true);
    const largoNombre = vista.getUint16(p + 28, true);
    const offsetLocal = vista.getUint32(p + 42, true);
    const nombre = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + largoNombre));
    const largoLocal = vista.getUint16(offsetLocal + 26, true);
    const inicio = offsetLocal + 30 + largoLocal;
    const contenido = zip.subarray(inicio, inicio + tam);
    if (crc32(contenido) !== crc) throw new Error(`CRC32 inválido en '${nombre}'`);
    salida.set(nombre, contenido);
    p += 46 + largoNombre + vista.getUint16(p + 30, true) + vista.getUint16(p + 32, true);
  }
  return salida;
}

// ---------------------------------------------------------------------------
// DEFLATE + ZIP
// ---------------------------------------------------------------------------

describe('inflate: DEFLATE puro frente a zlib (codificador independiente)', () => {
  const cargas = [
    '',
    'hola',
    'x'.repeat(200),
    '<?xml version="1.0"?><a>1</a><b>2</b>'.repeat(40),
    Array.from({ length: 4000 }, (_, i) => String.fromCharCode(32 + ((i * 7) % 90))).join(''),
  ];
  const estrategias: Array<[string, zlib.ZlibOptions]> = [
    ['default nivel 6', { level: 6 }],
    ['default nivel 9', { level: 9 }],
    ['nivel 1', { level: 1 }],
    ['almacenado (nivel 0)', { level: 0 }],
    ['huffman fijo', { level: 9, strategy: zlib.constants.Z_FIXED }],
    ['huffman only', { level: 9, strategy: zlib.constants.Z_HUFFMAN_ONLY }],
    ['rle', { level: 9, strategy: zlib.constants.Z_RLE }],
  ];
  for (const [nombre, opciones] of estrategias) {
    it(`reproduce byte a byte la salida de zlib con estrategia ${nombre}`, () => {
      for (const carga of cargas) {
        const datos = new TextEncoder().encode(carga);
        const flujo = deflateCon(datos, opciones);
        expect(Buffer.from(inflarRaw(flujo)).equals(Buffer.from(datos))).toBe(true);
        expect(Buffer.from(inflarRaw(flujo)).equals(zlib.inflateRawSync(flujo))).toBe(true);
      }
    });
  }

  it('cota de salida: una bomba de descompresión se rechaza con motivo', () => {
    const flujo = deflateCon(new TextEncoder().encode('a'.repeat(50_000)), { level: 9 });
    expect(() => inflarRaw(flujo, 1_000)).toThrowError(ErrorDeflate);
  });

  it('flujo corrupto: lanza en lugar de devolver basura', () => {
    const flujo = deflateCon(new TextEncoder().encode('contenido de prueba'), { level: 9 });
    const roto = flujo.slice();
    roto[roto.length - 1] ^= 0xff;
    expect(() => inflarRaw(roto)).toThrowError(ErrorDeflate);
  });

  it('crc32 coincide con el vector conocido de la norma', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('zip: lectura y escritura', () => {
  it('lee entradas con los tres tipos de bloque DEFLATE (dinámico, fijo, almacenado)', () => {
    const contenido = new TextEncoder().encode('<xml>valor</xml>'.repeat(60));
    const variantes: Array<[string, zlib.ZlibOptions]> = [
      ['dinamico', { level: 9 }],
      ['fijo', { level: 9, strategy: zlib.constants.Z_FIXED }],
      ['almacenado', { level: 0 }],
    ];
    for (const [nombre, opciones] of variantes) {
      const zip = zipCrudo([{ nombre: 'parte.xml', datos: contenido, deflate: deflateCon(contenido, opciones) }]);
      const entradas = leerZip(zip);
      expect(entradas).toHaveLength(1);
      expect(entradas[0].nombre).toBe('parte.xml');
      expect(Buffer.from(entradas[0].datos).equals(Buffer.from(contenido))).toBe(true);
    }
  });

  it('detecta CRC32 incorrecto (archivo dañado) sin devolver datos', () => {
    const contenido = new TextEncoder().encode('parte con integridad');
    const zip = zipCrudo([{ nombre: 'a.xml', datos: contenido, deflate: deflateCon(contenido, { level: 0 }) }]);
    const danado = zip.slice();
    // corrompe un byte de datos conservando el CRC declarado
    const i = danado.indexOf(0x70 /* 'p' */);
    danado[i] = 0x71;
    expect(() => leerZip(danado)).toThrowError(ErrorZip);
  });

  it('rechaza ZIP64, cifrado y métodos no soportados con motivo explícito', () => {
    const contenido = new TextEncoder().encode('x');
    const base = zipCrudo([{ nombre: 'a.xml', datos: contenido, deflate: deflateCon(contenido, { level: 0 }) }]);
    const eocd = base.length - 22;
    const inicioCentral = new DataView(base.buffer).getUint32(eocd + 16, true);
    const zip64 = base.slice();
    new DataView(zip64.buffer).setUint32(zip64.length - 22 + 16, 0xffffffff, true); // offset del central = -1 ⇒ ZIP64
    expect(() => leerZip(zip64)).toThrowError(/ZIP64/);
    const cifrado = base.slice();
    new DataView(cifrado.buffer).setUint16(inicioCentral + 8, 0x0001, true); // flag de cifrado
    expect(() => leerZip(cifrado)).toThrowError(/cifrada/);
    const metodo = base.slice();
    new DataView(metodo.buffer).setUint16(inicioCentral + 10, 12, true); // bzip2
    expect(() => leerZip(metodo)).toThrowError(/método ZIP 12/);
    const truncado = base.slice(0, base.length - 30);
    expect(() => leerZip(truncado)).toThrowError(ErrorZip);
  });

  it('el ZIP que escribe el bloque es válido para un lector independiente y determinista', () => {
    const partes = [
      { nombre: '[Content_Types].xml', contenido: '<Types/>' },
      { nombre: 'xl/workbook.xml', contenido: '<workbook/>' },
    ];
    const a = escribirZip(partes);
    const b = escribirZip(partes);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const leido = leerAlmacenadoIndependiente(a);
    expect([...leido.keys()]).toEqual(['[Content_Types].xml', 'xl/workbook.xml']);
    expect(textoDeParte(leido.get('xl/workbook.xml')!)).toBe('<workbook/>');
    expect(() => escribirZip([{ nombre: '', contenido: 'x' }])).toThrowError(ErrorZip);
  });
});

// ---------------------------------------------------------------------------
// Fechas de Excel
// ---------------------------------------------------------------------------

describe('fechas de Excel: serial ⇄ fecha civil', () => {
  it('correspondencias de referencia del sistema 1900', () => {
    expect(serialDesdeFechaIso('1900-01-01')).toBe(1);
    expect(serialDesdeFechaIso('1900-02-28')).toBe(59);
    expect(serialDesdeFechaIso('1900-03-01')).toBe(61);
    expect(serialDesdeFechaIso('2024-03-15')).toBe(45366);
    expect(serialDesdeFechaIso('2024-03-15T13:45:30')).toBeCloseTo(45366.57326388889, 10);
    expect(fechaIsoDesdeSerialExcel(45366)).toEqual({ fecha: '2024-03-15' });
    expect(fechaIsoDesdeSerialExcel(1)).toEqual({ fecha: '1900-01-01' });
    expect(fechaIsoDesdeSerialExcel(45366.5)).toEqual({ fecha: '2024-03-15', hora: '12:00:00' });
  });

  it('el 29/02/1900 ficticio se normaliza con aviso (nunca se inventa un día)', () => {
    const r = fechaIsoDesdeSerialExcel(60);
    expect('fecha' in r && r.fecha).toBe('1900-02-28');
    expect('aviso' in r && r.aviso).toMatch(/no existe en el calendario real/);
  });

  it('sistema 1904: serial 0 = 1904-01-01 y 43904 = 2024-03-15', () => {
    expect(fechaIsoDesdeSerialExcel(0, { sistema: '1904' })).toEqual({ fecha: '1904-01-01' });
    expect(fechaIsoDesdeSerialExcel(43904, { sistema: '1904' })).toEqual({ fecha: '2024-03-15' });
    expect(serialDesdeFechaIso('2024-03-15', { sistema: '1904' })).toBe(43904);
    // El mismo serial significa días distintos según el sistema declarado.
    expect(fechaIsoDesdeSerialExcel(45366)).toEqual({ fecha: '2024-03-15' });
    expect('error' in fechaIsoDesdeSerialExcel(-1)).toBe(true);
  });

  it('rechaza fechas civiles imposibles y valores fuera de rango', () => {
    expect(esFechaCivilIso('2024-02-29')).toBe(true);
    expect(esFechaCivilIso('2023-02-29')).toBe(false);
    expect(esFechaCivilIso('2024-02-30')).toBe(false);
    expect(serialDesdeFechaIso('2023-02-29')).toBeNull();
    expect(serialDesdeFechaIso('1899-12-31')).toBeNull(); // serial 0 no representa un día real
    const r = fechaIsoDesdeSerialExcel(Number.NaN);
    expect('error' in r).toBe(true);
  });

  it('clasifica formatos numéricos (fecha, hora, fechaHora, número)', () => {
    expect(clasificarFormatoExcel('yyyy-mm-dd')).toBe('fecha');
    expect(clasificarFormatoExcel('dd/mm/yyyy')).toBe('fecha');
    expect(clasificarFormatoExcel('[$-409]d\\-mmm\\-yy;@')).toBe('fecha');
    expect(clasificarFormatoExcel('hh:mm')).toBe('hora');
    expect(clasificarFormatoExcel('yyyy-mm-dd hh:mm:ss')).toBe('fechaHora');
    expect(clasificarFormatoExcel('#,##0.00')).toBe('numero');
    expect(clasificarFormatoExcel('0.00%')).toBe('numero');
    expect(clasificarFormatoExcel('"fecha: "0')).toBe('numero'); // texto literal, no formato de fecha
  });
});

// ---------------------------------------------------------------------------
// Lectura de libros
// ---------------------------------------------------------------------------

describe('parseXlsx: lectura de libros reales', () => {
  it('lee el fixture real con tipos, fechas, booleanos y campos desconocidos', () => {
    const r = parseXlsx(fixture('movimientos-rentasync.xlsx'));
    expect(r.errores).toEqual([]);
    expect(r.hojas).toEqual(['Movimientos']);
    expect(r.hojaUsada).toBe('Movimientos');
    expect(r.filaCabeceraUsada).toBe(1);
    expect(r.registros).toHaveLength(4);
    expect(r.registros[0]).toMatchObject({
      id: 'exp-g1', type: 'gasto', category: 'community', amount: 100.5,
      date: '2024-03-15', description: 'Comunidad marzo', propertyId: 'prop_ext_1',
      esDeducible: true, receiptName: 'comunidad.pdf',
      campoDesconocido: 'se ignora sin romper',
    });
    expect(r.registros[1]['amount']).toBe('1.234,56'); // texto: lo interpreta el mapping, no el lector
    expect(r.registros[1]['date']).toBe('15/04/2024'); // D/M/Y textual: día-primer explícito en mapping
    expect(r.registros[3]['amount']).toBe(712.75); // fórmula con valor cacheado: NUNCA se evalúa
    expect(r.localizaciones).toEqual([
      "hoja 'Movimientos' fila 2", "hoja 'Movimientos' fila 3",
      "hoja 'Movimientos' fila 4", "hoja 'Movimientos' fila 5",
    ]);
  });

  it('las 8 variantes de compresión producen exactamente los mismos registros', () => {
    const esperado = parseXlsx(fixture('movimientos-rentasync.xlsx'));
    for (const nombre of VARIANTES_DEFLATE) {
      const r = parseXlsx(fixture(nombre));
      expect(r.errores, nombre).toEqual([]);
      expect(r.registros, nombre).toEqual(esperado.registros);
      expect(r.avisos, nombre).toEqual(esperado.avisos);
    }
  });

  it('hojas múltiples: se listan todas, se avisa de cuál se lee y se puede elegir', () => {
    const bytes = fixture('inmuebles-varias-hojas.xlsx');
    const porDefecto = parseXlsx(bytes);
    expect(porDefecto.hojas).toEqual(['Inmuebles', 'Contratos']);
    expect(porDefecto.hojaUsada).toBe('Inmuebles');
    expect(porDefecto.avisos.join(' ')).toMatch(/libro con 2 hojas \('Inmuebles', 'Contratos'\): se lee 'Inmuebles'/);
    expect(porDefecto.registros).toHaveLength(2);
    const contratos = parseXlsx(bytes, { hoja: 'Contratos' });
    expect(contratos.hojaUsada).toBe('Contratos');
    expect(contratos.avisos.join(' ')).toMatch(/hoja 'Contratos' seleccionada entre 2 del libro/);
    expect(contratos.registros[0]).toMatchObject({ id: 'cont_ext_1', rentaMensual: 750.5, fechaInicio: '2023-09-01' });
    const porIndice = parseXlsx(bytes, { hoja: 1 });
    expect(porIndice.registros).toEqual(contratos.registros);
    expect(parseXlsx(bytes, { hoja: 'NoExiste' }).errores.join(' ')).toMatch(/no existe en el libro/);
    expect(parseXlsx(bytes, { hoja: 7 }).errores.join(' ')).toMatch(/fuera de rango/);
  });

  it('sistema 1904: se detecta del propio libro y no desplaza 1462 días las fechas', () => {
    const r = parseXlsx(fixture('fechas-1904.xlsx'));
    expect(r.sistemaFecha).toBe('1904');
    expect(r.errores).toEqual([]);
    expect(r.registros[0]['fechaDevengo']).toBe('2024-03-15');
    // El mismo serial en el sistema 1900 es otro día: el flag cambia la lectura.
    const forzado1900 = parseXlsx(fixture('fechas-1904.xlsx'), { sistemaFecha: '1900' });
    // El mismo serial (43904) en el sistema 1900 es 1462 días antes.
    expect(forzado1900.registros[0]['fechaDevengo']).toBe('2020-03-14');
  });

  it('fechas con hora, horas sueltas, porcentajes y moneda no se corrompen', () => {
    const r = parseXlsx(fixture('tipos-mixtos.xlsx'));
    expect(r.errores).toEqual([]);
    expect(r.registros[0]).toMatchObject({
      id: 'x1', concepto: 'Fecha con hora',
      momento: '2024-03-15T13:45:30', // fecha+hora textual: el mapping decidirá (el lector no trunca)
      porcentaje: 0.21, // valor crudo: el formato es informativo, no se recalcula
      importeMoneda: 1234.56,
    });
    expect(r.registros[1]['importeMoneda']).toBe(-99.9); // signo y céntimos intactos
    expect(r.registros[1]['momento']).toBe(''); // hora sin día: no se inventa fecha
    expect(r.avisos.join(' ')).toMatch(/serial sin parte de fecha \(solo hora\)/);
  });

  it('cabeceras sucias: trim, duplicadas sufijadas, vacías nombradas y sobrantes conservadas', () => {
    const r = parseXlsx(fixture('cabeceras-sucias.xlsx'));
    expect(r.errores).toEqual([]);
    expect(r.avisos.join(' ')).toMatch(/columnas duplicadas en la cabecera/);
    expect(r.registros[0]).toEqual({
      importe: 100,
      fechaDevengo: '2024-03-15',
      fechaDevengo__2: '2024-03-16',
      __sin_nombre__: 'ruido',
      concepto: '=SUM(A2:A9)', // parece fórmula: se lee como TEXTO (no se evalúa nunca)
    });
    expect(r.registros[1]['concepto']).toBe('+34 600 000 000');
  });

  it('fila de cabecera explícita y columnas más allá de la cabecera (__extra_N)', () => {
    const hoja: HojaXlsxDatos = {
      nombre: 'Datos',
      columnas: [{ nombre: 'a', tipo: 'texto' }, { nombre: 'b', tipo: 'texto' }],
      filas: [{ a: 'solo-a', b: '' }],
    };
    const bytes = generarXlsx([hoja]);
    const r = parseXlsx(bytes, { filaCabecera: 1 });
    expect(r.registros).toHaveLength(1);
    expect(r.registros[0]).toEqual({ a: 'solo-a', b: '' });
    expect(r.filaCabeceraUsada).toBe(1);
    expect(parseXlsx(bytes, { filaCabecera: 9 }).errores.join(' ')).toMatch(/cabecera 9 vacía o inexistente/);
  });

  it('celdas: error de Excel, fórmula sin valor calculado y cadena compartida fuera de rango', () => {
    const hojaXml = `<?xml version="1.0"?><worksheet><sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c><c r="B1" t="inlineStr"><is><t>valor</t></is></c></row>
      <row r="2"><c r="A2" t="inlineStr"><is><t>e1</t></is></c><c r="B2" t="e"><v>#DIV/0!</v></c></row>
      <row r="3"><c r="A3" t="inlineStr"><is><t>e2</t></is></c><c r="B3"><f>SUM(B2)</f></c></row>
      <row r="4"><c r="A4" t="inlineStr"><is><t>e3</t></is></c><c r="B4" t="s"><v>99</v></c></row>
    </sheetData></worksheet>`;
    const bytes = zipCrudo([
      { nombre: 'xl/workbook.xml', datos: enc(`<workbook><sheets><sheet name="H" sheetId="1" r:id="rId1"/></sheets></workbook>`), deflate: deflateCon(enc(`<workbook><sheets><sheet name="H" sheetId="1" r:id="rId1"/></sheets></workbook>`), { level: 0 }) },
      { nombre: 'xl/_rels/workbook.xml.rels', datos: enc('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'), deflate: deflateCon(enc('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'), { level: 0 }) },
      { nombre: 'xl/worksheets/sheet1.xml', datos: enc(hojaXml), deflate: deflateCon(enc(hojaXml), { level: 0 }) },
    ]);
    const r = parseXlsx(bytes);
    expect(r.errores).toEqual([]);
    expect(r.registros).toEqual([
      { id: 'e1', valor: '' },
      { id: 'e2', valor: '' },
      { id: 'e3', valor: '' },
    ]);
    expect(r.avisos.join(' ')).toMatch(/celda con error de Excel '#DIV\/0!'/);
    expect(r.avisos.join(' ')).toMatch(/fórmula sin valor calculado: no se evalúa/);
    expect(r.avisos.join(' ')).toMatch(/índice de cadena compartida fuera de rango/);
  });

  it('cargas inválidas: vacío, no-ZIP, ZIP sin workbook y libro sin hojas', () => {
    expect(parseXlsx(new Uint8Array(0)).errores.join(' ')).toMatch(/archivo vacío/);
    expect(parseXlsx(new TextEncoder().encode('no soy un zip')).errores.join(' ')).toMatch(/no es un ZIP válido|demasiado pequeño/);
    expect(parseXlsx(new Uint8Array([0x50, 0x4b, 0x03, 0x04])).errores.length).toBeGreaterThan(0);
    const sinWorkbook = zipCrudo([{ nombre: 'a.txt', datos: enc('hola'), deflate: deflateCon(enc('hola'), { level: 0 }) }]);
    expect(parseXlsx(sinWorkbook).errores.join(' ')).toMatch(/falta 'xl\/workbook\.xml'/);
    // .xls heredado (OLE2): error honesto con la salida, no «corrupto».
    const ole2 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00, 0x10, 0x00]);
    expect(parseXlsx(ole2).errores.join(' ')).toMatch(/libro \.xls antiguo \(BIFF\/OLE2\) no soportado: .*guárdalo como \.xlsx/);
    const wb = enc('<workbook><sheets></sheets></workbook>');
    const sinHojas = zipCrudo([
      { nombre: 'xl/workbook.xml', datos: wb, deflate: deflateCon(wb, { level: 0 }) },
    ]);
    expect(parseXlsx(sinHojas).errores.join(' ')).toMatch(/no declara ninguna hoja/);
  });

  it('cotas: tamaño máximo y máximo de registros (lo omitido se cuenta, no se silencia)', () => {
    const bytes = fixture('movimientos-rentasync.xlsx');
    expect(parseXlsx(bytes, { maxBytes: 100 }).errores.join(' ')).toMatch(/supera la cota de 100/);
    const limitado = parseXlsx(bytes, { maxRegistros: 2 });
    expect(limitado.registros).toHaveLength(2);
    expect(limitado.registrosOmitidos).toBe(2);
    expect(limitado.avisos.join(' ')).toMatch(/2 fila\(s\) omitidas por cota/);
  });
});

function enc(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

// ---------------------------------------------------------------------------
// Escritura de libros
// ---------------------------------------------------------------------------

describe('generarXlsx: escritura determinista y segura', () => {
  const libro = (): HojaXlsxDatos[] => [{
    nombre: 'GASTO',
    columnas: [
      { nombre: 'id', tipo: 'texto' },
      { nombre: 'importe', tipo: 'numero' },
      { nombre: 'fechaDevengo', tipo: 'fecha' },
      { nombre: 'concepto', tipo: 'texto' },
      { nombre: 'deducible', tipo: 'numero' },
    ],
    filas: [
      { id: 'g1', importe: 1234.56, fechaDevengo: '2024-03-15', concepto: 'Comunidad "marzo" & <abril>', deducible: true },
      { id: 'g2', importe: 0, fechaDevengo: '2024-03-15T13:45:30', concepto: '=SUM(A1:A9)', deducible: false },
      { id: 'g3', importe: -99.9, fechaDevengo: '', concepto: '+34 600 000 000', deducible: 1 },
      { id: 'gñ4', importe: 10, fechaDevengo: '2024-12-31', concepto: 'Acentós: ñ, á, é, ü — @usuario', deducible: null },
    ],
  }];

  it('es determinista byte a byte y se relee con el mismo contrato', () => {
    const a = generarXlsx(libro());
    const b = generarXlsx(libro());
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const r = parseXlsx(a);
    expect(r.errores).toEqual([]);
    expect(r.hojas).toEqual(['GASTO']);
    expect(r.registros).toEqual([
      { id: 'g1', importe: 1234.56, fechaDevengo: '2024-03-15', concepto: 'Comunidad "marzo" & <abril>', deducible: true },
      { id: 'g2', importe: 0, fechaDevengo: '2024-03-15T13:45:30', concepto: '=SUM(A1:A9)', deducible: false },
      { id: 'g3', importe: -99.9, fechaDevengo: '', concepto: '+34 600 000 000', deducible: 1 },
      { id: 'gñ4', importe: 10, fechaDevengo: '2024-12-31', concepto: 'Acentós: ñ, á, é, ü — @usuario', deducible: '' },
    ]);
  });

  it('los valores que parecen fórmula se escriben como TEXTO (sin <f> en el XML)', () => {
    const bytes = generarXlsx(libro());
    const partes = leerZip(bytes);
    const hoja = textoDeParte(partes.find((p) => p.nombre === 'xl/worksheets/sheet1.xml')!.datos);
    expect(hoja).not.toMatch(/<f[\s>]/);
    expect(hoja).toContain('=SUM(A1:A9)');
    expect(hoja).toContain('+34 600 000 000');
    expect(hoja).toContain('@usuario');
    // Y el lector los devuelve como texto, nunca evaluados.
    expect(parseXlsx(bytes).registros[1]['concepto']).toBe('=SUM(A1:A9)');
  });

  it('el contenedor lo valida un lector independiente (método almacenado, CRC correcto)', () => {
    const leido = leerAlmacenadoIndependiente(generarXlsx(libro()));
    expect([...leido.keys()]).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml',
    ]);
    expect(textoDeParte(leido.get('xl/workbook.xml')!)).toContain('name="GASTO"');
  });

  it('serializa fechas como fecha real de Excel (no texto) y números negativos intactos', () => {
    const bytes = generarXlsx(libro());
    const hoja = textoDeParte(leerZip(bytes).find((p) => p.nombre === 'xl/worksheets/sheet1.xml')!.datos);
    expect(hoja).toContain('<c r="C2" s="1"><v>45366</v></c>'); // 2024-03-15 con formato de fecha
    expect(hoja).toContain('<c r="C3" s="2"><v>45366.57326388889</v></c>'); // fecha+hora
    expect(hoja).toContain('<c r="B4"><v>-99.9</v></c>');
    expect(hoja).toContain('<c r="E2" t="b"><v>1</v></c>'); // booleano en columna numérica
  });

  it('coerciones honestas: no numérico en columna numérica y fecha inválida se escriben como texto', () => {
    const bytes = generarXlsx([{
      nombre: 'MIX',
      columnas: [
        { nombre: 'importe', tipo: 'numero' },
        { nombre: 'fechaDevengo', tipo: 'fecha' },
        { nombre: 'id', tipo: 'texto' },
      ],
      filas: [{ importe: '1.234,56', fechaDevengo: 'no es fecha', id: 'x1' }],
    }]);
    const r = parseXlsx(bytes);
    expect(r.registros[0]['importe']).toBe('1.234,56'); // texto, no un número inventado
    expect(r.registros[0]['fechaDevengo']).toBe('no es fecha');
  });

  it('límites y errores explícitos: sin hojas, hojas duplicadas, texto enorme', () => {
    expect(() => generarXlsx([])).toThrowError(ErrorXlsxGeneracion);
    expect(() => generarXlsx([libro()[0], libro()[0]])).toThrowError(/nombre de hoja duplicado/);
    expect(() => generarXlsx([{
      nombre: 'X',
      columnas: [{ nombre: 'c', tipo: 'texto' }],
      filas: [{ c: 'a'.repeat(32_768) }],
    }])).toThrowError(/supera el límite de 32767/);
  });

  it('nombres de hoja saneados a los límites del formato', () => {
    expect(sanearNombreHoja('', 0)).toBe('Hoja1');
    expect(sanearNombreHoja('a[b]c:d*e?f/g\\h', 2)).toBe('a_b_c_d_e_f_g_h');
    expect(sanearNombreHoja('x'.repeat(40), 0)).toHaveLength(31);
    expect(refColumna(0)).toBe('A');
    expect(refColumna(27)).toBe('AB');
  });

  it('previsualización legible de una hoja (para UI/diagnóstico)', () => {
    const texto = previsualizarXlsx(libro(), 2);
    expect(texto).toContain("— hoja 'GASTO' (4 fila(s))");
    expect(texto).toContain('id | importe | fechaDevengo | concepto | deducible');
    expect(texto).toContain('…y 2 fila(s) más');
  });
});
