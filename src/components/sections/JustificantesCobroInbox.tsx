import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Download, FileCheck2, History, LoaderCircle, RefreshCw, X } from 'lucide-react';
import type { ContratoFormalizacion, EventoAuditoriaJustificanteCobro, RegistroJustificanteCobro } from '../../types';
import {
  consultarJustificantesCobro,
  decidirJustificanteCobro,
  descargarArchivoJustificanteCobro,
  ErrorApiJustificantesCobro,
  nuevaClaveIdempotencia,
  obtenerAuditoriaJustificanteCobro,
} from '../../lib/justificantesCobroApi';

interface Props {
  contratos: ContratoFormalizacion[];
  puedeEditarContrato?: (contrato: ContratoFormalizacion) => boolean;
}

type Filtro = 'PENDIENTE_REVISION' | 'TODOS';
type AccionActiva = { id: string; accion: 'ACEPTAR' | 'RECHAZAR' | 'RECTIFICAR' } | null;

const ETIQUETAS_ESTADO: Record<RegistroJustificanteCobro['estado'], string> = {
  SUBIENDO: 'Subida en curso',
  ERROR_SUBIDA: 'Error de subida',
  PENDIENTE_REVISION: 'Pendiente de revisión',
  ACEPTADO: 'Aceptado documentalmente',
  RECHAZADO: 'Rechazado',
};

const METODOS: Record<RegistroJustificanteCobro['metodoPagoDeclarado'], string> = {
  transferencia: 'Transferencia',
  domiciliacion: 'Domiciliación',
  bizum: 'Bizum',
  efectivo: 'Efectivo',
  otro: 'Otro',
};

function fechaLegible(valor?: string): string {
  if (!valor) return '—';
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? valor : d.toLocaleDateString('es-ES');
}

function importeLegible(valor: number): string {
  return `${Number(valor || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function claseEstado(estado: RegistroJustificanteCobro['estado']): string {
  if (estado === 'PENDIENTE_REVISION' || estado === 'SUBIENDO') return 'bg-amber-100 text-amber-800';
  if (estado === 'ACEPTADO') return 'bg-emerald-100 text-emerald-800';
  if (estado === 'RECHAZADO' || estado === 'ERROR_SUBIDA') return 'bg-rose-100 text-rose-800';
  return 'bg-slate-100 text-slate-700';
}

export const JustificantesCobroInbox: React.FC<Props> = ({ contratos, puedeEditarContrato }) => {
  const contratoIds = useMemo(() => [...new Set(contratos.map((c) => c.id).filter(Boolean))], [contratos]);
  const idsKey = contratoIds.join('|');
  const [items, setItems] = useState<RegistroJustificanteCobro[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('PENDIENTE_REVISION');
  const [cargando, setCargando] = useState(false);
  const [cargandoArchivo, setCargandoArchivo] = useState('');
  const [error, setError] = useState('');
  const [hayMas, setHayMas] = useState(false);
  const [offset, setOffset] = useState(0);
  const [accionActiva, setAccionActiva] = useState<AccionActiva>(null);
  const [motivo, setMotivo] = useState('');
  const [estadoCorregido, setEstadoCorregido] = useState<'ACEPTADO' | 'RECHAZADO'>('RECHAZADO');
  const [ocupado, setOcupado] = useState('');
  const [auditorias, setAuditorias] = useState<Record<string, EventoAuditoriaJustificanteCobro[]>>({});
  const [auditoriaAbierta, setAuditoriaAbierta] = useState('');
  const [cargandoAuditoria, setCargandoAuditoria] = useState('');
  const clavesOperacion = useRef(new Map<string, string>());

  const cargar = useCallback(async (nuevoOffset = 0, anexar = false) => {
    if (contratoIds.length === 0) {
      setItems([]);
      setHayMas(false);
      setError('');
      return;
    }
    setCargando(true);
    try {
      const resultado = await consultarJustificantesCobro(contratoIds, nuevoOffset);
      setItems((prev) => anexar ? [...prev, ...resultado.items] : resultado.items);
      setHayMas(resultado.hayMas);
      setOffset(nuevoOffset);
      setError('');
    } catch (err) {
      setError(err instanceof ErrorApiJustificantesCobro ? err.message : 'No se pudo cargar la bandeja de justificantes.');
    } finally {
      setCargando(false);
    }
  }, [idsKey]); // idsKey serializa el ámbito visible; no se usa como autorización.

  useEffect(() => { void cargar(0, false); }, [cargar]);

  const contratoPorId = useMemo(() => new Map(contratos.map((c) => [c.id, c])), [contratos]);
  const visibles = useMemo(
    () => items.filter((item) => filtro === 'TODOS' || item.estado === 'PENDIENTE_REVISION'),
    [items, filtro],
  );

  const iniciarDecision = (item: RegistroJustificanteCobro, accion: AccionActiva['accion']) => {
    setAccionActiva({ id: item.id, accion });
    setMotivo('');
    setEstadoCorregido(item.estado === 'ACEPTADO' ? 'RECHAZADO' : 'ACEPTADO');
  };

  const confirmarDecision = async (item: RegistroJustificanteCobro) => {
    if (!accionActiva || accionActiva.id !== item.id) return;
    if ((accionActiva.accion === 'RECHAZAR' || accionActiva.accion === 'RECTIFICAR') && motivo.trim().length < 10) {
      setError('Escribe un motivo de al menos 10 caracteres para rechazar o rectificar.');
      return;
    }
    const firmaAccion = `${item.id}|${accionActiva.accion}|${estadoCorregido}|${motivo.trim()}`;
    const clave = clavesOperacion.current.get(firmaAccion) || nuevaClaveIdempotencia();
    clavesOperacion.current.set(firmaAccion, clave);
    setOcupado(item.id);
    setError('');
    try {
      await decidirJustificanteCobro({
        justificanteId: item.id,
        accion: accionActiva.accion,
        claveIdempotencia: clave,
        ...(accionActiva.accion === 'RECTIFICAR' ? { estadoCorregido } : {}),
        ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
      });
      clavesOperacion.current.delete(firmaAccion);
      setAccionActiva(null);
      setMotivo('');
      await cargar(offset, false);
    } catch (err) {
      setError(err instanceof ErrorApiJustificantesCobro ? err.message : 'No se pudo completar la decisión. Reintenta la misma acción.');
    } finally {
      setOcupado('');
    }
  };

  const descargar = async (item: RegistroJustificanteCobro, eventoId?: string, nombre?: string) => {
    const clave = `${item.id}:${eventoId || 'actual'}`;
    setCargandoArchivo(clave);
    setError('');
    try {
      await descargarArchivoJustificanteCobro(item.id, nombre || item.nombreArchivo, eventoId);
    } catch (err) {
      setError(err instanceof ErrorApiJustificantesCobro ? err.message : 'No se pudo descargar el documento autorizado.');
    } finally {
      setCargandoArchivo('');
    }
  };

  const alternarAuditoria = async (item: RegistroJustificanteCobro) => {
    if (auditoriaAbierta === item.id) {
      setAuditoriaAbierta('');
      return;
    }
    setAuditoriaAbierta(item.id);
    if (auditorias[item.id]) return;
    setCargandoAuditoria(item.id);
    try {
      const resultado = await obtenerAuditoriaJustificanteCobro(item.id);
      setAuditorias((prev) => ({ ...prev, [item.id]: resultado.eventos }));
    } catch (err) {
      setError(err instanceof ErrorApiJustificantesCobro ? err.message : 'No se pudo leer la auditoría.');
      setAuditoriaAbierta('');
    } finally {
      setCargandoAuditoria('');
    }
  };

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm" aria-label="Revisión de justificantes de cobro">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-indigo-950"><FileCheck2 className="h-4 w-4" />Justificantes aportados por inquilinos</h2>
          <p className="mt-1 max-w-3xl text-[11px] leading-4 text-indigo-900">
            La aceptación solo valida el documento. No modifica el cobro, no genera ingresos y no marca dinero como recibido ni conciliado; esas acciones requieren su flujo y evidencia propios.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} className="rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-xs font-semibold">
            <option value="PENDIENTE_REVISION">Pendientes de revisión</option>
            <option value="TODOS">Todos los estados</option>
          </select>
          <button type="button" onClick={() => void cargar(0, false)} disabled={cargando} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-900 disabled:opacity-50" aria-label="Actualizar justificantes">
            <RefreshCw className={`h-3.5 w-3.5 ${cargando ? 'animate-spin' : ''}`} />Actualizar
          </button>
        </div>
      </div>

      {error && <div role="alert" className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-800">{error}</div>}
      {cargando && items.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-500">Cargando registros…</div>}
      {!cargando && visibles.length === 0 && (
        <div className="px-4 py-6 text-center text-xs text-slate-500">
          {error ? 'No se pudo verificar la bandeja.' : filtro === 'PENDIENTE_REVISION' ? 'No hay justificantes pendientes en los contratos accesibles.' : 'No hay justificantes registrados.'}
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {visibles.map((item) => {
          const contrato = contratoPorId.get(item.contratoId);
          if (!contrato) return null;
          const cobro = contrato.registroCobros?.find((c) => c.id === item.cobroPeriodoId);
          const puedeEditar = puedeEditarContrato?.(contrato) ?? true;
          const activo = accionActiva?.id === item.id;
          const estadosFinales = item.estado === 'ACEPTADO' || item.estado === 'RECHAZADO';
          return (
            <article key={item.id} className="px-4 py-4" data-testid={`justificante-review-${item.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-extrabold text-slate-900">{cobro?.nombreMes || cobro?.periodoMesAnio || item.cobroPeriodoId}</h3>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${claseEstado(item.estado)}`}>{ETIQUETAS_ESTADO[item.estado]}</span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-600">{contrato.inmuebleDireccion || item.inmuebleId} · Contrato {contrato.id}</p>
                  <div className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-700 sm:grid-cols-2">
                    <p><span className="font-semibold">Importe declarado:</span> {importeLegible(item.importeDeclarado)}</p>
                    <p><span className="font-semibold">Fecha declarada:</span> {fechaLegible(item.fechaPagoDeclarada)}</p>
                    <p><span className="font-semibold">Método declarado:</span> {METODOS[item.metodoPagoDeclarado]}</p>
                    <p className="truncate"><span className="font-semibold">Archivo:</span> {item.nombreArchivo} ({Math.ceil(item.tamanoBytes / 1024)} KiB)</p>
                    <p><span className="font-semibold">Presentado:</span> {fechaLegible(item.subidoEn)}</p>
                    {item.revisadoEn && <p><span className="font-semibold">Última revisión:</span> {fechaLegible(item.revisadoEn)}</p>}
                  </div>
                  {item.motivoRevision && <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-700"><strong>Motivo:</strong> {item.motivoRevision}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void descargar(item)} disabled={cargandoArchivo === `${item.id}:actual`} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-200 disabled:opacity-50">
                    {cargandoArchivo === `${item.id}:actual` ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Descargar
                  </button>
                  <button type="button" onClick={() => void alternarAuditoria(item)} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-200">
                    <History className="h-3.5 w-3.5" />Auditoría {auditoriaAbierta === item.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {item.estado === 'PENDIENTE_REVISION' && puedeEditar && !activo && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => iniciarDecision(item, 'ACEPTAR')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"><Check className="h-3.5 w-3.5" />Aceptar justificante</button>
                  <button type="button" onClick={() => iniciarDecision(item, 'RECHAZAR')} className="inline-flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800"><X className="h-3.5 w-3.5" />Rechazar con motivo</button>
                </div>
              )}
              {estadosFinales && puedeEditar && !activo && (
                <button type="button" onClick={() => iniciarDecision(item, 'RECTIFICAR')} className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100">Rectificar decisión con motivo</button>
              )}
              {!puedeEditar && item.estado === 'PENDIENTE_REVISION' && (
                <p className="mt-3 text-[11px] text-slate-500">Tu ámbito permite consultar, pero no decidir.</p>
              )}

              {activo && accionActiva && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {accionActiva.accion === 'ACEPTAR' ? (
                    <>
                      <p className="text-xs font-bold text-slate-800">¿Aceptar el documento presentado?</p>
                      <p className="mt-1 text-[11px] text-slate-600">Esta acción solo cambia el estado documental y añade auditoría; no registra el cobro ni verifica un abono bancario.</p>
                    </>
                  ) : accionActiva.accion === 'RECHAZAR' ? (
                    <label className="block text-xs font-bold text-slate-800">Motivo del rechazo (mínimo 10 caracteres)
                      <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-normal" />
                    </label>
                  ) : (
                    <>
                      <label className="block text-xs font-bold text-slate-800">Nuevo estado documental
                        <select value={estadoCorregido} onChange={(e) => setEstadoCorregido(e.target.value as 'ACEPTADO' | 'RECHAZADO')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-normal">
                          <option value="ACEPTADO">Aceptado</option>
                          <option value="RECHAZADO">Rechazado</option>
                        </select>
                      </label>
                      <label className="mt-2 block text-xs font-bold text-slate-800">Motivo de la rectificación (mínimo 10 caracteres)
                        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-normal" />
                      </label>
                      <p className="mt-1 text-[11px] text-slate-600">La decisión anterior y el archivo original no se borran.</p>
                    </>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => void confirmarDecision(item)} disabled={ocupado === item.id || ((accionActiva.accion === 'RECHAZAR' || accionActiva.accion === 'RECTIFICAR') && motivo.trim().length < 10)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                      {ocupado === item.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      {accionActiva.accion === 'ACEPTAR' ? 'Confirmar aceptación' : accionActiva.accion === 'RECHAZAR' ? 'Confirmar rechazo' : 'Guardar rectificación'}
                    </button>
                    <button type="button" onClick={() => setAccionActiva(null)} disabled={ocupado === item.id} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Cancelar</button>
                  </div>
                </div>
              )}

              {auditoriaAbierta === item.id && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <h4 className="text-xs font-extrabold text-slate-800">Historial append-only</h4>
                  {cargandoAuditoria === item.id ? <p className="mt-2 text-xs text-slate-500">Cargando auditoría…</p> : (
                    <ol className="mt-2 space-y-2">
                      {(auditorias[item.id] || []).map((evento) => (
                        <li key={evento.id} className="flex flex-wrap items-start justify-between gap-2 border-l-2 border-indigo-300 pl-2.5 text-[11px] text-slate-700">
                          <div>
                            <p className="font-bold">{evento.accion.replace(/_/g, ' ')} · {ETIQUETAS_ESTADO[evento.estadoNuevo]}</p>
                            <p>{fechaLegible(evento.creadoEn)} · {evento.actor} · cuenta {evento.actorUsuarioId}</p>
                            {evento.motivo && <p className="mt-0.5">Motivo: {evento.motivo}</p>}
                            {evento.nombreArchivo && <p className="mt-0.5">{evento.nombreArchivo}</p>}
                          </div>
                          {evento.archivoDisponible && (
                            <button type="button" onClick={() => void descargar(item, evento.id, evento.nombreArchivo)} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-bold text-indigo-800">
                              <Download className="h-3 w-3" />Archivo de esta acción
                            </button>
                          )}
                        </li>
                      ))}
                      {(auditorias[item.id] || []).length === 0 && <li className="text-[11px] text-slate-500">No hay eventos de auditoría disponibles.</li>}
                    </ol>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {hayMas && (
        <div className="border-t border-slate-100 px-4 py-3 text-center">
          <button type="button" onClick={() => void cargar(offset + 100, true)} disabled={cargando} className="text-xs font-bold text-indigo-800 underline disabled:opacity-50">
            {cargando ? 'Cargando…' : 'Cargar más justificantes'}
          </button>
        </div>
      )}
    </section>
  );
};
