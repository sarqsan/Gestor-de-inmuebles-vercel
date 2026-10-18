/** Validación común para extractos P3. No incluye valores bancarios en errores. */
export const DIVISA_BANCARIA_P3 = 'EUR' as const;
export const MAX_BYTES_EXTRACTO_P3 = 5 * 1024 * 1024;
export const MAX_MOVIMIENTOS_EXTRACTO_P3 = 249;

function fnv32(valor: string, semilla: number): string {
  let hash = semilla >>> 0;
  for (let i = 0; i < valor.length; i += 1) {
    hash ^= valor.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Huella estable de 64 bits para deduplicación de filas; no es un secreto ni un MAC. */
export function huellaEstable(valor: string): string {
  const normalizado = String(valor ?? '').normalize('NFC');
  return `${fnv32(normalizado, 0x811c9dc5)}${fnv32(`P3|${normalizado}`, 0x9e3779b9)}`;
}

/** SHA-256 de los bytes originales; se calcula en el navegador antes de confirmar. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const cryptoDisponible = globalThis.crypto;
  if (!cryptoDisponible?.subtle) throw new Error('HUELLA_NO_DISPONIBLE');
  const digest = await cryptoDisponible.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function fechaValida(anio: number, mes: number, dia: number): boolean {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return false;
  if (anio < 1900 || anio > 2200 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

/** Acepta ISO, YYYYMMDD y DD/MM/YYYY o DD-MM-YYYY (convención bancaria ES). */
export function normalizarFechaBancaria(valor: string | undefined | null): string | null {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  let anio: number; let mes: number; let dia: number;
  let m = texto.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  if (m) {
    anio = Number(m[1]); mes = Number(m[2]); dia = Number(m[3]);
    const sufijo = m[4];
    if (sufijo && (!/^[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(sufijo) || !Number.isFinite(Date.parse(texto)))) return null;
  } else if ((m = texto.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    anio = Number(m[1]); mes = Number(m[2]); dia = Number(m[3]);
  } else if ((m = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/))) {
    dia = Number(m[1]); mes = Number(m[2]); anio = Number(m[3]);
    if (anio < 100) anio += anio < 50 ? 2000 : 1900;
  } else return null;
  if (!fechaValida(anio, mes, dia)) return null;
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Convierte formatos ES/EN sin aceptar exponentes, NaN ni más de dos decimales. */
export function parseImporteBancario(valor: string | number | undefined | null): number | null {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return null;
    const centimos = Math.round(valor * 100);
    return Math.abs(centimos - valor * 100) < 1e-7 && Number.isSafeInteger(centimos) ? centimos / 100 : null;
  }
  let texto = String(valor ?? '').trim().replace(/[\s\u00a0]/g, '');
  if (!texto || /[^0-9,.'+\-€]/.test(texto)) return null;
  texto = texto.replace(/€/g, '');
  if (!texto || !/^[+-]?(?:\d+(?:[.,]\d+)*|[.,]\d+)$/.test(texto)) return null;
  const signo = texto.startsWith('-') ? '-' : '';
  const sinSigno = texto.replace(/^[+-]/, '');
  const tienePunto = sinSigno.includes('.');
  const tieneComa = sinSigno.includes(',');
  let entero = '';
  let decimales = '';

  if (tienePunto && tieneComa) {
    const separadorDecimal = sinSigno.lastIndexOf('.') > sinSigno.lastIndexOf(',') ? '.' : ',';
    const posicion = sinSigno.lastIndexOf(separadorDecimal);
    const brutoEntero = sinSigno.slice(0, posicion);
    decimales = sinSigno.slice(posicion + 1);
    const agrupador = separadorDecimal === '.' ? ',' : '.';
    if (!/^\d{1,3}(?:[.,]\d{3})*$/.test(brutoEntero) || brutoEntero.includes(separadorDecimal)) return null;
    if (brutoEntero.includes(agrupador) && !new RegExp(`^\\d{1,3}(?:\\${agrupador}\\d{3})+$`).test(brutoEntero)) return null;
    entero = brutoEntero.split(agrupador).join('');
  } else if (tienePunto || tieneComa) {
    const separador = tienePunto ? '.' : ',';
    const partes = sinSigno.split(separador);
    if (partes.length > 2) {
      if (!partes.every((parte, indice) => /^\d+$/.test(parte) && (indice === 0 ? parte.length >= 1 && parte.length <= 3 : parte.length === 3))) return null;
      entero = partes.join('');
    } else {
      const [antes, despues] = partes;
      if (!/^\d*$/.test(antes) || !/^\d+$/.test(despues)) return null;
      if (despues.length === 3 && antes.length >= 1 && antes.length <= 3) return null;
      if (despues.length > 2) return null;
      entero = antes || '0'; decimales = despues;
    }
  } else {
    entero = sinSigno;
  }
  if (!/^\d+$/.test(entero) || (decimales && !/^\d{1,2}$/.test(decimales))) return null;
  const numero = Number(`${signo}${entero}${decimales ? `.${decimales}` : ''}`);
  if (!Number.isFinite(numero)) return null;
  const centimos = Math.round(numero * 100);
  return Number.isSafeInteger(centimos) ? centimos / 100 : null;
}

export function normalizarDivisa(valor: string | undefined | null, declarada?: string): string | null {
  const candidata = String(valor ?? '').trim() || String(declarada ?? '').trim();
  if (!candidata) return null;
  const divisa = candidata.toUpperCase();
  return /^[A-Z]{3}$/.test(divisa) ? divisa : null;
}

export function cuentaRefBancaria(cuenta: string | undefined | null): string | undefined {
  const normalizada = String(cuenta ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalizada ? `cta_${huellaEstable(normalizada)}` : undefined;
}

/** Referencia opaca de cuenta con SHA-256 para el flujo asíncrono P3. */
export async function cuentaRefBancariaSegura(cuenta: string | undefined | null): Promise<string | undefined> {
  const normalizada = String(cuenta ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!normalizada) return undefined;
  const bytes = new TextEncoder().encode(normalizada);
  return `cta_${await sha256Hex(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))}`;
}

export function redactarTextoBancario(valor: string | undefined | null, max = 500): string {
  return String(valor ?? '')
    .replace(/\b[A-Z]{2}\s?\d{2}(?:\s?[A-Z0-9]){11,30}\b/gi, '[DATO_BANCARIO]')
    .replace(/\b(?:\d[\s-]?){10,30}\b/g, '[DATO_NUMERICO]')
    .slice(0, max);
}

export function enmascararCuentaBancaria(cuenta: string | undefined | null): string | undefined {
  const normalizada = String(cuenta ?? '').replace(/\s+/g, '');
  if (!normalizada) return undefined;
  const ultimos = normalizada.slice(-4);
  return `•••• ${ultimos}`;
}

export function nombreFicheroSeguro(nombre: string | undefined | null, formato: string): string {
  const extension = String(nombre ?? '').split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  const esperada = ({ CSV: 'csv', OFX: 'ofx', MT940: 'mt940', NORMA43: '043' } as Record<string, string>)[formato] || 'txt';
  return `extracto.${extension || esperada}`;
}
