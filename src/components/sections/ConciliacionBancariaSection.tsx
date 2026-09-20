import React, { useState, useMemo } from 'react';
import { MovimientoBancario, PropuestaConciliacion, ImportacionBancaria, ResumenConciliacion, TipoClasificacionNoConciliado, DEFAULT_CONFIG_MATCHING } from '../../types/conciliacion';
import { CobroPeriodo, Gasto, Inmueble, ContratoFormalizacion, UsuarioApp } from '../../types';
import { importarDesdeCSV, importarDesdeOFX, importarDesdeMT940, importarDesdeNorma43, detectarFormato } from '../../utils/conciliacion/importEngine';
import { crearPropuestasParaMovimientos, confirmarPropuesta, rechazarPropuesta, marcarNoConciliable, aplicarConciliacion, calcularResumenConciliacion } from '../../utils/conciliacion/conciliacionEngine';
import { buscarCandidatos } from '../../utils/conciliacion/matchingEngine';
import { CsvMapping } from '../../utils/conciliacion/csvParser';
import { Upload, FileText, AlertTriangle, CheckCircle2, XCircle, Clock, Search, Filter, Download, Eye, Banknote, TrendingDown, Shield, FileCheck2, BarChart3 } from 'lucide-react';

interface ConciliacionBancariaSectionProps {
  inmuebles: Inmueble[];
  contratos: ContratoFormalizacion[];
  gastos: Gasto[];
  cobros?: CobroPeriodo[];
  currentUser?: UsuarioApp | null;
}

export const ConciliacionBancariaSection: React.FC<ConciliacionBancariaSectionProps> = ({
  inmuebles,
  contratos,
  gastos,
  cobros,
  currentUser,
}) => {
  const [movimientos, setMovimientos] = useState<MovimientoBancario[]>([]);
  const [propuestas, setPropuestas] = useState<PropuestaConciliacion[]>([]);
  const [importaciones, setImportaciones] = useState<ImportacionBancaria[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [busqueda, setBusqueda] = useState<string>('');
  const [selectedMovimiento, setSelectedMovimiento] = useState<MovimientoBancario | null>(null);
  const [selectedPropuesta, setSelectedPropuesta] = useState<PropuestaConciliacion | null>(null);
  const [csvMapping, setCsvMapping] = useState<CsvMapping>({});
  const [nombreFichero, setNombreFichero] = useState<string>('');

  const allCobros = useMemo(() => {
    if (cobros && cobros.length>0) return cobros;
    const todos: CobroPeriodo[] = [];
    for (const c of contratos) {
      if (c.registroCobros) todos.push(...c.registroCobros);
    }
    return todos;
  }, [cobros, contratos]);

  const propietarioId = useMemo(() => {
    if (currentUser?.tipoPerfil === 'PROPIETARIO' && currentUser.propietarioId) return currentUser.propietarioId;
    return inmuebles[0]?.propietarioId || inmuebles[0]?.propietarioPrincipalId || 'prop_demo';
  }, [currentUser, inmuebles]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNombreFichero(file.name);
    const contenido = await file.text();
    const formato = detectarFormato(contenido);

    let resultado;
    try {
      if (formato === 'CSV') {
        resultado = importarDesdeCSV(contenido, propietarioId, movimientos, csvMapping, file.name, undefined, currentUser?.email);
      } else if (formato === 'OFX') {
        resultado = importarDesdeOFX(contenido, propietarioId, movimientos, file.name, undefined, currentUser?.email);
      } else if (formato === 'MT940') {
        resultado = importarDesdeMT940(contenido, propietarioId, movimientos, file.name, currentUser?.email);
      } else if (formato === 'NORMA43') {
        resultado = importarDesdeNorma43(contenido, propietarioId, movimientos, file.name, undefined, currentUser?.email);
      } else {
        // Intentar CSV por defecto
        resultado = importarDesdeCSV(contenido, propietarioId, movimientos, csvMapping, file.name, undefined, currentUser?.email);
      }

      setMovimientos(prev => [...prev, ...resultado.nuevos]);
      setImportaciones(prev => [...prev, resultado.importacion]);

      // Generar propuestas
      const nuevasPropuestas = crearPropuestasParaMovimientos(resultado.nuevos, allCobros, gastos, inmuebles, contratos, DEFAULT_CONFIG_MATCHING);
      setPropuestas(prev => [...prev, ...nuevasPropuestas]);

      if (resultado.errores.length>0) {
        alert(`Importación con errores: ${resultado.errores.slice(0,3).join(', ')}`);
      }

      // Notificación (reutiliza motor existente) — solo log, no segundo dispatcher
      console.log(`[GAP6] Importación ${formato} ${resultado.importacion.id}: ${resultado.nuevos.length} nuevos, ${resultado.duplicados.length} duplicados`);
    } catch (err: any) {
      alert(`Error importando: ${err.message}`);
    }
  };

  const propuestasFiltradas = useMemo(() => {
    return propuestas.filter(p => {
      if (filtroEstado !== 'TODOS' && p.estado !== filtroEstado) return false;
      if (filtroTipo !== 'TODOS') {
        if (filtroTipo === 'INGRESO' && p.importeMovimiento <0) return false;
        if (filtroTipo === 'GASTO' && p.importeMovimiento >=0) return false;
      }
      if (busqueda.trim()) {
        const term = busqueda.toLowerCase();
        const mov = movimientos.find(m=>m.idMovimiento===p.movimientoId);
        if (!mov) return false;
        if (!mov.concepto.toLowerCase().includes(term) && !mov.idMovimiento.toLowerCase().includes(term) && !(mov.referencia||'').toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [propuestas, filtroEstado, filtroTipo, busqueda, movimientos]);

  const resumen: ResumenConciliacion = useMemo(() => calcularResumenConciliacion(propuestas), [propuestas]);

  const handleConfirmar = (propuesta: PropuestaConciliacion) => {
    try {
      const confirmada = confirmarPropuesta(propuesta, currentUser);
      setPropuestas(prev => prev.map(p=>p.id===propuesta.id ? confirmada : p));
      setSelectedPropuesta(confirmada);
    } catch (e:any) {
      alert(e.message);
    }
  };

  const handleAplicar = (propuesta: PropuestaConciliacion) => {
    const res = aplicarConciliacion(propuesta, allCobros, gastos, contratos, movimientos, currentUser);
    if (res.error) {
      alert(`No se puede aplicar: ${res.error}`);
      return;
    }
    setPropuestas(prev => prev.map(p=>p.id===propuesta.id ? res.propuestaActualizada : p));
    setSelectedPropuesta(res.propuestaActualizada);
    if (res.contratoActualizado) {
      console.log(`Contrato actualizado ${res.contratoActualizado.id} con trazabilidad conciliación`);
    }
  };

  const handleRechazar = (propuesta: PropuestaConciliacion) => {
    const rechazada = rechazarPropuesta(propuesta, currentUser, 'Rechazado por usuario');
    setPropuestas(prev => prev.map(p=>p.id===propuesta.id ? rechazada : p));
    setSelectedPropuesta(rechazada);
  };

  const handleNoConciliable = (propuesta: PropuestaConciliacion, clasif: TipoClasificacionNoConciliado) => {
    const noConc = marcarNoConciliable(propuesta, clasif, currentUser);
    setPropuestas(prev => prev.map(p=>p.id===propuesta.id ? noConc : p));
    setSelectedPropuesta(noConc);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white p-5 rounded-2xl border shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <Banknote className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Conciliación Bancaria Automática — GAP 6</h2>
            <p className="text-xs text-slate-500">Flujo: IMPORTAR → NORMALIZAR → VALIDAR → DUPLICADOS → CANDIDATOS → MATCH → CONFIANZA → PROPONER → CONFIRMAR → APLICAR → TRAZABILIDAD. No modifica cobros/gastos históricos automáticamente. Toda conciliación detectada→propuesta→validada→aplicada→trazable.</p>
          </div>
        </div>
      </div>

      {/* Importar */}
      <div className="bg-white p-4 rounded-2xl border shadow-2xs space-y-3">
        <h3 className="font-bold text-sm flex items-center gap-2"><Upload className="w-4 h-4 text-indigo-600" />Importar Extracto — CSV / OFX / MT940 / Norma43</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="col-span-2">
            <label className="block font-semibold mb-1">Fichero bancario</label>
            <input type="file" accept=".csv,.ofx,.mt940,.txt,.043" onChange={handleFileUpload} className="w-full px-3 py-2 bg-slate-50 border rounded-xl" />
            <p className="text-[11px] text-slate-500 mt-1">Detecta formato automáticamente. CSV permite mapear columnas. OFX usa FITID para idempotencia. MT940 soporta :20: :25: :28C: :60F:/:60M: :61: :86: :62F:/:62M:. Norma43 registros 11/22/23/88.</p>
          </div>
          <div>
            <label className="block font-semibold mb-1">Mapeo CSV (opcional)</label>
            <input placeholder="fecha columna" value={csvMapping.fecha||''} onChange={e=>setCsvMapping({...csvMapping, fecha: e.target.value})} className="w-full px-2 py-1 bg-slate-50 border rounded mb-1 text-xs" />
            <input placeholder="importe columna" value={csvMapping.importe||''} onChange={e=>setCsvMapping({...csvMapping, importe: e.target.value})} className="w-full px-2 py-1 bg-slate-50 border rounded mb-1 text-xs" />
            <input placeholder="concepto columna" value={csvMapping.concepto||''} onChange={e=>setCsvMapping({...csvMapping, concepto: e.target.value})} className="w-full px-2 py-1 bg-slate-50 border rounded text-xs" />
          </div>
        </div>
        {nombreFichero && <div className="text-xs text-slate-600">Último fichero: {nombreFichero}</div>}
      </div>

      {/* Resumen */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold flex items-center gap-2"><BarChart3 className="w-5 h-5 text-indigo-300" />Resumen Conciliación</h3>
          <span className="text-xs text-slate-300">{importaciones.length} importaciones</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-800 rounded-xl border border-slate-700"><span className="block text-[10px] text-slate-400 uppercase">Total movimientos</span><strong className="block text-lg">{resumen.totalMovimientos}</strong></div>
          <div className="p-3 bg-slate-800 rounded-xl border border-slate-700"><span className="block text-[10px] text-slate-400 uppercase">Pendientes</span><strong className="block text-lg text-amber-300">{resumen.pendientes}</strong></div>
          <div className="p-3 bg-slate-800 rounded-xl border border-slate-700"><span className="block text-[10px] text-slate-400 uppercase">Propuestos</span><strong className="block text-lg text-blue-300">{resumen.propuestos}</strong></div>
          <div className="p-3 bg-indigo-900/50 rounded-xl border border-indigo-700"><span className="block text-[10px] text-indigo-300 uppercase">Conciliados</span><strong className="block text-lg">{resumen.conciliados}</strong></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-[11px]">
          <div className="p-2 bg-emerald-900/30 border border-emerald-700 rounded-lg">ALTA: {resumen.altaConfianza}</div>
          <div className="p-2 bg-blue-900/30 border border-blue-700 rounded-lg">MEDIA: {resumen.mediaConfianza}</div>
          <div className="p-2 bg-amber-900/30 border border-amber-700 rounded-lg">BAJA: {resumen.bajaConfianza}</div>
          <div className="p-2 bg-slate-800 border border-slate-700 rounded-lg">SIN_MATCH: {resumen.sinMatch}</div>
          <div className="p-2 bg-rose-900/30 border border-rose-700 rounded-lg">Discrepancias: {resumen.discrepancias}</div>
          <div className="p-2 bg-slate-800 border border-slate-700 rounded-lg">No conciliables: {resumen.noConciliables}</div>
        </div>
      </div>

      {/* Filtros bandeja */}
      <div className="bg-white p-4 rounded-2xl border shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold"><Filter className="w-4 h-4 text-indigo-600" />Bandeja — Filtrar por estado/fecha/importe/inmueble/propietario/tipo</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)} className="px-3 py-2 bg-slate-50 border rounded-xl">
            <option value="TODOS">Todos estados</option>
            <option value="PENDIENTE">PENDIENTE</option>
            <option value="PROPUESTO">PROPUESTO</option>
            <option value="CONFIRMADO">CONFIRMADO</option>
            <option value="CONCILIADO">CONCILIADO</option>
            <option value="RECHAZADO">RECHAZADO</option>
            <option value="NO_CONCILIABLE">NO_CONCILIABLE</option>
            <option value="ERROR">ERROR</option>
          </select>
          <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)} className="px-3 py-2 bg-slate-50 border rounded-xl">
            <option value="TODOS">Todos tipos</option>
            <option value="INGRESO">INGRESO</option>
            <option value="GASTO">GASTO</option>
          </select>
          <div className="relative col-span-2">
            <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar concepto, referencia, id movimiento..." className="w-full pl-8 pr-3 py-2 bg-slate-50 border rounded-xl text-xs" />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>
      </div>

      {/* Tabla movimientos */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="p-4 border-b bg-slate-50/70 flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-600" /><h3 className="font-bold text-sm">Movimientos Bancarios ({propuestasFiltradas.length})</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-[10px] uppercase font-bold border-b"><tr><th className="py-2 px-3">Fecha</th><th className="py-2 px-3">Concepto</th><th className="py-2 px-3 text-right">Importe</th><th className="py-2 px-3">Tipo</th><th className="py-2 px-3">Estado</th><th className="py-2 px-3">Confianza</th><th className="py-2 px-3">Candidato</th><th className="py-2 px-3 text-right">Acciones</th></tr></thead>
            <tbody className="divide-y">
              {propuestasFiltradas.map(prop => {
                const mov = movimientos.find(m=>m.idMovimiento===prop.movimientoId);
                if (!mov) return null;
                return (
                  <tr key={prop.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono text-[11px]">{mov.fechaOperacion}</td>
                    <td className="py-2 px-3 truncate max-w-[250px]" title={mov.concepto}>{mov.concepto}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold">{mov.importe.toFixed(2)}€</td>
                    <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] border ${mov.tipo==='INGRESO'?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-rose-50 text-rose-700 border-rose-200'}`}>{mov.tipo}</span></td>
                    <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full bg-slate-100 border text-[10px]">{prop.estado}</span>{prop.esDiscrepancia && <span className="ml-1 text-amber-600">⚠ discrepancia</span>}</td>
                    <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] border ${prop.confianza==='ALTA'?'bg-emerald-50 text-emerald-700 border-emerald-200':prop.confianza==='MEDIA'?'bg-blue-50 text-blue-700 border-blue-200':prop.confianza==='BAJA'?'bg-amber-50 text-amber-700 border-amber-200':'bg-slate-100 text-slate-500'}`}>{prop.confianza} {prop.puntuacion}pts</span></td>
                    <td className="py-2 px-3 truncate max-w-[150px]">{prop.candidato ? `${prop.candidato.tipo} ${prop.candidato.id.slice(0,8)} ${prop.candidato.importe}€` : '—'}</td>
                    <td className="py-2 px-3 text-right flex gap-1 justify-end">
                      <button onClick={()=>{setSelectedMovimiento(mov); setSelectedPropuesta(prop);}} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg"><Eye className="w-3.5 h-3.5" /></button>
                      {prop.estado==='PROPUESTO' && <button onClick={()=>handleConfirmar(prop)} className="px-2 py-1 bg-blue-600 text-white rounded-lg font-bold text-[11px]">Confirmar</button>}
                      {prop.estado==='CONFIRMADO' && <button onClick={()=>handleAplicar(prop)} className="px-2 py-1 bg-emerald-600 text-white rounded-lg font-bold text-[11px]">Aplicar</button>}
                      {prop.estado!=='CONCILIADO' && prop.estado!=='RECHAZADO' && <button onClick={()=>handleRechazar(prop)} className="px-2 py-1 bg-slate-200 rounded-lg font-bold text-[11px]">Rechazar</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalle */}
      {selectedMovimiento && selectedPropuesta && (
        <div className="bg-white p-5 rounded-2xl border space-y-4">
          <div className="flex justify-between items-start">
            <h3 className="font-bold flex items-center gap-2"><FileCheck2 className="w-5 h-5 text-indigo-600" />Detalle Movimiento {selectedMovimiento.idMovimiento}</h3>
            <button onClick={()=>{setSelectedMovimiento(null); setSelectedPropuesta(null);}} className="p-1.5 bg-slate-100 rounded-lg"><XCircle className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2 p-3 bg-slate-50 border rounded-xl">
              <h4 className="font-bold">Movimiento Bancario</h4>
              <div>Fecha operación: {selectedMovimiento.fechaOperacion}</div>
              <div>Fecha valor: {selectedMovimiento.fechaValor||'—'}</div>
              <div>Importe: {selectedMovimiento.importe}€ ({selectedMovimiento.tipo})</div>
              <div>Concepto: {selectedMovimiento.concepto}</div>
              <div>Concepto original: {selectedMovimiento.conceptoOriginal.slice(0,200)}</div>
              <div>Referencia: {selectedMovimiento.referencia||'—'}</div>
              <div>Identificador banco: {selectedMovimiento.identificadorBanco||'—'} (FITID/MT940/Norma43)</div>
              <div>Origen: {selectedMovimiento.origen}</div>
              <div>Hash idempotencia: {selectedMovimiento.hashIdempotencia}</div>
              <div>IBAN: {selectedMovimiento.cuentaIban||'—'}</div>
            </div>
            <div className="space-y-2 p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
              <h4 className="font-bold">Propuesta Conciliación</h4>
              <div>Estado: {selectedPropuesta.estado}</div>
              <div>Confianza: {selectedPropuesta.confianza} — {selectedPropuesta.puntuacion}pts</div>
              <div>Importe movimiento: {selectedPropuesta.importeMovimiento}€ vs candidato {selectedPropuesta.importeCandidato}€ diff {selectedPropuesta.diferenciaImporte?.toFixed(2)}€ {selectedPropuesta.esDiscrepancia && <span className="text-amber-600 font-bold">DISCREPANCIA</span>}</div>
              <div>Candidato: {selectedPropuesta.candidato ? `${selectedPropuesta.candidato.tipo} ${selectedPropuesta.candidato.id} ${selectedPropuesta.candidato.inquilinoNombre||selectedPropuesta.candidato.proveedor||''}` : 'Sin candidato'}</div>
              <div>Factores:</div>
              <ul className="list-disc pl-4">
                {selectedPropuesta.factores.map((f,i)=><li key={i} className={f.coincide?'text-emerald-700':'text-slate-500'}>{f.criterio} {f.puntuacion}pts — {f.detalle} {f.coincide?'✅':'❌'}</li>)}
              </ul>
              <div className="pt-2 flex gap-2 flex-wrap">
                {selectedPropuesta.estado==='PROPUESTO' && <button onClick={()=>handleConfirmar(selectedPropuesta)} className="px-3 py-1.5 bg-blue-600 text-white rounded-xl font-bold">Confirmar</button>}
                {selectedPropuesta.estado==='CONFIRMADO' && <button onClick={()=>handleAplicar(selectedPropuesta)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl font-bold">Aplicar — No modifica importe histórico, solo trazabilidad</button>}
                <button onClick={()=>handleRechazar(selectedPropuesta)} className="px-3 py-1.5 bg-slate-200 rounded-xl font-bold">Rechazar</button>
                <button onClick={()=>handleNoConciliable(selectedPropuesta, 'COMISION_BANCARIA')} className="px-3 py-1.5 bg-amber-100 border border-amber-200 rounded-xl font-bold">Comisión bancaria</button>
                <button onClick={()=>handleNoConciliable(selectedPropuesta, 'TRANSFERENCIA_INTERNA')} className="px-3 py-1.5 bg-slate-100 border rounded-xl font-bold">Transferencia interna</button>
                <button onClick={()=>handleNoConciliable(selectedPropuesta, 'NO_IDENTIFICADO')} className="px-3 py-1.5 bg-slate-100 border rounded-xl font-bold">No identificar — No conciliar</button>
              </div>
              <div className="text-[11px] text-slate-500">Trazabilidad: {selectedPropuesta.historial.map(h=>`${h.fecha.slice(0,19)} ${h.accion} ${h.usuario||''}`).join(' | ')}</div>
            </div>
          </div>

          {selectedPropuesta.candidatosAlternativos && selectedPropuesta.candidatosAlternativos.length>0 && (
            <div className="p-3 bg-white border rounded-xl text-xs">
              <h4 className="font-bold mb-2">Candidatos alternativos</h4>
              <div className="space-y-1">
                {selectedPropuesta.candidatosAlternativos.map(c=><div key={c.id} className="flex justify-between p-2 bg-slate-50 border rounded-lg"><span>{c.tipo} {c.id.slice(0,8)} {c.importe}€ {c.fecha} {c.inquilinoNombre||c.proveedor}</span><button onClick={()=>{
                  const resultados = buscarCandidatos(selectedMovimiento, [], [], inmuebles, contratos);
                  const propuestaCambiada = {...selectedPropuesta, candidato: c};
                  // @ts-ignore
                  const nueva = {...selectedPropuesta, candidato: c};
                  setSelectedPropuesta(nueva);
                }} className="px-2 py-0.5 bg-blue-100 border border-blue-200 rounded text-[11px] font-bold">Seleccionar</button></div>)}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800 space-y-1">
        <div className="font-bold flex items-center gap-1"><Shield className="w-4 h-4 text-amber-600" />GAP 6 — Conciliación Bancaria — Reglas Fundamentales</div>
        <p>NO altera silenciosamente contabilidad operativa. No modifica cobros históricos automáticamente, no modifica gastos históricos, no elimina movimientos, no cambia importes históricos, no marca recibo como cobrado solo por coincidencia probabilística, no borra conciliaciones anteriores. Flujo detectada→propuesta→validada→aplicada→trazable. Automática solo para ALTA confianza inequívoca, validando candidato existe, no ya conciliado, no modificado, movimiento no duplicado. Si falla → revisión.</p>
        <p>Idempotencia por FITID/identificador banco/hash determinista. Parser→normalizador desacoplado. Criterios ponderables importe/fecha/referencia/concepto/estructural. Umbrales explícitos ALTA 85, MEDIA 60, BAJA 30. Discrepancias no modifican silenciosamente, se marcan. Movimientos no conciliados clasificables sin convertir automáticamente en gasto/ingreso.</p>
        <p>Seguridad: aislamiento por propietario/inmueble, propietario inmutable, no acceso cruzado, no credenciales bancarias, no claves/token bancarios.</p>
      </div>
    </div>
  );
};
