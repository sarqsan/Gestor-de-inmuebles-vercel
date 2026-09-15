import React, { useState } from 'react';
import {
  Candidato,
  CandidateStatus,
  Inmueble,
  DocumentoAnalizado,
  InformeInteligente,
  NotaPrivada,
  SolicitudDocumentacion,
  ContratoFormalizacion,
} from '../types';
import { calcularValuracionCandidato } from '../utils/solvenciaEngine';
import { SolvenciaCard } from './SolvenciaCard';
import { DocumentosListSection } from './DocumentosListSection';
import { ResumenDocumentalCard } from './ResumenDocumentalCard';
import { AnalisisIncidenciasCard } from './AnalisisIncidenciasCard';
import { getSolicitudDocEstadoInfo } from '../utils/documentTemplates';
import {
  openCandidatoQuestionnairePDF,
  parseCompletedQuestionnaireFile,
} from '../utils/candidatoQuestionnaire';
import {
  formatEuro,
  formatDate,
  getCandidateStatusLabel,
  getCandidateStatusBadgeStyle,
  getEmploymentTypeLabel,
  getContractTypeLabel,
} from '../utils/formatters';
import {
  X,
  Phone,
  Mail,
  User,
  Briefcase,
  Building,
  FileCheck,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Calendar,
  FileText,
  Sparkles,
  Trash2,
  AlertTriangle,
  Printer,
  Upload,
  HelpCircle,
  Copy,
  Check,
  Smartphone,
  Send,
  Star,
  UserCheck,
  Users,
  Lock,
  Plus,
  StickyNote,
  Euro,
  FileCheck2,
  Key,
} from 'lucide-react';

interface CandidateModalProps {
  candidato: Candidato | null;
  inmuebles: Inmueble[];
  solicitudesDoc?: SolicitudDocumentacion[];
  contratos?: ContratoFormalizacion[];
  onClose: () => void;
  onUpdateStatus: (candidateId: string, newStatus: CandidateStatus) => void;
  onUpdateCandidateDocs?: (candidateId: string, docs: DocumentoAnalizado[], updatedCandidateData?: Partial<Candidato>) => void;
  onGoToAnalysis?: (candidato: Candidato) => void;
  onGenerarInforme?: (candidato: Candidato) => void;
  onDeleteCandidate?: (candidateId: string) => void;
  onOpenQuestionnaireSimulation?: (candidatoId: string) => void;
  onRunAiAnalysis?: (candidateId: string) => Promise<void>;
  onEnviarCuestionario?: (candidato: Candidato) => void;
  onOpenCrearSolicitudDoc?: (candidato: Candidato, inmueble?: Inmueble) => void;
  onOpenDetalleSolicitudDoc?: (solicitud: SolicitudDocumentacion) => void;
  onOpenFormalizarModal?: (candidato: Candidato, inmueble?: Inmueble, contrato?: ContratoFormalizacion) => void;
}

export const CandidateModal: React.FC<CandidateModalProps> = ({
  candidato,
  inmuebles,
  solicitudesDoc = [],
  contratos = [],
  onClose,
  onUpdateStatus,
  onUpdateCandidateDocs,
  onGoToAnalysis,
  onGenerarInforme,
  onDeleteCandidate,
  onOpenQuestionnaireSimulation,
  onRunAiAnalysis,
  onEnviarCuestionario,
  onOpenCrearSolicitudDoc,
  onOpenDetalleSolicitudDoc,
  onOpenFormalizarModal,
}) => {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [nuevaNotaTexto, setNuevaNotaTexto] = useState('');
  const [isAddingNota, setIsAddingNota] = useState(false);

  if (!candidato) return null;

  const docSol = solicitudesDoc.find(
    (s) =>
      s.candidatoId === candidato.id ||
      (s.candidatoNombre && candidato.nombre && s.candidatoNombre.trim().toLowerCase() === candidato.nombre.trim().toLowerCase()) ||
      (s.candidatoTelefono && candidato.telefono.replace(/\s+/g, '') === s.candidatoTelefono.replace(/\s+/g, '')) ||
      (s.candidatoEmail && candidato.email.toLowerCase() === s.candidatoEmail.toLowerCase())
  );

  // Unify docs from docSol with candidato.documentosAnalizados
  const docsFromSol: DocumentoAnalizado[] = [];
  if (docSol && docSol.documentos) {
    docSol.documentos.forEach((item) => {
      (item.archivos || []).forEach((archivo) => {
        docsFromSol.push({
          id: archivo.id,
          candidatoId: candidato.id,
          nombreArchivo: archivo.nombreArchivo,
          mimeType: archivo.mimeType || 'application/pdf',
          base64Data: archivo.base64Data,
          url: archivo.url,
          tipoDocumento: item.tipo || 'otro',
          fechaSubida: archivo.fechaSubida || new Date().toISOString().split('T')[0],
          estadoAnalisis: item.estado === 'validado' ? 'analizado' : 'pendiente',
        } as DocumentoAnalizado);
      });
    });
  }

  const existingCandDocs = candidato.documentosAnalizados || [];
  const mergedDocs: DocumentoAnalizado[] = [...existingCandDocs];
  docsFromSol.forEach((solDocItem) => {
    const existingIndex = mergedDocs.findIndex(
      (d) => d.id === solDocItem.id || (d.nombreArchivo && d.nombreArchivo === solDocItem.nombreArchivo)
    );
    if (existingIndex >= 0) {
      mergedDocs[existingIndex] = {
        ...mergedDocs[existingIndex],
        base64Data: solDocItem.base64Data || mergedDocs[existingIndex].base64Data,
        url: solDocItem.url || (mergedDocs[existingIndex] as any).url,
        tipoDocumento: solDocItem.tipoDocumento || mergedDocs[existingIndex].tipoDocumento,
      };
    } else {
      mergedDocs.push(solDocItem);
    }
  });

  const effectiveCandidato: Candidato = {
    ...candidato,
    documentosAnalizados: mergedDocs,
  };

  const property = inmuebles.find((i) => i.id === effectiveCandidato.inmuebleId);
  const resultadoValuracion = calcularValuracionCandidato(effectiveCandidato, property);

  const handleUpdateDocs = (candId: string, docs: DocumentoAnalizado[], updatedData?: Partial<Candidato>) => {
    if (onUpdateCandidateDocs) {
      onUpdateCandidateDocs(candId, docs, updatedData);
    }
  };

  const handleAddNotaPrivada = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaNotaTexto.trim()) return;

    const nuevaNota: NotaPrivada = {
      id: `nota-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      texto: nuevaNotaTexto.trim(),
      fecha: new Date().toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      timestamp: Date.now(),
      autor: 'Propietario',
    };

    const updatedNotas: NotaPrivada[] = [nuevaNota, ...(candidato.notasPrivadas || [])];
    handleUpdateDocs(candidato.id, candidato.documentosAnalizados || [], { notasPrivadas: updatedNotas });
    setNuevaNotaTexto('');
    setIsAddingNota(false);
  };

  const handleDeleteNotaPrivada = (notaId: string) => {
    const updatedNotas = (candidato.notasPrivadas || []).filter((n) => n.id !== notaId);
    handleUpdateDocs(candidato.id, candidato.documentosAnalizados || [], { notasPrivadas: updatedNotas });
  };

  const handleUploadQuestionnaire = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateCandidateDocs) return;

    try {
      const parsedData = await parseCompletedQuestionnaireFile(file);
      onUpdateCandidateDocs(candidato.id, candidato.documentosAnalizados || [], parsedData);
      setUploadSuccess('¡Datos del cuestionario aplicados correctamente al perfil!');
      setTimeout(() => setUploadSuccess(null), 4000);
    } catch {
      alert('Error al leer el cuestionario. Asegúrate de que sea un archivo válido.');
    }
  };

  const handleDelete = () => {
    if (onDeleteCandidate) {
      onDeleteCandidate(candidato.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 md:p-6 overflow-y-auto">
      <div
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100 bg-slate-50/70 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-blue-500/20">
              {candidato.nombre.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">{candidato.nombre}</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getCandidateStatusBadgeStyle(candidato.estado)}`}>
                  {getCandidateStatusLabel(candidato.estado)}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                Opta a: <span className="font-medium text-slate-700">{candidato.inmuebleNombre}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {candidato.estado !== 'preseleccionado' && candidato.estado !== 'visita_reservada' ? (
              <button
                onClick={() => onUpdateStatus(candidato.id, 'preseleccionado')}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 shrink-0"
                title="Preseleccionar candidato para enviarle reserva de cita"
              >
                <Star className="w-4 h-4 fill-white" />
                <span>Preseleccionar para Visita</span>
              </button>
            ) : (
              <span className="px-3.5 py-2 bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold rounded-xl flex items-center gap-1.5 shrink-0">
                <UserCheck className="w-4 h-4 text-amber-700" />
                <span>Preseleccionado ⭐</span>
              </span>
            )}

            {onEnviarCuestionario && (
              <button
                onClick={() => onEnviarCuestionario(candidato)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center gap-1.5 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar cuestionario</span>
              </button>
            )}
            {onGenerarInforme && (
              <button
                onClick={() => onGenerarInforme(candidato)}
                className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-500/20 flex items-center gap-1.5 shrink-0"
              >
                <Sparkles className="w-4 h-4 text-indigo-200 animate-pulse" />
                <span>{candidato.ultimoInforme ? 'Ver / Regenerar informe' : 'Generar informe'}</span>
              </button>
            )}

            {onDeleteCandidate && (
              <button
                onClick={() => setShowConfirmDelete(true)}
                className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 hover:text-rose-700 border border-transparent hover:border-rose-200 transition-colors"
                title="Eliminar candidato"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-slate-700 text-sm">
          {/* Delete Confirmation Alert Banner */}
          {showConfirmDelete && (
            <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-rose-900 animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <div>
                  <p className="font-bold text-xs sm:text-sm">¿Eliminar candidato "{candidato.nombre}"?</p>
                  <p className="text-xs text-rose-700">Esta acción no se puede deshacer y borrará la ficha e informes del candidato.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
                  onClick={() => setShowConfirmDelete(false)}
                  className="px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 font-semibold text-xs rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition-colors shadow-xs"
                >
                  Sí, eliminar
                </button>
              </div>
            </div>
          )}
          {/* Quick status selector & Informe banner */}
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Estado del candidato:</span>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <select
                value={candidato.estado}
                onChange={(e) => onUpdateStatus(candidato.id, e.target.value as CandidateStatus)}
                className="w-full sm:w-auto px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-2xs"
              >
                <option value="nuevo">Nuevo</option>
                <option value="pendiente_doc">Pendiente de documentación</option>
                <option value="pendiente_analisis">Pendiente de análisis</option>
                <option value="analizado">Analizado</option>
                <option value="preseleccionado">⭐ Preseleccionado (Para Visita)</option>
                <option value="visita_reservada">📅 Visita reservada</option>
                <option value="seleccionado">🏆 Seleccionado (Inquilino Final)</option>
                <option value="no_seleccionado">No seleccionado</option>
              </select>

              {onGenerarInforme && (
                <button
                  onClick={() => onGenerarInforme(candidato)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shadow-xs shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Informe Inteligente</span>
                </button>
              )}

              {onOpenFormalizarModal && (
                <button
                  onClick={() => {
                    const targetInm = inmuebles.find((i) => i.id === candidato.inmuebleId);
                    const existing = contratos.find((c) => c.candidatoId === candidato.id);
                    onClose();
                    onOpenFormalizarModal(candidato, targetInm, existing);
                  }}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shadow-xs shrink-0"
                >
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Formalizar (Fase 3)</span>
                </button>
              )}
            </div>
          </div>

          {/* Preseleccionado Banner & WhatsApp Action */}
          {(candidato.estado === 'preseleccionado' || candidato.estado === 'visita_reservada') && (
            <div className="bg-amber-50/90 border border-amber-300/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-600 fill-amber-400" />
                  <span className="font-extrabold text-xs text-amber-950">
                    Candidato Preseleccionado para Visita
                  </span>
                </div>
                <p className="text-[11px] text-amber-800">
                  El candidato está preseleccionado. Envíale su invitación por WhatsApp para que elija su horario de cita.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                <button
                  onClick={() => {
                    const token = candidato.cuestionarioToken || `vst-${candidato.id}`;
                    const visitUrl = `${window.location.origin}/#visita/${token}`;
                    const cleanPhone = candidato.telefono.replace(/\s+/g, '').replace('+', '');
                    const messageText = `Hola ${candidato.nombre.split(' ')[0]}.\n\nHas sido preseleccionado para visitar la vivienda de ${candidato.inmuebleNombre}.\n\nPuedes elegir tu horario de visita en el siguiente enlace:\n\n${visitUrl}\n\nUn saludo.`;
                    window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(messageText)}`, '_blank');
                  }}
                  className="flex-1 sm:flex-initial px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Enviar por WhatsApp</span>
                </button>

                <button
                  onClick={() => {
                    const token = candidato.cuestionarioToken || `vst-${candidato.id}`;
                    const visitUrl = `${window.location.origin}/#visita/${token}`;
                    navigator.clipboard.writeText(visitUrl);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 3000);
                  }}
                  className="px-3 py-2 bg-white hover:bg-amber-100/60 text-amber-900 border border-amber-300 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1 shadow-2xs"
                >
                  <Copy className="w-3.5 h-3.5 text-amber-700" />
                  <span>{copiedLink ? '¡Enlace copiado!' : 'Copiar enlace'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Cuestionario PDF & Auto-fill Upload Bar */}
          <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-blue-900">Cuestionario de Solvencia del Interesado</span>
                {candidato.ingresosNetos === 0 && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full border border-amber-300/60">
                    Cuestionario pendiente
                  </span>
                )}
              </div>
              <p className="text-[11px] text-blue-700/80">
                Imprime o envía el formulario en PDF a {candidato.nombre} o sube la ficha cumplimentada para autocompletar su perfil.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              <button
                onClick={() => openCandidatoQuestionnairePDF(candidato.nombre, candidato.inmuebleNombre)}
                className="flex-1 sm:flex-initial px-3 py-2 bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5 text-blue-600" />
                <span>PDF Cuestionario</span>
              </button>

              <label className="flex-1 sm:flex-initial px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs">
                <Upload className="w-3.5 h-3.5" />
                <span>Subir Cumplimentado</span>
                <input
                  type="file"
                  accept=".json,.txt,.doc,.docx,.pdf"
                  onChange={handleUploadQuestionnaire}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {uploadSuccess && (
            <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold rounded-xl flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{uploadSuccess}</span>
            </div>
          )}

          {/* INFORME INTELIGENTE QUICK PREVIEW BANNER IF EXISTS */}
          {candidato.ultimoInforme && (
            <div className="p-4 bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-2xl shadow-sm border border-indigo-700/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                    Último Informe #{candidato.ultimoInforme.versionNum}
                  </span>
                  <span className="text-xs text-slate-300">
                    Generado: {candidato.ultimoInforme.fechaGeneracion}
                  </span>
                </div>
                <p className="text-xs font-medium text-indigo-100 line-clamp-1">
                  "{candidato.ultimoInforme.resumenExplicativo}"
                </p>
              </div>

              {onGenerarInforme && (
                <button
                  onClick={() => onGenerarInforme(candidato)}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs rounded-xl transition-all shadow-md shrink-0 flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  Abrir Informe
                </button>
              )}
            </div>
          )}

          {/* TARJETA COMPLETA DEL ÍNDICE DE SOLVENCIA Y VALORACIÓN DE INCIDENCIAS AT A GLANCE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* TARJETA 1: EVALUACIÓN ECONÓMICA DE SOLVENCIA */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-3.5 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200/80 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                    1. Solvencia Económica
                  </span>
                  <div className="flex items-baseline gap-1 bg-slate-50 px-3 py-1 rounded-xl border border-slate-200">
                    <span className="text-2xl font-black text-slate-900">{resultadoValuracion.indiceSolvencia}</span>
                    <span className="text-xs font-bold text-slate-400">/100</span>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">ÍNDICE DE SOLVENCIA</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Análisis económico y capacidad de pago según ingresos ({candidato.ingresosNetos}€/mes) y estabilidad laboral.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-500">Dictamen económico:</span>
                <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide ${resultadoValuracion.badgeColorStyle}`}>
                  {resultadoValuracion.nivelClasificacion}
                </span>
              </div>
            </div>

            {/* TARJETA 2: VALORACIÓN FINAL DE INCIDENCIAS (CUESTIONARIO CONDUCTUAL) */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-5 shadow-sm border border-slate-700/80 space-y-3.5 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase font-extrabold text-indigo-300 tracking-wider bg-indigo-950/80 px-2.5 py-1 rounded-full border border-indigo-500/30 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    2. Cuestionario Conductual
                  </span>
                  {candidato.cuestionarioIncidencias?.analisisIa?.scores?.perfilOperativo !== undefined && (
                    <div className="flex items-baseline gap-1 bg-slate-950 px-3 py-1 rounded-xl border border-slate-700">
                      <span className="text-2xl font-black text-amber-400">
                        {candidato.cuestionarioIncidencias.analisisIa.scores.perfilOperativo}
                      </span>
                      <span className="text-xs font-bold text-slate-400">/100</span>
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                    PERFIL OPERATIVO GLOBAL
                  </span>
                  <h4 className="text-sm font-extrabold text-white">VALORACIÓN FINAL DE INCIDENCIAS</h4>
                </div>

                {candidato.cuestionarioIncidencias?.analisisIa ? (
                  <div className="space-y-2 pt-0.5">
                    {/* Badge */}
                    <div
                      className={`px-3 py-1 rounded-xl text-xs font-extrabold w-fit border ${
                        candidato.cuestionarioIncidencias.analisisIa.resultadoFinalNivel === 'adecuado'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : candidato.cuestionarioIncidencias.analisisIa.resultadoFinalNivel === 'requiere_atencion'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      {candidato.cuestionarioIncidencias.analisisIa.resultadoFinalNivel === 'adecuado'
                        ? '🟢 Adecuado'
                        : candidato.cuestionarioIncidencias.analisisIa.resultadoFinalNivel === 'requiere_atencion'
                        ? '🟡 Requiere atención'
                        : '🔴 Se observan conductas que conviene revisar'}
                    </div>

                    {/* Explicación del análisis de conducta */}
                    <p className="text-xs text-slate-300 leading-relaxed line-clamp-2 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                      {candidato.cuestionarioIncidencias.analisisIa.explicacionResumen}
                    </p>
                  </div>
                ) : candidato.cuestionarioIncidencias?.completado ? (
                  <div className="space-y-2 py-1">
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-200 border border-blue-400/30 text-xs font-bold rounded-xl inline-block">
                      Cuestionario recibido • Analizando con IA...
                    </span>
                    {onRunAiAnalysis && (
                      <button
                        onClick={async () => {
                          setIsAnalyzing(true);
                          try {
                            await onRunAiAnalysis(candidato.id);
                          } finally {
                            setIsAnalyzing(false);
                          }
                        }}
                        disabled={isAnalyzing}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>{isAnalyzing ? 'Analizando con IA...' : 'Generar valoración IA ahora'}</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 py-1">
                    <span className="px-3 py-1 bg-amber-500/20 text-amber-200 border border-amber-400/30 text-xs font-bold rounded-xl inline-block">
                      Cuestionario de incidencias pendiente
                    </span>
                    <p className="text-xs text-slate-400">
                      El candidato aún no ha completado el cuestionario situacional de incidencias.
                    </p>
                    {onEnviarCuestionario && (
                      <button
                        onClick={() => onEnviarCuestionario(candidato)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Enviar cuestionario</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TARJETA COMPLETA DEL ÍNDICE DE SOLVENCIA */}
          <SolvenciaCard resultado={resultadoValuracion} />

          {/* FASE 2: SOLICITUD Y GESTIÓN DE DOCUMENTACIÓN POST-VISITA */}
          {(() => {
            const docSol = solicitudesDoc.find(
              (s) =>
                s.candidatoId === candidato.id ||
                (s.candidatoNombre && candidato.nombre && s.candidatoNombre.trim().toLowerCase() === candidato.nombre.trim().toLowerCase()) ||
                (s.candidatoTelefono && candidato.telefono && s.candidatoTelefono.replace(/\s+/g, '') === candidato.telefono.replace(/\s+/g, ''))
            );
            if (docSol) {
              const totalDocs = docSol.documentos.length;
              const subidosDocs = docSol.documentos.filter(
                (d) => d.estado === 'subido' || d.estado === 'validado' || (d.archivos && d.archivos.length > 0)
              ).length;
              const validadosDocs = docSol.documentos.filter((d) => d.estado === 'validado').length;
              const docInfo = getSolicitudDocEstadoInfo(docSol.estado);
              const progress = totalDocs > 0 ? Math.round((subidosDocs / totalDocs) * 100) : 0;

              return (
                <div className="bg-white rounded-2xl border border-indigo-200 shadow-2xs p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-50 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                        <FileCheck2 className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-sm text-slate-900">Documentación Solicitada (Post-Visita)</h3>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${docInfo.badgeClass}`}>
                            {docInfo.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {subidosDocs} de {totalDocs} documentos aportados · {validadosDocs} validados
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => onOpenDetalleSolicitudDoc && onOpenDetalleSolicitudDoc(docSol)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 self-start sm:self-center"
                    >
                      <FileCheck2 className="w-4 h-4" />
                      <span>Gestionar Documentación</span>
                    </button>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold text-slate-600">
                      <span>Progreso de aportación</span>
                      <span className="text-indigo-600 font-bold">{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Doc items mini chips */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                    {docSol.documentos.map((d) => (
                      <div
                        key={d.id}
                        className={`p-2 rounded-xl border text-xs flex items-center justify-between gap-1.5 ${
                          d.estado === 'validado'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : d.estado === 'requiere_correccion'
                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                            : d.archivos && d.archivos.length > 0
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        <span className="truncate font-medium" title={d.nombre}>{d.nombre}</span>
                        <span className="shrink-0 text-[10px] font-bold">
                          {d.estado === 'validado'
                            ? '✓ Validado'
                            : d.estado === 'requiere_correccion'
                            ? '⚠️ Corregir'
                            : d.archivos && d.archivos.length > 0
                            ? '📄 Subido'
                            : 'Pendiente'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-left">
                  <div className="p-2 bg-white border border-slate-200 text-slate-600 rounded-xl shrink-0">
                    <FileCheck2 className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Solicitud de Documentación Post-Visita</h4>
                    <p className="text-[11px] text-slate-500">
                      Solicita nóminas, contrato, vida laboral y DNI con un enlace privado y plantilla preconfigurada.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenCrearSolicitudDoc && onOpenCrearSolicitudDoc(candidato, property)}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Solicitar Documentos</span>
                </button>
              </div>
            );
          })()}

          {/* PERFIL DE GESTIÓN DE INCIDENCIAS (NUEVO MÓDULO) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Perfil de gestión de incidencias</h3>
                  <p className="text-[11px] text-slate-500">
                    Cuestionario situacional sobre reacción ante pequeñas incidencias en la vivienda.
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              {candidato.cuestionarioIncidencias?.completado ? (
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full border border-emerald-200 flex items-center gap-1.5 self-start sm:self-center">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Cuestionario completado
                </span>
              ) : (
                <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full border border-amber-200 flex items-center gap-1.5 self-start sm:self-center">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Cuestionario pendiente
                </span>
              )}
            </div>

            {/* If Completed */}
            {candidato.cuestionarioIncidencias?.completado ? (
              <div className="space-y-4 pt-1 text-xs">
                {/* Meta details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Fecha de realización:</span>
                    <strong className="text-slate-900">
                      {candidato.cuestionarioIncidencias?.fechaCompletado
                        ? new Date(candidato.cuestionarioIncidencias.fechaCompletado).toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Recientemente'}
                    </strong>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[11px]">Número de preguntas respondidas:</span>
                    <strong className="text-slate-900">
                      {candidato.cuestionarioIncidencias?.respuestas?.length || 12} de 12 preguntas
                    </strong>
                  </div>
                </div>

                {/* Open text answers */}
                <div className="space-y-2.5">
                  <span className="font-bold text-slate-900 block text-[11px] uppercase tracking-wider text-slate-500">
                    Respuestas abiertas disponibles
                  </span>

                  {/* Sit 12 */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                    <span className="font-bold text-slate-800 block text-[11px]">
                      Situación 12: Aire acondicionado no enfría en sábado tarde
                    </span>
                    <p className="text-slate-700 italic bg-white p-2.5 rounded-lg border border-slate-200/80 leading-relaxed">
                      "{candidato.cuestionarioIncidencias?.respuestas?.find((r) => r.preguntaId === 'sit_12')?.respuestaTextoLibre || 'Sin respuesta'}"
                    </p>
                  </div>

                  {/* Additional info */}
                  {candidato.cuestionarioIncidencias?.informacionAdicional && (
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                      <span className="font-bold text-slate-800 block text-[11px]">
                        Información adicional sobre mantenimiento
                      </span>
                      <p className="text-slate-700 italic bg-white p-2.5 rounded-lg border border-slate-200/80 leading-relaxed">
                        "{candidato.cuestionarioIncidencias.informacionAdicional}"
                      </p>
                    </div>
                  )}
                </div>

                {/* AI Analysis Component & Action */}
                <div className="pt-2 border-t border-slate-100 space-y-4">
                  <AnalisisIncidenciasCard
                    candidato={candidato}
                    analisis={candidato.cuestionarioIncidencias?.analisisIa}
                    onRunAnalysis={async () => {
                      if (onRunAiAnalysis) {
                        setIsAnalyzing(true);
                        try {
                          await onRunAiAnalysis(candidato.id);
                        } finally {
                          setIsAnalyzing(false);
                        }
                      }
                    }}
                    isLoading={isAnalyzing}
                  />

                  {onOpenQuestionnaireSimulation && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => onOpenQuestionnaireSimulation(candidato.id)}
                        className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Ver / Editar respuestas del cuestionario</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* If Pending */
              <div className="space-y-3 pt-1 text-xs text-slate-600">
                <p>
                  El candidato aún no ha completado el cuestionario de incidencias. Puedes enviarle el enlace directo para que responda desde su teléfono o rellenarlo ahora.
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const link = `${window.location.origin}${window.location.pathname}?cuestionario=${candidato.id}`;
                      navigator.clipboard.writeText(link);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 3000);
                    }}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">¡Enlace Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>Enviar cuestionario al candidato</span>
                      </>
                    )}
                  </button>

                  {onOpenQuestionnaireSimulation && (
                    <button
                      type="button"
                      onClick={() => onOpenQuestionnaireSimulation(candidato.id)}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Responder como candidato</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* RESUMEN DOCUMENTAL Y COMPROBACIÓN */}
          <ResumenDocumentalCard candidato={effectiveCandidato} documentosAnalizados={effectiveCandidato.documentosAnalizados} />

          {/* DOCUMENTACIÓN DETALLADA Y SUBIDA GEMINI */}
          <DocumentosListSection
            candidato={effectiveCandidato}
            onUpdateCandidateDocs={handleUpdateDocs}
          />

          {/* Titulares y Situación Económica / Laboral */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span>Titulares del Contrato</span>
              </h4>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                (candidato.numTitularesContrato === 2 || candidato.cotitular)
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                {(candidato.numTitularesContrato === 2 || candidato.cotitular)
                  ? '👥 2 Titulares en Contrato'
                  : '👤 1 Titular Único'}
              </span>
            </div>

            {/* If 2 Titulares */}
            {(candidato.numTitularesContrato === 2 || candidato.cotitular) ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Titular 1 Card */}
                  <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md">
                        Titular 1 (Principal)
                      </span>
                      <span className="text-xs font-extrabold text-emerald-700">
                        {formatEuro(candidato.ingresosNetos)}/mes
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[11px]">Nombre completo:</span>
                        <strong className="text-slate-900 text-sm">{candidato.nombre}</strong>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                        <div>
                          <span className="text-slate-500 block text-[11px]">Teléfono:</span>
                          <a href={`tel:${candidato.telefono}`} className="text-blue-600 font-semibold hover:underline flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {candidato.telefono}
                          </a>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[11px]">Email:</span>
                          <a href={`mailto:${candidato.email}`} className="text-blue-600 font-semibold hover:underline truncate block" title={candidato.email}>
                            {candidato.email}
                          </a>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                        <div>
                          <span className="text-slate-500 block text-[11px]">Tipo de Contrato:</span>
                          <span className="font-semibold text-slate-800">{getContractTypeLabel(candidato.tipoContrato)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[11px]">Antigüedad:</span>
                          <span className="font-semibold text-slate-800">{candidato.antiguedadLaboral || 'No indicada'}</span>
                        </div>
                      </div>

                      {candidato.empresa && (
                        <div className="pt-1 border-t border-slate-100">
                          <span className="text-slate-500 block text-[11px]">Empresa / Actividad:</span>
                          <span className="font-semibold text-slate-800">{candidato.empresa}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Titular 2 Card */}
                  <div className="border border-purple-200 rounded-xl p-4 space-y-3 bg-purple-50/20 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-purple-100 pb-2">
                      <span className="text-xs font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded-md">
                        Titular 2 (Cotitular)
                      </span>
                      <span className="text-xs font-extrabold text-emerald-700">
                        {formatEuro(candidato.cotitular?.ingresosNetos || 0)}/mes
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[11px]">Nombre completo:</span>
                        <strong className="text-slate-900 text-sm">{candidato.cotitular?.nombre || 'Cotitular'}</strong>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 border-purple-100/60 border-t">
                        <div>
                          <span className="text-slate-500 block text-[11px]">Teléfono:</span>
                          {candidato.cotitular?.telefono ? (
                            <a href={`tel:${candidato.cotitular.telefono}`} className="text-blue-600 font-semibold hover:underline flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {candidato.cotitular.telefono}
                            </a>
                          ) : (
                            <span className="text-slate-400">No especificado</span>
                          )}
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[11px]">Email:</span>
                          {candidato.cotitular?.email ? (
                            <a href={`mailto:${candidato.cotitular.email}`} className="text-blue-600 font-semibold hover:underline truncate block" title={candidato.cotitular.email}>
                              {candidato.cotitular.email}
                            </a>
                          ) : (
                            <span className="text-slate-400">No especificado</span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 border-purple-100/60 border-t">
                        <div>
                          <span className="text-slate-500 block text-[11px]">Tipo de Contrato:</span>
                          <span className="font-semibold text-slate-800">{getContractTypeLabel(candidato.cotitular?.tipoContrato || 'indefinido')}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[11px]">Antigüedad:</span>
                          <span className="font-semibold text-slate-800">{candidato.cotitular?.antiguedadLaboral || 'No indicada'}</span>
                        </div>
                      </div>

                      {candidato.cotitular?.empresa && (
                        <div className="pt-1 border-purple-100/60 border-t">
                          <span className="text-slate-500 block text-[11px]">Empresa / Actividad:</span>
                          <span className="font-semibold text-slate-800">{candidato.cotitular.empresa}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Combined Household Income Summary Bar */}
                <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Euro className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-bold text-emerald-950">Ingresos conjuntos de la unidad familiar:</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-emerald-800">
                      {formatEuro(candidato.ingresosNetos + (candidato.cotitular?.ingresosNetos || 0))} / mes
                    </span>
                    <span className="text-[10px] text-emerald-600 block">
                      ({formatEuro(candidato.ingresosNetos)} + {formatEuro(candidato.cotitular?.ingresosNetos || 0)})
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* Single Titular */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Contact Info */}
                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-2">
                    <User className="w-4 h-4 text-blue-600" />
                    Datos de Contacto
                  </h4>
                  <div className="space-y-2 text-xs sm:text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Teléfono:</span>
                      <a href={`tel:${candidato.telefono}`} className="font-medium text-blue-600 hover:underline flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" />
                        {candidato.telefono}
                      </a>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Email:</span>
                      <a href={`mailto:${candidato.email}`} className="font-medium text-blue-600 hover:underline flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" />
                        {candidato.email}
                      </a>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Inquilinos previsto:</span>
                      <span className="font-medium text-slate-800">{candidato.numPersonas} persona(s)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Fecha de solicitud:</span>
                      <span className="font-medium text-slate-800 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(candidato.fechaCreacion)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Employment Info */}
                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-2">
                    <Briefcase className="w-4 h-4 text-blue-600" />
                    Situación Laboral y Económica
                  </h4>
                  <div className="space-y-2 text-xs sm:text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Ingresos netos:</span>
                      <span className="font-bold text-emerald-700 text-sm">{formatEuro(candidato.ingresosNetos)}/mes</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Tipo de Empleo:</span>
                      <span className="font-medium text-slate-800">{getEmploymentTypeLabel(candidato.tipoEmpleo)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Tipo de Contrato:</span>
                      <span className="font-medium text-slate-800">{getContractTypeLabel(candidato.tipoContrato)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Antigüedad Laboral:</span>
                      <span className="font-medium text-slate-800">{candidato.antiguedadLaboral}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Dispone de Avalista:</span>
                      <span className={`font-semibold px-2 py-0.5 rounded text-xs ${candidato.avalista ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                        {candidato.avalista ? 'Sí' : 'No'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* BLOC DE NOTAS PRIVADO POR CANDIDATO (IMPRESIONES DURANTE/DESPUÉS DE VISITAS) */}
          <div className="bg-amber-50/40 border border-amber-200/90 rounded-2xl p-5 space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/70 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <StickyNote className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-sm text-slate-900">Bloc de Notas Privado</h3>
                    <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full text-[10px] font-extrabold flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      Solo Propietario
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-900/80">
                    Anotaciones personales e impresiones durante o tras las visitas. Nunca son compartidas con el candidato.
                  </p>
                </div>
              </div>

              <span className="text-xs font-bold text-amber-900 bg-amber-100 px-2.5 py-1 rounded-lg self-start sm:self-center">
                {candidato.notasPrivadas?.length || 0} nota{(candidato.notasPrivadas?.length || 0) === 1 ? '' : 's'}
              </span>
            </div>

            {/* Input Form for New Note */}
            <form onSubmit={handleAddNotaPrivada} className="space-y-2">
              <textarea
                value={nuevaNotaTexto}
                onChange={(e) => setNuevaNotaTexto(e.target.value)}
                placeholder="Escribe aquí tus impresiones de la visita, puntualidad, trato personal, dudas planteadas o detalles para recordar..."
                rows={3}
                className="w-full p-3 bg-white border border-amber-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none shadow-2xs"
              />
              <div className="flex justify-between items-center gap-2">
                <span className="text-[11px] text-slate-400">
                  Las notas quedan guardadas con fecha y hora en el expediente del candidato.
                </span>
                <button
                  type="submit"
                  disabled={!nuevaNotaTexto.trim()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Guardar Nota</span>
                </button>
              </div>
            </form>

            {/* Notes History Feed */}
            {candidato.notasPrivadas && candidato.notasPrivadas.length > 0 ? (
              <div className="space-y-2.5 pt-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Historial de notas del candidato
                </span>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {candidato.notasPrivadas.map((nota) => (
                    <div
                      key={nota.id}
                      className="bg-white border border-amber-200/80 rounded-xl p-3.5 space-y-1.5 shadow-2xs group hover:border-amber-300 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-amber-900 bg-amber-100/70 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-700" />
                          {nota.fecha}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteNotaPrivada(nota.id)}
                          className="text-slate-300 hover:text-rose-600 transition-colors p-1 rounded-md hover:bg-rose-50"
                          title="Eliminar esta nota"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {nota.texto}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-100/40 border border-amber-200/60 rounded-xl text-center text-xs text-amber-900">
                Aún no has añadido ninguna nota de visita para {candidato.nombre}. Escribe tus impresiones arriba para guardarlas en su ficha.
              </div>
            )}
          </div>

          {/* Observations */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-2">
            <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-600" />
              Observaciones Iniciales del Formulario
            </h4>
            <p className="text-xs sm:text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-line">
              {candidato.observaciones || 'Sin observaciones iniciales registradas.'}
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3">
          {onGoToAnalysis && (
            <button
              onClick={() => {
                onGoToAnalysis(candidato);
                onClose();
              }}
              className="w-full sm:w-auto px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium text-sm rounded-xl transition-colors flex items-center justify-center gap-2 border border-indigo-200"
            >
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              Ver en Sección de Análisis de Solvencia
            </button>
          )}

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-sm font-medium rounded-xl transition-colors w-full sm:w-auto"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
