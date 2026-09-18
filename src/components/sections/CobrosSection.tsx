import React, { useState, useMemo, useEffect } from 'react';
import {
  CobroPeriodo,
  ContratoFormalizacion,
  EstadoCobroAlquiler,
  Gasto,
  Inmueble,
  JustificanteCobro,
  Propietario,
  UsuarioApp,
} from '../../types';
import {
  calcularDiasRetraso,
  calcularResumenCobros,
  estaVencido,
  generarAlertasImpago,
  MESES_NOMBRES,
  obtenerTodosCobros,
  registrarIncidenciaPeriodo,
  registrarPagoPeriodo,
  AlertaImpago,
} from '../../utils/cobrosEngine';
import {
  generarResumenFiscalAnual,
  ResumenFiscalAnual,
  esGastoDeducible,
} from '../../utils/fiscalEngine';
import { subscribeGastosSeguros } from '../../lib/firebase';
import {
  AlertCircle,
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileSignature,
  Filter,
  History,
  Paperclip,
  Receipt,
  Search,
  ShieldCheck,
  Upload,
  User,
  X,
  AlertTriangle,
  Euro,
  TrendingUp,
  Shield,
  FileText,
} from 'lucide-react';
import { uploadCobroJustificanteStorage } from '../../lib/firebase';

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
  const isProfesional = currentUser?.tipoPerfil === 'PROFESIONAL';
  const currentYear = new Date().getFullYear();

  // Profesional denegado
  if (isProfesional) {
    return (
      <div className="space-y-6 pb-12">
        <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-2xs text-center space-y-3">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Acceso restringido</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            El módulo de cobros de alquiler contiene información económica privada y justificantes sensibles.
            Solo propietarios autorizados y administradores pueden acceder.
          </p>
        </div>
      </div>
    );
  }

  // Filtros
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number | 'TODOS'>('TODOS');
  const [selectedInmuebleId, setSelectedInmuebleId] = useState<string>('TODOS');
  const [selectedEstado, setSelectedEstado] = useState<string>('TODOS');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modales
  const [cobroToEdit, setCobroToEdit] = useState<CobroPeriodo | null>(null);
  const [cobroParaTrazabilidad, setCobroParaTrazabilidad] = useState<CobroPeriodo | null>(null);
  const [showFiscalModal, setShowFiscalModal] = useState<boolean>(false);
  const [fiscalInmuebleId, setFiscalInmuebleId] = useState<string>(
    inmuebles.length > 0 ? inmuebles[0].id : ''
  );
  const [fiscalYear, setFiscalYear] = useState<number>(currentYear);

  // Formulario pago
  const [inputImporte, setInputImporte] = useState<number>(0);
  const [inputFechaPago, setInputFechaPago] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [inputMetodoPago, setInputMetodoPago] = useState<
    'transferencia' | 'domiciliacion' | 'bizum' | 'efectivo' | 'otro'
  >('transferencia');
  const [inputEstado, setInputEstado] = useState<EstadoCobroAlquiler>('PAGADO');
  const [inputObservaciones, setInputObservaciones] = useState<string>('');
  const [inputReferencia, setInputReferencia] = useState<string>('');
  const [justificanteFile, setJustificanteFile] = useState<File | null>(null);
  const [isSavingPago, setIsSavingPago] = useState<boolean>(false);

  // Incidencia
  const [cobroParaIncidencia, setCobroParaIncidencia] = useState<CobroPeriodo | null>(null);
  const [motivoIncidencia, setMotivoIncidencia] = useState<string>('');

  // Gastos reales para fiscalidad anual (reutiliza colección existente, no segunda BD)
  const [gastosReales, setGastosReales] = useState<Gasto[]>([]);
  useEffect(() => {
    const unsub = subscribeGastosSeguros(currentUser as any, (items) => setGastosReales(items));
    return () => unsub();
  }, [currentUser?.id]);

  // 1. Todos los cobros (contratos ya scoped por propietario)
  const allCobros = useMemo(() => {
    return obtenerTodosCobros(contratos);
  }, [contratos]);

  // 2. Filtrados
  const filteredCobros = useMemo(() => {
    return allCobros.filter((c) => {
      if (selectedYear !== 0 && c.anio !== selectedYear) return false;
      if (selectedMonth !== 'TODOS' && c.mes !== selectedMonth) return false;
      if (selectedInmuebleId !== 'TODOS' && c.inmuebleId !== selectedInmuebleId) return false;
      if (selectedEstado !== 'TODOS' && c.estado !== selectedEstado) return false;
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

  const metrics = useMemo(() => {
    return calcularResumenCobros(filteredCobros);
  }, [filteredCobros]);

  const alertasImpago: AlertaImpago[] = useMemo(() => {
    return generarAlertasImpago(filteredCobros);
  }, [filteredCobros]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(currentYear);
    years.add(currentYear - 1);
    for (const c of allCobros) {
      years.add(c.anio);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [allCobros, currentYear]);

  const handleOpenEditPago = (cobro: CobroPeriodo) => {
    setCobroToEdit(cobro);
    setInputImporte(cobro.importeRecibido > 0 ? cobro.importeRecibido : cobro.importePrevisto);
    setInputFechaPago(cobro.fechaPago || new Date().toISOString().split('T')[0]);
    setInputMetodoPago(cobro.metodoPago || 'transferencia');
    // Lógica nuevo estado: si ya pagado mantener, si no PAGADO por defecto
    setInputEstado(
      cobro.estado === 'PAGADO' || cobro.estado === 'PAGADO_PARCIAL' || cobro.estado === 'IMPAGADO' || cobro.estado === 'ANULADO'
        ? cobro.estado
        : 'PAGADO'
    );
    setInputObservaciones(cobro.observaciones || '');
    setInputReferencia(cobro.referenciaBancaria || '');
    setJustificanteFile(null);
  };

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

      let justificanteData: JustificanteCobro | undefined = cobroToEdit.justificante;
      if (justificanteFile) {
        try {
          const uploadRes = await uploadCobroJustificanteStorage(
            cobroToEdit.id,
            justificanteFile,
            justificanteFile.name
          );
          justificanteData = {
            id: `just_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            nombreArchivo: justificanteFile.name,
            tipoMime: justificanteFile.type,
            tamanoBytes: justificanteFile.size,
            fechaSubida: new Date().toISOString(),
            subidoPor: currentUser?.nombre || currentUser?.email || 'Administrador',
            storagePath: uploadRes.storagePath,
            url: uploadRes.downloadUrl,
            downloadURL: uploadRes.downloadUrl,
          };
        } catch (err) {
          console.warn('Fallback justificante local', err);
          justificanteData = {
            id: `just_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            nombreArchivo: justificanteFile.name,
            tipoMime: justificanteFile.type,
            tamanoBytes: justificanteFile.size,
            fechaSubida: new Date().toISOString(),
            subidoPor: currentUser?.nombre || currentUser?.email || 'Administrador',
            storagePath: `cobros/${cobroToEdit.id}/${justificanteFile.name}`,
            url: URL.createObjectURL(justificanteFile),
            downloadURL: URL.createObjectURL(justificanteFile),
          };
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

  const resumenFiscal: ResumenFiscalAnual | null = useMemo(() => {
    if (!fiscalInmuebleId || !showFiscalModal) return null;
    return generarResumenFiscalAnual(
      fiscalInmuebleId,
      fiscalYear,
      inmuebles,
      contratos,
      gastosReales,
      currentUser
    );
  }, [fiscalInmuebleId, fiscalYear, inmuebles, contratos, gastosReales, currentUser, showFiscalModal]);

  const renderEstadoBadge = (estado: EstadoCobroAlquiler) => {
    switch (estado) {
      case 'PAGADO':
      case 'RECIBIDO':
      case 'VERIFICADO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            PAGADO
          </span>
        );
      case 'PAGADO_PARCIAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            PARCIAL
          </span>
        );
      case 'IMPAGADO':
      case 'RETRASADO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            IMPAGADO
          </span>
        );
      case 'ANULADO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200 line-through">
            ANULADO
          </span>
        );
      case 'INCIDENCIA':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            INCIDENCIA
          </span>
        );
      case 'PENDIENTE':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            PENDIENTE
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
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
                Circuito: Recibo Mensual → Estado → Registro Pago → Justificante → Vencimiento → Impago → Alerta → Histórico
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
          >
            <FileCheck2 className="w-4 h-4 text-indigo-600" />
            <span>Resumen Fiscal Anual</span>
          </button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>Previsto</span>
            <Calendar className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {metrics.totalPrevisto.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
          </div>
          <div className="text-[11px] text-slate-500">
            {metrics.totalPeriodos} recibos · {metrics.countCobrados} pagados
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-2xs space-y-1 bg-gradient-to-br from-white to-emerald-50/30">
          <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold">
            <span>Cobrado</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 font-mono">
            {metrics.totalRecibido.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
          </div>
          <div className="text-[11px] text-emerald-600 flex items-center justify-between">
            <span>{metrics.countCobrados} PAGADO</span>
            <span className="font-bold font-mono">{metrics.porcentajeCobrado}%</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-amber-700 text-xs font-semibold">
            <span>Parcial / Pendiente</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 font-mono">
            {(metrics.totalPendiente + metrics.totalParcial).toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
          </div>
          <div className="text-[11px] text-slate-500">
            {metrics.countParcial} parciales · {metrics.countPendientes} pendientes
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-2xs space-y-1 bg-gradient-to-br from-white to-rose-50/20">
          <div className="flex items-center justify-between text-rose-700 text-xs font-semibold">
            <span>Impagado</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-rose-600 font-mono">
            {metrics.totalImpagado.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
          </div>
          <div className="text-[11px] text-rose-600 font-medium">
            {metrics.countImpagados} impagos · {alertasImpago.length} alertas
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Histórico</span>
            <History className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-700 font-mono">
            {metrics.countConJustificante}
          </div>
          <div className="text-[11px] text-slate-500">
            justificantes · {metrics.countAnulados} anulados
          </div>
        </div>
      </div>

      {/* Alertas Impago */}
      {alertasImpago.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            <span>Alerta Interna Impagos ({alertasImpago.length}) - No email automático</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {alertasImpago.slice(0, 6).map((alerta) => (
              <div key={alerta.cobroId} className="bg-white border border-rose-100 rounded-xl p-3 text-xs space-y-1 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{alerta.nombreMes}</span>
                  <span className="font-mono text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">
                    {alerta.diasRetraso} días retraso
                  </span>
                </div>
                <div className="text-slate-600 truncate">{alerta.inmuebleDireccion}</div>
                <div className="flex justify-between font-mono">
                  <span>Previsto: {alerta.importePrevisto}€</span>
                  <span className="font-bold text-rose-600">Pendiente: {alerta.importePendiente}€</span>
                </div>
                <div className="text-[10px] text-slate-400">Vencimiento: {alerta.fechaVencimiento}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <Filter className="w-4 h-4 text-blue-600" />
          <span>Filtrar Control Mensual</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
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

          <div>
            <label className="block font-semibold text-slate-600 mb-1">Estado</label>
            <select
              value={selectedEstado}
              onChange={(e) => setSelectedEstado(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
            >
              <option value="TODOS">Todos</option>
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="PAGADO">PAGADO</option>
              <option value="PAGADO_PARCIAL">PAGADO_PARCIAL</option>
              <option value="IMPAGADO">IMPAGADO</option>
              <option value="ANULADO">ANULADO</option>
              <option value="RECIBIDO">RECIBIDO (compat)</option>
              <option value="RETRASADO">RETRASADO (compat)</option>
            </select>
          </div>

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

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <Banknote className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-sm text-slate-900">
              Listado Mensual ({filteredCobros.length}) - Previsto / Cobrado / Pendiente / Días Retraso
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-medium hidden sm:block">
            Unicidad contratoId+periodo · No borrado físico · Histórico trazable
          </span>
        </div>

        {filteredCobros.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Receipt className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-700 text-sm">No hay registros de cobros para este filtro</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Los periodos mensuales se generan automáticamente vinculados al contrato activo.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Periodo</th>
                  <th className="py-3 px-4">Inmueble / Inquilino</th>
                  <th className="py-3 px-4 text-right">Previsto</th>
                  <th className="py-3 px-4 text-right">Cobrado</th>
                  <th className="py-3 px-4 text-right">Pendiente</th>
                  <th className="py-3 px-4">Vencimiento / Retraso</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                  <th className="py-3 px-4 text-center">Justificante</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCobros.map((cobro) => {
                  const pendiente = (cobro.importePrevisto || 0) - (cobro.importeRecibido || 0);
                  const diasRetraso = calcularDiasRetraso(cobro.fechaVencimiento);
                  const vencido = estaVencido(cobro.fechaVencimiento);

                  return (
                    <tr key={cobro.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-blue-600" />
                          <span>{cobro.nombreMes}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-normal block">
                          {cobro.periodoMesAnio} · {cobro.contratoId.slice(0, 8)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 truncate max-w-[180px]">
                          {cobro.inmuebleDireccion}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3 text-slate-400" />
                          <span className="font-medium text-slate-700 truncate">{cobro.inquilinoNombre || 'Inquilino'}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-700 whitespace-nowrap">
                        {cobro.importePrevisto.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {cobro.importeRecibido > 0 ? (
                          <span className="font-mono font-bold text-emerald-700">
                            {cobro.importeRecibido.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">0,00 €</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span className={`font-mono font-bold ${pendiente > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          {pendiente.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                        </span>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="text-[11px]">{cobro.fechaVencimiento}</div>
                        {vencido && cobro.estado !== 'PAGADO' && cobro.estado !== 'ANULADO' ? (
                          <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded font-bold">
                            {diasRetraso} días retraso
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            {cobro.fechaPago ? `Pagado: ${cobro.fechaPago}` : 'No vencido'}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {renderEstadoBadge(cobro.estado)}
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {cobro.justificante ? (
                          <a
                            href={cobro.justificante.url || cobro.justificante.downloadURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-[11px] font-bold hover:bg-blue-100"
                            title={`Archivo: ${cobro.justificante.nombreArchivo}`}
                          >
                            <Paperclip className="w-3.5 h-3.5 text-blue-600" />
                            <span className="truncate max-w-[80px]">{cobro.justificante.nombreArchivo}</span>
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenEditPago(cobro)}
                            className="text-slate-400 hover:text-blue-600 text-[11px] flex items-center justify-center gap-1 mx-auto transition-colors"
                          >
                            <Upload className="w-3 h-3" />
                            <span>Adjuntar</span>
                          </button>
                        )}
                      </td>

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
                            onClick={() => setCobroParaTrazabilidad(cobro)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Histórico trazable"
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

      {/* MODAL REGISTRAR PAGO */}
      {cobroToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base">Registrar Cobro - Recibo Mensual</h3>
              </div>
              <button type="button" onClick={() => setCobroToEdit(null)} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePagoSubmit} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">{cobroToEdit.nombreMes}</span>
                  <span className="font-mono text-xs font-bold text-slate-600">
                    Previsto: {cobroToEdit.importePrevisto.toFixed(2)} € | Pendiente: {(cobroToEdit.importePrevisto - cobroToEdit.importeRecibido).toFixed(2)} €
                  </span>
                </div>
                <p className="text-slate-600 text-[11px] truncate"><strong>InmuebleId:</strong> {cobroToEdit.inmuebleId} · <strong>ContratoId:</strong> {cobroToEdit.contratoId}</p>
                <p className="text-slate-600 text-[11px]"><strong>Inmueble:</strong> {cobroToEdit.inmuebleDireccion} · <strong>Periodo:</strong> {cobroToEdit.periodoMesAnio}</p>
                <p className="text-slate-600 text-[11px]"><strong>Vencimiento:</strong> {cobroToEdit.fechaVencimiento} · <strong>Días retraso:</strong> {calcularDiasRetraso(cobroToEdit.fechaVencimiento)}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Importe Recibido (€) *</label>
                  <input type="number" step="0.01" min="0" required value={inputImporte} onChange={(e) => setInputImporte(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-900" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fecha Real Pago *</label>
                  <input type="date" required value={inputFechaPago} onChange={(e) => setInputFechaPago(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Método</label>
                  <select value={inputMetodoPago} onChange={(e) => setInputMetodoPago(e.target.value as any)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
                    <option value="transferencia">Transferencia</option>
                    <option value="domiciliacion">Domiciliación</option>
                    <option value="bizum">Bizum</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Estado (PAGADO/PARCIAL/IMPAGADO/ANULADO)</label>
                  <select value={inputEstado} onChange={(e) => setInputEstado(e.target.value as EstadoCobroAlquiler)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
                    <option value="PAGADO">PAGADO (recibido==previsto)</option>
                    <option value="PAGADO_PARCIAL">PAGADO_PARCIAL (&gt;0 &lt;previsto)</option>
                    <option value="PENDIENTE">PENDIENTE</option>
                    <option value="IMPAGADO">IMPAGADO (0 y vencido)</option>
                    <option value="ANULADO">ANULADO</option>
                    <option value="RECIBIDO">RECIBIDO (compat)</option>
                    <option value="VERIFICADO">VERIFICADO (compat)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Referencia Bancaria / Observación</label>
                <input type="text" placeholder="Ej. TRANS-BBVA-94819" value={inputReferencia} onChange={(e) => setInputReferencia(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Justificante (Storage reutilizado, no público)</label>
                {cobroToEdit.justificante && !justificanteFile && (
                  <div className="mb-2 p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-blue-600" />
                      <div>
                        <span className="font-bold text-blue-900 block">{cobroToEdit.justificante.nombreArchivo}</span>
                        <span className="text-[10px] text-blue-700">Storage: {cobroToEdit.justificante.storagePath}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Enlazado</span>
                  </div>
                )}
                <div className="border border-dashed border-slate-300 rounded-xl p-3 text-center bg-slate-50">
                  <input type="file" id="justificanteUpload" accept=".pdf,image/*" onChange={(e) => { if (e.target.files && e.target.files[0]) setJustificanteFile(e.target.files[0]); }} className="hidden" />
                  <label htmlFor="justificanteUpload" className="cursor-pointer flex flex-col items-center justify-center gap-1 text-slate-600 hover:text-blue-600">
                    <Upload className="w-5 h-5 text-slate-400" />
                    <span className="font-semibold text-xs">{justificanteFile ? `Seleccionado: ${justificanteFile.name}` : 'Seleccionar justificante'}</span>
                    <span className="text-[10px] text-slate-400">Guarda storagePath/downloadURL/nombre/fecha/tipo</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observaciones</label>
                <textarea rows={2} value={inputObservaciones} onChange={(e) => setInputObservaciones(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setCobroToEdit(null)} className="px-4 py-2 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 text-xs">Cancelar</button>
                <button type="submit" disabled={isSavingPago} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50">
                  <Banknote className="w-4 h-4" />
                  <span>{isSavingPago ? 'Guardando...' : 'Confirmar Pago'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TRAZABILIDAD */}
      {cobroParaTrazabilidad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base">Histórico Trazable - No Borrado Físico</h3>
              </div>
              <button type="button" onClick={() => setCobroParaTrazabilidad(null)} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900">{cobroParaTrazabilidad.nombreMes}</span>
                  {renderEstadoBadge(cobroParaTrazabilidad.estado)}
                </div>
                <p className="text-[11px] text-slate-600"><strong>ContratoId+Periodo (unicidad):</strong> {cobroParaTrazabilidad.contratoId}+{cobroParaTrazabilidad.periodoMesAnio}</p>
                <p className="text-[11px] text-slate-600"><strong>Previsto/Cobrado/Pendiente:</strong> {cobroParaTrazabilidad.importePrevisto}€ / {cobroParaTrazabilidad.importeRecibido}€ / {(cobroParaTrazabilidad.importePrevisto - cobroParaTrazabilidad.importeRecibido)}€</p>
                <p className="text-[11px] text-slate-600"><strong>Vencimiento:</strong> {cobroParaTrazabilidad.fechaVencimiento} · <strong>Días retraso:</strong> {calcularDiasRetraso(cobroParaTrazabilidad.fechaVencimiento)}</p>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-2">Historial Inmutable</h4>
                {cobroParaTrazabilidad.historialCambios && cobroParaTrazabilidad.historialCambios.length > 0 ? (
                  <div className="space-y-2 border-l-2 border-slate-200 pl-3 ml-1">
                    {cobroParaTrazabilidad.historialCambios.map((h) => (
                      <div key={h.id} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{h.accion}</span>
                          <span className="text-[10px] text-slate-400">{new Date(h.fecha).toLocaleString('es-ES')}</span>
                        </div>
                        {h.detalles && <p className="text-slate-600 text-[11px]">{h.detalles}</p>}
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200/60">
                          <span>Usuario: {h.usuarioNombre || 'Sistema'}</span>
                          {h.estadoNuevo && <span className="font-semibold text-slate-600">Estado: {h.estadoNuevo}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 italic">Sin historial adicional.</p>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end shrink-0 bg-slate-50">
              <button type="button" onClick={() => setCobroParaTrazabilidad(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl text-xs">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FISCAL ANUAL COMPLETO - Circuito cerrado ARENA D */}
      {showFiscalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-5xl overflow-hidden max-h-[90vh] flex flex-col my-auto">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-indigo-900 text-white shrink-0">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-indigo-300" />
                <div>
                  <h3 className="font-bold text-base">Resumen Fiscal Anual - Circuito Completo (Ingresos + Gastos + Deducibles + Resultado Neto)</h3>
                  <p className="text-[11px] text-indigo-200">Inmueble → Ejercicio → Contrato/Inquilino → Ingresos → Gastos → Deducibles → Documentación → Resultado Neto → Histórico</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowFiscalModal(false)} className="p-1 text-indigo-300 hover:text-white rounded-lg hover:bg-indigo-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 text-xs overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl">
                <div>
                  <label className="block font-bold text-indigo-950 mb-1">Inmueble (solo autorizados)</label>
                  <select value={fiscalInmuebleId} onChange={(e) => setFiscalInmuebleId(e.target.value)} className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-semibold">
                    {inmuebles.map((i) => (
                      <option key={i.id} value={i.id}>{i.direccion} ({i.ciudad})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-indigo-950 mb-1">Ejercicio Fiscal (2024/2025/2026)</label>
                  <select value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))} className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-semibold">
                    {availableYears.map((y) => (
                      <option key={y} value={y}>Ejercicio {y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {resumenFiscal ? (
                <div className="space-y-4">
                  {/* Cabecera inmueble */}
                  <div className="p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-indigo-300" />
                        <span className="font-bold text-sm">{resumenFiscal.inmuebleDireccion}</span>
                        <span className="text-[11px] text-slate-300">• {resumenFiscal.inmuebleCiudad} • ID {resumenFiscal.inmuebleId}</span>
                      </div>
                      <span className="font-mono text-xs font-bold bg-indigo-600 px-2 py-0.5 rounded-full">Ejercicio {resumenFiscal.ejercicio} • Fuente {resumenFiscal.fuente}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                      <div className="p-2 bg-slate-800 rounded-xl"><span className="text-slate-400 block text-[10px] uppercase">Propietario</span><strong>{resumenFiscal.propietarioNombre || resumenFiscal.propietarioId}</strong></div>
                      <div className="p-2 bg-slate-800 rounded-xl"><span className="text-slate-400 block text-[10px] uppercase">Contratos/Inquilinos</span><strong>{resumenFiscal.numContratos} / {resumenFiscal.numInquilinos}</strong></div>
                      <div className="p-2 bg-slate-800 rounded-xl"><span className="text-slate-400 block text-[10px] uppercase">Días alquilados</span><strong>{resumenFiscal.diasAlquilados} días</strong></div>
                      <div className="p-2 bg-slate-800 rounded-xl"><span className="text-slate-400 block text-[10px] uppercase">Documentación</span><strong>{resumenFiscal.numDocumentos} docs</strong></div>
                    </div>
                  </div>

                  {/* Métricas económicas */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-bold text-emerald-800 block">Ingresos Cobrados</span>
                      <span className="text-xl font-bold font-mono text-emerald-700 block mt-1">{resumenFiscal.ingresos.totalCobrado.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                      <span className="text-[10px] text-emerald-600">Previstos {resumenFiscal.ingresos.totalPrevisto}€</span>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-bold text-slate-600 block">Gastos Totales</span>
                      <span className="text-xl font-bold font-mono text-slate-800 block mt-1">{resumenFiscal.gastos.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                      <span className="text-[10px] text-slate-500">{resumenFiscal.gastos.countTotal} gastos</span>
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-bold text-blue-800 block">Deducibles</span>
                      <span className="text-xl font-bold font-mono text-blue-700 block mt-1">{resumenFiscal.gastos.totalDeducible.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                      <span className="text-[10px] text-blue-600">{resumenFiscal.gastos.countDeducible} deducibles</span>
                    </div>
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-bold text-indigo-800 block">Resultado Neto (Cobrado - Deducible)</span>
                      <span className={`text-xl font-bold font-mono block mt-1 ${resumenFiscal.resultadoNetoOperativo >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>{resumenFiscal.resultadoNetoOperativo.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                      <span className="text-[10px] text-slate-500">Margen {resumenFiscal.margenOperativo}%</span>
                    </div>
                  </div>

                  {/* Ingresos detalle */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="p-2 bg-slate-50 border-b font-bold flex items-center gap-2"><Euro className="w-4 h-4 text-emerald-600" />Ingresos {resumenFiscal.ejercicio} - {resumenFiscal.ingresos.countTotal} cobros (previstos/cobrados/pendientes/impagados/parciales/anulados)</div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 text-[11px]">
                      {resumenFiscal.ingresos.cobros.map((c) => (
                        <div key={c.id} className="p-2 flex items-center justify-between">
                          <span className="font-bold">{c.nombreMes} - {c.inquilinoNombre}</span>
                          <span className="font-mono">{c.importePrevisto}€ previsto / {c.importeRecibido}€ cobrado - {c.estado}</span>
                          <span>{c.justificante ? `📎 ${c.justificante.nombreArchivo}` : '— sin justificante'}</span>
                        </div>
                      ))}
                      {resumenFiscal.ingresos.cobros.length === 0 && <div className="p-4 text-center text-slate-400 italic">Sin ingresos (inmueble sin actividad)</div>}
                    </div>
                  </div>

                  {/* Gastos detalle con deducibilidad */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="p-2 bg-slate-50 border-b font-bold flex items-center gap-2"><Receipt className="w-4 h-4 text-blue-600" />Gastos {resumenFiscal.ejercicio} - {resumenFiscal.gastos.countTotal} gastos ({resumenFiscal.gastos.countDeducible} deducibles / {resumenFiscal.gastos.countNoDeducible} no deducibles)</div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 text-[11px]">
                      {resumenFiscal.gastos.gastos.map((g) => (
                        <div key={g.id} className="p-2 flex items-center justify-between">
                          <span className="font-bold">{g.fecha} {g.concepto} ({g.categoria})</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${esGastoDeducible(g) ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{esGastoDeducible(g) ? 'DEDUCIBLE' : 'NO DEDUCIBLE'}</span>
                          <span className="font-mono font-bold">{g.importe}€</span>
                          <span className="text-slate-500">{g.trabajoId ? `OT ${g.trabajoId.slice(0, 6)}` : ''} {g.categoria === 'SEGUROS' ? 'Seguro' : ''}</span>
                          <span>{g.documento ? `📎 ${g.documento.nombre}` : '— sin justificante'}</span>
                        </div>
                      ))}
                      {resumenFiscal.gastos.gastos.length === 0 && <div className="p-4 text-center text-slate-400 italic">Sin gastos (inmueble sin gastos)</div>}
                    </div>
                  </div>

                  {/* Contratos / sucesión */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="p-2 bg-slate-50 border-b font-bold flex items-center gap-2"><FileSignature className="w-4 h-4 text-indigo-600" />Sucesión Inquilinos / Contratos - Sin sobrescribir histórico - {resumenFiscal.numContratos} contratos / {resumenFiscal.numInquilinos} inquilinos</div>
                    <div className="p-2 space-y-1 text-[11px]">
                      {resumenFiscal.periodosOcupacion.map((p) => (
                        <div key={p.contratoId} className="flex justify-between bg-slate-50 border rounded p-1.5">
                          <span className="font-bold">{p.inquilinoNombre} {p.fechaInicio} → {p.fechaFin || 'vigente'}</span>
                          <span className="font-mono">{p.diasAlquiladosEjercicio} días / {p.rentaMensual}€ mes / Prev {p.ingresosPrevistosEjercicio}€ Cob {p.ingresosCobradosEjercicio}€</span>
                        </div>
                      ))}
                      {resumenFiscal.periodosOcupacion.length === 0 && <span className="text-slate-400 italic">Inmueble sin actividad en {resumenFiscal.ejercicio}</span>}
                    </div>
                    {resumenFiscal.periodosSinAlquiler.length > 0 && (
                      <div className="p-2 bg-amber-50 border-t text-[11px]">
                        <strong>Periodos sin alquiler identificables:</strong> {resumenFiscal.periodosSinAlquiler.map((p) => `${p.inicio}→${p.fin} (${p.dias}d)`).join(', ')}
                      </div>
                    )}
                  </div>

                  {/* Documentación */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="p-2 bg-slate-50 border-b font-bold flex items-center gap-2"><FileText className="w-4 h-4 text-blue-600" />Documentación Fiscal - Reutiliza Storage, no duplica ({resumenFiscal.numDocumentos} docs)</div>
                    <div className="p-2 grid grid-cols-1 md:grid-cols-2 gap-1 text-[11px]">
                      {resumenFiscal.documentacion.map((d) => (
                        <div key={d.id} className="p-1.5 bg-slate-50 border rounded flex justify-between">
                          <span className="truncate font-bold">{d.nombreArchivo} • {d.tipo} • {d.importe}€ • {d.concepto}</span>
                          <span className="font-mono text-[10px] text-slate-400 truncate">{d.storagePath || 'sin storagePath'}</span>
                        </div>
                      ))}
                      {resumenFiscal.documentacion.length === 0 && <span className="text-slate-400 italic">Sin documentación vinculada (gastos sin justificante / cobros sin justificante)</span>}
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800">
                    <strong>Módulo información fiscal - No declaración tributaria:</strong> Resultado Neto = Ingresos cobrados - Gastos deducibles. Fórmula no incluye IRPF final. Revisar con asesor.
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 italic">Selecciona inmueble y ejercicio fiscal.</div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end shrink-0 bg-slate-50">
              <button type="button" onClick={() => setShowFiscalModal(false)} className="px-4 py-2 bg-indigo-800 hover:bg-indigo-900 text-white font-semibold rounded-xl text-xs">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
