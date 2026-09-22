import React, { useState } from 'react';
import {
  X,
  FileText,
  Building2,
  Calendar,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Edit,
  Wrench,
  AlertCircle,
  Send,
  RotateCcw,
  Tag,
  ShieldCheck,
  User,
  Layers,
  FileSpreadsheet,
  MessageSquare,
  History,
} from 'lucide-react';
import {
  PresupuestoProfesional,
  TrabajoProfesional,
  Profesional,
  Inmueble,
  UsuarioApp,
  EstadoPresupuestoProfesional,
  CategoriaMotivoAjuste,
  HistorialDecisionPresupuesto,
} from '../../types';
import {
  ESTADO_PRESUPUESTO_LABELS,
  CATEGORIA_AJUSTE_LABELS,
  crearItemHistorialPresupuesto,
  crearItemHistorialTrabajo,
  validarSolicitudAjuste,
  validarRechazoPresupuesto,
} from '../../utils/profesionalesEngine';
import {
  savePresupuestoProfesionalFirestore,
  saveTrabajoProfesionalFirestore,
} from '../../lib/firebase';

interface DetallePresupuestoProfesionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  presupuesto: PresupuestoProfesional;
  trabajos: TrabajoProfesional[];
  profesionales: Profesional[];
  inmuebles: Inmueble[];
  currentUser?: UsuarioApp;
  onEditarPresupuesto?: (presupuesto: PresupuestoProfesional) => void;
  onVerTrabajo?: (trabajo: TrabajoProfesional) => void;
  onPresupuestoActualizado?: (presupuesto: PresupuestoProfesional) => void;
}

export const DetallePresupuestoProfesionalModal: React.FC<DetallePresupuestoProfesionalModalProps> = ({
  isOpen,
  onClose,
  presupuesto: initialPresupuesto,
  trabajos,
  profesionales,
  inmuebles,
  currentUser,
  onEditarPresupuesto,
  onVerTrabajo,
  onPresupuestoActualizado,
}) => {
  const [presupuesto, setPresupuesto] = useState<PresupuestoProfesional>(initialPresupuesto);

  // Sync state if initial prop changes
  React.useEffect(() => {
    setPresupuesto(initialPresupuesto);
  }, [initialPresupuesto]);

  // Modal sub-dialog states
  const [dialogMode, setDialogMode] = useState<'NONE' | 'AJUSTE' | 'RECHAZO' | 'REENVIO'>('NONE');

  // Form states for Solicitud de Ajuste
  const [categoriaAjuste, setCategoriaAjuste] = useState<CategoriaMotivoAjuste>('PRECIO');
  const [motivoAjuste, setMotivoAjuste] = useState('');
  const [errorAjuste, setErrorAjuste] = useState('');

  // Form states for Rechazo
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [errorRechazo, setErrorRechazo] = useState('');

  // Form states for Reenvío
  const [observacionesReenvio, setObservacionesReenvio] = useState('');

  const [isUpdating, setIsUpdating] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState('');

  if (!isOpen) return null;

  const estadoInfo =
    ESTADO_PRESUPUESTO_LABELS[presupuesto.estado] || ESTADO_PRESUPUESTO_LABELS.BORRADOR;
  const trabajo = trabajos.find((t) => t.id === presupuesto.trabajoId);
  const profesional = profesionales.find((p) => p.id === presupuesto.profesionalId);
  const inmueble = inmuebles.find((i) => i.id === presupuesto.inmuebleId);

  // Current user helper
  const usuarioNombre = currentUser?.nombre
    ? `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim()
    : 'Administrador';

  // Role permissions:
  // - Admin / Gestor / Propietario can decide (Aprobar, Solicitar Ajuste, Rechazar).
  // - Profesional cannot approve their own budget.
  // - Profesional / Admin / Gestor can modify and re-send.
  const isProfesionalUser = currentUser?.tipoPerfil === 'PROFESIONAL';
  const isOwnProfesional =
    isProfesionalUser &&
    (currentUser.profesionalId === presupuesto.profesionalId ||
      currentUser.id === presupuesto.profesionalId);

  const canDecide =
    currentUser?.tipoPerfil === 'ADMINISTRADOR' ||
    currentUser?.tipoPerfil === 'GESTOR' ||
    currentUser?.tipoPerfil === 'PROPIETARIO' ||
    !currentUser; // default local demo mode

  const canModifyOrResubmit =
    currentUser?.tipoPerfil === 'ADMINISTRADOR' ||
    currentUser?.tipoPerfil === 'GESTOR' ||
    isOwnProfesional ||
    !currentUser;

  // -------------------------------------------------------------------------
  // 1. APROBAR Y ADJUDICAR
  // -------------------------------------------------------------------------
  const handleAprobar = async () => {
    try {
      setIsUpdating(true);
      setErrorGeneral('');

      const decisionItem = crearItemHistorialPresupuesto(
        'APROBACION',
        usuarioNombre,
        presupuesto.estado,
        'ACEPTADO',
        {
          observaciones: 'Presupuesto aprobado y adjudicado formalmente',
          version: presupuesto.version || 1,
          importeTotal: presupuesto.importeTotal,
          partidasSnapshot: presupuesto.partidas,
          usuarioId: currentUser?.id,
        }
      );

      const presActualizado: PresupuestoProfesional = {
        ...presupuesto,
        estado: 'ACEPTADO',
        fechaDecision: new Date().toISOString(),
        decididoPor: usuarioNombre,
        motivoRechazo: undefined,
        historialDecision: [...(presupuesto.historialDecision || []), decisionItem],
        actualizadoPor: usuarioNombre,
        updatedAt: new Date().toISOString(),
      };

      await savePresupuestoProfesionalFirestore(presActualizado);
      setPresupuesto(presActualizado);
      if (onPresupuestoActualizado) onPresupuestoActualizado(presActualizado);

      // Sync linked work order
      if (trabajo) {
        const nuevoHistorial = [
          ...(trabajo.historial || []),
          crearItemHistorialTrabajo(
            'PRESUPUESTO_ACEPTADO',
            usuarioNombre,
            trabajo.estado,
            'ACEPTADO',
            `Presupuesto ${presupuesto.numeroPresupuesto || presupuesto.id} aprobado (${presupuesto.importeTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })})`
          ),
        ];

        const trabajoActualizado: TrabajoProfesional = {
          ...trabajo,
          estado: 'ACEPTADO',
          presupuestoId: presupuesto.id,
          importeEstimado: presupuesto.importeTotal,
          historial: nuevoHistorial,
          actualizadoPor: usuarioNombre,
          updatedAt: new Date().toISOString(),
        };
        await saveTrabajoProfesionalFirestore(trabajoActualizado);
      }

      setDialogMode('NONE');
    } catch (err: any) {
      console.error('Error approving presupuesto:', err);
      setErrorGeneral(err?.message || 'Error al aprobar el presupuesto.');
    } finally {
      setIsUpdating(false);
    }
  };

  // -------------------------------------------------------------------------
  // 2. SOLICITAR AJUSTE (Pasa a EN_NEGOCIACION con motivo obligatorio)
  // -------------------------------------------------------------------------
  const handleConfirmarAjuste = async () => {
    const validacion = validarSolicitudAjuste(categoriaAjuste, motivoAjuste);
    if (!validacion.valido) {
      setErrorAjuste(validacion.error || 'Motivo obligatorio');
      return;
    }

    try {
      setIsUpdating(true);
      setErrorAjuste('');
      setErrorGeneral('');

      const motivoTexto = motivoAjuste.trim();
      const catLabel =
        CATEGORIA_AJUSTE_LABELS[categoriaAjuste]?.label || categoriaAjuste;

      const decisionItem = crearItemHistorialPresupuesto(
        'SOLICITUD_AJUSTE',
        usuarioNombre,
        presupuesto.estado,
        'EN_NEGOCIACION',
        {
          categoriaMotivo: categoriaAjuste,
          motivo: motivoTexto,
          observaciones: `Ajuste solicitado [${catLabel}]: ${motivoTexto}`,
          version: presupuesto.version || 1,
          importeTotal: presupuesto.importeTotal,
          partidasSnapshot: presupuesto.partidas,
          usuarioId: currentUser?.id,
        }
      );

      // CRITICAL: EN_NEGOCIACION is NOT a final decision. Do NOT set fechaDecision or decididoPor.
      const presActualizado: PresupuestoProfesional = {
        ...presupuesto,
        estado: 'EN_NEGOCIACION',
        categoriaAjuste,
        motivoAjuste: motivoTexto,
        fechaSolicitudAjuste: new Date().toISOString(),
        solicitadoAjustePor: usuarioNombre,
        // Limpiar decisiones finales previas para evitar falsos estados cerrados
        fechaDecision: undefined,
        decididoPor: undefined,
        motivoRechazo: undefined,
        historialDecision: [...(presupuesto.historialDecision || []), decisionItem],
        actualizadoPor: usuarioNombre,
        updatedAt: new Date().toISOString(),
      };

      await savePresupuestoProfesionalFirestore(presActualizado);
      setPresupuesto(presActualizado);
      if (onPresupuestoActualizado) onPresupuestoActualizado(presActualizado);

      // Sincronizar historial de la orden de trabajo si procede
      if (trabajo) {
        const nuevoHistorial = [
          ...(trabajo.historial || []),
          crearItemHistorialTrabajo(
            'ESTADO_MODIFICADO',
            usuarioNombre,
            trabajo.estado,
            trabajo.estado,
            `Ajuste solicitado para presupuesto ${presupuesto.numeroPresupuesto || presupuesto.id}: ${motivoTexto}`
          ),
        ];
        await saveTrabajoProfesionalFirestore({
          ...trabajo,
          historial: nuevoHistorial,
          actualizadoPor: usuarioNombre,
          updatedAt: new Date().toISOString(),
        });
      }

      setDialogMode('NONE');
      setMotivoAjuste('');
    } catch (err: any) {
      console.error('Error requesting ajuste:', err);
      setErrorGeneral(err?.message || 'Error al solicitar el ajuste.');
    } finally {
      setIsUpdating(false);
    }
  };

  // -------------------------------------------------------------------------
  // 3. RECHAZAR PRESUPUESTO (Motivo obligatorio)
  // -------------------------------------------------------------------------
  const handleConfirmarRechazo = async () => {
    const validacion = validarRechazoPresupuesto(motivoRechazo);
    if (!validacion.valido) {
      setErrorRechazo(validacion.error || 'Motivo de rechazo obligatorio');
      return;
    }

    try {
      setIsUpdating(true);
      setErrorRechazo('');
      setErrorGeneral('');

      const motivoTexto = motivoRechazo.trim();

      const decisionItem = crearItemHistorialPresupuesto(
        'RECHAZO',
        usuarioNombre,
        presupuesto.estado,
        'RECHAZADO',
        {
          motivo: motivoTexto,
          observaciones: `Presupuesto rechazado: ${motivoTexto}`,
          version: presupuesto.version || 1,
          importeTotal: presupuesto.importeTotal,
          partidasSnapshot: presupuesto.partidas,
          usuarioId: currentUser?.id,
        }
      );

      const presActualizado: PresupuestoProfesional = {
        ...presupuesto,
        estado: 'RECHAZADO',
        motivoRechazo: motivoTexto,
        fechaDecision: new Date().toISOString(),
        decididoPor: usuarioNombre,
        historialDecision: [...(presupuesto.historialDecision || []), decisionItem],
        actualizadoPor: usuarioNombre,
        updatedAt: new Date().toISOString(),
      };

      await savePresupuestoProfesionalFirestore(presActualizado);
      setPresupuesto(presActualizado);
      if (onPresupuestoActualizado) onPresupuestoActualizado(presActualizado);

      // Sync linked work order
      if (trabajo && trabajo.presupuestoId === presupuesto.id) {
        const nuevoHistorial = [
          ...(trabajo.historial || []),
          crearItemHistorialTrabajo(
            'PRESUPUESTO_RECHAZADO',
            usuarioNombre,
            trabajo.estado,
            'BUSCANDO_PROFESIONAL',
            `Presupuesto ${presupuesto.numeroPresupuesto || presupuesto.id} rechazado: ${motivoTexto}`
          ),
        ];

        const trabajoActualizado: TrabajoProfesional = {
          ...trabajo,
          estado: 'BUSCANDO_PROFESIONAL',
          presupuestoId: undefined,
          historial: nuevoHistorial,
          actualizadoPor: usuarioNombre,
          updatedAt: new Date().toISOString(),
        };
        await saveTrabajoProfesionalFirestore(trabajoActualizado);
      }

      setDialogMode('NONE');
      setMotivoRechazo('');
    } catch (err: any) {
      console.error('Error rejecting presupuesto:', err);
      setErrorGeneral(err?.message || 'Error al rechazar el presupuesto.');
    } finally {
      setIsUpdating(false);
    }
  };

  // -------------------------------------------------------------------------
  // 4. REENVIAR PRESUPUESTO TRAS NEGOCIACIÓN (Pasa de EN_NEGOCIACION a EN_REVISION)
  // -------------------------------------------------------------------------
  const handleConfirmarReenvio = async () => {
    try {
      setIsUpdating(true);
      setErrorGeneral('');

      const versionActual = presupuesto.version || 1;
      const nuevaVersion = versionActual + 1;
      const notaReenvio = observacionesReenvio.trim();

      const decisionItem = crearItemHistorialPresupuesto(
        'REENVIO',
        usuarioNombre,
        'EN_NEGOCIACION',
        'EN_REVISION',
        {
          observaciones:
            notaReenvio ||
            `Presupuesto revisado y reenviado para evaluación (Versión ${nuevaVersion})`,
          version: nuevaVersion,
          importeTotal: presupuesto.importeTotal,
          partidasSnapshot: presupuesto.partidas,
          usuarioId: currentUser?.id,
        }
      );

      const presActualizado: PresupuestoProfesional = {
        ...presupuesto,
        estado: 'EN_REVISION',
        version: nuevaVersion,
        // Limpiar indicadores transicionales de ajuste al reenviar
        categoriaAjuste: undefined,
        motivoAjuste: undefined,
        fechaSolicitudAjuste: undefined,
        solicitadoAjustePor: undefined,
        fechaDecision: undefined,
        decididoPor: undefined,
        motivoRechazo: undefined,
        historialDecision: [...(presupuesto.historialDecision || []), decisionItem],
        actualizadoPor: usuarioNombre,
        updatedAt: new Date().toISOString(),
      };

      await savePresupuestoProfesionalFirestore(presActualizado);
      setPresupuesto(presActualizado);
      if (onPresupuestoActualizado) onPresupuestoActualizado(presActualizado);

      // Sync linked work order
      if (trabajo) {
        const nuevoHistorial = [
          ...(trabajo.historial || []),
          crearItemHistorialTrabajo(
            'PRESUPUESTO_RECIBIDO',
            usuarioNombre,
            trabajo.estado,
            'PRESUPUESTO_RECIBIDO',
            `Presupuesto ${presupuesto.numeroPresupuesto || presupuesto.id} reenviado (v${nuevaVersion}) por ${presupuesto.importeTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`
          ),
        ];

        const trabajoActualizado: TrabajoProfesional = {
          ...trabajo,
          estado: 'PRESUPUESTO_RECIBIDO',
          presupuestoId: presupuesto.id,
          importeEstimado: presupuesto.importeTotal,
          historial: nuevoHistorial,
          actualizadoPor: usuarioNombre,
          updatedAt: new Date().toISOString(),
        };
        await saveTrabajoProfesionalFirestore(trabajoActualizado);
      }

      setDialogMode('NONE');
      setObservacionesReenvio('');
    } catch (err: any) {
      console.error('Error resubmitting presupuesto:', err);
      setErrorGeneral(err?.message || 'Error al reenviar el presupuesto.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      id="detalle-presupuesto-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl my-8 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-emerald-600/10 border border-emerald-600/20 flex items-center justify-center text-emerald-700 shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h2 className="text-xl font-bold text-slate-900 font-mono">
                  {presupuesto.numeroPresupuesto || `PRE-${presupuesto.id.slice(-6)}`}
                </h2>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${estadoInfo.badgeClass}`}
                >
                  {estadoInfo.label}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-200/80 text-slate-700">
                  v{presupuesto.version || 1}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Emitido por{' '}
                <strong className="text-slate-700">
                  {presupuesto.profesionalNombre || profesional?.nombreComercial || 'Profesional'}
                </strong>{' '}
                • Fecha: {new Date(presupuesto.fecha).toLocaleDateString('es-ES')}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onEditarPresupuesto && canModifyOrResubmit && presupuesto.estado !== 'ACEPTADO' && (
              <button
                onClick={() => onEditarPresupuesto(presupuesto)}
                className="inline-flex items-center space-x-1 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                title="Modificar partidas o datos del presupuesto"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Modificar</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorGeneral && (
          <div className="px-6 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs font-medium flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorGeneral}</span>
            </div>
            <button
              onClick={() => setErrorGeneral('')}
              className="text-rose-500 hover:text-rose-800 text-xs font-bold"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Action / Decision Toolbar */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-600 uppercase tracking-wider text-[11px]">
              Circuito de Gestión:
            </span>
            <span className="text-slate-500 font-medium">
              {presupuesto.estado === 'EN_NEGOCIACION' &&
                'En espera de ajuste y reenvío por el profesional'}
              {presupuesto.estado === 'RECIBIDO' && 'Pendiente de revisión inicial'}
              {presupuesto.estado === 'EN_REVISION' && 'En evaluación para aprobación'}
              {presupuesto.estado === 'ACEPTADO' && 'Adjudicado en firme'}
              {presupuesto.estado === 'RECHAZADO' && 'Presupuesto desestimado'}
              {presupuesto.estado === 'BORRADOR' && 'Borrador editable'}
            </span>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            {/* Actions for RECIBIDO / EN_REVISION / BORRADOR */}
            {(presupuesto.estado === 'RECIBIDO' ||
              presupuesto.estado === 'EN_REVISION' ||
              presupuesto.estado === 'BORRADOR') && (
              <>
                {canDecide && (
                  <button
                    disabled={isUpdating}
                    onClick={handleAprobar}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Aprobar y Adjudicar</span>
                  </button>
                )}

                {canDecide && (
                  <button
                    disabled={isUpdating}
                    onClick={() => {
                      setDialogMode('AJUSTE');
                      setErrorAjuste('');
                    }}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Solicitar Ajuste / Revisión</span>
                  </button>
                )}

                {canDecide && (
                  <button
                    disabled={isUpdating}
                    onClick={() => {
                      setDialogMode('RECHAZO');
                      setErrorRechazo('');
                    }}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Rechazar</span>
                  </button>
                )}
              </>
            )}

            {/* Actions for EN_NEGOCIACION */}
            {presupuesto.estado === 'EN_NEGOCIACION' && (
              <>
                {canModifyOrResubmit && onEditarPresupuesto && (
                  <button
                    onClick={() => onEditarPresupuesto(presupuesto)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Modificar Partidas</span>
                  </button>
                )}

                {canModifyOrResubmit && (
                  <button
                    disabled={isUpdating}
                    onClick={() => setDialogMode('REENVIO')}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Reenviar Presupuesto (v{(presupuesto.version || 1) + 1})</span>
                  </button>
                )}

                {canDecide && (
                  <button
                    disabled={isUpdating}
                    onClick={() => {
                      setDialogMode('RECHAZO');
                      setErrorRechazo('');
                    }}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Rechazar Negociación</span>
                  </button>
                )}
              </>
            )}

            {/* Re-opening / Adjustment allowed from RECHAZADO if authorized */}
            {presupuesto.estado === 'RECHAZADO' && canDecide && (
              <button
                disabled={isUpdating}
                onClick={() => {
                  setDialogMode('AJUSTE');
                  setErrorAjuste('');
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reabrir y Solicitar Ajuste</span>
              </button>
            )}
          </div>
        </div>

        {/* ---------------- SUB-DIALOG: SOLICITAR AJUSTE (MOTIVO OBLIGATORIO) ---------------- */}
        {dialogMode === 'AJUSTE' && (
          <div className="px-6 py-4 bg-amber-50/90 border-b border-amber-200 text-xs space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-amber-900 font-bold text-sm">
                <RotateCcw className="w-4 h-4 text-amber-700" />
                <span>Solicitud Obligatoria de Ajuste / Revisión al Profesional</span>
              </div>
              <button
                onClick={() => setDialogMode('NONE')}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                Cancelar
              </button>
            </div>

            <p className="text-amber-800 leading-relaxed">
              Indica qué aspectos debe revisar o ajustar el profesional antes de su aprobación. El presupuesto pasará al estado{' '}
              <strong className="font-bold font-mono">EN_NEGOCIACION</strong> y se registrará en el histórico.
            </p>

            <div className="space-y-2">
              <label className="font-bold text-slate-800 block">
                1. Categoría Principal del Ajuste <span className="text-rose-600">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(CATEGORIA_AJUSTE_LABELS).map(([catKey, catVal]) => {
                  const isSelected = categoriaAjuste === catKey;
                  return (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => setCategoriaAjuste(catKey as CategoriaMotivoAjuste)}
                      className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-600 text-white border-amber-600 shadow-xs font-bold'
                          : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/60'
                      }`}
                    >
                      <div className="font-bold text-xs">{catVal.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-800 block">
                2. Detalle del Ajuste Solicitado <span className="text-rose-600">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={motivoAjuste}
                onChange={(e) => {
                  setMotivoAjuste(e.target.value);
                  if (errorAjuste) setErrorAjuste('');
                }}
                placeholder="Explica detalladamente qué modificaciones se solicitan (ej: reducir partidas de mano de obra, sustituir material por marca homologada, ajustar plazo de inicio)..."
                className="w-full p-2.5 border border-amber-300 rounded-xl bg-white text-xs focus:ring-2 focus:ring-amber-500 font-medium"
              />
              {errorAjuste && (
                <p className="text-rose-600 font-bold text-[11px] flex items-center space-x-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errorAjuste}</span>
                </p>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setDialogMode('NONE')}
                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isUpdating || !motivoAjuste.trim()}
                onClick={handleConfirmarAjuste}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isUpdating ? 'Registrando...' : 'Confirmar y Solicitar Ajuste'}
              </button>
            </div>
          </div>
        )}

        {/* ---------------- SUB-DIALOG: RECHAZAR PRESUPUESTO (MOTIVO OBLIGATORIO) ---------------- */}
        {dialogMode === 'RECHAZO' && (
          <div className="px-6 py-4 bg-rose-50 border-b border-rose-200 text-xs space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-rose-900 font-bold text-sm">
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>Rechazo Formal del Presupuesto (Motivo Obligatorio)</span>
              </div>
              <button
                onClick={() => setDialogMode('NONE')}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                Cancelar
              </button>
            </div>

            <p className="text-rose-800 leading-relaxed">
              Indica la justificación del rechazo formal del presupuesto. Esta decisión quedará registrada inmutablemente en el histórico del expediente.
            </p>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-800 block">
                Motivo del Rechazo <span className="text-rose-600">*</span>
              </label>
              <textarea
                required
                rows={2}
                value={motivoRechazo}
                onChange={(e) => {
                  setMotivoRechazo(e.target.value);
                  if (errorRechazo) setErrorRechazo('');
                }}
                placeholder="Indica el motivo justificado del rechazo (ej: importe desproporcionado, oferta alternativa adjudicada, inviabilidad técnica)..."
                className="w-full p-2.5 border border-rose-300 rounded-xl bg-white text-xs focus:ring-2 focus:ring-rose-500 font-medium"
              />
              {errorRechazo && (
                <p className="text-rose-600 font-bold text-[11px] flex items-center space-x-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errorRechazo}</span>
                </p>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setDialogMode('NONE')}
                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isUpdating || !motivoRechazo.trim()}
                onClick={handleConfirmarRechazo}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isUpdating ? 'Registrando...' : 'Confirmar Rechazo Definitivo'}
              </button>
            </div>
          </div>
        )}

        {/* ---------------- SUB-DIALOG: REENVIAR PRESUPUESTO TRAS NEGOCIACIÓN ---------------- */}
        {dialogMode === 'REENVIO' && (
          <div className="px-6 py-4 bg-emerald-50 border-b border-emerald-200 text-xs space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-emerald-900 font-bold text-sm">
                <Send className="w-4 h-4 text-emerald-700" />
                <span>Reenviar Presupuesto Ajustado a Revisión (Versión {(presupuesto.version || 1) + 1})</span>
              </div>
              <button
                onClick={() => setDialogMode('NONE')}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                Cancelar
              </button>
            </div>

            <div className="p-3 bg-white rounded-xl border border-emerald-200 flex items-center justify-between">
              <div>
                <span className="text-slate-500 font-medium">Importe Total Actualizado:</span>
                <div className="text-base font-bold text-emerald-700 font-mono">
                  {presupuesto.importeTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </div>
              </div>
              <div className="text-right">
                <span className="text-slate-500 font-medium">Nueva Versión:</span>
                <div className="font-bold text-slate-900 font-mono">
                  v{(presupuesto.version || 1) + 1} (Revisión)
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-800 block">
                Notas y Cambios Aplicados para el Gestor / Propietario (Opcional)
              </label>
              <textarea
                rows={2}
                value={observacionesReenvio}
                onChange={(e) => setObservacionesReenvio(e.target.value)}
                placeholder="Describe brevemente las mejoras o correcciones aplicadas en respuesta al ajuste solicitado..."
                className="w-full p-2.5 border border-emerald-300 rounded-xl bg-white text-xs focus:ring-2 focus:ring-emerald-500 font-medium"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setDialogMode('NONE')}
                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isUpdating}
                onClick={handleConfirmarReenvio}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isUpdating ? 'Reenviando...' : 'Confirmar y Reenviar a Revisión'}
              </button>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-white space-y-6">
          {/* Status Alert Banner: EN_NEGOCIACION */}
          {presupuesto.estado === 'EN_NEGOCIACION' && (
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-950 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <RotateCcw className="w-5 h-5 text-orange-600 shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm text-orange-900">
                      Ajuste Solicitado (En Negociación)
                    </h4>
                    {presupuesto.solicitadoAjustePor && (
                      <p className="text-orange-700 text-[11px] mt-0.5">
                        Solicitado por <strong>{presupuesto.solicitadoAjustePor}</strong>
                        {presupuesto.fechaSolicitudAjuste
                          ? ` el ${new Date(presupuesto.fechaSolicitudAjuste).toLocaleDateString('es-ES')}`
                          : ''}
                      </p>
                    )}
                  </div>
                </div>
                {presupuesto.categoriaAjuste && (
                  <span className="px-2.5 py-1 bg-orange-200/80 text-orange-900 rounded-lg font-bold text-[11px]">
                    Motivo:{' '}
                    {CATEGORIA_AJUSTE_LABELS[presupuesto.categoriaAjuste as CategoriaMotivoAjuste]?.label ||
                      presupuesto.categoriaAjuste}
                  </span>
                )}
              </div>

              {presupuesto.motivoAjuste && (
                <div className="bg-white/80 border border-orange-200 p-3 rounded-lg text-slate-800 text-xs">
                  <strong className="text-orange-900 block mb-0.5">Detalle del requerimiento:</strong>
                  <p className="leading-relaxed">{presupuesto.motivoAjuste}</p>
                </div>
              )}
            </div>
          )}

          {/* Status Alert Banner: ACEPTADO */}
          {presupuesto.estado === 'ACEPTADO' && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-sm text-emerald-800">Presupuesto Aprobado y Adjudicado</h4>
                  <p className="text-emerald-700 mt-0.5">
                    {presupuesto.decididoPor
                      ? `Aprobado por ${presupuesto.decididoPor}`
                      : 'Presupuesto aprobado formalmente'}
                    {presupuesto.fechaDecision
                      ? ` el ${new Date(presupuesto.fechaDecision).toLocaleDateString('es-ES')}`
                      : ''}
                    .
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-bold">
                Adjudicación en firme
              </span>
            </div>
          )}

          {/* Status Alert Banner: RECHAZADO */}
          {presupuesto.estado === 'RECHAZADO' && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
              <div className="flex items-center space-x-2">
                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <h4 className="font-bold text-sm text-rose-800">Presupuesto Rechazado</h4>
                {presupuesto.fechaDecision && (
                  <span className="text-rose-600">
                    ({new Date(presupuesto.fechaDecision).toLocaleDateString('es-ES')})
                  </span>
                )}
              </div>
              {presupuesto.motivoRechazo && (
                <p className="text-rose-700 pl-6">
                  <strong>Motivo justificado:</strong> {presupuesto.motivoRechazo}
                </p>
              )}
              {presupuesto.decididoPor && (
                <p className="text-rose-500 pl-6 text-[11px]">Decidido por: {presupuesto.decididoPor}</p>
              )}
            </div>
          )}

          {/* Linked Cards: Trabajo e Inmueble / Profesional */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <span className="font-bold text-slate-700 uppercase tracking-wider block">
                Orden de Trabajo e Inmueble
              </span>
              {trabajo ? (
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{trabajo.titulo}</h4>
                  <p className="text-slate-600 mt-1">
                    {presupuesto.inmuebleDireccion || inmueble?.direccion || inmueble?.alias}
                  </p>
                  {onVerTrabajo && (
                    <button
                      onClick={() => onVerTrabajo(trabajo)}
                      className="text-blue-600 hover:underline font-semibold mt-2 inline-flex items-center space-x-1 cursor-pointer"
                    >
                      <span>Ver Orden de Trabajo ({trabajo.id.slice(-6)})</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-slate-400">Orden de trabajo vinculada ({presupuesto.trabajoId})</p>
              )}
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <span className="font-bold text-slate-700 uppercase tracking-wider block">
                Profesional Emisor
              </span>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  {presupuesto.profesionalNombre || profesional?.nombreComercial || 'Profesional'}
                </h4>
                {profesional?.cifNif && <p className="text-slate-500">CIF/NIF: {profesional.cifNif}</p>}
                {profesional?.telefono && <p className="text-slate-600 mt-0.5">Tel: {profesional.telefono}</p>}
                {presupuesto.documentoUrl && (
                  <a
                    href={presupuesto.documentoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline font-semibold mt-2 inline-flex items-center space-x-1"
                  >
                    <span>Descargar PDF / Justificante Oficial</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Scope / Description */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Alcance y Memoria Descriptiva
            </h4>
            <p className="text-xs text-slate-700 bg-white border border-slate-200 p-3 rounded-xl leading-relaxed whitespace-pre-line">
              {presupuesto.descripcion}
            </p>
          </div>

          {/* Line items table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Desglose de Partidas (Revisión v{presupuesto.version || 1})
              </h4>
              <span className="text-xs text-slate-500 font-medium">
                Validez de la oferta: <strong className="text-slate-700">{presupuesto.validez}</strong>
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3 pl-4">Concepto / Unidad de Obra</th>
                    <th className="p-3 text-center w-20">Cantidad</th>
                    <th className="p-3 text-right w-28">Precio Ud</th>
                    <th className="p-3 text-right w-28 pr-4">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {presupuesto.partidas && presupuesto.partidas.length > 0 ? (
                    presupuesto.partidas.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td className="p-3 pl-4 font-medium text-slate-800">{item.concepto}</td>
                        <td className="p-3 text-center text-slate-600">{item.cantidad}</td>
                        <td className="p-3 text-right text-slate-600">
                          {item.precioUnitario.toLocaleString('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                          })}
                        </td>
                        <td className="p-3 text-right font-bold text-slate-900 pr-4">
                          {item.importe.toLocaleString('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                          })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-400">
                        Sin partidas desglosadas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals Summary */}
          <div className="flex justify-end">
            <div className="w-full sm:w-72 bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Base Imponible:</span>
                <span className="font-semibold">
                  {presupuesto.importeBase.toLocaleString('es-ES', {
                    style: 'currency',
                    currency: 'EUR',
                  })}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>IVA ({presupuesto.porcentajeIva !== undefined ? presupuesto.porcentajeIva : 21}%):</span>
                <span className="font-semibold">
                  {presupuesto.iva.toLocaleString('es-ES', {
                    style: 'currency',
                    currency: 'EUR',
                  })}
                </span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Importe Total:</span>
                <span className="text-emerald-700 font-mono">
                  {presupuesto.importeTotal.toLocaleString('es-ES', {
                    style: 'currency',
                    currency: 'EUR',
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Historial Completo de Trazabilidad */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
              <History className="w-3.5 h-3.5 text-slate-500" />
              <span>Historial Completo de Decisiones, Revisiones y Ajustes</span>
            </h4>

            {presupuesto.historialDecision && presupuesto.historialDecision.length > 0 ? (
              <div className="space-y-2.5">
                {presupuesto.historialDecision.map((dec, idx) => {
                  const estAnt = ESTADO_PRESUPUESTO_LABELS[dec.estadoAnterior]?.label || dec.estadoAnterior;
                  const estNue = ESTADO_PRESUPUESTO_LABELS[dec.estadoNuevo]?.label || dec.estadoNuevo;

                  return (
                    <div
                      key={dec.id || idx}
                      className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-800">
                            {dec.accion === 'SOLICITUD_AJUSTE' && '🔄 Solicitud de Ajuste'}
                            {dec.accion === 'REENVIO' && '🚀 Reenvío de Presupuesto'}
                            {dec.accion === 'APROBACION' && '✅ Aprobación y Adjudicación'}
                            {dec.accion === 'RECHAZO' && '❌ Rechazo Formal'}
                            {dec.accion === 'MODIFICACION' && '✏️ Modificación'}
                            {dec.accion === 'CREACION' && '📄 Emisión Inicial'}
                            {!dec.accion && `${estAnt} → ${estNue}`}
                          </span>
                          <span className="text-[11px] text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded font-mono">
                            {estAnt} → {estNue}
                          </span>
                          {dec.version && (
                            <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                              v{dec.version}
                            </span>
                          )}
                        </div>
                        <div className="text-right text-[11px] text-slate-400">
                          <span>{new Date(dec.fecha).toLocaleString('es-ES')}</span>
                          <span className="block font-medium text-slate-600">Por: {dec.usuario}</span>
                        </div>
                      </div>

                      {dec.categoriaMotivo && (
                        <div className="text-amber-800 font-semibold text-[11px]">
                          Categoría: {CATEGORIA_AJUSTE_LABELS[dec.categoriaMotivo as CategoriaMotivoAjuste]?.label || dec.categoriaMotivo}
                        </div>
                      )}

                      {dec.motivo && (
                        <p className="text-slate-700 bg-white p-2 rounded-lg border border-slate-200">
                          <strong>Motivo:</strong> {dec.motivo}
                        </p>
                      )}

                      {dec.observaciones && dec.observaciones !== dec.motivo && (
                        <p className="text-slate-600 text-[11px] italic">
                          {dec.observaciones}
                        </p>
                      )}

                      {dec.importeTotal !== undefined && (
                        <div className="text-[11px] text-slate-500 font-mono text-right">
                          Importe registrado: {dec.importeTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                No hay eventos registrados en el histórico aún.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
