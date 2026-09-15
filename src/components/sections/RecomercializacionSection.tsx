import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Plus,
  Search,
  MapPin,
  CalendarClock,
  KeyRound,
  Camera,
  ArrowRight,
} from 'lucide-react';
import type {
  ContratoFormalizacion,
  EstadoRecomercializacion,
  ExpedienteRecomercializacion,
  Inmueble,
  UsuarioApp,
} from '../../types';
import { formatDate } from '../../utils/formatters';
import {
  DESTINO_INMUEBLE_LABEL,
  esEstadoCierre,
  ESTADOS_RECOMERCIALIZACION,
} from '../../utils/recomercializacionEngine';
import { RecomercializarModal, type ContextoNuevoExpediente } from '../modals/RecomercializarModal';
import { DetalleExpedienteModal } from '../modals/DetalleExpedienteModal';

interface Props {
  expedientes: ExpedienteRecomercializacion[];
  inmuebles: Inmueble[];
  contratos: ContratoFormalizacion[];
  currentUser?: UsuarioApp | null;
  contextoNuevo?: ContextoNuevoExpediente | null;
  onConsumirContexto?: () => void;
  onCreate: (expediente: ExpedienteRecomercializacion) => Promise<void> | void;
  onGuardar: (expediente: ExpedienteRecomercializacion) => Promise<void> | void;
  onEliminar: (id: string) => Promise<void> | void;
}

export const RecomercializacionSection: React.FC<Props> = ({
  expedientes,
  inmuebles,
  contratos,
  currentUser,
  contextoNuevo,
  onConsumirContexto,
  onCreate,
  onGuardar,
  onEliminar,
}) => {
  const [showAlta, setShowAlta] = useState(false);
  const [contextoAlta, setContextoAlta] = useState<ContextoNuevoExpediente | null>(null);
  const [seleccionado, setSeleccionado] = useState<ExpedienteRecomercializacion | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>('ABIERTOS');
  const [busqueda, setBusqueda] = useState('');

  // Autoapertura al llegar desde la ficha del inmueble o del contrato.
  useEffect(() => {
    if (contextoNuevo) {
      setContextoAlta(contextoNuevo);
      setShowAlta(true);
      onConsumirContexto?.();
    }
  }, [contextoNuevo, onConsumirContexto]);

  const inmuebleMap = useMemo(() => new Map(inmuebles.map((i) => [i.id, i])), [inmuebles]);
  const etiquetaInmueble = (id: string) => {
    const i = inmuebleMap.get(id);
    return i ? `${i.direccion}${i.ciudad ? `, ${i.ciudad}` : ''}` : 'Inmueble eliminado';
  };

  const expedientesAbiertos = useMemo(
    () => expedientes.filter((e) => !esEstadoCierre(e.estado)),
    [expedientes]
  );

  const visibles = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    return expedientes
      .filter((e) => {
        if (filtroEstado === 'ABIERTOS' && esEstadoCierre(e.estado)) return false;
        if (filtroEstado === 'CERRADOS' && !esEstadoCierre(e.estado)) return false;
        if (filtroEstado !== 'ABIERTOS' && filtroEstado !== 'CERRADOS' && filtroEstado !== 'TODOS') {
          if (e.estado !== filtroEstado) return false;
        }
        if (term && !etiquetaInmueble(e.inmuebleId).toLowerCase().includes(term)) return false;
        return true;
      })
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedientes, filtroEstado, busqueda, inmuebleMap]);

  const kpis = [
    {
      label: 'Expedientes abiertos',
      valor: expedientes.filter((e) => !esEstadoCierre(e.estado)).length,
      cls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    },
    {
      label: 'En salida / inspección',
      valor: expedientes.filter((e) =>
        ['SALIDA_NOTIFICADA', 'REVISION_PENDIENTE', 'FOTOS_ACTUALIZADAS'].includes(e.estado)
      ).length,
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    {
      label: 'En valoración/comercialización',
      valor: expedientes.filter((e) =>
        ['VALORACION_COMPLETADA', 'DECISION_ESTRATEGIA', 'EN_COMERCIALIZACION'].includes(e.estado)
      ).length,
      cls: 'bg-violet-50 text-violet-700 border-violet-200',
    },
    {
      label: 'Cerrados',
      valor: expedientes.filter((e) =>
        ['CERRADO_REARRENDADO', 'CERRADO_VENDIDO'].includes(e.estado)
      ).length,
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
  ];

  const inputCls =
    'px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none bg-white';

  const abrirNuevo = () => {
    setContextoAlta(null);
    setShowAlta(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <RefreshCw className="w-6 h-6 text-indigo-600" />
            Recomercialización
          </h2>
          <p className="text-sm text-slate-500">
            Salida del inquilino, inspección, valoración y nueva comercialización del activo.
          </p>
        </div>
        <button
          onClick={abrirNuevo}
          disabled={inmuebles.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-sm transition"
        >
          <Plus className="w-4 h-4" /> Nuevo expediente
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold border ${k.cls}`}>
              {k.valor}
            </span>
            <p className="text-[11px] text-slate-500 mt-2 leading-snug">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative md:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por dirección…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className={`${inputCls} pl-9 w-full`}
          />
        </div>
        <select className={inputCls} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="ABIERTOS">Abiertos</option>
          <option value="CERRADOS">Cerrados / cancelados</option>
          <option value="TODOS">Todos</option>
          {(Object.keys(ESTADOS_RECOMERCIALIZACION) as EstadoRecomercializacion[]).map((e) => (
            <option key={e} value={e}>
              {ESTADOS_RECOMERCIALIZACION[e].label}
            </option>
          ))}
        </select>
      </div>

      {visibles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center mx-auto">
            <RefreshCw className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-slate-700">No hay expedientes</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Cuando un inquilino comunique su salida, abre un expediente de recomercialización para
            inspeccionar la vivienda, actualizar fotos, recalcular el precio y volver a alquilarla
            (o venderla) reutilizando el mismo inmueble y su histórico.
          </p>
          <button
            onClick={abrirNuevo}
            disabled={inmuebles.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition"
          >
            <Plus className="w-4 h-4" /> Abrir el primer expediente
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibles.map((e) => {
            const meta = ESTADOS_RECOMERCIALIZACION[e.estado];
            return (
              <button
                key={e.id}
                onClick={() => setSeleccionado(e)}
                className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:border-indigo-300 hover:shadow-md transition group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="truncate">{etiquetaInmueble(e.inmuebleId)}</span>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {DESTINO_INMUEBLE_LABEL[e.destinoPrevisto]} · inquilino anterior{' '}
                      {e.datosSalida?.fechaComunicacion
                        ? 'notificado'
                        : e.contratoAnteriorId
                        ? 'con contrato vinculado'
                        : 'sin notificar'}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold whitespace-nowrap ${meta.color}`}>
                    {meta.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="w-3.5 h-3.5" />
                    {e.datosSalida?.fechaPrevistaSalida
                      ? `Salida ${formatDate(e.datosSalida.fechaPrevistaSalida)}`
                      : 'Sin fecha de salida'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <KeyRound className="w-3.5 h-3.5" />
                    {e.datosSalida?.fechaEntregaLlaves
                      ? `Llaves ${formatDate(e.datosSalida.fechaEntregaLlaves)}`
                      : 'Llaves pendientes'}
                  </span>
                  {(e.revisionFotografica?.fotografias?.length ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 text-sky-600">
                      <Camera className="w-3.5 h-3.5" />
                      {e.revisionFotografica!.fotografias.length} foto
                      {e.revisionFotografica!.fotografias.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-end mt-3 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition">
                  Abrir expediente <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showAlta && (
        <RecomercializarModal
          inmuebles={inmuebles}
          contratos={contratos}
          contexto={contextoAlta}
          expedientesAbiertos={expedientesAbiertos}
          currentUser={currentUser}
          onCreate={onCreate}
          onClose={() => setShowAlta(false)}
        />
      )}

      {seleccionado && (
        <DetalleExpedienteModal
          expediente={expedientes.find((x) => x.id === seleccionado.id) || seleccionado}
          inmueble={inmuebleMap.get(seleccionado.inmuebleId)}
          onGuardar={onGuardar}
          onEliminar={onEliminar}
          onClose={() => setSeleccionado(null)}
        />
      )}
    </div>
  );
};
