/**
 * P0.1.7 — Etiqueta visible y consistente para funciones simuladas/pendientes.
 * No añade funcionalidad: evita que una acción parezca un resultado real.
 * El contenido sale del inventario único `inventarioSimulaciones.ts`.
 */
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { simulacionPorId, TEXTO_INSIGNIA } from '../../lib/inventarioSimulaciones';

export interface PropsEtiquetaSimulacion {
  /** ID del inventario; si no existe se muestra un mensaje genérico seguro. */
  id: string;
  /** Variante de una línea para cabeceras de panel. */
  compacto?: boolean;
}

export function EtiquetaSimulacion({ id, compacto = false }: PropsEtiquetaSimulacion) {
  const simulacion = simulacionPorId(id);
  const mensaje = simulacion?.mensaje
    ?? 'Función no operativa: no produce ningún resultado real ni confirma ninguna operación.';

  return (
    <div
      role="note"
      data-testid="etiqueta-simulacion"
      data-simulacion={id}
      className={`flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 ${
        compacto ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2.5 text-xs'
      }`}
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
      <span>
        <strong className="font-bold uppercase tracking-wide">{TEXTO_INSIGNIA}</strong>
        <span className="mx-1.5 text-amber-400" aria-hidden="true">·</span>
        {mensaje}
      </span>
    </div>
  );
}

export default EtiquetaSimulacion;
