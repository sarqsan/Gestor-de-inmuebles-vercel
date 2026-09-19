import React, { useState, useEffect } from 'react';
import {
  SolicitudDocumentacion,
  ItemDocumentoSolicitado,
  DocItemEstado,
  SolicitudDocEstado,
  ArchivoAportado,
  Candidato,
  DocumentoAnalizado,
  TipoDocumento,
} from '../types';
import {
  getSolicitudDocEstadoInfo,
  generarMensajeWhatsappSolicitud,
} from '../utils/documentTemplates';
import {
  X,
  FileCheck2,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  Copy,
  Check,
  Calendar,
  User,
  Home,
  ShieldCheck,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  Download,
  AlertCircle,
  Sparkles,
  Zap,
} from 'lucide-react';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface DetalleSolicitudDocModalProps {
  solicitud: SolicitudDocumentacion;
  candidato?: Candidato | null;
  onClose: () => void;
  onUpdateSolicitud: (updated: SolicitudDocumentacion) => Promise<void>;
  onOpenWhatsapp?: (url: string) => void;
  onUpdateCandidateDocs?: (candidateId: string, docs: DocumentoAnalizado[]) => void;
  /** Eliminar definitivamente el expediente documental (con confirmación). */
  onDeleteSolicitud?: (solicitudId: string) => void | Promise<void>;
  /** Abrir el portal público de documentación dentro de la propia aplicación. */
  onOpenPublicView?: (token: string) => void;
}

export const DetalleSolicitudDocModal: React.FC<DetalleSolicitudDocModalProps> = ({
  solicitud,
  candidato,
  onClose,
  onUpdateSolicitud,
  onOpenWhatsapp,
  onUpdateCandidateDocs,
  onDeleteSolicitud,
  onOpenPublicView,
}) => {
  const [solState, setSolState] = useState<SolicitudDocumentacion>(solicitud);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState<boolean>(false);
  const [copiedMsg, setCopiedMsg] = useState<boolean>(false);
  const [correctionTargetId, setCorrectionTargetId] = useState<string | null>(null);
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [previewFile, setPreviewFile] = useState<ArchivoAportado | null>(null);

  const [showAddNewDoc, setShowAddNewDoc] = useState<boolean>(false);
  const [newDocName, setNewDocName] = useState<string>('');
  const [newDocDesc, setNewDocDesc] = useState<string>('');
  const [newDocObligatorio, setNewDocObligatorio] = useState<boolean>(true);

  // AI Analysis state
  const [analyzingDocIds, setAnalyzingDocIds] = useState<string[]>([]);
  const [aiAnalysisResults, setAiAnalysisResults] = useState<Record<string, any>>({});
  const [isAnalyzingAll, setIsAnalyzingAll] = useState<boolean>(false);

  // Synchronize state when prop updates from Firestore or parent
  useEffect(() => {
    setSolState(solicitud);
  }, [solicitud]);

  // Status counts
  const totalDocs = solState.documentos.length;
  const subidosDocs = solState.documentos.filter(
    (d) => d.estado === 'subido' || d.estado === 'validado' || (d.archivos && d.archivos.length > 0)
  ).length;
  const validadosDocs = solState.documentos.filter((d) => d.estado === 'validado').length;
  const correccionDocs = solState.documentos.filter((d) => d.estado === 'requiere_correccion').length;
  const progressPercent = totalDocs > 0 ? Math.round((subidosDocs / totalDocs) * 100) : 0;

  const publicUrl = `${window.location.origin}/#documentacion/${solState.token}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyWhatsappText = () => {
    const msg = generarMensajeWhatsappSolicitud(solState);
    navigator.clipboard.writeText(msg);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2500);
  };

  const handleOpenWhatsappClick = () => {
    const msg = generarMensajeWhatsappSolicitud(solState);
    const cleanPhone = solState.candidatoTelefono.replace(/[^0-9]/g, '');
    const phoneWithPrefix = cleanPhone.startsWith('34') ? cleanPhone : `34${cleanPhone}`;
    const whatsappUrl = `https://wa.me/${phoneWithPrefix}?text=${encodeURIComponent(msg)}`;

    if (onOpenWhatsapp) {
      onOpenWhatsapp(whatsappUrl);
    } else {
      window.open(whatsappUrl, '_blank');
    }
  };

  // Helper: Run Gemini AI analysis on a document item's attached files
  const handleRunAiAnalysisForDoc = async (item: ItemDocumentoSolicitado) => {
    if (!item.archivos || item.archivos.length === 0) return;
    const file = item.archivos[0];
    setAnalyzingDocIds((prev) => [...prev, item.id]);

    try {
      const response = await fetch('/api/analizar-documento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentBase64: file.base64Data,
          documentUrl: file.url,
          mimeType: file.mimeType || 'application/pdf',
          filename: file.nombreArchivo,
          tipoHint: item.tipo,
          candidatoManualData: {
            nombre: candidato?.nombre || solState.candidatoNombre,
            ingresosNetos: candidato?.ingresosNetos,
            tipoEmpleo: candidato?.tipoEmpleo,
            tipoContrato: candidato?.tipoContrato,
          },
        }),
      });

      const result = await response.json();
      if (response.ok && !result.error) {
        setAiAnalysisResults((prev) => ({
          ...prev,
          [item.id]: result,
        }));

        // Propagate to candidate's analyzed docs if handler available
        if (candidato && onUpdateCandidateDocs) {
          const newAnalizado: DocumentoAnalizado = {
            id: file.id,
            candidatoId: candidato.id,
            nombreArchivo: file.nombreArchivo,
            mimeType: file.mimeType || 'application/pdf',
            base64Data: file.base64Data,
            url: file.url,
            tipoDocumento: (result.tipoDocumento as TipoDocumento) || item.tipo || 'otro',
            tipoIdentificadoAI: (result.tipoDocumento as TipoDocumento) || item.tipo || 'otro',
            tipoIdentificadoNombre: result.tipoIdentificadoNombre,
            datosExtraidos: result.datosExtraidos || {},
            resumenAI: result.resumenDocumento,
            coherenciaWarnings: result.coherenciaWarnings || [],
            fechaSubida: file.fechaSubida || new Date().toISOString().split('T')[0],
            estadoAnalisis: 'analizado',
          };

          const existingCandDocs = candidato.documentosAnalizados || [];
          const updatedCandDocs = existingCandDocs.filter((d) => d.id !== file.id);
          onUpdateCandidateDocs(candidato.id, [...updatedCandDocs, newAnalizado]);
        }
      }
    } catch (err) {
      console.error('Error running AI document analysis:', err);
    } finally {
      setAnalyzingDocIds((prev) => prev.filter((id) => id !== item.id));
    }
  };

  // Helper: Run AI analysis for all uploaded documents in the request
  const handleAnalyzeAllWithAi = async () => {
    const itemsWithFiles = solState.documentos.filter((d) => d.archivos && d.archivos.length > 0);
    if (itemsWithFiles.length === 0) return;

    setIsAnalyzingAll(true);
    try {
      for (const item of itemsWithFiles) {
        await handleRunAiAnalysisForDoc(item);
      }
    } finally {
      setIsAnalyzingAll(false);
    }
  };

  // Action: Mark document item as Validated
  const handleValidateDoc = async (itemId: string) => {
    const updatedDocs = solState.documentos.map((doc) =>
      doc.id === itemId
        ? {
            ...doc,
            estado: 'validado' as DocItemEstado,
            fechaValidacion: new Date().toISOString(),
            motivoCorreccion: undefined,
          }
        : doc
    );

    // Calculate new overall status
    const allValidated = updatedDocs.every((d) => d.estado === 'validado');
    const newEstado: SolicitudDocEstado = allValidated ? 'APROBADA' : solState.estado;

    const updatedSol: SolicitudDocumentacion = {
      ...solState,
      documentos: updatedDocs,
      estado: newEstado,
      historial: [
        ...solState.historial,
        {
          id: `h-${Date.now()}`,
          fecha: new Date().toLocaleString('es-ES'),
          autor: 'propietario',
          accion: 'Documento validado',
          detalle: `Se validó el documento "${solState.documentos.find((d) => d.id === itemId)?.nombre}"`,
        },
      ],
    };

    setSolState(updatedSol);
    await onUpdateSolicitud(updatedSol);
  };

  // Action: Request correction on document item
  const handleRequestCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionTargetId || !correctionReason.trim()) return;

    const targetDoc = solState.documentos.find((d) => d.id === correctionTargetId);

    const updatedDocs = solState.documentos.map((doc) =>
      doc.id === correctionTargetId
        ? {
            ...doc,
            estado: 'requiere_correccion' as DocItemEstado,
            motivoCorreccion: correctionReason.trim(),
          }
        : doc
    );

    const updatedSol: SolicitudDocumentacion = {
      ...solState,
      documentos: updatedDocs,
      estado: 'REVISION_SOLICITADA',
      historial: [
        ...solState.historial,
        {
          id: `h-${Date.now()}`,
          fecha: new Date().toLocaleString('es-ES'),
          autor: 'propietario',
          accion: 'Corrección solicitada al candidato',
          detalle: `Doc "${targetDoc?.nombre}": ${correctionReason.trim()}`,
        },
      ],
    };

    setSolState(updatedSol);
    setCorrectionTargetId(null);
    setCorrectionReason('');
    await onUpdateSolicitud(updatedSol);
  };

  // Action: Add new requested doc to existing request
  const handleAddNewDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocName.trim()) return;

    const newItem: ItemDocumentoSolicitado = {
      id: `req-add-${Date.now()}`,
      tipo: 'otro',
      nombre: newDocName.trim(),
      descripcion: newDocDesc.trim() || undefined,
      obligatorio: newDocObligatorio,
      titular: 'general',
      estado: 'pendiente',
      archivos: [],
    };

    const updatedDocs = [...solState.documentos, newItem];
    const updatedSol: SolicitudDocumentacion = {
      ...solState,
      documentos: updatedDocs,
      estado: 'SOLICITADA',
      historial: [
        ...solState.historial,
        {
          id: `h-${Date.now()}`,
          fecha: new Date().toLocaleString('es-ES'),
          autor: 'propietario',
          accion: 'Documento adicional añadido',
          detalle: `Se añadió "${newDocName.trim()}"`,
        },
      ],
    };

    setSolState(updatedSol);
    setShowAddNewDoc(false);
    setNewDocName('');
    setNewDocDesc('');
    await onUpdateSolicitud(updatedSol);
  };

  // Action: Delete a doc requirement
  const handleDeleteDocRequirement = async (itemId: string) => {
    const targetDoc = solState.documentos.find((d) => d.id === itemId);
    if (!targetDoc) return;

    const confirm = window.confirm(`¿Seguro que deseas eliminar el requisito "${targetDoc.nombre}"?`);
    if (!confirm) return;

    const updatedDocs = solState.documentos.filter((d) => d.id !== itemId);
    const updatedSol: SolicitudDocumentacion = {
      ...solState,
      documentos: updatedDocs,
      historial: [
        ...solState.historial,
        {
          id: `h-${Date.now()}`,
          fecha: new Date().toLocaleString('es-ES'),
          autor: 'propietario',
          accion: 'Requisito documental eliminado',
          detalle: `Se eliminó el requisito "${targetDoc.nombre}"`,
        },
      ],
    };

    setSolState(updatedSol);
    await onUpdateSolicitud(updatedSol);
  };

  // Action: Approve complete request
  const handleApproveAll = async () => {
    const updatedDocs = solState.documentos.map((doc) => ({
      ...doc,
      estado: 'validado' as DocItemEstado,
      fechaValidacion: new Date().toISOString(),
    }));

    const updatedSol: SolicitudDocumentacion = {
      ...solState,
      documentos: updatedDocs,
      estado: 'APROBADA',
      fechaValidacion: new Date().toISOString(),
      historial: [
        ...solState.historial,
        {
          id: `h-${Date.now()}`,
          fecha: new Date().toLocaleString('es-ES'),
          autor: 'propietario',
          accion: 'Expediente documental aprobado globalmente',
          detalle: 'Se validó toda la documentación y se marcó como Aprobada',
        },
      ],
    };

    setSolState(updatedSol);
    await onUpdateSolicitud(updatedSol);
  };

  const estadoInfo = getSolicitudDocEstadoInfo(solState.estado);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 md:p-6 overflow-y-auto">
      <div
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                  Gestión de Documentación Solicitada
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${estadoInfo.badgeClass}`}>
                  {estadoInfo.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Candidato: <span className="font-semibold text-slate-800">{solState.candidatoNombre}</span> · Inmueble: <span className="font-medium text-slate-700">{solState.inmuebleNombre}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6 max-h-[78vh] overflow-y-auto space-y-6">
          {/* Progress & Quick Stats Card */}
          <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-700 block">Progreso de Aportación</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xl font-extrabold text-indigo-900">{subidosDocs} de {totalDocs}</span>
                  <span className="text-xs text-slate-500 font-medium">documentos subidos</span>
                </div>
              </div>

              {/* Status Pills */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <div className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{validadosDocs} Validados</span>
                </div>
                {correccionDocs > 0 && (
                  <div className="px-2.5 py-1 bg-amber-100 text-amber-900 rounded-lg font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{correccionDocs} Requieren Corrección</span>
                  </div>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  progressPercent === 100 ? 'bg-emerald-500' : 'bg-indigo-600'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Quick Actions & Links */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyLink}
                  className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors shadow-xs ${
                    copiedLink ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                  <span>{copiedLink ? 'Enlace Copiado' : 'Copiar Enlace Privado'}</span>
                </button>

                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    // Si la aplicación ofrece la vista interna, se usa el enrutado
                    // propio (la URL directa se mantiene como respaldo).
                    if (onOpenPublicView) {
                      e.preventDefault();
                      onOpenPublicView(solState.token);
                    }
                  }}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                  <span>Ver Portal como Candidato</span>
                </a>

                {onDeleteSolicitud && (
                  <button
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="px-3 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-xl font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar Expediente</span>
                  </button>
                )}
              </div>

              <button
                onClick={handleOpenWhatsappClick}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Recordar por WhatsApp</span>
              </button>
            </div>
          </div>

          {/* DOCUMENT ITEMS LIST */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span>Documentos Solicitados y Aportados ({subidosDocs}/{totalDocs})</span>
              </h4>

              <div className="flex items-center gap-2 flex-wrap">
                {subidosDocs > 0 && (
                  <button
                    type="button"
                    disabled={isAnalyzingAll}
                    onClick={handleAnalyzeAllWithAi}
                    className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isAnalyzingAll ? 'Analizando con Gemini...' : 'Analizar Todos con IA'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowAddNewDoc(true)}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Solicitar otro documento</span>
                </button>
              </div>
            </div>

            {/* Add new doc mini-form */}
            {showAddNewDoc && (
              <form
                onSubmit={handleAddNewDocSubmit}
                className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2.5 animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-950">Añadir documento a esta solicitud</span>
                  <button
                    type="button"
                    onClick={() => setShowAddNewDoc(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Nombre del documento..."
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Instrucciones específicas..."
                    value={newDocDesc}
                    onChange={(e) => setNewDocDesc(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newDocObligatorio}
                      onChange={(e) => setNewDocObligatorio(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>Obligatorio</span>
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowAddNewDoc(false)}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-bold"
                    >
                      Guardar y Solicitar
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* List of items */}
            <div className="space-y-3">
              {solState.documentos.map((doc, idx) => {
                const hasFiles = doc.archivos && doc.archivos.length > 0;
                const isPending = !hasFiles && doc.estado === 'pendiente';
                const isCorrection = doc.estado === 'requiere_correccion';
                const isValidated = doc.estado === 'validado';
                const isAnalyzingThis = analyzingDocIds.includes(doc.id);
                const aiResult = aiAnalysisResults[doc.id];

                // Also check if candidate already has analyzed data for this file
                const candDocAnalizado = candidato?.documentosAnalizados?.find(
                  (d) => doc.archivos?.some((f) => f.id === d.id || f.nombreArchivo === d.nombreArchivo)
                );
                const displayAiResult = aiResult || candDocAnalizado;

                return (
                  <div
                    key={doc.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isValidated
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : isCorrection
                        ? 'bg-amber-50/50 border-amber-300'
                        : hasFiles
                        ? 'bg-white border-indigo-200 shadow-xs'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm">{doc.nombre}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                              doc.obligatorio
                                ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {doc.obligatorio ? 'Obligatorio' : 'Opcional'}
                          </span>
                          {doc.titular && doc.titular !== 'general' && (
                            <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 text-[10px] font-bold rounded">
                              {doc.titular === 'titular_1' ? 'Titular 1' : doc.titular === 'titular_2' ? 'Titular 2' : 'Avalista'}
                            </span>
                          )}
                        </div>
                        {doc.descripcion && (
                          <p className="text-xs text-slate-500">{doc.descripcion}</p>
                        )}

                        {/* Status Badge */}
                        <div className="pt-1 flex items-center gap-2 flex-wrap">
                          {isValidated && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Validado
                            </span>
                          )}
                          {isCorrection && (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                Corrección solicitada al candidato
                              </span>
                              {doc.motivoCorreccion && (
                                <p className="text-xs text-amber-900 italic bg-amber-50 p-2 rounded-lg border border-amber-200">
                                  Motivo: "{doc.motivoCorreccion}"
                                </p>
                              )}
                            </div>
                          )}
                          {!isValidated && !isCorrection && hasFiles && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                              <FileCheck2 className="w-3.5 h-3.5" />
                              Subido por el candidato ({doc.archivos.length} {doc.archivos.length === 1 ? 'archivo' : 'archivos'})
                            </span>
                          )}
                          {isPending && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                              <Clock className="w-3.5 h-3.5" />
                              Pendiente de subida por el candidato
                            </span>
                          )}

                          {/* AI status badge if analyzed */}
                          {displayAiResult && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md border border-purple-200">
                              <Sparkles className="w-3 h-3 text-purple-600" />
                              Analizado por Gemini
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Item Actions */}
                      <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 flex-wrap">
                        {hasFiles && (
                          <button
                            type="button"
                            disabled={isAnalyzingThis}
                            onClick={() => handleRunAiAnalysisForDoc(doc)}
                            className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                            <span>{isAnalyzingThis ? 'Analizando...' : displayAiResult ? 'Re-analizar IA' : 'Analizar IA'}</span>
                          </button>
                        )}

                        {hasFiles && !isValidated && (
                          <button
                            onClick={() => handleValidateDoc(doc.id)}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Validar</span>
                          </button>
                        )}

                        {hasFiles && (
                          <button
                            onClick={() => setCorrectionTargetId(doc.id)}
                            className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span>Pedir Corrección</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Attached files list for this item */}
                    {hasFiles && (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                          Archivos adjuntados ({doc.archivos.length}):
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {doc.archivos.map((file) => (
                            <div
                              key={file.id}
                              className="p-2.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-800 truncate" title={file.nombreArchivo}>
                                    {file.nombreArchivo}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    {file.fechaSubida} {file.tamañoBytes ? `· ${(file.tamañoBytes / 1024).toFixed(0)} KB` : ''}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setPreviewFile(file)}
                                  className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                  title="Ver archivo"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                {file.url && (
                                  <a
                                    href={file.url}
                                    download={file.nombreArchivo}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1.5 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                                    title="Descargar"
                                  >
                                    <Download className="w-4 h-4" />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* AI Extracted Summary & Data Card */}
                    {displayAiResult && (
                      <div className="mt-3 p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl space-y-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-purple-950">
                            <Sparkles className="w-4 h-4 text-purple-600" />
                            <span>Verificación y Extracción IA: {displayAiResult.tipoIdentificadoNombre || displayAiResult.tipoDocumento}</span>
                          </div>
                          {displayAiResult.resumenDocumento && (
                            <span className="text-[10px] text-purple-600 font-semibold bg-purple-100 px-2 py-0.5 rounded-full">
                              Gemini 2.5 Flash
                            </span>
                          )}
                        </div>

                        {displayAiResult.resumenDocumento && (
                          <p className="text-purple-900 bg-white/80 p-2.5 rounded-lg border border-purple-100 text-xs leading-relaxed">
                            {displayAiResult.resumenDocumento}
                          </p>
                        )}

                        {/* Extracted Fields Grid */}
                        {displayAiResult.datosExtraidos && Object.keys(displayAiResult.datosExtraidos).length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                            {Object.entries(displayAiResult.datosExtraidos).map(([k, val]: [string, any]) => {
                              const displayVal = typeof val === 'object' ? val.valor : val;
                              const displayLabel = typeof val === 'object' ? val.label : k;
                              if (!displayVal || displayVal === 'No disponible') return null;
                              return (
                                <div key={k} className="bg-white p-2 rounded-lg border border-purple-100">
                                  <span className="text-[10px] text-slate-400 block font-medium capitalize">{displayLabel}</span>
                                  <span className="font-bold text-slate-800 text-xs truncate block">{displayVal}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Coherence Warnings if any */}
                        {displayAiResult.coherenciaWarnings && displayAiResult.coherenciaWarnings.length > 0 && (
                          <div className="space-y-1 pt-1">
                            {displayAiResult.coherenciaWarnings.map((w: string, i: number) => (
                              <div key={i} className="text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 text-xs flex items-start gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                <span>{w}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Correction Reason Form for this item */}
                    {correctionTargetId === doc.id && (
                      <form
                        onSubmit={handleRequestCorrectionSubmit}
                        className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 animate-in fade-in duration-200"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-950 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                            Indicar motivo de corrección para el candidato:
                          </span>
                          <button
                            type="button"
                            onClick={() => setCorrectionTargetId(null)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input
                          type="text"
                          required
                          placeholder="Ej. El documento no es legible / Falta la última nómina firmada..."
                          value={correctionReason}
                          onChange={(e) => setCorrectionReason(e.target.value)}
                          className="w-full bg-white border border-amber-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setCorrectionTargetId(null)}
                            className="px-3 py-1 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold"
                          >
                            Enviar Notificación de Corrección
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* HISTORIAL SECTION */}
          {solState.historial && solState.historial.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Historial de Actividad de la Solicitud
              </h5>
              <div className="space-y-1.5">
                {solState.historial.map((h) => (
                  <div key={h.id} className="text-xs p-2 bg-slate-50 rounded-lg flex items-center justify-between">
                    <span className="text-slate-700 font-medium">
                      {h.autor === 'propietario' ? '👤 Propietario:' : '📱 Candidato:'} {h.accion}
                      {h.detalle ? ` — ${h.detalle}` : ''}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-2">{h.fecha}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modal Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold"
            >
              Cerrar
            </button>

            <div className="flex items-center gap-2">
              {solState.estado !== 'APROBADA' && subidosDocs > 0 && (
                <button
                  onClick={handleApproveAll}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Aprobar Toda la Documentación</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* IN-MODAL FILE PREVIEW OVERLAY */}
        {previewFile && (
          <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl p-4 max-w-2xl w-full max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h5 className="font-bold text-slate-900 text-sm truncate">{previewFile.nombreArchivo}</h5>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-2 flex items-center justify-center my-auto min-h-[300px]">
                {previewFile.mimeType.startsWith('image/') || previewFile.url?.startsWith('data:image') ? (
                  <img
                    src={previewFile.url || previewFile.base64Data}
                    alt={previewFile.nombreArchivo}
                    className="max-h-[60vh] object-contain rounded-lg shadow-sm"
                  />
                ) : (
                  <div className="text-center p-6 space-y-3">
                    <FileText className="w-16 h-16 text-indigo-500 mx-auto" />
                    <p className="text-xs text-slate-600">Vista previa de documento PDF</p>
                    {previewFile.url && (
                      <a
                        href={previewFile.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
                      >
                        Abrir PDF en pestaña nueva
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {onDeleteSolicitud && (
        <ConfirmDeleteModal
          isOpen={confirmDeleteOpen}
          title="Eliminar expediente documental"
          description={`Se eliminará definitivamente la solicitud de documentación de ${solState.candidatoNombre} y su enlace privado dejará de ser válido. Esta acción no se puede deshacer.`}
          confirmText="Eliminar Expediente"
          onConfirm={async () => {
            setConfirmDeleteOpen(false);
            await onDeleteSolicitud(solState.id);
          }}
          onCancel={() => setConfirmDeleteOpen(false)}
        />
      )}
    </div>
  );
};
