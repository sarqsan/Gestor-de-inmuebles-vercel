import React, { useState, useEffect } from 'react';
import {
  X,
  Briefcase,
  Building2,
  Calendar,
  AlertTriangle,
  User,
  Wrench,
  DollarSign,
  Star,
  CheckCircle2,
  Clock,
  ArrowRight,
  FileText,
  Plus,
  ExternalLink,
  ChevronRight,
  MessageSquare,
  History,
  ShieldCheck,
  Phone,
  Mail,
  Edit,
  Receipt,
  TrendingDown,
  Check,
} from 'lucide-react';
import {
  Gasto,
  TrabajoProfesional,
  PresupuestoProfesional,
  Profesional,
  Inmueble,
  Incidencia,
  UsuarioApp,
  EstadoTrabajoProfesional,
} from '../../types';
import {
  ESTADO_TRABAJO_LABELS,
  PRIORIDAD_TRABAJO_LABELS,
  ESTADO_PRESUPUESTO_LABELS,
  crearItemHistorialTrabajo,
} from '../../utils/profesionalesEngine';
import {
  puedeGenerarGastoDesdeTrabajo,
  buscarGastoDeTrabajo,
  generarGastoDesdeTrabajo,
  sincronizarGastoDesdeTrabajo,
} from '../../utils/gastosEngine';
import {
  saveTrabajoProfesionalFirestore,
  saveIncidenciaFirestore,
  saveGastoFirestore,
  saveGarantiaReparacionFirestore,
  subscribeGastos,
} from '../../lib/firebase';
import { registrarGarantiaDesdeTrabajo } from '../../utils/mantenimientoEngine';

interface DetalleTrabajoProfesionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  trabajo: TrabajoProfesional;
  presupuestos: PresupuestoProfesional[];
  profesionales: Profesional[];
  inmuebles: Inmueble[];
  incidencias: Incidencia[];
  gastos?: Gasto[];
  currentUser?: UsuarioApp;
  onEditarTrabajo?: (trabajo: TrabajoProfesional) => void;
  onCrearPresupuesto?: (trabajo: TrabajoProfesional) => void;
  onVerPresupuesto?: (presupuesto: PresupuestoProfesional) => void;
  onValorarProfesional?: (trabajo: TrabajoProfesional) => void;
  onVerIncidencia?: (incidencia: Incidencia) => void;
  onGastoGenerado?: (gasto: Gasto) => void;
  onVerGasto?: (gasto: Gasto) => void;
}

export const DetalleTrabajoProfesionalModal: React.FC<DetalleTrabajoProfesionalModalProps> = ({
  isOpen,
  onClose,
  trabajo,
  presupuestos,
  profesionales,
  inmuebles,
  incidencias,
  gastos,
  currentUser,
  onEditarTrabajo,
  onCrearPresupuesto,
  onVerPresupuesto,
  onValorarProfesional,
  onVerIncidencia,
  onGastoGenerado,
  onVerGasto,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'presupuestos' | 'historial' | 'adjuntos'>('general');
  const [isUpdating, setIsUpdating] = useState(false);
  const [localTrabajo, setLocalTrabajo] = useState<TrabajoProfesional>(trabajo);
  const [localGastos, setLocalGastos] = useState<Gasto[]>(gastos || []);

  // Diálogo para finalizar y liquidar coste real
  const [dialogFinalizarOpen, setDialogFinalizarOpen] = useState(false);
  const [costeRealInput, setCosteRealInput] = useState<string>('');
  const [generarGastoAuto, setGenerarGastoAuto] = useState<boolean>(true);
  const [generarGarantiaAuto, setGenerarGarantiaAuto] = useState<boolean>(true);
  const [mesesGarantiaAuto, setMesesGarantiaAuto] = useState<number>(6);
  const [generandoGasto, setGenerandoGasto] = useState(false);
  const [errorGasto, setErrorGasto] = useState<string>('');

  // Edición directa de coste real en OT finalizada
  const [editandoCosteReal, setEditandoCosteReal] = useState(false);
  const [costeRealModificado, setCosteRealModificado] = useState<string>('');

  useEffect(() => {
    setLocalTrabajo(trabajo);
  }, [trabajo]);

  useEffect(() => {
    if (gastos) {
      setLocalGastos(gastos);
    }
  }, [gastos]);

  // Suscripción reactiva si no se pasan gastos como prop (solo para propietarios/administradores)
  useEffect(() => {
    if (!gastos && currentUser?.tipoPerfil !== 'PROFESIONAL') {
      const unsub = subscribeGastos((data) => {
        setLocalGastos(data);
      });
      return () => unsub();
    }
  }, [gastos, currentUser]);

  if (!isOpen) return null;

  const estadoInfo = ESTADO_TRABAJO_LABELS[localTrabajo.estado] || ESTADO_TRABAJO_LABELS.PENDIENTE;
  const prioridadInfo = PRIORIDAD_TRABAJO_LABELS[localTrabajo.prioridad] || PRIORIDAD_TRABAJO_LABELS.NORMAL;

  const profesionalAsignado = profesionales.find((p) => p.id === localTrabajo.profesionalId);
  const inmueble = inmuebles.find((i) => i.id === localTrabajo.inmuebleId);
  const incidenciaVinculada = incidencias.find((inc) => inc.id === localTrabajo.incidenciaId);
  const presupuestosDelTrabajo = presupuestos.filter((p) => p.trabajoId === localTrabajo.id);

  // Localizar gasto contable asociado (por trabajoId, ordenTrabajoId o gastoId)
  const gastoAsociado =
    buscarGastoDeTrabajo(localTrabajo.id, localGastos) ||
    (localTrabajo.gastoId ? localGastos.find((g) => g.id === localTrabajo.gastoId) : undefined);

  const esFinalizado = localTrabajo.estado === 'FINALIZADO' || localTrabajo.estado === 'FINALIZADA';
  const esProfesional = currentUser?.tipoPerfil === 'PROFESIONAL';

  // Handler para confirmar finalización con coste real y gasto automático
  const handleConfirmarFinalizacion = async () => {
    try {
      setIsUpdating(true);
      setErrorGasto('');
      const usuarioNombre = currentUser?.nombre
        ? `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim()
        : 'Administrador';

      const costeRealNum = costeRealInput ? parseFloat(costeRealInput) : localTrabajo.importeFinal;
      const fechaFin = new Date().toISOString();

      let gastoGeneradoId = localTrabajo.gastoId;

      const nuevoHistorial = [
        ...(localTrabajo.historial || []),
        crearItemHistorialTrabajo(
          'ESTADO_MODIFICADO',
          usuarioNombre,
          localTrabajo.estado,
          'FINALIZADO',
          `Trabajo finalizado y liquidado con coste real de ${
            typeof costeRealNum === 'number' && !isNaN(costeRealNum)
              ? costeRealNum.toFixed(2)
              : '0.00'
          } €`
        ),
      ];

      const trabajoActualizado: TrabajoProfesional = {
        ...localTrabajo,
        estado: 'FINALIZADO',
        importeFinal: typeof costeRealNum === 'number' && !isNaN(costeRealNum) ? costeRealNum : undefined,
        fechaFinalizacion: fechaFin,
        historial: nuevoHistorial,
        updatedAt: fechaFin,
      };

      // Si se marcó generar gasto y el usuario tiene permisos (no profesional externo), materializar gasto contable
      if (
        generarGastoAuto &&
        typeof costeRealNum === 'number' &&
        costeRealNum > 0 &&
        !esProfesional
      ) {
        const genResult = generarGastoDesdeTrabajo({
          trabajo: trabajoActualizado,
          gastosExistentes: localGastos,
          usuarioNombre,
          usuarioId: currentUser?.id,
        });

        if (genResult.gasto) {
          if (!genResult.yaExiste) {
            await saveGastoFirestore(genResult.gasto);
          }
          gastoGeneradoId = genResult.gasto.id;
          trabajoActualizado.gastoId = gastoGeneradoId;
          onGastoGenerado?.(genResult.gasto);
        }
      }

      // Si se marcó registrar garantía post-reparación
      if (generarGarantiaAuto && !esProfesional) {
        try {
          const resGar = registrarGarantiaDesdeTrabajo({
            trabajo: trabajoActualizado,
            duracionMeses: mesesGarantiaAuto,
            cobertura: `Cobertura de mano de obra y piezas por ${mesesGarantiaAuto} meses tras orden ${trabajoActualizado.id}.`,
            usuarioNombre,
          });
          if (resGar.garantia && !resGar.yaExiste) {
            await saveGarantiaReparacionFirestore(resGar.garantia);
          }
        } catch (errGar) {
          console.warn('Advertencia al registrar garantía automática:', errGar);
        }
      }

      setLocalTrabajo(trabajoActualizado);
      await saveTrabajoProfesionalFirestore(trabajoActualizado);

      // Sincronizar incidencia si existe
      if (incidenciaVinculada) {
        const incActualizada: Incidencia = {
          ...incidenciaVinculada,
          estado: 'RESUELTA',
          trabajoProfesional: incidenciaVinculada.trabajoProfesional
            ? {
                ...incidenciaVinculada.trabajoProfesional,
                estadoTrabajo: 'FINALIZADO',
                costeReal: typeof costeRealNum === 'number' && !isNaN(costeRealNum) ? costeRealNum : undefined,
                gastoId: gastoGeneradoId || incidenciaVinculada.trabajoProfesional.gastoId,
                fechaFinalizacion: fechaFin,
              }
            : {
                profesionalId: localTrabajo.profesionalId || '',
                profesionalNombre: localTrabajo.profesionalNombre || 'Profesional',
                servicio: localTrabajo.categoria || 'Mantenimiento',
                fechaAsignacion: localTrabajo.fechaAsignacion || fechaFin,
                costeReal: typeof costeRealNum === 'number' && !isNaN(costeRealNum) ? costeRealNum : undefined,
                gastoId: gastoGeneradoId,
                fechaFinalizacion: fechaFin,
                estadoTrabajo: 'FINALIZADO',
              },
          historial: [
            ...(incidenciaVinculada.historial || []),
            {
              id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              fecha: fechaFin,
              usuario: usuarioNombre,
              accion: 'TRABAJO_FINALIZADO',
              valorNuevo: 'RESUELTA',
              observacion: `Trabajo finalizado con coste real de ${
                typeof costeRealNum === 'number' && !isNaN(costeRealNum)
                  ? costeRealNum.toFixed(2)
                  : '0.00'
              } €${gastoGeneradoId ? ' (Gasto contable de reparación generado)' : ''}`,
            },
          ],
          updatedAt: fechaFin,
        };
        await saveIncidenciaFirestore(incActualizada);
      }

      setDialogFinalizarOpen(false);
    } catch (err: any) {
      console.error('Error al finalizar trabajo:', err);
      setErrorGasto(err?.message || 'Error al guardar la finalización del trabajo');
    } finally {
      setIsUpdating(false);
    }
  };

  // Handler para generar gasto manualmente en una OT ya finalizada
  const handleGenerarGastoManual = async () => {
    try {
      setGenerandoGasto(true);
      setErrorGasto('');
      const usuarioNombre = currentUser?.nombre
        ? `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim()
        : 'Administrador';

      const genResult = generarGastoDesdeTrabajo({
        trabajo: localTrabajo,
        gastosExistentes: localGastos,
        usuarioNombre,
        usuarioId: currentUser?.id,
      });

      if (genResult.error) {
        setErrorGasto(genResult.error);
        return;
      }

      if (genResult.gasto) {
        if (!genResult.yaExiste) {
          await saveGastoFirestore(genResult.gasto);
        }
        const updated: TrabajoProfesional = {
          ...localTrabajo,
          gastoId: genResult.gasto.id,
          updatedAt: new Date().toISOString(),
        };
        setLocalTrabajo(updated);
        await saveTrabajoProfesionalFirestore(updated);
        onGastoGenerado?.(genResult.gasto);
      }
    } catch (err: any) {
      console.error('Error al generar apunte de gasto:', err);
      setErrorGasto(err?.message || 'Error al generar apunte de gasto');
    } finally {
      setGenerandoGasto(false);
    }
  };

  // Handler para actualizar coste real posteriormente y sincronizar con el gasto asociado
  const handleGuardarCosteRealModificado = async () => {
    try {
      setIsUpdating(true);
      setErrorGasto('');
      const nuevoImporte = parseFloat(costeRealModificado);
      if (isNaN(nuevoImporte) || nuevoImporte < 0) {
        setErrorGasto('Introduce un importe numérico válido.');
        return;
      }

      const usuarioNombre = currentUser?.nombre
        ? `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim()
        : 'Administrador';

      const trabajoActualizado: TrabajoProfesional = {
        ...localTrabajo,
        importeFinal: nuevoImporte,
        updatedAt: new Date().toISOString(),
      };

      // Si existe gasto asociado, sincronizar el importe sin crear un duplicado
      if (gastoAsociado) {
        const gastoSincronizado = sincronizarGastoDesdeTrabajo({
          trabajo: trabajoActualizado,
          gastoExistente: gastoAsociado,
          usuarioNombre,
        });
        await saveGastoFirestore(gastoSincronizado);
      }

      setLocalTrabajo(trabajoActualizado);
      await saveTrabajoProfesionalFirestore(trabajoActualizado);

      // Sincronizar incidencia si existe
      if (incidenciaVinculada && incidenciaVinculada.trabajoProfesional) {
        const incActualizada: Incidencia = {
          ...incidenciaVinculada,
          trabajoProfesional: {
            ...incidenciaVinculada.trabajoProfesional,
            costeReal: nuevoImporte,
          },
          updatedAt: new Date().toISOString(),
        };
        await saveIncidenciaFirestore(incActualizada);
      }

      setEditandoCosteReal(false);
    } catch (err: any) {
      console.error('Error al actualizar coste real:', err);
      setErrorGasto(err?.message || 'Error al actualizar coste real');
    } finally {
      setIsUpdating(false);
    }
  };

  // Transition state helper
  const handleCambiarEstado = async (nuevoEstado: EstadoTrabajoProfesional, observacion?: string) => {
    try {
      setIsUpdating(true);
      const usuarioNombre = currentUser?.nombre
        ? `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim()
        : 'Administrador';

      const nuevoHistorial = [
        ...(localTrabajo.historial || []),
        crearItemHistorialTrabajo(
          'ESTADO_MODIFICADO',
          usuarioNombre,
          localTrabajo.estado,
          nuevoEstado,
          observacion || `Transición a ${ESTADO_TRABAJO_LABELS[nuevoEstado]?.label || nuevoEstado}`
        ),
      ];

      const trabajoActualizado: TrabajoProfesional = {
        ...localTrabajo,
        estado: nuevoEstado,
        historial: nuevoHistorial,
        fechaFinalizacion:
          (nuevoEstado === 'FINALIZADO' || nuevoEstado === 'FINALIZADA')
            ? (localTrabajo.fechaFinalizacion || new Date().toISOString())
            : localTrabajo.fechaFinalizacion,
        updatedAt: new Date().toISOString(),
      };

      setLocalTrabajo(trabajoActualizado);
      await saveTrabajoProfesionalFirestore(trabajoActualizado);

      // Sync incidence if linked
      if (incidenciaVinculada) {
        let nuevoEstadoInc = incidenciaVinculada.estado;
        if (nuevoEstado === 'EN_EJECUCION' || nuevoEstado === 'EN_CURSO') nuevoEstadoInc = 'EN_REPARACION';
        if (nuevoEstado === 'FINALIZADO' || nuevoEstado === 'FINALIZADA') nuevoEstadoInc = 'RESUELTA';
        if (nuevoEstado === 'CANCELADO' || nuevoEstado === 'CANCELADA') nuevoEstadoInc = 'CANCELADA';

        const mappedEstadoTrabajo: 'ASIGNADO' | 'PRESUPUESTADO' | 'ACEPTADO' | 'EN_CURSO' | 'FINALIZADO' | 'CANCELADO' =
          (nuevoEstado === 'FINALIZADO' || nuevoEstado === 'FINALIZADA')
            ? 'FINALIZADO'
            : (nuevoEstado === 'EN_EJECUCION' || nuevoEstado === 'EN_CURSO')
            ? 'EN_CURSO'
            : (nuevoEstado === 'CANCELADO' || nuevoEstado === 'CANCELADA')
            ? 'CANCELADO'
            : 'ASIGNADO';

        const incActualizada: Incidencia = {
          ...incidenciaVinculada,
          estado: nuevoEstadoInc,
          trabajoProfesional: incidenciaVinculada.trabajoProfesional
            ? {
                ...incidenciaVinculada.trabajoProfesional,
                estadoTrabajo: mappedEstadoTrabajo,
                costeReal: trabajoActualizado.importeFinal || incidenciaVinculada.trabajoProfesional.costeReal,
                fechaFinalizacion:
                  (nuevoEstado === 'FINALIZADO' || nuevoEstado === 'FINALIZADA')
                    ? new Date().toISOString()
                    : incidenciaVinculada.trabajoProfesional.fechaFinalizacion,
              }
            : {
                profesionalId: localTrabajo.profesionalId || '',
                profesionalNombre: localTrabajo.profesionalNombre || 'Profesional',
                servicio: localTrabajo.categoria || 'Mantenimiento',
                fechaAsignacion: localTrabajo.fechaAsignacion || new Date().toISOString(),
                estadoTrabajo: mappedEstadoTrabajo,
              },
          historial: [
            ...(incidenciaVinculada.historial || []),
            {
              id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              fecha: new Date().toISOString(),
              usuario: usuarioNombre,
              accion: 'ORDEN_TRABAJO_ESTADO_ACTUALIZADO',
              valorAnterior: localTrabajo.estado,
              valorNuevo: nuevoEstado,
              observacion: `Orden de trabajo "${localTrabajo.titulo}": ${ESTADO_TRABAJO_LABELS[nuevoEstado]?.label || nuevoEstado}`,
            },
          ],
          updatedAt: new Date().toISOString(),
        };
        await saveIncidenciaFirestore(incActualizada);
      }
    } catch (err) {
      console.error('Error transitioning work order status:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Pipeline steps definition
  const steps: { key: EstadoTrabajoProfesional; label: string }[] = [
    { key: 'PENDIENTE', label: '1. Solicitud' },
    { key: 'BUSCANDO_PROFESIONAL', label: '2. Búsqueda' },
    { key: 'PRESUPUESTO_SOLICITADO', label: '3. Presupuesto' },
    { key: 'ACEPTADO', label: '4. Aprobado' },
    { key: 'PROGRAMADO', label: '5. Programado' },
    { key: 'EN_EJECUCION', label: '6. En Obra' },
    { key: 'FINALIZADO', label: '7. Finalizado' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === localTrabajo.estado);

  return (
    <div
      id="detalle-trabajo-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl my-8 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-600/20 flex items-center justify-center text-blue-600">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h2 className="text-xl font-bold text-slate-900">{localTrabajo.titulo}</h2>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${estadoInfo.badgeClass}`}>
                  {estadoInfo.label}
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${prioridadInfo.badgeClass}`}>
                  {prioridadInfo.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-center space-x-2">
                <Building2 className="w-3.5 h-3.5" />
                <span>{localTrabajo.inmuebleDireccion || inmueble?.direccion || 'Inmueble'}</span>
                <span>•</span>
                <span>Especialidad: <strong>{localTrabajo.categoria}</strong></span>
                {profesionalAsignado && (
                  <>
                    <span>•</span>
                    <span>Técnico: <strong className="text-slate-800">{profesionalAsignado.nombreComercial}</strong></span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onEditarTrabajo && (
              <button
                onClick={() => onEditarTrabajo(localTrabajo)}
                className="inline-flex items-center space-x-1 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold rounded-xl transition-colors"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Pipeline Tracker */}
        <div className="bg-slate-50/70 border-b border-slate-200 px-6 py-3">
          <div className="flex items-center justify-between overflow-x-auto gap-2 text-xs">
            {steps.map((step, idx) => {
              const isPast = currentStepIndex > idx || localTrabajo.estado === 'FINALIZADO' || localTrabajo.estado === 'FINALIZADA';
              const isCurrent = step.key === localTrabajo.estado;
              return (
                <div key={step.key} className="flex items-center space-x-2 shrink-0">
                  <div
                    className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold border transition-colors ${
                      isCurrent
                        ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200'
                        : isPast
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    {isPast && !isCurrent ? '✓' : idx + 1}
                  </div>
                  <span
                    className={`font-semibold ${
                      isCurrent ? 'text-blue-700' : isPast ? 'text-slate-800' : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                  {idx < steps.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Toolbar for Transitions */}
        <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-between flex-wrap gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-500">Transición rápida:</span>
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              {(localTrabajo.estado === 'PENDIENTE' || localTrabajo.estado === 'BUSCANDO_PROFESIONAL') && (
                <button
                  disabled={isUpdating}
                  onClick={() => handleCambiarEstado('ASIGNADO', 'Profesional asignado a la orden')}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Asignar Profesional
                </button>
              )}

              {(localTrabajo.estado === 'PENDIENTE' || localTrabajo.estado === 'BUSCANDO_PROFESIONAL') && (
                <button
                  disabled={isUpdating}
                  onClick={() => handleCambiarEstado('PRESUPUESTO_SOLICITADO')}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Solicitar Presupuesto
                </button>
              )}

              {localTrabajo.estado === 'PRESUPUESTO_RECIBIDO' && (
                <button
                  disabled={isUpdating}
                  onClick={() => handleCambiarEstado('ACEPTADO', 'Presupuesto aprobado por el gestor')}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Aceptar Trabajo
                </button>
              )}

              {(localTrabajo.estado === 'ASIGNADO' || localTrabajo.estado === 'ASIGNADA' || localTrabajo.estado === 'ACEPTADO') && (
                <button
                  disabled={isUpdating}
                  onClick={() => handleCambiarEstado('PROGRAMADO')}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Programar Fecha
                </button>
              )}

              {(localTrabajo.estado === 'PROGRAMADO' || localTrabajo.estado === 'ACEPTADO' || localTrabajo.estado === 'ASIGNADO' || localTrabajo.estado === 'ASIGNADA' || localTrabajo.estado === 'PENDIENTE') && (
                <button
                  disabled={isUpdating}
                  onClick={() => handleCambiarEstado('EN_EJECUCION', 'Inicio de trabajos en la vivienda')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Iniciar Trabajo (En Ejecución)
                </button>
              )}

              {(localTrabajo.estado === 'EN_EJECUCION' || localTrabajo.estado === 'EN_CURSO') && (
                <>
                  <button
                    disabled={isUpdating}
                    onClick={() => handleCambiarEstado('PENDIENTE_MATERIAL')}
                    className="px-2.5 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-800 font-semibold rounded-lg border border-orange-200 transition-colors cursor-pointer"
                  >
                    Pendiente Material
                  </button>
                  <button
                    disabled={isUpdating}
                    onClick={() => {
                      setCosteRealInput(
                        localTrabajo.importeFinal?.toString() ||
                        localTrabajo.importeEstimado?.toString() ||
                        ''
                      );
                      setDialogFinalizarOpen(true);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    ✓ Marcar Finalizado
                  </button>
                </>
              )}

              {localTrabajo.estado === 'PENDIENTE_MATERIAL' && (
                <button
                  disabled={isUpdating}
                  onClick={() => handleCambiarEstado('EN_EJECUCION', 'Reanudación tras recibir material')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Reanudar Ejecución
                </button>
              )}

              {(localTrabajo.estado === 'FINALIZADO' || localTrabajo.estado === 'FINALIZADA') && !localTrabajo.valoracion && onValorarProfesional && (
                <button
                  onClick={() => onValorarProfesional(localTrabajo)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg shadow-xs flex items-center space-x-1 transition-colors cursor-pointer"
                >
                  <Star className="w-3.5 h-3.5 fill-white" />
                  <span>Valorar Profesional</span>
                </button>
              )}

              {localTrabajo.estado !== 'CANCELADO' && localTrabajo.estado !== 'CANCELADA' && localTrabajo.estado !== 'FINALIZADO' && localTrabajo.estado !== 'FINALIZADA' && (
                <button
                  disabled={isUpdating}
                  onClick={() => {
                    if (confirm('¿Deseas cancelar esta orden de trabajo?')) {
                      handleCambiarEstado('CANCELADO', 'Cancelado por el usuario');
                    }
                  }}
                  className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg border border-rose-200 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>

          {/* Selector directo de estado */}
          <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Estado:</span>
            <select
              value={localTrabajo.estado}
              disabled={isUpdating}
              onChange={(e) => {
                const targetState = e.target.value as EstadoTrabajoProfesional;
                if (targetState === 'FINALIZADO' || targetState === 'FINALIZADA') {
                  setCosteRealInput(
                    localTrabajo.importeFinal?.toString() ||
                    localTrabajo.importeEstimado?.toString() ||
                    ''
                  );
                  setDialogFinalizarOpen(true);
                } else {
                  handleCambiarEstado(
                    targetState,
                    `Cambio manual de estado a ${ESTADO_TRABAJO_LABELS[targetState]?.label || targetState}`
                  );
                }
              }}
              className="bg-white border border-slate-300 text-slate-800 text-xs rounded-md px-2 py-1 font-semibold outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              {Object.entries(ESTADO_TRABAJO_LABELS).map(([k, val]) => (
                <option key={k} value={k}>
                  {val.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Subtabs Bar */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-3 px-3 border-b-2 transition-colors ${
              activeTab === 'general'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Detalles y Asignación
          </button>
          <button
            onClick={() => setActiveTab('presupuestos')}
            className={`py-3 px-3 border-b-2 transition-colors ${
              activeTab === 'presupuestos'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Presupuestos ({presupuestosDelTrabajo.length})
          </button>
          <button
            onClick={() => setActiveTab('adjuntos')}
            className={`py-3 px-3 border-b-2 transition-colors ${
              activeTab === 'adjuntos'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Documentos y Fotos ({localTrabajo.documentos?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('historial')}
            className={`py-3 px-3 border-b-2 transition-colors ${
              activeTab === 'historial'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Línea de Tiempo ({localTrabajo.historial?.length || 0})
          </button>
        </div>

        {/* Subtab Content */}
        <div className="p-6 overflow-y-auto flex-1 bg-white space-y-6">
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Description & Details */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Alcance y Descripción</h4>
                <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                  {localTrabajo.descripcion || 'Sin descripción detallada registrada.'}
                </p>
                {localTrabajo.observaciones && (
                  <div className="pt-3 border-t border-slate-200 text-xs text-slate-600 italic">
                    <strong>Nota interna:</strong> {localTrabajo.observaciones}
                  </div>
                )}
              </div>

              {/* Grid: Professional & Property */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Professional Card */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                      <Wrench className="w-4 h-4 text-amber-600" />
                      <span>Profesional Asignado</span>
                    </h4>
                  </div>

                  {profesionalAsignado ? (
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-900">
                          {profesionalAsignado.nombreComercial}
                        </span>
                        <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded text-[11px] font-semibold">
                          {profesionalAsignado.tipo}
                        </span>
                      </div>
                      {profesionalAsignado.contactoNombre && (
                        <p className="text-slate-600">Contacto: {profesionalAsignado.contactoNombre}</p>
                      )}
                      <div className="flex items-center space-x-4 pt-1 text-slate-700">
                        {profesionalAsignado.telefono && (
                          <a
                            href={`tel:${profesionalAsignado.telefono}`}
                            className="flex items-center space-x-1 text-blue-600 hover:underline"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>{profesionalAsignado.telefono}</span>
                          </a>
                        )}
                        {profesionalAsignado.email && (
                          <a
                            href={`mailto:${profesionalAsignado.email}`}
                            className="flex items-center space-x-1 text-blue-600 hover:underline"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>{profesionalAsignado.email}</span>
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-center border border-dashed border-slate-200 rounded-lg text-slate-400 text-xs">
                      Sin profesional asignado formalmente.
                    </div>
                  )}
                </div>

                {/* Property & Linked Incident Card */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span>Inmueble y Origen</span>
                  </h4>

                  <div className="space-y-2 text-xs text-slate-700">
                    <div>
                      <span className="font-semibold text-slate-900 block">
                        {inmueble?.direccion || localTrabajo.inmuebleDireccion || 'Vivienda'}
                      </span>
                      <span className="text-slate-500">{inmueble?.ciudad || ''}</span>
                    </div>

                    {incidenciaVinculada ? (
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="text-[11px] text-amber-700 font-semibold block">
                            Derivado de Incidencia:
                          </span>
                          <span className="font-medium text-slate-800 text-xs">{incidenciaVinculada.titulo}</span>
                        </div>
                        {onVerIncidencia && (
                          <button
                            onClick={() => onVerIncidencia(incidenciaVinculada)}
                            className="text-xs text-blue-600 hover:underline flex items-center space-x-1 font-semibold cursor-pointer"
                          >
                            <span>Ver Ficha</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-slate-100 text-xs text-slate-400">
                        Orden de trabajo directa (No proviene de incidencia previa)
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Dates & Financials Box */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-slate-400 block font-medium">Solicitud</span>
                    <span className="font-bold text-slate-800">
                      {new Date(localTrabajo.fechaSolicitud).toLocaleDateString('es-ES')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Inicio Previsto</span>
                    <span className="font-bold text-slate-800">
                      {localTrabajo.fechaInicio ? new Date(localTrabajo.fechaInicio).toLocaleDateString('es-ES') : 'Sin fijar'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Importe Estimado</span>
                    <span className="font-bold text-slate-800">
                      {localTrabajo.importeEstimado !== undefined
                        ? localTrabajo.importeEstimado.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
                        : 'Pendiente'}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 block font-medium">Coste Real</span>
                      {esFinalizado && !esProfesional && (
                        <button
                          onClick={() => {
                            setCosteRealModificado(localTrabajo.importeFinal?.toString() || '');
                            setEditandoCosteReal(true);
                          }}
                          className="text-[10px] text-blue-600 hover:underline font-semibold"
                        >
                          Modificar
                        </button>
                      )}
                    </div>
                    <span className="font-bold text-emerald-600 text-sm block">
                      {localTrabajo.importeFinal !== undefined
                        ? localTrabajo.importeFinal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
                        : 'No liquidado'}
                    </span>
                  </div>
                </div>

                {/* Quick Budget Status Link */}
                <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-slate-600">Presupuestos:</span>
                    {localTrabajo.presupuestoId ? (
                      <span className="inline-flex items-center space-x-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Presupuesto Aprobado y Adjudicado</span>
                      </span>
                    ) : (
                      <span className="text-slate-700 font-medium">
                        {presupuestosDelTrabajo.length > 0
                          ? `${presupuestosDelTrabajo.length} presupuesto(s) registrado(s)`
                          : 'Sin presupuesto registrado aún'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    {presupuestosDelTrabajo.length > 0 ? (
                      <button
                        onClick={() => setActiveTab('presupuestos')}
                        className="text-blue-600 hover:underline font-semibold cursor-pointer"
                      >
                        Ver Presupuestos ({presupuestosDelTrabajo.length})
                      </button>
                    ) : onCrearPresupuesto ? (
                      <button
                        onClick={() => onCrearPresupuesto(localTrabajo)}
                        className="text-blue-600 hover:underline font-semibold cursor-pointer"
                      >
                        + Crear Presupuesto
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* PUENTE A GASTOS: Estado de Gasto de Reparación Contable */}
              {esFinalizado && (
                <div className="space-y-2">
                  {gastoAsociado ? (
                    <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Receipt className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span className="font-bold text-emerald-950">Gasto Contable de Reparación Registrado</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            {gastoAsociado.estado}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-emerald-800 text-sm">
                          {gastoAsociado.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                        </span>
                      </div>
                      <div className="text-slate-600 text-[11px] grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1.5 border-t border-emerald-200/60">
                        <div>
                          <span className="text-slate-400">Concepto:</span>{' '}
                          <span className="font-medium text-slate-800">{gastoAsociado.concepto}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Fecha devengo:</span>{' '}
                          <span className="font-medium text-slate-800">{gastoAsociado.fechaDevengo || 'N/D'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Categoría contable:</span>{' '}
                          <span className="font-medium text-slate-800">{gastoAsociado.categoria} (Explotación)</span>
                        </div>
                        <div>
                          <span className="text-slate-400">ID Gasto:</span>{' '}
                          <span className="font-mono text-slate-700">{gastoAsociado.id}</span>
                        </div>
                      </div>
                      {onVerGasto && (
                        <div className="pt-1">
                          <button
                            onClick={() => onVerGasto(gastoAsociado)}
                            className="text-emerald-700 hover:text-emerald-900 font-semibold underline text-[11px] inline-flex items-center space-x-1 cursor-pointer"
                          >
                            <span>Ver en módulo de Gastos</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : typeof localTrabajo.importeFinal === 'number' && localTrabajo.importeFinal > 0 ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between flex-wrap gap-3 text-xs">
                      <div className="flex items-start space-x-2.5">
                        <Receipt className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-bold text-amber-950 block">Pendiente de contabilizar en Gastos</span>
                          <span className="text-slate-600 text-[11px]">
                            El trabajo está finalizado con coste real liquidado de{' '}
                            <strong>
                              {localTrabajo.importeFinal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                            </strong>
                            . Puedes registrar el gasto contable en la contabilidad del inmueble.
                          </span>
                        </div>
                      </div>
                      {!esProfesional && (
                        <button
                          disabled={generandoGasto}
                          onClick={handleGenerarGastoManual}
                          className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer shrink-0"
                        >
                          {generandoGasto ? 'Registrando...' : '💰 Registrar Gasto de Reparación'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                      <span className="text-slate-600">
                        Trabajo finalizado sin coste real liquidado. Indica el importe final para poder contabilizar el gasto de reparación.
                      </span>
                      {!esProfesional && (
                        <button
                          onClick={() => {
                            setCosteRealModificado(localTrabajo.importeEstimado?.toString() || '');
                            setEditandoCosteReal(true);
                          }}
                          className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold rounded-lg text-xs cursor-pointer shadow-xs"
                        >
                          Liquidar Coste Real
                        </button>
                      )}
                    </div>
                  )}
                  {errorGasto && (
                    <p className="text-xs text-rose-600 font-semibold">{errorGasto}</p>
                  )}
                </div>
              )}

              {/* Valoración post-intervención si existe */}
              {localTrabajo.valoracion && (
                <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span>Valoración Registrada del Trabajo</span>
                    </h4>
                    <span className="text-xs text-slate-500">
                      {new Date(localTrabajo.valoracion.fecha).toLocaleDateString('es-ES')}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-4 h-4 ${
                          s <= localTrabajo.valoracion!.puntuacion
                            ? 'text-amber-500 fill-amber-500'
                            : 'text-slate-200'
                        }`}
                      />
                    ))}
                    <span className="text-xs font-bold text-slate-800 ml-1.5">
                      {localTrabajo.valoracion.puntuacion}/5 ({localTrabajo.valoracion.resultado})
                    </span>
                  </div>
                  {localTrabajo.valoracion.comentario && (
                    <p className="text-xs text-slate-700 italic">"{localTrabajo.valoracion.comentario}"</p>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'presupuestos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">Presupuestos Asociados a este Trabajo</h4>
                {onCrearPresupuesto && (
                  <button
                    onClick={() => onCrearPresupuesto(localTrabajo)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Añadir Presupuesto</span>
                  </button>
                )}
              </div>

              {presupuestosDelTrabajo.length > 0 ? (
                presupuestosDelTrabajo.map((pres) => {
                  const estInfo = ESTADO_PRESUPUESTO_LABELS[pres.estado] || ESTADO_PRESUPUESTO_LABELS.BORRADOR;
                  const isAceptado = pres.estado === 'ACEPTADO' || localTrabajo.presupuestoId === pres.id;
                  const isRechazado = pres.estado === 'RECHAZADO';
                  return (
                    <div
                      key={pres.id}
                      className={`p-4 border rounded-xl transition-colors space-y-2 ${
                        isAceptado
                          ? 'border-emerald-300 bg-emerald-50/30'
                          : isRechazado
                          ? 'border-rose-200 bg-rose-50/20'
                          : 'border-slate-200 bg-white hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-xs font-bold text-slate-800">
                              {pres.numeroPresupuesto || `PRE-${pres.id.slice(-5)}`}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${estInfo.badgeClass}`}>
                              {estInfo.label}
                            </span>
                            {isAceptado && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center space-x-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Adjudicado</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-700 mt-1">{pres.descripcion}</p>
                          {isRechazado && pres.motivoRechazo && (
                            <p className="text-[11px] text-rose-700 mt-0.5 font-medium">
                              Motivo rechazo: {pres.motivoRechazo}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-base font-bold text-slate-900">
                            {pres.importeTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                          </span>
                          <span className="text-[11px] text-slate-400 block">IVA incluido</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <span className="text-slate-500">
                          {pres.partidas?.length || 0} partidas • Validez: {pres.validez}
                        </span>
                        {onVerPresupuesto && (
                          <button
                            onClick={() => onVerPresupuesto(pres)}
                            className="text-blue-600 hover:underline font-semibold cursor-pointer"
                          >
                            Ver Desglose y Decidir
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                  No hay presupuestos adjuntos a esta orden de trabajo todavía.
                </div>
              )}
            </div>
          )}

          {activeTab === 'adjuntos' && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900">Documentos e Imágenes</h4>
              {localTrabajo.documentos && localTrabajo.documentos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {localTrabajo.documentos.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3.5 border border-slate-200 rounded-xl flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                        <div className="truncate">
                          <span className="text-xs font-bold text-slate-800 truncate block">{doc.nombre}</span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(doc.fechaSubida).toLocaleDateString('es-ES')}
                          </span>
                        </div>
                      </div>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                  Sin fotografías ni documentos adjuntos.
                </div>
              )}
            </div>
          )}

          {activeTab === 'historial' && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <History className="w-4 h-4 text-slate-600" />
                <span>Auditoría Cronológica de la Orden de Trabajo</span>
              </h4>

              <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
                {localTrabajo.historial && localTrabajo.historial.length > 0 ? (
                  localTrabajo.historial.map((item, idx) => (
                    <div key={item.id || idx} className="relative">
                      <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-blue-600 ring-4 ring-white" />
                      <div className="flex items-baseline space-x-2">
                        <span className="text-xs font-bold text-slate-800">{item.accion}</span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(item.fecha).toLocaleString('es-ES')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{item.observacion}</p>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Por: {item.usuario}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-400">Sin eventos registrados.</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* SUB-DIALOG: FINALIZAR Y LIQUIDAR TRABAJO */}
        {dialogFinalizarOpen && (
          <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2 text-emerald-700">
                  <CheckCircle2 className="w-5 h-5" />
                  <h3 className="font-bold text-slate-900 text-sm">Finalizar Orden de Trabajo</h3>
                </div>
                <button
                  onClick={() => setDialogFinalizarOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-slate-600 leading-relaxed">
                  Confirma el cierre de la orden <strong>"{localTrabajo.titulo}"</strong> e introduce el coste real final liquidado.
                </p>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-800 block">Coste Real Liquidado (€)</label>
                    {localTrabajo.importeEstimado !== undefined && (
                      <button
                        type="button"
                        onClick={() => setCosteRealInput(localTrabajo.importeEstimado!.toString())}
                        className="text-[11px] text-blue-600 hover:underline font-semibold"
                      >
                        Copiar estimado ({localTrabajo.importeEstimado} €)
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      €
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Ej: 175.50"
                      value={costeRealInput}
                      onChange={(e) => setCosteRealInput(e.target.value)}
                      className="w-full pl-8 p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold text-slate-900"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Si no indicas un importe, no se generará automáticamente el apunte de gasto contable.
                  </p>
                </div>

                {!esProfesional && (
                  <>
                    <label className="flex items-start space-x-2 p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl cursor-pointer">
                      <input
                        type="checkbox"
                        checked={generarGastoAuto}
                        onChange={(e) => setGenerarGastoAuto(e.target.checked)}
                        className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="text-[11px] leading-tight">
                        <span className="font-bold text-emerald-950 block">Registrar apunte en módulo de Gastos</span>
                        <span className="text-emerald-800/80">
                          Genera automáticamente un gasto de explotación (categoría Reparación/Mantenimiento) asociado a esta orden.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start space-x-2 p-3 bg-blue-50/60 border border-blue-200 rounded-xl cursor-pointer">
                      <input
                        type="checkbox"
                        checked={generarGarantiaAuto}
                        onChange={(e) => setGenerarGarantiaAuto(e.target.checked)}
                        className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <div className="text-[11px] leading-tight">
                        <span className="font-bold text-blue-950 block">Registrar Garantía Post-Reparación</span>
                        <span className="text-blue-800/80">
                          Protege el inmueble registrando una garantía de {mesesGarantiaAuto} meses con el profesional para detección de reincidencias.
                        </span>
                      </div>
                    </label>
                  </>
                )}

                {errorGasto && (
                  <p className="text-xs text-rose-600 font-semibold bg-rose-50 p-2 rounded-lg border border-rose-200">
                    {errorGasto}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 text-xs">
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => setDialogFinalizarOpen(false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={handleConfirmarFinalizacion}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {isUpdating ? 'Guardando...' : '✓ Confirmar Finalización'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUB-DIALOG: EDITAR COSTE REAL POSTERIORMENTE */}
        {editandoCosteReal && (
          <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="font-bold text-slate-900 text-sm">Modificar Coste Real</h3>
                <button
                  onClick={() => setEditandoCosteReal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <label className="font-bold text-slate-800 block">Nuevo Coste Real (€)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                    €
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={costeRealModificado}
                    onChange={(e) => setCosteRealModificado(e.target.value)}
                    className="w-full pl-8 p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900"
                  />
                </div>
                {gastoAsociado && (
                  <p className="text-[11px] text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                    ℹ️ El gasto vinculado (<strong>{gastoAsociado.id}</strong>) se sincronizará automáticamente con el nuevo importe sin duplicar registros.
                  </p>
                )}
                {errorGasto && (
                  <p className="text-xs text-rose-600 font-semibold">{errorGasto}</p>
                )}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 text-xs">
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => setEditandoCosteReal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={handleGuardarCosteRealModificado}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  {isUpdating ? 'Actualizando...' : 'Guardar y Sincronizar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
