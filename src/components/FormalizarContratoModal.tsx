import React, { useState, useEffect } from 'react';
import {
  Candidato,
  Inmueble,
  UserProfile,
  SolicitudDocumentacion,
  ContratoFormalizacion,
  ClausulaPersonalizada,
  EstadoFormalizacion,
  Propietario,
} from '../types';
import {
  crearBorradorContrato,
  evaluarAsegurabilidadCandidato,
  generarTextoContratoLAU,
  generarTextoActaEntrega,
  imprimirContratoPDF,
  getFormalizacionEstadoInfo,
} from '../utils/contratoEngine';
import { formatEuro } from '../utils/formatters';
import {
  X,
  ShieldCheck,
  FileText,
  Key,
  CheckCircle2,
  AlertTriangle,
  Send,
  Printer,
  Copy,
  Plus,
  Trash2,
  Calendar,
  Euro,
  Building2,
  User,
  Users,
  FileCheck2,
  Lock,
  Sparkles,
  ChevronRight,
  Info,
  CheckSquare,
  Clock,
} from 'lucide-react';

interface FormalizarContratoModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidato: Candidato;
  inmueble?: Inmueble;
  userProfile?: UserProfile;
  solicitudDoc?: SolicitudDocumentacion;
  existingContrato?: ContratoFormalizacion;
  propietarios?: Propietario[];
  onSaveContrato: (contrato: ContratoFormalizacion, marcarInmuebleAlquilado?: boolean) => Promise<void>;
  onDeleteContrato?: (contratoId: string) => Promise<void>;
}

export const FormalizarContratoModal: React.FC<FormalizarContratoModalProps> = ({
  isOpen,
  onClose,
  candidato,
  inmueble,
  userProfile,
  solicitudDoc,
  existingContrato,
  propietarios,
  onSaveContrato,
  onDeleteContrato,
}) => {
  const defaultInmueble: Inmueble = inmueble || {
    id: candidato.inmuebleId,
    nombre: candidato.inmuebleNombre || 'Inmueble',
    direccion: 'Calle Mayor, 10',
    ciudad: 'Madrid',
    precio: 900,
    fianzaMeses: 1,
    habitaciones: 2,
    banos: 1,
    superficie: 75,
    estado: 'disponible',
  };

  const [contrato, setContrato] = useState<ContratoFormalizacion>(() => {
    if (existingContrato) return existingContrato;
    return crearBorradorContrato(candidato, defaultInmueble, userProfile, solicitudDoc, propietarios);
  });

  const [activeTab, setActiveTab] = useState<'asegurabilidad' | 'contrato' | 'acta' | 'firmas'>('asegurabilidad');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [marcarAlquiladoCheckbox, setMarcarAlquiladoCheckbox] = useState<boolean>(false);

  // Nueva cláusula personalizada temp state
  const [nuevaClausulaTitulo, setNuevaClausulaTitulo] = useState('');
  const [nuevaClausulaContenido, setNuevaClausulaContenido] = useState('');
  const [showAddClausula, setShowAddClausula] = useState(false);
  const [clausulaModalMode, setClausulaModalMode] = useState<'ia' | 'manual'>('ia');
  const [iaPrompt, setIaPrompt] = useState('');
  const [isGeneratingIa, setIsGeneratingIa] = useState(false);
  const [iaError, setIaError] = useState<string | null>(null);
  const [iaResult, setIaResult] = useState<{
    titulo: string;
    contenido: string;
    categoria: string;
    validezLegal: string;
    analisisLegal: string;
    explicacionCambios?: string;
  } | null>(null);

  useEffect(() => {
    if (existingContrato) {
      setContrato(existingContrato);
    } else {
      setContrato(crearBorradorContrato(candidato, defaultInmueble, userProfile, solicitudDoc, propietarios));
    }
  }, [existingContrato, candidato.id, defaultInmueble.id, propietarios]);

  if (!isOpen) return null;

  const handleGenerarClausulaIA = async () => {
    if (!iaPrompt.trim()) return;
    setIsGeneratingIa(true);
    setIaError(null);
    setIaResult(null);

    try {
      const res = await fetch('/api/redactar-clausula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: iaPrompt.trim(),
          tipoInmueble: 'Vivienda habitual',
          renta: contrato.rentaMensual,
        }),
      });

      if (!res.ok) {
        throw new Error('Error al conectar con el asistente legal');
      }

      const data = await res.json();
      if (data.success && data.clausula) {
        setIaResult(data.clausula);
      } else {
        throw new Error(data.error || 'No se pudo generar la cláusula');
      }
    } catch (err: any) {
      setIaError(err.message || 'Error al generar la cláusula con IA');
    } finally {
      setIsGeneratingIa(false);
    }
  };

  const handleAceptarClausulaIA = () => {
    if (!iaResult) return;
    const newC: ClausulaPersonalizada = {
      id: `cl-ia-${Date.now()}`,
      titulo: iaResult.titulo,
      contenido: iaResult.contenido,
      activa: true,
      categoria: (iaResult.categoria as any) || 'general',
      generadaPorIa: true,
      analisisLegal: iaResult.analisisLegal,
      validezLegal: iaResult.validezLegal as any,
    };

    setContrato((prev) => ({
      ...prev,
      clausulasPersonalizadas: [...prev.clausulasPersonalizadas, newC],
      fechaActualizacion: new Date().toISOString(),
    }));

    setIaPrompt('');
    setIaResult(null);
    setShowAddClausula(false);
  };

  const handleUpdateField = <K extends keyof ContratoFormalizacion>(field: K, value: ContratoFormalizacion[K]) => {
    setContrato((prev) => ({
      ...prev,
      [field]: value,
      fechaActualizacion: new Date().toISOString(),
    }));
  };

  const handleUpdateActaField = (field: string, value: any) => {
    setContrato((prev) => ({
      ...prev,
      actaEntregaLlaves: {
        ...prev.actaEntregaLlaves,
        [field]: value,
      },
      fechaActualizacion: new Date().toISOString(),
    }));
  };

  const handleToggleClausula = (clausulaId: string) => {
    setContrato((prev) => ({
      ...prev,
      clausulasPersonalizadas: prev.clausulasPersonalizadas.map((c) =>
        c.id === clausulaId ? { ...c, activa: !c.activa } : c
      ),
      fechaActualizacion: new Date().toISOString(),
    }));
  };

  const handleAddClausula = () => {
    if (!nuevaClausulaTitulo.trim() || !nuevaClausulaContenido.trim()) return;
    const newC: ClausulaPersonalizada = {
      id: `cl-custom-${Date.now()}`,
      titulo: nuevaClausulaTitulo.trim(),
      contenido: nuevaClausulaContenido.trim(),
      activa: true,
      categoria: 'general',
    };
    setContrato((prev) => ({
      ...prev,
      clausulasPersonalizadas: [...prev.clausulasPersonalizadas, newC],
      fechaActualizacion: new Date().toISOString(),
    }));
    setNuevaClausulaTitulo('');
    setNuevaClausulaContenido('');
    setShowAddClausula(false);
  };

  const handleDeleteClausula = (id: string) => {
    setContrato((prev) => ({
      ...prev,
      clausulasPersonalizadas: prev.clausulasPersonalizadas.filter((c) => c.id !== id),
      fechaActualizacion: new Date().toISOString(),
    }));
  };

  const handleCambiarEstado = async (nuevoEstado: EstadoFormalizacion) => {
    const updated: ContratoFormalizacion = {
      ...contrato,
      estado: nuevoEstado,
      fechaActualizacion: new Date().toISOString(),
      historial: [
        ...contrato.historial,
        {
          id: `h-${Date.now()}`,
          fecha: new Date().toLocaleString('es-ES'),
          autor: 'propietario',
          accion: `Estado cambiado a ${getFormalizacionEstadoInfo(nuevoEstado).label}`,
          detalle: `El propietario actualizó el estado del contrato`,
        },
      ],
    };
    setContrato(updated);
    setIsSaving(true);
    await onSaveContrato(updated, nuevoEstado === 'FORMALIZADO_ACTIVO' || marcarAlquiladoCheckbox);
    setIsSaving(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onSaveContrato(contrato, marcarAlquiladoCheckbox);
    setIsSaving(false);
    onClose();
  };

  const estadoInfo = getFormalizacionEstadoInfo(contrato.estado);
  const evalAseg = contrato.evaluacionAsegurabilidad;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header Modal */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  Fase 3: Formalización
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${estadoInfo.badgeClass}`}>
                  {estadoInfo.label}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white mt-0.5">
                Formalización del Alquiler y Contrato LAU
              </h2>
              <p className="text-xs text-slate-300">
                Inquilino: <strong className="text-white">{contrato.candidatoNombre}</strong> · Inmueble:{' '}
                <strong className="text-white">{contrato.inmuebleNombre}</strong> ({formatEuro(contrato.rentaMensual)}/mes)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-100/90 border-b border-slate-200 p-2 sm:px-6 flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('asegurabilidad')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === 'asegurabilidad'
                ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>1. Scoring Seguro Impago</span>
          </button>

          <button
            onClick={() => setActiveTab('contrato')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === 'contrato'
                ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>2. Contrato LAU & Cláusulas</span>
          </button>

          <button
            onClick={() => setActiveTab('acta')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === 'acta'
                ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>3. Entrega Llaves & Contadores</span>
          </button>

          <button
            onClick={() => setActiveTab('firmas')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === 'firmas'
                ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>4. Firmas & Estado</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
          {/* TAB 1: ASEGURABILIDAD Y SCORING SEGURO DE IMPAGO */}
          {activeTab === 'asegurabilidad' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Card Dictamen */}
              <div
                className={`p-5 rounded-3xl border ${
                  evalAseg.dictamen === 'APTO_RECOMENDADO'
                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                    : evalAseg.dictamen === 'APTO_CON_CONDICIONES'
                    ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                    : 'bg-rose-50/80 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md ${
                        evalAseg.dictamen === 'APTO_RECOMENDADO'
                          ? 'bg-emerald-600 shadow-emerald-600/30'
                          : evalAseg.dictamen === 'APTO_CON_CONDICIONES'
                          ? 'bg-amber-600 shadow-amber-600/30'
                          : 'bg-rose-600 shadow-rose-600/30'
                      }`}
                    >
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider opacity-80">
                        Dictamen de Asegurabilidad (Seguro de Impago)
                      </div>
                      <h3 className="text-lg sm:text-xl font-black tracking-tight">
                        {evalAseg.dictamen === 'APTO_RECOMENDADO'
                          ? 'APTO Y RECOMENDADO PARA PÓLIZA DE IMPAGO'
                          : evalAseg.dictamen === 'APTO_CON_CONDICIONES'
                          ? 'APTO CON GARANTÍA O AVAL COMPLEMENTARIO'
                          : 'RIESGO ELEVADO - REQUIERE AVALISTA INDEFINIDO'}
                      </h3>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-xs opacity-75 font-semibold">Índice Solvencia</span>
                    <p className="text-2xl font-extrabold">{evalAseg.scoreSolvencia}/100</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-black/10 text-xs">
                  <div>
                    <span className="opacity-75">Ratio de Esfuerzo</span>
                    <p className="text-base font-extrabold">{evalAseg.ratioEsfuerzo}%</p>
                    <span className="text-[10px] opacity-75">(Límite rec. &le; 35%)</span>
                  </div>
                  <div>
                    <span className="opacity-75">Ingresos Mensuales</span>
                    <p className="text-base font-extrabold">{formatEuro(evalAseg.ingresosNetosMensuales)}</p>
                    <span className="text-[10px] opacity-75">Sobrante: {formatEuro(evalAseg.ingresosSobrantes)}</span>
                  </div>
                  <div>
                    <span className="opacity-75">Estabilidad</span>
                    <p className="text-base font-extrabold">
                      {evalAseg.antiguedadSuficiente ? 'Adecuada' : 'A verificar'}
                    </p>
                    <span className="text-[10px] opacity-75">{candidato.tipoContrato || 'Indefinido'}</span>
                  </div>
                  <div>
                    <span className="opacity-75">Docs Validados</span>
                    <p className="text-base font-extrabold">
                      {evalAseg.documentosValidadosCount} documento(s)
                    </p>
                    <span className="text-[10px] opacity-75">
                      {evalAseg.documentosObligatoriosCompletos ? '✓ Completo' : '⚠️ Pendiente'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Puntos y Recomendaciones */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Puntos Favorables
                  </h4>
                  <ul className="space-y-2 text-xs text-slate-600">
                    {evalAseg.puntosPositivos.map((p, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold">✓</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Factores a Considerar & Recomendaciones
                  </h4>
                  <ul className="space-y-2 text-xs text-slate-600">
                    {evalAseg.recomendaciones.map((r, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-amber-500 font-bold">&bull;</span>
                        <span>{r}</span>
                      </li>
                    ))}
                    {evalAseg.factoresRiesgo.map((f, idx) => (
                      <li key={`f-${idx}`} className="flex items-start gap-2 text-rose-700">
                        <span className="font-bold">⚠️</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Simulación de Coberturas de Seguro de Impago */}
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-3xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-100/80 px-2.5 py-0.5 rounded-full">
                      <Sparkles className="w-3 h-3" /> Cobertura Sugerida de Seguro de Impago
                    </span>
                    <h4 className="text-sm sm:text-base font-extrabold text-slate-900 mt-1">
                      Estimación de Prima y Garantías (SEAG / Aseguradoras del Alquiler)
                    </h4>
                  </div>
                  <div className="text-left sm:text-right bg-white p-3 rounded-2xl border border-indigo-200">
                    <span className="text-[11px] text-slate-500 font-medium">Prima orientativa</span>
                    <p className="text-lg font-black text-indigo-700">
                      {formatEuro(evalAseg.primaEstimadaAnual)} / año
                    </p>
                    <span className="text-[10px] text-slate-400 font-medium">
                      (~{formatEuro(evalAseg.primaEstimadaMensual)}/mes aprox)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white p-3.5 rounded-2xl border border-indigo-100">
                    <span className="text-slate-500 font-semibold">Meses de Impago Cubiertos</span>
                    <p className="text-sm font-extrabold text-slate-900 mt-0.5">Hasta 12 meses de renta</p>
                    <p className="text-[10px] text-slate-400 mt-1">Sin franquicia tras el primer mes impagado</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-2xl border border-indigo-100">
                    <span className="text-slate-500 font-semibold">Defensa Jurídica y Desahucio</span>
                    <p className="text-sm font-extrabold text-slate-900 mt-0.5">Hasta 3.000 € incluidos</p>
                    <p className="text-[10px] text-slate-400 mt-1">Abogado y procurador para tramitación</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-2xl border border-indigo-100">
                    <span className="text-slate-500 font-semibold">Actos Vandálicos al Inmueble</span>
                    <p className="text-sm font-extrabold text-slate-900 mt-0.5">Hasta 3.000 € de cobertura</p>
                    <p className="text-[10px] text-slate-400 mt-1">Protección ante daños deliberados</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CONFIGURACIÓN DEL CONTRATO LAU */}
          {activeTab === 'contrato' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Sección 1: Datos de las partes */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  1. Datos de las Partes y Notificaciones
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Arrendador Principal */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Parte Arrendadora (Propietario 1)</span>
                      {contrato.propietarioEsPersonaJuridica && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-md">Sociedad / Empresa</span>
                      )}
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500">Nombre / Razón Social</label>
                      <input
                        type="text"
                        value={contrato.propietarioNombre}
                        onChange={(e) => handleUpdateField('propietarioNombre', e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2 bg-white border border-slate-200 rounded-xl mt-0.5"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500">DNI / CIF</label>
                        <input
                          type="text"
                          value={contrato.propietarioDni}
                          onChange={(e) => handleUpdateField('propietarioDni', e.target.value)}
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl mt-0.5"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500">Teléfono</label>
                        <input
                          type="text"
                          value={contrato.propietarioTelefono}
                          onChange={(e) => handleUpdateField('propietarioTelefono', e.target.value)}
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl mt-0.5"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500">Domicilio Notificaciones</label>
                      <input
                        type="text"
                        value={contrato.propietarioDireccion}
                        onChange={(e) => handleUpdateField('propietarioDireccion', e.target.value)}
                        className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl mt-0.5"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500">IBAN para Pago de Renta</label>
                      <input
                        type="text"
                        value={contrato.propietarioIban}
                        onChange={(e) => handleUpdateField('propietarioIban', e.target.value)}
                        className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-200 rounded-xl mt-0.5"
                      />
                    </div>

                    {/* Botón para añadir/quitar segundo propietario */}
                    <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer text-[11px] font-semibold text-indigo-900">
                        <input
                          type="checkbox"
                          checked={contrato.tieneSegundoPropietario}
                          onChange={(e) => handleUpdateField('tieneSegundoPropietario', e.target.checked)}
                          className="w-3.5 h-3.5 text-indigo-600 rounded"
                        />
                        <span>Añadir 2º Propietario / Arrendador</span>
                      </label>
                    </div>

                    {/* Formulario 2º Propietario */}
                    {contrato.tieneSegundoPropietario && (
                      <div className="bg-white p-3 rounded-xl border border-indigo-100 space-y-2 mt-2">
                        <span className="text-[11px] font-bold text-indigo-950">Datos Segundo Propietario</span>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500">Nombre Completo</label>
                          <input
                            type="text"
                            placeholder="Nombre del copropietario"
                            value={contrato.segundoPropietarioNombre || ''}
                            onChange={(e) => handleUpdateField('segundoPropietarioNombre', e.target.value)}
                            className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500">DNI / NIF</label>
                            <input
                              type="text"
                              placeholder="DNI/NIE"
                              value={contrato.segundoPropietarioDni || ''}
                              onChange={(e) => handleUpdateField('segundoPropietarioDni', e.target.value)}
                              className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500">Teléfono</label>
                            <input
                              type="text"
                              placeholder="Teléfono"
                              value={contrato.segundoPropietarioTelefono || ''}
                              onChange={(e) => handleUpdateField('segundoPropietarioTelefono', e.target.value)}
                              className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Arrendatario */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
                    <span className="text-xs font-bold text-slate-800">Parte Arrendataria (Inquilino)</span>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500">Nombre Completo</label>
                      <input
                        type="text"
                        value={contrato.candidatoNombre}
                        onChange={(e) => handleUpdateField('candidatoNombre', e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2 bg-white border border-slate-200 rounded-xl mt-0.5"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500">DNI / NIE</label>
                        <input
                          type="text"
                          value={contrato.candidatoDni}
                          onChange={(e) => handleUpdateField('candidatoDni', e.target.value)}
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl mt-0.5"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500">Teléfono</label>
                        <input
                          type="text"
                          value={contrato.candidatoTelefono}
                          onChange={(e) => handleUpdateField('candidatoTelefono', e.target.value)}
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl mt-0.5"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500">Email de Contacto</label>
                      <input
                        type="email"
                        value={contrato.candidatoEmail}
                        onChange={(e) => handleUpdateField('candidatoEmail', e.target.value)}
                        className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl mt-0.5"
                      />
                    </div>

                    {contrato.tieneCotitular && (
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2 mt-2">
                        <span className="text-[11px] font-bold text-slate-800">Cotitular Solidario</span>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Nombre Cotitular"
                            value={contrato.cotitularNombre}
                            onChange={(e) => handleUpdateField('cotitularNombre', e.target.value)}
                            className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                          />
                          <input
                            type="text"
                            placeholder="DNI Cotitular"
                            value={contrato.cotitularDni || ''}
                            onChange={(e) => handleUpdateField('cotitularDni', e.target.value)}
                            className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sección 2: Condiciones Económicas y Plazos */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Euro className="w-4 h-4 text-emerald-600" />
                  2. Condiciones Económicas, Fianza y Vigencia
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Renta Mensual (€)</label>
                    <input
                      type="number"
                      value={contrato.rentaMensual}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        handleUpdateField('rentaMensual', val);
                        handleUpdateField('fianzaLegalImporte', val * contrato.fianzaLegalMeses);
                      }}
                      className="w-full text-sm font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700">Fianza Legal (Art. 36.1 LAU)</label>
                    <div className="flex items-center gap-2 mt-1">
                      <select
                        value={contrato.fianzaLegalMeses}
                        onChange={(e) => {
                          const meses = parseInt(e.target.value);
                          handleUpdateField('fianzaLegalMeses', meses);
                          handleUpdateField('fianzaLegalImporte', contrato.rentaMensual * meses);
                        }}
                        className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        <option value={1}>1 mes ({formatEuro(contrato.rentaMensual)})</option>
                        <option value={2}>2 meses ({formatEuro(contrato.rentaMensual * 2)})</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700">Garantía Adicional (Art. 36.5)</label>
                    <select
                      value={contrato.garantiaAdicionalMeses}
                      onChange={(e) => {
                        const meses = parseInt(e.target.value);
                        handleUpdateField('garantiaAdicionalMeses', meses);
                        handleUpdateField('garantiaAdicionalImporte', contrato.rentaMensual * meses);
                      }}
                      className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl mt-1"
                    >
                      <option value={0}>Sin garantía adicional (0 €)</option>
                      <option value={1}>1 mes adicional ({formatEuro(contrato.rentaMensual)})</option>
                      <option value={2}>2 meses adicionales ({formatEuro(contrato.rentaMensual * 2)})</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Fecha de Inicio de Contrato</label>
                    <input
                      type="date"
                      value={contrato.fechaInicioContrato}
                      onChange={(e) => handleUpdateField('fechaInicioContrato', e.target.value)}
                      className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Referencia Catastral</label>
                    <input
                      type="text"
                      value={contrato.inmuebleReferenciaCatastral || ''}
                      onChange={(e) => handleUpdateField('inmuebleReferenciaCatastral', e.target.value)}
                      placeholder="Ej. 9876543VK4797S0001TR"
                      className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Sección 3: Cláusulas personalizadas y Redacción con IA */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      3. Cláusulas y Condiciones del Contrato
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Personaliza o añade cláusulas con revisión legal automática según la LAU.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setShowAddClausula(true);
                        setClausulaModalMode('ia');
                      }}
                      className="text-xs font-bold px-3 py-1.5 bg-linear-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:opacity-90 flex items-center gap-1.5 shadow-2xs transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Redactar con IA</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowAddClausula(true);
                        setClausulaModalMode('manual');
                      }}
                      className="text-xs font-bold px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Manual</span>
                    </button>
                  </div>
                </div>

                {/* Formulario / Asistente para añadir cláusula */}
                {showAddClausula && (
                  <div className="bg-linear-to-b from-indigo-50/90 to-purple-50/50 border border-indigo-200 p-5 rounded-2xl space-y-4 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setClausulaModalMode('ia')}
                          className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                            clausulaModalMode === 'ia'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-white text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Asistente IA (Validación Legal LAU)</span>
                        </button>
                        <button
                          onClick={() => setClausulaModalMode('manual')}
                          className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                            clausulaModalMode === 'manual'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-white text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <span>Redacción Manual</span>
                        </button>
                      </div>
                      <button
                        onClick={() => setShowAddClausula(false)}
                        className="text-slate-400 hover:text-slate-600 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {clausulaModalMode === 'ia' ? (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-bold text-indigo-950 block mb-1">
                            ¿Qué deseas pactar o exigir en la cláusula?
                          </label>
                          <textarea
                            placeholder="Ej: Quiero que el inquilino no pueda tener perros grandes, o que si se va antes de 1 año tenga penalización conforme a la ley..."
                            value={iaPrompt}
                            onChange={(e) => setIaPrompt(e.target.value)}
                            rows={3}
                            className="w-full text-xs p-3 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-hidden"
                          />
                          <p className="text-[10px] text-indigo-700/80 mt-1">
                            La IA redactará la cláusula adaptándola rigurosamente a la Ley 29/1994 (LAU) y descartará términos nulos de pleno derecho.
                          </p>
                        </div>

                        {iaError && (
                          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>{iaError}</span>
                          </div>
                        )}

                        <div className="flex justify-end gap-2">
                          <button
                            onClick={handleGenerarClausulaIA}
                            disabled={isGeneratingIa || !iaPrompt.trim()}
                            className="px-4 py-2 bg-linear-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-2 shadow-xs"
                          >
                            {isGeneratingIa ? (
                              <>
                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>Redactando conforme a ley...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Generar Cláusula Legal</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Resultado IA preview */}
                        {iaResult && (
                          <div className="bg-white border border-indigo-200 p-4 rounded-xl space-y-3 mt-3 shadow-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold text-slate-900">{iaResult.titulo}</span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  iaResult.validezLegal === 'LEGAL_VALIDA'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : iaResult.validezLegal === 'AJUSTADA_PARA_LEGALIDAD'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                                }`}
                              >
                                {iaResult.validezLegal === 'LEGAL_VALIDA' && '✓ Totalmente Legal (LAU)'}
                                {iaResult.validezLegal === 'AJUSTADA_PARA_LEGALIDAD' && '⚖️ Ajustada a Límites Legales'}
                                {iaResult.validezLegal === 'ILEGAL_NULA' && '⚠️ Restricción Legal Detectada'}
                              </span>
                            </div>

                            <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 font-serif">
                              {iaResult.contenido}
                            </p>

                            {iaResult.analisisLegal && (
                              <div className="bg-indigo-50/60 p-2.5 rounded-lg border border-indigo-100 text-[11px] text-indigo-900 flex items-start gap-2">
                                <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-semibold">Dictamen Jurídico:</p>
                                  <p className="text-indigo-800">{iaResult.analisisLegal}</p>
                                </div>
                              </div>
                            )}

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                              <button
                                onClick={() => setIaResult(null)}
                                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                              >
                                Descartar
                              </button>
                              <button
                                onClick={handleAceptarClausulaIA}
                                className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 flex items-center gap-1.5 shadow-xs"
                              >
                                <CheckSquare className="w-3.5 h-3.5" />
                                <span>Añadir al Contrato</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <input
                          type="text"
                          placeholder="Título de la cláusula (ej. Cláusula de no fumadores)"
                          value={nuevaClausulaTitulo}
                          onChange={(e) => setNuevaClausulaTitulo(e.target.value)}
                          className="w-full text-xs px-3 py-2 bg-white border border-indigo-200 rounded-xl font-bold"
                        />
                        <textarea
                          placeholder="Texto legal detallado de la cláusula..."
                          value={nuevaClausulaContenido}
                          onChange={(e) => setNuevaClausulaContenido(e.target.value)}
                          rows={3}
                          className="w-full text-xs px-3 py-2 bg-white border border-indigo-200 rounded-xl"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setShowAddClausula(false)}
                            className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={handleAddClausula}
                            className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700"
                          >
                            Guardar Cláusula
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Lista de cláusulas */}
                <div className="space-y-3">
                  {contrato.clausulasPersonalizadas.map((clausula) => (
                    <div
                      key={clausula.id}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        clausula.activa
                          ? 'bg-slate-50/90 border-slate-200 text-slate-800'
                          : 'bg-slate-100/50 border-slate-200/50 text-slate-400 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={clausula.activa}
                            onChange={() => handleToggleClausula(clausula.id)}
                            className="mt-0.5 w-4 h-4 text-indigo-600 rounded cursor-pointer"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <h5 className="text-xs font-bold">{clausula.titulo}</h5>
                              {clausula.generadaPorIa && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-700 border border-purple-200 rounded-md flex items-center gap-1">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  <span>Redactada con IA</span>
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                              {clausula.contenido}
                            </p>
                          </div>
                        </div>

                        {(clausula.id.startsWith('cl-custom-') || clausula.id.startsWith('cl-ia-')) && (
                          <button
                            onClick={() => handleDeleteClausula(clausula.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botón Imprimir Contrato */}
              <div className="flex items-center justify-between p-4 bg-slate-900 text-white rounded-2xl">
                <div>
                  <span className="text-xs font-bold text-indigo-300">Documento Oficial Listo</span>
                  <p className="text-xs text-slate-300">
                    Genera el archivo PDF maquetado con las firmas y cláusulas configuradas.
                  </p>
                </div>
                <button
                  onClick={() => imprimirContratoPDF(contrato)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir / Descargar PDF</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: ACTA DE ENTREGA DE LLAVES Y CONTADORES */}
          {activeTab === 'acta' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Key className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Acta de Entrega de Llaves y Lectura de Contadores</h3>
                      <p className="text-xs text-slate-500">
                        Protocolo de entrada para registrar el estado inicial de suministros y entrega de juegos de llaves.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Lecturas de Contadores */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    1. Lecturas Iniciales de Suministros
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Contador Electricidad (kWh)</label>
                      <input
                        type="text"
                        value={contrato.actaEntregaLlaves.contadorElectricidadKwh || ''}
                        onChange={(e) => handleUpdateActaField('contadorElectricidadKwh', e.target.value)}
                        placeholder="Ej. 14250.5"
                        className="w-full text-xs font-mono font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Contador Agua (m³)</label>
                      <input
                        type="text"
                        value={contrato.actaEntregaLlaves.contadorAguaM3 || ''}
                        onChange={(e) => handleUpdateActaField('contadorAguaM3', e.target.value)}
                        placeholder="Ej. 312.4"
                        className="w-full text-xs font-mono font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Contador Gas (m³ / kWh)</label>
                      <input
                        type="text"
                        value={contrato.actaEntregaLlaves.contadorGasM3 || ''}
                        onChange={(e) => handleUpdateActaField('contadorGasM3', e.target.value)}
                        placeholder="Ej. 104.2"
                        className="w-full text-xs font-mono font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl mt-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Conteo de Llaves */}
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    2. Juegos de Llaves Entregados
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-slate-600">Vivienda (Puerta)</label>
                      <input
                        type="number"
                        min={0}
                        value={contrato.actaEntregaLlaves.juegosLlavesVivienda}
                        onChange={(e) => handleUpdateActaField('juegosLlavesVivienda', parseInt(e.target.value) || 0)}
                        className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-600">Portal / Acceso</label>
                      <input
                        type="number"
                        min={0}
                        value={contrato.actaEntregaLlaves.juegosLlavesPortal}
                        onChange={(e) => handleUpdateActaField('juegosLlavesPortal', parseInt(e.target.value) || 0)}
                        className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-600">Buzón</label>
                      <input
                        type="number"
                        min={0}
                        value={contrato.actaEntregaLlaves.juegosLlavesBuzon}
                        onChange={(e) => handleUpdateActaField('juegosLlavesBuzon', parseInt(e.target.value) || 0)}
                        className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-600">Garaje / Trastero</label>
                      <input
                        type="number"
                        min={0}
                        value={contrato.actaEntregaLlaves.juegosLlavesGarajeTrastero}
                        onChange={(e) =>
                          handleUpdateActaField('juegosLlavesGarajeTrastero', parseInt(e.target.value) || 0)
                        }
                        className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl mt-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Estado y Observaciones */}
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    3. Estado del Inmueble y Observaciones
                  </span>
                  <textarea
                    rows={3}
                    value={contrato.actaEntregaLlaves.observacionesEstado || ''}
                    onChange={(e) => handleUpdateActaField('observacionesEstado', e.target.value)}
                    placeholder="Observaciones conjuntas sobre pintura, limpieza, electrodomésticos..."
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FIRMAS Y CONTROL DE ESTADO */}
          {activeTab === 'firmas' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Selector de Estado del Expediente */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                  Estado del Expediente de Formalización
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {(
                    [
                      'BORRADOR_CONTRATO',
                      'ENVIADO_FIRMA',
                      'FIRMADO',
                      'FIANZA_DEPOSITADA',
                      'FORMALIZADO_ACTIVO',
                      'CANCELADO',
                    ] as EstadoFormalizacion[]
                  ).map((st) => {
                    const info = getFormalizacionEstadoInfo(st);
                    const isSelected = contrato.estado === st;
                    return (
                      <button
                        key={st}
                        onClick={() => handleCambiarEstado(st)}
                        className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                      >
                        <span className="text-xs font-bold">{info.label}</span>
                        <span className={`text-[10px] mt-1 ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                          {isSelected ? '✓ Seleccionado' : 'Clic para cambiar'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Registro de Firmas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Firma Propietario */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Firma Arrendador (Propietario)</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        contrato.firmaArrendador.firmado
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {contrato.firmaArrendador.firmado ? 'Firmado' : 'Pendiente'}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      const next = !contrato.firmaArrendador.firmado;
                      setContrato((prev) => ({
                        ...prev,
                        firmaArrendador: {
                          firmado: next,
                          fecha: next ? new Date().toISOString() : undefined,
                          firmanteNombre: prev.propietarioNombre,
                        },
                      }));
                    }}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                      contrato.firmaArrendador.firmado
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{contrato.firmaArrendador.firmado ? 'Desmarcar Firma' : 'Firmar como Arrendador'}</span>
                  </button>
                </div>

                {/* Firma Inquilino */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Firma Arrendatario (Inquilino)</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        contrato.firmaArrendatario.firmado
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {contrato.firmaArrendatario.firmado ? 'Firmado' : 'Pendiente'}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      const next = !contrato.firmaArrendatario.firmado;
                      setContrato((prev) => ({
                        ...prev,
                        firmaArrendatario: {
                          firmado: next,
                          fecha: next ? new Date().toISOString() : undefined,
                          firmanteNombre: prev.candidatoNombre,
                        },
                      }));
                    }}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                      contrato.firmaArrendatario.firmado
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{contrato.firmaArrendatario.firmado ? 'Desmarcar Firma' : 'Registrar Firma Inquilino'}</span>
                  </button>
                </div>
              </div>

              {/* Opción para marcar inmueble alquilado */}
              <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-center gap-3">
                <input
                  type="checkbox"
                  id="marcarAlquilado"
                  checked={marcarAlquiladoCheckbox}
                  onChange={(e) => setMarcarAlquiladoCheckbox(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                />
                <label htmlFor="marcarAlquilado" className="text-xs text-slate-700 font-medium cursor-pointer">
                  Marcar simultáneamente el inmueble como <strong>"Alquilado"</strong> en el catálogo general al guardar.
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {onDeleteContrato && existingContrato && (
              <button
                onClick={async () => {
                  if (confirm('¿Eliminar este expediente de formalización?')) {
                    await onDeleteContrato(contrato.id);
                    onClose();
                  }
                }}
                className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Eliminar Expediente</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
            >
              Cerrar
            </button>

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSaving ? 'Guardando...' : 'Guardar Expediente'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
