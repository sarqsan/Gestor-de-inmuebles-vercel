/**
 * BLOQUE C — Sección «Morosidad & Recobro» (administración).
 * Respeta la arquitectura visual existente (patrón de `TesoreriaSection`):
 * tarjetas + tabs + modales, sin lógica económica en la UI (todo vive en
 * `src/utils/morosidad/*`).
 *
 * Lo que la pantalla AFIRMA y lo que NO afirma:
 *  - AFINA: detección, estados, evidencias, compromisos y expediente (datos reales).
 *  - NO AFIRMA envíos: cada comunicación muestra su estado GAP 1 (PREPARADA /
 *    PENDIENTE_ENVIO / DEPENDENCIA_EXTERNA / ENVIADA solo con confirmación real).
 *  - NO calcula cantidades jurídicas salvo que el usuario aporte tipo + fuente.
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileWarning,
  Gavel,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Wallet,
  X,
} from 'lucide-react';
import type {
  CompromisoPago,
  ExpedienteMorosidad,
  EvidenciaMorosidad,
  MotivoTransicion,
  PoliticaMorosidad,
  ResumenMorosidadPropietario,
  TransicionExpediente,
} from '../../types/morosidad';
import type { EstadoExpediente } from '../../types/morosidad';
import type { CobroPeriodo, ContratoFormalizacion, Inmueble, Propietario, UsuarioApp } from '../../types';
import { ESTADO_EXPEDIENTE_LABELS } from '../../types/morosidad';
import {
  cambiarEstado,
  detectarYGestionar,
  escalar,
  recalcularConceptosJuridicos,
  registrarCompromiso,
  registrarComunicacion,
  registrarPago,
  type ContextoCaso,
} from '../../utils/morosidad/morosidadStore';
import {
  versionarPolitica,
  validarPolitica,
} from '../../utils/morosidad/dunningPolicy';
import { progresoCompromiso } from '../../utils/morosidad/compromisos';
import { describirEstado, TRANSICIONES_MOROSIDAD } from '../../utils/morosidad/morosidadEstados';
import { resumenMorosidad } from '../../utils/morosidad/morosidadEngine';
import { PLANTILLAS } from '../../notificaciones/plantillas';
import { MorosidadDetalleModal } from '../modals/MorosidadDetalleModal';

interface MorosidadSectionProps {
  expedientes: ExpedienteMorosidad[];
  compromisos: CompromisoPago[];
  politicas: PoliticaMorosidad[];
  contratos: ContratoFormalizacion[];
  inmuebles: Inmueble[];
  propietarios: Propietario[];
  currentUser?: UsuarioApp | null;
  /** Contexto de caso (repositorio + dispatcher GAP 1) construido en App.tsx. */
  contexto: ContextoCaso;
  onSavePolitica: (p: PoliticaMorosidad) => Promise<void> | void;
  esAdmin: boolean;
  /** Vista de mínimo privilegio (la usa el portal; aquí solo para verificación). */
  resumenPropietario?: ResumenMorosidadPropietario[];
}

type TabId = 'resumen' | 'expedientes' | 'compromisos' | 'politica';

const fmtEur = (n: number) =>
  `${(Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`;

function badgeEstado(estado: EstadoExpediente): string {
  switch (estado) {
    case 'PAGADA':
    case 'CERRADA':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'JURIDICA':
    case 'ESCALADA':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'COMPROMISO_INCUMPLIDO':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'COMPROMISO_PAGO':
    case 'PAGO_PARCIAL':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'DETECTADA':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    default:
      return 'bg-blue-50 text-blue-700 border-blue-200';
  }
}

export const MorosidadSection: React.FC<MorosidadSectionProps> = (props) => {
  const { expedientes, compromisos, politicas, contratos, propietarios, currentUser, contexto, onSavePolitica, esAdmin } = props;
  const [tab, setTab] = useState<TabId>('resumen');
  const [detalle, setDetalle] = useState<ExpedienteMorosidad | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | EstadoExpediente>('TODOS');
  const [filtroProp, setFiltroProp] = useState<string>('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error' | 'aviso'; texto: string } | null>(null);
  const [detectando, setDetectando] = useState(false);
  const [historialDetalle, setHistorialDetalle] = useState<TransicionExpediente[]>([]);
  const [evidenciasDetalle, setEvidenciasDetalle] = useState<EvidenciaMorosidad[]>([]);

  const visibles = useMemo(() => {
    if (esAdmin) return expedientes;
    const pid = currentUser?.propietarioId;
    return pid ? expedientes.filter((e) => e.propietarioId === pid) : [];
  }, [expedientes, currentUser, esAdmin]);

  const resumen = useMemo(() => resumenMorosidad(visibles), [visibles]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return visibles.filter((e) => {
      if (filtroEstado !== 'TODOS' && e.estado !== filtroEstado) return false;
      if (filtroProp !== 'TODOS' && e.propietarioId !== filtroProp) return false;
      if (!q) return true;
      const texto = `${e.inmuebleDireccion || ''} ${e.contratoId} ${e.propietarioNombre || ''} ${e.piezasDeuda.map((p) => p.periodoMesAnio).join(' ')}`.toLowerCase();
      return texto.includes(q);
    });
  }, [visibles, filtroEstado, filtroProp, busqueda]);

  const ejecutar = async <T extends { ok: boolean; errores?: string[]; advertencias?: string[] }>(
    p: Promise<T>,
    okTexto: string,
  ): Promise<T | null> => {
    try {
      const r = await p;
      if (!r.ok) {
        const errores = (r.errores || []).length ? (r.errores || []).join(' · ') : 'operación rechazada';
        const adv = (r.advertencias || []).length ? ` — Avisos: ${(r.advertencias || []).join(' · ')}` : '';
        setMensaje({ tipo: 'error', texto: `${errores}${adv}` });
        return r;
      }
      const adv = (r.advertencias || []).length ? ` — Avisos: ${(r.advertencias || []).join(' · ')}` : '';
      setMensaje({ tipo: (r.advertencias || []).length ? 'aviso' : 'ok', texto: `${okTexto}${adv}` });
      return r;
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'Error inesperado' });
      return null;
    }
  };

  const lanzarDeteccion = async () => {
    setDetectando(true);
    try {
      const res = await detectarYGestionar(contratos, contexto);
      setMensaje({
        tipo: res.errores.length ? 'error' : 'ok',
        texto: `${res.creados.length} expediente(s) nuevo(s), ${res.sincronizados.length} sincronizado(s), ${res.omitidos.length} omitido(s)${
          res.errores.length ? ` · Errores: ${res.errores.slice(0, 3).join(' · ')}` : ''
        }. La detección es idempotente: repetirla no duplica deuda, expedientes ni comunicaciones.`,
      });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'Error en la detección' });
    } finally {
      setDetectando(false);
    }
  };

  const abrirDetalle = async (exp: ExpedienteMorosidad) => {
    setDetalle(exp);
    try {
      const [hist, evi] = await Promise.all([
        contexto.repositorio.listarHistorial?.(exp.id) ?? Promise.resolve([] as TransicionExpediente[]),
        contexto.repositorio.listarEvidencias?.(exp.id) ?? Promise.resolve([] as EvidenciaMorosidad[]),
      ]);
      setHistorialDetalle(hist);
      setEvidenciasDetalle(evi);
    } catch {
      setHistorialDetalle([]);
      setEvidenciasDetalle([]);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileWarning className="w-6 h-6 text-amber-600" />
            Morosidad, recobro y expediente
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Circuito trazable sobre la contabilidad oficial de cobros: detección determinista → expediente →
            política de recobro → comunicaciones por GAP&nbsp;1 → compromisos → evidencias → aseguradora → vía jurídica.
            Ningún plazo mostrado es un plazo legal (política configurable) y el ERP no afirma envíos que no pueda verificar.
          </p>
        </div>
        <button
          onClick={lanzarDeteccion}
          disabled={!esAdmin || detectando}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${detectando ? 'animate-spin' : ''}`} />
          {detectando ? 'Detectando…' : 'Detectar / sincronizar deuda'}
        </button>
      </header>

      {mensaje && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm flex items-start justify-between gap-3 ${
            mensaje.tipo === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : mensaje.tipo === 'aviso'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <span className="flex-1">{mensaje.texto}</span>
          <button onClick={() => setMensaje(null)} className="shrink-0"><X className="w-4 h-4" /></button>
        </div>
      )}

      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {([
          ['resumen', 'Resumen'],
          ['expedientes', `Expedientes (${visibles.length})`],
          ['compromisos', `Compromisos (${compromisos.filter((c) => c.estado === 'VIGENTE').length} vigentes)`],
          ['politica', 'Política de recobro'],
        ] as [TabId, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'resumen' && (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {[
            { label: 'Deuda pendiente', valor: fmtEur(resumen.deudaTotal), icono: AlertTriangle, tono: 'text-rose-600' },
            { label: 'Expedientes abiertos', valor: String(resumen.expedientesAbiertos), icono: ClipboardList, tono: 'text-slate-700' },
            { label: 'Periodos vencidos', valor: String(resumen.periodosVencidos), icono: Clock, tono: 'text-amber-600' },
            { label: 'Compromisos vigentes', valor: String(resumen.compromisosVigentes), icono: Wallet, tono: 'text-blue-600' },
            { label: 'Escalados (aseg./jurídico)', valor: String(resumen.escalados), icono: Gavel, tono: 'text-purple-600' },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</span>
                <c.icono className={`w-4 h-4 ${c.tono}`} />
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{c.valor}</p>
            </div>
          ))}
          <div className="md:col-span-2 xl:col-span-5 bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Distribución por estado</h3>
            {Object.keys(resumen.porEstado).length === 0 ? (
              <p className="text-sm text-slate-500">Sin expedientes en el ámbito visible.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Object.entries(resumen.porEstado).map(([estado, num]) => (
                  <span key={estado} className={`px-3 py-1 rounded-full border text-xs font-medium ${badgeEstado(estado as EstadoExpediente)}`}>
                    {ESTADO_EXPEDIENTE_LABELS[estado as EstadoExpediente] || estado}: {num}
                  </span>
                ))}
                {resumen.enDisputa > 0 && (
                  <span className="px-3 py-1 rounded-full border text-xs font-medium bg-slate-100 text-slate-700 border-slate-200">
                    En disputa (no recobrables automáticamente): {resumen.enDisputa}
                  </span>
                )}
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-3">
              Cobrado aplicado desde la fuente canónica: {fmtEur(resumen.importeCubierto)}. La deuda en estado
              INCIDENCIA se excluye del recobro automático y se marca como «en revisión».
            </p>
          </div>
        </section>
      )}

      {tab === 'expedientes' && (
        <section className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
              Estado
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value as EstadoExpediente | 'TODOS')}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-[190px]"
              >
                <option value="TODOS">Todos</option>
                {Object.entries(ESTADO_EXPEDIENTE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
              Propietario
              <select
                value={filtroProp}
                onChange={(e) => setFiltroProp(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-[190px]"
              >
                <option value="TODOS">Todos</option>
                {propietarios.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1 flex-1 min-w-[200px]">
              Búsqueda
              <span className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Inmueble, contrato o periodo"
                  className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm"
                />
              </span>
            </label>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Expediente / Inmueble</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="text-right px-4 py-3">Deuda</th>
                  <th className="text-right px-4 py-3">Antigüedad</th>
                  <th className="text-left px-4 py-3">Próxima acción</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                      Sin expedientes. Ejecuta «Detectar / sincronizar deuda» para derivarlos de los calendarios de cobro.
                    </td>
                  </tr>
                )}
                {filtrados.map((e) => {
                  const info = describirEstado(e);
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          {e.inmuebleDireccion || e.inmuebleId}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {e.propietarioNombre || e.propietarioId} · {e.piezasDeuda.length} periodo(s):{' '}
                          {e.piezasDeuda.slice(0, 3).map((p) => p.periodoMesAnio).join(', ')}
                          {e.piezasDeuda.length > 3 ? '…' : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${badgeEstado(e.estado)}`}>
                          {ESTADO_EXPEDIENTE_LABELS[e.estado]}
                        </span>
                        {e.enDisputa && (
                          <div className="text-[10px] text-rose-600 font-semibold mt-1">Deuda en disputa</div>
                        )}
                        {info.requiereAtencion && (
                          <div className="text-[10px] text-amber-600 font-semibold mt-1">Atención requerida</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-semibold text-slate-900">{fmtEur(e.saldoPendiente)}</div>
                        <div className="text-[10px] text-slate-500">reclamado {fmtEur(e.importeTotalReclamado)}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        <div>{e.diasRetrasoActual} d</div>
                        <div className="text-[10px] text-slate-400">desde {e.fechaUltimaVencimiento}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {e.proximaAccionCodigo ? (
                          <>
                            <span className="font-medium">{e.proximaAccionCodigo}</span>
                            <div className="text-[10px] text-slate-400">{e.proximaAccionFecha}</div>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        <div className="text-[10px] text-slate-400">
                          {e.comunicaciones.length} comun. · {e.numEvidencias} evid.
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => abrirDetalle(e)}
                          className="text-xs font-semibold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
                        >
                          Abrir <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'compromisos' && (
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Compromiso</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-right px-4 py-3">Importe</th>
                <th className="text-left px-4 py-3">Cuotas</th>
                <th className="text-left px-4 py-3">Próxima cuota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {compromisos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Sin compromisos registrados. Se abren desde el detalle de cada expediente.
                  </td>
                </tr>
              )}
              {compromisos.map((c) => {
                const prog = progresoCompromiso(c);
                const exp = visibles.find((e) => e.id === c.expedienteId);
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{c.id}</div>
                      <div className="text-[11px] text-slate-500">
                        {exp?.inmuebleDireccion || c.inmuebleId} · propuesto {c.fechaPropuesta}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${
                          c.estado === 'CUMPLIDO'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : c.estado === 'INCUMPLIDO'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        {c.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-semibold">{fmtEur(c.importeCubierto)} / {fmtEur(c.importeTotal)}</div>
                      <div className="text-[10px] text-slate-500">{prog.pct}% cubierto</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {prog.cuotasCubiertas}/{c.numPagos} cubiertas
                      {prog.cuotasVencidas > 0 ? ` · ${prog.cuotasVencidas} vencida(s)` : ''}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {prog.proximaFecha || '—'}
                      <div className="text-[10px] text-slate-400">
                        Los cobros proceden de la fuente oficial (cobrosEngine/GAP 6); el compromiso no altera ningún recibo.
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'politica' && (
        <TabPolitica
          politicas={politicas}
          esAdmin={esAdmin}
          onSave={onSavePolitica}
          setMensaje={setMensaje}
        />
      )}

      {detalle && (
        <MorosidadDetalleModal
          expediente={detalle}
          contexto={contexto}
          esAdmin={esAdmin}
          historial={historialDetalle}
          evidencias={evidenciasDetalle}
          contrato={contratos.find((c) => c.id === detalle.contratoId) || null}
          plantillasGAP1={Object.keys(PLANTILLAS).filter((k) => k.startsWith('morosidad.') || k.startsWith('cobro.'))}
          onRefresh={async (id) => {
            const fresco = await contexto.repositorio.leerExpediente(id);
            if (fresco) setDetalle(fresco);
            const [hist, evi] = await Promise.all([
              contexto.repositorio.listarHistorial?.(id) ?? Promise.resolve([] as TransicionExpediente[]),
              contexto.repositorio.listarEvidencias?.(id) ?? Promise.resolve([] as EvidenciaMorosidad[]),
            ]);
            setHistorialDetalle(hist);
            setEvidenciasDetalle(evi);
          }}
          onCerrar={() => {
            setDetalle(null);
            setHistorialDetalle([]);
            setEvidenciasDetalle([]);
          }}
          acciones={{
            cambiarEstado,
            registrarComunicacion,
            registrarCompromiso,
            registrarPago,
            escalar,
            recalcularConceptosJuridicos,
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab de política (configurable, versionada; el histórico no se reescribe)
// ---------------------------------------------------------------------------

const TabPolitica: React.FC<{
  politicas: PoliticaMorosidad[];
  esAdmin: boolean;
  onSave: (p: PoliticaMorosidad) => Promise<void> | void;
  setMensaje: (m: { tipo: 'ok' | 'error' | 'aviso'; texto: string }) => void;
}> = ({ politicas, esAdmin, onSave, setMensaje }) => {
  const [selId, setSelId] = useState<string>(politicas[0]?.id || '');
  const seleccion = politicas.find((p) => p.id === selId) || politicas[0];
  const [borrador, setBorrador] = useState<PoliticaMorosidad | null>(seleccion ? { ...seleccion, pasos: seleccion.pasos.map((s) => ({ ...s })) } : null);

  React.useEffect(() => {
    if (seleccion) setBorrador({ ...seleccion, pasos: seleccion.pasos.map((s) => ({ ...s })) });
  }, [seleccion?.id, seleccion?.version]);

  if (!seleccion || !borrador) {
    return (
      <section className="bg-white rounded-xl border border-slate-200 p-6 text-sm text-slate-600">
        No hay política guardada todavía. La detección usa la <strong>política de referencia del ERP</strong>{' '}
        (Recobro estándar, configurable) hasta que se cree una propia.
      </section>
    );
  }

  const guardar = async () => {
    const v = validarPolitica(borrador);
    if (!v.valida) {
      setMensaje({ tipo: 'error', texto: `Política no válida: ${v.errores.join(' · ')}` });
      return;
    }
    const { politica, advertencias } = versionarPolitica(seleccion, borrador, new Date().toISOString());
    await onSave(politica);
    setMensaje({
      tipo: advertencias.length ? 'aviso' : 'ok',
      texto: `Política versionada a v${politica.version}. ${
        advertencias.length ? `Avisos: ${advertencias.join(' · ')} — ` : ''
      }Los planes ya generados conservan su versión de política: el histórico no se reescribe.`,
    });
  };

  const setPaso = (codigo: string, cambios: Partial<(typeof borrador.pasos)[number]>) => {
    setBorrador({
      ...borrador,
      pasos: borrador.pasos.map((p) => (p.codigo === codigo ? { ...p, ...cambios } : p)),
    });
  };

  return (
    <section className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
          Política
          <select value={selId} onChange={(e) => setSelId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-[260px]">
            {politicas.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre} · v{p.version}{p.propietarioId ? ` (${p.propietarioId})` : ' (global)'}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
          Días de gracia (configurables)
          <input
            type="number"
            min={0}
            max={90}
            value={borrador.diasGracia}
            disabled={!esAdmin}
            onChange={(e) => setBorrador({ ...borrador, diasGracia: Number(e.target.value) })}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-32"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
          Escalado: días de retraso mínimos
          <input
            type="number"
            min={0}
            value={borrador.escalado.diasRetrasoMinimo}
            disabled={!esAdmin}
            onChange={(e) => setBorrador({ ...borrador, escalado: { ...borrador.escalado, diasRetrasoMinimo: Number(e.target.value) } })}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-32"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
          Escalado: mensualidades impagadas mínimas
          <input
            type="number"
            min={1}
            value={borrador.escalado.mesesImpagadosMinimos}
            disabled={!esAdmin}
            onChange={(e) => setBorrador({ ...borrador, escalado: { ...borrador.escalado, mesesImpagadosMinimos: Number(e.target.value) } })}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-32"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600 flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            checked={borrador.escalado.requiereMascDeclaradoParaJuridica}
            disabled={!esAdmin}
            onChange={(e) => setBorrador({ ...borrador, escalado: { ...borrador.escalado, requiereMascDeclaradoParaJuridica: e.target.checked } })}
          />
          Exigir actividad negociadora previa (MASC) antes de la vía jurídica
        </label>
        {esAdmin && (
          <button onClick={guardar} className="ml-auto px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Versionar política
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Paso</th>
              <th className="text-left px-4 py-3">Acción</th>
              <th className="text-left px-4 py-3">Plantilla GAP 1</th>
              <th className="text-right px-4 py-3">Días (offset)</th>
              <th className="text-left px-4 py-3">Destinatarios</th>
              <th className="text-center px-4 py-3">Activo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {borrador.pasos.map((paso) => (
              <tr key={paso.codigo}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{paso.codigo}</div>
                  <div className="text-[11px] text-slate-500">{paso.nombre}</div>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={paso.accion}
                    disabled={!esAdmin}
                    onChange={(e) => setPaso(paso.codigo, { accion: e.target.value as typeof paso.accion })}
                    className="border border-slate-300 rounded px-2 py-1 text-xs"
                  >
                    <option value="NOTIFICAR">Notificar (GAP 1)</option>
                    <option value="TAREA INTERNA">Tarea interna</option>
                    <option value="NO_ACTION">Sin acción</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 font-mono">{paso.tipoEvento || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <input
                    type="number"
                    value={paso.diasOffset}
                    disabled={!esAdmin}
                    onChange={(e) => setPaso(paso.codigo, { diasOffset: Number(e.target.value) })}
                    className="border border-slate-300 rounded px-2 py-1 text-xs w-20 text-right"
                  />
                </td>
                <td className="px-4 py-3 text-[11px] text-slate-600">{(paso.destinatarios || []).join(', ') || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={paso.activo}
                    disabled={!esAdmin}
                    onChange={(e) => setPaso(paso.codigo, { activo: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-[11px] text-slate-500 border-t border-slate-100">
          Los desfases son <strong>política operativa</strong>, no plazos legales. Desactivar un paso no borra las
          comunicaciones ni el histórico ya generados. Las plantillas pertenecen al registro canónico de GAP&nbsp;1.
        </p>
      </div>
    </section>
  );
};

export default MorosidadSection;
export type { EstadoExpediente, MotivoTransicion, CobroPeriodo };
export const ESTADOS_POSIBLES: Record<EstadoExpediente, EstadoExpediente[]> = TRANSICIONES_MOROSIDAD;
export const CheckIcon = CheckCircle2;
export const PlayIcon = PlayCircle;
