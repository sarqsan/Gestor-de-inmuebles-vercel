import React, { useState } from 'react';
import {
  GarantiaReparacion,
  Inmueble,
  Propietario,
  Profesional,
  UsuarioApp,
  EstadoGarantia,
} from '../../types';
import {
  evaluarEstadoGarantia,
} from '../../utils/mantenimientoEngine';
import {
  saveGarantiaReparacionFirestore,
  deleteGarantiaReparacionFirestore,
} from '../../lib/firebase';
import { GarantiaModal } from '../modals/GarantiaModal';
import {
  ShieldCheck,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Building2,
  User,
  Trash2,
  Edit,
  ShieldAlert,
  FileText,
  Tag,
} from 'lucide-react';

interface GarantiasReparacionPanelProps {
  garantias: GarantiaReparacion[];
  inmuebles: Inmueble[];
  propietarios?: Propietario[];
  profesionales?: Profesional[];
  currentUser?: UsuarioApp;
  inmuebleIdFiltro?: string;
}

export const GarantiasReparacionPanel: React.FC<GarantiasReparacionPanelProps> = ({
  garantias,
  inmuebles,
  propietarios = [],
  profesionales = [],
  currentUser,
  inmuebleIdFiltro,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filtroInmueble, setFiltroInmueble] = useState<string>(inmuebleIdFiltro || 'TODOS');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');

  // Modales
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [garantiaToEdit, setGarantiaToEdit] = useState<GarantiaReparacion | null>(null);

  const [notificacion, setNotificacion] = useState<{ tipo: 'success' | 'error'; mensaje: string } | null>(null);

  // Filtrado
  const now = new Date();
  const garantiasFiltradas = garantias.filter((g) => {
    if (inmuebleIdFiltro && g.inmuebleId !== inmuebleIdFiltro) return false;
    if (filtroInmueble !== 'TODOS' && g.inmuebleId !== filtroInmueble) return false;

    const estadoReal = g.estado === 'RECLAMADA' ? 'RECLAMADA' : evaluarEstadoGarantia(g.fechaFin);
    if (filtroEstado !== 'TODOS' && estadoReal !== filtroEstado) return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchTitulo = g.titulo?.toLowerCase().includes(q);
      const matchProv = g.proveedor?.toLowerCase().includes(q);
      const matchElem = g.elementoNombre?.toLowerCase().includes(q);
      const matchDesc = g.concepto?.toLowerCase().includes(q);
      if (!matchTitulo && !matchProv && !matchElem && !matchDesc) return false;
    }

    return true;
  });

  // Métricas
  const total = garantias.length;
  const activas = garantias.filter((g) => evaluarEstadoGarantia(g.fechaFin) === 'ACTIVA').length;
  const vencidas = garantias.filter((g) => evaluarEstadoGarantia(g.fechaFin) === 'VENCIDA').length;
  const reclamadas = garantias.filter((g) => g.estado === 'RECLAMADA').length;

  const handleSaveGarantia = async (garantia: GarantiaReparacion) => {
    await saveGarantiaReparacionFirestore(garantia);
    setNotificacion({ tipo: 'success', mensaje: 'Garantía guardada satisfactoriamente.' });
    setTimeout(() => setNotificacion(null), 4000);
  };

  const handleDeleteGarantia = async (id: string) => {
    if (window.confirm('¿Confirma la eliminación del registro de esta garantía?')) {
      await deleteGarantiaReparacionFirestore(id);
      setNotificacion({ tipo: 'success', mensaje: 'Garantía eliminada del sistema.' });
      setTimeout(() => setNotificacion(null), 4000);
    }
  };

  const getBadgeGarantia = (fechaFin: string, estado?: EstadoGarantia) => {
    if (estado === 'RECLAMADA') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
          <ShieldAlert className="w-3.5 h-3.5 text-purple-600" />
          EN RECLAMACIÓN
        </span>
      );
    }

    const st = evaluarEstadoGarantia(fechaFin);
    if (st === 'ACTIVA') {
      const dFin = new Date(fechaFin);
      const diffDays = Math.ceil((dFin.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          GARANTÍA ACTIVA ({diffDays} días rest.)
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
        <Clock className="w-3.5 h-3.5 text-slate-500" />
        VENCIDA
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Toast */}
      {notificacion && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between shadow-md transition-all ${
            notificacion.tipo === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
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

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Garantías</span>
          <span className="text-xl font-black text-slate-900">{total}</span>
        </div>
        <div className="p-3.5 bg-emerald-50/40 border border-emerald-200 rounded-xl shadow-xs">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">Garantías Vigentes</span>
          <span className="text-xl font-black text-emerald-900">{activas}</span>
        </div>
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Garantías Vencidas</span>
          <span className="text-xl font-black text-slate-700">{vencidas}</span>
        </div>
        <div className="p-3.5 bg-purple-50/40 border border-purple-200 rounded-xl shadow-xs">
          <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider block">Reclamaciones</span>
          <span className="text-xl font-black text-purple-900">{reclamadas}</span>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar reparación, técnico, caldera..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500 outline-none"
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
            <option value="ACTIVA">Garantías Activas</option>
            <option value="VENCIDA">Garantías Vencidas</option>
            <option value="RECLAMADA">En Reclamación</option>
          </select>
        </div>

        <button
          onClick={() => {
            setGarantiaToEdit(null);
            setIsModalOpen(true);
          }}
          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>+ Registrar Garantía</span>
        </button>
      </div>

      {/* Listado de Garantías */}
      {garantiasFiltradas.length === 0 ? (
        <div className="p-8 text-center bg-white border border-dashed border-slate-300 rounded-2xl text-slate-500 space-y-2">
          <ShieldCheck className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-xs font-bold text-slate-700">No hay garantías registradas</p>
          <p className="text-[11px] text-slate-400">
            Al finalizar órdenes de trabajo o reparaciones importantes, registre la garantía para asegurar cobertura en reincidencias.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {garantiasFiltradas.map((garantia) => {
            const inm = inmuebles.find((i) => i.id === garantia.inmuebleId);

            return (
              <div
                key={garantia.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs hover:border-emerald-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                {/* Info Principal */}
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {getBadgeGarantia(garantia.fechaFin, garantia.estado)}

                    {garantia.elementoNombre && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        📦 {garantia.elementoNombre}
                      </span>
                    )}

                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                      ⏱ {garantia.duracionMeses} meses de cobertura
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-black text-slate-900">{garantia.titulo}</h3>
                    {garantia.concepto && (
                      <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{garantia.concepto}</p>
                    )}
                  </div>

                  {/* Cobertura y Fechas */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                    <span className="flex items-center gap-1 font-medium text-slate-700">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      {inm?.alias || inm?.direccion || 'Inmueble'}
                    </span>

                    <span className="flex items-center gap-1 font-semibold text-slate-800">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      Proveedor: {garantia.proveedor}
                    </span>

                    <span className="flex items-center gap-1 text-slate-600">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Desde: {new Date(garantia.fechaInicio).toLocaleDateString('es-ES')}
                    </span>

                    <span className="flex items-center gap-1 font-bold text-emerald-800">
                      <Clock className="w-3.5 h-3.5 text-emerald-600" />
                      Hasta: {new Date(garantia.fechaFin).toLocaleDateString('es-ES')}
                    </span>
                  </div>

                  {garantia.cobertura && (
                    <div className="p-2 bg-slate-50 rounded-lg text-[11px] text-slate-600 border border-slate-100">
                      <strong className="text-slate-800">Cobertura:</strong> {garantia.cobertura}
                    </div>
                  )}
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <button
                    onClick={() => {
                      setGarantiaToEdit(garantia);
                      setIsModalOpen(true);
                    }}
                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                    title="Editar garantía"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteGarantia(garantia.id)}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    title="Eliminar garantía"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <GarantiaModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveGarantia}
        inmuebles={inmuebles}
        propietarios={propietarios}
        profesionales={profesionales}
        currentUser={currentUser}
        garantiaToEdit={garantiaToEdit}
        defaultInmuebleId={inmuebleIdFiltro}
      />
    </div>
  );
};
