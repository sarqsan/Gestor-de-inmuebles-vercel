import React, { useState } from 'react';
import type { EnlaceRegistro, Inmueble, Propietario, UsuarioApp } from '../../types';
import { invitarCarteraFirestore, prepararOnboardingPropietarioFirestore, resolverInvitacionCarteraFirestore } from '../../lib/onboardingCarterasFirebase';

export function OnboardingCarterasAdmin({ propietarios, usuarios, inmuebles }: { propietarios: Propietario[]; usuarios: UsuarioApp[]; inmuebles: Inmueble[] }) {
  const [owner, setOwner] = useState(''), [nombre, setNombre] = useState(''), [email, setEmail] = useState('');
  const [sinCuenta, setSinCuenta] = useState(false), [gestor, setGestor] = useState('');
  const [parcial, setParcial] = useState(true), [scope, setScope] = useState<string[]>([]);
  const [permiso, setPermiso] = useState<'LECTURA'|'LECTURA_ESCRITURA'>('LECTURA');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [enlace, setEnlace] = useState<EnlaceRegistro|null>(null);
  // Preserve IDs across failures; explicit new operation resets them.
  const [op, setOp] = useState(() => ({ owner: crypto.randomUUID(), enlace: crypto.randomUUID() }));
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true);setError('');setStatus('');
    try {
      if (gestor && parcial && !scope.length) throw new Error('Selecciona al menos un inmueble para alcance parcial');
      const o = propietarios.find(x => x.id === owner);
      const alta = await prepararOnboardingPropietarioFirestore({ propietarioId: owner || op.owner, nombre: o?.nombre || nombre, email, sinCuenta });
      if (sinCuenta) { setStatus(`Persona ${alta.personaId} vinculada a propietario ${alta.propietarioId}. Sin cuenta Auth ni delegación.`); return; }
      const link = await invitarCarteraFirestore({ enlaceId: op.enlace, propietarioId: alta.propietarioId, usuarioId: alta.usuarioId!, gestorUsuarioId: gestor || undefined,
        inmuebleIds: gestor && parcial ? scope : [], permiso });
      setEnlace(link); setStatus('Invitación creada. Ningún acceso delegado hasta la aceptación.');
    } catch(e) { setError(e instanceof Error ? e.message : 'Error de persistencia'); }
    finally {setBusy(false);}
  }
  async function resolver(decision:'REVOCADA'|'EXPIRADA') {
    if (!enlace || busy) return;setBusy(true);setError('');
    try {await resolverInvitacionCarteraFirestore(enlace.id, decision);setEnlace({...enlace,estadoInvitacion:decision,activo:false});setStatus(`Invitación ${decision}`);}
    catch(e){setError(e instanceof Error?e.message:'No se pudo resolver');}finally{setBusy(false);}
  }
  const input = 'mt-1 block w-full rounded border border-slate-300 bg-white p-2';
  return <section className="mb-6 rounded-xl border bg-white p-6" aria-label="Alta e invitación de cartera">
    <h2 className="text-xl font-bold">Alta e invitación de cartera</h2>
    <p className="mt-2 text-sm text-slate-600">Reutiliza Persona y propietario. La delegación no modifica la titularidad. La operación se puede reintentar sin duplicar entidades.</p>
    <form onSubmit={enviar} className="mt-5 grid gap-4 md:grid-cols-2">
      <label>Propietario<select className={input} value={owner} onChange={e=>{setOwner(e.target.value);setScope([]);}} disabled={busy||!!enlace}><option value="">Nuevo propietario</option>{propietarios.map(o=><option key={o.id} value={o.id}>{o.nombre}</option>)}</select></label>
      {!owner && <label>Nombre<input className={input} required value={nombre} onChange={e=>setNombre(e.target.value)} /></label>}
      <label className="flex items-center gap-2"><input type="checkbox" checked={sinCuenta} onChange={e=>setSinCuenta(e.target.checked)} />Propietario sin cuenta</label>
      {!sinCuenta && <><label>Correo del titular<input className={input} type="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label>
        <label>Gestor<select className={input} value={gestor} onChange={e=>setGestor(e.target.value)}><option value="">Sin delegación (solo cuenta)</option>{usuarios.filter(u=>u.estado==='ACTIVO'&&u.roles?.includes('GESTOR_PATRIMONIAL')).map(u=><option key={u.id} value={u.id}>{u.nombre}</option>)}</select></label>
        {gestor && <><label>Alcance<select className={input} value={parcial?'PARCIAL':'COMPLETA'} onChange={e=>setParcial(e.target.value==='PARCIAL')}><option value="PARCIAL">Solo inmuebles seleccionados</option><option value="COMPLETA">Cartera completa</option></select></label>
          <label>Permiso<select className={input} value={permiso} onChange={e=>setPermiso(e.target.value as typeof permiso)}><option value="LECTURA">Lectura</option><option value="LECTURA_ESCRITURA">Lectura y escritura</option></select></label>
          {parcial && <fieldset className="rounded border p-3"><legend>Inmuebles incluidos</legend>{inmuebles.filter(i=>i.propietarioId===owner).map(i=><label key={i.id} className="block"><input type="checkbox" checked={scope.includes(i.id)} onChange={e=>setScope(e.target.checked?[...scope,i.id]:scope.filter(x=>x!==i.id))} /> {i.id} — {i.descripcion}</label>)}{!owner&&<p className="text-sm">Selecciona un propietario con inmuebles para delegar parcialmente.</p>}</fieldset>}
        </>}
      </>}
      <button disabled={busy||!!enlace} className="rounded bg-indigo-700 px-4 py-2 text-white disabled:opacity-50">{busy?'Guardando…':sinCuenta?'Vincular sin cuenta':'Preparar e invitar'}</button>
    </form>
    {error&&<p role="alert" className="mt-4 rounded bg-amber-50 p-3">{error}. Reintenta con los mismos datos.</p>}
    {status&&<p role="status" className="mt-4 rounded bg-emerald-50 p-3">{status}</p>}
    {enlace&&<div className="mt-4 space-y-3"><p>Estado: {enlace.estadoInvitacion}</p><a className="break-all text-indigo-700 underline" href={`/?cartera=${encodeURIComponent(enlace.id)}`}>{window.location.origin}/?cartera={enlace.id}</a><p className="text-sm">Comparte este enlace con el destinatario; no se envía correo automáticamente.</p>
      {enlace.estadoInvitacion==='PENDIENTE'&&<div className="flex gap-3"><button disabled={busy} onClick={()=>void resolver('REVOCADA')}>Revocar invitación</button><button disabled={busy || (enlace.fechaCaducidadMs || 0)>Date.now()} onClick={()=>void resolver('EXPIRADA')}>Marcar expirada</button></div>}
    </div>}
    {(enlace||status)&&<button className="mt-4 text-sm text-indigo-700" onClick={()=>{setEnlace(null);setStatus('');setOp({owner:crypto.randomUUID(),enlace:crypto.randomUUID()});}}>Nueva operación</button>}
  </section>;
}
