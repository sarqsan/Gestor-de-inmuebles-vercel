import React, { useMemo, useState } from 'react';
import {
  X,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  Calculator,
  Check,
  Info,
  AlertCircle,
  TrendingUp,
  Building,
} from 'lucide-react';
import type {
  ComparableMercado,
  ExpedienteRecomercializacion,
  Inmueble,
  PricingRecomercializacion,
} from '../../types';
import {
  calcularPricing,
  nuevoComparableId,
  resumenMejorasConfirmadas,
} from '../../utils/pricingRecomerc';
import { DESTINO_INMUEBLE_LABEL } from '../../utils/recomercializacionEngine';
import { estimarPricingConIA } from '../../utils/pricingIa';

interface Props {
  expediente: ExpedienteRecomercializacion;
  inmueble?: Inmueble;
  rentaAnterior?: number;
  onGuardar: (expediente: ExpedienteRecomercializacion) => Promise<void> | void;
  onClose: () => void;
}

const euro0 = (n?: number) =>
  n === undefined || n === null || Number.isNaN(Number(n)) || n === 0
    ? '—'
    : `${Math.round(Number(n)).toLocaleString('es-ES')} €`;

const inputCls =
  'w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 outline-none';

export const PricingModal: React.FC<Props> = ({
  expediente,
  inmueble,
  rentaAnterior,
  onGuardar,
  onClose,
}) => {
  const previo = expediente.pricing;
  const [rentaAnteriorVal, setRentaAnteriorVal] = useState<string>(
    String(previo?.rentaAnterior ?? rentaAnterior ?? '')
  );
  const [ipc, setIpc] = useState<string>(String(previo?.ipcAcumuladoPct ?? 0));
  const [ajuste, setAjuste] = useState<string>(String(previo?.ajusteMercadoPct ?? 0));
  const [precioM2Venta, setPrecioM2Venta] = useState<string>(
    String(previo?.precioM2Venta ?? '')
  );
  const [comparables, setComparables] = useState<ComparableMercado[]>(
    previo?.comparables ?? []
  );
  const [iaResult, setIaResult] = useState<PricingRecomercializacion | null>(null);
  const [confianza, setConfianza] = useState<'alta' | 'media' | 'baja' | null>(null);
  const [cargandoIa, setCargandoIa] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');

  const esVenta = expediente.destinoPrevisto === 'VENTA';
  const superficie = inmueble?.superficie ?? 0;
  const { rentaExtraMensual, confirmadas } = resumenMejorasConfirmadas(expediente.mejorasPropuestas);

  const calculo = useMemo(
    () =>
      calcularPricing({
        rentaAnterior: rentaAnteriorVal === '' ? undefined : Number(rentaAnteriorVal),
        ipcAcumuladoPct: ipc === '' ? 0 : Number(ipc),
        ajusteMercadoPct: ajuste === '' ? 0 : Number(ajuste),
        mejoras: expediente.mejorasPropuestas,
        comparables,
        superficieM2: superficie || undefined,
        esVenta,
        valorVentaReferencia: inmueble?.valoracionEstimada ?? inmueble?.valorAdquisicion,
        precioM2VentaManual: precioM2Venta === '' ? undefined : Number(precioM2Venta),
      }),
    [rentaAnteriorVal, ipc, ajuste, comparables, superficie, esVenta, inmueble, precioM2Venta, expediente.mejorasPropuestas]
  );

  const pricing: PricingRecomercializacion = iaResult ?? calculo.pricing;

  const invalidarIa = () => {
    if (iaResult) setIaResult(null);
  };

  const persistir = async (siguiente: ExpedienteRecomercializacion) => {
    setGuardando(true);
    try {
      await onGuardar(siguiente);
    } finally {
      setGuardando(false);
    }
  };

  const construirExpediente = (estado?: typeof expediente.estado): ExpedienteRecomercializacion => ({
    ...expediente,
    pricing,
    estado: estado ?? expediente.estado,
    updatedAt: new Date().toISOString(),
  });

  const handleGuardarBorrador = () => persistir(construirExpediente());

  const handleCompletar = async () => {
    if (!pricing.escenarioRecomendado && !pricing.valoracionVentaEstimada) {
      setAviso('Introduce una renta anterior, comparables o un ajuste de mercado para poder estimar un precio.');
      return;
    }
    await persistir(construirExpediente('VALORACION_COMPLETADA'));
    onClose();
  };

  const handleIa = async () => {
    setAviso('');
    invalidarIa();
    setCargandoIa(true);
    try {
      const { pricing: refinado, confianza: c } = await estimarPricingConIA({
        base: calculo.pricing,
        rentaAnterior: calculo.pricing.rentaAnterior,
        ipcAcumuladoPct: calculo.pricing.ipcAcumuladoPct,
        ajusteMercadoPct: calculo.pricing.ajusteMercadoPct,
        mejoraRenta: rentaExtraMensual,
        inmueble,
        esVenta,
        destino: DESTINO_INMUEBLE_LABEL[expediente.destinoPrevisto],
      });
      setIaResult(refinado);
      setConfianza(c ?? null);
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo contactar con el servicio de IA; se mantiene el cálculo.');
    } finally {
      setCargandoIa(false);
    }
  };

  const anadirComparable = () =>
    setComparables((c) => [...c, { id: nuevoComparableId() }]);
  const editarComparable = (id: string, campos: Partial<ComparableMercado>) => {
    invalidarIa();
    setComparables((c) => c.map((x) => (x.id === id ? { ...x, ...campos } : x)));
  };
  const borrarComparable = (id: string) => {
    invalidarIa();
    setComparables((c) => c.filter((x) => x.id !== id));
  };

  const escenarios = [
    {
      key: 'conservador',
      titulo: 'Conservador',
      desc: 'Rápida absorción y mínimo riesgo de vacancia',
      valor: pricing.escenarioConservador,
      cls: 'border-emerald-200 bg-emerald-50/50',
      badge: 'text-emerald-700 bg-emerald-100',
    },
    {
      key: 'recomendado',
      titulo: 'Recomendado',
      desc: 'Equilibrio entre rentabilidad y plazo de comercialización',
      valor: pricing.escenarioRecomendado,
      cls: 'border-teal-300 bg-teal-50/60 ring-1 ring-teal-200',
      badge: 'text-teal-700 bg-teal-100',
    },
    {
      key: 'maximo',
      titulo: 'Máximo razonable',
      desc: 'Tope de mercado para perfiles de alta solvencia',
      valor: pricing.escenarioMaximo,
      cls: 'border-indigo-200 bg-indigo-50/40',
      badge: 'text-indigo-700 bg-indigo-100',
    },
  ] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl my-8 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 leading-tight">Valoración y escenarios de precio</h3>
              <p className="text-xs text-slate-500">
                {inmueble?.direccion || 'Expediente'} · {DESTINO_INMUEBLE_LABEL[expediente.destinoPrevisto]}
                {superficie ? ` · ${superficie} m²` : ''} · motor: {iaResult ? 'IA' : 'calculadora'}
                {confianza && iaResult ? ` · confianza ${confianza}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {aviso && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {aviso}
            </div>
          )}

          {/* Hipótesis */}
          <div className="rounded-xl border border-slate-200 p-4">
            <h4 className="text-xs font-bold text-slate-700 mb-3">Hipótesis de partida</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">Renta anterior (€/mes)</label>
                <input
                  type="number" min="0"
                  className={inputCls}
                  value={rentaAnteriorVal}
                  onChange={(e) => { setRentaAnteriorVal(e.target.value); invalidarIa(); }}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">IPC / actualización (%)</label>
                <input
                  type="number" step="0.1"
                  className={inputCls}
                  value={ipc}
                  onChange={(e) => { setIpc(e.target.value); invalidarIa(); }}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">Ajuste de mercado (%)</label>
                <input
                  type="number" step="0.5"
                  className={inputCls}
                  value={ajuste}
                  onChange={(e) => { setAjuste(e.target.value); invalidarIa(); }}
                  disabled={comparables.length > 0}
                  title={comparables.length > 0 ? 'Con comparables, el precio se ancla a los testigos de zona' : undefined}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">Mejoras confirmadas (+€/mes)</label>
                <div className="px-2 py-1.5 text-xs text-teal-700 font-semibold">{rentaExtraMensual} € ({confirmadas.length})</div>
              </div>
            </div>
          </div>

          {/* Escenarios alquiler */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {escenarios.map((esc) => (
              <div key={esc.key} className={`rounded-xl border p-4 ${esc.cls}`}>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${esc.badge}`}>{esc.titulo}</span>
                <p className="text-2xl font-extrabold text-slate-900 mt-2">{euro0(esc.valor)}<span className="text-xs font-medium text-slate-400">/mes</span></p>
                <p className="text-[10px] text-slate-500 mt-1 leading-snug">{esc.desc}</p>
                {superficie > 0 && esc.valor ? (
                  <p className="text-[10px] text-slate-500 mt-1">≈ {((esc.valor as number) / superficie).toFixed(1)} €/m²·mes</p>
                ) : null}
              </div>
            ))}
          </div>

          {/* Comparables */}
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-teal-600" /> Testigos de mercado (mismo código postal y tipología)
              </h4>
              <button
                type="button"
                onClick={anadirComparable}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-teal-700 bg-white border border-teal-300 rounded-lg hover:bg-teal-50"
              >
                <Plus className="w-3.5 h-3.5" /> Añadir testigo
              </button>
            </div>
            {comparables.length === 0 ? (
              <p className="text-[11px] text-slate-400">
                Sin testigos: el cálculo usa la renta anterior, el IPC/ajuste y las mejoras. Añade 3-5 anuncios
                comparables de la zona para afianzar el precio (la IA no consulta portales en tiempo real).
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-[9px] font-bold text-slate-400 px-1">
                  <span className="col-span-4">Fuente / enlace / nota</span>
                  <span className="col-span-2">m²</span>
                  <span className="col-span-3">Alquiler €/mes</span>
                  <span className="col-span-2">Venta €</span>
                  <span className="col-span-1"></span>
                </div>
                {comparables.map((c) => (
                  <div key={c.id} className="grid grid-cols-12 gap-2 items-center">
                    <input className={`${inputCls} col-span-4`} value={c.fuente || ''} placeholder="Portal / inmobiliaria"
                      onChange={(e) => editarComparable(c.id, { fuente: e.target.value })} />
                    <input type="number" className={`${inputCls} col-span-2`} value={c.metros ?? ''}
                      onChange={(e) => editarComparable(c.id, { metros: e.target.value === '' ? undefined : Number(e.target.value) })} />
                    <input type="number" className={`${inputCls} col-span-3`} value={c.precioAlquilerMensual ?? ''}
                      onChange={(e) => editarComparable(c.id, { precioAlquilerMensual: e.target.value === '' ? undefined : Number(e.target.value) })} />
                    <input type="number" className={`${inputCls} col-span-2`} value={c.precioVenta ?? ''}
                      onChange={(e) => editarComparable(c.id, { precioVenta: e.target.value === '' ? undefined : Number(e.target.value) })} />
                    <button type="button" onClick={() => borrarComparable(c.id)} className="col-span-1 p-1 text-slate-400 hover:text-rose-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Venta */}
          <div className="rounded-xl border border-slate-200 p-4">
            <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5">
              <Building className="w-4 h-4 text-indigo-600" /> Escenario de venta {!esVenta && '(opcional)'}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">€/m² de venta</label>
                <input type="number" min="0" className={inputCls} value={precioM2Venta}
                  onChange={(e) => { setPrecioM2Venta(e.target.value); invalidarIa(); }}
                  placeholder={calculo.metricas.m2VentaComparables ? String(calculo.metricas.m2VentaComparables) : 'manual'} />
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5">
                <p className="text-[9px] font-semibold text-slate-400">Valoración</p>
                <p className="text-sm font-bold text-slate-800">{euro0(pricing.valoracionVentaEstimada)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5">
                <p className="text-[9px] font-semibold text-slate-400">Horquilla</p>
                <p className="text-[11px] font-bold text-slate-800">{euro0(pricing.horquillaVentaMin)} – {euro0(pricing.horquillaVentaMax)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5">
                <p className="text-[9px] font-semibold text-slate-400">Precio de salida</p>
                <p className="text-sm font-bold text-indigo-700">{euro0(pricing.precioSalidaRecomendado)}</p>
              </div>
            </div>
            {pricing.plazoMedioComercializacionDias !== undefined && (
              <p className="text-[10px] text-slate-400 mt-2">
                Plazo medio orientativo: ~{pricing.plazoMedioComercializacionDias} días.
              </p>
            )}
          </div>

          {/* Notas del cálculo */}
          {(pricing.notasCalculo || calculo.notas.length > 0) && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold text-slate-500 mb-1">Justificación del cálculo</p>
              <ul className="list-disc pl-4 space-y-0.5 text-[10px] text-slate-500">
                {(pricing.notasCalculo || calculo.notas.join('\n')).split('\n').filter(Boolean).map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Estimación orientativa, no una tasación oficial ni garantía de precio o plazo. La IA solo
              revisa los datos que introduces (no navega portales); contrasta testigos reales de la zona
              antes de publicar.
            </span>
          </div>
        </div>

        {/* Pie */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] text-slate-400">
            {calculo.metricas.numeroComparablesAlquiler} testigo(s) de alquiler · {calculo.metricas.numeroComparablesVenta} de venta
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleIa}
              disabled={cargandoIa || guardando}
              className="px-3.5 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
            >
              {cargandoIa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Revisar con IA
            </button>
            <button
              type="button"
              onClick={handleGuardarBorrador}
              disabled={guardando}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl disabled:opacity-50"
            >
              Guardar sin completar
            </button>
            <button
              type="button"
              onClick={handleCompletar}
              disabled={guardando}
              className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-4 h-4" /> Completar valoración
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
