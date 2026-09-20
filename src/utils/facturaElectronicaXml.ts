/**
 * GAP 8 — Utilidades XML para factura electrónica B2B.
 * Deterministas: la salida depende únicamente de los datos de entrada.
 * NO se inventan XSD; se generan mensajes conformes a las especificaciones públicas
 * EN 16931 (CII UN/CEFACT D16B, UBL 2.1 OASIS, Facturae 3.2.x).
 */

/** Escapa caracteres especiales de XML de forma determinista. */
export function xmlEscape(valor: string | undefined): string {
  if (!valor) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Formato monetario determinista de 2 decimales con punto. */
export function importeXml(valor: number | undefined): string {
  const n = Number(valor ?? 0);
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Formato de porcentaje (hasta 4 decimales sin ceros a la derecha; 0 → "0"). */
export function porcentajeXml(valor: number | undefined): string {
  const n = Number(valor ?? 0);
  const r = Math.round(n * 10000) / 10000;
  return String(r);
}

/** Cantidad (admite decimales) sin ceros a la derecha; 0 → "0". */
export function cantidadXml(valor: number | undefined): string {
  const n = Number(valor ?? 0);
  const r = Math.round(n * 10000) / 10000;
  return String(r);
}

/** Fecha dd-mm-aaaa → yyyy-mm-dd (determinista). */
export function fechaIso(ddmmaaaa: string | undefined): string {
  if (!ddmmaaaa) return '';
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ddmmaaaa.trim());
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return ddmmaaaa.trim();
}

/**
 * Agrupa líneas por tipo de IVA (y tipo de línea) para las secciones de
 * impuestos de CII/UBL/Facturae. Determinista por tipoIva + exención.
 */
export interface GrupoIvaB2B {
  tipoIva: number;
  exenta: boolean;
  base: number;
  cuota: number;
}

export interface LineaIvaB2B {
  baseImponible: number;
  cuotaIva: number;
  tipoIva: number;
}

export function agruparPorTipoIva<T extends LineaIvaB2B>(lineas: T[]): GrupoIvaB2B[] {
  const mapa = new Map<string, GrupoIvaB2B>();
  for (const l of lineas) {
    const exenta = (l.tipoIva || 0) === 0 && l.cuotaIva === 0;
    const clave = `${l.tipoIva || 0}|${exenta ? 'EX' : 'GR'}`;
    const grupo = mapa.get(clave) || { tipoIva: l.tipoIva || 0, exenta, base: 0, cuota: 0 };
    grupo.base += l.baseImponible || 0;
    grupo.cuota += l.cuotaIva || 0;
    mapa.set(clave, grupo);
  }
  return Array.from(mapa.values()).sort((a, b) => a.tipoIva - b.tipoIva || (a.exenta ? -1 : 1));
}

/** Categoría de impuesto en función del tipo aplicado (determinista). */
export function categoriaIva(tipoIva: number, exenta: boolean): { codigo: string; nombre: string } {
  if (exenta) return { codigo: 'E', nombre: 'Exenta' };
  if (tipoIva === 0) return { codigo: 'Z', nombre: 'Tipo cero' };
  return { codigo: 'S', nombre: 'Sujeta' };
}
