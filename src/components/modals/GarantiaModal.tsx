import React, { useState, useEffect } from 'react';
import {
  GarantiaReparacion,
  Inmueble,
  Propietario,
  Profesional,
  UsuarioApp,
  EstadoGarantia,
} from '../../types';
import {
  calcularFechaFinGarantia,
  evaluarEstadoGarantia,
} from '../../utils/mantenimientoEngine';
import {
  X,
  ShieldCheck,
  Calendar,
  Building2,
  User,
  FileText,
  AlertCircle,
  Clock,
  CheckCircle2,
} from 'lucide-react';

interface GarantiaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (garantia: GarantiaReparacion) => Promise<void>;
  inmuebles: Inmueble[];
  propietarios?: Propietario[];
  profesionales?: Profesional[];
  currentUser?: UsuarioApp;
  garantiaToEdit?: GarantiaReparacion | null;
  defaultInmuebleId?: string;
}

export const GarantiaModal: React.FC<GarantiaModalProps> = ({
  isOpen,
  onClose,
  onSave,
  inmuebles,
  propietarios = [],
  profesionales = [],
  currentUser,
  garantiaToEdit,
  defaultInmuebleId,
}) => {
  const [inmuebleId, setInmuebleId] = useState<string>('');
  const [titulo, setTitulo] = useState<string>('');
  const [elementoNombre, setElementoNombre] = useState<string>('');
  const [descripcion, setDescripcion] = useState<string>('');
  const [proveedor, setProveedor] = useState<string>('');
  const [profesionalId, setProfesionalId] = useState<string>('');
  const [fechaInicio, setFechaInicio] = useState<string>('');
  const [duracionMeses, setDuracionMeses] = useState<number>(6);
  const [fechaFin, setFechaFin] = useState<string>('');
  const [estado, setEstado] = useState<EstadoGarantia>('GARANTIA_ACTIVA');
  const [coberturaDetalle, setCoberturaDetalle] = useState<string>('Mano de obra y materiales sustituidos.');
  const [notas, setNotas] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (garantiaToEdit) {
      setInmuebleId(garantiaToEdit.inmuebleId || '');
      setTitulo(garantiaToEdit.titulo || '');
      setElementoNombre(garantiaToEdit.elementoNombre || '');
      setDescripcion(garantiaToEdit.descripcion || '');
      setProveedor(garantiaToEdit.proveedor || '');
      setProfesionalId(garantiaToEdit.profesionalId || '');
      setFechaInicio(garantiaToEdit.fechaInicio ? garantiaToEdit.fechaInicio.split('T')[0] : '');
      setDuracionMeses(garantiaToEdit.duracionMeses || 6);
      setFechaFin(garantiaToEdit.fechaFin ? garantiaToEdit.fechaFin.split('T')[0] : '');
      setEstado(garantiaToEdit.estado || 'GARANTIA_ACTIVA');
      setCoberturaDetalle(garantiaToEdit.coberturaDetalle || 'Mano de obra y materiales sustituidos.');
      setNotas(garantiaToEdit.notas || '');
    } else {
      const initInmueble = defaultInmuebleId || (inmuebles.length > 0 ? inmuebles[0].id : '');
      const today = new Date().toISOString().split('T')[0];
      setInmuebleId(initInmueble);
      setTitulo('');
      setElementoNombre('');
      setDescripcion('');
      setProveedor('');
      setProfesionalId('');
      setFechaInicio(today);
      setDuracionMeses(6);
      const ff = calcularFechaFinGarantia(today, 6).split('T')[0];
      setFechaFin(ff);
      setEstado('GARANTIA_ACTIVA');
      setCoberturaDetalle('Mano de obra y piezas sustituidas durante la reparación.');
      setNotas('');
    }
    setError(null);
  }, [isOpen, garantiaToEdit, defaultInmuebleId, inmuebles]);

  if (!isOpen) return null;

  const handleFechaInicioChange = (fIni: string) => {
    setFechaInicio(fIni);
    if (fIni && duracionMeses > 0) {
      const ff = calcularFechaFinGarantia(fIni, duracionMeses).split('T')[0];
      setFechaFin(ff);
      setEstado(evaluarEstadoGarantia(ff));
    }
  };

  const handleDuracionChange = (meses: number) => {
    setDuracionMeses(meses);
    if (fechaInicio && meses > 0) {
      const ff = calcularFechaFinGarantia(fechaInicio, meses).split('T')[0];
      setFechaFin(ff);
      setEstado(evaluarEstadoGarantia(ff));
    }
  };

  const handleProfesionalChange = (pId: string) => {
    setProfesionalId(pId);
    if (pId) {
      const prof = profesionales.find((p) => p.id === pId);
      if (prof) {
        setProveedor(prof.nombreEmpresa || prof.nombreContacto);
      }
    }
  };

  const selectedInmueble = inmuebles.find((i) => i.id === inmuebleId);
  const propietarioId = selectedInmueble?.propietarioId || currentUser?.propietarioId || 'admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!inmuebleId) {
      setError('Debe seleccionar un inmueble.');
      return;
    }
    if (!titulo.trim()) {
      setError('El título o concepto de la garantía es obligatorio.');
      return;
    }
    if (!fechaInicio) {
      setError('Indique la fecha de inicio de la garantía.');
      return;
    }
    if (!fechaFin) {
      setError('Indique la fecha de vencimiento de la garantía.');
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const estadoCalculado = evaluarEstadoGarantia(fechaFin);

      const garantiaData: GarantiaReparacion = {
        id: garantiaToEdit ? garantiaToEdit.id : `gar_${inmuebleId}_${Date.now()}`,
        inmuebleId,
        inmuebleDireccion: selectedInmueble ? `${selectedInmueble.alias || selectedInmueble.direccion}` : '',
        propietarioId,
        trabajoId: garantiaToEdit?.trabajoId || `ot_manual_${Date.now()}`,
        elementoNombre: elementoNombre.trim() || undefined,
        titulo: titulo.trim(),
        concepto: descripcion.trim() || titulo.trim(),
        categoria: 'MANTENIMIENTO' as any,
        fechaInicio: new Date(fechaInicio).toISOString().slice(0, 10),
        duracionMeses,
        fechaFin: new Date(fechaFin).toISOString().slice(0, 10),
        proveedor: proveedor.trim() || 'Servicio Técnico',
        profesionalId: profesionalId || undefined,
        incidenciaId: garantiaToEdit?.incidenciaId,
        presupuestoId: garantiaToEdit?.presupuestoId,
        gastoId: garantiaToEdit?.gastoId,
        estado: estado === 'RECLAMADA' ? 'RECLAMADA' : estadoCalculado,
        cobertura: coberturaDetalle.trim() || 'Mano de obra y materiales cubiertos.',
        notas: notas.trim() || undefined,
        createdAt: garantiaToEdit ? garantiaToEdit.createdAt : now,
        updatedAt: now,
      };

      await onSave(garantiaData);
      onClose();
    } catch (err: any) {
      console.error('Error saving warranty:', err);
      setError(err?.message || 'Error al guardar el registro de garantía.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-emerald-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {garantiaToEdit ? 'Editar Garantía de Reparación' : 'Registrar Garantía Post-Reparación'}
              </h2>
              <p className="text-xs text-slate-500">
                Control de plazos, piezas, mano de obra y detección de reincidencias
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

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs text-slate-700">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Inmueble y Elemento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Inmueble <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <select
                  value={inmuebleId}
                  onChange={(e) => setInmuebleId(e.target.value)}
                  disabled={Boolean(garantiaToEdit)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:border-emerald-500 outline-none disabled:opacity-60"
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
                Elemento / Equipo Afectado
              </label>
              <input
                type="text"
                value={elementoNombre}
                onChange={(e) => setElementoNombre(e.target.value)}
                placeholder="Ej. Caldera Junkers, Grifería cocina..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Título de la Garantía */}
          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Concepto / Título de la Reparación <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Sustitución de bomba de circulación de calefacción"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-emerald-500 outline-none font-semibold"
              required
            />
          </div>

          {/* Profesional / Proveedor emisor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Profesional Registrado
              </label>
              <select
                value={profesionalId}
                onChange={(e) => handleProfesionalChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-emerald-500 outline-none"
              >
                <option value="">Otro proveedor / externo</option>
                {profesionales.map((prof) => (
                  <option key={prof.id} value={prof.id}>
                    {prof.nombreEmpresa || prof.nombreContacto} ({prof.especialidadPrincipal})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Nombre Proveedor / SAT
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={proveedor}
                  onChange={(e) => setProveedor(e.target.value)}
                  placeholder="Nombre de la empresa o técnico emisor"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-emerald-500 outline-none font-medium"
                />
              </div>
            </div>
          </div>

          {/* Fechas y Duración */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Fecha Inicio <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => handleFechaInicioChange(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:border-emerald-500 outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Duración (Meses)
              </label>
              <select
                value={duracionMeses}
                onChange={(e) => handleDuracionChange(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-emerald-500 outline-none"
              >
                <option value={3}>3 meses</option>
                <option value={6}>6 meses (Estándar)</option>
                <option value={12}>12 meses (1 año)</option>
                <option value={24}>24 meses (2 años)</option>
                <option value={36}>36 meses (3 años)</option>
                <option value={60}>60 meses (5 años)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Fecha Vencimiento
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-emerald-500 outline-none"
                  required
                />
              </div>
            </div>
          </div>

          {/* Cobertura */}
          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Alcance de la Cobertura (Piezas / Mano de obra)
            </label>
            <textarea
              rows={2}
              value={coberturaDetalle}
              onChange={(e) => setCoberturaDetalle(e.target.value)}
              placeholder="Indique qué cubre exactamente la garantía (sustitución gratuita de piezas, mano de obra sin cargo...)"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-emerald-500 outline-none"
            />
          </div>

          {/* Notas */}
          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Notas Adicionales / Referencia de Factura
            </label>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej. Factura F-2026/0412 — SAT Oficial"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-emerald-500 outline-none"
            />
          </div>

          {/* Pie y Guardar */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
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
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2"
            >
              {saving ? (
                <span>Guardando...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{garantiaToEdit ? 'Actualizar Garantía' : 'Guardar Garantía'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
