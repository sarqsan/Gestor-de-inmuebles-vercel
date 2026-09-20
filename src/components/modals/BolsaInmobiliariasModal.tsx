import React, { useMemo, useState } from 'react';
import {
  X,
  Building2,
  Send,
  CheckCircle2,
  XCircle,
  Phone,
  Mail,
  Globe,
  Plus,
  Trash2,
  BadgeCheck,
  Loader2,
  Handshake,
  FileSignature,
  MapPin,
} from 'lucide-react';
import type {
  EstadoLeadInmobiliario,
  ExpedienteRecomercializacion,
  InmobiliariaDirectorio,
  Inmueble,
  LeadInmobiliario,
  PropuestaInmobiliaria,
  UsuarioApp,
} from '../../types';
import { DESTINO_INMUEBLE_LABEL } from '../../utils/recomercializacionEngine';

interface Props {
  expediente: ExpedienteRecomercializacion;
  inmueble?: Inmueble;
  inmobiliarias: InmobiliariaDirectorio[];
  propuestas: PropuestaInmobiliaria[];
  leads: LeadInmobiliario[];
  currentUser?: UsuarioApp | null;
  onGuardarExpediente: (e: ExpedienteRecomercializacion) => Promise<void> | void;
  onGuardarInmobiliaria: (a: InmobiliariaDirectorio) => Promise<void> | void;
  onEliminarInmobiliaria: (id: string) => Promise<void> | void;
  onGuardarLead: (l: LeadInmobiliario) => Promise<void> | void;
  onGuardarPropuesta: (p: PropuestaInmobiliaria) => Promise<void> | void;
  onClose: () => void;
}

const inputCls =
  'w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none';

const LEAD_ESTADO_LABEL: Record<EstadoLeadInmobiliario, string> = {
  SOLICITADO: 'RFP enviada',
  CONTACTADO: 'En contacto',
  ACUERDO_FIRMADO: 'Acuerdo firmado',
  DESCARTADO: 'Descartada',
};

const leadBadge: Record<EstadoLeadInmobiliario, string> = {
  SOLICITADO: 'bg-amber-50 text-amber-800 border-amber-200',
  CONTACTADO: 'bg-sky-50 text-sky-800 border-sky-200',
  ACUERDO_FIRMADO: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  DESCARTADO: 'bg-slate-100 text-slate-500 border-slate-200',
};

export const BolsaInmobiliariasModal: React.FC<Props> = ({
  expediente,
  inmueble,
  inmobiliarias,
  propuestas,
  leads,
  currentUser,
  onGuardarExpediente,
  onGuardarInmobiliaria,
  onEliminarInmobiliaria,
  onGuardarLead,
  onGuardarPropuesta,
  onClose,
}) => {
  const [pestana, setPestana] = useState<'bolsa' | 'propuestas' | 'directorio'>('bolsa');
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [formAgencia, setFormAgencia] = useState(false);
  const [formPropuestaAgencia, setFormPropuestaAgencia] = useState('');
  const [nueva, setNueva] = useState({
    nombreComercial: '',
    telefono: '',
    email: '',
    web: '',
    localidad: inmueble?.ciudad || '',
    provincia: '',
    cps: inmueble?.codigoPostal || '',
    operaVenta: expediente.destinoPrevisto === 'VENTA',
    operaAlquiler: expediente.destinoPrevisto !== 'VENTA',
    operaHabitaciones: expediente.destinoPrevisto === 'ALQUILER_HABITACIONES',
    comisionMediaAlquiler: '',
    comisionMediaVenta: '',
  });
  const [propuestaForm, setPropuestaForm] = useState({
    honorarios: '',
    plazo: '60',
    servicios: '',
    estrategia: '',
  });

  const esAdmin = currentUser?.tipoPerfil === 'ADMINISTRADOR';
  const esVenta = expediente.destinoPrevisto === 'VENTA';
  const esHabitaciones = expediente.destinoPrevisto === 'ALQUILER_HABITACIONES';

  const leadsDelExpediente = useMemo(
    () => leads.filter((l) => l.inmuebleId === expediente.inmuebleId),
    [leads, expediente.inmuebleId]
  );
  const leadPorAgencia = useMemo(() => {
    const m = new Map<string, LeadInmobiliario>();
    leadsDelExpediente.forEach((l) => {
      const prev = m.get(l.inmobiliariaId);
      if (!prev || (l.estado === 'ACUERDO_FIRMADO' && prev.estado !== 'ACUERDO_FIRMADO')) m.set(l.inmobiliariaId, l);
    });
    return m;
  }, [leadsDelExpediente]);

  const propuestasDelExpediente = useMemo(
    () =>
      propuestas
        .filter((p) => p.expedienteId === expediente.id)
        .sort((a, b) => (b.fechaPropuesta || '').localeCompare(a.fechaPropuesta || '')),
    [propuestas, expediente.id]
  );

  const agenciaCompatible = (a: InmobiliariaDirectorio): boolean => {
    if (esVenta && !a.operaVenta) return false;
    if (esHabitaciones && !a.operaHabitaciones) return false;
    if (!esVenta && !a.operaAlquiler) return false;
    return a.activo !== false;
  };

  const enZona = (a: InmobiliariaDirectorio): boolean => {
    const cp = inmueble?.codigoPostal?.trim();
    if (cp && (a.codigosPostales || []).some((x) => x.trim() === cp)) return true;
    if (inmueble?.ciudad && a.localidad?.toLowerCase() === inmueble.ciudad.toLowerCase()) return true;
    return false;
  };

  const agencias = useMemo(() => {
    const compatibles = inmobiliarias.filter(agenciaCompatible);
    return [...compatibles]
      .filter(enZona)
      .concat(compatibles.filter((a) => !enZona(a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inmobiliarias, inmueble, expediente.destinoPrevisto]);

  const contactadas = new Set(expediente.comercializacion?.inmobiliariasContactadasIds ?? []);

  const toggleSeleccion = (id: string) => {
    setSeleccionadas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  const persistirExpediente = async (parcial: Partial<ExpedienteRecomercializacion>) => {
    await onGuardarExpediente({ ...expediente, ...parcial, updatedAt: new Date().toISOString() });
  };

  const enviarRFPs = async () => {
    if (seleccionadas.size === 0) return;
    setEnviando(true);
    try {
      const ahora = new Date().toISOString();
      const nuevosContactos = new Set(contactadas);
      const tipoOperacion: LeadInmobiliario['tipoOperacion'] = esVenta
        ? 'VENTA'
        : esHabitaciones
          ? 'HABITACIONES'
          : 'ALQUILER';
      for (const agenciaId of seleccionadas) {
        const existente = leadPorAgencia.get(agenciaId);
        if (existente && existente.estado !== 'DESCARTADO') continue;
        const lead: LeadInmobiliario = {
          id: `lead_${expediente.inmuebleId}_${agenciaId}_${Date.now().toString(36)}`,
          inmuebleId: expediente.inmuebleId,
          propietarioId: expediente.propietarioId,
          inmobiliariaId: agenciaId,
          fechaSolicitud: ahora,
          tipoOperacion,
          estado: 'SOLICITADO',
          createdAt: ahora,
        };
        await onGuardarLead(lead);
        nuevosContactos.add(agenciaId);
      }
      await persistirExpediente({
        comercializacion: {
          inmobiliariasContactadasIds: [...nuevosContactos],
          ...expediente.comercializacion,
        },
      });
      setSeleccionadas(new Set());
    } finally {
      setEnviando(false);
    }
  };

  const cambiarEstadoLead = async (agenciaId: string, estado: EstadoLeadInmobiliario) => {
    const previo = leadPorAgencia.get(agenciaId);
    const ahora = new Date().toISOString();
    if (previo) {
      await onGuardarLead({ ...previo, estado, updatedAt: ahora });
    } else {
      await onGuardarLead({
        id: `lead_${expediente.inmuebleId}_${agenciaId}_${Date.now().toString(36)}`,
        inmuebleId: expediente.inmuebleId,
        propietarioId: expediente.propietarioId,
        inmobiliariaId: agenciaId,
        fechaSolicitud: ahora,
        tipoOperacion: esVenta ? 'VENTA' : esHabitaciones ? 'HABITACIONES' : 'ALQUILER',
        estado,
        createdAt: ahora,
      });
      await persistirExpediente({
        comercializacion: {
          inmobiliariasContactadasIds: Array.from(new Set([...(expediente.comercializacion?.inmobiliariasContactadasIds ?? []), agenciaId])),
          ...expediente.comercializacion,
        },
      });
    }
  };

  const guardarPropuesta = async () => {
    if (!formPropuestaAgencia || !propuestaForm.honorarios.trim()) return;
    const ahora = new Date().toISOString();
    const propuesta: PropuestaInmobiliaria = {
      id: `prop_${expediente.id}_${formPropuestaAgenciaIdSafe()}_${Date.now().toString(36)}`,
      expedienteId: expediente.id,
      inmuebleId: expediente.inmuebleId,
      propietarioId: expediente.propietarioId,
      inmobiliariaId: formPropuestaAgencia,
      fechaPropuesta: ahora,
      honorariosPropuestos: propuestaForm.honorarios.trim(),
      plazoEstimadoDias: Number(propuestaForm.plazo) || 0,
      serviciosIncluidos: propuestaForm.servicios
        .split(/[,\n;]/)
        .map((s) => s.trim())
        .filter(Boolean),
      estrategiaResumen: propuestaForm.estrategia.trim(),
      estado: 'PENDIENTE',
      createdAt: ahora,
    };
    await onGuardarPropuesta(propuesta);
    await persistirExpediente({
      comercializacion: {
        inmobiliariasContactadasIds: Array.from(new Set([...(expediente.comercializacion?.inmobiliariasContactadasIds ?? []), formPropuestaAgencia])),
        ...expediente.comercializacion,
      },
    });
    setFormPropuestaAgencia('');
    setPropuestaForm({ honorarios: '', plazo: '60', servicios: '', estrategia: '' });
  };
  const formPropuestaAgenciaIdSafe = () =>
    formPropuestaAgencia.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20) || 'x';

  const resolverPropuesta = async (p: PropuestaInmobiliaria, aceptar: boolean) => {
    if (aceptar) {
      // Aceptar una deja el resto en rechazadas (comparativa con una sola ganadora).
      for (const otra of propuestasDelExpediente.filter((x) => x.id !== p.id && x.estado === 'PENDIENTE')) {
        await onGuardarPropuesta({ ...otra, estado: 'RECHAZADA', updatedAt: new Date().toISOString() });
      }
      await onGuardarPropuesta({ ...p, estado: 'ACEPTADA', updatedAt: new Date().toISOString() });
      await cambiarEstadoLead(p.inmobiliariaId, 'ACUERDO_FIRMADO');
    } else {
      await onGuardarPropuesta({ ...p, estado: 'RECHAZADA', updatedAt: new Date().toISOString() });
    }
  };

  const guardarAgencia = async () => {
    if (!nueva.nombreComercial.trim() || !nueva.telefono.trim() || !nueva.email.trim() || !nueva.localidad.trim()) return;
    const ahora = new Date().toISOString();
    const agencia: InmobiliariaDirectorio = {
      id: `inmobi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      nombreComercial: nueva.nombreComercial.trim(),
      telefono: nueva.telefono.trim(),
      email: nueva.email.trim(),
      web: nueva.web.trim() || undefined,
      localidad: nueva.localidad.trim(),
      provincia: nueva.provincia.trim(),
      codigosPostales: nueva.cps.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
      operaVenta: nueva.operaVenta,
      operaAlquiler: nueva.operaAlquiler,
      operaHabitaciones: nueva.operaHabitaciones,
      comisionMediaAlquiler: nueva.comisionMediaAlquiler.trim() || undefined,
      comisionMediaVenta: nueva.comisionMediaVenta.trim() || undefined,
      especialidades: [],
      origen: 'LOCALIZADA_EXTERNA',
      verificada: false,
      esPatrocinada: false,
      activo: true,
      createdAt: ahora,
    };
    await onGuardarInmobiliaria(agencia);
    setFormAgencia(false);
    setNueva({ ...nueva, nombreComercial: '', telefono: '', email: '', web: '', provincia: '', cps: '', comisionMediaAlquiler: '', comisionMediaVenta: '' });
  };

  const nombreAgencia = (id: string) => inmobiliarias.find((a) => a.id === id)?.nombreComercial || 'Agencia no disponible';

  const pestañaBtn = (id: typeof pestana, label: string, conteo?: number) => (
    <button
      type="button"
      onClick={() => setPestana(id)}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${pestana === id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'}`}
    >
      {label}
      {conteo !== undefined && <span className="ml-1 opacity-80">({conteo})</span>}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl my-8 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 leading-tight">Bolsa de inmobiliarias y propuestas</h3>
              <p className="text-xs text-slate-500">
                {inmueble?.direccion} · {DESTINO_INMUEBLE_LABEL[expediente.destinoPrevisto]} · {contactadas.size} contactada(s)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pt-4 flex gap-2">
          {pestañaBtn('bolsa', 'Agencias de la zona')}
          {pestañaBtn('propuestas', 'Propuestas recibidas', propuestasDelExpediente.length)}
          {esAdmin && pestañaBtn('directorio', 'Gestionar directorio', inmobiliarias.length)}
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {pestana === 'bolsa' && (
            <>
              {agencias.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
                  No hay agencias compatibles en el directorio{esAdmin ? '; añádelas en «Gestionar directorio».' : '; el administrador puede darlas de alta.'}
                </div>
              )}
              {agencias.map((a) => {
                const lead = leadPorAgencia.get(a.id);
                const checked = seleccionadas.has(a.id);
                const zona = enZona(a);
                return (
                  <div key={a.id} className={`rounded-xl border p-3 ${checked ? 'border-indigo-400 bg-indigo-50/40' : 'border-slate-200'}`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-indigo-600"
                        checked={checked || !!lead}
                        disabled={!!lead && lead.estado !== 'DESCARTADO'}
                        onChange={() => toggleSeleccion(a.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-900">{a.nombreComercial}</p>
                          {a.verificada && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                              <BadgeCheck className="w-3 h-3" /> Verificada
                            </span>
                          )}
                          {a.esPatrocinada && (
                            <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Patrocinada</span>
                          )}
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${zona ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
                            {zona ? 'Cobertura en la zona' : 'Otra zona'}
                          </span>
                          {lead && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${leadBadge[lead.estado]}`}>
                              {LEAD_ESTADO_LABEL[lead.estado]}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
                          <MapPin className="w-3 h-3" /> {[a.localidad, a.provincia].filter(Boolean).join(' · ')}
                          {(a.codigosPostales || []).length > 0 && <span>· CP {a.codigosPostales.join(', ')}</span>}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
                          <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{a.telefono}</span>
                          <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{a.email}</span>
                          {a.web && (
                            <a href={a.web.startsWith('http') ? a.web : `https://${a.web}`} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                              <Globe className="w-3 h-3" />Web
                            </a>
                          )}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {[
                            a.operaAlquiler ? 'Alquiler' : '',
                            a.operaVenta ? 'Venta' : '',
                            a.operaHabitaciones ? 'Habitaciones' : '',
                            a.comisionMediaAlquiler ? `Comisión alq. ${a.comisionMediaAlquiler}` : '',
                            a.comisionMediaVenta ? `Comisión venta ${a.comisionMediaVenta}` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {lead && (
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {lead.estado === 'SOLICITADO' && (
                              <button onClick={() => cambiarEstadoLead(a.id, 'CONTACTADO')}
                                className="px-2 py-1 text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100">
                                Marcar contactada
                              </button>
                            )}
                            {(lead.estado === 'CONTACTADO' || lead.estado === 'SOLICITADO') && (
                              <button onClick={() => cambiarEstadoLead(a.id, 'ACUERDO_FIRMADO')}
                                className="px-2 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 inline-flex items-center gap-1">
                                <Handshake className="w-3 h-3" /> Acuerdo firmado
                              </button>
                            )}
                            {lead.estado !== 'DESCARTADO' && lead.estado !== 'ACUERDO_FIRMADO' && (
                              <button onClick={() => cambiarEstadoLead(a.id, 'DESCARTADO')}
                                className="px-2 py-1 text-[10px] font-semibold text-slate-500 bg-white border border-slate-300 rounded-lg hover:bg-slate-100">
                                Descartar
                              </button>
                            )}
                            {lead.estado === 'DESCARTADO' && (
                              <button onClick={() => cambiarEstadoLead(a.id, 'SOLICITADO')}
                                className="px-2 py-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                                Reabrir contacto
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {seleccionadas.size > 0 && (
                <div className="sticky bottom-0 flex justify-end">
                  <button onClick={enviarRFPs} disabled={enviando}
                    className="px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-2 shadow-lg disabled:opacity-50">
                    {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Solicitar propuesta (RFP) a {seleccionadas.size} agencia(s)
                  </button>
                </div>
              )}
            </>
          )}

          {pestana === 'propuestas' && (
            <>
              <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <FileSignature className="w-4 h-4 text-indigo-600" /> Registrar propuesta recibida
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <select className={inputCls} value={formPropuestaAgencia} onChange={(e) => setFormPropuestaAgencia(e.target.value)}>
                    <option value="">Agencia…</option>
                    {inmobiliarias.filter((a) => a.activo !== false).map((a) => (
                      <option key={a.id} value={a.id}>{a.nombreComercial}</option>
                    ))}
                  </select>
                  <input className={inputCls} placeholder="Honorarios (ej. 1 mes + IVA / 3%)"
                    value={propuestaForm.honorarios} onChange={(e) => setPropuestaForm({ ...propuestaForm, honorarios: e.target.value })} />
                  <input className={inputCls} type="number" placeholder="Plazo estimado (días)"
                    value={propuestaForm.plazo} onChange={(e) => setPropuestaForm({ ...propuestaForm, plazo: e.target.value })} />
                  <input className={inputCls} placeholder="Servicios (fotos, contrato, filtrado…)"
                    value={propuestaForm.servicios} onChange={(e) => setPropuestaForm({ ...propuestaForm, servicios: e.target.value })} />
                </div>
                <textarea className={`${inputCls} min-h-[60px]`} placeholder="Resumen de su estrategia de comercialización"
                  value={propuestaForm.estrategia} onChange={(e) => setPropuestaForm({ ...propuestaForm, estrategia: e.target.value })} />
                <div className="flex justify-end">
                  <button onClick={guardarPropuesta} disabled={!formPropuestaAgencia || !propuestaForm.honorarios.trim()}
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
                    <Plus className="w-3.5 h-3.5" /> Registrar propuesta
                  </button>
                </div>
              </div>

              {propuestasDelExpediente.length === 0 ? (
                <p className="text-[11px] text-slate-400 text-center py-4">
                  Aún no hay propuestas. Envía RFPs desde «Agencias de la zona» y registra aquí las condiciones que te devuelvan para compararlas.
                </p>
              ) : (
                <div className="space-y-2">
                  {propuestasDelExpediente.map((p) => {
                    const estadoCls =
                      p.estado === 'ACEPTADA'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : p.estado === 'RECHAZADA'
                          ? 'bg-slate-100 text-slate-500 border-slate-200'
                          : p.estado === 'EXPIRADA'
                            ? 'bg-orange-50 text-orange-700 border-orange-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200';
                    return (
                      <div key={p.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-xs font-bold text-slate-800">{nombreAgencia(p.inmobiliariaId)}</p>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${estadoCls}`}>
                            {p.estado === 'PENDIENTE' ? 'Pendiente' : p.estado === 'ACEPTADA' ? 'Aceptada' : p.estado === 'RECHAZADA' ? 'Rechazada' : 'Expirada'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-[11px] text-slate-600">
                          <span><b>Honorarios:</b> {p.honorariosPropuestos}</span>
                          <span><b>Plazo:</b> {p.plazoEstimadoDias} días</span>
                          <span className="col-span-2"><b>Servicios:</b> {(p.serviciosIncluidos || []).join(', ') || '—'}</span>
                        </div>
                        {p.estrategiaResumen && <p className="text-[11px] text-slate-500 mt-1">{p.estrategiaResumen}</p>}
                        {p.estado === 'PENDIENTE' && (
                          <div className="flex gap-1.5 mt-2 justify-end">
                            <button onClick={() => resolverPropuesta(p, true)}
                              className="px-2.5 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Aceptar
                            </button>
                            <button onClick={() => resolverPropuesta(p, false)}
                              className="px-2.5 py-1 text-[10px] font-semibold text-slate-500 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 inline-flex items-center gap-1">
                              <XCircle className="w-3 h-3" /> Rechazar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {pestana === 'directorio' && esAdmin && (
            <>
              <div className="flex justify-end">
                <button onClick={() => setFormAgencia((v) => !v)}
                  className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-white border border-indigo-300 rounded-lg hover:bg-indigo-50 inline-flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> {formAgencia ? 'Cancelar' : 'Añadir inmobiliaria'}
                </button>
              </div>
              {formAgencia && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <input className={inputCls} placeholder="Nombre comercial *" value={nueva.nombreComercial}
                      onChange={(e) => setNueva({ ...nueva, nombreComercial: e.target.value })} />
                    <input className={inputCls} placeholder="Teléfono *" value={nueva.telefono}
                      onChange={(e) => setNueva({ ...nueva, telefono: e.target.value })} />
                    <input className={inputCls} placeholder="Email *" value={nueva.email}
                      onChange={(e) => setNueva({ ...nueva, email: e.target.value })} />
                    <input className={inputCls} placeholder="Web" value={nueva.web}
                      onChange={(e) => setNueva({ ...nueva, web: e.target.value })} />
                    <input className={inputCls} placeholder="Localidad *" value={nueva.localidad}
                      onChange={(e) => setNueva({ ...nueva, localidad: e.target.value })} />
                    <input className={inputCls} placeholder="Provincia" value={nueva.provincia}
                      onChange={(e) => setNueva({ ...nueva, provincia: e.target.value })} />
                    <input className={inputCls} placeholder="Códigos postales (espacios)" value={nueva.cps}
                      onChange={(e) => setNueva({ ...nueva, cps: e.target.value })} />
                    <input className={inputCls} placeholder="Comisión alquiler" value={nueva.comisionMediaAlquiler}
                      onChange={(e) => setNueva({ ...nueva, comisionMediaAlquiler: e.target.value })} />
                    <input className={inputCls} placeholder="Comisión venta (%)" value={nueva.comisionMediaVenta}
                      onChange={(e) => setNueva({ ...nueva, comisionMediaVenta: e.target.value })} />
                  </div>
                  <div className="flex gap-4 text-[11px] font-semibold text-slate-600">
                    <label className="inline-flex items-center gap-1"><input type="checkbox" checked={nueva.operaAlquiler}
                      onChange={(e) => setNueva({ ...nueva, operaAlquiler: e.target.checked })} />Alquiler</label>
                    <label className="inline-flex items-center gap-1"><input type="checkbox" checked={nueva.operaVenta}
                      onChange={(e) => setNueva({ ...nueva, operaVenta: e.target.checked })} />Venta</label>
                    <label className="inline-flex items-center gap-1"><input type="checkbox" checked={nueva.operaHabitaciones}
                      onChange={(e) => setNueva({ ...nueva, operaHabitaciones: e.target.checked })} />Habitaciones</label>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={guardarAgencia}
                      className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Guardar en el directorio
                    </button>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                {inmobiliarias.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[11px]">
                    <span className="font-bold text-slate-800">
                      {a.nombreComercial}
                      <span className="font-normal text-slate-400"> · {a.localidad}{a.provincia ? `, ${a.provincia}` : ''} · CP {(a.codigosPostales || []).join(', ') || '—'}</span>
                    </span>
                    <button onClick={() => onEliminarInmobiliaria(a.id)} className="p-1 text-slate-400 hover:text-rose-600" title="Eliminar">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
