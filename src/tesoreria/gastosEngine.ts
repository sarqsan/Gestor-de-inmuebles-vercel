/**
 * BLOQUE B — Gastos del inmueble: importador desde trabajos finalizados + alta manual.
 * Todo gasto guarda su origen trazable (trabajoId/presupuestoId o 'manual').
 */
import type { TrabajoProfesional } from '../types';
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
    facturaNumero: trabajo.facturaNumero,
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
