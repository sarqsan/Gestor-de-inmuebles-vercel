import React from 'react';
import { AlertCircle, FileText } from 'lucide-react';
import type { Inmueble } from '../../types';
import { camposPendientesInmueble, rentaDeclaradaInmueble } from '../../lib/inmuebleCompletitud';
import { formatEuro } from '../../utils/formatters';

/**
 * Bloque de la ficha de un inmueble con información incompleta o declarada por
 * una importación. Sólo MUESTRA: no escribe nada ni rellena campos. Para
 * completar la información se usa el botón «Editar» de la propia ficha.
 *
 * Nunca muestra el DNI del inquilino declarado (dato personal que no hace falta
 * para revisar el alta).
 */
export const DatosPendientesInmueble: React.FC<{ inmueble: Inmueble }> = ({ inmueble }) => {
  const pendientes = camposPendientesInmueble(inmueble);
  const renta = rentaDeclaradaInmueble(inmueble);
  const inquilinoNombre = inmueble.inquilinoDeclarado?.nombre;
  const titularidadPendiente = Boolean(inmueble.titularidadDeclarada) && inmueble.titularidadDeclarada?.resuelta !== true;
  const origen = inmueble.datosImportadosHistoricos?.sourceFile;

  if (pendientes.length === 0 && renta === undefined && !inquilinoNombre && !titularidadPendiente) return null;

  return (
    <section
      aria-label="Datos pendientes e importados"
      className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-slate-800"
      data-testid="datos-pendientes-inmueble"
    >
      {pendientes.length > 0 && (
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
          <p>
            <strong>Pendiente de completar:</strong> {pendientes.join(', ')}.
            <span className="block text-xs text-slate-600 mt-0.5">
              Se completan desde «Editar». La importación no rellena datos que el archivo no trae.
            </span>
          </p>
        </div>
      )}
      {renta !== undefined && (
        <div className="flex items-start gap-2 mt-2">
          <FileText className="w-4 h-4 mt-0.5 text-slate-500 shrink-0" />
          <p>
            <strong>Renta declarada en la importación:</strong> {formatEuro(renta)} al mes.
            <span className="block text-xs text-slate-600 mt-0.5">
              Dato declarado por el archivo; no es el precio publicado ni acredita un contrato.
            </span>
          </p>
        </div>
      )}
      {inquilinoNombre && (
        <p className="mt-2 text-xs text-slate-700">
          <strong>Inquilino declarado en el archivo:</strong> {inquilinoNombre}. No acredita contrato ni arrendamiento.
        </p>
      )}
      {titularidadPendiente && (
        <p className="mt-2 text-xs text-slate-700">
          <strong>Titularidad declarada en el archivo:</strong> pendiente de confirmar con titulares existentes.
        </p>
      )}
      {origen && <p className="mt-2 text-[11px] text-slate-500">Origen: importación de «{origen}».</p>}
    </section>
  );
};

export default DatosPendientesInmueble;
