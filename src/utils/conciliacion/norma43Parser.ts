/**
 * Norma 43 / AEB Parser
 * Estructura básica:
 * - Registro 11: cabecera cuenta
 * - Registro 22: movimiento
 * - Registro 23: concepto adicional (hasta 5)
 * - Registro 33: equivalente en divisa origen
 * - Registro 88: fin
 * 
 * Implementación tolerante, separa parser → normalizador
 */

export interface MovimientoNorma43Raw {
  fechaOperacion: string; // YYYY-MM-DD
  fechaValor: string; // YYYY-MM-DD
  importe: number; // positivo ingreso, negativo gasto
  conceptoComun?: string; // código 01-99
  conceptoPropio?: string;
  documento?: string;
  referencia1?: string;
  referencia2?: string;
  conceptoAdicional: string[]; // registros 23 concatenados
  raw22: string;
  raw23: string[];
}

export interface Norma43ParseResult {
  movimientos: MovimientoNorma43Raw[];
  errores: string[];
  iban?: string;
  entidad?: string;
  oficina?: string;
  cuenta?: string;
  fechaInicial?: string;
  fechaFinal?: string;
}

function parseFechaNorma43(yyMMdd: string): string | null {
  if (!/^\d{6}$/.test(yyMMdd)) return null;
  const yy = parseInt(yyMMdd.substring(0,2),10);
  const mm = yyMMdd.substring(2,4);
  const dd = yyMMdd.substring(4,6);
  const yyyy = yy < 50 ? 2000 + yy : 1900 + yy;
  if (parseInt(mm,10) <1 || parseInt(mm,10) >12) return null;
  if (parseInt(dd,10) <1 || parseInt(dd,10) >31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function parseImporteNorma43(importeStr: string): number | null {
  // 14 posiciones, 2 decimales implícitos, últimos 2 = decimales
  // Ej: 00000000123456 => 1234.56
  if (!/^\d{14}$/.test(importeStr)) return null;
  const entero = importeStr.substring(0,12);
  const decimales = importeStr.substring(12,14);
  const num = Number(`${parseInt(entero,10)}.${decimales}`);
  return isNaN(num) ? null : num;
}

export function parseNorma43(contenido: string): Norma43ParseResult {
  const errores: string[] = [];
  const movimientos: MovimientoNorma43Raw[] = [];
  let iban: string | undefined;
  let entidad: string | undefined;
  let oficina: string | undefined;
  let cuenta: string | undefined;
  let fechaInicial: string | undefined;
  let fechaFinal: string | undefined;

  const lineas = contenido.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.length>0);

  let currentMov: MovimientoNorma43Raw | null = null;
  let current23: string[] = [];

  const flushMov = () => {
    if (currentMov) {
      currentMov.conceptoAdicional = [...current23];
      movimientos.push(currentMov);
      currentMov = null;
      current23 = [];
    }
  };

  for (const linea of lineas) {
    if (linea.length < 2) continue;
    const tipo = linea.substring(0,2);

    if (tipo === '11') {
      // 11: cabecera
      // Posiciones: 2-4 entidad, 4-8 oficina, 8-18 cuenta, 20-26 fecha inicial, 26-32 fecha final, etc.
      if (linea.length >= 32) {
        entidad = linea.substring(2,6).trim();
        oficina = linea.substring(6,10).trim();
        cuenta = linea.substring(10,20).trim();
        const fIni = linea.substring(20,26);
        const fFin = linea.substring(26,32);
        fechaInicial = parseFechaNorma43(fIni) || undefined;
        fechaFinal = parseFechaNorma43(fFin) || undefined;
      }
      // Intentar extraer IBAN si viene en campo libre
      const ibanMatch = linea.match(/[A-Z]{2}\d{2}[A-Z0-9]{10,30}/);
      if (ibanMatch) iban = ibanMatch[0];
    } else if (tipo === '22') {
      // Nuevo movimiento, flush anterior
      flushMov();

      if (linea.length < 80) {
        errores.push(`Registro 22 demasiado corto: ${linea}`);
        continue;
      }
      // Estructura 22:
      // 2-6 oficina, 6-16 fecha operación (6) + fecha valor (6)?? Ver spec
      // Simplificación basada en norma común:
      // Pos 12-18: fecha operación YYMMDD (6)
      // Pos 18-24: fecha valor YYMMDD (6)
      // Pos 24-25: concepto común (2)
      // Pos 25-28: concepto propio (3)
      // Pos 28-30: debe/haber 01/02
      // Pos 30-44: importe 14
      // Pos 44-48: documento 4
      // Pos 48-60: referencia1 12
      // Pos 60-72: referencia2 12
      // Pos 72-80: libre

      // Tolerante: buscar fechas e importe por posición estándar
      const fechaOpStr = linea.substring(12,18);
      const fechaValStr = linea.substring(18,24);
      const conceptoComun = linea.substring(24,26).trim();
      const conceptoPropio = linea.substring(26,29).trim();
      const debeHaber = linea.substring(29,31).trim(); // 01 debe, 02 haber
      const importeStr = linea.substring(31,45).trim();
      const documento = linea.substring(45,49).trim();
      const ref1 = linea.substring(49,61).trim();
      const ref2 = linea.substring(61,73).trim();

      const fechaOp = parseFechaNorma43(fechaOpStr);
      const fechaVal = parseFechaNorma43(fechaValStr);
      const importeRaw = parseImporteNorma43(importeStr);

      if (!fechaOp) {
        errores.push(`Fecha operación inválida Norma43: ${fechaOpStr} en ${linea}`);
        continue;
      }
      if (!fechaVal) {
        errores.push(`Fecha valor inválida Norma43: ${fechaValStr} en ${linea}`);
        continue;
      }
      if (importeRaw === null) {
        errores.push(`Importe inválido Norma43: ${importeStr} en ${linea}`);
        continue;
      }

      let importe = importeRaw;
      if (debeHaber === '01') importe = -Math.abs(importe); // debe = cargo = gasto
      else importe = Math.abs(importe); // haber = ingreso

      currentMov = {
        fechaOperacion: fechaOp,
        fechaValor: fechaVal,
        importe,
        conceptoComun,
        conceptoPropio,
        documento: documento || undefined,
        referencia1: ref1 || undefined,
        referencia2: ref2 || undefined,
        conceptoAdicional: [],
        raw22: linea,
        raw23: [],
      };
      current23 = [];
    } else if (tipo === '23') {
      // Concepto adicional
      if (!currentMov) {
        errores.push(`Registro 23 sin movimiento previo: ${linea}`);
        continue;
      }
      // Pos 2-4 concepto adicional, 4-80 texto
      const texto = linea.length > 4 ? linea.substring(4,80).trim() : '';
      if (texto) current23.push(texto);
      currentMov.raw23.push(linea);
    } else if (tipo === '33') {
      // Equivalente divisa, ignorar por ahora pero conservar para auditoría
      continue;
    } else if (tipo === '88') {
      // Fin
      flushMov();
      break;
    } else {
      // Otros tipos, ignorar pero log
      // console.warn(`Tipo Norma43 desconocido: ${tipo}`);
    }
  }
  flushMov();

  return { movimientos, errores, iban, entidad, oficina, cuenta, fechaInicial, fechaFinal };
}
