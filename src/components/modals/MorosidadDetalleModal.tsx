/**
 * BLOQUE C — Detalle del expediente de morosidad.
 * Vista de trabajo: deuda + tramos, plan de recobro, comunicaciones (GAP 1),
 * compromisos, evidencias, aseguradora y jurídico, con histórico append-only.
 * La UI no calcula nada: llama a `src/utils/morosidad/*` (motores puros).
 */

import React, { useMemo, useState } from 'react';
import {
  BadgeCheck,
  ExternalLink,
  FileClock,
  Gavel,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  PhoneCall,
  RefreshCw,
  Scale,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import type {
  ComunicacionExpediente,
  EvidenciaMorosidad,
  ExpedienteMorosidad,
  MotivoTransicion,
  ResumenMorosidadPropietario,
  TransicionExpediente,
  EstadoExpediente,
  TipoEvidencia,
} from '../../types/morosidad';
import { ESTADO_EXPEDIENTE_LABELS } from '../../types/morosidad';
import type { ContratoFormalizacion, UsuarioApp } from '../../types';
import {
  type CambiarEstadoFn,
  type EscalarFn,
  type RecalcularJuridicoFn,
  type RegistrarComunicacionFn,
  type RegistrarCompromisoFn,
  type RegistrarPagoFn,
  type ContextoCaso,
} from '../../utils/morosidad/morosidadStore';
import { crearEvidencia } from '../../utils/morosidad/morosidadEngine';
import { obtenerUrlEvidenciaMorosidad, subirEvidenciaMorosidadStorage } from '../../lib/morosidadEvidenciasStorage';
import { TRANSICIONES_MOROSIDAD } from '../../utils/morosidad/morosidadEstados';

interface Props {
  expediente: ExpedienteMorosidad;
  contexto: ContextoCaso;
  esAdmin: boolean;
  historial: TransicionExpediente[];
  evidencias: EvidenciaMorosidad[];
  contrato: ContratoFormalizacion | null;
  plantillasGAP1: string[];
  onCerrar: () => void;
  onRefresh: (id: string) => Promise<void> | void;
  acciones: {
    cambiarEstado: CambiarEstadoFn;
    registrarComunicacion: RegistrarComunicacionFn;
    registrarCompromiso: RegistrarCompromisoFn;
    registrarPago: RegistrarPagoFn;
    escalar: EscalarFn;
    recalcularConceptosJuridicos: RecalcularJuridicoFn;
  };
  resumenPropietario?: ResumenMorosidadPropietario;
}

const fmtEur = (n: number) => `${(Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`;

type PanelId = 'deuda' | 'plan' | 'comunicaciones' | 'compromisos' | 'evidencias' | 'aseguradora' | 'juridico' | 'historial';
type AccionId = null | 'comunicacion' | 'compromiso' | 'pago' | 'escalado' | 'juridico' | 'intereses' | 'cierre';

const ETIQUETA_ESTADO_COM: Record<ComunicacionExpediente['estado'], string> = {
  PREPARADA: 'Preparada (sin envío)',
  PENDIENTE_ENVIO: 'Pendiente de envío',
  PROGRAMADA: 'Programada',
  ENVIADA: 'Enviada (confirmada por el canal)',
  FALLIDA: 'Fallida',
  CANCELADA: 'Cancelada',
  DEPENDENCIA_EXTERNA: 'Dependencia externa (sin proveedor de canal)',
  REGISTRADA_MANUALMENTE: 'Registrada manualmente (fuera del canal ERP)',
};

export const MorosidadDetalleModal: React.FC<Props> = (props) => {
  const { expediente: exp, contexto, esAdmin, historial, evidencias, contrato, plantillasGAP1, onCerrar, onRefresh, acciones } = props;
  const [panel, setPanel] = useState<PanelId>('deuda');
  const [accion, setAccion] = useState<AccionId>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error' | 'aviso'; texto: string } | null>(null);
  const [espera, setEspera] = useState(false);

  // --- formularios ---
  const [nuevoEstado, setNuevoEstado] = useState<EstadoExpediente>('PENDIENTE_CONTACTO');
  const [motivo, setMotivo] = useState<MotivoTransicion>('CONTACTO_REALIZADO');
  const [obs, setObs] = useState('');
  const [comTipo, setComTipo] = useState(plantillasGAP1.find((k) => k.startsWith('morosidad.')) || 'morosidad.primer_recordatorio');
  const [comMedio, setComMedio] = useState<ComunicacionExpediente['medio']>('EMAIL');
  const [comDestinatario, setComDestinatario] = useState<ComunicacionExpediente['destinatarioTipo']>('INQUILINO');
  const [comFecha, setComFecha] = useState(new Date().toISOString().slice(0, 10));
  const [comResumen, setComResumen] = useState('');
  const [cobroId, setCobroId] = useState(exp.piezasDeuda[0]?.cobroId || '');
  const [pagoImporte, setPagoImporte] = useState(exp.piezasDeuda[0]?.cobroId
    ? String(exp.piezasDeuda[0].importeReclamado)
    : '');
  const [pagoFecha, setPagoFecha] = useState(new Date().toISOString().slice(0, 10));
  const [cmpImporte, setCmpImporte] = useState(String(exp.saldoPendiente));
  const [cmpNumPagos, setCmpNumPagos] = useState('3');
  const [cmpPeriodicidad, setCmpPeriodicidad] = useState('30');
  const [cmpPrimeraFecha, setCmpPrimeraFecha] = useState('');
  const [tipoInteres, setTipoInteres] = useState('');
  const [fuenteInteres, setFuenteInteres] = useState('');
  const [desdeFecha, setDesdeFecha] = useState(exp.fechaUltimaVencimiento);
  const [hastaFecha, setHastaFecha] = useState(new Date().toISOString().slice(0, 10));
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const [mascEstado, setMascEstado] = useState<'NO_VERIFICADO' | 'PENDIENTE' | 'CUMPLIDO_EVIDENCIA' | 'IMPOSIBILIDAD_DECLARADA'>('NO_VERIFICADO');

  // --- R2: adjunto de evidencia en Storage real (formulario aditivo; no altera los flujos C) ---
  const [adjArchivo, setAdjArchivo] = useState<File | null>(null);
  const [adjTipo, setAdjTipo] = useState<TipoEvidencia>('DOCUMENTO');
  const [adjFecha, setAdjFecha] = useState(new Date().toISOString().slice(0, 10));
  const [adjResumen, setAdjResumen] = useState('');
  const [adjClave, setAdjClave] = useState(0);
  const [resolviendoAdjuntoId, setResolviendoAdjuntoId] = useState<string | null>(null);

  const transiciones = useMemo(() => TRANSICIONES_MOROSIDAD[exp.estado] || [], [exp.estado]);
  const totales = useMemo(() => {
    const abiertas = exp.piezasDeuda.filter((p) => p.estado !== 'PAGADA' && p.estado !== 'ANULADA' && p.estado !== 'CORREGIDA');
    return {
      abiertas: abiertas.length,
      reclamado: exp.piezasDeuda.reduce((s, p) => s + Number(p.importeReclamado || 0), 0),
    };
  }, [exp.piezasDeuda]);

  const ejecutar = async (fn: () => Promise<{ ok: boolean; errores?: string[]; bloqueos?: string[]; advertencias?: string[] }>, ok: string) => {
    setEspera(true);
    try {
      const r = await fn();
      if (!r.ok) {
        const partes = [
          (r.errores || []).join(' · '),
          (r.bloqueos || []).length ? `Bloqueos de la política: ${(r.bloqueos || []).join(' · ')}` : '',
          (r.advertencias || []).length ? `Avisos: ${(r.advertencias || []).join(' · ')}` : '',
        ].filter(Boolean);
        setAviso({ tipo: 'error', texto: partes.join(' — ') || 'Operación rechazada' });
      } else {
        const adv = (r.advertencias || []).length ? ` — ${(r.advertencias || []).join(' · ')}` : '';
        setAviso({ tipo: (r.advertencias || []).length ? 'aviso' : 'ok', texto: `${ok}${adv}` });
        setAccion(null);
        await onRefresh(exp.id);
      }
    } catch (err) {
      setAviso({ tipo: 'error', texto: err instanceof Error ? err.message : 'Error' });
    } finally {
      setEspera(false);
    }
  };

  // R2: recupera el binario de una evidencia (la URL es efímera; el path es la referencia).
  const verAdjunto = async (e: EvidenciaMorosidad) => {
    if (!e.storagePath || resolviendoAdjuntoId) return;
    setResolviendoAdjuntoId(e.id);
    try {
      const url = await obtenerUrlEvidenciaMorosidad(e.storagePath);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setAviso({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo recuperar el adjunto' });
    } finally {
      setResolviendoAdjuntoId(null);
    }
  };

  // R2: sube el fichero a Storage y registra la evidencia con sus metadatos
  // usando el motor canónico `crearEvidencia` (misma validación que el resto
  // de flujos C) + append + contadores del expediente (igual que registrarPago).
  const subirAdjunto = () =>
    ejecutar(async () => {
      if (!adjArchivo) return { ok: false, errores: ['Selecciona un fichero (PDF o imagen, máx. 10 MB)'] };
      const subido = await subirEvidenciaMorosidadStorage(exp.propietarioId, exp.id, adjArchivo);
      const ev = crearEvidencia({
        expedienteId: exp.id,
        propietarioId: exp.propietarioId,
        tipo: adjTipo,
        fecha: adjFecha,
        resumen: adjResumen,
        storagePath: subido.storagePath,
        nombreArchivo: subido.nombreArchivo,
        tipoMime: subido.tipoMime,
        tamanoBytes: subido.tamanoBytes,
        actor: (contexto.actor || null) as unknown as UsuarioApp | null,
        claveEstable: `adjunto|${subido.storagePath}`,
      });
      if (!ev.ok || !ev.evidencia) return { ok: false, errores: ev.errores };
      await contexto.repositorio.appendEvidencia(ev.evidencia);
      await contexto.repositorio.guardarExpediente({
        ...exp,
        numEvidencias: Number(exp.numEvidencias || 0) + 1,
        ultimaEvidenciaFecha: adjFecha,
        actualizadoEn: new Date().toISOString(),
      });
      setAdjArchivo(null);
      setAdjResumen('');
      setAdjClave((k) => k + 1);
      return { ok: true };
    }, 'Evidencia con adjunto registrada en Storage');

  const paneles: [PanelId, string, number][] = [
    ['deuda', 'Deuda y tramos', exp.piezasDeuda.length],
    ['plan', 'Plan de recobro', exp.planRecobro.length],
    ['comunicaciones', 'Comunicaciones', exp.comunicaciones.length],
    ['compromisos', 'Compromisos', exp.compromisoVigenteId ? 1 : 0],
    ['evidencias', 'Evidencias', exp.numEvidencias],
    ['aseguradora', 'Aseguradora', exp.aseguradora ? 1 : 0],
    ['juridico', 'Jurídico', exp.juridico ? 1 : 0],
    ['historial', 'Histórico', exp.numHistorial],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl my-6">
        <header className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Expediente de morosidad</p>
            <h2 className="text-lg font-bold text-slate-900">{exp.inmuebleDireccion || exp.inmuebleId}</h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{exp.id}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold text-slate-900">{fmtEur(exp.saldoPendiente)}</div>
            <p className="text-[11px] text-slate-500">pendiente · reclamado {fmtEur(exp.importeTotalReclamado)}</p>
            <span className="mt-1 inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-slate-100 text-slate-700 border-slate-200">
              {ESTADO_EXPEDIENTE_LABELS[exp.estado]} · v{exp.versionEstado}
            </span>
          </div>
          <button onClick={onCerrar} className="shrink-0 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </header>

        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div><span className="text-slate-500 block">Propietario</span><span className="font-medium text-slate-800">{exp.propietarioNombre || exp.propietarioId}</span></div>
          <div><span className="text-slate-500 block">Contrato</span><span className="font-medium text-slate-800 font-mono">{exp.contratoId}</span></div>
          <div><span className="text-slate-500 block">Tramos abiertos / antigüedad</span><span className="font-medium text-slate-800">{totales.abiertas} · {exp.diasRetrasoActual} días</span></div>
          <div><span className="text-slate-500 block">Política</span><span className="font-medium text-slate-800">{exp.politicaId} · v{exp.versionPolitica}</span></div>
        </div>

        {aviso && (
          <div className={`mx-6 mt-4 rounded-lg border px-4 py-3 text-sm flex items-start justify-between gap-3 ${
            aviso.tipo === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : aviso.tipo === 'aviso' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}>
            <span className="flex-1 whitespace-pre-wrap">{aviso.texto}</span>
            <button onClick={() => setAviso(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-0">
          {/* Acciones */}
          <aside className="border-r border-slate-200 p-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Acciones</p>
            {[
              { id: 'comunicacion' as AccionId, label: 'Registrar comunicación', icono: MessageSquarePlus, disabled: !esAdmin },
              { id: 'compromiso' as AccionId, label: 'Registrar compromiso', icono: Wallet, disabled: !esAdmin || exp.saldoPendiente <= 0.009 },
              { id: 'pago' as AccionId, label: 'Registrar pago (vía cobros)', icono: BadgeCheck, disabled: !esAdmin || exp.saldoPendiente <= 0.009 },
              { id: 'escalado' as AccionId, label: 'Escalar a aseguradora', icono: ShieldCheck, disabled: !esAdmin },
              { id: 'juridico' as AccionId, label: 'Derivar a jurídico', icono: Gavel, disabled: !esAdmin },
              { id: 'intereses' as AccionId, label: 'Conceptos jurídicos', icono: Scale, disabled: !esAdmin },
              { id: 'cierre' as AccionId, label: 'Cambiar estado / cerrar', icono: FileClock, disabled: !esAdmin },
            ].map((a) => (
              <button
                key={a.label}
                disabled={a.disabled}
                onClick={() => { setAccion(accion === a.id ? null : a.id); setAviso(null); }}
                className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                  accion === a.id ? 'bg-slate-900 text-white border-slate-900' : a.disabled ? 'bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <a.icono className="w-3.5 h-3.5 shrink-0" />
                {a.label}
              </button>
            ))}
            <button onClick={() => onRefresh(exp.id)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">
              <RefreshCw className="w-3.5 h-3.5" /> Recargar desde Firestore
            </button>
            {!esAdmin && (
              <p className="text-[11px] text-slate-500 leading-relaxed pt-2 border-t border-slate-100">
                Vista de solo lectura: el recobro lo gestiona la administración. Tu portal muestra el resumen sin
                datos del arrendatario ni estrategia de recobro.
              </p>
            )}
          </aside>

          {/* Formulario de la acción seleccionada */}
          {accion && (
            <div className="lg:col-start-2 border-b border-slate-200 bg-slate-50/60 p-4">
              {accion === 'comunicacion' && (
                <div className="grid md:grid-cols-4 gap-3 text-xs">
                  <label className="flex flex-col gap-1">Plantilla GAP 1
                    <select value={comTipo} onChange={(e) => setComTipo(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5">
                      {plantillasGAP1.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">Medio
                    <select value={comMedio} onChange={(e) => setComMedio(e.target.value as ComunicacionExpediente['medio'])} className="border border-slate-300 rounded px-2 py-1.5">
                      {['EMAIL', 'INAPP', 'BUROFAX', 'CARTA_CERTIFICADA', 'NOTARIAL', 'LLAMADA', 'PRESENCIAL'].map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">Destinatario
                    <select value={comDestinatario} onChange={(e) => setComDestinatario(e.target.value as ComunicacionExpediente['destinatarioTipo'])} className="border border-slate-300 rounded px-2 py-1.5">
                      {['INQUILINO', 'PROPIETARIO', 'ADMINISTRACION', 'AVALISTA', 'CODEUDOR'].map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">Fecha
                    <input type="date" value={comFecha} onChange={(e) => setComFecha(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <label className="md:col-span-3 flex flex-col gap-1">Resumen (sin datos sensibles ni credenciales)
                    <input value={comResumen} onChange={(e) => setComResumen(e.target.value)} placeholder="p. ej. Burofax remitido con acuse de recibo" className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <label className="flex flex-col gap-1">Tramo
                    <select value={cobroId} onChange={(e) => setCobroId(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5">
                      {exp.piezasDeuda.map((p) => <option key={p.cobroId} value={p.cobroId}>{p.periodoMesAnio}</option>)}
                    </select>
                  </label>
                  <button
                    disabled={espera}
                    onClick={() =>
                      ejecutar(
                        () =>
                          acciones.registrarComunicacion(
                            exp.id,
                            {
                              tipoEvento: comTipo,
                              medio: comMedio,
                              destinatarioTipo: comDestinatario,
                              fecha: comFecha,
                              resumen: comResumen || undefined,
                              cobroId: cobroId || undefined,
                              evidencia: comResumen || ['BUROFAX', 'CARTA_CERTIFICADA', 'NOTARIAL'].includes(comMedio)
                                ? { detalle: comResumen || undefined }
                                : undefined,
                            },
                            contexto,
                          ),
                        `Comunicación registrada (${comMedio}). El estado de entrega lo decide GAP 1: sin proveedor real queda PREPARADA/PENDIENTE_ENVIO.`,
                      )
                    }
                    className="px-3 py-1.5 bg-slate-900 text-white rounded font-semibold hover:bg-slate-800 disabled:opacity-50"
                  >
                    Registrar
                  </button>
                  <p className="md:col-span-4 text-[11px] text-slate-500">
                    Un medio con constancia (burofax/certificado/notarial) habilita la marca «requerimiento fehaciente»,
                    que la política exige para escalar. El ERP no envía nada por sí solo.
                  </p>
                </div>
              )}

              {accion === 'pago' && (
                <div className="grid md:grid-cols-4 gap-3 text-xs">
                  <label className="flex flex-col gap-1">Tramo
                    <select value={cobroId} onChange={(e) => setCobroId(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5">
                      {exp.piezasDeuda.map((p) => (
                        <option key={p.cobroId} value={p.cobroId}>{p.periodoMesAnio} — pendiente {fmtEur(p.importeReclamado)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">Importe recibido
                    <input type="number" step="0.01" value={pagoImporte} onChange={(e) => setPagoImporte(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <label className="flex flex-col gap-1">Fecha de pago
                    <input type="date" value={pagoFecha} onChange={(e) => setPagoFecha(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <label className="flex flex-col gap-1">Observaciones
                    <input value={obs} onChange={(e) => setObs(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <button
                    disabled={espera || !cobroId}
                    onClick={() => {
                      if (!contrato) {
                        setAviso({ tipo: 'error', texto: 'No hay contrato cargado en memoria: el pago debe registrarse sobre el contrato canónico.' });
                        return;
                      }
                      const importe = Number(pagoImporte);
                      const completo = Math.abs(importe - Number(exp.saldoPendiente)) < 0.01;
                      void ejecutar(
                        () =>
                          acciones.registrarPago(
                            contrato,
                            cobroId,
                            { importeRecibido: importe, fechaPago: pagoFecha, observaciones: obs || undefined, metodoPago: 'transferencia' },
                            contexto,
                          ).then((r) => ({ ok: r.ok, errores: r.errores })),
                        `Pago escrito en el cobro canónico vía registrarPagoPeriodo (única vía oficial)${
                          completo ? ' y el expediente quedó saldado' : ''
                        }. El expediente NO marca «pagado» a mano.`,
                      );
                    }}
                    className="px-3 py-1.5 bg-slate-900 text-white rounded font-semibold hover:bg-slate-800 disabled:opacity-50"
                  >
                    Registrar pago
                  </button>
                  <p className="md:col-span-4 text-[11px] text-slate-500">
                    Si el cobro ya está conciliado (GAP 6) no es necesario repetirlo: la sincronización del detector
                    detecta el pago y cierra el expediente sola.
                  </p>
                </div>
              )}

              {accion === 'compromiso' && (
                <div className="grid md:grid-cols-5 gap-3 text-xs">
                  <label className="flex flex-col gap-1">Importe del acuerdo
                    <input type="number" step="0.01" value={cmpImporte} onChange={(e) => setCmpImporte(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <label className="flex flex-col gap-1">Nº de pagos
                    <input type="number" min={1} value={cmpNumPagos} onChange={(e) => setCmpNumPagos(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <label className="flex flex-col gap-1">Periodicidad (días)
                    <input type="number" min={1} value={cmpPeriodicidad} onChange={(e) => setCmpPeriodicidad(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <label className="flex flex-col gap-1">1ª cuota (opcional)
                    <input type="date" value={cmpPrimeraFecha} onChange={(e) => setCmpPrimeraFecha(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <label className="flex flex-col gap-1">Observaciones
                    <input value={obs} onChange={(e) => setObs(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <button
                    disabled={espera}
                    onClick={() =>
                      ejecutar(
                        () =>
                          acciones.registrarCompromiso(
                            exp.id,
                            {
                              fechaPropuesta: new Date().toISOString().slice(0, 10),
                              importeTotal: Number(cmpImporte),
                              numPagos: Number(cmpNumPagos),
                              periodicidadDias: Number(cmpPeriodicidad),
                              primeraCuotaFecha: cmpPrimeraFecha || undefined,
                              origenRegistro: 'LLAMADA',
                              observaciones: obs || undefined,
                              evidencia: { resumen: `Calendario de pagos acordado (${cmpNumPagos} cuotas)`, fecha: new Date().toISOString().slice(0, 10), detalle: obs || undefined },
                            },
                            contexto,
                          ),
                        'Compromiso registrado. Sus cuotas solo se cubren con cobros ya existentes en la fuente contable.',
                      )
                    }
                    className="px-3 py-1.5 bg-slate-900 text-white rounded font-semibold hover:bg-slate-800 disabled:opacity-50"
                  >
                    Registrar compromiso
                  </button>
                </div>
              )}

              {accion === 'escalado' && (
                <div className="grid md:grid-cols-3 gap-3 text-xs">
                  <label className="flex flex-col gap-1">Aseguradora
                    <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Nombre de la aseguradora" className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <div className="md:col-span-2 text-[11px] text-slate-500 leading-relaxed self-end">
                    El ERP <strong>prepara</strong> el expediente de siniestro (aseguradora, póliza, importe,
                    documentación referenciada) y deja constancia del canal usado. NO existe integración con APIs de
                    aseguradoras: el estado será <em>PREPARADO</em> o <em>ENVIADO_MANUALMENTE</em> solo con comprobante.
                  </div>
                  <button
                    disabled={espera || !obs.trim()}
                    onClick={() =>
                      ejecutar(
                        () =>
                          acciones.escalar(
                            exp.id,
                            'ASEGURADORA',
                            {
                              motivo: `Escalado preparado a ${obs}`,
                              aseguradora: {
                                expedienteId: exp.id,
                                aseguradoraNombre: obs,
                                importeReclamado: Number(exp.saldoPendiente),
                                fechaApertura: new Date().toISOString().slice(0, 10),
                                canalUso: 'MANUAL_GMAIL',
                                estadoDeseado: 'PREPARADO',
                              },
                            },
                            contexto,
                          ),
                        'Expediente de aseguradora preparado y notificación interna emitida vía GAP 1.',
                      )
                    }
                    className="px-3 py-1.5 bg-slate-900 text-white rounded font-semibold hover:bg-slate-800 disabled:opacity-50"
                  >
                    Preparar expediente
                  </button>
                </div>
              )}

              {accion === 'juridico' && (
                <div className="grid md:grid-cols-3 gap-3 text-xs">
                  <label className="flex flex-col gap-1">Letrado / despacho
                    <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Nombre" className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <label className="flex flex-col gap-1 md:col-span-2">Actividad negociadora previa (MASC, LO 1/2025)
                    <select
                      value={mascEstado}
                      onChange={(e) => setMascEstado(e.target.value as typeof mascEstado)}
                      className="border border-slate-300 rounded px-2 py-1.5"
                    >
                      <option value="NO_VERIFICADO">No verificado por el ERP</option>
                      <option value="PENDIENTE">Pendiente</option>
                      <option value="CUMPLIDO_EVIDENCIA">Cumplida (con evidencia adjunta en el expediente)</option>
                      <option value="IMPOSIBILIDAD_DECLARADA">Imposibilidad declarada por el usuario</option>
                    </select>
                  </label>
                  <button
                    disabled={espera}
                    onClick={() =>
                      ejecutar(
                        () =>
                          acciones.escalar(
                            exp.id,
                            'JURIDICO',
                            {
                              motivo: `Derivación preparada${obs ? ` a ${obs}` : ''}`,
                              juridico: {
                                expedienteId: exp.id,
                                importeReclamado: Number(exp.saldoPendiente),
                                abogadoNombre: obs || undefined,
                                documentacionIds: exp.piezasDeuda.map((p) => p.id),
                                fechaDerivacion: new Date().toISOString().slice(0, 10),
                                requisitoProcedibilidad: mascEstado === 'CUMPLIDO_EVIDENCIA' ? 'PENDIENTE' : mascEstado,
                              },
                            },
                            contexto,
                          ),
                        'Expediente jurídico preparado. El ERP no presenta escritos ni se comunica con órganos judiciales.',
                      )
                    }
                    className="px-3 py-1.5 bg-slate-900 text-white rounded font-semibold hover:bg-slate-800 disabled:opacity-50"
                  >
                    Preparar derivación
                  </button>
                  <p className="md:col-span-3 text-[11px] text-slate-500">
                    Si la política exige MASC declarado, la derivación queda bloqueada hasta registrar una
                    comunicación con constancia (burofax/certificado/notarial). El cauce procesal lo decide el letrado.
                  </p>
                </div>
              )}

              {accion === 'intereses' && (
                <div className="grid md:grid-cols-4 gap-3 text-xs">
                  <label className="flex flex-col gap-1">Tipo anual % (lo aporta el usuario)
                    <input type="number" step="0.001" value={tipoInteres} onChange={(e) => setTipoInteres(e.target.value)} placeholder="p. ej. 5" className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <label className="flex flex-col gap-1">Desde (fecha del requerimiento)
                    <input type="date" value={desdeFecha} onChange={(e) => setDesdeFecha(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <label className="flex flex-col gap-1">Hasta
                    <input type="date" value={hastaFecha} onChange={(e) => setHastaFecha(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <label className="flex flex-col gap-1">Fuente normativa (norma + artículo)
                    <input value={fuenteInteres} onChange={(e) => setFuenteInteres(e.target.value)} placeholder="p. ej. art. 1108 CC / PGE vigente" className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <button
                    disabled={espera || !tipoInteres}
                    onClick={() =>
                      ejecutar(
                        () =>
                          acciones.recalcularConceptosJuridicos(
                            exp.id,
                            {
                              desdeFecha,
                              hastaFecha,
                              requerimientoExiste: exp.requerimientoFehacienteExiste,
                              parametros: {
                                tipoAnualPct: Number(tipoInteres),
                                baseCalculo: 'SOLO_CAPITAL',
                                inicioMoraRequiereRequerimiento: true,
                                fuente: fuenteInteres || undefined,
                                fechaConsultaFuente: new Date().toISOString().slice(0, 10),
                                ambitoAplicacion: fuenteInteres ? 'Arrendamiento de vivienda — verificado por el usuario' : undefined,
                                diasAnio: 365,
                                redondeoDecimales: 2,
                              },
                            },
                            contexto,
                          ).then((r) => ({ ok: r.ok, errores: r.errores, advertencias: r.advertencias })),
                        'Concepto recalculado. Sin fuente completa queda en estado ESTIMADO y no se presenta como liquidación definitiva.',
                      )
                    }
                    className="px-3 py-1.5 bg-slate-900 text-white rounded font-semibold hover:bg-slate-800 disabled:opacity-50"
                  >
                    Calcular (estimado)
                  </button>
                  <p className="md:col-span-4 text-[11px] text-slate-500">
                    El ERP no fija el interés legal del dinero ni lo hardcodea: el tipo lo aporta el usuario con su
                    fuente. El cómputo es interés simple sobre el capital (sin anatocismo) y exige requerimiento registrado.
                  </p>
                </div>
              )}

              {accion === 'cierre' && (
                <div className="grid md:grid-cols-4 gap-3 text-xs">
                  <label className="flex flex-col gap-1">Nuevo estado
                    <select value={nuevoEstado} onChange={(e) => setNuevoEstado(e.target.value as EstadoExpediente)} className="border border-slate-300 rounded px-2 py-1.5">
                      {transiciones.length === 0 && <option value={exp.estado}>— terminal (sin salidas) —</option>}
                      {transiciones.map((t) => <option key={t} value={t}>{ESTADO_EXPEDIENTE_LABELS[t]}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">Motivo
                    <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoTransicion)} className="border border-slate-300 rounded px-2 py-1.5">
                      {['CONTACTO_REALIZADO', 'REQUERIMIENTO_ENVIADO', 'COMPROMISO_ALCANZADO', 'PAGO_PARCIAL_RECIBIDO', 'PAGO_RECIBIDO', 'DEUDA_SALDADA', 'ESCALADO_ASEGURADORA', 'ESCALADO_JURIDICO', 'DISPUTA_APERTURA', 'DISPUTA_RESUELTA', 'ANULACION_O_RECTIFICACION', 'CERRADA_SIN_COBRO', 'REAPERTURA', 'CAMBIO_MANUAL'].map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 md:col-span-1">Observaciones
                    <input value={obs} onChange={(e) => setObs(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5" />
                  </label>
                  <label className="flex items-center gap-2 self-end pb-1">
                    <input type="checkbox" checked={confirmarCierre} onChange={(e) => setConfirmarCierre(e.target.checked)} />
                    Confirmar cierre con saldo pendiente
                  </label>
                  <button
                    disabled={espera || transiciones.length === 0}
                    onClick={() =>
                      ejecutar(
                        () => acciones.cambiarEstado(exp.id, nuevoEstado, motivo, { observaciones: obs || undefined, confirmarCierreConSaldo: confirmarCierre, forzarSinEvidencia: true }, contexto),
                        `Estado actualizado a ${ESTADO_EXPEDIENTE_LABELS[nuevoEstado]}. Transición registrada en el histórico append-only.`,
                      )
                    }
                    className="px-3 py-1.5 bg-slate-900 text-white rounded font-semibold hover:bg-slate-800 disabled:opacity-50"
                  >
                    Aplicar transición
                  </button>
                  {transiciones.length === 0 && (
                    <p className="md:col-span-4 text-[11px] text-rose-600 font-semibold">
                      Estado terminal: la única vía es abrir una reapertura (nueva ocurrencia del expediente).
                    </p>
                  )}
                  <p className="md:col-span-4 text-[11px] text-slate-500">
                    Un cambio de estado nunca borra deuda ni importes: PAGADA exige saldo cero en la fuente, y
                    CERRADA con saldo pendiente exige confirmación y motivo habilitante.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Paneles */}
          <div className="p-4 lg:p-6 space-y-4">
            <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
              {paneles.map(([id, label, n]) => (
                <button
                  key={id}
                  onClick={() => setPanel(id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                    panel === id ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {label} <span className="text-slate-400">({n})</span>
                </button>
              ))}
            </div>

            {panel === 'deuda' && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-500 uppercase tracking-wide text-[10px]">
                    <tr>
                      <th className="text-left py-2 px-2">Periodo</th>
                      <th className="text-left py-2 px-2">Vencimiento</th>
                      <th className="text-right py-2 px-2">Previsto</th>
                      <th className="text-right py-2 px-2">Cobrado</th>
                      <th className="text-right py-2 px-2">Reclamado</th>
                      <th className="text-left py-2 px-2">Clasificación</th>
                      <th className="text-left py-2 px-2">Estado cobro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {exp.piezasDeuda.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 px-2 font-medium text-slate-800">{p.nombreMes || p.periodoMesAnio}</td>
                        <td className="py-2 px-2 text-slate-600">{p.fechaVencimiento} <span className="text-slate-400">({p.diasRetraso} d)</span></td>
                        <td className="py-2 px-2 text-right">{fmtEur(p.importePrevisto)}</td>
                        <td className="py-2 px-2 text-right text-emerald-700">{fmtEur(p.importeRecibido)}</td>
                        <td className="py-2 px-2 text-right font-semibold">{fmtEur(p.importeReclamado)}</td>
                        <td className="py-2 px-2"><span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">{p.clasificacion}</span></td>
                        <td className="py-2 px-2 text-slate-600">
                          {p.estadoCobroOrigen}
                          {p.motivoDisputa ? <span className="block text-[10px] text-rose-600">disputa: {p.motivoDisputa}</span> : null}
                          {p.notaRectificacion ? <span className="block text-[10px] text-amber-600">{p.notaRectificacion}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
                      <td className="py-2 px-2" colSpan={4}>Totales (derivados de la fuente de cobros)</td>
                      <td className="py-2 px-2 text-right">{fmtEur(totales.reclamado)}</td>
                      <td className="py-2 px-2" colSpan={2}>
                        Intereses {fmtEur(exp.importeInteresesReclamados)} · Gastos {fmtEur(exp.importeGastosReclamables)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {panel === 'plan' && (
              <ul className="space-y-2 text-xs">
                {exp.planRecobro.length === 0 && <li className="text-slate-500">Sin plan generado. Ejecuta la detección para generarlo con la política vigente.</li>}
                {exp.planRecobro.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 border border-slate-200 rounded-lg px-3 py-2">
                    <div>
                      <span className="font-semibold text-slate-800">{p.pasoCodigo}</span> · {p.pasoNombre}
                      <div className="text-[10px] text-slate-500">
                        objetivo {p.fechaObjetivo} · {p.accion}{p.tipoEvento ? ` · ${p.tipoEvento}` : ''} · destinatarios {p.destinatarios.join(', ')}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                        p.estado === 'ENVIADO' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : p.estado === 'SIN_TRANSPORTE' || p.estado === 'BLOQUEADO' ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : p.estado === 'PROGRAMADO' ? 'bg-slate-100 text-slate-600 border-slate-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>{p.estado}</span>
                      {p.motivoBloqueo && <div className="text-[10px] text-slate-500 mt-0.5">{p.motivoBloqueo}</div>}
                    </div>
                  </li>
                ))}
                <li className="text-[10px] text-slate-400 pt-1">
                  D+3/D+10/D+20/D+30 son offsets de la política, no plazos legales. El paso ya comunicado queda OMITIDO
                  (idempotencia GAP 1); el histórico de versiones anteriores no se reescribe.
                </li>
              </ul>
            )}

            {panel === 'comunicaciones' && (
              <ul className="space-y-2 text-xs">
                {exp.comunicaciones.length === 0 && <li className="text-slate-500">Sin comunicaciones registradas.</li>}
                {exp.comunicaciones.map((c) => (
                  <li key={c.id} className="border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">{c.tipoEvento}</span>
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                        c.estado === 'ENVIADA' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>{ETIQUETA_ESTADO_COM[c.estado]}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {c.medio} → {c.destinatarioTipo} · {c.fechaRegistro.slice(0, 10)}
                      {c.fechaEnvio ? ` · enviado ${c.fechaEnvio.slice(0, 10)}` : ''}
                      {c.notificacionId ? ` · GAP1 ${c.notificacionId}` : ' · sin documento GAP1'}
                      {c.evidenciaId ? ` · evidencia ${c.evidenciaId}` : ''}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-1 break-all">{c.idempotencyKey}</div>
                    {c.cuerpoResumen && <p className="text-[11px] text-slate-600 mt-1">{c.cuerpoResumen}</p>}
                  </li>
                ))}
              </ul>
            )}

            {panel === 'evidencias' && (
              <div className="space-y-2">
                {esAdmin && (
                  <div className="border border-indigo-200 bg-indigo-50/50 rounded-lg px-3 py-2 space-y-2 text-xs">
                    <div className="font-semibold text-slate-800 flex items-center gap-1">
                      <Paperclip className="w-3.5 h-3.5" /> Adjuntar evidencia (PDF/imagen, máx. 10 MB)
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <input key={adjClave} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setAdjArchivo(e.target.files?.[0] || null)} className="border border-slate-300 rounded px-2 py-1.5 bg-white md:col-span-2" />
                      <select value={adjTipo} onChange={(e) => setAdjTipo(e.target.value as TipoEvidencia)} className="border border-slate-300 rounded px-2 py-1.5 bg-white">
                        <option value="DOCUMENTO">DOCUMENTO</option>
                        <option value="COMUNICACION">COMUNICACION</option>
                        <option value="NOTIFICACION_FEHACIENTE">NOTIFICACION_FEHACIENTE</option>
                        <option value="RESPUESTA_DEUDOR">RESPUESTA_DEUDOR</option>
                        <option value="PROMESA_PAGO">PROMESA_PAGO</option>
                        <option value="PAGO">PAGO</option>
                        <option value="LLAMADA">LLAMADA</option>
                        <option value="ACTUACION_PROFESIONAL">ACTUACION_PROFESIONAL</option>
                        <option value="INCIDENCIA">INCIDENCIA</option>
                        <option value="VISITA_PRESENCIAL">VISITA_PRESENCIAL</option>
                        <option value="OTRO">OTRO</option>
                      </select>
                      <input type="date" value={adjFecha} onChange={(e) => setAdjFecha(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5 bg-white" />
                    </div>
                    <input value={adjResumen} onChange={(e) => setAdjResumen(e.target.value)} placeholder="Resumen de la evidencia (mín. 3 caracteres)" className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white" />
                    <button onClick={subirAdjunto} disabled={espera || !adjArchivo} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold disabled:opacity-50">
                      {espera ? 'Subiendo…' : 'Subir y registrar evidencia'}
                    </button>
                  </div>
                )}
              <ul className="space-y-2 text-xs">
                {evidencias.length === 0 && <li className="text-slate-500">Sin evidencias en la caché local; recarga para leer <code>evidencias_morosidad</code>.</li>}
                {evidencias.map((e) => (
                  <li key={e.id} className="border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">{e.tipo} · {e.fecha}</span>
                      <PhoneCall className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <p className="text-slate-600 mt-1">{e.resumen}</p>
                    {e.detalle && <p className="text-[11px] text-slate-500 mt-0.5">{e.detalle}</p>}
                    {e.storagePath && (
                      <button onClick={() => verAdjunto(e)} disabled={resolviendoAdjuntoId === e.id} className="mt-1 inline-flex items-center gap-1 text-indigo-700 hover:underline disabled:opacity-50">
                        {resolviendoAdjuntoId === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                        Ver adjunto{e.nombreArchivo ? ` (${e.nombreArchivo})` : ''}
                      </button>
                    )}
                    <p className="text-[10px] font-mono text-slate-400 mt-1">{e.id}</p>
                  </li>
                ))}
              </ul>
              </div>
            )}

            {panel === 'compromisos' && (
              <div className="text-xs space-y-2">
                {!exp.compromisoVigenteId && <p className="text-slate-500">Sin compromiso vigente.</p>}
                {exp.compromisoVigenteId && (
                  <p className="text-slate-700">Compromiso <code>{exp.compromisoVigenteId}</code>. Consulta el tab
                    «Compromisos» para el detalle de cuotas y su cobertura desde la fuente contable.</p>
                )}
              </div>
            )}

            {panel === 'aseguradora' && (
              <div className="text-xs space-y-2">
                {!exp.aseguradora && <p className="text-slate-500">Sin expediente de aseguradora. Usa «Escalar a aseguradora» para prepararlo.</p>}
                {exp.aseguradora && (
                  <div className="grid md:grid-cols-2 gap-2">
                    {[
                      ['Aseguradora', exp.aseguradora.aseguradoraNombre],
                      ['Póliza', exp.aseguradora.numeroPoliza || '—'],
                      ['Referencia', exp.aseguradora.referenciaSiniestro || '—'],
                      ['Estado', exp.aseguradora.estado],
                      ['Canal de uso', exp.aseguradora.canalUso],
                      ['Importe reclamado', fmtEur(exp.aseguradora.importeReclamado)],
                      ['Franquicia', exp.aseguradora.franquicia != null ? fmtEur(exp.aseguradora.franquicia) : '—'],
                      ['Indemnización', exp.aseguradora.indemnizacionAbonada != null ? fmtEur(exp.aseguradora.indemnizacionAbonada) : '—'],
                      ['Apertura', exp.aseguradora.fechaApertura],
                      ['Resolución', exp.aseguradora.fechaResolucion || '—'],
                    ].map(([k, v]) => (
                      <div key={k as string} className="border border-slate-200 rounded px-3 py-2">
                        <span className="text-slate-500 block">{k}</span>
                        <span className="font-medium text-slate-800">{v as string}</span>
                      </div>
                    ))}
                    <p className="md:col-span-2 text-[11px] text-slate-500">{exp.aseguradora.avisoCondicionesPoliza}</p>
                    <div className="md:col-span-2">
                      <p className="font-semibold text-slate-700">Respuestas registradas ({exp.aseguradora.respuestas.length})</p>
                      <ul className="mt-1 space-y-1">
                        {exp.aseguradora.respuestas.map((r) => (
                          <li key={r.id} className="border border-slate-100 rounded px-2 py-1 text-slate-600">{r.fecha} · {r.resumen}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}

            {panel === 'juridico' && (
              <div className="text-xs space-y-2">
                {!exp.juridico && <p className="text-slate-500">Sin expediente jurídico.</p>}
                {exp.juridico && (
                  <>
                    <div className="grid md:grid-cols-2 gap-2">
                      {[
                        ['Estado', exp.juridico.estado],
                        ['Referencia interna', exp.juridico.referenciaInterna || '—'],
                        ['Letrado', exp.juridico.abogadoNombre || '—'],
                        ['Procurador', exp.juridico.procuradorNombre || '—'],
                        ['Derivación', exp.juridico.fechaDerivacion || '—'],
                        ['Importe reclamado', fmtEur(exp.juridico.importeReclamado)],
                        ['Nº procedimiento', exp.juridico.numeroProcedimiento || 'no consta'],
                        ['Órgano', exp.juridico.organoJudicial || 'no consta'],
                        ['Cauce', exp.juridico.tipoProcedimiento || 'a decidir por el letrado'],
                        ['MASC', exp.juridico.requisitoProcedibilidad],
                      ].map(([k, v]) => (
                        <div key={k as string} className="border border-slate-200 rounded px-3 py-2">
                          <span className="text-slate-500 block">{k}</span>
                          <span className="font-medium text-slate-800">{v as string}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500">{exp.juridico.cauceAviso}</p>
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      El ERP no presenta demandas, burofax ni escritos, y no verifica la existencia de un MASC:
                      registra lo que la administración declara y su evidencia.
                    </p>
                  </>
                )}
              </div>
            )}

            {panel === 'historial' && (
              <ul className="space-y-2 text-xs">
                {historial.length === 0 && exp.numHistorial === 0 && <li className="text-slate-500">Sin transiciones registradas.</li>}
                {historial.map((t) => (
                  <li key={t.id} className="border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">
                        {t.estadoAnterior ? `${ESTADO_EXPEDIENTE_LABELS[t.estadoAnterior]} → ` : ''}
                        {ESTADO_EXPEDIENTE_LABELS[t.estadoNuevo]}
                      </span>
                      <span className="text-[10px] text-slate-500">{t.fecha.slice(0, 16).replace('T', ' ')}</span>
                    </div>
                    <div className="text-slate-600 mt-1">
                      {t.motivo}{t.actorNombre ? ` · ${t.actorNombre}` : ''}
                      {t.observaciones ? ` — ${t.observaciones}` : ''}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      importe {fmtEur(t.importeTotalAntes)} → {fmtEur(t.importeTotalDespues)}
                      {t.evidenciaId ? ` · evidencia ${t.evidenciaId}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MorosidadDetalleModal;
