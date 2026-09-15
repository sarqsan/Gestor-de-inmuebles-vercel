import React, { useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  Phone,
  Building2,
  CheckCircle2,
  MapPin,
  CalendarCheck,
  Trash2,
  Ban,
  Plus,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { Inmueble, VisitSlot, InvitacionVisita, Candidato } from '../types';

interface VerAgendaInmuebleModalProps {
  inmueble: Inmueble;
  slots: VisitSlot[];
  invitaciones: InvitacionVisita[];
  candidatos: Candidato[];
  onClose: () => void;
  onOpenConfigurarAgenda?: (inmuebleId: string) => void;
  onDeleteSlot?: (slotId: string) => void;
  onDeleteSlotsBatch?: (slotIds: string[]) => void;
  onUpdateSlot?: (slot: VisitSlot) => void;
}

export const VerAgendaInmuebleModal: React.FC<VerAgendaInmuebleModalProps> = ({
  inmueble,
  slots,
  invitaciones,
  candidatos,
  onClose,
  onOpenConfigurarAgenda,
  onDeleteSlot,
  onDeleteSlotsBatch,
  onUpdateSlot,
}) => {
  const [confirmDeleteDay, setConfirmDeleteDay] = useState<string | null>(null);
  const [showConfirmDeleteAll, setShowConfirmDeleteAll] = useState<boolean>(false);

  // Filter real slots belonging to this property
  const propertySlots = slots.filter((s) => s.inmuebleId === inmueble.id);

  // Group slots by date
  const slotsByDate: { [fecha: string]: VisitSlot[] } = {};
  propertySlots.forEach((slot) => {
    if (!slotsByDate[slot.fecha]) {
      slotsByDate[slot.fecha] = [];
    }
    slotsByDate[slot.fecha].push(slot);
  });

  // Sort dates
  const sortedDates = Object.keys(slotsByDate).sort();

  // Sort slots within each date by start time
  sortedDates.forEach((fecha) => {
    slotsByDate[fecha].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  });

  const totalSlots = propertySlots.length;
  const reservedSlots = propertySlots.filter((s) => s.disponible === false && !!s.reservaCandidateId);
  const blockedSlots = propertySlots.filter((s) => s.bloqueadoPorPropietario || (s.disponible === false && !s.reservaCandidateId));
  const availableSlotsCount = propertySlots.filter((s) => s.disponible && !s.bloqueadoPorPropietario).length;

  const formatDateLabel = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        const formatted = d.toLocaleDateString('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        return formatted.charAt(0).toUpperCase() + formatted.slice(1);
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  // Helper to find candidate details for a reserved slot
  const getReservationDetails = (slot: VisitSlot) => {
    let candidateName = slot.reservaCandidateNombre || 'Candidato';
    let candidatePhone = '';

    if (slot.reservaCandidateId) {
      const cand = candidatos.find((c) => c.id === slot.reservaCandidateId);
      if (cand) {
        if (!candidateName || candidateName === 'Candidato') candidateName = cand.nombre;
        candidatePhone = cand.telefono || '';
      }
    }

    if (!candidatePhone && slot.reservaInvitationId) {
      const inv = invitaciones.find((i) => i.id === slot.reservaInvitationId);
      if (inv) {
        if (!candidateName || candidateName === 'Candidato') candidateName = inv.candidateNombre;
        candidatePhone = inv.candidateTelefono || '';
      }
    }

    return { candidateName, candidatePhone };
  };

  // Handler for deleting an entire day's slots
  const handleDeleteDay = (fecha: string) => {
    const daySlotIds = (slotsByDate[fecha] || []).map((s) => s.id);
    if (onDeleteSlotsBatch) {
      onDeleteSlotsBatch(daySlotIds);
    } else if (onDeleteSlot) {
      daySlotIds.forEach((id) => onDeleteSlot(id));
    }
    setConfirmDeleteDay(null);
  };

  // Handler for deleting all slots of the property
  const handleDeleteAllSlots = () => {
    const allSlotIds = propertySlots.map((s) => s.id);
    if (onDeleteSlotsBatch) {
      onDeleteSlotsBatch(allSlotIds);
    } else if (onDeleteSlot) {
      allSlotIds.forEach((id) => onDeleteSlot(id));
    }
    setShowConfirmDeleteAll(false);
  };

  // Toggle slot availability / block
  const handleToggleBlockSlot = (slot: VisitSlot) => {
    if (!onUpdateSlot) return;

    if (slot.bloqueadoPorPropietario || !slot.disponible) {
      // Unblock
      const updated: VisitSlot = {
        ...slot,
        disponible: true,
        bloqueadoPorPropietario: false,
      };
      onUpdateSlot(updated);
    } else {
      // Block / Mark occupied
      const updated: VisitSlot = {
        ...slot,
        disponible: false,
        bloqueadoPorPropietario: true,
      };
      onUpdateSlot(updated);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between relative shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30 flex items-center gap-1">
                <CalendarCheck className="w-3.5 h-3.5" />
                Gestión de Agenda de Visitas
              </span>
            </div>
            <h2 className="text-xl font-bold flex items-center gap-2 text-white">
              <Building2 className="w-5 h-5 text-blue-400" />
              {inmueble.direccion}
            </h2>
            <p className="text-xs text-slate-300 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              {inmueble.ciudad}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenConfigurarAgenda && (
              <button
                onClick={() => {
                  onClose();
                  onOpenConfigurarAgenda(inmueble.id);
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                title="Añadir nuevos días u horarios"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">+ Añadir Horarios</span>
              </button>
            )}

            {totalSlots > 0 && (
              <button
                onClick={() => setShowConfirmDeleteAll(true)}
                className="p-2 rounded-xl bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700/50 transition-colors"
                title="Eliminar agenda completa de este inmueble"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Property Summary Metrics */}
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 grid grid-cols-4 gap-2 text-center text-xs shrink-0">
          <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 block font-medium">Total Turnos</span>
            <strong className="text-base font-bold text-slate-900">{totalSlots}</strong>
          </div>
          <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 block font-medium">🟢 Disponibles</span>
            <strong className="text-base font-bold text-emerald-600">{availableSlotsCount}</strong>
          </div>
          <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 block font-medium">🔵 Reservadas</span>
            <strong className="text-base font-bold text-blue-600">{reservedSlots.length}</strong>
          </div>
          <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 block font-medium">🔴 Bloqueadas</span>
            <strong className="text-base font-bold text-rose-600">{blockedSlots.length}</strong>
          </div>
        </div>

        {/* Confirm Delete All Modal Overlay */}
        {showConfirmDeleteAll && (
          <div className="p-4 bg-rose-50 border-b border-rose-200 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2 text-rose-900 text-xs font-semibold">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>¿Eliminar TODA la agenda de este inmueble? ({totalSlots} turnos)</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowConfirmDeleteAll(false)}
                className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg border border-slate-300"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAllSlots}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs"
              >
                Sí, eliminar agenda
              </button>
            </div>
          </div>
        )}

        {/* Modal Content / Slots list */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 text-xs">
          {totalSlots === 0 ? (
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto">
                <Calendar className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Sin franjas de agenda creadas</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Aún no has configurado días y horarios de visita para este inmueble.
                </p>
              </div>
              {onOpenConfigurarAgenda && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenConfigurarAgenda(inmueble.id);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  Crear Agenda de Visitas
                </button>
              )}
            </div>
          ) : (
            sortedDates.map((fecha) => {
              const daySlots = slotsByDate[fecha];
              const isConfirmingDay = confirmDeleteDay === fecha;

              return (
                <div key={fecha} className="bg-slate-50/90 rounded-2xl p-4 border border-slate-200/90 space-y-3">
                  {/* Date Header with Action Controls */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-slate-900">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                      <h3 className="font-bold text-sm">{formatDateLabel(fecha)}</h3>
                      <span className="text-xs text-slate-400 font-normal">({fecha})</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px]">
                        {daySlots.length} turnos
                      </span>
                    </div>

                    {/* Delete Day Action */}
                    {isConfirmingDay ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-rose-700">¿Borrar jornada?</span>
                        <button
                          onClick={() => handleDeleteDay(fecha)}
                          className="px-2 py-0.5 bg-rose-600 text-white font-bold text-[10px] rounded-md shadow-2xs"
                        >
                          Sí
                        </button>
                        <button
                          onClick={() => setConfirmDeleteDay(null)}
                          className="px-2 py-0.5 bg-slate-200 text-slate-700 font-bold text-[10px] rounded-md"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteDay(fecha)}
                        className="px-2.5 py-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors"
                        title="Eliminar todos los turnos de este día"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Borrar día</span>
                      </button>
                    )}
                  </div>

                  {/* Slots Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {daySlots.map((slot) => {
                      const isReserved = slot.disponible === false && !!slot.reservaCandidateId;
                      const isBlocked = slot.bloqueadoPorPropietario || (slot.disponible === false && !slot.reservaCandidateId);
                      const details = isReserved ? getReservationDetails(slot) : null;

                      return (
                        <div
                          key={slot.id}
                          className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between space-y-2 relative group ${
                            isReserved
                              ? 'bg-blue-50/60 border-blue-200 text-blue-900'
                              : isBlocked
                              ? 'bg-rose-50/40 border-rose-200 text-rose-900'
                              : 'bg-white border-slate-200/90 hover:border-emerald-300 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Clock className={`w-4 h-4 ${isReserved ? 'text-blue-600' : isBlocked ? 'text-rose-500' : 'text-slate-400'}`} />
                              <span className="font-bold text-sm">
                                {slot.horaInicio} - {slot.horaFin}
                              </span>
                            </div>

                            {/* Status Badge */}
                            {isReserved ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-300 flex items-center gap-1">
                                🔵 Reservada
                              </span>
                            ) : isBlocked ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-300 flex items-center gap-1">
                                🔴 Bloqueado / Ocupado
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 flex items-center gap-1">
                                🟢 Disponible
                              </span>
                            )}
                          </div>

                          {/* Reservation Candidate Details */}
                          {isReserved && details && (
                            <div className="pt-2 border-t border-blue-100/80 space-y-1">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900">
                                <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span className="truncate">{details.candidateName}</span>
                              </div>
                              {details.candidatePhone && (
                                <div className="flex items-center gap-1.5 text-[11px] text-blue-700">
                                  <Phone className="w-3 h-3 text-blue-500 shrink-0" />
                                  <span>{details.candidatePhone}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Controls bar for Landlord */}
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold">
                            {!isReserved ? (
                              <button
                                type="button"
                                onClick={() => handleToggleBlockSlot(slot)}
                                className={`px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
                                  isBlocked
                                    ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                                title={isBlocked ? 'Volver a hacer disponible para candidatos' : 'Marcar como ocupado o no disponible'}
                              >
                                {isBlocked ? (
                                  <>
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Habilitar</span>
                                  </>
                                ) : (
                                  <>
                                    <Ban className="w-3 h-3 text-rose-500" />
                                    <span>Bloquear/Ocupado</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (onUpdateSlot) {
                                    onUpdateSlot({
                                      ...slot,
                                      disponible: true,
                                      reservaCandidateId: undefined,
                                      reservaCandidateNombre: undefined,
                                      reservaInvitationId: undefined,
                                    });
                                  }
                                }}
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 rounded-md transition-colors flex items-center gap-1 font-semibold"
                                title="Liberar la reserva de este candidato para que elija otra hora"
                              >
                                <RotateCcw className="w-3 h-3 text-amber-600" />
                                <span>Liberar reserva</span>
                              </button>
                            )}

                            {onDeleteSlot && (
                              <button
                                type="button"
                                onClick={() => onDeleteSlot(slot.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                                title="Eliminar únicamente este horario"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">
            Resumen en tiempo real del estado de visitas.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
