import React, { useState } from 'react';
import {
  UserCheck,
  Building2,
  Search,
  Filter,
  MessageSquare,
  Copy,
  ExternalLink,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  Send,
  Sparkles,
  Users,
  CheckSquare,
  Square,
  XCircle,
  Plus,
  ArrowRight,
  Info,
  FileCheck2,
  FileText,
  AlertTriangle,
  Key,
} from 'lucide-react';
import {
  Candidato,
  Inmueble,
  InvitacionVisita,
  InvitationStatus,
  SolicitudAlquiler,
  VisitSlot,
  SolicitudDocumentacion,
  ContratoFormalizacion,
} from '../../types';
import { ConfirmWhatsappSentModal } from '../ConfirmWhatsappSentModal';
import { getSolicitudDocEstadoInfo } from '../../utils/documentTemplates';
import { getFormalizacionEstadoInfo } from '../../utils/contratoEngine';

interface PreseleccionadosSectionProps {
  candidatos: Candidato[];
  inmuebles: Inmueble[];
  invitaciones: InvitacionVisita[];
  solicitudes: SolicitudAlquiler[];
  slots?: VisitSlot[];
  solicitudesDoc?: SolicitudDocumentacion[];
  contratos?: ContratoFormalizacion[];
  onSaveInvitacion: (inv: InvitacionVisita) => void;
  onOpenPublicVisita: (token: string) => void;
  onOpenConfigurarAgenda?: (inmuebleId?: string) => void;
  onOpenCrearSolicitudDoc?: (candidato: Candidato, inmueble?: Inmueble, invitacion?: InvitacionVisita) => void;
  onOpenDetalleSolicitudDoc?: (solicitud: SolicitudDocumentacion) => void;
  onOpenFormalizarModal?: (candidato: Candidato, inmueble?: Inmueble, contrato?: ContratoFormalizacion) => void;
}

export const PreseleccionadosSection: React.FC<PreseleccionadosSectionProps> = ({
  candidatos,
  inmuebles,
  invitaciones,
  solicitudes,
  slots = [],
  solicitudesDoc = [],
  contratos = [],
  onSaveInvitacion,
  onOpenPublicVisita,
  onOpenConfigurarAgenda,
  onOpenCrearSolicitudDoc,
  onOpenDetalleSolicitudDoc,
  onOpenFormalizarModal,
}) => {
  const [selectedInmuebleFilter, setSelectedInmuebleFilter] = useState<string>('todos');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  
  // WhatsApp confirm modal state
  const [activeWhatsappInv, setActiveWhatsappInv] = useState<InvitacionVisita | null>(null);
  const [activeWhatsappUrl, setActiveWhatsappUrl] = useState<string | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Preselected candidates list (status is 'preseleccionado' or 'visita_reservada' or has an active invitation)
  const preselectedCandidates = candidatos.filter((c) => {
    const hasInvitation = invitaciones.some((inv) => inv.candidateId === c.id);
    return c.estado === 'preseleccionado' || c.estado === 'visita_reservada' || hasInvitation;
  });

  // Filter candidates
  const filteredCandidates = preselectedCandidates.filter((cand) => {
    // Filter by property
    if (selectedInmuebleFilter !== 'todos' && cand.inmuebleId !== selectedInmuebleFilter) {
      return false;
    }

    // Filter by invitation status
    const inv = invitaciones.find((i) => i.candidateId === cand.id);
    const invStatus = inv?.status || 'PENDIENTE DE ENVIAR';

    if (selectedStatusFilter !== 'todos' && invStatus !== selectedStatusFilter) {
      return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = cand.nombre.toLowerCase().includes(q);
      const matchPhone = cand.telefono.toLowerCase().includes(q);
      const matchProp = (cand.inmuebleNombre || '').toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchProp) return false;
    }

    return true;
  });

  // Helper to ensure invitation exists for candidate
  const getOrCreateInvitacion = (candidate: Candidato): InvitacionVisita => {
    const existing = invitaciones.find((i) => i.candidateId === candidate.id);
    if (existing) return existing;

    const sol = solicitudes.find((s) => s.candidatoId === candidate.id);

    const newInv: InvitacionVisita = {
      id: `inv-${candidate.id}`,
      token: `vst-${candidate.id}-${Math.random().toString(36).substring(2, 7)}`,
      candidateId: candidate.id,
      candidateNombre: candidate.nombre,
      candidateTelefono: candidate.telefono,
      candidateEmail: candidate.email,
      inmuebleId: candidate.inmuebleId,
      inmuebleNombre: candidate.inmuebleNombre || 'Inmueble',
      inmueblePrecio: sol?.inmueblePrecio || 900,
      inmuebleCiudad: sol?.inmuebleCiudad || 'Ciudad',
      solicitudEstado: sol?.estado || 'DOCUMENTACIÓN COMPLETA',
      cuestionarioCompletado: !!candidate.cuestionarioIncidencias?.completado,
      scoreSolvencia: candidate.scoreEstimado || sol?.scoreSolvencia || 80,
      perfilOperativo: sol?.perfilOperativo || 80,
      status: 'PENDIENTE DE ENVIAR',
      fechaPreseleccion: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    };

    onSaveInvitacion(newInv);
    return newInv;
  };

  // WhatsApp link generator & handler
  const handleOpenWhatsapp = (candidate: Candidato) => {
    const inv = getOrCreateInvitacion(candidate);

    // Build unique visit URL
    const publicOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const visitUrl = `${publicOrigin}/#visita/${inv.token}`;

    // Clean phone number (remove spaces, plus sign for WhatsApp API)
    const cleanPhone = candidate.telefono.replace(/\s+/g, '').replace('+', '');

    // Standardized personalized message template
    const messageText = `Hola ${candidate.nombre.split(' ')[0]}.

Has sido preseleccionado para visitar la vivienda de ${candidate.inmuebleNombre}.

Puedes consultar los días y horarios disponibles y elegir el que mejor te venga en el siguiente enlace:

${visitUrl}

Los horarios se actualizan en tiempo real, por lo que te recomendamos elegir cuanto antes.

Si finalmente no puedes asistir a la visita que reserves, por favor avísanos para poder liberar el horario.

Un saludo.`;

    const encodedText = encodeURIComponent(messageText);
    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;

    // If status is still PENDIENTE DE ENVIAR, change to ENLACE GENERADO
    if (inv.status === 'PENDIENTE DE ENVIAR') {
      onSaveInvitacion({ ...inv, status: 'ENLACE GENERADO' });
    }

    // Open WhatsApp
    window.open(waUrl, '_blank');

    // Trigger confirm modal
    setActiveWhatsappInv(inv);
    setActiveWhatsappUrl(waUrl);
  };

  const handleCopyLink = (candidate: Candidato) => {
    const inv = getOrCreateInvitacion(candidate);
    const publicOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const visitUrl = `${publicOrigin}/#visita/${inv.token}`;
    navigator.clipboard.writeText(visitUrl);
    showToast(`Enlace de visita copiado para ${candidate.nombre}`);
  };

  const handleConfirmWhatsappSent = (invitacionId: string) => {
    const inv = invitaciones.find((i) => i.id === invitacionId) || activeWhatsappInv;
    if (inv) {
      const updated: InvitacionVisita = {
        ...inv,
        status: 'ENVIADO',
        sentAt: new Date().toISOString(),
      };
      onSaveInvitacion(updated);
      showToast(`Invitación marcada como ENVIADA a ${inv.candidateNombre}`);
    }
  };

  // Bulk preparation of invitations
  const handleBulkPrepareInvitations = () => {
    if (selectedCandidates.length === 0) return;
    let preparedCount = 0;

    selectedCandidates.forEach((candId) => {
      const cand = candidatos.find((c) => c.id === candId);
      if (cand) {
        const inv = getOrCreateInvitacion(cand);
        if (inv.status === 'PENDIENTE DE ENVIAR') {
          onSaveInvitacion({
            ...inv,
            status: 'ENLACE GENERADO',
          });
          preparedCount++;
        }
      }
    });

    showToast(`Se han preparado ${selectedCandidates.length} enlaces de invitación`);
    setSelectedCandidates([]);
  };

  // Toggle selection for bulk actions
  const toggleSelectCandidate = (id: string) => {
    if (selectedCandidates.includes(id)) {
      setSelectedCandidates(selectedCandidates.filter((i) => i !== id));
    } else {
      setSelectedCandidates([...selectedCandidates, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedCandidates.length === filteredCandidates.length) {
      setSelectedCandidates([]);
    } else {
      setSelectedCandidates(filteredCandidates.map((c) => c.id));
    }
  };

  // Agenda Stats KPI Calculation
  const totalPreseleccionados = preselectedCandidates.length;
  const invitacionesEnviadasCount = invitaciones.filter((i) => i.status === 'ENVIADO' || i.status === 'ABIERTO' || i.status === 'HORARIO RESERVADO').length;
  const pendientesEnviarCount = preselectedCandidates.filter((c) => {
    const inv = invitaciones.find((i) => i.candidateId === c.id);
    return !inv || inv.status === 'PENDIENTE DE ENVIAR' || inv.status === 'ENLACE GENERADO';
  }).length;
  const enlacesAbiertosCount = invitaciones.filter((i) => i.status === 'ABIERTO').length;
  const visitasReservadasCount = invitaciones.filter((i) => i.status === 'HORARIO RESERVADO').length;
  const sinReservarCount = totalPreseleccionados - visitasReservadasCount;

  // Status Badge Helper
  const renderInvitationStatusBadge = (status: InvitationStatus | undefined) => {
    switch (status) {
      case 'HORARIO RESERVADO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            HORARIO RESERVADO
          </span>
        );
      case 'ABIERTO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
            ENLACE ABIERTO
          </span>
        );
      case 'ENVIADO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            ENVIADO
          </span>
        );
      case 'ENLACE GENERADO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            ENLACE GENERADO
          </span>
        );
      case 'CANCELADO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-slate-400"></span>
            CANCELADO
          </span>
        );
      case 'EXPIRADO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            EXPIRADO
          </span>
        );
      case 'PENDIENTE DE ENVIAR':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            PENDIENTE DE ENVIAR
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 border border-slate-700 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 font-bold text-xs rounded-lg uppercase tracking-wider">
              Seguimiento de Visitas
            </span>
            <span className="text-xs text-slate-400">• RentSelect</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight mt-1 flex items-center gap-2">
            <UserCheck className="w-7 h-7 text-blue-600" />
            <span>Preseleccionados e Invitaciones</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Gestiona los candidatos elegidos para visita, genera sus enlaces privados y haz seguimiento en tiempo real.
          </p>
        </div>

        {onOpenConfigurarAgenda && (
          <button
            onClick={() => onOpenConfigurarAgenda(selectedInmuebleFilter !== 'todos' ? selectedInmuebleFilter : undefined)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 shrink-0 self-start sm:self-auto"
          >
            <Calendar className="w-4 h-4" />
            <span>Crear / Configurar Agenda</span>
          </button>
        )}
      </div>

      {/* KPI Stats Summary Agenda Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Preseleccionados</span>
          <span className="text-2xl font-bold text-slate-900 block mt-1">{totalPreseleccionados}</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-medium text-blue-600 uppercase tracking-wider block">Enviadas</span>
          <span className="text-2xl font-bold text-blue-600 block mt-1">{invitacionesEnviadasCount}</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-medium text-amber-600 uppercase tracking-wider block">Pendientes</span>
          <span className="text-2xl font-bold text-amber-600 block mt-1">{pendientesEnviarCount}</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-medium text-purple-600 uppercase tracking-wider block">Enlaces Abiertos</span>
          <span className="text-2xl font-bold text-purple-600 block mt-1">{enlacesAbiertosCount}</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-medium text-emerald-600 uppercase tracking-wider block">Reservadas</span>
          <span className="text-2xl font-bold text-emerald-600 block mt-1">{visitasReservadasCount}</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Sin Reservar</span>
          <span className="text-2xl font-bold text-slate-700 block mt-1">{sinReservarCount}</span>
        </div>
      </div>

      {/* Filters and Controls Card */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por candidato, teléfono o inmueble..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Property Filter */}
            <select
              value={selectedInmuebleFilter}
              onChange={(e) => setSelectedInmuebleFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">🏠 Todos los inmuebles</option>
              {inmuebles.map((inm) => (
                <option key={inm.id} value={inm.id}>
                  {inm.direccion}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">📌 Todos los estados</option>
              <option value="PENDIENTE DE ENVIAR">🟡 Pendiente de enviar</option>
              <option value="ENLACE GENERADO">🟡 Enlace generado</option>
              <option value="ENVIADO">🔵 Enviado</option>
              <option value="ABIERTO">🟣 Abierto</option>
              <option value="HORARIO RESERVADO">🟢 Horario reservado</option>
              <option value="CANCELADO">⚪ Cancelado</option>
            </select>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {selectedCandidates.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between text-xs animate-fadeIn">
            <div className="flex items-center gap-2 text-blue-900 font-semibold">
              <CheckSquare className="w-4 h-4 text-blue-600" />
              <span>{selectedCandidates.length} candidato(s) seleccionado(s)</span>
            </div>

            <button
              onClick={handleBulkPrepareInvitations}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Preparar invitaciones</span>
            </button>
          </div>
        )}
      </div>

      {/* Desktop Table & Mobile Cards */}
      {filteredCandidates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <UserCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-bold text-slate-800 text-base">No hay preseleccionados con estos filtros</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            Los candidatos cambiarán a esta pantalla cuando los marques como PRESELECCIONADO desde la lista de Candidatos.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 w-10 text-center">
                    <button onClick={toggleSelectAll} className="text-slate-400 hover:text-slate-600">
                      {selectedCandidates.length === filteredCandidates.length ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">Candidato</th>
                  <th className="py-3 px-4">Inmueble</th>
                  <th className="py-3 px-4 text-center">Solvencia / Cuest.</th>
                  <th className="py-3 px-4">Estado Invitación</th>
                  <th className="py-3 px-4">Cita Reservada</th>
                  <th className="py-3 px-4 text-center">Documentación</th>
                  <th className="py-3 px-4 text-center">Formalización (Fase 3)</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredCandidates.map((cand) => {
                  const inv = invitaciones.find((i) => i.candidateId === cand.id);
                  const status = inv?.status || 'PENDIENTE DE ENVIAR';
                  const isSelected = selectedCandidates.includes(cand.id);
                  const docSol = solicitudesDoc.find(
                    (s) =>
                      s.candidatoId === cand.id ||
                      (s.candidatoTelefono && cand.telefono && s.candidatoTelefono.replace(/\D/g, '') === cand.telefono.replace(/\D/g, '')) ||
                      (s.candidatoEmail && cand.email && s.candidatoEmail.toLowerCase().trim() === cand.email.toLowerCase().trim()) ||
                      (s.candidatoNombre && cand.nombre && s.candidatoNombre.toLowerCase().trim() === cand.nombre.toLowerCase().trim())
                  );
                  const targetInmueble = inmuebles.find((i) => i.id === cand.inmuebleId);
                  const existingContrato = contratos.find((c) => c.candidatoId === cand.id);
                  const formalizacionInfo = existingContrato ? getFormalizacionEstadoInfo(existingContrato.estado) : null;

                  // Doc stats - accurate check across SolicitudDoc, DocumentosAnalizados and Documentos checklist
                  const totalDocs = docSol?.documentos.length || cand.documentos?.length || 3;
                  let subidosDocs = 0;
                  if (docSol) {
                    subidosDocs = docSol.documentos.filter(
                      (d) => d.estado === 'subido' || d.estado === 'validado' || (d.archivos && d.archivos.length > 0)
                    ).length;
                  }
                  if (subidosDocs === 0 && cand.documentosAnalizados && cand.documentosAnalizados.length > 0) {
                    subidosDocs = cand.documentosAnalizados.length;
                  } else if (subidosDocs === 0 && cand.documentos && cand.documentos.length > 0) {
                    subidosDocs = cand.documentos.filter((d) => d.subido).length;
                  }
                  const docEstadoInfo = docSol ? getSolicitudDocEstadoInfo(docSol.estado) : null;

                  return (
                    <tr
                      key={cand.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isSelected ? 'bg-blue-50/30' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => toggleSelectCandidate(cand.id)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900">{cand.nombre}</span>
                          {(cand.numTitularesContrato === 2 || cand.cotitular) && (
                            <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 text-[10px] font-bold rounded">
                              2 Titulares
                            </span>
                          )}
                          {cand.notasPrivadas && cand.notasPrivadas.length > 0 && (
                            <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 text-[10px] font-bold rounded" title={`${cand.notasPrivadas.length} notas`}>
                              📝 {cand.notasPrivadas.length}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">{cand.telefono}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800">{cand.inmuebleNombre}</div>
                        <div className="text-[11px] text-slate-400">Presel: {cand.fechaCreacion || 'Reciente'}</div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                            {cand.scoreEstimado || 85}%
                          </span>
                          {cand.cuestionarioIncidencias?.completado ? (
                            <span className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-md border border-purple-100 font-medium">
                              Cuestionario OK
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">
                              Sin cuest.
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {renderInvitationStatusBadge(status)}
                        {inv?.sentAt && (
                          <div className="text-[10px] text-slate-400 mt-1">
                            Enviado: {new Date(inv.sentAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                        {inv?.openedAt && status === 'ABIERTO' && (
                          <div className="text-[10px] text-purple-600 mt-0.5 font-medium">
                            Visto por el candidato
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {inv?.reserva ? (
                          <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-2 text-emerald-900 text-[11px]">
                            <div className="font-bold flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{inv.reserva.fecha}</span>
                            </div>
                            <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                              {inv.reserva.horaInicio} - {inv.reserva.horaFin}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">— Sin reserva —</span>
                        )}
                      </td>

                      {/* Documentación Post-Visita Column */}
                      <td className="py-3.5 px-4 text-center">
                        {docSol ? (
                          <button
                            onClick={() => onOpenDetalleSolicitudDoc && onOpenDetalleSolicitudDoc(docSol)}
                            className="inline-flex flex-col items-center gap-1 p-1.5 rounded-xl hover:bg-slate-100 transition-colors group text-left"
                            title="Ver gestión de documentación"
                          >
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${docEstadoInfo?.badgeClass}`}>
                              {docEstadoInfo?.label}
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium group-hover:text-indigo-600">
                              {subidosDocs}/{totalDocs} aportados
                            </span>
                          </button>
                        ) : (
                          <button
                            onClick={() => onOpenCrearSolicitudDoc && onOpenCrearSolicitudDoc(cand, targetInmueble, inv)}
                            className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors mx-auto border border-indigo-200/60"
                            title="Solicitar documentación económica y laboral"
                          >
                            <FileCheck2 className="w-3.5 h-3.5" />
                            <span>Solicitar Docs</span>
                          </button>
                        )}
                      </td>

                      {/* Formalización / Contrato LAU Column */}
                      <td className="py-3.5 px-4 text-center">
                        {existingContrato ? (
                          <button
                            onClick={() => onOpenFormalizarModal && onOpenFormalizarModal(cand, targetInmueble, existingContrato)}
                            className="inline-flex flex-col items-center gap-1 p-1.5 rounded-xl hover:bg-slate-100 transition-colors group text-center"
                            title="Gestionar formalización y contrato LAU"
                          >
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${formalizacionInfo?.badgeClass}`}>
                              {formalizacionInfo?.label}
                            </span>
                            <span className="text-[10px] text-indigo-600 font-medium group-hover:underline">
                              Ver Contrato
                            </span>
                          </button>
                        ) : (
                          <button
                            onClick={() => onOpenFormalizarModal && onOpenFormalizarModal(cand, targetInmueble)}
                            className="px-2.5 py-1.5 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors mx-auto shadow-2xs"
                            title="Iniciar formalización de contrato y dictamen seguro"
                          >
                            <Key className="w-3.5 h-3.5 text-indigo-300" />
                            <span>Formalizar</span>
                          </button>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* WhatsApp button */}
                          <button
                            onClick={() => handleOpenWhatsapp(cand)}
                            title="Enviar invitacion por WhatsApp"
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </button>

                          {/* Copy Link button */}
                          <button
                            onClick={() => handleCopyLink(cand)}
                            title="Copiar enlace de visita"
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {/* View Invitation Public Page */}
                          <button
                            onClick={() => {
                              const inv = getOrCreateInvitacion(cand);
                              onOpenPublicVisita(inv.token);
                            }}
                            title="Ver enlace como candidato"
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredCandidates.map((cand) => {
              const inv = invitaciones.find((i) => i.candidateId === cand.id);
              const status = inv?.status || 'PENDIENTE DE ENVIAR';

              return (
                <div key={cand.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-bold text-slate-900 text-sm">{cand.nombre}</h4>
                        {(cand.numTitularesContrato === 2 || cand.cotitular) && (
                          <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 text-[10px] font-bold rounded">
                            2 Titulares
                          </span>
                        )}
                        {cand.notasPrivadas && cand.notasPrivadas.length > 0 && (
                          <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 text-[10px] font-bold rounded">
                            📝 {cand.notasPrivadas.length}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{cand.telefono}</p>
                      <p className="text-xs text-blue-600 font-medium mt-1">{cand.inmuebleNombre}</p>
                    </div>

                    <div>{renderInvitationStatusBadge(status)}</div>
                  </div>

                  {inv?.reserva && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-xs text-emerald-900">
                      <p className="font-bold flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Cita: {inv.reserva.fecha} ({inv.reserva.horaInicio} - {inv.reserva.horaFin})</span>
                      </p>
                    </div>
                  )}

                  {/* Documentación Post-Visita Mobile */}
                  {(() => {
                    const docSol = solicitudesDoc.find(
                      (s) =>
                        s.candidatoId === cand.id ||
                        (s.candidatoTelefono && cand.telefono && s.candidatoTelefono.replace(/\D/g, '') === cand.telefono.replace(/\D/g, '')) ||
                        (s.candidatoEmail && cand.email && s.candidatoEmail.toLowerCase().trim() === cand.email.toLowerCase().trim()) ||
                        (s.candidatoNombre && cand.nombre && s.candidatoNombre.toLowerCase().trim() === cand.nombre.toLowerCase().trim())
                    );
                    const targetInmueble = inmuebles.find((i) => i.id === cand.inmuebleId);
                    if (docSol) {
                      const totalDocs = docSol.documentos.length;
                      let subidosDocs = docSol.documentos.filter(
                        (d) => d.estado === 'subido' || d.estado === 'validado' || (d.archivos && d.archivos.length > 0)
                      ).length;
                      if (subidosDocs === 0 && cand.documentosAnalizados && cand.documentosAnalizados.length > 0) {
                        subidosDocs = cand.documentosAnalizados.length;
                      } else if (subidosDocs === 0 && cand.documentos && cand.documentos.length > 0) {
                        subidosDocs = cand.documentos.filter((d) => d.subido).length;
                      }
                      const docInfo = getSolicitudDocEstadoInfo(docSol.estado);
                      return (
                        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-2.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <FileCheck2 className="w-4 h-4 text-indigo-600" />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-0.2 rounded text-[10px] font-bold ${docInfo.badgeClass}`}>
                                  {docInfo.label}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-medium">
                                {subidosDocs}/{totalDocs} documentos aportados
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => onOpenDetalleSolicitudDoc && onOpenDetalleSolicitudDoc(docSol)}
                            className="px-2.5 py-1 bg-white border border-indigo-200 text-indigo-700 font-bold rounded-lg text-xs hover:bg-indigo-50"
                          >
                            Ver Gestión
                          </button>
                        </div>
                      );
                    }
                    return (
                      <button
                        onClick={() => onOpenCrearSolicitudDoc && onOpenCrearSolicitudDoc(cand, targetInmueble, inv)}
                        className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <FileCheck2 className="w-4 h-4" />
                        <span>Solicitar Documentación al Candidato</span>
                      </button>
                    );
                  })()}

                  {/* Formalización / Contrato LAU Mobile */}
                  {(() => {
                    const existingContrato = contratos.find((c) => c.candidatoId === cand.id);
                    const targetInmueble = inmuebles.find((i) => i.id === cand.inmuebleId);
                    if (existingContrato) {
                      const formalizacionInfo = getFormalizacionEstadoInfo(existingContrato.estado);
                      return (
                        <div className="bg-slate-900 text-white rounded-xl p-2.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Key className="w-4 h-4 text-indigo-400" />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-0.2 rounded text-[10px] font-bold ${formalizacionInfo.badgeClass}`}>
                                  {formalizacionInfo.label}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-300 font-medium">
                                Contrato LAU configurado
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => onOpenFormalizarModal && onOpenFormalizarModal(cand, targetInmueble, existingContrato)}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs"
                          >
                            Ver Contrato
                          </button>
                        </div>
                      );
                    }
                    return (
                      <button
                        onClick={() => onOpenFormalizarModal && onOpenFormalizarModal(cand, targetInmueble)}
                        className="w-full py-2 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Key className="w-4 h-4 text-indigo-300" />
                        <span>Formalizar Alquiler (Fase 3)</span>
                      </button>
                    );
                  })()}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
                    <button
                      onClick={() => handleCopyLink(cand)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </button>

                    <button
                      onClick={() => {
                        const inv = getOrCreateInvitacion(cand);
                        onOpenPublicVisita(inv.token);
                      }}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver</span>
                    </button>

                    <button
                      onClick={() => handleOpenWhatsapp(cand)}
                      className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* WHATSAPP CONFIRMATION MODAL */}
      <ConfirmWhatsappSentModal
        invitacion={activeWhatsappInv}
        whatsappUrl={activeWhatsappUrl}
        onConfirmSent={handleConfirmWhatsappSent}
        onClose={() => {
          setActiveWhatsappInv(null);
          setActiveWhatsappUrl(undefined);
        }}
      />
    </div>
  );
};
