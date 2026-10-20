/**
 * CUSTODIA DOCUMENTAL — ADJUNTOS DE PÓLIZA GUARDADOS EN LA PROPIA FICHA (AG-04)
 * =============================================================================
 * `DetallePolizaModal` adjunta los documentos de renovación como data-URL
 * dentro del documento `polizas_seguros/{id}` (campo `documentosRenovacion[].url`).
 * No existe prefijo de Storage para pólizas en `storage.rules`, así que esa
 * ficha ES la custodia duradera de estos adjuntos (decisión previa, fuera del
 * alcance de esta orden).
 *
 * Hasta 2026-10-20 el modal intentaba PRIMERO el almacén efímero del servidor
 * (`/api/upload-document`) y sólo si fallaba guardaba la data-URL: cuando el
 * servidor respondía, la ficha quedaba con una referencia `server_*` que
 * dejaba de resolver al reciclarse la función (pérdida con apariencia de éxito).
 *
 * Este módulo aporta la parte pura del nuevo comportamiento (sin servidor):
 *  - comprobar ANTES de leer el archivo que cabe en la ficha (límite de 1 MiB
 *    por documento Firestore, con margen) y que es PDF/imagen;
 *  - mensajes en lenguaje de la persona usuaria (filtro UX-3).
 * El guardado real lo hace `savePolizaFirestore`, que lanza ante cualquier
 * fallo: el modal lo muestra, nunca lo silencia.
 */

/** Tamaño máximo de un documento Firestore (1 MiB). */
export const LIMITE_DOCUMENTO_FIRESTORE_BYTES = 1_048_576;

/** Margen para índices, metadatos e historial que crece con cada adjunto. */
export const MARGEN_SEGURIDAD_FICHA_BYTES = 128 * 1024;

/** Tamaño máximo del binario de un adjunto (su data-URL ocupa ≈ 4/3 + cabecera). */
export const TAMANO_MAX_ADJUNTO_POLIZA_BYTES = 600 * 1024;

const TIPOS_ADMITIDOS = /^(application\/pdf|image\/(jpeg|jpg|png|webp))$/i;

export type MotivoRechazoAdjuntoPoliza = 'TIPO_NO_ADMITIDO' | 'ARCHIVO_DEMASIADO_GRANDE' | 'FICHA_SIN_ESPACIO';

export type EvaluacionAdjuntoPoliza =
  | { ok: true; bytesDataUrlEstimados: number; bytesFichaActual: number }
  | { ok: false; motivo: MotivoRechazoAdjuntoPoliza; mensaje: string };

export interface ArchivoAdjuntoPoliza {
  size: number;
  type?: string;
  name?: string;
}

/** Bytes UTF-8 que ocupa un valor serializado a JSON (aproximación al tamaño en Firestore). */
export function tamanoAproximadoJsonBytes(valor: unknown): number {
  let texto: string;
  try {
    texto = JSON.stringify(valor) ?? '';
  } catch {
    return 0;
  }
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(texto).length;
  return texto.length;
}

/** Tamaño de la data-URL que generará `FileReader.readAsDataURL` para un binario. */
export function bytesDataUrlEstimados(bytesBinario: number, tipo = 'application/pdf'): number {
  return Math.ceil(bytesBinario / 3) * 4 + `data:${tipo};base64,`.length;
}

function tipoEfectivo(archivo: ArchivoAdjuntoPoliza): string {
  const declarado = String(archivo.type || '').trim().toLowerCase();
  if (declarado) return declarado;
  const nombre = String(archivo.name || '').toLowerCase();
  if (nombre.endsWith('.pdf')) return 'application/pdf';
  if (nombre.endsWith('.png')) return 'image/png';
  if (nombre.endsWith('.jpg') || nombre.endsWith('.jpeg')) return 'image/jpeg';
  if (nombre.endsWith('.webp')) return 'image/webp';
  return '';
}

function kb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Decide si un archivo puede adjuntarse a la ficha de la póliza sin superar el
 * límite del documento. Determinista y sin efectos.
 */
export function evaluarAdjuntoInlinePoliza(
  poliza: Record<string, unknown>,
  archivo: ArchivoAdjuntoPoliza,
): EvaluacionAdjuntoPoliza {
  const tipo = tipoEfectivo(archivo);
  if (!TIPOS_ADMITIDOS.test(tipo)) {
    return {
      ok: false,
      motivo: 'TIPO_NO_ADMITIDO',
      mensaje: 'El documento no se ha adjuntado: sólo se admiten PDF o imágenes (JPG, PNG, WEBP).',
    };
  }
  if (!(archivo.size > 0) || archivo.size > TAMANO_MAX_ADJUNTO_POLIZA_BYTES) {
    return {
      ok: false,
      motivo: 'ARCHIVO_DEMASIADO_GRANDE',
      mensaje: `El documento no se ha adjuntado: ocupa ${kb(archivo.size)} y el máximo por adjunto de póliza es ${kb(TAMANO_MAX_ADJUNTO_POLIZA_BYTES)}. Reduce el archivo (por ejemplo, comprimiendo el PDF) y vuelve a intentarlo.`,
    };
  }
  const bytesFichaActual = tamanoAproximadoJsonBytes(poliza);
  const estimados = bytesDataUrlEstimados(archivo.size, tipo);
  const disponible = LIMITE_DOCUMENTO_FIRESTORE_BYTES - MARGEN_SEGURIDAD_FICHA_BYTES - bytesFichaActual;
  if (estimados > disponible) {
    return {
      ok: false,
      motivo: 'FICHA_SIN_ESPACIO',
      mensaje: `El documento no se ha adjuntado: la ficha de esta póliza ya guarda ${kb(bytesFichaActual)} de adjuntos y no queda espacio para otro de ${kb(archivo.size)}. Elimina algún documento anterior o adjunta uno más pequeño.`,
    };
  }
  return { ok: true, bytesDataUrlEstimados: estimados, bytesFichaActual };
}

/** Lee un archivo como data-URL; rechaza (no devuelve cadena vacía) si la lectura falla. */
export function leerArchivoComoDataUrl(archivo: Blob): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onloadend = () => {
      const resultado = typeof lector.result === 'string' ? lector.result : '';
      if (resultado.startsWith('data:')) resolver(resultado);
      else rechazar(new Error('No se ha podido leer el archivo seleccionado.'));
    };
    lector.onerror = () => rechazar(new Error('No se ha podido leer el archivo seleccionado.'));
    lector.readAsDataURL(archivo);
  });
}
