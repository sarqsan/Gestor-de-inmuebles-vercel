/**
 * BLOQUE 10 · UX-2 — ESTADOS DE PANTALLA POR DATOS.
 *
 * Tres estados, nunca confundidos (UX-2 §5):
 *  - CARGANDO: la lectura no ha terminado → se muestra carga, **no** «sin datos».
 *  - ERROR: la lectura falló → mensaje accionable + «Reintentar» (lectura real).
 *  - (LISTO con cero elementos lo resuelve el estado vacío propio de cada sección.)
 *
 * Reutiliza el lenguaje visual ya existente en el ERP (tarjeta blanca redondeada,
 * spinner azul, tono ámbar para avisos). No introduce diseño nuevo innecesario.
 */
import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { etiquetaOrigen, incidenciasDatos } from '../../estadoDatos/canalIncidencias';
import type { EstadoDatosPantalla as EstadoDatos, OrigenDatos } from '../../estadoDatos/canalIncidencias';

export const CargandoDatosPantalla: React.FC<{ etiqueta?: string }> = ({ etiqueta }) => (
  <div
    className="flex flex-col items-center justify-center py-16 text-center"
    role="status"
    aria-live="polite"
    data-testid="estado-cargando"
  >
    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-3">
      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
    <p className="text-sm font-semibold text-slate-700">Cargando datos…</p>
    <p className="text-xs text-slate-500 mt-1">
      {etiqueta ? `Consultando ${etiqueta}.` : 'Consultando la información de esta pantalla.'}
    </p>
    <p className="text-[11px] text-slate-400 mt-2">Todavía no podemos confirmar si hay o no hay registros.</p>
  </div>
);

/** Lista legible de orígenes para el mensaje de error (máximo 3 + «y N más»). */
export function listarOrigenes(origenes: readonly OrigenDatos[]): string {
  const etiquetas = origenes.map(etiquetaOrigen);
  if (etiquetas.length <= 3) return etiquetas.join(', ');
  return `${etiquetas.slice(0, 3).join(', ')} y ${etiquetas.length - 3} más`;
}

export const ErrorDatosPantalla: React.FC<{
  origen: readonly OrigenDatos[];
  mensaje?: string;
  onReintentar: () => void;
}> = ({ origen, mensaje, onReintentar }) => (
  <div
    className="bg-white rounded-2xl border border-amber-200 p-6 max-w-xl mx-auto my-8 text-center"
    role="alert"
    data-testid="estado-error"
  >
    <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-3">
      <AlertTriangle className="w-5 h-5 text-amber-600" />
    </div>
    <p className="text-sm font-bold text-slate-800">No se han podido cargar los datos</p>
    <p className="text-xs text-slate-600 mt-1">
      {mensaje ?? 'Ha fallado la lectura de la información necesaria para esta pantalla.'}
    </p>
    {origen.length > 0 && (
      <p className="text-[11px] text-slate-500 mt-1.5">Afecta a: {listarOrigenes(origen)}</p>
    )}
    <p className="text-[11px] text-slate-400 mt-1.5">
      No se muestra esta pantalla para no confundir «sin datos» con «no se pudieron leer los datos».
    </p>
    <button
      type="button"
      onClick={onReintentar}
      className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
    >
      <RefreshCw className="w-3.5 h-3.5" /> Reintentar
    </button>
  </div>
);

/**
 * Mensaje de usuario de la última incidencia de LECTURA que afecta a los orígenes
 * en error. Nunca contiene detalles técnicos: el código y el error originales se
 * quedan en la consola (registro técnico de la capa de datos).
 */
function mensajeDeError(origenes: readonly OrigenDatos[]): string | undefined {
  const incidencia = incidenciasDatos().find(
    (i) => i.tipo === 'LECTURA' && origenes.includes(i.origen)
  );
  return incidencia?.mensaje;
}

/**
 * Puerta de estado de datos: renderiza la sección sólo cuando sus lecturas
 * primarias están `LISTO`. Se usa desde el shell (App) para cada pantalla.
 */
export const PuertaEstadoDatos: React.FC<{
  estado: EstadoDatos;
  onReintentar: () => void;
  children: React.ReactNode;
}> = ({ estado, onReintentar, children }) => {
  if (estado.estado === 'LISTO') return <>{children}</>;
  if (estado.estado === 'ERROR') {
    return (
      <ErrorDatosPantalla
        origen={estado.conError}
        mensaje={mensajeDeError(estado.conError)}
        onReintentar={onReintentar}
      />
    );
  }
  return <CargandoDatosPantalla etiqueta={listarOrigenes(estado.pendientes)} />;
};
