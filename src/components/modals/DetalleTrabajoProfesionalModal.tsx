import React, { useState } from 'react';
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
} from 'lucide-react';
import {
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
import { saveTrabajoProfesionalFirestore, saveIncidenciaFirestore } from '../../lib/firebase';

interface DetalleTrabajoProfesionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  trabajo: TrabajoProfesional;
  presupuestos: PresupuestoProfesional[];
  profesionales: Profesional[];
  inmuebles: Inmueble[];
  incidencias: Incidencia[];
  currentUser?: UsuarioApp;
  onEditarTrabajo?: (trabajo: TrabajoProfesional) => void;
  onCrearPresupuesto?: (trabajo: TrabajoProfesional) => void;
  onVerPresupuesto?: (presupuesto: PresupuestoProfesional) => void;
  onValorarProfesional?: (trabajo: TrabajoProfesional) => void;
  onVerIncidencia?: (incidencia: Incidencia) => void;
}

export const DetalleTrabajoProfesionalModal: React.FC<DetalleTrabajoProfesionalModalProps> = ({
  isOpen,
  onClose,
  trabajo,
  presupuestos,
  profesionales,
  inmuebles,
  incidencias,
  currentUser,
  onEditarTrabajo,
  onCrearPresupuesto,
  onVerPresupuesto,
  onValorarProfesional,
  onVerIncidencia,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'presupuestos' | 'historial' | 'adjuntos'>('general');
  const [isUpdating, setIsUpdating] = useState(false);

  if (!isOpen) return null;

  const estadoInfo = ESTADO_TRABAJO_LABELS[trabajo.estado] || ESTADO_TRABAJO_LABELS.PENDIENTE;
  const prioridadInfo = PRIORIDAD_TRABAJO_LABELS[trabajo.prioridad] || PRIORIDAD_TRABAJO_LABELS.NORMAL;

  const profesionalAsignado = profesionales.find((p) => p.id === trabajo.profesionalId);
  const inmueble = inmuebles.find((i) => i.id === trabajo.inmuebleId);
  const incidenciaVinculada = incidencias.find((inc) => inc.id === trabajo.incidenciaId);
  const presupuestosDelTrabajo = presupuestos.filter((p) => p.trabajoId === trabajo.id);

  // Transition state helper
  const handleCambiarEstado = async (nuevoEstado: EstadoTrabajoProfesional, observacion?: string) => {
    try {
      setIsUpdating(true);
      const usuarioNombre = currentUser?.nombre
        ? `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim()
        : 'Administrador';

      const nuevoHistorial = [
        ...(trabajo.historial || []),
        crearItemHistorialTrabajo(
          'ESTADO_MODIFICADO',
          usuarioNombre,
          trabajo.estado,
          nuevoEstado,
          observacion || `Transición a ${ESTADO_TRABAJO_LABELS[nuevoEstado]?.label || nuevoEstado}`
        ),
      ];

      const trabajoActualizado: TrabajoProfesional = {
        ...trabajo,
        estado: nuevoEstado,
        historial: nuevoHistorial,
        fechaFinalizacion:
          nuevoEstado === 'FINALIZADO' ? new Date().toISOString() : trabajo.fechaFinalizacion,
        updatedAt: new Date().toISOString(),
      };

      await saveTrabajoProfesionalFirestore(trabajoActualizado);

      // Sync incidence if linked
      if (incidenciaVinculada) {
        let nuevoEstadoInc = incidenciaVinculada.estado;
        if (nuevoEstado === 'EN_EJECUCION') nuevoEstadoInc = 'EN_REPARACION';
        if (nuevoEstado === 'FINALIZADO') nuevoEstadoInc = 'RESUELTA';

        const incActualizada: Incidencia = {
          ...incidenciaVinculada,
          estado: nuevoEstadoInc,
          trabajoProfesional: {
            ...incidenciaVinculada.trabajoProfesional,
            estado: nuevoEstado === 'FINALIZADO' ? 'COMPLETADO' : 'EN_CURSO',
          },
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

  const currentStepIndex = steps.findIndex((s) => s.key === trabajo.estado);

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
                <h2 className="text-xl font-bold text-slate-900">{trabajo.titulo}</h2>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${estadoInfo.badgeClass}`}>
                  {estadoInfo.label}
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${prioridadInfo.badgeClass}`}>
                  {prioridadInfo.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-center space-x-2">
                <Building2 className="w-3.5 h-3.5" />
                <span>{trabajo.inmuebleDireccion || inmueble?.direccion || 'Inmueble'}</span>
                <span>•</span>
                <span>Especialidad: <strong>{trabajo.categoria}</strong></span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onEditarTrabajo && (
              <button
                onClick={() => onEditarTrabajo(trabajo)}
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
              const isPast = currentStepIndex > idx || trabajo.estado === 'FINALIZADO';
              const isCurrent = step.key === trabajo.estado;
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
        <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-between flex-wrap gap-2 text-xs">
          <span className="font-semibold text-slate-500">Acciones de Flujo de Trabajo:</span>
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            {trabajo.estado === 'PENDIENTE' && (
              <button
                disabled={isUpdating}
                onClick={() => handleCambiarEstado('BUSCANDO_PROFESIONAL')}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg shadow-xs"
              >
                Buscar Profesional
              </button>
            )}

            {(trabajo.estado === 'PENDIENTE' || trabajo.estado === 'BUSCANDO_PROFESIONAL') && (
              <button
                disabled={isUpdating}
                onClick={() => handleCambiarEstado('PRESUPUESTO_SOLICITADO')}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg shadow-xs"
              >
                Solicitar Presupuesto
              </button>
            )}

            {trabajo.estado === 'PRESUPUESTO_RECIBIDO' && (
              <button
                disabled={isUpdating}
                onClick={() => handleCambiarEstado('ACEPTADO', 'Presupuesto aprobado por el gestor')}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg shadow-xs"
              >
                Aceptar Trabajo
              </button>
            )}

            {trabajo.estado === 'ACEPTADO' && (
              <button
                disabled={isUpdating}
                onClick={() => handleCambiarEstado('PROGRAMADO')}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg shadow-xs"
              >
                Programar Fecha
              </button>
            )}

            {(trabajo.estado === 'PROGRAMADO' || trabajo.estado === 'ACEPTADO') && (
              <button
                disabled={isUpdating}
                onClick={() => handleCambiarEstado('EN_EJECUCION', 'Inicio de trabajos en la vivienda')}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs"
              >
                Iniciar Trabajo (En Ejecución)
              </button>
            )}

            {trabajo.estado === 'EN_EJECUCION' && (
              <>
                <button
                  disabled={isUpdating}
                  onClick={() => handleCambiarEstado('PENDIENTE_MATERIAL')}
                  className="px-2.5 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-800 font-semibold rounded-lg border border-orange-200"
                >
                  Pendiente Material
                </button>
                <button
                  disabled={isUpdating}
                  onClick={() => handleCambiarEstado('FINALIZADO', 'Trabajo finalizado y comprobado')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs"
                >
                  Marcar Finalizado
                </button>
              </>
            )}

            {trabajo.estado === 'PENDIENTE_MATERIAL' && (
              <button
                disabled={isUpdating}
                onClick={() => handleCambiarEstado('EN_EJECUCION', 'Reanudación tras recibir material')}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs"
              >
                Reanudar Ejecución
              </button>
            )}

            {trabajo.estado === 'FINALIZADO' && !trabajo.valoracion && onValorarProfesional && (
              <button
                onClick={() => onValorarProfesional(trabajo)}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg shadow-xs flex items-center space-x-1"
              >
                <Star className="w-3.5 h-3.5 fill-white" />
                <span>Valorar Profesional</span>
              </button>
            )}

            {trabajo.estado !== 'CANCELADO' && trabajo.estado !== 'FINALIZADO' && (
              <button
                disabled={isUpdating}
                onClick={() => {
                  if (confirm('¿Deseas cancelar esta orden de trabajo?')) {
                    handleCambiarEstado('CANCELADO', 'Cancelado por el usuario');
                  }
                }}
                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg border border-rose-200"
              >
                Cancelar
              </button>
            )}
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
            Documentos y Fotos ({trabajo.documentos?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('historial')}
            className={`py-3 px-3 border-b-2 transition-colors ${
              activeTab === 'historial'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Línea de Tiempo ({trabajo.historial?.length || 0})
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
                  {trabajo.descripcion || 'Sin descripción detallada registrada.'}
                </p>
                {trabajo.observaciones && (
                  <div className="pt-3 border-t border-slate-200 text-xs text-slate-600 italic">
                    <strong>Nota interna:</strong> {trabajo.observaciones}
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
                        {inmueble?.direccion || trabajo.inmuebleDireccion || 'Vivienda'}
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
                            className="text-xs text-blue-600 hover:underline flex items-center space-x-1 font-semibold"
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div>
                  <span className="text-slate-400 block font-medium">Solicitud</span>
                  <span className="font-bold text-slate-800">
                    {new Date(trabajo.fechaSolicitud).toLocaleDateString('es-ES')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Inicio Previsto</span>
                  <span className="font-bold text-slate-800">
                    {trabajo.fechaInicio ? new Date(trabajo.fechaInicio).toLocaleDateString('es-ES') : 'Sin fijar'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Importe Estimado</span>
                  <span className="font-bold text-slate-800">
                    {trabajo.importeEstimado !== undefined
                      ? trabajo.importeEstimado.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
                      : 'Pendiente'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Importe Final</span>
                  <span className="font-bold text-emerald-600">
                    {trabajo.importeFinal !== undefined
                      ? trabajo.importeFinal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
                      : 'No liquidado'}
                  </span>
                </div>
              </div>

              {/* Valoración post-intervención si existe */}
              {trabajo.valoracion && (
                <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span>Valoración Registrada del Trabajo</span>
                    </h4>
                    <span className="text-xs text-slate-500">
                      {new Date(trabajo.valoracion.fecha).toLocaleDateString('es-ES')}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-4 h-4 ${
                          s <= trabajo.valoracion!.puntuacion
                            ? 'text-amber-500 fill-amber-500'
                            : 'text-slate-200'
                        }`}
                      />
                    ))}
                    <span className="text-xs font-bold text-slate-800 ml-1.5">
                      {trabajo.valoracion.puntuacion}/5 ({trabajo.valoracion.resultado})
                    </span>
                  </div>
                  {trabajo.valoracion.comentario && (
                    <p className="text-xs text-slate-700 italic">"{trabajo.valoracion.comentario}"</p>
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
                    onClick={() => onCrearPresupuesto(trabajo)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Añadir Presupuesto</span>
                  </button>
                )}
              </div>

              {presupuestosDelTrabajo.length > 0 ? (
                presupuestosDelTrabajo.map((pres) => {
                  const estInfo = ESTADO_PRESUPUESTO_LABELS[pres.estado] || ESTADO_PRESUPUESTO_LABELS.BORRADOR;
                  return (
                    <div
                      key={pres.id}
                      className="p-4 border border-slate-200 rounded-xl bg-white hover:border-blue-300 transition-colors space-y-2"
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
                          </div>
                          <p className="text-xs text-slate-700 mt-1">{pres.descripcion}</p>
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
                            className="text-blue-600 hover:underline font-semibold"
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
              {trabajo.documentos && trabajo.documentos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {trabajo.documentos.map((doc) => (
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
                {trabajo.historial && trabajo.historial.length > 0 ? (
                  trabajo.historial.map((item, idx) => (
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
      </div>
    </div>
  );
};
