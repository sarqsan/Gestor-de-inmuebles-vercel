import React, { useState, useMemo, useEffect } from 'react';
import {
  ContratoFormalizacion,
  Gasto,
  Inmueble,
  UsuarioApp,
} from '../../types';
import {
  generarResumenFiscalAnual,
  generarHistoricoFiscalInmueble,
  esGastoDeducible,
  validarConsistenciaFiscal,
  ResumenFiscalAnual,
  integrarFiscalConRentabilidad,
} from '../../utils/fiscalEngine';
import { subscribeGastosSeguros } from '../../lib/firebase';
import {
  Building2,
  Calendar,
  Euro,
  FileText,
  Filter,
  Receipt,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  Paperclip,
  History,
  Search,
  BarChart3,
  Wallet,
  PieChart,
  FileCheck2,
  Shield,
  Wrench,
} from 'lucide-react';

interface FiscalidadSectionProps {
  inmuebles: Inmueble[];
  contratos: ContratoFormalizacion[];
  gastos?: Gasto[];
  currentUser?: UsuarioApp | null;
  onNavigateToInmueble?: (inmuebleId: string) => void;
}

export const FiscalidadSection: React.FC<FiscalidadSectionProps> = ({
  inmuebles,
  contratos,
  gastos: gastosProp,
  currentUser,
  onNavigateToInmueble,
}) => {
  const isProfesional = currentUser?.tipoPerfil === 'PROFESIONAL';
  const currentYear = new Date().getFullYear();

  // Suscripción gastos reales si no vienen por prop (reutiliza colección existente, no segunda BD)
  const [gastosState, setGastosState] = useState<Gasto[]>(gastosProp || []);
  useEffect(() => {
    if (gastosProp && gastosProp.length > 0) {
      setGastosState(gastosProp);
      return;
    }
    if (gastosProp && gastosProp.length === 0) {
      // Si prop es array vacío, intentar suscribir igualmente para obtener datos reales de Firestore
      const unsub = subscribeGastosSeguros((items) => {
        if (items.length > 0) setGastosState(items);
      }, currentUser as any);
      return () => unsub();
    }
  }, [gastosProp, currentUser?.id]);
  const gastos = gastosProp && gastosProp.length > 0 ? gastosProp : gastosState;

  const [selectedInmuebleId, setSelectedInmuebleId] = useState<string>(
    inmuebles.length > 0 ? inmuebles[0].id : ''
  );
  const [selectedEjercicio, setSelectedEjercicio] = useState<number>(currentYear);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Profesional denegado
  if (isProfesional) {
    return (
      <div className="space-y-6 pb-12">
        <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-2xs text-center space-y-3">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Acceso restringido - Información fiscal privada</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            El módulo fiscal contiene ingresos, resultados y documentación privada. Solo propietarios autorizados y administradores.
          </p>
        </div>
      </div>
    );
  }

  const ejerciciosDisponibles = useMemo(() => {
    const years = new Set<number>();
    years.add(currentYear);
    years.add(currentYear - 1);
    years.add(currentYear - 2);
    // Derivar de cobros y gastos existentes
    for (const c of contratos) {
      if (c.fechaInicioContrato) {
        const d = new Date(c.fechaInicioContrato);
        if (!isNaN(d.getTime())) years.add(d.getFullYear());
      }
      if (c.registroCobros) {
        for (const cob of c.registroCobros) {
          years.add(cob.anio);
        }
      }
    }
    for (const g of gastos) {
      const d = new Date(g.fecha);
      if (!isNaN(d.getTime())) years.add(d.getFullYear());
      if (g.ejercicioFiscal) years.add(g.ejercicioFiscal);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [contratos, gastos, currentYear]);

  const inmueblesFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return inmuebles;
    const term = searchTerm.toLowerCase();
    return inmuebles.filter(
      (i) =>
        i.direccion.toLowerCase().includes(term) ||
        i.ciudad.toLowerCase().includes(term) ||
        i.id.toLowerCase().includes(term)
    );
  }, [inmuebles, searchTerm]);

  const resumenActual: ResumenFiscalAnual | null = useMemo(() => {
    if (!selectedInmuebleId) return null;
    return generarResumenFiscalAnual(
      selectedInmuebleId,
      selectedEjercicio,
      inmuebles,
      contratos,
      gastos,
      currentUser
    );
  }, [selectedInmuebleId, selectedEjercicio, inmuebles, contratos, gastos, currentUser]);

  const historico = useMemo(() => {
    if (!selectedInmuebleId) return [];
    return generarHistoricoFiscalInmueble(
      selectedInmuebleId,
      ejerciciosDisponibles,
      inmuebles,
      contratos,
      gastos,
      currentUser
    );
  }, [selectedInmuebleId, ejerciciosDisponibles, inmuebles, contratos, gastos, currentUser]);

  const validacion = useMemo(() => {
    if (!resumenActual) return null;
    return validarConsistenciaFiscal(resumenActual);
  }, [resumenActual]);

  const rentabilidad = useMemo(() => {
    if (!resumenActual) return null;
    return integrarFiscalConRentabilidad(resumenActual);
  }, [resumenActual]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Fiscalidad Anual de Alquileres</h2>
            <p className="text-xs text-slate-500">
              Circuito: Inmueble → Ejercicio → Contrato/Inquilino → Ingresos → Gastos → Deducibles → Documentación → Resumen → Resultado Neto → Histórico
            </p>
          </div>
        </div>
      </div>

      {/* Selectores */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <Filter className="w-4 h-4 text-indigo-600" />
          <span>Propietario → Inmueble → Fiscalidad → Ejercicio → Resumen</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Inmueble (solo autorizados)</label>
            <select
              value={selectedInmuebleId}
              onChange={(e) => setSelectedInmuebleId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
            >
              {inmueblesFiltrados.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.direccion} - {i.ciudad} ({i.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">Ejercicio Fiscal</label>
            <select
              value={selectedEjercicio}
              onChange={(e) => setSelectedEjercicio(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
            >
              {ejerciciosDisponibles.map((y) => (
                <option key={y} value={y}>
                  Ejercicio {y} {y === currentYear ? '(Actual)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">Buscar inmueble</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Dirección, ciudad, ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
            </div>
          </div>
        </div>
      </div>

      {!resumenActual ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-2xs text-center space-y-3">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
          <p className="font-bold text-slate-700 text-sm">Selecciona un inmueble para ver su fiscalidad anual</p>
          <p className="text-xs text-slate-500">Los datos se derivan de cobros, gastos y contratos existentes, sin duplicar.</p>
        </div>
      ) : (
        <>
          {/* Validación consistencia */}
          {validacion && !validacion.valido && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs space-y-1">
              <div className="font-bold text-rose-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Errores de consistencia fiscal detectados</span>
              </div>
              {validacion.errores.map((e, idx) => (
                <div key={idx} className="text-rose-700">• {e}</div>
              ))}
            </div>
          )}

          {/* Cabecera resumen */}
          <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Building2 className="w-6 h-6 text-indigo-300" />
                <div>
                  <h3 className="font-bold text-lg">{resumenActual.inmuebleDireccion}</h3>
                  <p className="text-xs text-slate-300">
                    {resumenActual.inmuebleCiudad} • ID {resumenActual.inmuebleId} • Ejercicio {resumenActual.ejercicio} • Fuente: {resumenActual.fuente}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-3 py-1 bg-indigo-600 rounded-full font-bold">Ejercicio {resumenActual.ejercicio}</span>
                <span className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-full">
                  {resumenActual.diasAlquilados} días alquilados / {resumenActual.diasSinAlquilar} sin alquilar
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                <span className="text-slate-400 block text-[10px] uppercase">Propietario</span>
                <strong className="text-white block">{resumenActual.propietarioNombre || resumenActual.propietarioId || '—'}</strong>
              </div>
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                <span className="text-slate-400 block text-[10px] uppercase">Contratos / Inquilinos</span>
                <strong className="text-white block">{resumenActual.numContratos} contratos / {resumenActual.numInquilinos} inquilinos</strong>
              </div>
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                <span className="text-slate-400 block text-[10px] uppercase">Periodos sin alquiler identificables</span>
                <strong className="text-white block">{resumenActual.periodosSinAlquiler.length} periodos</strong>
              </div>
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                <span className="text-slate-400 block text-[10px] uppercase">Documentación</span>
                <strong className="text-white block">{resumenActual.numDocumentos} justificantes vinculados</strong>
              </div>
            </div>
          </div>

          {/* Resumen económico principal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-2xs space-y-1 bg-gradient-to-br from-white to-emerald-50/30">
              <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold">
                <span>Ingresos Cobrados</span>
                <Wallet className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-700 font-mono">
                {resumenActual.ingresos.totalCobrado.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
              </div>
              <div className="text-[11px] text-emerald-600">
                Previstos: {resumenActual.ingresos.totalPrevisto.toLocaleString('es-ES')} € • {resumenActual.ingresos.countCobrados} cobros
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                <span>Gastos Totales</span>
                <Receipt className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {resumenActual.gastos.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
              </div>
              <div className="text-[11px] text-slate-500">
                {resumenActual.gastos.countTotal} gastos • {resumenActual.gastos.gastosConJustificante} con justificante
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-blue-700 text-xs font-semibold">
                <span>Gastos Deducibles</span>
                <Shield className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-blue-700 font-mono">
                {resumenActual.gastos.totalDeducible.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
              </div>
              <div className="text-[11px] text-blue-600">
                {resumenActual.gastos.countDeducible} deducibles / {resumenActual.gastos.countNoDeducible} no deducibles
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-indigo-200 shadow-2xs space-y-1 bg-gradient-to-br from-white to-indigo-50/40">
              <div className="flex items-center justify-between text-indigo-700 text-xs font-semibold">
                <span>Resultado Neto Operativo</span>
                <TrendingUp className="w-4 h-4 text-indigo-600" />
              </div>
              <div className={`text-2xl font-bold font-mono ${resumenActual.resultadoNetoOperativo >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
                {resumenActual.resultadoNetoOperativo.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
              </div>
              <div className="text-[11px] text-slate-500">
                Fórmula: Cobrado - Deducible • Margen {resumenActual.margenOperativo}% • Bruto {resumenActual.resultadoBruto.toLocaleString('es-ES')} €
              </div>
            </div>
          </div>

          {/* Ingresos detalle */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900">Ingresos del Ejercicio {resumenActual.ejercicio} (reutiliza cobros existentes, no copia física)</h3>
              </div>
              <span className="text-[11px] text-slate-500">
                {resumenActual.ingresos.countTotal} cobros • Previsto {resumenActual.ingresos.totalPrevisto}€ • Pendiente {resumenActual.ingresos.totalPendiente}€ • Impagado {resumenActual.ingresos.totalImpagado}€ • Parcial {resumenActual.ingresos.totalParcial}€ • Anulado {resumenActual.ingresos.totalAnulado}€
              </span>
            </div>

            {resumenActual.ingresos.cobros.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 italic">Sin ingresos en este ejercicio (inmueble sin ingresos / sin actividad).</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Mes</th>
                      <th className="py-2 px-3">Inquilino / Contrato</th>
                      <th className="py-2 px-3 text-right">Previsto</th>
                      <th className="py-2 px-3 text-right">Cobrado</th>
                      <th className="py-2 px-3 text-right">Pendiente</th>
                      <th className="py-2 px-3 text-center">Estado</th>
                      <th className="py-2 px-3">Justificante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {resumenActual.ingresos.cobros.map((c) => {
                      const pendiente = (c.importePrevisto || 0) - (c.importeRecibido || 0);
                      return (
                        <tr key={c.id} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 font-bold">{c.nombreMes}</td>
                          <td className="py-2 px-3">
                            <div className="font-semibold">{c.inquilinoNombre}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{c.contratoId.slice(0, 12)} • {c.periodoMesAnio}</div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">{c.importePrevisto.toFixed(2)} €</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">{c.importeRecibido.toFixed(2)} €</td>
                          <td className="py-2 px-3 text-right font-mono text-rose-600">{pendiente.toFixed(2)} €</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${c.estado === 'PAGADO' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : c.estado === 'IMPAGADO' ? 'bg-rose-50 text-rose-700 border-rose-200' : c.estado === 'PAGADO_PARCIAL' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                              {c.estado}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            {c.justificante ? (
                              <a href={c.justificante.url || c.justificante.downloadURL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                                <Paperclip className="w-3 h-3" />
                                <span className="truncate max-w-[100px]">{c.justificante.nombreArchivo}</span>
                              </a>
                            ) : (
                              <span className="text-slate-300">— sin justificante</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Gastos detalle */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">Gastos del Ejercicio {resumenActual.ejercicio} (reutiliza gastos existentes)</h3>
              </div>
              <span className="text-[11px] text-slate-500">
                Deducibles {resumenActual.gastos.totalDeducible}€ • No deducibles {resumenActual.gastos.totalNoDeducible}€ • Con justificante {resumenActual.gastos.gastosConJustificante} • Sin justificante {resumenActual.gastos.gastosSinJustificante} • OT {resumenActual.gastos.gastosVinculadosOT} • Seguro {resumenActual.gastos.gastosVinculadosSeguro}
              </span>
            </div>

            {resumenActual.gastos.gastos.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 italic">Sin gastos en este ejercicio (inmueble sin gastos / sin actividad).</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Fecha / Concepto</th>
                      <th className="py-2 px-3">Categoría / Deducible</th>
                      <th className="py-2 px-3 text-right">Importe</th>
                      <th className="py-2 px-3">Proveedor / OT / Seguro</th>
                      <th className="py-2 px-3">Justificante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {resumenActual.gastos.gastos.map((g) => (
                      <tr key={g.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3">
                          <div className="font-semibold">{g.fecha} - {g.concepto}</div>
                          <div className="text-[10px] text-slate-400">{g.id.slice(0, 12)} • Estado {g.estado}</div>
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-slate-50 border-slate-200">{g.categoria}</span>
                          <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${esGastoDeducible(g) ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                            {esGastoDeducible(g) ? 'DEDUCIBLE' : 'NO DEDUCIBLE'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold">{g.importe.toFixed(2)} €</td>
                        <td className="py-2 px-3 text-[11px]">
                          <div>{g.proveedor || '—'}</div>
                          <div className="text-slate-400">
                            {g.trabajoId ? `OT ${g.trabajoId.slice(0, 8)} • ` : ''}{g.incidenciaId ? `Inc ${g.incidenciaId.slice(0, 8)} • ` : ''}{g.categoria === 'SEGUROS' ? 'Seguro' : ''}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          {g.documento ? (
                            <a href={g.documento.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                              <Paperclip className="w-3 h-3" />
                              <span className="truncate max-w-[100px]">{g.documento.nombre}</span>
                            </a>
                          ) : (
                            <span className="text-slate-300">— sin justificante</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Por categoría */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1"><PieChart className="w-4 h-4 text-blue-600" /> Gastos por categoría (totales)</h4>
                <div className="space-y-1">
                  {Object.entries(resumenActual.gastos.porCategoria).map(([cat, imp]) => (
                    <div key={cat} className="flex justify-between font-mono text-[11px]">
                      <span>{cat}</span><strong>{(imp as number).toFixed(2)} €</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-bold text-slate-800 mb-2">Deducibles por categoría</h4>
                <div className="space-y-1">
                  {Object.entries(resumenActual.gastos.porCategoriaDeducible).map(([cat, imp]) => (
                    <div key={cat} className="flex justify-between font-mono text-[11px]">
                      <span>{cat}</span><strong className="text-blue-700">{(imp as number).toFixed(2)} €</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-bold text-slate-800 mb-2">No deducibles por categoría</h4>
                <div className="space-y-1">
                  {Object.entries(resumenActual.gastos.porCategoriaNoDeducible).map(([cat, imp]) => (
                    <div key={cat} className="flex justify-between font-mono text-[11px]">
                      <span>{cat}</span><strong className="text-amber-700">{(imp as number).toFixed(2)} €</strong>
                    </div>
                  ))}
                  {Object.keys(resumenActual.gastos.porCategoriaNoDeducible).length === 0 && (
                    <span className="text-slate-400 italic">Ninguno</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Contratos / Inquilinos / Ocupación */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-sm text-slate-900">Sucesión Inquilinos / Contratos - Ejercicio {resumenActual.ejercicio} (sin sobrescribir histórico)</h3>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-indigo-800 block">Días alquilados / sin alquilar</span>
                  <strong className="block mt-1">{resumenActual.diasAlquilados} días alquilados / {resumenActual.diasSinAlquilar} días sin alquilar</strong>
                  <span className="text-[11px] text-indigo-600">{resumenActual.numContratos} contratos, {resumenActual.numInquilinos} inquilinos únicos</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-slate-600 block">Periodos alquilados identificables</span>
                  <div className="mt-1 space-y-1">
                    {resumenActual.periodosAlquilados.map((p, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{p.inicio} → {p.fin}</span><strong>{p.inquilino}</strong>
                      </div>
                    ))}
                    {resumenActual.periodosAlquilados.length === 0 && <span className="text-slate-400 italic">Sin ocupación identificable</span>}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-600 border-b">
                    <tr>
                      <th className="py-2 px-3">Contrato / Inquilino</th>
                      <th className="py-2 px-3">Periodo ocupación</th>
                      <th className="py-2 px-3 text-right">Días ejercicio</th>
                      <th className="py-2 px-3 text-right">Renta / Previsto / Cobrado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resumenActual.periodosOcupacion.map((p) => (
                      <tr key={p.contratoId} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3">
                          <div className="font-bold">{p.inquilinoNombre}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{p.contratoId.slice(0, 12)} • {p.inquilinoId.slice(0, 8)} {p.inquilinoDni ? `• ${p.inquilinoDni}` : ''}</div>
                        </td>
                        <td className="py-2 px-3">{p.fechaInicio} → {p.fechaFin || 'vigente'}</td>
                        <td className="py-2 px-3 text-right font-mono">{p.diasAlquiladosEjercicio}</td>
                        <td className="py-2 px-3 text-right font-mono">
                          <div>{p.rentaMensual}€/mes</div>
                          <div className="text-[11px]">Prev {p.ingresosPrevistosEjercicio}€ / Cob {p.ingresosCobradosEjercicio}€</div>
                        </td>
                      </tr>
                    ))}
                    {resumenActual.periodosOcupacion.length === 0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-slate-400 italic">Inmueble sin actividad en {resumenActual.ejercicio}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {resumenActual.periodosSinAlquiler.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-700 mb-1">Periodos sin alquiler identificables con datos existentes</h4>
                  <div className="flex flex-wrap gap-2">
                    {resumenActual.periodosSinAlquiler.map((p, idx) => (
                      <span key={idx} className="px-2 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[11px] font-mono">
                        {p.inicio} → {p.fin} ({p.dias} días)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Documentación fiscal */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <h3 className="font-bold text-sm text-slate-900">Documentación Fiscal {resumenActual.ejercicio} - Reutiliza referencias Storage, no duplica archivos</h3>
            </div>
            <div className="p-4">
              {resumenActual.documentacion.length === 0 ? (
                <div className="text-xs text-slate-400 italic text-center py-6">Sin documentación vinculada (gastos sin justificante / cobros sin justificante).</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  {resumenActual.documentacion.map((doc) => (
                    <div key={doc.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                      <div className="truncate">
                        <div className="font-bold truncate flex items-center gap-1">
                          <Paperclip className="w-3 h-3 text-blue-600" />
                          <span className="truncate">{doc.nombreArchivo}</span>
                          <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] border ${doc.tipo === 'INGRESO' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{doc.tipo}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{doc.concepto} • {doc.fecha} • {doc.importe}€ • Ref {doc.referenciaId.slice(0, 8)}</div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">{doc.storagePath || 'sin storagePath'}</div>
                      </div>
                      {doc.downloadURL || doc.url ? (
                        <a href={doc.downloadURL || doc.url} target="_blank" rel="noreferrer" className="ml-2 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold hover:bg-slate-100 shrink-0">Ver</a>
                      ) : (
                        <span className="text-slate-300 text-[10px]">—</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Rentabilidad integración */}
          {rentabilidad && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                <span>Rentabilidad integrada (reutiliza motor existente, no segundo motor)</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl"><span className="block text-[10px] text-slate-500 uppercase">Ingresos</span><strong className="block text-sm">{rentabilidad.ingresos} €</strong></div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl"><span className="block text-[10px] text-slate-500 uppercase">Gastos totales</span><strong className="block text-sm">{rentabilidad.gastos} €</strong></div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl"><span className="block text-[10px] text-blue-700 uppercase">Gastos deducibles</span><strong className="block text-sm text-blue-700">{rentabilidad.gastosDeducibles} €</strong></div>
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl"><span className="block text-[10px] text-indigo-700 uppercase">Resultado neto / Rentabilidad</span><strong className="block text-sm text-indigo-700">{rentabilidad.resultadoNeto} € / {rentabilidad.rentabilidadEstimada}%</strong></div>
              </div>
            </div>
          )}

          {/* Histórico anual */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center gap-2">
              <History className="w-4 h-4 text-slate-600" />
              <h3 className="font-bold text-sm text-slate-900">Histórico Anual - Consulta 2024/2025/2026 independiente, datos derivados no sobrescritos</h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                {historico.map((h) => (
                  <button
                    key={h.ejercicio}
                    onClick={() => setSelectedEjercicio(h.ejercicio)}
                    className={`p-3 rounded-xl border text-left space-y-1 transition-all ${h.ejercicio === selectedEjercicio ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200' : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-indigo-200'}`}
                  >
                    <div className="flex items-center justify-between">
                      <strong className="font-bold">Ejercicio {h.ejercicio}</strong>
                      <span className={`font-mono font-bold ${h.resultadoNetoOperativo >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{h.resultadoNetoOperativo.toFixed(0)} € neto</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Cobrado {h.ingresos.totalCobrado}€ / Gastos {h.gastos.total}€ / Deducible {h.gastos.totalDeducible}€ • {h.numContratos} contratos • {h.diasAlquilados} días alquilados
                    </div>
                    <div className="text-[10px] text-slate-400">Fuente: {h.fuente} • {h.numDocumentos} docs</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Nota IRPF */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800 space-y-1">
            <div className="font-bold flex items-center gap-1"><Shield className="w-4 h-4 text-amber-600" /> Módulo de información fiscal y preparación de datos - No es declaración tributaria</div>
            <p>Resultado neto = Ingresos cobrados - Gastos deducibles. No calcula IRPF final. Debe ser revisado por asesor fiscal. Datos derivados de cobros/gastos/contratos existentes.</p>
          </div>
        </>
      )}
    </div>
  );
};
