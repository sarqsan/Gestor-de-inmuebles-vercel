import {
  EstadoHabitacion,
  HabitacionInmueble,
  Inmueble,
  Profesional,
  UsuarioApp,
} from '../types';
import { canAccessInmueble, isAdmin, isProfesional, isPropietario } from '../lib/authService';

export const ESTADOS_HABITACION: EstadoHabitacion[] = [
  'DISPONIBLE',
  'RESERVADA',
  'ALQUILADA',
  'BLOQUEADA',
];

export const ESTADO_HABITACION_LABELS: Record<EstadoHabitacion, string> = {
  DISPONIBLE: 'Disponible',
  RESERVADA: 'Reservada',
  ALQUILADA: 'Alquilada',
  BLOQUEADA: 'Bloqueada',
};

export function inmuebleEnModoHabitaciones(inmueble: Inmueble): boolean {
  return inmueble.modalidadAlquiler === 'habitaciones';
}

export function canAccessHabitacionesInmueble(
  usuario: UsuarioApp | null | undefined,
  inmueble: Inmueble | undefined,
  profesional?: Profesional | null
): boolean {
  if (!usuario || !inmueble) return false;
  return canAccessInmueble(usuario, inmueble, profesional);
}

export function canMutateHabitaciones(
  usuario: UsuarioApp | null | undefined,
  inmueble: Inmueble | undefined,
  profesional?: Profesional | null
): boolean {
  if (!canAccessHabitacionesInmueble(usuario, inmueble, profesional)) return false;
  if (isAdmin(usuario) || isPropietario(usuario)) return true;
  if (isProfesional(usuario)) return false;
  return false;
}

export function asegurarHabitacionesDelInmueble(
  items: HabitacionInmueble[],
  inmuebleId: string
): HabitacionInmueble[] {
  return items.filter((h) => h.inmuebleId === inmuebleId);
}

/**
 * Cambiar modalidad no borra habitaciones. Solo controla si se muestran.
 */
export function habitacionesTrasCambioModalidad(
  items: HabitacionInmueble[],
  inmuebleId: string,
  _nuevaModalidad: 'completo' | 'habitaciones'
): HabitacionInmueble[] {
  return asegurarHabitacionesDelInmueble(items, inmuebleId);
}

export function aplicarDesactivarHabitacion(
  hab: HabitacionInmueble,
  usuarioNombre: string
): HabitacionInmueble {
  return {
    ...hab,
    activo: false,
    fechaModificacion: new Date().toISOString(),
    actualizadoPor: usuarioNombre,
  };
}
