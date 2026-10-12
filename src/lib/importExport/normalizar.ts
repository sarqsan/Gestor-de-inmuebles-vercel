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
import { CAMPO_IDENTIDAD_ORIGEN, IGNORADO_NO_MAPEADO } from './contrato';
import { buscarMapeo, claveCabecera, type TipoMapeo } from './mappingRegistry';

export interface ResultadoNormalizacion {
  canonico: Record<string, unknown>;
  mapeos: MapeoCampo[];
  /** Campos sin mapping (IGNORADO_NO_MAPEADO en el informe). */
  desconocidos: string[];
  /**
   * Campos CONOCIDOS sin destino en el modelo: no son desconocidos, no se
   * importan y el motivo se muestra tal cual (INCIDENCIA: titularidad,
   * porcentajes y agregados anuales de la plantilla de inmuebles).
   */
  sinDestino: Array<{ campo: string; motivo: string }>;
  /**
   * Valor de la columna que identifica el registro en origen (p. ej.
   * 'ID Inmueble'). Va a `proveniencia.sourceRecordId`, NUNCA a un dato.
   */
  identidadOrigen: string | null;
  warnings: string[];
  /** Incidencias de transformación con severidad (p. ej. categoría ambigua B1). */
  incidencias: Array<{ campo: string; detalle: string; severidad: 'INFO' | 'REQUIERE_VALIDACION' }>;
}

/**
 * 'Dirección Completa' → `direccion` (+ componentes SÓLO si son explícitos).
 *
 * Regla conservadora y determinista: únicamente se separan el código postal y
 * la ciudad cuando aparecen al final con el patrón «, 5 dígitos Ciudad».
 * En ese caso el valor separado se devuelve en `extra` y `direccion` queda con
 * el resto. Si no hay ese patrón, la dirección se conserva ÍNTEGRA: no se
 * recorta, no se adivina la ciudad y no se inventa el código postal.
 */
export function separarDireccionCompleta(v: unknown): {
  direccion: string;
  codigoPostal?: string;
  ciudad?: string;
} {
  const texto = typeof v === 'string' ? v.replace(/\u00a0/g, ' ').trim() : String(v ?? '').trim();
  const m = /^(.*?)\s*[,;]?\s*(\d{5})\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’.\s-]*)$/.exec(texto);
  if (!m) return { direccion: texto };
  const resto = m[1].replace(/[,;\s]+$/, '').trim();
  const ciudad = m[3].trim();
  if (resto === '' || ciudad === '') return { direccion: texto };
  return { direccion: resto, codigoPostal: m[2], ciudad };
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
  // XLSX/BLOQUE 7: una celda con formato de fecha Y hora llega como ISO con
  // hora ('2024-03-15T13:45:30'). El campo destino del ERP es de día civil, así
  // que se conserva el DÍA y se avisa de la hora descartada (nunca se desplaza
  // el día ni se trunca en silencio).
  const conHora = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)$/.exec(s);
  if (conHora) {
    if (fechaUtil(conHora[1])) {
      warnings.push(`${campo}: '${s}' → ${conHora[1]} (hora ${conHora[2]} descartada: el campo es de fecha civil)`);
      return conHora[1];
    }
  }
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
  const sinDestino: Array<{ campo: string; motivo: string }> = [];
  let identidadOrigen: string | null = null;
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
    if (hallado.identidadOrigen) {
      // Identidad de origen: alimenta proveniencia/sourceRecordId (y con ello
      // los duplicados), nunca un campo del modelo.
      mapeos.push({
        campoOrigen,
        campoCanonico: CAMPO_IDENTIDAD_ORIGEN,
        regla: hallado.regla,
        valorOriginal: valor,
      });
      if (esVacio(valor)) continue;
      const idOrigen = typeof valor === 'string' ? valor.trim() : String(valor).trim();
      if (identidadOrigen !== null && identidadOrigen !== idOrigen) {
        warnings.push(`${campoOrigen}: segunda identidad de origen ('${idOrigen}'); se conserva la primera ('${identidadOrigen}') y se avisa`);
        continue;
      }
      identidadOrigen = idOrigen;
      continue;
    }
    if (hallado.sinDestino) {
      sinDestino.push({ campo: campoOrigen, motivo: hallado.sinDestino.motivo });
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
      if (hallado.transformacion === 'direccionCompleta') {
        // INCIDENCIA: 'Dirección Completa' traía dirección + CP + ciudad en una
        // sola celda y, al no existir alias, TODO quedaba desconocido y el
        // obligatorio `direccion` se marcaba como ausente.
        const partes = separarDireccionCompleta(valor);
        transformado = partes.direccion;
        regla += ';transformacion:direccionCompleta';
        if (partes.codigoPostal && partes.ciudad) {
          warnings.push(
            `${campoOrigen}: '${String(valor)}' → dirección «${partes.direccion}» + CP «${partes.codigoPostal}» + ciudad «${partes.ciudad}» (separados del propio texto: no se inventa ningún componente)`,
          );
        }
        const componentes: ReadonlyArray<[string, string | undefined]> = [
          ['codigoPostal', partes.codigoPostal],
          ['ciudad', partes.ciudad],
        ];
        for (const [destino, valorExtra] of componentes) {
          if (!valorExtra) continue;
          if (destino in canonico && canonico[destino] !== valorExtra) {
            warnings.push(`${campoOrigen}→${destino}: otra columna ya fija «${String(canonico[destino])}»; se conserva ésa y se descarta «${valorExtra}»`);
            continue;
          }
          canonico[destino] = valorExtra;
          mapeos.push({ campoOrigen, campoCanonico: destino, regla: `${hallado.regla};transformacion:direccionCompleta`, valorOriginal: valor });
        }
      } else {
        transformado = typeof valor === 'string' ? valor.trim() : String(valor);
        if (hallado.transformacion === 'primerInquilino' && typeof valor === 'string' && valor.includes(',')) {
          transformado = primerInquilino(valor);
          warnings.push(`${campoOrigen}: multi-inquilino (${valor.split(',').length} nombres): se propone el 1º; requiere validación (B1 I-13)`);
          regla += ';transformacion:primerInquilino';
        } else if (hallado.transformacion === 'trim') {
          regla += ';transformacion:trim';
        }
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
  return { canonico, mapeos, desconocidos, sinDestino, identidadOrigen, warnings, incidencias };
}

/**
 * Detección de entidad por CABECERAS (AUTO) para archivos tabulares en
 * castellano. Complementa —no sustituye— `detectarEntidadRentasync`.
 *
 * Conservadora a propósito: exige DOS señales distintas de la misma entidad y
 * devuelve null en cualquier otro caso (el motor mantiene su comportamiento
 * honesto: DESCONOCIDA → NO_MIGRABLE). Sin esto, un Excel de inmuebles en
 * castellano caía íntegro en NO_MIGRABLE al dejar la entidad en AUTO.
 */
export function detectarEntidadPorCabeceras(registro: Record<string, unknown>): 'INMUEBLE' | 'PROPIETARIO' | null {
  // Se comparan DOS formas de cada clave: con separadores («referencia
  // catastral», típico de cabeceras de Excel) y sin ellos
  // («referenciacatastral», típico de nombres canónicos en JSON).
  const claves = new Set<string>();
  for (const k of Object.keys(registro)) {
    const c = claveCabecera(k);
    if (c === '') continue;
    claves.add(c);
    claves.add(c.replace(/ /g, ''));
  }
  const cuenta = (señales: readonly string[]): number =>
    señales.filter((s) => claves.has(s) || claves.has(s.replace(/ /g, ''))).length;
  const INMUEBLE = ['direccion completa', 'direccion', 'referencia catastral', 'renta mensual', 'precio adquisicion', 'titularidad', 'inquilino', 'superficie'];
  const PROPIETARIO = ['nombre', 'nif', 'nif cif', 'cif', 'dni', 'telefono', 'email'];
  if (cuenta(INMUEBLE) >= 2) return 'INMUEBLE';
  // PROPIETARIO: exige nombre + documento de identidad (solo con 'nombre' no
  // basta: aparece en casi cualquier plantilla).
  if (cuenta(['nombre']) >= 1 && cuenta(['nif', 'nif cif', 'cif', 'dni']) >= 1) return 'PROPIETARIO';
  return null;
}
