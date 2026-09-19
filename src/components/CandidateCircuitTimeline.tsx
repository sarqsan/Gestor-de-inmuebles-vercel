import React, { useState } from 'react';
import {
  Candidato,
  Inmueble,
  SolicitudDocumentacion,
  SolicitudSeguroImpago,
  CandidateStatus,
} from '../types';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldCheck,
  FileCheck2,
  FileText,
  UserCheck,
  Star,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  XCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  History,
  Send,
  Building,
  User,
  Scale,
} from 'lucide-react';
import { getCandidateStatusLabel, getCandidateStatusBadgeStyle, formatEuro } from '../utils/formatters';

interface CandidateCircuitTimelineProps {
  candidato: Candidato;
  property?: Inmueble;
  solicitudDoc?: SolicitudDocumentacion;
  solicitudSeguro?: SolicitudSeguroImpago;
  onSelectCandidate?: (candidato: Candidato, motivo?: string) => void;
  onOpenSolicitudDoc?: (solicitud: SolicitudDocumentacion) => void;
  onCrearSolicitudDoc?: (candidato: Candidato) => void;
  onOpenTramitarSeguro?: (candidato: Candidato) => void;
  onOpenDetalleSeguro?: (solicitud: SolicitudSeguroImpago) => void;
  onRegistrarDecisionFinal?: (
    candidato: Candidato,
    decision: 'ACEPTAR' | 'RECHAZAR',
    motivo: string
  ) => void;
}

export const CandidateCircuitTimeline: React.FC<CandidateCircuitTimelineProps> = ({
  candidato,
  property,
  solicitudDoc,
  solicitudSeguro,
  onSelectCandidate,
  onOpenSolicitudDoc,
  onCrearSolicitudDoc,
  onOpenTramitarSeguro,
  onOpenDetalleSeguro,
  onRegistrarDecisionFinal,
}) => {
  const [showHistory, setShowHistory] = useState(false);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [decisionType, setDecisionType] = useState<'ACEPTAR' | 'RECHAZAR'>('ACEPTAR');
  const [decisionMotivo, setDecisionMotivo] = useState('');
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [selectionMotivo, setSelectionMotivo] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Status flags
  const isPreselected =
    candidato.estado === 'preseleccionado' ||
    candidato.estado === 'visita_reservada' ||
    candidato.fechaPreseleccion ||
    candidato.estado === 'seleccionado';

  const isSelected =
    candidato.estado === 'seleccionado' ||
    candidato.fechaSeleccion ||
    candidato.estado === 'seguro_solicitado' ||
    candidato.estado === 'aprobado_seguro' ||
    candidato.estado === 'rechazado_seguro' ||
    candidato.estado === 'decision_pendiente' ||
    candidato.estado === 'aceptado_final' ||
    candidato.estado === 'formalizado';

  const docState =
    solicitudDoc?.estado ||
    (candidato.estadoDocumentacion === 'completa'
      ? 'COMPLETADA'
      : candidato.estadoDocumentacion === 'parcial'
      ? 'PARCIALMENTE_APORTADA'
      : candidato.estadoDocumentacion === 'solicitada'
      ? 'SOLICITADA'
      : 'SIN_SOLICITAR');

  const hasDocs =
    (solicitudDoc && solicitudDoc.documentos.some((d) => d.archivos && d.archivos.length > 0)) ||
    (candidato.documentosAnalizados && candidato.documentosAnalizados.length > 0);

  const hasInsurance = !!solicitudSeguro || !!candidato.solicitudSeguroId;
  const insuranceDictamen =
    solicitudSeguro?.dictamenAseguradora || candidato.seguroDictamen || (hasInsurance ? 'EN_ESTUDIO' : undefined);

  const hasFinalDecision =
    candidato.decisionFinal ||
    candidato.estado === 'aceptado_final' ||
    candidato.estado === 'rechazado_final' ||
    candidato.estado === 'formalizado';

  // Steps definition
  const steps = [
    {
      id: 'preseleccion',
      num: 1,
      titulo: 'Preselección',
      subtitulo: isPreselected ? 'Para visita' : 'Pendiente',
      activo: isPreselected,
      completado: isPreselected,
    },
    {
      id: 'seleccion',
      num: 2,
      titulo: 'Selección',
      subtitulo: isSelected ? 'Inquilino preferente' : 'Pendiente selección',
      activo: isSelected,
      completado: isSelected,
    },
    {
      id: 'documentacion',
      num: 3,
      titulo: 'Documentación',
      subtitulo:
        docState === 'COMPLETADA' || docState === 'APROBADA'
          ? 'Recibida ✓'
          : docState === 'PARCIALMENTE_APORTADA'
          ? 'Parcial'
          : docState === 'SOLICITADA'
          ? 'Solicitada'
          : 'Sin solicitar',
      activo: isSelected,
      completado: docState === 'COMPLETADA' || docState === 'APROBADA',
    },
    {
      id: 'analisis_ia',
      num: 4,
      titulo: 'Análisis IA',
      subtitulo: candidato.clasificacionDocumental || (hasDocs ? 'Consultivo' : 'Esperando doc'),
      activo: hasDocs,
      completado: !!candidato.clasificacionDocumental || candidato.estado === 'analizado',
    },
    {
      id: 'seguro',
      num: 5,
      titulo: 'Seguro de Impago',
      subtitulo:
        insuranceDictamen === 'FAVORABLE'
          ? 'Favorable 🟢'
          : insuranceDictamen === 'DESFAVORABLE'
          ? 'Desfavorable 🔴'
          : insuranceDictamen === 'DOCUMENTACION_REQUERIDA'
          ? 'Doc Extra ⚠️'
          : hasInsurance
          ? 'En Estudio'
          : 'Por tramitar',
      activo: hasInsurance,
      completado: insuranceDictamen === 'FAVORABLE' || insuranceDictamen === 'FAVORABLE_CONDICIONADO',
    },
    {
      id: 'decision_final',
      num: 6,
      titulo: 'Decisión Final',
      subtitulo:
        candidato.decisionFinal === 'ACEPTAR' || candidato.estado === 'aceptado_final'
          ? 'Aceptado ✅'
          : candidato.decisionFinal === 'RECHAZAR' || candidato.estado === 'rechazado_final'
          ? 'Rechazado ❌'
          : 'Pendiente Propietario',
      activo: hasFinalDecision || insuranceDictamen !== undefined,
      completado: hasFinalDecision,
    },
  ];

  const handleCopyPublicDocLink = () => {
    if (!solicitudDoc?.token) return;
    const url = `${window.location.origin}/#documentacion/${solicitudDoc.token}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleConfirmSelection = () => {
    if (onSelectCandidate) {
      onSelectCandidate(candidato, selectionMotivo.trim() || undefined);
    }
    setShowSelectionModal(false);
    setSelectionMotivo('');
  };

  const handleConfirmDecision = () => {
    if (!decisionMotivo.trim()) return;
    if (onRegistrarDecisionFinal) {
      onRegistrarDecisionFinal(candidato, decisionType, decisionMotivo.trim());
    }
    setShowDecisionModal(false);
    setDecisionMotivo('');
  };

  const historialItems = candidato.historial || [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Top Circuit Header */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 text-[10px] font-bold tracking-wider uppercase">
              Circuito Completo de Admisión
            </span>
            <span className="text-xs text-slate-300">|</span>
            <span className="text-xs text-slate-300">
              Inmueble: <strong className="text-white">{candidato.inmuebleNombre || property?.direccion}</strong>
            </span>
          </div>
          <h3 className="text-base sm:text-lg font-bold text-white mt-1 flex items-center gap-2">
            <span>Trazabilidad del Candidato</span>
            <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${getCandidateStatusBadgeStyle(candidato.estado)}`}>
              {getCandidateStatusLabel(candidato.estado)}
            </span>
          </h3>
        </div>

        {/* Action button trigger for decision */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isSelected && onSelectCandidate && (
            <button
              onClick={() => setShowSelectionModal(true)}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-900/30 flex items-center gap-1.5"
            >
              <UserCheck className="w-4 h-4" />
              <span>Seleccionar Candidato</span>
            </button>
          )}

          {isSelected && !hasInsurance && onOpenTramitarSeguro && (
            <button
              onClick={() => onOpenTramitarSeguro(candidato)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-900/30 flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Tramitar Seguro de Impago</span>
            </button>
          )}

          {isSelected && onRegistrarDecisionFinal && (
            <button
              onClick={() => setShowDecisionModal(true)}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md shadow-amber-900/30 flex items-center gap-1.5"
            >
              <Scale className="w-4 h-4" />
              <span>Registrar Decisión Final</span>
            </button>
          )}

          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1"
          >
            <History className="w-3.5 h-3.5 text-indigo-300" />
            <span>Auditoría ({historialItems.length})</span>
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Visual Pipeline Bar */}
      <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {steps.map((st) => {
            const isCurrent =
              (st.id === 'preseleccion' && candidato.estado === 'preseleccionado') ||
              (st.id === 'seleccion' && candidato.estado === 'seleccionado') ||
              (st.id === 'documentacion' && (candidato.estado === 'doc_solicitada' || candidato.estado === 'pendiente_doc' || candidato.estado === 'doc_recibida')) ||
              (st.id === 'analisis_ia' && (candidato.estado === 'pendiente_analisis' || candidato.estado === 'analizado')) ||
              (st.id === 'seguro' && (candidato.estado === 'seguro_solicitado' || candidato.estado === 'aprobado_seguro' || candidato.estado === 'rechazado_seguro')) ||
              (st.id === 'decision_final' && (candidato.estado === 'decision_pendiente' || candidato.estado === 'aceptado_final' || candidato.estado === 'rechazado_final'));

            return (
              <div
                key={st.id}
                className={`p-2.5 rounded-xl border transition-all ${
                  isCurrent
                    ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs'
                    : st.completado
                    ? 'bg-emerald-50/70 border-emerald-200'
                    : st.activo
                    ? 'bg-white border-slate-200'
                    : 'bg-slate-100/60 border-slate-200/60 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      st.completado
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {st.completado ? '✓' : st.num}
                  </span>
                  {isCurrent && (
                    <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                  )}
                </div>
                <p className="text-xs font-bold text-slate-800 truncate">{st.titulo}</p>
                <p className="text-[11px] text-slate-500 truncate">{st.subtitulo}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content Summary: Current Stage Details */}
      <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Estado Documental */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <FileCheck2 className="w-3.5 h-3.5 text-blue-600" />
              Documentación
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                docState === 'COMPLETADA' || docState === 'APROBADA'
                  ? 'bg-emerald-100 text-emerald-800'
                  : docState === 'PARCIALMENTE_APORTADA'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {docState}
            </span>
          </div>

          {solicitudDoc ? (
            <div className="text-xs space-y-1.5 text-slate-600">
              <p>
                Archivos:{' '}
                <strong className="text-slate-800">
                  {solicitudDoc.documentos.filter((d) => d.archivos && d.archivos.length > 0).length} /{' '}
                  {solicitudDoc.documentos.length}
                </strong>{' '}
                requisitos
              </p>
              <div className="flex items-center gap-1.5 pt-1">
                {onOpenSolicitudDoc && (
                  <button
                    onClick={() => onOpenSolicitudDoc(solicitudDoc)}
                    className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Revisar Expediente
                  </button>
                )}
                <button
                  onClick={handleCopyPublicDocLink}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs flex items-center gap-1"
                  title="Copiar enlace público de subida"
                >
                  {copiedLink ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedLink ? 'Copiado' : 'Enlace'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 py-1">
              <p>No se ha emitido solicitud formal todavía.</p>
              {onCrearSolicitudDoc && isSelected && (
                <button
                  onClick={() => onCrearSolicitudDoc(candidato)}
                  className="mt-2 px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
                >
                  Preparar Solicitud Documental
                </button>
              )}
            </div>
          )}
        </div>

        {/* Card 2: Análisis Solvencia IA (Consultivo) */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Análisis Solvencia IA
            </span>
            <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-bold">
              Consultivo
            </span>
          </div>

          <div className="text-xs space-y-1 text-slate-600">
            <p>
              Ingresos declarados: <strong className="text-slate-800">{formatEuro(candidato.ingresosNetos)}/mes</strong>
            </p>
            {candidato.cotitular && (
              <p>
                Cotitular: <strong className="text-slate-800">+{formatEuro(candidato.cotitular.ingresosNetos || 0)}/mes</strong>
              </p>
            )}
            <p>
              Renta estimada: <strong className="text-slate-800">{formatEuro(property?.precio || 1000)}/mes</strong>
            </p>
            <div className="pt-1 text-[11px] text-slate-500 italic">
              {candidato.clasificacionDocumentalMotivo ||
                'La IA asiste al propietario contrastando datos, pero la decisión de admisión corresponde al usuario.'}
            </div>
          </div>
        </div>

        {/* Card 3: Seguro de Impago y Decisión Propietario */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Seguro & Decisión
            </span>
            {insuranceDictamen && (
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-black ${
                  insuranceDictamen === 'FAVORABLE'
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : insuranceDictamen === 'DESFAVORABLE'
                    ? 'bg-rose-100 text-rose-900 border border-rose-300'
                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}
              >
                {insuranceDictamen}
              </span>
            )}
          </div>

          <div className="text-xs space-y-1.5 text-slate-600">
            {solicitudSeguro ? (
              <>
                <p>
                  Aseguradora: <strong className="text-slate-800">{solicitudSeguro.aseguradoraNombre}</strong>
                </p>
                <p>
                  Ref: <span className="font-mono text-slate-700">{solicitudSeguro.referenciaUnica}</span>
                </p>
                {onOpenDetalleSeguro && (
                  <button
                    onClick={() => onOpenDetalleSeguro(solicitudSeguro)}
                    className="px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Ver Expediente Seguro
                  </button>
                )}
              </>
            ) : (
              <p className="text-slate-500 py-1">Sin expediente de seguro activo todavía.</p>
            )}

            {/* Decisión final del propietario */}
            {candidato.decisionFinal && (
              <div className="mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="font-bold text-slate-700">Decisión Humana Registrada: </span>
                <span
                  className={
                    candidato.decisionFinal === 'ACEPTAR'
                      ? 'text-emerald-700 font-bold'
                      : 'text-rose-700 font-bold'
                  }
                >
                  {candidato.decisionFinal === 'ACEPTAR' ? 'ACEPTADO' : 'NO SELECCIONADO'}
                </span>
                {candidato.decisionFinalMotivo && (
                  <p className="text-slate-500 truncate">"{candidato.decisionFinalMotivo}"</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expandable Chronological Audit Trail */}
      {showHistory && (
        <div className="p-4 sm:p-5 bg-slate-900 text-slate-200 border-t border-slate-800 animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
              <History className="w-4 h-4" />
              Historial Cronológico de Cambios y Trazabilidad (Inmutable)
            </h4>
            <span className="text-xs text-slate-400">{historialItems.length} registros</span>
          </div>

          {historialItems.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">
              No hay eventos registrados aún. Las acciones del propietario, candidato, IA y aseguradora quedarán registradas aquí.
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {[...historialItems].reverse().map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          item.autor === 'propietario'
                            ? 'bg-blue-900/60 text-blue-300 border border-blue-700'
                            : item.autor === 'candidato'
                            ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700'
                            : item.autor === 'sistema_ia'
                            ? 'bg-purple-900/60 text-purple-300 border border-purple-700'
                            : 'bg-amber-900/60 text-amber-300 border border-amber-700'
                        }`}
                      >
                        {item.autorNombre || item.autor}
                      </span>
                      <strong className="text-slate-100">{item.accion}</strong>
                      <span className="text-[10px] text-slate-400">({item.fase})</span>
                    </div>
                    {item.detalle && <p className="text-slate-300 text-[11px] pl-1">{item.detalle}</p>}
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0 font-mono self-end sm:self-center">
                    {item.fecha}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Confirm Selection */}
      {showSelectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <UserCheck className="w-5 h-5" />
              <h4 className="font-bold text-base">Seleccionar como Inquilino Preferente</h4>
            </div>
            <p className="text-xs text-slate-600">
              Al seleccionar a <strong>{candidato.nombre}</strong>, se preparará automáticamente la solicitud de documentación adaptada a su perfil ({candidato.tipoEmpleo}) y se registrará en el historial inmutable.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Motivo u observaciones de la selección (opcional):
              </label>
              <textarea
                value={selectionMotivo}
                onChange={(e) => setSelectionMotivo(e.target.value)}
                placeholder="Ej. Solvencia alta, documentación inicial aportada correctamente, perfil idóneo."
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none"
                rows={3}
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSelectionModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmSelection}
                className="px-4 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs"
              >
                Confirmar Selección
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Decisión Final del Propietario (Humano) */}
      {showDecisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <Scale className="w-5 h-5 text-indigo-600" />
              <h4 className="font-bold text-base">Registrar Decisión Final del Propietario</h4>
            </div>
            <p className="text-xs text-slate-600">
              Esta es una <strong>decisión humana vinculante</strong>. La IA no formaliza ni descarta automáticamente a los candidatos. Los candidatos no seleccionados permanecerán en la base de datos para auditoría.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDecisionType('ACEPTAR')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                  decisionType === 'ACEPTAR'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Aceptar Definitivo</span>
              </button>
              <button
                type="button"
                onClick={() => setDecisionType('RECHAZAR')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                  decisionType === 'RECHAZAR'
                    ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <XCircle className="w-5 h-5 text-rose-600" />
                <span>No Seleccionar</span>
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Motivo justificado de la decisión <span className="text-rose-500">*</span>:
              </label>
              <textarea
                value={decisionMotivo}
                onChange={(e) => setDecisionMotivo(e.target.value)}
                placeholder={
                  decisionType === 'ACEPTAR'
                    ? 'Ej. Expediente validado por aseguradora, garantías aprobadas, se procede a formalizar contrato.'
                    : 'Ej. No supera ratio de esfuerzo máximo requerido / Documentación no acreditada / Elegido otro candidato preferente.'
                }
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                rows={3}
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDecisionModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDecision}
                disabled={!decisionMotivo.trim()}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg shadow-xs transition-all ${
                  !decisionMotivo.trim()
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : decisionType === 'ACEPTAR'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-rose-600 hover:bg-rose-700 text-white'
                }`}
              >
                Registrar Decisión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
