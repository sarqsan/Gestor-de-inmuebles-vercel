import React, { useMemo, useState } from 'react';
import {
  X,
  Repeat,
  Home,
  Landmark,
  Save,
  AlertCircle,
} from 'lucide-react';
import type {
  CategoriaGasto,
  FrecuenciaRecurrente,
  Gasto,
  GastoRecurrente,
  Inmueble,
  TipoGasto,
  UsuarioApp,
} from '../../types';
import {
  CATEGORIAS_GASTO,
  categoriaDef,
  crearGastoRecurrente,
  FRECUENCIA_LABEL,
  normalizarRecurrente,
  periodoActual,
} from '../../utils/gastosEngine';

interface Props {
  plantillaParaEditar?: GastoRecurrente | null;
  inmuebles: Inmueble[];
  inmuebleIdInicial?: string;
  currentUser?: UsuarioApp | null;
  onSave: (plantilla: GastoRecurrente) => Promise<void> | void;
  onClose: () => void;
}

const labelInmueble = (i: Inmueble): string =>
  `${i.direccion}${i.ciudad ? `, ${i.ciudad}` : ''}`;

export const GastoRecurrenteModal: React.FC<Props> = ({
  plantillaParaEditar,
  inmuebles,
  inmuebleIdInicial,
  currentUser,
  onSave,
  onClose,
}) => {
  const isEditing = !!plantillaParaEditar;

  const [inmuebleId, setInmuebleId] = useState<string>(
    plantillaParaEditar?.inmuebleId || inmuebleIdInicial || inmuebles[0]?.id || ''
  );
  const [categoria, setCategoria] = useState<CategoriaGasto>(
    plantillaParaEditar?.categoria || 'COMUNIDAD'
  );
  const [concepto, setConcepto] = useState<string>(plantillaParaEditar?.concepto || '');
  const [proveedor, setProveedor] = useState<string>(plantillaParaEditar?.proveedor || '');
  const [importe, setImporte] = useState<string>(
    plantillaParaEditar ? String(plantillaParaEditar.importe || '') : ''
  );
  const [frecuencia, setFrecuencia] = useState<FrecuenciaRecurrente>(
    plantillaParaEditar?.frecuencia || 'MENSUAL'
  );
  const [diaVencimiento, setDiaVencimiento] = useState<string>(
    String(plantillaParaEditar?.diaVencimiento || 1)
  );
  const [fechaInicio, setFechaInicio] = useState<string>(
    plantillaParaEditar?.fechaInicio || periodoActual()
  );
  const [fechaFin, setFechaFin] = useState<string>(plantillaParaEditar?.fechaFin || '');
  const [aCargoDe, setACargoDe] = useState<'arrendador' | 'arrendatario'>(
    plantillaParaEditar?.aCargoDe || 'arrendador'
  );
  const [deducible, setDeducible] = useState<boolean>(
    plantillaParaEditar?.deducible ?? true
  );
  const [metodoPago, setMetodoPago] = useState<Gasto['metodoPago']>(
    plantillaParaEditar?.metodoPago || 'domiciliacion'
  );
  const [activo, setActivo] = useState<boolean>(plantillaParaEditar?.activo ?? true);
  const [notas, setNotas] = useState<string>(plantillaParaEditar?.notas || '');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [guardando, setGuardando] = useState<boolean>(false);

  const tipo: TipoGasto = categoriaDef(categoria).tipo;
  const esFinanciacion = tipo === 'FINANCIACION';

  const categoriasDelTipo = useMemo(
    () => CATEGORIAS_GASTO.filter((c) => c.tipo === tipo),
    [tipo]
  );

  const seleccionarTipo = (nuevoTipo: TipoGasto) => {
    if (nuevoTipo === tipo) return;
    const primera = CATEGORIAS_GASTO.find((c) => c.tipo === nuevoTipo);
    if (primera) {
      setCategoria(primera.value);
      setDeducible(primera.deduciblePorDefecto);
      setACargoDe(primera.aCargoDePorDefecto);
    }
  };

  const handleSeleccionCategoria = (cat: CategoriaGasto) => {
    setCategoria(cat);
    const def = categoriaDef(cat);
    setDeducible(def.deduciblePorDefecto);
    setACargoDe(def.aCargoDePorDefecto);
  };

  const importeNum = parseFloat(importe.replace(',', '.')) || 0;

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!inmuebleId) return setErrorMsg('Selecciona el inmueble.');
    if (importeNum <= 0) return setErrorMsg('Introduce un importe válido mayor que cero.');
    if (!fechaInicio) return setErrorMsg('Indica el mes de inicio.');
    if (fechaFin && fechaFin < fechaInicio)
      return setErrorMsg('La fecha de fin no puede ser anterior al inicio.');

    const base = plantillaParaEditar
      ? { ...plantillaParaEditar }
      : crearGastoRecurrente({
          inmuebleId,
          propietarioId: '', // Lo asegura el handler de App.
          categoria,
          concepto,
          importe: importeNum,
          frecuencia,
          diaVencimiento: Math.min(Math.max(parseInt(diaVencimiento, 10) || 1, 1), 28),
          fechaInicio,
          creadoPor: currentUser?.nombre,
          creadoPorId: currentUser?.id,
        });

    const plantilla: GastoRecurrente = {
      ...base,
      inmuebleId,
      categoria,
      concepto: concepto.trim() || categoriaDef(categoria).label,
      proveedor: proveedor.trim() || undefined,
      importe: importeNum,
      frecuencia,
      diaVencimiento: Math.min(Math.max(parseInt(diaVencimiento, 10) || 1, 1), 28),
      fechaInicio,
      fechaFin: fechaFin || undefined,
      aCargoDe,
      deducible: esFinanciacion ? false : deducible,
      metodoPago,
      notas: notas.trim() || undefined,
      activo,
    };

    setGuardando(true);
    try {
      await onSave(normalizarRecurrente(plantilla));
      onClose();
    } finally {
      setGuardando(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none transition';
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';

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
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                esFinanciacion
                  ? 'bg-violet-50 border-violet-200 text-violet-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              <Repeat className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {isEditing ? 'Editar gasto recurrente' : 'Nuevo gasto recurrente'}
              </h3>
              <p className="text-xs text-slate-500">
                Genera automáticamente los apuntes pendientes cada período.
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

          {/* Naturaleza */}
          <div>
            <span className={labelCls}>Naturaleza del gasto</span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => seleccionarTipo('EXPLOTACION')}
                className={`text-left p-3 rounded-xl border-2 transition ${
                  !esFinanciacion ? 'border-amber-500 bg-amber-50/60' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                  <Home className="w-4 h-4" /> Explotación
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Comunidad, IBI, seguros, suministros…
                </p>
              </button>
              <button
                type="button"
                onClick={() => seleccionarTipo('FINANCIACION')}
                className={`text-left p-3 rounded-xl border-2 transition ${
                  esFinanciacion ? 'border-violet-500 bg-violet-50/60' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 text-violet-700 font-semibold text-sm">
                  <Landmark className="w-4 h-4" /> Financiación
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Cuota hipotecaria periódica.
                </p>
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>Inmueble *</label>
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
              <label className={labelCls}>Categoría *</label>
              <select className={inputCls} value={categoria} onChange={(e) => handleSeleccionCategoria(e.target.value as CategoriaGasto)}>
                {categoriasDelTipo.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Concepto</label>
              <input
                type="text"
                className={inputCls}
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder={categoriaDef(categoria).label}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Importe (€) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputCls}
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <label className={labelCls}>Frecuencia *</label>
              <select className={inputCls} value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as FrecuenciaRecurrente)}>
                {(Object.keys(FRECUENCIA_LABEL) as FrecuenciaRecurrente[]).map((f) => (
                  <option key={f} value={f}>
                    {FRECUENCIA_LABEL[f]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Día de vencimiento</label>
              <input
                type="number"
                min="1"
                max="28"
                className={inputCls}
                value={diaVencimiento}
                onChange={(e) => setDiaVencimiento(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Mes de inicio *</label>
              <input type="month" className={inputCls} value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Mes de fin (opcional)</label>
              <input type="month" className={inputCls} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Coste a cargo de</label>
              <select
                className={inputCls}
                value={aCargoDe}
                onChange={(e) => setACargoDe(e.target.value as 'arrendador' | 'arrendatario')}
              >
                <option value="arrendador">Arrendador</option>
                <option value="arrendatario">Arrendatario</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Método de pago</label>
              <select className={inputCls} value={metodoPago} onChange={(e) => setMetodoPago(e.target.value as Gasto['metodoPago'])}>
                <option value="domiciliacion">Domiciliación</option>
                <option value="transferencia">Transferencia</option>
                <option value="bizum">Bizum</option>
                <option value="efectivo">Efectivo</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div className="flex items-end gap-4 pb-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                />
                Activa
              </label>
              {!esFinanciacion && (
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    checked={deducible}
                    onChange={(e) => setDeducible(e.target.checked)}
                  />
                  Deducible
                </label>
              )}
            </div>
          </div>

          <div>
            <label className={labelCls}>Proveedor / Acreedor</label>
            <input
              type="text"
              className={inputCls}
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              placeholder="Comunidad, banco, empresa…"
            />
          </div>

          <div>
            <label className={labelCls}>Notas</label>
            <textarea className={inputCls} rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Los apuntes se generan en estado <b>pendiente</b> hasta el mes en curso (se
            recuperan como máximo los últimos 12 meses). Los ya generados no se
            modifican ni se borran al desactivar o eliminar esta plantilla.
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
            className={`px-5 py-2 text-sm font-semibold text-white rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center space-x-2 ${
              esFinanciacion ? 'bg-violet-600 hover:bg-violet-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>{guardando ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear recurrente'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
