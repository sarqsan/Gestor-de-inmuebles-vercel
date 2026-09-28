import React, { useEffect, useState } from 'react';
import type { UsuarioApp } from '../types';
import { cargarCarterasOnboarding } from '../lib/onboardingCarterasFirebase';
import { mensajeDeErrorUsuario } from '../feedback/mensajes';

export function CarterasOnboardingPanel({usuario}: {usuario: UsuarioApp}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof cargarCarterasOnboarding>>>([]);
  const [error, setError] = useState(''), [revision,setRevision] = useState(0), [busy,setBusy] = useState(true);
  useEffect(()=>{let vigente=true;setBusy(true);setData([]);setError('');
    cargarCarterasOnboarding(usuario).then(d=>{if(vigente)setData(d);}).catch(e=>{if(vigente)setError(mensajeDeErrorUsuario(e, 'Error de acceso'));}).finally(()=>{if(vigente)setBusy(false);});
    return ()=>{vigente=false;};
  },[usuario.id,revision]);
  return <details className="m-4 rounded-xl border bg-white p-4">
    <summary className="cursor-pointer font-semibold">Mis carteras delegadas</summary>
    <p className="mt-2 text-sm text-slate-500">Acceso verificado por relación vigente. Una delegación parcial solo alcanza sus inmuebles y los contratos, recibos y documentos vinculados a ellos. La escritura exige LECTURA_ESCRITURA con responsabilidad del gestor; el borrado de documentos sigue reservado al titular o la administración.</p>
    <button disabled={busy} onClick={()=>setRevision(n=>n+1)} className="mt-3 text-sm text-indigo-700">{busy?'Verificando…':'Actualizar acceso'}</button>
    {error&&<p role="alert" className="mt-3 text-amber-700">{error}. No se muestran datos sin autorización.</p>}
    {!busy&&!error&&!data.length&&<p className="mt-3 text-sm">No hay delegaciones vinculadas.</p>}
    {data.map(({gestion,inmuebles})=><section key={gestion.id} className="mt-4 rounded border p-3"><h3 className="font-semibold">Cartera {gestion.propietarioId}</h3>
      <p className="text-sm">{gestion.estado} · {gestion.inmuebleIds.length?'Parcial':'Completa'} · {gestion.permiso}</p>
      <ul className="mt-2 text-sm">{inmuebles.map(i=><li key={i.id}>{i.id} — {i.descripcion || 'Inmueble'}</li>)}</ul>
      {gestion.estado!=='ACTIVA'&&<p className="text-sm text-slate-500">Sin acceso operativo.</p>}
    </section>)}
  </details>;
}
