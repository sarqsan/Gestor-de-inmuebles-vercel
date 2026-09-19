import {
  Candidato,
  CobroPeriodo,
  ContratoFormalizacion,
  EstadoHabitacion,
  HabitacionInmueble,
  HistorialHabitacionItem,
  Inmueble,
  InvitacionVisita,
  Profesional,
  UsuarioApp,
  VisitSlot,
} from '../types';
import { canAccessInmueble, isAdmin, isProfesional, isPropietario } from '../lib/authService';
import { generarPeriodosParaContrato } from './cobrosEngine';

export const ESTADOS_HABITACION: EstadoHabitacion[] = [
  'DISPONIBLE',
  'RESERVADA',
  'EN_PROCESO',
  'OCUPADA',
  'ALQUILADA',
  'NO_DISPONIBLE',
  'BLOQUEADA',
  'INACTIVA',
];

export const ESTADO_HABITACION_LABELS: Record<EstadoHabitacion, string> = {
  DISPONIBLE: 'Disponible',
  RESERVADA: 'Reservada',
  EN_PROCESO: 'En proceso',
  OCUPADA: 'Ocupada',
  ALQUILADA: 'Ocupada',
  NO_DISPONIBLE: 'No disponible',
  BLOQUEADA: 'Bloqueada',
  INACTIVA: 'Inactiva',
};

export function estadoHabitacionEfectivo(estado: EstadoHabitacion): EstadoHabitacion {
  if (estado === 'ALQUILADA') return 'OCUPADA';
  return estado;
}

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

export function profesionalPuedeVerEconomiaHabitacion(
  usuario: UsuarioApp | null | undefined
): boolean {
  if (!usuario) return false;
  if (isProfesional(usuario)) return false;
  return isAdmin(usuario) || isPropietario(usuario);
}

export function asegurarHabitacionesDelInmueble(
  items: HabitacionInmueble[],
  inmuebleId: string
): HabitacionInmueble[] {
  return items.filter((h) => h.inmuebleId === inmuebleId);
}

export function habitacionesTrasCambioModalidad(
  items: HabitacionInmueble[],
  inmuebleId: string,
  _nuevaModalidad: 'completo' | 'habitaciones'
): HabitacionInmueble[] {
  return asegurarHabitacionesDelInmueble(items, inmuebleId);
}

function pushHistorial(
  hab: HabitacionInmueble,
  usuarioNombre: string,
  accion: string,
  estadoNuevo: EstadoHabitacion,
  detalle?: string,
  contratoId?: string
): HistorialHabitacionItem[] {
  const item: HistorialHabitacionItem = {
    id: `hh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    fecha: new Date().toISOString(),
    usuarioNombre,
    accion,
    estadoAnterior: hab.estado,
    estadoNuevo,
    contratoId,
    detalle,
  };
  return [item, ...(hab.historial || [])];
}

export function transicionHabitacionPermitida(
  desde: EstadoHabitacion,
  hacia: EstadoHabitacion
): boolean {
  const a = estadoHabitacionEfectivo(desde);
  const b = estadoHabitacionEfectivo(hacia);
  if (a === b) return true;
  const permitidas: Record<string, EstadoHabitacion[]> = {
    DISPONIBLE: ['RESERVADA', 'OCUPADA', 'BLOQUEADA', 'INACTIVA'],
    RESERVADA: ['OCUPADA', 'DISPONIBLE', 'BLOQUEADA'],
    OCUPADA: ['DISPONIBLE', 'INACTIVA'],
    BLOQUEADA: ['DISPONIBLE'],
    INACTIVA: ['DISPONIBLE'],
  };
  return (permitidas[a] || []).includes(b);
}

export function aplicarCambioEstadoHabitacion(
  hab: HabitacionInmueble,
  nuevo: EstadoHabitacion,
  usuarioNombre: string,
  opts?: { motivoBloqueo?: string; contratoId?: string }
): HabitacionInmueble {
  const destino = estadoHabitacionEfectivo(nuevo);
  if (!transicionHabitacionPermitida(hab.estado, destino)) {
    throw new Error(`Transición de ${hab.estado} a ${destino} no permitida.`);
  }
  if (destino === 'OCUPADA' && (hab.estado === 'BLOQUEADA' || !hab.activo || hab.estado === 'INACTIVA')) {
    throw new Error('No se puede ocupar una habitación bloqueada o inactiva.');
  }
  return {
    ...hab,
    estado: destino,
    activo: destino === 'INACTIVA' ? false : hab.activo,
    motivoBloqueo: destino === 'BLOQUEADA' ? opts?.motivoBloqueo || hab.motivoBloqueo : undefined,
    fechaModificacion: new Date().toISOString(),
    actualizadoPor: usuarioNombre,
    historial: pushHistorial(hab, usuarioNombre, `ESTADO_${destino}`, destino, opts?.motivoBloqueo, opts?.contratoId),
  };
}

export function aplicarDesactivarHabitacion(
  hab: HabitacionInmueble,
  usuarioNombre: string
): HabitacionInmueble {
  return aplicarCambioEstadoHabitacion(hab, 'INACTIVA', usuarioNombre);
}

export function contratoEstaActivo(c: ContratoFormalizacion): boolean {
  return c.esVigente === true || c.estado === 'FORMALIZADO_ACTIVO';
}

export function contratosActivosHabitacion(
  contratos: ContratoFormalizacion[],
  habitacionId: string
): ContratoFormalizacion[] {
  return contratos.filter((c) => c.habitacionId === habitacionId && contratoEstaActivo(c));
}

export function validarContratoHabitacion(opts: {
  contrato: ContratoFormalizacion;
  habitacion?: HabitacionInmueble;
  inmueble?: Inmueble;
  contratosExistentes: ContratoFormalizacion[];
}): string | null {
  const { contrato, habitacion, inmueble, contratosExistentes } = opts;
  if (contrato.modalidadAlquiler === 'habitaciones' && !contrato.habitacionId) {
    return 'En modalidad habitaciones el contrato requiere habitacionId.';
  }
  if (!contrato.habitacionId) return null;
  if (!habitacion) return 'La habitación no existe.';
  if (habitacion.inmuebleId !== contrato.inmuebleId) {
    return 'La habitación no pertenece al inmueble del contrato.';
  }
  if (inmueble && inmueble.id !== contrato.inmuebleId) {
    return 'El inmueble del contrato no coincide.';
  }
  if (inmueble) {
    const prop = inmueble.propietarioId || inmueble.propietarioPrincipalId;
    if (prop && contrato.propietarioId && contrato.propietarioId !== prop) {
      return 'El contrato no corresponde al propietario del inmueble.';
    }
  }
  const otros = contratosActivosHabitacion(contratosExistentes, contrato.habitacionId).filter(
    (c) => c.id !== contrato.id
  );
  if (contratoEstaActivo(contrato) && otros.length > 0) {
    return 'Ya existe un contrato activo incompatible para esta habitación.';
  }
  const est = estadoHabitacionEfectivo(habitacion.estado);
  if (contratoEstaActivo(contrato) && (est === 'BLOQUEADA' || est === 'INACTIVA' || habitacion.activo === false)) {
    return 'No se puede ocupar una habitación bloqueada o inactiva.';
  }
  return null;
}

export function reasignacionContratoHabitacionProhibida(
  actual: ContratoFormalizacion,
  siguiente: Partial<ContratoFormalizacion>
): boolean {
  if (!contratoEstaActivo(actual)) return false;
  if (siguiente.inmuebleId && siguiente.inmuebleId !== actual.inmuebleId) return true;
  if (siguiente.habitacionId && actual.habitacionId && siguiente.habitacionId !== actual.habitacionId) {
    return true;
  }
  return false;
}

export function ocupacionDesdeContrato(
  hab: HabitacionInmueble,
  contrato: ContratoFormalizacion,
  usuarioNombre: string
): HabitacionInmueble {
  return aplicarCambioEstadoHabitacion(hab, 'OCUPADA', usuarioNombre, { contratoId: contrato.id });
}

export function finalizarOcupacionHabitacion(
  hab: HabitacionInmueble,
  usuarioNombre: string
): HabitacionInmueble {
  return aplicarCambioEstadoHabitacion(hab, 'DISPONIBLE', usuarioNombre);
}

export function candidatoNoOcupaHabitacion(
  candidato: Candidato,
  hab: HabitacionInmueble
): boolean {
  return estadoHabitacionEfectivo(hab.estado) !== 'OCUPADA' || !candidato.habitacionId;
}

export function reservaNoEsContrato(inv: InvitacionVisita): boolean {
  return inv.status !== 'FORMALIZADO' as never;
}

export interface DisponibilidadHabitacion {
  estado: EstadoHabitacion;
  ocupadaDesde?: string;
  ocupadaHasta?: string;
  proximaDisponibilidad?: string;
  motivoBloqueo?: string;
  inquilino?: string;
  renta?: number;
  contratoId?: string;
}

export function disponibilidadHabitacion(
  hab: HabitacionInmueble,
  contratos: ContratoFormalizacion[]
): DisponibilidadHabitacion {
  const activos = contratosActivosHabitacion(contratos, hab.id);
  const hist = contratos
    .filter((c) => c.habitacionId === hab.id)
    .sort((a, b) => (b.fechaInicioContrato || '').localeCompare(a.fechaInicioContrato || ''));
  const actual = activos[0];
  const est = estadoHabitacionEfectivo(hab.estado);
  if (actual) {
    return {
      estado: 'OCUPADA',
      ocupadaDesde: actual.fechaInicioContrato,
      ocupadaHasta: actual.fechaFinContrato,
      proximaDisponibilidad: actual.fechaFinContrato,
      inquilino: actual.candidatoNombre,
      renta: actual.rentaMensual,
      contratoId: actual.id,
    };
  }
  if (est === 'BLOQUEADA') {
    return { estado: 'BLOQUEADA', motivoBloqueo: hab.motivoBloqueo };
  }
  if (est === 'INACTIVA' || hab.activo === false) {
    return { estado: 'INACTIVA' };
  }
  const ultimo = hist[0];
  return {
    estado: est,
    ocupadaDesde: ultimo && !contratoEstaActivo(ultimo) ? ultimo.fechaInicioContrato : undefined,
    ocupadaHasta: ultimo && !contratoEstaActivo(ultimo) ? ultimo.fechaFinContrato : undefined,
    proximaDisponibilidad: est === 'DISPONIBLE' ? new Date().toISOString().slice(0, 10) : undefined,
  };
}

export function resumenRentasHabitaciones(
  habitaciones: HabitacionInmueble[],
  contratos: ContratoFormalizacion[]
) {
  const activas = habitaciones.filter((h) => h.activo !== false && estadoHabitacionEfectivo(h.estado) !== 'INACTIVA');
  const potencial = activas.reduce((s, h) => s + (h.precioObjetivo || 0), 0);
  let ocupada = 0;
  let disponibles = 0;
  let reservadas = 0;
  let ocupadas = 0;
  let bloqueadas = 0;
  let inactivas = 0;
  for (const h of habitaciones) {
    const d = disponibilidadHabitacion(h, contratos);
    const e = estadoHabitacionEfectivo(d.estado);
    if (e === 'OCUPADA') {
      ocupadas++;
      ocupada += d.renta || h.precioObjetivo || 0;
    } else if (e === 'RESERVADA') reservadas++;
    else if (e === 'BLOQUEADA') bloqueadas++;
    else if (e === 'INACTIVA') inactivas++;
    else disponibles++;
  }
  return {
    total: habitaciones.length,
    disponibles,
    reservadas,
    ocupadas,
    bloqueadas,
    inactivas,
    rentaPotencial: potencial,
    rentaOcupada: ocupada,
    rentaPendiente: Math.max(0, potencial - ocupada),
  };
}

export function cobrosDeHabitacion(cobros: CobroPeriodo[], habitacionId: string): CobroPeriodo[] {
  return cobros.filter((c) => c.habitacionId === habitacionId);
}

export function periodosContratoConHabitacion(contrato: ContratoFormalizacion): CobroPeriodo[] {
  const periodos = generarPeriodosParaContrato(contrato);
  return periodos.map((p) => ({
    ...p,
    habitacionId: p.habitacionId || contrato.habitacionId,
  }));
}

export function contratoCompletoSinHabitacionValido(contrato: ContratoFormalizacion): boolean {
  return !contrato.habitacionId && contrato.modalidadAlquiler !== 'habitaciones';
}

export function aplicarReservaHabitacion(hab: HabitacionInmueble, usuarioNombre: string): HabitacionInmueble {
  return aplicarCambioEstadoHabitacion(hab, 'RESERVADA', usuarioNombre);
}

export function cancelarReservaHabitacion(hab: HabitacionInmueble, usuarioNombre: string): HabitacionInmueble {
  if (estadoHabitacionEfectivo(hab.estado) !== 'RESERVADA') return hab;
  return aplicarCambioEstadoHabitacion(hab, 'DISPONIBLE', usuarioNombre);
}

export function reservaSlotSoloEsaHabitacion(slot: VisitSlot, habitacionId: string): boolean {
  return !!slot.habitacionId && slot.habitacionId === habitacionId;
}

export function candidatoSoloSuHabitacion(
  candidato: Pick<Candidato, 'habitacionId'>,
  habitacionId: string
): boolean {
  return !!candidato.habitacionId && candidato.habitacionId === habitacionId;
}

export function payloadIdsCruzadosDenegado(
  incoming: { inmuebleId: string; propietarioId?: string; habitacionId?: string },
  inmueble: Inmueble,
  habitacion?: HabitacionInmueble
): boolean {
  if (incoming.inmuebleId !== inmueble.id) return true;
  const prop = inmueble.propietarioId || inmueble.propietarioPrincipalId;
  if (incoming.propietarioId && prop && incoming.propietarioId !== prop) return true;
  if (habitacion && habitacion.inmuebleId !== inmueble.id) return true;
  if (habitacion && incoming.habitacionId && incoming.habitacionId !== habitacion.id) return true;
  return false;
}

export function habitacionDisponibleParaNuevaSeleccion(
  hab: HabitacionInmueble,
  contratos: ContratoFormalizacion[]
): boolean {
  const d = disponibilidadHabitacion(hab, contratos);
  const e = estadoHabitacionEfectivo(d.estado);
  return e === 'DISPONIBLE' && hab.activo !== false;
}

export interface SeleccionCandidatoHabitacion {
  candidatoId: string;
  habitacionId: string;
  inmuebleId: string;
  propietarioId: string;
  fechaSeleccion: string;
  usuarioNombre: string;
}

export function candidatoAsociadoAHabitacion(
  candidato: Pick<Candidato, 'habitacionId' | 'inmuebleId'>,
  habitacion: HabitacionInmueble,
  inmueble: Inmueble
): boolean {
  return (
    candidato.habitacionId === habitacion.id &&
    candidato.inmuebleId === inmueble.id &&
    habitacion.inmuebleId === inmueble.id
  );
}

export function visitaConHabitacion(
  slot: VisitSlot | InvitacionVisita,
  habitacionId: string,
  inmuebleId: string
): boolean {
  return slot.habitacionId === habitacionId && slot.inmuebleId === inmuebleId;
}

export type ResultadoAsignacionHabitacion =
  | { ok: true; habitacion: HabitacionInmueble; seleccion: SeleccionCandidatoHabitacion }
  | { ok: false; motivo: string; conflicto: true };

export function intentarReservarHabitacion(opts: {
  habitacion: HabitacionInmueble;
  candidatoId: string;
  inmueble: Inmueble;
  usuarioNombre: string;
  expectedFechaModificacion?: string;
  contratos?: ContratoFormalizacion[];
}): ResultadoAsignacionHabitacion {
  const { habitacion, candidatoId, inmueble, usuarioNombre, expectedFechaModificacion, contratos = [] } = opts;
  if (habitacion.inmuebleId !== inmueble.id) {
    return { ok: false, motivo: 'La habitación no pertenece al inmueble.', conflicto: true };
  }
  if (
    expectedFechaModificacion &&
    habitacion.fechaModificacion &&
    expectedFechaModificacion !== habitacion.fechaModificacion
  ) {
    return { ok: false, motivo: 'Conflicto de concurrencia: la habitación ha cambiado.', conflicto: true };
  }
  if (habitacion.selectedCandidatoId && habitacion.selectedCandidatoId !== candidatoId) {
    return { ok: false, motivo: 'La habitación ya está reservada/asignada a otro candidato.', conflicto: true };
  }
  if (habitacion.selectedCandidatoId === candidatoId && estadoHabitacionEfectivo(habitacion.estado) === 'RESERVADA') {
    return {
      ok: true,
      habitacion,
      seleccion: {
        candidatoId,
        habitacionId: habitacion.id,
        inmuebleId: inmueble.id,
        propietarioId: habitacion.propietarioId || inmueble.propietarioId || '',
        fechaSeleccion: habitacion.fechaModificacion,
        usuarioNombre,
      },
    };
  }
  if (!habitacionDisponibleParaNuevaSeleccion(habitacion, contratos) && estadoHabitacionEfectivo(habitacion.estado) !== 'RESERVADA') {
    return { ok: false, motivo: 'La habitación no está disponible para reserva.', conflicto: true };
  }
  const next = aplicarReservaHabitacion({ ...habitacion, selectedCandidatoId: candidatoId }, usuarioNombre);
  next.selectedCandidatoId = candidatoId;
  return {
    ok: true,
    habitacion: next,
    seleccion: {
      candidatoId,
      habitacionId: next.id,
      inmuebleId: inmueble.id,
      propietarioId: next.propietarioId || inmueble.propietarioId || '',
      fechaSeleccion: next.fechaModificacion,
      usuarioNombre,
    },
  };
}

export function intentarSeleccionarCandidatoHabitacion(opts: {
  habitacion: HabitacionInmueble;
  candidato: Pick<Candidato, 'id' | 'habitacionId' | 'inmuebleId'>;
  inmueble: Inmueble;
  usuarioNombre: string;
  expectedFechaModificacion?: string;
  contratos?: ContratoFormalizacion[];
}): ResultadoAsignacionHabitacion {
  const { habitacion, candidato, inmueble, usuarioNombre, expectedFechaModificacion, contratos = [] } = opts;
  if (candidato.inmuebleId !== inmueble.id || candidato.habitacionId !== habitacion.id) {
    return { ok: false, motivo: 'El candidato no está asociado a esta habitación.', conflicto: true };
  }
  if (
    expectedFechaModificacion &&
    habitacion.fechaModificacion &&
    expectedFechaModificacion !== habitacion.fechaModificacion
  ) {
    return { ok: false, motivo: 'Conflicto de concurrencia (pestaña/reintento).', conflicto: true };
  }
  if (habitacion.selectedCandidatoId && habitacion.selectedCandidatoId !== candidato.id) {
    return { ok: false, motivo: 'Ya existe una selección incompatible.', conflicto: true };
  }
  const d = disponibilidadHabitacion(habitacion, contratos);
  if (estadoHabitacionEfectivo(d.estado) === 'OCUPADA') {
    return { ok: false, motivo: 'Habitación ocupada: selección denegada.', conflicto: true };
  }
  const next: HabitacionInmueble = {
    ...habitacion,
    selectedCandidatoId: candidato.id,
    estado: estadoHabitacionEfectivo(habitacion.estado) === 'RESERVADA' ? habitacion.estado : 'EN_PROCESO',
    fechaModificacion: new Date().toISOString(),
    actualizadoPor: usuarioNombre,
  };
  return {
    ok: true,
    habitacion: next,
    seleccion: {
      candidatoId: candidato.id,
      habitacionId: habitacion.id,
      inmuebleId: inmueble.id,
      propietarioId: habitacion.propietarioId || inmueble.propietarioId || inmueble.propietarioPrincipalId || '',
      fechaSeleccion: next.fechaModificacion,
      usuarioNombre,
    },
  };
}

export function trazabilidadCircuitoHabitacion(opts: {
  candidato: Pick<Candidato, 'id' | 'habitacionId' | 'inmuebleId'>;
  visita?: InvitacionVisita | VisitSlot;
  habitacion: HabitacionInmueble;
  seleccion?: SeleccionCandidatoHabitacion;
  contrato?: ContratoFormalizacion;
  cobros?: CobroPeriodo[];
}): boolean {
  const { candidato, visita, habitacion, seleccion, contrato, cobros } = opts;
  if (candidato.habitacionId !== habitacion.id) return false;
  if (visita && visita.habitacionId && visita.habitacionId !== habitacion.id) return false;
  if (seleccion && seleccion.habitacionId !== habitacion.id) return false;
  if (seleccion && seleccion.candidatoId !== candidato.id) return false;
  if (contrato && contrato.habitacionId !== habitacion.id) return false;
  if (contrato && contrato.candidatoId !== candidato.id) return false;
  if (cobros && cobros.some((c) => c.habitacionId && c.habitacionId !== habitacion.id)) return false;
  return true;
}

export function tokenPublicoSoloRecursoAutorizado(
  token: string,
  invitacion: InvitacionVisita,
  otras: InvitacionVisita[]
): InvitacionVisita[] {
  if (!token || invitacion.token !== token) return [];
  return otras.filter(
    (i) =>
      i.token === token &&
      i.id === invitacion.id &&
      (!invitacion.habitacionId || i.habitacionId === invitacion.habitacionId)
  );
}

export function simulacionDobleAsignacion(
  habitacion: HabitacionInmueble,
  candidatoA: string,
  candidatoB: string,
  inmueble: Inmueble
): { ganador: string; perdedorDenegado: boolean } {
  const r1 = intentarReservarHabitacion({
    habitacion,
    candidatoId: candidatoA,
    inmueble,
    usuarioNombre: 'A',
  });
  if (!r1.ok) return { ganador: '', perdedorDenegado: true };
  const r2 = intentarReservarHabitacion({
    habitacion: r1.habitacion,
    candidatoId: candidatoB,
    inmueble,
    usuarioNombre: 'B',
    expectedFechaModificacion: habitacion.fechaModificacion,
  });
  return { ganador: candidatoA, perdedorDenegado: !r2.ok };
}
