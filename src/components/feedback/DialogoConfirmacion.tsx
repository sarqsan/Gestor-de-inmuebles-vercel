/**
 * BLOQUE 10 · UX-3 — DIÁLOGO DE CONFIRMACIÓN DE LA APLICACIÓN.
 *
 * Sustituye a `window.confirm` / `window.prompt`. Mientras la operación confirmada
 * se ejecuta, el diálogo queda bloqueado en estado «ejecutando» (no se puede repetir
 * la pulsación) y, si falla, permanece abierto con el motivo.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import {
  aceptarConfirmacion,
  cancelarConfirmacion,
  peticionConfirmacion,
  registrarHostConfirmacion,
  suscribirConfirmacion,
} from '../../feedback/confirmacion';
import type { EstadoDialogoConfirmacion } from '../../feedback/confirmacion';

export const DialogoConfirmacion: React.FC<{ dialogo: EstadoDialogoConfirmacion | null }> = ({ dialogo }) => {
  const [texto, setTexto] = useState('');
  const botonConfirmar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTexto(dialogo?.entradaTexto?.valorInicial ?? '');
    if (dialogo && !dialogo.entradaTexto) botonConfirmar.current?.focus();
  }, [dialogo?.id, dialogo?.entradaTexto]);

  useEffect(() => {
    if (!dialogo) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dialogo.ejecutando) cancelarConfirmacion();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [dialogo]);

  if (!dialogo) return null;

  const peligroso = dialogo.peligroso !== false;
  const etiquetaConfirmar = dialogo.etiquetaConfirmar ?? (peligroso ? 'Eliminar' : 'Confirmar');
  const etiquetaEjecutando = dialogo.etiquetaEjecutando ?? 'Procesando…';

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-confirmacion"
      data-testid="dialogo-confirmacion"
    >
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
              peligroso ? 'bg-rose-50 border-rose-200' : 'bg-blue-50 border-blue-200'
            }`}
          >
            <AlertTriangle className={`w-4 h-4 ${peligroso ? 'text-rose-600' : 'text-blue-600'}`} />
          </div>
          <div className="min-w-0">
            <h3 id="titulo-confirmacion" className="text-sm font-bold text-slate-900">
              {dialogo.titulo}
            </h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">{dialogo.mensaje}</p>
            {dialogo.detalle && (
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{dialogo.detalle}</p>
            )}
          </div>
        </div>

        {dialogo.entradaTexto && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="entrada-confirmacion">
              {dialogo.entradaTexto.etiqueta}
              {dialogo.entradaTexto.obligatorio ? ' *' : ''}
            </label>
            <input
              id="entrada-confirmacion"
              autoFocus
              type="text"
              value={texto}
              placeholder={dialogo.entradaTexto.marcador}
              disabled={dialogo.ejecutando}
              onChange={(e) => setTexto(e.target.value)}
              aria-invalid={Boolean(dialogo.error)}
              aria-required={dialogo.entradaTexto.obligatorio ? true : undefined}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none disabled:bg-slate-50"
            />
          </div>
        )}

        {dialogo.error && (
          <p className="text-[11px] font-semibold text-rose-700" role="alert" data-testid="error-confirmacion">
            {dialogo.error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={cancelarConfirmacion}
            disabled={dialogo.ejecutando}
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {dialogo.etiquetaCancelar ?? 'Cancelar'}
          </button>
          <button
            ref={botonConfirmar}
            type="button"
            onClick={() => void aceptarConfirmacion(texto)}
            disabled={dialogo.ejecutando}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white rounded-xl transition-colors disabled:opacity-70 cursor-pointer disabled:cursor-not-allowed ${
              peligroso ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {dialogo.ejecutando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {dialogo.ejecutando ? etiquetaEjecutando : etiquetaConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Host: registra el diálogo y refleja la petición vigente. */
export const HostConfirmacion: React.FC = () => {
  const [dialogo, setDialogo] = useState<EstadoDialogoConfirmacion | null>(() => peticionConfirmacion());

  useEffect(() => {
    const bajaHost = registrarHostConfirmacion();
    const bajaSuscripcion = suscribirConfirmacion(() => setDialogo(peticionConfirmacion()));
    return () => {
      bajaSuscripcion();
      bajaHost();
    };
  }, []);

  return <DialogoConfirmacion dialogo={dialogo} />;
};
