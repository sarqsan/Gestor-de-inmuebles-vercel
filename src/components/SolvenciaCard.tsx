import React, { useState } from 'react';
import { ResultadoValuracion, FactorDesglose } from '../utils/solvenciaEngine';
import {
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Info,
  DollarSign,
  Briefcase,
  TrendingUp,
  FileText,
  UserCheck,
  Scale,
} from 'lucide-react';

interface SolvenciaCardProps {
  resultado: ResultadoValuracion;
  showComparisonLink?: boolean;
  onGoToComparison?: () => void;
}

export const SolvenciaCard: React.FC<SolvenciaCardProps> = ({
  resultado,
  showComparisonLink,
  onGoToComparison,
}) => {
  const [expandedFactor, setExpandedFactor] = useState<string | null>(null);

  const toggleFactor = (id: string) => {
    setExpandedFactor((prev) => (prev === id ? null : id));
  };

  const { desglose, tieneAvalista } = resultado;

  const totalCalculadoDisplay = tieneAvalista
    ? `${resultado.indiceSolvencia} / 100`
    : `${resultado.indiceSolvencia} / 100`;

  return (
    <div className="space-y-6">
      {/* TARJETA PRINCIPAL DEL ÍNDICE DE SOLVENCIA */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              SISTEMA DE VALORACIÓN OBJETIVA DE CANDIDATOS
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              ÍNDICE DE SOLVENCIA
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-lg">
              Evaluación económica y técnica basada en reglas objetivas, capacidad de pago y estabilidad documental.
            </p>
          </div>

          {/* Gran Puntuación y Clasificación */}
          <div className="flex flex-col items-center md:items-end justify-center">
            <div className="flex items-baseline gap-1 bg-slate-50 px-6 py-3 rounded-2xl border border-slate-200/80 shadow-2xs">
              <span className="text-5xl sm:text-6xl font-black text-slate-900 tracking-tight">
                {resultado.indiceSolvencia}
              </span>
              <span className="text-2xl font-bold text-slate-400">/ 100</span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span
                className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold tracking-wide uppercase ${resultado.badgeColorStyle}`}
              >
                {resultado.nivelClasificacion}
              </span>
            </div>
          </div>
        </div>

        {/* Notificación de Decisión Final del Propietario */}
        <div className="mt-4 p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-start gap-3 text-xs text-blue-900">
          <Scale className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Garantía de autonomía y transparencia:</strong> Este índice constituye una valoración económica objetiva e informativa.
            <span className="font-semibold text-blue-950"> La decisión final de aceptar o rechazar a un candidato corresponde única y exclusivamente al propietario.</span>
          </p>
        </div>
      </div>

      {/* DESGLOSE POR FACTORES (3. DESGLOSE) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              Desglose Explicativo de la Puntuación
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Haz clic en cada factor para desplegar los detalles y la fórmula de cálculo aplicada.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
            Puntuación total: <strong>{totalCalculadoDisplay}</strong>
          </span>
        </div>

        <div className="space-y-3">
          {/* Factor A: Capacidad de Pago */}
          <FactorAccordionItem
            icon={<DollarSign className="w-4 h-4 text-emerald-600" />}
            factor={desglose.capacidadPago}
            displayMaxScore={35}
            isOpen={expandedFactor === 'capacidad_pago'}
            onToggle={() => toggleFactor('capacidad_pago')}
          />

          {/* Factor B: Estabilidad Laboral */}
          <FactorAccordionItem
            icon={<Briefcase className="w-4 h-4 text-indigo-600" />}
            factor={desglose.estabilidadLaboral}
            displayMaxScore={25}
            isOpen={expandedFactor === 'estabilidad_laboral'}
            onToggle={() => toggleFactor('estabilidad_laboral')}
          />

          {/* Factor C: Ingresos y estabilidad económica */}
          <FactorAccordionItem
            icon={<TrendingUp className="w-4 h-4 text-blue-600" />}
            factor={desglose.ingresos}
            displayMaxScore={15}
            isOpen={expandedFactor === 'ingresos'}
            onToggle={() => toggleFactor('ingresos')}
          />

          {/* Factor D: Documentación */}
          <FactorAccordionItem
            icon={<FileText className="w-4 h-4 text-amber-600" />}
            factor={desglose.documentacion}
            displayMaxScore={15}
            isOpen={expandedFactor === 'documentacion'}
            onToggle={() => toggleFactor('documentacion')}
          />

          {/* Factor E: Avalista */}
          <FactorAccordionItem
            icon={<UserCheck className="w-4 h-4 text-purple-600" />}
            factor={desglose.avalista}
            displayMaxScore={tieneAvalista ? 10 : 0}
            isOpen={expandedFactor === 'avalista'}
            onToggle={() => toggleFactor('avalista')}
            customScoreText={tieneAvalista ? undefined : '0 / 0 (Redistribuido)'}
          />
        </div>

        {/* Total Summary Row */}
        <div className="p-4 rounded-xl bg-slate-900 text-white flex items-center justify-between font-bold text-sm sm:text-base mt-4 shadow-md">
          <span>TOTAL ÍNDICE DE SOLVENCIA</span>
          <span className="text-xl sm:text-2xl text-emerald-400 font-extrabold">
            {resultado.indiceSolvencia} <span className="text-slate-400 text-sm font-normal">/ 100</span>
          </span>
        </div>
      </div>

      {/* SECCIÓN ALERTAS Y PUNTOS POSITIVOS (4 & 5) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Aspectos a revisar (Alertas) */}
        <div className="bg-white rounded-2xl border border-amber-200/80 shadow-2xs p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-base border-b border-amber-100 pb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <span>Aspectos a revisar ({resultado.aspectosARevisar.length})</span>
          </div>

          {resultado.aspectosARevisar.length > 0 ? (
            <ul className="space-y-2.5 text-xs sm:text-sm">
              {resultado.aspectosARevisar.map((alerta, idx) => (
                <li
                  key={idx}
                  className="p-3 bg-amber-50/70 text-amber-950 rounded-xl border border-amber-200/60 font-medium flex items-start gap-2.5"
                >
                  <span className="shrink-0 text-amber-600 mt-0.5">•</span>
                  <span>{alerta.replace(/^⚠️\s*/, '')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500 bg-slate-50 p-3.5 rounded-xl border border-slate-100 italic">
              No se han detectado alertas u observaciones críticas en los datos aportados.
            </p>
          )}
        </div>

        {/* Aspectos favorables (Puntos Positivos) */}
        <div className="bg-white rounded-2xl border border-emerald-200/80 shadow-2xs p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 text-emerald-900 font-bold text-base border-b border-emerald-100 pb-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>Aspectos favorables ({resultado.aspectosFavorables.length})</span>
          </div>

          {resultado.aspectosFavorables.length > 0 ? (
            <ul className="space-y-2.5 text-xs sm:text-sm">
              {resultado.aspectosFavorables.map((punto, idx) => (
                <li
                  key={idx}
                  className="p-3 bg-emerald-50/70 text-emerald-950 rounded-xl border border-emerald-200/60 font-medium flex items-start gap-2.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{punto.replace(/^✓\s*/, '')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500 bg-slate-50 p-3.5 rounded-xl border border-slate-100 italic">
              Sin factores positivos destacados en la ficha.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

interface FactorAccordionItemProps {
  icon: React.ReactNode;
  factor: FactorDesglose;
  displayMaxScore: number;
  isOpen: boolean;
  onToggle: () => void;
  customScoreText?: string;
}

const FactorAccordionItem: React.FC<FactorAccordionItemProps> = ({
  icon,
  factor,
  displayMaxScore,
  isOpen,
  onToggle,
  customScoreText,
}) => {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 transition-all">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-slate-100/70 transition-colors focus:outline-none"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white border border-slate-200/80 shadow-2xs shrink-0">
            {icon}
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm">{factor.nombre}</p>
            <p className="text-xs text-slate-500 line-clamp-1">{factor.explicacion}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="font-extrabold text-sm sm:text-base text-slate-900 bg-white px-3 py-1 rounded-lg border border-slate-200">
            {customScoreText || `${factor.puntosObtenidos} / ${displayMaxScore}`}
          </span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-200/60 bg-white text-xs space-y-2 animate-in fade-in duration-150">
          <p className="font-medium text-slate-700">{factor.explicacion}</p>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Detalle de cálculo:
            </span>
            {factor.detalles.map((det, i) => (
              <p key={i} className="text-slate-600 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                {det}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
