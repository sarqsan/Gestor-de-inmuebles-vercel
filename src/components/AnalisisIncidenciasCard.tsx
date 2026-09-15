import React, { useState } from 'react';
import { Candidato, AnalisisIncidencias } from '../types';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Info,
  ShieldCheck,
  Zap,
  Clock,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertCircle,
  BarChart3,
  RefreshCw,
} from 'lucide-react';

interface AnalisisIncidenciasCardProps {
  candidato: Candidato;
  analisis?: AnalisisIncidencias;
  onRunAnalysis: () => Promise<void>;
  isLoading?: boolean;
}

export const AnalisisIncidenciasCard: React.FC<AnalisisIncidenciasCardProps> = ({
  candidato,
  analisis,
  onRunAnalysis,
  isLoading = false,
}) => {
  const [showHowCalculated, setShowHowCalculated] = useState(false);

  // Auto-run AI analysis if questionnaire is completed but no analysis exists yet
  React.useEffect(() => {
    if (candidato?.cuestionarioIncidencias?.completado && !analisis && !isLoading) {
      onRunAnalysis();
    }
  }, [candidato?.id, candidato?.cuestionarioIncidencias?.completado, analisis, isLoading]);

  if (!candidato?.cuestionarioIncidencias?.completado) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 text-center space-y-3">
        <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto">
          <Clock className="w-6 h-6" />
        </div>
        <h3 className="font-extrabold text-slate-900 text-sm">Cuestionario Pendiente de Respuesta</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          El candidato aún no ha completado el cuestionario de gestión de incidencias. Envíale el enlace móvil o responde en la sección de cuestionarios para habilitar el análisis con IA.
        </p>
      </div>
    );
  }

  if (!analisis) {
    return (
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl border border-slate-800 p-6 shadow-md space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/20 text-indigo-300 rounded-2xl border border-indigo-500/30">
              <Sparkles className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 block">
                ANÁLISIS INTELIGENTE
              </span>
              <h3 className="text-base font-extrabold text-white">
                Análisis con IA del Perfil de Gestión de Incidencias
              </h3>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
          Evalúa las 12 respuestas del cuestionario para obtener una puntuación en 4 dimensiones clave (Iniciativa, Prudencia, Comunicación y Gestión de Incidencias) sin sesgos ni condicionantes personales.
        </p>

        <button
          type="button"
          onClick={onRunAnalysis}
          disabled={isLoading}
          className="w-full py-3.5 bg-gradient-to-r from-indigo-500 via-blue-600 to-indigo-600 hover:from-indigo-600 hover:to-blue-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
              <span>Analizando respuestas con IA...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Analizar respuestas con IA</span>
            </>
          )}
        </button>
      </div>
    );
  }

  // Determine badge colors based on final level
  const getBadgeConfig = (nivel: string) => {
    switch (nivel) {
      case 'adecuado':
        return {
          bg: 'bg-emerald-500/10 text-emerald-700 border-emerald-300',
          dot: 'bg-emerald-500',
          icon: CheckCircle2,
          label: '🟢 Adecuado',
        };
      case 'requiere_atencion':
        return {
          bg: 'bg-amber-500/10 text-amber-800 border-amber-300',
          dot: 'bg-amber-500',
          icon: AlertTriangle,
          label: '🟡 Requiere atención',
        };
      default:
        return {
          bg: 'bg-rose-500/10 text-rose-800 border-rose-300',
          dot: 'bg-rose-500',
          icon: AlertCircle,
          label: '🔴 Se observan varias conductas que conviene revisar',
        };
    }
  };

  const badgeCfg = getBadgeConfig(analisis.resultadoFinalNivel);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden font-sans space-y-0">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-6 sm:p-7 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-600 text-white rounded-xl">
                <Sparkles className="w-5 h-5 text-amber-300" />
              </span>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-300">
                MÓDULO OPERATIVO
              </span>
            </div>
            <h2 className="text-xl font-black text-white">PERFIL DE GESTIÓN DE INCIDENCIAS</h2>
            <p className="text-xs text-slate-300">
              Candidato: <strong className="text-white">{candidato?.nombre || 'Candidato'}</strong>
            </p>
          </div>

          <button
            type="button"
            onClick={onRunAnalysis}
            disabled={isLoading}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0 self-start sm:self-center"
            title="Volver a ejecutar el análisis con las respuestas actuales"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Re-analizar con IA</span>
          </button>
        </div>

        {/* Global Score & Result Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Main Global Score */}
          <div className="bg-slate-800/90 border border-slate-700 p-4 rounded-2xl flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                PERFIL OPERATIVO GLOBAL
              </span>
              <span className="text-xs text-slate-300">Resumen exclusivo del cuestionario</span>
            </div>
            <div className="flex items-baseline gap-1 bg-slate-950 px-4 py-2 rounded-xl border border-slate-700">
              <span className="text-3xl font-black text-amber-400">{analisis.scores.perfilOperativo}</span>
              <span className="text-xs font-bold text-slate-400">/100</span>
            </div>
          </div>

          {/* Final Result Status */}
          <div className="bg-slate-800/90 border border-slate-700 p-4 rounded-2xl flex flex-col justify-center space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              VALORACIÓN FINAL DE INCIDENCIAS
            </span>
            <div className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold w-fit ${badgeCfg.bg}`}>
              {badgeCfg.label}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-7 space-y-6 bg-white">
        {/* Explanation Text */}
        <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-1 text-xs leading-relaxed text-slate-800">
          <span className="font-bold text-slate-900 block flex items-center gap-1.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            Explicación del análisis de conducta
          </span>
          <p className="text-slate-700">{analisis.explicacionResumen}</p>
        </div>

        {/* 4 Dimension Scores */}
        <div className="space-y-3">
          <h4 className="font-extrabold text-xs uppercase text-slate-900 tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            <span>Dimensiones de Análisis (0 a 100)</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Dimension A: Iniciativa */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800">A. Iniciativa</span>
                <span className="text-sm font-black text-blue-700">{analisis.scores.iniciativa}/100</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${analisis.scores.iniciativa}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-snug pt-1">
                Comprueba aspectos básicos y busca soluciones sencillas inofensivas.
              </p>
            </div>

            {/* Dimension B: Prudencia */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800">B. Prudencia</span>
                <span className="text-sm font-black text-emerald-700">{analisis.scores.prudencia}/100</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${analisis.scores.prudencia}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-snug pt-1">
                Evita manipular instalaciones peligrosas (electricidad, gas, etc.).
              </p>
            </div>

            {/* Dimension C: Comunicación */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800">C. Comunicación</span>
                <span className="text-sm font-black text-indigo-700">{analisis.scores.comunicacion}/100</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${analisis.scores.comunicacion}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-snug pt-1">
                Comunica incidencias importantes con claridad y datos útiles.
              </p>
            </div>

            {/* Dimension D: Gestión Incidencias */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800">D. Gestión Incidencias</span>
                <span className="text-sm font-black text-amber-700">
                  {analisis.scores.gestionIncidencias}/100
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-amber-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${analisis.scores.gestionIncidencias}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-snug pt-1">
                Sigue la secuencia lógica: Detectar → Comprobar → Comunicar → Asistencia.
              </p>
            </div>
          </div>
        </div>

        {/* Favorable Aspects & Aspects to Review Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Favorable Aspects */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <h5 className="text-xs font-extrabold uppercase tracking-wider text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Aspectos Favorables ({analisis.aspectosFavorables.length})</span>
            </h5>
            <ul className="space-y-2 text-xs text-emerald-950">
              {analisis.aspectosFavorables.map((af, idx) => (
                <li key={idx} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-emerald-600 font-bold shrink-0">✓</span>
                  <span>{af}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Aspects to Review */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <h5 className="text-xs font-extrabold uppercase tracking-wider text-amber-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Aspectos a Revisar ({analisis.aspectosARevisar.length})</span>
            </h5>
            {analisis.aspectosARevisar.length === 0 ? (
              <p className="text-xs text-amber-800 italic">No se han observado aspectos críticos a revisar.</p>
            ) : (
              <ul className="space-y-2 text-xs text-amber-950">
                {analisis.aspectosARevisar.map((ar, idx) => (
                  <li key={idx} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-amber-600 font-bold shrink-0">⚠️</span>
                    <span>{ar}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Highlighted Situations */}
        {analisis.situacionesDestacadas && analisis.situacionesDestacadas.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-extrabold text-xs uppercase text-slate-900 tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-600" />
              <span>Situaciones Destacadas en el Cuestionario</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {analisis.situacionesDestacadas.map((sit, idx) => {
                let badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                if (sit.nivelValoracion === 'revisar') badgeColor = 'bg-amber-100 text-amber-800 border-amber-200';
                if (sit.nivelValoracion === 'imprudente') badgeColor = 'bg-rose-100 text-rose-800 border-rose-200';

                return (
                  <div key={idx} className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
                    <span className="font-extrabold text-[11px] text-slate-900 block truncate">
                      {sit.titulo}
                    </span>
                    <p className="text-xs text-slate-700 italic bg-white p-2.5 rounded-xl border border-slate-200 leading-relaxed">
                      "{sit.respuesta}"
                    </p>
                    <div className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold w-fit ${badgeColor}`}>
                      {sit.valoracionTexto}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Confidence Level & Disclaimer Banner */}
        <div className="p-4 bg-slate-100/90 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900">Confianza del Análisis:</span>
              <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 font-extrabold rounded-full text-[11px]">
                {analisis.nivelConfianza}
              </span>
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              {analisis.explicacionConfianza}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowHowCalculated(!showHowCalculated)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl transition-all flex items-center gap-1.5 shrink-0 self-start sm:self-center shadow-2xs"
          >
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            <span>¿Cómo se ha calculado?</span>
            {showHowCalculated ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* How Calculated Breakdown Modal / Drawer */}
        {showHowCalculated && (
          <div className="p-5 bg-blue-50/80 border border-blue-200 rounded-2xl space-y-4 animate-in fade-in text-xs">
            <div className="flex items-center justify-between border-b border-blue-200 pb-2">
              <h5 className="font-black text-blue-900 text-xs uppercase tracking-wider flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600" />
                <span>Desglose Transparente de la Valoración</span>
              </h5>
              <span className="text-[11px] text-blue-700 font-semibold">
                {analisis.desgloseCalculo?.length || 0} situaciones analizadas
              </span>
            </div>

            <p className="text-blue-900 leading-relaxed">
              A continuación se muestra el impacto individual de cada respuesta en las 4 dimensiones operativas. La valoración no prejuzga la persona, únicamente evalúa la idoneidad técnica de sus decisiones ante incidencias.
            </p>

            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {analisis.desgloseCalculo?.map((item, idx) => (
                <div key={idx} className="bg-white p-3.5 rounded-xl border border-blue-200/80 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-slate-900 font-extrabold">{item.preguntaTitulo}</strong>
                  </div>
                  <div className="text-slate-700 font-medium bg-slate-50 p-2 rounded-lg border border-slate-200">
                    Respuesta: <span className="italic">{item.respuestaDada}</span>
                  </div>
                  <div className="text-blue-900 font-semibold text-[11px] pt-0.5">
                    Impacto: {item.impacto}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ethics Disclaimer */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 leading-relaxed flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <span>
            <strong>Garantía Ética y de Independencia:</strong> Este análisis de gestión de incidencias opera de forma totalmente aislada al índice de solvencia económica. No utiliza datos personales protegidos ni realiza predicciones morales. Es una herramienta auxiliar para el propietario.
          </span>
        </div>
      </div>
    </div>
  );
};
