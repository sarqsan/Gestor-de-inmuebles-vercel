import React, { useMemo, useState } from 'react';
import { X, Landmark, Save, AlertCircle, Calculator } from 'lucide-react';
import type { Inmueble, Prestamo, TipoPrestamo, UsuarioApp } from '../../types';
import { periodoActual } from '../../utils/gastosEngine';
import {
  calcularCuotaConstante,
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
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [guardando, setGuardando] = useState<boolean>(false);

  const capitalNum = parseFloat(capital.replace(',', '.')) || 0;
  const tinNum = parseFloat(tin.replace(',', '.')) || 0;
  const plazoNum = parseInt(plazoMeses, 10) || 0;

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
      activo,
      createdAt: prestamoParaEditar?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [prestamoParaEditar, inmuebleId, tipo, capitalNum, tinNum, plazoNum, fechaInicio, diaVencimiento, activo]
  );

  const cuota = useMemo(
    () => calcularCuotaConstante(capitalNum, tinNum, plazoNum),
    [capitalNum, tinNum, plazoNum]
  );
  const resumen = useMemo(() => {
    if (!cuota) return null;
    const tabla = generarTablaAmortizacion(borrador);
    const r = resumenPrestamo(borrador, '9999-12'); // cuadro completo para la previsualización
    return { r, filas: tabla.length };
  }, [borrador, cuota]);

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!inmuebleId) return setErrorMsg('Selecciona el inmueble vinculado al préstamo.');
    if (capitalNum <= 0) return setErrorMsg('Introduce el capital pendiente inicial.');
    if (tinNum < 0 || tinNum > 30) return setErrorMsg('Revisa el TIN (porcentaje anual, p. ej. 3,5).');
    if (plazoNum <= 0 || plazoNum > 600) return setErrorMsg('Introduce un plazo en meses válido (1-600).');
    if (!fechaInicio) return setErrorMsg('Indica el mes de la primera cuota.');

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
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-lg font-bold text-violet-900 leading-tight">
                  {cuota ? euro(cuota) : '—'}
                </p>
                <p className="text-[10px] text-violet-600">cuota mensual</p>
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
                <p className="text-sm font-bold text-slate-800">{plazoAnios} años</p>
                <p className="text-[10px] text-slate-500">{plazoNum || 0} cuotas</p>
              </div>
            </div>
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
