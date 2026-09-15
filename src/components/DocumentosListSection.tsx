import React, { useState } from 'react';
import { Candidato, DocumentoAnalizado, TipoDocumento, ExtractedField } from '../types';
import { getTipoDocumentoLabel, getEstadoAnalisisInfo, formatDate } from '../utils/formatters';
import { DocumentUploadModal } from './DocumentUploadModal';
import { DocumentAnalysisModal } from './DocumentAnalysisModal';
import {
  FileText,
  Upload,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  Trash2,
  RefreshCw,
  FileCode2,
  RotateCcw,
  Download,
  ExternalLink,
} from 'lucide-react';

interface DocumentosListSectionProps {
  candidato: Candidato;
  onUpdateCandidateDocs: (candidateId: string, docs: DocumentoAnalizado[], updatedCandidateData?: Partial<Candidato>) => void;
}

export const DocumentosListSection: React.FC<DocumentosListSectionProps> = ({
  candidato,
  onUpdateCandidateDocs,
}) => {
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [inspectDoc, setInspectDoc] = useState<DocumentoAnalizado | null>(null);
  const [analyzingIds, setAnalyzingIds] = useState<string[]>([]);

  const docs = candidato.documentosAnalizados || [];

  // Handler: Add new document
  const handleUploadDocument = (fileData: {
    nombreArchivo: string;
    mimeType: string;
    base64Data: string;
    tipoDocumento: TipoDocumento;
  }) => {
    const newDoc: DocumentoAnalizado = {
      id: `doc-analisis-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      candidatoId: candidato.id,
      nombreArchivo: fileData.nombreArchivo,
      mimeType: fileData.mimeType,
      base64Data: fileData.base64Data,
      tipoDocumento: fileData.tipoDocumento,
      fechaSubida: new Date().toISOString().split('T')[0],
      estadoAnalisis: 'pendiente',
    };

    const updatedDocs = [...docs, newDoc];
    onUpdateCandidateDocs(candidato.id, updatedDocs);

    // Automatically trigger Gemini analysis for the newly added document
    triggerAnalysisForDocs([newDoc], updatedDocs);
  };

  // Helper: Call server API /api/analizar-documento for specific documents
  const triggerAnalysisForDocs = async (
    targetDocs: DocumentoAnalizado[],
    currentDocsState: DocumentoAnalizado[]
  ) => {
    const idsToAnalyze = targetDocs.map((d) => d.id);
    setAnalyzingIds((prev) => [...prev, ...idsToAnalyze]);

    // Update state to 'analizando'
    let updatedList = currentDocsState.map((d) =>
      idsToAnalyze.includes(d.id) ? { ...d, estadoAnalisis: 'analizando' as const } : d
    );
    onUpdateCandidateDocs(candidato.id, updatedList);

    for (const doc of targetDocs) {
      try {
        const response = await fetch('/api/analizar-documento', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentBase64: doc.base64Data,
            documentUrl: doc.url,
            mimeType: doc.mimeType,
            filename: doc.nombreArchivo,
            tipoHint: doc.tipoDocumento,
            candidatoManualData: {
              nombre: candidato.nombre,
              ingresosNetos: candidato.ingresosNetos,
              tipoEmpleo: candidato.tipoEmpleo,
              tipoContrato: candidato.tipoContrato,
            },
          }),
        });

        const result = await response.json();

        if (response.ok && !result.error) {
          updatedList = updatedList.map((d) => {
            if (d.id === doc.id) {
              return {
                ...d,
                estadoAnalisis: 'analizado' as const,
                tipoDocumento: (result.tipoDocumento as TipoDocumento) || doc.tipoDocumento,
                tipoIdentificadoAI: (result.tipoDocumento as TipoDocumento) || doc.tipoDocumento,
                tipoIdentificadoNombre: result.tipoIdentificadoNombre,
                datosExtraidos: result.datosExtraidos || {},
                resumenAI: result.resumenDocumento,
                coherenciaWarnings: result.coherenciaWarnings || [],
              };
            }
            return d;
          });
        } else {
          // Handle error
          updatedList = updatedList.map((d) => {
            if (d.id === doc.id) {
              return {
                ...d,
                estadoAnalisis: 'error' as const,
                mensajeError: result.error || 'Error en análisis Gemini',
              };
            }
            return d;
          });
        }
      } catch (err: any) {
        console.error('Error analizando documento:', err);
        updatedList = updatedList.map((d) => {
          if (d.id === doc.id) {
            return {
              ...d,
              estadoAnalisis: 'error' as const,
              mensajeError: 'No se pudo conectar con el servicio de análisis.',
            };
          }
          return d;
        });
      } finally {
        setAnalyzingIds((prev) => prev.filter((id) => id !== doc.id));
      }
    }

    onUpdateCandidateDocs(candidato.id, updatedList);
  };

  // Handler: Analyze all pending documents
  const handleAnalyzePending = () => {
    const pendings = docs.filter((d) => d.estadoAnalisis === 'pendiente' || d.estadoAnalisis === 'error');
    if (pendings.length > 0) {
      triggerAnalysisForDocs(pendings, docs);
    }
  };

  // Handler: Delete document
  const handleDeleteDocument = (docId: string) => {
    const updatedDocs = docs.filter((d) => d.id !== docId);
    onUpdateCandidateDocs(candidato.id, updatedDocs);
  };

  // Handler: Confirm document data and update candidate profile if user approves
  const handleConfirmDocumentData = (
    docId: string,
    updatedFields: Record<string, ExtractedField>,
    newTipoDoc?: TipoDocumento
  ) => {
    let candidateDataToUpdate: Partial<Candidato> = {};

    // Check if user confirmed income or employment fields and offer updating candidate
    const fieldNeto = updatedFields.salarioNeto?.valor || updatedFields.liquido?.valor;
    if (fieldNeto && updatedFields.salarioNeto?.confirmado) {
      const parsedNum = parseFloat(String(fieldNeto).replace(/[^0-9,.-]/g, '').replace(',', '.'));
      if (!isNaN(parsedNum) && parsedNum > 0) {
        candidateDataToUpdate.ingresosNetos = parsedNum;
      }
    }

    const updatedDocs = docs.map((d) => {
      if (d.id === docId) {
        return {
          ...d,
          datosExtraidos: updatedFields,
          tipoDocumento: newTipoDoc || d.tipoDocumento,
          confirmadoUsuario: true,
        };
      }
      return d;
    });

    onUpdateCandidateDocs(candidato.id, updatedDocs, candidateDataToUpdate);
  };

  const pendingCount = docs.filter((d) => d.estadoAnalisis === 'pendiente').length;

  return (
    <div className="space-y-4">
      {/* Header with Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            DOCUMENTACIÓN DE {candidato.nombre.toUpperCase()}
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Adjunta y analiza nóminas, contratos, vida laboral y declaraciones para extraer información objetiva.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" />
            + Añadir documento
          </button>

          {pendingCount > 0 && (
            <button
              onClick={handleAnalyzePending}
              disabled={analyzingIds.length > 0}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-500/20 flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              Analizar documentos pendientes ({pendingCount})
            </button>
          )}
        </div>
      </div>

      {/* Visual List of Documents */}
      {docs.length === 0 ? (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-500">
          <FileCode2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="font-semibold text-slate-700 text-sm">No hay documentos adjuntos aún</p>
          <p className="text-xs text-slate-400 mt-0.5">Pulsa en "+ Añadir documento" para subir PDF o imágenes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5">
          {docs.map((doc) => {
            const estadoInfo = getEstadoAnalisisInfo(doc.estadoAnalisis);
            const isAnalyzing = analyzingIds.includes(doc.id) || doc.estadoAnalisis === 'analizando';

            return (
              <div
                key={doc.id}
                className="bg-white rounded-xl border border-slate-200/90 hover:border-blue-300 p-3.5 transition-all shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                {/* File info */}
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900 text-sm">{doc.nombreArchivo}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border flex items-center gap-1 ${estadoInfo.badgeStyle}`}>
                        <span>{estadoInfo.emoji}</span>
                        <span>{estadoInfo.label}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                      <span>Tipo: <strong className="text-slate-700">{doc.tipoIdentificadoNombre || getTipoDocumentoLabel(doc.tipoDocumento)}</strong></span>
                      <span>• Subido: {formatDate(doc.fechaSubida)}</span>
                      {doc.confirmadoUsuario && (
                        <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Confirmado
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                  {Boolean(doc.base64Data || (doc as any).url) && (
                    <button
                      type="button"
                      onClick={() => {
                        const fileSrc = doc.base64Data || (doc as any).url;
                        if (fileSrc) {
                          const w = window.open();
                          if (w) {
                            w.document.write(
                              `<html><head><title>${doc.nombreArchivo}</title><style>body{margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;height:100vh;}</style></head><body><iframe src="${fileSrc}" frameborder="0" style="width:100%;height:100%;border:none;"></iframe></body></html>`
                            );
                          }
                        }
                      }}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors border border-slate-200 flex items-center gap-1"
                      title="Ver archivo original"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span>Archivo</span>
                    </button>
                  )}

                  {doc.estadoAnalisis === 'analizado' && (
                    <button
                      onClick={() => setInspectDoc(doc)}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition-colors border border-indigo-200 flex items-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Ver Análisis
                    </button>
                  )}

                  {(doc.estadoAnalisis === 'pendiente' || doc.estadoAnalisis === 'error') && !isAnalyzing && (
                    <button
                      onClick={() => triggerAnalysisForDocs([doc], docs)}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors border border-blue-200 flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Analizar
                    </button>
                  )}

                  {isAnalyzing && (
                    <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 flex items-center gap-1 animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      Procesando...
                    </span>
                  )}

                  <button
                    onClick={() => handleDeleteDocument(doc.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Eliminar documento"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <DocumentUploadModal
          candidatoNombre={candidato.nombre}
          onClose={() => setShowUploadModal(false)}
          onUploadDocument={handleUploadDocument}
        />
      )}

      {/* Analysis Inspection Modal */}
      {inspectDoc && (
        <DocumentAnalysisModal
          documento={inspectDoc}
          candidato={candidato}
          onClose={() => setInspectDoc(null)}
          onConfirmDocumentData={handleConfirmDocumentData}
          onReanalyzeDoc={(docId, newTipo) => {
            const docToReanalyze = docs.find((d) => d.id === docId);
            if (docToReanalyze) {
              const updatedDoc = { ...docToReanalyze, tipoDocumento: newTipo || docToReanalyze.tipoDocumento };
              setInspectDoc(null);
              triggerAnalysisForDocs([updatedDoc], docs);
            }
          }}
        />
      )}
    </div>
  );
};
