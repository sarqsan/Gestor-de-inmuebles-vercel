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
  Inmueble,
} from '../../types';
import {
  ESTADOS_INCIDENCIA_LABELS,
  PRIORIDADES_INCIDENCIA_LABELS,
  CATEGORIAS_INCIDENCIA_LABELS,
  RESPONSABILIDAD_LABELS,
  SEGURO_ESTADO_LABELS,
  crearHistorialItem,
} from '../../utils/incidenciasEngine';
import { evaluarCoberturaPolizas } from '../../utils/segurosEngine';
import {
  ESTADO_TRABAJO_LABELS,
  PRIORIDAD_TRABAJO_LABELS,
} from '../../utils/profesionalesEngine';
import { subscribeTrabajosProfesionales } from '../../lib/firebase';
import { TrabajoProfesionalModal } from './TrabajoProfesionalModal';
import { DetalleTrabajoProfesionalModal } from './DetalleTrabajoProfesionalModal';
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
  const [responsabilidad, setResponsabilidad] = useState<ResponsabilidadIncidencia>(incidencia.responsabilidad || 'PENDIENTE_COMPROBACION');
  const [responsabilidadNotas, setResponsabilidadNotas] = useState<string>(incidencia.responsabilidadNotas || '');
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

  // Bloque 5: Trabajos Profesionales Desacoplados vinculados
  const [trabajosVinculados, setTrabajosVinculados] = useState<TrabajoProfesional[]>([]);
  const [showCrearTrabajoModal, setShowCrearTrabajoModal] = useState<boolean>(false);
  const [trabajoSeleccionadoDetalle, setTrabajoSeleccionadoDetalle] = useState<TrabajoProfesional | null>(null);

  useEffect(() => {
    if (!isOpen || !incidencia?.id) return;
    const unsub = subscribeTrabajosProfesionales((data) => {
      const vinculados = data.filter((t) => t.incidenciaId === incidencia.id);
      setTrabajosVinculados(vinculados);
    });
    return () => unsub();
  }, [isOpen, incidencia?.id]);

  if (!isOpen) return null;

  // Evaluar cobertura con las pólizas vigentes
  const evaluacionSeguro = evaluarCoberturaPolizas(incidencia, polizas);
  // Buscar siniestro vinculado a esta incidencia si existe
  const siniestroVinculado = siniestros.find((s) => s.incidenciaId === incidencia.id);

  // Ejecutar Análisis Pericial con Inteligencia Artificial
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

      // Actualizar automáticamente la incidencia con el resultado
      const updated: Incidencia = {
        ...incidencia,
        analisisIa: analisis,
        responsabilidad: (analisis.recomendacionResponsabilidad as ResponsabilidadIncidencia) || incidencia.responsabilidad,
        responsabilidadNotas: analisis.fundamentoResponsabilidad || incidencia.responsabilidadNotas,
        seguroEstado: (analisis.estimacionCoberturaSeguro as SeguroEstadoIncidencia) || incidencia.seguroEstado,
        seguroComprobacionNotas: analisis.fundamentoSeguro || incidencia.seguroComprobacionNotas,
        historial: [
          ...(incidencia.historial || []),
          crearHistorialItem(
            userName,
            'ANALISIS_IA_GENERADO',
            undefined,
            undefined,
            'Análisis técnico pericial y comprobación legal LAU generados con IA.'
          ),
        ],
        fechaActualizacion: new Date().toISOString(),
      };

      await onUpdateIncidencia(updated);
      // Sincronizar estados locales
      if (analisis.recomendacionResponsabilidad) {
        setResponsabilidad(analisis.recomendacionResponsabilidad as ResponsabilidadIncidencia);
      }
      if (analisis.fundamentoResponsabilidad) {
        setResponsabilidadNotas(analisis.fundamentoResponsabilidad);
      }
    } catch (err: any) {
      console.error('Error al solicitar análisis IA:', err);
      setIaError(err?.message || 'Error al conectar con el motor de análisis pericial');
    } finally {
      setAnalyzingIA(false);
    }
  };

  // Guardar cambios rápidos de estado, responsabilidad o mantenimiento
  const handleGuardarCambios = async () => {
    setIsSaving(true);
    try {
      const userName = currentUser?.nombre || 'Administrador';
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

      if (responsabilidad !== incidencia.responsabilidad) {
        historial.push(
          crearHistorialItem(
            userName,
            'ASIGNACION_RESPONSABILIDAD',
            incidencia.responsabilidad,
            responsabilidad,
            responsabilidadNotas || 'Responsabilidad legal actualizada.'
          )
        );
      }

      const profSeleccionado = profesionales.find((p) => p.id === profesionalId);

      const updated: Incidencia = {
        ...incidencia,
        estado,
        fechaResolucion: (estado === 'RESUELTA' || estado === 'CERRADA') && !incidencia.fechaResolucion ? now : incidencia.fechaResolucion,
        solucionFinal: solucionFinal.trim() || undefined,
        responsabilidad,
        responsabilidadNotas: responsabilidadNotas.trim(),
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
          : undefined,
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

            <button
              onClick={handleGuardarCambios}
              disabled={isSaving}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>Guardar Cambios</span>
            </button>
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
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Marco Legal: Ley de Arrendamientos Urbanos (Art. 21)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-white border border-slate-200 rounded-lg">
                    <strong className="text-blue-900 block mb-1">Art. 21.1 — Propietario (Arrendador)</strong>
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

              {/* Asignación formal de Responsabilidad */}
              <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Determinación de Responsabilidad Económica
                </h3>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Responsable Asignado
                  </label>
                  <select
                    value={responsabilidad}
                    onChange={(e) => setResponsabilidad(e.target.value as ResponsabilidadIncidencia)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none font-semibold"
                  >
                    {Object.entries(RESPONSABILIDAD_LABELS).map(([k, val]) => (
                      <option key={k} value={k}>
                        {val.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Justificación y Fundamento de la Decisión
                  </label>
                  <textarea
                    rows={3}
                    value={responsabilidadNotas}
                    onChange={(e) => setResponsabilidadNotas(e.target.value)}
                    placeholder="Indique por qué se imputa a esta parte (ej. Avería de instalación fija sin negligencia demostrada según Art 21.1 LAU)..."
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
                  />
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
            presupuestos={[]}
            profesionales={profesionales}
            inmuebles={inmuebles}
            incidencias={[incidencia]}
            currentUser={currentUser}
            onEditarTrabajo={() => {}}
          />
        )}
      </div>
    </div>
  );
};
