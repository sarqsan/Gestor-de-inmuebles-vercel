/**
 * BLOQUE 10 · UX-3 — HOST VISUAL DE AVISOS DE OPERACIÓN.
 *
 * Una sola región para toda la aplicación: éxito (verde, se cierra solo), error
 * (rojo, permanece hasta descartarlo) e informativos. Sustituye los avisos locales
 * improvisados y los `window.alert`.
 */
import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

import {
  MS_AUTOCIERRE,
  avisosOperacion,
  descartarAvisoOperacion,
  suscribirAvisosOperacion,
} from '../../feedback/canalFeedback';
import type { AvisoOperacion as Aviso, TipoAvisoOperacion } from '../../feedback/canalFeedback';

const ESTILOS: Record<TipoAvisoOperacion, { contenedor: string; icono: React.ReactNode }> = {
  exito: {
    contenedor: 'bg-emerald-50 border-emerald-300 text-emerald-900',
    icono: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
  },
  error: {
    contenedor: 'bg-rose-50 border-rose-300 text-rose-900',
    icono: <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />,
  },
  info: {
    contenedor: 'bg-blue-50 border-blue-300 text-blue-900',
    icono: <Info className="w-4 h-4 text-blue-600 shrink-0" />,
  },
};

export const AvisoTarjeta: React.FC<{ aviso: Aviso; onDescartar: (id: string) => void }> = ({
  aviso,
  onDescartar,
}) => {
  const estilo = ESTILOS[aviso.tipo];

  useEffect(() => {
    if (!aviso.autocierre) return;
    const t = setTimeout(() => onDescartar(aviso.id), MS_AUTOCIERRE);
    return () => clearTimeout(t);
  }, [aviso.id, aviso.autocierre, onDescartar]);

  return (
    <div
      className={`pointer-events-auto w-[min(92vw,26rem)] rounded-2xl border shadow-lg px-3.5 py-2.5 flex items-start gap-2.5 ${estilo.contenedor}`}
      role={aviso.tipo === 'error' ? 'alert' : 'status'}
      aria-live={aviso.tipo === 'error' ? 'assertive' : 'polite'}
      data-testid={`aviso-operacion-${aviso.tipo}`}
    >
      {estilo.icono}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold leading-snug">{aviso.mensaje}</p>
        {aviso.detalle && <p className="text-[11px] mt-0.5 opacity-90 leading-snug">{aviso.detalle}</p>}
      </div>
      <button
        type="button"
        onClick={() => onDescartar(aviso.id)}
        className="shrink-0 opacity-70 hover:opacity-100 cursor-pointer"
        aria-label={`Descartar aviso: ${aviso.mensaje}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

/**
 * Región fija de avisos. En móvil se sitúa por encima de la barra de navegación
 * inferior para no taparla.
 */
export const AvisosOperacion: React.FC = () => {
  const [avisos, setAvisos] = useState<readonly Aviso[]>(() => avisosOperacion());

  useEffect(() => suscribirAvisosOperacion(() => setAvisos(avisosOperacion())), []);

  if (avisos.length === 0) return null;

  return (
    <div
      className="fixed z-[60] right-3 left-3 sm:left-auto bottom-20 md:bottom-4 flex flex-col items-end gap-2 pointer-events-none"
      data-testid="avisos-operacion"
      aria-label="Avisos de la aplicación"
    >
      {avisos.map((aviso) => (
        <AvisoTarjeta key={aviso.id} aviso={aviso} onDescartar={descartarAvisoOperacion} />
      ))}
    </div>
  );
};
