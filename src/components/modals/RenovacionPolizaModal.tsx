import React, { useState } from 'react';
import { PolizaSeguro, EstadoRenovacionPoliza, UsuarioApp } from '../../types';
import { ESTADO_RENOVACION_LABELS, crearHistorialPolizaItem, calcularDiasRestantes } from '../../utils/segurosEngine';
import { X, Clock, ShieldCheck, AlertTriangle, CheckCircle2, FileText, User } from 'lucide-react';

interface RenovacionPolizaModalProps {
  isOpen: boolean;
  onClose: () => void;
  poliza: PolizaSeguro;
  currentUser?: UsuarioApp;
  onSave: (polizaActualizada: PolizaSeguro) => Promise<void>;
}

export const RenovacionPolizaModal: React.FC<RenovacionPolizaModalProps> = ({
  isOpen,
  onClose,
  poliza,
  currentUser,
  onSave,
}) => {
  const [estadoRenovacion, setEstadoRenovacion] = useState<EstadoRenovacionPoliza>(
    poliza.estadoRenovacion || 'PENDIENTE_RENOVACION'
  );
  const [resultado, setResultado] = useState<string>(poliza.resultadoUltimaComprobacion || '');
  const [observaciones, setObservaciones] = useState<string>(poliza.observacionesRenovacion || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const diasRestantes = calcularDiasRestantes(poliza.fechaVencimiento);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resultado.trim()) {
      setErrorMsg('Debe indicar el resultado de la comprobación');
      return;
    }
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const nowIso = new Date().toISOString();
      const userName = currentUser?.nombre || 'Propietario';
      const userId = currentUser?.id;

      const historialItem = crearHistorialPolizaItem(
        userName,
        'COMPROBACION_RENOVACION',
        `Comprobación de renovación para póliza ${poliza.numeroPoliza}`,
        resultado.trim(),
        observaciones.trim() || undefined,
        userId,
        poliza.estadoRenovacion,
        estadoRenovacion
      );

      const accionHistorial: Record<EstadoRenovacionPoliza, any> = {
        PENDIENTE_RENOVACION: 'COMPROBACION_RENOVACION',
        RENOVACION_SOLICITADA: 'RENOVACION_SOLICITADA',
        RENOVACION_RECIBIDA: 'RENOVACION_RECIBIDA',
        RENOVADA: 'RENOVACION_CONFIRMADA',
        NO_RENOVADA: 'NO_RENOVACION',
        SUSTITUIDA: 'SUSTITUCION',
        VIGENTE: 'ESTADO_MODIFICADO',
        PENDIENTE: 'ESTADO_MODIFICADO',
        CANCELADA: 'CANCELACION',
      };

      // Ajustar acción según estado elegido
      historialItem.accion = accionHistorial[estadoRenovacion] || 'COMPROBACION_RENOVACION';

      const polizaActualizada: PolizaSeguro = {
        ...poliza,
        estadoRenovacion,
        fechaUltimaComprobacion: nowIso,
        usuarioUltimaComprobacion: userName,
        usuarioUltimaComprobacionId: userId,
        resultadoUltimaComprobacion: resultado.trim(),
        observacionesRenovacion: observaciones.trim() || undefined,
        historial: [...(poliza.historial || []), historialItem],
        updatedAt: nowIso,
        diasRestantes,
        nivelAlertaActual: diasRestantes <= 15 ? 15 : diasRestantes <= 30 ? 30 : diasRestantes <= 45 ? 45 : diasRestantes <= 60 ? 60 : undefined,
      };

      // Si se marca como NO_RENOVADA o SUSTITUIDA, actualizar estado principal si no es ya
      if (estadoRenovacion === 'NO_RENOVADA' || estadoRenovacion === 'SUSTITUIDA' || estadoRenovacion === 'CANCELADA') {
        // No cambiar estado VIGENTE automáticamente, dejar al usuario decidir si quiere marcar VENCIDA
        // Pero si ya vencida, mantener
      }

      await onSave(polizaActualizada);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || 'Error al guardar comprobación');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Comprobar Renovación</h2>
              <p className="text-xs text-slate-300">
                {poliza.aseguradora} · Nº {poliza.numeroPoliza} · Vto {new Date(poliza.fechaVencimiento).toLocaleDateString('es-ES')} ({diasRestantes} días)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
            <div className="flex items-center gap-1.5 font-bold mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Acción requerida
            </div>
            <p>
              Registra la comprobación de renovación de esta póliza. Esta acción quedará trazada en el historial con fecha, usuario, resultado y observaciones. No modifica automáticamente datos patrimoniales críticos.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Estado de Renovación *</label>
            <select
              value={estadoRenovacion}
              onChange={(e) => setEstadoRenovacion(e.target.value as EstadoRenovacionPoliza)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
            >
              {Object.entries(ESTADO_RENOVACION_LABELS).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label} — {val.descripcion}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Resultado de la Comprobación *</label>
            <input
              type="text"
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
              placeholder="Ej: Contactado con Mapfre, condiciones recibidas, pendiente de decisión..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Observaciones</label>
            <textarea
              rows={3}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Detalles adicionales, teléfono de contacto, referencia de carta, etc."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
            />
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Usuario que comprueba:</span>
              <span className="font-semibold text-slate-800 flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                {currentUser?.nombre || 'Usuario actual'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Fecha comprobación:</span>
              <span className="font-semibold text-slate-800">{new Date().toLocaleString('es-ES')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Días restantes:</span>
              <span className="font-bold text-slate-900">{diasRestantes} días</span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl"
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Registrar Comprobación
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
