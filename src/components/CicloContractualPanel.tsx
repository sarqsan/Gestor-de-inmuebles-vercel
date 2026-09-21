import React, { useState } from 'react';
import { ContratoFormalizacion, HabitacionInmueble, ModalidadContractual, TipoFinalizacionContrato, UsuarioApp } from '../types';
import {
  MODALIDAD_CONTRACTUAL_LABELS,
  MODALIDADES_CONTRACTUALES,
  aplicarContratoEspecial,
  cerrarFiniquito,
  confirmarAnexo,
  crearAnexo,
  crearFiniquito,
  crearNuevaVersionAnexo,
  finalizarContratoConHabitacion,
  inferirModalidadContractual,
  registrarMovimientoFiniquito,
  revisarPendientesCierre,
} from '../utils/contratoCicloEngine';
import { formatEuro } from '../utils/formatters';
import { FilePlus2, FileCheck2, Flag, ReceiptText, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * GAP 2 — Panel mínimo del ciclo contractual: modalidad, anexos, finalización y finiquito.
 * Toda la lógica vive en contratoCicloEngine (puro y testeado); este componente solo la conecta
 * con el guardado existente (onSaveContrato) y el aislamiento de habitaciones.
 */
interface CicloContractualPanelProps {
  contrato: ContratoFormalizacion;
  currentUser?: UsuarioApp | null;
  habitaciones?: HabitacionInmueble[];
  onSaveContrato: (contrato: ContratoFormalizacion) => Promise<void> | void;
  onUpdateHabitacion?: (habitacion: HabitacionInmueble) => Promise<void> | void;
  readOnly?: boolean;
}

type VistaCiclo = 'modalidad' | 'anexos' | 'finalizacion' | 'finiquito' | null;

export const CicloContractualPanel: React.FC<CicloContractualPanelProps> = ({
  contrato,
  currentUser,
  habitaciones,
  onSaveContrato,
  onUpdateHabitacion,
  readOnly,
}) => {
  const [vista, setVista] = useState<VistaCiclo>(null);
  const [error, setError] = useState<string | null>(null);
  const usuarioNombre = currentUser?.nombre || 'usuario';

  // ---- Modalidad ----
  const [modalidadSel, setModalidadSel] = useState<string>(inferirModalidadContractual(contrato));
  const [motivoTemp, setMotivoTemp] = useState(contrato.motivoTemporalidad || '');
  const [finalidad, setFinalidad] = useState(contrato.finalidadUso || '');
  const [fechaFinEsp, setFechaFinEsp] = useState(contrato.fechaFinContrato || '');
  const [duracionMeses, setDuracionMeses] = useState(contrato.duracionMeses ? String(contrato.duracionMeses) : '');

  // ---- Anexos ----
  const [anexoTitulo, setAnexoTitulo] = useState('');
  const [anexoContenido, setAnexoContenido] = useState('');

  // ---- Finalización ----
  const [tipoFin, setTipoFin] = useState<TipoFinalizacionContrato>('FINALIZACION_NATURAL');
  const [fechaEfectiva, setFechaEfectiva] = useState(new Date().toISOString().split('T')[0]);
  const [motivoFin, setMotivoFin] = useState('');

  const esTerminal = ['FINALIZADO', 'RESCINDIDO', 'CANCELADO'].includes(contrato.estado);
  const pendientes = revisarPendientesCierre(contrato);
  const modalidadActual = inferirModalidadContractual(contrato);

  const guardar = async (c: ContratoFormalizacion) => {
    setError(null);
    await onSaveContrato(c);
  };

  const aplicarModalidad = async () => {
    const r = aplicarContratoEspecial(contrato, {
      modalidad: modalidadSel,
      motivoTemporalidad: motivoTemp || undefined,
      finalidadUso: finalidad || undefined,
      fechaFin: fechaFinEsp || undefined,
      duracionMeses: duracionMeses ? Number(duracionMeses) : undefined,
    }, usuarioNombre);
    if (!r.ok) return setError(r.error);
    await guardar(r.valor);
  };

  const anadirAnexo = async () => {
    const r = crearAnexo(contrato, { tipo: 'MODIFICACION_CONTRACTUAL', titulo: anexoTitulo, contenido: anexoContenido }, usuarioNombre, currentUser?.id);
    if (!r.ok) return setError(r.error);
    setAnexoTitulo('');
    setAnexoContenido('');
    await guardar(r.valor.contrato);
  };

  const confirmar = async (anexoId: string) => {
    const r = confirmarAnexo(contrato, anexoId, usuarioNombre);
    if (!r.ok) return setError(r.error);
    await guardar(r.valor);
  };

  const versionar = async (anexoId: string) => {
    const original = (contrato.anexos || []).find((a) => a.id === anexoId);
    const r = crearNuevaVersionAnexo(contrato, anexoId, {
      tipo: original?.tipo || 'OTRO',
      titulo: original ? `${original.titulo} (revisión)` : 'Revisión',
      contenido: original?.contenido || '',
    }, usuarioNombre, currentUser?.id);
    if (!r.ok) return setError(r.error);
    await guardar(r.valor.contrato);
  };

  const finalizar = async () => {
    const habitacion = contrato.habitacionId
      ? (habitaciones || []).find((h) => h.id === contrato.habitacionId)
      : undefined;
    const r = finalizarContratoConHabitacion(contrato, habitacion, {
      tipo: tipoFin,
      fechaEfectiva,
      motivo: motivoFin || undefined,
      usuarioNombre,
      usuarioId: currentUser?.id,
    });
    if (!r.ok) return setError(r.error);
    if (r.valor.habitacion && onUpdateHabitacion) {
      await onUpdateHabitacion(r.valor.habitacion);
    }
    await guardar(r.valor.contrato);
  };

  const generarFiniquito = async () => {
    const r = crearFiniquito(contrato, usuarioNombre);
    if (!r.ok) return setError(r.error);
    await guardar(r.valor);
  };

  const liquidarConcepto = async (conceptoId: string) => {
    const conc = contrato.finiquito?.conceptos.find((c) => c.id === conceptoId);
    if (!conc) return;
    const r = registrarMovimientoFiniquito(contrato, conceptoId, conc.importePendiente);
    if (!r.ok) return setError(r.error);
    await guardar(r.valor);
  };

  const cerrar = async () => {
    const r = cerrarFiniquito(contrato, usuarioNombre);
    if (!r.ok) return setError(r.error);
    await guardar(r.valor);
  };

  return (
    <div className="mt-3 bg-slate-50 rounded-2xl border border-slate-200 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ciclo contractual</span>
        <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
          {MODALIDAD_CONTRACTUAL_LABELS[modalidadActual]}
          {contrato.version && contrato.version > 1 ? ` · v${contrato.version}` : ''}
        </span>
        {contrato.contratoOrigenId && <span className="text-[10px] text-slate-400">↺ deriva de otro contrato</span>}
        {contrato.contratoDerivadoId && <span className="text-[10px] text-slate-400">→ tiene contrato derivado</span>}
      </div>

      {error && <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</div>}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {([
          ['modalidad', 'Modalidad', FileCheck2],
          ['anexos', `Anexos (${(contrato.anexos || []).length})`, FilePlus2],
          ['finalizacion', 'Finalización', Flag],
          ['finiquito', 'Finiquito', ReceiptText],
        ] as [VistaCiclo, string, React.ComponentType<{ className?: string }>][]).map(([id, label, Icon]) => (
          <button
            key={id as string}
            onClick={() => setVista(vista === id ? null : id)}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors inline-flex items-center gap-1 ${
              vista === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            <Icon className="w-3 h-3" />
            {label}
            {vista === id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        ))}
      </div>

      {/* MODALIDAD */}
      {vista === 'modalidad' && (
        <div className="space-y-2 bg-white rounded-xl border border-slate-200 p-3">
          <label className="text-[11px] font-bold text-slate-600 block">Modalidad contractual</label>
          <select
            value={modalidadSel}
            onChange={(e) => setModalidadSel(e.target.value)}
            disabled={esTerminal || readOnly}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
          >
            {MODALIDADES_CONTRACTUALES.map((m) => (
              <option key={m} value={m}>{MODALIDAD_CONTRACTUAL_LABELS[m as ModalidadContractual]}</option>
            ))}
          </select>
          {modalidadSel === 'TEMPORADA' && (
            <>
              <input
                value={motivoTemp}
                onChange={(e) => setMotivoTemp(e.target.value)}
                placeholder="Motivo/causa de la temporalidad (obligatorio)"
                disabled={esTerminal || readOnly}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={fechaFinEsp}
                  onChange={(e) => setFechaFinEsp(e.target.value)}
                  disabled={esTerminal || readOnly}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
                <input
                  value={duracionMeses}
                  onChange={(e) => setDuracionMeses(e.target.value)}
                  placeholder="Meses"
                  disabled={esTerminal || readOnly}
                  className="w-20 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>
            </>
          )}
          {modalidadSel === 'LOCAL_USO_DISTINTO' && (
            <input
              value={finalidad}
              onChange={(e) => setFinalidad(e.target.value)}
              placeholder="Finalidad/uso del local (obligatorio)"
              disabled={esTerminal || readOnly}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
          )}
          {!esTerminal && !readOnly && (
            <button onClick={aplicarModalidad} className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-[11px] font-bold">
              Aplicar modalidad
            </button>
          )}
        </div>
      )}

      {/* ANEXOS */}
      {vista === 'anexos' && (
        <div className="space-y-2 bg-white rounded-xl border border-slate-200 p-3">
          {(contrato.anexos || []).length === 0 && (
            <p className="text-[11px] text-slate-400">Sin anexos. Los anexos confirmados no se modifican: se versionan.</p>
          )}
          {(contrato.anexos || []).map((a) => (
            <div key={a.id} className="p-2 rounded-lg border border-slate-100 bg-slate-50">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-700">
                  {a.titulo} <span className="text-slate-400">v{a.version}</span>
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                  a.estado === 'CONFIRMADO' ? 'bg-emerald-100 text-emerald-700'
                  : a.estado === 'SUPERSEDIDO' ? 'bg-slate-200 text-slate-500'
                  : 'bg-amber-100 text-amber-700'
                }`}>{a.estado}</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 whitespace-pre-wrap">{a.contenido}</p>
              {!readOnly && (
                <div className="flex gap-2 mt-1.5">
                  {a.estado === 'BORRADOR' && (
                    <button onClick={() => confirmar(a.id)} className="text-[10px] font-bold text-emerald-600">Confirmar</button>
                  )}
                  {a.estado === 'CONFIRMADO' && !esTerminal && (
                    <button onClick={() => versionar(a.id)} className="text-[10px] font-bold text-indigo-600">Nueva versión</button>
                  )}
                </div>
              )}
            </div>
          ))}
          {!esTerminal && !readOnly && (
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <input
                value={anexoTitulo}
                onChange={(e) => setAnexoTitulo(e.target.value)}
                placeholder="Título del anexo"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
              <textarea
                value={anexoContenido}
                onChange={(e) => setAnexoContenido(e.target.value)}
                placeholder="Contenido / condiciones del anexo"
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
              <button onClick={anadirAnexo} className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-[11px] font-bold">
                Añadir anexo
              </button>
            </div>
          )}
        </div>
      )}

      {/* FINALIZACIÓN */}
      {vista === 'finalizacion' && (
        <div className="space-y-2 bg-white rounded-xl border border-slate-200 p-3">
          {esTerminal ? (
            <div className="text-[11px] text-slate-600 space-y-1">
              <p><strong>Estado terminal:</strong> {contrato.estado} · Fecha efectiva: {contrato.finalizacion?.fechaEfectiva || contrato.fechaFinContrato}</p>
              {contrato.finalizacion?.motivo && <p><strong>Motivo:</strong> {contrato.finalizacion.motivo}</p>}
              {contrato.finalizacion && <p><strong>Ejecutado por:</strong> {contrato.finalizacion.ejecutadoPor}</p>}
              <p className="text-slate-400">Un contrato terminado no puede volver a estado activo.</p>
            </div>
          ) : readOnly ? (
            <p className="text-[11px] text-slate-400">Sin permiso para finalizar este contrato.</p>
          ) : (
            <>
              <div className="text-[11px] text-slate-500">
                Pendientes antes de cerrar: {pendientes.periodosRetrasados} retrasado/s ({formatEuro(pendientes.importeRetrasado)}) ·
                {' '}{pendientes.periodosPendientes} pendiente/s ({formatEuro(pendientes.importePendiente)})
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={tipoFin} onChange={(e) => setTipoFin(e.target.value as TipoFinalizacionContrato)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <option value="FINALIZACION_NATURAL">Finalización natural</option>
                  <option value="MUTUO_ACUERDO">Mutuo acuerdo</option>
                  <option value="RESCISION_ANTICIPADA">Rescisión anticipada</option>
                  <option value="CANCELACION_EXPEDIENTE">Cancelar expediente</option>
                </select>
                <input type="date" value={fechaEfectiva} onChange={(e) => setFechaEfectiva(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
              </div>
              <input
                value={motivoFin}
                onChange={(e) => setMotivoFin(e.target.value)}
                placeholder="Motivo (opcional)"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
              <button
                onClick={async () => {
                  if (confirm('¿Confirmar la finalización/rescisión? El contrato pasará a estado terminal y se conservará en el histórico.')) {
                    await finalizar();
                  }
                }}
                className="px-3 py-1.5 bg-rose-600 text-white rounded-xl text-[11px] font-bold"
              >
                Finalizar / Rescindir contrato
              </button>
            </>
          )}
        </div>
      )}

      {/* FINIQUITO */}
      {vista === 'finiquito' && (
        <div className="space-y-2 bg-white rounded-xl border border-slate-200 p-3">
          {!contrato.finiquito ? (
            esTerminal && !readOnly ? (
              <>
                <p className="text-[11px] text-slate-500">
                  El contrato está cerrado. Genera el finiquito para liquidar fianza, rentas pendientes y daños.
                </p>
                <button onClick={generarFiniquito} className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-[11px] font-bold">
                  Generar finiquito
                </button>
              </>
            ) : (
              <p className="text-[11px] text-slate-400">El finiquito se genera una vez finalizado/rescindido el contrato.</p>
            )
          ) : (
            <>
              {contrato.finiquito.conceptos.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50">
                  <div>
                    <span className="text-[11px] font-bold text-slate-700">{c.concepto}</span>
                    <span className="block text-[9px] text-slate-400">
                      {c.favoreceA === 'PROPIETARIO' ? 'A favor del propietario' : 'A favor del inquilino'} ·
                      reclamado {formatEuro(c.importeReclamado)} · pendiente {formatEuro(c.importePendiente)}
                      {c.importePagado > 0 && ` · pagado ${formatEuro(c.importePagado)}`}
                      {c.importeDevuelto > 0 && ` · devuelto ${formatEuro(c.importeDevuelto)}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${c.estado === 'LIQUIDADO' ? 'bg-emerald-100 text-emerald-700' : c.estado === 'PARCIAL' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>{c.estado}</span>
                    {c.estado !== 'LIQUIDADO' && contrato.finiquito!.estado === 'ABIERTO' && !readOnly && (
                      <button onClick={() => liquidarConcepto(c.id)} className="text-[10px] font-bold text-indigo-600">Liquidar</button>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-600">
                  Saldo final:{' '}
                  <span className={contrato.finiquito.saldoFinal > 0 ? 'text-rose-600' : contrato.finiquito.saldoFinal < 0 ? 'text-emerald-600' : 'text-slate-600'}>
                    {formatEuro(contrato.finiquito.saldoFinal)}
                  </span>
                  <span className="text-slate-400 font-normal">
                    {' '}{contrato.finiquito.saldoFinal > 0 ? '(cobra el propietario)' : contrato.finiquito.saldoFinal < 0 ? '(devuelve el propietario)' : '(cerrado a cero)'}
                  </span>
                </span>
                {contrato.finiquito.estado === 'ABIERTO' && !readOnly && (
                  <button onClick={cerrar} className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[11px] font-bold">
                    Cerrar finiquito
                  </button>
                )}
                {contrato.finiquito.estado === 'CERRADO' && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">CERRADO por {contrato.finiquito.cerradoPor}</span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
