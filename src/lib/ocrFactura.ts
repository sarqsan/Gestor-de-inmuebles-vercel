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

function capturar(texto: string, patron: RegExp, normalizador = (s: string) => s.trim()): CampoReconocidoOcr {
  const coincidencia = patron.exec(texto);
  if (!coincidencia?.[1]) return campoVacio();
  const valor = normalizador(coincidencia[1]);
  return { valor, textoOrigen: coincidencia[0].trim(), estado: valor ? 'RECONOCIDO' : 'DUDOSO' };
}

function buscarImporte(texto: string, patron: RegExp): CampoReconocidoOcr {
  return capturar(texto, patron, (s) => s.replace(/\s/g, '').replace(/€/g, '').trim());
}

/**
 * Parser conservador para etiquetas habituales de facturas españolas.
 * No completa por aritmética ni infiere datos que no aparecen en el OCR.
 */
export function extraerCamposFactura(textoOcr: string, confianzaOcr = 100): CamposFacturaOcr {
  const texto = textoOcr.replace(/\r/g, '\n');
  const proveedorEtiquetado = capturar(texto, /(?:raz[oó]n\s+social|proveedor|emisor|empresa)\s*[:\-]?\s*([^\n]{2,100})/i);
  const primeraLinea = texto.split('\n').map((linea) => linea.trim()).find((linea) => linea.length >= 3 && linea.length <= 100);
  const proveedorCabecera = primeraLinea && /\b(?:S\.?\s?L\.?\s?U?\.?|S\.?\s?A\.?|S\.?\s?C\.?|SOCIEDAD|AUTONOMO|AUTÓNOMO)\b/i.test(primeraLinea)
    ? { valor: primeraLinea, textoOrigen: primeraLinea, estado: 'DUDOSO' as const }
    : campoVacio();
  const importeIvaEtiqueta = buscarImporte(texto, /(?:cuota\s*(?:de\s*)?IVA|importe\s*IVA)\s*[:\-]?\s*([\d.,\s]+\s*€?)/i);
  const importeIvaConTipo = importeIvaEtiqueta.estado === 'AUSENTE'
    ? buscarImporte(texto, /IVA\s*\d{1,2}(?:[.,]\d{1,2})?\s*%\s*[:\-]?\s*([\d.,]+\s*€?)/i)
    : importeIvaEtiqueta;
  const campos: CamposFacturaOcr = {
    proveedor: proveedorEtiquetado.estado === 'AUSENTE' ? proveedorCabecera : proveedorEtiquetado,
    nifProveedor: capturar(texto, /(?:NIF|CIF|VAT\s*(?:ID)?|N\.I\.F\.?|C\.I\.F\.?)\s*[:\-]?\s*([A-Z0-9][A-Z0-9 .-]{5,18})/i, (s) => s.replace(/\s+/g, '').replace(/[.,;]+$/, '').toUpperCase()),
    numeroFactura: capturar(texto, /(?:n[uú]m(?:ero)?\.?\s*(?:de\s*)?factura|factura\s*(?:n[uú]m(?:ero)?\.?|#|n[ºo°]))\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/-]{1,39})/i),
    fechaEmision: capturar(texto, /(?:fecha\s*(?:de\s*)?(?:emisi[oó]n|factura)|fecha)\s*[:\-]?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})/i, normalizarFecha),
    baseImponible: buscarImporte(texto, /(?:base\s*imponible|base\s*imponible\s*total)\s*[:\-]?\s*([\d.,\s]+\s*€?)/i),
    tipoIva: capturar(texto, /(?:IVA|I\.V\.A\.)\s*(?:\(?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*\)?)?/i, (s) => s.replace(',', '.')),
    importeIva: importeIvaConTipo,
    otrosImpuestos: buscarImporte(texto, /(?:otros\s+impuestos|retenci[oó]n|IRPF)\s*[:\-]?\s*([\d.,\s]+\s*€?)/i),
    importeTotal: buscarImporte(texto, /(?:total\s+(?:factura|a\s+pagar|importe)|importe\s+total|total)\s*[:\-]?\s*([\d.,\s]+\s*€?)/i),
    concepto: capturar(texto, /(?:concepto|descripci[oó]n|detalle)\s*[:\-]?\s*([^\n]{2,200})/i),
  };
  if (campos.fechaEmision.valor && !/^\d{4}-\d{2}-\d{2}$/.test(campos.fechaEmision.valor)) campos.fechaEmision.estado = 'DUDOSO';
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

export function claveFacturaOcr(campos: Pick<CamposFacturaOcr, 'nifProveedor' | 'numeroFactura'>, sha256: string): string {
  const nif = normalizar(campos.nifProveedor.valor).replace(/[^a-z0-9]/g, '');
  const numero = normalizar(campos.numeroFactura.valor).replace(/[^a-z0-9]/g, '');
  return nif && numero ? `factura:${nif}:${numero}` : `documento:${sha256.toLowerCase()}`;
}

export interface TextoOcrDocumento { texto: string; confianza: number; }

/** OCR local en el navegador. El archivo nunca se envía a un proveedor de IA. */
export async function reconocerDocumentoLocal(file: File, alProgreso?: (progreso: number) => void): Promise<TextoOcrDocumento> {
  const error = esArchivoOcrAdmitido(file);
  if (error) throw new Error(error);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeReal = detectarMime(bytes);
  if (mimeReal !== file.type && !(file.type === '' && mimeReal)) throw new Error('El contenido real del archivo no coincide con el formato declarado.');
  if (!mimeReal) throw new Error('No se reconoce el contenido del archivo. El documento puede estar dañado o tener un formato distinto.');

  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('spa', undefined, {
    logger: (event) => { if (event.status === 'recognizing text') alProgreso?.(Math.round(event.progress * 100)); },
    // Sólo se descargan el worker/WASM y el modelo lingüístico. El archivo se
    // procesa localmente; ni el documento ni el texto se transmiten.
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  });
  try {
    const paginas = mimeReal === 'application/pdf' ? await renderizarPaginasPdf(file) : [file];
    if (paginas.length > 5) throw new Error('El PDF supera el límite de 5 páginas por procesamiento. Divide el documento e inténtalo de nuevo.');
    const textos: string[] = [];
    const confianzas: number[] = [];
    for (let i = 0; i < paginas.length; i++) {
      const resultado = await worker.recognize(paginas[i]);
      textos.push(resultado.data.text || '');
      confianzas.push(Number(resultado.data.confidence) || 0);
      alProgreso?.(Math.round(((i + 1) / paginas.length) * 100));
    }
    const texto = textos.join('\n');
    if (texto.replace(/\s/g, '').length < 8) throw new Error('No se pudo leer texto suficiente. Comprueba que la factura sea legible y vuelve a intentarlo.');
    return { texto, confianza: Math.round(confianzas.reduce((a, b) => a + b, 0) / confianzas.length) };
  } finally {
    await worker.terminate();
  }
}

function detectarMime(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-') return 'application/pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && new TextDecoder().decode(bytes.slice(1, 4)) === 'PNG') return 'image/png';
  if (new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
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
