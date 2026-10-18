/** Parser MT940 con validación de estructura y errores redactados sin líneas bancarias. */
import { normalizarFechaBancaria, parseImporteBancario } from './validacionExtracto';

export interface MovimientoMt940Raw {
  fecha: string;
  fechaValor?: string;
  importe: number;
  tipo: 'C' | 'D' | 'RC' | 'RD';
  concepto: string;
  referencia?: string;
  identificador?: string;
  saldo?: number;
  divisa?: string;
  fila: number;
  raw61: string;
  raw86?: string;
}

export interface Mt940ParseResult {
  movimientos: MovimientoMt940Raw[];
  errores: string[];
  iban?: string;
  divisa?: string;
  numeroExtracto?: string;
  saldoInicial?: number;
  saldoFinal?: number;
  referenciaExtracto?: string;
}

function fechaYYMMDD(valor: string): string | null {
  const m = valor.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const yy = Number(m[1]);
  return normalizarFechaBancaria(`${yy < 50 ? 2000 + yy : 1900 + yy}-${m[2]}-${m[3]}`);
}

function leerSaldo(linea: string, etiqueta: '60' | '62'): { importe?: number; divisa?: string; error?: string } {
  const m = linea.match(new RegExp(`^:${etiqueta}[FM]:([CD])(\\d{6})([A-Z]{3})(\\d+(?:,\\d{1,2})?)$`));
  if (!m) return { error: `MT940_SALDO_${etiqueta}_INVALIDO` };
  const fecha = fechaYYMMDD(m[2]);
  const importeRaw = parseImporteBancario(m[4]);
  if (!fecha || importeRaw === null) return { error: `MT940_SALDO_${etiqueta}_INVALIDO` };
  return { importe: m[1] === 'D' ? -Math.abs(importeRaw) : Math.abs(importeRaw), divisa: m[3] };
}

export function parseMT940(contenido: string): Mt940ParseResult {
  const errores: string[] = [];
  const movimientos: MovimientoMt940Raw[] = [];
  let iban: string | undefined;
  let numeroExtracto: string | undefined;
  let saldoInicial: number | undefined;
  let saldoFinal: number | undefined;
  let divisa: string | undefined;
  let referenciaExtracto: string | undefined;
  const lineas = String(contenido ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const tiene20 = lineas.some((x) => x.startsWith(':20:'));
  const tiene25 = lineas.some((x) => x.startsWith(':25:'));
  const tiene28 = lineas.some((x) => x.startsWith(':28C:') || x.startsWith(':28:'));
  const tiene60 = lineas.some((x) => x.startsWith(':60F:') || x.startsWith(':60M:'));
  const tiene62 = lineas.some((x) => x.startsWith(':62F:') || x.startsWith(':62M:'));
  if (!tiene20 || !tiene25 || !tiene28 || !tiene60 || !tiene62) errores.push('MT940_CABECERA_O_SALDOS_INCOMPLETOS');

  let current61: string | null = null;
  let current86: string | null = null;
  let numeroFila = 0;
  const flush = () => {
    if (!current61) return;
    numeroFila += 1;
    const m = current61.match(/^(\d{6})(\d{4})?([CD]|RC|RD)(\d+(?:,\d{1,2})?)(?:[A-Z]{1,4})?(.*)$/);
    if (!m) {
      errores.push(`Fila ${numeroFila}: MT940_MOVIMIENTO_INVALIDO`);
      current61 = null; current86 = null; return;
    }
    const fecha = fechaYYMMDD(m[1]);
    const importeRaw = parseImporteBancario(m[4]);
    const tipo = m[3] as MovimientoMt940Raw['tipo'];
    if (!fecha || importeRaw === null || importeRaw === 0) {
      errores.push(`Fila ${numeroFila}: MT940_FECHA_O_IMPORTE_INVALIDO`);
      current61 = null; current86 = null; return;
    }
    const importe = tipo === 'D' || tipo === 'RD' ? -Math.abs(importeRaw) : Math.abs(importeRaw);
    const resto = m[5] || '';
    const referencia = resto.match(/\/\/([^/\s]+)/)?.[1] || resto.match(/([A-Z0-9]{6,})/)?.[1];
    const concepto = (current86 || resto).replace(/^\d{3}/, '').trim();
    movimientos.push({
      fecha, importe, tipo, concepto,
      ...(referencia ? { referencia, identificador: referencia } : {}),
      ...(divisa ? { divisa } : {}),
      fila: numeroFila,
      raw61: current61,
      ...(current86 ? { raw86: current86 } : {}),
    });
    current61 = null; current86 = null;
  };

  for (const linea of lineas) {
    if (linea.startsWith(':61:')) {
      flush();
      current61 = linea.slice(4).trim();
      current86 = null;
      continue;
    }
    if (current61 && linea.startsWith(':86:')) {
      current86 = linea.slice(4).trim();
      continue;
    }
    if (current61 && !linea.startsWith(':')) {
      current86 = `${current86 || ''} ${linea}`.trim();
      continue;
    }
    if (current61) flush();
    if (linea.startsWith(':20:')) { referenciaExtracto = linea.slice(4).trim(); continue; }
    if (linea.startsWith(':25:')) { iban = linea.slice(4).trim(); continue; }
    if (linea.startsWith(':28C:') || linea.startsWith(':28:')) {
      const index = linea.indexOf(':', 4); numeroExtracto = index >= 0 ? linea.slice(index + 1).trim() : linea.slice(4).trim(); continue;
    }
    if (linea.startsWith(':60F:') || linea.startsWith(':60M:')) {
      const saldo = leerSaldo(linea, '60');
      if (saldo.error) errores.push(saldo.error);
      else { saldoInicial = saldo.importe; divisa = saldo.divisa; }
      continue;
    }
    if (linea.startsWith(':62F:') || linea.startsWith(':62M:')) {
      const saldo = leerSaldo(linea, '62');
      if (saldo.error) errores.push(saldo.error);
      else {
        saldoFinal = saldo.importe;
        if (divisa && saldo.divisa !== divisa) errores.push('MT940_DIVISAS_DE_SALDO_DISTINTAS');
        else divisa = saldo.divisa;
      }
      continue;
    }
  }
  flush();
  if (movimientos.length === 0) errores.push('MT940_SIN_MOVIMIENTOS');
  return {
    movimientos, errores,
    ...(iban ? { iban } : {}), ...(divisa ? { divisa } : {}),
    ...(numeroExtracto ? { numeroExtracto } : {}),
    ...(saldoInicial !== undefined ? { saldoInicial } : {}),
    ...(saldoFinal !== undefined ? { saldoFinal } : {}),
    ...(referenciaExtracto ? { referenciaExtracto } : {}),
  };
}
