import React, { useState } from 'react';
import { Candidato, Inmueble, RespuestaIncidencia } from '../../types';
import { PREGUNTAS_INCIDENCIAS } from '../../data/cuestionarioPreguntas';
import { AnalisisIncidenciasCard } from '../AnalisisIncidenciasCard';
import {
  HelpCircle,
  Link,
  Copy,
  Check,
  Smartphone,
  CheckCircle2,
  Clock,
  Sparkles,
  FileText,
  User,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Send,
} from 'lucide-react';

interface CuestionarioSectionProps {
  candidatos: Candidato[];
  inmuebles: Inmueble[];
  onUpdateCandidatoQuestionnaire: (
    candidatoId: string,
    respuestas: RespuestaIncidencia[],
    informacionAdicional: string
  ) => void;
  onSimulatePublicQuestionnaire: (candidatoId: string) => void;
  onRunAiAnalysis?: (candidatoId: string) => Promise<void>;
}

export const CuestionarioSection: React.FC<CuestionarioSectionProps> = ({
  candidatos,
  inmuebles,
  onUpdateCandidatoQuestionnaire,
  onSimulatePublicQuestionnaire,
  onRunAiAnalysis,
}) => {
  const [selectedInmuebleId, setSelectedInmuebleId] = useState<string>('todos');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copiedCandidateId, setCopiedCandidateId] = useState<string | null>(null);
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
  const [analyzingCandidateId, setAnalyzingCandidateId] = useState<string | null>(null);

  const filteredCandidatos = candidatos.filter((cand) => {
    const matchesInmueble = selectedInmuebleId === 'todos' || cand.inmuebleId === selectedInmuebleId;
    const matchesSearch =
      cand.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cand.inmuebleNombre.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesInmueble && matchesSearch;
  });

  const handleCopyLink = (cand: Candidato) => {
    const token = cand.cuestionarioToken || cand.id;
    const link = `${window.location.origin}/#cuestionario/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedCandidateId(cand.id);
    setTimeout(() => setCopiedCandidateId(null), 3000);
  };

  const toggleExpand = (candidatoId: string) => {
    setExpandedCandidateId((prev) => (prev === candidatoId ? null : candidatoId));
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-blue-600 text-white rounded-xl">
                <HelpCircle className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-bold">Módulo: Cuestionario de Gestión de Incidencias</h1>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
              Crea y gestiona cuestionarios situacionales para conocer cómo suele actuar un futuro inquilino ante incidencias habituales en la vivienda. Genera un enlace público para contestar desde móvil.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="px-3 py-2 bg-slate-800 rounded-xl border border-slate-700 text-center">
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">Completados</span>
              <span className="text-sm font-extrabold text-emerald-400">
                {candidatos.filter((c) => c.cuestionarioIncidencias?.completado).length} / {candidatos.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar candidato o vivienda..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filter Inmueble */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">Filtrar Inmueble:</span>
          <select
            value={selectedInmuebleId}
            onChange={(e) => setSelectedInmuebleId(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todos">Todos los Inmuebles ({inmuebles.length})</option>
            {inmuebles.map((inm) => (
              <option key={inm.id} value={inm.id}>
                {inm.direccion} ({inm.ciudad})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Candidates Questionnaire Cards List */}
      <div className="space-y-4">
        {filteredCandidatos.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-2">
            <User className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">No se encontraron candidatos</h3>
            <p className="text-xs text-slate-500">
              Registra candidatos en la sección correspondientes para enviarles el cuestionario.
            </p>
          </div>
        ) : (
          filteredCandidatos.map((cand) => {
            const questData = cand.cuestionarioIncidencias;
            const isCompletado = questData?.completado || false;
            const isExpanded = expandedCandidateId === cand.id;

            return (
              <div
                key={cand.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden transition-all"
              >
                {/* Main Card Header */}
                <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-sm text-slate-900">{cand.nombre}</span>
                      <span className="text-xs text-slate-500">· {cand.inmuebleNombre}</span>

                      {/* Status Badge */}
                      {isCompletado ? (
                        <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Cuestionario completado
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-[11px] font-bold rounded-full border border-amber-200 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          Cuestionario pendiente
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 flex items-center gap-3 pt-0.5">
                      <span>Tel: {cand.telefono}</span>
                      <span>Email: {cand.email}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap shrink-0 w-full sm:w-auto">
                    {/* Share Link Button */}
                    <button
                      type="button"
                      onClick={() => handleCopyLink(cand)}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
                      title="Copiar enlace directo para enviar al candidato"
                    >
                      {copiedCandidateId === cand.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">¡Enlace Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>Copiar Enlace Móvil</span>
                        </>
                      )}
                    </button>

                    {/* Open Simulation */}
                    <button
                      type="button"
                      onClick={() => onSimulatePublicQuestionnaire(cand.id)}
                      className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 transition-colors flex items-center gap-1.5"
                    >
                      <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                      <span>{isCompletado ? 'Ver / Editar Módulo' : 'Responder Ahora'}</span>
                    </button>

                    {/* Expand Details if completed */}
                    {isCompletado && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(cand.id)}
                        className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
                      >
                        <span>Respuestas</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Details Section */}
                {isCompletado && isExpanded && questData && (
                  <div className="bg-slate-50 border-t border-slate-200 p-5 space-y-5">
                    {/* Summary Meta Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 text-xs">
                      <div className="space-y-0.5">
                        <span className="font-bold text-slate-900 block">Perfil de gestión de incidencias</span>
                        <span className="text-slate-500">
                          Fecha de realización:{' '}
                          <strong>
                            {questData.fechaCompletado
                              ? new Date(questData.fechaCompletado).toLocaleDateString('es-ES', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Recientemente'}
                          </strong>
                        </span>
                      </div>

                    {/* AI Analysis Component */}
                    <div className="pt-2 border-t border-slate-200">
                      <AnalisisIncidenciasCard
                        candidato={cand}
                        analisis={questData?.analisisIa}
                        onRunAnalysis={async () => {
                          if (onRunAiAnalysis) {
                            setAnalyzingCandidateId(cand.id);
                            try {
                              await onRunAiAnalysis(cand.id);
                            } finally {
                              setAnalyzingCandidateId(null);
                            }
                          }
                        }}
                        isLoading={analyzingCandidateId === cand.id}
                      />
                    </div>
                    </div>

                    {/* Open Text Answers Section */}
                    <div className="space-y-3">
                      <h4 className="font-bold text-xs uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span>Respuestas abiertas disponibles</span>
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {/* Situation 12 */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1.5">
                          <span className="font-bold text-slate-900 block">
                            Situación 12: Aire Acondicionado Sábado Tarde
                          </span>
                          <p className="text-slate-700 italic bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed">
                            "{questData.respuestas?.find((r) => r.preguntaId === 'sit_12')?.respuestaTextoLibre || 'Sin respuesta'}"
                          </p>
                        </div>

                        {/* Additional Info */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1.5">
                          <span className="font-bold text-slate-900 block">
                            Información Adicional de Mantenimiento
                          </span>
                          <p className="text-slate-700 italic bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed">
                            "{questData.informacionAdicional || 'Sin información adicional expresada'}"
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Multiple Choice Answers Grid */}
                    <div className="space-y-3">
                      <h4 className="font-bold text-xs uppercase text-slate-700 tracking-wider">
                        Respuestas a Situaciones de Mantenimiento (1 a 11)
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                        {questData.respuestas
                          ?.filter((r) => !r.esAbierta)
                          .map((resp, idx) => (
                            <div
                              key={resp.preguntaId || idx}
                              className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-1"
                            >
                              <span className="font-bold text-slate-900 text-[11px] block truncate">
                                {resp.preguntaTitulo}
                              </span>
                              <div className="flex items-start gap-2 bg-blue-50/60 p-2 rounded-lg border border-blue-100 text-[11px] text-blue-900">
                                <span className="font-extrabold px-1.5 py-0.5 bg-blue-600 text-white rounded-md shrink-0">
                                  {resp.opcionSeleccionadaId}
                                </span>
                                <span className="leading-snug">{resp.opcionSeleccionadaTexto}</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
