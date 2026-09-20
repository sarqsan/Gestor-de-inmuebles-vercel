import React, { useState, useMemo } from 'react';
import {
  Inmueble,
  ContratoFormalizacion,
  Gasto,
  Incidencia,
  PolizaSeguro,
  Siniestro,
  TrabajoProfesional,
  UsuarioApp,
  RangoFechas,
} from '../../types';
import {
  generarInformeCartera,
  generarInformeInmueble,
  generarInformeRentabilidad,
  generarInformeFiscal,
  generarExportacionFiscal,
  exportarCSV,
  exportarJSON,
  crearRangoMensual,
  crearRangoTrimestral,
  crearRangoAnual,
  crearRangoPersonalizado,
  filtrarInmueblesPorUsuario,
} from '../../utils/reportingEngine';
import { generarPdfCartera, generarPdfInmueble, generarPdfFiscal } from '../../utils/pdfExportEngine';
import {
  FileText,
  Download,
  BarChart3,
  Building2,
  Calendar,
  Filter,
  FileCheck2,
  Shield,
  AlertTriangle,
  Layers,
  TrendingUp,
  Wallet,
  Receipt,
  FileJson,
  FileSpreadsheet,
  FileDown,
} from 'lucide-react';

interface InformesSectionProps {
  inmuebles: Inmueble[];
  contratos: ContratoFormalizacion[];
  gastos: Gasto[];
  incidencias?: Incidencia[];
  polizas?: PolizaSeguro[];
  siniestros?: Siniestro[];
  trabajos?: TrabajoProfesional[];
  currentUser?: UsuarioApp | null;
}

export const InformesSection: React.FC<InformesSectionProps> = ({
  inmuebles,
  contratos,
  gastos,
  incidencias = [],
  polizas = [],
  siniestros = [],
  trabajos = [],
  currentUser,
}) => {
  const isProfesional = currentUser?.tipoPerfil === 'PROFESIONAL';
  const currentYear = new Date().getFullYear();

  const [selectedInmuebleId, setSelectedInmuebleId] = useState<string>('');
  const [ejercicio, setEjercicio] = useState<number>(currentYear);
  const [mes, setMes] = useState<number>(new Date().getMonth() + 1);
  const [trimestre, setTrimestre] = useState<number>(Math.floor(new Date().getMonth() / 3) + 1);
  const [periodoTipo, setPeriodoTipo] = useState<'MENSUAL' | 'TRIMESTRAL' | 'ANUAL' | 'PERSONALIZADO'>('ANUAL');
  const [fechaInicio, setFechaInicio] = useState<string>(`${currentYear}-01-01`);
  const [fechaFin, setFechaFin] = useState<string>(`${currentYear}-12-31`);
  const [vista, setVista] = useState<'CARTERA' | 'INMUEBLE' | 'RENTABILIDAD' | 'FISCAL' | 'EXPORT'>('CARTERA');

  const inmueblesFiltrados = useMemo(() => filtrarInmueblesPorUsuario(inmuebles, currentUser), [inmuebles, currentUser]);

  const rango: RangoFechas = useMemo(() => {
    if (periodoTipo === 'MENSUAL') return crearRangoMensual(ejercicio, mes);
    if (periodoTipo === 'TRIMESTRAL') return crearRangoTrimestral(ejercicio, trimestre);
    if (periodoTipo === 'ANUAL') return crearRangoAnual(ejercicio);
    return crearRangoPersonalizado(fechaInicio, fechaFin);
  }, [periodoTipo, ejercicio, mes, trimestre, fechaInicio, fechaFin]);

  const propietarioId = useMemo(() => {
    if (currentUser?.tipoPerfil === 'PROPIETARIO' && currentUser.propietarioId) return currentUser.propietarioId;
    return inmueblesFiltrados[0]?.propietarioId || inmueblesFiltrados[0]?.propietarioPrincipalId || 'prop_demo';
  }, [currentUser, inmueblesFiltrados]);

  const informeCartera = useMemo(() => {
    try {
      return generarInformeCartera(propietarioId, inmuebles, contratos, gastos, incidencias, polizas, siniestros, trabajos, rango, currentUser, currentUser?.nombre);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [propietarioId, inmuebles, contratos, gastos, incidencias, polizas, siniestros, trabajos, rango, currentUser]);

  const informeInmueble = useMemo(() => {
    if (!selectedInmuebleId) return null;
    try {
      return generarInformeInmueble(selectedInmuebleId, inmuebles, contratos, gastos, incidencias, polizas, rango, currentUser);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [selectedInmuebleId, inmuebles, contratos, gastos, incidencias, polizas, rango, currentUser]);

  const informeRentabilidad = useMemo(() => {
    try {
      return generarInformeRentabilidad(propietarioId, inmuebles, contratos, gastos, rango, currentUser, selectedInmuebleId || undefined);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [propietarioId, inmuebles, contratos, gastos, rango, currentUser, selectedInmuebleId]);

  const informeFiscal = useMemo(() => {
    try {
      return generarInformeFiscal(propietarioId, inmuebles, contratos, gastos, rango, currentUser, 'INMUEBLE');
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [propietarioId, inmuebles, contratos, gastos, rango, currentUser]);

  const exportacion = useMemo(() => {
    try {
      return generarExportacionFiscal(propietarioId, inmuebles, contratos, gastos, rango, currentUser, 'CSV');
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [propietarioId, inmuebles, contratos, gastos, rango, currentUser]);

  const handleExportCSV = () => {
    if (!exportacion) return;
    const csv = exportarCSV(exportacion);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export_fiscal_${propietarioId}_${rango.fechaInicio}_${rango.fechaFin}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    if (!exportacion) return;
    const json = exportarJSON(exportacion);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export_fiscal_${propietarioId}_${rango.fechaInicio}_${rango.fechaFin}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePdfCartera = async () => {
    if (!informeCartera) return;
    const { blob, nombre } = await generarPdfCartera(informeCartera);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePdfInmueble = async () => {
    if (!informeInmueble) return;
    const { blob, nombre } = await generarPdfInmueble(informeInmueble);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePdfFiscal = async () => {
    if (!informeFiscal) return;
    const { blob, nombre } = await generarPdfFiscal(informeFiscal);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isProfesional) {
    return (
      <div className="bg-white p-12 rounded-2xl border text-center space-y-3">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
        <h2 className="font-bold">Acceso restringido - Informes privados</h2>
        <p className="text-xs text-slate-500">Solo propietarios y administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Informes Ejecutivos, Rentabilidad y Exportación Fiscal Estructurada</h2>
            <p className="text-xs text-slate-500">Capa reporting independiente que consume motores existentes (cobros, gastos, fiscal, contratos, incidencias, seguros). No segundo motor económico. Exportación compatible con revisión/asesoría. No formato oficial AEAT salvo especificación verificada.</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-2xl border shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold"><Filter className="w-4 h-4 text-indigo-600" />Filtros: propietario, inmueble, ejercicio, fecha inicial/final, habitación</div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Vista</label>
            <select value={vista} onChange={e=>setVista(e.target.value as any)} className="w-full px-3 py-2 bg-slate-50 border rounded-xl font-semibold">
              <option value="CARTERA">Cartera</option>
              <option value="INMUEBLE">Por Inmueble</option>
              <option value="RENTABILIDAD">Rentabilidad</option>
              <option value="FISCAL">Fiscal Estructurada</option>
              <option value="EXPORT">Exportación CSV/JSON</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Inmueble</label>
            <select value={selectedInmuebleId} onChange={e=>setSelectedInmuebleId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border rounded-xl">
              <option value="">Todos (cartera)</option>
              {inmueblesFiltrados.map(i=><option key={i.id} value={i.id}>{i.direccion} - {i.ciudad}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Periodo</label>
            <select value={periodoTipo} onChange={e=>setPeriodoTipo(e.target.value as any)} className="w-full px-3 py-2 bg-slate-50 border rounded-xl">
              <option value="MENSUAL">Mensual</option>
              <option value="TRIMESTRAL">Trimestral</option>
              <option value="ANUAL">Anual</option>
              <option value="PERSONALIZADO">Personalizado</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Ejercicio</label>
            <select value={ejercicio} onChange={e=>setEjercicio(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-50 border rounded-xl">
              {[currentYear, currentYear-1, currentYear-2, currentYear-3].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            {periodoTipo==='MENSUAL' && (
              <div className="flex-1">
                <label className="block font-semibold text-slate-600 mb-1">Mes</label>
                <select value={mes} onChange={e=>setMes(Number(e.target.value))} className="w-full px-2 py-2 bg-slate-50 border rounded-xl">
                  {Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            {periodoTipo==='TRIMESTRAL' && (
              <div className="flex-1">
                <label className="block font-semibold text-slate-600 mb-1">Trimestre</label>
                <select value={trimestre} onChange={e=>setTrimestre(Number(e.target.value))} className="w-full px-2 py-2 bg-slate-50 border rounded-xl">
                  {[1,2,3,4].map(t=><option key={t} value={t}>T{t}</option>)}
                </select>
              </div>
            )}
            {periodoTipo==='PERSONALIZADO' && (
              <>
                <div className="flex-1">
                  <label className="block font-semibold text-slate-600 mb-1">Inicio</label>
                  <input type="date" value={fechaInicio} onChange={e=>setFechaInicio(e.target.value)} className="w-full px-2 py-2 bg-slate-50 border rounded-xl" />
                </div>
                <div className="flex-1">
                  <label className="block font-semibold text-slate-600 mb-1">Fin</label>
                  <input type="date" value={fechaFin} onChange={e=>setFechaFin(e.target.value)} className="w-full px-2 py-2 bg-slate-50 border rounded-xl" />
                </div>
              </>
            )}
          </div>
        </div>
        <div className="text-[11px] text-slate-500">Rango actual: {rango.fechaInicio} → {rango.fechaFin} ({rango.periodo}) {rango.ejercicio?`Ejercicio ${rango.ejercicio}`:''} - Fechas explícitas evita errores zona horaria, meses 28/29/30/31, cambio año, periodos incompletos</div>
      </div>

      {/* CARTERA */}
      {vista==='CARTERA' && informeCartera && (
        <>
          <div className="bg-slate-900 text-white p-5 rounded-2xl border space-y-3">
            <div className="flex justify-between">
              <div className="flex items-center gap-3"><Building2 className="w-6 h-6 text-indigo-300" /><div><h3 className="font-bold text-lg">Cartera {propietarioId} - {rango.fechaInicio}→{rango.fechaFin}</h3><p className="text-xs text-slate-300">Generado {new Date(informeCartera.fechaGeneracion).toLocaleString('es-ES')} • v{informeCartera.versionEsquema} • EUR</p></div></div>
              <button onClick={handlePdfCartera} className="px-3 py-1.5 bg-indigo-600 rounded-xl font-bold text-xs flex items-center gap-1"><FileDown className="w-4 h-4" />PDF Cartera</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-800 rounded-xl border border-slate-700"><span className="block text-[10px] text-slate-400 uppercase">Patrimonio</span><strong className="block">{informeCartera.patrimonio.numeroInmuebles} inmuebles, {informeCartera.patrimonio.inmueblesOcupados} ocupados, {informeCartera.patrimonio.inmueblesVacios} vacíos, {informeCartera.patrimonio.contratosActivos} contratos activos</strong></div>
              <div className="p-3 bg-slate-800 rounded-xl border border-slate-700"><span className="block text-[10px] text-slate-400 uppercase">Ingresos</span><strong className="block">{informeCartera.economia.ingresosTotales}€ cobrados / {informeCartera.economia.ingresosPrevistos}€ previstos</strong></div>
              <div className="p-3 bg-slate-800 rounded-xl border border-slate-700"><span className="block text-[10px] text-slate-400 uppercase">Gastos / Resultado</span><strong className="block">{informeCartera.economia.gastosTotales}€ gastos, {informeCartera.economia.resultado}€ resultado</strong></div>
              <div className="p-3 bg-indigo-900/50 rounded-xl border border-indigo-700"><span className="block text-[10px] text-indigo-300 uppercase">Rentabilidad</span><strong className="block text-lg">{informeCartera.economia.rentabilidadEstimada ?? 'N/D'}%</strong><span className="text-[10px] text-indigo-200">{informeCartera.economia.formulaRentabilidad}</span></div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border space-y-2 text-xs">
              <h4 className="font-bold flex items-center gap-1"><Layers className="w-4 h-4 text-indigo-600" />Operativa</h4>
              <div>Incidencias abiertas: {informeCartera.operativa.incidenciasAbiertas}</div>
              <div>Cerradas: {informeCartera.operativa.incidenciasCerradas}</div>
              <div>Urgentes: {informeCartera.operativa.incidenciasUrgentes}</div>
              <div>Pólizas activas: {informeCartera.operativa.polizasActivas}</div>
              <div>Próximas vencer: {informeCartera.operativa.polizasProximasVencer}</div>
              <div>Contratos próximos finalizar: {informeCartera.patrimonio.contratosProximosFinalizar}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border space-y-2 text-xs">
              <h4 className="font-bold flex items-center gap-1"><Calendar className="w-4 h-4 text-emerald-600" />Ocupación</h4>
              <div>Días alquilados: {informeCartera.ocupacion.diasAlquilados}</div>
              <div>Porcentaje: {informeCartera.ocupacion.porcentajeOcupacion}%</div>
              <div className="text-[11px] text-slate-500">{informeCartera.ocupacion.definicionOcupacion}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border space-y-2 text-xs">
              <h4 className="font-bold flex items-center gap-1"><Wallet className="w-4 h-4 text-amber-600" />Cobros / Deuda</h4>
              <div>Cobrados: {informeCartera.economia.cobrosRealizados}</div>
              <div>Pendientes: {informeCartera.economia.cobrosPendientes}</div>
              <div>Impagados: {informeCartera.economia.cobrosImpagados}</div>
              <div>Deuda: {informeCartera.economia.deudaPendiente}€</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border overflow-hidden">
            <div className="p-4 border-b bg-slate-50/70 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-indigo-600" /><h3 className="font-bold text-sm">Evolución Temporal {rango.periodo}</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-[10px] uppercase font-bold border-b"><tr><th className="py-2 px-3">Periodo</th><th className="py-2 px-3">Inicio/Fin</th><th className="py-2 px-3 text-right">Ingresos</th><th className="py-2 px-3 text-right">Gastos</th><th className="py-2 px-3 text-right">Resultado</th><th className="py-2 px-3 text-right">Contratos</th></tr></thead>
                <tbody className="divide-y">
                  {informeCartera.evolucion.map(e=><tr key={e.periodo} className="hover:bg-slate-50"><td className="py-2 px-3 font-bold">{e.periodo}</td><td className="py-2 px-3 font-mono text-[11px]">{e.fechaInicio}→{e.fechaFin}</td><td className="py-2 px-3 text-right font-mono">{e.ingresos}€</td><td className="py-2 px-3 text-right font-mono">{e.gastos}€</td><td className="py-2 px-3 text-right font-mono font-bold">{e.resultado}€</td><td className="py-2 px-3 text-right">{e.numContratos}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* INMUEBLE */}
      {vista==='INMUEBLE' && informeInmueble && (
        <>
          <div className="bg-slate-900 text-white p-5 rounded-2xl border space-y-3">
            <div className="flex justify-between"><div className="flex items-center gap-3"><Building2 className="w-6 h-6 text-indigo-300" /><div><h3 className="font-bold text-lg">{informeInmueble.inmuebleDireccion} - {informeInmueble.inmuebleCiudad}</h3><p className="text-xs text-slate-300">ID {informeInmueble.inmuebleId} • {rango.fechaInicio}→{rango.fechaFin} • {informeInmueble.modalidadAlquiler||'completo'}</p></div></div><button onClick={handlePdfInmueble} className="px-3 py-1.5 bg-indigo-600 rounded-xl font-bold text-xs flex items-center gap-1"><FileDown className="w-4 h-4" />PDF Inmueble</button></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-800 rounded-xl border border-slate-700"><span className="block text-[10px] text-slate-400 uppercase">Contratos</span><strong className="block">{informeInmueble.contratos.length} contratos</strong></div>
              <div className="p-3 bg-slate-800 rounded-xl border border-slate-700"><span className="block text-[10px] text-slate-400 uppercase">Ocupación</span><strong className="block">{informeInmueble.ocupacion.porcentajeOcupacion}%</strong></div>
              <div className="p-3 bg-slate-800 rounded-xl border border-slate-700"><span className="block text-[10px] text-slate-400 uppercase">Ingresos</span><strong className="block">{informeInmueble.economia.ingresosTotales}€</strong></div>
              <div className="p-3 bg-indigo-900/50 rounded-xl border border-indigo-700"><span className="block text-[10px] text-indigo-300 uppercase">Resultado</span><strong className="block">{informeInmueble.economia.resultado}€</strong></div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border overflow-hidden">
            <div className="p-4 border-b bg-slate-50/70"><h3 className="font-bold text-sm">Contratos - Modalidad vivienda/temporada/local/habitación - Estados reales</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-[10px] uppercase font-bold border-b"><tr><th className="py-2 px-3">Contrato</th><th className="py-2 px-3">Inquilino</th><th className="py-2 px-3">Modalidad</th><th className="py-2 px-3">Estado</th><th className="py-2 px-3">Periodo</th><th className="py-2 px-3 text-right">Renta</th><th className="py-2 px-3 text-right">Ingresos periodo</th></tr></thead>
                <tbody className="divide-y">
                  {informeInmueble.contratos.map(c=><tr key={c.contratoId}><td className="py-2 px-3 font-mono">{c.contratoId.slice(0,8)}</td><td className="py-2 px-3">{c.inquilinoNombre}</td><td className="py-2 px-3">{c.modalidad}</td><td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full bg-slate-100 border text-[10px]">{c.estado}</span></td><td className="py-2 px-3 font-mono text-[11px]">{c.fechaInicio}→{c.fechaFin||'vigente'}</td><td className="py-2 px-3 text-right">{c.rentaMensual}€</td><td className="py-2 px-3 text-right font-bold">{c.ingresosPeriodo}€ {c.esProximoFinalizar&&<span className="text-amber-600">⚠ próximo fin</span>}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>

          {informeInmueble.habitaciones && (
            <div className="bg-white p-4 rounded-2xl border text-xs">
              <h4 className="font-bold mb-2">Habitaciones - Inmueble vivienda completa vs habitaciones sin duplicar ingresos</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {informeInmueble.habitaciones.map(h=><div key={h.id} className="p-2 bg-slate-50 border rounded-xl"><strong>{h.identificador}</strong> ocupada={String(h.ocupada)} ingresos={h.ingresos}€</div>)}
              </div>
            </div>
          )}
        </>
      )}

      {/* RENTABILIDAD */}
      {vista==='RENTABILIDAD' && informeRentabilidad && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border space-y-3">
            <h3 className="font-bold flex items-center gap-2"><TrendingUp className="w-5 h-5 text-indigo-600" />Rentabilidad - Reutiliza motores existentes</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl"><span className="block text-[10px] uppercase">Ingresos</span><strong className="block text-lg">{informeRentabilidad.ingresos}€</strong></div>
              <div className="p-3 bg-slate-50 border rounded-xl"><span className="block text-[10px] uppercase">Gastos</span><strong className="block text-lg">{informeRentabilidad.gastos}€</strong></div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl"><span className="block text-[10px] uppercase">Resultado</span><strong className="block text-lg">{informeRentabilidad.resultado}€</strong></div>
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl"><span className="block text-[10px] uppercase">Rentabilidad estimada</span><strong className="block text-lg text-indigo-700">{informeRentabilidad.rentabilidadEstimada}%</strong><span className="text-[10px] text-slate-500">{informeRentabilidad.formula}</span></div>
            </div>
            <div className="text-[11px] text-slate-500">Definiciones disponibles: {informeRentabilidad.definicionesDisponibles.join(' | ')}</div>
            <div className="overflow-x-auto border rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-[10px] uppercase font-bold border-b"><tr><th className="py-2 px-3">Inmueble</th><th className="py-2 px-3 text-right">Ingresos</th><th className="py-2 px-3 text-right">Gastos</th><th className="py-2 px-3 text-right">Resultado</th><th className="py-2 px-3 text-right">Rentabilidad</th></tr></thead>
                <tbody className="divide-y">
                  {informeRentabilidad.detallePorInmueble?.map(d=><tr key={d.inmuebleId}><td className="py-2 px-3 font-bold">{d.direccion}</td><td className="py-2 px-3 text-right">{d.ingresos}€</td><td className="py-2 px-3 text-right">{d.gastos}€</td><td className="py-2 px-3 text-right">{d.resultado}€</td><td className="py-2 px-3 text-right">{d.rentabilidad}%</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* FISCAL */}
      {vista==='FISCAL' && informeFiscal && (
        <div className="space-y-4">
          <div className="bg-slate-900 text-white p-5 rounded-2xl border space-y-3">
            <div className="flex justify-between"><div><h3 className="font-bold text-lg">Informe Fiscal Estructurado - Ejercicio {informeFiscal.ejercicio} - Agrupación {informeFiscal.agrupacion}</h3><p className="text-xs text-slate-300">Conserva categorías fiscales, no inventa categorías</p></div><button onClick={handlePdfFiscal} className="px-3 py-1.5 bg-indigo-600 rounded-xl font-bold text-xs flex items-center gap-1"><FileDown className="w-4 h-4" />PDF Fiscal</button></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-800 rounded-xl border border-slate-700"><span className="block text-[10px] text-slate-400 uppercase">Ingresos</span><strong className="block">{informeFiscal.totalIngresos}€</strong></div>
              <div className="p-3 bg-slate-800 rounded-xl border border-slate-700"><span className="block text-[10px] text-slate-400 uppercase">Gastos</span><strong className="block">{informeFiscal.totalGastos}€</strong></div>
              <div className="p-3 bg-slate-800 rounded-xl border border-slate-700"><span className="block text-[10px] text-slate-400 uppercase">Deducibles</span><strong className="block">{informeFiscal.totalGastosDeducibles}€</strong></div>
              <div className="p-3 bg-indigo-900/50 rounded-xl border border-indigo-700"><span className="block text-[10px] text-indigo-300 uppercase">Resultado</span><strong className="block">{informeFiscal.totalResultado}€</strong></div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border overflow-hidden">
            <div className="p-4 border-b bg-slate-50/70"><h3 className="font-bold text-sm">Por Inmueble - Propietario, inmueble, ejercicio, concepto, ingresos, gastos, resultado</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-[10px] uppercase font-bold border-b"><tr><th className="py-2 px-3">Inmueble</th><th className="py-2 px-3 text-right">Ingresos</th><th className="py-2 px-3 text-right">Gastos</th><th className="py-2 px-3 text-right">Deducibles</th><th className="py-2 px-3 text-right">Resultado</th></tr></thead>
                <tbody className="divide-y">
                  {informeFiscal.porInmueble.map(p=><tr key={p.inmuebleId}><td className="py-2 px-3 font-bold">{p.direccion}</td><td className="py-2 px-3 text-right">{p.ingresos}€</td><td className="py-2 px-3 text-right">{p.gastos}€</td><td className="py-2 px-3 text-right">{p.gastosDeducibles}€</td><td className="py-2 px-3 text-right font-bold">{p.resultado}€</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-800">{informeFiscal.notaAEAT}</div>
        </div>
      )}

      {/* EXPORT */}
      {vista==='EXPORT' && exportacion && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border space-y-3">
            <h3 className="font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-600" />Exportación Fiscal Estructurada CSV/JSON - Compatible con revisión/asesoría</h3>
            <p className="text-xs text-slate-500">Incluye propietario, inmueble, ejercicio/período, concepto, fecha, importe, categoría, referencia, origen, identificadores. No incluye contraseñas, tokens, secretos. No es formato oficial AEAT salvo especificación verificada.</p>
            <div className="flex gap-2">
              <button onClick={handleExportCSV} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" />Exportar CSV ({exportacion.items.length} items)</button>
              <button onClick={handleExportJSON} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs flex items-center gap-2"><FileJson className="w-4 h-4" />Exportar JSON</button>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl"><span className="block text-[10px] uppercase">Total ingresos</span><strong>{exportacion.totalIngresos}€</strong></div>
              <div className="p-3 bg-slate-50 border rounded-xl"><span className="block text-[10px] uppercase">Total gastos</span><strong>{exportacion.totalGastos}€</strong></div>
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl"><span className="block text-[10px] uppercase">Resultado</span><strong>{exportacion.totalResultado}€</strong></div>
            </div>
            <div className="text-[11px] text-slate-500">{exportacion.nota}</div>
          </div>

          <div className="bg-white rounded-2xl border overflow-hidden">
            <div className="p-4 border-b bg-slate-50/70"><h3 className="font-bold text-sm">Vista previa exportación (primeros 20 items)</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-100 text-[10px] uppercase font-bold border-b"><tr><th className="py-2 px-2">Fecha</th><th className="py-2 px-2">Inmueble</th><th className="py-2 px-2">Concepto</th><th className="py-2 px-2 text-right">Importe</th><th className="py-2 px-2">Categoría</th><th className="py-2 px-2">Tipo</th><th className="py-2 px-2">Ref</th></tr></thead>
                <tbody className="divide-y">
                  {exportacion.items.slice(0,20).map((it, idx)=><tr key={idx}><td className="py-1 px-2 font-mono">{it.fecha}</td><td className="py-1 px-2 truncate max-w-[150px]">{it.inmuebleDireccion}</td><td className="py-1 px-2 truncate max-w-[200px]">{it.concepto}</td><td className="py-1 px-2 text-right font-mono">{it.importe}€</td><td className="py-1 px-2">{it.categoria}</td><td className="py-1 px-2">{it.tipo}</td><td className="py-1 px-2 font-mono text-[10px]">{it.referenciaId.slice(0,8)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800 space-y-1">
        <div className="font-bold flex items-center gap-1"><Shield className="w-4 h-4 text-amber-600" />EXPORTACIÓN ESTRUCTURADA IMPLEMENTADA - No formato oficial AEAT</div>
        <p>Este módulo implementa exportación fiscal estructurada compatible con procesos posteriores de revisión/asesoría. No afirma presentación oficial ante AEAT, formato oficial AEAT, fichero oficial de presentación ni integración directa con AEAT, salvo especificación oficial concreta verificada. Para integración oficial sería necesaria especificación oficial concreta del repositorio que permita demostrar versión/formato.</p>
        <p className="text-[11px]">Eventos extensión preparados: INFORME_GENERADO, EXPORTACION_GENERADA para integración con motor notificaciones GAP 1 B sin crear segundo dispatcher. Modalidades contrato reconocidas: vivienda habitual, temporada, local/uso distinto, habitación sin modificar motor contractual GAP 2 C.</p>
      </div>
    </div>
  );
};
