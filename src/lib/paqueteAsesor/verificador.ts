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
 *    cuya línea del libro solo dependía de ese alias no es re-derivable al
 *    céntimo desde el CSV: advertencia, no error (queda declarado).
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
  const totalDeclarado = u16(zip, eocd + 10);
  const cdSize = u32(zip, eocd + 12);
  const cdOffset = u32(zip, eocd + 16);
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
    const metodo = u16(zip, p + 10);
    const crc = u32(zip, p + 16);
    const tamComp = u32(zip, p + 20);
    const tam = u32(zip, p + 24);
    const ln = u16(zip, p + 28);
    const le = u16(zip, p + 30);
    const lc = u16(zip, p + 32);
    const lho = u32(zip, p + 42);
    const nombre = decodificadorUtf8.decode(zip.subarray(p + 46, p + 46 + ln));
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
    const nombreLocal = decodificadorUtf8.decode(zip.subarray(lho + 30, lho + 30 + lnLocal));
    if (nombreLocal !== nombre) {
      err(`Entrada '${nombre}': el nombre de la cabecera local es '${nombreLocal}'`, nombre);
    }
    if (u16(zip, lho + 8) !== metodo || u32(zip, lho + 14) !== crc || u32(zip, lho + 22) !== tam) {
      err(`Entrada '${nombre}': método/CRC/tamaño de la cabecera local no coinciden con la central`, nombre);
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

function parsearCsv(textoCsv: string): { cabecera: string[]; filas: FilaCsv[] } | null {
  const registros = parsearRegistrosCsv(textoCsv);
  if (registros.length === 0) return null;
  const cabecera = registros[0];
  const filas: FilaCsv[] = [];
  for (let i = 1; i < registros.length; i += 1) {
    const fila: FilaCsv = {};
    cabecera.forEach((col, idx) => { fila[col] = registros[i][idx] ?? ''; });
    filas.push(fila);
  }
  return { cabecera, filas };
}

// ---------------------------------------------------------------------------
// Dinero en céntimos desde CADENAS (sin coma flotante ambigua)
// ---------------------------------------------------------------------------

/** Céntimos enteros de un literal decimal del CSV/manifiesto; null si ilegible. */
function centimosDeTexto(s: string): number | null {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) return null;
  const cent = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] === '-' ? -cent : cent;
}

/** Céntimos de un número del manifiesto (ya redondeado a 2 por el contrato). */
function centimosDeNumero(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.round(n * 100);
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
  const textoManifest = textoDe('manifest.json');
  if (textoManifest === null) {
    error('MANIFEST_AUSENTE', "Falta 'manifest.json': sin manifiesto no hay qué verificar");
  } else {
    try {
      manifest = JSON.parse(textoManifest) as ManifestPaqueteAsesor;
    } catch (e) {
      error('MANIFEST_ILEGIBLE', `manifest.json no es JSON válido (${e instanceof Error ? e.message : 'error'})`);
    }
  }
  if (manifest !== null) {
    if (manifest.schemaVersion !== PAQUETE_ASESOR_SCHEMA) {
      error('SCHEMA_NO_SOPORTADO', `Esquema '${manifest.schemaVersion}' ≠ '${PAQUETE_ASESOR_SCHEMA}'`);
    }
    if (manifest.formatoOficialAEAT !== false || manifest.incluyeBinariosDocumentales !== false) {
      error('BANDERAS_MANIFEST_INVALIDAS', 'El manifiesto no declara formatoOficialAEAT=false e incluyeBinariosDocumentales=false (declaración de honestidad obligatoria)');
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
      advertencia(
        'MESES_EFECTIVOS_AUSENTE_HEREDADO',
        'Manifiesto heredado sin mesesEfectivos: se interpreta como sin filtro mensual (null)',
      );
      manifest = { ...manifest, mesesEfectivos: null };
    }
    const nombresZip = entradas.map((e) => e.nombre);
    const esperado = [...ENTRADAS_ESPERADAS];
    if (JSON.stringify(nombresZip) !== JSON.stringify(esperado)) {
      error('ENTRADAS_ZIP_DISTINTAS', `Las entradas del ZIP no son las 12 del contrato en su orden (leídas: ${nombresZip.join(', ') || 'ninguna'})`);
    }
    const hashes = manifest.hashes ?? {};
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
      if (!(esperado as readonly string[]).includes(nombre)) {
        error('HASH_DE_ENTRADA_INESPERADA', `El manifiesto declara hash de una entrada no contractual: '${nombre}'`);
      }
    }
    // El informe debe citar el mismo paqueteId que el manifiesto.
    const informe = textoDe('informe.txt');
    if (informe !== null && manifest.paqueteId !== undefined && !informe.includes(manifest.paqueteId)) {
      error('INFORME_PAQUETE_ID_DISTINTO', 'informe.txt no cita el paqueteId del manifiesto');
    }
  }

  // 3) CSV: cabeceras, conteos y libro (recálculo completo en céntimos).
  const csvs = new Map<string, { cabecera: string[]; filas: FilaCsv[] }>();
  for (const nombre of ENTRADAS_ESPERADAS) {
    if (!nombre.endsWith('.csv')) continue;
    const txt = textoDe(nombre);
    if (txt === null) continue; // ya error si falta
    const parsed = parsearCsv(txt);
    if (parsed === null) {
      error('CSV_ILEGIBLE', `'${nombre}' no es parseable como CSV`, { entrada: nombre });
      continue;
    }
    csvs.set(nombre, parsed);
  }
  const libro = csvs.get('libro-ingresos-gastos.csv');
  const incidenciasTxt = textoDe('incidencias.json');
  let incidencias: IncidenciaPaqueteAsesor[] = [];
  if (incidenciasTxt !== null) {
    try {
      const parsed = JSON.parse(incidenciasTxt) as unknown;
      if (Array.isArray(parsed)) incidencias = parsed as IncidenciaPaqueteAsesor[];
      else error('INCIDENCIAS_ILEGIBLES', 'incidencias.json no es un array');
    } catch (e) {
      error('INCIDENCIAS_ILEGIBLES', `incidencias.json no es JSON válido (${e instanceof Error ? e.message : 'error'})`);
    }
  }
  /** ¿Existe incidencia identificadora para una entidad? (código + id) */
  const hayIncidencia = (codigo: string | RegExp, id: string): boolean =>
    incidencias.some((i) => (typeof codigo === 'string' ? i.codigo === codigo : codigo.test(i.codigo)) && i.id === id);

  const recalc = totalesVacios();
  let lineasLibro = 0;
  let baseIvaRetencionCent: { base: number; iva: number; retencion: number }[] = [];
  if (libro) {
    lineasLibro = libro.filas.length;
    const esperada = ['fecha', 'ejercicio', 'tipo', 'concepto', 'inmuebleId', 'inmuebleDireccion', 'contraparte', 'base', 'iva', 'retencion', 'total', 'categoria', 'deducible', 'origenDeducibilidad', 'fuenteTipo', 'fuenteId', 'documentoNombre', 'desgloseFiscal'];
    if (JSON.stringify(libro.cabecera) !== JSON.stringify(esperada)) {
      error('CABECERA_LIBRO_DISTINTA', `La cabecera del libro no es la del contrato (${libro.cabecera.join('|')})`, { entrada: 'libro-ingresos-gastos.csv' });
    }
    for (const fila of libro.filas) {
      const id = fila.fuenteId ?? '';
      if (!RE_FECHA_ISO_V.test(fila.fecha ?? '')) {
        error('LINEA_FECHA_INVALIDA', `Línea (${fila.fuenteTipo} ${id}) con fecha '${fila.fecha}' no ISO`, { entrada: 'libro-ingresos-gastos.csv', id });
        continue;
      }
      const cent = centimosDeTexto(fila.total ?? '');
      if (cent === null) {
        error('LINEA_TOTAL_INVALIDO', `Línea (${fila.fuenteTipo} ${id}) con total '${fila.total}' ilegible en céntimos`, { entrada: 'libro-ingresos-gastos.csv', id });
        continue;
      }
      if (fila.tipo !== 'INGRESO' && fila.tipo !== 'GASTO') {
        error('LINEA_TIPO_INVALIDO', `Línea (${fila.fuenteTipo} ${id}) con tipo '${fila.tipo}'`, { entrada: 'libro-ingresos-gastos.csv', id });
        continue;
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
    if (baseIvaRetencionCent.length === 0) baseIvaRetencionCent = [];
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
    for (const v of manifest.verificaciones ?? []) {
      if (v.ok !== true) {
        error('VERIFICACION_DECLARADA_FALLIDA', `El propio manifiesto declara fallida la verificación '${v.nombre}' (esperado ${v.esperado} / obtenido ${v.obtenido})`);
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
    cotejarTotales(manifest.totales, 'manifest.totales');
    const totalesTexto = textoDe('totales.json');
    if (totalesTexto !== null) {
      try {
        // Formato contractual: { totales, verificaciones }.
        const parsed = JSON.parse(totalesTexto) as { totales?: TotalesPaqueteAsesor };
        if (parsed.totales === undefined) {
          error('TOTALES_ILEGIBLES', 'totales.json no contiene la clave "totales"');
        } else {
          cotejarTotales(parsed.totales, 'totales.json');
        }
      } catch (e) {
        error('TOTALES_ILEGIBLES', `totales.json no es JSON válido (${e instanceof Error ? e.message : 'error'})`);
      }
    }
    // Neto de liquidaciones: informativo pero también recalculable.
    const liqs = csvs.get('datos/liquidaciones.csv');
    if (liqs && liqs.cabecera.includes('netoPropietario')) {
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
    const lineasIngresoPorId = new Map<string, number[]>();
    const lineasGastoPorId = new Map<string, number[]>();
    for (const fila of libro.filas) {
      const cent = centimosDeTexto(fila.total ?? '');
      if (cent === null || !RE_FECHA_ISO_V.test(fila.fecha ?? '')) continue;
      const mapa = fila.fuenteTipo === 'COBRO' ? lineasIngresoPorId : lineasGastoPorId;
      const arr = mapa.get(fila.fuenteId) ?? [];
      arr.push(cent);
      mapa.set(fila.fuenteId, arr);
    }
    const agruparPorId = (filas: FilaCsv[]): Map<string, FilaCsv[]> => {
      const m = new Map<string, FilaCsv[]>();
      for (const f of filas) {
        const arr = m.get(f.id) ?? [];
        arr.push(f);
        m.set(f.id, arr);
      }
      return m;
    };
    // Cobros: computable ⇔ no ANULADO/IMPAGADO, importe>0, fecha válida.
    for (const [id, filasId] of agruparPorId(cobros.filas)) {
      if (filasId.length > 1
        && !hayIncidencia(/COBRO_(DUPLICADO_EXACTO|ID_CONFLICTIVO)/, id)) {
        error('DISCREPANCIA_NO_IDENTIFICADA', `El cobro ${id} aparece ${filasId.length} veces en datos/cobros.csv sin incidencia de duplicado`, { entrada: 'datos/cobros.csv', id });
      }
      const centEsperado: number[] = [];
      for (const f of filasId) {
        if (f.estado === 'ANULADO' || f.estado === 'IMPAGADO') continue;
        const cent = centimosDeTexto(f.importeRecibido ?? '');
        if (cent === null || cent <= 0) continue;
        const fecha = RE_FECHA_ISO_V.test(f.fechaPago ?? '') ? f.fechaPago
          : RE_FECHA_ISO_V.test(f.fechaVencimiento ?? '') ? f.fechaVencimiento : '';
        if (!fecha) continue;
        centEsperado.push(cent);
      }
      const centLibro = lineasIngresoPorId.get(id) ?? [];
      const sumaEsperada = centEsperado.reduce((s, c) => s + c, 0);
      const sumaLibro = centLibro.reduce((s, c) => s + c, 0);
      if (sumaEsperada !== sumaLibro) {
        const explicado = hayIncidencia(/COBRO_(DUPLICADO_EXACTO|ID_CONFLICTIVO)/, id)
          && (sumaLibro === 0 // conflictivo: ninguna computa
            || (centEsperado.length > 0 && centLibro.length === 1
              && centEsperado.every((c) => c === centLibro[0]))); // exacto: 1 sola
        if (!explicado) {
          error('CUADRE_COBRO_DISTINTO_LIBRO', `Cobro ${id}: fuentes computables suman ${eurosDeCentimos(sumaEsperada)} pero el libro trae ${centLibro.length} línea(s) por ${eurosDeCentimos(sumaLibro)}`, { entrada: 'datos/cobros.csv', id });
        }
      }
    }
    for (const id of lineasIngresoPorId.keys()) {
      if (!agruparPorId(cobros.filas).has(id)) {
        error('LINEA_INGRESO_SIN_FUENTE', `El libro trae una línea de ingreso del cobro ${id}, ausente de datos/cobros.csv`, { entrada: 'libro-ingresos-gastos.csv', id });
      }
    }
    // Gastos: computable ⇔ no ANULADO, importe válido, fecha devengo/pago.
    // (El alias `fecha` del ERP no viaja en el CSV v1 — ver cabecera.)
    for (const [id, filasId] of agruparPorId(gastos.filas)) {
      if (filasId.length > 1
        && !hayIncidencia(/GASTO_(DUPLICADO_EXACTO|ID_CONFLICTIVO)/, id)) {
        error('DISCREPANCIA_NO_IDENTIFICADA', `El gasto ${id} aparece ${filasId.length} veces en datos/gastos.csv sin incidencia de duplicado`, { entrada: 'datos/gastos.csv', id });
      }
      const centEsperado: number[] = [];
      let requiereAlias = false;
      for (const f of filasId) {
        if (f.estado === 'ANULADO') continue;
        const cent = centimosDeTexto(f.importe ?? '');
        if (cent === null) continue;
        const fecha = RE_FECHA_ISO_V.test(f.fechaDevengo ?? '') ? f.fechaDevengo
          : RE_FECHA_ISO_V.test(f.fechaPago ?? '') ? f.fechaPago : '';
        if (!fecha) { requiereAlias = true; continue; }
        centEsperado.push(cent);
      }
      const centLibro = lineasGastoPorId.get(id) ?? [];
      const sumaEsperada = centEsperado.reduce((s, c) => s + c, 0);
      const sumaLibro = centLibro.reduce((s, c) => s + c, 0);
      if (sumaEsperada !== sumaLibro) {
        const explicadoPorDuplicado = hayIncidencia(/GASTO_(DUPLICADO_EXACTO|ID_CONFLICTIVO)/, id)
          && (sumaLibro === 0
            || (centEsperado.length > 0 && centLibro.length === 1
              && centEsperado.every((c) => c === centLibro[0])));
        if (!explicadoPorDuplicado) {
          if (requiereAlias) {
            advertencia('GASTO_ALIAS_FECHA_NO_SERIALIZADO', `Gasto ${id}: su cuadre puede depender del alias 'fecha' que el CSV v1 no serializa (libro ${eurosDeCentimos(sumaLibro)} vs fuentes con fecha ${eurosDeCentimos(sumaEsperada)}); no re-derivable al céntimo desde el paquete`, { entrada: 'datos/gastos.csv', id });
          } else {
            error('CUADRE_GASTO_DISTINTO_LIBRO', `Gasto ${id}: fuentes computables suman ${eurosDeCentimos(sumaEsperada)} pero el libro trae ${centLibro.length} línea(s) por ${eurosDeCentimos(sumaLibro)}`, { entrada: 'datos/gastos.csv', id });
          }
        }
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
