/** BLOQUE E — Documentos derivados: contrato, acta, justificantes y evidencias. */
import React, { useState } from 'react';
import { Download, FileText, KeyRound, Receipt } from 'lucide-react';
import type { ContratoFormalizacion, Incidencia, LecturaSuministro } from '../../types';
import { imprimirContratoPDF } from '../../utils/contratoEngine';
import { obtenerUrlDescarga } from '../../lib/suministrosFirestore';
import { MiniaturaEvidencia } from './MiniaturaEvidencia';

interface Props {
  contrato: ContratoFormalizacion;
  incidencias: Incidencia[];
  lecturas: LecturaSuministro[];
}

export const PortalDocumentos: React.FC<Props> = ({ contrato, incidencias, lecturas }) => {
  const [abriendo, setAbriendo] = useState<string | null>(null);

  const abrirRef = async (id: string, url?: string, storagePath?: string) => {
    try {
      setAbriendo(id);
      const destino = url || (storagePath ? await obtenerUrlDescarga(storagePath) : null);
      if (destino) window.open(destino, '_blank', 'noopener');
    } finally {
      setAbriendo(null);
    }
  };

  const cobrosConJustificante = (contrato.registroCobros || []).filter((c) => c.justificante);
  const adjuntos = incidencias.flatMap((i) => [...(i.fotografias || []), ...(i.documentos || [])]);
  const fotosLecturas = lecturas.filter((l) => l.fotoStoragePath);

  return (
    <div className="space-y-3">
      {/* Contrato y acta */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
        <h3 className="text-sm font-extrabold flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-700" /> Contrato y acta
        </h3>
        <button
          onClick={() => imprimirContratoPDF(contrato)}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-xl cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" /> Descargar mi contrato (PDF)
        </button>
        <div className="flex items-center gap-2 text-xs bg-slate-50 rounded-xl px-3 py-2.5">
          <KeyRound className="w-4 h-4 text-slate-500 shrink-0" />
          <span>
            Acta de entrega: <strong>{contrato.actaEntregaLlaves?.fechaEntrega || '—'}</strong>
            {contrato.actaEntregaLlaves?.firmadaPorAmbasPartes ? ' · Firmada' : ''}
          </span>
        </div>
      </section>

      {/* Justificantes de recibos */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <h3 className="text-sm font-extrabold flex items-center gap-2 mb-2">
          <Receipt className="w-4 h-4 text-indigo-700" /> Justificantes ({cobrosConJustificante.length})
        </h3>
        {cobrosConJustificante.length === 0 && (
          <p className="text-xs text-slate-500">No hay justificantes publicados.</p>
        )}
        {cobrosConJustificante.map((c) => (
          <button
            key={c.id}
            onClick={() => abrirRef(c.id, c.justificante?.url, c.justificante?.storagePath)}
            className="w-full flex items-center justify-between gap-2 py-2 border-b border-slate-100 last:border-0 cursor-pointer"
          >
            <span className="text-xs font-bold">{c.nombreMes || c.periodoMesAnio}</span>
            <span className="text-[11px] text-indigo-700 font-bold">
              {abriendo === c.id ? 'Abriendo…' : c.justificante?.nombreArchivo || 'Abrir'}
            </span>
          </button>
        ))}
      </section>

      {/* Evidencias de averías */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <h3 className="text-sm font-extrabold mb-2">Evidencias de averías ({adjuntos.length})</h3>
        {adjuntos.length === 0 && <p className="text-xs text-slate-500">Sin evidencias.</p>}
        <div className="grid grid-cols-3 gap-1.5">
          {adjuntos.map((a) => (
            <MiniaturaEvidencia key={a.id} nombre={a.nombre} url={a.url} storagePath={a.storagePath} />
          ))}
        </div>
      </section>

      {/* Fotos de lecturas */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <h3 className="text-sm font-extrabold mb-2">Fotos de contador ({fotosLecturas.length})</h3>
        {fotosLecturas.length === 0 && <p className="text-xs text-slate-500">Sin fotos.</p>}
        <div className="grid grid-cols-3 gap-1.5">
          {fotosLecturas.map((l) => (
            <MiniaturaEvidencia key={l.id} nombre={`lectura-${l.valor}.jpg`} storagePath={l.fotoStoragePath} />
          ))}
        </div>
      </section>
    </div>
  );
};
