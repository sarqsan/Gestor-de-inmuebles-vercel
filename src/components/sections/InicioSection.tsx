import React from 'react';
import { Candidato, Inmueble, SectionType } from '../../types';
import {
  formatEuro,
  formatDate,
  getCandidateStatusLabel,
  getCandidateStatusBadgeStyle,
} from '../../utils/formatters';
import {
  Users,
  Clock,
  FileClock,
  Building2,
  ArrowRight,
  Plus,
  Phone,
  Mail,
  UserCheck,
  TrendingUp,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

interface InicioSectionProps {
  candidatos: Candidato[];
  inmuebles: Inmueble[];
  onSelectCandidate: (candidato: Candidato) => void;
  onSelectSection: (section: SectionType) => void;
  onOpenAddCandidateModal?: () => void;
}

export const InicioSection: React.FC<InicioSectionProps> = ({
  candidatos,
  inmuebles,
  onSelectCandidate,
  onSelectSection,
  onOpenAddCandidateModal,
}) => {
  // Metrics calculation
  const totalCandidatos = candidatos.length;
  const pendientesRevisar = candidatos.filter((c) => c.estado === 'nuevo').length;
  const documentacionPendiente = candidatos.filter((c) => c.estado === 'pendiente_doc').length;
  const inmueblesDisponibles = inmuebles.filter((i) => i.estado === 'disponible').length;

  // Latest added candidates (sorted by date descending or created order)
  const ultimosCandidatos = [...candidatos]
    .sort((a, b) => new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 rounded-2xl p-5 sm:p-7 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/30 mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            Panel de Control de Selección
          </span>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            Resumen General de Alquileres
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
            Gestiona la preselección de tus viviendas, revisa la documentación aportada por los solicitantes y organiza tus candidatos de forma ágil y estructurada.
          </p>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1: Total Candidatos */}
        <div
          onClick={() => onSelectSection('candidatos')}
          className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Candidatos</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900">{totalCandidatos}</p>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <span>En todos tus inmuebles</span>
          </p>
        </div>

        {/* Metric 2: Pendientes de revisar */}
        <div
          onClick={() => onSelectSection('candidatos')}
          className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pendientes Revisar</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-blue-600">{pendientesRevisar}</p>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <span className="text-blue-600 font-medium">Estado "Nuevo"</span>
          </p>
        </div>

        {/* Metric 3: Documentación pendiente */}
        <div
          onClick={() => onSelectSection('candidatos')}
          className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Doc. Pendiente</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <FileClock className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-amber-600">{documentacionPendiente}</p>
          <p className="text-xs text-slate-500 mt-1">
            <span className="text-amber-700 font-medium">Requieren seguimiento</span>
          </p>
        </div>

        {/* Metric 4: Inmuebles disponibles */}
        <div
          onClick={() => onSelectSection('inmuebles')}
          className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Inmuebles Disponibles</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-emerald-600">{inmueblesDisponibles}</p>
          <p className="text-xs text-slate-500 mt-1">
            <span>De {inmuebles.length} viviendas activas</span>
          </p>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Latest Candidates List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Últimos Candidatos Añadidos</h3>
              <p className="text-xs text-slate-500">Solicitantes registrados recientemente</p>
            </div>
            <button
              onClick={() => onSelectSection('candidatos')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
            >
              <span>Ver todos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {ultimosCandidatos.map((cand) => (
              <div
                key={cand.id}
                onClick={() => onSelectCandidate(cand)}
                className="p-3.5 rounded-xl border border-slate-100 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0">
                    {cand.nombre.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">
                      {cand.nombre}
                    </h4>
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      {cand.inmuebleNombre}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      <span>Ingresos: <strong className="text-slate-800">{formatEuro(cand.ingresosNetos)}/mes</strong></span>
                      <span>•</span>
                      <span>{cand.numPersonas} persona(s)</span>
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getCandidateStatusBadgeStyle(cand.estado)}`}>
                    {getCandidateStatusLabel(cand.estado)}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {formatDate(cand.fechaCreacion)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar Widgets in Dashboard */}
        <div className="space-y-6">
          {/* Properties Quick Summary Widget */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                Mis Inmuebles
              </h3>
              <button
                onClick={() => onSelectSection('inmuebles')}
                className="text-xs text-blue-600 font-medium hover:underline"
              >
                Ver todo
              </button>
            </div>

            <div className="space-y-3">
              {inmuebles.map((inm) => (
                <div
                  key={inm.id}
                  onClick={() => onSelectSection('inmuebles')}
                  className="p-3 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 transition-all cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{inm.direccion}</p>
                    <p className="text-[11px] text-slate-500">{inm.ciudad}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-900">{formatEuro(inm.precio)}/m</p>
                    <span className="text-[10px] text-blue-600 font-medium">
                      {inm.candidatosCount} candidatos
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* New Candidate Banner Action */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-2xl border border-blue-100 p-5 text-slate-800">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-blue-600" />
              ¿Nuevo interesado?
            </h4>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Registra rápidamente un nuevo candidato para asignar su inmueble de preferencia e iniciar la recepción de documentos.
            </p>
            <button
              onClick={() => (onOpenAddCandidateModal ? onOpenAddCandidateModal() : onSelectSection('candidatos'))}
              className="mt-3 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Añadir Candidato Ahora</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
