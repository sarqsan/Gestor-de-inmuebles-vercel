import React, { useState, useMemo } from 'react';
import {
  X,
  Hammer,
  FileText,
  DollarSign,
  Users,
  Briefcase,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plus,
  Trash2,
  Edit2,
  TrendingUp,
  Receipt,
  Calendar,
  Layers,
  ArrowRight,
  ShieldAlert,
  FileCheck,
  Building,
  Sparkles,
} from 'lucide-react';
import {
  ProyectoReforma,
  PartidaReforma,
  Inmueble,
  Profesional,
  PresupuestoProfesional,
  TrabajoProfesional,
  Gasto,
  UsuarioApp,
  CategoriaPartidaReforma,
  EstadoProyectoReforma,
} from '../../types';
import {
  ESTADO_PROYECTO_REFORMA_LABELS,
  ESTADO_PARTIDA_LABELS,
  CATEGORIA_REFORMA_LABELS,
  calcularTotalesProyectoReforma,
  agregarPartidaAProyecto,
  modificarPartidaProyecto,
  eliminarPartidaProyecto,
  crearPresupuestoParaProyecto,
  compararPresupuestosProyecto,
  seleccionarPresupuestoProyecto,
  asignarProfesionalAProyecto,
  generarOrdenTrabajoDesdePartida,
  generarOrdenTrabajoGlobalProyecto,
  registrarCosteRealPartida,
  liquidarGastoDesdeProyecto,
  finalizarProyectoReforma,
  cancelarProyectoReforma,
} from '../../utils/reformasEngine';
import { buscarProfesionalesCompatibles } from '../../utils/profesionalesEngine';
import {
  saveProyectoReformaFirestore,
  savePresupuestoProfesionalFirestore,
  saveTrabajoProfesionalFirestore,
  saveGastoFirestore,
} from '../../lib/firebase';

interface DetalleProyectoReformaModalProps {
  isOpen: boolean;
  onClose: () => void;
  proyecto: ProyectoReforma;
  inmueble?: Inmueble;
  profesionales: Profesional[];
  presupuestos: PresupuestoProfesional[];
  trabajos: TrabajoProfesional[];
  gastos: Gasto[];
  currentUser?: UsuarioApp;
  onUpdateSuccess?: (proyectoActualizado: ProyectoReforma) => void;
  onAbrirOT?: (trabajo: TrabajoProfesional) => void;
  onAbrirPresupuesto?: (presupuesto: PresupuestoProfesional) => void;
}

type TabSeccion =
  | 'partidas'
  | 'presupuestos'
  | 'profesionales'
  | 'ordenes'
  | 'gastos'
  | 'cierre'
  | 'historial';

export const DetalleProyectoReformaModal: React.FC<DetalleProyectoReformaModalProps> = ({
  isOpen,
  onClose,
  proyecto: initialProyecto,
  inmueble,
  profesionales = [],
  presupuestos = [],
  trabajos = [],
  gastos = [],
  currentUser,
  onUpdateSuccess,
  onAbrirOT,
  onAbrirPresupuesto,
}) => {
  const [proyecto, setProyecto] = useState<ProyectoReforma>(initialProyecto);
  const [activeTab, setActiveTab] = useState<TabSeccion>('partidas');
  const [loading, setLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  // Modal para Añadir Partida
  const [showAddPartidaModal, setShowAddPartidaModal] = useState(false);
  const [partConcepto, setPartConcepto] = useState('');
  const [partCategoria, setPartCategoria] = useState<CategoriaPartidaReforma>('ALBANILERIA');
  const [partCantidad, setPartCantidad] = useState('1');
  const [partUnidad, setPartUnidad] = useState('ud');
  const [partPrecioEst, setPartPrecioEst] = useState('');

  // Modal para Registrar Coste Real de Partida
  const [selectedPartidaParaCoste, setSelectedPartidaParaCoste] = useState<PartidaReforma | null>(null);
  const [costeRealInput, setCosteRealInput] = useState('');

  // Modal para Adjudicación de Presupuesto
  const [selectedPptParaAdjudicar, setSelectedPptParaAdjudicar] = useState<PresupuestoProfesional | null>(null);
  const [motivoAdjudicacion, setMotivoAdjudicacion] = useState('');

  // Modal para Finalizar Reforma
  const [showFinalizarModal, setShowFinalizarModal] = useState(false);
  const [observacionesCierre, setObservacionesCierre] = useState('');

  const usuarioNombre = currentUser?.nombre || 'Gestor Operativo';

  const totales = useMemo(() => calcularTotalesProyectoReforma(proyecto), [proyecto]);

  const presupuestosDelProyecto = useMemo(
    () => presupuestos.filter((p) => p.trabajoId === proyecto.id || p.proyectoId === proyecto.id || proyecto.presupuestosIds?.includes(p.id)),
    [presupuestos, proyecto]
  );

  const comparativaPpt = useMemo(
    () => compararPresupuestosProyecto(presupuestosDelProyecto),
    [presupuestosDelProyecto]
  );

  const otsDelProyecto = useMemo(
    () => trabajos.filter((t) => t.proyectoId === proyecto.id || proyecto.ordenesTrabajoIds?.includes(t.id)),
    [trabajos, proyecto]
  );

  const gastosDelProyecto = useMemo(
    () => gastos.filter((g) => g.proyectoId === proyecto.id || g.origenId === proyecto.id || proyecto.gastosIds?.includes(g.id)),
    [gastos, proyecto]
  );

  const profesionalesCompatibles = useMemo(() => {
    if (!inmueble) return [];
    return buscarProfesionalesCompatibles({
      inmueble,
      profesionales,
      categoria: proyecto.categoria,
      servicioRequerido: proyecto.titulo,
      incluirNoCompatibles: true,
    });
  }, [inmueble, profesionales, proyecto]);

  if (!isOpen) return null;

  const showFeedback = (tipo: 'success' | 'error', texto: string) => {
    setFeedbackMsg({ tipo, texto });
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  const handleGuardarProyecto = async (actualizado: ProyectoReforma) => {
    setProyecto(actualizado);
    try {
      await saveProyectoReformaFirestore(actualizado);
      if (onUpdateSuccess) onUpdateSuccess(actualizado);
    } catch (err: any) {
      console.error('Error guardando proyecto de reforma:', err);
      showFeedback('error', 'Error al persistir cambios en Firestore.');
    }
  };

  // 1. Añadir Partida
  const handleCrearPartida = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partConcepto.trim()) return;

    const cant = parseFloat(partCantidad) || 1;
    const precio = parseFloat(partPrecioEst) || 0;

    const actualizado = agregarPartidaAProyecto({
      proyecto,
      partida: {
        concepto: partConcepto.trim(),
        categoria: partCategoria,
        cantidad: cant,
        unidad: partUnidad.trim() || 'ud',
        precioEstimado: precio,
        importeEstimado: cant * precio,
        estado: 'PENDIENTE',
      },
      usuarioNombre,
    });

    await handleGuardarProyecto(actualizado);
    setShowAddPartidaModal(false);
    setPartConcepto('');
    setPartPrecioEst('');
    showFeedback('success', 'Partida añadida correctamente al proyecto.');
  };

  // 2. Registrar Coste Real en Partida
  const handleRegistrarCostePartida = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartidaParaCoste) return;
    const importe = parseFloat(costeRealInput);
    if (isNaN(importe)) return;

    const actualizado = registrarCosteRealPartida({
      proyecto,
      partidaId: selectedPartidaParaCoste.id,
      costeReal: importe,
      usuarioNombre,
    });

    await handleGuardarProyecto(actualizado);
    setSelectedPartidaParaCoste(null);
    setCosteRealInput('');
    showFeedback('success', `Coste real de ${importe} € registrado en la partida.`);
  };

  // 3. Generar OT desde Partida
  const handleGenerarOTPartida = async (partida: PartidaReforma) => {
    try {
      setLoading(true);
      const res = generarOrdenTrabajoDesdePartida({
        proyecto,
        partidaId: partida.id,
        usuarioNombre,
      });

      await saveTrabajoProfesionalFirestore(res.trabajo);
      await handleGuardarProyecto(res.proyectoActualizado);
      showFeedback('success', `Orden de Trabajo #${res.trabajo.id} generada con éxito.`);
    } catch (err: any) {
      showFeedback('error', err?.message || 'Error al generar la orden de trabajo.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Adjudicar Presupuesto
  const handleAdjudicarPresupuesto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPptParaAdjudicar) return;
    if (!motivoAdjudicacion.trim()) {
      showFeedback('error', 'Debes indicar obligatoriamente una justificación para la adjudicación.');
      return;
    }

    try {
      setLoading(true);
      const res = seleccionarPresupuestoProyecto({
        proyecto,
        presupuestoSeleccionado: selectedPptParaAdjudicar,
        presupuestosDisponibles: presupuestosDelProyecto,
        usuarioNombre,
        motivoDecision: motivoAdjudicacion.trim(),
      });

      for (const ppt of res.presupuestosActualizados) {
        await savePresupuestoProfesionalFirestore(ppt);
      }
      await handleGuardarProyecto(res.proyectoActualizado);

      setSelectedPptParaAdjudicar(null);
      setMotivoAdjudicacion('');
      showFeedback('success', `Presupuesto adjudicado a ${selectedPptParaAdjudicar.profesionalNombre}.`);
    } catch (err: any) {
      showFeedback('error', err?.message || 'Error al adjudicar el presupuesto.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Liquidar Gasto de Explotación
  const handleLiquidarGasto = async () => {
    try {
      setLoading(true);
      const res = liquidarGastoDesdeProyecto({
        proyecto,
        gastosExistentes: gastos,
        usuarioNombre,
      });

      await saveGastoFirestore(res.gasto);
      await handleGuardarProyecto(res.proyectoActualizado);
      showFeedback(
        'success',
        res.yaExiste
          ? `Gasto sincronizado sin duplicidad (#${res.gasto.id}).`
          : `Gasto contable de explotación generado (#${res.gasto.id}) por ${res.gasto.importe} €.`
      );
    } catch (err: any) {
      showFeedback('error', err?.message || 'Error al liquidar gasto.');
    } finally {
      setLoading(false);
    }
  };

  // 6. Finalizar Reforma
  const handleFinalizarReforma = async () => {
    try {
      setLoading(true);
      const actualizado = finalizarProyectoReforma({
        proyecto,
        usuarioNombre,
        observacionesCierre: observacionesCierre.trim() || undefined,
        gastos,
        valoracionActualInmueble: inmueble?.valoracionEstimada || inmueble?.precio,
      });

      await handleGuardarProyecto(actualizado);
      setShowFinalizarModal(false);
      showFeedback('success', 'Proyecto de reforma finalizado formalmente con resumen de cierre.');
    } catch (err: any) {
      showFeedback('error', err?.message || 'Error al finalizar proyecto.');
    } finally {
      setLoading(false);
    }
  };

  const estadoInfo = ESTADO_PROYECTO_REFORMA_LABELS[proyecto.estado] || {
    label: proyecto.estado,
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl my-6 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/10 border border-purple-600/20 flex items-center justify-center text-purple-600">
              <Hammer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold text-slate-900">{proyecto.titulo}</h3>
                <span className={`px-2.5 py-0.5 text-2xs font-bold rounded-full border ${estadoInfo.badgeClass}`}>
                  {estadoInfo.label}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {inmueble?.alias || inmueble?.direccion || proyecto.inmuebleDireccion} • Ref: #{proyecto.id}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {proyecto.estado !== 'FINALIZADO' && proyecto.estado !== 'FINALIZADA' && (
              <button
                onClick={() => setShowFinalizarModal(true)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center space-x-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Finalizar Reforma</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback alert */}
        {feedbackMsg && (
          <div
            className={`px-6 py-2.5 text-xs font-semibold flex items-center space-x-2 ${
              feedbackMsg.tipo === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-b border-rose-200'
            }`}
          >
            {feedbackMsg.tipo === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedbackMsg.texto}</span>
          </div>
        )}

        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-slate-50/50 border-b border-slate-200">
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">
              Presupuesto Previsto
            </span>
            <span className="text-base font-bold text-slate-900">{totales.presupuestoPrevisto.toLocaleString()} €</span>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">
              Presupuesto Adjudicado
            </span>
            <span className="text-base font-bold text-indigo-600">
              {proyecto.presupuestoAdjudicadoImporte
                ? `${proyecto.presupuestoAdjudicadoImporte.toLocaleString()} €`
                : 'Sin adjudicar'}
            </span>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">
              Coste Real Liquidado
            </span>
            <span className="text-base font-bold text-slate-900">{totales.costeReal.toLocaleString()} €</span>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">
              Desviación Económica
            </span>
            <span
              className={`text-base font-bold ${
                totales.desviacionCoste > 0
                  ? 'text-rose-600'
                  : totales.desviacionCoste < 0
                  ? 'text-emerald-600'
                  : 'text-slate-700'
              }`}
            >
              {totales.desviacionCoste > 0 ? `+${totales.desviacionCoste.toLocaleString()} €` : `${totales.desviacionCoste.toLocaleString()} €`}
            </span>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">
              Partidas Ejecutadas
            </span>
            <span className="text-base font-bold text-purple-600">
              {totales.numPartidasCompletadas} / {totales.numPartidas} ({totales.porcentajeEjecucion}%)
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 border-b border-slate-200 flex space-x-1 overflow-x-auto bg-white">
          {[
            { id: 'partidas', label: 'Partidas de Obra', icon: Layers, count: (proyecto.partidas || []).length },
            { id: 'presupuestos', label: 'Presupuestos & Ofertas', icon: FileText, count: presupuestosDelProyecto.length },
            { id: 'profesionales', label: 'Profesionales', icon: Users, count: (proyecto.profesionalesAsignados || []).length },
            { id: 'ordenes', label: 'Órdenes de Trabajo', icon: Briefcase, count: otsDelProyecto.length },
            { id: 'gastos', label: 'Liquidación & Gastos', icon: Receipt, count: gastosDelProyecto.length },
            { id: 'cierre', label: 'Cierre & Patrimonio', icon: TrendingUp },
            { id: 'historial', label: 'Historial', icon: Clock, count: (proyecto.historial || []).length },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabSeccion)}
                className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-purple-600 text-purple-700 bg-purple-50/40'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-purple-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-2xs ${
                      isActive ? 'bg-purple-200 text-purple-900 font-bold' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: PARTIDAS DE OBRA */}
          {activeTab === 'partidas' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Desglose de Partidas Técnicas</h4>
                  <p className="text-xs text-slate-500">
                    Unidades de obra, materiales, estimaciones y control de ejecución real
                  </p>
                </div>
                <button
                  onClick={() => setShowAddPartidaModal(true)}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center space-x-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Añadir Partida</span>
                </button>
              </div>

              {(proyecto.partidas || []).length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
                  <Layers className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No hay partidas registradas en este proyecto</p>
                  <p className="text-2xs text-slate-500 mb-4">
                    Desglosa las actuaciones técnicas (albañilería, fontanería, pintura, cocina, etc.)
                  </p>
                  <button
                    onClick={() => setShowAddPartidaModal(true)}
                    className="px-3 py-1.5 bg-purple-600 text-white rounded-xl text-xs font-bold"
                  >
                    Crear Primera Partida
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <th className="py-2.5 px-3 font-bold">Concepto & Categoría</th>
                        <th className="py-2.5 px-3 font-bold">Medición</th>
                        <th className="py-2.5 px-3 font-bold">P. Estimado</th>
                        <th className="py-2.5 px-3 font-bold">Imp. Estimado</th>
                        <th className="py-2.5 px-3 font-bold">Coste Real</th>
                        <th className="py-2.5 px-3 font-bold">Estado</th>
                        <th className="py-2.5 px-3 font-bold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {proyecto.partidas.map((p) => {
                        const stInfo = ESTADO_PARTIDA_LABELS[p.estado] || {
                          label: p.estado,
                          badgeClass: 'bg-slate-100 text-slate-700',
                        };
                        return (
                          <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900">{p.concepto}</div>
                              <div className="text-2xs text-slate-500">{p.categoria}</div>
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-700">
                              {p.cantidad} {p.unidad}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">{p.precioEstimado} €</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{p.importeEstimado} €</td>
                            <td className="py-2.5 px-3">
                              {p.importeReal !== undefined ? (
                                <span className="font-bold text-emerald-700">{p.importeReal} €</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-md text-2xs font-semibold border ${stInfo.badgeClass}`}>
                                {stInfo.label}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">
                              <button
                                onClick={() => {
                                  setSelectedPartidaParaCoste(p);
                                  setCosteRealInput(p.importeReal?.toString() || p.importeEstimado.toString());
                                }}
                                title="Liquidar Coste Real"
                                className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-2xs font-bold transition-colors"
                              >
                                € Real
                              </button>
                              {!p.ordenTrabajoId && (
                                <button
                                  onClick={() => handleGenerarOTPartida(p)}
                                  title="Generar Orden de Trabajo Técnica"
                                  className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-2xs font-bold transition-colors"
                                >
                                  + OT
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  const act = eliminarPartidaProyecto({ proyecto, partidaId: p.id, usuarioNombre });
                                  handleGuardarProyecto(act);
                                }}
                                title="Eliminar Partida"
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PRESUPUESTOS & COMPARATIVA */}
          {activeTab === 'presupuestos' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Propuestas Económicas y Presupuestos</h4>
                  <p className="text-xs text-slate-500">
                    Comparativa competitiva de ofertas de profesionales y adjudicación formal
                  </p>
                </div>
              </div>

              {/* Summary of Quotes */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-2xs text-slate-500 block">Total Ofertas</span>
                  <span className="text-sm font-bold text-slate-900">{comparativaPpt.totalPropuestas} propuestas</span>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="text-2xs text-emerald-700 block">Importe Mínimo</span>
                  <span className="text-sm font-bold text-emerald-800">{comparativaPpt.importeMinimo.toLocaleString()} €</span>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <span className="text-2xs text-blue-700 block">Importe Medio</span>
                  <span className="text-sm font-bold text-blue-800">{comparativaPpt.importeMedio.toLocaleString()} €</span>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-2xs text-amber-700 block">Importe Máximo</span>
                  <span className="text-sm font-bold text-amber-800">{comparativaPpt.importeMaximo.toLocaleString()} €</span>
                </div>
              </div>

              {/* Proposals Table */}
              {presupuestosDelProyecto.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
                  <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No hay presupuestos recibidos aún para esta reforma</p>
                  <p className="text-2xs text-slate-500">
                    Ve a la pestaña de Profesionales para invitar o solicitar ofertas a candidatos compatibles.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {presupuestosDelProyecto.map((ppt) => {
                    const isAdjudicado = ppt.estado === 'ACEPTADO';
                    return (
                      <div
                        key={ppt.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isAdjudicado
                            ? 'bg-emerald-50/40 border-emerald-300 ring-2 ring-emerald-500/20'
                            : ppt.estado === 'RECHAZADO'
                            ? 'bg-slate-50/50 border-slate-200 opacity-75'
                            : 'bg-white border-slate-200 hover:border-purple-300'
                        }`}
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold text-slate-900">
                                {ppt.profesionalNombre || 'Profesional'}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-2xs font-bold border ${
                                  isAdjudicado
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : ppt.estado === 'RECHAZADO'
                                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                                    : 'bg-amber-100 text-amber-800 border-amber-300'
                                }`}
                              >
                                {ppt.estado}
                              </span>
                            </div>
                            <p className="text-2xs text-slate-500 mt-0.5">
                              #{ppt.numeroPresupuesto || ppt.id} • Validez: {ppt.validez} • {ppt.partidas?.length || 0} partidas
                            </p>
                          </div>

                          <div className="flex items-center space-x-4">
                            <div className="text-right">
                              <span className="text-2xs text-slate-400 block">Total con IVA</span>
                              <span className="text-base font-bold text-slate-900">{ppt.importeTotal.toLocaleString()} €</span>
                            </div>

                            <div className="flex items-center space-x-2">
                              {onAbrirPresupuesto && (
                                <button
                                  onClick={() => onAbrirPresupuesto(ppt)}
                                  className="px-3 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
                                >
                                  Ver Detalle
                                </button>
                              )}
                              {!isAdjudicado && ppt.estado !== 'RECHAZADO' && (
                                <button
                                  onClick={() => setSelectedPptParaAdjudicar(ppt)}
                                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Adjudicar</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PROFESIONALES COMPATIBLES */}
          {activeTab === 'profesionales' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Profesionales y Contratistas</h4>
                <p className="text-xs text-slate-500">
                  Candidatos evaluados por compatibilidad de especialidad técnica y cobertura geográfica
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {profesionalesCompatibles.map((res) => {
                  const prof = res.profesional;
                  const isPrincipal = proyecto.profesionalPrincipalId === prof.id;
                  const badgeClass =
                    res.nivel === 'COMPATIBLE'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : res.nivel === 'COMPATIBLE_CON_RESERVA'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-rose-100 text-rose-800 border-rose-200';

                  return (
                    <div
                      key={prof.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isPrincipal
                          ? 'bg-purple-50/50 border-purple-300 ring-2 ring-purple-500/20'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-slate-900">{prof.nombreComercial}</span>
                        <span className={`px-2 py-0.5 rounded-full text-2xs font-bold border ${badgeClass}`}>
                          {res.nivel === 'COMPATIBLE'
                            ? '✅ Compatible'
                            : res.nivel === 'COMPATIBLE_CON_RESERVA'
                            ? '⚠️ Con Reserva'
                            : '❌ No Compatible'}
                        </span>
                      </div>

                      <p className="text-2xs text-slate-500 mb-2">
                        {prof.tipo} • Esp: {prof.especialidades?.join(', ') || 'General'}
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-2xs text-slate-400">{res.detalles?.zona}</span>
                        <button
                          onClick={async () => {
                            const act = asignarProfesionalAProyecto({
                              proyecto,
                              profesional: prof,
                              usuarioNombre,
                              motivo: 'Asignación directa de contratista principal',
                            });
                            await handleGuardarProyecto(act);
                            showFeedback('success', `${prof.nombreComercial} asignado como responsable.`);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-2xs font-bold transition-colors ${
                            isPrincipal
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-slate-100 hover:bg-purple-600 hover:text-white text-slate-700'
                          }`}
                        >
                          {isPrincipal ? '✓ Responsable' : 'Asignar al Proyecto'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: ÓRDENES DE TRABAJO */}
          {activeTab === 'ordenes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Órdenes de Trabajo Técnicas</h4>
                  <p className="text-xs text-slate-500">
                    Intervenciones emitidas y vinculadas a la reforma para ejecución en vivienda
                  </p>
                </div>
                {profesionales[0] && (
                  <button
                    onClick={async () => {
                      const res = generarOrdenTrabajoGlobalProyecto({
                        proyecto,
                        profesional: profesionales.find((p) => p.id === proyecto.profesionalPrincipalId) || profesionales[0],
                        usuarioNombre,
                      });
                      await saveTrabajoProfesionalFirestore(res.trabajo);
                      await handleGuardarProyecto(res.proyectoActualizado);
                      showFeedback('success', `Orden global master #${res.trabajo.id} generada con éxito.`);
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center space-x-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Generar OT Master Global</span>
                  </button>
                )}
              </div>

              {otsDelProyecto.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
                  <Briefcase className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No hay órdenes de trabajo activas para esta reforma</p>
                  <p className="text-2xs text-slate-500">
                    Puedes generar OTs por partida individual o una OT global para toda la reforma.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {otsDelProyecto.map((ot) => (
                    <div
                      key={ot.id}
                      onClick={() => onAbrirOT && onAbrirOT(ot)}
                      className="p-3.5 bg-white border border-slate-200 hover:border-blue-400 rounded-xl flex items-center justify-between cursor-pointer transition-all"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-slate-900">{ot.titulo}</span>
                          <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            {ot.estado}
                          </span>
                        </div>
                        <p className="text-2xs text-slate-500 mt-0.5">
                          Técnico: {ot.profesionalNombre || 'Sin asignar'} • Est: {ot.importeEstimado || 0} €
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: GASTOS & LIQUIDACIÓN */}
          {activeTab === 'gastos' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Liquidación Económica de la Reforma</h4>
                  <p className="text-xs text-slate-500">
                    Transformación en Gastos de Explotación deducibles vinculados al inmueble
                  </p>
                </div>
                <button
                  onClick={handleLiquidarGasto}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center space-x-1.5"
                >
                  <Receipt className="w-4 h-4" />
                  <span>Liquidar como Gasto</span>
                </button>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600">Presupuesto Adjudicado:</span>
                  <span className="font-bold text-slate-900">
                    {proyecto.presupuestoAdjudicadoImporte || totales.presupuestoPrevisto} €
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600">Coste Real Acumulado:</span>
                  <span className="font-bold text-emerald-700">{totales.costeReal} €</span>
                </div>
                <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200">
                  <span className="font-bold text-slate-800">Desviación Total:</span>
                  <span
                    className={`font-bold ${
                      totales.desviacionCoste > 0
                        ? 'text-rose-600'
                        : totales.desviacionCoste < 0
                        ? 'text-emerald-600'
                        : 'text-slate-800'
                    }`}
                  >
                    {totales.desviacionCoste} €
                  </span>
                </div>
              </div>

              {/* Generated Expenses list */}
              {gastosDelProyecto.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-800 block">Apuntes Contables de Gasto Generados:</span>
                  {gastosDelProyecto.map((g) => (
                    <div
                      key={g.id}
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{g.concepto}</div>
                        <div className="text-2xs text-slate-500">
                          #{g.id} • Fecha: {g.fecha || g.fechaPago} • {g.categoria}
                        </div>
                      </div>
                      <span className="font-bold text-emerald-700">{g.importe} €</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-500">
                  No se han liquidado apuntes de gasto contable todavía.
                </div>
              )}
            </div>
          )}

          {/* TAB 6: CIERRE & PATRIMONIO */}
          {activeTab === 'cierre' && (
            <div className="space-y-5">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Resumen de Cierre e Impacto Patrimonial</h4>
                <p className="text-xs text-slate-500">
                  Histórico del proyecto y observación temporal de la valoración del inmueble
                </p>
              </div>

              {proyecto.resumenCierre ? (
                <div className="p-5 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-3">
                  <div className="flex items-center space-x-2 text-emerald-800 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Reforma Formalmente Finalizada el {new Date(proyecto.resumenCierre.fechaCierre).toLocaleDateString()}</span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-2">
                    <div>
                      <span className="text-2xs text-slate-500 block">Presupuesto Inicial</span>
                      <span className="font-bold text-slate-900">{proyecto.resumenCierre.presupuestoInicial} €</span>
                    </div>
                    <div>
                      <span className="text-2xs text-slate-500 block">Coste Real Final</span>
                      <span className="font-bold text-emerald-700">{proyecto.resumenCierre.costeRealFinal} €</span>
                    </div>
                    <div>
                      <span className="text-2xs text-slate-500 block">Desviación</span>
                      <span className="font-bold text-slate-900">{proyecto.resumenCierre.desviacionTotal} € ({proyecto.resumenCierre.desviacionPorcentaje}%)</span>
                    </div>
                    <div>
                      <span className="text-2xs text-slate-500 block">Cerrado Por</span>
                      <span className="font-bold text-slate-900">{proyecto.resumenCierre.cerradoPor}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                  El proyecto se encuentra en curso. Al pulsar "Finalizar Reforma" se consolidará el resumen de cierre definitivo.
                </div>
              )}

              {/* Patrimonial observation */}
              <div className="p-4 bg-purple-50/40 border border-purple-200 rounded-2xl space-y-3">
                <span className="text-xs font-bold text-purple-900 block">Observación Patrimonial Neutral</span>
                <p className="text-2xs text-purple-700">
                  El sistema registra el coste real desembolsado como inversión en el activo. Si se emite una tasación o valoración posterior, se registrará la variación sin presuponer causalidad económica automática.
                </p>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 bg-white rounded-lg border border-purple-100">
                    <span className="text-2xs text-slate-400 block">Valor Anterior</span>
                    <span className="font-bold text-slate-800">{inmueble?.valoracionEstimada || inmueble?.precio || 'N/D'} €</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-purple-100">
                    <span className="text-2xs text-slate-400 block">Coste Reforma</span>
                    <span className="font-bold text-purple-700">{totales.costeReal} €</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-purple-100">
                    <span className="text-2xs text-slate-400 block">Valor Posterior</span>
                    <span className="font-bold text-slate-800">Tasación Requerida</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: HISTORIAL */}
          {activeTab === 'historial' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Trazabilidad Cronológica Inmutable</h4>
                <p className="text-xs text-slate-500">Registro auditable de todas las actuaciones del proyecto</p>
              </div>

              <div className="space-y-3">
                {(proyecto.historial || []).map((h) => (
                  <div key={h.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-500 text-2xs">
                      <span className="font-bold text-purple-700">{h.accion}</span>
                      <span>{new Date(h.fecha).toLocaleString()} • Por {h.usuario}</span>
                    </div>
                    {h.observacion && <p className="text-slate-700 font-medium">{h.observacion}</p>}
                    {h.motivo && <p className="text-2xs text-slate-500 italic">Justificación: {h.motivo}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal: Añadir Partida */}
        {showAddPartidaModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4">
              <h4 className="text-base font-bold text-slate-900">Añadir Partida de Obra</h4>
              <form onSubmit={handleCrearPartida} className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Concepto / Actuación</label>
                  <input
                    type="text"
                    placeholder="Ej: Alicatado de paredes con azulejo porcelánico"
                    value={partConcepto}
                    onChange={(e) => setPartConcepto(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Categoría</label>
                    <select
                      value={partCategoria}
                      onChange={(e) => setPartCategoria(e.target.value as CategoriaPartidaReforma)}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white"
                    >
                      {['ALBANILERIA', 'ELECTRICIDAD', 'FONTANERIA', 'PINTURA', 'CARPINTERIA', 'CLIMATIZACION', 'COCINA', 'BANO', 'SUELO', 'VENTANAS', 'OTROS'].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Unidad</label>
                    <input
                      type="text"
                      placeholder="m2, ud, ml..."
                      value={partUnidad}
                      onChange={(e) => setPartUnidad(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Cantidad</label>
                    <input
                      type="number"
                      step="0.01"
                      value={partCantidad}
                      onChange={(e) => setPartCantidad(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Precio Estimado (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={partPrecioEst}
                      onChange={(e) => setPartPrecioEst(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-xl"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowAddPartidaModal(false)}
                    className="px-3 py-1.5 border rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-purple-600 text-white font-bold rounded-xl"
                  >
                    Guardar Partida
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Registrar Coste Real de Partida */}
        {selectedPartidaParaCoste && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4 text-xs">
              <h4 className="text-base font-bold text-slate-900">Coste Real de Partida</h4>
              <p className="text-slate-500">{selectedPartidaParaCoste.concepto}</p>
              <form onSubmit={handleRegistrarCostePartida} className="space-y-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Importe Real Liquidado (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={costeRealInput}
                    onChange={(e) => setCosteRealInput(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl text-sm font-bold"
                    required
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setSelectedPartidaParaCoste(null)}
                    className="px-3 py-1.5 border rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="px-4 py-1.5 bg-emerald-600 text-white font-bold rounded-xl">
                    Confirmar Coste
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Adjudicar Presupuesto */}
        {selectedPptParaAdjudicar && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4 text-xs">
              <h4 className="text-base font-bold text-slate-900">Adjudicar Presupuesto Formal</h4>
              <p className="text-slate-600">
                Se adjudicará la propuesta de <span className="font-bold">{selectedPptParaAdjudicar.profesionalNombre}</span> por importe de{' '}
                <span className="font-bold">{selectedPptParaAdjudicar.importeTotal} €</span>.
              </p>
              <form onSubmit={handleAdjudicarPresupuesto} className="space-y-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Motivo / Justificación de la Adjudicación (Obligatorio)</label>
                  <textarea
                    rows={3}
                    placeholder="Ej: Mejor relación calidad-precio y disponibilidad inmediata para inicio de obra."
                    value={motivoAdjudicacion}
                    onChange={(e) => setMotivoAdjudicacion(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setSelectedPptParaAdjudicar(null)}
                    className="px-3 py-1.5 border rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-1.5 bg-purple-600 text-white font-bold rounded-xl"
                  >
                    Adjudicar Contrato
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Finalizar Reforma */}
        {showFinalizarModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4 text-xs">
              <h4 className="text-base font-bold text-slate-900">Finalizar Proyecto de Reforma</h4>
              <p className="text-slate-600">
                Esta acción consolidará el cierre técnico y económico del proyecto con un coste real acumulado de{' '}
                <span className="font-bold text-emerald-700">{totales.costeReal} €</span>.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Observaciones de Cierre (Opcional)</label>
                  <textarea
                    rows={3}
                    placeholder="Indica notas sobre acabados, garantías, entrega de llaves o detalles de recepción de obra..."
                    value={observacionesCierre}
                    onChange={(e) => setObservacionesCierre(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowFinalizarModal(false)}
                    className="px-3 py-1.5 border rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleFinalizarReforma}
                    disabled={loading}
                    className="px-4 py-1.5 bg-emerald-600 text-white font-bold rounded-xl flex items-center space-x-1"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar Cierre</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
