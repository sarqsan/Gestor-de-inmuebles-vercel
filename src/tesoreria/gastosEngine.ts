/**
 * BLOQUE B — Gastos del inmueble: importador desde trabajos finalizados + alta manual.
 * Todo gasto guarda su origen trazable (trabajoId/presupuestoId o 'manual').
 *
 * INTEGRACIÓN A (2026-09-20): el modelo oficial de gastos del ERP canónico es
 * `Gasto` (colección `gastos`, `src/utils/gastosEngine.ts`). `GastoInmueble`
 * (colección `gastos_inmuebles`) es la PROYECCIÓN DE LIQUIDACIÓN: añade conceptos
 * de tesorería que no existen en el modelo oficial (imputableA/pagadoPor/estado
 * 'liquidado'/liquidacionId). La importación desde el modelo oficial es
 * UNIDIRECCIONAL: `gastoDesdeGastoCanonico()`. No es un segundo motor de gastos:
 * la contabilidad oficial (P&L, fiscal, reporting) sigue en `gastos`.
 */
import type { Gasto, TrabajoProfesional } from '../types';
import { redondear2 } from './sepaUtils';
import type { EstadoGasto, GastoInmueble, ImputacionGasto, PagadoPor } from './tipos';

export const CATEGORIAS_GASTO = [
  'reparacion',
  'comunidad',
  'ibi',
  'seguro',
  'suministro',
  'administracion',
  'formalización',
  'otro',
] as const;

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Crea un gasto desde un trabajo profesional finalizado con coste real. */
export function gastoDesdeTrabajo(
  trabajo: TrabajoProfesional,
  opciones?: {
    categoria?: string;
    ivaPct?: number;
    pagadoPor?: PagadoPor;
    imputableA?: ImputacionGasto;
    proveedorNombre?: string;
    actor?: { id?: string; nombre?: string };
  },
): { ok: boolean; errores: string[]; gasto?: GastoInmueble } {
  const errores: string[] = [];
  // INTEGRACIÓN A: si el trabajo ya generó su Gasto oficial (puente canónico
  // trabajo → colección `gastos`, campo gastoId), NO se duplica el puente:
  // se importa desde el gasto canónico con gastoDesdeGastoCanonico().
  const gastoCanonicoId = (trabajo as { gastoId?: string }).gastoId;
  if (gastoCanonicoId) {
    return {
      ok: false,
      errores: [
        `El trabajo ya tiene gasto contable oficial (${gastoCanonicoId}). Importelo con gastoDesdeGastoCanonico() para evitar doble registro en la liquidación.`,
      ],
    };
  }
  const finalizado = trabajo.estado === 'FINALIZADO' || trabajo.estado === 'FINALIZADA';
  if (!finalizado) errores.push('El trabajo debe estar FINALIZADO para generar gasto');
  const total = Number(trabajo.importeFinal);
  if (!(total > 0)) errores.push('El trabajo no tiene coste real (importeFinal) registrado');
  if (!trabajo.propietarioId) errores.push('El trabajo no tiene propietario asignado');
  if (!trabajo.inmuebleId) errores.push('El trabajo no tiene inmueble asignado');
  if (errores.length > 0) return { ok: false, errores };

  const ivaPct = opciones?.ivaPct ?? 21;
  const base = redondear2(total / (1 + ivaPct / 100));
  const ivaImporte = redondear2(total - base);
  const ahora = new Date().toISOString();

  const gasto: GastoInmueble = {
    id: `gas_${trabajo.id}`,
    inmuebleId: trabajo.inmuebleId,
    inmuebleDireccion: trabajo.inmuebleDireccion,
    propietarioId: trabajo.propietarioId,
    trabajoId: trabajo.id,
    presupuestoId: trabajo.presupuestoId,
    categoria: opciones?.categoria || 'reparacion',
    concepto: `Reparación: ${trabajo.titulo}`,
    base,
    ivaPct,
    ivaImporte,
    total: redondear2(total),
    fechaGasto: (trabajo.fechaFinalizacion || ahora).slice(0, 10),
    pagadoPor: opciones?.pagadoPor || 'administracion',
    imputableA: opciones?.imputableA || 'propietario',
    estado: 'pendiente',
    facturaNumero: (trabajo as { facturaNumero?: string }).facturaNumero,
    proveedorNombre: opciones?.proveedorNombre || trabajo.profesionalNombre,
    notas: `Origen: trabajo profesional ${trabajo.id}${trabajo.incidenciaId ? ` (incidencia ${trabajo.incidenciaId})` : ''}`,
    creadoPor: opciones?.actor?.nombre,
    creadoPorId: opciones?.actor?.id,
    fechaCreacion: ahora,
    fechaActualizacion: ahora,
  };
  return { ok: true, errores: [], gasto };
}

/** Alta manual de gasto con cálculo de IVA. */
export function crearGastoManual(datos: {
  inmuebleId: string;
  inmuebleDireccion?: string;
  propietarioId: string;
  contratoId?: string;
  categoria: string;
  concepto: string;
  baseOtotal: number;
  esBaseSinIva: boolean;
  ivaPct: number;
  fechaGasto: string;
  pagadoPor: PagadoPor;
  imputableA: ImputacionGasto;
  facturaNumero?: string;
  proveedorNombre?: string;
  notas?: string;
  actor?: { id?: string; nombre?: string };
}): { ok: boolean; errores: string[]; gasto?: GastoInmueble } {
  const errores: string[] = [];
  if (!datos.inmuebleId) errores.push('Falta inmueble');
  if (!datos.propietarioId) errores.push('Falta propietario');
  if (!datos.concepto?.trim()) errores.push('Falta concepto');
  if (!(datos.baseOtotal > 0)) errores.push('El importe debe ser > 0');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fechaGasto || '')) errores.push('Fecha de gasto inválida (YYYY-MM-DD)');
  if (!(datos.ivaPct >= 0 && datos.ivaPct <= 100)) errores.push('IVA % inválido');
  if (errores.length > 0) return { ok: false, errores };

  const base = datos.esBaseSinIva ? redondear2(datos.baseOtotal) : redondear2(datos.baseOtotal / (1 + datos.ivaPct / 100));
  const ivaImporte = datos.esBaseSinIva ? redondear2((base * datos.ivaPct) / 100) : redondear2(datos.baseOtotal - base);
  const total = redondear2(base + ivaImporte);
  const ahora = new Date().toISOString();

  return {
    ok: true,
    errores: [],
    gasto: {
      id: uid('gas'),
      inmuebleId: datos.inmuebleId,
      inmuebleDireccion: datos.inmuebleDireccion,
      propietarioId: datos.propietarioId,
      contratoId: datos.contratoId,
      categoria: datos.categoria,
      concepto: datos.concepto.trim(),
      base,
      ivaPct: datos.ivaPct,
      ivaImporte,
      total,
      fechaGasto: datos.fechaGasto,
      pagadoPor: datos.pagadoPor,
      imputableA: datos.imputableA,
      estado: 'pendiente',
      facturaNumero: datos.facturaNumero,
      proveedorNombre: datos.proveedorNombre,
      notas: datos.notas,
      creadoPor: datos.actor?.nombre,
      creadoPorId: datos.actor?.id,
      fechaCreacion: ahora,
      fechaActualizacion: ahora,
    },
  };
}

/**
 * IMPORTADOR UNIDIRECCIONAL desde el modelo oficial `Gasto` (colección `gastos`
 * canónica) a la proyección de liquidación `GastoInmueble`.
 * Idempotente: id `gas_gasto_{gastoId}` — reimportar no duplica.
 * Mapeo: aCargoDe arrendador → imputableA propietario; arrendatario → inquilino.
 * El modelo oficial no registra quién pagó (pagadoPor): se toma el valor de
 * `opciones` o el conservado en la reimportación.
 */
export function gastoDesdeGastoCanonico(
  g: Gasto,
  previo?: GastoInmueble,
  opciones?: { pagadoPor?: PagadoPor; imputableA?: ImputacionGasto },
): { ok: boolean; errores: string[]; gasto?: GastoInmueble } {
  const errores: string[] = [];
  if (!g?.id) errores.push('Falta gasto canónico');
  if (!g.propietarioId) errores.push('El gasto canónico no tiene propietario');
  if (!g.inmuebleId) errores.push('El gasto canónico no tiene inmueble');
  const total = redondear2(Number(g.importe) || 0);
  if (!(total > 0)) errores.push('El gasto canónico no tiene importe positivo');
  if (errores.length > 0) return { ok: false, errores };

  const imputableA: ImputacionGasto =
    opciones?.imputableA ?? previo?.imputableA ?? (g.aCargoDe === 'arrendador' ? 'propietario' : 'inquilino');
  const ahora = new Date().toISOString();
  const estado: EstadoGasto = previo?.estado || (g.estado === 'PAGADO' ? 'pagado' : 'pendiente');

  const gasto: GastoInmueble = {
    id: `gas_gasto_${g.id}`,
    inmuebleId: g.inmuebleId,
    inmuebleDireccion: previo?.inmuebleDireccion,
    propietarioId: g.propietarioId,
    contratoId: g.contratoId,
    trabajoId: g.trabajoId || (g.origenId && g.origen === 'ORDEN_TRABAJO' ? g.origenId : undefined),
    presupuestoId: previo?.presupuestoId,
    categoria: (g.categoria || 'otro') as string,
    concepto: g.concepto || g.id,
    // El Gasto canónico guarda el total sin desglose IVA propio: se conserva
    // como base sin IVA (no se inventan porcentajes).
    base: total,
    ivaPct: 0,
    ivaImporte: 0,
    total,
    fechaGasto: (g.fechaDevengo || g.fechaPago || ahora).slice(0, 10),
    fechaPago: g.fechaPago,
    pagadoPor: opciones?.pagadoPor ?? previo?.pagadoPor ?? 'administracion',
    imputableA,
    estado,
    liquidacionId: previo?.liquidacionId,
    facturaNumero: previo?.facturaNumero,
    proveedorNombre: g.proveedor ?? previo?.proveedorNombre,
    notas: previo?.notas ?? `Importado del gasto contable oficial ${g.id}${g.trabajoId ? ` (trabajo ${g.trabajoId})` : ''}`,
    creadoPor: previo?.creadoPor,
    creadoPorId: previo?.creadoPorId,
    fechaCreacion: previo?.fechaCreacion ?? ahora,
    fechaActualizacion: ahora,
  };
  return { ok: true, errores: [], gasto };
}

export function cambiarEstadoGasto(
  gasto: GastoInmueble,
  nuevo: EstadoGasto,
  liquidacionId?: string,
): GastoInmueble {
  return {
    ...gasto,
    estado: nuevo,
    liquidacionId: nuevo === 'liquidado' ? liquidacionId || gasto.liquidacionId : gasto.liquidacionId,
    fechaActualizacion: new Date().toISOString(),
  };
}
