import React, { useState } from 'react';
import {
  SolicitudAlquiler,
  SolicitudEstado,
  Inmueble,
} from '../../types';
import {
  FileText,
  Filter,
  Search,
  Building2,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Phone,
  Mail,
  Sparkles,
  ChevronRight,
  UserCheck,
  TrendingUp,
  FileCheck,
  Calendar,
  XCircle,
} from 'lucide-react';

interface SolicitudesSectionProps {
  solicitudes: SolicitudAlquiler[];
  inmuebles: Inmueble[];
  onSelectSolicitud: (solicitud: SolicitudAlquiler) => void;
  onTriggerAiAnalysis: (solicitud: SolicitudAlquiler) => void;
}

export const SolicitudesSection: React.FC<SolicitudesSectionProps> = ({
  solicitudes,
  inmuebles,
  onSelectSolicitud,
  onTriggerAiAnalysis,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInmuebleId, setSelectedInmuebleId] = useState<string>('all');
  const [selectedEstado, setSelectedEstado] = useState<string>('all');
  const [filterCuestionario, setFilterCuestionario] = useState<string>('all');
  const [filterDocComplete, setFilterDocComplete] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'fecha' | 'solvencia' | 'perfil'>('fecha');

  // Filter logic
  const filteredSolicitudes = solicitudes.filter((sol) => {
    // Search
    const query = searchQuery.toLowerCase();
    const matchQuery =
      sol.candidatoNombre.toLowerCase().includes(query) ||
      sol.inmuebleNombre.toLowerCase().includes(query) ||
      sol.candidatoEmail.toLowerCase().includes(query);

    if (!matchQuery) return false;

    // Inmueble
    if (selectedInmuebleId !== 'all' && sol.inmuebleId !== selectedInmuebleId) return false;

    // Estado
    if (selectedEstado !== 'all' && sol.estado !== selectedEstado) return false;

    // Cuestionario
    if (filterCuestionario === 'si' && !sol.cuestionarioCompletado) return false;
    if (filterCuestionario === 'no' && sol.cuestionarioCompletado) return false;

    // Doc complete
    if (filterDocComplete === 'si' && !sol.documentosCompletados) return false;
    if (filterDocComplete === 'no' && sol.documentosCompletados) return false;

    return true;
  });

  // Sort logic
  const sortedSolicitudes = [...filteredSolicitudes].sort((a, b) => {
    if (sortBy === 'solvencia') {
      return (b.scoreSolvencia || 0) - (a.scoreSolvencia || 0);
    }
    if (sortBy === 'perfil') {
      return (b.perfilOperativo || 0) - (a.perfilOperativo || 0);
    }
    // Default: fecha
    return new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime();
  });

  const getEstadoBadge = (st: SolicitudEstado) => {
    switch (st) {
      case 'SELECCIONADO':
        return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-extrabold rounded-full text-[10px]">SELECCIONADO</span>;
      case 'NO SELECCIONADO':
        return <span className="px-2.5 py-1 bg-rose-100 text-rose-800 font-extrabold rounded-full text-[10px]">NO SELECCIONADO</span>;
      case 'CANCELADA':
        return <span className="px-2.5 py-1 bg-slate-200 text-slate-700 font-extrabold rounded-full text-[10px]">CANCELADA</span>;
      case 'EN ANÁLISIS':
        return <span className="px-2.5 py-1 bg-purple-100 text-purple-800 font-extrabold rounded-full text-[10px]">EN ANÁLISIS</span>;
      case 'DOCUMENTACIÓN PENDIENTE':
        return <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-extrabold rounded-full text-[10px]">DOC. PENDIENTE</span>;
      case 'CUESTIONARIO COMPLETADO':
        return <span className="px-2.5 py-1 bg-blue-100 text-blue-800 font-extrabold rounded-full text-[10px]">CUESTIONARIO COMP.</span>;
      default:
        return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-extrabold rounded-full text-[10px]">{st}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 block">
            Gestión de Alquileres
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Solicitudes de Alquiler
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Solicitudes recibidas a través de los portales de candidatos.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 bg-blue-50 border border-blue-200/80 rounded-2xl text-blue-900 text-xs font-bold">
            Total Solicitudes: {solicitudes.length}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Buscar por candidato o inmueble..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Inmueble Filter */}
          <div>
            <select
              value={selectedInmuebleId}
              onChange={(e) => setSelectedInmuebleId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
            >
              <option value="all">Todos los Inmuebles</option>
              {inmuebles.map((inm) => (
                <option key={inm.id} value={inm.id}>
                  {inm.direccion} ({inm.precio} €/mes)
                </option>
              ))}
            </select>
          </div>

          {/* Estado Filter */}
          <div>
            <select
              value={selectedEstado}
              onChange={(e) => setSelectedEstado(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
            >
              <option value="all">Todos los Estados</option>
              <option value="NUEVA">NUEVA</option>
              <option value="CUESTIONARIO COMPLETADO">CUESTIONARIO COMPLETADO</option>
              <option value="DOCUMENTACIÓN PENDIENTE">DOCUMENTACIÓN PENDIENTE</option>
              <option value="DOCUMENTACIÓN COMPLETA">DOCUMENTACIÓN COMPLETA</option>
              <option value="EN ANÁLISIS">EN ANÁLISIS</option>
              <option value="SELECCIONADO">SELECCIONADO</option>
              <option value="NO SELECCIONADO">NO SELECCIONADO</option>
              <option value="CANCELADA">CANCELADA</option>
            </select>
          </div>
        </div>

        {/* Secondary Filters & Sort */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Filtros:</span>
            </span>

            <select
              value={filterCuestionario}
              onChange={(e) => setFilterCuestionario(e.target.value)}
              className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-bold"
            >
              <option value="all">Cuestionario: Todos</option>
              <option value="si">Completado</option>
              <option value="no">Pendiente</option>
            </select>

            <select
              value={filterDocComplete}
              onChange={(e) => setFilterDocComplete(e.target.value)}
              className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-bold"
            >
              <option value="all">Documentación: Todos</option>
              <option value="si">Completa</option>
              <option value="no">Pendiente</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-400">Ordenar por:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-800 font-bold"
            >
              <option value="fecha">Fecha Reciente</option>
              <option value="solvencia">Mayor Solvencia</option>
              <option value="perfil">Mayor Perfil Operativo</option>
            </select>
          </div>
        </div>
      </div>

      {/* Applications Cards Grid */}
      {sortedSolicitudes.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/90 shadow-2xs space-y-3">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No hay solicitudes encontradas</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Prueba a cambiar los filtros de búsqueda o genera un enlace de solicitud desde la sección de Inmuebles.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedSolicitudes.map((sol) => (
            <div
              key={sol.id}
              className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">{sol.candidatoNombre}</h3>
                    <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                      <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>{sol.inmuebleNombre}</span>
                      <span className="font-bold text-slate-800">({sol.inmueblePrecio} €/m)</span>
                    </p>
                  </div>
                  {getEstadoBadge(sol.estado)}
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {sol.cuestionarioCompletado ? (
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-xl text-[11px] font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Cuestionario (12/12)
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200/80 rounded-xl text-[11px] font-bold flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" /> Cuestionario pendiente
                    </span>
                  )}

                  {sol.documentosCompletados ? (
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-xl text-[11px] font-bold flex items-center gap-1">
                      <FileCheck className="w-3 h-3 text-emerald-600" /> Doc. Completa
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-[11px] font-bold flex items-center gap-1">
                      <FileText className="w-3 h-3 text-slate-400" /> Doc. Parcial
                    </span>
                  )}
                </div>

                {/* Score Indicators for Owner */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200/70 rounded-2xl">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Índice Solvencia</span>
                    <span className="text-base font-black text-blue-700">
                      {sol.scoreSolvencia ? `${sol.scoreSolvencia}/100` : 'N/D'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Perfil Operativo</span>
                    <span className="text-base font-black text-purple-700">
                      {sol.perfilOperativo ? `${sol.perfilOperativo}/100` : '85/100'}
                    </span>
                  </div>
                </div>

                {/* Economic quick view */}
                <div className="text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ingresos netos:</span>
                    <span className="font-bold text-slate-800">{sol.ingresosNetosMensuales} €/mes ({sol.situacionLaboral})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Personas:</span>
                    <span className="font-bold text-slate-800">{sol.numTotalPersonas} persona(s)</span>
                  </div>
                </div>
              </div>

              {/* Action row */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => onTriggerAiAnalysis(sol)}
                  className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>Analizar</span>
                </button>

                <button
                  onClick={() => onSelectSolicitud(sol)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition-all"
                >
                  <span>Ver Solicitud</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
