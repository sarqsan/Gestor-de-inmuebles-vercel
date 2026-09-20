/**
 * GAP 8 — PANEL DE FACTURA ELECTRÓNICA B2B (RD 238/2026) dentro de la factura.
 * ---------------------------------------------------------------------------
 * Acciones: validar, generar representación, ver formato, descargar, preparar
 * envío, registrar estados del intercambio, ver historial, errores, pago y
 * reintentar.
 *
 * TRANSPARENCIA: la preparación local NUNCA se muestra como envío real. El
 * envío efectivo requiere plataforma de intercambio habilitada (PENDIENTE).
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { UsuarioApp } from '../../types';
import type { Factura } from '../../types/facturacion';
import type { EstadoFacturaB2B, FacturaElectronicaB2B, FormatoFacturaElectronica } from '../../types/facturaElectronicaB2B';
import {
  subscribeFacturasElectronicasB2B,
  saveFacturaElectronicaB2BFirestore,
} from '../../lib/firebase';
import {
  generarConEvento,
  obtenerDocumentoB2B,
  prepararEnvioB2B,
  registrarEstadoIntercambioB2B,
  reintentarEnvioB2B,
  validarParaIntercambioB2B,
} from '../../utils/facturaElectronicaB2BService';
import {
  AdaptadorPreparacionB2B,
  adaptadoresDisponiblesB2B,
} from '../../utils/intercambioB2B/adaptadoresB2B';
import { estadoFormatosB2B } from '../../utils/generadores/indexB2B';
import {
  FileCode2,
  Send,
  Download,
  RefreshCw,
  History,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Banknote,
} from 'lucide-react';

const ETIQUETAS_ESTADO_B2B: Record<EstadoFacturaB2B, string> = {
  BORRADOR: 'Borrador',
  GENERADA: 'Generada',
  VALIDADA: 'Validada',
  DISPUESTA_PARA_ENVIO: 'Dispuesta para envío',
  ENVIADA: 'Enviada',
  RECIBIDA: 'Recibida',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  PAGADA: 'Pagada',
  PARCIALMENTE_PAGADA: 'Parcialmente pagada',
  ANULADA: 'Anulada',
  RECTIFICADA: 'Rectificada',
};

const COLOR_ESTADO_B2B: Record<EstadoFacturaB2B, string> = {
  BORRADOR: 'bg-slate-100 text-slate-600',
  GENERADA: 'bg-blue-100 text-blue-700',
  VALIDADA: 'bg-indigo-100 text-indigo-700',
  DISPUESTA_PARA_ENVIO: 'bg-amber-100 text-amber-700',
  ENVIADA: 'bg-sky-100 text-sky-700',
  RECIBIDA: 'bg-cyan-100 text-cyan-700',
  ACEPTADA: 'bg-emerald-100 text-emerald-700',
  RECHAZADA: 'bg-rose-100 text-rose-700',
  PAGADA: 'bg-green-100 text-green-700',
  PARCIALMENTE_PAGADA: 'bg-lime-100 text-lime-700',
  ANULADA: 'bg-red-100 text-red-700',
  RECTIFICADA: 'bg-orange-100 text-orange-700',
};

/** Estados que el usuario puede registrar manualmente (avances notificados por plataforma). */
const ESTADOS_REGISTRABLES: Partial<Record<EstadoFacturaB2B, EstadoFacturaB2B[]>> = {
  DISPUESTA_PARA_ENVIO: ['ENVIADA'],
  ENVIADA: ['RECIBIDA', 'ACEPTADA', 'RECHAZADA'],
  RECIBIDA: ['ACEPTADA', 'RECHAZADA'],
  ACEPTADA: ['PAGADA', 'PARCIALMENTE_PAGADA'],
  RECHAZADA: ['DISPUESTA_PARA_ENVIO'],
  PARCIALMENTE_PAGADA: ['PAGADA'],
};

export const FacturaElectronicaB2BPanel: React.FC<{
  factura: Factura;
  currentUser: UsuarioApp | null;
}> = ({ factura, currentUser }) => {
  const [todas, setTodas] = useState<FacturaElectronicaB2B[]>([]);
  const [formato, setFormato] = useState<FormatoFacturaElectronica>('CII');
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error' | 'aviso'; texto: string } | null>(null);
  const [validacionAbierta, setValidacionAbierta] = useState(false);
  const [historialDe, setHistorialDe] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    const unsub = subscribeFacturasElectronicasB2B(setTodas);
    return () => unsub();
  }, []);

  const febs = useMemo(
    () => todas.filter((f) => f.facturaId === factura.id).sort((a, b) => b.versionGeneracion - a.versionGeneracion),
    [todas, factura.id]
  );

  const soloEmitida = factura.clase === 'EMITIDA';
  const validacion = useMemo(() => validarParaIntercambioB2B(factura, todas, formato), [factura, todas, formato]);
  const formatos = estadoFormatosB2B();
  const usuario = currentUser?.email || currentUser?.nombre || 'usuario';

  const avisar = (tipo: 'ok' | 'error' | 'aviso', texto: string) => {
    setMensaje({ tipo, texto });
    window.setTimeout(() => setMensaje(null), 9000);
  };

  const persistir = async (feb: FacturaElectronicaB2B) => {
    await saveFacturaElectronicaB2BFirestore(feb);
  };

  const generar = async () => {
    setProcesando(true);
    try {
      const res = generarConEvento(factura, todas, { formato, generadoPor: usuario });
      if (!res.ok || !res.feb) {
        avisar('error', res.error || 'No se pudo generar la factura electrónica.');
        return;
      }
      if (res.feb.versionGeneracion > 1 || febs.some((f) => f.id === res.feb!.id)) {
        avisar('aviso', 'Ya existía una representación activa para esta factura y formato (idempotencia). Se reutiliza.');
      } else {
        await persistir(res.feb);
        avisar('ok', `Representación electrónica ${formato} generada (v${res.feb.versionGeneracion}).`);
      }
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'Error al generar la representación B2B.');
    } finally {
      setProcesando(false);
    }
  };

  const preparar = async (feb: FacturaElectronicaB2B) => {
    setProcesando(true);
    try {
      const adaptador = new AdaptadorPreparacionB2B();
      const res = prepararEnvioB2B(feb, adaptador, usuario);
      if (!res.ok || !res.feb) {
        if (res.feb) await persistir(res.feb);
        avisar('error', res.error || 'No se pudo preparar el envío.');
        return;
      }
      await persistir(res.feb);
      avisar(
        'aviso',
        'Factura DISPUESTA PARA ENVÍO (preparación local). NO es un envío real: el intercambio efectivo requiere plataforma habilitada.'
      );
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'Error al preparar el envío.');
    } finally {
      setProcesando(false);
    }
  };

  const reintentar = async (feb: FacturaElectronicaB2B) => {
    setProcesando(true);
    try {
      const disponibles = adaptadoresDisponiblesB2B();
      const adaptador = disponibles[0] || new AdaptadorPreparacionB2B();
      const res = reintentarEnvioB2B(feb, adaptador, usuario);
      if (!res.ok || !res.feb) {
        avisar('error', res.error || 'Reintento no posible.');
        return;
      }
      await persistir(res.feb);
      avisar('aviso', 'Reintento registrado con la misma clave de idempotencia. Sigue siendo preparación local.');
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'Error en el reintento.');
    } finally {
      setProcesando(false);
    }
  };

  const registrarEstado = async (feb: FacturaElectronicaB2B, estado: EstadoFacturaB2B) => {
    setProcesando(true);
    try {
      const importePagado =
        estado === 'PAGADA' || estado === 'PARCIALMENTE_PAGADA'
          ? factura.cobroPeriodoId || factura.movimientoBancarioId
            ? factura.importeTotal
            : undefined
          : undefined;
      const res = registrarEstadoIntercambioB2B(feb, estado, usuario, { importePagado });
      if (!res.ok || !res.feb) {
        avisar('error', res.error || 'Transición no permitida.');
        return;
      }
      await persistir(res.feb);
      avisar('ok', `Estado registrado: ${ETIQUETAS_ESTADO_B2B[estado]} (registro manual del avance notificado).`);
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'Error al registrar el estado.');
    } finally {
      setProcesando(false);
    }
  };

  const descargar = (feb: FacturaElectronicaB2B) => {
    try {
      const doc = obtenerDocumentoB2B(feb);
      const blob = new Blob([doc.contenido], { type: `${doc.tipoMime};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.nombreFichero;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo generar el documento.');
    }
  };

  return (
    <div className="mt-6 border border-violet-200 bg-violet-50/40 rounded-2xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-sm font-bold text-violet-900 flex items-center gap-2">
          <FileCode2 className="w-4 h-4" /> Factura electrónica B2B (RD 238/2026)
        </h4>
        <span className="text-[11px] text-violet-600 font-medium">
          Separada de RRSIF / VERI*FACTU / B2G · Formatos EN 16931
        </span>
      </div>

      {!soloEmitida && (
        <p className="mt-2 text-xs text-slate-500">
          Solo las facturas <strong>EMITIDAS</strong> generan factura electrónica B2B de intercambio.
        </p>
      )}

      {mensaje && (
        <div
          className={`mt-3 text-xs rounded-xl px-3 py-2 flex items-start gap-2 ${
            mensaje.tipo === 'ok'
              ? 'bg-emerald-100 text-emerald-800'
              : mensaje.tipo === 'aviso'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-rose-100 text-rose-800'
          }`}
        >
          {mensaje.tipo === 'error' ? <XCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{mensaje.texto}</span>
        </div>
      )}

      {/* ------------------------- GENERACIÓN ------------------------- */}
      {soloEmitida && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={formato}
            onChange={(e) => setFormato(e.target.value as FormatoFacturaElectronica)}
            className="text-xs border border-violet-200 rounded-lg px-2 py-1.5 bg-white"
            title="Formato de intercambio (EN 16931)"
          >
            {formatos.map((f) => (
              <option key={f.formato} value={f.formato} disabled={f.estado !== 'IMPLEMENTADO'}>
                {f.formato} — {f.estado === 'IMPLEMENTADO' ? 'implementado' : 'pendiente especificación'}
              </option>
            ))}
          </select>
          <button
            onClick={() => setValidacionAbierta((v) => !v)}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-violet-300 text-violet-700 rounded-lg hover:bg-violet-50 cursor-pointer"
          >
            {validacion.valida ? 'Validación: sin bloqueantes' : `Validación: ${validacion.erroresBloqueantes.length} bloqueante(s)`}
          </button>
          <button
            onClick={generar}
            disabled={procesando || !validacion.valida}
            className="px-3 py-1.5 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title={validacion.valida ? 'Generar representación electrónica' : 'Resuelva los errores bloqueantes antes de generar'}
          >
            Generar {formato}
          </button>
        </div>
      )}

      {validacionAbierta && (
        <div className="mt-2 text-xs bg-white border border-violet-200 rounded-xl p-3 space-y-1">
          {validacion.erroresBloqueantes.length === 0 ? (
            <p className="text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Sin errores bloqueantes para el intercambio.
            </p>
          ) : (
            validacion.erroresBloqueantes.map((e) => (
              <p key={e} className="text-rose-700 flex items-start gap-1">
                <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {e}
              </p>
            ))
          )}
          {validacion.advertencias.map((a) => (
            <p key={a} className="text-amber-700 flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {a}
            </p>
          ))}
          {validacion.duplicidadDetectada && (
            <p className="text-amber-700">Duplicidad: ya existe representación activa (se reutilizará, sin duplicar).</p>
          )}
        </div>
      )}

      {/* ------------------------- LISTA DE REPRESENTACIONES ------------------------- */}
      {febs.length === 0 && soloEmitida && (
        <p className="mt-3 text-xs text-slate-500">Sin representación electrónica B2B para esta factura todavía.</p>
      )}

      {febs.map((feb) => {
        const registrables = ESTADOS_REGISTRABLES[feb.estado] || [];
        const envioPendiente = ['VALIDADA', 'GENERADA'].includes(feb.estado);
        return (
          <div key={feb.id} className="mt-3 bg-white border border-violet-200 rounded-xl p-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${COLOR_ESTADO_B2B[feb.estado]}`}>
                  {ETIQUETAS_ESTADO_B2B[feb.estado]}
                </span>
                <span className="text-xs text-slate-600">
                  {feb.formato} · v{feb.versionGeneracion} · {feb.numeroCompleto}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => descargar(feb)}
                  className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer inline-flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> Documento
                </button>
                {envioPendiente && (
                  <button
                    onClick={() => preparar(feb)}
                    disabled={procesando}
                    className="px-2.5 py-1 text-[11px] font-medium bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg cursor-pointer inline-flex items-center gap-1 disabled:opacity-40"
                    title="Prepara el documento para el intercambio (no es un envío real)"
                  >
                    <Send className="w-3 h-3" /> Preparar envío
                  </button>
                )}
                {['DISPUESTA_PARA_ENVIO', 'RECHAZADA'].includes(feb.estado) && (
                  <button
                    onClick={() => reintentar(feb)}
                    disabled={procesando}
                    className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer inline-flex items-center gap-1 disabled:opacity-40"
                  >
                    <RefreshCw className="w-3 h-3" /> Reintentar
                  </button>
                )}
                <button
                  onClick={() => setHistorialDe(historialDe === feb.id ? null : feb.id)}
                  className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer inline-flex items-center gap-1"
                >
                  <History className="w-3 h-3" /> Historial
                </button>
              </div>
            </div>

            {feb.estado === 'DISPUESTA_PARA_ENVIO' && (
              <div className="mt-2 text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  <strong>No enviada.</strong> El envío efectivo requiere una plataforma de intercambio habilitada
                  (solución pública AEAT/FACeB2B o plataforma privada certificada) — PENDIENTE NORMATIVO/TÉCNICO. La
                  preparación local nunca se presenta como envío real.
                </span>
              </div>
            )}

            {feb.historial.some((h) => h.resultado === 'ERROR') && (
              <div className="mt-2 text-[11px] bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-2.5 py-1.5">
                <strong>Últimos errores:</strong>{' '}
                {feb.historial.filter((h) => h.resultado === 'ERROR').slice(-2).map((h) => h.error).join(' · ')}
              </div>
            )}

            {/* Pago: solo refleja Cobros/conciliación GAP 6 */}
            <div className="mt-2 text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap">
              <Banknote className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Pago: <strong>{feb.informacionPago.estadoPago || 'NO_PAGADA'}</strong>
                {typeof feb.informacionPago.importePagado === 'number' && ` · ${feb.informacionPago.importePagado.toFixed(2)} €`}
                {(factura.cobroPeriodoId || factura.movimientoBancarioId) && ' · vinculado por conciliación (GAP 6)'}
              </span>
            </div>

            {registrables.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-500">Registrar avance notificado por plataforma:</span>
                {registrables.map((estado) => (
                  <button
                    key={estado}
                    onClick={() => registrarEstado(feb, estado)}
                    disabled={procesando}
                    className="px-2 py-0.5 text-[11px] font-medium bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-40"
                  >
                    {ETIQUETAS_ESTADO_B2B[estado]}
                  </button>
                ))}
              </div>
            )}

            {historialDe === feb.id && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="py-0.5 pr-2">Fecha</th>
                      <th className="py-0.5 pr-2">Operación</th>
                      <th className="py-0.5 pr-2">Transición</th>
                      <th className="py-0.5 pr-2">Resultado</th>
                      <th className="py-0.5">Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...feb.historial].reverse().map((h) => (
                      <tr key={h.id} className="text-slate-600 border-t border-slate-50">
                        <td className="py-0.5 pr-2 whitespace-nowrap">{new Date(h.fecha).toLocaleString('es-ES')}</td>
                        <td className="py-0.5 pr-2">{h.operacion}</td>
                        <td className="py-0.5 pr-2">
                          {ETIQUETAS_ESTADO_B2B[h.estadoAnterior]} → {ETIQUETAS_ESTADO_B2B[h.estadoNuevo]}
                        </td>
                        <td className={`py-0.5 pr-2 font-medium ${h.resultado === 'OK' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {h.resultado}
                          {h.error ? ` — ${h.error}` : ''}
                        </td>
                        <td className="py-0.5">{h.usuario}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      <p className="mt-3 text-[10px] text-slate-400">
        GAP 8: generación determinista EN 16931 (CII/UBL/Facturae). Intercambio efectivo y calendario de obligatoriedad
        pendientes de especificación oficial. B2G/FACe fuera de alcance.
      </p>
    </div>
  );
};
