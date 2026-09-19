import React, { useState } from 'react';
import {
  ContratoFormalizacion,
  Inmueble,
  Candidato,
  SolicitudDocumentacion,
  UserProfile,
  EstadoFormalizacion,
} from '../../types';
import { getFormalizacionEstadoInfo, imprimirContratoPDF, generarTextoActaEntrega } from '../../utils/contratoEngine';
import { formatEuro, formatDate } from '../../utils/formatters';
import {
  FileText,
  Key,
  ShieldCheck,
  Building2,
  Users,
  Search,
  Filter,
  Plus,
  Printer,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Euro,
  Sparkles,
  ExternalLink,
  Trash2,
  Edit3,
  RefreshCw,
} from 'lucide-react';

interface FormalizacionSectionProps {
  contratos: ContratoFormalizacion[];
  inmuebles: Inmueble[];
  candidatos: Candidato[];
  solicitudesDoc: SolicitudDocumentacion[];
  userProfile?: UserProfile;
  onOpenFormalizarModal: (candidato: Candidato, inmueble?: Inmueble, contrato?: ContratoFormalizacion) => void;
  onDeleteContrato: (contratoId: string) => Promise<void>;
  // FASE 3.1: «el inquilino me ha comunicado que se va».
  onRecomercializarContrato?: (contrato: ContratoFormalizacion) => void;
}

export const FormalizacionSection: React.FC<FormalizacionSectionProps> = ({
  contratos,
  inmuebles,
  candidatos,
  solicitudesDoc,
  userProfile,
  onOpenFormalizarModal,
  onDeleteContrato,
  onRecomercializarContrato,
}) => {
  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState<string>('todos');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showNewContractSelector, setShowNewContractSelector] = useState<boolean>(false);

  // KPIs
  const totalContratos = contratos.length;
  const contratosFirmados = contratos.filter(
    (c) => c.estado === 'FIRMADO' || c.estado === 'FIANZA_DEPOSITADA' || c.estado === 'FORMALIZADO_ACTIVO'
  ).length;
  const totalRentaMensual = contratos
    .filter((c) => c.estado !== 'CANCELADO')
    .reduce((acc, curr) => acc + curr.rentaMensual, 0);
  const aptosSeguro = contratos.filter((c) => c.evaluacionAsegurabilidad.dictamen === 'APTO_RECOMENDADO').length;

  // Filtrado
  const filteredContratos = contratos.filter((contrato) => {
    if (selectedPropertyFilter !== 'todos' && contrato.inmuebleId !== selectedPropertyFilter) {
      return false;
    }
    if (selectedStatusFilter !== 'todos' && contrato.estado !== selectedStatusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = contrato.candidatoNombre.toLowerCase().includes(q);
      const matchProp = contrato.inmuebleNombre.toLowerCase().includes(q);
      const matchDni = contrato.candidatoDni.toLowerCase().includes(q);
      if (!matchName && !matchProp && !matchDni) return false;
    }
    return true;
  });

  // Candidatos disponibles para formalizar (que no tengan ya contrato activo o preseleccionados)
  const candidatosDisponibles = candidatos.filter((cand) => {
    return cand.estado === 'preseleccionado' || cand.estado === 'visita_reservada' || cand.estado === 'seleccionado';
  });

  return (
    <div className="space-y-6">
      {/* Banner Top */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-7 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 mb-3">
            <Key className="w-3.5 h-3.5 text-indigo-300" />
            Fase 3: Formalización del Alquiler
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            Contratos LAU, Asegurabilidad y Entrega de Llaves
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
            Genera contratos de arrendamiento conforme a la Ley de Arrendamientos Urbanos, evalúa la cobertura para seguro de impago y gestiona el acta de entrega de llaves con lectura de suministros.
          </p>
        </div>
      </div>

      {/* KPIs Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Expedientes</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{totalContratos}</p>
          <p className="text-xs text-slate-400 mt-1">Total de contratos gestionados</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Firmados / Activos</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-emerald-600">{contratosFirmados}</p>
          <p className="text-xs text-slate-400 mt-1">Formalizados satisfactoriamente</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Renta Gestionada</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Euro className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{formatEuro(totalRentaMensual)}</p>
          <p className="text-xs text-slate-400 mt-1">Mensuales en expedientes activos</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Seguro Apto</span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-teal-600">{aptosSeguro}</p>
          <p className="text-xs text-slate-400 mt-1">Ratio &le; 35% y solvencia óptima</p>
        </div>
      </div>

      {/* Control Bar: Filters & Actions */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por inquilino o inmueble..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white transition-colors"
            />
          </div>

          {/* Filter Inmueble */}
          <select
            value={selectedPropertyFilter}
            onChange={(e) => setSelectedPropertyFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
          >
            <option value="todos">Todos los inmuebles</option>
            {inmuebles.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nombre}
              </option>
            ))}
          </select>

          {/* Filter Estado */}
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
          >
            <option value="todos">Todos los estados</option>
            <option value="BORRADOR_CONTRATO">Borrador Contrato</option>
            <option value="ENVIADO_FIRMA">Enviado para Firma</option>
            <option value="FIRMADO">Contrato Firmado</option>
            <option value="FIANZA_DEPOSITADA">Fianza Recibida</option>
            <option value="FORMALIZADO_ACTIVO">Formalizado (Activo)</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>

        <button
          onClick={() => setShowNewContractSelector(true)}
          className="w-full md:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Formalizar Nuevo Alquiler</span>
        </button>
      </div>

      {/* Modal Selector para Nuevo Contrato si se pulsa el botón */}
      {showNewContractSelector && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-600" />
              Selecciona el Candidato a Formalizar
            </h3>
            <p className="text-xs text-slate-500">
              Escoge un solicitante de tu lista de preseleccionados para redactar el borrador del contrato LAU y evaluar asegurabilidad:
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {candidatosDisponibles.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl">
                  No hay candidatos en estado preseleccionado o seleccionado actualmente.
                </div>
              ) : (
                candidatosDisponibles.map((cand) => {
                  const prop = inmuebles.find((i) => i.id === cand.inmuebleId);
                  return (
                    <div
                      key={cand.id}
                      onClick={() => {
                        setShowNewContractSelector(false);
                        onOpenFormalizarModal(cand, prop);
                      }}
                      className="p-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-2xl cursor-pointer transition-colors flex items-center justify-between"
                    >
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{cand.nombre}</h4>
                        <p className="text-[11px] text-slate-500">
                          {prop?.nombre || 'Inmueble'} · {formatEuro(cand.ingresosNetos)} netos
                        </p>
                      </div>
                      <span className="text-xs font-bold text-indigo-600 flex items-center gap-1">
                        Comenzar <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowNewContractSelector(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de Contratos */}
      {filteredContratos.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 border border-slate-200 text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto">
            <FileText className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No hay expedientes de formalización</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Puedes iniciar un nuevo contrato desde aquí o directamente desde la pestaña de{' '}
            <strong>Candidatos Preseleccionados</strong> tras revisar su documentación.
          </p>
          <button
            onClick={() => setShowNewContractSelector(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Formalizar Primer Alquiler</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredContratos.map((contrato) => {
            const cand = candidatos.find((c) => c.id === contrato.candidatoId);
            const prop = inmuebles.find((i) => i.id === contrato.inmuebleId);
            const estadoInfo = getFormalizacionEstadoInfo(contrato.estado);
            const evalAseg = contrato.evaluacionAsegurabilidad;

            return (
              <div
                key={contrato.id}
                className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all p-5 space-y-4 flex flex-col justify-between"
              >
                {/* Header Card */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${estadoInfo.badgeClass}`}>
                          {estadoInfo.label}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            evalAseg.dictamen === 'APTO_RECOMENDADO'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : evalAseg.dictamen === 'APTO_CON_CONDICIONES'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {evalAseg.dictamen === 'APTO_RECOMENDADO'
                            ? '✓ Seguro Apto'
                            : evalAseg.dictamen === 'APTO_CON_CONDICIONES'
                            ? '⚠️ Seguro c/Garantía'
                            : '✕ Riesgo Seguro'}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900">{contrato.candidatoNombre}</h3>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {contrato.inmuebleNombre} ({contrato.inmuebleCiudad})
                        </span>
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-indigo-700">
                        {formatEuro(contrato.rentaMensual)}
                      </span>
                      <span className="text-[10px] text-slate-400 block">/ mes</span>
                    </div>
                  </div>

                  {/* Resumen de Condiciones */}
                  <div className="grid grid-cols-3 gap-2 mt-4 p-3 bg-slate-50 rounded-2xl text-[11px] text-slate-600">
                    <div>
                      <span className="text-slate-400 block">Fianza Total</span>
                      <span className="font-bold text-slate-800">
                        {formatEuro(contrato.fianzaLegalImporte + contrato.garantiaAdicionalImporte)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Fecha Inicio</span>
                      <span className="font-bold text-slate-800">{contrato.fechaInicioContrato}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Firmas</span>
                      <span className="font-bold text-slate-800">
                        {contrato.firmaArrendador.firmado && contrato.firmaArrendatario.firmado
                          ? '2/2 Completas'
                          : contrato.firmaArrendador.firmado || contrato.firmaArrendatario.firmado
                          ? '1/2 Pendiente'
                          : '0/2 Pendientes'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Acciones del Contrato */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => imprimirContratoPDF(contrato)}
                      title="Imprimir o Descargar Contrato en PDF"
                      className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    {onRecomercializarContrato && contrato.estado !== 'CANCELADO' && (
                      <button
                        onClick={() => onRecomercializarContrato(contrato)}
                        title="El inquilino se va: iniciar recomercialización"
                        className="p-2 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (confirm(`¿Eliminar el expediente de ${contrato.candidatoNombre}?`)) {
                          await onDeleteContrato(contrato.id);
                        }
                      }}
                      title="Eliminar expediente"
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      if (cand) {
                        onOpenFormalizarModal(cand, prop, contrato);
                      }
                    }}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Gestionar Expediente</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
