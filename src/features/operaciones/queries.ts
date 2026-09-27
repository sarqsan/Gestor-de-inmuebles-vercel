import type { ContextoOperativo, EntidadOperativa, EstadoOperaciones, GarantiaEquipo, ReferenciaOperacion } from './contracts.ts';
import { flujoPara } from './service.ts';
import { exigir, fechaDia, mismoAmbito, obtener, validarContexto, visible } from './validation.ts';

const clave = (e: { tipo: string; id: string }) => `${e.tipo}:${e.id}`;
const orden = <T extends { id: string }>(items: readonly T[]): T[] => [...items].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function delInmueble(e: EntidadOperativa, ctx: ContextoOperativo): boolean { return e.tipo !== 'proveedor' && mismoAmbito(e.ambito, ctx.ambito); }
function deIncidencia(e: EntidadOperativa, id: string): boolean {
  if (e.tipo === 'incidencia') return e.id === id;
  if (e.tipo === 'averia' || e.tipo === 'reparacion') return e.incidenciaId === id;
  if (e.tipo === 'presupuesto' || e.tipo === 'factura') return e.vinculo?.incidenciaId === id;
  return false;
}
function delProveedor(e: EntidadOperativa, id: string): boolean {
  return e.tipo === 'proveedor' ? e.id === id : 'proveedorId' in e && e.proveedorId === id;
}

export function evaluarVigenciaGarantia(garantia: GarantiaEquipo, hoy: string) {
  fechaDia(hoy, 'hoy');
  const vigencia = !garantia.inicio || !garantia.vencimiento ? 'FECHAS_INCOMPLETAS'
    : hoy < garantia.inicio ? 'NO_INICIADA' : hoy > garantia.vencimiento ? 'VENCIDA' : 'VIGENTE_POR_FECHAS';
  return { vigencia, cobertura: 'NO_EVALUADA' as const, fuenteCobertura: 'DOCUMENTACION_ORIGINAL' as const,
    tieneDocumentacion: garantia.documentoIds.length > 0 };
}

/** Solo el ámbito solicitado; ningún query devuelve el snapshot entero. */
export function consultarCentroOperativo(estado: EstadoOperaciones, ctx: ContextoOperativo, opciones: { hoy: string; diasAvisoGarantia: number; limiteHistorial?: number }) {
  validarContexto(ctx); fechaDia(opciones.hoy, 'hoy');
  exigir(Number.isSafeInteger(opciones.diasAvisoGarantia) && opciones.diasAvisoGarantia >= 0 && opciones.diasAvisoGarantia <= 3660, 'DATO_INVALIDO', 'Horizonte entre 0 y 3660 días.');
  const limite = opciones.limiteHistorial ?? 20;
  exigir(Number.isSafeInteger(limite) && limite >= 0, 'DATO_INVALIDO', 'Límite de historial inválido.');
  const entidades = orden(estado.entidades.filter((e) => delInmueble(e, ctx)));
  const incidencias = entidades.filter((e) => e.tipo === 'incidencia');
  const averias = entidades.filter((e) => e.tipo === 'averia');
  const reparaciones = entidades.filter((e) => e.tipo === 'reparacion');
  const presupuestos = entidades.filter((e) => e.tipo === 'presupuesto');
  const facturas = entidades.filter((e) => e.tipo === 'factura');
  const garantias = entidades.filter((e) => e.tipo === 'garantia');
  const garantiasPorVencer = garantias.flatMap((g) => {
    if (!g.vencimiento) return [];
    const diasRestantes = (Date.parse(`${g.vencimiento}T00:00:00.000Z`) - Date.parse(`${opciones.hoy}T00:00:00.000Z`)) / 86400000;
    return diasRestantes >= 0 && diasRestantes <= opciones.diasAvisoGarantia
      ? [{ garantia: g, diasRestantes, ...evaluarVigenciaGarantia(g, opciones.hoy) }] : [];
  }).sort((a, b) => a.diasRestantes - b.diasRestantes || (a.garantia.id < b.garantia.id ? -1 : a.garantia.id > b.garantia.id ? 1 : 0));
  const historial = estado.historial.filter((h) => mismoAmbito(h.ambito, ctx.ambito)).sort((a, b) => b.revision - a.revision);
  return structuredClone({ ambito: ctx.ambito,
    incidenciasAbiertas: incidencias.filter((e) => !flujoPara(ctx, 'incidencia').terminales.includes(e.estado)),
    averiasPendientes: averias.filter((e) => !flujoPara(ctx, 'averia').terminales.includes(e.estado)),
    reparacionesActivas: reparaciones.filter((e) => !flujoPara(ctx, 'reparacion').terminales.includes(e.estado)),
    presupuestosPendientes: presupuestos.filter((e) => e.estado === 'PENDIENTE'),
    facturasSinAsociar: facturas.filter((e) => e.estado !== 'ANULADA' && e.vinculo === null),
    equipos: entidades.filter((e) => e.tipo === 'equipo'), garantiasPorVencer,
    ultimasActuaciones: historial.slice(0, limite), historial,
  });
}

export function consultarExpediente(estado: EstadoOperaciones, ctx: ContextoOperativo, referencia: ReferenciaOperacion) {
  validarContexto(ctx);
  const principal = obtener(estado, ctx, referencia.tipo, referencia.id);
  const scope = estado.entidades.filter((e) => delInmueble(e, ctx));
  const equipoDeActuacion = (e: EntidadOperativa | undefined): string | undefined => {
    if (!e) return undefined;
    if ('equipoId' in e && e.equipoId) return e.equipoId;
    if (e.tipo === 'averia' || e.tipo === 'reparacion') {
      const incidencia = scope.find((i) => i.tipo === 'incidencia' && i.id === e.incidenciaId);
      return incidencia?.tipo === 'incidencia' ? incidencia.equipoId : undefined;
    }
    return undefined;
  };
  const incidenciasEquipo = new Set(scope.flatMap((e) => equipoDeActuacion(e) === referencia.id
    ? e.tipo === 'incidencia' ? [e.id] : e.tipo === 'averia' || e.tipo === 'reparacion' ? [e.incidenciaId] : [] : []));
  const estaRelacionada = (e: EntidadOperativa): boolean => {
    if (clave(e) === clave(referencia)) return true;
    if (referencia.tipo === 'incidencia') return deIncidencia(e, referencia.id);
    if (referencia.tipo === 'proveedor') return delProveedor(e, referencia.id);
    if (referencia.tipo === 'equipo') {
      if (equipoDeActuacion(e) === referencia.id) return true;
      if (e.tipo === 'incidencia') return incidenciasEquipo.has(e.id);
      if (e.tipo === 'presupuesto' || e.tipo === 'factura') {
        if (!e.vinculo) return false;
        // Un vínculo específico a otra avería/reparación no se amplía a todo el inmueble.
        if (e.vinculo.reparacionId) return equipoDeActuacion(scope.find((r) => r.tipo === 'reparacion' && r.id === e.vinculo?.reparacionId)) === referencia.id;
        if (e.vinculo.averiaId) return equipoDeActuacion(scope.find((a) => a.tipo === 'averia' && a.id === e.vinculo?.averiaId)) === referencia.id;
        return incidenciasEquipo.has(e.vinculo.incidenciaId);
      }
    }
    if (referencia.tipo === 'averia') return (e.tipo === 'reparacion' && e.averiaId === referencia.id)
      || ((e.tipo === 'presupuesto' || e.tipo === 'factura') && (e.vinculo?.averiaId === referencia.id
        || scope.some((r) => r.tipo === 'reparacion' && r.averiaId === referencia.id && r.id === e.vinculo?.reparacionId)));
    if (referencia.tipo === 'reparacion') return (e.tipo === 'factura' || e.tipo === 'presupuesto') && e.vinculo?.reparacionId === referencia.id
      || (principal.tipo === 'reparacion' && e.tipo === 'presupuesto' && e.id === principal.presupuestoId);
    if (referencia.tipo === 'presupuesto') return (e.tipo === 'reparacion' || e.tipo === 'factura') && e.presupuestoId === referencia.id;
    if (referencia.tipo === 'garantia') return e.tipo === 'averia' && e.garantiaId === referencia.id;
    return false;
  };
  const relacionadas = scope.filter(estaRelacionada);
  const referencias = new Set([clave(referencia), ...relacionadas.map(clave)]);
  // Relacionar antes Y después evita perder facturas/garantías reasociadas en el historial
  // de un equipo, avería o proveedor, aunque su ficha actual ya no apunte a ese expediente.
  const historicoRelacionado = (e: EntidadOperativa | null): boolean => !!e && estaRelacionada(e);
  const eventosRelacionados = estado.historial.filter((h) => mismoAmbito(h.ambito, ctx.ambito)
    && (referencias.has(clave(h.referencia)) || historicoRelacionado(h.antes) || historicoRelacionado(h.despues)));
  const versiones = [...relacionadas, ...eventosRelacionados.flatMap((h) => h.antes ? [h.antes, h.despues] : [h.despues])];
  const documentosIds = new Set(versiones.flatMap((e) => e.tipo === 'proveedor' ? [] : e.documentoIds));
  const documentos = scope.filter((e) => e.tipo === 'documento' && documentosIds.has(e.id));
  const operaciones = new Set(eventosRelacionados.map((h) => h.operacionId));
  const documentosClave = new Set(documentos.map(clave));
  const historial = estado.historial.filter((h) => mismoAmbito(h.ambito, ctx.ambito)
    && (operaciones.has(h.operacionId) || documentosClave.has(clave(h.referencia))))
    .sort((a, b) => a.revision - b.revision);
  return structuredClone({ principal, relacionadas: orden(relacionadas.filter((e) => clave(e) !== clave(referencia))), documentos: orden(documentos), historial });
}

/** Proveedor compartido por inmuebles del MISMO propietario, filtrados por contexto explícito. */
export function consultarProveedor(estado: EstadoOperaciones, ctx: ContextoOperativo, proveedorId: string) {
  validarContexto(ctx);
  const proveedor = obtener(estado, ctx, 'proveedor', proveedorId);
  const ambitos = ctx.ambitosPermitidos.filter((a, index, all) => a.propietarioId === ctx.ambito.propietarioId
    && ctx.inmuebles.some((i) => i.id === a.inmuebleId) && all.findIndex((b) => mismoAmbito(a, b)) === index);
  const historial = estado.historial.filter((h) => ambitos.some((a) => mismoAmbito(a, h.ambito))
    && ((h.antes && delProveedor(h.antes, proveedorId)) || delProveedor(h.despues, proveedorId)));
  const actuaciones = orden(estado.entidades.filter((e) => e.tipo !== 'proveedor' && delProveedor(e, proveedorId)
    && ambitos.some((a) => visible(e, a))));
  const inmueblesRelacionados = [...new Set(historial.filter((h) => h.despues.tipo !== 'proveedor').map((h) => h.ambito.inmuebleId))].sort();
  return structuredClone({ proveedor, inmueblesRelacionados, actuaciones,
    presupuestos: actuaciones.filter((e) => e.tipo === 'presupuesto'), facturas: actuaciones.filter((e) => e.tipo === 'factura'), historial });
}
