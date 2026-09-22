import React from 'react';
import { ComparacionPoliza, PolizaSeguro } from '../../types';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, ShieldCheck, Euro, Calendar, Plus } from 'lucide-react';

interface PolizaComparacionViewProps {
  comparacion: ComparacionPoliza;
  polizaAnterior?: PolizaSeguro;
  polizaNueva?: PolizaSeguro;
}

export const PolizaComparacionView: React.FC<PolizaComparacionViewProps> = ({
  comparacion,
  polizaAnterior,
  polizaNueva,
}) => {
  const formatPrima = (v?: number) => (v !== undefined ? `${v.toFixed(2)} €` : 'No disponible');

  return (
    <div className="space-y-4">
      {/* Resumen de diferencias objetivas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Prima Anterior</span>
          <span className="text-base font-black text-slate-900">{formatPrima(comparacion.primaAnterior)}</span>
          {polizaAnterior && (
            <span className="text-[11px] text-slate-500 block mt-1">
              {new Date(polizaAnterior.fechaVencimiento).toLocaleDateString('es-ES')} · {polizaAnterior.aseguradora}
            </span>
          )}
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Prima Nueva</span>
          <span className="text-base font-black text-slate-900">{formatPrima(comparacion.primaNueva)}</span>
          {polizaNueva && (
            <span className="text-[11px] text-slate-500 block mt-1">
              {new Date(polizaNueva.fechaVencimiento).toLocaleDateString('es-ES')} · {polizaNueva.aseguradora}
            </span>
          )}
        </div>

        <div
          className={`p-3 border rounded-xl ${
            comparacion.aumentoPrima
              ? 'bg-rose-50 border-rose-200'
              : comparacion.diferenciaAbsoluta && comparacion.diferenciaAbsoluta < 0
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Variación</span>
          <div className="flex items-center gap-2">
            {comparacion.aumentoPrima ? (
              <TrendingUp className="w-4 h-4 text-rose-600" />
            ) : comparacion.diferenciaAbsoluta && comparacion.diferenciaAbsoluta < 0 ? (
              <TrendingDown className="w-4 h-4 text-emerald-600" />
            ) : (
              <Minus className="w-4 h-4 text-slate-500" />
            )}
            <span
              className={`text-base font-black ${
                comparacion.aumentoPrima
                  ? 'text-rose-700'
                  : comparacion.diferenciaAbsoluta && comparacion.diferenciaAbsoluta < 0
                  ? 'text-emerald-700'
                  : 'text-slate-900'
              }`}
            >
              {comparacion.diferenciaAbsoluta !== undefined
                ? `${comparacion.diferenciaAbsoluta > 0 ? '+' : ''}${comparacion.diferenciaAbsoluta.toFixed(2)} €`
                : '—'}
            </span>
            {comparacion.variacionPorcentual !== undefined && (
              <span className="text-xs font-bold">
                ({comparacion.variacionPorcentual > 0 ? '+' : ''}
                {comparacion.variacionPorcentual.toFixed(2)}%)
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">Diferencia objetiva, sin valoración comercial</span>
        </div>
      </div>

      {/* Alertas objetivas */}
      {(comparacion.aumentoPrima || comparacion.reduccionCobertura || comparacion.aumentoFranquicia || comparacion.modificacionLimites) && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
          <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Cambios Detectados (Objetivos)
          </h4>
          <ul className="text-xs text-amber-800 space-y-1 list-disc pl-5 font-medium">
            {comparacion.aumentoPrima && <li>Aumento de prima anual respecto a la póliza anterior</li>}
            {comparacion.reduccionCobertura && <li>Reducción de coberturas: {comparacion.coberturasEliminadas.join(', ')}</li>}
            {comparacion.aumentoFranquicia && (
              <li>
                Aumento de franquicia: {comparacion.franquiciaAnterior}€ → {comparacion.franquiciaNueva}€ (Δ {comparacion.diferenciaFranquicia}€)
              </li>
            )}
            {comparacion.modificacionLimites && <li>Modificación de límites asegurados detectada</li>}
          </ul>
        </div>
      )}

      {/* Coberturas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl">
          <h5 className="font-bold text-emerald-900 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Añadidas ({comparacion.coberturasAnadidas.length})
          </h5>
          {comparacion.coberturasAnadidas.length === 0 ? (
            <p className="text-slate-500 italic">Ninguna</p>
          ) : (
            <ul className="space-y-1">
              {comparacion.coberturasAnadidas.map((c, i) => (
                <li key={i} className="bg-white border border-emerald-200 px-2 py-1 rounded-md font-medium text-emerald-800">
                  {c}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-3 bg-rose-50/50 border border-rose-200 rounded-xl">
          <h5 className="font-bold text-rose-900 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1">
            <Minus className="w-3.5 h-3.5" /> Eliminadas ({comparacion.coberturasEliminadas.length})
          </h5>
          {comparacion.coberturasEliminadas.length === 0 ? (
            <p className="text-slate-500 italic">Ninguna</p>
          ) : (
            <ul className="space-y-1">
              {comparacion.coberturasEliminadas.map((c, i) => (
                <li key={i} className="bg-white border border-rose-200 px-2 py-1 rounded-md font-medium text-rose-800">
                  {c}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <h5 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Comunes ({comparacion.coberturasComunes.length})
          </h5>
          {comparacion.coberturasComunes.length === 0 ? (
            <p className="text-slate-500 italic">Ninguna</p>
          ) : (
            <ul className="space-y-1">
              {comparacion.coberturasComunes.slice(0, 6).map((c, i) => (
                <li key={i} className="bg-white border border-slate-200 px-2 py-1 rounded-md font-medium text-slate-700">
                  {c}
                </li>
              ))}
              {comparacion.coberturasComunes.length > 6 && (
                <li className="text-slate-400">+{comparacion.coberturasComunes.length - 6} más</li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Fechas y franquicia */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="p-3 bg-white border border-slate-200 rounded-xl">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">Fechas de Vigencia</span>
          <div className="mt-1 space-y-1 font-medium">
            <div>Anterior: {comparacion.fechaInicioAnterior} → {comparacion.fechaVencimientoAnterior}</div>
            <div>Nueva: {comparacion.fechaInicioNueva} → {comparacion.fechaVencimientoNueva}</div>
          </div>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-xl">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">Franquicia</span>
          <div className="mt-1 font-medium">
            <div>Anterior: {comparacion.franquiciaAnterior ?? 0} €</div>
            <div>Nueva: {comparacion.franquiciaNueva ?? 0} €</div>
            {comparacion.diferenciaFranquicia !== undefined && comparacion.diferenciaFranquicia !== 0 && (
              <div className={comparacion.aumentoFranquicia ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                Diferencia: {comparacion.diferenciaFranquicia > 0 ? '+' : ''}
                {comparacion.diferenciaFranquicia} €
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="text-[11px] text-slate-400 italic border-t border-slate-100 pt-2">
        Comparación generada el {new Date(comparacion.fechaComparacion).toLocaleString('es-ES')}. Datos objetivos sin valoración comercial.
      </div>
    </div>
  );
};
