/**
 * FASE A (2026-10-16) — BANDEJA INTERNA DE AVISOS (lectura de `notificaciones`)
 * ============================================================================
 * Los avisos del GAP 1 ya se persisten en `notificaciones` con su **estado real
 * de entrega** (estado, intentos, proveedor, id externo, error). Esta capa los
 * lee para la bandeja interna de la app, de modo que un aviso importante no
 * dependa solo del correo.
 *
 * Alcance y reglas (§22 de `firestore.rules`):
 *   · PROPIETARIO → consulta acotada por su `propietarioId` (lo que exige la regla);
 *   · staff (ADMINISTRADOR/PROFESIONAL) → listado general ya autorizado.
 * No se escribe nada aquí: la bandeja es de solo lectura y NUNCA cambia el
 * estado de un cobro.
 */
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from './firebase';
import type { CanalNotificacion, EstadoNotificacion, Notificacion } from '../types/notificaciones';

export const COLECCION_NOTIFICACIONES = 'notificaciones';
export const MAXIMO_AVISOS_BANDEJA = 100;

export interface AvisoBandeja {
  id: string;
  tipo: string;
  asunto: string;
  cuerpo: string;
  canal: CanalNotificacion;
  estado: EstadoNotificacion;
  intentos: number;
  fechaCreacion: string;
  programarPara?: string;
  enviadoEn?: string;
  provider?: string;
  externalId?: string;
  error?: string;
  entidadId: string;
  inmuebleId?: string;
  propietarioId?: string;
  destinatarioEmail?: string;
  destinatarioNombre?: string;
}

export interface OpcionesBandeja {
  /** PropietarioId real del usuario (obligatorio para el perfil PROPIETARIO). */
  propietarioId?: string;
  /** El staff puede listar sin filtro por propietario. */
  esStaff?: boolean;
  maximo?: number;
}

function mapearAviso(id: string, datos: Partial<Notificacion>): AvisoBandeja | null {
  if (!datos || typeof datos.asunto !== 'string' || !datos.estado) return null;
  return {
    id,
    tipo: String(datos.tipo || datos.plantilla || ''),
    asunto: datos.asunto,
    // El texto renderizado del aviso (`cuerpo`). En documentos antiguos puede
    // faltar: se deja vacío antes que mostrar la clave de la plantilla.
    cuerpo: String(datos.cuerpo || ''),
    canal: (datos.canal || 'INAPP') as CanalNotificacion,
    estado: datos.estado,
    intentos: Number(datos.intentos || 0),
    fechaCreacion: String(datos.fechaCreacion || ''),
    ...(datos.programarPara ? { programarPara: datos.programarPara } : {}),
    ...(datos.enviadoEn ? { enviadoEn: datos.enviadoEn } : {}),
    ...(datos.provider ? { provider: datos.provider } : {}),
    ...(datos.externalId ? { externalId: datos.externalId } : {}),
    ...(datos.error ? { error: datos.error } : {}),
    entidadId: String(datos.entidadId || ''),
    ...(datos.inmuebleId ? { inmuebleId: datos.inmuebleId } : {}),
    ...(datos.propietarioId ? { propietarioId: datos.propietarioId } : {}),
    ...(datos.destinatario?.email ? { destinatarioEmail: datos.destinatario.email } : {}),
    ...(datos.destinatario?.nombre ? { destinatarioNombre: datos.destinatario.nombre } : {}),
  };
}

/** Orden descendente por fecha de creación (la más reciente primero). */
export function ordenarAvisos(avisos: AvisoBandeja[]): AvisoBandeja[] {
  return [...avisos].sort((a, b) => (a.fechaCreacion < b.fechaCreacion ? 1 : a.fechaCreacion > b.fechaCreacion ? -1 : 0));
}

/**
 * Lee los avisos visibles para el usuario según su alcance. Lanza el error de
 * Firestore si la consulta no está autorizada: la UI decide qué mostrar (nunca
 * se finge una lista vacía por un fallo de permisos).
 */
export async function listarAvisosBandeja(opciones: OpcionesBandeja): Promise<AvisoBandeja[]> {
  const maximo = Math.max(1, Math.min(MAXIMO_AVISOS_BANDEJA, opciones.maximo ?? MAXIMO_AVISOS_BANDEJA));
  const coleccion = collection(db, COLECCION_NOTIFICACIONES);

  const consulta = opciones.esStaff
    ? query(coleccion, limit(maximo))
    : opciones.propietarioId
      ? query(coleccion, where('propietarioId', '==', opciones.propietarioId), limit(maximo))
      : null;

  if (!consulta) return [];

  const snapshot = await getDocs(consulta);
  const avisos: AvisoBandeja[] = [];
  snapshot.forEach((documento) => {
    const aviso = mapearAviso(documento.id, documento.data() as Partial<Notificacion>);
    if (aviso) avisos.push(aviso);
  });
  return ordenarAvisos(avisos);
}

/** Resumen por estado para la cabecera de la bandeja. */
export function resumirAvisos(avisos: AvisoBandeja[]): Record<EstadoNotificacion | 'TOTAL', number> {
  const resumen: Record<EstadoNotificacion | 'TOTAL', number> = {
    TOTAL: avisos.length,
    PENDIENTE: 0,
    PROGRAMADA: 0,
    ENVIANDO: 0,
    ENVIADA: 0,
    FALLIDA: 0,
    CANCELADA: 0,
  };
  for (const aviso of avisos) resumen[aviso.estado] += 1;
  return resumen;
}
