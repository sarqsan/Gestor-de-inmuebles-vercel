/**
 * Motor determinista de Analizador de Inversión y Valoración.
 * Sin I/O, sin datos ficticios, transparente: null = insuficiente, mensaje explicativo.
 */

import type {
  AlquilerEstimado,
  ComparableInversion,
  CosteCompraAnalisis,
  DatosInmuebleAnalisis,
  EscenarioInversionDetalle,
  FinanciacionAnalisis,
  IndicadoresClave,
  ReformaAnalisis,
  ResumenOperacion,
  ValoracionAnalisis,
  ValorDespuesReforma,
  EscenariosComparables,
} from '../types/inversion';

export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const MENSAJE_INSUFICIENTE_VALORACION =
  'No hay datos suficientes para calcular la valoración. Introduce al menos precio solicitado o valor estimado de mercado y superficie si deseas €/m².';
export const MENSAJE_INSUFICIENTE_COSTE =
  'No hay datos suficientes para calcular el coste total de adquisición. Introduce al menos el precio de compra.';
export const MENSAJE_INSUFICIENTE_ALQUILER =
  'No hay datos suficientes para calcular ingresos por alquiler. Introduce alquiler mensual.';
export const MENSAJE_INSUFICIENTE_REFORMA =
  'No hay datos suficientes para calcular la reforma. Añade al menos una partida con coste.';
export const MENSAJE_INSUFICIENTE_FINANCIACION =
  'No hay datos suficientes para calcular financiación. Introduce importe, tipo de interés y plazo.';

// ---------------------------------------------------------------------------
// €/m2 y valoración
// ---------------------------------------------------------------------------

export function calcularPrecioM2(precio: number | undefined, superficie: number | undefined): number | null {
  if (precio == null || superficie == null) return null;
  if (!Number.isFinite(precio) || !Number.isFinite(superficie)) return null;
  if (precio <= 0 || superficie <= 0) return null;
  return redondear2(precio / superficie);
}

export function calcularDiferenciaPrecioValor(precioSolicitado: number | undefined, valorEstimado: number | undefined): {
  diferencia: number | null;
  pct: number | null;
} {
  if (precioSolicitado == null || valorEstimado == null) return { diferencia: null, pct: null };
  if (!Number.isFinite(precioSolicitado) || !Number.isFinite(valorEstimado)) return { diferencia: null, pct: null };
  if (valorEstimado === 0) return { diferencia: null, pct: null };
  const diff = redondear2(precioSolicitado - valorEstimado);
  const pct = redondear2((diff / valorEstimado) * 100);
  return { diferencia: diff, pct };
}

export function evaluarValoracion(datos: DatosInmuebleAnalisis, v: ValoracionAnalisis): ValoracionAnalisis {
  const superficie = datos.superficie ?? v.superficie;
  const precioSolicitado = datos.precioAnunciado ?? v.precioSolicitado ?? datos.precioPrevistoCompra;
  const valorEstimado = v.valorEstimadoMercado ?? precioSolicitado;

  const precioM2 = calcularPrecioM2(precioSolicitado, superficie);
  const valorM2 = calcularPrecioM2(valorEstimado, superficie);

  const diff = calcularDiferenciaPrecioValor(precioSolicitado, valorEstimado);

  const datosSuficientes = precioSolicitado != null || valorEstimado != null;

  const escenarios =
    v.escenarioConservador != null || v.escenarioCentral != null || v.escenarioFavorable != null
      ? {
          conservadora: v.escenarioConservador,
          central: v.escenarioCentral ?? valorEstimado,
          favorable: v.escenarioFavorable,
        }
      : undefined;

  return {
    superficie,
    precioSolicitado: precioSolicitado ?? undefined,
    valorEstimadoMercado: valorEstimado ?? undefined,
    precioM2: precioM2 ?? valorM2 ?? null,
    diferenciaPrecioValor: diff.diferencia,
    diferenciaPct: diff.pct,
    escenarioConservador: v.escenarioConservador,
    escenarioCentral: v.escenarioCentral ?? valorEstimado,
    escenarioFavorable: v.escenarioFavorable,
    datosSuficientes,
    mensajeInsuficiencia: datosSuficientes ? undefined : MENSAJE_INSUFICIENTE_VALORACION,
    notas: v.notas,
    fuente: v.fuente ?? (datosSuficientes ? 'manual' : undefined),
  };
}

// ---------------------------------------------------------------------------
// Comparables
// ---------------------------------------------------------------------------

export function calcularPrecioM2Comparable(c: ComparableInversion): number | null {
  return calcularPrecioM2(c.precio, c.superficie);
}

export function compararConAnalizado(
  analizado: { precioM2: number | null; superficie?: number; precio?: number },
  comparable: ComparableInversion
): { diffM2: number | null; diffM2Pct: number | null; diffPrecio: number | null } {
  const m2Comp = calcularPrecioM2Comparable(comparable);
  const m2Ana = analizado.precioM2;
  let diffM2: number | null = null;
  let diffM2Pct: number | null = null;
  let diffPrecio: number | null = null;

  if (m2Comp != null && m2Ana != null && m2Ana !== 0) {
    diffM2 = redondear2(m2Comp - m2Ana);
    diffM2Pct = redondear2((diffM2 / m2Ana) * 100);
  }
  if (comparable.precio != null && analizado.precio != null) {
    diffPrecio = redondear2(comparable.precio - analizado.precio);
  }
  return { diffM2, diffM2Pct, diffPrecio };
}

// ---------------------------------------------------------------------------
// Coste compra
// ---------------------------------------------------------------------------

export function calcularCosteCompra(c: CosteCompraAnalisis): CosteCompraAnalisis {
  if (c.precioCompra == null || !Number.isFinite(c.precioCompra) || c.precioCompra <= 0) {
    return {
      ...c,
      gastosAdquisicion: null as unknown as number,
      costeTotalAdquisicion: null,
      inversionInicialSinFinanciacion: null,
    };
  }
  const impuestos = c.impuestos ?? 0;
  const notaria = c.notaria ?? 0;
  const registro = c.registro ?? 0;
  const gestoria = c.gestoria ?? 0;
  const otrosGastos = c.otrosGastos ?? 0;
  const reformaInicial = c.reformaInicial ?? 0;
  const otrosCostes = c.otrosCostes ?? 0;

  const gastosAdquisicion = redondear2(impuestos + notaria + registro + gestoria + otrosGastos);
  const costeTotal = redondear2(c.precioCompra + gastosAdquisicion + reformaInicial + otrosCostes);

  return {
    ...c,
    gastosAdquisicion,
    costeTotalAdquisicion: costeTotal,
    inversionInicialSinFinanciacion: costeTotal,
  };
}

// ---------------------------------------------------------------------------
// Financiación (reutiliza fórmula francesa, no duplicar motor completo)
// ---------------------------------------------------------------------------

export function cuotaFrancesaDeterminista(principal: number, tipoAnual: number, plazoMeses: number): number | null {
  if (principal == null || tipoAnual == null || plazoMeses == null) return null;
  if (!Number.isFinite(principal) || !Number.isFinite(tipoAnual) || !Number.isFinite(plazoMeses)) return null;
  if (principal <= 0 || plazoMeses <= 0) return null;
  const r = tipoAnual / 100 / 12;
  if (r === 0) return redondear2(principal / plazoMeses);
  const denom = 1 - Math.pow(1 + r, -plazoMeses);
  if (denom === 0) return redondear2(principal);
  return redondear2((principal * r) / denom);
}

export function calcularFinanciacion(
  f: FinanciacionAnalisis | undefined,
  costeTotal: number | null
): FinanciacionAnalisis | undefined {
  if (!f || !f.usarFinanciacion) {
    return f ? { ...f, cuotaEstimada: null, capitalAportado: costeTotal, costeFinancieroTotal: null } : undefined;
  }
  const importe = f.importeFinanciado;
  const tipo = f.tipoInteresAnual;
  const plazo = f.plazoMeses;
  if (importe == null || tipo == null || plazo == null) {
    return {
      ...f,
      cuotaEstimada: null,
      capitalAportado: costeTotal != null && importe != null ? redondear2(costeTotal - importe) : null,
      costeFinancieroTotal: null,
    };
  }
  const cuota = cuotaFrancesaDeterminista(importe, tipo, plazo);
  let costeFinanciero: number | null = null;
  if (cuota != null) {
    const totalPagado = redondear2(cuota * plazo);
    costeFinanciero = redondear2(totalPagado - importe);
  }
  const capitalAportado = costeTotal != null ? redondear2(costeTotal - importe) : null;
  const entradaCalc = capitalAportado;

  return {
    ...f,
    cuotaEstimada: cuota,
    costeFinancieroTotal: costeFinanciero,
    capitalAportado,
    entrada: f.entrada ?? entradaCalc ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Alquiler
// ---------------------------------------------------------------------------

export function calcularAlquiler(a: AlquilerEstimado): AlquilerEstimado {
  if (a.alquilerMensual == null || !Number.isFinite(a.alquilerMensual) || a.alquilerMensual <= 0) {
    return {
      ...a,
      alquilerAnualBruto: null,
      ingresosBrutosAnuales: null,
      gastosAnualesTotales: null,
      ingresosNetosAnuales: null,
      rentabilidadBruta: null,
      rentabilidadNeta: null,
      flujoCajaAnual: null,
      flujoCajaMensual: null,
    };
  }
  const mensual = a.alquilerMensual;
  const anualBruto = redondear2(mensual * 12);
  const ocupPct = a.ocupacionPrevistaPct ?? 100;
  const vacancia = a.mesesVacancia ?? 0;

  // Ingresos brutos ajustados por ocupación y vacancia
  let ingresosBrutos: number;
  if (a.ocupacionPrevistaPct != null) {
    ingresosBrutos = redondear2(anualBruto * (ocupPct / 100));
  } else if (vacancia > 0) {
    const mesesOcup = Math.max(0, 12 - vacancia);
    ingresosBrutos = redondear2(mensual * mesesOcup);
  } else {
    ingresosBrutos = anualBruto;
  }

  const gastosAnuales =
    (a.gastosComunidad ?? 0) + (a.ibi ?? 0) + (a.seguro ?? 0) + (a.mantenimiento ?? 0) + (a.otrosGastosAnuales ?? 0);

  const ingresosNetos = redondear2(ingresosBrutos - gastosAnuales);

  return {
    ...a,
    alquilerAnualBruto: anualBruto,
    ingresosBrutosAnuales: ingresosBrutos,
    gastosAnualesTotales: redondear2(gastosAnuales),
    ingresosNetosAnuales: ingresosNetos,
    // rentabilidad requiere inversión total, se calcula fuera
    flujoCajaAnual: ingresosNetos,
    flujoCajaMensual: redondear2(ingresosNetos / 12),
  };
}

export function calcularRentabilidades(
  alquiler: AlquilerEstimado,
  inversionTotal: number | null
): { bruta: number | null; neta: number | null } {
  if (inversionTotal == null || inversionTotal <= 0) return { bruta: null, neta: null };
  const bruta =
    alquiler.ingresosBrutosAnuales != null
      ? redondear2((alquiler.ingresosBrutosAnuales / inversionTotal) * 100)
      : null;
  const neta =
    alquiler.ingresosNetosAnuales != null
      ? redondear2((alquiler.ingresosNetosAnuales / inversionTotal) * 100)
      : null;
  return { bruta, neta };
}

// ---------------------------------------------------------------------------
// Reforma
// ---------------------------------------------------------------------------

export function calcularReforma(r: ReformaAnalisis): ReformaAnalisis {
  if (!r.partidas || r.partidas.length === 0) {
    return {
      ...r,
      costeTotalReforma: null,
      costeConContingencia: null,
    };
  }
  const total = redondear2(r.partidas.reduce((acc, p) => acc + (p.costeEstimado ?? 0), 0));
  const contingencia = r.contingenciaPct ?? 0;
  const conCont = contingencia > 0 ? redondear2(total * (1 + contingencia / 100)) : total;
  return {
    ...r,
    costeTotalReforma: total,
    costeConContingencia: conCont,
  };
}

// ---------------------------------------------------------------------------
// Valor después reforma
// ---------------------------------------------------------------------------

export function calcularValorDespuesReforma(v: ValorDespuesReforma, costeReforma: number | null): ValorDespuesReforma {
  const valorAntes = v.valorAntes;
  const valorDespues = v.valorDespues;
  const alquilerAntes = v.alquilerAntes;
  const alquilerDespues = v.alquilerDespues;

  let incrementoValor: number | null = null;
  let incrementoValorPct: number | null = null;
  let incrementoAlquiler: number | null = null;
  let incrementoAlquilerPct: number | null = null;
  let rentabilidadReforma: number | null = null;
  let recuperacionMeses: number | null = null;
  let recuperacionAnios: number | null = null;

  if (valorAntes != null && valorDespues != null) {
    incrementoValor = redondear2(valorDespues - valorAntes);
    if (valorAntes !== 0) incrementoValorPct = redondear2((incrementoValor / valorAntes) * 100);
  }
  if (alquilerAntes != null && alquilerDespues != null) {
    incrementoAlquiler = redondear2(alquilerDespues - alquilerAntes);
    if (alquilerAntes !== 0) incrementoAlquilerPct = redondear2((incrementoAlquiler / alquilerAntes) * 100);
  }
  if (incrementoValor != null && costeReforma != null && costeReforma > 0) {
    rentabilidadReforma = redondear2((incrementoValor / costeReforma) * 100);
  }
  if (incrementoAlquiler != null && incrementoAlquiler > 0 && costeReforma != null && costeReforma > 0) {
    recuperacionMeses = Math.ceil(costeReforma / incrementoAlquiler);
    recuperacionAnios = redondear2(recuperacionMeses / 12);
  }

  return {
    ...v,
    incrementoValor,
    incrementoValorPct,
    incrementoAlquiler,
    incrementoAlquilerPct,
    inversionAdicional: costeReforma,
    rentabilidadReforma,
    recuperacionMeses,
    recuperacionAnios,
  };
}

// ---------------------------------------------------------------------------
// Resumen e indicadores
// ---------------------------------------------------------------------------

export function calcularResumen(
  costeCompra: CosteCompraAnalisis,
  reforma: ReformaAnalisis,
  alquiler: AlquilerEstimado,
  valoracion: ValoracionAnalisis,
  valorDespues?: ValorDespuesReforma
): ResumenOperacion {
  const compraPrecio = costeCompra.precioCompra ?? null;
  const gastosAdquisicion = costeCompra.gastosAdquisicion ?? null;
  const reformaCoste = reforma.costeConContingencia ?? reforma.costeTotalReforma ?? null;
  const inversionTotal = costeCompra.costeTotalAdquisicion ?? null;
  const inversionConReforma =
    inversionTotal != null && reformaCoste != null ? redondear2(inversionTotal + reformaCoste) : inversionTotal;

  const valorFinal = valorDespues?.valorDespues ?? valoracion.valorEstimadoMercado ?? null;

  const alquilerMensual = alquiler.alquilerMensual ?? null;
  const alquilerAnual = alquiler.ingresosBrutosAnuales ?? alquiler.alquilerAnualBruto ?? null;

  const rentabilidadBruta =
    alquilerAnual != null && inversionConReforma != null && inversionConReforma > 0
      ? redondear2((alquilerAnual / inversionConReforma) * 100)
      : null;
  const rentabilidadNeta =
    alquiler.ingresosNetosAnuales != null && inversionConReforma != null && inversionConReforma > 0
      ? redondear2((alquiler.ingresosNetosAnuales / inversionConReforma) * 100)
      : null;

  return {
    compraPrecio,
    gastosAdquisicion,
    reformaCoste,
    inversionTotal: inversionConReforma,
    valorFinalEstimado: valorFinal,
    alquilerMensual,
    alquilerAnual,
    rentabilidadBruta,
    rentabilidadNeta,
    flujoCajaAnual: alquiler.ingresosNetosAnuales ?? null,
    incrementoValor: valorDespues?.incrementoValor ?? null,
    recuperacionMeses: valorDespues?.recuperacionMeses ?? null,
  };
}

export function calcularIndicadores(
  costeCompra: CosteCompraAnalisis,
  valoracion: ValoracionAnalisis,
  alquiler: AlquilerEstimado,
  reforma: ReformaAnalisis,
  valorDespues?: ValorDespuesReforma,
  financiacion?: FinanciacionAnalisis
): IndicadoresClave {
  const inversionTotal = costeCompra.costeTotalAdquisicion ?? null;
  const reformaCoste = reforma.costeConContingencia ?? reforma.costeTotalReforma ?? 0;
  const inversionConReforma =
    inversionTotal != null ? redondear2(inversionTotal + reformaCoste) : null;

  const diff = calcularDiferenciaPrecioValor(
    costeCompra.precioCompra ?? valoracion.precioSolicitado,
    valoracion.valorEstimadoMercado
  );

  const rentabilidades = calcularRentabilidades(alquiler, inversionConReforma);

  const capitalPropio = financiacion?.capitalAportado ?? inversionConReforma;

  return {
    rentabilidadBruta: rentabilidades.bruta,
    rentabilidadNeta: rentabilidades.neta,
    cashFlowAnual: alquiler.ingresosNetosAnuales ?? null,
    cashFlowMensual: alquiler.flujoCajaMensual ?? null,
    inversionTotal: inversionConReforma,
    diferenciaCompraValoracion: diff.diferencia,
    diferenciaCompraValoracionPct: diff.pct,
    incrementoValorReforma: valorDespues?.incrementoValor ?? null,
    incrementoAlquilerReforma: valorDespues?.incrementoAlquiler ?? null,
    retornoReformaPct: valorDespues?.rentabilidadReforma ?? null,
    plazoRecuperacionMeses: valorDespues?.recuperacionMeses ?? null,
    plazoRecuperacionAnios: valorDespues?.recuperacionAnios ?? null,
    capitalPropioNecesario: capitalPropio,
  };
}

// ---------------------------------------------------------------------------
// Escenarios
// ---------------------------------------------------------------------------

export function generarEscenarios(
  costeCompra: CosteCompraAnalisis,
  reforma: ReformaAnalisis,
  alquiler: AlquilerEstimado,
  valoracion: ValoracionAnalisis,
  valorDespues?: ValorDespuesReforma
): EscenarioInversionDetalle[] {
  const basePrecio = costeCompra.precioCompra ?? 0;
  const baseGastos = costeCompra.gastosAdquisicion ?? 0;
  const reformaCoste = reforma.costeConContingencia ?? reforma.costeTotalReforma ?? 0;
  const alquilerMensual = alquiler.alquilerMensual ?? 0;
  const gastosAnuales = alquiler.gastosAnualesTotales ?? 0;
  const valorEstimado = valoracion.valorEstimadoMercado ?? basePrecio;

  const alquilerAnual = alquiler.ingresosBrutosAnuales ?? (alquilerMensual * 12 || null);
  const ingresosNetos = alquiler.ingresosNetosAnuales ?? null;

  const calcRent = (ing: number | null, inv: number | null) => {
    if (ing == null || inv == null || inv <= 0) return null;
    return redondear2((ing / inv) * 100);
  };

  const invSinReforma = costeCompra.costeTotalAdquisicion ?? null;
  const invConReforma =
    invSinReforma != null ? redondear2(invSinReforma + reformaCoste) : null;

  const sinReforma: EscenarioInversionDetalle = {
    id: 'sin_reforma',
    tipo: 'SIN_REFORMA',
    nombre: 'Comprar + Alquilar (sin reformar)',
    precioCompra: basePrecio,
    gastosAdquisicion: baseGastos,
    costeReforma: 0,
    inversionTotal: invSinReforma,
    alquilerMensual,
    alquilerAnual,
    gastosAnuales,
    ingresosNetos,
    rentabilidadBruta: calcRent(alquilerAnual, invSinReforma),
    rentabilidadNeta: calcRent(ingresosNetos, invSinReforma),
    flujoCajaAnual: ingresosNetos,
    valorEstimado,
    esEstimacion: true,
    notas: 'Escenario sin reforma, estimación',
  };

  const alquilerDespues = valorDespues?.alquilerDespues ?? alquilerMensual;
  const valorDespuesEstimado = valorDespues?.valorDespues ?? valorEstimado;
  const ingresosDespues =
    alquilerDespues != null
      ? redondear2(alquilerDespues * 12 * ((alquiler.ocupacionPrevistaPct ?? 100) / 100) - gastosAnuales)
      : ingresosNetos;
  const brutoDespues = alquilerDespues != null ? redondear2(alquilerDespues * 12) : alquilerAnual;

  const conReforma: EscenarioInversionDetalle = {
    id: 'con_reforma',
    tipo: 'CON_REFORMA',
    nombre: 'Comprar + Reformar + Alquilar',
    precioCompra: basePrecio,
    gastosAdquisicion: baseGastos,
    costeReforma: reformaCoste,
    inversionTotal: invConReforma,
    alquilerMensual: alquilerDespues,
    alquilerAnual: brutoDespues,
    gastosAnuales,
    ingresosNetos: ingresosDespues,
    rentabilidadBruta: calcRent(brutoDespues, invConReforma),
    rentabilidadNeta: calcRent(ingresosDespues, invConReforma),
    flujoCajaAnual: ingresosDespues,
    valorEstimado: valorDespuesEstimado,
    incrementoValor: valorDespues?.incrementoValor ?? null,
    recuperacionMeses: valorDespues?.recuperacionMeses ?? null,
    esEstimacion: true,
    notas: 'Estimación post-reforma',
  };

  const personalizado: EscenarioInversionDetalle = {
    id: 'personalizado',
    tipo: 'PERSONALIZADO',
    nombre: 'Personalizado',
    precioCompra: basePrecio,
    gastosAdquisicion: baseGastos,
    costeReforma: reformaCoste / 2, // ejemplo variable, usuario podrá editar en UI
    inversionTotal: invSinReforma != null ? redondear2(invSinReforma + reformaCoste / 2) : null,
    alquilerMensual: alquilerMensual,
    alquilerAnual,
    gastosAnuales,
    ingresosNetos,
    rentabilidadBruta: calcRent(alquilerAnual, invSinReforma != null ? redondear2(invSinReforma + reformaCoste / 2) : null),
    rentabilidadNeta: calcRent(ingresosNetos, invSinReforma != null ? redondear2(invSinReforma + reformaCoste / 2) : null),
    flujoCajaAnual: ingresosNetos,
    valorEstimado,
    esEstimacion: true,
    notas: 'Escenario personalizable',
  };

  return [sinReforma, conReforma, personalizado];
}

export function generarEscenariosNiveles(
  valoracion: ValoracionAnalisis,
  alquiler: AlquilerEstimado,
  reforma: ReformaAnalisis
): EscenariosComparables {
  const baseValor = valoracion.valorEstimadoMercado;
  const baseAlquiler = alquiler.alquilerMensual;
  const baseReforma = reforma.costeConContingencia ?? reforma.costeTotalReforma;

  const valorConservadora = valoracion.escenarioConservador ?? (baseValor != null ? redondear2(baseValor * 0.9) : undefined);
  const valorFavorable = valoracion.escenarioFavorable ?? (baseValor != null ? redondear2(baseValor * 1.1) : undefined);

  const alquilerConservador = baseAlquiler != null ? redondear2(baseAlquiler * 0.9) : undefined;
  const alquilerFavorable = baseAlquiler != null ? redondear2(baseAlquiler * 1.1) : undefined;

  const reformaSuperior = baseReforma != null ? redondear2(baseReforma * 1.15) : undefined;
  const reformaMaximo = baseReforma != null ? redondear2(baseReforma * 1.3) : undefined;

  return {
    valoracion: {
      conservadora: valorConservadora,
      central: baseValor ?? valoracion.escenarioCentral,
      favorable: valorFavorable,
    },
    alquiler: {
      conservador: alquilerConservador,
      central: baseAlquiler,
      favorable: alquilerFavorable,
    },
    reforma: {
      previsto: baseReforma ?? undefined,
      superior: reformaSuperior,
      maximo: reformaMaximo,
    },
  };
}
