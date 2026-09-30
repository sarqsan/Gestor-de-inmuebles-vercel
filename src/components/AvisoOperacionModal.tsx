import React from 'react';
import { CheckCircle2, Info, ShieldAlert, X } from 'lucide-react';

/**
 * AVISO DE OPERACIÓN
 * ==================
 * BLOQUE 1 — Portal Propietario: el resultado de una operación SIEMPRE se comunica.
 *
 * Hasta ahora, cuando Firestore rechazaba una escritura (`permission-denied`,
 * caída de red, validación…), el servicio hacía `console.error` y seguía: la UI
 * confirmaba la operación y el usuario se quedaba con una mentira en pantalla.
 *
 * Este componente es la salida visible exigida en el BLOQUE 1:
 *   · error  → motivo comprensible + qué ha pasado con sus datos.
 *   · aviso  → operación guardada pero con efectos secundarios incompletos.
 *   · éxito  → confirmación explícita de que SÍ se ha persistido.
 */

export type TipoAvisoOperacion = 'error' | 'aviso' | 'exito';

export interface AvisoOperacion {
  tipo: TipoAvisoOperacion;
  titulo: string;
  mensaje: string;
  /** Detalle técnico opcional (plegado) para soporte. */
  detalle?: string;
}

interface AvisoOperacionModalProps {
  aviso: AvisoOperacion | null;
  onClose: () => void;
}

const ESTILOS: Record<
  TipoAvisoOperacion,
  { cabecera: string; icono: string; borde: string; boton: string; iconoNode: React.ReactNode }
> = {
  error: {
    cabecera: 'bg-rose-50',
    icono: 'bg-rose-100 text-rose-600',
    borde: 'border-rose-100',
    boton: 'bg-rose-600 hover:bg-rose-700',
    iconoNode: <ShieldAlert className="w-5 h-5" />,
  },
  aviso: {
    cabecera: 'bg-amber-50',
    icono: 'bg-amber-100 text-amber-600',
    borde: 'border-amber-100',
    boton: 'bg-amber-600 hover:bg-amber-700',
    iconoNode: <Info className="w-5 h-5" />,
  },
  exito: {
    cabecera: 'bg-emerald-50',
    icono: 'bg-emerald-100 text-emerald-600',
    borde: 'border-emerald-100',
    boton: 'bg-emerald-600 hover:bg-emerald-700',
    iconoNode: <CheckCircle2 className="w-5 h-5" />,
  },
};

export const AvisoOperacionModal: React.FC<AvisoOperacionModalProps> = ({ aviso, onClose }) => {
  if (!aviso) return null;

  const estilo = ESTILOS[aviso.tipo] ?? ESTILOS.error;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150">
      <div
        className={`bg-white rounded-2xl shadow-2xl border ${estilo.borde} w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150`}
        role="alertdialog"
        aria-modal="true"
      >
        <div className={`p-5 border-b ${estilo.borde} flex items-center justify-between ${estilo.cabecera}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${estilo.icono}`}>{estilo.iconoNode}</div>
            <h3 className="font-bold text-slate-900 text-base">{aviso.titulo}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar aviso"
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p
            className="text-sm text-slate-700 leading-relaxed"
            data-testid="aviso-operacion-mensaje"
          >
            {aviso.mensaje}
          </p>

          {aviso.detalle ? (
            <details className="pt-2 border-t border-slate-100">
              <summary className="cursor-pointer text-[11px] font-semibold text-slate-500 hover:text-slate-700 select-none">
                Detalle técnico (para soporte)
              </summary>
              <pre className="mt-2 p-3 bg-slate-50 rounded-lg text-[10px] text-slate-600 whitespace-pre-wrap break-words max-h-40 overflow-auto">
                {aviso.detalle}
              </pre>
            </details>
          ) : null}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-white font-bold text-xs rounded-xl shadow-md transition-all ${estilo.boton}`}
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AvisoOperacionModal;
