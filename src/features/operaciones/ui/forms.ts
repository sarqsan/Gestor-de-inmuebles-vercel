import type { DatosPorTipo, EntidadOperativa, InstruccionOperativa, TipoEntidad } from '../contracts.ts';
export type Campo = { clave: string; etiqueta: string; tipo?: 'date' | 'number' | 'textarea' | 'email'; opciones?: readonly string[]; referencia?: TipoEntidad; requerido?: boolean };
const c = (clave: string, etiqueta: string, extra: Partial<Campo> = {}): Campo => ({ clave, etiqueta, ...extra });
const ref = (clave: string, etiqueta: string, referencia: TipoEntidad, requerido = false) => c(clave, etiqueta, { referencia, requerido });
const fecha = (clave = 'fecha', etiqueta = 'Fecha', requerido = true) => c(clave, etiqueta, { tipo: 'date', requerido });
const desc = c('descripcion', 'Descripción', { tipo: 'textarea', requerido: true });
export const NOMBRES: Record<TipoEntidad, string> = { incidencia: 'Incidencia', averia: 'Avería', reparacion: 'Reparación', proveedor: 'Proveedor', equipo: 'Equipo', garantia: 'Garantía', presupuesto: 'Presupuesto', factura: 'Factura', documento: 'Documento' };
export const CAMPOS_FORMULARIO: Record<TipoEntidad, readonly Campo[]> = {
  incidencia: [fecha(), desc, c('prioridad', 'Prioridad', { opciones: ['BAJA','MEDIA','ALTA','URGENTE'], requerido: true }), c('origen','Origen', { requerido: true }), c('alcance','Alcance', { opciones: ['INMUEBLE','ZONAS_COMUNES','MANTENIMIENTO_GENERAL'], requerido: true }), c('responsable','Responsable'), c('contratoId','ID de contrato existente (opcional)'), c('inquilinoId','ID del arrendatario existente (opcional)'), ref('equipoId','Equipo','equipo'), ref('proveedorId','Proveedor','proveedor')],
  averia: [ref('incidenciaId','Incidencia','incidencia',true), ref('equipoId','Equipo','equipo'), desc, c('sintomas','Síntomas (uno por línea)',{ tipo:'textarea', requerido:true }), fecha(), ref('proveedorId','Proveedor','proveedor'), ref('garantiaId','Garantía documentada','garantia')],
  reparacion: [ref('incidenciaId','Incidencia','incidencia',true), ref('averiaId','Avería','averia'), ref('equipoId','Equipo','equipo'), desc, ref('proveedorId','Ejecutor','proveedor',true), ref('presupuestoId','Presupuesto','presupuesto'), fecha('fechaPrevista','Fecha prevista',false), fecha('fechaInicio','Fecha de inicio',false), fecha('fechaFin','Fecha final',false), c('costeEuros','Coste final EUR (cero es válido)',{tipo:'number'}), c('materiales','Materiales: descripción | cantidad, uno por línea',{tipo:'textarea'}), c('resultado','Resultado comprobado',{tipo:'textarea'})],
  proveedor: [c('nombre','Nombre',{requerido:true}), c('servicios','Servicios (uno por línea)',{tipo:'textarea',requerido:true}), c('email','Email',{tipo:'email'}), c('telefono','Teléfono'), c('referenciaExterna','Referencia externa'), c('activo','Activo',{opciones:['SI','NO'],requerido:true})],
  equipo: [c('tipoEquipo','Tipo de equipo',{requerido:true}), c('marca','Marca'), c('modelo','Modelo'), c('numeroSerie','Número de serie'), c('instalacion','Ubicación / instalación'), fecha('fechaAdquisicion','Adquisición',false), fecha('fechaInstalacion','Instalación',false)],
  garantia: [ref('equipoId','Equipo','equipo',true), fecha('inicio','Inicio',false), fecha('vencimiento','Vencimiento',false), ref('proveedorId','Proveedor','proveedor'), c('fabricante','Fabricante'), c('referenciaCompra','Referencia de compra'), c('condiciones','Condiciones aportadas (no implican cobertura)',{tipo:'textarea'})],
  presupuesto: [ref('incidenciaId','Incidencia','incidencia',true), ref('averiaId','Avería','averia'), ref('reparacionId','Reparación','reparacion'), ref('proveedorId','Proveedor','proveedor',true), fecha(), c('referencia','Referencia completa / serie / año',{requerido:true}), c('importeEuros','Importe final EUR',{tipo:'number',requerido:true}), c('conceptosTexto','Conceptos finales: descripción | EUR (uno por línea, máximo 10 en Firestore)',{tipo:'textarea',requerido:true})],
  factura: [ref('proveedorId','Proveedor','proveedor',true), fecha(), c('referencia','Referencia completa de factura',{requerido:true}), c('importeEuros','Importe final EUR',{tipo:'number',requerido:true}), c('conceptosTexto','Conceptos finales: descripción | EUR (uno por línea, máximo 10 en Firestore)',{tipo:'textarea',requerido:true}), c('origen','Procedencia',{requerido:true})],
  documento: [c('archivoId','ID del archivo existente',{requerido:true}), c('nombreArchivo','Nombre del archivo',{requerido:true}), c('mimeType','MIME',{requerido:true}), c('fechaArchivo','Fecha original del archivo (UTC ISO, con milisegundos)',{requerido:true}), c('sistemaExterno','Procedencia externa / sistema de pólizas (opcional)'), c('referenciaExterna','Referencia externa de póliza/expediente (no acredita cobertura)'), c('storagePath','Ruta/referencia existente (sin URL inventada)'), c('categoria','Categoría',{opciones:['FOTO','PRESUPUESTO','FACTURA','GARANTIA','PARTE','COMUNICACION','OTRO'],requerido:true}), desc],
};
const INMUTABLES = ['incidenciaId','averiaId','equipoId','contratoId','inquilinoId','reparacionId'];
export function camposEdicion(tipo: TipoEntidad) { return CAMPOS_FORMULARIO[tipo].filter((f) => !INMUTABLES.includes(f.clave)); }
const lineas = (s = '') => s.split('\n').map((x) => x.trim()).filter(Boolean);
const opcionales = (v: Record<string, string>) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ''));
export function centimosFormulario(s: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('Importe inválido: usa euros con hasta dos decimales, sin separadores de miles.');
  const [euros, cents = ''] = s.split('.'); const n = Number(euros) * 100 + Number(cents.padEnd(2,'0'));
  if (!Number.isSafeInteger(n)) throw new Error('Importe fuera de rango.'); return n;
}
export function datosFormulario(tipo: TipoEntidad, values: Record<string,string>, ahora: string): DatosPorTipo[TipoEntidad] {
  const v = opcionales(values); delete v.motivo;
  if (tipo === 'proveedor') { const {email,telefono,servicios,activo,...rest} = v; return { ...rest, nombre:v.nombre, servicios:lineas(servicios), activo:activo==='SI', contacto:{...(email?{email}:{}),...(telefono?{telefono}:{})} }; }
  if (tipo === 'averia') return { ...v, sintomas:lineas(v.sintomas) } as unknown as DatosPorTipo['averia'];
  if (tipo === 'reparacion') {
    const {costeEuros,materiales,...rest} = v;
    return { ...rest, moneda:'EUR', ...(costeEuros !== undefined ? {costeCentimos:centimosFormulario(costeEuros)}:{}), materiales:lineas(materiales).map((l) => {const [descripcion,cantidad] = l.split('|'); return {descripcion:descripcion.trim(),cantidad:Number(cantidad)};}) } as unknown as DatosPorTipo['reparacion'];
  }
  if (tipo === 'presupuesto' || tipo === 'factura') {
    const {importeEuros,conceptosTexto,incidenciaId,averiaId,reparacionId} = v;
    const importeCentimos = centimosFormulario(importeEuros);
    const conceptos = lineas(conceptosTexto).map((l)=>{const partes=l.split('|');if(partes.length!==2)throw new Error('Cada concepto necesita descripción | importe EUR.');return {descripcion:partes[0].trim(),importeCentimos:centimosFormulario(partes[1].trim())};});
    if (conceptos.length > 10) throw new Error('El transporte Firestore admite máximo 10 conceptos por registro; no se truncan datos. Conserva el documento original.');
    const base = {proveedorId:v.proveedorId,fecha:v.fecha,referencia:v.referencia,moneda:'EUR' as const,importeCentimos,conceptos};
    return tipo==='factura'?{...base,origen:v.origen,vinculo:null}:{...base,vinculo:{incidenciaId,...(averiaId?{averiaId}:{}),...(reparacionId?{reparacionId}:{})}};
  }
  if (tipo === 'documento') {
    const {archivoId,nombreArchivo,mimeType,storagePath,fechaArchivo,sistemaExterno,referenciaExterna,...rest}=v;
    if (!!sistemaExterno !== !!referenciaExterna) throw new Error('La referencia externa exige sistema y referencia explícitos.');
    return { ...rest, ...(sistemaExterno?{referenciaExterna:{sistemaExterno,referenciaExterna}}:{}), archivo:{id:archivoId,nombreArchivo,mimeType,fechaSubida:fechaArchivo,...(storagePath?{storagePath}:{})} } as DatosPorTipo['documento'];
  }
  return v as unknown as DatosPorTipo[TipoEntidad];
}
export function valoresEntidad(e: EntidadOperativa): Record<string,string> {
  const v: Record<string,string> = {};
  for (const [k,val] of Object.entries(e)) if (typeof val==='string') v[k]=val;
  if(e.tipo==='proveedor'){v.activo=e.activo?'SI':'NO';v.servicios=e.servicios.join('\n');v.email=e.contacto.email??'';v.telefono=e.contacto.telefono??'';}
  if(e.tipo==='averia')v.sintomas=e.sintomas.join('\n');
  if(e.tipo==='reparacion'){v.materiales=e.materiales.map((m)=>`${m.descripcion} | ${m.cantidad}`).join('\n');if(e.costeCentimos!==undefined)v.costeEuros=(e.costeCentimos/100).toFixed(2);}
  if(e.tipo==='presupuesto'||e.tipo==='factura'){v.importeEuros=(e.importeCentimos/100).toFixed(2);v.conceptosTexto=e.conceptos.map((c)=>`${c.descripcion} | ${(c.importeCentimos/100).toFixed(2)}`).join('\n');}
  return v;
}
export function instruccionFormulario(tipo: TipoEntidad, id: string, values: Record<string,string>, ahora: string, anterior?: EntidadOperativa): InstruccionOperativa {
  const datos = datosFormulario(tipo, values, ahora);
  if (!anterior) return {accion:'CREAR',tipo,id,datos} as InstruccionOperativa;
  const cambios = Object.fromEntries(Object.entries(datos).filter(([k,val]) => !INMUTABLES.includes(k) && k!=='vinculo' && JSON.stringify(val)!==JSON.stringify(anterior[k as keyof typeof anterior])));
  return {accion:'MODIFICAR',tipo,id,cambios} as InstruccionOperativa;
}
