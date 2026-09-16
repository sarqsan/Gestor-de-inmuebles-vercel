import React, { useState, useEffect } from 'react';
import {
  Profesional,
  TrabajoProfesional,
  PresupuestoProfesional,
  ValoracionProfesionalTrabajo,
  Inmueble,
  Propietario,
  Incidencia,
  UsuarioApp,
  Especialidad,
  EstadoTrabajoProfesional,
  PrioridadIncidencia,
} from '../../types';
import {
  subscribeProfesionales,
  subscribeTrabajosProfesionales,
  subscribePresupuestosProfesionales,
  subscribeValoracionesProfesionales,
  subscribeIncidencias,
  saveProfesionalFirestore,
  deleteProfesionalFirestore,
  saveTrabajoProfesionalFirestore,
  deleteTrabajoProfesionalFirestore,
  savePresupuestoProfesionalFirestore,
  deletePresupuestoProfesionalFirestore,
} from '../../lib/firebase';
import {
  TIPO_PROFESIONAL_LABELS,
  ESTADO_PROFESIONAL_LABELS,
  ESTADO_TRABAJO_LABELS,
  PRIORIDAD_TRABAJO_LABELS,
  ESTADO_PRESUPUESTO_LABELS,
  ESPECIALIDADES_CATALOGO,
  coincideUbicacion,
  calcularMetricasGeneralesTrabajos,
  calcularMetricasProfesional,
} from '../../utils/profesionalesEngine';

// Modals
import { CrearProfesionalModal } from '../modals/CrearProfesionalModal';
import { DetalleProfesionalModal } from '../modals/DetalleProfesionalModal';
import { TrabajoProfesionalModal } from '../modals/TrabajoProfesionalModal';
import { DetalleTrabajoProfesionalModal } from '../modals/DetalleTrabajoProfesionalModal';
import { PresupuestoProfesionalModal } from '../modals/PresupuestoProfesionalModal';
import { DetallePresupuestoProfesionalModal } from '../modals/DetallePresupuestoProfesionalModal';
import { ValoracionProfesionalModal } from '../modals/ValoracionProfesionalModal';
import { HistorialTrabajosInmuebleModal } from '../modals/HistorialTrabajosInmuebleModal';
import { DetalleIncidenciaModal } from '../modals/DetalleIncidenciaModal';

import {
  Wrench,
  Briefcase,
  FileText,
  Star,
  Plus,
  Search,
  Filter,
  Building2,
  Calendar,
  DollarSign,
  Phone,
  Mail,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Eye,
  Trash2,
  Edit,
  MapPin,
  TrendingUp,
  User,
  History,
  Layers,
  Award,
} from 'lucide-react';

interface ProfesionalesSectionProps {
  inmuebles: Inmueble[];
  propietarios: Propietario[];
  currentUser?: UsuarioApp;
  especialidadesDisponibles?: Especialidad[];
  onNavigateToIncidencias?: () => void;
}

export const ProfesionalesSection: React.FC<ProfesionalesSectionProps> = ({
  inmuebles,
  propietarios,
  currentUser,
  especialidadesDisponibles = [],
  onNavigateToIncidencias,
}) => {
  // Collections State
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [trabajos, setTrabajos] = useState<TrabajoProfesional[]>([]);
  const [presupuestos, setPresupuestos] = useState<PresupuestoProfesional[]>([]);
  const [valoraciones, setValoraciones] = useState<ValoracionProfesionalTrabajo[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Main Subtab
  const [activeTab, setActiveTab] = useState<'profesionales' | 'trabajos' | 'presupuestos' | 'historial'>('profesionales');

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEspecialidad, setFiltroEspecialidad] = useState('TODAS');
  const [filtroInmueble, setFiltroInmueble] = useState('TODOS');
  const [filtroEstadoTrabajo, setFiltroEstadoTrabajo] = useState('TODOS');
  const [filtroPrioridadTrabajo, setFiltroPrioridadTrabajo] = useState('TODAS');
  const [filtroEstadoPresupuesto, setFiltroEstadoPresupuesto] = useState('TODOS');

  // Modals state
  const [showCrearProfesional, setShowCrearProfesional] = useState(false);
  const [profesionalParaEditar, setProfesionalParaEditar] = useState<Profesional | null>(null);
  const [profesionalSeleccionado, setProfesionalSeleccionado] = useState<Profesional | null>(null);

  const [showTrabajoModal, setShowTrabajoModal] = useState(false);
  const [trabajoParaEditar, setTrabajoParaEditar] = useState<TrabajoProfesional | null>(null);
  const [trabajoSeleccionado, setTrabajoSeleccionado] = useState<TrabajoProfesional | null>(null);
  const [profesionalPreseleccionadoParaTrabajo, setProfesionalPreseleccionadoParaTrabajo] = useState<string | undefined>(undefined);

  const [showPresupuestoModal, setShowPresupuestoModal] = useState(false);
  const [presupuestoParaEditar, setPresupuestoParaEditar] = useState<PresupuestoProfesional | null>(null);
  const [presupuestoSeleccionado, setPresupuestoSeleccionado] = useState<PresupuestoProfesional | null>(null);
  const [trabajoPreseleccionadoParaPresupuesto, setTrabajoPreseleccionadoParaPresupuesto] = useState<TrabajoProfesional | null>(null);

  const [showValoracionModal, setShowValoracionModal] = useState(false);
  const [trabajoParaValorar, setTrabajoParaValorar] = useState<TrabajoProfesional | null>(null);

  const [showHistorialInmuebleModal, setShowHistorialInmuebleModal] = useState(false);
  const [inmuebleParaHistorial, setInmuebleParaHistorial] = useState<Inmueble | null>(null);

  const [incidenciaSeleccionada, setIncidenciaSeleccionada] = useState<Incidencia | null>(null);

  // Firestore Subscriptions
  useEffect(() => {
    setLoading(true);

    const unsubProf = subscribeProfesionales((data) => {
      setProfesionales(data);
    });

    const unsubTrab = subscribeTrabajosProfesionales((data) => {
      setTrabajos(data);
    });

    const unsubPres = subscribePresupuestosProfesionales((data) => {
      setPresupuestos(data);
    });

    const unsubVal = subscribeValoracionesProfesionales((data) => {
      setValoraciones(data);
    });

    const unsubInc = subscribeIncidencias((data) => {
      setIncidencias(data);
      setLoading(false);
    });

    return () => {
      unsubProf();
      unsubTrab();
      unsubPres();
      unsubVal();
      unsubInc();
    };
  }, []);

  // Filter Scopes for Owner vs Admin
  const isOwner = currentUser?.tipoPerfil === 'PROPIETARIO';
  const propietarioInmueblesIds = isOwner
    ? inmuebles.filter((i) => i.propietarioId === currentUser?.id).map((i) => i.id)
    : [];

  const scopedProfesionales = isOwner
    ? profesionales.filter((p) => !p.esPrivado || p.creadoPorPropietarioId === currentUser?.id)
    : profesionales;

  const scopedTrabajos = isOwner
    ? trabajos.filter((t) => propietarioInmueblesIds.includes(t.inmuebleId) || t.propietarioId === currentUser?.id)
    : trabajos;

  const scopedPresupuestos = isOwner
    ? presupuestos.filter((p) => propietarioInmueblesIds.includes(p.inmuebleId) || p.propietarioId === currentUser?.id)
    : presupuestos;

  const scopedValoraciones = isOwner
    ? valoraciones.filter((v) => propietarioInmueblesIds.includes(v.inmuebleId))
    : valoraciones;

  // General Metrics
  const metricasGenerales = calcularMetricasGeneralesTrabajos(scopedTrabajos, scopedPresupuestos);

  // Filtered Professionals
  const profesionalesFiltrados = scopedProfesionales.filter((p) => {
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchName = p.nombreComercial.toLowerCase().includes(term);
      const matchRazon = p.razonSocial?.toLowerCase().includes(term);
      const matchContact = p.contactoNombre?.toLowerCase().includes(term);
      const matchPhone = p.telefono?.includes(term);
      const matchEmail = p.email?.toLowerCase().includes(term);
      const matchEsp = p.especialidades?.some((e) => e.toLowerCase().includes(term));
      if (!matchName && !matchRazon && !matchContact && !matchPhone && !matchEmail && !matchEsp) return false;
    }
    if (filtroEspecialidad !== 'TODAS') {
      const matchEsp = p.especialidades?.some(
        (e) => e.toLowerCase().includes(filtroEspecialidad.toLowerCase()) || filtroEspecialidad.toLowerCase().includes(e.toLowerCase())
      );
      if (!matchEsp) return false;
    }
    return true;
  });

  // Filtered Work Orders
  const trabajosFiltrados = scopedTrabajos.filter((t) => {
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchTitle = t.titulo.toLowerCase().includes(term);
      const matchDesc = t.descripcion?.toLowerCase().includes(term);
      const matchDir = t.inmuebleDireccion?.toLowerCase().includes(term);
      const matchProf = t.profesionalNombre?.toLowerCase().includes(term);
      if (!matchTitle && !matchDesc && !matchDir && !matchProf) return false;
    }
    if (filtroInmueble !== 'TODOS' && t.inmuebleId !== filtroInmueble) return false;
    if (filtroEstadoTrabajo !== 'TODOS' && t.estado !== filtroEstadoTrabajo) return false;
    if (filtroPrioridadTrabajo !== 'TODAS' && t.prioridad !== filtroPrioridadTrabajo) return false;
    return true;
  });

  // Filtered Budgets
  const presupuestosFiltrados = scopedPresupuestos.filter((p) => {
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchNum = p.numeroPresupuesto?.toLowerCase().includes(term);
      const matchDesc = p.descripcion?.toLowerCase().includes(term);
      const matchProf = p.profesionalNombre?.toLowerCase().includes(term);
      if (!matchNum && !matchDesc && !matchProf) return false;
    }
    if (filtroInmueble !== 'TODOS' && p.inmuebleId !== filtroInmueble) return false;
    if (filtroEstadoPresupuesto !== 'TODOS' && p.estado !== filtroEstadoPresupuesto) return false;
    return true;
  });

  return (
    <div id="profesionales-section" className="space-y-6">
      {/* Module Title & Navigation Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-700 shadow-xs">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Profesionales, Obras y Servicios</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Gestión desacoplada de técnicos, órdenes de trabajo independientes, presupuestos y control pericial
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5 flex-wrap gap-y-2">
          {activeTab === 'profesionales' && (
            <button
              onClick={() => {
                setProfesionalParaEditar(null);
                setShowCrearProfesional(true);
              }}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Profesional</span>
            </button>
          )}

          {activeTab === 'trabajos' && (
            <button
              onClick={() => {
                setTrabajoParaEditar(null);
                setProfesionalPreseleccionadoParaTrabajo(undefined);
                setShowTrabajoModal(true);
              }}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Orden de Trabajo</span>
            </button>
          )}

          {activeTab === 'presupuestos' && (
            <button
              onClick={() => {
                setPresupuestoParaEditar(null);
                setTrabajoPreseleccionadoParaPresupuesto(null);
                setShowPresupuestoModal(true);
              }}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Presupuesto</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Highlights Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Profesionales
          </span>
          <span className="text-xl font-bold text-slate-900 mt-1 block">
            {scopedProfesionales.length}
          </span>
          <span className="text-[11px] text-emerald-600 font-medium mt-0.5 block">
            {scopedProfesionales.filter((p) => p.activo !== false).length} activos
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Órdenes de Trabajo
          </span>
          <span className="text-xl font-bold text-blue-600 mt-1 block">
            {metricasGenerales.totalTrabajos}
          </span>
          <span className="text-[11px] text-slate-500 font-medium mt-0.5 block">
            {metricasGenerales.trabajosEnEjecucion} en ejecución
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Finalizados
          </span>
          <span className="text-xl font-bold text-emerald-600 mt-1 block">
            {metricasGenerales.trabajosFinalizados}
          </span>
          <span className="text-[11px] text-slate-500 font-medium mt-0.5 block">Intervenciones ok</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Presupuestos
          </span>
          <span className="text-xl font-bold text-slate-900 mt-1 block">
            {metricasGenerales.totalPresupuestos}
          </span>
          <span className="text-[11px] text-emerald-600 font-medium mt-0.5 block">
            {metricasGenerales.presupuestosAceptados} aprobados
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Gasto Facturado
          </span>
          <span className="text-xl font-bold text-slate-900 mt-1 block">
            {metricasGenerales.totalImporteFacturado.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
          </span>
          <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">Liquidado a proveedores</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Valoración Media
          </span>
          <div className="flex items-center space-x-1 mt-1">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span className="text-xl font-bold text-slate-900">
              {metricasGenerales.mediaPuntuacionGlobal > 0 ? metricasGenerales.mediaPuntuacionGlobal.toFixed(1) : 'S/V'}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">
            {scopedValoraciones.length} valoraciones
          </span>
        </div>
      </div>

      {/* Main Navigation Subtabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 overflow-x-auto gap-2">
        <button
          onClick={() => setActiveTab('profesionales')}
          className={`py-3.5 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-colors flex items-center space-x-2 ${
            activeTab === 'profesionales'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Fichas de Profesionales ({scopedProfesionales.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('trabajos')}
          className={`py-3.5 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-colors flex items-center space-x-2 ${
            activeTab === 'trabajos'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>Órdenes de Trabajo ({scopedTrabajos.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('presupuestos')}
          className={`py-3.5 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-colors flex items-center space-x-2 ${
            activeTab === 'presupuestos'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Presupuestos y Partidas ({scopedPresupuestos.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('historial')}
          className={`py-3.5 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-colors flex items-center space-x-2 ${
            activeTab === 'historial'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Historial y Valoraciones ({scopedValoraciones.length})</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={
                activeTab === 'profesionales'
                  ? 'Buscar por nombre, especialidad, CIF o teléfono...'
                  : activeTab === 'trabajos'
                  ? 'Buscar orden de trabajo por título, dirección o técnico...'
                  : 'Buscar presupuesto o referencia...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          {activeTab === 'profesionales' && (
            <select
              value={filtroEspecialidad}
              onChange={(e) => setFiltroEspecialidad(e.target.value)}
              className="p-2 border border-slate-300 rounded-xl bg-white font-medium"
            >
              <option value="TODAS">Todas las Especialidades</option>
              {ESPECIALIDADES_CATALOGO.map((esp) => (
                <option key={esp.codigo} value={esp.nombre}>
                  {esp.nombre}
                </option>
              ))}
            </select>
          )}

          {(activeTab === 'trabajos' || activeTab === 'presupuestos') && (
            <select
              value={filtroInmueble}
              onChange={(e) => setFiltroInmueble(e.target.value)}
              className="p-2 border border-slate-300 rounded-xl bg-white font-medium"
            >
              <option value="TODOS">Todos los Inmuebles</option>
              {inmuebles.map((inm) => (
                <option key={inm.id} value={inm.id}>
                  {inm.direccion} ({inm.ciudad})
                </option>
              ))}
            </select>
          )}

          {activeTab === 'trabajos' && (
            <>
              <select
                value={filtroEstadoTrabajo}
                onChange={(e) => setFiltroEstadoTrabajo(e.target.value)}
                className="p-2 border border-slate-300 rounded-xl bg-white font-medium"
              >
                <option value="TODOS">Todos los Estados</option>
                {Object.entries(ESTADO_TRABAJO_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>

              <select
                value={filtroPrioridadTrabajo}
                onChange={(e) => setFiltroPrioridadTrabajo(e.target.value)}
                className="p-2 border border-slate-300 rounded-xl bg-white font-medium"
              >
                <option value="TODAS">Todas las Prioridades</option>
                {Object.entries(PRIORIDAD_TRABAJO_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </>
          )}

          {activeTab === 'presupuestos' && (
            <select
              value={filtroEstadoPresupuesto}
              onChange={(e) => setFiltroEstadoPresupuesto(e.target.value)}
              className="p-2 border border-slate-300 rounded-xl bg-white font-medium"
            >
              <option value="TODOS">Todos los Estados de Presupuesto</option>
              {Object.entries(ESTADO_PRESUPUESTO_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'profesionales' && (
        <div className="space-y-4">
          {profesionalesFiltrados.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {profesionalesFiltrados.map((prof) => {
                const tipoInfo = TIPO_PROFESIONAL_LABELS[prof.tipo] || TIPO_PROFESIONAL_LABELS.AUTONOMO;
                const estadoInfo = ESTADO_PROFESIONAL_LABELS[prof.estado || 'ACTIVO'] || ESTADO_PROFESIONAL_LABELS.ACTIVO;
                const metricas = calcularMetricasProfesional(prof, scopedTrabajos, scopedPresupuestos, scopedValoraciones);

                return (
                  <div
                    key={prof.id}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-amber-300 hover:shadow-md transition-all p-5 flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-slate-900 text-base">{prof.nombreComercial}</h3>
                          <p className="text-xs text-slate-500">
                            {prof.razonSocial ? `${prof.razonSocial} • ` : ''}
                            {prof.cifNif ? `CIF: ${prof.cifNif}` : 'Sin CIF'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end space-y-1 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${tipoInfo.badgeClass}`}>
                            {tipoInfo.label}
                          </span>
                          <span className={`px-2 py-0.2 rounded-full text-[10px] font-semibold border ${estadoInfo.badgeClass}`}>
                            {estadoInfo.label}
                          </span>
                        </div>
                      </div>

                      {/* Specialties */}
                      <div className="flex flex-wrap gap-1 mt-3">
                        {prof.especialidades?.slice(0, 3).map((esp, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold rounded-md"
                          >
                            {esp}
                          </span>
                        ))}
                        {prof.especialidades && prof.especialidades.length > 3 && (
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded-md font-medium">
                            +{prof.especialidades.length - 3}
                          </span>
                        )}
                      </div>

                      {/* Contact Info */}
                      <div className="space-y-1.5 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
                        {prof.contactoNombre && (
                          <div className="flex items-center space-x-2">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{prof.contactoNombre}</span>
                          </div>
                        )}
                        {prof.telefono && (
                          <div className="flex items-center space-x-2">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <a href={`tel:${prof.telefono}`} className="text-blue-600 hover:underline">
                              {prof.telefono}
                            </a>
                          </div>
                        )}
                        {prof.email && (
                          <div className="flex items-center space-x-2 truncate">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <a href={`mailto:${prof.email}`} className="text-blue-600 hover:underline truncate">
                              {prof.email}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer KPI & Actions */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center space-x-1">
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                          <span className="font-bold text-slate-800 text-xs">
                            {metricas.mediaPuntuacion > 0 ? metricas.mediaPuntuacion.toFixed(1) : 'S/V'}
                          </span>
                        </div>
                        <span className="text-slate-400 text-xs">•</span>
                        <span className="text-xs text-slate-500 font-medium">
                          {metricas.totalTrabajos} trabajos
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => {
                            setTrabajoParaEditar(null);
                            setProfesionalPreseleccionadoParaTrabajo(prof.id);
                            setShowTrabajoModal(true);
                          }}
                          className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors"
                          title="Asignar orden de trabajo a este profesional"
                        >
                          Asignar
                        </button>
                        <button
                          onClick={() => setProfesionalSeleccionado(prof)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                        >
                          Ver Ficha
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400">
              <Wrench className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-600">No se encontraron profesionales con estos filtros</p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFiltroEspecialidad('TODAS');
                }}
                className="mt-2 text-xs text-blue-600 hover:underline font-bold"
              >
                Restablecer filtros de búsqueda
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Órdenes de Trabajo */}
      {activeTab === 'trabajos' && (
        <div className="space-y-4">
          {trabajosFiltrados.length > 0 ? (
            <div className="space-y-3">
              {trabajosFiltrados.map((trabajo) => {
                const estInfo = ESTADO_TRABAJO_LABELS[trabajo.estado] || ESTADO_TRABAJO_LABELS.PENDIENTE;
                const prioInfo = PRIORIDAD_TRABAJO_LABELS[trabajo.prioridad] || PRIORIDAD_TRABAJO_LABELS.NORMAL;
                const profesional = scopedProfesionales.find((p) => p.id === trabajo.profesionalId);
                const presupuestosDelTrabajo = scopedPresupuestos.filter((p) => p.trabajoId === trabajo.id);

                return (
                  <div
                    key={trabajo.id}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-xs transition-all p-5 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${estInfo.badgeClass}`}>
                          {estInfo.label}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${prioInfo.badgeClass}`}>
                          {prioInfo.label}
                        </span>
                        {trabajo.incidenciaId && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            Derivado de Incidencia
                          </span>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="text-base font-bold text-slate-900">
                          {(trabajo.importeFinal || trabajo.importeEstimado || 0).toLocaleString('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                          })}
                        </span>
                        <span className="text-[11px] text-slate-400 block">
                          {trabajo.importeFinal ? 'Coste liquidado' : 'Estimado'}
                        </span>
                      </div>
                    </div>

                    <div className="cursor-pointer" onClick={() => setTrabajoSeleccionado(trabajo)}>
                      <h3 className="font-bold text-slate-900 text-base hover:text-blue-600 transition-colors">
                        {trabajo.titulo}
                      </h3>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{trabajo.descripcion}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                      <div className="flex items-center space-x-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{trabajo.inmuebleDireccion || 'Vivienda'}</span>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <Wrench className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {trabajo.profesionalNombre || profesional?.nombreComercial || 'Sin profesional asignado'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{new Date(trabajo.fechaSolicitud).toLocaleDateString('es-ES')}</span>
                        {presupuestosDelTrabajo.length > 0 && (
                          <span className="text-blue-600 font-semibold ml-2">
                            ({presupuestosDelTrabajo.length} ppto)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Card Action Buttons */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
                      <div className="flex items-center space-x-2">
                        {trabajo.estado === 'FINALIZADO' && !trabajo.valoracion && (
                          <button
                            onClick={() => {
                              setTrabajoParaValorar(trabajo);
                              setShowValoracionModal(true);
                            }}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg shadow-xs"
                          >
                            <Star className="w-3 h-3 fill-white" />
                            <span>Valorar Técnico</span>
                          </button>
                        )}
                        {trabajo.valoracion && (
                          <div className="flex items-center space-x-1 text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                            <span>{trabajo.valoracion.puntuacion}/5 ({trabajo.valoracion.resultado})</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => {
                            setTrabajoPreseleccionadoParaPresupuesto(trabajo);
                            setPresupuestoParaEditar(null);
                            setShowPresupuestoModal(true);
                          }}
                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold rounded-lg border border-emerald-200"
                        >
                          + Presupuesto
                        </button>
                        <button
                          onClick={() => setTrabajoSeleccionado(trabajo)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs"
                        >
                          Gestionar Orden
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400">
              <Briefcase className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-600">No hay órdenes de trabajo activas</p>
              <button
                onClick={() => {
                  setTrabajoParaEditar(null);
                  setShowTrabajoModal(true);
                }}
                className="mt-2 text-xs text-blue-600 hover:underline font-bold"
              >
                + Crear primera orden de trabajo
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Presupuestos */}
      {activeTab === 'presupuestos' && (
        <div className="space-y-4">
          {presupuestosFiltrados.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {presupuestosFiltrados.map((pres) => {
                const estInfo = ESTADO_PRESUPUESTO_LABELS[pres.estado] || ESTADO_PRESUPUESTO_LABELS.BORRADOR;
                const trabajo = scopedTrabajos.find((t) => t.id === pres.trabajoId);

                return (
                  <div
                    key={pres.id}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-xs transition-all p-5 space-y-3 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-xs font-bold text-slate-800">
                              {pres.numeroPresupuesto || `PRE-${pres.id.slice(-6)}`}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${estInfo.badgeClass}`}>
                              {estInfo.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {pres.profesionalNombre} • {new Date(pres.fecha).toLocaleDateString('es-ES')}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-bold text-slate-900">
                            {pres.importeTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                          </span>
                          <span className="text-[11px] text-slate-400 block">IVA incluido</span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-700 font-medium mt-2">{pres.descripcion}</p>

                      <div className="space-y-1 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
                        <div className="flex items-center space-x-1.5">
                          <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-800 truncate">
                            {trabajo ? trabajo.titulo : 'Orden técnica'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{pres.inmuebleDireccion || 'Inmueble'}</span>
                        </div>
                      </div>

                      {/* Partidas snapshot */}
                      {pres.partidas && pres.partidas.length > 0 && (
                        <div className="mt-3 bg-slate-50 p-2.5 rounded-xl text-xs space-y-1 border border-slate-100">
                          <span className="text-[10px] font-bold uppercase text-slate-500 block">
                            Partidas desglosadas ({pres.partidas.length})
                          </span>
                          {pres.partidas.slice(0, 2).map((item, idx) => (
                            <div key={idx} className="flex justify-between text-[11px] text-slate-700">
                              <span className="truncate">{item.concepto}</span>
                              <span className="font-semibold shrink-0 ml-2">{item.importe.toFixed(2)}€</span>
                            </div>
                          ))}
                          {pres.partidas.length > 2 && (
                            <span className="text-[10px] text-slate-400 block italic">
                              +{pres.partidas.length - 2} partidas más...
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      {pres.documentoUrl ? (
                        <a
                          href={pres.documentoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center space-x-1 font-semibold"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Descargar PDF</span>
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-400">Sin PDF adjunto</span>
                      )}

                      <button
                        onClick={() => setPresupuestoSeleccionado(pres)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
                      >
                        Ver Desglose y Decidir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400">
              <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-600">No hay presupuestos registrados</p>
              <button
                onClick={() => {
                  setPresupuestoParaEditar(null);
                  setShowPresupuestoModal(true);
                }}
                className="mt-2 text-xs text-emerald-600 hover:underline font-bold"
              >
                + Registrar primer presupuesto
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Historial & Valoraciones */}
      {activeTab === 'historial' && (
        <div className="space-y-4">
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Registro de Rendimiento y Calidad Pericial</h3>
              <p className="text-xs text-slate-500">
                Reseñas, puntualidad, calidad técnica y satisfacción post-intervención de profesionales en las viviendas.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <select
                onChange={(e) => {
                  const inm = inmuebles.find((i) => i.id === e.target.value);
                  if (inm) {
                    setInmuebleParaHistorial(inm);
                    setShowHistorialInmuebleModal(true);
                  }
                }}
                defaultValue=""
                className="p-2 text-xs border border-slate-300 rounded-xl bg-slate-50 font-medium"
              >
                <option value="" disabled>
                  Consultar historial por vivienda...
                </option>
                {inmuebles.map((inm) => (
                  <option key={inm.id} value={inm.id}>
                    {inm.direccion} ({inm.ciudad})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {scopedValoraciones.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scopedValoraciones.map((val) => {
                const profesional = scopedProfesionales.find((p) => p.id === val.profesionalId);
                const trabajo = scopedTrabajos.find((t) => t.id === val.trabajoId);

                return (
                  <div
                    key={val.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-xs"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-4 h-4 ${
                                s <= val.puntuacion ? 'text-amber-500 fill-amber-500' : 'text-slate-200'
                              }`}
                            />
                          ))}
                          <span className="font-bold text-slate-900 text-xs ml-1">{val.puntuacion}/5</span>
                        </div>
                        <h4 className="font-bold text-slate-900 text-sm mt-1">
                          {profesional?.nombreComercial || 'Profesional'}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {val.inmuebleDireccion} • {new Date(val.fecha).toLocaleDateString('es-ES')}
                        </p>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                          val.resultado === 'SATISFACTORIO'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : val.resultado === 'ACEPTABLE'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}
                      >
                        {val.resultado}
                      </span>
                    </div>

                    {val.comentario && (
                      <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl italic leading-relaxed">
                        "{val.comentario}"
                      </p>
                    )}

                    <div className="grid grid-cols-4 gap-2 text-center pt-2 border-t border-slate-100 text-[11px]">
                      <div className="p-1.5 bg-slate-50 rounded-lg">
                        <span className="text-slate-400 block text-[10px]">Calidad</span>
                        <span className="font-bold text-slate-800">{val.calidad || '-'}/5</span>
                      </div>
                      <div className="p-1.5 bg-slate-50 rounded-lg">
                        <span className="text-slate-400 block text-[10px]">Puntualidad</span>
                        <span className="font-bold text-slate-800">{val.puntualidad || '-'}/5</span>
                      </div>
                      <div className="p-1.5 bg-slate-50 rounded-lg">
                        <span className="text-slate-400 block text-[10px]">Precio</span>
                        <span className="font-bold text-slate-800">{val.precio || '-'}/5</span>
                      </div>
                      <div className="p-1.5 bg-slate-50 rounded-lg">
                        <span className="text-slate-400 block text-[10px]">Comunicación</span>
                        <span className="font-bold text-slate-800">{val.comunicacion || '-'}/5</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400">
              <Star className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-600">No hay valoraciones registradas todavía</p>
              <p className="text-xs text-slate-400 mt-1">
                Cuando una orden de trabajo finalice, podrás registrar la valoración pericial del técnico.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Modals Mounting */}
      {showCrearProfesional && (
        <CrearProfesionalModal
          profesionalParaEditar={profesionalParaEditar}
          especialidades={especialidadesDisponibles}
          inmueblesDisponibles={inmuebles}
          currentUser={currentUser!}
          onSave={async (prof) => {
            await saveProfesionalFirestore(prof);
            setShowCrearProfesional(false);
          }}
          onClose={() => setShowCrearProfesional(false)}
        />
      )}

      {profesionalSeleccionado && (
        <DetalleProfesionalModal
          isOpen={!!profesionalSeleccionado}
          onClose={() => setProfesionalSeleccionado(null)}
          profesional={profesionalSeleccionado}
          trabajos={scopedTrabajos}
          presupuestos={scopedPresupuestos}
          valoraciones={scopedValoraciones}
          inmuebles={inmuebles}
          currentUser={currentUser}
          onEditarProfesional={(prof) => {
            setProfesionalParaEditar(prof);
            setProfesionalSeleccionado(null);
            setShowCrearProfesional(true);
          }}
          onCrearTrabajo={(profId) => {
            setProfesionalSeleccionado(null);
            setProfesionalPreseleccionadoParaTrabajo(profId);
            setTrabajoParaEditar(null);
            setShowTrabajoModal(true);
          }}
          onCrearPresupuesto={(profId) => {
            setProfesionalSeleccionado(null);
            setPresupuestoParaEditar(null);
            setShowPresupuestoModal(true);
          }}
          onSelectTrabajo={(trab) => {
            setProfesionalSeleccionado(null);
            setTrabajoSeleccionado(trab);
          }}
        />
      )}

      {showTrabajoModal && (
        <TrabajoProfesionalModal
          isOpen={showTrabajoModal}
          onClose={() => setShowTrabajoModal(false)}
          trabajoParaEditar={trabajoParaEditar}
          inmuebles={inmuebles}
          incidencias={incidencias}
          profesionales={scopedProfesionales}
          currentUser={currentUser}
          profesionalPreseleccionadoId={profesionalPreseleccionadoParaTrabajo}
          onSaveSuccess={() => setShowTrabajoModal(false)}
        />
      )}

      {trabajoSeleccionado && (
        <DetalleTrabajoProfesionalModal
          isOpen={!!trabajoSeleccionado}
          onClose={() => setTrabajoSeleccionado(null)}
          trabajo={trabajoSeleccionado}
          presupuestos={scopedPresupuestos}
          profesionales={scopedProfesionales}
          inmuebles={inmuebles}
          incidencias={incidencias}
          currentUser={currentUser}
          onEditarTrabajo={(trab) => {
            setTrabajoParaEditar(trab);
            setTrabajoSeleccionado(null);
            setShowTrabajoModal(true);
          }}
          onCrearPresupuesto={(trab) => {
            setTrabajoPreseleccionadoParaPresupuesto(trab);
            setPresupuestoParaEditar(null);
            setShowPresupuestoModal(true);
          }}
          onVerPresupuesto={(pres) => {
            setPresupuestoSeleccionado(pres);
          }}
          onValorarProfesional={(trab) => {
            setTrabajoParaValorar(trab);
            setShowValoracionModal(true);
          }}
          onVerIncidencia={(inc) => {
            setIncidenciaSeleccionada(inc);
          }}
        />
      )}

      {showPresupuestoModal && (
        <PresupuestoProfesionalModal
          isOpen={showPresupuestoModal}
          onClose={() => setShowPresupuestoModal(false)}
          presupuestoParaEditar={presupuestoParaEditar}
          trabajos={scopedTrabajos}
          profesionales={scopedProfesionales}
          inmuebles={inmuebles}
          currentUser={currentUser}
          trabajoPreseleccionado={trabajoPreseleccionadoParaPresupuesto}
          onSaveSuccess={() => setShowPresupuestoModal(false)}
        />
      )}

      {presupuestoSeleccionado && (
        <DetallePresupuestoProfesionalModal
          isOpen={!!presupuestoSeleccionado}
          onClose={() => setPresupuestoSeleccionado(null)}
          presupuesto={presupuestoSeleccionado}
          trabajos={scopedTrabajos}
          profesionales={scopedProfesionales}
          inmuebles={inmuebles}
          currentUser={currentUser}
          onEditarPresupuesto={(pres) => {
            setPresupuestoParaEditar(pres);
            setPresupuestoSeleccionado(null);
            setShowPresupuestoModal(true);
          }}
          onVerTrabajo={(trab) => {
            setPresupuestoSeleccionado(null);
            setTrabajoSeleccionado(trab);
          }}
        />
      )}

      {showValoracionModal && trabajoParaValorar && (
        <ValoracionProfesionalModal
          isOpen={showValoracionModal}
          onClose={() => {
            setShowValoracionModal(false);
            setTrabajoParaValorar(null);
          }}
          trabajo={trabajoParaValorar}
          profesional={scopedProfesionales.find((p) => p.id === trabajoParaValorar.profesionalId)}
          currentUser={currentUser}
          onSuccess={() => {
            setShowValoracionModal(false);
            setTrabajoParaValorar(null);
          }}
        />
      )}

      {showHistorialInmuebleModal && inmuebleParaHistorial && (
        <HistorialTrabajosInmuebleModal
          isOpen={showHistorialInmuebleModal}
          onClose={() => {
            setShowHistorialInmuebleModal(false);
            setInmuebleParaHistorial(null);
          }}
          inmueble={inmuebleParaHistorial}
          trabajos={scopedTrabajos}
          presupuestos={scopedPresupuestos}
          profesionales={scopedProfesionales}
          currentUser={currentUser}
          onCrearTrabajo={(inmId) => {
            setShowHistorialInmuebleModal(false);
            setTrabajoParaEditar(null);
            setShowTrabajoModal(true);
          }}
          onSelectTrabajo={(trab) => {
            setShowHistorialInmuebleModal(false);
            setTrabajoSeleccionado(trab);
          }}
        />
      )}

      {incidenciaSeleccionada && (
        <DetalleIncidenciaModal
          isOpen={!!incidenciaSeleccionada}
          onClose={() => setIncidenciaSeleccionada(null)}
          incidencia={incidenciaSeleccionada}
          polizas={[]}
          siniestros={[]}
          profesionales={scopedProfesionales}
          currentUser={currentUser}
          onUpdateIncidencia={async () => {}}
          onOpenSiniestroModal={() => {}}
        />
      )}
    </div>
  );
};
