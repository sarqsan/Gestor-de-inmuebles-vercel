/**
 * AG-02 — Pantallas comunes de carga y error de los portales públicos.
 * El enlace debe poder explicar que no es válido sin dejar la pantalla en
 * blanco ni insinuar un éxito que no ha ocurrido.
 */
import React from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';

export const PantallaCargandoPortal: React.FC<{ mensaje: string }> = ({ mensaje }) => (
  <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
    <div role="status" aria-live="polite" className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 text-center max-w-md space-y-3">
      <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" aria-hidden="true" />
      <p className="text-sm font-semibold text-slate-700">{mensaje}</p>
    </div>
  </div>
);

export const PantallaErrorPortal: React.FC<{
  mensaje: string;
  onReintentar?: () => void;
}> = ({ mensaje, onReintentar }) => (
  <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
    <div role="alert" className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 text-center space-y-3 max-w-md">
      <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" aria-hidden="true" />
      <p className="text-base font-bold text-slate-800">No se ha podido abrir el enlace</p>
      <p className="text-xs text-slate-500 leading-relaxed">{mensaje}</p>
      {onReintentar && (
        <button
          type="button"
          onClick={onReintentar}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Reintentar
        </button>
      )}
    </div>
  </div>
);
