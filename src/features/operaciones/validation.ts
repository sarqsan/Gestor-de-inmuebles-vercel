import type { AmbitoOperacion, ContextoOperativo, EntidadOperativa, EstadoOperaciones, TipoEntidad, VinculoActuacion } from './contracts.ts';

export class ErrorOperacion extends Error {
  readonly codigo: string;
  constructor(codigo: string, mensaje: string) { super(mensaje); this.codigo = codigo; }
}
export function exigir(condicion: unknown, codigo: string, mensaje: string): asserts condicion {
  if (!condicion) throw new ErrorOperacion(codigo, mensaje);
}
export function texto(valor: unknown, nombre: string): asserts valor is string {
  exigir(typeof valor === 'string' && valor.trim().length > 0, 'DATO_INVALIDO', `${nombre} no puede estar vacío.`);
}
export function fechaDia(valor: unknown, nombre: string): asserts valor is string {
  exigir(typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)
    && Number.isFinite(Date.parse(`${valor}T00:00:00.000Z`))
    && new Date(`${valor}T00:00:00.000Z`).toISOString().slice(0, 10) === valor, 'FECHA_INVALIDA', `${nombre}: fecha de calendario inválida.`);
}
export function instante(valor: unknown): asserts valor is string {
  exigir(typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(valor)
    && Number.isFinite(Date.parse(valor)) && new Date(valor).toISOString() === valor, 'FECHA_INVALIDA', 'Se requiere un instante UTC ISO explícito.');
}
export function mismoAmbito(a: AmbitoOperacion, b: AmbitoOperacion): boolean {
  return a.inmuebleId === b.inmuebleId && a.propietarioId === b.propietarioId;
}
export function validarContexto(ctx: ContextoOperativo): void {
  texto(ctx.ambito.inmuebleId, 'inmuebleId'); texto(ctx.ambito.propietarioId, 'propietarioId');
  exigir(ctx.ambitosPermitidos.some((a) => mismoAmbito(a, ctx.ambito)), 'AMBITO_NO_PERMITIDO', 'El contexto no permite este par propietario/inmueble.');
  exigir(ctx.inmuebles.filter((i) => i.id === ctx.ambito.inmuebleId).length === 1, 'REFERENCIA_INVALIDA', 'Inmueble ausente o ambiguo.');
  exigir(ctx.propietarios.filter((p) => p.id === ctx.ambito.propietarioId).length === 1, 'REFERENCIA_INVALIDA', 'Propietario ausente o ambiguo.');
}
export function visible(entidad: EntidadOperativa, ambito: AmbitoOperacion): boolean {
  return entidad.tipo === 'proveedor' ? entidad.propietarioId === ambito.propietarioId : mismoAmbito(entidad.ambito, ambito);
}
export function obtener<T extends TipoEntidad>(estado: EstadoOperaciones, ctx: ContextoOperativo, tipo: T, id: string): Extract<EntidadOperativa, { tipo: T }> {
  texto(id, `${tipo}Id`);
  const matches = estado.entidades.filter((e) => e.tipo === tipo && e.id === id);
  exigir(matches.length === 1, 'REFERENCIA_INVALIDA', `Referencia ${tipo} ausente o duplicada.`);
  const entidad = matches[0];
  exigir(visible(entidad, ctx.ambito), 'AISLAMIENTO', 'La referencia pertenece a otro propietario/inmueble.');
  return entidad as Extract<EntidadOperativa, { tipo: T }>;
}
export function validarVinculo(estado: EstadoOperaciones, ctx: ContextoOperativo, v: VinculoActuacion): void {
  claves(v, ['incidenciaId', 'averiaId', 'reparacionId']);
  obtener(estado, ctx, 'incidencia', v.incidenciaId);
  if (v.averiaId !== undefined) exigir(obtener(estado, ctx, 'averia', v.averiaId).incidenciaId === v.incidenciaId, 'RELACION_INCOHERENTE', 'La avería no pertenece a la incidencia.');
  if (v.reparacionId !== undefined) {
    const r = obtener(estado, ctx, 'reparacion', v.reparacionId);
    exigir(r.incidenciaId === v.incidenciaId && (v.averiaId === undefined || r.averiaId === v.averiaId), 'RELACION_INCOHERENTE', 'La reparación no corresponde al vínculo.');
  }
}
export function claves(objeto: unknown, permitidas: readonly string[]): void {
  exigir(objeto !== null && typeof objeto === 'object' && !Array.isArray(objeto)
    && (Object.getPrototypeOf(objeto) === Object.prototype || Object.getPrototypeOf(objeto) === null), 'DATO_INVALIDO', 'Se esperaba un objeto de datos plano.');
  exigir(Object.keys(objeto).every((key) => permitidas.includes(key)), 'CAMPO_NO_ADMITIDO', 'Se intentó cambiar un campo fuera del contrato.');
}
export const CAMPOS: Readonly<Record<TipoEntidad, readonly string[]>> = {
  incidencia: ['fecha', 'descripcion', 'prioridad', 'origen', 'alcance', 'contratoId', 'inquilinoId', 'responsable', 'proveedorId', 'equipoId'],
  averia: ['incidenciaId', 'equipoId', 'descripcion', 'sintomas', 'fecha', 'proveedorId', 'garantiaId'],
  reparacion: ['incidenciaId', 'averiaId', 'equipoId', 'descripcion', 'proveedorId', 'presupuestoId', 'fechaPrevista', 'fechaInicio', 'fechaFin', 'costeCentimos', 'moneda', 'materiales', 'resultado'],
  proveedor: ['nombre', 'servicios', 'contacto', 'referenciaExterna', 'activo'],
  equipo: ['tipoEquipo', 'marca', 'modelo', 'numeroSerie', 'fechaAdquisicion', 'fechaInstalacion', 'instalacion'],
  garantia: ['equipoId', 'inicio', 'vencimiento', 'proveedorId', 'fabricante', 'condiciones', 'referenciaCompra'],
  presupuesto: ['vinculo', 'proveedorId', 'fecha', 'referencia', 'moneda', 'importeCentimos', 'conceptos'],
  factura: ['proveedorId', 'fecha', 'referencia', 'moneda', 'importeCentimos', 'conceptos', 'origen', 'vinculo', 'presupuestoId'],
  documento: ['archivo', 'categoria', 'descripcion', 'referenciaExterna'],
};
export function centimos(valor: unknown): void {
  exigir(Number.isSafeInteger(valor) && (valor as number) >= 0, 'IMPORTE_INVALIDO', 'El importe debe ser un entero seguro no negativo en céntimos.');
}
function listaTexto(valor: unknown, nombre: string): void {
  exigir(Array.isArray(valor) && valor.length > 0, 'DATO_INVALIDO', `${nombre} necesita al menos un elemento.`);
  valor.forEach((v) => texto(v, nombre));
}
function mismoTrabajo(a: VinculoActuacion, b: VinculoActuacion): boolean {
  return a.incidenciaId === b.incidenciaId && (!a.averiaId || a.averiaId === b.averiaId)
    && (!a.reparacionId || a.reparacionId === b.reparacionId);
}
export function validarEntidad(entidad: EntidadOperativa, estado: EstadoOperaciones, ctx: ContextoOperativo): void {
  const e = entidad;
  // Todos los IDs relacionales se comprueban con el mismo ámbito antes de utilizarlos.
  if (e.tipo === 'reparacion' || e.tipo === 'presupuesto' || e.tipo === 'factura') obtener(estado, ctx, 'proveedor', e.proveedorId);
  else if ('proveedorId' in e && e.proveedorId !== undefined) obtener(estado, ctx, 'proveedor', e.proveedorId);
  if (e.tipo === 'garantia') obtener(estado, ctx, 'equipo', e.equipoId);
  else if ('equipoId' in e && e.equipoId !== undefined) obtener(estado, ctx, 'equipo', e.equipoId);
  if ('presupuestoId' in e && e.presupuestoId !== undefined) texto(e.presupuestoId, 'presupuestoId');
  if ('averiaId' in e && e.averiaId !== undefined) texto(e.averiaId, 'averiaId');
  if (e.tipo === 'incidencia' || e.tipo === 'averia' || e.tipo === 'reparacion' || e.tipo === 'documento') texto(e.descripcion, 'descripción');
  if (e.tipo === 'incidencia' || e.tipo === 'averia' || e.tipo === 'presupuesto' || e.tipo === 'factura') fechaDia(e.fecha, 'fecha');
  if (e.tipo === 'incidencia') {
    exigir(['BAJA', 'MEDIA', 'ALTA', 'URGENTE'].includes(e.prioridad), 'DATO_INVALIDO', 'Prioridad inválida.');
    exigir(['INMUEBLE', 'ZONAS_COMUNES', 'MANTENIMIENTO_GENERAL'].includes(e.alcance), 'DATO_INVALIDO', 'Alcance inválido.');
    texto(e.origen, 'origen');
    if (e.responsable !== undefined) texto(e.responsable, 'responsable');
    if (e.contratoId !== undefined) {
      const contratos = ctx.contratos.filter((c) => c.id === e.contratoId);
      exigir(contratos.length === 1 && contratos[0].inmuebleId === ctx.ambito.inmuebleId, 'RELACION_ALQUILER_INVALIDA', 'Contrato de otro inmueble, ausente o ambiguo.');
      if (e.inquilinoId !== undefined) exigir(contratos[0].candidatoId === e.inquilinoId, 'RELACION_ALQUILER_INVALIDA', 'El arrendatario no corresponde al contrato.');
    }
    if (e.inquilinoId !== undefined) {
      const inquilinos = ctx.inquilinos.filter((i) => i.id === e.inquilinoId);
      exigir(inquilinos.length === 1 && inquilinos[0].inmuebleId === ctx.ambito.inmuebleId, 'RELACION_ALQUILER_INVALIDA', 'Arrendatario ausente, ambiguo o de otro inmueble.');
    }
  }
  if (e.tipo === 'averia' || e.tipo === 'reparacion') {
    const i = obtener(estado, ctx, 'incidencia', e.incidenciaId);
    if (i.equipoId !== undefined && e.equipoId !== undefined) exigir(i.equipoId === e.equipoId, 'RELACION_INCOHERENTE', 'Equipo distinto al de la incidencia.');
  }
  if (e.tipo === 'averia') {
    listaTexto(e.sintomas, 'síntomas');
    if (e.garantiaId !== undefined) {
      const garantia = obtener(estado, ctx, 'garantia', e.garantiaId);
      exigir(e.equipoId === garantia.equipoId, 'RELACION_INCOHERENTE', 'La garantía debe pertenecer al equipo afectado.');
    }
  }
  if (e.tipo === 'reparacion') {
    validarVinculo(estado, ctx, { incidenciaId: e.incidenciaId, ...(e.averiaId ? { averiaId: e.averiaId } : {}) });
    if (e.averiaId) {
      const a = obtener(estado, ctx, 'averia', e.averiaId);
      exigir(a.equipoId === undefined || e.equipoId === a.equipoId, 'RELACION_INCOHERENTE', 'La reparación debe identificar el equipo de la avería.');
    }
    exigir(e.moneda === 'EUR', 'MONEDA_NO_SOPORTADA', 'Este bloque no convierte monedas; usa EUR.');
    exigir(Array.isArray(e.materiales), 'DATO_INVALIDO', 'Materiales debe ser una lista.');
    for (const m of e.materiales) {
      claves(m, ['descripcion', 'cantidad']); texto(m.descripcion, 'material');
      exigir(Number.isFinite(m.cantidad) && m.cantidad > 0, 'DATO_INVALIDO', 'Cantidad de material inválida.');
    }
    for (const [campo, fecha] of [['prevista', e.fechaPrevista], ['inicio', e.fechaInicio], ['fin', e.fechaFin]]) if (fecha !== undefined) fechaDia(fecha, campo as string);
    if (e.fechaFin !== undefined) exigir(e.fechaInicio !== undefined && e.fechaInicio <= e.fechaFin, 'FECHA_INVALIDA', 'Fin anterior al inicio o inicio ausente.');
    if (e.costeCentimos !== undefined) centimos(e.costeCentimos);
    if (e.resultado !== undefined) texto(e.resultado, 'resultado de reparación');
    if (e.presupuestoId) {
      const p = obtener(estado, ctx, 'presupuesto', e.presupuestoId);
      exigir(p.proveedorId === e.proveedorId && mismoTrabajo(p.vinculo, { incidenciaId: e.incidenciaId, averiaId: e.averiaId, reparacionId: e.id }), 'RELACION_INCOHERENTE', 'Presupuesto de otro proveedor o actuación.');
      if (e.estado === 'EN_CURSO' || e.estado === 'FINALIZADA') exigir(p.estado === 'APROBADO', 'PRESUPUESTO_NO_APROBADO', 'El presupuesto vinculado no está aprobado.');
    }
    if (e.estado === 'EN_CURSO' || e.estado === 'FINALIZADA') {
      exigir(e.fechaInicio !== undefined, 'DATO_INVALIDO', 'Indica la fecha de inicio.');
    }
    if (e.estado === 'FINALIZADA') {
      texto(e.resultado, 'resultado de reparación'); exigir(e.fechaFin !== undefined && e.costeCentimos !== undefined, 'DATO_INVALIDO', 'El cierre necesita fecha final y coste explícito (puede ser cero).');
    }
  }
  if (e.tipo === 'proveedor') {
    texto(e.nombre, 'proveedor'); listaTexto(e.servicios, 'servicios'); claves(e.contacto, ['email', 'telefono']);
    for (const value of Object.values(e.contacto)) texto(value, 'contacto');
    exigir(typeof e.activo === 'boolean', 'DATO_INVALIDO', 'Indicador activo inválido.');
    if (e.referenciaExterna !== undefined) {
      texto(e.referenciaExterna, 'referencia externa');
      exigir(!estado.entidades.some((p) => p.tipo === 'proveedor' && p.id !== e.id && p.propietarioId === e.propietarioId && p.referenciaExterna === e.referenciaExterna), 'DUPLICADO', 'Proveedor con la misma referencia externa.');
    }
  }
  if (e.tipo === 'equipo') {
    texto(e.tipoEquipo, 'tipo de equipo');
    for (const v of [e.marca, e.modelo, e.numeroSerie, e.instalacion]) if (v !== undefined) texto(v, 'datos del equipo');
    if (e.fechaAdquisicion !== undefined) fechaDia(e.fechaAdquisicion, 'adquisición');
    if (e.fechaInstalacion !== undefined) fechaDia(e.fechaInstalacion, 'instalación');
    if (e.numeroSerie && e.marca && e.modelo) exigir(!estado.entidades.some((x) => x.tipo === 'equipo' && x.id !== e.id && x.ambito.propietarioId === e.ambito.propietarioId && x.marca === e.marca && x.modelo === e.modelo && x.numeroSerie === e.numeroSerie), 'DUPLICADO', 'Equipo con la misma marca, modelo y serie dentro del propietario.');
  }
  if (e.tipo === 'garantia') {
    if (e.inicio !== undefined) fechaDia(e.inicio, 'inicio de garantía');
    if (e.vencimiento !== undefined) fechaDia(e.vencimiento, 'vencimiento de garantía');
    exigir(!e.inicio || !e.vencimiento || e.inicio <= e.vencimiento, 'FECHA_INVALIDA', 'Vencimiento anterior al inicio.');
    for (const v of [e.fabricante, e.condiciones, e.referenciaCompra]) if (v !== undefined) texto(v, 'garantía');
  }
  if (e.tipo === 'presupuesto' || e.tipo === 'factura') {
    texto(e.referencia, 'referencia completa del documento económico');
    exigir(e.moneda === 'EUR', 'MONEDA_NO_SOPORTADA', 'Importes en EUR, sin conversión implícita.');
    centimos(e.importeCentimos);
    exigir(Array.isArray(e.conceptos) && e.conceptos.length > 0, 'IMPORTE_INVALIDO', 'Se necesitan conceptos.');
    let suma = 0;
    for (const c of e.conceptos) { claves(c, ['descripcion', 'importeCentimos']); texto(c.descripcion, 'concepto'); centimos(c.importeCentimos); suma += c.importeCentimos; }
    exigir(Number.isSafeInteger(suma) && suma === e.importeCentimos, 'IMPORTE_INVALIDO', 'Total distinto a la suma de conceptos. No se calculan impuestos.');
    exigir(e.tipo !== 'presupuesto' || e.vinculo !== null, 'RELACION_INCOHERENTE', 'Un presupuesto requiere una actuación.');
    if (e.vinculo !== null) validarVinculo(estado, ctx, e.vinculo);
    if (e.vinculo?.reparacionId) exigir(obtener(estado, ctx, 'reparacion', e.vinculo.reparacionId).proveedorId === e.proveedorId, 'RELACION_INCOHERENTE', 'Documento económico de otro proveedor que la reparación.');
    exigir(!estado.entidades.some((x) => (x.tipo === 'presupuesto' || x.tipo === 'factura') && x.tipo === e.tipo && x.id !== e.id && x.ambito.propietarioId === e.ambito.propietarioId && x.proveedorId === e.proveedorId && x.referencia === e.referencia), 'DUPLICADO', 'Referencia económica ya registrada para este propietario/proveedor.');
    if (e.tipo === 'factura') {
      texto(e.origen, 'origen de factura');
      if (e.presupuestoId) {
        const p = obtener(estado, ctx, 'presupuesto', e.presupuestoId);
        exigir(p.proveedorId === e.proveedorId && (!e.vinculo || mismoTrabajo(p.vinculo, e.vinculo)), 'RELACION_INCOHERENTE', 'Factura y presupuesto no corresponden.');
      }
    }
  }
  if (e.tipo === 'documento') {
    if (e.referenciaExterna !== undefined) { claves(e.referenciaExterna, ['sistemaExterno','referenciaExterna']); texto(e.referenciaExterna.sistemaExterno, 'sistema externo'); texto(e.referenciaExterna.referenciaExterna, 'referencia externa'); }
    claves(e.archivo, ['id', 'nombreArchivo', 'mimeType', 'fechaSubida', 'storagePath', 'tamañoBytes']);
    texto(e.archivo.id, 'archivoId'); texto(e.archivo.nombreArchivo, 'archivo'); texto(e.archivo.mimeType, 'mimeType'); instante(e.archivo.fechaSubida);
    if (e.archivo.storagePath !== undefined) texto(e.archivo.storagePath, 'referencia del archivo');
    if (e.archivo.tamañoBytes !== undefined) exigir(Number.isSafeInteger(e.archivo.tamañoBytes) && e.archivo.tamañoBytes >= 0, 'DATO_INVALIDO', 'Tamaño de archivo inválido.');
    exigir(['FOTO', 'PRESUPUESTO', 'FACTURA', 'GARANTIA', 'PARTE', 'COMUNICACION', 'OTRO'].includes(e.categoria), 'DATO_INVALIDO', 'Categoría documental inválida.');
    exigir(!estado.entidades.some((x) => x.tipo === 'documento' && x.id !== e.id && mismoAmbito(x.ambito, e.ambito) && x.archivo.id === e.archivo.id), 'DUPLICADO', 'Archivo ya referenciado; vincula el documento existente.');
  }
}
