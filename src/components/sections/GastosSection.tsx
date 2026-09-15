import React, { useMemo, useState } from 'react';
import {
  TrendingDown,
  Plus,
  Home,
  Landmark,
  Wallet,
  Clock,
  Pencil,
  Trash2,
  Search,
  Info,
  User,
} from 'lucide-react';
import type {
  CategoriaGasto,
  EstadoGasto,
  Gasto,
  Inmueble,
  TipoGasto,
  UsuarioApp,
} from '../../types';
import { formatDate } from '../../utils/formatters';
import {
  CATEGORIAS_GASTO,
  categoriaDef,
  ESTADO_GASTO_LABEL,
  etiquetaMesAnio,
  resumenGastos,
} from '../../utils/gastosEngine';
import { GastoModal } from '../modals/GastoModal';

interface GastosSectionProps {
  gastos: Gasto[];
  inmuebles: Inmueble[];
  currentUser?: UsuarioApp | null;
  onSaveGasto: (gasto: Gasto) => Promise<void> | void;
  onDeleteGasto: (gastoId: string) => Promise<void> | void;
}

const euro = (n: number): string =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

const tipoBadge = (tipo: TipoGasto): string =>
  tipo === 'FINANCIACION'
    ? 'bg-violet-100 text-violet-800 border-violet-200'
    : 'bg-amber-100 text-amber-800 border-amber-200';

const estadoBadge = (estado: EstadoGasto): string => {
  if (estado === 'PAGADO') return 'bg-emerald-100 text-emerald-800';
  if (estado === 'PENDIENTE') return 'bg-orange-100 text-orange-800';
  return 'bg-slate-200 text-slate-500';
};

export const GastosSection: React.FC<GastosSectionProps> = ({
  gastos,
  inmuebles,
  currentUser,
  onSaveGasto,
  onDeleteGasto,
}) => {
  const [filtroInmueble, setFiltroInmueble] = useState<string>('TODOS');
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('TODOS');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');
  const [filtroAnio, setFiltroAnio] = useState<string>('TODOS');
  const [busqueda, setBusqueda] = useState<string>('');

  const [showModal, setShowModal] = useState<boolean>(false);
  const [gastoParaEditar, setGastoParaEditar] = useState<Gasto | null>(null);
  const [inmuebleIdInicial, setInmuebleIdInicial] = useState<string>('');

  const inmuebleMap = useMemo(
    () => new Map(inmuebles.map((i) => [i.id, i])),
    [inmuebles]
  );
  const etiquetaInmueble = (id: string): string => {
    const i = inmuebleMap.get(id);
    return i ? `${i.direccion}${i.ciudad ? `, ${i.ciudad}` : ''}` : 'Inmueble eliminado';
  };

  const aniosDisponibles = useMemo(() => {
    const setAnos = new Set<number>();
    gastos.forEach((g) => {
      if (g.periodoMesAnio) setAnos.add(parseInt(g.periodoMesAnio.split('-')[0], 10));
      else if (g.fechaDevengo) setAnos.add(new Date(g.fechaDevengo).getFullYear());
    });
    return Array.from(setAnos).sort((a, b) => b - a);
  }, [gastos]);

  // Coincidencias por inmueble/tipo/categoría/año/búsqueda (independiente del
  // filtro de estado) para que las tarjetas resumen reflejen el período elegido.
  const baseFiltrada = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    return gastos.filter((g) => {
      if (filtroInmueble !== 'TODOS' && g.inmuebleId !== filtroInmueble) return false;
      if (filtroTipo !== 'TODOS' && g.tipo !== filtroTipo) return false;
      if (filtroCategoria !== 'TODOS' && g.categoria !== filtroCategoria) return false;
      if (filtroAnio !== 'TODOS') {
        const anio = g.periodoMesAnio
          ? parseInt(g.periodoMesAnio.split('-')[0], 10)
          : g.fechaDevengo
          ? new Date(g.fechaDevengo).getFullYear()
          : null;
        if (anio !== Number(filtroAnio)) return false;
      }
      if (term) {
        const hay = `${g.concepto} ${g.proveedor || ''} ${g.notas || ''} ${categoriaDef(
          g.categoria
        ).label}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [gastos, filtroInmueble, filtroTipo, filtroCategoria, filtroAnio, busqueda]);

  // Los totales del propietario sólo computan lo que cuesta al arrendador; lo
  // que se repercute al inquilino se lista pero no suma en su caja.
  const gastosDelPropietario = useMemo(
    () => baseFiltrada.filter((g) => g.aCargoDe === 'arrendador'),
    [baseFiltrada]
  );
  const resumen = useMemo(() => resumenGastos(gastosDelPropietario), [gastosDelPropietario]);

  // Lista visible: aplica estado y ordena por fecha de devengo descendente.
  const visibles = useMemo(() => {
    return baseFiltrada
      .filter((g) => filtroEstado === 'TODOS' || g.estado === filtroEstado)
      .sort((a, b) => {
        const fa = a.fechaDevengo || a.createdAt || '';
        const fb = b.fechaDevengo || b.createdAt || '';
        if (fa !== fb) return fb.localeCompare(fa);
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }, [baseFiltrada, filtroEstado]);

  const abrirAlta = () => {
    setGastoParaEditar(null);
    setInmuebleIdInicial(filtroInmueble !== 'TODOS' ? filtroInmueble : inmuebles[0]?.id || '');
    setShowModal(true);
  };
  const abrirEdicion = (g: Gasto) => {
    setGastoParaEditar(g);
    setInmuebleIdInicial(g.inmuebleId);
    setShowModal(true);
  };
  const handleBorrar = (g: Gasto) => {
    if (window.confirm(`¿Eliminar el gasto «${g.concepto}» por ${euro(g.importe)}?`)) {
      onDeleteGasto(g.id);
    }
  };

  const inputCls =
    'px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none transition bg-white';

  const tarjetas = [
    {
      titulo: 'Explotación (pagado)',
      valor: euro(resumen.explotacionPagado),
      sub: 'Comunidad, IBI, seguros, reparaciones…',
      icon: Home,
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    {
      titulo: 'Financiación · hipoteca (pagado)',
      valor: euro(resumen.financiacionPagado),
      sub: `Intereses ${euro(resumen.interesesPagado)} · capital ${euro(
        resumen.capitalAmortizado
      )}`,
      icon: Landmark,
      cls: 'bg-violet-50 text-violet-700 border-violet-200',
    },
    {
      titulo: 'Salida real de caja',
      valor: euro(resumen.salidaCajaPagada),
      sub: 'Explotación + cuotas íntegras abonadas',
      icon: Wallet,
      cls: 'bg-slate-100 text-slate-700 border-slate-300',
    },
    {
      titulo: 'Pendiente de pago',
      valor: euro(resumen.pendiente),
      sub: `${resumen.numero} gastos en el período`,
      icon: Clock,
      cls: 'bg-orange-50 text-orange-700 border-orange-200',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingDown className="w-6 h-6 text-amber-600" />
            Gestión de Gastos
          </h2>
          <p className="text-sm text-slate-500">
            Explotación del alquiler frente a financiación hipotecaria, separadas
            contablemente.
          </p>
        </div>
        <button
          onClick={abrirAlta}
          disabled={inmuebles.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-sm transition"
        >
          <Plus className="w-4 h-4" /> Nuevo gasto
        </button>
      </div>

      {/* Aviso didáctico */}
      <div className="flex gap-3 p-4 rounded-2xl bg-blue-50/70 border border-blue-200 text-blue-900">
        <Info className="w-5 h-5 shrink-0 text-blue-600 mt-0.5" />
        <p className="text-xs leading-relaxed">
          La <b>cuota hipotecaria es financiación</b>, no un gasto de explotación:
          la parte de <b>capital amortiza deuda</b> (no es gasto) y solo los{' '}
          <b>intereses</b> son gasto financiero. Por eso se registran aparte y no
          reducen el resultado operativo del alquiler. Los gastos marcados{' '}
          <i>a cargo del inquilino</i> se muestran pero no suman en la caja del
          propietario.
        </p>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {tarjetas.map((t) => (
          <div key={t.titulo} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t.titulo}
              </span>
              <span className={`w-8 h-8 rounded-lg border flex items-center justify-center ${t.cls}`}>
                <t.icon className="w-4 h-4" />
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{t.valor}</p>
            <p className="text-[11px] text-slate-400 mt-1">{t.sub}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="relative col-span-2 xl:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar concepto, proveedor…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className={`${inputCls} pl-9 w-full`}
            />
          </div>
          <select className={inputCls} value={filtroInmueble} onChange={(e) => setFiltroInmueble(e.target.value)}>
            <option value="TODOS">Todos los inmuebles</option>
            {inmuebles.map((i) => (
              <option key={i.id} value={i.id}>
                {i.direccion}
              </option>
            ))}
          </select>
          <select
            className={inputCls}
            value={filtroTipo}
            onChange={(e) => {
              setFiltroTipo(e.target.value);
              setFiltroCategoria('TODOS');
            }}
          >
            <option value="TODOS">Explotación + Financiación</option>
            <option value="EXPLOTACION">Solo Explotación</option>
            <option value="FINANCIACION">Solo Financiación</option>
          </select>
          <select
            className={inputCls}
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
          >
            <option value="TODOS">Todas las categorías</option>
            {CATEGORIAS_GASTO.filter(
              (c) => filtroTipo === 'TODOS' || c.tipo === filtroTipo
            ).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select className={inputCls} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="TODOS">Cualquier estado</option>
            <option value="PENDIENTE">Pendientes</option>
            <option value="PAGADO">Pagados</option>
            <option value="ANULADO">Anulados</option>
          </select>
          <select className={inputCls} value={filtroAnio} onChange={(e) => setFiltroAnio(e.target.value)}>
            <option value="TODOS">Todos los años</option>
            {aniosDisponibles.map((a) => (
              <option key={a} value={String(a)}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Listado */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {visibles.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
              <TrendingDown className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">No hay gastos registrados</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Registra comunidad, IBI, seguros, reparaciones o la cuota hipotecaria
              para ver aquí la separación entre explotación y financiación.
            </p>
            <button
              onClick={abrirAlta}
              disabled={inmuebles.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition"
            >
              <Plus className="w-4 h-4" /> Registrar el primer gasto
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Fecha / Período</th>
                  <th className="px-4 py-3 font-semibold">Inmueble</th>
                  <th className="px-4 py-3 font-semibold">Concepto</th>
                  <th className="px-4 py-3 font-semibold">A cargo</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold text-right">Importe</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibles.map((g) => {
                  const def = categoriaDef(g.categoria as CategoriaGasto);
                  const esFin = g.tipo === 'FINANCIACION';
                  return (
                    <tr key={g.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        <div className="font-medium text-slate-800">
                          {g.fechaDevengo ? formatDate(g.fechaDevengo) : etiquetaMesAnio(g.periodoMesAnio)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {etiquetaMesAnio(g.periodoMesAnio)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-[180px]">
                        <span className="line-clamp-2">{etiquetaInmueble(g.inmuebleId)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-lg border text-[10px] font-semibold ${tipoBadge(
                              g.tipo as TipoGasto
                            )}`}
                          >
                            {esFin ? <Landmark className="w-3 h-3" /> : <Home className="w-3 h-3" />}
                            {def.label}
                          </span>
                          <span
                            className={`font-medium text-slate-800 ${
                              g.estado === 'ANULADO' ? 'line-through text-slate-400' : ''
                            }`}
                          >
                            {g.concepto}
                          </span>
                          {g.proveedor && (
                            <span className="text-[11px] text-slate-400">{g.proveedor}</span>
                          )}
                          {esFin && typeof g.intereses === 'number' && (
                            <span className="text-[10px] text-violet-600">
                              intereses {euro(g.intereses || 0)} · capital{' '}
                              {euro(g.capitalAmortizado || 0)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                            g.aCargoDe === 'arrendatario' ? 'text-sky-700' : 'text-slate-500'
                          }`}
                        >
                          <User className="w-3 h-3" />
                          {g.aCargoDe === 'arrendatario' ? 'Inquilino' : 'Propietario'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-lg text-[11px] font-semibold ${estadoBadge(
                            g.estado as EstadoGasto
                          )}`}
                        >
                          {ESTADO_GASTO_LABEL[g.estado as EstadoGasto] || g.estado}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-bold whitespace-nowrap ${
                          esFin ? 'text-violet-700' : 'text-slate-900'
                        } ${g.estado === 'ANULADO' ? 'line-through text-slate-400' : ''}`}
                      >
                        {euro(g.importe)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => abrirEdicion(g)}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleBorrar(g)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <GastoModal
          gastoParaEditar={gastoParaEditar}
          inmuebles={inmuebles}
          inmuebleIdInicial={inmuebleIdInicial}
          currentUser={currentUser}
          onSave={onSaveGasto}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
};
