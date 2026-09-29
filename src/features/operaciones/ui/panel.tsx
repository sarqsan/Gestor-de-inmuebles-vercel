import React, { useEffect, useRef, useState } from 'react';
import type { AmbitoOperacion, ComandoOperativo, EntidadOperativa, InstruccionOperativa, TipoEntidad } from '../contracts.ts';
import type { RepositorioOperativo } from '../persistence/repository.ts';
import { ejecutarOperacion } from '../service.ts';
import { permitido, type IdentidadCanonica } from '../persistence/authorization.ts';
import { CAMPOS_FORMULARIO, camposEdicion, instruccionFormulario, NOMBRES, valoresEntidad, type Campo } from './forms.ts';
import { VistaOperaciones, type Filtro } from './view.tsx';
import { useDialogoAccesible } from '../../../accesibilidad/dialogo';
export type Editor = { modo: 'CREAR'|'MODIFICAR'|'ANOTAR'|'ESTADO'|'DOCUMENTO'|'FACTURA'; tipo: TipoEntidad; entidad?: EntidadOperativa; estado?: string };
export function instruccionEditor(editor: Editor, values: Record<string,string>, fecha: string, id: string): InstruccionOperativa {
  const e=editor.entidad;
  if(editor.modo==='CREAR'||editor.modo==='MODIFICAR')return instruccionFormulario(editor.tipo,e?.id??id,values,fecha,e);
  if(!e)throw new Error('Falta la entidad.');
  if(editor.modo==='ANOTAR')return {accion:'ANOTAR',tipo:e.tipo,id:e.id,clase:values.clase as 'DIAGNOSTICO',texto:values.texto};
  if(editor.modo==='ESTADO')return {accion:'CAMBIAR_ESTADO',tipo:e.tipo,id:e.id,estado:editor.estado!} as InstruccionOperativa;
  if(editor.modo==='DOCUMENTO')return {accion:'VINCULAR_DOCUMENTO',tipo:e.tipo,id:e.id,documentoId:values.documentoId} as InstruccionOperativa;
  return {accion:'ASOCIAR_FACTURA',tipo:'factura',id:e.id,vinculo:{incidenciaId:values.incidenciaId,...(values.averiaId?{averiaId:values.averiaId}:{}),...(values.reparacionId?{reparacionId:values.reparacionId}:{})},...(values.presupuestoId?{presupuestoId:values.presupuestoId}:{})};
}
function camposEditor(editor:Editor): readonly Campo[]{
  if(editor.modo==='CREAR')return CAMPOS_FORMULARIO[editor.tipo];
  if(editor.modo==='MODIFICAR')return camposEdicion(editor.tipo);
  if(editor.modo==='ANOTAR')return [{clave:'clase',etiqueta:'Clase',opciones:['DIAGNOSTICO','ACTUACION','COMUNICACION','NOTA'],requerido:true},{clave:'texto',etiqueta:'Contenido',tipo:'textarea',requerido:true}];
  if(editor.modo==='DOCUMENTO')return [{clave:'documentoId',etiqueta:'Documento existente de este inmueble',referencia:'documento',requerido:true}];
  if(editor.modo==='FACTURA')return ['incidencia','averia','reparacion','presupuesto'].map((t)=>({clave:`${t}Id`,etiqueta:NOMBRES[t],referencia:t as TipoEntidad,requerido:t==='incidencia'}));
  return [];
}
export function FormularioOperacion({editor,entidades,seleccion,ocupado,bloqueado,error,onGuardar,onCancelar}:{editor:Editor;entidades:readonly EntidadOperativa[];seleccion:EntidadOperativa|null;ocupado:boolean;bloqueado?:boolean;error?:string;onGuardar:(values:Record<string,string>)=>void;onCancelar:()=>void}){
  // UX-6 §11/§12: el editor de operaciones mantiene el foco dentro y se cierra con Escape
  // (misma acción que el botón Cancelar; la operación y sus validaciones no cambian).
  const { refDialogo, propsDialogo } = useDialogoAccesible(
    { abierto: true, onCerrar: onCancelar, cerrableConEscape: !ocupado },
    undefined,
    'op-editor-titulo'
  );
  const initial=editor.entidad?valoresEntidad(editor.entidad):{fecha:new Date().toISOString().slice(0,10),activo:'SI',origen:'MANUAL',prioridad:'MEDIA',alcance:'INMUEBLE',clase:'DIAGNOSTICO'};
  if(!editor.entidad&&seleccion){if(seleccion.tipo==='incidencia')initial.incidenciaId=seleccion.id;else if('incidenciaId'in seleccion)initial.incidenciaId=seleccion.incidenciaId;if('equipoId'in seleccion&&seleccion.equipoId)initial.equipoId=seleccion.equipoId;}
  return <div ref={refDialogo} {...propsDialogo} className="fixed inset-0 z-50 overflow-auto bg-slate-900/50 p-4"><form className="mx-auto max-w-2xl rounded-xl bg-white p-6 space-y-4" onSubmit={(ev)=>{ev.preventDefault();onGuardar(Object.fromEntries(new FormData(ev.currentTarget).entries()) as Record<string,string>);}}>
    {error&&<p role="alert" className="rounded bg-red-50 p-3 text-red-900">{error}</p>}
    <h2 id="op-editor-titulo" className="text-xl font-bold">{editor.modo} · {NOMBRES[editor.tipo]} {editor.estado??''}</h2>
    <p className="text-sm text-slate-600">Datos explícitos. Sin cargas de archivos, inferencias de cobertura ni autorización automática. Las referencias deben pertenecer al mismo inmueble.</p>
    {camposEditor(editor).map((f)=><label className="block text-sm font-medium" key={f.clave}>{f.etiqueta}{f.requerido?' *':''}
      {f.referencia||f.opciones?<select className="block w-full rounded border p-2" name={f.clave} required={f.requerido} defaultValue={initial[f.clave]??''}><option value="">Seleccionar explícitamente</option>{f.opciones?.map((v)=><option key={v}>{v}</option>)}{f.referencia&&entidades.filter((e)=>e.tipo===f.referencia).map((e)=><option value={e.id} key={e.id}>{'nombre'in e?e.nombre:'descripcion'in e?e.descripcion:'referencia'in e?e.referencia:e.id} · {e.id}</option>)}</select>
      :f.tipo==='textarea'?<textarea className="block w-full rounded border p-2" name={f.clave} rows={3} defaultValue={initial[f.clave]??''} required={f.requerido}/>
      :<input className="block w-full rounded border p-2" name={f.clave} type={f.tipo??'text'} min={f.tipo==='number'?0:undefined} step={f.tipo==='number'?'0.01':undefined} defaultValue={initial[f.clave]??''} required={f.requerido}/>}</label>)}
    <label className="block">Motivo / procedencia de la operación *<textarea className="block w-full rounded border p-2" name="motivo" required rows={2}/></label>
    <div className="flex gap-3"><button className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-40" disabled={ocupado||bloqueado} type="submit">Guardar con auditoría</button><button type="button" disabled={ocupado} onClick={onCancelar}>Cancelar</button></div>
  </form></div>;
}
type PanelProps = {identidadActual?:IdentidadCanonica;repositorio:RepositorioOperativo;ambito:AmbitoOperacion;onVolver:()=>void};
export const PanelOperaciones: React.FC<PanelProps> = ({repositorio,ambito,onVolver,identidadActual}:PanelProps) => {
  const [datos,setDatos]=useState<Awaited<ReturnType<RepositorioOperativo['cargar']>>|null>(null);
  const [error,setError]=useState(''),[mensaje,setMensaje]=useState(''),[ocupado,setOcupado]=useState(false);
  const [filtro,setFiltro]=useState<Filtro>('ABIERTAS'),[busqueda,setBusqueda]=useState('');
  const [seleccion,setSeleccion]=useState<EntidadOperativa|null>(null),[editor,setEditor]=useState<Editor|null>(null);
  const [pendiente,setPendiente]=useState<ComandoOperativo|null>(null); const montado=useRef(true);
  useEffect(()=>{montado.current=true;let activo=true;setDatos(null);repositorio.cargar(ambito).then((d)=>{if(activo)setDatos(d);}).catch((e)=>{if(activo)setError(String(e.message??e));});return()=>{activo=false;montado.current=false;};},[repositorio,ambito.propietarioId,ambito.inmuebleId]);
  async function recargar(){setError('');try{const d=await repositorio.cargar(ambito);if(montado.current){setDatos(d);if(pendiente&&d.estado.historial.some((h)=>h.operacionId===pendiente.operacionId)){setPendiente(null);setEditor(null);setMensaje('Operación confirmada en el histórico.');}}}catch(e){if(montado.current)setError(String(e.message??e));}}
  async function enviar(cmd:ComandoOperativo){setOcupado(true);setError('');setPendiente(cmd);try{
    await repositorio.ejecutar(ambito,cmd);const d=await repositorio.cargar(ambito);
    if(montado.current){setDatos(d);setPendiente(null);setEditor(null);setMensaje('Guardado confirmado: entidad e histórico auditado.');setSeleccion(d.estado.entidades.find((e)=>e.tipo===cmd.tipo&&e.id===cmd.id)??null);}
  }catch(e){if(montado.current){setError(String(e.message??e));if(['permission-denied','failed-precondition','aborted'].includes(e.code)||String(e.message).includes('CONFLICTO_REVISION'))setPendiente(null);}}finally{if(montado.current)setOcupado(false);}}
  function guardar(values:Record<string,string>){if(!datos||pendiente||ocupado||!escritura)return;try{
    const fecha=new Date().toISOString(),id=crypto.randomUUID();const instruccion=instruccionEditor(editor!,values,fecha,id);
    const cmd={...instruccion,actor:datos.identidad.uid,fecha,motivo:values.motivo,operacionId:crypto.randomUUID(),revisionEsperada:datos.estado.revision} as ComandoOperativo;
    const preview=ejecutarOperacion(datos.estado,datos.contexto,cmd);if(preview.ok===false)throw new Error(`${preview.error.codigo}: ${preview.error.mensaje}`);
    void enviar(cmd);
  }catch(e){setError(String(e.message??e));}}
  const escritura=!!datos&&permitido(identidadActual??datos.identidad,ambito.propietarioId,true)&&!ocupado&&!pendiente;
  const actual=seleccion&&datos?datos.estado.entidades.find((e)=>e.tipo===seleccion.tipo&&e.id===seleccion.id)??null:null;
  const entidades=datos?.estado.entidades.filter((e)=>e.tipo==='proveedor'?e.propietarioId===ambito.propietarioId:e.ambito.inmuebleId===ambito.inmuebleId&&e.ambito.propietarioId===ambito.propietarioId)??[];
  return <section className="mx-auto max-w-6xl space-y-5 p-4"><header><button className="text-blue-700 underline" disabled={ocupado} onClick={onVolver}>← Volver al inmueble</button><h1 className="text-2xl font-bold mt-3">Operaciones · Incidencias y mantenimiento</h1><p>Inmueble {ambito.inmuebleId} · Propietario {ambito.propietarioId}</p><button className="underline" disabled={ocupado} onClick={()=>void recargar()}>Actualizar desde el servidor</button></header>
    {error&&<p role="alert" className="rounded bg-red-50 p-3 text-red-900">{error}</p>}{mensaje&&<p role="status">{mensaje}</p>}
    {pendiente&&<div className="rounded bg-amber-50 p-3">Hay una operación sin confirmar. El reintento conserva ID, actor y contenido; no crea un registro nuevo. <button disabled={ocupado} className="underline" onClick={()=>void enviar(pendiente)}>Reintentar la misma operación</button></div>}
    {!datos&&!error&&<p role="status">Cargando expediente autorizado…</p>}
    {datos&&<VistaOperaciones estado={datos.estado} contexto={datos.contexto} hoy={new Date().toISOString().slice(0,10)} {...{filtro,busqueda,escritura}} seleccion={actual} onFiltro={setFiltro} onBusqueda={setBusqueda} acciones={{crear:(tipo)=>setEditor({modo:'CREAR',tipo}),seleccionar:setSeleccion,modificar:(e)=>setEditor({modo:'MODIFICAR',tipo:e.tipo,entidad:e}),anotar:(e)=>setEditor({modo:'ANOTAR',tipo:e.tipo,entidad:e}),transicion:(e,estado)=>setEditor({modo:'ESTADO',tipo:e.tipo,entidad:e,estado}),adjuntar:(e)=>setEditor({modo:'DOCUMENTO',tipo:e.tipo,entidad:e}),asociar:(e)=>setEditor({modo:'FACTURA',tipo:e.tipo,entidad:e})}}/>}
    {editor&&<FormularioOperacion {...{editor,entidades}} seleccion={actual} ocupado={ocupado} bloqueado={!!pendiente||!escritura} error={error} onGuardar={guardar} onCancelar={()=>setEditor(null)}/>}
  </section>;
}
