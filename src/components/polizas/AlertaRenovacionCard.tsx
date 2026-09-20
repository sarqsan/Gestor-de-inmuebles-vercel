import React from 'react';
import { AlertaRenovacionPoliza } from '../../types';
import { ESTADO_RENOVACION_LABELS, obtenerTextoDiasRestantes } from '../../utils/segurosEngine';
import { AlertTriangle, Clock, Building2, ShieldCheck, Euro, Calendar } from 'lucide-react';

interface AlertaRenovacionCardProps {
  alerta: AlertaRenovacionPoliza;
  onVerPoliza: (polizaId: string) => void;
  onComprobarRenovacion: (polizaId: string) => void;
}

export const AlertaRenovacionCard: React.FC<AlertaRenovacionCardProps> = ({
  alerta,
  onVerPoliza,
  onComprobarRenovacion,
}) => {
  const nivelColor =
    alerta.nivelProximidad === -1
      ? 'bg-rose-100 text-rose-800 border-rose-300'
      : alerta.nivelProximidad === 0 || alerta.nivelProximidad === 15
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : alerta.nivelProximidad === 30
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-blue-50 text-blue-700 border-blue-200';

  const estadoInfo = ESTADO_RENOVACION_LABELS[alerta.estadoRenovacion] || ESTADO_RENOVACION_LABELS.VIGENTE;

  return (
    <div className={`p-4 rounded-xl border ${nivelColor} flex flex-col gap-3 shadow-xs`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="text-xs font-black uppercase tracking-wider">
            {alerta.nivelProximidad === -1
              ? 'PÓLIZA VENCIDA'
              : alerta.nivelProximidad === 0
              ? 'VENCE HOY'
              : `VENCIMIENTO EN ${alerta.nivelProximidad} DÍAS`}
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${estadoInfo.badgeClass}`}>
          {estadoInfo.label}
        </span>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
          <ShieldCheck className="w-4 h-4 text-slate-600" />
          <span>{alerta.aseguradora}</span>
          <span className="font-mono text-xs bg-white/70 px-1.5 py-0.5 rounded border">{alerta.polizaNumero}</span>
        </div>
        {alerta.inmuebleDireccion && (
          <div className="flex items-center gap-1.5 text-xs text-slate-700">
            <Building2 className="w-3.5 h-3.5" />
            <span className="truncate">{alerta.inmuebleDireccion}</span>
          </div>
        )}
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            Vto: {new Date(alerta.fechaVencimiento).toLocaleDateString('es-ES')}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {obtenerTextoDiasRestantes(alerta.diasRestantes)}
          </span>
          {alerta.primaAnual && (
            <span className="flex items-center gap-1">
              <Euro className="w-3.5 h-3.5" />
              {alerta.primaAnual} €/año
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-black/10">
        <button
          onClick={() => onVerPoliza(alerta.polizaId)}
          className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg border transition-colors"
        >
          Ver Póliza
        </button>
        <button
          onClick={() => onComprobarRenovacion(alerta.polizaId)}
          className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-lg transition-colors"
        >
          Comprobar Renovación
        </button>
      </div>
    </div>
  );
};
