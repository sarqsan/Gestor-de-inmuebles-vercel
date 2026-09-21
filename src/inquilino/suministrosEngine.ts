/**
 * BLOQUE E — Motor de suministros (puro, sin Firebase).
 * Validaciones de CUPS/contador, lecturas, cambios de titular y reparto.
 */
import type {
  TipoSuministro,
  TramoRepartoSuministro,
} from '../types';

export interface ResultadoValidacion {
  ok: boolean;
  errores: string[];
}

function resultado(errores: string[]): ResultadoValidacion {
  return { ok: errores.length === 0, errores };
}

/** CUPS: código ES + 18 caracteres + sufijo opcional (p. ej. ES0021000000000001AB-001). */
const RE_CUPS = /^ES[0-9A-Z]{18}(-\d{1,3}[0-9A-Z]*)?$/i;

export function esCupsValido(cups: string | undefined | null): boolean {
  if (!cups) return false;
  return RE_CUPS.test(cups.trim());
}

export interface DatosAltaSuministro {
  inmuebleId?: string;
  tipo?: TipoSuministro | string;
  cups?: string;
  numeroContador?: string;
  potenciaContratadaKw?: number;
}

/** Validación del alta de un suministro (usada por el ERP y reutilizada en tests). */
export function validarAltaSuministro(d: DatosAltaSuministro): ResultadoValidacion {
  const errores: string[] = [];
  if (!d.inmuebleId || d.inmuebleId.trim().length === 0) {
    errores.push('El suministro debe estar vinculado a un inmueble.');
  }
  const tipos = ['LUZ', 'AGUA', 'GAS', 'INTERNET', 'OTRO'];
  if (!d.tipo || !tipos.includes(d.tipo)) {
    errores.push('Tipo de suministro no válido.');
  }
  if (d.tipo === 'LUZ' || d.tipo === 'GAS') {
    if (!esCupsValido(d.cups)) {
      errores.push('El CUPS no es válido (formato ES + 18 caracteres).');
    }
  }
  if (d.tipo === 'AGUA' && d.numeroContador !== undefined && d.numeroContador.trim().length === 0) {
    errores.push('El número de contador no puede estar vacío.');
  }
  if (
    d.potenciaContratadaKw !== undefined &&
    !(typeof d.potenciaContratadaKw === 'number' && isFinite(d.potenciaContratadaKw) && d.potenciaContratadaKw > 0)
  ) {
    errores.push('La potencia contratada debe ser un número mayor que cero.');
  }
  return resultado(errores);
}

export interface DatosLectura {
  valor?: unknown;
  unidad?: string;
  fechaLectura?: string;
  /** Última lectura registrada del mismo suministro (para control de secuencia). */
  ultimoValor?: number;
  /** now inyectable para tests (ISO). */
  ahoraIso?: string;
}

/**
 * Validación de una lectura de contador.
 * Reglas: valor numérico ≥ 0, unidad informada, fecha válida no futura y
 * secuencia no decreciente respecto a la última lectura del suministro.
 */
export function validarLectura(d: DatosLectura): ResultadoValidacion {
  const errores: string[] = [];
  if (typeof d.valor !== 'number' || !isFinite(d.valor) || d.valor < 0) {
    errores.push('El valor de la lectura debe ser un número mayor o igual que cero.');
  }
  if (!d.unidad || d.unidad.trim().length === 0) {
    errores.push('La unidad de la lectura es obligatoria (kWh, m3...).');
  }
  if (!d.fechaLectura) {
    errores.push('La fecha de la lectura es obligatoria.');
  } else {
    const f = new Date(d.fechaLectura);
    if (isNaN(f.getTime())) {
      errores.push('La fecha de la lectura no es válida.');
    } else {
      const ahora = d.ahoraIso ? new Date(d.ahoraIso) : new Date();
      if (f.getTime() > ahora.getTime() + 5 * 60 * 1000) {
        errores.push('La fecha de la lectura no puede ser futura.');
      }
    }
  }
  if (
    typeof d.valor === 'number' &&
    isFinite(d.valor) &&
    typeof d.ultimoValor === 'number' &&
    isFinite(d.ultimoValor) &&
    d.valor < d.ultimoValor
  ) {
    errores.push(
      `La lectura (${d.valor}) es inferior a la última registrada (${d.ultimoValor}). ` +
        'Si el contador se ha sustituido, indíquelo en observaciones y registre una nueva lectura.'
    );
  }
  return resultado(errores);
}

/**
 * Validación del reparto de un suministro entre tramos/habitaciones.
 * Reglas: al menos 1 tramo, etiquetas únicas no vacías, porcentajes > 0
 * y suma total 100% (±0.01 por redondeo).
 */
export function validarReparto(tramos: TramoRepartoSuministro[] | undefined | null): ResultadoValidacion {
  const errores: string[] = [];
  if (!tramos || tramos.length === 0) {
    return resultado(['El reparto debe incluir al menos un tramo.']);
  }
  const vistas = new Set<string>();
  let suma = 0;
  tramos.forEach((t, i) => {
    const etiqueta = (t.etiqueta || '').trim();
    if (!etiqueta) {
      errores.push(`El tramo ${i + 1} no tiene etiqueta.`);
    } else if (vistas.has(etiqueta.toLowerCase())) {
      errores.push(`La etiqueta '${etiqueta}' está duplicada en el reparto.`);
    } else {
      vistas.add(etiqueta.toLowerCase());
    }
    if (typeof t.porcentaje !== 'number' || !isFinite(t.porcentaje) || t.porcentaje <= 0 || t.porcentaje > 100) {
      errores.push(`El tramo '${etiqueta || i + 1}' debe tener un porcentaje entre 0 y 100.`);
    } else {
      suma += t.porcentaje;
    }
  });
  if (errores.length === 0 && Math.abs(suma - 100) > 0.01) {
    errores.push(`La suma del reparto debe ser 100% (actual: ${Number(suma.toFixed(2))}%).`);
  }
  return resultado(errores);
}

export interface TramoRepartoCalculado {
  etiqueta: string;
  habitacionIdentificador?: string;
  porcentaje: number;
  importe: number;
}

/**
 * Reparte un importe entre tramos con redondeo a céntimos.
 * El residuo del redondeo se ajusta en el último tramo para que la suma
 * sea exactamente el importe total.
 */
export function calcularRepartoImporte(
  tramos: TramoRepartoSuministro[],
  importeTotal: number
): TramoRepartoCalculado[] {
  if (tramos.length === 0 || !(importeTotal >= 0)) return [];
  const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const calc = tramos.map((t) => ({
    etiqueta: t.etiqueta,
    habitacionIdentificador: t.habitacionIdentificador,
    porcentaje: t.porcentaje,
    importe: redondear2((importeTotal * t.porcentaje) / 100),
  }));
  const suma = calc.reduce((acc, t) => acc + t.importe, 0);
  const diferencia = redondear2(importeTotal - suma);
  if (diferencia !== 0) {
    calc[calc.length - 1].importe = redondear2(calc[calc.length - 1].importe + diferencia);
  }
  return calc;
}

export interface DatosCambioTitular {
  titularNuevoNombre?: string;
  titularNuevoNif?: string;
  fechaEfecto?: string;
}

/** Validación de la solicitud de cambio de titularidad. */
export function validarCambioTitular(d: DatosCambioTitular): ResultadoValidacion {
  const errores: string[] = [];
  if (!d.titularNuevoNombre || d.titularNuevoNombre.trim().length < 3) {
    errores.push('El nombre del nuevo titular debe tener al menos 3 caracteres.');
  }
  if (d.titularNuevoNif !== undefined && d.titularNuevoNif.trim().length > 0) {
    const nif = d.titularNuevoNif.trim().toUpperCase();
    // NIF (8 dígitos + letra) o NIE (X/Y/Z + 7 dígitos + letra). Validación de formato.
    if (!/^(\d{8}[A-Z]|[XYZ]\d{7}[A-Z])$/.test(nif)) {
      errores.push('El NIF/NIE del nuevo titular no tiene un formato válido.');
    }
  }
  if (!d.fechaEfecto) {
    errores.push('La fecha de efecto es obligatoria.');
  } else if (isNaN(new Date(d.fechaEfecto).getTime())) {
    errores.push('La fecha de efecto no es válida.');
  }
  return resultado(errores);
}

/** Unidad sugerida por tipo de suministro. */
export function unidadSugerida(tipo: TipoSuministro | string): string {
  switch (tipo) {
    case 'LUZ':
      return 'kWh';
    case 'AGUA':
      return 'm3';
    case 'GAS':
      return 'm3';
    default:
      return '';
  }
}
