import React, { useState } from 'react';
import { Candidato, Inmueble, InformeInteligente } from '../types';
import { formatEuro } from '../utils/formatters';
import {
  X,
  Sparkles,
  RefreshCw,
  FileText,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  TrendingUp,
  Briefcase,
  Layers,
  Award,
  History,
  Info,
  ChevronRight,
  ShieldCheck,
  Building,
  DollarSign,
  AlertCircle,
} from 'lucide-react';

interface SmartReportModalProps {
  candidato: Candidato;
  inmueble?: Inmueble;
  report: InformeInteligente;
  historyReports?: InformeInteligente[];
  onClose: () => void;
  onRegenerateReport: () => void;
  onSelectHistoryReport?: (rep: InformeInteligente) => void;
  onOpenSolvenciaBreakdown?: () => void;
}

export const SmartReportModal: React.FC<SmartReportModalProps> = ({
  candidato,
  inmueble,
  report,
  historyReports = [],
  onClose,
  onRegenerateReport,
  onSelectHistoryReport,
  onOpenSolvenciaBreakdown,
}) => {
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [showDesgloseScore, setShowDesgloseScore] = useState<boolean>(false);

  // Badge styles for Valoración General
  const getValoraciónGeneralStyle = (val: string) => {
    switch (val) {
      case 'Favorable':
        return 'bg-emerald-500 text-white border-emerald-600 shadow-xs';
      case 'Requiere revisión':
        return 'bg-amber-500 text-white border-amber-600 shadow-xs';
      case 'Información insuficiente':
      default:
        return 'bg-rose-500 text-white border-rose-600 shadow-xs';
    }
  };

  // Badge styles for Calidad de la Información
  const getCalidadStyle = (cal: string) => {
    switch (cal) {
      case 'Alta':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'Media':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'Baja':
      default:
        return 'bg-rose-100 text-rose-800 border-rose-300';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 md:p-6 overflow-y-auto">
      <div
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden my-auto max-h-[94vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-white text-base sm:text-lg tracking-tight">
                  INFORME INTELIGENTE DEL CANDIDATO
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  v{report.versionNum}
                </span>
              </div>
              <p className="text-xs text-slate-300 flex items-center gap-2 mt-0.5">
                <span>Candidato: <strong className="text-white">{candidato.nombre}</strong></span>
                <span>• Inmueble: <strong className="text-white">{candidato.inmuebleNombre}</strong></span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action bar under header */}
        <div className="p-3 bg-slate-800 border-b border-slate-700/80 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2 px-5">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Informe generado:</span>
            <strong className="text-white font-medium">{report.fechaGeneracion}</strong>
          </div>

          <div className="flex items-center gap-2">
            {historyReports.length > 1 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors border border-slate-600"
              >
                <History className="w-3.5 h-3.5 text-indigo-300" />
                Historial ({historyReports.length})
              </button>
            )}

            <button
              onClick={onRegenerateReport}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Regenerar informe
            </button>
          </div>
        </div>

        {/* History Dropdown Drawer */}
        {showHistory && historyReports.length > 0 && (
          <div className="p-4 bg-slate-900 border-b border-slate-800 space-y-2 animate-in slide-in-from-top-2 duration-150">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Historial de versiones generadas:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {historyReports.map((hRep) => (
                <button
                  key={hRep.id}
                  onClick={() => {
                    if (onSelectHistoryReport) onSelectHistoryReport(hRep);
                    setShowHistory(false);
                  }}
                  className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                    hRep.id === report.id
                      ? 'bg-indigo-950/80 border-indigo-500 text-white font-bold ring-1 ring-indigo-500'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>Informe #{hRep.versionNum}</span>
                    <span className="font-bold text-indigo-300">{hRep.scoreSolvencia} / 100</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{hRep.fechaGeneracion}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Modal Main Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-slate-800 text-xs sm:text-sm">
          {/* SECTION 1: RESUMEN EXPLICATIVO */}
          <div className="bg-gradient-to-r from-indigo-50/90 via-slate-50 to-blue-50/80 border border-indigo-100 rounded-2xl p-4 sm:p-5 space-y-2 shadow-2xs">
            <span className="text-[11px] font-extrabold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-indigo-600" />
              RESUMEN EJECUTIVO
            </span>
            <p className="text-sm sm:text-base font-semibold text-slate-900 leading-relaxed">
              "{report.resumenExplicativo}"
            </p>
          </div>

          {/* SECTION 2: TOP METRICS (VALORACIÓN GENERAL, ÍNDICE DE SOLVENCIA, CALIDAD DE LA INFORMACIÓN) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Valoración General */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Valoración General</span>
                <div className="mt-2">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-extrabold text-sm border ${getValoraciónGeneralStyle(report.valoracionGeneral)}`}>
                    {report.valoracionGeneral === 'Favorable' && '🟢 Favorable'}
                    {report.valoracionGeneral === 'Requiere revisión' && '🟡 Requiere revisión'}
                    {report.valoracionGeneral === 'Información insuficiente' && '🔴 Información insuficiente'}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 italic mt-3 border-t border-slate-100 pt-2 leading-tight">
                Nota: La aplicación asesora al propietario pero no toma decisiones automáticas de aceptación o rechazo.
              </p>
            </div>

            {/* Índice de Solvencia */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Índice de Solvencia</span>
                  <Award className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-extrabold text-slate-900">{report.scoreSolvencia}</span>
                  <span className="text-sm text-slate-400 font-bold">/ 100</span>
                </div>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">{report.explicacionScore}</p>
                <button
                  onClick={() => {
                    if (onOpenSolvenciaBreakdown) onOpenSolvenciaBreakdown();
                    else setShowDesgloseScore(!showDesgloseScore);
                  }}
                  className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline flex items-center gap-1"
                >
                  <span>Pulsar para ver desglose de puntos</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Calidad de la Información */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Calidad de Información</span>
                  <Info className="w-4 h-4 text-slate-400" />
                </div>
                <div className="mt-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${getCalidadStyle(report.calidadInformacion)}`}>
                    {report.calidadInformacion === 'Alta' && '🟢 Alta'}
                    {report.calidadInformacion === 'Media' && '🟡 Media'}
                    {report.calidadInformacion === 'Baja' && '🔴 Baja'}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-2 leading-tight">
                {report.explicacionCalidad}
                <br />
                <span className="italic text-slate-400 mt-1 block">
                  (Representa la completitud/coherencia de datos, no la fiabilidad personal del candidato)
                </span>
              </p>
            </div>
          </div>

          {/* Desglose Score Inline Toggle */}
          {showDesgloseScore && (
            <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-2xl space-y-2 animate-in fade-in duration-200">
              <h5 className="font-bold text-indigo-900 text-xs uppercase tracking-wider">Criterios de Puntuación Configurados:</h5>
              <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-4">
                <li><strong>Capacidad de Pago (Máx 35 ptos):</strong> Ratio esfuerzo ≤ 35%</li>
                <li><strong>Estabilidad Laboral (Máx 25 ptos):</strong> Tipo de contrato y antigüedad</li>
                <li><strong>Ingresos y Estabilidad (Máx 15 ptos):</strong> Volumen y continuidad</li>
                <li><strong>Documentación Aportada (Máx 15 ptos):</strong> % entregado</li>
                <li><strong>Garantías y Avalista (Máx 10 ptos):</strong> Resguardo adicional</li>
              </ul>
            </div>
          )}

          {/* SECTION 3: CAPACIDAD DE PAGO */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 space-y-3 shadow-2xs">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              CAPACIDAD DE PAGO
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase block">Alquiler</span>
                <span className="text-sm sm:text-base font-extrabold text-slate-900 mt-1 block">
                  {formatEuro(report.capacidadPago.alquiler)}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase block">Ingresos Netos Medios</span>
                <span className="text-sm sm:text-base font-extrabold text-emerald-700 mt-1 block">
                  {formatEuro(report.capacidadPago.ingresosNetosMedios)}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase block">Ratio Alquiler/Ingresos</span>
                <span className="text-sm sm:text-base font-extrabold text-indigo-700 mt-1 block">
                  {report.capacidadPago.ratioEsfuerzo} %
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase block">Valoración</span>
                <span className="text-xs font-extrabold text-slate-800 mt-1 inline-block px-2.5 py-0.5 bg-white border rounded-md">
                  {report.capacidadPago.valoracion}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200/60 font-medium">
              Motivo: {report.capacidadPago.explicacion}
            </p>
          </div>

          {/* SECTION 4: ESTABILIDAD LABORAL */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 space-y-3 shadow-2xs">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <Briefcase className="w-4 h-4 text-blue-600" />
              ESTABILIDAD LABORAL
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase block">Empresa</span>
                <span className="font-bold text-slate-900 mt-0.5 block">{report.estabilidadLaboral.empresa}</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase block">Tipo de Contrato</span>
                <span className="font-bold text-slate-900 mt-0.5 block">{report.estabilidadLaboral.tipoContrato}</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase block">Antigüedad</span>
                <span className="font-bold text-slate-900 mt-0.5 block">{report.estabilidadLaboral.antiguedad}</span>
              </div>
            </div>

            <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-xs space-y-1">
              <div className="font-bold text-blue-900">
                Valoración laboral: <span className="underline">{report.estabilidadLaboral.valoracion}</span>
              </div>
              <p className="text-slate-700">{report.estabilidadLaboral.explicacion}</p>
            </div>
          </div>

          {/* SECTION 5: DOCUMENTACIÓN */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 space-y-3 shadow-2xs">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <Layers className="w-4 h-4 text-indigo-600" />
              DOCUMENTACIÓN REQUERIDA
            </h4>

            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase block">Recibidos</span>
                <span className="text-base font-extrabold text-slate-900 mt-1 block">
                  {report.documentacion.recibidos} / {report.documentacion.totalesEsperados}
                </span>
              </div>

              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                <span className="text-[11px] font-bold text-emerald-800 uppercase block">Analizados</span>
                <span className="text-base font-extrabold text-emerald-800 mt-1 block">
                  {report.documentacion.analizados}
                </span>
              </div>

              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-100">
                <span className="text-[11px] font-bold text-amber-800 uppercase block">Pendientes</span>
                <span className="text-base font-extrabold text-amber-800 mt-1 block">
                  {report.documentacion.pendientesCount}
                </span>
              </div>
            </div>

            {report.documentacion.pendientesLista.length > 0 && (
              <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200/80 space-y-1 text-xs">
                <span className="font-bold text-amber-900 block">Documentos pendientes de aportar:</span>
                <ul className="list-disc pl-4 text-amber-800 space-y-0.5">
                  {report.documentacion.pendientesLista.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* SECTION 6: COHERENCIA DE LOS DATOS */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 space-y-3 shadow-2xs">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              COHERENCIA DE LOS DATOS (Manual vs Documentos)
            </h4>

            {!report.coherenciaDatos.tieneDiferencias ? (
              <div className="p-3 bg-emerald-50 text-emerald-900 rounded-xl border border-emerald-200/80 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Los datos introducidos manualmente coinciden con los documentos analizados sin diferencias reseñables.
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {report.coherenciaDatos.diferencias.map((dif, idx) => (
                  <div key={idx} className="p-3.5 bg-amber-50/90 rounded-xl border border-amber-200/80 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-amber-900 font-bold">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        ⚠️ Diferencia detectada en: {dif.campo}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white/90 p-2.5 rounded-lg border border-amber-200/60 font-medium text-slate-800">
                      <div>
                        <span className="text-slate-400 text-[10px] uppercase font-bold block">Introducido:</span>
                        <span>{dif.manual}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] uppercase font-bold block">Documentación:</span>
                        <span>{dif.documental}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] uppercase font-bold block">Diferencia / Nota:</span>
                        <span className="text-amber-800 font-bold">{dif.diferencia}</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-amber-900 font-bold flex items-center gap-1">
                      <span>Acción recomendada:</span>
                      <span className="underline font-normal">{dif.accionRecomendada}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 7, 8, 9: ASPECTOS FAVORABLES, A REVISAR E INFORMACIÓN FALTANTE */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Aspectos Favorables */}
            <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-2xl p-4 space-y-2">
              <h5 className="font-bold text-emerald-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ASPECTOS FAVORABLES
              </h5>
              <ul className="space-y-1.5 text-xs text-emerald-900">
                {report.aspectosFavorables.map((item, idx) => (
                  <li key={idx} className="bg-white/80 p-2 rounded-lg border border-emerald-200/60 font-medium">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Aspectos a Revisar */}
            <div className="bg-amber-50/50 border border-amber-200/80 rounded-2xl p-4 space-y-2">
              <h5 className="font-bold text-amber-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                ASPECTOS A REVISAR
              </h5>
              {report.aspectosARevisar.length === 0 ? (
                <p className="text-xs text-amber-800 italic bg-white/80 p-2 rounded-lg border border-amber-200/60">
                  No se identifican aspectos críticos a revisar.
                </p>
              ) : (
                <ul className="space-y-1.5 text-xs text-amber-900">
                  {report.aspectosARevisar.map((item, idx) => (
                    <li key={idx} className="bg-white/80 p-2 rounded-lg border border-amber-200/60 font-medium">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Información Faltante */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 space-y-2">
              <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-slate-500" />
                INFORMACIÓN FALTANTE
              </h5>
              {report.informacionFaltante.length === 0 ? (
                <p className="text-xs text-slate-600 italic bg-white p-2 rounded-lg border border-slate-200">
                  Toda la información clave está disponible.
                </p>
              ) : (
                <ul className="space-y-1.5 text-xs text-slate-700">
                  {report.informacionFaltante.map((item, idx) => (
                    <li key={idx} className="bg-white p-2 rounded-lg border border-slate-200 font-medium">
                      • {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 flex items-center gap-2">
            <span>Versión #{report.versionNum}</span>
            <span>• {report.fechaGeneracion}</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors shadow-md"
          >
            Cerrar Informe
          </button>
        </div>
      </div>
    </div>
  );
};
