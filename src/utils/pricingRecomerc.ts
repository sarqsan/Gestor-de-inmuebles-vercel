// ============================================================
// FASE 3.5 — MOTOR DE PRICING DE RECOMERCIALIZACIÓN
// Cálculo determinista y transparente de escenarios de alquiler
// y venta a partir de: renta del contrato anterior, IPC, ajuste
// de mercado, mejoras confirmadas (3.4) y comparables de zona.
// Todas las cifras son ORIENTATIVAS: no hay conexión a portales
// ni índices en tiempo real, así que IPC/ajuste/comparables los
// introduce o valida el propietario.
// ============================================================

import type {
  ComparableMercado,
  DatosCatastrales,
  ExpedienteRecomercializacion,
  MejoraROI,
  PricingRecomercializacion,
} from '../types';

export interface EntradaPricing {
  rentaAnterior?: number;
  ipcAcumuladoPct?: number;
  ajusteMercadoPct?: number;
  mejoras?: MejoraROI[];
  comparables?: ComparableMercado[];
  superficieM2?: number;
  habitaciones?: number;
  banos?: number;
  tipoInmueble?: string;
  catastro?: DatosCatastrales;
  esVenta?: boolean;
  valorVentaReferencia?: number; // valoración manual/histórica si no hay comparables
  precioM2VentaManual?: number;
}

/**
 * FASE 3.5.1 — selecciona los testigos de características homogéneas
 * (m² ±15%, habitaciones/baños parecidos). Los testigos sin datos
 * suficientes para descartarlos se mantienen; si existe al menos uno
 * con superficie válida, el grupo homogéneo pasa a ser la referencia.
 */
export function comparablesHomogeneos(
  comparables: ComparableMercado[],
  activo: { superficieM2?: number; habitaciones?: number; banos?: number }
): { seleccion: ComparableMercado[]; excluidos: ComparableMercado[] } {
  const conMetros = comparables.filter((c) => Number(c.metros) > 0);
  if (Number(activo.superficieM2) <= 0 || conMetros.length === 0) {
    return { seleccion: comparables, excluidos: [] };
  }
  const m2Activo = Number(activo.superficieM2);
  const esHomogeneo = (c: ComparableMercado): boolean => {
    if (Number(c.metros) > 0) {
      const dif = Math.abs((Number(c.metros) - m2Activo) / m2Activo);
      if (dif > 0.15) return false;
    }
    if (c.habitaciones !== undefined && activo.habitaciones !== undefined) {
      if (Math.abs(c.habitaciones - activo.habitaciones) > 1) return false;
    }
    if (c.banos !== undefined && activo.banos !== undefined) {
      if (Math.abs(c.banos - activo.banos) > 1) return false;
    }
    return true;
  };
  const seleccion = conMetros.filter(esHomogeneo);
  if (seleccion.length === 0) {
    // Ningún testigo con superficie encaja: no descartamos a ciegas.
    return { seleccion: comparables, excluidos: [] };
  }
  // Se conservan también los que no tienen superficie (no se pueden descartar).
  const sinMetros = comparables.filter((c) => !(Number(c.metros) > 0));
  const excluidos = comparables.filter(
    (c) => Number(c.metros) > 0 && !seleccion.includes(c)
  );
  return { seleccion: [...seleccion, ...sinMetros], excluidos };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Redondea el alquiler a múltiplos de 5 € (precio de anuncio creíble). */
export function redondearRenta(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n / 5) * 5;
}

/** Redondea importes de venta a centenas (p. ej. 182.400 €). */
export function redondearVenta(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n / 500) * 500;
}

function media(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function mediana(values: number[]): number {
  if (values.length === 0) return 0;
  const orden = [...values].sort((a, b) => a - b);
  const mitad = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2;
}

export function nuevoComparableId(): string {
  return `comp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

/** Suma de la renta extra y plusvalía de las mejoras confirmadas. */
export function resumenMejorasConfirmadas(mejoras: MejoraROI[] = []) {
  const confirmadas = mejoras.filter((m) => m.confirmadaPorPropietario);
  return {
    confirmadas,
    rentaExtraMensual: round2(confirmadas.reduce((a, m) => a + (Number(m.incrementoRentaMensual) || 0), 0)),
    plusvalia: round2(confirmadas.reduce((a, m) => a + (Number(m.incrementoValoracion) || 0), 0)),
  };
}

export interface ResultadoPricing {
  pricing: PricingRecomercializacion;
  metricas: {
    baseActualizadaIPC?: number;
    medianaAlquilerComparables?: number;
    m2AlquilerComparables?: number;
    m2VentaComparables?: number;
    numeroComparablesAlquiler: number;
    numeroComparablesVenta: number;
    numeroComparablesTotal: number;
    numeroExcluidosNoHomogeneos: number;
  };
  notas: string[];
}

export function calcularPricing(input: EntradaPricing): ResultadoPricing {
  const notas: string[] = [];
  const rentaAnterior = Math.max(Number(input.rentaAnterior) || 0, 0);
  const ipcPct = Number(input.ipcAcumuladoPct) || 0;
  const ajustePct = Number(input.ajusteMercadoPct) || 0;
  const catastro = input.catastro;
  const superficieCat = Math.max(Number(catastro?.superficieCatastralConstruida) || 0, 0);
  // La superficie útil/declarada manda (la catastral, construida con comunes,
  // sólo se usa como respaldo si no hay superficie declarada).
  const superficie = Math.max(Number(input.superficieM2) || 0, 0) || superficieCat;
  const comparablesTodos = input.comparables ?? [];
  const { seleccion: comparables, excluidos: excluidosNoHomogeneos } = comparablesHomogeneos(
    comparablesTodos,
    { superficieM2: superficie, habitaciones: input.habitaciones, banos: input.banos }
  );

  const { rentaExtraMensual, plusvalia, confirmadas } = resumenMejorasConfirmadas(input.mejoras);

  // --- Notas de perfil catastral (FASE 3.5.1) ---
  if (catastro?.referenciaCatastral) {
    const partes: string[] = [];
    if (catastro.anioConstruccion && catastro.anioConstruccion > 1800) {
      const edad = new Date().getFullYear() - catastro.anioConstruccion;
      partes.push(`año de construcción ${catastro.anioConstruccion} (≈ ${edad} años)`);
    }
    if (superficieCat > 0) partes.push(`${superficieCat} m² construidos catastrales`);
    if (catastro.valorCatastral) {
      partes.push(`valor catastral ${catastro.valorCatastral.toLocaleString('es-ES')} € (referencia administrativa, no de mercado)`);
    }
    if (partes.length) notas.push(`Catastro (ref. ${catastro.referenciaCatastral}): ${partes.join('; ')}.`);
    const supDeclarada = Math.max(Number(input.superficieM2) || 0, 0);
    if (supDeclarada > 0 && superficieCat > 0) {
      const dif = Math.abs(superficieCat - supDeclarada) / supDeclarada;
      if (dif > 0.1) {
        notas.push(
          `La superficie catastral (${superficieCat} m²) y la declarada (${supDeclarada} m²) difieren más de un 10%; conviene revisar si se comparan m² útiles o construidos antes de publicar.`
        );
      }
    }
  }

  // --- 1) Base actualizada por IPC desde el contrato anterior ---
  const baseActualizadaIPC = rentaAnterior > 0 ? rentaAnterior * (1 + ipcPct / 100) : 0;
  if (rentaAnterior > 0) {
    notas.push(
      `Renta anterior ${rentaAnterior} €/mes actualizada por IPC/acuerdo (${ipcPct.toFixed(1)}%): ${round2(baseActualizadaIPC)} €/mes.`
    );
  }

  // --- 2) Comparables de alquiler por zona/tipología ---
  const alquileres = comparables
    .map((c) => Number(c.precioAlquilerMensual))
    .filter((n): n is number => Number.isFinite(n) && n > 0);
  const m2AlquilerValues = comparables
    .filter((c) => Number(c.precioAlquilerMensual) > 0 && Number(c.metros) > 0)
    .map((c) => (Number(c.precioAlquilerMensual) as number) / (Number(c.metros) as number));
  const medianaAlquiler = mediana(alquileres);
  const m2AlquilerComparables = media(m2AlquilerValues);

  // --- 3) Estimación de mercado del alquiler ---
  let mercadoAlquiler = 0;
  if (alquileres.length > 0) {
    // Hay testigos del mercado: la mediana manda; la renta actualizada solo
    // modera el arranque para no desviarse por una muestra pequeña.
    mercadoAlquiler =
      baseActualizadaIPC > 0
        ? 0.65 * medianaAlquiler + 0.35 * baseActualizadaIPC
        : medianaAlquiler;
    notas.push(
      `Comparables homogéneos de alquiler: ${alquileres.length} testigo(s); mediana ${redondearRenta(medianaAlquiler)} €/mes` +
        (m2AlquilerComparables > 0 ? ` (≈ ${round2(m2AlquilerComparables)} €/m²·mes).` : '.')
    );
    if (excluidosNoHomogeneos.length > 0) {
      const alqEx = excluidosNoHomogeneos.filter((c) => Number(c.precioAlquilerMensual) > 0).length;
      notas.push(
        `${excluidosNoHomogeneos.length} testigo(s) con características distintas (${alqEx} en alquiler) no se usan como referencia directa de precio; conviene buscar anuncios del mismo tipo, m², habitaciones y zona.`
      );
    }
  } else if (baseActualizadaIPC > 0) {
    mercadoAlquiler = baseActualizadaIPC * (1 + ajustePct / 100);
    notas.push(
      `Sin comparables, se aplica un ajuste de mercado/zona del ${ajustePct.toFixed(1)}% sobre la renta actualizada.`
    );
  }
  // Las mejoras confirmadas solo se suman cuando no hay testigos que ya las
  // incluyan; si hay comparables, se asume que el mercado ya las refleja.
  if (alquileres.length === 0 && rentaExtraMensual > 0) {
    mercadoAlquiler += rentaExtraMensual;
    notas.push(`Se incorporan ${rentaExtraMensual} €/mes de las ${confirmadas.length} mejora(s) confirmada(s).`);
  } else if (rentaExtraMensual > 0) {
    notas.push(`Hay mejoras confirmadas por ${rentaExtraMensual} €/mes; con comparables no se suman para no duplicar (el mercado ya las recoge).`);
  }

  const escenarioConservador = mercadoAlquiler > 0 ? redondearRenta(mercadoAlquiler * 0.95) : 0;
  const escenarioRecomendado = mercadoAlquiler > 0 ? redondearRenta(mercadoAlquiler) : 0;
  const escenarioMaximo = mercadoAlquiler > 0 ? redondearRenta(mercadoAlquiler * 1.06) : 0;
  const precioM2Alquiler =
    escenarioRecomendado > 0 && superficie > 0 ? round2(escenarioRecomendado / superficie) : undefined;

  // --- 4) Valoración de venta ---
  const ratiosVentaM2 = comparables
    .filter((c) => Number(c.precioVenta) > 0 && Number(c.metros) > 0)
    .map((c) => (Number(c.precioVenta) as number) / (Number(c.metros) as number));
  const m2VentaComparables = media(ratiosVentaM2);
  const preciosVenta = comparables
    .map((c) => Number(c.precioVenta))
    .filter((n): n is number => Number.isFinite(n) && n > 0);

  const precioM2VentaManual = Math.max(Number(input.precioM2VentaManual) || 0, 0);
  const precioM2Venta = m2VentaComparables > 0 ? round2(m2VentaComparables) : precioM2VentaManual || undefined;

  let valorVentaEstimado = 0;
  if (precioM2Venta && superficie > 0) {
    valorVentaEstimado = precioM2Venta * superficie;
    notas.push(
      `Valor de venta por comparación: ${precioM2Venta.toLocaleString('es-ES')} €/m² × ${superficie} m².`
    );
  } else if (preciosVenta.length > 0) {
    valorVentaEstimado = mediana(preciosVenta);
    notas.push(`Valor de venta a partir de la mediana de ${preciosVenta.length} comparable(s) sin superficie.`);
  } else {
    const referencia = Math.max(Number(input.valorVentaReferencia) || 0, 0);
    valorVentaEstimado = referencia + plusvalia;
    if (referencia > 0) {
      notas.push(
        `Sin comparables de venta, se parte de la valoración de referencia ${referencia.toLocaleString('es-ES')} €` +
          (plusvalia > 0 ? ` más la plusvalía estimada de las mejoras (${plusvalia.toLocaleString('es-ES')} €).` : '.')
      );
    }
  }

  const valorVenta = redondearVenta(valorVentaEstimado);
  const horquillaVentaMin = valorVenta ? redondearVenta(valorVenta * 0.94) : 0;
  const horquillaVentaMax = valorVenta ? redondearVenta(valorVenta * 1.06) : 0;
  // Precio de salida ligeramente alto para dejar margen de negociación.
  const precioSalidaRecomendado = valorVenta ? redondearVenta(valorVenta * 1.03) : 0;
  const plazoMedioComercializacionDias = input.esVenta ? 180 : 90;

  notas.push(
    'Estimación orientativa, no una tasación oficial ni una garantía de precio o plazo. Contrasta los testigos con portales y un profesional antes de publicar.'
  );

  const ahora = new Date().toISOString();
  const pricing: PricingRecomercializacion = {
    rentaAnterior: rentaAnterior || undefined,
    ipcAcumuladoPct: ipcPct,
    ajusteMercadoPct: ajustePct,
    mejoraRentaConfirmada: rentaExtraMensual || undefined,
    escenarioConservador: escenarioConservador || undefined,
    escenarioRecomendado: escenarioRecomendado || undefined,
    escenarioMaximo: escenarioMaximo || undefined,
    precioM2Alquiler,
    valoracionVentaEstimada: valorVenta || undefined,
    horquillaVentaMin: horquillaVentaMin || undefined,
    horquillaVentaMax: horquillaVentaMax || undefined,
    precioSalidaRecomendado: precioSalidaRecomendado || undefined,
    precioM2Venta: precioM2Venta,
    plazoMedioComercializacionDias,
    comparables,
    notasCalculo: notas.join('\n'),
    fechaCalculo: ahora,
    motor: 'calculadora',
  };

  return {
    pricing,
    metricas: {
      baseActualizadaIPC: baseActualizadaIPC || undefined,
      medianaAlquilerComparables: medianaAlquiler || undefined,
      m2AlquilerComparables: m2AlquilerComparables || undefined,
      m2VentaComparables: m2VentaComparables || undefined,
      numeroComparablesAlquiler: alquileres.length,
      numeroComparablesVenta: Math.max(ratiosVentaM2.length, preciosVenta.length),
      numeroComparablesTotal: comparablesTodos.length,
      numeroExcluidosNoHomogeneos: excluidosNoHomogeneos.length,
    },
    notas,
  };
}

/** Arma las entradas del cálculo a partir del expediente y el inmueble. */
export function entradasDesdeExpediente(
  expediente: ExpedienteRecomercializacion,
  args: {
    rentaAnterior?: number;
    superficieM2?: number;
    valorVentaReferencia?: number;
    esVenta?: boolean;
  }
): EntradaPricing {
  const previo: PricingRecomercializacion | undefined = expediente.pricing;
  return {
    rentaAnterior: previo?.rentaAnterior ?? args.rentaAnterior,
    ipcAcumuladoPct: previo?.ipcAcumuladoPct ?? 0,
    ajusteMercadoPct: previo?.ajusteMercadoPct ?? 0,
    mejoras: expediente.mejorasPropuestas ?? [],
    comparables: previo?.comparables ?? [],
    superficieM2: args.superficieM2,
    esVenta: args.esVenta ?? expediente.destinoPrevisto === 'VENTA',
    valorVentaReferencia: args.valorVentaReferencia,
    precioM2VentaManual: previo?.precioM2Venta,
  };
}
