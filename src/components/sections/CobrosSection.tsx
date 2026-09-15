import React, { useState, useMemo } from 'react';
import {
  CobroPeriodo,
  ContratoFormalizacion,
  EstadoCobroAlquiler,
  Inmueble,
  JustificanteCobro,
  Propietario,
  UsuarioApp,
} from '../../types';
import {
  actualizarEstadosVencimiento,
  AvisoCobro,
  calcularAvisosCobros,
  calcularResumenCobros,
  generarResumenFiscalInmueble,
  MESES_NOMBRES,
  obtenerTodosCobros,
  registrarIncidenciaPeriodo,
  registrarPagoPeriodo,
  ResumenFiscalInmuebleAnual,
} from '../../utils/cobrosEngine';
import { uploadJustificanteCobro } from '../../lib/firebase';
import {
  AlertCircle,
  Banknote,
  Bell,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Euro,
  Eye,
  FileCheck2,
  FileSignature,
  FileText,
  Filter,
  History,
  Paperclip,
  Receipt,
  Search,
  ShieldCheck,
  Upload,
  User,
  X,
} from 'lucide-react';

interface CobrosSectionProps {
  contratos: ContratoFormalizacion[];
  inmuebles: Inmueble[];
  propietarios?: Propietario[];
  currentUser?: UsuarioApp | null;
  onSaveContrato: (contrato: ContratoFormalizacion) => Promise<void> | void;
  onNavigateToInmueble?: (inmuebleId: string) => void;
}

export const CobrosSection: React.FC<CobrosSectionProps> = ({
  contratos,
  inmuebles,
  propietarios = [],
  currentUser,
  onSaveContrato,
  onNavigateToInmueble,
}) => {
  const isOwner = currentUser?.tipoPerfil === 'PROPIETARIO';
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Filtros de navegación
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number | 'TODOS'>('TODOS');
  const [selectedInmuebleId, setSelectedInmuebleId] = useState<string>('TODOS');
  const [selectedEstado, setSelectedEstado] = useState<string>('TODOS');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Estados de modales
  const [cobroToEdit, setCobroToEdit] = useState<CobroPeriodo | null>(null);
  const [cobroParaTrazabilidad, setCobroParaTrazabilidad] = useState<CobroPeriodo | null>(null);
  const [showFiscalModal, setShowFiscalModal] = useState<boolean>(false);
  const [fiscalInmuebleId, setFiscalInmuebleId] = useState<string>(
    inmuebles.length > 0 ? inmuebles[0].id : ''
  );
  const [fiscalYear, setFiscalYear] = useState<number>(currentYear);

  // Formulario del modal de registrar pago
  const [inputImporte, setInputImporte] = useState<number>(0);
  const [inputFechaPago, setInputFechaPago] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [inputMetodoPago, setInputMetodoPago] = useState<
    'transferencia' | 'domiciliacion' | 'bizum' | 'efectivo' | 'otro'
  >('transferencia');
  const [inputEstado, setInputEstado] = useState<EstadoCobroAlquiler>('RECIBIDO');
  const [inputObservaciones, setInputObservaciones] = useState<string>('');
  const [inputReferencia, setInputReferencia] = useState<string>('');
  const [justificanteFile, setJustificanteFile] = useState<File | null>(null);
  const [isSavingPago, setIsSavingPago] = useState<boolean>(false);
  const [isUploadingJust, setIsUploadingJust] = useState<boolean>(false);

  // Modal de incidencia
  const [cobroParaIncidencia, setCobroParaIncidencia] = useState<CobroPeriodo | null>(null);
  const [motivoIncidencia, setMotivoIncidencia] = useState<string>('');

  // 1. Recopilar todos los cobros vigentes e históricos de los contratos scoped.
  // Se aplica en memoria la sincronización de vencimientos para que la UI muestre
  // RETRASADO al instante, aunque la persistencia a Firestore aún esté en curso.
  const allCobros = useMemo(() => {
    const contratosAlDia = contratos.map((c) => actualizarEstadosVencimiento(c).contratoActualizado);
    return obtenerTodosCobros(contratosAlDia);
  }, [contratos]);

  // Avisos de seguimiento (vence pronto / plazo de cortesía / vencida / incidencia).
  // Respeta el filtro de inmueble pero no el de año/mes para no ocultar urgencias.
  const avisos: AvisoCobro[] = useMemo(() => {
    const base =
      selectedInmuebleId !== 'TODOS'
        ? allCobros.filter((c) => c.inmuebleId === selectedInmuebleId)
        : allCobros;
    return calcularAvisosCobros(base);
  }, [allCobros, selectedInmuebleId]);

  const countVencePronto = avisos.filter(
    (a) => a.tipo === 'vence_pronto' || a.tipo === 'en_plazo_gracia'
  ).length;
  const countVencidas = avisos.filter((a) => a.tipo === 'vencida').length;
  const countIncidenciasAviso = avisos.filter((a) => a.tipo === 'incidencia').length;

  const handleGestionarAviso = (aviso: AvisoCobro) => {
    if (aviso.tipo === 'incidencia') {
      setCobroParaIncidencia(aviso.cobro);
      setMotivoIncidencia(aviso.cobro.motivoIncidencia || '');
    } else {
      handleOpenEditPago(aviso.cobro);
    }
  };

  const aplicarFiltroAviso = (estado: EstadoCobroAlquiler) => {
    setSelectedYear(0);
    setSelectedMonth('TODOS');
    setSelectedEstado(estado);
  };

  // 2. Cobros filtrados
  const filteredCobros = useMemo(() => {
    return allCobros.filter((c) => {
      // Año
      if (selectedYear !== 0 && c.anio !== selectedYear) return false;
      // Mes
      if (selectedMonth !== 'TODOS' && c.mes !== selectedMonth) return false;
      // Inmueble
      if (selectedInmuebleId !== 'TODOS' && c.inmuebleId !== selectedInmuebleId) return false;
      // Estado
      if (selectedEstado !== 'TODOS' && c.estado !== selectedEstado) return false;
      // Búsqueda libre
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesInquilino = c.inquilinoNombre?.toLowerCase().includes(term);
        const matchesDireccion = c.inmuebleDireccion?.toLowerCase().includes(term);
        const matchesDni = c.inquilinoDni?.toLowerCase().includes(term);
        const matchesPropietario = c.propietarioNombre?.toLowerCase().includes(term);
        if (!matchesInquilino && !matchesDireccion && !matchesDni && !matchesPropietario) {
          return false;
        }
      }
      return true;
    });
  }, [allCobros, selectedYear, selectedMonth, selectedInmuebleId, selectedEstado, searchTerm]);

  // Métricas agregadas
  const metrics = useMemo(() => {
    return calcularResumenCobros(filteredCobros);
  }, [filteredCobros]);

  // Años disponibles en los contratos
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(currentYear);
    years.add(currentYear - 1);
    for (const c of allCobros) {
      years.add(c.anio);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [allCobros, currentYear]);

  // Abrir modal para registrar/editar pago
  const handleOpenEditPago = (cobro: CobroPeriodo) => {
    setCobroToEdit(cobro);
    setInputImporte(cobro.importeRecibido > 0 ? cobro.importeRecibido : cobro.importePrevisto);
    setInputFechaPago(cobro.fechaPago || new Date().toISOString().split('T')[0]);
    setInputMetodoPago(cobro.metodoPago || 'transferencia');
    setInputEstado(cobro.importeRecibido > 0 ? cobro.estado : 'RECIBIDO');
    setInputObservaciones(cobro.observaciones || '');
    setInputReferencia(cobro.referenciaBancaria || '');
    setJustificanteFile(null);
  };

  // Guardar pago
  const handleSavePagoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cobroToEdit) return;

    setIsSavingPago(true);
    try {
      const contrato = contratos.find((c) => c.id === cobroToEdit.contratoId);
      if (!contrato) {
        alert('No se encontró el contrato asociado.');
        setIsSavingPago(false);
        return;
      }

      // Procesar justificante: el archivo sube a Firebase Storage y en Firestore
      // solo se guardan metadatos + URL (nunca el PDF/imagen en base64).
      let justificanteData: JustificanteCobro | undefined = cobroToEdit.justificante;
      if (justificanteFile) {
        setIsUploadingJust(true);
        try {
          const subido = await uploadJustificanteCobro(
            cobroToEdit.id,
            justificanteFile,
            justificanteFile.name,
            cobroToEdit.propietarioId || contrato.propietarioId || currentUser?.propietarioId
          );
          justificanteData = {
            id: `just_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            nombreArchivo: justificanteFile.name,
            tipoMime: justificanteFile.type,
            tamanoBytes: justificanteFile.size,
            fechaSubida: new Date().toISOString(),
            subidoPor: currentUser?.nombre || currentUser?.email || 'Administrador',
            storagePath: subido.storagePath,
            url: subido.url,
          };
        } catch (upErr: any) {
          console.error('Error subiendo justificante:', upErr);
          alert(upErr?.message || 'No se pudo subir el justificante. El pago no se ha guardado.');
          setIsUploadingJust(false);
          setIsSavingPago(false);
          return;
        } finally {
          setIsUploadingJust(false);
        }
      }

      const updatedContrato = registrarPagoPeriodo(
        contrato,
        cobroToEdit.id,
        {
          importeRecibido: Number(inputImporte),
          fechaPago: inputFechaPago,
          metodoPago: inputMetodoPago,
          estado: inputEstado,
          observaciones: inputObservaciones,
          referenciaBancaria: inputReferencia,
          justificante: justificanteData,
        },
        currentUser
      );

      await onSaveContrato(updatedContrato);
      setCobroToEdit(null);
    } catch (err) {
      console.error('Error al guardar el cobro:', err);
      alert('Error al guardar el pago de alquiler.');
    } finally {
      setIsSavingPago(false);
    }
  };

  // Reportar incidencia
  const handleSaveIncidencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cobroParaIncidencia || !motivoIncidencia.trim()) return;

    try {
      const contrato = contratos.find((c) => c.id === cobroParaIncidencia.contratoId);
      if (!contrato) return;

      const updatedContrato = registrarIncidenciaPeriodo(
        contrato,
        cobroParaIncidencia.id,
        motivoIncidencia.trim(),
        currentUser
      );

      await onSaveContrato(updatedContrato);
      setCobroParaIncidencia(null);
      setMotivoIncidencia('');
    } catch (err) {
      console.error('Error al reportar incidencia:', err);
      alert('Error al registrar la incidencia.');
    }
  };

  // Resumen fiscal anual calculado
  const resumenFiscal = useMemo(() => {
    if (!fiscalInmuebleId || !showFiscalModal) return null;
    return generarResumenFiscalInmueble(fiscalInmuebleId, fiscalYear, inmuebles, contratos);
  }, [fiscalInmuebleId, fiscalYear, inmuebles, contratos, showFiscalModal]);

  // Render badge de estado
  const renderEstadoBadge = (estado: EstadoCobroAlquiler) => {
    switch (estado) {
      case 'RECIBIDO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Recibido
          </span>
        );
      case 'VERIFICADO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            Verificado
          </span>
        );
      case 'RETRASADO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <Clock className="w-3.5 h-3.5 text-rose-600" />
            Retrasado
          </span>
        );
      case 'INCIDENCIA':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            Incidencia
          </span>
        );
      case 'PENDIENTE':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            Pendiente
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {isOwner ? 'Mis Cobros de Alquiler' : 'Gestión Mensual de Cobros'}
              </h2>
              <p className="text-xs text-slate-500">
                Control mensual de rentas: Importe previsto → Importe recibido → Estado → Justificante
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              if (inmuebles.length > 0) setFiscalInmuebleId(inmuebles[0].id);
              setShowFiscalModal(true);
            }}
            className="px-4 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-800 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs"
            title="Preparar y visualizar la estructura para el resumen fiscal anual"
          >
            <FileCheck2 className="w-4 h-4 text-indigo-600" />
            <span>Resumen Fiscal Anual</span>
          </button>
        </div>
      </div>

      {/* Panel de Avisos y Seguimiento Automático (Fase 1.3) */}
      {avisos.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-600" />
              <h3 className="font-bold text-sm text-slate-900">Avisos de seguimiento de cobros</h3>
              <span className="text-xs text-slate-500">({avisos.length})</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-bold flex-wrap">
              <button
                type="button"
                onClick={() => aplicarFiltroAviso('INCIDENCIA')}
                className={`px-2.5 py-1 rounded-full border transition-colors ${
                  countIncidenciasAviso > 0
                    ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                Incidencias: {countIncidenciasAviso}
              </button>
              <button
                type="button"
                onClick={() => aplicarFiltroAviso('RETRASADO')}
                className={`px-2.5 py-1 rounded-full border transition-colors ${
                  countVencidas > 0
                    ? 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                Vencidas: {countVencidas}
              </button>
              <button
                type="button"
                onClick={() => aplicarFiltroAviso('PENDIENTE')}
                className={`px-2.5 py-1 rounded-full border transition-colors ${
                  countVencePronto > 0
                    ? 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                Vencen pronto: {countVencePronto}
              </button>
            </div>
          </div>

          <ul className="divide-y divide-slate-100">
            {avisos.slice(0, 6).map((aviso) => {
              const estilos =
                aviso.nivel === 'critico'
                  ? 'border-l-4 border-l-rose-400 bg-rose-50/40'
                  : aviso.nivel === 'advertencia'
                  ? 'border-l-4 border-l-amber-400 bg-amber-50/40'
                  : 'border-l-4 border-l-blue-400 bg-blue-50/30';
              const Icono = aviso.tipo === 'incidencia'
                ? AlertCircle
                : aviso.nivel === 'critico'
                ? Clock
                : Calendar;
              const colorIcono =
                aviso.nivel === 'critico'
                  ? 'text-rose-500'
                  : aviso.nivel === 'advertencia'
                  ? 'text-amber-500'
                  : 'text-blue-500';
              return (
                <li key={aviso.id} className={`px-4 py-2.5 flex items-center gap-3 ${estilos}`}>
                  <Icono className={`w-4 h-4 shrink-0 ${colorIcono}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900">{aviso.titulo}</p>
                    <p className="text-[11px] text-slate-600 truncate" title={aviso.detalle}>
                      {aviso.detalle}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGestionarAviso(aviso)}
                    className="shrink-0 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-700 text-white rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1"
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    {aviso.tipo === 'incidencia' ? 'Gestionar' : 'Cobrar'}
                  </button>
                </li>
              );
            })}
          </ul>
          {avisos.length > 6 && (
            <div className="px-4 py-2 bg-slate-50 text-[11px] text-slate-500 text-center border-t border-slate-100">
              Mostrando los 6 avisos más urgentes. Usa los filtros para ver el resto ({avisos.length - 6} más).
            </div>
          )}
        </div>
      )}

      {/* Tarjetas de Métricas de Cobros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Alquiler Previsto */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>Alquiler Previsto</span>
            <Calendar className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {metrics.totalPrevisto.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
          </div>
          <div className="text-[11px] text-slate-500">
            {metrics.totalPeriodos} mensualidades registradas
          </div>
        </div>

        {/* Cobrado / Recibido */}
        <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-2xs space-y-1 bg-gradient-to-br from-white to-emerald-50/30">
          <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold">
            <span>Cobrado Recibido</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 font-mono">
            {metrics.totalRecibido.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
          </div>
          <div className="text-[11px] text-emerald-600 flex items-center justify-between">
            <span>{metrics.countCobrados} mensualidades al día</span>
            <span className="font-bold font-mono">{metrics.porcentajeCobrado}%</span>
          </div>
        </div>

        {/* Pendiente de Cobro */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Pendiente de Cobro</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 font-mono">
            {metrics.totalPendiente.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
          </div>
          <div className="text-[11px] text-slate-500">
            {metrics.countPendientes} recibos en curso
          </div>
        </div>

        {/* Retrasos / Incidencias */}
        <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-2xs space-y-1 bg-gradient-to-br from-white to-rose-50/20">
          <div className="flex items-center justify-between text-rose-700 text-xs font-semibold">
            <span>Retrasos & Incidencias</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-rose-600 font-mono">
            {(metrics.totalRetrasado + metrics.totalIncidencias).toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
          </div>
          <div className="text-[11px] text-rose-600 font-medium">
            {metrics.countRetrasados} retrasos · {metrics.countIncidencias} incidencias
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <Filter className="w-4 h-4 text-blue-600" />
          <span>Filtrar Control Mensual</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          {/* Año */}
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Año</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
            >
              <option value={0}>Todos los años</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Mes */}
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Mes</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value === 'TODOS' ? 'TODOS' : Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
            >
              <option value="TODOS">Todos los meses</option>
              {MESES_NOMBRES.map((nombre, idx) => (
                <option key={idx} value={idx + 1}>
                  {nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Inmueble */}
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Inmueble</label>
            <select
              value={selectedInmuebleId}
              onChange={(e) => setSelectedInmuebleId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900 truncate"
            >
              <option value="TODOS">Todos los inmuebles</option>
              {inmuebles.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.direccion} ({i.ciudad})
                </option>
              ))}
            </select>
          </div>

          {/* Estado */}
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Estado del Pago</label>
            <select
              value={selectedEstado}
              onChange={(e) => setSelectedEstado(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
            >
              <option value="TODOS">Todos los estados</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="RECIBIDO">Recibidos</option>
              <option value="VERIFICADO">Verificados</option>
              <option value="RETRASADO">Retrasados</option>
              <option value="INCIDENCIA">Incidencias</option>
            </select>
          </div>

          {/* Buscador */}
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Buscar</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Inquilino, DNI o calle..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabla Principal de Cobros: Mes → Importe Previsto → Importe Recibido → Estado → Justificante */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <Banknote className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-sm text-slate-900">
              Listado Mensual de Rentas ({filteredCobros.length})
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Prioridad: Mes → Previsto → Recibido → Estado → Justificante
          </span>
        </div>

        {filteredCobros.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Receipt className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-700 text-sm">No hay registros de cobros para este filtro</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Los periodos mensuales se generan automáticamente vinculados al contrato activo y su importe contracted.
              Comprueba los filtros de año, mes o inmueble.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Periodo / Mes</th>
                  <th className="py-3 px-4">Inmueble e Inquilino</th>
                  <th className="py-3 px-4 text-right">Importe Previsto</th>
                  <th className="py-3 px-4 text-right">Importe Recibido</th>
                  <th className="py-3 px-4">Fecha Pago</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                  <th className="py-3 px-4 text-center">Justificante</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCobros.map((cobro) => {
                  const contratoAsoc = contratos.find((c) => c.id === cobro.contratoId);

                  return (
                    <tr
                      key={cobro.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Periodo / Mes */}
                      <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-blue-600" />
                          <span>{cobro.nombreMes}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-normal block pl-5.5">
                          Vto: {cobro.fechaVencimiento}
                        </span>
                      </td>

                      {/* Inmueble e Inquilino */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">
                          {cobro.inmuebleDireccion}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1 font-medium text-slate-700">
                            <User className="w-3 h-3 text-slate-400" />
                            {cobro.inquilinoNombre || 'Inquilino'}
                          </span>
                          {cobro.inquilinoDni && (
                            <span className="font-mono text-[10px] text-slate-400">
                              ({cobro.inquilinoDni})
                            </span>
                          )}
                          {!isOwner && cobro.propietarioNombre && (
                            <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded font-medium">
                              Prop: {cobro.propietarioNombre}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Importe Previsto */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-700 whitespace-nowrap">
                        {cobro.importePrevisto.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                      </td>

                      {/* Importe Recibido */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {cobro.importeRecibido > 0 ? (
                          <span className="font-mono font-bold text-emerald-700">
                            {cobro.importeRecibido.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">0,00 €</span>
                        )}
                        {cobro.importeRecibido > 0 && cobro.importeRecibido < cobro.importePrevisto && (
                          <span className="text-[10px] text-rose-600 font-bold block">
                            Parcial (-{(cobro.importePrevisto - cobro.importeRecibido).toFixed(2)} €)
                          </span>
                        )}
                      </td>

                      {/* Fecha Pago */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {cobro.fechaPago ? (
                          <div>
                            <span className="font-medium text-slate-800">{cobro.fechaPago}</span>
                            {cobro.metodoPago && (
                              <span className="text-[10px] text-slate-400 block capitalize">
                                {cobro.metodoPago}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">—</span>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {renderEstadoBadge(cobro.estado)}
                        {cobro.motivoIncidencia && (
                          <span
                            className="text-[10px] text-amber-700 block truncate max-w-[140px] mx-auto mt-0.5"
                            title={cobro.motivoIncidencia}
                          >
                            {cobro.motivoIncidencia}
                          </span>
                        )}
                      </td>

                      {/* Justificante */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {cobro.justificante ? (
                          cobro.justificante.url ? (
                            <a
                              href={cobro.justificante.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-[11px] font-bold hover:bg-blue-100 transition-colors max-w-[150px]"
                              title={`Ver/descargar: ${cobro.justificante.nombreArchivo} (${cobro.justificante.tamanoBytes ? (cobro.justificante.tamanoBytes / 1024).toFixed(0) + ' KB' : ''})`}
                            >
                              <Paperclip className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span className="truncate">{cobro.justificante.nombreArchivo}</span>
                              <Download className="w-3 h-3 text-blue-500 shrink-0" />
                            </a>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-[11px] font-bold max-w-[150px]"
                              title={cobro.justificante.nombreArchivo}
                            >
                              <Paperclip className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span className="truncate">{cobro.justificante.nombreArchivo}</span>
                            </span>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenEditPago(cobro)}
                            className="text-slate-400 hover:text-blue-600 text-[11px] flex items-center justify-center gap-1 mx-auto transition-colors"
                            title="Adjuntar justificante de transferencia / ingreso"
                          >
                            <Upload className="w-3 h-3" />
                            <span>Adjuntar</span>
                          </button>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditPago(cobro)}
                            className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs flex items-center gap-1"
                          >
                            <Banknote className="w-3.5 h-3.5" />
                            <span>{cobro.importeRecibido > 0 ? 'Editar' : 'Cobrar'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setCobroParaIncidencia(cobro);
                              setMotivoIncidencia(cobro.motivoIncidencia || '');
                            }}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Registrar incidencia"
                          >
                            <AlertCircle className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setCobroParaTrazabilidad(cobro)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Ver trazabilidad de cambios"
                          >
                            <History className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: REGISTRAR / EDITAR PAGO */}
      {cobroToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base">Registrar Cobro de Alquiler</h3>
              </div>
              <button
                type="button"
                onClick={() => setCobroToEdit(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePagoSubmit} className="p-5 space-y-4 text-xs">
              {/* Información del periodo e inmueble */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">{cobroToEdit.nombreMes}</span>
                  <span className="font-mono text-xs font-bold text-slate-600">
                    Previsto: {cobroToEdit.importePrevisto.toFixed(2)} €
                  </span>
                </div>
                <p className="text-slate-600 text-[11px] truncate">
                  <strong>Inmueble:</strong> {cobroToEdit.inmuebleDireccion}
                </p>
                <p className="text-slate-600 text-[11px]">
                  <strong>Inquilino:</strong> {cobroToEdit.inquilinoNombre}{' '}
                  {cobroToEdit.inquilinoDni ? `(${cobroToEdit.inquilinoDni})` : ''}
                </p>
              </div>

              {/* Importe y Fecha */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Importe Recibido (€) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={inputImporte}
                    onChange={(e) => setInputImporte(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Fecha de Recepción *
                  </label>
                  <input
                    type="date"
                    required
                    value={inputFechaPago}
                    onChange={(e) => setInputFechaPago(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Método de Pago y Estado */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Método de Pago</label>
                  <select
                    value={inputMetodoPago}
                    onChange={(e) => setInputMetodoPago(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                  >
                    <option value="transferencia">Transferencia Bancaria</option>
                    <option value="domiciliacion">Domiciliación SEPA</option>
                    <option value="bizum">Bizum</option>
                    <option value="efectivo">Efectivo con Recibo</option>
                    <option value="otro">Otro método</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Estado</label>
                  <select
                    value={inputEstado}
                    onChange={(e) => setInputEstado(e.target.value as EstadoCobroAlquiler)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                  >
                    <option value="RECIBIDO">RECIBIDO</option>
                    <option value="VERIFICADO">VERIFICADO</option>
                    <option value="PENDIENTE">PENDIENTE</option>
                    <option value="RETRASADO">RETRASADO</option>
                    <option value="INCIDENCIA">INCIDENCIA</option>
                  </select>
                </div>
              </div>

              {/* Referencia bancaria opcional */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Referencia Bancaria / Justificante Ref (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej. TRANS-BBVA-94819 o Concepto: Renta Mayo 2026"
                  value={inputReferencia}
                  onChange={(e) => setInputReferencia(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              {/* Justificante Documental Independiente */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Adjuntar Justificante (PDF / Imagen)
                </label>
                {cobroToEdit.justificante && !justificanteFile && (
                  <div className="mb-2 p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-blue-600" />
                      <div>
                        <span className="font-bold text-blue-900 block">
                          {cobroToEdit.justificante.nombreArchivo}
                        </span>
                        <span className="text-[10px] text-blue-700">
                          Subido el {new Date(cobroToEdit.justificante.fechaSubida).toLocaleDateString('es-ES')} por{' '}
                          {cobroToEdit.justificante.subidoPor || 'Usuario'}
                        </span>
                      </div>
                    </div>
                    {cobroToEdit.justificante.url ? (
                      <a
                        href={cobroToEdit.justificante.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        Ver / Descargar
                      </a>
                    ) : (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        Enlazado
                      </span>
                    )}
                  </div>
                )}
                <div className="border border-dashed border-slate-300 rounded-xl p-3 text-center bg-slate-50">
                  <input
                    type="file"
                    id="justificanteUpload"
                    accept=".pdf,image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setJustificanteFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                  <label
                    htmlFor="justificanteUpload"
                    className="cursor-pointer flex flex-col items-center justify-center gap-1 text-slate-600 hover:text-blue-600"
                  >
                    <Upload className="w-5 h-5 text-slate-400" />
                    <span className="font-semibold text-xs">
                      {justificanteFile
                        ? `Seleccionado: ${justificanteFile.name}`
                        : 'Haga clic para seleccionar archivo de justificante'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Se guardan metadatos y referencia independiente (PDF/PNG/JPG)
                    </span>
                  </label>
                </div>
              </div>

              {/* Observaciones */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Observaciones / Notas de Cobro
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej. Ingreso recibido en cuenta Santander con justificante adjunto."
                  value={inputObservaciones}
                  onChange={(e) => setInputObservaciones(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCobroToEdit(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingPago || isUploadingJust}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Banknote className="w-4 h-4" />
                  <span>
                    {isUploadingJust
                      ? 'Subiendo justificante...'
                      : isSavingPago
                      ? 'Guardando...'
                      : 'Confirmar Registro de Pago'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: REPORTAR INCIDENCIA */}
      {cobroParaIncidencia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-amber-600 text-white">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-white" />
                <h3 className="font-bold text-base">Registrar Incidencia de Cobro</h3>
              </div>
              <button
                type="button"
                onClick={() => setCobroParaIncidencia(null)}
                className="p-1 text-amber-200 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveIncidencia} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-amber-900">
                <span className="font-bold text-sm block">{cobroParaIncidencia.nombreMes}</span>
                <p className="text-[11px]">
                  <strong>Inmueble:</strong> {cobroParaIncidencia.inmuebleDireccion}
                </p>
                <p className="text-[11px]">
                  <strong>Inquilino:</strong> {cobroParaIncidencia.inquilinoNombre}
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Motivo de la Incidencia / Retraso *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Ej. El inquilino indica que cobrará el día 10 por retraso en su nómina. Contactado telefónicamente."
                  value={motivoIncidencia}
                  onChange={(e) => setMotivoIncidencia(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCobroParaIncidencia(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs flex items-center gap-1.5"
                >
                  <AlertCircle className="w-4 h-4" />
                  <span>Guardar Incidencia</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: TRAZABILIDAD Y HISTORIAL DE CAMBIOS */}
      {cobroParaTrazabilidad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base">Trazabilidad del Periodo</h3>
              </div>
              <button
                type="button"
                onClick={() => setCobroParaTrazabilidad(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900">
                    {cobroParaTrazabilidad.nombreMes}
                  </span>
                  {renderEstadoBadge(cobroParaTrazabilidad.estado)}
                </div>
                <p className="text-[11px] text-slate-600">
                  <strong>ID:</strong> {cobroParaTrazabilidad.id}
                </p>
                <p className="text-[11px] text-slate-600">
                  <strong>Inmueble:</strong> {cobroParaTrazabilidad.inmuebleDireccion}
                </p>
                <p className="text-[11px] text-slate-600">
                  <strong>Inquilino:</strong> {cobroParaTrazabilidad.inquilinoNombre}
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span>Historial Inmutable de Acciones</span>
                </h4>

                {cobroParaTrazabilidad.historialCambios &&
                cobroParaTrazabilidad.historialCambios.length > 0 ? (
                  <div className="space-y-2 border-l-2 border-slate-200 pl-3 ml-1">
                    {cobroParaTrazabilidad.historialCambios.map((h) => (
                      <div
                        key={h.id}
                        className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{h.accion}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(h.fecha).toLocaleString('es-ES')}
                          </span>
                        </div>
                        {h.detalles && <p className="text-slate-600 text-[11px]">{h.detalles}</p>}
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200/60">
                          <span>Usuario: {h.usuarioNombre || 'Sistema'}</span>
                          {h.estadoNuevo && (
                            <span className="font-semibold text-slate-600">
                              Estado: {h.estadoNuevo}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 italic">No hay registros de cambios adicionales.</p>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end shrink-0 bg-slate-50">
              <button
                type="button"
                onClick={() => setCobroParaTrazabilidad(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl text-xs transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: PREPARACIÓN RESUMEN FISCAL ANUAL */}
      {showFiscalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col my-auto">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-indigo-900 text-white shrink-0">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-indigo-300" />
                <div>
                  <h3 className="font-bold text-base">Estructura Base para Resumen Fiscal Anual</h3>
                  <p className="text-[11px] text-indigo-200">
                    Cálculo anual de rentas cobradas por inmueble y trazabilidad de contratos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFiscalModal(false)}
                className="p-1 text-indigo-300 hover:text-white rounded-lg hover:bg-indigo-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 text-xs overflow-y-auto flex-1">
              {/* Selectores de Inmueble y Año */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl">
                <div>
                  <label className="block font-bold text-indigo-950 mb-1">
                    Seleccionar Inmueble
                  </label>
                  <select
                    value={fiscalInmuebleId}
                    onChange={(e) => setFiscalInmuebleId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-semibold text-slate-900"
                  >
                    {inmuebles.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.direccion} ({i.ciudad})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-indigo-950 mb-1">Año Fiscal</label>
                  <select
                    value={fiscalYear}
                    onChange={(e) => setFiscalYear(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-semibold text-slate-900"
                  >
                    {availableYears.map((y) => (
                      <option key={y} value={y}>
                        Ejercicio Fiscal {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {resumenFiscal ? (
                <div className="space-y-4">
                  {/* Ficha de cabecera */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-blue-600" />
                        <span className="font-bold text-sm text-slate-900">
                          {resumenFiscal.inmuebleDireccion}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                        Ejercicio {resumenFiscal.anio}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                      <div>
                        <strong>Referencia Catastral:</strong>{' '}
                        <span className="font-mono font-semibold">
                          {resumenFiscal.referenciaCatastral || 'Pendiente de registrar'}
                        </span>
                      </div>
                      <div>
                        <strong>Propietario / Arrendador:</strong>{' '}
                        <span>{resumenFiscal.propietarioNombre}</span>
                      </div>
                    </div>
                  </div>

                  {/* Resumen Anual Agregado */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-emerald-800 block">
                        Total Realmente Cobrado
                      </span>
                      <span className="text-xl font-bold font-mono text-emerald-700 block mt-1">
                        {resumenFiscal.totalAnualCobrado.toLocaleString('es-ES', {
                          minimumFractionDigits: 2,
                        })}{' '}
                        €
                      </span>
                      <span className="text-[10px] text-emerald-600">
                        {resumenFiscal.mesesCobradosCount} mensualidades
                      </span>
                    </div>

                    <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-slate-600 block">
                        Total Previsto Anual
                      </span>
                      <span className="text-xl font-bold font-mono text-slate-800 block mt-1">
                        {resumenFiscal.totalAnualPrevisto.toLocaleString('es-ES', {
                          minimumFractionDigits: 2,
                        })}{' '}
                        €
                      </span>
                    </div>

                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-blue-800 block">
                        Justificantes Archivo
                      </span>
                      <span className="text-xl font-bold font-mono text-blue-700 block mt-1">
                        {resumenFiscal.justificantesCount}
                      </span>
                      <span className="text-[10px] text-blue-600">Documentos vinculados</span>
                    </div>
                  </div>

                  {/* Desglose de Contratos e Inquilinos en el Año (Soporte varios inquilinos/contratos) */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5 uppercase tracking-wider text-indigo-900">
                      <FileSignature className="w-4 h-4 text-indigo-600" />
                      <span>Inquilinos y Contratos del Ejercicio ({resumenFiscal.contratosPeriodos.length})</span>
                    </h4>

                    {resumenFiscal.contratosPeriodos.length === 0 ? (
                      <p className="text-slate-400 italic text-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                        No constan contratos con periodos computables para el año {resumenFiscal.anio}.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {resumenFiscal.contratosPeriodos.map((cp, idx) => (
                          <div
                            key={cp.contratoId}
                            className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2.5"
                          >
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold text-[10px]">
                                  {idx + 1}
                                </span>
                                <div>
                                  <span className="font-bold text-slate-900">
                                    {cp.inquilinoNombre}
                                  </span>
                                  {cp.inquilinoDni && (
                                    <span className="text-[10px] font-mono text-slate-500 ml-1.5">
                                      (DNI: {cp.inquilinoDni})
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="font-mono font-bold text-xs text-emerald-700">
                                Subtotal: {cp.subtotalCobrado.toFixed(2)} €
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] text-slate-600">
                              <div>
                                <strong>Vigencia:</strong> {cp.fechaInicio}
                                {cp.fechaFin ? ` a ${cp.fechaFin}` : ' (Vigente)'}
                              </div>
                              <div>
                                <strong>Renta contratada:</strong> {cp.rentaMensual} €/mes
                              </div>
                              <div>
                                <strong>Meses en el año:</strong> {cp.meses.length}
                              </div>
                            </div>

                            {/* Desglose de mensualidades */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                              {cp.meses.map((m) => (
                                <div
                                  key={m.mes}
                                  className={`p-1.5 rounded-lg border text-[10px] flex items-center justify-between ${
                                    m.estado === 'RECIBIDO' || m.estado === 'VERIFICADO'
                                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                                      : 'bg-slate-50 border-slate-200 text-slate-600'
                                  }`}
                                >
                                  <span className="font-semibold">{m.nombreMes.split(' ')[0]}</span>
                                  <span className="font-mono font-bold">
                                    {m.importeRecibido > 0 ? `${m.importeRecibido} €` : '0 €'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 italic">
                  Selecciona un inmueble y un año para calcular el resumen fiscal.
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end shrink-0 bg-slate-50">
              <button
                type="button"
                onClick={() => setShowFiscalModal(false)}
                className="px-4 py-2 bg-indigo-800 hover:bg-indigo-900 text-white font-semibold rounded-xl text-xs transition-colors shadow-xs"
              >
                Cerrar Resumen Fiscal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
