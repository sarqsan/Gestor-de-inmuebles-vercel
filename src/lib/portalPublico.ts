/**
 * AG-02 — Cliente de los portales públicos por token.
 *
 * El navegador anónimo ya no lee ni escribe `invitaciones`, `slots_visita`,
 * `candidatos` ni `solicitudes_documentacion`: las reglas lo deniegan. Todas
 * las operaciones pasan por las rutas de servidor `/api/visita/*`,
 * `/api/cuestionario/*` y `/api/documentacion/*`, que resuelven el token contra
 * la base Firestore con nombre.
 *
 * Este módulo no importa el SDK de Firebase: si se importara, el portal volvería
 * a depender de una lectura directa que la regla rechaza.
 */
import type {
  Candidato,
  InvitacionVisita,
  ItemDocumentoSolicitado,
  RespuestaIncidencia,
  SolicitudAlquiler,
  SolicitudDocPublicData,
  VisitSlot,
} from '../types';

export class ErrorPortalPublico extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly status: number
  ) {
    super(mensaje);
    this.name = 'ErrorPortalPublico';
  }
}

const MENSAJE_GENERICO = 'No se ha podido completar la operación. Comprueba la conexión e inténtalo de nuevo.';

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      cache: 'no-store',
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new ErrorPortalPublico('RED', MENSAJE_GENERICO, 0);
  }

  const cuerpo = (await respuesta.json().catch(() => null)) as
    | (Record<string, unknown> & { ok?: boolean; error?: string; codigo?: string })
    | null;

  if (!respuesta.ok || !cuerpo || cuerpo.ok !== true) {
    const mensaje = typeof cuerpo?.error === 'string' && cuerpo.error.trim() ? cuerpo.error : MENSAJE_GENERICO;
    throw new ErrorPortalPublico(String(cuerpo?.codigo || 'ERROR'), mensaje, respuesta.status);
  }
  return cuerpo as unknown as T;
}

function ruta(base: string, token: string): string {
  return `${base}/${encodeURIComponent(token)}`;
}

// ---------------------------------------------------------------------------
// Visita
// ---------------------------------------------------------------------------

export interface DatosVisitaPublica {
  invitacion: InvitacionVisita;
  slots: VisitSlot[];
  inmuebleId: string;
}

export function cargarVisitaPublica(token: string): Promise<DatosVisitaPublica> {
  return pedir<DatosVisitaPublica>(ruta('/api/visita', token));
}

export function reservarVisitaPublica(
  token: string,
  slotId: string,
  notas: string
): Promise<{ invitacion: InvitacionVisita; slot: VisitSlot | null }> {
  return pedir(ruta('/api/visita', token) + '/reservar', {
    method: 'POST',
    body: JSON.stringify({ slotId, notas }),
  });
}

export function cancelarVisitaPublica(
  token: string
): Promise<{ invitacion: InvitacionVisita; slot: VisitSlot | null }> {
  return pedir(ruta('/api/visita', token) + '/cancelar', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// ---------------------------------------------------------------------------
// Cuestionario
// ---------------------------------------------------------------------------

export interface DatosCuestionarioPublico {
  candidato: Candidato;
}

export function cargarCuestionarioPublico(token: string): Promise<DatosCuestionarioPublico> {
  return pedir<DatosCuestionarioPublico>(ruta('/api/cuestionario', token));
}

export function enviarCuestionarioPublico(
  token: string,
  datos: Partial<Candidato>,
  respuestas: RespuestaIncidencia[],
  informacionAdicional: string
): Promise<DatosCuestionarioPublico> {
  return pedir<DatosCuestionarioPublico>(ruta('/api/cuestionario', token), {
    method: 'POST',
    body: JSON.stringify({ datos, respuestas, informacionAdicional }),
  });
}

// ---------------------------------------------------------------------------
// Documentación post-visita
// ---------------------------------------------------------------------------

export interface DatosDocumentacionPublica {
  solicitud: SolicitudDocPublicData;
}

export function cargarDocumentacionPublica(token: string): Promise<DatosDocumentacionPublica> {
  return pedir<DatosDocumentacionPublica>(ruta('/api/documentacion', token));
}

/**
 * Solo se envían el id del item y sus archivos: el servidor conserva el nombre,
 * tipo y obligatoriedad definidos por el propietario y valida cada archivo
 * (URL de Storage y `storagePath` dentro de `documentos_solicitados/{id}/`).
 */
export function actualizarDocumentacionPublica(
  token: string,
  documentos: ItemDocumentoSolicitado[],
  final: boolean
): Promise<DatosDocumentacionPublica> {
  const carga = documentos.map((documento) => ({
    id: documento.id,
    archivos: (documento.archivos || []).map((archivo) => ({
      id: archivo.id,
      nombreArchivo: archivo.nombreArchivo,
      mimeType: archivo.mimeType,
      url: archivo.url,
      storagePath: archivo.storagePath,
      tamañoBytes: archivo.tamañoBytes,
      fechaSubida: archivo.fechaSubida,
    })),
  }));

  return pedir<DatosDocumentacionPublica>(ruta('/api/documentacion', token), {
    method: 'POST',
    body: JSON.stringify({ documentos: carga, final }),
  });
}

// ---------------------------------------------------------------------------
// P0.2.1 — Alta pública de solicitud (SOLO servidor)
// ---------------------------------------------------------------------------

export interface ResultadoAltaSolicitudPublica {
  solicitud: SolicitudAlquiler;
  candidatoId: string;
}

/**
 * Envía el formulario al servidor por el token de capacidad del enlace.
 * NO importa el SDK de Firebase: el anónimo no tiene permisos de escritura
 * (firestore.rules P0.2.2). La promesa SOLO resuelve si el servidor confirma
 * el commit atómico de `solicitudes` + `candidatos`.
 *
 * `_hp` es el campo honeypot (P0.2.3): un bot que rellene todos los campos
 * del formulario lo enviará con contenido y el servidor rechazará el alta.
 */
export function crearSolicitudPublicaPorToken(
  token: string,
  solicitud: SolicitudAlquiler,
  candidato: unknown,
  honeypot = ''
): Promise<ResultadoAltaSolicitudPublica> {
  return pedir<ResultadoAltaSolicitudPublica>(ruta('/api/solicitud', token), {
    method: 'POST',
    body: JSON.stringify({ solicitud, candidato, _hp: honeypot }),
  }).then((respuesta) => ({
    ...respuesta,
    solicitud: { ...solicitud, ...respuesta.solicitud } as SolicitudAlquiler,
  }));
}
