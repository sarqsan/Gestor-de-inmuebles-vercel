import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Inmueble } from '../../../types.ts';
import { db } from '../../../lib/firebase';
import { auth, googleSignIn } from '../../../lib/googleAuth';
import { COLECCION_USUARIOS_CANONICOS, COLECCION_BINDING_CANONICO, crearRepositorioFirebase } from '../persistence/firebase.ts';
import { proyectarIdentidad, type IdentidadCanonica } from '../persistence/authorization.ts';
import { PanelOperaciones } from './panel.tsx';

/** Entrada única desde inmueble; no arranca seeds, no crea cuentas patrimoniales ni permisos. */
export function OperacionesInmueble({inmueble,onVolver}:{inmueble:Inmueble;onVolver:()=>void}){
  const [identidad,setIdentidad]=useState<IdentidadCanonica|null>(null),[error,setError]=useState(''),[propietarioId,setPropietarioId]=useState('');
  const repositorio=useMemo(()=>crearRepositorioFirebase(db,auth),[]);
  useEffect(()=>{let vigente=true;let offEspejo=()=>{},offPerfil=()=>{};let generacion=0;
    const off=onAuthStateChanged(auth,(user)=>{
      offEspejo();offPerfil();setIdentidad(null);setPropietarioId('');generacion++;
      if(!user)return;
      offEspejo=onSnapshot(doc(db,COLECCION_BINDING_CANONICO,user.uid),(binding)=>{
        offPerfil();setIdentidad(null);const version=++generacion;
        const espejo=binding.data(),usuarioId=espejo?.usuarioId;
        if(!binding.exists()||typeof usuarioId!=='string'||!usuarioId||usuarioId.includes('/')){setError('No existe binding canónico válido. C no lo crea.');return;}
        offPerfil=onSnapshot(doc(db,COLECCION_USUARIOS_CANONICOS,usuarioId),(perfil)=>{
          if(!vigente||version!==generacion||auth.currentUser?.uid!==user.uid)return;
          try{setIdentidad(proyectarIdentidad(user.uid,espejo,perfil.exists()?perfil.data():undefined,user.email??''));setError('');}
          catch(e){setIdentidad(null);setError(String(e.message??e));}
        },(e)=>{if(vigente&&version===generacion){setIdentidad(null);setError(e.message);}});
      },(e)=>{if(vigente){offPerfil();setIdentidad(null);setError(e.message);}});
    });return()=>{vigente=false;generacion++;offPerfil();offEspejo();off();};},[]);
  const permitidos=identidad?[...new Set([...(identidad.propietarioId?[identidad.propietarioId]:[]),...identidad.carterasL,...(identidad.master?[inmueble.propietarioPrincipalId,inmueble.propietarioSecundarioId].filter((id):id is string=>typeof id==='string'&&!!id):[])])]:[];
  if(identidad&&propietarioId&&permitidos.includes(propietarioId))return <PanelOperaciones key={`${identidad.uid}:${propietarioId}:${inmueble.id}`} repositorio={repositorio} identidadActual={identidad} ambito={{propietarioId,inmuebleId:inmueble.id}} onVolver={onVolver}/>;
  return <section className="max-w-3xl space-y-5 rounded-xl border bg-white p-6"><button onClick={onVolver} className="underline text-blue-700">← Volver al inmueble</button><h1 className="text-2xl font-bold">Operaciones · {inmueble.direccion}</h1>
    {error&&<p role="alert">{error}</p>}
    {!identidad?<><p>Se requiere identidad autenticada y permiso patrimonial efectivo. Iniciar sesión no concede acceso a propietarios.</p><button className="rounded bg-blue-700 p-3 text-white" onClick={()=>void googleSignIn().catch((e)=>setError(String(e.message??e)))}>Iniciar sesión con Google</button></>:<>
      <p>Selecciona explícitamente el propietario del expediente. Las carteras históricas no conceden escritura. No se infiere titularidad desde el perfil local.</p>
      {permitidos.length===0&&<p role="status">La cuenta no aporta propietarioId ni carterasL canónicos. La administración canónica B/infraestructura debe resolver el acceso; C no puede concederlo.</p>}
      <div className="flex flex-wrap gap-3">{permitidos.map((id)=><button className="rounded border p-3 text-blue-800" key={id} onClick={()=>setPropietarioId(id)}>{id} · {[inmueble.propietarioPrincipalId,inmueble.propietarioSecundarioId].includes(id)?'Titularidad actual declarada':'Consulta contextual / histórica'}</button>)}</div>
    </>}
  </section>;
}
