/** BLOQUE E — Recibos y pagos (cobros del contrato + justificantes). */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Download, FileWarning, Receipt, RefreshCw } from 'lucide-react';
import type { ContratoFormalizacion, RegistroJustificanteCobro } from '../../types';
import { obtenerUrlDescarga } from '../../lib/suministrosFirestore';
import { consultarJustificantesCobro, ErrorApiJustificantesCobro } from '../../lib/justificantesCobroApi';
import { PresentarJustificanteCobro } from './PresentarJustificanteCobro';

interface Props {
  contrato: ContratoFormalizacion;
}

const ESTADO_INFO: Record<string, { etiqueta: string; clase: string }> = {
  PENDIENTE: { etiqueta: 'Pendiente', clase: 'bg-amber-100 text-amber-800' },
  RECIBIDO: { etiqueta: 'Pagado', clase: 'bg-emerald-100 text-emerald-800' },
  VERIFICADO: { etiqueta: 'Pagado', clase: 'bg-emerald-100 text-emerald-800' },
  RETRASADO: { etiqueta: 'Retrasado', clase: 'bg-red-100 text-red-800' },
  INCIDENCIA: { etiqueta: 'En revisión', clase: 'bg-violet-100 text-violet-800' },
};

function BotonJustificante({ nombre, url, storagePath }: { nombre: string; url?: string; storagePath?: string }) {
  const [cargando, setCargando] = useState(false);
  const abrir = async () => {
    try {
      setCargando(true);
      const destino = url || (storagePath ? await obtenerUrlDescarga(storagePath) : null);
      if (destino) window.open(destino, '_blank', 'noopener');
    } finally {
      setCargando(false);
    }
  };
  if (!url && !storagePath) return null;
  return (
    <button
      onClick={abrir}
      disabled={cargando}
      className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50"
    >
      <Download className="w-3.5 h-3.5" /> {cargando ? 'Abriendo…' : `Justificante: ${nombre}`}
    </button>
  );
}

function fmtFecha(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES');
}

export const PortalRecibos: React.FC<Props> = ({ contrato }) => {
  const [justificantes, setJustificantes] = useState<RegistroJustificanteCobro[]>([]);
  const [errorP2, setErrorP2] = useState('');
  const [cargandoP2, setCargandoP2] = useState(false);
  const cargarJustificantes = useCallback(async () => {
    if (!contrato.id) return;
    setCargandoP2(true);
    try {
      const resultado = await consultarJustificantesCobro([contrato.id]);
      setJustificantes(resultado.items);
      setErrorP2('');
    } catch (error) {
      setErrorP2(error instanceof ErrorApiJustificantesCobro
        ? error.message
        : 'No se pudo consultar el estado de los justificantes.');
    } finally {
      setCargandoP2(false);
    }
  }, [contrato.id]);

  useEffect(() => { void cargarJustificantes(); }, [cargarJustificantes]);

  const cobros = useMemo(
    () => [...(contrato.registroCobros || [])].sort((a, b) => (a.periodoMesAnio < b.periodoMesAnio ? 1 : -1)),
    [contrato]
  );

  const pendiente = cobros
    .filter((c) => c.estado === 'PENDIENTE' || c.estado === 'RETRASADO' || c.estado === 'INCIDENCIA')
    .reduce((acc, c) => acc + Math.max(0, (c.importePrevisto || 0) - (c.importeRecibido || 0)), 0);

  return (
    <div className="space-y-3">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-bold">Total pendiente</p>
            <p className={`text-2xl font-black ${pendiente > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
              {pendiente.toFixed(2)} €
            </p>
          </div>
          <Receipt className="w-8 h-8 text-indigo-200" />
        </div>
        <p className="mt-2 text-xs text-slate-600">
          Paga por transferencia al IBAN de tu contrato antes del día{' '}
          <strong>{contrato.diaLimitePagoMes}</strong> indicando el mes en el concepto.
        </p>
        <p className="mt-1 font-mono text-[11px] bg-slate-50 rounded-lg p-2 break-all">{contrato.propietarioIban}</p>
      </section>

      {errorP2 && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p>{errorP2} La presentación no se considera guardada hasta recibir confirmación durable.</p>
          <button type="button" onClick={() => void cargarJustificantes()} disabled={cargandoP2} className="mt-2 inline-flex items-center gap-1 font-bold underline disabled:opacity-50">
            <RefreshCw className={`h-3 w-3 ${cargandoP2 ? 'animate-spin' : ''}`} /> Actualizar estado
          </button>
        </div>
      )}

      {cobros.length === 0 && (
        <p className="text-center text-sm text-slate-500 py-8">Aún no hay recibos generados para este contrato.</p>
      )}

      {cobros.map((c) => {
        const info = ESTADO_INFO[c.estado] || { etiqueta: c.estado, clase: 'bg-slate-100 text-slate-700' };
        const pagado = c.estado === 'RECIBIDO' || c.estado === 'VERIFICADO';
        return (
          <article key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold">{c.nombreMes || c.periodoMesAnio}</h3>
                <p className="text-[11px] text-slate-500">Vence: {fmtFecha(c.fechaVencimiento)}</p>
              </div>
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${info.clase}`}>
                {pagado ? <CheckCircle2 className="w-3.5 h-3.5" /> : c.estado === 'INCIDENCIA' ? <FileWarning className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                {info.etiqueta}
              </span>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <p className="text-lg font-black">{c.importePrevisto.toFixed(2)} €</p>
                {c.importeRecibido > 0 && c.importeRecibido !== c.importePrevisto && (
                  <p className="text-[11px] text-slate-500">Recibido: {c.importeRecibido.toFixed(2)} €</p>
                )}
              </div>
              {c.fechaPago && <p className="text-[11px] text-slate-500">Pagado: {fmtFecha(c.fechaPago)}</p>}
            </div>
            {c.metodoPago && <p className="text-[11px] text-slate-500 capitalize">Método: {c.metodoPago}</p>}
            {c.justificante && (
              <BotonJustificante
                nombre={c.justificante.nombreArchivo}
                url={c.justificante.url}
                storagePath={c.justificante.storagePath}
              />
            )}
            <PresentarJustificanteCobro
              contratoId={contrato.id}
              cobro={c}
              registro={justificantes.find((j) => j.cobroPeriodoId === c.id)}
              onActualizado={cargarJustificantes}
            />
          </article>
        );
      })}
    </div>
  );
};
