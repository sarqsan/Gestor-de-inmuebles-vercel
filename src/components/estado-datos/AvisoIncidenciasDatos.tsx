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
 *
 * CAPACIDADES ADICIONALES (2026-10-01 · Carteras)
 * ---------------------------------------------------------------------------
 * Una lectura de CAPACIDAD (`alcance === 'CAPACIDAD'`, hoy `gestiones_cartera`)
 * NO es carga de datos del Portal. Su fallo se sigue registrando en el canal —el
 * diagnóstico técnico no se oculta— pero se presenta en un aviso ESPECÍFICO con
 * su propio «Reintentar lectura», y jamás se resume en el título global «No se
 * han podido leer algunos datos» ni ocupa el lugar de los datos del usuario.
 */
import React, { useMemo } from 'react';
import { AlertTriangle, Info, RefreshCw, X } from 'lucide-react';

import { partirIncidenciasPorAlcance } from '../../estadoDatos/canalIncidencias';
import type { IncidenciaDatos, OrigenDatos } from '../../estadoDatos/canalIncidencias';

export interface AvisoIncidenciasDatosProps {
  incidencias: readonly IncidenciaDatos[];
  /** Reintento de lectura de los datos del Portal (re-crea las suscripciones). */
  onReintentar?: () => void;
  /**
   * Reintento de UNA capacidad adicional: limpia su aviso y vuelve a ejecutar SÓLO
   * su lectura. Sin esto, una capacidad no tiene forma de reintentarse.
   */
  onReintentarCapacidad?: (origen: OrigenDatos) => void;
  onDescartar: (id: string) => void;
  onDescartarTodas: () => void;
  /** Orígenes rastreados como lectura por el host (para saber si «Reintentar» aplica). */
  origenesLectura?: readonly OrigenDatos[];
}

/**
 * Agrupa las incidencias: guardado, lectura PRIMARIA (datos del Portal) y
 * capacidades adicionales. `lectura` excluye deliberadamente las capacidades:
 * el resumen global sólo habla de los datos del Portal.
 */
export function agruparIncidencias(incidencias: readonly IncidenciaDatos[]) {
  const { datos, capacidades } = partirIncidenciasPorAlcance(incidencias);
  const guardado = datos.filter((i) => i.tipo === 'GUARDADO');
  const lectura = datos.filter((i) => i.tipo === 'LECTURA');
  return { guardado, lectura, capacidad: capacidades };
}

/** Texto del aviso global, sin detalles técnicos (UX-2 §10). Nunca incluye capacidades. */
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

// ─────────────────────────────────────────── aviso específico de una capacidad

/**
 * Títulos específicos por capacidad. El de Carteras dice EXACTAMENTE qué no se
 * pudo leer (carteras y delegaciones), para no confundirlo con la carga general.
 */
const TITULO_CAPACIDAD: Record<string, string> = {
  gestiones_cartera: 'Carteras: no se han podido leer tus carteras ni delegaciones',
};

export function tituloCapacidadAdicional(incidencia: IncidenciaDatos): string {
  return TITULO_CAPACIDAD[incidencia.origen] ?? `${incidencia.etiqueta}: no se pudo leer esta capacidad`;
}

export function detalleCapacidadAdicional(incidencia: IncidenciaDatos): string {
  return (
    `${incidencia.mensaje} Es una capacidad adicional: el resto del Portal sigue funcionando ` +
    `con tus inmuebles, titulares y demás datos. Puedes reintentar su lectura cuando quieras; ` +
    `el detalle técnico queda registrado para el diagnóstico.`
  );
}

const AvisoCapacidadAdicional: React.FC<{
  incidencia: IncidenciaDatos;
  onReintentar?: (origen: OrigenDatos) => void;
  onDescartar: (id: string) => void;
}> = ({ incidencia, onReintentar, onDescartar }) => (
  <div
    className="mx-4 sm:mx-6 lg:mx-8 mt-3 bg-sky-50 border border-sky-200 rounded-2xl p-3.5 flex items-start gap-3"
    role="status"
    aria-live="polite"
    data-testid="aviso-capacidad-adicional"
    data-origen={incidencia.origen}
  >
    <div className="w-8 h-8 rounded-xl bg-sky-100 border border-sky-200 flex items-center justify-center shrink-0">
      <Info className="w-4 h-4 text-sky-700" />
    </div>

    <div className="min-w-0 flex-1">
      <p className="text-xs font-bold text-sky-900">{tituloCapacidadAdicional(incidencia)}</p>
      <p className="text-[11px] text-sky-900/90 mt-1 leading-relaxed">{detalleCapacidadAdicional(incidencia)}</p>
      {incidencia.detalle && (
        <p className="text-[11px] text-sky-950 mt-1.5 leading-relaxed font-medium" data-testid="aviso-capacidad-causa">
          {incidencia.detalle}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        {onReintentar && (
          <button
            type="button"
            onClick={() => onReintentar(incidencia.origen)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-sky-300 text-sky-900 rounded-lg text-[11px] font-bold hover:bg-sky-100 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" /> Reintentar lectura
          </button>
        )}
        <button
          type="button"
          onClick={() => onDescartar(incidencia.id)}
          className="ml-auto shrink-0 text-sky-700 hover:text-sky-900 cursor-pointer"
          title="Descartar este aviso"
          aria-label={`Descartar aviso de ${incidencia.etiqueta}`}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  </div>
);

export const AvisoIncidenciasDatos: React.FC<AvisoIncidenciasDatosProps> = ({
  incidencias,
  onReintentar,
  onReintentarCapacidad,
  onDescartar,
  onDescartarTodas,
}) => {
  const { guardado, lectura, capacidad } = useMemo(() => agruparIncidencias(incidencias), [incidencias]);
  const datos = useMemo(() => [...guardado, ...lectura], [guardado, lectura]);

  if (incidencias.length === 0) return null;

  return (
    <>
      {/* Aviso de los DATOS del Portal: nunca se alimenta con capacidades adicionales. */}
      {datos.length > 0 && (
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

            <ul className="mt-2 space-y-1">
              {datos.map((incidencia) => (
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
      )}

      {/* Aviso ESPECÍFICO de cada capacidad adicional: no es un error de carga. */}
      {capacidad.map((incidencia) => (
        <AvisoCapacidadAdicional
          key={incidencia.id}
          incidencia={incidencia}
          onReintentar={onReintentarCapacidad}
          onDescartar={onDescartar}
        />
      ))}
    </>
  );
};
