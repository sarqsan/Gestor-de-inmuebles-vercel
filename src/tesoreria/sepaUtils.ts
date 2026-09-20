/**
 * BLOQUE B — Utilidades SEPA: IBAN/BIC/CreditorID, charset EPC, hash y referencias.
 * Referencias normativas documentadas en docs/BLOQUE-B-NORMATIVA-Y-AUDITORIA.md
 * (ISO 13616, ISO 9362, EPC262-08, EPC217-08, ISO 20022).
 */

export const SEPA_VERSION_PAIN008 = 'pain.008.001.02';
export const SEPA_VERSION_PAIN001 = 'pain.001.001.03';

/** Longitudes IBAN por país (subconjunto SEPA + registro general de respaldo). */
const IBAN_LENGTHS: Record<string, number> = {
  ES: 24, FR: 27, DE: 22, IT: 27, PT: 25, BE: 16, NL: 18, IE: 22, AT: 20,
  GR: 27, FI: 18, SE: 24, DK: 18, NO: 15, LU: 20, MT: 31, CY: 28, SK: 24,
  SI: 19, EE: 20, LV: 21, LT: 20, HR: 21, HU: 28, PL: 28, CZ: 24, RO: 24,
  BG: 22, GB: 22, CH: 21, AD: 24, MC: 27, SM: 27, VA: 22,
};

export function normalizarIban(iban: string): string {
  return (iban || '').replace(/[\s\-.]/g, '').toUpperCase();
}

/** Validación IBAN ISO 13616 (mod-97 == 1) + longitud nacional. */
export function validarIban(iban: string): { valido: boolean; error?: string; iban?: string } {
  const v = normalizarIban(iban);
  if (!v) return { valido: false, error: 'IBAN vacío' };
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(v)) {
    return { valido: false, error: 'Formato IBAN inválido (2 letras + 2 dígitos + BBAN)' };
  }
  const pais = v.slice(0, 2);
  const esperada = IBAN_LENGTHS[pais];
  if (esperada && v.length !== esperada) {
    return { valido: false, error: `Longitud IBAN incorrecta para ${pais}: ${v.length}, esperada ${esperada}` };
  }
  if (v.length < 15 || v.length > 34) {
    return { valido: false, error: 'Longitud IBAN fuera de rango ISO 13616 (15-34)' };
  }
  // mod-97
  const reordenado = v.slice(4) + v.slice(0, 4);
  let resto = 0;
  for (const ch of reordenado) {
    const code = ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of code) resto = (resto * 10 + Number(d)) % 97;
  }
  if (resto !== 1) return { valido: false, error: 'Dígitos de control IBAN inválidos (mod-97)' };
  return { valido: true, iban: v };
}

/** Validación BIC ISO 9362 (8 u 11 caracteres). */
export function validarBic(bic: string): { valido: boolean; error?: string } {
  const v = (bic || '').replace(/\s/g, '').toUpperCase();
  if (!v) return { valido: true }; // opcional en SEPA interior
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v)) {
    return { valido: false, error: 'Formato BIC inválido (ISO 9362: 8 u 11 caracteres)' };
  }
  return { valido: true };
}

/**
 * Validación del Creditor Identifier SEPA (EPC AT-02 / EPC262-08, ISO 7064 Mod 97-10).
 * Formato ES: ES + 2 dígitos control + 3 negocio + NIF (total típico 16-35).
 */
export function validarCreditorId(ci: string): { valido: boolean; error?: string; ci?: string } {
  const v = (ci || '').replace(/\s/g, '').toUpperCase();
  if (!v) return { valido: false, error: 'Creditor ID vacío (obligatorio en pain.008)' };
  if (v.length < 8 || v.length > 35) {
    return { valido: false, error: 'Longitud de Creditor ID fuera de rango (8-35)' };
  }
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9]+$/.test(v)) {
    return { valido: false, error: 'Formato Creditor ID inválido (CC+2 dígitos+3 negocio+identificador nacional)' };
  }
  // ISO 7064 Mod 97-10 sobre (parte nacional + país + 00), ignorando negocio
  const pais = v.slice(0, 2);
  const digitos = v.slice(2, 4);
  const nacional = v.slice(7);
  const cadena = nacional + pais + '00';
  let resto = 0;
  let numerico = '';
  for (const ch of cadena) {
    numerico += ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) - 55);
  }
  for (const d of numerico) resto = (resto * 10 + Number(d)) % 97;
  const esperado = String(98 - resto).padStart(2, '0');
  if (esperado !== digitos) {
    return { valido: false, error: `Dígitos de control del Creditor ID inválidos (esperado ${esperado})` };
  }
  return { valido: true, ci: v };
}

/** Calcula dígitos de control de un Creditor ID español dado negocio+NIF. */
export function calcularCreditorIdES(negocio: string, nif: string): string {
  const neg = (negocio || '000').toUpperCase().padStart(3, '0').slice(0, 3);
  const nacional = (nif || '').replace(/\s/g, '').toUpperCase();
  const cadena = nacional + 'ES00';
  let numerico = '';
  for (const ch of cadena) {
    numerico += ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) - 55);
  }
  let resto = 0;
  for (const d of numerico) resto = (resto * 10 + Number(d)) % 97;
  const digitos = String(98 - resto).padStart(2, '0');
  return `ES${digitos}${neg}${nacional}`;
}

/**
 * Sanea texto al juego de caracteres SEPA (EPC217-08 básico latino):
 * A-Z a-z 0-9 y / - ? : ( ) . , ' + espacio. Convierte Ñ/ç/acentos.
 */
const ACENTOS: Record<string, string> = {
  Á: 'A', À: 'A', Ä: 'A', Â: 'A', Ã: 'A', Å: 'A', É: 'E', È: 'E', Ë: 'E', Ê: 'E',
  Í: 'I', Ì: 'I', Ï: 'I', Î: 'I', Ó: 'O', Ò: 'O', Ö: 'O', Ô: 'O', Õ: 'O',
  Ú: 'U', Ù: 'U', Ü: 'U', Û: 'U', Ñ: 'N', Ç: 'C', Ý: 'Y',
  á: 'a', à: 'a', ä: 'a', â: 'a', ã: 'a', å: 'a', é: 'e', è: 'e', ë: 'e', ê: 'e',
  í: 'i', ì: 'i', ï: 'i', î: 'i', ó: 'o', ò: 'o', ö: 'o', ô: 'o', õ: 'o',
  ú: 'u', ù: 'u', ü: 'u', û: 'u', ñ: 'n', ç: 'c', ý: 'y', ÿ: 'y',
  'ª': 'a', 'º': 'o', '€': 'EUR', '&': '+', '"': "'", '¡': '', '!': '.', '¿': '', ';': ',', '*': '.', '#': '-', '%': '',
};

export function sanitizarTextoSepa(texto: string, maxLen = 70): string {
  let out = '';
  for (const ch of texto || '') {
    if (/[A-Za-z0-9/\-?:().,+ ]/.test(ch)) out += ch;
    else if (ACENTOS[ch] !== undefined) out += ACENTOS[ch];
    // cualquier otro carácter se omite
  }
  out = out.replace(/\s+/g, ' ').trim();
  return out.slice(0, maxLen);
}

/** Escapa XML. */
export function escapeXml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Formatea importe a string SEPA (2 decimales, punto). */
export function formatoImporteSepa(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/**
 * Hash determinista FNV-1a 32-bit (hex) para idempotencia/detección de duplicados.
 * Sin dependencias; suficiente como huella de contenido (no criptográfico).
 */
export function hashContenido(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** MsgId determinista: prefijo + fecha + hash corto (máx 35 chars SEPA). */
export function generarMsgId(prefijo: string, semilla: string, fechaISO?: string): string {
  const fecha = (fechaISO || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const h = hashContenido(semilla).toUpperCase();
  const base = `${prefijo}${fecha}${h}`.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return base.slice(0, 35);
}

/** EndToEndId determinista por origen (máx 35 chars). */
export function generarEndToEndId(origenTipo: string, origenId: string, periodo?: string): string {
  const base = `E2E${origenTipo}${origenId}${periodo || ''}`.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (base.length <= 35) return base;
  return (base.slice(0, 27) + hashContenido(base).toUpperCase()).slice(0, 35);
}

/** Redondeo contable a céntimos. */
export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Valida fecha YYYY-MM-DD. */
export function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

/** Valida periodo YYYY-MM. */
export function esPeriodoValido(periodo: string): boolean {
  const m = /^(20\d{2})-(0[1-9]|1[0-2])$/.exec(periodo || '');
  return !!m;
}
