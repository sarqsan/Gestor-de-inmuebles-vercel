import React, { useMemo, useState } from 'react';
import {
  X,
  TrendingDown,
  Home,
  Landmark,
  Save,
  AlertCircle,
} from 'lucide-react';
import type {
  CategoriaGasto,
  EstadoGasto,
  Gasto,
  Inmueble,
  TipoGasto,
  UsuarioApp,
} from '../../types';
import {
  CATEGORIAS_GASTO,
  categoriaDef,
  crearGasto,
  normalizarGasto,
  tipoDeCategoria,
} from '../../utils/gastosEngine';

interface GastoModalProps {
  gastoParaEditar?: Gasto | null;
  inmuebles: Inmueble[];
  inmuebleIdInicial?: string;
  currentUser?: UsuarioApp | null;
  onSave: (gasto: Gasto) => Promise<void> | void;
  onClose: () => void;
}

const labelInmueble = (i: Inmueble): string =>
  `${i.direccion}${i.ciudad ? `, ${i.ciudad}` : ''}`;

export const GastoModal: React.FC<GastoModalProps> = ({
  gastoParaEditar,
  inmuebles,
  inmuebleIdInicial,
  currentUser,
  onSave,
  onClose,
}) => {
  const isEditing = !!gastoParaEditar;
  const hoy = new Date().toISOString().split('T')[0];

  const [inmuebleId, setInmuebleId] = useState<string>(
    gastoParaEditar?.inmuebleId || inmuebleIdInicial || inmuebles[0]?.id || ''
  );
  const [categoria, setCategoria] = useState<CategoriaGasto>(
    gastoParaEditar?.categoria || 'COMUNIDAD'
  );
  const [concepto, setConcepto] = useState<string>(gastoParaEditar?.concepto || '');
  const [proveedor, setProveedor] = useState<string>(gastoParaEditar?.proveedor || '');
  const [importe, setImporte] = useState<string>(
    gastoParaEditar ? String(gastoParaEditar.importe || '') : ''
  );
  const [estado, setEstado] = useState<EstadoGasto>(gastoParaEditar?.estado || 'PENDIENTE');
  const [fechaDevengo, setFechaDevengo] = useState<string>(
    gastoParaEditar?.fechaDevengo || hoy
  );
  const [fechaPago, setFechaPago] = useState<string>(gastoParaEditar?.fechaPago || '');
  const [aCargoDe, setACargoDe] = useState<'arrendador' | 'arrendatario'>(
    gastoParaEditar?.aCargoDe || 'arrendador'
  );
  const [deducible, setDeducible] = useState<boolean>(
    gastoParaEditar?.deducible ?? true
  );
  const [capitalAmortizado, setCapitalAmortizado] = useState<string>(
    gastoParaEditar?.capitalAmortizado != null ? String(gastoParaEditar.capitalAmortizado) : ''
  );
  const [intereses, setIntereses] = useState<string>(
    gastoParaEditar?.intereses != null ? String(gastoParaEditar.intereses) : ''
  );
  const [metodoPago, setMetodoPago] = useState<Gasto['metodoPago']>(
    gastoParaEditar?.metodoPago || 'transferencia'
  );
  const [notas, setNotas] = useState<string>(gastoParaEditar?.notas || '');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [guardando, setGuardando] = useState<boolean>(false);

  const tipo: TipoGasto = tipoDeCategoria(categoria);
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
    if (!inmuebleId) {
      setErrorMsg('Selecciona el inmueble al que pertenece el gasto.');
      return;
    }
    if (importeNum <= 0) {
      setErrorMsg('Introduce un importe válido mayor que cero.');
      return;
    }

    const base = gastoParaEditar
      ? { ...gastoParaEditar }
      : crearGasto({
          inmuebleId,
          propietarioId: '', // Lo asegura el handler de App según el inmueble / usuario.
          categoria,
          concepto,
          importe: importeNum,
          fechaDevengo,
          creadoPor: currentUser?.nombre,
          creadoPorId: currentUser?.id,
        });

    const gasto: Gasto = {
      ...base,
      inmuebleId,
      categoria,
      concepto: concepto.trim() || categoriaDef(categoria).label,
      proveedor: proveedor.trim() || undefined,
      importe: importeNum,
      estado,
      fechaDevengo: fechaDevengo || undefined,
      fechaPago: fechaPago || undefined,
      aCargoDe,
      deducible: esFinanciacion ? false : deducible,
      capitalAmortizado: esFinanciacion && capitalAmortizado !== ''
        ? parseFloat(capitalAmortizado.replace(',', '.')) || 0
        : undefined,
      intereses: esFinanciacion && intereses !== ''
        ? parseFloat(intereses.replace(',', '.')) || 0
        : undefined,
      metodoPago,
      notas: notas.trim() || undefined,
    };

    setGuardando(true);
    try {
      await onSave(normalizarGasto(gasto));
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
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                esFinanciacion
                  ? 'bg-violet-50 border-violet-200 text-violet-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {isEditing ? 'Editar gasto' : 'Nuevo gasto'}
              </h3>
              <p className="text-xs text-slate-500">
                Explotación (coste del alquiler) o financiación (cuota hipotecaria)
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

          {/* Selector de naturaleza (lo más importante de la fase) */}
          <div>
            <span className={labelCls}>Naturaleza del gasto</span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => seleccionarTipo('EXPLOTACION')}
                className={`text-left p-3 rounded-xl border-2 transition ${
                  !esFinanciacion
                    ? 'border-amber-500 bg-amber-50/60'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                  <Home className="w-4 h-4" /> Explotación
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Comunidad, IBI, seguros, reparaciones, comisiones… computan al
                  resultado del alquiler.
                </p>
              </button>
              <button
                type="button"
                onClick={() => seleccionarTipo('FINANCIACION')}
                className={`text-left p-3 rounded-xl border-2 transition ${
                  esFinanciacion
                    ? 'border-violet-500 bg-violet-50/60'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 text-violet-700 font-semibold text-sm">
                  <Landmark className="w-4 h-4" /> Financiación
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Cuota hipotecaria: salida de caja. El capital no es gasto; solo
                  los intereses son gasto financiero.
                </p>
              </button>
            </div>
          </div>

          {/* Inmueble */}
          <div>
            <label className={labelCls}>Inmueble *</label>
            <select
              className={inputCls}
              value={inmuebleId}
              onChange={(e) => setInmuebleId(e.target.value)}
              disabled={isEditing}
            >
              {inmuebles.length === 0 && <option value="">Sin inmuebles</option>}
              {inmuebles.map((i) => (
                <option key={i.id} value={i.id}>
                  {labelInmueble(i)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Categoría */}
            <div>
              <label className={labelCls}>Categoría *</label>
              <select
                className={inputCls}
                value={categoria}
                onChange={(e) => handleSeleccionCategoria(e.target.value as CategoriaGasto)}
              >
                {categoriasDelTipo.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {/* Estado */}
            <div>
              <label className={labelCls}>Estado</label>
              <select
                className={inputCls}
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoGasto)}
              >
                <option value="PENDIENTE">Pendiente</option>
                <option value="PAGADO">Pagado</option>
                <option value="ANULADO">Anulado</option>
              </select>
            </div>
          </div>

          {/* Concepto y proveedor */}
          <div className="grid grid-cols-2 gap-4">
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
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Importe */}
            <div>
              <label className={labelCls}>Importe total (€) *</label>
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
            {/* Fecha devengo */}
            <div>
              <label className={labelCls}>Fecha factura / devengo</label>
              <input
                type="date"
                className={inputCls}
                value={fechaDevengo}
                onChange={(e) => setFechaDevengo(e.target.value)}
              />
            </div>
            {/* Fecha pago */}
            <div>
              <label className={labelCls}>Fecha de pago</label>
              <input
                type="date"
                className={inputCls}
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                disabled={estado !== 'PAGADO'}
              />
            </div>
          </div>

          {/* Desglose financiero (solo hipoteca / financiación) */}
          {esFinanciacion && (
            <div className="p-4 rounded-xl bg-violet-50/60 border border-violet-200 space-y-3">
              <p className="text-xs font-semibold text-violet-800">
                Desglose de la cuota (opcional, para separar capital e intereses)
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Capital amortizado (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputCls}
                    value={capitalAmortizado}
                    onChange={(e) => setCapitalAmortizado(e.target.value)}
                    placeholder="No es gasto"
                  />
                </div>
                <div>
                  <label className={labelCls}>Intereses (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputCls}
                    value={intereses}
                    onChange={(e) => setIntereses(e.target.value)}
                    placeholder="Gasto financiero"
                  />
                </div>
                <div className="flex items-end">
                  <div className="text-[11px] text-violet-700 leading-snug pb-2">
                    Suma sugerida:{' '}
                    <b>
                      {(
                        (parseFloat(capitalAmortizado.replace(',', '.')) || 0) +
                        (parseFloat(intereses.replace(',', '.')) || 0)
                      ).toFixed(2)}{' '}
                      €
                    </b>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* A cargo de */}
            <div>
              <label className={labelCls}>Coste a cargo de</label>
              <select
                className={inputCls}
                value={aCargoDe}
                onChange={(e) => setACargoDe(e.target.value as 'arrendador' | 'arrendatario')}
              >
                <option value="arrendador">Arrendador (propietario)</option>
                <option value="arrendatario">Arrendatario (inquilino)</option>
              </select>
            </div>
            {/* Método de pago */}
            <div>
              <label className={labelCls}>Método de pago</label>
              <select
                className={inputCls}
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as Gasto['metodoPago'])}
              >
                <option value="transferencia">Transferencia</option>
                <option value="domiciliacion">Domiciliación</option>
                <option value="bizum">Bizum</option>
                <option value="efectivo">Efectivo</option>
                <option value="otro">Otro</option>
              </select>
            </div>
          </div>

          {/* Deducible (solo explotación) */}
          {!esFinanciacion && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                checked={deducible}
                onChange={(e) => setDeducible(e.target.checked)}
              />
              Deducible fiscalmente en el IRPF del alquiler
            </label>
          )}

          {/* Notas */}
          <div>
            <label className={labelCls}>Notas</label>
            <textarea
              className={inputCls}
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones internas…"
            />
          </div>
        </div>

        {/* Footer */}
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
            <span>{guardando ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Registrar gasto'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
