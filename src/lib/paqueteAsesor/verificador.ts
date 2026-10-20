/**
 * FASE F — Verificador INDEPENDIENTE del paquete contable del asesor.
 *
 * Propósito: un paquete del asesor solo es papel de trabajo fiable si
 * alguien que NO usó el motor puede comprobar, desde los bytes del ZIP:
 *  1. que el ZIP está íntegro (estructura, CRC-32, tamaños, sin huecos);
 *  2. que cada entrada coincide con el SHA-256 declarado en el manifiesto;
 *  3. que conteos, totales y cuadre del manifiesto se RECÁLCULAN igual desde
 *     los CSV del paquete (no se confía en las cifras declaradas);
 *  4. que cada discrepancia detectable dentro del paquete (duplicados,
 *     desgloses que no suman, referencias documentales sin binario, …) tiene
 *     su incidencia identificadora en `incidencias.json`.
 *
 * INDEPENDENCIA (garantía de diseño, comprobada por test): este fichero NO
 * importa `motor.ts` — reutiliza solo primitivas puras (`crc32`, `sha256Hex`)
 * y el contrato de tipos. Parsea el ZIP y los CSV con su propio código.
 *
 * Honestidad: el verificador NUNCA muta, repara ni reconstruye el paquete.
 * Devuelve errores (integridad/cuadre/discrepancias no identificadas) y
 * advertencias (limitaciones conocidas del formato) por separado. Un paquete
 * incorrecto se reporta incorrecto: queda en manos humanas qué hacer con él.
 *
 * Límites declarados:
 *  · Solo ZIP método STORE (el del escritor B6). Otro método ⇒ error claro,
 *    no descompresión improvisada.
 *  · `paqueteId` NO es recomputable desde el ZIP (huella del contenido
 *    tipado, no de los CSV): se contrasta formato y coincidencia con el
 *    informe y, si se aporta, con uno esperado. Nunca se da por re-derivado.
 *  · `datos/gastos.csv` usa el contrato CSV v1 (sin alias `fecha`); un gasto
 *    cuya línea del libro solo dependía de ese alias tiene importe e
 *    inmueble contrastables, pero su FECHA no es re-derivable desde el CSV:
 *    advertencia solo para la fecha, nunca para el importe.
 */
import { crc32 } from '../expedienteFiscal/zip';
import { sha256Hex } from '../importacion/hash';
import {
  PAQUETE_ASESOR_SCHEMA,
  type IncidenciaPaqueteAsesor,
  type ManifestPaqueteAsesor,
  type TotalesEjercicioAsesor,
  type TotalesMesAsesor,
  type TotalesPaqueteAsesor,
} from './tipos';

// ---------------------------------------------------------------------------
// Contrato de salida
// ---------------------------------------------------------------------------

export type NivelProblemaPaquete = 'ERROR' | 'ADVERTENCIA';

export interface ProblemaVerificacionPaquete {
  codigo: string;
  nivel: NivelProblemaPaquete;
  descripcion: string;
  entrada?: string;
  id?: string;
}

export interface EntradaZipLeidaPaquete {
  nombre: string;
  metodo: number;
  bytes: Uint8Array;
  crc32Declarado: number;
  tamanioDeclarado: number;
  localHeaderOffset: number;
  /** Inicio de los datos dentro del fichero (post cabecera local + nombre). */
  datosOffset: number;
}

export interface OpcionesVerificacionPaquete {
  /** Si se conoce el paqueteId esperado, se contrasta (no se re-deriva). */
  paqueteIdEsperado?: string;
}

export interface InformeVerificacionPaquete {
  ok: boolean;
  /** null si manifest.json no pudo leerse/parsearse. */
  paqueteId: string | null;
  schema: string | null;
  numEntradasZip: number;
  problemas: ProblemaVerificacionPaquete[];
}

// ---------------------------------------------------------------------------
// Lector ZIP (STORE) propio — parsea, nunca reescribe
// ---------------------------------------------------------------------------

const decodificadorUtf8 = new TextDecoder('utf-8');

function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}

function u32(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

/** Objeto JSON (no array ni null): los JSON manipulados no deben provocar excepciones. */
function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Fecha real `YYYY-MM-DD` (rechaza imposibles como 2025-02-31, sin usar reloj). */
function esFechaReal(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const bisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
  const diasMes = [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
  return dia <= diasMes;
}

/** Primera fecha REAL de entre candidatas (una imposible no bloquea a la siguiente). */
function primeraFechaReal(...candidatas: unknown[]): string {
  for (const c of candidatas) if (esFechaReal(c)) return c;
  return '';
}

/** Ruta ZIP segura: relativa, con '/', sin segmentos '.'/'..' ni unidad. */
function esNombreEntradaInseguro(nombre: string): boolean {
  if (nombre === '' || nombre.includes('\\') || nombre.startsWith('/')) return true;
  if (/^[A-Za-z]:/.test(nombre)) return true;
  return nombre.split('/').some((seg) => seg === '' || seg === '.' || seg === '..');
}

/**
 * Lee las entradas del ZIP vía directorio central y valida la cobertura
 * completa del fichero (sin bytes huérfanos entre estructuras conocidas).
 * Devuelve las entradas leídas y los problemas estructurales encontrados;
 * en caso de estructura ilegible, las entradas parciales se devuelven igual
 * para que el resto de comprobaciones puedan aportar más contexto.
 */
export function leerEntradasZipPaqueteAsesor(
  zip: Uint8Array,
): { entradas: EntradaZipLeidaPaquete[]; problemas: ProblemaVerificacionPaquete[] } {
  const problemas: ProblemaVerificacionPaquete[] = [];
  const entradas: EntradaZipLeidaPaquete[] = [];
  const err = (descripcion: string, entrada?: string) => {
    problemas.push({ codigo: 'ZIP_ESTRUCTURA_INVALIDA', nivel: 'ERROR', descripcion, entrada });
  };

  if (zip.length < 22) {
    err(`ZIP demasiado pequeño (${zip.length} bytes) para contener un EOCD válido`);
    return { entradas, problemas };
  }

  // EOCD: búsqueda desde el final (el escritor B6 no escribe comentario).
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i -= 1) {
    if (u32(zip, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) {
    err('No se encuentra la firma EOCD (0x06054b50): el fichero no es un ZIP completo');
    return { entradas, problemas };
  }
  if (eocd + 22 + u16(zip, eocd + 20) !== zip.length) {
    err('Hay bytes tras el EOCD (o el comentario declarado no cuadra con la longitud)');
  }
  const discoEocd = u16(zip, eocd + 4);
  const discoDirectorio = u16(zip, eocd + 6);
  const entradasEnDisco = u16(zip, eocd + 8);
  const totalDeclarado = u16(zip, eocd + 10);
  const cdSize = u32(zip, eocd + 12);
  const cdOffset = u32(zip, eocd + 16);
  if (discoEocd !== 0 || discoDirectorio !== 0) {
    err(`ZIP multidisco no contractual (disco EOCD ${discoEocd}, disco del directorio ${discoDirectorio})`);
  }
  if (entradasEnDisco !== totalDeclarado) {
    err(`El EOCD declara ${entradasEnDisco} entradas en este disco pero ${totalDeclarado} en total`);
  }
  if (cdOffset > eocd || cdSize > eocd) {
    err(`Directorio central fuera de rango (offset ${cdOffset}, tamaño ${cdSize}, EOCD en ${eocd})`);
  }
  if (cdOffset + cdSize !== eocd) {
    err(`El directorio central no termina donde empieza el EOCD (offset ${cdOffset} + tamaño ${cdSize} ≠ ${eocd})`);
  }

  // Directorio central + cabeceras locales (se contrastan ambas copias).
  let p = cdOffset;
  for (let n = 0; n < totalDeclarado; n += 1) {
    if (p + 46 > eocd || u32(zip, p) !== 0x02014b50) {
      err(`Cabecera central de la entrada nº ${n + 1} ilegible en el offset ${p}`);
      break;
    }
    const banderas = u16(zip, p + 8);
    const metodo = u16(zip, p + 10);
    const crc = u32(zip, p + 16);
    const tamComp = u32(zip, p + 20);
    const tam = u32(zip, p + 24);
    const ln = u16(zip, p + 28);
    const le = u16(zip, p + 30);
    const lc = u16(zip, p + 32);
    const discoInicio = u16(zip, p + 34);
    const lho = u32(zip, p + 42);
    if (p + 46 + ln + le + lc > eocd) {
      err(`Cabecera central de la entrada nº ${n + 1} desborda el directorio central`);
      break;
    }
    const nombre = decodificadorUtf8.decode(zip.subarray(p + 46, p + 46 + ln));
    if (esNombreEntradaInseguro(nombre)) {
      err(`Nombre de entrada inseguro o no relativo: '${nombre}'`, nombre);
    }
    if (banderas !== 0) {
      err(`Entrada '${nombre}' con banderas ZIP ${banderas}: el contrato STORE del escritor no usa banderas (ni cifrado ni data descriptor)`, nombre);
    }
    if (discoInicio !== 0) {
      err(`Entrada '${nombre}' declara empezar en el disco ${discoInicio}: ZIP multidisco no contractual`, nombre);
    }
    if (metodo !== 0) {
      err(`Entrada '${nombre}' con método ${metodo}: el verificador solo acepta STORE (0)`, nombre);
    }
    if (tamComp !== tam) {
      err(`Entrada '${nombre}': tamaño comprimido (${tamComp}) ≠ tamaño (${tam}) en STORE`, nombre);
    }
    if (lho + 30 > zip.length || u32(zip, lho) !== 0x04034b50) {
      err(`Entrada '${nombre}': cabecera local no encontrada en el offset ${lho}`, nombre);
      p += 46 + ln + le + lc;
      continue;
    }
    const lnLocal = u16(zip, lho + 26);
    const leLocal = u16(zip, lho + 28);
    if (lho + 30 + lnLocal + leLocal > zip.length) {
      err(`Entrada '${nombre}': la cabecera local desborda el fichero`, nombre);
      p += 46 + ln + le + lc;
      continue;
    }
    const nombreLocal = decodificadorUtf8.decode(zip.subarray(lho + 30, lho + 30 + lnLocal));
    if (nombreLocal !== nombre) {
      err(`Entrada '${nombre}': el nombre de la cabecera local es '${nombreLocal}'`, nombre);
    }
    if (u16(zip, lho + 6) !== banderas) {
      err(`Entrada '${nombre}': las banderas de la cabecera local (${u16(zip, lho + 6)}) no coinciden con la central (${banderas})`, nombre);
    }
    if (u16(zip, lho + 8) !== metodo || u32(zip, lho + 14) !== crc
      || u32(zip, lho + 18) !== tamComp || u32(zip, lho + 22) !== tam) {
      err(`Entrada '${nombre}': método/CRC/tamaños de la cabecera local no coinciden con la central`, nombre);
    }
    const datosOffset = lho + 30 + lnLocal + leLocal;
    if (datosOffset + tam > zip.length) {
      err(`Entrada '${nombre}': los datos (${tam} bytes desde ${datosOffset}) desbordan el fichero (${zip.length})`, nombre);
      p += 46 + ln + le + lc;
      continue;
    }
    entradas.push({
      nombre, metodo,
      bytes: zip.subarray(datosOffset, datosOffset + tam),
      crc32Declarado: crc, tamanioDeclarado: tam,
      localHeaderOffset: lho, datosOffset,
    });
    p += 46 + ln + le + lc;
  }
  if (p !== eocd) {
    err(`El directorio central no termina exactamente donde empieza el EOCD (recorrido hasta ${p})`);
  }
  if (entradas.length !== totalDeclarado) {
    err(`El EOCD declara ${totalDeclarado} entradas pero se han podido leer ${entradas.length}`);
  }

  // Cobertura sin huecos: locales+datos contiguos desde 0 hasta cdOffset.
  const ordenadas = [...entradas].sort((a, b) => a.localHeaderOffset - b.localHeaderOffset);
  if (ordenadas.length > 0 && ordenadas[0].localHeaderOffset !== 0) {
    err(`La primera entrada no empieza en el offset 0 (empieza en ${ordenadas[0].localHeaderOffset})`);
  }
  for (let i = 1; i < ordenadas.length; i += 1) {
    const prev = ordenadas[i - 1];
    const finPrev = prev.datosOffset + prev.tamanioDeclarado;
    if (finPrev !== ordenadas[i].localHeaderOffset) {
      err(`Hueco o solape entre '${prev.nombre}' (termina en ${finPrev}) y '${ordenadas[i].nombre}' (empieza en ${ordenadas[i].localHeaderOffset})`);
    }
  }
  if (ordenadas.length > 0) {
    const ultima = ordenadas[ordenadas.length - 1];
    if (ultima.datosOffset + ultima.tamanioDeclarado !== cdOffset) {
      err(`La última entrada ('${ultima.nombre}') no termina donde empieza el directorio central (${cdOffset})`);
    }
  }

  // Nombres duplicados dentro del ZIP.
  const vistos = new Set<string>();
  for (const e of entradas) {
    if (vistos.has(e.nombre)) {
      err(`Nombre de entrada duplicado en el ZIP: '${e.nombre}'`, e.nombre);
    }
    vistos.add(e.nombre);
  }

  return { entradas, problemas };
}

// ---------------------------------------------------------------------------
// Parser CSV propio (dialecto del motor: "," con entrecomillado RFC básico)
// ---------------------------------------------------------------------------

type FilaCsv = Record<string, string>;

function parsearRegistrosCsv(textoCsv: string): string[][] {
  const registros: string[][] = [];
  let registro: string[] = [];
  let campo = '';
  let entreComillas = false;
  for (let i = 0; i < textoCsv.length; i += 1) {
    const ch = textoCsv[i];
    if (entreComillas) {
      if (ch === '"' && textoCsv[i + 1] === '"') { campo += '"'; i += 1; }
      else if (ch === '"') entreComillas = false;
      else campo += ch;
    } else if (ch === '"') {
      entreComillas = true;
    } else if (ch === ',') {
      registro.push(campo); campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && textoCsv[i + 1] === '\n') i += 1;
      registro.push(campo); campo = '';
      registros.push(registro); registro = [];
    } else {
      campo += ch;
    }
  }
  if (campo !== '' || registro.length > 0) {
    registro.push(campo);
    registros.push(registro);
  }
  return registros;
}

function parsearCsv(
  textoCsv: string,
): { cabecera: string[]; filas: FilaCsv[]; filasMalformadas: number[] } | null {
  const registros = parsearRegistrosCsv(textoCsv);
  if (registros.length === 0) return null;
  const cabecera = registros[0];
  const filas: FilaCsv[] = [];
  const filasMalformadas: number[] = [];
  for (let i = 1; i < registros.length; i += 1) {
    if (registros[i].length !== cabecera.length) filasMalformadas.push(i + 1);
    const fila: FilaCsv = {};
    cabecera.forEach((col, idx) => { fila[col] = registros[i][idx] ?? ''; });
    filas.push(fila);
  }
  return { cabecera, filas, filasMalformadas };
}

// ---------------------------------------------------------------------------
// Dinero en céntimos desde CADENAS (sin coma flotante ambigua)
// ---------------------------------------------------------------------------

/** Céntimos enteros de un literal decimal del CSV/manifiesto; null si ilegible. */
function centimosDeTexto(s: string): number | null {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) return null;
  const cent = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cent)) return null;
  return m[1] === '-' ? -cent : cent;
}

/** Céntimos de un número del manifiesto (ya redondeado a 2 por el contrato). */
function centimosDeNumero(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const cent = Math.round(n * 100);
  if (!Number.isSafeInteger(cent)) return null;
  // Un importe con subcéntimo no es representable en este contrato: no se
  // redondea en silencio para fingir un cuadre en céntimos. La tolerancia
  // solo absorbe el error binario de los euros con dos decimales.
  const tolerancia = Math.min(0.001, Math.max(1e-9, Math.abs(cent) * Number.EPSILON * 8));
  if (Math.abs(n * 100 - cent) > tolerancia) return null;
  return cent;
}

const eurosDeCentimos = (c: number): number => c / 100;

// ---------------------------------------------------------------------------
// Verificación completa
// ---------------------------------------------------------------------------

/** Orden físico contractual: el escritor ZIP B6 ordena las rutas con localeCompare. */
const ENTRADAS_ESPERADAS = [
  'datos/cobros.csv',
  'datos/contratos.csv',
  'datos/facturas.csv',
  'datos/gastos.csv',
  'datos/inmuebles.csv',
  'datos/liquidaciones.csv',
  'datos/polizas.csv',
  'incidencias.json',
  'informe.txt',
  'libro-ingresos-gastos.csv',
  'manifest.json',
  'totales.json',
] as const;

/**
 * Cabeceras CSV contractuales, redeclaradas aquí (copia del verificador: si
 * el motor cambiara una columna sin versionar el esquema, este contraste
 * debe fallar, no aprender la nueva cabecera en silencio).
 */
const CABECERAS_CSV_ESPERADAS: Readonly<Record<string, readonly string[]>> = {
  'datos/inmuebles.csv': [
    'id', 'direccion', 'ciudad', 'referenciaCatastral',
    'propietarioId', 'propietarioPrincipalId', 'estado', 'tipoInmueble',
  ],
  'datos/contratos.csv': [
    'id', 'inmuebleId', 'propietarioId', 'candidatoId', 'candidatoNombre',
    'fechaInicioContrato', 'fechaFinContrato', 'rentaMensual', 'estado',
    'inmuebleDireccion',
  ],
  'datos/cobros.csv': [
    'id', 'inmuebleId', 'contratoId', 'inquilinoId', 'propietarioId', 'mes', 'anio',
    'periodoMesAnio', 'nombreMes', 'importePrevisto', 'importeRecibido',
    'fechaVencimiento', 'fechaPago', 'estado', 'metodoPago', 'observaciones',
  ],
  'datos/gastos.csv': [
    'id', 'inmuebleId', 'propietarioId', 'contratoId', 'tipo', 'categoria', 'concepto',
    'proveedor', 'importe', 'estado', 'fechaDevengo', 'fechaPago', 'periodoMesAnio',
    'aCargoDe', 'deducible', 'ejercicioFiscal', 'metodoPago', 'origen', 'origenId',
    'createdAt', 'updatedAt',
  ],
  'datos/facturas.csv': [
    'id', 'propietarioId', 'inmuebleId', 'contratoId', 'gastoId', 'clase',
    'tipo', 'serie', 'numero', 'ejercicio', 'fechaExpedicion', 'fechaOperacion',
    'emisorNombre', 'emisorNif', 'receptorNombre', 'receptorNif',
    'baseImponible', 'cuotaIva', 'cuotaRetencion', 'importeTotal', 'estado',
  ],
  'datos/liquidaciones.csv': [
    'id', 'propietarioId', 'propietarioNombre', 'periodo', 'anio', 'mes',
    'totalBrutoCobrado', 'totalHonorarios', 'totalIvaHonorarios', 'totalGastos',
    'totalRetenciones', 'totalAjustes', 'totalDeducciones', 'netoPropietario',
    'estado', 'fechaGeneracion', 'fechaPago',
  ],
  'datos/polizas.csv': [
    'id', 'propietarioId', 'inmuebleId', 'aseguradora', 'numeroPoliza', 'tipo',
    'fechaInicio', 'fechaVencimiento', 'estado', 'primaAnual',
  ],
  'libro-ingresos-gastos.csv': [
    'fecha', 'ejercicio', 'tipo', 'concepto', 'inmuebleId', 'inmuebleDireccion',
    'contraparte', 'base', 'iva', 'retencion', 'total', 'categoria', 'deducible',
    'origenDeducibilidad', 'fuenteTipo', 'fuenteId', 'documentoNombre', 'desgloseFiscal',
  ],
};

interface TotalesRecalculados {
  totalIngresosCent: number;
  totalGastosCent: number;
  deduciblesCent: number;
  noDeduciblesCent: number;
  porEjercicio: Map<number, {
    numIngresos: number; numGastos: number;
    ingCent: number; gasCent: number; dedCent: number; noDedCent: number;
  }>;
  porMes: Map<string, {
    numIngresos: number; numGastos: number;
    ingCent: number; gasCent: number; dedCent: number; noDedCent: number;
  }>;
}

function totalesVacios(): TotalesRecalculados {
  return {
    totalIngresosCent: 0, totalGastosCent: 0, deduciblesCent: 0, noDeduciblesCent: 0,
    porEjercicio: new Map(), porMes: new Map(),
  };
}

function acumular(
  t: TotalesRecalculados, fechaIso: string, ejercicio: number,
  esIngreso: boolean, cent: number, deducible: boolean,
): void {
  const porE = t.porEjercicio.get(ejercicio) ?? {
    numIngresos: 0, numGastos: 0, ingCent: 0, gasCent: 0, dedCent: 0, noDedCent: 0,
  };
  const mes = fechaIso.slice(0, 7);
  const porM = t.porMes.get(mes) ?? {
    numIngresos: 0, numGastos: 0, ingCent: 0, gasCent: 0, dedCent: 0, noDedCent: 0,
  };
  if (esIngreso) {
    t.totalIngresosCent += cent;
    porE.numIngresos += 1; porE.ingCent += cent;
    porM.numIngresos += 1; porM.ingCent += cent;
  } else {
    t.totalGastosCent += cent;
    porE.numGastos += 1; porE.gasCent += cent;
    porM.numGastos += 1; porM.gasCent += cent;
    if (deducible) { t.deduciblesCent += cent; porE.dedCent += cent; porM.dedCent += cent; }
    else { t.noDeduciblesCent += cent; porE.noDedCent += cent; porM.noDedCent += cent; }
  }
  t.porEjercicio.set(ejercicio, porE);
  t.porMes.set(mes, porM);
}

const RE_FECHA_ISO_V = /^\d{4}-\d{2}-\d{2}$/;
const RE_PAQUETE_ID = /^[0-9a-f]{64}$/;

/** Serialización canónica local (claves ordenadas) para comparar JSON. */
function canonicoVerificador(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicoVerificador).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    return `{${Object.keys(obj).sort()
      .map((k) => `${JSON.stringify(k)}:${canonicoVerificador(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/**
 * Verifica un paquete del asesor desde sus bytes. Pura y síncrona; no muta
 * la entrada ni reconstruye nada. `ok` es false en cuanto existe UN error
 * (las advertencias describen límites del formato, no falsifican el cuadre).
 */
export function verificarPaqueteAsesorZip(
  zip: Uint8Array,
  opciones: OpcionesVerificacionPaquete = {},
): InformeVerificacionPaquete {
  const problemas: ProblemaVerificacionPaquete[] = [];
  const error = (codigo: string, descripcion: string, extra: Partial<ProblemaVerificacionPaquete> = {}) => {
    problemas.push({ codigo, nivel: 'ERROR', descripcion, ...extra });
  };
  const advertencia = (codigo: string, descripcion: string, extra: Partial<ProblemaVerificacionPaquete> = {}) => {
    problemas.push({ codigo, nivel: 'ADVERTENCIA', descripcion, ...extra });
  };

  // 1) Estructura ZIP + CRC-32 de cada entrada.
  const { entradas, problemas: problemasZip } = leerEntradasZipPaqueteAsesor(zip);
  problemas.push(...problemasZip);
  const porNombre = new Map<string, EntradaZipLeidaPaquete>();
  for (const e of entradas) {
    if (!porNombre.has(e.nombre)) porNombre.set(e.nombre, e);
    const crcReal = crc32(e.bytes);
    if (crcReal !== e.crc32Declarado) {
      error(
        'CRC32_NO_COINCIDE',
        `Entrada '${e.nombre}': CRC-32 real ${crcReal.toString(16)} ≠ declarado ${e.crc32Declarado.toString(16)}`,
        { entrada: e.nombre },
      );
    }
  }
  const textoDe = (nombre: string): string | null => {
    const e = porNombre.get(nombre);
    return e ? decodificadorUtf8.decode(e.bytes) : null;
  };

  // 2) Manifiesto: esquema, banderas de honestidad, orden y hashes SHA-256.
  let manifest: ManifestPaqueteAsesor | null = null;
  let manifestTotalesValidos = false;
  let manifestHeredadoSinMeses = false;
  let ambitoManifest: {
    propietarios: Set<string>;
    inmuebles: Set<string> | null;
    ejercicios: Set<number> | null;
    meses: Set<string> | null;
    rango: { desde: string; hasta: string } | null;
  } | null = null;
  const textoManifest = textoDe('manifest.json');
  if (textoManifest === null) {
    error('MANIFEST_AUSENTE', "Falta 'manifest.json': sin manifiesto no hay qué verificar");
  } else {
    try {
      const parsed: unknown = JSON.parse(textoManifest);
      if (!esObjetoPlano(parsed)) {
        error('MANIFEST_ILEGIBLE', 'manifest.json no contiene un objeto JSON');
      } else {
        manifest = parsed as unknown as ManifestPaqueteAsesor;
      }
    } catch (e) {
      error('MANIFEST_ILEGIBLE', `manifest.json no es JSON válido (${e instanceof Error ? e.message : 'error'})`);
    }
  }
  if (manifest !== null) {
    // Forma estructural mínima: un manifiesto manipulado debe producir un
    // error nombrado, nunca una excepción al recorrer sus campos.
    const mRec = manifest as unknown as Record<string, unknown>;
    const esArrayDeObjetos = (v: unknown): boolean =>
      Array.isArray(v) && v.every(esObjetoPlano);
    const totalesRec = mRec.totales;
    manifestTotalesValidos = esObjetoPlano(totalesRec)
      && esArrayDeObjetos(totalesRec.porEjercicio)
      && (totalesRec.porMes === undefined || esArrayDeObjetos(totalesRec.porMes));
    if (!manifestTotalesValidos) {
      error('TOTALES_ILEGIBLES', 'manifest.totales no contiene un objeto de totales con series por ejercicio/mes legibles');
    }
    if (!esObjetoPlano(mRec.hashes)) {
      error('MANIFEST_ILEGIBLE', 'manifest.hashes no es un objeto ruta → SHA-256');
    }
    if (!esObjetoPlano(mRec.conteos)) {
      error('MANIFEST_ILEGIBLE', 'manifest.conteos no es un objeto de conteos');
    }
    if (!esArrayDeObjetos(mRec.verificaciones)) {
      error('MANIFEST_ILEGIBLE', 'manifest.verificaciones no es un array de objetos');
    }
    const idsTexto = (v: unknown): string[] | null =>
      Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim() !== '')
        ? [...new Set(v as string[])] : null;
    const propietariosAmbito = idsTexto(mRec.propietariosEfectivos);
    const inmueblesAmbito = mRec.inmueblesEfectivos === null ? null : idsTexto(mRec.inmueblesEfectivos);
    const ejerciciosAmbito = mRec.ejerciciosEfectivos === null
      ? null
      : Array.isArray(mRec.ejerciciosEfectivos)
        && mRec.ejerciciosEfectivos.every((x) => Number.isInteger(x))
        ? [...new Set(mRec.ejerciciosEfectivos as number[])] : null;
    const mesesAmbito = mRec.mesesEfectivos === null || mRec.mesesEfectivos === undefined
      ? null : idsTexto(mRec.mesesEfectivos);
    // P6 — intervalo de fechas (aditivo; ausente en paquetes anteriores).
    const rangoRec = mRec.rangoFechasEfectivo;
    const rangoAmbito = rangoRec === null || rangoRec === undefined
      ? null
      : esObjetoPlano(rangoRec) && esFechaReal(rangoRec.desde) && esFechaReal(rangoRec.hasta)
        && (rangoRec.desde as string) <= (rangoRec.hasta as string)
        ? { desde: rangoRec.desde as string, hasta: rangoRec.hasta as string }
        : undefined;
    if (propietariosAmbito === null || propietariosAmbito.length === 0
      || (mRec.inmueblesEfectivos !== null && inmueblesAmbito === null)
      || (mRec.ejerciciosEfectivos !== null && ejerciciosAmbito === null)
      || (mRec.mesesEfectivos !== null && mRec.mesesEfectivos !== undefined && mesesAmbito === null)
      || rangoAmbito === undefined) {
      error('AMBITO_MANIFEST_INVALIDO', 'El ámbito declarado en el manifiesto (propietarios/inmuebles/ejercicios/meses/rango de fechas efectivos) no es legible');
    } else {
      ambitoManifest = {
        propietarios: new Set(propietariosAmbito),
        inmuebles: inmueblesAmbito === null ? null : new Set(inmueblesAmbito),
        ejercicios: ejerciciosAmbito === null ? null : new Set(ejerciciosAmbito),
        meses: mesesAmbito === null ? null : new Set(mesesAmbito),
        rango: rangoAmbito,
      };
    }
    if (manifest.schemaVersion !== PAQUETE_ASESOR_SCHEMA) {
      error('SCHEMA_NO_SOPORTADO', `Esquema '${manifest.schemaVersion}' ≠ '${PAQUETE_ASESOR_SCHEMA}'`);
    }
    if (manifest.formatoOficialAEAT !== false) {
      error('BANDERAS_MANIFEST_INVALIDAS', 'El manifiesto no declara formatoOficialAEAT=false (declaración de honestidad obligatoria)');
    }
    if (typeof manifest.incluyeBinariosDocumentales !== 'boolean') {
      error('BANDERAS_MANIFEST_INVALIDAS', 'El manifiesto no declara incluyeBinariosDocumentales como booleano');
    }
    if (manifest.escrituras !== 0) {
      error('BANDERAS_MANIFEST_INVALIDAS', 'El manifiesto no declara escrituras=0');
    }
    if (!RE_PAQUETE_ID.test(manifest.paqueteId ?? '')) {
      error('PAQUETE_ID_INVALIDO', 'paqueteId no es un SHA-256 hex de 64 caracteres');
    }
    advertencia(
      'PAQUETE_ID_NO_RECOMPUTABLE_DESDE_ZIP',
      'paqueteId es la huella del contenido TIPADO (no de estos CSV): no puede re-derivarse desde el ZIP; se contrasta formato/informe y, si se aporta, el esperado',
    );
    if (opciones.paqueteIdEsperado !== undefined && opciones.paqueteIdEsperado !== manifest.paqueteId) {
      error('PAQUETE_ID_DISTINTO_ESPERADO', `paqueteId ${manifest.paqueteId ?? '?'} ≠ esperado ${opciones.paqueteIdEsperado}`);
    }
    if (manifest.mesesEfectivos === undefined) {
      manifestHeredadoSinMeses = true;
      advertencia(
        'MESES_EFECTIVOS_AUSENTE_HEREDADO',
        'Manifiesto heredado sin mesesEfectivos: se interpreta como sin filtro mensual (null)',
      );
      manifest = { ...manifest, mesesEfectivos: null };
    }
    const nombresZip = entradas.map((e) => e.nombre);
    const baseEsperada = [...ENTRADAS_ESPERADAS];
    const hashes: Record<string, string> = esObjetoPlano(manifest.hashes)
      ? manifest.hashes : {};

    // ---------------------------------------------------------------------
    // P6 — DOCUMENTOS ORIGINALES: índice, hashes, tamaños y correspondencia
    // con las entradas `documentos/...` del ZIP. Un índice inflado, un
    // binario huérfano o una huella distinta producen error nombrado.
    // ---------------------------------------------------------------------
    const mRecDocs = mRec.documentos;
    if (mRecDocs !== undefined && !Array.isArray(mRecDocs)) {
      error('DOCUMENTOS_MANIFEST_INVALIDO', 'manifest.documentos no es un array');
    }
    const listaDocumentos: Record<string, unknown>[] = Array.isArray(mRecDocs)
      ? mRecDocs.filter((d): d is Record<string, unknown> => esObjetoPlano(d))
      : [];
    if (Array.isArray(mRecDocs) && listaDocumentos.length !== mRecDocs.length) {
      error('DOCUMENTOS_MANIFEST_INVALIDO', 'manifest.documentos contiene elementos que no son objetos');
    }
    const estadosDocumento = new Set([
      'PENDIENTE_BINARIO', 'INCLUIDO', 'NO_DISPONIBLE', 'SIN_HASH', 'NO_ACCESIBLE', 'INTEGRIDAD_DUDOSA',
    ]);
    const idsDocumento = new Set<string>();
    const rutasDeclaradas = new Set<string>();
    let documentosIncluidos = 0;
    const dentroDeRangoVerificador = (fecha: string): boolean =>
      ambitoManifest === null || ambitoManifest.rango === null
      || (fecha >= ambitoManifest.rango.desde && fecha <= ambitoManifest.rango.hasta);
    for (const [indice, documento] of listaDocumentos.entries()) {
      const id = documento.documentoId;
      if (typeof id !== 'string' || id.trim() === '') {
        error('DOCUMENTOS_MANIFEST_INVALIDO', `manifest.documentos[${indice}] sin documentoId textual`);
        continue;
      }
      if (idsDocumento.has(id)) {
        error('DOCUMENTO_DUPLICADO_EN_INDICE', `El documento ${id} aparece más de una vez en el índice`);
      }
      idsDocumento.add(id);
      if (typeof documento.estado !== 'string' || !estadosDocumento.has(documento.estado)) {
        error('DOCUMENTOS_MANIFEST_INVALIDO', `Documento ${id}: estado '${String(documento.estado)}' fuera del contrato`);
      }
      if (ambitoManifest !== null) {
        if (typeof documento.inmuebleId !== 'string' || documento.inmuebleId === ''
          || (ambitoManifest.inmuebles !== null && !ambitoManifest.inmuebles.has(documento.inmuebleId))) {
          error('AMBITO_INMUEBLE_FUERA_DE_MANIFEST', `Documento ${id}: inmueble '${String(documento.inmuebleId)}' fuera de inmueblesEfectivos`, { id });
        }
        if (typeof documento.propietarioId === 'string' && documento.propietarioId !== ''
          && !ambitoManifest.propietarios.has(documento.propietarioId)) {
          error('AMBITO_PROPIETARIO_FUERA_DE_MANIFEST', `Documento ${id}: propietario '${documento.propietarioId}' fuera de propietariosEfectivos`, { id });
        }
      }
      const sha = documento.sha256;
      const shaIncluido = documento.sha256Incluido;
      if (sha !== null && sha !== undefined && (typeof sha !== 'string' || !/^[0-9a-f]{64}$/.test(sha))) {
        error('DOCUMENTO_HASH_INVALIDO', `Documento ${id}: sha256 registrado no es un SHA-256 hex`, { id });
      }
      if (shaIncluido !== null && shaIncluido !== undefined
        && (typeof shaIncluido !== 'string' || !/^[0-9a-f]{64}$/.test(shaIncluido))) {
        error('DOCUMENTO_HASH_INVALIDO', `Documento ${id}: sha256Incluido no es un SHA-256 hex`, { id });
      }
      if (documento.fechaDocumental !== null && documento.fechaDocumental !== undefined) {
        if (!esFechaReal(documento.fechaDocumental)) {
          error('DOCUMENTO_FECHA_INVALIDA', `Documento ${id}: fechaDocumental '${String(documento.fechaDocumental)}' no es una fecha real`, { id });
        } else if (!dentroDeRangoVerificador(documento.fechaDocumental)) {
          error('AMBITO_TEMPORAL_FUERA_DE_MANIFEST', `Documento ${id}: fecha documental ${documento.fechaDocumental} fuera del rango declarado`, { id });
        }
      }
      if (documento.estado === 'INCLUIDO') {
        documentosIncluidos += 1;
        const ruta = documento.rutaZip;
        if (typeof ruta !== 'string' || esNombreEntradaInseguro(ruta) || !ruta.startsWith('documentos/')) {
          error('DOCUMENTO_RUTA_INVALIDA', `Documento ${id}: rutaZip '${String(ruta)}' no es una ruta relativa segura bajo documentos/`, { id });
        } else {
          rutasDeclaradas.add(ruta);
          const entradaDoc = porNombre.get(ruta);
          if (!entradaDoc) {
            error('DOCUMENTO_DECLARADO_AUSENTE', `Documento ${id}: declara INCLUIDO en '${ruta}' pero la entrada no está en el ZIP`, { entrada: ruta, id });
          } else {
            const real = sha256Hex(entradaDoc.bytes);
            if (sha === null || shaIncluido !== sha) {
              error('DOCUMENTO_INTEGRIDAD_NO_DECLARADA', `Documento ${id}: INCLUIDO sin sha256 = sha256Incluido (la huella del original debe quedar acreditada)`, { id });
            }
            if (real !== shaIncluido) {
              error('DOCUMENTO_HASH_NO_COINCIDE', `Documento ${id}: SHA-256 del binario ${real.slice(0, 16)}… ≠ declarado ${String(shaIncluido).slice(0, 16)}…`, { entrada: ruta, id });
            }
            if (hashes[ruta] !== undefined && hashes[ruta] !== real) {
              error('DOCUMENTO_HASH_NO_COINCIDE', `Documento ${id}: manifest.hashes de '${ruta}' no coincide con los bytes`, { entrada: ruta, id });
            }
            if (typeof documento.tamanoBytes === 'number' && documento.tamanoBytes !== entradaDoc.bytes.length) {
              error('DOCUMENTO_TAMANO_NO_COINCIDE', `Documento ${id}: tamaño declarado ${documento.tamanoBytes} ≠ ${entradaDoc.bytes.length} bytes del ZIP`, { id });
            }
          }
        }
      } else {
        // PENDIENTE_BINARIO puede declarar la ruta PLANIFICADA (segura y bajo
        // documentos/); los demás estados no pueden tener ni ruta ni huella.
        if (documento.estado === 'PENDIENTE_BINARIO') {
          if (documento.rutaZip !== null && documento.rutaZip !== undefined
            && (typeof documento.rutaZip !== 'string' || esNombreEntradaInseguro(documento.rutaZip)
              || !documento.rutaZip.startsWith('documentos/'))) {
            error('DOCUMENTO_RUTA_INVALIDA', `Documento ${id}: rutaZip planificada '${String(documento.rutaZip)}' no segura`, { id });
          }
        } else if (documento.rutaZip !== null && documento.rutaZip !== undefined) {
          error('DOCUMENTO_NO_INCLUIDO_CON_RUTA', `Documento ${id}: estado ${String(documento.estado)} no puede declarar rutaZip`, { id });
        }
        if (shaIncluido !== null && shaIncluido !== undefined) {
          error('DOCUMENTO_NO_INCLUIDO_CON_HUELLA', `Documento ${id}: estado ${String(documento.estado)} no puede declarar sha256Incluido`, { id });
        }
      }
    }
    const rutasEnZip = nombresZip.filter((n) => n.startsWith('documentos/'));
    for (const ruta of rutasEnZip) {
      if (!rutasDeclaradas.has(ruta)) {
        error('DOCUMENTO_ZIP_NO_DECLARADO', `La entrada '${ruta}' está en el ZIP pero ningún documento del índice la declara INCLUIDO`, { entrada: ruta });
      }
    }
    const documentosJson = textoDe('documentos.json');
    if (listaDocumentos.length > 0 || documentosJson !== null) {
      if (documentosJson === null) {
        error('DOCUMENTOS_INDICE_AUSENTE', 'El manifiesto declara documentos pero falta documentos.json');
      } else {
        try {
          const parsed = JSON.parse(documentosJson) as unknown;
          if (canonicoVerificador(parsed) !== canonicoVerificador(listaDocumentos)) {
            error('DOCUMENTOS_INDICE_DISTINTO', 'documentos.json no coincide con manifest.documentos');
          }
        } catch {
          error('DOCUMENTOS_INDICE_ILEGIBLE', 'documentos.json no es JSON válido');
        }
      }
    }
    if (typeof manifest.incluyeBinariosDocumentales === 'boolean'
      && manifest.incluyeBinariosDocumentales !== (documentosIncluidos > 0)) {
      error('BANDERAS_MANIFEST_INVALIDAS', `incluyeBinariosDocumentales=${manifest.incluyeBinariosDocumentales} pero hay ${documentosIncluidos} documento(s) INCLUIDO en el índice`);
    }
    if (esObjetoPlano(mRec.conteos) && typeof mRec.conteos.documentos === 'number'
      && mRec.conteos.documentos !== listaDocumentos.length) {
      error('DOCUMENTOS_CONTEO_NO_COINCIDE', `manifest.conteos.documentos ${mRec.conteos.documentos} ≠ ${listaDocumentos.length} entradas en el índice`);
    }
    const numDocumentosIncluidos = mRec.numDocumentosIncluidos;
    const numDocumentosNoIncluidos = mRec.numDocumentosNoIncluidos;
    if (numDocumentosIncluidos !== undefined && numDocumentosIncluidos !== documentosIncluidos) {
      error('DOCUMENTOS_CONTEO_NO_COINCIDE', `numDocumentosIncluidos ${String(numDocumentosIncluidos)} ≠ ${documentosIncluidos} incluidos en el índice`);
    }
    if (numDocumentosNoIncluidos !== undefined
      && numDocumentosNoIncluidos !== listaDocumentos.length - documentosIncluidos) {
      error('DOCUMENTOS_CONTEO_NO_COINCIDE', `numDocumentosNoIncluidos ${String(numDocumentosNoIncluidos)} ≠ ${listaDocumentos.length - documentosIncluidos} no incluidos`);
    }

    // P6 — resumen estructurado (si está declarado).
    const resumenTxt = textoDe('resumen.json');
    if (resumenTxt !== null) {
      if (manifest.incluyeResumenEstructurado !== true) {
        error('RESUMEN_NO_DECLARADO', 'resumen.json está en el ZIP pero el manifiesto no lo declara');
      }
      try {
        const resumen = JSON.parse(resumenTxt) as unknown;
        if (!esObjetoPlano(resumen)) {
          error('RESUMEN_ILEGIBLE', 'resumen.json no contiene un objeto');
        } else {
          const ambitoResumen = resumen.ambito;
          if (!esObjetoPlano(ambitoResumen) || ambitoManifest === null) {
            error('RESUMEN_ILEGIBLE', 'resumen.json sin ámbito legible');
          } else {
            const propietariosResumen = idsTexto(ambitoResumen.propietarios);
            const inmueblesResumen = ambitoResumen.inmuebles === null ? null : idsTexto(ambitoResumen.inmuebles);
            const rangoResumen = ambitoResumen.rangoFechas;
            const rangoIgual = rangoResumen === null
              ? ambitoManifest.rango === null
              : esObjetoPlano(rangoResumen) && ambitoManifest.rango !== null
                && rangoResumen.desde === ambitoManifest.rango.desde
                && rangoResumen.hasta === ambitoManifest.rango.hasta;
            if (propietariosResumen === null
              || canonicoVerificador([...propietariosResumen].sort()) !== canonicoVerificador([...ambitoManifest.propietarios].sort())
              || (inmueblesResumen === null) !== (ambitoManifest.inmuebles === null)
              || (inmueblesResumen !== null && ambitoManifest.inmuebles !== null
                && canonicoVerificador([...inmueblesResumen].sort()) !== canonicoVerificador([...ambitoManifest.inmuebles].sort()))
              || !rangoIgual) {
              error('RESUMEN_AMBITO_DISTINTO', 'resumen.json declara un ámbito distinto del manifiesto');
            }
          }
          const inmueblesResumen = Array.isArray(resumen.inmuebles)
            ? resumen.inmuebles.filter((i): i is Record<string, unknown> => esObjetoPlano(i)) : null;
          if (inmueblesResumen === null) {
            error('RESUMEN_ILEGIBLE', 'resumen.json sin lista de inmuebles');
          } else if (ambitoManifest !== null && ambitoManifest.inmuebles !== null) {
            const idsFichas = inmueblesResumen.map((i) => String(i.id ?? '')).sort();
            if (canonicoVerificador(idsFichas) !== canonicoVerificador([...ambitoManifest.inmuebles].sort())) {
              error('RESUMEN_INMUEBLES_DISTINTOS', 'resumen.json no describe exactamente los inmuebles del ámbito');
            }
          }
          if (esObjetoPlano(resumen.conteos)
            && canonicoVerificador(resumen.conteos) !== canonicoVerificador(mRec.conteos)) {
            error('RESUMEN_CONTEO_NO_COINCIDE', 'resumen.json: conteos distintos de manifest.conteos');
          }
          if (esObjetoPlano(resumen.totales)
            && canonicoVerificador(resumen.totales) !== canonicoVerificador(mRec.totales)) {
            error('RESUMEN_TOTALES_DISTINTOS', 'resumen.json: totales distintos de manifest.totales');
          }
          const idsTitularidadesResumen = new Set<string>();
          if (Array.isArray(resumen.titularidades)) {
            for (const t of resumen.titularidades) {
              if (!esObjetoPlano(t)) { error('RESUMEN_ILEGIBLE', 'titularidad no es un objeto'); continue; }
              if (typeof t.id !== 'string' || t.id.trim() === '') {
                error('RESUMEN_ILEGIBLE', 'titularidad sin id en resumen.json');
              } else if (idsTitularidadesResumen.has(t.id)) {
                error('TITULARIDAD_DUPLICADA', `La titularidad ${t.id} aparece más de una vez en resumen.json`);
              } else {
                idsTitularidadesResumen.add(t.id);
              }
              if (t.origen !== 'TITULARIDAD_REGISTRADA') {
                error('TITULARIDAD_ORIGEN_INVALIDO', `Titularidad ${String(t.id)}: origen '${String(t.origen)}' ≠ TITULARIDAD_REGISTRADA`);
              }
              if (ambitoManifest !== null && typeof t.inmuebleId === 'string'
                && ambitoManifest.inmuebles !== null && !ambitoManifest.inmuebles.has(t.inmuebleId)) {
                error('AMBITO_INMUEBLE_FUERA_DE_MANIFEST', `Titularidad ${String(t.id)}: inmueble fuera del ámbito`);
              }
              if (ambitoManifest !== null && typeof t.propietarioId === 'string'
                && !ambitoManifest.propietarios.has(t.propietarioId)) {
                error('AMBITO_PROPIETARIO_FUERA_DE_MANIFEST', `Titularidad ${String(t.id)}: propietario fuera del ámbito`);
              }
              const porcentaje = t.porcentajeTitularidad;
              if (porcentaje !== null && (typeof porcentaje !== 'number' || !(porcentaje >= 0) || !(porcentaje <= 100))) {
                error('TITULARIDAD_PORCENTAJE_INVALIDO', `Titularidad ${String(t.id)}: porcentaje '${String(porcentaje)}' fuera de 0..100`);
              }
            }
          }
          if (esObjetoPlano(resumen.conteos)
            && typeof resumen.conteos.titularidades === 'number'
            && Array.isArray(resumen.titularidades)
            && resumen.conteos.titularidades !== resumen.titularidades.length) {
            error('RESUMEN_CONTEO_NO_COINCIDE', 'resumen.json: conteo de titularidades distinto de la lista');
          }
          const docsResumen = esObjetoPlano(resumen.documentos) ? resumen.documentos.indice : undefined;
          if (canonicoVerificador(docsResumen ?? []) !== canonicoVerificador(listaDocumentos)) {
            error('RESUMEN_DOCUMENTOS_DISTINTOS', 'resumen.json no describe el mismo índice documental del manifiesto');
          }
          if (!Array.isArray(resumen.limitaciones) || resumen.limitaciones.length === 0) {
            error('RESUMEN_SIN_LIMITACIONES', 'resumen.json debe declarar sus limitaciones');
          }
        }
      } catch {
        error('RESUMEN_ILEGIBLE', 'resumen.json no es JSON válido');
      }
    } else if (manifest.incluyeResumenEstructurado === true) {
      error('RESUMEN_AUSENTE', 'El manifiesto declara incluyeResumenEstructurado pero falta resumen.json');
    }

    // Entradas contractuales = 12 base + opcionales P6 declaradas.
    const opcionales: string[] = [];
    if (manifest.incluyeResumenEstructurado === true) opcionales.push('resumen.json');
    if (listaDocumentos.length > 0 || documentosJson !== null) opcionales.push('documentos.json');
    opcionales.push(...rutasDeclaradas);
    const esperado = [...baseEsperada, ...opcionales].sort((a, b) => a.localeCompare(b));
    const leidas = [...nombresZip].sort((a, b) => a.localeCompare(b));
    if (new Set(nombresZip).size !== nombresZip.length
      || JSON.stringify(leidas) !== JSON.stringify(esperado)) {
      error('ENTRADAS_ZIP_DISTINTAS', `Las entradas del ZIP no son las contractuales (12 base + opcionales P6 en su orden) (leídas: ${nombresZip.join(', ') || 'ninguna'})`);
    }
    for (const nombre of esperado) {
      if (nombre === 'manifest.json') {
        if ('manifest.json' in hashes) {
          error('HASH_MANIFEST_DE_SI_MISMO', 'El manifiesto no debe declarar su propio hash', { entrada: nombre });
        }
        continue;
      }
      const entrada = porNombre.get(nombre);
      const hashDeclarado = hashes[nombre];
      if (!entrada) {
        error('ENTRADA_AUSENTE', `Falta la entrada '${nombre}'`, { entrada: nombre });
        continue;
      }
      if (hashDeclarado === undefined) {
        error('HASH_NO_DECLARADO', `El manifiesto no declara hash de '${nombre}'`, { entrada: nombre });
        continue;
      }
      const real = sha256Hex(entrada.bytes);
      if (real !== hashDeclarado) {
        error('HASH_NO_COINCIDE', `Entrada '${nombre}': SHA-256 real ${real} ≠ declarado ${hashDeclarado}`, { entrada: nombre });
      }
    }
    for (const nombre of Object.keys(hashes)) {
      if (!esperado.includes(nombre)) {
        error('HASH_DE_ENTRADA_INESPERADA', `El manifiesto declara hash de una entrada no contractual: '${nombre}'`);
      }
    }
    // El informe debe citar el mismo paqueteId y el mismo ámbito que el manifiesto.
    const informe = textoDe('informe.txt');
    if (informe !== null && manifest.paqueteId !== undefined && !informe.includes(manifest.paqueteId)) {
      error('INFORME_PAQUETE_ID_DISTINTO', 'informe.txt no cita el paqueteId del manifiesto');
    }
    if (informe !== null && ambitoManifest !== null) {
      const valorInforme = (etiqueta: string): string | null => {
        const linea = informe.split('\n').find((l) => l.trim().startsWith(`${etiqueta}:`));
        return linea === undefined ? null : linea.trim().slice(etiqueta.length + 1).trim();
      };
      const esperadoInforme: [string, string][] = [
        ['Propietarios', [...ambitoManifest.propietarios].join(', ')],
        ['Inmuebles', ambitoManifest.inmuebles === null
          ? '(todos los de los propietarios)' : [...ambitoManifest.inmuebles].join(', ')],
        ['Ejercicios', ambitoManifest.ejercicios === null
          ? '(sin filtro anual)' : [...ambitoManifest.ejercicios].join(', ')],
      ];
      if (!manifestHeredadoSinMeses) {
        esperadoInforme.push(['Meses', ambitoManifest.meses === null
          ? '(sin filtro mensual)' : [...ambitoManifest.meses].join(', ')]);
      }
      if (mRec.rangoFechasEfectivo !== undefined) {
        esperadoInforme.push(['Rango de fechas', ambitoManifest.rango === null
          ? '(sin filtro por fechas)' : `${ambitoManifest.rango.desde}..${ambitoManifest.rango.hasta}`]);
      }
      for (const [etiqueta, valorEsperado] of esperadoInforme) {
        if (valorInforme(etiqueta) !== valorEsperado) {
          error('INFORME_NO_COINCIDE_CON_MANIFEST', `informe.txt: '${etiqueta}: ${valorInforme(etiqueta) ?? '(ausente)'}' no coincide con el manifiesto ('${valorEsperado}')`);
        }
      }
    }
  }

  // 3) CSV: cabeceras, conteos y libro (recálculo completo en céntimos).
  const csvs = new Map<string, { cabecera: string[]; filas: FilaCsv[]; filasMalformadas: number[] }>();
  for (const nombre of ENTRADAS_ESPERADAS) {
    if (!nombre.endsWith('.csv')) continue;
    const txt = textoDe(nombre);
    if (txt === null) continue; // ya error si falta
    const parsed = parsearCsv(txt);
    if (parsed === null) {
      error('CSV_ILEGIBLE', `'${nombre}' no es parseable como CSV`, { entrada: nombre });
      continue;
    }
    const cabeceraEsperada = CABECERAS_CSV_ESPERADAS[nombre];
    if (cabeceraEsperada !== undefined
      && JSON.stringify(parsed.cabecera) !== JSON.stringify(cabeceraEsperada)) {
      error(
        nombre === 'libro-ingresos-gastos.csv' ? 'CABECERA_LIBRO_DISTINTA' : 'CABECERA_CSV_DISTINTA',
        `La cabecera de '${nombre}' no es la contractual (${parsed.cabecera.join('|')})`,
        { entrada: nombre },
      );
    }
    for (const numLinea of parsed.filasMalformadas) {
      error('CSV_FILA_MALFORMADA', `'${nombre}' línea ${numLinea}: número de campos distinto de la cabecera (${parsed.cabecera.length})`, { entrada: nombre });
    }
    csvs.set(nombre, parsed);
  }
  const libro = csvs.get('libro-ingresos-gastos.csv');
  const incidenciasTxt = textoDe('incidencias.json');
  let incidencias: IncidenciaPaqueteAsesor[] = [];
  if (incidenciasTxt !== null) {
    try {
      const parsed = JSON.parse(incidenciasTxt) as unknown;
      if (Array.isArray(parsed)) {
        const validas = parsed.filter((i): i is IncidenciaPaqueteAsesor =>
          esObjetoPlano(i) && typeof i.codigo === 'string' && i.codigo !== '');
        if (validas.length !== parsed.length) {
          error('INCIDENCIAS_ILEGIBLES', 'incidencias.json contiene elementos que no son incidencias (objeto con código)');
        }
        incidencias = validas;
      } else error('INCIDENCIAS_ILEGIBLES', 'incidencias.json no es un array');
    } catch (e) {
      error('INCIDENCIAS_ILEGIBLES', `incidencias.json no es JSON válido (${e instanceof Error ? e.message : 'error'})`);
    }
  }
  /** ¿Existe incidencia identificadora para una entidad? (código + id) */
  const hayIncidencia = (codigo: string | RegExp, id: string): boolean =>
    incidencias.some((i) => typeof i?.codigo === 'string'
      && (typeof codigo === 'string' ? i.codigo === codigo : codigo.test(i.codigo)) && i.id === id);
  if (incidencias.some((i) => i.codigo === 'IMPORTE_CON_SUBCENTIMO')) {
    error(
      'CUADRE_NO_VERIFICABLE_POR_SUBCENTIMO',
      'El paquete declara importes con subcéntimo: el CSV/libro solo representan céntimos, así que su cuadre no puede acreditarse desde los bytes del paquete',
    );
  }

  // 3b) CSV fuente: ids utilizables, duplicados identificados y ámbito.
  // El manifiesto no basta como declaración: propietario/inmueble/periodo se
  // contrastan fila a fila contra lo que el paquete dice ser.
  const duplicadoEsperado: Readonly<Record<string, string>> = {
    'datos/inmuebles.csv': 'INMUEBLE_DUPLICADO',
    'datos/contratos.csv': 'CONTRATO_DUPLICADO',
    'datos/facturas.csv': 'FACTURA_DUPLICADA',
    'datos/liquidaciones.csv': 'LIQUIDACION_DUPLICADA',
    'datos/polizas.csv': 'POLIZA_DUPLICADA',
  };
  const mesTextoValido = (v: string): boolean => {
    const m = /^(\d{4})-(\d{2})$/.exec(v);
    return m !== null && Number(m[2]) >= 1 && Number(m[2]) <= 12;
  };
  const mesDeFechaFlexible = (v: string): string => {
    if (esFechaReal(v)) return v.slice(0, 7);
    const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
    if (dmy && esFechaReal(`${dmy[3]}-${dmy[2]}-${dmy[1]}`)) return `${dmy[3]}-${dmy[2]}`;
    return '';
  };
  const fechaIsoFlexible = (v: string): string => {
    if (esFechaReal(v)) return v;
    const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
    if (dmy) {
      const iso = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
      return esFechaReal(iso) ? iso : '';
    }
    return '';
  };
  const ultimoDiaDeMesVerificador = (mes: string): string => {
    const anio = Number(mes.slice(0, 4));
    const numMes = Number(mes.slice(5, 7));
    const dia = new Date(Date.UTC(anio, numMes, 0)).getUTCDate();
    return `${mes}-${String(dia).padStart(2, '0')}`;
  };
  const enteroDeTexto = (v: string): number | null =>
    /^-?\d+$/.test(v.trim()) ? Number(v) : null;
  for (const [nombre, csv] of csvs) {
    if (!nombre.startsWith('datos/')) continue;
    const porId = new Map<string, FilaCsv[]>();
    for (const fila of csv.filas) {
      const id = fila.id ?? '';
      if (id.trim() === '') {
        error('CSV_ID_VACIO', `'${nombre}' contiene una fila sin id: no es referenciable ni contrastable`, { entrada: nombre });
      } else {
        const arr = porId.get(id) ?? [];
        arr.push(fila);
        porId.set(id, arr);
      }
      if (ambitoManifest !== null) {
        if (nombre === 'datos/inmuebles.csv') {
          const titulares = [fila.propietarioId ?? '', fila.propietarioPrincipalId ?? '']
            .filter((x) => x !== '');
          if (!titulares.some((x) => ambitoManifest!.propietarios.has(x))) {
            error('AMBITO_PROPIETARIO_FUERA_DE_MANIFEST', `Inmueble ${id || '(sin id)'} sin titular dentro de propietariosEfectivos`, { entrada: nombre, id });
          }
        } else if (csv.cabecera.includes('propietarioId')
          && !ambitoManifest.propietarios.has(fila.propietarioId ?? '')) {
          error('AMBITO_PROPIETARIO_FUERA_DE_MANIFEST', `'${nombre}' fila ${id || '(sin id)'} de propietario '${fila.propietarioId ?? ''}', fuera de propietariosEfectivos`, { entrada: nombre, id });
        }
        if (ambitoManifest.inmuebles !== null) {
          const idInmueble = nombre === 'datos/inmuebles.csv' ? id
            : csv.cabecera.includes('inmuebleId') ? (fila.inmuebleId ?? '') : null;
          if (idInmueble !== null && !ambitoManifest.inmuebles.has(idInmueble)) {
            error('AMBITO_INMUEBLE_FUERA_DE_MANIFEST', `'${nombre}' fila ${id || '(sin id)'} del inmueble '${idInmueble}', fuera de inmueblesEfectivos`, { entrada: nombre, id });
          }
        }
        let ejercicioFila: number | null = null;
        let mesFila = '';
        if (nombre === 'datos/cobros.csv') {
          ejercicioFila = enteroDeTexto(fila.anio ?? '');
          mesFila = mesTextoValido(fila.periodoMesAnio ?? '') ? fila.periodoMesAnio
            : ejercicioFila !== null && enteroDeTexto(fila.mes ?? '') !== null
              ? `${ejercicioFila}-${String(enteroDeTexto(fila.mes ?? '')).padStart(2, '0')}` : '';
        } else if (nombre === 'datos/gastos.csv') {
          const fecha = primeraFechaReal(fila.fechaDevengo, fila.fechaPago);
          ejercicioFila = enteroDeTexto(fila.ejercicioFiscal ?? '')
            ?? (fecha ? Number(fecha.slice(0, 4)) : null);
          mesFila = mesTextoValido(fila.periodoMesAnio ?? '') ? fila.periodoMesAnio
            : fecha ? fecha.slice(0, 7) : '';
        } else if (nombre === 'datos/facturas.csv') {
          mesFila = mesDeFechaFlexible(fila.fechaExpedicion ?? '');
          const ejercicioDeclarado = enteroDeTexto(fila.ejercicio ?? '');
          ejercicioFila = ejercicioDeclarado !== null
            && ejercicioDeclarado >= 1900 && ejercicioDeclarado <= 9999
            ? ejercicioDeclarado
            : mesFila ? Number(mesFila.slice(0, 4)) : null;
        } else if (nombre === 'datos/liquidaciones.csv') {
          ejercicioFila = enteroDeTexto(fila.anio ?? '');
          mesFila = mesTextoValido(fila.periodo ?? '') ? fila.periodo
            : ejercicioFila !== null && enteroDeTexto(fila.mes ?? '') !== null
              ? `${ejercicioFila}-${String(enteroDeTexto(fila.mes ?? '')).padStart(2, '0')}` : '';
        }
        if (ambitoManifest.ejercicios !== null && ejercicioFila !== null
          && !ambitoManifest.ejercicios.has(ejercicioFila)) {
          error('AMBITO_TEMPORAL_FUERA_DE_MANIFEST', `'${nombre}' fila ${id || '(sin id)'} del ejercicio ${ejercicioFila}, fuera de ejerciciosEfectivos`, { entrada: nombre, id });
        }
        if (ambitoManifest.meses !== null && mesTextoValido(mesFila)
          && !ambitoManifest.meses.has(mesFila)) {
          error('AMBITO_TEMPORAL_FUERA_DE_MANIFEST', `'${nombre}' fila ${id || '(sin id)'} del mes ${mesFila}, fuera de mesesEfectivos`, { entrada: nombre, id });
        }
        // P6 — contraste con el intervalo de fechas declarado. Solo se exige
        // cuando la fecha es DERIVABLE de los campos serializados; si no
        // (p. ej. un gasto cuyo alias `fecha` no viaja en el CSV v1), se
        // declara la limitación en vez de inventar una fecha.
        const rango = ambitoManifest.rango;
        if (rango !== null) {
          const fueraDeRango = (fecha: string): boolean => fecha < rango.desde || fecha > rango.hasta;
          const advertirNoDerivable = (motivo: string): void =>
            advertencia('FECHA_NO_DERIVABLE_PARA_RANGO', `'${nombre}' fila ${id || '(sin id)'}: ${motivo}; no se puede contrastar con el rango de fechas`, { entrada: nombre, id });
          if (nombre === 'datos/cobros.csv') {
            const fecha = primeraFechaReal(fila.fechaPago, fila.fechaVencimiento);
            if (!fecha) advertirNoDerivable('sin fechaPago ni fechaVencimiento reales');
            else if (fueraDeRango(fecha)) error('AMBITO_TEMPORAL_FUERA_DE_MANIFEST', `'${nombre}' fila ${id}: fecha ${fecha} fuera del rango ${rango.desde}..${rango.hasta}`, { entrada: nombre, id });
          } else if (nombre === 'datos/gastos.csv') {
            const fecha = primeraFechaReal(fila.fechaDevengo, fila.fechaPago);
            if (!fecha) advertirNoDerivable('el CSV v1 no serializa el alias `fecha` del gasto');
            else if (fueraDeRango(fecha)) error('AMBITO_TEMPORAL_FUERA_DE_MANIFEST', `'${nombre}' fila ${id}: fecha ${fecha} fuera del rango ${rango.desde}..${rango.hasta}`, { entrada: nombre, id });
          } else if (nombre === 'datos/facturas.csv') {
            const fecha = fechaIsoFlexible(fila.fechaExpedicion ?? '');
            if (!fecha) advertirNoDerivable('fecha de expedición no legible');
            else if (fueraDeRango(fecha)) error('AMBITO_TEMPORAL_FUERA_DE_MANIFEST', `'${nombre}' fila ${id}: fecha de expedición ${fecha} fuera del rango ${rango.desde}..${rango.hasta}`, { entrada: nombre, id });
          } else if (nombre === 'datos/liquidaciones.csv') {
            if (!mesTextoValido(mesFila)) advertirNoDerivable('periodo de liquidación no legible');
            else if (`${mesFila}-01` > rango.hasta || ultimoDiaDeMesVerificador(mesFila) < rango.desde) {
              error('AMBITO_TEMPORAL_FUERA_DE_MANIFEST', `'${nombre}' fila ${id}: periodo ${mesFila} fuera del rango ${rango.desde}..${rango.hasta}`, { entrada: nombre, id });
            }
          } else if (nombre === 'datos/contratos.csv') {
            const inicio = primeraFechaReal(fila.fechaInicioContrato);
            const fin = primeraFechaReal(fila.fechaFinContrato);
            if (!inicio) advertirNoDerivable('contrato sin fecha de inicio real');
            else if (inicio > rango.hasta || (fin !== '' && fin < rango.desde)) {
              error('AMBITO_TEMPORAL_FUERA_DE_MANIFEST', `'${nombre}' fila ${id}: vigencia ${inicio}..${fin || 'abierta'} no solapa el rango ${rango.desde}..${rango.hasta}`, { entrada: nombre, id });
            }
          } else if (nombre === 'datos/polizas.csv') {
            const inicio = primeraFechaReal(fila.fechaInicio);
            const fin = primeraFechaReal(fila.fechaVencimiento);
            if (!inicio || !fin) advertirNoDerivable('póliza con vigencia no legible');
            else if (inicio > rango.hasta || fin < rango.desde) {
              error('AMBITO_TEMPORAL_FUERA_DE_MANIFEST', `'${nombre}' fila ${id}: vigencia ${inicio}..${fin} no solapa el rango ${rango.desde}..${rango.hasta}`, { entrada: nombre, id });
            }
          }
        }
      }
    }
    const codigoDuplicado = duplicadoEsperado[nombre];
    if (codigoDuplicado !== undefined) {
      for (const [id, filasId] of porId) {
        if (filasId.length > 1 && !hayIncidencia(codigoDuplicado, id)) {
          error('DISCREPANCIA_NO_IDENTIFICADA', `'${nombre}' repite el id ${id} (${filasId.length} filas) sin incidencia ${codigoDuplicado}`, { entrada: nombre, id });
        }
      }
    }
  }

  const recalc = totalesVacios();
  let lineasLibro = 0;
  if (libro) {
    lineasLibro = libro.filas.length;
    for (const fila of libro.filas) {
      const id = fila.fuenteId ?? '';
      if (id.trim() === '') {
        error('LINEA_SIN_FUENTE', 'Línea del libro sin fuenteId: no es contrastable contra los CSV fuente', { entrada: 'libro-ingresos-gastos.csv' });
        continue;
      }
      if (!esFechaReal(fila.fecha ?? '')) {
        error('LINEA_FECHA_INVALIDA', `Línea (${fila.fuenteTipo} ${id}) con fecha '${fila.fecha}' que no es una fecha real YYYY-MM-DD`, { entrada: 'libro-ingresos-gastos.csv', id });
        continue;
      }
      const cent = centimosDeTexto(fila.total ?? '');
      if (cent === null || cent < 0) {
        error('LINEA_TOTAL_INVALIDO', `Línea (${fila.fuenteTipo} ${id}) con total '${fila.total}' ilegible en céntimos no negativos`, { entrada: 'libro-ingresos-gastos.csv', id });
        continue;
      }
      if (fila.tipo !== 'INGRESO' && fila.tipo !== 'GASTO') {
        error('LINEA_TIPO_INVALIDO', `Línea (${fila.fuenteTipo} ${id}) con tipo '${fila.tipo}'`, { entrada: 'libro-ingresos-gastos.csv', id });
        continue;
      }
      const fuenteEsperada = fila.tipo === 'INGRESO' ? 'COBRO' : 'GASTO';
      if (fila.fuenteTipo !== fuenteEsperada) {
        error('LINEA_NO_COINCIDE_CON_FUENTE', `Línea ${id}: tipo ${fila.tipo} con fuenteTipo '${fila.fuenteTipo}' (esperado ${fuenteEsperada})`, { entrada: 'libro-ingresos-gastos.csv', id });
        continue;
      }
      if (ambitoManifest !== null) {
        // El filtro por EJERCICIO/MES se contrasta con el periodo contable de
        // la fuente (un cobro de febrero puede pagarse en marzo). El rango de
        // FECHAS, en cambio, se aplica a la fecha del libro: toda línea debe
        // caer dentro del intervalo solicitado.
        if (ambitoManifest.inmuebles !== null
          && !ambitoManifest.inmuebles.has(fila.inmuebleId ?? '')) {
          error('AMBITO_INMUEBLE_FUERA_DE_MANIFEST', `Línea (${fila.fuenteTipo} ${id}) del inmueble '${fila.inmuebleId ?? ''}', fuera de inmueblesEfectivos`, { entrada: 'libro-ingresos-gastos.csv', id });
        }
        if (ambitoManifest.rango !== null
          && (fila.fecha < ambitoManifest.rango.desde || fila.fecha > ambitoManifest.rango.hasta)) {
          error('AMBITO_TEMPORAL_FUERA_DE_MANIFEST', `Línea (${fila.fuenteTipo} ${id}) con fecha ${fila.fecha} fuera del rango ${ambitoManifest.rango.desde}..${ambitoManifest.rango.hasta}`, { entrada: 'libro-ingresos-gastos.csv', id });
        }
      }
      // Dominios por clase de línea: un ingreso no es «deducible» y un gasto
      // sin desglose no puede traer base/IVA/retención inventados.
      if (fila.tipo === 'INGRESO') {
        if ((fila.deducible ?? '') !== '' || (fila.origenDeducibilidad ?? '') !== '') {
          error('LINEA_DEDUCIBLE_INVALIDO', `Línea de ingreso (${id}) con deducible/origenDeducibilidad consignados`, { entrada: 'libro-ingresos-gastos.csv', id });
        }
      } else if (fila.deducible !== 'true' && fila.deducible !== 'false') {
        error('LINEA_DEDUCIBLE_INVALIDO', `Línea de gasto (${id}) con deducible '${fila.deducible ?? ''}' (solo true/false)`, { entrada: 'libro-ingresos-gastos.csv', id });
      }
      const desglosesValidos = ['SIN_DESGLOSE_EN_ORIGEN', 'FACTURA_VINCULADA', 'FACTURA_INCONSISTENTE'];
      const hayDesglose = (fila.base ?? '') !== '' || (fila.iva ?? '') !== '' || (fila.retencion ?? '') !== '';
      if (!desglosesValidos.includes(fila.desgloseFiscal ?? '')
        || (fila.tipo === 'INGRESO' && fila.desgloseFiscal !== 'SIN_DESGLOSE_EN_ORIGEN')
        || (fila.desgloseFiscal !== 'FACTURA_VINCULADA' && hayDesglose)
        || (fila.desgloseFiscal === 'FACTURA_VINCULADA'
          && (fila.tipo !== 'GASTO' || (fila.base ?? '') === '' || (fila.iva ?? '') === ''))) {
        error('LINEA_DESGLOSE_INVALIDO', `Línea (${fila.fuenteTipo} ${id}): desgloseFiscal '${fila.desgloseFiscal ?? ''}' incompatible con base/IVA/retención consignados`, { entrada: 'libro-ingresos-gastos.csv', id });
      }
      const ejercicio = Number(fila.ejercicio);
      if (!Number.isInteger(ejercicio) || ejercicio !== Number(fila.fecha.slice(0, 4))) {
        error('LINEA_EJERCICIO_DISTINTO_FECHA', `Línea (${fila.fuenteTipo} ${id}): ejercicio ${fila.ejercicio} ≠ año de la fecha ${fila.fecha}`, { entrada: 'libro-ingresos-gastos.csv', id });
      }
      acumular(recalc, fila.fecha, Number(fila.fecha.slice(0, 4)), fila.tipo === 'INGRESO', cent, fila.deducible === 'true');
      if (fila.desgloseFiscal === 'FACTURA_VINCULADA') {
        const base = centimosDeTexto(fila.base ?? '');
        const iva = centimosDeTexto(fila.iva ?? '');
        const ret = (fila.retencion ?? '') === '' ? 0 : centimosDeTexto(fila.retencion);
        if (base === null || iva === null || ret === null) {
          error('DESGLOSE_FACTURA_VINCULADA_INVALIDO', `Línea (GASTO ${id}) FACTURA_VINCULADA sin base/IVA/retención legibles`, { entrada: 'libro-ingresos-gastos.csv', id });
        } else if (base + iva - ret !== cent
          && !hayIncidencia('GASTO_FACTURA_IMPORTE_NO_COINCIDE', id)) {
          // El total de la línea es el importe del GASTO; si el desglose de
          // su factura suma otra cosa, debe venir identificado.
          error('DISCREPANCIA_NO_IDENTIFICADA', `Línea (GASTO ${id}): base ${fila.base} + IVA ${fila.iva} - retención ${fila.retencion || '0'} ≠ total ${fila.total} sin incidencia GASTO_FACTURA_IMPORTE_NO_COINCIDE`, { entrada: 'libro-ingresos-gastos.csv', id });
        }
      }
      // Referencia documental sin binario: debe venir IDENTIFICADA.
      if ((fila.documentoNombre ?? '') !== ''
        && !hayIncidencia('DOCUMENTO_SIN_BINARIO_VERIFICABLE', id)) {
        error(
          'REFERENCIA_DOCUMENTAL_NO_IDENTIFICADA',
          `Línea (${fila.fuenteTipo} ${id}) referencia «${fila.documentoNombre}» sin incidencia DOCUMENTO_SIN_BINARIO_VERIFICABLE: una referencia no prueba disponibilidad`,
          { entrada: 'libro-ingresos-gastos.csv', id },
        );
      }
    }
  }

  // 4) Conteos y totales declarados vs recalculados (manifiesto y totales.json).
  if (manifest !== null) {
    const conteoCsv = (nombre: string): number => csvs.get(nombre)?.filas.length ?? -1;
    const mapa: Record<string, number> = {
      inmuebles: conteoCsv('datos/inmuebles.csv'),
      contratos: conteoCsv('datos/contratos.csv'),
      cobros: conteoCsv('datos/cobros.csv'),
      gastos: conteoCsv('datos/gastos.csv'),
      facturas: conteoCsv('datos/facturas.csv'),
      liquidaciones: conteoCsv('datos/liquidaciones.csv'),
      polizas: conteoCsv('datos/polizas.csv'),
      lineasLibro,
    };
    for (const [clave, real] of Object.entries(mapa)) {
      if (real >= 0 && manifest.conteos?.[clave] !== real) {
        error('CONTEO_NO_COINCIDE', `Conteo '${clave}': manifiesto ${manifest.conteos?.[clave]} ≠ filas reales ${real}`);
      }
    }
    if (manifest.numIncidencias !== incidencias.length) {
      error('NUM_INCIDENCIAS_NO_COINCIDE', `manifiesto numIncidencias=${manifest.numIncidencias} ≠ incidencias.json (${incidencias.length})`);
    }
    for (const v of Array.isArray(manifest.verificaciones) ? manifest.verificaciones : []) {
      if (!esObjetoPlano(v) || v.ok !== true) {
        error('VERIFICACION_DECLARADA_FALLIDA', `El propio manifiesto declara fallida la verificación '${v?.nombre ?? '?'}' (esperado ${v?.esperado ?? '?'} / obtenido ${v?.obtenido ?? '?'})`);
      }
    }
    const cotejarTotales = (totales: TotalesPaqueteAsesor, origen: string): void => {
      const pares: [string, number | null, number][] = [
        ['totalIngresos', centimosDeNumero(totales.totalIngresos), recalc.totalIngresosCent],
        ['totalGastos', centimosDeNumero(totales.totalGastos), recalc.totalGastosCent],
        ['totalGastosDeducibles', centimosDeNumero(totales.totalGastosDeducibles), recalc.deduciblesCent],
        ['totalGastosNoDeducibles', centimosDeNumero(totales.totalGastosNoDeducibles), recalc.noDeduciblesCent],
        ['resultado', centimosDeNumero(totales.resultado), recalc.totalIngresosCent - recalc.totalGastosCent],
      ];
      for (const [nombre, declarado, real] of pares) {
        if (declarado === null || declarado !== real) {
          error('TOTAL_NO_CUADRA', `${origen}.${nombre}: declarado ${declarado === null ? '?' : eurosDeCentimos(declarado)} ≠ recalculado ${eurosDeCentimos(real)}`);
        }
      }
      const cotejarSerie = (
        serie: ReadonlyArray<TotalesEjercicioAsesor | TotalesMesAsesor>,
        mapaReal: ReadonlyMap<number | string, { numIngresos: number; numGastos: number; ingCent: number; gasCent: number; dedCent: number; noDedCent: number }>,
        etiqueta: string,
        claveDe: (f: TotalesEjercicioAsesor | TotalesMesAsesor) => number | string,
      ): void => {
        const clavesDeclaradas = new Set(serie.map(claveDe));
        for (const f of serie) {
          const clave = claveDe(f);
          const real = mapaReal.get(clave);
          if (!real) {
            error('TOTAL_SERIE_SIN_LINEAS', `${origen}.${etiqueta}[${clave}] no corresponde a ninguna línea del libro`);
            continue;
          }
          if (f.numIngresos !== real.numIngresos || f.numGastos !== real.numGastos
            || centimosDeNumero(f.totalIngresos) !== real.ingCent
            || centimosDeNumero(f.totalGastos) !== real.gasCent
            || centimosDeNumero(f.totalGastosDeducibles) !== real.dedCent
            || centimosDeNumero(f.totalGastosNoDeducibles) !== real.noDedCent
            || centimosDeNumero(f.resultado) !== real.ingCent - real.gasCent) {
            error('TOTAL_SERIE_NO_CUADRA', `${origen}.${etiqueta}[${clave}] no cuadran con las líneas del libro recalculadas`);
          }
        }
        for (const clave of mapaReal.keys()) {
          if (!clavesDeclaradas.has(clave)) {
            error('TOTAL_SERIE_AUSENTE', `${origen}.${etiqueta} no incluye ${clave}, presente en el libro`);
          }
        }
      };
      cotejarSerie(totales.porEjercicio, recalc.porEjercicio, 'porEjercicio', (f) => (f as TotalesEjercicioAsesor).ejercicio);
      if (totales.porMes === undefined) {
        advertencia('TOTALES_POR_MES_AUSENTES', `${origen} no trae totales por mes (paquete heredado): el recálculo mensual queda sin contraste`);
      } else {
        cotejarSerie(totales.porMes, recalc.porMes, 'porMes', (f) => (f as TotalesMesAsesor).mes);
      }
    };
    if (manifestTotalesValidos) cotejarTotales(manifest.totales, 'manifest.totales');
    const totalesTexto = textoDe('totales.json');
    if (totalesTexto !== null) {
      try {
        // Formato contractual: { totales, verificaciones }.
        const parsed: unknown = JSON.parse(totalesTexto);
        const totalesParsed = esObjetoPlano(parsed) ? parsed.totales : undefined;
        const esSerieObjetos = (v: unknown): boolean =>
          Array.isArray(v) && v.every(esObjetoPlano);
        if (!esObjetoPlano(totalesParsed) || !esSerieObjetos(totalesParsed.porEjercicio)
          || (totalesParsed.porMes !== undefined && !esSerieObjetos(totalesParsed.porMes))) {
          error('TOTALES_ILEGIBLES', 'totales.json no contiene un objeto "totales" con series legibles');
        } else {
          cotejarTotales(totalesParsed as unknown as TotalesPaqueteAsesor, 'totales.json');
        }
      } catch (e) {
        error('TOTALES_ILEGIBLES', `totales.json no es JSON válido (${e instanceof Error ? e.message : 'error'})`);
      }
    }
    // Neto de liquidaciones: informativo pero también recalculable.
    const liqs = csvs.get('datos/liquidaciones.csv');
    if (manifestTotalesValidos && liqs && liqs.cabecera.includes('netoPropietario')) {
      let netoCent = 0;
      let ilegible = false;
      for (const l of liqs.filas) {
        const c = (l.netoPropietario ?? '') === '' ? 0 : centimosDeTexto(l.netoPropietario);
        if (c === null) { ilegible = true; break; }
        netoCent += c;
      }
      if (!ilegible && centimosDeNumero(manifest.totales.totalNetoLiquidacionesIncluidas) !== netoCent) {
        error('TOTAL_NO_CUADRA', `totalNetoLiquidacionesIncluidas declarado ${manifest.totales.totalNetoLiquidacionesIncluidas} ≠ recalculado ${eurosDeCentimos(netoCent)} desde liquidaciones.csv`);
      }
    }
  }

  // 5) Cuadre libro ↔ fuentes CSV (re-derivación de las reglas del cuadre).
  const cobros = csvs.get('datos/cobros.csv');
  const gastos = csvs.get('datos/gastos.csv');
  const facturas = csvs.get('datos/facturas.csv');
  if (libro && cobros && gastos) {
    interface LineaComparable { fecha: string; cent: number; inmuebleId: string }
    const lineasIngresoPorId = new Map<string, LineaComparable[]>();
    const lineasGastoPorId = new Map<string, LineaComparable[]>();
    for (const fila of libro.filas) {
      const cent = centimosDeTexto(fila.total ?? '');
      if (cent === null || cent < 0 || !esFechaReal(fila.fecha ?? '')) continue;
      if (fila.fuenteTipo !== 'COBRO' && fila.fuenteTipo !== 'GASTO') continue;
      if ((fila.fuenteId ?? '').trim() === '') continue;
      const mapa = fila.fuenteTipo === 'COBRO' ? lineasIngresoPorId : lineasGastoPorId;
      const arr = mapa.get(fila.fuenteId) ?? [];
      arr.push({ fecha: fila.fecha, cent, inmuebleId: fila.inmuebleId ?? '' });
      mapa.set(fila.fuenteId, arr);
    }
    const claveLinea = (l: LineaComparable): string => `${l.fecha}|${l.cent}|${l.inmuebleId}`;
    const mismos = (a: string[], b: string[]): boolean =>
      JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    const mismosCent = (a: LineaComparable[], b: LineaComparable[]): boolean =>
      mismos(a.map((l) => String(l.cent)), b.map((l) => String(l.cent)));
    const huellaCsv = (csv: { cabecera: string[] }, fila: FilaCsv): string =>
      JSON.stringify(csv.cabecera.map((col) => fila[col] ?? ''));
    const agruparPorId = (filas: FilaCsv[]): Map<string, FilaCsv[]> => {
      const m = new Map<string, FilaCsv[]>();
      for (const f of filas) {
        const arr = m.get(f.id) ?? [];
        arr.push(f);
        m.set(f.id, arr);
      }
      return m;
    };
    // Cobros: computable ⇔ no ANULADO/IMPAGADO, importe>0, fecha real.
    // No basta con que las sumas coincidan: fecha e importe de CADA línea se
    // contrastan con su fuente (mover un día dentro del mes también es falso).
    for (const [id, filasId] of agruparPorId(cobros.filas)) {
      if (filasId.length > 1
        && !hayIncidencia(/COBRO_(DUPLICADO_EXACTO|ID_CONFLICTIVO)/, id)) {
        error('DISCREPANCIA_NO_IDENTIFICADA', `El cobro ${id} aparece ${filasId.length} veces en datos/cobros.csv sin incidencia de duplicado`, { entrada: 'datos/cobros.csv', id });
      }
      const candidatos: LineaComparable[] = [];
      for (const f of filasId) {
        if (f.estado === 'ANULADO' || f.estado === 'IMPAGADO') continue;
        const cent = centimosDeTexto(f.importeRecibido ?? '');
        if (cent === null || cent <= 0) continue;
        const fecha = primeraFechaReal(f.fechaPago, f.fechaVencimiento);
        if (!fecha) continue;
        candidatos.push({ fecha, cent, inmuebleId: f.inmuebleId ?? '' });
      }
      let esperado = candidatos;
      let clasificacionFalsa = false;
      if (filasId.length > 1 && hayIncidencia('COBRO_ID_CONFLICTIVO', id)) {
        esperado = []; // conflictivo: ninguna copia computa
      } else if (filasId.length > 1 && hayIncidencia('COBRO_DUPLICADO_EXACTO', id)) {
        if (new Set(filasId.map((f) => huellaCsv(cobros, f))).size === 1) {
          esperado = candidatos.slice(0, 1); // réplica exacta: computa una sola
        } else {
          clasificacionFalsa = true;
        }
      }
      const actual = lineasIngresoPorId.get(id) ?? [];
      if (clasificacionFalsa) {
        error('CUADRE_COBRO_DISTINTO_LIBRO', `Cobro ${id}: se declara COBRO_DUPLICADO_EXACTO pero las filas de datos/cobros.csv no son idénticas`, { entrada: 'datos/cobros.csv', id });
      } else if (!mismosCent(esperado, actual)) {
        const sumaEsperada = esperado.reduce((s, l) => s + l.cent, 0);
        const sumaLibro = actual.reduce((s, l) => s + l.cent, 0);
        error('CUADRE_COBRO_DISTINTO_LIBRO', `Cobro ${id}: fuentes computables suman ${eurosDeCentimos(sumaEsperada)} pero el libro trae ${actual.length} línea(s) por ${eurosDeCentimos(sumaLibro)}`, { entrada: 'datos/cobros.csv', id });
      } else if (!mismos(esperado.map(claveLinea), actual.map(claveLinea))) {
        error('LINEA_NO_COINCIDE_CON_FUENTE', `Cobro ${id}: fecha/inmueble de su línea del libro no coinciden con datos/cobros.csv (con el mismo importe)`, { entrada: 'libro-ingresos-gastos.csv', id });
      }
    }
    for (const id of lineasIngresoPorId.keys()) {
      if (!agruparPorId(cobros.filas).has(id)) {
        error('LINEA_INGRESO_SIN_FUENTE', `El libro trae una línea de ingreso del cobro ${id}, ausente de datos/cobros.csv`, { entrada: 'libro-ingresos-gastos.csv', id });
      }
    }
    // Gastos: computable ⇔ no ANULADO, importe válido, fecha devengo/pago.
    // El alias `fecha` no viaja en el CSV v1, pero SOLO degrada la FECHA: el
    // importe sigue siendo plenamente contrastable contra la fuente.
    for (const [id, filasId] of agruparPorId(gastos.filas)) {
      if (filasId.length > 1
        && !hayIncidencia(/GASTO_(DUPLICADO_EXACTO|ID_CONFLICTIVO)/, id)) {
        error('DISCREPANCIA_NO_IDENTIFICADA', `El gasto ${id} aparece ${filasId.length} veces en datos/gastos.csv sin incidencia de duplicado`, { entrada: 'datos/gastos.csv', id });
      }
      const conFecha: LineaComparable[] = [];
      const conAlias: LineaComparable[] = [];
      for (const f of filasId) {
        if (f.estado === 'ANULADO') continue;
        const cent = centimosDeTexto(f.importe ?? '');
        if (cent === null) continue;
        const fecha = primeraFechaReal(f.fechaDevengo, f.fechaPago);
        const candidato = { fecha, cent, inmuebleId: f.inmuebleId ?? '' };
        if (fecha) conFecha.push(candidato); else conAlias.push(candidato);
      }
      let esperadoFecha = conFecha;
      let esperadoAlias = conAlias;
      let clasificacionFalsa = false;
      if (filasId.length > 1 && hayIncidencia('GASTO_ID_CONFLICTIVO', id)) {
        esperadoFecha = [];
        esperadoAlias = [];
      } else if (filasId.length > 1 && hayIncidencia('GASTO_DUPLICADO_EXACTO', id)) {
        if (new Set(filasId.map((f) => huellaCsv(gastos, f))).size === 1) {
          esperadoFecha = conFecha.slice(0, 1);
          esperadoAlias = conFecha.length > 0 ? [] : conAlias.slice(0, 1);
        } else {
          clasificacionFalsa = true;
        }
      }
      const esperadoTodos = [...esperadoFecha, ...esperadoAlias];
      const actual = lineasGastoPorId.get(id) ?? [];
      const sumaEsperada = esperadoTodos.reduce((s, l) => s + l.cent, 0);
      const sumaLibro = actual.reduce((s, l) => s + l.cent, 0);
      if (clasificacionFalsa) {
        error('CUADRE_GASTO_DISTINTO_LIBRO', `Gasto ${id}: se declara GASTO_DUPLICADO_EXACTO pero las filas de datos/gastos.csv no son idénticas`, { entrada: 'datos/gastos.csv', id });
      } else if (!mismosCent(esperadoTodos, actual)) {
        const excluidoSinFecha = esperadoAlias.length > 0
          && hayIncidencia('GASTO_SIN_FECHA', id)
          && mismosCent(esperadoFecha, actual);
        if (!excluidoSinFecha) {
          error('CUADRE_GASTO_DISTINTO_LIBRO', `Gasto ${id}: fuentes computables suman ${eurosDeCentimos(sumaEsperada)} pero el libro trae ${actual.length} línea(s) por ${eurosDeCentimos(sumaLibro)}`, { entrada: 'datos/gastos.csv', id });
        }
      } else if (esperadoAlias.length > 0) {
        advertencia('GASTO_ALIAS_FECHA_NO_SERIALIZADO', `Gasto ${id}: el importe cuadra con la fuente, pero su fecha puede depender del alias 'fecha' que el CSV v1 no serializa; la fecha de la línea no es re-derivable desde el paquete`, { entrada: 'datos/gastos.csv', id });
        if (!mismos(
          esperadoTodos.map((l) => `${l.cent}|${l.inmuebleId}`),
          actual.map((l) => `${l.cent}|${l.inmuebleId}`),
        )) {
          error('LINEA_NO_COINCIDE_CON_FUENTE', `Gasto ${id}: el inmueble de su línea no coincide con datos/gastos.csv`, { entrada: 'libro-ingresos-gastos.csv', id });
        }
      } else if (!mismos(esperadoTodos.map(claveLinea), actual.map(claveLinea))) {
        error('LINEA_NO_COINCIDE_CON_FUENTE', `Gasto ${id}: fecha/inmueble de su línea del libro no coinciden con datos/gastos.csv (con el mismo importe)`, { entrada: 'libro-ingresos-gastos.csv', id });
      }
    }
    const gastosIds = agruparPorId(gastos.filas);
    for (const id of lineasGastoPorId.keys()) {
      if (!gastosIds.has(id)) {
        error('LINEA_GASTO_SIN_FUENTE', `El libro trae una línea del gasto ${id}, ausente de datos/gastos.csv`, { entrada: 'libro-ingresos-gastos.csv', id });
      }
    }
  }
  // Facturas: cada desglose que no suma el total debe estar identificado.
  if (facturas) {
    for (const f of facturas.filas) {
      const base = centimosDeTexto(f.baseImponible ?? '');
      const iva = centimosDeTexto(f.cuotaIva ?? '');
      const ret = (f.cuotaRetencion ?? '') === '' ? 0 : centimosDeTexto(f.cuotaRetencion);
      const total = centimosDeTexto(f.importeTotal ?? '');
      if (base === null || iva === null || ret === null || total === null) continue;
      if (base + iva - ret !== total
        && !hayIncidencia('FACTURA_DESGLOSE_NO_COINCIDE', f.id)) {
        error('DISCREPANCIA_NO_IDENTIFICADA', `Factura ${f.id}: base ${f.baseImponible} + IVA ${f.cuotaIva} - retención ${f.cuotaRetencion || '0'} ≠ total ${f.importeTotal} sin incidencia FACTURA_DESGLOSE_NO_COINCIDE`, { entrada: 'datos/facturas.csv', id: f.id });
      }
    }
  }

  problemas.sort((a, b) =>
    a.codigo.localeCompare(b.codigo)
    || (a.entrada ?? '').localeCompare(b.entrada ?? '')
    || (a.id ?? '').localeCompare(b.id ?? ''));

  return {
    ok: !problemas.some((p) => p.nivel === 'ERROR'),
    paqueteId: manifest?.paqueteId ?? null,
    schema: manifest?.schemaVersion ?? null,
    numEntradasZip: entradas.length,
    problemas,
  };
}
