import React from 'react';
import { PolizaSeguro, HistorialPolizaItem } from '../../types';
import { ESTADO_RENOVACION_LABELS } from '../../utils/segurosEngine';
import { Clock, FileText, CheckCircle2, AlertTriangle, History, ShieldCheck, Building2 } from 'lucide-react';

interface PolizaHistorialTimelineProps {
  poliza: PolizaSeguro;
  cadenaHistorial?: PolizaSeguro[];
  onVerPoliza?: (id: string) => void;
}

export const PolizaHistorialTimeline: React.FC<PolizaHistorialTimelineProps> = ({
  poliza,
  cadenaHistorial = [],
  onVerPoliza,
}) => {
  const historial = poliza.historial || [];

  return (
    <div className="space-y-6">
      {/* Cadena histórica de pólizas */}
      {cadenaHistorial.length > 1 && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            Cadena Histórica de Pólizas ({cadenaHistorial.length})
          </h4>
          <div className="space-y-2">
            {cadenaHistorial.map((p, idx) => {
              const isActual = p.id === poliza.id;
              return (
                <div
                  key={p.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                    isActual ? 'bg-blue-50 border-blue-300 shadow-xs' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${isActual ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        {p.aseguradora} <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded border">{p.numeroPoliza}</span>
                        {isActual && <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full">ACTUAL</span>}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {p.fechaInicio} → {p.fechaVencimiento} · {p.primaAnual ?? '—'}€/año · {p.tipo}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {idx < cadenaHistorial.length - 1 && <span className="text-slate-400">→</span>}
                    {onVerPoliza && p.id !== poliza.id && (
                      <button
                        onClick={() => onVerPoliza(p.id)}
                        className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold hover:bg-slate-50"
                      >
                        Ver
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Historial de eventos de esta póliza */}
      <div>
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <History className="w-4 h-4 text-slate-500" />
          Historial de Eventos ({historial.length})
        </h4>

        {historial.length === 0 ? (
          <div className="p-6 text-center bg-white border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
            No hay eventos registrados para esta póliza. El histórico se genera automáticamente al crear, comprobar renovación, adjuntar documentos o confirmar renovación.
          </div>
        ) : (
          <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200">
            {[...historial]
              .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
              .map((h) => {
                const isAlerta = h.accion === 'ALERTA_GENERADA';
                const isComprobacion = h.accion === 'COMPROBACION_RENOVACION';
                const isRenovacion = h.accion.includes('RENOVACION');
                return (
                  <div key={h.id} className="relative flex items-start gap-3 pl-8">
                    <div
                      className={`absolute left-2 top-1.5 w-3 h-3 rounded-full border-2 border-white shadow-xs ${
                        isAlerta ? 'bg-rose-500' : isRenovacion ? 'bg-blue-600' : isComprobacion ? 'bg-amber-500' : 'bg-slate-400'
                      }`}
                    />
                    <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs w-full shadow-xs">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          {h.accion === 'CREACION' && <FileText className="w-3.5 h-3.5 text-blue-500" />}
                          {h.accion.includes('RENOVACION') && <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />}
                          {h.accion === 'ALERTA_GENERADA' && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                          {h.accion === 'COMPROBACION_RENOVACION' && <Clock className="w-3.5 h-3.5 text-amber-600" />}
                          {h.accion.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[11px] text-slate-400">{new Date(h.fecha).toLocaleString('es-ES')}</span>
                      </div>
                      <div className="text-slate-600 font-medium">
                        <span className="text-slate-500">Usuario:</span> {h.usuario}
                        {h.detalle && <span> · {h.detalle}</span>}
                      </div>
                      {h.resultado && <div className="text-slate-700 mt-1">Resultado: {h.resultado}</div>}
                      {h.observaciones && <div className="text-slate-500 italic mt-1">Obs: {h.observaciones}</div>}
                      {h.estadoAnterior && h.estadoNuevo && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          <span className="line-through">{h.estadoAnterior}</span> →{' '}
                          <span className="font-bold text-blue-700">{h.estadoNuevo}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Datos de creación */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500">
        <div>Creada: {new Date(poliza.createdAt).toLocaleString('es-ES')}</div>
        <div>Actualizada: {new Date(poliza.updatedAt).toLocaleString('es-ES')}</div>
        {poliza.polizaAnteriorId && <div>Poliza anterior: {poliza.polizaAnteriorId}</div>}
        {poliza.polizaSiguienteId && <div>Poliza siguiente: {poliza.polizaSiguienteId}</div>}
      </div>
    </div>
  );
};
