import { auth } from './firebase';
import type { PreviewActualizacionRenta } from '../utils/actualizacionRentaEngine';

export class ErrorApiActualizacionRenta extends Error {
  constructor(message: string, readonly status: number, readonly codigo: string) {
    super(message);
  }
}

export interface ConfirmacionActualizacionRentaApi {
  estado: 'CREADA' | 'REPETIDA';
  contratoId: string;
  anexoId: string;
  avisoId: string;
  version: 1;
  fechaAniversario: string;
  fechaProgramadaAviso: string;
  estadoAviso: 'PENDIENTE_ENVIO';
  comunicado: 'NO_COMUNICADO';
  fechaEfectividad: string | null;
  estadoActualizacion?: 'EFECTIVA';
  rentaAnterior?: number;
  rentaVigente?: number;
  versionCalculo?: string;
}

interface RespuestaApi {
  ok?: boolean;
  error?: string;
  codigo?: string;
  preview?: PreviewActualizacionRenta;
  huellaPreview?: string;
}

async function tokenAutenticado(): Promise<string> {
  const usuario = auth.currentUser;
  if (!usuario) throw new ErrorApiActualizacionRenta('Inicia sesión para continuar.', 401, 'NO_AUTENTICADO');
  return usuario.getIdToken();
}

/** Preview calculado en servidor; no confirma ni persiste P4. */
export async function previsualizarActualizacionRenta(contratoId: string, evidenciaComunicacion?: PreviewActualizacionRenta['evidenciaComunicacion']): Promise<{
  preview: PreviewActualizacionRenta;
  huellaPreview: string;
}> {
  const token = await tokenAutenticado();
  const response = await fetch('/api/contratos/actualizacion-renta/previsualizar', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contratoId, ...(evidenciaComunicacion ? { evidenciaComunicacion } : {}) }),
  });
  let datos: RespuestaApi = {};
  try { datos = await response.json() as RespuestaApi; } catch { /* no se filtra el cuerpo */ }
  if (!response.ok || !datos.preview || !datos.huellaPreview) {
    throw new ErrorApiActualizacionRenta(
      datos.error || 'No se pudo previsualizar la actualización de renta.',
      response.status,
      datos.codigo || 'ERROR_API',
    );
  }
  return { preview: datos.preview, huellaPreview: datos.huellaPreview };
}

/** Confirmación efectiva; no implica envío por la aplicación. */
export async function confirmarActualizacionRenta(entrada: {
  contratoId: string;
  huellaPreview: string;
  fechaProgramadaAviso: string;
  confirmacionExplicita: true;
  evidenciaComunicacion: NonNullable<PreviewActualizacionRenta['evidenciaComunicacion']>;
  idempotencyKey: string;
}): Promise<ConfirmacionActualizacionRentaApi> {
  const token = await tokenAutenticado();
  const response = await fetch('/api/contratos/actualizacion-renta/confirmar', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': entrada.idempotencyKey,
    },
    body: JSON.stringify({
      contratoId: entrada.contratoId,
      evidenciaComunicacion: entrada.evidenciaComunicacion,
      huellaPreview: entrada.huellaPreview,
      fechaProgramadaAviso: entrada.fechaProgramadaAviso,
      confirmacionExplicita: entrada.confirmacionExplicita,
    }),
  });
  let datos: (ConfirmacionActualizacionRentaApi & { ok?: boolean; error?: string; codigo?: string }) | null = null;
  try { datos = await response.json() as typeof datos; } catch { /* no se filtra el cuerpo */ }
  if (!response.ok || datos?.ok !== true || !datos?.avisoId || !datos.anexoId
    || datos.estadoActualizacion !== 'EFECTIVA' || !datos.fechaEfectividad || !Number.isFinite(datos.rentaVigente)) {
    throw new ErrorApiActualizacionRenta(
      datos?.error || 'No se pudo registrar la confirmación de P4.',
      response.status,
      datos?.codigo || 'ERROR_API',
    );
  }
  return datos;
}
