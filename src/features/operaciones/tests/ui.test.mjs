import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../../patrimonial/tests/tsx-loader.mjs',import.meta.url);
const React=await import('react');
const {renderToStaticMarkup}=await import('react-dom/server');
const {VistaOperaciones,filtrarOperaciones}=await import('../ui/view.tsx');
const {FormularioOperacion,instruccionEditor}=await import('../ui/panel.tsx');
const {datosFormulario,centimosFormulario}=await import('../ui/forms.ts');
const {base}=await import('./support.mjs');
const {ejecutarRecorridoFicticio}=await import('../demo/recorrido.mjs');
const {CONTEXTO_FICTICIO}=await import('../demo/fixtures.ts');
const callbacks=['crear','seleccionar','modificar','transicion','anotar','adjuntar','asociar'];
function view({cerrado=false,escritura=true,filtro='ABIERTAS',seleccion=null}={}){
  const estado=cerrado?ejecutarRecorridoFicticio().estado:base().estado,events=[];
  const props={estado,contexto:CONTEXTO_FICTICIO,hoy:'2026-09-26',filtro,busqueda:'',seleccion,escritura,acciones:Object.fromEntries(callbacks.map((k)=>[k,(...args)=>events.push([k,...args])])),onFiltro:(f)=>events.push(['filtro',f]),onBusqueda:(s)=>events.push(['buscar',s])};
  return {props,events,tree:VistaOperaciones(props)};
}
function nodes(node){if(node==null||typeof node==='boolean')return[];if(Array.isArray(node))return node.flatMap(nodes);if(typeof node!=='object')return[];if(typeof node.type==='function')return nodes(node.type(node.props));return [node,...nodes(node.props?.children)];}
const text=(node)=>renderToStaticMarkup(node);
test('UI SSR: lista, filtros, creación, documentación y advertencia de cobertura',()=>{
  const v=view(),html=text(v.tree);for(const s of ['Listado de operaciones','Incidencia','DIAGNOSTICO','PRESUPUESTO','FACTURA','GARANTIA','HISTORICO','no implican cobertura'])assert.ok(html.includes(s),s);
});
test('UI callbacks: crear incidencia y cambiar filtro no escriben por sí solos',()=>{
  const v=view();const buttons=nodes(v.tree).filter((n)=>n.type==='button');
  buttons.find((b)=>text(b).includes('Nueva/o Incidencia')).props.onClick();buttons.find((b)=>text(b)==='<button class="rounded px-3 py-2 bg-slate-100" aria-pressed="false">CERRADAS</button>')?.props.onClick();
  assert.equal(v.events[0][0],'crear');assert.equal(v.events[0][1],'incidencia');
  buttons.find((b)=>b.props.children==='CERRADAS').props.onClick();assert.deepEqual(v.events.at(-1),['filtro','CERRADAS']);
});
test('UI navegación a detalle y transición usa estados reales del motor',()=>{
  const v=view();const buttons=nodes(v.tree).filter((n)=>n.type==='button');buttons.find((b)=>text(b).includes('Lavadora ficticia no desagua')).props.onClick();assert.equal(v.events[0][0],'seleccionar');
  buttons.find((b)=>b.props.children==='EN_REVISION').props.onClick();assert.equal(v.events[1][0],'transicion');assert.equal(v.events[1][2],'EN_REVISION');
});
test('UI sólo lectura: todos los controles de modificación deshabilitados',()=>{
  const v=view({escritura:false});for(const b of nodes(v.tree).filter((n)=>n.type==='button'&&(/Nueva\/o|Diagnóstico \/ nota|Editar ficha|Asociar documento|EN_REVISION|CANCELADA/.test(text(n)))))assert.equal(b.props.disabled,true);
});
for(const [filtro,n]of [['ABIERTAS',1],['DIAGNOSTICO',1],['PRESUPUESTO',1],['REPARACION',1],['FACTURA',1],['GARANTIA',1],['CERRADAS',0]])test(`consulta UI ${filtro}`,()=>{const v=view();assert.equal(filtrarOperaciones(v.props.estado,v.props.contexto,filtro,v.props.hoy).length,n);});
test('detalle cerrado conserva diagnóstico, factura, autorización, documentos e histórico',()=>{
  const estado=ejecutarRecorridoFicticio().estado,seleccion=estado.entidades.find((e)=>e.tipo==='incidencia');const html=text(view({cerrado:true,filtro:'CERRADAS',seleccion}).tree);
  for(const s of ['Detalle del expediente','CERRADA','DIAGNOSTICO','APROBADO','ASOCIAR_FACTURA','VINCULAR_DOCUMENTO','Actor:'])assert.ok(html.includes(s),s);
});
test('formulario SSR muestra referencias explícitas y motivo obligatorio',()=>{
  const html=renderToStaticMarkup(React.createElement(FormularioOperacion,{editor:{modo:'CREAR',tipo:'averia'},entidades:base().estado.entidades,seleccion:null,ocupado:false,onGuardar(){},onCancelar(){}}));
  for(const s of ['Incidencia','Equipo','Síntomas','Motivo','Guardar con auditoría','required'])assert.ok(html.includes(s),s);
});
test('editor: creación produce comando del dominio, sin actor/propietario inventado',()=>{
  const i=instruccionEditor({modo:'CREAR',tipo:'incidencia'},{fecha:'2026-09-26',descripcion:'Aviso',prioridad:'MEDIA',origen:'PROPIETARIO',alcance:'INMUEBLE'},'2026-09-26T12:00:00.000Z','i-ui');
  assert.equal(i.accion,'CREAR');assert.equal(i.id,'i-ui');assert.equal(i.datos.propietarioId,undefined);assert.equal(i.actor,undefined);
});
test('editor: diagnóstico, transición y documento no generan otro modelo',()=>{
  const entidad=base().estado.entidades.find((e)=>e.tipo==='averia');
  assert.equal(instruccionEditor({modo:'ANOTAR',tipo:'averia',entidad},{clase:'DIAGNOSTICO',texto:'Comprobado'},'', '').accion,'ANOTAR');
  assert.equal(instruccionEditor({modo:'ESTADO',tipo:'averia',entidad,estado:'EN_DIAGNOSTICO'},{},'','').estado,'EN_DIAGNOSTICO');
  assert.equal(instruccionEditor({modo:'DOCUMENTO',tipo:'averia',entidad},{documentoId:'doc-1'},'','').documentoId,'doc-1');
});
test('importes de formulario conservan cero y céntimos exactos; rechazan redondeos ocultos',()=>{
  assert.equal(centimosFormulario('0'),0);assert.equal(centimosFormulario('10.01'),1001);assert.throws(()=>centimosFormulario('10.001'));assert.throws(()=>centimosFormulario('-1'));
});
test('documento: procedencia externa/póliza opaca y fecha original explícita, sin cobertura inferida',()=>{
  const d=datosFormulario('documento',{archivoId:'archivo',nombreArchivo:'condiciones.pdf',mimeType:'application/pdf',fechaArchivo:'2025-01-01T00:00:00.000Z',categoria:'OTRO',descripcion:'Condiciones originales',sistemaExterno:'POLIZAS_B',referenciaExterna:'poliza-ref'},'2026-09-26T00:00:00.000Z');
  assert.equal(d.archivo.fechaSubida,'2025-01-01T00:00:00.000Z');assert.equal(d.referenciaExterna.referenciaExterna,'poliza-ref');assert.equal(d.cobertura,undefined);
});
test('edición de presupuesto preserva los múltiples conceptos originales, sin colapsarlos',async()=>{
  const {valoresEntidad}=await import('../ui/forms.ts');
  const e={...base().estado.entidades.find((x)=>x.tipo==='presupuesto'),conceptos:[{descripcion:'Pieza',importeCentimos:7000},{descripcion:'Trabajo',importeCentimos:5000}]};
  const valores=valoresEntidad(e);const i=instruccionEditor({modo:'MODIFICAR',tipo:'presupuesto',entidad:e},{...Object.fromEntries(['referencia','proveedorId','fecha','importeEuros','conceptosTexto'].map((k)=>[k,valores[k]])),referencia:'P-CORREGIDO'},'2026-09-26T00:00:00.000Z','');
  assert.deepEqual(i.cambios,{referencia:'P-CORREGIDO'});
});
test('error de guardado visible dentro del diálogo; cancelar posible con reintento pendiente',()=>{
  // El editor incorpora el hook accesible de diálogo (BLOQUE 10 · UX-5/6), así que se
  // renderiza con React —igual que el resto de la suite— en lugar de invocarlo como
  // función suelta: llamar a un componente con hooks fuera de un render es ilegal.
  const html=renderToStaticMarkup(React.createElement(FormularioOperacion,{editor:{modo:'ESTADO',tipo:'incidencia',estado:'EN_REVISION'},entidades:[],seleccion:null,ocupado:false,bloqueado:true,error:'Sin confirmación',onGuardar(){},onCancelar(){}}));
  assert.ok(html.includes('Sin confirmación'),'el error de guardado se muestra dentro del diálogo');
  const guardar=html.match(/<button[^>]*type="submit"[^>]*>/);
  const cancelar=html.match(/<button[^>]*type="button"[^>]*>/);
  assert.ok(guardar&&guardar[0].includes('disabled'),'guardar queda bloqueado con reintento pendiente');
  assert.ok(cancelar&&!cancelar[0].includes('disabled'),'cancelar sigue disponible');
});
