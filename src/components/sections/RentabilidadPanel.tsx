import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  Home,
  Landmark,
  Wallet,
  ReceiptText,
  PiggyBank,
  Calculator,
  Building2,
  Download,
  ChevronRight,
} from 'lucide-react';
import type { CobroPeriodo, Gasto, Inmueble } from '../../types';
import {
  aniosConDatos,
  cuadreRentabilidad,
  cuadreToCSV,
  detalleRentabilidad,
  resumenGlobal,
  type CuadreInmueble,
  type DetalleInmueble,
  type FiltroAnio,
} from '../../utils/rentabilidadEngine';
import { DetalleRentabilidadModal } from '../modals/DetalleRentabilidadModal';

interface RentabilidadPanelProps {
  cobros: CobroPeriodo[];
  gastos: Gasto[];
  inmuebles: Inmueble[];
}

const euro = (n: number): string =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);

const signed = (n: number): string => `${n < 0 ? '−' : ''}${euro(Math.abs(n))}`;

const numeroColor = (n: number): string =>
  n > 0 ? 'text-emerald-700' : n < 0 ? 'text-rose-700' : 'text-slate-500';

export const RentabilidadPanel: React.FC<RentabilidadPanelProps> = ({
  cobros,
  gastos,
  inmuebles,
}) => {
  const anios = useMemo(() => aniosConDatos(cobros, gastos), [cobros, gastos]);
  const [anio, setAnio] = useState<FiltroAnio>(anios[0] ?? new Date().getFullYear());
  const [inmuebleSeleccionado, setInmuebleSeleccionado] = useState<string | null>(null);

  // Los cuadres usan todos los datos; el filtro de inmueble/propietario ya
  // viene aplicado por el ámbito (scopedCobros / scopedGastos).
  const filas = useMemo(
    () => cuadreRentabilidad({ cobros, gastos, inmuebles }, anio),
    [cobros, gastos, inmuebles, anio]
  );
  const global = useMemo(() => resumenGlobal(filas), [filas]);

  // Detalle trazable del inmueble seleccionado (mensual + movimientos).
  const detalle: DetalleInmueble | null = useMemo(
    () =>
      inmuebleSeleccionado
        ? detalleRentabilidad({ cobros, gastos, inmuebles }, inmuebleSeleccionado, anio)
        : null,
    [inmuebleSeleccionado, cobros, gastos, inmuebles, anio]
  );

  const descargarCSV = () => {
    const csv = cuadreToCSV(filas, global, anio);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cuadre_rentabilidad_${anio === 'TODOS' ? 'todos' : anio}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Pendientes de pago (gastos) en el año, para la nota de caja.
  const pendienteGastos = useMemo(
    () =>
      gastos
        .filter((g) => {
          if (g.estado !== 'PENDIENTE') return false;
          if (anio === 'TODOS') return true;
          const ref = g.periodoMesAnio || g.fechaDevengo?.slice(0, 7);
          return ref ? ref.startsWith(`${anio}-`) : false;
        })
        .reduce((acc, g) => acc + (Number(g.importe) || 0), 0),
    [gastos, anio]
  );

  const inputCls =
    'px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition bg-white';

  const tarjetas = [
    {
      titulo: 'Ingresos cobrados',
      valor: euro(global.ingresosCobrado),
      sub:
        global.ingresosPrevisto > 0
          ? `Previsto ${euro(global.ingresosPrevisto)} · pendiente ${euro(global.cobrosPendientes)}`
          : 'Rentas efectivamente ingresadas',
      icon: TrendingUp,
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      titulo: 'Gastos de explotación',
      valor: `− ${euro(global.gastosExplotacion)}`,
      sub: `Deducibles ${euro(global.gastosDeducibles)}`,
      icon: Home,
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    {
      titulo: 'Resultado operativo',
      valor: signed(global.resultadoOperativo),
      sub:
        global.margenOperativoPct != null
          ? `Margen ${global.margenOperativoPct.toFixed(1)} % sobre ingresos`
          : 'Ingresos − explotación',
      icon: PiggyBank,
      cls: 'bg-sky-50 text-sky-700 border-sky-200',
    },
    {
      titulo: 'Cuota hipotecaria',
      valor: `− ${euro(global.cuotaHipotecaria)}`,
      sub: `Intereses ${euro(global.interesesHipotecarios)} · capital ${euro(global.capitalAmortizado)}`,
      icon: Landmark,
      cls: 'bg-violet-50 text-violet-700 border-violet-200',
    },
    {
      titulo: 'Cash-flow neto',
      valor: signed(global.cashFlowNeto),
      sub:
        pendienteGastos > 0
          ? `Operativo − hipoteca · ${euro(pendienteGastos)} en gastos pendientes`
          : 'Operativo − cuota hipotecaria íntegra',
      icon: Wallet,
      cls: 'bg-slate-100 text-slate-700 border-slate-300',
    },
    {
      titulo: 'Base fiscal deducible',
      valor: euro(global.baseFiscalDeducible),
      sub: 'Explotación deducible + intereses',
      icon: ReceiptText,
      cls: 'bg-teal-50 text-teal-700 border-teal-200',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Selector de año */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-600" />
            Cuadre de rentabilidad
          </h3>
          <p className="text-xs text-slate-500">
            Ingresos de alquiler frente a explotación y financiación por inmueble.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className={inputCls}
            value={String(anio)}
            onChange={(e) => setAnio(e.target.value === 'TODOS' ? 'TODOS' : Number(e.target.value))}
          >
            {anios.map((a) => (
              <option key={a} value={String(a)}>
                {a}
              </option>
            ))}
            <option value="TODOS">Todos los años</option>
          </select>
          <button
            onClick={descargarCSV}
            title="Descargar el cuadre en CSV (Excel)"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {/* Aviso conceptual */}
      <div className="flex gap-3 p-4 rounded-2xl bg-blue-50/70 border border-blue-200 text-blue-900">
        <Landmark className="w-5 h-5 shrink-0 text-blue-600 mt-0.5" />
        <p className="text-xs leading-relaxed">
          El <b>resultado operativo</b> sólo descuenta gastos de explotación. La{' '}
          <b>cuota hipotecaria</b> se descuenta aparte en el <b>cash-flow</b>: su
          parte de <b>capital no es un gasto</b> (devuelve deuda) y solo los{' '}
          <b>intereses</b> entran en la base fiscal.
        </p>
      </div>

      {/* Tarjetas globales */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {tarjetas.map((t) => (
          <div key={t.titulo} className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide leading-tight">
                {t.titulo}
              </span>
              <span className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${t.cls}`}>
                <t.icon className="w-3.5 h-3.5" />
              </span>
            </div>
            <p className="text-lg font-bold text-slate-900 leading-tight">{t.valor}</p>
            <p className="text-[10px] text-slate-400 mt-1 leading-snug">{t.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabla por inmueble */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-500" />
          <h4 className="text-sm font-bold text-slate-800">Desglose por inmueble</h4>
          <span className="ml-auto text-[11px] text-slate-400">
            {global.numInmueblesConMovimiento} con movimiento · pulsa una fila para ver el detalle
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Inmueble</th>
                <th className="px-3 py-2.5 font-semibold text-right">Ingresos</th>
                <th className="px-3 py-2.5 font-semibold text-right">Explotación</th>
                <th className="px-3 py-2.5 font-semibold text-right">Resultado op.</th>
                <th className="px-3 py-2.5 font-semibold text-right">Margen</th>
                <th className="px-3 py-2.5 font-semibold text-right">Hipoteca</th>
                <th className="px-3 py-2.5 font-semibold text-right">Cash-flow</th>
                <th className="px-3 py-2.5 font-semibold text-right">Rentab. neta*</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((f: CuadreInmueble) => {
                const sinMov = f.numCobros === 0 && f.gastosExplotacion === 0 && f.cuotaHipotecaria === 0;
                return (
                  <tr
                    key={f.inmuebleId}
                    onClick={() => setInmuebleSeleccionado(f.inmuebleId)}
                    className={`cursor-pointer ${sinMov ? 'opacity-50' : 'hover:bg-emerald-50/40'}`}
                    title="Ver detalle mensual y movimientos"
                  >
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <div className="flex items-center gap-1">
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                        <span className="font-medium text-slate-800 line-clamp-1">{f.direccion}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 pl-4">
                        <span className="capitalize">{f.ciudad}</span>
                        {f.alquilado && (
                          <span className="px-1.5 py-px rounded bg-emerald-100 text-emerald-700 font-semibold">
                            alquilado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap text-emerald-700 font-medium">
                      {euro(f.ingresosCobrado)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap text-amber-700">
                      {f.gastosExplotacion > 0 ? `− ${euro(f.gastosExplotacion)}` : '—'}
                    </td>
                    <td className={`px-3 py-2.5 text-right whitespace-nowrap font-bold ${numeroColor(f.resultadoOperativo)}`}>
                      {signed(f.resultadoOperativo)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-500 text-xs">
                      {f.margenOperativoPct != null ? `${f.margenOperativoPct.toFixed(0)} %` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap text-violet-700 text-xs">
                      {f.cuotaHipotecaria > 0 ? `− ${euro(f.cuotaHipotecaria)}` : '—'}
                    </td>
                    <td className={`px-3 py-2.5 text-right whitespace-nowrap font-bold ${numeroColor(f.cashFlowNeto)}`}>
                      {signed(f.cashFlowNeto)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-500 text-xs">
                      {f.rentabilidadNetaPct != null ? `${f.rentabilidadNetaPct.toFixed(1)} %` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-bold text-slate-800 text-sm">
                <td className="px-4 py-3">TOTAL ({anio === 'TODOS' ? 'todos los años' : anio})</td>
                <td className="px-3 py-3 text-right text-emerald-700 whitespace-nowrap">{euro(global.ingresosCobrado)}</td>
                <td className="px-3 py-3 text-right text-amber-700 whitespace-nowrap">− {euro(global.gastosExplotacion)}</td>
                <td className={`px-3 py-3 text-right whitespace-nowrap ${numeroColor(global.resultadoOperativo)}`}>
                  {signed(global.resultadoOperativo)}
                </td>
                <td className="px-3 py-3 text-right text-xs">
                  {global.margenOperativoPct != null ? `${global.margenOperativoPct.toFixed(0)} %` : '—'}
                </td>
                <td className="px-3 py-3 text-right text-violet-700 whitespace-nowrap">− {euro(global.cuotaHipotecaria)}</td>
                <td className={`px-3 py-3 text-right whitespace-nowrap ${numeroColor(global.cashFlowNeto)}`}>
                  {signed(global.cashFlowNeto)}
                </td>
                <td className="px-3 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="px-4 py-2.5 text-[10px] text-slate-400 border-t border-slate-100">
          * Rentabilidad neta = resultado operativo anual ÷ valor de adquisición (solo si está informado en la ficha del inmueble y se selecciona un año concreto).
        </p>
      </div>

      {detalle && (
        <DetalleRentabilidadModal
          detalle={detalle}
          anio={anio}
          onClose={() => setInmuebleSeleccionado(null)}
        />
      )}
    </div>
  );
};
