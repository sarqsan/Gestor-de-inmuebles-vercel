/**
 * BLOQUE E — Gestión ERP de inquilinos (solo ADMINISTRADOR):
 * accesos, invitaciones, hilos de mensajes y vinculación contrato→índices.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Link2,
  Lock,
  Mail,
  MessageCircle,
  Plus,
  Send,
  Unlock,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import {
  db,
  saveIncidenciaFirestore,
  saveUsuarioFirestore,
  subscribeEnlacesRegistro,
  subscribeIncidencias,
} from '../../lib/firebase';
import {
  concederAccesoContrato,
  crearInvitacionInquilino,
  enviarMensajePortal,
  marcarMensajeLeidoPorGestion,
  revocarAccesoContrato,
  revocarInvitacionInquilino,
  subscribeMensajesPortal,
  vincularIncidenciaAContrato,
} from '../../lib/suministrosFirestore';
import type {
  ContratoFormalizacion,
  EnlaceRegistro,
  Incidencia,
  Inmueble,
  MensajePortal,
  UsuarioApp,
} from '../../types';

interface Props {
  currentUser: UsuarioApp;
  contratos: ContratoFormalizacion[];
  inmuebles: Inmueble[];
  usuarios: UsuarioApp[];
}

type Tab = 'accesos' | 'invitaciones' | 'mensajes' | 'vinculacion';

export const InquilinosSection: React.FC<Props> = ({ currentUser, contratos, inmuebles, usuarios }) => {
  const [tab, setTab] = useState<Tab>('accesos');
  const [enlaces, setEnlaces] = useState<EnlaceRegistro[]>([]);
  const [mensajes, setMensajes] = useState<MensajePortal[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    const u1 = subscribeEnlacesRegistro(setEnlaces);
    const u2 = subscribeMensajesPortal(setMensajes);
    const u3 = subscribeIncidencias(setIncidencias);
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const inquilinos = useMemo(() => usuarios.filter((u) => u.tipoPerfil === 'INQUILINO'), [usuarios]);
  const invitaciones = useMemo(() => enlaces.filter((e) => e.tipoPerfil === 'INQUILINO'), [enlaces]);
  const dirContrato = (id: string) => contratos.find((c) => c.id === id)?.inmuebleDireccion || id;
  const noLeidosGestion = mensajes.filter((m) => m.remitenteRol === 'INQUILINO' && m.leidoPorGestion !== true).length;

  const informar = (msg: string) => {
    setAviso(msg);
    setTimeout(() => setAviso(''), 4000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-700" /> Portal de inquilinos
        </h2>
        {noLeidosGestion > 0 && (
          <span className="text-xs font-bold bg-red-100 text-red-700 px-2.5 py-1 rounded-full">
            {noLeidosGestion} mensajes sin leer
          </span>
        )}
      </div>

      {aviso && (
        <p className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {aviso}
        </p>
      )}

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
        {(
          [
            { id: 'accesos', etiqueta: 'Accesos', icono: UserCheck },
            { id: 'invitaciones', etiqueta: 'Invitaciones', icono: Link2 },
            { id: 'mensajes', etiqueta: `Mensajes${noLeidosGestion > 0 ? ` (${noLeidosGestion})` : ''}`, icono: MessageCircle },
            { id: 'vinculacion', etiqueta: 'Vinculación', icono: CheckCircle2 },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
              tab === t.id ? 'bg-white shadow text-indigo-800' : 'text-slate-500'
            }`}
          >
            <t.icono className="w-3.5 h-3.5" /> {t.etiqueta}
          </button>
        ))}
      </div>

      {tab === 'accesos' && (
        <TabAccesos
          inquilinos={inquilinos}
          contratos={contratos}
          inmuebles={inmuebles}
          dirContrato={dirContrato}
          informar={informar}
        />
      )}
      {tab === 'invitaciones' && (
        <TabInvitaciones
          currentUser={currentUser}
          contratos={contratos}
          invitaciones={invitaciones}
          dirContrato={dirContrato}
          informar={informar}
        />
      )}
      {tab === 'mensajes' && (
        <TabMensajes
          currentUser={currentUser}
          contratos={contratos}
          mensajes={mensajes}
          dirContrato={dirContrato}
          informar={informar}
        />
      )}
      {tab === 'vinculacion' && (
        <TabVinculacion
          contratos={contratos}
          inmuebles={inmuebles}
          incidencias={incidencias}
          dirContrato={dirContrato}
          informar={informar}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------- accesos
function TabAccesos({
  inquilinos, contratos, inmuebles, dirContrato, informar,
}: {
  inquilinos: UsuarioApp[];
  contratos: ContratoFormalizacion[];
  inmuebles: Inmueble[];
  dirContrato: (id: string) => string;
  informar: (m: string) => void;
}) {
  const [expandido, setExpandido] = useState<string | null>(null);

  const toggleBloqueo = async (u: UsuarioApp) => {
    const bloqueado = u.estado === 'BLOQUEADO';
    await saveUsuarioFirestore({ ...u, estado: bloqueado ? 'ACTIVO' : 'BLOQUEADO', updatedAt: new Date().toISOString() });
    informar(bloqueado ? `Acceso de ${u.nombre} desbloqueado.` : `Acceso de ${u.nombre} bloqueado.`);
  };

  const desvincular = async (u: UsuarioApp, contratoId: string) => {
    if (!window.confirm(`¿Desvincular el contrato ${dirContrato(contratoId)} de ${u.nombre}? Perderá el acceso.`)) return;
    const contrato = contratos.find((c) => c.id === contratoId);
    await saveUsuarioFirestore({
      ...u,
      contratoIds: (u.contratoIds || []).filter((id) => id !== contratoId),
      updatedAt: new Date().toISOString(),
    });
    if (contrato) await revocarAccesoContrato(contratoId, contrato.inmuebleId);
    informar('Contrato desvinculado y alcance revocado.');
  };

  if (inquilinos.length === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">Sin cuentas de inquilino. Crea una invitación para empezar.</p>;
  }

  return (
    <div className="space-y-2">
      {inquilinos.map((u) => (
        <article key={u.id} className="bg-white rounded-2xl border border-slate-200 p-4">
          <button onClick={() => setExpandido(expandido === u.id ? null : u.id)} className="w-full text-left cursor-pointer">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-extrabold">
                  {u.nombre} {u.apellidos || ''}
                </p>
                <p className="text-xs text-slate-500">{u.email}</p>
              </div>
              <span
                className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                  u.estado === 'BLOQUEADO' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {u.estado === 'BLOQUEADO' ? 'Bloqueado' : 'Activo'}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {(u.contratoIds || []).length === 0
                ? 'Sin contratos vinculados'
                : (u.contratoIds || []).map(dirContrato).join(' · ')}
            </p>
          </button>
          {expandido === u.id && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
              <p className="text-[11px] text-slate-500">
                Último acceso: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('es-ES') : '—'}
                {u.habitacionIdentificador ? ` · Habitación ${u.habitacionIdentificador}` : ''}
              </p>
              {(u.contratoIds || []).map((cid) => (
                <div key={cid} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2.5 py-2">
                  <span className="font-bold">{dirContrato(cid)}</span>
                  <button onClick={() => desvincular(u, cid)} className="text-red-600 font-bold cursor-pointer">
                    Desvincular
                  </button>
                </div>
              ))}
              <button
                onClick={() => toggleBloqueo(u)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl cursor-pointer ${
                  u.estado === 'BLOQUEADO' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                }`}
              >
                {u.estado === 'BLOQUEADO' ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                {u.estado === 'BLOQUEADO' ? 'Desbloquear acceso' : 'Bloquear acceso'}
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------- invitaciones
function TabInvitaciones({
  currentUser, contratos, invitaciones, dirContrato, informar,
}: {
  currentUser: UsuarioApp;
  contratos: ContratoFormalizacion[];
  invitaciones: EnlaceRegistro[];
  dirContrato: (id: string) => string;
  informar: (m: string) => void;
}) {
  const [contratoId, setContratoId] = useState('');
  const [caducidad, setCaducidad] = useState('');
  const [usos, setUsos] = useState(1);
  const [creando, setCreando] = useState(false);
  const [ultimoEnlace, setUltimoEnlace] = useState('');

  const crear = async () => {
    const contrato = contratos.find((c) => c.id === contratoId);
    if (!contrato) {
      informar('Selecciona un contrato.');
      return;
    }
    setCreando(true);
    try {
      const enlace = await crearInvitacionInquilino({
        contratoId: contrato.id,
        inmuebleId: contrato.inmuebleId,
        textoVisible: `Accede a tu portal · ${contrato.inmuebleDireccion}`,
        fechaCaducidad: caducidad ? new Date(`${caducidad}T23:59:59`).toISOString() : undefined,
        usosMaximos: usos,
        creadoPor: currentUser.email,
      });
      setUltimoEnlace(`${window.location.origin}${window.location.pathname}?registroInq=${enlace.id}`);
      setContratoId('');
      informar('Invitación creada y alcance concedido.');
    } finally {
      setCreando(false);
    }
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      informar('Enlace copiado.');
    } catch {
      /* noop */
    }
  };

  const revocar = async (e: EnlaceRegistro) => {
    if (!window.confirm('¿Revocar esta invitación? Se retirará el alcance de lectura concedido.')) return;
    await revocarInvitacionInquilino(e);
    informar('Invitación revocada.');
  };

  return (
    <div className="space-y-3">
      <section className="bg-white rounded-2xl border border-slate-200 p-4">
        <h3 className="text-sm font-extrabold flex items-center gap-1.5 mb-2">
          <Plus className="w-4 h-4 text-indigo-700" /> Nueva invitación
        </h3>
        <label className="block text-xs font-bold text-slate-600 mb-1">Contrato *</label>
        <select
          value={contratoId}
          onChange={(e) => setContratoId(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white mb-2"
        >
          <option value="">Selecciona…</option>
          {contratos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.inmuebleDireccion} · {c.candidatoNombre} ({c.estado})
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Caducidad</label>
            <input
              type="date"
              value={caducidad}
              onChange={(e) => setCaducidad(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Usos máx.</label>
            <input
              type="number"
              min={1}
              max={10}
              value={usos}
              onChange={(e) => setUsos(Number(e.target.value) || 1)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
            />
          </div>
        </div>
        <button
          onClick={crear}
          disabled={creando || !contratoId}
          className="w-full py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50"
        >
          {creando ? 'Creando…' : 'Crear invitación'}
        </button>
        {ultimoEnlace && (
          <div className="mt-2 flex items-center gap-2 bg-indigo-50 rounded-xl p-2.5">
            <span className="flex-1 text-[11px] font-mono break-all">{ultimoEnlace}</span>
            <button onClick={() => copiar(ultimoEnlace)} className="p-1.5 cursor-pointer" aria-label="Copiar enlace">
              <Copy className="w-4 h-4 text-indigo-700" />
            </button>
          </div>
        )}
      </section>

      {invitaciones.map((e) => (
        <article key={e.id} className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-extrabold">{e.contratoIdVinculado ? dirContrato(e.contratoIdVinculado) : '—'}</p>
              <p className="text-[11px] text-slate-500">
                Usos: {e.usosActuales}{e.usosMaximos ? `/${e.usosMaximos}` : ''} ·
                Caduca: {e.fechaCaducidad ? new Date(e.fechaCaducidad).toLocaleDateString('es-ES') : '—'}
              </p>
            </div>
            <span
              className={`text-[11px] font-bold px-2 py-1 rounded-full ${e.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}
            >
              {e.activo ? 'Activa' : 'Revocada'}
            </span>
          </div>
          {e.activo && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => copiar(`${window.location.origin}${window.location.pathname}?registroInq=${e.id}`)}
                className="flex-1 flex items-center justify-center gap-1 py-2 bg-slate-100 text-xs font-bold rounded-xl cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" /> Copiar enlace
              </button>
              <button
                onClick={() => revocar(e)}
                className="flex-1 flex items-center justify-center gap-1 py-2 bg-red-50 text-red-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                <X className="w-3.5 h-3.5" /> Revocar
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

// -------------------------------------------------------------- mensajes
function TabMensajes({
  currentUser, contratos, mensajes, dirContrato, informar,
}: {
  currentUser: UsuarioApp;
  contratos: ContratoFormalizacion[];
  mensajes: MensajePortal[];
  dirContrato: (id: string) => string;
  informar: (m: string) => void;
}) {
  const hilos = contratos.filter((c) => mensajes.some((m) => m.contratoId === c.id));
  const [hiloId, setHiloId] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const hilo = mensajes.filter((m) => m.contratoId === (hiloId || hilos[0]?.id)).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const contratoHilo = contratos.find((c) => c.id === (hiloId || hilos[0]?.id));

  useEffect(() => {
    const pendientes = hilo.filter((m) => m.remitenteRol === 'INQUILINO' && m.leidoPorGestion !== true);
    if (pendientes.length > 0) {
      Promise.all(pendientes.map((m) => marcarMensajeLeidoPorGestion(m.id).catch(() => undefined)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiloId, mensajes.length]);

  const enviar = async () => {
    if (!contratoHilo || texto.trim().length === 0 || texto.trim().length > 4000) return;
    setEnviando(true);
    try {
      await enviarMensajePortal({
        contratoId: contratoHilo.id,
        inmuebleId: contratoHilo.inmuebleId,
        remitenteUid: currentUser.authUid || currentUser.id,
        remitenteNombre: `${currentUser.nombre} (gestión)`,
        remitenteRol: 'GESTION',
        texto: texto.trim(),
      });
      setTexto('');
      informar('Mensaje enviado al inquilino.');
    } finally {
      setEnviando(false);
    }
  };

  if (hilos.length === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">Sin hilos de mensajes.</p>;
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs font-bold text-slate-600">Hilo por contrato</label>
      <select
        value={hiloId || hilos[0]?.id || ''}
        onChange={(e) => setHiloId(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
      >
        {hilos.map((c) => {
          const n = mensajes.filter((m) => m.contratoId === c.id && m.remitenteRol === 'INQUILINO' && m.leidoPorGestion !== true).length;
          return (
            <option key={c.id} value={c.id}>
              {dirContrato(c.id)}{n > 0 ? ` (${n} sin leer)` : ''}
            </option>
          );
        })}
      </select>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2 max-h-96 overflow-y-auto">
        {hilo.map((m) => (
          <div key={m.id} className={`flex ${m.remitenteRol === 'GESTION' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                m.remitenteRol === 'GESTION' ? 'bg-indigo-700 text-white' : 'bg-slate-100'
              }`}
            >
              <p className="font-bold text-[10px] opacity-80">{m.remitenteNombre}</p>
              <p className="whitespace-pre-wrap">{m.texto}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Responder al inquilino…"
          maxLength={4000}
          className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-xl"
        />
        <button
          onClick={enviar}
          disabled={enviando || texto.trim().length === 0}
          className="px-4 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl cursor-pointer disabled:opacity-50"
          aria-label="Enviar"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      <p className="flex items-center gap-1 text-[11px] text-slate-400">
        <Mail className="w-3 h-3" /> El hilo queda registrado como comunicación del contrato (sin borrado).
      </p>
    </div>
  );
}

// ----------------------------------------------------------- vinculación
function TabVinculacion({
  contratos, inmuebles, incidencias, dirContrato, informar,
}: {
  contratos: ContratoFormalizacion[];
  inmuebles: Inmueble[];
  incidencias: Incidencia[];
  dirContrato: (id: string) => string;
  informar: (m: string) => void;
}) {
  const [contratoId, setContratoId] = useState(contratos[0]?.id || '');
  const [trabajando, setTrabajando] = useState(false);
  const contrato = contratos.find((c) => c.id === (contratoId || contratos[0]?.id));
  const inmueble = inmuebles.find((v) => v.id === contrato?.inmuebleId);

  const incidenciasContrato = incidencias.filter(
    (i) => contrato && (i.contratoId === contrato.id || i.inmuebleId === contrato.inmuebleId)
  );
  const vinculadas = contrato ? (contrato.incidenciaIds || []).length : 0;
  const pendientes = contrato
    ? incidenciasContrato.filter((i) => !(contrato.incidenciaIds || []).includes(i.id))
    : [];

  const marcarActivo = async () => {
    if (!contrato || !inmueble) return;
    setTrabajando(true);
    try {
      await updateDoc(doc(db, 'inmuebles', inmueble.id), { contratoActivoId: contrato.id });
      informar('Contrato marcado como activo del inmueble (habilita fotos de lectura).');
    } finally {
      setTrabajando(false);
    }
  };

  const reConceder = async () => {
    if (!contrato) return;
    setTrabajando(true);
    try {
      await concederAccesoContrato(contrato.id, contrato.inmuebleId);
      informar('Alcance de lectura concedido (inmueble + suministros).');
    } finally {
      setTrabajando(false);
    }
  };

  const vincularPendientes = async () => {
    if (!contrato) return;
    setTrabajando(true);
    try {
      for (const inc of pendientes) {
        await vincularIncidenciaAContrato(contrato.id, inc.id);
        const visibles = Array.from(new Set([...(inc.contratoIdsVisibles || []), contrato.id]));
        await saveIncidenciaFirestore({ ...inc, contratoIdsVisibles: visibles });
      }
      informar(`${pendientes.length} incidencias vinculadas al índice del contrato.`);
    } finally {
      setTrabajando(false);
    }
  };

  if (!contrato) {
    return <p className="text-sm text-slate-500 py-6 text-center">Sin contratos.</p>;
  }

  const checks: { ok: boolean; texto: string }[] = [
    {
      ok: inmueble?.contratoActivoId === contrato.id,
      texto: `Contrato activo del inmueble: ${inmueble?.contratoActivoId === contrato.id ? 'sí' : 'no (las fotos de lectura exigen el activo)'}`,
    },
    {
      ok: (inmueble?.contratoIdsAutorizados || []).includes(contrato.id),
      texto: `Lectura del inmueble concedida: ${(inmueble?.contratoIdsAutorizados || []).includes(contrato.id) ? 'sí' : 'no'}`,
    },
    { ok: pendientes.length === 0, texto: `Incidencias vinculadas: ${vinculadas}/${incidenciasContrato.length}` },
  ];

  return (
    <div className="space-y-3">
      <label className="block text-xs font-bold text-slate-600">Contrato</label>
      <select
        value={contrato.id}
        onChange={(e) => setContratoId(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
      >
        {contratos.map((c) => (
          <option key={c.id} value={c.id}>
            {dirContrato(c.id)} · {c.candidatoNombre}
          </option>
        ))}
      </select>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
        {checks.map((c, i) => (
          <p key={i} className={`flex items-center gap-2 text-xs font-bold ${c.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
            <CheckCircle2 className="w-4 h-4" /> {c.texto}
          </p>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          onClick={marcarActivo}
          disabled={trabajando || inmueble?.contratoActivoId === contrato.id}
          className="py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-40"
        >
          Marcar activo
        </button>
        <button
          onClick={reConceder}
          disabled={trabajando}
          className="py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-40"
        >
          Conceder alcance
        </button>
        <button
          onClick={vincularPendientes}
          disabled={trabajando || pendientes.length === 0}
          className="py-2.5 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-xl cursor-pointer disabled:opacity-40"
        >
          Vincular incidencias ({pendientes.length})
        </button>
      </div>
      <p className="text-[11px] text-slate-400">
        El inquilino descubre incidencias, mensajes, suministros y lecturas mediante estos índices; la lectura
        directa sin concesión sigue denegada por reglas.
      </p>
    </div>
  );
}
