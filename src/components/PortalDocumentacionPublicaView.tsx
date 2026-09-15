import React, { useState, useRef, useEffect } from 'react';
import {
  SolicitudDocumentacion,
  ItemDocumentoSolicitado,
  ArchivoAportado,
  DocItemEstado,
  SolicitudDocPublicData,
} from '../types';
import {
  FileCheck2,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileText,
  Trash2,
  Clock,
  AlertTriangle,
  Building,
  Calendar,
  Send,
  ShieldCheck,
  Check,
  Info,
  X,
  RotateCcw,
  CheckCheck,
} from 'lucide-react';
import { uploadDocumentoAportadoFile } from '../lib/firebase';

interface PortalDocumentacionPublicaViewProps {
  solicitud: SolicitudDocumentacion | SolicitudDocPublicData;
  onSubmit: (updatedDocs: ItemDocumentoSolicitado[], isFinalSubmit: boolean) => Promise<void>;
}

export const PortalDocumentacionPublicaView: React.FC<PortalDocumentacionPublicaViewProps> = ({
  solicitud,
  onSubmit,
}) => {
  const [documentos, setDocumentos] = useState<ItemDocumentoSolicitado[]>(solicitud.documentos || []);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedSuccess, setSubmittedSuccess] = useState<boolean>(
    solicitud.estado === 'COMPLETADA' || solicitud.estado === 'APROBADA'
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [showCloseNotice, setShowCloseNotice] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentUploadTargetItemId, setCurrentUploadTargetItemId] = useState<string | null>(null);

  // Sync state if parent solicitud updates while preserving newly uploaded local files during sync
  useEffect(() => {
    if (solicitud && solicitud.documentos) {
      setDocumentos((prevDocs) => {
        if (!prevDocs || prevDocs.length === 0) return solicitud.documentos;
        return solicitud.documentos.map((incoming) => {
          const localItem = prevDocs.find((p) => p.id === incoming.id);
          if (localItem && Array.isArray(localItem.archivos) && localItem.archivos.length > 0) {
            const incomingFilesCount = incoming.archivos?.length || 0;
            // If local state has more files uploaded that haven't propagated via snapshot yet, retain them
            if (incomingFilesCount < localItem.archivos.length) {
              return {
                ...incoming,
                estado: localItem.estado || 'subido',
                archivos: localItem.archivos,
                fechaSubida: localItem.fechaSubida || incoming.fechaSubida,
              };
            }
          }
          return incoming;
        });
      });
    }
  }, [solicitud]);

  // Status and counts
  const totalDocs = documentos.length;
  const obligatoriosDocs = documentos.filter((d) => d.obligatorio);
  const subidosObligatorios = obligatoriosDocs.filter((d) => d.archivos && d.archivos.length > 0).length;
  const totalSubidos = documentos.filter((d) => d.archivos && d.archivos.length > 0).length;
  const faltanObligatorios = obligatoriosDocs.length - subidosObligatorios;
  const progressPercent = totalDocs > 0 ? Math.round((totalSubidos / totalDocs) * 100) : 0;

  // Process file upload
  const handleFileSelected = async (itemId: string, file: File) => {
    setErrorMessage(null);
    const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    if (!validTypes.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png|webp)$/i)) {
      setErrorMessage('Por favor, selecciona un archivo válido: PDF, JPG o PNG.');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setErrorMessage('El tamaño máximo permitido es 25MB.');
      return;
    }

    setUploadingItemId(itemId);

    try {
      // Upload using resilient storage helper
      const solId = (solicitud as any).id || `sol-${solicitud.token}`;
      const uploadRes = await uploadDocumentoAportadoFile(solId, itemId, file, file.name);

      const nuevoArchivo: ArchivoAportado = {
        id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        nombreArchivo: file.name,
        mimeType: file.type || 'application/pdf',
        url: uploadRes.downloadURL,
        base64Data: uploadRes.base64Data,
        storagePath: uploadRes.storagePath,
        tamañoBytes: file.size,
        fechaSubida: new Date().toLocaleDateString('es-ES'),
      };

      const updatedDocs = documentos.map((doc) => {
        if (doc.id === itemId) {
          return {
            ...doc,
            estado: 'subido' as DocItemEstado,
            archivos: [...(doc.archivos || []), nuevoArchivo],
            motivoCorreccion: undefined, // Clear any previous correction request
            fechaSubida: new Date().toISOString(),
          };
        }
        return doc;
      });

      setDocumentos(updatedDocs);

      // Auto-save incremental progress to Firestore
      await onSubmit(updatedDocs, false);
    } catch (err) {
      console.error('Error uploading file:', err);
      setErrorMessage('Error al subir el archivo. Inténtalo de nuevo.');
    } finally {
      setUploadingItemId(null);
    }
  };

  // Delete an uploaded file from a doc item
  const handleDeleteFile = async (itemId: string, fileId: string) => {
    const updatedDocs = documentos.map((doc) => {
      if (doc.id === itemId) {
        const remaining = (doc.archivos || []).filter((f) => f.id !== fileId);
        return {
          ...doc,
          estado: (remaining.length > 0 ? 'subido' : 'pendiente') as DocItemEstado,
          archivos: remaining,
        };
      }
      return doc;
    });

    setDocumentos(updatedDocs);
    await onSubmit(updatedDocs, false);
  };

  // Final submit documentation
  const handleFinalSubmit = async () => {
    if (faltanObligatorios > 0) {
      const confirmSend = window.confirm(
        `Aún te faltan ${faltanObligatorios} documentos obligatorios por aportar. ¿Deseas enviar la documentación de forma parcial al propietario?`
      );
      if (!confirmSend) return;
    }

    setSubmitting(true);
    try {
      await onSubmit(documentos, true);
      setSubmittedSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Error final submitting docs:', err);
      setErrorMessage('Error al enviar la documentación. Por favor, vuelve a intentarlo.');
    } finally {
      setSubmitting(false);
    }
  };

  const primerNombre = (solicitud.candidatoNombre || 'Candidato/a').split(' ')[0];

  // ==========================================
  // PANTALLA COMPLETA DE ÉXITO TRAS EL ENVÍO
  // ==========================================
  if (submittedSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 text-slate-100 font-sans p-4 sm:p-6 md:p-8 antialiased flex flex-col justify-between items-center">
        <div className="max-w-2xl w-full mx-auto my-auto py-8 space-y-6">
          {/* Main Success Container */}
          <div className="bg-slate-900/90 backdrop-blur-xl border border-emerald-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-emerald-950/40 text-center space-y-6 relative overflow-hidden">
            {/* Ambient Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Checkmark Icon */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-tr from-emerald-600 to-emerald-400 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/30 ring-8 ring-emerald-500/10 animate-in zoom-in-50 duration-300">
              <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
            </div>

            {/* Title & Description */}
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                ¡Documentación Enviada Correctamente!
              </h1>
              <p className="text-slate-300 text-sm sm:text-base max-w-md mx-auto">
                El propietario y el equipo de gestión han recibido tus archivos y están revisando tu candidatura para el alquiler.
              </p>
            </div>

            {/* Summary Details Box */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 sm:p-5 text-left space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs text-slate-400 font-medium">Inmueble:</span>
                </div>
                <span className="text-xs font-bold text-white truncate max-w-[200px] sm:max-w-[280px]">
                  {solicitud.inmuebleNombre}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-slate-400 font-medium">Estado del envío:</span>
                </div>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  {faltanObligatorios === 0 ? 'Documentación Completa' : 'Parcialmente Aportada'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs text-slate-400 font-medium">Documentos aportados:</span>
                </div>
                <span className="text-xs font-bold text-white">
                  {totalSubidos} de {totalDocs} documentos
                </span>
              </div>

              {/* Subido breakdown */}
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {documentos.map((doc) => {
                  const hasFiles = doc.archivos && doc.archivos.length > 0;
                  return (
                    <div
                      key={doc.id}
                      className={`p-2 rounded-xl text-[11px] flex items-center justify-between border ${
                        hasFiles
                          ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <span className="font-medium truncate max-w-[170px]">{doc.nombre}</span>
                      {hasFiles ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-1 shrink-0">
                          <Check className="w-3 h-3" />
                          <span>{doc.archivos.length} {doc.archivos.length === 1 ? 'arch.' : 'archs.'}</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">No adjunto</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Informational Message */}
            <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-2xl p-3.5 text-xs text-indigo-200 flex items-start gap-2.5 text-left">
              <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-indigo-100 block mb-0.5">¿Qué ocurre a continuación?</span>
                <span>
                  El arrendador validará tu solvencia económica. Si todo es favorable, recibirás la confirmación para la formalización del contrato.
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3 justify-center">
              <button
                type="button"
                onClick={() => {
                  setShowCloseNotice(false);
                  setSubmittedSuccess(false);
                }}
                className="w-full sm:w-auto px-5 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs sm:text-sm border border-slate-700 transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4 text-indigo-400" />
                <span>Añadir o Modificar Documentos</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowCloseNotice(true);
                  try {
                    window.close();
                  } catch (e) {
                    // window.close may be blocked by browser sandbox
                  }
                }}
                className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs sm:text-sm shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Finalizar y Cerrar</span>
              </button>
            </div>

            {showCloseNotice && (
              <div className="bg-emerald-950/90 border border-emerald-500/50 p-3.5 rounded-xl text-xs text-emerald-200 animate-in fade-in">
                ✓ Todo guardado con éxito. Ya puedes cerrar esta pestaña de tu navegador de forma segura.
              </div>
            )}
          </div>

          <footer className="text-center text-xs text-slate-500 py-2 space-y-1">
            <p>© {new Date().getFullYear()} RentSelect · Portal de Documentación Seguro</p>
          </footer>
        </div>
      </div>
    );
  }

  // ==========================================
  // PANTALLA PRINCIPAL DE SUBIDA DE DOCUMENTOS
  // ==========================================
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 text-slate-100 font-sans p-3 sm:p-6 md:p-8 antialiased flex flex-col justify-between">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
        onChange={(e) => {
          if (e.target.files && e.target.files[0] && currentUploadTargetItemId) {
            handleFileSelected(currentUploadTargetItemId, e.target.files[0]);
            e.target.value = '';
          }
        }}
      />

      <div className="max-w-3xl w-full mx-auto space-y-6">
        {/* Header Branding */}
        <header className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <FileCheck2 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                  Portal de Documentación
                </h1>
                <p className="text-xs text-indigo-200">
                  Gestión y Acreditación para Alquiler
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold rounded-full">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Acceso Seguro y Privado
              </span>
            </div>
          </div>

          {/* Property & Candidate Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-700/70 text-xs">
            <div className="flex items-start gap-2.5 bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
              <Building className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-slate-400 font-medium">Inmueble</div>
                <div className="font-bold text-white text-sm">{solicitud.inmuebleNombre}</div>
                {solicitud.inmuebleCiudad && (
                  <div className="text-slate-400 text-[11px]">{solicitud.inmuebleCiudad}</div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2.5 bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
              <Calendar className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-slate-400 font-medium">Candidato / Visita</div>
                <div className="font-bold text-white text-sm">{primerNombre}</div>
                <div className="text-emerald-400 text-[11px] font-medium">
                  {solicitud.fechaVisita ? `Visita: ${solicitud.fechaVisita}` : 'Visita realizada'}
                </div>
              </div>
            </div>
          </div>

          {/* Owner message / instructions */}
          {solicitud.mensajePropietario && (
            <div className="bg-indigo-950/60 border border-indigo-500/30 rounded-xl p-3.5 text-xs text-indigo-100 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-indigo-300 block mb-0.5">Mensaje del Propietario:</span>
                <span>{solicitud.mensajePropietario}</span>
              </div>
            </div>
          )}
        </header>

        {/* ERROR NOTIFICATION */}
        {errorMessage && (
          <div className="bg-rose-500/20 border border-rose-500/40 text-rose-200 p-4 rounded-xl text-xs flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-300 hover:text-white font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* PROGRESS INDICATOR CARD */}
        <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 rounded-2xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Progreso de tu Documentación
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xl font-extrabold text-white">
                  {totalSubidos} de {totalDocs}
                </span>
                <span className="text-xs text-slate-400">documentos aportados</span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-2xl font-black text-indigo-400">{progressPercent}%</span>
              {faltanObligatorios > 0 ? (
                <div className="text-[11px] text-amber-300 font-medium">
                  Faltan {faltanObligatorios} obligatorios
                </div>
              ) : (
                <div className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  Obligatorios completos
                </div>
              )}
            </div>
          </div>

          <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-700/60">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                progressPercent === 100 ? 'bg-emerald-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* REQUESTED DOCUMENTS LIST */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <span>Documentos Solicitados ({totalDocs})</span>
          </h2>

          <div className="space-y-3">
            {documentos.map((doc, index) => {
              const hasFiles = doc.archivos && doc.archivos.length > 0;
              const isUploadingThis = uploadingItemId === doc.id;
              const isDraggingThis = activeDragId === doc.id;
              const isCorrection = doc.estado === 'requiere_correccion';
              const isValidated = doc.estado === 'validado';

              return (
                <div
                  key={doc.id}
                  className={`bg-slate-800/90 border rounded-2xl p-4 sm:p-5 transition-all shadow-md ${
                    isCorrection
                      ? 'border-amber-500/80 bg-amber-950/20'
                      : isValidated
                      ? 'border-emerald-500/60 bg-emerald-950/20'
                      : hasFiles
                      ? 'border-indigo-500/60 bg-slate-800/90'
                      : 'border-slate-700/80'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-5 h-5 rounded-md bg-slate-700 text-slate-300 text-xs font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                        <h3 className="font-bold text-white text-sm sm:text-base">{doc.nombre}</h3>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                            doc.obligatorio
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {doc.obligatorio ? 'Obligatorio' : 'Opcional'}
                        </span>
                        {doc.titular && doc.titular !== 'general' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                            {doc.titular === 'titular_1' ? 'Titular 1' : doc.titular === 'titular_2' ? 'Titular 2' : 'Avalista'}
                          </span>
                        )}
                      </div>

                      {doc.descripcion && (
                        <p className="text-xs text-slate-400 pl-7">{doc.descripcion}</p>
                      )}

                      {/* Item state indicator */}
                      <div className="pl-7 pt-1.5">
                        {isValidated && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-0.5 rounded-md">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Validado por el propietario
                          </span>
                        )}
                        {isCorrection && (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-300 bg-amber-950/80 border border-amber-500/40 px-2.5 py-0.5 rounded-md">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                              El propietario solicita corregir o reemplazar este documento
                            </span>
                            {doc.motivoCorreccion && (
                              <p className="text-xs text-amber-200 italic bg-amber-900/40 p-2.5 rounded-lg border border-amber-500/30">
                                Motivo: "{doc.motivoCorreccion}"
                              </p>
                            )}
                          </div>
                        )}
                        {!isValidated && !isCorrection && hasFiles && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-300 bg-indigo-950/60 border border-indigo-500/30 px-2.5 py-0.5 rounded-md">
                            <Check className="w-3.5 h-3.5 text-indigo-400" />
                            Documento subido correctamente
                          </span>
                        )}
                        {!hasFiles && !isCorrection && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-900/60 px-2.5 py-0.5 rounded-md border border-slate-700/50">
                            <Clock className="w-3.5 h-3.5" />
                            Pendiente de subir
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Upload trigger button */}
                    <div className="shrink-0 pl-7 sm:pl-0">
                      <button
                        type="button"
                        disabled={isUploadingThis}
                        onClick={() => {
                          setCurrentUploadTargetItemId(doc.id);
                          fileInputRef.current?.click();
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md ${
                          hasFiles
                            ? 'bg-slate-700 hover:bg-slate-600 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                        }`}
                      >
                        {isUploadingThis ? (
                          <span>Subiendo archivo...</span>
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            <span>{hasFiles ? 'Añadir / Reemplazar' : 'Subir Documento'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Drag and Drop Zone if empty */}
                  {!hasFiles && (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setActiveDragId(doc.id);
                      }}
                      onDragLeave={() => setActiveDragId(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setActiveDragId(null);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handleFileSelected(doc.id, e.dataTransfer.files[0]);
                        }
                      }}
                      onClick={() => {
                        setCurrentUploadTargetItemId(doc.id);
                        fileInputRef.current?.click();
                      }}
                      className={`mt-3 ml-7 p-4 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all ${
                        isDraggingThis
                          ? 'border-indigo-400 bg-indigo-950/40 text-indigo-200'
                          : 'border-slate-700 hover:border-slate-500 bg-slate-900/30 text-slate-400'
                      }`}
                    >
                      <p className="text-xs font-medium">
                        Arrastra y suelta tu archivo aquí (PDF, JPG, PNG) o haz clic para seleccionarlo
                      </p>
                    </div>
                  )}

                  {/* Uploaded Files Chips */}
                  {hasFiles && (
                    <div className="mt-3 ml-7 pt-3 border-t border-slate-700/60 space-y-2">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        Archivos subidos ({doc.archivos.length}):
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {doc.archivos.map((file) => (
                          <div
                            key={file.id}
                            className="bg-slate-900/70 border border-slate-700 p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                              <div className="min-w-0">
                                <span className="font-semibold text-white truncate block" title={file.nombreArchivo}>
                                  {file.nombreArchivo}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {file.fechaSubida} {file.tamañoBytes ? `· ${(file.tamañoBytes / 1024).toFixed(0)} KB` : ''}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteFile(doc.id, file.id)}
                              title="Eliminar archivo"
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="bg-slate-800/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-5 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-4 z-20">
          <div>
            <div className="text-xs text-slate-200 font-bold flex items-center gap-1.5">
              {totalSubidos > 0 ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>
                    Has aportado <strong>{totalSubidos} de {totalDocs}</strong> documentos solicitados.
                  </span>
                </>
              ) : (
                <span>Sube los documentos solicitados arriba antes de enviar.</span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Al enviar, el propietario recibirá tu documentación y se te mostrará la confirmación de entrega.
            </div>
          </div>

          <button
            type="button"
            disabled={submitting || totalSubidos === 0}
            onClick={handleFinalSubmit}
            className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-40 text-white font-extrabold rounded-xl text-sm shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Enviando al propietario...
              </span>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Confirmar y Enviar Documentación</span>
              </>
            )}
          </button>
        </div>

        {/* FOOTER */}
        <footer className="text-center text-xs text-slate-500 py-4 space-y-1.5">
          <p>© {new Date().getFullYear()} RentSelect · Portal de Documentación Seguro para Alquiler</p>
          <p className="text-[11px] text-slate-400">
            Tus datos se transmiten mediante conexión cifrada y privada.
          </p>
        </footer>
      </div>
    </div>
  );
};
