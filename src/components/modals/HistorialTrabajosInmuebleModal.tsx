import React, { useState } from 'react';
import {
  X,
  Building2,
  Briefcase,
  Calendar,
  DollarSign,
  Star,
  CheckCircle2,
  Clock,
  ExternalLink,
  Plus,
  Wrench,
  ChevronRight,
  FileText,
} from 'lucide-react';
import {
  Inmueble,
  TrabajoProfesional,
  PresupuestoProfesional,
  Profesional,
  UsuarioApp,
} from '../../types';
import { ESTADO_TRABAJO_LABELS, PRIORIDAD_TRABAJO_LABELS } from '../../utils/profesionalesEngine';

interface HistorialTrabajosInmuebleModalProps {
  isOpen: boolean;
  onClose: () => void;
  inmueble: Inmueble;
  trabajos: TrabajoProfesional[];
  presupuestos: PresupuestoProfesional[];
  profesionales: Profesional[];
  currentUser?: UsuarioApp;
  onCrearTrabajo?: (inmuebleId: string) => void;
  onSelectTrabajo?: (trabajo: TrabajoProfesional) => void;
}

export const HistorialTrabajosInmuebleModal: React.FC<HistorialTrabajosInmuebleModalProps> = ({
  isOpen,
  onClose,
  inmueble,
  trabajos,
  presupuestos,
  profesionales,
  currentUser,
  onCrearTrabajo,
  onSelectTrabajo,
}) => {
  const [filtroCategoria, setFiltroCategoria] = useState<string>('TODAS');

  if (!isOpen) return null;

  const trabajosDelInmueble = trabajos.filter((t) => t.inmuebleId === inmueble.id);

  const totalInvertido = trabajosDelInmueble.reduce((acc, t) => {
    return acc + (t.importeFinal || t.importeEstimado || 0);
  }, 0);

  const trabajosFinalizados = trabajosDelInmueble.filter((t) => t.estado === 'FINALIZADO').length;
  const trabajosEnCurso = trabajosDelInmueble.filter(
    (t) => t.estado === 'EN_EJECUCION' || t.estado === 'PROGRAMADO' || t.estado === 'PENDIENTE_MATERIAL'
  ).length;

  const trabajosFiltrados = trabajosDelInmueble.filter((t) => {
    if (filtroCategoria === 'TODAS') return true;
    return t.categoria === filtroCategoria;
  });

  return (
    <div
      id="historial-trabajos-inmueble-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl my-8 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-600/20 flex items-center justify-center text-blue-600">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{inmueble.direccion}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {inmueble.ciudad} {inmueble.codigoPostal ? `• CP ${inmueble.codigoPostal}` : ''} • Historial de Mantenimiento y Reformas
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onCrearTrabajo && (
              <button
                onClick={() => onCrearTrabajo(inmueble.id)}
                className="inline-flex items-center space-x-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva Orden para este Inmueble</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-200 bg-white divide-x divide-slate-100 text-center text-xs">
          <div className="p-3">
            <span className="text-slate-400 block font-medium">Intervenciones Totales</span>
            <span className="text-base font-bold text-slate-900">{trabajosDelInmueble.length}</span>
          </div>
          <div className="p-3">
            <span className="text-slate-400 block font-medium">Finalizadas</span>
            <span className="text-base font-bold text-emerald-600">{trabajosFinalizados}</span>
          </div>
          <div className="p-3">
            <span className="text-slate-400 block font-medium">En Curso / Programadas</span>
            <span className="text-base font-bold text-blue-600">{trabajosEnCurso}</span>
          </div>
          <div className="p-3">
            <span className="text-slate-400 block font-medium">Inversión Acumulada</span>
            <span className="text-base font-bold text-slate-900">
              {totalInvertido.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </span>
          </div>
        </div>

        {/* List of Works */}
        <div className="p-6 overflow-y-auto flex-1 bg-white space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900">Registro Histórico de Trabajos</h4>
          </div>

          {trabajosFiltrados.length > 0 ? (
            <div className="space-y-3">
              {trabajosFiltrados.map((trab) => {
                const estInfo = ESTADO_TRABAJO_LABELS[trab.estado] || ESTADO_TRABAJO_LABELS.PENDIENTE;
                const prioInfo = PRIORIDAD_TRABAJO_LABELS[trab.prioridad] || PRIORIDAD_TRABAJO_LABELS.NORMAL;
                const prof = profesionales.find((p) => p.id === trab.profesionalId);

                return (
                  <div
                    key={trab.id}
                    onClick={() => onSelectTrabajo && onSelectTrabajo(trab)}
                    className="p-4 border border-slate-200 rounded-xl hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer bg-white"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <h5 className="font-bold text-slate-900 text-sm">{trab.titulo}</h5>
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${estInfo.badgeClass}`}>
                            {estInfo.label}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${prioInfo.badgeClass}`}>
                            {prioInfo.label}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">{trab.descripcion}</p>

                        <div className="flex items-center space-x-4 text-xs text-slate-500 mt-2.5">
                          <span className="flex items-center space-x-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{new Date(trab.fechaSolicitud).toLocaleDateString('es-ES')}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <Wrench className="w-3.5 h-3.5 text-slate-400" />
                            <span>{trab.profesionalNombre || prof?.nombreComercial || 'Sin asignar'}</span>
                          </span>
                          <span className="font-medium text-slate-700">Cat: {trab.categoria}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-base font-bold text-slate-900">
                          {(trab.importeFinal || trab.importeEstimado || 0).toLocaleString('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                          })}
                        </span>
                        <span className="text-[11px] text-slate-400 block">
                          {trab.importeFinal ? 'Coste Real' : 'Estimado'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
              No hay intervenciones profesionales registradas para este inmueble.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
