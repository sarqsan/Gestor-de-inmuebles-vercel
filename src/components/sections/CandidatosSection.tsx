import React, { useState } from 'react';
import { Candidato, CandidateStatus, Inmueble } from '../../types';
import { ConfirmDeleteModal } from '../ConfirmDeleteModal';
import { calcularValuracionCandidato } from '../../utils/solvenciaEngine';
import { openCandidatoQuestionnairePDF } from '../../utils/candidatoQuestionnaire';
import {
  formatEuro,
  formatDate,
  getCandidateStatusLabel,
  getCandidateStatusBadgeStyle,
  getEmploymentTypeLabel,
} from '../../utils/formatters';
import {
  Search,
  Users,
  Building2,
  ChevronRight,
  LayoutGrid,
  List,
  Award,
  ShieldCheck,
  Sparkles,
  Trash2,
  Printer,
  Star,
  UserCheck,
  UserPlus,
} from 'lucide-react';

interface CandidatosSectionProps {
  candidatos: Candidato[];
  inmuebles: Inmueble[];
  onSelectCandidate: (candidato: Candidato) => void;
  onUpdateStatus: (candidateId: string, newStatus: CandidateStatus) => void;
  onGenerarInforme?: (candidato: Candidato) => void;
  onDeleteCandidate?: (candidateId: string) => void;
  onOpenAddCandidateModal?: () => void;
}

export const CandidatosSection: React.FC<CandidatosSectionProps> = ({
  candidatos,
  inmuebles,
  onSelectCandidate,
  onUpdateStatus,
  onGenerarInforme,
  onDeleteCandidate,
  onOpenAddCandidateModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [candidateToDelete, setCandidateToDelete] = useState<Candidato | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('todos');
  const [selectedInmuebleId, setSelectedInmuebleId] = useState<string>('todos');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Filter candidates
  const filteredCandidatos = candidatos.filter((cand) => {
    const matchesSearch =
      cand.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cand.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cand.telefono.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cand.inmuebleNombre.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = selectedStatus === 'todos' || cand.estado === selectedStatus;
    const matchesInmueble = selectedInmuebleId === 'todos' || cand.inmuebleId === selectedInmuebleId;

    return matchesSearch && matchesStatus && matchesInmueble;
  });

  return (
    <div className="space-y-6">
      {/* Search & Filter Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar candidato por nombre, email, teléfono o inmueble..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Action Button & View Mode Toggle */}
          <div className="flex items-center gap-2">
            {onOpenAddCandidateModal && (
              <button
                onClick={onOpenAddCandidateModal}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all hover:shadow shrink-0 h-10"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Nuevo candidato</span>
              </button>
            )}

            {/* View Mode Toggle (Desktop) */}
            <div className="hidden sm:flex items-center gap-1 bg-slate-100 p-1 rounded-xl h-10">
              <button
                onClick={() => setViewMode('cards')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'cards' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Vista en tarjetas"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'table' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Vista en tabla"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Filtrar por Estado:</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todos los estados ({candidatos.length})</option>
              <option value="nuevo">Nuevo</option>
              <option value="pendiente_doc">Pendiente de documentación</option>
              <option value="pendiente_analisis">Pendiente de análisis</option>
              <option value="analizado">Analizado</option>
              <option value="preseleccionado">Preseleccionado ⭐</option>
              <option value="visita_reservada">Visita reservada 📅</option>
              <option value="seleccionado">Seleccionado (Inquilino)</option>
              <option value="no_seleccionado">No seleccionado</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Filtrar por Inmueble:</label>
            <select
              value={selectedInmuebleId}
              onChange={(e) => setSelectedInmuebleId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todos los inmuebles</option>
              {inmuebles.map((inm) => (
                <option key={inm.id} value={inm.id}>
                  {inm.direccion} ({inm.ciudad})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredCandidatos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-500">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-bold text-slate-800 text-base">No se encontraron candidatos</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Ajusta los criterios de búsqueda o añade un nuevo candidato al sistema.
          </p>
        </div>
      ) : (
        <>
          {/* Card View */}
          <div className={`${viewMode === 'table' ? 'hidden md:block' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}`}>
            {viewMode === 'cards' ? (
              filteredCandidatos.map((cand) => {
                const property = inmuebles.find((i) => i.id === cand.inmuebleId);
                const valuracion = calcularValuracionCandidato(cand, property);

                return (
                  <div
                    key={cand.id}
                    onClick={() => onSelectCandidate(cand)}
                    className="bg-white rounded-2xl border border-slate-200/80 hover:border-blue-400 p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group space-y-4"
                  >
                    <div>
                      {/* Header: Name + Score */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 font-bold text-base flex items-center justify-center shrink-0">
                            {cand.nombre.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">
                              {cand.nombre}
                            </h3>
                            <p className="text-xs text-slate-500">{cand.telefono}</p>
                          </div>
                        </div>

                        {/* Índice de solvencia Badge */}
                        <div className="text-right shrink-0">
                          <span className="inline-block px-2.5 py-1 bg-slate-900 text-emerald-400 font-extrabold text-xs rounded-lg">
                            {valuracion.indiceSolvencia} <span className="text-[9px] text-slate-400 font-normal">/100</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 my-2 flex-wrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${getCandidateStatusBadgeStyle(cand.estado)}`}>
                          {getCandidateStatusLabel(cand.estado)}
                        </span>

                        {(cand.numTitularesContrato === 2 || cand.cotitular) && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            👥 2 Titulares
                          </span>
                        )}

                        {cand.notasPrivadas && cand.notasPrivadas.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200" title={`${cand.notasPrivadas.length} notas privadas guardadas`}>
                            📝 {cand.notasPrivadas.length} nota{cand.notasPrivadas.length === 1 ? '' : 's'}
                          </span>
                        )}

                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${valuracion.badgeColorStyle}`}>
                          {valuracion.nivelClasificacion}
                        </span>

                        {cand.cuestionarioIncidencias?.analisisIa ? (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              cand.cuestionarioIncidencias.analisisIa.resultadoFinalNivel === 'adecuado'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : cand.cuestionarioIncidencias.analisisIa.resultadoFinalNivel === 'requiere_atencion'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-rose-100 text-rose-800 border border-rose-300'
                            }`}
                          >
                            {cand.cuestionarioIncidencias.analisisIa.resultadoFinalNivel === 'adecuado'
                              ? '🟢 Incidencias: Adecuado'
                              : cand.cuestionarioIncidencias.analisisIa.resultadoFinalNivel === 'requiere_atencion'
                              ? '🟡 Incidencias: Atención'
                              : '🔴 Incidencias: Revisar'}
                          </span>
                        ) : cand.cuestionarioIncidencias?.completado ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            Cuestionario Completado
                          </span>
                        ) : null}
                      </div>

                      {/* Property info */}
                      <p className="text-xs text-slate-600 flex items-center gap-1.5 mt-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{cand.inmuebleNombre}</span>
                      </p>

                      {/* Financial stats */}
                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                        <div className="bg-slate-50 p-2 rounded-lg">
                          <span className="text-[10px] text-slate-400 block">Ingresos totales:</span>
                          <strong className="text-slate-900">{formatEuro(valuracion.ingresosTotales)}/m</strong>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-lg">
                          <span className="text-[10px] text-slate-400 block">Ratio esfuerzo:</span>
                          <strong className={valuracion.ratioEsfuerzo <= 35 ? 'text-emerald-700' : 'text-amber-700'}>
                            {valuracion.ratioEsfuerzo}%
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Card Action Footer */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {cand.estado !== 'preseleccionado' && cand.estado !== 'visita_reservada' ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateStatus(cand.id, 'preseleccionado');
                            }}
                            className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-lg transition-colors flex items-center gap-1 border border-amber-300 text-[11px]"
                            title="Preseleccionar candidato para enviarle reserva de cita"
                          >
                            <Star className="w-3 h-3 fill-amber-400 text-amber-600" />
                            <span>Preseleccionar</span>
                          </button>
                        ) : (
                          <span className="px-2 py-1 bg-amber-100 text-amber-900 font-extrabold rounded-lg flex items-center gap-1 border border-amber-300 text-[11px]">
                            <UserCheck className="w-3 h-3 text-amber-700" />
                            <span>Preseleccionado ⭐</span>
                          </span>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openCandidatoQuestionnairePDF(cand.nombre, cand.inmuebleNombre);
                          }}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg transition-colors flex items-center gap-1 border border-blue-200"
                          title="Descargar/Imprimir Cuestionario PDF"
                        >
                          <Printer className="w-3 h-3 text-blue-600" />
                          <span>PDF</span>
                        </button>

                        {onGenerarInforme && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onGenerarInforme(cand);
                            }}
                            className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition-colors flex items-center gap-1 border border-indigo-200"
                          >
                            <Sparkles className="w-3 h-3 text-indigo-600" />
                            <span>Informe</span>
                          </button>
                        )}

                        {onDeleteCandidate && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCandidateToDelete(cand);
                            }}
                            className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                            title="Eliminar candidato"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <span className="text-blue-600 font-semibold group-hover:underline flex items-center gap-0.5 text-[11px]">
                        Ficha <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })
            ) : null}
          </div>

          {/* Table View (Desktop) */}
          {viewMode === 'table' && (
            <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="p-4">Candidato</th>
                      <th className="p-4">Inmueble Solicitado</th>
                      <th className="p-4 text-center">Índice Solvencia</th>
                      <th className="p-4">Ratio / Ingresos</th>
                      <th className="p-4">Estado</th>
                      <th className="p-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {filteredCandidatos.map((cand) => {
                      const property = inmuebles.find((i) => i.id === cand.inmuebleId);
                      const valuracion = calcularValuracionCandidato(cand, property);

                      return (
                        <tr
                          key={cand.id}
                          onClick={() => onSelectCandidate(cand)}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                        >
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                                {cand.nombre.charAt(0)}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-bold text-slate-900">{cand.nombre}</p>
                                  {(cand.numTitularesContrato === 2 || cand.cotitular) && (
                                    <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 text-[10px] font-bold rounded">
                                      2 Titulares
                                    </span>
                                  )}
                                  {cand.notasPrivadas && cand.notasPrivadas.length > 0 && (
                                    <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 text-[10px] font-bold rounded" title={`${cand.notasPrivadas.length} notas`}>
                                      📝 {cand.notasPrivadas.length}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400">{cand.email}</p>
                              </div>
                            </div>
                          </td>

                          <td className="p-4">
                            <p className="font-medium text-slate-800">{cand.inmuebleNombre}</p>
                            <p className="text-[11px] text-slate-400">{cand.numPersonas} persona(s)</p>
                          </td>

                          <td className="p-4 text-center">
                            <span className="inline-block px-2.5 py-1 bg-slate-900 text-emerald-400 font-extrabold text-xs rounded-lg">
                              {valuracion.indiceSolvencia} <span className="text-[9px] text-slate-400 font-normal">/100</span>
                            </span>
                          </td>

                          <td className="p-4">
                            <p className="font-bold text-slate-900">{formatEuro(valuracion.ingresosTotales)}/m</p>
                            <p className={valuracion.ratioEsfuerzo <= 35 ? 'text-emerald-700 font-semibold text-[11px]' : 'text-amber-700 font-semibold text-[11px]'}>
                              Ratio: {valuracion.ratioEsfuerzo}%
                            </p>
                          </td>

                          <td className="p-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${getCandidateStatusBadgeStyle(cand.estado)}`}>
                              {getCandidateStatusLabel(cand.estado)}
                            </span>
                          </td>

                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {cand.estado !== 'preseleccionado' && cand.estado !== 'visita_reservada' ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdateStatus(cand.id, 'preseleccionado');
                                  }}
                                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded-lg transition-colors border border-amber-300 flex items-center gap-1"
                                  title="Preseleccionar candidato"
                                >
                                  <Star className="w-3 h-3 fill-amber-400 text-amber-600" />
                                  <span>Preseleccionar</span>
                                </button>
                              ) : (
                                <span className="px-2.5 py-1 bg-amber-100 text-amber-900 text-xs font-extrabold rounded-lg border border-amber-300 flex items-center gap-1">
                                  <UserCheck className="w-3 h-3 text-amber-700" />
                                  <span>Preseleccionado</span>
                                </span>
                              )}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectCandidate(cand);
                                }}
                                className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors border border-blue-200"
                              >
                                Ver Ficha
                              </button>

                              {onDeleteCandidate && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCandidateToDelete(cand);
                                  }}
                                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors border border-transparent hover:border-rose-200"
                                  title="Eliminar candidato"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={!!candidateToDelete}
        title="¿Eliminar candidato?"
        description={`¿Estás seguro de que deseas eliminar al candidato "${candidateToDelete?.nombre}"? Esta acción borrará permanentemente sus datos e informes.`}
        onConfirm={() => {
          if (candidateToDelete && onDeleteCandidate) {
            onDeleteCandidate(candidateToDelete.id);
            setCandidateToDelete(null);
          }
        }}
        onCancel={() => setCandidateToDelete(null)}
      />
    </div>
  );
};
