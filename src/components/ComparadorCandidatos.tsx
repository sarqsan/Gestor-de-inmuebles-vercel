import React, { useState } from 'react';
import { Candidato, Inmueble } from '../types';
import { calcularValuracionCandidato, ResultadoValuracion } from '../utils/solvenciaEngine';
import { formatEuro } from '../utils/formatters';
import {
  Users,
  Building,
  ArrowUpDown,
  CheckCircle2,
  AlertTriangle,
  Award,
  ChevronRight,
  TrendingUp,
  FileCheck,
  Briefcase,
  ExternalLink,
} from 'lucide-react';

interface ComparadorCandidatosProps {
  candidatos: Candidato[];
  inmuebles: Inmueble[];
  onSelectCandidate?: (candidate: Candidato) => void;
}

type SortCriteria = 'indice' | 'ratio' | 'documentacion' | 'ingresos';

export const ComparadorCandidatos: React.FC<ComparadorCandidatosProps> = ({
  candidatos,
  inmuebles,
  onSelectCandidate,
}) => {
  // Estado para el inmueble seleccionado
  const [selectedInmuebleId, setSelectedInmuebleId] = useState<string>(inmuebles[0]?.id || '');
  // Criterio de ordenación
  const [sortBy, setSortBy] = useState<SortCriteria>('indice');
  // Dirección de ordenación
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const selectedInmueble = inmuebles.find((i) => i.id === selectedInmuebleId) || inmuebles[0];

  // Filtrar candidatos del inmueble seleccionado
  const candidatosDelInmueble = candidatos.filter(
    (c) => c.inmuebleId === selectedInmuebleId || (!c.inmuebleId && selectedInmuebleId === inmuebles[0]?.id)
  );

  // Calcular resultado de valoración para cada candidato del inmueble
  const candidatosConValuracion = candidatosDelInmueble.map((cand) => {
    const res: ResultadoValuracion = calcularValuracionCandidato(cand, selectedInmueble);
    const totalDocs = cand.documentos.length || 1;
    const subidosDocs = cand.documentos.filter((d) => d.subido).length;
    const docPercent = Math.round((subidosDocs / totalDocs) * 100);

    return {
      candidato: cand,
      resultado: res,
      docPercent,
      ingresosTotales: cand.ingresosNetos + (cand.otrosIngresos || 0),
    };
  });

  // Ordenar lista de candidatos según criterio
  const sortedCandidatos = [...candidatosConValuracion].sort((a, b) => {
    let diff = 0;
    if (sortBy === 'indice') {
      diff = b.resultado.indiceSolvencia - a.resultado.indiceSolvencia;
    } else if (sortBy === 'ratio') {
      // Para ratio, menor es mejor (ascendente por defecto)
      diff = a.resultado.ratioEsfuerzo - b.resultado.ratioEsfuerzo;
    } else if (sortBy === 'documentacion') {
      diff = b.docPercent - a.docPercent;
    } else if (sortBy === 'ingresos') {
      diff = b.ingresosTotales - a.ingresosTotales;
    }

    return sortAsc ? -diff : diff;
  });

  const toggleSort = (criterion: SortCriteria) => {
    if (sortBy === criterion) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(criterion);
      // Para ratio, menor % es mejor -> sortAsc por defecto
      setSortAsc(criterion === 'ratio');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 space-y-6">
      {/* Header Comparador */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/80 mb-2">
            <Users className="w-3.5 h-3.5 text-blue-600" />
            Herramienta de Comparación Directa
          </div>
          <h3 className="text-xl font-bold text-slate-900 tracking-tight">
            Comparador de Candidatos por Inmueble
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Analiza objetivamente todas las solicitudes que optan a la misma vivienda.
          </p>
        </div>

        {/* Selector de Inmueble */}
        <div className="w-full sm:w-auto">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Inmueble a comparar:
          </label>

          <select
            value={selectedInmuebleId}
            onChange={(e) => setSelectedInmuebleId(e.target.value)}
            className="w-full sm:w-80 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
          >
            {inmuebles.map((inm) => (
              <option key={inm.id} value={inm.id}>
                Piso: {inm.direccion} — {inm.precio} €/mes
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Resumen Inmueble Seleccionado */}
      {selectedInmueble && (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-slate-900">{selectedInmueble.direccion}</span>
            <span className="text-slate-400">({selectedInmueble.ciudad})</span>
          </div>

          <div className="flex items-center gap-4 text-slate-700">
            <span>
              Alquiler: <strong className="text-slate-900">{formatEuro(selectedInmueble.precio)}/mes</strong>
            </span>
            <span className="bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full font-semibold text-xs">
              {candidatosDelInmueble.length} Candidato(s) postulados
            </span>
          </div>
        </div>
      )}

      {/* Botones de Ordenación */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-2">
          Ordenar por:
        </span>

        <button
          onClick={() => toggleSort('indice')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
            sortBy === 'indice'
              ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          Índice de Solvencia
          {sortBy === 'indice' && (
            <ArrowUpDown className="w-3 h-3 ml-0.5 opacity-80" />
          )}
        </button>

        <button
          onClick={() => toggleSort('ratio')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
            sortBy === 'ratio'
              ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Ratio Alquiler/Ingresos
          {sortBy === 'ratio' && (
            <ArrowUpDown className="w-3 h-3 ml-0.5 opacity-80" />
          )}
        </button>

        <button
          onClick={() => toggleSort('documentacion')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
            sortBy === 'documentacion'
              ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <FileCheck className="w-3.5 h-3.5" />
          Documentación
          {sortBy === 'documentacion' && (
            <ArrowUpDown className="w-3 h-3 ml-0.5 opacity-80" />
          )}
        </button>

        <button
          onClick={() => toggleSort('ingresos')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
            sortBy === 'ingresos'
              ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Ingresos Totales
          {sortBy === 'ingresos' && (
            <ArrowUpDown className="w-3 h-3 ml-0.5 opacity-80" />
          )}
        </button>
      </div>

      {/* Tabla Comparativa */}
      {sortedCandidatos.length > 0 ? (
        <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="p-3.5">Candidato</th>
                <th className="p-3.5 text-center">Índice</th>
                <th className="p-3.5 text-center">Ratio Esfuerzo</th>
                <th className="p-3.5 text-center">Documentación</th>
                <th className="p-3.5">Ingresos Totales</th>
                <th className="p-3.5">Clasificación</th>
                <th className="p-3.5 text-right">Acción</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 font-medium">
              {sortedCandidatos.map(({ candidato, resultado, docPercent, ingresosTotales }, idx) => {
                const isTopScore = idx === 0 && sortedCandidatos.length > 1 && sortBy === 'indice';

                return (
                  <tr
                    key={candidato.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isTopScore ? 'bg-emerald-50/30' : ''
                    }`}
                  >
                    {/* Candidato */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center shrink-0">
                          {candidato.nombre.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                            {candidato.nombre}
                            {isTopScore && (
                              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                                MEJOR SCORE
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {candidato.tipoEmpleo.replace('_', ' ')} • {candidato.antiguedadLaboral}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Índice */}
                    <td className="p-3.5 text-center">
                      <span className="inline-block px-3 py-1 bg-slate-900 text-emerald-400 font-extrabold text-sm rounded-xl">
                        {resultado.indiceSolvencia} <span className="text-[10px] text-slate-400 font-normal">/100</span>
                      </span>
                    </td>

                    {/* Ratio */}
                    <td className="p-3.5 text-center font-bold text-slate-800">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-lg text-xs ${
                          resultado.ratioEsfuerzo <= 30
                            ? 'bg-emerald-100 text-emerald-800'
                            : resultado.ratioEsfuerzo <= 35
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {resultado.ratioEsfuerzo}%
                      </span>
                    </td>

                    {/* Documentación */}
                    <td className="p-3.5 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <div className="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${
                              docPercent === 100 ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${docPercent}%` }}
                          ></div>
                        </div>
                        <span className="font-bold text-xs text-slate-700">{docPercent}%</span>
                      </div>
                    </td>

                    {/* Ingresos */}
                    <td className="p-3.5">
                      <p className="font-bold text-slate-900">{formatEuro(ingresosTotales)}/m</p>
                      <p className="text-[10px] text-slate-500">
                        {candidato.avalista ? 'Con avalista' : 'Sin avalista'}
                      </p>
                    </td>

                    {/* Clasificación */}
                    <td className="p-3.5">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${resultado.badgeColorStyle}`}
                      >
                        {resultado.nivelClasificacion}
                      </span>
                    </td>

                    {/* Acción */}
                    <td className="p-3.5 text-right">
                      {onSelectCandidate && (
                        <button
                          onClick={() => onSelectCandidate(candidato)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-lg transition-colors inline-flex items-center gap-1"
                        >
                          Ver Ficha
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200/80">
          <p className="text-sm font-medium">No hay candidatos registrados para este inmueble todavía.</p>
        </div>
      )}
    </div>
  );
};
