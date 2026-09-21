/** BLOQUE E — Miniatura de evidencia (resuelve storagePath a URL de descarga). */
import React, { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { obtenerUrlDescarga } from '../../lib/suministrosFirestore';

interface Props {
  nombre: string;
  url?: string;
  storagePath?: string;
}

export const MiniaturaEvidencia: React.FC<Props> = ({ nombre, url, storagePath }) => {
  const [destino, setDestino] = useState<string | null>(url || null);
  const [cargando, setCargando] = useState(false);
  const esPdf = nombre.toLowerCase().endsWith('.pdf') || (url || '').toLowerCase().includes('.pdf');

  useEffect(() => {
    let vivo = true;
    if (!destino && storagePath) {
      setCargando(true);
      obtenerUrlDescarga(storagePath)
        .then((u) => vivo && setDestino(u))
        .catch(() => undefined)
        .finally(() => vivo && setCargando(false));
    }
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storagePath]);

  if (cargando || !destino) {
    return (
      <span className="aspect-square rounded-xl bg-slate-100 flex items-center justify-center">
        {cargando ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : <FileText className="w-4 h-4 text-slate-300" />}
      </span>
    );
  }

  if (esPdf) {
    return (
      <a
        href={destino}
        target="_blank"
        rel="noopener"
        className="aspect-square rounded-xl bg-red-50 border border-red-100 flex flex-col items-center justify-center gap-1 p-1"
        title={nombre}
      >
        <FileText className="w-5 h-5 text-red-500" />
        <span className="text-[9px] text-red-700 font-medium truncate w-full text-center">{nombre.slice(0, 14)}</span>
      </a>
    );
  }

  return (
    <a href={destino} target="_blank" rel="noopener" title={nombre}>
      <img src={destino} alt={nombre} className="aspect-square w-full object-cover rounded-xl border border-slate-200" loading="lazy" />
    </a>
  );
};
