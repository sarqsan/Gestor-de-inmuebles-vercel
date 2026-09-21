import React, { useState } from 'react';
import {
  X,
  Hammer,
  AlertTriangle,
  FileText,
  Calendar,
  DollarSign,
  Tag,
  Building,
  CheckCircle2,
  Upload,
} from 'lucide-react';
import {
  Inmueble,
  UsuarioApp,
  NecesidadReforma,
  CategoriaReforma,
  PrioridadIncidencia,
  EstadoNecesidadReforma,
} from '../../types';
import {
  CATEGORIA_REFORMA_LABELS,
  ESTADO_NECESIDAD_REFORMA_LABELS,
  crearNecesidadReforma,
  cambiarEstadoNecesidadReforma,
} from '../../utils/reformasEngine';
import { saveNecesidadReformaFirestore } from '../../lib/firebase';

interface NecesidadReformaModalProps {
  isOpen: boolean;
  onClose: () => void;
  inmuebles: Inmueble[];
  inmueblePreseleccionado?: Inmueble;
  necesidadParaEditar?: NecesidadReforma | null;
  currentUser?: UsuarioApp;
  onSaveSuccess?: (necesidad: NecesidadReforma) => void;
  onCrearProyecto?: (necesidad: NecesidadReforma) => void;
}

export const NecesidadReformaModal: React.FC<NecesidadReformaModalProps> = ({
  isOpen,
  onClose,
  inmuebles,
  inmueblePreseleccionado,
  necesidadParaEditar,
  currentUser,
  onSaveSuccess,
  onCrearProyecto,
}) => {
  const isEditing = Boolean(necesidadParaEditar);

  const [inmuebleId, setInmuebleId] = useState<string>(
    necesidadParaEditar?.inmuebleId || inmueblePreseleccionado?.id || inmuebles[0]?.id || ''
  );
  const [titulo, setTitulo] = useState<string>(necesidadParaEditar?.titulo || '');
  const [descripcion, setDescripcion] = useState<string>(necesidadParaEditar?.descripcion || '');
  const [categoria, setCategoria] = useState<CategoriaReforma>(
    (necesidadParaEditar?.categoria as CategoriaReforma) || 'INTEGRAL'
  );
  const [prioridad, setPrioridad] = useState<PrioridadIncidencia>(
    necesidadParaEditar?.prioridad || 'NORMAL'
  );
  const [estado, setEstado] = useState<EstadoNecesidadReforma>(
    necesidadParaEditar?.estado || 'IDENTIFICADA'
  );
  const [presupuestoEstimadoMin, setPresupuestoEstimadoMin] = useState<string>(
    necesidadParaEditar?.presupuestoEstimadoMin?.toString() || ''
  );
  const [presupuestoEstimadoMax, setPresupuestoEstimadoMax] = useState<string>(
    necesidadParaEditar?.presupuestoEstimadoMax?.toString() || ''
  );
  const [observaciones, setObservaciones] = useState<string>(
    necesidadParaEditar?.observaciones || ''
  );

  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const inmuebleSeleccionado = inmuebles.find((i) => i.id === inmuebleId);
  const propietarioId =
    inmuebleSeleccionado?.propietarioId ||
    currentUser?.propietarioId ||
    necesidadParaEditar?.propietarioId ||
    'prop_001';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      setErrorMsg('Indica un título descriptivo para la necesidad de reforma.');
      return;
    }
    if (!inmuebleId) {
      setErrorMsg('Debes seleccionar un inmueble.');
      return;
    }

    try {
      setGuardando(true);
      setErrorMsg('');

      const min = presupuestoEstimadoMin ? parseFloat(presupuestoEstimadoMin) : undefined;
      const max = presupuestoEstimadoMax ? parseFloat(presupuestoEstimadoMax) : undefined;

      let necesidadGuardar: NecesidadReforma;

      if (isEditing && necesidadParaEditar) {
        necesidadGuardar = {
          ...necesidadParaEditar,
          inmuebleId,
          inmuebleDireccion: inmuebleSeleccionado?.direccion,
          titulo: titulo.trim(),
          descripcion: descripcion.trim(),
          categoria,
          tipoReforma: categoria,
          prioridad,
          estado,
          presupuestoEstimadoMin: min,
          presupuestoEstimadoMax: max,
          observaciones: observaciones.trim() || undefined,
          updatedAt: new Date().toISOString(),
        };
      } else {
        necesidadGuardar = crearNecesidadReforma({
          inmuebleId,
          propietarioId,
          inmuebleDireccion: inmuebleSeleccionado?.direccion,
          titulo: titulo.trim(),
          descripcion: descripcion.trim(),
          categoria,
          prioridad,
          estado,
          presupuestoEstimadoMin: min,
          presupuestoEstimadoMax: max,
          observaciones: observaciones.trim() || undefined,
          creadoPor: currentUser?.nombre || 'Gestor Operativo',
        });
      }

      await saveNecesidadReformaFirestore(necesidadGuardar);

      if (onSaveSuccess) onSaveSuccess(necesidadGuardar);
      onClose();
    } catch (err: any) {
      console.error('Error guardando necesidad de reforma:', err);
      setErrorMsg(err?.message || 'Error al guardar la necesidad de reforma.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/10 border border-purple-600/20 flex items-center justify-center text-purple-600">
              <Hammer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {isEditing ? 'Modificar Necesidad de Reforma' : 'Identificar Necesidad de Reforma'}
              </h3>
              <p className="text-xs text-slate-500">
                Registro y diagnóstico operativo de intervenciones, mejoras o reformas del inmueble
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-rose-700 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Inmueble Selection */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Inmueble Afectado</label>
            <select
              value={inmuebleId}
              onChange={(e) => setInmuebleId(e.target.value)}
              disabled={isEditing && Boolean(necesidadParaEditar?.inmuebleId)}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500"
            >
              {inmuebles.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.alias || i.direccion} ({i.ciudad || 'Sin municipio'})
                </option>
              ))}
            </select>
          </div>

          {/* Title & Category */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-700 block mb-1">Título de la Reforma</label>
              <input
                type="text"
                placeholder="Ej: Reforma integral de cocina y sustitución de encimera"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-medium"
                required
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Tipo / Categoría</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaReforma)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500 font-medium"
              >
                {Object.entries(CATEGORIA_REFORMA_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Descripción de la Necesidad y Alcance</label>
            <textarea
              rows={3}
              placeholder="Detalla el estado actual, motivos de la reforma, elementos a renovar y expectativas técnicas..."
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500"
              required
            />
          </div>

          {/* Priority & Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Nivel de Prioridad</label>
              <select
                value={prioridad}
                onChange={(e) => setPrioridad(e.target.value as PrioridadIncidencia)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500"
              >
                <option value="BAJA">Baja (Mejora estética no urgente)</option>
                <option value="NORMAL">Normal (Planificada)</option>
                <option value="ALTA">Alta (Necesaria antes de comercializar)</option>
                <option value="URGENTE">Urgente (Deterioro estructural o funcional)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Estado de la Necesidad</label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoNecesidadReforma)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500"
              >
                {Object.entries(ESTADO_NECESIDAD_REFORMA_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Budget Range Estimation */}
          <div className="p-4 bg-purple-50/50 border border-purple-200/60 rounded-xl space-y-3">
            <span className="text-xs font-bold text-purple-900 uppercase tracking-wider block">
              Horquilla Presupuestaria Estimada (Orientativa)
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-2xs text-purple-800 font-semibold block mb-1">Presupuesto Mínimo (€)</label>
                <input
                  type="number"
                  step="10"
                  placeholder="Ej: 3000"
                  value={presupuestoEstimadoMin}
                  onChange={(e) => setPresupuestoEstimadoMin(e.target.value)}
                  className="w-full text-xs p-2 border border-purple-200 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="text-2xs text-purple-800 font-semibold block mb-1">Presupuesto Máximo (€)</label>
                <input
                  type="number"
                  step="10"
                  placeholder="Ej: 5500"
                  value={presupuestoEstimadoMax}
                  onChange={(e) => setPresupuestoEstimadoMax(e.target.value)}
                  className="w-full text-xs p-2 border border-purple-200 rounded-lg bg-white"
                />
              </div>
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Observaciones / Notas Internas</label>
            <textarea
              rows={2}
              placeholder="Instrucciones de acceso, consideraciones de comunidad de propietarios, plazos deseados..."
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            {isEditing && necesidadParaEditar && onCrearProyecto && (
              <button
                type="button"
                onClick={() => {
                  onCrearProyecto(necesidadParaEditar);
                  onClose();
                }}
                className="px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Aprobar y Crear Proyecto</span>
              </button>
            )}
            <div className="flex items-center space-x-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center space-x-1.5 disabled:opacity-50"
              >
                {guardando ? (
                  <span>Guardando...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isEditing ? 'Guardar Cambios' : 'Registrar Necesidad'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
