import { auth } from './firebase';
import type { EventoAuditoriaJustificanteCobro, RegistroJustificanteCobro } from '../types';

export class ErrorApiJustificantesCobro extends Error {
  constructor(message: string, readonly status: number, readonly codigo: string) {
    super(message);
  }
}

interface RespuestaError {
  error?: string;
  codigo?: string;
}

async function cabeceraAutorizada(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const usuario = auth.currentUser;
  if (!usuario) throw new ErrorApiJustificantesCobro('Inicia sesión para continuar.', 401, 'NO_AUTENTICADO');
  const token = await usuario.getIdToken();
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function leerError(response: Response): Promise<never> {
  let body: RespuestaError = {};
  try { body = await response.json() as RespuestaError; } catch { /* respuesta sin JSON */ }
  throw new ErrorApiJustificantesCobro(
    body.error || 'No se pudo completar la operación.',
    response.status,
    body.codigo || 'ERROR_API',
  );
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: await cabeceraAutorizada({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!response.ok) return leerError(response);
  return await response.json() as T;
}

export async function consultarJustificantesCobro(
  contratoIds: string[],
  offset = 0,
): Promise<{ items: RegistroJustificanteCobro[]; hayMas: boolean }> {
  const ids = [...new Set(contratoIds)].filter(Boolean);
  if (ids.length === 0) return { items: [], hayMas: false };
  const items: RegistroJustificanteCobro[] = [];
  let hayMas = false;
  for (let inicio = 0; inicio < ids.length; inicio += 50) {
    const respuesta = await postJson<{ ok: true; items: RegistroJustificanteCobro[]; hayMas: boolean }>(
      '/api/cobros/justificantes/consultar',
      { contratoIds: ids.slice(inicio, inicio + 50), offset },
    );
    items.push(...respuesta.items);
    hayMas ||= respuesta.hayMas;
  }
  return { items, hayMas };
}

export async function presentarJustificanteCobro(input: {
  contratoId: string;
  cobroPeriodoId: string;
  claveIdempotencia: string;
  archivo: File;
  importeDeclarado: number;
  fechaPagoDeclarada: string;
  metodoPagoDeclarado: RegistroJustificanteCobro['metodoPagoDeclarado'];
}): Promise<{ justificante: RegistroJustificanteCobro; duplicada: boolean }> {
  const mimePorExtension: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  const extension = input.archivo.name.split('.').pop()?.toLowerCase() || '';
  const tipoMime = input.archivo.type || mimePorExtension[extension] || '';
  const response = await fetch('/api/cobros/justificantes/subir', {
    method: 'POST',
    headers: await cabeceraAutorizada({
      'Content-Type': tipoMime || 'application/octet-stream',
      'Idempotency-Key': input.claveIdempotencia,
      'X-Contrato-Id': input.contratoId,
      'X-Cobro-Periodo-Id': input.cobroPeriodoId,
      'X-Importe-Declarado': String(input.importeDeclarado),
      'X-Fecha-Pago-Declarada': input.fechaPagoDeclarada,
      'X-Metodo-Pago-Declarado': input.metodoPagoDeclarado,
      'X-Nombre-Archivo': encodeURIComponent(input.archivo.name),
    }),
    body: input.archivo,
  });
  if (!response.ok) return leerError(response);
  return await response.json() as { ok: true; justificante: RegistroJustificanteCobro; duplicada: boolean };
}

export async function decidirJustificanteCobro(input: {
  justificanteId: string;
  accion: 'ACEPTAR' | 'RECHAZAR' | 'RECTIFICAR';
  claveIdempotencia: string;
  estadoCorregido?: 'ACEPTADO' | 'RECHAZADO';
  motivo?: string;
}): Promise<{ justificante: RegistroJustificanteCobro; duplicada: boolean }> {
  const { justificanteId, ...body } = input;
  const respuesta = await postJson<{ ok: true; justificante: RegistroJustificanteCobro; duplicada: boolean }>(
    `/api/cobros/justificantes/${encodeURIComponent(justificanteId)}/decision`,
    body,
  );
  return { justificante: respuesta.justificante, duplicada: respuesta.duplicada };
}

export async function obtenerAuditoriaJustificanteCobro(
  justificanteId: string,
  offset = 0,
): Promise<{ eventos: EventoAuditoriaJustificanteCobro[]; hayMas: boolean }> {
  const response = await fetch(
    `/api/cobros/justificantes/${encodeURIComponent(justificanteId)}/auditoria?offset=${Math.max(0, offset)}`,
    { headers: await cabeceraAutorizada() },
  );
  if (!response.ok) return leerError(response);
  return await response.json() as { ok: true; eventos: EventoAuditoriaJustificanteCobro[]; hayMas: boolean };
}

export async function descargarArchivoJustificanteCobro(
  justificanteId: string,
  nombreArchivo: string,
  eventoId?: string,
): Promise<void> {
  const query = eventoId ? `?eventoId=${encodeURIComponent(eventoId)}` : '';
  const response = await fetch(
    `/api/cobros/justificantes/${encodeURIComponent(justificanteId)}/archivo${query}`,
    { headers: await cabeceraAutorizada() },
  );
  if (!response.ok) return leerError(response);
  const archivo = await response.blob();
  const objectUrl = URL.createObjectURL(archivo);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = nombreArchivo;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function nuevaClaveIdempotencia(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('Este navegador no dispone de un generador criptográfico seguro.');
}
