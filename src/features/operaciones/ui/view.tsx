import React from 'react';
import type { ContextoOperativo, EntidadOperativa, EstadoOperaciones, TipoEntidad } from '../contracts.ts';
import { consultarCentroOperativo, consultarExpediente, evaluarVigenciaGarantia } from '../queries.ts';
import { POLITICA_ESTADOS } from '../policies.ts';
import { NOMBRES } from './forms.ts';
export const FILTROS = ['ABIERTAS','DIAGNOSTICO','PRESUPUESTO','REPARACION','FACTURA','GARANTIA','CERRADAS','TODAS','HISTORICO'] as const;
export type Filtro = typeof FILTROS[number];
export function filtrarOperaciones(estado: EstadoOperaciones, ctx: ContextoOperativo, filtro: Filtro, hoy: string, texto=''): EntidadOperativa[] {
  const centro=consultarCentroOperativo(estado,ctx,{hoy,diasAvisoGarantia:30});
  const todas=estado.entidades.filter((e)=>e.tipo!=='proveedor'&&e.ambito.propietarioId===ctx.ambito.propietarioId&&e.ambito.inmuebleId===ctx.ambito.inmuebleId);
  let rows: EntidadOperativa[];
  switch(filtro){
    case 'ABIERTAS': rows=centro.incidenciasAbiertas;break;
    case 'DIAGNOSTICO': rows=centro.averiasPendientes.filter((e)=>['PENDIENTE','EN_DIAGNOSTICO'].includes(e.estado));break;
    case 'PRESUPUESTO': rows=centro.presupuestosPendientes;break;
    case 'REPARACION': rows=centro.reparacionesActivas;break;
    case 'FACTURA': rows=centro.facturasSinAsociar;break;
    case 'GARANTIA': rows=centro.garantiasPorVencer.map((g)=>g.garantia);break;
    case 'CERRADAS': rows=todas.filter((e)=>e.tipo==='incidencia'&&e.estado==='CERRADA');break;
    default: rows=todas;
  }
  return rows.filter((e)=>JSON.stringify(e).toLowerCase().includes(texto.toLowerCase()));
}
export interface AccionesVista {
  crear: (tipo: TipoEntidad)=>void; seleccionar:(e:EntidadOperativa)=>void; modificar:(e:EntidadOperativa)=>void;
  transicion:(e:EntidadOperativa,estado:string)=>void; anotar:(e:EntidadOperativa)=>void; adjuntar:(e:EntidadOperativa)=>void; asociar:(e:EntidadOperativa)=>void;
}
const titulo=(e:EntidadOperativa)=>'descripcion'in e?e.descripcion:'nombre'in e?e.nombre:'tipoEquipo'in e?`${e.tipoEquipo} ${e.marca??''} ${e.modelo??''}`:'referencia'in e?e.referencia:e.id;
type FichaProps = {e:EntidadOperativa;acciones:AccionesVista;escritura:boolean;hoy:string};
const Ficha: React.FC<FichaProps> = ({e,acciones,escritura,hoy}: FichaProps) => {
  const destinos='estado'in e?POLITICA_ESTADOS[e.tipo]?.transiciones[e.estado]??[]:[];
  return <article className="rounded-xl border border-slate-200 bg-white p-4 space-y-2" aria-label={`${NOMBRES[e.tipo]} ${e.id}`}>
    <div className="flex flex-wrap justify-between gap-2"><button className="text-left font-semibold text-blue-800 underline" onClick={()=>acciones.seleccionar(e)}>{NOMBRES[e.tipo]} · {titulo(e)}</button>{'estado'in e&&<strong className="rounded bg-slate-100 px-2 py-1 text-xs">{e.estado}</strong>}</div>
    <p className="text-xs text-slate-500">{e.id} · versión {e.version} · {e.actualizadoEn}</p>
    {e.tipo==='equipo'&&<p>Ubicación: {e.instalacion??'No consta'} · Adquisición: {e.fechaAdquisicion??'No consta'} · Serie: {e.numeroSerie??'No consta'}</p>}
    {e.tipo==='garantia'&&<p className="text-amber-800">{e.inicio??'Inicio desconocido'} → {e.vencimiento??'Vencimiento desconocido'} · {evaluarVigenciaGarantia(e,hoy).vigencia}. Cobertura NO EVALUADA. Consultar documentación original.</p>}
    {e.tipo==='proveedor'&&<p>{e.servicios.join(', ')} · {e.contacto.email} · {e.contacto.telefono} · {e.activo?'Activo':'Inactivo'}</p>}
    {(e.tipo==='presupuesto'||e.tipo==='factura')&&<p>{(e.importeCentimos/100).toFixed(2)} EUR · {e.referencia} · Proveedor {e.proveedorId}</p>}
    {e.tipo==='reparacion'&&<p>Ejecutor: {e.proveedorId} · Inicio: {e.fechaInicio??'Pendiente'} · Final: {e.fechaFin??'Pendiente'} · Coste: {e.costeCentimos===undefined?'No consta':`${(e.costeCentimos/100).toFixed(2)} EUR`} · Resultado: {e.resultado??'Pendiente'}</p>}
    {e.tipo==='documento'&&<p>{e.categoria}: {e.archivo.nombreArchivo} · Archivo {e.archivo.id} · Referencia: {e.archivo.storagePath??'Sin ruta aportada'} · {e.descripcion}</p>}
    {e.tipo==='documento'&&e.referenciaExterna&&<p>Procedencia: {e.referenciaExterna.sistemaExterno} · Referencia externa: {e.referenciaExterna.referenciaExterna}. Cobertura no evaluada.</p>}
    <div className="flex flex-wrap gap-2 text-sm">
      <button disabled={!escritura} onClick={()=>acciones.anotar(e)}>Diagnóstico / nota</button>
      {!['factura','documento'].includes(e.tipo)&&<button disabled={!escritura} onClick={()=>acciones.modificar(e)}>Editar ficha</button>}
      {!['proveedor','documento'].includes(e.tipo)&&<button disabled={!escritura} onClick={()=>acciones.adjuntar(e)}>Asociar documento</button>}
      {e.tipo==='factura'&&<button disabled={!escritura||e.estado==='ANULADA'} onClick={()=>acciones.asociar(e)}>Asociar actuación</button>}
      {destinos.map((s)=><button className="rounded border px-2 py-1 disabled:opacity-40" disabled={!escritura} key={s} onClick={()=>acciones.transicion(e,s)}>{s}</button>)}
    </div>
  </article>;
}
export function VistaOperaciones({estado,contexto,hoy,filtro,busqueda,seleccion,escritura,acciones,onFiltro,onBusqueda}:{estado:EstadoOperaciones;contexto:ContextoOperativo;hoy:string;filtro:Filtro;busqueda:string;seleccion:EntidadOperativa|null;escritura:boolean;acciones:AccionesVista;onFiltro:(f:Filtro)=>void;onBusqueda:(v:string)=>void}){
  const rows=filtrarOperaciones(estado,contexto,filtro,hoy,busqueda);
  const expediente=seleccion?consultarExpediente(estado,contexto,{tipo:seleccion.tipo,id:seleccion.id}):null;
  const equipoId=expediente&&'equipoId'in expediente.principal?expediente.principal.equipoId:undefined;
  const centro=consultarCentroOperativo(estado,contexto,{hoy,diasAvisoGarantia:30});
  const proveedores=estado.entidades.filter((e)=>e.tipo==='proveedor'&&e.propietarioId===contexto.ambito.propietarioId);
  return <div className="space-y-5">
    <p className="rounded bg-blue-50 p-3">{escritura?'Gestión habilitada para este ámbito.':'Solo lectura: no se pueden realizar cambios.'} Las garantías y pólizas no implican cobertura automática.</p>
    <nav aria-label="Crear registro operativo" className="flex flex-wrap gap-2">{Object.keys(NOMBRES).map((t)=><button className="rounded border bg-white px-3 py-2 disabled:opacity-40" disabled={!escritura} key={t} onClick={()=>acciones.crear(t as TipoEntidad)}>Nueva/o {NOMBRES[t]}</button>)}</nav>
    <label className="block">Buscar <input className="border rounded p-2" value={busqueda} onChange={(e)=>onBusqueda(e.target.value)}/></label>
    <nav aria-label="Consultas operativas" className="flex flex-wrap gap-2">{FILTROS.map((f)=><button className={`rounded px-3 py-2 ${filtro===f?'bg-blue-700 text-white':'bg-slate-100'}`} aria-pressed={filtro===f} key={f} onClick={()=>onFiltro(f)}>{f.replaceAll('_',' ')}</button>)}</nav>
    {filtro!=='HISTORICO'&&<section aria-label="Listado de operaciones" className="space-y-3">{rows.length===0?<p>No hay registros para esta consulta.</p>:rows.map((e)=><Ficha key={`${e.tipo}:${e.id}`} e={e} {...{acciones,escritura,hoy}}/>)}</section>}
    {expediente&&<section aria-label="Detalle del expediente" className="rounded-xl bg-slate-50 p-4 space-y-3"><h2 className="text-xl font-bold">Expediente · {titulo(expediente.principal)}</h2><p>Incidencia → Avería → Diagnóstico → Presupuesto → Autorización → Reparación → Factura → Documentación → Cierre</p>
      {[expediente.principal,...expediente.relacionadas,...expediente.documentos.filter((d)=>!expediente.relacionadas.some((e)=>e.tipo===d.tipo&&e.id===d.id))].map((e)=><Ficha key={`${e.tipo}:${e.id}`} e={e} {...{acciones,escritura,hoy}}/>)}
      {'equipoId'in expediente.principal&&expediente.principal.equipoId&&<button className="underline text-blue-700" onClick={()=>{const e=estado.entidades.find((x)=>x.tipo==='equipo'&&x.id===equipoId);if(e)acciones.seleccionar(e);}}>Consultar equipo, garantías y reparaciones históricas</button>}
    </section>}
    <details><summary>Proveedores profesionales ({proveedores.length})</summary><div className="space-y-3 py-3">{proveedores.map((e)=><Ficha key={e.id} e={e} {...{acciones,escritura,hoy}}/>)}</div></details>
    {(expediente||filtro==='HISTORICO')&&<section aria-label="Histórico"><h2 className="text-xl font-bold">Histórico · no editable</h2><ol className="space-y-3">{(expediente?.historial??[...centro.historial].reverse()).map((h)=><li key={h.operacionId} className="border-l-4 border-blue-200 pl-3"><strong>#{h.revision} {h.referencia.tipo} · {h.comando.accion}</strong><p>{h.fecha} · Actor: {h.actor} · {h.motivo}</p>{h.comando.accion==='ANOTAR'&&<p>{h.comando.clase}: {h.comando.texto}</p>}<details><summary>Antes / después y documento asociado</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({antes:h.antes,despues:h.despues},null,2)}</pre></details></li>)}</ol></section>}
  </div>;
}
