import React, { useState } from 'react';
import { X, RefreshCw, Check, Ban, Trash2, KeyRound, BellRing, Camera } from 'lucide-react';
import type {
  EstadoRecomercializacion,
  ExpedienteRecomercializacion,
  Inmueble,
} from '../../types';
import {
  DESTINO_INMUEBLE_LABEL,
  esEstadoCierre,
  ESTADOS_RECOMERCIALIZACION,
  ESTANCIAS_ORDEN,
  ESTANCIA_LABEL,
  MODALIDAD_COMERCIALIZACION_LABEL,
  puedeTransicionar,
} from '../../utils/recomercializacionEngine';
import { formatDate } from '../../utils/formatters';
import { InspeccionFotograficaModal } from './InspeccionFotograficaModal';

interface Props {
  expediente: ExpedienteRecomercializacion;
  inmueble?: Inmueble;
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
  'CANCELADO',
];

export const DetalleExpedienteModal: React.FC<Props> = ({
  expediente,
  inmueble,
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
                    title={habilitado ? '' : 'Se habilita en las siguientes fases (3.3-3.6)'}
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

          {/* Resumen si está cerrado/cancelado */}
          {esEstadoCierre(estado) && expediente.datosSalida && (
            <div className="rounded-xl border border-slate-200 p-4 text-xs text-slate-600 space-y-1">
              <p>Comunicación: <b>{expediente.datosSalida.fechaComunicacion ? formatDate(expediente.datosSalida.fechaComunicacion) : '—'}</b></p>
              <p>Entrega de llaves: <b>{expediente.datosSalida.fechaEntregaLlaves ? formatDate(expediente.datosSalida.fechaEntregaLlaves) : '—'}</b></p>
              {expediente.datosSalida.observaciones && <p>Notas: {expediente.datosSalida.observaciones}</p>}
            </div>
          )}

          {estado === 'REVISION_PENDIENTE' && (
            <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/50 p-4 text-xs text-sky-800">
              Tras recibir las llaves, haz la <b>inspección visual por estancias</b> y sube las
              fotografías actualizadas. El diagnóstico asistido por IA llega en la fase 3.3; el
              pricing y la comercialización, en la 3.5-3.6.
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
              <span className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">
                <Check className="w-4 h-4" /> Fotos actualizadas
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
    </div>
  );
};
