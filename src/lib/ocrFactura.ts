export type CampoFacturaOcr = 'proveedor' | 'nifProveedor' | 'numeroFactura' | 'fechaEmision' | 'baseImponible' | 'tipoIva' | 'importeIva' | 'otrosImpuestos' | 'importeTotal' | 'concepto';
export type EstadoCampoOcr = 'RECONOCIDO' | 'DUDOSO' | 'AUSENTE';
export interface CampoReconocidoOcr {
  valor: string;
  textoOrigen?: string;
  estado: EstadoCampoOcr;
}
export type CamposFacturaOcr = Record<CampoFacturaOcr, CampoReconocidoOcr>;

const campoVacio = (): CampoReconocidoOcr => ({ valor: '', estado: 'AUSENTE' });
const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-ES');

/**
 * Importe en la MISMA línea que su etiqueta (P5.2-B): exige dígitos y no
 * admite saltos de línea ni espacios internos, para no concatenar cifras de
 * líneas consecutivas (`100,00` + `21`) ni casar solo espacios. Acepta
 * `1.234,56`, `121,00`, `121.00`, `121` y signo (abonos).
 */
const IMPORTE = String.raw`(-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|-?\d+,\d{1,2}|-?\d+\.\d{1,2}|-?\d+)`;
/** Separador etiqueta→valor solo horizontal (nunca cruza de línea). */
const SEP = String.raw`[^\S\n]*[:\-]?[^\S\n]*`;

function capturar(texto: string, patron: RegExp, normalizador = (s: string) => s.trim()): CampoReconocidoOcr {
  const coincidencia = patron.exec(texto);
  if (!coincidencia?.[1]) return campoVacio();
  const valor = normalizador(coincidencia[1]);
  return { valor, textoOrigen: coincidencia[0].trim(), estado: valor ? 'RECONOCIDO' : 'DUDOSO' };
}

/** Prueba los patrones en orden de prioridad (no de aparición en el texto). */
function capturarPrimero(texto: string, patrones: RegExp[], normalizador = (s: string) => s.trim()): CampoReconocidoOcr {
  for (const patron of patrones) {
    const campo = capturar(texto, patron, normalizador);
    if (campo.estado !== 'AUSENTE') return campo;
  }
  return campoVacio();
}

function buscarImporte(texto: string, patron: RegExp): CampoReconocidoOcr {
  return capturar(texto, patron, (s) => s.replace(/\s/g, '').replace(/€/g, '').trim());
}

function buscarImportePrioritario(texto: string, patrones: RegExp[]): CampoReconocidoOcr {
  return capturarPrimero(texto, patrones, (s) => s.replace(/\s/g, '').replace(/€/g, '').trim());
}

const recortarProveedor = (s: string) => s.split(/[^\S\n]+(?:C\.?I\.?F\.?|N\.?I\.?F\.?|VAT)\b/i)[0].trim();

/** Tipo de IVA: primera ocurrencia CON porcentaje (también «21% IVA»). */
function buscarTipoIva(texto: string): CampoReconocidoOcr {
  const directo = /(?:IVA|I\.V\.A\.)[^\S\n]*\(?[^\S\n]*(\d{1,2}(?:[.,]\d{1,2})?)[^\S\n]*%/gi;
  const directoMatch = directo.exec(texto);
  if (directoMatch?.[1]) {
    return { valor: directoMatch[1].replace(',', '.'), textoOrigen: directoMatch[0].trim(), estado: 'RECONOCIDO' };
  }
  const inverso = /(\d{1,2}(?:[.,]\d{1,2})?)[^\S\n]*%[^\S\n]*(?:de[^\S\n]+)?(?:IVA|I\.V\.A\.)/gi;
  const inversoMatch = inverso.exec(texto);
  if (inversoMatch?.[1]) {
    return { valor: inversoMatch[1].replace(',', '.'), textoOrigen: inversoMatch[0].trim(), estado: 'RECONOCIDO' };
  }
  return campoVacio();
}

// --- NIF/CIF del emisor (P5.2-B) -------------------------------------------

/** Formatos fiscales españoles de 9 caracteres: CIF, DNI o NIE. */
const NIF_ESTRICTO = String.raw`(?:[ABCDEFGHJKLMNPQRSUVW][ -]?\d{7}[ -]?[0-9A-J]|\d{8}[ -]?[A-Z]|[XYZ]\d{7}[ -]?[A-Z])`;
const normalizarNif = (s: string) => s.replace(/[\s.-]+/g, '').toUpperCase();

function controlDniValido(nif: string): boolean {
  const letras = 'TRWAGMYFPDXBNJZSQVHLCKE';
  const numero = nif.startsWith('X') ? `0${nif.slice(1, 8)}`
    : nif.startsWith('Y') ? `1${nif.slice(1, 8)}`
      : nif.startsWith('Z') ? `2${nif.slice(1, 8)}`
        : nif.slice(0, 8);
  if (!/^\d{8}$/.test(numero)) return false;
  return letras[Number(numero) % 23] === nif.charAt(8);
}

function controlCifValido(cif: string): boolean {
  const digitos = cif.slice(1, 8);
  if (!/^\d{7}$/.test(digitos)) return false;
  let suma = 0;
  for (let i = 0; i < 7; i++) {
    const d = Number(digitos.charAt(i));
    if (i % 2 === 0) {
      const doble = d * 2;
      suma += doble > 9 ? doble - 9 : doble;
    } else {
      suma += d;
    }
  }
  const unidad = (10 - (suma % 10)) % 10;
  const controlNumero = String(unidad);
  const controlLetra = 'JABCDEFGHI'.charAt(unidad);
  const inicial = cif.charAt(0);
  const control = cif.charAt(8);
  if ('PQRSW'.includes(inicial)) return control === controlLetra;
  if ('ABEH'.includes(inicial)) return control === controlNumero;
  return control === controlNumero || control === controlLetra;
}

function controlNifValido(valor: string): boolean {
  if (/^[XYZ]\d{7}[A-Z]$/.test(valor) || /^\d{8}[A-Z]$/.test(valor)) return controlDniValido(valor);
  if (/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]$/.test(valor)) return controlCifValido(valor);
  return false;
}

interface CandidatoNif { valor: string; textoOrigen: string; contexto: 'EMISOR' | 'CLIENTE' | 'NEUTRO'; }

/**
 * NIF del EMISOR (P5.2-B): recoge todas las ocurrencias etiquetadas con
 * formato estricto, las clasifica por el contexto cercano (emisor/cliente)
 * y solo marca RECONOCIDO una elección no ambigua con dígito de control
 * válido. Lo demás queda DUDOSO (sin confirmar) o AUSENTE; nunca captura
 * texto contiguo a la misma línea.
 */
function buscarNifEmisor(texto: string): CampoReconocidoOcr {
  const etiquetado = new RegExp(String.raw`(?<![A-Z0-9])(?:N\.?I\.?F\.?|C\.?I\.?F\.?|VAT(?:[^\S\n]*ID)?)${SEP}(${NIF_ESTRICTO})(?![A-Z0-9])`, 'gi');
  const candidatos: CandidatoNif[] = [];
  for (const m of texto.matchAll(etiquetado)) {
    const anterior = normalizar(texto.slice(Math.max(0, (m.index || 0) - 90), m.index || 0));
    // Manda la etiqueta de sección MÁS CERCANA al NIF (una factura suele
    // encadenar bloque de cliente y bloque de emisor en la misma ventana).
    const ultimoIndice = (patron: RegExp) => {
      let ultimo = -1;
      for (const c of anterior.matchAll(patron)) ultimo = Math.max(ultimo, c.index || 0);
      return ultimo;
    };
    const idxCliente = ultimoIndice(/(cliente|destinatario|facturar a|comprador|arrendatario|inquilino)/g);
    const idxEmisor = ultimoIndice(/(emisor|proveedor|razon social|empresa|vendedor|expedido por)/g);
    const contexto: CandidatoNif['contexto'] = idxCliente === -1 && idxEmisor === -1
      ? 'NEUTRO'
      : idxEmisor > idxCliente ? 'EMISOR' : 'CLIENTE';
    candidatos.push({ valor: normalizarNif(m[1]), textoOrigen: m[0].trim(), contexto });
  }
  if (candidatos.length === 0) {
    // Respaldo conservador: token único etiquetado sin espacios internos.
    const suelto = new RegExp(String.raw`(?<![A-Z0-9])(?:N\.?I\.?F\.?|C\.?I\.?F\.?|VAT(?:[^\S\n]*ID)?)${SEP}([A-Z0-9][A-Z0-9.-]{5,13})(?![A-Z0-9])`, 'i');
    const m = suelto.exec(texto);
    if (!m?.[1]) return campoVacio();
    return { valor: normalizarNif(m[1]), textoOrigen: m[0].trim(), estado: 'DUDOSO' };
  }
  const distintos = [...new Map(candidatos.map((c) => [c.valor, c])).values()];
  const emisores = distintos.filter((c) => c.contexto === 'EMISOR');
  let elegido: CandidatoNif;
  let ambiguo = false;
  if (emisores.length === 1) {
    elegido = emisores[0];
  } else if (emisores.length > 1) {
    elegido = emisores[0]; ambiguo = true;
  } else if (distintos.length === 1) {
    elegido = distintos[0];
  } else {
    elegido = distintos.find((c) => c.contexto !== 'CLIENTE') || distintos[0];
    ambiguo = true;
  }
  const estado: EstadoCampoOcr = !ambiguo && controlNifValido(elegido.valor) ? 'RECONOCIDO' : 'DUDOSO';
  return { valor: elegido.valor, textoOrigen: elegido.textoOrigen, estado };
}

/**
 * Parser conservador para etiquetas habituales de facturas españolas.
 * No completa por aritmética ni infiere datos que no aparecen en el OCR.
 * P5.2-B: «Subtotal» ya no casa como total; los importes no cruzan líneas;
 * el NIF es el del emisor con formato/control, o queda DUDOSO.
 */
export function extraerCamposFactura(textoOcr: string, confianzaOcr = 100): CamposFacturaOcr {
  const texto = textoOcr.replace(/\r/g, '\n');
  const proveedorEtiquetado = capturar(texto, /(?:razón\s+social|razon\s+social|proveedor|emisor|empresa)\s*[:\-]?\s*([^\n]{2,100})/i, recortarProveedor);
  const primeraLinea = texto.split('\n').map((linea) => linea.trim()).find((linea) => linea.length >= 3 && linea.length <= 100);
  const proveedorCabecera = primeraLinea && /\b(?:S\.?\s?L\.?\s?U?\.?|S\.?\s?A\.?|S\.?\s?C\.?|SOCIEDAD|AUTONOMO|AUTÓNOMO)\b/i.test(primeraLinea)
    ? { valor: recortarProveedor(primeraLinea), textoOrigen: primeraLinea, estado: 'DUDOSO' as const }
    : campoVacio();
  const importeIva = buscarImportePrioritario(texto, [
    new RegExp(String.raw`(?:cuota[^\S\n]+(?:de[^\S\n]+)?IVA|importe[^\S\n]+IVA|IVA[^\S\n]+(?:a[^\S\n]+)?pagar)${SEP}${IMPORTE}[^\S\n]*€?`, 'i'),
    new RegExp(String.raw`IVA[^\S\n]*\d{1,2}(?:[.,]\d{1,2})?[^\S\n]*%${SEP}${IMPORTE}[^\S\n]*€?`, 'i'),
    new RegExp(String.raw`\d{1,2}(?:[.,]\d{1,2})?[^\S\n]*%[^\S\n]*(?:de[^\S\n]+)?IVA${SEP}${IMPORTE}[^\S\n]*€?`, 'i'),
  ]);
  // Total: primero las etiquetas fuertes en todo el documento; el genérico
  // exige frontera de palabra (excluye «Subtotal») y no ser total parcial.
  const importeTotal = buscarImportePrioritario(texto, [
    new RegExp(String.raw`(?:total[^\S\n]+(?:factura|a[^\S\n]+pagar|importe|general)|importe[^\S\n]+total|total[^\S\n]+con[^\S\n]+IVA)${SEP}${IMPORTE}[^\S\n]*€?`, 'i'),
    new RegExp(String.raw`\btotal\b(?![^\S\n]+(?:l[ií]neas?|parcial|neto|bruto|sin\b))${SEP}${IMPORTE}[^\S\n]*€?`, 'i'),
  ]);
  const fechaEmision = capturarPrimero(texto, [
    /(?:fecha\s*(?:de\s*)?(?:emisión|emision|expedición|expedicion|factura)|f\.?\s*emisi(?:ón|on))\s*[:\-]?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})/i,
    /fecha\s*[:\-]?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})/i,
  ], normalizarFecha);
  const campos: CamposFacturaOcr = {
    proveedor: proveedorEtiquetado.estado === 'AUSENTE' ? proveedorCabecera : proveedorEtiquetado,
    nifProveedor: buscarNifEmisor(texto),
    numeroFactura: capturar(texto, /(?:n[uú]m(?:ero)?\.?\s*(?:de\s*)?factura|factura\s*(?:n[uú]m(?:ero)?\.?|#|n[ºo°]))\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/-]{1,39})/i),
    fechaEmision,
    baseImponible: buscarImporte(texto, new RegExp(String.raw`base[^\S\n]+imponible(?:[^\S\n]+total)?${SEP}${IMPORTE}[^\S\n]*€?`, 'i')),
    tipoIva: buscarTipoIva(texto),
    importeIva,
    otrosImpuestos: buscarImporte(texto, new RegExp(String.raw`(?:otros[^\S\n]+impuestos|retenci[oó]n|IRPF)${SEP}${IMPORTE}[^\S\n]*€?`, 'i')),
    importeTotal,
    concepto: capturar(texto, /(?:concepto|descripción|descripcion|detalle)\s*[:\-]?\s*([^\n]{2,200})/i),
  };
  if (campos.fechaEmision.valor && !/^\d{4}-\d{2}-\d{2}$/.test(campos.fechaEmision.valor)) campos.fechaEmision.estado = 'DUDOSO';
  // Un total negativo (abono/rectificativa) jamás se presenta como fiable:
  // la capa de UI lo trata expresamente y no crea gasto en negativo.
  if (campos.importeTotal.valor.startsWith('-')) campos.importeTotal.estado = 'DUDOSO';
  if (confianzaOcr < 65) {
    for (const campo of Object.values(campos)) if (campo.estado === 'RECONOCIDO') campo.estado = 'DUDOSO';
  }
  return campos;
}

function normalizarFecha(fecha: string): string {
  const partes = fecha.split(/[/.\-]/);
  if (partes.length !== 3) return fecha;
  let [dia, mes, anio] = partes;
  if (anio.length === 2) anio = Number(anio) > 50 ? `19${anio}` : `20${anio}`;
  const iso = `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  const fechaReal = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(fechaReal.getTime()) && fechaReal.toISOString().slice(0, 10) === iso ? iso : fecha;
}

export function esArchivoOcrAdmitido(file: Pick<File, 'type' | 'name' | 'size'>): string | undefined {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const tiposPorExtension: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const mime = file.type || tiposPorExtension[extension || ''] || '';
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mime)) return 'Formato no compatible. Selecciona un PDF, JPG, PNG o WEBP.';
  if (tiposPorExtension[extension || ''] !== mime) return 'La extensión y el tipo declarado del archivo no coinciden.';
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > 20 * 1024 * 1024) return 'El archivo debe ocupar entre 1 byte y 20 MB.';
  return undefined;
}

export async function huellaFacturaOcr(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('El navegador no permite calcular la huella de integridad del documento.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Clave de deduplicación. P5.2-C: cuando se conoce el inmueble, la clave lo
 * incluye (`factura:{inmuebleId}:{nif}:{número}`) para que la misma factura
 * en inmuebles distintos no comparta identidad. Sin inmueble se conserva el
 * formato legado P5, que la detección sigue reconociendo en gastos antiguos.
 */
export function claveFacturaOcr(campos: Pick<CamposFacturaOcr, 'nifProveedor' | 'numeroFactura'>, sha256: string, inmuebleId?: string): string {
  const nif = normalizar(campos.nifProveedor.valor).replace(/[^a-z0-9]/g, '');
  const numero = normalizar(campos.numeroFactura.valor).replace(/[^a-z0-9]/g, '');
  const ambito = inmuebleId?.trim() ? `${inmuebleId.trim()}:` : '';
  return nif && numero ? `factura:${ambito}${nif}:${numero}` : `documento:${ambito}${sha256.toLowerCase()}`;
}

export interface TextoOcrDocumento { texto: string; confianza: number; }

export interface OpcionesReconocerOcr {
  /** Señal de cancelación (botón cancelar / cierre del modal). */
  senal?: AbortSignal;
  /** Plazo máximo total en ms; por defecto `PLAZO_OCR_MS`. `0` lo desactiva (solo pruebas). */
  plazoMs?: number;
}

export const CODIGO_OCR_CANCELADO = 'OCR_CANCELADO';
export const CODIGO_OCR_TIEMPO_AGOTADO = 'OCR_TIEMPO_AGOTADO';
/** Plazo máximo por defecto del reconocimiento completo (descarga del motor incluida). */
export const PLAZO_OCR_MS = 120_000;

/**
 * Motor OCR remoto SOLO en código/modelo (P5.2-D): versiones fijadas en la
 * URL (nunca etiquetas flotantes). El documento y el texto nunca se envían
 * a la CDN; la integridad del código descargado es la limitación conocida
 * documentada (autoalojar es decisión de producto pendiente).
 */
export const MOTOR_OCR = {
  version: '7.0.0',
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',
  langPath: 'https://tessdata.projectnaptha.com/4.0.0',
} as const;

function errorOcr(codigo: string, mensaje: string): Error & { codigo: string } {
  return Object.assign(new Error(mensaje), { codigo });
}

export const esErrorOcrCancelado = (error: unknown): boolean => (error as { codigo?: string })?.codigo === CODIGO_OCR_CANCELADO;
export const esErrorOcrTiempoAgotado = (error: unknown): boolean => (error as { codigo?: string })?.codigo === CODIGO_OCR_TIEMPO_AGOTADO;

/** OCR local en el navegador. El archivo nunca se envía a un proveedor de IA. */
export async function reconocerDocumentoLocal(file: File, alProgreso?: (progreso: number) => void, opciones: OpcionesReconocerOcr = {}): Promise<TextoOcrDocumento> {
  const error = esArchivoOcrAdmitido(file);
  if (error) throw new Error(error);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeReal = detectarMime(bytes);
  if (mimeReal !== file.type && !(file.type === '' && mimeReal)) throw new Error('El contenido real del archivo no coincide con el formato declarado.');
  if (!mimeReal) throw new Error('No se reconoce el contenido del archivo. El documento puede estar dañado o tener un formato distinto.');

  const senal = opciones.senal;
  const plazo = opciones.plazoMs ?? PLAZO_OCR_MS;
  type TrabajadorOcr = { recognize: (entrada: File | Blob) => Promise<{ data: { text?: string; confidence?: number } }>; terminate: () => Promise<unknown> };
  let worker: TrabajadorOcr | undefined;
  let terminado = false;
  const terminar = async () => {
    if (worker && !terminado) {
      terminado = true;
      try { await worker.terminate(); } catch { /* best-effort */ }
    }
  };
  const errorCancelado = () => errorOcr(CODIGO_OCR_CANCELADO, 'Lectura cancelada. No se ha guardado nada.');

  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let alAbortar: (() => void) | undefined;
  const limite = new Promise<never>((_, reject) => {
    if (plazo > 0) {
      temporizador = setTimeout(() => reject(errorOcr(
        CODIGO_OCR_TIEMPO_AGOTADO,
        `La lectura ha superado el tiempo máximo (${Math.round(plazo / 1000)} s) y se ha detenido. Comprueba la conexión (la primera vez se descarga el motor) o usa un documento más ligero/legible. No se ha guardado nada.`
      )), plazo);
    }
    if (senal) {
      alAbortar = () => reject(errorCancelado());
      if (senal.aborted) reject(errorCancelado());
      else senal.addEventListener('abort', alAbortar, { once: true });
    }
  });

  const trabajo = (async (): Promise<TextoOcrDocumento> => {
    let createWorker: typeof import('tesseract.js')['createWorker'];
    try {
      ({ createWorker } = await import('tesseract.js'));
      worker = (await createWorker('spa', undefined, {
        logger: (event) => { if (event.status === 'recognizing text') alProgreso?.(Math.round(event.progress * 100)); },
        // Sólo se descargan el worker/WASM y el modelo lingüístico. El archivo se
        // procesa localmente; ni el documento ni el texto se transmiten.
        workerPath: MOTOR_OCR.workerPath,
        corePath: MOTOR_OCR.corePath,
        langPath: MOTOR_OCR.langPath,
      })) as unknown as TrabajadorOcr;
    } catch (e) {
      if (senal?.aborted) throw errorCancelado();
      throw new Error(`No se pudo iniciar el motor OCR local. Comprueba la conexión (la primera ejecución descarga el motor y el idioma) y vuelve a intentarlo. Detalle: ${e instanceof Error ? e.message : 'error desconocido'}`);
    }
    if (senal?.aborted) throw errorCancelado();
    const paginas = mimeReal === 'application/pdf' ? await renderizarPaginasPdf(file) : [file];
    if (paginas.length > 5) throw new Error('El PDF supera el límite de 5 páginas por procesamiento. Divide el documento e inténtalo de nuevo.');
    const textos: string[] = [];
    const confianzas: number[] = [];
    for (let i = 0; i < paginas.length; i++) {
      if (senal?.aborted) throw errorCancelado();
      const resultado = await worker.recognize(paginas[i]);
      textos.push(resultado.data.text || '');
      confianzas.push(Number(resultado.data.confidence) || 0);
      alProgreso?.(Math.round(((i + 1) / paginas.length) * 100));
    }
    const texto = textos.join('\n');
    if (texto.replace(/\s/g, '').length < 8) throw new Error('No se pudo leer texto suficiente. Comprueba que la factura sea legible y vuelve a intentarlo.');
    return { texto, confianza: Math.round(confianzas.reduce((a, b) => a + b, 0) / confianzas.length) };
  })();

  try {
    return await Promise.race([trabajo, limite]);
  } finally {
    if (temporizador) clearTimeout(temporizador);
    if (senal && alAbortar) senal.removeEventListener('abort', alAbortar);
    await terminar();
  }
}

function detectarMime(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-') return 'application/pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && new TextDecoder().decode(bytes.slice(1, 4)) === 'PNG') return 'image/png';
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return undefined;
}

async function renderizarPaginasPdf(file: File): Promise<Blob[]> {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const documento = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  if (documento.numPages > 5) { await documento.destroy(); throw new Error('El PDF supera el límite de 5 páginas por procesamiento. Divide el documento e inténtalo de nuevo.'); }
  const paginas: Blob[] = [];
  try {
    for (let n = 1; n <= documento.numPages; n++) {
      const pagina = await documento.getPage(n);
      const viewport = pagina.getViewport({ scale: Math.min(2, 1800 / pagina.getViewport({ scale: 1 }).width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const contexto = canvas.getContext('2d');
      if (!contexto) throw new Error('El navegador no pudo preparar una página para su lectura.');
      await pagina.render({ canvasContext: contexto, canvas, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('No se pudo representar una página del PDF.')), 'image/png'));
      paginas.push(blob);
      pagina.cleanup();
    }
  } finally { await documento.destroy(); }
  return paginas;
}
