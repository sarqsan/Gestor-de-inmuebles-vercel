import React, { useMemo } from 'react';
import { X, Landmark, Download } from 'lucide-react';
import type { Prestamo } from '../../types';
import {
  generarTablaAmortizacion,
  resumenPrestamo,
  tasaEnPeriodo,
} from '../../utils/prestamosEngine';

interface Props {
  prestamo: Prestamo;
  direccionInmueble?: string;
  onClose: () => void;
}

const euro = (n: number): string =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

const mesLargo = (periodo: string): string => {
  const [anio, mes] = periodo.split('-').map((n) => parseInt(n, 10));
  if (!anio || !mes) return periodo;
  return new Date(anio, mes - 1, 1).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
};

export const TablaAmortizacionModal: React.FC<Props> = ({ prestamo, direccionInmueble, onClose }) => {
  const tabla = useMemo(() => generarTablaAmortizacion(prestamo), [prestamo]);
  const r = useMemo(() => resumenPrestamo(prestamo), [prestamo]);
  const tasaFila = (periodo: string): number => tasaEnPeriodo(prestamo, periodo);
  const periodoActual = (() => {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
  })();

  const descargarCSV = () => {
    const sep = ';';
    const n = (v: number) => v.toFixed(2).replace('.', ',');
    const filas = tabla.map((f) =>
      [
        f.numero,
        f.fecha,
        f.enCarencia ? 'CARENCIA' : '',
        n(f.cuota),
        n(f.intereses),
        n(f.capital),
        n(f.amortizacionAdicional),
        n(f.saldoFinal),
      ].join(sep)
    );
    const csv = `\uFEFF${[
      'Nº',
      'Fecha',
      'Carencia',
      'Cuota',
      'Intereses',
      'Capital',
      'Amort. extra',
      'Saldo pendiente',
    ].join(sep)}\r\n${filas.join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `amortizacion_${prestamo.id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const chips = [
    { label: 'Capital inicial', valor: euro(prestamo.capitalInicial) },
    { label: 'Cuota mensual', valor: euro(r.cuotaConstante) },
    { label: 'Intereses totales', valor: euro(r.totalIntereses) },
    { label: 'Saldo vivo (teórico)', valor: euro(r.saldoPendiente) },
    { label: 'Amortizado', valor: `${r.porcentajeAmortizado.toFixed(1)} %` },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl my-8 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center text-violet-700">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 leading-tight">
                Cuadro de amortización
              </h3>
              <p className="text-xs text-slate-500">
                {prestamo.descripcion || 'Préstamo'}
                {direccionInmueble ? ` · ${direccionInmueble}` : ''} · TIN {prestamo.tasaInteresAnual} %
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={descargarCSV}
              title="Descargar el cuadro en CSV"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {chips.map((c) => (
              <div key={c.label} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-bold text-slate-900 leading-tight">{c.valor}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{c.label}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                  <th className="px-3 py-2 text-left font-semibold">Nº</th>
                  <th className="px-3 py-2 text-left font-semibold">Período</th>
                  <th className="px-3 py-2 text-right font-semibold">Cuota</th>
                  <th className="px-3 py-2 text-right font-semibold">Intereses</th>
                  <th className="px-3 py-2 text-right font-semibold">Capital</th>
                  <th className="px-3 py-2 text-right font-semibold">Amort. extra</th>
                  <th className="px-3 py-2 text-right font-semibold">Saldo vivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tabla.map((f, idx) => {
                  const esMesActual = f.periodo === periodoActual;
                  const yaVencida = f.periodo < periodoActual;
                  const tasaPrevia = idx > 0 ? tasaFila(tabla[idx - 1].periodo) : null;
                  const cambioTipo = tasaPrevia !== null && tasaPrevia !== tasaFila(f.periodo);
                  return (
                    <tr
                      key={f.numero}
                      className={
                        (esMesActual
                          ? 'bg-violet-50/70'
                          : f.enCarencia
                          ? 'bg-amber-50/60'
                          : yaVencida
                          ? 'text-slate-500'
                          : '') + (cambioTipo ? ' border-t-2 border-t-violet-300' : '')
                      }
                    >
                      <td className="px-3 py-1.5 font-medium">{f.numero}</td>
                      <td className="px-3 py-1.5 capitalize whitespace-nowrap">
                        {mesLargo(f.periodo)}
                        {f.enCarencia && (
                          <span className="ml-1 px-1.5 py-px rounded bg-amber-100 text-amber-800 text-[9px] font-semibold">
                            carencia
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold whitespace-nowrap">
                        {f.cuota > 0 ? euro(f.cuota) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right text-violet-700 whitespace-nowrap">
                        {f.intereses > 0 ? euro(f.intereses) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-700 whitespace-nowrap">
                        {f.capital > 0 ? euro(f.capital) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right text-emerald-700 whitespace-nowrap">
                        {f.amortizacionAdicional > 0 ? euro(f.amortizacionAdicional) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-500 whitespace-nowrap">
                        {euro(f.saldoFinal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400">
            Saldo teórico según calendario (sistema francés): las filas ámbar indican carencia, el
            borde violeta marca un cambio de tipo y «Amort. extra», las amortizaciones anticipadas.
            La fila violeta destaca el mes en curso.
          </p>
        </div>
      </div>
    </div>
  );
};
