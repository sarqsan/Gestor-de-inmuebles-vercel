/**
 * BLOQUE F · DOMINIO `gestiones_cartera` — base de dominio de la gestión
 * patrimonial (D1 revisada APROBADA; docs/D1-REVISADA-...md y MAPA MAESTRO §4).
 *
 * Módulo 100% PURO (sin Firebase, sin reloj implícito: las fechas las aporta el
 * llamante). No escribe en Firestore ni en Storage; la persistencia y el
 * endurecimiento de reglas son fases posteriores (D2/D3), NO esta.
 *
 * Invariantes que garantizan el modelo aprobado:
 *  - La gestión NO modifica la titularidad legal (no toca inmuebles).
 *  - Histórico append-only: los eventos nunca se modifican ni se eliminan.
 *  - REVOCADA es terminal: no se reactiva ni se reutiliza su histórico.
 *  - La devolución/cesión no crea propietarios ni duplica inmuebles.
 *  - S4: propietario sin cuenta no bloquea la preparación administrativa.
 *  - S7: LECTURA histórica ≠ gestión activa ≠ escritura.
 *  - S1: GESTOR_PATRIMONIAL es distinto del rol operativo GESTOR_INMUEBLES.
 */

// ---------------------------------------------------------------------------
// Roles (S1) — el rol operativo existente NO se modifica ni se reutiliza.
// ---------------------------------------------------------------------------
/** Rol patrimonial independiente aprobado en S1. */
export const ROL_GESTOR_PATRIMONIAL = 'GESTOR_PATRIMONIAL';
/**
 * Rol operativo EXISTENTE (candidatos/visitas/contratos/seguros). Se referencia
 * solo como constante informativa: este módulo NO altera su comportamiento.
 */
export const ROL_GESTOR_INMUEBLES_OPERATIVO = 'GESTOR_INMUEBLES';

// ---------------------------------------------------------------------------
// Tipos del dominio
// ---------------------------------------------------------------------------
export type EstadoGestionCartera =
  | 'PENDIENTE_ACEPTACION'
  | 'ACTIVA'
  | 'SUSPENDIDA'
  | 'REVOCADA';

/** S7: la escritura nunca se concede por el mero hecho de existir la gestión. */
export type PermisoGestion = 'LECTURA' | 'LECTURA_ESCRITURA';

export type ResponsableActual = 'GESTOR' | 'TITULAR';

/** El gestor es un usuario: puede ser a la vez propietario (E) o no (F). */
export type TipoGestor = 'PROPIETARIO_GESTOR' | 'GESTOR_PROFESIONAL';

export type TipoEventoGestion =
  | 'ALTA'
  | 'INVITACION'
  | 'ACEPTACION'
  | 'ACTIVACION'
  | 'SUSPENSION'
  | 'REACTIVACION'
  | 'CESION'
  | 'DEVOLUCION'
  | 'CAMBIO_PERMISOS'
  | 'REVOCACION';

/** Evento append-only. Formato compatible con `AuditLog.detalles` (reutilización, no sistema paralelo). */
export interface EventoGestionCartera {
  tipo: TipoEventoGestion;
  gestionId: string;
  actorId: string;
  actorRol?: string;
  fecha: string; // ISO aportado por el llamante
  motivo?: string;
  estadoAnterior: EstadoGestionCartera;
  estadoNuevo: EstadoGestionCartera;
  /** Snapshot del permiso tras el evento (auditoría de cambios de permiso). */
  permiso?: PermisoGestion;
}

export interface GestionCartera {
  id: string;
  /** Titular legal (propietarios/{id}). La gestión NO altera su titularidad. */
  propietarioId: string;
  gestorUsuarioId: string;
  tipoGestor: TipoGestor;
  /** [] = cartera completa del titular. */
  inmuebleIds: string[];
  permiso: PermisoGestion;
  responsableActual: ResponsableActual;
  estado: EstadoGestionCartera;
  /** S4: true cuando el titular tiene cuenta y el flujo exige su consentimiento. */
  requiereAceptacion: boolean;
  aceptada?: { por: string; fecha: string };
  fechaAlta: string;
  fechaActivacion?: string;
  fechaSuspension?: string;
  fechaRevocacion?: string;
  motivoUltimo?: string;
  /** S7: si se decidió conservarla al revocar (LECTURA histórica ≠ gestión activa). */
  conservarLecturaHistorica?: boolean;
  /** Histórico append-only: nunca se modifica ni se elimina. */
  eventos: EventoGestionCartera[];
  creadoPor: string;
  createdAt: string;
  updatedAt: string;
}

export type ResultadoGestion =
  | { ok: true; gestion: GestionCartera }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Máquina de estados (FASE 4) — transiciones explícitas y cerradas.
// ---------------------------------------------------------------------------
const TRANSICIONES_POR_ESTADO: Record<EstadoGestionCartera, TipoEventoGestion[]> = {
  // ALTA es el evento constitutivo (lo emite crearGestion); las transiciones
  // de usuario desde PENDIENTE_ACEPTACION son INVITACION/ACEPTACION/ACTIVACION/REVOCACION.
  PENDIENTE_ACEPTACION: ['ALTA', 'INVITACION', 'ACEPTACION', 'ACTIVACION', 'REVOCACION'],
  ACTIVA: ['CESION', 'DEVOLUCION', 'CAMBIO_PERMISOS', 'SUSPENSION', 'REVOCACION'],
  SUSPENDIDA: ['REACTIVACION', 'REVOCACION'],
  REVOCADA: [], // terminal: ni reactivación ni suspensión ni reutilización
};

export function transicionPermitida(
  estado: EstadoGestionCartera,
  tipo: TipoEventoGestion
): boolean {
  return TRANSICIONES_POR_ESTADO[estado].includes(tipo);
}

// ---------------------------------------------------------------------------
// Creación (FASE 2/5)
// ---------------------------------------------------------------------------
export interface ParametrosCrearGestion {
  id: string;
  propietarioId: string;
  gestorUsuarioId: string;
  tipoGestor: TipoGestor;
  /** S4: si el titular tiene cuenta, la aceptación formal puede exigirse. */
  propietarioTieneCuenta: boolean;
  /** Por defecto LECTURA: la escritura NUNCA se concede automáticamente (S7). */
  permiso?: PermisoGestion;
  inmuebleIds?: string[];
  fecha: string; // ISO (alta); el dominio no usa reloj propio
  actorId: string;
  actorRol?: string;
}

export function crearGestion(p: ParametrosCrearGestion): ResultadoGestion {
  const errores: string[] = [];
  if (!p.id) errores.push('id obligatorio');
  if (!p.propietarioId) errores.push('propietarioId obligatorio (invariante 1: toda gestión referencia a un propietario)');
  if (!p.gestorUsuarioId) errores.push('gestorUsuarioId obligatorio');
  if (!p.fecha || isNaN(new Date(p.fecha).getTime())) errores.push('fecha de alta inválida');
  if (p.permiso && !['LECTURA', 'LECTURA_ESCRITURA'].includes(p.permiso)) errores.push('permiso inválido');
  if (errores.length) return { ok: false, error: errores.join('; ') };

  const gestion: GestionCartera = {
    id: p.id,
    propietarioId: p.propietarioId,
    gestorUsuarioId: p.gestorUsuarioId,
    tipoGestor: p.tipoGestor,
    inmuebleIds: [...(p.inmuebleIds || [])],
    permiso: p.permiso || 'LECTURA',
    responsableActual: 'GESTOR',
    estado: 'PENDIENTE_ACEPTACION',
    requiereAceptacion: p.propietarioTieneCuenta, // S4
    fechaAlta: p.fecha,
    eventos: [],
    creadoPor: p.actorId,
    createdAt: p.fecha,
    updatedAt: p.fecha,
  };
  return registrarEvento(gestion, {
    tipo: 'ALTA',
    actorId: p.actorId,
    actorRol: p.actorRol,
    fecha: p.fecha,
  });
}

// ---------------------------------------------------------------------------
// Eventos y transiciones (FASE 4/6) — históricos append-only
// ---------------------------------------------------------------------------
export interface ParametrosEvento {
  tipo: TipoEventoGestion;
  actorId: string;
  actorRol?: string;
  fecha: string;
  motivo?: string;
  /** Solo para CAMBIO_PERMISOS. */
  permiso?: PermisoGestion;
  /** Solo para REVOCACION (S7: LECTURA histórica opcional). */
  conservarLecturaHistorica?: boolean;
}

export function registrarEvento(
  gestion: GestionCartera,
  p: ParametrosEvento
): ResultadoGestion {
  if (!p.fecha || isNaN(new Date(p.fecha).getTime())) {
    return { ok: false, error: 'fecha inválida' };
  }
  if (!transicionPermitida(gestion.estado, p.tipo)) {
    return {
      ok: false,
      error: `Transición inválida: ${p.tipo} no permitida en estado ${gestion.estado}${
        gestion.estado === 'REVOCADA' ? ' (REVOCADA es terminal: cree una gestión nueva)' : ''
      }`,
    };
  }
  // S4: activar sin aceptación cuando el flujo la exige.
  if (p.tipo === 'ACTIVACION' && gestion.requiereAceptacion && !gestion.aceptada) {
    return { ok: false, error: 'El titular tiene cuenta: se requiere ACEPTACION formal antes de ACTIVACION (S4)' };
  }
  if (p.tipo === 'ACEPTACION' && !gestion.requiereAceptacion) {
    return { ok: false, error: 'Esta gestión no requiere aceptación (titular sin cuenta, S4)' };
  }
  if (p.tipo === 'CAMBIO_PERMISOS') {
    if (!p.permiso || !['LECTURA', 'LECTURA_ESCRITURA'].includes(p.permiso)) {
      return { ok: false, error: 'CAMBIO_PERMISOS requiere un permiso válido' };
    }
  }
  if ((p.tipo === 'CESION' || p.tipo === 'DEVOLUCION')) {
    const objetivo: ResponsableActual = p.tipo === 'CESION' ? 'TITULAR' : 'GESTOR';
    if (gestion.responsableActual === objetivo) {
      return { ok: false, error: `La gestión ya tiene responsableActual=${objetivo}` };
    }
  }

  const estadoAnterior = gestion.estado;
  const nueva: GestionCartera = {
    ...gestion,
    eventos: [...gestion.eventos], // append-only: copia, nunca mutación
    inmuebleIds: [...gestion.inmuebleIds], // la gestión no duplica ni altera inmuebles
    updatedAt: p.fecha,
  };
  let estadoNuevo = estadoAnterior;

  switch (p.tipo) {
    case 'ACEPTACION':
      nueva.aceptada = { por: p.actorId, fecha: p.fecha };
      nueva.estado = 'ACTIVA';
      nueva.fechaActivacion = p.fecha;
      estadoNuevo = 'ACTIVA';
      break;
    case 'ACTIVACION':
      nueva.estado = 'ACTIVA';
      nueva.fechaActivacion = p.fecha;
      estadoNuevo = 'ACTIVA';
      break;
    case 'SUSPENSION':
      nueva.estado = 'SUSPENDIDA';
      nueva.fechaSuspension = p.fecha;
      estadoNuevo = 'SUSPENDIDA';
      break;
    case 'REACTIVACION':
      nueva.estado = 'ACTIVA';
      nueva.fechaActivacion = p.fecha;
      estadoNuevo = 'ACTIVA';
      break;
    case 'CESION':
      nueva.responsableActual = 'TITULAR'; // mismo documento, sin duplicar nada
      break;
    case 'DEVOLUCION':
      nueva.responsableActual = 'GESTOR'; // NO crea propietario ni inmuebles nuevos
      break;
    case 'CAMBIO_PERMISOS':
      nueva.permiso = p.permiso as PermisoGestion;
      break;
    case 'REVOCACION':
      nueva.estado = 'REVOCADA';
      nueva.fechaRevocacion = p.fecha;
      nueva.conservarLecturaHistorica = p.conservarLecturaHistorica === true; // S7 explícito
      estadoNuevo = 'REVOCADA';
      break;
    case 'ALTA':
    case 'INVITACION':
      break; // no cambian estado
  }
  if (p.motivo) nueva.motivoUltimo = p.motivo;

  nueva.eventos.push({
    tipo: p.tipo,
    gestionId: nueva.id,
    actorId: p.actorId,
    actorRol: p.actorRol,
    fecha: p.fecha,
    motivo: p.motivo,
    estadoAnterior,
    estadoNuevo,
    permiso: nueva.permiso,
  });
  return { ok: true, gestion: nueva };
}

// ---------------------------------------------------------------------------
// Permisos (FASE 7) — dominio puro; el enforcement real es D2/D3 (pendiente).
// ---------------------------------------------------------------------------

/** ¿Es este usuario el gestor de la gestión? */
export function esGestorDe(gestion: GestionCartera, usuarioId: string): boolean {
  return gestion.gestorUsuarioId === usuarioId;
}

/**
 * S7: LECTURA histórica ≠ gestión activa.
 * El gestor lee con gestión ACTIVA (sea quien sea el responsableActual) y, si
 * se decidió expresamente al revocar, conserva LECTURA histórica.
 */
export function puedeLeer(gestion: GestionCartera, usuarioId: string): boolean {
  if (!esGestorDe(gestion, usuarioId)) return false;
  if (gestion.estado === 'ACTIVA') return true;
  return gestion.estado === 'REVOCADA' && gestion.conservarLecturaHistorica === true;
}

/** S7: escritura solo con gestión ACTIVA + permiso L/E + responsable GESTOR. */
export function puedeEscribir(gestion: GestionCartera, usuarioId: string): boolean {
  return (
    esGestorDe(gestion, usuarioId) &&
    gestion.estado === 'ACTIVA' &&
    gestion.permiso === 'LECTURA_ESCRITURA' &&
    gestion.responsableActual === 'GESTOR'
  );
}

/** El titular siempre conserva el ámbito de su titularidad (independiente de la gestión). */
export function esTitularDe(gestion: GestionCartera, propietarioId: string): boolean {
  return gestion.propietarioId === propietarioId;
}

// ---------------------------------------------------------------------------
// Consultas e invariantes de conjunto
// ---------------------------------------------------------------------------
export function listarGestionesDePropietario(
  gestiones: GestionCartera[],
  propietarioId: string
): GestionCartera[] {
  return gestiones
    .filter((g) => g.propietarioId === propietarioId)
    .sort((a, b) => a.fechaAlta.localeCompare(b.fechaAlta) || a.id.localeCompare(b.id));
}

export function listarGestionesDeGestor(
  gestiones: GestionCartera[],
  gestorUsuarioId: string
): GestionCartera[] {
  return gestiones
    .filter((g) => g.gestorUsuarioId === gestorUsuarioId)
    .sort((a, b) => a.fechaAlta.localeCompare(b.fechaAlta) || a.id.localeCompare(b.id));
}

/** D1R: máximo una gestión no-REVOCADA por par (titular, gestor). */
export function hayGestionActivaPorPar(
  gestiones: GestionCartera[],
  propietarioId: string,
  gestorUsuarioId: string
): boolean {
  return gestiones.some(
    (g) =>
      g.propietarioId === propietarioId &&
      g.gestorUsuarioId === gestorUsuarioId &&
      g.estado !== 'REVOCADA'
  );
}
