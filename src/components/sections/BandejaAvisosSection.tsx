/**
 * FASE A (2026-10-16) — BANDEJA DE AVISOS (sección `avisos`).
 * ==========================================================
 * Muestra las notificaciones emitidas por el ERP con su **estado REAL de
 * entrega**: enviada (con proveedor e id externo), pendiente/programada,
 * fallida (con causa) o cancelada. Regla de la fase: aquí nunca aparece
 * «enviada» si el transporte no la entregó.
 *
 * Solo lectura: no cambia cobros, no reenvía y no oculta fallos. El propietario
 * ve las de su cartera; el staff, el listado general.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, Clock, Inbox, Mail, RefreshCw, Send, XCircle } from 'lucide-react';
import type { UsuarioApp } from '../../types';
import type { EstadoNotificacion } from '../../types/notificaciones';
import { listarAvisosBandeja, resumirAvisos, type AvisoBandeja } from '../../lib/bandejaAvisos';

interface BandejaAvisosSectionProps {
  currentUser: UsuarioApp | null;
}

const ETIQUETA_ESTADO: Record<EstadoNotificacion, { texto: string; clases: string; icono: React.ReactNode }> = {
  ENVIADA: { texto: 'Enviada', clases: 'bg-emerald-50 text-emerald-700 border-emerald-200', icono: <CheckCircle2 className="w-3.5 h-3.5" /> },
  PENDIENTE: { texto: 'Pendiente de envío', clases: 'bg-amber-50 text-amber-700 border-amber-200', icono: <Clock className="w-3.5 h-3.5" /> },
  PROGRAMADA: { texto: 'Programada', clases: 'bg-blue-50 text-blue-700 border-blue-200', icono: <Clock className="w-3.5 h-3.5" /> },
  ENVIANDO: { texto: 'Enviando', clases: 'bg-indigo-50 text-indigo-700 border-indigo-200', icono: <Send className="w-3.5 h-3.5" /> },
  FALLIDA: { texto: 'No entregada', clases: 'bg-rose-50 text-rose-700 border-rose-200', icono: <XCircle className="w-3.5 h-3.5" /> },
  CANCELADA: { texto: 'Cancelada', clases: 'bg-slate-100 text-slate-600 border-slate-200', icono: <XCircle className="w-3.5 h-3.5" /> },
};

const FILTROS: Array<{ id: 'TODAS' | EstadoNotificacion; texto: string }> = [
  { id: 'TODAS', texto: 'Todas' },
  { id: 'ENVIADA', texto: 'Enviadas' },
  { id: 'FALLIDA', texto: 'No entregadas' },
  { id: 'PENDIENTE', texto: 'Pendientes' },
  { id: 'PROGRAMADA', texto: 'Programadas' },
];

function formatearFecha(iso?: string): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const BandejaAvisosSection: React.FC<BandejaAvisosSectionProps> = ({ currentUser }) => {
  const [avisos, setAvisos] = useState<AvisoBandeja[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'TODAS' | EstadoNotificacion>('TODAS');

  const esStaff = currentUser?.tipoPerfil === 'ADMINISTRADOR' || currentUser?.tipoPerfil === 'PROFESIONAL';
  const propietarioId = currentUser?.propietarioId;

  const cargar = useCallback(async () => {
    if (!currentUser) return;
    setCargando(true);
    setError(null);
    try {
      const visibles = await listarAvisosBandeja({ esStaff, propietarioId });
      setAvisos(visibles);
    } catch (err) {
      setAvisos([]);
      setError(err instanceof Error ? err.message : 'No se han podido leer los avisos.');
    } finally {
      setCargando(false);
    }
  }, [currentUser, esStaff, propietarioId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resumen = useMemo(() => resumirAvisos(avisos), [avisos]);
  const visibles = useMemo(
    () => (filtro === 'TODAS' ? avisos : avisos.filter((a) => a.estado === filtro)),
    [avisos, filtro],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold flex items-center gap-2 text-slate-900">
            <BellRing className="w-5 h-5 text-blue-700" /> Bandeja de avisos
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Estado <strong>real</strong> de entrega de cada aviso: nunca se marca «enviada» una notificación que no haya salido del sistema.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { texto: 'Total', valor: resumen.TOTAL, clases: 'text-slate-900' },
          { texto: 'Entregadas', valor: resumen.ENVIADA, clases: 'text-emerald-700' },
          { texto: 'No entregadas', valor: resumen.FALLIDA, clases: 'text-rose-700' },
          { texto: 'Pendientes/programadas', valor: resumen.PENDIENTE + resumen.PROGRAMADA, clases: 'text-amber-700' },
        ].map((tarjeta) => (
          <div key={tarjeta.texto} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className={`text-xl font-extrabold ${tarjeta.clases}`}>{tarjeta.valor}</div>
            <div className="text-[11px] font-medium text-slate-500">{tarjeta.texto}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              filtro === f.id ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {f.texto}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <span>No se han podido leer los avisos: {error}</span>
        </div>
      )}

      {cargando && !avisos.length ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">Cargando avisos…</div>
      ) : visibles.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
          <Inbox className="w-6 h-6 text-slate-400" />
          {avisos.length === 0 ? 'Todavía no hay avisos emitidos.' : 'No hay avisos con este filtro.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Fecha</th>
                <th className="text-left px-3 py-2 font-semibold">Aviso</th>
                <th className="text-left px-3 py-2 font-semibold">Destinatario</th>
                <th className="text-left px-3 py-2 font-semibold">Canal</th>
                <th className="text-left px-3 py-2 font-semibold">Estado real</th>
                <th className="text-left px-3 py-2 font-semibold">Trazabilidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((aviso) => {
                const etiqueta = ETIQUETA_ESTADO[aviso.estado];
                return (
                  <tr key={aviso.id} className="align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatearFecha(aviso.fechaCreacion)}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-800">{aviso.asunto || aviso.tipo}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{aviso.tipo}</div>
                      {aviso.cuerpo && (
                        <details className="mt-1 max-w-[420px]">
                          <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-700 select-none">
                            Ver mensaje
                          </summary>
                          <div className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600 bg-slate-50 border border-slate-100 rounded p-2">
                            {aviso.cuerpo}
                          </div>
                        </details>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-slate-700 flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-400" /> {aviso.destinatarioEmail || '—'}
                      </div>
                      {aviso.destinatarioNombre && <div className="text-[10px] text-slate-400">{aviso.destinatarioNombre}</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{aviso.canal}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${etiqueta.clases}`}>
                        {etiqueta.icono} {etiqueta.texto}
                      </span>
                      {aviso.estado === 'FALLIDA' && aviso.error && (
                        <div className="mt-1 text-[10px] text-rose-600 max-w-[220px]">{aviso.error}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-slate-500 font-mono">
                      {aviso.intentos > 0 ? `intentos: ${aviso.intentos}` : 'sin intentos'}
                      {aviso.provider ? ` · ${aviso.provider}` : ''}
                      {aviso.externalId ? (
                        <>
                          <br />
                          id: {aviso.externalId}
                        </>
                      ) : null}
                      {aviso.enviadoEn ? (
                        <>
                          <br />
                          enviado: {formatearFecha(aviso.enviadoEn)}
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        Los avisos se generan en el servidor (dispatcher canónico) y el reloj diario evalúa cobros vencidos y reintentos.
        Esta bandeja es de solo lectura: el registro de un cobro sigue siendo una acción explícita en Cobros.
      </p>
    </div>
  );
};
