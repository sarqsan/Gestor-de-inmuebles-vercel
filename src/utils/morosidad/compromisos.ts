/**
 * BLOQUE C — Compromisos de pago (acuerdos de calendario) e incumplimientos.
 * Motor PURO y determinista.
 *
 * REGLA DURA (FASE 7): el registro de un compromiso NUNCA modifica un
 * `CobroPeriodo`. Las cuotas solo se dan por «cubiertas» cuando referencian
 * importes YA cobrados en la fuente económica oficial (`cobrosEngine.
 * registrarPagoPeriodo`, alimentada a su vez por GAP6). Por tanto el compromiso
 * es una capa de SEGUIMIENTO, no un segundo libro de cobros.
 */

import type { CompromisoPago, CuotaCompromiso, EstadoCompromiso, EstadoCuotaCompromiso, PiezaDeuda } from '../../types/morosidad';
import { TOLERANCIA_CENTIMOS } from './morosidadEngine';
import { redondear2, simpleHash } from './morosidadEstados';

export interface EntradaCompromiso {
  expedienteId: string;
  contratoId: string;
  inmuebleId: string;
  propietarioId: string;
  fechaPropuesta: string; // YYYY-MM-DD
  importeTotal: number;
  numPagos: number;
  periodicidadDias?: number; // 30 por defecto
  primeraCuotaFecha?: string; // YYYY-MM-DD (por defecto: fechaPropuesta + periodicidad)
  origenRegistro: CompromisoPago['origenRegistro'];
  evidenciaId?: string;
  observaciones?: string;
  actor?: { id?: string; nombre?: string; email?: string } | null;
  fechaRegistro?: string; // ISO
}

export function idCompromiso(expedienteId: string, fechaPropuesta: string): string {
  return `cmp_${normalizar(expedienteId)}_${fechaPropuesta.replace(/-/g, '')}`;
}

function normalizar(t: string): string {
  return (t || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/_+/g, '_');
}

/** Valora si un plan de cuotas es coherente (sin inventar reglas de derecho). */
export function validarPlanCuotas(importeTotal: number, numPagos: number, periodicidadDias: number): string[] {
  const errores: string[] = [];
  if (!(importeTotal > 0)) errores.push('importe_total_debe_ser_positivo');
  if (!Number.isInteger(numPagos) || numPagos < 1) errores.push('num_pagos_invalido');
  if (numPagos > 120) errores.push('num_pagos_excesivo');
  if (!Number.isInteger(periodicidadDias) || periodicidadDias < 1) errores.push('periodicidad_invalida');
  if (numPagos > 1 && Math.abs(cuotaPlana(importeTotal, numPagos) * numPagos - importeTotal) > 0.01) {
    errores.push('cuadre_de_cuotas_descuadrado');
  }
  return errores;
}

/** Última cuota absorbe el redondeo ⇒ la suma de cuotas == importeTotal (céntimo exacto). */
export function cuotaPlana(importeTotal: number, numPagos: number): number {
  return Math.floor((Number(importeTotal) / Math.max(1, numPagos)) * 100) / 100;
}

export function construirCuotas(
  compromisoId: string,
  importeTotal: number,
  numPagos: number,
  primeraFecha: string,
  periodicidadDias: number,
): CuotaCompromiso[] {
  const plana = cuotaPlana(importeTotal, numPagos);
  const cuotas: CuotaCompromiso[] = [];
  let acumulado = 0;
  for (let i = 0; i < numPagos; i++) {
    const esUltima = i === numPagos - 1;
    const importe = esUltima ? redondear2(importeTotal - acumulado) : plana;
    acumulado = redondear2(acumulado + importe);
    cuotas.push({
      id: `cuota_${compromisoId}_${i + 1}`,
      numero: i + 1,
      importePrevisto: importe,
      importeCubierto: 0,
      fechaPrevista: sumarDiasFecha(primeraFecha, i * periodicidadDias),
      estado: 'PENDIENTE',
      cobroIds: [],
    });
  }
  return cuotas;
}

export function sumarDiasFecha(fecha: string, dias: number): string {
  const base = Date.parse(`${fecha}T00:00:00Z`);
  if (Number.isNaN(base)) return fecha;
  return new Date(base + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Crea el compromiso (idempotente: misma fecha de propuesta sobre el mismo expediente ⇒ mismo id). */
export function crearCompromiso(entrada: EntradaCompromiso): {
  ok: boolean;
  errores: string[];
  compromiso?: CompromisoPago;
} {
  const errores: string[] = [];
  if (!entrada.expedienteId) errores.push('expediente_requerido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.fechaPropuesta || '')) errores.push('fecha_propuesta_invalida');
  const periodicidad = Number(entrada.periodicidadDias || 30);
  errores.push(...validarPlanCuotas(entrada.importeTotal, entrada.numPagos, periodicidad));
  if (errores.length > 0) return { ok: false, errores };

  const id = idCompromiso(entrada.expedienteId, entrada.fechaPropuesta);
  const primeraFecha = entrada.primeraCuotaFecha || sumarDiasFecha(entrada.fechaPropuesta, periodicidad);
  const hoy = entrada.fechaRegistro || new Date().toISOString();
  const compromiso: CompromisoPago = {
    id,
    expedienteId: entrada.expedienteId,
    contratoId: entrada.contratoId,
    inmuebleId: entrada.inmuebleId,
    propietarioId: entrada.propietarioId,
    estado: 'VIGENTE',
    fechaPropuesta: entrada.fechaPropuesta,
    importeTotal: redondear2(entrada.importeTotal),
    importeCubierto: 0,
    numPagos: entrada.numPagos,
    periodicidadDias: periodicidad,
    cuotas: construirCuotas(id, redondear2(entrada.importeTotal), entrada.numPagos, primeraFecha, periodicidad),
    origenRegistro: entrada.origenRegistro,
    evidenciaId: entrada.evidenciaId,
    observaciones: entrada.observaciones,
    actorId: entrada.actor?.id,
    actorNombre: entrada.actor?.nombre || entrada.actor?.email,
    creadoEn: hoy,
    actualizadoEn: hoy,
    historial: [
      {
        id: `hist_${simpleHash(`${id}|creado`).toString(16).padStart(8, '0')}`,
        fecha: hoy,
        accion: 'COMPROMISO_CREADO',
        detalle: `Calendario de ${entrada.numPagos} cuota(s) por ${redondear2(entrada.importeTotal)} € (primera el ${primeraFecha}). Origen: ${entrada.origenRegistro}.`,
        actorNombre: entrada.actor?.nombre || entrada.actor?.email,
      },
    ],
  };
  return { ok: true, errores: [], compromiso };
}

export interface CobroFuente {
  id: string;
  importeRecibido: number;
  importePrevisto: number;
  estado: string;
  fechaPago?: string;
}

export function esCobroAprovechable(cobro: CobroFuente): boolean {
  // Coincide con la noción de "cobrado real" de BLOQUE B (RECIBIDO/VERIFICADO).
  return (cobro.estado === 'RECIBIDO' || cobro.estado === 'VERIFICADO') && Number(cobro.importeRecibido) > 0;
}

/**
 * Reparte los cobros reales ya existentes sobre las cuotas vencidas/pendientes.
 * Determinista: orden de cuota, luego orden de cobro. NO inventa importes: solo
 * asigna lo efectivamente cobrado en la fuente canónica.
 */
export function aplicarCobrosAlCompromiso(
  compromiso: CompromisoPago,
  cobros: CobroFuente[],
  opts: { fechaReferencia: string; actor?: { id?: string; nombre?: string; email?: string } | null; fechaRegistro?: string },
): { compromiso: CompromisoPago; aplicado: number; errores: string[]; transicionSugerida?: 'CUMPLIDO' | 'INCUMPLIDO' } {
  const errores: string[] = [];
  const aprovechables = (cobros || []).filter(esCobroAprovechable);
  if (aprovechables.length === 0 && compromiso.cuotas.every((c) => c.importeCubierto >= c.importePrevisto - TOLERANCIA_CENTIMOS)) {
    return { compromiso, aplicado: 0, errores, transicionSugerida: 'CUMPLIDO' };
  }
  // El total cobrado en la fuente para ESTOS cobros es el techo de lo asignable.
  // Se computa el restante POR COBRO (cobrado real − lo ya referenciado en cuotas),
  // de forma que un cobro que crece (p. ej. un segundo ingreso parcial sobre el mismo
  // periodo) siga asignándose, y nunca se asigne más de lo cobrado.
  const yaPorCobro = new Map<string, number>();
  for (const c of compromiso.cuotas) {
    for (const idCobro of c.cobroIds || []) {
      yaPorCobro.set(idCobro, redondear2(Number(yaPorCobro.get(idCobro) || 0) + 0));
    }
  }
  // Importe ya asignado a cada cobro: se reparte el importeCubierto de la cuota de
  // forma determinista sobre sus cobros (orden de cobroIds) porque la cuota no
  // guarda el desglose por cobro.
  for (const c of compromiso.cuotas) {
    const ids = (c.cobroIds || []).filter(Boolean);
    if (ids.length === 0) continue;
    let restanteCuota = redondear2(Number(c.importeCubierto || 0));
    for (const idCobro of ids) {
      const asignadoAnterior = Number(yaPorCobro.get(idCobro) || 0);
      const topar = redondear2(Math.min(restanteCuota, Math.max(0, Number(aprovechables.find((a) => a.id === idCobro)?.importeRecibido || 0) - asignadoAnterior)));
      yaPorCobro.set(idCobro, redondear2(asignadoAnterior + topar));
      restanteCuota = redondear2(restanteCuota - topar);
      if (restanteCuota <= TOLERANCIA_CENTIMOS) break;
    }
  }
  const disponibleTotal = redondear2(
    aprovechables.reduce((sum, c) => sum + Math.max(0, redondear2(Number(c.importeRecibido || 0) - Number(yaPorCobro.get(c.id) || 0))), 0),
  );
  const nuevoDisponible = redondear2(Math.max(0, disponibleTotal));
  if (nuevoDisponible <= TOLERANCIA_CENTIMOS) {
    // Nada nuevo en la fuente ⇒ solo se comprueba vencimiento.
    const revisado = revisarVencimientos(compromiso, opts.fechaReferencia, opts.fechaRegistro);
    return {
      compromiso: revisado,
      aplicado: 0,
      errores,
      transicionSugerida: revisado.estado === 'INCUMPLIDO' ? 'INCUMPLIDO' : undefined,
    };
  }

  let restante = nuevoDisponible;
  // Cola de cobros reales pendientes de asignar (importe a disposición por cobro).
  const colaCobros = aprovechables
    .map((c) => ({ id: c.id, disponible: redondear2(Math.max(0, Number(c.importeRecibido || 0) - Number(yaPorCobro.get(c.id) || 0))) }))
    .filter((c) => c.disponible > TOLERANCIA_CENTIMOS)
    .slice()
    .sort((a, b) => ((a.id) < (b.id) ? -1 : (a.id) > (b.id) ? 1 : 0));

  const cuotas = compromiso.cuotas.slice().sort((a, b) => (a.numero - b.numero));
  const hoy = opts.fechaRegistro || new Date().toISOString();
  let aplicado = 0;
  const historialLocal: CompromisoPago['historial'] = [];

  for (const cuotaBase of cuotas) {
    const cuota = { ...cuotaBase, cobroIds: [...(cuotaBase.cobroIds || [])] };
    const pendienteCuota = redondear2(Math.max(0, Number(cuota.importePrevisto) - Number(cuota.importeCubierto)));
    if (pendienteCuota <= TOLERANCIA_CENTIMOS) continue;
    if (restante <= TOLERANCIA_CENTIMOS) break;
    let asignadoCuota = 0;
    while (asignadoCuota < pendienteCuota - TOLERANCIA_CENTIMOS) {
      const cobro = colaCobros.find((c) => c.disponible > TOLERANCIA_CENTIMOS);
      if (!cobro) break;
      const tomar = redondear2(Math.min(cobro.disponible, pendienteCuota - asignadoCuota));
      cobro.disponible = redondear2(cobro.disponible - tomar);
      asignadoCuota = redondear2(asignadoCuota + tomar);
      if (!cuota.cobroIds.includes(cobro.id)) cuota.cobroIds.push(cobro.id);
    }
    if (asignadoCuota <= TOLERANCIA_CENTIMOS) continue;
    cuota.importeCubierto = redondear2(Number(cuota.importeCubierto) + asignadoCuota);
    cuota.estado = cuota.importeCubierto >= Number(cuota.importePrevisto) - TOLERANCIA_CENTIMOS ? 'CUBIERTA' : 'PARCIAL';
    if (cuota.estado === 'CUBIERTA') cuota.fechaCubierta = opts.fechaReferencia;
    restante = redondear2(restante - asignadoCuota);
    aplicado = redondear2(aplicado + asignadoCuota);
    historialLocal.push({
      id: `hist_${simpleHash(`${cuota.id}|aplicado|${hoy}`).toString(16).padStart(8, '0')}`,
      fecha: hoy,
      accion: 'CUOTA_CUBIERTA_DESDE_COBRO',
      detalle: `Cuota ${cuota.numero}: ${asignadoCuota.toFixed(2)} € asignados desde cobros canónicos [${cuota.cobroIds.join(', ')}] (${cuota.estado}). No se ha modificado ningún cobro.`,
      actorNombre: opts.actor?.nombre || opts.actor?.email || 'Sistema',
    });
    Object.assign(cuotaBase, cuota);
  }

  const importeCubierto = redondear2(cuotas.reduce((s, c) => s + Number(c.importeCubierto || 0), 0));
  const cubierto = importeCubierto >= Number(compromiso.importeTotal) - TOLERANCIA_CENTIMOS;
  const estado: EstadoCompromiso = cubierto ? 'CUMPLIDO' : compromiso.estado;
  const transicionSugerida: 'CUMPLIDO' | undefined = cubierto && compromiso.estado !== 'CUMPLIDO' ? 'CUMPLIDO' : undefined;

  const resultado: CompromisoPago = {
    ...compromiso,
    cuotas,
    importeCubierto,
    estado,
    fechaCierre: cubierto ? hoy : compromiso.fechaCierre,
    actualizadoEn: hoy,
    historial: [...historialLocal.reverse(), ...(compromiso.historial || [])],
  };
  return {
    compromiso: revisarVencimientos(resultado, opts.fechaReferencia, opts.fechaRegistro),
    aplicado,
    errores,
    transicionSugerida: transicionSugerida || (resultado.estado === 'INCUMPLIDO' ? 'INCUMPLIDO' : undefined),
  };
}

/** Marca como vencidas las cuotas no cubiertas en fecha (solo si sigue VIGENTE). */
export function revisarVencimientos(
  compromiso: CompromisoPago,
  fechaReferencia: string,
  fechaRegistro?: string,
): CompromisoPago {
  if (compromiso.estado !== 'VIGENTE') return compromiso;
  const hoy = fechaRegistro || new Date().toISOString();
  let vencioAlguna = false;
  const cuotas = compromiso.cuotas.map((c) => {
    if (c.estado === 'PENDIENTE' && c.fechaPrevista < fechaReferencia && Number(c.importeCubierto) < Number(c.importePrevisto) - TOLERANCIA_CENTIMOS) {
      vencioAlguna = true;
      return { ...c, estado: 'VENCIDA_SIN_PAGO' as EstadoCuotaCompromiso };
    }
    return c;
  });
  if (!vencioAlguna) return compromiso;
  return {
    ...compromiso,
    cuotas,
    estado: 'INCUMPLIDO',
    fechaIncumplimiento: hoy,
    motivoIncumplimiento: 'Cuota vencida sin cobertura en la fuente de cobros canónica.',
    actualizadoEn: hoy,
    historial: [
      {
        id: `hist_${simpleHash(`${compromiso.id}|incumplido|${fechaReferencia}`).toString(16).padStart(8, '0')}`,
        fecha: hoy,
        accion: 'COMPROMISO_INCUMPLIDO',
        detalle: `Se detectó al menos una cuota vencida sin pago a fecha ${fechaReferencia}.`,
        actorNombre: 'Sistema',
      },
      ...(compromiso.historial || []),
    ],
  };
}

export function cancelarCompromiso(
  compromiso: CompromisoPago,
  motivo: string,
  actor?: { id?: string; nombre?: string; email?: string } | null,
): CompromisoPago {
  const hoy = new Date().toISOString();
  return {
    ...compromiso,
    estado: 'CANCELADO',
    fechaCierre: hoy,
    actualizadoEn: hoy,
    historial: [
      {
        id: `hist_${simpleHash(`${compromiso.id}|cancelado|${hoy}`).toString(16).padStart(8, '0')}`,
        fecha: hoy,
        accion: 'COMPROMISO_CANCELADO',
        detalle: motivo || 'Cancelado manualmente.',
        actorNombre: actor?.nombre || actor?.email,
      },
      ...(compromiso.historial || []),
    ],
  };
}

export function progresoCompromiso(compromiso: CompromisoPago): {
  pct: number;
  cuotasCubiertas: number;
  cuotasVencidas: number;
  proximaFecha?: string;
  diasParaProxima: number;
} {
  const cubiertas = compromiso.cuotas.filter((c) => c.estado === 'CUBIERTA').length;
  const vencidas = compromiso.cuotas.filter((c) => c.estado === 'VENCIDA_SIN_PAGO').length;
  const proxima = compromiso.cuotas
    .filter((c) => c.estado === 'PENDIENTE' || c.estado === 'PARCIAL')
    .sort((a, b) => (a.fechaPrevista < b.fechaPrevista ? -1 : 1))[0];
  const pct =
    Number(compromiso.importeTotal) > 0
      ? Math.min(100, Math.round((Number(compromiso.importeCubierto) / Number(compromiso.importeTotal)) * 100))
      : 0;
  return {
    pct,
    cuotasCubiertas: cubiertas,
    cuotasVencidas: vencidas,
    proximaFecha: proxima?.fechaPrevista,
    diasParaProxima: proxima ? diasHasta(proxima.fechaPrevista) : 0,
  };
}

function diasHasta(fecha: string): number {
  const base = Date.parse(`${fecha}T00:00:00Z`);
  if (Number.isNaN(base)) return 0;
  const hoy = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  return Math.round((base - hoy) / 86_400_000);
}

/**
 * Un compromiso solo puede cerrar un expediente si el saldo real en la fuente
 * canónica es cero: NUNCA se «cierra por compromiso» sin cobro efectivo.
 */
export function compromisoAutorizaCierre(
  compromiso: CompromisoPago,
  saldoPendienteFuente: number,
): { permite: boolean; motivo: string } {
  if (Number(saldoPendienteFuente) > TOLERANCIA_CENTIMOS) {
    return { permite: false, motivo: `saldo_pendiente_en_fuente:${saldoPendienteFuente}` };
  }
  if (compromiso.estado !== 'CUMPLIDO' && compromiso.estado !== 'CANCELADO') {
    return { permite: false, motivo: `compromiso_no_cerrado:${compromiso.estado}` };
  }
  return { permite: true, motivo: 'deuda_saldada_en_fuente' };
}

/** Piezas abiertas a fecha (para el plan y el resumen de recobro). */
export function piezasAbiertas(piezas: PiezaDeuda[]): PiezaDeuda[] {
  return (piezas || []).filter((p) => p.estado !== 'PAGADA' && p.estado !== 'ANULADA' && p.estado !== 'CORREGIDA');
}
