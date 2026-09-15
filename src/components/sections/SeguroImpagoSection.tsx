import React, { useState } from 'react';
import {
  SolicitudSeguroImpago,
  ConfiguracionAseguradora,
  Candidato,
  Inmueble,
} from '../../types';
import {
  ShieldCheck,
  Plus,
  Settings,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Mail,
  Building2,
  Users,
  ChevronRight,
  Send,
  Sparkles,
  ExternalLink,
  Trash2,
  RotateCw,
  FileCheck,
} from 'lucide-react';
import { getTipoDocumentoLabel } from '../../utils/formatters';

interface SeguroImpagoSectionProps {
  solicitudesSeguro: SolicitudSeguroImpago[];
  aseguradoras: ConfiguracionAseguradora[];
  candidatos: Candidato[];
  inmuebles: Inmueble[];
  onOpenCrearModal: () => void;
  onOpenConfigModal: () => void;
  onOpenDetalleModal: (solicitud: SolicitudSeguroImpago) => void;
  onDeleteSolicitud: (solicitudId: string) => void;
}

export const SeguroImpagoSection: React.FC<SeguroImpagoSectionProps> = ({
  solicitudesSeguro,
  aseguradoras,
  candidatos,
  inmuebles,
  onOpenCrearModal,
  onOpenConfigModal,
  onOpenDetalleModal,
  onDeleteSolicitud,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAseguradora, setFilterAseguradora] = useState('todas');
  const [filterDictamen, setFilterDictamen] = useState('todos');

  // Metrics
  const total = solicitudesSeguro.length;
  const favorables = solicitudesSeguro.filter(
    (s) => s.dictamenAseguradora === 'FAVORABLE' || s.decisionFinalPropietario === 'ACEPTADO'
  ).length;
  const enTramite = solicitudesSeguro.filter(
    (s) => s.estado === 'CORREO_ENVIADO' || s.estado === 'SOLICITUD_PENDIENTE' || s.dictamenAseguradora === 'EN_ESTUDIO'
  ).length;
  const pendientesAccion = solicitudesSeguro.filter(
    (s) => s.estado === 'BORRADOR' || s.dictamenAseguradora === 'DOCUMENTACION_REQUERIDA' || s.decisionFinalPropietario === 'PENDIENTE'
  ).length;

  // Filtered items
  const filtered = solicitudesSeguro.filter((sol) => {
    const matchesSearch =
      !searchTerm ||
      sol.referenciaUnica.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sol.titular1.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sol.inmuebleNombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sol.aseguradoraNombre.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAseg = filterAseguradora === 'todas' || sol.aseguradoraId === filterAseguradora;
    const matchesDictamen = filterDictamen === 'todos' || sol.dictamenAseguradora === filterDictamen;

    return matchesSearch && matchesAseg && matchesDictamen;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Seguro de Impago de Alquiler
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Tramitación con SEAG, ARAG, Caser, Mutua de Propietarios y DAS, scoring IA y control de resoluciones
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={onOpenConfigModal}
            className="px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-2 border border-slate-200 shadow-2xs"
          >
            <Settings className="w-4 h-4 text-slate-600" />
            Configurar Aseguradoras
          </button>

          <button
            onClick={onOpenCrearModal}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-colors shadow-md shadow-indigo-600/20 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo Expediente de Seguro
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Expedientes Totales</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{total}</span>
          <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">{aseguradoras.length} aseguradoras integradas</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Aprobados / Favorables</span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">{favorables}</span>
          <span className="text-[11px] text-emerald-700 font-bold mt-0.5 block">Listos para formalizar contrato</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">En Trámite con Aseguradora</span>
          <span className="text-2xl font-black text-blue-600 mt-1 block">{enTramite}</span>
          <span className="text-[11px] text-blue-600 font-medium mt-0.5 block">Esperando dictamen formal</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Pendiente de Decisión</span>
          <span className="text-2xl font-black text-amber-600 mt-1 block">{pendientesAccion}</span>
          <span className="text-[11px] text-amber-700 font-medium mt-0.5 block">Requiere revisión del propietario</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por referencia, inquilino o inmueble..."
            className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-300 rounded-xl bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-bold text-slate-500">Aseguradora:</span>
            <select
              value={filterAseguradora}
              onChange={(e) => setFilterAseguradora(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="todas">Todas las entidades</option>
              {aseguradoras.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-bold text-slate-500">Dictamen:</span>
            <select
              value={filterDictamen}
              onChange={(e) => setFilterDictamen(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="todos">Todos los dictámenes</option>
              <option value="FAVORABLE">Favorable</option>
              <option value="FAVORABLE_CONDICIONADO">Condicionado</option>
              <option value="EN_ESTUDIO">En Estudio</option>
              <option value="DOCUMENTACION_REQUERIDA">Requiere Docs</option>
              <option value="DESFAVORABLE">Desfavorable</option>
            </select>
          </div>
        </div>
      </div>

      {/* Solicitudes List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-800 text-base">No hay expedientes de seguro registrados</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Crea tu primera solicitud para tramitar el estudio de solvencia con ARAG, Caser, Mutua de Propietarios o DAS con generación de correo trazable por referencia única.
          </p>
          <button
            onClick={onOpenCrearModal}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Crear Primer Expediente
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:gap-4">
          {filtered.map((sol) => (
            <div
              key={sol.id}
              onClick={() => onOpenDetalleModal(sol)}
              className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 group"
            >
              {/* Left Info */}
              <div className="flex items-start gap-3.5 min-w-0 flex-1">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                  sol.dictamenAseguradora === 'FAVORABLE'
                    ? 'bg-emerald-100 text-emerald-700'
                    : sol.dictamenAseguradora === 'FAVORABLE_CONDICIONADO'
                    ? 'bg-amber-100 text-amber-700'
                    : sol.dictamenAseguradora === 'DESFAVORABLE'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-indigo-100 text-indigo-700'
                }`}>
                  <ShieldCheck className="w-6 h-6" />
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                      {sol.referenciaUnica}
                    </span>
                    <span className="font-black text-sm text-slate-900 truncate">
                      {sol.titular1.nombre} {sol.numTitulares === 2 && `+ ${sol.titular2?.nombre}`}
                    </span>
                    <span className="text-xs text-slate-400">•</span>
                    <span className="text-xs font-bold text-slate-700">{sol.inmuebleNombre}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                    <span className="font-medium">
                      Aseguradora: <span className="font-bold text-slate-700">{sol.aseguradoraNombre}</span>
                    </span>
                    <span>•</span>
                    <span className="font-medium">
                      Renta: <span className="font-bold text-slate-900">{sol.rentaMensual} €/mes</span>
                    </span>
                    <span>•</span>
                    <span className="font-medium">
                      Ingresos conjuntos: <span className="font-bold text-slate-900">{sol.ingresosTotalesConjuntos.toLocaleString('es-ES')} €/mes</span>
                    </span>
                    <span>•</span>
                    <span className="font-medium">
                      Ratio esfuerzo: <span className={`font-bold ${sol.ratioEsfuerzoCalculado <= 40 ? 'text-emerald-600' : 'text-amber-600'}`}>{sol.ratioEsfuerzoCalculado}%</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Status and Action Badges */}
              <div className="flex items-center gap-2.5 shrink-0 w-full lg:w-auto justify-between lg:justify-end border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${
                    sol.dictamenAseguradora === 'FAVORABLE'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : sol.dictamenAseguradora === 'FAVORABLE_CONDICIONADO'
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : sol.dictamenAseguradora === 'DESFAVORABLE'
                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                      : 'bg-blue-50 text-blue-800 border-blue-200'
                  }`}>
                    {sol.dictamenTexto || sol.dictamenAseguradora}
                  </span>

                  <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                    {sol.estado}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`¿Eliminar el expediente ${sol.referenciaUnica}?`)) {
                        onDeleteSolicitud(sol.id);
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Eliminar expediente"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Guide Banner */}
      <div className="bg-indigo-900 text-white rounded-2xl p-5 sm:p-6 shadow-md space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-300" />
          <h3 className="font-black text-sm uppercase tracking-wider text-indigo-200">
            Flujo de Seguro de Impago y Trazabilidad por Referencia
          </h3>
        </div>
        <p className="text-xs text-indigo-100 leading-relaxed max-w-3xl">
          Cada expediente genera una referencia única identificativa (ej: <span className="font-mono font-bold text-white">[REF-IMPAGO-...]</span>) que se inserta en el asunto del correo a la aseguradora. Cuando la aseguradora responde manteniendo el asunto, la IA procesa automáticamente el dictamen oficial, las coberturas y las posibles condiciones o documentos requeridos, dejando la decisión final bajo el control del propietario.
        </p>
      </div>
    </div>
  );
};
