import React, { useState } from 'react';
import type { EnlaceRegistro, UsuarioApp } from '../types';
import { aceptarOnboardingConCredenciales, autenticarInvitadoCartera, resolverInvitacionCarteraFirestore } from '../lib/onboardingCarterasFirebase';

export function InvitacionCarteraView({ enlaceId, onComplete, onCancel }: {
  enlaceId: string; onComplete: (usuario: UsuarioApp) => void; onCancel: () => void;
}) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [enlace, setEnlace] = useState<EnlaceRegistro | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [estado, setEstado] = useState('');
  const [usuario, setUsuario] = useState<UsuarioApp | null>(null);
  async function operar(accion: 'VER' | 'ACEPTAR' | 'RECHAZAR') {
    if (busy) return; setBusy(true); setError('');
    try {
      if (accion === 'VER') setEnlace(await autenticarInvitadoCartera(enlaceId, email, password));
      else if (accion === 'ACEPTAR') {
        setUsuario(await aceptarOnboardingConCredenciales(enlaceId, email, password));
        setEstado('ACEPTADA');
      } else {
        await autenticarInvitadoCartera(enlaceId, email, password);
        await resolverInvitacionCarteraFirestore(enlaceId, 'RECHAZADA'); setEstado('RECHAZADA');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la operación'); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-slate-100 p-6 flex items-center justify-center">
    <section className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-sm" aria-label="Invitación de cartera">
      <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">RentSelect · Invitación privada</p>
      <h1 className="mt-3 text-2xl font-bold">Vincula tu cuenta y tu cartera</h1>
      <p className="mt-3 text-sm text-slate-600">Primero autentica y verifica tu correo. La invitación solo será visible para su destinatario. Tu titularidad no cambia.</p>
      {!estado && <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); void operar('VER'); }}>
        <label className="block">Correo invitado<input className="mt-1 block w-full rounded border p-2" type="email" required autoComplete="email" value={email} onChange={e => {setEmail(e.target.value);setEnlace(null);}} /></label>
        <label className="block">Contraseña<input className="mt-1 block w-full rounded border p-2" type="password" required minLength={6} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button className="rounded bg-indigo-700 px-4 py-2 text-white disabled:opacity-50" disabled={busy}>{busy ? 'Comprobando…' : 'Consultar / verificar correo'}</button>
      </form>}
      {enlace && !estado && <div className="mt-5 rounded-xl border p-4">
        <h2 className="font-bold">Revisa antes de decidir</h2>
        <dl className="mt-2 text-sm space-y-2"><div>Estado: {enlace.estadoInvitacion}</div><div>Propietario: {enlace.propietarioIdVinculado}</div>
          <div>Persona: {enlace.personaIdVinculada}</div><div>Relación: {enlace.gestionId || 'Sin delegación'}</div>
          <div>Alcance: {enlace.gestionId ? enlace.alcanceInmuebleIds?.length ? enlace.alcanceInmuebleIds.join(', ') : 'Cartera completa' : 'Solo activar mi cuenta'}</div>
          <div>Permiso: {enlace.permisoGestion}</div><div>Caduca: {enlace.fechaCaducidad}</div></dl>
        <div className="mt-4 flex gap-3"><button disabled={busy} onClick={() => void operar('ACEPTAR')} className="rounded bg-indigo-700 px-4 py-2 text-white">Aceptar / recuperar operación</button>
        {enlace.estadoInvitacion === 'PENDIENTE' && <button disabled={busy} onClick={() => void operar('RECHAZAR')} className="rounded border px-4 py-2">Rechazar</button>}</div>
      </div>}
      {error && <p role="alert" className="mt-4 rounded bg-amber-50 p-3 text-sm">{error}. No borres ni recrees tu cuenta Auth; puedes reintentar aquí.</p>}
      {estado && <p role="status" className="mt-5 rounded bg-emerald-50 p-4">Invitación {estado}. {usuario ? 'Cuenta vinculada. Acceso sujeto a las relaciones vigentes.' : 'No se ha concedido acceso al gestor.'}</p>}
      {usuario && <button className="mt-4 rounded bg-indigo-700 px-4 py-2 text-white" onClick={() => onComplete(usuario)}>Entrar en mi espacio</button>}
      <button className="mt-5 block text-sm text-slate-500" onClick={onCancel}>Volver</button>
    </section>
  </main>;
}
