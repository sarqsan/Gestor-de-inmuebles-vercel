/**
 * BLOQUE 7 — Descompresor DEFLATE (RFC 1951) PURO, sin dependencias.
 *
 * Por qué existe (no duplicación, sí carencia real): el proyecto NO tiene
 * librería XLSX ni de ZIP (`xlsxStub.ts` lo dejó documentado: "el proyecto no
 * dispone de dependencia XLSX"), y un .xlsx es un ZIP con entradas DEFLATE.
 * Introducir `xlsx`/`exceljs` sería una dependencia pesada y con CVEs para algo
 * que el contrato de importación necesita de forma acotada: leer las partes XML
 * de un libro. Este módulo implementa exactamente lo necesario (bloques
 * almacenados, Huffman fijo y Huffman dinámico) y es verificable contra
 * implementaciones independientes (`node:zlib` y `zipfile` de Python) en tests.
 *
 * Es puro: no usa `node:zlib`, `DecompressionStream` ni APIs de plataforma, de
 * modo que el MISMO código corre en el navegador (panel de importación) y en
 * Node (tests/scripts). No hay I/O, ni reloj, ni azar.
 *
 * Límites explícitos: ZIP64 no soportado (se informa, no se corrompe), y toda
 * lectura fuera de rango lanza `ErrorDeflate` en lugar de devolver basura.
 */

export class ErrorDeflate extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeflate';
  }
}

/** Cota de seguridad del buffer de salida (evita bombas de descompresión). */
export const MAX_BYTES_SALIDA_DEFLATE = 64 * 1024 * 1024;

interface ArbolHuffman {
  /** count[n] = nº de símbolos con longitud n (índice 0 sin usar). */
  readonly count: Int32Array;
  /** Símbolos ordenados por longitud de código. */
  readonly symbol: Int32Array;
}

function construirArbol(longitudes: ArrayLike<number>): ArbolHuffman {
  const count = new Int32Array(16);
  for (let i = 0; i < longitudes.length; i++) count[longitudes[i]]++;
  if (count[0] === longitudes.length) {
    // Sin símbolos: árbol válido pero vacío (usado por HDIST=0 en algunos ZIP).
    return { count, symbol: new Int32Array(0) };
  }
  // Offsets canónicos: offsets[len] = nº de símbolos con longitud < len.
  // (Los símbolos de longitud 0 no se colocan nunca, así que count[0] no entra.)
  const offsets = new Int32Array(16);
  offsets[1] = 0;
  for (let n = 1; n < 15; n++) offsets[n + 1] = offsets[n] + count[n];
  const symbol = new Int32Array(longitudes.length);
  for (let i = 0; i < longitudes.length; i++) {
    if (longitudes[i] !== 0) symbol[offsets[longitudes[i]]++] = i;
  }
  return { count, symbol };
}

const LONGITUD_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99,
  115, 131, 163, 195, 227, 258,
] as const;
const LONGITUD_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5,
  5, 0,
] as const;
const DISTANCIA_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769,
  1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
] as const;
const DISTANCIA_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11,
  12, 12, 13, 13,
] as const;
/** Orden del alfabeto de longitudes de código en bloques dinámicos. */
const ORDEN_CL = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15] as const;

class LectorBits {
  private posByte = 0;
  private bitActual = 0;

  constructor(private readonly datos: Uint8Array) {}

  byteAlineado(): number {
    if (this.bitActual !== 0) {
      this.bitActual = 0;
      this.posByte++;
    }
    if (this.posByte >= this.datos.length) throw new ErrorDeflate('fin de datos inesperado (byte alineado)');
    return this.datos[this.posByte++];
  }

  bits(cuantos: number): number {
    let valor = 0;
    for (let i = 0; i < cuantos; i++) {
      if (this.posByte >= this.datos.length) throw new ErrorDeflate('fin de datos inesperado (bits)');
      valor |= ((this.datos[this.posByte] >> this.bitActual) & 1) << i;
      this.bitActual++;
      if (this.bitActual === 8) {
        this.bitActual = 0;
        this.posByte++;
      }
    }
    return valor;
  }

  /** Sinónimo explícito para 1 bit. */
  bit(): number {
    return this.bits(1);
  }
}

function decodificar(arbol: ArbolHuffman, lector: LectorBits): number {
  let codigo = 0;
  let primero = 0;
  let indice = 0;
  for (let longitud = 1; longitud <= 15; longitud++) {
    codigo |= lector.bit();
    const cuenta = arbol.count[longitud];
    // Rango canónico [primero, primero+cuenta) con comprobación explícita:
    // un prefijo fuera de rango es un flujo inválido, no un símbolo a ciegas.
    if (codigo >= primero && codigo < primero + cuenta) return arbol.symbol[indice + (codigo - primero)];
    indice += cuenta;
    primero = (primero + cuenta) << 1;
    codigo <<= 1;
  }
  throw new ErrorDeflate('código Huffman inválido');
}

function construirArbolFijo(): { literales: ArbolHuffman; distancias: ArbolHuffman } {
  const longitudes = new Uint8Array(288);
  for (let i = 0; i < 144; i++) longitudes[i] = 8;
  for (let i = 144; i < 256; i++) longitudes[i] = 9;
  for (let i = 256; i < 280; i++) longitudes[i] = 7;
  for (let i = 280; i < 288; i++) longitudes[i] = 8;
  const distancias = new Uint8Array(30).fill(5);
  return { literales: construirArbol(longitudes), distancias: construirArbol(distancias) };
}

function salidaCreciente(limite: number) {
  let actual = new Uint8Array(Math.min(64 * 1024, Math.max(1024, limite)));
  let longitud = 0;
  return {
    asegurar(extra: number): void {
      if (longitud + extra <= actual.length) return;
      if (longitud + extra > limite) {
        throw new ErrorDeflate(`salida deflate supera la cota de ${limite} bytes (posible bomba de descompresión)`);
      }
      let nuevo = actual.length * 2;
      while (nuevo < longitud + extra) nuevo *= 2;
      const copia = new Uint8Array(Math.min(nuevo, limite + 1));
      copia.set(actual.subarray(0, longitud));
      actual = copia;
    },
    byte(b: number): void {
      this.asegurar(1);
      actual[longitud++] = b;
    },
    bytes(origen: Uint8Array): void {
      this.asegurar(origen.length);
      actual.set(origen, longitud);
      longitud += origen.length;
    },
    get datos(): Uint8Array {
      return actual.subarray(0, longitud);
    },
    get longitud(): number {
      return longitud;
    },
    at(i: number): number {
      return actual[i];
    },
  };
}

/**
 * Descomprime un flujo DEFLATE crudo (sin cabecera zlib/gzip).
 * Lanza `ErrorDeflate` con motivo explícito ante datos inválidos o cotas.
 */
export function inflarRaw(datos: Uint8Array, maxBytes: number = MAX_BYTES_SALIDA_DEFLATE): Uint8Array {
  const lector = new LectorBits(datos);
  const salida = salidaCreciente(maxBytes);
  const fijo = construirArbolFijo();
  let ultimoBloque = false;
  while (!ultimoBloque) {
    ultimoBloque = lector.bit() === 1;
    const tipo = lector.bits(2);
    if (tipo === 0) {
      const len = lector.byteAlineado() | (lector.byteAlineado() << 8);
      const nlen = lector.byteAlineado() | (lector.byteAlineado() << 8);
      if ((len ^ 0xffff) !== nlen) throw new ErrorDeflate('bloque almacenado con LEN/NLEN incoherentes');
      for (let i = 0; i < len; i++) salida.byte(lector.byteAlineado());
      continue;
    }
    if (tipo === 3) throw new ErrorDeflate('tipo de bloque DEFLATE reservado (3)');
    let literales: ArbolHuffman;
    let distancias: ArbolHuffman;
    if (tipo === 1) {
      literales = fijo.literales;
      distancias = fijo.distancias;
    } else {
      const hlit = lector.bits(5) + 257;
      const hdist = lector.bits(5) + 1;
      const hclen = lector.bits(4) + 4;
      if (hlit > 286 || hdist > 30) throw new ErrorDeflate('bloques dinámicos fuera de rango (HLIT/HDIST)');
      const longitudesCl = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) longitudesCl[ORDEN_CL[i]] = lector.bits(3);
      const arbolCl = construirArbol(longitudesCl);
      const longitudes = new Uint8Array(hlit + hdist);
      let i = 0;
      while (i < longitudes.length) {
        const simbolo = decodificar(arbolCl, lector);
        if (simbolo < 16) {
          longitudes[i++] = simbolo;
          continue;
        }
        let repetir: number;
        let valor = 0;
        if (simbolo === 16) {
          if (i === 0) throw new ErrorDeflate('repetición de longitud de código sin símbolo previo');
          valor = longitudes[i - 1];
          repetir = 3 + lector.bits(2);
        } else if (simbolo === 17) {
          repetir = 3 + lector.bits(3);
        } else {
          repetir = 11 + lector.bits(7);
        }
        if (i + repetir > longitudes.length) throw new ErrorDeflate('repetición de longitudes excede el alfabeto');
        while (repetir-- > 0) longitudes[i++] = valor;
      }
      if (longitudes[256] === 0) throw new ErrorDeflate('bloque dinámico sin código de fin de bloque');
      literales = construirArbol(longitudes.subarray(0, hlit));
      distancias = construirArbol(longitudes.subarray(hlit));
    }
    for (;;) {
      const simbolo = decodificar(literales, lector);
      if (simbolo < 256) {
        salida.byte(simbolo);
        continue;
      }
      if (simbolo === 256) break;
      const indiceLongitud = simbolo - 257;
      if (indiceLongitud >= LONGITUD_BASE.length) throw new ErrorDeflate('símbolo de longitud inválido');
      const longitud = LONGITUD_BASE[indiceLongitud] + lector.bits(LONGITUD_EXTRA[indiceLongitud]);
      const simboloDistancia = decodificar(distancias, lector);
      if (simboloDistancia >= DISTANCIA_BASE.length) throw new ErrorDeflate('símbolo de distancia inválido');
      const distancia = DISTANCIA_BASE[simboloDistancia] + lector.bits(DISTANCIA_EXTRA[simboloDistancia]);
      if (distancia > salida.longitud) throw new ErrorDeflate('distancia deflate anterior al inicio de la salida');
      const destino = salida.longitud;
      salida.asegurar(longitud);
      for (let k = 0; k < longitud; k++) salida.byte(salida.at(destino - distancia + k));
    }
  }
  return salida.datos;
}
