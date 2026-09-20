import React from 'react';
import {
  X,
  Building2,
  TrendingUp,
  Home,
  Landmark,
  Wallet,
  PiggyBank,
  ReceiptText,
  ChevronRight,
} from 'lucide-react';
import type { DetalleInmueble, FiltroAnio } from '../../utils/rentabilidadEngine';
import { categoriaDef, ESTADO_GASTO_LABEL } from '../../utils/gastosEngine';
import { MESES_NOMBRES } from '../../utils/cobrosEngine';

interface Props {
  detalle: DetalleInmueble;
  anio: FiltroAnio;
  onClose: () => void;
}

const euro = (n: number): string =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);

const signed = (n: number): string => `${n < 0 ? '−' : ''}${euro(Math.abs(n))}`;
const color = (n: number): string =>
  n > 0 ? 'text-emerald-700' : n < 0 ? 'text-rose-700' : 'text-slate-500';

const estadoCobro: Record<string, { label: string; cls: string }> = {
  PENDIENTE: { label: 'Pendiente', cls: 'bg-orange-100 text-orange-800' },
  RETRASADO: { label: 'Retrasado', cls: 'bg-rose-100 text-rose-800' },
  RECIBIDO: { label: 'Recibido', cls: 'bg-emerald-100 text-emerald-800' },
  VERIFICADO: { label: 'Verificado', cls: 'bg-emerald-100 text-emerald-800' },
  INCIDENCIA: { label: 'Incidencia', cls: 'bg-amber-100 text-amber-800' },
};

export const DetalleRentabilidadModal: React.FC<Props> = ({ detalle, anio, onClose }) => {
  const { fila, meses, cobros, gastos } = detalle;

  const chips = [
    { label: 'Ingresos cobrados', valor: euro(fila.ingresosCobrado), icon: TrendingUp, cls: 'text-emerald-700 bg-emerald-50' },
    { label: 'Explotación', valor: `− ${euro(fila.gastosExplotacion)}`, icon: Home, cls: 'text-amber-700 bg-amber-50' },
    { label: 'Resultado operativo', valor: signed(fila.resultadoOperativo), icon: PiggyBank, cls: 'text-sky-700 bg-sky-50' },
    { label: 'Cuota hipotecaria', valor: `− ${euro(fila.cuotaHipotecaria)}`, icon: Landmark, cls: 'text-violet-700 bg-violet-50' },
    { label: 'Cash-flow neto', valor: signed(fila.cashFlowNeto), icon: Wallet, cls: 'text-slate-700 bg-slate-100' },
    { label: 'Base fiscal', valor: euro(fila.baseFiscalDeducible), icon: ReceiptText, cls: 'text-teal-700 bg-teal-50' },
  ];

  // Máximo absoluto para la barra proporcional mensual.
  const maxMes = meses.reduce(
    (m, x) => Math.max(m, x.ingresos, x.explotacion, x.hipoteca, Math.abs(x.cashFlow)),
    0
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl my-8 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 leading-tight">{fila.direccion}</h3>
              <p className="text-xs text-slate-500">
                {fila.ciudad ? `${fila.ciudad} · ` : ''}Cuadre {anio === 'TODOS' ? '· todos los años' : `del año ${anio}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Chips resumen */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {chips.map((c) => (
              <div key={c.label} className="rounded-xl border border-slate-200 p-3">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center mb-1.5 ${c.cls}`}>
                  <c.icon className="w-3.5 h-3.5" />
                </span>
                <p className="text-sm font-bold text-slate-900 leading-tight">{c.valor}</p>
                <p className="text-[10px] text-slate-400 leading-snug mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Evolución mensual */}
          {meses.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-slate-800 mb-2">Evolución mensual</h4>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                      <th className="px-3 py-2 text-left font-semibold">Mes</th>
                      <th className="px-3 py-2 text-right font-semibold">Ingresos</th>
                      <th className="px-3 py-2 text-right font-semibold">Explotación</th>
                      <th className="px-3 py-2 text-right font-semibold">Hipoteca</th>
                      <th className="px-3 py-2 text-right font-semibold">Resultado op.</th>
                      <th className="px-3 py-2 text-right font-semibold">Cash-flow</th>
                      <th className="px-3 py-2 font-semibold w-32">Visual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {meses.map((m) => {
                      const activo = m.ingresos !== 0 || m.explotacion !== 0 || m.hipoteca !== 0;
                      return (
                        <tr key={m.mes} className={activo ? '' : 'text-slate-300'}>
                          <td className="px-3 py-1.5 font-medium text-slate-700">
                            {MESES_NOMBRES[m.mes - 1] || m.mes}
                          </td>
                          <td className="px-3 py-1.5 text-right text-emerald-700">{m.ingresos ? euro(m.ingresos) : '—'}</td>
                          <td className="px-3 py-1.5 text-right text-amber-700">{m.explotacion ? `− ${euro(m.explotacion)}` : '—'}</td>
                          <td className="px-3 py-1.5 text-right text-violet-700">{m.hipoteca ? `− ${euro(m.hipoteca)}` : '—'}</td>
                          <td className={`px-3 py-1.5 text-right font-semibold ${activo ? color(m.resultadoOperativo) : ''}`}>
                            {activo ? signed(m.resultadoOperativo) : '—'}
                          </td>
                          <td className={`px-3 py-1.5 text-right font-semibold ${activo ? color(m.cashFlow) : ''}`}>
                            {activo ? signed(m.cashFlow) : '—'}
                          </td>
                          <td className="px-3 py-1.5">
                            {maxMes > 0 && (
                              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${m.cashFlow >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                                  style={{ width: `${Math.max((Math.abs(m.cashFlow) / maxMes) * 100, 2)}%` }}
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Movimientos que sustentan el cuadre */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Ingresos */}
            <div>
              <h4 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Ingresos ({cobros.length})
              </h4>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {cobros.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400">Sin cobros en el período.</p>
                ) : (
                  cobros.map((c) => {
                    const est = estadoCobro[c.estado] || { label: c.estado, cls: 'bg-slate-100 text-slate-600' };
                    return (
                      <div key={c.id} className="p-2.5 flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-800 truncate">
                            {c.nombreMes || c.periodoMesAnio}
                            {c.inquilinoNombre ? ` · ${c.inquilinoNombre}` : ''}
                          </p>
                          <span className={`inline-block mt-0.5 px-1.5 py-px rounded text-[10px] font-semibold ${est.cls}`}>
                            {est.label}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-emerald-700 whitespace-nowrap">
                          {euro(c.importeRecibido || 0)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Gastos */}
            <div>
              <h4 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                <Home className="w-4 h-4 text-amber-600" />
                Gastos ({gastos.length})
              </h4>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {gastos.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400">Sin gastos en el período.</p>
                ) : (
                  gastos.map((g) => {
                    const esFin = g.tipo === 'FINANCIACION';
                    const noComputa = g.estado === 'PENDIENTE' || g.aCargoDe === 'arrendatario';
                    return (
                      <div key={g.id} className="p-2.5 flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-800 truncate">
                            <ChevronRight
                              className={`w-3 h-3 inline -ml-1 ${esFin ? 'text-violet-500' : 'text-amber-500'}`}
                            />
                            {g.concepto}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {categoriaDef(g.categoria).label}
                            {g.proveedor ? ` · ${g.proveedor}` : ''}
                            {noComputa && (
                              <span className="ml-1 text-sky-600">
                                {g.estado === 'PENDIENTE'
                                  ? '(pendiente, no suma)'
                                  : '(a cargo del inquilino)'}
                              </span>
                            )}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-bold whitespace-nowrap ${
                            esFin ? 'text-violet-700' : 'text-slate-800'
                          } ${g.estado === 'ANULADO' ? 'line-through text-slate-400' : ''}`}
                        >
                          − {euro(g.importe || 0)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200/60 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
