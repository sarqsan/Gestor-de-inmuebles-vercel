/**
 * BLOQUE 1 — CENTRO OPERATIVO DEL INMUEBLE.
 * ---------------------------------------------------------------------------
 * Punto central desde el que consultar la situación diaria del inmueble:
 * resumen, seguros (1 inmueble → N pólizas → N documentos), relación
 * avería↔póliza (sin afirmar cobertura) e histórico. ENLAZA los módulos ya
 * existentes (cobros, contratos, incidencias, mantenimiento, garantías,
 * sección global de pólizas): no los duplica.
 *
 * La lógica de dominio vive en `src/utils/segurosCentro.ts` (pura, testada);
 * aquí sólo presentación + persistencia vía `guardarPolizaConAuditoria`
 * (reutiliza `audit_logs`).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  CobroPeriodo,
  ContratoFormalizacion,
  Gasto,
  GarantiaReparacion,
  Incidencia,
  Inmueble,
  PolizaSeguro,
  TareaMantenimiento,
  UsuarioApp,
} from '../../types';
import {
  subscribePolizasSeguras,
  subscribeIncidencias,
  subscribeTareasMantenimiento,
  subscribeGarantiasReparacion,
  subscribeGastos,
  guardarPolizaConAuditoria,
} from '../../lib/firebase';
import {
  construirResumenOperativoInmueble,
  polizasDelInmueble,
  clasificarEvidenciaCobertura,
  evaluarVentanaRenovacion,
  cancelarPoliza,
  obtenerCadenaHistorialPoliza,
  type AnalisisCoberturaNoVinculante,
  type ResumenOperativoInmueble,
} from '../../utils/segurosCentro';
import { evaluarCoberturaPolizas } from '../../utils/segurosEngine';
import { OperacionesInmueble } from '../../features/operaciones/ui/OperacionesInmueble';
import {
  registrarAuditoriaFirestore,
} from '../../lib/firebase';
import { generarExpedienteFiscal, empaquetarExpediente } from '../../lib/expedienteFiscal/motor';
import { utf8Bytes } from '../../lib/expedienteFiscal/zip';
import {
  construirExpedienteDocumentalInmueble,
  prepararEntradaIndiceParaExportacion,
} from '../../lib/expedienteDocumental/expediente';
import { construirAuditoriaExpediente } from '../../lib/expedienteDocumental/auditoria';
import type { DocumentoPatrimonial, ExpedienteDocumentalInmueble } from '../../lib/expedienteDocumental/tipos';
import { subscribeDocumentosPatrimoniales } from '../../lib/expedienteDocumental/gestorFirebase';
import { DocumentosPatrimonialesPanel } from './DocumentosPatrimonialesPanel';
import {
  LayoutDashboard,
  ShieldCheck,
  FileText,
  AlertTriangle,
  RefreshCw,
  CalendarClock,
  Wrench,
  Receipt,
  History,
  ExternalLink,
  Info,
  Paperclip,
  Ban,
} from 'lucide-react';

type SubTab = 'resumen' | 'seguros' | 'averias' | 'expediente' | 'historico' | 'operaciones';

interface CentroOperativoInmueblePanelProps {
  inmueble: Inmueble;
  cobros?: CobroPeriodo[];
  contratos?: ContratoFormalizacion[];
  currentUser?: UsuarioApp | null;
  /** Navegación contextual a secciones globales (enlace, no duplicación). */
  onAbrirSeccionGlobal?: (seccion: string, inmuebleId?: string) => void;
}

const SEVERIDAD_CLASES: Record<string, string> = {
  URGENTE: 'bg-rose-50 text-rose-700 border-rose-200',
  AVISO: 'bg-amber-50 text-amber-700 border-amber-200',
  INFO: 'bg-blue-50 text-blue-700 border-blue-200',
};

const CATEGORIA_EVIDENCIA_UI: Record<string, { label: string; clase: string }> = {
  DATO_DOCUMENTAL: { label: 'Dato documental', clase: 'bg-slate-100 text-slate-700 border-slate-300' },
  INTERPRETACION: { label: 'Interpretación', clase: 'bg-blue-50 text-blue-700 border-blue-200' },
  HIPOTESIS: { label: 'Hipótesis', clase: 'bg-amber-50 text-amber-800 border-amber-300' },
  CONCLUSION_PENDIENTE_REVISION: { label: 'Conclusión pendiente de revisión', clase: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const CentroOperativoInmueblePanel: React.FC<CentroOperativoInmueblePanelProps> = ({
  inmueble,
  cobros = [],
  contratos = [],
  currentUser,
  onAbrirSeccionGlobal,
}) => {
  const [subTab, setSubTab] = useState<SubTab>('resumen');
  const [polizas, setPolizas] = useState<PolizaSeguro[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [tareas, setTareas] = useState<TareaMantenimiento[]>([]);
  const [garantias, setGarantias] = useState<GarantiaReparacion[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [documentosPatrimoniales, setDocumentosPatrimoniales] = useState<DocumentoPatrimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [analisisIncidenciaId, setAnalisisIncidenciaId] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [accionEnCurso, setAccionEnCurso] = useState(false);
  // BLOQUE 3 — expediente documental/fiscal
  const [ejercicioExpediente, setEjercicioExpediente] = useState<number>(() => new Date().getFullYear());
  const [exportandoExpediente, setExportandoExpediente] = useState(false);
  const [mensajeExpediente, setMensajeExpediente] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setAnalisisIncidenciaId(null);
    const unsubs = [
      subscribePolizasSeguras((items) => {
        setPolizas(items);
        setLoading(false);
      }),
      subscribeIncidencias((items) => setIncidencias(items.filter((i) => i.inmuebleId === inmueble.id))),
      subscribeTareasMantenimiento((items) => setTareas(items.filter((t) => t.inmuebleId === inmueble.id))),
      subscribeGarantiasReparacion((items) => setGarantias(items.filter((g) => g.inmuebleId === inmueble.id))),
      subscribeGastos((items) => setGastos(items.filter((g) => g.inmuebleId === inmueble.id))),
      subscribeDocumentosPatrimoniales(inmueble.id, setDocumentosPatrimoniales, (error) => {
        setErrorAccion(error.message || 'No se pudo cargar la documentación patrimonial.');
      }),
    ];
    // Red de seguridad: si algún snapshot no llega (p. ej. list denegado por
    // reglas), el resumen se muestra con los datos disponibles en vez de
    // quedarse cargando indefinidamente.
    const fallback = window.setTimeout(() => setLoading(false), 5000);
    return () => {
      unsubs.forEach((u) => u());
      window.clearTimeout(fallback);
    };
  }, [inmueble.id]);

  const resumen: ResumenOperativoInmueble = useMemo(
    () =>
      construirResumenOperativoInmueble({
        inmueble,
        cobros,
        gastos,
        incidencias,
        tareasMantenimiento: tareas,
        garantias,
        polizas,
        contratos,
      }),
    [inmueble, cobros, gastos, incidencias, tareas, garantias, polizas, contratos]
  );

  const polizasInmueble = useMemo(() => polizasDelInmueble(polizas, inmueble), [polizas, inmueble]);
  const actor = { id: currentUser?.id, nombre: currentUser?.nombre || currentUser?.email || 'Usuario' };

  const analisis: AnalisisCoberturaNoVinculante | null = useMemo(() => {
    if (!analisisIncidenciaId) return null;
    const incidencia = incidencias.find((i) => i.id === analisisIncidenciaId);
    if (!incidencia) return null;
    const evaluacion = evaluarCoberturaPolizas(incidencia, polizasInmueble);
    return clasificarEvidenciaCobertura(incidencia, evaluacion);
  }, [analisisIncidenciaId, incidencias, polizasInmueble]);

  const handleCancelarPoliza = async (poliza: PolizaSeguro) => {
    if (accionEnCurso) return;
    const motivo = window.prompt(
      `Cancelación lógica de la póliza ${poliza.aseguradora} (Nº ${poliza.numeroPoliza}).\nLos datos, documentos e historial se conservan. Motivo:`
    );
    if (motivo === null) return;
    const resultado = cancelarPoliza(poliza, motivo || 'Sin motivo indicado', actor, new Date().toISOString());
    if (resultado.estado === 'ERROR' || !resultado.poliza) {
      setErrorAccion(resultado.error || 'No se pudo cancelar la póliza');
      return;
    }
    setAccionEnCurso(true);
    setErrorAccion(null);
    try {
      await guardarPolizaConAuditoria(resultado.poliza, {
        accion: 'SEGUROS_CANCELACION',
        descripcion: `Cancelación lógica de póliza ${poliza.aseguradora} Nº ${poliza.numeroPoliza} (${inmueble.direccion})`,
        actor: { id: actor.id, email: currentUser?.email, nombre: actor.nombre },
        detalles: { motivo, inmuebleId: inmueble.id },
      });
    } catch (err) {
      setErrorAccion('La cancelación no pudo guardarse. Inténtelo de nuevo.');
      console.error('Error cancelando póliza:', err);
    } finally {
      setAccionEnCurso(false);
    }
  };

  // BLOQUE 3 — expediente documental/fiscal (motor puro, reutiliza fiscalEngine)
  const expediente: ExpedienteDocumentalInmueble | null = useMemo(
    () =>
      construirExpedienteDocumentalInmueble({
        inmueble,
        ejercicio: ejercicioExpediente,
        cobros,
        gastos,
        contratos,
        polizas,
        incidencias,
        tareasMantenimiento: tareas,
        garantias,
        documentosPatrimoniales,
        generadoEl: new Date().toISOString(),
      }),
    [inmueble, ejercicioExpediente, cobros, gastos, contratos, polizas, incidencias, tareas, garantias, documentosPatrimoniales]
  );

  const handleExportarExpediente = async () => {
    if (exportandoExpediente || !expediente) return;
    setExportandoExpediente(true);
    setErrorAccion(null);
    setMensajeExpediente(null);
    try {
      const generatedAt = new Date().toISOString();
      const exp = await generarExpedienteFiscal(
        { inmuebles: [inmueble], contratos, gastos },
        { seleccion: 'UN_INMUEBLE', inmuebleId: inmueble.id, periodo: { tipo: 'ANIO', anio: ejercicioExpediente } },
        { actor: currentUser?.id || 'desconocido', propietarioId: inmueble.propietarioId, incluirPII: false },
        { generatedAt }
      );
      const entradaIndice = await prepararEntradaIndiceParaExportacion(expediente.indiceDocumental);
      const { zip, entradas } = await empaquetarExpediente(exp, undefined, [
        { ruta: entradaIndice.rutaLogica, contenido: utf8Bytes(entradaIndice.contenido) },
      ]);
      const blob = new Blob([zip as unknown as ArrayBuffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expediente-fiscal_${inmueble.id}_${ejercicioExpediente}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      // Auditoría única (audit_logs) de la exportación:
      await registrarAuditoriaFirestore({
        ...construirAuditoriaExpediente(
          { id: currentUser?.id, email: currentUser?.email, nombre: currentUser?.nombre || currentUser?.email || 'Usuario' },
          'EXPEDIENTE_EXPORTACION',
          'expediente_fiscal',
          inmueble.id,
          `Exportación ZIP interna del expediente fiscal ${ejercicioExpediente} de ${inmueble.direccion} (exportId ${exp.manifest.exportId.slice(0, 12)}…). NO es presentación oficial AEAT.`,
          { exportId: exp.manifest.exportId, ejercicio: ejercicioExpediente, entradas: entradas.map((e) => e.ruta), indiceSha256: entradaIndice.sha256 }
        ),
      });
      setMensajeExpediente('Exportación generada (ZIP interno determinista). No es un formato oficial de presentación AEAT.');
    } catch (err) {
      console.error('Error exportando expediente:', err);
      setErrorAccion('No se pudo generar la exportación del expediente.');
    } finally {
      setExportandoExpediente(false);
    }
  };

  const tabs: { id: SubTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'resumen', label: 'Resumen', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'seguros', label: 'Seguros', icon: <ShieldCheck className="w-4 h-4" />, badge: resumen.polizas.total },
    { id: 'averias', label: 'Averías ↔ Pólizas', icon: <Wrench className="w-4 h-4" />, badge: resumen.incidenciasAbiertas.length },
    { id: 'expediente', label: 'Expediente', icon: <FileText className="w-4 h-4" />, badge: expediente?.indiceDocumental.estadisticas.total },
    { id: 'historico', label: 'Histórico', icon: <History className="w-4 h-4" /> },
    { id: 'operaciones', label: 'Operaciones', icon: <Wrench className="w-4 h-4" /> },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
      {/* Cabecera */}
      <div className="px-5 pt-5 pb-3 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Centro Operativo del Inmueble</h3>
              <p className="text-xs text-slate-500">
                Situación diaria, seguros, documentación y renovaciones de este inmueble
              </p>
            </div>
          </div>
          {onAbrirSeccionGlobal && (
            <button
              type="button"
              onClick={() => onAbrirSeccionGlobal('polizas', inmueble.id)}
              className="self-start sm:self-auto px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Gestión completa de seguros
            </button>
          )}
        </div>

        {/* Sub-tabs */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                subTab === t.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {t.icon}
              {t.label}
              {typeof t.badge === 'number' && t.badge > 0 && (
                <span className={`px-1.5 rounded-full text-[10px] ${subTab === t.id ? 'bg-white/20' : 'bg-slate-200 text-slate-600'}`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-center text-xs text-slate-400">Cargando datos operativos…</div>
      ) : (
        <div className="p-5 space-y-4">
          {errorAccion && (
            <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
              {errorAccion}
            </div>
          )}

          {/* ============================== RESUMEN ============================== */}
          {subTab === 'resumen' && (
            <>
              {resumen.alertas.length > 0 && (
                <div className="space-y-1.5">
                  {resumen.alertas.slice(0, 6).map((a) => (
                    <div
                      key={a.id}
                      className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${SEVERIDAD_CLASES[a.severidad]}`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{a.mensaje}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <Metrica label="Contrato" valor={resumen.situacion.contratoActivoId ? 'Activo' : 'Sin contrato'} sub={resumen.situacion.inquilinoActualNombre} />
                <Metrica label="Cobros" valor={`${resumen.cobros.cobrados}/${resumen.cobros.totalPeriodos}`} sub={`${resumen.cobros.retrasados} retrasados`} />
                <Metrica label="Incidencias" valor={String(resumen.incidenciasAbiertas.length)} sub="abiertas" />
                <Metrica label="Mantenimiento" valor={String(resumen.mantenimientosPendientes.length)} sub="próximos 30 días" />
                <Metrica label="Pólizas" valor={String(resumen.polizas.activas.length)} sub={`${resumen.documentacion.documentosPoliza} documentos`} />
                <Metrica label="Renovaciones" valor={String(resumen.renovacionesProximas.length)} sub="en ventana" />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <BloqueResumen titulo="Próximos cobros" icono={<Receipt className="w-4 h-4 text-blue-600" />} onVer={onAbrirSeccionGlobal ? () => onAbrirSeccionGlobal('cobros') : undefined}>
                  {resumen.cobros.proximos.length === 0 ? (
                    <p className="text-[11px] text-slate-400">Sin cobros pendientes.</p>
                  ) : (
                    resumen.cobros.proximos.map((c) => (
                      <div key={c.id} className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-700">{c.nombreMes} · {c.inquilinoNombre || '—'}</span>
                        <span className="font-mono text-slate-600">{(c.importePrevisto || 0).toFixed(2)} €</span>
                      </div>
                    ))
                  )}
                </BloqueResumen>

                <BloqueResumen titulo="Garantías próximas a vencer" icono={<CalendarClock className="w-4 h-4 text-emerald-600" />}>
                  {resumen.garantiasProximas.length === 0 ? (
                    <p className="text-[11px] text-slate-400">Sin garantías próximas a vencer (60 días).</p>
                  ) : (
                    resumen.garantiasProximas.map((g) => (
                      <div key={g.id} className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-700 truncate">{g.titulo}</span>
                        <span className="text-slate-500 whitespace-nowrap ml-2">{g.fechaFin}</span>
                      </div>
                    ))
                  )}
                </BloqueResumen>

                <BloqueResumen titulo="Incidencias abiertas" icono={<AlertTriangle className="w-4 h-4 text-rose-600" />} onVer={onAbrirSeccionGlobal ? () => onAbrirSeccionGlobal('incidencias') : undefined}>
                  {resumen.incidenciasAbiertas.length === 0 ? (
                    <p className="text-[11px] text-slate-400">Sin incidencias abiertas.</p>
                  ) : (
                    resumen.incidenciasAbiertas.slice(0, 4).map((i) => (
                      <div key={i.id} className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-700 truncate">{i.titulo}</span>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap ml-2">{i.categoria}</span>
                      </div>
                    ))
                  )}
                </BloqueResumen>

                <BloqueResumen titulo="Gastos recientes" icono={<Receipt className="w-4 h-4 text-amber-600" />} onVer={onAbrirSeccionGlobal ? () => onAbrirSeccionGlobal('gastos') : undefined}>
                  {resumen.gastosRecientes.length === 0 ? (
                    <p className="text-[11px] text-slate-400">Sin gastos recientes.</p>
                  ) : (
                    resumen.gastosRecientes.map((g) => (
                      <div key={g.id} className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-700 truncate">{g.concepto}</span>
                        <span className="font-mono text-slate-600 whitespace-nowrap ml-2">{(g.importe || 0).toFixed(2)} €</span>
                      </div>
                    ))
                  )}
                </BloqueResumen>
              </div>
            </>
          )}

          {/* ============================== SEGUROS ============================== */}
          {subTab === 'seguros' && (
            <>
              <div className="flex items-start gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Un inmueble admite múltiples pólizas y cada póliza múltiples documentos. Adjuntar un
                  documento nuevo NO reemplaza los anteriores: el histórico documental se conserva.
                </span>
              </div>

              {polizasInmueble.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
                  <p className="font-semibold text-slate-700 text-xs">Sin pólizas registradas para este inmueble</p>
                  {onAbrirSeccionGlobal && (
                    <button
                      type="button"
                      onClick={() => onAbrirSeccionGlobal('polizas', inmueble.id)}
                      className="mt-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> Dar de alta en Gestión de Seguros
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {polizasInmueble.map((poliza) => {
                    const ventana = evaluarVentanaRenovacion(poliza);
                    return (
                      <div key={poliza.id} className="border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">{poliza.aseguradora}</span>
                              <span className="text-[10px] font-mono text-slate-500">Nº {poliza.numeroPoliza}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                poliza.estado === 'VIGENTE'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : poliza.estado === 'CANCELADA'
                                  ? 'bg-slate-100 text-slate-500 border-slate-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                {poliza.estado}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {poliza.tipo}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">
                              {poliza.fechaInicio} → {poliza.fechaVencimiento}
                              {typeof poliza.primaAnual === 'number' && ` · Prima ${poliza.primaAnual.toFixed(2)} €/año`}
                              {poliza.periodicidadPago && ` · Pago ${poliza.periodicidadPago}`}
                              {typeof poliza.primaAnterior === 'number' && poliza.primaAnual !== poliza.primaAnterior && (
                                <span className="text-slate-400"> (anterior {poliza.primaAnterior.toFixed(2)} €)</span>
                              )}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5 self-start sm:self-auto">
                            {ventana.enVentana && poliza.estado === 'VIGENTE' && (
                              <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                                <RefreshCw className="w-3 h-3" /> Renueva en {ventana.diasRestantes} d
                              </span>
                            )}
                            {ventana.vencida && poliza.estado === 'VIGENTE' && (
                              <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                Vencida
                              </span>
                            )}
                            {onAbrirSeccionGlobal && (
                              <button
                                type="button"
                                onClick={() => onAbrirSeccionGlobal('polizas', inmueble.id)}
                                className="px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-lg text-[10px] font-bold"
                              >
                                Detalle / renovar
                              </button>
                            )}
                            {poliza.estado !== 'CANCELADA' && (
                              <button
                                type="button"
                                disabled={accionEnCurso}
                                onClick={() => handleCancelarPoliza(poliza)}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 disabled:opacity-50"
                              >
                                <Ban className="w-3 h-3" /> Cancelar
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Coberturas / exclusiones / franquicia (dato documental registrado) */}
                        <div className="flex flex-wrap gap-1.5">
                          {(poliza.coberturas || []).slice(0, 4).map((c) => (
                            <span key={c} className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {c}
                            </span>
                          ))}
                          {(poliza.exclusiones || []).slice(0, 3).map((e) => (
                            <span key={e} className="px-2 py-0.5 rounded-full text-[10px] bg-rose-50 text-rose-600 border border-rose-200">
                              ✕ {e}
                            </span>
                          ))}
                          {typeof poliza.franquicia === 'number' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 border border-slate-200">
                              Franquicia {poliza.franquicia} €
                            </span>
                          )}
                        </div>

                        {/* Documentos (1 póliza → N documentos, histórico conservado) */}
                        <div className="border-t border-slate-100 pt-2">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                            <FileText className="w-3 h-3" />
                            Documentos ({(poliza.documentos?.length || 0) + (poliza.documentosRenovacion?.length || 0)})
                          </div>
                          {(!poliza.documentos || poliza.documentos.length === 0) &&
                          (!poliza.documentosRenovacion || poliza.documentosRenovacion.length === 0) ? (
                            <p className="text-[11px] text-slate-400">
                              Sin documentos adjuntos. Adjúntelos desde la gestión de seguros; cada adjunto
                              conserva versión, fecha, origen y actor.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {(poliza.documentos || []).map((d) => (
                                <span
                                  key={d.id}
                                  title={`v${d.version || 1} · ${d.fechaSubida}${d.subidoPor ? ` · ${d.subidoPor}` : ''}`}
                                  className="px-2 py-0.5 rounded-lg text-[10px] bg-slate-50 text-slate-600 border border-slate-200 inline-flex items-center gap-1"
                                >
                                  <Paperclip className="w-2.5 h-2.5" />
                                  {d.nombre}
                                  <span className="text-slate-400">v{d.version || 1}</span>
                                </span>
                              ))}
                              {(poliza.documentosRenovacion || []).map((d) => (
                                <span
                                  key={d.id}
                                  className="px-2 py-0.5 rounded-lg text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-100 inline-flex items-center gap-1"
                                >
                                  <Paperclip className="w-2.5 h-2.5" />
                                  {d.nombre}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ====================== AVERÍAS ↔ PÓLIZAS ====================== */}
          {subTab === 'averias' && (
            <>
              <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 font-semibold">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  El ERP NO afirma automáticamente que una avería esté cubierta. La póliza y sus
                  documentos originales son la fuente documental; toda conclusión queda pendiente de
                  revisión humana.
                </span>
              </div>

              {resumen.incidenciasAbiertas.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No hay averías/incidencias abiertas en este inmueble.</p>
              ) : (
                <div className="space-y-3">
                  {resumen.incidenciasAbiertas.map((incidencia) => (
                    <div key={incidencia.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <span className="font-bold text-slate-800 text-xs">{incidencia.titulo}</span>
                          <span className="text-[10px] text-slate-400 ml-2">{incidencia.categoria} · {incidencia.estado}</span>
                          {incidencia.elementoInventarioId && (
                            <span className="text-[10px] text-slate-400 ml-2">Equipo vinculado: {incidencia.elementoInventarioId}</span>
                          )}
                          {incidencia.polizaId && (
                            <span className="text-[10px] text-indigo-500 ml-2">Póliza relacionada: {incidencia.polizaId}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setAnalisisIncidenciaId(analisisIncidenciaId === incidencia.id ? null : incidencia.id)}
                          className="self-start sm:self-auto px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold inline-flex items-center gap-1"
                        >
                          <ShieldCheck className="w-3 h-3" />
                          {analisisIncidenciaId === incidencia.id ? 'Ocultar análisis' : 'Pólizas potencialmente relacionadas'}
                        </button>
                      </div>

                      {analisisIncidenciaId === incidencia.id && analisis && (
                        <div className="space-y-1.5 bg-slate-50 border border-slate-200 rounded-xl p-3">
                          {analisis.evidencia.map((ev, idx) => {
                            const ui = CATEGORIA_EVIDENCIA_UI[ev.categoria];
                            return (
                              <div key={`${ev.categoria}-${idx}`} className="flex items-start gap-2 text-[11px]">
                                <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${ui.clase}`}>
                                  {ui.label}
                                </span>
                                <span className="text-slate-600">{ev.texto}</span>
                              </div>
                            );
                          })}
                          {analisis.documentacionDisponible.length > 0 && (
                            <p className="text-[10px] text-slate-400 pt-1">
                              Documentación disponible: {analisis.documentacionDisponible.map((d) => d.nombre).join(', ')}
                            </p>
                          )}
                          <p className="text-[10px] text-amber-700 font-semibold pt-1">{analisis.aviso}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ====================== EXPEDIENTE (BLOQUE 3) ====================== */}
          {subTab === 'expediente' && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase" htmlFor="ejercicio-expediente">
                    Ejercicio
                  </label>
                  <select
                    id="ejercicio-expediente"
                    value={ejercicioExpediente}
                    onChange={(e) => setEjercicioExpediente(Number(e.target.value))}
                    className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-white"
                  >
                    {[0, 1, 2, 3, 4].map((d) => {
                      const anio = new Date().getFullYear() - d;
                      return <option key={anio} value={anio}>{anio}</option>;
                    })}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleExportarExpediente}
                  disabled={exportandoExpediente || !expediente}
                  className="self-start sm:self-auto px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {exportandoExpediente ? 'Generando…' : 'Exportar expediente (ZIP interno)'}
                </button>
              </div>

              {mensajeExpediente && (
                <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-700 font-semibold">
                  {mensajeExpediente}
                </div>
              )}
              <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 font-semibold">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Exportación de expediente interno ≠ presentación oficial AEAT. Conservación sin TTL
                  (mínimo 5 años; auditoría append-only). Los datos históricos externos pendientes
                  (AEAT/Libro Diario, registro 27) NO se incorporan: permanecen como pendientes documentados.
                </span>
              </div>

              <DocumentosPatrimonialesPanel
                inmueble={inmueble}
                currentUser={currentUser}
                contratos={contratos}
                gastos={gastos}
                incidencias={incidencias}
                polizas={polizasInmueble}
                tareas={tareas}
                garantias={garantias}
                documentos={documentosPatrimoniales}
              />

              {!expediente ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  Sin datos fiscales para el ejercicio {ejercicioExpediente} en este inmueble.
                </p>
              ) : (
                <>
                  {/* Resumen fiscal */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    <Metrica label="Ingresos cobrados" valor={`${expediente.ingresos.importeRecibido.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`} sub={`${expediente.ingresos.cobrados}/${expediente.ingresos.totalCobros} cobros`} />
                    <Metrica label="Gastos" valor={`${expediente.gastos.importeTotal.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`} sub={`${expediente.gastos.total} apuntes`} />
                    <Metrica label="Deducibles" valor={`${expediente.gastos.importeDeducible.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`} sub={`${expediente.gastos.deducibles} (motor fiscal)`} />
                    <Metrica label="Tributos/tasas" valor={String(expediente.tributos.length)} sub="IBI / tasas" />
                    <Metrica label="Documentos" valor={String(expediente.indiceDocumental.estadisticas.total)} sub={`${expediente.indiceDocumental.estadisticas.pendientes} pendientes`} />
                    <Metrica label="Incidencias" valor={String(expediente.incidenciasFiscales.filter((i) => i.codigo !== 'SUSTITUCION_EXPLICITA').length)} sub="señaladas, no decididas" />
                  </div>

                  {/* Tributos + seguros */}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <BloqueResumen titulo={`Tributos y tasas ${ejercicioExpediente}`} icono={<Receipt className="w-4 h-4 text-slate-600" />}>
                      {expediente.tributos.length === 0 ? (
                        <p className="text-[11px] text-slate-400">Sin IBI/tasas registradas en el ejercicio.</p>
                      ) : (
                        expediente.tributos.map((t) => (
                          <div key={t.gastoId} className="flex justify-between text-xs">
                            <span className="font-semibold text-slate-700 truncate">{t.categoria} — {t.concepto}</span>
                            <span className="font-mono text-slate-600 whitespace-nowrap ml-2">{t.importe.toFixed(2)} €</span>
                          </div>
                        ))
                      )}
                    </BloqueResumen>
                    <BloqueResumen titulo="Seguros del expediente (refs. Bloque 1)" icono={<ShieldCheck className="w-4 h-4 text-indigo-600" />} onVer={onAbrirSeccionGlobal ? () => onAbrirSeccionGlobal('polizas', inmueble.id) : undefined}>
                      {expediente.seguros.length === 0 ? (
                        <p className="text-[11px] text-slate-400">Sin pólizas vinculadas.</p>
                      ) : (
                        expediente.seguros.map((s) => (
                          <div key={s.polizaId} className="flex justify-between text-xs">
                            <span className="font-semibold text-slate-700 truncate">{s.aseguradora} — {s.tipo}</span>
                            <span className="text-slate-500 whitespace-nowrap ml-2">{s.documentoIds.length} doc(s)</span>
                          </div>
                        ))
                      )}
                    </BloqueResumen>
                  </div>

                  {/* Índice documental */}
                  <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="text-[11px] font-bold uppercase text-slate-500">
                      Documentación ({expediente.indiceDocumental.estadisticas.total}) — origen, fecha, versión y relaciones
                    </div>
                    {expediente.indiceDocumental.entradas.length === 0 ? (
                      <p className="text-[11px] text-slate-400">Sin documentos referenciados para este inmueble.</p>
                    ) : (
                      <div className="max-h-72 overflow-y-auto pr-1 space-y-1.5">
                        {expediente.indiceDocumental.entradas.map((d) => (
                          <div key={d.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-2 py-1.5 bg-slate-50 border border-slate-100 rounded-lg">
                            <div className="flex items-center gap-2 min-w-0">
                              <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="text-[11px] font-semibold text-slate-700 truncate">{d.nombre}</span>
                              <span className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[9px] font-bold text-slate-500 shrink-0">{d.tipo}</span>
                              {d.version > 1 && (
                                <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-[9px] font-bold text-indigo-600 shrink-0">v{d.version}</span>
                              )}
                              {d.sustituyeA && (
                                <span className="text-[9px] text-slate-400 shrink-0" title={`Sustituye explícitamente a ${d.sustituyeA}`}>sustituye ↩</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] text-slate-400">{d.fechaDocumental || (d.fechaIncorporacion || '').slice(0, 10) || 'sin fecha'}</span>
                              <span className="text-[10px] text-slate-400">{d.entidadOrigen}</span>
                              <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${
                                d.estado === 'DISPONIBLE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : d.estado === 'SUSTITUIDO' ? 'bg-slate-100 text-slate-500 border-slate-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                {d.estado}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Incidencias del expediente */}
                  {expediente.incidenciasFiscales.length > 0 && (
                    <div className="border border-slate-200 rounded-xl p-3 space-y-1.5">
                      <div className="text-[11px] font-bold uppercase text-slate-500">Incidencias y trazas</div>
                      <div className="max-h-40 overflow-y-auto pr-1 space-y-1">
                        {expediente.incidenciasFiscales.map((inc, i) => (
                          <div key={`${inc.codigo}-${inc.id || i}`} className="flex items-start gap-2 text-[11px]">
                            <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold border shrink-0 ${
                              inc.severidad === 'CRITICA' ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : inc.severidad === 'AVISO' ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}>
                              {inc.codigo}
                            </span>
                            <span className="text-slate-600">{inc.descripcion}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reparaciones/mantenimiento enlazados */}
                  {expediente.reparaciones.length > 0 && (
                    <BloqueResumen titulo="Reparaciones / mantenimiento enlazados" icono={<Wrench className="w-4 h-4 text-amber-600" />}>
                      {expediente.reparaciones.slice(0, 5).map((r) => (
                        <div key={`${r.tipo}-${r.id}`} className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-700 truncate">{r.tipo === 'GARANTIA' ? 'Garantía' : r.tipo === 'TAREA_MANTENIMIENTO' ? 'Mantenimiento' : 'Gasto reparación'} — {r.concepto}</span>
                          <span className="text-slate-500 whitespace-nowrap ml-2">{typeof r.importe === 'number' ? `${r.importe.toFixed(2)} €` : (r.fecha || '')}</span>
                        </div>
                      ))}
                    </BloqueResumen>
                  )}
                </>
              )}
            </>
          )}

          {/* ============================== HISTÓRICO ============================== */}
          {subTab === 'historico' && (
            <div className="space-y-3">
              {polizasInmueble.length === 0 && <p className="text-xs text-slate-400 text-center py-6">Sin histórico de seguros.</p>}
              {polizasInmueble.map((poliza) => {
                const cadena = obtenerCadenaHistorialPoliza(poliza.id, polizas);
                const eventos = cadena
                  .flatMap((p) => (p.historial || []).map((h) => ({ ...h, polizaId: p.id, aseguradora: p.aseguradora })))
                  .sort((a, b) => b.fecha.localeCompare(a.fecha));
                if (eventos.length === 0) return null;
                return (
                  <div key={poliza.id} className="border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] font-bold uppercase text-slate-400 mb-2">
                      {poliza.aseguradora} · Nº {poliza.numeroPoliza} · cadena de {cadena.length} póliza(s)
                    </div>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                      {eventos.slice(0, 20).map((ev) => (
                        <div key={`${ev.polizaId}-${ev.id}`} className="flex items-start gap-2 text-[11px]">
                          <span className="text-slate-400 whitespace-nowrap font-mono">{ev.fecha.slice(0, 10)}</span>
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[9px] font-bold border border-slate-200 shrink-0">
                            {ev.accion}
                          </span>
                          <span className="text-slate-600">
                            {ev.detalle || ''}
                            {ev.usuario && <span className="text-slate-400"> — {ev.usuario}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ============================== OPERACIONES (port de C) ============================== */}
          {subTab === 'operaciones' && (
            <OperacionesInmueble inmueble={inmueble} onVolver={() => setSubTab('resumen')} />
          )}
        </div>
      )}
    </div>
  );
};

const Metrica: React.FC<{ label: string; valor: string; sub?: string }> = ({ label, valor, sub }) => (
  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
    <span className="text-[10px] uppercase font-bold text-slate-400 block">{label}</span>
    <span className="text-sm font-bold text-slate-800 block">{valor}</span>
    {sub && <span className="text-[10px] text-slate-400 block truncate">{sub}</span>}
  </div>
);

const BloqueResumen: React.FC<{
  titulo: string;
  icono: React.ReactNode;
  onVer?: () => void;
  children: React.ReactNode;
}> = ({ titulo, icono, onVer, children }) => (
  <div className="border border-slate-200 rounded-xl p-3 space-y-1.5">
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 uppercase">
        {icono} {titulo}
      </span>
      {onVer && (
        <button type="button" onClick={onVer} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800">
          Ver todo →
        </button>
      )}
    </div>
    <div className="space-y-1">{children}</div>
  </div>
);

export default CentroOperativoInmueblePanel;
