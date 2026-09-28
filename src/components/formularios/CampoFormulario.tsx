/**
 * BLOQUE 10 · UX-4 — PIEZAS DE FORMULARIO CON ERROR JUNTO AL CAMPO.
 *
 * Se usan en los formularios de uso intensivo. Mantienen las clases visuales del ERP
 * y añaden: obligatoriedad indicada en la etiqueta, `aria-invalid`, `aria-describedby`
 * y el mensaje del campo justo debajo (no al final de la pantalla).
 */
import React from 'react';
import { AlertCircle } from 'lucide-react';

export const CLASE_ENTRADA_BASE =
  'w-full px-3.5 py-2 bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 text-sm transition-colors';

export function claseEntrada(error?: string, foco: 'blue' | 'amber' | 'emerald' = 'blue'): string {
  const color = error
    ? 'border-rose-400 focus:ring-rose-500/30 focus:border-rose-500 bg-rose-50/40'
    : `border-slate-200 focus:ring-${foco}-500/30 focus:border-${foco}-500`;
  return `${CLASE_ENTRADA_BASE} ${color}`;
}

export const EtiquetaCampo: React.FC<{
  htmlFor?: string;
  children: React.ReactNode;
  obligatorio?: boolean;
  className?: string;
}> = ({ htmlFor, children, obligatorio, className = 'block font-semibold text-slate-700 mb-1' }) => (
  <label htmlFor={htmlFor} className={className}>
    {children}
    {obligatorio && (
      <>
        {' '}
        <span className="text-rose-600" aria-hidden="true">
          *
        </span>
        <span className="sr-only"> (obligatorio)</span>
      </>
    )}
  </label>
);

/** Mensaje de error del campo, junto al control. */
export const ErrorCampo: React.FC<{ id?: string; mensaje?: string }> = ({ id, mensaje }) => {
  if (!mensaje) return null;
  return (
    <p
      id={id}
      role="alert"
      data-testid="error-campo"
      className="mt-1 flex items-start gap-1 text-[11px] font-semibold text-rose-700"
    >
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
      <span>{mensaje}</span>
    </p>
  );
};

/** Resumen opcional para formularios largos (además de los errores por campo). */
export const ResumenErrores: React.FC<{ mensaje?: string }> = ({ mensaje }) => {
  if (!mensaje) return null;
  return (
    <div
      role="alert"
      data-testid="resumen-errores"
      className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium flex items-start gap-2"
    >
      <AlertCircle className="w-4 h-4 shrink-0 mt-[1px]" />
      <span>{mensaje}</span>
    </div>
  );
};
