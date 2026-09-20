/**
 * BLOQUE B — Adaptador de conciliación/tesorería sobre el modelo existente.
 *
 * IMPORTANTE: en este repositorio NO existe motor de conciliación bancaria (GAP6).
 * Este adaptador NO escribe en estructuras internas ajenas: solo LEE CobroPeriodo
 * (anidado en contratos) y LiquidacionPropietario/OrdenPago/GastoInmueble para:
 *  - listar cobros liquidables (cobrados reales);
 *  - proyectar movimientos de tesorería (vista de lectura para futura camt.05x);
 *  - marcar cobros como liquidados (retorna contratos actualizados con historial,
 *    reutilizando el patrón de trazabilidad de cobrosEngine sin modificarlo).
 */
import type { CobroPeriodo, ContratoFormalizacion } from '../types';
import { esCobroLiquidable } from './liquidacionEngine';
import type { GastoInmueble, LiquidacionPropietario, MovimientoTesoreria, OrdenPago } from './tipos';

export interface ResumenConciliacion {
  totalCobrado: number;
  numCobrados: number;
  totalPendiente: number;
  numPendientes: number;
  /** Cobros usados ya en alguna liquidación (por id). */
  cobroIdsLiquidados: string[];
}

/** Lista cobros de un propietario+periodo clasificados. */
export function clasificarCobrosPeriodo(
  contratos: ContratoFormalizacion[],
  propietarioId: string,
  periodo: string,
): { liquidables: CobroPeriodo[]; pendientes: CobroPeriodo[] } {
  const liquidables: CobroPeriodo[] = [];
  const pendientes: CobroPeriodo[] = [];
  for (const contrato of contratos) {
    for (const c of contrato.registroCobros || []) {
      const prop = c.propietarioId || contrato.propietarioId || '';
      if (prop && prop !== propietarioId) continue;
      if (c.periodoMesAnio !== periodo) continue;
      if (esCobroLiquidable(c)) liquidables.push(c);
      else pendientes.push(c);
    }
  }
  return { liquidables, pendientes };
}

/** Resumen de cobros liquidados referenciados por liquidaciones vigentes. */
export function resumenCobrosLiquidados(liquidaciones: LiquidacionPropietario[]): Set<string> {
  const ids = new Set<string>();
  for (const l of liquidaciones) {
    if (l.estado === 'ANULADA' || l.estado === 'REVERSADA') continue;
    for (const id of l.cobroIds || []) ids.add(id);
  }
  return ids;
}

/** Resumen de gastos liquidados referenciados por liquidaciones vigentes. */
export function resumenGastosLiquidados(liquidaciones: LiquidacionPropietario[]): Set<string> {
  const ids = new Set<string>();
  for (const l of liquidaciones) {
    if (l.estado === 'ANULADA' || l.estado === 'REVERSADA') continue;
    for (const id of l.gastoIds || []) ids.add(id);
  }
  return ids;
}

/**
 * Marca cobros como liquidados añadiendo una entrada de historial (no altera importes
 * ni estados: la liquidación referencia, no muta, el cobro). Retorna contratos nuevos.
 * Sirve como "conciliación posterior" cobro→liquidación.
 */
export function marcarCobrosLiquidados(
  contratos: ContratoFormalizacion[],
  cobroIds: string[],
  liquidacionId: string,
  actorNombre?: string,
): ContratoFormalizacion[] {
  const set = new Set(cobroIds);
  if (set.size === 0) return contratos;
  return contratos.map((contrato) => {
    if (!contrato.registroCobros?.some((c) => set.has(c.id))) return contrato;
    return {
      ...contrato,
      registroCobros: (contrato.registroCobros || []).map((c) => {
        if (!set.has(c.id)) return c;
        // Evitar duplicar la marca si ya existe (idempotencia)
        const ya = (c.historialCambios || []).some(
          (h) => h.accion === 'Incluido en liquidación' && h.detalles?.includes(liquidacionId),
        );
        if (ya) return c;
        return {
          ...c,
          historialCambios: [
            {
              id: `hist_liq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
              fecha: new Date().toISOString(),
              usuarioNombre: actorNombre || 'Tesorería',
              accion: 'Incluido en liquidación',
              detalles: `Cobro incluido en liquidación ${liquidacionId}`,
              estadoAnterior: c.estado,
              estadoNuevo: c.estado,
            },
            ...(c.historialCambios || []),
          ],
        };
      }),
    };
  });
}

/**
 * Proyecta movimientos de tesorería (lectura) desde cobros + liquidaciones + órdenes + gastos.
 * Base para la futura conciliación bancaria (camt.052/053/054): cada movimiento lleva
 * referencias cruzadas y puede enlazarse con un apunte bancario por importe+fecha+referencia.
 */
export function proyectarMovimientos(
  contratos: ContratoFormalizacion[],
  liquidaciones: LiquidacionPropietario[],
  ordenes: OrdenPago[],
  gastos: GastoInmueble[],
  filtro?: { propietarioId?: string; desde?: string; hasta?: string },
): MovimientoTesoreria[] {
  const movs: MovimientoTesoreria[] = [];
  const enRango = (fecha?: string) => {
    if (!fecha) return true;
    const f = fecha.slice(0, 10);
    if (filtro?.desde && f < filtro.desde) return false;
    if (filtro?.hasta && f > filtro.hasta) return false;
    return true;
  };
  const propOk = (pid?: string) => !filtro?.propietarioId || !pid || pid === filtro.propietarioId;

  for (const contrato of contratos) {
    for (const c of contrato.registroCobros || []) {
      const pid = c.propietarioId || contrato.propietarioId || '';
      if (!propOk(pid)) continue;
      if (c.importeRecibido > 0 && (c.estado === 'RECIBIDO' || c.estado === 'VERIFICADO')) {
        if (!enRango(c.fechaPago)) continue;
        movs.push({
          id: `mov_cobro_${c.id}`,
          fecha: (c.fechaPago || c.fechaVencimiento || '').slice(0, 10),
          tipo: 'cobro',
          descripcion: `Cobro alquiler ${c.nombreMes || c.periodoMesAnio} — ${c.inquilinoNombre || ''} (${c.inmuebleDireccion || ''})`,
          importe: Number(c.importeRecibido) || 0,
          estado: c.estado === 'VERIFICADO' ? 'conciliado' : 'cobrado',
          cobroId: c.id,
          referenciaBancaria: c.referenciaBancaria,
          inmuebleId: c.inmuebleId,
          propietarioId: pid,
        });
      }
    }
  }

  for (const l of liquidaciones) {
    if (l.estado === 'ANULADA' || l.estado === 'REVERSADA') continue;
    if (!propOk(l.propietarioId)) continue;
    if (l.estado === 'PAGADA' && l.fechaPago && enRango(l.fechaPago)) {
      movs.push({
        id: `mov_liq_${l.id}`,
        fecha: l.fechaPago.slice(0, 10),
        tipo: 'pago_propietario',
        descripcion: `Liquidación ${l.periodo} pagada a ${l.propietarioNombre}`,
        importe: -(Number(l.netoPropietario) || 0),
        estado: 'pagado',
        liquidacionId: l.id,
        ordenPagoId: l.ordenPagoId,
        referenciaBancaria: l.referenciaBancariaPago,
        propietarioId: l.propietarioId,
      });
    }
  }

  for (const o of ordenes) {
    if (o.estado === 'CANCELADA' || o.estado === 'BORRADOR') continue;
    if (o.fechaPago && enRango(o.fechaPago)) {
      movs.push({
        id: `mov_op_${o.id}`,
        fecha: o.fechaPago.slice(0, 10),
        tipo: o.tipo === 'liquidacion_propietario' ? 'pago_propietario' : 'pago_proveedor',
        descripcion: `Orden ${o.tipo} — ${o.beneficiarioNombre}: ${o.concepto}`,
        importe: -(Number(o.importe) || 0),
        estado: o.estado === 'PAGADA' ? 'pagado' : 'pendiente',
        ordenPagoId: o.id,
        referenciaBancaria: o.referenciaBancaria,
      });
    }
  }

  for (const g of gastos) {
    if (g.estado === 'anulado') continue;
    if (!propOk(g.propietarioId)) continue;
    if (!enRango(g.fechaGasto)) continue;
    movs.push({
      id: `mov_gasto_${g.id}`,
      fecha: g.fechaGasto.slice(0, 10),
      tipo: 'gasto',
      descripcion: `Gasto ${g.categoria} — ${g.concepto} (${g.inmuebleDireccion || g.inmuebleId})`,
      importe: -(Number(g.total) || 0),
      estado: g.estado === 'liquidado' ? 'conciliado' : g.estado === 'pagado' ? 'pagado' : 'pendiente',
      gastoId: g.id,
      inmuebleId: g.inmuebleId,
      propietarioId: g.propietarioId,
    });
  }

  return movs.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}

/**
 * Interfaz documentada para futura integración bancaria (camt.053 / extractos).
 * `apunteBancario` es el apunte normalizado del banco; retorna coincidencias
 * candidatas por importe+fecha(±3 días)+referencia. No escribe nada.
 */
export interface ApunteBancarioNormalizado {
  id: string;
  fecha: string; // YYYY-MM-DD
  importe: number; // signo
  concepto: string;
  referencia?: string;
}

export interface CoincidenciaConciliacion {
  apunteId: string;
  movimientoId: string;
  score: number; // 0-100
  motivo: string;
}

export function sugerirConciliacion(
  apuntes: ApunteBancarioNormalizado[],
  movimientos: MovimientoTesoreria[],
): CoincidenciaConciliacion[] {
  const out: CoincidenciaConciliacion[] = [];
  for (const a of apuntes) {
    const fa = new Date(`${a.fecha}T00:00:00Z`).getTime();
    for (const m of movimientos) {
      if (Math.abs(a.importe - m.importe) > 0.005) continue;
      const fm = new Date(`${m.fecha}T00:00:00Z`).getTime();
      if (isNaN(fa) || isNaN(fm)) continue;
      const dias = Math.abs(fa - fm) / 86400000;
      if (dias > 3) continue;
      let score = 70;
      let motivo = `Importe exacto (${a.importe} €) y fecha ±${Math.round(dias)} días`;
      const ref = (a.referencia || '').toLowerCase();
      const movRef = (m.referenciaBancaria || '').toLowerCase();
      if (ref && movRef && (ref.includes(movRef) || movRef.includes(ref))) {
        score = 95;
        motivo += ' + referencia coincidente';
      } else if (ref && m.descripcion.toLowerCase().includes(ref.slice(0, 8))) {
        score = 85;
        motivo += ' + concepto relacionado';
      }
      out.push({ apunteId: a.id, movimientoId: m.id, score, motivo });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}
