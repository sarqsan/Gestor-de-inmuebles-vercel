import React, { useState } from 'react';
import {
  TareaMantenimiento,
  Inmueble,
  Propietario,
  Profesional,
  UsuarioApp,
  TrabajoProfesional,
  EstadoSeguimientoMantenimiento,
} from '../../types';
import {
  PERIODICIDAD_LABELS,
  TIPO_MANTENIMIENTO_LABELS,
  evaluarEstadoSeguimiento,
  generarOrdenTrabajoPreventiva,
} from '../../utils/mantenimientoEngine';
import { CATEGORIAS_INCIDENCIA_LABELS } from '../../utils/incidenciasEngine';
import {
  saveTareaMantenimientoFirestore,
  deleteTareaMantenimientoFirestore,
  saveTrabajoProfesionalFirestore,
} from '../../lib/firebase';
import { TareaMantenimientoModal } from '../modals/TareaMantenimientoModal';
import { RegistrarActuacionModal } from '../modals/RegistrarActuacionModal';
import {
  Wrench,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Building2,
  DollarSign,
  ChevronRight,
  MoreVertical,
  Trash2,
  Edit,
  FileText,
  PlayCircle,
  Tag,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface MantenimientoPreventivoPanelProps {
  tareas: TareaMantenimiento[];
  inmuebles: Inmueble[];
  propietarios?: Propietario[];
  profesionales?: Profesional[];
  trabajos?: TrabajoProfesional[];
  currentUser?: UsuarioApp;
  inmuebleIdFiltro?: string; // Si se renderiza dentro de la ficha de un inmueble
}

export const MantenimientoPreventivoPanel: React.FC<MantenimientoPreventivoPanelProps> = ({
  tareas,
  inmuebles,
  propietarios = [],
  profesionales = [],
  trabajos = [],
  currentUser,
  inmuebleIdFiltro,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filtroInmueble, setFiltroInmueble] = useState<string>(inmuebleIdFiltro || 'TODOS');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');

  // Modales
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [tareaToEdit, setTareaToEdit] = useState<TareaMantenimiento | null>(null);

  const [isActuacionModalOpen, setIsActuacionModalOpen] = useState<boolean>(false);
  const [tareaParaActuacion, setTareaParaActuacion] = useState<TareaMantenimiento | null>(null);

  const [notificacion, setNotificacion] = useState<{ tipo: 'success' | 'error'; mensaje: string } | null>(null);

  // Filtrado de tareas
  const tareasFiltradas = tareas.filter((t) => {
    // Si viene fijado por prop inmuebleIdFiltro
    if (inmuebleIdFiltro && t.inmuebleId !== inmuebleIdFiltro) return false;
    if (filtroInmueble !== 'TODOS' && t.inmuebleId !== filtroInmueble) return false;
    if (filtroTipo !== 'TODOS' && t.tipo !== filtroTipo) return false;

    const estadoReal = evaluarEstadoSeguimiento(t.proximaFecha, t.activa, 30, Boolean(t.ultimaOrdenTrabajoId));
    if (filtroEstado !== 'TODOS' && estadoReal !== filtroEstado) return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchTitulo = t.titulo?.toLowerCase().includes(q);
      const matchElemento = t.elementoNombre?.toLowerCase().includes(q);
      const matchDesc = t.descripcion?.toLowerCase().includes(q);
      const matchDir = t.inmuebleDireccion?.toLowerCase().includes(q);
      if (!matchTitulo && !matchElemento && !matchDesc && !matchDir) return false;
    }

    return true;
  });

  // Métricas rápidas
  const total = tareas.length;
  const vencidas = tareas.filter((t) => evaluarEstadoSeguimiento(t.proximaFecha, t.activa, 30, Boolean(t.ultimaOrdenTrabajoId)) === 'VENCIDO').length;
  const proximas = tareas.filter((t) => evaluarEstadoSeguimiento(t.proximaFecha, t.activa, 30, Boolean(t.ultimaOrdenTrabajoId)) === 'PROXIMO').length;
  const enCurso = tareas.filter((t) => evaluarEstadoSeguimiento(t.proximaFecha, t.activa, 30, Boolean(t.ultimaOrdenTrabajoId)) === 'EN_CURSO').length;

  // Handlers
  const handleSaveTarea = async (tarea: TareaMantenimiento) => {
    await saveTareaMantenimientoFirestore(tarea);
    setNotificacion({ tipo: 'success', mensaje: 'Plan de mantenimiento guardado correctamente.' });
    setTimeout(() => setNotificacion(null), 4000);
  };

  const handleDeleteTarea = async (id: string) => {
    if (window.confirm('¿Está seguro de eliminar este plan de mantenimiento preventivo?')) {
      await deleteTareaMantenimientoFirestore(id);
      setNotificacion({ tipo: 'success', mensaje: 'Plan eliminado de la base de datos.' });
      setTimeout(() => setNotificacion(null), 4000);
    }
  };

  const handleGenerarOT = async (tarea: TareaMantenimiento) => {
    try {
      // Validar si ya tiene OT activa
      const result = generarOrdenTrabajoPreventiva({
        plan: tarea,
        trabajosExistentes: trabajos,
        usuarioNombre: currentUser?.nombre || 'Gestor Patrimonial',
        usuarioId: currentUser?.id,
      });

      if (result.yaExiste && result.trabajo) {
        setNotificacion({
          tipo: 'error',
          mensaje: `Ya existe una Orden de Trabajo activa para este plan (${result.trabajo.id}). Evitada duplicidad.`,
        });
        setTimeout(() => setNotificacion(null), 5000);
        return;
      }

      if (!result.trabajo) {
        throw new Error(result.error || 'No se pudo generar la orden de trabajo');
      }

      // Guardar la nueva OT en Firestore
      await saveTrabajoProfesionalFirestore(result.trabajo);

      // Actualizar la tarea con el ID de la OT
      const tareaActualizada: TareaMantenimiento = {
        ...tarea,
        ultimaOrdenTrabajoId: result.trabajo.id,
        estadoSeguimiento: 'EN_CURSO',
        updatedAt: new Date().toISOString(),
      };
      await saveTareaMantenimientoFirestore(tareaActualizada);

      setNotificacion({
        tipo: 'success',
        mensaje: `Orden de Trabajo ${result.trabajo.id} generada con éxito e integrada en el flujo técnico.`,
      });
      setTimeout(() => setNotificacion(null), 5000);
    } catch (err: any) {
      console.error('Error generating preventive work order:', err);
      setNotificacion({ tipo: 'error', mensaje: err?.message || 'Error al generar la Orden de Trabajo.' });
      setTimeout(() => setNotificacion(null), 5000);
    }
  };

  const getBadgeEstado = (proximaFecha: string, activa: boolean, otId?: string) => {
    const estado = evaluarEstadoSeguimiento(proximaFecha, activa, 30, Boolean(otId));
    switch (estado) {
      case 'VENCIDO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            VENCIDO
          </span>
        );
      case 'PROXIMO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            PRÓXIMO (≤ 15 días)
          </span>
        );
      case 'EN_CURSO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <PlayCircle className="w-3.5 h-3.5 text-purple-600" />
            OT EN CURSO
          </span>
        );
      case 'COMPLETADO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            COMPLETADO
          </span>
        );
      case 'FUTURO':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            AL DÍA
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* Notificación Toast */}
      {notificacion && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between shadow-md transition-all ${
            notificacion.tipo === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-bold">
            {notificacion.tipo === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{notificacion.mensaje}</span>
          </div>
          <button
            onClick={() => setNotificacion(null)}
            className="text-slate-400 hover:text-slate-600 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Barra superior de métricas y acción */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Planes</span>
          <span className="text-xl font-black text-slate-900">{total}</span>
        </div>
        <div className="p-3.5 bg-rose-50/40 border border-rose-200 rounded-xl shadow-xs">
          <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block">Vencidos / Urgentes</span>
          <span className="text-xl font-black text-rose-900">{vencidas}</span>
        </div>
        <div className="p-3.5 bg-amber-50/40 border border-amber-200 rounded-xl shadow-xs">
          <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block">Próximos (15d)</span>
          <span className="text-xl font-black text-amber-900">{proximas}</span>
        </div>
        <div className="p-3.5 bg-purple-50/40 border border-purple-200 rounded-xl shadow-xs">
          <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wider block">Con OT en Curso</span>
          <span className="text-xl font-black text-purple-900">{enCurso}</span>
        </div>
      </div>

      {/* Barra de Filtros y Botón Nuevo */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar plan, caldera, filtro..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
            />
          </div>

          {!inmuebleIdFiltro && (
            <select
              value={filtroInmueble}
              onChange={(e) => setFiltroInmueble(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 outline-none"
            >
              <option value="TODOS">Todos los inmuebles</option>
              {inmuebles.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.alias || i.direccion}
                </option>
              ))}
            </select>
          )}

          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-none"
          >
            <option value="TODOS">Todos los estados</option>
            <option value="VENCIDO">Vencidos</option>
            <option value="PROXIMO">Próximos (15 días)</option>
            <option value="EN_CURSO">OT en Curso</option>
            <option value="FUTURO">Al día / Futuros</option>
            <option value="COMPLETADO">Completados</option>
          </select>
        </div>

        <button
          onClick={() => {
            setTareaToEdit(null);
            setIsModalOpen(true);
          }}
          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>+ Nuevo Plan Preventivo</span>
        </button>
      </div>

      {/* Listado de Planes de Mantenimiento */}
      {tareasFiltradas.length === 0 ? (
        <div className="p-8 text-center bg-white border border-dashed border-slate-300 rounded-2xl text-slate-500 space-y-2">
          <Wrench className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-xs font-bold text-slate-700">No hay planes de mantenimiento registrados</p>
          <p className="text-[11px] text-slate-400">
            Cree un nuevo plan para programar revisiones de caldera, climatización o revisiones periódicas.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {tareasFiltradas.map((tarea) => {
            const inm = inmuebles.find((i) => i.id === tarea.inmuebleId);
            const tieneOtActiva = Boolean(tarea.ultimaOrdenTrabajoId);

            return (
              <div
                key={tarea.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs hover:border-blue-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                {/* Info Principal */}
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {getBadgeEstado(tarea.proximaFecha, tarea.activa, tarea.ultimaOrdenTrabajoId)}

                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                      {TIPO_MANTENIMIENTO_LABELS[tarea.tipo || 'PREVENTIVO']}
                    </span>

                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      {PERIODICIDAD_LABELS[tarea.periodicidad || 'ANUAL']}
                    </span>

                    {tarea.elementoNombre && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        📦 {tarea.elementoNombre}
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-black text-slate-900">{tarea.titulo}</h3>
                    {tarea.descripcion && (
                      <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{tarea.descripcion}</p>
                    )}
                  </div>

                  {/* Metadatos y Fechas */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                    <span className="flex items-center gap-1 font-medium text-slate-700">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      {inm?.alias || inm?.direccion || tarea.inmuebleDireccion || 'Inmueble'}
                    </span>

                    <span className="flex items-center gap-1 font-bold text-slate-900">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      Próxima: {new Date(tarea.proximaFecha).toLocaleDateString('es-ES')}
                    </span>

                    {tarea.ultimaFechaRealizada && (
                      <span className="flex items-center gap-1 text-slate-500">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Última: {new Date(tarea.ultimaFechaRealizada).toLocaleDateString('es-ES')}
                      </span>
                    )}

                    {tarea.costeEstimado !== undefined && (
                      <span className="flex items-center gap-1 font-mono font-semibold text-slate-700">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                        Est: {tarea.costeEstimado.toFixed(2)} €
                      </span>
                    )}

                    {tarea.profesionalPreferidoNombre && (
                      <span className="text-[11px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        SAT: {tarea.profesionalPreferidoNombre}
                      </span>
                    )}
                  </div>
                </div>

                {/* Acciones de la Tarea */}
                <div className="flex flex-wrap sm:flex-col items-center sm:items-end gap-2 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  {/* Botón Marcar Realizada */}
                  <button
                    onClick={() => {
                      setTareaParaActuacion(tarea);
                      setIsActuacionModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                    title="Registrar que se realizó la actuación"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Marcar Realizada</span>
                  </button>

                  {/* Botón Generar OT Preventiva */}
                  <button
                    onClick={() => handleGenerarOT(tarea)}
                    disabled={tieneOtActiva}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
                      tieneOtActiva
                        ? 'bg-purple-50 text-purple-700 border border-purple-200 cursor-not-allowed opacity-80'
                        : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-xs'
                    }`}
                    title={tieneOtActiva ? 'Ya existe una Orden de Trabajo activa' : 'Emitir Orden de Trabajo preventiva'}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>{tieneOtActiva ? 'OT en Curso' : 'Generar OT'}</span>
                  </button>

                  {/* Acciones Secundarias (Editar / Borrar) */}
                  <div className="flex items-center gap-1 pt-1">
                    <button
                      onClick={() => {
                        setTareaToEdit(tarea);
                        setIsModalOpen(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar plan"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteTarea(tarea.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Eliminar plan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Nuevo / Editar Plan */}
      <TareaMantenimientoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveTarea}
        inmuebles={inmuebles}
        propietarios={propietarios}
        profesionales={profesionales}
        currentUser={currentUser}
        tareaToEdit={tareaToEdit}
        defaultInmuebleId={inmuebleIdFiltro}
      />

      {/* Modal Registrar Actuación */}
      {tareaParaActuacion && (
        <RegistrarActuacionModal
          isOpen={isActuacionModalOpen}
          onClose={() => setIsActuacionModalOpen(false)}
          onSave={handleSaveTarea}
          tarea={tareaParaActuacion}
          profesionales={profesionales}
          currentUser={currentUser}
        />
      )}
    </div>
  );
};
