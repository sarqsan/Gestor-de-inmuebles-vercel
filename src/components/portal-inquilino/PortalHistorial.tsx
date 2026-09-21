/** BLOQUE E — Historial visible del inquilino (derivado de sus entidades). */
import React, { useMemo } from 'react';
import { FileText, Mail, Receipt, Wrench, Zap } from 'lucide-react';
import type {
  CambioTitularSuministro,
  ContratoFormalizacion,
  Incidencia,
  LecturaSuministro,
  MensajePortal,
  Suministro,
} from '../../types';
import { construirHistorialInquilino } from '../../inquilino/portalEngine';

interface Props {
  contrato: ContratoFormalizacion;
  incidencias: Incidencia[];
  mensajes: MensajePortal[];
  lecturas: LecturaSuministro[];
  cambios: CambioTitularSuministro[];
  suministros: Suministro[];
}

const ICONO: Record<string, React.ReactNode> = {
  CONTRATO: <FileText className="w-4 h-4" />,
  RECIBO: <Receipt className="w-4 h-4" />,
  INCIDENCIA: <Wrench className="w-4 h-4" />,
  SUMINISTRO: <Zap className="w-4 h-4" />,
  MENSAJE: <Mail className="w-4 h-4" />,
  DOCUMENTO: <FileText className="w-4 h-4" />,
};

export const PortalHistorial: React.FC<Props> = ({
  contrato, incidencias, mensajes, lecturas, cambios, suministros,
}) => {
  const items = useMemo(
    () =>
      construirHistorialInquilino({
        contratos: [contrato],
        incidencias,
        mensajes,
        lecturas,
        cambios,
        suministros,
        nombreSuministro: (id) => {
          const s = suministros.find((x) => x.id === id);
          if (!s) return id;
          const nombres: Record<string, string> = { LUZ: 'Luz', AGUA: 'Agua', GAS: 'Gas', INTERNET: 'Internet', OTRO: 'Suministro' };
          return nombres[s.tipo] || s.tipo;
        },
      }),
    [contrato, incidencias, mensajes, lecturas, cambios, suministros]
  );

  if (items.length === 0) {
    return <p className="text-center text-sm text-slate-500 py-10">Aún no hay actividad registrada.</p>;
  }

  return (
    <ol className="space-y-2">
      {items.map((it) => (
        <li key={it.id} className="flex gap-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5">
          <span className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            {ICONO[it.categoria] || ICONO.DOCUMENTO}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold leading-snug">{it.titulo}</p>
            {it.detalle && <p className="text-xs text-slate-600 mt-0.5">{it.detalle}</p>}
            <p className="text-[11px] text-slate-400 mt-0.5">
              {new Date(it.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
};
