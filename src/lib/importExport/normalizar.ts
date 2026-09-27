/**
 * Normalización general del importador canónico. Capa PURA (sin I/O).
 *
 * Aplica el Mapping Registry: campo que existe y puede mapearse → se importa;
 * campo que no existe → no se inventa; campo adicional → IGNORADO_NO_MAPEADO
 * (nunca fatal); conocido sin destino → documentado con motivo.
 *
 * Reutiliza (no duplica):
 *  · B1 (`src/lib/importacion/normalizar.ts`): redondear2, parseFechaDMY,
 *    fechaUtil, mapaCategoriaGasto (tabla de categorías Rentasync).
 *  · Conciliación (`src/utils/conciliacion/csvParser.ts`): parseImporteCSV
 *    (formatos ES/EN de importes en texto, p. ej. desde CSV).
 */
import type { CategoriaGasto } from '../../types';
import {
  fechaUtil,
  mapaCategoriaGasto,
  parseFechaDMY,
  redondear2,
} from '../importacion/normalizar';
import { parseImporteCSV } from '../../utils/conciliacion/csvParser';
import type { MapeoCampo } from './contrato';
import { IGNORADO_NO_MAPEADO } from './contrato';
import { buscarMapeo, type TipoMapeo } from './mappingRegistry';

export interface ResultadoNormalizacion {
  canonico: Record<string, unknown>;
  mapeos: MapeoCampo[];
  /** Campos sin mapping (IGNORADO_NO_MAPEADO en el informe). */
  desconocidos: string[];
  warnings: string[];
  /** Incidencias de transformación con severidad (p. ej. categoría ambigua B1). */
  incidencias: Array<{ campo: string; detalle: string; severidad: 'INFO' | 'REQUIERE_VALIDACION' }>;
}

const CATEGORIAS_GASTO: ReadonlySet<string> = new Set([
  'COMUNIDAD', 'IBI', 'SEGURO_HOGAR', 'SEGUROS', 'SUMINISTROS', 'MANTENIMIENTO',
  'REPARACION', 'MANTENIMIENTO_REPARACION', 'ADMINISTRACION', 'GESTION', 'LIMPIEZA',
  'IMPUESTOS_TASAS', 'ELECTRODOMESTICOS', 'MOBILIARIO', 'REFORMAS', 'OTRO',
  'OTRO_EXPLOTACION', 'CUOTA_HIPOTECARIA', 'INTERESES_PRESTAMO', 'OTRO_FINANCIACION',
]);

function esVacio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function aNumero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') return parseImporteCSV(v);
  return null;
}

function aEntero(v: unknown): number | null {
  const n = aNumero(v);
  return n !== null && Number.isInteger(n) ? n : null;
}

function aBooleano(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number' && (v === 0 || v === 1)) return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', '1', 'si', 'sí', 'yes', 'verdadero'].includes(s)) return true;
    if (['false', '0', 'no', 'falso'].includes(s)) return false;
  }
  return null;
}

function aFecha(v: unknown, transformacion: string | undefined, warnings: string[], campo: string): string | null {
  if (typeof v !== 'string' || v.trim() === '') {
    if (typeof v === 'string' && v.trim() === '') return null;
    warnings.push(`${campo}: fecha no textual, se deja ausente (no se inventa)`);
    return null;
  }
  const s = v.trim();
  if (fechaUtil(s)) return s; // ISO válido (B1)
  const dmy = parseFechaDMY(s); // D/M/YYYY día-primer explícito (B1)
  if (dmy.iso) {
    warnings.push(
      `${campo}: '${s}' interpretado como ${dmy.iso} (día-primer explícito${dmy.ambigua ? '; AMBIGUA día/mes, requiere confirmación' : ''})`,
    );
    return dmy.iso;
  }
  void transformacion;
  warnings.push(`${campo}: fecha '${s}' no reconocida (ni ISO ni D/M/YYYY); se deja ausente`);
  return null;
}

function aCategoria(v: unknown, concepto: string, warnings: string[], incidencias: ResultadoNormalizacion['incidencias']): CategoriaGasto | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const s = v.trim();
  if (CATEGORIAS_GASTO.has(s)) return s as CategoriaGasto;
  // Tabla B1 (Rentasync community/ibi/insurance/repairs + concepto).
  const r = mapaCategoriaGasto(s, concepto);
  if (r.categoria) {
    if (r.clasificacion === 'C') {
      incidencias.push({
        campo: 'categoria',
        detalle: `categoría '${s}'→${r.categoria} (B1 clase C: ${r.ambigua ?? r.regla}; requiere validación)`,
        severidad: 'REQUIERE_VALIDACION',
      });
    }
    return r.categoria;
  }
  warnings.push(`categoria '${s}' no reconocida (ni canónica ni tabla B1); se deja ausente`);
  return null;
}

/**
 * Detecta entidad Rentasync por discriminante (semántica B1):
 * type='ingreso'+category='rent' → COBRO; type='gasto' → GASTO.
 */
export function detectarEntidadRentasync(registro: Record<string, unknown>): 'GASTO' | 'COBRO' | null {
  if (registro['type'] === 'ingreso' && registro['category'] === 'rent') return 'COBRO';
  if (registro['type'] === 'gasto') return 'GASTO';
  return null;
}

function primerInquilino(v: unknown): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  // B1 I-13: multi-inquilino en string plano; 1º→candidato (propuesta, requiere validación).
  const partes = v.split(',').map((s) => s.trim()).filter(Boolean);
  return partes.length > 0 ? partes[0] : null;
}

/**
 * Aplica el registry a un registro. Nunca lanza por datos (los errores de
 * transformación → warnings + campo ausente); el pipeline aísla además por registro.
 */
export function aplicarMapping(
  entidad: string,
  registro: Record<string, unknown>,
): ResultadoNormalizacion {
  const canonico: Record<string, unknown> = {};
  const mapeos: MapeoCampo[] = [];
  const desconocidos: string[] = [];
  const warnings: string[] = [];
  const incidencias: ResultadoNormalizacion['incidencias'] = [];

  // Concepto provisional para la tabla B1 de categorías (description/concepto en crudo).
  const conceptoCrudo = typeof registro['description'] === 'string'
    ? (registro['description'] as string)
    : typeof registro['concepto'] === 'string' ? (registro['concepto'] as string) : '';

  // Dos pasadas: primero canónicos directos (el dato explícito manda),
  // después alias. Así un alias nunca pisa a un canónico por orden de claves.
  const claves = Object.keys(registro);
  const esDirecto = (k: string): boolean => buscarMapeo(entidad, k)?.regla === 'canonico';
  const ordenadas = [...claves.filter(esDirecto), ...claves.filter((k) => !esDirecto(k))];
  for (const campoOrigen of ordenadas) {
    const valor = registro[campoOrigen];
    const hallado = buscarMapeo(entidad, campoOrigen);
    if (!hallado) {
      desconocidos.push(campoOrigen);
      continue;
    }
    if (hallado.sinDestino) {
      mapeos.push({
        campoOrigen,
        campoCanonico: IGNORADO_NO_MAPEADO,
        regla: `conocido_sin_destino: ${hallado.sinDestino.motivo}`,
        valorOriginal: valor,
      });
      continue;
    }
    if (esVacio(valor)) {
      // Campo mapeado pero vacío: no se importa, no se inventa.
      mapeos.push({ campoOrigen, campoCanonico: hallado.canonicos[0], regla: `${hallado.regla};vacio:ausente` });
      continue;
    }
    const tipo: TipoMapeo = hallado.tipo ?? 'string';
    let transformado: unknown = null;
    let regla = hallado.regla;
    if (tipo === 'string') {
      transformado = typeof valor === 'string' ? valor.trim() : String(valor);
      if (hallado.transformacion === 'primerInquilino' && typeof valor === 'string' && valor.includes(',')) {
        transformado = primerInquilino(valor);
        warnings.push(`${campoOrigen}: multi-inquilino (${valor.split(',').length} nombres): se propone el 1º; requiere validación (B1 I-13)`);
        regla += ';transformacion:primerInquilino';
      } else if (hallado.transformacion === 'trim') {
        regla += ';transformacion:trim';
      }
    } else if (tipo === 'number') {
      const n = aNumero(valor);
      if (n === null) {
        warnings.push(`${campoOrigen}: importe no numérico ('${String(valor)}'); se deja ausente`);
        mapeos.push({ campoOrigen, campoCanonico: hallado.canonicos[0], regla: `${hallado.regla};no_numerico:ausente`, valorOriginal: valor });
        continue;
      }
      transformado = redondear2(n);
      regla += ';transformacion:redondeo2';
    } else if (tipo === 'entero') {
      const n = aEntero(valor);
      if (n === null) {
        warnings.push(`${campoOrigen}: entero no válido ('${String(valor)}'); se deja ausente`);
        mapeos.push({ campoOrigen, campoCanonico: hallado.canonicos[0], regla: `${hallado.regla};no_entero:ausente`, valorOriginal: valor });
        continue;
      }
      transformado = n;
    } else if (tipo === 'fecha') {
      const f = aFecha(valor, hallado.transformacion, warnings, campoOrigen);
      if (f === null) {
        mapeos.push({ campoOrigen, campoCanonico: hallado.canonicos[0], regla: `${hallado.regla};fecha_no_reconocida:ausente`, valorOriginal: valor });
        continue;
      }
      transformado = f;
      regla += `;transformacion:${hallado.transformacion ?? 'fechaISOoDMY'}`;
    } else if (tipo === 'boolean') {
      const b = aBooleano(valor);
      if (b === null) {
        warnings.push(`${campoOrigen}: booleano no válido ('${String(valor)}'); se deja ausente`);
        mapeos.push({ campoOrigen, campoCanonico: hallado.canonicos[0], regla: `${hallado.regla};no_booleano:ausente`, valorOriginal: valor });
        continue;
      }
      transformado = b;
    } else if (tipo === 'categoriaGasto') {
      const c = aCategoria(valor, conceptoCrudo, warnings, incidencias);
      if (c === null) {
        mapeos.push({ campoOrigen, campoCanonico: hallado.canonicos[0], regla: `${hallado.regla};categoria_no_reconocida:ausente`, valorOriginal: valor });
        continue;
      }
      transformado = c;
      regla += ';transformacion:tablaB1';
    }
    // 1→N (p. ej. monthlyRent→precio+rentaMensual): mismo valor a cada destino.
    for (const destino of hallado.canonicos) {
      const mapeo: MapeoCampo = { campoOrigen, campoCanonico: destino, regla };
      if (typeof valor === 'string' && typeof transformado === 'string' && valor !== transformado) {
        mapeo.valorOriginal = valor;
      } else if (typeof valor !== typeof transformado) {
        mapeo.valorOriginal = valor;
      }
      // Colisión: dos orígenes mapean al mismo canónico → primero gana, aviso explícito.
      if (destino in canonico && canonico[destino] !== transformado) {
        warnings.push(`${campoOrigen}→${destino}: colisión (ya fijado por otro origen); se conserva el primero`);
        continue;
      }
      canonico[destino] = transformado;
      mapeos.push(mapeo);
    }
  }
  return { canonico, mapeos, desconocidos, warnings, incidencias };
}
