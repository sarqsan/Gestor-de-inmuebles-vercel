import React, { useMemo, useState } from 'react';
import { X, RefreshCw, AlertCircle, Save } from 'lucide-react';
import type {
  ContratoFormalizacion,
  DatosSalidaInquilino,
  DestinoInmueble,
  ExpedienteRecomercializacion,
  Inmueble,
  UsuarioApp,
} from '../../types';
import {
  crearExpediente,
  DESTINO_INMUEBLE_LABEL,
} from '../../utils/recomercializacionEngine';

export interface ContextoNuevoExpediente {
  inmuebleId?: string;
  contratoAnteriorId?: string;
}

interface Props {
  inmuebles: Inmueble[];
  contratos: ContratoFormalizacion[];
  contexto?: ContextoNuevoExpediente | null;
  expedientesAbiertos: ExpedienteRecomercializacion[];
  currentUser?: UsuarioApp | null;
  onCreate: (expediente: ExpedienteRecomercializacion) => Promise<void> | void;
  onClose: () => void;
}

const labelInmueble = (i: Inmueble): string =>
  `${i.direccion}${i.ciudad ? `, ${i.ciudad}` : ''}`;

const hoy = () => new Date().toISOString().split('T')[0];

export const RecomercializarModal: React.FC<Props> = ({
  inmuebles,
  contratos,
  contexto,
  expedientesAbiertos,
  currentUser,
  onCreate,
  onClose,
}) => {
  const [inmuebleId, setInmuebleId] = useState<string>(
    contexto?.inmuebleId || inmuebles[0]?.id || ''
  );
  const contratosDelInmueble = useMemo(
    () =>
      contratos
        .filter((c) => c.inmuebleId === inmuebleId)
        .sort((a, b) => (b.fechaFormalizacion || '').localeCompare(a.fechaFormalizacion || '')),
    [contratos, inmuebleId]
  );
  const contratoActivo = useMemo(
    () =>
      contratosDelInmueble.find((c) =>
        ['FIRMADO', 'FIANZA_DEPOSITADA', 'FORMALIZADO_ACTIVO'].includes(c.estado)
      ) || contratosDelInmueble[0],
    [contratosDelInmueble]
  );
  const [contratoAnteriorId, setContratoAnteriorId] = useState<string>(
    contexto?.contratoAnteriorId || contratoActivo?.id || ''
  );

  const [destino, setDestino] = useState<DestinoInmueble>('INDECISO');
  const [fechaComunicacion, setFechaComunicacion] = useState<string>(hoy());
  const [fechaPrevistaSalida, setFechaPrevistaSalida] = useState<string>('');
  const [fechaEntregaLlaves, setFechaEntregaLlaves] = useState<string>('');
  const [fianza, setFianza] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [guardando, setGuardando] = useState<boolean>(false);

  const inmuebleSeleccionado = inmuebles.find((i) => i.id === inmuebleId);
  const expedienteAbierto = expedientesAbiertos.find((e) => e.inmuebleId === inmuebleId);

  const inputCls =
    'w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition';
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!inmuebleId) return setErrorMsg('Selecciona el inmueble a recomercializar.');
    if (expedienteAbierto) {
      return setErrorMsg(
        'Ya existe un expediente de recomercialización abierto para este inmueble. Utiliza ese expediente o cancélalo antes de crear otro.'
      );
    }
    if (fechaEntregaLlaves && !fechaPrevistaSalida) {
      return setErrorMsg('Si hay entrega de llaves, indica también la fecha prevista de salida.');
    }

    const propietarioId =
      inmuebleSeleccionado?.propietarioId ||
      inmuebleSeleccionado?.propietarioPrincipalId ||
      currentUser?.propietarioId ||
      '';

    const datosSalida: DatosSalidaInquilino | undefined =
      fechaComunicacion || fechaPrevistaSalida || fechaEntregaLlaves || observaciones || fianza
        ? {
            fechaComunicacion: fechaComunicacion || undefined,
            fechaPrevistaSalida: fechaPrevistaSalida || undefined,
            fechaEntregaLlaves: fechaEntregaLlaves || undefined,
            observaciones: observaciones.trim() || undefined,
            depositoFianzaADevolver: fianza ? parseFloat(fianza.replace(',', '.')) || 0 : undefined,
            contratoEstado: fechaEntregaLlaves
              ? 'FINALIZADO_LIQUIDADO'
              : 'EN_PROCESO_RESOLUCION',
          }
        : undefined;

    const expediente = crearExpediente({
      inmuebleId,
      propietarioId,
      contratoAnteriorId: contratoAnteriorId || undefined,
      destinoPrevisto: destino,
      creadoPor: currentUser?.nombre,
      creadoPorId: currentUser?.id,
    });
    expediente.datosSalida = datosSalida;
    expediente.estado = fechaEntregaLlaves
      ? 'REVISION_PENDIENTE'
      : fechaComunicacion
      ? 'SALIDA_NOTIFICADA'
      : 'BORRADOR';

    setGuardando(true);
    try {
      await onCreate(expediente);
      onClose();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl my-8 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Recomercializar inmueble</h3>
              <p className="text-xs text-slate-500">
                Registra la salida del inquilino y abre el expediente del activo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Inmueble *</label>
              <select
                className={inputCls}
                value={inmuebleId}
                onChange={(e) => {
                  setInmuebleId(e.target.value);
                  setContratoAnteriorId('');
                }}
                disabled={!!contexto?.inmuebleId}
              >
                {inmuebles.length === 0 && <option value="">Sin inmuebles</option>}
                {inmuebles.map((i) => (
                  <option key={i.id} value={i.id}>
                    {labelInmueble(i)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Contrato anterior (opcional)</label>
              <select className={inputCls} value={contratoAnteriorId} onChange={(e) => setContratoAnteriorId(e.target.value)}>
                <option value="">Sin vincular</option>
                {contratosDelInmueble.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.candidatoNombre || 'Inquilino'} · {c.rentaMensual}€/mes
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Destino previsto</label>
            <select className={inputCls} value={destino} onChange={(e) => setDestino(e.target.value as DestinoInmueble)}>
              {(Object.keys(DESTINO_INMUEBLE_LABEL) as DestinoInmueble[]).map((d) => (
                <option key={d} value={d}>
                  {DESTINO_INMUEBLE_LABEL[d]}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50">
            <p className="text-xs font-bold text-slate-700">Salida del inquilino actual</p>
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
                <input type="date" className={inputCls} value={fechaEntregaLlaves} onChange={(e) => setFechaEntregaLlaves(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className={labelCls}>Fianza a devolver (€)</label>
                <input type="number" step="0.01" min="0" className={inputCls} value={fianza} onChange={(e) => setFianza(e.target.value)} placeholder="0,00" />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Observaciones de la salida</label>
                <input
                  type="text"
                  className={inputCls}
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Estado aparente, suministros, acuerdos…"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Con fecha de comunicación el expediente pasa a «Salida notificada»; si ya hay entrega
              de llaves, a «Revisión pendiente» (listo para la inspección visual de la fase siguiente).
            </p>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200/60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={guardando}
            className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>{guardando ? 'Creando…' : 'Abrir expediente'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
