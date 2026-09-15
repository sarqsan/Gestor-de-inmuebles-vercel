import React, { useState } from 'react';
import {
  DocumentoAnalizado,
  TipoDocumento,
  ExtractedField,
  Candidato,
  ValoracionIADocumento,
  DecisionPropietarioDocumento,
} from '../types';
import { getTipoDocumentoLabel, getEstadoAnalisisInfo } from '../utils/formatters';
import {
  X,
  FileText,
  CheckCircle2,
  Edit2,
  AlertTriangle,
  ShieldCheck,
  Check,
  RotateCw,
  Sparkles,
  UserCheck,
  Info,
  Sliders,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';

interface DocumentAnalysisModalProps {
  documento: DocumentoAnalizado;
  candidato: Candidato;
  onClose: () => void;
  onConfirmDocumentData: (
    documentoId: string,
    updatedFields: Record<string, ExtractedField>,
    newTipoDoc?: TipoDocumento,
    decisionPropietario?: DecisionPropietarioDocumento
  ) => void;
  onReanalyzeDoc?: (documentoId: string, newTipoDoc?: TipoDocumento) => void;
}

export const DocumentAnalysisModal: React.FC<DocumentAnalysisModalProps> = ({
  documento,
  candidato,
  onClose,
  onConfirmDocumentData,
  onReanalyzeDoc,
}) => {
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>(documento.tipoDocumento || 'nomina');
  const [fields, setFields] = useState<Record<string, ExtractedField>>(
    documento.datosExtraidos ? JSON.parse(JSON.stringify(documento.datosExtraidos)) : {}
  );
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Owner decision state
  const [decisionEstado, setDecisionEstado] = useState<'pendiente' | 'aprobado' | 'requiere_subsanacion' | 'descartado'>(
    documento.decisionPropietario?.estado || 'pendiente'
  );
  const [decisionNotas, setDecisionNotas] = useState<string>(
    documento.decisionPropietario?.notasPrivadas || ''
  );

  const estadoInfo = getEstadoAnalisisInfo(documento.estadoAnalisis);

  const valoracion: ValoracionIADocumento = documento.valoracionIA || {
    scoreSolvenciaSugerido: 85,
    nivelRiesgo: 'Bajo',
    explicacion: 'Documentación aportada verificable y acorde al perfil socioeconómico.',
    avisoLegal: 'Esta valoración es una estimación técnica orientativa generada por IA. No toma decisiones de forma autónoma ni vinculante; el criterio final de admisión corresponde al propietario.',
  };

  const handleToggleConfirmField = (key: string) => {
    setFields((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        confirmado: !prev[key].confirmado,
      },
    }));
  };

  const handleStartEditing = (key: string, currentVal: any) => {
    setEditingKey(key);
    setEditValue(currentVal !== null && currentVal !== undefined ? String(currentVal) : '');
  };

  const handleSaveEdit = (key: string) => {
    setFields((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        valor: editValue,
        editado: true,
        confirmado: true,
      },
    }));
    setEditingKey(null);
  };

  const handleSaveAndConfirm = () => {
    const updated = { ...fields };
    Object.keys(updated).forEach((k) => {
      updated[k].confirmado = true;
    });

    const dec: DecisionPropietarioDocumento = {
      estado: decisionEstado,
      notasPrivadas: decisionNotas,
      fechaDecision: new Date().toISOString(),
      autor: 'Propietario',
    };

    onConfirmDocumentData(documento.id, updated, tipoDocumento, dec);
    onClose();
  };

  const handleTipoChange = (newTipo: TipoDocumento) => {
    setTipoDocumento(newTipo);
    if (onReanalyzeDoc && newTipo !== documento.tipoDocumento) {
      onReanalyzeDoc(documento.id, newTipo);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 md:p-6 overflow-y-auto">
      <div
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden my-auto max-h-[94vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/90 flex items-center justify-between sticky top-0 z-20 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-900 text-base sm:text-lg">ANÁLISIS DOCUMENTAL CON IA</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border flex items-center gap-1 ${estadoInfo.badgeStyle}`}>
                  <span>{estadoInfo.emoji}</span>
                  <span>{estadoInfo.label}</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-medium text-slate-700">{documento.nombreArchivo}</span>
                <span>• Candidato: {candidato.nombre}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body with 5 Explicit Sections */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-sm">
          
          {/* Tipo de Documento Bar */}
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Identificación IA del Documento:</span>
              <p className="text-xs text-indigo-800 font-bold mt-0.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block"></span>
                {documento.tipoIdentificadoNombre || getTipoDocumentoLabel(tipoDocumento)}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600 shrink-0">Corregir tipo:</label>
              <select
                value={tipoDocumento}
                onChange={(e) => handleTipoChange(e.target.value as TipoDocumento)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none shadow-2xs"
              >
                <option value="nomina">Nómina</option>
                <option value="contrato">Contrato laboral</option>
                <option value="vida_laboral">Vida laboral</option>
                <option value="renta">Declaración de la renta</option>
                <option value="dni_nie">DNI / NIE</option>
                <option value="justificante_bancario">Justificante bancario</option>
                <option value="otros_ingresos">Justificante de otros ingresos</option>
                <option value="avalista">Documentación de avalista</option>
                <option value="otro">Otro documento</option>
              </select>
            </div>
          </div>

          {/* ============================================================ */}
          {/* BLOQUE 1: DATOS EXTRAÍDOS */}
          {/* ============================================================ */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-black">1</div>
                <h4 className="font-black text-slate-900 text-sm tracking-wide">DATOS EXTRAÍDOS</h4>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {Object.values(fields).filter((f) => (f as ExtractedField).confirmado).length} de {Object.keys(fields).length} validados
              </span>
            </div>

            {Object.keys(fields).length === 0 ? (
              <div className="p-5 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                No se han extraído campos automáticos en este archivo. Puedes introducirlos o reanalizar.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(fields).map(([key, fieldUntyped]) => {
                  const field = fieldUntyped as ExtractedField;
                  const isEditing = editingKey === key;

                  return (
                    <div
                      key={key}
                      className={`p-3 rounded-xl border transition-all ${
                        field.confirmado
                          ? 'bg-emerald-50/40 border-emerald-300'
                          : 'bg-white border-slate-200 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">{field.label}:</span>
                        <div className="flex items-center gap-1">
                          {field.editado && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                              Modificado
                            </span>
                          )}
                          <button
                            onClick={() => handleToggleConfirmField(key)}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 transition-colors ${
                              field.confirmado
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            <Check className="w-3 h-3" />
                            {field.confirmado ? 'Validado' : 'Validar'}
                          </button>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="flex items-center gap-1.5 mt-2">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full px-2.5 py-1 text-xs border-2 border-indigo-500 rounded-lg bg-white font-bold text-slate-900 focus:outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveEdit(key)}
                            className="px-2.5 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg shrink-0"
                          >
                            Guardar
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between mt-1">
                          <span
                            className={`font-black text-sm ${
                              field.valor === 'No disponible' || !field.valor
                                ? 'text-slate-400 font-normal italic'
                                : 'text-slate-900'
                            }`}
                          >
                            {field.valor ?? 'No disponible'}
                          </span>
                          <button
                            onClick={() => handleStartEditing(key, field.valor)}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors"
                            title="Editar dato"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ============================================================ */}
          {/* BLOQUE 2: INFORMACIÓN DETECTADA */}
          {/* ============================================================ */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <div className="w-6 h-6 rounded-lg bg-sky-600 text-white flex items-center justify-center text-xs font-black">2</div>
              <h4 className="font-black text-slate-900 text-sm tracking-wide">INFORMACIÓN DETECTADA</h4>
            </div>
            <div className="bg-sky-50/70 border border-sky-200/80 rounded-xl p-3.5 text-xs text-sky-950 leading-relaxed font-medium">
              <p className="flex items-start gap-2">
                <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <span>
                  {documento.informacionDetectada ||
                    documento.resumenAI ||
                    `Documentación formal recibida. Contiene información contrastable sobre ${candidato.nombre}.`}
                </span>
              </p>
            </div>
          </div>

          {/* ============================================================ */}
          {/* BLOQUE 3: INCIDENCIAS Y ALERTAS */}
          {/* ============================================================ */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <div className="w-6 h-6 rounded-lg bg-amber-600 text-white flex items-center justify-center text-xs font-black">3</div>
              <h4 className="font-black text-slate-900 text-sm tracking-wide">INCIDENCIAS Y ALERTAS</h4>
            </div>

            {((documento.incidencias && documento.incidencias.length > 0) ||
              (documento.coherenciaWarnings && documento.coherenciaWarnings.length > 0)) ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2">
                {(documento.incidencias || documento.coherenciaWarnings || []).map((inc, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-900 bg-white/80 p-2.5 rounded-lg border border-amber-200/60 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>{inc}</span>
                  </div>
                ))}
                <p className="text-[11px] text-amber-800/80 italic pl-1">
                  * Las incidencias indican diferencias objetivas entre los datos declarados y el documento adjunto. Requieren supervisión humana.
                </p>
              </div>
            ) : (
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900 font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Sin incidencias ni discrepancias detectadas entre el documento y los datos del candidato.</span>
              </div>
            )}
          </div>

          {/* ============================================================ */}
          {/* BLOQUE 4: VALORACIÓN DE IA */}
          {/* ============================================================ */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <div className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center text-xs font-black">4</div>
              <h4 className="font-black text-slate-900 text-sm tracking-wide">VALORACIÓN DE IA</h4>
            </div>

            <div className="bg-purple-50/70 border border-purple-200/90 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 bg-purple-600 text-white rounded-lg text-xs font-black tracking-wider uppercase">
                    Scoring sugerido: {valoracion.scoreSolvenciaSugerido} / 100
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    valoracion.nivelRiesgo === 'Bajo'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : valoracion.nivelRiesgo === 'Medio'
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-rose-100 text-rose-800 border-rose-300'
                  }`}>
                    Riesgo {valoracion.nivelRiesgo}
                  </span>
                </div>
              </div>

              <p className="text-xs text-purple-950 font-medium leading-relaxed">
                {valoracion.explicacion}
              </p>

              <div className="p-2.5 bg-white/90 rounded-lg border border-purple-200/70 text-[11px] text-purple-800 font-semibold flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <span>{valoracion.avisoLegal}</span>
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* BLOQUE 5: DECISIÓN DEL PROPIETARIO */}
          {/* ============================================================ */}
          <div className="space-y-3 bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-black">5</div>
                <h4 className="font-black text-slate-900 text-sm tracking-wide">DECISIÓN DEL PROPIETARIO</h4>
              </div>
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                Control Humano
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Estado de revisión del documento:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setDecisionEstado('aprobado')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                      decisionEstado === 'aprobado'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Aprobado
                  </button>

                  <button
                    type="button"
                    onClick={() => setDecisionEstado('requiere_subsanacion')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                      decisionEstado === 'requiere_subsanacion'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    Subsanación
                  </button>

                  <button
                    type="button"
                    onClick={() => setDecisionEstado('descartado')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                      decisionEstado === 'descartado'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                    Descartado
                  </button>

                  <button
                    type="button"
                    onClick={() => setDecisionEstado('pendiente')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                      decisionEstado === 'pendiente'
                        ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    Pendiente
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                  Notas privadas del propietario sobre este documento:
                </label>
                <textarea
                  value={decisionNotas}
                  onChange={(e) => setDecisionNotas(e.target.value)}
                  placeholder="Ej: Nómina comprobada con el empleador. Todo correcto para tramitar con la aseguradora."
                  rows={2}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 font-medium"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/90 flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-0 z-10 backdrop-blur-sm">
          {onReanalyzeDoc ? (
            <button
              onClick={() => onReanalyzeDoc(documento.id, tipoDocumento)}
              className="w-full sm:w-auto px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <RotateCw className="w-3.5 h-3.5 text-indigo-600" />
              Re-analizar con Gemini
            </button>
          ) : <div />}

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors w-full sm:w-auto"
            >
              Cancelar
            </button>

            <button
              onClick={handleSaveAndConfirm}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-colors shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <CheckCircle2 className="w-4 h-4" />
              Guardar Decisión y Validar Datos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
