// ============================================================
// FASE 2.1 — Cuadre de rentabilidad
// Cruza los INGRESOS por alquiler (cobros) con los GASTOS
// (explotación y financiación) por inmueble y período.
//
// Esquema contable que se aplica:
//   Resultado operativo (NOI) = ingresos cobrados - gastos de explotación
//   Cash-flow tras hipoteca   = resultado operativo - cuota hipotecaria íntegra
//   Base fiscal (orientativa) = gastos de explotación deducibles + intereses
// La cuota de capital NO es un gasto: reduce la deuda y aparece sólo a
// efectos informativos junto al cash-flow.
// ============================================================

import type { CobroPeriodo, Gasto, Inmueble } from '../types';

export type FiltroAnio = number | 'TODOS';

export interface CuadreInmueble {
  inmuebleId: string;
  direccion: string;
  ciudad: string;
  estado: Inmueble['estado'];
  alquilado: boolean;

  // --- Ingresos por alquiler ---
  ingresosPrevisto: number; // Devengado según contrato en el período
  ingresosCobrado: number; // Realmente ingresado (importeRecibido)
  cobrosPendientes: number; // Previsto no cobrado (estimación)
  numCobros: number;

  // --- Explotación (a cargo del arrendador) ---
  gastosExplotacion: number; // Pagados en el período
  gastosDeducibles: number; // Subconjunto marcado como deducible
  numGastosExplotacion: number;

  // --- Financiación ---
  cuotaHipotecaria: number; // Cuotas íntegras pagadas (capital + intereses)
  interesesHipotecarios: number; // Parte de intereses (gasto financiero)
  capitalAmortizado: number; // Parte de capital (no es gasto)

  // --- Resultados ---
  resultadoOperativo: number; // Ingresos cobrados - explotación
  margenOperativoPct: number | null; // % sobre ingresos cobrados
  cashFlowNeto: number; // Resultado operativo - cuota hipotecaria íntegra
  baseFiscalDeducible: number; // Explotación deducible + intereses

  // --- Rentabilidad patrimonial (sólo con valor de adquisición y año concreto) ---
  rentabilidadNetaPct: number | null; // Resultado operativo / valor adquisición
  valorAdquisicion?: number;
}

export interface CuadreGlobal {
  ingresosPrevisto: number;
  ingresosCobrado: number;
  cobrosPendientes: number;
  gastosExplotacion: number;
  gastosDeducibles: number;
  cuotaHipotecaria: number;
  interesesHipotecarios: number;
  capitalAmortizado: number;
  resultadoOperativo: number;
  margenOperativoPct: number | null;
  cashFlowNeto: number;
  baseFiscalDeducible: number;
  numInmueblesConMovimiento: number;
}

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const round2 = (v: number): number => Math.round(v * 100) / 100;
const pct = (parte: number, total: number): number | null =>
  total > 0 ? round2((parte / total) * 100) : null;

function gastoEnAnio(g: Gasto, anio: FiltroAnio): boolean {
  if (anio === 'TODOS') return true;
  const ref = g.periodoMesAnio || (g.fechaDevengo ? g.fechaDevengo.slice(0, 7) : undefined);
  if (ref) return ref.startsWith(`${anio}-`);
  return false;
}

function cobroEnAnio(c: CobroPeriodo, anio: FiltroAnio): boolean {
  if (anio === 'TODOS') return true;
  return c.anio === anio;
}

function cuadreVacio(inm: Inmueble): CuadreInmueble {
  return {
    inmuebleId: inm.id,
    direccion: inm.direccion,
    ciudad: inm.ciudad || '',
    estado: inm.estado,
    alquilado: inm.estado === 'alquilado',
    ingresosPrevisto: 0,
    ingresosCobrado: 0,
    cobrosPendientes: 0,
    numCobros: 0,
    gastosExplotacion: 0,
    gastosDeducibles: 0,
    numGastosExplotacion: 0,
    cuotaHipotecaria: 0,
    interesesHipotecarios: 0,
    capitalAmortizado: 0,
    resultadoOperativo: 0,
    margenOperativoPct: null,
    cashFlowNeto: 0,
    baseFiscalDeducible: 0,
    rentabilidadNetaPct: null,
    valorAdquisicion: inm.valorAdquisicion,
  };
}

export function cuadreRentabilidad(
  args: {
    cobros: CobroPeriodo[];
    gastos: Gasto[];
    inmuebles: Inmueble[];
  },
  anio: FiltroAnio = new Date().getFullYear()
): CuadreInmueble[] {
  const { cobros, gastos, inmuebles } = args;
  const mapa = new Map<string, CuadreInmueble>();

  // Una fila por inmueble visible, aunque no tenga movimiento en el período.
  inmuebles.forEach((inm) => mapa.set(inm.id, cuadreVacio(inm)));

  const asegurar = (inmuebleId: string): CuadreInmueble => {
    let c = mapa.get(inmuebleId);
    if (!c) {
      // Inmueble no presente en el catálogo actual (histórico): fila virtual.
      c = cuadreVacio({
        id: inmuebleId,
        direccion: 'Inmueble sin catálogo',
        ciudad: '',
        precio: 0,
        estado: 'disponible',
        habitaciones: 0,
        banos: 0,
        superficie: 0,
        candidatosCount: 0,
        fianzaMeses: 0,
      } as Inmueble);
      mapa.set(inmuebleId, c);
    }
    return c;
  };

  // 1) Ingresos por alquiler (cobros).
  cobros.forEach((cobro) => {
    if (!cobroEnAnio(cobro, anio)) return;
    const fila = asegurar(cobro.inmuebleId);
    const previsto = num(cobro.importePrevisto);
    const cobrado = num(cobro.importeRecibido);
    fila.ingresosPrevisto += previsto;
    fila.ingresosCobrado += cobrado;
    fila.numCobros += 1;
    if (previsto - cobrado > 0) fila.cobrosPendientes += previsto - cobrado;
  });

  // 2) Gastos (solo PAGADOS; los ANULADOS no computan; los PENDIENTES se
  //    muestran aparte en la UI, no en el cuadre de caja).
  gastos.forEach((g) => {
    if (g.estado !== 'PAGADO' || !gastoEnAnio(g, anio)) return;
    const fila = asegurar(g.inmuebleId);
    const importe = num(g.importe);

    if (g.tipo === 'FINANCIACION') {
      fila.cuotaHipotecaria += importe;
      const intereses = num(g.intereses);
      fila.interesesHipotecarios += intereses;
      fila.capitalAmortizado +=
        typeof g.capitalAmortizado === 'number'
          ? num(g.capitalAmortizado)
          : Math.max(importe - intereses, 0);
      // Los intereses financieros son deducibles/fiscalmente relevantes.
      fila.baseFiscalDeducible += intereses;
    } else if (g.aCargoDe === 'arrendador') {
      fila.gastosExplotacion += importe;
      fila.numGastosExplotacion += 1;
      if (g.deducible !== false) fila.gastosDeducibles += importe;
      fila.baseFiscalDeducible += g.deducible !== false ? importe : 0;
    }
  });

  // 3) Cálculos derivados.
  const filas = Array.from(mapa.values()).map((f) => {
    f.ingresosPrevisto = round2(f.ingresosPrevisto);
    f.ingresosCobrado = round2(f.ingresosCobrado);
    f.cobrosPendientes = round2(f.cobrosPendientes);
    f.gastosExplotacion = round2(f.gastosExplotacion);
    f.gastosDeducibles = round2(f.gastosDeducibles);
    f.cuotaHipotecaria = round2(f.cuotaHipotecaria);
    f.interesesHipotecarios = round2(f.interesesHipotecarios);
    f.capitalAmortizado = round2(f.capitalAmortizado);
    f.baseFiscalDeducible = round2(f.baseFiscalDeducible);
    f.resultadoOperativo = round2(f.ingresosCobrado - f.gastosExplotacion);
    f.margenOperativoPct = pct(f.resultadoOperativo, f.ingresosCobrado);
    f.cashFlowNeto = round2(f.resultadoOperativo - f.cuotaHipotecaria);
    if (anio !== 'TODOS' && f.valorAdquisicion && f.valorAdquisicion > 0) {
      f.rentabilidadNetaPct = pct(f.resultadoOperativo, f.valorAdquisicion);
    }
    return f;
  });

  // Orden: con movimiento primero, por ingresos desc; luego el resto por dirección.
  return filas.sort((a, b) => {
    const movA = a.numCobros + a.numGastosExplotacion > 0 || a.cuotaHipotecaria > 0 ? 1 : 0;
    const movB = b.numCobros + b.numGastosExplotacion > 0 || b.cuotaHipotecaria > 0 ? 1 : 0;
    if (movA !== movB) return movB - movA;
    if (b.ingresosCobrado !== a.ingresosCobrado) return b.ingresosCobrado - a.ingresosCobrado;
    return a.direccion.localeCompare(b.direccion);
  });
}

export function resumenGlobal(filas: CuadreInmueble[]): CuadreGlobal {
  const suma =
    (sel: (f: CuadreInmueble) => number) =>
    filas.reduce((acc, f) => acc + sel(f), 0);

  const ingresosCobrado = round2(suma((f) => f.ingresosCobrado));
  const gastosExplotacion = round2(suma((f) => f.gastosExplotacion));
  const cuotaHipotecaria = round2(suma((f) => f.cuotaHipotecaria));
  const resultadoOperativo = round2(ingresosCobrado - gastosExplotacion);

  return {
    ingresosPrevisto: round2(suma((f) => f.ingresosPrevisto)),
    ingresosCobrado,
    cobrosPendientes: round2(suma((f) => f.cobrosPendientes)),
    gastosExplotacion,
    gastosDeducibles: round2(suma((f) => f.gastosDeducibles)),
    cuotaHipotecaria,
    interesesHipotecarios: round2(suma((f) => f.interesesHipotecarios)),
    capitalAmortizado: round2(suma((f) => f.capitalAmortizado)),
    resultadoOperativo,
    margenOperativoPct: pct(resultadoOperativo, ingresosCobrado),
    cashFlowNeto: round2(resultadoOperativo - cuotaHipotecaria),
    baseFiscalDeducible: round2(suma((f) => f.baseFiscalDeducible)),
    numInmueblesConMovimiento: filas.filter(
      (f) => f.numCobros > 0 || f.gastosExplotacion > 0 || f.cuotaHipotecaria > 0
    ).length,
  };
}

/**
 * Años con datos (cobros o gastos) para alimentar el selector, incluido el
 * año en curso. Orden descendente.
 */
export function aniosConDatos(
  cobros: CobroPeriodo[],
  gastos: Gasto[]
): number[] {
  const setAnos = new Set<number>([new Date().getFullYear()]);
  cobros.forEach((c) => {
    if (typeof c.anio === 'number') setAnos.add(c.anio);
  });
  gastos.forEach((g) => {
    const ref = g.periodoMesAnio || g.fechaDevengo?.slice(0, 7);
    const anio = ref ? parseInt(ref.slice(0, 4), 10) : NaN;
    if (!isNaN(anio)) setAnos.add(anio);
  });
  return Array.from(setAnos).sort((a, b) => b - a);
}
