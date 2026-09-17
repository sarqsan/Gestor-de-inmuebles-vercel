import React, { useState, useEffect } from 'react';
import {
  Incidencia,
  PolizaSeguro,
  Siniestro,
  Profesional,
  UsuarioApp,
  EstadoIncidencia,
  ResponsabilidadIncidencia,
  SeguroEstadoIncidencia,
  AnalisisIncidenciaIA,
  TrabajoProfesional,
  PresupuestoProfesional,
  Inmueble,
} from '../../types';
import {
  ESTADOS_INCIDENCIA_LABELS,
  PRIORIDADES_INCIDENCIA_LABELS,
  CATEGORIAS_INCIDENCIA_LABELS,
  RESPONSABILIDAD_LABELS,
  SEGURO_ESTADO_LABELS,
  crearHistorialItem,
  canManageResponsabilidad,
} from '../../utils/incidenciasEngine';
import { evaluarCoberturaPolizas } from '../../utils/segurosEngine';
import {
  ESTADO_TRABAJO_LABELS,
  PRIORIDAD_TRABAJO_LABELS,
} from '../../utils/profesionalesEngine';
import { subscribeTrabajosProfesionales, subscribePresupuestosProfesionales } from '../../lib/firebase';
import { TrabajoProfesionalModal } from './TrabajoProfesionalModal';
import { DetalleTrabajoProfesionalModal } from './DetalleTrabajoProfesionalModal';
import { PresupuestoProfesionalModal } from './PresupuestoProfesionalModal';
import { DetallePresupuestoProfesionalModal } from './DetallePresupuestoProfesionalModal';
import {
  X,
  Sparkles,
  ShieldCheck,
  Wrench,
  History,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Building2,
  User,
  Phone,
  Euro,
  ExternalLink,
  ChevronRight,
  Info,
  Clock,
  Send,
  Loader2,
  Maximize2,
  Scale,
  Plus,
  Award,
  Check,
  HelpCircle,
} from 'lucide-react';

interface DetalleIncidenciaModalProps {
  isOpen: boolean;
  onClose: () => void;
  incidencia: Incidencia;
  polizas: PolizaSeguro[];
  siniestros: Siniestro[];
  profesionales: Profesional[];
  inmuebles?: Inmueble[];
  currentUser?: UsuarioApp;
  onUpdateIncidencia: (incidencia: Incidencia) => Promise<void>;
  onOpenSiniestroModal: (incidencia: Incidencia, siniestro?: Siniestro) => void;
}

type TabType = 'general' | 'analisis_ia' | 'responsabilidad' | 'seguro' | 'mantenimiento' | 'historial';

export const DetalleIncidenciaModal: React.FC<DetalleIncidenciaModalProps> = ({
  isOpen,
  onClose,
  incidencia,
  polizas,
  siniestros,
  profesionales,
  inmuebles = [],
  currentUser,
  onUpdateIncidencia,
  onOpenSiniestroModal,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [analyzingIA, setAnalyzingIA] = useState<boolean>(false);
  const [iaError, setIaError] = useState<string>('');
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);

  // Estados locales editables
  const [estado, setEstado] = useState<EstadoIncidencia>(incidencia.estado);
  const [responsabilidad, setResponsabilidad] = useState<ResponsabilidadIncidencia>(
    incidencia.responsabilidad || 'PENDIENTE_DE_DETERMINAR'
  );
  const [responsabilidadMotivo, setResponsabilidadMotivo] = useState<string>(
    incidencia.responsabilidadMotivo || ''
  );
  const [responsabilidadNotas, setResponsabilidadNotas] = useState<string>(
    incidencia.responsabilidadNotas || ''
  );
  const [responsabilidadGarantiaRef, setResponsabilidadGarantiaRef] = useState<string>(
    incidencia.responsabilidadGarantiaRef || ''
  );
  const [polizaId, setPolizaId] = useState<string>(incidencia.polizaId || '');
  const [responsabilidadProfesionalId, setResponsabilidadProfesionalId] = useState<string>(
    incidencia.profesionalId || incidencia.trabajoProfesional?.profesionalId || ''
  );
  const [solucionFinal, setSolucionFinal] = useState<string>(incidencia.solucionFinal || '');

  // Asignación de Profesional
  const [profesionalId, setProfesionalId] = useState<string>(incidencia.trabajoProfesional?.profesionalId || '');
  const [presupuestoEstimado, setPresupuestoEstimado] = useState<string>(
    incidencia.trabajoProfesional?.presupuestoEstimado?.toString() || ''
  );
  const [costeReal, setCosteReal] = useState<string>(
    incidencia.trabajoProfesional?.costeReal?.toString() || ''
  );
  const [facturaNumero, setFacturaNumero] = useState<string>(
    incidencia.trabajoProfesional?.facturaNumero || ''
  );
  const [estadoTrabajo, setEstadoTrabajo] = useState<string>(
    incidencia.trabajoProfesional?.estado || 'ASIGNADO'
  );

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string>('');

  // Bloque 5: Trabajos Profesionales Desacoplados vinculados
  const [trabajosVinculados, setTrabajosVinculados] = useState<TrabajoProfesional[]>([]);
  const [presupuestosVinculados, setPresupuestosVinculados] = useState<PresupuestoProfesional[]>([]);
  const [trabajosDelInmueble, setTrabajosDelInmueble] = useState<TrabajoProfesional[]>([]);
  const [showCrearTrabajoModal, setShowCrearTrabajoModal] = useState<boolean>(false);
  const [trabajoSeleccionadoDetalle, setTrabajoSeleccionadoDetalle] = useState<TrabajoProfesional | null>(null);
  const [showPresupuestoModal, setShowPresupuestoModal] = useState<boolean>(false);
  const [presupuestoSeleccionadoDetalle, setPresupuestoSeleccionadoDetalle] = useState<PresupuestoProfesional | null>(null);
  const [trabajoParaPresupuesto, setTrabajoParaPresupuesto] = useState<TrabajoProfesional | null>(null);

  // Sincronizar estados locales cuando cambie la incidencia
  useEffect(() => {
    setEstado(incidencia.estado);
    setResponsabilidad(incidencia.responsabilidad || 'PENDIENTE_DE_DETERMINAR');
    setResponsabilidadMotivo(incidencia.responsabilidadMotivo || '');
    setResponsabilidadNotas(incidencia.responsabilidadNotas || '');
    setResponsabilidadGarantiaRef(incidencia.responsabilidadGarantiaRef || '');
    setPolizaId(incidencia.polizaId || '');
    setResponsabilidadProfesionalId(
      incidencia.profesionalId || incidencia.trabajoProfesional?.profesionalId || ''
    );
    setSolucionFinal(incidencia.solucionFinal || '');
  }, [incidencia]);

  useEffect(() => {
    if (!isOpen || !incidencia?.id) return;
    const unsubTrab = subscribeTrabajosProfesionales((data) => {
      const vinculados = data.filter((t) => t.incidenciaId === incidencia.id);
      setTrabajosVinculados(vinculados);
    });
    const unsubPres = subscribePresupuestosProfesionales((data) => {
      setPresupuestosVinculados(data);
    });
    return () => {
      unsubTrab();
      unsubPres();
    };
  }, [isOpen, incidencia?.id]);

  useEffect(() => {
    if (!isOpen || !incidencia?.inmuebleId) return;
    const unsub = subscribeTrabajosProfesionales((data) => {
      const trabajosInm = data.filter((t) => t.inmuebleId === incidencia.inmuebleId);
      setTrabajosDelInmueble(trabajosInm);
    });
    return () => unsub();
  }, [isOpen, incidencia?.inmuebleId]);

  if (!isOpen) return null;

  // Evaluar cobertura con las pólizas vigentes
  const evaluacionSeguro = evaluarCoberturaPolizas(incidencia, polizas);
  // Buscar siniestro vinculado a esta incidencia si existe
  const siniestroVinculado = siniestros.find((s) => s.incidenciaId === incidencia.id);
  // Pólizas asociadas a este inmueble
  const polizasDelInmueble = polizas.filter(
    (p) => !p.inmuebleId || p.inmuebleId === incidencia.inmuebleId
  );
  // Control RBAC de gestión de responsabilidad
  const canEditResponsabilidad = canManageResponsabilidad(incidencia, currentUser);

  // Ejecutar Análisis Pericial con Inteligencia Artificial (asistencia consultiva, sin automatismo forzado)
  const handleEjecutarAnalisisIA = async () => {
    setAnalyzingIA(true);
    setIaError('');

    try {
      const resp = await fetch('/api/analizar-incidencia-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidencia,
          polizas,
        }),
      });

      if (!resp.ok) {
        throw new Error(`Error en el servidor: ${resp.statusText}`);
      }

      const data = await resp.json();
      if (!data.success || !data.analisis) {
        throw new Error(data.error || 'No se pudo generar el análisis');
      }

      const analisis: AnalisisIncidenciaIA = data.analisis;
      const userName = currentUser?.nombre || 'Sistema IA';

      // Guardar el análisis pericial IA como recomendación sin imponer automáticamente la decisión
      const updated: Incidencia = {
        ...incidencia,
        analisisIa: analisis,
        seguroEstado: (analisis.estimacionCoberturaSeguro as SeguroEstadoIncidencia) || incidencia.seguroEstado,
        seguroComprobacionNotas: analisis.fundamentoSeguro || incidencia.seguroComprobacionNotas,
        historial: [
          ...(incidencia.historial || []),
          crearHistorialItem(
            userName,
            'ANALISIS_IA_GENERADO',
            undefined,
            undefined,
            'Informe pericial orientativo y análisis legal LAU consultados con IA.'
          ),
        ],
        fechaActualizacion: new Date().toISOString(),
      };

      await onUpdateIncidencia(updated);
    } catch (err: any) {
      console.error('Error al solicitar análisis IA:', err);
      setIaError(err?.message || 'Error al conectar con el motor de análisis pericial');
    } finally {
      setAnalyzingIA(false);
    }
  };

  // Registro formal de la decisión de responsabilidad
  const handleGuardarResponsabilidad = async (nuevaResp?: ResponsabilidadIncidencia) => {
    const targetResp = nuevaResp || responsabilidad;
    setIsSaving(true);
    setSaveSuccessMsg('');
    try {
      const userName = currentUser?.nombre
        ? `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim()
        : 'Administrador';
      const now = new Date().toISOString();
      const historial = [...(incidencia.historial || [])];

      const respAnterior = incidencia.responsabilidad || 'PENDIENTE_DE_DETERMINAR';
      const labelNuevo = RESPONSABILIDAD_LABELS[targetResp]?.label || targetResp;

      let observacionHistorial = `Decisión de responsabilidad registrada: ${labelNuevo}.`;
      if (responsabilidadMotivo.trim()) {
        observacionHistorial += ` Motivo: ${responsabilidadMotivo.trim()}.`;
      }
      if (targetResp === 'GARANTIA' && responsabilidadGarantiaRef.trim()) {
        observacionHistorial += ` Ref. Garantía: ${responsabilidadGarantiaRef.trim()}.`;
      }
      if (targetResp === 'SEGURO' && polizaId) {
        const pol = polizas.find((p) => p.id === polizaId);
        if (pol) {
          observacionHistorial += ` Póliza: ${pol.aseguradora} (${pol.numeroPoliza}).`;
        }
      }
      if (targetResp === 'PROFESIONAL' && responsabilidadProfesionalId) {
        const prof = profesionales.find((p) => p.id === responsabilidadProfesionalId);
        if (prof) {
          observacionHistorial += ` Profesional: ${prof.nombreEmpresa || prof.nombreContacto}.`;
        }
      }
      if (responsabilidadNotas.trim()) {
        observacionHistorial += ` Observaciones: ${responsabilidadNotas.trim()}`;
      }

      historial.push(
        crearHistorialItem(
          userName,
          'ASIGNACION_RESPONSABILIDAD',
          respAnterior,
          targetResp,
          observacionHistorial
        )
      );

      const isPending = targetResp === 'PENDIENTE_DE_DETERMINAR';

      const updated: Incidencia = {
        ...incidencia,
        responsabilidad: targetResp,
        responsabilidadMotivo: responsabilidadMotivo.trim() || undefined,
        responsabilidadNotas: responsabilidadNotas.trim() || undefined,
        responsabilidadFechaDecision: isPending ? undefined : now,
        responsabilidadDecididoPor: isPending ? undefined : userName,
        responsabilidadGarantiaRef: targetResp === 'GARANTIA' ? (responsabilidadGarantiaRef.trim() || undefined) : undefined,
        polizaId: targetResp === 'SEGURO' ? (polizaId || undefined) : incidencia.polizaId,
        profesionalId: targetResp === 'PROFESIONAL' ? (responsabilidadProfesionalId || undefined) : incidencia.profesionalId,
        fechaActualizacion: now,
        actualizadoPor: userName,
        historial,
      };

      await onUpdateIncidencia(updated);
      setResponsabilidad(targetResp);
      setSaveSuccessMsg('Decisión de responsabilidad guardada y registrada en el historial.');
      setTimeout(() => setSaveSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Error al registrar la decisión de responsabilidad:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Guardar cambios rápidos de estado, responsabilidad o mantenimiento
  const handleGuardarCambios = async () => {
    setIsSaving(true);
    try {
      const userName = currentUser?.nombre
        ? `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim()
        : 'Administrador';
      const now = new Date().toISOString();
      const historial = [...(incidencia.historial || [])];

      if (estado !== incidencia.estado) {
        historial.push(
          crearHistorialItem(
            userName,
            'CAMBIO_ESTADO',
            incidencia.estado,
            estado,
            `Estado modificado a ${ESTADOS_INCIDENCIA_LABELS[estado].label}.`
          )
        );
      }

      const respAnterior = incidencia.responsabilidad || 'PENDIENTE_DE_DETERMINAR';
      if (responsabilidad !== respAnterior) {
        const labelNuevo = RESPONSABILIDAD_LABELS[responsabilidad]?.label || responsabilidad;
        let obs = `Responsabilidad modificada a ${labelNuevo}.`;
        if (responsabilidadMotivo.trim()) {
          obs += ` Motivo: ${responsabilidadMotivo.trim()}.`;
        }
        historial.push(
          crearHistorialItem(
            userName,
            'ASIGNACION_RESPONSABILIDAD',
            respAnterior,
            responsabilidad,
            obs
          )
        );
      }

      const profSeleccionado = profesionales.find((p) => p.id === profesionalId);
      const isPending = responsabilidad === 'PENDIENTE_DE_DETERMINAR';

      const updated: Incidencia = {
        ...incidencia,
        estado,
        fechaResolucion: (estado === 'RESUELTA' || estado === 'CERRADA') && !incidencia.fechaResolucion ? now : incidencia.fechaResolucion,
        solucionFinal: solucionFinal.trim() || undefined,
        responsabilidad,
        responsabilidadMotivo: responsabilidadMotivo.trim() || undefined,
        responsabilidadNotas: responsabilidadNotas.trim() || undefined,
        responsabilidadFechaDecision: isPending ? undefined : (incidencia.responsabilidadFechaDecision || now),
        responsabilidadDecididoPor: isPending ? undefined : (incidencia.responsabilidadDecididoPor || userName),
        responsabilidadGarantiaRef: responsabilidad === 'GARANTIA' ? (responsabilidadGarantiaRef.trim() || undefined) : undefined,
        polizaId: responsabilidad === 'SEGURO' ? (polizaId || undefined) : incidencia.polizaId,
        profesionalId: responsabilidad === 'PROFESIONAL' ? (responsabilidadProfesionalId || undefined) : incidencia.profesionalId,
        trabajoProfesional: profesionalId
          ? {
              profesionalId,
              nombreProfesional: profSeleccionado?.nombreEmpresa || profSeleccionado?.nombreContacto || 'Profesional Asignado',
              telefonoProfesional: profSeleccionado?.telefono,
              especialidad: profSeleccionado?.especialidadPrincipal,
              fechaAsignacion: incidencia.trabajoProfesional?.fechaAsignacion || now,
              estado: estadoTrabajo as any,
              presupuestoEstimado: presupuestoEstimado ? parseFloat(presupuestoEstimado) : undefined,
              costeReal: costeReal ? parseFloat(costeReal) : undefined,
              facturaNumero: facturaNumero.trim() || undefined,
            }
          : incidencia.trabajoProfesional,
        historial,
        fechaActualizacion: now,
        actualizadoPor: userName,
      };

      await onUpdateIncidencia(updated);
    } catch (err) {
      console.error('Error guardando cambios:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl my-6 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabecera Principal */}
        <div className="bg-slate-900 text-white p-5 sm:p-6 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    PRIORIDADES_INCIDENCIA_LABELS[incidencia.prioridad].badgeClass
                  }`}
                >
                  {PRIORIDADES_INCIDENCIA_LABELS[incidencia.prioridad].label}
                </span>
                <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full font-medium border border-slate-700">
                  {CATEGORIAS_INCIDENCIA_LABELS[incidencia.categoria].label}
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    RESPONSABILIDAD_LABELS[incidencia.responsabilidad || 'PENDIENTE_DE_DETERMINAR']?.badgeClass || 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {RESPONSABILIDAD_LABELS[incidencia.responsabilidad || 'PENDIENTE_DE_DETERMINAR']?.label || 'Responsabilidad'}
                </span>
                <span className="text-xs text-slate-400">
                  ID: #{incidencia.id.substring(incidencia.id.length - 6).toUpperCase()}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white leading-snug">
                {incidencia.titulo}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 pt-1">
                <div className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>{incidencia.inmuebleDireccion || 'Vivienda'}</span>
                </div>
                {incidencia.inquilinoNombre && (
                  <div className="flex items-center gap-1 text-slate-300">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>Inquilino: {incidencia.inquilinoNombre}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-slate-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{new Date(incidencia.fechaCreacion).toLocaleDateString('es-ES')}</span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Selector Rápido de Estado en la barra superior */}
          <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado:</span>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoIncidencia)}
                className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
              >
                {Object.entries(ESTADOS_INCIDENCIA_LABELS).map(([k, val]) => (
                  <option key={k} value={k}>
                    {val.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCrearTrabajoModal(true)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Generar orden de trabajo profesional para esta incidencia"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>+ Crear Orden de Trabajo</span>
              </button>

              <button
                onClick={handleGuardarCambios}
                disabled={isSaving}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Guardar Cambios</span>
              </button>
            </div>
          </div>
        </div>

        {/* Pestañas de Navegación */}
        <div className="border-b border-slate-200 bg-slate-50 px-6 flex items-center gap-2 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'general'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Ficha & Fotos</span>
          </button>

          <button
            onClick={() => setActiveTab('analisis_ia')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'analisis_ia'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span>Análisis Pericial IA</span>
            {incidencia.analisisIa && (
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('responsabilidad')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'responsabilidad'
                ? 'border-amber-600 text-amber-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Scale className="w-4 h-4 text-amber-500" />
            <span>Responsabilidad & LAU</span>
            {(!incidencia.responsabilidad || incidencia.responsabilidad === 'PENDIENTE_DE_DETERMINAR' || incidencia.responsabilidad === 'PENDIENTE_COMPROBACION' || incidencia.responsabilidad === 'INDETERMINADA') ? (
              <span className="w-2 h-2 rounded-full bg-amber-500" title="Pendiente de determinación" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-emerald-500" title="Decisión registrada" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('seguro')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'seguro'
                ? 'border-sky-600 text-sky-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-sky-500" />
            <span>Pólizas & Siniestro</span>
            {siniestroVinculado && (
              <span className="w-2 h-2 rounded-full bg-sky-500"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('mantenimiento')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'mantenimiento'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wrench className="w-4 h-4 text-emerald-500" />
            <span>Orden de Reparación</span>
          </button>

          <button
            onClick={() => setActiveTab('historial')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'historial'
                ? 'border-slate-600 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4 text-slate-500" />
            <span>Historial ({incidencia.historial?.length || 0})</span>
          </button>
        </div>

        {/* Contenido Dinámico de la Pestaña */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: GENERAL */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Descripción */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Descripción del Desperfecto
                </h3>
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {incidencia.descripcion}
                </p>
                {incidencia.observaciones && (
                  <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Notas adicionales: </span>
                    {incidencia.observaciones}
                  </div>
                )}
              </div>

              {/* Tarjeta Resumen de Decisión de Responsabilidad */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-amber-600" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Determinación de Responsabilidad
                    </h3>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      RESPONSABILIDAD_LABELS[incidencia.responsabilidad || 'PENDIENTE_DE_DETERMINAR']?.badgeClass || 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {RESPONSABILIDAD_LABELS[incidencia.responsabilidad || 'PENDIENTE_DE_DETERMINAR']?.label}
                  </span>
                </div>

                {(!incidencia.responsabilidad || incidencia.responsabilidad === 'PENDIENTE_DE_DETERMINAR' || incidencia.responsabilidad === 'PENDIENTE_COMPROBACION' || incidencia.responsabilidad === 'INDETERMINADA') ? (
                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg flex items-start justify-between gap-3 text-xs">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-amber-900">Pendiente de determinación formal</p>
                        <p className="text-amber-700 mt-0.5 leading-relaxed">
                          Aún no se ha registrado formalmente quién debe asumir la actuación o el coste (Propietario, Inquilino, Garantía, Seguro o Profesional).
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('responsabilidad')}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold rounded-lg shrink-0 cursor-pointer text-xs transition-colors"
                    >
                      Clasificar →
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Decisión registrada formalmente</span>
                      </div>
                      {incidencia.responsabilidadDecididoPor && (
                        <span className="text-slate-500">
                          Por: <strong className="text-slate-700">{incidencia.responsabilidadDecididoPor}</strong>
                          {incidencia.responsabilidadFechaDecision && ` el ${new Date(incidencia.responsabilidadFechaDecision).toLocaleDateString('es-ES')}`}
                        </span>
                      )}
                    </div>
                    {incidencia.responsabilidadMotivo && (
                      <p className="text-slate-700">
                        <span className="font-semibold text-slate-900">Motivo: </span>
                        {incidencia.responsabilidadMotivo}
                      </p>
                    )}
                    {incidencia.responsabilidadGarantiaRef && (
                      <div className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 font-medium">
                        <Award className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Garantía: {incidencia.responsabilidadGarantiaRef}</span>
                      </div>
                    )}
                    {incidencia.responsabilidad === 'SEGURO' && incidencia.polizaId && (
                      <div className="inline-flex items-center gap-1 text-sky-800 bg-sky-50 px-2.5 py-1 rounded border border-sky-200 font-medium ml-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                        <span>Póliza: {polizas.find((p) => p.id === incidencia.polizaId)?.aseguradora || 'Póliza Registrada'}</span>
                      </div>
                    )}
                    {incidencia.responsabilidad === 'PROFESIONAL' && incidencia.profesionalId && (
                      <div className="inline-flex items-center gap-1 text-teal-800 bg-teal-50 px-2.5 py-1 rounded border border-teal-200 font-medium ml-1">
                        <Wrench className="w-3.5 h-3.5 text-teal-600" />
                        <span>Profesional: {profesionales.find((p) => p.id === incidencia.profesionalId)?.nombreEmpresa || 'Técnico Asignado'}</span>
                      </div>
                    )}
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setActiveTab('responsabilidad')}
                        className="text-amber-700 hover:text-amber-800 font-bold underline cursor-pointer"
                      >
                        Ver detalles de la decisión →
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Inquilino e información de contacto */}
              {incidencia.inquilinoNombre && (
                <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-sm block">{incidencia.inquilinoNombre}</span>
                      <span className="text-blue-700">Inquilino / Reportador del parte</span>
                    </div>
                  </div>
                  {incidencia.inquilinoTelefono && (
                    <a
                      href={`tel:${incidencia.inquilinoTelefono}`}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-1.5 transition-colors shadow-xs"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{incidencia.inquilinoTelefono}</span>
                    </a>
                  )}
                </div>
              )}

              {/* Tarjeta de Circuito de Mantenimiento Profesional */}
              <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <Wrench className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Circuito de Mantenimiento Profesional
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {trabajosVinculados.length > 0
                          ? `${trabajosVinculados.length} orden(es) de trabajo vinculada(s) a esta incidencia`
                          : 'Incidencia sin orden de trabajo asignada'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCrearTrabajoModal(true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Nueva Orden</span>
                  </button>
                </div>

                {trabajosVinculados.length > 0 ? (
                  <div className="space-y-2 pt-1">
                    {trabajosVinculados.map((trab) => {
                      const estInfo = ESTADO_TRABAJO_LABELS[trab.estado] || ESTADO_TRABAJO_LABELS.PENDIENTE;
                      return (
                        <div
                          key={trab.id}
                          className="p-3 bg-slate-50 border border-slate-200 rounded-xl hover:border-emerald-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900">{trab.titulo}</span>
                              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${estInfo.badgeClass}`}>
                                {estInfo.label}
                              </span>
                              <span className="text-[11px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium">
                                {trab.categoria}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-3">
                              <span>Profesional: <strong className="text-slate-700">{trab.profesionalNombre || 'Sin asignar'}</strong></span>
                              <span>Solicitado: {new Date(trab.fechaSolicitud).toLocaleDateString('es-ES')}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={() => setTrabajoSeleccionadoDetalle(trab)}
                              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <span>Ver y Seguir</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Para enviar un profesional o perito a reparar esta avería, genera una orden de trabajo.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCrearTrabajoModal(true)}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs transition-colors shrink-0 ml-2 cursor-pointer"
                    >
                      Asignar Ahora
                    </button>
                  </div>
                )}
              </div>

              {/* Fotografías Adjuntas */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Fotografías del Daño ({incidencia.fotografias?.length || 0})
                  </h3>
                  <span className="text-xs text-slate-400">Clic para ampliar en alta resolución</span>
                </div>

                {incidencia.fotografias && incidencia.fotografias.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {incidencia.fotografias.map((foto) => (
                      <div
                        key={foto.id}
                        onClick={() => setSelectedPhotoUrl(foto.url)}
                        className="group relative rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100 cursor-pointer shadow-xs hover:shadow-md transition-shadow"
                      >
                        <img
                          src={foto.url}
                          alt={foto.nombre}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                          <Maximize2 className="w-5 h-5" />
                        </div>
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 text-[10px] text-white truncate">
                          {foto.nombre}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
                    No se han adjuntado fotografías del desperfecto todavía.
                  </div>
                )}
              </div>

              {/* Documentos Adjuntos */}
              {incidencia.documentos && incidencia.documentos.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Documentos y Facturas Adjuntas
                  </h3>
                  <div className="space-y-2">
                    {incidencia.documentos.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                          <span className="font-semibold text-slate-800 truncate">{doc.nombre}</span>
                          <span className="text-slate-400">
                            ({new Date(doc.fechaSubida).toLocaleDateString('es-ES')})
                          </span>
                        </div>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg flex items-center gap-1 font-medium transition-colors"
                        >
                          <span>Ver</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Registro de Cierre / Solución si está resuelta */}
              {(estado === 'RESUELTA' || estado === 'CERRADA') && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <h3 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Resolución Definitiva de la Incidencia</span>
                  </h3>
                  <textarea
                    rows={2}
                    value={solucionFinal}
                    onChange={(e) => setSolucionFinal(e.target.value)}
                    placeholder="Detalle la reparación efectuada (ej: Sustituido latiguillo de fontanería y sellada junta del fregadero. Sin filtración residual)..."
                    className="w-full p-2.5 bg-white border border-emerald-300 rounded-lg text-xs text-slate-900 focus:outline-none"
                  />
                  <div className="text-[11px] text-emerald-700">
                    Fecha de cierre: {incidencia.fechaResolucion ? new Date(incidencia.fechaResolucion).toLocaleString('es-ES') : 'Al guardar'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ANÁLISIS PERICIAL IA */}
          {activeTab === 'analisis_ia' && (
            <div className="space-y-5">
              {/* Disclaimer Mandatario Legal */}
              <div className="p-3.5 bg-amber-50/80 border border-amber-300/80 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong className="font-semibold block mb-0.5">
                    AVISO DE ASISTENCIA TÉCNICA ORIENTATIVA (IA)
                  </strong>
                  El presente dictamen es generado mediante análisis técnico asistido por inteligencia artificial y no sustituye el peritaje judicial colegiado, la inspección presencial de los servicios técnicos oficiales ni constituye asesoramiento jurídico vinculante.
                </div>
              </div>

              {/* Botón de Lanzamiento / Re-análisis */}
              <div className="flex items-center justify-between bg-purple-50/60 p-4 rounded-xl border border-purple-200">
                <div>
                  <h3 className="text-sm font-bold text-purple-950 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span>Motor de Análisis Pericial y Cobertura IA</span>
                  </h3>
                  <p className="text-xs text-purple-700 mt-0.5">
                    Analiza fotografías, descripción, tipología de rotura, pólizas vigentes y jurisprudencia LAU.
                  </p>
                </div>
                <button
                  onClick={handleEjecutarAnalisisIA}
                  disabled={analyzingIA}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-md shadow-purple-500/20 flex items-center gap-2 disabled:opacity-50 transition-all shrink-0"
                >
                  {analyzingIA ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Analizando avería...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>{incidencia.analisisIa ? 'Re-analizar con IA' : 'Ejecutar Análisis IA'}</span>
                    </>
                  )}
                </button>
              </div>

              {iaError && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{iaError}</span>
                </div>
              )}

              {/* Resultados del Análisis */}
              {incidencia.analisisIa ? (
                <div className="space-y-4">
                  {/* Resumen e Indicador de Urgencia */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Nivel de Riesgo Evaluado
                      </span>
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          incidencia.analisisIa.evaluacionUrgencia === 'CRITICA' || incidencia.analisisIa.evaluacionUrgencia === 'ALTA'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {incidencia.analisisIa.evaluacionUrgencia}
                      </span>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Responsabilidad Estimada
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {RESPONSABILIDAD_LABELS[incidencia.analisisIa.recomendacionResponsabilidad as ResponsabilidadIncidencia]?.label ||
                          incidencia.analisisIa.recomendacionResponsabilidad}
                      </span>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Cobertura Seguro Multirriesgo
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {SEGURO_ESTADO_LABELS[incidencia.analisisIa.estimacionCoberturaSeguro as SeguroEstadoIncidencia]?.label ||
                          incidencia.analisisIa.estimacionCoberturaSeguro}
                      </span>
                    </div>
                  </div>

                  {/* Diagnóstico y Causas Posibles */}
                  <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Diagnóstico Técnico y Causas Probables
                    </h4>
                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      {incidencia.analisisIa.resumenDiagnostico}
                    </p>

                    {incidencia.analisisIa.posiblesCausas && (
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        {incidencia.analisisIa.posiblesCausas.map((causaItem, idx) => {
                          const texto = typeof causaItem === 'string' ? causaItem : causaItem?.causa;
                          const prob = typeof causaItem === 'object' ? causaItem?.probabilidad : null;
                          return (
                            <div key={idx} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg">
                              <span className="text-slate-800">{texto}</span>
                              {prob && (
                                <span className="font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full text-[11px]">
                                  {prob}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Protocolo y Pasos Recomendados */}
                  {incidencia.analisisIa.pasosRecomendados && incidencia.analisisIa.pasosRecomendados.length > 0 && (
                    <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-2">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Protocolo de Actuación Recomendado
                      </h4>
                      <div className="space-y-2">
                        {incidencia.analisisIa.pasosRecomendados.map((paso, idx) => (
                          <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700">
                            <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                              {idx + 1}
                            </div>
                            <span className="pt-0.5 leading-relaxed">{paso}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fotos o Datos que faltan */}
                  {incidencia.analisisIa.informacionFaltante && incidencia.analisisIa.informacionFaltante.length > 0 && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2">
                      <h4 className="font-bold text-amber-900 uppercase tracking-wider">
                        Requerimientos para Completar el Peritaje
                      </h4>
                      <ul className="list-disc pl-5 space-y-1 text-amber-800">
                        {incidencia.analisisIa.informacionFaltante.map((info, idx) => (
                          <li key={idx}>{info}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Fundamento LAU y Seguro */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                    <h4 className="font-bold text-slate-800 uppercase tracking-wider">
                      Fundamento Jurídico (Ley de Arrendamientos Urbanos)
                    </h4>
                    <p className="text-slate-700 leading-relaxed">
                      {incidencia.analisisIa.fundamentoResponsabilidad}
                    </p>
                    {incidencia.analisisIa.fundamentoSeguro && (
                      <p className="text-slate-600 pt-2 border-t border-slate-200">
                        <strong className="text-slate-700">Dictamen de Póliza: </strong>
                        {incidencia.analisisIa.fundamentoSeguro}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                  <Sparkles className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No se ha ejecutado el análisis aún</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Pulsa &quot;Ejecutar Análisis IA&quot; para obtener un informe pericial instantáneo basado en fotos, descripción y cobertura de seguros.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RESPONSABILIDAD & LAU */}
          {activeTab === 'responsabilidad' && (
            <div className="space-y-6">
              {/* Tarjeta de Estado Actual de la Decisión */}
              {(!incidencia.responsabilidad || incidencia.responsabilidad === 'PENDIENTE_DE_DETERMINAR' || incidencia.responsabilidad === 'PENDIENTE_COMPROBACION' || incidencia.responsabilidad === 'INDETERMINADA') ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Sin Decisión Registrada — Pendiente de Determinar</span>
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Esta incidencia aún no tiene asignado formalmente quién debe asumir la actuación técnica o los costes.
                    Seleccione a continuación la parte responsable según el origen del daño, las coberturas o la normativa aplicable (LAU).
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-white border-2 border-emerald-200 rounded-xl shadow-xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Decisión Registrada Formalmente
                        </h4>
                        <span className="text-[11px] text-slate-500">
                          {incidencia.responsabilidadFechaDecision
                            ? `Fecha: ${new Date(incidencia.responsabilidadFechaDecision).toLocaleString('es-ES')}`
                            : 'Fecha no registrada'}
                          {incidencia.responsabilidadDecididoPor && ` • Registrado por: ${incidencia.responsabilidadDecididoPor}`}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${
                        RESPONSABILIDAD_LABELS[incidencia.responsabilidad]?.badgeClass || 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {RESPONSABILIDAD_LABELS[incidencia.responsabilidad]?.label}
                    </span>
                  </div>

                  {incidencia.responsabilidadMotivo && (
                    <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <span className="font-semibold text-slate-900">Motivo de la Decisión: </span>
                      {incidencia.responsabilidadMotivo}
                    </div>
                  )}

                  {incidencia.responsabilidadGarantiaRef && (
                    <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50/80 p-2.5 rounded-lg border border-emerald-200">
                      <Award className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        <strong className="text-emerald-900">Referencia de Garantía: </strong>
                        {incidencia.responsabilidadGarantiaRef}
                      </span>
                    </div>
                  )}

                  {incidencia.responsabilidad === 'SEGURO' && incidencia.polizaId && (
                    <div className="flex items-center gap-2 text-xs text-sky-800 bg-sky-50/80 p-2.5 rounded-lg border border-sky-200">
                      <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0" />
                      <span>
                        <strong className="text-sky-900">Póliza Asignada: </strong>
                        {polizas.find((p) => p.id === incidencia.polizaId)?.aseguradora || 'Póliza Registrada'}
                        {polizas.find((p) => p.id === incidencia.polizaId)?.numeroPoliza && ` (Nº ${polizas.find((p) => p.id === incidencia.polizaId)?.numeroPoliza})`}
                      </span>
                    </div>
                  )}

                  {incidencia.responsabilidad === 'PROFESIONAL' && incidencia.profesionalId && (
                    <div className="flex items-center gap-2 text-xs text-teal-800 bg-teal-50/80 p-2.5 rounded-lg border border-teal-200">
                      <Wrench className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>
                        <strong className="text-teal-900">Profesional Asignado: </strong>
                        {profesionales.find((p) => p.id === incidencia.profesionalId)?.nombreEmpresa || 'Profesional'}
                        {profesionales.find((p) => p.id === incidencia.profesionalId)?.especialidadPrincipal && ` (${profesionales.find((p) => p.id === incidencia.profesionalId)?.especialidadPrincipal})`}
                      </span>
                    </div>
                  )}

                  {incidencia.responsabilidadNotas && (
                    <div className="text-xs text-slate-600 italic">
                      &quot;{incidencia.responsabilidadNotas}&quot;
                    </div>
                  )}
                </div>
              )}

              {/* Selector de Clasificación de Responsabilidad */}
              <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Scale className="w-4 h-4 text-amber-600" />
                    <span>Seleccionar Clasificación de Responsabilidad</span>
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {canEditResponsabilidad ? 'Usuario autorizado para dictaminar' : 'Modo solo lectura'}
                  </span>
                </div>

                {/* Botones de las 6 categorías principales */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {/* PROPIETARIO */}
                  <button
                    type="button"
                    disabled={!canEditResponsabilidad}
                    onClick={() => setResponsabilidad('PROPIETARIO')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      responsabilidad === 'PROPIETARIO'
                        ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-300'
                        : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-indigo-200'
                    } ${!canEditResponsabilidad ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-indigo-900 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                        Propietario / Arrendador
                      </span>
                      {responsabilidad === 'PROPIETARIO' && <Check className="w-4 h-4 text-indigo-600 font-bold" />}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-tight">
                      Conservación, instalaciones fijas y habitabilidad (Art. 21.1 LAU).
                    </p>
                  </button>

                  {/* INQUILINO */}
                  <button
                    type="button"
                    disabled={!canEditResponsabilidad}
                    onClick={() => setResponsabilidad('INQUILINO')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      responsabilidad === 'INQUILINO'
                        ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300'
                        : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-amber-200'
                    } ${!canEditResponsabilidad ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-amber-900 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-amber-600" />
                        Inquilino / Arrendatario
                      </span>
                      {responsabilidad === 'INQUILINO' && <Check className="w-4 h-4 text-amber-600 font-bold" />}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-tight">
                      Pequeñas reparaciones por desgaste de uso ordinario o mal uso (Art. 21.4 LAU).
                    </p>
                  </button>

                  {/* GARANTIA */}
                  <button
                    type="button"
                    disabled={!canEditResponsabilidad}
                    onClick={() => setResponsabilidad('GARANTIA')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      responsabilidad === 'GARANTIA'
                        ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-300'
                        : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-emerald-200'
                    } ${!canEditResponsabilidad ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-emerald-900 flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-emerald-600" />
                        Garantía de Fabricante / Obra
                      </span>
                      {responsabilidad === 'GARANTIA' && <Check className="w-4 h-4 text-emerald-600 font-bold" />}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-tight">
                      Electrodoméstico o instalación cubierto por garantía oficial vigente.
                    </p>
                  </button>

                  {/* SEGURO */}
                  <button
                    type="button"
                    disabled={!canEditResponsabilidad}
                    onClick={() => setResponsabilidad('SEGURO')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      responsabilidad === 'SEGURO'
                        ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-300'
                        : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-sky-200'
                    } ${!canEditResponsabilidad ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-sky-900 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                        Seguro del Inmueble
                      </span>
                      {responsabilidad === 'SEGURO' && <Check className="w-4 h-4 text-sky-600 font-bold" />}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-tight">
                      Siniestro cubierto por la compañía aseguradora vinculada a la finca.
                    </p>
                  </button>

                  {/* PROFESIONAL */}
                  <button
                    type="button"
                    disabled={!canEditResponsabilidad}
                    onClick={() => setResponsabilidad('PROFESIONAL')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      responsabilidad === 'PROFESIONAL'
                        ? 'bg-teal-50 border-teal-400 ring-2 ring-teal-300'
                        : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-teal-200'
                    } ${!canEditResponsabilidad ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-teal-900 flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-teal-600" />
                        Profesional / Reparador
                      </span>
                      {responsabilidad === 'PROFESIONAL' && <Check className="w-4 h-4 text-teal-600 font-bold" />}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-tight">
                      Garantía de reparación técnica previa o subsanación de defecto de ejecución.
                    </p>
                  </button>

                  {/* PENDIENTE DE DETERMINAR */}
                  <button
                    type="button"
                    disabled={!canEditResponsabilidad}
                    onClick={() => setResponsabilidad('PENDIENTE_DE_DETERMINAR')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      responsabilidad === 'PENDIENTE_DE_DETERMINAR'
                        ? 'bg-yellow-50 border-yellow-400 ring-2 ring-yellow-300'
                        : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-yellow-200'
                    } ${!canEditResponsabilidad ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-yellow-900 flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-yellow-600" />
                        Pendiente de Determinar
                      </span>
                      {responsabilidad === 'PENDIENTE_DE_DETERMINAR' && <Check className="w-4 h-4 text-yellow-600 font-bold" />}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-tight">
                      Aún sin elementos concluyentes para dictaminar a quién corresponde.
                    </p>
                  </button>
                </div>

                {/* Desplegable para opciones complementarias (Comunidad / Tercero) */}
                <div className="pt-2 flex items-center gap-2 text-xs">
                  <span className="text-slate-500 font-medium">Otras partes:</span>
                  <button
                    type="button"
                    disabled={!canEditResponsabilidad}
                    onClick={() => setResponsabilidad('COMUNIDAD')}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                      responsabilidad === 'COMUNIDAD'
                        ? 'bg-purple-100 text-purple-900 border-purple-300'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Comunidad de Propietarios
                  </button>
                  <button
                    type="button"
                    disabled={!canEditResponsabilidad}
                    onClick={() => setResponsabilidad('TERCERO')}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                      responsabilidad === 'TERCERO'
                        ? 'bg-rose-100 text-rose-900 border-rose-300'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Tercero / Vecino Colindante
                  </button>
                </div>

                {/* Campos contextuales específicos según la categoría elegida */}
                {responsabilidad === 'GARANTIA' && (
                  <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3">
                    <label className="block text-xs font-bold text-emerald-900 uppercase tracking-wider">
                      Referencia de la Garantía
                    </label>
                    <input
                      type="text"
                      disabled={!canEditResponsabilidad}
                      value={responsabilidadGarantiaRef}
                      onChange={(e) => setResponsabilidadGarantiaRef(e.target.value)}
                      placeholder="ej. Garantía Caldera Saunier Duval modelo Thelia Condens hasta 12/2026, Factura #2024/089"
                      className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 font-medium"
                    />

                    {/* Ayuda contextual: Trabajos previos en el inmueble */}
                    {trabajosDelInmueble.length > 0 && (
                      <div className="pt-2 border-t border-emerald-200 space-y-1.5">
                        <span className="text-[11px] font-semibold text-emerald-950 block">
                          Reparaciones o trabajos previos registrados en este inmueble (posible garantía de obra):
                        </span>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {trabajosDelInmueble.slice(0, 4).map((trab) => (
                            <div
                              key={trab.id}
                              className="flex items-center justify-between p-2 bg-white/80 border border-emerald-200 rounded-lg text-xs"
                            >
                              <div className="truncate mr-2">
                                <span className="font-semibold text-slate-800">{trab.titulo}</span>
                                <span className="text-slate-500 text-[11px] block">
                                  {trab.profesionalNombre || 'Técnico'} • {new Date(trab.fechaCreacion).toLocaleDateString('es-ES')}
                                </span>
                              </div>
                              <button
                                type="button"
                                disabled={!canEditResponsabilidad}
                                onClick={() =>
                                  setResponsabilidadGarantiaRef(
                                    `Trabajo #${trab.id.substring(trab.id.length - 6).toUpperCase()} - ${trab.titulo} (${trab.profesionalNombre || 'Técnico'})`
                                  )
                                }
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold shrink-0 cursor-pointer"
                              >
                                Usar como ref.
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {responsabilidad === 'SEGURO' && (
                  <div className="p-4 bg-sky-50/60 border border-sky-200 rounded-xl space-y-3">
                    <label className="block text-xs font-bold text-sky-950 uppercase tracking-wider">
                      Póliza de Seguro Aplicable
                    </label>
                    <select
                      disabled={!canEditResponsabilidad}
                      value={polizaId}
                      onChange={(e) => setPolizaId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-sky-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400 font-semibold"
                    >
                      <option value="">-- Seleccione una póliza vinculada a este inmueble --</option>
                      {(polizasDelInmueble.length > 0 ? polizasDelInmueble : polizas).map((pol) => (
                        <option key={pol.id} value={pol.id}>
                          {pol.aseguradora} — {pol.tipo} (Póliza #{pol.numeroPoliza})
                        </option>
                      ))}
                    </select>

                    {polizaId && (
                      <div className="p-3 bg-white border border-sky-200 rounded-lg text-xs space-y-1">
                        {(() => {
                          const pol = polizas.find((p) => p.id === polizaId);
                          if (!pol) return null;
                          return (
                            <>
                              <div className="flex justify-between font-bold text-sky-950">
                                <span>{pol.aseguradora} — {pol.tipo}</span>
                                <span>Nº {pol.numeroPoliza}</span>
                              </div>
                              {pol.telefonoAsistencia && (
                                <p className="text-slate-600">
                                  Teléfono Asistencia 24h: <strong className="text-slate-800">{pol.telefonoAsistencia}</strong>
                                </p>
                              )}
                              {pol.coberturas && pol.coberturas.length > 0 && (
                                <p className="text-[11px] text-slate-500">
                                  Coberturas: {pol.coberturas.join(', ')}
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {responsabilidad === 'PROFESIONAL' && (
                  <div className="p-4 bg-teal-50/60 border border-teal-200 rounded-xl space-y-3">
                    <label className="block text-xs font-bold text-teal-950 uppercase tracking-wider">
                      Profesional Responsable (Garantía de Obra / Subsanación)
                    </label>
                    <select
                      disabled={!canEditResponsabilidad}
                      value={responsabilidadProfesionalId}
                      onChange={(e) => setResponsabilidadProfesionalId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-teal-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-400 font-semibold"
                    >
                      <option value="">-- Seleccione el profesional responsable --</option>
                      {profesionales.map((prof) => (
                        <option key={prof.id} value={prof.id}>
                          {prof.nombreEmpresa || prof.nombreContacto} — {prof.especialidadPrincipal}
                        </option>
                      ))}
                    </select>

                    {responsabilidadProfesionalId && (
                      <div className="p-3 bg-white border border-teal-200 rounded-lg text-xs space-y-1">
                        {(() => {
                          const prof = profesionales.find((p) => p.id === responsabilidadProfesionalId);
                          if (!prof) return null;
                          return (
                            <>
                              <div className="font-bold text-teal-950">
                                {prof.nombreEmpresa || prof.nombreContacto} ({prof.especialidadPrincipal})
                              </div>
                              {prof.telefono && (
                                <p className="text-slate-600">
                                  Teléfono: <strong className="text-slate-800">{prof.telefono}</strong>
                                </p>
                              )}
                              {prof.email && (
                                <p className="text-slate-600">
                                  Email: <strong className="text-slate-800">{prof.email}</strong>
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* Motivo sintético de la decisión */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Motivo Sintético de la Decisión
                  </label>
                  <input
                    type="text"
                    disabled={!canEditResponsabilidad}
                    value={responsabilidadMotivo}
                    onChange={(e) => setResponsabilidadMotivo(e.target.value)}
                    placeholder="ej. Rotura fortuita de instalación fija por fatiga de material según Art. 21.1 LAU"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none font-medium"
                  />
                </div>

                {/* Justificación jurídica / técnica y observaciones */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Observaciones y Justificación Detallada
                  </label>
                  <textarea
                    rows={3}
                    disabled={!canEditResponsabilidad}
                    value={responsabilidadNotas}
                    onChange={(e) => setResponsabilidadNotas(e.target.value)}
                    placeholder="Indique los antecedentes, acuerdo con las partes, informe del técnico o fundamentos aplicables..."
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
                  />
                </div>

                {/* Botón de guardado y confirmación */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
                  {saveSuccessMsg ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      {saveSuccessMsg}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-500">
                      La decisión se grabará en la ficha y en el historial de trazabilidad.
                    </span>
                  )}

                  {canEditResponsabilidad ? (
                    <button
                      type="button"
                      onClick={() => handleGuardarResponsabilidad(responsabilidad)}
                      disabled={isSaving}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span>Registrar Decisión de Responsabilidad</span>
                    </button>
                  ) : (
                    <div className="p-2 bg-slate-100 text-slate-600 text-xs rounded-lg font-medium">
                      Solo administradores y propietarios del inmueble pueden registrar decisiones de responsabilidad.
                    </div>
                  )}
                </div>
              </div>

              {/* Historial Específico de Decisiones de Responsabilidad */}
              <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-600" />
                    <span>Trazabilidad: Historial de Responsabilidad</span>
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Registro de cambios y asignaciones
                  </span>
                </div>

                {(() => {
                  const itemsResp = (incidencia.historial || []).filter(
                    (h) => h.accion === 'ASIGNACION_RESPONSABILIDAD' || h.accion === 'DECISION_RESPONSABILIDAD'
                  );

                  if (itemsResp.length === 0) {
                    return (
                      <p className="text-xs text-slate-500 italic py-2">
                        No se han registrado modificaciones previas de responsabilidad en el historial.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {itemsResp.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="font-bold text-slate-800">{item.usuario || 'Usuario'}</span>
                            <span className="text-[11px] text-slate-500">
                              {new Date(item.fecha).toLocaleString('es-ES')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <span className="font-semibold text-slate-500">
                              {RESPONSABILIDAD_LABELS[item.valorAnterior as ResponsabilidadIncidencia]?.label || item.valorAnterior || 'Inicial'}
                            </span>
                            <ChevronRight className="w-3 h-3 text-slate-400" />
                            <span className="font-bold text-slate-900">
                              {RESPONSABILIDAD_LABELS[item.valorNuevo as ResponsabilidadIncidencia]?.label || item.valorNuevo}
                            </span>
                          </div>
                          {item.observacion && (
                            <p className="text-slate-600 text-[11px] italic pt-0.5">
                              {item.observacion}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Marco Legal: Ley de Arrendamientos Urbanos (Art. 21) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Marco Legal: Ley de Arrendamientos Urbanos (Art. 21)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-white border border-slate-200 rounded-lg">
                    <strong className="text-indigo-900 block mb-1">Art. 21.1 — Propietario (Arrendador)</strong>
                    <p className="text-slate-600">
                      Obligado a realizar, sin elevar la renta, todas las reparaciones necesarias para conservar la vivienda en condiciones de habitabilidad, salvo deterioro imputable al inquilino.
                    </p>
                  </div>
                  <div className="p-3 bg-white border border-slate-200 rounded-lg">
                    <strong className="text-amber-900 block mb-1">Art. 21.4 — Inquilino (Arrendatario)</strong>
                    <p className="text-slate-600">
                      Las pequeñas reparaciones que exija el desgaste por el uso ordinario de la vivienda (bombillas, grifería suelta, filtros, correas de persiana) serán de cargo del arrendatario.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SEGURO & SINIESTROS */}
          {activeTab === 'seguro' && (
            <div className="space-y-6">
              {/* Resumen de Cobertura Automática */}
              <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-sky-950 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-sky-600" />
                    <span>Cotejo con Pólizas del Inmueble</span>
                  </h3>
                  <span className="text-xs font-bold text-sky-800 bg-sky-200/70 px-2.5 py-0.5 rounded-full">
                    {evaluacionSeguro.estado}
                  </span>
                </div>
                <p className="text-xs text-sky-900 leading-relaxed font-medium">
                  {evaluacionSeguro.explicacion}
                </p>

                {evaluacionSeguro.polizasAplicables.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-sky-200">
                    <span className="text-[11px] font-bold text-sky-900 uppercase">Pólizas Coincidentes:</span>
                    {evaluacionSeguro.polizasAplicables.map((pol) => (
                      <div key={pol.id} className="p-2.5 bg-white border border-sky-200 rounded-lg text-xs flex items-center justify-between">
                        <div>
                          <strong className="text-slate-800">{pol.aseguradora}</strong> ({pol.numeroPoliza}) • {pol.tipo}
                          {pol.contacto?.asistencia24h && (
                            <span className="block text-[11px] text-sky-700">
                              Asistencia 24h: <strong>{pol.contacto.asistencia24h}</strong>
                            </span>
                          )}
                        </div>
                        {pol.contacto?.asistencia24h && (
                          <a
                            href={`tel:${pol.contacto.asistencia24h}`}
                            className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors"
                          >
                            <Phone className="w-3 h-3" />
                            <span>Llamar</span>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Siniestro Formalizado */}
              <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Expediente de Siniestro con Aseguradora
                  </h3>
                  <button
                    onClick={() => onOpenSiniestroModal(incidencia, siniestroVinculado)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
                  >
                    <span>{siniestroVinculado ? 'Editar Siniestro' : 'Dar Parte a la Aseguradora'}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {siniestroVinculado ? (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Compañía:</span>
                        <strong className="text-slate-800">{siniestroVinculado.aseguradora}</strong>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Nº Expediente:</span>
                        <span className="font-mono text-slate-800 font-bold">{siniestroVinculado.numeroExpediente || 'Pendiente'}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Estado:</span>
                        <span className="font-bold text-indigo-700">{siniestroVinculado.estado}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Indemnizado:</span>
                        <span className="font-bold text-emerald-700">
                          {siniestroVinculado.indemnizacion !== undefined ? `${siniestroVinculado.indemnizacion} €` : '0 €'}
                        </span>
                      </div>
                    </div>

                    {siniestroVinculado.resolucion && (
                      <div className="pt-2 border-t border-slate-200 text-xs text-slate-600">
                        <strong className="text-slate-700">Dictamen pericial: </strong>
                        {siniestroVinculado.resolucion}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
                    No se ha tramitado ningún siniestro con la aseguradora para esta avería.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: MANTENIMIENTO & PROFESIONAL */}
          {activeTab === 'mantenimiento' && (
            <div className="space-y-6">
              <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4 shadow-xs">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Asignación de Profesional y Orden de Trabajo
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Profesional / Empresa Asignada
                    </label>
                    <select
                      value={profesionalId}
                      onChange={(e) => setProfesionalId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
                    >
                      <option value="">Sin profesional asignado</option>
                      {profesionales.map((prof) => (
                        <option key={prof.id} value={prof.id}>
                          {prof.nombreEmpresa || prof.nombreContacto} ({prof.especialidadPrincipal})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Estado de la Reparación
                    </label>
                    <select
                      value={estadoTrabajo}
                      onChange={(e) => setEstadoTrabajo(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none font-semibold"
                    >
                      <option value="ASIGNADO">Asignado</option>
                      <option value="PRESUPUESTADO">Presupuestado</option>
                      <option value="ACEPTADO">Aceptado</option>
                      <option value="EN_CURSO">En Curso / Ejecución</option>
                      <option value="FINALIZADO">Finalizado</option>
                      <option value="CANCELADO">Cancelado</option>
                    </select>
                  </div>
                </div>

                {/* Importes y Facturación */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Presupuesto (€)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={presupuestoEstimado}
                      onChange={(e) => setPresupuestoEstimado(e.target.value)}
                      placeholder="Ej: 150"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Coste Real Factura (€)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={costeReal}
                      onChange={(e) => setCosteReal(e.target.value)}
                      placeholder="Ej: 145.20"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Nº de Factura
                    </label>
                    <input
                      type="text"
                      value={facturaNumero}
                      onChange={(e) => setFacturaNumero(e.target.value)}
                      placeholder="Ej: FAC-2025/104"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Bloque 5: Órdenes de Trabajo Profesionales Desacopladas */}
              <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-blue-600" />
                      <span>Órdenes de Trabajo Profesionales Vinculadas</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Flujo técnico: adjudicación, partidas presupuestarias, seguimiento y valoración
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCrearTrabajoModal(true)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Nueva Orden Profesional</span>
                  </button>
                </div>

                {trabajosVinculados.length > 0 ? (
                  <div className="space-y-2.5">
                    {trabajosVinculados.map((trab) => {
                      const estInfo = ESTADO_TRABAJO_LABELS[trab.estado] || ESTADO_TRABAJO_LABELS.PENDIENTE;
                      const prioInfo = PRIORIDAD_TRABAJO_LABELS[trab.prioridad] || PRIORIDAD_TRABAJO_LABELS.NORMAL;

                      return (
                        <div
                          key={trab.id}
                          className="p-3 bg-slate-50 border border-slate-200 rounded-xl hover:border-blue-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                              <span className="font-bold text-slate-900">{trab.titulo}</span>
                              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${estInfo.badgeClass}`}>
                                {estInfo.label}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${prioInfo.badgeClass}`}>
                                {prioInfo.label}
                              </span>
                            </div>

                            <div className="flex items-center space-x-4 text-slate-500 text-[11px] mt-1">
                              <span>Técnico: <strong className="text-slate-700">{trab.profesionalNombre || 'Sin asignar'}</strong></span>
                              <span>Fecha: {new Date(trab.fechaSolicitud).toLocaleDateString('es-ES')}</span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-3 self-end sm:self-auto">
                            <div className="text-right">
                              <span className="font-bold text-slate-900 block">
                                {(trab.importeFinal || trab.importeEstimado || 0).toLocaleString('es-ES', {
                                  style: 'currency',
                                  currency: 'EUR',
                                })}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {trab.importeFinal ? 'Coste liquidado' : 'Estimado'}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setTrabajoSeleccionadoDetalle(trab)}
                              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg border border-blue-200 transition-colors cursor-pointer"
                            >
                              Ver Detalle
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50/70 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-500">
                    No hay órdenes de trabajo desacopladas asociadas a esta incidencia.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: HISTORIAL Y AUDITORÍA */}
          {activeTab === 'historial' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Trazabilidad Cronológica de Acciones y Cambios
              </h3>

              {incidencia.historial && incidencia.historial.length > 0 ? (
                <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200">
                  {incidencia.historial.map((h) => (
                    <div key={h.id} className="relative flex items-start gap-3 pl-8">
                      <div className="absolute left-2 top-1.5 w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow-xs"></div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs w-full">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-bold text-slate-800">{h.usuario}</span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(h.fecha).toLocaleString('es-ES')}
                          </span>
                        </div>
                        <p className="text-slate-600 font-medium">{h.observacion}</p>
                        {h.valorAnterior && h.valorNuevo && (
                          <div className="mt-1 text-[11px] text-slate-500">
                            <span className="line-through text-slate-400">{h.valorAnterior}</span> →{' '}
                            <span className="font-semibold text-blue-700">{h.valorNuevo}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
                  No hay registros de historial disponibles.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal de Foto Ampliada */}
        {selectedPhotoUrl && (
          <div
            onClick={() => setSelectedPhotoUrl(null)}
            className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          >
            <div className="relative max-w-4xl max-h-[90vh]">
              <img
                src={selectedPhotoUrl}
                alt="Foto ampliada"
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
              />
              <button
                onClick={() => setSelectedPhotoUrl(null)}
                className="absolute top-2 right-2 p-2 bg-black/60 text-white rounded-full hover:bg-black"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Modal Bloque 5: Crear Orden de Trabajo Profesional */}
        {showCrearTrabajoModal && (
          <TrabajoProfesionalModal
            isOpen={showCrearTrabajoModal}
            onClose={() => setShowCrearTrabajoModal(false)}
            inmuebles={inmuebles}
            incidencias={[incidencia]}
            profesionales={profesionales}
            currentUser={currentUser}
            incidenciaPreseleccionada={incidencia}
            onSaveSuccess={() => setShowCrearTrabajoModal(false)}
          />
        )}

        {/* Modal Bloque 5: Ficha Detallada del Trabajo Profesional */}
        {trabajoSeleccionadoDetalle && (
          <DetalleTrabajoProfesionalModal
            isOpen={!!trabajoSeleccionadoDetalle}
            onClose={() => setTrabajoSeleccionadoDetalle(null)}
            trabajo={trabajoSeleccionadoDetalle}
            presupuestos={presupuestosVinculados}
            profesionales={profesionales}
            inmuebles={inmuebles}
            incidencias={[incidencia]}
            currentUser={currentUser}
            onEditarTrabajo={() => {}}
            onCrearPresupuesto={(trab) => {
              setTrabajoParaPresupuesto(trab);
              setShowPresupuestoModal(true);
            }}
            onVerPresupuesto={(pres) => {
              setPresupuestoSeleccionadoDetalle(pres);
            }}
          />
        )}

        {/* Modal Bloque 5: Registrar Presupuesto Vinculado */}
        {showPresupuestoModal && (
          <PresupuestoProfesionalModal
            isOpen={showPresupuestoModal}
            onClose={() => {
              setShowPresupuestoModal(false);
              setTrabajoParaPresupuesto(null);
            }}
            trabajos={trabajosVinculados}
            profesionales={profesionales}
            inmuebles={inmuebles}
            currentUser={currentUser}
            trabajoPreseleccionado={trabajoParaPresupuesto}
            onSaveSuccess={() => {
              setShowPresupuestoModal(false);
              setTrabajoParaPresupuesto(null);
            }}
          />
        )}

        {/* Modal Bloque 5: Detalle y Aprobación/Rechazo de Presupuesto */}
        {presupuestoSeleccionadoDetalle && (
          <DetallePresupuestoProfesionalModal
            isOpen={!!presupuestoSeleccionadoDetalle}
            onClose={() => setPresupuestoSeleccionadoDetalle(null)}
            presupuesto={presupuestoSeleccionadoDetalle}
            trabajos={trabajosVinculados}
            profesionales={profesionales}
            inmuebles={inmuebles}
            currentUser={currentUser}
            onVerTrabajo={(trab) => {
              setPresupuestoSeleccionadoDetalle(null);
              setTrabajoSeleccionadoDetalle(trab);
            }}
          />
        )}
      </div>
    </div>
  );
};
