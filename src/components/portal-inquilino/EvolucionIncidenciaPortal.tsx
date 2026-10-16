/**
 * FASE 6 — EVOLUCIÓN DE LA INCIDENCIA (portal del inquilino)
 * =========================================================
 * Muestra el hilo de seguimiento que sirve el SERVIDOR (autorizado por token) y
 * el estado real de los avisos. No inventa pasos: si el servidor no responde o
 * no autoriza, la sección lo dice y no pinta nada más. El inquilino puede pedir
 * la derivación a gestión (Fase 5/6): el servidor decide a quién avisa.
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, BellRing, History, Loader2, Send } from 'lucide-react';
import type { PasoEvolucionIncidencia } from '../../seguimiento/incidencias';
import { leerSeguimientoIncidencia, sincronizarSeguimientoIncidencia } from '../../lib/seguimientoIncidencias';

interface Props {
  incidenciaId: string;
}

type Estado = 'CARGANDO' | 'LISTO' | 'VACIO' | 'ERROR';

export const EvolucionIncidenciaPortal: React.FC<Props> = ({ incidenciaId }) => {
  const [estado, setEstado] = useState<Estado>('CARGANDO');
  const [pasos, setPasos] = useState<PasoEvolucionIncidencia[]>([]);
  const [error, setError] = useState('');
  const [derivada, setDerivada] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargar = async (): Promise<void> => {
    const resultado = await leerSeguimientoIncidencia(incidenciaId);
    if (!resultado.ok) {
      setError(resultado.error ?? 'No se ha podido consultar la evolución.');
      setEstado('ERROR');
      return;
    }
    const nuevos = resultado.pasos ?? [];
    setPasos(nuevos);
    setEstado(nuevos.length > 0 ? 'LISTO' : 'VACIO');
  };

  useEffect(() => {
    void cargar();
    // El id es la única dependencia: la evolución se relee si cambia la incidencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidenciaId]);

  const derivar = async (): Promise<void> => {
    setEnviando(true);
    const resultado = await sincronizarSeguimientoIncidencia(incidenciaId, { derivacionSolicitada: true });
    setEnviando(false);
    if (resultado.ok) {
      setDerivada(true);
      await cargar();
    } else {
      setError(resultado.error ?? 'No se ha podido solicitar la derivación.');
      setEstado('ERROR');
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3" data-testid="evolucion-incidencia">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        <History className="w-3.5 h-3.5" /> Evolución
      </p>

      {estado === 'CARGANDO' && (
        <p role="status" className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando evolución…
        </p>
      )}

      {estado === 'ERROR' && (
        <p role="alert" className="mt-1.5 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          {error}
        </p>
      )}

      {estado === 'VACIO' && (
        <p className="mt-1.5 text-[11px] text-slate-500">Todavía no hay eventos de seguimiento registrados.</p>
      )}

      {estado === 'LISTO' && (
        <ol className="mt-1.5 space-y-1.5 border-l-2 border-indigo-100 ml-1 pl-3">
          {pasos.map((paso) => (
            <li key={paso.id} className="text-xs">
              <span className="font-bold">
                {paso.requiereAtencion && <AlertTriangle className="w-3 h-3 inline text-amber-600 mr-1" />}
                {paso.etiqueta}
              </span>{' '}
              <span className="text-slate-500">{new Date(paso.fecha).toLocaleDateString('es-ES')}</span>
              {paso.detalle && <span className="block text-slate-600">{paso.detalle}</span>}
              {paso.notificacion && (
                <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-slate-500">
                  <BellRing className="w-3 h-3" /> {paso.notificacion}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {!derivada ? (
        <button
          type="button"
          disabled={enviando}
          onClick={() => void derivar()}
          className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-800 border border-indigo-200 bg-white hover:bg-indigo-50 disabled:opacity-50 rounded-xl px-2.5 py-1.5"
        >
          <Send className="w-3 h-3" /> {enviando ? 'Solicitando…' : 'Pedir seguimiento a gestión'}
        </button>
      ) : (
        <p className="mt-2 text-[11px] font-bold text-emerald-700">Seguimiento solicitado a gestión.</p>
      )}
    </div>
  );
};
