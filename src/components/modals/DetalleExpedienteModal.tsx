import React, { useState } from 'react';
import {
  X,
  RefreshCw,
  Check,
  Ban,
  Trash2,
  KeyRound,
  BellRing,
  Camera,
  Sparkles,
  Wrench,
  TrendingUp,
  Calculator,
  RotateCcw,
  Megaphone,
  Building2,
  Flag,
  PlayCircle,
  FileCheck,
} from 'lucide-react';
import type {
  EstadoRecomercializacion,
  ExpedienteRecomercializacion,
  InmobiliariaDirectorio,
  Inmueble,
  LeadInmobiliario,
  ModalidadComercializacion,
  Profesional,
  PropuestaInmobiliaria,
  UsuarioApp,
} from '../../types';
import {
  DESTINO_INMUEBLE_LABEL,
  esEstadoCierre,
  escenariosROI,
  ESTADOS_RECOMERCIALIZACION,
  ESTANCIAS_ORDEN,
  ESTANCIA_LABEL,
  MODALIDAD_COMERCIALIZACION_LABEL,
  puedeTransicionar,
} from '../../utils/recomercializacionEngine';
import { formatDate } from '../../utils/formatters';
import { InspeccionFotograficaModal } from './InspeccionFotograficaModal';
import { MejorasROIModal } from './MejorasROIModal';
import { PricingModal } from './PricingModal';
import { KitPublicacionModal } from './KitPublicacionModal';
import { BolsaInmobiliariasModal } from './BolsaInmobiliariasModal';

interface Props {
  expediente: ExpedienteRecomercializacion;
  inmueble?: Inmueble;
  profesionales?: Profesional[];
  rentaAnterior?: number;
  // FASE 3.6 — bolsa de inmobiliarias y cierre del ciclo
  inmobiliarias?: InmobiliariaDirectorio[];
  propuestas?: PropuestaInmobiliaria[];
  leads?: LeadInmobiliario[];
  currentUser?: UsuarioApp | null;
  onGuardarInmobiliaria?: (a: InmobiliariaDirectorio) => Promise<void> | void;
  onEliminarInmobiliaria?: (id: string) => Promise<void> | void;
  onGuardarLead?: (l: LeadInmobiliario) => Promise<void> | void;
  onGuardarPropuesta?: (p: PropuestaInmobiliaria) => Promise<void> | void;
  onCerrarCiclo?: (
    expediente: ExpedienteRecomercializacion,
    resultado: 'REARRENDADO' | 'VENDIDO'
  ) => Promise<void> | void;
  onGuardar: (expediente: ExpedienteRecomercializacion) => Promise<void> | void;
  onEliminar: (id: string) => Promise<void> | void;
  onClose: () => void;
}

const hoy = () => new Date().toISOString().split('T')[0];

// Estados que ya se pueden operar en la UI de la Fase 3.1.
const ESTADOS_HABILITADOS_UI: EstadoRecomercializacion[] = [
  'BORRADOR',
  'SALIDA_NOTIFICADA',
  'REVISION_PENDIENTE',
  'FOTOS_ACTUALIZADAS',
  'VALORACION_COMPLETADA',
  'DECISION_ESTRATEGIA',
  'EN_COMERCIALIZACION',
  'CANCELADO',
];

export const DetalleExpedienteModal: React.FC<Props> = ({
  expediente,
  inmueble,
  profesionales,
  rentaAnterior,
  inmobiliarias,
  propuestas,
  leads,
  currentUser,
  onGuardarInmobiliaria,
  onEliminarInmobiliaria,
  onGuardarLead,
  onGuardarPropuesta,
  onCerrarCiclo,
  onGuardar,
  onEliminar,
  onClose,
}) => {
  const [fechaComunicacion, setFechaComunicacion] = useState<string>(
    expediente.datosSalida?.fechaComunicacion?.slice(0, 10) || hoy()
  );
  const [fechaPrevistaSalida, setFechaPrevistaSalida] = useState<string>(
    expediente.datosSalida?.fechaPrevistaSalida?.slice(0, 10) || ''
  );
  const [fechaEntregaLlaves, setFechaEntregaLlaves] = useState<string>(
    expediente.datosSalida?.fechaEntregaLlaves?.slice(0, 10) || ''
  );
  const [fianza, setFianza] = useState<string>(
    expediente.datosSalida?.depositoFianzaADevolver != null
      ? String(expediente.datosSalida.depositoFianzaADevolver)
      : ''
  );
  const [observaciones, setObservaciones] = useState<string>(
    expediente.datosSalida?.observaciones || ''
  );
  const [guardando, setGuardando] = useState(false);
  const [showInspeccion, setShowInspeccion] = useState(false);
  const [showMejoras, setShowMejoras] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  // FASE 3.6
  const [showKit, setShowKit] = useState(false);
  const [showBolsa, setShowBolsa] = useState(false);
  const [modalidadSelec, setModalidadSelec] = useState<ModalidadComercializacion | ''>(
    expediente.modalidadElegida ?? ''
  );
  const [cerrando, setCerrando] = useState(false);

  const estado = expediente.estado;
  const metaEstado = ESTADOS_RECOMERCIALIZACION[estado];

  const persistir = async (parcial: Partial<ExpedienteRecomercializacion>) => {
    setGuardando(true);
    try {
      await onGuardar({
        ...expediente,
        ...parcial,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setGuardando(false);
    }
  };

  const construirDatosSalida = () => ({
    fechaComunicacion: fechaComunicacion || undefined,
    fechaPrevistaSalida: fechaPrevistaSalida || undefined,
    fechaEntregaLlaves: fechaEntregaLlaves || undefined,
    observaciones: observaciones.trim() || undefined,
    depositoFianzaADevolver: fianza ? parseFloat(fianza.replace(',', '.')) || 0 : undefined,
  });

  const notificarSalida = async () => {
    await persistir({
      estado: 'SALIDA_NOTIFICADA',
      datosSalida: {
        ...construirDatosSalida(),
        contratoEstado: 'EN_PROCESO_RESOLUCION',
      },
    });
  };

  const registrarLlaves = async () => {
    await persistir({
      estado: 'REVISION_PENDIENTE',
      datosSalida: {
        ...construirDatosSalida(),
        fechaEntregaLlaves: fechaEntregaLlaves || hoy(),
        contratoEstado: 'FINALIZADO_LIQUIDADO',
      },
    });
  };

  const cancelar = async () => {
    if (!window.confirm('¿Cancelar este expediente de recomercialización?')) return;
    await persistir({ estado: 'CANCELADO' });
  };
  const reabrir = async () => persistir({ estado: 'BORRADOR' });

  // FASE 3.6 — decisión de estrategia, publicación y cierre del ciclo.
  const tomarDecision = async () => {
    if (!modalidadSelec) {
      window.alert('Elige primero cómo quieres comercializar el inmueble.');
      return;
    }
    await persistir({ modalidadElegida: modalidadSelec, estado: 'DECISION_ESTRATEGIA' });
  };

  const iniciarComercializacion = async () => {
    const ahora = new Date().toISOString();
    await persistir({
      estado: 'EN_COMERCIALIZACION',
      comercializacion: {
        inmobiliariasContactadasIds: expediente.comercializacion?.inmobiliariasContactadasIds ?? [],
        ...expediente.comercializacion,
        fechaInicioComercializacion: expediente.comercializacion?.fechaInicioComercializacion || ahora,
      },
    });
  };

  const volverADecision = async () => persistir({ estado: 'DECISION_ESTRATEGIA' });

  const cerrarCiclo = async (resultado: 'REARRENDADO' | 'VENDIDO') => {
    const esAlquiler = resultado === 'REARRENDADO';
    const ok = window.confirm(
      esAlquiler
        ? '¿Marcar el expediente como CERRADO · REARRENDADO? Se dará por finalizado el contrato anterior y el inmueble quedará liberado para formalizar el nuevo contrato sobre la misma ficha.'
        : '¿Marcar el expediente como CERRADO · VENDIDO? Se cerrará el ciclo de comercialización y el inmueble quedará liberado en el histórico.'
    );
    if (!ok) return;
    const actualizado: ExpedienteRecomercializacion = {
      ...expediente,
      estado: esAlquiler ? 'CERRADO_REARRENDADO' : 'CERRADO_VENDIDO',
      comercializacion: {
        inmobiliariasContactadasIds: expediente.comercializacion?.inmobiliariasContactadasIds ?? [],
        ...expediente.comercializacion,
        fechaCierre: new Date().toISOString(),
        resultadoCierre: resultado,
      },
      updatedAt: new Date().toISOString(),
    };
    setCerrando(true);
    try {
      if (onCerrarCiclo) await onCerrarCiclo(actualizado, resultado);
      else await onGuardar(actualizado);
    } finally {
      setCerrando(false);
      onClose();
    }
  };
  const eliminar = async () => {
    if (!window.confirm('¿Eliminar definitivamente este expediente? Esta acción no se puede deshacer.')) return;
    await onEliminar(expediente.id);
    onClose();
  };

  const inputCls =
    'w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none';
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';

  const ordenEstados = (Object.keys(ESTADOS_RECOMERCIALIZACION) as EstadoRecomercializacion[]).sort(
    (a, b) => ESTADOS_RECOMERCIALIZACION[a].orden - ESTADOS_RECOMERCIALIZACION[b].orden
  );

  const siguienteHabilitado: EstadoRecomercializacion | null =
    estado === 'BORRADOR'
      ? 'SALIDA_NOTIFICADA'
      : estado === 'SALIDA_NOTIFICADA'
      ? 'REVISION_PENDIENTE'
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl my-8 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 leading-tight">
                {inmueble?.direccion || 'Expediente de recomercialización'}
              </h3>
              <p className="text-xs text-slate-500">
                {DESTINO_INMUEBLE_LABEL[expediente.destinoPrevisto]}
                {expediente.modalidadElegida
                  ? ` · ${MODALIDAD_COMERCIALIZACION_LABEL[expediente.modalidadElegida]}`
                  : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${metaEstado.color}`}>
              {metaEstado.label}
            </span>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Línea de tiempo */}
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Progreso del expediente</h4>
            <div className="flex flex-wrap gap-1.5">
              {ordenEstados.map((e) => {
                const actual = e === estado;
                const ordenActual = ESTADOS_RECOMERCIALIZACION[estado].orden;
                const pasado =
                  !esEstadoCierre(e) &&
                  ESTADOS_RECOMERCIALIZACION[e].orden < ordenActual &&
                  !esEstadoCierre(estado);
                const habilitado = ESTADOS_HABILITADOS_UI.includes(e);
                return (
                  <span
                    key={e}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold border ${
                      actual
                        ? ESTADOS_RECOMERCIALIZACION[e].color + ' border-transparent'
                        : pasado
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : habilitado
                        ? 'bg-slate-50 text-slate-500 border-slate-200'
                        : 'bg-slate-50/50 text-slate-300 border-slate-200 border-dashed'
                    }`}
                    title={habilitado ? '' : 'Estado final, se alcanza automáticamente al cerrar el ciclo'}
                  >
                    {ESTADOS_RECOMERCIALIZACION[e].label}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Datos de salida */}
          {!esEstadoCierre(estado) && (
            <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50">
              <h4 className="text-xs font-bold text-slate-700">Salida del inquilino</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Comunicación</label>
                  <input type="date" className={inputCls} value={fechaComunicacion} onChange={(e) => setFechaComunicacion(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Salida prevista</label>
                  <input type="date" className={inputCls} value={fechaPrevistaSalida} onChange={(e) => setFechaPrevistaSalida(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Entrega de llaves</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={fechaEntregaLlaves}
                    onChange={(e) => setFechaEntregaLlaves(e.target.value)}
                    disabled={estado === 'REVISION_PENDIENTE'}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Fianza a devolver (€)</label>
                  <input type="number" step="0.01" min="0" className={inputCls} value={fianza} onChange={(e) => setFianza(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Observaciones</label>
                  <input type="text" className={inputCls} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() =>
                    persistir({
                      datosSalida: {
                        ...construirDatosSalida(),
                        contratoEstado: expediente.datosSalida?.contratoEstado || 'EN_PROCESO_RESOLUCION',
                      },
                    })
                  }
                  disabled={guardando || estado === 'REVISION_PENDIENTE'}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                >
                  Guardar datos de salida
                </button>
              </div>
            </div>
          )}

          {/* Inspección fotográfica (FASE 3.2) */}
          {!esEstadoCierre(estado) &&
            ESTADOS_RECOMERCIALIZACION[estado].orden >=
              ESTADOS_RECOMERCIALIZACION.REVISION_PENDIENTE.orden &&
            (() => {
              const fotos = expediente.revisionFotografica?.fotografias ?? [];
              const cubiertas = new Set(fotos.map((f) => f.estancia));
              return (
                <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-sky-600" /> Inspección visual por estancias
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      {fotos.length} foto{fotos.length === 1 ? '' : 's'} · {cubiertas.size}/{ESTANCIAS_ORDEN.length} zonas
                      {fotos.filter((f) => f.analisisIa).length > 0 && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-violet-600 font-semibold">
                          <Sparkles className="w-3 h-3" />
                          {fotos.filter((f) => f.analisisIa).length} analizadas
                        </span>
                      )}
                    </span>
                  </div>

                  {fotos.length > 0 ? (
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                      {ESTANCIAS_ORDEN.map((est) => {
                        const n = fotos.filter((f) => f.estancia === est).length;
                        return (
                          <div
                            key={est}
                            title={ESTANCIA_LABEL[est]}
                            className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[9px] font-semibold border ${
                              n > 0
                                ? 'bg-sky-50 border-sky-200 text-sky-700'
                                : 'bg-slate-50 border-dashed border-slate-200 text-slate-300'
                            }`}
                          >
                            <Camera className="w-3.5 h-3.5 mb-0.5" />
                            {n > 0 ? n : '·'}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400">
                      Aún no hay fotografías. Haz el recorrido por salón, cocina, baños, dormitorios y
                      el resto de estancias para documentar el estado antes de publicar.
                    </p>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={() => setShowInspeccion(true)}
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {fotos.length > 0 ? 'Ver / editar fotografías' : 'Hacer inspección fotográfica'}
                    </button>
                  </div>
                </div>
              );
            })()}

          {/* Reformas y optimización ROI (FASE 3.4) */}
          {!esEstadoCierre(estado) &&
            ESTADOS_RECOMERCIALIZACION[estado].orden >=
              ESTADOS_RECOMERCIALIZACION.FOTOS_ACTUALIZADAS.orden &&
            (() => {
              const mejoras = expediente.mejorasPropuestas ?? [];
              const escenarios = escenariosROI(mejoras);
              const parcial = escenarios.find((e) => e.id === 'parcial')!;
              const completa = escenarios.find((e) => e.id === 'completa')!;
              return (
                <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Wrench className="w-4 h-4 text-teal-600" /> Reformas y optimización (ROI)
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      {mejoras.length} propuesta(s) · {mejoras.filter((m) => m.confirmadaPorPropietario).length} confirmada(s)
                    </span>
                  </div>

                  {mejoras.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-2.5">
                        <p className="font-semibold text-teal-800 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Parcial (confirmadas · {parcial.numeroMejoras})
                        </p>
                        <p className="text-slate-600 mt-1">
                          Inversión ~{parcial.inversionMedia.toLocaleString('es-ES')} € · +{parcial.rentaExtraMensual} €/mes
                        </p>
                        <p className="text-slate-500">
                          Payback {parcial.paybackMeses !== undefined ? `${parcial.paybackMeses} meses` : '—'} · +valor {parcial.plusvaliaEstimada.toLocaleString('es-ES')} €
                        </p>
                      </div>
                      <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-2.5">
                        <p className="font-semibold text-indigo-800 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" /> Completa ({completa.numeroMejoras})
                        </p>
                        <p className="text-slate-600 mt-1">
                          Inversión ~{completa.inversionMedia.toLocaleString('es-ES')} € · +{completa.rentaExtraMensual} €/mes
                        </p>
                        <p className="text-slate-500">
                          Payback {completa.paybackMeses !== undefined ? `${completa.paybackMeses} meses` : '—'} · +valor {completa.plusvaliaEstimada.toLocaleString('es-ES')} €
                        </p>
                      </div>
                    </div>
                  )}

                  {mejoras.length === 0 && (
                    <p className="text-[11px] text-slate-400">
                      Aún no hay mejoras propuestas. Puedes generarlas con IA a partir del diagnóstico
                      de las fotos o añadirlas manualmente, y estimar coste, subida de renta, plusvalía
                      y plazo de retorno.
                    </p>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={() => setShowMejoras(true)}
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg flex items-center gap-1.5"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      {mejoras.length > 0 ? 'Ver / editar mejoras y ROI' : 'Planificar mejoras y ROI'}
                    </button>
                  </div>
                </div>
              );
            })()}

          {/* Valoración / pricing (FASE 3.5) */}
          {!esEstadoCierre(estado) &&
            ESTADOS_RECOMERCIALIZACION[estado].orden >=
              ESTADOS_RECOMERCIALIZACION.FOTOS_ACTUALIZADAS.orden &&
            (() => {
              const p = expediente.pricing;
              return (
                <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Calculator className="w-4 h-4 text-teal-600" /> Valoración y escenarios de precio
                    </h4>
                    {p?.fechaCalculo && (
                      <span className="text-[10px] text-slate-400">
                        {p.motor === 'ia' ? 'Revisado por IA' : 'Calculadora'} · {formatDate(p.fechaCalculo)}
                      </span>
                    )}
                  </div>

                  {p?.escenarioRecomendado ? (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2">
                        <p className="text-[9px] font-bold text-emerald-700">Conservador</p>
                        <p className="text-sm font-extrabold text-slate-800">{p.escenarioConservador} €</p>
                      </div>
                      <div className="rounded-lg border border-teal-300 bg-teal-50/60 p-2">
                        <p className="text-[9px] font-bold text-teal-700">Recomendado</p>
                        <p className="text-sm font-extrabold text-slate-900">{p.escenarioRecomendado} €</p>
                      </div>
                      <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-2">
                        <p className="text-[9px] font-bold text-indigo-700">Máximo</p>
                        <p className="text-sm font-extrabold text-slate-800">{p.escenarioMaximo} €</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400">
                      Sin precio calculado. Parte de la renta anterior, el IPC, las mejoras confirmadas y
                      unos testigos de mercado para obtener los escenarios conservador, recomendado y máximo.
                    </p>
                  )}

                  {p?.valoracionVentaEstimada ? (
                    <p className="text-[11px] text-slate-600">
                      Venta estimada: <b>{p.valoracionVentaEstimada.toLocaleString('es-ES')} €</b>
                      {p.horquillaVentaMin && p.horquillaVentaMax && (
                        <> (horquilla {p.horquillaVentaMin.toLocaleString('es-ES')}–{p.horquillaVentaMax.toLocaleString('es-ES')} €)</>
                      )}
                      {p.precioM2Alquiler ? <> · {p.precioM2Alquiler} €/m²·mes alquiler</> : null}
                    </p>
                  ) : null}

                  <div className="flex justify-end">
                    <button
                      onClick={() => setShowPricing(true)}
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg flex items-center gap-1.5"
                    >
                      <Calculator className="w-3.5 h-3.5" />
                      {p?.escenarioRecomendado ? 'Ver / recalcular precio' : 'Calcular precio'}
                    </button>
                  </div>
                </div>
              );
            })()}

          {/* Estrategia y comercialización (FASE 3.6) */}
          {!esEstadoCierre(estado) &&
            ESTADOS_RECOMERCIALIZACION[estado].orden >=
              ESTADOS_RECOMERCIALIZACION.VALORACION_COMPLETADA.orden &&
            (() => {
              const com = expediente.comercializacion;
              const propuestasExp = (propuestas ?? []).filter((p) => p.expedienteId === expediente.id);
              const contactadas = com?.inmobiliariasContactadasIds?.length ?? 0;
              const aceptada = propuestasExp.find((p) => p.estado === 'ACEPTADA');
              const pendientes = propuestasExp.filter((p) => p.estado === 'PENDIENTE').length;
              const modalidades: { id: ModalidadComercializacion; titulo: string; desc: string }[] = [
                { id: 'GESTION_PROPIA', titulo: 'Gestión propia', desc: 'Publicas y gestionas tú las visitas y el filtrado.' },
                { id: 'INMOBILIARIA', titulo: 'Delegar en inmobiliaria', desc: 'Lanzas RFPs y comparas propuestas de la bolsa.' },
                { id: 'AMBAS', titulo: 'Híbrida / ambas', desc: 'Combinas tu gestión con una o varias agencias.' },
              ];
              const enDecision = estado === 'DECISION_ESTRATEGIA';
              const enComercial = estado === 'EN_COMERCIALIZACION';
              return (
                <div className="rounded-xl border border-indigo-200 p-4 space-y-3 bg-indigo-50/30">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Flag className="w-4 h-4 text-indigo-600" /> Estrategia y comercialización
                  </h4>

                  {estado === 'VALORACION_COMPLETADA' && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {modalidades.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setModalidadSelec(m.id)}
                            className={`text-left rounded-xl border p-3 transition ${
                              modalidadSelec === m.id
                                ? 'border-indigo-500 bg-white ring-2 ring-indigo-200'
                                : 'border-slate-200 bg-white/60 hover:border-indigo-300'
                            }`}
                          >
                            <p className="text-xs font-bold text-slate-800">{m.titulo}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{m.desc}</p>
                          </button>
                        ))}
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={tomarDecision}
                          disabled={guardando || !modalidadSelec}
                          className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" /> Tomar decisión de estrategia
                        </button>
                      </div>
                    </>
                  )}

                  {(enDecision || enComercial) && expediente.modalidadElegida && (
                    <>
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="px-2 py-1 rounded-lg bg-indigo-100 text-indigo-800 font-bold">
                          {MODALIDAD_COMERCIALIZACION_LABEL[expediente.modalidadElegida]}
                        </span>
                        {com?.kitPublicacion?.titulo ? (
                          <span className="px-2 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-200">
                            Kit {com.fechaPublicacion ? `publicado el ${formatDate(com.fechaPublicacion)}` : 'en borrador'}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-lg bg-slate-50 text-slate-500 border border-slate-200">Sin kit de publicación</span>
                        )}
                        {(expediente.modalidadElegida === 'INMOBILIARIA' || expediente.modalidadElegida === 'AMBAS') && (
                          <>
                            <span className="px-2 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-200">
                              {contactadas} agencia(s) contactada(s)
                            </span>
                            {pendientes > 0 && (
                              <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                                {pendientes} propuesta(s) por decidir
                              </span>
                            )}
                            {aceptada && (
                              <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                                <FileCheck className="w-3 h-3" /> Propuesta aceptada
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          onClick={() => setShowKit(true)}
                          className="px-3.5 py-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-lg flex items-center gap-1.5"
                        >
                          <Megaphone className="w-3.5 h-3.5" />
                          {com?.kitPublicacion?.titulo ? 'Ver / editar anuncio' : 'Kit de publicación'}
                        </button>
                        {(expediente.modalidadElegida === 'INMOBILIARIA' ||
                          expediente.modalidadElegida === 'AMBAS') && (
                          <button
                            onClick={() => setShowBolsa(true)}
                            className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-1.5"
                          >
                            <Building2 className="w-3.5 h-3.5" /> Bolsa de inmobiliarias
                          </button>
                        )}
                        {enDecision && (
                          <button
                            onClick={iniciarComercializacion}
                            disabled={guardando}
                            className="px-4 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <PlayCircle className="w-3.5 h-3.5" /> Iniciar comercialización
                          </button>
                        )}
                      </div>

                      {enComercial && (
                        <div className="border-t border-indigo-100 pt-3">
                          <p className="text-[11px] text-slate-500 mb-2">
                            Cuando el inmueble tenga nuevo inquilino (o se haya vendido), cierra el ciclo. La entrega de
                            llaves previa da por finalizado el contrato anterior y libera la ficha del inmueble.
                          </p>
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              onClick={volverADecision}
                              disabled={guardando}
                              className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg flex items-center gap-1.5"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Volver a estrategia
                            </button>
                            <button
                              onClick={() => cerrarCiclo('REARRENDADO')}
                              disabled={cerrando || expediente.destinoPrevisto === 'VENTA'}
                              title={expediente.destinoPrevisto === 'VENTA' ? 'El destino previsto es venta' : undefined}
                              className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5 disabled:opacity-40"
                            >
                              <KeyRound className="w-3.5 h-3.5" /> Cerrado · rearrendado
                            </button>
                            <button
                              onClick={() => cerrarCiclo('VENDIDO')}
                              disabled={cerrando}
                              className="px-4 py-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg flex items-center gap-1.5 disabled:opacity-40"
                            >
                              <FileCheck className="w-3.5 h-3.5" /> Cerrado · vendido
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

          {/* Resumen si está cerrado/cancelado */}
          {esEstadoCierre(estado) && expediente.datosSalida && (
            <div className="rounded-xl border border-slate-200 p-4 text-xs text-slate-600 space-y-1">
              <p>Comunicación: <b>{expediente.datosSalida.fechaComunicacion ? formatDate(expediente.datosSalida.fechaComunicacion) : '—'}</b></p>
              <p>Entrega de llaves: <b>{expediente.datosSalida.fechaEntregaLlaves ? formatDate(expediente.datosSalida.fechaEntregaLlaves) : '—'}</b></p>
              {expediente.datosSalida.observaciones && <p>Notas: {expediente.datosSalida.observaciones}</p>}
            </div>
          )}
          {esEstadoCierre(estado) &&
            (estado === 'CERRADO_REARRENDADO' || estado === 'CERRADO_VENDIDO') && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-800 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  {estado === 'CERRADO_REARRENDADO' ? 'Ciclo cerrado · inmueble rearrendado' : 'Ciclo cerrado · inmueble vendido'}
                </p>
                {expediente.comercializacion?.fechaCierre && (
                  <p>Cierre comercial: <b>{formatDate(expediente.comercializacion.fechaCierre)}</b></p>
                )}
                <p>
                  El contrato anterior quedó finalizado y la ficha del inmueble, liberada. La nueva
                  comercialización o contrato se formaliza sobre la misma ficha (mismo identificador).
                </p>
              </div>
            )}

          {estado === 'REVISION_PENDIENTE' && (
            <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/50 p-4 text-xs text-sky-800">
              Tras recibir las llaves, haz la <b>inspección visual por estancias</b>, sube las
              fotografías y lanza el <b>diagnóstico asistido por IA</b> (indicios y sugerencias de
              puesta a punto, nunca certezas). El pricing y la comercialización llegan en la 3.5-3.6.
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {puedeTransicionar(estado, 'BORRADOR') ? (
              <button onClick={reabrir} disabled={guardando} className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" /> Reabrir
              </button>
            ) : (
              !esEstadoCierre(estado) && (
                <button onClick={cancelar} disabled={guardando} className="px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-xl flex items-center gap-1">
                  <Ban className="w-3.5 h-3.5" /> Cancelar expediente
                </button>
              )
            )}
            <button onClick={eliminar} className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-rose-600 rounded-xl flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> Eliminar
            </button>
          </div>
          <div className="flex items-center gap-2">
            {siguienteHabilitado === 'SALIDA_NOTIFICADA' && (
              <button onClick={notificarSalida} disabled={guardando} className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl flex items-center gap-1.5 disabled:opacity-50">
                <BellRing className="w-4 h-4" /> Registrar comunicación de salida
              </button>
            )}
            {siguienteHabilitado === 'REVISION_PENDIENTE' && (
              <button onClick={registrarLlaves} disabled={guardando} className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-1.5 disabled:opacity-50">
                <KeyRound className="w-4 h-4" /> Registrar entrega de llaves
              </button>
            )}
            {estado === 'REVISION_PENDIENTE' && (
              <button
                onClick={() => setShowInspeccion(true)}
                className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl flex items-center gap-1.5"
              >
                <Camera className="w-4 h-4" /> Inspección fotográfica
              </button>
            )}
            {estado === 'FOTOS_ACTUALIZADAS' && (
              <button
                onClick={() => setShowPricing(true)}
                className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl flex items-center gap-1.5"
              >
                <Calculator className="w-4 h-4" /> Calcular precio
              </button>
            )}
            {estado === 'VALORACION_COMPLETADA' && puedeTransicionar('VALORACION_COMPLETADA', 'FOTOS_ACTUALIZADAS') && (
              <button
                onClick={async () => {
                  const ahora = new Date().toISOString();
                  await persistir({ estado: 'FOTOS_ACTUALIZADAS', updatedAt: ahora });
                }}
                className="px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Volver a fotos
              </button>
            )}
            {estado === 'VALORACION_COMPLETADA' && (
              <span className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">
                <Check className="w-4 h-4" /> Valoración completada
              </span>
            )}
          </div>
        </div>
      </div>

      {showInspeccion && (
        <InspeccionFotograficaModal
          expediente={expediente}
          inmueble={inmueble}
          onGuardar={onGuardar}
          onClose={() => setShowInspeccion(false)}
        />
      )}

      {showMejoras && (
        <MejorasROIModal
          expediente={expediente}
          inmueble={inmueble}
          rentaAnterior={rentaAnterior}
          profesionales={profesionales ?? []}
          onGuardar={onGuardar}
          onClose={() => setShowMejoras(false)}
        />
      )}

      {showPricing && (
        <PricingModal
          expediente={expediente}
          inmueble={inmueble}
          rentaAnterior={rentaAnterior}
          onGuardar={onGuardar}
          onClose={() => setShowPricing(false)}
        />
      )}

      {showKit && (
        <KitPublicacionModal
          expediente={expediente}
          inmueble={inmueble}
          rentaAnterior={rentaAnterior}
          onGuardar={onGuardar}
          onClose={() => setShowKit(false)}
        />
      )}

      {showBolsa && (
        <BolsaInmobiliariasModal
          expediente={expediente}
          inmueble={inmueble}
          inmobiliarias={inmobiliarias ?? []}
          propuestas={propuestas ?? []}
          leads={leads ?? []}
          currentUser={currentUser}
          onGuardarExpediente={onGuardar}
          onGuardarInmobiliaria={async (a) => {
            await onGuardarInmobiliaria?.(a);
          }}
          onEliminarInmobiliaria={async (id) => {
            await onEliminarInmobiliaria?.(id);
          }}
          onGuardarLead={async (l) => {
            await onGuardarLead?.(l);
          }}
          onGuardarPropuesta={async (p) => {
            await onGuardarPropuesta?.(p);
          }}
          onClose={() => setShowBolsa(false)}
        />
      )}
    </div>
  );
};
