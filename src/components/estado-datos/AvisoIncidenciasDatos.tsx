/**
 * BLOQUE 10 · UX-2 — AVISO DE INCIDENCIAS DE DATOS (shell).
 *
 * Hace visibles los fallos que antes sólo existían en la consola (UX-2 C2/C3):
 *  - LECTURA: la lectura falló (si la pantalla ya tenía datos, se conservan).
 *  - GUARDADO: la persistencia falló → **no** se presenta como guardado.
 *
 * Deliberadamente es un aviso informativo no bloqueante (no es el sistema de
 * feedback de operaciones de UX-3: no emite mensajes de éxito, no sustituye
 * `window.confirm` y no anuncia operaciones correctas).
 */
import React, { useMemo } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

import type { IncidenciaDatos, OrigenDatos } from '../../estadoDatos/canalIncidencias';

export interface AvisoIncidenciasDatosProps {
  incidencias: readonly IncidenciaDatos[];
  /** Reintento de lectura (re-crea las suscripciones). */
  onReintentar?: () => void;
  onDescartar: (id: string) => void;
  onDescartarTodas: () => void;
  /** Orígenes rastreados como lectura por el host (para saber si «Reintentar» aplica). */
  origenesLectura?: readonly OrigenDatos[];
}

/** Agrupa por tipo para no multiplicar avisos equivalentes. */
export function agruparIncidencias(incidencias: readonly IncidenciaDatos[]) {
  const guardado = incidencias.filter((i) => i.tipo === 'GUARDADO');
  const lectura = incidencias.filter((i) => i.tipo === 'LECTURA');
  return { guardado, lectura };
}

/** Texto del aviso, sin detalles técnicos (UX-2 §10). */
export function tituloAviso(incidencias: readonly IncidenciaDatos[]): string {
  const { guardado, lectura } = agruparIncidencias(incidencias);
  if (guardado.length > 0 && lectura.length > 0) return 'Hay cambios sin guardar y datos que no se pudieron leer';
  if (guardado.length > 0) return 'Hay cambios que no se han podido guardar';
  return 'No se han podido leer algunos datos';
}

export function detalleAviso(incidencias: readonly IncidenciaDatos[]): string {
  const { guardado, lectura } = agruparIncidencias(incidencias);
  const partes: string[] = [];
  if (guardado.length > 0) {
    partes.push(
      `No se guardaron cambios en: ${guardado.map((i) => i.etiqueta).join(', ')}. Vuelve a intentar la operación; lo que ves en pantalla puede no coincidir con lo guardado.`
    );
  }
  if (lectura.length > 0) {
    partes.push(`Falló la lectura de: ${lectura.map((i) => i.etiqueta).join(', ')}.`);
  }
  return partes.join(' ');
}

export const AvisoIncidenciasDatos: React.FC<AvisoIncidenciasDatosProps> = ({
  incidencias,
  onReintentar,
  onDescartar,
  onDescartarTodas,
}) => {
  const { guardado, lectura } = useMemo(() => agruparIncidencias(incidencias), [incidencias]);
  if (incidencias.length === 0) return null;

  return (
    <div
      className="mx-4 sm:mx-6 lg:mx-8 mt-3 bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex items-start gap-3"
      role="alert"
      aria-live="assertive"
      data-testid="aviso-incidencias-datos"
    >
      <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
        <AlertTriangle className="w-4 h-4 text-amber-700" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-amber-900">{tituloAviso(incidencias)}</p>
        <p className="text-[11px] text-amber-900/90 mt-1 leading-relaxed">{detalleAviso(incidencias)}</p>

        {(guardado.length > 0 || lectura.length > 0) && (
          <ul className="mt-2 space-y-1">
            {incidencias.map((incidencia) => (
              <li key={incidencia.id} className="text-[11px] text-amber-900/90 flex items-start gap-2">
                <span className="font-semibold">
                  {incidencia.tipo === 'GUARDADO' ? 'Guardado' : 'Lectura'} · {incidencia.etiqueta}:
                </span>
                <span className="min-w-0">{incidencia.mensaje}</span>
                <button
                  type="button"
                  onClick={() => onDescartar(incidencia.id)}
                  className="ml-auto shrink-0 text-amber-700 hover:text-amber-900 cursor-pointer"
                  title="Descartar este aviso"
                  aria-label={`Descartar aviso de ${incidencia.etiqueta}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2.5 flex items-center gap-2">
          {lectura.length > 0 && onReintentar && (
            <button
              type="button"
              onClick={onReintentar}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-amber-300 text-amber-900 rounded-lg text-[11px] font-bold hover:bg-amber-100 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Reintentar lectura
            </button>
          )}
          <button
            type="button"
            onClick={onDescartarTodas}
            className="px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:text-amber-950 cursor-pointer"
          >
            Descartar avisos
          </button>
        </div>
      </div>
    </div>
  );
};
