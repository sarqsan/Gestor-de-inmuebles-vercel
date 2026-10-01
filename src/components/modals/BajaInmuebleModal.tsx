/**
 * BAJA PATRIMONIAL DEL INMUEBLE — CONFIRMACIÓN
 * ============================================
 * Sustituye a la confirmación de "eliminar inmueble". Deja explícito, antes de
 * ejecutar la operación, lo que el modelo patrimonial exige:
 *  · el inmueble deja de estar activo/visible como inmueble operativo;
 *  · sus datos históricos (titularidades, contratos, gastos, documentos…) se conservan;
 *  · NO se realiza un borrado físico.
 *
 * El motivo y la fecha son los del motor patrimonial existente
 * (`MotivoBajaPatrimonial`), no un catálogo paralelo. La confirmación sólo se
 * cierra cuando la baja quedó PERSISTIDA: si Firestore la rechaza, el error se
 * muestra aquí y el inmueble sigue intacto en la interfaz (se puede reintentar).
 */
import React, { useEffect, useState } from 'react';
import { Archive, AlertTriangle, X } from 'lucide-react';
import { useDialogoAccesible } from '../../accesibilidad/dialogo';
import type { Inmueble, MotivoBajaPatrimonial } from '../../types';
import type { SolicitudBaja } from '../../utils/cicloPatrimonialEngine';
import { MOTIVOS_BAJA_PATRIMONIAL } from '../../utils/bajaPatrimonialInmueble';

interface BajaInmuebleModalProps {
  isOpen: boolean;
  inmueble: Inmueble | null;
  /**
   * Ejecuta la baja. Devuelve `true` sólo si quedó persistida. Si devuelve
   * `false`, el diálogo permanece abierto con el motivo del fallo.
   */
  onConfirm: (solicitud: SolicitudBaja) => Promise<boolean>;
  onCancel: () => void;
}

const hoy = () => new Date().toISOString().slice(0, 10);

export const BajaInmuebleModal: React.FC<BajaInmuebleModalProps> = ({ isOpen, inmueble, onConfirm, onCancel }) => {
  const [motivo, setMotivo] = useState<MotivoBajaPatrimonial>('VENTA');
  const [fecha, setFecha] = useState<string>(hoy());
  const [detalle, setDetalle] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada inmueble se confirma con su propio formulario limpio.
  useEffect(() => {
    if (!isOpen) return;
    setMotivo('VENTA');
    setFecha(hoy());
    setDetalle('');
    setError(null);
    setEnviando(false);
  }, [isOpen, inmueble?.id]);

  const dialogo = useDialogoAccesible(
    { abierto: isOpen, onCerrar: enviando ? undefined : onCancel, cerrableConEscape: !enviando },
    'Confirmar baja patrimonial',
  );

  if (!isOpen || !inmueble) return null;

  const confirmar = async () => {
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const ok = await onConfirm({
        fecha,
        motivo,
        detalle: detalle.trim() || undefined,
      });
      if (ok) {
        onCancel();
        return;
      }
      setError('No se pudo registrar la baja del inmueble. No se ha cambiado nada: puedes reintentarlo.');
    } catch {
      setError('No se pudo registrar la baja del inmueble. No se ha cambiado nada: puedes reintentarlo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150">
      <div
        ref={dialogo.refDialogo}
        {...dialogo.propsDialogo}
        className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
      >
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-amber-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
              <Archive className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Dar de baja el inmueble</h3>
          </div>
          <button
            aria-label="Cerrar"
            onClick={onCancel}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Vas a dar de baja <strong>{inmueble.direccion}</strong>
            {inmueble.ciudad ? ` (${inmueble.ciudad})` : ''}. Dejará de estar activo y visible como inmueble
            operativo, y se retirará su publicación.
          </p>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-800 leading-relaxed">
            <strong>No se borra nada.</strong> Se conservan el inmueble, sus titularidades, propietarios, contratos,
            ingresos, gastos, documentos, incidencias, suministros y todo su histórico, que seguirá consultable.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <span className="text-[11px] font-bold text-slate-700">Motivo de la baja</span>
              <select
                value={motivo}
                onChange={(e) => setMotivo(e.target.value as MotivoBajaPatrimonial)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {MOTIVOS_BAJA_PATRIMONIAL.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 block">
              <span className="text-[11px] font-bold text-slate-700">Fecha efectiva</span>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>

          <label className="space-y-1 block">
            <span className="text-[11px] font-bold text-slate-700">Detalle (opcional)</span>
            <textarea
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              rows={2}
              placeholder="Escritura, expediente, observaciones…"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={enviando}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={enviando || !fecha}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Archive className="w-4 h-4" />
              {enviando ? 'Registrando baja…' : 'Sí, dar de baja'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
