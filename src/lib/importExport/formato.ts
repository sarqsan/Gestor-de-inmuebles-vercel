/**
 * Detección del formato de entrada del importador. Capa PURA (sin I/O).
 *
 * INCIDENCIA (JSON no aceptado / Android): el panel decidía el formato sólo por
 * la EXTENSIÓN del nombre y, si no la reconocía, miraba el primer carácter del
 * texto. En Android esto falla de dos formas:
 *  · el selector de archivos filtra por MIME (un `accept` con sólo extensiones
 *    deja fuera .json/.xlsx en según qué versiones de WebView), y
 *  · el documento elegido puede llegar sin extensión o con un nombre genérico
 *    (`documento`, `1719-2`, descargas de Drive/Gmail), caso en el que un
 *    .xlsx se clasificaba como CSV y fallaba el parseo.
 *
 * Por eso la detección es ahora por FIRMA (magic bytes) con la extensión como
 * pista secundaria: PK/OLE2 ⇒ XLSX, '{' o '[' ⇒ JSON, resto ⇒ CSV.
 * Nunca se guessea a ciegas: si no hay señal suficiente, se devuelve null y el
 * llamante lo informa (no se convierte un archivo incompatible en importación
 * vacía).
 */
import type { FormatoEntrada } from './contrato';

/** Firma ZIP (todo .xlsx real es un zip). */
const FIRMA_ZIP = [0x50, 0x4b] as const; // 'PK'
/** Firma OLE2 (Excel 97-2003, .xls binario). */
const FIRMA_OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;

/**
 * MIME + extensiones que el panel declara en el `<input type="file">`.
 * Se incluyen AMBOS (tipo MIME y extensión) porque en Android el selector
 * filtra por MIME y en escritorio por extensión.
 */
/** Extensiones admitidas por el importador (validadas tras la selección). */
export const EXTENSIONES_IMPORTACION = ['.json', '.xlsx', '.xls', '.csv'] as const;

/**
 * MIME + extensiones declarados en el `<input type="file">`.
 *
 * Se incluyen AMBOS porque en Android el selector del sistema filtra por MIME
 * y en escritorio por extensión. Los MIME genéricos son imprescindibles: un
 * `.json` descargado de Drive/Gmail llega muy a menudo como `text/plain` o
 * `application/octet-stream` y, si no se declaran, aparece en gris y no se
 * puede elegir (es exactamente la implementación que ya funciona en el Gestor
 * Patrimonial de referencia: IMPORT_ACCEPT).
 */
export const ACEPTAR_IMPORTACION = [
  ...EXTENSIONES_IMPORTACION,
  'application/json',
  'text/json',
  'text/plain',
  'text/csv',
  'application/octet-stream',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/excel',
].join(',');

/**
 * Valida la EXTENSIÓN del fichero ya seleccionado (el filtro del selector no es
 * fiable: en Android puede entregar documentos sin extensión o con nombre
 * genérico). Devuelve un mensaje claro o `null` si la extensión es admisible.
 *
 * Nota: la extensión NO decide el formato (eso lo hace la firma); esta
 * validación sólo evita intentar procesar formatos ajenos al importador y, si
 * la firma identifica el formato, se acepta incluso sin extensión.
 */
export function validarNombreFicheroImportacion(nombre: string, bytes?: Uint8Array): string | null {
  const extension = extensionDe(nombre);
  if ((EXTENSIONES_IMPORTACION as readonly string[]).includes(`.${extension}`)) return null;
  if (bytes && formatoPorFirma(bytes)) return null;
  const mostrada = extension === '' ? 'sin extensión' : `.${extension}`;
  return `Formato no admitido (${mostrada}). Selecciona un archivo JSON, XLSX, XLS o CSV.`;
}

export function esZip(bytes: Uint8Array): boolean {
  return bytes.length >= FIRMA_ZIP.length && FIRMA_ZIP.every((b, i) => bytes[i] === b);
}

export function esOle2(bytes: Uint8Array): boolean {
  return bytes.length >= FIRMA_OLE2.length && FIRMA_OLE2.every((b, i) => bytes[i] === b);
}

export function extensionDe(nombre: string): string {
  const limpio = nombre.trim().toLowerCase();
  const punto = limpio.lastIndexOf('.');
  return punto > 0 && punto < limpio.length - 1 ? limpio.slice(punto + 1) : '';
}

/** Formato por firma de los bytes (independiente del nombre). */
export function formatoPorFirma(bytes: Uint8Array): FormatoEntrada | null {
  if (esZip(bytes) || esOle2(bytes)) return 'XLSX';
  const inicio = new TextDecoder('utf-8').decode(bytes.slice(0, 2048)).trimStart();
  if (inicio.startsWith('{') || inicio.startsWith('[')) return 'JSON';
  // BOM UTF-8 seguido de '{'/'['
  if (inicio.charCodeAt(0) === 0xfeff) {
    const sinBom = inicio.slice(1).trimStart();
    if (sinBom.startsWith('{') || sinBom.startsWith('[')) return 'JSON';
  }
  return null;
}

/** Formato por extensión del nombre (pista secundaria). */
export function formatoPorExtension(nombre: string): FormatoEntrada | null {
  switch (extensionDe(nombre)) {
    case 'json': return 'JSON';
    case 'csv': case 'txt': case 'tsv': return 'CSV';
    case 'xlsx': case 'xlsm': case 'xls': return 'XLSX';
    default: return null;
  }
}

/**
 * Formato efectivo: la FIRMA manda, la extensión sólo decide cuando la firma
 * no distingue (CSV/JSON textuales comparten prefijo textual, pero JSON queda
 * resuelto por '{'/'['). Devuelve null si no hay señal bastante.
 */
export function detectarFormatoEntrada(nombre: string, bytes: Uint8Array): FormatoEntrada | null {
  if (bytes.length === 0) return null;
  const porFirma = formatoPorFirma(bytes);
  if (porFirma) return porFirma;
  const porExtension = formatoPorExtension(nombre);
  // Un archivo llamado .xlsx/.xls que NO es un contenedor ZIP/OLE2 no es un
  // libro: se clasifica por contenido en vez de forzar XLSX (el parser ya
  // informaría del error, pero así el mensaje apunta al formato real).
  if (porExtension && porExtension !== 'XLSX') return porExtension;
  const texto = new TextDecoder('utf-8').decode(bytes.slice(0, 4096));
  if (texto.includes(',') || texto.includes(';')) return 'CSV';
  // Último recurso: la extensión (p. ej. un .xlsx legítimo de 0 filas).
  return porExtension;
}

export interface EstructuraJson {
  tipo: 'array' | 'objeto' | 'sobre_propio' | 'otro';
  /** Claves de primer nivel cuando es objeto. */
  claves: string[];
  /** Ruta interna donde está la lista de registros (si se detecta). */
  rutaRegistros: readonly string[] | null;
  /** Nº de elementos de la lista detectada (null si no hay lista). */
  registros: number | null;
  /** Descripción legible para el mensaje de error. */
  descripcion: string;
  /**
   * Lista de MOVIMIENTOS (gastos/ingresos) del respaldo, si existe.
   *
   * Portado del Gestor Patrimonial de referencia: al elegir un archivo, si no
   * hay lista de inmuebles pero sí de movimientos, el mensaje debe decir
   * EXACTAMENTE qué contiene («lista de gastos/ingresos, no de inmuebles») en
   * lugar de un «objeto sin lista» genérico; y al importar entidades GASTO/COBRO
   * es ésta la lista que hay que leer.
   */
  listaMovimientos: { clave: string; ruta: readonly string[]; registros: number } | null;
}

/** Claves reales con listas de movimientos en respaldos (Gestor Patrimonial). */
const CLAVES_MOVIMIENTOS = ['expenses', 'gastos', 'ingresos', 'movimientos', 'transacciones', 'payments'] as const;

/**
 * Reconoce la estructura real de un JSON importable:
 *  · nuestro sobre de exportación (`__erpExport` + `records`);
 *  · objeto con la lista anidada (`records`, `data`, `items`, `filas`);
 *  · array de objetos en la raíz.
 * No rechaza por diferencias irrelevantes (orden de claves, clave `entityType`
 * ausente, envoltorio distinto) y nunca convierte un JSON incompatible en una
 * importación vacía: devuelve la descripción para informar del motivo.
 */
export function analizarEstructuraJson(raiz: unknown): EstructuraJson {
  const describir = (tipo: EstructuraJson['tipo'], descripcion: string, extra: Partial<EstructuraJson> = {}): EstructuraJson => ({
    tipo, claves: [], rutaRegistros: null, registros: null, descripcion, listaMovimientos: null, ...extra,
  });
  if (Array.isArray(raiz)) {
    const objetos = raiz.filter((x) => x !== null && typeof x === 'object' && !Array.isArray(x)).length;
    return describir('array', `array raíz con ${raiz.length} elemento(s) (${objetos} objeto(s))`, {
      rutaRegistros: [], registros: raiz.length,
    });
  }
  if (raiz !== null && typeof raiz === 'object') {
    const obj = raiz as Record<string, unknown>;
    const claves = Object.keys(obj);
    // Contenedores anidados habituales de un respaldo integral
    // (`data` / `portfolio` / `state`): se desciende un nivel para reconocer la
    // lista real en vez de declarar «objeto sin lista» (implementación portada
    // del Gestor Patrimonial de referencia: detectImportStructure).
    for (const contenedor of ['data', 'datos', 'portfolio', 'state', 'estado']) {
      const anidado = obj[contenedor];
      if (anidado !== null && typeof anidado === 'object' && !Array.isArray(anidado)) {
        const interna = analizarEstructuraJson(anidado);
        if (interna.registros !== null) {
          return {
            tipo: interna.tipo,
            claves,
            rutaRegistros: [contenedor, ...(interna.rutaRegistros ?? [])],
            registros: interna.registros,
            descripcion: `${interna.descripcion} (dentro de «${contenedor}»)`,
            listaMovimientos: interna.listaMovimientos
              ? { ...interna.listaMovimientos, ruta: [contenedor, ...interna.listaMovimientos.ruta] }
              : null,
          };
        }
      }
      if (Array.isArray(anidado) && anidado.length > 0) {
        return describir('objeto', `objeto con «${contenedor}» (${anidado.length} registro(s))`, {
          claves, rutaRegistros: [contenedor], registros: anidado.length,
        });
      }
    }
    const candidatas = ['records', 'registros', 'items', 'filas', 'inmuebles', 'propiedades', 'properties', 'data', 'datos', 'resultados'];
    for (const c of candidatas) {
      const v = obj[c];
      if (Array.isArray(v)) {
        const esSobre = typeof obj['__erpExport'] === 'object' && obj['__erpExport'] !== null;
        return describir(
          esSobre ? 'sobre_propio' : 'objeto',
          `${esSobre ? 'sobre de exportación propio' : 'objeto'} con «${c}» (${v.length} registro(s))`,
          { claves, rutaRegistros: [c], registros: v.length },
        );
      }
      if (v !== null && typeof v === 'object') {
        // Un nivel más de anidamiento (p. ej. { data: { inmuebles: [...] } }).
        for (const c2 of Object.keys(v as Record<string, unknown>)) {
          const v2 = (v as Record<string, unknown>)[c2];
          if (Array.isArray(v2)) {
            return describir('objeto', `objeto con «${c}.${c2}» (${v2.length} registro(s))`, {
              claves, rutaRegistros: [c, c2], registros: v2.length,
            });
          }
        }
      }
    }
    // Sin lista de inmuebles: ¿es un archivo de MOVIMIENTOS? (respaldo real).
    for (const clave of CLAVES_MOVIMIENTOS) {
      const v = obj[clave];
      if (Array.isArray(v) && v.length > 0) {
        return describir(
          'objeto',
          `objeto con «${clave}» (${v.length} movimiento(s)): es una lista de gastos/ingresos, no de inmuebles`,
          { claves, listaMovimientos: { clave, ruta: [clave], registros: v.length } },
        );
      }
    }
    return describir('objeto', `objeto sin lista de registros (claves: ${claves.slice(0, 8).join(', ') || 'ninguna'})`, { claves });
  }
  return describir('otro', `raíz de tipo ${raiz === null ? 'null' : typeof raiz} (se espera un array de objetos o un objeto con la lista)`);
}

/** Motivo concreto por el que un JSON no aporta registros (mensaje al usuario). */
export function motivoJsonSinRegistros(raiz: unknown): string {
  const e = analizarEstructuraJson(raiz);
  if (e.registros === 0) {
    return `el JSON es válido pero la lista «${e.rutaRegistros?.join('.') ?? 'raíz'}» está vacía (0 registros)`;
  }
  if (e.tipo === 'array') {
    return 'el array raíz no contiene ningún objeto (sólo valores sueltos: se espera un array de objetos, uno por fila)';
  }
  if (e.listaMovimientos) {
    // Mensaje concreto (portado del Gestor Patrimonial de referencia): el
    // archivo sí trae datos, pero de OTRA entidad. No se importa como inmuebles.
    return `el JSON contiene una lista de movimientos «${e.listaMovimientos.clave}» (${e.listaMovimientos.registros} registro(s)), no de inmuebles: importa ese archivo eligiendo la entidad GASTO/COBRO, o usa una plantilla de inmuebles`;
  }
  if (e.tipo === 'objeto' || e.tipo === 'sobre_propio') {
    return `no se encuentra la lista de registros (${e.descripcion}). Formatos admitidos: array de objetos, objeto con «records»/«registros»/«items»/«data», o un JSON exportado por la aplicación`;
  }
  return e.descripcion;
}
