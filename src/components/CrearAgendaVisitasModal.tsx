import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Users,
  X,
  Sparkles,
  Building2,
  ChevronRight,
  UserCheck,
  CheckSquare,
  Square,
  Edit2,
  Check,
} from 'lucide-react';
import { Inmueble, Candidato, VisitSlot, InvitacionVisita } from '../types';
import {
  DayConfig,
  BloqueHorario,
  DURACION_OPCIONES,
  INTERVALO_OPCIONES,
  generateSlotsFromDayConfig,
  formatDateNice,
} from '../utils/agendaUtils';

interface CrearAgendaVisitasModalProps {
  isOpen: boolean;
  onClose: () => void;
  inmuebles: Inmueble[];
  candidatos: Candidato[];
  existingSlots: VisitSlot[];
  existingInvitaciones: InvitacionVisita[];
  selectedInmuebleIdDefault?: string;
  onSaveSlots: (newSlots: VisitSlot[]) => void;
  onSaveInvitacion: (inv: InvitacionVisita) => void;
}

export const CrearAgendaVisitasModal: React.FC<CrearAgendaVisitasModalProps> = ({
  isOpen,
  onClose,
  inmuebles,
  candidatos,
  existingSlots,
  existingInvitaciones,
  selectedInmuebleIdDefault,
  onSaveSlots,
  onSaveInvitacion,
}) => {
  if (!isOpen) return null;

  // Selected property
  const [selectedInmuebleId, setSelectedInmuebleId] = useState<string>(
    selectedInmuebleIdDefault || (inmuebles[0]?.id || '')
  );

  // Wizard step: 'config_agenda' | 'confirm_warning' | 'seleccionar_candidatos' | 'finalizado'
  const [step, setStep] = useState<'config_agenda' | 'confirm_warning' | 'seleccionar_candidatos' | 'finalizado'>(
    'config_agenda'
  );

  // Default initial day config with 0 interval by default
  const defaultInitialDay: DayConfig = {
    id: `day-${Date.now()}-1`,
    fecha: '2026-08-15',
    bloquesHorarios: [
      {
        id: `block-${Date.now()}-1`,
        horaInicio: '08:10',
        horaFin: '09:00',
        duracionMinutos: 5,
        intervaloMinutos: 0,
      },
    ],
  };

  const [dias, setDias] = useState<DayConfig[]>([defaultInitialDay]);
  const [customSlots, setCustomSlots] = useState<VisitSlot[]>([]);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editSlotStart, setEditSlotStart] = useState<string>('');
  const [editSlotEnd, setEditSlotEnd] = useState<string>('');

  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const selectedInmueble = inmuebles.find((i) => i.id === selectedInmuebleId);

  // Existing reserved slots for this property
  const propertyReservedSlots = existingSlots.filter(
    (s) => s.inmuebleId === selectedInmuebleId && (!s.disponible || s.reservaCandidateId)
  );

  // Candidates for this property
  const availableCandidatesForProp = candidatos.filter(
    (c) => c.inmuebleId === selectedInmuebleId || c.estado === 'preseleccionado'
  );

  useEffect(() => {
    const preselectedIds = availableCandidatesForProp
      .filter((c) => c.estado === 'preseleccionado' || c.estado === 'visita_reservada')
      .map((c) => c.id);
    setSelectedCandidateIds(preselectedIds);
  }, [selectedInmuebleId]);

  // Recalculate preview slots whenever dias or selectedInmuebleId changes
  useEffect(() => {
    const generated: VisitSlot[] = [];
    dias.forEach((dayConfig) => {
      const slots = generateSlotsFromDayConfig(dayConfig, selectedInmuebleId);
      generated.push(...slots);
    });
    setCustomSlots(generated);
  }, [dias, selectedInmuebleId]);

  // Handlers for Day Configurations
  const handleAddDay = () => {
    const lastDay = dias[dias.length - 1];
    let nextDate = '2026-08-16';
    if (lastDay && lastDay.fecha) {
      try {
        const d = new Date(lastDay.fecha);
        d.setDate(d.getDate() + 1);
        nextDate = d.toISOString().split('T')[0];
      } catch {
        nextDate = '2026-08-16';
      }
    }

    const newDay: DayConfig = {
      id: `day-${Date.now()}-${dias.length + 1}`,
      fecha: nextDate,
      bloquesHorarios: [
        {
          id: `block-${Date.now()}-new`,
          horaInicio: lastDay?.bloquesHorarios?.[0]?.horaInicio || '08:10',
          horaFin: lastDay?.bloquesHorarios?.[0]?.horaFin || '09:00',
          duracionMinutos: lastDay?.bloquesHorarios?.[0]?.duracionMinutos || 5,
          intervaloMinutos: lastDay?.bloquesHorarios?.[0]?.intervaloMinutos ?? 0,
        },
      ],
    };

    setDias([...dias, newDay]);
  };

  const handleAddBlockToDay = (dayId: string) => {
    setDias((prev) =>
      prev.map((d) => {
        if (d.id === dayId) {
          const blocks = d.bloquesHorarios || [];
          const lastBlock = blocks[blocks.length - 1];
          const newBlock: BloqueHorario = {
            id: `block-${Date.now()}-${blocks.length + 1}`,
            horaInicio: lastBlock ? lastBlock.horaFin : '17:00',
            horaFin: '19:00',
            duracionMinutos: lastBlock ? lastBlock.duracionMinutos : 5,
            intervaloMinutos: lastBlock ? lastBlock.intervaloMinutos : 0,
          };
          return { ...d, bloquesHorarios: [...blocks, newBlock] };
        }
        return d;
      })
    );
  };

  const handleRemoveBlockFromDay = (dayId: string, blockId: string) => {
    setDias((prev) =>
      prev.map((d) => {
        if (d.id === dayId) {
          const blocks = d.bloquesHorarios || [];
          if (blocks.length <= 1) return d;
          return { ...d, bloquesHorarios: blocks.filter((b) => b.id !== blockId) };
        }
        return d;
      })
    );
  };

  const handleUpdateBlock = (
    dayId: string,
    blockId: string,
    field: keyof BloqueHorario,
    value: any
  ) => {
    setDias((prev) =>
      prev.map((d) => {
        if (d.id === dayId) {
          const blocks = (d.bloquesHorarios || []).map((b) => {
            if (b.id === blockId) {
              return { ...b, [field]: value };
            }
            return b;
          });
          return { ...d, bloquesHorarios: blocks };
        }
        return d;
      })
    );
  };

  const handleCopyPreviousDay = (index: number) => {
    if (index <= 0) return;
    const prev = dias[index - 1];
    const current = dias[index];

    const prevBlocks = prev.bloquesHorarios ? JSON.parse(JSON.stringify(prev.bloquesHorarios)) : [];

    const updated = [...dias];
    updated[index] = {
      ...current,
      bloquesHorarios: prevBlocks,
    };
    setDias(updated);
  };

  const handleRemoveDay = (id: string) => {
    if (dias.length <= 1) return;
    setDias(dias.filter((d) => d.id !== id));
  };

  const handleUpdateDayDate = (id: string, newFecha: string) => {
    setDias((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          return { ...d, fecha: newFecha };
        }
        return d;
      })
    );
  };

  // Preview Finetuning
  const handleRemovePreviewSlot = (slotId: string) => {
    setCustomSlots((prev) => prev.filter((s) => s.id !== slotId));
  };

  const handleStartEditSlot = (slot: VisitSlot) => {
    setEditingSlotId(slot.id);
    setEditSlotStart(slot.horaInicio);
    setEditSlotEnd(slot.horaFin);
  };

  const handleSaveSlotEdit = (slotId: string) => {
    setCustomSlots((prev) =>
      prev.map((s) => {
        if (s.id === slotId) {
          return {
            ...s,
            horaInicio: editSlotStart,
            horaFin: editSlotEnd,
          };
        }
        return s;
      })
    );
    setEditingSlotId(null);
  };

  const handleAddManualSlot = (fecha: string) => {
    const newSlot: VisitSlot = {
      id: `slot-${selectedInmuebleId}-${fecha}-${Date.now().toString().slice(-4)}`,
      inmuebleId: selectedInmuebleId,
      fecha,
      horaInicio: '08:15',
      horaFin: '08:20',
      disponible: true,
    };
    setCustomSlots((prev) => [...prev, newSlot]);
  };

  // Toggle candidate selection
  const toggleCandidateSelection = (candidateId: string) => {
    if (selectedCandidateIds.includes(candidateId)) {
      setSelectedCandidateIds(selectedCandidateIds.filter((id) => id !== candidateId));
    } else {
      setSelectedCandidateIds([...selectedCandidateIds, candidateId]);
    }
  };

  const toggleSelectAllCandidates = () => {
    if (selectedCandidateIds.length === availableCandidatesForProp.length) {
      setSelectedCandidateIds([]);
    } else {
      setSelectedCandidateIds(availableCandidatesForProp.map((c) => c.id));
    }
  };

  // Process Agenda Save
  const handleGenerateAgendaClick = () => {
    if (propertyReservedSlots.length > 0) {
      setStep('confirm_warning');
    } else {
      executeSaveAgenda();
    }
  };

  const executeSaveAgenda = () => {
    // 1. Get existing slots for OTHER properties or existing slots for this property
    const existingOtherProps = existingSlots.filter((s) => s.inmuebleId !== selectedInmuebleId);
    const existingThisProp = existingSlots.filter((s) => s.inmuebleId === selectedInmuebleId);

    // 2. Combine existing slots for this property with new custom slots, keeping unique ones or updating
    const mergedThisProp = [...existingThisProp];

    customSlots.forEach((newSlot) => {
      const idx = mergedThisProp.findIndex((s) => s.id === newSlot.id || (s.fecha === newSlot.fecha && s.horaInicio === newSlot.horaInicio));
      if (idx >= 0) {
        // If slot exists, keep reservation state if reserved
        if (!mergedThisProp[idx].disponible) {
          // Keep existing reserved slot
        } else {
          mergedThisProp[idx] = newSlot;
        }
      } else {
        mergedThisProp.push(newSlot);
      }
    });

    const allFinalSlots = [...existingOtherProps, ...mergedThisProp];
    onSaveSlots(allFinalSlots);
    setStep('seleccionar_candidatos');
  };

  // Process Generating Invitations
  const handleGenerateInvitations = () => {
    let count = 0;
    selectedCandidateIds.forEach((candId) => {
      const candidate = candidatos.find((c) => c.id === candId);
      if (candidate) {
        const existingInv = existingInvitaciones.find((i) => i.candidateId === candId);
        if (!existingInv) {
          const newInv: InvitacionVisita = {
            id: `inv-${candidate.id}`,
            token: `vst-${candidate.id}-${Math.random().toString(36).substring(2, 7)}`,
            candidateId: candidate.id,
            candidateNombre: candidate.nombre,
            candidateTelefono: candidate.telefono,
            candidateEmail: candidate.email,
            inmuebleId: selectedInmuebleId,
            inmuebleNombre: selectedInmueble?.direccion || 'Inmueble',
            inmueblePrecio: selectedInmueble?.precio ?? 0,
            inmuebleCiudad: selectedInmueble?.ciudad || 'Ciudad',
            status: 'PENDIENTE DE ENVIAR',
            fechaPreseleccion: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString(),
          };
          onSaveInvitacion(newInv);
          count++;
        }
      }
    });

    setToastMessage(`Se han configurado los turnos e invitaciones de visita correctamente.`);
    setStep('finalizado');
  };

  // Group preview custom slots by fecha
  const previewSlotsByDate: { [fecha: string]: VisitSlot[] } = {};
  customSlots.forEach((slot) => {
    if (!previewSlotsByDate[slot.fecha]) {
      previewSlotsByDate[slot.fecha] = [];
    }
    previewSlotsByDate[slot.fecha].push(slot);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center font-bold shadow-md">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Configurar Agenda de Visitas</h3>
              <p className="text-xs text-slate-400">
                Define turnos precisos para varios días u horas del mismo día
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          
          {/* STEP 1: CONFIGURAR AGENDA */}
          {step === 'config_agenda' && (
            <div className="space-y-6">
              {/* Select Property */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <label className="block font-bold text-slate-800 text-xs">
                  1. Seleccionar Inmueble
                </label>
                <select
                  value={selectedInmuebleId}
                  onChange={(e) => setSelectedInmuebleId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 text-xs"
                >
                  {inmuebles.map((inm) => (
                    <option key={inm.id} value={inm.id}>
                      {inm.direccion} ({inm.ciudad}) — {inm.precio} €/mes
                    </option>
                  ))}
                </select>
              </div>

              {/* Days Configuration Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>2. Días y Bloques Horarios de Visita</span>
                  </h4>

                  <button
                    type="button"
                    onClick={handleAddDay}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl border border-blue-200 flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Añadir otro día</span>
                  </button>
                </div>

                {/* Day Cards */}
                <div className="space-y-4">
                  {dias.map((day, idx) => (
                    <div
                      key={day.id}
                      className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3 relative"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-extrabold">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-800 text-xs">
                            Jornada {idx + 1}:
                          </span>
                          <input
                            type="date"
                            value={day.fecha}
                            onChange={(e) => handleUpdateDayDate(day.id, e.target.value)}
                            className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-900"
                          />
                          <span className="text-[11px] text-slate-500 font-medium">
                            ({formatDateNice(day.fecha)})
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => handleCopyPreviousDay(idx)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg flex items-center gap-1 transition-colors text-[11px]"
                              title="Copiar turnos del día anterior"
                            >
                              <Copy className="w-3 h-3 text-slate-500" />
                              <span>Copiar día anterior</span>
                            </button>
                          )}

                          {dias.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveDay(day.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Eliminar este día"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Time Blocks within Day */}
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                          <span>Turnos de horas para este día:</span>
                          <button
                            type="button"
                            onClick={() => handleAddBlockToDay(day.id)}
                            className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            <span>+ Añadir segundo turno (Ej. Tarde)</span>
                          </button>
                        </div>

                        {(day.bloquesHorarios || []).map((block, bIdx) => (
                          <div
                            key={block.id}
                            className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-end relative"
                          >
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                Hora Inicio
                              </label>
                              <input
                                type="time"
                                value={block.horaInicio}
                                onChange={(e) =>
                                  handleUpdateBlock(day.id, block.id, 'horaInicio', e.target.value)
                                }
                                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                Hora Fin
                              </label>
                              <input
                                type="time"
                                value={block.horaFin}
                                onChange={(e) =>
                                  handleUpdateBlock(day.id, block.id, 'horaFin', e.target.value)
                                }
                                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                Duración visita
                              </label>
                              <select
                                value={block.duracionMinutos}
                                onChange={(e) =>
                                  handleUpdateBlock(day.id, block.id, 'duracionMinutos', Number(e.target.value))
                                }
                                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-800"
                              >
                                {DURACION_OPCIONES.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt} min
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                Descanso / Intervalo
                              </label>
                              <select
                                value={block.intervaloMinutos}
                                onChange={(e) =>
                                  handleUpdateBlock(day.id, block.id, 'intervaloMinutos', Number(e.target.value))
                                }
                                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-800"
                              >
                                {INTERVALO_OPCIONES.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt === 0 ? '0 min (Seguidos)' : `${opt} min`}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="flex items-center justify-end pb-1">
                              {(day.bloquesHorarios || []).length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBlockFromDay(day.id, block.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded-md"
                                  title="Borrar este turno de horas"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* INTERACTIVE PREVIEW & EDITS SECTION */}
              <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-md space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <h4 className="font-bold text-sm text-white">INTERVALOS GENERADOS EN TIEMPO REAL</h4>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-blue-600 text-white font-extrabold text-xs">
                    {customSlots.length} turnos a guardar
                  </span>
                </div>

                {Object.keys(previewSlotsByDate).length === 0 ? (
                  <p className="text-[11px] text-rose-400 italic">
                    Sin horarios generados. Revisa hora de inicio y fin.
                  </p>
                ) : (
                  Object.entries(previewSlotsByDate).map(([fecha, dateSlots]) => (
                    <div key={fecha} className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200 text-xs capitalize flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-blue-400" />
                          {formatDateNice(fecha)} ({fecha})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddManualSlot(fecha)}
                          className="text-[10px] bg-slate-700 hover:bg-slate-600 text-blue-300 font-bold px-2 py-0.5 rounded-md border border-slate-600 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>+ Añadir hora manual</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                        {dateSlots.map((slot) => {
                          const isEditing = editingSlotId === slot.id;

                          return (
                            <div
                              key={slot.id}
                              className="p-2 bg-slate-700 text-slate-100 rounded-lg text-[11px] font-mono border border-slate-600 flex items-center justify-between gap-1"
                            >
                              {isEditing ? (
                                <div className="flex items-center gap-1 w-full">
                                  <input
                                    type="time"
                                    value={editSlotStart}
                                    onChange={(e) => setEditSlotStart(e.target.value)}
                                    className="bg-slate-900 text-white px-1 py-0.5 rounded text-[10px] w-16"
                                  />
                                  <span>-</span>
                                  <input
                                    type="time"
                                    value={editSlotEnd}
                                    onChange={(e) => setEditSlotEnd(e.target.value)}
                                    className="bg-slate-900 text-white px-1 py-0.5 rounded text-[10px] w-16"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveSlotEdit(slot.id)}
                                    className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-500"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-blue-400 shrink-0" />
                                    <span className="font-bold">{slot.horaInicio} – {slot.horaFin}</span>
                                  </div>

                                  <div className="flex items-center gap-1 opacity-80 hover:opacity-100">
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditSlot(slot)}
                                      className="p-0.5 hover:text-amber-300"
                                      title="Editar hora exacta"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRemovePreviewSlot(slot.id)}
                                      className="p-0.5 hover:text-rose-400"
                                      title="Eliminar esta hora"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Action Bar */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleGenerateAgendaClick}
                  disabled={customSlots.length === 0}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>Guardar {customSlots.length} horarios</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP WARNING: CONFIRM RESERVATION OVERWRITE */}
          {step === 'confirm_warning' && (
            <div className="bg-amber-50 border-2 border-amber-300 p-6 rounded-2xl text-center space-y-4">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>

              <h3 className="font-bold text-slate-900 text-base">
                ⚠️ Modificación de Agenda con Reservas Existentes
              </h3>

              <p className="text-xs text-slate-700 max-w-md mx-auto leading-relaxed">
                Este inmueble ya cuenta con <strong className="text-amber-900">{propertyReservedSlots.length} reserva(s) de cita activa(s)</strong>.
                Al actualizar la agenda, los horarios ya reservados por los candidatos se conservarán intactos, y los nuevos turnos libres estarán disponibles inmediatamente.
              </p>

              <div className="flex items-center justify-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setStep('config_agenda')}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-xl"
                >
                  Volver a revisar
                </button>
                <button
                  type="button"
                  onClick={executeSaveAgenda}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-md"
                >
                  Sí, confirmar y actualizar agenda
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: SELECCIONAR CANDIDATOS PRESELECCIONADOS */}
          {step === 'seleccionar_candidatos' && (
            <div className="space-y-5">
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-blue-900 text-sm flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-blue-600" />
                    <span>3. Seleccionar Candidatos Preseleccionados</span>
                  </h4>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Elige qué candidatos recibirán la invitación con el enlace para elegir su cita en tiempo real.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleSelectAllCandidates}
                  className="px-3 py-1.5 bg-white hover:bg-blue-100 text-blue-800 font-bold rounded-xl border border-blue-300 text-xs"
                >
                  {selectedCandidateIds.length === availableCandidatesForProp.length ? 'Desmarcar todos' : 'Seleccionar todos'}
                </button>
              </div>

              {availableCandidatesForProp.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
                  <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">No hay candidatos preseleccionados para este inmueble</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Puedes continuar y generar las invitaciones más adelante desde el listado de candidatos.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {availableCandidatesForProp.map((cand) => {
                    const isSelected = selectedCandidateIds.includes(cand.id);
                    const hasInv = existingInvitaciones.some((i) => i.candidateId === cand.id);

                    return (
                      <div
                        key={cand.id}
                        onClick={() => toggleCandidateSelection(cand.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-blue-50/70 border-blue-300 text-blue-900'
                            : 'bg-white border-slate-200/80 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <button type="button" className="text-blue-600">
                            {isSelected ? (
                              <CheckSquare className="w-5 h-5 text-blue-600" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-300" />
                            )}
                          </button>
                          <div>
                            <span className="font-bold text-slate-900 text-xs block">{cand.nombre}</span>
                            <span className="text-[11px] text-slate-500">{cand.telefono} • Solvencia {cand.scoreEstimado || 85}%</span>
                          </div>
                        </div>

                        {hasInv ? (
                          <span className="px-2.5 py-1 bg-purple-100 text-purple-800 text-[10px] font-bold rounded-lg border border-purple-200">
                            Invitación existente
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-lg border border-amber-200">
                            Preseleccionado ⭐
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep('config_agenda')}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Volver a la agenda
                </button>

                <button
                  type="button"
                  onClick={handleGenerateInvitations}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Generar invitaciones ({selectedCandidateIds.length})</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: FINALIZADO */}
          {step === 'finalizado' && (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <h3 className="text-xl font-bold text-slate-900">
                ¡Agenda de Visitas Generada con Éxito!
              </h3>

              <p className="text-xs text-slate-600 max-w-md mx-auto">
                {toastMessage || 'Los horarios han sido creados e integrados en el sistema.'} Puedes ir a la pestaña <strong>Preseleccionados</strong> para enviar el enlace personalizado por WhatsApp a cada candidato.
              </p>

              <div className="pt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md"
                >
                  Entendido, cerrar
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
