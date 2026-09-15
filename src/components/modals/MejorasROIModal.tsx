import React, { useMemo, useState } from 'react';
import {
  X,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  Wrench,
  TrendingUp,
  Check,
  Send,
  Info,
  AlertCircle,
} from 'lucide-react';
import type {
  CategoriaMejora,
  ExpedienteRecomercializacion,
  Inmueble,
  MejoraROI,
  Profesional,
} from '../../types';
import {
  CATEGORIA_MEJORA_LABEL,
  agregarMejora,
  costeMedioMejora,
  escenariosROI,
  nuevoMejoraId,
  paybackMejora,
  quitarMejora,
  actualizarMejora,
  type EscenarioROI,
} from '../../utils/recomercializacionEngine';
import { evitarDuplicadosMejora, proponerMejorasROI } from '../../utils/mejorasIa';

interface Props {
  expediente: ExpedienteRecomercializacion;
  inmueble?: Inmueble;
  rentaAnterior?: number;
  profesionales: Profesional[];
  onGuardar: (expediente: ExpedienteRecomercializacion) => Promise<void> | void;
  onClose: () => void;
}

const euro0 = (n?: number) =>
  n === undefined || n === null || Number.isNaN(Number(n))
    ? '—'
    : `${Math.round(Number(n)).toLocaleString('es-ES')} €`;

const inputCls =
  'w-full px-2 py-1 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 outline-none';

const impactoColor: Record<string, string> = {
  alto: 'bg-rose-100 text-rose-700',
  medio: 'bg-amber-100 text-amber-800',
  bajo: 'bg-emerald-100 text-emerald-700',
};

export const MejorasROIModal: React.FC<Props> = ({
  expediente,
  inmueble,
  rentaAnterior,
  profesionales,
  onGuardar,
  onClose,
}) => {
  const [mejoras, setMejoras] = useState<MejoraROI[]>(expediente.mejorasPropuestas ?? []);
  const [cargandoIa, setCargandoIa] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);
  const [profSeleccionado, setProfSeleccionado] = useState<Record<string, string>>({});

  const fotosAnalizadas = (expediente.revisionFotografica?.fotografias ?? []).filter(
    (f) => f.analisisIa
  ).length;

  const profesionalesActivos = useMemo(
    () => profesionales.filter((p) => p.activo !== false),
    [profesionales]
  );

  const escenarios = useMemo(() => escenariosROI(mejoras), [mejoras]);

  const construirYGuardar = async (lista: MejoraROI[]) => {
    setGuardando(true);
    try {
      const actualizado: ExpedienteRecomercializacion = {
        ...expediente,
        mejorasPropuestas: lista,
        updatedAt: new Date().toISOString(),
      };
      await onGuardar(actualizado);
    } finally {
      setGuardando(false);
    }
  };

  const aplicarLista = (lista: MejoraROI[]) => {
    setMejoras(lista);
    void construirYGuardar(lista);
  };

  const handleGenerarIa = async () => {
    setAviso(null);
    setCargandoIa(true);
    try {
      const { mejoras: propuestas, motor } = await proponerMejorasROI({
        // La llamada envía el diagnóstico del expediente; partimos de la
        // lista local por si hubo ediciones aún no refrescadas en Firestore.
        expediente: { ...expediente, mejorasPropuestas: mejoras },
        inmueble,
        rentaAnterior,
      });
      const novedades = evitarDuplicadosMejora(mejoras, propuestas);
      if (novedades.length === 0) {
        setAviso({ tipo: 'info', texto: 'No hay propuestas nuevas: ya estaban recogidas las actuaciones sugeridas.' });
      } else {
        const lista = [...mejoras, ...novedades];
        setMejoras(lista);
        await construirYGuardar(lista);
        if (motor === 'heuristico') {
          setAviso({
            tipo: 'info',
            texto:
              'Sin modelo IA configurado se ha usado un catálogo orientativo de mejoras frecuentes. Ajusta importes y rentas a tu caso concreto; son rangos, no presupuestos.',
          });
        } else {
          setAviso({ tipo: 'info', texto: `Se añadieron ${novedades.length} propuesta(s) orientativa(s). Revisa y confirma las que vayas a ejecutar.` });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al generar las propuestas.';
      setAviso({ tipo: 'error', texto: msg });
    } finally {
      setCargandoIa(false);
    }
  };

  const handleAnadirManual = () => {
    const nueva: MejoraROI = {
      id: nuevoMejoraId(),
      actuacion: '',
      categoria: 'OTRA',
      confirmadaPorPropietario: false,
      origen: 'manual',
      impacto: 'medio',
    };
    const base = agregarMejora(expediente, nueva);
    const lista = [...mejoras, base.mejorasPropuestas![base.mejorasPropuestas!.length - 1]];
    aplicarLista(lista);
  };

  const handleEditar = (id: string, campos: Partial<MejoraROI>) => {
    const lista = mejoras.map((m) =>
      m.id === id ? { ...m, ...campos } : m
    );
    setMejoras(lista);
  };

  const handleGuardarFila = (m: MejoraROI) => {
    const base = actualizarMejora({ ...expediente, mejorasPropuestas: mejoras }, m);
    setMejoras(base.mejorasPropuestas ?? []);
    void construirYGuardar(base.mejorasPropuestas ?? []);
  };

  const handleBorrar = (m: MejoraROI) => {
    if (!window.confirm(`¿Eliminar la mejora «${m.actuacion || 'sin nombre'}»?`)) return;
    const base = quitarMejora({ ...expediente, mejorasPropuestas: mejoras }, m.id);
    aplicarLista(base.mejorasPropuestas ?? []);
  };

  const handleSolicitarPresupuesto = async (m: MejoraROI) => {
    const profesionalId = profSeleccionado[m.id];
    if (!profesionalId) return;
    const actualizada: MejoraROI = {
      ...m,
      profesionalIdSolicitado: profesionalId,
      presupuestoSolicitadoFecha: new Date().toISOString(),
    };
    const base = actualizarMejora({ ...expediente, mejorasPropuestas: mejoras }, actualizada);
    setMejoras(base.mejorasPropuestas ?? []);
    await construirYGuardar(base.mejorasPropuestas ?? []);
    setAviso({
      tipo: 'info',
      texto:
        'Queda registrado el profesional interesado para esta mejora. La orden de trabajo formal y el parte llegarán con el módulo de Incidencias/Mantenimiento (fase posterior).',
    });
  };

  const nombreProfesional = (id?: string) =>
    profesionales.find((p) => p.id === id)?.nombreComercial || 'profesional';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl my-8 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 leading-tight">Reformas y optimización (ROI)</h3>
              <p className="text-xs text-slate-500">
                {inmueble?.direccion || 'Expediente'} · {mejoras.length} mejora(s)
                {rentaAnterior ? ` · renta anterior ${rentaAnterior} €/mes` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGenerarIa}
              disabled={cargandoIa || guardando}
              className="px-3.5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
            >
              {cargandoIa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {mejoras.length === 0 ? 'Generar propuestas con IA' : 'Sugerir más mejoras'}
            </button>
            <button
              type="button"
              onClick={handleAnadirManual}
              disabled={guardando}
              className="px-3 py-2 text-xs font-semibold text-teal-700 bg-white border border-teal-300 hover:bg-teal-50 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Añadir manual
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {aviso && (
            <div
              className={`p-3 rounded-xl text-xs font-medium flex items-start gap-2 border ${
                aviso.tipo === 'error'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-sky-50 border-sky-200 text-sky-800'
              }`}
            >
              {aviso.tipo === 'error' ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <Info className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{aviso.texto}</span>
            </div>
          )}

          {fotosAnalizadas === 0 && (
            <div className="p-3 rounded-xl text-xs bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Aún no hay fotografías con diagnóstico IA. Puedes añadir mejoras manualmente, o hacer
                primero la inspección y su diagnóstico para que las propuestas se ajusten al estado real.
              </span>
            </div>
          )}

          {/* Escenarios */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {escenarios.map((esc: EscenarioROI) => (
              <div
                key={esc.id}
                className={`rounded-xl border p-4 ${
                  esc.id === 'parcial'
                    ? 'border-teal-300 bg-teal-50/50'
                    : esc.id === 'completa'
                    ? 'border-indigo-200 bg-indigo-50/40'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {esc.id === 'parcial' ? (
                    <Check className="w-4 h-4 text-teal-600" />
                  ) : (
                    <TrendingUp className={`w-4 h-4 ${esc.id === 'completa' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  )}
                  <h4 className="text-sm font-bold text-slate-900">{esc.label}</h4>
                </div>
                <p className="text-[10px] text-slate-500 mb-3 leading-snug">{esc.descripcion}</p>
                <dl className="space-y-1 text-[11px]">
                  <div className="flex justify-between"><dt className="text-slate-500">Inversión</dt><dd className="font-semibold text-slate-800">{esc.inversionMedia ? euro0(esc.inversionMedia) : '—'}</dd></div>
                  {esc.inversionMin > 0 && (
                    <div className="flex justify-between"><dt className="text-slate-400">Rango</dt><dd className="text-slate-500">{euro0(esc.inversionMin)}–{euro0(esc.inversionMax)}</dd></div>
                  )}
                  <div className="flex justify-between"><dt className="text-slate-500">Renta extra/mes</dt><dd className="font-semibold text-emerald-700">+{euro0(esc.rentaExtraMensual)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Renta extra/año</dt><dd className="font-semibold text-emerald-700">+{euro0(esc.rentaExtraAnual)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Plusvalía est.</dt><dd className="font-semibold text-indigo-700">+{euro0(esc.plusvaliaEstimada)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Payback</dt><dd className="font-semibold text-slate-800">{esc.paybackMeses !== undefined ? `${esc.paybackMeses} meses` : '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">ROI anual est.</dt><dd className="font-semibold text-slate-800">{esc.roiAnualPct !== undefined ? `${esc.roiAnualPct}%` : '—'}</dd></div>
                </dl>
              </div>
            ))}
          </div>

          {/* Listado de mejoras */}
          {mejoras.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center space-y-2">
              <Wrench className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-600">Sin mejoras propuestas</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Genera propuestas a partir del diagnóstico de fotos o añade una actuación manualmente.
                Marca como confirmadas las que vayas a ejecutar para construir el escenario de «reforma parcial».
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {mejoras.map((m) => {
                const profesional = profesionalesActivos.find((p) => p.id === m.profesionalIdSolicitado);
                return (
                  <div
                    key={m.id}
                    className={`rounded-xl border p-3.5 ${m.confirmadaPorPropietario ? 'border-teal-300 bg-teal-50/30' : 'border-slate-200'}`}
                  >
                    <div className="grid grid-cols-12 gap-2 items-start">
                      <label className="col-span-12 md:col-span-4 flex items-start gap-2 cursor-pointer pt-1.5">
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-teal-600"
                          checked={!!m.confirmadaPorPropietario}
                          onChange={(e) => handleEditar(m.id, { confirmadaPorPropietario: e.target.checked })}
                          onBlur={() => {
                            const actual = mejoras.find((x) => x.id === m.id);
                            if (actual) handleGuardarFila(actual);
                          }}
                          title="Incluir en la reforma parcial (actuación confirmada)"
                        />
                        <div className="min-w-0">
                          <textarea
                            rows={2}
                            value={m.actuacion}
                            placeholder="Describe la actuación (p. ej. pintado integral en blanco neutro)"
                            onChange={(e) => handleEditar(m.id, { actuacion: e.target.value })}
                            onBlur={() => {
                              const actual = mejoras.find((x) => x.id === m.id);
                              if (actual) handleGuardarFila(actual);
                            }}
                            className={inputCls}
                          />
                          <div className="flex items-center gap-1.5 mt-1">
                            <select
                              value={m.categoria || 'OTRA'}
                              onChange={(e) => handleEditar(m.id, { categoria: e.target.value as CategoriaMejora })}
                              onBlur={() => {
                                const actual = mejoras.find((x) => x.id === m.id);
                                if (actual) handleGuardarFila(actual);
                              }}
                              className="text-[10px] border border-slate-200 rounded-md px-1 py-0.5 bg-white text-slate-600"
                            >
                              {Object.entries(CATEGORIA_MEJORA_LABEL).map(([valor, etiqueta]) => (
                                <option key={valor} value={valor}>{etiqueta}</option>
                              ))}
                            </select>
                            <select
                              value={m.impacto || 'medio'}
                              onChange={(e) => handleEditar(m.id, { impacto: e.target.value as MejoraROI['impacto'] })}
                              onBlur={() => {
                                const actual = mejoras.find((x) => x.id === m.id);
                                if (actual) handleGuardarFila(actual);
                              }}
                              className={`text-[10px] border-0 rounded-md px-1.5 py-0.5 font-semibold ${impactoColor[m.impacto || 'medio']}`}
                            >
                              <option value="bajo">Impacto bajo</option>
                              <option value="medio">Impacto medio</option>
                              <option value="alto">Impacto alto</option>
                            </select>
                            {m.origen === 'ia' && (
                              <span className="text-[9px] text-violet-600 inline-flex items-center gap-0.5 font-semibold">
                                <Sparkles className="w-2.5 h-2.5" /> IA
                              </span>
                            )}
                          </div>
                        </div>
                      </label>

                      <div className="col-span-6 md:col-span-3 grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="block text-[9px] font-semibold text-slate-400">Coste mín.</label>
                          <input type="number" min="0" className={inputCls} value={m.costeEstimadoMin ?? ''}
                            onChange={(e) => handleEditar(m.id, { costeEstimadoMin: e.target.value === '' ? undefined : Number(e.target.value) })}
                            onBlur={() => { const actual = mejoras.find((x) => x.id === m.id); if (actual) handleGuardarFila(actual); }} />
                        </div>
                        <div>
                          <label className="block text-[9px] font-semibold text-slate-400">Coste máx.</label>
                          <input type="number" min="0" className={inputCls} value={m.costeEstimadoMax ?? ''}
                            onChange={(e) => handleEditar(m.id, { costeEstimadoMax: e.target.value === '' ? undefined : Number(e.target.value) })}
                            onBlur={() => { const actual = mejoras.find((x) => x.id === m.id); if (actual) handleGuardarFila(actual); }} />
                        </div>
                      </div>

                      <div className="col-span-6 md:col-span-3 grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="block text-[9px] font-semibold text-slate-400">+€ renta/mes</label>
                          <input type="number" min="0" className={inputCls} value={m.incrementoRentaMensual ?? ''}
                            onChange={(e) => handleEditar(m.id, { incrementoRentaMensual: e.target.value === '' ? undefined : Number(e.target.value) })}
                            onBlur={() => { const actual = mejoras.find((x) => x.id === m.id); if (actual) handleGuardarFila(actual); }} />
                        </div>
                        <div>
                          <label className="block text-[9px] font-semibold text-slate-400">+€ valor</label>
                          <input type="number" min="0" className={inputCls} value={m.incrementoValoracion ?? ''}
                            onChange={(e) => handleEditar(m.id, { incrementoValoracion: e.target.value === '' ? undefined : Number(e.target.value) })}
                            onBlur={() => { const actual = mejoras.find((x) => x.id === m.id); if (actual) handleGuardarFila(actual); }} />
                        </div>
                      </div>

                      <div className="col-span-12 md:col-span-2 flex md:flex-col items-start md:items-end gap-2 md:gap-0.5">
                        <div className="text-[10px] text-slate-500">
                          Payback: <b className="text-slate-800">{paybackMejora(m) !== undefined ? `${paybackMejora(m)} meses` : '—'}</b>
                          <span className="hidden md:block text-slate-400">Coste medio: {euro0(costeMedioMejora(m))}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleBorrar(m)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                          title="Eliminar mejora"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Presupuesto a profesional */}
                    <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      {profesional ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-2 py-1">
                          <Check className="w-3 h-3" /> Presupuesto solicitado a {profesional.nombreComercial}
                          {m.presupuestoSolicitadoFecha &&
                            ` · ${new Date(m.presupuestoSolicitadoFecha).toLocaleDateString('es-ES')}`}
                        </span>
                      ) : profesionalesActivos.length > 0 ? (
                        <>
                          <select
                            value={profSeleccionado[m.id] || ''}
                            onChange={(e) => setProfSeleccionado((p) => ({ ...p, [m.id]: e.target.value }))}
                            className="text-[11px] border border-slate-300 rounded-lg px-2 py-1 bg-white max-w-[220px]"
                          >
                            <option value="">Selecciona un profesional…</option>
                            {profesionalesActivos.map((p) => (
                              <option key={p.id} value={p.id}>{p.nombreComercial} · {p.especialidades.slice(0, 2).join(', ')}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleSolicitarPresupuesto(m)}
                            disabled={!profSeleccionado[m.id] || guardando}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-lg disabled:opacity-40"
                          >
                            <Send className="w-3 h-3" /> Solicitar presupuesto
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-400">No hay profesionales en tu bolsa todavía.</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
            <span>
              Las cifras son <b>estimaciones orientativas</b> a partir del diagnóstico visual y del
              mercado; no constituyen un presupuesto, una tasación ni una garantía de renta. Pide
              siempre presupuesto real al profesional. Las intervenciones en instalaciones
              (electricidad, gas, fontanería) deben hacerlas técnicos cualificados.
            </span>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            {mejoras.filter((m) => m.confirmadaPorPropietario).length} confirmada(s) · se guarda automáticamente
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl"
          >
            Finalizar
          </button>
        </div>
      </div>
    </div>
  );
};
