/**
 * SEGURIDAD DEL SERVIDOR DE DOCUMENTOS (fallback propio del portal de candidatos
 * y de la revisión interna de pólizas) — endurecido el 2026-09-22 en la auditoría
 * de acceso a documentos y Storage.
 * -------------------------------------------------------------------------
 * `server.ts` guarda en memoria los documentos que el portal público recibe como
 * base64 y los sirve por `GET /api/documents/:fileId`. No toca Firestore ni
 * Firebase Storage, así que las reglas de seguridad NO lo protegen: su única
 * defensa es la opacidad del `fileId` y las cabeceras de la respuesta.
 *
 * Hallazgos que cierra este módulo (detalle en
 * `docs/AUDITORIA-SEGURIDAD-STORAGE-DOCUMENTOS-2026-09-22.md`):
 *  · S-1 · `Content-Type` y `Content-Disposition` salían del dato **facilitado por
 *    el cliente**: un `text/html` o un `image/svg+xml` subido se servía `inline`
 *    desde el mismo origen de la aplicación → XSS de mismo origen (robo de la
 *    sesión guardada en `localStorage`). Aquí sólo se sirven como `inline` los
 *    tipos realmente visualizables; el resto se degrada a
 *    `application/octet-stream` + `attachment`.
 *  · S-2 · `Cache-Control: public, max-age=86400` sobre documentos privados →
 *    cualquier cache intermediario podía conservar un DNI/contrato. Ahora
 *    `private, no-store, max-age=0` + `X-Content-Type-Options: nosniff`.
 *  · S-3 · El identificador se generaba con `Date.now() + Math.random()`
 *    (≈26 bits, y con el tiempo de subida conocido por el atacante) →
 *    Enumeration/forcejeo. Ahora 128 bits de `crypto.randomBytes`, con forma
 *    fija y validada en la lectura (nada de ids arbitrarios).
 *  · S-4 · `Map` sin límite: cada subida anónima retenía un `Buffer` para siempre
 *    → denegación de servicio por memoria. Ahora almacén acotado por entradas,
 *    bytes totales y TTL, con el mismo comportamiento "efímero" que ya tenía
 *    (al reiniciar el proceso el documento dejaba de servirse).
 *  · S-5 · Inyección de cabeceras vía `filename` (CR/LF) → se neutralizan los
 *    caracteres de control y las comillas del nombre mostrado.
 *
 * Ningún comportamiento legítimo cambia para el cliente: la respuesta del
 * `upload` conserva las claves `fileId`, `url`, `downloadURL`, `storagePath`,
 * `filename`, `mimeType` y `size`.
 */
import { randomBytes } from 'node:crypto';

/** Tamaño máximo de un documento individual (coherente con los límites de Storage). */
export const MAX_BYTES_POR_DOCUMENTO = 15 * 1024 * 1024;
/** Máximo de documentos retenidos en memoria. */
export const MAX_ENTRADAS_ALMACEN = 250;
/** Máximo de bytes totales retenidos en memoria. */
export const MAX_BYTES_ALMACEN = 96 * 1024 * 1024;
/** Vida de un documento en el almacén efímero. */
export const TTL_MS_ALMACEN = 12 * 60 * 60 * 1000;

const TIPOS_CONOCIDOS = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

/** Tipos que pueden renderizarse en el navegador sin ejecutar contenido. */
const TIPOS_INLINE_SEGUROS = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
]);

export interface TipoContenidoNormalizado {
  /** Tipo que se va a almacenar y servir. */
  tipo: string;
  /** true sólo si es seguro mostrarlo `inline` desde el origen de la app. */
  permitirInline: boolean;
}

/**
 * Normaliza el `Content-Type` declarado por el cliente. Un tipo desconocido, un
 * SVG (que es imagen *y* script) o un tipo inexistentes se convierten en
 * `application/octet-stream` forzado a descarga: el navegador nunca interpreta
 * el contenido como activo.
 */
export function normalizarTipoContenido(mimeType?: string, filename?: string): TipoContenidoNormalizado {
  const crudo = String(mimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const extension = String(filename || '')
    .toLowerCase()
    .split('.')
    .pop();
  const deducido =
    crudo.length > 0
      ? crudo
      : extension === 'pdf'
        ? 'application/pdf'
        : extension === 'png'
          ? 'image/png'
          : extension === 'jpg' || extension === 'jpeg'
            ? 'image/jpeg'
            : extension === 'webp'
              ? 'image/webp'
              : extension === 'gif'
                ? 'image/gif'
                : extension === 'mp4' || extension === 'm4v'
                  ? 'video/mp4'
                  : extension === 'mov'
                    ? 'video/quicktime'
                    : '';
  const seguro = TIPOS_CONOCIDOS.has(deducido);
  const tipo = seguro ? deducido : 'application/octet-stream';
  return { tipo, permitirInline: seguro && TIPOS_INLINE_SEGUROS.has(deducido) };
}

export interface ResultadoDecodificacion {
  ok: boolean;
  buffer?: Buffer;
  bytes?: number;
  error?: string;
}

/**
 * Acepta base64 plano o `data:<mime>;base64,...`, exige contenido real y
 * tamaño dentro del límite. No se lanza `Buffer.from` sobre una cadena que no
 * sea base64: se valida la forma antes de decodificar.
 */
export function decodificarBase64Documento(valor: unknown, limiteBytes: number = MAX_BYTES_POR_DOCUMENTO): ResultadoDecodificacion {
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    return { ok: false, error: 'No file data provided' };
  }
  const partes = valor.split(',');
  const esDataUrl = valor.startsWith('data:');
  if (esDataUrl && (partes.length < 2 || !partes[0].includes('base64'))) {
    return { ok: false, error: 'Data URL no válida (falta el marcador base64)' };
  }
  const crudo = esDataUrl ? partes.slice(1).join(',') : valor;
  const limpio = crudo.replace(/\s/g, '');
  if (limpio.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(limpio)) {
    return { ok: false, error: 'Contenido no base64' };
  }
  // El base64 crece ~4/3: se filtra por longitud de cadena antes de decodificar.
  if (Math.floor((limpio.length * 3) / 4) > limiteBytes) {
    return { ok: false, error: `Documento superior al máximo de ${Math.round(limiteBytes / (1024 * 1024))} MB` };
  }
  const buffer = Buffer.from(limpio, 'base64');
  if (buffer.length === 0) {
    return { ok: false, error: 'Documento vacío' };
  }
  if (buffer.length > limiteBytes) {
    return { ok: false, error: `Documento superior al máximo de ${Math.round(limiteBytes / (1024 * 1024))} MB` };
  }
  return { ok: true, buffer, bytes: buffer.length };
}

/** `doc_` + 32 hex (128 bits). Sin reloj ni `Math.random`: no es enumerables. */
export function generarIdDocumento(): string {
  return `doc_${randomBytes(16).toString('hex')}`;
}

const PATRON_ID = /^doc_[0-9a-f]{32}$/;

/** Forma del id aceptada por la ruta de lectura (rechaza sondeos y rutas raras). */
export function idDeDocumentoValido(id: unknown): boolean {
  return typeof id === 'string' && PATRON_ID.test(id);
}

/** Nombre mostrado en `Content-Disposition`: sin control, sin comillas, acotado. */
export function nombreMostrable(filename?: string): string {
  const base = String(filename || 'documento')
    .replace(/[\r\n\0"\\]/g, '')
    .replace(/[\\/]/g, '_')
    .replace(/[^\x20-\x7e]/g, '_')
    .trim();
  const corto = base.length > 120 ? base.slice(0, 120) : base;
  return corto.length > 0 ? corto : 'documento';
}

export function cabecerasDocumento(tipo: string, permitirInline: boolean, filename?: string): Record<string, string> {
  const nombre = nombreMostrable(filename);
  return {
    'Content-Type': tipo,
    'Content-Disposition': `${permitirInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(nombre)}`,
    // Documentos privados: nada de caches compartidos ni olfateo de tipo.
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

export interface DocumentoAlmacenado {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  uploadedAt: string;
  permitirInline: boolean;
  bytes: number;
}

export interface OpcionesAlmacen {
  maxEntradas?: number;
  maxBytes?: number;
  ttlMs?: number;
  ahora?: () => number;
}

/**
 * Almacén efímero acotado (LRU por inserción + TTL). Mantiene la semántica
 * original del `Map` en memoria —el documento no sobrevive a un reinicio y se
 * sirve por URL de capacidad— pero con límites duros: sin ellos, cualquier
 * visitante anónimo podía agotar la memoria del proceso.
 */
export class AlmacenDocumentosEfimeros {
  private readonly datos = new Map<string, DocumentoAlmacenado>();
  private readonly maxEntradas: number;
  private readonly maxBytes: number;
  private readonly ttlMs: number;
  private readonly ahora: () => number;
  private bytesEnUso = 0;

  constructor(opciones: OpcionesAlmacen = {}) {
    this.maxEntradas = opciones.maxEntradas ?? MAX_ENTRADAS_ALMACEN;
    this.maxBytes = opciones.maxBytes ?? MAX_BYTES_ALMACEN;
    this.ttlMs = opciones.ttlMs ?? TTL_MS_ALMACEN;
    this.ahora = opciones.ahora ?? (() => Date.now());
  }

  set(id: string, documento: DocumentoAlmacenado): { ok: boolean; motivo?: string } {
    if (!idDeDocumentoValido(id)) return { ok: false, motivo: 'id_no_valido' };
    if (documento.bytes > this.maxBytes) return { ok: false, motivo: 'documento_demasiado_grande' };
    const anterior = this.datos.get(id);
    if (anterior) {
      // Invariante de inmutabilidad: un id ya existente no se sobrescribe.
      return { ok: false, motivo: 'id_ya_existe' };
    }
    this.datos.set(id, documento);
    this.bytesEnUso += documento.bytes;
    this.recortar();
    return { ok: true };
  }

  get(id: string): DocumentoAlmacenado | null {
    if (!idDeDocumentoValido(id)) return null;
    const item = this.datos.get(id);
    if (!item) return null;
    const edad = this.ahora() - Date.parse(item.uploadedAt);
    if (Number.isFinite(edad) && edad > this.ttlMs) {
      this.eliminar(id);
      return null;
    }
    return item;
  }

  private eliminar(id: string): void {
    const item = this.datos.get(id);
    if (!item) return;
    this.datos.delete(id);
    this.bytesEnUso = Math.max(0, this.bytesEnUso - item.bytes);
  }

  /** Purga lo caducado; devuelve cuántas entradas se han liberado. */
  purgar(): number {
    const caducados: string[] = [];
    for (const [id, item] of this.datos) {
      const edad = this.ahora() - Date.parse(item.uploadedAt);
      if (!Number.isFinite(edad) || edad > this.ttlMs) caducados.push(id);
    }
    for (const id of caducados) this.eliminar(id);
    return caducados.length;
  }

  private recortar(): void {
    while (this.datos.size > this.maxEntradas || this.bytesEnUso > this.maxBytes) {
      const masAntiguo = this.datos.keys().next();
      if (masAntiguo.done) return;
      this.eliminar(masAntiguo.value);
    }
  }

  get tamano(): number {
    return this.datos.size;
  }

  get bytes(): number {
    return this.bytesEnUso;
  }
}
