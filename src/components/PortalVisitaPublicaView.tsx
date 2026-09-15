import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  Building2,
  AlertCircle,
  XCircle,
  ShieldCheck,
  ChevronRight,
  UserCheck,
  Info,
  CalendarCheck,
} from 'lucide-react';
import { InvitacionVisita, VisitSlot, Inmueble } from '../types';
import { bookSlotTransaction } from '../lib/firebase';
import { PublicPropertyGallery } from './PublicPropertyGallery';

interface PortalVisitaPublicaViewProps {
  token: string;
  invitaciones: InvitacionVisita[];
  slots: VisitSlot[];
  inmuebles: Inmueble[];
  onUpdateInvitacion: (inv: InvitacionVisita) => void;
  onUpdateSlot: (slot: VisitSlot) => void;
  onUpdateCandidateState?: (candidateId: string, newState: any) => void;
}

export const PortalVisitaPublicaView: React.FC<PortalVisitaPublicaViewProps> = ({
  token,
  invitaciones,
  slots,
  inmuebles,
  onUpdateInvitacion,
  onUpdateSlot,
  onUpdateCandidateState,
}) => {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [notas, setNotas] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Find invitation by token
  const invitacion = invitaciones.find((inv) => inv.token === token);
  const inmueble = inmuebles.find((inm) => inm.id === invitacion?.inmuebleId);

  // On mount or load: automatically mark invitation as ABIERTO if currently ENVIADO or ENLACE GENERADO
  useEffect(() => {
    if (
      invitacion &&
      (invitacion.status === 'ENVIADO' ||
        invitacion.status === 'ENLACE GENERADO' ||
        invitacion.status === 'PENDIENTE DE ENVIAR')
    ) {
      const updated: InvitacionVisita = {
        ...invitacion,
        status: 'ABIERTO',
        openedAt: invitacion.openedAt || new Date().toISOString(),
      };
      onUpdateInvitacion(updated);
    }
  }, [invitacion?.token]);

  if (!invitacion) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Invitación no encontrada</h2>
          <p className="text-sm text-slate-500 mb-6">
            El enlace de citación no es válido o ha expirado. Por favor, contacta con el propietario para solicitar un nuevo enlace.
          </p>
        </div>
      </div>
    );
  }

  // All slots for this property
  const allPropertySlots = slots.filter((s) => s.inmuebleId === invitacion.inmuebleId);

  // Group slots by date
  const slotsByDate: { [key: string]: VisitSlot[] } = {};
  allPropertySlots.forEach((slot) => {
    if (!slotsByDate[slot.fecha]) {
      slotsByDate[slot.fecha] = [];
    }
    slotsByDate[slot.fecha].push(slot);
  });

  const isBooked = invitacion.status === 'HORARIO RESERVADO' && invitacion.reserva;

  const handleConfirmBooking = async () => {
    if (!selectedSlotId) return;
    const targetSlot = slots.find((s) => s.id === selectedSlotId);
    if (!targetSlot) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const nowIso = new Date().toISOString();
    const fullAddress = inmueble
      ? `${inmueble.direccion}, ${inmueble.ciudad}`
      : invitacion.inmuebleNombre;

    try {
      // 1. Attempt atomic booking via Firestore transaction
      await bookSlotTransaction(
        targetSlot.id,
        {
          id: invitacion.candidateId,
          nombre: invitacion.candidateNombre,
          telefono: invitacion.candidateTelefono,
          email: invitacion.candidateEmail,
        },
        invitacion.id,
        fullAddress,
        notas
      );
    } catch (err: any) {
      console.warn('Firestore transaction fallback to state updates:', err);
      // Fallback local update if offline/mock
      const updatedSlot: VisitSlot = {
        ...targetSlot,
        disponible: false,
        reservaCandidateId: invitacion.candidateId,
        reservaCandidateNombre: invitacion.candidateNombre,
        reservaInvitationId: invitacion.id,
      };
      onUpdateSlot(updatedSlot);

      const updatedInv: InvitacionVisita = {
        ...invitacion,
        status: 'HORARIO RESERVADO',
        bookedAt: nowIso,
        reserva: {
          slotId: targetSlot.id,
          fecha: targetSlot.fecha,
          horaInicio: targetSlot.horaInicio,
          horaFin: targetSlot.horaFin,
          direccionCompleta: fullAddress,
          notasCandidato: notas,
        },
      };
      onUpdateInvitacion(updatedInv);

      if (onUpdateCandidateState) {
        onUpdateCandidateState(invitacion.candidateId, 'visita_reservada');
      }
    } finally {
      setIsSubmitting(false);
      setSuccessMessage('¡Reserva confirmada con éxito!');
    }
  };

  const handleCancelReservation = () => {
    const slotIdToFree = invitacion.reserva?.slotId;
    if (!slotIdToFree) return;
    setIsSubmitting(true);

    const existingSlot = slots.find((s) => s.id === slotIdToFree);
    const updatedSlot: VisitSlot = {
      ...(existingSlot || {
        id: slotIdToFree,
        inmuebleId: invitacion.inmuebleId,
        fecha: invitacion.reserva?.fecha || '',
        horaInicio: invitacion.reserva?.horaInicio || '',
        horaFin: invitacion.reserva?.horaFin || '',
      }),
      disponible: true,
      reservaCandidateId: undefined,
      reservaCandidateNombre: undefined,
      reservaInvitationId: undefined,
    };

    onUpdateSlot(updatedSlot);

    onUpdateInvitacion({
      ...invitacion,
      status: 'ABIERTO',
      reserva: undefined,
    });

    if (onUpdateCandidateState) {
      onUpdateCandidateState(invitacion.candidateId, 'preseleccionado');
    }

    setTimeout(() => {
      setIsSubmitting(false);
      setShowCancelConfirm(false);
      setSelectedSlotId(null);
      setSuccessMessage('Tu reserva ha sido cancelada y el horario ha quedado liberado.');
    }, 400);
  };

  const formatDateLabel = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        return d.toLocaleDateString('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      {/* Top Banner Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-lg shadow-sm">
              RS
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight text-white">Reserva de Visita a la Vivienda</h1>
              <p className="text-xs text-slate-400">Portal del Candidato • RentSelect</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1.5 rounded-full font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>Preseleccionado</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        {/* Candidate & Property Hero Card */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs relative overflow-hidden space-y-5">
          <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between border-b border-slate-100 pb-5">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md mb-2 inline-block">
                Invitación Personal
              </span>
              <h2 className="text-xl font-bold text-slate-900">Hola, {invitacion.candidateNombre}</h2>
              <p className="text-xs text-slate-500 mt-1">
                Has sido preseleccionado/a para visitar el inmueble <strong className="text-slate-800">{invitacion.inmuebleNombre}</strong>.
              </p>
            </div>
          </div>

          {/* Public Image Gallery */}
          {inmueble && (
            <div>
              <PublicPropertyGallery inmueble={inmueble} />
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-2">
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <span className="text-slate-400 block text-[11px]">Vivienda</span>
              <span className="font-semibold text-slate-800 text-sm block mt-0.5">{invitacion.inmuebleNombre}</span>
            </div>
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <span className="text-slate-400 block text-[11px]">Renta mensual</span>
              <span className="font-semibold text-blue-600 text-sm block mt-0.5">{inmueble?.precio ?? invitacion.inmueblePrecio} €/mes</span>
            </div>
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 col-span-2 sm:col-span-1">
              <span className="text-slate-400 block text-[11px]">Zona / Ciudad</span>
              <span className="font-semibold text-slate-800 text-sm block mt-0.5">{inmueble?.ciudad || invitacion.inmuebleCiudad || 'Zona residencial'}</span>
            </div>
          </div>
        </div>

        {/* Success / Alert Messages */}
        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-4 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="font-medium">{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-700 hover:text-emerald-900">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* IF RESERVED -> SHOW CONFIRMATION & DETAILS */}
        {isBooked && (
          <div className="bg-white rounded-3xl p-6 border-2 border-emerald-500/30 shadow-md space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md">
                <CalendarCheck className="w-6 h-6" />
              </div>
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
                  Visita Confirmada
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">Horario Reservado</h3>
              </div>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-5 space-y-3 text-xs">
              <div className="flex items-start gap-3 text-slate-800">
                <Calendar className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <span className="text-slate-500 text-[11px] block">Día y Hora</span>
                  <span className="font-bold text-slate-900 text-sm capitalize">
                    {formatDateLabel(invitacion.reserva!.fecha)} • {invitacion.reserva!.horaInicio} - {invitacion.reserva!.horaFin}
                  </span>
                </div>
              </div>

              {/* Exact Street Address revealed ONLY now! */}
              <div className="flex items-start gap-3 text-slate-800 border-t border-emerald-100 pt-3">
                <MapPin className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <span className="text-slate-500 text-[11px] block">Dirección Exacta de la Visita</span>
                  <span className="font-bold text-emerald-900 text-sm block mt-0.5">
                    {invitacion.reserva!.direccionCompleta}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-xs text-slate-600 space-y-2">
              <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-blue-600" />
                Información importante para tu visita:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-600 text-[11px]">
                <li>Por favor acude con 5 minutos de antelación.</li>
                <li>Si no vas a poder asistir, por favor libera tu cita con antelación para permitir que otros interesados la aprovechen.</li>
              </ul>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>Cancelar reserva de visita</span>
              </button>
            </div>
          </div>
        )}

        {/* CANCEL CONFIRMATION MODAL INSIDE PUBLIC VIEW */}
        {showCancelConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">¿Cancelar la cita de visita?</h3>
              <p className="text-xs text-slate-500">
                Al cancelar, el horario quedará liberado inmediatamente para otros candidatos. Podrás volver a reservar si hay turnos disponibles.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors"
                >
                  Volver
                </button>
                <button
                  onClick={handleCancelReservation}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
                >
                  {isSubmitting ? 'Cancelando...' : 'Sí, cancelar cita'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* IF NOT BOOKED -> SELECTION OF TIME SLOTS */}
        {!isBooked && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                <span>Selecciona el día y hora para tu visita</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Los turnos se actualizan en tiempo real. Selecciona el pase que mejor se adapte a tu disponibilidad.
              </p>
            </div>

            {Object.keys(slotsByDate).length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
                <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">No hay horarios disponibles actualmente</p>
                <p className="text-xs text-slate-500 mt-1">
                  El propietario publicará nuevos turnos próximamente. Te recomendamos revisar este enlace más adelante.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(slotsByDate).map(([dateStr, dateSlots]) => (
                  <div key={dateStr} className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 capitalize flex items-center gap-2 bg-slate-100/80 px-3 py-1.5 rounded-lg w-fit">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      <span>{formatDateLabel(dateStr)}</span>
                    </h4>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {dateSlots.map((slot) => {
                        const isSelected = selectedSlotId === slot.id;

                        return (
                          <button
                            key={slot.id}
                            disabled={!slot.disponible}
                            onClick={() => setSelectedSlotId(slot.id)}
                            className={`p-3.5 rounded-2xl text-left border transition-all flex flex-col justify-between relative ${
                              !slot.disponible
                                ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                                : isSelected
                                ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20'
                                : 'bg-white border-slate-200 text-slate-800 hover:border-blue-400 hover:bg-blue-50/50'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="text-xs font-bold flex items-center gap-1.5">
                                <Clock className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-blue-600'}`} />
                                {slot.horaInicio} - {slot.horaFin}
                              </span>
                              {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                            </div>

                            <span className={`text-[10px] mt-2 font-medium ${isSelected ? 'text-blue-100' : slot.disponible ? 'text-emerald-600' : 'text-slate-400'}`}>
                              {slot.disponible ? 'Disponible' : 'Reservado'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Confirm Button */}
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Observaciones / Comentarios para el propietario (Opcional):
                    </label>
                    <textarea
                      rows={2}
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      placeholder="Indica si vendrás acompañado/a o si tienes alguna preferencia puntual..."
                      className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                    />
                  </div>

                  <button
                    disabled={!selectedSlotId || isSubmitting}
                    onClick={handleConfirmBooking}
                    className={`w-full py-3.5 px-6 rounded-2xl text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2 ${
                      selectedSlotId && !isSubmitting
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 cursor-pointer'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {isSubmitting ? (
                      <span>Confirmando reserva...</span>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Confirmar horario de visita</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
