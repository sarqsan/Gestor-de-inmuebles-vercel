import React, { useState, useEffect } from 'react';
import {
  TareaMantenimiento,
  Profesional,
  UsuarioApp,
  Gasto,
  GarantiaReparacion,
} from '../../types';
import {
  marcarActuacionRealizada,
  calcularProximaFechaMantenimiento,
} from '../../utils/mantenimientoEngine';
import { saveGastoFirestore, saveGarantiaReparacionFirestore } from '../../lib/firebase';
import {
  X,
  CheckCircle2,
  Calendar,
  DollarSign,
  User,
  FileText,
  ShieldCheck,
  AlertCircle,
  Wrench,
} from 'lucide-react';

interface RegistrarActuacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tareaActualizada: TareaMantenimiento) => Promise<void>;
  tarea: TareaMantenimiento;
  profesionales?: Profesional[];
  currentUser?: UsuarioApp;
}

export const RegistrarActuacionModal: React.FC<RegistrarActuacionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  tarea,
  profesionales = [],
  currentUser,
}) => {
  const [fechaRealizacion, setFechaRealizacion] = useState<string>('');
  const [costeReal, setCosteReal] = useState<string>('');
  const [profesionalNombre, setProfesionalNombre] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');
  const [numFactura, setNumFactura] = useState<string>('');
  
  // Opciones de integración automática
  const [generarGasto, setGenerarGasto] = useState<boolean>(true);
  const [registrarGarantia, setRegistrarGarantia] = useState<boolean>(false);
  const [mesesGarantia, setMesesGarantia] = useState<number>(6);

  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const today = new Date().toISOString().split('T')[0];
    setFechaRealizacion(today);
    setCosteReal(tarea.costeEstimado ? String(tarea.costeEstimado) : '');
    setProfesionalNombre(tarea.profesionalPreferidoNombre || '');
    setObservaciones('');
    setNumFactura('');
    setGenerarGasto(true);
    setRegistrarGarantia(false);
    setMesesGarantia(6);
    setError(null);
  }, [isOpen, tarea]);

  if (!isOpen) return null;

  const proximaFechaCalculada = calcularProximaFechaMantenimiento(
    fechaRealizacion || new Date(),
    tarea.periodicidad,
    tarea.diasIntervaloPersonalizado
  );

  const esUnicaOPuntual = tarea.periodicidad === 'UNICA' || tarea.periodicidad === 'PUNTUAL';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fechaRealizacion) {
      setError('Indique la fecha en que se llevó a cabo la actuación.');
      return;
    }

    setSaving(true);
    try {
      const costeNum = costeReal ? parseFloat(costeReal) : 0;
      const gastoId = generarGasto && costeNum > 0 ? `gasto_mant_${tarea.id}_${Date.now()}` : undefined;

      // 1. Marcar actuación realizada deterministamente en la tarea
      const result = marcarActuacionRealizada({
        plan: tarea,
        fechaRealizacion,
        costeReal: costeNum,
        profesionalNombre: profesionalNombre || undefined,
        observaciones: observaciones || undefined,
        realizadoPor: currentUser?.nombre || 'Gestor Patrimonial',
        gastoId,
      });

      const tareaActualizada = result.planActualizado;

      // 2. Si se solicitó registrar apunte de gasto contable
      if (gastoId && costeNum > 0) {
        const nuevoGasto: Gasto = {
          id: gastoId,
          inmuebleId: tarea.inmuebleId,
          propietarioId: tarea.propietarioId,
          tipo: 'EXPLOTACION',
          categoria: 'MANTENIMIENTO',
          concepto: `Mantenimiento: ${tarea.titulo}${profesionalNombre ? ` (${profesionalNombre})` : ''}`,
          importe: costeNum,
          estado: 'PAGADO',
          fechaDevengo: fechaRealizacion,
          fechaPago: fechaRealizacion,
          periodoMesAnio: fechaRealizacion.slice(0, 7),
          aCargoDe: 'arrendador',
          deducible: true,
          proveedor: profesionalNombre || 'Servicio Técnico',
          ordenTrabajoId: tarea.ultimaOrdenTrabajoId,
          incidenciaId: tarea.ultimaIncidenciaId,
          origen: 'MANTENIMIENTO_PREVENTIVO',
          notas: numFactura ? `Factura nº ${numFactura}. ${observaciones || ''}` : (observaciones || undefined),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await saveGastoFirestore(nuevoGasto);
      }

      // 3. Si se solicitó registrar garantía post-actuación
      if (registrarGarantia) {
        const fechaInicioG = new Date(fechaRealizacion);
        const fechaFinG = new Date(fechaInicioG);
        fechaFinG.setMonth(fechaFinG.getMonth() + mesesGarantia);

        const nuevaGarantia: GarantiaReparacion = {
          id: `gar_mant_${tarea.id}_${Date.now()}`,
          inmuebleId: tarea.inmuebleId,
          propietarioId: tarea.propietarioId,
          trabajoId: tarea.ultimaOrdenTrabajoId || `ot_mant_${tarea.id}`,
          elementoNombre: tarea.elementoNombre || tarea.titulo,
          titulo: `Garantía de actuación: ${tarea.titulo}`,
          concepto: observaciones || 'Garantía derivada de trabajo de mantenimiento preventivo/correctivo.',
          categoria: (tarea.categoria as any) || 'MANTENIMIENTO',
          fechaInicio: fechaInicioG.toISOString().slice(0, 10),
          duracionMeses: mesesGarantia,
          fechaFin: fechaFinG.toISOString().slice(0, 10),
          proveedor: profesionalNombre || 'Servicio Técnico',
          profesionalId: tarea.profesionalPreferidoId,
          incidenciaId: tarea.ultimaIncidenciaId,
          gastoId,
          estado: 'ACTIVA',
          cobertura: 'Mano de obra y piezas sustituidas durante la actuación.',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await saveGarantiaReparacionFirestore(nuevaGarantia);
        tareaActualizada.garantiaId = nuevaGarantia.id;
      }

      await onSave(tareaActualizada);
      onClose();
    } catch (err: any) {
      console.error('Error al registrar actuación:', err);
      setError(err?.message || 'Error al registrar la actuación realizada.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        {/* Cabecera */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-emerald-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Registrar Actuación Realizada
              </h2>
              <p className="text-xs text-slate-500">
                {tarea.titulo}
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs text-slate-700">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Fecha y Coste Real */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Fecha de Ejecución <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="date"
                  value={fechaRealizacion}
                  onChange={(e) => setFechaRealizacion(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:border-emerald-500 outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Coste Real (€)
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costeReal}
                  onChange={(e) => setCosteReal(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-emerald-500 outline-none font-mono font-semibold text-right"
                />
              </div>
            </div>
          </div>

          {/* Empresa / Profesional y Factura */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Profesional / Empresa
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={profesionalNombre}
                  onChange={(e) => setProfesionalNombre(e.target.value)}
                  placeholder="Nombre técnico o empresa SAT"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Nº Factura / Justificante
              </label>
              <div className="relative">
                <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={numFactura}
                  onChange={(e) => setNumFactura(e.target.value)}
                  placeholder="Ej. FRA-2026-089"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-emerald-500 outline-none font-mono"
                />
              </div>
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Observaciones / Diagnóstico Técnico
            </label>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Detalles de los trabajos efectuados, piezas reemplazadas, estado del equipo..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-emerald-500 outline-none"
            />
          </div>

          {/* Siguiente actuación determinista */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Próxima Planificación Determinista
            </span>
            {esUnicaOPuntual ? (
              <p className="text-xs text-slate-700 font-semibold">
                Al ser una tarea <span className="font-bold text-indigo-700">{tarea.periodicidad}</span>, se marcará como <span className="font-bold text-emerald-700">COMPLETADA</span> y se cerrará su ciclo activo.
              </p>
            ) : (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">
                  Periodicidad: <strong className="text-slate-900">{tarea.periodicidad}</strong>
                </span>
                <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  Próxima: {new Date(proximaFechaCalculada).toLocaleDateString('es-ES')}
                </span>
              </div>
            )}
          </div>

          {/* Checkboxes de automatización */}
          <div className="space-y-2 pt-1 border-t border-slate-100">
            {parseFloat(costeReal) > 0 && (
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={generarGasto}
                  onChange={(e) => setGenerarGasto(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <span className="text-xs font-semibold text-slate-800">
                  Generar apunte contable de Gasto ({costeReal} €) automáticamente
                </span>
              </label>
            )}

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
              <input
                type="checkbox"
                checked={registrarGarantia}
                onChange={(e) => setRegistrarGarantia(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
              />
              <span className="text-xs font-semibold text-slate-800">
                Registrar Garantía Post-Actuación
              </span>
            </label>

            {registrarGarantia && (
              <div className="pl-6 pt-1 flex items-center gap-3">
                <span className="text-xs text-slate-600">Duración de la garantía:</span>
                <select
                  value={mesesGarantia}
                  onChange={(e) => setMesesGarantia(parseInt(e.target.value, 10))}
                  className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none"
                >
                  <option value={3}>3 meses</option>
                  <option value={6}>6 meses (estándar reparación)</option>
                  <option value={12}>12 meses (1 año)</option>
                  <option value={24}>24 meses (2 años)</option>
                  <option value={36}>36 meses (3 años)</option>
                </select>
              </div>
            )}
          </div>

          {/* Botones */}
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
                <span>Registrando...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar Actuación Realizada</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
