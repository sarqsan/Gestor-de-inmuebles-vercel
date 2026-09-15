import React, { useMemo, useState } from 'react';
import { X, Landmark, Save, AlertCircle, Calculator, Plus, Trash2 } from 'lucide-react';
import type {
  AmortizacionAnticipada,
  Inmueble,
  ModalidadAmortizacion,
  Prestamo,
  TipoCarencia,
  TipoPrestamo,
  TramoTipoInteres,
  UsuarioApp,
} from '../../types';
import { periodoActual, sumarMeses } from '../../utils/gastosEngine';
import {
  generarTablaAmortizacion,
  nuevoPrestamoId,
  resumenPrestamo,
} from '../../utils/prestamosEngine';

interface Props {
  prestamoParaEditar?: Prestamo | null;
  inmuebles: Inmueble[];
  inmuebleIdInicial?: string;
  currentUser?: UsuarioApp | null;
  onSave: (prestamo: Prestamo) => Promise<void> | void;
  onClose: () => void;
}

const labelInmueble = (i: Inmueble): string =>
  `${i.direccion}${i.ciudad ? `, ${i.ciudad}` : ''}`;

const euro = (n: number): string =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);

export const PrestamoModal: React.FC<Props> = ({
  prestamoParaEditar,
  inmuebles,
  inmuebleIdInicial,
  currentUser,
  onSave,
  onClose,
}) => {
  const isEditing = !!prestamoParaEditar;

  const [inmuebleId, setInmuebleId] = useState<string>(
    prestamoParaEditar?.inmuebleId || inmuebleIdInicial || inmuebles[0]?.id || ''
  );
  const [tipo, setTipo] = useState<TipoPrestamo>(prestamoParaEditar?.tipo || 'HIPOTECARIO');
  const [descripcion, setDescripcion] = useState<string>(
    prestamoParaEditar?.descripcion || 'Hipoteca de la vivienda'
  );
  const [entidad, setEntidad] = useState<string>(prestamoParaEditar?.entidad || '');
  const [capital, setCapital] = useState<string>(
    prestamoParaEditar ? String(prestamoParaEditar.capitalInicial || '') : ''
  );
  const [tin, setTin] = useState<string>(
    prestamoParaEditar ? String(prestamoParaEditar.tasaInteresAnual || '') : '3,5'
  );
  const [plazoMeses, setPlazoMeses] = useState<string>(
    prestamoParaEditar ? String(prestamoParaEditar.plazoMeses || '') : '360'
  );
  const [fechaInicio, setFechaInicio] = useState<string>(
    prestamoParaEditar?.fechaInicio || periodoActual()
  );
  const [diaVencimiento, setDiaVencimiento] = useState<string>(
    String(prestamoParaEditar?.diaVencimiento || 1)
  );
  const [activo, setActivo] = useState<boolean>(prestamoParaEditar?.activo ?? true);
  const [notas, setNotas] = useState<string>(prestamoParaEditar?.notas || '');
  // FASE 2.4 — carencia, tipo variable y amortizaciones anticipadas.
  const [carenciaMeses, setCarenciaMeses] = useState<string>(
    String(prestamoParaEditar?.carenciaMeses ?? 0)
  );
  const [tipoCarencia, setTipoCarencia] = useState<TipoCarencia>(
    prestamoParaEditar?.tipoCarencia || 'TOTAL'
  );
  const [tramos, setTramos] = useState<Array<{ id: string; fechaInicio: string; tasa: string }>>(
    (prestamoParaEditar?.tramosTipo || []).map((t) => ({
      id: t.id,
      fechaInicio: t.fechaInicio,
      tasa: String(t.tasaInteresAnual),
    }))
  );
  const [amortizaciones, setAmortizaciones] = useState<
    Array<{ id: string; periodo: string; importe: string; modalidad: ModalidadAmortizacion }>
  >(
    (prestamoParaEditar?.amortizaciones || []).map((a) => ({
      id: a.id,
      periodo: a.periodo,
      importe: String(a.importe),
      modalidad: a.modalidad,
    }))
  );
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [guardando, setGuardando] = useState<boolean>(false);

  const capitalNum = parseFloat(capital.replace(',', '.')) || 0;
  const tinNum = parseFloat(tin.replace(',', '.')) || 0;
  const plazoNum = parseInt(plazoMeses, 10) || 0;

  const carenciaNum = Math.min(Math.max(parseInt(carenciaMeses, 10) || 0, 0), plazoNum ? plazoNum - 1 : 0);

  const tramosLimpios: TramoTipoInteres[] = useMemo(
    () =>
      tramos
        .filter((t) => t.fechaInicio && t.tasa !== '')
        .map((t) => ({
          id: t.id,
          fechaInicio: t.fechaInicio,
          tasaInteresAnual: parseFloat(t.tasa.replace(',', '.')) || 0,
        }))
        .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio)),
    [tramos]
  );

  const amortizacionesLimpias: AmortizacionAnticipada[] = useMemo(
    () =>
      amortizaciones
        .filter((a) => a.periodo && parseFloat(a.importe.replace(',', '.')) > 0)
        .map((a) => ({
          id: a.id,
          periodo: a.periodo,
          importe: parseFloat(a.importe.replace(',', '.')) || 0,
          modalidad: a.modalidad,
        })),
    [amortizaciones]
  );

  const borrador = useMemo<Prestamo>(
    () => ({
      id: prestamoParaEditar?.id || nuevoPrestamoId(inmuebleId),
      inmuebleId,
      propietarioId: prestamoParaEditar?.propietarioId || '',
      tipo,
      capitalInicial: capitalNum,
      tasaInteresAnual: tinNum,
      plazoMeses: plazoNum,
      fechaInicio,
      diaVencimiento: Math.min(Math.max(parseInt(diaVencimiento, 10) || 1, 1), 28),
      carenciaMeses: carenciaNum || undefined,
      tipoCarencia: carenciaNum > 0 ? tipoCarencia : undefined,
      tramosTipo: tramosLimpios.length > 0 ? tramosLimpios : undefined,
      amortizaciones: amortizacionesLimpias.length > 0 ? amortizacionesLimpias : undefined,
      activo,
      createdAt: prestamoParaEditar?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [
      prestamoParaEditar,
      inmuebleId,
      tipo,
      capitalNum,
      tinNum,
      plazoNum,
      fechaInicio,
      diaVencimiento,
      carenciaNum,
      tipoCarencia,
      tramosLimpios,
      amortizacionesLimpias,
      activo,
    ]
  );

  // La previsualización se calcula siempre desde el cuadro (soporta carencia,
  // tipo variable y prepagos), no con la fórmula cerrada de cuota constante.
  const tablaPreview = useMemo(() => generarTablaAmortizacion(borrador), [borrador]);
  const primeraCuotaNormal = tablaPreview.find((f) => f.capital > 0 && !f.enCarencia);
  const cuotaInicial = primeraCuotaNormal?.cuota || tablaPreview[0]?.cuota || 0;
  const resumen = useMemo(() => {
    if (tablaPreview.length === 0) return null;
    const r = resumenPrestamo(borrador, '9999-12'); // cuadro completo para la previsualización
    return { r, filas: tablaPreview.length };
  }, [borrador, tablaPreview]);

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!inmuebleId) return setErrorMsg('Selecciona el inmueble vinculado al préstamo.');
    if (capitalNum <= 0) return setErrorMsg('Introduce el capital pendiente inicial.');
    if (tinNum < 0 || tinNum > 30) return setErrorMsg('Revisa el TIN (porcentaje anual, p. ej. 3,5).');
    if (plazoNum <= 0 || plazoNum > 600) return setErrorMsg('Introduce un plazo en meses válido (1-600).');
    if (!fechaInicio) return setErrorMsg('Indica el mes de la primera cuota.');
    const ultimoPeriodo = sumarMeses(fechaInicio, plazoNum - 1);
    const tramoInvalido = tramosLimpios.find((t) => t.fechaInicio <= fechaInicio);
    if (tramoInvalido)
      return setErrorMsg('Las revisiones de tipo deben empezar DESPUÉS del mes de la primera cuota (el TIN inicial ya cubre esa fecha).');
    const tramoFuera = tramosLimpios.find((t) => t.fechaInicio > ultimoPeriodo);
    if (tramoFuera) return setErrorMsg('Hay una revisión de tipo con fecha posterior al fin del préstamo.');
    const prepagoFuera = amortizacionesLimpias.find(
      (a) => a.periodo < fechaInicio || a.periodo > ultimoPeriodo
    );
    if (prepagoFuera) return setErrorMsg('Una amortización anticipada cae fuera del plazo del préstamo.');
    const sumaPrepagos = amortizacionesLimpias.reduce((acc, a) => acc + a.importe, 0);
    if (sumaPrepagos > capitalNum)
      return setErrorMsg('La suma de amortizaciones anticipadas supera el capital pendiente inicial.');

    const prestamo: Prestamo = {
      ...borrador,
      descripcion: descripcion.trim() || (tipo === 'HIPOTECARIO' ? 'Hipoteca' : 'Préstamo personal'),
      entidad: entidad.trim() || undefined,
      notas: notas.trim() || undefined,
      creadoPor: prestamoParaEditar?.creadoPor || currentUser?.nombre,
      creadoPorId: prestamoParaEditar?.creadoPorId || currentUser?.id,
    };

    setGuardando(true);
    try {
      await onSave(prestamo);
      onClose();
    } finally {
      setGuardando(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 outline-none transition';
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';
  const plazoAnios = plazoNum ? (plazoNum / 12).toFixed(plazoNum % 12 === 0 ? 0 : 1) : '0';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl my-8 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center text-violet-700">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {isEditing ? 'Editar préstamo / hipoteca' : 'Nuevo préstamo / hipoteca'}
              </h3>
              <p className="text-xs text-slate-500">
                Cuadro de amortización francés: la cuota mensual se calcula sola.
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

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* Previsualización financiera */}
          <div className="p-4 rounded-2xl bg-violet-50/60 border border-violet-200">
            <div className="flex items-center gap-2 text-violet-800 text-xs font-bold mb-2">
              <Calculator className="w-4 h-4" /> Cuota resultante (sistema francés)
              {tramosLimpios.length > 0 && (
                <span className="ml-auto px-2 py-0.5 rounded bg-violet-100 text-violet-800 text-[10px] font-semibold">
                  Tipo variable · {tramosLimpios.length + 1} tramos
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-lg font-bold text-violet-900 leading-tight">
                  {cuotaInicial ? euro(cuotaInicial) : '—'}
                </p>
                <p className="text-[10px] text-violet-600">
                  {carenciaNum > 0 ? 'primera cuota tras carencia' : 'cuota mensual'}
                </p>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {resumen ? euro(resumen.r.totalIntereses) : '—'}
                </p>
                <p className="text-[10px] text-slate-500">intereses totales</p>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {resumen ? euro(resumen.r.totalPagado) : '—'}
                </p>
                <p className="text-[10px] text-slate-500">capital + intereses</p>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {resumen ? `${resumen.filas} recibos` : `${plazoNum || 0} cuotas`}
                </p>
                <p className="text-[10px] text-slate-500">{plazoAnios} años</p>
              </div>
            </div>
            {(carenciaNum > 0 || amortizacionesLimpias.length > 0) && (
              <p className="mt-2 text-[10px] text-violet-700">
                {carenciaNum > 0 &&
                  `Carencia inicial de ${carenciaNum} meses (${
                    tipoCarencia === 'TOTAL' ? 'total: no se paga, intereses al capital' : 'parcial: sólo intereses'
                  }). `}
                {amortizacionesLimpias.length > 0 &&
                  `${amortizacionesLimpias.length} amortización(es) anticipada(s) registradas.`}
              </p>
            )}
          </div>

          <div>
            <label className={labelCls}>Inmueble vinculado *</label>
            <select className={inputCls} value={inmuebleId} onChange={(e) => setInmuebleId(e.target.value)} disabled={isEditing}>
              {inmuebles.length === 0 && <option value="">Sin inmuebles</option>}
              {inmuebles.map((i) => (
                <option key={i.id} value={i.id}>
                  {labelInmueble(i)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Tipo de financiación</label>
              <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value as TipoPrestamo)}>
                <option value="HIPOTECARIO">Préstamo hipotecario</option>
                <option value="PERSONAL">Préstamo personal</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Entidad / banco</label>
              <input type="text" className={inputCls} value={entidad} onChange={(e) => setEntidad(e.target.value)} placeholder="IBERCAJA, ING…" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Capital pendiente (€) *</label>
              <input type="number" step="1000" min="0" className={inputCls} value={capital} onChange={(e) => setCapital(e.target.value)} placeholder="150000" />
            </div>
            <div>
              <label className={labelCls}>TIN anual (%) *</label>
              <input type="number" step="0.01" min="0" className={inputCls} value={tin} onChange={(e) => setTin(e.target.value)} placeholder="3,5" />
            </div>
            <div>
              <label className={labelCls}>Plazo (meses) *</label>
              <input type="number" step="12" min="1" max="600" className={inputCls} value={plazoMeses} onChange={(e) => setPlazoMeses(e.target.value)} placeholder="360" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Primera cuota *</label>
              <input type="month" className={inputCls} value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Día de cargo</label>
              <input type="number" min="1" max="28" className={inputCls} value={diaVencimiento} onChange={(e) => setDiaVencimiento(e.target.value)} />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                />
                Vigente
              </label>
            </div>
          </div>

          {/* Carencia inicial */}
          <div className="grid grid-cols-3 gap-4 items-end">
            <div>
              <label className={labelCls}>Carencia inicial (meses)</label>
              <input
                type="number"
                min="0"
                max={Math.max(plazoNum - 1, 0)}
                className={inputCls}
                value={carenciaMeses}
                onChange={(e) => setCarenciaMeses(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Tipo de carencia</label>
              <select
                className={inputCls}
                value={tipoCarencia}
                onChange={(e) => setTipoCarencia(e.target.value as TipoCarencia)}
                disabled={carenciaNum === 0}
              >
                <option value="TOTAL">Total (no se paga)</option>
                <option value="PARCIAL">Parcial (sólo intereses)</option>
              </select>
            </div>
            <p className="text-[10px] text-slate-400 leading-snug pb-2">
              En la carencia total los intereses se añaden al capital.
            </p>
          </div>

          {/* Tramos de tipo variable */}
          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className={labelCls + ' !mb-0'}>
                Revisiones de tipo (interés variable)
              </span>
              <button
                type="button"
                onClick={() =>
                  setTramos((prev) => [
                    ...prev,
                    {
                      id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                      fechaInicio: sumarMeses(fechaInicio || periodoActual(), 12),
                      tasa: tin,
                    },
                  ])
                }
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 px-2 py-1 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" /> Añadir revisión
              </button>
            </div>
            {tramos.length === 0 ? (
              <p className="text-[11px] text-slate-400">
                Sin tramos: se aplica el TIN inicial del {tinNum} % durante toda la vida.
              </p>
            ) : (
              tramos.map((t, idx) => (
                <div key={t.id} className="grid grid-cols-12 gap-2 items-center">
                  <span className="col-span-2 text-[11px] text-slate-500">Desde</span>
                  <input
                    type="month"
                    className={inputCls + ' col-span-4'}
                    value={t.fechaInicio}
                    onChange={(e) =>
                      setTramos((prev) =>
                        prev.map((x) => (x.id === t.id ? { ...x, fechaInicio: e.target.value } : x))
                      )
                    }
                  />
                  <input
                    type="number"
                    step="0.01"
                    className={inputCls + ' col-span-3'}
                    placeholder="nuevo TIN %"
                    value={t.tasa}
                    onChange={(e) =>
                      setTramos((prev) =>
                        prev.map((x) => (x.id === t.id ? { ...x, tasa: e.target.value } : x))
                      )
                    }
                  />
                  <span className="col-span-2 text-[11px] text-slate-400">% TIN</span>
                  <button
                    type="button"
                    onClick={() => setTramos((prev) => prev.filter((x) => x.id !== t.id))}
                    className="col-span-1 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg justify-self-end"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Amortizaciones anticipadas */}
          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className={labelCls + ' !mb-0'}>Amortizaciones anticipadas</span>
              <button
                type="button"
                onClick={() =>
                  setAmortizaciones((prev) => [
                    ...prev,
                    {
                      id: `am_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                      periodo: sumarMeses(fechaInicio || periodoActual(), 12),
                      importe: '',
                      modalidad: 'REDUCE_PLAZO' as ModalidadAmortizacion,
                    },
                  ])
                }
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 px-2 py-1 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" /> Añadir amortización
              </button>
            </div>
            {amortizaciones.length === 0 ? (
              <p className="text-[11px] text-slate-400">Sin amortizaciones anticipadas.</p>
            ) : (
              amortizaciones.map((a) => (
                <div key={a.id} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="month"
                    className={inputCls + ' col-span-4'}
                    value={a.periodo}
                    onChange={(e) =>
                      setAmortizaciones((prev) =>
                        prev.map((x) => (x.id === a.id ? { ...x, periodo: e.target.value } : x))
                      )
                    }
                  />
                  <input
                    type="number"
                    step="100"
                    className={inputCls + ' col-span-3'}
                    placeholder="importe €"
                    value={a.importe}
                    onChange={(e) =>
                      setAmortizaciones((prev) =>
                        prev.map((x) => (x.id === a.id ? { ...x, importe: e.target.value } : x))
                      )
                    }
                  />
                  <select
                    className={inputCls + ' col-span-4'}
                    value={a.modalidad}
                    onChange={(e) =>
                      setAmortizaciones((prev) =>
                        prev.map((x) =>
                          x.id === a.id ? { ...x, modalidad: e.target.value as ModalidadAmortizacion } : x
                        )
                      )
                    }
                  >
                    <option value="REDUCE_PLAZO">Reduce plazo</option>
                    <option value="REDUCE_CUOTA">Reduce cuota</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setAmortizaciones((prev) => prev.filter((x) => x.id !== a.id))}
                    className="col-span-1 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg justify-self-end"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div>
            <label className={labelCls}>Descripción</label>
            <input type="text" className={inputCls} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Notas</label>
            <textarea className={inputCls} rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Al guardar se crea o actualiza automáticamente el gasto recurrente mensual de la
            cuota, y cada recibo se desglosa en <b>capital</b> (amortiza deuda, no es gasto)
            e <b>intereses</b> (gasto financiero). Editar las condiciones no modifica los
            recibos ya generados.
          </p>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200/60 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={guardando}
            className="px-5 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>{guardando ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear préstamo'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
