import React, { useState, useEffect } from 'react';
import {
  Incidencia,
  PolizaSeguro,
  Siniestro,
  Inmueble,
  Propietario,
  ContratoFormalizacion,
  Profesional,
  UsuarioApp,
  EstadoIncidencia,
  PrioridadIncidencia,
  CategoriaIncidencia,
} from '../../types';
import {
  subscribeIncidencias,
  saveIncidenciaFirestore,
  deleteIncidenciaFirestore,
  subscribePolizas,
  savePolizaFirestore,
  deletePolizaFirestore,
  subscribeSiniestros,
  saveSiniestroFirestore,
  deleteSiniestroFirestore,
} from '../../lib/firebase';
import {
  ESTADOS_INCIDENCIA_LABELS,
  PRIORIDADES_INCIDENCIA_LABELS,
  CATEGORIAS_INCIDENCIA_LABELS,
  RESPONSABILIDAD_LABELS,
  SEGURO_ESTADO_LABELS,
  calcularMetricasIncidencias,
  filtrarIncidencias,
} from '../../utils/incidenciasEngine';
import { IncidenciaModal } from '../modals/IncidenciaModal';
import { PolizaModal } from '../modals/PolizaModal';
import { SiniestroModal } from '../modals/SiniestroModal';
import { DetalleIncidenciaModal } from '../modals/DetalleIncidenciaModal';
import {
  AlertTriangle,
  ShieldCheck,
  Wrench,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Filter,
  Building2,
  User,
  Sparkles,
  Phone,
  FileText,
  FileCheck,
  ChevronRight,
  MoreVertical,
  Trash2,
  Edit,
  ShieldAlert,
  HelpCircle,
  Euro,
  Image as ImageIcon,
} from 'lucide-react';

interface IncidenciasSectionProps {
  inmuebles: Inmueble[];
  propietarios: Propietario[];
  contratos: ContratoFormalizacion[];
  profesionales: Profesional[];
  currentUser?: UsuarioApp;
}

export const IncidenciasSection: React.FC<IncidenciasSectionProps> = ({
  inmuebles,
  propietarios,
  contratos,
  profesionales,
  currentUser,
}) => {
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [polizas, setPolizas] = useState<PolizaSeguro[]>([]);
  const [siniestros, setSiniestros] = useState<Siniestro[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Pestaña activa del módulo
  const [subTab, setSubTab] = useState<'incidencias' | 'polizas' | 'siniestros'>('incidencias');

  // Filtros
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filtroInmueble, setFiltroInmueble] = useState<string>('TODOS');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('TODAS');
  const [filtroPrioridad, setFiltroPrioridad] = useState<string>('TODAS');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');

  // Modales
  const [isIncidenciaModalOpen, setIsIncidenciaModalOpen] = useState<boolean>(false);
  const [incidenciaToEdit, setIncidenciaToEdit] = useState<Incidencia | null>(null);

  const [isPolizaModalOpen, setIsPolizaModalOpen] = useState<boolean>(false);
  const [polizaToEdit, setPolizaToEdit] = useState<PolizaSeguro | null>(null);

  const [isSiniestroModalOpen, setIsSiniestroModalOpen] = useState<boolean>(false);
  const [siniestroToEdit, setSiniestroToEdit] = useState<Siniestro | null>(null);
  const [incidenciaParaSiniestro, setIncidenciaParaSiniestro] = useState<Incidencia | null>(null);

  const [isDetalleModalOpen, setIsDetalleModalOpen] = useState<boolean>(false);
  const [incidenciaDetalle, setIncidenciaDetalle] = useState<Incidencia | null>(null);

  // Subscripción a colecciones en tiempo real
  useEffect(() => {
    setLoading(true);
    const unsubIncidencias = subscribeIncidencias((items) => {
      setIncidencias(items);
      setLoading(false);
    });

    const unsubPolizas = subscribePolizas((items) => {
      setPolizas(items);
    });

    const unsubSiniestros = subscribeSiniestros((items) => {
      setSiniestros(items);
    });

    return () => {
      unsubIncidencias();
      unsubPolizas();
      unsubSiniestros();
    };
  }, []);

  // Mantener actualizado el modal de detalle si la incidencia cambia en Firestore
  useEffect(() => {
    if (incidenciaDetalle) {
      const updated = incidencias.find((i) => i.id === incidenciaDetalle.id);
      if (updated) {
        setIncidenciaDetalle(updated);
      }
    }
  }, [incidencias]);

  // Métricas
  const metricas = calcularMetricasIncidencias(incidencias, siniestros);

  // Filtrado de incidencias
  const incidenciasFiltradas = filtrarIncidencias(
    incidencias,
    searchTerm,
    filtroInmueble,
    filtroCategoria,
    filtroPrioridad,
    filtroEstado
  );

  // CRUD Handlers
  const handleSaveIncidencia = async (inc: Incidencia) => {
    await saveIncidenciaFirestore(inc);
  };

  const handleDeleteIncidencia = async (id: string) => {
    if (window.confirm('¿Confirma que desea eliminar esta incidencia y su expediente asociado?')) {
      await deleteIncidenciaFirestore(id);
      if (incidenciaDetalle?.id === id) {
        setIsDetalleModalOpen(false);
      }
    }
  };

  const handleSavePoliza = async (pol: PolizaSeguro) => {
    await savePolizaFirestore(pol);
  };

  const handleDeletePoliza = async (id: string) => {
    if (window.confirm('¿Desea dar de baja esta póliza de seguro de la base de datos?')) {
      await deletePolizaFirestore(id);
    }
  };

  const handleSaveSiniestro = async (sin: Siniestro) => {
    await saveSiniestroFirestore(sin);
  };

  const handleDeleteSiniestro = async (id: string) => {
    if (window.confirm('¿Confirma la eliminación del registro de este siniestro?')) {
      await deleteSiniestroFirestore(id);
    }
  };

  const handleOpenSiniestroFromDetalle = (inc: Incidencia, sin?: Siniestro) => {
    setIncidenciaParaSiniestro(inc);
    setSiniestroToEdit(sin || null);
    setIsSiniestroModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Cabecera del Módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
              Bloque 4
            </span>
            <span className="text-xs font-medium text-slate-500">Mantenimiento & Patrimonio</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Incidencias, Mantenimiento & Seguros
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Gestión integral de averías, dictámenes periciales IA, verificación de pólizas y partes de siniestro
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              setPolizaToEdit(null);
              setIsPolizaModalOpen(true);
            }}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
          >
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>+ Nueva Póliza</span>
          </button>

          <button
            onClick={() => {
              setIncidenciaToEdit(null);
              setIsIncidenciaModalOpen(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>+ Nueva Incidencia</span>
          </button>
        </div>
      </div>

      {/* Tarjetas de Métricas Clave */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Total</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900">{metricas.total}</div>
          <span className="text-[11px] text-slate-400">Expedientes dados de alta</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
          <div className="flex items-center justify-between text-amber-600 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Abiertas</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-900">{metricas.abiertas}</div>
          <span className="text-[11px] text-amber-700">En gestión o trámite</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/20 shadow-xs">
          <div className="flex items-center justify-between text-rose-600 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Urgentes</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-900">{metricas.urgentes}</div>
          <span className="text-[11px] text-rose-700">Prioridad Alta o Urgente</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">En Reparación</span>
            <Wrench className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-900">{metricas.enReparacion}</div>
          <span className="text-[11px] text-emerald-700">Con técnico asignado</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-indigo-200 bg-indigo-50/20 shadow-xs">
          <div className="flex items-center justify-between text-indigo-600 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Siniestros</span>
            <FileCheck className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-indigo-900">{metricas.siniestrosAbiertos}</div>
          <span className="text-[11px] text-indigo-700">Partes con aseguradoras</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-teal-600 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Resueltas</span>
            <CheckCircle2 className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl font-black text-teal-900">{metricas.resueltas}</div>
          <span className="text-[11px] text-teal-700">Averías cerradas</span>
        </div>
      </div>

      {/* Selector de Sub-Pestañas */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white p-2 rounded-xl shadow-xs">
        <button
          onClick={() => setSubTab('incidencias')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            subTab === 'incidencias'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Incidencias ({incidencias.length})</span>
        </button>

        <button
          onClick={() => setSubTab('polizas')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            subTab === 'polizas'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Pólizas de Seguro ({polizas.length})</span>
        </button>

        <button
          onClick={() => setSubTab('siniestros')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            subTab === 'siniestros'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>Siniestros Tramitados ({siniestros.length})</span>
        </button>
      </div>

      {/* SUBTAB 1: INCIDENCIAS */}
      {subTab === 'incidencias' && (
        <div className="space-y-4">
          {/* Barra de Búsqueda y Filtros */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              {/* Buscador de texto */}
              <div className="md:col-span-2 relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por título, descripción, inquilino o dirección..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              </div>

              {/* Inmueble */}
              <div>
                <select
                  value={filtroInmueble}
                  onChange={(e) => setFiltroInmueble(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
                >
                  <option value="TODOS">Todas las Viviendas</option>
                  {inmuebles.map((inm) => (
                    <option key={inm.id} value={inm.id}>
                      {inm.direccion}
                    </option>
                  ))}
                </select>
              </div>

              {/* Categoría */}
              <div>
                <select
                  value={filtroCategoria}
                  onChange={(e) => setFiltroCategoria(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
                >
                  <option value="TODAS">Todas las Categorías</option>
                  {Object.entries(CATEGORIAS_INCIDENCIA_LABELS).map(([k, val]) => (
                    <option key={k} value={k}>
                      {val.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Prioridad */}
              <div>
                <select
                  value={filtroPrioridad}
                  onChange={(e) => setFiltroPrioridad(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
                >
                  <option value="TODAS">Todas las Prioridades</option>
                  {Object.entries(PRIORIDADES_INCIDENCIA_LABELS).map(([k, val]) => (
                    <option key={k} value={k}>
                      {val.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Píldoras de Estado */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                Estado:
              </span>
              <button
                onClick={() => setFiltroEstado('TODOS')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  filtroEstado === 'TODOS'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todos ({incidencias.length})
              </button>
              {Object.entries(ESTADOS_INCIDENCIA_LABELS).map(([k, val]) => {
                const count = incidencias.filter((i) => i.estado === k).length;
                return (
                  <button
                    key={k}
                    onClick={() => setFiltroEstado(k)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      filtroEstado === k
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {val.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Listado de Tarjetas de Incidencias */}
          {loading ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500">
              Cargando incidencias de la base de datos...
            </div>
          ) : incidenciasFiltradas.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">No hay incidencias registradas</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No se encontraron incidencias que coincidan con los filtros seleccionados o todavía no se ha dado de alta ninguna avería.
              </p>
              <button
                onClick={() => {
                  setIncidenciaToEdit(null);
                  setIsIncidenciaModalOpen(true);
                }}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-xs hover:bg-blue-700 transition-colors"
              >
                Registrar Primera Incidencia
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {incidenciasFiltradas.map((inc) => {
                const siniestroAsociado = siniestros.find((s) => s.incidenciaId === inc.id);
                return (
                  <div
                    key={inc.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div className="space-y-3">
                      {/* Cabecera de la tarjeta */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                              PRIORIDADES_INCIDENCIA_LABELS[inc.prioridad]?.badgeClass || 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {PRIORIDADES_INCIDENCIA_LABELS[inc.prioridad]?.label || inc.prioridad}
                          </span>
                          <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                            {CATEGORIAS_INCIDENCIA_LABELS[inc.categoria]?.label || inc.categoria}
                          </span>
                        </div>

                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            ESTADOS_INCIDENCIA_LABELS[inc.estado]?.badgeClass || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {ESTADOS_INCIDENCIA_LABELS[inc.estado]?.label || inc.estado}
                        </span>
                      </div>

                      {/* Título y Dirección */}
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
                          {inc.titulo}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{inc.inmuebleDireccion || 'Vivienda'}</span>
                        </div>
                      </div>

                      {/* Extracto de Descripción */}
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {inc.descripcion}
                      </p>

                      {/* Mini Indicadores (Fotos, IA, Siniestro, Responsabilidad) */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-[11px]">
                        {inc.fotografias && inc.fotografias.length > 0 && (
                          <span className="flex items-center gap-1 text-slate-500 font-medium">
                            <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                            <span>{inc.fotografias.length} fotos</span>
                          </span>
                        )}

                        {inc.analisisIa && (
                          <span className="flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md font-bold">
                            <Sparkles className="w-3 h-3 text-purple-600" />
                            <span>IA Peritado</span>
                          </span>
                        )}

                        {siniestroAsociado && (
                          <span className="flex items-center gap-1 text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md font-bold">
                            <ShieldCheck className="w-3 h-3 text-sky-600" />
                            <span>Siniestro: {siniestroAsociado.estado}</span>
                          </span>
                        )}

                        {inc.trabajoProfesional?.profesionalNombre && (
                          <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-medium">
                            <Wrench className="w-3 h-3 text-emerald-600" />
                            <span className="truncate max-w-[120px]">{inc.trabajoProfesional.profesionalNombre}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Botonera de acciones */}
                    <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                      <div className="text-[11px] text-slate-400">
                        {new Date(inc.fechaCreacion).toLocaleDateString('es-ES')}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setIncidenciaDetalle(inc);
                            setIsDetalleModalOpen(true);
                          }}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                        >
                          <span>Expediente</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => {
                            setIncidenciaToEdit(inc);
                            setIsIncidenciaModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Editar datos básicos"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteIncidencia(inc.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar incidencia"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: PÓLIZAS DE SEGURO */}
      {subTab === 'polizas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-base font-bold text-slate-900">Pólizas de Seguro Activas</h2>
              <p className="text-xs text-slate-500">
                Pólizas multirriesgo hogar, arrendador, comunidad y responsabilidad civil vinculadas a cada inmueble
              </p>
            </div>
            <button
              onClick={() => {
                setPolizaToEdit(null);
                setIsPolizaModalOpen(true);
              }}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Alta de Póliza</span>
            </button>
          </div>

          {polizas.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
              <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-900">No hay pólizas registradas</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Registre las pólizas de sus viviendas para permitir el cotejo automático de coberturas ante cualquier avería reportada.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {polizas.map((pol) => {
                const inm = inmuebles.find((i) => i.id === pol.inmuebleId);
                const diasParaVencimiento = Math.ceil(
                  (new Date(pol.fechaVencimiento).getTime() - Date.now()) / (1000 * 3600 * 24)
                );
                const esProximoVencimiento = diasParaVencimiento > 0 && diasParaVencimiento <= 45;

                return (
                  <div
                    key={pol.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            {pol.tipo}
                          </span>
                          <h3 className="text-base font-black text-slate-900">{pol.aseguradora}</h3>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                            pol.estado === 'VIGENTE'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {pol.estado}
                        </span>
                      </div>

                      {/* Nº Póliza e Inmueble */}
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1.5 font-mono text-slate-700">
                          <span className="text-slate-400 font-sans">Nº:</span>
                          <strong>{pol.numeroPoliza}</strong>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{pol.inmuebleDireccion || inm?.direccion || 'Inmueble'}</span>
                        </div>
                      </div>

                      {/* Fechas de vigencia */}
                      <div className="p-2.5 bg-slate-50 rounded-xl text-xs flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Vencimiento:</span>
                          <span className="font-semibold text-slate-800">
                            {new Date(pol.fechaVencimiento).toLocaleDateString('es-ES')}
                          </span>
                        </div>
                        {esProximoVencimiento && (
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                            Vence en {diasParaVencimiento} días
                          </span>
                        )}
                      </div>

                      {/* Contacto Asistencia 24h */}
                      {pol.contacto?.asistencia24h && (
                        <div className="p-2.5 bg-blue-50/60 border border-blue-100 rounded-xl text-xs flex items-center justify-between">
                          <span className="text-blue-900 font-medium">Asistencia 24h:</span>
                          <a
                            href={`tel:${pol.contacto.asistencia24h}`}
                            className="font-bold text-blue-700 hover:underline flex items-center gap-1"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>{pol.contacto.asistencia24h}</span>
                          </a>
                        </div>
                      )}

                      {/* Coberturas resumidas */}
                      {pol.coberturas && pol.coberturas.length > 0 && (
                        <div>
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Garantías ({pol.coberturas.length}):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {pol.coberturas.slice(0, 4).map((cob, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium"
                              >
                                {cob}
                              </span>
                            ))}
                            {pol.coberturas.length > 4 && (
                              <span className="text-[10px] text-slate-400 px-1 py-0.5 font-medium">
                                +{pol.coberturas.length - 4} más
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Botones de acción */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setPolizaToEdit(pol);
                          setIsPolizaModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>

                      <button
                        onClick={() => handleDeletePoliza(pol.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar póliza"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: SINIESTROS TRAMITADOS */}
      {subTab === 'siniestros' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <h2 className="text-base font-bold text-slate-900">Expedientes de Siniestro con Aseguradoras</h2>
            <p className="text-xs text-slate-500">
              Seguimiento de peritajes, números de expediente de compañía, indemnizaciones y resoluciones
            </p>
          </div>

          {siniestros.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
              <FileCheck className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-900">No hay siniestros comunicados</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Cuando una incidencia requiera cobertura del seguro, abra el expediente desde la pestaña &quot;Pólizas &amp; Siniestro&quot; de la incidencia.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {siniestros.map((sin) => {
                const inc = incidencias.find((i) => i.id === sin.incidenciaId);
                return (
                  <div
                    key={sin.id}
                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{sin.aseguradora}</span>
                        {sin.numeroExpediente && (
                          <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-bold">
                            Exp: {sin.numeroExpediente}
                          </span>
                        )}
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {sin.estado}
                        </span>
                      </div>

                      {inc && (
                        <div className="text-xs text-slate-600">
                          <strong className="text-slate-800">Incidencia: </strong>
                          {inc.titulo} ({inc.inmuebleDireccion})
                        </div>
                      )}

                      {sin.resolucion && (
                        <p className="text-xs text-slate-500 line-clamp-1 italic">
                          &quot;{sin.resolucion}&quot;
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      {sin.indemnizacion !== undefined && (
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">Indemnizado:</span>
                          <span className="font-black text-emerald-700 text-sm">
                            {sin.indemnizacion} €
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            if (inc) {
                              setIncidenciaParaSiniestro(inc);
                              setSiniestroToEdit(sin);
                              setIsSiniestroModalOpen(true);
                            }
                          }}
                          className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Gestionar</span>
                        </button>

                        <button
                          onClick={() => handleDeleteSiniestro(sin.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar siniestro"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: ALTA / EDICIÓN DE INCIDENCIA */}
      {isIncidenciaModalOpen && (
        <IncidenciaModal
          isOpen={isIncidenciaModalOpen}
          onClose={() => {
            setIsIncidenciaModalOpen(false);
            setIncidenciaToEdit(null);
          }}
          onSave={handleSaveIncidencia}
          inmuebles={inmuebles}
          propietarios={propietarios}
          contratos={contratos}
          currentUser={currentUser}
          incidenciaToEdit={incidenciaToEdit}
        />
      )}

      {/* MODAL 2: ALTA / EDICIÓN DE PÓLIZA */}
      {isPolizaModalOpen && (
        <PolizaModal
          isOpen={isPolizaModalOpen}
          onClose={() => {
            setIsPolizaModalOpen(false);
            setPolizaToEdit(null);
          }}
          onSave={handleSavePoliza}
          inmuebles={inmuebles}
          propietarios={propietarios}
          currentUser={currentUser}
          polizaToEdit={polizaToEdit}
        />
      )}

      {/* MODAL 3: SINIESTRO */}
      {isSiniestroModalOpen && incidenciaParaSiniestro && (
        <SiniestroModal
          isOpen={isSiniestroModalOpen}
          onClose={() => {
            setIsSiniestroModalOpen(false);
            setSiniestroToEdit(null);
            setIncidenciaParaSiniestro(null);
          }}
          onSave={handleSaveSiniestro}
          incidencia={incidenciaParaSiniestro}
          polizas={polizas}
          currentUser={currentUser}
          siniestroToEdit={siniestroToEdit}
        />
      )}

      {/* MODAL 4: EXPEDIENTE Y DETALLE COMPLETO CON IA */}
      {isDetalleModalOpen && incidenciaDetalle && (
        <DetalleIncidenciaModal
          isOpen={isDetalleModalOpen}
          onClose={() => {
            setIsDetalleModalOpen(false);
            setIncidenciaDetalle(null);
          }}
          incidencia={incidenciaDetalle}
          polizas={polizas}
          siniestros={siniestros}
          profesionales={profesionales}
          inmuebles={inmuebles}
          currentUser={currentUser}
          onUpdateIncidencia={handleSaveIncidencia}
          onOpenSiniestroModal={handleOpenSiniestroFromDetalle}
        />
      )}
    </div>
  );
};
