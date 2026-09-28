import { useMemo, useState } from 'react';
import type { EnlaceRegistro, UsuarioApp } from '../types';
import type { GestionCartera } from '../lib/gestionesCartera';
import { resumirOnboardingR02, type EstadoOnboardingR02 } from '../lib/roadmap02Onboarding';
import { mensajeDeErrorUsuario } from '../feedback/mensajes';

export interface OnboardingCarterasProps {
 usuario?: UsuarioApp | null; gestiones?: GestionCartera[]; invitaciones?: EnlaceRegistro[];
 errorFirestore?: string; onReintentar?: () => Promise<void>;
}
const labels = { CUENTA:'Cuenta/Auth', PERSONA:'Persona', PROPIETARIO:'Propietarios vinculados', INVITACION:'Invitación', ACCESO:'Acceso efectivo' } as const;

/** UI de recuperación y estado; solo muestra hechos confirmados por datos persistidos. */
export function OnboardingCarteras({ usuario, gestiones, invitaciones, errorFirestore, onReintentar }: OnboardingCarterasProps) {
 const [busy,setBusy]=useState(false); const [aviso,setAviso]=useState('');
 const estado: EstadoOnboardingR02 = useMemo(()=>resumirOnboardingR02({usuario,gestiones,enlace:invitaciones?.find(x=>x.id===usuario?.enlaceRegistroId),errorFirestore}),[usuario,gestiones,invitaciones,errorFirestore]);
 async function reintentar(){if(!onReintentar||busy)return;setBusy(true);setAviso('');try{await onReintentar();setAviso('Reintento completado. El estado se actualizará al sincronizar.');}catch(e){setAviso(`No se pudo completar. Conserva la sesión Auth e inténtalo de nuevo: ${mensajeDeErrorUsuario(e, 'error recuperable')}`);}finally{setBusy(false);}}
 return <section aria-label="Onboarding y carteras" className="rounded-xl border border-slate-200 bg-white p-6">
  <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Identidad y acceso</p><h2 className="mt-2 text-xl font-bold">Tu espacio y tus carteras</h2>
  <p className="mt-2 text-sm text-slate-600">El rol describe tu función; no concede acceso. Las carteras delegadas se limitan a las relaciones vigentes.</p>
  <ol className="mt-5 space-y-3">{(Object.keys(labels) as (keyof typeof labels)[]).map(k=><li key={k} className="flex justify-between rounded-lg bg-slate-50 p-3"><span>{labels[k]}</span><strong>{estado.pasos[k]==='COMPLETO'?'Confirmado':estado.pasos[k]==='RECUPERABLE'?'Pendiente de reintento':((k==='ACCESO'&&gestiones===undefined)||(k==='PERSONA'&&usuario?.personaId&&!invitaciones))?'Sin verificar':'Pendiente'}</strong></li>)}</ol>
  {estado.aviso&&<p role="alert" className="mt-4 rounded bg-amber-50 p-3 text-sm">{estado.aviso} No elimines ni recrees tu cuenta.</p>}
  {(errorFirestore||estado.aviso)&&onReintentar&&<button type="button" disabled={busy} onClick={reintentar} className="mt-4 rounded bg-indigo-700 px-4 py-2 text-white disabled:opacity-50">{busy?'Reintentando…':'Reintentar sincronización'}</button>}
  {aviso&&<p role="status" className="mt-3 text-sm">{aviso}</p>}
  {estado.propietarioIds.length>0&&<p className="mt-4 text-sm">Propietarios vinculados verificados: {estado.propietarioIds.length}.</p>}
 </section>;
}
