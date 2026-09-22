import React, { useState, useEffect } from 'react';
import {
  TareaMantenimiento,
  Inmueble,
  Propietario,
  Profesional,
  UsuarioApp,
  PeriodicidadMantenimiento,
  TipoMantenimiento,
  CategoriaIncidencia,
} from '../../types';
import {
  PERIODICIDAD_LABELS,
  TIPO_MANTENIMIENTO_LABELS,
  calcularProximaFechaMantenimiento,
  evaluarEstadoSeguimiento,
} from '../../utils/mantenimientoEngine';
import { CATEGORIAS_INCIDENCIA_LABELS } from '../../utils/incidenciasEngine';
import {
  X,
  Wrench,
  Calendar,
  Building2,
  DollarSign,
  User,
  ShieldCheck,
  CheckCircle2,
  FileText,
  AlertCircle,
  Tag,
} from 'lucide-react';

interface TareaMantenimientoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tarea: TareaMantenimiento) => Promise<void>;
  inmuebles: Inmueble[];
  propietarios?: Propietario[];
  profesionales?: Profesional[];
  currentUser?: UsuarioApp;
  tareaToEdit?: TareaMantenimiento | null;
  defaultInmuebleId?: string;
}

export const TareaMantenimientoModal: React.FC<TareaMantenimientoModalProps> = ({
  isOpen,
  onClose,
  onSave,
  inmuebles,
  propietarios = [],
  profesionales = [],
  currentUser,
  tareaToEdit,
  defaultInmuebleId,
}) => {
  const [inmuebleId, setInmuebleId] = useState<string>('');
  const [titulo, setTitulo] = useState<string>('');
  const [descripcion, setDescripcion] = useState<string>('');
  const [elementoNombre, setElementoNombre] = useState<string>('');
  const [tipo, setTipo] = useState<TipoMantenimiento>('PREVENTIVO');
  const [categoria, setCategoria] = useState<CategoriaIncidencia>('CLIMATIZACION');
  const [periodicidad, setPeriodicidad] = useState<PeriodicidadMantenimiento>('ANUAL');
  const [diasIntervaloPersonalizado, setDiasIntervaloPersonalizado] = useState<number>(30);
  const [proximaFecha, setProximaFecha] = useState<string>('');
  const [costeEstimado, setCosteEstimado] = useState<string>('');
  const [responsableTipo, setResponsableTipo] = useState<'PROPIETARIO' | 'INQUILINO' | 'COMUNIDAD' | 'EMPRESA_MANTENIMIENTO'>('PROPIETARIO');
  const [profesionalPreferidoId, setProfesionalPreferidoId] = useState<string>('');
  const [notas, setNotas] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (tareaToEdit) {
      setInmuebleId(tareaToEdit.inmuebleId || '');
      setTitulo(tareaToEdit.titulo || '');
      setDescripcion(tareaToEdit.descripcion || '');
      setElementoNombre(tareaToEdit.elementoNombre || '');
      setTipo(tareaToEdit.tipo || 'PREVENTIVO');
      setCategoria(tareaToEdit.categoria || 'CLIMATIZACION');
      setPeriodicidad(tareaToEdit.periodicidad || 'ANUAL');
      setDiasIntervaloPersonalizado(tareaToEdit.diasIntervaloPersonalizado || 30);
      setProximaFecha(tareaToEdit.proximaFecha ? tareaToEdit.proximaFecha.split('T')[0] : '');
      setCosteEstimado(tareaToEdit.costeEstimado !== undefined ? String(tareaToEdit.costeEstimado) : '');
      setResponsableTipo(tareaToEdit.responsableTipo || 'PROPIETARIO');
      setProfesionalPreferidoId(tareaToEdit.profesionalPreferidoId || '');
      setNotas(tareaToEdit.notas || '');
    } else {
      const initInmueble = defaultInmuebleId || (inmuebles.length > 0 ? inmuebles[0].id : '');
      setInmuebleId(initInmueble);
      setTitulo('');
      setDescripcion('');
      setElementoNombre('');
      setTipo('PREVENTIVO');
      setCategoria('CLIMATIZACION');
      setPeriodicidad('ANUAL');
      setDiasIntervaloPersonalizado(30);
      
      // Default next date: calculated from today based on periodicity
      const calculatedDate = calcularProximaFechaMantenimiento(new Date(), 'ANUAL');
      setProximaFecha(calculatedDate.split('T')[0]);
      
      setCosteEstimado('');
      setResponsableTipo('PROPIETARIO');
      setProfesionalPreferidoId('');
      setNotas('');
    }
    setError(null);
  }, [isOpen, tareaToEdit, defaultInmuebleId, inmuebles]);

  if (!isOpen) return null;

  const handlePeriodicidadChange = (newPeriodicidad: PeriodicidadMantenimiento) => {
    setPeriodicidad(newPeriodicidad);
    if (!tareaToEdit) {
      const calculated = calcularProximaFechaMantenimiento(
        new Date(),
        newPeriodicidad,
        diasIntervaloPersonalizado
      );
      setProximaFecha(calculated.split('T')[0]);
    }
  };

  const handleDiasPersonalizadosChange = (dias: number) => {
    setDiasIntervaloPersonalizado(dias);
    if (periodicidad === 'PERSONALIZADA' && !tareaToEdit) {
      const calculated = calcularProximaFechaMantenimiento(
        new Date(),
        'PERSONALIZADA',
        dias
      );
      setProximaFecha(calculated.split('T')[0]);
    }
  };

  const selectedInmueble = inmuebles.find((i) => i.id === inmuebleId);
  const propietarioId = selectedInmueble?.propietarioId || currentUser?.propietarioId || 'admin';
  const selectedProfesional = profesionales.find((p) => p.id === profesionalPreferidoId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!inmuebleId) {
      setError('Debe seleccionar un inmueble.');
      return;
    }
    if (!titulo.trim()) {
      setError('El título de la tarea o plan es obligatorio.');
      return;
    }
    if (!proximaFecha) {
      setError('Debe especificar la próxima fecha de actuación prevista.');
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const estadoSeg = evaluarEstadoSeguimiento(proximaFecha, true);

      const tareaData: TareaMantenimiento = {
        id: tareaToEdit ? tareaToEdit.id : `mant_${inmuebleId}_${Date.now()}`,
        inmuebleId,
        inmuebleDireccion: selectedInmueble ? `${selectedInmueble.alias || selectedInmueble.direccion}` : '',
        propietarioId,
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || undefined,
        elementoNombre: elementoNombre.trim() || undefined,
        tipo,
        categoria,
        periodicidad,
        diasIntervaloPersonalizado: periodicidad === 'PERSONALIZADA' ? diasIntervaloPersonalizado : undefined,
        fechaInicio: tareaToEdit?.fechaInicio || now,
        ultimaFecha: tareaToEdit?.ultimaFecha || undefined,
        ultimaFechaRealizada: tareaToEdit?.ultimaFechaRealizada || undefined,
        proximaFecha: new Date(proximaFecha).toISOString(),
        responsableTipo,
        profesionalPreferidoId: profesionalPreferidoId || undefined,
        profesionalPreferidoNombre: selectedProfesional
          ? (selectedProfesional.nombreEmpresa || selectedProfesional.nombreContacto)
          : undefined,
        activa: true,
        estadoSeguimiento: estadoSeg,
        costeEstimado: costeEstimado ? parseFloat(costeEstimado) : undefined,
        ultimoCosteReal: tareaToEdit?.ultimoCosteReal,
        ultimaOrdenTrabajoId: tareaToEdit?.ultimaOrdenTrabajoId,
        ultimoPresupuestoId: tareaToEdit?.ultimoPresupuestoId,
        ultimoGastoId: tareaToEdit?.ultimoGastoId,
        ultimaIncidenciaId: tareaToEdit?.ultimaIncidenciaId,
        garantiaId: tareaToEdit?.garantiaId,
        historialActuaciones: tareaToEdit?.historialActuaciones || [],
        documentos: tareaToEdit?.documentos || [],
        notas: notas.trim() || undefined,
        creadoPor: currentUser?.id || 'admin',
        createdAt: tareaToEdit ? tareaToEdit.createdAt : now,
        updatedAt: now,
      };

      await onSave(tareaData);
      onClose();
    } catch (err: any) {
      console.error('Error saving maintenance task:', err);
      setError(err?.message || 'Error al guardar el plan de mantenimiento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Cabecera */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {tareaToEdit ? 'Editar Plan / Tarea de Mantenimiento' : 'Nuevo Plan de Mantenimiento Preventivo'}
              </h2>
              <p className="text-xs text-slate-500">
                Planificación determinista, revisiones periódicas e inventario técnico
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-700">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Inmueble y Tipo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Inmueble / Propiedad <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <select
                  value={inmuebleId}
                  onChange={(e) => setInmuebleId(e.target.value)}
                  disabled={Boolean(tareaToEdit)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900 focus:bg-white focus:border-blue-500 outline-none disabled:opacity-60"
                  required
                >
                  <option value="">Seleccione inmueble...</option>
                  {inmuebles.map((inm) => (
                    <option key={inm.id} value={inm.id}>
                      {inm.alias ? `${inm.alias} - ${inm.direccion}` : inm.direccion}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Tipo de Mantenimiento
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoMantenimiento)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
              >
                {Object.entries(TIPO_MANTENIMIENTO_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Título y Elemento Inventario */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Título del Plan / Actuación <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej. Revisión anual de caldera y circuito calefacción"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 outline-none font-medium"
                required
              />
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Elemento / Equipo
              </label>
              <input
                type="text"
                value={elementoNombre}
                onChange={(e) => setElementoNombre(e.target.value)}
                placeholder="Ej. Caldera Junkers 24kW"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Categoría y Periodicidad */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Gremio / Categoría Técnica
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaIncidencia)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
              >
                {Object.entries(CATEGORIAS_INCIDENCIA_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Frecuencia / Periodicidad
              </label>
              <select
                value={periodicidad}
                onChange={(e) => handlePeriodicidadChange(e.target.value as PeriodicidadMantenimiento)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
              >
                {Object.entries(PERIODICIDAD_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Días personalizados si aplica */}
          {periodicidad === 'PERSONALIZADA' && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
              <span className="font-semibold text-blue-900">Intervalo de recurrencia en días:</span>
              <input
                type="number"
                min="1"
                max="1825"
                value={diasIntervaloPersonalizado}
                onChange={(e) => handleDiasPersonalizadosChange(parseInt(e.target.value, 10) || 30)}
                className="w-24 px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-right font-bold text-blue-900 outline-none"
              />
            </div>
          )}

          {/* Próxima Fecha y Coste Estimado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Próxima Fecha de Actuación Prevista <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="date"
                  value={proximaFecha}
                  onChange={(e) => setProximaFecha(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Coste Estimado (€)
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costeEstimado}
                  onChange={(e) => setCosteEstimado(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 outline-none text-right font-mono font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Responsable y Profesional Preferido */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Responsable de la Actuación
              </label>
              <select
                value={responsableTipo}
                onChange={(e) => setResponsableTipo(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
              >
                <option value="PROPIETARIO">Propietario / Arrendador</option>
                <option value="INQUILINO">Inquilino / Arrendatario</option>
                <option value="COMUNIDAD">Comunidad de Propietarios</option>
                <option value="EMPRESA_MANTENIMIENTO">Empresa de Mantenimiento Contratada</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Profesional / Empresa Preferida
              </label>
              <select
                value={profesionalPreferidoId}
                onChange={(e) => setProfesionalPreferidoId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
              >
                <option value="">Sin asignar (seleccionar al emitir OT)</option>
                {profesionales.map((prof) => (
                  <option key={prof.id} value={prof.id}>
                    {prof.nombreEmpresa || prof.nombreContacto} ({prof.especialidadPrincipal})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Descripción / Instrucciones Técnicas */}
          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Descripción del Alcance / Puntos de Inspección
            </label>
            <textarea
              rows={3}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalle los puntos a comprobar (presión de caldera, limpieza de quemadores, sustitución de filtros, purgado de radiadores...)"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
            />
          </div>

          {/* Notas Internas */}
          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Notas Adicionales / Garantía / Referencias
            </label>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej. Contrato SAT oficial nº 98412 / Garantía hasta 2027"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
            />
          </div>

          {/* Pie y Acciones */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-bold shadow-md shadow-blue-600/20 transition-all flex items-center gap-2"
            >
              {saving ? (
                <span>Guardando...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{tareaToEdit ? 'Actualizar Plan' : 'Crear Plan de Mantenimiento'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
