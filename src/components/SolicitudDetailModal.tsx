import React, { useState } from 'react';
import {
  SolicitudAlquiler,
  SolicitudEstado,
  SolicitudHistorialItem,
  Inmueble,
} from '../types';
import {
  X,
  User,
  Phone,
  Mail,
  Building2,
  Euro,
  Users,
  Briefcase,
  FileCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Sparkles,
  Bot,
  AlertCircle,
  FileText,
  Calendar,
  History,
  Dog,
  Cigarette,
  ShieldAlert,
  ChevronRight,
  ExternalLink,
  Star,
} from 'lucide-react';

interface SolicitudDetailModalProps {
  solicitud: SolicitudAlquiler;
  inmueble?: Inmueble;
  onClose: () => void;
  onUpdateSolicitud: (updated: SolicitudAlquiler) => void;
  onTriggerAiAnalysis?: (solicitud: SolicitudAlquiler) => void;
}

export const SolicitudDetailModal: React.FC<SolicitudDetailModalProps> = ({
  solicitud,
  inmueble,
  onClose,
  onUpdateSolicitud,
  onTriggerAiAnalysis,
}) => {
  const [activeTab, setActiveTab] = useState<'resumen' | 'cuestionario' | 'documentos' | 'historial'>('resumen');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [ownerNote, setOwnerNote] = useState(solicitud.observacionesOwner || '');

  const formatNow = () =>
    new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const handleStatusChange = (nuevoEstado: SolicitudEstado, accionNombre: string, detalleStr?: string) => {
    const formattedDate = formatNow();
    const newHistorialItem: SolicitudHistorialItem = {
      id: `h-${Date.now()}`,
      fecha: formattedDate,
      accion: accionNombre,
      detalle: detalleStr || `Estado actualizado a ${nuevoEstado}`,
      estadoAnterior: solicitud.estado,
      estadoNuevo: nuevoEstado,
    };

    const updated: SolicitudAlquiler = {
      ...solicitud,
      estado: nuevoEstado,
      historial: [newHistorialItem, ...(solicitud.historial || [])],
      fechaActualizacion: new Date().toISOString(),
      observacionesOwner: ownerNote,
    };

    onUpdateSolicitud(updated);
  };

  const handleRunAiAnalysis = () => {
    if (onTriggerAiAnalysis) {
      setIsAnalyzing(true);
      setTimeout(() => {
        onTriggerAiAnalysis(solicitud);
        setIsAnalyzing(false);
      }, 1000);
    } else {
      handleStatusChange('EN ANÁLISIS', 'Análisis con IA solicitado', 'Procesando expediente del candidato');
    }
  };

  const getStatusBadge = (st: SolicitudEstado) => {
    switch (st) {
      case 'SELECCIONADO':
        return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-extrabold rounded-full text-xs">SELECCIONADO</span>;
      case 'NO SELECCIONADO':
        return <span className="px-2.5 py-1 bg-rose-100 text-rose-800 font-extrabold rounded-full text-xs">NO SELECCIONADO</span>;
      case 'CANCELADA':
        return <span className="px-2.5 py-1 bg-slate-200 text-slate-700 font-extrabold rounded-full text-xs">CANCELADA</span>;
      case 'EN ANÁLISIS':
        return <span className="px-2.5 py-1 bg-purple-100 text-purple-800 font-extrabold rounded-full text-xs">EN ANÁLISIS</span>;
      case 'DOCUMENTACIÓN PENDIENTE':
        return <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-extrabold rounded-full text-xs">DOC. PENDIENTE</span>;
      case 'DOCUMENTACIÓN COMPLETA':
        return <span className="px-2.5 py-1 bg-blue-100 text-blue-800 font-extrabold rounded-full text-xs">DOC. COMPLETA</span>;
      default:
        return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 font-extrabold rounded-full text-xs">{st}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200/90 overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400">
                Solicitud #{solicitud.id}
              </span>
              {getStatusBadge(solicitud.estado)}
            </div>
            <h2 className="text-lg sm:text-xl font-bold">{solicitud.candidatoNombre}</h2>
            <p className="text-xs text-slate-300 flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              <span>{solicitud.inmuebleNombre}</span>
              <span className="text-slate-500">•</span>
              <span className="font-bold text-emerald-400">{solicitud.inmueblePrecio} €/mes</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-all"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2 shrink-0 overflow-x-auto">
          {[
            { id: 'resumen', label: 'Resumen y Evaluación', icon: User },
            { id: 'cuestionario', label: 'Cuestionario (12)', icon: FileText },
            { id: 'documentos', label: 'Documentación', icon: FileCheck },
            { id: 'historial', label: 'Historial', icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                  isActive
                    ? 'border-blue-600 text-blue-700 bg-white shadow-2xs'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body Scrollable */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* TAB 1: RESUMEN Y EVALUACIÓN */}
          {activeTab === 'resumen' && (
            <div className="space-y-6">
              {/* Scores & Owner Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-200/80 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-blue-900">Índice de Solvencia</span>
                    <span className="text-2xl font-black text-blue-700">
                      {solicitud.scoreSolvencia ? `${solicitud.scoreSolvencia}/100` : 'N/D'}
                    </span>
                  </div>
                  <div className="w-full bg-blue-200/60 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full"
                      style={{ width: `${solicitud.scoreSolvencia || 70}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-blue-800">
                    Ingresos netos: <strong>{solicitud.ingresosNetosMensuales} €/mes</strong> sobre alquiler de {solicitud.inmueblePrecio} €/mes.
                  </p>
                </div>

                <div className="p-5 bg-gradient-to-br from-purple-50 to-slate-50 border border-purple-200/80 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-purple-900">Perfil Operativo</span>
                    <span className="text-2xl font-black text-purple-700">
                      {solicitud.perfilOperativo ? `${solicitud.perfilOperativo}/100` : '85/100'}
                    </span>
                  </div>
                  <div className="w-full bg-purple-200/60 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-purple-600 h-full rounded-full"
                      style={{ width: `${solicitud.perfilOperativo || 85}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-purple-800">
                    Evaluado según respuestas del cuestionario de 12 situaciones.
                  </p>
                </div>
              </div>

              {/* Candidate Info Card */}
              <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider text-slate-500">
                  Datos Personales y Contacto
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block font-medium">Teléfono</span>
                    <a href={`tel:${solicitud.candidatoTelefono}`} className="font-bold text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                      <Phone className="w-3.5 h-3.5" /> {solicitud.candidatoTelefono}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Email</span>
                    <a href={`mailto:${solicitud.candidatoEmail}`} className="font-bold text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                      <Mail className="w-3.5 h-3.5" /> {solicitud.candidatoEmail}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Unidad Familiar</span>
                    <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      {solicitud.numTotalPersonas} persona(s) ({solicitud.numAdultos} ad., {solicitud.numMenores} men.)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs border-t border-slate-200/60 pt-3">
                  <div>
                    <span className="text-slate-400 block font-medium">Fecha Entrada</span>
                    <span className="font-bold text-slate-800">{solicitud.fechaEntradaAproximada || 'A convenir'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Mascotas</span>
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <Dog className="w-3.5 h-3.5 text-slate-500" />
                      {solicitud.tieneMascotas ? `Sí (${solicitud.detallesMascotas || 'Si'})` : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Fumadores</span>
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <Cigarette className="w-3.5 h-3.5 text-slate-500" />
                      {solicitud.esFumador ? 'Sí' : 'No'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Economic Info Card */}
              <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Situación Económica y Laboral
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block font-medium">Situación Laboral</span>
                    <span className="font-bold text-slate-800 capitalize">{solicitud.situacionLaboral.replace('_', ' ')}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Empresa / Puesto</span>
                    <span className="font-bold text-slate-800">{solicitud.empresa || 'N/D'} - {solicitud.puesto || ''}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Contrato / Antigüedad</span>
                    <span className="font-bold text-slate-800">{solicitud.tipoContrato} ({solicitud.antiguedadLaboral})</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs border-t border-slate-200/60 pt-3">
                  <div>
                    <span className="text-slate-400 block font-medium">Ingresos Netos</span>
                    <span className="font-black text-emerald-700">{solicitud.ingresosNetosMensuales} €/mes</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Otros Ingresos</span>
                    <span className="font-bold text-slate-800">{solicitud.otrosIngresos ? `${solicitud.otrosIngresos} €/mes` : 'No aporta'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Avalista</span>
                    <span className="font-bold text-slate-800">{solicitud.tieneAvalista ? 'Sí aportado' : 'No'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CUESTIONARIO */}
          {activeTab === 'cuestionario' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Respuestas a las 12 Situaciones en la Vivienda
              </h3>
              {solicitud.cuestionarioData?.respuestas ? (
                <div className="space-y-3">
                  {solicitud.cuestionarioData.respuestas.map((resp, idx) => (
                    <div key={resp.preguntaId} className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1 text-xs">
                      <span className="text-[10px] font-extrabold uppercase text-blue-600 block">
                        Pregunta {idx + 1}: {resp.preguntaTitulo}
                      </span>
                      {resp.esAbierta ? (
                        <p className="text-slate-800 font-medium italic bg-white p-3 rounded-xl border border-slate-200 mt-1">
                          "{resp.respuestaTextoLibre}"
                        </p>
                      ) : (
                        <p className="text-slate-800 font-bold flex items-center gap-2 mt-1">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">
                            {resp.opcionSeleccionadaId}
                          </span>
                          <span>{resp.opcionSeleccionadaTexto}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                  <p className="text-xs text-slate-500 font-medium">Cuestionario aún no completado por el candidato.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DOCUMENTOS */}
          {activeTab === 'documentos' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Estado de la Documentación Aportada
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {solicitud.documentos?.map((doc) => (
                  <div key={doc.id} className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">{doc.nombre}</span>
                      <span className="text-[10px] text-slate-400">
                        {doc.subido ? `Subido el ${doc.fechaSubida || 'Recientemente'}` : 'Pendiente de adjuntar'}
                      </span>
                    </div>
                    {doc.subido ? (
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-extrabold rounded-full text-[10px] flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Subido
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-extrabold rounded-full text-[10px]">
                        Pendiente
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: HISTORIAL */}
          {activeTab === 'historial' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Línea de Tiempo de la Solicitud
              </h3>
              <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
                {solicitud.historial?.map((item) => (
                  <div key={item.id} className="relative group">
                    <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-xs" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{item.accion}</span>
                        <span className="text-[10px] text-slate-400 font-medium">{item.fecha}</span>
                      </div>
                      {item.detalle && <p className="text-xs text-slate-600 leading-relaxed">{item.detalle}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Action Bar */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <a
              href={`https://wa.me/${solicitud.candidatoTelefono.replace(/\s+/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Phone className="w-3.5 h-3.5" /> Contactar
            </a>

            <button
              onClick={handleRunAiAnalysis}
              disabled={isAnalyzing}
              className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isAnalyzing ? 'Analizando...' : 'Analizar con IA'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleStatusChange('SELECCIONADO', 'Candidato Preseleccionado para Visita', 'Preseleccionado para enviar invitación de cita')}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Star className="w-3.5 h-3.5 fill-white" />
              <span>Preseleccionar</span>
            </button>

            <button
              onClick={() => handleStatusChange('SELECCIONADO', 'Candidato Seleccionado', 'El propietario ha seleccionado esta solicitud')}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs"
            >
              Seleccionar
            </button>

            <button
              onClick={() => handleStatusChange('NO SELECCIONADO', 'Candidato Desestimado', 'Solicitud descartada')}
              className="px-4 py-2 bg-rose-100 text-rose-800 hover:bg-rose-200 rounded-xl text-xs font-bold"
            >
              No Seleccionar
            </button>

            <button
              onClick={() => handleStatusChange('CANCELADA', 'Solicitud Cancelada')}
              className="px-3 py-2 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-xl text-xs font-bold"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
